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
  ScanLine,
  Pencil,
  CheckCircle,
  Download,
  ChevronDown,
} from "lucide-react";
import { exportCSV } from "../utils/export";
import { validateSale, validatePayment, hasErrors } from "../utils/validators";
import BarcodeScanner from "./BarcodeScanner";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

const PAGE_SIZE = 10;

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
  const emptyForm = {
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
    notes: "",
  };
  const [formData, setFormData] = useState(emptyForm);
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
      updateItem(scanningItemIdx, {
        fabric_id: data.id,
        fabric_name: data.name,
        cost_price_per_meter: data.purchase_price_per_meter.toString(),
        price_per_meter: (data.selling_price_per_meter || "").toString(),
      });
    } else {
      updateItem(scanningItemIdx, { fabric_name: code, fabric_id: "" });
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

  function addItem() {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          fabric_id: "",
          fabric_name: "",
          meters: "",
          price_per_meter: "",
          cost_price_per_meter: "",
        },
      ],
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

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validateSale(formData);
    if (hasErrors(errors)) {
      setFormErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }
    setFormErrors({});
    try {
      const initialPayment = parseFloat(formData.initial_payment) || 0;

      // Check credit limit for credit/partial sales
      if (formData.customer_id && formData.payment_type !== "cash") {
        const customer = customers.find((c) => c.id === formData.customer_id);
        if (customer?.credit_limit > 0) {
          const totalAmount = parseFloat(calculateTotal());
          const newRemaining = totalAmount - initialPayment;
          const currentDue = customerDues?.[customer.id] || 0;
          if (currentDue + newRemaining > customer.credit_limit) {
            toast(
              `Credit limit exceeded! Customer's limit is ₹${customer.credit_limit.toLocaleString("en-IN")}, current dues: ₹${currentDue.toLocaleString("en-IN")}, new would add: ₹${newRemaining.toLocaleString("en-IN")}`,
              "error",
            );
            return;
          }
        }
      }

      const salePayload = {
        customer_id: formData.customer_id || null,
        fabric_id: formData.fabric_id || null,
        meters,
        price_per_meter: pricePerMeter,
        cost_price_per_meter: costPricePerMeter,
        sale_date: formData.sale_date,
        payment_type: formData.payment_type,
        status: formData.payment_type === "cash" ? "completed" : "partial",
        notes: `Fabric: ${fabricInfo}${formData.notes ? ` | ${formData.notes}` : ""}`,
      };

      if (editingId) {
        const totalAmount = parseFloat(calculateTotal());
        const marginAmount = parseFloat(calculateMargin());
        const remainingAmount = parseFloat(calculateRemaining());
        const { error: updateError } = await supabase
          .from("sales")
          .update({
            ...salePayload,
            total_amount: totalAmount,
            margin: marginAmount,
            remaining_amount: remainingAmount,
          })
          .eq("id", editingId);
        if (updateError) throw updateError;
        toast("Sale updated successfully");
      } else {
        const { data: saleData, error: saleError } = await supabase
          .from("sales")
          .insert([salePayload])
          .select()
          .single();
        if (saleError) throw saleError;
        if (initialPayment > 0 && saleData) {
          await supabase.from("sale_payments").insert([
            {
              sale_id: saleData.id,
              amount: initialPayment,
              payment_date: formData.sale_date,
              payment_method: "cash",
            },
          ]);
        }
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      fetchSales();
      toast(
        editingId ? "Sale updated successfully" : "Sale recorded successfully",
      );
    } catch (error) {
      console.error("Error saving sale:", error);
      toast("Failed to save sale", "error");
    }
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
      const { error } = await supabase.from("sale_payments").insert([
        {
          sale_id: selectedSale.id,
          amount: parseFloat(paymentData.amount),
          payment_date: paymentData.payment_date,
          payment_method: paymentData.payment_method,
          reference_number: paymentData.reference_number,
          notes: paymentData.notes,
        },
      ]);
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
      fetchPayments(selectedSale.id);
      toast("Payment recorded");
    } catch (error) {
      console.error("Error saving payment:", error);
      toast("Failed to save payment", "error");
    }
  }

  async function fetchPayments(saleId) {
    try {
      const { data } = await supabase
        .from("sale_payments")
        .select("*")
        .eq("sale_id", saleId)
        .order("payment_date", { ascending: false });
      setPayments(data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
    }
  }

  function handleEdit(sale) {
    const notes = sale.notes || "";
    const fabricMatch = notes.match(/Fabric:\s*([^(|\n]+)/);
    setFormData({
      customer_id: sale.customer_id || "",
      customer_name: sale.customer?.name || "",
      items: [
        {
          fabric_id: sale.fabric_id || "",
          fabric_name: fabricMatch ? fabricMatch[1].trim() : "",
          meters: sale.meters.toString(),
          price_per_meter: sale.price_per_meter.toString(),
          cost_price_per_meter: sale.cost_price_per_meter.toString(),
        },
      ],
      sale_date: sale.sale_date,
      payment_type: sale.payment_type,
      initial_payment: "",
      notes: "",
    });
    setEditingId(sale.id);
    setShowForm(true);
  }

  function handleViewPayments(sale) {
    setSelectedSale(sale);
    fetchPayments(sale.id);
  }
  function handleAddPayment(sale) {
    setSelectedSale(sale);
    setShowPaymentForm(true);
  }

  async function handleDelete(id) {
    try {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
      toast("Sale deleted");
      fetchSales();
    } catch (err) {
      console.error("Error deleting sale:", err);
      toast("Failed to delete sale", "error");
    } finally {
      setConfirmDelete(null);
    }
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

  const totalPages = Math.ceil(filteredSales.length / PAGE_SIZE);
  const paginated = filteredSales.slice(
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
              setFormData(emptyForm);
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
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="input w-full sm:w-36"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="input w-full sm:w-36"
          placeholder="To"
        />
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {editingId ? "Edit Sale" : "New Sale"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Customer Section */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Customer
                  </span>
                </div>
                <div className="relative" ref={customerDropdownRef}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Search or Select Customer
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        showCustomerDropdown
                          ? customerSearch
                          : formData.customer_name || ""
                      }
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setFormData({
                          ...formData,
                          customer_id: "",
                          customer_name: e.target.value,
                        });
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => {
                        setCustomerSearch(formData.customer_name || "");
                        setShowCustomerDropdown(true);
                      }}
                      className="input bg-white pr-10"
                      placeholder="Type to search or leave blank for Walk-in"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {formData.customer_id && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              customer_id: "",
                              customer_name: "",
                            });
                            setCustomerSearch("");
                          }}
                          className="text-gray-400 hover:text-gray-600 p-0.5"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform ${showCustomerDropdown ? "rotate-180" : ""}`}
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
                              setFormData({
                                ...formData,
                                customer_id: c.id,
                                customer_name: c.name,
                              });
                              setCustomerSearch(c.name);
                              setShowCustomerDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm ${formData.customer_id === c.id ? "bg-primary-50 text-primary-700 font-medium" : ""}`}
                          >
                            {c.name}
                          </button>
                        ))}
                      {customers.filter((c) =>
                        c.name
                          .toLowerCase()
                          .includes(customerSearch.toLowerCase()),
                      ).length === 0 && (
                        <div className="px-3 py-2.5 text-sm text-gray-400 italic">
                          {customerSearch
                            ? `Add "${customerSearch}" as new customer`
                            : "No customers found"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Fabric Details Section */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Fabric Items
                  </label>
                  {!editingId && (
                    <button
                      type="button"
                      onClick={addItem}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add item
                    </button>
                  )}
                </div>

                {formData.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50 fabric-dropdown-container"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">
                        Item {idx + 1}
                      </span>
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              items: prev.items.filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Search or Select Fabric *
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={
                              activeFabricDropdown === idx
                                ? fabricSearch
                                : item.fabric_name || ""
                            }
                            onChange={(e) => {
                              setFabricSearch(e.target.value);
                              updateItem(idx, {
                                fabric_id: "",
                                fabric_name: e.target.value,
                              });
                              setActiveFabricDropdown(idx);
                            }}
                            onFocus={() => {
                              setFabricSearch(item.fabric_name || "");
                              setActiveFabricDropdown(idx);
                            }}
                            className="input bg-white pr-10"
                            placeholder="Search inventory or type name"
                            required
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {item.fabric_id && (
                              <div
                                className="w-2 h-2 rounded-full bg-accent-500"
                                title="Linked to inventory"
                              />
                            )}
                            <ChevronDown
                              className={`w-4 h-4 text-gray-400 transition-transform ${activeFabricDropdown === idx ? "rotate-180" : ""}`}
                            />
                          </div>

                          {activeFabricDropdown === idx && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
                              {fabrics
                                .filter((f) =>
                                  f.name
                                    .toLowerCase()
                                    .includes(fabricSearch.toLowerCase()),
                                )
                                .map((f) => (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => {
                                      updateItem(idx, {
                                        fabric_id: f.id,
                                        fabric_name: f.name,
                                        cost_price_per_meter:
                                          f.purchase_price_per_meter.toString(),
                                        price_per_meter: (
                                          f.selling_price_per_meter || ""
                                        ).toString(),
                                      });
                                      setActiveFabricDropdown(null);
                                    }}
                                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm"
                                  >
                                    <div className="flex justify-between items-center">
                                      <span>{f.name}</span>
                                      <span className="text-[10px] text-gray-400">
                                        {f.available_meters}m
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              {fabrics.filter((f) =>
                                f.name
                                  .toLowerCase()
                                  .includes(fabricSearch.toLowerCase()),
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
                          onClick={() => {
                            setScanningItemIdx(idx);
                            setShowScanner(true);
                          }}
                          className="px-3 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-400 rounded-lg text-gray-500 transition-colors"
                        >
                          <ScanLine className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {item.fabric_id && (
                      <div className="bg-primary-50 border border-primary-100 rounded-xl p-3 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-accent-500" />
                          <div>
                            <p className="text-[10px] text-primary-600 font-bold uppercase mb-0.5">
                              Linked Inventory
                            </p>
                            <p className="text-sm font-semibold text-primary-900">
                              {item.fabric_name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-primary-600 font-bold uppercase mb-0.5">
                            Cost
                          </p>
                          <p className="text-sm font-semibold text-primary-900">
                            ₹{item.cost_price_per_meter}/m
                          </p>
                        </div>
                      </div>
                    )}
                    <div
                      className={`grid ${item.fabric_id ? "grid-cols-2" : "grid-cols-3"} gap-2`}
                    >
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Meters *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          min="0.01"
                          value={item.meters}
                          onChange={(e) =>
                            updateItem(idx, { meters: e.target.value })
                          }
                          className="input bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Price ₹/m *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.price_per_meter}
                          onChange={(e) =>
                            updateItem(idx, { price_per_meter: e.target.value })
                          }
                          className="input bg-white"
                        />
                      </div>
                      {!item.fabric_id && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Cost ₹/m
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.cost_price_per_meter}
                            onChange={(e) =>
                              updateItem(idx, {
                                cost_price_per_meter: e.target.value,
                              })
                            }
                            className="input bg-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Payment Section */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Payment
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Payment Type *
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
                          setFormData({
                            ...formData,
                            payment_type: v,
                          })
                        }
                        className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                          formData.payment_type === v
                            ? "bg-primary-600 text-white border-primary-600"
                            : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {formData.payment_type !== "cash" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Initial Payment
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.initial_payment}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          initial_payment: e.target.value,
                        })
                      }
                      className="input bg-white"
                      placeholder="Amount received now"
                    />
                  </div>
                )}
              </div>

              {/* Date & Notes Section */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Details
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Sale Date
                  </label>
                  <input
                    type="date"
                    value={formData.sale_date}
                    onChange={(e) =>
                      setFormData({ ...formData, sale_date: e.target.value })
                    }
                    className="input bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Additional Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className="input bg-white"
                    rows={2}
                    placeholder="Optional notes..."
                  />
                </div>
              </div>

              {/* Totals Summary */}
              {parseFloat(calculateTotal()) > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1 border border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-semibold">₹{calculateTotal()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Margin:</span>
                    <span className="font-semibold text-accent-600">
                      ₹{calculateMargin()}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editingId ? "Update Sale" : "Record Sale"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showPaymentForm && selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-md p-4 sm:p-6 m-4 sm:my-8">
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
              <p className="text-sm text-gray-600 mt-1">{selectedSale.notes}</p>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
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
              <p className="text-sm text-gray-600 mt-1">{selectedSale.notes}</p>
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
                  Customer / Fabric
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Meters
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
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
              {paginated.map((sale) => (
                <tr
                  key={sale.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {sale.customer?.name || "Walk-in"}
                    </p>
                    {sale.notes && (
                      <p className="text-sm text-gray-500 max-w-xs truncate">
                        {sale.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-gray-600 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(sale.sale_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-sm">
                    {sale.meters}m
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 text-sm">
                    ₹{sale.total_amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className="text-accent-600 font-medium">
                      ₹{sale.margin.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span
                      className={
                        sale.remaining_amount > 0
                          ? "text-warning-600 font-semibold"
                          : "text-gray-500"
                      }
                    >
                      ₹{sale.remaining_amount.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {paymentBadge(sale.payment_type)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewPayments(sale)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                        title="View payments"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(sale)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
                        title="Edit sale"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {sale.remaining_amount > 0 && (
                        <button
                          onClick={() => handleAddPayment(sale)}
                          className="p-1.5 hover:bg-accent-50 rounded-lg text-gray-500 hover:text-accent-600"
                          title="Receive payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(sale.id)}
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
            {filteredSales.length} records — page {page} of {totalPages}
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
          message="This will permanently delete the sale and all its payments."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {filteredSales.length === 0 && (
        <div className="text-center py-12 text-gray-500">No sales found</div>
      )}
    </div>
  );
}
