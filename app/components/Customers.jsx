"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Pencil,
  Trash2,
  Phone,
  MapPin,
  BookOpen,
  MessageCircle,
  Users,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import CustomerLedger from "./CustomerLedger";
import ConfirmModal from "./ConfirmModal";
import Modal from "./shared/Modal";
import ColumnPicker from "./shared/ColumnPicker";
import { useToast } from "./Toast";
import { exportCSV } from "../utils/export";
import Pagination from "./shared/Pagination";
import EmptyState from "./shared/EmptyState";
import { SearchInput } from "./shared/FormField";

const PAGE_SIZE = 9;

const ALL_COLUMNS = [
  { key: "name",    label: "Name" },
  { key: "phone",   label: "Phone" },
  { key: "address", label: "Address" },
  { key: "notes",   label: "Notes" },
  { key: "balance", label: "Balance" },
  { key: "actions", label: "Actions" },
];

const DEFAULT_VISIBLE = new Set(["name", "phone", "address", "notes", "balance", "actions"]);

function loadVisibleCols() {
  try {
    const saved = localStorage.getItem("customers_visible_cols");
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(DEFAULT_VISIBLE);
}

export default function Customers() {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
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
  const [ledgerCustomer, setLedgerCustomer] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols);

  useEffect(() => {
    localStorage.setItem(
      "customers_visible_cols",
      JSON.stringify([...visibleCols]),
    );
  }, [visibleCols]);

  function toggleCol(key) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const col = (key) => visibleCols.has(key);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        notes: formData.notes,
      };
      if (editingId) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast("Customer updated successfully");
      } else {
        const { error } = await supabase.from("customers").insert([payload]);
        if (error) throw error;
        toast("Customer added successfully");
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({
        name: "",
        phone: "",
        address: "",
        notes: "",
      });
      fetchCustomers();
    } catch (error) {
      console.error("Error saving customer:", error);
      toast("Failed to save customer", "error");
    }
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      toast("Customer deleted");
      fetchCustomers();
    } catch (error) {
      console.error("Error deleting customer:", error);
      toast("Cannot delete customer with associated records", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  function handleWhatsApp(customer) {
    const due = customer.current_balance || 0;
    const msg = `Hello ${customer.name}, your outstanding balance is ₹${due.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Please clear at your earliest convenience. Thank you!`;
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

  const totalPages = Math.ceil(filteredCustomers.length / PAGE_SIZE);
  const paginated = filteredCustomers.slice(
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
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 mt-1">Manage your customer base</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              exportCSV(
                filteredCustomers.map((c) => ({
                  name: c.name,
                  phone: c.phone || "",
                  address: c.address || "",
                  dues: c.current_balance || 0,
                  notes: c.notes || "",
                })),
                `customers-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
          </button>
          <ColumnPicker
            columns={ALL_COLUMNS}
            visibleCols={visibleCols}
            onToggle={toggleCol}
            onReset={() => setVisibleCols(new Set(DEFAULT_VISIBLE))}
          />
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setFormData({
                name: "",
                phone: "",
                address: "",
                notes: "",
              });
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
        onClose={() => setShowForm(false)}
        title={editingId ? "Edit Customer" : "Add Customer"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="input"
              placeholder="Customer name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className="input"
              placeholder="Phone number"
            />
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
              {editingId ? "Update" : "Add"} Customer
            </button>
          </div>
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
              {filteredCustomers.map((customer) => (
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
                          ? `₹${Number(customer.current_balance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
        totalItems={filteredCustomers.length}
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

      {filteredCustomers.length === 0 && (
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
