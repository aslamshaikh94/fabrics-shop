"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, safeQuery, withRetry } from "../lib/supabase";

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
      const result = await safeQuery(query);
      if (mountedRef.current) {
        if (result.error) {
          setError(result.error);
          onError?.(result.error);
        } else {
          setData(result.data || []);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || "Error fetching data");
        onError?.(err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [table, select, orderBy, filter, onError]);

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

/**
 * Hook for file uploads to Supabase storage
 */
export function useFileUpload(bucket) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const upload = useCallback(
    async (file, pathPrefix = "") => {
      if (!file) return "";
      setUploading(true);
      setError(null);
      try {
        const ext = file.name.split(".").pop();
        const path = pathPrefix
          ? `${pathPrefix}/${Date.now()}.${ext}`
          : `${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from(bucket).getPublicUrl(path);
        return publicUrl;
      } catch (err) {
        setError(err.message || "Upload failed");
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [bucket],
  );

  const removeFile = useCallback(
    async (url) => {
      if (!url) return;
      try {
        const path = url.split("/").pop();
        await supabase.storage.from(bucket).remove([path]);
      } catch (err) {
        console.error("Error removing file:", err);
      }
    },
    [bucket],
  );

  return {
    upload,
    removeFile,
    uploading,
    error,
    clearError: () => setError(null),
  };
}
