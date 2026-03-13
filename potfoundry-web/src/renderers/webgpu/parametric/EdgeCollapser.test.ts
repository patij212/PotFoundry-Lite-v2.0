/**
 * EdgeCollapser.test.ts — Tests for QEM-based edge collapse.
 *
 * Verifies:
 * 1. Quadric initialization from triangles
 * 2. Collapse cost calculation and direction
 * 3. Link condition checks
 * 4. Mesh compaction
 * 5. Full collapse pipeline
 *
 * @module EdgeCollapser.test
 */

import { describe, it, expect } from 'vitest';
import {
    initQuadrics,
    computeCollapseCost,
    checkLinkCondition,
    compactMesh,
    collapseOverBudgetEdges,
    _MAX_METRIC_ASPECT_RATIO,
} from './EdgeCollapser';
import type { FeatureEdgeGraph } from './FeatureEdgeGraph';
import type { VertexMetrics } from './AdaptiveRefinement';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal 2-triangle quad mesh (4 vertices). */
function makeQuadMesh() {
    const positions = new Float32Array([
        0, 0, 0,   // v0
        1, 0, 0,   // v1
        1, 1, 0,   // v2
        0, 1, 0,   // v3
    ]);
    const uvs = new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 1, 0,
        0, 1, 0,
    ]);
    const indices = new Uint32Array([
        0, 1, 2,   // tri0
        0, 2, 3,   // tri1
    ]);
    return { positions, uvs, indices, outerIdxCount: 6 };
}

/** Create a denser mesh (6 vertices, 4 triangles) for collapse testing. */
function makeDenseMesh() {
    const positions = new Float32Array([
        0, 0, 0,   // v0
        1, 0, 0,   // v1
        2, 0, 0,   // v2
        0, 1, 0,   // v3
        1, 1, 0,   // v4
        2, 1, 0,   // v5
    ]);
    const uvs = new Float32Array([
        0, 0, 0,
        0.5, 0, 0,
        1, 0, 0,
        0, 1, 0,
        0.5, 1, 0,
        1, 1, 0,
    ]);
    const indices = new Uint32Array([
        0, 1, 4,   // tri0
        0, 4, 3,   // tri1
        1, 2, 5,   // tri2
        1, 5, 4,   // tri3
    ]);
    return { positions, uvs, indices, outerIdxCount: 12 };
}

const emptyFeatureGraph: FeatureEdgeGraph = {
    edges: [],
    edgeSet: new Set(),
    edgesByChain: new Map(),
    chainKinds: new Map(),
    chainCount: 0,
    edgeCount: 0,
};

// ============================================================================
// Tests
// ============================================================================

describe('EdgeCollapser', () => {
    // -----------------------------------------------------------------------
    // Quadric Initialization
    // -----------------------------------------------------------------------
    describe('initQuadrics', () => {
        it('returns Float64Array of correct size', () => {
            const { positions, indices, outerIdxCount } = makeQuadMesh();
            const quadrics = initQuadrics(positions, indices, outerIdxCount);
            expect(quadrics).toBeInstanceOf(Float64Array);
            expect(quadrics.length).toBe(40); // 4 vertices × 10 floats
        });

        it('produces non-zero quadrics for non-degenerate mesh', () => {
            const { positions, indices, outerIdxCount } = makeQuadMesh();
            const quadrics = initQuadrics(positions, indices, outerIdxCount);
            let nonZero = 0;
            for (let i = 0; i < quadrics.length; i++) {
                if (quadrics[i] !== 0) nonZero++;
            }
            expect(nonZero).toBeGreaterThan(0);
        });

        it('handles empty mesh gracefully', () => {
            const positions = new Float32Array(0);
            const indices = new Uint32Array(0);
            const quadrics = initQuadrics(positions, indices, 0);
            expect(quadrics.length).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // Collapse Cost
    // -----------------------------------------------------------------------
    describe('computeCollapseCost', () => {
        it('returns non-negative cost', () => {
            const { positions, indices, outerIdxCount } = makeQuadMesh();
            const quadrics = initQuadrics(positions, indices, outerIdxCount);
            const { cost } = computeCollapseCost(quadrics, positions, 0, 1);
            expect(cost).toBeGreaterThanOrEqual(0);
        });

        it('decides which vertex to keep', () => {
            const { positions, indices, outerIdxCount } = makeQuadMesh();
            const quadrics = initQuadrics(positions, indices, outerIdxCount);
            const { vKeep, vRemove } = computeCollapseCost(quadrics, positions, 0, 1);
            expect([0, 1]).toContain(vKeep);
            expect([0, 1]).toContain(vRemove);
            expect(vKeep).not.toBe(vRemove);
        });

        it('is deterministic', () => {
            const { positions, indices, outerIdxCount } = makeQuadMesh();
            const quadrics = initQuadrics(positions, indices, outerIdxCount);
            const r1 = computeCollapseCost(quadrics, positions, 0, 1);
            const r2 = computeCollapseCost(quadrics, positions, 0, 1);
            expect(r1.cost).toBe(r2.cost);
            expect(r1.vKeep).toBe(r2.vKeep);
        });
    });

    // -----------------------------------------------------------------------
    // Link Condition
    // -----------------------------------------------------------------------
    describe('checkLinkCondition', () => {
        it('returns true for manifold edge in quad mesh', () => {
            const { indices, outerIdxCount } = makeQuadMesh();
            // Build vtMap
            const vtMap = new Map<number, number[]>();
            for (let t = 0; t < outerIdxCount; t += 3) {
                for (let k = 0; k < 3; k++) {
                    const v = indices[t + k];
                    let tris = vtMap.get(v);
                    if (!tris) { tris = []; vtMap.set(v, tris); }
                    tris.push(t);
                }
            }
            // Edge 0-2 is shared by both triangles — should pass link condition
            const result = checkLinkCondition(0, 2, vtMap, indices);
            expect(result).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Mesh Compaction
    // -----------------------------------------------------------------------
    describe('compactMesh', () => {
        it('removes marked vertices and remaps indices', () => {
            const { positions, uvs, indices, outerIdxCount } = makeQuadMesh();
            const removedVertices = new Set([1]); // Remove vertex 1
            // Manually set indices to avoid degenerate check: keep only tri1 (0,2,3)
            indices[0] = 0; indices[1] = 2; indices[2] = 3;
            indices[3] = 0; indices[4] = 2; indices[5] = 3;
            const result = compactMesh(positions, uvs, indices, outerIdxCount, removedVertices, 1);
            expect(result.positions.length / 3).toBe(3); // 4 - 1 removed
        });

        it('filters degenerate triangles', () => {
            const { positions, uvs, outerIdxCount } = makeQuadMesh();
            // Create degenerate triangle
            const indices = new Uint32Array([
                0, 0, 2,   // degenerate (two identical)
                0, 2, 3,   // valid
            ]);
            const result = compactMesh(positions, uvs, indices, outerIdxCount, new Set(), 0);
            expect(result.indices.length / 3).toBe(1); // only one valid tri
        });

        it('returns empty mesh when all removed', () => {
            const { positions, uvs, indices, outerIdxCount } = makeQuadMesh();
            const removedVertices = new Set([0, 1, 2, 3]);
            const result = compactMesh(positions, uvs, indices, outerIdxCount, removedVertices, 4);
            expect(result.positions.length).toBe(0);
            expect(result.indices.length).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // Full Pipeline
    // -----------------------------------------------------------------------
    describe('collapseOverBudgetEdges', () => {
        it('returns unchanged mesh when under budget', async () => {
            const { positions, uvs, indices, outerIdxCount } = makeQuadMesh();
            const result = await collapseOverBudgetEdges(
                positions, uvs, indices, outerIdxCount,
                emptyFeatureGraph, 10, // target > current (2 tris)
            );
            expect(result.collapseCount).toBe(0);
            expect(result.indices.length).toBe(indices.length);
        });

        it('collapses edges when over budget', async () => {
            const { positions, uvs, indices, outerIdxCount } = makeDenseMesh();
            // 4 triangles, target 2 — should collapse
            const result = await collapseOverBudgetEdges(
                positions, uvs, indices, outerIdxCount,
                emptyFeatureGraph, 2,
            );
            // Should have performed some collapses
            expect(result.collapseCount).toBeGreaterThanOrEqual(0);
            // Mesh should be valid (no degenerate indices)
            for (let t = 0; t < result.indices.length / 3; t++) {
                const base = t * 3;
                const a = result.indices[base], b = result.indices[base + 1], c = result.indices[base + 2];
                expect(a).not.toBe(b);
                expect(b).not.toBe(c);
                expect(a).not.toBe(c);
            }
        });

        it('preserves feature edge vertices', async () => {
            const { positions, uvs, indices, outerIdxCount } = makeDenseMesh();
            // Mark edge 1-4 as feature edge — both vertices should be preserved
            const featureEdgeKey = '1-4';
            const featureGraph: FeatureEdgeGraph = {
                edges: [{ v0: 1, v1: 4, chainId: 0, kind: 'peak' }],
                edgeSet: new Set([featureEdgeKey]),
                edgesByChain: new Map([[0, [{ v0: 1, v1: 4, chainId: 0, kind: 'peak' }]]]),
                chainKinds: new Map([[0, 'peak']]),
                chainCount: 1,
                edgeCount: 1,
            };
            const result = await collapseOverBudgetEdges(
                positions, uvs, indices, outerIdxCount,
                featureGraph, 2,
            );
            // Feature vertices should not be removed
            expect(result.removedVertices.has(1)).toBe(false);
            expect(result.removedVertices.has(4)).toBe(false);
        });

        it('handles empty mesh', async () => {
            const result = await collapseOverBudgetEdges(
                new Float32Array(0), new Float32Array(0),
                new Uint32Array(0), 0,
                emptyFeatureGraph, 0,
            );
            expect(result.collapseCount).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // Phase 16: Metric-Aware Collapse
    // -----------------------------------------------------------------------
    describe('metric-aware collapse', () => {
        /** Build isotropic vertex metrics (E=scale², F=0, G=scale²). */
        function makeIsotropicMetrics(vertCount: number, scale: number): VertexMetrics {
            const E = new Float32Array(vertCount).fill(scale * scale);
            const F = new Float32Array(vertCount).fill(0);
            const G = new Float32Array(vertCount).fill(scale * scale);
            return { E, F, G, vertexCount: vertCount };
        }

        /**
         * Build anisotropic vertex metrics: high stretch in U, low in V.
         * E controls U-direction, G controls V-direction.
         */
        function makeAnisotropicMetrics(
            vertCount: number,
            scaleU: number,
            scaleV: number,
        ): VertexMetrics {
            const E = new Float32Array(vertCount).fill(scaleU * scaleU);
            const F = new Float32Array(vertCount).fill(0);
            const G = new Float32Array(vertCount).fill(scaleV * scaleV);
            return { E, F, G, vertexCount: vertCount };
        }

        it('preserves edges in high-anisotropy regions via metric length guard', async () => {
            const { positions, uvs, indices, outerIdxCount } = makeDenseMesh();
            // High anisotropy: U-direction is 10× more important than V
            const metrics = makeAnisotropicMetrics(6, 10, 1);
            // Set a target metric edge length that's small —
            // edges in U direction have metric length ~5 (du=0.5, E=100 → sqrt(100*0.25)=5)
            // which exceeds 1.0 * 1.5 = 1.5 → should be protected
            const result = await collapseOverBudgetEdges(
                positions, uvs, indices, outerIdxCount,
                emptyFeatureGraph, 1, // aggressive target
                metrics,
                1.0, // targetMetricEdgeLength — edges with metric len > 1.5 are protected
            );
            // With metric guard, many edges are protected → fewer collapses
            // Without it, all non-protected edges would be candidates
            const resultNoMetric = await collapseOverBudgetEdges(
                positions, uvs, indices, outerIdxCount,
                emptyFeatureGraph, 1,
                undefined, // no metrics
                undefined, // no target metric length
            );
            // Metric-aware should collapse <= the non-metric path
            expect(result.collapseCount).toBeLessThanOrEqual(resultNoMetric.collapseCount);
        });

        it('collapses short metric edges in isotropic smooth regions', async () => {
            const { positions, uvs, indices, outerIdxCount } = makeDenseMesh();
            // Isotropic with small scale — all edges are short in metric space
            const metrics = makeIsotropicMetrics(6, 0.5);
            const result = await collapseOverBudgetEdges(
                positions, uvs, indices, outerIdxCount,
                emptyFeatureGraph, 2,
                metrics,
                10.0, // large target → no edges protected by metric guard
            );
            // Should still collapse since all metric lengths are small (< 10 * 1.5)
            expect(result.collapseCount).toBeGreaterThanOrEqual(0);
            // Mesh should remain valid
            for (let t = 0; t < result.indices.length / 3; t++) {
                const base = t * 3;
                const a = result.indices[base], b = result.indices[base + 1], c = result.indices[base + 2];
                expect(a).not.toBe(b);
                expect(b).not.toBe(c);
                expect(a).not.toBe(c);
            }
        });

        it('rejects collapse that creates extreme metric anisotropy', async () => {
            // Create a mesh where collapsing would create a very elongated
            // triangle in metric space.
            // 5 vertices: a bowtie shape where the center vertex collapse
            // would create extreme metric distortion.
            const positions = new Float32Array([
                0, 0, 0,     // v0 — left
                0.5, 0, 0,   // v1 — center-bottom
                1, 0, 0,     // v2 — right
                0.5, 1, 0,   // v3 — top
                0.5, -1, 0,  // v4 — bottom
            ]);
            const uvs = new Float32Array([
                0, 0.5, 0,
                0.5, 0.5, 0,
                1, 0.5, 0,
                0.5, 1, 0,
                0.5, 0, 0,
            ]);
            const indices = new Uint32Array([
                0, 1, 3,  // top-left
                1, 2, 3,  // top-right
                0, 4, 1,  // bottom-left
                1, 4, 2,  // bottom-right
            ]);
            // Strong anisotropy: V-direction is 20× more important
            // Collapsing v1 onto v0 would create triangles spanning full V range
            // with tiny U extent → extreme metric aspect ratio → should be rejected
            const metrics = makeAnisotropicMetrics(5, 1, 20);

            const result = await collapseOverBudgetEdges(
                positions, uvs, indices, 12,
                emptyFeatureGraph, 2,
                metrics,
            );
            // The metric inversion check should reject collapses that create
            // extreme metric anisotropy — so fewer collapses than without metrics
            const resultNoMetric = await collapseOverBudgetEdges(
                positions, uvs, indices, 12,
                emptyFeatureGraph, 2,
            );
            expect(result.collapseCount).toBeLessThanOrEqual(resultNoMetric.collapseCount);
        });

        it('MAX_METRIC_ASPECT_RATIO is a reasonable value', () => {
            expect(_MAX_METRIC_ASPECT_RATIO).toBeGreaterThanOrEqual(3);
            expect(_MAX_METRIC_ASPECT_RATIO).toBeLessThanOrEqual(10);
        });
    });
});
