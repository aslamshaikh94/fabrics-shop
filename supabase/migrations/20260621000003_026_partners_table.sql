/*
  # Partners table — Dynamic partner management

  1. New Tables
    - `partners` — Manage business partners with dynamic share percentages
      - `id` (uuid, primary key)
      - `name` (text, not null) — Partner name
      - `share_percentage` (numeric, not null, default 50) — Share percentage (e.g., 50 for 50%)
      - `is_active` (boolean, default true) — Soft delete / active status
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow all authenticated users (consistent with other tables)
*/

CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  share_percentage numeric NOT NULL DEFAULT 50 CHECK (share_percentage > 0 AND share_percentage <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON partners
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(is_active);