"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Phone,
  MapPin,
  BookOpen,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import CustomerLedger from "./CustomerLedger";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

const PAGE_SIZE = 9;

export default function Customers() {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [customerDues, setCustomerDues] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    credit_limit: "",
    notes: "",
  });
  const [ledgerCustomer, setLedgerCustomer] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchCustomers();
    fetchCustomerDues();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  async function fetchCustomerDues() {
    try {
      const { data } = await supabase
        .from("sales")
        .select("customer_id, remaining_amount")
        .gt("remaining_amount", 0);
      const map = {};
      (data || []).forEach((s) => {
        if (s.customer_id)
          map[s.customer_id] = (map[s.customer_id] || 0) + s.remaining_amount;
      });
      setCustomerDues(map);
    } catch (err) {
      console.error(err);
    }
  }

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
        credit_limit: parseFloat(formData.credit_limit) || 0,
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
        credit_limit: "",
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
    const due = customerDues[customer.id] || 0;
    const msg = `Hello ${customer.name}, your outstanding balance is ₹${due.toLocaleString("en-IN")}. Please clear at your earliest convenience. Thank you!`;
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
      credit_limit: customer.credit_limit.toString(),
      notes: customer.notes,
    });
    setEditingId(customer.id);
    setShowForm(true);
  }

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm),
  );

  const totalPages = Math.ceil(filteredCustomers.length / PAGE_SIZE);
  const paginated = filteredCustomers.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 mt-1">Manage your customer base</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormData({
              name: "",
              phone: "",
              address: "",
              credit_limit: "",
              notes: "",
            });
          }}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Customer
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input pl-10"
        />
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit Customer" : "Add Customer"}
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
                  Credit Limit
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.credit_limit}
                  onChange={(e) =>
                    setFormData({ ...formData, credit_limit: e.target.value })
                  }
                  className="input"
                  placeholder="Maximum credit allowed"
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
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((customer) => (
          <div key={customer.id} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{customer.name}</h3>
              <div className="flex gap-1">
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
                {customerDues[customer.id] > 0 && (
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
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span>{customer.address}</span>
                </div>
              )}
            </div>
            {customerDues[customer.id] > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-sm text-warning-600 font-semibold">
                  Due: ₹{customerDues[customer.id].toLocaleString("en-IN")}
                </p>
              </div>
            )}
            {customer.notes && (
              <p className="text-gray-500 italic text-xs mt-2">
                {customer.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-gray-500">
            {filteredCustomers.length} customers — page {page} of {totalPages}
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
        <div className="text-center py-12 text-gray-500">
          {searchTerm
            ? "No customers found matching your search"
            : "No customers added yet"}
        </div>
      )}
    </div>
  );
}
