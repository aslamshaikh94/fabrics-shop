"use client";
import { useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Phone,
  MapPin,
  BookOpen,
  MessageCircle,
  Users,
} from "lucide-react";
import CustomerLedger from "./CustomerLedger";
import ConfirmModal from "./ConfirmModal";
import Modal from "./shared/Modal";
import ColumnPicker from "./shared/ColumnPicker";
import { useToast } from "./Toast";
import Pagination from "./shared/Pagination";
import LoadingSpinner from "./shared/LoadingSpinner";
import EmptyState from "./shared/EmptyState";
import FormField, { SearchInput, FormActions } from "./shared/FormField";
import { useCrud } from "../hooks/useCrud";
import { usePagedList } from "../hooks/usePagedList";
import { useVisibleCols } from "../hooks/useVisibleCols";
import { formatNumber2 } from "../utils/formatters";

const PAGE_SIZE = 9;

const ALL_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "notes", label: "Notes" },
  { key: "balance", label: "Balance" },
  { key: "actions", label: "Actions" },
];

const DEFAULT_VISIBLE = new Set([
  "name",
  "phone",
  "address",
  "notes",
  "balance",
  "actions",
]);

const emptyForm = { name: "", phone: "", address: "", notes: "" };

export default function Customers() {
  const toast = useToast();
  const {
    data: customers,
    loading,
    create,
    update,
    remove,
  } = useCrud("customers", {
    select: "*",
    orderBy: { column: "created_at", ascending: false },
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [ledgerCustomer, setLedgerCustomer] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const { visibleCols, setVisibleCols, toggleCol } = useVisibleCols(
    "customers_visible_cols",
    DEFAULT_VISIBLE,
  );

  const col = (key) => visibleCols.has(key);

  const setField = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // Only search in phone if searchTerm looks like a phone number (digits/min length)
  const isPhoneSearch = /^[\d\s\-+]{2,}$/.test(searchTerm.trim());
  const filteredCustomers = useMemo(
    () =>
      customers.filter((c) => {
        const nameMatch = c.name
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
        if (isPhoneSearch) {
          const searchDigits = searchTerm.replace(/\D/g, "");
          const phoneDigits = (c.phone || "").replace(/\D/g, "");
          return (
            nameMatch ||
            (searchDigits.length >= 3 && phoneDigits.includes(searchDigits))
          );
        }
        return nameMatch;
      }),
    [customers, searchTerm, isPhoneSearch],
  );

  const { page, setPage, paginated, totalPages, total } = usePagedList(
    filteredCustomers,
    PAGE_SIZE,
    [searchTerm],
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        notes: formData.notes,
      };
      if (editingId) {
        await update(editingId, payload);
        toast("Customer updated successfully");
      } else {
        await create(payload);
        toast("Customer added successfully");
      }
      closeForm();
    } catch (error) {
      console.error("Error saving customer:", error);
      toast("Failed to save customer", "error");
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  }

  async function handleDelete(id) {
    try {
      await remove(id);
      toast("Customer deleted");
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast("Cannot delete customer with associated records", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  function handleWhatsApp(customer) {
    const due = customer.current_balance || 0;
    const msg = `Hello ${customer.name}, your outstanding balance is ₹${formatNumber2(due)}. Please clear at your earliest convenience. Thank you!`;
    const phone = customer.phone?.replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  function handleEdit(customer) {
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      notes: customer.notes,
    });
    setEditingId(customer.id);
    setShowForm(true);
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 mt-1">Manage your customer base</p>
        </div>
        <div className="flex gap-2">
          <ColumnPicker
            columns={ALL_COLUMNS}
            visibleCols={visibleCols}
            onToggle={toggleCol}
            onReset={() => setVisibleCols(new Set(DEFAULT_VISIBLE))}
          />
          <button
            onClick={() => {
              closeForm();
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Customer
          </button>
        </div>
      </div>

      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search customers..."
      />

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        title={editingId ? "Edit Customer" : "Add Customer"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            field="name"
            label="Name"
            required
            value={formData.name}
            onChange={setField}
            placeholder="Customer name"
          />
          <FormField
            field="phone"
            label="Phone"
            value={formData.phone}
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
            submitLabel={editingId ? "Update Customer" : "Add Customer"}
          />
        </form>
      </Modal>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {col("name") && (
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Name
                  </th>
                )}
                {col("phone") && (
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Phone
                  </th>
                )}
                {col("address") && (
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Address
                  </th>
                )}
                {col("notes") && (
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Notes
                  </th>
                )}
                {col("balance") && (
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">
                    Balance
                  </th>
                )}
                {col("actions") && (
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {col("name") && (
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {customer.name}
                      </span>
                    </td>
                  )}
                  {col("phone") && (
                    <td className="px-4 py-3">
                      {customer.phone ? (
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {customer.phone}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {col("address") && (
                    <td className="px-4 py-3">
                      {customer.address ? (
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[180px] block">
                            {customer.address}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {col("notes") && (
                    <td className="px-4 py-3">
                      {customer.notes ? (
                        <span className="text-gray-500 italic text-xs">
                          {customer.notes}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {col("balance") && (
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          customer.current_balance > 0
                            ? "text-warning-600"
                            : "text-accent-600"
                        }`}
                      >
                        {customer.current_balance > 0
                          ? `₹${formatNumber2(Number(customer.current_balance))}`
                          : "Cleared ✓"}
                      </span>
                    </td>
                  )}
                  {col("actions") && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setLedgerCustomer(customer)}
                          className="p-1.5 hover:bg-primary-50 rounded-lg text-gray-500 hover:text-primary-600"
                          title="View Ledger"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(customer)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {customer.current_balance > 0 && (
                          <button
                            onClick={() => handleWhatsApp(customer)}
                            className="p-1.5 hover:bg-green-50 rounded-lg text-gray-500 hover:text-green-600"
                            title="Send WhatsApp reminder"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(customer.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={total}
        label="customers"
      />

      {ledgerCustomer && (
        <CustomerLedger
          customer={ledgerCustomer}
          onClose={() => setLedgerCustomer(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the customer."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {total === 0 && (
        <EmptyState
          icon={Users}
          title="No customers added yet"
          searchTerm={searchTerm}
          description={
            searchTerm
              ? "Try a different search term"
              : "Click Add Customer to get started"
          }
        />
      )}
    </div>
  );
}
