/*
  # Initial Schema — CRMS (Fabric Shop Management System)

  1. Tables
    - suppliers
    - fabrics
    - purchases
    - purchase_payments
    - customers
    - sales
    - sale_payments

  2. Triggers
    - Auto-update purchases.paid_amount and status on payment insert/update/delete
    - Auto-update sales.paid_amount and status on payment insert/update/delete

  3. RLS
    - Enabled on all tables (policies added in migration 002)
*/

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
