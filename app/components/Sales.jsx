"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  CreditCard,
  Calendar,
  Eye,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { validatePayment, hasErrors } from "../utils/validators";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import SaleForm from "./SaleForm";
import SaleDetailsModal from "./SaleDetailsModal";
import ColumnPicker from "./shared/ColumnPicker";
import Pagination from "./shared/Pagination";
import { formatDate, formatCustomerName } from "../utils/formatters";
import EmptyState from "./shared/EmptyState";
import { SearchInput } from "./shared/FormField";

const PAGE_SIZE = 10;

const ALL_SALE_COLUMNS = [
  { key: "customer",  label: "Customer" },
  { key: "date",      label: "Date" },
  { key: "items",     label: "Items" },
  { key: "mtrs",      label: "Mtrs" },
  { key: "total",     label: "Total" },
  { key: "paid",      label: "Paid" },
  { key: "margin",    label: "Margin" },
  { key: "discExtra", label: "Disc./Extra" },
  { key: "remaining", label: "Remaining" },
  { key: "type",      label: "Type" },
  { key: "actions",   label: "Actions" },
];

const SALE_DEFAULT_VISIBLE = new Set(["customer", "date", "items", "mtrs", "total", "paid", "margin", "discExtra", "remaining", "type", "actions"]);

function loadSaleVisibleCols() {
  try {
    const saved = localStorage.getItem("sales_visible_cols");
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(SALE_DEFAULT_VISIBLE);
}
const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
];

const INITIAL_PAYMENT = {
  amount: "",
  payment_date: new Date().toISOString().split("T")[0],
  payment_method: "cash",
  partner_id: "",
};
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
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [paymentData, setPaymentData] = useState({ ...INITIAL_PAYMENT });
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
  const [visibleCols, setVisibleCols] = useState(loadSaleVisibleCols);

  useEffect(() => {
    localStorage.setItem("sales_visible_cols", JSON.stringify([...visibleCols]));
  }, [visibleCols]);

  function toggleCol(key) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const col = (key) => visibleCols.has(key);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [salesRes, customersRes, fabricsRes, partnersRes] = await Promise.all([
        supabase
          .from("sales")
          .select("*")
          .order("sale_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("customers").select("*").order("name"),
        supabase.from("fabrics").select("*").order("name"),
        supabase.from("partners").select("id,name").eq("is_active", true).order("name"),
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
      setPartners(partnersRes.data || []);
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

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedSale) return;
    const errors = validatePayment(paymentData);
    if (hasErrors(errors)) {
      toast("Please fix the validation errors", "error");
      return;
    }
    if (paymentData.payment_method === "upi" && !paymentData.partner_id) {
      toast("Please select the partner whose account this credits", "error");
      return;
    }
    try {
      const { error } = await supabase.from("sale_payments").insert([{
        sale_group_id: selectedSale.id,
        amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        partner_id:
          paymentData.payment_method === "upi" ? paymentData.partner_id : null,
      }]);
      if (error) throw error;
      setPaymentData({ ...INITIAL_PAYMENT });
      adjustSelectedSaleBalances(parseFloat(paymentData.amount) || 0);
      fetchSales();
      fetchPayments(selectedSale);
      toast("Payment recorded");
    } catch (error) {
      toast("Failed to save payment", "error");
    }
  }

  async function fetchPayments(group) {
    try {
      const saleIds = group.items.map((i) => i.id);
      const { data } = await supabase
        .from("sale_payments")
        .select("*")
        .or(`sale_group_id.eq.${group.id},sale_id.in.(${saleIds.join(",")})`)
        .order("payment_date", { ascending: false });
      // Resolve holder name from the partners list (client-side lookup)
      const withPartner = (data || []).map((p) => ({
        ...p,
        partner_name: p.partner_id
          ? partners.find((x) => x.id === p.partner_id)?.name
          : null,
      }));
      // Deduplicate: group payments (sale_group_id set) take priority, exclude old per-item rows that are already covered
      const groupRows = withPartner.filter((p) => p.sale_group_id === group.id);
      const legacyRows = withPartner.filter((p) => !p.sale_group_id);
      // Group legacy rows by created_at second to show as single entries
      const legacyGrouped = Object.values(legacyRows.reduce((acc, p) => {
        const key = p.created_at?.slice(0, 19) || p.id;
        if (!acc[key]) acc[key] = { ...p, amount: 0 };
        acc[key].amount = Math.round((acc[key].amount + p.amount) * 100) / 100;
        return acc;
      }, {}));
      setPayments([...groupRows, ...legacyGrouped].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date)));
    } catch (error) {
      console.error(error);
    }
  }

  // Keep the Payment History summary (Total/Paid/Remaining) in sync after adding/removing a payment
  function adjustSelectedSaleBalances(delta) {
    setSelectedSale((prev) => {
      if (!prev) return prev;
      const netTotal = Number(prev.total_amount) - (Number(prev.discount_amount) || 0);
      const newPaid = Math.max(
        Math.round(((Number(prev.paid_amount) || 0) + delta) * 100) / 100,
        0,
      );
      const newRemaining = Math.max(netTotal - newPaid, 0);
      return {
        ...prev,
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        payment_type:
          newPaid <= 0
            ? "credit"
            : newPaid >= netTotal
              ? "cash"
              : "partial",
      };
    });
  }

  async function handleDeletePayment(payment) {
    try {
      if (payment.sale_group_id) {
        await supabase.from("sale_payments").delete().eq("id", payment.id);
      } else {
        // Legacy: delete all rows in same batch by created_at second
        const batchKey = payment.created_at?.slice(0, 19);
        const saleIds = selectedSale.items.map((i) => i.id);
        await supabase.from("sale_payments").delete()
          .in("sale_id", saleIds)
          .gte("created_at", batchKey)
          .lt("created_at", batchKey + "Z");
      }
      toast("Payment deleted");
      adjustSelectedSaleBalances(-(payment.amount || 0));
      fetchPayments(selectedSale);
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
        // Also delete group-level payments
        await supabase.from("sale_payments").delete().eq("sale_group_id", deleteInfo.groupId);
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
    setPaymentData({ ...INITIAL_PAYMENT });
    fetchPayments(group);
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
          <ColumnPicker
            columns={ALL_SALE_COLUMNS}
            visibleCols={visibleCols}
            onToggle={toggleCol}
            onReset={() => setVisibleCols(new Set(SALE_DEFAULT_VISIBLE))}
          />
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
        partners={partners}
      />

      {/* Payment History + Receive Payment Modal */}
      {!!selectedSale && (
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
            {payments.length === 0 && (
              <p className="text-sm text-gray-400 italic text-center py-4">
                No payments recorded yet
              </p>
            )}
            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
              {payments.map((p) => (
                <div key={p.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">
                        ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(p.payment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
                      </p>
                      {p.partner_name && (
                        <p className="text-xs text-primary-600 font-medium mt-0.5">
                          {p.partner_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="badge bg-gray-200 text-gray-700">
                          {p.payment_method.toUpperCase()}
                        </span>
                        {p.reference_number && (
                          <p className="text-xs text-gray-500 mt-1">{p.reference_number}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setConfirmDeletePayment(p)}
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
            {selectedSale.remaining_amount > 0 ? (
              <form
                onSubmit={handlePaymentSubmit}
                className="mt-4 border-t border-gray-200 pt-4"
              >
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                  <CreditCard className="w-4 h-4 text-accent-600" />
                  Receive Payment
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Amount *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      max={selectedSale.remaining_amount}
                      value={paymentData.amount}
                      onChange={(e) =>
                        setPaymentData({ ...paymentData, amount: e.target.value })
                      }
                      className="input"
                      placeholder="0.00"
                      onWheel={(e) => e.target.blur()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={paymentData.payment_date}
                      onChange={(e) =>
                        setPaymentData({
                          ...paymentData,
                          payment_date: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={paymentData.payment_method}
                      onChange={(e) =>
                        setPaymentData({
                          ...paymentData,
                          payment_method: e.target.value,
                        })
                      }
                      className="input"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {paymentData.payment_method === "upi" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Account Holder (Partner) *
                      </label>
                      <select
                        value={paymentData.partner_id}
                        onChange={(e) => setPaymentData({ ...paymentData, partner_id: e.target.value })}
                        className="input"
                        required
                      >
                        <option value="">— Select partner —</option>
                        {partners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <button type="submit" className="btn btn-accent w-full mt-3">
                  <CreditCard className="w-5 h-5 mr-2" /> Receive Payment
                </button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-accent-600 font-semibold flex items-center justify-center gap-1">
                ✓ Fully Paid
              </p>
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
                {col("customer") && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Customer</th>}
                {col("date")      && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Date</th>}
                {col("items")     && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Items</th>}
                {col("mtrs")      && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Mtrs</th>}
                {col("total")     && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total</th>}
                {col("paid")      && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Paid</th>}
                {col("margin") && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Margin</th>}
                {col("discExtra") && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Disc./Extra</th>}
                {col("remaining") && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Remaining</th>}
                {col("type")      && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Type</th>}
                {col("actions") && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((group) => (
                <tr
                  key={group.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {col("customer") && (
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
                  )}
                  {col("date") && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-600 text-sm">{formatDate(group.sale_date)}</span>
                    </td>
                  )}
                  {col("items") && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedGroupForDetails(group)}
                        className="inline-flex items-center justify-center min-w-6 px-2 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700 hover:bg-primary-200 hover:text-primary-800 transition-colors cursor-pointer"
                        title="View items"
                      >
                        {group.items.length}
                      </button>
                    </td>
                  )}
                  {col("mtrs") && (
                    <td className="px-4 py-3 text-right text-gray-600 text-sm">
                      {group.items.reduce((s, i) => s + (parseFloat(i.meters) || 0), 0).toFixed(1)}m
                    </td>
                  )}
                  {col("total") && (
                    <td className="px-4 py-3 text-right font-medium text-sm">
                      ₹{group.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                  {col("paid") && (
                    <td className="px-4 py-3 text-right text-sm">
                      <span className="font-medium">
                        ₹{group.paid_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                  )}
                  {col("margin") && (
                    <td className="px-4 py-3 text-right text-sm">
                      <span className="text-accent-600 font-medium">
                        ₹{group.margin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                  )}
                  {col("discExtra") && (
                    <td className="px-4 py-3 text-right text-sm">
                      {(() => {
                        const netTotal = group.total_amount - group.discount_amount;
                        const extraPaid = group.paid_amount - netTotal;
                        if (extraPaid > 0.005)
                          return <span className="font-medium text-accent-600">+₹{extraPaid.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
                        if (group.discount_amount > 0)
                          return <span className="font-medium text-primary-600">-₹{group.discount_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
                        return <span className="text-gray-300">—</span>;
                      })()}
                    </td>
                  )}
                  {col("remaining") && (
                    <td className="px-4 py-3 text-right text-sm">
                      <span className={group.remaining_amount > 0 ? "text-warning-600 font-semibold" : "text-gray-500"}>
                        ₹{group.remaining_amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                  )}
                  {col("type") && (
                    <td className="px-4 py-3 text-center">
                      <PaymentBadge type={group.payment_type} />
                    </td>
                  )}
                  {col("actions") && (
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
                          onClick={() => handleViewPayments(group)}
                          className="p-1.5 hover:bg-accent-50 rounded-lg text-gray-500 hover:text-accent-600"
                          title="View payments"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setConfirmDelete({
                              isGroup: true,
                              groupId: group.id,
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
                  )}
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
        partners={partners}
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
