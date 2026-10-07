"use client";
import { useState, useEffect } from "react";

/**
 * Table-column visibility persisted to localStorage as a Set.
 * Replaces the repeated loadVisibleCols + useState + persist-effect +
 * toggleCol block that was copy-pasted across the Customers, Fabrics,
 * Sales and Purchases pages.
 *
 * `defaultCols` must be a module-level (stable) Set/array.
 */
export function useVisibleCols(storageKey, defaultCols) {
  const [visibleCols, setVisibleCols] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(defaultCols);
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...visibleCols]));
  }, [storageKey, visibleCols]);

  function toggleCol(key) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return { visibleCols, setVisibleCols, toggleCol };
}
