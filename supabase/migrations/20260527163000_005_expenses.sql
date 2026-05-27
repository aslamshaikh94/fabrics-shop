/*
  # Expenses table

  1. Changes
    - Add expenses table to track shop operating costs
    - Enable RLS with open policy (consistent with other tables)

  2. Reason
    - Track rent, electricity, staff salary, transport and other expenses
    - Enables net profit calculation (sales margin - expenses)
*/

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Other' CHECK (category IN ('Rent', 'Electricity', 'Staff Salary', 'Transport', 'Packaging', 'Maintenance', 'Marketing', 'Other')),
  amount numeric NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON expenses FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
