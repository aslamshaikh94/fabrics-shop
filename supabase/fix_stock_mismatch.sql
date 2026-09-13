-- ============================================
-- Fix Stock Mismatch Script
-- ============================================
-- Problem: The available_meters in the fabrics table doesn't match
-- the actual sales due to:
-- 1. Trigger bug: LEAST(total_meters, ...) in UPDATE/DELETE cases caps stock incorrectly
-- 2. SalesImport updates don't pass fabric_id, so new stock isn't deducted on update
-- 3. Potential duplicate decrements from multi-item sales
-- 4. Manual edits or imports bypassing the trigger
-- ============================================

-- First, check if the trigger exists and is active
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'sales' AND trigger_name = 'trigger_update_fabric_stock';

-- Check the function exists
SELECT proname FROM pg_proc WHERE proname = 'update_fabric_stock';

-- ============================================
-- RECALCULATE: For each fabric, sum up all sale meters
-- that have fabric_id linked, and subtract from total_meters
-- ============================================

-- Show current vs expected stock for all fabrics
WITH sold_amounts AS (
  SELECT
    fabric_id,
    COALESCE(SUM(meters), 0) AS total_sold_meters
  FROM sales
  WHERE fabric_id IS NOT NULL AND fabric_id != '00000000-0000-0000-0000-000000000000'::uuid
  GROUP BY fabric_id
)
SELECT
  f.id,
  f.name,
  f.total_meters,
  f.available_meters AS current_available,
  GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0)) AS expected_available,
  f.available_meters - GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0)) AS difference
FROM fabrics f
LEFT JOIN sold_amounts s ON s.fabric_id = f.id
WHERE f.available_meters != GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0))
ORDER BY ABS(f.available_meters - GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0))) DESC;

-- ============================================
-- FIX: Update available_meters to correct values
-- ============================================
WITH sold_amounts AS (
  SELECT
    fabric_id,
    COALESCE(SUM(meters), 0) AS total_sold_meters
  FROM sales
  WHERE fabric_id IS NOT NULL AND fabric_id != '00000000-0000-0000-0000-000000000000'::uuid
  GROUP BY fabric_id
)
UPDATE fabrics f
SET available_meters = GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0)),
    updated_at = now()
FROM sold_amounts s
WHERE s.fabric_id = f.id
  AND f.available_meters != GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0));

-- ============================================
-- FIXED TRIGGER: The key fix is removing LEAST(total_meters, ...) 
-- which was incorrectly capping stock restoration on UPDATE/DELETE.
-- ============================================

CREATE OR REPLACE FUNCTION update_fabric_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Deduct stock when a sale is created
    IF NEW.fabric_id IS NOT NULL AND NEW.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics 
      SET available_meters = GREATEST(0, available_meters - NEW.meters), 
          updated_at = now() 
      WHERE id = NEW.fabric_id;
    END IF;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Restore stock for the OLD fabric (if it was linked)
    IF OLD.fabric_id IS NOT NULL AND OLD.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics 
      SET available_meters = available_meters + OLD.meters, 
          updated_at = now() 
      WHERE id = OLD.fabric_id;
    END IF;
    
    -- Deduct stock for the NEW fabric (if linked)
    IF NEW.fabric_id IS NOT NULL AND NEW.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics 
      SET available_meters = GREATEST(0, available_meters - NEW.meters), 
          updated_at = now() 
      WHERE id = NEW.fabric_id;
    END IF;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Restore stock when a sale is deleted
    IF OLD.fabric_id IS NOT NULL AND OLD.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics 
      SET available_meters = available_meters + OLD.meters, 
          updated_at = now() 
      WHERE id = OLD.fabric_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_fabric_stock ON sales;
CREATE TRIGGER trigger_update_fabric_stock
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION update_fabric_stock();

-- ============================================
-- FIX: Add trigger to sync customer balance when sales are deleted
-- The existing trigger on sale_payments updates customer.current_balance,
-- but when a sale is DELETED directly, the customer balance is not updated.
-- Also fix the update trigger to handle the case where the sale no longer exists.
-- ============================================

CREATE OR REPLACE FUNCTION sync_customer_balance_on_sale_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync customer balance for the deleted sale's customer
  IF OLD.customer_id IS NOT NULL THEN
    UPDATE customers
    SET current_balance = (
      SELECT COALESCE(SUM(remaining_amount), 0)
      FROM sales
      WHERE customer_id = OLD.customer_id
    ),
    updated_at = now()
    WHERE id = OLD.customer_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_customer_balance_on_sale_delete ON sales;
CREATE TRIGGER trigger_sync_customer_balance_on_sale_delete
AFTER DELETE ON sales
FOR EACH ROW
EXECUTE FUNCTION sync_customer_balance_on_sale_delete();

-- Also fix the payment trigger to handle the case where the sale was already deleted
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

  -- Check if the sale still exists
  PERFORM 1 FROM sales WHERE id = v_sale_id;
  IF NOT FOUND THEN
    -- Sale was already deleted, just sync customer balance
    -- We need to find the customer_id from the payment's sale before deletion
    -- But since we can't get it, return COALESCE(NEW, OLD)
    RETURN COALESCE(NEW, OLD);
  END IF;

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

-- ============================================
-- One-time sync: recalculate all customers' current_balance
-- ============================================
UPDATE customers c
SET current_balance = (
  SELECT COALESCE(SUM(remaining_amount), 0)
  FROM sales
  WHERE customer_id = c.id
),
updated_at = now();

-- ============================================
-- Verify the fix
-- ============================================
WITH sold_amounts AS (
  SELECT
    fabric_id,
    COALESCE(SUM(meters), 0) AS total_sold_meters
  FROM sales
  WHERE fabric_id IS NOT NULL AND fabric_id != '00000000-0000-0000-0000-000000000000'::uuid
  GROUP BY fabric_id
)
SELECT
  f.id,
  f.name,
  f.total_meters,
  f.available_meters AS fixed_available,
  GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0)) AS expected_available,
  CASE WHEN f.available_meters = GREATEST(0, f.total_meters - COALESCE(s.total_sold_meters, 0)) THEN '✓ OK' ELSE '✗ MISMATCH' END AS status
FROM fabrics f
LEFT JOIN sold_amounts s ON s.fabric_id = f.id
ORDER BY f.name;