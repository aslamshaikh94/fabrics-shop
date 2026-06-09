"use client";
import { useState, useEffect, useRef } from "react";
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
  Paperclip,
  ScanLine,
  Pencil,
  CircleCheck as CheckCircle,
  Download,
  ChevronDown,
  History,
  TrendingUp,
  Users,
  UserPlus,
  Save,
  XCircle,
} from "lucide-react";
import { exportCSV } from "../utils/export";
import {
  validateSale,
  validatePayment,
  hasErrors,
  validateCurrentItem,
} from "../utils/validators";
import BarcodeScanner from "./BarcodeScanner";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";
import FileUpload from "./FileUpload";
import DateRangeFilter from "./DateRangeFilter";
import { formatCurrency, formatDate } from "../utils/formatters";
import SaleForm from "./SaleForm";

const PAGE_SIZE = 10;

// Generate a UUID for grouping sales items from the same transaction
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function Sales() {
  const toast = useToast();
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [scanningItemIdx, setScanningItemIdx] = useState(null);
  const [activeFabricDropdown, setActiveFabricDropdown] = useState(null);
  const [fabricSearch, setFabricSearch] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedGroupForDetails, setSelectedGroupForDetails] = useState(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    fabric_id: "",
    fabric_name: "",
    meters: "",
    price_per_meter: "",
    cost_price_per_meter: "",
  });
  const [activeNewItemFabricDropdown, setActiveNewItemFabricDropdown] =
    useState(false);
  const [newItemFabricSearch, setNewItemFabricSearch] = useState("");
  const [itemJustAdded, setItemJustAdded] = useState(false);
  const [customerTab, setCustomerTab] = useState("existing");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editItemForm, setEditItemForm] = useState({
    fabric_id: "",
    fabric_name: "",
    meters: "",
    price_per_meter: "",
    cost_price_per_meter: "",
  });
  const [editItemFabricSearch, setEditItemFabricSearch] = useState("");
  const [activeEditFabricDropdown, setActiveEditFabricDropdown] =
    useState(false);
  const [savingEditItem, setSavingEditItem] = useState(false);
  const [editGroupFields, setEditGroupFields] = useState({
    customer_id: "",
    customer_name: "",
    sale_date: "",
    payment_type: "cash",
    initial_payment: "",
    invoice_file: null,
  });
  const [savingGroupFields, setSavingGroupFields] = useState(false);
  const [showEditSaleInfo, setShowEditSaleInfo] = useState(false);
  function makeEmptyForm() {
    return {
      customer_id: "",
      customer_name: "",
      items: [
        {
          fabric_id: "",
          fabric_name: "",
          meters: "",
          price_per_meter: "",
          cost_price_per_meter: "",
        },
      ],
      sale_date: new Date().toISOString().split("T")[0],
      payment_type: "cash",
      initial_payment: "",
      invoice_file: null,
    };
  }
  const [formData, setFormData] = useState(makeEmptyForm);
  const [paymentData, setPaymentData] = useState({
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "cash",
    reference_number: "",
    notes: "",
  });

  const [customerDues, setCustomerDues] = useState({});

  const customerDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target)
      ) {
        setShowCustomerDropdown(false);
      }

      if (!event.target.closest(".fabric-dropdown-container")) {
        setActiveFabricDropdown(null);
      }

      if (!event.target.closest(".new-item-fabric-dropdown-container")) {
        setActiveNewItemFabricDropdown(false);
      }

      if (!event.target.closest(".edit-item-fabric-dropdown-container")) {
        setActiveEditFabricDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchSales();
    fetchCustomers();
    fetchFabrics();
    fetchCustomerDues();
  }, []);

  async function fetchCustomerDues() {
    try {
      const { data } = await supabase
        .from("sales")
        .select("customer_id, remaining_amount")
        .gt("remaining_amount", 0);
      const map = {};
      (data || []).forEach((s) => {
        if (s.customer_id)
          map[s.customer_id] = (map[s.customer_id] || 0) + s.remaining_amount;
      });
      setCustomerDues(map);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchSales() {
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("*, customer:customers(*)")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCustomers() {
    try {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      setCustomers(data || []);
    } catch (error) {
      console.error("Error fetching customers:", error);
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

  async function handleBarcodeScan(code) {
    setShowScanner(false);
    const { data } = await supabase
      .from("fabrics")
      .select("*")
      .eq("barcode", code)
      .single();
    if (data) {
      if (scanningItemIdx === "new") {
        setNewItemForm((prev) => ({
          ...prev,
          fabric_id: data.id,
          fabric_name: data.name,
          cost_price_per_meter: data.purchase_price_per_meter.toString(),
          price_per_meter: (data.selling_price_per_meter || "").toString(),
        }));
      } else if (scanningItemIdx === "edit") {
        setEditItemForm((prev) => ({
          ...prev,
          fabric_id: data.id,
          fabric_name: data.name,
          cost_price_per_meter: data.purchase_price_per_meter.toString(),
          price_per_meter: (data.selling_price_per_meter || "").toString(),
        }));
      } else {
        updateItem(scanningItemIdx, {
          fabric_id: data.id,
          fabric_name: data.name,
          cost_price_per_meter: data.purchase_price_per_meter.toString(),
          price_per_meter: (data.selling_price_per_meter || "").toString(),
        });
      }
    } else {
      if (scanningItemIdx === "new") {
        setNewItemForm((prev) => ({
          ...prev,
          fabric_name: code,
          fabric_id: "",
        }));
      } else if (scanningItemIdx === "edit") {
        setEditItemForm((prev) => ({
          ...prev,
          fabric_name: code,
          fabric_id: "",
        }));
      } else {
        updateItem(scanningItemIdx, { fabric_name: code, fabric_id: "" });
      }
    }
    setScanningItemIdx(null);
  }

  function updateItem(idx, fields) {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === idx ? { ...item, ...fields } : item,
      ),
    }));
  }

  function calculateTotal() {
    return formData.items
      .reduce(
        (sum, item) =>
          sum +
          (parseFloat(item.meters) || 0) *
            (parseFloat(item.price_per_meter) || 0),
        0,
      )
      .toFixed(2);
  }

  function calculateMargin() {
    return formData.items
      .reduce(
        (sum, item) =>
          sum +
          (parseFloat(item.meters) || 0) *
            ((parseFloat(item.price_per_meter) || 0) -
              (parseFloat(item.cost_price_per_meter) || 0)),
        0,
      )
      .toFixed(2);
  }

  function calculateRemaining() {
    return (
      parseFloat(calculateTotal()) - (parseFloat(formData.initial_payment) || 0)
    ).toFixed(2);
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedSale) return;
    const errors = validatePayment(paymentData);
    if (hasErrors(errors)) {
      setPaymentErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    setPaymentErrors({});

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

      setShowPaymentForm(false);
      setPaymentData({
        amount: "",
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "cash",
        reference_number: "",
        notes: "",
      });
      fetchSales();
      fetchPayments(selectedSale.items.map((i) => i.id));
      toast("Payment recorded");
    } catch (error) {
      console.error("Error saving payment:", error);
      toast("Failed to save payment", "error");
    }
  }

  async function handleEditItemSave(itemId) {
    if (
      !editItemForm.meters ||
      !editItemForm.price_per_meter ||
      !editItemForm.fabric_name
    ) {
      toast("Please fill in all required fields", "error");
      return;
    }
    setSavingEditItem(true);
    try {
      const salePayload = {
        fabric_id: editItemForm.fabric_id || null,
        meters: parseFloat(editItemForm.meters) || 0,
        price_per_meter: parseFloat(editItemForm.price_per_meter) || 0,
        cost_price_per_meter:
          parseFloat(editItemForm.cost_price_per_meter) || 0,
        notes: `Fabric: ${editItemForm.fabric_name}`,
      };

      const { error } = await supabase
        .from("sales")
        .update(salePayload)
        .eq("id", itemId);
      if (error) throw error;

      setEditingItemId(null);
      setActiveEditFabricDropdown(false);
      setEditItemFabricSearch("");
      fetchSales();
      toast("Item updated successfully");
    } catch (error) {
      console.error("Error updating item:", error);
      toast("Failed to update item", "error");
    } finally {
      setSavingEditItem(false);
    }
  }

  async function handleEditGroupFieldsSave() {
    if (!selectedGroupForDetails) return;
    setSavingGroupFields(true);
    try {
      const saleIds = selectedGroupForDetails.items.map((i) => i.id);
      const customerId = editGroupFields.customer_id || null;

      let invoice_url = selectedGroupForDetails.items[0]?.invoice_url || "";
      if (editGroupFields.invoice_file) {
        const ext = editGroupFields.invoice_file.name.split(".").pop();
        const path = `sales-invoices/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("sales-invoices")
          .upload(path, editGroupFields.invoice_file);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("sales-invoices").getPublicUrl(path);
        invoice_url = publicUrl;
      }

      for (const saleId of saleIds) {
        const { error } = await supabase
          .from("sales")
          .update({
            customer_id: customerId,
            sale_date: editGroupFields.sale_date,
            payment_type: editGroupFields.payment_type,
            invoice_url,
          })
          .eq("id", saleId);
        if (error) throw error;
      }

      const paymentTypeChanged =
        editGroupFields.payment_type !== selectedGroupForDetails.payment_type;

      if (
        paymentTypeChanged ||
        (editGroupFields.payment_type === "partial" &&
          parseFloat(editGroupFields.initial_payment) > 0)
      ) {
        for (const item of selectedGroupForDetails.items) {
          const { error: delError } = await supabase
            .from("sale_payments")
            .delete()
            .eq("sale_id", item.id);
          if (delError)
            throw new Error(`Failed to delete payment: ${delError.message}`);
        }

        if (editGroupFields.payment_type === "cash") {
          for (const item of selectedGroupForDetails.items) {
            const totalAmount = item.meters * item.price_per_meter;
            const { error: insError } = await supabase
              .from("sale_payments")
              .insert([
                {
                  sale_id: item.id,
                  amount: totalAmount,
                  payment_date: editGroupFields.sale_date,
                  payment_method: "cash",
                },
              ]);
            if (insError)
              throw new Error(
                `Failed to create cash payment: ${insError.message}`,
              );
          }
        } else if (editGroupFields.payment_type === "partial") {
          let remaining = parseFloat(editGroupFields.initial_payment) || 0;
          for (const item of selectedGroupForDetails.items) {
            if (remaining <= 0) break;
            const itemTotal = item.meters * item.price_per_meter;
            const pay = Math.min(remaining, itemTotal);
            if (pay > 0) {
              const { error: insError } = await supabase
                .from("sale_payments")
                .insert([
                  {
                    sale_id: item.id,
                    amount: pay,
                    payment_date: editGroupFields.sale_date,
                    payment_method: "cash",
                  },
                ]);
              if (insError)
                throw new Error(
                  `Failed to create partial payment: ${insError.message}`,
                );
              remaining -= pay;
            }
          }
        }
        // credit: no payments created (all deleted above)
      }

      await fetchSales();
      setShowEditSaleInfo(false);
      toast("Sale info updated successfully");
    } catch (error) {
      console.error("Error updating sale info:", error);
      setShowEditSaleInfo(false);
      toast("Failed to update sale info", "error");
    } finally {
      setSavingGroupFields(false);
    }
  }

  async function handleDelete(deleteInfo) {
    try {
      if (deleteInfo.isGroup) {
        const { error: deletePaymentsError } = await supabase
          .from("sale_payments")
          .delete()
          .in("sale_id", deleteInfo.saleIds);
        if (deletePaymentsError) throw deletePaymentsError;

        const { error } = await supabase
          .from("sales")
          .delete()
          .in("id", deleteInfo.saleIds);
        if (error) throw error;
        toast("Sales group deleted");
      } else {
        const { error } = await supabase
          .from("sales")
          .delete()
          .eq("id", deleteInfo);
        if (error) throw error;
        toast("Sale deleted");
      }
      fetchSales();
    } catch (err) {
      console.error("Error deleting sale:", err);
      toast("Failed to delete sale", "error");
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleAddItemToSale(e) {
    e.preventDefault();
    if (
      !selectedGroupForDetails ||
      !newItemForm.meters ||
      !newItemForm.price_per_meter ||
      !newItemForm.fabric_name
    ) {
      toast("Please fill in all required fields", "error");
      return;
    }

    try {
      const salePayload = {
        customer_id: selectedGroupForDetails.customer_id || null,
        fabric_id: newItemForm.fabric_id || null,
        meters: parseFloat(newItemForm.meters) || 0,
        price_per_meter: parseFloat(newItemForm.price_per_meter) || 0,
        cost_price_per_meter: parseFloat(newItemForm.cost_price_per_meter) || 0,
        sale_date: selectedGroupForDetails.sale_date,
        payment_type: selectedGroupForDetails.payment_type,
        sale_group_id: selectedGroupForDetails.id,
        notes: `Fabric: ${newItemForm.fabric_name}`,
      };

      const { error } = await supabase.from("sales").insert([salePayload]);
      if (error) throw error;

      setShowAddItemForm(false);
      setNewItemForm({
        fabric_id: "",
        fabric_name: "",
        meters: "",
        price_per_meter: "",
        cost_price_per_meter: "",
      });
      setActiveNewItemFabricDropdown(false);
      setNewItemFabricSearch("");
      fetchSales();
      toast("Item added successfully");
    } catch (error) {
      console.error("Error adding item:", error);
      toast("Failed to add item", "error");
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
      console.error("Error fetching payments:", error);
    }
  }

  function handleEdit(sale) {
    setEditingId(sale.firstSaleId || sale.id);
    setShowForm(true);
  }

  function handleViewPayments(group) {
    setSelectedSale(group);
    fetchPayments(group.items.map((i) => i.id));
  }
  function handleAddPayment(group) {
    setSelectedSale(group);
    setShowPaymentForm(true);
  }

  const filteredSales = sales.filter((s) => {
    const customer = s.customer?.name?.toLowerCase() || "";
    const notes = s.notes?.toLowerCase() || "";
    const matchesSearch =
      customer.includes(searchTerm.toLowerCase()) ||
      notes.includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || s.payment_type === filterType;
    const matchesFrom = !dateFrom || s.sale_date >= dateFrom;
    const matchesTo = !dateTo || s.sale_date <= dateTo;
    return matchesSearch && matchesType && matchesFrom && matchesTo;
  });

  const groupedSales = filteredSales.reduce((acc, sale) => {
    const key = sale.sale_group_id || sale.id;
    if (!acc[key]) {
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
        firstSaleId: sale.id,
      };
    }
    acc[key].items.push(sale);
    acc[key].total_amount += sale.total_amount;
    acc[key].margin += sale.margin;
    acc[key].remaining_amount += sale.remaining_amount;
    acc[key].paid_amount += sale.paid_amount;
    return acc;
  }, {});

  const groupedArray = Object.values(groupedSales).sort(
    (a, b) => new Date(b.sale_date) - new Date(a.sale_date),
  );

  const totalPages = Math.ceil(groupedArray.length / PAGE_SIZE);
  const paginated = groupedArray.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const paymentBadge = (type) => {
    const styles = {
      cash: "bg-accent-100 text-accent-800",
      credit: "bg-warning-100 text-warning-800",
      partial: "bg-blue-100 text-blue-800",
    };
    const labels = { cash: "Cash", credit: "Credit", partial: "Partial" };
    return <span className={`badge ${styles[type]}`}>{labels[type]}</span>;
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
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-gray-500 mt-1">
            Track sales and customer payments
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              exportCSV(
                filteredSales.map((s) => ({
                  date: s.sale_date,
                  customer: s.customer?.name || "Walk-in",
                  notes: s.notes,
                  meters: s.meters,
                  price_per_meter: s.price_per_meter,
                  total: s.total_amount,
                  paid: s.paid_amount,
                  remaining: s.remaining_amount,
                  type: s.payment_type,
                })),
                "sales.csv",
              )
            }
            className="btn btn-secondary"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData(makeEmptyForm());
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Sale
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer or fabric..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input w-full sm:w-40"
        >
          <option value="all">All Types</option>
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
          <option value="partial">Partial</option>
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

      <SaleForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
        }}
        editingId={editingId}
        onSaved={() => fetchSales()}
        fabrics={fabrics}
        customers={customers}
        customerDues={customerDues}
      />

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showPaymentForm && selectedSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Receive Payment</h2>
              <button
                onClick={() => setShowPaymentForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-600">
                Customer:{" "}
                <span className="font-medium">
                  {selectedSale.customer?.name || "Walk-in"}
                </span>
              </p>
              <p className="text-sm text-gray-600 mt-1 italic">
                {selectedSale.items
                  ?.map(
                    (it) =>
                      it.notes?.match(/Fabric:\s*([^(|\n]+)/)?.[1]?.trim() ||
                      "Item",
                  )
                  .join(", ")}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Remaining:{" "}
                <span className="font-semibold text-warning-600">
                  ₹{selectedSale.remaining_amount.toLocaleString("en-IN")}
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
                  Receive Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedSale && !showPaymentForm && payments.length > 0 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Payment History</h2>
              <button
                onClick={() => {
                  setSelectedSale(null);
                  setPayments([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm">
                Customer:{" "}
                <span className="font-medium">
                  {selectedSale.customer?.name || "Walk-in"}
                </span>
              </p>
              <p className="text-sm text-gray-600 mt-1 italic">
                {selectedSale.items
                  ?.map(
                    (it) =>
                      it.notes?.match(/Fabric:\s*([^(|\n]+)/)?.[1]?.trim() ||
                      "Item",
                  )
                  .join(", ")}
              </p>
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="text-sm">
                  Total:{" "}
                  <span className="font-semibold">
                    ₹{selectedSale.total_amount.toLocaleString("en-IN")}
                  </span>
                </span>
                <span className="text-sm">
                  Margin:{" "}
                  <span className="font-semibold text-accent-600">
                    ₹{selectedSale.margin.toLocaleString("en-IN")}
                  </span>
                </span>
              </div>
              <p className="text-sm mt-2">
                Remaining:{" "}
                <span className="font-semibold text-warning-600">
                  ₹{selectedSale.remaining_amount.toLocaleString("en-IN")}
                </span>
              </p>
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
            {selectedSale.remaining_amount > 0 && (
              <button
                onClick={() => setShowPaymentForm(true)}
                className="btn btn-accent w-full mt-4"
              >
                <CreditCard className="w-5 h-5 mr-2" />
                Receive Payment
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: "700px" }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
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
                  Paid
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Margin
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Remaining
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
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
                      {group.customer?.name ||
                        group.items[0]?.notes
                          ?.match(/Name:\s*([^)]+)/)?.[1]
                          ?.trim() ||
                        "Walk-in"}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {formatDate(group.sale_date)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-sm">
                    <span className="inline-flex items-center justify-center min-w-6 px-2 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                      {group.items.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-sm">
                    {group.items
                      .reduce(
                        (sum, item) => sum + (parseFloat(item.meters) || 0),
                        0,
                      )
                      .toFixed(2)}
                    m
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 text-sm">
                    ₹{group.total_amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className="font-medium text-gray-900">
                      ₹{group.paid_amount.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className="text-accent-600 font-medium">
                      ₹{group.margin.toLocaleString("en-IN")}
                    </span>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          const g = group;
                          setEditGroupFields({
                            customer_id: g.customer_id || "",
                            customer_name:
                              g.customer?.name ||
                              (g.customer_id ? "" : "Walk-in Customer"),
                            sale_date: g.sale_date,
                            payment_type: g.payment_type,
                            initial_payment: "",
                            invoice_file: null,
                          });
                          setSelectedGroupForDetails(g);
                        }}
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
                          title="Receive payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            isGroup: true,
                            saleIds: group.items.map((item) => item.id),
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-gray-500">
            {groupedArray.length} sales groups — page {page} of {totalPages}
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

      {selectedGroupForDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl p-4 sm:p-6 m-4 sm:my-8 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Sale Items
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {selectedGroupForDetails.customer?.name || "Walk-in"} •{" "}
                  {new Date(
                    selectedGroupForDetails.sale_date,
                  ).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedGroupForDetails(null);
                  setEditingItemId(null);
                  setActiveEditFabricDropdown(false);
                  setEditItemFabricSearch("");
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-primary-100 dark:border-primary-800">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-semibold mb-1">
                  Customer
                </p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {selectedGroupForDetails.customer?.name || "Walk-in Customer"}
                </p>
                {selectedGroupForDetails.customer?.phone && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {selectedGroupForDetails.customer.phone}
                  </p>
                )}
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
                  Details & Documents
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  <Calendar className="w-3.5 h-3.5 inline mr-1 mb-0.5 text-gray-400 dark:text-gray-500" />
                  {new Date(
                    selectedGroupForDetails.sale_date,
                  ).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                {selectedGroupForDetails.items[0]?.invoice_url ? (
                  <a
                    href={selectedGroupForDetails.items[0].invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline mt-1 inline-flex items-center gap-1"
                  >
                    <Paperclip className="w-3 h-3" />
                    View Invoice
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    No invoice
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setShowEditSaleInfo(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Sale Info
              </button>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-4"></div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Items ({selectedGroupForDetails.items.length})
                </h3>
                <button
                  onClick={() => setShowAddItemForm(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedGroupForDetails.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow bg-white"
                  >
                    {editingItemId === item.id ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-gray-500 uppercase font-bold">
                            Editing Item {idx + 1}
                          </p>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItemId(null);
                                setActiveEditFabricDropdown(false);
                                setEditItemFabricSearch("");
                              }}
                              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                              title="Cancel"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditItemSave(item.id)}
                              disabled={savingEditItem}
                              className="p-1.5 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600 transition-colors"
                              title="Save"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="relative edit-item-fabric-dropdown-container">
                          <label className="block text-xs font-bold text-gray-900 dark:text-gray-300 mb-1">
                            Fabric Name
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={
                                  activeEditFabricDropdown
                                    ? editItemFabricSearch
                                    : editItemForm.fabric_name || ""
                                }
                                onChange={(e) => {
                                  setEditItemFabricSearch(e.target.value);
                                  setEditItemForm({
                                    ...editItemForm,
                                    fabric_id: "",
                                    fabric_name: e.target.value,
                                  });
                                  setActiveEditFabricDropdown(true);
                                }}
                                onFocus={() => {
                                  setEditItemFabricSearch(
                                    editItemForm.fabric_name || "",
                                  );
                                  setActiveEditFabricDropdown(true);
                                }}
                                className="input bg-white dark:bg-gray-800 pr-10"
                                placeholder="Search inventory or type name"
                                required
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <ChevronDown
                                  className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${activeEditFabricDropdown ? "rotate-180" : ""}`}
                                />
                              </div>
                              {activeEditFabricDropdown && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
                                  {fabrics
                                    .filter((f) =>
                                      f.name
                                        .toLowerCase()
                                        .includes(
                                          editItemFabricSearch.toLowerCase(),
                                        ),
                                    )
                                    .map((f) => (
                                      <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => {
                                          setEditItemForm({
                                            ...editItemForm,
                                            fabric_id: f.id,
                                            fabric_name: f.name,
                                            cost_price_per_meter:
                                              f.purchase_price_per_meter.toString(),
                                            price_per_meter: (
                                              f.selling_price_per_meter || ""
                                            ).toString(),
                                          });
                                          setActiveEditFabricDropdown(false);
                                        }}
                                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm"
                                      >
                                        <div className="flex justify-between items-center">
                                          <span className="dark:text-white">
                                            {f.name}
                                          </span>
                                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                            {f.available_meters}m
                                          </span>
                                        </div>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setScanningItemIdx("edit");
                                setShowScanner(true);
                              }}
                              className="px-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
                            >
                              <ScanLine className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-gray-900 dark:text-gray-300 mb-1">
                              Meters *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={editItemForm.meters}
                              onChange={(e) =>
                                setEditItemForm({
                                  ...editItemForm,
                                  meters: e.target.value,
                                })
                              }
                              className="input bg-white dark:bg-gray-800"
                              required
                              onWheel={(e) => e.target.blur()}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-900 dark:text-gray-300 mb-1">
                              Price ₹/m *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={editItemForm.price_per_meter}
                              onChange={(e) =>
                                setEditItemForm({
                                  ...editItemForm,
                                  price_per_meter: e.target.value,
                                })
                              }
                              className="input bg-white dark:bg-gray-800"
                              required
                              onWheel={(e) => e.target.blur()}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-900 dark:text-gray-300 mb-1">
                              Cost ₹/m
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={editItemForm.cost_price_per_meter}
                              onChange={(e) =>
                                setEditItemForm({
                                  ...editItemForm,
                                  cost_price_per_meter: e.target.value,
                                })
                              }
                              className="input bg-white dark:bg-gray-800"
                              onWheel={(e) => e.target.blur()}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold mb-0.5">
                              Item {idx + 1}
                            </p>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {item.notes
                                ?.match(/Fabric:\s*([^(|\n]+)/)?.[1]
                                ?.trim() || "N/A"}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const fabricName =
                                item.notes
                                  ?.match(/Fabric:\s*([^(|\n]+)/)?.[1]
                                  ?.trim() || "";
                              setEditItemForm({
                                fabric_id: item.fabric_id || "",
                                fabric_name: fabricName,
                                meters: item.meters.toString(),
                                price_per_meter:
                                  item.price_per_meter.toString(),
                                cost_price_per_meter:
                                  item.cost_price_per_meter.toString(),
                              });
                              setEditItemFabricSearch(fabricName);
                              setEditingItemId(item.id);
                            }}
                            className="ml-2 p-2 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit item"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Meters
                            </p>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {item.meters}m
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Price/M
                            </p>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              ₹{item.price_per_meter.toLocaleString("en-IN")}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Total
                            </p>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              ₹{item.total_amount.toLocaleString("en-IN")}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Margin
                            </p>
                            <p className="font-semibold text-accent-600">
                              ₹{item.margin.toLocaleString("en-IN")}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
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
                    {selectedGroupForDetails.items
                      .reduce(
                        (sum, item) => sum + (parseFloat(item.meters) || 0),
                        0,
                      )
                      .toFixed(2)}
                    m
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
                    Total Margin
                  </p>
                  <p className="text-xl font-bold text-accent-600">
                    ₹{selectedGroupForDetails.margin.toLocaleString("en-IN")}
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
                onClick={() => {
                  setSelectedGroupForDetails(null);
                  setEditingItemId(null);
                  setActiveEditFabricDropdown(false);
                  setEditItemFabricSearch("");
                }}
                className="flex-1 btn btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditSaleInfo && selectedGroupForDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Edit Sale Info
              </h2>
              <button
                onClick={() => setShowEditSaleInfo(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3 bg-gray-50 dark:bg-gray-900/40">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Customer
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerTab("existing");
                      setCustomerSearch("");
                      setEditGroupFields({
                        ...editGroupFields,
                        customer_id: "",
                        customer_name: "",
                      });
                    }}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                      customerTab === "existing"
                        ? "bg-primary-600 text-white border-primary-600"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    <Users className="w-4 h-4 inline mr-1.5 mb-0.5" />
                    Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerTab("walkin");
                      setEditGroupFields({
                        ...editGroupFields,
                        customer_id: "",
                        customer_name: "Walk-in Customer",
                      });
                      setCustomerSearch("");
                    }}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                      customerTab === "walkin"
                        ? "bg-primary-600 text-white border-primary-600"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    <UserPlus className="w-4 h-4 inline mr-1.5 mb-0.5" />
                    Walk-in
                  </button>
                </div>
                {customerTab === "existing" ? (
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Search Customer
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={
                          showCustomerDropdown
                            ? customerSearch
                            : editGroupFields.customer_name || ""
                        }
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setEditGroupFields({
                            ...editGroupFields,
                            customer_id: "",
                            customer_name: e.target.value,
                          });
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => {
                          setCustomerSearch(
                            editGroupFields.customer_name || "",
                          );
                          setShowCustomerDropdown(true);
                        }}
                        className="input bg-white dark:bg-gray-800 pr-10"
                        placeholder="Type to search customer..."
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <ChevronDown
                          className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${showCustomerDropdown ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>
                    {showCustomerDropdown && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
                        {customers
                          .filter((c) =>
                            c.name
                              .toLowerCase()
                              .includes(customerSearch.toLowerCase()),
                          )
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setEditGroupFields({
                                  ...editGroupFields,
                                  customer_id: c.id,
                                  customer_name: c.name,
                                });
                                setCustomerSearch(c.name);
                                setShowCustomerDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                            >
                              {c.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Enter Walk-in Name
                    </label>
                    <input
                      type="text"
                      value={
                        editGroupFields.customer_name === "Walk-in Customer"
                          ? ""
                          : editGroupFields.customer_name
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditGroupFields({
                          ...editGroupFields,
                          customer_id: "",
                          customer_name: val || "Walk-in Customer",
                        });
                      }}
                      className="input bg-white"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Payment
                </span>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Payment Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["cash", "Full Cash"],
                      ["partial", "Partial"],
                      ["credit", "Full Credit"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setEditGroupFields({
                            ...editGroupFields,
                            payment_type: v,
                            initial_payment:
                              v === "partial"
                                ? editGroupFields.initial_payment
                                : "",
                          })
                        }
                        className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                          editGroupFields.payment_type === v
                            ? "bg-primary-600 text-white border-primary-600"
                            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {editGroupFields.payment_type === "partial" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Initial Payment
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editGroupFields.initial_payment}
                      onChange={(e) =>
                        setEditGroupFields({
                          ...editGroupFields,
                          initial_payment: e.target.value,
                        })
                      }
                      className="input bg-white"
                      placeholder="Amount received now"
                      onWheel={(e) => e.target.blur()}
                    />
                  </div>
                )}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3 bg-gray-50 dark:bg-gray-900/40">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Details & Documents
                </span>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Sale Date
                  </label>
                  <input
                    type="date"
                    value={editGroupFields.sale_date}
                    onChange={(e) =>
                      setEditGroupFields({
                        ...editGroupFields,
                        sale_date: e.target.value,
                      })
                    }
                    className="input bg-white dark:bg-gray-800"
                  />
                </div>
                <FileUpload
                  label="Bill/Invoice"
                  file={editGroupFields.invoice_file}
                  onFileChange={(f) =>
                    setEditGroupFields({
                      ...editGroupFields,
                      invoice_file: f,
                    })
                  }
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditSaleInfo(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleEditGroupFieldsSave();
                  }}
                  disabled={savingGroupFields}
                  className="btn btn-primary flex-1"
                >
                  {savingGroupFields ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddItemForm && selectedGroupForDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Add Item to Sale
              </h2>
              <button
                onClick={() => {
                  setShowAddItemForm(false);
                  setActiveNewItemFabricDropdown(false);
                  setNewItemFabricSearch("");
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                Adding item for{" "}
                <span className="font-semibold">
                  {selectedGroupForDetails.customer?.name || "Walk-in"}
                </span>{" "}
                on{" "}
                <span className="font-semibold">
                  {new Date(
                    selectedGroupForDetails.sale_date,
                  ).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </p>
            </div>

            <form onSubmit={handleAddItemToSale} className="space-y-4">
              <div className="relative new-item-fabric-dropdown-container">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Fabric Name *
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={
                        activeNewItemFabricDropdown
                          ? newItemFabricSearch
                          : newItemForm.fabric_name || ""
                      }
                      onChange={(e) => {
                        setNewItemFabricSearch(e.target.value);
                        setNewItemForm({
                          ...newItemForm,
                          fabric_id: "",
                          fabric_name: e.target.value,
                        });
                        setActiveNewItemFabricDropdown(true);
                      }}
                      onFocus={() => {
                        setNewItemFabricSearch(newItemForm.fabric_name || "");
                        setActiveNewItemFabricDropdown(true);
                      }}
                      className="input bg-white dark:bg-gray-800 flex-1 pr-10"
                      placeholder="Search inventory or type name"
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${activeNewItemFabricDropdown ? "rotate-180" : ""}`}
                      />
                    </div>

                    {activeNewItemFabricDropdown && (
                      <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
                        {fabrics
                          .filter((f) =>
                            f.name
                              .toLowerCase()
                              .includes(newItemFabricSearch.toLowerCase()),
                          )
                          .map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setNewItemForm({
                                  ...newItemForm,
                                  fabric_id: f.id,
                                  fabric_name: f.name,
                                  cost_price_per_meter:
                                    f.purchase_price_per_meter.toString(),
                                  price_per_meter: (
                                    f.selling_price_per_meter || ""
                                  ).toString(),
                                });
                                setActiveNewItemFabricDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                            >
                              <div className="flex justify-between items-center">
                                <span className="dark:text-white">
                                  {f.name}
                                </span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {f.available_meters}m
                                </span>
                              </div>
                            </button>
                          ))}
                        {fabrics.filter((f) =>
                          f.name
                            .toLowerCase()
                            .includes(newItemFabricSearch.toLowerCase()),
                        ).length === 0 && (
                          <div className="px-3 py-2.5 text-xs text-gray-400 italic">
                            No matching fabrics found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScanningItemIdx("new")}
                    className="px-3 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-400 rounded-lg text-gray-500 transition-colors"
                  >
                    <ScanLine className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Meters *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={newItemForm.meters}
                    onChange={(e) =>
                      setNewItemForm({
                        ...newItemForm,
                        meters: e.target.value,
                      })
                    }
                    className="input bg-white"
                    placeholder="0.00"
                    required
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Price/Meter ₹ *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItemForm.price_per_meter}
                    onChange={(e) =>
                      setNewItemForm({
                        ...newItemForm,
                        price_per_meter: e.target.value,
                      })
                    }
                    className="input bg-white"
                    placeholder="0.00"
                    required
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cost/Meter ₹
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newItemForm.cost_price_per_meter}
                  onChange={(e) =>
                    setNewItemForm({
                      ...newItemForm,
                      cost_price_per_meter: e.target.value,
                    })
                  }
                  className="input bg-white"
                  placeholder="0.00"
                  onWheel={(e) => e.target.blur()}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddItemForm(false);
                    setActiveNewItemFabricDropdown(false);
                    setNewItemFabricSearch("");
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
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
        <div className="text-center py-16">
          <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No sales found</p>
          <p className="text-gray-300 text-sm mt-1">
            Try adjusting your filters
          </p>
        </div>
      )}
    </div>
  );
}
