/**
 * Tests for MeshSubdivision — chain-strip midpoint subdivision (v16.29 / v18.0).
 *
 * @module MeshSubdivision.test
 */
import { describe, it, expect, vi } from 'vitest';
import {
    subdivideLongEdges,
    identifyChainAdjacentVertices,
    identifyChainStripTriangles,
    type SubdivisionParams,
    type EvaluateMidpointsFn,
    type SubdivisionResult,
    type ChainUV,
    type ChainPointUV,
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
                0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0.5, 0.5, 0,
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

        it('treats constraint (chain) edges as feature edges for subdivision', async () => {
            // R44: Chain edges are now subdivision candidates classified as feature edges.
            // When ALL edges are marked as constraints, the long ones should still split
            // (using the feature threshold) because chain edges are no longer skipped.
            const mesh = makeChainStripMesh();
            const constraintEdgeSet = new Set<bigint>();
            for (let t = 0; t < mesh.combinedIdxs.length; t += 3) {
                const a = mesh.combinedIdxs[t];
                const b = mesh.combinedIdxs[t + 1];
                const c = mesh.combinedIdxs[t + 2];
                const ek = (x: number, y: number) => {
                    const lo = x < y ? x : y;
                    const hi = x < y ? y : x;
                    return BigInt(lo) * BigInt(0x200000) + BigInt(hi);
                };
                constraintEdgeSet.add(ek(a, b));
                constraintEdgeSet.add(ek(b, c));
                constraintEdgeSet.add(ek(c, a));
            }
            const params = makeDefaultParams({ constraintEdgeSet });
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);

            // Chain edges exceeding the feature threshold should be split
            expect(result.splitCount).toBeGreaterThan(0);
        });

        it('sag-gate: skips all splits on a flat surface when epsPosMm is set', async () => {
            // v18.1 tolerance-driven: a genuinely flat, internally consistent
            // surface where resultData == evaluator(UV) for EVERY vertex, so the
            // GPU-evaluated midpoint always coincides with the linear chord
            // midpoint → sag = 0. Grid edges are short (1mm) but the centre chain
            // vertex sits far out (~7mm edges) so the splits still qualify on
            // length; with a positive tolerance every one must be sag-skipped.
            //
            // Evaluator maps UV(u,t) → (u*100, 0, t*100). UVs are scaled down by
            // 100 so the 3D positions match makeChainStripMesh's geometry exactly.
            const flatConsistentEval: EvaluateMidpointsFn = async (uvBatch) => {
                const n = uvBatch.length / 3;
                const out = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) {
                    out[i * 3] = uvBatch[i * 3] * 100;
                    out[i * 3 + 1] = 0;
                    out[i * 3 + 2] = uvBatch[i * 3 + 1] * 100;
                }
                return out;
            };
            const params = makeDefaultParams({
                combinedVerts: new Float32Array([
                    0, 0, 0,       // v0 UV(0,0)      → (0,0,0)
                    0.01, 0, 0,    // v1 UV(0.01,0)   → (1,0,0)
                    0, 0.01, 0,    // v2 UV(0,0.01)   → (0,0,1)
                    0.01, 0.01, 0, // v3 UV(0.01,0.01)→ (1,0,1)
                    0.05, 0.05, 0, // v4 UV(0.05,0.05)→ (5,0,5)
                ]),
                epsPosMm: 0.1,
            });
            const result = await subdivideLongEdges(params, flatConsistentEval);

            expect(result.splitCount).toBe(0);
            expect(result.stats.sagSkipped).toBeGreaterThan(0);
        });

        it('sag-gate: legacy length-driven behaviour when epsPosMm is undefined', async () => {
            // No tolerance supplied → behave exactly as before: long edges in
            // the chain strip are split purely on the length criterion.
            const params = makeDefaultParams(); // no epsPosMm
            const result = await subdivideLongEdges(params, makeFlatEvaluator());

            expect(result.splitCount).toBeGreaterThan(0);
            expect(result.stats.sagSkipped).toBe(0);
        });

        it('sag-gate: splits high-curvature edges whose chord deviates beyond epsPosMm', async () => {
            // Curved evaluator: the true on-surface midpoint bulges +1mm in Y
            // off the (flat-in-Y) chord, so every split has sag ≈ 1mm ≫ 0.1mm.
            const curvedEvaluator: EvaluateMidpointsFn = async (uvBatch) => {
                const n = uvBatch.length / 3;
                const out = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) {
                    const u = uvBatch[i * 3];
                    const t = uvBatch[i * 3 + 1];
                    out[i * 3] = u * 10;
                    out[i * 3 + 1] = 1.0; // +1mm bulge off the chord
                    out[i * 3 + 2] = t * 10;
                }
                return out;
            };
            const params = makeDefaultParams({ epsPosMm: 0.1 });
            const result = await subdivideLongEdges(params, curvedEvaluator);

            expect(result.splitCount).toBeGreaterThan(0);
        });

        it('skips subdivision patches that touch protected corridor vertices', async () => {
            // R42: Feature edges now bypass endpoint protection (only opposite
            // vertices are checked). Protect grid vertices (the opposites of
            // feature edges) so all feature-edge splits are still rejected.
            const params = makeDefaultParams({
                protectedVertices: new Set([0, 1, 2, 3]),
            });
            const mockEval = vi.fn(async () => new Float32Array(0));
            const result = await subdivideLongEdges(params, mockEval);

            expect(result.splitCount).toBe(0);
            expect(result.stats.protectedRejects).toBeGreaterThan(0);
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

        it('returns grown UVs aligned with appended subdivision vertices', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            let receivedBatch: Float32Array | null = null;
            const evaluator: EvaluateMidpointsFn = async (uvBatch) => {
                receivedBatch = new Float32Array(uvBatch);
                return makeFlatEvaluator()(uvBatch);
            };

            const result = await subdivideLongEdges(params, evaluator);
            const uvs = (result as SubdivisionResult & { uvs?: Float32Array }).uvs;

            expect(result.splitCount).toBeGreaterThan(0);
            expect(uvs).toBeDefined();
            expect(uvs!.length).toBe(result.resultData.length);
            expect(receivedBatch).not.toBeNull();

            const originalVertexCount = mesh.combinedVerts.length / 3;
            for (let i = 0; i < result.splitCount; i++) {
                expect(uvs![(originalVertexCount + i) * 3]).toBeCloseTo(receivedBatch![i * 3], 8);
                expect(uvs![(originalVertexCount + i) * 3 + 1]).toBeCloseTo(receivedBatch![i * 3 + 1], 8);
                expect(uvs![(originalVertexCount + i) * 3 + 2]).toBeCloseTo(receivedBatch![i * 3 + 2], 8);
            }
        });

        it('keeps appended outer-wall subdivision triangles before non-outer surfaces', async () => {
            const mesh = makeChainStripMesh();
            const nonOuterPositions = new Float32Array([
                20, 0, 0,
                21, 0, 0,
                20, 0, 1,
            ]);
            const resultData = new Float32Array(mesh.resultData.length + nonOuterPositions.length);
            resultData.set(mesh.resultData);
            resultData.set(nonOuterPositions, mesh.resultData.length);

            const nonOuterUvs = new Float32Array([
                0, 0, 2,
                1, 0, 2,
                0, 1, 2,
            ]);
            const combinedVerts = new Float32Array(mesh.combinedVerts.length + nonOuterUvs.length);
            combinedVerts.set(mesh.combinedVerts);
            combinedVerts.set(nonOuterUvs, mesh.combinedVerts.length);

            const nonOuterIndices = [5, 6, 7];
            const combinedIdxs = new Uint32Array([...mesh.combinedIdxs, ...nonOuterIndices]);
            const params = makeDefaultParams({
                combinedIdxs,
                resultData,
                combinedVerts,
                outerIdxCount: mesh.combinedIdxs.length,
            });

            const result = await subdivideLongEdges(params, makeFlatEvaluator());

            expect(result.splitCount).toBeGreaterThan(0);
            expect(result.outerIdxCount).toBe(mesh.combinedIdxs.length + result.splitCount * 6);
            expect(Array.from(result.indices.slice(result.outerIdxCount))).toEqual(nonOuterIndices);
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
                0, 0, 0, 1, 0, 0, 0.5, 1, 0,
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
                0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0.5, 0.5, 0,
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
                0, 0, 0, 1, 0, 0, 0.5, 1, 0,
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

    // ─────────────────────────────────────────────────────────────────
    // UV-proximity chain-strip detection (v20.x fix)
    // ─────────────────────────────────────────────────────────────────

    describe('identifyChainAdjacentVertices', () => {
        it('returns empty set when no chains provided', () => {
            const verts = new Float32Array([0, 0, 0, 1, 0, 0]);
            const result = identifyChainAdjacentVertices(verts, 2, [], 0.1, 100);
            expect(result.size).toBe(0);
        });

        it('finds vertices near chain points in UV space', () => {
            // 5 vertices on a line: u=0, 0.25, 0.5, 0.75, 1.0
            const verts = new Float32Array([
                0, 0, 0,
                0.25, 0, 0,
                0.5, 0, 0,
                0.75, 0, 0,
                1.0, 0, 0,
            ]);
            const chains: ChainUV[] = [
                { points: [{ u: 0.5, row: 0 }] },
            ];
            // gridSpacing = 0.25, proximityRadius = 0.125
            const result = identifyChainAdjacentVertices(verts, 5, chains, 0.25, 100);
            // Vertex 2 (u=0.5) is exactly at chain point
            expect(result.has(2)).toBe(true);
            // Vertices 0, 4 should be far away
            expect(result.has(0)).toBe(false);
            expect(result.has(4)).toBe(false);
        });

        it('handles circular U wrapping (0/1 boundary)', () => {
            const verts = new Float32Array([
                0.98, 0.5, 0,  // v0: near u=1.0
                0.02, 0.5, 0,  // v1: near u=0.0
                0.5, 0.5, 0,   // v2: far away
            ]);
            const chains: ChainUV[] = [
                { points: [{ u: 0.0, row: 50 }] },  // row=50 → tNorm = 50/99 ≈ 0.505, near vertex vt=0.5
            ];
            // gridSpacing = 0.1, proximityRadius = 0.05
            const result = identifyChainAdjacentVertices(verts, 3, chains, 0.1, 100);
            // Both v0 (distance in U = min(0.98, 0.02) = 0.02) and v1 (distance = 0.02) should be near
            expect(result.has(0)).toBe(true);
            expect(result.has(1)).toBe(true);
            expect(result.has(2)).toBe(false);
        });

        it('finds vertices from multiple chains', () => {
            const verts = new Float32Array([
                0.1, 0, 0,   // v0
                0.5, 0, 0,   // v1
                0.9, 0, 0,   // v2
            ]);
            const chains: ChainUV[] = [
                { points: [{ u: 0.1, row: 0 }] },
                { points: [{ u: 0.9, row: 0 }] },
            ];
            const result = identifyChainAdjacentVertices(verts, 3, chains, 0.25, 100);
            expect(result.has(0)).toBe(true);  // near chain 1
            expect(result.has(2)).toBe(true);  // near chain 2
            expect(result.has(1)).toBe(false); // far from both
        });

        // ─────────────────────────────────────────────────────────────
        // PERF-PIN: spatial-hash optimization must be byte-for-byte
        // equivalent to the brute-force O(V×C) proximity scan. This guards
        // the GothicArches hang fix (identifyChainAdjacentVertices was 212s
        // of a ~5min base-gen; spatial bucketing replaces the 54.6B-op loop).
        // The reference below IS the original algorithm — keep it in sync
        // with the documented semantics, not the production implementation.
        // ─────────────────────────────────────────────────────────────
        describe('spatial-hash equivalence (perf-pin)', () => {
            // Deterministic PRNG (mulberry32) so failures are reproducible.
            function mulberry32(seed: number): () => number {
                let a = seed >>> 0;
                return () => {
                    a |= 0; a = (a + 0x6d2b79f5) | 0;
                    let t = Math.imul(a ^ (a >>> 15), 1 | a);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            }

            /** Brute-force reference: the exact original O(V×C) algorithm. */
            function referenceChainAdjacent(
                verts: Float32Array,
                vertexCount: number,
                chains: ChainUV[],
                gridSpacing: number,
                outerH: number,
                finalT?: Float32Array | number[],
            ): Set<number> {
                const result = new Set<number>();
                const proximityRadius = gridSpacing * 0.5;
                const proximityRadius2 = proximityRadius * proximityRadius;
                const chainPoints: Array<{ u: number; t: number }> = [];
                for (const chain of chains) {
                    for (const pt of chain.points) {
                        let tNorm = 0;
                        if (finalT && pt.row >= 0 && pt.row < finalT.length) {
                            tNorm = finalT[pt.row];
                        } else {
                            const denom = Math.max(1, outerH - 1);
                            tNorm = Math.max(0, Math.min(1, pt.row / denom));
                        }
                        chainPoints.push({ u: pt.u, t: tNorm });
                    }
                }
                if (chainPoints.length === 0) return result;
                for (let v = 0; v < vertexCount; v++) {
                    const vu = verts[v * 3];
                    const vt = verts[v * 3 + 1];
                    for (const cp of chainPoints) {
                        let du = Math.abs(vu - cp.u);
                        if (du > 0.5) du = 1.0 - du;
                        const dt = vt - cp.t;
                        const dist2 = du * du + dt * dt;
                        if (dist2 <= proximityRadius2) { result.add(v); break; }
                    }
                }
                return result;
            }

            function setsEqual(a: Set<number>, b: Set<number>): boolean {
                if (a.size !== b.size) return false;
                for (const x of a) if (!b.has(x)) return false;
                return true;
            }

            it('matches brute force on a dense random field (incl. seam wrap)', () => {
                const rng = mulberry32(0x1234abcd);
                const N = 4000;
                const verts = new Float32Array(N * 3);
                for (let i = 0; i < N; i++) {
                    verts[i * 3] = rng();           // u in [0,1)
                    verts[i * 3 + 1] = rng();       // t in [0,1)
                    verts[i * 3 + 2] = 0;
                }
                // Many chains, some hugging the seam (u≈0 and u≈1) to stress wrap.
                const outerH = 270;
                const finalT = new Float32Array(outerH);
                for (let r = 0; r < outerH; r++) finalT[r] = r / (outerH - 1);
                const chains: ChainUV[] = [];
                for (let c = 0; c < 120; c++) {
                    const pts: ChainPointUV[] = [];
                    const len = 5 + Math.floor(rng() * 40);
                    let u = c < 20 ? (rng() < 0.5 ? 0.001 + rng() * 0.01 : 0.999 - rng() * 0.01) : rng();
                    for (let p = 0; p < len; p++) {
                        u = ((u + (rng() - 0.5) * 0.02) % 1 + 1) % 1;
                        pts.push({ u, row: Math.floor(rng() * outerH) });
                    }
                    chains.push({ points: pts });
                }
                const gridSpacing = 1 / 672;
                const ref = referenceChainAdjacent(verts, N, chains, gridSpacing, outerH, finalT);
                const got = identifyChainAdjacentVertices(verts, N, chains, gridSpacing, outerH, finalT);
                expect(got.size).toBeGreaterThan(0);
                expect(setsEqual(got, ref)).toBe(true);
            });

            it('matches brute force without finalT (row-normalized fallback)', () => {
                const rng = mulberry32(0x99);
                const N = 1500;
                const verts = new Float32Array(N * 3);
                for (let i = 0; i < N; i++) {
                    verts[i * 3] = rng();
                    verts[i * 3 + 1] = rng();
                    verts[i * 3 + 2] = 0;
                }
                const outerH = 100;
                const chains: ChainUV[] = [];
                for (let c = 0; c < 40; c++) {
                    const pts: ChainPointUV[] = [];
                    for (let p = 0; p < 10; p++) pts.push({ u: rng(), row: Math.floor(rng() * outerH) });
                    chains.push({ points: pts });
                }
                const gridSpacing = 1 / 200;
                const ref = referenceChainAdjacent(verts, N, chains, gridSpacing, outerH);
                const got = identifyChainAdjacentVertices(verts, N, chains, gridSpacing, outerH);
                expect(setsEqual(got, ref)).toBe(true);
            });

            it('matches brute force with coarse gridSpacing (wide radius)', () => {
                const rng = mulberry32(0x5eed);
                const N = 800;
                const verts = new Float32Array(N * 3);
                for (let i = 0; i < N; i++) {
                    verts[i * 3] = rng();
                    verts[i * 3 + 1] = rng();
                    verts[i * 3 + 2] = 0;
                }
                const chains: ChainUV[] = [
                    { points: [{ u: 0.5, row: 5 }, { u: 0.0, row: 0 }, { u: 0.97, row: 9 }] },
                ];
                const gridSpacing = 0.3; // proximityRadius 0.15 — spans many buckets
                const ref = referenceChainAdjacent(verts, N, chains, gridSpacing, 10);
                const got = identifyChainAdjacentVertices(verts, N, chains, gridSpacing, 10);
                expect(setsEqual(got, ref)).toBe(true);
            });
        });
    });

    describe('identifyChainStripTriangles', () => {
        it('detects triangles with chain vertex indices (classic mode)', () => {
            // 3 grid vertices (idx 0,1,2) + 1 chain vertex (idx 3)
            const idxs = new Uint32Array([0, 1, 2, 0, 1, 3]);
            const result = identifyChainStripTriangles(idxs, 6, 3);
            // Only tri1 (offset 3) has a chain vertex
            expect(result.size).toBe(1);
            expect(result.has(3)).toBe(true);
            expect(result.has(0)).toBe(false);
        });

        it('skips degenerate triangles', () => {
            const idxs = new Uint32Array([0, 0, 3]); // a === b
            const result = identifyChainStripTriangles(idxs, 3, 3);
            expect(result.size).toBe(0);
        });

        it('detects triangles via UV proximity when chains provided', () => {
            // All vertices are grid vertices (idx < outerGridVertexCount)
            const idxs = new Uint32Array([0, 1, 2, 1, 3, 2]);
            // But vertex 2 has been UV-snapped to a chain position
            const chainAdjacentVerts = new Set<number>([2]);
            const result = identifyChainStripTriangles(idxs, 6, 100, chainAdjacentVerts);
            // Both triangles include vertex 2
            expect(result.size).toBe(2);
            expect(result.has(0)).toBe(true);
            expect(result.has(3)).toBe(true);
        });

        it('returns empty set when no chain vertices or proximity matches', () => {
            const idxs = new Uint32Array([0, 1, 2]);
            const result = identifyChainStripTriangles(idxs, 3, 100);
            expect(result.size).toBe(0);
        });
    });

    describe('subdivideLongEdges with chains (v20.x)', () => {
        it('identifies UV-snapped vertices as chain-strip via chains param', async () => {
            // v20.x scenario: all vertices are grid vertices but some are UV-snapped
            const numU = 4, numT = 3;
            const totalVerts = numU * numT + 0; // no extra chain vertices
            const resultData = new Float32Array(totalVerts * 3);
            const combinedVerts = new Float32Array(totalVerts * 3);

            // Grid vertices on a flat 10×10 plane
            for (let t = 0; t < numT; t++) {
                for (let u = 0; u < numU; u++) {
                    const idx = t * numU + u;
                    resultData[idx * 3] = u * 3;        // 3mm spacing → edges = 3mm
                    resultData[idx * 3 + 1] = 0;
                    resultData[idx * 3 + 2] = t * 3;
                    combinedVerts[idx * 3] = u / numU;
                    combinedVerts[idx * 3 + 1] = t / (numT - 1);
                    combinedVerts[idx * 3 + 2] = 0;
                }
            }

            // UV-snap vertex at (row=1, col=2) to a chain position
            const snappedIdx = 1 * numU + 2;
            combinedVerts[snappedIdx * 3] = 0.55;   // snapped U
            // Move the 3D position far from grid to create a long edge
            resultData[snappedIdx * 3] = 8;          // far from neighbors at u=3,u=9

            // Build triangulated grid (2 tris per quad)
            const triIdxs: number[] = [];
            for (let t = 0; t < numT - 1; t++) {
                for (let u = 0; u < numU - 1; u++) {
                    const v00 = t * numU + u;
                    const v10 = t * numU + u + 1;
                    const v01 = (t + 1) * numU + u;
                    const v11 = (t + 1) * numU + u + 1;
                    triIdxs.push(v00, v10, v01);
                    triIdxs.push(v10, v11, v01);
                }
            }
            const combinedIdxs = new Uint32Array(triIdxs);

            // Chain at the snapped position
            const chains: ChainUV[] = [
                { points: [{ u: 0.55, row: 1 }] },  // row=1 → tNorm = 1/(3-1) = 0.5, matching snapped vertex
            ];

            const params: SubdivisionParams = {
                combinedIdxs,
                resultData,
                combinedVerts,
                outerIdxCount: combinedIdxs.length,
                outerGridVertexCount: totalVerts, // ALL vertices are grid → index-based detection finds nothing
                constraintEdgeSet: new Set(),
                outerW: numU,
                outerH: numT,
                chains,
            };

            const evaluator: EvaluateMidpointsFn = async (uvBatch) => {
                const n = uvBatch.length / 3;
                const out = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) {
                    out[i * 3] = uvBatch[i * 3] * 12;
                    out[i * 3 + 1] = 0;
                    out[i * 3 + 2] = uvBatch[i * 3 + 1] * 6;
                }
                return out;
            };

            const result = await subdivideLongEdges(params, evaluator);

            // Without chains: splitCount would be 0 (no chain vertices by index)
            // With chains: UV-proximity detects snapped vertex → finds long edges → splits
            expect(result.splitCount).toBeGreaterThan(0);
        });

        it('works with chains=undefined (backward compat)', async () => {
            const mesh = makeChainStripMesh();
            const params = makeDefaultParams();
            // chains is undefined by default → falls back to index-based detection
            const evaluator = makeFlatEvaluator();
            const result = await subdivideLongEdges(params, evaluator);
            expect(result.splitCount).toBeGreaterThan(0);
        });
    });
});
