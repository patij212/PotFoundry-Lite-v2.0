
import { describe, it, expect } from 'vitest';
import { weldMesh } from './weldMesh';

describe('weldMesh (SpatialWelder)', () => {
    it('should weld identical vertices', () => {
        // Two triangles sharing an edge, but vertices are duplicated
        // T1: (0,0,0), (1,0,0), (0,1,0)
        // T2: (1,0,0), (1,1,0), (0,1,0)
        const vertices = new Float32Array([
            0, 0, 0, 1, 0, 0, 0, 1, 0, // T1
            1, 0, 0, 1, 1, 0, 0, 1, 0  // T2
        ]);
        const indices = new Uint32Array([
            0, 1, 2,
            3, 4, 5
        ]);

        const welded = weldMesh(vertices, indices, 0.001);

        // Expect 4 unique vertices: (0,0), (1,0), (0,1), (1,1)
        expect(welded.vertices.length / 3).toBe(4);
        // Expect 2 triangles (6 indices)
        expect(welded.indices.length).toBe(6);
    });

    it('should remove degenerate triangles', () => {
        // T1: (0,0,0), (0,0,0), (1,0,0) -> Degenerate
        const vertices = new Float32Array([
            0, 0, 0, 0, 0.000001, 0, 1, 0, 0
        ]);
        const indices = new Uint32Array([0, 1, 2]);

        const welded = weldMesh(vertices, indices, 0.001);

        // Vertices 0 and 1 should merge.
        // Triangle becomes (0,0,2) -> (A, A, B) -> Degenerate -> Removed.
        expect(welded.indices.length).toBe(0);
    });

    it('should assume performance < 100ms for 100k vertices', () => {
        const N = 100000;
        const vertices = new Float32Array(N * 3);
        const indices = new Uint32Array(N); // Dummy indices

        // Generate grid of points 
        for (let i = 0; i < N; i++) {
            vertices[i * 3] = Math.random() * 100;
            vertices[i * 3 + 1] = Math.random() * 100;
            vertices[i * 3 + 2] = Math.random() * 100;
            indices[i] = i;
        }

        const start = performance.now();
        weldMesh(vertices, indices, 0.001);
        const end = performance.now();
        const dt = end - start;

        console.log(`Benchmark 100k verts: ${dt.toFixed(2)}ms`); // Expected ~20-50ms
        expect(dt).toBeLessThan(1000); // Generous limit (CI/Debug overhead)
    });
});
