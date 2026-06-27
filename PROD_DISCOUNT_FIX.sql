-- ============================================================================
-- PRODUCTION: RESTRUCTURE DISCOUNT AS GROUP-LEVEL ONLY
-- ============================================================================
-- This consolidates all discounts to ONLY the first item in each group
-- Individual items store pre-discount values
-- Frontend applies discount to group totals (remaining and margin)
-- ============================================================================

DO $$
DECLARE
  group_rec RECORD;
BEGIN
  RAISE NOTICE 'Starting discount consolidation...';
  
  -- For each sale group, consolidate all discounts to first item only
  FOR group_rec IN
    SELECT 
      COALESCE(sale_group_id::text, id::text) as group_key,
      SUM(discount_amount) as total_discount
    FROM sales
    GROUP BY COALESCE(sale_group_id::text, id::text)
    HAVING SUM(discount_amount) > 0
  LOOP
    RAISE NOTICE 'Processing group % with total discount %', 
      group_rec.group_key, group_rec.total_discount;
    
    -- Zero out discount on all items in group
    UPDATE sales
    SET discount_amount = 0
    WHERE COALESCE(sale_group_id::text, id::text) = group_rec.group_key;
    
    -- Apply total discount ONLY to first item
    UPDATE sales
    SET discount_amount = group_rec.total_discount
    WHERE id = (
      SELECT id
      FROM sales
      WHERE COALESCE(sale_group_id::text, id::text) = group_rec.group_key
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    );
    
    -- Recalculate each item WITHOUT discount (discount is group-level only)
    UPDATE sales s
    SET 
      total_amount = s.meters * s.price_per_meter,
      margin = GREATEST(
        s.meters * (s.price_per_meter - s.cost_price_per_meter),
        0
      ),
      remaining_amount = GREATEST(
        s.meters * s.price_per_meter - s.paid_amount,
        0
      )
    WHERE COALESCE(s.sale_group_id::text, s.id::text) = group_rec.group_key;
    
  END LOOP;
  
  -- Update customer balances (group-level remaining: total - discount - paid)
  UPDATE customers c
  SET 
    current_balance = (
      SELECT COALESCE(
        SUM(
          GREATEST(
            s.total_amount - COALESCE(s.discount_amount, 0) - s.paid_amount,
            0
          )
        ),
        0
      )
      FROM (
        SELECT DISTINCT ON (COALESCE(sale_group_id::text, id::text))
          COALESCE(sale_group_id::text, id::text) as group_key,
          (
            SELECT SUM(total_amount)
            FROM sales s2
            WHERE COALESCE(s2.sale_group_id::text, s2.id::text) = COALESCE(s1.sale_group_id::text, s1.id::text)
          ) as total_amount,
          (
            SELECT SUM(COALESCE(discount_amount, 0))
            FROM sales s2
            WHERE COALESCE(s2.sale_group_id::text, s2.id::text) = COALESCE(s1.sale_group_id::text, s1.id::text)
          ) as discount_amount,
          (
            SELECT SUM(paid_amount)
            FROM sales s2
            WHERE COALESCE(s2.sale_group_id::text, s2.id::text) = COALESCE(s1.sale_group_id::text, s1.id::text)
          ) as paid_amount
        FROM sales s1
        WHERE customer_id = c.id
      ) s
    ),
    updated_at = now()
  WHERE EXISTS (SELECT 1 FROM sales WHERE customer_id = c.id);
  
  RAISE NOTICE 'Discount consolidation completed';
END $$;

-- Verification Query
SELECT 
  COALESCE(s.sale_group_id::text, s.id::text) as group_key,
  c.name as customer,
  s.fabric_name,
  s.total_amount,
  s.discount_amount,
  s.paid_amount,
  s.remaining_amount,
  s.margin,
  s.created_at
FROM sales s
LEFT JOIN customers c ON s.customer_id = c.id
WHERE COALESCE(s.sale_group_id::text, s.id::text) IN (
  SELECT COALESCE(sale_group_id::text, id::text)
  FROM sales
  WHERE discount_amount > 0
)
ORDER BY 
  COALESCE(s.sale_group_id::text, s.id::text),
  s.created_at ASC;

-- Customer Balance Verification
SELECT 
  name,
  current_balance
FROM customers
WHERE current_balance > 0
ORDER BY current_balance DESC;
