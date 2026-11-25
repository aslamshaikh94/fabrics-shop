CREATE TABLE IF NOT EXISTS public.purchase_fabric_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  fabric_id uuid REFERENCES public.fabrics(id) ON DELETE SET NULL,
  fabric_name text NOT NULL,
  meters numeric NOT NULL CHECK (meters > 0),
  purchase_price_per_meter numeric NOT NULL DEFAULT 0
    CHECK (purchase_price_per_meter >= 0),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  quantity text NOT NULL DEFAULT '',
  barcode text NOT NULL DEFAULT '',
  is_legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_fabric_receipts_purchase_id
  ON public.purchase_fabric_receipts(purchase_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_fabric_receipts_legacy_unique
  ON public.purchase_fabric_receipts(purchase_id, fabric_id)
  WHERE is_legacy AND fabric_id IS NOT NULL;

ALTER TABLE public.purchase_fabric_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated access" ON public.purchase_fabric_receipts;
CREATE POLICY "Authenticated access" ON public.purchase_fabric_receipts
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO public.purchase_fabric_receipts (
  purchase_id,
  fabric_id,
  fabric_name,
  meters,
  purchase_price_per_meter,
  discount_amount,
  quantity,
  barcode,
  is_legacy
)
SELECT
  f.purchase_id,
  f.id,
  f.name,
  f.total_meters,
  f.purchase_price_per_meter,
  0,
  f.quantity,
  f.barcode,
  true
FROM public.fabrics f
WHERE f.purchase_id IS NOT NULL
  AND f.total_meters > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.purchase_fabric_receipts r
    WHERE r.purchase_id = f.purchase_id
      AND r.fabric_id = f.id
      AND r.is_legacy
  )
ON CONFLICT (purchase_id, fabric_id)
  WHERE is_legacy AND fabric_id IS NOT NULL
DO NOTHING;

CREATE OR REPLACE FUNCTION public.add_fabrics_to_purchase(
  p_purchase_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_purchase_supplier_id uuid;
  v_purchase_date date;
  v_fabric_id uuid;
  v_fabric_name text;
  v_meters numeric;
  v_rate numeric;
  v_discount numeric;
  v_quantity text;
  v_barcode text;
  v_total_meters numeric;
  v_available_meters numeric;
  v_existing_rate numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'At least one fabric row is required';
  END IF;

  SELECT supplier_id, purchase_date
  INTO v_purchase_supplier_id, v_purchase_date
  FROM public.purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_fabric_name := btrim(COALESCE(v_row ->> 'fabric_name', ''));
    v_meters := NULLIF(v_row ->> 'total_meters', '')::numeric;
    v_rate := COALESCE(NULLIF(v_row ->> 'purchase_price_per_meter', '')::numeric, 0);
    v_discount := COALESCE(NULLIF(v_row ->> 'discount_amount', '')::numeric, 0);
    v_quantity := btrim(COALESCE(v_row ->> 'quantity', ''));
    v_barcode := btrim(COALESCE(v_row ->> 'barcode', ''));
    v_fabric_id := NULLIF(v_row ->> 'fabric_id', '')::uuid;

    IF v_fabric_name = '' THEN
      RAISE EXCEPTION 'Fabric name is required for every fabric row';
    END IF;
    IF v_meters IS NULL OR v_meters <= 0 THEN
      RAISE EXCEPTION 'Meters must be greater than zero for every fabric row';
    END IF;
    IF v_rate < 0 THEN
      RAISE EXCEPTION 'Buy price cannot be negative';
    END IF;
    IF v_discount < 0 OR v_discount > v_meters * v_rate THEN
      RAISE EXCEPTION 'Discount must be between zero and the fabric line total';
    END IF;

    IF v_fabric_id IS NOT NULL THEN
      SELECT total_meters, available_meters, purchase_price_per_meter
      INTO v_total_meters, v_available_meters, v_existing_rate
      FROM public.fabrics
      WHERE id = v_fabric_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected fabric no longer exists';
      END IF;

      UPDATE public.fabrics
      SET total_meters = COALESCE(v_total_meters, 0) + v_meters,
          available_meters = COALESCE(v_available_meters, 0) + v_meters,
          purchase_price_per_meter = CASE
            WHEN v_rate > 0 THEN v_rate
            ELSE v_existing_rate
          END,
          quantity = CASE WHEN v_quantity <> '' THEN v_quantity ELSE quantity END,
          barcode = CASE WHEN v_barcode <> '' THEN v_barcode ELSE barcode END,
          updated_at = now()
      WHERE id = v_fabric_id;
    ELSE
      INSERT INTO public.fabrics (
        name,
        purchase_price_per_meter,
        total_meters,
        available_meters,
        supplier_id,
        purchase_date,
        purchase_id,
        quantity,
        barcode
      )
      VALUES (
        v_fabric_name,
        v_rate,
        v_meters,
        v_meters,
        v_purchase_supplier_id,
        v_purchase_date,
        p_purchase_id,
        v_quantity,
        v_barcode
      )
      RETURNING id INTO v_fabric_id;
    END IF;

    INSERT INTO public.purchase_fabric_receipts (
      purchase_id,
      fabric_id,
      fabric_name,
      meters,
      purchase_price_per_meter,
      discount_amount,
      quantity,
      barcode
    )
    VALUES (
      p_purchase_id,
      v_fabric_id,
      v_fabric_name,
      v_meters,
      v_rate,
      v_discount,
      v_quantity,
      v_barcode
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_purchase_with_stock(
  p_purchase_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fabric_id uuid;
  v_meters numeric;
  v_total_meters numeric;
  v_available_meters numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  PERFORM 1
  FROM public.purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_fabric_receipts
    WHERE purchase_id = p_purchase_id
      AND is_legacy
  ) THEN
    RAISE EXCEPTION
      'This purchase has legacy stock records that cannot be safely reversed. Keep the purchase or reconcile its inventory first.';
  END IF;

  FOR v_fabric_id IN
    SELECT DISTINCT fabric_id
    FROM public.purchase_fabric_receipts
    WHERE purchase_id = p_purchase_id
      AND fabric_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(meters), 0)
    INTO v_meters
    FROM public.purchase_fabric_receipts
    WHERE purchase_id = p_purchase_id
      AND fabric_id = v_fabric_id;

    SELECT total_meters, available_meters
    INTO v_total_meters, v_available_meters
    FROM public.fabrics
    WHERE id = v_fabric_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF COALESCE(v_available_meters, 0) < v_meters
       OR COALESCE(v_total_meters, 0) < v_meters THEN
      RAISE EXCEPTION
        'Cannot delete this purchase because some received fabric has already been sold or its stock was changed.';
    END IF;

    UPDATE public.fabrics
    SET total_meters = v_total_meters - v_meters,
        available_meters = v_available_meters - v_meters,
        updated_at = now()
    WHERE id = v_fabric_id;
  END LOOP;

  DELETE FROM public.purchases
  WHERE id = p_purchase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_fabrics_to_purchase(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_purchase_with_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_fabrics_to_purchase(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_with_stock(uuid) TO authenticated;
