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

// Column mapping for fabrics import
const COLUMN_MAP = {
  name: "name",
  fabric: "name",
  fabric_name: "name",
  barcode: "barcode",
  quantity: "quantity",
  qty: "quantity",
  total_meters: "total_meters",
  meters: "total_meters",
  total: "total_meters",
  purchase_price_per_meter: "purchase_price_per_meter",
  buy_price: "purchase_price_per_meter",
  buy_price_per_meter: "purchase_price_per_meter",
  price: "purchase_price_per_meter",
  cost: "purchase_price_per_meter",
  selling_price_per_meter: "selling_price_per_meter",
  sell_price: "selling_price_per_meter",
  selling_price: "selling_price_per_meter",
  type: "type",
  color: "color",
  supplier: "supplier_name",
  supplier_name: "supplier_name",
  notes: "notes",
};

const REQUIRED_COLS = ["name", "total_meters", "purchase_price_per_meter"];

export default function FabricsImport({
  open,
  onClose,
  onImported,
  suppliers,
}) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState("upload"); // upload | preview | done

  const supplierMap = {};
  (suppliers || []).forEach((s) => {
    supplierMap[s.name.toLowerCase()] = s;
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
          const text = new TextDecoder().decode(buffer);
          workbook = XLSX.read(text, { type: "string" });
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!json || json.length === 0) {
          toast("No data found in file", "error");
          return;
        }

        // Debug
        console.log("Fabric Import: first row keys", Object.keys(json[0]));
        console.log(
          "Fabric Import: first row values",
          JSON.stringify(json[0]).slice(0, 300),
        );

        // Normalise keys
        const normalised = json.map((row) => {
          const nr = {};
          Object.keys(row).forEach((key) => {
            const k = key.toLowerCase().trim();
            const targetKey =
              COLUMN_MAP[k] || COLUMN_MAP[k.replace(/[\s]+/g, "")] || k;
            nr[targetKey] = String(row[key]).trim();
          });

          // Map supplier_name to supplier lookup
          if (nr.supplier_name && supplierMap[nr.supplier_name.toLowerCase()]) {
            nr.supplier_id = supplierMap[nr.supplier_name.toLowerCase()].id;
          }

          return nr;
        });

        console.log(
          "Fabric Import: normalised first row",
          JSON.stringify(normalised[0]).slice(0, 300),
        );

        // Validate rows
        const rowErrors = [];
        normalised.forEach((row, idx) => {
          const errs = [];
          if (!row.name) errs.push("Missing fabric name");
          if (
            !row.total_meters ||
            isNaN(parseFloat(row.total_meters)) ||
            parseFloat(row.total_meters) <= 0
          )
            errs.push("Invalid total meters");
          if (
            !row.purchase_price_per_meter ||
            isNaN(parseFloat(row.purchase_price_per_meter)) ||
            parseFloat(row.purchase_price_per_meter) <= 0
          )
            errs.push("Invalid purchase price per meter");
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
    [suppliers, toast],
  );

  async function handleImport() {
    setImporting(true);
    try {
      let imported = 0;
      let failed = 0;

      // Skip rows with validation errors
      const errorIndices = new Set(errors.map((e) => e.row - 2));
      const validRows = rows.filter((_, idx) => !errorIndices.has(idx));

      if (validRows.length === 0) {
        toast("No valid rows to import", "error");
        setImporting(false);
        return;
      }

      // Group by supplier to create purchase records
      const groups = {};
      validRows.forEach((row, idx) => {
        const supplierId = row.supplier_id || "none";
        if (!groups[supplierId])
          groups[supplierId] = { rows: [], groupId: generateUUID() };
        groups[supplierId].rows.push({ ...row, idx });
      });

      for (const [supplierKey, group] of Object.entries(groups)) {
        const supplierId = supplierKey === "none" ? null : supplierKey;
        const firstRow = group.rows[0];

        // Calculate total for this group
        const groupTotal = group.rows.reduce(
          (sum, row) =>
            sum +
            (parseFloat(row.total_meters) || 0) *
              (parseFloat(row.purchase_price_per_meter) || 0),
          0,
        );

        // Create a single purchase record for this batch
        const { data: purchaseData, error: purchaseError } = await supabase
          .from("purchases")
          .insert([
            {
              supplier_id: supplierId,
              total_amount: groupTotal,
              purchase_date: new Date().toISOString().split("T")[0],
              notes: `Bulk import: ${group.rows.length} fabric(s)`,
              status: "pending",
            },
          ])
          .select()
          .single();

        if (purchaseError) {
          console.error("Error creating purchase:", purchaseError);
          toast(`Purchase creation error: ${purchaseError.message}`, "error");
          failed += group.rows.length;
          continue;
        }

        // Build fabric payloads
        const fabricPayloads = group.rows.map((row) => ({
          name: row.name,
          barcode: row.barcode || "",
          quantity: row.quantity || "",
          total_meters: parseFloat(row.total_meters) || 0,
          available_meters: parseFloat(row.total_meters) || 0,
          purchase_price_per_meter:
            parseFloat(row.purchase_price_per_meter) || 0,
          selling_price_per_meter: parseFloat(row.selling_price_per_meter) || 0,
          supplier_id: supplierId,
          purchase_id: purchaseData.id,
          type: row.type || "",
          color: row.color || "",
          notes: row.notes || "",
        }));

        const { error: fabricError } = await supabase
          .from("fabrics")
          .insert(fabricPayloads);

        if (fabricError) {
          console.error("Error inserting fabrics:", fabricError);
          toast(`Fabric insert error: ${fabricError.message}`, "error");
          failed += group.rows.length;
          continue;
        }

        imported += group.rows.length;
      }

      if (failed > 0) {
        toast(`${imported} fabrics imported, ${failed} failed`, "warning");
      } else {
        toast(`${imported} fabrics imported successfully`);
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
              Import Fabrics
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload an Excel (.xlsx) or CSV file with fabric records
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
                  <strong>name / fabric_name</strong> — Fabric name
                </p>
                <p>
                  <strong>total_meters / meters</strong> — Total meters (number)
                </p>
                <p>
                  <strong>purchase_price_per_meter / buy_price / cost</strong> —
                  Purchase price per meter (number)
                </p>
              </div>
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mt-3 mb-2">
                Optional Columns
              </h3>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p>
                  <strong>barcode</strong> — Barcode for scanning
                </p>
                <p>
                  <strong>quantity / qty</strong> — Quantity text (e.g. "10
                  Rolls")
                </p>
                <p>
                  <strong>selling_price_per_meter / sell_price</strong> —
                  Selling price per meter
                </p>
                <p>
                  <strong>supplier / supplier_name</strong> — Supplier name
                  (must match an existing supplier)
                </p>
                <p>
                  <strong>type</strong> — Fabric type
                </p>
                <p>
                  <strong>color</strong> — Fabric color
                </p>
                <p>
                  <strong>notes</strong> — Additional notes
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
                      Name
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Barcode
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Quantity
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Meters
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Buy ₹/m
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-500">
                      Sell ₹/m
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Supplier
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
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {row.barcode || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {row.quantity || "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.total_meters}m
                        </td>
                        <td className="px-3 py-2 text-right">
                          ₹
                          {parseFloat(
                            row.purchase_price_per_meter || 0,
                          ).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.selling_price_per_meter
                            ? `₹${parseFloat(row.selling_price_per_meter).toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.supplier_name || "—"}
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
