-- Payments attach to the sale (group) only, not to individual sale items.
-- All items of a sale are already linked to it via sales.sale_group_id.
-- Allow sale_id to be NULL so a payment can reference only the sale group.
ALTER TABLE sale_payments ALTER COLUMN sale_id DROP NOT NULL;

-- Index for group-level payment lookups and joins
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_group_id ON sale_payments(sale_group_id);

-- Re-assert the payment trigger WITH customer current_balance sync.
-- (Guard: if migration 033 was already applied with the group distribution but
--  without the balance sync, this restores the sync that migration 027 had.)
CREATE OR REPLACE FUNCTION update_sale_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_sale_id uuid;
  v_group_id uuid;
  v_paid numeric;
  v_orig_total numeric;
  v_margin_val numeric;
  v_discount numeric;
  v_customer_id uuid;
  item RECORD;
  group_total numeric;
  item_proportion numeric;
  item_paid numeric;
BEGIN
  v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);
  v_group_id := COALESCE(NEW.sale_group_id, OLD.sale_group_id);

  IF v_group_id IS NOT NULL THEN
    -- Distribute group payment proportionally across all items in the group
    SELECT COALESCE(SUM(meters * price_per_meter), 0)
    INTO group_total
    FROM sales WHERE sale_group_id = v_group_id OR id = v_group_id;

    FOR item IN
      SELECT * FROM sales WHERE sale_group_id = v_group_id OR id = v_group_id
    LOOP
      item_proportion := CASE WHEN group_total > 0
        THEN (item.meters * item.price_per_meter) / group_total
        ELSE 1.0 / (SELECT COUNT(*) FROM sales WHERE sale_group_id = v_group_id OR id = v_group_id)
      END;

      -- Sum all group payments proportionally for this item
      SELECT COALESCE(SUM(amount) * item_proportion, 0)
      INTO item_paid
      FROM sale_payments WHERE sale_group_id = v_group_id;

      -- Also add any direct sale_id payments for this item
      SELECT item_paid + COALESCE(SUM(amount), 0)
      INTO item_paid
      FROM sale_payments WHERE sale_id = item.id AND sale_group_id IS NULL;

      UPDATE sales SET
        paid_amount = item_paid,
        remaining_amount = GREATEST(item.total_amount - COALESCE(item.discount_amount, 0) - item_paid, 0),
        status = CASE
          WHEN item_paid <= 0 THEN 'pending'
          WHEN item_paid >= GREATEST(item.total_amount - COALESCE(item.discount_amount, 0), 0) THEN 'completed'
          ELSE 'partial'
        END,
        updated_at = now()
      WHERE id = item.id;
    END LOOP;

    -- Sync customer current_balance for all customers in the group
    FOR v_customer_id IN
      SELECT DISTINCT customer_id FROM sales
      WHERE (sale_group_id = v_group_id OR id = v_group_id)
        AND customer_id IS NOT NULL
    LOOP
      UPDATE customers
      SET current_balance = (
        SELECT COALESCE(SUM(remaining_amount), 0)
        FROM sales
        WHERE customer_id = v_customer_id
      ),
      updated_at = now()
      WHERE id = v_customer_id;
    END LOOP;
  ELSE
    -- Original per-item logic
    SELECT
      COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = v_sale_id AND sale_group_id IS NULL), 0),
      s.meters * s.price_per_meter,
      GREATEST(s.meters * (s.price_per_meter - s.cost_price_per_meter) - COALESCE(s.discount_amount, 0), 0),
      s.customer_id,
      COALESCE(s.discount_amount, 0)
    INTO v_paid, v_orig_total, v_margin_val, v_customer_id, v_discount
    FROM sales s WHERE id = v_sale_id;

    UPDATE sales SET
      paid_amount = v_paid,
      total_amount = v_orig_total,
      margin = v_margin_val,
      remaining_amount = GREATEST(v_orig_total - v_discount - v_paid, 0),
      status = CASE
        WHEN v_paid <= 0 THEN 'pending'
        WHEN v_paid >= GREATEST(v_orig_total - v_discount, 0) THEN 'completed'
        ELSE 'partial'
      END,
      updated_at = now()
    WHERE id = v_sale_id;

    -- Sync customer current_balance
    IF v_customer_id IS NOT NULL THEN
      UPDATE customers
      SET current_balance = (
        SELECT COALESCE(SUM(remaining_amount), 0)
        FROM sales
        WHERE customer_id = v_customer_id
      ),
      updated_at = now()
      WHERE id = v_customer_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;