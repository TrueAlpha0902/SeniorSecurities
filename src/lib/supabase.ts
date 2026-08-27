import { createClient, type User } from "@supabase/supabase-js";

type OptionalViteEnv = Record<string, string | boolean | undefined>;
const viteEnv = ((import.meta as ImportMeta & { env?: OptionalViteEnv }).env ?? {}) as OptionalViteEnv;

const supabaseUrl = String(viteEnv.VITE_SUPABASE_URL ?? "").trim();
const supabaseKey = String(
  viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? viteEnv.VITE_SUPABASE_ANON_KEY
  ?? "",
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

export function createEphemeralAuthClient() {
  if (!isSupabaseConfigured) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export type AuthUser = User;
