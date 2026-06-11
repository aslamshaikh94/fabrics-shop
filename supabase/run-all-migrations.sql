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
