-- ============================================================
-- CRMS - FABRIC SHOP MANAGEMENT SYSTEM
-- Complete Database Schema
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 001 - Initial Schema (tables, triggers, RLS)
-- ============================================================

-- suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- fabrics
CREATE TABLE IF NOT EXISTS fabrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  purchase_price_per_meter numeric NOT NULL DEFAULT 0,
  selling_price_per_meter numeric NOT NULL DEFAULT 0,
  total_meters numeric NOT NULL DEFAULT 0,
  available_meters numeric NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_date date DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- purchases
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  fabric_id uuid REFERENCES fabrics(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  remaining_amount numeric GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- purchase_payments
CREATE TABLE IF NOT EXISTS purchase_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'check', 'other')),
  reference_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  credit_limit numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- sales
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  fabric_id uuid REFERENCES fabrics(id) ON DELETE RESTRICT,
  meters numeric NOT NULL,
  price_per_meter numeric NOT NULL,
  total_amount numeric GENERATED ALWAYS AS (meters * price_per_meter) STORED,
  paid_amount numeric NOT NULL DEFAULT 0,
  remaining_amount numeric GENERATED ALWAYS AS ((meters * price_per_meter) - paid_amount) STORED,
  cost_price_per_meter numeric NOT NULL DEFAULT 0,
  margin numeric GENERATED ALWAYS AS (meters * (price_per_meter - cost_price_per_meter)) STORED,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_type text NOT NULL DEFAULT 'cash' CHECK (payment_type IN ('cash', 'credit', 'partial')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'partial')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- sale_payments
CREATE TABLE IF NOT EXISTS sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'check', 'other')),
  reference_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-update purchases.paid_amount and status
CREATE OR REPLACE FUNCTION update_purchase_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_id uuid;
BEGIN
  v_purchase_id := COALESCE(NEW.purchase_id, OLD.purchase_id);
  UPDATE purchases
  SET
    paid_amount = (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_id = v_purchase_id),
    status = CASE
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_id = v_purchase_id) <= 0 THEN 'pending'
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_id = v_purchase_id) >= total_amount THEN 'paid'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = v_purchase_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_purchase_paid
AFTER INSERT OR UPDATE OR DELETE ON purchase_payments
FOR EACH ROW EXECUTE FUNCTION update_purchase_paid_amount();

-- Trigger: auto-update sales.paid_amount and status
CREATE OR REPLACE FUNCTION update_sale_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_sale_id uuid;
BEGIN
  v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);
  UPDATE sales
  SET
    paid_amount = (SELECT COALESCE(SUM(amount), 0) FROM sale_payments WHERE sale_id = v_sale_id),
    status = CASE
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM sale_payments WHERE sale_id = v_sale_id) <= 0 THEN 'pending'
      WHEN (SELECT COALESCE(SUM(amount), 0) FROM sale_payments WHERE sale_id = v_sale_id) >= (SELECT meters * price_per_meter FROM sales WHERE id = v_sale_id) THEN 'completed'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = v_sale_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sale_paid
AFTER INSERT OR UPDATE OR DELETE ON sale_payments
FOR EACH ROW EXECUTE FUNCTION update_sale_paid_amount();

-- ============================================================
-- 002 - Fix RLS Policies
-- ============================================================

-- Enable authenticated users to read/write all tables
CREATE POLICY "Enable all for authenticated users" ON suppliers
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON fabrics
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON purchases
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON purchase_payments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON customers
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON sales
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated users" ON sale_payments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 003 - Remove fabric constraint
-- ============================================================
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_fabric_id_fkey;
ALTER TABLE sales ADD CONSTRAINT sales_fabric_id_fkey
  FOREIGN KEY (fabric_id) REFERENCES fabrics(id) ON DELETE SET NULL;

-- ============================================================
-- 004 - Indexes and cascade
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_fabrics_name ON fabrics(name);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON purchase_payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);

-- ============================================================
-- 005 - Expenses table
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON expenses
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ============================================================
-- 006 - Secure RLS policies
-- ============================================================
-- (Policies already created above)

-- ============================================================
-- 007 - User roles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON user_roles
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 008 - Role app_metadata
-- ============================================================
-- This is handled server-side via Supabase triggers or auth hooks

-- ============================================================
-- 009 - Purchase items (re-structure purchases to link items)
-- ============================================================
-- purchases table already supports fabric_id, adding purchase_items for multi-item support
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  fabric_id uuid REFERENCES fabrics(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  price_per_unit numeric NOT NULL DEFAULT 0,
  total_amount numeric GENERATED ALWAYS AS (quantity * price_per_unit) STORED,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON purchase_items
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 010 - Fabric barcode
-- ============================================================
ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS barcode text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_fabrics_barcode ON fabrics(barcode) WHERE barcode != '';

-- ============================================================
-- 011 - Purchase invoice_url
-- ============================================================
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_url text NOT NULL DEFAULT '';

-- ============================================================
-- 012 - Fabric stock trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_fabric_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE fabrics
  SET available_meters = available_meters - NEW.meters,
      updated_at = now()
  WHERE id = NEW.fabric_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_fabric_stock_on_sale
AFTER INSERT ON sales
FOR EACH ROW
WHEN (NEW.fabric_id IS NOT NULL)
EXECUTE FUNCTION update_fabric_stock_on_sale();

-- ============================================================
-- 013 - Expense paid_by
-- ============================================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by text NOT NULL DEFAULT '';

-- ============================================================
-- 014 - Expense payment_proof
-- ============================================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_proof_url text NOT NULL DEFAULT '';

-- ============================================================
-- 015 - Sale group id
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_group_id uuid DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_sales_sale_group_id ON sales(sale_group_id);

-- ============================================================
-- 016 - Fabric quantity
-- ============================================================
ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS quantity text NOT NULL DEFAULT '';

-- ============================================================
-- 017 - Sales invoice_url
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_url text NOT NULL DEFAULT '';

-- ============================================================
-- 021 - Purchase number (auto-generated)
-- ============================================================
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_number text;

-- Function to auto-generate sequential purchase number
CREATE OR REPLACE FUNCTION generate_purchase_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num integer;
BEGIN
  next_num := COALESCE(
    (SELECT MAX(CAST(SUBSTRING(purchase_number FROM 5) AS integer)) FROM purchases WHERE purchase_number ~ '^PUR-\d+$'),
    0
  ) + 1;
  NEW.purchase_number := 'PUR-' || LPAD(next_num::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_purchase_number ON purchases;
CREATE TRIGGER trigger_generate_purchase_number
BEFORE INSERT ON purchases
FOR EACH ROW
WHEN (NEW.purchase_number IS NULL OR NEW.purchase_number = '')
EXECUTE FUNCTION generate_purchase_number();

-- Generate purchase numbers for existing records that don't have one
UPDATE purchases
SET purchase_number = sub.purchase_number
FROM (
  SELECT id, 'PUR-' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::text, 5, '0') AS purchase_number
  FROM purchases
  WHERE purchase_number IS NULL
) sub
WHERE purchases.id = sub.id;

-- ============================================================
-- 023 - Add customer_name and fabric_name to sales table
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fabric_name text NOT NULL DEFAULT '';

-- Backfill fabric_name from notes
UPDATE sales
SET fabric_name = COALESCE(
  NULLIF(TRIM(SUBSTRING(notes FROM 'Fabric:\s*([^(\n|]+)')), ''),
  ''
)
WHERE fabric_name = '' AND notes LIKE 'Fabric:%';

-- Backfill customer_name for existing customers
UPDATE sales
SET customer_name = COALESCE(customers.name, '')
FROM customers
WHERE sales.customer_id = customers.id
  AND sales.customer_name = '';

-- Backfill customer_name for walk-in
UPDATE sales
SET customer_name = COALESCE(
  NULLIF(TRIM(SUBSTRING(notes FROM 'Name:\s*([^)]+)')), ''),
  ''
)
WHERE sales.customer_id IS NULL
  AND sales.customer_name = ''
  AND notes LIKE '%(Name:%';

CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON sales(customer_name);
CREATE INDEX IF NOT EXISTS idx_sales_fabric_name ON sales(fabric_name);

-- ============================================================
-- 027 - Discount feature for sales (flat amount)
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

-- Safely drop generated expressions only if they are still generated columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'total_amount' 
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE sales ALTER COLUMN total_amount DROP EXPRESSION;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'remaining_amount' 
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE sales ALTER COLUMN remaining_amount DROP EXPRESSION;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'margin' 
    AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE sales ALTER COLUMN margin DROP EXPRESSION;
  END IF;
END $$;

-- Set default values to 0 so INSERT works
ALTER TABLE sales ALTER COLUMN total_amount SET DEFAULT 0;
ALTER TABLE sales ALTER COLUMN remaining_amount SET DEFAULT 0;
ALTER TABLE sales ALTER COLUMN margin SET DEFAULT 0;

-- Keep NOT NULL constraints
ALTER TABLE sales ALTER COLUMN total_amount SET NOT NULL;
ALTER TABLE sales ALTER COLUMN remaining_amount SET NOT NULL;
ALTER TABLE sales ALTER COLUMN margin SET NOT NULL;

-- Create BEFORE INSERT trigger to auto-calculate these columns
CREATE OR REPLACE FUNCTION calculate_sale_amounts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_amount := GREATEST(NEW.meters * NEW.price_per_meter - COALESCE(NEW.discount_amount, 0), 0);
  NEW.margin := GREATEST(NEW.meters * (NEW.price_per_meter - NEW.cost_price_per_meter) - COALESCE(NEW.discount_amount, 0), 0);
  NEW.remaining_amount := GREATEST(NEW.total_amount - NEW.paid_amount, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_sale_amounts ON sales;
CREATE TRIGGER trigger_calculate_sale_amounts
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION calculate_sale_amounts();

-- Update existing data (discount_amount defaults to 0 so no change for existing records)
UPDATE sales SET
  total_amount = GREATEST(meters * price_per_meter - COALESCE(discount_amount, 0), 0),
  margin = GREATEST(meters * (price_per_meter - cost_price_per_meter) - COALESCE(discount_amount, 0), 0),
  remaining_amount = GREATEST(meters * price_per_meter - COALESCE(discount_amount, 0) - paid_amount, 0);

-- Update trigger: auto-update sales.paid_amount, total_amount, margin, status when payments change
-- Also sync customer current_balance
CREATE OR REPLACE FUNCTION update_sale_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_sale_id uuid;
  v_customer_id uuid;
  v_paid numeric;
  v_discounted_total numeric;
  v_margin_val numeric;
BEGIN
  v_sale_id := COALESCE(NEW.sale_id, OLD.sale_id);

  SELECT 
    COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_id = v_sale_id), 0),
    GREATEST(s.meters * s.price_per_meter - COALESCE(s.discount_amount, 0), 0),
    GREATEST(s.meters * (s.price_per_meter - s.cost_price_per_meter) - COALESCE(s.discount_amount, 0), 0),
    s.customer_id
  INTO v_paid, v_discounted_total, v_margin_val, v_customer_id
  FROM sales s WHERE id = v_sale_id;

  UPDATE sales
  SET
    paid_amount = v_paid,
    total_amount = v_discounted_total,
    margin = v_margin_val,
    remaining_amount = GREATEST(v_discounted_total - v_paid, 0),
    status = CASE
      WHEN v_paid <= 0 THEN 'pending'
      WHEN v_paid >= v_discounted_total THEN 'completed'
      ELSE 'partial'
    END,
    updated_at = now()
  WHERE id = v_sale_id;

  -- Sync customer current_balance
  IF v_customer_id IS NOT NULL THEN
    UPDATE customers
    SET current_balance = (
      SELECT COALESCE(SUM(remaining_amount), 0)
      FROM sales
      WHERE customer_id = v_customer_id
    ),
    updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- One-time sync: update all customers' current_balance based on current remaining_amount
UPDATE customers c
SET current_balance = (
  SELECT COALESCE(SUM(remaining_amount), 0)
  FROM sales
  WHERE customer_id = c.id
),
updated_at = now();
