import { supabase } from "../lib/supabase";

/**
 * Export all data from the database as a JSON backup
 */
export async function exportBackup() {
  try {
    const timestamp = new Date().toISOString().split("T")[0];

    // Fetch all tables
    const [
      suppliers,
      fabrics,
      customers,
      purchases,
      purchasePayments,
      sales,
      salePayments,
      expenses,
      withdrawals,
      partners,
    ] = await Promise.all([
      supabase.from("suppliers").select("*").order("created_at"),
      supabase.from("fabrics").select("*").order("created_at"),
      supabase.from("customers").select("*").order("created_at"),
      supabase.from("purchases").select("*").order("created_at"),
      supabase.from("purchase_payments").select("*").order("created_at"),
      supabase.from("sales").select("*").order("created_at"),
      supabase.from("sale_payments").select("*").order("created_at"),
      supabase.from("expenses").select("*").order("created_at"),
      supabase.from("withdrawals").select("*").order("created_at"),
      supabase.from("partners").select("*").order("created_at"),
    ]);

    // Check for errors
    const errors = [
      suppliers.error,
      fabrics.error,
      customers.error,
      purchases.error,
      purchasePayments.error,
      sales.error,
      salePayments.error,
      expenses.error,
      withdrawals.error,
      partners.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(`Failed to fetch data: ${errors[0].message}`);
    }

    const backup = {
      metadata: {
        version: "1.0",
        timestamp: new Date().toISOString(),
        date: timestamp,
        appName: "Fabrics Shop",
      },
      data: {
        suppliers: suppliers.data || [],
        fabrics: fabrics.data || [],
        customers: customers.data || [],
        purchases: purchases.data || [],
        purchase_payments: purchasePayments.data || [],
        sales: sales.data || [],
        sale_payments: salePayments.data || [],
        expenses: expenses.data || [],
        withdrawals: withdrawals.data || [],
        partners: partners.data || [],
      },
      stats: {
        suppliers: suppliers.data?.length || 0,
        fabrics: fabrics.data?.length || 0,
        customers: customers.data?.length || 0,
        purchases: purchases.data?.length || 0,
        purchase_payments: purchasePayments.data?.length || 0,
        sales: sales.data?.length || 0,
        sale_payments: salePayments.data?.length || 0,
        expenses: expenses.data?.length || 0,
        withdrawals: withdrawals.data?.length || 0,
        partners: partners.data?.length || 0,
      },
    };

    return backup;
  } catch (error) {
    console.error("Backup export error:", error);
    throw error;
  }
}

/**
 * Download backup as JSON file
 */
export function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fabrics-shop-backup-${backup.metadata.date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validate backup file structure
 */
export function validateBackup(backup) {
  const errors = [];

  // Check metadata
  if (!backup.metadata) {
    errors.push("Missing metadata");
  } else {
    if (!backup.metadata.version) errors.push("Missing version");
    if (!backup.metadata.timestamp) errors.push("Missing timestamp");
  }

  // Check data structure
  if (!backup.data) {
    errors.push("Missing data object");
  } else {
    const requiredTables = [
      "suppliers",
      "fabrics",
      "customers",
      "purchases",
      "purchase_payments",
      "sales",
      "sale_payments",
      "expenses",
    ];

    requiredTables.forEach((table) => {
      if (!Array.isArray(backup.data[table])) {
        errors.push(`Missing or invalid ${table} data`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Restore data from backup (DANGEROUS - clears existing data)
 */
export async function restoreBackup(backup, options = {}) {
  const {
    clearExisting = false,
    skipTables = [],
    onProgress = () => {},
  } = options;

  try {
    // Validate backup
    const validation = validateBackup(backup);
    if (!validation.valid) {
      throw new Error(`Invalid backup: ${validation.errors.join(", ")}`);
    }

    const tables = [
      { name: "sale_payments", data: backup.data.sale_payments },
      { name: "purchase_payments", data: backup.data.purchase_payments },
      { name: "sales", data: backup.data.sales },
      { name: "purchases", data: backup.data.purchases },
      { name: "expenses", data: backup.data.expenses },
      { name: "withdrawals", data: backup.data.withdrawals },
      { name: "partners", data: backup.data.partners },
      { name: "fabrics", data: backup.data.fabrics },
      { name: "customers", data: backup.data.customers },
      { name: "suppliers", data: backup.data.suppliers },
    ];

    const totalSteps = tables.length * (clearExisting ? 2 : 1);
    let currentStep = 0;

    for (const table of tables) {
      if (skipTables.includes(table.name)) {
        continue;
      }

      // Clear existing data if requested (DANGEROUS!)
      if (clearExisting) {
        onProgress({
          step: ++currentStep,
          total: totalSteps,
          action: `Clearing ${table.name}...`,
        });

        const { error: deleteError } = await supabase
          .from(table.name)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

        if (deleteError) {
          throw new Error(`Failed to clear ${table.name}: ${deleteError.message}`);
        }
      }

      // Insert data in batches
      if (table.data && table.data.length > 0) {
        onProgress({
          step: ++currentStep,
          total: totalSteps,
          action: `Restoring ${table.name} (${table.data.length} records)...`,
        });

        const batchSize = 100;
        for (let i = 0; i < table.data.length; i += batchSize) {
          const batch = table.data.slice(i, i + batchSize);
          const { error: insertError } = await supabase
            .from(table.name)
            .insert(batch);

          if (insertError) {
            throw new Error(
              `Failed to restore ${table.name} (batch ${i / batchSize + 1}): ${insertError.message}`,
            );
          }
        }
      }
    }

    onProgress({
      step: totalSteps,
      total: totalSteps,
      action: "Restore completed!",
      done: true,
    });

    return {
      success: true,
      stats: backup.stats,
    };
  } catch (error) {
    console.error("Restore error:", error);
    throw error;
  }
}

/**
 * Create automatic backup schedule info
 */
export function getBackupScheduleInfo() {
  return {
    recommended: "Daily",
    frequency: "24 hours",
    bestTime: "After business hours (e.g., 11 PM)",
    retention: "Keep last 30 backups",
    storage: "Local + Cloud (Google Drive, Dropbox)",
  };
}

/**
 * Get backup file size estimate
 */
export function estimateBackupSize(stats) {
  // Rough estimate: 1KB per record average
  const totalRecords = Object.values(stats).reduce((sum, count) => sum + count, 0);
  const sizeKB = totalRecords * 1;
  const sizeMB = sizeKB / 1024;

  if (sizeMB < 1) {
    return `${Math.round(sizeKB)} KB`;
  }
  return `${sizeMB.toFixed(2)} MB`;
}

/**
 * Parse backup file from uploaded file
 */
export async function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        resolve(backup);
      } catch (error) {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
