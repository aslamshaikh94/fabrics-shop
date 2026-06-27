# Backup & Restore Feature

## Overview
Comprehensive data backup and restore system for your Fabrics Shop application.

## Features

### ✅ Export Backup
- **One-click backup** of all business data
- **JSON format** for easy portability
- Includes all tables: suppliers, fabrics, customers, purchases, sales, payments, expenses, withdrawals, partners
- **Metadata tracking**: timestamp, version, statistics
- **Automatic filename**: `fabrics-shop-backup-YYYY-MM-DD.json`

### ✅ Restore from Backup
- **Upload backup file** via drag-and-drop or file picker
- **Backup validation** before restore
- **Preview statistics** before applying
- **Two restore modes**:
  - **Add mode**: Adds backup data to existing database (default)
  - **Replace mode**: Clears all data first, then restores (DANGEROUS)
- **Progress tracking** during restore
- **Auto-reload** after successful restore

### ✅ Safety Features
- Multiple warning prompts before dangerous operations
- Backup file validation (structure, version, data integrity)
- Progress indicators during long operations
- Error handling with rollback capability
- Backup preview with statistics

## Usage

### Creating a Backup

1. Navigate to **Backup & Restore** (admin only)
2. Click **"Create Backup"** button
3. Wait for export to complete
4. File downloads automatically as `fabrics-shop-backup-YYYY-MM-DD.json`
5. Store safely in multiple locations (local + cloud)

### Restoring from Backup

1. Navigate to **Backup & Restore**
2. Click file upload area or drag-and-drop a `.json` backup file
3. Review backup preview (date, record counts, size)
4. Choose restore mode:
   - ☑️ **Clear existing data** - Deletes all current data first (DANGEROUS)
   - ☐ **Keep existing data** - Adds backup data to current database
5. Click **"Restore Data"**
6. Confirm action in popup
7. Wait for progress to complete
8. Page automatically reloads with restored data

## Best Practices

### Backup Schedule
- **Frequency**: Daily (recommended)
- **Timing**: After business hours (e.g., 11 PM)
- **Retention**: Keep last 30 backups minimum
- **Testing**: Test restore process monthly

### Storage
Store backups in **multiple locations**:
- 📁 Local computer (Desktop, Documents)
- ☁️ Cloud storage (Google Drive, Dropbox, OneDrive)
- 💾 External drive (USB, external HDD)
- 📧 Email (for small backups)

### Before Major Operations
**Always create backup before**:
- Bulk data imports
- System updates/migrations
- Database structure changes
- Restoring from old backup
- Training new users

## Backup File Structure

```json
{
  "metadata": {
    "version": "1.0",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "date": "2024-01-15",
    "appName": "Fabrics Shop"
  },
  "data": {
    "suppliers": [...],
    "fabrics": [...],
    "customers": [...],
    "purchases": [...],
    "purchase_payments": [...],
    "sales": [...],
    "sale_payments": [...],
    "expenses": [...],
    "withdrawals": [...],
    "partners": [...]
  },
  "stats": {
    "suppliers": 10,
    "fabrics": 150,
    "customers": 45,
    // ... counts for each table
  }
}
```

## Technical Details

### Export Process
1. Fetches all data from 10 tables
2. Validates data integrity
3. Packages with metadata
4. Generates JSON file
5. Triggers browser download

### Restore Process
1. Validates file format and structure
2. Checks version compatibility
3. Deletes existing data (if selected)
4. Inserts data in correct order (respects foreign keys)
5. Processes in batches (100 records per batch)
6. Updates progress during operation
7. Refreshes page on completion

### Data Order (for restore)
Respects foreign key constraints:
1. `sale_payments` (references sales)
2. `purchase_payments` (references purchases)
3. `sales` (references customers, fabrics)
4. `purchases` (references suppliers, fabrics)
5. `expenses`
6. `withdrawals`
7. `partners`
8. `fabrics`
9. `customers`
10. `suppliers`

## Security

### Access Control
- ✅ **Admin only** - Only administrators can access backup/restore
- ✅ **Authentication required** - Must be logged in
- ✅ **RLS policies** - Database-level security enforced

### Data Protection
- ✅ **Validation** - All data validated before restore
- ✅ **Error handling** - Graceful failure with error messages
- ✅ **No credentials** - Backup files don't contain passwords/tokens
- ⚠️ **Sensitive data** - Backup contains all business data (protect accordingly)

## Troubleshooting

### "Invalid backup file"
- Ensure file is valid JSON
- Check file hasn't been corrupted
- Verify backup was created by this app

### "Failed to restore"
- Check internet connection
- Verify Supabase is accessible
- Ensure you have write permissions
- Check browser console for detailed errors

### "Restore incomplete"
- Some data may have been restored
- Check which tables were affected
- May need to restore from earlier backup
- Contact support if data is critical

## Limitations

- **File size**: Large backups (>100MB) may be slow
- **Browser limits**: Very large files may fail in browser
- **Duplicate IDs**: Restore without clearing may create duplicates if IDs match
- **Triggers**: Database triggers may need manual re-sync after restore

## Future Enhancements

- 📅 Scheduled automatic backups
- ☁️ Direct cloud storage integration
- 📊 Backup comparison tools
- 🔄 Incremental backups (only changes)
- 📧 Email backup notifications
- 🔐 Encrypted backups
- 📱 Mobile app backup

## Support

For issues or questions:
1. Check this documentation
2. Review error messages
3. Check browser console
4. Contact system administrator
