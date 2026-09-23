/*
  # Partner (account holder) opening balance

  Each partner acts as a payment account holder. Until now the account statement
  only reflected transactions recorded inside the app, so an account that already
  held money beforehand showed a wrong running balance.

  This adds a manual opening balance to `partners`:
    - `opening_balance`      — balance the account already had (default 0)
    - `opening_balance_date` — the date that balance is "as of". Transactions before
      this date are subsumed by the opening balance and are excluded from the
      running balance; transactions on/after it are applied on top.

  Both columns are nullable/defaulted, so existing partner rows are unaffected.

  2. Security
    - No new RLS policies needed — `partners` is already policy-protected and the
      new columns inherit that.
*/

ALTER TABLE partners ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS opening_balance_date date;
