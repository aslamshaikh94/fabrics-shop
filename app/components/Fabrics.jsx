"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Package,
  AlertTriangle,
  ScanLine,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

const PAGE_SIZE = 10;

const emptyRow = {
  name: "",
  total_meters: "",
  purchase_price_per_meter: "",
  quantity: "",
  barcode: "",
};
const emptyForm = { supplier_id: "" };

export default function Fabrics() {
  const [fabrics, setFabrics] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const toast = useToast();
  const [formData, setFormData] = useState(emptyForm);
  const [rows, setRows] = useState([{ ...emptyRow }]);
  const [scanningRowIdx, setScanningRowIdx] = useState(null);

  useEffect(() => {
    fetchFabrics();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterSupplier]);

  async function fetchFabrics() {
    try {
      const { data, error } = await supabase
        .from("fabrics")
        .select("*, supplier:suppliers(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setFabrics(data || []);
    } catch (err) {
      console.error("Error fetching fabrics:", err);
    } finally {
      setLoading(false);
    }
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
        const payloads = validRows.map((r) => ({
          name: r.name,
          purchase_price_per_meter: parseFloat(r.purchase_price_per_meter) || 0,
          total_meters: parseFloat(r.total_meters) || 0,
          available_meters: parseFloat(r.total_meters) || 0,
          supplier_id: formData.supplier_id || null,
          quantity: r.quantity || "",
          barcode: r.barcode || "",
        }));
        const { error } = await supabase.from("fabrics").insert(payloads);
        if (error) throw error;
        toast(
          `${payloads.length} fabric${payloads.length > 1 ? "s" : ""} added`,
        );
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      setRows([{ ...emptyRow }]);
      fetchFabrics();
    } catch (err) {
      console.error("Error saving fabric:", err);
      toast("Failed to save fabric", "error");
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
    return matchesSearch && matchesSupplier;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const lowStock = fabrics.filter((f) => f.available_meters < 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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

      {lowStock.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-600 mt-0.5" />
            <div>
              <p className="font-medium text-warning-800">Low Stock Alert</p>
              <p className="text-sm text-warning-700 mt-1">
                {lowStock
                  .map((f) => `${f.name} (${f.available_meters}m)`)
                  .join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search fabrics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
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
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit Fabric" : "Add Fabrics"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier
                </label>
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Fabric Items
                  </label>
                </div>

                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Item {idx + 1}
                      </span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-gray-400 hover:text-red-500 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Name *
                        </label>
                        <input
                          required
                          className="input bg-white"
                          value={row.name}
                          onChange={(e) =>
                            updateRow(idx, "name", e.target.value)
                          }
                          placeholder="Fabric name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Quantity
                        </label>
                        <input
                          className="input bg-white"
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(idx, "quantity", e.target.value)
                          }
                          placeholder="e.g. 10 Rolls"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Meters
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          className="input bg-white"
                          value={row.total_meters}
                          onChange={(e) =>
                            updateRow(idx, "total_meters", e.target.value)
                          }
                          placeholder="0"
                          onWheel={(e) => e.target.blur()}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Buy ₹/m
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          className="input bg-white"
                          value={row.purchase_price_per_meter}
                          onChange={(e) =>
                            updateRow(
                              idx,
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
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Barcode
                      </label>
                      <div className="flex gap-2">
                        <input
                          className="input bg-white flex-1"
                          value={row.barcode}
                          onChange={(e) =>
                            updateRow(idx, "barcode", e.target.value)
                          }
                          placeholder="Scan or type barcode"
                        />
                        <button
                          type="button"
                          onClick={() => setScanningRowIdx(idx)}
                          className="px-3 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-400 rounded-lg text-gray-500 hover:text-primary-600 transition-colors"
                        >
                          <ScanLine className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!editingId && (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => [...prev, { ...emptyRow }])
                    }
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add row
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
          </div>
        </div>
      )}

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
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Barcode
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Quantity
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Supplier
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
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
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
                <td className="px-4 py-3 text-center">
                  <p
                    className={`font-semibold text-sm ${
                      fabric.available_meters < 10
                        ? "text-red-600"
                        : "text-gray-900"
                    }`}
                  >
                    {fabric.available_meters}m
                    {fabric.available_meters < 10 && (
                      <span className="ml-1">⚠️</span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3 text-center">
                  <p className="text-sm text-gray-900">
                    {fabric.total_meters}m
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm text-gray-900">
                    ₹{fabric.purchase_price_per_meter}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-medium text-gray-900">
                    ₹
                    {(
                      fabric.total_meters * fabric.purchase_price_per_meter
                    ).toLocaleString("en-IN")}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-gray-500">
            {filtered.length} fabrics — page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the fabric."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchTerm
            ? "No fabrics found matching your search"
            : "No fabrics added yet"}
        </div>
      )}
    </div>
  );
}
