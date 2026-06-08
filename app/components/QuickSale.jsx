"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { ScanLine, Search, X, CircleCheck as CheckCircle, Zap } from "lucide-react";
import BarcodeScanner from "./BarcodeScanner";
import { useToast } from "./Toast";

export default function QuickSale() {
  const toast = useToast();
  const [fabrics, setFabrics] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFabric, setSelectedFabric] = useState(null);
  const [meters, setMeters] = useState("");
  const [price, setPrice] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentType, setPaymentType] = useState("cash");
  const [done, setDone] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const [fabRes, custRes] = await Promise.all([
      supabase.from("fabrics").select("*").order("name"),
      supabase.from("customers").select("id, name").order("name"),
    ]);
    setFabrics(fabRes.data || []);
    setCustomers(custRes.data || []);
    setLoading(false);
  }

  function handleBarcodeScan(code) {
    setShowScanner(false);
    const fabric = fabrics.find((f) => f.barcode === code);
    if (fabric) {
      selectFabric(fabric);
      toast(`Found: ${fabric.name}`);
    } else {
      toast("Fabric not found for this barcode", "error");
    }
  }

  function selectFabric(fabric) {
    setSelectedFabric(fabric);
    setPrice((fabric.selling_price_per_meter || "").toString());
    setSearch("");
  }

  const filteredFabrics =
    search.length > 1
      ? fabrics.filter((f) =>
          f.name.toLowerCase().includes(search.toLowerCase()),
        )
      : [];

  const total = (parseFloat(meters) || 0) * (parseFloat(price) || 0);

  function reset() {
    setSelectedFabric(null);
    setMeters("");
    setPrice("");
    setCustomerId("");
    setPaymentType("cash");
    setSearch("");
    setDone(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedFabric || !meters || !price) return;
    setSaving(true);
    try {
      const m = parseFloat(meters);
      const p = parseFloat(price);
      const { data: saleData, error } = await supabase
        .from("sales")
        .insert([
          {
            customer_id: customerId || null,
            fabric_id: selectedFabric.id,
            meters: m,
            price_per_meter: p,
            cost_price_per_meter: selectedFabric.purchase_price_per_meter,
            sale_date: new Date().toISOString().split("T")[0],
            payment_type: paymentType,
            status: paymentType === "cash" ? "completed" : "partial",
            notes: `Fabric: ${selectedFabric.name}`,
          },
        ])
        .select()
        .single();
      if (error) throw error;

      setLastSale({
        fabric: selectedFabric.name,
        meters: m,
        total: m * p,
        paymentType,
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
            Fast cash sale — scan or search fabric
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
              {lastSale.fabric} — {lastSale.meters}m
            </p>
            <p className="text-3xl font-bold text-accent-600 mt-2">
              ₹{lastSale.total.toLocaleString("en-IN")}
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
          {/* Step 1: Select Fabric */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Step 1 — Select Fabric
            </p>
            {selectedFabric ? (
              <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-xl p-3">
                <div>
                  <p className="font-semibold text-primary-900">
                    {selectedFabric.name}
                  </p>
                  <p className="text-xs text-primary-600">
                    {selectedFabric.available_meters}m available
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFabric(null)}
                  className="p-1.5 hover:bg-primary-100 rounded-lg text-primary-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
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
                        onClick={() => selectFabric(f)}
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
                          <p className="text-xs text-gray-400">
                            {f.available_meters}m left
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Meters & Price */}
          {selectedFabric && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Step 2 — Meters & Price
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Meters *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={meters}
                    onChange={(e) => setMeters(e.target.value)}
                    className="input"
                    placeholder="0"
                    autoFocus
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
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="input"
                    placeholder="₹0"
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
              </div>
              {total > 0 && (
                <div className="mt-3 bg-accent-50 rounded-xl p-3 flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Amount</span>
                  <span className="text-xl font-bold text-accent-600">
                    ₹{total.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Customer & Payment */}
          {selectedFabric && meters && price && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Step 3 — Customer & Payment
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Customer
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="input"
                  >
                    <option value="">Walk-in customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Payment
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["cash", "Cash"],
                      ["partial", "Partial"],
                      ["credit", "Credit"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setPaymentType(v)}
                        className={`py-2 rounded-xl text-sm font-medium border transition-all ${paymentType === v ? "bg-primary-600 text-white border-primary-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedFabric && meters && price && (
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary w-full py-3 text-base"
            >
              {saving
                ? "Saving..."
                : `Record Sale — ₹${total.toLocaleString("en-IN")}`}
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
