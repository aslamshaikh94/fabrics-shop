-- Verification queries to run BEFORE migration
-- This shows current state of discounts

-- 1. Show all sales with discounts grouped
SELECT 
  COALESCE(sale_group_id, id::text) as group_id,
  customer_name,
  sale_date,
  COUNT(*) as items_count,
  SUM(total_amount) as group_total,
  SUM(discount_amount) as total_discount_split,
  SUM(remaining_amount) as group_remaining
FROM sales
WHERE id IN (
  SELECT id FROM sales 
  WHERE COALESCE(sale_group_id, id::text) IN (
    SELECT COALESCE(sale_group_id, id::text)
    FROM sales
    WHERE discount_amount > 0
    GROUP BY COALESCE(sale_group_id, id::text)
  )
)
GROUP BY COALESCE(sale_group_id, id::text), customer_name, sale_date
ORDER BY sale_date DESC;

-- 2. Show individual items with discounts
SELECT 
  id,
  COALESCE(sale_group_id, id::text) as group_id,
  customer_name,
  fabric_name,
  sale_date,
  meters,
  price_per_meter,
  total_amount,
  discount_amount,
  paid_amount,
  remaining_amount,
  margin,
  created_at
FROM sales
WHERE discount_amount > 0
ORDER BY sale_date DESC, created_at ASC;

-- AFTER running migration, run these queries:

-- 3. Verify discount is on first item only
SELECT 
  COALESCE(sale_group_id, id::text) as group_id,
  customer_name,
  sale_date,
  COUNT(*) as items_count,
  COUNT(*) FILTER (WHERE discount_amount > 0) as items_with_discount,
  SUM(discount_amount) as total_discount,
  SUM(remaining_amount) as group_remaining
FROM sales
WHERE COALESCE(sale_group_id, id::text) IN (
  SELECT COALESCE(sale_group_id, id::text)
  FROM sales
  WHERE discount_amount > 0
  GROUP BY COALESCE(sale_group_id, id::text)
)
GROUP BY COALESCE(sale_group_id, id::text), customer_name, sale_date
ORDER BY sale_date DESC;

-- 4. Check that only first item has discount
SELECT 
  COALESCE(s.sale_group_id, s.id::text) as group_id,
  s.customer_name,
  s.fabric_name,
  s.discount_amount,
  s.created_at,
  CASE 
    WHEN s.id = (
      SELECT id FROM sales s2 
      WHERE COALESCE(s2.sale_group_id, s2.id::text) = COALESCE(s.sale_group_id, s.id::text)
      ORDER BY s2.created_at ASC, s2.id ASC 
      LIMIT 1
    ) THEN 'FIRST ITEM ✓'
    ELSE 'Other Item'
  END as item_position
FROM sales s
WHERE COALESCE(s.sale_group_id, s.id::text) IN (
  SELECT COALESCE(sale_group_id, id::text)
  FROM sales
  WHERE discount_amount > 0
  GROUP BY COALESCE(sale_group_id, id::text)
)
ORDER BY s.sale_date DESC, s.created_at ASC;
