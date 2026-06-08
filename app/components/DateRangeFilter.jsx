"use client";

/**
 * Reusable date range filter component.
 * Pass dateFrom/dateTo state from the parent and this component handles the UI.
 * Dispatches page reset to 1 via onPageReset callback so filters sync with pagination.
 */
export default function DateRangeFilter({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  label = "Date Range",
  className = "",
  resetPage,
}) {
  function handleFrom(v) {
    setDateFrom(v);
    if (resetPage) resetPage();
  }
  function handleTo(v) {
    setDateTo(v);
    if (resetPage) resetPage();
  }
  function clear() {
    setDateFrom("");
    setDateTo("");
    if (resetPage) resetPage();
  }

  const hasActive = dateFrom || dateTo;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs font-medium text-gray-500 whitespace-nowrap hidden sm:inline">
        {label}:
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleFrom(e.target.value)}
          className="input w-full sm:w-36 text-sm"
          placeholder="From"
        />
        <span className="text-gray-400 text-xs">—</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleTo(e.target.value)}
          className="input w-full sm:w-36 text-sm"
          placeholder="To"
        />
      </div>
      {hasActive && (
        <button
          type="button"
          onClick={clear}
          className="text-xs text-primary-600 hover:text-primary-800 hover:underline whitespace-nowrap"
        >
          Clear
        </button>
      )}
    </div>
  );
}
