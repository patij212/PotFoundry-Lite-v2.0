/**
 * PeriodicSeamClosure — closes the open u-seam of the outer-wall base mesh.
 *
 * The adaptive grid is HALF-OPEN in u: column 0 sits at u=0 and the last column
 * sits at u≈0.997 (never u=1.0). The wrap cell (last col → col 0) is never emitted,
 * so the cylinder is left open along a vertical seam. The low side (u≈0: grid col-0
 * plus u≈0 chain verts) and the high side (u≈0.997: last col plus chain verts) each
 * form a union of SIMPLE boundary paths (measured deg ≤ 2, no branching) that mostly
 * share t-rows (col-0 and col-last share grid rows; chain t-crossings mostly mirror).
 *
 * ── CANONICAL (position-welded) SAFETY ──
 * The export validator (MeshValidator) judges boundary / non-manifold edges on the
 * POSITION-WELDED canonical mesh, not on raw parametric vertex indices. On a periodic
 * cylinder u=0 and u=1.0 are the SAME 3D point, and earlier tail passes can leave stray
 * u=1.0 verts that are canonically identical to col-0 (u=0). A closure that gates
 * manifold-safety on RAW incidence is therefore unsafe: it can zipper across a
 * canonically-zero-width gap and push a welded edge past two incidences (measured: a raw
 * tail closure added +96 non-manifold edges). This pass takes the 3D positions and a weld
 * tolerance, builds the SAME canonical vertex identity the validator uses, and gates every
 * candidate triangle against CANONICAL edge incidence. That makes it provably
 * non-regressive on the welded topology: it can only ADD triangles that close a real
 * canonical seam boundary edge and can NEVER create a canonical non-manifold edge.
 *
 * When positions/tolerance are omitted the canonical map is the identity (raw == welded),
 * preserving the original UV-only behaviour for synthetic unit fixtures.
 *
 * Operates on the parametric vertex buffer where each vertex is [u, t, surfaceId].
 */

export interface PeriodicSeamClosureOptions {
    /** Max u for a vertex to count as "low side" (near u=0). Default 0.01. */
    readonly uLowMax?: number;
    /** Min u for a vertex to count as "high side" (near u=1). Default 0.99. */
    readonly uHighMin?: number;
    /** 3D position buffer [x,y,z] per raw vertex — enables canonical (welded) gating. */
    readonly positions?: ArrayLike<number>;
    /** Position weld tolerance (mm). Two verts within this snap to one canonical id. */
    readonly weldToleranceMm?: number;
}

export interface PeriodicSeamClosureResult {
    /** Flat triangle index list to append to the mesh (length = 3 * triangleCount). */
    readonly triangles: number[];
    /** Existing low-side seam boundary edges that were closed by a triangle. */
    readonly closedLowEdges: number;
    /** Existing high-side seam boundary edges that were closed by a triangle. */
    readonly closedHighEdges: number;
    /** Candidate triangles rejected by the manifold-safety gate. */
    readonly skippedUnsafe: number;
    /** Low-side seam boundary edges found before closure. */
    readonly lowSeamEdges: number;
    /** High-side seam boundary edges found before closure. */
    readonly highSeamEdges: number;
}

const MIN_SEAM_EDGE_T_SPAN = 1e-6;

/** Undirected edge key from two vertex indices (caller guarantees a !== b). */
function edgeKey(a: number, b: number, stride: number): number {
    return a < b ? a * stride + b : b * stride + a;
}

/**
 * Build the seam-closure triangles for a half-open outer wall.
 *
 * @param indices   Existing mesh triangle indices (read-only).
 * @param vertices  Parametric vertex buffer [u, t, surfaceId] per vertex.
 * @param options   Bucket thresholds and (optionally) 3D positions + weld tolerance
 *                  for canonical-topology gating. Without positions the map is identity.
 */
export function buildPeriodicSeamClosure(
    indices: ArrayLike<number>,
    vertices: ArrayLike<number>,
    options?: PeriodicSeamClosureOptions,
): PeriodicSeamClosureResult {
    const uLowMax = options?.uLowMax ?? 0.01;
    const uHighMin = options?.uHighMin ?? 0.99;
    const nV = Math.floor(vertices.length / 3);
    const stride = nV + 1; // key stride so a*stride+b is unique for a,b < nV

    // ── 0. Canonical (position-welded) vertex identity ──────────────────────
    // cid[v] = welded id of raw vertex v. With positions+tolerance this matches the
    // validator's weld; otherwise identity. reprRaw[c] = a representative raw vertex
    // for canonical id c (used for u/t lookup and emitted triangle indices — all raw
    // verts of a canonical id are coincident, so any representative is exact).
    const positions = options?.positions;
    const weldTol = options?.weldToleranceMm ?? 0;
    const cid = new Int32Array(nV);
    if (positions !== undefined && weldTol > 0 && positions.length >= nV * 3) {
        const inv = 1 / weldTol;
        const canonMap = new Map<string, number>();
        let next = 0;
        for (let v = 0; v < nV; v++) {
            const k =
                `${Math.round(positions[v * 3] * inv)}:` +
                `${Math.round(positions[v * 3 + 1] * inv)}:` +
                `${Math.round(positions[v * 3 + 2] * inv)}`;
            let id = canonMap.get(k);
            if (id === undefined) { id = next++; canonMap.set(k, id); }
            cid[v] = id;
        }
    } else {
        for (let v = 0; v < nV; v++) cid[v] = v;
    }
    const reprRaw = new Map<number, number>();
    for (let v = 0; v < nV; v++) {
        if (!reprRaw.has(cid[v])) reprRaw.set(cid[v], v);
    }

    // ── 1. Count triangle incidence per CANONICAL undirected edge ──
    const incidence = new Map<number, number>();
    for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = cid[indices[i]], b = cid[indices[i + 1]], c = cid[indices[i + 2]];
        if (a === b || b === c || a === c) continue; // skip collapsed/degenerate
        const e0 = edgeKey(a, b, stride);
        const e1 = edgeKey(b, c, stride);
        const e2 = edgeKey(a, c, stride);
        incidence.set(e0, (incidence.get(e0) ?? 0) + 1);
        incidence.set(e1, (incidence.get(e1) ?? 0) + 1);
        incidence.set(e2, (incidence.get(e2) ?? 0) + 1);
    }

    // u of a canonical id via its representative, normalising the periodic duplicate
    // u≈1.0 → 0 (same angular position as col-0) so bucketing is unambiguous.
    const canonU = (c: number): number => {
        const u = vertices[(reprRaw.get(c) ?? 0) * 3];
        return u >= 0.9999 ? 0 : u;
    };
    const canonT = (c: number): number => vertices[(reprRaw.get(c) ?? 0) * 3 + 1];

    // ── 2. Collect seam boundary edges (incidence === 1), partitioned low/high ──
    const lowEdges: Array<[number, number]> = [];
    const highEdges: Array<[number, number]> = [];
    const lowVertSet = new Set<number>();
    const highVertSet = new Set<number>();
    for (const [key, count] of incidence) {
        if (count !== 1) continue;
        const a = Math.floor(key / stride);
        const b = key % stride;
        if (Math.abs(canonT(a) - canonT(b)) <= MIN_SEAM_EDGE_T_SPAN) continue;
        const uA = canonU(a), uB = canonU(b);
        if (uA <= uLowMax && uB <= uLowMax) {
            lowEdges.push([a, b]);
            lowVertSet.add(a); lowVertSet.add(b);
        } else if (uA >= uHighMin && uB >= uHighMin) {
            highEdges.push([a, b]);
            highVertSet.add(a); highVertSet.add(b);
        }
    }

    if ((lowEdges.length === 0 && highEdges.length === 0)) {
        return {
            triangles: [], closedLowEdges: 0, closedHighEdges: 0,
            skippedUnsafe: 0, lowSeamEdges: 0, highSeamEdges: 0,
        };
    }

    // ── 3. Sorted (t, canon) arrays + existing-boundary-edge set ──
    const sortByT = (s: Set<number>): Array<{ t: number; c: number }> =>
        Array.from(s).map(c => ({ t: canonT(c), c })).sort((p, q) => p.t - q.t || p.c - q.c);
    const lowByT = sortByT(lowVertSet);
    const highByT = sortByT(highVertSet);
    // Set of existing seam boundary edges; a rail-advancing triangle is only emitted
    // when it CLOSES one of these (so a walk across a component gap never adds boundary).
    const boundarySet = new Set<number>();
    for (const [a, b] of lowEdges) boundarySet.add(edgeKey(a, b, stride));
    for (const [a, b] of highEdges) boundarySet.add(edgeKey(a, b, stride));

    // ── 4. Unwrapped-u winding: low side (u≈0) is treated as u+1 so it sits to the
    //    RIGHT of the high side (u≈0.997), matching a standard cell's left→right
    //    orientation (col_last → col_0+1period). Wind each triangle to positive
    //    unwrapped-u signed area (CCW), identical to emitStandardCell's cross test. ──
    const unwrappedU = (c: number): number => {
        const u = canonU(c);
        return u < 0.5 ? u + 1 : u;
    };

    const triangles: number[] = [];
    let skippedUnsafe = 0;
    let closedLowEdges = 0;
    let closedHighEdges = 0;

    /**
     * Emit a closure triangle (canonical ids railA,railB,apex) whose RAIL edge must be an
     * existing canonical seam boundary edge. Gated so no canonical edge exceeds 2
     * incidences. Emits REPRESENTATIVE raw indices so the appended triangle canonicalises
     * back to (railA,railB,apex) exactly. Returns true if emitted.
     */
    const tryEmit = (railA: number, railB: number, apex: number): boolean => {
        if (apex === railA || apex === railB || railA === railB) return false;
        const eRail = edgeKey(railA, railB, stride);
        if (!boundarySet.has(eRail)) return false; // only close real boundary edges
        const eA = edgeKey(railA, apex, stride);
        const eB = edgeKey(railB, apex, stride);
        if (eA === eB) return false;
        // Manifold gate: none of the three canonical edges may already have 2 incidences.
        if ((incidence.get(eRail) ?? 0) >= 2) return false;
        if ((incidence.get(eA) ?? 0) >= 2) return false;
        if ((incidence.get(eB) ?? 0) >= 2) return false;
        // Winding by unwrapped-u signed area (skip near-degenerate area).
        const uA = unwrappedU(railA), tA = canonT(railA);
        const uB = unwrappedU(railB), tB = canonT(railB);
        const uC = unwrappedU(apex), tC = canonT(apex);
        const cross = (uB - uA) * (tC - tA) - (uC - uA) * (tB - tA);
        if (Math.abs(cross) < 1e-12) return false;
        const rA = reprRaw.get(railA) ?? railA;
        const rB = reprRaw.get(railB) ?? railB;
        const rC = reprRaw.get(apex) ?? apex;
        if (cross >= 0) triangles.push(rA, rB, rC);
        else triangles.push(rA, rC, rB);
        incidence.set(eRail, (incidence.get(eRail) ?? 0) + 1);
        incidence.set(eA, (incidence.get(eA) ?? 0) + 1);
        incidence.set(eB, (incidence.get(eB) ?? 0) + 1);
        return true;
    };

    // ── 5. Single merge-walk zipper over both rails (ordered by t) ──
    // At each step advance whichever rail has the smaller next-t, emitting a triangle
    // spanned by that rail's current edge with the opposite rail's current vertex as
    // apex. Indices always advance (so a skipped/unsafe step never stalls the walk);
    // tryEmit only produces geometry when the rail edge is a real boundary edge and
    // the triangle is manifold-safe — so component-gap jumps are skipped harmlessly.
    if (lowByT.length >= 1 && highByT.length >= 1) {
        let i = 0, j = 0;
        const INF = Number.POSITIVE_INFINITY;
        while (i < lowByT.length - 1 || j < highByT.length - 1) {
            const canLow = i < lowByT.length - 1;
            const canHigh = j < highByT.length - 1;
            const nextLowT = canLow ? lowByT[i + 1].t : INF;
            const nextHighT = canHigh ? highByT[j + 1].t : INF;
            if (canLow && (!canHigh || nextLowT <= nextHighT)) {
                // advance low rail: triangle (low[i], low[i+1], high[j])
                if (tryEmit(lowByT[i].c, lowByT[i + 1].c, highByT[j].c)) closedLowEdges++;
                else skippedUnsafe++;
                i++;
            } else if (canHigh) {
                // advance high rail: triangle (high[j], high[j+1], low[i])
                if (tryEmit(highByT[j].c, highByT[j + 1].c, lowByT[i].c)) closedHighEdges++;
                else skippedUnsafe++;
                j++;
            } else {
                break;
            }
        }
    }

    return {
        triangles,
        closedLowEdges,
        closedHighEdges,
        skippedUnsafe,
        lowSeamEdges: lowEdges.length,
        highSeamEdges: highEdges.length,
    };
}
