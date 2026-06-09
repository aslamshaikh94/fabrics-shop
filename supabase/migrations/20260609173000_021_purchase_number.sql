-- Add human-readable purchase number
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_number text;

-- Function to auto-generate sequential purchase number
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

DROP TRIGGER IF EXISTS trigger_generate_purchase_number ON purchases;
CREATE TRIGGER trigger_generate_purchase_number
BEFORE INSERT ON purchases
FOR EACH ROW
WHEN (NEW.purchase_number IS NULL OR NEW.purchase_number = '')
EXECUTE FUNCTION generate_purchase_number();

-- Generate purchase numbers for existing records that don't have one
UPDATE purchases
SET purchase_number = sub.purchase_number
FROM (
  SELECT id, 'PUR-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 5, '0') AS purchase_number
  FROM purchases
  WHERE purchase_number IS NULL
) sub
WHERE purchases.id = sub.id;
