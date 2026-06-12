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

/** Hard export ceiling: keep binary STL output below 1 GiB. */
export const MAX_BINARY_STL_BYTES = 1024 * 1024 * 1024;

/** Maximum triangle count that fits in a binary STL below 1 GiB. */
export const MAX_BINARY_STL_TRIANGLES = Math.floor((MAX_BINARY_STL_BYTES - 84) / 50);

/**
 * The default profile for the EXPORT pipeline when the caller did not pick one.
 * 'high' — every export button produces the high-fidelity result by default
 * (~1mm visual facets, sub-printer chord error); the live preview has its own
 * budgets. Single source of truth: ParametricExportComputer.compute() and the
 * UI export buttons must all resolve through this constant so the default can
 * never fork again (it previously forked 'standard' vs 'high' inside compute).
 */
export const DEFAULT_EXPORT_QUALITY_PROFILE: QualityProfileName = 'high';

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
        maxAspectRatio: 24.0,    // R/r metric: equilateral=2, sliver→∞
    },
    maxTriangleBudget: 500_000,
    // MEASURED 2026-06-10 (default dims): 4mm edge cap ≈ today's coarse look;
    // 256-ring keeps draft fast (90-403k tris at 8/256, draft sits between).
    maxEdgeMm: 4,
    nRing: 256,
    maxRefineIterations: 1,
    qualityIterations: 1,
    description: 'Fast preview — ~4mm facets, <0.5M tris, seconds; design iteration only',
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
        maxAspectRatio: 20.0,    // R/r metric: equilateral=2, sliver→∞
    },
    maxTriangleBudget: 2_000_000,
    // MEASURED 2026-06-10: edge 2mm / 512-ring → 272-558k tris, ~2mm facets,
    // topo zeros + sliver=0 — comfortably under the 2M cap.
    maxEdgeMm: 2,
    nRing: 512,
    maxRefineIterations: 4,
    qualityIterations: 2,
    description: 'Balanced FDM — ~2mm facets, ~0.3-0.6M tris, fast builds',
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
        maxAspectRatio: 16.0,    // R/r metric: equilateral=2, sliver→∞
    },
    // MEASURED 2026-06-10: edge 1mm / 1024-ring → 807k-1.02M tris (~40-50MB
    // STL), ~1-1.4mm max facets (p99 ~1mm), builds 17-27s, topo zeros. Budget
    // raised 4M → 6M so the cap never coarsens a clean 1mm-edge build on
    // feature-dense styles.
    maxTriangleBudget: 6_000_000,
    maxEdgeMm: 1,
    nRing: 1024,
    maxRefineIterations: 8,
    qualityIterations: 3,
    description: '~1mm facets, ~1M tris, ~30s — detailed FDM (export default)',
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
        maxAspectRatio: 12.0,    // R/r metric: equilateral=2, sliver→∞
    },
    // MEASURED 2026-06-10: edge 0.5mm / 2048-ring → 2.66-3.1M tris (133-155MB
    // STL), facets p99 0.49-0.8mm, crest chord ≤0.007mm, builds 100-130s.
    // Budget raised 8M → 12M (headroom for feature-dense styles; still well
    // under MAX_BINARY_STL_TRIANGLES ≈ 21.4M). Edge 0.3mm was probed and
    // exceeds the 5-min build envelope — 0.5mm is the ultra ceiling.
    maxTriangleBudget: 12_000_000,
    maxEdgeMm: 0.5,
    nRing: 2048,
    maxRefineIterations: 12,
    qualityIterations: 4,
    description: '≤0.5-0.8mm facets, ~3M tris, ~2min — resin/SLA, sub-printer-resolution everywhere',
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
 * 3. DEFAULT_EXPORT_QUALITY_PROFILE ('high') — the SAME fallback the export
 *    pipeline uses, so a direct caller can never silently get looser
 *    tolerances than an unparameterized export would.
 *
 * @param params - Export configuration with optional profile/tolerance overrides.
 * @returns Fully resolved tolerance values.
 */
export function resolveTolerances(params: {
    qualityProfile?: QualityProfileName;
    toleranceOverrides?: Partial<ExportTolerances>;
}): ExportTolerances {
    const profile = getQualityProfile(params.qualityProfile ?? DEFAULT_EXPORT_QUALITY_PROFILE);
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
 * Resolve the effective surface-error (sag) target in mm for the conforming
 * mesher: an explicit per-export tolerance override (the dialog's
 * surface-error slider) WINS over the profile default. Extracted as a pure
 * seam because the conforming branch previously read ONLY the profile value,
 * leaving the dialog's surface-error control dead (user-reported 2026-06-12).
 *
 * @param profile - The resolved quality profile (its epsPosMm is the default).
 * @param toleranceOverrides - Optional explicit overrides from the export dialog.
 * @returns The sag target in mm the sizing field must honor.
 */
export function resolveSurfaceErrorMm(
    profile: QualityProfile,
    toleranceOverrides?: Partial<ExportTolerances>,
): number {
    const override = toleranceOverrides?.epsPosMm;
    return typeof override === 'number' && override > 0 ? override : profile.tolerances.epsPosMm;
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
 * Build the full deterministic downgrade ladder from a starting profile.
 *
 * Examples:
 * - ultra -> [ultra, high, standard, draft]
 * - high  -> [high, standard, draft]
 * - draft -> [draft]
 *
 * @param start - Requested quality profile.
 * @returns Ordered fallback sequence from highest attempt to lowest.
 */
export function buildDowngradeLadder(start: QualityProfileName): readonly QualityProfileName[] {
    const idx = PROFILE_QUALITY_ORDER.indexOf(start);
    if (idx < 0) {
        return ['draft'];
    }
    return PROFILE_QUALITY_ORDER.slice(0, idx + 1).reverse();
}

/**
 * Resolve profile for a specific fallback attempt index.
 *
 * Attempt 0 returns the requested profile. Subsequent attempts walk the
 * deterministic downgrade ladder until clamped at `draft`.
 *
 * @param requested - Initially requested profile.
 * @param attempt - Zero-based attempt index.
 * @returns Profile to use for this attempt.
 */
export function profileForAttempt(
    requested: QualityProfileName,
    attempt: number,
): QualityProfileName {
    const ladder = buildDowngradeLadder(requested);
    const safeAttempt = Math.max(0, Math.floor(attempt));
    return ladder[Math.min(safeAttempt, ladder.length - 1)];
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
