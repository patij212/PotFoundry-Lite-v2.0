import { describe, expect, it } from 'vitest';
import {
    compactDuplicateCanonicalTriangles,
    edgeKey as repairEdgeKey,
    fillBranchedBoundaryComponentsWithCenters,
    fillCrossSurfaceConstantTBoundaryLoopsWithCenters,
    fillGeometricBoundaryLoops,
    fillOuterWallBoundaryLoops,
    fillOuterWallSeamBoundaryChains,
    fillSameSurfaceBoundaryLoops,
    fillSameSurfaceBoundaryLoopsWithCenters,
    repairOuterWallTJunctions,
    repairSurfaceBoundaryTJunctions,
    shouldStopRepairPasses,
    splitResidualBoundaryTJunctions,
    splitNonManifoldBoundaryTJunctions,
    weldNearCoincidentBoundaryVertices,
} from './BoundaryTJunctionRepair';
import { topologyDiagnostics, triangleQualityDiagnostics } from '../../../fidelity/metrics';
import { normalizeWindingByComponent } from './WindingNormalizer';

describe('BoundaryTJunctionRepair edge keys', () => {
    it('keeps post-refine vertex ids above the old 2M stride collision-free', () => {
        expect(repairEdgeKey(0, 2_097_157)).toBe(repairEdgeKey(2_097_157, 0));
        expect(repairEdgeKey(0, 2_097_157)).not.toBe(repairEdgeKey(1, 5));
    });
});

function key(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function edgeCounts(indices: Uint32Array): Map<string, number> {
    const counts = new Map<string, number>();
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        if (a === b || b === c || a === c) continue;
        for (const edge of [key(a, b), key(b, c), key(c, a)]) {
            counts.set(edge, (counts.get(edge) ?? 0) + 1);
        }
    }
    return counts;
}

function edgeCountsWithGeometricWeld(
    indices: Uint32Array,
    positions: Float32Array,
    epsilon: number,
): Map<string, number> {
    const remap = new Uint32Array(Math.floor(positions.length / 3));
    const keyToId = new Map<string, number>();
    for (let v = 0; v < remap.length; v++) {
        const base = v * 3;
        const k = [
            Math.round(positions[base] / epsilon),
            Math.round(positions[base + 1] / epsilon),
            Math.round(positions[base + 2] / epsilon),
        ].join(':');
        let id = keyToId.get(k);
        if (id === undefined) {
            id = v;
            keyToId.set(k, id);
        }
        remap[v] = id;
    }

    const counts = new Map<string, number>();
    for (let i = 0; i < indices.length; i += 3) {
        const a = remap[indices[i]], b = remap[indices[i + 1]], c = remap[indices[i + 2]];
        if (a === b || b === c || a === c) continue;
        for (const edge of [key(a, b), key(b, c), key(c, a)]) {
            counts.set(edge, (counts.get(edge) ?? 0) + 1);
        }
    }
    return counts;
}

describe('repairOuterWallTJunctions', () => {
    it('splits a long outer-wall boundary edge across existing split vertices', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,  // A
            0.4, 0.5, 0,  // C
            0.6, 0.5, 0,  // B
            0.4, 0.8, 0,  // O
            0.3, 0.2, 0,  // L
            0.5, 0.2, 0,  // R
        ]);
        const indices = new Uint32Array([
            0, 2, 3, // long edge A-B
            0, 4, 1, // split edge A-C
            1, 5, 2, // split edge C-B
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(result.insertedTriangles).toBe(1);
        expect(result.outerIdxCount).toBe(indices.length + 3);
        expect(counts.get(key(0, 2))).toBeUndefined();
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(1, 2))).toBe(2);
    });

    it('rejects a split path whose boundary owners traverse in the same direction as the new children', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,  // A
            0.4, 0.5, 0,  // C
            0.6, 0.5, 0,  // B
            0.4, 0.8, 0,  // O
            0.3, 0.2, 0,  // L
            0.5, 0.2, 0,  // R
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 2, 3, // coarse boundary A->B
            0, 1, 4, // incompatible split-side owner also traverses A->C
            1, 2, 5, // incompatible split-side owner also traverses C->B
        ]);

        const before = topologyDiagnostics({ vertices: positions, indices, uvs }, 1e-4);
        expect(before.orientationMismatches).toBe(0);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length, positions, 1, 1e-4);
        const after = topologyDiagnostics({ vertices: positions, indices: result.indices, uvs }, 1e-4);

        expect(result.repairedEdges).toBe(0);
        expect(after.orientationMismatches).toBe(0);
        expect(Array.from(result.indices)).toEqual(Array.from(indices));
    });

    it('splits a long boundary edge when the split side uses duplicate UV vertices', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,  // A
            0.6, 0.5, 0,  // B
            0.4, 0.8, 0,  // O
            0.2, 0.5, 0,  // A duplicate used by the opposite boundary path
            0.4, 0.5, 0,  // C
            0.6, 0.5, 0,  // B duplicate used by the opposite boundary path
            0.3, 0.2, 0,  // L
            0.5, 0.2, 0,  // R
        ]);
        const indices = new Uint32Array([
            0, 1, 2, // long edge A-B
            3, 6, 4, // split edge A'-C
            4, 7, 5, // split edge C-B'
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(counts.get(key(0, 1))).toBeUndefined();
        expect(counts.get(key(0, 4))).toBe(1);
        expect(counts.get(key(4, 1))).toBe(1);
    });

    it('splits a long boundary edge when the split vertex is slightly off the UV segment', () => {
        const uvs = new Float32Array([
            0.07676, 0.02874, 0, // A
            0.07676, 0.03021, 0, // B
            0.07740, 0.02950, 0, // O
            0.07668, 0.03011, 0, // C, near A-B but not exactly collinear
            0.07650, 0.02920, 0, // L
            0.07650, 0.03040, 0, // R
        ]);
        const indices = new Uint32Array([
            0, 1, 2, // long edge A-B
            0, 4, 3, // split edge A-C
            3, 5, 1, // split edge C-B
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(counts.get(key(0, 1))).toBeUndefined();
        expect(counts.get(key(0, 3))).toBe(2);
        expect(counts.get(key(3, 1))).toBe(2);
    });

    it('flips a skinny split triangle across its adjacent interior edge', () => {
        const uvs = new Float32Array([
            0.50, 0.50, 0, // 0 A: coarse boundary start
            0.59, 0.50, 0, // 1 M: split vertex near B
            0.591, 0.50, 0, // 2 B: coarse boundary end / chain vertex
            0.50, 0.80, 0, // 3 O: far opposite vertex in the coarse triangle
            0.55, 0.20, 0, // 4 support for A-M
            0.5905, 0.20, 0, // 5 support for M-B
            0.591, 0.75, 0, // 6 I: adjacent lower vertex sharing B-O
        ]);
        const positions = new Float32Array([
            0.00, 0.00, 0,
            1.00, 0.00, 0,
            1.01, 0.00, 0,
            0.00, 1.00, 0,
            0.30, -0.70, 0,
            1.005, -0.70, 0,
            1.01, 0.10, 0,
        ]);
        const indices = new Uint32Array([
            0, 2, 3, // coarse boundary A-B, later split at M
            3, 6, 2, // adjacent triangle sharing B-O; flip target is M-I
            0, 4, 1, // split-side boundary A-M
            1, 5, 2, // split-side boundary M-B
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length, positions);
        const counts = edgeCounts(result.indices);
        const hasTriangle = (a: number, b: number, c: number): boolean => {
            const target = [a, b, c].sort((x, y) => x - y).join(':');
            for (let i = 0; i < result.indices.length; i += 3) {
                const triKey = [result.indices[i], result.indices[i + 1], result.indices[i + 2]]
                    .sort((x, y) => x - y)
                    .join(':');
                if (triKey === target) return true;
            }
            return false;
        };
        const quality = triangleQualityDiagnostics({ vertices: positions, indices: result.indices }, 4);

        expect(result.repairedEdges).toBeGreaterThanOrEqual(1);
        expect(result.insertedTriangles).toBe(1);
        expect(counts.get(key(0, 2))).toBeUndefined();
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(1, 2))).toBe(2);
        expect(counts.get(key(1, 6))).toBe(2);
        expect(hasTriangle(1, 2, 3)).toBe(false);
        expect(quality.maxAspect3D).toBeLessThan(100);
    });

    it('uses geometric identity when duplicate split-side vertices drift in UV', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,       // A
            0.6, 0.5, 0,       // B
            0.4, 0.8, 0,       // O
            0.20003, 0.5, 0,   // A duplicate, UV-drifted
            0.40003, 0.5, 0,   // C
            0.60003, 0.5, 0,   // B duplicate, UV-drifted
            0.3, 0.2, 0,       // L
            0.5, 0.2, 0,       // R
        ]);
        const positions = new Float32Array([
            0, 0, 0, // A
            2, 0, 0, // B
            1, 1, 0, // O
            0, 0, 0, // A duplicate
            1, 0, 0, // C
            2, 0, 0, // B duplicate
            0.5, -1, 0, // L
            1.5, -1, 0, // R
        ]);
        const indices = new Uint32Array([
            0, 1, 2, // long edge A-B
            3, 6, 4, // split edge A'-C
            4, 7, 5, // split edge C-B'
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length, positions, 4, 0.001);
        const counts = edgeCountsWithGeometricWeld(result.indices, positions, 0.001);

        expect(result.repairedEdges).toBe(1);
        expect(counts.get(key(0, 1))).toBeUndefined();
        expect(counts.get(key(0, 4))).toBe(2);
        expect(counts.get(key(4, 1))).toBe(2);
    });

    it('splits one incident triangle when a non-manifold outer edge has a matching boundary split path', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,  // A
            0.6, 0.5, 0,  // B
            0.4, 0.8, 0,  // O
            0.4, 0.5, 0,  // C
            0.3, 0.2, 0,  // L
            0.5, 0.2, 0,  // R
            0.4, 1.0, 0,  // P
            0.4, -0.2, 0, // Q
        ]);
        const indices = new Uint32Array([
            0, 1, 2, // non-manifold long edge A-B, candidate to split
            0, 4, 3, // split boundary path A-C
            3, 5, 1, // split boundary path C-B
            1, 0, 6, // extra incident face sharing A-B
            0, 1, 7, // extra incident face sharing A-B
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(0, 3))).toBe(2);
        expect(counts.get(key(3, 1))).toBe(2);
    });

    it('splits a non-manifold edge through a boundary chain with geometric canonicalization', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,
            0.6, 0.5, 0,
            0.4, 0.8, 0,
            0.4, 0.5, 0,
            0.3, 0.2, 0,
            0.5, 0.2, 0,
            0.4, 1.0, 0,
            0.4, -0.2, 0,
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2,
            0, 4, 3,
            3, 5, 1,
            1, 0, 6,
            0, 1, 7,
        ]);

        const result = splitNonManifoldBoundaryTJunctions(indices, uvs, positions, 1e-4);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(0, 3))).toBe(2);
        expect(counts.get(key(3, 1))).toBe(2);
    });

    it('rejects a non-manifold split path with incompatible boundary-owner directions', () => {
        const uvs = new Float32Array([
            0.2, 0.5, 0,  // A
            0.6, 0.5, 0,  // B
            0.4, 0.8, 0,  // O
            0.4, 0.5, 0,  // C
            0.3, 0.2, 0,  // L
            0.5, 0.2, 0,  // R
            0.4, 1.0, 0,  // P
            0.4, -0.2, 0, // Q
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2, // non-manifold long edge A->B
            0, 3, 4, // incompatible split-side owner also traverses A->C
            3, 1, 5, // incompatible split-side owner also traverses C->B
            0, 1, 6, // extra incident face sharing A->B in the same direction
            0, 1, 7, // extra incident face sharing A->B in the same direction
        ]);

        const result = splitNonManifoldBoundaryTJunctions(indices, uvs, positions, 1e-4);

        expect(result.repairedEdges).toBe(0);
        expect(Array.from(result.indices)).toEqual(Array.from(indices));
    });

    it('splits a non-manifold edge through a short boundary bridge even when the bridge is off the UV segment', () => {
        const uvs = new Float32Array([
            0.20000, 0.50000, 0,
            0.20005, 0.50000, 0,
            0.20002, 0.51000, 0,
            0.19880, 0.50012, 0,
            0.19860, 0.49980, 0,
            0.19895, 0.49975, 0,
            0.20002, 0.52000, 0,
            0.20002, 0.49000, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            0.05, 0, 0,
            0.02, 1, 0,
            0.025, 0.01, 0,
            -0.2, -0.1, 0,
            0.2, -0.1, 0,
            0.02, 2, 0,
            0.02, -1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 4, 3,
            3, 5, 1,
            1, 0, 6,
            0, 1, 7,
        ]);

        const result = splitNonManifoldBoundaryTJunctions(indices, uvs, positions, 1e-4);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(0, 3))).toBe(2);
        expect(counts.get(key(3, 1))).toBe(2);
    });

    it('snaps a non-manifold edge endpoint to a near-duplicate boundary endpoint', () => {
        const uvs = new Float32Array([
            0.07676, 0.02874, 0, // A
            0.07676, 0.03011, 0, // B on the non-manifold edge
            0.07668, 0.03011, 0, // C, near-duplicate boundary endpoint
            0.07650, 0.02930, 0, // L
            0.07710, 0.02930, 0, // O
            0.07720, 0.03050, 0, // P
            0.07620, 0.03050, 0, // Q
        ]);
        const indices = new Uint32Array([
            0, 1, 4, // non-manifold A-B, candidate B -> C
            1, 0, 5, // extra incident face sharing A-B
            0, 1, 6, // extra incident face sharing A-B
            0, 3, 2, // boundary edge A-C
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(0, 2))).toBe(2);
    });

    it('rejects an endpoint snap that would traverse the joined boundary edge in the same direction', () => {
        const uvs = new Float32Array([
            0.07676, 0.02874, 0, // A
            0.07676, 0.03011, 0, // B on the non-manifold edge
            0.07668, 0.03011, 0, // C, near-duplicate boundary endpoint
            0.07650, 0.02930, 0, // L
            0.07710, 0.02930, 0, // O
            0.07720, 0.03050, 0, // P
            0.07620, 0.03050, 0, // Q
        ]);
        const indices = new Uint32Array([
            0, 1, 4, // non-manifold A->B, candidate B -> C
            0, 1, 5, // extra incident face with the same direction
            0, 1, 6, // extra incident face with the same direction
            0, 2, 3, // incompatible boundary owner also traverses A->C
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);
        const hasRewrittenIncidentFace = Array.from({ length: result.indices.length / 3 }, (_, triangle) => {
            const face = Array.from(result.indices.slice(triangle * 3, triangle * 3 + 3));
            return face.includes(0) && face.includes(2) && face.some(vertex => vertex >= 4);
        }).some(Boolean);

        expect(counts.get(key(0, 2))).toBe(1);
        expect(hasRewrittenIncidentFace).toBe(false);
    });

    it('rejects an endpoint-snap batch that turns an orientable patch non-orientable', () => {
        const uvs = new Float32Array([
            0.20, 0.50, 0,
            0.20009, 0.50, 0,
            0.20008, 0.50, 0,
            0.35, 0.72, 0,
            0.05, 0.72, 0,
            0.35, 0.28, 0,
            0.05, 0.28, 0,
            0.50, 0.50, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 3,
            1, 0, 4,
            0, 1, 5,
            2, 0, 6,
            0, 4, 6,
            3, 7, 6,
            1, 2, 3,
            3, 7, 4,
            0, 4, 6,
            5, 7, 6,
            4, 5, 7,
            1, 4, 3,
        ]);
        expect(normalizeWindingByComponent(indices, indices.length).conflicts).toBe(0);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length, undefined, 1);

        expect(normalizeWindingByComponent(result.indices, result.indices.length).conflicts).toBe(0);
    });

    it('removes duplicate canonical outer-wall triangles that over-share fan edges', () => {
        const uvs = new Float32Array([
            0.52, 0.638, 0,
            0.523, 0.638, 0,
            0.522, 0.639, 0,
            0.525, 0.638, 0,
            0.520, 0.638, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            1, 0, 3,
            0, 1, 2,
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(result.outerIdxCount).toBe(indices.length - 3);
        expect(counts.get(key(0, 1))).toBe(2);
    });

    it('compacts canonical duplicate triangles introduced after late geometric welds', () => {
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
            1.000001, 0, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
            1.000001, 0, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            1, 0, 3,
            0, 4, 2,
        ]);

        const result = compactDuplicateCanonicalTriangles(indices, uvs, positions, 1e-4);

        expect(result.removedTriangles).toBe(1);
        expect(Array.from(result.indices)).toEqual([0, 1, 2, 1, 0, 3]);
    });

    it('can preserve duplicate triangles when removing them would expose a boundary edge', () => {
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
            1.000001, 0, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
            1.000001, 0, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            1, 0, 3,
            0, 4, 2,
        ]);

        const result = compactDuplicateCanonicalTriangles(indices, uvs, positions, 1e-4, {
            preserveBoundaryEdges: true,
        });

        expect(result.removedTriangles).toBe(0);
        expect(result.indices).toBe(indices);
    });

    it('removes duplicate triangles when all exposed edges remain covered', () => {
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
            1.000001, 0, 0,
            2, 0, 0,
            -1, 1, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
            1.000001, 0, 0,
            2, 0, 0,
            -1, 1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 4, 2,
            1, 0, 3,
            2, 1, 5,
            0, 2, 6,
        ]);

        const result = compactDuplicateCanonicalTriangles(indices, uvs, positions, 1e-4, {
            preserveBoundaryEdges: true,
        });

        expect(result.removedTriangles).toBe(1);
        expect(Array.from(result.indices)).toEqual([0, 1, 2, 1, 0, 3, 2, 1, 5, 0, 2, 6]);
    });

    it('prunes a central fan triangle that participates in multiple non-manifold edges', () => {
        const uvs = new Float32Array([
            0.52140, 0.63811, 0, // A
            0.52273, 0.63768, 0, // B
            0.52272, 0.63854, 0, // C central opposite
            0.52527, 0.63768, 0, // right opposite on A-B
            0.52007, 0.63768, 0, // left opposite on A-B
            0.52527, 0.63854, 0, // right opposite on C-A
            0.52007, 0.63854, 0, // left opposite on C-A
        ]);
        const indices = new Uint32Array([
            0, 1, 2, // central fan triangle, two non-manifold edges
            0, 1, 3,
            1, 0, 4,
            2, 0, 5,
            0, 2, 6,
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(result.outerIdxCount).toBe(indices.length - 3);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(0, 2))).toBe(2);
    });

    it('prunes surplus incident triangles from the crowded side of a non-manifold edge fan', () => {
        const uvs = new Float32Array([
            0.15576, 0.77243, 0, // A
            0.15353, 0.77210, 0, // B
            0.15130, 0.77168, 0, // crowded side
            0.15649, 0.77243, 0, // crowded side
            0.15571, 0.77350, 0, // opposite side
            0.15579, 0.77178, 0, // crowded side, strongest support
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 1, 3,
            1, 0, 4,
            0, 1, 5,
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(counts.get(key(0, 1))).toBe(2);
        expect(result.outerIdxCount).toBe(indices.length - 6);
    });

    it('rejects a crowded-fan prune that exposes a non-orientable parity cycle', () => {
        const uvs = new Float32Array([
            -0.5, 0.5, 0, // 0
            0.5, 1.0, 0,  // 1
            0.0, 0.0, 0,  // 2
            1.0, 0.0, 0,  // 3
            0.5, -1.0, 0, // 4
            -0.5, -0.5, 0,// 5
            0.5, 0.2, 0,  // 6 weak surplus owner on edge 2-3
        ]);
        const indices = new Uint32Array([
            0, 2, 1,
            2, 3, 1,
            2, 4, 3,
            4, 5, 3,
            4, 1, 5,
            1, 0, 5,
            2, 3, 6,
        ]);
        expect(normalizeWindingByComponent(indices, indices.length).conflicts).toBe(0);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length, undefined, 1);

        expect(normalizeWindingByComponent(result.indices, result.indices.length).conflicts).toBe(0);
    });

    it('uses wrapped U when pruning surplus seam-edge fan triangles', () => {
        const uvs = new Float32Array([
            0.00000, 0.11966, 0, // A
            0.00000, 0.11824, 0, // B
            0.00779, 0.11966, 0, // one side of seam
            0.99605, 0.11895, 0, // wrapped side of seam
            0.99868, 0.11895, 0, // wrapped side of seam
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            1, 0, 3,
            1, 0, 4,
        ]);

        const result = repairOuterWallTJunctions(indices, uvs, indices.length);
        const counts = edgeCounts(result.indices);

        expect(counts.get(key(0, 1))).toBe(2);
        expect(result.outerIdxCount).toBe(indices.length - 3);
    });

});

describe('repairSurfaceBoundaryTJunctions', () => {
    it('splits a long rim outer-edge segment across existing outer-wall split vertices', () => {
        const uvs = new Float32Array([
            0.1, 1.0, 0,  // outer top A
            0.2, 1.0, 0,  // outer top C
            0.3, 1.0, 0,  // outer top B
            0.2, 0.9, 0,  // outer interior
            0.1, 1.0, 2,  // rim outer A duplicate
            0.3, 1.0, 2,  // rim outer B duplicate
            0.2, 0.5, 2,  // rim interior
        ]);
        const indices = new Uint32Array([
            0, 3, 1, // split outer edge A-C
            1, 3, 2, // split outer edge C-B
            4, 5, 6, // long rim edge A-B
        ]);

        const result = repairSurfaceBoundaryTJunctions(indices, uvs);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(result.insertedTriangles).toBe(1);
        expect(counts.get(key(4, 5))).toBeUndefined();
        expect(counts.get(key(4, 1))).toBe(1);
        expect(counts.get(key(1, 5))).toBe(1);
    });

    it('splits a seam-wrapped rim outer-edge segment across existing outer-wall split vertices', () => {
        const uvs = new Float32Array([
            0.95, 1.0, 0, // outer top A
            0.00, 1.0, 0, // outer top C, across the periodic U seam
            0.05, 1.0, 0, // outer top B
            0.00, 0.9, 0, // outer interior
            0.95, 1.0, 2, // rim outer A duplicate
            0.05, 1.0, 2, // rim outer B duplicate
            0.00, 0.5, 2, // rim interior
        ]);
        const indices = new Uint32Array([
            0, 3, 1,
            1, 3, 2,
            4, 5, 6,
        ]);

        const result = repairSurfaceBoundaryTJunctions(indices, uvs);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(result.insertedTriangles).toBe(1);
        expect(counts.get(key(4, 5))).toBeUndefined();
        expect(counts.get(key(4, 1))).toBe(1);
        expect(counts.get(key(1, 5))).toBe(1);
    });

    it('splits a long bottom-under outer edge across existing outer-wall split vertices', () => {
        const uvs = new Float32Array([
            0.1, 0.0, 0,  // outer bottom A
            0.2, 0.0, 0,  // outer bottom C
            0.3, 0.0, 0,  // outer bottom B
            0.2, 0.1, 0,  // outer interior
            0.1, 0.0, 3,  // bottom-under outer A duplicate
            0.3, 0.0, 3,  // bottom-under outer B duplicate
            0.2, 0.5, 3,  // bottom-under interior
        ]);
        const indices = new Uint32Array([
            0, 1, 3,
            1, 2, 3,
            4, 6, 5,
        ]);

        const result = repairSurfaceBoundaryTJunctions(indices, uvs);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBe(1);
        expect(result.insertedTriangles).toBe(1);
        expect(counts.get(key(4, 5))).toBeUndefined();
        expect(counts.get(key(4, 1))).toBe(1);
        expect(counts.get(key(1, 5))).toBe(1);
    });
});

describe('fillOuterWallBoundaryLoops', () => {
    it('triangulates a closed same-surface boundary loop using existing vertices', () => {
        const uvs = new Float32Array([
            0.1, 0.1, 0, // outer A
            0.5, 0.1, 0, // outer B
            0.5, 0.5, 0, // outer C
            0.1, 0.5, 0, // outer D
            0.2, 0.2, 0, // inner A
            0.4, 0.2, 0, // inner B
            0.4, 0.4, 0, // inner C
            0.2, 0.4, 0, // inner D
        ]);
        const indices = new Uint32Array([
            0, 1, 5,
            0, 5, 4,
            1, 2, 6,
            1, 6, 5,
            2, 3, 7,
            2, 7, 6,
            3, 0, 4,
            3, 4, 7,
        ]);

        const result = fillOuterWallBoundaryLoops(indices, uvs);
        const counts = edgeCounts(result.indices);

        expect(result.filledLoops).toBe(2);
        expect(result.insertedTriangles).toBe(4);
        expect(counts.get(key(4, 5))).toBe(2);
        expect(counts.get(key(5, 6))).toBe(2);
        expect(counts.get(key(6, 7))).toBe(2);
        expect(counts.get(key(7, 4))).toBe(2);
    });

    it('rejects an outer-wall cap batch that creates a non-orientable parity cycle', () => {
        const uvs = new Float32Array([
            0.72041655, 0.69979334, 0,
            0.49625146, 0.61834079, 0,
            0.57888335, 0.51395154, 0,
            0.81735790, 0.09547478, 0,
            0.83292997, 0.96088523, 0,
            0.55998379, 0.85659707, 0,
            0.32720199, 0.22720972, 0,
        ]);
        const indices = new Uint32Array([
            5, 6, 1,
            1, 5, 3,
            4, 1, 2,
            4, 5, 0,
            0, 4, 1,
            3, 0, 4,
            0, 3, 6,
            6, 0, 5,
            0, 1, 3,
            4, 1, 3,
        ]);
        expect(normalizeWindingByComponent(indices, indices.length).conflicts).toBe(0);

        const result = fillOuterWallBoundaryLoops(indices, uvs);

        expect(result.attemptedLoops).toBeGreaterThan(0);
        expect(normalizeWindingByComponent(result.indices, result.indices.length).conflicts).toBe(0);
    });

    it('triangulates a closed boundary loop that crosses the U seam', () => {
        const uvs = new Float32Array([
            0.95, 0.2, 0,
            0.05, 0.2, 0,
            0.05, 0.4, 0,
            0.95, 0.4, 0,
            0.90, 0.1, 0,
            0.10, 0.1, 0,
            0.10, 0.5, 0,
            0.90, 0.5, 0,
        ]);
        const indices = new Uint32Array([
            4, 5, 1,
            4, 1, 0,
            5, 6, 2,
            5, 2, 1,
            6, 7, 3,
            6, 3, 2,
            7, 4, 0,
            7, 0, 3,
        ]);

        const result = fillOuterWallBoundaryLoops(indices, uvs);
        const counts = edgeCounts(result.indices);

        expect(result.filledLoops).toBe(2);
        expect(result.insertedTriangles).toBe(4);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(1, 2))).toBe(2);
        expect(counts.get(key(2, 3))).toBe(2);
        expect(counts.get(key(3, 0))).toBe(2);
    });

    it('chooses a projected ear order that avoids an avoidable 3D sliver', () => {
        // The accepted inner boundary is a convex pentagon whose vertices 1-2-3
        // are nearly collinear. The deterministic first ear is 1-2-3
        // (aspect > 1,000), while rotating the
        // exact same owner-opposed loop produces a clean triangulation.
        const uvs = new Float32Array([
            0.20, 0.20, 0,
            0.80, 0.20, 0,
            0.80006, 0.50, 0,
            0.80, 0.80, 0,
            0.20, 0.80, 0,
            0.10, 0.10, 2,
            0.90, 0.10, 2,
            0.95, 0.50, 2,
            0.90, 0.90, 2,
            0.10, 0.90, 2,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            10, 0, 0,
            10.001, 5, 0,
            10, 10, 0,
            0, 10, 0,
            -2, -2, 0,
            12, -2, 0,
            13, 5, 0,
            12, 12, 0,
            -2, 12, 0,
        ]);
        const indices = new Uint32Array([
            0, 5, 6, 0, 6, 1,
            1, 6, 7, 1, 7, 2,
            2, 7, 8, 2, 8, 3,
            3, 8, 9, 3, 9, 4,
            4, 9, 5, 4, 5, 0,
        ]);

        const result = fillOuterWallBoundaryLoops(indices, uvs, positions, 1e-4);
        const inserted = result.indices.slice(indices.length);
        const quality = triangleQualityDiagnostics({ vertices: positions, indices: inserted }, 8);
        const topology = topologyDiagnostics({ vertices: positions, indices: result.indices, uvs }, 1e-4, 8);

        expect(result.filledLoops).toBe(1);
        expect(result.insertedTriangles).toBe(3);
        expect(result.projectedTriangulations).toBe(1);
        expect(quality.maxAspect3D).toBeLessThan(10);
        expect(topology.nonManifoldEdges).toBe(0);
        expect(topology.orientationMismatches).toBe(0);
    });

    it('zippers a long two-rail repair loop instead of fanning from one endpoint', () => {
        // Faithful shape of the live HarmonicRipple 48-vertex repair loop: two
        // narrowly separated rails with many nearly collinear vertices. A
        // first-valid-ear clip repeatedly removes one rail and creates a long
        // endpoint fan. Choosing the best valid ear at each step should alternate
        // rails and keep every inserted triangle within a printable aspect bound.
        const liveLoopPositions = [
            [53.044796, -0.432053, 96.166695], [53.073860, -0.432242, 96.315979],
            [53.097107, -0.432393, 96.434029], [53.108139, -0.432465, 96.489555],
            [53.129318, -0.432604, 96.595459], [53.161964, -0.432818, 96.756760],
            [53.181606, -0.432947, 96.852722], [53.215004, -0.433167, 97.014160],
            [53.248878, -0.433391, 97.175598], [53.274715, -0.433562, 97.297295],
            [53.291515, -0.433674, 97.375793], [53.320431, -0.433866, 97.509674],
            [53.361782, -0.434142, 97.698669], [53.387589, -0.434315, 97.815193],
            [53.407074, -0.434446, 97.902473], [53.423737, -0.434558, 97.976624],
            [53.443474, -0.434690, 98.063904], [53.460350, -0.434804, 98.138062],
            [53.480339, -0.434939, 98.225342], [53.505775, -0.435110, 98.335587],
            [53.548237, -0.435398, 98.517593], [53.586380, -0.435656, 98.679031],
            [53.627903, -0.435939, 98.852539], [53.369270, -1.060726, 98.679031],
            [53.340611, -1.039672, 98.517593], [53.308468, -1.016337, 98.335587],
            [53.289089, -1.002252, 98.225342], [53.273796, -0.991027, 98.138062],
            [53.260834, -0.981368, 98.063904], [53.245632, -0.969957, 97.976624],
            [53.232754, -0.960509, 97.902473], [53.217621, -0.949151, 97.815193],
            [53.197495, -0.934344, 97.698669], [53.165028, -0.909754, 97.509674],
            [53.142128, -0.892998, 97.375793], [53.128777, -0.882663, 97.297295],
            [53.108120, -0.867140, 97.175598], [53.080860, -0.846513, 97.014160],
            [53.053745, -0.825988, 96.852722], [53.037712, -0.813500, 96.756760],
            [53.010868, -0.793012, 96.595459], [52.993328, -0.779311, 96.489555],
            [52.984154, -0.772448, 96.434029], [52.964741, -0.757186, 96.315979],
            [52.940285, -0.738375, 96.166695], [52.859711, -0.675338, 95.668869],
            [52.921215, -0.431258, 95.507431], [52.950768, -0.431447, 95.668869],
        ];
        const loopCount = liveLoopPositions.length;
        const uvs: number[] = [];
        const positions: number[] = [];
        for (let i = 0; i < loopCount; i++) {
            uvs.push(i / loopCount, 0.5, 0);
            positions.push(...liveLoopPositions[i]);
        }
        for (let i = 0; i < loopCount; i++) {
            uvs.push(i / loopCount, 0.25, 2);
            positions.push(positions[i * 3] - 2, positions[i * 3 + 1] - 2, positions[i * 3 + 2]);
        }

        const indices: number[] = [];
        for (let i = 0; i < loopCount; i++) {
            const next = (i + 1) % loopCount;
            const outer = loopCount + i;
            const outerNext = loopCount + next;
            indices.push(i, outer, outerNext, i, outerNext, next);
        }

        const uvArray = new Float32Array(uvs);
        const positionArray = new Float32Array(positions);
        const indexArray = new Uint32Array(indices);
        const result = fillOuterWallBoundaryLoops(indexArray, uvArray, positionArray, 1e-4);
        const inserted = result.indices.slice(indexArray.length);
        const quality = triangleQualityDiagnostics({ vertices: positionArray, indices: inserted }, 8);
        const topology = topologyDiagnostics(
            { vertices: positionArray, indices: result.indices, uvs: uvArray },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(1);
        expect(result.insertedTriangles).toBe(loopCount - 2);
        expect(quality.maxAspect3D).toBeLessThan(20);
        expect(topology.nonManifoldEdges).toBe(0);
        expect(topology.orientationMismatches).toBe(0);
    });

    it('defers a high-aspect cap to the later center-aware loop filler', () => {
        const uvs = new Float32Array([
            0.2, 0.4, 0,
            0.3, 0.4, 0,
            0.3, 0.6, 0,
            0.2, 0.6, 0,
            0.25, 0.5, 0,
        ]);
        const positions = new Float32Array([
            26.688030, -61.833843, 83.074982,
            26.652803, -61.843555, 83.229515,
            26.654827, -61.848251, 83.074982,
            24.781635, -63.090847, 83.074982,
            31.194324, -57.154125, 83.113617,
        ]);
        const indices = new Uint32Array([
            4, 0, 1,
            4, 1, 2,
            4, 2, 3,
            4, 3, 0,
        ]);

        const outer = fillOuterWallBoundaryLoops(indices, uvs, positions, 1e-4);
        const center = fillSameSurfaceBoundaryLoopsWithCenters(outer.indices, uvs, positions, 1e-4);
        const inserted = center.indices.slice(indices.length);
        const quality = triangleQualityDiagnostics({ vertices: center.positions, indices: inserted }, 8);
        const topology = topologyDiagnostics(
            { vertices: center.positions, indices: center.indices, uvs: center.uvs },
            1e-4,
            8,
        );

        expect(outer.filledLoops).toBe(0);
        expect(center.filledLoops).toBe(1);
        expect(center.insertedVertices).toBe(1);
        expect(quality.maxAspect3D).toBeLessThan(100);
        expect(topology.boundaryEdges).toBe(0);
        expect(topology.nonManifoldEdges).toBe(0);
        expect(topology.orientationMismatches).toBe(0);
    });
});

describe('fillSameSurfaceBoundaryLoops', () => {
    it('skips closed boundary loops whose vertices span multiple surfaces', () => {
        const uvs = new Float32Array([
            0.2, 0.2, 0,
            0.4, 0.2, 0,
            0.4, 0.4, 2,
            0.2, 0.4, 2,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
        ]);

        const result = fillSameSurfaceBoundaryLoops(indices, uvs);

        expect(result.filledLoops).toBe(0);
        expect(result.indices.length).toBe(indices.length);
    });

    it('rejects a same-surface cap that closes an orientable strip into a non-orientable cycle', () => {
        const uvs = new Float32Array([
            0.72041655, 0.69979334, 0,
            0.49625146, 0.61834079, 0,
            0.57888335, 0.51395154, 0,
            0.81735790, 0.09547478, 0,
            0.83292997, 0.96088523, 0,
            0.55998379, 0.85659707, 0,
            0.32720199, 0.22720972, 0,
        ]);
        const indices = new Uint32Array([
            5, 6, 1,
            1, 5, 3,
            4, 1, 2,
            4, 5, 0,
            0, 4, 1,
            3, 0, 4,
            0, 3, 6,
            6, 0, 5,
            0, 1, 3,
            4, 1, 3,
        ]);
        expect(normalizeWindingByComponent(indices, indices.length).conflicts).toBe(0);

        const result = fillSameSurfaceBoundaryLoops(indices, uvs);

        expect(result.attemptedLoops).toBeGreaterThan(0);
        expect(normalizeWindingByComponent(result.indices, result.indices.length).conflicts).toBe(0);
    });
});

describe('fillSameSurfaceBoundaryLoopsWithCenters', () => {
    it('rejects a center-aware cap that closes an orientable strip into a non-orientable cycle', () => {
        const uvs = new Float32Array([
            0.72041655, 0.69979334, 0,
            0.49625146, 0.61834079, 0,
            0.57888335, 0.51395154, 0,
            0.81735790, 0.09547478, 0,
            0.83292997, 0.96088523, 0,
            0.55998379, 0.85659707, 0,
            0.32720199, 0.22720972, 0,
        ]);
        const positions = new Float32Array(uvs);
        const indices = new Uint32Array([
            5, 6, 1,
            1, 5, 3,
            4, 1, 2,
            4, 5, 0,
            0, 4, 1,
            3, 0, 4,
            0, 3, 6,
            6, 0, 5,
            0, 1, 3,
            4, 1, 3,
        ]);
        expect(normalizeWindingByComponent(indices, indices.length).conflicts).toBe(0);

        const result = fillSameSurfaceBoundaryLoopsWithCenters(indices, uvs, positions);

        expect(result.attemptedLoops).toBeGreaterThan(0);
        expect(normalizeWindingByComponent(result.indices, result.indices.length).conflicts).toBe(0);
    });

    function livePoorQuadFixture(): { indices: Uint32Array; uvs: Float32Array; positions: Float32Array } {
        const uvs = new Float32Array([
            0.2, 0.4, 0,
            0.3, 0.4, 0,
            0.3, 0.6, 0,
            0.2, 0.6, 0,
            0.25, 0.5, 0,
        ]);
        const positions = new Float32Array([
            26.688030, -61.833843, 83.074982,
            26.652803, -61.843555, 83.229515,
            26.654827, -61.848251, 83.074982,
            24.781635, -63.090847, 83.074982,
            31.194324, -57.154125, 83.113617,
        ]);
        const indices = new Uint32Array([
            4, 0, 1,
            4, 1, 2,
            4, 2, 3,
            4, 3, 0,
        ]);
        return { indices, uvs, positions };
    }

    // A bowtie quad: two triangles share the diagonal 0-2 (interior, count 2), so the
    // boundary loop is the topological perimeter 0-1-2-3. The UV and 3D positions are
    // laid out self-intersecting, so triangulateLoopManifoldSafe fails in BOTH uv and
    // projected space → the function must fall back to inserting a single average
    // center vertex and fanning the loop around it. This pins that fallback exactly so
    // the O(N^2) → pre-allocated-buffer refactor stays behavior-identical.
    function bowtieFixture(): { indices: Uint32Array; uvs: Float32Array; positions: Float32Array } {
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
        ]);
        return { indices, uvs, positions };
    }

    it('inserts exactly one center vertex and fans the loop when manifold-safe triangulation fails', () => {
        const { indices, uvs, positions } = bowtieFixture();

        const result = fillSameSurfaceBoundaryLoopsWithCenters(indices, uvs, positions);

        // Center-fan fallback was taken.
        expect(result.insertedVertices).toBe(1);
        expect(result.filledLoops).toBe(1);
        expect(result.attemptedLoops).toBe(1);
        expect(result.emptyTriangulations).toBe(0);
        expect(result.unsafeLoops).toBe(0);

        // One center vertex appended → 5 vertices total (15 floats).
        expect(result.uvs.length).toBe(15);
        expect(result.positions.length).toBe(15);

        // Original vertices preserved byte-for-byte.
        for (let i = 0; i < uvs.length; i++) expect(result.uvs[i]).toBe(uvs[i]);
        for (let i = 0; i < positions.length; i++) expect(result.positions[i]).toBe(positions[i]);

        // Center is appended at vertex index 4. The 3D position is the corner
        // centroid (0.5, 0.5, 0). The uv u-coordinate wraps to 0 (the seam-unwrap in
        // averageLoopCenter maps the 0,1,0,1 corner u-sequence back across the seam),
        // while t is the 0,0,1,1 average = 0.5, surface 0.
        expect(result.uvs[12]).toBe(0);
        expect(result.uvs[13]).toBeCloseTo(0.5, 6);
        expect(result.uvs[14]).toBe(0);
        expect(result.positions[12]).toBeCloseTo(0.5, 6);
        expect(result.positions[13]).toBeCloseTo(0.5, 6);
        expect(result.positions[14]).toBeCloseTo(0, 6);

        // Fan adds 4 triangles (one per loop edge) on top of the original 2.
        expect(result.insertedTriangles).toBe(4);
        expect(result.indices.length).toBe(indices.length + 12);

        // Every original boundary edge now has exactly 2 incident triangles (the
        // original wall triangle + its fan triangle); the four center spokes each
        // appear in 2 adjacent fan triangles.
        const counts = edgeCounts(result.indices);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(1, 2))).toBe(2);
        expect(counts.get(key(2, 3))).toBe(2);
        expect(counts.get(key(3, 0))).toBe(2);
        expect(counts.get(key(0, 4))).toBe(2);
        expect(counts.get(key(1, 4))).toBe(2);
        expect(counts.get(key(2, 4))).toBe(2);
        expect(counts.get(key(3, 4))).toBe(2);
    });

    it('ear-clip fill emits owner-opposite winding so the cap is orientation-consistent', () => {
        // A single same-surface wall triangle wound CCW in UV leaves a 3-edge
        // boundary loop. The legacy ear-clip (orientedLoopPoints → UV-area) wound
        // the fill triangle UV-CCW, identical to the owner, so each shared edge was
        // traversed in the SAME direction → a genuine winding flip. The fill must
        // traverse each boundary edge opposite to its owner (the same rule the
        // cross-surface filler already enforces). Pins orientation, not just hole
        // closure. This loop (length 3) takes the ear-clip path (no center vertex).
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);

        const result = fillSameSurfaceBoundaryLoopsWithCenters(indices, uvs, positions);
        const topo = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(0);
        expect(result.insertedTriangles).toBe(1);
        expect(topo.boundaryEdges).toBe(0);
        expect(topo.nonManifoldEdges).toBe(0);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('center-fan fallback emits owner-opposite winding for a non-ear-clippable loop', () => {
        // A same-surface bowtie quad: the two wall triangles share diagonal 0-2,
        // so the perimeter 0-1-2-3 is the boundary loop. The UV layout is
        // self-intersecting, so ear-clip fails in both UV and projected space →
        // the filler inserts one center vertex and fans. The fan must wind each
        // spoke opposite to its owning boundary edge, not UV-CCW.
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            1, 1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
        ]);

        const result = fillSameSurfaceBoundaryLoopsWithCenters(indices, uvs, positions);
        const topo = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(1);
        expect(result.insertedTriangles).toBe(4);
        expect(topo.boundaryEdges).toBe(0);
        expect(topo.nonManifoldEdges).toBe(0);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('prefers a sub-sliver center fan over a high-aspect existing-vertex cap', () => {
        const { indices, uvs, positions } = livePoorQuadFixture();

        const result = fillSameSurfaceBoundaryLoopsWithCenters(indices, uvs, positions, 1e-4);
        const inserted = result.indices.slice(indices.length);
        const quality = triangleQualityDiagnostics({ vertices: result.positions, indices: inserted }, 8);
        const topology = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(1);
        expect(quality.maxAspect3D).toBeLessThan(100);
        expect(topology.boundaryEdges).toBe(0);
        expect(topology.nonManifoldEdges).toBe(0);
        expect(topology.orientationMismatches).toBe(0);
    });

    it('refuses a complex same-surface fill that would create sliver triangles', () => {
        const segmentCount = 400;
        const positions = new Float32Array(segmentCount * 2 * 3);
        const uvs = new Float32Array(segmentCount * 2 * 3);
        const indices = new Uint32Array(segmentCount * 2 * 3);

        for (let i = 0; i < segmentCount; i++) {
            const fraction = i / segmentCount;
            const angle = fraction * fraction * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            for (const [ring, radius] of [[0, 10], [1, 20]] as const) {
                const vertex = ring * segmentCount + i;
                positions[vertex * 3] = radius * cos;
                positions[vertex * 3 + 1] = radius * sin;
                positions[vertex * 3 + 2] = 0;
                uvs[vertex * 3] = i / segmentCount;
                uvs[vertex * 3 + 1] = ring === 0 ? 0.4 : 0.6;
                uvs[vertex * 3 + 2] = 0;
            }

            const next = (i + 1) % segmentCount;
            const inner = i;
            const innerNext = next;
            const outer = segmentCount + i;
            const outerNext = segmentCount + next;
            const offset = i * 6;
            indices[offset] = inner;
            indices[offset + 1] = outer;
            indices[offset + 2] = outerNext;
            indices[offset + 3] = inner;
            indices[offset + 4] = outerNext;
            indices[offset + 5] = innerNext;
        }

        const result = fillSameSurfaceBoundaryLoopsWithCenters(indices, uvs, positions);

        expect(result.attemptedLoops).toBe(2);
        expect(result.filledLoops).toBe(0);
        expect(result.insertedVertices).toBe(0);
        expect(result.insertedTriangles).toBe(0);
        expect(result.unsafeLoops).toBe(2);
    });
});

describe('weldNearCoincidentBoundaryVertices', () => {
    it('welds a near-coincident duplicate pair on defect edges and strips degenerates', () => {
        // Vertices 1 and 4 are the SAME physical point split ~1µm apart (float path
        // divergence at a feature/seam crossing): above the 0.1µm canonical weld so
        // they never merge, yet both sit on boundary (defect) edges of this open
        // patch. A defect-region weld at ~20µm must merge 4 into 1, collapsing the two
        // degenerate 1-4 triangles (stripped) and leaving a clean patch.
        const weldTol = 1e-4;        // 0.1µm canonical weld — keeps 1 and 4 distinct
        const defectTol = 2e-2;      // 20µm defect weld — merges 1 and 4
        const positions = new Float32Array([
            0, 0, 0,        // 0
            1, 0, 0,        // 1
            0.5, 1, 0,      // 2
            0.5, -1, 0,     // 3
            1, 1e-3, 0,     // 4  (~1µm from vertex 1 → > weldTol, < defectTol)
            2, 1, 0,        // 5
            2, -1, 0,       // 6
        ]);
        const indices = new Uint32Array([
            0, 1, 2,        // edge 0-1
            0, 3, 1,        // edge 0-1 (manifold pair)
            1, 4, 5,        // edge 1-4 (collapses when 4 welds to 1)
            4, 1, 6,        // edge 1-4 (collapses when 4 welds to 1)
        ]);

        const result = weldNearCoincidentBoundaryVertices(indices, positions, weldTol, defectTol);

        // 4 was merged into 1, so no triangle references vertex 4 anymore.
        expect(result.weldedVertices).toBeGreaterThan(0);
        for (let i = 0; i < result.indices.length; i++) {
            expect(result.indices[i]).not.toBe(4);
        }
        // The two 1-4 triangles became (1,1,*) degenerate and were stripped.
        expect(result.strippedTriangles).toBe(2);
        expect(result.indices.length).toBe(indices.length - 2 * 3);
    });

    it('leaves a clean mesh untouched (no near-coincident defect pairs)', () => {
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const result = weldNearCoincidentBoundaryVertices(indices, positions, 1e-4, 2e-2);
        expect(result.weldedVertices).toBe(0);
        expect(result.strippedTriangles).toBe(0);
        expect(Array.from(result.indices)).toEqual([0, 1, 2]);
    });

    it('needs the fine topology tolerance to discover micro-crack duplicate vertices', () => {
        // FourierBloom regression shape: two triangles should share A-B and B-C,
        // but B was emitted twice about 0.2um apart. A coarse validator tolerance
        // hides the crack during defect discovery, so the weld never sees it.
        const positions = new Float32Array([
            0, 0, 0,       // 0: A
            1, 0, 0,       // 1: B0
            0, 1, 0,       // 2: C
            1, 0.0002, 0,  // 3: B1, distinct at 1e-4 but same at 1e-3
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            2, 3, 0,
        ]);

        const coarse = weldNearCoincidentBoundaryVertices(indices, positions, 1e-3, 0.02);
        expect(coarse.weldedVertices).toBe(0);
        expect(topologyDiagnostics({ vertices: positions, indices: coarse.indices }, 1e-4, 0).boundaryEdges).toBe(4);

        const fine = weldNearCoincidentBoundaryVertices(indices, positions, 1e-4, 0.02);
        expect(fine.weldedVertices).toBe(1);
        expect(fine.strippedTriangles).toBe(0);
        expect(topologyDiagnostics({ vertices: positions, indices: fine.indices }, 1e-4, 0).boundaryEdges).toBe(0);
    });

    it('reports how many stripped triangles came from a tracked outer prefix', () => {
        const positions = new Float32Array([
            0, 0, 0,        // 0
            1, 0, 0,        // 1
            0, 1, 0,        // 2
            0, -1, 0,       // 3
            1, 1e-3, 0,     // 4: near-coincident with 1
            2, 1, 0,        // 5
            2, -1, 0,       // 6
        ]);
        const indices = new Uint32Array([
            // Outer prefix: one stable triangle, one triangle that collapses.
            0, 1, 2,
            1, 4, 5,
            // Non-outer suffix: one triangle that collapses, one stable triangle.
            4, 1, 6,
            0, 3, 1,
        ]);

        const result = weldNearCoincidentBoundaryVertices(indices, positions, 1e-4, 0.02, 6);

        expect(result.strippedTriangles).toBe(2);
        expect(result.strippedPrefixTriangles).toBe(1);
        expect(result.indices.length).toBe(indices.length - 2 * 3);
    });
});

describe('splitResidualBoundaryTJunctions', () => {
    it('splits a coarse boundary edge at a finer vertex lying on it (3D T-junction)', () => {
        // The coarse triangle 0-1-2 owns the long boundary edge 0-1. Vertex 3 sits at
        // the midpoint of 0-1 — a finer adjacent surface's vertex (the rim/outer-wall
        // density mismatch in miniature). Two finer triangles below (0-4-3, 3-5-1)
        // make 0-3 and 3-1 boundary edges. The pass must split the coarse triangle at
        // 3 so 0-3 and 3-1 each reach incidence 2 (watertight), owner-consistent.
        const uvs = new Float32Array([
            0, 0, 0,    // 0
            2, 0, 0,    // 1
            1, 1, 0,    // 2  coarse apex (above the edge)
            1, 0, 0,    // 3  midpoint of 0-1
            0, -1, 0,   // 4
            2, -1, 0,   // 5
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2,    // coarse, owns boundary edge 0-1
            0, 4, 3,    // finer, owns boundary edge 3-0
            3, 5, 1,    // finer, owns boundary edge 1-3
        ]);

        const before = edgeCounts(indices);
        expect(before.get(key(0, 1))).toBe(1);
        expect(before.get(key(0, 3))).toBe(1);
        expect(before.get(key(3, 1))).toBe(1);

        const result = splitResidualBoundaryTJunctions(indices, uvs, positions, 1e-4);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBeGreaterThan(0);
        // Coarse edge 0-1 is replaced by 0-3 and 3-1, each now shared with the finer
        // triangles below → the T-junction is closed (the fixture's outer perimeter
        // 0-2/1-2/0-4/4-3/3-5/5-1 stays legitimately open, this is an open patch).
        expect(counts.get(key(0, 1)) ?? 0).toBe(0);
        expect(counts.get(key(0, 3))).toBe(2);
        expect(counts.get(key(3, 1))).toBe(2);

        const topo = topologyDiagnostics(
            { vertices: positions, indices: result.indices, uvs },
            1e-4,
            8,
        );
        // The split introduces no non-manifold edges and no winding flips (the fan
        // preserves the owner triangle's winding).
        expect(topo.nonManifoldEdges).toBe(0);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('does not split a boundary edge when the midpoint has no matching boundary segments to close', () => {
        const uvs = new Float32Array([
            0, 0, 0,
            2, 0, 0,
            1, 1, 0,
            1, 0, 0,
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2,
        ]);

        const before = topologyDiagnostics({ vertices: positions, indices, uvs }, 1e-4, 8);
        const result = splitResidualBoundaryTJunctions(indices, uvs, positions, 1e-4);
        const after = topologyDiagnostics({ vertices: positions, indices: result.indices, uvs }, 1e-4, 8);

        expect(result.repairedEdges).toBe(0);
        expect(result.insertedTriangles).toBe(0);
        expect(Array.from(result.indices)).toEqual(Array.from(indices));
        expect(after.boundaryEdges).toBe(before.boundaryEdges);
    });

    it('is a no-op when no vertex lies on any boundary edge', () => {
        // A single triangle: its three edges are boundary, but no other vertex lies on
        // them, so there is nothing to split.
        const uvs = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const positions = uvs.slice();
        const indices = new Uint32Array([0, 1, 2]);

        const result = splitResidualBoundaryTJunctions(indices, uvs, positions, 1e-4);

        expect(result.repairedEdges).toBe(0);
        expect(result.insertedTriangles).toBe(0);
        expect(Array.from(result.indices)).toEqual([0, 1, 2]);
    });

    it('splits a vertex sitting NEAR (within on-edge tolerance) a boundary edge, not only exactly on it', () => {
        // Same T-junction as the first test, but vertex 3 sits 0.01mm OFF the chord
        // (well inside the on-edge tolerance edgeOnTol = len*0.015 = 0.03mm for this
        // 2mm edge, but far outside the old 4e-4mm spatial-hash cell). RED at HEAD: the
        // grid cell (≈4e-4mm) is FAR smaller than the on-edge tolerance, so the query
        // only scans a ±4e-4mm band around the edge and never visits vertex 3's cell —
        // the genuine on-edge vertex is missed and the edge is left unsplit. The cell
        // must be sized to a real spatial scale (and the query must cover edgeOnTol).
        const uvs = new Float32Array([
            0, 0, 0,      // 0
            2, 0, 0,      // 1
            1, 1, 0,      // 2  coarse apex (above)
            1, -0.01, 0,  // 3  ~midpoint, 0.01mm below the chord (within on-edge tol)
            0, -1, 0,     // 4
            2, -1, 0,     // 5
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2,    // coarse, owns boundary edge 0-1
            0, 4, 3,    // finer, owns boundary edge 3-0
            3, 5, 1,    // finer, owns boundary edge 1-3
        ]);

        const result = splitResidualBoundaryTJunctions(indices, uvs, positions, 1e-4);
        const counts = edgeCounts(result.indices);

        expect(result.repairedEdges).toBeGreaterThan(0);
        expect(counts.get(key(0, 1)) ?? 0).toBe(0); // coarse edge replaced
        expect(counts.get(key(0, 3))).toBe(2);
        expect(counts.get(key(3, 1))).toBe(2);
        const topo = topologyDiagnostics({ vertices: positions, indices: result.indices, uvs }, 1e-4, 8);
        expect(topo.nonManifoldEdges).toBe(0);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('splits an on-edge vertex on a LONG DIAGONAL boundary edge without O(bbox^3) blow-up', () => {
        // Perf guard for the hang root cause. A ~52mm DIAGONAL boundary edge (0→1).
        // With the old fixed ≈4e-4mm cell the onEdgeCanon query iterates every grid
        // cell in the edge's bounding box — (edgeLen/cell)^3 ≈ (52/4e-4)^3 ≈ 2e15 cells
        // — which never returns (the measured SpiralRidges/RippleInterference/Gyroid
        // hang). With a sane cell this completes in well under a second. Asserting the
        // split also proves the larger cell still finds the genuine on-edge vertex.
        const A: [number, number, number] = [0, 0, 0];
        const B: [number, number, number] = [30, 30, 30]; // |AB| ≈ 51.96mm, fully diagonal
        const M: [number, number, number] = [15, 15, 15]; // exact midpoint, on the edge
        // Two finer triangles make A-M and M-B boundary edges; the coarse A-B-apex
        // triangle owns the long boundary edge A-B that must be split at M.
        const apex: [number, number, number] = [15, 16, 14];   // off the edge line
        const lowA: [number, number, number] = [0, -1, 1];
        const lowB: [number, number, number] = [30, 29, 31];
        const positions = new Float32Array([
            ...A, ...B, ...apex, ...M, ...lowA, ...lowB,
        ]);
        const uvs = positions.slice();
        const indices = new Uint32Array([
            0, 1, 2,   // coarse, owns long diagonal boundary edge 0-1
            0, 4, 3,   // finer, owns boundary edge 3-0
            3, 5, 1,   // finer, owns boundary edge 1-3
        ]);

        const start = Date.now();
        const result = splitResidualBoundaryTJunctions(indices, uvs, positions, 1e-4);
        const elapsedMs = Date.now() - start;

        expect(elapsedMs).toBeLessThan(2000); // would be effectively infinite at HEAD
        expect(result.repairedEdges).toBeGreaterThan(0);
        const counts = edgeCounts(result.indices);
        expect(counts.get(key(0, 1)) ?? 0).toBe(0);
        expect(counts.get(key(0, 3))).toBe(2);
        expect(counts.get(key(3, 1))).toBe(2);
    });
});

describe('fillBranchedBoundaryComponentsWithCenters', () => {
    // Two bowtie quads that share a single junction vertex (index 0). In the
    // canonical boundary graph vertex 0 has degree 4 (neighbours 1, 3, 4, 6), so
    // the component is "branched": orderedClosedLoops — and therefore every
    // existing simple-loop filler — refuses to start a walk through the degree-4
    // junction and leaves BOTH perimeters permanently open. This is exactly the
    // residual that survives the export fill battery (branched components,
    // deg3+ junctions). This filler must decompose the branched component into
    // its two edge-disjoint cycles 0-1-2-3 and 0-4-5-6 and centre-fan each,
    // closing all eight perimeter edges to count 2.
    function sharedJunctionFixture(): { indices: Uint32Array; uvs: Float32Array; positions: Float32Array } {
        const uvs = new Float32Array([
            0, 0, 0,    // 0 shared junction
            1, 0, 0,    // 1
            0, 1, 0,    // 2  (bowtie layout → ear-clip fails, forces centre-fan)
            1, 1, 0,    // 3
            -1, 0, 0,   // 4
            0, -1, 0,   // 5  (second bowtie)
            -1, -1, 0,  // 6
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
            0, 4, 5,
            0, 5, 6,
        ]);
        return { indices, uvs, positions };
    }

    it('closes a branched (degree-4 junction) component that simple-loop fillers skip', () => {
        const { indices, uvs, positions } = sharedJunctionFixture();

        // Baseline: the existing simple-loop centre filler cannot start a walk
        // through the degree-4 junction, so it leaves the component untouched.
        const simple = fillSameSurfaceBoundaryLoopsWithCenters(indices, uvs, positions);
        expect(simple.filledLoops).toBe(0);

        const result = fillBranchedBoundaryComponentsWithCenters(indices, uvs, positions);

        // Both cycles decomposed and centre-fanned (one fresh centre each).
        expect(result.filledLoops).toBe(2);
        expect(result.insertedVertices).toBe(2);
        expect(result.unsafeLoops ?? 0).toBe(0);

        // Every original perimeter edge now has exactly 2 incident triangles.
        const counts = edgeCounts(result.indices);
        for (const [a, b] of [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [0, 4], [4, 5], [5, 6], [6, 0],
        ] as Array<[number, number]>) {
            expect(counts.get(key(a, b))).toBe(2);
        }

        // Each centre-fan caps its cycle with owner-opposite winding, so the
        // closed component is orientation-consistent, not just hole-free.
        const topo = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );
        expect(topo.orientationMismatches).toBe(0);
    });

    it('uses a quality triangulation for a long two-rail cycle in a branched component', () => {
        const railCount = 24;
        const loopCount = railCount * 2;
        const uvs: number[] = [];
        const positions: number[] = [];
        for (let i = 0; i < railCount; i++) {
            uvs.push(i / loopCount, 0.5, 0);
            positions.push(0, 0, i);
        }
        for (let i = railCount - 1; i >= 0; i--) {
            uvs.push((loopCount - 1 - i) / loopCount, 0.5, 0);
            positions.push(-0.1, -0.3, i);
        }

        const center = loopCount;
        uvs.push(0.5, 0.5, 0);
        positions.push(-0.05, -0.15, (railCount - 1) * 0.5);
        const branchA = center + 1;
        const branchB = center + 2;
        uvs.push(0.01, 0.4, 0, 0.02, 0.4, 0);
        positions.push(-1, -1, -1, 1, -1, -1);

        const indices: number[] = [];
        for (let i = 0; i < loopCount; i++) {
            indices.push(center, i, (i + 1) % loopCount);
        }
        // This second boundary cycle shares vertex 0, making the component
        // branched and routing the long rail loop through the branched filler.
        indices.push(0, branchA, branchB);

        const uvArray = new Float32Array(uvs);
        const positionArray = new Float32Array(positions);
        const indexArray = new Uint32Array(indices);
        const result = fillBranchedBoundaryComponentsWithCenters(indexArray, uvArray, positionArray, 1e-4);
        const inserted = result.indices.slice(indexArray.length);
        const quality = triangleQualityDiagnostics({ vertices: result.positions, indices: inserted }, 8);
        const topology = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(2);
        expect(quality.maxAspect3D).toBeLessThan(20);
        expect(topology.nonManifoldEdges).toBe(0);
        expect(topology.orientationMismatches).toBe(0);
    });

    it('falls back to a center fan for a near-bowtie branched cycle from the live HarmonicRipple export', () => {
        // Exact positions captured from the residual len=32 branched cycle. Its
        // edges 12-13 and 15-16 pass within 0.000019mm and cross in every
        // orthogonal projection, so a simple-polygon ear clip is invalid. The
        // legacy cyclic ear clip nevertheless emitted a complete cap whose worst
        // triangle had aspect 672.46; the existing average-center fan is 45.44.
        const liveLoopPositions = [
            [51.916069, 0.167661, 88.883102], [51.935123, 0.147912, 89.044533],
            [51.952324, 0.130168, 89.189186], [51.958889, 0.123588, 89.244125],
            [51.974899, 0.107304, 89.377235], [51.991112, 0.090904, 89.511169],
            [51.997898, 0.084109, 89.567001], [52.007366, 0.074649, 89.644547],
            [52.017811, 0.064173, 89.729729], [52.027199, 0.054783, 89.805977],
            [52.047199, 0.035087, 89.967415], [52.068192, 0.014440, 90.135468],
            [52.148968, -0.214146, 90.261902], [52.228325, -0.427220, 90.423340],
            [52.243275, -0.427292, 90.584770], [52.166451, -0.224172, 90.423340],
            [52.213837, -0.427152, 90.261902], [52.202812, -0.427101, 90.135468],
            [52.188591, -0.427037, 89.967415], [52.175385, -0.426979, 89.805977],
            [52.169308, -0.426953, 89.729729], [52.162651, -0.426925, 89.644547],
            [52.156685, -0.426900, 89.567001], [52.152458, -0.426883, 89.511169],
            [52.142548, -0.426843, 89.377235], [52.132996, -0.426806, 89.244125],
            [52.129139, -0.426791, 89.189186], [52.119263, -0.426755, 89.044533],
            [52.108650, -0.426718, 88.883102], [52.098495, -0.426684, 88.721657],
            [52.094055, -0.426670, 88.648643], [51.897179, 0.187182, 88.721657],
        ];
        const loopCount = liveLoopPositions.length;
        const uvs: number[] = [];
        const positions: number[] = [];
        for (let i = 0; i < loopCount; i++) {
            uvs.push(i / loopCount, 0.5, 0);
            positions.push(...liveLoopPositions[i]);
        }

        const center = loopCount;
        const centerPosition = liveLoopPositions.reduce(
            (sum, point) => sum.map((value, axis) => value + point[axis]),
            [0, 0, 0],
        ).map((value) => value / loopCount);
        centerPosition[0] += 5;
        centerPosition[1] += 5;
        uvs.push(0.5, 0.4, 0);
        positions.push(...centerPosition);
        const branchA = center + 1;
        const branchB = center + 2;
        uvs.push(0.01, 0.4, 0, 0.02, 0.4, 0);
        positions.push(
            liveLoopPositions[0][0] - 1, liveLoopPositions[0][1] - 1, liveLoopPositions[0][2],
            liveLoopPositions[0][0] + 1, liveLoopPositions[0][1] - 1, liveLoopPositions[0][2],
        );

        const indices: number[] = [];
        for (let i = 0; i < loopCount; i++) {
            indices.push(center, i, (i + 1) % loopCount);
        }
        indices.push(0, branchA, branchB);

        const uvArray = new Float32Array(uvs);
        const positionArray = new Float32Array(positions);
        const indexArray = new Uint32Array(indices);
        const result = fillBranchedBoundaryComponentsWithCenters(indexArray, uvArray, positionArray, 1e-4);
        const inserted = result.indices.slice(indexArray.length);
        const quality = triangleQualityDiagnostics({ vertices: result.positions, indices: inserted }, 8);
        const topology = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(2);
        expect(result.insertedVertices).toBe(1);
        expect(quality.maxAspect3D).toBeLessThan(100);
        expect(topology.boundaryEdges).toBe(0);
        expect(topology.nonManifoldEdges).toBe(0);
        expect(topology.orientationMismatches).toBe(0);
    });

    it('is a no-op on a mesh with only simple (degree-2) boundary loops', () => {
        // A single lone quad: perimeter 0-1-2-3 is one simple closed loop with no
        // branch vertices, so the branched filler must leave it for the simple
        // fillers and report zero work.
        const uvs = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0,
        ]);
        const positions = uvs.slice();
        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
        ]);

        const result = fillBranchedBoundaryComponentsWithCenters(indices, uvs, positions);

        expect(result.filledLoops).toBe(0);
        expect(result.insertedVertices).toBe(0);
        expect(result.indices.length).toBe(indices.length);
    });

});

describe('fillCrossSurfaceConstantTBoundaryLoopsWithCenters', () => {
    it('closes a cross-surface constant-t seam loop with opposite boundary winding', () => {
        const uvs = new Float32Array([
            0.10, 1.0, 0,
            0.25, 1.0, 2,
            0.40, 1.0, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
        ]);

        const result = fillCrossSurfaceConstantTBoundaryLoopsWithCenters(indices, uvs, positions, 1e-4);
        const topo = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(1);
        expect(result.insertedTriangles).toBe(3);
        expect(topo.boundaryEdges).toBe(0);
        expect(topo.nonManifoldEdges).toBe(0);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('uses projected triangulation before a center fan for non-triangular seam loops', () => {
        const uvs = new Float32Array([
            0.00, 1.0, 0,
            0.25, 1.0, 2,
            0.26, 1.0, 0,
            0.50, 1.0, 2,
            0.75, 1.0, 0,
            0.00, 0.5, 0,
            0.25, 0.5, 0,
            0.26, 0.5, 0,
            0.50, 0.5, 0,
            0.75, 0.5, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1.2, 0.7, 0,
            0.5, 1.2, 0,
            -0.2, 0.7, 0,
            -0.7, -0.5, 0,
            1.5, -0.5, 0,
            1.8, 0.9, 0,
            0.5, 1.7, 0,
            -0.8, 0.9, 0,
        ]);
        const indices = new Uint32Array([
            0, 5, 6, 0, 6, 1,
            1, 6, 7, 1, 7, 2,
            2, 7, 8, 2, 8, 3,
            3, 8, 9, 3, 9, 4,
            4, 9, 5, 4, 5, 0,
        ]);

        const result = fillCrossSurfaceConstantTBoundaryLoopsWithCenters(indices, uvs, positions, 1e-4);
        const topo = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );
        const counts = edgeCounts(result.indices);

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(0);
        expect(result.insertedTriangles).toBe(3);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(1, 2))).toBe(2);
        expect(counts.get(key(2, 3))).toBe(2);
        expect(counts.get(key(3, 4))).toBe(2);
        expect(counts.get(key(4, 0))).toBe(2);
        expect(topo.nonManifoldEdges).toBe(0);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('falls back to the center fan when projected triangulation would create worse slivers', () => {
        const uvs = new Float32Array([
            0.00, 1.0, 0,
            0.25, 1.0, 2,
            0.26, 1.0, 0,
            0.50, 1.0, 2,
            0.75, 1.0, 0,
            0.00, 0.5, 0,
            0.25, 0.5, 0,
            0.26, 0.5, 0,
            0.50, 0.5, 0,
            0.75, 0.5, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 0.00001, 0,
            0.55, 0.00008, 0,
            0, 0.0001, 0,
            -0.5, -0.4, 0,
            1.5, -0.4, 0,
            1.5, 0.5, 0,
            0.55, 0.6, 0,
            -0.5, 0.5, 0,
        ]);
        const indices = new Uint32Array([
            0, 5, 6, 0, 6, 1,
            1, 6, 7, 1, 7, 2,
            2, 7, 8, 2, 8, 3,
            3, 8, 9, 3, 9, 4,
            4, 9, 5, 4, 5, 0,
        ]);

        const result = fillCrossSurfaceConstantTBoundaryLoopsWithCenters(indices, uvs, positions, 1e-4);

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(1);
        expect(result.insertedTriangles).toBe(4);
    });

    it('uses projected triangulation when it has lower aspect than the center fan', () => {
        const uvs = new Float32Array([
            0.00, 1.0, 0,
            0.25, 1.0, 2,
            0.50, 1.0, 0,
            0.75, 1.0, 2,
            0.90, 1.0, 0,
            0.00, 0.5, 0,
            0.25, 0.5, 0,
            0.50, 0.5, 0,
            0.75, 0.5, 0,
            0.90, 0.5, 0,
        ]);
        const positions = new Float32Array([
            0, -0.5, 0,
            3.4238076, -0.5, 0,
            3.4238076, 0, 0,
            2.6153409, 0, 0,
            0, 0, 0,
            -0.2, -0.5, 0,
            3.6, -0.5, 0,
            3.6, 0.5, 0,
            2.6, 0.5, 0,
            -0.2, 0.5, 0,
        ]);
        const indices = new Uint32Array([
            0, 5, 6, 0, 6, 1,
            1, 6, 7, 1, 7, 2,
            2, 7, 8, 2, 8, 3,
            3, 8, 9, 3, 9, 4,
            4, 9, 5, 4, 5, 0,
        ]);

        const result = fillCrossSurfaceConstantTBoundaryLoopsWithCenters(indices, uvs, positions, 1e-4);
        const topo = topologyDiagnostics(
            { vertices: result.positions, indices: result.indices, uvs: result.uvs },
            1e-4,
            8,
        );

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(0);
        expect(result.insertedTriangles).toBe(3);
        expect(topo.nonManifoldEdges).toBe(0);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('offsets an outer join center away from the rim line to avoid cap slivers', () => {
        const uvs = new Float32Array([
            0.000000, 0.0, 0,
            0.001854, 0.0, 0,
            0.000000, 0.0, 3,
            0.999675, 0.0, 3,
            0.998696, 0.0, 0,
            0.000000, 0.5, 0,
            0.001854, 0.5, 0,
            0.000000, 0.5, 0,
            0.999675, 0.5, 0,
            0.998696, 0.5, 0,
        ]);
        const positions = new Float32Array([
            45.0000, -0.0460, 0,
            44.9969, 0.5243, 0,
            45.0000, 0.0000, 0,
            44.9999, -0.0919, 0,
            44.9985, -0.3686, 0,
            44.8, -0.6, -0.5,
            44.8, 0.7, -0.5,
            44.7, 0.0, -0.5,
            44.7, -0.2, -0.5,
            44.8, -0.5, -0.5,
        ]);
        const indices = new Uint32Array([
            0, 5, 6, 0, 6, 1,
            1, 6, 7, 1, 7, 2,
            2, 7, 8, 2, 8, 3,
            3, 8, 9, 3, 9, 4,
            4, 9, 5, 4, 5, 0,
        ]);

        const result = fillCrossSurfaceConstantTBoundaryLoopsWithCenters(indices, uvs, positions, 1e-4);
        const inserted = result.indices.slice(indices.length);
        const quality = triangleQualityDiagnostics(
            { vertices: result.positions, indices: inserted },
            8,
        );

        expect(result.filledLoops).toBe(1);
        expect(result.insertedVertices).toBe(1);
        expect(result.insertedTriangles).toBe(5);
        expect(quality.maxAspect3D).toBeLessThan(50);
    });
});

describe('fillGeometricBoundaryLoops', () => {
    it('does not cap a cross-surface loop whose vertices all lie on the same t seam', () => {
        const uvs = new Float32Array([
            0.10, 1.0, 0,
            0.25, 1.0, 2,
            0.40, 1.0, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
        ]);

        const result = fillGeometricBoundaryLoops(indices, uvs, positions);

        expect(result.filledLoops).toBe(0);
        expect(result.attemptedLoops).toBe(0);
        expect(result.insertedTriangles).toBe(0);
        expect(result.indices.length).toBe(indices.length);
    });

    it('fills a closed mixed-surface loop in 3D projection', () => {
        const uvs = new Float32Array([
            0.1, 1.0, 0,
            0.2, 1.0, 0,
            0.2, 0.0, 2,
            0.1, 0.0, 2,
            0.0, 0.9, 0,
            0.3, 0.9, 0,
            0.3, 0.1, 2,
            0.0, 0.1, 2,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0,
            -1, -1, 0,
            2, -1, 0,
            2, 2, 0,
            -1, 2, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 5,
            0, 5, 4,
            1, 2, 6,
            1, 6, 5,
            2, 3, 7,
            2, 7, 6,
            3, 0, 4,
            3, 4, 7,
        ]);

        const result = fillGeometricBoundaryLoops(indices, uvs, positions);
        const counts = edgeCounts(result.indices);

        expect(result.filledLoops).toBe(2);
        expect(counts.get(key(0, 1))).toBe(2);
        expect(counts.get(key(1, 2))).toBe(2);
        expect(counts.get(key(2, 3))).toBe(2);
        expect(counts.get(key(3, 0))).toBe(2);
    });

    it('uses an alternate projected cap when the first diagonal would be non-manifold', () => {
        const uvs = new Float32Array([
            0.1, 0.1, 0,
            0.5, 0.1, 0,
            0.5, 0.5, 0,
            0.1, 0.5, 0,
            0.7, 0.1, 0,
            0.7, 0.5, 0,
            0.3, 0.7, 0,
            0.3, -0.1, 0,
        ]);
        const positions = new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0,
            2, 0, 0,
            2, 1, 0,
            0.5, 1.5, 0,
            0.5, -0.5, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 4,
            0, 4, 3,
            1, 2, 5,
            1, 5, 4,
            2, 3, 5,
            3, 4, 5,
            1, 3, 6,
            3, 1, 7,
            1, 6, 7,
            3, 7, 6,
        ]);

        const result = fillGeometricBoundaryLoops(indices, uvs, positions);
        const counts = edgeCounts(result.indices);

        expect(result.filledLoops).toBe(1);
        expect(result.indices.length).toBe(indices.length + 6);
        expect(counts.get(key(1, 3))).toBe(2);
        expect(counts.get(key(0, 2))).toBe(2);
    });

});

describe('shouldStopRepairPasses (convergence early-exit)', () => {
    // Each repair pass is O(triangles) and re-collects all boundary edges several
    // times (~35s/pass on a 1.6M-tri feature-dense mesh). The REAL GothicArches
    // trajectory, measured via the e2e WebGPU harness (per-pass mutation sums), was
    // pass0=110, pass1=13, pass2=5, pass3=6, pass4=5 — a gradual decay to a low
    // plateau, NOT a single collapse. The mesh has ~135K genuine boundary edges (the
    // open outer-wall rim/seam, closed later by the fill battery), so the repair can
    // only ever nibble a handful of T-junctions per pass; after pass0 every pass is
    // noise. The earlier relative-ratio criterion never fired (13 is not < 10% of
    // 110), so the loop ground on until the 200s deadline threw and the export was
    // null. The correct signal is an ABSOLUTE plateau floor: a pass that mutates
    // fewer than `floor` edges on a multi-hundred-thousand-boundary-edge mesh has
    // converged for practical purposes. `floor` is derived at the call site from the
    // first (most productive) pass, so it adapts per style.

    it('does not stop on the first pass (no previous pass to compare)', () => {
        expect(shouldStopRepairPasses(0, 110, 32)).toBe(false);
    });

    it('does not stop while a pass still does substantial work (>= floor)', () => {
        expect(shouldStopRepairPasses(110, 110, 32)).toBe(false); // 2nd productive pass
        expect(shouldStopRepairPasses(110, 80, 32)).toBe(false);  // still well above floor
        expect(shouldStopRepairPasses(110, 32, 32)).toBe(false);  // exactly at floor, not below
    });

    it('stops once a pass plateaus below the floor (measured GothicArches tail)', () => {
        expect(shouldStopRepairPasses(110, 13, 32)).toBe(true); // pass0->pass1: 13 < 32
        expect(shouldStopRepairPasses(13, 5, 32)).toBe(true);   // pass1->pass2: 5 < 32
    });

    it('does NOT stop here when the pass did zero work (the all-zero break handles that)', () => {
        // A zero-work pass must fall through to the loop's existing all-zero break,
        // not be swallowed by this early-exit, so callers can distinguish "converged
        // to fixpoint" from "plateaued". Tiny single-T-junction meshes (pass0=1,
        // pass1=0) rely on this so the floor guard never changes their outcome.
        expect(shouldStopRepairPasses(1, 0, 32)).toBe(false);
        expect(shouldStopRepairPasses(110, 0, 32)).toBe(false);
    });
});

describe('fillOuterWallSeamBoundaryChains incremental safe-add', () => {
    // Mismatched-density u-seam fixture. The high side (u=1.0) carries an EXTRA
    // mid-vertex (Hx) that the low side (u=0.0) lacks, so the t-merge zipper emits
    // three candidate triangles: two are CANONICALLY DEGENERATE (the seam endpoints
    // L0≡H0 and L1≡H1 share a 3D position) and only the middle one (L0,L1,Hx) is a
    // real, manifold-safe triangle that closes all three seam boundary edges at once.
    //
    // The OLD all-or-nothing gate (addTriangleEdgesIfManifoldSafe) returns false on
    // the FIRST degenerate candidate and discards the entire batch, falling back to a
    // vertex weld that SNAPS Hx away (insertedTriangles:0, feature-destroying). The
    // fix must commit the safe triangle incrementally and leave Hx referenced.
    //
    // Vertex layout (idx: uv[u,t,sid] / pos[x,y,z]):
    //   L0=0 (0.0,0.3,0)/(1,0.3,0)   L1=1 (0.0,0.7,0)/(1,0.7,0)
    //   M0=2 (0.5,0.3,0)/(-1,0.3,0)  M1=3 (0.5,0.7,0)/(-1,0.7,0)
    //   H0=4 (1.0,0.3,0)/(1,0.3,0)≡L0  Hx=5 (1.0,0.5,0)/(1,0.5,0) unique
    //   H1=6 (1.0,0.7,0)/(1,0.7,0)≡L1
    function buildSeamMismatchFixture(): { indices: Uint32Array; uvs: Float32Array; positions: Float32Array } {
        const uvs = new Float32Array([
            0.0, 0.3, 0,  // L0
            0.0, 0.7, 0,  // L1
            0.5, 0.3, 0,  // M0
            0.5, 0.7, 0,  // M1
            1.0, 0.3, 0,  // H0
            1.0, 0.5, 0,  // Hx
            1.0, 0.7, 0,  // H1
        ]);
        const positions = new Float32Array([
            1, 0.3, 0,   // L0
            1, 0.7, 0,   // L1
            -1, 0.3, 0,  // M0
            -1, 0.7, 0,  // M1
            1, 0.3, 0,   // H0 ≡ L0
            1, 0.5, 0,   // Hx (unique)
            1, 0.7, 0,   // H1 ≡ L1
        ]);
        const L0 = 0, L1 = 1, M0 = 2, M1 = 3, H0 = 4, Hx = 5, H1 = 6;
        const indices = new Uint32Array([
            // left strip (M column → low column)
            M0, M1, L1,
            M0, L1, L0,
            // right strip (M column → high column, with extra Hx splice)
            M0, H0, Hx,
            M0, Hx, M1,
            M1, Hx, H1,
        ]);
        return { indices, uvs, positions };
    }

    // Canonical (geometry-welded) seam boundary-edge count among outer-mid vertices.
    function seamBoundaryEdgeCount(indices: Uint32Array, uvs: Float32Array, positions: Float32Array, eps: number): number {
        const nV = Math.floor(uvs.length / 3);
        const canon = new Int32Array(nV);
        const keyToId = new Map<string, number>();
        let next = 0;
        for (let v = 0; v < nV; v++) {
            const k = `${Math.round(positions[v * 3] / eps)}:${Math.round(positions[v * 3 + 1] / eps)}:${Math.round(positions[v * 3 + 2] / eps)}`;
            let id = keyToId.get(k);
            if (id === undefined) { id = next++; keyToId.set(k, id); }
            canon[v] = id;
        }
        const counts = new Map<string, number>();
        for (let i = 0; i < indices.length; i += 3) {
            const a = canon[indices[i]], b = canon[indices[i + 1]], c = canon[indices[i + 2]];
            if (a === b || b === c || a === c) continue;
            for (const e of [key(a, b), key(b, c), key(c, a)]) counts.set(e, (counts.get(e) ?? 0) + 1);
        }
        let boundary = 0;
        for (const c of counts.values()) if (c === 1) boundary++;
        return boundary;
    }

    it('closes the seam with the one safe triangle instead of discarding the whole batch and welding', () => {
        const { indices, uvs, positions } = buildSeamMismatchFixture();
        const eps = 0.001;

        const before = seamBoundaryEdgeCount(indices, uvs, positions, eps);
        expect(before).toBe(3); // L0-L1 (low), H0-Hx and Hx-H1 (high)

        const res = fillOuterWallSeamBoundaryChains(indices, uvs, positions, eps);

        // The safe middle triangle (L0,L1,Hx) must be ADDED — not discarded for a weld.
        expect(res.insertedTriangles).toBeGreaterThan(0);
        expect(res.weldedVertices ?? 0).toBe(0);

        // Seam fully closed canonically.
        const after = seamBoundaryEdgeCount(res.indices, uvs, positions, eps);
        expect(after).toBe(0);

        // The unique high mid-vertex Hx (idx 5) must remain referenced (not welded away).
        expect(Array.from(res.indices)).toContain(5);
    });
});

describe('fillOuterWallSeamBoundaryChains winding consistency', () => {
    // Periodic θ-seam fixture (the proven orientation-defect source). An open
    // outer wall (sid=0) cut at the seam: a low column (u=0, θ=0), a mid column
    // (u=0.5, θ=π) and a high column (u=1, θ=2π) offset 0.3mm from the low column
    // (a real, non-weldable seam crack — the e2e seam probe measured median ~0.48mm
    // between the low/high seam vertices, so they are NOT coincident duplicates).
    //
    // The L-M and M-H wall cells are wound consistently (verified below: the wall
    // alone has 0 orientation mismatches). The seam cell H-L is left OPEN, so
    // L0-L1 (owned by the L-M cell, traversed L1→L0) and H0-H1 (owned by the M-H
    // cell, traversed H0→H1) are the seam boundary edges the seam filler closes.
    //
    // The bug: buildSeamZipperTriangles winds via emitTriCCW (UV-space cross sign).
    // At the seam the low side is u≈0 and the high side u≈1, so the UV triangle
    // spans the whole u-domain and its sign is unrelated to the true 3D winding —
    // ~half the seam triangles end up wound the SAME way as the wall across the
    // shared boundary edge, which is a genuine non-orientable flip. The fix winds
    // each seam triangle OPPOSITE to the wall triangle that owns the boundary edge
    // it covers (mirrors buildOwnerOpposedCenterFan), so the closed seam stays
    // consistently oriented without moving any vertex (no feature-destroying weld).
    function buildSeamWindingFixture(): { indices: Uint32Array; uvs: Float32Array; positions: Float32Array } {
        const uvs = new Float32Array([
            0.0, 0.4, 0,  // L0
            0.0, 0.6, 0,  // L1
            0.5, 0.4, 0,  // M0
            0.5, 0.6, 0,  // M1
            1.0, 0.4, 0,  // H0
            1.0, 0.6, 0,  // H1
        ]);
        const positions = new Float32Array([
            10, 0, 4,     // L0  (θ=0)
            10, 0, 6,     // L1
            -10, 0, 4,    // M0  (θ=π)
            -10, 0, 6,    // M1
            10, 0.3, 4,   // H0  (θ=2π, 0.3mm crack off L0 — not weldable)
            10, 0.3, 6,   // H1
        ]);
        const L0 = 0, L1 = 1, M0 = 2, M1 = 3, H0 = 4, H1 = 5;
        const indices = new Uint32Array([
            // L-M cell (owns low seam edge L0-L1, traversed L1→L0)
            L0, M0, M1,
            L0, M1, L1,
            // M-H cell (owns high seam edge H0-H1, traversed H0→H1)
            M0, H0, H1,
            M0, H1, M1,
        ]);
        return { indices, uvs, positions };
    }

    const WELD = 1e-4;

    it('the wall fixture alone is consistently wound (sanity: 0 orientation mismatches)', () => {
        const { indices, uvs, positions } = buildSeamWindingFixture();
        const topo = topologyDiagnostics({ vertices: positions, indices, uvs }, WELD);
        expect(topo.orientationMismatches).toBe(0);
        // The two seam edges are open before closure.
        expect(topo.boundaryEdges).toBeGreaterThan(0);
    });

    it('closes the seam WITHOUT introducing orientation mismatches', () => {
        const { indices, uvs, positions } = buildSeamWindingFixture();
        const res = fillOuterWallSeamBoundaryChains(indices, uvs, positions, WELD);

        // The seam must actually be closed by inserted triangles (not welded away,
        // which would snap the 0.3mm-offset feature vertices).
        expect(res.insertedTriangles).toBeGreaterThan(0);
        expect(res.weldedVertices ?? 0).toBe(0);

        // RED at HEAD: the UV-CCW zipper winds a seam triangle the same way as the
        // wall across edge L0-L1, producing a non-orientable flip. The owner-opposed
        // fix must keep the closed seam consistently wound.
        const topo = topologyDiagnostics({ vertices: positions, indices: res.indices, uvs }, WELD);
        expect(topo.orientationMismatches).toBe(0);
    });

    it('rejects a zipper that would join two components with incompatible boundary orientation', () => {
        const uvs = new Float32Array([
            0.0, 0.4, 0,  // L0
            0.0, 0.6, 0,  // L1
            0.2, 0.5, 0,  // LX
            1.0, 0.4, 0,  // H0
            1.0, 0.6, 0,  // H1
            0.8, 0.5, 0,  // HX
        ]);
        const positions = new Float32Array([
            10, 0.0, 4,
            10, 0.0, 6,
            8, 0.0, 5,
            10, 0.3, 4,
            10, 0.3, 6,
            8, 0.3, 5,
        ]);
        const L0 = 0, L1 = 1, LX = 2, H0 = 3, H1 = 4, HX = 5;
        const indices = new Uint32Array([
            // Both disconnected owners traverse their seam edge downward.
            // An orientable zipper strip requires opposite rail directions.
            L0, LX, L1,
            H0, HX, H1,
        ]);

        const before = topologyDiagnostics({ vertices: positions, indices, uvs }, WELD);
        expect(before.orientationMismatches).toBe(0);

        const res = fillOuterWallSeamBoundaryChains(indices, uvs, positions, WELD);

        expect(res.filledChains).toBe(0);
        expect(res.insertedTriangles).toBe(0);
        expect(res.unsafeChains).toBe(1);
        expect(Array.from(res.indices)).toEqual(Array.from(indices));
    });
});
