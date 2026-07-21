"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  CreditCard,
  Calendar,
  Eye,
  Trash2,
  History,
  TrendingUp,
  Download,
  FileUp,
  X,
} from "lucide-react";
import { exportCSV } from "../utils/export";
import { validatePayment, hasErrors } from "../utils/validators";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import SaleForm from "./SaleForm";
import SalePaymentModal from "./SalePaymentModal";
import SaleDetailsModal from "./SaleDetailsModal";
import SalesImport from "./SalesImport";
import Pagination from "./shared/Pagination";
import { formatDate, formatCustomerName } from "../utils/formatters";
import EmptyState from "./shared/EmptyState";
import { SearchInput } from "./shared/FormField";

const PAGE_SIZE = 10;
const PAYMENT_BADGES = {
  cash: "bg-accent-100 text-accent-800",
  credit: "bg-warning-100 text-warning-800",
  partial: "bg-blue-100 text-blue-800",
};
const PAYMENT_LABELS = { cash: "Cash", credit: "Credit", partial: "Partial" };

function PaymentBadge({ type }) {
  return (
    <span className={`badge ${PAYMENT_BADGES[type] || ""}`}>
      {PAYMENT_LABELS[type] || type}
    </span>
  );
}

export default function Sales() {
  const toast = useToast();
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customRange, setCustomRange] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeletePayment, setConfirmDeletePayment] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selectedGroupForDetails, setSelectedGroupForDetails] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showMargin, setShowMargin] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("salesShowMargin");
    if (saved !== null) {
      setShowMargin(saved === "true");
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [salesRes, customersRes, fabricsRes] = await Promise.all([
        supabase
          .from("sales")
          .select("*")
          .order("sale_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("customers").select("*").order("name"),
        supabase.from("fabrics").select("*").order("name"),
      ]);
      if (salesRes.error) throw salesRes.error;
      if (customersRes.error) throw customersRes.error;
      if (fabricsRes.error) throw fabricsRes.error;
      const customerMap = Object.fromEntries(
        (customersRes.data || []).map((c) => [c.id, c]),
      );
      const salesWithCustomer = (salesRes.data || []).map((s) => ({
        ...s,
        customer: customerMap[s.customer_id] || null,
      }));
      setSales(salesWithCustomer);
      setCustomers(customersRes.data || []);
      setFabrics(fabricsRes.data || []);
      return salesWithCustomer;
    } catch (error) {
      const message =
        error?.message || JSON.stringify(error) || "Unknown error";
      console.error("Error fetching sales data:", message, error);
      toast(`Failed to load sales data: ${message}`, "error");
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function fetchSales() {
    try {
      const [salesRes, customersRes] = await Promise.all([
        supabase
          .from("sales")
          .select("*")
          .order("sale_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("customers").select("*").order("name"),
      ]);
      if (salesRes.error) throw salesRes.error;
      if (customersRes.error) throw customersRes.error;
      const customerMap = Object.fromEntries(
        (customersRes.data || []).map((c) => [c.id, c]),
      );
      const salesWithCustomer = (salesRes.data || []).map((s) => ({
        ...s,
        customer: customerMap[s.customer_id] || null,
      }));
      setSales(salesWithCustomer);
      setCustomers(customersRes.data || []);
      return salesWithCustomer;
    } catch (error) {
      console.error("Error fetching sales:", error?.message || error);
      return [];
    }
  }

  async function handlePaymentSubmit(
    e,
    paymentData,
    setPaymentData,
    INITIAL_PAYMENT,
  ) {
    e.preventDefault();
    if (!selectedSale) return;
    const errors = validatePayment(paymentData);
    if (hasErrors(errors)) {
      toast("Please fix the validation errors", "error");
      return;
    }
    try {
      let remainingToPay = parseFloat(paymentData.amount);
      const paymentInserts = [];
      for (const item of selectedSale.items || []) {
        if (remainingToPay <= 0) break;
        if (item.remaining_amount <= 0) continue;
        const pay = Math.min(remainingToPay, item.remaining_amount);
        paymentInserts.push({
          sale_id: item.id,
          amount: pay,
          payment_date: paymentData.payment_date,
          payment_method: paymentData.payment_method,
          reference_number: paymentData.reference_number,
          notes: paymentData.notes,
        });
        remainingToPay -= pay;
      }
      const { error } = await supabase
        .from("sale_payments")
        .insert(paymentInserts);
      if (error) throw error;

      // Update payment_type based on remaining amount after this payment
      for (const item of selectedSale.items || []) {
        const paymentForItem = paymentInserts.find(
          (p) => p.sale_id === item.id,
        );
        if (!paymentForItem) continue;
        const newRemaining = item.remaining_amount - paymentForItem.amount;
        if (newRemaining <= 0) {
          await supabase
            .from("sales")
            .update({ payment_type: "cash" })
            .eq("id", item.id);
        } else if (item.payment_type === "credit") {
          await supabase
            .from("sales")
            .update({ payment_type: "partial" })
            .eq("id", item.id);
        }
      }

      setShowPaymentForm(false);
      setPaymentData({ ...INITIAL_PAYMENT });
      fetchSales();
      fetchPayments(selectedSale.items.map((i) => i.id));
      toast("Payment recorded");
    } catch (error) {
      toast("Failed to save payment", "error");
    }
  }

  async function fetchPayments(saleIds) {
    try {
      const { data } = await supabase
        .from("sale_payments")
        .select("*")
        .in("sale_id", Array.isArray(saleIds) ? saleIds : [saleIds])
        .order("payment_date", { ascending: false });
      setPayments(data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDeletePayment(paymentId) {
    try {
      const { error } = await supabase
        .from("sale_payments")
        .delete()
        .eq("id", paymentId);
      if (error) throw error;
      toast("Payment deleted");
      fetchPayments(selectedSale.items.map((i) => i.id));
      fetchSales();
    } catch (err) {
      toast("Failed to delete payment", "error");
    } finally {
      setConfirmDeletePayment(null);
    }
  }

  async function handleDelete(deleteInfo) {
    try {
      if (deleteInfo.isGroup) {
        const { error: paymentsError } = await supabase
          .from("sale_payments")
          .delete()
          .in("sale_id", deleteInfo.saleIds);
        if (paymentsError) throw paymentsError;
        const { error: salesError } = await supabase
          .from("sales")
          .delete()
          .in("id", deleteInfo.saleIds);
        if (salesError) throw salesError;
        toast("Sales group deleted");
      } else {
        const { error: paymentsError } = await supabase
          .from("sale_payments")
          .delete()
          .eq("sale_id", deleteInfo);
        if (paymentsError) throw paymentsError;
        const { error: salesError } = await supabase
          .from("sales")
          .delete()
          .eq("id", deleteInfo);
        if (salesError) throw salesError;
        toast("Sale deleted");
      }
      fetchSales();
    } catch (err) {
      toast("Failed to delete sale", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  function toLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Compute effective dateFrom/dateTo based on the dateFilter preset
  const effectiveDateRange = useMemo(() => {
    if (customRange) {
      return { dateFrom, dateTo };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toLocalDateStr(today);
    switch (dateFilter) {
      case "today":
        return { dateFrom: todayStr, dateTo: todayStr };
      case "yesterday": {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          dateFrom: toLocalDateStr(yesterday),
          dateTo: toLocalDateStr(yesterday),
        };
      }
      case "week": {
        const week = new Date(today);
        week.setDate(week.getDate() - 6);
        return { dateFrom: toLocalDateStr(week), dateTo: todayStr };
      }
      case "month": {
        const month = new Date(today);
        month.setMonth(month.getMonth() - 1);
        return { dateFrom: toLocalDateStr(month), dateTo: todayStr };
      }
      default:
        return { dateFrom: "", dateTo: "" };
    }
  }, [dateFilter, customRange, dateFrom, dateTo]);

  const filteredSales = useMemo(
    () =>
      sales.filter((s) => {
        const term = searchTerm.toLowerCase();
        const c = s.customer?.name?.toLowerCase() || "";
        const n = s.notes?.toLowerCase() || "";
        const f = s.fabric_name?.toLowerCase() || "";
        const cust = s.customer_name?.toLowerCase() || "";
        const efFrom = effectiveDateRange.dateFrom;
        const efTo = effectiveDateRange.dateTo;
        return (
          (c.includes(term) ||
            n.includes(term) ||
            f.includes(term) ||
            cust.includes(term)) &&
          (filterType === "all" || s.payment_type === filterType) &&
          (!efFrom || s.sale_date >= efFrom) &&
          (!efTo || s.sale_date <= efTo)
        );
      }),
    [sales, searchTerm, filterType, effectiveDateRange],
  );

  const groupedArray = useMemo(() => {
    const groups = filteredSales.reduce((acc, sale) => {
      const key = sale.sale_group_id || sale.id;
      if (!acc[key])
        acc[key] = {
          id: key,
          customer_id: sale.customer_id,
          customer: sale.customer,
          sale_date: sale.sale_date,
          payment_type: sale.payment_type,
          items: [],
          total_amount: 0,
          margin: 0,
          remaining_amount: 0,
          paid_amount: 0,
          discount_amount: 0,
          createdAt: sale.created_at || sale.sale_date,
          firstSaleId: sale.id,
        };
      acc[key].items.push(sale);
      acc[key].total_amount += sale.total_amount;
      acc[key].margin += sale.margin;
      acc[key].paid_amount += sale.paid_amount;
      // Sum all discounts from items
      acc[key].discount_amount += sale.discount_amount || 0;
      // Keep the latest created_at for the group
      if (sale.created_at > acc[key].createdAt) {
        acc[key].createdAt = sale.created_at;
      }
      return acc;
    }, {});

    // Calculate group-level remaining and derive type from actual payment status
    Object.values(groups).forEach((group) => {
      group.remaining_amount = Math.max(
        group.total_amount - group.discount_amount - group.paid_amount,
        0,
      );
      // Derive payment type from actual payment status
      const netTotal = group.total_amount - group.discount_amount;
      if (group.paid_amount <= 0) {
        group.payment_type = "credit";
      } else if (group.paid_amount >= netTotal) {
        group.payment_type = "cash";
      } else {
        group.payment_type = "partial";
      }
    });

    return Object.values(groups).sort((a, b) => {
      const dateDiff = new Date(b.sale_date) - new Date(a.sale_date);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [filteredSales]);

  const handleSaleUpdated = useCallback(async () => {
    const fresh = await fetchSales();
    setSelectedGroupForDetails((prev) => {
      if (!prev) return prev;
      const key = prev.id;
      const items = fresh.filter((s) => (s.sale_group_id || s.id) === key);
      if (items.length === 0) return prev;

      const totalAmount = items.reduce((s, i) => s + i.total_amount, 0);
      const paidAmount = items.reduce((s, i) => s + i.paid_amount, 0);
      const discountAmount = items.reduce(
        (s, i) => s + (i.discount_amount || 0),
        0,
      );
      // Margin is already discount-adjusted by the DB trigger per item
      const adjustedMargin = items.reduce((s, i) => s + i.margin, 0);

      return {
        ...prev,
        customer_id: items[0].customer_id,
        customer: items[0].customer,
        sale_date: items[0].sale_date,
        payment_type: items[0].payment_type,
        items,
        total_amount: totalAmount,
        margin: adjustedMargin,
        paid_amount: paidAmount,
        discount_amount: discountAmount,
        remaining_amount: Math.max(
          totalAmount - discountAmount - paidAmount,
          0,
        ),
      };
    });
  }, []);

  const handleViewPayments = useCallback((group) => {
    setSelectedSale(group);
    fetchPayments(group.items.map((i) => i.id));
  }, []);

  const handleCloseDetails = useCallback(
    () => setSelectedGroupForDetails(null),
    [],
  );
  const handleOpenNewSale = useCallback(() => {
    setEditingId(null);
    setShowForm(true);
  }, []);
  const handleCloseSaleForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
  }, []);
  const handleCloseImport = useCallback(() => setShowImport(false), []);
  const handleClosePaymentForm = useCallback(
    () => setShowPaymentForm(false),
    [],
  );

  const totalPages = Math.ceil(groupedArray.length / PAGE_SIZE);
  const paginated = groupedArray.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-gray-500 mt-1">
            Track sales and customer payments
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setShowMargin((v) => {
                const next = !v;
                localStorage.setItem("salesShowMargin", String(next));
                return next;
              })
            }
            className={`btn ${showMargin ? "btn-secondary" : "btn-ghost"}`}
            title={showMargin ? "Hide margin column" : "Show margin column"}
          >
            <TrendingUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="btn btn-secondary"
            title="Import from Excel/CSV"
          >
            <FileUp className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              exportCSV(
                filteredSales.map((s) => ({
                  date: s.sale_date,
                  customer: s.customer?.name || s.customer_name || "Walk-in",
                  fabric_name: s.fabric_name || "",
                  notes: s.notes,
                  meters: s.meters,
                  price_per_meter: s.price_per_meter,
                  total: s.total_amount,
                  discount: s.discount_amount || 0,
                  paid: s.paid_amount,
                  remaining: s.remaining_amount,
                  type: s.payment_type,
                })),
                `sales-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
          </button>
          <button onClick={handleOpenNewSale} className="btn btn-primary">
            <Plus className="w-5 h-5 mr-2" /> New Sale
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by customer or fabric..."
        />
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(1);
          }}
          className="input w-full sm:w-40"
        >
          <option value="all">All Types</option>
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
          <option value="partial">Partial</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => {
            const val = e.target.value;
            setDateFilter(val);
            setCustomRange(val === "custom");
            setPage(1);
          }}
          className="input w-full sm:w-40"
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>
        {customRange && (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="input w-full sm:w-36"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="input w-full sm:w-36"
            />
          </div>
        )}
      </div>

      <SaleForm
        open={showForm}
        onClose={handleCloseSaleForm}
        editingId={editingId}
        onSaved={() => {
          fetchSales();
          setPage(1);
        }}
        fabrics={fabrics}
        customers={customers}
      />

      <SalesImport
        open={showImport}
        onClose={handleCloseImport}
        onImported={() => {
          fetchAll();
          setPage(1);
        }}
        fabrics={fabrics}
        customers={customers}
      />

      <SalePaymentModal
        open={showPaymentForm}
        onClose={handleClosePaymentForm}
        selectedSale={selectedSale}
        onPaymentSubmit={handlePaymentSubmit}
      />

      {/* Payment History Modal */}
      {!!selectedSale && !showPaymentForm && payments.length > 0 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8 animate-modal-in shadow-xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Payment History
              </h2>
              <button
                onClick={() => {
                  setSelectedSale(null);
                  setPayments([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm">
                Customer:{" "}
                <span className="font-medium">
                  {formatCustomerName(selectedSale)}
                </span>
              </p>
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="text-sm">
                  Total:{" "}
                  <span className="font-semibold">
                    ₹
                    {selectedSale.total_amount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
                <span className="text-sm">
                  Margin:{" "}
                  <span className="font-semibold text-accent-600">
                    ₹
                    {selectedSale.margin.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
              </div>
              <p className="text-sm mt-2">
                Remaining:{" "}
                <span className="font-semibold text-warning-600">
                  ₹
                  {selectedSale.remaining_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </p>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
              {payments.map((p) => (
                <div key={p.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">
                        ₹
                        {p.amount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(p.payment_date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="badge bg-gray-200 text-gray-700">
                          {p.payment_method.toUpperCase()}
                        </span>
                        {p.reference_number && (
                          <p className="text-xs text-gray-500 mt-1">
                            {p.reference_number}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setConfirmDeletePayment(p.id)}
                        className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete payment"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {selectedSale.remaining_amount > 0 && (
              <button
                onClick={() => setShowPaymentForm(true)}
                className="btn btn-accent w-full mt-4"
              >
                <CreditCard className="w-5 h-5 mr-2" /> Receive Payment
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "700px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  "Customer",
                  "Date",
                  "Items",
                  "Mtrs",
                  "Total",
                  "Paid",
                  ...(showMargin ? ["Margin"] : []),
                  "Disc./Extra",
                  "Remaining",
                  "Type",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      [
                        "Total",
                        "Paid",
                        "Margin",
                        "Remaining",
                        "Items",
                        "Mtrs",
                      ].includes(h)
                        ? "text-right"
                        : h === "Type"
                          ? "text-center"
                          : h === "Actions"
                            ? "text-right"
                            : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((group) => (
                <tr
                  key={group.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {formatCustomerName(group)}
                      </p>
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-gray-200 text-gray-500 text-[10px] font-bold shrink-0">
                        {group.items
                          .map((i) => i.fabric_name?.trim().charAt(0) || "")
                          .filter(Boolean)
                          .join("")
                          .toUpperCase()
                          .slice(0, 4)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-gray-600 text-sm">
                      {formatDate(group.sale_date)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedGroupForDetails(group)}
                      className="inline-flex items-center justify-center min-w-6 px-2 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700 hover:bg-primary-200 hover:text-primary-800 transition-colors cursor-pointer"
                      title="View items"
                    >
                      {group.items.length}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-sm">
                    {group.items
                      .reduce((s, i) => s + (parseFloat(i.meters) || 0), 0)
                      .toFixed(1)}
                    m
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-sm">
                    ₹
                    {group.total_amount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className="font-medium">
                      ₹
                      {group.paid_amount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </td>
                  {showMargin && (
                    <td className="px-4 py-3 text-right text-sm">
                      <span className="text-accent-600 font-medium">
                        ₹
                        {group.margin.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-sm">
                    {(() => {
                      const netTotal = group.total_amount - group.discount_amount;
                      const extraPaid = group.paid_amount - netTotal;
                      if (extraPaid > 0.005) {
                        return (
                          <span className="font-medium text-accent-600">
                            +₹
                            {extraPaid.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        );
                      }
                      if (group.discount_amount > 0) {
                        return (
                          <span className="font-medium text-primary-600">
                            -₹
                            {group.discount_amount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        );
                      }
                      return <span className="text-gray-300">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span
                      className={
                        group.remaining_amount > 0
                          ? "text-warning-600 font-semibold"
                          : "text-gray-500"
                      }
                    >
                      ₹
                      {group.remaining_amount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PaymentBadge type={group.payment_type} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedGroupForDetails(group)}
                        className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-500 hover:text-blue-600"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSale(group);
                          fetchPayments(group.items.map((i) => i.id));
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                        title="View payments"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      {group.remaining_amount > 0 && (
                        <button
                          onClick={() => {
                            setSelectedSale(group);
                            setShowPaymentForm(true);
                          }}
                          className="p-1.5 hover:bg-accent-50 rounded-lg text-gray-500 hover:text-accent-600"
                          title="Receive payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            isGroup: true,
                            saleIds: group.items.map((i) => i.id),
                            itemCount: group.items.length,
                          })
                        }
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                        title="Delete sale"
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
        totalItems={groupedArray.length}
        label="sales groups"
      />

      <SaleDetailsModal
        open={!!selectedGroupForDetails}
        onClose={handleCloseDetails}
        group={selectedGroupForDetails}
        fabrics={fabrics}
        customers={customers}
        onSaleUpdated={handleSaleUpdated}
        onViewPayments={handleViewPayments}
      />

      {confirmDeletePayment && (
        <ConfirmModal
          message="This will permanently delete this payment. The sale's paid amount and remaining balance will be recalculated."
          onConfirm={() => handleDeletePayment(confirmDeletePayment)}
          onCancel={() => setConfirmDeletePayment(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={
            confirmDelete.isGroup
              ? `This will permanently delete all ${confirmDelete.itemCount} items in this sales group and all their payments.`
              : "This will permanently delete the sale and all its payments."
          }
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {groupedArray.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No sales found"
          searchTerm={searchTerm}
          description="Try adjusting your filters"
        />
      )}
    </div>
  );
}
