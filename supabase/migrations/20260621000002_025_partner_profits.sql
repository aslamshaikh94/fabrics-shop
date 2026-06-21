/*
  # Partner Profits — 50/50 Share Tracking

  1. New Tables
    - `partner_profits` — Monthly profit snapshot with partner share calculations
      - `id` (uuid, primary key)
      - `year` (integer)
      - `month` (integer, 1-12)
      - `total_sales` (numeric) — monthly sales revenue
      - `gross_profit` (numeric) — monthly sales margin
      - `total_expenses` (numeric) — monthly expenses
      - `net_profit` (numeric) — gross_profit - total_expenses
      - `partner1_share` (numeric) — 50% of net profit
      - `partner2_share` (numeric) — 50% of net profit
      - `partner1_withdrawn` (numeric) — total withdrawals by partner1
      - `partner2_withdrawn` (numeric) — total withdrawals by partner2
      - `partner1_balance` (numeric) — share - withdrawn
      - `partner2_balance` (numeric) — share - withdrawn
      - `calculated_at` (timestamptz) — when snapshot was calculated
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow all authenticated users (consistent with other tables)
*/

CREATE TABLE IF NOT EXISTS partner_profits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  total_sales numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  total_expenses numeric NOT NULL DEFAULT 0,
  net_profit numeric NOT NULL DEFAULT 0,
  partner1_share numeric NOT NULL DEFAULT 0,
  partner2_share numeric NOT NULL DEFAULT 0,
  partner1_withdrawn numeric NOT NULL DEFAULT 0,
  partner2_withdrawn numeric NOT NULL DEFAULT 0,
  partner1_balance numeric NOT NULL DEFAULT 0,
  partner2_balance numeric NOT NULL DEFAULT 0,
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (year, month)
);

ALTER TABLE partner_profits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON partner_profits
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_partner_profits_year_month ON partner_profits(year, month);