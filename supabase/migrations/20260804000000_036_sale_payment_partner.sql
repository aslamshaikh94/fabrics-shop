-- Track which partner's account each sale payment was credited to.
-- Partners are the account holders, so sale_payments link directly to partners.
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_payments_partner_id ON sale_payments(partner_id);