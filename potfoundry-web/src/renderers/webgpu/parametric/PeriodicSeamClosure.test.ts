import { describe, it, expect } from 'vitest';
import { buildPeriodicSeamClosure } from './PeriodicSeamClosure';

/**
 * Build an OPEN cylinder strip: numU columns × numRows rows, half-open in u
 * (col 0 at u=0, last col at u≈0.997). Standard cells connect col c→c+1 for
 * c ∈ [0, numU-2]; the wrap cell (last col → col 0) is NEVER emitted, leaving an
 * open vertical seam. Returns { vertices:[u,t,sid], indices }.
 */
function buildOpenCylinder(
    numU: number,
    rowTs: number[],
    extraHighVerts: Array<{ t: number }> = [],
): { vertices: Float32Array; indices: Uint32Array } {
    const numRows = rowTs.length;
    const us: number[] = [];
    for (let c = 0; c < numU; c++) {
        us.push(c === numU - 1 ? 0.997 : c / (numU - 1) * 0.997);
    }
    const verts: number[] = [];
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numU; c++) {
            verts.push(us[c], rowTs[r], 0);
        }
    }
    const idx = (r: number, c: number) => r * numU + c;
    const indices: number[] = [];
    for (let r = 0; r < numRows - 1; r++) {
        for (let c = 0; c < numU - 1; c++) {
            const bl = idx(r, c), br = idx(r, c + 1), tl = idx(r + 1, c), tr = idx(r + 1, c + 1);
            // emit two CCW tris (matching emitStandardCell push order)
            indices.push(bl, br, tr);
            indices.push(bl, tr, tl);
        }
    }
    // Optional extra high-side verts (simulate a chain vert on the seam) — appended
    // as boundary verts spliced into the high column edge to create a density mismatch.
    const vertices = new Float32Array(verts.length + extraHighVerts.length * 3);
    vertices.set(verts);
    let w = verts.length;
    for (const ev of extraHighVerts) {
        vertices[w++] = 0.997; vertices[w++] = ev.t; vertices[w++] = 0;
    }
    return { vertices, indices: new Uint32Array(indices) };
}

/** Count edges by incidence across a triangle list. */
function edgeIncidence(indices: ArrayLike<number>, nV: number): Map<number, number> {
    const stride = nV + 1;
    const inc = new Map<number, number>();
    const key = (a: number, b: number) => (a < b ? a * stride + b : b * stride + a);
    for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        if (a === b || b === c || a === c) continue;
        for (const [x, y] of [[a, b], [b, c], [a, c]] as const) {
            inc.set(key(x, y), (inc.get(key(x, y)) ?? 0) + 1);
        }
    }
    return inc;
}

/** Count seam boundary edges (incidence 1, both endpoints low or both high). */
function seamBoundaryEdges(
    indices: ArrayLike<number>,
    vertices: ArrayLike<number>,
): { low: number; high: number } {
    const nV = Math.floor(vertices.length / 3);
    const stride = nV + 1;
    const inc = edgeIncidence(indices, nV);
    let low = 0, high = 0;
    for (const [k, c] of inc) {
        if (c !== 1) continue;
        const a = Math.floor(k / stride), b = k % stride;
        const uA = vertices[a * 3], uB = vertices[b * 3];
        if (uA <= 0.01 && uB <= 0.01) low++;
        else if (uA >= 0.99 && uB >= 0.99) high++;
    }
    return { low, high };
}

/** Count non-manifold edges (incidence > 2). */
function nonManifoldEdges(indices: ArrayLike<number>, nV: number): number {
    let n = 0;
    for (const c of edgeIncidence(indices, nV).values()) if (c > 2) n++;
    return n;
}

function concat(a: Uint32Array, b: number[]): Uint32Array {
    const out = new Uint32Array(a.length + b.length);
    out.set(a); out.set(b, a.length);
    return out;
}

describe('buildPeriodicSeamClosure', () => {
    it('closes a clean t-aligned open cylinder seam with zero non-manifold edges', () => {
        const { vertices, indices } = buildOpenCylinder(3, [0, 0.5, 1.0]);
        const before = seamBoundaryEdges(indices, vertices);
        expect(before.low).toBeGreaterThan(0);
        expect(before.high).toBeGreaterThan(0);

        const res = buildPeriodicSeamClosure(indices, vertices);
        const merged = concat(indices, res.triangles);

        const after = seamBoundaryEdges(merged, vertices);
        const nV = Math.floor(vertices.length / 3);

        // Seam fully closed.
        expect(after.low).toBe(0);
        expect(after.high).toBe(0);
        // Never created a non-manifold edge.
        expect(nonManifoldEdges(merged, nV)).toBe(0);
        // It only ADDED triangles.
        expect(res.triangles.length).toBeGreaterThan(0);
    });

    it('never creates a non-manifold edge even with a density mismatch on the seam', () => {
        // High side gets the same row ts; low side identical — but add an EXTRA high
        // seam vertex/edge to force a count mismatch (chain-vert density mismatch).
        const numU = 3;
        const rowTs = [0, 0.33, 0.66, 1.0];
        const built = buildOpenCylinder(numU, rowTs);
        // Splice an extra high vertex at t=0.5 into the high column edge between row1,row2.
        const nVold = Math.floor(built.vertices.length / 3);
        const verts = Array.from(built.vertices);
        verts.push(0.997, 0.5, 0); // new high vert index nVold
        const newHigh = nVold;
        const vertices = new Float32Array(verts);
        // Replace the high column edge (row1High -> row2High) with two edges via newHigh,
        // by retriangulating the rightmost cell of band1 to include newHigh.
        const idx = (r: number, c: number) => r * numU + c;
        const indices = Array.from(built.indices);
        // band1 rightmost cell verts: bl=idx(1,1) br=idx(1,2) tl=idx(2,1) tr=idx(2,2)
        // original tris: (bl,br,tr),(bl,tr,tl). Insert newHigh on br->tr edge:
        // remove (bl,br,tr) -> (bl,br,newHigh),(bl,newHigh,tr)
        const bl = idx(1, 1), br = idx(1, 2), tr = idx(2, 2);
        // find and remove the original (bl,br,tr) tri
        for (let i = 0; i + 2 < indices.length; i += 3) {
            if (indices[i] === bl && indices[i + 1] === br && indices[i + 2] === tr) {
                indices.splice(i, 3);
                break;
            }
        }
        indices.push(bl, br, newHigh);
        indices.push(bl, newHigh, tr);
        const idxArr = new Uint32Array(indices);

        const nV = Math.floor(vertices.length / 3);
        const before = seamBoundaryEdges(idxArr, vertices);
        expect(before.low + before.high).toBeGreaterThan(0);

        const res = buildPeriodicSeamClosure(idxArr, vertices);
        const merged = concat(idxArr, res.triangles);

        // The invariant that MUST hold: never regress to non-manifold.
        expect(nonManifoldEdges(merged, nV)).toBe(0);
        // And it must not INCREASE total seam boundary edges.
        const after = seamBoundaryEdges(merged, vertices);
        expect(after.low + after.high).toBeLessThanOrEqual(before.low + before.high);
    });

    it('does not close same-t cap or rim edges as if they were vertical seam rails', () => {
        const vertices = new Float32Array([
            0.000, 1.0, 0,
            0.005, 1.0, 0,
            0.997, 0.0, 0,
            0.999, 0.0, 0,
            0.050, 0.8, 0,
            0.950, 0.2, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 4, // low-side horizontal boundary edge at t=1
            2, 3, 5, // high-side horizontal boundary edge at t=0
        ]);

        const res = buildPeriodicSeamClosure(indices, vertices);

        expect(res.lowSeamEdges).toBe(0);
        expect(res.highSeamEdges).toBe(0);
        expect(res.triangles).toHaveLength(0);
    });

    it('does not bridge a seam rail edge to an apex across a disconnected T gap', () => {
        const vertices = new Float32Array([
            0.000, 0.50, 0,
            0.000, 0.51, 0,
            0.997, 0.00, 0,
            0.997, 0.10, 0,
            0.500, 0.505, 0,
            0.500, 0.050, 0,
        ]);
        const indices = new Uint32Array([
            0, 1, 4,
            2, 5, 3,
        ]);

        const res = buildPeriodicSeamClosure(indices, vertices);

        // Both rail edges are real seam boundaries, but they belong to separate
        // T ranges. A zipper triangle would be an extreme sliver spanning the gap.
        expect(res.lowSeamEdges).toBe(1);
        expect(res.highSeamEdges).toBe(1);
        expect(res.triangles).toHaveLength(0);
        expect(res.skippedUnsafe).toBeGreaterThan(0);
    });

    it('gates on CANONICAL (welded) topology: stray u=1.0 verts coincident with col-0 never create a welded non-manifold edge', () => {
        // Reproduces the real export failure: the periodic cylinder has u=0 and u=1.0 at
        // the SAME 3D point, and an earlier tail pass left stray u=1.0 verts that are
        // canonically identical to col-0 (u=0). A raw-incidence closure zippers those as
        // opposite rails and pushes a welded edge past 2 incidences. The canonical gate
        // (positions + tolerance) must prevent that.
        const numU = 4;
        const rowTs = [0, 0.33, 0.66, 1.0];
        const built = buildOpenCylinder(numU, rowTs);
        const us: number[] = [];
        for (let c = 0; c < numU; c++) us.push(c === numU - 1 ? 0.997 : (c / (numU - 1)) * 0.997);

        // 3D position from (u,t): theta = u * 2π on a unit cylinder, height = t. u=1.0 maps
        // to the SAME (x,y) as u=0 → they weld to one canonical id.
        const posFromUT = (u: number, t: number): [number, number, number] => {
            const theta = u * 2 * Math.PI;
            return [Math.cos(theta), Math.sin(theta), t];
        };
        const rawVerts = Array.from(built.vertices);
        const indices = Array.from(built.indices);

        // Append stray u=1.0 verts at each row — coincident with that row's col-0 (u=0).
        // Wire each into a tiny boundary edge so it appears on the high-side seam set.
        const strayBase = rawVerts.length / 3;
        for (let r = 0; r < rowTs.length; r++) {
            rawVerts.push(1.0, rowTs[r], 0);
        }
        // Connect stray row r..r+1 to the last real column to make high-side boundary edges.
        const lastCol = (r: number) => r * numU + (numU - 1);
        for (let r = 0; r < rowTs.length - 1; r++) {
            indices.push(lastCol(r), strayBase + r, strayBase + r + 1);
        }
        const vertices = new Float32Array(rawVerts);
        const idxArr = new Uint32Array(indices);
        const nVraw = vertices.length / 3;

        // Build 3D positions (welds u=0 and u=1.0).
        const positions = new Float32Array(nVraw * 3);
        for (let v = 0; v < nVraw; v++) {
            const p = posFromUT(vertices[v * 3], vertices[v * 3 + 1]);
            positions[v * 3] = p[0]; positions[v * 3 + 1] = p[1]; positions[v * 3 + 2] = p[2];
        }

        // Canonical id by position quantization (same scheme as the closure / validator).
        const tol = 1e-4;
        const inv = 1 / tol;
        const canonMap = new Map<string, number>();
        const cid = new Int32Array(nVraw);
        let next = 0;
        for (let v = 0; v < nVraw; v++) {
            const k = `${Math.round(positions[v * 3] * inv)}:${Math.round(positions[v * 3 + 1] * inv)}:${Math.round(positions[v * 3 + 2] * inv)}`;
            let id = canonMap.get(k);
            if (id === undefined) { id = next++; canonMap.set(k, id); }
            cid[v] = id;
        }
        const canonNonManifold = (idx: ArrayLike<number>): number => {
            const inc = new Map<number, number>();
            const s = next + 1;
            const key = (a: number, b: number) => (a < b ? a * s + b : b * s + a);
            for (let i = 0; i + 2 < idx.length; i += 3) {
                const a = cid[idx[i]], b = cid[idx[i + 1]], c = cid[idx[i + 2]];
                if (a === b || b === c || a === c) continue;
                for (const [x, y] of [[a, b], [b, c], [a, c]] as const) {
                    inc.set(key(x, y), (inc.get(key(x, y)) ?? 0) + 1);
                }
            }
            let nm = 0;
            for (const c of inc.values()) if (c > 2) nm++;
            return nm;
        };

        const beforeNM = canonNonManifold(idxArr);
        const res = buildPeriodicSeamClosure(idxArr, vertices, { positions, weldToleranceMm: tol });
        const merged = concat(idxArr, res.triangles);
        const afterNM = canonNonManifold(merged);

        // The invariant: the closure must NEVER increase canonical non-manifold edges.
        expect(afterNM).toBeLessThanOrEqual(beforeNM);
    });

    it('returns empty when there is no seam (closed mesh)', () => {
        // A single interior quad with no low/high boundary at all.
        const vertices = new Float32Array([
            0.40, 0.0, 0, 0.60, 0.0, 0,
            0.40, 1.0, 0, 0.60, 1.0, 0,
        ]);
        const indices = new Uint32Array([0, 1, 3, 0, 3, 2]);
        const res = buildPeriodicSeamClosure(indices, vertices);
        expect(res.triangles.length).toBe(0);
        expect(res.lowSeamEdges).toBe(0);
        expect(res.highSeamEdges).toBe(0);
    });

    it('emits closure triangles with consistent (positive unwrapped-u) winding', () => {
        const { vertices, indices } = buildOpenCylinder(3, [0, 0.5, 1.0]);
        const res = buildPeriodicSeamClosure(indices, vertices);
        const unwrappedU = (v: number) => (vertices[v * 3] < 0.5 ? vertices[v * 3] + 1 : vertices[v * 3]);
        for (let i = 0; i + 2 < res.triangles.length; i += 3) {
            const a = res.triangles[i], b = res.triangles[i + 1], c = res.triangles[i + 2];
            const uA = unwrappedU(a), tA = vertices[a * 3 + 1];
            const uB = unwrappedU(b), tB = vertices[b * 3 + 1];
            const uC = unwrappedU(c), tC = vertices[c * 3 + 1];
            const cross = (uB - uA) * (tC - tA) - (uC - uA) * (tB - tA);
            expect(cross).toBeGreaterThan(0);
        }
    });
});
