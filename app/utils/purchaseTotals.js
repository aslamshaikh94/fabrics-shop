/**
 * Purchase invoice breakdown helpers.
 *
 * Model (migration 042):
 *   fabric_amount  = value of the fabrics on the invoice
 *   other_charges  = freight, packing, etc.
 *   gst_rate       = GST % applied to (fabric_amount + other_charges)
 *   gst_amount     = ROUND(rate/100 × (fabric_amount + other_charges), 2)
 *   total_amount   = fabric_amount + other_charges + gst_amount
 *                    (the amount payable to the supplier)
 *
 * Inventory valuation is deliberately NOT derived from these invoice-level
 * fields — stock is valued at each fabric's own buying price.
 */

// Default GST rate for fabric purchases (standard rate).
export const DEFAULT_GST_RATE = "5";

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function purchaseBreakdown(fabricAmount, otherCharges, gstRate) {
  const base = round2((Number(fabricAmount) || 0) + (Number(otherCharges) || 0));
  const gstAmount = round2((base * (Number(gstRate) || 0)) / 100);
  return { base, gstAmount, total: round2(base + gstAmount) };
}

/** Amount owed to the supplier for a purchase row (total_amount is authoritative). */
export function purchaseTotalOf(purchase) {
  const stored = Number(purchase?.total_amount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return purchaseBreakdown(
    purchase?.fabric_amount,
    purchase?.other_charges,
    purchase?.gst_rate,
  ).total;
}
