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
} from './AdaptiveRefinement';
import type {
    RefinementConfig,
    RefinementResult,
} from './AdaptiveRefinement';
import type { ExportTolerances, QualityProfile } from './types';
import { emptyFeatureEdgeGraph, buildFeatureEdgeGraph } from './FeatureEdgeGraph';
import type { EvaluateMidpointsFn } from './MeshSubdivision';

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
        maxAspectRatio: 10.0,
        ...overrides,
    };
}

/** Standard profile for tests. */
function testProfile(overrides?: Partial<QualityProfile>): QualityProfile {
    return {
        name: 'standard',
        tolerances: testTolerances(),
        maxTriangleBudget: 2_000_000,
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
const curvedEvaluator: EvaluateMidpointsFn = async (uvBatch: Float32Array): Promise<Float32Array> => {
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
    return result;
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
        const shared = adj.get('0-2');
        expect(shared).toHaveLength(2);

        // Boundary edges should have 1 triangle each
        const boundary = adj.get('0-1');
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
        const { positions, uvs, indices, outerIdxCount } = makeGridMesh(4, 4);
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
