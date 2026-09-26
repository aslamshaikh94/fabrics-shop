/*
  #41 - Repair fabric stock (available_meters)

  Problem
  -------
  fabrics.available_meters drifted from reality (e.g. 3081.8m "in stock"
  against only 2140.8m ever purchased). Causes:

    1. Sales often carry fabric_name but no fabric_id (manual entry in
       SaleForm), so the stock trigger never decremented them.
    2. Restocking / manual edits rewrite the column from its already-wrong
       value, so the drift compounds.
    3. The column is read directly by the Fabrics page, Low Stock alerts and
       the Purchases restock preview, so the wrong numbers stay visible there
       even though Reports/Dashboard now derive stock from purchases − sales.

  Fix
  ---
  Recompute available_meters as the truth:  total_meters − meters sold,
  matching sales by fabric_id first and falling back to fabric_name
  (case-insensitive, trimmed) for rows that have no fabric_id.

  Also re-asserts the stock trigger (same behaviour as migration 012) so the
  live function is deterministic even if supabase/fix_stock_mismatch.sql was
  ever run manually.

  Safety
  ------
  Every changed row is written to fabric_stock_repair_log first (old + new
  values), so section 3 can restore the previous numbers exactly.
  No rows are deleted, no other table is touched, and the column is clamped
  between 0 and total_meters.

  Safe to re-run (idempotent).
*/

-- ============================================
-- 2. SNAPSHOT (rollback safety net) + REPAIR
--    Every changed row is logged first, so section 3 can undo it exactly.
-- ============================================
CREATE TABLE IF NOT EXISTS fabric_stock_repair_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fabric_id uuid NOT NULL,
  fabric_name text,
  total_meters numeric,
  sold_meters numeric,
  old_available numeric,
  new_available numeric,
  changed_at timestamptz DEFAULT now()
);

-- Audit table: lock it down like the rest of the schema (not readable with the
-- anon key, but still writable/readable from the SQL editor as owner).
ALTER TABLE fabric_stock_repair_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON fabric_stock_repair_log;
CREATE POLICY "Enable all for authenticated users" ON fabric_stock_repair_log
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

WITH name_counts AS (
  -- Only use the fabric_name fallback for UNIQUE names, so duplicate fabric
  -- rows don't each subtract the same sale.
  SELECT lower(btrim(name)) AS name_key, count(*) AS n
  FROM fabrics
  GROUP BY 1
),
sold AS (
  SELECT
    f.id AS fabric_id,
    COALESCE(SUM(s.meters), 0) AS sold_meters
  FROM fabrics f
  LEFT JOIN name_counts nc
    ON nc.name_key = lower(btrim(COALESCE(f.name, '')))
  LEFT JOIN sales s
    ON (
         s.fabric_id = f.id
         OR (
           s.fabric_id IS NULL
           AND COALESCE(s.fabric_name, '') <> ''
           AND lower(btrim(COALESCE(s.fabric_name, ''))) =
               lower(btrim(COALESCE(f.name, '')))
           AND nc.n = 1
         )
       )
  GROUP BY f.id
)
INSERT INTO fabric_stock_repair_log (
  fabric_id, fabric_name, total_meters, sold_meters, old_available, new_available
)
SELECT
  f.id,
  f.name,
  f.total_meters,
  sold.sold_meters,
  f.available_meters,
  GREATEST(0, LEAST(f.total_meters, f.total_meters - COALESCE(sold.sold_meters, 0)))
FROM fabrics f
JOIN sold ON sold.fabric_id = f.id
WHERE f.available_meters <> GREATEST(
        0,
        LEAST(f.total_meters, f.total_meters - COALESCE(sold.sold_meters, 0))
      );

WITH name_counts AS (
  SELECT lower(btrim(name)) AS name_key, count(*) AS n
  FROM fabrics
  GROUP BY 1
),
sold AS (
  SELECT
    f.id AS fabric_id,
    COALESCE(SUM(s.meters), 0) AS sold_meters
  FROM fabrics f
  LEFT JOIN name_counts nc
    ON nc.name_key = lower(btrim(COALESCE(f.name, '')))
  LEFT JOIN sales s
    ON (
         s.fabric_id = f.id
         OR (
           s.fabric_id IS NULL
           AND COALESCE(s.fabric_name, '') <> ''
           AND lower(btrim(COALESCE(s.fabric_name, ''))) =
               lower(btrim(COALESCE(f.name, '')))
           AND nc.n = 1
         )
       )
  GROUP BY f.id
)
UPDATE fabrics f
SET available_meters = GREATEST(
      0,
      LEAST(f.total_meters, f.total_meters - COALESCE(sold.sold_meters, 0))
    ),
    updated_at = now()
FROM sold
WHERE sold.fabric_id = f.id
  AND f.available_meters <> GREATEST(
        0,
        LEAST(f.total_meters, f.total_meters - COALESCE(sold.sold_meters, 0))
      );

-- ============================================
-- 3. ROLLBACK (only if you want to undo)
--    Restores the exact previous available_meters values.
-- ============================================
-- UPDATE fabrics f
-- SET available_meters = l.old_available, updated_at = now()
-- FROM fabric_stock_repair_log l
-- WHERE l.fabric_id = f.id
--   AND f.available_meters = l.new_available;

-- ============================================
-- 4. Trigger: keep stock in sync going forward
--    Behaviour matches migration 012 (capped restore) so the DB is
--    deterministic even if supabase/fix_stock_mismatch.sql was ever run
--    manually. The LEAST(total_meters, ...) guard is intentional: it stops
--    available_meters ever exceeding total_meters (stock above purchases).
-- ============================================
CREATE OR REPLACE FUNCTION update_fabric_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.fabric_id IS NOT NULL
       AND NEW.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics
      SET available_meters = GREATEST(0, available_meters - NEW.meters),
          updated_at = now()
      WHERE id = NEW.fabric_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.fabric_id IS NOT NULL
       AND OLD.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics
      SET available_meters = LEAST(total_meters, available_meters + OLD.meters),
          updated_at = now()
      WHERE id = OLD.fabric_id;
    END IF;
    IF NEW.fabric_id IS NOT NULL
       AND NEW.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics
      SET available_meters = GREATEST(0, available_meters - NEW.meters),
          updated_at = now()
      WHERE id = NEW.fabric_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.fabric_id IS NOT NULL
       AND OLD.fabric_id != '00000000-0000-0000-0000-000000000000'::uuid THEN
      UPDATE fabrics
      SET available_meters = LEAST(total_meters, available_meters + OLD.meters),
          updated_at = now()
      WHERE id = OLD.fabric_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_fabric_stock ON sales;
CREATE TRIGGER trigger_update_fabric_stock
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION update_fabric_stock();

-- ============================================
-- 5. POST-CHECK — should return no rows
-- ============================================
-- SELECT name, total_meters, available_meters
-- FROM fabrics
-- WHERE available_meters < 0 OR available_meters > total_meters;

-- Rows changed by section 2 (keep this output as your audit trail):
-- SELECT fabric_name, total_meters, sold_meters, old_available, new_available, changed_at
-- FROM fabric_stock_repair_log
-- ORDER BY ABS(old_available - new_available) DESC;
