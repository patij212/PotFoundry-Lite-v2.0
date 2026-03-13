/**
 * Supabase Client Configuration
 * 
 * This file creates and exports the Supabase client instance
 * configured with environment variables.
 * 
 * When running without Supabase configured (local dev), exports null.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables (set in Cloudflare Pages)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Helper to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
    return Boolean(supabaseUrl && supabaseAnonKey);
};

// Create the Supabase client only if configured
let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            // CRITICAL: Use PKCE flow for mobile OAuth support
            // This stores a code_verifier in localStorage that's required for
            // exchanging the authorization code after OAuth redirect
            flowType: 'pkce',
        },
    });
} else {
    console.warn(
        '[Supabase] Missing environment variables. Auth features will be disabled.',
        '\nSet VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
    );
}

// Export the client (may be null if not configured)
export const supabase = supabaseInstance;

/**
 * Safe Supabase accessor that throws if client is not configured.
 * 
 * Use this instead of directly accessing `supabase` to ensure compile-time
 * and runtime safety. Always check `isSupabaseConfigured()` in UI code before
 * calling functions that depend on safeSupabase().
 * 
 * @example
 * ```ts
 * // In a hook or service that requires Supabase:
 * const client = safeSupabase();
 * const { data } = await client.from('users').select();
 * ```
 * 
 * @throws {Error} If Supabase is not configured (missing env vars)
 * @returns {SupabaseClient} The configured Supabase client
 */
export function safeSupabase(): SupabaseClient {
    if (!supabaseInstance) {
        throw new Error(
            '[Supabase] Client not configured. ' +
            'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment. ' +
            'Check isSupabaseConfigured() before calling this function.'
        );
    }
    return supabaseInstance;
}

// Export for type safety
export type { SupabaseClient };
