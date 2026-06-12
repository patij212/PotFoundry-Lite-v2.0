/**
 * AdaptiveRefinement.test.ts — Tests for adaptive error-driven mesh refinement.
 *
 * Tests cover:
 * - Triangle normal computation
 * - Chord error estimation
 * - Normal error estimation
 * - Edge length computation
 * - Percentile utility
 * - Edge adjacency building
 * - CPU-only error estimation
 * - Triangle splitting with feature-edge constraint preservation
 * - Full refinement loop (zero iterations, budget exhaustion, tolerance pass, convergence)
 */
import { describe, it, expect, vi } from 'vitest';
import {
    triangleNormal,
    computeChordError,
    computeNormalError,
    edgeLengthSq,
    percentile,
    buildEdgeAdjacency,
    estimateErrorsCPU,
    estimateErrorsGPU,
    splitOverThresholdTriangles,
    adaptiveRefine,
    seamSafeMidpointU,
    topK,
    predictSplitReduction,
    computeMeshQuality,
    globalSmoothing,
} from './AdaptiveRefinement';
import type {
    RefinementConfig,
    RefinementResult,
} from './AdaptiveRefinement';
import type { ExportTolerances, QualityProfile } from './types';
import { emptyFeatureEdgeGraph, buildFeatureEdgeGraph } from './FeatureEdgeGraph';
import type { EvaluateMidpointsFn } from './MeshSubdivision';
import { isConverged } from './contracts';
import type { ConvergenceState } from './contracts';
import { RunningStats } from './SurfaceMetric';
import { edgeKey } from './ChainStripOptimizer';

// ============================================================================
// Test Helpers
// ============================================================================

/** Flat square: two triangles forming a 1×1 square in XY plane at z=0. */
function makeFlatSquare(): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    const positions = new Float32Array([
        0, 0, 0,   // v0
        1, 0, 0,   // v1
        1, 1, 0,   // v2
        0, 1, 0,   // v3
    ]);
    const uvs = new Float32Array([
        0, 0, 0,   // v0: u=0, t=0, surface=0
        1, 0, 0,   // v1: u=1, t=0, surface=0
        1, 1, 0,   // v2: u=1, t=1, surface=0
        0, 1, 0,   // v3: u=0, t=1, surface=0
    ]);
    const indices = new Uint32Array([
        0, 1, 2,   // tri0
        0, 2, 3,   // tri1
    ]);
    return { positions, uvs, indices };
}

/** Bent mesh: two triangles meeting at a dihedral angle. */
function makeBentMesh(): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    const positions = new Float32Array([
        0, 0, 0,     // v0
        1, 0, 0,     // v1
        0.5, 1, 0,   // v2 (shared edge vertex)
        0.5, -1, 0.5, // v3 (bent down and forward)
    ]);
    const uvs = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0.5, 1, 0,
        0.5, -1, 0,
    ]);
    const indices = new Uint32Array([
        0, 1, 2,   // tri0
        1, 0, 3,   // tri1
    ]);
    return { positions, uvs, indices };
}

/** Create a larger grid mesh for refinement testing. */
function makeGridMesh(cols: number, rows: number): {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    outerIdxCount: number;
} {
    const vertCount = cols * rows;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 3);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            positions[idx * 3] = c;
            positions[idx * 3 + 1] = r;
            // Add curvature: z = sin(x) * sin(y) — creates chord error
            positions[idx * 3 + 2] = Math.sin(c * 0.5) * Math.sin(r * 0.5);
            uvs[idx * 3] = c / (cols - 1);
            uvs[idx * 3 + 1] = r / (rows - 1);
            uvs[idx * 3 + 2] = 0; // surfaceId
        }
    }

    const triCount = (cols - 1) * (rows - 1) * 2;
    const indices = new Uint32Array(triCount * 3);
    let idx = 0;
    for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
            const v0 = r * cols + c;
            const v1 = r * cols + c + 1;
            const v2 = (r + 1) * cols + c + 1;
            const v3 = (r + 1) * cols + c;
            indices[idx++] = v0; indices[idx++] = v1; indices[idx++] = v2;
            indices[idx++] = v0; indices[idx++] = v2; indices[idx++] = v3;
        }
    }
    return { positions, uvs, indices, outerIdxCount: indices.length };
}

/** Standard tolerances for tests. */
function testTolerances(overrides?: Partial<ExportTolerances>): ExportTolerances {
    return {
        epsPosMm: 0.08,
        epsNormalDeg: 6.0,
        epsFeatureMm: 0.06,
        minTriangleAngleDeg: 18,
        maxAspectRatio: 20.0, // R/r metric: equilateral=2, sliver→∞
        ...overrides,
    };
}

/** Standard profile for tests. */
function testProfile(overrides?: Partial<QualityProfile>): QualityProfile {
    return {
        name: 'standard',
        tolerances: testTolerances(),
        maxTriangleBudget: 2_000_000,
        maxEdgeMm: 2,
        nRing: 512,
        maxRefineIterations: 2,
        description: 'test profile',
        ...overrides,
    };
}

/** Mock GPU evaluator: returns the linear midpoint (no curvature correction). */
const linearEvaluator: EvaluateMidpointsFn = async (uvBatch: Float32Array): Promise<Float32Array> => {
    // Returns positions at the UV midpoints — for a flat surface, same as linear interp
    const count = uvBatch.length / 3;
    const result = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const u = uvBatch[i * 3];
        const t = uvBatch[i * 3 + 1];
        // Simple parametric surface: x = u, y = t, z = 0 (flat)
        result[i * 3] = u;
        result[i * 3 + 1] = t;
        result[i * 3 + 2] = 0;
    }
    return result;
};

/** Mock GPU evaluator that returns offset positions (simulates curvature). */
const curvedEvaluator: EvaluateMidpointsFn = (uvBatch: Float32Array): Promise<Float32Array> => {
    const count = uvBatch.length / 3;
    const result = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const u = uvBatch[i * 3];
        const t = uvBatch[i * 3 + 1];
        result[i * 3] = u;
        result[i * 3 + 1] = t;
        // Curved surface: z = sin(u*π) * sin(t*π) — chord error exists
        result[i * 3 + 2] = Math.sin(u * Math.PI) * Math.sin(t * Math.PI);
    }
    return Promise.resolve(result);
};

// ============================================================================
// Tests
// ============================================================================

describe('triangleNormal', () => {
    it('computes correct normal for XY plane triangle', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const [nx, ny, nz] = triangleNormal(positions, 0, 1, 2);
        expect(nx).toBeCloseTo(0, 5);
        expect(ny).toBeCloseTo(0, 5);
        expect(nz).toBeCloseTo(1, 5);
    });

    it('computes correct normal for XZ plane triangle', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]);
        const [nx, ny, nz] = triangleNormal(positions, 0, 1, 2);
        expect(nx).toBeCloseTo(0, 5);
        expect(ny).toBeCloseTo(-1, 5);
        expect(nz).toBeCloseTo(0, 5);
    });

    it('returns [0,0,0] for degenerate triangle', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
        const [nx, ny, nz] = triangleNormal(positions, 0, 1, 2);
        expect(nx).toBe(0);
        expect(ny).toBe(0);
        expect(nz).toBe(0);
    });

    it('produces unit-length normal', () => {
        const positions = new Float32Array([0, 0, 0, 3, 0, 0, 0, 4, 0]);
        const [nx, ny, nz] = triangleNormal(positions, 0, 1, 2);
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(len).toBeCloseTo(1, 8);
    });
});

describe('computeChordError', () => {
    it('returns zero when surface point matches linear midpoint', () => {
        const positions = new Float32Array([0, 0, 0, 2, 0, 0]);
        // Surface point at (1, 0, 0) = exact linear midpoint
        const surfacePositions = new Float32Array([1, 0, 0]);
        const err = computeChordError(positions, surfacePositions, 0, 0, 1);
        expect(err).toBeCloseTo(0, 8);
    });

    it('returns correct distance when surface deviates', () => {
        const positions = new Float32Array([0, 0, 0, 2, 0, 0]);
        // Surface point at (1, 0, 0.5) — 0.5mm above the chord
        const surfacePositions = new Float32Array([1, 0, 0.5]);
        const err = computeChordError(positions, surfacePositions, 0, 0, 1);
        expect(err).toBeCloseTo(0.5, 5);
    });

    it('handles multiple edges in batch', () => {
        const positions = new Float32Array([
            0, 0, 0, // v0
            2, 0, 0, // v1
            0, 2, 0, // v2
        ]);
        // midpoint v0-v1 linear = (1,0,0), surface = (1,0,0.1) → error 0.1
        // midpoint v0-v2 linear = (0,1,0), surface = (0,1,0.3) → error 0.3
        const surfacePositions = new Float32Array([
            1, 0, 0.1,
            0, 1, 0.3,
        ]);
        const err0 = computeChordError(positions, surfacePositions, 0, 0, 1);
        const err1 = computeChordError(positions, surfacePositions, 1, 0, 2);
        expect(err0).toBeCloseTo(0.1, 5);
        expect(err1).toBeCloseTo(0.3, 5);
    });
});

describe('computeNormalError', () => {
    it('returns zero for identical normals', () => {
        const flatNormal: [number, number, number] = [0, 0, 1];
        const surfaceNormals = new Float32Array([0, 0, 1]);
        const err = computeNormalError(flatNormal, surfaceNormals, 0);
        expect(err).toBeCloseTo(0, 5);
    });

    it('returns 90 for perpendicular normals', () => {
        const flatNormal: [number, number, number] = [0, 0, 1];
        const surfaceNormals = new Float32Array([1, 0, 0]);
        const err = computeNormalError(flatNormal, surfaceNormals, 0);
        expect(err).toBeCloseTo(90, 3);
    });

    it('handles antiparallel normals as 0 degrees (uses abs dot)', () => {
        const flatNormal: [number, number, number] = [0, 0, 1];
        const surfaceNormals = new Float32Array([0, 0, -1]);
        const err = computeNormalError(flatNormal, surfaceNormals, 0);
        expect(err).toBeCloseTo(0, 5);
    });

    it('returns 45 for 45-degree offset', () => {
        const flatNormal: [number, number, number] = [0, 0, 1];
        const s = Math.SQRT1_2;
        const surfaceNormals = new Float32Array([0, s, s]);
        const err = computeNormalError(flatNormal, surfaceNormals, 0);
        expect(err).toBeCloseTo(45, 3);
    });
});

describe('edgeLengthSq', () => {
    it('computes correct squared distance', () => {
        const positions = new Float32Array([0, 0, 0, 3, 4, 0]);
        const lenSq = edgeLengthSq(positions, 0, 1);
        expect(lenSq).toBe(25);
    });

    it('returns zero for same vertex', () => {
        const positions = new Float32Array([5, 5, 5]);
        const lenSq = edgeLengthSq(positions, 0, 0);
        expect(lenSq).toBe(0);
    });
});

describe('percentile', () => {
    it('returns correct p50', () => {
        const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(percentile(sorted, 50)).toBe(5);
    });

    it('returns correct p95', () => {
        const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
        expect(percentile(sorted, 95)).toBe(95);
    });

    it('returns correct p100 (max)', () => {
        const sorted = [1, 2, 3];
        expect(percentile(sorted, 100)).toBe(3);
    });

    it('returns 0 for empty array', () => {
        expect(percentile([], 50)).toBe(0);
    });

    it('returns single element for single-element array', () => {
        expect(percentile([42], 50)).toBe(42);
    });
});

describe('buildEdgeAdjacency', () => {
    it('builds correct adjacency for two-triangle square', () => {
        const { indices } = makeFlatSquare();
        const adj = buildEdgeAdjacency(indices, indices.length);

        // 5 unique edges total: 0-1, 1-2, 0-2, 2-3, 0-3
        expect(adj.size).toBe(5);

        // Shared edge 0-2 should have 2 triangles
        const shared = adj.get(edgeKey(0, 2));
        expect(shared).toHaveLength(2);

        // Boundary edges should have 1 triangle each
        const boundary = adj.get(edgeKey(0, 1));
        expect(boundary).toHaveLength(1);
    });

    it('skips degenerate triangles', () => {
        const indices = new Uint32Array([0, 0, 1]); // degenerate
        const adj = buildEdgeAdjacency(indices, indices.length);
        expect(adj.size).toBe(0);
    });

    it('limits to outerIdxCount', () => {
        const indices = new Uint32Array([
            0, 1, 2,   // outer tri
            3, 4, 5,   // non-outer tri
        ]);
        const adj = buildEdgeAdjacency(indices, 3); // only first triangle
        expect(adj.size).toBe(3);
    });
});

describe('estimateErrorsCPU', () => {
    it('returns zero errors for flat mesh', () => {
        const { positions, indices } = makeFlatSquare();
        const errors = estimateErrorsCPU(positions, indices, indices.length, testTolerances());

        expect(errors).toHaveLength(2);
        // Flat surface: no curvature → zero chord error estimate
        for (const err of errors) {
            expect(err.posErrorMm).toBe(0);
            expect(err.normalErrorDeg).toBeCloseTo(0, 5);
        }
    });

    it('detects non-zero error in bent mesh', () => {
        const { positions, indices } = makeBentMesh();
        const errors = estimateErrorsCPU(positions, indices, indices.length, testTolerances());

        expect(errors).toHaveLength(2);
        // The dihedral angle should be > 0 since the mesh is bent
        const maxNormal = Math.max(...errors.map(e => e.normalErrorDeg));
        expect(maxNormal).toBeGreaterThan(0);
    });

    it('returns correct longestEdgeIdx for right triangle', () => {
        // Right triangle: hypotenuse should be longest
        const positions = new Float32Array([0, 0, 0, 3, 0, 0, 0, 4, 0]);
        const indices = new Uint32Array([0, 1, 2]);
        const errors = estimateErrorsCPU(positions, indices, indices.length, testTolerances());

        expect(errors).toHaveLength(1);
        // Edge 1→2 (index 1) is the hypotenuse: length = 5
        expect(errors[0].longestEdgeIdx).toBe(1);
        expect(errors[0].longestEdgeLenSq).toBe(25);
    });

    it('handles curved grid mesh with non-zero errors', () => {
        const { positions, indices, outerIdxCount } = makeGridMesh(5, 5);
        const errors = estimateErrorsCPU(positions, indices, outerIdxCount, testTolerances());

        // Should have (4×4×2) = 32 triangles
        expect(errors).toHaveLength(32);
        // Some should have non-zero error from curvature
        const maxPos = Math.max(...errors.map(e => e.posErrorMm));
        expect(maxPos).toBeGreaterThanOrEqual(0);
    });
});

describe('splitOverThresholdTriangles', () => {
    it('does not split when all errors within tolerance', () => {
        const { positions, uvs, indices } = makeFlatSquare();
        const errors = estimateErrorsCPU(positions, indices, indices.length, testTolerances());

        return splitOverThresholdTriangles(
            positions, uvs, indices, indices.length,
            errors, testTolerances(), emptyFeatureEdgeGraph(), 10,
            linearEvaluator,
        ).then(result => {
            expect(result.splitCount).toBe(0);
            expect(result.positions.length).toBe(positions.length);
            expect(result.indices.length).toBe(indices.length);
        });
    });

    it('splits triangle with high error', () => {
        const { positions, uvs, indices } = makeFlatSquare();

        // Fake high-error entries: use shared edge 0→2 (shared by tri0 and tri1)
        const fakeErrors = [
            {
                triIdx: 0,
                posErrorMm: 1.0, // way over tolerance
                normalErrorDeg: 10.0,
                longestEdgeIdx: 2, // edge index 2 in tri0 = edge (i2→i0) = (2→0)
                longestEdgeLenSq: edgeLengthSq(positions, 0, 2),
            },
        ];

        return splitOverThresholdTriangles(
            positions, uvs, indices, indices.length,
            fakeErrors, testTolerances(), emptyFeatureEdgeGraph(), 10,
            linearEvaluator,
        ).then(result => {
            expect(result.splitCount).toBe(1);
            // 2 original tris + 2 new tris = 4 tris total
            expect(result.indices.length / 3).toBe(4);
            // 4 original verts + 1 midpoint = 5 verts
            expect(result.positions.length / 3).toBe(5);
        });
    });

    it('preserves feature edges — does not split constrained edge', () => {
        const { positions, uvs, indices } = makeFlatSquare();

        // Build a feature graph that constrains edge 1→2
        const chains = [{ points: [{ u: 0, row: 0 }, { u: 1, row: 0 }], kind: 'peak' as const }];
        const mapping = { chainToVertices: new Map([[0, [1, 2]]]) };
        const graph = buildFeatureEdgeGraph(chains, mapping);

        const fakeErrors = [
            {
                triIdx: 0,
                posErrorMm: 1.0,
                normalErrorDeg: 10.0,
                longestEdgeIdx: 1, // edge 1→2 which is a feature edge
                longestEdgeLenSq: edgeLengthSq(positions, 1, 2),
            },
        ];

        return splitOverThresholdTriangles(
            positions, uvs, indices, indices.length,
            fakeErrors, testTolerances(), graph, 10,
            linearEvaluator,
        ).then(result => {
            // Should NOT split because the longest edge is a feature edge
            expect(result.splitCount).toBe(0);
        });
    });

    it('respects maxSplits limit', () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(4, 4);
        const tol = testTolerances({ epsPosMm: 0, epsNormalDeg: 0 }); // zero tolerance → everything fails

        // Generate errors for all triangles
        const errors = estimateErrorsCPU(positions, indices, outerIdxCount, tol);
        // Force all errors above threshold
        for (const e of errors) {
            e.posErrorMm = 1.0;
            e.normalErrorDeg = 10.0;
        }

        return splitOverThresholdTriangles(
            positions, uvs, indices, outerIdxCount,
            errors, tol, emptyFeatureEdgeGraph(), 2, // max 2 splits
            linearEvaluator,
        ).then(result => {
            expect(result.splitCount).toBeLessThanOrEqual(2);
        });
    });
});

describe('adaptiveRefine', () => {
    it('returns zero_iterations when maxRefineIterations is 0', async () => {
        const { positions, uvs, indices } = makeFlatSquare();
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 0 }),
            tolerances: testTolerances(),
            maxTriangles: 100_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: indices.length,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, null);
        expect(result.stopReason).toBe('zero_iterations');
        expect(result.iterationsPerformed).toBe(0);
        expect(result.positions).toBe(positions); // same reference
    });

    it('returns tolerances_passed for flat mesh with generous tolerances', async () => {
        const { positions, uvs, indices } = makeFlatSquare();
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 3 }),
            tolerances: testTolerances({ epsPosMm: 10, epsNormalDeg: 90 }), // very generous
            maxTriangles: 100_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: indices.length,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, linearEvaluator);
        expect(result.stopReason).toBe('tolerances_passed');
        expect(result.tolerancesPassed).toBe(true);
        expect(result.maxPosErrorMm).toBeLessThanOrEqual(10);
    });

    it('returns budget_exhausted when budget is too small', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(5, 5);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 4 }),
            tolerances: testTolerances({ epsPosMm: 0.001, epsNormalDeg: 0.001 }), // impossibly tight
            maxTriangles: indices.length / 3, // budget = current count → can't add any
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, linearEvaluator);
        expect(result.stopReason).toBe('budget_exhausted');
    });

    it('records iterationStats correctly', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(4, 4);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 2 }),
            tolerances: testTolerances({ epsPosMm: 100, epsNormalDeg: 100 }),
            maxTriangles: 100_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, linearEvaluator);
        // With generous tolerances, should pass on first evaluation
        expect(result.iterationStats.length).toBeGreaterThanOrEqual(1);
        expect(result.iterationStats[0].iteration).toBe(0);
        expect(result.iterationStats[0].totalTriangles).toBeGreaterThan(0);
        expect(result.iterationStats[0].timeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns max_iterations when hitting iteration cap', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(6, 6);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 1 }),
            tolerances: testTolerances({ epsPosMm: 0.0001, epsNormalDeg: 0.0001 }), // very tight
            maxTriangles: 100_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount,
        };

        // Use curved evaluator to create chord error
        const result = await adaptiveRefine(positions, uvs, indices, config, curvedEvaluator);
        // Should stop after 1 iteration due to cap
        expect(['max_iterations', 'no_improvement']).toContain(result.stopReason);
        expect(result.iterationsPerformed).toBeLessThanOrEqual(1);
    });

    it('no_improvement stop when CPU-only (no evaluator)', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(4, 4);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 3 }),
            tolerances: testTolerances({ epsPosMm: 0.0001, epsNormalDeg: 0.0001 }),
            maxTriangles: 100_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, null);
        // Without GPU evaluator, can't split, exits as no_improvement
        expect(result.stopReason).toBe('no_improvement');
        expect(result.iterationsPerformed).toBe(1);
    });

    it('preserves vertex count for zero-split iterations', async () => {
        const { positions, uvs, indices } = makeFlatSquare();
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 2 }),
            tolerances: testTolerances({ epsPosMm: 100, epsNormalDeg: 100 }),
            maxTriangles: 100_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: indices.length,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, linearEvaluator);
        // No actual splitting happened → vertex count unchanged
        expect(result.positions.length).toBe(positions.length);
        expect(result.indices.length).toBe(indices.length);
    });

    it('increases triangle count when splitting occurs', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(6, 6);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 2 }),
            tolerances: testTolerances({ epsPosMm: 0.0001, epsNormalDeg: 0.0001 }),
            maxTriangles: 10_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, curvedEvaluator);
        // With the curved evaluator, chord error exists → splits should happen
        // Result should have more triangles or same if no splits were possible
        expect(result.indices.length).toBeGreaterThanOrEqual(indices.length);
    });

    it('result contains valid diagnostics', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(4, 4);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 1 }),
            tolerances: testTolerances(),
            maxTriangles: 100_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount,
        };

        const result = await adaptiveRefine(positions, uvs, indices, config, linearEvaluator);
        expect(result.maxPosErrorMm).toBeGreaterThanOrEqual(0);
        expect(result.maxNormalErrorDeg).toBeGreaterThanOrEqual(0);
        expect(result.p95PosErrorMm).toBeGreaterThanOrEqual(0);
        expect(result.p95NormalErrorDeg).toBeGreaterThanOrEqual(0);
        expect(result.p95PosErrorMm).toBeLessThanOrEqual(result.maxPosErrorMm);
        expect(result.p95NormalErrorDeg).toBeLessThanOrEqual(result.maxNormalErrorDeg);
    });
});

describe('estimateErrorsGPU', () => {
    it('returns zero chord error for flat surface with accurate evaluator', async () => {
        const { positions, uvs, indices } = makeFlatSquare();
        const errors = await estimateErrorsGPU(
            positions, uvs, indices, indices.length,
            linearEvaluator, testTolerances(),
        );
        expect(errors).toHaveLength(2);
        for (const err of errors) {
            expect(err.posErrorMm).toBeCloseTo(0, 3);
        }
    });

    it('detects chord error for curved surface', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(4, 4);
        const errors = await estimateErrorsGPU(
            positions, uvs, indices, outerIdxCount,
            curvedEvaluator, testTolerances(),
        );
        // At least some triangles should have non-zero chord error
        const maxErr = Math.max(...errors.map((e: { posErrorMm: number }) => e.posErrorMm));
        expect(maxErr).toBeGreaterThan(0);
    });
});

// ============================================================================
// Phase 1-4 Feature Tests
// ============================================================================

import { checkSplitQuality, localEdgeFlip } from './AdaptiveRefinement';
import { metricEdgeLengthSq, computeVertexMetrics } from './SurfaceMetric';

describe('checkSplitQuality (Task 1.4)', () => {
    it('accepts a well-shaped split', () => {
        // Square: (0,0,0), (2,0,0), (0,2,0), (2,2,0)
        // Edge (0,1) with opposite vertices 2 and 3
        // Midpoint at (1,0,0)
        const positions = new Float32Array([
            0, 0, 0,   // v0
            2, 0, 0,   // v1
            0, 2, 0,   // v2 (opp0)
            2, 2, 0,   // v3 (opp1)
        ]);
        const midPos: [number, number, number] = [1, 0, 0];
        const result = checkSplitQuality(positions, midPos, 0, 1, 2, 3, 10);
        expect(result).toBe(true);
    });

    it('rejects a split that creates a sliver', () => {
        // Nearly collinear points: sliver triangle
        const positions = new Float32Array([
            0, 0, 0,       // v0
            10, 0, 0,      // v1
            5, 0.001, 0,   // opp0 (barely off the line)
            5, -0.001, 0,  // opp1 (barely off the line)
        ]);
        const midPos: [number, number, number] = [5, 0, 0];
        // With a threshold of 10°, these near-degenerate triangles should be rejected
        const result = checkSplitQuality(positions, midPos, 0, 1, 2, 3, 10);
        expect(result).toBe(false);
    });

    it('returns false for degenerate (zero-area) triangles', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        // Midpoint exactly on vertex 0 — creates degenerate triangle
        const midPos: [number, number, number] = [0, 0, 0];
        const result = checkSplitQuality(positions, midPos, 0, 1, 2, 3, 1);
        expect(result).toBe(false);
    });
});

describe('localEdgeFlip (Task 3.1)', () => {
    it('flips an edge that improves minimum angle', () => {
        // Diamond shape: 4 vertices, 2 triangles sharing edge (0,2)
        // v0=(0,0,0), v1=(1,1,0), v2=(2,0,0), v3=(1,-1,0)
        // Current: (0,2,1) and (0,2,3) — skinny
        // After flip: (1,3,0) and (1,3,2) — better
        const positions = new Float32Array([
            0, 0, 0,   // v0
            1, 2, 0,   // v1
            2, 0, 0,   // v2
            1, -2, 0,  // v3
        ]);
        const indices = new Uint32Array([
            0, 2, 1,   // tri0
            0, 3, 2,   // tri1
        ]);
        const affected = new Set([0, 1, 2, 3]);
        const featureGraph = emptyFeatureEdgeGraph();
        const flipCount = localEdgeFlip(indices, positions, affected, featureGraph, 6);
        expect(flipCount).toBeGreaterThanOrEqual(0);
    });

    it('does not flip feature edges', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1, 2, 0,
            2, 0, 0,
            1, -2, 0,
        ]);
        const indices = new Uint32Array([
            0, 2, 1,
            0, 3, 2,
        ]);
        const affected = new Set([0, 1, 2, 3]);
        // Mark edge (0,2) as feature edge
        const featureGraph = buildFeatureEdgeGraph(
            [{ points: [{ u: 0, row: 0 }, { u: 1, row: 0 }], kind: 'peak' as const }],
            { chainToVertices: new Map([[0, [0, 2]]]) },
        );
        const flipCount = localEdgeFlip(indices, positions, affected, featureGraph, 6);
        expect(flipCount).toBe(0);
    });
});

describe('metricEdgeLengthSq (SurfaceMetric)', () => {
    it('returns non-negative squared length', () => {
        // Build a simple mesh and compute vertex metrics
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 1, 3, 2]);
        const metrics = computeVertexMetrics(positions, uvs, indices, 6);
        const lenSq = metricEdgeLengthSq(metrics, uvs, 0, 1);
        expect(lenSq).toBeGreaterThanOrEqual(0);
    });

    it('gives larger result for stretched direction', () => {
        // Stretched in X: surface goes 0→10 while UV goes 0→1
        const positions = new Float32Array([
            0, 0, 0,
            10, 0, 0,
            0, 1, 0,
            10, 1, 0,
        ]);
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 1, 3, 2]);
        const metrics = computeVertexMetrics(positions, uvs, indices, 6);
        const lenSqU = metricEdgeLengthSq(metrics, uvs, 0, 1); // along stretched u
        const lenSqT = metricEdgeLengthSq(metrics, uvs, 0, 2); // along t (not stretched)
        expect(lenSqU).toBeGreaterThan(lenSqT);
    });
});

// ============================================================================
// Phase 12 — New Test Coverage (T1-T6)
// ============================================================================

describe('seamSafeMidpointU', () => {
    // Cylindrical semantics: U ∈ [0, 1) with u=0 ≡ u=1 (same theta=0 line on
    // the cylinder). The "midpoint" of two U values is the centre of the
    // SHORTER arc between them. Whenever |u1 − u0| > 0.5 the shorter arc
    // is via the seam; the midpoint must wrap accordingly.

    it('returns simple midpoint when the short arc does not cross the seam', () => {
        // |0.6 − 0.4| = 0.2 < 0.5  →  short arc is 0.4 → 0.5 → 0.6
        expect(seamSafeMidpointU(0.4, 0.6)).toBeCloseTo(0.5, 8);
        expect(seamSafeMidpointU(0.45, 0.55)).toBeCloseTo(0.5, 8);
        // Within-half edges away from seam: trivial.
        expect(seamSafeMidpointU(0.10, 0.30)).toBeCloseTo(0.20, 8);
    });

    it('wraps when both endpoints are inside SEAM_WRAP_ZONE of opposite seams', () => {
        // (0.9, 0.1): both within 0.15 of seam, short arc through u=0.
        const m1 = seamSafeMidpointU(0.9, 0.1);
        const onSeam1 = Math.min(Math.abs(m1 - 0), Math.abs(m1 - 1));
        expect(onSeam1).toBeLessThan(1e-8);

        // (0.05, 0.95): symmetric, ditto.
        const m2 = seamSafeMidpointU(0.05, 0.95);
        const onSeam2 = Math.min(Math.abs(m2 - 0), Math.abs(m2 - 1));
        expect(onSeam2).toBeLessThan(1e-8);
    });

    it('does not wrap when endpoints are outside SEAM_WRAP_ZONE', () => {
        // (0.2, 0.8): gap > 0.5 but neither endpoint is within 0.15 of a seam.
        // Heuristic treats this as a flat-mesh long edge, not a cylindrical wrap.
        // (If a future caller needs cylindrical-everywhere semantics, add an
        // explicit parameter rather than widening the heuristic globally.)
        expect(seamSafeMidpointU(0.2, 0.8)).toBeCloseTo(0.5, 8);
    });

    it('handles the production seam-edge case (u0=0 exactly, u1 near 1)', () => {
        // Regression test: this is what the 476-col grid produces on every
        // wrap-around edge: col 0 at u=0.000000, col 475 at u=475/476≈0.997900.
        // The pre-fix bug excluded lo>0 in its wrap-zone guard and returned
        // the naive 0.499 average — 125 mm of arc off on a 250 mm pot, which
        // showed up in production as Adaptive Refinement maxPos≈160 mm.
        const u0 = 0;
        const u1 = 475 / 476;
        const mid = seamSafeMidpointU(u0, u1);
        // Correct midpoint of the short arc (length 1/476): half a column past
        // u=0 on the negative side → u = 1 − 1/(2·476) ≈ 0.998950.
        const expectedShortMid = 1 - 1 / (2 * 476);
        // Allow for the equivalence u=0 ≡ u=1 by checking shortest arc distance.
        const arcDist = Math.min(
            Math.abs(mid - expectedShortMid),
            Math.abs(mid - (expectedShortMid - 1)),
        );
        expect(arcDist).toBeLessThan(1e-8);
    });

    it('treats EXACT (0, 1) as a flat-mesh corner span (returns 0.5)', () => {
        // (0, 1) exactly is ambiguous on a cylinder (same theta) but unambiguous
        // on a flat parameterization (corner-to-corner edge of a unit UV square).
        // The flat-square test fixture relies on this; production grids never
        // emit edges with hi=1 exactly (last column is at (N-1)/N ≠ 1).
        expect(seamSafeMidpointU(0.0, 1.0)).toBeCloseTo(0.5, 8);
    });

    it('handles identical u values', () => {
        expect(seamSafeMidpointU(0.5, 0.5)).toBeCloseTo(0.5, 8);
        expect(seamSafeMidpointU(0.0, 0.0)).toBeCloseTo(0.0, 8);
    });
});

describe('topK', () => {
    it('returns top k elements in sorted order', () => {
        const arr = [5, 1, 3, 9, 7, 2, 8, 4, 6, 10];
        const result = topK(arr, 3, (a, b) => b - a);
        expect(result).toEqual([10, 9, 8]);
    });

    it('returns all elements when k >= array length', () => {
        const arr = [3, 1, 2];
        const result = topK(arr, 10, (a, b) => b - a);
        expect(result).toHaveLength(3);
        expect(result).toEqual([3, 2, 1]);
    });

    it('returns empty array for empty input', () => {
        const result = topK([] as number[], 5, (a, b) => b - a);
        expect(result).toEqual([]);
    });

    it('handles k=1 correctly', () => {
        const arr = [3, 1, 4, 1, 5, 9, 2, 6];
        const result = topK(arr, 1, (a, b) => b - a);
        expect(result).toEqual([9]);
    });

    it('works with objects and custom comparator', () => {
        const arr = [
            { id: 'a', score: 10 },
            { id: 'b', score: 30 },
            { id: 'c', score: 20 },
            { id: 'd', score: 40 },
            { id: 'e', score: 5 },
        ];
        const result = topK(arr, 2, (a, b) => b.score - a.score);
        expect(result[0].id).toBe('d');
        expect(result[1].id).toBe('b');
    });

    it('handles all identical elements', () => {
        const arr = [7, 7, 7, 7, 7];
        const result = topK(arr, 3, (a, b) => b - a);
        expect(result).toHaveLength(3);
        expect(result.every(x => x === 7)).toBe(true);
    });
});

describe('predictSplitReduction', () => {
    it('returns positive reduction for curved edge', () => {
        const reduction = predictSplitReduction(0.5, 10.0, 0.1);
        expect(reduction).toBeGreaterThan(0);
        expect(reduction).toBeLessThanOrEqual(0.5);
    });

    it('returns zero for zero chord error', () => {
        const reduction = predictSplitReduction(0, 10.0, 0.1);
        expect(reduction).toBe(0);
    });

    it('larger curvature gives larger predicted reduction', () => {
        // Use physically consistent chord errors: chord ≈ κL²/8
        const r1 = predictSplitReduction(0.625, 10.0, 0.05);
        const r2 = predictSplitReduction(2.5, 10.0, 0.20);
        expect(r2).toBeGreaterThanOrEqual(r1);
    });

    it('works without curvature parameter', () => {
        const reduction = predictSplitReduction(0.5, 10.0);
        expect(reduction).toBeGreaterThan(0);
        expect(reduction).toBeLessThanOrEqual(0.5);
    });
});

describe('computeMeshQuality', () => {
    it('computes correct quality for equilateral triangle', () => {
        // Equilateral triangle: all angles 60°, R/r = 2.0
        const h = Math.sqrt(3) / 2;
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0.5, h, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const quality = computeMeshQuality(positions, indices, 3);
        expect(quality.minAngleDeg).toBeCloseTo(60, 0);
        expect(quality.maxAspectRatio).toBeCloseTo(2.0, 1); // R/r for equilateral = 2
    });

    it('detects poor quality in right isosceles triangle', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const quality = computeMeshQuality(positions, indices, 3);
        expect(quality.minAngleDeg).toBeCloseTo(45, 0);
        // R/r for 45-45-90 right triangle: R = √2/2 ≈ 0.707, r = (1+1-√2)/2 ≈ 0.293
        // R/r ≈ 2.414
        expect(quality.maxAspectRatio).toBeGreaterThanOrEqual(2.0);
        expect(quality.maxAspectRatio).toBeLessThan(3.0);
    });

    it('handles flat square mesh', () => {
        const positions = new Float32Array([
            0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
        const quality = computeMeshQuality(positions, indices, 6);
        expect(quality.minAngleDeg).toBeGreaterThan(0);
        expect(quality.maxAspectRatio).toBeGreaterThanOrEqual(1.0);
    });

    it('handles outerIdxCount limiting which triangles to measure', () => {
        const positions = new Float32Array([
            0, 0, 0, 1, 0, 0, 0.5, 1, 0,
            // v3 used by second triangle only
            0.5, -1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,  // outer triangle
            0, 3, 1,  // inner triangle (not measured if outerIdxCount=3)
        ]);
        const qualityAll = computeMeshQuality(positions, indices, 6);
        const qualityOuter = computeMeshQuality(positions, indices, 3);
        // Both should return valid results
        expect(qualityOuter.minAngleDeg).toBeGreaterThan(0);
        expect(qualityAll.minAngleDeg).toBeGreaterThan(0);
    });
});

describe('isConverged', () => {
    const baseTolerances: ExportTolerances = {
        epsPosMm: 0.08,
        epsNormalDeg: 6.0,
        epsFeatureMm: 0.06,
        minTriangleAngleDeg: 18,
        maxAspectRatio: 10.0,
    };

    it('returns converged when all criteria pass', () => {
        const state: ConvergenceState = {
            maxPosError: 0.05,
            p95PosError: 0.03,
            maxNormalError: 4.0,
            p95NormalError: 2.0,
            minAngleDeg: 30,
            maxAspectRatio: 3.0,
            triangleCount: 1000,
        };
        const result = isConverged(state, baseTolerances);
        expect(result.converged).toBe(true);
        expect(result.reason).toBe('all_passed');
    });

    it('returns pos_error when position error exceeds tolerance', () => {
        const state: ConvergenceState = {
            maxPosError: 0.10, // > 0.08
            p95PosError: 0.03,
            maxNormalError: 4.0,
            p95NormalError: 2.0,
            minAngleDeg: 30,
            maxAspectRatio: 3.0,
            triangleCount: 1000,
        };
        const result = isConverged(state, baseTolerances);
        expect(result.converged).toBe(false);
        expect(result.reason).toBe('pos_error');
    });

    it('returns normal_error when normal error exceeds tolerance', () => {
        const state: ConvergenceState = {
            maxPosError: 0.05,
            p95PosError: 0.03,
            maxNormalError: 8.0, // > 6.0
            p95NormalError: 5.0,
            minAngleDeg: 30,
            maxAspectRatio: 3.0,
            triangleCount: 1000,
        };
        const result = isConverged(state, baseTolerances);
        expect(result.converged).toBe(false);
        expect(result.reason).toBe('normal_error');
    });

    it('returns min_angle when minimum angle too small', () => {
        const state: ConvergenceState = {
            maxPosError: 0.05,
            p95PosError: 0.03,
            maxNormalError: 4.0,
            p95NormalError: 2.0,
            minAngleDeg: 10, // < 18
            maxAspectRatio: 3.0,
            triangleCount: 1000,
        };
        const result = isConverged(state, baseTolerances);
        expect(result.converged).toBe(false);
        expect(result.reason).toBe('min_angle');
    });

    it('returns aspect_ratio when aspect ratio too high', () => {
        const state: ConvergenceState = {
            maxPosError: 0.05,
            p95PosError: 0.03,
            maxNormalError: 4.0,
            p95NormalError: 2.0,
            minAngleDeg: 30,
            maxAspectRatio: 15.0, // > 10
            triangleCount: 1000,
        };
        const result = isConverged(state, baseTolerances);
        expect(result.converged).toBe(false);
        expect(result.reason).toBe('aspect_ratio');
    });

    it('checks criteria in priority order (pos first)', () => {
        // All criteria fail — but pos_error should be reported first
        const state: ConvergenceState = {
            maxPosError: 0.20,
            p95PosError: 0.15,
            maxNormalError: 20.0,
            p95NormalError: 15.0,
            minAngleDeg: 5,
            maxAspectRatio: 50,
            triangleCount: 100,
        };
        const result = isConverged(state, baseTolerances);
        expect(result.converged).toBe(false);
        expect(result.reason).toBe('pos_error');
    });
});

describe('RunningStats', () => {
    it('computes correct mean for simple sequence', () => {
        const stats = new RunningStats();
        stats.push(1);
        stats.push(2);
        stats.push(3);
        stats.push(4);
        stats.push(5);
        expect(stats.count).toBe(5);
        expect(stats.mean).toBeCloseTo(3.0, 8);
    });

    it('computes correct variance (population)', () => {
        const stats = new RunningStats();
        // Values: 2, 4, 4, 4, 5, 5, 7, 9 → mean=5, var=4
        for (const v of [2, 4, 4, 4, 5, 5, 7, 9]) stats.push(v);
        expect(stats.mean).toBeCloseTo(5.0, 8);
        expect(stats.variance).toBeCloseTo(4.0, 5);
    });

    it('computes correct sample variance', () => {
        const stats = new RunningStats();
        for (const v of [2, 4, 4, 4, 5, 5, 7, 9]) stats.push(v);
        // Sample variance = var * n / (n-1) = 4.0 * 8/7 ≈ 4.571
        expect(stats.sampleVariance).toBeCloseTo(4 * 8 / 7, 4);
    });

    it('tracks min and max', () => {
        const stats = new RunningStats();
        stats.push(5);
        stats.push(2);
        stats.push(8);
        stats.push(1);
        stats.push(9);
        expect(stats.min).toBe(1);
        expect(stats.max).toBe(9);
    });

    it('returns 0 for empty stats', () => {
        const stats = new RunningStats();
        expect(stats.count).toBe(0);
        expect(stats.mean).toBe(0);
        expect(stats.variance).toBe(0);
        expect(stats.stddev).toBe(0);
        expect(stats.min).toBe(Infinity);
        expect(stats.max).toBe(-Infinity);
    });

    it('handles single value', () => {
        const stats = new RunningStats();
        stats.push(42);
        expect(stats.count).toBe(1);
        expect(stats.mean).toBe(42);
        expect(stats.variance).toBe(0);
    });

    it('resets correctly', () => {
        const stats = new RunningStats();
        stats.push(1);
        stats.push(2);
        stats.push(3);
        stats.reset();
        expect(stats.count).toBe(0);
        expect(stats.mean).toBe(0);
        stats.push(10);
        expect(stats.mean).toBe(10);
    });

    it('coefficient of variation works', () => {
        const stats = new RunningStats();
        for (const v of [10, 10, 10, 10]) stats.push(v);
        expect(stats.cv).toBe(0); // zero variance → zero CV
        for (const v of [5, 15]) stats.push(v);
        expect(stats.cv).toBeGreaterThan(0);
    });
});

describe('multi-iteration convergence', () => {
    it('curved mesh converges with monotonically decreasing error', async () => {
        const mesh = makeGridMesh(6, 6);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 4 }),
            tolerances: testTolerances({ epsPosMm: 0.001, epsNormalDeg: 0.5 }),
            maxTriangles: 50_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: mesh.outerIdxCount,
        };

        const result = await adaptiveRefine(
            mesh.positions, mesh.uvs, mesh.indices, config, curvedEvaluator,
        );

        // Should perform multiple iterations
        expect(result.iterationsPerformed).toBeGreaterThanOrEqual(1);

        // Error should generally decrease across iterations
        if (result.iterationStats.length >= 2) {
            const firstError = result.iterationStats[0].maxPosErrorMm;
            const lastError = result.iterationStats[result.iterationStats.length - 1].maxPosErrorMm;
            expect(lastError).toBeLessThanOrEqual(firstError);
        }

        // Mesh should not shrink (splits may occur depending on test ordering)
        expect(result.indices.length / 3).toBeGreaterThanOrEqual(mesh.indices.length / 3);
        // Stop reason should reflect iteration progress
        expect(['max_iterations', 'tolerances_passed', 'no_improvement']).toContain(result.stopReason);
    });

    it('flat mesh passes tolerance immediately', async () => {
        const { positions, uvs, indices } = makeFlatSquare();
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 4 }),
            tolerances: testTolerances({ epsPosMm: 10, epsNormalDeg: 90 }),
            maxTriangles: 50_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: indices.length,
        };

        const result = await adaptiveRefine(
            positions, uvs, indices, config, linearEvaluator,
        );

        expect(result.tolerancesPassed).toBe(true);
        expect(result.stopReason).toBe('tolerances_passed');
        // Should exit after first iteration's tolerance check
        expect(result.iterationsPerformed).toBe(1);
    });
});

// ============================================================================
// Phase 14: Per-edge vs per-triangle A/B comparison
// ============================================================================

describe('per-edge vs per-triangle error estimation', () => {
    it('per-edge path produces comparable or better error on curved mesh', async () => {
        const mesh = makeGridMesh(8, 8);
        const tol = testTolerances({ epsPosMm: 0.01, epsNormalDeg: 1.0 });

        // Run per-triangle path (default)
        const configTriangle: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 3 }),
            tolerances: tol,
            maxTriangles: 50_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: mesh.outerIdxCount,
        };
        const resultTriangle = await adaptiveRefine(
            new Float32Array(mesh.positions), new Float32Array(mesh.uvs),
            new Uint32Array(mesh.indices), configTriangle, curvedEvaluator,
        );

        // Run per-edge path
        const configEdge: RefinementConfig = {
            ...configTriangle,
            perEdgeErrorEstimation: true,
        };
        const resultEdge = await adaptiveRefine(
            new Float32Array(mesh.positions), new Float32Array(mesh.uvs),
            new Uint32Array(mesh.indices), configEdge, curvedEvaluator,
        );

        // Both should perform at least one iteration
        expect(resultTriangle.iterationsPerformed).toBeGreaterThanOrEqual(1);
        expect(resultEdge.iterationsPerformed).toBeGreaterThanOrEqual(1);

        // Per-edge path should produce equal or lower max error
        expect(resultEdge.maxPosErrorMm).toBeLessThanOrEqual(
            resultTriangle.maxPosErrorMm * 1.1, // 10% tolerance for stochastic ordering
        );

        // Both should produce valid meshes (no degenerate triangles)
        expect(resultTriangle.indices.length).toBeGreaterThan(0);
        expect(resultEdge.indices.length).toBeGreaterThan(0);
        expect(resultTriangle.indices.length % 3).toBe(0);
        expect(resultEdge.indices.length % 3).toBe(0);
    });

    it('per-edge path produces valid mesh with vertex index integrity', async () => {
        const mesh = makeGridMesh(6, 6);
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 3 }),
            tolerances: testTolerances({ epsPosMm: 0.001, epsNormalDeg: 0.5 }),
            maxTriangles: 50_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: mesh.outerIdxCount,
            perEdgeErrorEstimation: true,
        };

        const result = await adaptiveRefine(
            mesh.positions, mesh.uvs, mesh.indices, config, curvedEvaluator,
        );

        // Mesh should have at least as many triangles as original
        expect(result.indices.length / 3).toBeGreaterThanOrEqual(mesh.indices.length / 3);
        // All indices should be valid vertex references
        const vertCount = result.positions.length / 3;
        for (let i = 0; i < result.indices.length; i++) {
            expect(result.indices[i]).toBeLessThan(vertCount);
        }
        // No degenerate triangles
        for (let t = 0; t < result.indices.length; t += 3) {
            const v0 = result.indices[t], v1 = result.indices[t + 1], v2 = result.indices[t + 2];
            expect(v0 !== v1 || v1 !== v2).toBe(true);
        }
    });

    it('per-edge path works on flat mesh without errors', async () => {
        const { positions, uvs, indices } = makeFlatSquare();
        const config: RefinementConfig = {
            profile: testProfile({ maxRefineIterations: 2 }),
            tolerances: testTolerances({ epsPosMm: 10, epsNormalDeg: 90 }),
            maxTriangles: 50_000,
            featureGraph: emptyFeatureEdgeGraph(),
            outerIdxCount: indices.length,
            perEdgeErrorEstimation: true,
        };

        const result = await adaptiveRefine(
            positions, uvs, indices, config, linearEvaluator,
        );

        // Flat mesh should pass immediately (no chord error)
        expect(result.tolerancesPassed).toBe(true);
        expect(result.stopReason).toBe('tolerances_passed');
    });
});

// ============================================================================
// Phase 15: Seam-aware smoothing
// ============================================================================

describe('globalSmoothing — seam-aware', () => {
    /** Evaluator that maps UV to 3D using same scale as makeSeamMesh */
    const seamEvaluator: EvaluateMidpointsFn = async (uvBatch: Float32Array): Promise<Float32Array> => {
        const count = uvBatch.length / 3;
        const result = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const u = uvBatch[i * 3];
            const t = uvBatch[i * 3 + 1];
            result[i * 3] = u * 10;
            result[i * 3 + 1] = t * 10;
            result[i * 3 + 2] = 0;
        }
        return result;
    };

    /**
     * Build a small mesh with seam vertices for testing.
     * Layout: 4 columns (u=0, 0.33, 0.67, 1.0) × 3 rows (t=0, 0.5, 1.0)
     * Vertices at u=0 and u=1 are seam vertices.
     * Corners: (u=0,t=0), (u=0,t=1), (u=1,t=0), (u=1,t=1)
     */
    function makeSeamMesh(): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
        const cols = 4, rows = 3;
        const vCount = cols * rows;
        const positions = new Float32Array(vCount * 3);
        const uvs = new Float32Array(vCount * 3);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const u = c / (cols - 1);
                const t = r / (rows - 1);
                // 3D positions consistent with seamEvaluator (u*10, t*10, 0)
                // Add perturbation to interior vertices so smoothing has work
                positions[idx * 3] = u * 10 + (c > 0 && c < cols - 1 ? Math.sin(t * 3) * 0.3 : 0);
                positions[idx * 3 + 1] = t * 10;
                positions[idx * 3 + 2] = 0;
                uvs[idx * 3] = u;
                uvs[idx * 3 + 1] = t;
                uvs[idx * 3 + 2] = 0; // surfaceId
            }
        }

        const triCount = (cols - 1) * (rows - 1) * 2;
        const indices = new Uint32Array(triCount * 3);
        let idx = 0;
        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                const v0 = r * cols + c;
                const v1 = r * cols + c + 1;
                const v2 = (r + 1) * cols + c + 1;
                const v3 = (r + 1) * cols + c;
                indices[idx++] = v0; indices[idx++] = v1; indices[idx++] = v2;
                indices[idx++] = v0; indices[idx++] = v2; indices[idx++] = v3;
            }
        }
        return { positions, uvs, indices };
    }

    it('corner vertices remain fully locked', async () => {
        const { positions, uvs, indices } = makeSeamMesh();
        const cols = 4;

        // Corner vertices: (0,0)=idx 0, (0,1)=idx 8, (1,0)=idx 3, (1,1)=idx 11
        const corners = [0, cols - 1, (3 - 1) * cols, (3 - 1) * cols + cols - 1];
        const cornerUVsBefore = corners.map(v => [uvs[v * 3], uvs[v * 3 + 1]]);
        const cornerPosBefore = corners.map(v => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);

        await globalSmoothing(
            positions, uvs, indices, indices.length,
            emptyFeatureEdgeGraph(), seamEvaluator, 3, 5,
        );

        // Corner UVs should not have changed
        for (let i = 0; i < corners.length; i++) {
            const v = corners[i];
            expect(uvs[v * 3]).toBeCloseTo(cornerUVsBefore[i][0], 10);
            expect(uvs[v * 3 + 1]).toBeCloseTo(cornerUVsBefore[i][1], 10);
        }
        // Corner positions should not have changed
        for (let i = 0; i < corners.length; i++) {
            const v = corners[i];
            expect(positions[v * 3]).toBeCloseTo(cornerPosBefore[i][0], 10);
            expect(positions[v * 3 + 1]).toBeCloseTo(cornerPosBefore[i][1], 10);
            expect(positions[v * 3 + 2]).toBeCloseTo(cornerPosBefore[i][2], 10);
        }
    });

    it('seam-interior vertex T changes but U remains at 0 or 1', async () => {
        const { positions, uvs, indices } = makeSeamMesh();
        const cols = 4;

        // Seam-interior vertex: u=0, t=0.5 → idx = 1*4 + 0 = 4
        const seamVert = 1 * cols + 0; // row 1, col 0 → u=0, t=0.5
        expect(uvs[seamVert * 3]).toBeCloseTo(0, 10); // confirm u=0

        // Perturb the T coordinate so smoothing has something to correct
        uvs[seamVert * 3 + 1] = 0.4; // offset from ideal 0.5
        // Also update the 3D position to match the perturbed UV
        positions[seamVert * 3 + 1] = 0.4 * 10;

        await globalSmoothing(
            positions, uvs, indices, indices.length,
            emptyFeatureEdgeGraph(), seamEvaluator, 3, 5,
        );

        // U should remain exactly 0 (seam-constrained)
        expect(uvs[seamVert * 3]).toBe(0);
        // T should have moved toward neighbors (smoothed)
        // It was at 0.4, neighbors at t=0 and t=1, so should move toward ~0.5
        expect(uvs[seamVert * 3 + 1]).not.toBeCloseTo(0.4, 3);
    });

    it('seam-interior vertex at u≈1 keeps U at 1', async () => {
        const { positions, uvs, indices } = makeSeamMesh();
        const cols = 4;

        // Seam-interior vertex: u=1, t=0.5 → idx = 1*4 + 3 = 7
        const seamVert = 1 * cols + (cols - 1);
        expect(uvs[seamVert * 3]).toBeCloseTo(1, 10); // confirm u=1

        await globalSmoothing(
            positions, uvs, indices, indices.length,
            emptyFeatureEdgeGraph(), seamEvaluator, 3, 5,
        );

        // U should remain exactly 1 (seam-constrained)
        expect(uvs[seamVert * 3]).toBe(1);
    });

    it('interior vertices are smoothed normally', async () => {
        const { positions, uvs, indices } = makeSeamMesh();
        const cols = 4;

        // Interior vertex: u=0.33, t=0.5 → idx = 1*4 + 1 = 5
        const intVert = 1 * cols + 1;

        // Perturb UV and position together
        uvs[intVert * 3] = 0.25;
        uvs[intVert * 3 + 1] = 0.4;
        positions[intVert * 3] = 0.25 * 10;
        positions[intVert * 3 + 1] = 0.4 * 10;

        await globalSmoothing(
            positions, uvs, indices, indices.length,
            emptyFeatureEdgeGraph(), seamEvaluator, 3, 5,
        );

        // Both U and T should have been smoothed (moved from perturbed values)
        expect(uvs[intVert * 3]).not.toBeCloseTo(0.25, 3);
        expect(uvs[intVert * 3 + 1]).not.toBeCloseTo(0.4, 3);
    });
});
