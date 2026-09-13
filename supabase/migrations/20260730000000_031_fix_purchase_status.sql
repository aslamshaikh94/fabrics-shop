-- Fix purchase status: ensure status is updated when paid_amount >= total_amount
-- This addresses an issue where the trigger wasn't updating status correctly

-- Re-create the trigger function to ensure it's up-to-date
CREATE OR REPLACE FUNCTION update_purchase_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_id uuid;
BEGIN
  v_purchase_id := COALESCE(NEW.purchase_id, OLD.purchase_id);
  UPDATE purchases
  SET
    paid_amount = (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_id = v_purchase_id),
    status = CASE
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_id = v_purchase_id) <= 0 THEN 'pending'
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_id = v_purchase_id) >= total_amount THEN 'paid'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = v_purchase_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trigger_update_purchase_paid ON purchase_payments;
CREATE TRIGGER trigger_update_purchase_paid
AFTER INSERT OR UPDATE OR DELETE ON purchase_payments
FOR EACH ROW EXECUTE FUNCTION update_purchase_paid_amount();

-- Fix all existing purchases: recalculate status based on current paid_amount
UPDATE purchases
SET status = CASE
  WHEN paid_amount <= 0 THEN 'pending'
  WHEN paid_amount >= total_amount THEN 'paid'
  ELSE 'partial'
END,
updated_at = now()
WHERE id IN (
  SELECT id FROM purchases
  WHERE (paid_amount <= 0 AND status != 'pending')
     OR (paid_amount > 0 AND paid_amount < total_amount AND status != 'partial')
     OR (paid_amount >= total_amount AND status != 'paid')
);