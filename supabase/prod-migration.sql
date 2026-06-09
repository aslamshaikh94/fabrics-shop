-- ============================================================
-- PRODUCTION MIGRATION: All queries to run in Supabase SQL Editor
-- ============================================================

-- 1. Add purchase_number column to purchases table (if not exists)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_number text;

-- 2. Function to auto-generate sequential purchase number
CREATE OR REPLACE FUNCTION generate_purchase_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num integer;
BEGIN
  next_num := COALESCE(
    (SELECT MAX(CAST(SUBSTRING(purchase_number FROM 5) AS integer)) FROM purchases WHERE purchase_number ~ '^PUR-\d+$'),
    0
  ) + 1;
  NEW.purchase_number := 'PUR-' || LPAD(next_num::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger to auto-generate purchase number on insert
DROP TRIGGER IF EXISTS trigger_generate_purchase_number ON purchases;
CREATE TRIGGER trigger_generate_purchase_number
BEFORE INSERT ON purchases
FOR EACH ROW
WHEN (NEW.purchase_number IS NULL OR NEW.purchase_number = '')
EXECUTE FUNCTION generate_purchase_number();

-- 4. Generate purchase numbers for existing records that don't have one
UPDATE purchases
SET purchase_number = sub.purchase_number
FROM (
  SELECT id, 'PUR-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 5, '0') AS purchase_number
  FROM purchases
  WHERE purchase_number IS NULL
) sub
WHERE purchases.id = sub.id;

-- 5. Add purchase_id column to fabrics table to link fabrics to purchases (if not exists)
ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fabrics_purchase_id ON fabrics(purchase_id);

-- 6. Fix purchase total_amount values that were corrupted to 0
-- Recalculate from the actual fabrics linked to each purchase
UPDATE purchases
SET total_amount = COALESCE(
  (
    SELECT SUM(f.total_meters * f.purchase_price_per_meter)
    FROM fabrics f
    WHERE f.purchase_id = purchases.id
  ),
  0
),
updated_at = now()
WHERE purchases.id IN (
  SELECT DISTINCT f.purchase_id
  FROM fabrics f
  WHERE f.purchase_id IS NOT NULL
);

-- ============================================================
-- VERIFICATION QUERIES (run these to confirm everything worked)
-- ============================================================

-- Check purchase numbers are generated
SELECT id, purchase_number, total_amount, status FROM purchases ORDER BY created_at DESC LIMIT 10;

-- Check fabrics linked to purchases
SELECT f.name, f.purchase_id, p.purchase_number
FROM fabrics f
LEFT JOIN purchases p ON p.id = f.purchase_id
WHERE f.purchase_id IS NOT NULL
LIMIT 20;