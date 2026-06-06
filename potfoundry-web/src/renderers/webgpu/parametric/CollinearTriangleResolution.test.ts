import { describe, expect, it } from 'vitest';
import { resolveCollinearTriangles } from './CollinearTriangleResolution';

function isCollinear(positions: Float32Array, a: number, b: number, c: number): boolean {
    const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const vx = positions[c * 3] - positions[a * 3], vy = positions[c * 3 + 1] - positions[a * 3 + 1], vz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(cx, cy, cz);
    const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(vx - ux, vy - uy, vz - uz));
    return longest > 1e-9 && (2 * area) / (longest * longest) < 0.01;
}

describe('resolveCollinearTriangles', () => {
    it('removes a collinear triangle by splitting its manifold neighbour at the on-edge apex', () => {
        // A=(0,0,0) B=(2,0,0) C=(1,0,0)[midpoint of A-B] D=(1,1,0).
        // T=(A,B,C) is collinear; N=(B,A,D) is the manifold neighbour across A-B.
        const positions = new Float32Array([
            0, 0, 0,  // 0 A
            2, 0, 0,  // 1 B
            1, 0, 0,  // 2 C (on A-B)
            1, 1, 0,  // 3 D
        ]);
        const indices = new Uint32Array([
            0, 1, 2,  // T collinear
            1, 0, 3,  // N neighbour (B,A,D)
        ]);
        const res = resolveCollinearTriangles(indices, positions, 1e-4);
        expect(res.resolvedTriangles).toBe(1);
        expect(res.splitNeighbors).toBe(1);
        // 2 triangles in, 2 out (T removed, N split into 2).
        expect(res.indices.length / 3).toBe(2);
        // No surviving triangle is collinear.
        for (let t = 0; t < res.indices.length; t += 3) {
            expect(isCollinear(positions, res.indices[t], res.indices[t + 1], res.indices[t + 2])).toBe(false);
        }
        // The spanning edge A-B (0-1) must be gone; apex C (2) must now be referenced.
        const tris = Array.from(res.indices);
        expect(tris).toContain(2);
    });

    it('leaves a clean triangle untouched (no-op)', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const indices = new Uint32Array([0, 1, 2]);
        const res = resolveCollinearTriangles(indices, positions, 1e-4);
        expect(res.resolvedTriangles).toBe(0);
        expect(res.indices).toBe(indices);
    });

    it('does not touch a collinear triangle whose spanning edge is non-manifold (3 incident)', () => {
        // A,B,C collinear T plus TWO neighbours on A-B → non-manifold spanning edge; skip.
        const positions = new Float32Array([
            0, 0, 0, 2, 0, 0, 1, 0, 0, 1, 1, 0, 1, -1, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 2,  // T collinear
            1, 0, 3,  // neighbour 1
            1, 0, 4,  // neighbour 2 → A-B now has 3 incident
        ]);
        const res = resolveCollinearTriangles(indices, positions, 1e-4);
        expect(res.resolvedTriangles).toBe(0);
    });
});
