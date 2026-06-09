-- Add purchase_id to fabrics to link fabrics to purchase records
ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fabrics_purchase_id ON fabrics(purchase_id);