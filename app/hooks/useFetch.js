"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  supabase,
  safeQuery,
  withRetry,
  cachedQuery,
  clearCache,
} from "../lib/supabase";

/**
 * Custom hook for fetching data from Supabase
 * Handles loading, error states, automatic refetching, and cleanup
 * Includes in-memory caching to reduce redundant network calls
 */
export function useFetch(table, options = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    select = "*",
    orderBy = null,
    limit = null,
    filter = null,
    dependencies = [],
    useCache = true,
    cacheTtl = 30_000,
  } = options;

  // Track mounted state to avoid state updates after unmount
  const mountedRef = useRef(true);
  // Track request ID to prevent stale responses
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await withRetry(async () => {
        let query = supabase.from(table).select(select);

        if (filter) {
          for (const [key, value] of Object.entries(filter)) {
            if (value && typeof value === "object" && value.operator) {
              query = query[value.operator](key, value.value);
            } else {
              query = query.eq(key, value);
            }
          }
        }

        if (orderBy) {
          query = query.order(orderBy.column, {
            ascending: orderBy.ascending !== false,
          });
        }

        if (limit) {
          query = query.limit(limit);
        }

        // Use cache if enabled
        if (useCache) {
          return cachedQuery(table, () => safeQuery(query), cacheTtl);
        }

        return safeQuery(query);
      });

      // Ignore stale responses from previous requests
      if (mountedRef.current && currentRequestId === requestIdRef.current) {
        if (result.error) {
          setError(result.error);
        } else {
          setData(result.data);
        }
      }
    } catch (err) {
      if (mountedRef.current && currentRequestId === requestIdRef.current) {
        setError(err.message || "Error fetching data");
        console.error(`Error fetching ${table}:`, err);
      }
    } finally {
      if (mountedRef.current && currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [table, select, orderBy, limit, filter, useCache, cacheTtl]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchData, ...dependencies]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Custom hook for fetching a single item with cleanup
 */
export function useFetchOne(table, id, select = "*") {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const currentRequestId = ++requestIdRef.current;

    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await withRetry(async () => {
          return safeQuery(
            supabase.from(table).select(select).eq("id", id).single(),
          );
        });

        if (mountedRef.current && currentRequestId === requestIdRef.current) {
          if (result.error) {
            setError(result.error);
          } else {
            setData(result.data);
          }
        }
      } catch (err) {
        if (mountedRef.current && currentRequestId === requestIdRef.current) {
          setError(err.message || "Error fetching data");
          console.error(`Error fetching ${table} with id ${id}:`, err);
        }
      } finally {
        if (mountedRef.current && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [table, id, select]);

  return { data, loading, error };
}

/**
 * Hook to clear cache after mutations
 * Call clearTableCache(tableName) after insert/update/delete operations
 */
export function useCacheClear() {
  return useCallback((table) => {
    clearCache(table);
  }, []);
}
