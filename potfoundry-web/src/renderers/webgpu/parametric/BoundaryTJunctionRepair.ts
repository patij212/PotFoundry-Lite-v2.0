/**
 * Boundary T-junction repair for the outer wall.
 *
 * Repairs cases where one triangle owns a long boundary edge A-B while the
 * neighboring side already contains vertices A-C-B on the same UV segment.
 * The fix splits the long triangle edge using the existing vertices, so no
 * geometry is moved and feature/chain precision is preserved.
 */

import { normalizeWindingByComponent } from './WindingNormalizer';

// Number-encoded undirected edge key: min(a,b) * EDGE_STRIDE + max(a,b).
// Vertex indices are < EDGE_STRIDE (2^21); the product stays < 2^42, well within
// the 2^53 safe-integer range, so Number keys are collision-free and far cheaper
// than BigInt (no per-edge heap allocation, faster Map hashing).
const EDGE_STRIDE = 0x200000;
const UV_WELD_EPS = 1e-5;
const UV_SEGMENT_SPLIT_EPS = 1e-4;
const PROJECTED_LOOP_FILL_MAX_ASPECT = 100;
const WINDING_GUARD_MAX_WELD_TOLERANCE_MM = 1e-4;

// --- Precomputed canonical vertex map -------------------------------------
// canonicalizeVertex maps each vertex index to a canonical id derived from a
// string position/UV key. That key build + Map<string,number> lookup dominated
// the T-junction repair (collectBoundaryEdges was ~95% of every sub-pass, and
// each sub-pass rebuilt it from scratch ~6x per pass). The canonical identity of
// a vertex is a pure function of (positions[v]/uvs[v], weld tolerance) and the
// repair passes only re-reference existing vertex indices (they never append new
// vertices), so the vertex->id mapping is invariant across all passes within one
// repairOuterWallTJunctions call. We therefore build it ONCE and reuse it.
//
// The cache is keyed by the input array references + tolerance, so a different
// mesh (new typed arrays) transparently rebuilds. JS is single-threaded, so no
// interleaving across concurrent meshes is possible.
let __gvcUvs: Float32Array | null = null;
let __gvcPositions: Float32Array | null = null;
let __gvcTol = Number.NaN;
let __gvcIds: Int32Array | null = null;

function getGlobalVertexCanonical(
    uvs: Float32Array,
    positions: Float32Array | undefined,
    topologyWeldToleranceMm: number,
): Int32Array {
    const pos = positions ?? null;
    if (__gvcIds && __gvcUvs === uvs && __gvcPositions === pos && __gvcTol === topologyWeldToleranceMm) {
        return __gvcIds;
    }
    const numVerts = (uvs.length / 3) | 0;
    const ids = new Int32Array(numVerts);
    const keyToId = new Map<string, number>();
    let nextId = 0;
    for (let v = 0; v < numVerts; v++) {
        const geometryKey = positions
            ? canonicalGeometryKey(positions, v, topologyWeldToleranceMm)
            : null;
        const key = geometryKey ?? canonicalUvKey(uvs, v);
        let id = keyToId.get(key);
        if (id === undefined) {
            id = nextId++;
            keyToId.set(key, id);
        }
        ids[v] = id;
    }
    __gvcUvs = uvs;
    __gvcPositions = pos;
    __gvcTol = topologyWeldToleranceMm;
    __gvcIds = ids;
    return ids;
}

// TEMP-TJPROBE: module-level deadline so inner loops can self-abort even when a
// single sub-pass is itself the multi-minute sink. repairOuterWallTJunctions arms it;
// inner hot loops call __tjAbort() which throws past the deadline, unwinding the sync
// block so the E2E can read window.__pfStageLog. REMOVE once the tail hang is fixed.
let __tjDeadlineAt = 0;
let __tjAbortCounter = 0;
function __tjAbort(where: string): void {
    if (__tjDeadlineAt === 0) return;
    // Sample the clock cheaply (every 4096 calls) to avoid per-iteration perf cost.
    if ((++__tjAbortCounter & 0xfff) !== 0) return;
    if (performance.now() > __tjDeadlineAt) {
        try {
            (globalThis as unknown as { __pfStageLog?: string[] }).__pfStageLog?.push(`TJ-ABORT at ${where} t=${performance.now().toFixed(0)}`);
        } catch { /* noop */ }
        throw new Error(`TJPROBE_DEADLINE at ${where}`);
    }
}

export interface BoundaryTJunctionRepairResult {
    indices: Uint32Array;
    outerIdxCount: number;
    repairedEdges: number;
    insertedTriangles: number;
}

export interface SurfaceBoundaryTJunctionRepairResult {
    indices: Uint32Array;
    repairedEdges: number;
    insertedTriangles: number;
}

export interface BoundaryLoopFillResult {
    indices: Uint32Array;
    filledLoops: number;
    insertedTriangles: number;
    attemptedLoops?: number;
    emptyTriangulations?: number;
    unsafeLoops?: number;
    projectedTriangulations?: number;
}

export interface BoundaryLoopVertexFillResult extends BoundaryLoopFillResult {
    uvs: Float32Array;
    positions: Float32Array;
    insertedVertices: number;
}

export interface BoundaryChainFillResult {
    indices: Uint32Array;
    filledChains: number;
    insertedTriangles: number;
    attemptedChains?: number;
    unsafeChains?: number;
    lowVertices?: number;
    highVertices?: number;
    weldedVertices?: number;
}

interface BoundaryEdgeRecord {
    key: number;
    triOffset: number;
    rawA: number;
    rawB: number;
    canonA: number;
    canonB: number;
    opp: number;
    oppCanon: number;
}

interface CanonicalVertexData {
    remap: Map<number, number>;
    representativeRaw: Map<number, number>;
    nextId: number;
}

interface SplitSequence {
    raw: number[];
    canonical: number[];
}

interface CanonicalEdgeState {
    edgeCounts: Map<number, number>;
    canonical: CanonicalVertexData;
    keyToId: Map<string, number>;
}

type SurfaceJoinKey =
    | 'outerTop'
    | 'outerBottom'
    | 'innerTop'
    | 'innerBottom'
    | 'drainTop'
    | 'drainBottom';

function edgeKey(a: number, b: number): number {
    return a < b
        ? a * EDGE_STRIDE + b
        : b * EDGE_STRIDE + a;
}

function windingGuardWeldTolerance(topologyWeldToleranceMm: number): number {
    return topologyWeldToleranceMm > 0
        ? Math.min(topologyWeldToleranceMm, WINDING_GUARD_MAX_WELD_TOLERANCE_MM)
        : 0;
}

function isOuterMidVertex(uvs: Float32Array, v: number): boolean {
    const base = v * 3;
    const surfaceId = Math.round(uvs[base + 2] ?? -1);
    const t = uvs[base + 1] ?? NaN;
    return surfaceId === 0 && t > 1e-5 && t < 1 - 1e-5;
}

function canonicalUvKey(uvs: Float32Array, v: number): string {
    const base = v * 3;
    const u = Math.round((uvs[base] ?? 0) / UV_WELD_EPS);
    const t = Math.round((uvs[base + 1] ?? 0) / UV_WELD_EPS);
    const surface = Math.round(uvs[base + 2] ?? -1);
    return `${surface}:${u}:${t}`;
}

function canonicalGeometryKey(positions: Float32Array, v: number, epsilon: number): string | null {
    if (epsilon <= 0) return null;
    const base = v * 3;
    if (base + 2 >= positions.length) return null;
    const x = Math.round((positions[base] ?? 0) / epsilon);
    const y = Math.round((positions[base + 1] ?? 0) / epsilon);
    const z = Math.round((positions[base + 2] ?? 0) / epsilon);
    return `g:${x}:${y}:${z}`;
}

function surfaceJoinKey(uvs: Float32Array, v: number): SurfaceJoinKey | null {
    const base = v * 3;
    const surfaceId = Math.round(uvs[base + 2] ?? -1);
    const t = uvs[base + 1] ?? NaN;
    const atStart = t <= 1e-5;
    const atEnd = t >= 1 - 1e-5;

    if ((surfaceId === 0 && atEnd) || (surfaceId === 2 && atEnd)) return 'outerTop';
    if ((surfaceId === 0 && atStart) || (surfaceId === 3 && atStart)) return 'outerBottom';
    if ((surfaceId === 1 && atEnd) || (surfaceId === 2 && atStart)) return 'innerTop';
    if ((surfaceId === 1 && atStart) || (surfaceId === 4 && atStart)) return 'innerBottom';
    if ((surfaceId === 4 && atEnd) || (surfaceId === 5 && atEnd)) return 'drainTop';
    if ((surfaceId === 3 && atEnd) || (surfaceId === 5 && atStart)) return 'drainBottom';

    return null;
}

function canonicalJoinKey(uvs: Float32Array, v: number): string | null {
    const join = surfaceJoinKey(uvs, v);
    if (!join) return null;
    const u = Math.round((((uvs[v * 3] ?? 0) % 1 + 1) % 1) / UV_WELD_EPS);
    return `${join}:${u}`;
}

function canonicalizeVertex(
    uvs: Float32Array,
    vertexIdx: number,
    canonical: CanonicalVertexData,
    keyToId: Map<string, number>,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): number {
    const cached = canonical.remap.get(vertexIdx);
    if (cached !== undefined) return cached;

    // O(1) lookup into the precomputed global vertex->canonicalId map instead of
    // rebuilding a position/UV string key here. keyToId is retained in the
    // signature for call-site compatibility but is no longer consulted on this
    // (geometry/UV) path. representativeRaw stays first-encounter in this pass's
    // triangle iteration order, identical to the previous per-pass behavior.
    void keyToId;
    const id = getGlobalVertexCanonical(uvs, positions, topologyWeldToleranceMm)[vertexIdx];
    canonical.remap.set(vertexIdx, id);
    if (!canonical.representativeRaw.has(id)) {
        canonical.representativeRaw.set(id, vertexIdx);
    }
    return id;
}

function canonicalizeJoinVertex(
    uvs: Float32Array,
    vertexIdx: number,
    canonical: CanonicalVertexData,
    keyToId: Map<string, number>,
): number | null {
    const cached = canonical.remap.get(vertexIdx);
    if (cached !== undefined) return cached;

    const key = canonicalJoinKey(uvs, vertexIdx);
    if (!key) return null;

    let id = keyToId.get(key);
    if (id === undefined) {
        id = canonical.nextId++;
        keyToId.set(key, id);
        canonical.representativeRaw.set(id, vertexIdx);
    }
    canonical.remap.set(vertexIdx, id);
    return id;
}

function pointOnSegmentParam(uvs: Float32Array, a: number, b: number, p: number): number | null {
    const au = uvs[a * 3];
    const at = uvs[a * 3 + 1];
    const bu = uvs[b * 3];
    const bt = uvs[b * 3 + 1];
    const pu = uvs[p * 3];
    const pt = uvs[p * 3 + 1];

    const du = bu - au;
    if (Math.abs(du) > 0.5) return null;
    const dt = bt - at;
    const lenSq = du * du + dt * dt;
    if (lenSq < 1e-16) return null;

    const s = ((pu - au) * du + (pt - at) * dt) / lenSq;
    if (s <= 1e-6 || s >= 1 - 1e-6) return null;

    const projU = au + s * du;
    const projT = at + s * dt;
    const distSq = (pu - projU) * (pu - projU) + (pt - projT) * (pt - projT);
    return distSq <= UV_SEGMENT_SPLIT_EPS * UV_SEGMENT_SPLIT_EPS ? s : null;
}

function pointNearSegmentParam3D(
    positions: Float32Array,
    a: number,
    b: number,
    p: number,
    topologyWeldToleranceMm: number,
): number | null {
    const ax = positions[a * 3] ?? 0;
    const ay = positions[a * 3 + 1] ?? 0;
    const az = positions[a * 3 + 2] ?? 0;
    const bx = positions[b * 3] ?? 0;
    const by = positions[b * 3 + 1] ?? 0;
    const bz = positions[b * 3 + 2] ?? 0;
    const px = positions[p * 3] ?? 0;
    const py = positions[p * 3 + 1] ?? 0;
    const pz = positions[p * 3 + 2] ?? 0;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-16) return null;
    const s = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2;
    if (s <= 1e-6 || s >= 1 - 1e-6) return null;
    const projX = ax + s * dx;
    const projY = ay + s * dy;
    const projZ = az + s * dz;
    const dist2 = (px - projX) ** 2 + (py - projY) ** 2 + (pz - projZ) ** 2;
    const len = Math.sqrt(len2);
    const tol = Math.max(topologyWeldToleranceMm * 2, Math.min(len * 0.25, 0.02));
    return dist2 <= tol * tol ? s : null;
}

function uvDistanceSq(uvs: Float32Array, a: number, b: number): number {
    let du = (uvs[a * 3] ?? 0) - (uvs[b * 3] ?? 0);
    if (du > 0.5) du -= 1;
    else if (du < -0.5) du += 1;
    const dt = (uvs[a * 3 + 1] ?? 0) - (uvs[b * 3 + 1] ?? 0);
    return du * du + dt * dt;
}

function unwrapUToCenter(u: number, center: number): number {
    let unwrapped = u;
    while (unwrapped - center > 0.5) unwrapped -= 1;
    while (unwrapped - center < -0.5) unwrapped += 1;
    return unwrapped;
}

function uvSideCross(uvs: Float32Array, rawA: number, rawB: number, rawP: number): number {
    const au0 = uvs[rawA * 3] ?? 0;
    const bu0 = uvs[rawB * 3] ?? 0;
    const center = Math.abs(au0 - bu0) > 0.5
        ? (unwrapUToCenter(au0, bu0) + bu0) * 0.5
        : (au0 + bu0) * 0.5;
    const au = unwrapUToCenter(au0, center);
    const bu = unwrapUToCenter(bu0, center);
    const pu = unwrapUToCenter(uvs[rawP * 3] ?? 0, center);
    const at = uvs[rawA * 3 + 1] ?? 0;
    const bt = uvs[rawB * 3 + 1] ?? 0;
    const pt = uvs[rawP * 3 + 1] ?? 0;
    return (bu - au) * (pt - at) - (bt - at) * (pu - au);
}

function canUseAsNearDuplicateEndpoint(uvs: Float32Array, candidate: number, target: number): boolean {
    if (!isOuterMidVertex(uvs, candidate) || !isOuterMidVertex(uvs, target)) return false;
    const candidateSurface = Math.round(uvs[candidate * 3 + 2] ?? -1);
    const targetSurface = Math.round(uvs[target * 3 + 2] ?? -2);
    return candidateSurface === targetSurface &&
        uvDistanceSq(uvs, candidate, target) <= UV_SEGMENT_SPLIT_EPS * UV_SEGMENT_SPLIT_EPS;
}

function pointOnJoinSegmentParam(uvs: Float32Array, a: number, b: number, p: number): number | null {
    const join = surfaceJoinKey(uvs, a);
    if (!join || surfaceJoinKey(uvs, b) !== join || surfaceJoinKey(uvs, p) !== join) return null;

    const au0 = uvs[a * 3];
    const bu0 = uvs[b * 3];
    const pu0 = uvs[p * 3];
    const center = Math.abs(au0 - bu0) > 0.5
        ? (unwrapUToCenter(au0, bu0) + bu0) * 0.5
        : (au0 + bu0) * 0.5;
    const au = unwrapUToCenter(au0, center);
    const bu = unwrapUToCenter(bu0, center);
    const pu = unwrapUToCenter(pu0, center);
    const du = bu - au;
    if (Math.abs(du) < 1e-12) return null;

    const s = (pu - au) / du;
    if (s <= 1e-6 || s >= 1 - 1e-6) return null;

    const projU = au + s * du;
    return Math.abs(pu - projU) <= 1e-7 ? s : null;
}

function uvCross(uvs: Float32Array, a: number, b: number, c: number): number {
    const au = uvs[a * 3], at = uvs[a * 3 + 1];
    const bu = uvs[b * 3], bt = uvs[b * 3 + 1];
    const cu = uvs[c * 3], ct = uvs[c * 3 + 1];
    return (bu - au) * (ct - at) - (cu - au) * (bt - at);
}

function emitTriCCW(buf: number[], a: number, b: number, c: number, uvs: Float32Array): void {
    const cross = uvCross(uvs, a, b, c);
    if (Math.abs(cross) < 1e-14) return;
    if (cross > 0) buf.push(a, b, c);
    else buf.push(a, c, b);
}

// Reconstruct a boundary-edge record from a packed location (triOffset*4 + edgeIndex)
// using the precomputed global canonical ids. Avoids storing a record object per edge.
function makeEdgeRecord(
    indices: Uint32Array,
    globalIds: Int32Array,
    loc: number,
): BoundaryEdgeRecord {
    const i = loc & 3;
    const t = (loc - i) / 4;
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    let rawA: number, rawB: number, opp: number;
    if (i === 0) { rawA = a; rawB = b; opp = c; }
    else if (i === 1) { rawA = b; rawB = c; opp = a; }
    else { rawA = c; rawB = a; opp = b; }
    const canonA = globalIds[rawA], canonB = globalIds[rawB], oppCanon = globalIds[opp];
    return { key: edgeKey(canonA, canonB), triOffset: t, rawA, rawB, canonA, canonB, opp, oppCanon };
}

function collectBoundaryEdges(
    indices: Uint32Array,
    outerIdxCount: number,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
    collectEdgeRecords: boolean = false,
): {
    records: BoundaryEdgeRecord[];
    boundaryKeys: Set<number>;
    boundaryNeighbors: Map<number, Set<number>>;
    representativeRaw: Map<number, number>;
    edgeCounts: Map<number, number>;
    edgeRecordsByKey: Map<number, BoundaryEdgeRecord[]>;
} {
    // Use the precomputed global vertex->canonicalId map. The canonical identity of a
    // vertex is invariant across passes (uvs/positions never change, splits only reuse
    // existing vertices), so we avoid the per-vertex string-key rebuild and the per-pass
    // remap Map entirely. We also avoid allocating a record object per directed edge
    // (~5M/pass): edge counts are tallied with a single first-occurrence location per key,
    // and record objects are materialized only for boundary edges (count===1, ~few 100K)
    // and — when requested — non-manifold edges (count>=3, rare). This is output-identical
    // to the prior allocate-everything implementation; representativeRaw and boundary
    // record/order semantics are preserved (first-encounter in triangle iteration order).
    const globalIds = getGlobalVertexCanonical(uvs, positions, topologyWeldToleranceMm);
    const edgeCounts = new Map<number, number>();
    const firstLoc = new Map<number, number>();
    const representativeRaw = new Map<number, number>();

    // Pass A: tally edge counts, capture each edge's first-occurrence location, and
    // record representativeRaw (first raw vertex seen for each canonical id).
    for (let t = 0; t < outerIdxCount; t += 3) {
        __tjAbort('collectBoundaryEdges'); // TEMP-TJPROBE
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) continue;
        const ca = globalIds[a], cb = globalIds[b], cc = globalIds[c];
        if (!representativeRaw.has(ca)) representativeRaw.set(ca, a);
        if (!representativeRaw.has(cb)) representativeRaw.set(cb, b);
        if (!representativeRaw.has(cc)) representativeRaw.set(cc, c);
        if (ca === cb || cb === cc || ca === cc) continue;

        const k0 = edgeKey(ca, cb);
        edgeCounts.set(k0, (edgeCounts.get(k0) ?? 0) + 1);
        if (!firstLoc.has(k0)) firstLoc.set(k0, t * 4 + 0);
        const k1 = edgeKey(cb, cc);
        edgeCounts.set(k1, (edgeCounts.get(k1) ?? 0) + 1);
        if (!firstLoc.has(k1)) firstLoc.set(k1, t * 4 + 1);
        const k2 = edgeKey(cc, ca);
        edgeCounts.set(k2, (edgeCounts.get(k2) ?? 0) + 1);
        if (!firstLoc.has(k2)) firstLoc.set(k2, t * 4 + 2);
    }

    // Pass B: materialize boundary records (count===1) in edgeCounts insertion order,
    // matching the prior implementation's `records` ordering exactly.
    const records: BoundaryEdgeRecord[] = [];
    const boundaryKeys = new Set<number>();
    const boundaryNeighbors = new Map<number, Set<number>>();
    for (const [key, count] of edgeCounts) {
        if (count !== 1) continue;
        const loc = firstLoc.get(key);
        if (loc === undefined) continue;
        const sample = makeEdgeRecord(indices, globalIds, loc);
        records.push(sample);
        boundaryKeys.add(key);
        let aNeighbors = boundaryNeighbors.get(sample.canonA);
        if (!aNeighbors) {
            aNeighbors = new Set<number>();
            boundaryNeighbors.set(sample.canonA, aNeighbors);
        }
        aNeighbors.add(sample.canonB);
        let bNeighbors = boundaryNeighbors.get(sample.canonB);
        if (!bNeighbors) {
            bNeighbors = new Set<number>();
            boundaryNeighbors.set(sample.canonB, bNeighbors);
        }
        bNeighbors.add(sample.canonA);
    }

    // Pass C (only when a caller needs per-edge fan records): materialize records for
    // non-manifold edges (count>=3) in triangle iteration order. Callers only ever query
    // edgeRecordsByKey for count>2 keys, so building it solely for those is observationally
    // identical while skipping millions of manifold-edge allocations.
    const edgeRecordsByKey = new Map<number, BoundaryEdgeRecord[]>();
    if (collectEdgeRecords) {
        for (let t = 0; t < outerIdxCount; t += 3) {
            __tjAbort('collectBoundaryEdges'); // TEMP-TJPROBE
            const a = indices[t], b = indices[t + 1], c = indices[t + 2];
            if (a === b || b === c || a === c) continue;
            const ca = globalIds[a], cb = globalIds[b], cc = globalIds[c];
            if (ca === cb || cb === cc || ca === cc) continue;
            const edgeKeysAndLocs: Array<[number, number]> = [
                [edgeKey(ca, cb), t * 4 + 0],
                [edgeKey(cb, cc), t * 4 + 1],
                [edgeKey(cc, ca), t * 4 + 2],
            ];
            for (const [key, loc] of edgeKeysAndLocs) {
                if ((edgeCounts.get(key) ?? 0) < 3) continue;
                let arr = edgeRecordsByKey.get(key);
                if (!arr) {
                    arr = [];
                    edgeRecordsByKey.set(key, arr);
                }
                arr.push(makeEdgeRecord(indices, globalIds, loc));
            }
        }
    }

    return {
        records,
        boundaryKeys,
        boundaryNeighbors,
        representativeRaw,
        edgeCounts,
        edgeRecordsByKey,
    };
}

function buildCanonicalEdgeState(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): CanonicalEdgeState {
    const edgeCounts = new Map<number, number>();
    const canonical: CanonicalVertexData = {
        remap: new Map<number, number>(),
        representativeRaw: new Map<number, number>(),
        nextId: 0,
    };
    const keyToId = new Map<string, number>();

    for (let t = 0; t < indices.length; t += 3) {
        __tjAbort('buildCanonicalEdgeState'); // TEMP-TJPROBE
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) continue;
        const ca = canonicalizeVertex(uvs, a, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cc = canonicalizeVertex(uvs, c, canonical, keyToId, positions, topologyWeldToleranceMm);
        if (ca === cb || cb === cc || ca === cc) continue;

        for (const [ea, eb] of [[ca, cb], [cb, cc], [cc, ca]] as Array<[number, number]>) {
            const key = edgeKey(ea, eb);
            edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        }
    }

    return { edgeCounts, canonical, keyToId };
}

function countCanonicalOrientationMismatches(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): number {
    const canonical = getGlobalVertexCanonical(uvs, positions, topologyWeldToleranceMm);
    const directions = new Map<number, [number, number]>();
    for (let t = 0; t < indices.length; t += 3) {
        const a = canonical[indices[t]];
        const b = canonical[indices[t + 1]];
        const c = canonical[indices[t + 2]];
        if (a === b || b === c || a === c) continue;
        for (const [from, to] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
            const key = edgeKey(from, to);
            const counts = directions.get(key) ?? [0, 0];
            counts[from < to ? 0 : 1]++;
            directions.set(key, counts);
        }
    }

    let mismatches = 0;
    for (const [forward, reverse] of directions.values()) {
        if (forward + reverse === 2 && (forward === 2 || reverse === 2)) mismatches++;
    }
    return mismatches;
}

function addTriangleEdgesIfManifoldSafe(
    state: CanonicalEdgeState,
    tris: number[],
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): boolean {
    const pending = new Map<number, number>();

    for (let i = 0; i < tris.length; i += 3) {
        const a = tris[i], b = tris[i + 1], c = tris[i + 2];
        const ca = canonicalizeVertex(uvs, a, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
        const cc = canonicalizeVertex(uvs, c, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
        if (ca === cb || cb === cc || ca === cc) return false;

        for (const [ea, eb] of [[ca, cb], [cb, cc], [cc, ca]] as Array<[number, number]>) {
            const key = edgeKey(ea, eb);
            const nextCount = (state.edgeCounts.get(key) ?? 0) + (pending.get(key) ?? 0) + 1;
            if (nextCount > 2) return false;
            pending.set(key, (pending.get(key) ?? 0) + 1);
        }
    }

    for (const [key, increment] of pending) {
        state.edgeCounts.set(key, (state.edgeCounts.get(key) ?? 0) + increment);
    }

    return true;
}

/**
 * Incremental, per-triangle variant of addTriangleEdgesIfManifoldSafe.
 *
 * Instead of all-or-nothing (one unsafe/degenerate candidate discarding the WHOLE
 * batch), this commits each candidate triangle independently against the live edge
 * map and returns the accepted subset. A candidate is accepted only when it is
 * non-degenerate AND none of its three canonical edges would exceed two incidences —
 * the same manifold-safety gate, applied one triangle at a time. This makes the pass
 * provably non-regressive (it can only ADD triangles and can NEVER create a >2
 * incidence edge) while still making progress on mismatched-density seams where a few
 * candidates are canonically degenerate (e.g. low/high seam endpoints sharing a 3D
 * position). Mutates state.edgeCounts for every accepted triangle.
 */
function addTrianglesIncrementallyIfSafe(
    state: CanonicalEdgeState,
    tris: number[],
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): number[] {
    const accepted: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
        const a = tris[i], b = tris[i + 1], c = tris[i + 2];
        const ca = canonicalizeVertex(uvs, a, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
        const cc = canonicalizeVertex(uvs, c, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
        if (ca === cb || cb === cc || ca === cc) continue; // skip canonically degenerate, keep going

        const keys: [number, number, number] = [edgeKey(ca, cb), edgeKey(cb, cc), edgeKey(cc, ca)];
        // A well-formed triangle has three distinct canonical edges; guard against
        // duplicate-edge folds before consulting the incidence map.
        if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) continue;
        if ((state.edgeCounts.get(keys[0]) ?? 0) + 1 > 2) continue;
        if ((state.edgeCounts.get(keys[1]) ?? 0) + 1 > 2) continue;
        if ((state.edgeCounts.get(keys[2]) ?? 0) + 1 > 2) continue;

        for (const key of keys) state.edgeCounts.set(key, (state.edgeCounts.get(key) ?? 0) + 1);
        accepted.push(a, b, c);
    }
    return accepted;
}

function findSplitSequence(
    uvs: Float32Array,
    rawA: number,
    rawB: number,
    canonA: number,
    canonB: number,
    boundaryNeighbors: Map<number, Set<number>>,
    representativeRaw: Map<number, number>,
    segmentParam: (rawVertex: number) => number | null = (rawVertex) =>
        pointOnSegmentParam(uvs, rawA, rawB, rawVertex),
): SplitSequence | null {
    const MAX_SEGMENTS = 32;
    interface State {
        canonical: number;
        rawPath: number[];
        canonicalPath: number[];
        s: number;
    }

    const startNeighbors = boundaryNeighbors.get(canonA);
    if (!startNeighbors) return null;

    const queue: State[] = [];
    for (const n of startNeighbors) {
        if (n === canonB) continue;
        const rawN = representativeRaw.get(n);
        if (rawN === undefined || !isOuterMidVertex(uvs, rawN)) continue;
        const s = segmentParam(rawN);
        if (s === null) continue;
        queue.push({
            canonical: n,
            rawPath: [rawA, rawN],
            canonicalPath: [canonA, n],
            s,
        });
    }

    while (queue.length > 0) {
        __tjAbort('findSplitSequence-bfs'); // TEMP-TJPROBE
        const state = queue.shift()!;
        if (state.rawPath.length > MAX_SEGMENTS) continue;

        const neighbors = boundaryNeighbors.get(state.canonical);
        if (!neighbors) continue;
        for (const n of neighbors) {
            if (n === canonB) {
                return {
                    raw: [...state.rawPath, rawB],
                    canonical: [...state.canonicalPath, canonB],
                };
            }
            if (state.canonicalPath.includes(n)) continue;
            const rawN = representativeRaw.get(n);
            if (rawN === undefined || !isOuterMidVertex(uvs, rawN)) continue;
            const s = segmentParam(rawN);
            if (s === null || s <= state.s + 1e-6) continue;
            queue.push({
                canonical: n,
                rawPath: [...state.rawPath, rawN],
                canonicalPath: [...state.canonicalPath, n],
                s,
            });
        }
    }

    return null;
}

function splitPathOpposesBoundaryOwners(
    sequence: SplitSequence,
    boundaryRecordByKey: Map<number, BoundaryEdgeRecord>,
): boolean {
    for (let i = 0; i < sequence.canonical.length - 1; i++) {
        const ca = sequence.canonical[i];
        const cb = sequence.canonical[i + 1];
        const owner = boundaryRecordByKey.get(edgeKey(ca, cb));
        if (!owner || owner.canonA !== cb || owner.canonB !== ca) return false;
    }
    return true;
}

function splitBoundaryTJunctionPass(
    outerIndices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const __sbtA = performance.now(); // TEMP-TJPROBE
    const { records, boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        outerIndices,
        outerIndices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    // TEMP-TJPROBE: split collectBoundaryEdges vs records-loop cost
    try {
        (globalThis as unknown as { __pfStageLog?: string[] }).__pfStageLog?.push(
            `  sbtj.collectBoundaryEdges=${(performance.now() - __sbtA).toFixed(0)}ms records=${records.length} tris=${outerIndices.length / 3}`,
        );
    } catch { /* noop */ }
    const __sbtB = performance.now(); // TEMP-TJPROBE
    const mutable = new Uint32Array(outerIndices);
    const appended: number[] = [];
    const touchedTris = new Set<number>();
    const boundaryRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) boundaryRecordByKey.set(record.key, record);
    let repairedEdges = 0;

    for (const record of records) {
        __tjAbort('splitBoundaryTJunctionPass-records'); // TEMP-TJPROBE
        if (touchedTris.has(record.triOffset)) continue;
        const { rawA, rawB } = record;
        if (!isOuterMidVertex(uvs, rawA) || !isOuterMidVertex(uvs, rawB)) continue;

        const sequence = findSplitSequence(
            uvs,
            rawA,
            rawB,
            record.canonA,
            record.canonB,
            boundaryNeighbors,
            representativeRaw,
        );
        if (!sequence) continue;
        if (!splitPathOpposesBoundaryOwners(sequence, boundaryRecordByKey)) continue;

        mutable[record.triOffset] = sequence.raw[0];
        mutable[record.triOffset + 1] = sequence.raw[1];
        mutable[record.triOffset + 2] = record.opp;
        for (let i = 1; i < sequence.raw.length - 1; i++) {
            appended.push(sequence.raw[i], sequence.raw[i + 1], record.opp);
        }
        touchedTris.add(record.triOffset);
        repairedEdges++;
    }

    // TEMP-TJPROBE: records-loop (findSplitSequence) cost
    try {
        (globalThis as unknown as { __pfStageLog?: string[] }).__pfStageLog?.push(
            `  sbtj.recordsLoop=${(performance.now() - __sbtB).toFixed(0)}ms repaired=${repairedEdges}`,
        );
    } catch { /* noop */ }

    if (appended.length === 0) {
        return { indices: outerIndices, repairedEdges: 0, insertedTriangles: 0 };
    }

    const repaired = new Uint32Array(mutable.length + appended.length);
    repaired.set(mutable);
    repaired.set(appended, mutable.length);
    return {
        indices: repaired,
        repairedEdges,
        insertedTriangles: appended.length / 3,
    };
}

function splitTriangleEdgeDeltas(record: BoundaryEdgeRecord, sequence: SplitSequence): Map<number, number> {
    const deltas = new Map<number, number>();
    const addDelta = (a: number, b: number, delta: number) => {
        const key = edgeKey(a, b);
        deltas.set(key, (deltas.get(key) ?? 0) + delta);
    };

    addDelta(record.canonA, record.canonB, -1);
    addDelta(record.canonB, record.oppCanon, -1);
    addDelta(record.oppCanon, record.canonA, -1);

    for (let i = 0; i < sequence.canonical.length - 1; i++) {
        const ca = sequence.canonical[i];
        const cb = sequence.canonical[i + 1];
        addDelta(ca, cb, 1);
        addDelta(cb, record.oppCanon, 1);
        addDelta(record.oppCanon, ca, 1);
    }

    return deltas;
}

function canApplyEdgeDeltas(edgeCounts: Map<number, number>, deltas: Map<number, number>): boolean {
    for (const [key, delta] of deltas) {
        const next = (edgeCounts.get(key) ?? 0) + delta;
        if (next < 0 || next > 2) return false;
    }
    return true;
}

function applyEdgeDeltas(edgeCounts: Map<number, number>, deltas: Map<number, number>): void {
    for (const [key, delta] of deltas) {
        const next = (edgeCounts.get(key) ?? 0) + delta;
        if (next === 0) edgeCounts.delete(key);
        else edgeCounts.set(key, next);
    }
}

function replaceTriangleVertexDeltas(
    record: BoundaryEdgeRecord,
    replaceCanon: number,
    replacementCanon: number,
): Map<number, number> | null {
    const original = [record.canonA, record.canonB, record.oppCanon];
    if (!original.includes(replaceCanon)) return null;
    const replaced = original.map(v => v === replaceCanon ? replacementCanon : v);
    if (replaced[0] === replaced[1] || replaced[1] === replaced[2] || replaced[2] === replaced[0]) return null;

    const deltas = new Map<number, number>();
    const addDelta = (a: number, b: number, delta: number) => {
        const key = edgeKey(a, b);
        deltas.set(key, (deltas.get(key) ?? 0) + delta);
    };

    for (const [a, b] of [[original[0], original[1]], [original[1], original[2]], [original[2], original[0]]] as Array<[number, number]>) {
        addDelta(a, b, -1);
    }
    for (const [a, b] of [[replaced[0], replaced[1]], [replaced[1], replaced[2]], [replaced[2], replaced[0]]] as Array<[number, number]>) {
        addDelta(a, b, 1);
    }
    return deltas;
}

function replacementEdgesOpposeBoundaryOwners(
    record: BoundaryEdgeRecord,
    replaceCanon: number,
    replacementCanon: number,
    boundaryRecordByKey: Map<number, BoundaryEdgeRecord>,
): boolean {
    const replaced = [record.canonA, record.canonB, record.oppCanon]
        .map(vertex => vertex === replaceCanon ? replacementCanon : vertex);
    for (let i = 0; i < 3; i++) {
        const from = replaced[i];
        const to = replaced[(i + 1) % 3];
        if (from !== replacementCanon && to !== replacementCanon) continue;
        const owner = boundaryRecordByKey.get(edgeKey(from, to));
        if (owner && (owner.canonA !== to || owner.canonB !== from)) return false;
    }
    return true;
}

function replaceRawVertexInTriangle(mutable: Uint32Array, triOffset: number, rawTarget: number, rawReplacement: number): boolean {
    for (let i = 0; i < 3; i++) {
        if (mutable[triOffset + i] !== rawTarget) continue;
        mutable[triOffset + i] = rawReplacement;
        return true;
    }
    return false;
}

function canonicalTriangleKey(a: number, b: number, c: number): string {
    const sorted = [a, b, c].sort((x, y) => x - y);
    return `${sorted[0]}:${sorted[1]}:${sorted[2]}`;
}

interface CompactDuplicateCanonicalTrianglesOptions {
    preserveBoundaryEdges?: boolean;
}

export function compactDuplicateCanonicalTriangles(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
    options: CompactDuplicateCanonicalTrianglesOptions = {},
): { indices: Uint32Array; removedTriangles: number } {
    const canonical: CanonicalVertexData = {
        remap: new Map<number, number>(),
        representativeRaw: new Map<number, number>(),
        nextId: 0,
    };
    const keyToId = new Map<string, number>();
    const seen = new Set<string>();
    const kept: number[] = [];
    let removedTriangles = 0;
    const edgeCounts = new Map<number, number>();
    const triangles: Array<{
        raw: [number, number, number];
        canonical: [number, number, number] | null;
        edges: [number, number, number] | null;
        key: string | null;
    }> = [];

    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) {
            triangles.push({ raw: [a, b, c], canonical: null, edges: null, key: null });
            continue;
        }
        const ca = canonicalizeVertex(uvs, a, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cc = canonicalizeVertex(uvs, c, canonical, keyToId, positions, topologyWeldToleranceMm);
        if (ca === cb || cb === cc || ca === cc) {
            triangles.push({ raw: [a, b, c], canonical: null, edges: null, key: null });
            continue;
        }

        const key = canonicalTriangleKey(ca, cb, cc);
        const edges: [number, number, number] = [
            edgeKey(ca, cb),
            edgeKey(cb, cc),
            edgeKey(cc, ca),
        ];
        for (const edge of edges) {
            edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        }
        triangles.push({ raw: [a, b, c], canonical: [ca, cb, cc], edges, key });
    }

    for (const tri of triangles) {
        const [a, b, c] = tri.raw;
        if (!tri.canonical || !tri.edges || !tri.key) {
            removedTriangles++;
            continue;
        }

        const key = tri.key;
        if (seen.has(key)) {
            if (
                options.preserveBoundaryEdges &&
                tri.edges.some(edge => (edgeCounts.get(edge) ?? 0) <= 2)
            ) {
                kept.push(a, b, c);
                continue;
            }
            removedTriangles++;
            for (const edge of tri.edges) {
                const next = (edgeCounts.get(edge) ?? 0) - 1;
                if (next <= 0) edgeCounts.delete(edge);
                else edgeCounts.set(edge, next);
            }
            continue;
        }
        seen.add(key);
        kept.push(a, b, c);
    }

    if (removedTriangles === 0) return { indices, removedTriangles: 0 };
    return { indices: new Uint32Array(kept), removedTriangles };
}

function pruneMultiNonManifoldFanTriangles(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): { indices: Uint32Array; removedTriangles: number } {
    const canonical: CanonicalVertexData = {
        remap: new Map<number, number>(),
        representativeRaw: new Map<number, number>(),
        nextId: 0,
    };
    const keyToId = new Map<string, number>();
    const edgeCounts = new Map<number, number>();
    const tris: Array<{
        raw: [number, number, number];
        canonical: [number, number, number];
        edges: [number, number, number];
        remove: boolean;
    }> = [];

    for (let t = 0; t < indices.length; t += 3) {
        const raw: [number, number, number] = [indices[t], indices[t + 1], indices[t + 2]];
        const [a, b, c] = raw;
        if (a === b || b === c || a === c) continue;
        const ca = canonicalizeVertex(uvs, a, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cc = canonicalizeVertex(uvs, c, canonical, keyToId, positions, topologyWeldToleranceMm);
        if (ca === cb || cb === cc || ca === cc) continue;
        const edges: [number, number, number] = [
            edgeKey(ca, cb),
            edgeKey(cb, cc),
            edgeKey(cc, ca),
        ];
        for (const edge of edges) {
            edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        }
        tris.push({ raw, canonical: [ca, cb, cc], edges, remove: false });
    }

    let removedTriangles = 0;
    for (const tri of tris) {
        const nonManifoldEdgeCount = tri.edges.filter(edge => (edgeCounts.get(edge) ?? 0) > 2).length;
        if (nonManifoldEdgeCount < 2) continue;

        tri.remove = true;
        removedTriangles++;
        for (const edge of tri.edges) {
            edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) - 1);
        }
    }

    if (removedTriangles === 0) return { indices, removedTriangles: 0 };
    const kept: number[] = [];
    for (const tri of tris) {
        if (tri.remove) continue;
        kept.push(...tri.raw);
    }
    return { indices: new Uint32Array(kept), removedTriangles };
}

function pruneCrowdedSideNonManifoldEdgeFans(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): { indices: Uint32Array; removedTriangles: number } {
    const { edgeCounts, edgeRecordsByKey } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
        true,
    );
    const removeTriOffsets = new Set<number>();

    for (const [key, count] of edgeCounts) {
        if (count <= 2) continue;
        const records = edgeRecordsByKey.get(key);
        if (!records) continue;
        const available = records.filter(record => !removeTriOffsets.has(record.triOffset));
        if (available.length <= 2) continue;

        const positive: Array<{ record: BoundaryEdgeRecord; strength: number }> = [];
        const negative: Array<{ record: BoundaryEdgeRecord; strength: number }> = [];
        const neutral: Array<{ record: BoundaryEdgeRecord; strength: number }> = [];

        for (const record of available) {
            const cross = uvSideCross(uvs, record.rawA, record.rawB, record.opp);
            const entry = { record, strength: Math.abs(cross) };
            if (cross > 1e-14) positive.push(entry);
            else if (cross < -1e-14) negative.push(entry);
            else neutral.push(entry);
        }

        const markExtras = (group: Array<{ record: BoundaryEdgeRecord; strength: number }>) => {
            if (group.length <= 1) return;
            group.sort((a, b) => b.strength - a.strength);
            for (let i = 1; i < group.length; i++) {
                removeTriOffsets.add(group[i].record.triOffset);
            }
        };

        if (positive.length > 0 && negative.length > 0) {
            markExtras(positive);
            markExtras(negative);
        } else {
            const all = [...positive, ...negative, ...neutral].sort((a, b) => b.strength - a.strength);
            for (let i = 2; i < all.length; i++) {
                removeTriOffsets.add(all[i].record.triOffset);
            }
        }
    }

    if (removeTriOffsets.size === 0) return { indices, removedTriangles: 0 };
    const kept: number[] = [];
    let removedTriangles = 0;
    for (let t = 0; t < indices.length; t += 3) {
        if (removeTriOffsets.has(t)) {
            removedTriangles++;
            continue;
        }
        kept.push(indices[t], indices[t + 1], indices[t + 2]);
    }
    return { indices: new Uint32Array(kept), removedTriangles };
}

function splitNonManifoldTJunctionPass(
    outerIndices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
    segmentParamFactory?: (rawA: number, rawB: number) => (rawVertex: number) => number | null,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const {
        records,
        boundaryNeighbors,
        representativeRaw,
        edgeCounts,
        edgeRecordsByKey,
    } = collectBoundaryEdges(
        outerIndices,
        outerIndices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
        true,
    );
    const mutable = new Uint32Array(outerIndices);
    const appended: number[] = [];
    const touchedTris = new Set<number>();
    const boundaryRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) boundaryRecordByKey.set(record.key, record);
    let repairedEdges = 0;

    for (const [key, count] of Array.from(edgeCounts.entries())) {
        __tjAbort('splitNonManifoldTJunctionPass-edges'); // TEMP-TJPROBE
        if (count <= 2) continue;
        const records = edgeRecordsByKey.get(key);
        if (!records) continue;

        for (const record of records) {
            __tjAbort('splitNonManifoldTJunctionPass-records'); // TEMP-TJPROBE
            if (touchedTris.has(record.triOffset)) continue;
            const { rawA, rawB } = record;
            if (!isOuterMidVertex(uvs, rawA) || !isOuterMidVertex(uvs, rawB)) continue;

            const sequence = findSplitSequence(
                uvs,
                rawA,
                rawB,
                record.canonA,
                record.canonB,
                boundaryNeighbors,
                representativeRaw,
                segmentParamFactory?.(rawA, rawB),
            );
            if (!sequence) continue;

            if (!splitPathOpposesBoundaryOwners(sequence, boundaryRecordByKey)) continue;

            const deltas = splitTriangleEdgeDeltas(record, sequence);
            if (!canApplyEdgeDeltas(edgeCounts, deltas)) continue;

            mutable[record.triOffset] = sequence.raw[0];
            mutable[record.triOffset + 1] = sequence.raw[1];
            mutable[record.triOffset + 2] = record.opp;
            for (let i = 1; i < sequence.raw.length - 1; i++) {
                appended.push(sequence.raw[i], sequence.raw[i + 1], record.opp);
            }
            applyEdgeDeltas(edgeCounts, deltas);
            touchedTris.add(record.triOffset);
            repairedEdges++;
            break;
        }
    }

    if (appended.length === 0) {
        return { indices: outerIndices, repairedEdges: 0, insertedTriangles: 0 };
    }

    const repaired = new Uint32Array(mutable.length + appended.length);
    repaired.set(mutable);
    repaired.set(appended, mutable.length);
    return {
        indices: repaired,
        repairedEdges,
        insertedTriangles: appended.length / 3,
    };
}

export function splitNonManifoldBoundaryTJunctions(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
    maxPasses: number = 3,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    let current = indices;
    let repairedEdges = 0;
    let insertedTriangles = 0;
    for (let pass = 0; pass < maxPasses; pass++) {
        let result = splitNonManifoldTJunctionPass(
            current,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (result.repairedEdges === 0 && positions) {
            result = splitNonManifoldTJunctionPass(
                current,
                uvs,
                positions,
                topologyWeldToleranceMm,
                (rawA, rawB) => (rawVertex) =>
                    pointNearSegmentParam3D(positions, rawA, rawB, rawVertex, topologyWeldToleranceMm),
            );
        }
        if (result.repairedEdges === 0) break;
        current = result.indices;
        repairedEdges += result.repairedEdges;
        insertedTriangles += result.insertedTriangles;
    }
    return { indices: current, repairedEdges, insertedTriangles };
}

function snapNonManifoldEndpointToBoundaryPass(
    outerIndices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const {
        records,
        boundaryNeighbors,
        representativeRaw,
        edgeCounts,
        edgeRecordsByKey,
    } = collectBoundaryEdges(
        outerIndices,
        outerIndices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
        true,
    );
    const mutable = new Uint32Array(outerIndices);
    const touchedTris = new Set<number>();
    const boundaryRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) boundaryRecordByKey.set(record.key, record);
    let repairedEdges = 0;

    for (const [key, count] of Array.from(edgeCounts.entries())) {
        if (count <= 2) continue;
        const records = edgeRecordsByKey.get(key);
        if (!records) continue;

        for (const record of records) {
            if (touchedTris.has(record.triOffset)) continue;
            const candidates: Array<{
                replaceRaw: number;
                replaceCanon: number;
                replacementRaw: number;
                replacementCanon: number;
            }> = [];

            const aNeighbors = boundaryNeighbors.get(record.canonA);
            if (aNeighbors) {
                for (const n of aNeighbors) {
                    if (n === record.canonB) continue;
                    const rawN = representativeRaw.get(n);
                    if (rawN !== undefined && canUseAsNearDuplicateEndpoint(uvs, rawN, record.rawB)) {
                        candidates.push({
                            replaceRaw: record.rawB,
                            replaceCanon: record.canonB,
                            replacementRaw: rawN,
                            replacementCanon: n,
                        });
                    }
                }
            }

            const bNeighbors = boundaryNeighbors.get(record.canonB);
            if (bNeighbors) {
                for (const n of bNeighbors) {
                    if (n === record.canonA) continue;
                    const rawN = representativeRaw.get(n);
                    if (rawN !== undefined && canUseAsNearDuplicateEndpoint(uvs, rawN, record.rawA)) {
                        candidates.push({
                            replaceRaw: record.rawA,
                            replaceCanon: record.canonA,
                            replacementRaw: rawN,
                            replacementCanon: n,
                        });
                    }
                }
            }

            for (const candidate of candidates) {
                if (!replacementEdgesOpposeBoundaryOwners(
                    record,
                    candidate.replaceCanon,
                    candidate.replacementCanon,
                    boundaryRecordByKey,
                )) continue;
                const deltas = replaceTriangleVertexDeltas(
                    record,
                    candidate.replaceCanon,
                    candidate.replacementCanon,
                );
                if (!deltas || !canApplyEdgeDeltas(edgeCounts, deltas)) continue;
                if (!replaceRawVertexInTriangle(
                    mutable,
                    record.triOffset,
                    candidate.replaceRaw,
                    candidate.replacementRaw,
                )) continue;

                applyEdgeDeltas(edgeCounts, deltas);
                touchedTris.add(record.triOffset);
                repairedEdges++;
                break;
            }

            if (touchedTris.has(record.triOffset)) break;
        }
    }

    if (repairedEdges === 0) {
        return { indices: outerIndices, repairedEdges: 0, insertedTriangles: 0 };
    }

    return { indices: mutable, repairedEdges, insertedTriangles: 0 };
}

function collectJoinBoundaryEdges(
    indices: Uint32Array,
    uvs: Float32Array,
): {
    records: BoundaryEdgeRecord[];
    boundaryKeys: Set<number>;
    boundaryNeighbors: Map<number, Set<number>>;
    representativeRaw: Map<number, number>;
} {
    const edgeCounts = new Map<number, number>();
    const edgeSamples = new Map<number, BoundaryEdgeRecord>();
    const canonical: CanonicalVertexData = {
        remap: new Map<number, number>(),
        representativeRaw: new Map<number, number>(),
        nextId: 0,
    };
    const keyToId = new Map<string, number>();

    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) continue;

        const triEdges: Array<[number, number, number]> = [
            [a, b, c],
            [b, c, a],
            [c, a, b],
        ];
        for (const [rawA, rawB, opp] of triEdges) {
            const join = surfaceJoinKey(uvs, rawA);
            if (!join || surfaceJoinKey(uvs, rawB) !== join) continue;
            const canonA = canonicalizeJoinVertex(uvs, rawA, canonical, keyToId);
            const canonB = canonicalizeJoinVertex(uvs, rawB, canonical, keyToId);
            if (canonA === null || canonB === null || canonA === canonB) continue;
            const key = edgeKey(canonA, canonB);
            edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
            if (!edgeSamples.has(key)) {
                edgeSamples.set(key, { key, triOffset: t, rawA, rawB, canonA, canonB, opp, oppCanon: -1 });
            }
        }
    }

    const records: BoundaryEdgeRecord[] = [];
    const boundaryKeys = new Set<number>();
    const boundaryNeighbors = new Map<number, Set<number>>();
    for (const [key, count] of edgeCounts) {
        if (count !== 1) continue;
        const sample = edgeSamples.get(key);
        if (!sample) continue;
        records.push(sample);
        boundaryKeys.add(key);
        let aNeighbors = boundaryNeighbors.get(sample.canonA);
        if (!aNeighbors) {
            aNeighbors = new Set<number>();
            boundaryNeighbors.set(sample.canonA, aNeighbors);
        }
        aNeighbors.add(sample.canonB);
        let bNeighbors = boundaryNeighbors.get(sample.canonB);
        if (!bNeighbors) {
            bNeighbors = new Set<number>();
            boundaryNeighbors.set(sample.canonB, bNeighbors);
        }
        bNeighbors.add(sample.canonA);
    }

    return { records, boundaryKeys, boundaryNeighbors, representativeRaw: canonical.representativeRaw };
}

function findJoinSplitSequence(
    uvs: Float32Array,
    rawA: number,
    rawB: number,
    canonA: number,
    canonB: number,
    boundaryNeighbors: Map<number, Set<number>>,
    representativeRaw: Map<number, number>,
): SplitSequence | null {
    const MAX_SEGMENTS = 32;
    interface State {
        canonical: number;
        rawPath: number[];
        canonicalPath: number[];
        s: number;
    }

    const startNeighbors = boundaryNeighbors.get(canonA);
    if (!startNeighbors) return null;

    const queue: State[] = [];
    for (const n of startNeighbors) {
        if (n === canonB) continue;
        const rawN = representativeRaw.get(n);
        if (rawN === undefined) continue;
        const s = pointOnJoinSegmentParam(uvs, rawA, rawB, rawN);
        if (s === null) continue;
        queue.push({
            canonical: n,
            rawPath: [rawA, rawN],
            canonicalPath: [canonA, n],
            s,
        });
    }

    while (queue.length > 0) {
        __tjAbort('findJoinSplitSequence-bfs'); // TEMP-TJPROBE
        const state = queue.shift()!;
        if (state.rawPath.length > MAX_SEGMENTS) continue;

        const neighbors = boundaryNeighbors.get(state.canonical);
        if (!neighbors) continue;
        for (const n of neighbors) {
            if (n === canonB) {
                return {
                    raw: [...state.rawPath, rawB],
                    canonical: [...state.canonicalPath, canonB],
                };
            }
            if (state.canonicalPath.includes(n)) continue;
            const rawN = representativeRaw.get(n);
            if (rawN === undefined) continue;
            const s = pointOnJoinSegmentParam(uvs, rawA, rawB, rawN);
            if (s === null || s <= state.s + 1e-6) continue;
            queue.push({
                canonical: n,
                rawPath: [...state.rawPath, rawN],
                canonicalPath: [...state.canonicalPath, n],
                s,
            });
        }
    }

    return null;
}

function splitSurfaceBoundaryTJunctionPass(
    indices: Uint32Array,
    uvs: Float32Array,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const { records, boundaryKeys, boundaryNeighbors, representativeRaw } = collectJoinBoundaryEdges(
        indices,
        uvs,
    );
    const mutable = new Uint32Array(indices);
    const appended: number[] = [];
    const touchedTris = new Set<number>();
    let repairedEdges = 0;

    for (const record of records) {
        if (touchedTris.has(record.triOffset)) continue;

        const sequence = findJoinSplitSequence(
            uvs,
            record.rawA,
            record.rawB,
            record.canonA,
            record.canonB,
            boundaryNeighbors,
            representativeRaw,
        );
        if (!sequence) continue;

        let closesSplitSide = true;
        for (let i = 0; i < sequence.canonical.length - 1; i++) {
            if (!boundaryKeys.has(edgeKey(sequence.canonical[i], sequence.canonical[i + 1]))) {
                closesSplitSide = false;
                break;
            }
        }
        if (!closesSplitSide) continue;

        mutable[record.triOffset] = sequence.raw[0];
        mutable[record.triOffset + 1] = sequence.raw[1];
        mutable[record.triOffset + 2] = record.opp;
        for (let i = 1; i < sequence.raw.length - 1; i++) {
            appended.push(sequence.raw[i], sequence.raw[i + 1], record.opp);
        }
        touchedTris.add(record.triOffset);
        repairedEdges++;
    }

    if (appended.length === 0) {
        return { indices, repairedEdges: 0, insertedTriangles: 0 };
    }

    const repaired = new Uint32Array(mutable.length + appended.length);
    repaired.set(mutable);
    repaired.set(appended, mutable.length);
    return {
        indices: repaired,
        repairedEdges,
        insertedTriangles: appended.length / 3,
    };
}

interface LoopPoint {
    vertex: number;
    u: number;
    t: number;
}

function unwrapLoopPoints(uvs: Float32Array, loop: number[]): LoopPoint[] {
    const points: LoopPoint[] = [];
    let offset = 0;
    let prevU = uvs[loop[0] * 3];
    points.push({ vertex: loop[0], u: prevU, t: uvs[loop[0] * 3 + 1] });
    for (let i = 1; i < loop.length; i++) {
        const rawU = uvs[loop[i] * 3];
        let u = rawU + offset;
        const delta = u - prevU;
        if (delta > 0.5) {
            offset -= 1;
            u -= 1;
        } else if (delta < -0.5) {
            offset += 1;
            u += 1;
        }
        points.push({ vertex: loop[i], u, t: uvs[loop[i] * 3 + 1] });
        prevU = u;
    }
    return points;
}

function polygonArea(points: LoopPoint[]): number {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        sum += (a.u * b.t) - (b.u * a.t);
    }
    return sum * 0.5;
}

function localCross(a: LoopPoint, b: LoopPoint, c: LoopPoint): number {
    return (b.u - a.u) * (c.t - a.t) - (c.u - a.u) * (b.t - a.t);
}

function emitLocalTriCCW(buf: number[], a: LoopPoint, b: LoopPoint, c: LoopPoint): void {
    const cross = localCross(a, b, c);
    if (Math.abs(cross) < 1e-14) return;
    if (cross > 0) buf.push(a.vertex, b.vertex, c.vertex);
    else buf.push(a.vertex, c.vertex, b.vertex);
}

function pointInTriangle2D(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
): boolean {
    const ab = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const bc = (cx - bx) * (py - by) - (cy - by) * (px - bx);
    const ca = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
    return ab >= -1e-12 && bc >= -1e-12 && ca >= -1e-12;
}

function triangulateLoop(uvs: Float32Array, loopRaw: number[]): number[] {
    if (loopRaw.length < 3) return [];
    const unwrapped = unwrapLoopPoints(uvs, loopRaw);
    const loop = polygonArea(unwrapped) >= 0
        ? [...unwrapped]
        : [...unwrapped].reverse();
    if (Math.abs(polygonArea(loop)) < 1e-14) return [];

    const remaining = [...loop];
    const triangles: number[] = [];
    let guard = 0;
    while (remaining.length > 3 && guard++ < loop.length * loop.length) {
        let clipped = false;
        for (let i = 0; i < remaining.length; i++) {
            const prev = remaining[(i - 1 + remaining.length) % remaining.length];
            const curr = remaining[i];
            const next = remaining[(i + 1) % remaining.length];
            if (localCross(prev, curr, next) <= 1e-14) continue;

            let containsPoint = false;
            for (const v of remaining) {
                if (v === prev || v === curr || v === next) continue;
                if (pointInTriangle2D(v.u, v.t, prev.u, prev.t, curr.u, curr.t, next.u, next.t)) {
                    containsPoint = true;
                    break;
                }
            }
            if (containsPoint) continue;

            emitLocalTriCCW(triangles, prev, curr, next);
            remaining.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) return [];
    }

    if (remaining.length === 3) {
        emitLocalTriCCW(triangles, remaining[0], remaining[1], remaining[2]);
    }
    return triangles;
}

function projectedLoopPoints(positions: Float32Array, loop: number[]): LoopPoint[] {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i] * 3;
        const b = loop[(i + 1) % loop.length] * 3;
        const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
        const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
        nx += (ay - by) * (az + bz);
        ny += (az - bz) * (ax + bx);
        nz += (ax - bx) * (ay + by);
    }
    const axAbs = Math.abs(nx), ayAbs = Math.abs(ny), azAbs = Math.abs(nz);
    const dropAxis = axAbs >= ayAbs && axAbs >= azAbs ? 0 : ayAbs >= azAbs ? 1 : 2;
    return loop.map(vertex => {
        const base = vertex * 3;
        if (dropAxis === 0) return { vertex, u: positions[base + 1], t: positions[base + 2] };
        if (dropAxis === 1) return { vertex, u: positions[base], t: positions[base + 2] };
        return { vertex, u: positions[base], t: positions[base + 1] };
    });
}

function triangulateProjectedLoop(positions: Float32Array, loopRaw: number[]): number[] {
    if (loopRaw.length < 3) return [];
    const projected = projectedLoopPoints(positions, loopRaw);
    const loop = polygonArea(projected) >= 0
        ? [...projected]
        : [...projected].reverse();
    if (Math.abs(polygonArea(loop)) < 1e-14) return [];

    const remaining = [...loop];
    const triangles: number[] = [];
    let guard = 0;
    while (remaining.length > 3 && guard++ < loop.length * loop.length) {
        let clipped = false;
        for (let i = 0; i < remaining.length; i++) {
            const prev = remaining[(i - 1 + remaining.length) % remaining.length];
            const curr = remaining[i];
            const next = remaining[(i + 1) % remaining.length];
            if (localCross(prev, curr, next) <= 1e-14) continue;

            let containsPoint = false;
            for (const v of remaining) {
                if (v === prev || v === curr || v === next) continue;
                if (pointInTriangle2D(v.u, v.t, prev.u, prev.t, curr.u, curr.t, next.u, next.t)) {
                    containsPoint = true;
                    break;
                }
            }
            if (containsPoint) continue;

            emitLocalTriCCW(triangles, prev, curr, next);
            remaining.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) return [];
    }

    if (remaining.length === 3) {
        emitLocalTriCCW(triangles, remaining[0], remaining[1], remaining[2]);
    }
    return triangles;
}

function orientedLoopPoints(points: LoopPoint[]): LoopPoint[] {
    return polygonArea(points) >= 0 ? [...points] : [...points].reverse();
}

function safeTriangleEdgeKeys(
    state: CanonicalEdgeState,
    tri: [number, number, number],
    pending: Map<number, number>,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): number[] | null {
    const [a, b, c] = tri;
    const ca = canonicalizeVertex(uvs, a, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
    const cb = canonicalizeVertex(uvs, b, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
    const cc = canonicalizeVertex(uvs, c, state.canonical, state.keyToId, positions, topologyWeldToleranceMm);
    if (ca === cb || cb === cc || ca === cc) return null;

    const keys = [
        edgeKey(ca, cb),
        edgeKey(cb, cc),
        edgeKey(cc, ca),
    ];
    const local = new Map<number, number>();
    for (const key of keys) {
        local.set(key, (local.get(key) ?? 0) + 1);
        const nextCount = (state.edgeCounts.get(key) ?? 0) + (pending.get(key) ?? 0) + (local.get(key) ?? 0);
        if (nextCount > 2) return null;
    }

    return keys;
}

function triangulatePointsManifoldSafe(
    pointsRaw: LoopPoint[],
    state: CanonicalEdgeState,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): number[] | null {
    if (pointsRaw.length < 3) return null;
    const loop = orientedLoopPoints(pointsRaw);
    if (Math.abs(polygonArea(loop)) < 1e-14) return null;

    const remaining = [...loop];
    const triangles: number[] = [];
    const pending = new Map<number, number>();
    const addPending = (keys: number[]) => {
        for (const key of keys) pending.set(key, (pending.get(key) ?? 0) + 1);
    };

    let guard = 0;
    while (remaining.length > 3 && guard++ < loop.length * loop.length) {
        let clipped = false;
        for (let i = 0; i < remaining.length; i++) {
            const prev = remaining[(i - 1 + remaining.length) % remaining.length];
            const curr = remaining[i];
            const next = remaining[(i + 1) % remaining.length];
            if (localCross(prev, curr, next) <= 1e-14) continue;

            let containsPoint = false;
            for (const v of remaining) {
                if (v === prev || v === curr || v === next) continue;
                if (pointInTriangle2D(v.u, v.t, prev.u, prev.t, curr.u, curr.t, next.u, next.t)) {
                    containsPoint = true;
                    break;
                }
            }
            if (containsPoint) continue;

            const tri: [number, number, number] = [prev.vertex, curr.vertex, next.vertex];
            const keys = safeTriangleEdgeKeys(state, tri, pending, uvs, positions, topologyWeldToleranceMm);
            if (!keys) continue;

            triangles.push(...tri);
            addPending(keys);
            remaining.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) return null;
    }

    if (remaining.length === 3) {
        const tri: [number, number, number] = [
            remaining[0].vertex,
            remaining[1].vertex,
            remaining[2].vertex,
        ];
        const keys = safeTriangleEdgeKeys(state, tri, pending, uvs, positions, topologyWeldToleranceMm);
        if (!keys) return null;
        triangles.push(...tri);
        addPending(keys);
    }

    for (const [key, increment] of pending) {
        state.edgeCounts.set(key, (state.edgeCounts.get(key) ?? 0) + increment);
    }
    return triangles;
}

function triangulateLoopManifoldSafe(
    uvs: Float32Array,
    loopRaw: number[],
    state: CanonicalEdgeState,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): { triangles: number[]; usedProjection: boolean } | null {
    const uvTriangulation = triangulatePointsManifoldSafe(
        unwrapLoopPoints(uvs, loopRaw),
        state,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    if (uvTriangulation) return { triangles: uvTriangulation, usedProjection: false };

    if (!positions) return null;
    const projectedTriangulation = triangulatePointsManifoldSafe(
        projectedLoopPoints(positions, loopRaw),
        state,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    return projectedTriangulation ? { triangles: projectedTriangulation, usedProjection: true } : null;
}

function averageLoopCenter(
    uvs: Float32Array,
    positions: Float32Array,
    loop: number[],
): { uv: [number, number, number]; position: [number, number, number] } {
    const unwrapped = unwrapLoopPoints(uvs, loop);
    let sumU = 0, sumT = 0;
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const point of unwrapped) {
        sumU += point.u;
        sumT += point.t;
        const base = point.vertex * 3;
        sumX += positions[base] ?? 0;
        sumY += positions[base + 1] ?? 0;
        sumZ += positions[base + 2] ?? 0;
    }
    const inv = 1 / Math.max(1, loop.length);
    const surface = Math.round(uvs[loop[0] * 3 + 2] ?? 0);
    const u = ((sumU * inv) % 1 + 1) % 1;
    return {
        uv: [u, sumT * inv, surface],
        position: [sumX * inv, sumY * inv, sumZ * inv],
    };
}

function outerJoinLoopCenter(
    uvs: Float32Array,
    positions: Float32Array,
    loop: number[],
): { uv: [number, number, number]; position: [number, number, number] } | null {
    if (loop.length < 3) return null;
    const join = surfaceJoinKey(uvs, loop[0]);
    if (join !== 'outerTop' && join !== 'outerBottom') return null;
    for (const vertexIdx of loop) {
        if (surfaceJoinKey(uvs, vertexIdx) !== join) return null;
    }

    const center = averageLoopCenter(uvs, positions, loop);
    let maxEdge = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i] * 3;
        const b = loop[(i + 1) % loop.length] * 3;
        maxEdge = Math.max(
            maxEdge,
            Math.hypot(
                (positions[a] ?? 0) - (positions[b] ?? 0),
                (positions[a + 1] ?? 0) - (positions[b + 1] ?? 0),
                (positions[a + 2] ?? 0) - (positions[b + 2] ?? 0),
            ),
        );
    }
    if (maxEdge <= 1e-9) return null;

    const [x, y, z] = center.position;
    const radial = Math.hypot(x, y);
    if (radial <= 1e-9) return null;
    const offset = Math.min(maxEdge * 0.4, radial * 0.05);
    const ux = x / radial;
    const uy = y / radial;
    const capSurface = join === 'outerTop' ? 2 : 3;
    return {
        uv: [center.uv[0], center.uv[1], capSurface],
        position: [x - ux * offset, y - uy * offset, z],
    };
}

/**
 * Center-fan a boundary loop where each spoke triangle traverses its boundary
 * edge OPPOSITE to the owning wall triangle's half-edge (record.canonA→canonB),
 * so the cap is orientation-consistent with its neighbor. This is the same rule
 * the cross-surface filler enforces; it replaces the UV-area `emitTriCCW` fan
 * whose winding ignored the owner direction and produced the genuine winding
 * flips localized to the boundary-fill stage.
 *
 * For any loop edge that has no owning boundary record (defensive — loop edges
 * are boundary edges and normally always do), the spoke falls back to the
 * UV-CCW emit so loop coverage is never reduced relative to the prior behavior.
 */
function buildOwnerOpposedCenterFan(
    uvs: Float32Array,
    loopRaw: number[],
    centerVertex: number,
    edgeRecordByKey: Map<number, BoundaryEdgeRecord>,
    edgeState: CanonicalEdgeState,
    positions: Float32Array,
    topologyWeldToleranceMm: number,
): number[] {
    if (loopRaw.length < 3) return [];
    const tris: number[] = [];
    for (let i = 0; i < loopRaw.length; i++) {
        const a = loopRaw[i];
        const b = loopRaw[(i + 1) % loopRaw.length];
        const ca = canonicalizeVertex(uvs, a, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
        const record = edgeRecordByKey.get(edgeKey(ca, cb));
        if (record) {
            tris.push(record.rawB, record.rawA, centerVertex);
        } else {
            emitTriCCW(tris, a, b, centerVertex, uvs);
        }
    }
    return tris;
}

function loopHasVertexOnNonAdjacentSegment(uvs: Float32Array, loopRaw: number[]): boolean {
    if (loopRaw.length < 4) return false;
    for (let i = 0; i < loopRaw.length; i++) {
        const a = loopRaw[i];
        const b = loopRaw[(i + 1) % loopRaw.length];
        for (let j = 0; j < loopRaw.length; j++) {
            const p = loopRaw[j];
            if (p === a || p === b) continue;
            if (pointOnSegmentParam(uvs, a, b, p) !== null) return true;
        }
    }
    return false;
}

export function fillSameSurfaceBoundaryLoopsWithCenters(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopVertexFillResult {
    const { records, boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    // Owner half-edge direction per boundary edge: the one wall triangle that owns
    // each boundary edge traverses it canonA→canonB. A fill triangle covering that
    // edge MUST traverse it canonB→canonA, otherwise the cap is topologically
    // present but orientation-inconsistent with its neighbor (the genuine winding
    // flips localized to this stage). This mirrors the proven cross-surface filler.
    const edgeRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) {
        edgeRecordByKey.set(record.key, record);
    }
    const appended: number[] = [];
    const loops = Array.from(orderedClosedLoops(boundaryNeighbors, representativeRaw));
    // TEMP-LOOPSIZE-PROBE: measure loop-size distribution before the O(N^3) ear-clip runs.
    // Uses console.warn (streams live to the harness) — __pfStageLog is only read after the
    // test ends, which never happens when this stage hangs into the 900s cap.
    try {
        const sizes = loops.map((l) => l.length).sort((a, b) => b - a);
        const total = sizes.reduce((s, n) => s + n, 0);
        const buckets = { lt16: 0, lt64: 0, lt256: 0, lt1k: 0, lt4k: 0, ge4k: 0 };
        for (const n of sizes) {
            if (n < 16) buckets.lt16++; else if (n < 64) buckets.lt64++;
            else if (n < 256) buckets.lt256++; else if (n < 1024) buckets.lt1k++;
            else if (n < 4096) buckets.lt4k++; else buckets.ge4k++;
        }
        console.warn(
            `[LOOPSIZE] loops=${loops.length} totalVerts=${total} max=${sizes[0] ?? 0} ` +
            `top10=[${sizes.slice(0, 10).join(',')}] buckets=${JSON.stringify(buckets)}`,
        );
    } catch { /* noop */ }
    // Pre-allocate the growth buffers ONCE. The old implementation rebuilt the entire
    // vertex arrays (new Float32Array(...), ~2.85M floats on a feature-dense mesh) on
    // every center-fan loop, making this O(loops × vertices) — billions of element
    // copies that stalled the export indefinitely. Each center vertex is now written
    // in place and exposed downstream via an O(1) subarray view; one slice() at the
    // end compacts the result. At most one center is inserted per loop, so the loop
    // count bounds the extra capacity.
    const maxCenters = loops.length;
    const uvBuf = new Float32Array(uvs.length + maxCenters * 3);
    uvBuf.set(uvs);
    const posBuf = new Float32Array(positions.length + maxCenters * 3);
    posBuf.set(positions);
    let writtenVerts = uvs.length / 3;
    let currentUvs: Float32Array = uvBuf.subarray(0, uvs.length);
    let currentPositions: Float32Array = posBuf.subarray(0, positions.length);
    let filledLoops = 0;
    let insertedVertices = 0;
    let attemptedLoops = 0;
    let emptyTriangulations = 0;
    let unsafeLoops = 0;
    const edgeState = buildCanonicalEdgeState(indices, currentUvs, currentPositions, topologyWeldToleranceMm);

    // The manifold-safe ear-clip (triangulatePointsManifoldSafe) is O(N^3) in the loop
    // vertex count: an outer clip pass (up to N) x an inner ear scan (N) x a
    // point-in-triangle containment scan (N). On feature-dense meshes the refined outer
    // wall produces boundary loops with tens of thousands of vertices, which makes this
    // run effectively forever (the measured tail hang). Above this size we skip the
    // ear-clip and go straight to the O(N) center-fan path, which still closes the loop.
    const EAR_CLIP_MAX_LOOP = 512;

    // TEMP-LOOPPROG-PROBE: stream per-loop progress so a stall is attributable to a loop index.
    const __progStart = performance.now();
    let __loopIdx = 0;
    let __earClipped = 0;
    for (const loop of loops) {
        if ((__loopIdx++ & 0x3ff) === 0) {
            console.warn(
                `[LOOPPROG] idx=${__loopIdx}/${loops.length} t=${(performance.now() - __progStart).toFixed(0)}ms ` +
                `attempted=${attemptedLoops} earClipped=${__earClipped} filled=${filledLoops} ` +
                `inserted=${insertedVertices} unsafe=${unsafeLoops}`,
            );
        }
        if (!sameSurfaceLoop(currentUvs, loop)) continue;
        attemptedLoops++;
        if (loop.length <= EAR_CLIP_MAX_LOOP) __earClipped++;
        if (loopHasVertexOnNonAdjacentSegment(currentUvs, loop)) {
            const ordered = loop.length === 4
                ? loopOrderOpposingBoundaryRecords(
                    loop,
                    edgeRecordByKey,
                    edgeState,
                    currentUvs,
                    currentPositions,
                    topologyWeldToleranceMm,
                )
                : null;
            if (ordered) {
                const [a, b, c, d] = ordered;
                const spikeQuadFill = [b, a, d, b, d, c];
                if (addTriangleEdgesIfManifoldSafe(edgeState, spikeQuadFill, currentUvs, currentPositions, topologyWeldToleranceMm)) {
                    const triStart = indices.length / 3 + appended.length / 3;
                    appended.push(...spikeQuadFill);
                    filledLoops++;
                    try {
                        const global = globalThis as unknown as { __pfEnableWindingStageDiagnostics?: boolean };
                        if (global.__pfEnableWindingStageDiagnostics) {
                            console.warn(
                                `[FILL-SPIKE-QUAD] idx=${__loopIdx - 1} triStart=${triStart} ` +
                                `loop=[${loop.join(',')}] ordered=[${ordered.join(',')}] ` +
                                `tris=[${spikeQuadFill.slice(0, 3).join(',')}|${spikeQuadFill.slice(3, 6).join(',')}]`,
                            );
                        }
                    } catch { /* noop */ }
                    continue;
                }
            }
            try {
                const global = globalThis as unknown as { __pfEnableWindingStageDiagnostics?: boolean };
                if (global.__pfEnableWindingStageDiagnostics) {
                    console.warn(`[FILL-CENTER-FALLBACK] idx=${__loopIdx - 1} reason=spike-quad-unsafe loop=[${loop.join(',')}]`);
                }
            } catch { /* noop */ }
        }

        // Owner-opposed ear-clip (no center vertex): order the loop so every edge
        // opposes its owning wall triangle, then triangulate preserving that
        // winding. This replaces the prior UV-area ear-clip whose winding ignored
        // the owner direction and produced the stage's genuine winding flips.
        // Manifold-safety is gated on the whole batch; on failure we fall through
        // to the owner-opposite center fan, so loop coverage is preserved.
        if (loop.length <= EAR_CLIP_MAX_LOOP) {
            const ordered = loopOrderOpposingBoundaryRecords(
                loop,
                edgeRecordByKey,
                edgeState,
                currentUvs,
                currentPositions,
                topologyWeldToleranceMm,
            );
            if (ordered) {
                const orderedTris = triangulateProjectedLoopMinimizingAspect(currentPositions, ordered);
                const projectedAspect = orderedTris.length > 0
                    ? projectedFillMaxAspect3D(currentPositions, orderedTris)
                    : Number.POSITIVE_INFINITY;
                const centerFanAspect = averageCenterFanMaxAspect3D(currentPositions, loop);
                const projectedIsPreferable =
                    orderedTris.length > 0 &&
                    (
                        projectedAspect <= PROJECTED_LOOP_FILL_MAX_ASPECT ||
                        projectedAspect <= centerFanAspect
                    );
                if (
                    projectedIsPreferable &&
                    addTriangleEdgesIfManifoldSafe(edgeState, orderedTris, currentUvs, currentPositions, topologyWeldToleranceMm)
                ) {
                    try {
                        const global = globalThis as unknown as { __pfEnableLoopFillDiagnostics?: boolean };
                        if (global.__pfEnableLoopFillDiagnostics) {
                            console.warn(
                                `[SAME-SURFACE-FILL] attempt=${attemptedLoops - 1} mode=ear ` +
                                `triStart=${indices.length / 3 + appended.length / 3} len=${ordered.length} ` +
                                `aspect=${projectedAspect.toFixed(6)} centerAspect=${centerFanAspect.toFixed(6)} ` +
                                `loop=[${ordered.join(',')}]`,
                            );
                        }
                    } catch { /* noop */ }
                    appended.push(...orderedTris);
                    filledLoops++;
                    continue;
                }
            }
        }

        const centerFanAspect = averageCenterFanMaxAspect3D(currentPositions, loop);
        if (loop.length > 4 && centerFanAspect > PROJECTED_LOOP_FILL_MAX_ASPECT) {
            unsafeLoops++;
            continue;
        }

        const center = averageLoopCenter(currentUvs, currentPositions, loop);
        const centerVertex = writtenVerts;
        const base = centerVertex * 3;
        uvBuf[base] = center.uv[0];
        uvBuf[base + 1] = center.uv[1];
        uvBuf[base + 2] = center.uv[2];
        posBuf[base] = center.position[0];
        posBuf[base + 1] = center.position[1];
        posBuf[base + 2] = center.position[2];
        writtenVerts++;
        currentUvs = uvBuf.subarray(0, writtenVerts * 3);
        currentPositions = posBuf.subarray(0, writtenVerts * 3);
        insertedVertices++;

        // Assign the fresh center vertex a unique canonical id directly. getGlobalVertexCanonical
        // (used by the manifold check below) is memoized by array IDENTITY; since currentUvs
        // becomes a new subarray view on every insertion, letting the center fall through to it
        // would rebuild the entire ~V-vertex canonical map per loop — the real O(loops × V) stall
        // that left feature-dense exports hanging here. centerVertex >= the original vertex count,
        // and every existing canonical id is < that count, so this id cannot collide; the returned
        // geometry is unchanged (canonical ids are internal to edge-manifold counting only).
        edgeState.canonical.remap.set(centerVertex, centerVertex);
        if (!edgeState.canonical.representativeRaw.has(centerVertex)) {
            edgeState.canonical.representativeRaw.set(centerVertex, centerVertex);
        }

        // Owner-opposite center fan: each spoke triangle traverses its boundary edge
        // opposite to the owning wall triangle (record.rawB → record.rawA → center),
        // so the cap is orientation-consistent with its neighbor instead of UV-CCW.
        // Falls back to the UV-CCW spoke only when an edge has no boundary record
        // (defensive — loop edges are boundary edges and normally always do), which
        // preserves the prior fill coverage. Mirrors the cross-surface filler.
        const fan = buildOwnerOpposedCenterFan(
            currentUvs,
            loop,
            centerVertex,
            edgeRecordByKey,
            edgeState,
            currentPositions,
            topologyWeldToleranceMm,
        );
        if (fan.length === 0) {
            emptyTriangulations++;
            continue;
        }
        // Incremental commit (mirrors fillOuterWallSeamBoundaryChains): keep every
        // manifold-safe fan triangle and drop only the canonically-degenerate /
        // over-incident ones, instead of discarding the WHOLE fan on the first bad
        // candidate. The all-or-nothing gate left a loop fully open whenever a single
        // spoke collided (weld-merged perimeter vertices on feature-dense seams); the
        // incremental gate is provably non-regressive (never creates a >2 incidence
        // edge) and closes the safe majority of the loop.
        const acceptedFan = addTrianglesIncrementallyIfSafe(edgeState, fan, currentUvs, currentPositions, topologyWeldToleranceMm);
        if (acceptedFan.length === 0) {
            unsafeLoops++;
            continue;
        }

        const acceptedGlobalTriStart = indices.length / 3 + appended.length / 3;
        try {
            const global = globalThis as unknown as { __pfEnableWindingStageDiagnostics?: boolean };
            if (global.__pfEnableWindingStageDiagnostics) {
                const loopUv = loop.map(v => {
                    const b = v * 3;
                    return `${v}:${(currentUvs[b] ?? NaN).toFixed(6)},${(currentUvs[b + 1] ?? NaN).toFixed(6)},${Math.round(currentUvs[b + 2] ?? -1)}`;
                }).join('|');
                const acceptedTris = [];
                for (let i = 0; i < acceptedFan.length; i += 3) {
                    acceptedTris.push(`${acceptedFan[i]},${acceptedFan[i + 1]},${acceptedFan[i + 2]}`);
                }
                console.warn(
                    `[FILL-CENTER-LOOP] idx=${__loopIdx - 1} triStart=${acceptedGlobalTriStart} ` +
                    `triCount=${acceptedFan.length / 3} center=${centerVertex} ` +
                    `loop=[${loop.join(',')}] loopUv=[${loopUv}] tris=[${acceptedTris.join('|')}]`,
                );
            }
        } catch { /* noop */ }

        appended.push(...acceptedFan);
        filledLoops++;
    }
    // TEMP-FILLCENTERS-PROBE
    console.warn(
        `[FILLCENTERS] loop-done t=${(performance.now() - __progStart).toFixed(0)}ms ` +
        `loops=${loops.length} attempted=${attemptedLoops} filled=${filledLoops} ` +
        `inserted=${insertedVertices} appendedTris=${appended.length / 3}`,
    );

    if (appended.length === 0) {
        return {
            indices,
            uvs,
            positions,
            filledLoops: 0,
            insertedTriangles: 0,
            insertedVertices,
            attemptedLoops,
            emptyTriangulations,
            unsafeLoops,
        };
    }

    const repaired = new Uint32Array(indices.length + appended.length);
    repaired.set(indices);
    repaired.set(appended, indices.length);
    const repairedUvs = insertedVertices > 0 ? currentUvs.slice() : uvs;
    const repairedPositions = insertedVertices > 0 ? currentPositions.slice() : positions;
    const windingWeldToleranceMm = windingGuardWeldTolerance(topologyWeldToleranceMm);
    const conflictsBefore = normalizeWindingByComponent(
        indices,
        indices.length,
        positions,
        windingWeldToleranceMm,
    ).conflicts;
    const conflictsAfter = normalizeWindingByComponent(
        repaired,
        repaired.length,
        repairedPositions,
        windingWeldToleranceMm,
    ).conflicts;
    if (conflictsAfter > conflictsBefore) {
        return {
            indices,
            uvs,
            positions,
            filledLoops: 0,
            insertedTriangles: 0,
            insertedVertices: 0,
            attemptedLoops,
            emptyTriangulations,
            unsafeLoops: unsafeLoops + filledLoops,
        };
    }
    return {
        indices: repaired,
        uvs: repairedUvs,
        positions: repairedPositions,
        filledLoops,
        insertedTriangles: appended.length / 3,
        insertedVertices,
        attemptedLoops,
        emptyTriangulations,
        unsafeLoops,
    };
}

/**
 * Decompose a canonical boundary-edge graph into edge-disjoint closed cycles,
 * restricted to BRANCHED components (those containing a vertex of boundary
 * degree >= 3).
 *
 * `orderedClosedLoops` can only trace a loop whose every vertex has boundary
 * degree exactly 2 — it bails at the first junction (degree-3+) vertex. So any
 * component where two or more holes touch at a shared vertex (a "branched"
 * component, the dominant residual the export fill battery leaves open) is never
 * presented to a filler. This routine handles exactly those components: for an
 * even-degree (manifold-rim) junction the boundary edges decompose cleanly into
 * closed cycles; odd-degree pinches leave a small tail of edges unconsumed
 * (genuine non-manifold geometry that adding triangles alone cannot close).
 *
 * Simple (degree-2-only) components are intentionally skipped — they are already
 * the job of the simple-loop fillers earlier in the battery, and re-filling them
 * here would double-cap them into non-manifold geometry.
 *
 * Returned cycles are sequences of RAW vertex indices (mapped through
 * representativeRaw), matching the contract of `orderedClosedLoops`.
 */
function decomposeBranchedBoundaryCycles(
    boundaryNeighbors: Map<number, Set<number>>,
    representativeRaw: Map<number, number>,
): number[][] {
    const cycles: number[][] = [];
    const usedEdge = new Set<number>();
    const visitedComponent = new Set<number>();

    const firstUnused = (v: number): number | undefined => {
        const ns = boundaryNeighbors.get(v);
        if (!ns) return undefined;
        for (const n of ns) {
            if (!usedEdge.has(edgeKey(v, n))) return n;
        }
        return undefined;
    };

    const mapRaw = (canonical: number[]): number[] | null => {
        const raw: number[] = [];
        for (const c of canonical) {
            const r = representativeRaw.get(c);
            if (r === undefined) return null;
            raw.push(r);
        }
        return raw;
    };

    for (const seed of boundaryNeighbors.keys()) {
        if (visitedComponent.has(seed)) continue;

        // Flood the connected component, recording its vertices and whether any
        // junction (degree >= 3) is present.
        const componentVerts: number[] = [];
        let hasBranch = false;
        const stack = [seed];
        visitedComponent.add(seed);
        while (stack.length > 0) {
            const v = stack.pop()!;
            componentVerts.push(v);
            const ns = boundaryNeighbors.get(v);
            if (!ns) continue;
            if (ns.size >= 3) hasBranch = true;
            for (const n of ns) {
                if (!visitedComponent.has(n)) {
                    visitedComponent.add(n);
                    stack.push(n);
                }
            }
        }

        if (!hasBranch) continue; // simple loop/chain — leave to the other fillers.

        // Stack-based cycle popping: walk along unused edges; whenever the walk
        // revisits a vertex already on the current path, pop the closed sub-cycle
        // and continue. Each boundary edge is consumed at most once.
        for (const v0 of componentVerts) {
            while (firstUnused(v0) !== undefined) {
                const path = [v0];
                const pos = new Map<number, number>([[v0, 0]]);
                let cur = v0;
                for (;;) {
                    const n = firstUnused(cur);
                    if (n === undefined) break; // odd-degree tail — leave unconsumed.
                    usedEdge.add(edgeKey(cur, n));
                    const seen = pos.get(n);
                    if (seen !== undefined) {
                        const cycle = path.slice(seen);
                        if (cycle.length >= 3) {
                            const raw = mapRaw(cycle);
                            if (raw) cycles.push(raw);
                        }
                        for (let k = seen + 1; k < path.length; k++) pos.delete(path[k]);
                        path.length = seen + 1;
                        cur = n;
                    } else {
                        pos.set(n, path.length);
                        path.push(n);
                        cur = n;
                    }
                }
            }
        }
    }

    return cycles;
}

/**
 * Close branched boundary components (holes that touch at a shared junction
 * vertex) that the simple-loop fillers structurally cannot reach. Decomposes
 * each branched component into edge-disjoint cycles and centre-fans every
 * same-surface cycle, guarding each fan with the canonical edge-manifold check
 * so a fill that would create a non-manifold edge is rejected rather than
 * corrupting the mesh. Mirrors `fillSameSurfaceBoundaryLoopsWithCenters` but
 * sources its loops from `decomposeBranchedBoundaryCycles`.
 */
export function fillBranchedBoundaryComponentsWithCenters(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopVertexFillResult {
    const { records, boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    const edgeRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) {
        edgeRecordByKey.set(record.key, record);
    }
    const cycles = decomposeBranchedBoundaryCycles(boundaryNeighbors, representativeRaw);

    const appended: number[] = [];
    const maxCenters = cycles.length;
    const uvBuf = new Float32Array(uvs.length + maxCenters * 3);
    uvBuf.set(uvs);
    const posBuf = new Float32Array(positions.length + maxCenters * 3);
    posBuf.set(positions);
    let writtenVerts = uvs.length / 3;
    let currentUvs: Float32Array = uvBuf.subarray(0, uvs.length);
    let currentPositions: Float32Array = posBuf.subarray(0, positions.length);
    let filledLoops = 0;
    let insertedVertices = 0;
    let attemptedLoops = 0;
    let emptyTriangulations = 0;
    let unsafeLoops = 0;
    const edgeState = buildCanonicalEdgeState(indices, currentUvs, currentPositions, topologyWeldToleranceMm);

    // Branched cycles share junction vertices, so re-triangulating an interior
    // span could collide with an existing edge. Route EVERY fill through the
    // manifold-safe check; the centre-fan introduces a fresh centre vertex (no
    // existing-edge collisions) and is the reliable closer for these components.
    const EAR_CLIP_MAX_LOOP = 512;
    for (const loop of cycles) {
        if (!sameSurfaceLoop(currentUvs, loop)) continue;
        attemptedLoops++;

        // Owner-opposed ear-clip (no center vertex): order each cycle so its edges
        // oppose the owning wall triangles, then triangulate preserving that winding
        // — instead of the UV-area ear-clip whose winding ignored owner direction.
        if (loop.length <= EAR_CLIP_MAX_LOOP) {
            const ordered = loopOrderOpposingBoundaryRecords(
                loop,
                edgeRecordByKey,
                edgeState,
                currentUvs,
                currentPositions,
                topologyWeldToleranceMm,
            );
            if (ordered) {
                const orderedTris = projectedLoopHasSelfIntersection(currentPositions, ordered)
                    ? []
                    : triangulateProjectedLoopMinimizingAspect(currentPositions, ordered);
                if (
                    orderedTris.length > 0 &&
                    addTriangleEdgesIfManifoldSafe(edgeState, orderedTris, currentUvs, currentPositions, topologyWeldToleranceMm)
                ) {
                    try {
                        const global = globalThis as unknown as { __pfEnableLoopFillDiagnostics?: boolean };
                        if (global.__pfEnableLoopFillDiagnostics) {
                            const aspect = projectedFillMaxAspect3D(currentPositions, orderedTris);
                            const loopPositions = ordered.map((vertex) => [
                                currentPositions[vertex * 3],
                                currentPositions[vertex * 3 + 1],
                                currentPositions[vertex * 3 + 2],
                            ]);
                            console.warn(
                                `[BRANCHED-FILL] attempt=${attemptedLoops - 1} mode=ear ` +
                                `triStart=${indices.length / 3 + appended.length / 3} len=${ordered.length} ` +
                                `aspect=${aspect.toFixed(6)} loop=[${ordered.join(',')}] ` +
                                `tris=[${orderedTris.join(',')}] positions=${JSON.stringify(loopPositions)}`,
                            );
                        }
                    } catch { /* noop */ }
                    appended.push(...orderedTris);
                    filledLoops++;
                    continue;
                }
            }
        }

        const center = averageLoopCenter(currentUvs, currentPositions, loop);
        const centerVertex = writtenVerts;
        const base = centerVertex * 3;
        uvBuf[base] = center.uv[0];
        uvBuf[base + 1] = center.uv[1];
        uvBuf[base + 2] = center.uv[2];
        posBuf[base] = center.position[0];
        posBuf[base + 1] = center.position[1];
        posBuf[base + 2] = center.position[2];
        writtenVerts++;
        currentUvs = uvBuf.subarray(0, writtenVerts * 3);
        currentPositions = posBuf.subarray(0, writtenVerts * 3);

        // Give the fresh centre a unique canonical id directly (see
        // fillSameSurfaceBoundaryLoopsWithCenters for why this avoids an
        // O(loops x V) canonical-map rebuild). centerVertex >= original vertex
        // count, so it cannot collide with any existing canonical id.
        edgeState.canonical.remap.set(centerVertex, centerVertex);
        if (!edgeState.canonical.representativeRaw.has(centerVertex)) {
            edgeState.canonical.representativeRaw.set(centerVertex, centerVertex);
        }

        const fan = buildOwnerOpposedCenterFan(
            currentUvs,
            loop,
            centerVertex,
            edgeRecordByKey,
            edgeState,
            currentPositions,
            topologyWeldToleranceMm,
        );
        if (fan.length === 0) {
            // Roll back the speculative centre vertex.
            writtenVerts--;
            currentUvs = uvBuf.subarray(0, writtenVerts * 3);
            currentPositions = posBuf.subarray(0, writtenVerts * 3);
            emptyTriangulations++;
            continue;
        }
        // Incremental commit: branched cycles share junction vertices, so a fan can
        // collide on a single weld-merged spoke. The old all-or-nothing gate then
        // discarded the entire fan and rolled back the centre, leaving the whole cycle
        // open. Keep every manifold-safe triangle instead; roll back the speculative
        // centre only when NOTHING could be added. Still provably non-regressive.
        const acceptedFan = addTrianglesIncrementallyIfSafe(edgeState, fan, currentUvs, currentPositions, topologyWeldToleranceMm);
        if (acceptedFan.length === 0) {
            writtenVerts--;
            currentUvs = uvBuf.subarray(0, writtenVerts * 3);
            currentPositions = posBuf.subarray(0, writtenVerts * 3);
            unsafeLoops++;
            continue;
        }

        insertedVertices++;
        try {
            const global = globalThis as unknown as { __pfEnableLoopFillDiagnostics?: boolean };
            if (global.__pfEnableLoopFillDiagnostics) {
                console.warn(
                    `[BRANCHED-FILL] attempt=${attemptedLoops - 1} mode=fan ` +
                    `triStart=${indices.length / 3 + appended.length / 3} len=${loop.length} center=${centerVertex} ` +
                    `aspect=${projectedFillMaxAspect3D(currentPositions, acceptedFan).toFixed(6)} ` +
                    `loop=[${loop.join(',')}]`,
                );
            }
        } catch { /* noop */ }
        appended.push(...acceptedFan);
        filledLoops++;
    }

    if (appended.length === 0) {
        return {
            indices,
            uvs,
            positions,
            filledLoops: 0,
            insertedTriangles: 0,
            insertedVertices,
            attemptedLoops,
            emptyTriangulations,
            unsafeLoops,
        };
    }

    const repaired = new Uint32Array(indices.length + appended.length);
    repaired.set(indices);
    repaired.set(appended, indices.length);
    return {
        indices: repaired,
        uvs: insertedVertices > 0 ? currentUvs.slice() : uvs,
        positions: insertedVertices > 0 ? currentPositions.slice() : positions,
        filledLoops,
        insertedTriangles: appended.length / 3,
        insertedVertices,
        attemptedLoops,
        emptyTriangulations,
        unsafeLoops,
    };
}

function loopOrderOpposingBoundaryRecords(
    loop: number[],
    edgeRecordByKey: Map<number, BoundaryEdgeRecord>,
    edgeState: CanonicalEdgeState,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number,
): number[] | null {
    let sameDirection = 0;
    let oppositeDirection = 0;

    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const ca = canonicalizeVertex(uvs, a, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
        const record = edgeRecordByKey.get(edgeKey(ca, cb));
        if (!record) return null;

        const recordA = canonicalizeVertex(uvs, record.rawA, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
        const recordB = canonicalizeVertex(uvs, record.rawB, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
        if (recordA === ca && recordB === cb) sameDirection++;
        else if (recordA === cb && recordB === ca) oppositeDirection++;
    }

    return sameDirection > oppositeDirection ? [...loop].reverse() : [...loop];
}

function pointInTriangleForWinding(point: LoopPoint, a: LoopPoint, b: LoopPoint, c: LoopPoint, sign: number): boolean {
    return sign >= 0
        ? pointInTriangle2D(point.u, point.t, a.u, a.t, b.u, b.t, c.u, c.t)
        : pointInTriangle2D(point.u, point.t, a.u, a.t, c.u, c.t, b.u, b.t);
}

function triangulateProjectedLoopPreservingWinding(positions: Float32Array, loopRaw: number[]): number[] {
    if (loopRaw.length < 3) return [];
    const loop = projectedLoopPoints(positions, loopRaw);
    const area = polygonArea(loop);
    if (Math.abs(area) < 1e-14) return [];
    const sign = area >= 0 ? 1 : -1;

    const remaining = [...loop];
    const triangles: number[] = [];
    let guard = 0;
    while (remaining.length > 3 && guard++ < loop.length * loop.length) {
        let clipped = false;
        for (let i = 0; i < remaining.length; i++) {
            const prev = remaining[(i - 1 + remaining.length) % remaining.length];
            const curr = remaining[i];
            const next = remaining[(i + 1) % remaining.length];
            if (sign * localCross(prev, curr, next) <= 1e-14) continue;

            let containsPoint = false;
            for (const v of remaining) {
                if (v === prev || v === curr || v === next) continue;
                if (pointInTriangleForWinding(v, prev, curr, next, sign)) {
                    containsPoint = true;
                    break;
                }
            }
            if (containsPoint) continue;

            triangles.push(prev.vertex, curr.vertex, next.vertex);
            remaining.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) return [];
    }

    if (remaining.length === 3) {
        triangles.push(remaining[0].vertex, remaining[1].vertex, remaining[2].vertex);
    }
    return triangles;
}

function projectedFillMaxAspect3D(positions: Float32Array, tris: number[]): number {
    let maxAspect = 0;
    for (let i = 0; i < tris.length; i += 3) {
        const a = tris[i];
        const b = tris[i + 1];
        const c = tris[i + 2];
        const ia = a * 3;
        const ib = b * 3;
        const ic = c * 3;
        const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
        const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
        const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
        const ab2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
        const bc2 = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2;
        const ca2 = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;
        const longest2 = Math.max(ab2, bc2, ca2);
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const cxp = uy * vz - uz * vy;
        const cyp = uz * vx - ux * vz;
        const czp = ux * vy - uy * vx;
        const area = 0.5 * Math.hypot(cxp, cyp, czp);
        const aspect = area > 1e-12
            ? (longest2 * Math.sqrt(3)) / (4 * area)
            : Number.POSITIVE_INFINITY;
        if (aspect > maxAspect) maxAspect = aspect;
    }
    return maxAspect;
}

function averageCenterFanMaxAspect3D(positions: Float32Array, loop: number[]): number {
    if (loop.length < 3) return Number.POSITIVE_INFINITY;
    let centerX = 0, centerY = 0, centerZ = 0;
    for (const vertex of loop) {
        const base = vertex * 3;
        centerX += positions[base];
        centerY += positions[base + 1];
        centerZ += positions[base + 2];
    }
    centerX /= loop.length;
    centerY /= loop.length;
    centerZ /= loop.length;

    let maxAspect = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i] * 3;
        const b = loop[(i + 1) % loop.length] * 3;
        const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
        const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
        const ab2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
        const bc2 = (bx - centerX) ** 2 + (by - centerY) ** 2 + (bz - centerZ) ** 2;
        const ca2 = (centerX - ax) ** 2 + (centerY - ay) ** 2 + (centerZ - az) ** 2;
        const longest2 = Math.max(ab2, bc2, ca2);
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = centerX - ax, vy = centerY - ay, vz = centerZ - az;
        const cxp = uy * vz - uz * vy;
        const cyp = uz * vx - ux * vz;
        const czp = ux * vy - uy * vx;
        const area = 0.5 * Math.hypot(cxp, cyp, czp);
        const aspect = area > 1e-12
            ? (longest2 * Math.sqrt(3)) / (4 * area)
            : Number.POSITIVE_INFINITY;
        if (aspect > maxAspect) maxAspect = aspect;
    }
    return maxAspect;
}

function triangulateProjectedLoopByEarQuality(positions: Float32Array, loopRaw: number[]): number[] {
    if (loopRaw.length < 3) return [];
    const loop = projectedLoopPoints(positions, loopRaw);
    const area = polygonArea(loop);
    if (Math.abs(area) < 1e-14) return [];
    const sign = area >= 0 ? 1 : -1;

    const remaining = [...loop];
    const triangles: number[] = [];
    let guard = 0;
    while (remaining.length > 3 && guard++ < loop.length * loop.length) {
        let bestIndex = -1;
        let bestAspect = Number.POSITIVE_INFINITY;
        for (let i = 0; i < remaining.length; i++) {
            const prev = remaining[(i - 1 + remaining.length) % remaining.length];
            const curr = remaining[i];
            const next = remaining[(i + 1) % remaining.length];
            if (sign * localCross(prev, curr, next) <= 1e-14) continue;

            let containsPoint = false;
            for (const v of remaining) {
                if (v === prev || v === curr || v === next) continue;
                if (pointInTriangleForWinding(v, prev, curr, next, sign)) {
                    containsPoint = true;
                    break;
                }
            }
            if (containsPoint) continue;

            const aspect = projectedFillMaxAspect3D(
                positions,
                [prev.vertex, curr.vertex, next.vertex],
            );
            if (aspect < bestAspect) {
                bestIndex = i;
                bestAspect = aspect;
            }
        }
        if (bestIndex < 0) return [];

        const prev = remaining[(bestIndex - 1 + remaining.length) % remaining.length];
        const curr = remaining[bestIndex];
        const next = remaining[(bestIndex + 1) % remaining.length];
        triangles.push(prev.vertex, curr.vertex, next.vertex);
        remaining.splice(bestIndex, 1);
    }

    if (remaining.length === 3) {
        triangles.push(remaining[0].vertex, remaining[1].vertex, remaining[2].vertex);
    }
    return triangles;
}

function projectedPointOnSegment(a: LoopPoint, b: LoopPoint, p: LoopPoint): boolean {
    const eps = 1e-10;
    return Math.abs(localCross(a, b, p)) <= eps &&
        p.u >= Math.min(a.u, b.u) - eps &&
        p.u <= Math.max(a.u, b.u) + eps &&
        p.t >= Math.min(a.t, b.t) - eps &&
        p.t <= Math.max(a.t, b.t) + eps;
}

function projectedSegmentsIntersect(a: LoopPoint, b: LoopPoint, c: LoopPoint, d: LoopPoint): boolean {
    const eps = 1e-10;
    const abC = localCross(a, b, c);
    const abD = localCross(a, b, d);
    const cdA = localCross(c, d, a);
    const cdB = localCross(c, d, b);
    if (
        ((abC > eps && abD < -eps) || (abC < -eps && abD > eps)) &&
        ((cdA > eps && cdB < -eps) || (cdA < -eps && cdB > eps))
    ) {
        return true;
    }
    return projectedPointOnSegment(a, b, c) ||
        projectedPointOnSegment(a, b, d) ||
        projectedPointOnSegment(c, d, a) ||
        projectedPointOnSegment(c, d, b);
}

function projectedLoopHasSelfIntersection(positions: Float32Array, loopRaw: number[]): boolean {
    const loop = projectedLoopPoints(positions, loopRaw);
    for (let edgeA = 0; edgeA < loop.length; edgeA++) {
        const edgeANext = (edgeA + 1) % loop.length;
        for (let edgeB = edgeA + 1; edgeB < loop.length; edgeB++) {
            const edgeBNext = (edgeB + 1) % loop.length;
            if (edgeA === edgeBNext || edgeANext === edgeB) continue;
            if (projectedSegmentsIntersect(loop[edgeA], loop[edgeANext], loop[edgeB], loop[edgeBNext])) {
                return true;
            }
        }
    }
    return false;
}

function projectedPointInPolygon(point: LoopPoint, polygon: LoopPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (
            ((a.t > point.t) !== (b.t > point.t)) &&
            point.u < ((b.u - a.u) * (point.t - a.t)) / (b.t - a.t) + a.u
        ) {
            inside = !inside;
        }
    }
    return inside;
}

function triangulateProjectedLoopMinMaxAspect(positions: Float32Array, loopRaw: number[]): number[] {
    const count = loopRaw.length;
    if (count < 3 || count > 128) return [];
    const loop = projectedLoopPoints(positions, loopRaw);
    const area = polygonArea(loop);
    if (Math.abs(area) < 1e-14) return [];
    const sign = area >= 0 ? 1 : -1;

    const visible = Array.from({ length: count }, () => new Uint8Array(count));
    const isAdjacent = (a: number, b: number): boolean =>
        Math.abs(a - b) === 1 || (a === 0 && b === count - 1) || (b === 0 && a === count - 1);
    for (let a = 0; a < count; a++) {
        for (let b = a + 1; b < count; b++) {
            if (isAdjacent(a, b)) {
                visible[a][b] = 1;
                visible[b][a] = 1;
                continue;
            }
            let valid = true;
            for (let edgeA = 0; edgeA < count; edgeA++) {
                const edgeB = (edgeA + 1) % count;
                if (edgeA === a || edgeB === a || edgeA === b || edgeB === b) continue;
                if (projectedSegmentsIntersect(loop[a], loop[b], loop[edgeA], loop[edgeB])) {
                    valid = false;
                    break;
                }
            }
            if (valid) {
                valid = projectedPointInPolygon(
                    {
                        vertex: -1,
                        u: (loop[a].u + loop[b].u) * 0.5,
                        t: (loop[a].t + loop[b].t) * 0.5,
                    },
                    loop,
                );
            }
            if (valid) {
                visible[a][b] = 1;
                visible[b][a] = 1;
            }
        }
    }

    const cost = Array.from({ length: count }, () => {
        const row = new Float64Array(count);
        row.fill(Number.POSITIVE_INFINITY);
        return row;
    });
    const split = Array.from({ length: count }, () => {
        const row = new Int16Array(count);
        row.fill(-1);
        return row;
    });
    for (let i = 0; i < count - 1; i++) cost[i][i + 1] = 0;

    for (let gap = 2; gap < count; gap++) {
        for (let a = 0; a + gap < count; a++) {
            const b = a + gap;
            if (visible[a][b] === 0) continue;
            for (let k = a + 1; k < b; k++) {
                if (visible[a][k] === 0 || visible[k][b] === 0) continue;
                if (!Number.isFinite(cost[a][k]) || !Number.isFinite(cost[k][b])) continue;
                if (sign * localCross(loop[a], loop[k], loop[b]) <= 1e-14) continue;
                const triAspect = projectedFillMaxAspect3D(
                    positions,
                    [loop[a].vertex, loop[k].vertex, loop[b].vertex],
                );
                const candidateCost = Math.max(cost[a][k], cost[k][b], triAspect);
                if (candidateCost < cost[a][b]) {
                    cost[a][b] = candidateCost;
                    split[a][b] = k;
                }
            }
        }
    }
    if (!Number.isFinite(cost[0][count - 1])) return [];

    const triangles: number[] = [];
    const emit = (a: number, b: number): void => {
        const k = split[a][b];
        if (k < 0) return;
        triangles.push(loop[a].vertex, loop[k].vertex, loop[b].vertex);
        emit(a, k);
        emit(k, b);
    };
    emit(0, count - 1);
    return triangles.length === (count - 2) * 3 ? triangles : [];
}

function triangulateProjectedLoopMinimizingAspect(positions: Float32Array, loopRaw: number[]): number[] {
    // Ear clipping is cyclic-order dependent: clipping the first valid ear can
    // leave an avoidable near-collinear final triangle. Repair loops are usually
    // small, so score all valid ears and evaluate every equivalent start vertex.
    // Preserve the single-pass behavior for large loops to bound repair runtime.
    const rotationCount = loopRaw.length <= 32 ? loopRaw.length : 1;
    const expectedIndexCount = Math.max(0, loopRaw.length - 2) * 3;
    let best: number[] = [];
    let bestAspect = Number.POSITIVE_INFINITY;
    const globalCandidate = triangulateProjectedLoopMinMaxAspect(positions, loopRaw);
    const globalAspect = globalCandidate.length === expectedIndexCount
        ? projectedFillMaxAspect3D(positions, globalCandidate)
        : Number.POSITIVE_INFINITY;
    if (globalCandidate.length === expectedIndexCount) {
        best = globalCandidate;
        bestAspect = globalAspect;
    }
    let qualityAspect = Number.POSITIVE_INFINITY;
    if (loopRaw.length <= 128) {
        const qualityCandidate = triangulateProjectedLoopByEarQuality(positions, loopRaw);
        if (qualityCandidate.length === expectedIndexCount) {
            qualityAspect = projectedFillMaxAspect3D(positions, qualityCandidate);
            if (qualityAspect < bestAspect) {
                best = qualityCandidate;
                bestAspect = qualityAspect;
            }
        }
    }
    for (let offset = 0; offset < rotationCount; offset++) {
        const rotated = offset === 0
            ? loopRaw
            : loopRaw.slice(offset).concat(loopRaw.slice(0, offset));
        const candidate = triangulateProjectedLoopPreservingWinding(positions, rotated);
        if (candidate.length !== expectedIndexCount) continue;
        const aspect = projectedFillMaxAspect3D(positions, candidate);
        if (aspect < bestAspect) {
            best = candidate;
            bestAspect = aspect;
        }
    }
    try {
        const global = globalThis as unknown as { __pfEnableLoopFillDiagnostics?: boolean };
        if (global.__pfEnableLoopFillDiagnostics) {
            console.warn(
                `[LOOP-TRI-CAND] len=${loopRaw.length} global=${globalAspect.toFixed(6)} ` +
                `greedy=${qualityAspect.toFixed(6)} selected=${bestAspect.toFixed(6)}`,
            );
        }
    } catch { /* noop */ }
    return best;
}

export function fillCrossSurfaceConstantTBoundaryLoopsWithCenters(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopVertexFillResult {
    const { records, boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    const loops = Array.from(orderedClosedLoops(boundaryNeighbors, representativeRaw));
    const edgeRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) {
        edgeRecordByKey.set(record.key, record);
    }

    const appended: number[] = [];
    const maxCenters = loops.length;
    const uvBuf = new Float32Array(uvs.length + maxCenters * 3);
    uvBuf.set(uvs);
    const posBuf = new Float32Array(positions.length + maxCenters * 3);
    posBuf.set(positions);
    let writtenVerts = uvs.length / 3;
    let currentUvs: Float32Array = uvBuf.subarray(0, uvs.length);
    let currentPositions: Float32Array = posBuf.subarray(0, positions.length);
    let filledLoops = 0;
    let insertedVertices = 0;
    let attemptedLoops = 0;
    let emptyTriangulations = 0;
    let unsafeLoops = 0;
    const edgeState = buildCanonicalEdgeState(indices, currentUvs, currentPositions, topologyWeldToleranceMm);

    for (const loop of loops) {
        if (!crossSurfaceConstantTLoop(currentUvs, loop)) continue;
        attemptedLoops++;

        let projectedTris: number[] = [];
        let projectedAspect = Number.POSITIVE_INFINITY;
        if (loop.length > 3) {
            const projectedLoop = loopOrderOpposingBoundaryRecords(
                loop,
                edgeRecordByKey,
                edgeState,
                currentUvs,
                currentPositions,
                topologyWeldToleranceMm,
            );
            projectedTris = projectedLoop
                ? triangulateProjectedLoopPreservingWinding(currentPositions, projectedLoop)
                : [];
            projectedAspect = projectedTris.length > 0
                ? projectedFillMaxAspect3D(currentPositions, projectedTris)
                : Number.POSITIVE_INFINITY;
        }

        const center = outerJoinLoopCenter(currentUvs, currentPositions, loop) ??
            averageLoopCenter(currentUvs, currentPositions, loop);
        const centerVertex = writtenVerts;
        const base = centerVertex * 3;
        uvBuf[base] = center.uv[0];
        uvBuf[base + 1] = center.uv[1];
        uvBuf[base + 2] = center.uv[2];
        posBuf[base] = center.position[0];
        posBuf[base + 1] = center.position[1];
        posBuf[base + 2] = center.position[2];
        writtenVerts++;
        currentUvs = uvBuf.subarray(0, writtenVerts * 3);
        currentPositions = posBuf.subarray(0, writtenVerts * 3);

        const fan: number[] = [];
        let completeLoop = true;
        for (let i = 0; i < loop.length; i++) {
            const a = loop[i];
            const b = loop[(i + 1) % loop.length];
            const ca = canonicalizeVertex(currentUvs, a, edgeState.canonical, edgeState.keyToId, currentPositions, topologyWeldToleranceMm);
            const cb = canonicalizeVertex(currentUvs, b, edgeState.canonical, edgeState.keyToId, currentPositions, topologyWeldToleranceMm);
            const record = edgeRecordByKey.get(edgeKey(ca, cb));
            if (!record) {
                completeLoop = false;
                break;
            }

            // The fill triangle must traverse the existing boundary edge in the
            // opposite direction, otherwise the cap is topologically present but
            // still orientation-inconsistent with its neighbor.
            fan.push(record.rawB, record.rawA, centerVertex);
        }

        const centerFanAspect = completeLoop && fan.length > 0
            ? projectedFillMaxAspect3D(currentPositions, fan)
            : Number.POSITIVE_INFINITY;
        const projectedIsPreferable =
            projectedTris.length > 0 &&
            (
                projectedAspect <= PROJECTED_LOOP_FILL_MAX_ASPECT ||
                projectedAspect <= centerFanAspect
            );
        try {
            const global = globalThis as unknown as { __pfEnableWindingStageDiagnostics?: boolean };
            if (global.__pfEnableWindingStageDiagnostics) {
                const loopUv = loop.map(v => {
                    const b = v * 3;
                    return `${v}:${(currentUvs[b] ?? NaN).toFixed(6)},${(currentUvs[b + 1] ?? NaN).toFixed(6)},${Math.round(currentUvs[b + 2] ?? -1)}`;
                }).join('|');
                const loopPos = loop.map(v => {
                    const b = v * 3;
                    return `${v}:${(currentPositions[b] ?? NaN).toFixed(4)},${(currentPositions[b + 1] ?? NaN).toFixed(4)},${(currentPositions[b + 2] ?? NaN).toFixed(4)}`;
                }).join('|');
                console.warn(
                    `[CROSS-FILL-CAND] loopLen=${loop.length} projectedTris=${projectedTris.length / 3} ` +
                    `projectedAspect=${projectedAspect.toFixed(3)} centerAspect=${centerFanAspect.toFixed(3)} ` +
                    `preferProjected=${projectedIsPreferable} completeLoop=${completeLoop} ` +
                    `loop=[${loop.join(',')}] loopUv=[${loopUv}] loopPos=[${loopPos}]`,
                );
            }
        } catch { /* noop */ }
        if (
            projectedIsPreferable &&
            addTriangleEdgesIfManifoldSafe(edgeState, projectedTris, currentUvs, currentPositions, topologyWeldToleranceMm)
        ) {
            writtenVerts--;
            currentUvs = uvBuf.subarray(0, writtenVerts * 3);
            currentPositions = posBuf.subarray(0, writtenVerts * 3);
            appended.push(...projectedTris);
            filledLoops++;
            continue;
        }

        edgeState.canonical.remap.set(centerVertex, centerVertex);
        if (!edgeState.canonical.representativeRaw.has(centerVertex)) {
            edgeState.canonical.representativeRaw.set(centerVertex, centerVertex);
        }

        if (!completeLoop || fan.length === 0) {
            writtenVerts--;
            currentUvs = uvBuf.subarray(0, writtenVerts * 3);
            currentPositions = posBuf.subarray(0, writtenVerts * 3);
            emptyTriangulations++;
            continue;
        }
        if (!addTriangleEdgesIfManifoldSafe(edgeState, fan, currentUvs, currentPositions, topologyWeldToleranceMm)) {
            writtenVerts--;
            currentUvs = uvBuf.subarray(0, writtenVerts * 3);
            currentPositions = posBuf.subarray(0, writtenVerts * 3);
            unsafeLoops++;
            continue;
        }

        appended.push(...fan);
        insertedVertices++;
        filledLoops++;
    }

    if (appended.length === 0) {
        return {
            indices,
            uvs,
            positions,
            filledLoops: 0,
            insertedTriangles: 0,
            insertedVertices,
            attemptedLoops,
            emptyTriangulations,
            unsafeLoops,
        };
    }

    const repaired = new Uint32Array(indices.length + appended.length);
    repaired.set(indices);
    repaired.set(appended, indices.length);
    return {
        indices: repaired,
        uvs: insertedVertices > 0 ? currentUvs.slice() : uvs,
        positions: insertedVertices > 0 ? currentPositions.slice() : positions,
        filledLoops,
        insertedTriangles: appended.length / 3,
        insertedVertices,
        attemptedLoops,
        emptyTriangulations,
        unsafeLoops,
    };
}

function sortedUniqueByT(uvs: Float32Array, vertices: Set<number>): number[] {
    return Array.from(vertices)
        .sort((a, b) => (uvs[a * 3 + 1] ?? 0) - (uvs[b * 3 + 1] ?? 0) || a - b);
}

function emitOwnerOpposedBoundaryTriangle(
    tris: number[],
    edgeA: number,
    edgeB: number,
    third: number,
    uvs: Float32Array,
    edgeRecordByKey: Map<number, BoundaryEdgeRecord>,
    edgeState: CanonicalEdgeState,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): void {
    const ca = canonicalizeVertex(uvs, edgeA, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
    const cb = canonicalizeVertex(uvs, edgeB, edgeState.canonical, edgeState.keyToId, positions, topologyWeldToleranceMm);
    const record = edgeRecordByKey.get(edgeKey(ca, cb));
    if (record) {
        tris.push(record.rawB, record.rawA, third);
        return;
    }
    emitTriCCW(tris, edgeA, edgeB, third, uvs);
}

function buildSeamZipperTriangles(
    uvs: Float32Array,
    lowSide: number[],
    highSide: number[],
    edgeRecordByKey: Map<number, BoundaryEdgeRecord>,
    edgeState: CanonicalEdgeState,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): number[] {
    if (lowSide.length < 2 || highSide.length < 2) return [];
    const tris: number[] = [];
    let i = 0;
    let j = 0;
    while (i < lowSide.length - 1 || j < highSide.length - 1) {
        const canAdvanceLow = i < lowSide.length - 1;
        const canAdvanceHigh = j < highSide.length - 1;
        const nextLowT = canAdvanceLow ? (uvs[lowSide[i + 1] * 3 + 1] ?? Infinity) : Infinity;
        const nextHighT = canAdvanceHigh ? (uvs[highSide[j + 1] * 3 + 1] ?? Infinity) : Infinity;

        if (canAdvanceLow && (!canAdvanceHigh || nextLowT <= nextHighT)) {
            emitOwnerOpposedBoundaryTriangle(
                tris,
                lowSide[i],
                lowSide[i + 1],
                highSide[j],
                uvs,
                edgeRecordByKey,
                edgeState,
                positions,
                topologyWeldToleranceMm,
            );
            i++;
        } else if (canAdvanceHigh) {
            emitOwnerOpposedBoundaryTriangle(
                tris,
                highSide[j],
                highSide[j + 1],
                lowSide[i],
                uvs,
                edgeRecordByKey,
                edgeState,
                positions,
                topologyWeldToleranceMm,
            );
            j++;
        } else {
            break;
        }
    }
    return tris;
}

function nearestByTThenPosition(
    source: number,
    candidates: number[],
    uvs: Float32Array,
    positions?: Float32Array,
): number | undefined {
    if (candidates.length === 0) return undefined;
    const sourceT = uvs[source * 3 + 1] ?? 0;
    const sx = positions ? positions[source * 3] ?? 0 : 0;
    const sy = positions ? positions[source * 3 + 1] ?? 0 : 0;
    const sz = positions ? positions[source * 3 + 2] ?? 0 : 0;
    let best = candidates[0];
    let bestScore = Infinity;
    for (const candidate of candidates) {
        const dt = Math.abs((uvs[candidate * 3 + 1] ?? 0) - sourceT);
        let score = dt * 1000;
        if (positions) {
            const dx = (positions[candidate * 3] ?? 0) - sx;
            const dy = (positions[candidate * 3 + 1] ?? 0) - sy;
            const dz = (positions[candidate * 3 + 2] ?? 0) - sz;
            score += Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    }
    return best;
}

function weldSeamBoundaryVertices(
    indices: Uint32Array,
    uvs: Float32Array,
    low: number[],
    high: number[],
    positions?: Float32Array,
): { indices: Uint32Array; weldedVertices: number } {
    if (low.length === 0 || high.length === 0) return { indices, weldedVertices: 0 };
    const remap = new Map<number, number>();
    const sourceSide = high.length >= low.length ? high : low;
    const targetSide = high.length >= low.length ? low : high;

    for (const source of sourceSide) {
        const target = nearestByTThenPosition(source, targetSide, uvs, positions);
        if (target !== undefined && target !== source) remap.set(source, target);
    }

    if (remap.size === 0) return { indices, weldedVertices: 0 };
    const welded = new Uint32Array(indices);
    let references = 0;
    for (let i = 0; i < welded.length; i++) {
        const target = remap.get(welded[i]);
        if (target === undefined) continue;
        welded[i] = target;
        references++;
    }

    return { indices: welded, weldedVertices: references > 0 ? remap.size : 0 };
}

export function fillOuterWallSeamBoundaryChains(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryChainFillResult {
    const { records } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    const lowSide = new Set<number>();
    const highSide = new Set<number>();

    for (const record of records) {
        if (!isOuterMidVertex(uvs, record.rawA) || !isOuterMidVertex(uvs, record.rawB)) continue;
        const uA = uvs[record.rawA * 3] ?? 0;
        const uB = uvs[record.rawB * 3] ?? 0;
        const nearLow = uA <= 0.01 && uB <= 0.01;
        const nearHigh = uA >= 0.99 && uB >= 0.99;
        if (nearLow) {
            lowSide.add(record.rawA);
            lowSide.add(record.rawB);
        } else if (nearHigh) {
            highSide.add(record.rawA);
            highSide.add(record.rawB);
        }
    }

    const low = sortedUniqueByT(uvs, lowSide);
    const high = sortedUniqueByT(uvs, highSide);
    const edgeState = buildCanonicalEdgeState(indices, uvs, positions, topologyWeldToleranceMm);
    const edgeRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) edgeRecordByKey.set(record.key, record);
    const tris = buildSeamZipperTriangles(
        uvs,
        low,
        high,
        edgeRecordByKey,
        edgeState,
        positions,
        topologyWeldToleranceMm,
    );
    if (tris.length === 0) {
        return {
            indices,
            filledChains: 0,
            insertedTriangles: 0,
            attemptedChains: 0,
            unsafeChains: 0,
            lowVertices: low.length,
            highVertices: high.length,
        };
    }

    // Incremental commit: add every manifold-safe zipper triangle, skipping the few
    // canonically degenerate ones (mismatched-density seams emit some). The previous
    // all-or-nothing gate discarded the entire batch on the first degenerate candidate
    // and fell back to a feature-destroying vertex weld; the incremental pass keeps the
    // real triangles (which close the seam) and is still provably non-regressive.
    const accepted = addTrianglesIncrementallyIfSafe(edgeState, tris, uvs, positions, topologyWeldToleranceMm);
    if (accepted.length > 0) {
        const repaired = new Uint32Array(indices.length + accepted.length);
        repaired.set(indices);
        repaired.set(accepted, indices.length);
        const orientationMismatchesBefore = countCanonicalOrientationMismatches(
            indices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        const orientationMismatchesAfter = countCanonicalOrientationMismatches(
            repaired,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        const conflictsBefore = normalizeWindingByComponent(
            indices,
            indices.length,
            positions,
            topologyWeldToleranceMm,
        ).conflicts;
        const conflictsAfter = normalizeWindingByComponent(
            repaired,
            repaired.length,
            positions,
            topologyWeldToleranceMm,
        ).conflicts;
        if (
            conflictsAfter > conflictsBefore ||
            orientationMismatchesAfter > orientationMismatchesBefore
        ) {
            return {
                indices,
                filledChains: 0,
                insertedTriangles: 0,
                attemptedChains: 1,
                unsafeChains: 1,
                lowVertices: low.length,
                highVertices: high.length,
                weldedVertices: 0,
            };
        }
        return {
            indices: repaired,
            filledChains: 1,
            insertedTriangles: accepted.length / 3,
            attemptedChains: 1,
            unsafeChains: tris.length > accepted.length ? 1 : 0,
            lowVertices: low.length,
            highVertices: high.length,
            weldedVertices: 0,
        };
    }

    // Nothing could be added safely (every candidate was degenerate or would have gone
    // non-manifold). Fall back to the vertex weld so the seam still collapses.
    const welded = weldSeamBoundaryVertices(indices, uvs, low, high, positions);
    if (welded.weldedVertices > 0) {
        return {
            indices: welded.indices,
            filledChains: 1,
            insertedTriangles: 0,
            attemptedChains: 1,
            unsafeChains: 0,
            lowVertices: low.length,
            highVertices: high.length,
            weldedVertices: welded.weldedVertices,
        };
    }
    return {
        indices,
        filledChains: 0,
        insertedTriangles: 0,
        attemptedChains: 1,
        unsafeChains: 1,
        lowVertices: low.length,
        highVertices: high.length,
        weldedVertices: 0,
    };
}

function orderedClosedLoops(
    boundaryNeighbors: Map<number, Set<number>>,
    representativeRaw: Map<number, number>,
): number[][] {
    const loops: number[][] = [];
    const visitedEdges = new Set<number>();

    for (const [start, neighbors] of boundaryNeighbors) {
        if (neighbors.size !== 2) continue;
        for (const first of neighbors) {
            const startEdge = edgeKey(start, first);
            if (visitedEdges.has(startEdge)) continue;

            const loopCanonical = [start];
            let prev = start;
            let current = first;
            let closed = false;
            for (let guard = 0; guard < boundaryNeighbors.size + 2; guard++) {
                visitedEdges.add(edgeKey(prev, current));
                const currentNeighbors = boundaryNeighbors.get(current);
                if (!currentNeighbors || currentNeighbors.size !== 2) break;
                loopCanonical.push(current);
                const next = Array.from(currentNeighbors).find(n => n !== prev);
                if (next === undefined) break;
                if (next === start) {
                    visitedEdges.add(edgeKey(current, start));
                    closed = true;
                    break;
                }
                prev = current;
                current = next;
            }

            if (!closed || loopCanonical.length < 3) continue;
            const rawLoop: number[] = [];
            let allMapped = true;
            for (const v of loopCanonical) {
                const raw = representativeRaw.get(v);
                if (raw === undefined) {
                    allMapped = false;
                    break;
                }
                rawLoop.push(raw);
            }
            if (allMapped) loops.push(rawLoop);
        }
    }

    return loops;
}

function sameSurfaceLoop(uvs: Float32Array, loop: number[]): boolean {
    if (loop.length < 3) return false;
    const surface = Math.round(uvs[loop[0] * 3 + 2] ?? -1);
    return loop.every(v => Math.round(uvs[v * 3 + 2] ?? -2) === surface);
}

function crossSurfaceConstantTLoop(uvs: Float32Array, loop: number[]): boolean {
    if (loop.length < 3) return false;
    const firstSurface = Math.round(uvs[loop[0] * 3 + 2] ?? -1);
    let mixedSurfaces = false;
    let minT = Number.POSITIVE_INFINITY;
    let maxT = Number.NEGATIVE_INFINITY;
    for (const v of loop) {
        const base = v * 3;
        const surface = Math.round(uvs[base + 2] ?? -2);
        if (surface !== firstSurface) mixedSurfaces = true;
        const t = uvs[base + 1] ?? 0;
        minT = Math.min(minT, t);
        maxT = Math.max(maxT, t);
    }
    return mixedSurfaces && maxT - minT <= UV_WELD_EPS;
}

function fillBoundaryLoopsWhere(
    indices: Uint32Array,
    uvs: Float32Array,
    acceptsLoop: (loop: number[]) => boolean,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopFillResult {
    const { records, boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    const edgeRecordByKey = new Map<number, BoundaryEdgeRecord>();
    for (const record of records) {
        edgeRecordByKey.set(record.key, record);
    }
    const appended: number[] = [];
    let filledLoops = 0;
    let attemptedLoops = 0;
    let emptyTriangulations = 0;
    let unsafeLoops = 0;
    let projectedTriangulations = 0;
    const edgeState = buildCanonicalEdgeState(indices, uvs, positions, topologyWeldToleranceMm);

    for (const loop of orderedClosedLoops(boundaryNeighbors, representativeRaw)) {
        if (!acceptsLoop(loop)) continue;
        attemptedLoops++;
        // Owner-opposed winding (universal correctness; matches the cross-surface
        // and center-fan fillers). Order the loop so every edge opposes its owning
        // wall triangle, then triangulate preserving that winding, gated all-or-
        // nothing on manifold safety. Requires 3D positions for the projected
        // ear-clip; when absent or it fails, fall through to the prior UV path so
        // loop coverage is never reduced.
        if (positions) {
            const ordered = loopOrderOpposingBoundaryRecords(
                loop,
                edgeRecordByKey,
                edgeState,
                uvs,
                positions,
                topologyWeldToleranceMm,
            );
            if (ordered) {
                const orderedTris = triangulateProjectedLoopMinimizingAspect(positions, ordered);
                const orderedAspect = orderedTris.length > 0
                    ? projectedFillMaxAspect3D(positions, orderedTris)
                    : Number.POSITIVE_INFINITY;
                try {
                    const global = globalThis as unknown as { __pfEnableLoopFillDiagnostics?: boolean };
                    if (global.__pfEnableLoopFillDiagnostics) {
                        const loopPos = ordered.map(vertex => {
                            const base = vertex * 3;
                            return `${vertex}:${(positions[base] ?? NaN).toFixed(6)},${(positions[base + 1] ?? NaN).toFixed(6)},${(positions[base + 2] ?? NaN).toFixed(6)}`;
                        }).join('|');
                        const triangles = [];
                        for (let i = 0; i < orderedTris.length; i += 3) {
                            triangles.push(`${orderedTris[i]},${orderedTris[i + 1]},${orderedTris[i + 2]}`);
                        }
                        console.warn(
                            `[LOOP-FILL-CAND] attempt=${attemptedLoops - 1} len=${ordered.length} ` +
                            `aspect=${orderedAspect.toFixed(6)} ` +
                            `loop=[${ordered.join(',')}] loopPos=[${loopPos}] tris=[${triangles.join('|')}]`,
                        );
                    }
                } catch { /* noop */ }
                // This indices-only pass cannot introduce Steiner vertices. A
                // complete projected cap above the fidelity sliver gate is
                // intentionally left open for the immediately following
                // center-aware filler, which can compare it against a fan.
                if (orderedTris.length > 0 && orderedAspect > PROJECTED_LOOP_FILL_MAX_ASPECT) {
                    unsafeLoops++;
                    continue;
                }
                if (
                    orderedTris.length > 0 &&
                    addTriangleEdgesIfManifoldSafe(edgeState, orderedTris, uvs, positions, topologyWeldToleranceMm)
                ) {
                    appended.push(...orderedTris);
                    filledLoops++;
                    projectedTriangulations++;
                    continue;
                }
            }
        }
        const triangulation = triangulateLoopManifoldSafe(
            uvs,
            loop,
            edgeState,
            positions,
            topologyWeldToleranceMm,
        );
        if (!triangulation) {
            const uvTris = triangulateLoop(uvs, loop);
            if (uvTris.length === 0) emptyTriangulations++;
            else unsafeLoops++;
            continue;
        }
        if (triangulation.usedProjection) projectedTriangulations++;
        const tris = triangulation.triangles;
        appended.push(...tris);
        filledLoops++;
    }

    if (appended.length === 0) {
        return { indices, filledLoops: 0, insertedTriangles: 0, attemptedLoops, emptyTriangulations, unsafeLoops, projectedTriangulations };
    }

    const repaired = new Uint32Array(indices.length + appended.length);
    repaired.set(indices);
    repaired.set(appended, indices.length);
    return {
        indices: repaired,
        filledLoops,
        insertedTriangles: appended.length / 3,
        attemptedLoops,
        emptyTriangulations,
        unsafeLoops,
        projectedTriangulations,
    };
}

export function fillOuterWallBoundaryLoops(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopFillResult {
    const result = fillBoundaryLoopsWhere(
        indices,
        uvs,
        loop => loop.every(v => isOuterMidVertex(uvs, v)),
        positions,
        topologyWeldToleranceMm,
    );
    if (result.filledLoops === 0) return result;

    const windingWeldToleranceMm = windingGuardWeldTolerance(topologyWeldToleranceMm);
    const conflictsBefore = normalizeWindingByComponent(
        indices,
        indices.length,
        positions,
        windingWeldToleranceMm,
    ).conflicts;
    const conflictsAfter = normalizeWindingByComponent(
        result.indices,
        result.indices.length,
        positions,
        windingWeldToleranceMm,
    ).conflicts;
    if (conflictsAfter <= conflictsBefore) return result;

    return {
        ...result,
        indices,
        filledLoops: 0,
        insertedTriangles: 0,
        unsafeLoops: (result.unsafeLoops ?? 0) + result.filledLoops,
        projectedTriangulations: 0,
    };
}

export function fillSameSurfaceBoundaryLoops(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopFillResult {
    const result = fillBoundaryLoopsWhere(
        indices,
        uvs,
        loop => sameSurfaceLoop(uvs, loop),
        positions,
        topologyWeldToleranceMm,
    );
    if (result.filledLoops === 0) return result;

    const windingWeldToleranceMm = windingGuardWeldTolerance(topologyWeldToleranceMm);
    const conflictsBefore = normalizeWindingByComponent(
        indices,
        indices.length,
        positions,
        windingWeldToleranceMm,
    ).conflicts;
    const conflictsAfter = normalizeWindingByComponent(
        result.indices,
        result.indices.length,
        positions,
        windingWeldToleranceMm,
    ).conflicts;
    if (conflictsAfter <= conflictsBefore) return result;

    return {
        ...result,
        indices,
        filledLoops: 0,
        insertedTriangles: 0,
        unsafeLoops: (result.unsafeLoops ?? 0) + result.filledLoops,
        projectedTriangulations: 0,
    };
}

export function fillGeometricBoundaryLoops(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopFillResult {
    const { boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    const appended: number[] = [];
    let filledLoops = 0;
    let attemptedLoops = 0;
    let emptyTriangulations = 0;
    let unsafeLoops = 0;
    let projectedTriangulations = 0;
    const edgeState = buildCanonicalEdgeState(indices, uvs, positions, topologyWeldToleranceMm);

    for (const loop of orderedClosedLoops(boundaryNeighbors, representativeRaw)) {
        if (crossSurfaceConstantTLoop(uvs, loop)) continue;
        attemptedLoops++;
        const triangulation = triangulatePointsManifoldSafe(
            projectedLoopPoints(positions, loop),
            edgeState,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (!triangulation) {
            const projectedTris = triangulateProjectedLoop(positions, loop);
            if (projectedTris.length === 0) emptyTriangulations++;
            else unsafeLoops++;
            continue;
        }
        projectedTriangulations++;
        const tris = triangulation;
        appended.push(...tris);
        filledLoops++;
    }

    if (appended.length === 0) {
        return { indices, filledLoops: 0, insertedTriangles: 0, attemptedLoops, emptyTriangulations, unsafeLoops, projectedTriangulations };
    }

    const repaired = new Uint32Array(indices.length + appended.length);
    repaired.set(indices);
    repaired.set(appended, indices.length);
    return {
        indices: repaired,
        filledLoops,
        insertedTriangles: appended.length / 3,
        attemptedLoops,
        emptyTriangulations,
        unsafeLoops,
        projectedTriangulations,
    };
}

/**
 * Convergence guard for the repairOuterWallTJunctions pass loop. Each pass is
 * O(triangles) and re-collects all boundary edges several times (~35s/pass on a
 * 1.6M-triangle feature-dense outer wall), so running the full maxPasses after
 * the repair has plateaued is wasted work that blows past the export deadline.
 *
 * The repair only nibbles a handful of T-junctions per pass on a mesh whose
 * ~135K boundary edges are the genuine open outer-wall rim/seam (closed later by
 * the fill battery, not by this pass). The measured GothicArches trajectory was
 * pass0=110, pass1=13, pass2=5, ... — a gradual decay to a low plateau, not a
 * relative collapse. So the stop signal is an ABSOLUTE floor: returns true once a
 * pass mutates fewer than `floor` edges, meaning it has plateaued and further
 * full passes are not worth their cost. `floor` is derived at the call site from
 * the first (most productive) pass, so it adapts per style.
 *
 * A zero-work pass returns false so it falls through to the caller's existing
 * all-zero break (which means "converged to fixpoint", a distinct outcome). The
 * first pass (prevMutations<=0) never stops here, keeping tiny meshes (pass0=1,
 * pass1=0) on the all-zero path so the guard never changes their exact-count
 * outcomes.
 */
export function shouldStopRepairPasses(
    prevMutations: number,
    thisMutations: number,
    floor: number,
): boolean {
    if (thisMutations <= 0) return false;
    if (prevMutations <= 0) return false;
    return thisMutations < floor;
}

export function repairOuterWallTJunctions(
    indices: Uint32Array,
    uvs: Float32Array,
    outerIdxCount: number,
    positions?: Float32Array,
    maxPasses: number = 4,
    topologyWeldToleranceMm: number = 0,
): BoundaryTJunctionRepairResult {
    let outerIndices: Uint32Array<ArrayBufferLike> = indices.slice(0, outerIdxCount);
    const nonOuterIndices = indices.slice(outerIdxCount);
    let repairedEdges = 0;
    let insertedTriangles = 0;

    // TEMP-TJPROBE: per-sub-pass timing that survives a long sync block. Pushes to
    // window.__pfStageLog (sync) and throws past a deadline so the caller's sync block
    // unwinds and the E2E can read the array. REMOVE once the tail hang is fixed.
    const __tjStart = performance.now();
    // TEMP-TJPROBE: arm the module-level inner-loop deadline so a single sub-pass that
    // is itself the multi-minute sink self-aborts (with a `where` label) instead of
    // running past the E2E cap. Reset to 0 before every return below.
    // TEMP-TJPROBE: arm at a LARGE deadline so the repair runs many passes but still
    // unwinds (throws) before the harness cap, leaving __pfStageLog readable so we can
    // count passes-to-convergence and see the per-pass time trajectory.
    __tjDeadlineAt = 0; // TEMP-TJPROBE: deadline DISARMED — let the repair + fill battery run to completion so the true end-to-end watertight verdict is observable.
    __tjAbortCounter = 0;
    const __tjLog = (globalThis as unknown as { __pfStageLog?: string[] }).__pfStageLog ??= [];
    const __tjMark = (msg: string): void => {
        __tjLog.push(`${(performance.now() - __tjStart).toFixed(0)}ms-into-TJ ${msg}`);
    };
    const __tjWindingMark = (name: string): void => {
        const enabled = (globalThis as unknown as {
            __pfEnableWindingStageDiagnostics?: boolean;
        }).__pfEnableWindingStageDiagnostics === true;
        if (!enabled || !positions) return;
        const combined = new Uint32Array(outerIndices.length + nonOuterIndices.length);
        combined.set(outerIndices);
        combined.set(nonOuterIndices, outerIndices.length);
        const winding = normalizeWindingByComponent(
            combined,
            combined.length,
            positions,
            topologyWeldToleranceMm,
        );
        const outerWinding = normalizeWindingByComponent(
            outerIndices,
            outerIndices.length,
            positions,
            topologyWeldToleranceMm,
        );
        console.warn(
            `[TJ-WINDING] ${name} outerTris=${outerIndices.length / 3} ` +
            `components=${winding.components} conflicts=${winding.conflicts} ` +
            `outerComponents=${outerWinding.components} outerConflicts=${outerWinding.conflicts}`,
        );
        for (const sample of outerWinding.conflictSamples.slice(0, 4)) {
            const fromBase = sample.fromTriangle * 3;
            const toBase = sample.toTriangle * 3;
            console.warn(
                `[TJ-WINDING-CONFLICT] ${name} edge=${sample.edge[0]}-${sample.edge[1]} ` +
                `tris=${sample.fromTriangle}->${sample.toTriangle} ` +
                `from=[${outerIndices[fromBase]},${outerIndices[fromBase + 1]},${outerIndices[fromBase + 2]}] ` +
                `to=[${outerIndices[toBase]},${outerIndices[toBase + 1]},${outerIndices[toBase + 2]}] ` +
                `consistent=${sample.edgeConsistent} dirs=${sample.fromDirection}/${sample.toDirection}`,
            );
        }
    };
    const __TJ_DEADLINE_MS = Number.POSITIVE_INFINITY;
    const __tjCheckDeadline = (where: string): void => {
        if (performance.now() - __tjStart > __TJ_DEADLINE_MS) {
            __tjMark(`DEADLINE_HIT at ${where}`);
            throw new Error(`TJPROBE_DEADLINE at ${where}`);
        }
    };
    {
        let zeroArea = 0;
        for (let t = 0; t + 2 < outerIndices.length; t += 3) {
            const a = outerIndices[t], b = outerIndices[t + 1], c = outerIndices[t + 2];
            if (a === b || b === c || a === c) continue;
            const ax = positions ? positions[a * 3] : 0, ay = positions ? positions[a * 3 + 1] : 0, az = positions ? positions[a * 3 + 2] : 0;
            const bx = positions ? positions[b * 3] : 0, by = positions ? positions[b * 3 + 1] : 0, bz = positions ? positions[b * 3 + 2] : 0;
            const cx = positions ? positions[c * 3] : 0, cy = positions ? positions[c * 3 + 1] : 0, cz = positions ? positions[c * 3 + 2] : 0;
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            const crx = uy * vz - uz * vy, cry = uz * vx - ux * vz, crz = ux * vy - uy * vx;
            if (crx * crx + cry * cry + crz * crz < 1e-24) zeroArea++;
        }
        __tjMark(`ENTRY outerTris=${outerIndices.length / 3} zeroAreaOuter=${zeroArea}`);
    }

    const initialCompaction = compactDuplicateCanonicalTriangles(
        outerIndices,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    if (initialCompaction.removedTriangles > 0) {
        outerIndices = initialCompaction.indices;
        repairedEdges += initialCompaction.removedTriangles;
    }
    __tjWindingMark('after-initial-compaction');

    let prevPassMutations = 0;
    let firstPassMutations = 0;
    for (let pass = 0; pass < maxPasses; pass++) {
        __tjMark(`pass${pass} START outerTris=${outerIndices.length / 3}`);
        let __t = performance.now();
        const passResult = splitBoundaryTJunctionPass(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        __tjMark(`pass${pass} splitBoundaryTJunctionPass=${(performance.now() - __t).toFixed(0)}ms repaired=${passResult.repairedEdges}`);
        __tjCheckDeadline(`pass${pass} after splitBoundaryTJunctionPass`);
        if (passResult.repairedEdges > 0) {
            outerIndices = passResult.indices;
            repairedEdges += passResult.repairedEdges;
            insertedTriangles += passResult.insertedTriangles;
        }
        __tjWindingMark(`pass${pass}-after-splitBoundaryTJunctionPass`);

        __t = performance.now();
        const nonManifoldPassResult = splitNonManifoldTJunctionPass(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        __tjMark(`pass${pass} splitNonManifoldTJunctionPass=${(performance.now() - __t).toFixed(0)}ms repaired=${nonManifoldPassResult.repairedEdges}`);
        __tjCheckDeadline(`pass${pass} after splitNonManifoldTJunctionPass`);
        if (nonManifoldPassResult.repairedEdges > 0) {
            outerIndices = nonManifoldPassResult.indices;
            repairedEdges += nonManifoldPassResult.repairedEdges;
            insertedTriangles += nonManifoldPassResult.insertedTriangles;
        }
        __tjWindingMark(`pass${pass}-after-splitNonManifoldTJunctionPass`);

        __t = performance.now();
        let snapPassResult = snapNonManifoldEndpointToBoundaryPass(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (snapPassResult.repairedEdges > 0) {
            const conflictsBefore = normalizeWindingByComponent(
                outerIndices,
                outerIndices.length,
                positions,
                topologyWeldToleranceMm,
            ).conflicts;
            const conflictsAfter = normalizeWindingByComponent(
                snapPassResult.indices,
                snapPassResult.indices.length,
                positions,
                topologyWeldToleranceMm,
            ).conflicts;
            if (conflictsAfter > conflictsBefore) {
                snapPassResult = { indices: outerIndices, repairedEdges: 0, insertedTriangles: 0 };
            }
        }
        __tjMark(`pass${pass} snapNonManifoldEndpointToBoundaryPass=${(performance.now() - __t).toFixed(0)}ms repaired=${snapPassResult.repairedEdges}`);
        __tjCheckDeadline(`pass${pass} after snapNonManifoldEndpointToBoundaryPass`);
        if (snapPassResult.repairedEdges > 0) {
            outerIndices = snapPassResult.indices;
            repairedEdges += snapPassResult.repairedEdges;
            insertedTriangles += snapPassResult.insertedTriangles;
        }
        __tjWindingMark(`pass${pass}-after-snapNonManifoldEndpointToBoundaryPass`);

        __t = performance.now();
        const compaction = compactDuplicateCanonicalTriangles(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        __tjMark(`pass${pass} compactDuplicateCanonicalTriangles=${(performance.now() - __t).toFixed(0)}ms removed=${compaction.removedTriangles}`);
        __tjCheckDeadline(`pass${pass} after compactDuplicateCanonicalTriangles`);
        if (compaction.removedTriangles > 0) {
            outerIndices = compaction.indices;
            repairedEdges += compaction.removedTriangles;
        }
        __tjWindingMark(`pass${pass}-after-compactDuplicateCanonicalTriangles`);

        __t = performance.now();
        const fanPrune = pruneMultiNonManifoldFanTriangles(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        __tjMark(`pass${pass} pruneMultiNonManifoldFanTriangles=${(performance.now() - __t).toFixed(0)}ms removed=${fanPrune.removedTriangles}`);
        __tjCheckDeadline(`pass${pass} after pruneMultiNonManifoldFanTriangles`);
        if (fanPrune.removedTriangles > 0) {
            outerIndices = fanPrune.indices;
            repairedEdges += fanPrune.removedTriangles;
        }
        __tjWindingMark(`pass${pass}-after-pruneMultiNonManifoldFanTriangles`);

        __t = performance.now();
        let crowdedFanPrune = pruneCrowdedSideNonManifoldEdgeFans(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (crowdedFanPrune.removedTriangles > 0) {
            const conflictsBefore = normalizeWindingByComponent(
                outerIndices,
                outerIndices.length,
                positions,
                topologyWeldToleranceMm,
            ).conflicts;
            const conflictsAfter = normalizeWindingByComponent(
                crowdedFanPrune.indices,
                crowdedFanPrune.indices.length,
                positions,
                topologyWeldToleranceMm,
            ).conflicts;
            if (conflictsAfter > conflictsBefore) {
                crowdedFanPrune = { indices: outerIndices, removedTriangles: 0 };
            }
        }
        __tjMark(`pass${pass} pruneCrowdedSideNonManifoldEdgeFans=${(performance.now() - __t).toFixed(0)}ms removed=${crowdedFanPrune.removedTriangles}`);
        __tjCheckDeadline(`pass${pass} after pruneCrowdedSideNonManifoldEdgeFans`);
        if (crowdedFanPrune.removedTriangles > 0) {
            outerIndices = crowdedFanPrune.indices;
            repairedEdges += crowdedFanPrune.removedTriangles;
        }
        __tjWindingMark(`pass${pass}-after-pruneCrowdedSideNonManifoldEdgeFans`);

        if (
            passResult.repairedEdges === 0 &&
            nonManifoldPassResult.repairedEdges === 0 &&
            snapPassResult.repairedEdges === 0 &&
            compaction.removedTriangles === 0 &&
            fanPrune.removedTriangles === 0 &&
            crowdedFanPrune.removedTriangles === 0
        ) break;

        const passMutations =
            passResult.repairedEdges +
            nonManifoldPassResult.repairedEdges +
            snapPassResult.repairedEdges +
            compaction.removedTriangles +
            fanPrune.removedTriangles +
            crowdedFanPrune.removedTriangles;
        if (firstPassMutations === 0) firstPassMutations = passMutations;
        // Plateau floor adapts to the style: a pass doing under a quarter of the
        // first (most productive) pass's work has converged for practical purposes.
        const plateauFloor = Math.max(32, Math.floor(firstPassMutations * 0.25));
        if (shouldStopRepairPasses(prevPassMutations, passMutations, plateauFloor)) {
            __tjMark(`pass${pass} early-exit (converged, floor=${plateauFloor})`);
            break;
        }
        prevPassMutations = passMutations;
    }

    if (repairedEdges === 0) {
        __tjDeadlineAt = 0; // TEMP-TJPROBE disarm
        return { indices, outerIdxCount, repairedEdges: 0, insertedTriangles: 0 };
    }

    const repaired = new Uint32Array(outerIndices.length + nonOuterIndices.length);
    repaired.set(outerIndices);
    repaired.set(nonOuterIndices, outerIndices.length);
    __tjDeadlineAt = 0; // TEMP-TJPROBE disarm
    return {
        indices: repaired,
        outerIdxCount: outerIndices.length,
        repairedEdges,
        insertedTriangles,
    };
}

export function repairSurfaceBoundaryTJunctions(
    indices: Uint32Array,
    uvs: Float32Array,
    maxPasses: number = 4,
): SurfaceBoundaryTJunctionRepairResult {
    let current = indices;
    let repairedEdges = 0;
    let insertedTriangles = 0;

    for (let pass = 0; pass < maxPasses; pass++) {
        const passResult = splitSurfaceBoundaryTJunctionPass(current, uvs);
        if (passResult.repairedEdges === 0) break;
        current = passResult.indices;
        repairedEdges += passResult.repairedEdges;
        insertedTriangles += passResult.insertedTriangles;
    }

    return { indices: current, repairedEdges, insertedTriangles };
}

/**
 * Final, surface-agnostic boundary T-junction closer. The earlier join repair
 * (`repairSurfaceBoundaryTJunctions`) keys on parametric surface-join identity
 * and runs before the fill battery; it leaves residual density-mismatch
 * T-junctions on shared rings (e.g. the outer-wall top row vs the rim, which are
 * the same physical circle at different column densities). This pass operates on
 * the FINAL mesh by raw 3D geometry: for every position-welded boundary edge
 * (incidence 1) it finds any mesh vertices lying on the edge's interior within
 * the weld tolerance and splits the edge's single owning triangle into a fan
 * through them, preserving the owner's winding (so no orientation flip is
 * introduced) and gating each split on manifold safety (never raises a canonical
 * edge above incidence 2). Splitting the coarse side of a density mismatch
 * cascades to close the finer side, since the inserted segment edges become
 * shared with the finer surface's existing edges.
 */
export function splitResidualBoundaryTJunctions(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number = 0,
    maxPasses: number = 3,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    let current = indices;
    let repairedEdges = 0;
    let insertedTriangles = 0;
    for (let pass = 0; pass < maxPasses; pass++) {
        const result = splitResidualBoundaryTJunctionPass(current, uvs, positions, topologyWeldToleranceMm);
        if (result.repairedEdges === 0) break;
        current = result.indices;
        repairedEdges += result.repairedEdges;
        insertedTriangles += result.insertedTriangles;
    }
    return { indices: current, repairedEdges, insertedTriangles };
}

function splitResidualBoundaryTJunctionPass(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const tol = topologyWeldToleranceMm > 0 ? topologyWeldToleranceMm : 1e-4;
    // On-edge perpendicular tolerance. A vertex sitting on the SAME physical ring as a
    // boundary edge is not collinear with the edge's straight chord: its perpendicular
    // offset is the arc sagitta, which grows with edge length (~L²/8R) and easily
    // exceeds the (sub-micron) weld tolerance on coarse rim edges. Allow up to ~1.5% of
    // the edge length (plus the weld floor) so a vertex genuinely on the ring is caught,
    // while staying far below the inter-vertex spacing so off-edge vertices are not.
    const onEdgeFloor2 = (tol * 2) ** 2;
    const onEdgeLenFrac = 0.015;
    const globalIds = getGlobalVertexCanonical(uvs, positions, topologyWeldToleranceMm);
    const numV = (positions.length / 3) | 0;

    // Representative raw vertex per canonical id (first encountered).
    const reprRaw = new Map<number, number>();
    for (let v = 0; v < numV; v++) {
        const c = globalIds[v];
        if (!reprRaw.has(c)) reprRaw.set(c, v);
    }

    // Canonical edge incidence over the whole mesh (for manifold-safe gating).
    const incidence = new Map<number, number>();
    const triCount = (indices.length / 3) | 0;
    for (let t = 0; t < triCount; t++) {
        const a = globalIds[indices[t * 3]], b = globalIds[indices[t * 3 + 1]], c = globalIds[indices[t * 3 + 2]];
        if (a === b || b === c || a === c) continue;
        incidence.set(edgeKey(a, b), (incidence.get(edgeKey(a, b)) ?? 0) + 1);
        incidence.set(edgeKey(b, c), (incidence.get(edgeKey(b, c)) ?? 0) + 1);
        incidence.set(edgeKey(c, a), (incidence.get(edgeKey(c, a)) ?? 0) + 1);
    }

    // Coarse spatial hash of canonical vertices for the on-edge query.
    const cell = Math.max(tol * 4, 1e-4);
    const cinv = 1 / cell;
    const grid = new Map<number, number[]>();
    const gridKey = (gx: number, gy: number, gz: number): number =>
        (gx & 0x3ff) * 0x100000 + (gy & 0x3ff) * 0x400 + (gz & 0x3ff);
    const hashed = new Set<number>();
    for (let v = 0; v < numV; v++) {
        const c = globalIds[v];
        if (hashed.has(c)) continue;
        hashed.add(c);
        const r = reprRaw.get(c)! * 3;
        const gk = gridKey(Math.floor(positions[r] * cinv), Math.floor(positions[r + 1] * cinv), Math.floor(positions[r + 2] * cinv));
        const arr = grid.get(gk);
        if (arr) arr.push(c); else grid.set(gk, [c]);
    }

    // Canonical vertices lying on the interior of segment a->b, sorted by param.
    const onEdgeCanon = (canonA: number, canonB: number): number[] => {
        const ra = reprRaw.get(canonA)! * 3, rb = reprRaw.get(canonB)! * 3;
        const ax = positions[ra], ay = positions[ra + 1], az = positions[ra + 2];
        const bx = positions[rb], by = positions[rb + 1], bz = positions[rb + 2];
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len2 = dx * dx + dy * dy + dz * dz;
        if (len2 < 1e-12) return [];
        const edgeOnTol2 = Math.max(onEdgeFloor2, len2 * onEdgeLenFrac * onEdgeLenFrac);
        const loX = Math.min(ax, bx) - cell, hiX = Math.max(ax, bx) + cell;
        const loY = Math.min(ay, by) - cell, hiY = Math.max(ay, by) + cell;
        const loZ = Math.min(az, bz) - cell, hiZ = Math.max(az, bz) + cell;
        const found: Array<{ canon: number; s: number }> = [];
        const seenCanon = new Set<number>();
        for (let gx = Math.floor(loX * cinv); gx <= Math.floor(hiX * cinv); gx++)
        for (let gy = Math.floor(loY * cinv); gy <= Math.floor(hiY * cinv); gy++)
        for (let gz = Math.floor(loZ * cinv); gz <= Math.floor(hiZ * cinv); gz++) {
            const arr = grid.get(gridKey(gx, gy, gz));
            if (!arr) continue;
            for (const cc of arr) {
                if (cc === canonA || cc === canonB || seenCanon.has(cc)) continue;
                const rc = reprRaw.get(cc)! * 3;
                const px = positions[rc], py = positions[rc + 1], pz = positions[rc + 2];
                const s = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2;
                if (s <= 1e-3 || s >= 1 - 1e-3) continue;
                const projx = ax + s * dx, projy = ay + s * dy, projz = az + s * dz;
                const d2 = (px - projx) ** 2 + (py - projy) ** 2 + (pz - projz) ** 2;
                if (d2 > edgeOnTol2) continue;
                seenCanon.add(cc);
                found.push({ canon: cc, s });
            }
        }
        found.sort((p, q) => p.s - q.s);
        return found.map(f => f.canon);
    };

    const { records } = collectBoundaryEdges(indices, indices.length, uvs, positions, topologyWeldToleranceMm);

    const mutable = new Uint32Array(indices);
    const appended: number[] = [];
    const touched = new Set<number>();
    let repairedEdges = 0;

    for (const record of records) {
        if (touched.has(record.triOffset)) continue;

        const mids = onEdgeCanon(record.canonA, record.canonB);
        if (mids.length === 0) continue;

        // Canonical vertex sequence along the edge: A, m1, ..., mk, B.
        const seq = [record.canonA, ...mids, record.canonB];
        const oppCanon = globalIds[record.opp];

        // Manifold-safe gate: every inserted segment edge must currently be at or
        // below incidence 1 (so the split lifts it to <= 2), and every new apex spoke
        // opp->mi must be below incidence 2. Skip the whole split otherwise.
        let safe = true;
        for (let i = 0; i < seq.length - 1 && safe; i++) {
            if ((incidence.get(edgeKey(seq[i], seq[i + 1])) ?? 0) > 1) safe = false;
        }
        for (let i = 0; i < mids.length && safe; i++) {
            if ((incidence.get(edgeKey(oppCanon, mids[i])) ?? 0) > 1) safe = false;
        }
        if (!safe) continue;

        // Raw vertex sequence (endpoints keep the record's raw ids so existing
        // adjacency is preserved; interior verts use their canonical representative).
        const rawSeq: number[] = seq.map(c => reprRaw.get(c)!);
        rawSeq[0] = record.rawA;
        rawSeq[rawSeq.length - 1] = record.rawB;

        // Replace the owning triangle with the first fan triangle and append the rest,
        // each (segStart, segEnd, opp) — preserving the owner's rawA->rawB winding.
        mutable[record.triOffset] = rawSeq[0];
        mutable[record.triOffset + 1] = rawSeq[1];
        mutable[record.triOffset + 2] = record.opp;
        for (let i = 1; i < rawSeq.length - 1; i++) {
            appended.push(rawSeq[i], rawSeq[i + 1], record.opp);
        }

        // Reflect the change in the incidence map so later records in this pass gate
        // correctly: drop the coarse edge, add the segment edges and apex spokes.
        incidence.set(edgeKey(record.canonA, record.canonB), (incidence.get(edgeKey(record.canonA, record.canonB)) ?? 1) - 1);
        for (let i = 0; i < seq.length - 1; i++) {
            const k = edgeKey(seq[i], seq[i + 1]);
            incidence.set(k, (incidence.get(k) ?? 0) + 1);
        }
        for (const m of mids) {
            const k = edgeKey(oppCanon, m);
            incidence.set(k, (incidence.get(k) ?? 0) + 1);
        }

        touched.add(record.triOffset);
        repairedEdges++;
    }

    if (appended.length === 0) {
        return { indices, repairedEdges: 0, insertedTriangles: 0 };
    }

    const repaired = new Uint32Array(mutable.length + appended.length);
    repaired.set(mutable);
    repaired.set(appended, mutable.length);
    return { indices: repaired, repairedEdges, insertedTriangles: appended.length / 3 };
}

/**
 * Weld duplicate vertices that are the SAME physical point split a few microns
 * apart by floating-point path divergence at feature/seam crossings. Such a pair
 * sits just over the (sub-micron) topology weld tolerance, so it is never merged
 * and leaves a near-degenerate edge shared by 3+ triangles (non-manifold) plus an
 * open boundary chain — the irreducible residual after the fill battery.
 *
 * To stay safe, the merge is RESTRICTED to vertices that are incident to a defect
 * edge (a boundary edge, incidence 1, or a non-manifold edge, incidence >= 3) at
 * the topology weld tolerance. Those live only in the sparse seam/rim regions, so
 * a generous (~tens of microns) merge tolerance there cannot collapse legitimate
 * detail in dense feature interiors. Merged pairs use the lower vertex index as
 * the representative; triangles that become degenerate after the remap are
 * stripped. Vertex positions are not otherwise moved, so fidelity is untouched.
 */
export function weldNearCoincidentBoundaryVertices(
    indices: Uint32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number,
    defectWeldToleranceMm: number,
    prefixIndexCount: number = indices.length,
): { indices: Uint32Array; weldedVertices: number; strippedTriangles: number; strippedPrefixTriangles: number } {
    const tol = topologyWeldToleranceMm > 0 ? topologyWeldToleranceMm : 1e-4;
    const defectTol = Math.max(defectWeldToleranceMm, tol);
    const numV = (positions.length / 3) | 0;
    const triCount = (indices.length / 3) | 0;

    // 1. Canonicalize at the weld tolerance (3D position quantization).
    const wInv = 1 / tol;
    const wmap = new Map<string, number>();
    const wcid = new Int32Array(numV);
    for (let v = 0; v < numV; v++) {
        const k = `${Math.round(positions[v * 3] * wInv)}:${Math.round(positions[v * 3 + 1] * wInv)}:${Math.round(positions[v * 3 + 2] * wInv)}`;
        let id = wmap.get(k);
        if (id === undefined) { id = wmap.size; wmap.set(k, id); }
        wcid[v] = id;
    }

    // 2. Canonical edge incidence → defect canonical vertices (incidence 1 or >= 3).
    const STR = 0x4000000;
    const ek = (a: number, b: number): number => (a < b ? a * STR + b : b * STR + a);
    const inc = new Map<number, number>();
    for (let t = 0; t < triCount; t++) {
        const a = wcid[indices[t * 3]], b = wcid[indices[t * 3 + 1]], c = wcid[indices[t * 3 + 2]];
        if (a === b || b === c || a === c) continue;
        inc.set(ek(a, b), (inc.get(ek(a, b)) ?? 0) + 1);
        inc.set(ek(b, c), (inc.get(ek(b, c)) ?? 0) + 1);
        inc.set(ek(c, a), (inc.get(ek(c, a)) ?? 0) + 1);
    }
    const defectCanon = new Set<number>();
    for (const [key, count] of inc) {
        if (count === 1 || count >= 3) {
            defectCanon.add(Math.floor(key / STR));
            defectCanon.add(key % STR);
        }
    }
    if (defectCanon.size === 0) {
        return { indices, weldedVertices: 0, strippedTriangles: 0, strippedPrefixTriangles: 0 };
    }

    // 3. Defect raw vertices + spatial hash at the defect tolerance.
    const defectRaw: number[] = [];
    for (let v = 0; v < numV; v++) if (defectCanon.has(wcid[v])) defectRaw.push(v);
    const cell = Math.max(defectTol, 1e-6);
    const cinv = 1 / cell;
    const gkey = (x: number, y: number, z: number): string => `${x}:${y}:${z}`;
    const grid = new Map<string, number[]>();
    for (const v of defectRaw) {
        const gk = gkey(Math.floor(positions[v * 3] * cinv), Math.floor(positions[v * 3 + 1] * cinv), Math.floor(positions[v * 3 + 2] * cinv));
        const arr = grid.get(gk);
        if (arr) arr.push(v); else grid.set(gk, [v]);
    }

    // 4. Union-find merge of defect vertices within the defect tolerance.
    const parent = new Int32Array(numV);
    for (let v = 0; v < numV; v++) parent[v] = v;
    const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
    const defectTol2 = defectTol * defectTol;
    for (const v of defectRaw) {
        const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
        const gx = Math.floor(px * cinv), gy = Math.floor(py * cinv), gz = Math.floor(pz * cinv);
        for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
            const arr = grid.get(gkey(gx + dx, gy + dy, gz + dz));
            if (!arr) continue;
            for (const w of arr) {
                if (w <= v) continue;
                const d2 = (positions[w * 3] - px) ** 2 + (positions[w * 3 + 1] - py) ** 2 + (positions[w * 3 + 2] - pz) ** 2;
                if (d2 <= defectTol2) union(v, w);
            }
        }
    }

    // 5. Remap to representatives; count merges.
    let welded = 0;
    const remap = new Uint32Array(numV);
    for (let v = 0; v < numV; v++) {
        const r = find(v);
        remap[v] = r;
        if (r !== v) welded++;
    }
    if (welded === 0) {
        return { indices, weldedVertices: 0, strippedTriangles: 0, strippedPrefixTriangles: 0 };
    }

    // 6. Apply the remap and strip triangles that collapsed to degenerate.
    const out: number[] = [];
    let stripped = 0;
    let strippedPrefix = 0;
    for (let t = 0; t < triCount; t++) {
        const a = remap[indices[t * 3]], b = remap[indices[t * 3 + 1]], c = remap[indices[t * 3 + 2]];
        if (a === b || b === c || a === c) {
            stripped++;
            if (t * 3 < prefixIndexCount) strippedPrefix++;
            continue;
        }
        out.push(a, b, c);
    }
    return {
        indices: new Uint32Array(out),
        weldedVertices: welded,
        strippedTriangles: stripped,
        strippedPrefixTriangles: strippedPrefix,
    };
}
