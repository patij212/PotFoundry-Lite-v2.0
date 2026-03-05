/**
 * parametric/OuterWallTessellator.ts — Chain-constrained outer wall mesh generation.
 *
 * Builds the outer wall triangulation with feature chain points as first-class
 * vertices. Implements v20.0 per-row UV snapping for exact ridge positioning
 * and constraint-aware strip triangulation for chain edge enforcement.
 *
 * Extracted from ParametricExportComputer.ts for modularity and testability.
 *
 * @module OuterWallTessellator
 */

import type { FeatureChain } from './types';
import { bsearchFloor } from './GridBuilder';
import {
    triangulateChainStrip,
    createEmptyStats,
    DEFAULT_CHAIN_STRIP_CONFIG,
    type ChainStripConfig,
} from './ChainStripTriangulator';

// ============================================================================
// Types
// ============================================================================

/**
 * A chain point remapped to UV space with a unique vertex index.
 * Used during outer wall tessellation to track chain vertices
 * that are inserted into the grid mesh.
 */
export interface ChainVertex {
    /** U position in [0, 1) */
    u: number;
    /** Final row index in the T grid */
    rowIdx: number;
    /** Explicit T-position for 2D companions (undefined for grid-row vertices) */
    t?: number;
    /** Global vertex index in the combined vertex buffer */
    vertexIdx: number;
    /** Index of the chain this vertex belongs to */
    chainId: number;
    /** Index within the chain (-1 for interpolated points) */
    pointIdx: number;
}

/**
 * A vertex in a merged row strip, combining grid and chain vertices.
 */
export interface StripVertex {
    /** Global vertex index */
    idx: number;
    /** U position */
    u: number;
    /** Whether this is a chain vertex (vs grid vertex) */
    isChain: boolean;
    /** Grid column this vertex belongs to or is nearest to */
    gridCol: number;
}

/**
 * Return type for buildCDTOuterWall.
 */
export interface OuterWallResult {
    /** Interleaved vertex buffer (u, t, surfaceId) × N */
    vertices: Float32Array;
    /** Triangle index buffer */
    indices: Uint32Array;
    /** Per-quad map: index into indices buffer, or -1 for chain/seam cells */
    quadMap: Int32Array;
    /** Number of grid vertices (before chain vertices) */
    gridVertexCount: number;
    /** Chain edge pairs (vertex index tuples) */
    chainEdges: Array<[number, number]>;
    /** Map from original chain row index to final row index in the generated grid */
    origToFinal: Map<number, number>;
    /** Map from chain vertex index → chainId (for FeatureEdgeGraph construction) */
    chainVertexChainIds: Map<number, number>;
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Pot geometry parameters for stretch estimation. */
export interface PotGeometryParams {
    /** Bottom radius (mm). */
    Rb: number;
    /** Top radius (mm). */
    Rt: number;
    /** Profile exponent. */
    expn: number;
}

/**
 * Estimate circumferential stretch factor at a given normalized height.
 *
 * The pot's radius at height t (0=bottom, 1=top) follows:
 *   R(t) = Rb + (Rt - Rb) × t^expn
 *
 * The circumferential stretch relative to the narrowest point is R(t)/Rmin.
 * At the equator (widest radius), UV distances underestimate 3D distances
 * by this factor. Compensating by placing vertices closer in UV at high
 * stretch ensures approximately uniform 3D spacing.
 *
 * @param t     Normalized height [0, 1]
 * @param params Pot geometry parameters
 * @returns     Stretch factor ≥ 1.0 (1.0 at narrowest, higher at wider radii)
 */
export function estimateCircumferentialStretch(t: number, params: PotGeometryParams): number {
    const R = params.Rb + (params.Rt - params.Rb) * Math.pow(Math.max(0, Math.min(1, t)), params.expn);
    const Rmin = Math.min(params.Rb, params.Rt);
    if (Rmin <= 0) return 1.0;
    return Math.max(1.0, R / Rmin);
}

/** Seam threshold: skip chain edges crossing more than this U-delta */
const SEAM_THRESHOLD = 0.4;

/** Seam guard: skip grid cells wider than this */
const SEAM_GUARD = 0.3;

// ============================================================================
// Crossing constraint helpers
// ============================================================================

/**
 * Test whether two 2D line segments (p0→p1) and (q0→q1) properly intersect
 * (crossing, not touching at endpoints). Uses the orientation-test method.
 *
 * @returns true if the segments cross each other's interiors
 */
function segmentsCross(
    p0u: number, p0t: number, p1u: number, p1t: number,
    q0u: number, q0t: number, q1u: number, q1t: number,
): boolean {
    // Cross product of (b-a) × (c-a)
    const cross = (au: number, at: number, bu: number, bt: number, cu: number, ct: number) =>
        (bu - au) * (ct - at) - (bt - at) * (cu - au);

    const d1 = cross(q0u, q0t, q1u, q1t, p0u, p0t);
    const d2 = cross(q0u, q0t, q1u, q1t, p1u, p1t);
    const d3 = cross(p0u, p0t, p1u, p1t, q0u, q0t);
    const d4 = cross(p0u, p0t, p1u, p1t, q1u, q1t);

    // Proper crossing: endpoints of each segment are on opposite sides of the other
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }
    return false;
}

/**
 * Insert micro-rows into tPositions at midpoints of steep chain crossings.
 *
 * When a chain segment crosses >1 grid column within a single row band,
 * the UV-snapped vertices in adjacent rows are far apart in U, creating
 * sawtooth artifacts. Inserting a micro-row between those rows gives the
 * chain an intermediate step, producing smoother triangulation.
 *
 * @param tPositions   Current T-row positions.
 * @param chains       Feature chains.
 * @param origToFinal  Mapping from original chain row → final row index.
 * @param unionU       Sorted U-column positions.
 * @returns            Expanded tPositions, updated origToFinal, and count of inserted micro-rows.
 */
export function insertMicroRowsForSteepCrossings(
    tPositions: Float32Array,
    chains: FeatureChain[],
    origToFinal: Map<number, number>,
    unionU: Float32Array,
): { tPositions: Float32Array; origToFinal: Map<number, number>; microRowCount: number } {
    const numU = unionU.length;
    if (numU < 2) return { tPositions, origToFinal, microRowCount: 0 };

    // Identify steep crossings that need micro-rows
    const microTSet = new Set<string>();
    const microTValues: number[] = [];

    for (const chain of chains) {
        for (let k = 1; k < chain.points.length; k++) {
            const p0 = chain.points[k - 1];
            const p1 = chain.points[k];
            const r0 = origToFinal.get(p0.row);
            const r1 = origToFinal.get(p1.row);
            if (r0 === undefined || r1 === undefined) continue;
            if (Math.abs(r1 - r0) !== 1) continue; // only single-row bands

            const col0 = bsearchFloor(unionU, Math.max(0, Math.min(1 - 1e-7, p0.u)));
            const col1 = bsearchFloor(unionU, Math.max(0, Math.min(1 - 1e-7, p1.u)));
            let colGap = Math.abs(col1 - col0);
            if (colGap > numU / 2) colGap = numU - colGap; // circular wrap

            if (colGap > 1) {
                const lowRow = Math.min(r0, r1);
                const highRow = Math.max(r0, r1);
                const tMid = (tPositions[lowRow] + tPositions[highRow]) / 2;
                const key = tMid.toFixed(10);
                if (!microTSet.has(key)) {
                    microTSet.add(key);
                    microTValues.push(tMid);
                }
            }
        }
    }

    if (microTValues.length === 0) {
        return { tPositions, origToFinal, microRowCount: 0 };
    }

    // Build new T array: merge existing T values with micro-rows
    const allTs: Array<{ t: number; origIdx: number }> = [];
    for (let i = 0; i < tPositions.length; i++) {
        allTs.push({ t: tPositions[i], origIdx: i });
    }
    for (const mt of microTValues) {
        allTs.push({ t: mt, origIdx: -1 });
    }
    allTs.sort((a, b) => a.t - b.t);

    const newTPositions = new Float32Array(allTs.length);
    const oldToNew = new Map<number, number>();
    for (let i = 0; i < allTs.length; i++) {
        newTPositions[i] = allTs[i].t;
        if (allTs[i].origIdx >= 0) {
            oldToNew.set(allTs[i].origIdx, i);
        }
    }

    // Rebuild origToFinal with shifted indices
    const newOrigToFinal = new Map<number, number>();
    for (const [origRow, oldFinalRow] of origToFinal) {
        const newFinalRow = oldToNew.get(oldFinalRow);
        if (newFinalRow !== undefined) {
            newOrigToFinal.set(origRow, newFinalRow);
        }
    }

    return {
        tPositions: newTPositions,
        origToFinal: newOrigToFinal,
        microRowCount: microTValues.length,
    };
}

// NOTE: sweepRegion, simpleSweep, constraintAwareTriangulate removed in v23.0.
// All strip triangulation now lives in ChainStripTriangulator.ts.

// ============================================================================
// Main function
// ============================================================================

// ── Catmull-Rom chain subdivision ──────────────────────────────────────────

/** Seam-crossing threshold for subdivision: skip edges with |Δu| above this */
const SUBDIV_SEAM_THRESHOLD = 0.4;

/**
 * Subdivide a chain's fullChain using Catmull-Rom interpolation.
 * Inserts 2 intermediate vertices per single-row-step edge for C¹ smooth
 * constraint paths. Multi-row-gap and seam-crossing edges pass through
 * without subdivision.
 *
 * @deprecated Removed in v27 — CatRom subdivision causes overshoot at inflection
 * points. Use piecewise-linear (fullChain) directly. Retained for unit test
 * coverage and potential future re-evaluation.
 *
 * @param fullChain - Sequential chain vertices (may include gap-fill interpolations)
 * @param activeTPositions - Row T-positions array for explicit t computation
 * @param numT - Number of T-positions
 * @param chainId - Chain ID for new vertices
 * @param nextVertexIdx - Mutable counter for vertex index assignment
 * @returns Object with subdivided chain (original + new vertices in order)
 *          and array of new ChainVertex entries to append to chainVertices
 */
export function subdivideFullChain(
    fullChain: ChainVertex[],
    activeTPositions: Float32Array | number[],
    numT: number,
    chainId: number,
    nextVertexIdx: { value: number }
): { subdivided: ChainVertex[]; newVertices: ChainVertex[] } {
    if (fullChain.length < 2) {
        return { subdivided: [...fullChain], newVertices: [] };
    }

    const newVertices: ChainVertex[] = [];
    const subdivided: ChainVertex[] = [];

    for (let i = 0; i < fullChain.length; i++) {
        subdivided.push(fullChain[i]);

        if (i >= fullChain.length - 1) continue;

        const p_i = fullChain[i];
        const p_i1 = fullChain[i + 1];

        // Only subdivide single-row-step edges
        if (Math.abs(p_i1.rowIdx - p_i.rowIdx) !== 1) continue;

        // Skip seam-crossing edges
        let edgeDu = p_i1.u - p_i.u;
        if (edgeDu > 0.5) edgeDu -= 1;
        if (edgeDu < -0.5) edgeDu += 1;
        if (Math.abs(edgeDu) > SUBDIV_SEAM_THRESHOLD) continue;

        // 4 control points with boundary mirror extension
        const p0 = i > 0 ? fullChain[i - 1] : mirrorVertex(fullChain[1], fullChain[0], numT);
        const p3 = i + 2 < fullChain.length ? fullChain[i + 2] : mirrorVertex(fullChain[i], fullChain[i + 1], numT);

        const rowLo = Math.min(p_i.rowIdx, p_i1.rowIdx);
        const rowHi = Math.max(p_i.rowIdx, p_i1.rowIdx);
        const tLo = activeTPositions[rowLo];
        const tHi = rowHi < numT ? activeTPositions[rowHi] : tLo;

        // Generate 2 subdivision points at t=1/3 and t=2/3
        for (const frac of [1 / 3, 2 / 3]) {
            let u = catmullRomInterp(p0.u, p_i.u, p_i1.u, p3.u, frac);
            // Clamp and wrap U to [0, 1-1e-7]
            u = ((u % 1) + 1) % 1;
            u = Math.max(0, Math.min(1 - 1e-7, u));

            const t = tLo + (tHi - tLo) * frac;

            const cv: ChainVertex = {
                u,
                rowIdx: rowLo,
                t,
                vertexIdx: nextVertexIdx.value++,
                chainId,
                pointIdx: -1,
            };
            newVertices.push(cv);
            subdivided.push(cv);
        }
    }

    return { subdivided, newVertices };
}

/**
 * Mirror a vertex around an anchor for Catmull-Rom boundary extension.
 * Produces a virtual control point by reflecting `reflected` around `anchor`.
 */
function mirrorVertex(reflected: ChainVertex, anchor: ChainVertex, numT: number): ChainVertex {
    const mirrorU = Math.max(0, Math.min(1 - 1e-7, 2 * anchor.u - reflected.u));
    const mirrorRow = Math.max(0, Math.min(numT - 1, 2 * anchor.rowIdx - reflected.rowIdx));
    return {
        u: mirrorU,
        rowIdx: mirrorRow,
        vertexIdx: -1, // virtual, not in vertex buffer
        chainId: anchor.chainId,
        pointIdx: -1,
    };
}

/**
 * Standard Catmull-Rom interpolation for a single coordinate.
 * q(t) = 0.5 * ((2·p1) + (-p0 + p2)·t + (2·p0 - 5·p1 + 4·p2 - p3)·t² + (-p0 + 3·p1 - 3·p2 + p3)·t³)
 */
function catmullRomInterp(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
}

/**
 * Build the outer wall mesh with chain points as first-class vertices.
 *
 * v16.13 CHAIN-CONSTRAINED TESSELLATION:
 * Instead of generating a grid and patching the nearest column, this approach:
 *   1. Generates the base grid vertices (numU × numT)
 *   2. INSERTS chain points as additional vertices (appended after grid)
 *   3. For grid cells containing chain points, splits the cell into fan
 *      triangles around the chain vertex — the chain point IS a mesh vertex
 *   4. Chain edges (consecutive chain points) are enforced as mesh edges
 *      by triangulating chain-occupied cells to connect the chain vertices
 *   5. Grid cells without chain points are triangulated normally (2 tris)
 *
 * This ensures every chain point is an actual mesh vertex and consecutive
 * chain points are connected by mesh edges — the chain IS the tessellation
 * constraint, not a post-hoc patch.
 *
 * The grid stays at numU × numT (no extra columns/rows). Chain points are
 * extra vertices beyond the grid, inserted into the cells they occupy.
 *
 * @param chains          Feature chains from Phase 2.5 (linked per-row peaks)
 * @param rowMapping      Mapping from final rows to original rows
 * @param tPositions      T positions for all rows (original + inserted)
 * @param unionU          Union grid U positions (base grid)
 * @param _targetOuterTris Target triangle count for the outer wall (reserved)
 * @param surfaceId       Surface ID (0 for outer wall)
 * @returns OuterWallResult with vertices, indices, quadMap, gridVertexCount, chainEdges
 */
export function buildCDTOuterWall(
    chains: FeatureChain[],
    rowMapping: number[],
    tPositions: Float32Array,
    unionU: Float32Array,
    _targetOuterTris: number,
    surfaceId: number = 0,
    chainStripConfig: ChainStripConfig = DEFAULT_CHAIN_STRIP_CONFIG,
    potGeometry?: PotGeometryParams,
): OuterWallResult {
    const buildStart = performance.now();

    // Build reverse map: original row → final row index
    let origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    // ── 0. Insert micro-rows for steep spiral chain crossings (sawtooth fix) ──
    let activeTPositions = tPositions;
    const microResult = insertMicroRowsForSteepCrossings(
        activeTPositions, chains, origToFinal, unionU
    );
    if (microResult.microRowCount > 0) {
        activeTPositions = microResult.tPositions;
        origToFinal = microResult.origToFinal;
        console.log(`[CDT] Inserted ${microResult.microRowCount} micro-rows for steep crossings`);
    }

    const numT = activeTPositions.length;
    const numU = unionU.length;
    const gridVertexCount = numU * numT;

    // ── 1. Collect chain points remapped to UV space with vertex indices ──

    // Each chain point gets a unique vertex index (appended after grid)
    const chainVertices: ChainVertex[] = [];
    const cellsPerRow = numU - 1;

    // Chain edge segments: pairs of consecutive chain vertex indices.
    // After interpolation, every edge spans exactly 1 row band.
    const chainEdges: Array<[number, number]> = [];

    let nextVertexIdx = gridVertexCount;

    // v16.14: For chain edges spanning multiple rows (chain skips a row where
    // no feature was detected), interpolate intermediate chain vertices so
    // that every chain edge spans exactly one row band.
    let interpolatedCount = 0;

    for (let cIdx = 0; cIdx < chains.length; cIdx++) {
        const chain = chains[cIdx];
        if (chain.points.length < 2) continue;

        // First pass: remap chain points to final row indices
        const rawRemapped: ChainVertex[] = [];
        for (let pIdx = 0; pIdx < chain.points.length; pIdx++) {
            const pt = chain.points[pIdx];
            const fr = origToFinal.get(pt.row);
            if (fr === undefined || fr < 0 || fr >= numT) continue;

            const u = Math.max(0, Math.min(1 - 1e-7, pt.u));

            const cv: ChainVertex = {
                u,
                rowIdx: fr,
                vertexIdx: nextVertexIdx++,
                chainId: cIdx,
                pointIdx: pIdx
            };
            chainVertices.push(cv);
            rawRemapped.push(cv);
        }

        // Second pass: for each consecutive pair, if they span >1 row,
        // insert interpolated chain vertices at intermediate rows.
        const fullChain: ChainVertex[] = [];
        for (let k = 0; k < rawRemapped.length; k++) {
            fullChain.push(rawRemapped[k]);

            if (k < rawRemapped.length - 1) {
                const p0 = rawRemapped[k];
                const p1 = rawRemapped[k + 1];

                // Skip seam-crossing edges for interpolation direction.
                // NOTE: This uses wrap-correction intentionally — we need the physical
                // distance/direction to place interpolated vertices on the correct side
                // of the seam. The edge recording loop below uses raw UV delta
                // to exclude seam-spanning edges from the constraint set.
                let du = p1.u - p0.u;
                if (du > 0.5) du -= 1;
                if (du < -0.5) du += 1;
                if (Math.abs(du) > SEAM_THRESHOLD) continue;

                const rowGap = p1.rowIdx - p0.rowIdx;
                if (rowGap <= 1 && rowGap >= -1) {
                    continue; // edge recorded in the next loop
                }

                // Multi-row gap: interpolate intermediate vertices
                const dir = rowGap > 0 ? 1 : -1;
                const steps = Math.abs(rowGap);
                for (let s = 1; s < steps; s++) {
                    const frac = s / steps;
                    let interpU = p0.u + du * frac;
                    interpU = Math.max(0, Math.min(1 - 1e-7, ((interpU % 1) + 1) % 1));
                    const interpRow = p0.rowIdx + dir * s;

                    if (interpRow < 0 || interpRow >= numT) continue;

                    const interpCV: ChainVertex = {
                        u: interpU,
                        rowIdx: interpRow,
                        vertexIdx: nextVertexIdx++,
                        chainId: cIdx,
                        pointIdx: -1
                    };
                    chainVertices.push(interpCV);
                    fullChain.push(interpCV);
                    interpolatedCount++;
                }
            }
        }

        // v27.0: CatRom subdivision removed — piecewise-linear chain (fullChain)
        // used directly. CatRom caused overshoot at inflection points.
        const finalChain = fullChain;

        // Record chain edges between consecutive finalChain entries.
        // v27.0: CatRom subdivision is no longer applied, so sub-edges with
        // rowGap=0 are rare. The rowGap===0 && !isSubdivEdge guard is retained
        // for backward compatibility: interpolated gap-fill vertices (pointIdx<0)
        // may still produce same-row edges that should be kept.
        for (let k = 1; k < finalChain.length; k++) {
            const p0 = finalChain[k - 1];
            const p1 = finalChain[k];
            const du = Math.abs(p1.u - p0.u);
            // Raw UV delta: seam-crossing edges have |Δu| ≈ 0.99, far above threshold.
            // The interpolation pass above intentionally uses wrap-correction to compute
            // physically correct intermediate positions; this edge filter intentionally
            // does NOT wrap-correct, so seam-spanning edges are excluded from the mesh.
            if (du > SEAM_THRESHOLD) continue;
            const rowGap = Math.abs(p1.rowIdx - p0.rowIdx);
            const isSubdivEdge = p0.pointIdx < 0 || p1.pointIdx < 0;
            if (rowGap > 1) continue;
            if (rowGap === 0 && !isSubdivEdge) continue;
            chainEdges.push([p0.vertexIdx, p1.vertexIdx]);
        }
    }

    // v21.0 CAG: Chain vertices are first-class mesh vertices appended after
    // grid vertices. Transition vertices and UV-snapping are no longer needed —
    // the CDF-adaptive grid with Gaussian feature floor provides smooth density
    // near chain features, and dead zones prevent redundant column placement.

    // ── 1.5: Insert 2D companion point cloud around each chain vertex ──
    // T-Ladder design: The CDF-adaptive grid already provides dense U-coverage
    // near chain features. The real deficit is T-density — chain vertices sit ON
    // row boundaries, creating long CDT slivers spanning the full T-gap between
    // rows. The T-Ladder places Steiner points at intermediate T-positions within
    // each adjacent band, centered on each chain vertex's U-position with optional
    // U-spread. This breaks up slivers and produces well-shaped triangles.
    const companionVertices: ChainVertex[] = [];
    const density = Math.max(1, Math.min(12, chainStripConfig.densityMultiplier));
    const SEAM_COMPANION_GUARD = 1e-6; // minimal seam guard (Verifier C1 amendment)
    const COMPANION_DEDUP_THRESHOLD = 1e-5; // distance below which companions are skipped
    const ASPECT_MATCH_FACTOR = 0.4; // U-spread relative to T-gap for near-equilateral spacing
    const MIN_LATERAL_CLEARANCE = 0.002;   // minimum U-offset from chain vertex
    const MIN_TGAP_FOR_COMPANIONS = 0.001; // skip micro-row bands with tiny T-gaps
    const CONSTRAINT_GUARD_RADIUS = 0.001; // minimum distance from any constraint edge
    const MAX_COMPANIONS_PER_CV = 20;      // hard cap per chain vertex

    // Capped scaling: density=1-3→(1,1), density=4-7→(1,1), density=8-11→(2,2), density=12→(2,2)
    const nTLevels = Math.max(1, Math.min(2, Math.floor(density / 4)));
    const nUSpread = Math.max(1, Math.min(2, Math.floor(density / 3)));

    // ── Constraint edge spatial index for companion guard zone ──
    // Index chain edges by row band for fast point-to-segment distance checks
    // during companion generation. Prevents companions near constraint paths.
    const constraintsByBand = new Map<number, Array<{u0: number, t0: number, u1: number, t1: number}>>();
    for (const [v0Idx, v1Idx] of chainEdges) {
        const cv0 = chainVertices[v0Idx - gridVertexCount];
        const cv1 = chainVertices[v1Idx - gridVertexCount];
        if (!cv0 || !cv1) continue;
        const bandIdx = Math.min(cv0.rowIdx, cv1.rowIdx);
        const t0 = activeTPositions[cv0.rowIdx];
        const t1 = activeTPositions[cv1.rowIdx];
        let list = constraintsByBand.get(bandIdx);
        if (!list) { list = []; constraintsByBand.set(bandIdx, list); }
        list.push({ u0: cv0.u, t0, u1: cv1.u, t1 });
    }

    let guardRejectCount = 0;

    /** Check if a candidate companion is too close to any constraint edge in the band. */
    function isNearConstraintEdge(cu: number, ct: number, bandIdx: number): boolean {
        const edges = constraintsByBand.get(bandIdx);
        if (!edges) return false;
        for (const e of edges) {
            const dx = e.u1 - e.u0, dy = e.t1 - e.t0;
            const len2 = dx * dx + dy * dy;
            if (len2 < 1e-20) continue;
            const t = Math.max(0, Math.min(1, ((cu - e.u0) * dx + (ct - e.t0) * dy) / len2));
            const projU = e.u0 + t * dx, projT = e.t0 + t * dy;
            const dist = Math.sqrt((cu - projU) ** 2 + (ct - projT) ** 2);
            if (dist < CONSTRAINT_GUARD_RADIUS) {
                guardRejectCount++;
                return true;
            }
        }
        return false;
    }

    /** Try to emit a single companion, applying seam guard, bounds check, and dedup. */
    function tryEmitCompanion(cu: number, ct: number, parent: ChainVertex): void {
        companionPreDedup++;

        // Seam guard: reject companions too close to U=0 or U=1
        if (cu < SEAM_COMPANION_GUARD || cu > 1 - SEAM_COMPANION_GUARD) return;

        // T bounds: must be strictly within [0, 1] parametric range
        if (ct <= 0 || ct >= 1) return;

        // 2D spatial dedup
        if (isDuplicate2D(cu, ct, COMPANION_DEDUP_THRESHOLD)) return;

        companionVertices.push({
            u: cu,
            t: ct,
            rowIdx: parent.rowIdx,
            vertexIdx: nextVertexIdx++,
            chainId: parent.chainId,
            pointIdx: -1,
        });
        addToBuckets(cu, ct);
        companionCount++;
    }

    /** Emit T-Ladder rungs at intermediate T-levels within a band. */
    function emitRungs(
        cv: ChainVertex,
        tLo: number,
        tGap: number,
        bandIdx: number,
    ): void {
        if (tGap < MIN_TGAP_FOR_COMPANIONS) return; // micro-row guard

        const baseSpreadU = Math.max(tGap * ASPECT_MATCH_FACTOR, MIN_LATERAL_CLEARANCE);
        let emitted = 0;

        for (let k = 1; k <= nTLevels; k++) {
            const tFrac = k / (nTLevels + 1);
            const tLevel = tLo + tFrac * tGap;

            // NO center companion — collinear with constraint edge path (Bug B fix)

            // Lateral-only U-spread companions
            for (let m = 1; m <= nUSpread; m++) {
                const uOff = baseSpreadU * m / nUSpread;

                for (const sign of [-1, 1] as const) {
                    const cu = cv.u + sign * uOff;
                    if (emitted >= MAX_COMPANIONS_PER_CV) return;
                    if (!isNearConstraintEdge(cu, tLevel, bandIdx)) {
                        tryEmitCompanion(cu, tLevel, cv);
                        emitted++;
                    }
                }
            }
        }
    }

    // ── 2D spatial-bucket dedup (integer keys, V8-safe) ──
    const BUCKET_SIZE = COMPANION_DEDUP_THRESHOLD * 10; // ~1e-4
    interface CompanionEntry { u: number; t: number; }
    const companionBuckets = new Map<number, CompanionEntry[]>();

    function bucketKey(u: number, t: number): number {
        const bu = Math.floor(u / BUCKET_SIZE);
        const bt = Math.floor(t / BUCKET_SIZE);
        return bu * 100000 + bt; // single integer key — no string hashing
    }

    function isDuplicate2D(cu: number, ct: number, threshold: number): boolean {
        const bx = Math.floor(cu / BUCKET_SIZE);
        const by = Math.floor(ct / BUCKET_SIZE);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = (bx + dx) * 100000 + (by + dy);
                const entries = companionBuckets.get(key);
                if (!entries) continue;
                for (const e of entries) {
                    const dist2 = (cu - e.u) ** 2 + (ct - e.t) ** 2;
                    if (dist2 < threshold * threshold) return true;
                }
            }
        }
        return false;
    }

    function addToBuckets(cu: number, ct: number): void {
        const key = bucketKey(cu, ct);
        let entries = companionBuckets.get(key);
        if (!entries) { entries = []; companionBuckets.set(key, entries); }
        entries.push({ u: cu, t: ct });
    }

    // Seed buckets with existing chain vertex positions
    for (const cv of chainVertices) {
        addToBuckets(cv.u, activeTPositions[cv.rowIdx]);
    }

    let companionCount = 0;
    let companionPreDedup = 0;

    // ── T-Ladder companion generation ──
    // For each chain vertex, emit companions at intermediate T-levels within the
    // band above (rows j to j+1) and band below (rows j-1 to j). At each T-level,
    // emit lateral-only companions (no center — avoids constraint collinearity).
    for (const cv of chainVertices) {
        if (cv.pointIdx < 0) continue; // skip interpolated micro-row vertices (C5)
        const tRow = activeTPositions[cv.rowIdx];

        // Process band above (between row j and j+1)
        if (cv.rowIdx < numT - 1) {
            const tAbove = activeTPositions[cv.rowIdx + 1];
            const tGap = tAbove - tRow;
            if (tGap > 1e-9) {
                emitRungs(cv, tRow, tGap, cv.rowIdx);
            }
        }

        // Process band below (between row j-1 and j)
        if (cv.rowIdx > 0) {
            const tBelow = activeTPositions[cv.rowIdx - 1];
            const tGap = tRow - tBelow;
            if (tGap > 1e-9) {
                emitRungs(cv, tBelow, tGap, cv.rowIdx - 1);
            }
        }
    }

    const allChainVertices = [...chainVertices, ...companionVertices];
    const allChainEdges = chainEdges;

    // ── Build interiorByBand map: bucket 2D interior vertices by T-position band ──
    // Uses bsearchFloor on activeTPositions, NOT rowIdx (C6 fix: negative-dt
    // companions are bucketed into the correct band based on their T-position).
    // v25.0: Iterate all chain + companion vertices (not just companions) so CatRom subdivision
    // vertices with explicit t are included and participate in CDT.
    const interiorByBand = new Map<number, ChainVertex[]>();
    for (const cv of allChainVertices) {
        if (cv.t === undefined) continue;
        const bandIdx = bsearchFloor(activeTPositions, cv.t);
        if (bandIdx < 0 || bandIdx >= numT - 1) continue;
        if (cv.t <= activeTPositions[bandIdx] || cv.t >= activeTPositions[bandIdx + 1]) continue;
        let list = interiorByBand.get(bandIdx);
        if (!list) { list = []; interiorByBand.set(bandIdx, list); }
        list.push(cv);
    }

    // ── 2D Companion diagnostics ──
    let interiorCollected = 0;
    for (const [, list] of interiorByBand) interiorCollected += list.length;
    if (companionCount > 0) {
        const collectionRate = companionCount > 0 ? (interiorCollected / companionCount * 100).toFixed(1) : '0';
        console.log(
            `[CDT] T-Ladder companions: ${companionPreDedup} generated, ${companionCount} after dedup, ` +
            `${interiorCollected} collected as interior (${collectionRate}%), ` +
            `density=${density}, nTLevels=${nTLevels}, nUSpread=${nUSpread}, guardRejects=${guardRejectCount}`
        );
    }

    // ── 2. Generate vertices: grid + chain vertices + companions ──
    const totalVertexCount = gridVertexCount + allChainVertices.length;
    const vertices = new Float32Array(totalVertexCount * 3);

    // Grid vertices
    let vIdx = 0;
    for (let j = 0; j < numT; j++) {
        for (let i = 0; i < numU; i++) {
            vertices[vIdx++] = unionU[i];
            vertices[vIdx++] = activeTPositions[j];
            vertices[vIdx++] = surfaceId;
        }
    }

    // Append chain vertices after the grid
    for (const cv of allChainVertices) {
        vertices[vIdx++] = cv.u;
        vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];
        vertices[vIdx++] = surfaceId;
    }

    // ── 3. Build per-row chain vertex lookup (sorted by U) ──
    // C1 fix: 2D companions (cv.t !== undefined) are excluded from
    // rowChainVerts — they must NOT appear in buildMergedRow output.
    // They exist only as interior vertices passed to CDT.
    const rowChainVerts = new Map<number, ChainVertex[]>();
    for (const cv of allChainVertices) {
        if (cv.t !== undefined) continue; // 2D companions are interior-only
        let list = rowChainVerts.get(cv.rowIdx);
        if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
        list.push(cv);
    }
    for (const [, list] of rowChainVerts) {
        list.sort((a, b) => a.u - b.u);
    }

    // ── 4. Full-row strip triangulation ──
    const totalCells = cellsPerRow * (numT - 1);
    const indexBuf: number[] = [];

    const quadMap = new Int32Array(totalCells);
    quadMap.fill(-1);
    let seamSkipCount = 0;
    let chainCellCount = 0;
    let crossCellEdgeCount = 0;
    let windingFixCount = 0;
    let crossingConstraintsRemoved = 0;
    const chainStripStats = createEmptyStats();

    // Pre-build row-indexed chain edge lookup
    const rowBandEdges = new Map<number, Array<[number, number]>>();
    for (const [v0, v1] of allChainEdges) {
        const cv0 = allChainVertices[v0 - gridVertexCount];
        const cv1 = allChainVertices[v1 - gridVertexCount];
        if (!cv0 || !cv1) continue;
        if (Math.abs(cv0.u - cv1.u) > SEAM_THRESHOLD) continue;
        const r0 = Math.min(cv0.rowIdx, cv1.rowIdx);
        const r1 = Math.max(cv0.rowIdx, cv1.rowIdx);
        // Allow rowGap 0 (subdivision sub-edges within a band) and 1 (normal cross-row)
        if (r1 - r0 > 1) continue;
        let list = rowBandEdges.get(r0);
        if (!list) { list = []; rowBandEdges.set(r0, list); }
        list.push([v0, v1]);
    }

    // Batch 2 remap: track chain→grid vertex replacements made by buildMergedRow
    // when a chain vertex coincides with a grid vertex. This is needed so
    // allChainEdges can be updated before edge verification.
    const batch2Remap = new Map<number, number>();

    // Build merged row: grid columns interleaved with chain points.
    const buildMergedRow = (row: number): StripVertex[] => {
        const result: StripVertex[] = [];
        const chainList = rowChainVerts.get(row) || [];
        let ci = 0;

        for (let i = 0; i < numU; i++) {
            while (ci < chainList.length && chainList[ci].u < unionU[i] - 1e-9) {
                const col = i > 0 ? i - 1 : 0;
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: col });
                ci++;
            }

            if (ci < chainList.length && Math.abs(chainList[ci].u - unionU[i]) <= 1e-6) {
                // Batch 2: When chain vertex coincides with a UV-snapped grid vertex,
                // prefer the grid vertex index so strip boundary shares indices with
                // adjacent standard cells (eliminates T-junctions / non-manifold edges).
                const gridIdx = row * numU + i;
                const gridU = vertices[gridIdx * 3];
                if (Math.abs(gridU - chainList[ci].u) <= 1e-6) {
                    result.push({ idx: gridIdx, u: gridU, isChain: false, gridCol: i });
                    // Record so allChainEdges can be updated for edge verification
                    batch2Remap.set(chainList[ci].vertexIdx, gridIdx);
                } else {
                    result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: i });
                }
                ci++;
            } else {
                const actualU = vertices[(row * numU + i) * 3 + 0];
                result.push({ idx: row * numU + i, u: actualU, isChain: false, gridCol: i });
            }

            const uNext = (i < numU - 1) ? unionU[i + 1] : 1.0 + 1e-6;
            while (ci < chainList.length && chainList[ci].u < uNext - 1e-9) {
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: i });
                ci++;
            }
        }
        while (ci < chainList.length) {
            result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: numU - 1 });
            ci++;
        }

        // Post-pass: sort by U and eliminate duplicate vertices.
        //
        // UV-snapping moves grid vertex U to match a chain vertex's U, but
        // buildMergedRow's interleaving uses unionU (the original grid column
        // positions) for ordering. When a grid vertex is snapped away from its
        // original position, chain vertices can appear after the grid vertex
        // even though their U is smaller — producing non-monotonic rows.
        // CDT builds boundary edges between consecutive entries, so a backward
        // step (e.g. grid@0.0832 → support@0.0826) creates crossed constraints
        // that produce degenerate triangles and broken topology.
        //
        // Sorting by U ensures monotonic ordering for CDT. The subsequent dedup
        // catches coincident grid+chain entries that become adjacent after sort.
        result.sort((a, b) => a.u - b.u);

        if (result.length > 1) {
            const deduped: StripVertex[] = [result[0]];
            for (let k = 1; k < result.length; k++) {
                const prev = deduped[deduped.length - 1];
                if (Math.abs(result[k].u - prev.u) <= 1e-6) {
                    if (!prev.isChain && result[k].isChain) {
                        // Previous is grid (keep), current is chain (skip+remap)
                        batch2Remap.set(result[k].idx, prev.idx);
                    } else if (prev.isChain && !result[k].isChain) {
                        // Previous is chain, current is grid: replace previous
                        batch2Remap.set(prev.idx, result[k].idx);
                        deduped[deduped.length - 1] = result[k];
                    } else {
                        // Both grid or both chain at same position: keep first, remap second
                        batch2Remap.set(result[k].idx, prev.idx);
                    }
                } else {
                    deduped.push(result[k]);
                }
            }
            return deduped;
        }

        return result;
    };

    // ── Two-pass colHasChain: ensure adjacent bands agree on CDT columns ──
    // Pass 1: Compute rawColHasChain for each band independently.
    // Each band marks columns from: (a) chain edges spanning the band,
    // (b) chain/support vertices at the bot row, (c) chain/support vertices
    // at the top row. Adjacent bands may mark DIFFERENT columns at their
    // shared row — one band's CDT includes a support vertex between two
    // grid columns while the other band uses standard cells there, creating
    // mismatched boundary edges (~3 per mismatch, ~20K total).
    const rawColHasChain: Uint8Array[] = [];
    for (let j = 0; j < numT - 1; j++) {
        const bandCols = new Uint8Array(cellsPerRow);

        const bandEdges = rowBandEdges.get(j);
        if (bandEdges) {
            for (const [v0, v1] of bandEdges) {
                const cv0 = allChainVertices[v0 - gridVertexCount];
                const cv1 = allChainVertices[v1 - gridVertexCount];
                if (!cv0 || !cv1) continue;
                const col0raw = bsearchFloor(unionU, cv0.u);
                const col1raw = bsearchFloor(unionU, cv1.u);
                const col0 = col0raw < 0 ? 0 : (col0raw >= cellsPerRow ? cellsPerRow - 1 : col0raw);
                const col1 = col1raw < 0 ? 0 : (col1raw >= cellsPerRow ? cellsPerRow - 1 : col1raw);
                const cMin = Math.min(col0, col1);
                const cMax = Math.max(col0, col1);
                for (let c = cMin; c <= cMax; c++) {
                    bandCols[c] = 1;
                }
            }
        }

        // Mark columns from chain vertices at bot row.
        // With same-row-only ring placement, transition vertices are only at the
        // feature edge's own rows — they correctly expand the strip to cover the
        // transition zone without polluting distant bands.
        const botChain = rowChainVerts.get(j);
        if (botChain) {
            for (const cv of botChain) {
                const col = bsearchFloor(unionU, cv.u);
                const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
                bandCols[gc] = 1;
            }
        }
        const topChain = rowChainVerts.get(j + 1);
        if (topChain) {
            for (const cv of topChain) {
                const col = bsearchFloor(unionU, cv.u);
                const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
                bandCols[gc] = 1;
            }
        }

        rawColHasChain.push(bandCols);
    }

    // Pass 2: Union adjacent bands so shared rows get consistent CDT coverage.
    // effectiveColHasChain[j] = rawColHasChain[j-1] | rawColHasChain[j] | rawColHasChain[j+1]
    const colHasChain = new Uint8Array(cellsPerRow);

    for (let j = 0; j < numT - 1; j++) {
        const botRow = buildMergedRow(j);
        const topRow = buildMergedRow(j + 1);

        const bandEdges = rowBandEdges.get(j);
        const bandConstraintEdges: Array<[number, number]> = [];

        // Compute effective colHasChain: union of this band and adjacent bands.
        // This ensures both sides of a shared row agree on which columns use CDT,
        // preventing mismatched boundary edges from strip-range filtering.
        colHasChain.fill(0);
        const raw = rawColHasChain[j];
        const prev = j > 0 ? rawColHasChain[j - 1] : undefined;
        const next = j < numT - 2 ? rawColHasChain[j + 1] : undefined;
        for (let c = 0; c < cellsPerRow; c++) {
            if (raw[c] || prev?.[c] || next?.[c]) {
                colHasChain[c] = 1;
            }
        }

        // Horizontal expansion: pad N extra columns on each side of marked chain columns.
        // This widens the CDT strip area so triangles merge more fluently with the base mesh.
        const stripExpansion = chainStripConfig.expansion;
        if (stripExpansion > 0) {
            // Work on a copy to avoid cascading expansion within the same pass
            const pre = Uint8Array.from(colHasChain);
            for (let c = 0; c < cellsPerRow; c++) {
                if (pre[c]) {
                    for (let d = 1; d <= stripExpansion; d++) {
                        if (c - d >= 0) colHasChain[c - d] = 1;
                        if (c + d < cellsPerRow) colHasChain[c + d] = 1;
                    }
                }
            }
        }

        if (bandEdges) {
            for (const [v0, v1] of bandEdges) {
                const cv0 = allChainVertices[v0 - gridVertexCount];
                const cv1 = allChainVertices[v1 - gridVertexCount];
                if (!cv0 || !cv1) continue;
                if (Math.abs(cv0.u - cv1.u) > SEAM_THRESHOLD) continue;
                bandConstraintEdges.push([v0, v1]);
            }
        }

        let i = 0;
        while (i < cellsPerRow) {
            const quadIdx = j * cellsPerRow + i;
            const uLeft = unionU[i];
            const uRight = unionU[i + 1];
            const uSpan = uRight - uLeft;

            if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
                indexBuf.push(0, 0, 0, 0, 0, 0);
                quadMap[quadIdx] = -1;
                seamSkipCount++;
                i++;
                continue;
            }

            if (!colHasChain[i]) {
                // Standard cell: 2 triangles with winding verification after UV-snap
                const bl = j * numU + i;
                const br = j * numU + (i + 1);
                const tl = (j + 1) * numU + i;
                const tr = (j + 1) * numU + (i + 1);

                // Read back actual U,T coords (U may have been modified by UV-snap)
                const blU = vertices[bl * 3], blT = vertices[bl * 3 + 1];
                const brU = vertices[br * 3], brT = vertices[br * 3 + 1];
                const tlU = vertices[tl * 3], tlT = vertices[tl * 3 + 1];
                const trU = vertices[tr * 3], trT = vertices[tr * 3 + 1];

                const triBase = indexBuf.length;

                // Triangle 1: bl, br, tr — verify CCW winding via UV cross product
                const cross1 = (brU - blU) * (trT - blT) - (trU - blU) * (brT - blT);
                if (Math.abs(cross1) < 1e-12) {
                    // Degenerate triangle (collinear vertices) — emit as placeholder
                    indexBuf.push(0, 0, 0);
                } else if (cross1 >= 0) {
                    indexBuf.push(bl, br, tr);
                } else {
                    indexBuf.push(bl, tr, br);
                    windingFixCount++;
                }

                // Triangle 2: bl, tr, tl — verify CCW winding via UV cross product
                const cross2 = (trU - blU) * (tlT - blT) - (tlU - blU) * (trT - blT);
                if (Math.abs(cross2) < 1e-12) {
                    // Degenerate triangle (collinear vertices) — emit as placeholder
                    indexBuf.push(0, 0, 0);
                } else if (cross2 >= 0) {
                    indexBuf.push(bl, tr, tl);
                } else {
                    indexBuf.push(bl, tl, tr);
                    windingFixCount++;
                }

                quadMap[quadIdx] = triBase;
                i++;
            } else {
                // Chain segment: contiguous run of chain-involved columns.
                // Break at seam columns to avoid crossing the theta wrap.
                const segStart = i;
                while (i < cellsPerRow && colHasChain[i]) {
                    const span = unionU[i + 1] - unionU[i];
                    if (span > SEAM_GUARD || span < -SEAM_GUARD) break;
                    chainCellCount++;
                    quadMap[j * cellsPerRow + i] = -1;
                    i++;
                }
                const segEnd = i;

                // Skip empty segments (seam break at first column)
                if (segEnd <= segStart) continue;

                const uStripLeft = unionU[segStart];
                const uStripRight = unionU[segEnd];

                const stripBot: StripVertex[] = [];
                const stripTop: StripVertex[] = [];

                for (let bi = 0; bi < botRow.length; bi++) {
                    const sv = botRow[bi];
                    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
                        stripBot.push(sv);
                    }
                }
                const botLeftIdx = j * numU + segStart;
                const botRightIdx = j * numU + segEnd;
                if (stripBot.length === 0 || stripBot[0].idx !== botLeftIdx) {
                    stripBot.unshift({ idx: botLeftIdx, u: uStripLeft, isChain: false, gridCol: segStart });
                }
                if (stripBot[stripBot.length - 1].idx !== botRightIdx) {
                    stripBot.push({ idx: botRightIdx, u: uStripRight, isChain: false, gridCol: segEnd });
                }

                for (let ti = 0; ti < topRow.length; ti++) {
                    const sv = topRow[ti];
                    if (sv.u >= uStripLeft - 1e-9 && sv.u <= uStripRight + 1e-9) {
                        stripTop.push(sv);
                    }
                }
                const topLeftIdx = (j + 1) * numU + segStart;
                const topRightIdx = (j + 1) * numU + segEnd;
                if (stripTop.length === 0 || stripTop[0].idx !== topLeftIdx) {
                    stripTop.unshift({ idx: topLeftIdx, u: uStripLeft, isChain: false, gridCol: segStart });
                }
                if (stripTop[stripTop.length - 1].idx !== topRightIdx) {
                    stripTop.push({ idx: topRightIdx, u: uStripRight, isChain: false, gridCol: segEnd });
                }

                const segConstraints: Array<[number, number]> = [];
                for (const [v0, v1] of bandConstraintEdges) {
                    const cv0 = allChainVertices[v0 - gridVertexCount];
                    const cv1 = allChainVertices[v1 - gridVertexCount];
                    if (!cv0 || !cv1) continue;
                    // R1: Only feature-to-feature edges are hard constraints.
                    // Interpolated micro-row vertices (pointIdx = -1) participate
                    // freely in CDT/sweep without constraint edges.
                    // NOTE: pointIdx < 0 filter removed — all chain edges now
                    // participate as constraints. CDT try/catch provides sweep
                    // fallback if any crossing constraints occur.
                    const uMinE = Math.min(cv0.u, cv1.u);
                    const uMaxE = Math.max(cv0.u, cv1.u);
                    if (uMaxE >= uStripLeft - 1e-9 && uMinE <= uStripRight + 1e-9) {
                        segConstraints.push([v0, v1]);
                    }
                }

                // Synthetic cross-row constraint generation DISABLED.
                // Only feature-to-feature edges (both pointIdx >= 0) are retained
                // as constraints. Interpolated micro-row vertices and transition
                // vertices participate freely in CDT/sweep without constraint edges.

                // Remap constraint endpoints for Batch 2 coincident replacements.
                // buildMergedRow replaces chain vertex indices with grid indices when
                // they coincide; constraints must reference the same indices that
                // appear in stripBot/stripTop, or CDT silently drops them.
                if (batch2Remap.size > 0) {
                    for (let c = 0; c < segConstraints.length; c++) {
                        const [cv0, cv1] = segConstraints[c];
                        const rv0 = batch2Remap.get(cv0);
                        const rv1 = batch2Remap.get(cv1);
                        if (rv0 !== undefined || rv1 !== undefined) {
                            segConstraints[c] = [rv0 ?? cv0, rv1 ?? cv1];
                        }
                    }
                }

                // Collect 2D interior companions for this strip's band and U-range
                const bandInterior = interiorByBand.get(j) || [];
                const stripInteriorVerts: StripVertex[] = [];
                for (const icv of bandInterior) {
                    if (icv.u < uStripLeft - 1e-9 || icv.u > uStripRight + 1e-9) continue;
                    stripInteriorVerts.push({ idx: icv.vertexIdx, u: icv.u, isChain: false, gridCol: -1 });
                }

                // ── Fix missing constraint endpoints (Sub-problem B) ──
                // Ensure all constraint endpoints appear in stripBot or stripTop.
                // The strip U-range filter can exclude chain vertices beyond the
                // strip boundary, causing CDT to silently drop constraint edges.
                let botModified = false, topModified = false;
                for (const [v0, v1] of segConstraints) {
                    for (const vIdx of [v0, v1]) {
                        if (vIdx < gridVertexCount) continue;
                        const cvIdx = vIdx - gridVertexCount;
                        const cv = allChainVertices[cvIdx];
                        if (!cv) continue;
                        const inStrip = stripBot.some(sv => sv.idx === vIdx) ||
                                        stripTop.some(sv => sv.idx === vIdx) ||
                                        stripInteriorVerts.some(sv => sv.idx === vIdx);
                        if (inStrip) continue;
                        // v25.0: Interior vertices (subdivision/companion with explicit t)
                        // must route to stripInteriorVerts, not strip boundaries.
                        if (cv.t !== undefined) {
                            stripInteriorVerts.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
                        } else if (cv.rowIdx === j) {
                            stripBot.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
                            botModified = true;
                        } else if (cv.rowIdx === j + 1) {
                            stripTop.push({ idx: vIdx, u: cv.u, isChain: true, gridCol: -1 });
                            topModified = true;
                        }
                    }
                }
                if (botModified) stripBot.sort((a, b) => a.u - b.u);
                if (topModified) stripTop.sort((a, b) => a.u - b.u);

                // ── P5: Remove crossing constraint edges ──
                // When nearby chains oscillate, their constraint edges can cross
                // in UV space. cdt2d silently drops one crossing constraint,
                // producing "missing" edges and degenerate triangulations.
                // Detect and remove the lower-confidence constraint before CDT.
                if (segConstraints.length >= 2) {
                    const tBot = activeTPositions[j];
                    const tTop = activeTPositions[j + 1];
                    const removed = new Set<number>();

                    // Resolve UV for a constraint endpoint
                    const getUV = (vIdx: number): [number, number] => {
                        if (vIdx < gridVertexCount) {
                            return [vertices[vIdx * 3], vertices[vIdx * 3 + 1]];
                        }
                        const cv = allChainVertices[vIdx - gridVertexCount];
                        return [cv.u, cv.t ?? activeTPositions[cv.rowIdx]];
                    };

                    // Confidence score: prefer keeping edges from longer chains
                    // with detected (not interpolated) endpoints
                    const edgeConfidence = (v0: number, v1: number): number => {
                        let score = 0;
                        if (v0 >= gridVertexCount) {
                            const cv = allChainVertices[v0 - gridVertexCount];
                            if (cv.pointIdx >= 0) score += 2; // detected point
                        }
                        if (v1 >= gridVertexCount) {
                            const cv = allChainVertices[v1 - gridVertexCount];
                            if (cv.pointIdx >= 0) score += 2; // detected point
                        }
                        // Use UV edge length as tiebreaker (longer = more important)
                        const [u0, t0] = getUV(v0);
                        const [u1, t1] = getUV(v1);
                        score += Math.hypot(u1 - u0, (t1 - t0) / (tTop - tBot + 1e-12));
                        return score;
                    };

                    for (let ci = 0; ci < segConstraints.length; ci++) {
                        if (removed.has(ci)) continue;
                        const [a0, a1] = segConstraints[ci];
                        const [a0u, a0t] = getUV(a0);
                        const [a1u, a1t] = getUV(a1);

                        for (let cj = ci + 1; cj < segConstraints.length; cj++) {
                            if (removed.has(cj)) continue;
                            const [b0, b1] = segConstraints[cj];
                            const [b0u, b0t] = getUV(b0);
                            const [b1u, b1t] = getUV(b1);

                            if (segmentsCross(a0u, a0t, a1u, a1t, b0u, b0t, b1u, b1t)) {
                                // Remove the lower-confidence edge
                                const confA = edgeConfidence(a0, a1);
                                const confB = edgeConfidence(b0, b1);
                                if (confA <= confB) {
                                    removed.add(ci);
                                    break; // ci is removed, no more comparisons needed
                                } else {
                                    removed.add(cj);
                                }
                            }
                        }
                    }

                    if (removed.size > 0) {
                        crossingConstraintsRemoved += removed.size;
                        // Filter in-place: rebuild array without removed indices
                        const kept: Array<[number, number]> = [];
                        for (let ci = 0; ci < segConstraints.length; ci++) {
                            if (!removed.has(ci)) kept.push(segConstraints[ci]);
                        }
                        segConstraints.length = 0;
                        segConstraints.push(...kept);
                    }
                }

                triangulateChainStrip(
                    indexBuf, stripBot, stripTop, segConstraints,
                    stripInteriorVerts,
                    allChainVertices, gridVertexCount,
                    activeTPositions[j], activeTPositions[j + 1],
                    chainStripConfig, chainStripStats,
                );
            }
        }
    }

    // Count cross-cell chain edges
    for (const [v0, v1] of allChainEdges) {
        const cv0 = allChainVertices[v0 - gridVertexCount];
        const cv1 = allChainVertices[v1 - gridVertexCount];
        if (cv0 && cv1) {
            const col0 = bsearchFloor(unionU, cv0.u);
            const col1 = bsearchFloor(unionU, cv1.u);
            if (col0 !== col1) crossCellEdgeCount++;
        }
    }

    const indices = new Uint32Array(indexBuf);

    // ── Apply Batch 2 remap to allChainEdges ──
    // buildMergedRow replaces coincident chain vertices with grid indices in the
    // triangulation, but allChainEdges still references the original chain vertex
    // indices. Apply the Batch 2 remap so edge verification works correctly.
    if (batch2Remap.size > 0) {
        for (let e = 0; e < allChainEdges.length; e++) {
            const [v0, v1] = allChainEdges[e];
            const m0 = batch2Remap.get(v0);
            const m1 = batch2Remap.get(v1);
            if (m0 !== undefined || m1 !== undefined) {
                allChainEdges[e] = [m0 ?? v0, m1 ?? v1];
            }
        }
    }

    // ── Batch 6: Global vertex deduplication pass ──
    // Group vertices by UV proximity (quantized to 1e-5 grid) and rewrite
    // index buffer to use canonical index per group (prefer grid over chain).
    let dedupMergeCount = 0;
    const batch6Remap = new Map<number, number>();
    {
        const QUANT = 1e5; // 1e-5 precision
        const uvToCanonical = new Map<string, number>();
        const remap = batch6Remap;
        const totalVerts = vertices.length / 3;

        for (let v = 0; v < totalVerts; v++) {
            const qu = Math.round(vertices[v * 3] * QUANT);
            const qt = Math.round(vertices[v * 3 + 1] * QUANT);
            const key = `${qu}:${qt}`;
            const existing = uvToCanonical.get(key);
            if (existing !== undefined) {
                // Prefer grid vertex (lower index) as canonical
                if (v >= gridVertexCount && existing < gridVertexCount) {
                    remap.set(v, existing);
                    dedupMergeCount++;
                } else if (existing >= gridVertexCount && v < gridVertexCount) {
                    // Remap the existing chain vertex to this grid vertex
                    remap.set(existing, v);
                    uvToCanonical.set(key, v);
                    dedupMergeCount++;
                }
                // Both grid or both chain: keep first as canonical
                else if (existing !== v) {
                    remap.set(v, existing);
                    dedupMergeCount++;
                }
            } else {
                uvToCanonical.set(key, v);
            }
        }

        if (remap.size > 0) {
            for (let i = 0; i < indices.length; i++) {
                const mapped = remap.get(indices[i]);
                if (mapped !== undefined) {
                    indices[i] = mapped;
                }
            }
            // Collapse degenerate triangles created by vertex merging
            for (let t = 0; t < indices.length; t += 3) {
                const a = indices[t], b = indices[t + 1], c = indices[t + 2];
                if (a === b || b === c || a === c) {
                    indices[t] = 0; indices[t + 1] = 0; indices[t + 2] = 0;
                }
            }
            // Sync indexBuf for edge verification below
            for (let i = 0; i < indices.length; i++) {
                indexBuf[i] = indices[i];
            }
            // Also remap allChainEdges so edge verification uses correct indices
            for (let e = 0; e < allChainEdges.length; e++) {
                const [v0, v1] = allChainEdges[e];
                const m0 = remap.get(v0);
                const m1 = remap.get(v1);
                if (m0 !== undefined || m1 !== undefined) {
                    allChainEdges[e] = [m0 ?? v0, m1 ?? v1];
                }
            }
        }
    }
    if (dedupMergeCount > 0) {
        console.log(`[ParametricExport]   v24.0 Global vertex dedup: ${dedupMergeCount} vertices merged`);
    }

    // ── Verify chain edges are actual mesh edges ──
    const meshEdgeSet = new Set<string>();
    for (let t = 0; t < indexBuf.length; t += 3) {
        const a = indexBuf[t], b = indexBuf[t + 1], c = indexBuf[t + 2];
        meshEdgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`);
        meshEdgeSet.add(b < c ? `${b}-${c}` : `${c}-${b}`);
        meshEdgeSet.add(a < c ? `${a}-${c}` : `${c}-${a}`);
    }
    // Build inverse remap: grid vertex → original chain vertex index
    // so we can look up chain vertex data for remapped edges.
    // Includes both batch2Remap and global dedup mappings.
    const inverseRemap = new Map<number, number>();
    for (const [chainIdx, gridIdx] of batch2Remap) {
        inverseRemap.set(gridIdx, chainIdx);
    }
    // Also add global dedup remap entries (batch6Remap populated inside Batch 6 block)
    for (const [sourceIdx, targetIdx] of batch6Remap) {
        if (sourceIdx >= gridVertexCount && targetIdx < gridVertexCount) {
            inverseRemap.set(targetIdx, sourceIdx);
        }
    }
    let enforced = 0, missing = 0;
    let missingSameRow = 0, missingCrossRow = 0;
    // Track primary chain edges (both endpoints are real feature points, not support)
    let primaryTotal = 0, primaryEnforced = 0, primaryMissing = 0;
    const missingExamples: string[] = [];
    for (const [v0, v1] of allChainEdges) {
        // Skip self-edges created when dedup maps both endpoints to the same vertex
        if (v0 === v1) continue;
        // Check if this is a primary chain edge (both endpoints are real feature points)
        const pi0 = v0 - gridVertexCount;
        const pi1 = v1 - gridVertexCount;
        const pcv0 = (pi0 >= 0 && pi0 < allChainVertices.length) ? allChainVertices[pi0] : undefined;
        const pcv1 = (pi1 >= 0 && pi1 < allChainVertices.length) ? allChainVertices[pi1] : undefined;
        const rpcv0 = pcv0 ?? (() => { const o = inverseRemap.get(v0); return o !== undefined ? allChainVertices[o - gridVertexCount] : undefined; })();
        const rpcv1 = pcv1 ?? (() => { const o = inverseRemap.get(v1); return o !== undefined ? allChainVertices[o - gridVertexCount] : undefined; })();
        const isPrimary = rpcv0 && rpcv1 && rpcv0.pointIdx >= 0 && rpcv1.pointIdx >= 0;
        if (isPrimary) primaryTotal++;
        const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
        if (meshEdgeSet.has(key)) {
            enforced++;
            if (isPrimary) primaryEnforced++;
        } else {
            missing++;
            if (isPrimary) primaryMissing++;
            // Categorize as same-row (non-actionable) vs cross-row (real bug)
            const idx0 = v0 - gridVertexCount;
            const idx1 = v1 - gridVertexCount;
            const cv0 = (idx0 >= 0 && idx0 < allChainVertices.length) ? allChainVertices[idx0] : undefined;
            const cv1 = (idx1 >= 0 && idx1 < allChainVertices.length) ? allChainVertices[idx1] : undefined;
            if (cv0 && cv1) {
                if (cv0.rowIdx === cv1.rowIdx) {
                    missingSameRow++;
                } else {
                    missingCrossRow++;
                }
            }
            if (missingExamples.length < 10) {
                if (cv0 && cv1) {
                    const col0 = bsearchFloor(unionU, cv0.u);
                    const col1 = bsearchFloor(unionU, cv1.u);
                    missingExamples.push(
                        `  chain${cv0.chainId} pt${cv0.pointIdx}\u2192pt${cv1.pointIdx}: ` +
                        `row${cv0.rowIdx}\u2192${cv1.rowIdx} col${col0}\u2192${col1} ` +
                        `u=${cv0.u.toFixed(6)}\u2192${cv1.u.toFixed(6)} ` +
                        `vidx=${v0}\u2192${v1}`
                    );
                }
            }
        }
    }
    if (missingExamples.length > 0) {
        console.log(`[ParametricExport]   v16.19 Missing edge examples:`);
        for (const ex of missingExamples) console.log(`[ParametricExport]     ${ex}`);
    }

    const buildMs = performance.now() - buildStart;
    const finalVertexCount = vertices.length / 3;
    const triCount = indices.length / 3;
    const realTriCount = triCount - seamSkipCount * 2;
    console.log(`[ParametricExport]   v24.0 Chain-vertex mesh: ${finalVertexCount} verts (${numU}\u00d7${numT} grid + ${allChainVertices.length} chain verts), ${realTriCount} real tris`);
    console.log(`[ParametricExport]   v24.0 Chain edges: ${allChainEdges.length} (enforced=${enforced}, missing=${missing} [sameRow=${missingSameRow}, crossRow=${missingCrossRow}]), chain cells: ${chainCellCount}, cross-cell: ${crossCellEdgeCount}`);
    console.log(`[ParametricExport]   v24.0 Primary chain edges (feature points): total=${primaryTotal}, enforced=${primaryEnforced}, missing=${primaryMissing}`);
    if (crossingConstraintsRemoved > 0) {
        console.log(`[ParametricExport]   v24.0 Crossing constraints removed: ${crossingConstraintsRemoved}`);
    }
    if (windingFixCount > 0) {
        console.log(`[ParametricExport]   v24.0 Standard cell winding fixes: ${windingFixCount}`);
    }
    console.log(`[ParametricExport]   v24.0 Chain-strip: mode=${chainStripConfig.mode}, cdt=${chainStripStats.cdtStrips}, sweep=${chainStripStats.sweepStrips}, fallback=${chainStripStats.sweepFallbacks}, repair=${chainStripStats.repairPatches}, windFlips=${chainStripStats.windingFlips}`);
    console.log(`[ParametricExport]   v24.0 Chain-strip constraints: total=${chainStripStats.totalConstraints}, classified=${chainStripStats.classifiedConstraints}`);
    if (chainStripStats.cdtStrips > 0) {
        console.log(`[ParametricExport]   v24.0 Chain-strip quality (UV): minAngle=${chainStripStats.minAngleUV.toFixed(1)}\u00b0, maxAspect=${chainStripStats.maxAspectUV.toFixed(1)}:1, R2violations=${chainStripStats.r2Violations}`);
    }
    console.log(`[ParametricExport]   v24.0 Grid: ${numU}\u00d7${numT}, seam skips: ${seamSkipCount}, build time: ${buildMs.toFixed(1)}ms`);

    // Build chain vertex → chainId map for FeatureEdgeGraph
    const chainVertexChainIds = new Map<number, number>();
    for (const cv of allChainVertices) {
        chainVertexChainIds.set(cv.vertexIdx, cv.chainId);
    }

    return { vertices, indices, quadMap, gridVertexCount, chainEdges: allChainEdges, origToFinal, chainVertexChainIds };
}
