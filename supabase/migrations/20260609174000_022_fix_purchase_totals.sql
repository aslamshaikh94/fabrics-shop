-- Fix purchase total_amount values that were corrupted to 0
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