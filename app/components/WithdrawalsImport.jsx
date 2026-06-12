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

function excelSerialToDateStr(serial) {
  const epoch = new Date(1899, 11, 30);
  const days = Math.floor(serial);
  const date = new Date(epoch.getTime() + days * 86400000);
  return date.toISOString().split("T")[0];
}

function isExcelSerialDate(value) {
  return typeof value === "number" && value > 40000 && value < 70000;
}

const COLUMN_MAP = {
  amount: "amount",
  date: "withdrawal_date",
  withdrawal_date: "withdrawal_date",
  withdrawn_by: "withdrawn_by",
  withdrawn: "withdrawn_by",
  person: "withdrawn_by",
  reason: "reason",
  notes: "reason",
  purpose: "reason",
};

const REQUIRED_COLS = ["amount"];

export default function WithdrawalsImport({ open, onClose, onImported }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState("upload");

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

        const normalised = json.map((row) => {
          const nr = {};
          Object.keys(row).forEach((key) => {
            const k = key.toLowerCase().trim();
            const targetKey =
              COLUMN_MAP[k] || COLUMN_MAP[k.replace(/[\s]+/g, "")] || k;
            const rawValue = row[key];
            if (
              ["withdrawal_date", "date"].includes(targetKey) &&
              isExcelSerialDate(rawValue)
            ) {
              nr[targetKey] = excelSerialToDateStr(rawValue);
            } else {
              nr[targetKey] = String(rawValue).trim();
            }
          });

          if (nr.notes && !nr.reason) nr.reason = nr.notes;
          if (nr.purpose && !nr.reason) nr.reason = nr.purpose;
          if (nr.person && !nr.withdrawn_by) nr.withdrawn_by = nr.person;

          return nr;
        });

        const rowErrors = [];
        normalised.forEach((row, idx) => {
          const errs = [];
          if (
            !row.amount ||
            isNaN(parseFloat(row.amount)) ||
            parseFloat(row.amount) <= 0
          )
            errs.push("Invalid amount");
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

      const errorIndices = new Set(errors.map((e) => e.row - 2));
      const validRows = rows.filter((_, idx) => !errorIndices.has(idx));

      if (validRows.length === 0) {
        toast("No valid rows to import", "error");
        setImporting(false);
        return;
      }

      for (const row of validRows) {
        const withdrawalDate =
          row.withdrawal_date || new Date().toISOString().split("T")[0];
        const amount = parseFloat(row.amount) || 0;

        const { error } = await supabase.from("withdrawals").insert([
          {
            amount,
            withdrawal_date: withdrawalDate,
            withdrawn_by: row.withdrawn_by || "",
            reason: row.reason || "",
          },
        ]);

        if (error) {
          console.error("Error inserting withdrawal:", error);
          failed++;
          continue;
        }

        imported++;
      }

      if (failed > 0) {
        toast(`${imported} withdrawals imported, ${failed} failed`, "warning");
      } else {
        toast(`${imported} withdrawals imported successfully`);
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
              Import Withdrawals
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload an Excel (.xlsx) or CSV file with withdrawal records
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
                  <strong>amount</strong> — Withdrawal amount (number)
                </p>
              </div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mt-3 mb-2">
                Optional Columns
              </h3>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p>
                  <strong>date / withdrawal_date</strong> — Withdrawal date
                  (defaults to today)
                </p>
                <p>
                  <strong>withdrawn_by / person</strong> — Person who took the
                  withdrawal
                </p>
                <p>
                  <strong>reason / notes / purpose</strong> — Purpose of
                  withdrawal
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
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Withdrawn By
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Reason
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
                        <td className="px-3 py-2 text-right font-medium">
                          ₹{parseFloat(row.amount || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2">
                          {row.withdrawal_date || "Today"}
                        </td>
                        <td className="px-3 py-2">{row.withdrawn_by || "—"}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">
                          {row.reason || "—"}
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
