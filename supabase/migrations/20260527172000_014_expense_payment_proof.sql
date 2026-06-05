/*
  # Add payment_proof_url to expenses table

  1. Changes
    - Add payment_proof_url column to expenses table
    - Create storage bucket for expense payment proofs
*/

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_proof_url text NOT NULL DEFAULT '';

-- Create storage bucket for expense payment proofs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('expense-proofs', 'expense-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to expense-proofs bucket
CREATE POLICY "Public Access" ON storage.objects FOR ALL USING (true) WITH CHECK (true);