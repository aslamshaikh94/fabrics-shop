"use client";
import { ScanLine, Plus, X } from "lucide-react";

/**
 * Fabric row form used inside the "Add Fabrics to Purchase" modal.
 * Each row lets the user search/select an existing fabric, enter meters, price, quantity, barcode.
 */
export default function FabricRowForm({
  idx,
  row,
  fabricSearch,
  setFabricSearch,
  activeFabricIdx,
  setActiveFabricIdx,
  fabrics,
  updateFabricRow,
  selectFabricFromSuggest,
  addFabricRow,
  setScanningRowIdx,
  isLastRow,
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-white">
      <span className="text-[10px] font-bold text-gray-900 uppercase bg-gray-100 px-2 py-1 rounded">
        {idx === 0 ? "Fabric Item" : `Item ${idx + 1}`}
      </span>

      {/* Fabric auto-suggest */}
      <div>
        <label className="block text-xs font-bold text-gray-900 mb-1">
          Fabric Name *
        </label>
        <div className="relative">
          <input
            type="text"
            className="input bg-white pr-10"
            value={row.fabric_name}
            onChange={(e) => {
              updateFabricRow(idx, {
                fabric_name: e.target.value,
                fabric_id: "",
              });
              setFabricSearch(e.target.value);
              setActiveFabricIdx(idx);
            }}
            onFocus={() => {
              setFabricSearch(row.fabric_name || "");
              setActiveFabricIdx(idx);
            }}
            placeholder="Type to search existing fabrics..."
          />
          {row.fabric_id && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="text-[10px] bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded-full font-medium">
                restock
              </span>
            </div>
          )}
          {activeFabricIdx === idx && fabricSearch.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto py-1">
              {fabrics
                .filter((f) =>
                  f.name.toLowerCase().includes(fabricSearch.toLowerCase()),
                )
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => selectFabricFromSuggest(idx, f)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center justify-between"
                  >
                    <span className="font-medium">{f.name}</span>
                    <span className="text-[10px] text-gray-400">
                      {f.available_meters}m in stock
                    </span>
                  </button>
                ))}
              {fabrics.filter((f) =>
                f.name.toLowerCase().includes(fabricSearch.toLowerCase()),
              ).length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 italic">
                  No existing fabric found — will create new
                </div>
              )}
            </div>
          )}
        </div>
        {/* Inventory details card when existing fabric is selected */}
        {row.fabric_id &&
          (() => {
            const fabric = fabrics.find((f) => f.id === row.fabric_id);
            if (!fabric) return null;
            return (
              <div className="mt-2 bg-primary-50 border border-primary-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-primary-700 uppercase tracking-wide">
                    Current Inventory
                  </span>
                  <span className="text-[10px] bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded-full font-medium">
                    restock
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Available:</span>
                    <p className="font-semibold text-gray-900">
                      {fabric.available_meters}m
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Total:</span>
                    <p className="font-semibold text-gray-900">
                      {fabric.total_meters}m
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Buy Price:</span>
                    <p className="font-semibold text-gray-900">
                      ₹{fabric.purchase_price_per_meter}/m
                    </p>
                  </div>
                </div>
                {fabric.barcode && (
                  <div className="text-xs">
                    <span className="text-gray-500">Barcode:</span>
                    <span className="ml-1 font-mono text-gray-700">
                      {fabric.barcode}
                    </span>
                  </div>
                )}
                {fabric.quantity && (
                  <div className="text-xs">
                    <span className="text-gray-500">Quantity:</span>
                    <span className="ml-1 text-gray-700">
                      {fabric.quantity}
                    </span>
                  </div>
                )}
                <div className="text-xs text-primary-600 font-medium pt-1 border-t border-primary-100">
                  After restock:{" "}
                  {(
                    (fabric.available_meters || 0) +
                    (parseFloat(row.total_meters) || 0)
                  ).toFixed(2)}
                  m available
                </div>
              </div>
            );
          })()}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-1">
            Meters *
          </label>
          <input
            type="number"
            step="0.01"
            className="input bg-white"
            value={row.total_meters}
            onChange={(e) =>
              updateFabricRow(idx, { total_meters: e.target.value })
            }
            placeholder="0"
            onWheel={(e) => e.target.blur()}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-1">
            Buy ₹/m
          </label>
          <input
            type="number"
            step="0.01"
            className="input bg-white"
            value={row.purchase_price_per_meter}
            onChange={(e) =>
              updateFabricRow(idx, {
                purchase_price_per_meter: e.target.value,
              })
            }
            placeholder="0"
            onWheel={(e) => e.target.blur()}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-1">
            Quantity (optional)
          </label>
          <input
            className="input bg-white"
            value={row.quantity}
            onChange={(e) => updateFabricRow(idx, { quantity: e.target.value })}
            placeholder="e.g. 10 Rolls"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-1">
            Barcode
          </label>
          <div className="flex gap-1">
            <input
              className="input bg-white flex-1"
              value={row.barcode}
              onChange={(e) =>
                updateFabricRow(idx, { barcode: e.target.value })
              }
              placeholder="Scan or type"
            />
            <button
              type="button"
              onClick={() => setScanningRowIdx(idx)}
              className="px-2.5 border border-gray-300 hover:bg-primary-50 hover:border-primary-400 rounded-lg text-gray-500 transition-colors"
            >
              <ScanLine className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {isLastRow && (
        <button
          type="button"
          onClick={addFabricRow}
          className="w-full btn btn-primary flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Another Fabric
        </button>
      )}
    </div>
  );
}
