/*
  #42 - Purchase GST and other charges

  Model
  -----
    fabric_amount : value of the fabrics on the invoice (before charges/GST)
    other_charges : freight, loading, packing, etc.
    gst_rate      : GST % applied to (fabric_amount + other_charges)
    gst_amount    : ROUND(gst_rate/100 × (fabric_amount + other_charges), 2)
    total_amount  : fabric_amount + other_charges + gst_amount = supplier payable

  total_amount keeps its existing meaning (the amount payable to the supplier),
  so purchase payments, supplier dues, Dashboard and Reports keep working
  unchanged. Only the invoice breakdown is new.

  Inventory valuation is NOT affected: the Stock tab values fabric at each
  fabric's own buying price (fabrics.total_meters × purchase_price_per_meter),
  never from these invoice-level fields.

  Backfill
  --------
  Existing rows hold a single hand-entered total that already includes GST and
  other charges, so they migrate to fabric_amount = total_amount with
  other_charges = 0, gst_rate = 0, gst_amount = 0. Every historical total is
  preserved to the paisa — no money value changes. Set a rate on those rows
  later if you want the breakdown recorded.

  Safe to re-run (idempotent).
*/

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS fabric_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS gst_rate numeric NOT NULL DEFAULT 0;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS gst_amount numeric NOT NULL DEFAULT 0;

-- Preserve every existing invoice total exactly (no GST is applied implicitly).
UPDATE purchases
SET fabric_amount = total_amount
WHERE fabric_amount = 0
  AND other_charges = 0
  AND gst_amount = 0
  AND total_amount <> 0;

-- ============================================
-- Post-check: should return no rows
-- (rows that have a breakdown must add up to their total)
-- ============================================
-- SELECT purchase_number, fabric_amount, other_charges, gst_rate, gst_amount, total_amount
-- FROM purchases
-- WHERE (other_charges <> 0 OR gst_amount <> 0)
--   AND ROUND((fabric_amount + other_charges + gst_amount)::numeric, 2) <> total_amount;
