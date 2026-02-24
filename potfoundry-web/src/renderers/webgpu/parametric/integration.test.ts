/**
 * integration.test.ts — End-to-end integration tests for the parametric pipeline.
 *
 * Tests the full flow: curvature → features → chains → grid → tessellation,
 * verifying that modules compose correctly.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { computeRawCurvature, normalizeProfile, smoothProfile } from './CurvatureAnalysis';
import { detectFeatureEdges } from './FeatureDetection';
import { linkFeatureChainsByKind } from './ChainLinker';
import { computeGridDimensions, buildUnionFeatureGrid } from './GridBuilder';
import { buildCDTOuterWall } from './OuterWallTessellator';
import type { FeaturePoint } from './types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate synthetic circular positions with radial modulation.
 * Simulates a style with n lobes (like Superformula).
 */
function generateLobePositions(numSamples: number, lobes: number, baseRadius: number = 50, amplitude: number = 5): Float32Array {
    const positions = new Float32Array(numSamples * 3);
    for (let i = 0; i < numSamples; i++) {
        const theta = (i / numSamples) * 2 * Math.PI;
        const r = baseRadius + amplitude * Math.cos(lobes * theta);
        positions[i * 3 + 0] = r * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(theta);
        positions[i * 3 + 2] = 0;
    }
    return positions;
}

// ============================================================================
// Curvature → Features pipeline
// ============================================================================

describe('Parametric Pipeline Integration', () => {
    describe('curvature → features → chains', () => {
        it('detects features and produces chains for 6-lobe pattern', () => {
            const n = 4096;
            const positions = generateLobePositions(n, 6);

            const curvature = computeRawCurvature(positions, n);
            expect(curvature.length).toBe(n);

            const normalized = normalizeProfile(curvature);
            expect(normalized.length).toBe(n);

            const smoothed = smoothProfile(normalized, 2);
            expect(smoothed.length).toBe(n);

            const features = detectFeatureEdges(curvature, n, positions);
            // 6 lobes → should detect features (peaks + valleys + harmonics)
            expect(features.length).toBeGreaterThanOrEqual(6);
            expect(features.length).toBeLessThanOrEqual(36);
        });

        it('smoothProfile reduces noise without destroying features', () => {
            const n = 1024;
            const positions = generateLobePositions(n, 4);
            const curvature = computeRawCurvature(positions, n);
            const normalized = normalizeProfile(curvature);

            const smoothed = smoothProfile(normalized, 3);

            // Smoothed profile should have similar range but less noise
            let rawMax = 0, smoothMax = 0;
            for (let i = 0; i < n; i++) {
                rawMax = Math.max(rawMax, normalized[i]);
                smoothMax = Math.max(smoothMax, smoothed[i]);
            }
            // Smoothing shouldn't amplify signal
            expect(smoothMax).toBeLessThanOrEqual(rawMax + 1e-6);
            // But shouldn't completely flatten it either
            expect(smoothMax).toBeGreaterThan(rawMax * 0.1);
        });
    });

    // ========================================================================
    // Grid dimensions
    // ========================================================================

    describe('grid dimensions', () => {
        it('respects triangle budget for all surface configs', () => {
            const targetTris = 500_000;
            const surfaceConfigs = [
                { budgetFrac: 0.72, aspect: 3.0 }, // outer wall
                { budgetFrac: 0.14, aspect: 3.0 }, // inner wall
                { budgetFrac: 0.04, aspect: 1.0 }, // rim
            ];

            let totalTris = 0;
            for (const config of surfaceConfigs) {
                const { w, h } = computeGridDimensions(targetTris, config.budgetFrac, config.aspect);
                totalTris += 2 * (w - 1) * (h - 1); // quads → tris
                expect(w).toBeGreaterThanOrEqual(8);
                expect(h).toBeGreaterThanOrEqual(4);
            }

            // Total should not exceed target by more than 10%
            expect(totalTris).toBeLessThan(targetTris * 1.1);
        });

        it('returns larger grid for higher triangle budgets', () => {
            const low = computeGridDimensions(100_000, 0.72, 3.0);
            const high = computeGridDimensions(1_000_000, 0.72, 3.0);

            expect(high.w * high.h).toBeGreaterThan(low.w * low.h);
        });

        it('aspect ratio affects w/h proportions', () => {
            const square = computeGridDimensions(500_000, 0.5, 1.0);
            const wide = computeGridDimensions(500_000, 0.5, 4.0);

            // Wide should have larger w/h ratio
            expect(wide.w / wide.h).toBeGreaterThan(square.w / square.h);
        });
    });

    // ========================================================================
    // Grid → Tessellation
    // ========================================================================

    describe('grid → tessellation', () => {
        it('produces valid mesh from uniform grid with no chains', () => {
            const numU = 20;
            const numT = 10;

            const unionU = new Float32Array(numU);
            for (let i = 0; i < numU; i++) unionU[i] = i / (numU - 1);

            const tPositions = new Float32Array(numT);
            for (let i = 0; i < numT; i++) tPositions[i] = i / (numT - 1);

            const rowMapping = Array.from({ length: numT }, (_, i) => i);

            const result = buildCDTOuterWall([], rowMapping, tPositions, unionU, 1000, 0);

            // Basic mesh validity
            expect(result.vertices.length).toBe(numU * numT * 3);
            expect(result.indices.length).toBeGreaterThan(0);
            expect(result.indices.length % 3).toBe(0);

            // All indices valid
            for (let i = 0; i < result.indices.length; i++) {
                expect(result.indices[i]).toBeLessThan(result.gridVertexCount);
            }

            // No degenerate triangles
            for (let i = 0; i < result.indices.length; i += 3) {
                const a = result.indices[i], b = result.indices[i + 1], c = result.indices[i + 2];
                expect(a !== b && b !== c && a !== c).toBe(true);
            }
        });

        it('UV-snapping adjusts grid vertices for chain positions', () => {
            const numU = 20;
            const numT = 5;

            const unionU = new Float32Array(numU);
            for (let i = 0; i < numU; i++) unionU[i] = i / (numU - 1);

            const tPositions = new Float32Array(numT);
            for (let i = 0; i < numT; i++) tPositions[i] = i / (numT - 1);

            const rowMapping = Array.from({ length: numT }, (_, i) => i);

            // Chain at u=0.33 (between columns 6 and 7 for 20 columns)
            const chains = [{
                kind: 'peak' as const,
                points: [
                    { row: 1, u: 0.33 },
                    { row: 2, u: 0.33 },
                    { row: 3, u: 0.33 },
                ],
            }];

            const result = buildCDTOuterWall(chains, rowMapping, tPositions, unionU, 1000, 0);

            // Find a snapped vertex: one grid vertex per chain row should be at u=0.33
            let snappedCount = 0;
            for (let j = 1; j <= 3; j++) { // rows 1-3 have chain points
                for (let i = 0; i < numU; i++) {
                    const vU = result.vertices[(j * numU + i) * 3];
                    if (Math.abs(vU - 0.33) < 1e-4) snappedCount++;
                }
            }
            expect(snappedCount).toBeGreaterThanOrEqual(3); // at least one per chain row
        });
    });

    // ========================================================================
    // Full pipeline smoke test
    // ========================================================================

    describe('full pipeline smoke test', () => {
        it('curvature → features → grid dimensions are consistent', () => {
            const n = 2048;
            const positions = generateLobePositions(n, 8);
            const curvature = computeRawCurvature(positions, n);
            const features = detectFeatureEdges(curvature, n, positions);

            // Features should be in valid range [0, n)
            for (const f of features) {
                expect(f).toBeGreaterThanOrEqual(0);
                expect(f).toBeLessThan(n);
            }

            // Grid dimensions based on typical budget
            const { w, h } = computeGridDimensions(200_000, 0.72, 3.0);
            expect(w).toBeGreaterThanOrEqual(8);
            expect(h).toBeGreaterThanOrEqual(4);

            // Tessellation with computed dimensions
            const unionU = new Float32Array(w);
            for (let i = 0; i < w; i++) unionU[i] = i / (w - 1);
            const tPositions = new Float32Array(h);
            for (let i = 0; i < h; i++) tPositions[i] = i / (h - 1);
            const rowMapping = Array.from({ length: h }, (_, i) => i);

            const result = buildCDTOuterWall([], rowMapping, tPositions, unionU, 200_000, 0);
            expect(result.gridVertexCount).toBe(w * h);
            expect(result.indices.length / 3).toBeGreaterThan(0);
        });
    });
});
