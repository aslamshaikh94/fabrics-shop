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

const CATEGORIES = [
  "Rent",
  "Electricity",
  "Staff Salary",
  "Transport",
  "Packaging",
  "Maintenance",
  "Marketing",
  "Other",
];

// Expected/optional columns mapped to DB fields
const COLUMN_MAP = {
  title: "title",
  category: "category",
  amount: "amount",
  date: "expense_date",
  expense_date: "expense_date",
  paid_by: "paid_by",
  paidby: "paid_by",
  notes: "notes",
};

const REQUIRED_COLS = ["title", "amount"];

/**
 * Convert an Excel serial date number to a YYYY-MM-DD date string.
 * Excel serial date 1 = January 1, 1900.
 * Supports both integer (date only) and fractional (date + time) values.
 */
function excelSerialToDateStr(serial) {
  const epoch = new Date(1899, 11, 30); // Dec 30, 1899 (accounts for the leap year bug)
  const days = Math.floor(serial);
  const date = new Date(epoch.getTime() + days * 86400000);
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

/** Check if a value is an Excel serial date number (positive number, not already a string). */
function isExcelSerialDate(value) {
  return typeof value === "number" && value > 40000 && value < 70000;
}

export default function ExpensesImport({ open, onClose, onImported }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState("upload"); // upload | preview | done

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
          const text = new TextDecoder().decode(buffer);
          workbook = XLSX.read(text, { type: "string" });
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!json || json.length === 0) {
          toast("No data found in file", "error");
          return;
        }

        // Normalise keys: lowercase, trim
        const normalised = json.map((row) => {
          const nr = {};
          Object.keys(row).forEach((key) => {
            const k = key.toLowerCase().trim();
            const targetKey = COLUMN_MAP[k] || k;
            const rawValue = row[key];
            // Convert Excel serial date numbers to date strings
            if (targetKey === "expense_date" && isExcelSerialDate(rawValue)) {
              nr[targetKey] = excelSerialToDateStr(rawValue);
            } else {
              nr[targetKey] = String(rawValue).trim();
            }
          });

          // Normalise category to title case match
          if (nr.category) {
            const match = CATEGORIES.find(
              (c) => c.toLowerCase() === nr.category.toLowerCase(),
            );
            if (match) nr.category = match;
          }

          return nr;
        });

        // Validate rows
        const rowErrors = [];
        normalised.forEach((row, idx) => {
          const errs = [];
          if (!row.title) errs.push("Missing title");
          if (
            !row.amount ||
            isNaN(parseFloat(row.amount)) ||
            parseFloat(row.amount) <= 0
          )
            errs.push("Invalid amount");
          if (row.category && !CATEGORIES.includes(row.category))
            errs.push(`Category must be one of: ${CATEGORIES.join(", ")}`);
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
    [toast],
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

      // Build expense payloads
      const expensePayloads = validRows.map((row) => ({
        title: row.title,
        category: row.category || "Other",
        amount: parseFloat(row.amount) || 0,
        expense_date:
          row.expense_date || new Date().toISOString().split("T")[0],
        paid_by: row.paid_by || "",
        notes: row.notes || "",
      }));

      const { error: insertError } = await supabase
        .from("expenses")
        .insert(expensePayloads);

      if (insertError) {
        console.error("Error inserting expenses:", insertError);
        toast(
          `Import error: ${insertError.message || JSON.stringify(insertError)}`,
          "error",
        );
        failed = validRows.length;
      } else {
        imported = validRows.length;
      }

      if (failed > 0) {
        toast(`${imported} expenses imported, ${failed} failed`, "warning");
      } else {
        toast(`${imported} expenses imported successfully`);
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
              Import Expenses
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload an Excel (.xlsx) or CSV file with expense records
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
                  <strong>title</strong> — Expense title / description
                </p>
                <p>
                  <strong>amount</strong> — Expense amount (number, must be
                  positive)
                </p>
              </div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mt-3 mb-2">
                Optional Columns (export format compatible)
              </h3>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p>
                  <strong>category</strong> — One of: Rent, Electricity, Staff
                  Salary, Transport, Packaging, Maintenance, Marketing, Other
                  (defaults to Other)
                </p>
                <p>
                  <strong>date / expense_date</strong> — Expense date (defaults
                  to today)
                </p>
                <p>
                  <strong>paid_by</strong> — Who paid the expense
                </p>
                <p>
                  <strong>notes</strong> — Additional notes
                </p>
                <p className="mt-2 text-blue-500">
                  You can directly re-upload the exported expenses CSV file
                  without any changes!
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
                      Title
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Category
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Paid By
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-500">
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
                        <td className="px-3 py-2 font-medium">{row.title}</td>
                        <td className="px-3 py-2">
                          <span className="badge bg-gray-100 text-gray-800">
                            {row.category || "Other"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-red-600">
                          ₹
                          {parseFloat(row.amount || 0).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {row.expense_date || "Today"}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.paid_by || "—"}
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
