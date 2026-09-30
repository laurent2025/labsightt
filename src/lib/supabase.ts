import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseUrl = (() => {
  if (!configuredUrl) return undefined;
  try {
    const parsed = new URL(configuredUrl);
    if (parsed.pathname.replace(/\/+$/, '') === '/rest/v1') parsed.pathname = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return configuredUrl;
  }
})();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
