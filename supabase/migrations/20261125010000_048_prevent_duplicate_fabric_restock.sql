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
  v_name_key text;
  v_meters numeric;
  v_rate numeric;
  v_discount numeric;
  v_quantity text;
  v_barcode text;
  v_total_meters numeric;
  v_available_meters numeric;
  v_existing_rate numeric;
  v_existing_name text;
  v_match_count integer;
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

    IF v_fabric_id IS NULL THEN
      v_name_key := lower(
        regexp_replace(btrim(v_fabric_name), '[[:space:]]+', ' ', 'g')
      );
      PERFORM pg_advisory_xact_lock(hashtextextended(v_name_key, 0));

      IF v_barcode <> '' THEN
        SELECT COUNT(*)
        INTO v_match_count
        FROM public.fabrics
        WHERE lower(btrim(barcode)) = lower(v_barcode);

        IF v_match_count > 1 THEN
          RAISE EXCEPTION 'Barcode matches multiple fabric records';
        ELSIF v_match_count = 1 THEN
          SELECT id, name
          INTO v_fabric_id, v_existing_name
          FROM public.fabrics
          WHERE lower(btrim(barcode)) = lower(v_barcode)
          FOR UPDATE;

          IF lower(regexp_replace(btrim(v_existing_name), '[[:space:]]+', ' ', 'g'))
             <> v_name_key THEN
            RAISE EXCEPTION
              'Barcode belongs to "%", not "%"', v_existing_name, v_fabric_name;
          END IF;
        END IF;
      END IF;

      IF v_fabric_id IS NULL THEN
        SELECT COUNT(*)
        INTO v_match_count
        FROM (
          SELECT id
          FROM public.fabrics
          WHERE lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
                = v_name_key
          LIMIT 2
        ) AS name_matches;

        IF v_match_count > 1 THEN
          RAISE EXCEPTION
            '"%" matches multiple fabrics. Select the intended fabric or include its barcode.',
            v_fabric_name;
        ELSIF v_match_count = 1 THEN
          SELECT id, name
          INTO v_fabric_id, v_existing_name
          FROM public.fabrics
          WHERE lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
                = v_name_key
          ORDER BY id
          LIMIT 1
          FOR UPDATE;
        END IF;
      END IF;
    END IF;

    IF v_fabric_id IS NOT NULL THEN
      SELECT name, total_meters, available_meters, purchase_price_per_meter
      INTO v_existing_name, v_total_meters, v_available_meters, v_existing_rate
      FROM public.fabrics
      WHERE id = v_fabric_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected fabric no longer exists';
      END IF;

      v_fabric_name := v_existing_name;
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
