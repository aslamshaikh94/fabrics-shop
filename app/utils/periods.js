import { supabase } from "../lib/supabase";

/**
 * Period/date helpers shared by Dashboard, Reports and Partners.
 */

/**
 * Net revenue of a sale row: total_amount is stored PRE-discount
 * (meters × price_per_meter) and discount_amount separately, so any
 * revenue figure must net the two. Sales.margin is already netted.
 */
export function netSaleAmount(sale) {
  return (sale.total_amount || 0) - (sale.discount_amount || 0);
}

/** "YYYY-MM" for a Date — the key used for month filters/buckets. */
export function monthKeyOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" for the current month. */
export function currentMonthKey() {
  return monthKeyOf(new Date());
}

/**
 * Years from the first sale's year up to the current year, newest first.
 * Pass `null` when there are no sales yet (falls back to [currentYear]).
 */
export function buildYearRange(firstSaleDate) {
  const firstYear = firstSaleDate
    ? new Date(firstSaleDate).getFullYear()
    : new Date().getFullYear();
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = firstYear; y <= currentYear; y++) years.push(y);
  return years.reverse();
}

/**
 * Years that have sales data, up to the current year, newest first.
 * Replaces the identical fetchYears block in Reports and Partners.
 */
export async function getAvailableYears() {
  const { data } = await supabase
    .from("sales")
    .select("sale_date")
    .order("sale_date", { ascending: true })
    .limit(1);
  return buildYearRange(data?.length ? data[0].sale_date : null);
}
