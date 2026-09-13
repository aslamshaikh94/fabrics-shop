import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabase() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return client;
}

// Export the client directly to avoid Proxy issues with async/await
export const supabase = getSupabase();

/**
 * Simple in-memory cache for Supabase queries
 * Reduces redundant network calls for frequently accessed data
 */
const queryCache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

function getCacheKey(table, params) {
  return `${table}:${JSON.stringify(params)}`;
}

/**
 * Retry a Supabase operation with exponential backoff
 * Handles transient network errors gracefully
 */
export async function withRetry(fn, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;
      // Don't retry on auth or validation errors
      if (
        error.code === "PGRST301" ||
        error.code === "42P01" ||
        error.status === 401 ||
        error.status === 403
      ) {
        throw error;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError;
}

/**
 * Safe Supabase query that wraps errors consistently
 */
export async function safeQuery(queryPromise) {
  try {
    const { data, error } = await queryPromise;
    if (error) {
      console.error("Supabase query error:", error);
      return { data: null, error: error.message || "Database error" };
    }
    return { data: data || [], error: null };
  } catch (err) {
    console.error("Supabase unexpected error:", err);
    return { data: null, error: err.message || "Unexpected error" };
  }
}

/**
 * Cached safe query — returns cached data if available and fresh
 * @param {string} table - Table name
 * @param {object} queryFn - Function that builds the query
 * @param {number} ttlMs - Cache TTL in ms (default: 30s)
 */
export async function cachedQuery(table, queryFn, ttlMs = CACHE_TTL) {
  const cacheKey = getCacheKey(table, queryFn?.params || {});

  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return { data: cached.data, error: null, fromCache: true };
  }

  const result = await safeQuery(queryFn());

  if (result.data && !result.error) {
    queryCache.set(cacheKey, {
      data: result.data,
      timestamp: Date.now(),
    });
  }

  return result;
}

/**
 * Clear the query cache (useful after mutations)
 * @param {string} table - Optional: clear only cache for a specific table
 */
export function clearCache(table) {
  if (table) {
    for (const key of queryCache.keys()) {
      if (key.startsWith(`${table}:`)) {
        queryCache.delete(key);
      }
    }
  } else {
    queryCache.clear();
  }
}
