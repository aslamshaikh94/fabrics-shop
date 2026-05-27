/*
  # Performance indexes and cascade deletes for Reports & Delete features

  1. Changes
    - Add indexes on date columns used by Reports monthly aggregation
    - Add indexes on foreign keys for faster joins
    - Update sales ON DELETE to CASCADE so deleting a sale also removes its payments
    - Update purchases ON DELETE to CASCADE so deleting a purchase also removes its payments

  2. Reason
    - Reports page queries sales and purchases filtered by date range — indexes speed this up
    - Delete sale/purchase feature requires cascade so orphan payments are not left behind
*/

-- Indexes for Reports date-range queries
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON purchase_payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_fabrics_available_meters ON fabrics(available_meters);

-- Update sale_payments foreign key to CASCADE on sale delete
ALTER TABLE sale_payments DROP CONSTRAINT IF EXISTS sale_payments_sale_id_fkey;
ALTER TABLE sale_payments
  ADD CONSTRAINT sale_payments_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

-- Update purchase_payments foreign key to CASCADE on purchase delete
ALTER TABLE purchase_payments DROP CONSTRAINT IF EXISTS purchase_payments_purchase_id_fkey;
ALTER TABLE purchase_payments
  ADD CONSTRAINT purchase_payments_purchase_id_fkey
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;
