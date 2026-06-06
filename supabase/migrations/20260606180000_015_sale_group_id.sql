/*
  # Add sale_group_id to group items from same sale transaction
  
  - Adds sale_group_id column to sales table
  - This allows grouping items from the same "New Sale" submission
  - Previously, all sales for the same customer on the same date were grouped together
  - Now, each "New Sale" action creates a new group with a unique sale_group_id
*/

ALTER TABLE sales 
ADD COLUMN sale_group_id uuid DEFAULT gen_random_uuid();

-- Create an index for faster grouping queries
CREATE INDEX IF NOT EXISTS idx_sales_sale_group_id ON sales(sale_group_id);
