import { supabase } from "../lib/supabase";

/**
 * Known columns for each table (based on all migrations).
 * Used to strip unknown columns from backup data before inserting.
 */
const TABLE_COLUMNS = {
  suppliers: [
    "id",
    "name",
    "phone",
    "address",
    "notes",
    "created_at",
    "updated_at",
  ],
  fabrics: [
    "id",
    "name",
    "type",
    "color",
    "purchase_price_per_meter",
    "selling_price_per_meter",
    "total_meters",
    "available_meters",
    "supplier_id",
    "purchase_date",
    "notes",
    "created_at",
    "updated_at",
    "barcode",
    "quantity",
    "purchase_id",
  ],
  customers: [
    "id",
    "name",
    "phone",
    "address",
    "credit_limit",
    "current_balance",
    "notes",
    "created_at",
    "updated_at",
  ],
  purchases: [
    "id",
    "supplier_id",
    "fabric_id",
    "total_amount",
    "paid_amount",
    "purchase_date",
    "status",
    "notes",
    "created_at",
    "updated_at",
    "invoice_url",
    "purchase_number",
  ],
  purchase_items: [
    "id",
    "purchase_id",
    "description",
    "hsn",
    "meters",
    "rate",
    "created_at",
  ],
  purchase_payments: [
    "id",
    "purchase_id",
    "amount",
    "payment_date",
    "payment_method",
    "reference_number",
    "notes",
    "created_at",
  ],
  sales: [
    "id",
    "customer_id",
    "fabric_id",
    "meters",
    "price_per_meter",
    "total_amount",
    "paid_amount",
    "remaining_amount",
    "cost_price_per_meter",
    "margin",
    "sale_date",
    "payment_type",
    "status",
    "notes",
    "created_at",
    "updated_at",
    "sale_group_id",
    "invoice_url",
    "customer_name",
    "fabric_name",
    "discount_amount",
  ],
  sale_payments: [
    "id",
    "sale_id",
    "amount",
    "payment_date",
    "payment_method",
    "reference_number",
    "notes",
    "created_at",
  ],
  expenses: [
    "id",
    "title",
    "category",
    "amount",
    "expense_date",
    "notes",
    "created_at",
    "paid_by",
    "payment_proof_url",
  ],
  withdrawals: [
    "id",
    "amount",
    "withdrawal_date",
    "withdrawn_by",
    "reason",
    "created_at",
    "updated_at",
  ],
  partners: [
    "id",
    "name",
    "share_percentage",
    "is_active",
    "created_at",
    "updated_at",
  ],
};

/**
 * Strip unknown columns from a record, keeping only columns that exist in the table schema.
 * This prevents errors when old backups contain columns that no longer exist.
 */
function sanitizeRecord(record, tableName) {
  const allowed = TABLE_COLUMNS[tableName];
  if (!allowed) return record;

  const sanitized = {};
  for (const key of allowed) {
    if (key in record) {
      sanitized[key] = record[key];
    }
  }
  return sanitized;
}

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
      purchaseItems,
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
      supabase.from("purchase_items").select("*").order("created_at"),
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
      purchaseItems.error,
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
        version: "1.1",
        timestamp: new Date().toISOString(),
        date: timestamp,
        appName: "Fabrics Shop",
      },
      data: {
        suppliers: suppliers.data || [],
        fabrics: fabrics.data || [],
        customers: customers.data || [],
        purchases: purchases.data || [],
        purchase_items: purchaseItems.data || [],
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
        purchase_items: purchaseItems.data?.length || 0,
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

    // purchase_items is required for v1.1+ backups, optional for older versions
    if (backup.metadata?.version && backup.metadata.version !== "1.0") {
      requiredTables.push("purchase_items");
    }

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
 * Restore data from backup
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

    // =========================================================================
    // IMPORTANT: Table order respects foreign key constraints
    //
    // INSERT order (parents first, children last):
    //   1. suppliers       (no FKs)
    //   2. customers       (no FKs)
    //   3. partners        (no FKs)
    //   4. expenses        (no FKs)
    //   5. withdrawals     (no FKs)
    //   6. fabrics         (FKs: supplier_id → suppliers)
    //   7. purchases       (FKs: supplier_id → suppliers, fabric_id → fabrics)
    //   8. Update fabrics  (FK: purchase_id → purchases — circular, updated after purchases exist)
    //   9. sales           (FKs: customer_id → customers, fabric_id → fabrics)
    //  10. purchase_items  (FK: purchase_id → purchases)
    //  11. purchase_payments (FK: purchase_id → purchases)
    //  12. sale_payments   (FK: sale_id → sales)
    //
    // DELETE order is the reverse (children first, parents last):
    // =========================================================================
    const tables = [
      // 1-5. Parent tables (no FK dependencies)
      { name: "suppliers", data: backup.data.suppliers },
      { name: "customers", data: backup.data.customers },
      { name: "partners", data: backup.data.partners },
      { name: "expenses", data: backup.data.expenses },
      { name: "withdrawals", data: backup.data.withdrawals },
      // 6. fabrics (FK: supplier_id → suppliers)
      { name: "fabrics", data: backup.data.fabrics },
      // 7. purchases (FK: supplier_id → suppliers, fabric_id → fabrics)
      { name: "purchases", data: backup.data.purchases },
      // 9. sales (FK: customer_id → customers, fabric_id → fabrics)
      { name: "sales", data: backup.data.sales },
      // 10. purchase_items (FK: purchase_id → purchases)
      { name: "purchase_items", data: backup.data.purchase_items },
      // 11. purchase_payments (FK: purchase_id → purchases)
      { name: "purchase_payments", data: backup.data.purchase_payments },
      // 12. sale_payments (FK: sale_id → sales)
      { name: "sale_payments", data: backup.data.sale_payments },
    ];

    // Reverse order for DELETE (children before parents)
    const deleteTables = [
      "sale_payments",
      "purchase_payments",
      "purchase_items",
      "sales",
      "purchases",
      "fabrics",
      "withdrawals",
      "expenses",
      "partners",
      "customers",
      "suppliers",
    ];

    const totalSteps =
      tables.length + (clearExisting ? deleteTables.length : 0) + 5; // +2 for FK updates + 3 for trigger fix steps (stock, balances, sales)
    let currentStep = 0;

    // ---- STEP 1: Clear existing data (if requested) ----
    if (clearExisting) {
      for (const tableName of deleteTables) {
        if (skipTables.includes(tableName)) continue;

        onProgress({
          step: ++currentStep,
          total: totalSteps,
          action: `Clearing ${tableName}...`,
        });

        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (deleteError) {
          throw new Error(
            `Failed to clear ${tableName}: ${deleteError.message}`,
          );
        }
      }
    }

    // ---- STEP 2: Insert data in FK-safe order ----

    // Extract circular FK values before stripping
    const fabricPurchaseLinks = (backup.data.fabrics || [])
      .filter((f) => f.purchase_id)
      .map((f) => ({ id: f.id, purchase_id: f.purchase_id }));

    const purchaseFabricLinks = (backup.data.purchases || [])
      .filter((p) => p.fabric_id)
      .map((p) => ({ id: p.id, fabric_id: p.fabric_id }));

    for (const table of tables) {
      if (skipTables.includes(table.name)) continue;

      let records = table.data;

      // Strip unknown columns that may exist in old backups but not in current schema
      if (records && records.length > 0) {
        records = records.map((r) => sanitizeRecord(r, table.name));
      }

      // Strip circular FK references before insert, restore after both tables exist
      if (table.name === "fabrics" && fabricPurchaseLinks.length > 0) {
        records = (records || []).map((r) => {
          const { purchase_id, ...rest } = r;
          return rest;
        });
      }
      if (table.name === "purchases" && purchaseFabricLinks.length > 0) {
        records = (records || []).map((r) => {
          const { fabric_id, ...rest } = r;
          return rest;
        });
      }

      if (records && records.length > 0) {
        onProgress({
          step: ++currentStep,
          total: totalSteps,
          action: `Restoring ${table.name} (${records.length} records)...`,
        });

        const batchSize = 100;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          const { error: insertError } = await supabase
            .from(table.name)
            .insert(batch);

          if (insertError) {
            throw new Error(
              `Failed to restore ${table.name} (batch ${i / batchSize + 1}): ${insertError.message}`,
            );
          }
        }
      } else {
        // Track progress even for empty tables
        onProgress({
          step: ++currentStep,
          total: totalSteps,
          action: `Restoring ${table.name} (0 records)...`,
        });
      }
    }

    // ---- STEP 3: Restore circular FK references (fabrics.purchase_id) ----
    if (fabricPurchaseLinks.length > 0) {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: `Linking fabrics to purchases (${fabricPurchaseLinks.length} records)...`,
      });

      const batchSize = 100;
      for (let i = 0; i < fabricPurchaseLinks.length; i += batchSize) {
        const batch = fabricPurchaseLinks.slice(i, i + batchSize);
        for (const link of batch) {
          const { error: updateError } = await supabase
            .from("fabrics")
            .update({ purchase_id: link.purchase_id })
            .eq("id", link.id);

          if (updateError) {
            console.warn(
              `Failed to link fabric ${link.id} to purchase ${link.purchase_id}:`,
              updateError.message,
            );
          }
        }
      }
    } else {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: "Linking fabrics to purchases (0 records)...",
      });
    }

    // ---- STEP 4: Restore circular FK references (purchases.fabric_id) ----
    if (purchaseFabricLinks.length > 0) {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: `Linking purchases to fabrics (${purchaseFabricLinks.length} records)...`,
      });

      const batchSize = 100;
      for (let i = 0; i < purchaseFabricLinks.length; i += batchSize) {
        const batch = purchaseFabricLinks.slice(i, i + batchSize);
        for (const link of batch) {
          const { error: updateError } = await supabase
            .from("purchases")
            .update({ fabric_id: link.fabric_id })
            .eq("id", link.id);

          if (updateError) {
            console.warn(
              `Failed to link purchase ${link.id} to fabric ${link.fabric_id}:`,
              updateError.message,
            );
          }
        }
      }
    } else {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: "Linking purchases to fabrics (0 records)...",
      });
    }

    // ---- STEP 5: Fix trigger side effects ----
    // Database triggers fire during restore and corrupt certain values:
    //   1. trigger_update_fabric_stock deducts available_meters when sales are inserted
    //      → Restore the correct available_meters from backup
    //   2. trigger_update_sale_paid recalculates customer current_balance
    //      → Restore the correct current_balance from backup
    //   3. trigger_calculate_sale_amounts recalculates total_amount/margin/remaining
    //      → These should be correct, but we restore from backup to be safe

    // Fix fabric available_meters (undo trigger double-deduction)
    const fabricsData = backup.data.fabrics || [];
    if (fabricsData.length > 0) {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: `Fixing fabric stock (${fabricsData.length} records)...`,
      });

      const batchSize = 100;
      for (let i = 0; i < fabricsData.length; i += batchSize) {
        const batch = fabricsData.slice(i, i + batchSize);
        for (const fabric of batch) {
          const { error: updateError } = await supabase
            .from("fabrics")
            .update({
              available_meters: fabric.available_meters,
              total_meters: fabric.total_meters,
            })
            .eq("id", fabric.id);

          if (updateError) {
            console.warn(
              `Failed to fix stock for fabric ${fabric.id}:`,
              updateError.message,
            );
          }
        }
      }
    } else {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: "Fixing fabric stock (0 records)...",
      });
    }

    // Fix customer current_balance (undo trigger recalculation)
    const customersData = backup.data.customers || [];
    if (customersData.length > 0) {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: `Fixing customer balances (${customersData.length} records)...`,
      });

      const batchSize = 100;
      for (let i = 0; i < customersData.length; i += batchSize) {
        const batch = customersData.slice(i, i + batchSize);
        for (const customer of batch) {
          const { error: updateError } = await supabase
            .from("customers")
            .update({ current_balance: customer.current_balance })
            .eq("id", customer.id);

          if (updateError) {
            console.warn(
              `Failed to fix balance for customer ${customer.id}:`,
              updateError.message,
            );
          }
        }
      }
    } else {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: "Fixing customer balances (0 records)...",
      });
    }

    // Fix sales total_amount, margin, remaining_amount (undo trigger corruption)
    // Database triggers (trigger_calculate_sale_amounts, trigger_update_sale_paid)
    // recalculate these values during insert, which can produce incorrect results
    // when restoring from backup. Restore the exact values from the backup.
    const salesData = backup.data.sales || [];
    if (salesData.length > 0) {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: `Fixing sales values (${salesData.length} records)...`,
      });

      const batchSize = 100;
      for (let i = 0; i < salesData.length; i += batchSize) {
        const batch = salesData.slice(i, i + batchSize);
        for (const sale of batch) {
          const { error: updateError } = await supabase
            .from("sales")
            .update({
              total_amount: sale.total_amount,
              margin: sale.margin,
              remaining_amount: sale.remaining_amount,
              paid_amount: sale.paid_amount,
              status: sale.status,
            })
            .eq("id", sale.id);

          if (updateError) {
            console.warn(
              `Failed to fix values for sale ${sale.id}:`,
              updateError.message,
            );
          }
        }
      }
    } else {
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        action: "Fixing sales values (0 records)...",
      });
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
  const totalRecords = Object.values(stats).reduce(
    (sum, count) => sum + count,
    0,
  );
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
