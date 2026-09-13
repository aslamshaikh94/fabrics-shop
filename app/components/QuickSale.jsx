"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  ScanLine,
  Search,
  X,
  CircleCheck as CheckCircle,
  Zap,
  Plus,
  Trash2,
} from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";
import { useToast } from "./Toast";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeEmptyItem() {
  return {
    fabric_id: "",
    fabric_name: "",
    meters: "",
    price_per_meter: "",
    cost_price_per_meter: "",
  };
}

export default function QuickSale() {
  const toast = useToast();
  const [fabrics, setFabrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([makeEmptyItem()]);
  const [activeItemIdx, setActiveItemIdx] = useState(0);
  const paymentType = "cash";
  const [discountAmount, setDiscountAmount] = useState("");
  const [done, setDone] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const fabRes = await supabase.from("fabrics").select("*").order("name");
    setFabrics(fabRes.data || []);
    setLoading(false);
  }

  function handleBarcodeScan(code) {
    setShowScanner(false);
    const fabric = fabrics.find((f) => f.barcode === code);
    if (fabric) {
      selectFabricForItem(activeItemIdx, fabric);
      toast(`Found: ${fabric.name}`);
    } else {
      toast("Fabric not found for this barcode", "error");
    }
  }

  function selectFabricForItem(idx, fabric) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              fabric_id: fabric.id,
              fabric_name: fabric.name,
              cost_price_per_meter: fabric.purchase_price_per_meter.toString(),
              price_per_meter: (
                fabric.selling_price_per_meter || ""
              ).toString(),
            }
          : item,
      ),
    );
    setSearch("");
  }

  function updateItem(idx, fields) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...fields } : item)),
    );
  }

  function removeItem(idx) {
    if (items.length <= 1) {
      // Reset the only item instead of removing
      setItems([makeEmptyItem()]);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
    if (activeItemIdx >= idx && activeItemIdx > 0) {
      setActiveItemIdx((prev) => prev - 1);
    }
  }

  function addItem() {
    const currentItem = items[items.length - 1];
    if (
      !currentItem.fabric_name ||
      !currentItem.meters ||
      !currentItem.price_per_meter
    ) {
      toast("Please fill in the current item first", "error");
      return;
    }
    setItems((prev) => [...prev, makeEmptyItem()]);
    setActiveItemIdx(items.length);
  }

  const filteredFabrics =
    search.length > 1
      ? fabrics.filter((f) =>
          f.name.toLowerCase().includes(search.toLowerCase()),
        )
      : [];

  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      (parseFloat(item.meters) || 0) * (parseFloat(item.price_per_meter) || 0),
    0,
  );
  const discountValue = parseFloat(discountAmount) || 0;
  const netTotal = Math.max(subtotal - discountValue, 0);

  function reset() {
    setItems([makeEmptyItem()]);
    setActiveItemIdx(0);
    setDiscountAmount("");
    setSearch("");
    setDone(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Filter out empty rows — only save items that have at least fabric name and meters
    const validItems = items.filter(
      (item) => item.fabric_name && item.meters && item.price_per_meter,
    );
    if (validItems.length === 0) {
      toast(
        "Please add at least one item with fabric, meters, and price",
        "error",
      );
      return;
    }

    setSaving(true);
    try {
      const saleGroupId = generateUUID();

      const salePayloads = validItems.map((item) => ({
        customer_id: null,
        fabric_id: item.fabric_id || null,
        meters: parseFloat(item.meters) || 0,
        price_per_meter: parseFloat(item.price_per_meter) || 0,
        cost_price_per_meter: parseFloat(item.cost_price_per_meter) || 0,
        sale_date: new Date().toISOString().split("T")[0],
        payment_type: paymentType,
        fabric_name: item.fabric_name,
        notes: `Fabric: ${item.fabric_name}`,
        sale_group_id: saleGroupId,
        discount_amount: 0, // discount applied at group level via first item
      }));

      // Apply discount to first item only
      if (discountValue > 0 && salePayloads.length > 0) {
        salePayloads[0].discount_amount = discountValue;
      }

      const { data: saleRows, error } = await supabase
        .from("sales")
        .insert(salePayloads)
        .select();

      if (error) throw error;

      // Create sale_payments for cash sales — account for discount
      if (saleRows && saleRows.length > 0) {
        if (paymentType === "cash") {
          const paymentInserts = saleRows.map((row, idx) => {
            const fullAmount = row.meters * row.price_per_meter;
            // Subtract discount from the first item's payment
            const amount =
              idx === 0 ? Math.max(fullAmount - discountValue, 0) : fullAmount;
            return {
              sale_id: row.id,
              amount,
              payment_date: new Date().toISOString().split("T")[0],
              payment_method: "cash",
            };
          });
          const { error: payErr } = await supabase
            .from("sale_payments")
            .insert(paymentInserts);
          if (payErr) throw payErr;
        }
      }

      const totalMeters = validItems.reduce(
        (s, item) => s + (parseFloat(item.meters) || 0),
        0,
      );
      const fabricNames = validItems.map((i) => i.fabric_name).join(", ");

      setLastSale({
        fabrics: fabricNames,
        meters: totalMeters,
        total: netTotal,
        paymentType,
        itemCount: items.length,
      });
      setDone(true);
      toast("Sale recorded!");
    } catch (err) {
      console.error(err);
      toast("Failed to record sale", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
      </div>
    );

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" /> Quick Sale
          </h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Fast walk-in sale — add multiple fabric items
          </p>
        </div>
      </div>

      {/* Success screen */}
      {done && lastSale ? (
        <div className="card p-6 text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-accent-500 mx-auto" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">Sale Recorded!</h2>
            <p className="text-gray-500 mt-1">
              {lastSale.fabrics} — {lastSale.meters.toFixed(2)}m
              {lastSale.itemCount > 1 && ` (${lastSale.itemCount} items)`}
            </p>
            <p className="text-3xl font-bold text-accent-600 mt-2">
              ₹
              {lastSale.total.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <span
              className={`badge mt-2 ${lastSale.paymentType === "cash" ? "bg-accent-100 text-accent-800" : "bg-warning-100 text-warning-800"}`}
            >
              {lastSale.paymentType === "cash"
                ? "Cash Paid"
                : lastSale.paymentType === "credit"
                  ? "Credit"
                  : "Partial"}
            </span>
          </div>
          <button onClick={reset} className="btn btn-primary w-full">
            <Zap className="w-4 h-4 mr-2" /> New Quick Sale
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Added Items Summary */}
          {items.length > 1 && (
            <div className="card p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Items ({items.length})
              </p>
              {items.slice(0, -1).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.fabric_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.meters}m @ ₹{item.price_per_meter}/m
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 hover:bg-red-100 rounded-lg text-gray-400 hover:text-red-600 shrink-0 ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Current Item Form */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {items.length > 1 ? `Item ${items.length}` : "Select Fabric"}
            </p>

            {/* Fabric Search / Selected */}
            {items[activeItemIdx]?.fabric_name &&
            items[activeItemIdx]?.fabric_id ? (
              <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-xl p-3 mb-3">
                <div>
                  <p className="font-semibold text-primary-900">
                    {items[activeItemIdx].fabric_name}
                  </p>
                  <p className="text-xs text-primary-600">
                    ₹{items[activeItemIdx].cost_price_per_meter}/m cost
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateItem(activeItemIdx, {
                      fabric_id: "",
                      fabric_name: "",
                      cost_price_per_meter: "",
                      price_per_meter: "",
                    })
                  }
                  className="p-1.5 hover:bg-primary-100 rounded-lg text-primary-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search fabric name..."
                      className="input pl-9"
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="px-3 bg-gray-100 hover:bg-primary-100 border border-gray-200 rounded-lg text-gray-500 hover:text-primary-600"
                  >
                    <ScanLine className="w-5 h-5" />
                  </button>
                </div>
                {filteredFabrics.length > 0 && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {filteredFabrics.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => selectFabricForItem(activeItemIdx, f)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {f.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {f.available_meters}m left
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-accent-600">
                            {f.selling_price_per_meter
                              ? `₹${f.selling_price_per_meter}/m`
                              : "Price not set"}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Meters & Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Meters *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={items[activeItemIdx]?.meters || ""}
                  onChange={(e) =>
                    updateItem(activeItemIdx, { meters: e.target.value })
                  }
                  className="input"
                  placeholder="0"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Price/m *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={items[activeItemIdx]?.price_per_meter || ""}
                  onChange={(e) =>
                    updateItem(activeItemIdx, {
                      price_per_meter: e.target.value,
                    })
                  }
                  className="input"
                  placeholder="₹0"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            </div>

            {/* Cost price (only if not linked to inventory) */}
            {!items[activeItemIdx]?.fabric_id && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cost Price/m (for margin calculation)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={items[activeItemIdx]?.cost_price_per_meter || ""}
                  onChange={(e) =>
                    updateItem(activeItemIdx, {
                      cost_price_per_meter: e.target.value,
                    })
                  }
                  className="input"
                  placeholder="₹0"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            )}

            {/* Add Item button */}
            <button
              type="button"
              onClick={addItem}
              className="btn btn-secondary w-full mt-3 flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" /> Add Another Item
            </button>
          </div>

          {/* Totals */}
          {subtotal > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Totals
              </p>
              <div className="bg-accent-50 rounded-xl p-3 flex justify-between items-center">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-lg font-bold text-accent-600">
                  ₹
                  {subtotal.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Discount Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || parseFloat(val) >= 0) {
                      setDiscountAmount(val);
                    }
                  }}
                  className="input"
                  placeholder="e.g. 500"
                  onWheel={(e) => e.target.blur()}
                />
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="text-primary-600 font-medium">
                    After Discount:
                  </span>
                  <span className="font-bold text-primary-600">
                    ₹
                    {netTotal.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
            </div>
          )}

          {subtotal > 0 && (
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary w-full py-3 text-base"
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
              ) : (
                `Record Sale — ₹${netTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </button>
          )}
        </form>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
