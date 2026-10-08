"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Calendar,
  ExternalLink,
  Receipt,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { validateExpense, hasErrors } from "../utils/validators";
import { uploadToBucket, buildUploadPath } from "../utils/upload";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import DateRangeFilter from "./DateRangeFilter";
import Modal from "./shared/Modal";
import Pagination from "./shared/Pagination";
import LoadingSpinner from "./shared/LoadingSpinner";
import EmptyState from "./shared/EmptyState";
import FormField, {
  SearchInput,
  FormActions,
  FileUploadField,
} from "./shared/FormField";
import { Th, Td, EditDeleteActions } from "./shared/DataTable";
import { supabase } from "../lib/supabase";
import { usePagedList } from "../hooks/usePagedList";
import { formatDateShort, formatNumber2 } from "../utils/formatters";

const PAGE_SIZE = 10;

// Proof viewer only loads when a receipt is opened.
const FileViewer = dynamic(() => import("./shared/FileViewer"), {
  ssr: false,
});

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
  // Account the money came out of. When set, the amount is deducted from that
  // account's balance in the Payments ledger (like a reinvested supplier
  // payment). Empty means it was paid out of pocket (see paid_by / cleared).
  partner_id: "",
  notes: "",
};

export default function Expenses() {
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMonth, setFilterMonth] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [proofError, setProofError] = useState("");
  const [viewProofUrl, setViewProofUrl] = useState(null);
  const [togglingClear, setTogglingClear] = useState(null);

  const setField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field])
      setFormErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const fetchExpenses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("id, title, category, amount, expense_date, paid_by, partner_id, cleared, cleared_at, notes, payment_proof_url, created_at")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      setExpenses(data || []);
    } catch (err) {
      console.error("Error fetching expenses:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPartners = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      setPartners(data || []);
    } catch (err) {
      console.error("Error fetching partners:", err);
    }
  }, []);

  const filtered = useMemo(
    () =>
      expenses.filter((e) => {
        const matchSearch =
          e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.notes?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCat = filterCategory === "all" || e.category === filterCategory;
        const matchMonth = !filterMonth || e.expense_date.startsWith(filterMonth);
        const matchesFrom = !dateFrom || e.expense_date >= dateFrom;
        const matchesTo = !dateTo || e.expense_date <= dateTo;
        return matchSearch && matchCat && matchMonth && matchesFrom && matchesTo;
      }),
    [expenses, searchTerm, filterCategory, filterMonth, dateFrom, dateTo],
  );

  const { page, setPage, paginated, totalPages, total } = usePagedList(
    filtered,
    PAGE_SIZE,
    [searchTerm, filterCategory, filterMonth, dateFrom, dateTo],
  );

  const totalFiltered = useMemo(
    () => filtered.reduce((s, e) => s + (e.amount || 0), 0),
    [filtered],
  );
  const totalAll = useMemo(
    () => expenses.reduce((s, e) => s + (e.amount || 0), 0),
    [expenses],
  );
  // Pending reimbursement only counts money someone paid out of their own pocket.
  // An expense paid straight from an account has already left that account's
  // balance, so reimbursing it would pay the same money twice.
  const totalUncleared = useMemo(
    () =>
      expenses
        .filter((e) => !e.cleared && !e.partner_id)
        .reduce((s, e) => s + (e.amount || 0), 0),
    [expenses],
  );

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

  useEffect(() => {
    fetchExpenses();
    fetchPartners();
  }, [fetchExpenses, fetchPartners]);

  if (loading) return <LoadingSpinner className="h-64" />;

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validateExpense(formData);
    if (hasErrors(errors)) {
      setFormErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    setFormErrors({});
    setUploading(true);
    try {
      let payment_proof_url = editingId
        ? expenses.find((p) => p.id === editingId)?.payment_proof_url || ""
        : "";

      if (paymentProofFile) {
        if (paymentProofFile.size > 10 * 1024 * 1024) {
          setProofError("File size must be under 10MB");
          toast("File size must be under 10MB", "error");
          setUploading(false);
          return;
        }
        const path = buildUploadPath("expense-proofs", paymentProofFile);
        const { url, error: uploadError, infraMessage } = await uploadToBucket(
          "expense-proofs",
          paymentProofFile,
          path,
        );
        if (url) {
          payment_proof_url = url;
        } else {
          // Storage infra problems (bucket or policies from migration 043)
          // are not a reason to lose the whole expense — save it without
          // the proof and tell the user which problem it was.
          console.error("Expense proof upload failed:", uploadError);
          toast(infraMessage || "Payment proof upload failed", "error");
        }
      }

      const savePayload = {
        title: formData.title,
        category: formData.category,
        amount: parseFloat(formData.amount),
        expense_date: formData.expense_date,
        paid_by: formData.paid_by,
        notes: formData.notes,
        payment_proof_url,
        partner_id: formData.partner_id || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("expenses")
          .update(savePayload)
          .eq("id", editingId);
        if (error) {
          // Migration 045 may not be applied yet: keeping expenses saveable is
          // more important than blocking on the account link.
          if (error.message?.includes("partner_id")) {
            const { partner_id, ...withoutPartner } = savePayload;
            const retry = await supabase
              .from("expenses")
              .update(withoutPartner)
              .eq("id", editingId);
            if (retry.error) throw retry.error;
            toast("Saved, but the account link needs migration 045", "error");
          } else {
            throw error;
          }
        } else {
          toast("Expense updated");
        }
      } else {
        const { error } = await supabase.from("expenses").insert([savePayload]);
        if (error) {
          if (error.message?.includes("partner_id")) {
            const { partner_id, ...withoutPartner } = savePayload;
            const retry = await supabase
              .from("expenses")
              .insert([withoutPartner]);
            if (retry.error) throw retry.error;
            toast("Saved, but the account link needs migration 045", "error");
          } else {
            throw error;
          }
        } else {
          toast("Expense added");
        }
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      setFormErrors({});
      setPaymentProofFile(null);
      setProofError("");
      fetchExpenses();
    } catch (err) {
      console.error("Error saving expense:", err);
      toast("Failed to save expense", "error");
    } finally {
      setUploading(false);
    }
  }

  function handleEdit(expense) {
    setFormData({
      title: expense.title,
      category: expense.category,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      paid_by: expense.paid_by || "",
      partner_id: expense.partner_id || "",
      notes: expense.notes || "",
    });
    setPaymentProofFile(null);
    setProofError("");
    setEditingId(expense.id);
    setShowForm(true);
  }

  async function handleToggleClear(expense) {
    setTogglingClear(expense.id);
    try {
      const updates = expense.cleared
        ? { cleared: false, cleared_at: null }
        : { cleared: true, cleared_at: new Date().toISOString() };
      const { error } = await supabase
        .from("expenses")
        .update(updates)
        .eq("id", expense.id);
      if (error) throw error;
      toast(expense.cleared ? "Marked as unpaid" : "Marked as reimbursed ✓");
      fetchExpenses();
    } catch (err) {
      toast("Failed to update", "error");
    } finally {
      setTogglingClear(null);
    }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500 mt-1">Track shop operating expenses</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingId(null);
              setFormData(emptyForm);
              setPaymentProofFile(null);
              setProofError("");
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-sm text-gray-500">Total Expenses (All Time)</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            ₹
            {formatNumber2(totalAll)}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Pending Reimbursement</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">
            ₹
            {formatNumber2(totalUncleared)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Out-of-pocket only — account-paid expenses are excluded
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500">Filtered Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ₹
            {formatNumber2(totalFiltered)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search expenses..."
          className="min-w-[180px]"
        />
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
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          label=""
          resetPage={() => setPage(1)}
        />
      </div>

      {/* Add/Edit Expense Modal */}
      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        title={editingId ? "Edit Expense" : "Add Expense"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            field="title"
            label="Title"
            required
            value={formData.title}
            error={formErrors.title}
            onChange={setField}
            placeholder="e.g., Monthly Rent"
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              field="category"
              label="Category"
              value={formData.category}
              error={formErrors.category}
              onChange={setField}
            >
              <select
                value={formData.category}
                onChange={(e) => setField("category", e.target.value)}
                className={`input ${
                  formErrors.category ? "border-error-400" : ""
                }`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              field="amount"
              label="Amount"
              type="number"
              required
              value={formData.amount}
              error={formErrors.amount}
              onChange={setField}
              placeholder="₹0.00"
            />
          </div>
          <FormField
            field="expense_date"
            label="Date"
            type="date"
            value={formData.expense_date}
            error={formErrors.expense_date}
            onChange={setField}
            className="w-full"
          />
          <FormField
            field="paid_by"
            label="Paid By"
            value={formData.paid_by}
            onChange={setField}
            placeholder="e.g., Ahmed, Owner..."
          />
          <div>
            <FormField
              field="partner_id"
              label="Paid From Account"
              value={formData.partner_id}
              onChange={setField}
            >
              <select
                value={formData.partner_id}
                onChange={(e) => setField("partner_id", e.target.value)}
                className="input"
              >
                <option value="">— Out of pocket (no account) —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>
            <p className="mt-1 text-xs text-gray-500">
              {formData.partner_id
                ? "This amount will be deducted from the selected account's balance."
                : "No account selected — nothing is deducted from any account balance."}
            </p>
          </div>
          <FormField
            field="notes"
            label="Notes"
            value={formData.notes}
            onChange={setField}
            placeholder="Optional notes"
          >
            <textarea
              value={formData.notes}
              onChange={(e) => setField("notes", e.target.value)}
              className="input"
              rows={2}
              placeholder="Optional notes"
            />
          </FormField>
          <FileUploadField
            label="Payment Proof (Receipt / Bill)"
            file={paymentProofFile}
            onFileChange={(f) => {
              setPaymentProofFile(f);
              if (f) setProofError("");
            }}
            error={proofError}
            onErrorClear={() => setProofError("")}
            existingUrl={
              editingId
                ? expenses.find((p) => p.id === editingId)
                    ?.payment_proof_url || ""
                : ""
            }
            idleText="Upload receipt / bill (PDF, image)"
            replaceText="Replace existing proof"
            linkText="View current proof"
          />
          <FormActions
            onCancel={() => {
              setShowForm(false);
              setEditingId(null);
            }}
            isSubmitting={uploading}
            submitLabel={editingId ? "Update Expense" : "Add Expense"}
          />
        </form>
      </Modal>

      {/* Expenses List */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "620px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>Title</Th>
                <Th>Category</Th>
                <Th>Date</Th>
                <Th align="right">Amount</Th>
                <Th align="center">Proof</Th>
                <Th align="center">Reimbursed</Th>
                <Th align="center">Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((expense) => (
                <tr
                  key={expense.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    expense.cleared ? "opacity-60" : ""
                  }`}
                >
                  <Td>
                    <p className="font-medium text-gray-900">{expense.title}</p>
                    {expense.paid_by && (
                      <p className="text-xs text-primary-600 mt-0.5">
                        Paid by: {expense.paid_by}
                      </p>
                    )}
                    {expense.partner_id && (
                      <p className="text-xs text-accent-600 mt-0.5">
                        From account:{" "}
                        {partners.find((p) => p.id === expense.partner_id)
                          ?.name || "Account"}
                      </p>
                    )}
                    {expense.notes && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {expense.notes}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <span
                      className={`badge ${
                        categoryColors[expense.category] || categoryColors.Other
                      }`}
                    >
                      {expense.category}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {formatDateShort(expense.expense_date)}
                    </div>
                  </Td>
                  <Td align="right">
                    <span className="font-semibold text-red-600 text-sm">
                      ₹
                      {formatNumber2(expense.amount)}
                    </span>
                  </Td>
                  <Td align="center">
                    {expense.payment_proof_url ? (
                      <button
                        onClick={() =>
                          setViewProofUrl(expense.payment_proof_url)
                        }
                        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                        title="View payment proof"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </Td>
                  <Td align="center">
                    <div className="flex flex-col items-center gap-1">
                      {expense.partner_id ? (
                        // Paid from an account: nothing to reimburse, so the
                        // toggle is replaced with a static marker instead.
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg bg-accent-100 text-accent-700"
                          title="Paid from an account — already deducted, no reimbursement needed"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          From account
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggleClear(expense)}
                          disabled={togglingClear === expense.id}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                            expense.cleared
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-orange-100 hover:text-orange-600"
                          }`}
                          title={
                            expense.cleared
                              ? "Mark as unpaid"
                              : "Mark as reimbursed"
                          }
                        >
                          {expense.cleared ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Circle className="w-3.5 h-3.5" />
                          )}
                          {expense.cleared ? "Paid" : "Clear"}
                        </button>
                      )}
                      {expense.cleared && expense.cleared_at && (
                        <span className="text-[10px] text-gray-400">
                          {formatDateShort(expense.cleared_at)}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td align="center">
                    <EditDeleteActions
                      onEdit={() => handleEdit(expense)}
                      onDelete={() => setConfirmDelete(expense.id)}
                    />
                  </Td>
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
        label="expenses"
      />

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the expense."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {total === 0 && (
        <EmptyState
          icon={Receipt}
          title="No expenses recorded yet"
          searchTerm={
            searchTerm || filterCategory !== "all" || filterMonth
              ? "filtered"
              : ""
          }
          description={
            searchTerm || filterCategory !== "all" || filterMonth
              ? "Try adjusting your filters"
              : "Click Add Expense to get started"
          }
        />
      )}

      {viewProofUrl && (
        <FileViewer
          url={viewProofUrl}
          onClose={() => setViewProofUrl(null)}
          title="Payment Proof"
        />
      )}
    </div>
  );
}
