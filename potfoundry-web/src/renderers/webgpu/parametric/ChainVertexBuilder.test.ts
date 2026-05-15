/**
 * Tests for ChainVertexBuilder — chain vertex collection and edge recording.
 */
import { describe, it, expect } from 'vitest';
import { collectChainVertices, SEAM_THRESHOLD } from './ChainVertexBuilder';
import type { FeatureChain } from './types';

describe('ChainVertexBuilder', () => {
    describe('collectChainVertices', () => {
        const origToFinal = new Map<number, number>([
            [0, 0], [1, 1], [2, 2], [3, 3], [4, 4],
        ]);
        const numT = 5;
        const gridVertexCount = 40; // 8 columns × 5 rows

        it('returns empty result for no chains', () => {
            const result = collectChainVertices([], origToFinal, numT, gridVertexCount);
            expect(result.chainVertices).toHaveLength(0);
            expect(result.chainEdges).toHaveLength(0);
            expect(result.interpolatedCount).toBe(0);
            expect(result.nextVertexIdx).toBe(gridVertexCount);
        });

        it('skips chains with fewer than 2 points', () => {
            const chains: FeatureChain[] = [{
                kind: 'peak',
                points: [{ row: 1, u: 0.3 }],
            }];
            const result = collectChainVertices(chains, origToFinal, numT, gridVertexCount);
            expect(result.chainVertices).toHaveLength(0);
        });

        it('collects chain vertices at exact U positions', () => {
            const chains: FeatureChain[] = [{
                kind: 'peak',
                points: [
                    { row: 1, u: 0.25 },
                    { row: 2, u: 0.27 },
                ],
            }];
            const result = collectChainVertices(chains, origToFinal, numT, gridVertexCount);
            expect(result.chainVertices).toHaveLength(2);
            expect(result.chainVertices[0].u).toBe(0.25);
            expect(result.chainVertices[0].rowIdx).toBe(1);
            expect(result.chainVertices[0].vertexIdx).toBe(gridVertexCount);
            expect(result.chainVertices[1].u).toBe(0.27);
            expect(result.chainVertices[1].vertexIdx).toBe(gridVertexCount + 1);
        });

        it('records chain edges for consecutive row vertices', () => {
            const chains: FeatureChain[] = [{
                kind: 'peak',
                points: [
                    { row: 1, u: 0.3 },
                    { row: 2, u: 0.31 },
                    { row: 3, u: 0.32 },
                ],
            }];
            const result = collectChainVertices(chains, origToFinal, numT, gridVertexCount);
            expect(result.chainEdges).toHaveLength(2);
            expect(result.chainEdges[0]).toEqual([gridVertexCount, gridVertexCount + 1]);
            expect(result.chainEdges[1]).toEqual([gridVertexCount + 1, gridVertexCount + 2]);
        });

        it('interpolates multi-row gaps', () => {
            const chains: FeatureChain[] = [{
                kind: 'peak',
                points: [
                    { row: 1, u: 0.30 },
                    { row: 3, u: 0.34 }, // gap of 2 rows
                ],
            }];
            const result = collectChainVertices(chains, origToFinal, numT, gridVertexCount);
            // 2 original + 1 interpolated
            expect(result.chainVertices).toHaveLength(3);
            expect(result.interpolatedCount).toBe(1);
            // Interpolated vertex has pointIdx = -1
            const interp = result.chainVertices.find(cv => cv.pointIdx === -1);
            expect(interp).toBeDefined();
            expect(interp!.rowIdx).toBe(2); // intermediate row
            // U should be midpoint between 0.30 and 0.34
            expect(interp!.u).toBeCloseTo(0.32, 6);
        });

        it('drops seam-crossing 2-point chains entirely (cluster-1 fix)', () => {
            // Cluster-1 fix: splitChainsAtSeam splits at the seam. A 2-point
            // chain crossing the seam yields two singletons, both dropped.
            // The post-fix contract is "no orphan chain vertices in the mesh"
            // — not "vertices with zero incident edges."
            const chains: FeatureChain[] = [{
                kind: 'peak',
                points: [
                    { row: 1, u: 0.05 },
                    { row: 2, u: 0.95 }, // |Δu| = 0.9 — seam-crossing
                ],
            }];
            const result = collectChainVertices(chains, origToFinal, numT, gridVertexCount);
            expect(result.chainVertices).toHaveLength(0);
            expect(result.chainEdges).toHaveLength(0);
        });

        // Regression test for "malformed feature chain edges during tessellation"
        // (ripple-vase symptom: missing=171 crossRow edges, max aspect 2e8:1).
        //
        // After the cluster-1 fix, collectChainVertices splits any seam-
        // spanning input chain via splitChainsAtSeam before processing. The
        // post-fix invariant is: NO output chain vertex is an orphan (every
        // chainVertex has at least one incident chainEdge).
        //
        // Fixture: a single seam-spiraling input chain with enough points on
        // each side that both halves survive the singleton-drop in
        // splitChainsAtSeam. Pre-fix: chain crosses seam → interpolated
        // vertices straddle u=0/1 → middle edge dropped → orphans → slivers.
        // Post-fix: chain is split into two sub-chains; each forms its own
        // connected component with no orphans.
        it('produces no orphan chain vertices when chain spirals across the seam', () => {
            const chains: FeatureChain[] = [{
                kind: 'peak',
                points: [
                    { row: 0, u: 0.92 },
                    { row: 1, u: 0.96 },
                    { row: 2, u: 0.04 }, // |Δu|=0.92 > 0.5 — seam crossing here
                    { row: 3, u: 0.08 },
                ],
            }];
            const numTLocal = 4;
            const origToFinalLocal = new Map<number, number>([
                [0, 0], [1, 1], [2, 2], [3, 3],
            ]);
            const result = collectChainVertices(chains, origToFinalLocal, numTLocal, gridVertexCount);

            // Both halves survive (2 points each → 2-point chains, not dropped)
            expect(result.chainVertices.length).toBeGreaterThanOrEqual(4);

            // Build incidence count per chain vertex
            const incident = new Map<number, number>();
            for (const cv of result.chainVertices) incident.set(cv.vertexIdx, 0);
            for (const [a, b] of result.chainEdges) {
                if (incident.has(a)) incident.set(a, (incident.get(a) ?? 0) + 1);
                if (incident.has(b)) incident.set(b, (incident.get(b) ?? 0) + 1);
            }
            const orphans = [...incident.values()].filter(c => c === 0);
            expect(orphans).toEqual([]); // every chain vertex has ≥1 chain edge
        });

        it('assigns sequential vertex indices across multiple chains', () => {
            const chains: FeatureChain[] = [
                { kind: 'peak', points: [{ row: 1, u: 0.2 }, { row: 2, u: 0.21 }] },
                { kind: 'valley', points: [{ row: 1, u: 0.6 }, { row: 2, u: 0.61 }] },
            ];
            const result = collectChainVertices(chains, origToFinal, numT, gridVertexCount);
            expect(result.chainVertices).toHaveLength(4);
            const indices = result.chainVertices.map(cv => cv.vertexIdx);
            expect(indices).toEqual([
                gridVertexCount, gridVertexCount + 1,
                gridVertexCount + 2, gridVertexCount + 3,
            ]);
            expect(result.nextVertexIdx).toBe(gridVertexCount + 4);
        });

        it('clamps U to [0, 1-ε) without snapping', () => {
            // Use two chains so each end of the clamp range can be exercised
            // without the pair triggering splitChainsAtSeam (cluster-1 fix).
            const chains: FeatureChain[] = [
                { kind: 'peak', points: [{ row: 1, u: -0.01 }, { row: 2, u: 0.02 }] },
                { kind: 'peak', points: [{ row: 1, u: 0.98 }, { row: 2, u: 1.01 }] },
            ];
            const result = collectChainVertices(chains, origToFinal, numT, gridVertexCount);
            expect(result.chainVertices).toHaveLength(4);
            // -0.01 → 0 (clamped at low end)
            expect(result.chainVertices[0].u).toBe(0);
            // 1.01 → just under 1 (clamped at high end)
            const highVert = result.chainVertices[3];
            expect(highVert.u).toBeLessThan(1);
            expect(highVert.u).toBeGreaterThan(0.999);
        });
    });

    describe('SEAM_THRESHOLD', () => {
        it('is 0.4', () => {
            expect(SEAM_THRESHOLD).toBe(0.4);
        });
    });
});
