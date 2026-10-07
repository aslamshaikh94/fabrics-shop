"use client";
import { useState, useMemo } from "react";
import { Plus, Calendar, Wallet } from "lucide-react";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import DateRangeFilter from "./DateRangeFilter";
import Modal from "./shared/Modal";
import Pagination from "./shared/Pagination";
import LoadingSpinner from "./shared/LoadingSpinner";
import EmptyState from "./shared/EmptyState";
import FormField, { SearchInput, FormActions } from "./shared/FormField";
import { Th, Td, EditDeleteActions } from "./shared/DataTable";
import { useCrud } from "../hooks/useCrud";
import { usePagedList } from "../hooks/usePagedList";
import { formatDateShort, formatNumber2 } from "../utils/formatters";

const PAGE_SIZE = 10;

const emptyForm = {
  amount: "",
  withdrawal_date: new Date().toISOString().split("T")[0],
  withdrawn_by: "",
  reason: "",
};

export default function Withdrawals() {
  const toast = useToast();
  const {
    data: withdrawals,
    loading,
    create,
    update,
    remove,
  } = useCrud("withdrawals", {
    select: "*",
    orderBy: { column: "withdrawal_date", ascending: false },
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () =>
      withdrawals.filter((w) => {
        const term = searchTerm.toLowerCase();
        const matchSearch =
          (w.reason || "").toLowerCase().includes(term) ||
          (w.withdrawn_by || "").toLowerCase().includes(term);
        const matchesFrom = !dateFrom || w.withdrawal_date >= dateFrom;
        const matchesTo = !dateTo || w.withdrawal_date <= dateTo;
        return matchSearch && matchesFrom && matchesTo;
      }),
    [withdrawals, searchTerm, dateFrom, dateTo],
  );

  const { page, setPage, paginated, totalPages, total } = usePagedList(
    filtered,
    PAGE_SIZE,
    [searchTerm, dateFrom, dateTo],
  );

  const totalAmount = useMemo(
    () => filtered.reduce((s, w) => s + (w.amount || 0), 0),
    [filtered],
  );

  const setField = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        amount: parseFloat(formData.amount),
        withdrawal_date: formData.withdrawal_date,
        withdrawn_by: formData.withdrawn_by,
        reason: formData.reason,
      };
      if (editingId) {
        await update(editingId, payload);
        toast("Withdrawal updated");
      } else {
        await create(payload);
        toast("Withdrawal added");
      }
      closeForm();
    } catch (err) {
      console.error("Error saving withdrawal:", err);
      toast("Failed to save withdrawal", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(w) {
    setFormData({
      amount: w.amount.toString(),
      withdrawal_date: w.withdrawal_date,
      withdrawn_by: w.withdrawn_by,
      reason: w.reason,
    });
    setEditingId(w.id);
    setShowForm(true);
  }

  async function handleDelete(id) {
    try {
      await remove(id);
      toast("Withdrawal deleted");
    } catch (err) {
      console.error("Error deleting withdrawal:", err);
      toast("Failed to delete withdrawal", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  if (loading) return <LoadingSpinner className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Withdrawals</h1>
          <p className="text-gray-500 mt-1">Track owner/partner withdrawals</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingId(null);
              setFormData(emptyForm);
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Withdrawal
          </button>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-sm text-gray-500">Filtered Total Withdrawn</p>
        <p className="text-2xl font-bold text-red-600 mt-1">
          ₹
          {formatNumber2(totalAmount)}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by reason or person..."
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

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        title={editingId ? "Edit Withdrawal" : "Add Withdrawal"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            field="amount"
            label="Amount"
            type="number"
            required
            value={formData.amount}
            onChange={setField}
            placeholder="₹0.00"
          />
          <FormField
            field="withdrawal_date"
            label="Date"
            type="date"
            value={formData.withdrawal_date}
            onChange={setField}
            className="w-full"
          />
          <FormField
            field="withdrawn_by"
            label="Withdrawn By"
            value={formData.withdrawn_by}
            onChange={setField}
            placeholder="e.g., Ahmed, Partner..."
          />
          <FormField
            field="reason"
            label="Reason"
            value={formData.reason}
            onChange={setField}
            placeholder="Purpose of withdrawal"
          >
            <textarea
              value={formData.reason}
              onChange={(e) => setField("reason", e.target.value)}
              className="input"
              rows={2}
              placeholder="Purpose of withdrawal"
            />
          </FormField>
          <FormActions
            onCancel={() => {
              setShowForm(false);
              setEditingId(null);
            }}
            isSubmitting={saving}
            submitLabel={editingId ? "Update Withdrawal" : "Add Withdrawal"}
          />
        </form>
      </Modal>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "500px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>Amount</Th>
                <Th>Date</Th>
                <Th>Withdrawn By</Th>
                <Th>Reason</Th>
                <Th align="center">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                  <Td>
                    <p className="font-semibold text-red-600">
                      ₹
                      {formatNumber2(w.amount)}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {formatDateShort(w.withdrawal_date)}
                    </div>
                  </Td>
                  <Td>
                    <p className="text-sm text-gray-900">
                      {w.withdrawn_by || "—"}
                    </p>
                  </Td>
                  <Td>
                    <p className="text-sm text-gray-500 max-w-xs truncate">
                      {w.reason || "—"}
                    </p>
                  </Td>
                  <Td align="center">
                    <EditDeleteActions
                      onEdit={() => handleEdit(w)}
                      onDelete={() => setConfirmDelete(w.id)}
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
        label="withdrawals"
      />

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the withdrawal."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {total === 0 && (
        <EmptyState
          icon={Wallet}
          title="No withdrawals recorded yet"
          searchTerm={searchTerm || dateFrom || dateTo ? "filtered" : ""}
          description="Try adjusting your filters"
        />
      )}
    </div>
  );
}
