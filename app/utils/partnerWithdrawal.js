/**
 * Helpers for matching withdrawal records (free-text `withdrawn_by`)
 * to partners by exact / whole-word name, avoiding substring collisions
 * (e.g. "Raj" vs "Raju", "Ali" vs "Alibaba").
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchPartner(withdrawnBy, partners = []) {
  const by = (withdrawnBy || "").trim().toLowerCase();
  if (!by) return null;

  // 1) Exact match on the whole withdrawn_by string
  for (const p of partners) {
    if ((p.name || "").trim().toLowerCase() === by) return p;
  }

  // 2) Whole-word match (handles names embedded in extra context text)
  for (const p of partners) {
    const name = (p.name || "").trim().toLowerCase();
    if (!name) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(name)}($|[^a-z0-9])`);
    if (re.test(by)) return p;
  }

  return null;
}

export function partnerNameForWithdrawal(withdrawnBy, partners = []) {
  const p = matchPartner(withdrawnBy, partners);
  return p ? p.name : withdrawnBy || "Unknown";
}