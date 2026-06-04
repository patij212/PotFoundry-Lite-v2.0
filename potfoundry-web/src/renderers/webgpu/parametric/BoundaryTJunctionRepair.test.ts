import { describe, expect, it } from 'vitest';
import {
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
} from './BoundaryTJunctionRepair';
import { topologyDiagnostics } from '../../../fidelity/metrics';

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

describe('fillSameSurfaceBoundaryLoopsWithCenters', () => {
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
