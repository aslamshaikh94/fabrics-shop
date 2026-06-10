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
  Pencil,
  Paperclip,
  FileText,
  Download,
  ShoppingBag,
} from "lucide-react";
import DateRangeFilter from "./DateRangeFilter";
import { exportCSV } from "../utils/export";
import {
  validatePurchase,
  validatePayment,
  hasErrors,
} from "../utils/validators";
import { validateInvoiceFile } from "../utils/upload";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import Modal from "./shared/Modal";
import Pagination from "./shared/Pagination";
import ImageViewer from "./shared/ImageViewer";

const PAGE_SIZE = 10;

const INITIAL_FORM = {
  supplier_id: "",
  total_amount: "",
  purchase_date: new Date().toISOString().split("T")[0],
  notes: "",
};

const INITIAL_PAYMENT = {
  amount: "",
  payment_date: new Date().toISOString().split("T")[0],
  payment_method: "cash",
  reference_number: "",
  notes: "",
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
];

export default function Purchases() {
  const toast = useToast();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [purchaseFabrics, setPurchaseFabrics] = useState([]);
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [viewInvoiceUrl, setViewInvoiceUrl] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});
  const [formData, setFormData] = useState({ ...INITIAL_FORM });
  const [paymentData, setPaymentData] = useState({ ...INITIAL_PAYMENT });

  useEffect(() => {
    fetchPurchases();
    fetchSuppliers();
    const prefill = localStorage.getItem("prefill_purchase_number");
    if (prefill) {
      setSearchTerm(prefill);
      localStorage.removeItem("prefill_purchase_number");
    }
  }, []);

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

  function resetForm() {
    setFormData({ ...INITIAL_FORM });
    setFormErrors({});
    setInvoiceFile(null);
    setInvoiceError("");
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setInvoiceError("");
    const errors = validatePurchase(formData);
    if (hasErrors(errors)) {
      setFormErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    if (invoiceFile) {
      const validation = validateInvoiceFile(invoiceFile);
      if (!validation.valid) {
        setInvoiceError(validation.errors[0]);
        toast(validation.errors[0], "error");
        return;
      }
    }
    setFormErrors({});
    setUploading(true);
    try {
      let invoice_url = editingId
        ? purchases.find((p) => p.id === editingId)?.invoice_url || ""
        : "";

      if (invoiceFile) {
        const ext = invoiceFile.name.split(".").pop();
        const path = `${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("purchase-invoices")
          .upload(path, invoiceFile, { upsert: true });
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("purchase-invoices").getPublicUrl(path);
        invoice_url = publicUrl;
      }

      if (editingId) {
        const { error } = await supabase
          .from("purchases")
          .update({
            supplier_id: formData.supplier_id,
            total_amount: parseFloat(formData.total_amount),
            purchase_date: formData.purchase_date,
            notes: formData.notes,
            invoice_url,
          })
          .eq("id", editingId);
        if (error) throw error;
        toast("Purchase updated");
      } else {
        const { error } = await supabase.from("purchases").insert([
          {
            supplier_id: formData.supplier_id,
            total_amount: parseFloat(formData.total_amount),
            purchase_date: formData.purchase_date,
            notes: formData.notes,
            status: "pending",
            invoice_url,
          },
        ]);
        if (error) throw error;
        toast("Purchase added successfully");
      }
      setShowForm(false);
      resetForm();
      fetchPurchases();
    } catch (error) {
      console.error("Error saving purchase:", error);
      toast("Failed to save purchase", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedPurchase) return;
    const errors = validatePayment(paymentData);
    if (hasErrors(errors)) {
      setPaymentErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    setPaymentErrors({});
    try {
      const { error } = await supabase.from("purchase_payments").insert([
        {
          purchase_id: selectedPurchase.id,
          amount: parseFloat(paymentData.amount),
          payment_date: paymentData.payment_date,
          payment_method: paymentData.payment_method,
          reference_number: paymentData.reference_number,
          notes: paymentData.notes,
        },
      ]);
      if (error) throw error;
      setShowPaymentModal(false);
      setPaymentData({ ...INITIAL_PAYMENT });
      fetchPurchases();
      fetchPayments(selectedPurchase.id);
      toast("Payment added");
    } catch (error) {
      console.error("Error saving payment:", error);
      toast("Failed to save payment", "error");
    }
  }

  async function fetchPayments(purchaseId) {
    try {
      const { data } = await supabase
        .from("purchase_payments")
        .select("*")
        .eq("purchase_id", purchaseId)
        .order("payment_date", { ascending: false });
      setPayments(data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
    }
  }

  async function fetchPurchaseFabrics(purchaseId) {
    try {
      const { data } = await supabase
        .from("fabrics")
        .select("*")
        .eq("purchase_id", purchaseId);
      setPurchaseFabrics(data || []);
    } catch (error) {
      console.error("Error fetching purchase fabrics:", error);
    }
  }

  function handleEdit(purchase) {
    setFormData({
      supplier_id: purchase.supplier_id,
      total_amount: purchase.total_amount.toString(),
      purchase_date: purchase.purchase_date,
      notes: purchase.notes,
    });
    setInvoiceFile(null);
    setEditingId(purchase.id);
    setShowForm(true);
  }

  function handleViewPayments(purchase) {
    setSelectedPurchase(purchase);
    fetchPayments(purchase.id);
    fetchPurchaseFabrics(purchase.id);
  }

  function handleAddPayment(purchase) {
    setSelectedPurchase(purchase);
    setShowPaymentModal(true);
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
      toast("Purchase deleted");
      fetchPurchases();
    } catch (err) {
      console.error("Error deleting purchase:", err);
      toast("Failed to delete purchase", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  function handleFieldChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: "" }));
  }

  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch =
      p.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.purchase_number || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesFrom = !dateFrom || p.purchase_date >= dateFrom;
    const matchesTo = !dateTo || p.purchase_date <= dateTo;
    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });

  const totalPages = Math.ceil(filteredPurchases.length / PAGE_SIZE);
  const paginated = filteredPurchases.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const statusBadge = (status) => {
    const styles = {
      pending: "badge-pending",
      partial: "badge-warning",
      paid: "badge-success",
    };
    const labels = { pending: "Pending", partial: "Partial", paid: "Paid" };
    return <span className={`badge ${styles[status]}`}>{labels[status]}</span>;
  };

  function FormField({
    field,
    label,
    type = "text",
    required = false,
    placeholder = "",
    children,
  }) {
    const value = formData[field];
    const error = formErrors[field];
    const cls = `input ${error ? "border-error-400" : ""}`;

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && "*"}
        </label>
        {children || (
          <input
            type={type}
            step={type === "number" ? "0.01" : undefined}
            required={required}
            value={value}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            className={cls}
            placeholder={placeholder}
            onWheel={(e) => e.target.blur()}
          />
        )}
        {error && <p className="text-error-600 text-sm mt-1">{error}</p>}
      </div>
    );
  }

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
                filteredPurchases.map((p) => ({
                  date: p.purchase_date,
                  supplier: p.supplier?.name,
                  total: p.total_amount,
                  paid: p.paid_amount,
                  remaining: p.remaining_amount,
                  status: p.status,
                  notes: p.notes,
                })),
                `purchases-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              resetForm();
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

      {/* Purchase Form Modal */}
      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={editingId ? "Edit Purchase" : "New Purchase"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField field="supplier_id" label="Supplier" required>
            <select
              required
              value={formData.supplier_id}
              onChange={(e) => handleFieldChange("supplier_id", e.target.value)}
              className={`input ${formErrors.supplier_id ? "border-error-400" : ""}`}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            field="total_amount"
            label="Total Amount"
            type="number"
            required
            placeholder="₹0.00"
          />
          <FormField field="purchase_date" label="Purchase Date" type="date" />
          <FormField field="notes" label="Notes">
            <textarea
              value={formData.notes}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              className="input"
              rows={2}
              placeholder="Invoice no., remarks..."
            />
          </FormField>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice / Bill
            </label>
            <label
              className={`flex items-center gap-2 cursor-pointer border border-dashed rounded-lg p-3 hover:border-primary-400 hover:bg-primary-50 transition-colors ${invoiceError ? "border-error-400 bg-error-50" : "border-gray-300"}`}
            >
              <Paperclip className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500 flex-1 truncate">
                {invoiceFile
                  ? invoiceFile.name
                  : editingId &&
                      purchases.find((p) => p.id === editingId)?.invoice_url
                    ? "Replace existing invoice"
                    : "Attach invoice (PDF, image)"}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  setInvoiceFile(e.target.files[0] || null);
                  if (e.target.files[0]) setInvoiceError("");
                }}
              />
            </label>
            {invoiceError && (
              <p className="text-error-600 text-sm mt-1">{invoiceError}</p>
            )}
            {editingId &&
              purchases.find((p) => p.id === editingId)?.invoice_url &&
              !invoiceFile && (
                <a
                  href={purchases.find((p) => p.id === editingId).invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary-600 hover:underline mt-1 flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" /> View current invoice
                </a>
              )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="btn btn-primary flex-1"
            >
              {uploading
                ? "Saving..."
                : editingId
                  ? "Update Purchase"
                  : "Add Purchase"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal
        open={showPaymentModal && !!selectedPurchase}
        onClose={() => setShowPaymentModal(false)}
        title="Add Payment"
      >
        {selectedPurchase && (
          <>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">
                Supplier:{" "}
                <span className="font-medium">
                  {selectedPurchase.supplier?.name}
                </span>
              </p>
              <p className="text-sm text-gray-600">
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
                  onChange={(e) => {
                    setPaymentData({ ...paymentData, amount: e.target.value });
                    if (paymentErrors.amount)
                      setPaymentErrors({ ...paymentErrors, amount: "" });
                  }}
                  className={`input ${paymentErrors.amount ? "border-error-400" : ""}`}
                  placeholder="0.00"
                  onWheel={(e) => e.target.blur()}
                />
                {paymentErrors.amount && (
                  <p className="text-error-600 text-sm mt-1">
                    {paymentErrors.amount}
                  </p>
                )}
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
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={paymentData.notes}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, notes: e.target.value })
                  }
                  className="input"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-accent flex-1">
                  Add Payment
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* Purchase Details Modal */}
      <Modal
        open={!!selectedPurchase && !showPaymentModal}
        onClose={() => {
          setSelectedPurchase(null);
          setPurchaseFabrics([]);
          setPayments([]);
        }}
        title="Purchase Details"
        maxWidth="max-w-2xl"
      >
        {selectedPurchase && (
          <>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm">
                Supplier:{" "}
                <span className="font-medium">
                  {selectedPurchase.supplier?.name}
                </span>
              </p>
              {selectedPurchase.notes && (
                <p className="text-sm text-gray-600 mt-1">
                  {selectedPurchase.notes}
                </p>
              )}
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

            {purchaseFabrics.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Purchased Fabrics ({purchaseFabrics.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {purchaseFabrics.map((fabric) => (
                    <div
                      key={fabric.id}
                      className="border border-gray-200 rounded-lg p-3 flex items-center justify-between bg-white"
                    >
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {fabric.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {fabric.total_meters}m @ ₹
                          {fabric.purchase_price_per_meter}/m
                          {fabric.quantity ? ` • ${fabric.quantity}` : ""}
                        </p>
                      </div>
                      <p className="font-semibold text-gray-900 text-sm">
                        ₹
                        {(
                          fabric.total_meters * fabric.purchase_price_per_meter
                        ).toLocaleString("en-IN")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {payments.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Payments ({payments.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
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
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
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
              </div>
            )}

            {payments.length === 0 && purchaseFabrics.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-400">
                No fabrics or payments recorded for this purchase.
              </div>
            )}

            {selectedPurchase.remaining_amount > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="btn btn-accent w-full mt-4"
              >
                <CreditCard className="w-5 h-5 mr-2" />
                Add Payment
              </button>
            )}
          </>
        )}
      </Modal>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "600px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Purchase #
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paid
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Remaining
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
              {paginated.map((purchase) => (
                <tr
                  key={purchase.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 font-mono text-sm">
                      {purchase.purchase_number || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {purchase.supplier?.name}
                    </p>
                    {purchase.notes && (
                      <p className="text-sm text-gray-500 max-w-xs truncate">
                        {purchase.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(purchase.purchase_date).toLocaleDateString(
                        "en-IN",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        },
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 text-sm">
                    ₹{purchase.total_amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className="font-medium text-gray-900">
                      ₹{purchase.paid_amount.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span
                      className={
                        purchase.remaining_amount > 0
                          ? "text-warning-600 font-semibold"
                          : "text-gray-500"
                      }
                    >
                      ₹{purchase.remaining_amount.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div
                      className="relative inline-flex items-center justify-center rounded-full overflow-hidden text-xs font-medium px-2.5 py-0.5 cursor-pointer"
                      style={{ minWidth: "64px" }}
                      title={
                        purchase.total_amount > 0
                          ? `Paid: ${((purchase.paid_amount / purchase.total_amount) * 100).toFixed(1)}%  |  Pending: ${((purchase.remaining_amount / purchase.total_amount) * 100).toFixed(1)}%`
                          : "No amount"
                      }
                    >
                      <span className="absolute inset-0 bg-warning-200" />
                      <span
                        className="absolute inset-y-0 left-0 bg-accent-400"
                        style={{
                          width:
                            purchase.total_amount > 0
                              ? `${(purchase.paid_amount / purchase.total_amount) * 100}%`
                              : "0%",
                        }}
                      />
                      <span
                        className="relative z-10 font-medium"
                        style={{ color: "#111" }}
                      >
                        {purchase.status.charAt(0).toUpperCase() +
                          purchase.status.slice(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewPayments(purchase)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                        title="View payments"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(purchase)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                        title="Edit purchase"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {purchase.invoice_url && (
                        <button
                          onClick={() =>
                            setViewInvoiceUrl(purchase.invoice_url)
                          }
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-500 hover:text-blue-600"
                          title="View invoice"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      {purchase.remaining_amount > 0 && (
                        <button
                          onClick={() => handleAddPayment(purchase)}
                          className="p-1.5 hover:bg-accent-50 rounded-lg text-gray-500 hover:text-accent-600"
                          title="Add payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(purchase.id)}
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

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredPurchases.length}
        label="records"
      />

      {confirmDelete && (
        <ConfirmModal
          message="This will permanently delete the purchase and all its payments."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filteredPurchases.length === 0 && (
        <div className="text-center py-16">
          <ShoppingBag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No purchases found</p>
          <p className="text-gray-300 text-sm mt-1">
            Try adjusting your filters
          </p>
        </div>
      )}

      <ImageViewer
        url={viewInvoiceUrl}
        onClose={() => setViewInvoiceUrl(null)}
        title="Invoice / Bill"
      />
    </div>
  );
}
