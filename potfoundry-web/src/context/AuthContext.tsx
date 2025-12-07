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
    exportsThisMonth: number;
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

export interface AuthActions {
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signInWithGitHub: () => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
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
        if (!isSupabaseConfigured()) return null;

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
                exportsThisMonth: data.exports_this_month || 0,
                createdAt: data.created_at,
            };
        } catch (err) {
            console.error('[Auth] Error fetching profile:', err);
            return null;
        }
    }, []);

    // Initialize auth state on mount
    useEffect(() => {
        if (!isSupabaseConfigured()) {
            setState(s => ({ ...s, loading: false }));
            return;
        }

        let isMounted = true;

        // Get initial session with error handling
        const initSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('[Auth] Error getting session:', error);
                    if (isMounted) {
                        setState(s => ({ ...s, loading: false, error: error.message }));
                    }
                    return;
                }

                const user = session?.user ?? null;
                const profile = user ? await fetchProfile(user.id) : null;

                if (isMounted) {
                    setState(s => ({
                        ...s,
                        session,
                        user,
                        profile,
                        loading: false,
                    }));
                }
            } catch (err) {
                console.error('[Auth] Failed to initialize session:', err);
                if (isMounted) {
                    setState(s => ({ ...s, loading: false }));
                }
            }
        };

        // Add timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
            if (isMounted) {
                console.warn('[Auth] Session initialization timed out');
                setState(s => {
                    if (s.loading) {
                        return { ...s, loading: false };
                    }
                    return s;
                });
            }
        }, 10000); // 10 second timeout

        initSession();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[Auth] State changed:', event);

                // Skip if not mounted
                if (!isMounted) return;

                const user = session?.user ?? null;
                const profile = user ? await fetchProfile(user.id) : null;

                setState(s => ({
                    ...s,
                    session,
                    user,
                    profile,
                    loading: false,
                }));
            }
        );

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    // Auth actions
    const signInWithEmail = useCallback(async (email: string, password: string) => {
        if (!isSupabaseConfigured()) {
            setState(s => ({ ...s, error: 'Auth not configured' }));
            return;
        }

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
        }
    }, []);

    const signUpWithEmail = useCallback(async (email: string, password: string) => {
        if (!isSupabaseConfigured()) {
            setState(s => ({ ...s, error: 'Auth not configured' }));
            return;
        }

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.signUp({ email, password });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
        } else {
            setState(s => ({ ...s, loading: false, error: null }));
        }
    }, []);

    const signInWithGoogle = useCallback(async () => {
        if (!isSupabaseConfigured()) return;

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
        if (!isSupabaseConfigured()) return;

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
        if (!isSupabaseConfigured()) return;

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

    const resetPassword = useCallback(async (email: string) => {
        if (!isSupabaseConfigured()) return;

        setState(s => ({ ...s, loading: true, error: null }));

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
            setState(s => ({ ...s, loading: false, error: error.message }));
        } else {
            setState(s => ({ ...s, loading: false }));
        }
    }, []);

    const clearError = useCallback(() => {
        setState(s => ({ ...s, error: null }));
    }, []);

    const actions = useMemo<AuthActions>(() => ({
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithGitHub,
        signOut,
        resetPassword,
        clearError,
    }), [signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithGitHub, signOut, resetPassword, clearError]);

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
