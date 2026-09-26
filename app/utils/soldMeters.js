/**
 * Attribute sold meters to fabrics, mirroring migration 041's SQL exactly.
 *
 * Why not just group by fabric_name: a sale recorded with a free-text name and
 * no fabric_id has to be matched by name, but two fabric rows can share a
 * name. If both matched, a single sale would be subtracted from BOTH rows and
 * the UI would under-report in-hand stock. Migration 041 guards this with
 * `nc.n = 1` (only use the name fallback for unique names) — this helper
 * applies the same guard so the Stock tab and the repaired available_meters
 * column can never disagree.
 *
 * Duplicate fabric NAMES are expected business data — the same fabric is bought
 * again from a different supplier, so two rows can legitimately share a name.
 * The BARCODE is what identifies a specific roll/lot, and it is unique per
 * fabric, so it is the disambiguator. Migration 044 enforces that uniqueness.
 *
 * Rules, in order:
 *   1. sales.fabric_id            → that fabric (authoritative; set by the
 *      barcode scanner and the inventory dropdown)
 *   2. sales.fabric_name matches a fabric's BARCODE → that fabric. This is
 *      exact and unambiguous, and also rescues rows where an unscanned barcode
 *      was stored into fabric_name.
 *   3. sales.fabric_name matches exactly one fabric NAME → that fabric
 *   4. otherwise unattributed → counted and surfaced, never guessed. Guessing
 *      here would double-subtract from every duplicate, under-reporting stock.
 *
 * Note the DB column fabrics.available_meters is maintained by the migration 041
 * trigger, which only reacts to sales.fabric_id. It therefore stays stale for
 * name-only sales by design; the Stock tab recomputes purchased − sold in JS
 * from these helpers instead, so it is always self-correcting.
 *
 * @param {Array} fabrics fabric rows (needs `id`, `name`, `barcode`)
 * @param {Array} sales   sale rows (needs `meters`, `fabric_id`, `fabric_name`)
 * @returns {{ soldByFabricId: Map<string, number>, unattributedMeters: number, unattributedCount: number }}
 */
const normName = (v) => String(v ?? "").trim().toLowerCase();
// Must match migration 044's `upper(btrim(barcode))` exactly. SaleForm stores
// the scanned code verbatim in fabric_name, so if this normalised differently
// from the database a scanned sale would stop matching its fabric after the
// migration and silently fall back to (ambiguous) name matching.
const normCode = (v) => String(v ?? "").trim().toUpperCase();

export function buildSoldMeters(fabrics, sales) {
  const fabricList = Array.isArray(fabrics) ? fabrics : [];
  const saleList = Array.isArray(sales) ? sales : [];

  // name -> how many fabric rows share it, and the id when that count is 1.
  const nameCount = new Map();
  const uniqueIdByName = new Map();
  // barcode -> id. Barcodes are unique per fabric (migration 044), so a hit
  // here is unambiguous even when several fabrics share a name.
  const idByBarcode = new Map();
  const knownIds = new Set();

  for (const f of fabricList) {
    if (f?.id) knownIds.add(f.id);
    const code = normCode(f?.barcode);
    if (code && f?.id && !idByBarcode.has(code)) idByBarcode.set(code, f.id);
    const key = normName(f?.name);
    if (!key) continue;
    const next = (nameCount.get(key) || 0) + 1;
    nameCount.set(key, next);
    if (next === 1 && f?.id) uniqueIdByName.set(key, f.id);
  }

  const soldByFabricId = new Map();
  const add = (id, meters) =>
    soldByFabricId.set(id, (soldByFabricId.get(id) || 0) + meters);

  let unattributedMeters = 0;
  let unattributedCount = 0;
  // Name-only sales that matched several duplicates, kept separate so the UI
  // can name the culprits instead of just reporting a vague total.
  const ambiguous = new Map();

  for (const s of saleList) {
    const meters = Number(s?.meters) || 0;
    if (!Number.isFinite(meters) || meters === 0) continue;

    if (s?.fabric_id) {
      // Dangling ids (fabric deleted) are ignored, matching the LEFT JOIN
      // from fabrics in the migration.
      if (knownIds.has(s.fabric_id)) add(s.fabric_id, meters);
      continue;
    }

    // Barcode is unique per fabric, so it resolves duplicates exactly.
    const code = normCode(s?.fabric_name);
    if (code && idByBarcode.has(code)) {
      add(idByBarcode.get(code), meters);
      continue;
    }

    const key = normName(s?.fabric_name);
    if (key && nameCount.get(key) === 1) {
      add(uniqueIdByName.get(key), meters);
      continue;
    }

    // Blank name, or a name shared by several fabrics. Applying it would
    // subtract from every duplicate and under-report stock, so surface it.
    unattributedMeters += meters;
    unattributedCount += 1;
    if (key) {
      const prev = ambiguous.get(key);
      if (prev) {
        prev.meters += meters;
        prev.count += 1;
      } else {
        ambiguous.set(key, {
          name: String(s?.fabric_name ?? "").trim(),
          meters,
          count: 1,
          candidates: nameCount.get(key) || 0,
        });
      }
    }
  }

  return {
    soldByFabricId,
    unattributedMeters,
    unattributedCount,
    ambiguousNames: [...ambiguous.values()].sort((a, b) => b.meters - a.meters),
  };
}