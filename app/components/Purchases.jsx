"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Plus,
  CreditCard,
  X,
  Calendar,
  Eye,
  Trash2,
  Pencil,
  Paperclip,
  FileText,
  Download,
  FileUp,
  ShoppingBag,
  ScanLine,
  Package,
  Loader2,
} from "lucide-react";
import DateRangeFilter from "./DateRangeFilter";
import PurchasesImport from "./PurchasesImport";
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
import BarcodeScanner from "./BarcodeScanner";
import FabricRowForm from "./purchases/FabricRowForm";
import EmptyState from "./shared/EmptyState";
import { SearchInput } from "./shared/FormField";
import { extractPdfText, parseFabricEntries } from "../utils/pdfExtractor";

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

function makeEmptyFabricRow() {
  return {
    fabric_id: "",
    fabric_name: "",
    total_meters: "",
    purchase_price_per_meter: "",
    quantity: "",
    barcode: "",
    discount_amount: "",
  };
}

function FormField({
  field,
  label,
  type = "text",
  required = false,
  placeholder = "",
  children,
  formData,
  formErrors,
  onFieldChange,
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
          onChange={(e) => onFieldChange(field, e.target.value)}
          className={cls}
          placeholder={placeholder}
          onWheel={(e) => e.target.blur()}
        />
      )}
      {error && <p className="text-error-600 text-sm mt-1">{error}</p>}
    </div>
  );
}

export default function Purchases() {
  const toast = useToast();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [fabrics, setFabrics] = useState([]);
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
  const [showImport, setShowImport] = useState(false);
  const [viewInvoiceUrl, setViewInvoiceUrl] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});
  const [formData, setFormData] = useState({ ...INITIAL_FORM });
  const [paymentData, setPaymentData] = useState({ ...INITIAL_PAYMENT });

  // State for Add Fabrics to Purchase modal
  const [showAddFabrics, setShowAddFabrics] = useState(false);
  const [fabricRows, setFabricRows] = useState([makeEmptyFabricRow()]);
  const [fabricSearch, setFabricSearch] = useState("");
  const [activeFabricIdx, setActiveFabricIdx] = useState(null);
  const [savingFabrics, setSavingFabrics] = useState(false);
  const [scanningRowIdx, setScanningRowIdx] = useState(null);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [jsonExtracting, setJsonExtracting] = useState(false);
  const [editingFabricIdx, setEditingFabricIdx] = useState(null);
  const [editingDetailFabricId, setEditingDetailFabricId] = useState(null);
  const [editingDetailFabricData, setEditingDetailFabricData] = useState(null);
  const [savingDetailFabric, setSavingDetailFabric] = useState(false);

  useEffect(() => {
    fetchAll();
    const prefill = localStorage.getItem("prefill_purchase_number");
    if (prefill) {
      setSearchTerm(prefill);
      localStorage.removeItem("prefill_purchase_number");
    }
  }, []);

  async function fetchAll() {
    try {
      const [purchasesRes, suppliersRes, fabricsRes] = await Promise.all([
        supabase
          .from("purchases")
          .select("*")
          .order("purchase_date", { ascending: false }),
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("fabrics").select("*").order("name"),
      ]);
      if (purchasesRes.error) throw purchasesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (fabricsRes.error) throw fabricsRes.error;
      const supplierMap = Object.fromEntries(
        (suppliersRes.data || []).map((c) => [c.id, c]),
      );
      const purchasesWithSupplier = (purchasesRes.data || []).map((s) => ({
        ...s,
        remaining_amount: Math.max(
          (s.total_amount || 0) - (s.paid_amount || 0),
          0,
        ),
        supplier: supplierMap[s.supplier_id] || null,
      }));
      setPurchases(purchasesWithSupplier);
      setSuppliers(suppliersRes.data || []);
      setFabrics(fabricsRes.data || []);
    } catch (error) {
      console.error("Error fetching purchases data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPurchases() {
    try {
      const [purchasesRes, suppliersRes] = await Promise.all([
        supabase
          .from("purchases")
          .select("*")
          .order("purchase_date", { ascending: false }),
        supabase.from("suppliers").select("*").order("name"),
      ]);
      if (purchasesRes.error) throw purchasesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      const supplierMap = Object.fromEntries(
        (suppliersRes.data || []).map((c) => [c.id, c]),
      );
      const purchasesWithSupplier = (purchasesRes.data || []).map((s) => ({
        ...s,
        remaining_amount: Math.max(
          (s.total_amount || 0) - (s.paid_amount || 0),
          0,
        ),
        supplier: supplierMap[s.supplier_id] || null,
      }));
      setPurchases(purchasesWithSupplier);
      setSuppliers(suppliersRes.data || []);
    } catch (error) {
      console.error("Error fetching purchases:", error);
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
        const { data: newPurchase, error } = await supabase
          .from("purchases")
          .insert([
            {
              supplier_id: formData.supplier_id,
              total_amount: parseFloat(formData.total_amount),
              purchase_date: formData.purchase_date,
              notes: formData.notes,
              status: "pending",
              invoice_url,
            },
          ])
          .select();
        if (error) throw error;
        if (newPurchase?.[0]) {
          setPurchases((prev) => [newPurchase[0], ...prev]);
        }
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
    Promise.all([
      supabase
        .from("purchase_payments")
        .select("*")
        .eq("purchase_id", purchase.id)
        .order("payment_date", { ascending: false }),
      supabase.from("fabrics").select("*").eq("purchase_id", purchase.id),
    ]).then(([paymentsRes, fabricsRes]) => {
      setPayments(paymentsRes.data || []);
      setPurchaseFabrics(fabricsRes.data || []);
    });
  }

  function handleAddPayment(purchase) {
    setSelectedPurchase(purchase);
    setShowPaymentModal(true);
  }

  function handleOpenAddFabrics(purchase) {
    setSelectedPurchase(purchase);
    setFabricRows([makeEmptyFabricRow()]);
    setFabricSearch("");
    setActiveFabricIdx(null);
    setShowAddFabrics(true);
    // Fetch fabrics list for auto-suggest
    supabase
      .from("fabrics")
      .select("*")
      .order("name")
      .then((res) => {
        setFabrics(res.data || []);
      });
  }

  function handleCloseAddFabrics() {
    setShowAddFabrics(false);
    setFabricRows([makeEmptyFabricRow()]);
    setFabricSearch("");
    setActiveFabricIdx(null);
    setScanningRowIdx(null);
    setEditingFabricIdx(null);
  }

  function updateFabricRow(idx, fields) {
    setFabricRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...fields } : r)),
    );
  }

  function selectFabricFromSuggest(idx, fabric) {
    updateFabricRow(idx, {
      fabric_id: fabric.id,
      fabric_name: fabric.name,
      purchase_price_per_meter: fabric.purchase_price_per_meter.toString(),
      barcode: fabric.barcode || "",
    });
    setActiveFabricIdx(null);
    setFabricSearch("");
    toast(
      `Selected: ${fabric.name} (${fabric.available_meters}m available in stock)`,
    );
  }

  function addFabricRow() {
    const lastRow = fabricRows[fabricRows.length - 1];
    if (!lastRow.fabric_name || !lastRow.total_meters) {
      toast("Please fill in fabric name and meters first", "error");
      return;
    }
    setFabricRows((prev) => [...prev, makeEmptyFabricRow()]);
  }

  function removeFabricRow(idx) {
    if (fabricRows.length <= 1) {
      setFabricRows([makeEmptyFabricRow()]);
      return;
    }
    setFabricRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleJsonUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      toast("Please upload a .json file", "error");
      return;
    }
    setJsonExtracting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const items = Array.isArray(data)
        ? data
        : data.items || data.fabrics || data.rows || [];

      if (items.length === 0) {
        toast("No fabric items found in JSON data", "error");
        return;
      }

      const newRows = items.map((item) => ({
        fabric_id: "",
        fabric_name:
          item.fabric_name || item.fabricName || item.name || item.fabric || "",
        total_meters: String(
          item.total_meters || item.meters || item.mtrs || "",
        ),
        purchase_price_per_meter: String(
          item.purchase_price_per_meter ||
            item.price ||
            item.buy_price ||
            item.rate ||
            "",
        ),
        quantity: String(item.quantity || item.qty || "1"),
        barcode: item.barcode || item.barCode || "",
        discount_amount: String(
          item.discount_amount || item.discAmt || item.discount || "",
        ),
      }));

      // Filter out rows without required fields
      const validRows = newRows.filter(
        (r) => r.fabric_name && r.total_meters && r.purchase_price_per_meter,
      );
      if (validRows.length === 0) {
        toast(
          "JSON data missing required fields: fabric_name, total_meters, purchase_price_per_meter",
          "error",
        );
        return;
      }

      validRows.push(makeEmptyFabricRow());
      setFabricRows(validRows);
      toast(
        `Loaded ${validRows.length - 1} fabric item${validRows.length - 1 > 1 ? "s" : ""} from JSON.`,
      );
    } catch (err) {
      console.error("JSON parse error:", err);
      toast("Failed to parse JSON file. Please check the format.", "error");
    } finally {
      setJsonExtracting(false);
      e.target.value = "";
    }
  }

  async function handlePdfUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast("Please upload a PDF file", "error");
      return;
    }
    setPdfExtracting(true);
    try {
      console.log("PDF upload: starting extraction for", file.name, file.size);
      const text = await extractPdfText(file);
      console.log("PDF extracted text length:", text.length);
      console.log("PDF first 1000 chars:", text.slice(0, 1000));
      console.log(
        "PDF lines (first 40):",
        text
          .split("\n")
          .slice(0, 40)
          .map((l, i) => `${i}: ${l}`)
          .join("\n"),
      );
      const entries = parseFabricEntries(text);
      console.log("PDF parsed entries:", entries);
      if (entries.length === 0) {
        toast(
          `Could not extract fabric data from this PDF. Found ${text.length} chars of text but no fabric rows matched.`,
          "error",
        );
        return;
      }
      // Replace current rows with extracted entries + one empty row
      const newRows = entries.map((entry) => ({
        fabric_id: "",
        fabric_name: entry.fabric_name,
        total_meters: entry.total_meters,
        purchase_price_per_meter: entry.purchase_price_per_meter,
        quantity: entry.quantity || "1",
        barcode: "",
      }));
      newRows.push(makeEmptyFabricRow());
      setFabricRows(newRows);
      toast(
        `Extracted ${entries.length} fabric item${entries.length > 1 ? "s" : ""} from PDF. Please review and adjust.`,
      );
    } catch (err) {
      console.error("PDF extraction error:", err);
      toast("Failed to extract data from PDF. Please enter manually.", "error");
    } finally {
      setPdfExtracting(false);
      e.target.value = "";
    }
  }

  async function handleAddFabricsSubmit(e) {
    e.preventDefault();

    // Validate rows
    const validRows = fabricRows.filter((r) => r.fabric_name && r.total_meters);
    if (validRows.length === 0) {
      toast("Please add at least one fabric item", "error");
      return;
    }

    setSavingFabrics(true);
    try {
      const purchaseId = selectedPurchase.id;
      for (const row of validRows) {
        const meters = parseFloat(row.total_meters) || 0;
        const buyPrice = parseFloat(row.purchase_price_per_meter) || 0;

        if (row.fabric_id) {
          // Existing fabric — restock: increase total_meters and available_meters
          const { data: existingFabric } = await supabase
            .from("fabrics")
            .select("total_meters, available_meters")
            .eq("id", row.fabric_id)
            .single();

          if (existingFabric) {
            const { error: updateErr } = await supabase
              .from("fabrics")
              .update({
                total_meters: (existingFabric.total_meters || 0) + meters,
                available_meters:
                  (existingFabric.available_meters || 0) + meters,
                purchase_price_per_meter:
                  buyPrice > 0
                    ? buyPrice
                    : existingFabric.purchase_price_per_meter,
                quantity: row.quantity || undefined,
                barcode: row.barcode || undefined,
                purchase_id: purchaseId,
              })
              .eq("id", row.fabric_id);
            if (updateErr) throw updateErr;
          }
        } else {
          // New fabric — create record
          const { error } = await supabase.from("fabrics").insert([
            {
              name: row.fabric_name,
              total_meters: meters,
              available_meters: meters,
              purchase_price_per_meter: buyPrice,
              quantity: row.quantity || "",
              barcode: row.barcode || "",
              purchase_id: purchaseId,
              supplier_id: selectedPurchase.supplier_id,
              created_at: selectedPurchase.purchase_date + "T00:00:00",
            },
          ]);
          if (error) throw error;
        }
      }

      const hasRestock = validRows.some((r) => r.fabric_id);
      toast(
        `${validRows.length} fabric${validRows.length > 1 ? "s" : ""} added to purchase${hasRestock ? " (restocked existing)" : ""}`,
      );

      handleCloseAddFabrics();
      fetchPurchases();
      fetchPurchaseFabrics(purchaseId);
    } catch (err) {
      console.error("Error adding fabrics:", err);
      toast(err?.message || "Failed to add fabrics", "error");
    } finally {
      setSavingFabrics(false);
    }
  }

  function handleEditDetailFabric(fabric) {
    setEditingDetailFabricId(fabric.id);
    setEditingDetailFabricData({
      name: fabric.name,
      total_meters: fabric.total_meters?.toString() || "",
      purchase_price_per_meter:
        fabric.purchase_price_per_meter?.toString() || "",
      quantity: fabric.quantity?.toString() || "",
      barcode: fabric.barcode || "",
    });
  }

  function handleCancelEditDetailFabric() {
    setEditingDetailFabricId(null);
    setEditingDetailFabricData(null);
  }

  async function handleSaveDetailFabric() {
    if (!editingDetailFabricId || !editingDetailFabricData) return;
    setSavingDetailFabric(true);
    try {
      const oldFabric = purchaseFabrics.find(
        (f) => f.id === editingDetailFabricId,
      );
      const oldTotal = oldFabric?.total_meters || 0;
      const newTotal = parseFloat(editingDetailFabricData.total_meters) || 0;
      const diff = newTotal - oldTotal;

      const payload = {
        name: editingDetailFabricData.name,
        total_meters: newTotal,
        purchase_price_per_meter:
          parseFloat(editingDetailFabricData.purchase_price_per_meter) || 0,
        quantity: editingDetailFabricData.quantity || "",
        barcode: editingDetailFabricData.barcode || "",
      };

      // If total_meters changed, update available_meters accordingly
      if (diff !== 0) {
        payload.available_meters = Math.max(
          0,
          (oldFabric?.available_meters || 0) + diff,
        );
      }

      const { error } = await supabase
        .from("fabrics")
        .update(payload)
        .eq("id", editingDetailFabricId);
      if (error) throw error;

      toast("Fabric updated");
      setEditingDetailFabricId(null);
      setEditingDetailFabricData(null);
      // Refresh the fabrics list for this purchase
      if (selectedPurchase) {
        fetchPurchaseFabrics(selectedPurchase.id);
      }
    } catch (err) {
      console.error("Error updating fabric:", err);
      toast(err?.message || "Failed to update fabric", "error");
    } finally {
      setSavingDetailFabric(false);
    }
  }

  async function handleDelete(id) {
    try {
      const { error: payErr } = await supabase
        .from("purchase_payments")
        .delete()
        .eq("purchase_id", id);
      if (payErr) throw payErr;
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
            onClick={() => setShowImport(true)}
            className="btn btn-secondary"
            title="Import from Excel/CSV"
          >
            <FileUp className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              exportCSV(
                filteredPurchases.map((p) => ({
                  purchase_id: p.purchase_number || p.id,
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
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by supplier or fabric..."
        />
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
          <FormField
            field="supplier_id"
            label="Supplier"
            required
            formData={formData}
            formErrors={formErrors}
            onFieldChange={handleFieldChange}
          >
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
            formData={formData}
            formErrors={formErrors}
            onFieldChange={handleFieldChange}
          />
          <FormField
            field="purchase_date"
            label="Purchase Date"
            type="date"
            formData={formData}
            formErrors={formErrors}
            onFieldChange={handleFieldChange}
          />
          <FormField
            field="notes"
            label="Notes"
            formData={formData}
            formErrors={formErrors}
            onFieldChange={handleFieldChange}
          >
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
              {uploading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 inline"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
                </>
              ) : editingId ? (
                "Update Purchase"
              ) : (
                "Add Purchase"
              )}
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
                  ₹
                  {selectedPurchase.remaining_amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
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

      {/* Add Fabrics to Purchase Modal */}
      <Modal
        open={showAddFabrics}
        onClose={handleCloseAddFabrics}
        title={`Add Fabrics — ${selectedPurchase?.supplier?.name || "Purchase"}`}
        size="lg"
      >
        <form onSubmit={handleAddFabricsSubmit} className="space-y-4">
          {/* Totals bar */}
          {(() => {
            const validRows = fabricRows.filter(
              (r) => r.fabric_name && r.total_meters,
            );
            if (validRows.length === 0) return null;
            const totalMeters = validRows.reduce(
              (s, r) => s + (parseFloat(r.total_meters) || 0),
              0,
            );
            const totalAmount = validRows.reduce(
              (s, r) =>
                s +
                (parseFloat(r.total_meters) || 0) *
                  (parseFloat(r.purchase_price_per_meter) || 0),
              0,
            );
            const totalDisc = validRows.reduce(
              (s, r) => s + (parseFloat(r.discount_amount) || 0),
              0,
            );
            const netAmount = totalAmount - totalDisc;
            return (
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-primary-700">
                    Items: <strong>{validRows.length}</strong>
                  </span>
                  <span className="text-primary-700">
                    Mtrs: <strong>{totalMeters.toFixed(2)}m</strong>
                  </span>
                  <span className="text-primary-700">
                    Total:{" "}
                    <strong>
                      ₹
                      {totalAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </span>
                  {totalDisc > 0 && (
                    <span className="text-warning-700">
                      Disc:{" "}
                      <strong>
                        -₹
                        {totalDisc.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </span>
                  )}
                  <span className="text-primary-700">
                    Net:{" "}
                    <strong>
                      ₹
                      {netAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </span>
                  <span className="text-primary-700">
                    GST (5%):{" "}
                    <strong>
                      ₹
                      {(
                        Math.round(netAmount * 0.05 * 100) / 100
                      ).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </span>
                  <span className="text-accent-700 font-semibold">
                    Total with GST:{" "}
                    <strong>
                      ₹
                      {(
                        Math.round(netAmount * 1.05 * 100) / 100
                      ).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Added items summary */}
          {fabricRows.length > 1 && (
            <div className="space-y-2 mb-3 pb-3 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Added Fabrics ({fabricRows.length - 1})
              </p>
              {fabricRows.slice(0, -1).map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-2.5"
                >
                  {editingFabricIdx === idx ? (
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={row.fabric_name}
                        onChange={(e) =>
                          updateFabricRow(idx, { fabric_name: e.target.value })
                        }
                        className="input text-sm py-1.5"
                        placeholder="Fabric Name"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={row.total_meters}
                          onChange={(e) =>
                            updateFabricRow(idx, {
                              total_meters: e.target.value,
                            })
                          }
                          className="input text-sm py-1.5 w-24"
                          placeholder="Meters"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={row.purchase_price_per_meter}
                          onChange={(e) =>
                            updateFabricRow(idx, {
                              purchase_price_per_meter: e.target.value,
                            })
                          }
                          className="input text-sm py-1.5 w-24"
                          placeholder="₹/m"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={row.discount_amount}
                          onChange={(e) =>
                            updateFabricRow(idx, {
                              discount_amount: e.target.value,
                            })
                          }
                          className="input text-sm py-1.5 w-20"
                          placeholder="Disc"
                        />
                        <input
                          type="text"
                          value={row.quantity}
                          onChange={(e) =>
                            updateFabricRow(idx, { quantity: e.target.value })
                          }
                          className="input text-sm py-1.5 w-20"
                          placeholder="Qty"
                        />
                        <input
                          type="text"
                          value={row.barcode}
                          onChange={(e) =>
                            updateFabricRow(idx, { barcode: e.target.value })
                          }
                          className="input text-sm py-1.5 w-28"
                          placeholder="Barcode"
                        />
                      </div>
                      {(() => {
                        const mtrs = parseFloat(row.total_meters) || 0;
                        const rate =
                          parseFloat(row.purchase_price_per_meter) || 0;
                        const disc = parseFloat(row.discount_amount) || 0;
                        const total = mtrs * rate;
                        const net = total - disc;
                        return (
                          <div className="flex gap-3 text-[11px] text-gray-500">
                            <span>
                              Amt:{" "}
                              <strong>
                                ₹
                                {total.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>
                            </span>
                            {disc > 0 && (
                              <span>
                                Disc:{" "}
                                <strong>
                                  -₹
                                  {disc.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </strong>
                              </span>
                            )}
                            <span>
                              Net:{" "}
                              <strong>
                                ₹
                                {net.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>
                            </span>
                          </div>
                        );
                      })()}
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingFabricIdx(null)}
                          className="btn btn-secondary text-xs py-1.5 px-3"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFabricIdx(null)}
                          className="btn btn-primary text-xs py-1.5 px-3"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {row.fabric_name}
                        {row.fabric_id && (
                          <span className="ml-1.5 text-[10px] text-accent-600 bg-accent-100 px-1.5 py-0.5 rounded-full">
                            restock
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {row.total_meters}m @ ₹{row.purchase_price_per_meter}/m
                        {row.discount_amount
                          ? ` • Disc: ₹${parseFloat(row.discount_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : ""}
                        {row.quantity ? ` • ${row.quantity}` : ""}
                        {row.barcode ? ` • ${row.barcode}` : ""}
                      </p>
                      {(() => {
                        const mtrs = parseFloat(row.total_meters) || 0;
                        const rate =
                          parseFloat(row.purchase_price_per_meter) || 0;
                        const disc = parseFloat(row.discount_amount) || 0;
                        const total = mtrs * rate;
                        const net = total - disc;
                        return (
                          <div className="flex gap-3 mt-1 text-[11px]">
                            <span className="text-gray-600">
                              Amt:{" "}
                              <strong>
                                ₹
                                {total.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>
                            </span>
                            <span
                              className={
                                disc > 0 ? "text-warning-600" : "text-gray-400"
                              }
                            >
                              Disc:{" "}
                              <strong>
                                {disc > 0 ? "-" : ""}₹
                                {disc.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>
                            </span>
                            <span className="text-gray-700">
                              Net:{" "}
                              <strong>
                                ₹
                                {net.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFabricIdx(
                          editingFabricIdx === idx ? null : idx,
                        );
                      }}
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"
                      title="Edit item"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFabricRow(idx)}
                      className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600"
                      title="Remove item"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <FabricRowForm
            idx={fabricRows.length - 1}
            row={fabricRows[fabricRows.length - 1]}
            fabricSearch={fabricSearch}
            setFabricSearch={setFabricSearch}
            activeFabricIdx={activeFabricIdx}
            setActiveFabricIdx={setActiveFabricIdx}
            fabrics={fabrics}
            updateFabricRow={updateFabricRow}
            selectFabricFromSuggest={selectFabricFromSuggest}
            addFabricRow={addFabricRow}
            setScanningRowIdx={setScanningRowIdx}
            isLastRow={true}
          />

          {/* JSON Upload */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center justify-center gap-2 cursor-pointer border-2 border-dashed border-gray-300 rounded-xl p-3 hover:border-primary-400 hover:bg-primary-50 transition-colors">
              {jsonExtracting ? (
                <>
                  <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                  <span className="text-sm text-gray-500">
                    Loading JSON data...
                  </span>
                </>
              ) : (
                <>
                  <FileUp className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    Load from JSON file
                  </span>
                </>
              )}
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleJsonUpload}
                disabled={jsonExtracting}
              />
            </label>
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              JSON format: [{"{"}fabricName, meters, price, quantity{"}"}]
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCloseAddFabrics}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingFabrics}
              className="btn btn-primary flex-1"
            >
              {savingFabrics ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 inline"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
                </>
              ) : (
                "Add Fabrics"
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Barcode Scanner for Add Fabrics modal */}
      {scanningRowIdx !== null && (
        <BarcodeScanner
          onScan={(code) => {
            // Check if a fabric with this barcode already exists
            const existingFabric = fabrics.find((f) => f.barcode === code);
            if (existingFabric) {
              // Auto-fill name, barcode, and show available inventory
              updateFabricRow(scanningRowIdx, {
                fabric_id: existingFabric.id,
                fabric_name: existingFabric.name,
                barcode: code,
                purchase_price_per_meter:
                  existingFabric.purchase_price_per_meter.toString(),
              });
              toast(
                `Found: ${existingFabric.name} (${existingFabric.available_meters}m available)`,
              );
            } else {
              // Just fill the barcode
              updateFabricRow(scanningRowIdx, { barcode: code });
              toast("Barcode scanned — new fabric will be created");
            }
            setScanningRowIdx(null);
          }}
          onClose={() => setScanningRowIdx(null)}
        />
      )}

      {/* Purchase Details Modal */}
      <Modal
        open={!!selectedPurchase && !showPaymentModal && !showAddFabrics}
        onClose={() => {
          setSelectedPurchase(null);
          setPurchaseFabrics([]);
          setPayments([]);
        }}
        title="Purchase Details"
        size="lg"
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
                    ₹
                    {selectedPurchase.total_amount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
                <span className="text-sm">
                  Remaining:{" "}
                  <span className="font-semibold text-warning-600">
                    ₹
                    {selectedPurchase.remaining_amount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
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
                      className="border border-gray-200 rounded-lg p-3 bg-white"
                    >
                      {editingDetailFabricId === fabric.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editingDetailFabricData?.name || ""}
                            onChange={(e) =>
                              setEditingDetailFabricData((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            className="input text-sm py-1.5"
                            placeholder="Fabric Name"
                          />
                          <div className="flex gap-2 flex-wrap">
                            <input
                              type="number"
                              step="0.01"
                              value={
                                editingDetailFabricData?.total_meters || ""
                              }
                              onChange={(e) =>
                                setEditingDetailFabricData((prev) => ({
                                  ...prev,
                                  total_meters: e.target.value,
                                }))
                              }
                              className="input text-sm py-1.5 w-24"
                              placeholder="Meters"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={
                                editingDetailFabricData?.purchase_price_per_meter ||
                                ""
                              }
                              onChange={(e) =>
                                setEditingDetailFabricData((prev) => ({
                                  ...prev,
                                  purchase_price_per_meter: e.target.value,
                                }))
                              }
                              className="input text-sm py-1.5 w-24"
                              placeholder="₹/m"
                            />
                            <input
                              type="text"
                              value={editingDetailFabricData?.quantity || ""}
                              onChange={(e) =>
                                setEditingDetailFabricData((prev) => ({
                                  ...prev,
                                  quantity: e.target.value,
                                }))
                              }
                              className="input text-sm py-1.5 w-20"
                              placeholder="Qty"
                            />
                            <input
                              type="text"
                              value={editingDetailFabricData?.barcode || ""}
                              onChange={(e) =>
                                setEditingDetailFabricData((prev) => ({
                                  ...prev,
                                  barcode: e.target.value,
                                }))
                              }
                              className="input text-sm py-1.5 w-28"
                              placeholder="Barcode"
                            />
                          </div>
                          {(() => {
                            const mtrs =
                              parseFloat(
                                editingDetailFabricData?.total_meters,
                              ) || 0;
                            const rate =
                              parseFloat(
                                editingDetailFabricData?.purchase_price_per_meter,
                              ) || 0;
                            const total = mtrs * rate;
                            return (
                              <div className="flex gap-3 text-[11px] text-gray-500">
                                <span>
                                  Amt:{" "}
                                  <strong>
                                    ₹
                                    {total.toLocaleString("en-IN", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </strong>
                                </span>
                              </div>
                            );
                          })()}
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={handleCancelEditDetailFabric}
                              className="btn btn-secondary text-xs py-1.5 px-3"
                              disabled={savingDetailFabric}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveDetailFabric}
                              className="btn btn-primary text-xs py-1.5 px-3"
                              disabled={savingDetailFabric}
                            >
                              {savingDetailFabric ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {fabric.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {fabric.total_meters}m @ ₹
                              {fabric.purchase_price_per_meter}/m
                              {fabric.quantity ? ` • ${fabric.quantity}` : ""}
                              {fabric.barcode ? ` • ${fabric.barcode}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 text-sm">
                              ₹
                              {(
                                fabric.total_meters *
                                fabric.purchase_price_per_meter
                              ).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleEditDetailFabric(fabric)}
                              className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"
                              title="Edit fabric"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Fabrics button */}
            <button
              onClick={() => handleOpenAddFabrics(selectedPurchase)}
              className="btn btn-primary w-full mb-4"
            >
              <Package className="w-5 h-5 mr-2" />
              Add Fabrics to Purchase
            </button>

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
                            ₹
                            {payment.amount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(payment.payment_date).toLocaleDateString(
                              "en-GB",
                              {
                                day: "numeric",
                                month: "short",
                                year: "2-digit",
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
                <br />
                Click "Add Fabrics to Purchase" above to add fabric items.
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
                        "en-GB",
                        {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        },
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 text-sm">
                    ₹
                    {purchase.total_amount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className="font-medium text-gray-900">
                      ₹
                      {purchase.paid_amount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
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
                      ₹
                      {purchase.remaining_amount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
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
                        title="View details"
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

      <PurchasesImport
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => {
          fetchAll();
          setShowImport(false);
        }}
        suppliers={suppliers}
      />

      <ImageViewer
        url={viewInvoiceUrl}
        onClose={() => setViewInvoiceUrl(null)}
        title="Invoice / Bill"
      />
    </div>
  );
}
