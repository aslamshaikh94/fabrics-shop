-- Add barcode column to fabrics for scanning support
ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS barcode text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_fabrics_barcode ON fabrics(barcode) WHERE barcode != '';
