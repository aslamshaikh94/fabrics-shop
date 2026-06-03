-- Add invoice_url column to purchases for bill attachments
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_url text NOT NULL DEFAULT '';
