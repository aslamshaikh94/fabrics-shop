"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  X,
  ScanLine,
  Search,
  ChevronDown,
  CircleCheck as CheckCircle,
  Plus,
  Users,
  UserPlus,
} from "lucide-react";
import {
  validateSale,
  hasErrors,
  validateCurrentItem,
} from "../utils/validators";
import BarcodeScanner from "./BarcodeScanner";
import FileUpload from "./FileUpload";
import { useToast } from "./Toast";
import { formatCurrency } from "../utils/formatters";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
    discount_amount: "",
    invoice_file: null,
  };
}

export default function SaleForm({
  open,
  onClose,
  editingId: initialEditingId,
  onSaved,
  fabrics: allFabrics,
  customers: allCustomers,
  customerDues,
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(initialEditingId);
  const [formData, setFormData] = useState(makeEmptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeFabricDropdown, setActiveFabricDropdown] = useState(null);
  const [fabricSearch, setFabricSearch] = useState("");
  const [scanningItemIdx, setScanningItemIdx] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [itemJustAdded, setItemJustAdded] = useState(false);
  const [customerTab, setCustomerTab] = useState("existing");
  const customerDropdownRef = useRef(null);

  useEffect(() => {
    setEditingId(initialEditingId);
    if (open) {
      setFormData(makeEmptyForm());
      if (initialEditingId) {
        fetchSaleForEditing(initialEditingId);
      }
    }
  }, [open, initialEditingId]);

  async function fetchSaleForEditing(id) {
    const { data, error } = await supabase
      .from("sales")
      .select("*, customer:customers(*)")
      .eq("id", id)
      .single();

    if (data) {
      loadSaleForEdit(data);
    }
  }

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

  function updateItem(idx, fields) {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === idx ? { ...item, ...fields } : item,
      ),
    }));
  }

  function addItem() {
    const currentItem = formData.items[formData.items.length - 1];
    const itemErrors = validateCurrentItem(currentItem);
    if (Object.keys(itemErrors).length > 0) {
      setFormErrors({ ...formErrors, ...itemErrors });
      toast("Please fix item errors before adding", "error");
      return;
    }

    setItemJustAdded(true);
    const clearedErrors = { ...formErrors };
    delete clearedErrors.fabric_name;
    delete clearedErrors.meters;
    delete clearedErrors.price_per_meter;
    delete clearedErrors.cost_price_per_meter;
    setFormErrors(clearedErrors);

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
    setTimeout(() => setItemJustAdded(false), 100);
  }

  function calculateSubtotal() {
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

  function calculateNetTotal() {
    return Math.max(
      parseFloat(calculateSubtotal()) -
        (parseFloat(formData.discount_amount) || 0),
      0,
    );
  }

  function calculateMargin() {
    const totalMargin = formData.items.reduce(
      (sum, item) =>
        sum +
        (parseFloat(item.meters) || 0) *
          ((parseFloat(item.price_per_meter) || 0) -
            (parseFloat(item.cost_price_per_meter) || 0)),
      0,
    );
    return Math.max(
      totalMargin - (parseFloat(formData.discount_amount) || 0),
      0,
    ).toFixed(2);
  }

  function handleBarcodeScan(code) {
    setShowScanner(false);
    const fabric = allFabrics.find((f) => f.barcode === code);
    if (fabric) {
      if (scanningItemIdx === "new") {
        setFormData((prev) => ({
          ...prev,
          items: prev.items.map((item, i) =>
            i === prev.items.length - 1
              ? {
                  ...item,
                  fabric_id: fabric.id,
                  fabric_name: fabric.name,
                  cost_price_per_meter:
                    fabric.purchase_price_per_meter.toString(),
                  price_per_meter: (
                    fabric.selling_price_per_meter || ""
                  ).toString(),
                }
              : item,
          ),
        }));
      } else {
        updateItem(scanningItemIdx, {
          fabric_id: fabric.id,
          fabric_name: fabric.name,
          cost_price_per_meter: fabric.purchase_price_per_meter.toString(),
          price_per_meter: (fabric.selling_price_per_meter || "").toString(),
        });
      }
    } else {
      if (scanningItemIdx === "new") {
        setFormData((prev) => ({
          ...prev,
          items: prev.items.map((item, i) =>
            i === prev.items.length - 1
              ? { ...item, fabric_name: code, fabric_id: "" }
              : item,
          ),
        }));
      } else {
        updateItem(scanningItemIdx, { fabric_name: code, fabric_id: "" });
      }
    }
    setScanningItemIdx(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const errors = validateSale(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast("Please fix the validation errors", "error");
      return;
    }

    const itemsToSave = formData.items.filter((item, idx) => {
      if (formData.items.length === 1) return true;
      if (idx === formData.items.length - 1) {
        return item.fabric_name && item.fabric_name.trim() !== "";
      }
      return true;
    });

    const subtotal = itemsToSave.reduce(
      (sum, item) =>
        sum +
        (parseFloat(item.meters) || 0) *
          (parseFloat(item.price_per_meter) || 0),
      0,
    );

    setSaving(true);
    try {
      const discountAmount = parseFloat(formData.discount_amount) || 0;
      const initialPayment = parseFloat(formData.initial_payment) || 0;

      let invoice_url = "";
      if (formData.invoice_file) {
        const ext = formData.invoice_file.name.split(".").pop();
        const path = `sales-invoices/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("sales-invoices")
          .upload(path, formData.invoice_file);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("sales-invoices").getPublicUrl(path);
        invoice_url = publicUrl;
      }

      // Check credit limit for credit/partial
      const netTotal = Math.max(subtotal - discountAmount, 0);
      if (formData.customer_id && formData.payment_type !== "cash") {
        const customer = allCustomers.find(
          (c) => c.id === formData.customer_id,
        );
        if (customer?.credit_limit > 0) {
          const newRemaining = netTotal - initialPayment;
          const currentDue = customerDues?.[customer.id] || 0;
          if (currentDue + newRemaining > customer.credit_limit) {
            toast(
              `Credit limit exceeded! Customer's limit is ₹${customer.credit_limit.toLocaleString("en-IN")}, current dues: ₹${currentDue.toLocaleString("en-IN")}, new would add: ₹${newRemaining.toLocaleString("en-IN")}`,
              "error",
            );
            setSaving(false);
            return;
          }
        }
      }

      if (editingId) {
        const item = itemsToSave[0] || {};

        const { error: deletePayErr } = await supabase
          .from("sale_payments")
          .delete()
          .eq("sale_id", editingId);
        if (deletePayErr) throw deletePayErr;

        const salePayload = {
          customer_id: formData.customer_id || null,
          fabric_id: item.fabric_id || null,
          meters: parseFloat(item.meters) || 0,
          price_per_meter: parseFloat(item.price_per_meter) || 0,
          cost_price_per_meter: parseFloat(item.cost_price_per_meter) || 0,
          sale_date: formData.sale_date,
          payment_type: formData.payment_type,
          customer_name: !formData.customer_id
            ? formData.customer_name !== "Walk-in Customer"
              ? formData.customer_name
              : ""
            : "",
          fabric_name: item.fabric_name,
          invoice_url,
          discount_amount: discountAmount,
        };
        const { error: updateError } = await supabase
          .from("sales")
          .update(salePayload)
          .eq("id", editingId);
        if (updateError) throw updateError;

        if (formData.payment_type === "cash") {
          const { error: payErr } = await supabase
            .from("sale_payments")
            .insert([
              {
                sale_id: editingId,
                amount: netTotal,
                payment_date: formData.sale_date,
                payment_method: "cash",
              },
            ]);
          if (payErr) throw payErr;
        } else if (initialPayment > 0) {
          const { error: payErr } = await supabase
            .from("sale_payments")
            .insert([
              {
                sale_id: editingId,
                amount: Math.min(initialPayment, netTotal),
                payment_date: formData.sale_date,
                payment_method: "cash",
              },
            ]);
          if (payErr) throw payErr;
        }
      } else {
        const saleGroupId = generateUUID();
        const walkInNameInfo =
          !formData.customer_id &&
          formData.customer_name &&
          formData.customer_name !== "Walk-in Customer"
            ? ` (Name: ${formData.customer_name})`
            : "";
        // Apply discount to first item only (group-level discount)
        const salePayloads = itemsToSave.map((item, idx) => {
          return {
            customer_id: formData.customer_id || null,
            fabric_id: item.fabric_id || null,
            meters: parseFloat(item.meters) || 0,
            price_per_meter: parseFloat(item.price_per_meter) || 0,
            cost_price_per_meter: parseFloat(item.cost_price_per_meter) || 0,
            sale_date: formData.sale_date,
            payment_type: formData.payment_type,
            customer_name: !formData.customer_id
              ? formData.customer_name !== "Walk-in Customer"
                ? formData.customer_name
                : ""
              : "",
            fabric_name: item.fabric_name,
            notes: `Fabric: ${item.fabric_name}${walkInNameInfo}`,
            sale_group_id: saleGroupId,
            invoice_url,
            discount_amount: idx === 0 ? discountAmount : 0,
          };
        });

        let saleRows;
        const { data: data1, error: error1 } = await supabase
          .from("sales")
          .insert(salePayloads)
          .select();
        if (error1 && error1.message?.includes("column")) {
          const payloadsWithoutGroup = salePayloads.map(
            ({ sale_group_id, ...rest }) => rest,
          );
          const { data: data2, error: error2 } = await supabase
            .from("sales")
            .insert(payloadsWithoutGroup)
            .select();
          saleRows = data2;
          if (error2) throw error2;
        } else {
          saleRows = data1;
          if (error1) throw error1;
        }

        if (saleRows && saleRows.length > 0) {
          // Payment logic without splitting by discount
          if (formData.payment_type === "cash") {
            const paymentInserts = saleRows.map((row) => ({
              sale_id: row.id,
              amount: row.meters * row.price_per_meter,
              payment_date: formData.sale_date,
              payment_method: "cash",
            }));
            const { error: payErr } = await supabase
              .from("sale_payments")
              .insert(paymentInserts);
            if (payErr) throw payErr;
          } else if (initialPayment > 0) {
            let remaining = Math.min(initialPayment, netTotal);
            const paymentInserts = [];
            for (const row of saleRows) {
              if (remaining <= 0) break;
              const rowTotal = row.meters * row.price_per_meter;
              const pay = Math.min(remaining, rowTotal);
              if (pay > 0) {
                paymentInserts.push({
                  sale_id: row.id,
                  amount: pay,
                  payment_date: formData.sale_date,
                  payment_method: "cash",
                });
                remaining -= pay;
              }
            }
            if (paymentInserts.length > 0) {
              const { error: payErr } = await supabase
                .from("sale_payments")
                .insert(paymentInserts);
              if (payErr) throw payErr;
            }
          }
        }
      }

      onSaved?.();
      closeForm();
      toast(
        editingId ? "Sale updated successfully" : "Sale recorded successfully",
      );
    } catch (error) {
      console.error("Error saving sale:", error);
      toast(error?.message || "Failed to save sale", "error");
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setEditingId(null);
    setFormData(makeEmptyForm());
    setFormErrors({});
    setShowScanner(false);
    onClose?.();
  }

  function loadSaleForEdit(sale) {
    const isWalkin = !sale.customer_id;
    setCustomerTab(isWalkin ? "walkin" : "existing");
    const cleanNotes = (sale.notes || "")
      .replace(/Fabric:\s*[^(|\n]+/i, "")
      .replace(/\(Name:\s*[^)]+\)/g, "")
      .replace(/^[\s,;]+/, "")
      .replace(/[\s,;]+$/, "")
      .trim();
    setFormData({
      customer_id: sale.customer_id || "",
      customer_name:
        sale.customer?.name ||
        sale.customer_name ||
        (sale.customer_id ? "" : "Walk-in Customer"),
      items: [
        {
          fabric_id: sale.fabric_id || "",
          fabric_name: sale.fabric_name || "",
          meters: sale.meters.toString(),
          price_per_meter: sale.price_per_meter.toString(),
          cost_price_per_meter: sale.cost_price_per_meter.toString(),
        },
      ],
      sale_date: sale.sale_date,
      payment_type: sale.payment_type,
      initial_payment: "",
      discount_amount: sale.discount_amount?.toString() || "",
      invoice_file: null,
    });
    setEditingId(sale.id);
  }

  if (!open) return null;

  const netTotal = calculateNetTotal();
  const subtotal = parseFloat(calculateSubtotal());
  const discountValue = parseFloat(formData.discount_amount) || 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {editingId ? "Edit Sale" : "New Sale"}
          </h2>
          <button
            onClick={closeForm}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Section */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Customer
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustomerTab("existing");
                  setCustomerSearch("");
                  setFormData((prev) => ({
                    ...prev,
                    customer_id: "",
                    customer_name: "",
                  }));
                }}
                className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                  customerTab === "existing"
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                <Users className="w-4 h-4 inline mr-1.5 mb-0.5" />
                Existing Customer
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomerTab("walkin");
                  setFormData({
                    ...formData,
                    customer_id: "",
                    customer_name: "Walk-in Customer",
                  });
                  setCustomerSearch("");
                }}
                className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                  customerTab === "walkin"
                    ? "bg-primary-600 text-white border-primary-600"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                <UserPlus className="w-4 h-4 inline mr-1.5 mb-0.5" />
                Walk-in
              </button>
            </div>

            {customerTab === "existing" ? (
              <div className="relative" ref={customerDropdownRef}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Search Customer
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
                    placeholder="Type to search customer..."
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
                    {allCustomers
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
                          className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm ${
                            formData.customer_id === c.id
                              ? "bg-primary-50 text-primary-700 font-medium"
                              : ""
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    {allCustomers.filter((c) =>
                      c.name
                        .toLowerCase()
                        .includes(customerSearch.toLowerCase()),
                    ).length === 0 && (
                      <div className="px-3 py-2.5 text-sm text-gray-400 italic">
                        No customers found
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Enter Walk-in Name
                </label>
                <input
                  type="text"
                  value={
                    formData.customer_name === "Walk-in Customer"
                      ? ""
                      : formData.customer_name
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({
                      ...formData,
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

          {/* Fabric Items Section */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Fabric Items
              </span>
              {formData.items.length > 1 && !editingId && (
                <span className="text-xs font-medium text-white bg-accent-500 px-2.5 py-1.5 rounded-full">
                  {formData.items.length - 1} added
                </span>
              )}
            </div>

            {formData.items.length > 1 && !editingId && (
              <div className="space-y-2 mb-3 pb-3 border-b border-gray-200">
                {formData.items.slice(0, -1).map((item, idx) => (
                  <div
                    key={idx}
                    className="border border-green-200 rounded-lg p-3 bg-green-50 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-green-600" />
                        <p className="font-semibold text-gray-900">
                          {item.fabric_name || `Item ${idx + 1}`}
                        </p>
                        <span className="text-xs text-gray-700 font-medium">
                          {item.meters}m @ ₹{item.price_per_meter}/m
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 font-medium">
                        Total: ₹
                        {(
                          parseFloat(item.meters) *
                          parseFloat(item.price_per_meter)
                        ).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          items: prev.items.filter((_, i) => i !== idx),
                        }))
                      }
                      className="ml-2 p-2 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(() => {
              const currentIdx = formData.items.length - 1;
              const item = formData.items[currentIdx];
              return (
                <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-white fabric-dropdown-container">
                  <span className="text-[10px] font-bold text-gray-900 uppercase bg-gray-100 px-2 py-1 rounded">
                    {editingId
                      ? "Edit Sale"
                      : `New Item ${formData.items.length}`}
                  </span>
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-900 mb-1">
                      Search or Select Fabric *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={
                            activeFabricDropdown === currentIdx
                              ? fabricSearch
                              : item.fabric_name || ""
                          }
                          onChange={(e) => {
                            setFabricSearch(e.target.value);
                            updateItem(currentIdx, {
                              fabric_id: "",
                              fabric_name: e.target.value,
                            });
                            if (formErrors.fabric_name) {
                              const { fabric_name, ...rest } = formErrors;
                              setFormErrors(rest);
                            }
                            setActiveFabricDropdown(currentIdx);
                          }}
                          onFocus={() => {
                            if (!itemJustAdded) {
                              setFabricSearch(item.fabric_name || "");
                              setActiveFabricDropdown(currentIdx);
                            }
                          }}
                          className="input bg-white pr-10"
                          placeholder="Search inventory or type name"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {item.fabric_id && (
                            <div
                              className="w-2 h-2 rounded-full bg-accent-500"
                              title="Linked to inventory"
                            />
                          )}
                          <ChevronDown
                            className={`w-4 h-4 text-gray-600 transition-transform ${activeFabricDropdown === currentIdx ? "rotate-180" : ""}`}
                          />
                        </div>
                        {activeFabricDropdown === currentIdx && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
                            {allFabrics
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
                                    updateItem(currentIdx, {
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
                                  <span>{f.name}</span>{" "}
                                  <span className="text-[10px] text-gray-400 ml-2">
                                    {f.available_meters}m
                                  </span>
                                </button>
                              ))}
                            {allFabrics.filter((f) =>
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
                          setScanningItemIdx(currentIdx);
                          setShowScanner(true);
                        }}
                        className="px-3 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-400 rounded-lg text-gray-500 transition-colors"
                      >
                        <ScanLine className="w-4 h-4" />
                      </button>
                    </div>
                    {formErrors.fabric_name && (
                      <p className="text-xs text-red-500 mt-1">
                        {formErrors.fabric_name}
                      </p>
                    )}
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
                      <label className="block text-xs font-bold text-gray-900 mb-1">
                        Meters *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={item.meters}
                        onChange={(e) => {
                          updateItem(currentIdx, { meters: e.target.value });
                          if (formErrors.meters) {
                            const { meters, ...rest } = formErrors;
                            setFormErrors(rest);
                          }
                        }}
                        className="input bg-white"
                        onWheel={(e) => e.target.blur()}
                      />
                      {formErrors.meters && (
                        <p className="text-xs text-red-500 mt-1">
                          {formErrors.meters}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-900 mb-1">
                        Price ₹/m *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.price_per_meter}
                        onChange={(e) => {
                          updateItem(currentIdx, {
                            price_per_meter: e.target.value,
                          });
                          if (formErrors.price_per_meter) {
                            const { price_per_meter, ...rest } = formErrors;
                            setFormErrors(rest);
                          }
                        }}
                        className="input bg-white"
                        onWheel={(e) => e.target.blur()}
                      />
                      {formErrors.price_per_meter && (
                        <p className="text-xs text-red-500 mt-1">
                          {formErrors.price_per_meter}
                        </p>
                      )}
                    </div>
                    {!item.fabric_id && (
                      <div>
                        <label className="block text-xs font-bold text-gray-900 mb-1">
                          Cost ₹/m
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.cost_price_per_meter}
                          onChange={(e) => {
                            updateItem(currentIdx, {
                              cost_price_per_meter: e.target.value,
                            });
                            if (formErrors.cost_price_per_meter) {
                              const { cost_price_per_meter, ...rest } =
                                formErrors;
                              setFormErrors(rest);
                            }
                          }}
                          className="input bg-white"
                          onWheel={(e) => e.target.blur()}
                        />
                        {formErrors.cost_price_per_meter && (
                          <p className="text-xs text-red-500 mt-1">
                            {formErrors.cost_price_per_meter}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {!editingId && (
              <button
                type="button"
                onClick={addItem}
                className="w-full btn btn-primary flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>
            )}
          </div>

          {/* Payment Section */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Payment
            </span>
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
                        initial_payment:
                          v === "partial" ? formData.initial_payment : "",
                      })
                    }
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${formData.payment_type === v ? "bg-primary-600 text-white border-primary-600" : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {formData.payment_type === "partial" && (
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
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            )}
          </div>

          {/* Discount Section (Flat Amount) */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Discount (Applied on Total)
            </span>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Discount Amount (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.discount_amount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || parseFloat(val) >= 0) {
                    setFormData({ ...formData, discount_amount: val });
                  }
                }}
                className="input bg-white"
                placeholder="e.g. 500 for ₹500 off"
                onWheel={(e) => e.target.blur()}
              />
              {discountValue > 0 && (
                <div className="mt-2 flex justify-between text-xs text-primary-600">
                  <span>Discount Applied:</span>
                  <span className="font-semibold">
                    -{formatCurrency(discountValue)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Date & Invoice */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Details & Documents
            </span>
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
            <FileUpload
              label="Bill/Invoice"
              file={formData.invoice_file}
              onFileChange={(f) =>
                setFormData({ ...formData, invoice_file: f })
              }
            />
          </div>

          {subtotal > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 border border-gray-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Margin:</span>
                <span className="font-semibold text-accent-600">
                  {formatCurrency(calculateMargin())}
                </span>
              </div>
              {discountValue > 0 && (
                <>
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-1 mt-1">
                    <span className="text-primary-600">Discount:</span>
                    <span className="font-semibold text-primary-600">
                      -{formatCurrency(discountValue)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-gray-300 pt-1 mt-1">
                    <span>Net Total:</span>
                    <span>{formatCurrency(netTotal)}</span>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeForm}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary flex-1"
            >
              {saving ? (
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
                "Update Sale"
              ) : (
                "Record Sale"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
