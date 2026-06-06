/**
 * WindingNormalizer — global orientation normalization for the export mesh.
 *
 * The tail repair/fill battery (T-junction repair, boundary-loop fans,
 * center-fan fills, branched-component fills) closes holes by inserting
 * triangles whose winding is chosen by each filler's local heuristic. Those
 * heuristics do not anchor the inserted triangle's traversal direction to the
 * existing incident face across the boundary edge being closed, so a fraction
 * of the inserted triangles end up wound the SAME way as their neighbour across
 * a shared edge — a genuine winding flip (MeshValidator.checkNormals counts
 * these as `windingInconsistentEdges`). Measured on the faithful e2e: the CDT
 * base mesh carries ~1016 such flips; the tail battery injects ~+6857 more.
 *
 * Rather than patch each filler (high risk — touches working fill logic), this
 * pass canonically fixes ALL of them (and any future filler) in one shot:
 *
 *   1. Build manifold adjacency over raw edges shared by exactly two triangles.
 *   2. Flood-fill a consistent orientation per connected component.
 *   3. Choose, per component, the global handedness that flips the FEWEST
 *      triangles — i.e. the one that agrees with the component's existing
 *      majority orientation. The bulk of every component is the correctly-wound
 *      original surface, so only the minority bad fills flip. The outer wall
 *      keeps its outward winding and the (intentionally inverted) inner wall /
 *      base keep theirs, because each is a separate component judged on its own
 *      majority.
 *
 * This moves no vertices and changes no triangle count: a flipped triangle is
 * just `(a,b,c) → (a,c,b)`, the same face with the opposite normal. Fidelity,
 * feature presence, and sag metrics are therefore untouched.
 *
 * Note on orientability: if the component graph contains contradictory parity
 * cycles, no winding-only pass can satisfy every shared edge. Those conflicts
 * are left as-is and reported so the source topology can be repaired. The pass
 * still fixes the satisfiable majority without moving vertices.
 */

export interface WindingNormalizationResult {
    /** Rewritten index buffer (same length as input). */
    indices: Uint32Array;
    /** Number of triangles whose winding was reversed. */
    flipped: number;
    /** Connected components found over the manifold-edge adjacency graph. */
    components: number;
    /**
     * Triangle-adjacency conflicts encountered during flood-fill (a neighbour
     * already labelled with a parity inconsistent with the edge constraint).
     * Non-zero implies a locally non-orientable patch; normally 0.
     */
    conflicts: number;
    /** Bounded samples of contradictory adjacency edges for source repair. */
    conflictSamples: WindingConflictSample[];
}

const EDGE_STRIDE = 0x4000000; // 2^26 = 67,108,864 — exceeds any realistic vertex count

export interface WindingConflictSample {
    /** Canonical edge endpoints after optional position welding. */
    edge: [number, number];
    fromTriangle: number;
    toTriangle: number;
    currentParity: number;
    expectedParity: number;
    actualParity: number;
    edgeConsistent: boolean;
    fromDirection: 1 | -1;
    toDirection: 1 | -1;
}

const MAX_CONFLICT_SAMPLES = 32;

function edgeKey(a: number, b: number): number {
    return a < b ? a * EDGE_STRIDE + b : b * EDGE_STRIDE + a;
}

/**
 * Normalize triangle winding so every manifold edge is consistently oriented,
 * minimizing the number of triangles flipped (majority-preserving).
 */
export function normalizeWindingByComponent(
    indices: ArrayLike<number>,
    idxCount: number,
    positions?: Float32Array,
    weldToleranceMm = 0,
): WindingNormalizationResult {
    const triCount = Math.floor(idxCount / 3);
    const out = new Uint32Array(idxCount);
    for (let i = 0; i < idxCount; i++) out[i] = indices[i];

    if (triCount === 0) {
        return { indices: out, flipped: 0, components: 0, conflicts: 0, conflictSamples: [] };
    }

    const remap = positions && weldToleranceMm > 0
        ? buildPositionWeldRemap(positions, weldToleranceMm)
        : undefined;
    const vertexId = (raw: number): number => remap ? remap[raw] : raw;

    // For each edge, collect up to the incident triangles with their traversal
    // direction (+1 when the triangle walks low→high vertex id, -1 otherwise).
    // Only manifold edges (exactly 2 incident triangles) constrain orientation.
    const edgeTris = new Map<number, number[]>();
    const edgeDirs = new Map<number, number[]>();
    const edgeVerts = new Map<number, [number, number]>();
    for (let t = 0; t < triCount; t++) {
        const base = t * 3;
        const i0 = vertexId(indices[base]);
        const i1 = vertexId(indices[base + 1]);
        const i2 = vertexId(indices[base + 2]);
        if (i0 === i1 || i1 === i2 || i0 === i2) continue; // skip degenerate
        const e: Array<[number, number]> = [[i0, i1], [i1, i2], [i2, i0]];
        for (const [a, b] of e) {
            const k = edgeKey(a, b);
            const dir = a < b ? 1 : -1;
            if (!edgeVerts.has(k)) edgeVerts.set(k, a < b ? [a, b] : [b, a]);
            const tris = edgeTris.get(k);
            if (tris) { tris.push(t); edgeDirs.get(k)!.push(dir); }
            else { edgeTris.set(k, [t]); edgeDirs.set(k, [dir]); }
        }
    }

    // Triangle adjacency: for each manifold edge, link its two triangles and
    // record whether they are currently consistent (opposite traversal dirs).
    const adj: Array<Array<{
        to: number;
        consistent: boolean;
        edge: [number, number];
        fromDir: 1 | -1;
        toDir: 1 | -1;
    }>> = [];
    for (let t = 0; t < triCount; t++) adj.push([]);
    for (const [k, tris] of edgeTris) {
        if (tris.length !== 2) continue;
        const dirs = edgeDirs.get(k)! as Array<1 | -1>;
        const edge = edgeVerts.get(k);
        if (!edge) continue;
        const consistent = dirs[0] !== dirs[1];
        adj[tris[0]].push({ to: tris[1], consistent, edge, fromDir: dirs[0], toDir: dirs[1] });
        adj[tris[1]].push({ to: tris[0], consistent, edge, fromDir: dirs[1], toDir: dirs[0] });
    }

    // Flood-fill orientation parity per connected component.
    // parity[t] = 0 keep as-is, 1 flip. Constraint across an edge:
    //   consistent edge → neighbour must share parity;
    //   inconsistent edge → neighbour must take opposite parity.
    const parity = new Int8Array(triCount).fill(-1);
    const comp = new Int32Array(triCount).fill(-1);
    const stack: number[] = [];
    let components = 0;
    let conflicts = 0;
    let flipped = 0;
    const conflictSamples: WindingConflictSample[] = [];

    for (let seed = 0; seed < triCount; seed++) {
        if (parity[seed] !== -1) continue;
        const compId = components++;
        parity[seed] = 0;
        comp[seed] = compId;
        stack.length = 0;
        stack.push(seed);
        const members: number[] = [seed];

        while (stack.length > 0) {
            const t = stack.pop()!;
            const p = parity[t];
            for (const { to, consistent, edge, fromDir, toDir } of adj[t]) {
                const want = consistent ? p : (p ^ 1);
                if (parity[to] === -1) {
                    parity[to] = want as 0 | 1;
                    comp[to] = compId;
                    members.push(to);
                    stack.push(to);
                } else if (parity[to] !== want) {
                    if (conflictSamples.length < MAX_CONFLICT_SAMPLES) {
                        conflictSamples.push({
                            edge,
                            fromTriangle: t,
                            toTriangle: to,
                            currentParity: p,
                            expectedParity: want,
                            actualParity: parity[to],
                            edgeConsistent: consistent,
                            fromDirection: fromDir,
                            toDirection: toDir,
                        });
                    }
                    conflicts++; // non-orientable: keep existing label
                }
            }
        }

        // Choose the handedness that flips the fewest triangles in this
        // component (preserve the existing majority orientation).
        let ones = 0;
        for (const t of members) if (parity[t] === 1) ones++;
        const zeros = members.length - ones;
        const invert = ones > zeros; // strict → ties keep as-computed
        for (const t of members) {
            const finalFlip = invert ? (parity[t] ^ 1) : parity[t];
            if (finalFlip === 1) {
                const base = t * 3;
                const b = out[base + 1];
                out[base + 1] = out[base + 2];
                out[base + 2] = b;
                flipped++;
            }
        }
    }

    return { indices: out, flipped, components, conflicts, conflictSamples };
}

function buildPositionWeldRemap(positions: Float32Array, toleranceMm: number): Uint32Array {
    const n = Math.floor(positions.length / 3);
    const remap = new Uint32Array(n);
    const inv = 1 / toleranceMm;
    const buckets = new Map<string, number>();
    for (let v = 0; v < n; v++) {
        const key =
            `${Math.round(positions[v * 3] * inv)}:` +
            `${Math.round(positions[v * 3 + 1] * inv)}:` +
            `${Math.round(positions[v * 3 + 2] * inv)}`;
        const existing = buckets.get(key);
        if (existing === undefined) {
            buckets.set(key, v);
            remap[v] = v;
        } else {
            remap[v] = existing;
        }
    }
    return remap;
}
