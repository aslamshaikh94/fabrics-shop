# 🚀 PRODUCTION DEPLOYMENT GUIDE - Discount Fix

## ⚠️ IMPORTANT - READ BEFORE PROCEEDING

This guide will fix the discount feature in your **LIVE PRODUCTION** database.

**What it fixes**: Consolidates split discounts to apply on total (first item only)

**Is it safe?**: ✅ YES - Does not delete data, only reorganizes discount amounts

**Time required**: ~5 seconds

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### ✅ Step 1: Create Backup (MANDATORY)

**Option A: Use App (Recommended)**
1. Login to your app as admin
2. Go to **Backup & Restore** page
3. Click **"Create Backup"**
4. Save the downloaded file somewhere safe
5. ✅ Backup created: `fabrics-shop-backup-YYYY-MM-DD.json`

**Option B: Supabase Dashboard**
1. Open Supabase Dashboard
2. Go to Database → Backups
3. Create manual backup
4. Wait for completion

### ✅ Step 2: Inform Team
- Notify users that maintenance is in progress
- Choose low-traffic time (e.g., after business hours)
- Expected downtime: **NONE** (can run during business hours)

---

## 🔧 DEPLOYMENT STEPS

### Step 1: Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project: **rjopsqpzpbmprxpyfaub**
3. Click **SQL Editor** in left sidebar
4. Click **"New Query"**

### Step 2: Copy the SQL Script

Open file: **`PRODUCTION_DISCOUNT_FIX.sql`**

Copy the **ENTIRE** content (Cmd/Ctrl + A, then Cmd/Ctrl + C)

### Step 3: Paste into SQL Editor

1. Paste the copied SQL into the editor
2. Review the script (optional)
3. Look for the "MAIN FIX SCRIPT" section

### Step 4: Run the Script

1. Click **"Run"** button (or press Cmd/Ctrl + Enter)
2. Wait for execution (should take ~5 seconds)
3. Check for **"Success"** message at bottom

### Step 5: Verify Results

You should see output like:
```
✅ Discount fix completed successfully!
Discounts consolidated to first item only
Refresh your app to see changes
```

---

## ✅ POST-DEPLOYMENT VERIFICATION

### Test 1: Check Discount Display

1. Open your app
2. Refresh page (Cmd/Ctrl + R)
3. Go to **Sales** page
4. Look at "Anis mamu" sale from 2026-06-22
5. **Expected**: Discount shows ₹1000 total (not split)

### Test 2: Export CSV

1. Go to Sales page
2. Click **Export** button
3. Open CSV file
4. Check discount column
5. **Expected**: Only first item of multi-item sales has discount

### Test 3: Create New Sale with Discount

1. Go to **Sales** → **New Sale**
2. Add 2-3 items
3. Add discount: ₹500
4. Submit sale
5. View sale details
6. **Expected**: Discount appears on first item only

### Test 4: Check Customer Balances

1. Go to **Customers** page
2. Check "Anis mamu" balance
3. **Expected**: Balance should be correct (₹6428.5 - ₹1000 discount)

---

## 🐛 TROUBLESHOOTING

### Issue: "relation 'sales' does not exist"
**Solution**: Wrong database selected. Switch to correct Supabase project.

### Issue: "permission denied"
**Solution**: Ensure you're logged in as project owner/admin in Supabase.

### Issue: Script runs but no changes
**Solution**: 
- Check if any sales have discounts: Run verification query
- May mean no split discounts exist (nothing to fix)

### Issue: Errors during execution
**Solution**:
1. Note the exact error message
2. Stop immediately
3. Restore from backup
4. Contact support with error details

---

## 🔄 ROLLBACK PROCEDURE (If needed)

If something goes wrong:

### Option 1: Restore from Backup (Recommended)

1. Go to app → **Backup & Restore**
2. Upload the backup file you created
3. Check **"Clear existing data"**
4. Click **"Restore Data"**
5. Confirm and wait for completion

### Option 2: Manual Supabase Restore

1. Supabase Dashboard → Database → Backups
2. Select backup from before fix
3. Click **"Restore"**
4. Wait for completion

---

## 📊 EXPECTED CHANGES

### Before Fix:
```
Sale Group: "Anis mamu" - 9 items
- Item 1: ₹632.5 | Discount: ₹500
- Item 2: ₹862.5 | Discount: ₹300  
- Item 3: ₹1530  | Discount: ₹200
Total Discount: ₹1000 (split across items)
```

### After Fix:
```
Sale Group: "Anis mamu" - 9 items
- Item 1: ₹632.5 | Discount: ₹1000 ← ALL HERE
- Item 2: ₹862.5 | Discount: ₹0
- Item 3: ₹1530  | Discount: ₹0
Total Discount: ₹1000 (on first item)
```

**Net Total**: Remains the same ✅
**Customer Balance**: Remains the same ✅
**Only Change**: Discount location moved to first item

---

## 📞 SUPPORT

**If you encounter issues:**

1. ✅ Check error message carefully
2. ✅ Try rollback procedure
3. ✅ Check Supabase logs (Dashboard → Logs)
4. ✅ Review this guide again
5. ❌ DO NOT panic - data is safe in backup

---

## ✨ POST-DEPLOYMENT

After successful deployment:

- [ ] Test all discount-related features
- [ ] Verify customer balances are correct
- [ ] Test creating new sales with discounts
- [ ] Export CSV and verify format
- [ ] Delete old backup files (keep last 30 days)
- [ ] Update team that maintenance is complete

---

## 🎉 SUCCESS CRITERIA

You're done when:

✅ Script executed without errors
✅ Sales show discount on first item only
✅ Customer balances are correct
✅ New sales with discounts work properly
✅ CSV exports show correct discount format
✅ No user-reported issues

**Congratulations! Your discount feature is now fixed! 🎊**
