"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Phone,
  MapPin,
  BookOpen,
  DollarSign,
  Download,
} from "lucide-react";
import { validateSupplier, hasErrors } from "../utils/validators";
import { exportCSV } from "../utils/export";
import SupplierLedger from "./SupplierLedger";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import Pagination from "./shared/Pagination";
import EmptyState from "./shared/EmptyState";
import { SearchInput } from "./shared/FormField";

const PAGE_SIZE = 9;

export default function Suppliers() {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const [ledgerSupplier, setLedgerSupplier] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  async function fetchSuppliers() {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validateSupplier(formData);
    if (hasErrors(errors)) {
      setFormErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    setFormErrors({});
    try {
      if (editingId) {
        const { error } = await supabase
          .from("suppliers")
          .update(formData)
          .eq("id", editingId);
        if (error) throw error;
        toast("Supplier updated successfully");
      } else {
        const { error } = await supabase.from("suppliers").insert([formData]);
        if (error) throw error;
        toast("Supplier added successfully");
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: "", phone: "", address: "", notes: "" });
      setFormErrors({});
      fetchSuppliers();
    } catch (error) {
      console.error("Error saving supplier:", error);
      toast("Failed to save supplier", "error");
    }
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
      toast("Supplier deleted");
      fetchSuppliers();
    } catch (error) {
      console.error("Error deleting supplier:", error);
      toast("Cannot delete supplier with associated records", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  function handleEdit(supplier) {
    setFormData({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      notes: supplier.notes,
    });
    setEditingId(supplier.id);
    setShowForm(true);
  }

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm),
  );

  const totalPages = Math.ceil(filteredSuppliers.length / PAGE_SIZE);
  const paginated = filteredSuppliers.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-gray-500 mt-1">
            Manage your wholesalers and vendors
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              exportCSV(
                filteredSuppliers.map((s) => ({
                  name: s.name,
                  phone: s.phone || "",
                  address: s.address || "",
                  notes: s.notes || "",
                })),
                `suppliers-${new Date().toISOString().slice(0, 10)}.csv`,
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
              setFormData({ name: "", phone: "", address: "", notes: "" });
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Supplier
          </button>
        </div>
      </div>

      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search suppliers..."
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit Supplier" : "Add Supplier"}
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
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (formErrors.name)
                      setFormErrors({ ...formErrors, name: "" });
                  }}
                  className={`input ${formErrors.name ? "border-error-400" : ""}`}
                  placeholder="Supplier name"
                />
                {formErrors.name && (
                  <p className="text-error-600 text-sm mt-1">
                    {formErrors.name}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (formErrors.phone)
                      setFormErrors({ ...formErrors, phone: "" });
                  }}
                  className={`input ${formErrors.phone ? "border-error-400" : ""}`}
                  placeholder="Phone number"
                />
                {formErrors.phone && (
                  <p className="text-error-600 text-sm mt-1">
                    {formErrors.phone}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="input"
                  placeholder="Address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="input"
                  rows={3}
                  placeholder="Additional notes"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingId ? "Update" : "Add"} Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.map((supplier) => (
          <div key={supplier.id} className="card-hover p-5">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{supplier.name}</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setLedgerSupplier(supplier)}
                  className="p-1.5 hover:bg-primary-50 rounded-lg text-gray-500 hover:text-primary-600"
                  title="View Ledger"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEdit(supplier)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(supplier.id)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              {supplier.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>{supplier.address}</span>
                </div>
              )}
              {supplier.notes && (
                <p className="text-gray-500 italic text-xs mt-2">
                  {supplier.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredSuppliers.length}
        label="suppliers"
      />

      {ledgerSupplier && (
        <SupplierLedger
          supplier={ledgerSupplier}
          onClose={() => setLedgerSupplier(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the supplier."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filteredSuppliers.length === 0 && (
        <EmptyState
          icon={DollarSign}
          title="No suppliers added yet"
          searchTerm={searchTerm}
          description={
            searchTerm
              ? "Try a different search term"
              : "Click Add Supplier to get started"
          }
        />
      )}
    </div>
  );
}
