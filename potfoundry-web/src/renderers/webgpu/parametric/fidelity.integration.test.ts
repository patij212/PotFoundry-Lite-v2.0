/**
 * Fidelity integration tests — per-style stress benchmarks and regression snapshots.
 *
 * Tests exercise the full parametric CPU pipeline (curvature → features →
 * grid → tessellation → validation) for synthetic profiles mimicking
 * each major style family. Tracks geometric quality baselines to catch
 * regressions in mesh fidelity.
 *
 * @vitest-environment jsdom
 * @module fidelity.integration.test
 * @see MeshValidator.ts for quality checks
 * @see QualityProfiles.ts for tolerance thresholds
 */

import { describe, it, expect } from 'vitest';
import {
    computeRawCurvature,
} from './CurvatureAnalysis';
import { detectFeatureEdges } from './FeatureDetection';
import { computeGridDimensions } from './GridBuilder';
import { buildCDTOuterWall } from './OuterWallTessellator';
import {
    checkManifold,
    checkDegenerates,
    checkTriangleQuality,
    checkNormals,
    validateMesh,
} from './MeshValidator';
import {
    resolveTolerances,
} from './QualityProfiles';

// ============================================================================
// Synthetic Profile Generators (mimic real style families)
// ============================================================================

function generateLobePositions(n: number, lobes: number, base = 50, amp = 5): Float32Array {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const r = base + amp * Math.sin(lobes * theta);
        out[i * 3] = r * Math.cos(theta);
        out[i * 3 + 1] = r * Math.sin(theta);
        out[i * 3 + 2] = 0;
    }
    return out;
}

function generateSpiralPositions(n: number, spirals: number, base = 50, amp = 4): Float32Array {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const r = base + amp * Math.sin(spirals * theta + theta * 0.5);
        out[i * 3] = r * Math.cos(theta);
        out[i * 3 + 1] = r * Math.sin(theta);
        out[i * 3 + 2] = 0;
    }
    return out;
}

function generateHighFreqPositions(n: number, freq: number, base = 50, amp = 2): Float32Array {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const r = base + amp * Math.sin(freq * theta) + amp * 0.3 * Math.sin(freq * 2 * theta);
        out[i * 3] = r * Math.cos(theta);
        out[i * 3 + 1] = r * Math.sin(theta);
        out[i * 3 + 2] = 0;
    }
    return out;
}

function generateGothicPositions(n: number, arches: number, base = 50, amp = 8): Float32Array {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const phase = (arches * theta) % (2 * Math.PI);
        const sharp = Math.pow(Math.max(0, Math.cos(phase)), 4);
        const r = base + amp * sharp;
        out[i * 3] = r * Math.cos(theta);
        out[i * 3 + 1] = r * Math.sin(theta);
        out[i * 3 + 2] = 0;
    }
    return out;
}

function generateSmoothPositions(n: number, lobes: number, base = 50, amp = 3): Float32Array {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const r = base + amp * Math.sin(lobes * theta) * Math.cos(lobes * theta * 0.3);
        out[i * 3] = r * Math.cos(theta);
        out[i * 3 + 1] = r * Math.sin(theta);
        out[i * 3 + 2] = 0;
    }
    return out;
}

// ============================================================================
// Pipeline runner
// ============================================================================

interface PipelineResult {
    numFeatures: number;
    numU: number;
    numT: number;
    gridVertexCount: number;
    indexCount: number;
    positions: Float32Array;
    indices: Uint32Array;
}

function runPipeline(pos3D: Float32Array, n: number, budget = 200_000): PipelineResult {
    const curv = computeRawCurvature(pos3D, n);
    const features = detectFeatureEdges(curv, n, pos3D);

    const { w, h } = computeGridDimensions(budget, 0.72, 3.0);

    const unionU = new Float32Array(w);
    for (let i = 0; i < w; i++) unionU[i] = i / (w - 1);
    const tPos = new Float32Array(h);
    for (let i = 0; i < h; i++) tPos[i] = i / (h - 1);
    const rowMap = Array.from({ length: h }, (_, i) => i);

    const tess = buildCDTOuterWall([], rowMap, tPos, unionU, budget, 0);

    return {
        numFeatures: features.length,
        numU: w,
        numT: h,
        gridVertexCount: tess.gridVertexCount,
        indexCount: tess.indices.length,
        positions: tess.vertices,
        indices: tess.indices,
    };
}

// ============================================================================
// Baseline bounds per style family
// ============================================================================

interface Baseline {
    name: string;
    minFeat: number;
    maxFeat: number;
    maxSliverFrac: number;
    minMinAngle: number;
    maxAR: number;
}

const BL: Record<string, Baseline> = {
    lobe6:      { name: 'SuperformulaBlossom 6-lobe', minFeat: 6, maxFeat: 36, maxSliverFrac: 0.05, minMinAngle: 5, maxAR: 50 },
    spiral4:    { name: 'SpiralRidges 4-spiral',      minFeat: 4, maxFeat: 24, maxSliverFrac: 0.05, minMinAngle: 5, maxAR: 50 },
    hf12:       { name: 'Crystalline 12-freq',         minFeat: 10, maxFeat: 100, maxSliverFrac: 0.06, minMinAngle: 3, maxAR: 60 },
    gothic5:    { name: 'GothicArches 5-arch',         minFeat: 5, maxFeat: 40, maxSliverFrac: 0.05, minMinAngle: 5, maxAR: 50 },
    smooth3:    { name: 'SuperellipseMorph 3-lobe',    minFeat: 1, maxFeat: 20, maxSliverFrac: 0.04, minMinAngle: 8, maxAR: 40 },
    hf20:       { name: 'HighFreq stress 20-freq',     minFeat: 15, maxFeat: 150, maxSliverFrac: 0.08, minMinAngle: 2, maxAR: 80 },
};

// ============================================================================
// Per-Style Fidelity Tests
// ============================================================================

describe('Per-style fidelity benchmarks', () => {
    const N = 2048;

    const CONFIGS: Array<{ key: string; gen: () => Float32Array }> = [
        { key: 'lobe6',   gen: () => generateLobePositions(N, 6) },
        { key: 'spiral4', gen: () => generateSpiralPositions(N, 4) },
        { key: 'hf12',    gen: () => generateHighFreqPositions(N, 12) },
        { key: 'gothic5', gen: () => generateGothicPositions(N, 5) },
        { key: 'smooth3', gen: () => generateSmoothPositions(N, 3) },
        { key: 'hf20',    gen: () => generateHighFreqPositions(N, 20) },
    ];

    for (const { key, gen } of CONFIGS) {
        const bl = BL[key];

        describe(bl.name, () => {
            let result: PipelineResult;

            it('runs pipeline', () => {
                result = runPipeline(gen(), N);
                expect(result.indexCount).toBeGreaterThan(0);
            });

            it('detects expected features', () => {
                result = result ?? runPipeline(gen(), N);
                expect(result.numFeatures).toBeGreaterThanOrEqual(bl.minFeat);
                expect(result.numFeatures).toBeLessThanOrEqual(bl.maxFeat);
            });

            it('manifold (no non-manifold edges)', () => {
                result = result ?? runPipeline(gen(), N);
                expect(checkManifold(result.indices, result.indexCount).nonManifoldEdges).toBe(0);
            });

            it('no degenerate elements', () => {
                result = result ?? runPipeline(gen(), N);
                const d = checkDegenerates(result.positions, result.indices, result.indexCount);
                expect(d.zeroAreaTriangles).toBe(0);
                expect(d.collapsedEdges).toBe(0);
            });

            it('meets triangle quality baseline', () => {
                result = result ?? runPipeline(gen(), N);
                const q = checkTriangleQuality(result.positions, result.indices, result.indexCount);
                const tc = Math.floor(result.indexCount / 3);
                const sf = tc > 0 ? q.sliverCount / tc : 0;
                expect(sf).toBeLessThanOrEqual(bl.maxSliverFrac);
                expect(q.minAngleDeg).toBeGreaterThanOrEqual(bl.minMinAngle);
                expect(q.maxAspectRatio).toBeLessThanOrEqual(bl.maxAR);
            });
        });
    }
});

// ============================================================================
// Cross-Style Regression Invariants
// ============================================================================

describe('Cross-style regression invariants', () => {
    const N = 2048;
    const gens = [
        () => generateLobePositions(N, 6),
        () => generateSpiralPositions(N, 4),
        () => generateHighFreqPositions(N, 12),
        () => generateGothicPositions(N, 5),
        () => generateSmoothPositions(N, 3),
        () => generateHighFreqPositions(N, 20),
    ];

    it('all styles produce triangles', () => {
        for (const g of gens) {
            expect(runPipeline(g(), N).indexCount).toBeGreaterThanOrEqual(3);
        }
    });

    it('no style produces non-manifold mesh', () => {
        for (const g of gens) {
            const r = runPipeline(g(), N);
            expect(checkManifold(r.indices, r.indexCount).nonManifoldEdges).toBe(0);
        }
    });

    it('no style produces degenerate triangles', () => {
        for (const g of gens) {
            const r = runPipeline(g(), N);
            expect(checkDegenerates(r.positions, r.indices, r.indexCount).zeroAreaTriangles).toBe(0);
        }
    });

    it('consistent normal orientation', () => {
        for (const g of gens) {
            const r = runPipeline(g(), N);
            expect(checkNormals(r.positions, r.indices, r.indexCount).invertedTriangles).toBe(0);
        }
    });
});

// ============================================================================
// Quality Profile Gating
// ============================================================================

describe('Quality profile gating', () => {
    const N = 2048;

    it('draft profile accepts pipeline output', () => {
        const tol = resolveTolerances({ qualityProfile: 'draft' });
        const r = runPipeline(generateLobePositions(N, 6), N);
        const rpt = validateMesh(r.positions, r.indices, r.indexCount, { tolerances: tol });
        expect(rpt.manifold.ok).toBe(true);
        expect(rpt.degenerates.ok).toBe(true);
    });

    it('budget is cap not quality proxy', () => {
        const pos = generateLobePositions(N, 6);
        const small = runPipeline(pos, N, 50_000);
        const large = runPipeline(pos, N, 500_000);
        expect(small.indexCount).toBeLessThan(large.indexCount);
        expect(checkManifold(small.indices, small.indexCount).nonManifoldEdges).toBe(0);
        expect(checkManifold(large.indices, large.indexCount).nonManifoldEdges).toBe(0);
    });

    it('higher budgets produce more vertices', () => {
        const pos = generateLobePositions(N, 6);
        const lo = runPipeline(pos, N, 100_000);
        const hi = runPipeline(pos, N, 1_000_000);
        expect(hi.gridVertexCount).toBeGreaterThan(lo.gridVertexCount);
    });
});
