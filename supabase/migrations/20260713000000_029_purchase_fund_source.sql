-- Add fund_source to purchases: 'fresh' (new capital) or 'reinvested' (from collected sales)
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS fund_source TEXT NOT NULL DEFAULT 'fresh'
  CHECK (fund_source IN ('fresh', 'reinvested'));
