/*
  040 — Discounted sales: fix per-item remaining/status distribution.

  Problem (multi-item sale with a discount stored on the first item):
    The payment trigger distributed payments by GROSS share but computed each
    item's remaining against the FULL discount sitting on item 0:
      · item 0 clamped to 0 while OTHER items kept stranded remaining
      · customer.current_balance (Σ item remaining) was inflated
      · users were nudged to collect more than the net amount → the sales
        listing then showed "+extra" instead of the "-discount"

  Fix:
    · Spread the GROUP discount proportionally by value when computing
      remaining/status (share = gross share), so Σ remaining always equals
      group net − group paid and no item strands value.
    · Recompute margin per row as gross margin − that row's discount
      (the rule from migration 027) so edits cannot lose the discount.
    · One-time repair of all existing sales rows + customers balances.
*/

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
  group_discount numeric;
  item_net numeric;
  item_proportion numeric;
  item_paid numeric;
BEGIN
  v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);
  v_group_id := COALESCE(NEW.sale_group_id, OLD.sale_group_id);

  IF v_group_id IS NOT NULL THEN
    -- Group totals (total is pre-discount; discount lives on the first item)
    SELECT
      COALESCE(SUM(meters * price_per_meter), 0),
      COALESCE(SUM(COALESCE(discount_amount, 0)), 0)
    INTO group_total, group_discount
    FROM sales
    WHERE sale_group_id = v_group_id OR id = v_group_id;

    FOR item IN
      SELECT * FROM sales WHERE sale_group_id = v_group_id OR id = v_group_id
    LOOP
      item_proportion := CASE WHEN group_total > 0
        THEN (item.meters * item.price_per_meter) / group_total
        ELSE 1.0 / GREATEST(
          (SELECT COUNT(*) FROM sales
           WHERE sale_group_id = v_group_id OR id = v_group_id),
          1)
      END;

      -- Net share of THIS item = its gross × (group net / group gross).
      -- The discount is spread evenly by value, so Σ item_net = group net
      -- and every item's remaining scales uniformly (no clamped stranding).
      item_net := CASE WHEN group_total > 0
        THEN GREATEST(
          (item.meters * item.price_per_meter) * (group_total - group_discount) / group_total,
          0)
        ELSE GREATEST(
          item.meters * item.price_per_meter - COALESCE(item.discount_amount, 0),
          0)
      END;

      -- Sum all group payments proportionally for this item
      SELECT COALESCE(SUM(amount), 0) * item_proportion
      INTO item_paid
      FROM sale_payments WHERE sale_group_id = v_group_id;

      -- Also add any direct sale_id payments for this item
      SELECT item_paid + COALESCE(SUM(amount), 0)
      INTO item_paid
      FROM sale_payments WHERE sale_id = item.id AND sale_group_id IS NULL;

      UPDATE sales SET
        paid_amount = item_paid,
        remaining_amount = GREATEST(item_net - item_paid, 0),
        margin = GREATEST(
          item.meters * (item.price_per_meter - item.cost_price_per_meter)
            - COALESCE(item.discount_amount, 0),
          0),
        status = CASE
          WHEN item_paid <= 0 THEN 'pending'
          WHEN item_paid >= item_net THEN 'completed'
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
    -- Original per-item logic (standalone sale; discount on its only row)
    SELECT
      COALESCE((SELECT SUM(amount) FROM sale_payments
                WHERE sale_id = v_sale_id AND sale_group_id IS NULL), 0),
      s.meters * s.price_per_meter,
      GREATEST(s.meters * (s.price_per_meter - s.cost_price_per_meter)
               - COALESCE(s.discount_amount, 0), 0),
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

-- ── One-time repair: recompute paid / remaining / status / margin ──
WITH gp AS (
  SELECT
    COALESCE(s.sale_group_id, s.id) AS gid,
    SUM(s.meters * s.price_per_meter) AS gross,
    SUM(COALESCE(s.discount_amount, 0)) AS disc,
    COUNT(*)::numeric AS n
  FROM sales s
  GROUP BY 1
),
p AS (
  SELECT sale_group_id AS gid, SUM(amount) AS gpay
  FROM sale_payments
  WHERE sale_group_id IS NOT NULL
  GROUP BY 1
),
d AS (
  SELECT sale_id AS sid, SUM(amount) AS dpay
  FROM sale_payments
  WHERE sale_id IS NOT NULL AND sale_group_id IS NULL
  GROUP BY 1
),
calc AS (
  SELECT
    s.id,
    s.meters * s.price_per_meter AS item_gross,
    COALESCE(s.discount_amount, 0) AS row_disc,
    gp.gross,
    gp.disc,
    COALESCE(p.gpay, 0) AS gpay,
    COALESCE(d.dpay, 0) AS dpay,
    gp.n
  FROM sales s
  JOIN gp ON gp.gid = COALESCE(s.sale_group_id, s.id)
  LEFT JOIN p ON p.gid = gp.gid
  LEFT JOIN d ON d.sid = s.id
),
calc2 AS (
  SELECT
    calc.*,
    CASE WHEN gross > 0
      THEN item_gross / gross
      ELSE 1.0 / GREATEST(n, 1)
    END AS prop,
    CASE WHEN gross > 0
      THEN GREATEST(item_gross * (gross - disc) / gross, 0)
      ELSE GREATEST(item_gross - row_disc, 0)
    END AS item_net
  FROM calc
),
calc3 AS (
  SELECT calc2.*, gpay * prop + dpay AS paid_new
  FROM calc2
)
UPDATE sales s
SET
  paid_amount = c.paid_new,
  remaining_amount = GREATEST(c.item_net - c.paid_new, 0),
  margin = GREATEST(
    s.meters * (s.price_per_meter - s.cost_price_per_meter) - c.row_disc,
    0),
  status = CASE
    WHEN c.paid_new <= 0 THEN 'pending'
    WHEN c.paid_new >= c.item_net THEN 'completed'
    ELSE 'partial'
  END,
  updated_at = now()
FROM calc3 c
WHERE s.id = c.id;

-- ── Resync customer balances ──
UPDATE customers c
SET current_balance = sub.rem,
    updated_at = now()
FROM (
  SELECT customer_id, COALESCE(SUM(remaining_amount), 0) AS rem
  FROM sales
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id;

UPDATE customers c
SET current_balance = 0,
    updated_at = now()
WHERE c.current_balance <> 0
  AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = c.id);
