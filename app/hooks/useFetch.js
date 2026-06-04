"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

/**
 * Custom hook for fetching data from Supabase
 * Handles loading, error states, and automatic refetching
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

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(table).select(select);

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          if (value.operator) {
            query = query[value.operator](key, value.value);
          } else {
            query = query.eq(key, value);
          }
        });
      }

      if (orderBy) {
        query = query.order(orderBy.column, {
          ascending: orderBy.ascending !== false,
        });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data: result, error: err } = await query;

      if (err) throw err;
      setData(result || []);
    } catch (err) {
      setError(err.message);
      console.error(`Error fetching ${table}:`, err);
    } finally {
      setLoading(false);
    }
  }, [table, select, orderBy, limit, filter]);

  useEffect(() => {
    fetch();
  }, [fetch, ...dependencies]);

  return { data, loading, error, refetch: fetch };
}

/**
 * Custom hook for fetching a single item
 */
export function useFetchOne(table, id, select = "*") {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: result, error: err } = await supabase
          .from(table)
          .select(select)
          .eq("id", id)
          .single();

        if (err) throw err;
        setData(result);
      } catch (err) {
        setError(err.message);
        console.error(`Error fetching ${table} with id ${id}:`, err);
      } finally {
        setLoading(false);
      }
    })();
  }, [table, id, select]);

  return { data, loading, error };
}
