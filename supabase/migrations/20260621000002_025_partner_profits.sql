/*
  # SUPERSEDED — partner_profits table removed

  NOTE (2026-07-31): This migration is intentionally a no-op now.

  The `partner_profits` snapshot table was an early design that stored
  net-profit-based partner shares. **Net profit is not a concept in this
  business** (see AGENTS.md):

    - All profit logic is based on GROSS profit (sales.margin).
    - Partner shares = gross profit × partner.share_percentage.

  The table was unused by the app and contradicts this rule. Existing
  databases get the table dropped by migration 032; fresh databases never
  create it because the CREATE TABLE that used to live here was removed.

  Do not re-create this table or any net-profit column.
*/