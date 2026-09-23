-- Track which partner's account a purchase payment was made from.
-- Purchase payments can come from a partner account (e.g., Heena Bano), so
-- purchase_payments links directly to partners as the source account holder.
ALTER TABLE purchase_payments ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_payments_partner_id ON purchase_payments(partner_id);