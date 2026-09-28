/**
 * Cash-account routing.
 *
 * Business rule: a customer paying cash hands the money to the secondary account
 * holder (Riyaz), so every cash sale payment is credited to that account
 * automatically. Later Riyaz transfers the money into the primary account
 * (Heena) by UPI; that deposit is an ordinary `cash_deposits` row credited to
 * Heena, and the ledger derives the matching debit from Riyaz's side — no extra
 * column and no stored "from" account are needed.
 *
 * Partners are dynamic rows, so the account is resolved by name and every
 * caller degrades safely: if no matching partner exists, we return null and the
 * payment is left unattributed (it still shows up under "not linked to an
 * account holder") rather than being silently credited to the wrong person.
 */

/** Name of the partner who collects cash (secondary account). */
export const CASH_ACCOUNT_NAME = "Riyaz";

/** Primary account that collected cash is later transferred into. */
export const PRIMARY_ACCOUNT_NAME = "Heena";

/**
 * Match a partner by whole-word name comparison, mirroring matchPartner() in
 * partnerWithdrawal.js. Whole-word matching (never substring `includes`) avoids
 * collisions such as "Riyaz" vs "Riyazuddin".
 */
function findPartnerByName(name, partners = []) {
  const target = (name || "").trim().toLowerCase();
  if (!target) return null;

  // 1) Exact match on the whole name
  for (const p of partners) {
    if ((p.name || "").trim().toLowerCase() === target) return p;
  }

  // 2) Whole-word match against the partner's stored name, so a partner saved as
  //    "Riyaz Shaikh" still resolves to the configured "Riyaz". The configured
  //    name is the needle searched inside the partner name — that direction also
  //    rejects near-misses like "Riyazuddin", where "Riyaz" is only a prefix.
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
  for (const p of partners) {
    const candidate = (p.name || "").trim().toLowerCase();
    if (!candidate) continue;
    if (re.test(candidate)) return p;
  }

  return null;
}

/**
 * The active partner who collects cash, or null when there isn't one.
 * Inactive partners are ignored so a retired holder never receives new cash.
 */
export function getCashAccountPartner(partners = []) {
  const match = findPartnerByName(CASH_ACCOUNT_NAME, partners);
  if (match && match.is_active !== false) return match;
  return null;
}

/** The partner id that cash payments should be credited to (or null). */
export function getCashAccountId(partners = []) {
  return getCashAccountPartner(partners)?.id || null;
}

/**
 * Display name of the account that collects cash, or null when no such partner
 * exists. Callers use this for user-facing copy so the label always matches the
 * real partner row rather than the configured constant.
 */
export function getCashAccountName(partners = []) {
  return getCashAccountPartner(partners)?.name || null;
}

/** The primary account cash is transferred into (or null). */
export function getPrimaryAccountPartner(partners = []) {
  const match = findPartnerByName(PRIMARY_ACCOUNT_NAME, partners);
  if (match && match.is_active !== false) return match;
  return null;
}