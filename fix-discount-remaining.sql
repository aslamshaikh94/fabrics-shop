-- ============================================================
-- FIX: total_amount to be pre-discount value
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Fix existing sales data
UPDATE sales SET
  total_amount = meters * price_per_meter,
  margin = GREATEST(meters * (price_per_meter - cost_price_per_meter) - COALESCE(discount_amount, 0), 0),
  remaining_amount = GREATEST(meters * price_per_meter - COALESCE(discount_amount, 0) - paid_amount, 0);

-- 2. Update the payment trigger to properly handle discount
CREATE OR REPLACE FUNCTION update_sale_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_sale_id uuid;
  v_customer_id uuid;
  v_paid numeric;
  v_orig_total numeric;
  v_margin_val numeric;
  v_discount numeric;
BEGIN
  v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);
  SELECT 
    COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = v_sale_id), 0),
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
  IF v_customer_id IS NOT NULL THEN
    UPDATE customers SET current_balance = (
      SELECT COALESCE(SUM(remaining_amount), 0) FROM sales WHERE customer_id = v_customer_id
    ), updated_at = now() WHERE id = v_customer_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Recalculate customer balances
UPDATE customers c SET current_balance = (
  SELECT COALESCE(SUM(remaining_amount), 0) FROM sales WHERE customer_id = c.id
), updated_at = now();