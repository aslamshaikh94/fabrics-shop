-- Attribute an expense to the partner account that paid it.
--
-- When an expense is settled from an account (rather than a person's pocket), the
-- amount must come out of that account's balance — mirroring how a reinvested
-- supplier payment hits an account (purchase_payments.partner_id +
-- reinvested_amount).
--
-- Nullable on purpose: expenses paid out of pocket keep partner_id = NULL and
-- continue to use the existing paid_by / cleared reimbursement flow. So no
-- historical row changes meaning, and no balance moves retroactively.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_partner_id ON expenses(partner_id);