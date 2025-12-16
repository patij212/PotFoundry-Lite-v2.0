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

// Export for type safety
export type { SupabaseClient };
