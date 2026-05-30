/**
 * Boundary T-junction repair for the outer wall.
 *
 * Repairs cases where one triangle owns a long boundary edge A-B while the
 * neighboring side already contains vertices A-C-B on the same UV segment.
 * The fix splits the long triangle edge using the existing vertices, so no
 * geometry is moved and feature/chain precision is preserved.
 */

const EDGE_STRIDE = 0x200000n;
const UV_WELD_EPS = 1e-5;
const UV_SEGMENT_SPLIT_EPS = 1e-4;

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
    key: bigint;
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
    edgeCounts: Map<bigint, number>;
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

function edgeKey(a: number, b: number): bigint {
    return a < b
        ? BigInt(a) * EDGE_STRIDE + BigInt(b)
        : BigInt(b) * EDGE_STRIDE + BigInt(a);
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

    const geometryKey = positions
        ? canonicalGeometryKey(positions, vertexIdx, topologyWeldToleranceMm)
        : null;
    const key = geometryKey ?? canonicalUvKey(uvs, vertexIdx);
    let id = keyToId.get(key);
    if (id === undefined) {
        id = canonical.nextId++;
        keyToId.set(key, id);
        canonical.representativeRaw.set(id, vertexIdx);
    }
    canonical.remap.set(vertexIdx, id);
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

    const au = uvs[a * 3];
    const bu = uvs[b * 3];
    const pu = uvs[p * 3];
    const du = bu - au;
    if (Math.abs(du) > 0.5 || Math.abs(du) < 1e-12) return null;

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

function collectBoundaryEdges(
    indices: Uint32Array,
    outerIdxCount: number,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): {
    records: BoundaryEdgeRecord[];
    boundaryKeys: Set<bigint>;
    boundaryNeighbors: Map<number, Set<number>>;
    representativeRaw: Map<number, number>;
    edgeCounts: Map<bigint, number>;
    edgeRecordsByKey: Map<bigint, BoundaryEdgeRecord[]>;
} {
    const edgeCounts = new Map<bigint, number>();
    const edgeSamples = new Map<bigint, BoundaryEdgeRecord>();
    const edgeRecordsByKey = new Map<bigint, BoundaryEdgeRecord[]>();
    const canonical: CanonicalVertexData = {
        remap: new Map<number, number>(),
        representativeRaw: new Map<number, number>(),
        nextId: 0,
    };
    const keyToId = new Map<string, number>();

    for (let t = 0; t < outerIdxCount; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) continue;
        const ca = canonicalizeVertex(uvs, a, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cc = canonicalizeVertex(uvs, c, canonical, keyToId, positions, topologyWeldToleranceMm);
        if (ca === cb || cb === cc || ca === cc) continue;

        const triEdges: Array<[number, number, number, number, number, number]> = [
            [a, b, ca, cb, c, cc],
            [b, c, cb, cc, a, ca],
            [c, a, cc, ca, b, cb],
        ];
        for (const [rawA, rawB, canonA, canonB, opp, oppCanon] of triEdges) {
            const key = edgeKey(canonA, canonB);
            edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
            let recordsForKey = edgeRecordsByKey.get(key);
            if (!recordsForKey) {
                recordsForKey = [];
                edgeRecordsByKey.set(key, recordsForKey);
            }
            const record = { key, triOffset: t, rawA, rawB, canonA, canonB, opp, oppCanon };
            recordsForKey.push(record);
            if (!edgeSamples.has(key)) {
                edgeSamples.set(key, record);
            }
        }
    }

    const records: BoundaryEdgeRecord[] = [];
    const boundaryKeys = new Set<bigint>();
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

    return {
        records,
        boundaryKeys,
        boundaryNeighbors,
        representativeRaw: canonical.representativeRaw,
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
    const edgeCounts = new Map<bigint, number>();
    const canonical: CanonicalVertexData = {
        remap: new Map<number, number>(),
        representativeRaw: new Map<number, number>(),
        nextId: 0,
    };
    const keyToId = new Map<string, number>();

    for (let t = 0; t < indices.length; t += 3) {
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

function addTriangleEdgesIfManifoldSafe(
    state: CanonicalEdgeState,
    tris: number[],
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): boolean {
    const pending = new Map<bigint, number>();

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

function findSplitSequence(
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
        if (rawN === undefined || !isOuterMidVertex(uvs, rawN)) continue;
        const s = pointOnSegmentParam(uvs, rawA, rawB, rawN);
        if (s === null) continue;
        queue.push({
            canonical: n,
            rawPath: [rawA, rawN],
            canonicalPath: [canonA, n],
            s,
        });
    }

    while (queue.length > 0) {
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
            const s = pointOnSegmentParam(uvs, rawA, rawB, rawN);
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

function splitBoundaryTJunctionPass(
    outerIndices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const { records, boundaryKeys, boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        outerIndices,
        outerIndices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    const mutable = new Uint32Array(outerIndices);
    const appended: number[] = [];
    const touchedTris = new Set<number>();
    let repairedEdges = 0;

    for (const record of records) {
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

function splitTriangleEdgeDeltas(record: BoundaryEdgeRecord, sequence: SplitSequence): Map<bigint, number> {
    const deltas = new Map<bigint, number>();
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

function canApplyEdgeDeltas(edgeCounts: Map<bigint, number>, deltas: Map<bigint, number>): boolean {
    for (const [key, delta] of deltas) {
        const next = (edgeCounts.get(key) ?? 0) + delta;
        if (next < 0 || next > 2) return false;
    }
    return true;
}

function applyEdgeDeltas(edgeCounts: Map<bigint, number>, deltas: Map<bigint, number>): void {
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
): Map<bigint, number> | null {
    const original = [record.canonA, record.canonB, record.oppCanon];
    if (!original.includes(replaceCanon)) return null;
    const replaced = original.map(v => v === replaceCanon ? replacementCanon : v);
    if (replaced[0] === replaced[1] || replaced[1] === replaced[2] || replaced[2] === replaced[0]) return null;

    const deltas = new Map<bigint, number>();
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

function compactDuplicateCanonicalTriangles(
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
    const seen = new Set<string>();
    const kept: number[] = [];
    let removedTriangles = 0;

    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) {
            removedTriangles++;
            continue;
        }
        const ca = canonicalizeVertex(uvs, a, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cb = canonicalizeVertex(uvs, b, canonical, keyToId, positions, topologyWeldToleranceMm);
        const cc = canonicalizeVertex(uvs, c, canonical, keyToId, positions, topologyWeldToleranceMm);
        if (ca === cb || cb === cc || ca === cc) {
            removedTriangles++;
            continue;
        }

        const key = canonicalTriangleKey(ca, cb, cc);
        if (seen.has(key)) {
            removedTriangles++;
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
    const edgeCounts = new Map<bigint, number>();
    const tris: Array<{
        raw: [number, number, number];
        canonical: [number, number, number];
        edges: [bigint, bigint, bigint];
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
        const edges: [bigint, bigint, bigint] = [
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
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const {
        boundaryKeys,
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
    );
    const mutable = new Uint32Array(outerIndices);
    const appended: number[] = [];
    const touchedTris = new Set<number>();
    let repairedEdges = 0;

    for (const [key, count] of Array.from(edgeCounts.entries())) {
        if (count <= 2) continue;
        const records = edgeRecordsByKey.get(key);
        if (!records) continue;

        for (const record of records) {
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

            let closesSplitSide = true;
            for (let i = 0; i < sequence.canonical.length - 1; i++) {
                if (!boundaryKeys.has(edgeKey(sequence.canonical[i], sequence.canonical[i + 1]))) {
                    closesSplitSide = false;
                    break;
                }
            }
            if (!closesSplitSide) continue;

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

function snapNonManifoldEndpointToBoundaryPass(
    outerIndices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): { indices: Uint32Array; repairedEdges: number; insertedTriangles: number } {
    const {
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
    );
    const mutable = new Uint32Array(outerIndices);
    const touchedTris = new Set<number>();
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
    boundaryKeys: Set<bigint>;
    boundaryNeighbors: Map<number, Set<number>>;
    representativeRaw: Map<number, number>;
} {
    const edgeCounts = new Map<bigint, number>();
    const edgeSamples = new Map<bigint, BoundaryEdgeRecord>();
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
    const boundaryKeys = new Set<bigint>();
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
    pending: Map<bigint, number>,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): bigint[] | null {
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
    const local = new Map<bigint, number>();
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
    const pending = new Map<bigint, number>();
    const addPending = (keys: bigint[]) => {
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

function triangulateLoopCenterFan(
    uvs: Float32Array,
    loopRaw: number[],
    centerVertex: number,
): number[] {
    const points = orientedLoopPoints(unwrapLoopPoints(uvs, loopRaw));
    if (points.length < 3) return [];
    const tris: number[] = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i].vertex;
        const b = points[(i + 1) % points.length].vertex;
        emitTriCCW(tris, a, b, centerVertex, uvs);
    }
    return tris;
}

export function fillSameSurfaceBoundaryLoopsWithCenters(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopVertexFillResult {
    const { boundaryNeighbors, representativeRaw } = collectBoundaryEdges(
        indices,
        indices.length,
        uvs,
        positions,
        topologyWeldToleranceMm,
    );
    const appended: number[] = [];
    const uvValues = Array.from(uvs);
    const positionValues = Array.from(positions);
    let currentUvs = uvs;
    let currentPositions = positions;
    let filledLoops = 0;
    let insertedVertices = 0;
    let attemptedLoops = 0;
    let emptyTriangulations = 0;
    let unsafeLoops = 0;
    const edgeState = buildCanonicalEdgeState(indices, currentUvs, currentPositions, topologyWeldToleranceMm);

    for (const loop of orderedClosedLoops(boundaryNeighbors, representativeRaw)) {
        if (!sameSurfaceLoop(currentUvs, loop)) continue;
        attemptedLoops++;

        const triangulation = triangulateLoopManifoldSafe(
            currentUvs,
            loop,
            edgeState,
            currentPositions,
            topologyWeldToleranceMm,
        );
        if (triangulation) {
            appended.push(...triangulation.triangles);
            filledLoops++;
            continue;
        }

        const center = averageLoopCenter(currentUvs, currentPositions, loop);
        const centerVertex = uvValues.length / 3;
        uvValues.push(...center.uv);
        positionValues.push(...center.position);
        currentUvs = new Float32Array(uvValues);
        currentPositions = new Float32Array(positionValues);
        insertedVertices++;

        const fan = triangulateLoopCenterFan(currentUvs, loop, centerVertex);
        if (fan.length === 0) {
            emptyTriangulations++;
            continue;
        }
        if (!addTriangleEdgesIfManifoldSafe(edgeState, fan, currentUvs, currentPositions, topologyWeldToleranceMm)) {
            unsafeLoops++;
            continue;
        }

        appended.push(...fan);
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
        uvs: currentUvs,
        positions: currentPositions,
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

function buildSeamZipperTriangles(uvs: Float32Array, lowSide: number[], highSide: number[]): number[] {
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
            emitTriCCW(tris, lowSide[i], lowSide[i + 1], highSide[j], uvs);
            i++;
        } else if (canAdvanceHigh) {
            emitTriCCW(tris, lowSide[i], highSide[j + 1], highSide[j], uvs);
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
    const tris = buildSeamZipperTriangles(uvs, low, high);
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

    const edgeState = buildCanonicalEdgeState(indices, uvs, positions, topologyWeldToleranceMm);
    const safe = addTriangleEdgesIfManifoldSafe(edgeState, tris, uvs, positions, topologyWeldToleranceMm);
    if (!safe) {
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

    const repaired = new Uint32Array(indices.length + tris.length);
    repaired.set(indices);
    repaired.set(tris, indices.length);
    return {
        indices: repaired,
        filledChains: 1,
        insertedTriangles: tris.length / 3,
        attemptedChains: 1,
        unsafeChains: 0,
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
    const visitedEdges = new Set<bigint>();

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

function fillBoundaryLoopsWhere(
    indices: Uint32Array,
    uvs: Float32Array,
    acceptsLoop: (loop: number[]) => boolean,
    positions?: Float32Array,
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
        if (!acceptsLoop(loop)) continue;
        attemptedLoops++;
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
    return fillBoundaryLoopsWhere(
        indices,
        uvs,
        loop => loop.every(v => isOuterMidVertex(uvs, v)),
        positions,
        topologyWeldToleranceMm,
    );
}

export function fillSameSurfaceBoundaryLoops(
    indices: Uint32Array,
    uvs: Float32Array,
    positions?: Float32Array,
    topologyWeldToleranceMm: number = 0,
): BoundaryLoopFillResult {
    return fillBoundaryLoopsWhere(
        indices,
        uvs,
        loop => sameSurfaceLoop(uvs, loop),
        positions,
        topologyWeldToleranceMm,
    );
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

    for (let pass = 0; pass < maxPasses; pass++) {
        const passResult = splitBoundaryTJunctionPass(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (passResult.repairedEdges > 0) {
            outerIndices = passResult.indices;
            repairedEdges += passResult.repairedEdges;
            insertedTriangles += passResult.insertedTriangles;
        }

        const nonManifoldPassResult = splitNonManifoldTJunctionPass(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (nonManifoldPassResult.repairedEdges > 0) {
            outerIndices = nonManifoldPassResult.indices;
            repairedEdges += nonManifoldPassResult.repairedEdges;
            insertedTriangles += nonManifoldPassResult.insertedTriangles;
        }

        const snapPassResult = snapNonManifoldEndpointToBoundaryPass(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (snapPassResult.repairedEdges > 0) {
            outerIndices = snapPassResult.indices;
            repairedEdges += snapPassResult.repairedEdges;
            insertedTriangles += snapPassResult.insertedTriangles;
        }

        const compaction = compactDuplicateCanonicalTriangles(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (compaction.removedTriangles > 0) {
            outerIndices = compaction.indices;
            repairedEdges += compaction.removedTriangles;
        }

        const fanPrune = pruneMultiNonManifoldFanTriangles(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (fanPrune.removedTriangles > 0) {
            outerIndices = fanPrune.indices;
            repairedEdges += fanPrune.removedTriangles;
        }

        const crowdedFanPrune = pruneCrowdedSideNonManifoldEdgeFans(
            outerIndices,
            uvs,
            positions,
            topologyWeldToleranceMm,
        );
        if (crowdedFanPrune.removedTriangles > 0) {
            outerIndices = crowdedFanPrune.indices;
            repairedEdges += crowdedFanPrune.removedTriangles;
        }

        if (
            passResult.repairedEdges === 0 &&
            nonManifoldPassResult.repairedEdges === 0 &&
            snapPassResult.repairedEdges === 0 &&
            compaction.removedTriangles === 0 &&
            fanPrune.removedTriangles === 0 &&
            crowdedFanPrune.removedTriangles === 0
        ) break;
    }

    if (repairedEdges === 0) {
        return { indices, outerIdxCount, repairedEdges: 0, insertedTriangles: 0 };
    }

    const repaired = new Uint32Array(outerIndices.length + nonOuterIndices.length);
    repaired.set(outerIndices);
    repaired.set(nonOuterIndices, outerIndices.length);
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
