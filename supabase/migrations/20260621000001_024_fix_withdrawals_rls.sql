/*
  # Fix withdrawals RLS policy to match other tables

  1. Changes
    - Replace the authenticated-only RLS policy with an "Allow all" policy
    - Consistent with all other tables in the app (suppliers, fabrics, purchases, etc.)

  2. Reason
    - The withdrawals table was created with auth.role() = 'authenticated' requirement
    - All other tables use USING (true) WITH CHECK (true) for internal access
    - This caused "Failed to save withdrawal" errors when adding/editing withdrawals
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Enable all for authenticated users" ON withdrawals;

-- Create new policy that allows all access (matching other tables)
CREATE POLICY "Allow all operations" ON withdrawals FOR ALL USING (true) WITH CHECK (true);