/**
 * QualityProfiles.test.ts — Tests for tolerance-based quality profiles.
 */
import { describe, it, expect } from 'vitest';
import {
    QUALITY_PROFILES,
    PROFILE_QUALITY_ORDER,
    getQualityProfile,
    resolveTolerances,
    resolveTriangleBudget,
    downgradeProfile,
    buildDowngradeLadder,
    profileForAttempt,
    checkTolerances,
} from './QualityProfiles';
import type { QualityProfileName, ExportTolerances } from './types';

describe('QualityProfiles', () => {
    // ========================================================================
    // Profile Registry
    // ========================================================================

    describe('QUALITY_PROFILES', () => {
        it('defines all four profiles', () => {
            expect(Object.keys(QUALITY_PROFILES)).toEqual(
                expect.arrayContaining(['draft', 'standard', 'high', 'ultra']),
            );
            expect(Object.keys(QUALITY_PROFILES).length).toBe(4);
        });

        it('each profile has required fields', () => {
            for (const [name, profile] of Object.entries(QUALITY_PROFILES)) {
                expect(profile.name).toBe(name);
                expect(profile.tolerances).toBeDefined();
                expect(profile.tolerances.epsPosMm).toBeGreaterThan(0);
                expect(profile.tolerances.epsNormalDeg).toBeGreaterThan(0);
                expect(profile.tolerances.epsFeatureMm).toBeGreaterThan(0);
                expect(profile.tolerances.minTriangleAngleDeg).toBeGreaterThan(0);
                expect(profile.tolerances.maxAspectRatio).toBeGreaterThan(0);
                expect(profile.maxTriangleBudget).toBeGreaterThan(0);
                expect(profile.maxRefineIterations).toBeGreaterThanOrEqual(0);
                expect(profile.description.length).toBeGreaterThan(0);
            }
        });

        it('higher profiles have tighter tolerances', () => {
            const order = PROFILE_QUALITY_ORDER;
            for (let i = 1; i < order.length; i++) {
                const prev = QUALITY_PROFILES[order[i - 1]];
                const curr = QUALITY_PROFILES[order[i]];
                // Tighter = smaller epsPosMm
                expect(curr.tolerances.epsPosMm).toBeLessThan(prev.tolerances.epsPosMm);
                // Tighter = smaller epsNormalDeg
                expect(curr.tolerances.epsNormalDeg).toBeLessThan(prev.tolerances.epsNormalDeg);
                // Higher budget
                expect(curr.maxTriangleBudget).toBeGreaterThanOrEqual(prev.maxTriangleBudget);
            }
        });

        it('profiles match documented tolerance values', () => {
            expect(QUALITY_PROFILES.draft.tolerances.epsPosMm).toBe(0.12);
            expect(QUALITY_PROFILES.standard.tolerances.epsPosMm).toBe(0.08);
            expect(QUALITY_PROFILES.high.tolerances.epsPosMm).toBe(0.05);
            expect(QUALITY_PROFILES.ultra.tolerances.epsPosMm).toBe(0.03);
        });
    });

    describe('PROFILE_QUALITY_ORDER', () => {
        it('is ordered lowest to highest', () => {
            expect(PROFILE_QUALITY_ORDER).toEqual(['draft', 'standard', 'high', 'ultra']);
        });
    });

    // ========================================================================
    // getQualityProfile
    // ========================================================================

    describe('getQualityProfile', () => {
        it('returns profile by exact name', () => {
            const profile = getQualityProfile('high');
            expect(profile.name).toBe('high');
            expect(profile.tolerances.epsPosMm).toBe(0.05);
        });

        it('is case-insensitive', () => {
            const profile = getQualityProfile('Ultra');
            expect(profile.name).toBe('ultra');
        });

        it('trims whitespace', () => {
            const profile = getQualityProfile('  standard  ');
            expect(profile.name).toBe('standard');
        });

        it('throws for unknown profile', () => {
            expect(() => getQualityProfile('extreme')).toThrow(/unknown quality profile/i);
        });
    });

    // ========================================================================
    // resolveTolerances
    // ========================================================================

    describe('resolveTolerances', () => {
        it('uses standard profile as default', () => {
            const tol = resolveTolerances({});
            expect(tol.epsPosMm).toBe(0.08);
            expect(tol.epsNormalDeg).toBe(6.0);
        });

        it('uses named profile tolerances', () => {
            const tol = resolveTolerances({ qualityProfile: 'ultra' });
            expect(tol.epsPosMm).toBe(0.03);
            expect(tol.epsNormalDeg).toBe(3.0);
            expect(tol.epsFeatureMm).toBe(0.02);
        });

        it('applies partial overrides on top of profile', () => {
            const tol = resolveTolerances({
                qualityProfile: 'standard',
                toleranceOverrides: { epsPosMm: 0.04 },
            });
            // Overridden
            expect(tol.epsPosMm).toBe(0.04);
            // Not overridden — should keep standard defaults
            expect(tol.epsNormalDeg).toBe(6.0);
            expect(tol.epsFeatureMm).toBe(0.06);
        });

        it('returns a fresh copy (not shared reference)', () => {
            const tol1 = resolveTolerances({ qualityProfile: 'high' });
            const tol2 = resolveTolerances({ qualityProfile: 'high' });
            expect(tol1).not.toBe(tol2);
            expect(tol1).toEqual(tol2);
        });
    });

    // ========================================================================
    // resolveTriangleBudget
    // ========================================================================

    describe('resolveTriangleBudget', () => {
        it('returns profile budget when no explicit target', () => {
            const budget = resolveTriangleBudget(undefined, QUALITY_PROFILES.standard);
            expect(budget).toBe(2_000_000);
        });

        it('uses explicit target when within profile cap', () => {
            const budget = resolveTriangleBudget(500_000, QUALITY_PROFILES.standard);
            expect(budget).toBe(500_000);
        });

        it('caps at profile maximum', () => {
            const budget = resolveTriangleBudget(10_000_000, QUALITY_PROFILES.standard);
            expect(budget).toBe(2_000_000);
        });

        it('returns ultra budget for ultra profile', () => {
            const budget = resolveTriangleBudget(undefined, QUALITY_PROFILES.ultra);
            expect(budget).toBe(8_000_000);
        });
    });

    // ========================================================================
    // downgradeProfile
    // ========================================================================

    describe('downgradeProfile', () => {
        it('downgrades ultra → high', () => {
            expect(downgradeProfile('ultra')).toBe('high');
        });

        it('downgrades high → standard', () => {
            expect(downgradeProfile('high')).toBe('standard');
        });

        it('downgrades standard → draft', () => {
            expect(downgradeProfile('standard')).toBe('draft');
        });

        it('returns null for draft (no further downgrade)', () => {
            expect(downgradeProfile('draft')).toBeNull();
        });
    });

    describe('buildDowngradeLadder', () => {
        it('builds full ladder for ultra', () => {
            expect(buildDowngradeLadder('ultra')).toEqual(['ultra', 'high', 'standard', 'draft']);
        });

        it('builds partial ladder for high', () => {
            expect(buildDowngradeLadder('high')).toEqual(['high', 'standard', 'draft']);
        });

        it('returns only draft for draft', () => {
            expect(buildDowngradeLadder('draft')).toEqual(['draft']);
        });
    });

    describe('profileForAttempt', () => {
        it('is deterministic for ultra ladder attempts', () => {
            expect(profileForAttempt('ultra', 0)).toBe('ultra');
            expect(profileForAttempt('ultra', 1)).toBe('high');
            expect(profileForAttempt('ultra', 2)).toBe('standard');
            expect(profileForAttempt('ultra', 3)).toBe('draft');
        });

        it('clamps attempts past ladder end to draft', () => {
            expect(profileForAttempt('standard', 99)).toBe('draft');
        });

        it('clamps negative attempts to first attempt', () => {
            expect(profileForAttempt('high', -5)).toBe('high');
        });
    });

    // ========================================================================
    // checkTolerances
    // ========================================================================

    describe('checkTolerances', () => {
        const standardTol: ExportTolerances = QUALITY_PROFILES.standard.tolerances;

        it('passes when all metrics are within tolerance', () => {
            const result = checkTolerances(standardTol, {
                maxPosErrorMm: 0.05,
                maxNormalErrorDeg: 4.0,
                maxFeatureDriftMm: 0.03,
                minAngleDeg: 20,
                maxAspectRatio: 8.0,
            });
            expect(result.passed).toBe(true);
            expect(Object.values(result.details).every(d => d.passed)).toBe(true);
        });

        it('fails when position error exceeds threshold', () => {
            const result = checkTolerances(standardTol, {
                maxPosErrorMm: 0.15, // exceeds 0.08
            });
            expect(result.passed).toBe(false);
            expect(result.details.positionError.passed).toBe(false);
            expect(result.details.positionError.target).toBe(0.08);
            expect(result.details.positionError.actual).toBe(0.15);
        });

        it('fails when min angle is too small', () => {
            const result = checkTolerances(standardTol, {
                minAngleDeg: 10, // below 18
            });
            expect(result.passed).toBe(false);
            expect(result.details.minAngle.passed).toBe(false);
        });

        it('fails when aspect ratio exceeds threshold', () => {
            const result = checkTolerances(standardTol, {
                maxAspectRatio: 25, // exceeds 20.0 (R/r metric)
            });
            expect(result.passed).toBe(false);
            expect(result.details.aspectRatio.passed).toBe(false);
        });

        it('passes with no measurements (vacuously true)', () => {
            const result = checkTolerances(standardTol, {});
            expect(result.passed).toBe(true);
            expect(Object.keys(result.details).length).toBe(0);
        });

        it('handles partial metrics — passes if provided ones pass', () => {
            const result = checkTolerances(standardTol, {
                maxPosErrorMm: 0.01, // well within
                maxFeatureDriftMm: 0.01, // well within
            });
            expect(result.passed).toBe(true);
            expect(Object.keys(result.details).length).toBe(2);
        });

        it('mixed pass/fail returns overall fail', () => {
            const result = checkTolerances(standardTol, {
                maxPosErrorMm: 0.01,     // pass
                maxNormalErrorDeg: 10.0,  // fail (> 6.0)
            });
            expect(result.passed).toBe(false);
            expect(result.details.positionError.passed).toBe(true);
            expect(result.details.normalError.passed).toBe(false);
        });

        it('works with ultra tolerances', () => {
            const ultraTol = QUALITY_PROFILES.ultra.tolerances;
            const result = checkTolerances(ultraTol, {
                maxPosErrorMm: 0.02,      // passes 0.03
                maxNormalErrorDeg: 2.5,    // passes 3.0
                epsFeatureMm: 0.01,       // not a valid key, should be ignored
                maxFeatureDriftMm: 0.015,  // passes 0.02
                minAngleDeg: 25,           // passes 22
                maxAspectRatio: 5.0,       // passes 12.0 (R/r metric)
            });
            expect(result.passed).toBe(true);
        });
    });
});
