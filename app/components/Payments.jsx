"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Search,
  Calendar,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingBag,
  Users,
  Download,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  CreditCard,
} from "lucide-react";

import { useToast } from "./Toast";
import { exportCSV } from "../utils/export";

const PAGE_SIZE = 10;

export default function Payments() {
  const toast = useToast();
  const [purchasePayments, setPurchasePayments] = useState([]);
  const [salePayments, setSalePayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [page, setPage] = useState(1);
  const [supplierSummary, setSupplierSummary] = useState([]);
  const [customerSummary, setCustomerSummary] = useState([]);
  const [activeTab, setActiveTab] = useState("transactions");
  const [editingPayment, setEditingPayment] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchPayments();
    fetchSupplierSummary();
    fetchCustomerSummary();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [
    searchTerm,
    paymentTypeFilter,
    dateFilter,
    customDateStart,
    customDateEnd,
  ]);

  async function handleEditPayment(e) {
    e.preventDefault();
    try {
      const table =
        editingPayment.type === "received"
          ? "sale_payments"
          : "purchase_payments";
      const { error } = await supabase
        .from(table)
        .update({
          amount: parseFloat(editForm.amount),
          payment_date: editForm.payment_date,
          payment_method: editForm.payment_method,
          reference_number: editForm.reference_number,
          notes: editForm.notes,
        })
        .eq("id", editingPayment.id);
      if (error) throw error;
      setEditingPayment(null);
      fetchPayments();
      fetchSupplierSummary();
      fetchCustomerSummary();
      toast("Payment updated");
    } catch (err) {
      console.error("Error updating payment:", err);
      toast("Failed to update payment", "error");
    }
  }

  async function fetchCustomerSummary() {
    try {
      const { data } = await supabase
        .from("sales")
        .select(
          "customer:customers(name), total_amount, paid_amount, remaining_amount",
        );
      if (!data) return;
      const map = {};
      data.forEach((s) => {
        const name = s.customer?.name || "Walk-in";
        if (!map[name]) map[name] = { name, total: 0, paid: 0, pending: 0 };
        map[name].total += s.total_amount || 0;
        map[name].paid += s.paid_amount || 0;
        map[name].pending += s.remaining_amount || 0;
      });
      setCustomerSummary(
        Object.values(map).sort((a, b) => b.pending - a.pending),
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchSupplierSummary() {
    try {
      const { data } = await supabase
        .from("purchases")
        .select(
          "supplier:suppliers(name), total_amount, paid_amount, remaining_amount",
        );
      if (!data) return;
      const map = {};
      data.forEach((p) => {
        const name = p.supplier?.name || "Unknown";
        if (!map[name]) map[name] = { name, total: 0, paid: 0, pending: 0 };
        map[name].total += p.total_amount || 0;
        map[name].paid += p.paid_amount || 0;
        map[name].pending += p.remaining_amount || 0;
      });
      setSupplierSummary(
        Object.values(map).sort((a, b) => b.pending - a.pending),
      );
    } catch (err) {
      console.error("Error fetching supplier summary:", err);
    }
  }

  async function fetchPayments() {
    try {
      const [purchaseRes, saleRes] = await Promise.all([
        supabase
          .from("purchase_payments")
          .select("*, purchase:purchases(supplier_id, suppliers(name))")
          .order("payment_date", { ascending: false }),
        supabase
          .from("sale_payments")
          .select("*, sale:sales(customer_id, customers(name))")
          .order("payment_date", { ascending: false }),
      ]);
      setPurchasePayments(purchaseRes.data || []);
      setSalePayments(saleRes.data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
    } finally {
      setLoading(false);
    }
  }

  const filterByDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    switch (dateFilter) {
      case "today": {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      }
      case "week": {
        const w = new Date(today);
        w.setDate(w.getDate() - 7);
        return date >= w;
      }
      case "month": {
        const m = new Date(today);
        m.setMonth(m.getMonth() - 1);
        return date >= m;
      }
      case "custom":
        if (customDateStart && date < new Date(customDateStart)) return false;
        if (customDateEnd && date > new Date(customDateEnd)) return false;
        return true;
      default:
        return true;
    }
  };

  const paymentsMade = purchasePayments
    .filter((p) => filterByDate(p.payment_date))
    .map((p) => ({
      id: p.id,
      type: "paid",
      amount: p.amount,
      date: p.payment_date,
      method: p.payment_method,
      reference: p.reference_number,
      party: p.purchase?.suppliers?.name || "Unknown",
      notes: p.notes,
    }));

  const paymentsReceived = salePayments
    .filter((p) => filterByDate(p.payment_date))
    .map((p) => ({
      id: p.id,
      type: "received",
      amount: p.amount,
      date: p.payment_date,
      method: p.payment_method,
      reference: p.reference_number,
      party: p.sale?.customers?.name || "Walk-in",
      notes: p.notes,
    }));

  const allPayments = [...paymentsMade, ...paymentsReceived]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((p) => {
      if (paymentTypeFilter !== "all" && p.type !== paymentTypeFilter)
        return false;
      if (searchTerm)
        return p.party.toLowerCase().includes(searchTerm.toLowerCase());
      return true;
    });

  const totalPages = Math.ceil(allPayments.length / PAGE_SIZE);
  const paginatedPayments = allPayments.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const totalPaid = paymentsMade.reduce((sum, p) => sum + p.amount, 0);
  const totalReceived = paymentsReceived.reduce((sum, p) => sum + p.amount, 0);
  const netFlow = totalReceived - totalPaid;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-500 mt-1">Track all payment transactions</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("suppliers")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "suppliers" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Supplier Summary
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "customers" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Customer Summary
        </button>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "transactions" ? "border-primary-600 text-primary-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Transactions
        </button>
      </div>

      {/* Supplier Summary Tab */}
      {activeTab === "suppliers" && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">All Suppliers</p>
            <button
              onClick={() => exportCSV(supplierSummary, "supplier-summary.csv")}
              className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: "480px" }}>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Purchased
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {supplierSummary.map((s) => {
                  const paidPct =
                    s.total > 0 ? ((s.paid / s.total) * 100).toFixed(1) : 0;
                  const pendingPct =
                    s.total > 0 ? ((s.pending / s.total) * 100).toFixed(1) : 0;
                  return (
                    <tr key={s.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-warning-100 p-1.5 rounded-lg shrink-0">
                            <ShoppingBag className="w-4 h-4 text-warning-600" />
                          </div>
                          <span className="font-medium text-gray-900">
                            {s.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                        ₹{s.total.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className="font-semibold text-accent-600">
                          ₹{s.paid.toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span
                          className={
                            s.pending > 0
                              ? "font-semibold text-warning-600"
                              : "text-gray-400"
                          }
                        >
                          ₹{s.pending.toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div
                          className="relative inline-flex items-center justify-center rounded-full overflow-hidden text-xs font-medium px-2.5 py-0.5 cursor-pointer"
                          style={{ minWidth: "72px" }}
                          title={`Paid: ${paidPct}%  |  Pending: ${pendingPct}%`}
                        >
                          <span className="absolute inset-0 bg-warning-200" />
                          <span
                            className="absolute inset-y-0 left-0 bg-accent-400"
                            style={{ width: `${paidPct}%` }}
                          />
                          <span
                            className="relative z-10 font-medium"
                            style={{ color: "#111" }}
                          >
                            {s.pending > 0
                              ? s.paid > 0
                                ? "Partial"
                                : "Pending"
                              : "Paid"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {supplierSummary.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      ₹
                      {supplierSummary
                        .reduce((s, r) => s + r.total, 0)
                        .toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-accent-600">
                      ₹
                      {supplierSummary
                        .reduce((s, r) => s + r.paid, 0)
                        .toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-warning-600">
                      ₹
                      {supplierSummary
                        .reduce((s, r) => s + r.pending, 0)
                        .toLocaleString("en-IN")}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {supplierSummary.length === 0 && (
            <p className="text-center py-10 text-gray-500 text-sm">
              No supplier data found
            </p>
          )}
        </div>
      )}

      {activeTab === "customers" && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">All Customers</p>
            <button
              onClick={() => exportCSV(customerSummary, "customer-summary.csv")}
              className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: "480px" }}>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Billed
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customerSummary.map((c) => (
                  <tr key={c.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-primary-100 p-1.5 rounded-lg shrink-0">
                          <Users className="w-4 h-4 text-primary-600" />
                        </div>
                        <span className="font-medium text-gray-900">
                          {c.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      ₹{c.total.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-accent-600">
                      ₹{c.paid.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span
                        className={
                          c.pending > 0
                            ? "font-semibold text-warning-600"
                            : "text-gray-400"
                        }
                      >
                        ₹{c.pending.toLocaleString("en-IN")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {customerSummary.length > 0 && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      ₹
                      {customerSummary
                        .reduce((s, r) => s + r.total, 0)
                        .toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-accent-600">
                      ₹
                      {customerSummary
                        .reduce((s, r) => s + r.paid, 0)
                        .toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-warning-600">
                      ₹
                      {customerSummary
                        .reduce((s, r) => s + r.pending, 0)
                        .toLocaleString("en-IN")}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {customerSummary.length === 0 && (
            <p className="text-center py-10 text-gray-500 text-sm">
              No customer data found
            </p>
          )}
        </div>
      )}

      {activeTab === "transactions" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Payments Made</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    ₹{totalPaid.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="bg-red-100 p-3 rounded-lg">
                  <ArrowUpRight className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Payments Received</p>
                  <p className="text-2xl font-bold text-accent-600 mt-1">
                    ₹{totalReceived.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="bg-accent-100 p-3 rounded-lg">
                  <ArrowDownLeft className="w-6 h-6 text-accent-600" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Net Cash Flow</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${netFlow >= 0 ? "text-accent-600" : "text-red-600"}`}
                  >
                    ₹{netFlow.toLocaleString("en-IN")}
                  </p>
                </div>
                <div
                  className={`${netFlow >= 0 ? "bg-accent-100" : "bg-red-100"} p-3 rounded-lg`}
                >
                  <Filter
                    className={`w-6 h-6 ${netFlow >= 0 ? "text-accent-600" : "text-red-600"}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by party name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input pl-10"
                  />
                </div>
                <select
                  value={paymentTypeFilter}
                  onChange={(e) => setPaymentTypeFilter(e.target.value)}
                  className="input"
                >
                  <option value="all">All Payments</option>
                  <option value="paid">Payments Made</option>
                  <option value="received">Payments Received</option>
                </select>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="input"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              {dateFilter === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={customDateStart}
                    onChange={(e) => setCustomDateStart(e.target.value)}
                    className="input"
                  />
                  <input
                    type="date"
                    value={customDateEnd}
                    onChange={(e) => setCustomDateEnd(e.target.value)}
                    className="input"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {paginatedPayments.map((payment) => {
              return (
                <div
                  key={`${payment.type}-${payment.id}`}
                  className={`card p-4 border-l-4 ${payment.type === "received" ? "border-l-accent-500" : "border-l-red-500"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`p-2 rounded-lg ${payment.type === "received" ? "bg-accent-100" : "bg-red-100"}`}
                      >
                        {payment.type === "received" ? (
                          <ArrowDownLeft className="w-5 h-5 text-accent-600" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {payment.party}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(payment.date).toLocaleDateString(
                              "en-IN",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                          <span className="badge bg-gray-200 text-gray-700 uppercase">
                            {payment.method}
                          </span>
                          {payment.reference && (
                            <span className="text-xs text-gray-400">
                              Ref: {payment.reference}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-bold ${payment.type === "received" ? "text-accent-600" : "text-red-600"}`}
                      >
                        {payment.type === "received" ? "+" : "-"}₹
                        {payment.amount.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                  {payment.notes && (
                    <p className="text-sm text-gray-500 mt-2 pl-12 italic">
                      {payment.notes}
                    </p>
                  )}
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={() => {
                        setEditingPayment(payment);
                        setEditForm({
                          amount: payment.amount,
                          payment_date: payment.date,
                          payment_method: payment.method,
                          reference_number: payment.reference || "",
                          notes: payment.notes || "",
                        });
                      }}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 pt-4">
              <p className="text-sm text-gray-500">
                {allPayments.length} transactions — page {page} of {totalPages}
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

          {allPayments.length === 0 && (
            <div className="text-center py-16">
              <CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">
                No payments found matching your filters
              </p>
              <p className="text-gray-300 text-sm mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          )}
        </>
      )}

      {editingPayment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Edit Payment</h2>
              <button
                onClick={() => setEditingPayment(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">
                {editingPayment.type === "received" ? "Customer" : "Supplier"}:{" "}
                <span className="font-medium">{editingPayment.party}</span>
              </p>
            </div>
            <form onSubmit={handleEditPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm({ ...editForm, amount: e.target.value })
                  }
                  className="input"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={editForm.payment_date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, payment_date: e.target.value })
                  }
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={editForm.payment_method}
                  onChange={(e) =>
                    setEditForm({ ...editForm, payment_method: e.target.value })
                  }
                  className="input"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="check">Check</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={editForm.reference_number}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      reference_number: e.target.value,
                    })
                  }
                  className="input"
                  placeholder="Transaction ID / Check No."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                  className="input"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Update Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
