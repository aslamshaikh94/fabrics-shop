"use client";
import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Pencil,
  Trash2,
  Phone,
  MapPin,
  BookOpen,
  DollarSign,
} from "lucide-react";
import { validateSupplier, hasErrors } from "../utils/validators";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import Modal from "./shared/Modal";
import Pagination from "./shared/Pagination";
import LoadingSpinner from "./shared/LoadingSpinner";
import EmptyState from "./shared/EmptyState";
import FormField, { SearchInput, FormActions } from "./shared/FormField";
import { useCrud } from "../hooks/useCrud";
import { usePagedList } from "../hooks/usePagedList";

const PAGE_SIZE = 9;

// Ledger dialog only loads when a supplier row is opened.
const SupplierLedger = dynamic(() => import("./SupplierLedger"), {
  ssr: false,
});

const emptyForm = { name: "", phone: "", address: "", notes: "" };

export default function Suppliers() {
  const toast = useToast();
  const {
    data: suppliers,
    loading,
    create,
    update,
    remove,
  } = useCrud("suppliers", {
    select: "id, name, phone, address, notes, created_at",
    orderBy: { column: "created_at", ascending: false },
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [ledgerSupplier, setLedgerSupplier] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const setField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field])
      setFormErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.phone.includes(searchTerm),
      ),
    [suppliers, searchTerm],
  );

  const { page, setPage, paginated, totalPages, total } = usePagedList(
    filteredSuppliers,
    PAGE_SIZE,
    [searchTerm],
  );

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validateSupplier(formData);
    if (hasErrors(errors)) {
      setFormErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      if (editingId) {
        await update(editingId, formData);
        toast("Supplier updated successfully");
      } else {
        await create(formData);
        toast("Supplier added successfully");
      }
      closeForm();
    } catch (error) {
      console.error("Error saving supplier:", error);
      toast("Failed to save supplier", "error");
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
  }

  async function handleDelete(id) {
    try {
      await remove(id);
      toast("Supplier deleted");
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

  if (loading) return <LoadingSpinner className="h-64" />;

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
          <button onClick={closeForm} className="btn btn-primary">
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

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        title={editingId ? "Edit Supplier" : "Add Supplier"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            field="name"
            label="Name"
            required
            value={formData.name}
            error={formErrors.name}
            onChange={setField}
            placeholder="Supplier name"
          />
          <FormField
            field="phone"
            label="Phone"
            value={formData.phone}
            error={formErrors.phone}
            onChange={setField}
            placeholder="Phone number"
          />
          <FormField
            field="address"
            label="Address"
            value={formData.address}
            onChange={setField}
            placeholder="Address"
          />
          <FormField
            field="notes"
            label="Notes"
            value={formData.notes}
            onChange={setField}
            placeholder="Additional notes"
          >
            <textarea
              value={formData.notes}
              onChange={(e) => setField("notes", e.target.value)}
              className="input"
              rows={3}
              placeholder="Additional notes"
            />
          </FormField>
          <FormActions
            onCancel={() => {
              setShowForm(false);
              setEditingId(null);
            }}
            isSubmitting={saving}
            submitLabel={editingId ? "Update Supplier" : "Add Supplier"}
          />
        </form>
      </Modal>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginated.map((supplier) => (
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
        totalItems={total}
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

      {total === 0 && (
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
