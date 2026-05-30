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
 * Minimal chain point representation for UV-proximity detection.
 */
export interface ChainPointUV {
    /** U position in [0, 1) */
    u: number;
    /** Row index in the grid */
    row: number;
}

/**
 * Minimal chain representation for UV-proximity detection.
 */
export interface ChainUV {
    points: ChainPointUV[];
}

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
    /** Set of constraint (chain) edges — used for flip-protection in CSO and feature-edge classification in subdivision. */
    constraintEdgeSet: Set<bigint>;
    /** Outer wall grid width (number of columns). */
    outerW: number;
    /** Outer wall grid height (number of rows). */
    outerH: number;
    /**
     * Feature chains for UV-proximity-based chain-strip detection (v20.x).
     * When provided, triangles near chain UV positions are identified as chain-strip,
     * instead of relying solely on vertex index >= outerGridVertexCount.
     */
    chains?: ChainUV[];
    /** Map from original row indices to final physical T-coordinates */
    finalT?: Float32Array | number[];
    /** R38: Protected corridor around phantom crossing anchors and companions. */
    protectedVertices?: Set<number>;
    /**
     * v18.1 sag-gate: position tolerance in mm. When provided, a length-qualifying
     * split is only applied if the true on-surface midpoint deviates from the linear
     * chord midpoint by more than this tolerance (i.e. the chord actually sags off
     * the surface). When undefined, the legacy length-only criterion is used.
     */
    epsPosMm?: number;
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
    /** Squared threshold for feature-edge splitting (chain↔grid edges). */
    featureThreshold: number;
    /** Number of candidate edges that exceeded the threshold. */
    candidates: number;
    /** Number of standard-grid tris indexed as boundary neighbours. */
    boundaryTrisAdded: number;
    /** Number of split candidates skipped because they touched the protected corridor. */
    protectedRejects: number;
    /** v18.1: Number of splits skipped because chord sag was within epsPosMm tolerance. */
    sagSkipped: number;
    /** Time in ms for the subdivision pass. */
    timeMs: number;
}

/**
 * Metadata for a subdivision midpoint on a chain edge.
 * Collected during Phase A and returned to PEC for downstream re-snap.
 */
export interface ChainMidpointInfo {
    /** Final vertex index in the grown resultData array. */
    vertexIdx: number;
    /** Initial midpoint U (circular average of endpoint Us). */
    u: number;
    /** Midpoint T coordinate. */
    t: number;
    /** First endpoint vertex index. */
    v0: number;
    /** Second endpoint vertex index. */
    v1: number;
    /** First endpoint U coordinate (for adaptive window sizing). */
    u0: number;
    /** Second endpoint U coordinate (for adaptive window sizing). */
    u1: number;
}

/**
 * Output of {@link subdivideLongEdges}.
 */
export interface SubdivisionResult {
    /** Final 3D vertex positions (may be a grown copy of the input). */
    resultData: Float32Array;
    /** Final UV vertex data aligned with resultData. */
    uvs: Float32Array;
    /** Final triangle index buffer (may be a grown copy of the input). */
    indices: Uint32Array;
    /** Number of edges that were actually split. */
    splitCount: number;
    /** Number of leading indices that belong to the outer wall after subdivision. */
    outerIdxCount: number;
    /** Diagnostic statistics. */
    stats: SubdivisionStats;
    /** R46: Metadata for chain-edge midpoints (for downstream re-snap in PEC). */
    chainMidpoints: ChainMidpointInfo[];
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
    return BigInt(lo) * BigInt(0x200000) + BigInt(hi);
}

/**
 * Build a set of vertex indices that are "near" chain UV positions.
 *
 * For each chain point, find vertices whose UV coordinates are within
 * `proximityRadius` (in UV space) of the chain point.  This handles the
 * v20.x scenario where grid vertices are UV-snapped to chain positions
 * but their indices remain < outerGridVertexCount.
 *
 * @param combinedVerts  UV data — [u, t, surfaceId] packed, 3 floats per vertex.
 * @param vertexCount    Number of vertices.
 * @param chains         Feature chains with UV positions.
 * @param gridSpacing    Approximate UV spacing between grid columns (1 / outerW).
 * @returns              Set of vertex indices considered "chain-adjacent".
 */
export function identifyChainAdjacentVertices(
    combinedVerts: Float32Array,
    vertexCount: number,
    chains: ChainUV[],
    gridSpacing: number,
    outerH: number,
    finalT?: Float32Array | number[],
): Set<number> {
    const result = new Set<number>();
    const proximityRadius = gridSpacing * 0.5;
    const proximityRadius2 = proximityRadius * proximityRadius;

    // Collect all chain point UV positions
    const chainPoints: Array<{ u: number; t: number }> = [];
    for (const chain of chains) {
        for (const pt of chain.points) {
            let tNorm = 0;
            if (finalT && pt.row >= 0 && pt.row < finalT.length) {
                tNorm = finalT[pt.row];
            } else {
                // Fallback when finalT is not provided (e.g. in tests)
                const denom = Math.max(1, outerH - 1);
                tNorm = Math.max(0, Math.min(1, pt.row / denom));
            }
            chainPoints.push({ u: pt.u, t: tNorm });
        }
    }

    if (chainPoints.length === 0) return result;

    // For each vertex, check proximity to any chain point
    for (let v = 0; v < vertexCount; v++) {
        const vu = combinedVerts[v * 3];
        const vt = combinedVerts[v * 3 + 1];

        for (const cp of chainPoints) {
            // Circular distance in U (wraps at 1.0)
            let du = Math.abs(vu - cp.u);
            if (du > 0.5) du = 1.0 - du;
            const dt = vt - cp.t;
            const dist2 = du * du + dt * dt;
            if (dist2 <= proximityRadius2) {
                result.add(v);
                break; // vertex is near at least one chain point
            }
        }
    }

    return result;
}

function midpointWrappedU(u0: number, u1: number): number {
    let du = u1 - u0;
    if (du > 0.5) du -= 1.0;
    if (du < -0.5) du += 1.0;
    const mid = u0 + du * 0.5;
    return ((mid % 1) + 1) % 1;
}

/**
 * Identify chain-strip triangles using a hybrid approach:
 * 1. Index-based: any vertex >= outerGridVertexCount (classic chain vertices)
 * 2. UV-proximity: any vertex near a chain UV position (v20.x UV-snapped vertices)
 *
 * @param combinedIdxs          Triangle index buffer.
 * @param outerIdxCount         Number of outer wall indices.
 * @param outerGridVertexCount  First chain vertex index.
 * @param chainAdjacentVertices Optional set of chain-adjacent vertices from UV proximity.
 * @returns                     Set of triangle offsets (in index buffer) that are chain-strip.
 */
export function identifyChainStripTriangles(
    combinedIdxs: Uint32Array,
    outerIdxCount: number,
    outerGridVertexCount: number,
    chainAdjacentVertices?: Set<number>,
): Set<number> {
    const csTriSet = new Set<number>();
    for (let t = 0; t < outerIdxCount; t += 3) {
        const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
        if (a === b || b === c || a === c) continue;

        // Classic index-based detection
        if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
            csTriSet.add(t);
            continue;
        }

        // UV-proximity detection (v20.x)
        if (chainAdjacentVertices &&
            (chainAdjacentVertices.has(a) || chainAdjacentVertices.has(b) || chainAdjacentVertices.has(c))) {
            csTriSet.add(t);
        }
    }
    return csTriSet;
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
        chains,
        finalT,
        protectedVertices,
        epsPosMm,
    } = params;

    const subdivStart = performance.now();
    let sagSkipped = 0;

    // ── 1. Compute average grid edge length ──────────────────────────
    let gridEdgeLenSum = 0;
    let gridEdgeCount = 0;
    const sampleRows = Math.min(10, outerH - 1);
    {
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

    // R44.2: Also measure vertical grid edge lengths. Chain edges are primarily vertical
    // (row j → j+1) so the horizontal-only avgGridEdge misrepresents their scale.
    let vertGridEdgeLenSum = 0;
    let vertGridEdgeCount = 0;
    {
        const sampleCols = Math.min(10, outerW);
        for (let i = 0; i < sampleCols; i++) {
            for (let j = 0; j < sampleRows; j++) {
                const v0 = j * outerW + i;
                const v1 = (j + 1) * outerW + i;
                const dx = resultData[v0 * 3] - resultData[v1 * 3];
                const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
                const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
                vertGridEdgeLenSum += Math.sqrt(dx * dx + dy * dy + dz * dz);
                vertGridEdgeCount++;
            }
        }
    }
    const avgVertGridEdge = vertGridEdgeCount > 0 ? vertGridEdgeLenSum / vertGridEdgeCount : avgGridEdge;

    /** Feature edges (chain↔grid) use a tighter threshold to resolve curvature at ridge flanks. */
    const FEATURE_SCALE = 0.75;
    const featureSubdivThreshold2 = (avgGridEdge * FEATURE_SCALE) ** 2;

    /** R44.2: Chain edges use vertical grid edge scale since they span rows, not columns. */
    const CHAIN_SCALE = 0.50;
    const chainSubdivThreshold2 = (avgVertGridEdge * CHAIN_SCALE) ** 2;

    // ── 2. Re-identify chain-strip triangles ─────────────────────────
    //       Uses hybrid detection: index-based + UV-proximity (v20.x)
    let chainAdjacentVerts: Set<number> | undefined;
    if (chains && chains.length > 0 && outerW > 0) {
        const gridSpacing = 1.0 / outerW;
        const vertexCount = resultData.length / 3;
        chainAdjacentVerts = identifyChainAdjacentVertices(
            combinedVerts, vertexCount, chains, gridSpacing, outerH, finalT,
        );
    }
    const csTriSetNow = identifyChainStripTriangles(
        combinedIdxs, outerIdxCount, outerGridVertexCount, chainAdjacentVerts,
    );

    // ── 3. Build edge→tri adjacency (chain-strip + boundary) ────────
    const subEdgeToTris = new Map<bigint, number[]>();
    const csEdgeSet = new Set<bigint>();

    // First pass: index chain-strip tris
    // BUG D fix: skip degenerate triangles (a===b||b===c||a===c). R55 coalescing
    // and Batch 6 dedup can leave [C,C,X] or [0,0,0] placeholders in the buffer
    // before Phase 5c strips them. Indexing them corrupts edge adjacency and
    // blocks legitimate edges from being split (tris.length !== 2 path at L429).
    for (const t of csTriSetNow) {
        const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
        if (a === b || b === c || a === c) continue;
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

    // R44.1 diagnostic: track chain edge fate through the candidate pipeline
    let diagChainInMap = 0;
    let diagChainSingleTri = 0;
    let diagChainBelowThresh = 0;
    let diagChainCandidate = 0;
    let diagChainMinLen2 = Infinity;
    let diagChainMaxLen2 = 0;

    for (const [ek, tris] of subEdgeToTris) {
        const isChainEdge = constraintEdgeSet.has(ek);
        if (isChainEdge) diagChainInMap++;

        if (tris.length !== 2) {
            if (isChainEdge) diagChainSingleTri++;
            continue;
        }

        // R44: Chain edges (in constraintEdgeSet) are subdivision candidates —
        // they define the ridge path and need higher resolution. The set was
        // built for flip-protection in ChainStripOptimizer; reusing it as a
        // subdivision skip locked ridge resolution at row spacing (~0.77mm).

        const v0 = Number(ek / BigInt(0x200000));
        const v1 = Number(ek % BigInt(0x200000));

        const dx = resultData[v0 * 3] - resultData[v1 * 3];
        const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
        const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
        const len2 = dx * dx + dy * dy + dz * dz;

        if (isChainEdge) {
            if (len2 < diagChainMinLen2) diagChainMinLen2 = len2;
            if (len2 > diagChainMaxLen2) diagChainMaxLen2 = len2;
        }

        // R44: Chain-to-chain edges are feature edges — they trace the ridge.
        // Cross-edges (grid↔chain) were already caught by XOR.
        const isCrossEdge = (v0 < outerGridVertexCount) !== (v1 < outerGridVertexCount);
        const isFeatureEdge = isCrossEdge || isChainEdge;
        const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
        const threshold = isChainEdge
            ? chainSubdivThreshold2
            : isFeatureEdge
                ? featureSubdivThreshold2
                : (isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2);

        if (len2 > threshold) {
            if (isChainEdge) diagChainCandidate++;
            edgesToSplit.push({ ek, v0, v1, len2, tris: [tris[0], tris[1]] });
        } else if (isChainEdge) {
            diagChainBelowThresh++;
        }
    }

    console.log(`[Subdivision] R44 chain edge diagnosis: constraintSet=${constraintEdgeSet.size}, inMap=${diagChainInMap}, singleTri=${diagChainSingleTri}, belowThresh=${diagChainBelowThresh}, candidates=${diagChainCandidate}, len range=${Math.sqrt(diagChainMinLen2).toFixed(3)}-${Math.sqrt(diagChainMaxLen2).toFixed(3)}mm, featureThresh=${Math.sqrt(featureSubdivThreshold2).toFixed(3)}mm, chainThresh=${Math.sqrt(chainSubdivThreshold2).toFixed(3)}mm, avgVertEdge=${avgVertGridEdge.toFixed(3)}mm`);

    // Sort by length descending — split longest edges first
    edgesToSplit.sort((a, b) => b.len2 - a.len2);

    // ── 5. Phase A: Collect valid splits (dry run) ───────────────────
    const splitsToApply: Array<{ se: SplitEdge; opp0: number; opp1: number }> = [];
    const modifiedTris = new Set<number>();
    const maxSplits = Math.floor((csTriSetNow.size + boundaryTrisAdded) * 0.5);
    let protectedRejects = 0;

    const touchesProtectedPatch = (
        v0: number, v1: number, opp0: number, opp1: number,
        isFeatureEdge: boolean, isChainEdge: boolean
    ): boolean => {
        if (protectedVertices === undefined) return false;
        // R45: Chain edges (both endpoints are chain vertices) are always safe
        // to split — midpoint insertion is topology-preserving and phantom
        // vertices don't move. Blocking 51% of chain splits was the #2 cause
        // of poor feature edge resolution.
        if (isChainEdge) return false;
        // R42: Feature edges (chain↔grid) can be split even when edge endpoints
        // are protected — subdivision is topology-preserving (adds midpoint only).
        // Still block if opposite vertices are protected (fully inside phantom corridor).
        if (isFeatureEdge) {
            return protectedVertices.has(opp0) || protectedVertices.has(opp1);
        }
        return protectedVertices.has(v0) || protectedVertices.has(v1) ||
               protectedVertices.has(opp0) || protectedVertices.has(opp1);
    };

    // R44.1 diagnostic: track chain edge fate in Phase A (splitting decisions)
    let diagChainPhaseA_conflict = 0;   // blocked by modifiedTris
    let diagChainPhaseA_protected = 0;  // blocked by touchesProtectedPatch
    let diagChainPhaseA_split = 0;      // actually split
    let diagChainPhaseA_total = 0;      // total chain edges entering Phase A

    // R44.2: Partition into chain and non-chain, both sorted by length descending
    const chainEdgesToSplit = edgesToSplit.filter(se => constraintEdgeSet.has(se.ek));
    const nonChainEdgesToSplit = edgesToSplit.filter(se => !constraintEdgeSet.has(se.ek));

    // R46: Track which splits are chain-edge midpoints for downstream re-snap
    const chainSplitIndices: number[] = [];

    // Phase A1: Chain edges first, Phase A2: Non-chain edges
    for (const batch of [chainEdgesToSplit, nonChainEdgesToSplit]) {
        if (splitsToApply.length >= maxSplits) break;
        for (const se of batch) {
            if (splitsToApply.length >= maxSplits) break;
            const isChainEdgeA = constraintEdgeSet.has(se.ek);
            if (isChainEdgeA) diagChainPhaseA_total++;

            if (modifiedTris.has(se.tris[0]) || modifiedTris.has(se.tris[1])) {
                if (isChainEdgeA) diagChainPhaseA_conflict++;
                continue;
            }

            const t0off = se.tris[0], t1off = se.tris[1];
            const a0 = combinedIdxs[t0off], b0 = combinedIdxs[t0off + 1], c0 = combinedIdxs[t0off + 2];
            const a1 = combinedIdxs[t1off], b1 = combinedIdxs[t1off + 1], c1 = combinedIdxs[t1off + 2];

            let opp0 = -1;
            for (const v of [a0, b0, c0]) { if (v !== se.v0 && v !== se.v1) { opp0 = v; break; } }
            let opp1 = -1;
            for (const v of [a1, b1, c1]) { if (v !== se.v0 && v !== se.v1) { opp1 = v; break; } }
            if (opp0 < 0 || opp1 < 0) continue;
            // R44: Same chain-edge classification as the collection loop above.
            const isCrossEdge = (se.v0 < outerGridVertexCount) !== (se.v1 < outerGridVertexCount);
            const isFeatureEdge = isCrossEdge || constraintEdgeSet.has(se.ek);
            if (touchesProtectedPatch(se.v0, se.v1, opp0, opp1, isFeatureEdge, isChainEdgeA)) {
                protectedRejects++;
                if (isChainEdgeA) diagChainPhaseA_protected++;
                continue;
            }

            splitsToApply.push({ se, opp0, opp1 });
            modifiedTris.add(t0off);
            modifiedTris.add(t1off);
            if (isChainEdgeA) diagChainPhaseA_split++;

            // R46: Track chain-edge splits where both endpoints are chain vertices
            // (guard: exclude fan diagonal edges in constraintEdgeSet)
            const isChainMidpoint = isChainEdgeA
                && se.v0 >= outerGridVertexCount
                && se.v1 >= outerGridVertexCount;
            if (isChainMidpoint) chainSplitIndices.push(splitsToApply.length - 1);
        }
    }

    console.log(`[Subdivision] R44 Phase A chain diagnosis: total=${diagChainPhaseA_total}, split=${diagChainPhaseA_split}, conflict=${diagChainPhaseA_conflict}, protected=${diagChainPhaseA_protected}, maxSplits=${maxSplits}`);

    // ── 6. Phase B + C: GPU-evaluate midpoints, apply splits ─────────
    let finalResultData = resultData;
    let finalCombinedVerts = combinedVerts;
    let finalCombinedIdxs = combinedIdxs;
    const chainMidpoints: ChainMidpointInfo[] = [];
    let appliedSplitCount = 0;

    if (splitsToApply.length > 0) {
        // Build UV batch for ALL candidate splits: [u_mid, t_mid, surfaceId].
        const candMidUV = new Float32Array(splitsToApply.length * 3);
        for (let i = 0; i < splitsToApply.length; i++) {
            const { se } = splitsToApply[i];
            candMidUV[i * 3] = midpointWrappedU(combinedVerts[se.v0 * 3], combinedVerts[se.v1 * 3]);
            candMidUV[i * 3 + 1] = (combinedVerts[se.v0 * 3 + 1] + combinedVerts[se.v1 * 3 + 1]) * 0.5;
            candMidUV[i * 3 + 2] = combinedVerts[se.v0 * 3 + 2]; // surfaceId (same for both)
        }

        // GPU evaluate: UV midpoints → exact 3D surface positions.
        const candMid3D = await evaluateMidpoints(candMidUV);

        // v18.1 sag-gate: keep a split only if the true on-surface midpoint
        // deviates from the linear chord midpoint by more than epsPosMm.
        // Reuses the already-evaluated midpoints — no extra GPU work — and can
        // only REMOVE candidates, so it never inflates triangle count.
        // When epsPosMm is undefined, fall back to the legacy length criterion
        // (keep every candidate).
        let appliedSplits = splitsToApply;
        let midUVBatch = candMidUV;
        let mid3D = candMid3D;
        let appliedChainSplitIndices = chainSplitIndices;
        if (epsPosMm !== undefined) {
            const keep: number[] = [];
            for (let i = 0; i < splitsToApply.length; i++) {
                const { se } = splitsToApply[i];
                const mx = (resultData[se.v0 * 3] + resultData[se.v1 * 3]) * 0.5;
                const my = (resultData[se.v0 * 3 + 1] + resultData[se.v1 * 3 + 1]) * 0.5;
                const mz = (resultData[se.v0 * 3 + 2] + resultData[se.v1 * 3 + 2]) * 0.5;
                const dx = candMid3D[i * 3] - mx;
                const dy = candMid3D[i * 3 + 1] - my;
                const dz = candMid3D[i * 3 + 2] - mz;
                const sag = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (sag > epsPosMm) keep.push(i);
            }
            sagSkipped = splitsToApply.length - keep.length;

            if (keep.length < splitsToApply.length) {
                // Compact candidate arrays down to the kept splits, preserving order.
                const oldToNew = new Map<number, number>();
                appliedSplits = new Array(keep.length);
                midUVBatch = new Float32Array(keep.length * 3);
                mid3D = new Float32Array(keep.length * 3);
                for (let k = 0; k < keep.length; k++) {
                    const i = keep[k];
                    oldToNew.set(i, k);
                    appliedSplits[k] = splitsToApply[i];
                    midUVBatch[k * 3] = candMidUV[i * 3];
                    midUVBatch[k * 3 + 1] = candMidUV[i * 3 + 1];
                    midUVBatch[k * 3 + 2] = candMidUV[i * 3 + 2];
                    mid3D[k * 3] = candMid3D[i * 3];
                    mid3D[k * 3 + 1] = candMid3D[i * 3 + 1];
                    mid3D[k * 3 + 2] = candMid3D[i * 3 + 2];
                }
                appliedChainSplitIndices = [];
                for (const oldIdx of chainSplitIndices) {
                    const newIdx = oldToNew.get(oldIdx);
                    if (newIdx !== undefined) appliedChainSplitIndices.push(newIdx);
                }
            }
        }

        appliedSplitCount = appliedSplits.length;

        // Phase C: Apply splits with GPU-evaluated on-surface midpoints
        const newVerts: number[] = [];
        const newTris: number[] = [];
        let nextNewIdx = resultData.length / 3;

        for (let i = 0; i < appliedSplits.length; i++) {
            const { se } = appliedSplits[i];
            const t0off = se.tris[0], t1off = se.tris[1];

            const midIdx = nextNewIdx++;
            newVerts.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);

            // Preserve winding order for tri0
            const a0 = combinedIdxs[t0off], b0 = combinedIdxs[t0off + 1], c0 = combinedIdxs[t0off + 2];
            if ((a0 === se.v0 && b0 === se.v1) || (a0 === se.v1 && b0 === se.v0)) {
                combinedIdxs[t0off] = a0; combinedIdxs[t0off + 1] = midIdx; combinedIdxs[t0off + 2] = c0;
                newTris.push(midIdx, b0, c0);
            } else if ((b0 === se.v0 && c0 === se.v1) || (b0 === se.v1 && c0 === se.v0)) {
                combinedIdxs[t0off] = a0; combinedIdxs[t0off + 1] = b0; combinedIdxs[t0off + 2] = midIdx;
                newTris.push(a0, midIdx, c0);
            } else {
                combinedIdxs[t0off] = midIdx; combinedIdxs[t0off + 1] = b0; combinedIdxs[t0off + 2] = c0;
                newTris.push(a0, b0, midIdx);
            }

            // Preserve winding order for tri1
            const a1 = combinedIdxs[t1off], b1 = combinedIdxs[t1off + 1], c1 = combinedIdxs[t1off + 2];
            if ((a1 === se.v0 && b1 === se.v1) || (a1 === se.v1 && b1 === se.v0)) {
                combinedIdxs[t1off] = a1; combinedIdxs[t1off + 1] = midIdx; combinedIdxs[t1off + 2] = c1;
                newTris.push(midIdx, b1, c1);
            } else if ((b1 === se.v0 && c1 === se.v1) || (b1 === se.v1 && c1 === se.v0)) {
                combinedIdxs[t1off] = a1; combinedIdxs[t1off + 1] = b1; combinedIdxs[t1off + 2] = midIdx;
                newTris.push(a1, midIdx, c1);
            } else {
                combinedIdxs[t1off] = midIdx; combinedIdxs[t1off + 1] = b1; combinedIdxs[t1off + 2] = c1;
                newTris.push(a1, b1, midIdx);
            }
        }

        // Grow vertex array
        const newResultData = new Float32Array(resultData.length + newVerts.length);
        newResultData.set(resultData);
        for (let i = 0; i < newVerts.length; i++) {
            newResultData[resultData.length + i] = newVerts[i];
        }
        finalResultData = newResultData;

        // Grow UV array to keep parametric coordinates aligned with resultData.
        const newCombinedVerts = new Float32Array(combinedVerts.length + midUVBatch.length);
        newCombinedVerts.set(combinedVerts);
        newCombinedVerts.set(midUVBatch, combinedVerts.length);
        finalCombinedVerts = newCombinedVerts;

        // Grow index array while preserving the downstream contract:
        // all outer-wall triangles must stay in a leading contiguous slice.
        const nonOuterIdxs = combinedIdxs.slice(outerIdxCount);
        const newCombinedIdxs = new Uint32Array(combinedIdxs.length + newTris.length);
        newCombinedIdxs.set(combinedIdxs.slice(0, outerIdxCount));
        for (let i = 0; i < newTris.length; i++) {
            newCombinedIdxs[outerIdxCount + i] = newTris[i];
        }
        newCombinedIdxs.set(nonOuterIdxs, outerIdxCount + newTris.length);
        finalCombinedIdxs = newCombinedIdxs;

        // R46: Build chain midpoint metadata for downstream re-snap in PEC
        for (const idx of appliedChainSplitIndices) {
            const se = appliedSplits[idx].se;
            chainMidpoints.push({
                vertexIdx: resultData.length / 3 + idx,
                u: midUVBatch[idx * 3],
                t: midUVBatch[idx * 3 + 1],
                v0: se.v0,
                v1: se.v1,
                u0: combinedVerts[se.v0 * 3],
                u1: combinedVerts[se.v1 * 3],
            });
        }
    }

    const splitCount = appliedSplitCount;
    const subdivMs = performance.now() - subdivStart;

    return {
        resultData: finalResultData,
        uvs: finalCombinedVerts,
        indices: finalCombinedIdxs,
        splitCount,
        outerIdxCount: outerIdxCount + splitCount * 6,
        chainMidpoints,
        stats: {
            avgGridEdge,
            interiorThreshold: subdivThreshold2,
            boundaryThreshold: boundarySubdivThreshold2,
            featureThreshold: featureSubdivThreshold2,
            candidates: edgesToSplit.length,
            boundaryTrisAdded,
            protectedRejects,
            sagSkipped,
            timeMs: subdivMs,
        },
    };
}
