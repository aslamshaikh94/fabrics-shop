"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { X, Calendar, TrendingUp, CreditCard } from "lucide-react";

export default function CustomerLedger({ customer, onClose }) {
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLedger();
  }, [customer.id]);

  async function fetchLedger() {
    try {
      const [salesRes, paymentsRes] = await Promise.all([
        supabase
          .from("sales")
          .select("*")
          .eq("customer_id", customer.id)
          .order("sale_date", { ascending: false }),
        supabase
          .from("sale_payments")
          .select("*, sale:sales(customer_id)")
          .order("payment_date", { ascending: false }),
      ]);
      const allSales = salesRes.data || [];
      const saleIds = allSales.map((s) => s.id);
      const relatedPayments = (paymentsRes.data || []).filter((p) =>
        saleIds.includes(p.sale_id),
      );
      setSales(allSales);
      setPayments(relatedPayments);
    } catch (err) {
      console.error("Error fetching ledger:", err);
    } finally {
      setLoading(false);
    }
  }

  const totalBilled = sales.reduce((s, r) => s + (r.total_amount || 0), 0);
  const totalPaid = payments.reduce((s, r) => s + (r.amount || 0), 0);
  const outstanding = totalBilled - totalPaid;

  // Merge sales and payments into a single timeline
  const timeline = [
    ...sales.map((s) => ({
      type: "sale",
      date: s.sale_date,
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
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {customer.name}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Customer Ledger</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 p-4 sm:p-6 border-b border-gray-100">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Total Billed
                </p>
                <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1">
                  ₹
                  {totalBilled.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Total Paid
                </p>
                <p className="text-lg sm:text-xl font-bold text-accent-600 mt-1">
                  ₹
                  {totalPaid.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Outstanding
                </p>
                <p
                  className={`text-lg sm:text-xl font-bold mt-1 ${outstanding > 0 ? "text-warning-600" : "text-accent-600"}`}
                >
                  ₹
                  {outstanding.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              {timeline.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No transactions found
                </p>
              ) : (
                <div className="space-y-3">
                  {timeline.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className={`flex items-start gap-4 p-4 rounded-lg border ${item.type === "sale" ? "border-primary-100 bg-primary-50" : "border-accent-100 bg-accent-50"}`}
                    >
                      <div
                        className={`p-2 rounded-lg ${item.type === "sale" ? "bg-primary-100" : "bg-accent-100"}`}
                      >
                        {item.type === "sale" ? (
                          <TrendingUp className="w-4 h-4 text-primary-600" />
                        ) : (
                          <CreditCard className="w-4 h-4 text-accent-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">
                          {item.type === "sale"
                            ? "Sale"
                            : `Payment — ${item.method?.toUpperCase()}`}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {item.notes}
                          </p>
                        )}
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })}
                        </div>
                      </div>
                      <p
                        className={`font-semibold text-sm whitespace-nowrap ${item.type === "sale" ? "text-primary-700" : "text-accent-700"}`}
                      >
                        {item.type === "sale" ? "+" : "-"}₹
                        {item.amount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
