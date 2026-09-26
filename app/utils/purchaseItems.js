/**
 * `purchase_items` is a legacy invoice-lines table that predates the current
 * `fabrics.purchase_id` link, and is absent (or RLS-hidden) on some projects.
 *
 * Every screen that shows "fabrics on this purchase" needs the same two things:
 * decide whether a failed `purchase_items` query is benign, and reshape any
 * rows that did come back into the fabric shape the UI renders. Both live here
 * so the three call sites in Purchases.jsx can't drift apart.
 */

/**
 * True when a `purchase_items` failure should be ignored rather than surfaced.
 *
 * PGRST205 (table not in schema cache), 42P01 (undefined table) and 42501
 * (insufficient privilege) all mean "this deployment has no usable
 * purchase_items" — the fabrics list alone is still correct.
 */
export function isPurchaseItemsUnavailable(error) {
  if (!error) return false;
  const msg = String(error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42501" ||
    msg.includes("purchase_items") ||
    msg.includes("permission") ||
    msg.includes("policy")
  );
}

/**
 * Reshape legacy `purchase_items` rows into the fabric shape the UI renders.
 * Returns [] when the query failed or returned nothing.
 */
export function toLegacyFabrics(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: `purchase-item-${item.id}`,
    name: item.description || "Fabric item",
    total_meters: Number(item.meters) || 0,
    purchase_price_per_meter: Number(item.rate) || 0,
    quantity: "",
    barcode: item.hsn ? `HSN: ${item.hsn}` : "",
    legacy: true,
  }));
}

/** Combine live fabric rows with any legacy invoice lines, fabrics first. */
export function mergePurchaseFabrics(fabrics, items) {
  return [...(fabrics || []), ...toLegacyFabrics(items)];
}