"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

export default function CustomerSelect({
  value,
  onChange,
  customers,
  label = "Customer",
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayValue = open ? search : value.customer_name || "";
  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={ref}
      className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2 bg-gray-50 dark:bg-gray-900/40"
    >
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            onChange({ ...value, customer_id: "", customer_name: e.target.value });
            setOpen(true);
          }}
          onFocus={() => {
            setSearch(value.customer_name || "");
            setOpen(true);
          }}
          className="input bg-white dark:bg-gray-800 pr-10"
          placeholder="Customer name (or leave blank for walk-in)"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value.customer_id && (
            <button
              type="button"
              onClick={() => onChange({ ...value, customer_id: "", customer_name: "" })}
              className="text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
        {open && (
          <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange({ ...value, customer_id: c.id, customer_name: c.name });
                  setSearch(c.name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm ${
                  value.customer_id === c.id ? "bg-primary-50 text-primary-700 font-medium" : ""
                }`}
              >
                {c.name}
              </button>
            ))}
            {search && !customers.some((c) => c.name.toLowerCase() === search.toLowerCase()) && (
              <div className="px-3 py-2 text-xs text-gray-400 italic">
                New customer "{search}" will be created
              </div>
            )}
          </div>
        )}
      </div>
      {value.customer_id && (
        <p className="text-xs text-accent-600 font-medium">✓ Linked to existing customer</p>
      )}
    </div>
  );
}
