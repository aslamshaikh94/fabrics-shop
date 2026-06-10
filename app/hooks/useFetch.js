"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, safeQuery, withRetry } from "../lib/supabase";

/**
 * Custom hook for fetching data from Supabase
 * Handles loading, error states, automatic refetching, and cleanup
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
  } = options;

  // Track mounted state to avoid state updates after unmount
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
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

        return safeQuery(query);
      });

      if (mountedRef.current) {
        if (result.error) {
          setError(result.error);
        } else {
          setData(result.data);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Error fetching data");
        console.error(`Error fetching ${table}:`, err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [table, select, orderBy, limit, filter]);

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

  useEffect(() => {
    mountedRef.current = true;

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

        if (mountedRef.current) {
          if (result.error) {
            setError(result.error);
          } else {
            setData(result.data);
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message || "Error fetching data");
          console.error(`Error fetching ${table} with id ${id}:`, err);
        }
      } finally {
        if (mountedRef.current) {
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
