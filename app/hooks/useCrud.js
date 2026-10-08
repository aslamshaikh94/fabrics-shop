"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, safeQuery } from "../lib/supabase";

/**
 * Reusable hook for common CRUD operations on a Supabase table.
 * Handles fetch, create, update, delete with loading/error states.
 */
export function useCrud(table, options = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const {
    select = "*",
    orderBy = null,
    filter = null,
    dependencies = [],
    onError,
  } = options;

  const orderByRef = useRef(orderBy);
  const filterRef = useRef(filter);
  const onErrorRef = useRef(onError);
  orderByRef.current = orderBy;
  filterRef.current = filter;
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(table).select(select);
      if (filterRef.current) {
        for (const [key, value] of Object.entries(filterRef.current)) {
          if (value && typeof value === "object" && value.operator) {
            query = query[value.operator](key, value.value);
          } else {
            query = query.eq(key, value);
          }
        }
      }
      if (orderByRef.current) {
        query = query.order(orderByRef.current.column, {
          ascending: orderByRef.current.ascending !== false,
        });
      }
      const result = await safeQuery(query);
      if (mountedRef.current) {
        if (result.error) {
          setError(result.error);
          onErrorRef.current?.(result.error);
        } else {
          setData(result.data || []);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Error fetching data");
        onErrorRef.current?.(err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [table, select]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, ...dependencies]);

  const create = useCallback(
    async (payload) => {
      const { data: newItem, error } = await supabase
        .from(table)
        .insert(Array.isArray(payload) ? payload : [payload])
        .select();
      if (error) throw error;
      if (newItem) {
        setData((prev) => [...newItem, ...prev]);
      }
      return newItem;
    },
    [table],
  );

  const update = useCallback(
    async (id, payload) => {
      const { data: updated, error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", id)
        .select();
      if (error) throw error;
      if (updated) {
        setData((prev) =>
          prev.map((item) => (item.id === id ? updated[0] : item)),
        );
      }
      return updated;
    },
    [table],
  );

  const remove = useCallback(
    async (id) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      setData((prev) => prev.filter((item) => item.id !== id));
    },
    [table],
  );

  return {
    data,
    loading,
    error,
    refetch: fetchAll,
    setData,
    create,
    update,
    remove,
  };
}
