-- Cash deposits into partner accounts.
-- Collected cash from sales is deposited periodically (weekly/monthly) into a
-- partner's account; the transfer itself can be cash or a UPI payment.
CREATE TABLE IF NOT EXISTS cash_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  deposit_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'upi')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_deposits ENABLE ROW LEVEL SECURITY;

-- Idempotent: safe to re-run this migration without a "policy already exists" error.
DROP POLICY IF EXISTS "Enable all for authenticated users" ON cash_deposits;
CREATE POLICY "Enable all for authenticated users" ON cash_deposits
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_cash_deposits_partner_date ON cash_deposits(partner_id, deposit_date);