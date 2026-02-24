/**
 * MeshSubdivision — Chain-strip midpoint subdivision (v16.29 / v18.0).
 *
 * After chain-strip edge-flip optimisation, some chain-strip triangles
 * can still be stretched because a chain vertex sits inside a grid cell
 * far from the cell's corners.  Instead of trying to fix topology, we
 * ADD more vertices at the midpoints of long edges, splitting stretched
 * triangles into well-shaped smaller ones.
 *
 * v18.0 GPU-surface subdivision:
 *   Midpoints are computed in UV (parametric) space, then GPU-evaluated
 *   to get exact on-surface 3D positions.  A UV midpoint evaluates to a
 *   point ON the mathematical surface, not on the chord — eliminating
 *   the "divot" artefact from v17.0 linear 3D interpolation.
 *
 * @module MeshSubdivision
 */

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/**
 * Callback type for GPU-evaluating UV midpoints to on-surface 3D positions.
 *
 * The orchestrator binds `this.evaluatePoints(...)` with the correct GPU
 * buffers and passes it here, decoupling subdivision from the GPU context.
 *
 * @param uvBatch  Packed Float32Array: [u, t, surfaceId, u, t, surfaceId, …]
 *                 (3 floats per midpoint).
 * @returns        Packed Float32Array: [x, y, z, x, y, z, …]
 *                 (3 floats per evaluated 3D position).
 */
export type EvaluateMidpointsFn = (uvBatch: Float32Array) => Promise<Float32Array>;

/**
 * Input parameters for {@link subdivideLongEdges}.
 */
export interface SubdivisionParams {
    /** Triangle index buffer (mutated in-place for replaced tris). */
    combinedIdxs: Uint32Array;
    /** 3D vertex positions — [x,y,z] packed, 3 floats per vertex. */
    resultData: Float32Array;
    /** UV vertex data — [u,t,surfaceId] packed, 3 floats per vertex. */
    combinedVerts: Float32Array;
    /** Number of index entries belonging to the outer wall surface. */
    outerIdxCount: number;
    /** First vertex index that is a chain vertex (not a grid vertex). */
    outerGridVertexCount: number;
    /** Set of constraint (chain) edges — canonical BigInt keys — never split. */
    constraintEdgeSet: Set<bigint>;
    /** Outer wall grid width (number of columns). */
    outerW: number;
    /** Outer wall grid height (number of rows). */
    outerH: number;
}

/**
 * Diagnostic statistics returned alongside the subdivision result.
 */
export interface SubdivisionStats {
    /** Average 3D edge length sampled from the first few hundred grid edges. */
    avgGridEdge: number;
    /** Squared threshold for interior chain-strip edge splitting (1.8× avgGridEdge). */
    interiorThreshold: number;
    /** Squared threshold for boundary edge splitting (1.2× avgGridEdge). */
    boundaryThreshold: number;
    /** Number of candidate edges that exceeded the threshold. */
    candidates: number;
    /** Number of standard-grid tris indexed as boundary neighbours. */
    boundaryTrisAdded: number;
    /** Time in ms for the subdivision pass. */
    timeMs: number;
}

/**
 * Output of {@link subdivideLongEdges}.
 */
export interface SubdivisionResult {
    /** Final 3D vertex positions (may be a grown copy of the input). */
    resultData: Float32Array;
    /** Final triangle index buffer (may be a grown copy of the input). */
    indices: Uint32Array;
    /** Number of edges that were actually split. */
    splitCount: number;
    /** Diagnostic statistics. */
    stats: SubdivisionStats;
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Canonical edge key as BigInt.  Ensures (a,b) and (b,a) hash identically.
 */
function edgeKey(a: number, b: number): bigint {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
}

/**
 * Descriptor for an edge that should be split.
 */
interface SplitEdge {
    ek: bigint;
    v0: number;
    v1: number;
    len2: number;
    tris: [number, number];
}

// ─────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────

/**
 * Subdivide long edges in the chain-strip region by inserting GPU-evaluated
 * midpoint vertices.
 *
 * Each split edge shared by two triangles turns into four triangles:
 *
 * ```
 *   Before: tri0 = (A, B, C),  tri1 = (B, D, C)   [shared edge B↔C]
 *   After:  tri0 = (A, B, M),  new  = (A, M, C),
 *           tri1 = (D, B, M),  new  = (D, M, C)    [M = midpoint of B↔C]
 * ```
 *
 * @param params             Mesh data and grid dimensions.
 * @param evaluateMidpoints  GPU callback to evaluate UV midpoints → 3D positions.
 * @returns                  Subdivision result with (possibly grown) vertex/index arrays.
 */
export async function subdivideLongEdges(
    params: SubdivisionParams,
    evaluateMidpoints: EvaluateMidpointsFn,
): Promise<SubdivisionResult> {
    const {
        combinedIdxs,
        resultData,
        combinedVerts,
        outerIdxCount,
        outerGridVertexCount,
        constraintEdgeSet,
        outerW,
        outerH,
    } = params;

    const subdivStart = performance.now();

    // ── 1. Compute average grid edge length ──────────────────────────
    let gridEdgeLenSum = 0;
    let gridEdgeCount = 0;
    {
        const sampleRows = Math.min(10, outerH - 1);
        for (let j = 0; j < sampleRows; j++) {
            for (let i = 0; i < outerW - 1 && i < 50; i++) {
                const v0 = j * outerW + i;
                const v1 = j * outerW + i + 1;
                const dx = resultData[v0 * 3] - resultData[v1 * 3];
                const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
                const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
                gridEdgeLenSum += Math.sqrt(dx * dx + dy * dy + dz * dz);
                gridEdgeCount++;
            }
        }
    }
    const avgGridEdge = gridEdgeCount > 0 ? gridEdgeLenSum / gridEdgeCount : 1.0;
    const subdivThreshold2 = (avgGridEdge * 1.8) ** 2;

    // ── 2. Re-identify chain-strip triangles ─────────────────────────
    const csTriSetNow = new Set<number>();
    for (let t = 0; t < outerIdxCount; t += 3) {
        const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
        if (a === b || b === c || a === c) continue;
        if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
            csTriSetNow.add(t);
        }
    }

    // ── 3. Build edge→tri adjacency (chain-strip + boundary) ────────
    const subEdgeToTris = new Map<bigint, number[]>();
    const csEdgeSet = new Set<bigint>();

    // First pass: index chain-strip tris
    for (const t of csTriSetNow) {
        const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
        for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
            if (!subEdgeToTris.has(ek)) subEdgeToTris.set(ek, []);
            subEdgeToTris.get(ek)!.push(t);
            csEdgeSet.add(ek);
        }
    }

    // Second pass: index standard-grid tris that share edges with chain-strip tris
    let boundaryTrisAdded = 0;
    for (let t = 0; t < outerIdxCount; t += 3) {
        if (csTriSetNow.has(t)) continue;
        const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
        if (a === b || b === c || a === c) continue;
        let isBoundary = false;
        for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
            if (csEdgeSet.has(ek)) { isBoundary = true; break; }
        }
        if (isBoundary) {
            for (const ek of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
                if (!subEdgeToTris.has(ek)) subEdgeToTris.set(ek, []);
                subEdgeToTris.get(ek)!.push(t);
            }
            boundaryTrisAdded++;
        }
    }

    // ── 4. Collect long edges to split ───────────────────────────────
    const edgesToSplit: SplitEdge[] = [];
    const boundarySubdivThreshold2 = (avgGridEdge * 1.2) ** 2;

    for (const [ek, tris] of subEdgeToTris) {
        if (tris.length !== 2) continue;
        if (constraintEdgeSet.has(ek)) continue;

        const v0 = Number(ek / BigInt(0x100000));
        const v1 = Number(ek % BigInt(0x100000));

        const dx = resultData[v0 * 3] - resultData[v1 * 3];
        const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
        const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
        const len2 = dx * dx + dy * dy + dz * dz;

        const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
        const threshold = isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2;

        if (len2 > threshold) {
            edgesToSplit.push({ ek, v0, v1, len2, tris: [tris[0], tris[1]] });
        }
    }

    // Sort by length descending — split longest edges first
    edgesToSplit.sort((a, b) => b.len2 - a.len2);

    // ── 5. Phase A: Collect valid splits (dry run) ───────────────────
    const splitsToApply: Array<{ se: SplitEdge; opp0: number; opp1: number }> = [];
    const modifiedTris = new Set<number>();
    const maxSplits = Math.floor((csTriSetNow.size + boundaryTrisAdded) * 0.5);

    for (const se of edgesToSplit) {
        if (splitsToApply.length >= maxSplits) break;
        if (modifiedTris.has(se.tris[0]) || modifiedTris.has(se.tris[1])) continue;

        const t0off = se.tris[0], t1off = se.tris[1];
        const a0 = combinedIdxs[t0off], b0 = combinedIdxs[t0off + 1], c0 = combinedIdxs[t0off + 2];
        const a1 = combinedIdxs[t1off], b1 = combinedIdxs[t1off + 1], c1 = combinedIdxs[t1off + 2];

        let opp0 = -1;
        for (const v of [a0, b0, c0]) { if (v !== se.v0 && v !== se.v1) { opp0 = v; break; } }
        let opp1 = -1;
        for (const v of [a1, b1, c1]) { if (v !== se.v0 && v !== se.v1) { opp1 = v; break; } }
        if (opp0 < 0 || opp1 < 0) continue;

        splitsToApply.push({ se, opp0, opp1 });
        modifiedTris.add(t0off);
        modifiedTris.add(t1off);
    }

    // ── 6. Phase B + C: GPU-evaluate midpoints, apply splits ─────────
    let finalResultData = resultData;
    let finalCombinedIdxs = combinedIdxs;

    if (splitsToApply.length > 0) {
        // Build UV batch: [u_mid, t_mid, surfaceId] per split
        const midUVBatch = new Float32Array(splitsToApply.length * 3);
        for (let i = 0; i < splitsToApply.length; i++) {
            const { se } = splitsToApply[i];
            midUVBatch[i * 3] = (combinedVerts[se.v0 * 3] + combinedVerts[se.v1 * 3]) * 0.5;
            midUVBatch[i * 3 + 1] = (combinedVerts[se.v0 * 3 + 1] + combinedVerts[se.v1 * 3 + 1]) * 0.5;
            midUVBatch[i * 3 + 2] = combinedVerts[se.v0 * 3 + 2]; // surfaceId (same for both)
        }

        // GPU evaluate: UV midpoints → exact 3D surface positions
        const mid3D = await evaluateMidpoints(midUVBatch);

        // Phase C: Apply splits with GPU-evaluated on-surface midpoints
        const newVerts: number[] = [];
        const newTris: number[] = [];
        let nextNewIdx = resultData.length / 3;

        for (let i = 0; i < splitsToApply.length; i++) {
            const { se, opp0, opp1 } = splitsToApply[i];
            const t0off = se.tris[0], t1off = se.tris[1];

            const midIdx = nextNewIdx++;
            newVerts.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);

            // Replace tri0: (opp0, v0, M)
            combinedIdxs[t0off] = opp0;
            combinedIdxs[t0off + 1] = se.v0;
            combinedIdxs[t0off + 2] = midIdx;
            // New tri: (opp0, M, v1)
            newTris.push(opp0, midIdx, se.v1);

            // Replace tri1: (opp1, v1, M)
            combinedIdxs[t1off] = opp1;
            combinedIdxs[t1off + 1] = se.v1;
            combinedIdxs[t1off + 2] = midIdx;
            // New tri: (opp1, M, v0)
            newTris.push(opp1, midIdx, se.v0);
        }

        // Grow vertex array
        const newResultData = new Float32Array(resultData.length + newVerts.length);
        newResultData.set(resultData);
        for (let i = 0; i < newVerts.length; i++) {
            newResultData[resultData.length + i] = newVerts[i];
        }
        finalResultData = newResultData;

        // Grow index array
        const newCombinedIdxs = new Uint32Array(combinedIdxs.length + newTris.length);
        newCombinedIdxs.set(combinedIdxs);
        for (let i = 0; i < newTris.length; i++) {
            newCombinedIdxs[combinedIdxs.length + i] = newTris[i];
        }
        finalCombinedIdxs = newCombinedIdxs;
    }

    const splitCount = splitsToApply.length;
    const subdivMs = performance.now() - subdivStart;

    return {
        resultData: finalResultData,
        indices: finalCombinedIdxs,
        splitCount,
        stats: {
            avgGridEdge,
            interiorThreshold: subdivThreshold2,
            boundaryThreshold: boundarySubdivThreshold2,
            candidates: edgesToSplit.length,
            boundaryTrisAdded,
            timeMs: subdivMs,
        },
    };
}
