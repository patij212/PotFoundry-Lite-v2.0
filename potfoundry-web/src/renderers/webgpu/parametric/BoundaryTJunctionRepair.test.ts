import { describe, expect, it } from 'vitest';
import {
    fillGeometricBoundaryLoops,
    fillOuterWallBoundaryLoops,
    fillSameSurfaceBoundaryLoops,
    repairOuterWallTJunctions,
    repairSurfaceBoundaryTJunctions,
} from './BoundaryTJunctionRepair';

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
});

describe('fillGeometricBoundaryLoops', () => {
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
