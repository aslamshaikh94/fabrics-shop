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
