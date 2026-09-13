-- Move reinvestment tracking from purchases to purchase_payments
ALTER TABLE purchase_payments
  ADD COLUMN IF NOT EXISTS reinvested_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Drop fund_source from purchases (no longer needed)
ALTER TABLE purchases
  DROP COLUMN IF EXISTS fund_source;
