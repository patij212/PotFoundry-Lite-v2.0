/**
 * Export Tier Check Hook
 * 
 * Checks user's subscription tier and enforces export limits for free users.
 * Free tier: 10 exports/month with watermark, limited resolution
 * Pro tier: Unlimited exports, no watermark, max resolution
 */

import { useCallback } from 'react';
import { useIsPro, useProfile } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export interface ExportTierCheck {
    canExport: boolean;
    isPro: boolean;
    exportsRemaining: number | null; // null = unlimited (Pro)
    totalExports: number;
    showUpgradePrompt: boolean;
    reason: string | null;
}

export interface UseExportTierResult {
    /** Check if user can export */
    checkExportAllowed: () => ExportTierCheck;
    /** Record an export (for free tier tracking) */
    recordExport: () => Promise<void>;
    /** Get current exports this month */
    exportsThisMonth: number;
    /** Whether user is Pro */
    isPro: boolean;
    /** Whether auth is configured */
    isAuthConfigured: boolean;
}

const FREE_TIER_MONTHLY_LIMIT = 10;
const FREE_TIER_MAX_N_THETA = 84;
const FREE_TIER_MAX_N_Z = 42;

/**
 * Hook for checking export permissions based on subscription tier
 */
export function useExportTier(): UseExportTierResult {
    const profile = useProfile();
    const isPro = useIsPro();
    const isAuthConfigured = isSupabaseConfigured();

    const exportsThisMonth = profile?.exportsThisMonth ?? 0;
    const totalExports = profile?.totalExports ?? 0;

    /**
     * Check if user can export
     */
    const checkExportAllowed = useCallback((): ExportTierCheck => {
        // If auth is not configured, allow exports (dev mode)
        if (!isAuthConfigured) {
            return {
                canExport: true,
                isPro: false,
                exportsRemaining: null,
                totalExports: 0,
                showUpgradePrompt: false,
                reason: null,
            };
        }

        // Pro users: unlimited
        if (isPro) {
            return {
                canExport: true,
                isPro: true,
                exportsRemaining: null,
                totalExports,
                showUpgradePrompt: false,
                reason: null,
            };
        }

        // Free users: check monthly limit
        const remaining = FREE_TIER_MONTHLY_LIMIT - exportsThisMonth;

        if (remaining <= 0) {
            return {
                canExport: false,
                isPro: false,
                exportsRemaining: 0,
                totalExports,
                showUpgradePrompt: true,
                reason: 'You have reached your monthly export limit. Upgrade to Pro for unlimited exports!',
            };
        }

        // Free user can export, but show warning if low
        return {
            canExport: true,
            isPro: false,
            exportsRemaining: remaining,
            totalExports,
            showUpgradePrompt: remaining <= 3,
            reason: remaining <= 3
                ? `Only ${remaining} exports remaining this month`
                : null,
        };
    }, [isAuthConfigured, isPro, exportsThisMonth, totalExports]);

    /**
     * Record an export for the current user
     */
    const recordExport = useCallback(async (): Promise<void> => {
        // Skip if auth not configured or no profile
        // (We now track ALL users, including Pro, for stats)
        if (!isAuthConfigured || !profile) {
            console.log('[ExportTier] Skipping record:', { isAuthConfigured, hasProfile: !!profile });
            return;
        }

        try {
            console.log('[ExportTier] Recording export for user:', profile.id, 'Current count:', profile.exportsThisMonth);

            // Use RPC call to secure increment_exports() function
            // This function uses auth.uid() internally so users can only increment their own count
            const { data, error } = await supabase.rpc('increment_exports');

            if (error) {
                console.error('[ExportTier] Failed to record export:', error);
            } else {
                console.log('[ExportTier] Export recorded successfully. New count:', data);
            }
        } catch (error) {
            console.error('[ExportTier] Failed to record export:', error);
        }
    }, [isAuthConfigured, isPro, profile]);

    return {
        checkExportAllowed,
        recordExport,
        exportsThisMonth,
        isPro,
        isAuthConfigured,
    };
}

/**
 * Get export quality limits for the user's tier
 */
export function getExportQualityLimits(isPro: boolean): {
    maxNTheta: number;
    maxNZ: number;
    addWatermark: boolean;
} {
    if (isPro) {
        return {
            maxNTheta: 999, // Unlimited
            maxNZ: 999,
            addWatermark: false,
        };
    }

    return {
        maxNTheta: FREE_TIER_MAX_N_THETA,
        maxNZ: FREE_TIER_MAX_N_Z,
        addWatermark: true,
    };
}

export { FREE_TIER_MONTHLY_LIMIT, FREE_TIER_MAX_N_THETA, FREE_TIER_MAX_N_Z };
