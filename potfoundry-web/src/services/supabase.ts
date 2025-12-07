/**
 * Supabase Client Configuration
 * 
 * This file creates and exports the Supabase client instance
 * configured with environment variables.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables (set in Cloudflare Pages)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        '[Supabase] Missing environment variables. Auth features will be disabled.',
        '\nSet VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
    );
}

// Create and export the Supabase client
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});

// Helper to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
    return Boolean(supabaseUrl && supabaseAnonKey);
};

// Export for type safety
export type { SupabaseClient };
