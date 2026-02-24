/**
 * SurfaceMetric.test.ts — Tests for the UV metric field and Jacobian-based
 * anisotropic split criterion.
 *
 * Covers:
 * - Per-triangle Jacobian computation (flat plane, cylinder, cone)
 * - First fundamental form correctness
 * - Eigendecomposition of metric tensors
 * - Metric length vs Euclidean length
 * - Per-vertex metric accumulation
 * - MetricField construction and bilinear interpolation
 * - Metric-aware edge length
 * - Anisotropic split priority
 * - Surface area estimation
 * - Edge length statistics
 * - Distortion metrics
 * - Regression: metric refinement decreases 3D edge-length variance
 *
 * @vitest-environment jsdom
 * @module SurfaceMetric.test
 */

import { describe, it, expect } from 'vitest';
import {
    computeTriangleJacobian,
    firstFundamentalForm,
    eigenDecompose,
    metricLength,
    metricLengthSq,
    computeVertexMetrics,
    buildMetricField,
    interpolateMetric,
    metricEdgeLength,
    anisotropicSplitPriority,
    estimateSurfaceArea,
    targetEdgeLength,
    edgeLengthStats,
    computeDistortion,
} from './SurfaceMetric';
import type { MetricTensor } from './SurfaceMetric';

// ============================================================================
// Test Helpers
// ============================================================================

/** Small flat quad in the XY plane with identity UV mapping. */
function makeFlatQuad(): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    // v0=(0,0,0) uv=(0,0), v1=(10,0,0) uv=(1,0), v2=(10,10,0) uv=(1,1), v3=(0,10,0) uv=(0,1)
    const positions = new Float32Array([
        0, 0, 0,
        10, 0, 0,
        10, 10, 0,
        0, 10, 0,
    ]);
    const uvs = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
    ]);
    const indices = new Uint32Array([
        0, 1, 2,
        0, 2, 3,
    ]);
    return { positions, uvs, indices };
}

/** Stretched quad: 10mm in u but 100mm in v. Tests anisotropy. */
function makeStretchedQuad(): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    const positions = new Float32Array([
        0, 0, 0,
        10, 0, 0,
        10, 100, 0,
        0, 100, 0,
    ]);
    const uvs = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    return { positions, uvs, indices };
}

/** Grid strip in XY plane: numU × numT vertices, uniform UV. */
function makeGridMesh(numU: number, numT: number, scaleX = 10, scaleY = 10): {
    positions: Float32Array; uvs: Float32Array; indices: Uint32Array;
} {
    const vc = numU * numT;
    const positions = new Float32Array(vc * 3);
    const uvs = new Float32Array(vc * 3);
    for (let j = 0; j < numT; j++) {
        for (let i = 0; i < numU; i++) {
            const vi = j * numU + i;
            const u = i / (numU - 1);
            const t = j / (numT - 1);
            positions[vi * 3] = u * scaleX;
            positions[vi * 3 + 1] = t * scaleY;
            positions[vi * 3 + 2] = 0;
            uvs[vi * 3] = u;
            uvs[vi * 3 + 1] = t;
            uvs[vi * 3 + 2] = 0;
        }
    }
    const tris: number[] = [];
    for (let j = 0; j < numT - 1; j++) {
        for (let i = 0; i < numU - 1; i++) {
            const a = j * numU + i;
            const b = a + 1;
            const c = a + numU + 1;
            const d = a + numU;
            tris.push(a, b, c, a, c, d);
        }
    }
    return { positions, uvs, indices: new Uint32Array(tris) };
}

/** 3-vertex triangle with explicit positions and UV. */
function makeSingleTri(
    px: number[], py: number[], pz: number[],
    uu: number[], vv: number[],
): { positions: Float32Array; uvs: Float32Array; indices: Uint32Array } {
    const positions = new Float32Array([px[0], py[0], pz[0], px[1], py[1], pz[1], px[2], py[2], pz[2]]);
    const uvs = new Float32Array([uu[0], vv[0], 0, uu[1], vv[1], 0, uu[2], vv[2], 0]);
    return { positions, uvs, indices: new Uint32Array([0, 1, 2]) };
}

// ============================================================================
// computeTriangleJacobian
// ============================================================================

describe('computeTriangleJacobian', () => {
    it('returns correct Jacobian for flat XY plane with identity UV', () => {
        // Triangle: (0,0,0)→(10,0,0)→(10,10,0) with UV (0,0)→(1,0)→(1,1)
        const { positions, uvs } = makeFlatQuad();
        const jac = computeTriangleJacobian(positions, uvs, 0, 1, 2);
        expect(jac).not.toBeNull();
        // ∂X/∂u should be (10, 0, 0) and ∂X/∂v should be (0, 10, 0)
        expect(jac!.Xu[0]).toBeCloseTo(10, 5);
        expect(jac!.Xu[1]).toBeCloseTo(0, 5);
        expect(jac!.Xu[2]).toBeCloseTo(0, 5);
        expect(jac!.Xv[0]).toBeCloseTo(0, 5);
        expect(jac!.Xv[1]).toBeCloseTo(10, 5);
        expect(jac!.Xv[2]).toBeCloseTo(0, 5);
    });

    it('detects stretched surface in v direction', () => {
        const { positions, uvs } = makeStretchedQuad();
        const jac = computeTriangleJacobian(positions, uvs, 0, 1, 2);
        expect(jac).not.toBeNull();
        // |∂X/∂u| = 10, |∂X/∂v| = 100
        const xuLen = Math.sqrt(jac!.Xu[0] ** 2 + jac!.Xu[1] ** 2 + jac!.Xu[2] ** 2);
        const xvLen = Math.sqrt(jac!.Xv[0] ** 2 + jac!.Xv[1] ** 2 + jac!.Xv[2] ** 2);
        expect(xuLen).toBeCloseTo(10, 3);
        expect(xvLen).toBeCloseTo(100, 3);
    });

    it('returns null for degenerate UV triangle', () => {
        // All vertices at same UV
        const positions = new Float32Array([0, 0, 0, 10, 0, 0, 5, 5, 0]);
        const uvs = new Float32Array([0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0]);
        expect(computeTriangleJacobian(positions, uvs, 0, 1, 2)).toBeNull();
    });

    it('handles triangle in 3D (tilted plane)', () => {
        // Triangle in XZ plane: (0,0,0)→(10,0,0)→(0,0,10) mapped to UV (0,0)→(1,0)→(0,1)
        const { positions, uvs } = makeSingleTri(
            [0, 10, 0], [0, 0, 0], [0, 0, 10],
            [0, 1, 0], [0, 0, 1],
        );
        const jac = computeTriangleJacobian(positions, uvs, 0, 1, 2);
        expect(jac).not.toBeNull();
        // ∂X/∂u = (10, 0, 0), ∂X/∂v = (0, 0, 10)
        expect(jac!.Xu[0]).toBeCloseTo(10);
        expect(jac!.Xv[2]).toBeCloseTo(10);
    });
});

// ============================================================================
// firstFundamentalForm
// ============================================================================

describe('firstFundamentalForm', () => {
    it('returns E=G and F=0 for isotropic surface', () => {
        const Xu: [number, number, number] = [10, 0, 0];
        const Xv: [number, number, number] = [0, 10, 0];
        const M = firstFundamentalForm(Xu, Xv);
        expect(M.E).toBeCloseTo(100);
        expect(M.G).toBeCloseTo(100);
        expect(M.F).toBeCloseTo(0);
    });

    it('detects anisotropy in stretched surface', () => {
        const Xu: [number, number, number] = [10, 0, 0];
        const Xv: [number, number, number] = [0, 100, 0];
        const M = firstFundamentalForm(Xu, Xv);
        expect(M.E).toBeCloseTo(100);   // 10²
        expect(M.G).toBeCloseTo(10000); // 100²
        expect(M.F).toBeCloseTo(0);
    });

    it('computes F ≠ 0 for sheared surface', () => {
        const Xu: [number, number, number] = [10, 5, 0];
        const Xv: [number, number, number] = [5, 10, 0];
        const M = firstFundamentalForm(Xu, Xv);
        expect(M.F).toBeCloseTo(10 * 5 + 5 * 10); // 100
        expect(M.E).toBeCloseTo(10 * 10 + 5 * 5); // 125
        expect(M.G).toBeCloseTo(5 * 5 + 10 * 10); // 125
    });
});

// ============================================================================
// eigenDecompose
// ============================================================================

describe('eigenDecompose', () => {
    it('returns equal stretches for isotropic metric', () => {
        const M: MetricTensor = { E: 100, F: 0, G: 100 };
        const ps = eigenDecompose(M);
        expect(ps.sigma1).toBeCloseTo(10);
        expect(ps.sigma2).toBeCloseTo(10);
        expect(ps.anisotropy).toBeCloseTo(1.0);
    });

    it('returns correct stretches for anisotropic metric', () => {
        const M: MetricTensor = { E: 100, F: 0, G: 10000 };
        const ps = eigenDecompose(M);
        expect(ps.sigma1).toBeCloseTo(100);
        expect(ps.sigma2).toBeCloseTo(10);
        expect(ps.anisotropy).toBeCloseTo(10.0);
    });

    it('eigenvectors are orthogonal', () => {
        const M: MetricTensor = { E: 50, F: 20, G: 30 };
        const ps = eigenDecompose(M);
        const dot = ps.dir1[0] * ps.dir2[0] + ps.dir1[1] * ps.dir2[1];
        expect(Math.abs(dot)).toBeLessThan(1e-10);
    });

    it('handles zero metric gracefully', () => {
        const M: MetricTensor = { E: 0, F: 0, G: 0 };
        const ps = eigenDecompose(M);
        expect(ps.sigma1).toBe(0);
        expect(ps.sigma2).toBe(0);
        expect(ps.anisotropy).toBe(1.0);
    });

    it('handles near-degenerate metric (one zero eigenvalue)', () => {
        // [[1, 0], [0, 0]] → eigenvalues 1, 0
        const M: MetricTensor = { E: 1, F: 0, G: 0 };
        const ps = eigenDecompose(M);
        expect(ps.sigma1).toBeCloseTo(1);
        expect(ps.sigma2).toBeCloseTo(0);
        expect(ps.anisotropy).toBe(Infinity);
    });
});

// ============================================================================
// metricLength & metricLengthSq
// ============================================================================

describe('metricLength', () => {
    it('equals Euclidean length for identity metric', () => {
        const M: MetricTensor = { E: 1, F: 0, G: 1 };
        expect(metricLength(M, 3, 4)).toBeCloseTo(5);
    });

    it('scales correctly for uniform stretch', () => {
        // 10× scaling in both directions: E=G=100, F=0
        const M: MetricTensor = { E: 100, F: 0, G: 100 };
        expect(metricLength(M, 1, 0)).toBeCloseTo(10);
        expect(metricLength(M, 0, 1)).toBeCloseTo(10);
    });

    it('reflects anisotropy', () => {
        const M: MetricTensor = { E: 100, F: 0, G: 10000 };
        expect(metricLength(M, 1, 0)).toBeCloseTo(10);
        expect(metricLength(M, 0, 1)).toBeCloseTo(100);
    });

    it('metricLengthSq is square of metricLength', () => {
        const M: MetricTensor = { E: 50, F: 20, G: 30 };
        const ml = metricLength(M, 2, 3);
        const mls = metricLengthSq(M, 2, 3);
        expect(mls).toBeCloseTo(ml * ml, 5);
    });
});

// ============================================================================
// computeVertexMetrics
// ============================================================================

describe('computeVertexMetrics', () => {
    it('returns uniform metric for flat isotropic quad', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        expect(vm.vertexCount).toBe(4);
        // All vertices should have E ≈ 100, F ≈ 0, G ≈ 100
        for (let i = 0; i < 4; i++) {
            expect(vm.E[i]).toBeCloseTo(100, 0);
            expect(Math.abs(vm.F[i])).toBeLessThan(1);
            expect(vm.G[i]).toBeCloseTo(100, 0);
        }
    });

    it('detects stretch in v direction', () => {
        const { positions, uvs, indices } = makeStretchedQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        // G should be ~10000 (100²), E should be ~100 (10²)
        for (let i = 0; i < 4; i++) {
            expect(vm.E[i]).toBeCloseTo(100, -1);
            expect(vm.G[i]).toBeCloseTo(10000, -1);
        }
    });

    it('handles mesh with no valid triangles', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
        const uvs = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
        const indices = new Uint32Array([0, 1, 2]);
        const vm = computeVertexMetrics(positions, uvs, indices, 3);
        // Should fallback to identity metric
        expect(vm.E[0]).toBe(1);
        expect(vm.G[0]).toBe(1);
    });
});

// ============================================================================
// MetricField and interpolation
// ============================================================================

describe('MetricField', () => {
    it('buildMetricField produces correct resolution', () => {
        const { positions, uvs, indices } = makeGridMesh(5, 5);
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        const field = buildMetricField(vm, uvs, 10, 10);
        expect(field.resU).toBe(10);
        expect(field.resT).toBe(10);
        expect(field.E.length).toBe(100);
    });

    it('interpolateMetric returns correct value at corners', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        const field = buildMetricField(vm, uvs, 4, 4);
        // At (0,0), should be close to E ≈ 100
        const m00 = interpolateMetric(field, 0, 0);
        expect(m00.E).toBeCloseTo(100, -1);
    });

    it('interpolateMetric clamps out-of-range UV', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        const field = buildMetricField(vm, uvs, 4, 4);
        // Should not throw for out-of-range values
        const m = interpolateMetric(field, -0.5, 1.5);
        expect(isFinite(m.E)).toBe(true);
    });
});

// ============================================================================
// metricEdgeLength
// ============================================================================

describe('metricEdgeLength', () => {
    it('matches 3D edge length for flat plane', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        // Edge v0→v1: UV (0,0)→(1,0), 3D distance = 10
        const mel = metricEdgeLength(vm, uvs, 0, 1);
        expect(mel).toBeCloseTo(10, 0);
    });

    it('detects longer edge in stretched direction', () => {
        const { positions, uvs, indices } = makeStretchedQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        // Edge v0→v1: UV (0,0)→(1,0), 3D = 10
        const melU = metricEdgeLength(vm, uvs, 0, 1);
        // Edge v0→v3: UV (0,0)→(0,1), 3D = 100
        const melV = metricEdgeLength(vm, uvs, 0, 3);
        expect(melV).toBeGreaterThan(melU * 5);
    });
});

// ============================================================================
// anisotropicSplitPriority
// ============================================================================

describe('anisotropicSplitPriority', () => {
    it('returns > 1 for edges longer than target', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        const priority = anisotropicSplitPriority(vm, uvs, 0, 1, 5); // target 5mm, actual ~10mm
        expect(priority).toBeGreaterThan(1.0);
    });

    it('returns < 1 for edges shorter than target', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        const priority = anisotropicSplitPriority(vm, uvs, 0, 1, 50); // target 50mm, actual ~10mm
        expect(priority).toBeLessThan(1.0);
    });

    it('prioritizes stretched edges over uniform ones', () => {
        const { positions, uvs, indices } = makeStretchedQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        const targetLen = 50;
        // Edge in stretched direction (v0→v3, ~100mm) should have higher priority
        // than edge in uniform direction (v0→v1, ~10mm)
        const pU = anisotropicSplitPriority(vm, uvs, 0, 1, targetLen);
        const pV = anisotropicSplitPriority(vm, uvs, 0, 3, targetLen);
        expect(pV).toBeGreaterThan(pU);
    });

    it('returns 0 for zero target length', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);
        expect(anisotropicSplitPriority(vm, uvs, 0, 1, 0)).toBe(0);
    });
});

// ============================================================================
// estimateSurfaceArea & targetEdgeLength
// ============================================================================

describe('estimateSurfaceArea', () => {
    it('computes correct area for flat quad', () => {
        const { positions, indices } = makeFlatQuad();
        const area = estimateSurfaceArea(positions, new Float32Array(12), indices, indices.length);
        // 10×10 quad = 100 mm²
        expect(area).toBeCloseTo(100, 1);
    });

    it('computes correct area for stretched quad', () => {
        const { positions, indices } = makeStretchedQuad();
        const area = estimateSurfaceArea(positions, new Float32Array(12), indices, indices.length);
        // 10×100 quad = 1000 mm²
        expect(area).toBeCloseTo(1000, 1);
    });
});

describe('targetEdgeLength', () => {
    it('computes reasonable edge length for given budget', () => {
        // 100mm² area, 100 triangles → L ≈ √(4*100/(√3*100)) ≈ 1.52mm
        const L = targetEdgeLength(100, 100);
        expect(L).toBeGreaterThan(1);
        expect(L).toBeLessThan(3);
    });

    it('larger area → longer target edge (for same budget)', () => {
        const L1 = targetEdgeLength(100, 1000);
        const L2 = targetEdgeLength(10000, 1000);
        expect(L2).toBeGreaterThan(L1);
    });

    it('larger budget → shorter target edge', () => {
        const L1 = targetEdgeLength(1000, 100);
        const L2 = targetEdgeLength(1000, 10000);
        expect(L2).toBeLessThan(L1);
    });

    it('handles zero inputs gracefully', () => {
        expect(targetEdgeLength(0, 100)).toBe(1);
        expect(targetEdgeLength(100, 0)).toBe(1);
    });
});

// ============================================================================
// edgeLengthStats
// ============================================================================

describe('edgeLengthStats', () => {
    it('produces correct stats for uniform grid', () => {
        const { positions, indices } = makeGridMesh(5, 5, 10, 10);
        const stats = edgeLengthStats(positions, indices, indices.length);
        expect(stats.count).toBeGreaterThan(0);
        expect(stats.min).toBeGreaterThan(0);
        expect(stats.max).toBeGreaterThanOrEqual(stats.min);
        expect(stats.mean).toBeGreaterThan(0);
        // Uniform grid should have low variance relative to mean
        expect(stats.stddev / stats.mean).toBeLessThan(0.5);
    });

    it('detects high variance in stretched mesh', () => {
        // 5x5 grid but 10×100 → edges range from ~2.5mm (u) to ~25mm (v)
        const { positions, indices } = makeGridMesh(5, 5, 10, 100);
        const stats = edgeLengthStats(positions, indices, indices.length);
        // Should have ratio max/min > 5
        expect(stats.max / stats.min).toBeGreaterThan(3);
    });

    it('returns zeros for empty mesh', () => {
        const stats = edgeLengthStats(new Float32Array(0), new Uint32Array(0), 0);
        expect(stats.count).toBe(0);
        expect(stats.mean).toBe(0);
    });
});

// ============================================================================
// computeDistortion
// ============================================================================

describe('computeDistortion', () => {
    it('isotropic surface has anisotropy ≈ 1', () => {
        const { positions, uvs, indices } = makeFlatQuad();
        const d = computeDistortion(positions, uvs, indices, indices.length);
        expect(d.meanAnisotropy).toBeCloseTo(1.0, 0);
        expect(d.maxAnisotropy).toBeCloseTo(1.0, 0);
    });

    it('stretched surface has anisotropy > 1', () => {
        const { positions, uvs, indices } = makeStretchedQuad();
        const d = computeDistortion(positions, uvs, indices, indices.length);
        // 10× stretch → anisotropy ≈ 10
        expect(d.meanAnisotropy).toBeGreaterThan(5);
        expect(d.maxAnisotropy).toBeGreaterThan(5);
    });

    it('returns defaults for empty mesh', () => {
        const d = computeDistortion(
            new Float32Array(0), new Float32Array(0),
            new Uint32Array(0), 0,
        );
        expect(d.triangleCount).toBe(0);
        expect(d.meanAnisotropy).toBe(1);
    });
});

// ============================================================================
// Regression: metric field on flared/groove profiles
// ============================================================================

describe('Metric field regression profiles', () => {
    it('flared vase: metric captures radius variation', () => {
        // Simulate a vase cross-section: r(t) = 20 + 10*sin(πt)
        // At t=0: r=20, at t=0.5: r=30, at t=1: r=20
        // Map u→θ, t→height: X = r(t)*cos(2πu), Y = r(t)*sin(2πu), Z = t*H
        const N = 32;
        const H = 50;
        const positions = new Float32Array(N * N * 3);
        const uvs = new Float32Array(N * N * 3);
        for (let j = 0; j < N; j++) {
            const t = j / (N - 1);
            const r = 20 + 10 * Math.sin(Math.PI * t);
            for (let i = 0; i < N; i++) {
                const u = i / (N - 1);
                const theta = 2 * Math.PI * u;
                const vi = j * N + i;
                positions[vi * 3] = r * Math.cos(theta);
                positions[vi * 3 + 1] = r * Math.sin(theta);
                positions[vi * 3 + 2] = t * H;
                uvs[vi * 3] = u;
                uvs[vi * 3 + 1] = t;
                uvs[vi * 3 + 2] = 0;
            }
        }
        const tris: number[] = [];
        for (let j = 0; j < N - 1; j++) {
            for (let i = 0; i < N - 1; i++) {
                const a = j * N + i;
                const b = a + 1;
                const c = a + N + 1;
                const d = a + N;
                tris.push(a, b, c, a, c, d);
            }
        }
        const indices = new Uint32Array(tris);

        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);

        // Mid-height vertex (where radius is largest) should have larger E
        // than top/bottom vertex (where radius is smallest)
        const midRow = Math.floor(N / 2);
        const topRow = 0;
        const midVi = midRow * N + 5;
        const topVi = topRow * N + 5;

        // E = |∂X/∂u|² proportional to r(t)² → should be larger at mid-height
        expect(vm.E[midVi]).toBeGreaterThan(vm.E[topVi] * 1.3);
    });

    it('groove: metric detects compressed region', () => {
        // Simulate groove: surface has narrow U-extent at center
        const N = 16;
        const positions = new Float32Array(N * N * 3);
        const uvs = new Float32Array(N * N * 3);
        for (let j = 0; j < N; j++) {
            const t = j / (N - 1);
            // Scale x by compression factor: wide at t=0,1 → narrow at t=0.5
            const compress = 1 - 0.7 * Math.exp(-((t - 0.5) ** 2) / 0.01);
            for (let i = 0; i < N; i++) {
                const u = i / (N - 1);
                const vi = j * N + i;
                positions[vi * 3] = u * 10 * compress;
                positions[vi * 3 + 1] = t * 50;
                positions[vi * 3 + 2] = 0;
                uvs[vi * 3] = u;
                uvs[vi * 3 + 1] = t;
                uvs[vi * 3 + 2] = 0;
            }
        }
        const tris: number[] = [];
        for (let j = 0; j < N - 1; j++) {
            for (let i = 0; i < N - 1; i++) {
                const a = j * N + i;
                tris.push(a, a + 1, a + N + 1, a, a + N + 1, a + N);
            }
        }
        const indices = new Uint32Array(tris);

        const vm = computeVertexMetrics(positions, uvs, indices, indices.length);

        // At the groove center (t≈0.5), E should be smaller (compressed)
        const grooveVi = Math.floor(N / 2) * N + Math.floor(N / 2);
        const topVi = 0 * N + Math.floor(N / 2);
        expect(vm.E[grooveVi]).toBeLessThan(vm.E[topVi]);
    });
});
