/*
  # Add discount feature to sales (flat amount)

  1. Changes to sales table
    - Add discount_amount column (flat amount, default 0)
    - total_amount stores pre-discount value (meters * price_per_meter)
    - remaining_amount = total_amount - discount_amount - paid_amount
    - margin = meters * (price - cost) - discount_amount

  2. BEFORE INSERT trigger to auto-calculate
  3. Payment trigger updated to use discount
*/

-- Add discount_amount column (flat amount, not percentage)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

-- Safely drop generated expressions only if they are still generated columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'total_amount' 
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE sales ALTER COLUMN total_amount DROP EXPRESSION;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'remaining_amount' 
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE sales ALTER COLUMN remaining_amount DROP EXPRESSION;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'margin' 
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE sales ALTER COLUMN margin DROP EXPRESSION;
  END IF;
END $$;

-- Set default values to 0 (safe to run multiple times)
ALTER TABLE sales ALTER COLUMN total_amount SET DEFAULT 0;
ALTER TABLE sales ALTER COLUMN remaining_amount SET DEFAULT 0;
ALTER TABLE sales ALTER COLUMN margin SET DEFAULT 0;

-- Ensure NOT NULL constraints (safe to run multiple times)
ALTER TABLE sales ALTER COLUMN total_amount SET NOT NULL;
ALTER TABLE sales ALTER COLUMN remaining_amount SET NOT NULL;
ALTER TABLE sales ALTER COLUMN margin SET NOT NULL;

-- Create BEFORE INSERT trigger to auto-calculate these columns
CREATE OR REPLACE FUNCTION calculate_sale_amounts()
RETURNS TRIGGER AS $$
BEGIN
  -- total_amount = PRE-DISCOUNT value (meters * price)
  NEW.total_amount := NEW.meters * NEW.price_per_meter;
  -- margin = pre-discount margin minus discount
  NEW.margin := GREATEST(NEW.meters * (NEW.price_per_meter - NEW.cost_price_per_meter) - COALESCE(NEW.discount_amount, 0), 0);
  -- remaining = total - discount - paid
  NEW.remaining_amount := GREATEST(NEW.total_amount - COALESCE(NEW.discount_amount, 0) - NEW.paid_amount, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_sale_amounts ON sales;
CREATE TRIGGER trigger_calculate_sale_amounts
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION calculate_sale_amounts();

-- Update existing data: total_amount = pre-discount, remaining = total - discount - paid
UPDATE sales SET
  total_amount = meters * price_per_meter,
  margin = GREATEST(meters * (price_per_meter - cost_price_per_meter) - COALESCE(discount_amount, 0), 0),
  remaining_amount = GREATEST(meters * price_per_meter - COALESCE(discount_amount, 0) - paid_amount, 0);

-- Update trigger: auto-update sales when payments change
-- Also sync customer current_balance
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

  -- Get current values: total_amount is pre-discount
  SELECT 
    COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = v_sale_id), 0),
    s.meters * s.price_per_meter,
    GREATEST(s.meters * (s.price_per_meter - s.cost_price_per_meter) - COALESCE(s.discount_amount, 0), 0),
    s.customer_id,
    COALESCE(s.discount_amount, 0)
  INTO v_paid, v_orig_total, v_margin_val, v_customer_id, v_discount
  FROM sales s WHERE id = v_sale_id;

  UPDATE sales
  SET
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

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- One-time sync: update all customers' current_balance based on current remaining_amount
UPDATE customers c
SET current_balance = (
  SELECT COALESCE(SUM(remaining_amount), 0)
  FROM sales
  WHERE customer_id = c.id
),
updated_at = now();