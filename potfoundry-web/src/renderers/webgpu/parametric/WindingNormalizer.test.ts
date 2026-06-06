import { describe, it, expect } from 'vitest';
import { normalizeWindingByComponent } from './WindingNormalizer';
import { topologyDiagnostics } from '../../../fidelity/metrics';

/**
 * Count winding-inconsistent edges exactly as MeshValidator.checkNormals does:
 * a manifold edge (exactly 2 incident triangles) whose two owning triangles
 * traverse it in the SAME combinatorial direction is a genuine winding flip.
 */
function countWindingInconsistent(indices: ArrayLike<number>, idxCount: number): number {
    const STRIDE = 0x4000000;
    const dirMap = new Map<number, number[]>();
    for (let t = 0; t + 2 < idxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;
        for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as Array<[number, number]>) {
            const lo = a < b ? a : b, hi = a < b ? b : a;
            const key = lo * STRIDE + hi;
            const dir = a < b ? 1 : -1;
            const arr = dirMap.get(key);
            if (arr) arr.push(dir); else dirMap.set(key, [dir]);
        }
    }
    let inconsistent = 0;
    for (const dirs of dirMap.values()) {
        if (dirs.length !== 2) continue;
        if (dirs[0] === dirs[1]) inconsistent++;
    }
    return inconsistent;
}

describe('normalizeWindingByComponent', () => {
    it('drives a single flipped triangle to winding-consistent', () => {
        // Quad split into two tris sharing edge (1,2). Triangle B is mis-wound:
        // it traverses edge (1,2) in the SAME direction as A → 1 inconsistent edge.
        const indices = new Uint32Array([
            0, 1, 2,   // A: edge (1,2) dir +1
            1, 2, 3,   // B (flipped): edge (1,2) dir +1  → inconsistent
        ]);
        expect(countWindingInconsistent(indices, indices.length)).toBe(1);

        const result = normalizeWindingByComponent(indices, indices.length);
        expect(countWindingInconsistent(result.indices, result.indices.length)).toBe(0);
        // Same vertex set, same triangle count — only winding reordered.
        expect(result.indices.length).toBe(indices.length);
    });

    it('preserves the majority orientation, flipping only the minority bad fills', () => {
        // Build a fan of 4 correctly-wound triangles around a strip, then append
        // ONE flipped triangle. The normalizer must flip only the 1 bad triangle,
        // not invert the 4-triangle majority.
        // Strip vertices: bottom 0,1,2 ; top 3,4,5 (u increasing left→right).
        // Correctly-wound CCW triangles:
        const good: number[] = [
            0, 1, 3,   // edge(0,1)+ ...
            1, 4, 3,
            1, 2, 4,
            2, 5, 4,
        ];
        // One flipped fill sharing edge (2,5) with tri (2,5,4): traverse (2,5) same dir.
        // tri (2,5,4): edge (2,5) dir +1. Flipped fill (2,5,6) also dir +1 → inconsistent.
        const flipped: number[] = [2, 5, 6];
        const indices = new Uint32Array([...good, ...flipped]);

        const before = countWindingInconsistent(indices, indices.length);
        expect(before).toBeGreaterThanOrEqual(1);

        const result = normalizeWindingByComponent(indices, indices.length);
        expect(countWindingInconsistent(result.indices, result.indices.length)).toBe(0);

        // Majority (the 4 good tris) must keep original orientation; only the
        // single bad fill flips. So exactly 1 triangle differs from input.
        let differing = 0;
        for (let t = 0; t < indices.length; t += 3) {
            const a0 = indices[t], b0 = indices[t + 1], c0 = indices[t + 2];
            const a1 = result.indices[t], b1 = result.indices[t + 1], c1 = result.indices[t + 2];
            if (a0 !== a1 || b0 !== b1 || c0 !== c1) differing++;
        }
        expect(differing).toBe(1);
        expect(result.flipped).toBe(1);
    });

    it('treats disconnected components independently (inner vs outer wall)', () => {
        // Component 1: outer wall pair (consistent). Component 2: inner wall pair
        // intentionally inverted relative to outer — but internally consistent.
        // Neither shares a raw edge with the other, so both must remain unflipped.
        const indices = new Uint32Array([
            // Component 1 (verts 0..3) — consistent
            0, 1, 2,
            1, 3, 2,
            // Component 2 (verts 10..13) — consistent, opposite global handedness
            10, 12, 11,
            11, 12, 13,
        ]);
        expect(countWindingInconsistent(indices, indices.length)).toBe(0);
        const result = normalizeWindingByComponent(indices, indices.length);
        expect(countWindingInconsistent(result.indices, result.indices.length)).toBe(0);
        expect(result.flipped).toBe(0);
    });

    it('is a no-op on an already consistent mesh', () => {
        const indices = new Uint32Array([
            0, 1, 2,
            1, 3, 2,
        ]);
        expect(countWindingInconsistent(indices, indices.length)).toBe(0);
        const result = normalizeWindingByComponent(indices, indices.length);
        expect(result.flipped).toBe(0);
        expect(Array.from(result.indices)).toEqual(Array.from(indices));
    });

    it('can normalize edges that are shared only after position welding', () => {
        // Two coincident triangles use distinct raw vertex ids, so a raw-edge
        // adjacency graph sees two disconnected components. Fidelity topology
        // welds the positions first and correctly reports three same-direction
        // shared edges. Canonical graph mode must see and fix that.
        const positions = new Float32Array([
            0, 0, 0,        // A0
            0, 0.00001, 0,  // A1
            1, 0, 0,        // B0
            1, 0.00001, 0,  // B1
            0, 1, 0,        // C0
            0, 1.00001, 0,  // C1
        ]);
        const indices = new Uint32Array([
            0, 2, 4,
            1, 3, 5,
        ]);
        expect(topologyDiagnostics({ vertices: positions, indices }, 1e-4, 0).orientationMismatches).toBe(3);

        const raw = normalizeWindingByComponent(indices, indices.length);
        expect(raw.flipped).toBe(0);
        expect(topologyDiagnostics({ vertices: positions, indices: raw.indices }, 1e-4, 0).orientationMismatches).toBe(3);

        const canonical = normalizeWindingByComponent(indices, indices.length, positions, 1e-4);
        expect(canonical.flipped).toBe(1);
        expect(topologyDiagnostics({ vertices: positions, indices: canonical.indices }, 1e-4, 0).orientationMismatches).toBe(0);
    });

    it('reports sample edges for non-orientable parity conflicts', () => {
        // A triangulated Mobius strip is locally manifold, but no global winding
        // assignment can satisfy every shared edge. This is the synthetic shape
        // of the residual Fourier patches: normalizing flips what it can, then
        // must report the exact contradictory adjacency for source repair.
        const indices = new Uint32Array([
            0, 2, 1,
            2, 3, 1,
            2, 4, 3,
            4, 5, 3,
            4, 1, 5,
            1, 0, 5,
        ]);

        const result = normalizeWindingByComponent(indices, indices.length);

        expect(result.conflicts).toBeGreaterThan(0);
        expect(result.conflictSamples?.length ?? 0).toBeGreaterThan(0);
        expect(result.conflictSamples?.[0]).toMatchObject({
            edge: [2, 3],
            fromTriangle: expect.any(Number),
            toTriangle: expect.any(Number),
        });
    });
});
