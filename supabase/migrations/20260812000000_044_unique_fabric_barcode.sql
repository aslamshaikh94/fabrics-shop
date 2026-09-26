-- ===========================================
-- 044: Enforce barcode uniqueness on fabrics
-- ===========================================
-- Duplicate fabric NAMES are expected business data: the same fabric is often
-- bought again from a different supplier or in a new lot, so two rows can
-- legitimately carry the same name.
--
-- The BARCODE is what identifies a specific roll/lot, and the business treats
-- it as unique per fabric. This migration makes that a database guarantee
-- rather than an assumption, so the stock attribution in app/utils/soldMeters.js
-- can resolve a name-only sale to exactly one fabric by barcode.
--
-- Safe to run repeatedly.

-- 1. Normalise whitespace/case so ' ABC ' and 'abc' cannot both exist.
--    Barcodes are case-sensitive in some symbologies, but this app compares
--    them with an exact match, so normalising only ever merges rows that
--    could never be told apart anyway.
UPDATE fabrics
SET barcode = upper(btrim(barcode))
WHERE barcode IS NOT NULL
  AND barcode <> upper(btrim(barcode));

-- 2. Report any remaining duplicates BEFORE enforcing, so an operator can
--    resolve them. A NOTICE is non-fatal; the constraint below will still be
--    attempted.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(DISTINCT barcode, ', ')
  INTO dupes
  FROM fabrics
  WHERE barcode <> ''
  GROUP BY barcode
  HAVING count(*) > 1
  LIMIT 1;

  IF dupes IS NOT NULL THEN
    RAISE NOTICE
      '044: duplicate barcodes still present (e.g. %). Assign each a unique barcode, or blank the duplicates — the UNIQUE index below was NOT created.',
      dupes;
  END IF;
END $$;

-- 3. Only create the constraint when the data is already clean, so this
--    migration can never fail on a production database.
DO $$
DECLARE
  dupe_count integer;
BEGIN
  SELECT count(*) INTO dupe_count
  FROM (
    SELECT barcode FROM fabrics
    WHERE barcode <> ''
    GROUP BY barcode HAVING count(*) > 1
  ) d;

  IF dupe_count = 0 THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_fabrics_barcode_unique
             ON fabrics(barcode) WHERE barcode <> ''''';
    RAISE NOTICE '044: unique barcode index created.';
  ELSE
    RAISE NOTICE
      '044: skipped the unique barcode index — % duplicate barcode group(s) remain. Re-run this migration after fixing them.',
      dupe_count;
  END IF;
END $$;

-- ===========================================
-- Verification (run after applying):
--   SELECT barcode, count(*) FROM fabrics
--   WHERE barcode <> '' GROUP BY barcode HAVING count(*) > 1;
--   -- expect 0 rows
-- ===========================================
