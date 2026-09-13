/*
  # Remove net profit from the database

  BUSINESS RULE (persisted in AGENTS.md):
    - Net profit must NEVER be used in any logic, calculation, or UI.
    - All profit is based on GROSS profit (sales.margin).
    - Partner shares = gross profit × partner.share_percentage.

  The `partner_profits` snapshot table (migration 025) was an early design
  built around net-profit partner shares. It is unused by the app and
  contradicts the business rule above, so it is dropped entirely to ensure
  net profit cannot be reintroduced.
*/

DROP TABLE IF EXISTS partner_profits;