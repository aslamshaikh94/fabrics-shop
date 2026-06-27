/*
  # Fix split discounts - distribute across items properly

  1. Problem:
    - Old sales have discounts split proportionally across items
    - New logic stores discount starting from first item
    - When discount > first item total, overflow to next items
    
  2. Solution:
    - For each sale_group_id, sum all discount_amounts
    - Apply discount sequentially to items in order
    - If discount exceeds item's total, apply remainder to next item
    - Recalculate margin and remaining_amount
*/

DO $$
DECLARE
  group_rec RECORD;
  item_rec RECORD;
  remaining_discount NUMERIC;
  item_total NUMERIC;
  discount_to_apply NUMERIC;
BEGIN
  -- Loop through each sale group that has a discount
  FOR group_rec IN
    SELECT 
      COALESCE(sale_group_id::text, id::text) as group_key,
      SUM(discount_amount) as total_discount
    FROM sales
    WHERE discount_amount > 0
    GROUP BY COALESCE(sale_group_id::text, id::text)
    HAVING SUM(discount_amount) > 0
  LOOP
    -- Reset discount for all items in this group first
    UPDATE sales
    SET discount_amount = 0
    WHERE COALESCE(sale_group_id::text, id::text) = group_rec.group_key;
    
    -- Now distribute the discount across items in order
    remaining_discount := group_rec.total_discount;
    
    FOR item_rec IN
      SELECT id, meters, price_per_meter, cost_price_per_meter, paid_amount
      FROM sales
      WHERE COALESCE(sale_group_id::text, id::text) = group_rec.group_key
      ORDER BY created_at ASC, id ASC
    LOOP
      EXIT WHEN remaining_discount <= 0;
      
      -- Calculate this item's pre-discount total
      item_total := item_rec.meters * item_rec.price_per_meter;
      
      -- Apply as much discount as possible to this item (but not more than its total)
      discount_to_apply := LEAST(remaining_discount, item_total);
      
      -- Update this item with its portion of the discount
      UPDATE sales
      SET 
        discount_amount = discount_to_apply,
        total_amount = item_total,
        margin = GREATEST(
          item_rec.meters * (item_rec.price_per_meter - item_rec.cost_price_per_meter) - discount_to_apply,
          0
        ),
        remaining_amount = GREATEST(
          item_total - discount_to_apply - item_rec.paid_amount,
          0
        )
      WHERE id = item_rec.id;
      
      -- Reduce remaining discount
      remaining_discount := remaining_discount - discount_to_apply;
    END LOOP;
  END LOOP;
  
  -- Update customer balances
  UPDATE customers c
  SET current_balance = (
    SELECT COALESCE(SUM(remaining_amount), 0)
    FROM sales
    WHERE customer_id = c.id
  ),
  updated_at = now()
  WHERE id IN (
    SELECT DISTINCT customer_id 
    FROM sales 
    WHERE customer_id IS NOT NULL
    AND discount_amount > 0
  );
END $$;
