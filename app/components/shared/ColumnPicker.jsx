"use client";
import { useRef, useState, useEffect } from "react";
import { Columns } from "lucide-react";

/**
 * Show/hide columns dropdown used across list pages.
 * Renders a trigger button, a responsive panel (bottom sheet on mobile,
 * anchored dropdown on desktop) and a custom-styled checkbox per column.
 */
export default function ColumnPicker({
  columns,
  visibleCols,
  onToggle,
  onReset,
}) {
  const [open, setOpen] = useState(false);
  const colPickerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const visibleCount = columns.filter((c) => visibleCols.has(c.key)).length;

  return (
    <div className="relative inline-flex" ref={colPickerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-secondary"
        title="Show/hide columns"
      >
        <Columns className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1 bg-white border border-gray-200 rounded-t-2xl sm:rounded-xl shadow-xl sm:shadow-lg p-4 pb-16 sm:p-3 sm:w-48">
            <div
              className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden cursor-pointer"
              onClick={() => setOpen(false)}
            />
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Columns
              </p>
              <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                {visibleCount}/{columns.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:block sm:space-y-0.5">
              {columns.map(({ key, label }) => {
                const checked = visibleCols.has(key);
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer py-1.5 sm:py-1 px-1.5 rounded-lg group transition-colors hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(key)}
                      className="sr-only"
                    />
                    <span
                      className={`flex items-center justify-center w-[18px] h-[18px] rounded-[5px] border-2 transition-all duration-150 shrink-0 ${
                        checked
                          ? "bg-primary-600 border-primary-600 shadow-sm shadow-primary-600/30"
                          : "bg-white border-gray-300 group-hover:border-primary-400 group-hover:bg-primary-50"
                      }`}
                    >
                      <svg
                        className={`w-[10px] h-[10px] text-white transition-all duration-150 ${
                          checked ? "opacity-100 scale-100" : "opacity-0 scale-50"
                        }`}
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 6.5L4.5 9L10 3.5" />
                      </svg>
                    </span>
                    <span
                      className={`text-sm truncate transition-colors duration-150 ${
                        checked
                          ? "text-gray-900 font-medium"
                          : "text-gray-500 group-hover:text-gray-700"
                      }`}
                    >
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              onClick={onReset}
              className="mt-3 text-xs text-primary-600 hover:underline w-full text-left"
            >
              Reset to default
            </button>
          </div>
        </>
      )}
    </div>
  );
}