"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, ScanLine } from "lucide-react";

export default function FabricSelect({
  value,
  onChange,
  fabrics,
  onScan,
  label = "Fabric Name",
  placeholder = "Search inventory or type name",
  required = false,
  containerClass = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = fabrics.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div ref={ref} className={`relative ${containerClass}`}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label} {required && "*"}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={open ? search : value.fabric_name || ""}
            onChange={(e) => {
              setSearch(e.target.value);
              onChange({
                fabric_id: "",
                fabric_name: e.target.value,
                cost_price_per_meter: "",
                price_per_meter: "",
              });
              setOpen(true);
            }}
            onFocus={() => {
              setSearch(value.fabric_name || "");
              setOpen(true);
            }}
            className="input bg-white dark:bg-gray-800 pr-10"
            placeholder={placeholder}
            required={required}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <ChevronDown
              className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </div>
          {open && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
              {filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange({
                      fabric_id: f.id,
                      fabric_name: f.name,
                      cost_price_per_meter: (
                        f.purchase_price_per_meter || ""
                      ).toString(),
                      price_per_meter: (
                        f.selling_price_per_meter || ""
                      ).toString(),
                    });
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                >
                  <div className="flex justify-between items-center">
                    <span className="dark:text-white">{f.name}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {f.available_meters}m
                    </span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-2.5 text-xs text-gray-400 italic">
                  No matching fabrics found
                </div>
              )}
            </div>
          )}
        </div>
        {onScan && (
          <button
            type="button"
            onClick={onScan}
            className="px-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ScanLine className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
