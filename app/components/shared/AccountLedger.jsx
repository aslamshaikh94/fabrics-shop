"use client";
import { useState, useEffect } from "react";
import { X, Calendar, CreditCard } from "lucide-react";
import { formatDateShort, formatINR } from "../../utils/formatters";

/**
 * Generic party ledger dialog (customer / supplier).
 *
 * Replaces the near-clone CustomerLedger + SupplierLedger:
 * same overlay, header, 3-stat summary, timeline of entries + payments,
 * with two parameterized behaviors:
 *   - `theme` colors the entry rows ("primary" | "warning")
 *   - `showBalance` adds the running-balance column + progress bar
 *     (supplier view); off by default (customer view)
 *
 * `fetchData` must resolve to { entries, payments }:
 *   entries: rows with total_amount + the entry date field (see entryDateKey)
 *   payments: rows with amount, payment_date, payment_method
 */

const THEMES = {
  primary: {
    row: "border-primary-100 bg-primary-50",
    tile: "bg-primary-100",
    text: "text-primary-700",
    icon: "text-primary-600",
  },
  warning: {
    row: "border-warning-100 bg-warning-50",
    tile: "bg-warning-100",
    text: "text-warning-700",
    icon: "text-warning-600",
  },
};

export default function AccountLedger({
  title,
  subtitle,
  totalLabel,
  entryLabel,
  EntryIcon,
  theme = "primary",
  entryDateKey = "sale_date",
  showBalance = false,
  fetchData,
  onClose,
}) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchData();
        if (!cancelled) setRows(result);
      } catch (err) {
        console.error("Error fetching ledger:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  if (loading || !rows) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    );
  }

  const entries = rows.entries || [];
  const payments = rows.payments || [];
  const t = THEMES[theme] || THEMES.primary;

  const totalEntries = entries.reduce(
    (s, r) => s + (r.total_amount || 0),
    0,
  );
  const totalPaid = payments.reduce((s, r) => s + (r.amount || 0), 0);
  const outstanding = totalEntries - totalPaid;

  const timeline = [
    ...entries.map((s) => ({
      type: "entry",
      date: s[entryDateKey],
      amount: s.total_amount,
      notes: s.notes,
      id: s.id,
    })),
    ...payments.map((p) => ({
      type: "payment",
      date: p.payment_date,
      amount: p.amount,
      method: p.payment_method,
      id: p.id,
    })),
  ];

  // Supplier view: chronological order with running balance, shown latest-first.
  // Customer view: latest-first, no balance.
  let balance = 0;
  const timelineItems = showBalance
    ? timeline
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((item) => {
          if (item.type === "entry") balance += item.amount;
          else balance -= item.amount;
          return { ...item, balance };
        })
        .reverse()
    : timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl m-4 my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 p-4 sm:p-6 border-b border-gray-100 shrink-0">
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              {totalLabel}
            </p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {formatINR(totalEntries)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Paid
            </p>
            <p className="text-lg font-bold text-accent-600 mt-1">
              {formatINR(totalPaid)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Outstanding
            </p>
            <p
              className={`text-lg font-bold mt-1 ${
                outstanding > 0 ? "text-warning-600" : "text-accent-600"
              }`}
            >
              {formatINR(outstanding)}
            </p>
          </div>
        </div>

        {/* Progress bar (supplier view) */}
        {showBalance && totalEntries > 0 && (
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 shrink-0">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
              <div
                className="h-2 bg-accent-500"
                style={{ width: `${(totalPaid / totalEntries) * 100}%` }}
              />
              <div
                className="h-2 bg-warning-400"
                style={{ width: `${(outstanding / totalEntries) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>
                {((totalPaid / totalEntries) * 100).toFixed(0)}% paid
              </span>
              <span>
                {((outstanding / totalEntries) * 100).toFixed(0)}% pending
              </span>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {timelineItems.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No transactions found
            </p>
          ) : (
            <div className={showBalance ? "space-y-2" : "space-y-3"}>
              {showBalance && (
                <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-400 uppercase px-2 mb-3">
                  <span className="col-span-2">Transaction</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Balance</span>
                </div>
              )}
              {timelineItems.map((item) =>
                showBalance ? (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={`grid grid-cols-4 gap-2 items-center p-3 rounded-lg border ${item.type === "entry" ? t.row : "border-accent-100 bg-accent-50"}`}
                  >
                    <div className="col-span-2 flex items-center gap-3 min-w-0">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 ${item.type === "entry" ? t.tile : "bg-accent-100"}`}
                      >
                        {item.type === "entry" ? (
                          <EntryIcon className={`w-3.5 h-3.5 ${t.icon}`} />
                        ) : (
                          <CreditCard className="w-3.5 h-3.5 text-accent-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-xs">
                          {item.type === "entry"
                            ? entryLabel
                            : `Payment — ${item.method?.toUpperCase()}`}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-gray-400 truncate">
                            {item.notes}
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {formatDateShort(item.date)}
                        </div>
                      </div>
                    </div>
                    <p
                      className={`text-right font-semibold text-sm ${item.type === "entry" ? t.text : "text-accent-700"}`}
                    >
                      {item.type === "entry" ? "+" : "-"}
                      {formatINR(item.amount)}
                    </p>
                    <p
                      className={`text-right font-semibold text-sm ${item.balance > 0 ? "text-warning-600" : "text-accent-600"}`}
                    >
                      {formatINR(item.balance)}
                    </p>
                  </div>
                ) : (
                  <div
                    key={`${item.type}-${item.id}`}
                    className={`flex items-start gap-4 p-4 rounded-lg border ${item.type === "entry" ? t.row : "border-accent-100 bg-accent-50"}`}
                  >
                    <div
                      className={`p-2 rounded-lg ${item.type === "entry" ? t.tile : "bg-accent-100"}`}
                    >
                      {item.type === "entry" ? (
                        <EntryIcon className={`w-4 h-4 ${t.icon}`} />
                      ) : (
                        <CreditCard className="w-4 h-4 text-accent-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">
                        {item.type === "entry"
                          ? entryLabel
                          : `Payment — ${item.method?.toUpperCase()}`}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {item.notes}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateShort(item.date)}
                      </div>
                    </div>
                    <p
                      className={`font-semibold text-sm whitespace-nowrap ${item.type === "entry" ? t.text : "text-accent-700"}`}
                    >
                      {item.type === "entry" ? "+" : "-"}
                      {formatINR(item.amount)}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
