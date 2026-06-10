export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format a sale's customer name, handling both existing and walk-in customers.
 * Walk-in names are stored in sale.notes as "(Name: John Doe)".
 */
export function formatCustomerName(saleOrGroup) {
  if (!saleOrGroup) return "Walk-in";

  // If they have a customer object with a name, use it
  if (saleOrGroup.customer?.name) return saleOrGroup.customer.name;

  // Walk-in: try to extract name from the notes field
  if (!saleOrGroup.customer_id) {
    // Check multiple possible notes locations
    const notes = saleOrGroup.items?.[0]?.notes || saleOrGroup.notes || "";
    const match = notes.match(/Name:\s*([^)]+)/);
    if (match) return match[1].trim();
  }

  return "Walk-in";
}
