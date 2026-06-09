-- Add purchase_group_id to purchases table for multi-item purchase support
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_group_id uuid DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_group_id ON purchases(purchase_group_id);

-- Also add individual item fields that were missing
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS meters numeric NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS price_per_unit numeric NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS fabric_name text NOT NULL DEFAULT '';

-- Add a check constraint for valid payment status if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchases_status_check'
  ) THEN
    ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
    CHECK (status IN ('pending', 'partial', 'paid'));
  END IF;
END $$;