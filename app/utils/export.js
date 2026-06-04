/**
 * Export data to CSV format
 * Sanitizes data to prevent CSV injection
 */
export function exportCSV(rows, filename) {
  if (!rows.length) return;

  const sanitizeCSV = (value) => {
    const str = String(value ?? "").trim();
    // Prevent CSV injection by escaping formulas
    if (["=", "+", "-", "@", "\t", "\r"].includes(str[0])) {
      return `'${str}`;
    }
    return str.replace(/"/g, '""');
  };

  const keys = Object.keys(rows[0]);
  const headers = keys.map((k) => `"${k}"`).join(",");
  const csvRows = rows.map((row) =>
    keys.map((k) => `"${sanitizeCSV(row[k])}"`).join(","),
  );

  const csv = [headers, ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
