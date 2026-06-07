/*
  # Add invoice_url column to sales table
  This allows attaching invoices/bills to sales transactions (like purchases already has)
*/

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS invoice_url text NOT NULL DEFAULT '';