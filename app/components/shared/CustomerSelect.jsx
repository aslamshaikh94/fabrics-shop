"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Users, UserPlus } from "lucide-react";

export default function CustomerSelect({
  value,
  onChange,
  customers,
  label = "Customer",
}) {
  const [tab, setTab] = useState("existing");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const walkinName =
    value.customer_name === "Walk-in Customer" ? "" : value.customer_name;

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={ref}
      className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3 bg-gray-50 dark:bg-gray-900/40"
    >
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setTab("existing");
            setSearch("");
            onChange({ customer_id: "", customer_name: "" });
          }}
          className={`py-2 rounded-xl text-sm font-medium border transition-all ${
            tab === "existing"
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
            setTab("walkin");
            setSearch("");
            onChange({ customer_id: "", customer_name: "Walk-in Customer" });
          }}
          className={`py-2 rounded-xl text-sm font-medium border transition-all ${
            tab === "walkin"
              ? "bg-primary-600 text-white border-primary-600"
              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400"
          }`}
        >
          <UserPlus className="w-4 h-4 inline mr-1.5 mb-0.5" />
          Walk-in
        </button>
      </div>
      {tab === "existing" ? (
        <div className="relative">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Search Customer
          </label>
          <div className="relative">
            <input
              type="text"
              value={open ? search : value.customer_name || ""}
              onChange={(e) => {
                setSearch(e.target.value);
                onChange({
                  ...value,
                  customer_id: "",
                  customer_name: e.target.value,
                });
                setOpen(true);
              }}
              onFocus={() => {
                setSearch(value.customer_name || "");
                setOpen(true);
              }}
              className="input bg-white dark:bg-gray-800 pr-10"
              placeholder="Type to search customer..."
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>
          </div>
          {open && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1">
              {customers
                .filter((c) =>
                  c.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange({
                        ...value,
                        customer_id: c.id,
                        customer_name: c.name,
                      });
                      setSearch(c.name);
                      setOpen(false);
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
            value={walkinName}
            onChange={(e) => {
              onChange({
                ...value,
                customer_id: "",
                customer_name: e.target.value || "Walk-in Customer",
              });
            }}
            className="input bg-white dark:bg-gray-800"
            placeholder="e.g. John Doe"
          />
        </div>
      )}
    </div>
  );
}
