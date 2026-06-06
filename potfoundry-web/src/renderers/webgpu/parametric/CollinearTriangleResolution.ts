/**
 * CollinearTriangleResolution — removes zero-area "collinear" sliver triangles created
 * by interior T-junctions.
 *
 * A collinear triangle is one whose apex vertex C lies (within tolerance) ON its longest
 * edge A-B — edge lengths look like [x, x, 2x] (minAngle≈0). These are spurious: a
 * conforming mesh would use edges A-C + C-B, never the spanning edge A-B. They survive
 * the area-based degenerate strip (their area is tiny but > the 4e-20 threshold) and the
 * vertex weld (their three vertices are all distinct, ~0.5mm apart), so they show up as
 * extreme-aspect slivers (aspect 1e4–1e6) on otherwise topology-clean styles
 * (SuperellipseMorph, LowPolyFacet, FourierBloom).
 *
 * Fix (watertight- and winding-preserving): for each collinear triangle T=(A,B,C) with C
 * on the manifold edge A-B, find the single neighbour N across A-B, replace N with the two
 * triangles that split it at C (preserving N's winding, since C lies on A→B), and drop T.
 * This eliminates the spanning edge A-B, leaves every other edge's use-count unchanged
 * (T's use of A-C/C-B is replaced 1:1 by the split), and removes the sliver. Only the
 * clean manifold case (A-B used by exactly T + one neighbour) is resolved; boundary or
 * non-manifold spanning edges are left untouched.
 */

export interface CollinearResolutionResult {
    indices: Uint32Array;
    /** Collinear triangles removed. */
    resolvedTriangles: number;
    /** Neighbour triangles split at the on-edge apex. */
    splitNeighbors: number;
    /** New outer-wall index prefix length (only meaningful if outerIdxCount passed). */
    outerIdxCount: number;
}

const EDGE_STR = 0x4000000; // 2^26, exceeds any realistic vertex count

function edgeKey(a: number, b: number): number {
    return a < b ? a * EDGE_STR + b : b * EDGE_STR + a;
}

/**
 * Resolve collinear interior T-junction sliver triangles.
 *
 * @param indices             Flat triangle index buffer.
 * @param positions           Flat xyz positions.
 * @param weldToleranceMm      Canonical weld tolerance for edge/vertex identity (e.g. 1e-4).
 * @param perpFraction         Apex perpendicular distance / longest-edge length below which
 *                             a triangle counts as collinear (default 0.01 → aspect ≳ 87).
 * @param outerIdxCount        Length of the outer-wall index prefix to keep accurate.
 */
export function resolveCollinearTriangles(
    indices: Uint32Array,
    positions: Float32Array,
    weldToleranceMm: number,
    perpFraction: number = 0.01,
    outerIdxCount: number = indices.length,
    maxResultAspect: number = 100,
    endpointSnapMm: number = 0.03,
): CollinearResolutionResult {
    const triCount = (indices.length / 3) | 0;
    const numV = (positions.length / 3) | 0;
    const inv = 1 / Math.max(weldToleranceMm, 1e-9);

    // Canonical vertex id by position quantization (matches the metric's weld).
    const cmap = new Map<string, number>();
    const cid = new Int32Array(numV);
    for (let v = 0; v < numV; v++) {
        const k = `${Math.round(positions[v * 3] * inv)}:${Math.round(positions[v * 3 + 1] * inv)}:${Math.round(positions[v * 3 + 2] * inv)}`;
        let id = cmap.get(k);
        if (id === undefined) { id = cmap.size; cmap.set(k, id); }
        cid[v] = id;
    }

    // Canonical edge -> incident triangle indices.
    const edgeTris = new Map<number, number[]>();
    for (let t = 0; t < triCount; t++) {
        const a = cid[indices[t * 3]], b = cid[indices[t * 3 + 1]], c = cid[indices[t * 3 + 2]];
        if (a === b || b === c || a === c) continue;
        for (const [x, y] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
            const k = edgeKey(x, y);
            let l = edgeTris.get(k);
            if (!l) { l = []; edgeTris.set(k, l); }
            l.push(t);
        }
    }

    const removed = new Set<number>();
    const appended: number[] = [];
    // Apex-snap: a collinear apex within endpointSnapMm of an endpoint is a near-duplicate
    // of that endpoint (tessellation artifact). Welding it onto the endpoint collapses the
    // sliver (and any other tris using the apex move sub-tolerance). Applied at rebuild.
    const weldRemap = new Map<number, number>();
    let resolvedTriangles = 0;
    let splitNeighbors = 0;
    let snappedApices = 0;

    const triVerts = (t: number): [number, number, number] => [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];

    for (let t = 0; t < triCount; t++) {
        if (removed.has(t)) continue;
        const [i0, i1, i2] = triVerts(t);
        // Longest edge + apex (vertex opposite the longest edge).
        const d01 = dist(positions, i0, i1);
        const d12 = dist(positions, i1, i2);
        const d20 = dist(positions, i2, i0);
        let rawLo: number, rawHi: number, apex: number, longest: number;
        if (d01 >= d12 && d01 >= d20) { rawLo = i0; rawHi = i1; apex = i2; longest = d01; }
        else if (d12 >= d01 && d12 >= d20) { rawLo = i1; rawHi = i2; apex = i0; longest = d12; }
        else { rawLo = i2; rawHi = i0; apex = i1; longest = d20; }
        if (longest <= 1e-9) continue;

        // Apex projection onto the longest edge: param s and perpendicular distance.
        const ax = positions[rawLo * 3], ay = positions[rawLo * 3 + 1], az = positions[rawLo * 3 + 2];
        const bx = positions[rawHi * 3], by = positions[rawHi * 3 + 1], bz = positions[rawHi * 3 + 2];
        const cx = positions[apex * 3], cy = positions[apex * 3 + 1], cz = positions[apex * 3 + 2];
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        const len2 = abx * abx + aby * aby + abz * abz;
        const s = (acx * abx + acy * aby + acz * abz) / len2;
        if (s <= 0.001 || s >= 0.999) continue; // apex not strictly interior to the edge
        const projx = ax + s * abx, projy = ay + s * aby, projz = az + s * abz;
        const perp = Math.hypot(cx - projx, cy - projy, cz - projz);
        if (perp > longest * perpFraction) continue; // not collinear enough (a real triangle)

        const cLo = cid[rawLo], cHi = cid[rawHi], cApex = cid[apex];
        if (cApex === cLo || cApex === cHi) continue; // apex coincident with an endpoint

        // Apex-snap: if the apex sits within endpointSnapMm of an endpoint, it is a near-
        // duplicate of that endpoint — weld it there (collapsing the zero-area sliver and
        // its short artifact edge) rather than splitting (which would make a worse needle).
        const dLo = s * longest;
        const dHi = (1 - s) * longest;
        if (Math.min(dLo, dHi) <= endpointSnapMm) {
            const target = dLo <= dHi ? rawLo : rawHi;
            if (!weldRemap.has(apex) && apex !== target) {
                weldRemap.set(apex, target);
                resolvedTriangles++;
                snappedApices++;
            }
            continue;
        }

        const incident = edgeTris.get(edgeKey(cLo, cHi));
        if (!incident) continue;
        const nbrs = incident.filter((x) => x !== t && !removed.has(x));
        if (nbrs.length !== 1) continue; // only the clean manifold case (T + one neighbour)
        const n = nbrs[0];

        // Find the neighbour's directed edge that maps to (cLo,cHi); the third vertex is D.
        const nv = triVerts(n);
        let rawX = -1, rawY = -1, rawD = -1;
        for (let e = 0; e < 3; e++) {
            const p = nv[e], q = nv[(e + 1) % 3], r = nv[(e + 2) % 3];
            const cp = cid[p], cq = cid[q];
            if ((cp === cLo && cq === cHi) || (cp === cHi && cq === cLo)) {
                rawX = p; rawY = q; rawD = r; break;
            }
        }
        if (rawX < 0 || rawD === apex || cid[rawD] === cApex) continue; // defensive

        // Quality gate: only apply the split if BOTH resulting triangles are below the
        // sliver threshold. This ensures the resolution strictly removes a sliver and
        // never manufactures a worse one — borderline thin triangles (aspect just under
        // the sliver bound, apex near an endpoint) are detected by perpFraction but their
        // split would be a worse sliver, so they are left untouched.
        const aspSplit1 = triangleAspect(positions, rawX, apex, rawD);
        const aspSplit2 = triangleAspect(positions, apex, rawY, rawD);
        if (aspSplit1 >= maxResultAspect || aspSplit2 >= maxResultAspect) continue;

        // Split neighbour (rawX -> rawY -> rawD) at the apex, preserving winding.
        removed.add(t);
        removed.add(n);
        appended.push(rawX, apex, rawD, apex, rawY, rawD);
        resolvedTriangles++;
        splitNeighbors++;
    }

    if (resolvedTriangles === 0) {
        return { indices, resolvedTriangles: 0, splitNeighbors: 0, outerIdxCount };
    }

    // Resolve apex-snap weld chains (apex → endpoint, possibly chained).
    const resolve = (v: number): number => {
        let x = v, guard = 0;
        while (weldRemap.has(x) && guard++ < 16) x = weldRemap.get(x)!;
        return x;
    };

    // Rebuild: surviving original triangles first (preserving order so the outer prefix
    // stays contiguous at the front), then the appended split triangles. Every index goes
    // through the weld remap; triangles that become degenerate (collapsed by a snap) are
    // stripped. The outer prefix length is recounted from the kept outer survivors.
    const kept: number[] = [];
    let newOuterIdxCount = 0;
    for (let t = 0; t < triCount; t++) {
        if (removed.has(t)) continue;
        const a = resolve(indices[t * 3]);
        const b = resolve(indices[t * 3 + 1]);
        const c = resolve(indices[t * 3 + 2]);
        if (a === b || b === c || a === c) continue; // degenerate after snap → strip
        kept.push(a, b, c);
        if (t * 3 < outerIdxCount) newOuterIdxCount += 3;
    }
    for (let i = 0; i + 2 < appended.length; i += 3) {
        const a = resolve(appended[i]);
        const b = resolve(appended[i + 1]);
        const c = resolve(appended[i + 2]);
        if (a === b || b === c || a === c) continue;
        kept.push(a, b, c);
    }

    return {
        indices: Uint32Array.from(kept),
        resolvedTriangles,
        splitNeighbors,
        outerIdxCount: newOuterIdxCount,
    };
}

/** 3D aspect ratio: longest²·√3 / (4·area). 1 = equilateral; large = sliver. */
function triangleAspect(positions: Float32Array, a: number, b: number, c: number): number {
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const ab2 = (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2;
    const bc2 = (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2;
    const ca2 = (ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const crx = uy * vz - uz * vy, cry = uz * vx - ux * vz, crz = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(crx, cry, crz);
    if (area <= 1e-12) return Number.POSITIVE_INFINITY;
    return (Math.max(ab2, bc2, ca2) * Math.sqrt(3)) / (4 * area);
}

function dist(positions: Float32Array, a: number, b: number): number {
    return Math.hypot(
        positions[a * 3] - positions[b * 3],
        positions[a * 3 + 1] - positions[b * 3 + 1],
        positions[a * 3 + 2] - positions[b * 3 + 2],
    );
}

/**
 * Diagnostic: count collinear triangles (apex on its own longest edge within perpFraction)
 * over an index range [0, idxCount). Used to locate the pipeline stage that BORN them.
 */
export function countCollinearSlivers(
    indices: ArrayLike<number>,
    positions: Float32Array,
    idxCount: number = indices.length,
    perpFraction: number = 0.01,
): number {
    let count = 0;
    for (let t = 0; t + 2 < idxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        const d01 = dist(positions, i0, i1);
        const d12 = dist(positions, i1, i2);
        const d20 = dist(positions, i2, i0);
        let lo: number, hi: number, ap: number, longest: number;
        if (d01 >= d12 && d01 >= d20) { lo = i0; hi = i1; ap = i2; longest = d01; }
        else if (d12 >= d01 && d12 >= d20) { lo = i1; hi = i2; ap = i0; longest = d12; }
        else { lo = i2; hi = i0; ap = i1; longest = d20; }
        if (longest <= 1e-9) continue;
        const ax = positions[lo * 3], ay = positions[lo * 3 + 1], az = positions[lo * 3 + 2];
        const bx = positions[hi * 3], by = positions[hi * 3 + 1], bz = positions[hi * 3 + 2];
        const cx = positions[ap * 3], cy = positions[ap * 3 + 1], cz = positions[ap * 3 + 2];
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const len2 = abx * abx + aby * aby + abz * abz;
        const s = ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / len2;
        if (s <= 0.001 || s >= 0.999) continue;
        const px = ax + s * abx, py = ay + s * aby, pz = az + s * abz;
        if (Math.hypot(cx - px, cy - py, cz - pz) <= longest * perpFraction) count++;
    }
    return count;
}
