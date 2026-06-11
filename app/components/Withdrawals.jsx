"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Calendar,
  Wallet,
  Download,
} from "lucide-react";
import { exportCSV } from "../utils/export";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import DateRangeFilter from "./DateRangeFilter";
import Modal from "./shared/Modal";
import Pagination from "./shared/Pagination";
import LoadingSpinner from "./shared/LoadingSpinner";

const PAGE_SIZE = 10;

const emptyForm = {
  amount: "",
  withdrawal_date: new Date().toISOString().split("T")[0],
  withdrawn_by: "",
  reason: "",
};

export default function Withdrawals() {
  const toast = useToast();
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, dateFrom, dateTo]);

  async function fetchWithdrawals() {
    try {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("*")
        .order("withdrawal_date", { ascending: false });
      if (error) throw error;
      setWithdrawals(data || []);
    } catch (err) {
      console.error("Error fetching withdrawals:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingId) {
        const { error } = await supabase
          .from("withdrawals")
          .update({
            amount: parseFloat(formData.amount),
            withdrawal_date: formData.withdrawal_date,
            withdrawn_by: formData.withdrawn_by,
            reason: formData.reason,
          })
          .eq("id", editingId);
        if (error) throw error;
        toast("Withdrawal updated");
      } else {
        const { error } = await supabase.from("withdrawals").insert([
          {
            amount: parseFloat(formData.amount),
            withdrawal_date: formData.withdrawal_date,
            withdrawn_by: formData.withdrawn_by,
            reason: formData.reason,
          },
        ]);
        if (error) throw error;
        toast("Withdrawal added");
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      fetchWithdrawals();
    } catch (err) {
      console.error("Error saving withdrawal:", err);
      toast("Failed to save withdrawal", "error");
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
      const { error } = await supabase
        .from("withdrawals")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast("Withdrawal deleted");
      fetchWithdrawals();
    } catch (err) {
      console.error("Error deleting withdrawal:", err);
      toast("Failed to delete withdrawal", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  const filtered = withdrawals.filter((w) => {
    const matchSearch =
      w.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.withdrawn_by.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFrom = !dateFrom || w.withdrawal_date >= dateFrom;
    const matchesTo = !dateTo || w.withdrawal_date <= dateTo;
    return matchSearch && matchesFrom && matchesTo;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalAmount = filtered.reduce((s, w) => s + (w.amount || 0), 0);

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
            onClick={() =>
              exportCSV(
                filtered.map((w) => ({
                  amount: w.amount,
                  date: w.withdrawal_date,
                  withdrawn_by: w.withdrawn_by || "",
                  reason: w.reason || "",
                })),
                `withdrawals-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
          </button>
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
          ₹{totalAmount.toLocaleString("en-IN")}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by reason or person..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
              className="input"
              placeholder="₹0.00"
              onWheel={(e) => e.target.blur()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={formData.withdrawal_date}
              onChange={(e) =>
                setFormData({ ...formData, withdrawal_date: e.target.value })
              }
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Withdrawn By
            </label>
            <input
              type="text"
              value={formData.withdrawn_by}
              onChange={(e) =>
                setFormData({ ...formData, withdrawn_by: e.target.value })
              }
              className="input"
              placeholder="e.g., Ahmed, Partner..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
              className="input"
              rows={2}
              placeholder="Purpose of withdrawal"
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
              {editingId ? "Update" : "Add"} Withdrawal
            </button>
          </div>
        </form>
      </Modal>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "500px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Withdrawn By
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-red-600">
                      ₹{w.amount.toLocaleString("en-IN")}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(w.withdrawal_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">
                      {w.withdrawn_by || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-500 max-w-xs truncate">
                      {w.reason || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleEdit(w)}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(w.id)}
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

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filtered.length}
        label="withdrawals"
      />

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the withdrawal."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {searchTerm || dateFrom || dateTo
              ? "No withdrawals match your filters"
              : "No withdrawals recorded yet"}
          </p>
          <p className="text-gray-300 text-sm mt-1">
            Try adjusting your filters
          </p>
        </div>
      )}
    </div>
  );
}
