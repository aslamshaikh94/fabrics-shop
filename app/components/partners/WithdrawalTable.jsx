"use client";
import { Wallet, Calendar, Pencil, Trash2, Plus } from "lucide-react";
import ConfirmModal from "../ConfirmModal";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const partnerColors = [
  { chart: "#3b82f6" },
  { chart: "#8b5cf6" },
  { chart: "#10b981" },
  { chart: "#f59e0b" },
  { chart: "#f43f5e" },
  { chart: "#06b6d4" },
];

function fmt(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function WithdrawalTable({
  withdrawals,
  partners,
  filterPartner,
  setFilterPartner,
  filterMonth,
  setFilterMonth,
  onAdd,
  onEdit,
  onDelete,
  confirmDelete,
  setConfirmDelete,
  allWithdrawals,
}) {
  function getPartnerName(w) {
    const by = (w.withdrawn_by || "").toLowerCase();
    for (const p of partners) {
      if (by.includes(p.name.toLowerCase())) return p.name;
    }
    return w.withdrawn_by || "Unknown";
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-gray-400" /> Withdrawal Records
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={filterPartner}
            onChange={(e) => setFilterPartner(e.target.value)}
            className="input text-xs py-1.5 w-28"
          >
            <option value="all">All Partners</option>
            {partners.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="input text-xs py-1.5 w-24"
          >
            <option value="all">All Months</option>
            {MONTHS.map((m, i) => (
              <option key={i} value={String(i + 1).padStart(2, "0")}>
                {m}
              </option>
            ))}
          </select>
          <button onClick={onAdd} className="btn btn-primary text-xs py-1.5">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: "500px" }}>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Partner
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {withdrawals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    {allWithdrawals.length === 0
                      ? "No withdrawals recorded"
                      : "No withdrawals match filters"}
                  </p>
                </td>
              </tr>
            ) : (
              withdrawals.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(w.withdrawal_date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: partners.find((p) =>
                            (w.withdrawn_by || "")
                              .toLowerCase()
                              .includes(p.name.toLowerCase()),
                          )?.id
                            ? partnerColors[
                                partners.findIndex((p) =>
                                  (w.withdrawn_by || "")
                                    .toLowerCase()
                                    .includes(p.name.toLowerCase()),
                                ) % partnerColors.length
                              ]?.chart
                            : "#999",
                        }}
                      />
                      <span className="text-sm font-medium text-gray-900">
                        {getPartnerName(w)}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p
                      className="text-sm text-gray-500 max-w-[200px] truncate"
                      title={w.reason || "-"}
                    >
                      {w.reason || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-sm font-semibold text-red-600">
                      {fmt(w.amount)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onEdit(w)}
                        className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(w.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete this withdrawal record."
          onConfirm={() => onDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
