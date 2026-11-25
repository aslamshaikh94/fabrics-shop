/**
 * `purchase_items` is an optional legacy invoice-lines table. Receipt rows and
 * any legacy lines are reshaped here for the purchase details UI.
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

export function toPurchaseReceiptFabrics(receipts) {
  if (!Array.isArray(receipts)) return [];
  return receipts.map((receipt) => ({
    id: `receipt-${receipt.id}`,
    name: receipt.fabric_name || "Fabric item",
    total_meters: Number(receipt.meters) || 0,
    purchase_price_per_meter:
      Number(receipt.purchase_price_per_meter) || 0,
    discount_amount: Number(receipt.discount_amount) || 0,
    quantity: receipt.quantity || "",
    barcode: receipt.barcode || "",
    receipt: true,
    legacyReceipt: Boolean(receipt.is_legacy),
  }));
}

/** Combine received fabric lines with any legacy invoice lines. */
export function mergePurchaseFabrics(receipts, items) {
  return [...(receipts || []), ...toLegacyFabrics(items)];
}