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
