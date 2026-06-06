import { describe, expect, it } from 'vitest';
import { weldNearCoincidentVertices } from './NearCoincidentWeld';

describe('weldNearCoincidentVertices', () => {
    it('collapses a sub-tolerance needle triangle and welds its short edge', () => {
        // Verts 1 and 2 are 1e-5mm apart (below 1e-4 tol) → a needle triangle (0,1,2)
        // plus two real triangles using each. After weld, 1≡2: needle collapses (stripped),
        // the real triangles survive with the welded index.
        const positions = new Float32Array([
            0, 0, 0,        // 0
            3, 0, 0,        // 1
            3.00001, 0, 0,  // 2 ≡ 1 within 1e-4
            3, 3, 0,        // 3
        ]);
        const indices = new Uint32Array([
            0, 1, 2,   // needle (short edge 1-2)
            0, 1, 3,   // real
            0, 2, 3,   // real (becomes 0,1,3 after weld → duplicate but still valid tri)
        ]);
        const res = weldNearCoincidentVertices(indices, positions, 1e-4);
        expect(res.weldedVertices).toBe(1);       // vertex 2 → 1
        expect(res.strippedTriangles).toBe(1);    // the needle collapses
        expect(res.indices.length).toBe(6);       // 2 triangles remain
        // Needle's vertex 2 must no longer appear (welded to 1).
        expect(Array.from(res.indices)).not.toContain(2);
    });

    it('is a no-op when no vertices are within tolerance', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const indices = new Uint32Array([0, 1, 2]);
        const res = weldNearCoincidentVertices(indices, positions, 1e-4);
        expect(res.weldedVertices).toBe(0);
        expect(res.strippedTriangles).toBe(0);
        expect(res.indices).toBe(indices); // same reference (untouched)
    });

    it('tolerance <= 0 is a no-op', () => {
        const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
        const indices = new Uint32Array([0, 1, 0]);
        const res = weldNearCoincidentVertices(indices, positions, 0);
        expect(res.weldedVertices).toBe(0);
    });
});
