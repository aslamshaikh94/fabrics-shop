# fabrics-shop — Project Rules & Conventions

This file encodes long-term project decisions. Follow it in every task.

## Business rules (never break)

1. **Net Profit is FORBIDDEN.** There is no "net profit" concept in this business.
   - Never use net profit in any logic, calculation, dashboard, report, or UI.
   - All profit values must be **Gross Profit** = `sales.margin`.
   - **Partner shares = gross profit × partner.share_percentage** (never minus expenses).
   - The `partner_profits` table was dropped (migration 032) — do not recreate it.

2. **`sales.total_amount` is stored PRE-discount** (`meters × price_per_meter`).
   - `sales.discount_amount` holds the discount separately.
   - Whenever reading sales revenue, always net it: `total_amount - discount_amount`.
   - `sales.margin` already nets discount; `sales.remaining_amount` already nets discount + payments.

3. **"Collected" = actual payments received.** Query `sale_payments` by `payment_date`
   for the period. Never use `paid_amount` on sales *dated* in a period.

4. **Withdrawal → partner attribution** must use whole-word matching
   (see `app/utils/partnerWithdrawal.js`), never substring `includes`.

## Tech stack

- Next.js 15 (App Router), React 19, Tailwind CSS, Supabase, recharts.
- Pages in `app/(app)/<page>/page.js` map to components in `app/components/`.
- Shared logic in `app/utils/`; DB schema in `supabase/migrations/`.
- Commands: `npm run dev`, `npm run build`, `npm start`. (No ESLint config yet.)