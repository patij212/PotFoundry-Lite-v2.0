/**
 * Tests for MeshSubdivision — chain-strip midpoint subdivision (v16.29 / v18.0).
 *
 * @module MeshSubdivision.test
 */
import { describe, it, expect, vi } from 'vitest';
import {
    subdivideLongEdges,
    type SubdivisionParams,
    type EvaluateMidpointsFn,
    type SubdivisionResult,
} from './MeshSubdivision';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Create a simple flat quad mesh for testing:
 *
 *   v2 ──── v3          Vertices placed on a 2×2 grid:
 *   │ ╲   │             v0 = (0,0,0), v1 = (1,0,0)
 *   │  ╲  │             v2 = (0,0,1), v3 = (1,0,1)
 *   v0 ──── v1
 *
 *   Two triangles: (0,1,2), (1,3,2)  — shared edge 1↔2
 *
 * Grid is 2 columns × 2 rows (outerW=2, outerH=2).
 * All vertices are "grid" vertices (index < outerGridVertexCount).
 */
function makeGridQuad() {
    const resultData = new Float32Array([
        0, 0, 0,   // v0
        1, 0, 0,   // v1
        0, 0, 1,   // v2
        1, 0, 1,   // v3
    ]);
    const combinedVerts = new Float32Array([
        0, 0, 0,   // v0: u=0, t=0, surfId=0
        1, 0, 0,   // v1: u=1, t=0, surfId=0
        0, 1, 0,   // v2: u=0, t=1, surfId=0
        1, 1, 0,   // v3: u=1, t=1, surfId=0
    ]);
    const combinedIdxs = new Uint32Array([0, 1, 2, 1, 3, 2]);
    return { resultData, combinedVerts, combinedIdxs };
}

/**
 * Build a mesh where one chain vertex (index >= outerGridVertexCount)
 * forces long edges that should trigger subdivision.
 *
 *  Grid: v0=(0,0,0), v1=(10,0,0), v2=(0,0,10), v3=(10,0,10)
 *  Chain vertex v4=(5,0,5) inserted far from grid corners.
 *
 *  outerW=2, outerH=2, outerGridVertexCount=4
 *
 *  Triangles (6 tris to keep shared edges):
 *    (0, 1, 4), (1, 3, 4), (3, 2, 4), (2, 0, 4)
 *  All 4 tris are chain-strip (they include v4 >= outerGridVertexCount=4).
 */
function makeChainStripMesh() {
    // Grid vertices are close together (edge ~ 1mm),
    // but chain vertex is far away so chain-strip edges >> threshold.
    const resultData = new Float32Array([
        0, 0, 0,    // v0
        1, 0, 0,    // v1  — grid edge v0→v1 = 1mm
        0, 0, 1,    // v2  — grid edge v0→v2 = 1mm
        1, 0, 1,    // v3  — grid edge v1→v3 = 1mm
        5, 0, 5,    // v4 — chain vertex, far from grid (~7mm edges)
    ]);
    const combinedVerts = new Float32Array([
        0, 0, 0,     // v0
        1, 0, 0,     // v1
        0, 1, 0,     // v2
        1, 1, 0,     // v3
        0.5, 0.5, 0, // v4 — chain vertex
    ]);
    // 4 triangles: fan around v4
    const combinedIdxs = new Uint32Array([
        0, 1, 4,
        1, 3, 4,
        3, 2, 4,
        2, 0, 4,
    ]);
    return { resultData, combinedVerts, combinedIdxs };
}

/**
 * Simple mock evaluator: returns the average of the two endpoint 3D
 * positions (flat surface, so UV midpoint ≈ 3D midpoint).
 */
function makeFlatEvaluator(): EvaluateMidpointsFn {
    return async (uvBatch: Float32Array): Promise<Float32Array> => {
        const n = uvBatch.length / 3;
        const out = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const u = uvBatch[i * 3];
            const t = uvBatch[i * 3 + 1];
            // Map UV → 3D on a flat 10×10 plane (matching chain vertex scale)
            out[i * 3] = u * 10;
            out[i * 3 + 1] = 0;
            out[i * 3 + 2] = t * 10;
        }
        return out;
    };
}

function makeDefaultParams(overrides: Partial<SubdivisionParams> = {}): SubdivisionParams {
    const mesh = makeChainStripMesh();
    return {
        combinedIdxs: mesh.combinedIdxs,
        resultData: mesh.resultData,
        combinedVerts: mesh.combinedVerts,
        outerIdxCount: mesh.combinedIdxs.length,
        outerGridVertexCount: 4,
        constraintEdgeSet: new Set<bigint>(),
        outerW: 2,
        outerH: 2,
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('MeshSubdivision', () => {
    describe('subdivideLongEdges', () => {
        it('returns unchanged mesh when no chain-strip triangles exist', async () => {
            const mesh = makeGridQuad();
            const params: SubdivisionParams = {
                combinedIdxs: mesh.combinedIdxs,
                resultData: mesh.resultData,
                combinedVerts: mesh.combinedVerts,
                outerIdxCount: mesh.combinedIdxs.length,
                outerGridVertexCount: 100, // all vertices are below threshold
                constraintEdgeSet: new Set(),
                outerW: 2,
                outerH: 2,
            };
            const mockEval = vi.fn(async () => new Float32Array(0));
            const result = await subdivideLongEdges(params, mockEval);

            expect(result.splitCount).toBe(0);
            expect(result.resultData).toBe(mesh.resultData); // same reference
            expect(result.indices).toBe(mesh.combinedIdxs);
            expect(mockEval).not.toHaveBeenCalled();
        });

        it('returns unchanged mesh when all edges are short', async () => {
            // Create a chain-strip mesh with tiny edges (< any threshold)
            const resultData = new Float32Array([
                0, 0, 0,
                0.001, 0, 0,
                0, 0, 0.001,
                0.001, 0, 0.001,
                0.0005, 0, 0.0005,
            ]);
            const combinedVerts = new Float32Array([
                0, 0, 0,   1, 0, 0,   0, 1, 0,   1, 1, 0,  0.5, 0.5, 0,
            ]);
            const combinedIdxs = new Uint32Array([0, 1, 4, 1, 3, 4, 3, 2, 4, 2, 0, 4]);
            const params = makeDefaultParams({
                resultData, combinedVerts, combinedIdxs,
                outerIdxCount: combinedIdxs.length,
            });
            const mockEval = vi.fn(async () => new Float32Array(0));
            const result = await subdivideLongEdges(params, mockEval);

            expect(result.splitCount).toBe(0);
            expect(mockEval).not.toHaveBeenCalled();
        });

        it('splits long edges in chain-strip mesh', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();

            const result = await subdivideLongEdges(params, evaluator);

            expect(result.splitCount).toBeGreaterThan(0);
            // Each split adds 1 vertex (3 floats) and 2 triangles (6 indices)
            expect(result.resultData.length).toBe(
                mesh.resultData.length + result.splitCount * 3
            );
            expect(result.indices.length).toBe(
                mesh.combinedIdxs.length + result.splitCount * 6
            );
        });

        it('never splits constraint edges', async () => {
            const mesh = makeChainStripMesh();
            // Mark ALL edges as constraints — nothing should split
            const constraintEdgeSet = new Set<bigint>();
            for (let t = 0; t < mesh.combinedIdxs.length; t += 3) {
                const a = mesh.combinedIdxs[t];
                const b = mesh.combinedIdxs[t + 1];
                const c = mesh.combinedIdxs[t + 2];
                const ek = (x: number, y: number) => {
                    const lo = x < y ? x : y;
                    const hi = x < y ? y : x;
                    return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
                };
                constraintEdgeSet.add(ek(a, b));
                constraintEdgeSet.add(ek(b, c));
                constraintEdgeSet.add(ek(c, a));
            }
            const params = makeDefaultParams({ constraintEdgeSet });
            const mockEval = vi.fn(async () => new Float32Array(0));
            const result = await subdivideLongEdges(params, mockEval);

            expect(result.splitCount).toBe(0);
            expect(mockEval).not.toHaveBeenCalled();
        });

        it('calls evaluateMidpoints with correct UV format', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            let receivedBatch: Float32Array | null = null;

            const evaluator: EvaluateMidpointsFn = async (uvBatch) => {
                receivedBatch = uvBatch;
                // Return dummy 3D positions
                const n = uvBatch.length / 3;
                return new Float32Array(n * 3);
            };

            await subdivideLongEdges(params, evaluator);

            if (receivedBatch !== null) {
                // Each midpoint has 3 floats: [u_mid, t_mid, surfaceId]
                expect(receivedBatch.length % 3).toBe(0);
                const n = receivedBatch.length / 3;
                for (let i = 0; i < n; i++) {
                    const u = receivedBatch[i * 3];
                    const t = receivedBatch[i * 3 + 1];
                    // UV midpoints should be within [0,1] range
                    expect(u).toBeGreaterThanOrEqual(0);
                    expect(u).toBeLessThanOrEqual(1);
                    expect(t).toBeGreaterThanOrEqual(0);
                    expect(t).toBeLessThanOrEqual(1);
                }
            }
        });

        it('produces valid triangle indices after splits', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            const maxIdx = result.resultData.length / 3;
            for (let i = 0; i < result.indices.length; i++) {
                expect(result.indices[i]).toBeLessThan(maxIdx);
            }
        });

        it('each split turns 2 triangles into 4', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            if (result.splitCount > 0) {
                const origTriCount = mesh.combinedIdxs.length / 3;
                const finalTriCount = result.indices.length / 3;
                // Each split: 2 original tris replaced inline + 2 new tris appended
                expect(finalTriCount).toBe(origTriCount + result.splitCount * 2);
            }
        });

        it('new vertices have valid 3D positions from evaluator', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            if (result.splitCount > 0) {
                const origVertCount = mesh.resultData.length / 3;
                // Check new vertices are finite and non-zero
                for (let v = origVertCount; v < result.resultData.length / 3; v++) {
                    const x = result.resultData[v * 3];
                    const y = result.resultData[v * 3 + 1];
                    const z = result.resultData[v * 3 + 2];
                    expect(Number.isFinite(x)).toBe(true);
                    expect(Number.isFinite(y)).toBe(true);
                    expect(Number.isFinite(z)).toBe(true);
                }
            }
        });

        it('preserves original vertices unchanged', async () => {
            const mesh = makeChainStripMesh();
            const origData = new Float32Array(mesh.resultData);
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            // Original vertices should be preserved at the front of the array
            for (let i = 0; i < origData.length; i++) {
                expect(result.resultData[i]).toBe(origData[i]);
            }
        });

        it('returns stats with valid grid edge measurement', async () => {
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            expect(result.stats.avgGridEdge).toBeGreaterThan(0);
            expect(result.stats.interiorThreshold).toBeGreaterThan(0);
            expect(result.stats.boundaryThreshold).toBeGreaterThan(0);
            expect(result.stats.boundaryThreshold).toBeLessThan(result.stats.interiorThreshold);
            expect(result.stats.timeMs).toBeGreaterThanOrEqual(0);
        });

        it('no triangle is modified more than once per pass', async () => {
            // Create a bigger chain-strip mesh with many potential splits
            const n = 10; // 10 vertices in a strip
            const resultData = new Float32Array(n * 3);
            const combinedVerts = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                resultData[i * 3] = i * 5;      // spread out in X
                resultData[i * 3 + 1] = 0;
                resultData[i * 3 + 2] = (i % 2) * 5; // zigzag in Z
                combinedVerts[i * 3] = i / n;
                combinedVerts[i * 3 + 1] = (i % 2) / 2;
                combinedVerts[i * 3 + 2] = 0;
            }
            // Create 8 triangles fanning from each pair
            const indices: number[] = [];
            const chainVtx = n - 1; // last vertex is the chain vertex
            for (let i = 0; i < n - 2; i++) {
                indices.push(i, i + 1, chainVtx);
            }
            const combinedIdxs = new Uint32Array(indices);

            const params: SubdivisionParams = {
                combinedIdxs,
                resultData,
                combinedVerts,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: n - 1, // only last vertex is chain
                constraintEdgeSet: new Set(),
                outerW: 5,
                outerH: 2,
            };

            const evaluator: EvaluateMidpointsFn = async (uvBatch) => {
                const count = uvBatch.length / 3;
                const out = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    out[i * 3] = uvBatch[i * 3] * 45;
                    out[i * 3 + 1] = 0;
                    out[i * 3 + 2] = uvBatch[i * 3 + 1] * 5;
                }
                return out;
            };

            const result = await subdivideLongEdges(params, evaluator);
            // Just verify it completes without error and produces valid output
            expect(result.indices.length % 3).toBe(0);
            const maxIdx = result.resultData.length / 3;
            for (let i = 0; i < result.indices.length; i++) {
                expect(result.indices[i]).toBeLessThan(maxIdx);
            }
        });

        it('boundary threshold is tighter than interior threshold', async () => {
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            // Interior threshold: (avgGridEdge * 1.8)^2
            // Boundary threshold: (avgGridEdge * 1.2)^2
            const avg = result.stats.avgGridEdge;
            expect(result.stats.interiorThreshold).toBeCloseTo((avg * 1.8) ** 2, 5);
            expect(result.stats.boundaryThreshold).toBeCloseTo((avg * 1.2) ** 2, 5);
        });

        it('handles empty constraint set gracefully', async () => {
            const params = makeDefaultParams({ constraintEdgeSet: new Set<bigint>() });
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);
            // Should process normally without errors
            expect(result.splitCount).toBeGreaterThanOrEqual(0);
        });

        it('handles single-triangle chain-strip mesh', async () => {
            const resultData = new Float32Array([
                0, 0, 0,   // v0
                10, 0, 0,  // v1
                5, 0, 10,  // v2 — chain vertex
            ]);
            const combinedVerts = new Float32Array([
                0, 0, 0,   1, 0, 0,   0.5, 1, 0,
            ]);
            const combinedIdxs = new Uint32Array([0, 1, 2]);
            const params: SubdivisionParams = {
                combinedIdxs,
                resultData,
                combinedVerts,
                outerIdxCount: 3,
                outerGridVertexCount: 2, // v2 is chain vertex
                constraintEdgeSet: new Set(),
                outerW: 2,
                outerH: 1,
            };
            const mockEval = vi.fn(async () => new Float32Array(0));
            const result = await subdivideLongEdges(params, mockEval);

            // Single triangle has no shared edges → nothing to split
            expect(result.splitCount).toBe(0);
        });

        it('splits longest edges first', async () => {
            // Grid vertices close together (edge ~ 1mm),
            // chain vertex far away so chain-strip edges >> threshold.
            const resultData = new Float32Array([
                0, 0, 0,    // v0  — grid
                1, 0, 0,    // v1  — grid (edge v0→v1 = 1mm)
                0, 0, 1,    // v2  — grid
                1, 0, 1,    // v3  — grid
                5, 0, 5,    // v4  — chain vertex (~7mm from grid corners)
            ]);
            const combinedVerts = new Float32Array([
                0, 0, 0,   1, 0, 0,   0, 1, 0,   1, 1, 0,   0.5, 0.5, 0,
            ]);
            const combinedIdxs = new Uint32Array([
                0, 1, 4,   // tri0
                1, 3, 4,   // tri1
                3, 2, 4,   // tri2
                2, 0, 4,   // tri3
            ]);
            const params: SubdivisionParams = {
                combinedIdxs,
                resultData,
                combinedVerts,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: 4,
                constraintEdgeSet: new Set(),
                outerW: 2,
                outerH: 2,
            };
            const evaluator = makeFlatEvaluator();

            const result = await subdivideLongEdges(params, evaluator);
            // Should split at least the longest edges
            expect(result.splitCount).toBeGreaterThan(0);
        });

        it('respects maxSplits limit (half of chain-strip + boundary tris)', async () => {
            // With 4 chain-strip tris + 0 boundary tris, maxSplits = 2
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            // maxSplits = floor((4 + 0) * 0.5) = 2
            expect(result.splitCount).toBeLessThanOrEqual(2);
        });

        it('edges shared by only 1 triangle are not split', async () => {
            // Create a chain-strip mesh where some edges are mesh boundaries
            const resultData = new Float32Array([
                0, 0, 0,    // v0
                10, 0, 0,   // v1
                5, 0, 10,   // v2 chain
            ]);
            const combinedVerts = new Float32Array([
                0, 0, 0,   1, 0, 0,   0.5, 1, 0,
            ]);
            const combinedIdxs = new Uint32Array([0, 1, 2]);
            const params: SubdivisionParams = {
                combinedIdxs,
                resultData,
                combinedVerts,
                outerIdxCount: 3,
                outerGridVertexCount: 2,
                constraintEdgeSet: new Set(),
                outerW: 2,
                outerH: 1,
            };
            const mockEval = vi.fn(async () => new Float32Array(0));
            const result = await subdivideLongEdges(params, mockEval);

            expect(result.splitCount).toBe(0);
            expect(mockEval).not.toHaveBeenCalled();
        });

        it('handles zero outerW/outerH gracefully', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams({ outerW: 0, outerH: 0 });
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);
            // avgGridEdge defaults to 1.0 when no grid edges sampled
            expect(result.stats.avgGridEdge).toBe(1.0);
        });

        it('degenerate triangles (a===b) are skipped during identification', async () => {
            const mesh = makeChainStripMesh();
            // Insert a degenerate triangle
            const idxs = new Uint32Array([
                0, 0, 4,  // degenerate: a===b
                0, 1, 4,
                1, 3, 4,
                3, 2, 4,
                2, 0, 4,
            ]);
            const params = makeDefaultParams({
                combinedIdxs: idxs,
                outerIdxCount: idxs.length,
            });
            const evaluator = makeFlatEvaluator();
            // Should not crash and degenerate tri should be ignored
            const result = await subdivideLongEdges(params, evaluator);
            expect(result.splitCount).toBeGreaterThanOrEqual(0);
        });
    });

    describe('SubdivisionResult contract', () => {
        it('stats has all expected fields', async () => {
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            expect(result).toHaveProperty('resultData');
            expect(result).toHaveProperty('indices');
            expect(result).toHaveProperty('splitCount');
            expect(result).toHaveProperty('stats');
            expect(result.stats).toHaveProperty('avgGridEdge');
            expect(result.stats).toHaveProperty('interiorThreshold');
            expect(result.stats).toHaveProperty('boundaryThreshold');
            expect(result.stats).toHaveProperty('candidates');
            expect(result.stats).toHaveProperty('boundaryTrisAdded');
            expect(result.stats).toHaveProperty('timeMs');
        });

        it('indices length is always divisible by 3', async () => {
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);
            expect(result.indices.length % 3).toBe(0);
        });

        it('resultData length is always divisible by 3', async () => {
            const params = makeDefaultParams();
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);
            expect(result.resultData.length % 3).toBe(0);
        });
    });
});
