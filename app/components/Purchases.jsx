"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  CreditCard,
  X,
  Search,
  Calendar,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
  ShoppingBag,
  History,
} from "lucide-react";
import DateRangeFilter from "./DateRangeFilter";
import PurchaseForm from "./PurchaseForm";
import { exportCSV } from "../utils/export";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

const PAGE_SIZE = 10;

export default function Purchases() {
  const toast = useToast();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [selectedGroupForDetails, setSelectedGroupForDetails] = useState(null);
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [paymentData, setPaymentData] = useState({
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "cash",
    reference_number: "",
    notes: "",
  });

  useEffect(() => {
    fetchPurchases();
    fetchSuppliers();
    fetchFabrics();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterStatus, dateFrom, dateTo]);

  async function fetchPurchases() {
    try {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, supplier:suppliers(*)")
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      setPurchases(data || []);
    } catch (error) {
      console.error("Error fetching purchases:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSuppliers() {
    try {
      const { data } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      setSuppliers(data || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
    }
  }

  async function fetchFabrics() {
    try {
      const { data } = await supabase.from("fabrics").select("*").order("name");
      setFabrics(data || []);
    } catch (error) {
      console.error("Error fetching fabrics:", error);
    }
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedPurchase) return;
    try {
      let remainingToPay = parseFloat(paymentData.amount);
      const paymentInserts = [];

      for (const item of selectedPurchase.items || []) {
        if (remainingToPay <= 0) break;
        if (item.remaining_amount <= 0) continue;

        const pay = Math.min(remainingToPay, item.remaining_amount);
        paymentInserts.push({
          purchase_id: item.id,
          amount: pay,
          payment_date: paymentData.payment_date,
          payment_method: paymentData.payment_method,
          reference_number: paymentData.reference_number,
          notes: paymentData.notes,
        });
        remainingToPay -= pay;
      }

      const { error } = await supabase
        .from("purchase_payments")
        .insert(paymentInserts);
      if (error) throw error;

      setShowPaymentForm(false);
      setPaymentData({
        amount: "",
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "cash",
        reference_number: "",
        notes: "",
      });
      fetchPurchases();
      if (selectedPurchase) {
        fetchPayments(selectedPurchase.items.map((i) => i.id));
      }
      toast("Payment recorded");
    } catch (error) {
      console.error("Error saving payment:", error);
      toast("Failed to save payment", "error");
    }
  }

  async function fetchPayments(purchaseIds) {
    try {
      const { data } = await supabase
        .from("purchase_payments")
        .select("*")
        .in("purchase_id", Array.isArray(purchaseIds) ? purchaseIds : [purchaseIds])
        .order("payment_date", { ascending: false });
      setPayments(data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
    }
  }

  function handleViewPayments(group) {
    setSelectedPurchase(group);
    fetchPayments(group.items.map((i) => i.id));
  }

  function handleAddPayment(group) {
    setSelectedPurchase(group);
    setShowPaymentForm(true);
  }

  async function handleDelete(deleteInfo) {
    try {
      if (deleteInfo.isGroup) {
        const purchaseIds = deleteInfo.purchaseIds;
        const { error: deletePaymentsError } = await supabase
          .from("purchase_payments")
          .delete()
          .in("purchase_id", purchaseIds);
        if (deletePaymentsError) throw deletePaymentsError;

        const { error } = await supabase
          .from("purchases")
          .delete()
          .in("id", purchaseIds);
        if (error) throw error;
        toast("Purchase group deleted");
      } else {
        const { error: deletePaymentsError } = await supabase
          .from("purchase_payments")
          .delete()
          .eq("purchase_id", deleteInfo);
        if (deletePaymentsError) throw deletePaymentsError;

        const { error } = await supabase
          .from("purchases")
          .delete()
          .eq("id", deleteInfo);
        if (error) throw error;
        toast("Purchase deleted");
      }
      fetchPurchases();
    } catch (err) {
      console.error("Error deleting purchase:", err);
      toast("Failed to delete purchase", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  // Filter and group purchases
  const filteredPurchases = purchases.filter((p) => {
    const supplier = p.supplier?.name?.toLowerCase() || "";
    const notes = p.notes?.toLowerCase() || "";
    const fabricName = p.fabric_name?.toLowerCase() || "";
    const matchesSearch =
      supplier.includes(searchTerm.toLowerCase()) ||
      notes.includes(searchTerm.toLowerCase()) ||
      fabricName.includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesFrom = !dateFrom || p.purchase_date >= dateFrom;
    const matchesTo = !dateTo || p.purchase_date <= dateTo;
    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });

  // Group purchases by purchase_group_id
  const groupedPurchases = filteredPurchases.reduce((acc, purchase) => {
    const key = purchase.purchase_group_id || purchase.id;
    if (!acc[key]) {
      acc[key] = {
        id: key,
        supplier_id: purchase.supplier_id,
        supplier: purchase.supplier,
        purchase_date: purchase.purchase_date,
        payment_type: purchase.payment_type || "credit",
        invoice_url: purchase.invoice_url,
        items: [],
        total_amount: 0,
        total_meters: 0,
        paid_amount: 0,
        remaining_amount: 0,
        firstPurchaseId: purchase.id,
      };
    }
    acc[key].items.push(purchase);
    acc[key].total_amount += purchase.total_amount || 0;
    acc[key].total_meters += parseFloat(purchase.meters) || 0;
    acc[key].paid_amount += purchase.paid_amount || 0;
    acc[key].remaining_amount += purchase.remaining_amount || 0;
    return acc;
  }, {});

  const groupedArray = Object.values(groupedPurchases).sort(
    (a, b) => new Date(b.purchase_date) - new Date(a.purchase_date),
  );

  const totalPages = Math.ceil(groupedArray.length / PAGE_SIZE);
  const paginated = groupedArray.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusBadge = (status) => {
    const styles = {
      pending: "badge-pending",
      partial: "badge-warning",
      paid: "badge-success",
    };
    const labels = { pending: "Pending", partial: "Partial", paid: "Paid" };
    return <span className={`badge ${styles[status]}`}>{labels[status]}</span>;
  };

  const paymentBadge = (type) => {
    const styles = {
      cash: "bg-accent-100 text-accent-800",
      credit: "bg-warning-100 text-warning-800",
      partial: "bg-blue-100 text-blue-800",
    };
    const labels = { cash: "Cash", credit: "Credit", partial: "Partial" };
    return <span className={`badge ${styles[type] || styles.credit}`}>{labels[type] || "Credit"}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <p className="text-gray-500 mt-1">
            Track purchases and payments to suppliers
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              exportCSV(
                groupedArray.map((g) => ({
                  date: g.purchase_date,
                  supplier: g.supplier?.name || "Unknown",
                  items: g.items.length,
                  total_meters: g.total_meters.toFixed(2),
                  total: g.total_amount,
                  paid: g.paid_amount,
                  remaining: g.remaining_amount,
                  status: g.items[0]?.status,
                })),
                "purchases.csv",
              )
            }
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Purchase
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by supplier or fabric..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input w-full sm:w-40"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          label="Date"
          resetPage={() => setPage(1)}
        />
      </div>

      <PurchaseForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        editingId={editingId}
        onSaved={() => fetchPurchases()}
        fabrics={fabrics}
        suppliers={suppliers}
      />

      {/* Payment Form Modal */}
      {showPaymentForm && selectedPurchase && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Make Payment</h2>
              <button
                onClick={() => setShowPaymentForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">
                Supplier:{" "}
                <span className="font-medium">
                  {selectedPurchase.supplier?.name}
                </span>
              </p>
              <p className="text-sm text-gray-600 mt-1 italic">
                {selectedPurchase.items
                  ?.map((it) => it.fabric_name || it.notes?.match(/Fabric:\s*([^(|\n]+)/)?.[1]?.trim() || "Item")
                  .join(", ")}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Remaining:{" "}
                <span className="font-semibold text-warning-600">
                  ₹{selectedPurchase.remaining_amount.toLocaleString("en-IN")}
                </span>
              </p>
            </div>
            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  max={selectedPurchase.remaining_amount}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  value={paymentData.reference_number}
                  onChange={(e) =>
                    setPaymentData({
                      ...paymentData,
                      reference_number: e.target.value,
                    })
                  }
                  className="input"
                  placeholder="Transaction ID / Check No."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-accent flex-1">
                  Make Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {selectedPurchase && !showPaymentForm && payments.length > 0 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Payment History</h2>
              <button
                onClick={() => {
                  setSelectedPurchase(null);
                  setPayments([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm">
                Supplier:{" "}
                <span className="font-medium">
                  {selectedPurchase.supplier?.name}
                </span>
              </p>
              <p className="text-sm text-gray-600 mt-1 italic">
                {selectedPurchase.items
                  ?.map((it) => it.fabric_name || "Item")
                  .join(", ")}
              </p>
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="text-sm">
                  Total:{" "}
                  <span className="font-semibold">
                    ₹{selectedPurchase.total_amount.toLocaleString("en-IN")}
                  </span>
                </span>
                <span className="text-sm">
                  Remaining:{" "}
                  <span className="font-semibold text-warning-600">
                    ₹{selectedPurchase.remaining_amount.toLocaleString("en-IN")}
                  </span>
                </span>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {payments.map((payment) => (
                <div key={payment.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">
                        ₹{payment.amount.toLocaleString("en-IN")}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(payment.payment_date).toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="badge bg-gray-200 text-gray-700">
                        {payment.payment_method.toUpperCase()}
                      </span>
                      {payment.reference_number && (
                        <p className="text-xs text-gray-500 mt-1">
                          {payment.reference_number}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {selectedPurchase.remaining_amount > 0 && (
              <button
                onClick={() => setShowPaymentForm(true)}
                className="btn btn-accent w-full mt-4"
              >
                <CreditCard className="w-5 h-5 mr-2" />
                Make Payment
              </button>
            )}
          </div>
        </div>
      )}

      {/* Purchase Details Modal */}
      {selectedGroupForDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl p-4 sm:p-6 m-4 sm:my-8 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Purchase Items
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {selectedGroupForDetails.supplier?.name || "Unknown"} •{" "}
                  {new Date(
                    selectedGroupForDetails.purchase_date,
                  ).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedGroupForDetails(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-primary-100 dark:border-primary-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                  Supplier
                </p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {selectedGroupForDetails.supplier?.name || "Unknown"}
                </p>
              </div>

              <div className="bg-gradient-to-r from-accent-50 to-green-50 dark:from-accent-900/20 dark:to-green-900/20 rounded-lg p-4 border border-accent-100 dark:border-accent-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                  Payment
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mb-1">
                  {paymentBadge(selectedGroupForDetails.payment_type)}
                </p>
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>
                    Total:{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ₹
                      {selectedGroupForDetails.total_amount.toLocaleString(
                        "en-IN",
                      )}
                    </span>
                  </span>
                  <span>
                    Remaining:{" "}
                    <span
                      className={`font-semibold ${selectedGroupForDetails.remaining_amount > 0 ? "text-warning-600 dark:text-warning-400" : "text-gray-500 dark:text-gray-400"}`}
                    >
                      ₹
                      {selectedGroupForDetails.remaining_amount.toLocaleString(
                        "en-IN",
                      )}
                    </span>
                  </span>
                </div>
              </div>

              <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                  Details
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  <Calendar className="w-3.5 h-3.5 inline mr-1 mb-0.5 text-gray-400 dark:text-gray-500" />
                  {new Date(
                    selectedGroupForDetails.purchase_date,
                  ).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Items ({selectedGroupForDetails.items.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedGroupForDetails.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow bg-white"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-0.5">
                          Item {idx + 1}
                        </p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {item.fabric_name ||
                            item.notes?.match(/Fabric:\s*([^(|\n]+)/)?.[1]?.trim() ||
                            "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Meters
                        </p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {item.meters || 0}m
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Price/M
                        </p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          ₹{(item.price_per_unit || 0).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Total
                        </p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          ₹{item.total_amount?.toLocaleString("en-IN") || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Remaining
                        </p>
                        <p className={`font-semibold ${item.remaining_amount > 0 ? "text-warning-600" : "text-gray-500"}`}>
                          ₹{item.remaining_amount?.toLocaleString("en-IN") || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/60 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                    Total Meters
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedGroupForDetails.total_meters.toFixed(2)}m
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                    Total Amount
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    ₹
                    {selectedGroupForDetails.total_amount.toLocaleString(
                      "en-IN",
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                    Paid
                  </p>
                  <p className="text-xl font-bold text-accent-600">
                    ₹{selectedGroupForDetails.paid_amount.toLocaleString("en-IN")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                    Remaining
                  </p>
                  <p
                    className={`text-xl font-bold ${selectedGroupForDetails.remaining_amount > 0 ? "text-warning-600 dark:text-warning-400" : "text-gray-500 dark:text-gray-400"}`}
                  >
                    ₹
                    {selectedGroupForDetails.remaining_amount.toLocaleString(
                      "en-IN",
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleViewPayments(selectedGroupForDetails)}
                className="flex-1 btn btn-secondary"
              >
                <History className="w-4 h-4 mr-2" />
                View Payments
              </button>
              <button
                onClick={() => setSelectedGroupForDetails(null)}
                className="flex-1 btn btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase List Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "700px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Meters
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Remaining
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((group) => (
                <tr
                  key={group.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {group.supplier?.name || "Unknown"}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(group.purchase_date).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" },
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-sm">
                    <span className="inline-flex items-center justify-center min-w-6 px-2 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                      {group.items.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-sm">
                    {group.total_meters.toFixed(2)}m
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 text-sm">
                    ₹{group.total_amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span
                      className={
                        group.remaining_amount > 0
                          ? "text-warning-600 font-semibold"
                          : "text-gray-500"
                      }
                    >
                      ₹{group.remaining_amount.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {paymentBadge(group.payment_type)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {statusBadge(group.items[0]?.status || "pending")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setSelectedGroupForDetails(group)}
                        className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-500 hover:text-blue-600"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleViewPayments(group)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                        title="View payments"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      {group.remaining_amount > 0 && (
                        <button
                          onClick={() => handleAddPayment(group)}
                          className="p-1.5 hover:bg-accent-50 rounded-lg text-gray-500 hover:text-accent-600"
                          title="Make payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            isGroup: true,
                            purchaseIds: group.items.map((item) => item.id),
                            itemCount: group.items.length,
                          })
                        }
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                        title="Delete purchase"
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-gray-500">
            {groupedArray.length} purchases — page {page} of {totalPages}
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

      {confirmDelete && (
        <ConfirmModal
          message={
            confirmDelete.isGroup
              ? `This will permanently delete all ${confirmDelete.itemCount} items in this purchase group and all their payments.`
              : "This will permanently delete the purchase and all its payments."
          }
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {groupedArray.length === 0 && (
        <div className="text-center py-16">
          <ShoppingBag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No purchases found</p>
          <p className="text-gray-300 text-sm mt-1">
            Try adjusting your filters
          </p>
        </div>
      )}
    </div>
  );
}
