/*
  # Remove fabric_id constraint from sales

  1. Changes
    - Make fabric_id nullable in sales table
    - Remove foreign key constraint to fabrics table
    - Allow manual fabric input without requiring fabric record

  2. Reason
    - Users want to manually input fabric details in sales
    - No need to maintain separate fabric inventory
*/

-- Drop the foreign key constraint
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_fabric_id_fkey;

-- Make fabric_id nullable
ALTER TABLE sales ALTER COLUMN fabric_id DROP NOT NULL;
ALTER TABLE sales ALTER COLUMN fabric_id SET DEFAULT null;

-- Update the trigger that updates fabric inventory (disable it since we're not using fabric inventory)
DROP TRIGGER IF EXISTS trigger_update_fabric_on_sale ON sales;
DROP FUNCTION IF EXISTS update_fabric_on_sale();
