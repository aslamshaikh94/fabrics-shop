"use client";
import { useState, useEffect, useMemo } from "react";

/**
 * Client-side pagination over an already-filtered list.
 *
 * Replaces the repeated `page/setPage + reset-on-filter-change effect +
 * Math.ceil + slice` block that was copy-pasted across every list page.
 *
 * `resetDeps` — values that should reset pagination back to page 1 when they
 * change (search terms, filters, …). Pass a stable array (it is spread into
 * the effect deps).
 *
 * Also clamps `page` when the filtered list shrinks below the current page —
 * the old pattern left you stuck on an empty out-of-range page.
 */
export function usePagedList(items, pageSize, resetDeps = []) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginated = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return {
    page: safePage,
    setPage,
    paginated,
    totalPages,
    total,
  };
}
