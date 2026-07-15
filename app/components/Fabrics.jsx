"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Package,
  TriangleAlert as AlertTriangle,
  ScanLine,
  Download,
  FileUp,
  Trash,
} from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import DateRangeFilter from "./DateRangeFilter";
import { exportCSV } from "../utils/export";
import { formatDate } from "../utils/formatters";
import Modal from "./shared/Modal";
import Pagination from "./shared/Pagination";
import FabricsImport from "./FabricsImport";
import EmptyState from "./shared/EmptyState";
import { SearchInput } from "./shared/FormField";

const PAGE_SIZE = 10;

const emptyRow = {
  name: "",
  total_meters: "",
  purchase_price_per_meter: "",
  quantity: "",
  barcode: "",
};
const emptyForm = { supplier_id: "", purchase_number: "" };

export default function Fabrics() {
  const [fabrics, setFabrics] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const toast = useToast();
  const [formData, setFormData] = useState(emptyForm);
  const [existingPurchaseInfo, setExistingPurchaseInfo] = useState(null);
  const [linkingPurchase, setLinkingPurchase] = useState(false);
  const [rows, setRows] = useState([{ ...emptyRow }]);
  const [scanningRowIdx, setScanningRowIdx] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const purchaseLookupTimer = useRef(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [fabricsRes, suppliersRes] = await Promise.all([
        supabase
          .from("fabrics")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("suppliers").select("*").order("name"),
      ]);
      if (fabricsRes.error) throw fabricsRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      setSuppliers(suppliersRes.data || []);

      const supplierMap = Object.fromEntries(
        (suppliersRes.data || []).map((c) => [c.id, c]),
      );

      const purchaseIds = (fabricsRes.data || [])
        .filter((f) => f.purchase_id)
        .map((f) => f.purchase_id);

      let purchaseMap = {};
      if (purchaseIds.length > 0) {
        const { data: purchases } = await supabase
          .from("purchases")
          .select("id, purchase_number")
          .in("id", purchaseIds);
        if (purchases) {
          purchaseMap = Object.fromEntries(
            purchases.map((p) => [p.id, p.purchase_number]),
          );
        }
      }

      setFabrics(
        (fabricsRes.data || []).map((f) => ({
          ...f,
          supplier: supplierMap[f.supplier_id] || null,
          purchase: f.purchase_id
            ? { purchase_number: purchaseMap[f.purchase_id] || null }
            : null,
        })),
      );
    } catch (err) {
      console.error("Error fetching fabrics data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFabrics() {
    await fetchAll();
  }

  async function fetchSuppliers() {
    try {
      const { data } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      setSuppliers(data || []);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    }
  }

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [searchTerm, filterSupplier, dateFrom, dateTo]);

  const handlePurchaseNumberChange = useCallback((e) => {
    const val = e.target.value;
    setFormData((prev) => ({ ...prev, purchase_number: val }));
    clearTimeout(purchaseLookupTimer.current);
    if (!val.trim()) {
      setExistingPurchaseInfo(null);
      return;
    }
    purchaseLookupTimer.current = setTimeout(async () => {
      const { data: purchase } = await supabase
        .from("purchases")
        .select("id, purchase_number, total_amount, supplier_id")
        .eq("purchase_number", val.trim())
        .single();
      if (purchase) {
        const { data: supplier } = await supabase
          .from("suppliers")
          .select("name")
          .eq("id", purchase.supplier_id)
          .single();
        setExistingPurchaseInfo({
          ...purchase,
          supplier: supplier || null,
        });
      } else {
        setExistingPurchaseInfo(null);
      }
    }, 400);
  }, []);

  function updateRow(idx, field, value) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        const r = rows[0];
        const existing = fabrics.find((f) => f.id === editingId);
        const oldTotal = existing?.total_meters || 0;
        const newTotal = parseFloat(r.total_meters) || 0;
        const diff = newTotal - oldTotal;
        const newAvailable = Math.max(
          0,
          (existing?.available_meters || 0) + diff,
        );
        const payload = {
          name: r.name,
          purchase_price_per_meter: parseFloat(r.purchase_price_per_meter) || 0,
          total_meters: newTotal,
          available_meters: newAvailable,
          supplier_id: formData.supplier_id || null,
          quantity: r.quantity || "",
          barcode: r.barcode || "",
        };
        const { error } = await supabase
          .from("fabrics")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast("Fabric updated");
      } else {
        const validRows = rows.filter((r) => r.name.trim());

        // Determine purchase_id - link to existing purchase or create new
        let purchaseId;
        const newFabricsTotal = validRows.reduce(
          (sum, r) =>
            sum +
            (parseFloat(r.total_meters) || 0) *
              (parseFloat(r.purchase_price_per_meter) || 0),
          0,
        );
        if (existingPurchaseInfo) {
          // Link to the existing purchase by its ID
          // Recalculate total from ALL fabrics linked to this purchase
          purchaseId = existingPurchaseInfo.id;
          const { data: linkedFabrics } = await supabase
            .from("fabrics")
            .select("total_meters, purchase_price_per_meter")
            .eq("purchase_id", purchaseId);
          const existingTotal = (linkedFabrics || []).reduce(
            (sum, f) =>
              sum +
              (parseFloat(f.total_meters) || 0) *
                (parseFloat(f.purchase_price_per_meter) || 0),
            0,
          );
          const { error: updateError } = await supabase
            .from("purchases")
            .update({
              total_amount: existingTotal + newFabricsTotal,
            })
            .eq("id", purchaseId);
          if (updateError) throw updateError;
        } else {
          // Create a new purchase record
          const { data: purchaseData, error: purchaseError } = await supabase
            .from("purchases")
            .insert([
              {
                supplier_id: formData.supplier_id || null,
                total_amount: newFabricsTotal,
                purchase_date: new Date().toISOString().split("T")[0],
                notes: `Fabric purchase: ${validRows.map((r) => r.name).join(", ")}`,
                status: "pending",
              },
            ])
            .select()
            .single();
          if (purchaseError) throw purchaseError;
          purchaseId = purchaseData.id;
        }

        const payloads = validRows.map((r) => ({
          name: r.name,
          purchase_price_per_meter: parseFloat(r.purchase_price_per_meter) || 0,
          total_meters: parseFloat(r.total_meters) || 0,
          available_meters: parseFloat(r.total_meters) || 0,
          supplier_id: formData.supplier_id || null,
          quantity: r.quantity || "",
          barcode: r.barcode || "",
          purchase_id: purchaseId,
        }));
        const { error } = await supabase.from("fabrics").insert(payloads);
        if (error) throw error;
        toast(
          `${payloads.length} fabric${payloads.length > 1 ? "s" : ""} added${existingPurchaseInfo ? " and linked to " + existingPurchaseInfo.purchase_number : " with purchase record"}`,
        );
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      setRows([{ ...emptyRow }]);
      setExistingPurchaseInfo(null);
      setLinkingPurchase(false);
      fetchFabrics();
    } catch (err) {
      console.error("Error saving fabric:", err);
      toast(err?.message || "Failed to save fabric", "error");
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === paginated.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map((f) => f.id)));
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase.from("fabrics").delete().in("id", ids);
      if (error) throw error;
      toast(`${ids.length} fabric${ids.length > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      fetchFabrics();
    } catch (err) {
      toast("Failed to delete fabrics", "error");
      setConfirmBulkDelete(false);
    }
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from("fabrics").delete().eq("id", id);
      if (error) throw error;
      toast("Fabric deleted");
      fetchFabrics();
    } catch (err) {
      console.error("Error deleting fabric:", err);
      toast("Cannot delete fabric with associated sales", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  function handleEdit(fabric) {
    setFormData({ supplier_id: fabric.supplier_id || "" });
    setRows([
      {
        name: fabric.name,
        purchase_price_per_meter: fabric.purchase_price_per_meter.toString(),
        total_meters: fabric.total_meters.toString(),
        quantity: fabric.quantity || "",
        barcode: fabric.barcode || "",
      },
    ]);
    setEditingId(fabric.id);
    setShowForm(true);
  }

  const filtered = fabrics.filter((f) => {
    const matchesSearch = f.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesSupplier =
      filterSupplier === "all" || f.supplier_id === filterSupplier;
    const matchesFrom = !dateFrom || (f.created_at && f.created_at >= dateFrom);
    const matchesTo =
      !dateTo || (f.created_at && f.created_at <= dateTo + "T23:59:59");
    return matchesSearch && matchesSupplier && matchesFrom && matchesTo;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const lowStock = fabrics.filter((f) => f.available_meters < 2);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fabrics</h1>
          <p className="text-gray-500 mt-1">Manage your fabric inventory</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelectedIds(new Set());
            }}
            className={`btn ${selectMode ? "btn-primary" : "btn-ghost"}`}
            title={selectMode ? "Exit selection mode" : "Select fabrics"}
          >
            <Trash className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="btn btn-secondary"
            title="Import from Excel/CSV"
          >
            <FileUp className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              exportCSV(
                filtered.map((f) => ({
                  name: f.name,
                  barcode: f.barcode || "",
                  quantity: f.quantity || "",
                  supplier: f.supplier?.name || "",
                  total_meters: f.total_meters,
                  available_meters: f.available_meters,
                  buy_price_per_meter: f.purchase_price_per_meter,
                  total_price: f.total_meters * f.purchase_price_per_meter,
                })),
                `fabrics-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setFormData(emptyForm);
              setRows([{ ...emptyRow }]);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Fabric
          </button>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5" />
            <div>
              <p className="font-medium text-warning-800">Low Stock Alert</p>
              <p className="text-sm text-warning-700 mt-1">
                {lowStock
                  .map(
                    (f) =>
                      `${f.name} (${(f.available_meters || 0).toFixed(2)}m)`,
                  )
                  .join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search fabrics..."
        />
        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          className="input w-full sm:w-48"
        >
          <option value="all">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          label="Added"
          resetPage={() => setPage(1)}
        />
      </div>

      <FabricsImport
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => fetchAll()}
        suppliers={suppliers}
      />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? "Edit Fabric" : "Add Fabrics"}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Supplier
            </span>
            <select
              value={formData.supplier_id}
              onChange={(e) =>
                setFormData({ ...formData, supplier_id: e.target.value })
              }
              className="input"
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Link to existing purchase */}
          {!editingId && (
            <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Link to Existing Purchase (optional)
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  value={formData.purchase_number}
                  onChange={handlePurchaseNumberChange}
                  placeholder="Enter purchase number (e.g. PUR-00001)"
                />
              </div>
              {existingPurchaseInfo && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-800">
                    ✓ Linked to {existingPurchaseInfo.purchase_number}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Supplier: {existingPurchaseInfo.supplier?.name} — ₹
                    {existingPurchaseInfo.total_amount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Fabric Items
              </span>
              {rows.length > 1 && !editingId && (
                <span className="text-xs font-medium text-white bg-accent-500 px-2.5 py-1.5 rounded-full">
                  {rows.length - 1} added
                </span>
              )}
            </div>

            {/* Display Added Items (all except the last one) */}
            {rows.length > 1 && !editingId && (
              <div className="space-y-2 mb-3 pb-3 border-b border-gray-200">
                {rows.slice(0, -1).map((row, idx) => (
                  <div
                    key={idx}
                    className="border border-green-200 rounded-lg p-3 bg-green-50 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-green-600" />
                        <p className="font-semibold text-gray-900">
                          {row.name || `Item ${idx + 1}`}
                        </p>
                      </div>
                      <p className="text-xs text-gray-700 font-medium">
                        {row.total_meters ? `${row.total_meters}m` : ""}
                        {row.purchase_price_per_meter
                          ? ` @ ₹${row.purchase_price_per_meter}/m`
                          : ""}
                        {row.quantity ? ` • ${row.quantity}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="ml-2 p-2 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                      title="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Current Item Form */}
            {(() => {
              const currentIdx = rows.length - 1;
              const row = rows[currentIdx];
              return (
                <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-white">
                  <span className="text-[10px] font-bold text-gray-900 uppercase bg-gray-100 px-2 py-1 rounded">
                    {editingId ? "Edit Fabric" : `New Item ${rows.length}`}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-900 mb-1">
                        Name *
                      </label>
                      <input
                        className="input bg-white"
                        value={row.name}
                        onChange={(e) =>
                          updateRow(currentIdx, "name", e.target.value)
                        }
                        placeholder="Fabric name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-900 mb-1">
                        Quantity
                      </label>
                      <input
                        className="input bg-white"
                        value={row.quantity}
                        onChange={(e) =>
                          updateRow(currentIdx, "quantity", e.target.value)
                        }
                        placeholder="e.g. 10 Rolls"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-900 mb-1">
                        Meters
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input bg-white"
                        value={row.total_meters}
                        onChange={(e) =>
                          updateRow(currentIdx, "total_meters", e.target.value)
                        }
                        placeholder="0"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-900 mb-1">
                        Buy ₹/m
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="input bg-white"
                        value={row.purchase_price_per_meter}
                        onChange={(e) =>
                          updateRow(
                            currentIdx,
                            "purchase_price_per_meter",
                            e.target.value,
                          )
                        }
                        placeholder="0"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-1">
                      Barcode
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="input bg-white flex-1"
                        value={row.barcode}
                        onChange={(e) =>
                          updateRow(currentIdx, "barcode", e.target.value)
                        }
                        placeholder="Scan or type barcode"
                      />
                      <button
                        type="button"
                        onClick={() => setScanningRowIdx(currentIdx)}
                        className="px-3 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-400 rounded-lg text-gray-500 hover:text-primary-600 transition-colors"
                      >
                        <ScanLine className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {!editingId && (
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, { ...emptyRow }])}
                className="w-full btn btn-primary flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              {editingId ? "Update" : "Add"} Fabric
            </button>
          </div>
        </form>
      </Modal>

      {scanningRowIdx !== null && (
        <BarcodeScanner
          onScan={(code) => {
            updateRow(scanningRowIdx, "barcode", code);
            setScanningRowIdx(null);
          }}
          onClose={() => setScanningRowIdx(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {selectMode && (
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={
                      paginated.length > 0 &&
                      selectedIds.size === paginated.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Barcode
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Qty
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Supplier
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Purchase #
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Date Added
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                Available
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                Total
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                Buy ₹/m
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                Total Price
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((fabric) => (
              <tr
                key={fabric.id}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedIds.has(fabric.id) ? "bg-primary-50" : ""}`}
              >
                {selectMode && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(fabric.id)}
                      onChange={() => toggleSelect(fabric.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{fabric.name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-gray-600 font-mono">
                    {fabric.barcode || "—"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-gray-600">
                    {fabric.quantity || "—"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-gray-600">
                    {fabric.supplier?.name || "—"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs text-gray-600 font-mono">
                    {fabric.purchase?.purchase_number || "—"}
                  </p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="text-sm text-gray-600">
                    {fabric.created_at ? formatDate(fabric.created_at) : "—"}
                  </p>
                </td>
                <td className="px-4 py-3 text-center">
                  <p
                    className={`font-semibold text-sm ${
                      fabric.available_meters < 2
                        ? "text-red-600"
                        : "text-gray-900"
                    }`}
                  >
                    {(fabric.available_meters || 0).toFixed(2)}m
                    {fabric.available_meters < 2 && (
                      <span className="ml-1">⚠️</span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3 text-center">
                  <p className="text-sm text-gray-900">
                    {(fabric.total_meters || 0).toFixed(2)}m
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm text-gray-900">
                    ₹{(fabric.purchase_price_per_meter || 0).toFixed(2)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-medium text-gray-900">
                    ₹
                    {(
                      (fabric.total_meters || 0) *
                      (fabric.purchase_price_per_meter || 0)
                    ).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {fabric.purchase?.purchase_number && (
                      <button
                        onClick={() => {
                          localStorage.setItem(
                            "prefill_purchase_number",
                            fabric.purchase.purchase_number,
                          );
                          window.dispatchEvent(
                            new CustomEvent("navigate", {
                              detail: { page: "purchases" },
                            }),
                          );
                        }}
                        className="p-2 hover:bg-blue-100 rounded-lg text-gray-500 hover:text-blue-600"
                        title={"View " + fabric.purchase.purchase_number}
                      >
                        <span className="text-xs font-mono">🛒</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(fabric)}
                      className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-700"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(fabric.id)}
                      className="p-2 hover:bg-red-100 rounded-lg text-gray-500 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-xl px-4 py-3">
          <span className="text-sm text-primary-700">
            <strong>{selectedIds.size}</strong> fabric
            {selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="btn btn-secondary text-sm"
            >
              Clear Selection
            </button>
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="btn text-sm"
              style={{ backgroundColor: "#dc2626", color: "white" }}
            >
              <Trash className="w-4 h-4 mr-1" />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={(p) => {
          setPage(p);
          setSelectedIds(new Set());
        }}
        totalItems={filtered.length}
        label="fabrics"
      />

      {confirmBulkDelete && (
        <ConfirmModal
          message={`This will permanently delete ${selectedIds.size} fabric${selectedIds.size > 1 ? "s" : ""}.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the fabric."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filtered.length === 0 && (
        <EmptyState
          icon={Package}
          title="No fabrics added yet"
          searchTerm={searchTerm}
          description={
            searchTerm
              ? "Try a different search term"
              : "Click Add Fabric to get started"
          }
        />
      )}
    </div>
  );
}
