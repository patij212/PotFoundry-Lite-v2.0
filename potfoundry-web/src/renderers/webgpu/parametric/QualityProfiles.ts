/**
 * QualityProfiles — Tolerance-based export quality profiles.
 *
 * Defines quality profiles (draft, standard, high, ultra) as tolerance bundles
 * rather than triangle-count bundles. Triangle budget is retained only as a
 * safety cap — quality is measured by geometric error bounds.
 *
 * @see docs/plans/2026-02-24-parametric-pipeline-modular-redesign.md
 */

import type { ExportTolerances, QualityProfile, QualityProfileName } from './types';

// ============================================================================
// Profile Definitions
// ============================================================================

/**
 * Draft profile — fast preview exports for design iteration.
 * Loose tolerances, minimal refinement.
 */
const DRAFT: QualityProfile = {
    name: 'draft',
    tolerances: {
        epsPosMm: 0.12,
        epsNormalDeg: 8.0,
        epsFeatureMm: 0.10,
        minTriangleAngleDeg: 15,
        maxAspectRatio: 12.0,
    },
    maxTriangleBudget: 500_000,
    maxRefineIterations: 0,
    description: 'Fast preview — loose tolerances, no adaptive refinement',
};

/**
 * Standard profile — balanced quality for FDM printing.
 * Moderate tolerances, 1-2 refinement passes.
 */
const STANDARD: QualityProfile = {
    name: 'standard',
    tolerances: {
        epsPosMm: 0.08,
        epsNormalDeg: 6.0,
        epsFeatureMm: 0.06,
        minTriangleAngleDeg: 18,
        maxAspectRatio: 10.0,
    },
    maxTriangleBudget: 2_000_000,
    maxRefineIterations: 2,
    description: 'Balanced quality for FDM printing',
};

/**
 * High profile — high-fidelity for detailed FDM and draft SLA.
 * Tight tolerances, multiple refinement passes.
 */
const HIGH: QualityProfile = {
    name: 'high',
    tolerances: {
        epsPosMm: 0.05,
        epsNormalDeg: 4.0,
        epsFeatureMm: 0.04,
        minTriangleAngleDeg: 20,
        maxAspectRatio: 8.0,
    },
    maxTriangleBudget: 4_000_000,
    maxRefineIterations: 4,
    description: 'High-fidelity for detailed FDM and draft SLA',
};

/**
 * Ultra profile — maximum fidelity for SLA/resin printing.
 * Strictest tolerances, maximum refinement.
 */
const ULTRA: QualityProfile = {
    name: 'ultra',
    tolerances: {
        epsPosMm: 0.03,
        epsNormalDeg: 3.0,
        epsFeatureMm: 0.02,
        minTriangleAngleDeg: 22,
        maxAspectRatio: 6.0,
    },
    maxTriangleBudget: 8_000_000,
    maxRefineIterations: 6,
    description: 'Maximum fidelity for SLA/resin printing',
};

// ============================================================================
// Profile Registry
// ============================================================================

/** All available quality profiles, keyed by name. */
export const QUALITY_PROFILES: Readonly<Record<QualityProfileName, QualityProfile>> = {
    draft: DRAFT,
    standard: STANDARD,
    high: HIGH,
    ultra: ULTRA,
} as const;

/** Ordered list of profile names from lowest to highest quality. */
export const PROFILE_QUALITY_ORDER: readonly QualityProfileName[] = [
    'draft', 'standard', 'high', 'ultra',
] as const;

// ============================================================================
// Profile Utilities
// ============================================================================

/**
 * Look up a quality profile by name.
 *
 * @param name - Profile name (case-insensitive).
 * @returns The matching QualityProfile.
 * @throws Error if the profile name is unknown.
 */
export function getQualityProfile(name: string): QualityProfile {
    const normalized = name.toLowerCase().trim() as QualityProfileName;
    const profile = QUALITY_PROFILES[normalized];
    if (!profile) {
        const validNames = Object.keys(QUALITY_PROFILES).join(', ');
        throw new Error(`Unknown quality profile "${name}". Valid profiles: ${validNames}`);
    }
    return profile;
}

/**
 * Resolve effective tolerances from export params.
 *
 * Priority:
 * 1. Explicit tolerance overrides in params
 * 2. Named quality profile defaults
 * 3. 'standard' profile defaults (fallback)
 *
 * @param params - Export configuration with optional profile/tolerance overrides.
 * @returns Fully resolved tolerance values.
 */
export function resolveTolerances(params: {
    qualityProfile?: QualityProfileName;
    toleranceOverrides?: Partial<ExportTolerances>;
}): ExportTolerances {
    const profile = getQualityProfile(params.qualityProfile ?? 'standard');
    const base = profile.tolerances;

    if (!params.toleranceOverrides) return { ...base };

    return {
        epsPosMm: params.toleranceOverrides.epsPosMm ?? base.epsPosMm,
        epsNormalDeg: params.toleranceOverrides.epsNormalDeg ?? base.epsNormalDeg,
        epsFeatureMm: params.toleranceOverrides.epsFeatureMm ?? base.epsFeatureMm,
        minTriangleAngleDeg: params.toleranceOverrides.minTriangleAngleDeg ?? base.minTriangleAngleDeg,
        maxAspectRatio: params.toleranceOverrides.maxAspectRatio ?? base.maxAspectRatio,
    };
}

/**
 * Resolve the effective triangle budget.
 *
 * Uses explicit target if provided, otherwise falls back to the profile's
 * maxTriangleBudget. The budget is always capped by the profile maximum.
 *
 * @param targetTriangles - Explicit triangle target (optional).
 * @param profile - Quality profile for budget defaults and caps.
 * @returns The effective triangle budget.
 */
export function resolveTriangleBudget(
    targetTriangles: number | undefined,
    profile: QualityProfile,
): number {
    if (targetTriangles !== undefined) {
        return Math.min(targetTriangles, profile.maxTriangleBudget);
    }
    return profile.maxTriangleBudget;
}

/**
 * Determine the next lower quality profile for graceful degradation.
 *
 * When a higher profile fails (e.g., memory exceeded), this picks the
 * next lower profile in the quality ladder.
 *
 * @param current - Current profile name.
 * @returns The next lower profile name, or null if already at 'draft'.
 */
export function downgradeProfile(current: QualityProfileName): QualityProfileName | null {
    const idx = PROFILE_QUALITY_ORDER.indexOf(current);
    if (idx <= 0) return null;
    return PROFILE_QUALITY_ORDER[idx - 1];
}

/**
 * Check whether tolerances pass for a given set of measured metrics.
 *
 * @param tolerances - Target tolerance thresholds.
 * @param measured - Actual measured values from the mesh.
 * @returns Object with per-metric pass/fail and overall result.
 */
export function checkTolerances(
    tolerances: ExportTolerances,
    measured: {
        maxPosErrorMm?: number;
        maxNormalErrorDeg?: number;
        maxFeatureDriftMm?: number;
        minAngleDeg?: number;
        maxAspectRatio?: number;
    },
): { passed: boolean; details: Record<string, { target: number; actual: number; passed: boolean }> } {
    const details: Record<string, { target: number; actual: number; passed: boolean }> = {};

    if (measured.maxPosErrorMm !== undefined) {
        details.positionError = {
            target: tolerances.epsPosMm,
            actual: measured.maxPosErrorMm,
            passed: measured.maxPosErrorMm <= tolerances.epsPosMm,
        };
    }
    if (measured.maxNormalErrorDeg !== undefined) {
        details.normalError = {
            target: tolerances.epsNormalDeg,
            actual: measured.maxNormalErrorDeg,
            passed: measured.maxNormalErrorDeg <= tolerances.epsNormalDeg,
        };
    }
    if (measured.maxFeatureDriftMm !== undefined) {
        details.featureDrift = {
            target: tolerances.epsFeatureMm,
            actual: measured.maxFeatureDriftMm,
            passed: measured.maxFeatureDriftMm <= tolerances.epsFeatureMm,
        };
    }
    if (measured.minAngleDeg !== undefined) {
        details.minAngle = {
            target: tolerances.minTriangleAngleDeg,
            actual: measured.minAngleDeg,
            passed: measured.minAngleDeg >= tolerances.minTriangleAngleDeg,
        };
    }
    if (measured.maxAspectRatio !== undefined) {
        details.aspectRatio = {
            target: tolerances.maxAspectRatio,
            actual: measured.maxAspectRatio,
            passed: measured.maxAspectRatio <= tolerances.maxAspectRatio,
        };
    }

    const passed = Object.values(details).every(d => d.passed);
    return { passed, details };
}
