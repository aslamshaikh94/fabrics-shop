/*
  # Fix split discounts - consolidate to first item only

  1. Problem:
    - Old sales have discounts split proportionally across items
    - New logic stores discount only in first item
    
  2. Solution:
    - For each sale_group_id, sum all discount_amounts
    - Apply total discount to first item (lowest created_at)
    - Set discount_amount = 0 for other items
    - Recalculate margin and remaining_amount
*/

-- Temporary table to store group discount totals
CREATE TEMP TABLE group_discounts AS
SELECT 
  COALESCE(sale_group_id::text, id::text) as group_key,
  SUM(discount_amount) as total_discount
FROM sales
WHERE discount_amount > 0
GROUP BY COALESCE(sale_group_id::text, id::text)
HAVING SUM(discount_amount) > 0;

-- Update: Set discount to 0 for all items first
UPDATE sales
SET discount_amount = 0
WHERE id IN (
  SELECT s.id 
  FROM sales s
  INNER JOIN group_discounts gd 
    ON COALESCE(s.sale_group_id::text, s.id::text) = gd.group_key
);

-- Update: Apply full discount to first item of each group
UPDATE sales s
SET discount_amount = gd.total_discount
FROM group_discounts gd
WHERE COALESCE(s.sale_group_id::text, s.id::text) = gd.group_key
AND s.id = (
  SELECT id 
  FROM sales 
  WHERE COALESCE(sale_group_id::text, id::text) = gd.group_key
  ORDER BY created_at ASC, id ASC
  LIMIT 1
);

-- Recalculate margin and remaining_amount for affected sales
UPDATE sales s
SET 
  margin = GREATEST(
    s.meters * (s.price_per_meter - s.cost_price_per_meter) - s.discount_amount,
    0
  ),
  remaining_amount = GREATEST(
    s.total_amount - s.discount_amount - s.paid_amount,
    0
  )
WHERE id IN (
  SELECT s2.id 
  FROM sales s2
  INNER JOIN group_discounts gd 
    ON COALESCE(s2.sale_group_id::text, s2.id::text) = gd.group_key
);

-- Update customer balances based on new remaining_amount
UPDATE customers c
SET current_balance = (
  SELECT COALESCE(SUM(remaining_amount), 0)
  FROM sales
  WHERE customer_id = c.id
),
updated_at = now()
WHERE id IN (
  SELECT DISTINCT customer_id 
  FROM sales s
  INNER JOIN group_discounts gd 
    ON COALESCE(s.sale_group_id::text, s.id::text) = gd.group_key
  WHERE customer_id IS NOT NULL
);

-- Clean up temp table
DROP TABLE group_discounts;
