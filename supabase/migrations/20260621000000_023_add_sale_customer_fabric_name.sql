/*
  #23 - Add customer_name and fabric_name to sales table

  Adds dedicated columns for storing customer name and fabric name directly,
  instead of embedding them in the notes field as "Fabric: Name" and "(Name: walkin)".

  1. Schema changes:
    - Add `customer_name` (text) for storing walk-in customer name or customer name copy
    - Add `fabric_name` (text) for storing fabric name directly

  2. Backfill:
    - Extracts fabric name from notes matching "Fabric: Name"
    - Extracts walk-in customer name from notes matching "(Name: Name)"
    - For existing customers, copies customer name from customers table
*/

-- Add new columns
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fabric_name text NOT NULL DEFAULT '';

-- Backfill fabric_name from notes where empty
UPDATE sales
SET fabric_name = COALESCE(
  NULLIF(TRIM(SUBSTRING(notes FROM 'Fabric:\s*([^(\n|]+)')), ''),
  ''
)
WHERE fabric_name = '' AND notes LIKE 'Fabric:%';

-- Backfill customer_name:
-- For existing customers, copy name from customers table
UPDATE sales
SET customer_name = COALESCE(customers.name, '')
FROM customers
WHERE sales.customer_id = customers.id
  AND sales.customer_name = '';

-- For walk-in (no customer_id), extract from notes "(Name: ...)"
UPDATE sales
SET customer_name = COALESCE(
  NULLIF(TRIM(SUBSTRING(notes FROM 'Name:\s*([^)]+)')), ''),
  ''
)
WHERE sales.customer_id IS NULL
  AND sales.customer_name = ''
  AND notes LIKE '%(Name:%';

-- Create indexes for searching
CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON sales(customer_name);
CREATE INDEX IF NOT EXISTS idx_sales_fabric_name ON sales(fabric_name);