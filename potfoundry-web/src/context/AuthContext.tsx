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

        // Get initial session with error handling and recovery
        const initSession = async () => {
            try {
                console.log('[Auth] Initializing session...');
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('[Auth] Error getting session:', error);
                    // Try to clear corrupted session and sign out
                    try {
                        await supabase.auth.signOut();
                        console.log('[Auth] Cleared corrupted session');
                    } catch (clearError) {
                        console.warn('[Auth] Failed to clear session:', clearError);
                    }
                    if (isMounted) {
                        setState(s => ({ ...s, loading: false, user: null, session: null, profile: null }));
                    }
                    return;
                }

                // If we have a session, try to refresh it to ensure it's valid
                if (session) {
                    console.log('[Auth] Session found, verifying...');
                    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

                    if (refreshError) {
                        console.warn('[Auth] Session refresh failed, clearing:', refreshError);
                        await supabase.auth.signOut();
                        if (isMounted) {
                            setState(s => ({ ...s, loading: false, user: null, session: null, profile: null }));
                        }
                        return;
                    }

                    const user = refreshedSession?.user ?? null;
                    const profile = user ? await fetchProfile(user.id) : null;
                    console.log('[Auth] Session verified, user:', user?.email);

                    if (isMounted) {
                        setState(s => ({
                            ...s,
                            session: refreshedSession,
                            user,
                            profile,
                            loading: false,
                        }));
                    }
                } else {
                    // No session
                    console.log('[Auth] No session found');
                    if (isMounted) {
                        setState(s => ({ ...s, loading: false }));
                    }
                }
            } catch (err) {
                console.error('[Auth] Failed to initialize session:', err);
                // Clear any corrupted state
                try {
                    await supabase.auth.signOut();
                } catch {
                    // Ignore signout errors
                }
                if (isMounted) {
                    setState(s => ({ ...s, loading: false, user: null, session: null, profile: null }));
                }
            }
        };

        // Shorter timeout - 5 seconds
        const timeoutId = setTimeout(() => {
            if (isMounted) {
                console.warn('[Auth] Session initialization timed out, clearing state');
                setState(s => {
                    if (s.loading) {
                        return { ...s, loading: false, user: null, session: null, profile: null };
                    }
                    return s;
                });
            }
        }, 5000);

        initSession();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[Auth] State changed:', event, session?.user?.email);

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
