"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Plus, Trash2, X, Search, Calendar, Pencil } from "lucide-react";
import { validateExpense, hasErrors } from "../utils/validators";
import ConfirmModal from "./ConfirmModal";
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

const emptyForm = {
  title: "",
  category: "Other",
  amount: "",
  expense_date: new Date().toISOString().split("T")[0],
  paid_by: "",
  notes: "",
};

export default function Expenses() {
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMonth, setFilterMonth] = useState("");
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchExpenses();
  }, []);

  async function fetchExpenses() {
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      setExpenses(data || []);
    } catch (err) {
      console.error("Error fetching expenses:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validateExpense(formData);
    if (hasErrors(errors)) {
      setFormErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    setFormErrors({});
    try {
      if (editingId) {
        const { error } = await supabase
          .from("expenses")
          .update({
            title: formData.title,
            category: formData.category,
            amount: parseFloat(formData.amount),
            expense_date: formData.expense_date,
            paid_by: formData.paid_by,
            notes: formData.notes,
          })
          .eq("id", editingId);
        if (error) throw error;
        toast("Expense updated");
      } else {
        const { error } = await supabase.from("expenses").insert([
          {
            title: formData.title,
            category: formData.category,
            amount: parseFloat(formData.amount),
            expense_date: formData.expense_date,
            paid_by: formData.paid_by,
            notes: formData.notes,
          },
        ]);
        if (error) throw error;
        toast("Expense added");
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      setFormErrors({});
      fetchExpenses();
    } catch (err) {
      console.error("Error saving expense:", err);
      toast("Failed to save expense", "error");
    }
  }

  function handleEdit(expense) {
    setFormData({
      title: expense.title,
      category: expense.category,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      paid_by: expense.paid_by || "",
      notes: expense.notes || "",
    });
    setEditingId(expense.id);
    setShowForm(true);
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
      toast("Expense deleted");
      fetchExpenses();
    } catch (err) {
      console.error("Error deleting expense:", err);
      toast("Failed to delete expense", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  const filtered = expenses.filter((e) => {
    const matchSearch =
      e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = filterCategory === "all" || e.category === filterCategory;
    const matchMonth = !filterMonth || e.expense_date.startsWith(filterMonth);
    return matchSearch && matchCat && matchMonth;
  });

  const totalFiltered = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const totalAll = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const categoryColors = {
    Rent: "bg-blue-100 text-blue-800",
    Electricity: "bg-yellow-100 text-yellow-800",
    "Staff Salary": "bg-purple-100 text-purple-800",
    Transport: "bg-green-100 text-green-800",
    Packaging: "bg-orange-100 text-orange-800",
    Maintenance: "bg-red-100 text-red-800",
    Marketing: "bg-pink-100 text-pink-800",
    Other: "bg-gray-100 text-gray-800",
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500 mt-1">Track shop operating expenses</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData(emptyForm);
            setShowForm(true);
          }}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Expense
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="text-sm text-gray-500">Total Expenses (All Time)</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            ₹{totalAll.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Filtered Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ₹{totalFiltered.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="input w-full sm:w-44"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="input w-full sm:w-40"
        />
      </div>

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit Expense" : "Add Expense"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({ ...formData, title: e.target.value });
                    if (formErrors.title)
                      setFormErrors({ ...formErrors, title: "" });
                  }}
                  className={`input ${formErrors.title ? "border-error-400" : ""}`}
                  placeholder="e.g., Monthly Rent"
                />
                {formErrors.title && (
                  <p className="text-error-600 text-sm mt-1">
                    {formErrors.title}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      setFormData({ ...formData, category: e.target.value });
                      if (formErrors.category)
                        setFormErrors({ ...formErrors, category: "" });
                    }}
                    className={`input ${formErrors.category ? "border-error-400" : ""}`}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {formErrors.category && (
                    <p className="text-error-600 text-sm mt-1">
                      {formErrors.category}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => {
                      setFormData({ ...formData, amount: e.target.value });
                      if (formErrors.amount)
                        setFormErrors({ ...formErrors, amount: "" });
                    }}
                    className={`input ${formErrors.amount ? "border-error-400" : ""}`}
                    placeholder="₹0.00"
                  />
                  {formErrors.amount && (
                    <p className="text-error-600 text-sm mt-1">
                      {formErrors.amount}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) =>
                    setFormData({ ...formData, expense_date: e.target.value })
                  }
                  className={`input w-full ${formErrors.expense_date ? "border-error-400" : ""}`}
                />
                {formErrors.expense_date && (
                  <p className="text-error-600 text-sm mt-1">
                    {formErrors.expense_date}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paid By
                </label>
                <input
                  type="text"
                  value={formData.paid_by}
                  onChange={(e) => setFormData({ ...formData, paid_by: e.target.value })}
                  className="input"
                  placeholder="e.g., Ahmed, Owner..."
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
                  rows={2}
                  placeholder="Optional notes"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingId ? "Update Expense" : "Add Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expenses List */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "500px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((expense) => (
                <tr
                  key={expense.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{expense.title}</p>
                    {expense.paid_by && <p className="text-xs text-primary-600 mt-0.5">Paid by: {expense.paid_by}</p>}
                    {expense.notes && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {expense.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${categoryColors[expense.category] || categoryColors.Other}`}
                    >
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(expense.expense_date).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" },
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600 text-sm">
                    ₹{expense.amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleEdit(expense)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(expense.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"
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
      </div>

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the expense."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchTerm || filterCategory !== "all" || filterMonth
            ? "No expenses match your filters"
            : "No expenses recorded yet"}
        </div>
      )}
    </div>
  );
}
