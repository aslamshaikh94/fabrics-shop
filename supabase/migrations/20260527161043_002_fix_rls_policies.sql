/*
  # Fix RLS policies for internal use

  1. Changes
    - Remove authentication requirement from all RLS policies
    - Allow all operations without authentication for internal use

  2. Reason
    - This is an internal tool without user authentication
    - Data should be accessible for inventory management
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON suppliers;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON fabrics;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON purchases;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON purchase_payments;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON customers;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON sales;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON sale_payments;

-- Create new policies that allow all access (for internal use)
CREATE POLICY "Allow all operations" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON fabrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON purchase_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations" ON sale_payments FOR ALL USING (true) WITH CHECK (true);