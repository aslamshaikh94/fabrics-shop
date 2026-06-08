/*
  # Withdrawals table

  1. New Tables
    - `withdrawals` — Track owner/partner withdrawals from the business
      - `id` (uuid, primary key)
      - `amount` (numeric, must be > 0)
      - `withdrawal_date` (date)
      - `withdrawn_by` (text) — who withdrew
      - `reason` (text) — purpose/notes
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow all authenticated users (consistent with other tables)
*/

CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL CHECK (amount > 0),
  withdrawal_date date NOT NULL DEFAULT CURRENT_DATE,
  withdrawn_by text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON withdrawals
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_withdrawals_date ON withdrawals(withdrawal_date);