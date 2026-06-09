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
  ShoppingBag,
} from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";
import FileUpload from "./FileUpload";
import { useToast } from "./Toast";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeEmptyForm() {
  return {
    supplier_id: "",
    items: [
      {
        fabric_id: "",
        fabric_name: "",
        meters: "",
        price_per_meter: "",
      },
    ],
    purchase_date: new Date().toISOString().split("T")[0],
    payment_type: "credit",
    initial_payment: "",
    invoice_file: null,
  };
}

export default function PurchaseForm({
  open,
  onClose,
  editingId,
  onSaved,
  fabrics,
  suppliers,
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(makeEmptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [activeFabricDropdown, setActiveFabricDropdown] = useState(null);
  const [fabricSearch, setFabricSearch] = useState("");
  const [scanningItemIdx, setScanningItemIdx] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [itemJustAdded, setItemJustAdded] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(makeEmptyForm());
      if (editingId) {
        fetchPurchaseForEditing(editingId);
      }
    }
  }, [open, editingId]);

  useEffect(() => {
    function handleClickOutside(event) {
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
    // Validate the current (last) item before adding
    const currentItem = formData.items[formData.items.length - 1];
    if (!currentItem.fabric_name || currentItem.fabric_name.trim() === "") {
      setFormErrors({ fabric_name: "Fabric name is required" });
      toast("Please enter fabric name before adding", "error");
      return;
    }
    if (!currentItem.meters || parseFloat(currentItem.meters) <= 0) {
      setFormErrors({ meters: "Meters must be greater than 0" });
      toast("Please enter valid meters before adding", "error");
      return;
    }

    setItemJustAdded(true);
    setFormErrors({});

    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          fabric_id: "",
          fabric_name: "",
          meters: "",
          price_per_meter: "",
        },
      ],
    }));
    setTimeout(() => setItemJustAdded(false), 100);
  }

  function calculateTotal() {
    return formData.items
      .reduce(
        (sum, item) =>
          sum +
          (parseFloat(item.meters) || 0) * (parseFloat(item.price_per_meter) || 0),
        0,
      )
      .toFixed(2);
  }

  function calculateRemaining() {
    return (
      parseFloat(calculateTotal()) - (parseFloat(formData.initial_payment) || 0)
    ).toFixed(2);
  }

  function handleBarcodeScan(code) {
    setShowScanner(false);
    const fabric = fabrics.find((f) => f.barcode === code);
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
                  price_per_meter: (fabric.purchase_price_per_meter || "").toString(),
                }
              : item,
          ),
        }));
      } else {
        updateItem(scanningItemIdx, {
          fabric_id: fabric.id,
          fabric_name: fabric.name,
          price_per_meter: (fabric.purchase_price_per_meter || "").toString(),
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

    // Validate
    if (!formData.supplier_id) {
      setFormErrors({ supplier_id: "Supplier is required" });
      toast("Please select a supplier", "error");
      return;
    }

    // Validate items - filter out empty last item if multiple items
    const itemsToSave = formData.items.filter((item, idx) => {
      if (formData.items.length === 1) return item.fabric_name && item.fabric_name.trim() !== "";
      if (idx === formData.items.length - 1) {
        return item.fabric_name && item.fabric_name.trim() !== "" && item.meters;
      }
      return item.fabric_name && item.fabric_name.trim() !== "";
    });

    if (itemsToSave.length === 0) {
      toast("Please add at least one item", "error");
      return;
    }

    // Check each item has meters and price
    for (let i = 0; i < itemsToSave.length; i++) {
      const item = itemsToSave[i];
      if (!item.meters || parseFloat(item.meters) <= 0) {
        toast(`Item ${i + 1}: Meters must be greater than 0`, "error");
        return;
      }
    }

    setSaving(true);
    try {
      const totalAmount = itemsToSave.reduce(
        (sum, item) =>
          sum +
          (parseFloat(item.meters) || 0) * (parseFloat(item.price_per_meter) || 0),
        0,
      );

      const initialPayment = parseFloat(formData.initial_payment) || 0;

      let invoice_url = "";
      if (formData.invoice_file) {
        const ext = formData.invoice_file.name.split(".").pop();
        const path = `purchase-invoices/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("purchase-invoices")
          .upload(path, formData.invoice_file);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("purchase-invoices").getPublicUrl(path);
        invoice_url = publicUrl;
      }

      const purchaseGroupId = generateUUID();

      const purchasePayloads = itemsToSave.map((item) => ({
        supplier_id: formData.supplier_id,
        fabric_id: item.fabric_id || null,
        fabric_name: item.fabric_name,
        meters: parseFloat(item.meters) || 0,
        price_per_unit: parseFloat(item.price_per_meter) || 0,
        total_amount: (parseFloat(item.meters) || 0) * (parseFloat(item.price_per_meter) || 0),
        purchase_date: formData.purchase_date,
        payment_type: formData.payment_type,
        purchase_group_id: purchaseGroupId,
        notes: `Fabric: ${item.fabric_name}`,
        invoice_url,
      }));

      const { data: purchaseRows, error: insertError } = await supabase
        .from("purchases")
        .insert(purchasePayloads)
        .select();

      if (insertError) throw insertError;

      // Handle payments
      if (purchaseRows && purchaseRows.length > 0) {
        if (formData.payment_type === "cash") {
          const paymentInserts = purchaseRows.map((row) => ({
            purchase_id: row.id,
            amount: row.total_amount,
            payment_date: formData.purchase_date,
            payment_method: "cash",
          }));
          const { error: payErr } = await supabase
            .from("purchase_payments")
            .insert(paymentInserts);
          if (payErr) throw payErr;
        } else if (initialPayment > 0) {
          let remaining = initialPayment;
          const paymentInserts = [];
          for (const row of purchaseRows) {
            const itemTotal = row.total_amount;
            const pay = Math.min(remaining, itemTotal);
            if (pay > 0) {
              paymentInserts.push({
                purchase_id: row.id,
                amount: pay,
                payment_date: formData.purchase_date,
                payment_method: "cash",
              });
              remaining -= pay;
            }
            if (remaining <= 0) break;
          }
          if (paymentInserts.length > 0) {
            const { error: payErr } = await supabase
              .from("purchase_payments")
              .insert(paymentInserts);
            if (payErr) throw payErr;
          }
        }
      }

      onSaved?.();
      closeForm();
      toast(
        editingId ? "Purchase updated successfully" : "Purchase recorded successfully",
      );
    } catch (error) {
      console.error("Error saving purchase:", error);
      toast(error?.message || "Failed to save purchase", "error");
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setFormData(makeEmptyForm());
    setFormErrors({});
    setShowScanner(false);
    onClose?.();
  }

  async function fetchPurchaseForEditing(id) {
    const { data, error } = await supabase
      .from("purchases")
      .select("*, supplier:suppliers(*)")
      .eq("id", id)
      .single();

    if (data) {
      const notes = data.notes || "";
      const fabricMatch = notes.match(/Fabric:\s*([^(|\n]+)/);
      setFormData({
        supplier_id: data.supplier_id,
        items: [
          {
            fabric_id: data.fabric_id || "",
            fabric_name: fabricMatch ? fabricMatch[1].trim() : data.fabric_name || "",
            meters: data.meters?.toString() || "",
            price_per_meter: data.price_per_unit?.toString() || "",
          },
        ],
        purchase_date: data.purchase_date,
        payment_type: data.payment_type || "credit",
        initial_payment: "",
        invoice_file: null,
      });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-4 sm:p-6 m-4 sm:my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {editingId ? "Edit Purchase" : "New Purchase"}
          </h2>
          <button onClick={closeForm} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier Section */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Supplier
            </span>
            <select
              value={formData.supplier_id}
              onChange={(e) => {
                setFormData({ ...formData, supplier_id: e.target.value });
                if (formErrors.supplier_id) {
                  setFormErrors({ ...formErrors, supplier_id: "" });
                }
              }}
              className={`input bg-white ${formErrors.supplier_id ? "border-error-400" : ""}`}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {formErrors.supplier_id && (
              <p className="text-xs text-red-500 mt-1">{formErrors.supplier_id}</p>
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

            {/* Display Added Items */}
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
                      </div>
                      <p className="text-xs text-gray-700 font-medium">
                        {item.meters ? `${item.meters}m` : ""}
                        {item.price_per_meter ? ` @ ₹${item.price_per_meter}/m` : ""}
                        {" = ₹"}
                        {(
                          (parseFloat(item.meters) || 0) *
                          (parseFloat(item.price_per_meter) || 0)
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

            {/* Current Item Form */}
            {(() => {
              const currentIdx = formData.items.length - 1;
              const item = formData.items[currentIdx];
              return (
                <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-white fabric-dropdown-container">
                  <span className="text-[10px] font-bold text-gray-900 uppercase bg-gray-100 px-2 py-1 rounded">
                    {editingId ? "Edit Purchase" : `New Item ${formData.items.length}`}
                  </span>

                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-900 mb-1">
                      Fabric Name *
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
                              setFormErrors({ ...formErrors, fabric_name: "" });
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
                          placeholder="Search or type fabric name"
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
                            {fabrics
                              .filter((f) =>
                                f.name.toLowerCase().includes(fabricSearch.toLowerCase()),
                              )
                              .map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => {
                                    updateItem(currentIdx, {
                                      fabric_id: f.id,
                                      fabric_name: f.name,
                                      price_per_meter: (f.purchase_price_per_meter || "").toString(),
                                    });
                                    setActiveFabricDropdown(null);
                                  }}
                                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm"
                                >
                                  <span>{f.name}</span>
                                  <span className="text-[10px] text-gray-400 ml-2">
                                    {f.purchase_price_per_meter ? `₹${f.purchase_price_per_meter}/m` : ""}
                                  </span>
                                </button>
                              ))}
                            {fabrics.filter((f) =>
                              f.name.toLowerCase().includes(fabricSearch.toLowerCase()),
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
                      <p className="text-xs text-red-500 mt-1">{formErrors.fabric_name}</p>
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
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
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
                            setFormErrors({ ...formErrors, meters: "" });
                          }
                        }}
                        className="input bg-white"
                        placeholder="0"
                        onWheel={(e) => e.target.blur()}
                      />
                      {formErrors.meters && (
                        <p className="text-xs text-red-500 mt-1">{formErrors.meters}</p>
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
                        onChange={(e) =>
                          updateItem(currentIdx, { price_per_meter: e.target.value })
                        }
                        className="input bg-white"
                        placeholder="0"
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>
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
                        initial_payment: v === "partial" ? formData.initial_payment : "",
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
                  placeholder="Amount paid now"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            )}
          </div>

          {/* Date & Invoice */}
          <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Details & Documents
            </span>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) =>
                  setFormData({ ...formData, purchase_date: e.target.value })
                }
                className="input bg-white"
              />
            </div>
            <FileUpload
              label="Bill/Invoice"
              file={formData.invoice_file}
              onFileChange={(f) => setFormData({ ...formData, invoice_file: f })}
            />
          </div>

          {parseFloat(calculateTotal()) > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 border border-gray-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-semibold">₹{parseFloat(calculateTotal()).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
              {formData.payment_type === "partial" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Remaining:</span>
                  <span className="font-semibold text-warning-600">
                    ₹{parseFloat(calculateRemaining()).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeForm} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? "Saving..." : editingId ? "Update Purchase" : "Record Purchase"}
            </button>
          </div>
        </form>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
