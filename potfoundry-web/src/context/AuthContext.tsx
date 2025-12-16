/**
 * Authentication Context
 * 
 * Provides authentication state and actions throughout the app.
 * Uses Supabase Auth for user management.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';

// ============================================================================
// Types
// ============================================================================

export interface UserProfile {
    id: string;
    email: string;
    displayName?: string;
    avatarUrl?: string;
    subscriptionTier: 'free' | 'pro';
    subscriptionStatus: 'none' | 'active' | 'past_due' | 'canceled' | 'paused' | 'trialing';
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionPeriodEnd?: string;
    cancelAtPeriodEnd: boolean;
    exportsThisMonth: number;
    totalExports: number;
    createdAt: string;
}

export interface AuthState {
    user: User | null;
    profile: UserProfile | null;
    session: Session | null;
    loading: boolean;
    error: string | null;
    isConfigured: boolean;
}

/** Result returned from auth actions for modal handling */
export interface AuthResult {
    success: boolean;
    error?: string;
}

export interface AuthActions {
    signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
    signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
    signInWithGoogle: () => Promise<void>;
    signInWithGitHub: () => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<AuthResult>;
    refreshProfile: () => Promise<void>;
    clearError: () => void;
}

export interface AuthContextValue {
    state: AuthState;
    actions: AuthActions;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AuthState>({
        user: null,
        profile: null,
        session: null,
        loading: true,
        error: null,
        isConfigured: isSupabaseConfigured(),
    });

    // Fetch user profile from database
    const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
        if (!isSupabaseConfigured() || !supabase) return null;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('[Auth] Failed to fetch profile:', error);
                return null;
            }

            return {
                id: data.id,
                email: data.email,
                displayName: data.display_name,
                avatarUrl: data.avatar_url,
                subscriptionTier: data.subscription_tier || 'free',
                subscriptionStatus: data.subscription_status || 'none',
                stripeCustomerId: data.stripe_customer_id,
                stripeSubscriptionId: data.stripe_subscription_id,
                subscriptionPeriodEnd: data.subscription_period_end,
                cancelAtPeriodEnd: data.cancel_at_period_end || false,
                exportsThisMonth: data.exports_this_month || 0,
                totalExports: data.total_exports || 0,
                createdAt: data.created_at,
            };
        } catch (err) {
            console.error('[Auth] Error fetching profile:', err);
            return null;
        }
    }, []);

    // Initialize auth state on mount
    // CRITICAL FIX: Use onAuthStateChange as single source of truth
    // This eliminates the race condition that caused mobile OAuth failures.
    // The listener fires INITIAL_SESSION immediately with current session from storage/URL.
    useEffect(() => {
        if (!isSupabaseConfigured() || !supabase) {
            setState(s => ({ ...s, loading: false }));
            return;
        }

        let isMounted = true;
        let initialEventReceived = false;

        // Timeout helper for profile fetches
        const timeout = <T,>(ms: number, promise: Promise<T>): Promise<T | null> =>
            Promise.race([
                promise,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
            ]);

        // Failsafe timeout - ensures loading ALWAYS stops within 5 seconds
        // This only triggers if onAuthStateChange never fires (shouldn't happen)
        const failsafeTimeout = setTimeout(() => {
            if (isMounted && !initialEventReceived) {
                console.warn('[Auth] Failsafe timeout triggered - no auth event received');
                setState(s => {
                    if (s.loading) {
                        return { ...s, loading: false };
                    }
                    return s;
                });
            }
        }, 5000);

        // CRITICAL: Set up auth listener FIRST, before any other auth operations
        // Per Supabase docs, onAuthStateChange fires INITIAL_SESSION immediately
        // with current session from localStorage or URL fragments (OAuth callback)
        console.log('[Auth] Setting up auth state listener...');

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[Auth] Auth event:', event, session?.user?.email);

                if (!isMounted) return;

                // Mark that we received an event (for failsafe timeout)
                initialEventReceived = true;

                const user = session?.user ?? null;

                // Fetch profile in background, don't block UI
                let profile = null;
                if (user) {
                    try {
                        profile = await timeout(2000, fetchProfile(user.id));
                    } catch {
                        console.warn('[Auth] Profile fetch failed, continuing without profile');
                    }
                }

                setState(s => ({
                    ...s,
                    session,
                    user,
                    profile,
                    loading: false,
                    error: null,
                }));

                // Log successful auth for debugging mobile issues
                if (event === 'SIGNED_IN') {
                    console.log('[Auth] Sign-in complete for:', user?.email);
                } else if (event === 'INITIAL_SESSION') {
                    console.log('[Auth] Initial session loaded:', user ? user.email : 'no session');
                }
            }
        );

        return () => {
            isMounted = false;
            clearTimeout(failsafeTimeout);
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    // Auth actions
    const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
        if (!isSupabaseConfigured() || !supabase) {
            const errorMsg = 'Auth not configured';
            setState(s => ({ ...s, error: errorMsg }));
            return { success: false, error: errorMsg };
        }

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
            return { success: false, error: error.message };
        }
        return { success: true };
    }, []);

    const signUpWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
        if (!isSupabaseConfigured() || !supabase) {
            const errorMsg = 'Auth not configured';
            setState(s => ({ ...s, error: errorMsg }));
            return { success: false, error: errorMsg };
        }

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.signUp({ email, password });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
            return { success: false, error: error.message };
        }
        setState(s => ({ ...s, loading: false, error: null }));
        return { success: true };
    }, []);

    const signInWithGoogle = useCallback(async () => {
        if (!isSupabaseConfigured() || !supabase) return;

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
        }
    }, []);

    const signInWithGitHub = useCallback(async () => {
        if (!isSupabaseConfigured() || !supabase) return;

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
                redirectTo: window.location.origin,
            },
        });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
        }
    }, []);

    const signOut = useCallback(async () => {
        if (!isSupabaseConfigured() || !supabase) return;

        setState(s => ({ ...s, loading: true }));

        const { error } = await supabase.auth.signOut();

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
        } else {
            setState(s => ({
                ...s,
                user: null,
                profile: null,
                session: null,
                loading: false,
            }));
        }
    }, []);

    const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
        if (!isSupabaseConfigured() || !supabase) {
            const errorMsg = 'Auth not configured';
            return { success: false, error: errorMsg };
        }

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
            return { success: false, error: error.message };
        }
        setState(s => ({ ...s, loading: false }));
        return { success: true };
    }, []);

    const clearError = useCallback(() => {
        setState(s => ({ ...s, error: null }));
    }, []);

    const refreshProfile = useCallback(async () => {
        if (!state.user) {
            console.log('[Auth] refreshProfile: No user, skipping');
            return;
        }

        console.log('[Auth] refreshProfile: Fetching profile for', state.user.id);

        try {
            const profile = await fetchProfile(state.user.id);

            if (profile) {
                console.log('[Auth] refreshProfile: Got profile, tier:', profile.subscriptionTier);
                setState(s => ({ ...s, profile }));
            } else {
                // Don't clear existing profile if fetch fails
                console.warn('[Auth] refreshProfile: Failed to fetch, keeping existing profile');
            }
        } catch (err) {
            console.error('[Auth] refreshProfile: Error, keeping existing profile:', err);
            // Don't modify state on error - keep existing profile
        }
    }, [state.user, fetchProfile]);

    const actions = useMemo<AuthActions>(() => ({
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithGitHub,
        signOut,
        resetPassword,
        refreshProfile,
        clearError,
    }), [signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithGitHub, signOut, resetPassword, refreshProfile, clearError]);

    const value = useMemo<AuthContextValue>(() => ({
        state,
        actions,
    }), [state, actions]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// ============================================================================
// Hooks
// ============================================================================

export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const useUser = () => {
    const { state } = useAuth();
    return state.user;
};

export const useProfile = () => {
    const { state } = useAuth();
    return state.profile;
};

export const useIsAuthenticated = () => {
    const { state } = useAuth();
    return Boolean(state.user);
};

export const useIsPro = () => {
    const { state } = useAuth();
    return state.profile?.subscriptionTier === 'pro';
};

export const useAuthActions = () => {
    const { actions } = useAuth();
    return actions;
};
