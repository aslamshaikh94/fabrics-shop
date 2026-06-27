"use client";
import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import {
  Upload,
  X,
  FileUp,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { useToast } from "./Toast";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert an Excel serial date number to a YYYY-MM-DD date string.
 * Excel serial date 1 = January 1, 1900.
 * Supports both integer (date only) and fractional (date + time) values.
 */
function excelSerialToDateStr(serial) {
  // Excel's epoch is 1900-01-01, but due to the Lotus 123 bug, serial 60 = 1900-02-29 (which doesn't exist),
  // so serials >= 60 need an extra day subtracted.
  const epoch = new Date(1899, 11, 30); // Dec 30, 1899 (accounts for the leap year bug)
  const days = Math.floor(serial);
  const date = new Date(epoch.getTime() + days * 86400000);
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

/** Check if a value is an Excel serial date number (positive number, not already a string). */
function isExcelSerialDate(value) {
  return typeof value === "number" && value > 40000 && value < 70000;
}

// Expected/optional columns mapped to DB fields
// Matches the export format: date, customer, notes, meters, price_per_meter, total, paid, remaining, type
const COLUMN_MAP = {
  customer: "customer_name",
  fabric: "fabric_name",
  fabric_name: "fabric_name",
  meters: "meters",
  price: "price_per_meter",
  price_per_meter: "price_per_meter",
  cost: "cost_price_per_meter",
  cost_price_per_meter: "cost_price_per_meter",
  date: "sale_date",
  sale_date: "sale_date",
  payment: "payment_type",
  payment_type: "payment_type",
  type: "payment_type",
  notes: "notes",
  total: "total",
  paid: "paid",
  remaining: "remaining",
  discount: "discount_amount",
  discount_amount: "discount_amount",
  disc: "discount_amount",
};

const REQUIRED_COLS = ["fabric_name", "meters", "price_per_meter"];

export default function SalesImport({
  open,
  onClose,
  onImported,
  fabrics,
  customers,
}) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState("upload"); // upload | preview | done

  const fabricMap = {};
  (fabrics || []).forEach((f) => {
    fabricMap[f.name.toLowerCase()] = f;
  });

  const customerMap = {};
  (customers || []).forEach((c) => {
    customerMap[c.name.toLowerCase()] = c;
  });

  const handleFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        let workbook;
        try {
          workbook = XLSX.read(buffer, { type: "array" });
        } catch {
          // Try as CSV
          const text = new TextDecoder().decode(buffer);
          workbook = XLSX.read(text, { type: "string" });
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!json || json.length === 0) {
          toast("No data found in file", "error");
          return;
        }

        // Debug: show first row keys and values
        console.log("Import: first row keys", Object.keys(json[0]));
        console.log(
          "Import: first row values",
          JSON.stringify(json[0]).slice(0, 300),
        );

        // Normalise keys: lowercase, trim, normalize whitespace (preserve underscores)
        const normalised = json.map((row) => {
          const nr = {};
          Object.keys(row).forEach((key) => {
            const k = key.toLowerCase().trim();
            // Try exact match first, then try with underscores normalized
            const targetKey =
              COLUMN_MAP[k] || COLUMN_MAP[k.replace(/[\s]+/g, "")] || k;
            const rawValue = row[key];
            // Convert Excel serial date numbers to date strings for date columns
            if (
              ["sale_date", "date"].includes(targetKey) &&
              isExcelSerialDate(rawValue)
            ) {
              nr[targetKey] = excelSerialToDateStr(rawValue);
            } else {
              nr[targetKey] = String(rawValue).trim();
            }
          });

          // If no fabric_name column, try to extract from notes (export format: "Fabric: Name")
          if (!nr.fabric_name && nr.notes) {
            const match = nr.notes.match(/Fabric:\s*([^(|\n]+)/);
            if (match) nr.fabric_name = match[1].trim();
          }

          // If we have a customer column but not customer_name
          if (nr.customer && !nr.customer_name) {
            nr.customer_name = nr.customer;
          }

          // Ensure payment_type is set from "type" column
          if (!nr.payment_type && nr.type) {
            nr.payment_type = String(nr.type).toLowerCase();
          }

          return nr;
        });

        // Debug: show normalised first row
        console.log(
          "Import: normalised first row",
          JSON.stringify(normalised[0]).slice(0, 300),
        );

        // Validate rows
        const rowErrors = [];
        normalised.forEach((row, idx) => {
          const errs = [];
          if (!row.fabric_name) errs.push("Missing fabric name");
          if (
            !row.meters ||
            isNaN(parseFloat(row.meters)) ||
            parseFloat(row.meters) <= 0
          )
            errs.push("Invalid meters");
          if (
            !row.price_per_meter ||
            isNaN(parseFloat(row.price_per_meter)) ||
            parseFloat(row.price_per_meter) <= 0
          )
            errs.push("Invalid price per meter");
          if (
            row.payment_type &&
            !["cash", "credit", "partial"].includes(
              row.payment_type.toLowerCase(),
            )
          )
            errs.push("Payment must be cash/credit/partial");
          if (errs.length > 0) rowErrors.push({ row: idx + 2, errors: errs });
        });

        setRows(normalised);
        setErrors(rowErrors);
        setStage("preview");
      } catch (err) {
        console.error("Error reading file:", err);
        toast(
          "Failed to read file. Please upload a valid .xlsx or .csv file",
          "error",
        );
      }
    },
    [fabrics, customers, toast],
  );

  async function handleImport() {
    setImporting(true);
    try {
      let imported = 0;
      let failed = 0;

      // Build set of error row indices to skip
      const errorIndices = new Set(errors.map((e) => e.row - 2));
      const validRows = rows.filter((_, idx) => !errorIndices.has(idx));

      if (validRows.length === 0) {
        toast("No valid rows to import", "error");
        setImporting(false);
        return;
      }

      // Group valid rows by customer+date to create sale groups
      const groups = {};
      validRows.forEach((row, idx) => {
        const groupKey = `${row.customer_name || "walkin"}|${row.sale_date || new Date().toISOString().split("T")[0]}`;
        if (!groups[groupKey])
          groups[groupKey] = { rows: [], groupId: generateUUID() };
        groups[groupKey].rows.push({ ...row, idx });
      });

      for (const [key, group] of Object.entries(groups)) {
        const groupId = group.groupId;
        const firstRow = group.rows[0];
        const saleDate =
          firstRow.sale_date || new Date().toISOString().split("T")[0];
        const paymentType = firstRow.payment_type?.toLowerCase() || "cash";

        // Find or use customer
        let customerId = null;
        if (
          firstRow.customer_name &&
          firstRow.customer_name.toLowerCase() !== "walk-in"
        ) {
          const existing = customerMap[firstRow.customer_name.toLowerCase()];
          if (existing) {
            customerId = existing.id;
          }
        }

        // Create walk-in name info
        const walkInName =
          !customerId &&
          firstRow.customer_name &&
          firstRow.customer_name.toLowerCase() !== "walk-in"
            ? firstRow.customer_name
            : null;

        // Process each row: upsert (update existing or insert new)
        for (const row of group.rows) {
          const fabricName = row.fabric_name || "";
          const fabric = fabricMap[fabricName.toLowerCase()];
          const meters = parseFloat(row.meters) || 0;
          const pricePerMeter = parseFloat(row.price_per_meter) || 0;
          // If cost not provided in CSV, auto-fill from fabric's purchase price
          let costPrice = parseFloat(row.cost_price_per_meter) || 0;
          if (costPrice <= 0 && fabric) {
            costPrice = fabric.purchase_price_per_meter || 0;
          }

          // Build notes from scratch (don't reuse uploaded notes as they already contain Fabric info)
          let notesStr = `Fabric: ${fabricName}`;
          if (walkInName) notesStr += ` (Name: ${walkInName})`;

          const discountAmt = parseFloat(row.discount_amount) || 0;
          const paidAmount = parseFloat(row.paid) || 0;
          const totalAmount = parseFloat(row.total) || 0;

          // Try to find existing sale by customer + fabric_name + sale_date + meters
          const { data: existingSales } = await supabase
            .from("sales")
            .select("id")
            .match({
              customer_id: customerId,
              fabric_name: fabricName,
              sale_date: saleDate,
              meters: meters,
            });

          if (existingSales && existingSales.length > 0) {
            // Update existing record
            const existingId = existingSales[0].id;
            const { error: updateErr } = await supabase
              .from("sales")
              .update({
                cost_price_per_meter: costPrice,
                price_per_meter: pricePerMeter,
                payment_type: paymentType,
                customer_name: walkInName || "",
                notes: notesStr,
                discount_amount: discountAmt,
              })
              .eq("id", existingId);
            if (updateErr) throw updateErr;

            // Delete old payments and recreate
            await supabase
              .from("sale_payments")
              .delete()
              .eq("sale_id", existingId);
            if (paidAmount > 0) {
              await supabase.from("sale_payments").insert([
                {
                  sale_id: existingId,
                  amount: paidAmount,
                  payment_date: saleDate,
                  payment_method: "cash",
                },
              ]);
            }

            imported++;
          } else {
            // Insert new record
            const { data: insertedSales, error: saleError } = await supabase
              .from("sales")
              .insert([
                {
                  customer_id: customerId,
                  fabric_id: fabric?.id || null,
                  meters,
                  price_per_meter: pricePerMeter,
                  cost_price_per_meter: costPrice,
                  sale_date: saleDate,
                  payment_type: paymentType,
                  sale_group_id: groupId,
                  customer_name: walkInName || "",
                  fabric_name: fabricName,
                  notes: notesStr,
                  discount_amount: discountAmt,
                },
              ])
              .select();

            if (saleError) {
              console.error("Error inserting sale:", saleError);
              failed++;
              continue;
            }

            // Create payments
            if (paidAmount > 0 && insertedSales?.[0]) {
              await supabase.from("sale_payments").insert([
                {
                  sale_id: insertedSales[0].id,
                  amount: paidAmount,
                  payment_date: saleDate,
                  payment_method: "cash",
                },
              ]);
            }

            imported++;
          }
        }
      }

      if (failed > 0) {
        toast(`${imported} sales imported, ${failed} failed`, "warning");
      } else {
        toast(`${imported} sales imported successfully`);
      }

      onImported?.();
      resetModal();
    } catch (err) {
      console.error("Import error:", err);
      toast("Import failed. Please check your data and try again.", "error");
    } finally {
      setImporting(false);
    }
  }

  function resetModal() {
    setRows([]);
    setErrors([]);
    setStage("upload");
    setImporting(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl p-4 sm:p-6 m-4 sm:my-8 animate-modal-in shadow-xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Import Sales
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload an Excel (.xlsx) or CSV file with sale records
            </p>
          </div>
          <button
            onClick={resetModal}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {stage === "upload" && (
          <div className="space-y-4">
            {/* File format info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                Required Columns
              </h3>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p>
                  <strong>fabric_name / fabric</strong> — Fabric name (matches
                  export format)
                </p>
                <p>
                  <strong>meters</strong> — Quantity in meters (number)
                </p>
                <p>
                  <strong>price_per_meter / price</strong> — Selling price per
                  meter (number)
                </p>
              </div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mt-3 mb-2">
                Optional Columns (export format compatible)
              </h3>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p>
                  <strong>customer</strong> — Customer name (creates walk-in or
                  matches existing)
                </p>
                <p>
                  <strong>cost_price_per_meter / cost</strong> — Cost price for
                  margin calculation
                </p>
                <p>
                  <strong>date / sale_date</strong> — Sale date (defaults to
                  today)
                </p>
                <p>
                  <strong>payment / type</strong> — cash / credit / partial
                  (defaults to cash)
                </p>
                <p>
                  <strong>notes</strong> — Additional notes
                </p>
                <p className="mt-2 text-blue-500">
                  You can directly re-upload the exported sales CSV file without
                  any changes!
                </p>
              </div>
            </div>

            {/* File upload */}
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 cursor-pointer hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Click to upload Excel or CSV file
              </p>
              <p className="text-xs text-gray-400 mt-1">
                .xlsx .csv files supported
              </p>
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFile}
                className="hidden"
              />
            </label>

            <div className="flex justify-end">
              <button onClick={resetModal} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage === "preview" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileUp className="w-5 h-5 text-primary-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {rows.length} rows found
                </span>
                {errors.length > 0 && (
                  <span className="text-sm text-warning-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.length} rows with errors
                  </span>
                )}
              </div>
            </div>

            {/* Validation errors */}
            {errors.length > 0 && (
              <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-3">
                <p className="text-xs font-semibold text-warning-700 mb-2">
                  Rows with errors (these will be skipped):
                </p>
                {errors.slice(0, 10).map((e) => (
                  <p key={e.row} className="text-xs text-warning-600">
                    Row {e.row}: {e.errors.join(", ")}
                  </p>
                ))}
                {errors.length > 10 && (
                  <p className="text-xs text-warning-500 mt-1">
                    ...and {errors.length - 10} more
                  </p>
                )}
              </div>
            )}

            {/* Preview table */}
            <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/60 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      #
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Customer
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Fabric
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Meters
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Price/m
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Cost/m
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">
                      Payment
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => {
                    const hasError = errors.some((e) => e.row === idx + 2);
                    return (
                      <tr
                        key={idx}
                        className={`${hasError ? "bg-warning-50" : "hover:bg-gray-50"}`}
                      >
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {row.customer_name || "Walk-in"}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {row.fabric_name}
                        </td>
                        <td className="px-3 py-2 text-right">{row.meters}</td>
                        <td className="px-3 py-2 text-right">
                          ₹{parseFloat(row.price_per_meter || 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {row.cost_price_per_meter
                            ? `₹${parseFloat(row.cost_price_per_meter).toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`badge ${row.payment_type === "cash" ? "bg-accent-100 text-accent-800" : row.payment_type === "credit" ? "bg-warning-100 text-warning-800" : "bg-blue-100 text-blue-800"}`}
                          >
                            {row.payment_type || "cash"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {row.sale_date || "Today"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {hasError ? (
                            <AlertCircle className="w-4 h-4 text-warning-500 inline" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-accent-500 inline" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setStage("upload")}
                className="btn btn-secondary"
                disabled={importing}
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={resetModal}
                  className="btn btn-secondary"
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || rows.length === 0}
                  className="btn btn-primary"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing {rows.length} rows...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import {rows.length - errors.length} Valid Rows
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
