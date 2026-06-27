-- ============================================================================
-- PRODUCTION BACKUP IMPORT - FINAL VERSION
-- ============================================================================
-- This script safely imports your backup without losing existing data
-- Run each section sequentially and verify results before proceeding
-- ============================================================================

-- ============================================================================
-- SECTION 1: BACKUP EXISTING DATA (SAFETY FIRST!)
-- ============================================================================
-- Run this first to create safety backups of your current data
-- ============================================================================

-- Create backup tables with timestamp
DO $$
DECLARE
  backup_suffix TEXT := '_backup_' || to_char(now(), 'YYYYMMDD_HH24MISS');
BEGIN
  EXECUTE format('CREATE TABLE sales%s AS SELECT * FROM sales', backup_suffix);
  EXECUTE format('CREATE TABLE sale_payments%s AS SELECT * FROM sale_payments', backup_suffix);
  EXECUTE format('CREATE TABLE fabrics%s AS SELECT * FROM fabrics', backup_suffix);
  EXECUTE format('CREATE TABLE customers%s AS SELECT * FROM customers', backup_suffix);
  EXECUTE format('CREATE TABLE suppliers%s AS SELECT * FROM suppliers', backup_suffix);
  EXECUTE format('CREATE TABLE purchases%s AS SELECT * FROM purchases', backup_suffix);
  EXECUTE format('CREATE TABLE purchase_payments%s AS SELECT * FROM purchase_payments', backup_suffix);
  EXECUTE format('CREATE TABLE expenses%s AS SELECT * FROM expenses', backup_suffix);
  EXECUTE format('CREATE TABLE withdrawals%s AS SELECT * FROM withdrawals', backup_suffix);
  EXECUTE format('CREATE TABLE partners%s AS SELECT * FROM partners', backup_suffix);
  
  RAISE NOTICE 'Backup tables created with suffix: %', backup_suffix;
  RAISE NOTICE 'If something goes wrong, restore using: INSERT INTO [table] SELECT * FROM [table]%', backup_suffix;
END $$;

-- Verify backup was created
SELECT 
  tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE '%_backup_%'
ORDER BY tablename;

-- STOP HERE AND VERIFY BACKUPS WERE CREATED!
-- Do not proceed until you see your backup tables listed above
-- ============================================================================

-- ============================================================================
-- SECTION 2: PREPARE FOR IMPORT
-- ============================================================================
-- Run this only after verifying Section 1 completed successfully
-- ============================================================================

-- Drop foreign key constraints temporarily
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_fabric_id_fkey;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_customer_id_fkey;
ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_sale_id_fkey;
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_supplier_id_fkey;
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_fabric_id_fkey;
ALTER TABLE purchase_payments DROP CONSTRAINT IF EXISTS purchase_payments_purchase_id_fkey;

-- Drop generated columns temporarily (can't insert into them)
ALTER TABLE purchases DROP COLUMN IF EXISTS remaining_amount;
ALTER TABLE sales DROP COLUMN IF EXISTS total_amount;
ALTER TABLE sales DROP COLUMN IF EXISTS remaining_amount;
ALTER TABLE sales DROP COLUMN IF EXISTS margin;

-- Recreate as normal columns for import
ALTER TABLE purchases ADD COLUMN remaining_amount numeric DEFAULT 0;
ALTER TABLE sales ADD COLUMN total_amount numeric DEFAULT 0;
ALTER TABLE sales ADD COLUMN remaining_amount numeric DEFAULT 0;
ALTER TABLE sales ADD COLUMN margin numeric DEFAULT 0;

-- Clear current data (it's safely backed up!)
TRUNCATE TABLE sale_payments CASCADE;
TRUNCATE TABLE purchase_payments CASCADE;
TRUNCATE TABLE sales CASCADE;
TRUNCATE TABLE purchases CASCADE;
TRUNCATE TABLE expenses CASCADE;
TRUNCATE TABLE withdrawals CASCADE;
TRUNCATE TABLE fabrics CASCADE;
TRUNCATE TABLE customers CASCADE;
TRUNCATE TABLE suppliers CASCADE;
TRUNCATE TABLE partners CASCADE;

-- Prepare withdrawals table for old backup format
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'notes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'reason'
  ) THEN
    ALTER TABLE withdrawals RENAME COLUMN notes TO reason;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE withdrawals DROP COLUMN payment_method;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'reference_number'
  ) THEN
    ALTER TABLE withdrawals DROP COLUMN reference_number;
  END IF;
END $$;

SELECT '✓ Ready for import! Now import your backup JSON file.' as status;

-- STOP HERE AND IMPORT YOUR BACKUP JSON FILE NOW!
-- After import completes successfully, proceed to Section 3
-- ============================================================================

-- ============================================================================
-- SECTION 3: POST-IMPORT RECOVERY & RESTORATION
-- ============================================================================
-- Run this AFTER your backup JSON has been imported successfully
-- Remove the /* and */ comment markers to run this section
-- ============================================================================

/*

-- Recreate foreign key constraints
ALTER TABLE sales 
ADD CONSTRAINT sales_fabric_id_fkey 
FOREIGN KEY (fabric_id) REFERENCES fabrics(id) ON DELETE RESTRICT;

ALTER TABLE sales 
ADD CONSTRAINT sales_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE sale_payments 
ADD CONSTRAINT sale_payments_sale_id_fkey 
FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

ALTER TABLE purchases 
ADD CONSTRAINT purchases_supplier_id_fkey 
FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;

ALTER TABLE purchases 
ADD CONSTRAINT purchases_fabric_id_fkey 
FOREIGN KEY (fabric_id) REFERENCES fabrics(id) ON DELETE SET NULL;

ALTER TABLE purchase_payments 
ADD CONSTRAINT purchase_payments_purchase_id_fkey 
FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;

-- Recreate generated columns
ALTER TABLE purchases DROP COLUMN IF EXISTS remaining_amount;
ALTER TABLE purchases 
ADD COLUMN remaining_amount numeric GENERATED ALWAYS AS (total_amount - paid_amount) STORED;

ALTER TABLE sales DROP COLUMN IF EXISTS total_amount;
ALTER TABLE sales 
ADD COLUMN total_amount numeric GENERATED ALWAYS AS (meters * price_per_meter) STORED;

ALTER TABLE sales DROP COLUMN IF EXISTS remaining_amount;
ALTER TABLE sales 
ADD COLUMN remaining_amount numeric GENERATED ALWAYS AS ((meters * price_per_meter) - paid_amount) STORED;

ALTER TABLE sales DROP COLUMN IF EXISTS margin;
ALTER TABLE sales 
ADD COLUMN margin numeric GENERATED ALWAYS AS (meters * (price_per_meter - cost_price_per_meter)) STORED;

-- Update withdrawals schema to modern version
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'reason'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'notes'
  ) THEN
    ALTER TABLE withdrawals RENAME COLUMN reason TO notes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE withdrawals ADD COLUMN payment_method text NOT NULL DEFAULT 'cash';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'withdrawals' AND column_name = 'reference_number'
  ) THEN
    ALTER TABLE withdrawals ADD COLUMN reference_number text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Clean up any orphaned records
DELETE FROM sales WHERE fabric_id IS NOT NULL AND fabric_id NOT IN (SELECT id FROM fabrics);
DELETE FROM sales WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers);

-- Reconstruct sale_payments from paid_amount (since they're missing in backup)
INSERT INTO sale_payments (
  sale_id,
  amount,
  payment_date,
  payment_method,
  reference_number,
  notes,
  created_at
)
SELECT 
  id as sale_id,
  paid_amount as amount,
  sale_date as payment_date,
  'cash' as payment_method,
  '' as reference_number,
  'Reconstructed from import' as notes,
  created_at
FROM sales
WHERE paid_amount > 0
ON CONFLICT DO NOTHING;

-- Reconstruct purchase_payments from paid_amount
INSERT INTO purchase_payments (
  purchase_id,
  amount,
  payment_date,
  payment_method,
  reference_number,
  notes,
  created_at
)
SELECT 
  id as purchase_id,
  paid_amount as amount,
  purchase_date as payment_date,
  'cash' as payment_method,
  '' as reference_number,
  'Reconstructed from import' as notes,
  created_at
FROM purchases
WHERE paid_amount > 0
ON CONFLICT DO NOTHING;

-- Fix discount logic - consolidate to first item in each group
DO $$
DECLARE
  group_rec RECORD;
BEGIN
  FOR group_rec IN
    SELECT 
      COALESCE(sale_group_id::text, id::text) as group_key,
      SUM(discount_amount) as total_discount
    FROM sales
    GROUP BY COALESCE(sale_group_id::text, id::text)
    HAVING SUM(discount_amount) > 0
  LOOP
    -- Zero out discount on all items
    UPDATE sales
    SET discount_amount = 0
    WHERE COALESCE(sale_group_id::text, id::text) = group_rec.group_key;
    
    -- Apply total discount to first item only
    UPDATE sales
    SET discount_amount = group_rec.total_discount
    WHERE id = (
      SELECT id
      FROM sales
      WHERE COALESCE(sale_group_id::text, id::text) = group_rec.group_key
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    );
    
    -- Recalculate item values WITHOUT discount
    UPDATE sales s
    SET 
      total_amount = s.meters * s.price_per_meter,
      margin = GREATEST(s.meters * (s.price_per_meter - s.cost_price_per_meter), 0),
      remaining_amount = GREATEST(s.meters * s.price_per_meter - s.paid_amount, 0)
    WHERE COALESCE(s.sale_group_id::text, s.id::text) = group_rec.group_key;
  END LOOP;
END $$;

-- Update customer balances with group-level calculation
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

SELECT '✓ Post-import recovery completed!' as status;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

SELECT '=== Import Summary ===' as section;
SELECT 'suppliers' as table_name, COUNT(*) as records FROM suppliers
UNION ALL SELECT 'fabrics', COUNT(*) FROM fabrics
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL SELECT 'purchase_payments', COUNT(*) FROM purchase_payments
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'sale_payments', COUNT(*) FROM sale_payments
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL SELECT 'withdrawals', COUNT(*) FROM withdrawals
UNION ALL SELECT 'partners', COUNT(*) FROM partners;

SELECT '=== Sample Sales ===' as section;
SELECT 
  COALESCE(customer_name, 'Walk-in') as customer,
  fabric_name,
  total_amount,
  discount_amount,
  paid_amount,
  remaining_amount
FROM sales
ORDER BY sale_date DESC
LIMIT 5;

SELECT '=== Customer Balances ===' as section;
SELECT name, current_balance
FROM customers
WHERE current_balance > 0
ORDER BY current_balance DESC;

SELECT '✓ ALL DONE! Restart your app to see the imported data.' as final_status;

*/

-- ============================================================================
-- EMERGENCY ROLLBACK (IF NEEDED)
-- ============================================================================
-- Only run this if something went wrong and you need to restore your backup
-- Replace 'YYYYMMDD_HH24MISS' with your actual backup suffix from Section 1
-- ============================================================================

/*

DO $$
DECLARE
  backup_suffix TEXT := '_backup_YYYYMMDD_HH24MISS'; -- UPDATE THIS!
BEGIN
  -- Restore from backups
  EXECUTE format('TRUNCATE TABLE sales CASCADE');
  EXECUTE format('INSERT INTO sales SELECT * FROM sales%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE sale_payments CASCADE');
  EXECUTE format('INSERT INTO sale_payments SELECT * FROM sale_payments%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE fabrics CASCADE');
  EXECUTE format('INSERT INTO fabrics SELECT * FROM fabrics%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE customers CASCADE');
  EXECUTE format('INSERT INTO customers SELECT * FROM customers%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE suppliers CASCADE');
  EXECUTE format('INSERT INTO suppliers SELECT * FROM suppliers%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE purchases CASCADE');
  EXECUTE format('INSERT INTO purchases SELECT * FROM purchases%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE purchase_payments CASCADE');
  EXECUTE format('INSERT INTO purchase_payments SELECT * FROM purchase_payments%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE expenses CASCADE');
  EXECUTE format('INSERT INTO expenses SELECT * FROM expenses%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE withdrawals CASCADE');
  EXECUTE format('INSERT INTO withdrawals SELECT * FROM withdrawals%s', backup_suffix);
  
  EXECUTE format('TRUNCATE TABLE partners CASCADE');
  EXECUTE format('INSERT INTO partners SELECT * FROM partners%s', backup_suffix);
  
  RAISE NOTICE 'Data restored from backup%', backup_suffix;
END $$;

-- Recreate constraints after rollback
ALTER TABLE sales 
ADD CONSTRAINT sales_fabric_id_fkey 
FOREIGN KEY (fabric_id) REFERENCES fabrics(id) ON DELETE RESTRICT;

ALTER TABLE sales 
ADD CONSTRAINT sales_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE sale_payments 
ADD CONSTRAINT sale_payments_sale_id_fkey 
FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

ALTER TABLE purchase_payments 
ADD CONSTRAINT purchase_payments_purchase_id_fkey 
FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;

*/
