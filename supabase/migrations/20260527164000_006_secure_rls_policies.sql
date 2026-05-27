/*
  # Secure RLS policies — require authentication

  Replaces the open "Allow all operations" policies (USING (true)) with
  policies that require a valid Supabase Auth session.
*/

-- Drop open policies
DROP POLICY IF EXISTS "Allow all operations" ON suppliers;
DROP POLICY IF EXISTS "Allow all operations" ON fabrics;
DROP POLICY IF EXISTS "Allow all operations" ON purchases;
DROP POLICY IF EXISTS "Allow all operations" ON purchase_payments;
DROP POLICY IF EXISTS "Allow all operations" ON customers;
DROP POLICY IF EXISTS "Allow all operations" ON sales;
DROP POLICY IF EXISTS "Allow all operations" ON sale_payments;
DROP POLICY IF EXISTS "Allow all operations" ON expenses;

-- Authenticated-only policies
CREATE POLICY "Authenticated access" ON suppliers       FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated access" ON fabrics         FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated access" ON purchases       FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated access" ON purchase_payments FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated access" ON customers       FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated access" ON sales           FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated access" ON sale_payments   FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated access" ON expenses        FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
