# Fix Split Discounts Migration

## Problem
Old sales have discounts split proportionally across multiple items. The new logic stores the full discount amount only in the first item of each sale group.

## Solution
Run the migration script to consolidate all split discounts into the first item only.

## Steps to Run

### Option 1: Using Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to your Supabase project
   - Navigate to: SQL Editor

2. **Verify Current State (Optional)**
   - Copy contents from `verify_discount_fix.sql` (queries 1 & 2)
   - Run to see current discount distribution
   - Note which sales have split discounts

3. **Run Migration**
   - Copy entire contents from `20260628000000_028_fix_split_discounts.sql`
   - Paste in SQL Editor
   - Click "Run" or press Cmd/Ctrl + Enter
   - Wait for "Success" message

4. **Verify Fix (Recommended)**
   - Copy queries 3 & 4 from `verify_discount_fix.sql`
   - Run to verify discounts are now on first item only
   - Check that `items_with_discount = 1` for each group

### Option 2: Using Supabase CLI

```bash
# Make sure you're in project directory
cd /Users/aslamahmed/Desktop/aslam/fabrics-shop

# Run migration
supabase db push

# Or run specific file
supabase db execute -f supabase/migrations/20260628000000_028_fix_split_discounts.sql
```

## What the Migration Does

1. ✅ Identifies all sale groups with discounts
2. ✅ Sums up split discounts per group
3. ✅ Sets discount to 0 on all items
4. ✅ Applies full discount to first item (by created_at)
5. ✅ Recalculates margin and remaining_amount
6. ✅ Updates customer balances

## Example

**Before:**
- Item 1: ₹632.5 total, ₹500 discount
- Item 2: ₹862.5 total, ₹300 discount  
- Item 3: ₹1530 total, ₹200 discount
- **Total Discount: ₹1000** (split across 3 items)

**After:**
- Item 1: ₹632.5 total, ₹1000 discount ← Full discount here
- Item 2: ₹862.5 total, ₹0 discount
- Item 3: ₹1530 total, ₹0 discount
- **Total Discount: ₹1000** (on first item only)

## Verification Checklist

After running migration, verify:

- [ ] Each sale group has discount on first item only
- [ ] Total discount amount per group is unchanged
- [ ] Remaining amounts are correctly calculated
- [ ] Customer balances are accurate
- [ ] Export CSV shows correct discount values

## Rollback (If Needed)

The migration is safe and doesn't delete data. If issues occur:
1. Check verification queries
2. Manually adjust affected sales via app UI
3. Customer balances will auto-update via triggers

## Need Help?

If you see any issues after migration:
1. Run verification queries
2. Check the affected sale groups
3. Use "Edit Sale Info" in the app to fix manually
