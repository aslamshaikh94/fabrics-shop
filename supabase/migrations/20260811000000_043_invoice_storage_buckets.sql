/*
  # Storage buckets for invoice / bill attachments

  The app uploads to three buckets:
    - purchase-invoices (Purchases.jsx)
    - sales-invoices    (SaleForm.jsx, SaleDetailsModal.jsx)
    - expense-proofs    (Expenses.jsx — also created in migration 014)

  Without these rows in storage.buckets, uploads fail — and Supabase
  reports it misleadingly as `StorageApiError: new row violates row-level
  security policy` (403 AccessDenied) rather than "Bucket not found".
  The storage.objects policies are recreated here too, because that RLS
  error can also mean the policies themselves are absent.

  Safe to re-run (idempotent).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('purchase-invoices', 'purchase-invoices', true),
  ('sales-invoices', 'sales-invoices', true),
  ('expense-proofs', 'expense-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Buckets created by an earlier run may predate this migration; make sure
-- they are public, otherwise getPublicUrl() returns a non-working link.
UPDATE storage.buckets
SET public = true
WHERE id IN ('purchase-invoices', 'sales-invoices', 'expense-proofs')
  AND public = false;

-- Remove the blanket policy from migration 014. It was `FOR ALL USING (true)
-- WITH CHECK (true)` on storage.objects — i.e. anyone, including logged-out
-- visitors, could READ *and WRITE* every object in every bucket on the project.
-- The scoped policies below replace it. Kept here so re-running 043 also
-- hardens a database that already has 014 applied.
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Object-level policies. Reads are public (invoice links are shared over
-- WhatsApp etc.); writes require a signed-in user, matching the rest of the
-- app's RLS. Without these, every upload fails with the RLS error above.
-- Each policy is scoped to the three invoice buckets so unrelated buckets
-- (and anything added later) are never affected.
DROP POLICY IF EXISTS "Public read invoice objects" ON storage.objects;
CREATE POLICY "Public read invoice objects"
  ON storage.objects FOR SELECT
  USING (
    bucket_id IN ('purchase-invoices', 'sales-invoices', 'expense-proofs')
  );

DROP POLICY IF EXISTS "Authenticated upload invoice objects" ON storage.objects;
CREATE POLICY "Authenticated upload invoice objects"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('purchase-invoices', 'sales-invoices', 'expense-proofs')
              AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated update invoice objects" ON storage.objects;
CREATE POLICY "Authenticated update invoice objects"
  ON storage.objects FOR UPDATE
  USING (bucket_id IN ('purchase-invoices', 'sales-invoices', 'expense-proofs')
         AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id IN ('purchase-invoices', 'sales-invoices', 'expense-proofs')
              AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete invoice objects" ON storage.objects;
CREATE POLICY "Authenticated delete invoice objects"
  ON storage.objects FOR DELETE
  USING (bucket_id IN ('purchase-invoices', 'sales-invoices', 'expense-proofs')
         AND auth.role() = 'authenticated');
