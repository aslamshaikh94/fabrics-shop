export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/**
 * Format a sale's customer name, handling both existing and walk-in customers.
 * Walk-in names are stored in sale.customer_name column.
 */
export function formatCustomerName(saleOrGroup) {
  if (!saleOrGroup) return "Walk-in";

  // If they have a customer object with a name, use it
  if (saleOrGroup.customer?.name) return saleOrGroup.customer.name;

  // Walk-in: try customer_name field from the first item or group
  const name =
    saleOrGroup.items?.[0]?.customer_name || saleOrGroup.customer_name || "";
  if (name) return name;

  // Legacy fallback: try to extract from notes
  if (!saleOrGroup.customer_id) {
    const notes = saleOrGroup.items?.[0]?.notes || saleOrGroup.notes || "";
    const match = notes.match(/Name:\s*([^)]+)/);
    if (match) return match[1].trim();
  }

  return "Walk-in";
}

/* ── Number formatting ───────────────────────────────────────────────────────
 * These replace ~100 inline
 *   .toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
 * calls spread across the components, plus seven near-identical local
 * fmtAmt/fmt/inr helpers that had drifted apart.
 *
 * The Intl objects are cached at module level: these run inside render paths,
 * so building a new NumberFormat on every call was pure overhead.
 */
const INR_2DP = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * "1,23,456.00" — digits only, no currency symbol.
 * Use this when the ₹ already exists as its own JSX node, so the rendered
 * markup stays exactly as it was.
 */
export function formatNumber2(value) {
  return INR_2DP.format(Number(value) || 0);
}

/** "₹1,23,456.00" */
export function formatINR(value) {
  return `₹${formatNumber2(value)}`;
}

/**
 * "₹1,23,456.00", or the mask "₹•••" when `show` is false.
 * Backs the "hide amounts" privacy toggle on the Dashboard and Reports.
 */
export function formatINRMasked(value, show = true) {
  return show ? formatINR(value) : "₹•••";
}

/**
 * "₹1.2L" / "₹12.3k" / "₹999.00" — for dense cards where two decimal places
 * are just noise.
 */
export function formatINRCompact(value, show = true) {
  if (!show) return "₹•••";
  const n = Number(value) || 0;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(2)}`;
}

/** "05 Sep 26" — the default date shown across the app. */
export function formatDateShort(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/** "05 Sep 2026" — used where the full year is needed (ledger opening lines). */
export function formatDateLong(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "05 Sep 2026, 14:32" — timestamps where the time of day matters (backups). */
export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "September" — month headings and period labels. */
export function formatMonthName(value = new Date()) {
  return new Date(value).toLocaleDateString("en-GB", { month: "long" });
}
