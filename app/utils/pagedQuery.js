import { supabase } from "../lib/supabase";

/**
 * Fetch ALL rows from a Supabase table, bypassing the default 1000-row
 * limit by paging with .range().
 *
 * The query MUST include a stable .order(...) — offset paging without one lets
 * Postgres return rows in a different order per page, which silently skips and
 * duplicates rows at the page boundary.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("sales").select("id, total_amount").order("id").range(from, to),
 *   );
 *
 * Returns a plain array of rows (NOT { data }). Throws on error.
 */
const PAGE = 1000;

export async function fetchAllRows(buildQuery, pageSize = PAGE) {
  const all = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from = to + 1;
  }
  return all;
}

/**
 * Like fetchAllRows, but retries with a reduced column list when the failure is
 * a MISSING COLUMN (PostgREST PGRST204 / 42703) rather than a real error.
 *
 * Needed because optional columns do not exist on every project — e.g.
 * sales.fabric_id (migration 023) and purchases.gst_* (migration 042). Without
 * this, selecting them fails the whole fetch and blanks the page instead of
 * degrading to the older shape.
 *
 * Never throws: any real failure is logged and returns `fallback`, so one bad
 * table can't take down a whole dashboard.
 *
 * Usage:
 *   const rows = await fetchAllRowsTolerant(
 *     "sales:meters", "sales",
 *     "meters, fabric_id, fabric_name",  // preferred
 *     "meters, fabric_name",             // used if the above is unavailable
 *   );
 */
export async function fetchAllRowsTolerant(
  label,
  table,
  fullCols,
  baseCols,
  fallback = [],
) {
  // ORDER BY is mandatory for offset paging: without a stable sort Postgres
  // may return rows in a different order on each page, silently skipping and
  // duplicating rows across page boundaries. Callers can't add this themselves
  // because the query is built here, so it must be built in.
  const build = (cols) => (from, to) =>
    supabase.from(table).select(cols).order("id").range(from, to);
  try {
    return await fetchAllRows(build(fullCols));
  } catch (e) {
    if (!isMissingColumnError(e) || !baseCols) {
      console.error(`Query failed [${label}]:`, describeErr(e));
      return fallback;
    }
    console.warn(
      `Query fallback [${label}]: ${fullCols} unavailable, retrying with ${baseCols}`,
    );
    try {
      return await fetchAllRows(build(baseCols));
    } catch (e2) {
      console.error(`Query failed [${label}:fallback]:`, describeErr(e2));
      return fallback;
    }
  }
}

/** True when a Supabase error means "that column does not exist". */
function isMissingColumnError(err) {
  const code = err?.code;
  if (code === "PGRST204" || code === "42703") return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    (msg.includes("column") && msg.includes("not found"))
  );
}

const describeErr = (e) => ({
  message: e?.message,
  details: e?.details,
  hint: e?.hint,
  code: e?.code,
  status: e?.status,
});
