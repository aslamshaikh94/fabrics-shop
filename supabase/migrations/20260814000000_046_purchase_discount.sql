-- Purchase-level flat discount is deducted after GST from the supplier payable.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_discount_amount_check'
      AND conrelid = 'purchases'::regclass
  ) THEN
    ALTER TABLE purchases
      ADD CONSTRAINT purchases_discount_amount_check
      CHECK (
        discount_amount >= 0
        AND discount_amount <= fabric_amount + other_charges + gst_amount
      );
  END IF;
END;
$$;
