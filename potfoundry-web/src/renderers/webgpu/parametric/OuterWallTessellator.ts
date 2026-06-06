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
import { collectChainVertices, SEAM_THRESHOLD } from './ChainVertexBuilder';
import type { ChainBuildResult } from './ChainVertexBuilder';
import { buildPeriodicSeamClosure } from './PeriodicSeamClosure';
import {
    planOuterWallCorridors,
} from './OuterWallCorridorPlanner';
import type {
    OuterWallCorridorOwnershipSegment,
    OuterWallCorridorPlanningResult,
    OuterWallLegacyOwnershipCell,
} from './OuterWallCorridorPlanner';

/**
 * Configuration for chain strip triangulation.
 * @deprecated R34: Cell-local quad splitting replaces ChainStripTriangulator.ts.
 * Retained for backward-compatible function signature only.
 */
export interface ChainStripConfig {
    mode: string;
    densityMultiplier: number;
    adaptiveRefine: boolean;
    expansion: number;
    bandMergeFactor?: number;
}

/** Default chain strip config — kept for backward compatibility. */
export const DEFAULT_CHAIN_STRIP_CONFIG: ChainStripConfig = {
    mode: 'cdt-first',
    densityMultiplier: 3,
    adaptiveRefine: true,
    expansion: 2,
    bandMergeFactor: 1.0,
};

/**
 * Append every element of `items` to `target` in place.
 *
 * Replaces `target.push(...items)`, whose spread passes each element as a
 * separate call argument and overflows V8's argument-count ceiling (~125k
 * here) on dense meshes, throwing `RangeError: Maximum call stack size
 * exceeded`. A plain loop has no such ceiling.
 */
export function pushAll<T>(target: T[], items: readonly T[]): void {
    for (let i = 0; i < items.length; i++) {
        target.push(items[i]);
    }
}

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
    /** Perturbed T-position for promoted chain vertices (D-Radical). */
    promotedT?: number;
}

/**
 * Return type for buildCDTOuterWall.
 */
export interface OuterWallResult {
    /** Interleaved vertex buffer (u, t, surfaceId) × N */
    vertices: Float32Array;
    /** Triangle index buffer */
    indices: Uint32Array;
    /** Optional source-diagnostic label per triangle, populated only when source diagnostics are enabled. */
    triangleProvenance?: string[];
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
    /** R36: Grid vertices adjacent to chain cells/super-cells, for optimizer visibility */
    chainAdjacentVertices: Set<number>;
    /** R38: Protected corridor around phantom crossing anchors and companions */
    protectedStripVertices: Set<number>;
    /** R46: Fan diagonal edges from chainFanQuad (chain↔grid), for constraint protection */
    fanDiagonalEdges: Array<[number, number]>;
    /** R46 Phase 2: Interpolated chain vertices for post-OWT GPU re-snap */
    interpolatedChainVertices: Array<{ vertexIdx: number; chainId: number; rowIdx: number; gapSize: number }>;
    /**
     * Bug #1 fix: R37 phantom chain anchors created at column-boundary crossings.
     * These vertices' UV positions come from LINEAR INTERPOLATION between chain
     * edge endpoints — they sit off the feature ridge for any curved feature.
     * Downstream (ParametricExportComputer.compute) must GPU re-snap them to
     * the local peak/valley to eliminate hotspot artifacts at chain-column
     * crossings.
     */
    phantomChainAnchors: Array<{ vertexIdx: number; chainId: number; tCross: number }>;
    /** C0/C1: Dry-run corridor planning output. Undefined unless explicitly enabled. */
    corridorPlan?: OuterWallCorridorPlanningResult;
}

/**
 * Optional build-time controls for non-behavioral corridor planning.
 *
 * In C0/C1 these options are strictly read-only: they may add diagnostics and
 * planner output, but they must not change emitted topology.
 */
export interface OuterWallBuildOptions {
    /** Enable dry-run corridor planning. Default: false. */
    readonly corridorPlanning?: boolean;
    /** Include aggregate planner diagnostics in the returned plan. Default: false. */
    readonly corridorDiagnostics?: boolean;
    /**
     * Bug #5 fix: metric correction for sweep diagonal choice. Equal to
     * `physical_U_extent / physical_T_extent` for the pot. Default 1.0
     * preserves legacy raw-UV behavior.
     */
    readonly metricAspect?: number;
    /** Add projected row-edge companions to reduce chain-heavy fan slivers. */
    readonly rowEdgeQualityCompanions?: boolean;
    /**
     * Close the half-open u-seam at base-gen (after coalesce/dedup) by zippering the
     * low-side (u≈0) and high-side (u≈0.997) boundary chains. Manifold-safe and
     * non-regressive. See PeriodicSeamClosure.ts. Default: false.
     */
    readonly periodicSeamU?: boolean;
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
    /** Total pot height (mm). Used for metric-aware CDT normalization. */
    H: number;
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

// SEAM_THRESHOLD imported from ChainVertexBuilder.ts

/** R36: Minimum interior angle of a 2D triangle (radians). Returns 0 for degenerate. */
function minAngle2D(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
): number {
    const abx = bx - ax, aby = by - ay;
    const acx = cx - ax, acy = cy - ay;
    const bcx = cx - bx, bcy = cy - by;
    const lab = Math.sqrt(abx * abx + aby * aby);
    const lac = Math.sqrt(acx * acx + acy * acy);
    const lbc = Math.sqrt(bcx * bcx + bcy * bcy);
    if (lab < 1e-12 || lac < 1e-12 || lbc < 1e-12) return 0;
    const cosA = (abx * acx + aby * acy) / (lab * lac);
    const cosB = (-abx * bcx - aby * bcy) / (lab * lbc);
    const cosC = (acx * bcx + acy * bcy) / (lac * lbc);
    return Math.min(
        Math.acos(Math.max(-1, Math.min(1, cosA))),
        Math.acos(Math.max(-1, Math.min(1, cosB))),
        Math.acos(Math.max(-1, Math.min(1, cosC))),
    );
}

/**
 * R51: Maximum cosine of all interior angles of a 2D triangle.
 * Larger cosine = smaller angle = worse triangle quality.
 * Returns 1.0 for degenerate triangles (worst possible).
 * Uses only dot products — no Math.acos needed.
 */
function maxCosine2D(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    /** Bug #5 fix: metric correction (default 1.0 = legacy behavior). */
    metricAspect: number = 1.0,
): number {
    // BUG B partial fix: wrap U-coords when triangle straddles the seam, so a
    // (0.99, 0.99, 0.01) triangle is treated as (0.99, 0.99, 1.01) for diagonal
    // selection rather than producing a pathological 0.98-wide U-span. Without
    // this, seam-crossing chain strips always pick the wrong diagonal.
    // FULL BUG B fix (deferred): replace scalar metricAspect with per-row
    // E,F,G metric tensor — required to correctly handle boundary rows where
    // the U-direction physical length collapses (radius → 0).
    let axS = ax, bxS = bx, cxS = cx;
    const maxU = Math.max(axS, bxS, cxS);
    const minU = Math.min(axS, bxS, cxS);
    if (maxU - minU > 0.5) {
        if (axS < 0.5) axS += 1.0;
        if (bxS < 0.5) bxS += 1.0;
        if (cxS < 0.5) cxS += 1.0;
    }
    const ayS = ay * metricAspect;
    const byS = by * metricAspect;
    const cyS = cy * metricAspect;
    const abx = bxS - axS, aby = byS - ayS;
    const acx = cxS - axS, acy = cyS - ayS;
    const bcx = cxS - bxS, bcy = cyS - byS;
    const lab = Math.sqrt(abx * abx + aby * aby);
    const lac = Math.sqrt(acx * acx + acy * acy);
    const lbc = Math.sqrt(bcx * bcx + bcy * bcy);
    if (lab < 1e-12 || lac < 1e-12 || lbc < 1e-12) return 1.0;
    const cosA = (abx * acx + aby * acy) / (lab * lac);
    const cosB = (-abx * bcx - aby * bcy) / (lab * lbc);
    const cosC = (acx * bcx + acy * bcy) / (lac * lbc);
    return Math.max(cosA, cosB, cosC);
}

/** Seam guard: skip grid cells wider than this */
const SEAM_GUARD = 0.3;

/**
 * R54: Base fraction of cell width below which a chain vertex may trigger
 * fusion with the neighboring cell to eliminate narrow-side slivers.
 * Kept conservative to avoid over-fusing; severe aspect guard can still trigger.
 */
const R54_NEAR_BOUNDARY_FRAC = 0.2;

/**
 * R54: Severe narrow-side guard expressed directly in quality terms.
 * If narrowWidth / bandHeight drops below this value, force fusion even when
 * the base cell-width fraction does not trigger.
 */
const R54_NARROW_TO_BAND_MAX = 0.2;

/**
 * R55: Drop grid vertices within this U-distance of a chain vertex on shared edges.
 * Eliminates pin triangles caused by CDF grid clustering near chain positions.
 * Value = mathematical 4:1 aspect ratio violation threshold.
 */
const GRID_CHAIN_COALESCE_RADIUS = 0.0006;
/** Protected row pins closer than this are below exportable feature scale. */
const PROTECTED_ROW_PIN_COALESCE_RADIUS = 0.00015;
/** Grid/phantom row support pins inside the quality bound yield to exact chain anchors. */
const GRID_CHAIN_ROW_REMAP_RADIUS = GRID_CHAIN_COALESCE_RADIUS;
// Must equal GRID_CHAIN_COALESCE_RADIUS (the pin-pair tolerance). A chain vertex
// within this U-distance of a column boundary is propagated into the ADJACENT
// cell so the shared vertical edge conforms to the exact (infinite-precision)
// chain vertex — eliminating near-coincident grid↔chain "pin pairs" (audit B11)
// WITHOUT dropping any grid sample. Previously 0.00012, which left a dead zone:
// vertices in (0.00012, 0.0006) of a boundary registered as pins but were never
// propagated. Propagation is preferred over coalescing because it preserves the
// chain vertex's precise position rather than discarding a grid vertex.
const GRID_CHAIN_BOUNDARY_PROPAGATE_RADIUS = GRID_CHAIN_COALESCE_RADIUS;

/** Replacement fans must stay within the local source-cell edge scale. */
const OWNED_SPAN_RAIL_PATCH_MAX_EDGE_SCALE = 1.02;

/** Minimum source-grid resolution where crossing fallback keeps the existing dense/topology behavior. */
const CROSSING_CONSTRAINT_FALLBACK_MIN_GRID_SIZE = 128;
/** Sparse crossing fallback must not exceed the local source-cell edge scale. */
const CROSSING_CONSTRAINT_FALLBACK_MAX_EDGE_SCALE = 1.02;

/** Fraction of band T-height used to perturb promoted chain vertices into the strip interior.
 *  R24: Set to 0 — chain vertices are boundary vertices (no promotion).
 *  The UV/3D mismatch that caused slivers is eliminated. */

// ============================================================================
// Cell-local triangulation helpers (R34)
// ============================================================================

/**
 * Emit a triangle with CCW winding in UV space.
 * Uses explicit cross-product winding check rather than relying on sweep direction.
 */
function emitTriCCW(
    buf: number[],
    a: number, b: number, c: number,
    verts: Float32Array,
): void {
    let au = verts[a * 3], at = verts[a * 3 + 1];
    let bu = verts[b * 3], bt = verts[b * 3 + 1];
    let cu = verts[c * 3], ct = verts[c * 3 + 1];
    // BUG G fix: when a triangle straddles the U=0/U=1 seam, naive UV cross
    // product is huge and may flip sign, producing inverted winding (4243
    // inconsistent normal pairs in production logs). Wrap so that the three
    // U-coordinates are within 0.5 of each other before computing the cross.
    const maxU = Math.max(au, bu, cu);
    const minU = Math.min(au, bu, cu);
    if (maxU - minU > 0.5) {
        if (au < 0.5) au += 1.0;
        if (bu < 0.5) bu += 1.0;
        if (cu < 0.5) cu += 1.0;
    }
    const cross = (bu - au) * (ct - at) - (cu - au) * (bt - at);
    if (Math.abs(cross) < 1e-12) {
        buf.push(0, 0, 0); // degenerate
    } else if (cross >= 0) {
        buf.push(a, b, c);
    } else {
        buf.push(a, c, b);
    }
}

/**
 * Triangulate a quad with extra vertices on bottom and top edges.
 * Both edges are sorted left-to-right by U. The quad is U-monotone.
 * Uses a two-pointer sweep.
 *
 * @param buf   Index buffer to append to
 * @param bot   Bottom edge vertex indices sorted by U: [BL, ...chain verts..., BR]
 * @param top   Top edge vertex indices sorted by U: [TL, ...chain verts..., TR]
 * @param verts Vertex buffer for U lookups (stride 3: u, t, surfaceId)
 */
function sweepQuad(
    buf: number[],
    bot: number[],
    top: number[],
    verts: Float32Array,
    /** Bug #5 fix: optional metric aspect (U/T physical ratio). 1.0 = legacy. */
    metricAspect: number = 1.0,
): void {
    let bi = 0, ti = 0;
    const bLen = bot.length, tLen = top.length;

    // R51: Compute cell width from vertex data for quality zone sizing
    const cellWidth = Math.abs(verts[bot[bLen - 1] * 3] - verts[bot[0] * 3]);
    const QUALITY_ZONE = cellWidth * 0.5;

    while (bi < bLen - 1 || ti < tLen - 1) {
        if (bi >= bLen - 1) {
            emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
            ti++;
        } else if (ti >= tLen - 1) {
            emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
            bi++;
        } else {
            const botNextU = verts[bot[bi + 1] * 3];
            const topNextU = verts[top[ti + 1] * 3];
            // R51: Quality-aware diagonal choice with wider zone and cosine comparison
            const uRange = Math.abs(botNextU - topNextU);
            if (uRange < QUALITY_ZONE) {
                // Quality zone: pick diagonal with lower max-cosine (better min-angle)
                const cosA = maxCosine2D(
                    verts[bot[bi] * 3], verts[bot[bi] * 3 + 1],
                    verts[bot[bi + 1] * 3], verts[bot[bi + 1] * 3 + 1],
                    verts[top[ti] * 3], verts[top[ti] * 3 + 1],
                    metricAspect,
                );
                const cosB = maxCosine2D(
                    verts[top[ti] * 3], verts[top[ti] * 3 + 1],
                    verts[top[ti + 1] * 3], verts[top[ti + 1] * 3 + 1],
                    verts[bot[bi] * 3], verts[bot[bi] * 3 + 1],
                    metricAspect,
                );
                if (cosA <= cosB) {
                    // Diagonal A has lower max-cosine → better min-angle
                    emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
                    bi++;
                } else {
                    emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
                    ti++;
                }
            } else if (botNextU < topNextU) {
                emitTriCCW(buf, bot[bi], bot[bi + 1], top[ti], verts);
                bi++;
            } else {
                emitTriCCW(buf, top[ti], top[ti + 1], bot[bi], verts);
                ti++;
            }
        }
    }
}

/**
 * R55: Drop near-coincident grid vertices from an edge array when a chain vertex
 * is within RADIUS in U-space. Returns a new array with grid vertices removed;
 * records mappings (grid → nearest chain) in coalMap for post-processing T-junction fix.
 *
 * Each chain vertex may absorb at most ONE grid vertex per edge to prevent
 * double-coalescing (two adjacent grid vertices both mapping to the same chain
 * vertex, collapsing their shared triangle to a degenerate).
 *
 * Cross-cell consistency: A grid corner vertex shared by multiple cells must
 * map to the SAME chain vertex everywhere. If a previous cell already coalesced
 * v → c_prev, we honour that mapping rather than overwriting with a different
 * chain vertex, which would create edge mismatches (boundary edges / holes).
 */
function coalesceNearGridChain(
    edge: number[],
    verts: Float32Array,
    isGridLikeFn: (idx: number) => boolean,
    isChainLikeFn: (idx: number) => boolean,
    radius: number,
    coalMap: Map<number, number>,
    safeSet: Set<number>,
): number[] {
    // Track which chain vertices have already absorbed a grid vertex on THIS edge.
    // Prevents double-coalescing: gridA→chainV and gridB→chainV on the same edge
    // would collapse triangle(gridA, gridB, ...) to degenerate(chainV, chainV, ...).
    const usedChainTargets = new Set<number>();
    const result: number[] = [];
    for (let i = 0; i < edge.length; i++) {
        const v = edge[i];
        if (!isGridLikeFn(v)) { result.push(v); continue; }

        // R55-S: Only coalesce if all adjacent cells are chain/super cells
        if (!safeSet.has(v)) { result.push(v); continue; }

        // Cross-cell guard: if v was already coalesced by a previous cell,
        // don't overwrite the mapping. If the target is already on this edge
        // (vertical neighbour — same chain vertex shared via row boundary),
        // drop v to avoid a post-remap degenerate. Otherwise keep v on the
        // edge; the post-processing remap will consistently replace it.
        const existing = coalMap.get(v);
        if (existing !== undefined) {
            if (!edge.includes(existing)) {
                result.push(v);
            }
            continue;
        }

        const vU = verts[v * 3];
        let nearestChain = -1;
        let nearestDist = Infinity;
        for (let j = 0; j < edge.length; j++) {
            if (i === j) continue;
            const cv = edge[j];
            if (!isChainLikeFn(cv)) continue;
            if (usedChainTargets.has(cv)) continue; // already absorbed one grid vertex
            const dist = Math.abs(verts[cv * 3] - vU);
            if (dist < radius && dist < nearestDist) {
                nearestChain = cv;
                nearestDist = dist;
            }
        }
        if (nearestChain >= 0) {
            coalMap.set(v, nearestChain);
            usedChainTargets.add(nearestChain);
        } else {
            result.push(v);
        }
    }
    return result;
}

/**
 * Per-cell chain info for cell-local quad splitting.
 */
interface CellChainInfo {
    /** Chain vertex indices on bottom edge, sorted by U */
    botChainVerts: number[];
    /** Chain vertex indices on top edge, sorted by U */
    topChainVerts: number[];
    /** Chain edges crossing this cell (global vertex index pairs) */
    chainEdges: Array<[number, number]>;
}

/** Super-cell: merged cell spanning multiple columns for cross-column chain edges (R35). */
interface SuperCell {
    band: number;
    colStart: number;  // leftmost column (inclusive)
    colEnd: number;    // rightmost column (inclusive)
}

/**
 * Triangulate a cell with chain edges as mandatory triangle edges.
 * Chain edges connect bottom-edge vertices to top-edge vertices,
 * partitioning the cell into sub-quads swept independently.
 *
 * @param buf        Index buffer to append to
 * @param bot        Full bottom edge: [BL, ...chain verts..., BR] sorted by U
 * @param top        Full top edge: [TL, ...chain verts..., TR] sorted by U
 * @param edges      Chain edges crossing this cell (vertex index pairs)
 * @param verts      Vertex buffer for position lookups
 */
function constrainedSweepCell(
    buf: number[],
    bot: number[],
    top: number[],
    edges: Array<[number, number]>,
    verts: Float32Array,
    fanDiagEdges: Array<[number, number]>,
    /** Bug #5 fix: optional metric aspect. 1.0 = legacy. */
    metricAspect: number = 1.0,
    crossingConstraintFallbackMaxEdge: number = Number.POSITIVE_INFINITY,
): void {
    const edgeLength = (a: number, b: number): number => Math.hypot(
        verts[a * 3] - verts[b * 3],
        verts[a * 3 + 1] - verts[b * 3 + 1],
    );

    const maxFallbackEdge = (indices: readonly number[]): number => {
        let maxEdge = 0;
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i], b = indices[i + 1], c = indices[i + 2];
            if (a === 0 && b === 0 && c === 0) continue;
            maxEdge = Math.max(
                maxEdge,
                edgeLength(a, b),
                edgeLength(b, c),
                edgeLength(a, c),
            );
        }
        return maxEdge;
    };

    // Build partition list: map each chain edge to positions in bot/top arrays
    interface Partition {
        botPos: number;
        topPos: number;
    }
    const partitions: Partition[] = [];

    for (const [v0, v1] of edges) {
        // Try both orientations: v0 on bot & v1 on top, or reversed
        let bIdx = bot.indexOf(v0);
        let tIdx = top.indexOf(v1);
        if (bIdx < 0 || tIdx < 0) {
            bIdx = bot.indexOf(v1);
            tIdx = top.indexOf(v0);
        }
        if (bIdx >= 0 && tIdx >= 0) {
            partitions.push({ botPos: bIdx, topPos: tIdx });
        }
        // If neither endpoint is on bot/top, this is a side-entering cross-column
        // fragment handled elsewhere via intersection vertices
    }

    if (partitions.length === 0) {
        // No valid chain edge partitions — fall back to simple sweep
        sweepQuad(buf, bot, top, verts, metricAspect);
        return;
    }

    // Sort partitions by average U position
    partitions.sort((a, b) => {
        const aU = (verts[bot[a.botPos] * 3] + verts[top[a.topPos] * 3]) / 2;
        const bU = (verts[bot[b.botPos] * 3] + verts[top[b.topPos] * 3]) / 2;
        return aU - bU;
    });

    // WATERTIGHT-FIX (Task #18): crossing chain constraints. The sweep below
    // slices bot/top BY POSITION assuming partitions are monotone — i.e. botPos
    // and topPos increase together. Two chain edges that CROSS inside the cell
    // (one rises L→R, the other falls) invert that order: after sorting, a later
    // partition has a SMALLER topPos, so `top.slice(prevTopPos, topPos+1)` is
    // empty and the region between the crossing edges is DROPPED, leaving the
    // crossed edge one-sided → a genuine vertical chain↔chain hole. This is the
    // measured dominant production class (audit F14: ~42K such holes from dense
    // drifting chains that cross within cells). The monotone sweep cannot enforce
    // crossing constraints without intersection vertices (which this function
    // cannot allocate). Fall back to the unconstrained monotone triangulation,
    // which is watertight (uses only the shared boundary-loop edges); the crossed
    // constraint segments are simply not enforced in this one sub-cell — a
    // sub-cell-local fidelity loss at the ridge junction, but a watertight mesh.
    let constraintsCross = false;
    for (let i = 0; i < partitions.length && !constraintsCross; i++) {
        for (let j = i + 1; j < partitions.length; j++) {
            const dBot = partitions[i].botPos - partitions[j].botPos;
            const dTop = partitions[i].topPos - partitions[j].topPos;
            if (dBot * dTop < 0) { constraintsCross = true; break; } // opposite order = crossing
        }
    }
    if (constraintsCross) {
        const fallback: number[] = [];
        sweepQuad(fallback, bot, top, verts, metricAspect);
        if (maxFallbackEdge(fallback) <= crossingConstraintFallbackMaxEdge) {
            pushAll(buf, fallback);
            return;
        }
    }

    // Sweep: emit sub-quads between consecutive partition lines
    // R41: Track whether left boundary is a chain edge for fan diagonal selection
    let prevBotPos = 0;
    let prevTopPos = 0;
    let prevIsChainEdge = false;

    for (const part of partitions) {
        const subBot = bot.slice(prevBotPos, part.botPos + 1);
        const subTop = top.slice(prevTopPos, part.topPos + 1);
        if (subBot.length < 2 || subTop.length < 2) {
            // A2 degenerate guard: collapsed edge after batch2Remap merge
            if (subBot.length >= 1 && subTop.length >= 1) {
                sweepQuad(buf, subBot, subTop, verts, metricAspect);
            }
        } else if (subBot.length === 2 && subTop.length === 2 && !prevIsChainEdge) {
            // R41/R51 chainFanQuad: 2×2 sub-quad with chain on RIGHT only
            // R51: Quality-aware diagonal choice using cosine comparison
            const cosA = maxCosine2D(
                verts[subBot[0] * 3], verts[subBot[0] * 3 + 1],
                verts[subBot[1] * 3], verts[subBot[1] * 3 + 1],
                verts[subTop[0] * 3], verts[subTop[0] * 3 + 1],
                metricAspect,
            );
            const cosB = maxCosine2D(
                verts[subTop[0] * 3], verts[subTop[0] * 3 + 1],
                verts[subTop[1] * 3], verts[subTop[1] * 3 + 1],
                verts[subBot[0] * 3], verts[subBot[0] * 3 + 1],
                metricAspect,
            );
            if (cosA <= cosB) {
                // Diagonal A: chain_bot → grid_top (original)
                emitTriCCW(buf, subBot[0], subBot[1], subTop[0], verts);
                emitTriCCW(buf, subTop[0], subBot[1], subTop[1], verts);
                fanDiagEdges.push([subBot[1], subTop[0]]);
            } else {
                // Diagonal B: grid_bot → chain_top
                emitTriCCW(buf, subBot[0], subBot[1], subTop[1], verts);
                emitTriCCW(buf, subBot[0], subTop[1], subTop[0], verts);
                fanDiagEdges.push([subBot[0], subTop[1]]);
            }
        } else {
            // Chain on both sides, or N×M sub-quad → standard sweep
            sweepQuad(buf, subBot, subTop, verts, metricAspect);
        }
        prevBotPos = part.botPos;
        prevTopPos = part.topPos;
        prevIsChainEdge = true;
    }

    // Final sub-quad: from last partition to right boundary
    const finalBot = bot.slice(prevBotPos);
    const finalTop = top.slice(prevTopPos);
    if (finalBot.length < 2 || finalTop.length < 2) {
        // A2 degenerate guard
        if (finalBot.length >= 1 && finalTop.length >= 1) {
            sweepQuad(buf, finalBot, finalTop, verts, metricAspect);
        }
    } else if (finalBot.length === 2 && finalTop.length === 2 && partitions.length > 0) {
        // R41/R51 chainFanQuad: 2×2 sub-quad with chain on LEFT only
        // R51: Quality-aware diagonal choice using cosine comparison
        const cosA = maxCosine2D(
            verts[finalBot[0] * 3], verts[finalBot[0] * 3 + 1],
            verts[finalBot[1] * 3], verts[finalBot[1] * 3 + 1],
            verts[finalTop[1] * 3], verts[finalTop[1] * 3 + 1],
            metricAspect,
        );
        const cosB = maxCosine2D(
            verts[finalTop[0] * 3], verts[finalTop[0] * 3 + 1],
            verts[finalTop[1] * 3], verts[finalTop[1] * 3 + 1],
            verts[finalBot[1] * 3], verts[finalBot[1] * 3 + 1],
            metricAspect,
        );
        if (cosA <= cosB) {
            // Diagonal A: chain_bot → grid_top (original)
            emitTriCCW(buf, finalBot[0], finalBot[1], finalTop[1], verts);
            emitTriCCW(buf, finalBot[0], finalTop[1], finalTop[0], verts);
            fanDiagEdges.push([finalBot[0], finalTop[1]]);
        } else {
            // Diagonal B: grid_bot → chain_top
            emitTriCCW(buf, finalBot[0], finalBot[1], finalTop[0], verts);
            emitTriCCW(buf, finalTop[0], finalBot[1], finalTop[1], verts);
            fanDiagEdges.push([finalBot[1], finalTop[0]]);
        }
    } else {
        sweepQuad(buf, finalBot, finalTop, verts, metricAspect);
    }
}

function dedupeSortedVertexEdge(edge: number[]): number[] {
    const deduped: number[] = [];
    let prev = -1;
    for (const vertexIdx of edge) {
        if (vertexIdx === prev) continue;
        deduped.push(vertexIdx);
        prev = vertexIdx;
    }
    return deduped;
}

/**
 * Remove interior same-row pins that are too close to produce a usable triangle.
 * Row endpoints and active constraint endpoints are preserved.
 */
export function pruneNearDuplicateRowEdgePins(
    edge: number[],
    verts: Float32Array,
    protectedVertices: ReadonlySet<number>,
    radius: number = GRID_CHAIN_COALESCE_RADIUS,
    options?: {
        remapDroppedToSurvivor?: Map<number, number>;
        shouldRemapDroppedVertex?: (dropped: number, survivor: number) => boolean;
    },
): number[] {
    if (edge.length <= 1) return edge;

    const sortedEdge = [...edge].sort((a, b) => verts[a * 3] - verts[b * 3]);
    const endpointVertices = new Set([sortedEdge[0], sortedEdge[sortedEdge.length - 1]]);
    const isProtected = (vertexIdx: number): boolean =>
        endpointVertices.has(vertexIdx) || protectedVertices.has(vertexIdx);
    const rowSpanU = (verticesInGroup: number[]): number => {
        let minU = Infinity;
        let maxU = -Infinity;
        for (const vertexIdx of verticesInGroup) {
            const u = verts[vertexIdx * 3];
            minU = Math.min(minU, u);
            maxU = Math.max(maxU, u);
        }
        const span = maxU - minU;
        return span > 0.5 ? 1 - span : span;
    };
    const rowDistanceU = (a: number, b: number): number => {
        const au = verts[a * 3];
        const bu = verts[b * 3];
        let du = Math.abs(au - bu);
        if (du > 0.5) du = 1 - du;
        return du;
    };
    const sameRowClose = (a: number, b: number): boolean => {
        const at = verts[a * 3 + 1];
        const bt = verts[b * 3 + 1];
        return Math.abs(at - bt) <= 1e-9 && rowDistanceU(a, b) < radius;
    };
    const pruned: number[] = [];
    let group: number[] = [];
    const recordDropped = (dropped: number, survivor: number): void => {
        if (dropped === survivor) return;
        if (!options?.remapDroppedToSurvivor) return;
        if (options.shouldRemapDroppedVertex && !options.shouldRemapDroppedVertex(dropped, survivor)) return;
        if (!options.remapDroppedToSurvivor.has(dropped)) {
            options.remapDroppedToSurvivor.set(dropped, survivor);
        }
    };
    const pushSurvivor = (survivor: number): void => {
        for (const dropped of group) {
            recordDropped(dropped, survivor);
        }
        pruned.push(survivor);
    };

    if (sortedEdge.length === 2) {
        const [a, b] = sortedEdge;
        if (
            protectedVertices.has(a) &&
            protectedVertices.has(b) &&
            sameRowClose(a, b) &&
            rowSpanU(sortedEdge) < PROTECTED_ROW_PIN_COALESCE_RADIUS
        ) {
            recordDropped(a, b);
            return [b];
        }
        return sortedEdge;
    }

    const flush = (): void => {
        if (group.length === 0) return;
        if (group.length === 1) {
            pruned.push(group[0]);
            group = [];
            return;
        }

        const protectedGroup = group.filter(isProtected);
        if (protectedGroup.length === 1) {
            pushSurvivor(protectedGroup[0]);
        } else if (protectedGroup.length > 1) {
            if (rowSpanU(protectedGroup) < PROTECTED_ROW_PIN_COALESCE_RADIUS) {
                pushSurvivor(protectedGroup[protectedGroup.length - 1]);
            } else {
                const keptProtected: number[] = [];
                for (let i = 0; i < protectedGroup.length; i++) {
                    const start = protectedGroup[i];
                    if (endpointVertices.has(start)) {
                        keptProtected.push(start);
                        continue;
                    }
                    const cluster = [start];
                    while (
                        i + 1 < protectedGroup.length &&
                        !endpointVertices.has(protectedGroup[i + 1]) &&
                        rowDistanceU(protectedGroup[i], protectedGroup[i + 1]) < PROTECTED_ROW_PIN_COALESCE_RADIUS
                    ) {
                        cluster.push(protectedGroup[i + 1]);
                        i++;
                    }
                    keptProtected.push(cluster[cluster.length - 1]);
                }
                const keptProtectedSet = new Set(keptProtected);
                const nearestKeptProtected = (vertexIdx: number): number => {
                    let nearest = keptProtected[0];
                    let nearestDist = rowDistanceU(vertexIdx, nearest);
                    for (let i = 1; i < keptProtected.length; i++) {
                        const protectedIdx = keptProtected[i];
                        const dist = rowDistanceU(vertexIdx, protectedIdx);
                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearest = protectedIdx;
                        }
                    }
                    return nearest;
                };
                const kept = group.filter(vertexIdx =>
                    keptProtectedSet.has(vertexIdx) ||
                    (!isProtected(vertexIdx) && keptProtected.every(protectedIdx =>
                        rowDistanceU(vertexIdx, protectedIdx) >= PROTECTED_ROW_PIN_COALESCE_RADIUS,
                    )));
                const keptSet = new Set(kept);
                for (const dropped of group) {
                    if (keptSet.has(dropped)) continue;
                    recordDropped(dropped, nearestKeptProtected(dropped));
                }
                pushAll(pruned, kept);
            }
        } else {
            pushSurvivor(group[Math.floor(group.length / 2)]);
        }
        group = [];
    };

    for (const vertexIdx of sortedEdge) {
        if (group.length === 0 || sameRowClose(group[group.length - 1], vertexIdx)) {
            group.push(vertexIdx);
        } else {
            flush();
            group.push(vertexIdx);
        }
    }
    flush();
    return pruned;
}

export function recordNearRowGridChainRemaps(
    verts: Float32Array,
    totalVertices: number,
    isGridLikeFn: (idx: number) => boolean,
    isChainLikeFn: (idx: number) => boolean,
    radius: number,
    remap: Map<number, number>,
): number {
    const T_KEY_SCALE = 1e6;
    const rowChainVertices = new Map<number, number[]>();
    const rowKey = (vertexIdx: number): number => Math.round(verts[vertexIdx * 3 + 1] * T_KEY_SCALE);
    const rowDistanceU = (a: number, b: number): number => {
        let du = Math.abs(verts[a * 3] - verts[b * 3]);
        if (du > 0.5) du = 1 - du;
        return du;
    };

    for (let vertexIdx = 0; vertexIdx < totalVertices; vertexIdx++) {
        if (!isChainLikeFn(vertexIdx)) continue;
        const key = rowKey(vertexIdx);
        const row = rowChainVertices.get(key);
        if (row) {
            row.push(vertexIdx);
        } else {
            rowChainVertices.set(key, [vertexIdx]);
        }
    }
    for (const row of rowChainVertices.values()) {
        row.sort((a, b) => verts[a * 3] - verts[b * 3]);
    }

    let recorded = 0;
    for (let vertexIdx = 0; vertexIdx < totalVertices; vertexIdx++) {
        if (!isGridLikeFn(vertexIdx)) continue;
        if (remap.has(vertexIdx)) continue;
        const row = rowChainVertices.get(rowKey(vertexIdx));
        if (!row || row.length === 0) continue;

        const u = verts[vertexIdx * 3];
        let lo = 0;
        let hi = row.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (verts[row[mid] * 3] < u) lo = mid + 1;
            else hi = mid;
        }

        let nearest = -1;
        let nearestDist = Infinity;
        const check = (pos: number): void => {
            if (pos < 0 || pos >= row.length) return;
            const candidate = row[pos];
            const dist = rowDistanceU(vertexIdx, candidate);
            if (dist < radius && dist < nearestDist) {
                nearest = candidate;
                nearestDist = dist;
            }
        };
        check(lo - 1);
        check(lo);
        check(0);
        check(row.length - 1);

        if (nearest >= 0) {
            remap.set(vertexIdx, nearest);
            recorded++;
        }
    }
    return recorded;
}

// NOTE: sweepRegion, simpleSweep, constraintAwareTriangulate removed in v23.0.
// R34: ChainStripTriangulator.ts deleted — cell-local quad splitting replaces CDT strips.

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
/** @deprecated R34: Chain strip config kept for backward compatibility. Ignored internally. */
interface ChainStripConfigLegacy {
    mode: string;
    densityMultiplier: number;
    adaptiveRefine: boolean;
    expansion: number;
    bandMergeFactor?: number;
}

/**
 * Build the outer wall mesh with chain points as first-class vertices.
 *
 * R34 CELL-LOCAL QUAD SPLITTING:
 * Instead of CDT chain strips, each grid cell is independently triangulated.
 * Chain vertices on cell edges create sub-quads swept by a two-pointer
 * algorithm. Chain edges become guaranteed mesh edges by construction
 * (they partition cells into sub-quads whose sweep produces the edge).
 *
 * @param chains          Feature chains from Phase 2.5 (linked per-row peaks)
 * @param rowMapping      Mapping from final rows to original rows
 * @param tPositions      T positions for all rows (original + inserted)
 * @param unionU          Union grid U positions (base grid)
 * @param _targetOuterTris Target triangle count for the outer wall (reserved)
 * @param surfaceId       Surface ID (0 for outer wall)
 * @param _chainStripConfig Deprecated — kept for backward compatibility, ignored internally
 * @returns OuterWallResult with vertices, indices, quadMap, gridVertexCount, chainEdges
 */
export function buildCDTOuterWall(
    chains: FeatureChain[],
    rowMapping: number[],
    tPositions: Float32Array,
    unionU: Float32Array,
    _targetOuterTris: number,
    surfaceId: number = 0,
    _chainStripConfig?: ChainStripConfigLegacy,
    _potGeometry?: PotGeometryParams,
    options?: OuterWallBuildOptions,
): OuterWallResult {
    const buildStart = performance.now();
    // Bug #5 fix: resolve metric aspect once at function entry, default 1.0.
    const metricAspect = options?.metricAspect ?? 1.0;
    const enableRowEdgeQualityCompanions = Boolean(options?.rowEdgeQualityCompanions) && !options?.corridorPlanning;
    // Bug #1 fix: per-anchor metadata for downstream GPU re-snap.
    const phantomChainAnchorData = new Map<number, { chainId: number; tCross: number }>();

    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    const activeTPositions = tPositions;
    const numT = activeTPositions.length;
    const numU = unionU.length;
    const gridVertexCount = numU * numT;
    let maxSourceDU = 0;
    for (let i = 1; i < unionU.length; i++) {
        maxSourceDU = Math.max(maxSourceDU, Math.abs(unionU[i] - unionU[i - 1]));
    }
    let maxSourceDT = 0;
    for (let i = 1; i < activeTPositions.length; i++) {
        maxSourceDT = Math.max(maxSourceDT, Math.abs(activeTPositions[i] - activeTPositions[i - 1]));
    }
    const sparseCrossingFallbackMaxEdge = CROSSING_CONSTRAINT_FALLBACK_MAX_EDGE_SCALE * Math.hypot(maxSourceDU, maxSourceDT);
    const crossingConstraintFallbackMaxEdge =
        numU >= CROSSING_CONSTRAINT_FALLBACK_MIN_GRID_SIZE &&
            numT >= CROSSING_CONSTRAINT_FALLBACK_MIN_GRID_SIZE
            ? Number.POSITIVE_INFINITY
            : sparseCrossingFallbackMaxEdge;
    // R34: chainStripConfig is no longer used (cell-local replaces CDT strips)
    // Kept in function signature for backward compatibility only.

    // ── 1. Collect chain points remapped to UV space with vertex indices ──
    // Extracted to ChainVertexBuilder.ts (R52) for modularity and precision documentation.
    const chainResult: ChainBuildResult = collectChainVertices(
        chains, origToFinal, numT, gridVertexCount,
    );
    const { chainVertices, interpolatedCount, interpolatedGapSizes, nextVertexIdx: _nextVIdx } = chainResult;
    const chainEdges = chainResult.chainEdges; // mutable — A4 edge splitting modifies in-place
    const cellsPerRow = numU - 1;

    // ── R34: Cell-local quad splitting — no companions, no CDT strips ──

    // ── 2. Generate vertices: grid + chain vertices ──
    const totalVertexCount = gridVertexCount + chainVertices.length;
    // R37: Overestimate buffer for phantom vertices (column-crossing band splitting).
    // Exact count is computed in section 3.9 after super-cell merge.
    // Upper bound: R38 adds local companions around true crossing anchors; R56
    // adds row-edge quality companions to avoid fan slivers in chain-heavy cells.
    const maxPhantomSlots = chainEdges.length * 24 + chainVertices.length * 4;
    const vertices = new Float32Array((totalVertexCount + maxPhantomSlots) * 3);
    const phantomVertexStart = totalVertexCount;
    let phantomVertexCount = 0;

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
    for (const cv of chainVertices) {
        vertices[vIdx++] = cv.u;
        vertices[vIdx++] = cv.t ?? activeTPositions[cv.rowIdx];
        vertices[vIdx++] = surfaceId;
    }

    // ── 3. Build per-row chain vertex lookup (sorted by U) ──
    const rowChainVerts = new Map<number, ChainVertex[]>();
    for (const cv of chainVertices) {
        if (cv.t !== undefined) continue; // 2D companions (if any) are interior-only
        let list = rowChainVerts.get(cv.rowIdx);
        if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
        list.push(cv);
    }
    for (const [, list] of rowChainVerts) {
        list.sort((a, b) => a.u - b.u);
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║ 🔒 R52 PRECISION LOCK — batch2Remap DISABLED                        ║
    // ║ Chain vertices must NEVER be merged to nearby grid column positions. ║
    // ║ Re-enabling this destroys sub-sample feature precision.              ║
    // ║ See ChainVertexBuilder.ts for the full R52 precision guarantee.      ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    // ── 3.5. Pre-compute batch2Remap (Amendment A1) ──
    // R52: DISABLED — chain vertices are NEVER merged to grid positions.
    // Both vertices are preserved at their exact positions; the extra
    // triangulation from near-coincident vertices is acceptable.
    // Precision is absolute: no averaging, no estimation, no "close enough".
    const batch2Remap = new Map<number, number>();

    // ── 3.6. Remap chain edge endpoints (Amendment A4) ──
    // After batch2Remap, update chainEdges so endpoints reference grid vertices
    // where merged. This must happen BEFORE cellChainMap construction.
    if (batch2Remap.size > 0) {
        for (let e = 0; e < chainEdges.length; e++) {
            const [v0, v1] = chainEdges[e];
            const m0 = batch2Remap.get(v0);
            const m1 = batch2Remap.get(v1);
            if (m0 !== undefined || m1 !== undefined) {
                chainEdges[e] = [m0 ?? v0, m1 ?? v1];
            }
        }
    }

    const remappedGridChainIds = new Map<number, number>();
    for (const [chainVertexIdx, gridVertexIdx] of batch2Remap) {
        const chainVertex = chainVertices[chainVertexIdx - gridVertexCount];
        if (chainVertex) {
            remappedGridChainIds.set(gridVertexIdx, chainVertex.chainId);
        }
    }

    const resolveVertexChainId = (vertexIdx: number): number | undefined => {
        if (vertexIdx >= gridVertexCount && vertexIdx < totalVertexCount) {
            return chainVertices[vertexIdx - gridVertexCount]?.chainId;
        }
        return remappedGridChainIds.get(vertexIdx);
    };

    // ── 3.7. Build cellChainMap: (band, col) → chain info ──
    const cellChainMap = new Map<number, CellChainInfo>();
    const r35SuperCellCols = new Set<number>();
    const cellKey = (band: number, col: number): number => band * cellsPerRow + col;

    // Pre-build row-indexed chain edge lookup
    const rowBandEdges = new Map<number, Array<[number, number]>>();
    for (const [v0, v1] of chainEdges) {
        // Resolve vertex data — endpoint may be a grid vertex after batch2Remap
        const isChainV0 = v0 >= gridVertexCount && v0 < totalVertexCount;
        const isChainV1 = v1 >= gridVertexCount && v1 < totalVertexCount;
        const cv0 = isChainV0 ? chainVertices[v0 - gridVertexCount] : undefined;
        const cv1 = isChainV1 ? chainVertices[v1 - gridVertexCount] : undefined;

        // For remapped endpoints, determine row from grid index
        let row0: number, row1: number, u0: number, u1: number;
        if (cv0) {
            row0 = cv0.rowIdx;
            u0 = cv0.u;
        } else {
            row0 = Math.floor(v0 / numU);
            u0 = vertices[v0 * 3];
        }
        if (cv1) {
            row1 = cv1.rowIdx;
            u1 = cv1.u;
        } else {
            row1 = Math.floor(v1 / numU);
            u1 = vertices[v1 * 3];
        }

        if (Math.abs(u0 - u1) > SEAM_THRESHOLD) continue;
        const r0 = Math.min(row0, row1);
        const r1 = Math.max(row0, row1);
        if (r1 - r0 > 1) continue;
        let list = rowBandEdges.get(r0);
        if (!list) { list = []; rowBandEdges.set(r0, list); }
        list.push([v0, v1]);
    }

    const getCellChainInfo = (band: number, col: number): CellChainInfo => {
        const key = cellKey(band, col);
        let info = cellChainMap.get(key);
        if (!info) {
            info = { botChainVerts: [], topChainVerts: [], chainEdges: [] };
            cellChainMap.set(key, info);
        }
        return info;
    };

    const pushUnique = (list: number[], vertexIdx: number): void => {
        if (!list.includes(vertexIdx)) list.push(vertexIdx);
    };

    const boundaryStraddleMask = new Map<number, number>();
    const boundaryPropagationKey = (row: number, line: number): number => row * numU + line;
    for (const cv of chainVertices) {
        if (cv.t !== undefined) continue;
        if (batch2Remap.has(cv.vertexIdx)) continue;
        const col = bsearchFloor(unionU, cv.u);
        const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
        for (const line of [gc, gc + 1]) {
            if (line <= 0 || line >= cellsPerRow) continue;
            const distance = cv.u - unionU[line];
            if (Math.abs(distance) >= GRID_CHAIN_BOUNDARY_PROPAGATE_RADIUS) continue;
            if (Math.abs(distance) <= 1e-12) continue;
            const key = boundaryPropagationKey(cv.rowIdx, line);
            const sideMask = distance < 0 ? 1 : 2;
            boundaryStraddleMask.set(key, (boundaryStraddleMask.get(key) ?? 0) | sideMask);
        }
    }

    const hasOppositeSideBoundaryChain = (row: number, line: number): boolean =>
        boundaryStraddleMask.get(boundaryPropagationKey(row, line)) === 3;

    const assignChainVertexToColumn = (cv: ChainVertex, col: number): void => {
        if (col < 0 || col >= cellsPerRow) return;

        // This vertex is on row cv.rowIdx.
        // It affects cell (cv.rowIdx - 1, col) as a top-edge vertex
        // and cell (cv.rowIdx, col) as a bottom-edge vertex.
        if (cv.rowIdx > 0) {
            pushUnique(getCellChainInfo(cv.rowIdx - 1, col).topChainVerts, cv.vertexIdx);
        }
        if (cv.rowIdx < numT - 1) {
            pushUnique(getCellChainInfo(cv.rowIdx, col).botChainVerts, cv.vertexIdx);
        }
    };

    // Assign chain vertices to cells
    for (const cv of chainVertices) {
        if (cv.t !== undefined) continue; // skip 2D companions
        if (batch2Remap.has(cv.vertexIdx)) continue; // merged with grid

        const col = bsearchFloor(unionU, cv.u);
        const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);

        assignChainVertexToColumn(cv, gc);

        // If the chain vertex lies on a vertical cell boundary, both adjacent
        // cells must receive the row-edge split or grid-chain coalescing leaves
        // a one-triangle pin on the standard side of the boundary.
        if (
            Math.abs(cv.u - unionU[gc]) < GRID_CHAIN_BOUNDARY_PROPAGATE_RADIUS &&
            !hasOppositeSideBoundaryChain(cv.rowIdx, gc)
        ) {
            assignChainVertexToColumn(cv, gc - 1);
        }
        if (
            Math.abs(cv.u - unionU[gc + 1]) < GRID_CHAIN_BOUNDARY_PROPAGATE_RADIUS &&
            !hasOppositeSideBoundaryChain(cv.rowIdx, gc + 1)
        ) {
            assignChainVertexToColumn(cv, gc + 1);
        }
    }

    // Assign chain edges to cells
    let crossCellEdgeCount = 0;
    const fusionRequests: SuperCell[] = [];

    for (const [v0, v1] of chainEdges) {
        // Skip self-edges from batch2Remap
        if (v0 === v1) continue;

        const isChainV0 = v0 >= gridVertexCount && v0 < totalVertexCount;
        const isChainV1 = v1 >= gridVertexCount && v1 < totalVertexCount;
        const cv0 = isChainV0 ? chainVertices[v0 - gridVertexCount] : undefined;
        const cv1 = isChainV1 ? chainVertices[v1 - gridVertexCount] : undefined;

        let row0: number, row1: number, u0: number, u1: number;
        if (cv0) { row0 = cv0.rowIdx; u0 = cv0.u; }
        else { row0 = Math.floor(v0 / numU); u0 = vertices[v0 * 3]; }
        if (cv1) { row1 = cv1.rowIdx; u1 = cv1.u; }
        else { row1 = Math.floor(v1 / numU); u1 = vertices[v1 * 3]; }

        if (Math.abs(u0 - u1) > SEAM_THRESHOLD) continue;
        const r0 = Math.min(row0, row1);
        const r1 = Math.max(row0, row1);
        if (r1 - r0 > 1) continue;
        const band = r0;

        const col0raw = bsearchFloor(unionU, u0);
        const col1raw = bsearchFloor(unionU, u1);
        const gc0 = Math.max(0, Math.min(cellsPerRow - 1, col0raw));
        const gc1 = Math.max(0, Math.min(cellsPerRow - 1, col1raw));

        if (gc0 === gc1) {
            // Same-column edge: register directly
            const key = cellKey(band, gc0);
            let info = cellChainMap.get(key);
            if (!info) { info = { botChainVerts: [], topChainVerts: [], chainEdges: [] }; cellChainMap.set(key, info); }
            info.chainEdges.push([v0, v1]);
        } else {
            // R35: Cross-column edge → record fusion request (super-cell)
            crossCellEdgeCount++;
            const cMin = Math.min(gc0, gc1);
            const cMax = Math.max(gc0, gc1);

            // Register the chain edge in ALL cells it crosses
            for (let c = cMin; c <= cMax; c++) {
                const key = cellKey(band, c);
                let info = cellChainMap.get(key);
                if (!info) {
                    info = { botChainVerts: [], topChainVerts: [], chainEdges: [] };
                    cellChainMap.set(key, info);
                }
                info.chainEdges.push([v0, v1]);
                r35SuperCellCols.add(key);
            }

            // Record fusion request
            fusionRequests.push({ band, colStart: cMin, colEnd: cMax });
        }
    }

    // Sort chain vertex lists within each cell by U position
    for (const [, info] of cellChainMap) {
        info.botChainVerts.sort((a, b) => vertices[a * 3] - vertices[b * 3]);
        info.topChainVerts.sort((a, b) => vertices[a * 3] - vertices[b * 3]);
    }

    // ── R54: Near-boundary cell fusion ──
    // Chain vertices very close to a cell boundary create narrow sub-quads
    // with catastrophic aspect ratios (12:1+) at the most critical location
    // (directly adjacent to ridge/valley chain edges). Detect these and
    // generate fusion requests so the cell merges with its neighbor,
    // eliminating the narrow sub-quad. Reuses R35 super-cell infrastructure.
    let r54FusionCount = 0;
    let r54ChainCellsScanned = 0;
    let r54SkippedR35Covered = 0;
    let r54SkippedMultiChain = 0;
    let r54SevereQualified = 0;
    for (const [key, info] of cellChainMap) {
        r54ChainCellsScanned++;
        if (r35SuperCellCols.has(key)) {
            r54SkippedR35Covered++;
            continue;
        }
        // First pass: keep R54 focused on simple single-edge cells.
        if (info.chainEdges.length !== 1) {
            r54SkippedMultiChain++;
            continue;
        }
        const band = Math.floor(key / cellsPerRow);
        const col = key % cellsPerRow;
        const uLeft = unionU[col];
        const uRight = unionU[col + 1];
        const cellWidth = uRight - uLeft;
        if (cellWidth <= 0 || cellWidth > SEAM_GUARD) continue; // skip seam cells
        const bandHeight = activeTPositions[band + 1] - activeTPositions[band];
        if (bandHeight <= 1e-12) continue;

        const allChainVerts = [...info.botChainVerts, ...info.topChainVerts];
        for (const cvIdx of allChainVerts) {
            const uChain = vertices[cvIdx * 3];
            const distToLeft = uChain - uLeft;
            const distToRight = uRight - uChain;
            const minDist = Math.min(distToLeft, distToRight);

            // Exact-boundary: handled by R35 cross-column detection
            if (minDist < 1e-10) continue;

            const nearBoundary = minDist / cellWidth < R54_NEAR_BOUNDARY_FRAC;
            const severeNarrowAspect = minDist / bandHeight < R54_NARROW_TO_BAND_MAX;

            // Stricter policy: fuse only when BOTH conditions are true.
            // This keeps R54 focused on truly bad narrow-side cases and avoids
            // broad topology rewrites that can degrade aggregate quality.
            if (nearBoundary && severeNarrowAspect) {
                const neighborCol = distToLeft < distToRight ? col - 1 : col + 1;

                // Guard: neighbor must exist
                if (neighborCol < 0 || neighborCol >= cellsPerRow) continue;

                // Guard: neighbor must not be a seam cell
                const neighborWidth = unionU[neighborCol + 1] - unionU[neighborCol];
                if (neighborWidth > SEAM_GUARD || neighborWidth < -SEAM_GUARD) continue;

                fusionRequests.push({
                    band,
                    colStart: Math.min(col, neighborCol),
                    colEnd: Math.max(col, neighborCol),
                });
                r54SevereQualified++;
                r54FusionCount++;
                break; // one fusion per cell is sufficient
            }
        }
    }
    if (r54FusionCount > 0) {
        console.log(
            `[CDT] R54: ${r54FusionCount} fusions from ${cellChainMap.size} chain cells ` +
            `(threshold=${R54_NEAR_BOUNDARY_FRAC}, severe=${R54_NARROW_TO_BAND_MAX}, ` +
            `scanned=${r54ChainCellsScanned}, r35Skip=${r54SkippedR35Covered}, multiSkip=${r54SkippedMultiChain}, ` +
            `severeQualified=${r54SevereQualified})`
        );
    }

    // ── 3.8. Merge fusion requests into super-cells (R35 + R54) ──
    const superCellMap = new Map<number, SuperCell[]>(); // band → merged intervals

    if (fusionRequests.length > 0) {
        const byBand = new Map<number, SuperCell[]>();
        for (const req of fusionRequests) {
            let list = byBand.get(req.band);
            if (!list) { list = []; byBand.set(req.band, list); }
            list.push(req);
        }

        for (const [band, reqs] of byBand) {
            reqs.sort((a, b) => a.colStart - b.colStart);
            const merged: SuperCell[] = [];
            let cur = { ...reqs[0] };
            for (let i = 1; i < reqs.length; i++) {
                if (reqs[i].colStart <= cur.colEnd + 1) {
                    cur.colEnd = Math.max(cur.colEnd, reqs[i].colEnd);
                } else {
                    merged.push(cur);
                    cur = { ...reqs[i] };
                }
            }
            merged.push(cur);
            superCellMap.set(band, merged);
        }
    }

    // Build quick lookup: (band, col) → true if column is part of a super-cell
    const superCellCols = new Set<number>(); // stores cellKey(band, col)
    const superCellStarts = new Map<number, SuperCell>(); // cellKey(band, colStart) → SuperCell
    const superCellOwnerByCell = new Map<number, SuperCell>();
    for (const [band, cells] of superCellMap) {
        for (const sc of cells) {
            // Seam guard: if ANY constituent cell is seam-spanning, exclude it
            let hasSeam = false;
            for (let c = sc.colStart; c <= sc.colEnd; c++) {
                const uSpan = unionU[c + 1] - unionU[c];
                if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
                    hasSeam = true;
                    break;
                }
            }
            if (hasSeam) continue; // fall back to per-cell emission (edges will be dropped)

            superCellStarts.set(cellKey(band, sc.colStart), sc);
            for (let c = sc.colStart; c <= sc.colEnd; c++) {
                const key = cellKey(band, c);
                superCellCols.add(key);
                superCellOwnerByCell.set(key, sc);
            }
        }
    }

    let corridorPlan: OuterWallCorridorPlanningResult | undefined;
    if (options?.corridorPlanning) {
        const legacyOwnership = new Map<number, Set<number>>();
        const appendChainId = (key: number, chainId: number | undefined): void => {
            if (chainId === undefined) return;
            let ids = legacyOwnership.get(key);
            if (!ids) {
                ids = new Set<number>();
                legacyOwnership.set(key, ids);
            }
            ids.add(chainId);
        };
        for (const [key, info] of cellChainMap) {
            for (const vertexIdx of info.botChainVerts) appendChainId(key, resolveVertexChainId(vertexIdx));
            for (const vertexIdx of info.topChainVerts) appendChainId(key, resolveVertexChainId(vertexIdx));
            for (const [v0, v1] of info.chainEdges) {
                appendChainId(key, resolveVertexChainId(v0));
                appendChainId(key, resolveVertexChainId(v1));
            }
        }
        for (const [band, cells] of superCellMap) {
            for (const sc of cells) {
                const inheritedIds = new Set<number>();
                for (let col = sc.colStart; col <= sc.colEnd; col++) {
                    const ids = legacyOwnership.get(cellKey(band, col));
                    if (!ids) continue;
                    for (const chainId of ids) inheritedIds.add(chainId);
                }
                if (inheritedIds.size === 0) continue;
                for (let col = sc.colStart; col <= sc.colEnd; col++) {
                    const key = cellKey(band, col);
                    let ids = legacyOwnership.get(key);
                    if (!ids) {
                        ids = new Set<number>();
                        legacyOwnership.set(key, ids);
                    }
                    for (const chainId of inheritedIds) ids.add(chainId);
                }
            }
        }
        const legacyCells: OuterWallLegacyOwnershipCell[] = [...legacyOwnership.entries()]
            .map(([key, chainIds]) => ({
                band: Math.floor(key / cellsPerRow),
                col: key % cellsPerRow,
                chainIds: [...chainIds].sort((a, b) => a - b),
            }))
            .sort((left, right) => left.band - right.band || left.col - right.col);
        corridorPlan = planOuterWallCorridors({
            unionU,
            cellsPerRow,
            legacyCells,
            seamGuard: SEAM_GUARD,
            includeDiagnostics: Boolean(options.corridorDiagnostics),
        });
        if (options.corridorDiagnostics && corridorPlan.diagnostics) {
            const diagnostics = corridorPlan.diagnostics;
            console.log(
                `[CDT] Corridor dry-run: legacyCells=${diagnostics.legacyCellCount}, ` +
                `candidates=${diagnostics.candidateCount}, supported=${diagnostics.supportedCandidateCount}, ` +
                `unsupported=${diagnostics.unsupportedCandidateCount}, supportedCoverage=${diagnostics.supportedCoverageRatio.toFixed(3)}`,
            );
        }
    }

    const supportedCorridorCells = new Set<number>();
    const supportedCorridorStarts = new Map<number, OuterWallCorridorOwnershipSegment>();
    const corridorOwnedSpanCells = new Set<number>();
    const corridorOwnedSpanStarts = new Map<number, OwnedSpanDescriptor>();
    if (options?.corridorPlanning && corridorPlan) {
        for (const candidate of corridorPlan.candidates) {
            if (!candidate.supported) continue;
            for (const segment of candidate.ownershipSegments) {
                if (!isCorridorOwnershipSegmentAdmissible(segment)) {
                    continue;
                }
                let authoritative = true;
                for (let col = segment.colStart; col <= segment.colEnd; col++) {
                    const key = cellKey(segment.band, col);
                    if (supportedCorridorCells.has(key)) {
                        authoritative = false;
                        break;
                    }
                }
                if (!authoritative) continue;
                supportedCorridorStarts.set(cellKey(segment.band, segment.colStart), segment);
                const ownedSpan = tryBuildCorridorOwnedSpanDescriptor(segment);
                if (ownedSpan) {
                    corridorOwnedSpanStarts.set(cellKey(segment.band, segment.colStart), ownedSpan);
                    for (let col = segment.colStart; col <= segment.colEnd; col++) {
                        corridorOwnedSpanCells.add(cellKey(segment.band, col));
                    }
                }
                for (let col = segment.colStart; col <= segment.colEnd; col++) {
                    supportedCorridorCells.add(cellKey(segment.band, col));
                }
            }
        }
    }

    const ownedSpanCells = new Set<number>();
    const ownedSpanStarts = new Map<number, OwnedSpanDescriptor>();
    const ownedSpanDescriptors: OwnedSpanDescriptor[] = [];
    const registerOwnedSpan = (span: OwnedSpanDescriptor): void => {
        ownedSpanStarts.set(cellKey(span.band, span.colStart), span);
        ownedSpanDescriptors.push(span);
        for (let col = span.colStart; col <= span.colEnd; col++) {
            ownedSpanCells.add(cellKey(span.band, col));
        }
    };

    for (const span of corridorOwnedSpanStarts.values()) {
        registerOwnedSpan(span);
    }

    for (const [band, cells] of superCellMap) {
        for (const sc of cells) {
            let claimedByCorridor = false;
            for (let col = sc.colStart; col <= sc.colEnd; col++) {
                if (corridorOwnedSpanCells.has(cellKey(band, col))) {
                    claimedByCorridor = true;
                    break;
                }
            }
            if (claimedByCorridor) continue;

            registerOwnedSpan({
                ownerKey: `supercell-${band}-${sc.colStart}-${sc.colEnd}`,
                band,
                colStart: sc.colStart,
                colEnd: sc.colEnd,
                kind: 'supercell',
                includeIntermediateGridColumns: true,
                bottomBoundaryUs: [unionU[sc.colStart], unionU[sc.colEnd + 1]],
                topBoundaryUs: [unionU[sc.colStart], unionU[sc.colEnd + 1]],
            });
        }
    }

    let ownedNeighborPrunedChainVerts = 0;
    for (const [key, info] of [...cellChainMap]) {
        if (ownedSpanCells.has(key)) continue;
        const band = Math.floor(key / cellsPerRow);
        const col = key % cellsPerRow;
        const edgeVerts = new Set<number>();
        for (const [v0, v1] of info.chainEdges) {
            edgeVerts.add(v0);
            edgeVerts.add(v1);
        }
        const propagatedOwnerKind = (vertexIdx: number): 'active' | 'owned' | undefined => {
            if (edgeVerts.has(vertexIdx)) return undefined;
            const u = vertices[vertexIdx * 3];
            const rawCol = bsearchFloor(unionU, u);
            const owningCol = Math.max(0, Math.min(cellsPerRow - 1, rawCol));
            if (owningCol === col) return undefined;
            if (
                owningCol <= 0 ||
                owningCol >= cellsPerRow - 1 ||
                col <= 0 ||
                col >= cellsPerRow - 1
            ) {
                return undefined;
            }
            const ownerKey = cellKey(band, owningCol);
            if (ownedSpanCells.has(ownerKey)) return 'owned';
            if (cellChainMap.has(ownerKey)) return 'active';
            return undefined;
        };
        const pruneRowEdge = (rowVerts: number[]): number[] => {
            const candidates = rowVerts
                .map(vertexIdx => ({ vertexIdx, kind: propagatedOwnerKind(vertexIdx) }))
                .filter((candidate): candidate is { vertexIdx: number; kind: 'active' | 'owned' } =>
                    candidate.kind !== undefined,
                );
            if (candidates.length === 0) return rowVerts;
            const candidateSet = new Set(candidates.map(candidate => candidate.vertexIdx));
            if (candidateSet.size === 0) return rowVerts;
            return rowVerts.filter(vertexIdx => !candidateSet.has(vertexIdx));
        };
        const oldBotCount = info.botChainVerts.length;
        const oldTopCount = info.topChainVerts.length;
        info.botChainVerts = pruneRowEdge(info.botChainVerts);
        info.topChainVerts = pruneRowEdge(info.topChainVerts);
        ownedNeighborPrunedChainVerts +=
            oldBotCount - info.botChainVerts.length +
            oldTopCount - info.topChainVerts.length;
        if (
            info.botChainVerts.length === 0 &&
            info.topChainVerts.length === 0 &&
            info.chainEdges.length === 0
        ) {
            cellChainMap.delete(key);
        }
    }
    if (ownedNeighborPrunedChainVerts > 0) {
        console.log(`[CDT] R57 row propagation pruning: ${ownedNeighborPrunedChainVerts} propagated chain verts removed`);
    }

    interface OwnedSpanDescriptor {
        ownerKey: string;
        band: number;
        colStart: number;
        colEnd: number;
        kind: 'supercell' | 'corridor';
        includeIntermediateGridColumns: boolean;
        bottomBoundaryUs: [number, number];
        topBoundaryUs: [number, number];
    }

    interface CorridorSpanGeometry {
        bottomEdge: number[];
        topEdge: number[];
        uniqueEdges: Array<[number, number]>;
    }

    function resolveCorridorBoundaryUs(segment: OuterWallCorridorOwnershipSegment): {
        leftBoundaryU: number;
        rightBoundaryU: number;
        topLeftBoundaryU: number;
        topRightBoundaryU: number;
    } {
        const { colStart, colEnd } = segment;
        const bottomCollar = segment.seamCollar.find(entry => entry.edge === 'bottom');
        const topCollar = segment.seamCollar.find(entry => entry.edge === 'top');
        const leftBoundaryU = bottomCollar?.splitUs[0] ?? unionU[colStart];
        const rightBoundaryU = bottomCollar?.splitUs[bottomCollar.splitUs.length - 1] ?? unionU[colEnd + 1];
        const topLeftBoundaryU = topCollar?.splitUs[0] ?? leftBoundaryU;
        const topRightBoundaryU = topCollar?.splitUs[topCollar.splitUs.length - 1] ?? rightBoundaryU;

        return { leftBoundaryU, rightBoundaryU, topLeftBoundaryU, topRightBoundaryU };
    }

    function getExactMatchedSuperCellOwner(
        segment: OuterWallCorridorOwnershipSegment,
    ): SuperCell | undefined {
        if (segment.periodicSeam) return undefined;

        const touchedSuperCells = new Set<SuperCell>();
        for (let col = segment.colStart; col <= segment.colEnd; col++) {
            const owner = superCellOwnerByCell.get(cellKey(segment.band, col));
            if (owner) {
                touchedSuperCells.add(owner);
            }
        }
        if (touchedSuperCells.size !== 1) return undefined;

        const [owner] = [...touchedSuperCells];
        if (owner.band !== segment.band || owner.colStart !== segment.colStart || owner.colEnd !== segment.colEnd) {
            return undefined;
        }

        return owner;
    }

    function isBoundedTwoChainOwnedSpan(
        segment: OuterWallCorridorOwnershipSegment,
        geometry: CorridorSpanGeometry,
    ): boolean {
        if (segment.periodicSeam) return false;
        if (segment.chainIds.length !== 2) return false;
        if (geometry.uniqueEdges.length !== 2) return false;

        const bandBottomT = activeTPositions[segment.band];
        const bandTopT = activeTPositions[segment.band + 1];
        const edgeRecords: Array<{ bottomU: number; topU: number; chainId: number }> = [];

        for (const [v0, v1] of geometry.uniqueEdges) {
            const t0 = vertices[v0 * 3 + 1];
            const t1 = vertices[v1 * 3 + 1];
            const bottomVertex = Math.abs(t0 - bandBottomT) <= 1e-6
                ? v0
                : (Math.abs(t1 - bandBottomT) <= 1e-6 ? v1 : -1);
            const topVertex = Math.abs(t0 - bandTopT) <= 1e-6
                ? v0
                : (Math.abs(t1 - bandTopT) <= 1e-6 ? v1 : -1);
            if (bottomVertex < 0 || topVertex < 0 || bottomVertex === topVertex) {
                return false;
            }

            const chainId = resolveVertexChainId(v0) ?? resolveVertexChainId(v1);
            if (chainId === undefined || !segment.chainIds.includes(chainId)) {
                return false;
            }

            edgeRecords.push({
                bottomU: vertices[bottomVertex * 3],
                topU: vertices[topVertex * 3],
                chainId,
            });
        }

        const uniqueChainIds = new Set(edgeRecords.map(record => record.chainId));
        if (uniqueChainIds.size !== 2) return false;

        const bottomChainVertices = geometry.bottomEdge.filter(vertexIdx => {
            const chainId = resolveVertexChainId(vertexIdx);
            return chainId !== undefined && segment.chainIds.includes(chainId);
        });
        const topChainVertices = geometry.topEdge.filter(vertexIdx => {
            const chainId = resolveVertexChainId(vertexIdx);
            return chainId !== undefined && segment.chainIds.includes(chainId);
        });
        if (bottomChainVertices.length !== 2 || topChainVertices.length !== 2) {
            return false;
        }

        edgeRecords.sort((left, right) => left.bottomU - right.bottomU);
        return edgeRecords[0].topU < edgeRecords[1].topU;
    }

    function tryBuildCorridorOwnedSpanDescriptor(
        segment: OuterWallCorridorOwnershipSegment,
    ): OwnedSpanDescriptor | undefined {
        const owner = getExactMatchedSuperCellOwner(segment);
        if (!owner) return undefined;
        if (segment.chainIds.length > 2) return undefined;

        if (segment.chainIds.length === 2) {
            const geometry = buildCorridorSpanGeometry(segment);
            if (!isBoundedTwoChainOwnedSpan(segment, geometry)) {
                return undefined;
            }
        }

        const { leftBoundaryU, rightBoundaryU, topLeftBoundaryU, topRightBoundaryU } = resolveCorridorBoundaryUs(segment);
        return {
            ownerKey: `corridor-${segment.band}-${segment.colStart}-${segment.colEnd}`,
            band: segment.band,
            colStart: segment.colStart,
            colEnd: segment.colEnd,
            kind: 'corridor',
            includeIntermediateGridColumns: false,
            bottomBoundaryUs: [leftBoundaryU, rightBoundaryU],
            topBoundaryUs: [topLeftBoundaryU, topRightBoundaryU],
        };
    }

    function buildOwnedSpanGeometry(span: OwnedSpanDescriptor): CorridorSpanGeometry {
        const { band, colStart, colEnd } = span;
        const [leftBoundaryU, rightBoundaryU] = span.bottomBoundaryUs;
        const [topLeftBoundaryU, topRightBoundaryU] = span.topBoundaryUs;

        const resolveBoundaryColumn = (targetU: number, fallbackCol: number): number => {
            if (Math.abs(unionU[fallbackCol] - targetU) <= 1e-8) return fallbackCol;
            const resolved = bsearchFloor(unionU, targetU);
            return Math.max(0, Math.min(numU - 1, resolved));
        };

        const leftBotCol = resolveBoundaryColumn(leftBoundaryU, colStart);
        const rightBotCol = resolveBoundaryColumn(rightBoundaryU, colEnd + 1);
        const leftTopCol = resolveBoundaryColumn(topLeftBoundaryU, colStart);
        const rightTopCol = resolveBoundaryColumn(topRightBoundaryU, colEnd + 1);

        const bottomEdge: number[] = [band * numU + leftBotCol];
        const topEdge: number[] = [(band + 1) * numU + leftTopCol];

        // Bug #4 fix: pre-collect chain U positions per edge so we can drop
        // intermediate grid columns that would create near-coincident pairs
        // (PIN TRIANGLES). Intermediate columns are INTERIOR to the super-cell
        // — adjacent cells are also chain/super — so dropping them cannot
        // create T-junctions with standard cells. R52 Precision Lock preserved:
        // chain vertices are NOT moved; redundant grid vertices clustered near
        // them are simply not emitted.
        const INTERMEDIATE_PIN_RADIUS = 0.0006;
        const chainBotUs: number[] = [];
        const chainTopUs: number[] = [];
        for (let col = colStart; col <= colEnd; col++) {
            const info = cellChainMap.get(cellKey(band, col));
            if (!info) continue;
            for (const vIdx of info.botChainVerts) chainBotUs.push(vertices[vIdx * 3]);
            for (const vIdx of info.topChainVerts) chainTopUs.push(vertices[vIdx * 3]);
        }
        const tooCloseToChain = (gridU: number, chainUs: number[]): boolean => {
            for (const cu of chainUs) {
                let du = Math.abs(gridU - cu);
                if (du > 0.5) du = 1 - du;
                if (du < INTERMEDIATE_PIN_RADIUS) return true;
            }
            return false;
        };

        for (let col = colStart; col <= colEnd; col++) {
            if (span.includeIntermediateGridColumns && col < colEnd) {
                const interBotIdx = band * numU + (col + 1);
                const interTopIdx = (band + 1) * numU + (col + 1);
                const interBotU = vertices[interBotIdx * 3];
                const interTopU = vertices[interTopIdx * 3];
                if (!tooCloseToChain(interBotU, chainBotUs)) {
                    bottomEdge.push(interBotIdx);
                }
                if (!tooCloseToChain(interTopU, chainTopUs)) {
                    topEdge.push(interTopIdx);
                }
            }
            const info = cellChainMap.get(cellKey(band, col));
            if (!info) continue;
            pushAll(bottomEdge, info.botChainVerts);
            pushAll(topEdge, info.topChainVerts);
        }
        bottomEdge.push(band * numU + rightBotCol);
        topEdge.push((band + 1) * numU + rightTopCol);
        bottomEdge.sort((left, right) => vertices[left * 3] - vertices[right * 3]);
        topEdge.sort((left, right) => vertices[left * 3] - vertices[right * 3]);

        const allEdges: Array<[number, number]> = [];
        for (let col = colStart; col <= colEnd; col++) {
            const info = cellChainMap.get(cellKey(band, col));
            if (!info) continue;
            pushAll(allEdges, info.chainEdges);
        }
        const uniqueEdges: Array<[number, number]> = [];
        const edgeSet = new Set<string>();
        for (const [v0, v1] of allEdges) {
            const edgeKey = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
            if (edgeSet.has(edgeKey)) continue;
            edgeSet.add(edgeKey);
            uniqueEdges.push([v0, v1]);
        }

        return {
            bottomEdge: dedupeSortedVertexEdge(bottomEdge),
            topEdge: dedupeSortedVertexEdge(topEdge),
            uniqueEdges,
        };
    }

    function buildCorridorSpanGeometry(segment: OuterWallCorridorOwnershipSegment): CorridorSpanGeometry {
        const { leftBoundaryU, rightBoundaryU, topLeftBoundaryU, topRightBoundaryU } = resolveCorridorBoundaryUs(segment);
        return buildOwnedSpanGeometry({
            ownerKey: `segment-${segment.band}-${segment.colStart}-${segment.colEnd}`,
            band: segment.band,
            colStart: segment.colStart,
            colEnd: segment.colEnd,
            kind: 'corridor',
            includeIntermediateGridColumns: false,
            bottomBoundaryUs: [leftBoundaryU, rightBoundaryU],
            topBoundaryUs: [topLeftBoundaryU, topRightBoundaryU],
        });
    }

    function isCorridorOwnershipSegmentAdmissible(segment: OuterWallCorridorOwnershipSegment): boolean {
        let touchesSuperCell = false;
        for (let col = segment.colStart; col <= segment.colEnd; col++) {
            const key = cellKey(segment.band, col);
            if (superCellCols.has(key)) {
                touchesSuperCell = true;
            }
        }
        if (touchesSuperCell) {
            return tryBuildCorridorOwnedSpanDescriptor(segment) !== undefined;
        }

        if (segment.chainIds.length <= 1) return true;
        const geometry = buildCorridorSpanGeometry(segment);
        return isBoundedTwoChainOwnedSpan(segment, geometry);
    }

    // ── 3.9. R37: Column-crossing phantom vertices and chain edge pre-split ──
    // For each super-cell with column-boundary crossings, create phantom row
    // vertices at the crossing T and split chain edges at those vertices.
    // This enables band splitting in emitSuperCell to eliminate dip artifacts.

    /** Phantom crossing anchor and optional side companions on a phantom row. */
    interface PhantomCrossing {
        anchorIdx: number;
        leftCompanionIdx?: number;
        rightCompanionIdx?: number;
        sourceEdge: [number, number];
        isBoundaryCrossing: boolean;
    }

    /** Phantom row: a horizontal slice at a specific T within a super-cell band */
    interface PhantomRow {
        tCross: number;
        vertexIndices: number[];
        crossings: PhantomCrossing[];
    }

    /** R37 band-splitting data for a single owned span */
    interface SuperCellR37Data {
        phantomRows: PhantomRow[];
        subEdges: Array<[number, number]>;
    }

    const ownedSpanR37 = new Map<string, SuperCellR37Data>();

    /** Fraction of band height: crossings closer to a boundary than this are skipped */
    const R37_DEGEN_GUARD_FRAC = 0.05;
    /** Absolute minimum distance from band boundary for a valid crossing */
    const R37_DEGEN_GUARD_MIN = 2e-4;
    /**
     * R37 rows are optional auxiliary splits. Keep a reserve below the final
     * hard-sliver threshold because style deformation can amplify source-space
     * aspect after GPU surface evaluation.
     */
    const R37_MAX_SOURCE_ASPECT = 60;
    /** Threshold for merging phantom vertices at similar U positions */
    const R37_U_MERGE = 1e-4;

    const edgeSplitMap = new Map<string, Array<[number, number]>>();
    const phantomVertexChainIds = new Map<number, number>();
    const protectedStripVertices = new Set<number>();
    let nextPhantomIdx = phantomVertexStart;
    let r37SkippedNearBoundaryCrossings = 0;
    let r37BoundaryTouchCrossings = 0;

    const R38_COMPANION_FRACTION = 0.5;
    const R38_MIN_SIDE_SPAN_FACTOR = 0.35;

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║ 🔒 R52 PRECISION LOCK — Phantom vertex type separation              ║
    // ║ phantomChainAnchorSet and isChainAnchor parameter ensure chain       ║
    // ║ crossing anchors NEVER merge with column boundary phantom vertices.  ║
    // ║ Removing this causes chain vertices to snap to grid column U-values. ║
    // ║ See ChainVertexBuilder.ts for the full R52 precision guarantee.      ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    // R52: Track which phantom vertices are chain anchors vs grid column boundaries
    const phantomChainAnchorSet = new Set<number>();

    // R55: Vertex classification closures for grid/chain coalescing.
    // Grid-like: original grid vertices OR phantom vertices that are NOT chain anchors.
    // Chain-like: original chain vertices OR phantom chain anchor vertices.
    const isGridLike = (idx: number): boolean =>
        idx < gridVertexCount || (idx >= totalVertexCount && !phantomChainAnchorSet.has(idx));
    const isChainLike = (idx: number): boolean =>
        (idx >= gridVertexCount && idx < totalVertexCount) || phantomChainAnchorSet.has(idx);

    const upsertPhantomRowVertex = (
        rowVerts: Array<{ u: number; idx: number }>,
        tCross: number,
        u: number,
        isChainAnchor: boolean = false,
    ): number => {
        // R52: Chain anchors never merge with column boundary vertices.
        // They only dedup against other chain anchors on the same phantom row.
        for (const pv of rowVerts) {
            if (Math.abs(pv.u - u) < R37_U_MERGE) {
                if (isChainAnchor && !phantomChainAnchorSet.has(pv.idx)) {
                    // Skip: chain anchor must not reuse a grid column vertex
                    continue;
                }
                if (!isChainAnchor && phantomChainAnchorSet.has(pv.idx)) {
                    // Skip: column boundary must not reuse a chain anchor
                    continue;
                }
                return pv.idx;
            }
        }
        if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
            console.warn(`[CDT] R37: Phantom vertex slot overflow! budget=${maxPhantomSlots}, used=${nextPhantomIdx - phantomVertexStart}. Geometry may be corrupt.`);
            return rowVerts[rowVerts.length - 1]?.idx ?? 0;
        }
        const pIdx = nextPhantomIdx++;
        vertices[pIdx * 3] = u;
        vertices[pIdx * 3 + 1] = tCross;
        vertices[pIdx * 3 + 2] = surfaceId;
        rowVerts.push({ u, idx: pIdx });
        if (isChainAnchor) {
            phantomChainAnchorSet.add(pIdx);
        }
        return pIdx;
    };

    for (const ownedSpan of ownedSpanDescriptors) {
            const r37Band = ownedSpan.band;
            let r37HasSeam = false;
            for (let c = ownedSpan.colStart; c <= ownedSpan.colEnd; c++) {
                const uSpan = unionU[c + 1] - unionU[c];
                if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) { r37HasSeam = true; break; }
            }
            if (r37HasSeam) continue;

            const tBot = activeTPositions[r37Band];
            const tTop = activeTPositions[r37Band + 1];
            const bandHeight = tTop - tBot;
            const degenGuard = Math.max(R37_DEGEN_GUARD_MIN, R37_DEGEN_GUARD_FRAC * bandHeight);
            let maxAdjacentColumnWidth = 0;
            const firstQualityCol = Math.max(0, ownedSpan.colStart - 1);
            const lastQualityCol = Math.min(cellsPerRow - 1, ownedSpan.colEnd + 1);
            for (let c = firstQualityCol; c <= lastQualityCol; c++) {
                const width = Math.abs(unionU[c + 1] - unionU[c]);
                if (width <= SEAM_GUARD) {
                    maxAdjacentColumnWidth = Math.max(maxAdjacentColumnWidth, width);
                }
            }
            const metricColumnWidth = maxAdjacentColumnWidth * metricAspect;

            // Collect unique chain edges for this owned span
            const scEdgeSet = new Set<string>();
            const scEdges: Array<[number, number]> = [];
            for (let c = ownedSpan.colStart; c <= ownedSpan.colEnd; c++) {
                const info = cellChainMap.get(cellKey(r37Band, c));
                if (info) {
                    for (const [ev0, ev1] of info.chainEdges) {
                        const k = ev0 < ev1 ? `${ev0}-${ev1}` : `${ev1}-${ev0}`;
                        if (!scEdgeSet.has(k)) {
                            scEdgeSet.add(k);
                            scEdges.push([ev0, ev1]);
                        }
                    }
                }
            }

            // Find crossing T values where chain edges cross column boundaries
            const crossingTs: number[] = [];
            for (const [ev0, ev1] of scEdges) {
                const u0 = vertices[ev0 * 3], t0 = vertices[ev0 * 3 + 1];
                const u1 = vertices[ev1 * 3], t1 = vertices[ev1 * 3 + 1];
                if (Math.abs(u1 - u0) < 1e-12) continue;
                for (let c = ownedSpan.colStart + 1; c <= ownedSpan.colEnd; c++) {
                    const uBound = unionU[c];
                    const d0 = u0 - uBound;
                    const d1 = u1 - uBound;
                    const crossesBoundary = (d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0);
                    const touchesBoundary = (!crossesBoundary) &&
                        ((Math.abs(d0) <= R37_U_MERGE && Math.abs(d1) > R37_U_MERGE) ||
                            (Math.abs(d1) <= R37_U_MERGE && Math.abs(d0) > R37_U_MERGE));
                    if (crossesBoundary || touchesBoundary) {
                        const alpha = (uBound - u0) / (u1 - u0);
                        const tCross = t0 + alpha * (t1 - t0);
                        if (touchesBoundary) {
                            r37BoundaryTouchCrossings++;
                        }
                        if (tCross <= tBot + degenGuard || tCross >= tTop - degenGuard) {
                            r37SkippedNearBoundaryCrossings++;
                            continue;
                        }
                        const minSubBandHeight = Math.min(tCross - tBot, tTop - tCross);
                        const sourceAspect = metricColumnWidth > 0 && minSubBandHeight > 0
                            ? (
                                (metricColumnWidth * metricColumnWidth + minSubBandHeight * minSubBandHeight) *
                                Math.sqrt(3)
                            ) / (2 * metricColumnWidth * minSubBandHeight)
                            : Number.POSITIVE_INFINITY;
                        if (sourceAspect > R37_MAX_SOURCE_ASPECT) {
                            r37SkippedNearBoundaryCrossings++;
                            continue;
                        }
                        crossingTs.push(tCross);
                    }
                }
            }

            if (crossingTs.length === 0) continue;

            // Dedup crossing T values
            crossingTs.sort((a, b) => a - b);
            const dedupedTs: number[] = [crossingTs[0]];
            for (let i = 1; i < crossingTs.length; i++) {
                if (crossingTs[i] - dedupedTs[dedupedTs.length - 1] > R37_DEGEN_GUARD_MIN) {
                    dedupedTs.push(crossingTs[i]);
                }
            }

            // Create phantom row vertices for each crossing T
            const phantomRows: PhantomRow[] = [];
            for (const tCross of dedupedTs) {
                const rowVerts: Array<{ u: number; idx: number }> = [];
                const crossings: PhantomCrossing[] = [];

                // Column boundary vertices
                for (let c = ownedSpan.colStart; c <= ownedSpan.colEnd + 1; c++) {
                    upsertPhantomRowVertex(rowVerts, tCross, unionU[c]);
                }

                // Add crossing-point vertices for each chain edge that crosses
                // this phantom row (handles same-column edges within super-cells)
                for (const [ev0, ev1] of scEdges) {
                    const t0 = vertices[ev0 * 3 + 1], t1 = vertices[ev1 * 3 + 1];
                    if ((t0 - tCross) * (t1 - tCross) >= 0) continue;
                    const u0 = vertices[ev0 * 3], u1 = vertices[ev1 * 3];
                    const crossAlpha = (tCross - t0) / (t1 - t0);
                    const uCross = u0 + crossAlpha * (u1 - u0);

                    let isBoundaryCrossing = false;
                    if (Math.abs(u1 - u0) >= 1e-12) {
                        for (let c = ownedSpan.colStart + 1; c <= ownedSpan.colEnd; c++) {
                            const uBound = unionU[c];
                            const d0 = u0 - uBound;
                            const d1 = u1 - uBound;
                            const crossesBoundary = (d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0);
                            const touchesBoundary = (!crossesBoundary) &&
                                ((Math.abs(d0) <= R37_U_MERGE && Math.abs(d1) > R37_U_MERGE) ||
                                    (Math.abs(d1) <= R37_U_MERGE && Math.abs(d0) > R37_U_MERGE));
                            if (crossesBoundary || touchesBoundary) {
                                isBoundaryCrossing = true;
                                break;
                            }
                        }
                    }

                    const anchorIdx = upsertPhantomRowVertex(rowVerts, tCross, uCross, true);
                    // Bug #1 fix: record anchor data for downstream GPU re-snap.
                    if (!phantomChainAnchorData.has(anchorIdx)) {
                        const chainId = resolveVertexChainId(ev0) ?? resolveVertexChainId(ev1);
                        if (chainId !== undefined) {
                            phantomChainAnchorData.set(anchorIdx, { chainId, tCross });
                        }
                    }
                    crossings.push({
                        anchorIdx,
                        sourceEdge: [ev0, ev1],
                        isBoundaryCrossing,
                    });
                }

                rowVerts.sort((a, b) => a.u - b.u);

                for (const crossing of crossings) {
                    if (!crossing.isBoundaryCrossing) continue;
                    const anchorPos = rowVerts.findIndex(v => v.idx === crossing.anchorIdx);
                    if (anchorPos <= 0 || anchorPos >= rowVerts.length - 1) continue;

                    const uPrev = rowVerts[anchorPos - 1].u;
                    const uAnchor = rowVerts[anchorPos].u;
                    const uNext = rowVerts[anchorPos + 1].u;
                    const localWidth = Math.max(uNext - uPrev, 1e-6);
                    const minSideSpan = Math.max(4 * R37_U_MERGE, R38_MIN_SIDE_SPAN_FACTOR * localWidth);

                    if (uAnchor - uPrev > minSideSpan) {
                        const uLeft = uAnchor - R38_COMPANION_FRACTION * (uAnchor - uPrev);
                        const leftIdx = upsertPhantomRowVertex(rowVerts, tCross, uLeft);
                        if (leftIdx !== crossing.anchorIdx) {
                            crossing.leftCompanionIdx = leftIdx;
                        }
                    }
                    if (uNext - uAnchor > minSideSpan) {
                        const uRight = uAnchor + R38_COMPANION_FRACTION * (uNext - uAnchor);
                        const rightIdx = upsertPhantomRowVertex(rowVerts, tCross, uRight);
                        if (rightIdx !== crossing.anchorIdx) {
                            crossing.rightCompanionIdx = rightIdx;
                        }
                    }

                    protectedStripVertices.add(crossing.anchorIdx);
                    if (crossing.leftCompanionIdx !== undefined) {
                        protectedStripVertices.add(crossing.leftCompanionIdx);
                    }
                    if (crossing.rightCompanionIdx !== undefined) {
                        protectedStripVertices.add(crossing.rightCompanionIdx);
                    }
                }

                // Sort phantom row vertices by U
                rowVerts.sort((a, b) => a.u - b.u);
                phantomRows.push({ tCross, vertexIndices: rowVerts.map(rv => rv.idx), crossings });
            }

            // Pre-split chain edges at phantom row crossings
            const allSubEdges: Array<[number, number]> = [];

            for (const [ev0, ev1] of scEdges) {
                const t0 = vertices[ev0 * 3 + 1];
                const t1 = vertices[ev1 * 3 + 1];
                const edgeChainId = resolveVertexChainId(ev0) ?? resolveVertexChainId(ev1);

                // Find phantom rows this edge crosses
                const edgeCrossings: PhantomRow[] = [];
                for (const pr of phantomRows) {
                    if ((t0 - pr.tCross) * (t1 - pr.tCross) < 0) {
                        edgeCrossings.push(pr);
                    }
                }

                if (edgeCrossings.length === 0) {
                    allSubEdges.push([ev0, ev1]);
                    continue;
                }

                // Sort crossings ascending from lower-T endpoint
                const lowV = t0 <= t1 ? ev0 : ev1;
                const highV = lowV === ev0 ? ev1 : ev0;
                const lowT = vertices[lowV * 3 + 1];
                const highT = vertices[highV * 3 + 1];
                const lowU = vertices[lowV * 3];
                const highU = vertices[highV * 3];
                edgeCrossings.sort((a, b) => a.tCross - b.tCross);

                // Build sub-edges through phantom vertices at crossing points
                let prevV = lowV;
                const subEdges: Array<[number, number]> = [];

                for (const pr of edgeCrossings) {
                    const crossAlpha = (pr.tCross - lowT) / (highT - lowT);
                    const uAtCross = lowU + crossAlpha * (highU - lowU);

                    // ── 🔒 R52 PRECISION LOCK — bestV chain-anchor-only lookup ──
                    // Search ONLY among phantomChainAnchorSet vertices.
                    // Column boundary vertices at grid U-positions must not be selected.
                    // Removing this filter re-introduces the grid-snap dip artifact.
                    // R52: Find nearest CHAIN ANCHOR phantom vertex in this row
                    // (never snap to a column boundary vertex)
                    let bestV = pr.vertexIndices[0];
                    let bestDist = Infinity;
                    for (const pv of pr.vertexIndices) {
                        if (!phantomChainAnchorSet.has(pv)) continue; // skip column boundary vertices
                        const d = Math.abs(vertices[pv * 3] - uAtCross);
                        if (d < bestDist) {
                            bestDist = d;
                            bestV = pv;
                        }
                    }
                    // Fallback: if no chain anchor found (shouldn't happen), use nearest any vertex
                    if (bestDist === Infinity) {
                        for (const pv of pr.vertexIndices) {
                            const d = Math.abs(vertices[pv * 3] - uAtCross);
                            if (d < bestDist) {
                                bestDist = d;
                                bestV = pv;
                            }
                        }
                    }

                    if (edgeChainId !== undefined && !phantomVertexChainIds.has(bestV)) {
                        phantomVertexChainIds.set(bestV, edgeChainId);
                    }

                    subEdges.push([prevV, bestV]);
                    prevV = bestV;
                }
                subEdges.push([prevV, highV]);

                // Record split for master chainEdges update (A4)
                const origKey = ev0 < ev1 ? `${ev0}-${ev1}` : `${ev1}-${ev0}`;
                edgeSplitMap.set(origKey, subEdges);
                pushAll(allSubEdges, subEdges);
            }

            ownedSpanR37.set(ownedSpan.ownerKey, {
                phantomRows,
                subEdges: allSubEdges,
            });
    }

    phantomVertexCount = nextPhantomIdx - phantomVertexStart;

    // A4: Apply chain edge pre-splits to master chainEdges array
    if (edgeSplitMap.size > 0) {
        const newEdges: Array<[number, number]> = [];
        for (const [v0, v1] of chainEdges) {
            const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
            const splits = edgeSplitMap.get(key);
            if (splits) {
                pushAll(newEdges, splits);
            } else {
                newEdges.push([v0, v1]);
            }
        }
        chainEdges.length = 0;
        pushAll(chainEdges, newEdges);
    }

    if (phantomVertexCount > 0) {
        console.log(`[CDT] R37: ${phantomVertexCount} phantom vertices, ${edgeSplitMap.size} edges split, ${ownedSpanR37.size} owned spans with band splitting, skippedNearBoundary=${r37SkippedNearBoundaryCrossings}, boundaryTouch=${r37BoundaryTouchCrossings}`);
    }

    // ── R53: Boundary Phantom Propagation (BPP) — T-junction elimination ──
    // Scan each owned span's phantom rows for boundary vertices at colStart
    // and colEnd+1. Register them keyed by the ADJACENT standard cell so
    // that cell can include them in its triangulation, eliminating T-junctions.
    interface PhantomBoundaryInfo {
        /** Phantom vertex indices on this cell's LEFT vertical edge, sorted by T ascending */
        leftPhantoms: number[];
        /** Phantom vertex indices on this cell's RIGHT vertical edge, sorted by T ascending */
        rightPhantoms: number[];
    }
    const phantomBoundaryMap = new Map<number, PhantomBoundaryInfo>();

    // ── Task #18: Owned-span boundary rail registry ──
    // The mirror-flood (Task #17) creates rail vertices on column lines but
    // refuses to register them to owned-span (super-cell) cells, and
    // emitOwnedSpan never consumed phantomBoundaryMap. Result: when a chain
    // neighbor splits the shared column line at a T the super-cell lacks, a thin
    // boundary sliver (chord vs. neighbor's bulged edge) is filled by neither →
    // genuine vertical void (measured: 100% of M/F14 residual). This registry
    // captures the rail verts destined for super-cell boundary lines so
    // emitOwnedSpan can patch the slivers with a local fan (no full-width row →
    // no cascading left-line obligation).
    const ownedSpanRail = new Map<number, { leftRail: number[]; rightRail: number[] }>();
    let ownedSpanRailRegistrationCount = 0;

    for (const ownedSpan of ownedSpanDescriptors) {
            const scBand = ownedSpan.band;
            const r37Data = ownedSpanR37.get(ownedSpan.ownerKey);
            if (!r37Data || r37Data.phantomRows.length === 0) continue;

            // Left boundary: phantoms at U ≈ unionU[colStart]
            // These sit on the RIGHT vertical edge of cell (band, colStart - 1)
            const leftAdjacentCol = ownedSpan.colStart - 1;
            if (leftAdjacentCol >= 0) {
                const adjUSpan = unionU[leftAdjacentCol + 1] - unionU[leftAdjacentCol];
                if (!(adjUSpan > SEAM_GUARD || adjUSpan < -SEAM_GUARD)) {
                    const adjKey = cellKey(scBand, leftAdjacentCol);
                    if (!ownedSpanCells.has(adjKey)) {
                        const boundaryU = unionU[ownedSpan.colStart];
                        const phantomIndices: number[] = [];
                        for (const pr of r37Data.phantomRows) {
                            for (const vIdx of pr.vertexIndices) {
                                if (Math.abs(vertices[vIdx * 3] - boundaryU) < R37_U_MERGE) {
                                    phantomIndices.push(vIdx);
                                }
                            }
                        }
                        if (phantomIndices.length > 0) {
                            phantomIndices.sort((a, b) => vertices[a * 3 + 1] - vertices[b * 3 + 1]);
                            let entry = phantomBoundaryMap.get(adjKey);
                            if (!entry) {
                                entry = { leftPhantoms: [], rightPhantoms: [] };
                                phantomBoundaryMap.set(adjKey, entry);
                            }
                            pushAll(entry.rightPhantoms, phantomIndices);
                        }
                    }
                }
            }

            // Right boundary: phantoms at U ≈ unionU[colEnd + 1]
            // These sit on the LEFT vertical edge of cell (band, colEnd + 1)
            const rightAdjacentCol = ownedSpan.colEnd + 1;
            if (rightAdjacentCol < cellsPerRow) {
                const adjUSpan = unionU[rightAdjacentCol + 1] - unionU[rightAdjacentCol];
                if (!(adjUSpan > SEAM_GUARD || adjUSpan < -SEAM_GUARD)) {
                    const adjKey = cellKey(scBand, rightAdjacentCol);
                    if (!ownedSpanCells.has(adjKey)) {
                        const boundaryU = unionU[ownedSpan.colEnd + 1];
                        const phantomIndices: number[] = [];
                        for (const pr of r37Data.phantomRows) {
                            for (const vIdx of pr.vertexIndices) {
                                if (Math.abs(vertices[vIdx * 3] - boundaryU) < R37_U_MERGE) {
                                    phantomIndices.push(vIdx);
                                }
                            }
                        }
                        if (phantomIndices.length > 0) {
                            phantomIndices.sort((a, b) => vertices[a * 3 + 1] - vertices[b * 3 + 1]);
                            let entry = phantomBoundaryMap.get(adjKey);
                            if (!entry) {
                                entry = { leftPhantoms: [], rightPhantoms: [] };
                                phantomBoundaryMap.set(adjKey, entry);
                            }
                            pushAll(entry.leftPhantoms, phantomIndices);
                        }
                    }
                }
            }
    }

    // ── WATERTIGHT-FIX (Task #17): Mirror-flood reconciliation ──
    // emitChainSplitCell (Step 2) mirrors each boundary phantom T from one
    // vertical edge to the OPPOSITE edge, creating a split vertex on the far
    // column line. That mirror is never shared with the neighbor across the far
    // line → vertical column-boundary crack (confirmed: standard cell emits the
    // edge unsplit while the chain-split cell splits it at the mirror vertex).
    //
    // Fix (pre-emission): pre-create each mirror vertex and register it to BOTH
    // cells adjacent to every crossed column line, flooding outward through
    // consecutive chain cells (which keep mirroring) until a non-mirroring cell
    // (standard → emitSplitCell, or owned/corridor/seam) absorbs the split. The
    // shared vertex index makes both sides reference the identical split point.
    if (typeof process === 'undefined' || !process.env?.T17_OFF) {
        const railVert = new Map<string, number>();
        const getRailVert = (bnd: number, line: number, t: number): number | undefined => {
            const tKey = Math.round(t * 1e8) / 1e8;
            const k = `${bnd}:${line}:${tKey}`;
            let v = railVert.get(k);
            if (v === undefined) {
                if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) return undefined;
                v = nextPhantomIdx++;
                vertices[v * 3] = unionU[line];
                vertices[v * 3 + 1] = t;
                vertices[v * 3 + 2] = surfaceId;
                // NOTE: rail verts sit on grid column lines → column-boundary
                // phantoms, NOT chain anchors (R52 precision lock preserved).
                railVert.set(k, v);
            }
            return v;
        };
        const railIsSeam = (line: number): boolean => {
            const s = unionU[line + 1] - unionU[line];
            const p = unionU[line] - unionU[line - 1];
            return (s > SEAM_GUARD || s < -SEAM_GUARD) || (p > SEAM_GUARD || p < -SEAM_GUARD);
        };
        const willMirror = (bnd: number, col: number): boolean => {
            if (col < 0 || col >= cellsPerRow) return false;
            const key = cellKey(bnd, col);
            return cellChainMap.has(key) && !ownedSpanCells.has(key) && !supportedCorridorCells.has(key);
        };
        const addRail = (bnd: number, col: number, side: 'L' | 'R', v: number): void => {
            if (col < 0 || col >= cellsPerRow) return;
            const key = cellKey(bnd, col);
            if (supportedCorridorCells.has(key)) return;
            // Task #18: owned-span cells were previously skipped, orphaning the
            // rail vert and leaving the super-cell's shared column-line edge
            // unsplit. Route it to the owned-span rail registry instead.
            if (ownedSpanCells.has(key)) {
                let oe = ownedSpanRail.get(key);
                if (!oe) { oe = { leftRail: [], rightRail: [] }; ownedSpanRail.set(key, oe); }
                const oarr = side === 'L' ? oe.leftRail : oe.rightRail;
                if (!oarr.includes(v)) {
                    oarr.push(v);
                    ownedSpanRailRegistrationCount++;
                }
                return;
            }
            let e = phantomBoundaryMap.get(key);
            if (!e) { e = { leftPhantoms: [], rightPhantoms: [] }; phantomBoundaryMap.set(key, e); }
            const arr = side === 'L' ? e.leftPhantoms : e.rightPhantoms;
            if (!arr.includes(v)) arr.push(v);
        };

        // Snapshot seeds from the BPP-created entries (only these exist yet).
        // A phantom on a cell's RIGHT edge mirrors LEFT (dir=-1); on its LEFT
        // edge mirrors RIGHT (dir=+1).
        interface RailSeed { bnd: number; col: number; dir: -1 | 1; t: number; }
        const seeds: RailSeed[] = [];
        for (const [key, entry] of phantomBoundaryMap) {
            const bnd = Math.floor(key / cellsPerRow);
            const col = key % cellsPerRow;
            for (const v of entry.rightPhantoms) seeds.push({ bnd, col, dir: -1, t: vertices[v * 3 + 1] });
            for (const v of entry.leftPhantoms) seeds.push({ bnd, col, dir: 1, t: vertices[v * 3 + 1] });
        }

        let railRegistrations = 0;
        for (const seed of seeds) {
            let col = seed.col;
            // Walk while the current cell is a chain cell (it will mirror).
            while (willMirror(seed.bnd, col)) {
                // Opposite (mirror-target) edge column line:
                //   dir=-1 → LEFT edge  = line `col`
                //   dir=+1 → RIGHT edge = line `col+1`
                const line = seed.dir === -1 ? col : col + 1;
                if (line <= 0 || line >= cellsPerRow || railIsSeam(line)) break;
                const v = getRailVert(seed.bnd, line, seed.t);
                if (v === undefined) break;
                if (seed.dir === -1) {
                    addRail(seed.bnd, col, 'L', v);
                    addRail(seed.bnd, col - 1, 'R', v);
                    col -= 1;
                } else {
                    addRail(seed.bnd, col, 'R', v);
                    addRail(seed.bnd, col + 1, 'L', v);
                    col += 1;
                }
                railRegistrations++;
            }
        }

        // Re-normalize every entry (dedupe + sort by T ascending) after flooding.
        for (const entry of phantomBoundaryMap.values()) {
            if (entry.leftPhantoms.length > 1)
                entry.leftPhantoms = [...new Set(entry.leftPhantoms)].sort((a, b) => vertices[a * 3 + 1] - vertices[b * 3 + 1]);
            if (entry.rightPhantoms.length > 1)
                entry.rightPhantoms = [...new Set(entry.rightPhantoms)].sort((a, b) => vertices[a * 3 + 1] - vertices[b * 3 + 1]);
        }
        if (railRegistrations > 0) {
            console.log(`[CDT] Task#17 mirror-flood: ${railRegistrations} rail registrations, ${railVert.size} rail verts`);
        }
    }

    let bppSplitCellCount = 0;
    let bppChainSplitCellCount = 0;
    let bppPropagatedCount = 0;
    let qualityCompanionCount = 0;
    let ownedSpanRailPatchCandidates = 0;
    let ownedSpanRailPatchReplaced = 0;
    let ownedSpanRailPatchDisabled = 0;
    let ownedSpanRailPatchRejected = 0;

    const QUALITY_COMPANION_U_TOL = 1e-7;

    const interpolateEdgeTAtU = (edge: number[], u: number): number => {
        if (edge.length === 0) return 0;
        const sorted = [...edge].sort((a, b) => vertices[a * 3] - vertices[b * 3]);
        if (u <= vertices[sorted[0] * 3]) return vertices[sorted[0] * 3 + 1];
        for (let i = 0; i < sorted.length - 1; i++) {
            const a = sorted[i];
            const b = sorted[i + 1];
            const au = vertices[a * 3];
            const bu = vertices[b * 3];
            if (u > bu + QUALITY_COMPANION_U_TOL) continue;
            const at = vertices[a * 3 + 1];
            const bt = vertices[b * 3 + 1];
            const span = bu - au;
            if (Math.abs(span) < QUALITY_COMPANION_U_TOL) return (at + bt) * 0.5;
            const alpha = Math.max(0, Math.min(1, (u - au) / span));
            return at + (bt - at) * alpha;
        }
        return vertices[sorted[sorted.length - 1] * 3 + 1];
    };

    const edgeHasU = (edge: number[], u: number): boolean =>
        edge.some(v => Math.abs(vertices[v * 3] - u) <= QUALITY_COMPANION_U_TOL);

    const createQualityCompanion = (edge: number[], u: number): number | undefined => {
        if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
            console.warn('[CDT] R56 quality companion slot overflow');
            return undefined;
        }
        const pIdx = nextPhantomIdx++;
        vertices[pIdx * 3] = u;
        vertices[pIdx * 3 + 1] = interpolateEdgeTAtU(edge, u);
        vertices[pIdx * 3 + 2] = surfaceId;
        qualityCompanionCount++;
        return pIdx;
    };

    const addRowEdgeQualityCompanions = (bottom: number[], top: number[]): { bottom: number[]; top: number[] } => {
        if (!enableRowEdgeQualityCompanions) return { bottom, top };
        if (bottom.length < 2 || top.length < 2) return { bottom, top };

        const uBreaks: number[] = [];
        for (const edge of [bottom, top]) {
            for (const v of edge) {
                const u = vertices[v * 3];
                if (!uBreaks.some(existing => Math.abs(existing - u) <= QUALITY_COMPANION_U_TOL)) {
                    uBreaks.push(u);
                }
            }
        }
        uBreaks.sort((a, b) => a - b);

        const nextBottom = [...bottom];
        const nextTop = [...top];
        for (const u of uBreaks) {
            if (!edgeHasU(nextBottom, u)) {
                const companion = createQualityCompanion(nextBottom, u);
                if (companion !== undefined) nextBottom.push(companion);
            }
            if (!edgeHasU(nextTop, u)) {
                const companion = createQualityCompanion(nextTop, u);
                if (companion !== undefined) nextTop.push(companion);
            }
        }

        return {
            bottom: dedupeSortedVertexEdge(nextBottom.sort((a, b) => vertices[a * 3] - vertices[b * 3])),
            top: dedupeSortedVertexEdge(nextTop.sort((a, b) => vertices[a * 3] - vertices[b * 3])),
        };
    };
    if (phantomBoundaryMap.size > 0) {
        for (const [, info] of phantomBoundaryMap) {
            bppPropagatedCount += info.leftPhantoms.length + info.rightPhantoms.length;
        }
        console.log(`[CDT] R53 BPP: ${phantomBoundaryMap.size} cells with propagated boundary phantoms, ${bppPropagatedCount} phantom vertices propagated`);
    }

    // ── 4. Cell-local triangulation (R34/R35) ──
    const totalBands = Math.max(1, numT - 1);
    const totalCells = cellsPerRow * totalBands;
    const indexBuf: number[] = [];
    const sourceDiagnosticsGlobal = globalThis as unknown as { __pfEnableSourceDiagnostics?: boolean };
    const triangleProvenance = sourceDiagnosticsGlobal.__pfEnableSourceDiagnostics === true ? [] as string[] : undefined;
    const markTriangleProvenance = (startIndex: number, label: string): void => {
        if (!triangleProvenance) return;
        for (let offset = startIndex; offset < indexBuf.length; offset += 3) {
            triangleProvenance[offset / 3] = label;
        }
    };

    const quadMap = new Int32Array(totalCells);
    quadMap.fill(-1);
    let seamSkipCount = 0;
    let chainCellCount = 0;
    let windingFixCount = 0;
    let superCellCount = 0;
    let superCellColumnsConsumed = 0;

    // R46: Collector for chainFanQuad fan diagonal edges (chain↔grid)
    const fanDiagEdges: Array<[number, number]> = [];

    // R55: Track grid→chain vertex coalescing for post-processing T-junction fix
    const coalesceMap = new Map<number, number>();
    const recordGridToChainPruneRemap = {
        remapDroppedToSurvivor: coalesceMap,
        shouldRemapDroppedVertex: (dropped: number, survivor: number): boolean =>
            isGridLike(dropped) && isChainLike(survivor),
    };

    // R36: Track grid vertices adjacent to chain/super-cells for optimizer visibility
    const chainAdjacentGridVerts = new Set<number>();

    // R55-S: Build safe-to-coalesce set — grid vertices where ALL adjacent cells
    // are chain/super cells. Coalescing at chain-to-standard boundaries creates
    // T-junctions because standard cells don't have chain vertices on shared edges.
    const safeToCoalesce = new Set<number>();
    {
        const isChainOrSuper = (band: number, col: number): boolean => {
            const key = cellKey(band, col);
            return cellChainMap.has(key) || ownedSpanCells.has(key);
        };
        const isSeamCell = (col: number): boolean => {
            const uSpan = unionU[col + 1] - unionU[col];
            return uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD;
        };
        for (let row = 0; row < numT; row++) {
            for (let col = 0; col < numU; col++) {
                let safe = true;
                // Check all 4 cells sharing this vertex as a corner.
                // Out-of-bounds and seam cells are treated as safe (skip).
                if (row < totalBands && col < cellsPerRow) {
                    if (!isSeamCell(col) && !isChainOrSuper(row, col)) { safe = false; }
                }
                if (row < totalBands && col > 0) {
                    if (!isSeamCell(col - 1) && !isChainOrSuper(row, col - 1)) { safe = false; }
                }
                if (row > 0 && col < cellsPerRow) {
                    if (!isSeamCell(col) && !isChainOrSuper(row - 1, col)) { safe = false; }
                }
                if (row > 0 && col > 0) {
                    if (!isSeamCell(col - 1) && !isChainOrSuper(row - 1, col - 1)) { safe = false; }
                }
                if (safe) {
                    safeToCoalesce.add(row * numU + col);
                }
            }
        }
        console.log(`[CDT] R55-S: ${safeToCoalesce.size} safe grid vertices out of ${gridVertexCount} total`);
    }

    /** Emit a standard 2-triangle quad cell (no chain activity). */
    const emitStandardCell = (b: number, c: number): void => {
        const quadIdx = b * cellsPerRow + c;
        const provenanceStart = indexBuf.length;
        const bl = b * numU + c;
        const br = b * numU + (c + 1);
        const tl = (b + 1) * numU + c;
        const tr = (b + 1) * numU + (c + 1);

        const blU = vertices[bl * 3], blT = vertices[bl * 3 + 1];
        const brU = vertices[br * 3], brT = vertices[br * 3 + 1];
        const tlU = vertices[tl * 3], tlT = vertices[tl * 3 + 1];
        const trU = vertices[tr * 3], trT = vertices[tr * 3 + 1];

        const triBase = indexBuf.length;

        const cross1 = (brU - blU) * (trT - blT) - (trU - blU) * (brT - blT);
        if (Math.abs(cross1) < 1e-12) {
            indexBuf.push(0, 0, 0);
        } else if (cross1 >= 0) {
            indexBuf.push(bl, br, tr);
        } else {
            indexBuf.push(bl, tr, br);
            windingFixCount++;
        }

        const cross2 = (trU - blU) * (tlT - blT) - (tlU - blU) * (trT - blT);
        if (Math.abs(cross2) < 1e-12) {
            indexBuf.push(0, 0, 0);
        } else if (cross2 >= 0) {
            indexBuf.push(bl, tr, tl);
        } else {
            indexBuf.push(bl, tl, tr);
            windingFixCount++;
        }

        quadMap[quadIdx] = triBase;
        markTriangleProvenance(provenanceStart, `standard:b${b}:c${c}`);
    };

    /**
     * R53 BPP: Emit a standard cell with phantom boundary vertices on its
     * vertical edges, using a vertical-edge sweep. This eliminates T-junctions
     * between super-cells and their adjacent standard cells.
     */
    const emitSplitCell = (b: number, c: number, bppInfo: PhantomBoundaryInfo): void => {
        quadMap[b * cellsPerRow + c] = -1; // Not a standard 2-tri quad; skip edge flip
        bppSplitCellCount++;
        const provenanceStart = indexBuf.length;

        const BL = b * numU + c;
        const BR = b * numU + (c + 1);
        const TL = (b + 1) * numU + c;
        const TR = (b + 1) * numU + (c + 1);

        // Build vertical edges sorted by T ascending.
        // sweepQuad advances the left (lower-U) pointer first, producing a
        // fan from the right edge — geometrically valid and T-junction-free.
        const leftEdge: number[] = [BL, ...bppInfo.leftPhantoms, TL];
        const rightEdge: number[] = [BR, ...bppInfo.rightPhantoms, TR];
        sweepQuad(indexBuf, leftEdge, rightEdge, vertices, metricAspect);
        markTriangleProvenance(provenanceStart, `split:b${b}:c${c}`);
    };

    /** Emit a chain-involved cell using cell-local quad splitting (R34). */
    const emitChainCell = (band: number, col: number, info: CellChainInfo): void => {
        quadMap[band * cellsPerRow + col] = -1; // (Amendment A3: match current CDT behavior)
        chainCellCount++;
        const provenanceStart = indexBuf.length;

        // Grid corner vertex indices
        const BL = band * numU + col;
        const BR = band * numU + (col + 1);
        const TL = (band + 1) * numU + col;
        const TR = (band + 1) * numU + (col + 1);

        // Build full bottom edge: [BL, ...sorted chain verts..., BR]
        const botEdge: number[] = [BL];
        for (const cvIdx of info.botChainVerts) {
            botEdge.push(cvIdx);
        }
        botEdge.push(BR);

        // Build full top edge: [TL, ...sorted chain verts..., TR]
        const topEdge: number[] = [TL];
        for (const cvIdx of info.topChainVerts) {
            topEdge.push(cvIdx);
        }
        topEdge.push(TR);

        // R55: Coalesce near-coincident grid vertices with chain vertices
        const coalBot = coalesceNearGridChain(botEdge, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce);
        const coalTop = coalesceNearGridChain(topEdge, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce);

        const qualityEdges = addRowEdgeQualityCompanions(coalBot, coalTop);

        // TEMP-T18TRACE: dump the target crack cell's edge/constraint state.
        if (cellsPerRow < 30 && (typeof process !== 'undefined' && process.env?.T18TRACE) && band === 9 && col === 7) {
            const fmt = (v: number): string => `${v}@(${vertices[v * 3].toFixed(4)},${vertices[v * 3 + 1].toFixed(4)})`;
            // eslint-disable-next-line no-console
            console.log(`[T18TRACE emitChainCell b9c7] bot=[${coalBot.map(fmt).join(' ')}] top=[${coalTop.map(fmt).join(' ')}] chainEdges=${info.chainEdges.map(([a, b]) => `${fmt(a)}-${fmt(b)}`).join(',')} qbot=[${qualityEdges.bottom.map(fmt).join(' ')}] qtop=[${qualityEdges.top.map(fmt).join(' ')}]`);
        }

        if (info.chainEdges.length === 0) {
            // Chain vertices on edges but no chain edge through this cell.
            // Use monotone sweep between bottom and top edge arrays.
            sweepQuad(indexBuf, qualityEdges.bottom, qualityEdges.top, vertices, metricAspect);
        } else {
            // Chain edges partition the cell into sub-quads.
            constrainedSweepCell(indexBuf, qualityEdges.bottom, qualityEdges.top, info.chainEdges, vertices, fanDiagEdges, metricAspect, crossingConstraintFallbackMaxEdge);
        }
        markTriangleProvenance(provenanceStart, `chain:b${band}:c${col}:edges${info.chainEdges.length}`);
    };

    /** Emit a chain cell with phantom boundary vertices using sub-band decomposition (R53 Phase 2). */
    const emitChainSplitCell = (
        band: number, col: number,
        info: CellChainInfo, bppInfo: PhantomBoundaryInfo
    ): void => {
        quadMap[band * cellsPerRow + col] = -1;
        chainCellCount++;
        bppSplitCellCount++;
        bppChainSplitCellCount++;

        const BL = band * numU + col;
        const BR = band * numU + (col + 1);
        const TL = (band + 1) * numU + col;
        const TR = (band + 1) * numU + (col + 1);
        const uLeft = vertices[BL * 3];
        const uRight = vertices[BR * 3];

        // Step 1: Collect unique phantom T-values
        const phantomTSet = new Set<number>();
        const leftByT = new Map<number, number>();
        const rightByT = new Map<number, number>();

        for (const pIdx of bppInfo.leftPhantoms) {
            const t = vertices[pIdx * 3 + 1];
            const tKey = Math.round(t * 1e8) / 1e8;
            phantomTSet.add(tKey);
            leftByT.set(tKey, pIdx);
        }
        for (const pIdx of bppInfo.rightPhantoms) {
            const t = vertices[pIdx * 3 + 1];
            const tKey = Math.round(t * 1e8) / 1e8;
            phantomTSet.add(tKey);
            rightByT.set(tKey, pIdx);
        }

        const phantomTs = [...phantomTSet].sort((a, b) => a - b);
        if (phantomTs.length === 0) {
            emitChainCell(band, col, info);
            return;
        }

        // Step 2: Ensure both edges have vertices at each phantom T
        for (const tKey of phantomTs) {
            if (!leftByT.has(tKey)) {
                if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
                    console.warn('[CDT] R53 Phase 2: phantom slot overflow');
                    emitChainCell(band, col, info);
                    return;
                }
                const pIdx = nextPhantomIdx++;
                vertices[pIdx * 3] = uLeft;
                vertices[pIdx * 3 + 1] = tKey;
                vertices[pIdx * 3 + 2] = surfaceId;
                leftByT.set(tKey, pIdx);
            }
            if (!rightByT.has(tKey)) {
                if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
                    console.warn('[CDT] R53 Phase 2: phantom slot overflow');
                    emitChainCell(band, col, info);
                    return;
                }
                const pIdx = nextPhantomIdx++;
                vertices[pIdx * 3] = uRight;
                vertices[pIdx * 3 + 1] = tKey;
                vertices[pIdx * 3 + 2] = surfaceId;
                rightByT.set(tKey, pIdx);
            }
        }

        // Step 3: Build sub-band boundaries
        const botEdge: number[] = [BL];
        for (const cv of info.botChainVerts) botEdge.push(cv);
        botEdge.push(BR);

        const topEdge: number[] = [TL];
        for (const cv of info.topChainVerts) topEdge.push(cv);
        topEdge.push(TR);

        const boundaries: number[][] = [botEdge];
        for (const tKey of phantomTs) {
            boundaries.push([leftByT.get(tKey)!, rightByT.get(tKey)!]);
        }
        boundaries.push(topEdge);

        // Step 4: Split chain edges at phantom T-values
        const allSubEdges: Array<[number, number]> = [];

        if (info.chainEdges.length > 0) {
            for (const [ev0, ev1] of info.chainEdges) {
                const t0 = vertices[ev0 * 3 + 1];
                const t1 = vertices[ev1 * 3 + 1];

                // Find phantom Ts this edge crosses
                const crossedTs: number[] = [];
                for (const tKey of phantomTs) {
                    if ((t0 - tKey) * (t1 - tKey) < 0) {
                        crossedTs.push(tKey);
                    }
                }

                if (crossedTs.length === 0) {
                    allSubEdges.push([ev0, ev1]);
                    continue;
                }

                // Sort from lower-T to higher-T
                const lowV = t0 <= t1 ? ev0 : ev1;
                const highV = lowV === ev0 ? ev1 : ev0;
                const lowT = vertices[lowV * 3 + 1];
                const highT = vertices[highV * 3 + 1];
                const lowU = vertices[lowV * 3];
                const highU = vertices[highV * 3];
                crossedTs.sort((a, b) => a - b);

                let prevV = lowV;
                for (const tCross of crossedTs) {
                    if (nextPhantomIdx >= totalVertexCount + maxPhantomSlots) {
                        console.warn('[CDT] R53 Phase 2: phantom slot overflow');
                        emitChainCell(band, col, info);
                        return;
                    }
                    const alpha = (tCross - lowT) / (highT - lowT);
                    const uCross = lowU + alpha * (highU - lowU);

                    const pIdx = nextPhantomIdx++;
                    vertices[pIdx * 3] = uCross;
                    vertices[pIdx * 3 + 1] = tCross;
                    vertices[pIdx * 3 + 2] = surfaceId;
                    phantomChainAnchorSet.add(pIdx);

                    // Amendment C: epsilon-based boundary lookup
                    const bndIdx = phantomTs.findIndex(t => Math.abs(t - tCross) < 1e-10) + 1;
                    boundaries[bndIdx].push(pIdx);

                    allSubEdges.push([prevV, pIdx]);
                    prevV = pIdx;
                }
                allSubEdges.push([prevV, highV]);
            }
        }

        // Steps 5-6: Emit each sub-band
        for (let sb = 0; sb < boundaries.length - 1; sb++) {
            const provenanceStart = indexBuf.length;
            const subBotRaw = [...boundaries[sb]].sort(
                (a, b) => vertices[a * 3] - vertices[b * 3]
            );
            const subTopRaw = [...boundaries[sb + 1]].sort(
                (a, b) => vertices[a * 3] - vertices[b * 3]
            );

            // R55: Coalesce near-coincident grid vertices with chain vertices
            const subBot = coalesceNearGridChain(subBotRaw, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce);
            const subTop = coalesceNearGridChain(subTopRaw, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce);

            // Find chain sub-edges for this sub-band
            const subBotSet = new Set(subBot);
            const subTopSet = new Set(subTop);
            const subEdges: Array<[number, number]> = [];
            for (const [sv0, sv1] of allSubEdges) {
                if ((subBotSet.has(sv0) && subTopSet.has(sv1)) ||
                    (subBotSet.has(sv1) && subTopSet.has(sv0))) {
                    subEdges.push([sv0, sv1]);
                }
            }

            const qualityEdges = addRowEdgeQualityCompanions(subBot, subTop);

            if (subEdges.length === 0) {
                sweepQuad(indexBuf, qualityEdges.bottom, qualityEdges.top, vertices, metricAspect);
            } else {
                constrainedSweepCell(indexBuf, qualityEdges.bottom, qualityEdges.top, subEdges, vertices, fanDiagEdges, metricAspect, crossingConstraintFallbackMaxEdge);
            }
            markTriangleProvenance(provenanceStart, `chain-split:b${band}:c${col}:sb${sb}:edges${subEdges.length}`);
        }
    };

    /** Emit a shared owned span spanning multiple columns with R35/R37 support. */
    const emitOwnedSpan = (span: OwnedSpanDescriptor): void => {
        const { band, colStart, colEnd } = span;
        if (span.kind === 'supercell') {
            superCellCount++;
            superCellColumnsConsumed += (colEnd - colStart + 1);
        }

        // Mark all constituent cells in quadMap
        for (let c = colStart; c <= colEnd; c++) {
            quadMap[band * cellsPerRow + c] = -1;
        }
        chainCellCount += (colEnd - colStart + 1);
        const geometry = buildOwnedSpanGeometry(span);
        const geometryProtectedVertices = new Set<number>();
        for (const [v0, v1] of geometry.uniqueEdges) {
            geometryProtectedVertices.add(v0);
            geometryProtectedVertices.add(v1);
        }

        // R55: Coalesce near-coincident grid vertices with chain vertices
        const coalBot = pruneNearDuplicateRowEdgePins(
            dedupeSortedVertexEdge(
                coalesceNearGridChain(geometry.bottomEdge, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce),
            ),
            vertices,
            geometryProtectedVertices,
            GRID_CHAIN_COALESCE_RADIUS,
            recordGridToChainPruneRemap,
        );
        const coalTop = pruneNearDuplicateRowEdgePins(
            dedupeSortedVertexEdge(
                coalesceNearGridChain(geometry.topEdge, vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce),
            ),
            vertices,
            geometryProtectedVertices,
            GRID_CHAIN_COALESCE_RADIUS,
            recordGridToChainPruneRemap,
        );

        // R36.1: Mark only INTERMEDIATE column grid vertices as chain-adjacent.
        // Corner vertices (BL/BR/TL/TR at colStart and colEnd+1) are shared with
        // adjacent standard cells — marking them would pull those standard-cell
        // triangles into chainStripTriSet, causing cross-row and non-manifold regressions.
        for (let c = colStart + 1; c <= colEnd; c++) {
            chainAdjacentGridVerts.add(band * numU + c);       // intermediate bot
            chainAdjacentGridVerts.add((band + 1) * numU + c); // intermediate top
        }

        // A2 guard: degenerate owned span → fall back to standard cells
        if (coalBot.length < 2 || coalTop.length < 2) {
            for (let c = colStart; c <= colEnd; c++) {
                emitStandardCell(band, c);
            }
            return;
        }

        const spanIndexStart = indexBuf.length;

        // ── Task #18: patch shared column-line boundary slivers ──
        // For each boundary line (colStart / colEnd+1), the chain neighbor may
        // have split the line at a rail T the super-cell lacks (the mirror-flood
        // registered that rail vert into ownedSpanRail). Replace the owned-span
        // triangle that owns the unsplit edge P0→P1 with a fan from that triangle's
        // interior vertex through the shared rail verts. Appending a collinear
        // boundary-only triangle cannot split P0→P1 topologically; replacing the
        // original triangle removes that exposed edge and makes both sides use the
        // same P0→rail→P1 segments.
        const patchBoundarySlivers = (rows: number[][]): void => {
            const spanIndexEnd = indexBuf.length;
            const replacedTriangles = new Set<number>();
            let localEdgeOwners: Map<string, number[]> | undefined;

            const edgeKey = (a: number, b: number): string => a < b ? `${a}-${b}` : `${b}-${a}`;

            const getLocalEdgeOwners = (): Map<string, number[]> => {
                if (localEdgeOwners) return localEdgeOwners;
                localEdgeOwners = new Map<string, number[]>();
                const addOwner = (a: number, b: number, tri: number): void => {
                    const key = edgeKey(a, b);
                    const owners = localEdgeOwners!.get(key) ?? [];
                    owners.push(tri);
                    localEdgeOwners!.set(key, owners);
                };
                for (let tri = spanIndexStart; tri < spanIndexEnd; tri += 3) {
                    const ia = indexBuf[tri], ib = indexBuf[tri + 1], ic = indexBuf[tri + 2];
                    if (ia === 0 && ib === 0 && ic === 0) continue;
                    addOwner(ia, ib, tri);
                    addOwner(ib, ic, tri);
                    addOwner(ia, ic, tri);
                }
                return localEdgeOwners;
            };

            const orientedTriangles = (apex: number, polyline: number[]): number[] => {
                const out: number[] = [];
                for (let i = 0; i < polyline.length - 1; i++) {
                    emitTriCCW(out, apex, polyline[i], polyline[i + 1], vertices);
                }
                return out;
            };

            const edgeLength = (a: number, b: number): number => Math.hypot(
                vertices[a * 3] - vertices[b * 3],
                vertices[a * 3 + 1] - vertices[b * 3 + 1],
            );

            const maxTriangleEdge = (a: number, b: number, c: number): number => Math.max(
                edgeLength(a, b),
                edgeLength(b, c),
                edgeLength(a, c),
            );

            const maxTriangleListEdge = (triangles: number[]): number => {
                let maxEdge = 0;
                for (let i = 0; i < triangles.length; i += 3) {
                    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
                    if (a === 0 && b === 0 && c === 0) continue;
                    maxEdge = Math.max(maxEdge, maxTriangleEdge(a, b, c));
                }
                return maxEdge;
            };

            const maxReplacementEdge = OWNED_SPAN_RAIL_PATCH_MAX_EDGE_SCALE * Math.hypot(
                1 / Math.max(1, numU - 1),
                1 / Math.max(1, numT - 1),
            );

            const replaceBoundaryTriangle = (p0: number, p1: number, orderedRails: number[]): boolean => {
                const matches = getLocalEdgeOwners().get(edgeKey(p0, p1)) ?? [];
                if (matches.length !== 1) return false;

                const tri = matches[0];
                if (replacedTriangles.has(tri)) return false;
                const ia = indexBuf[tri], ib = indexBuf[tri + 1], ic = indexBuf[tri + 2];
                const apex = ia !== p0 && ia !== p1 ? ia : (ib !== p0 && ib !== p1 ? ib : ic);
                if (apex === p0 || apex === p1) return false;

                const split = orientedTriangles(apex, [p0, ...orderedRails, p1]);
                if (split.length < 3) return false;
                const originalMaxEdge = maxTriangleEdge(ia, ib, ic);
                const splitMaxEdge = maxTriangleListEdge(split);
                if (splitMaxEdge > originalMaxEdge + 1e-12 || splitMaxEdge > maxReplacementEdge) return false;

                indexBuf[tri] = split[0];
                indexBuf[tri + 1] = split[1];
                indexBuf[tri + 2] = split[2];
                for (let i = 3; i < split.length; i++) {
                    indexBuf.push(split[i]);
                }
                replacedTriangles.add(tri);
                return true;
            };

            const doSide = (side: 'L' | 'R'): void => {
                const edgeCol = side === 'L' ? colStart : colEnd;
                const lineU = side === 'L' ? unionU[colStart] : unionU[colEnd + 1];
                const reg = ownedSpanRail.get(cellKey(band, edgeCol));
                if (!reg) return;
                const rail = (side === 'L' ? reg.leftRail : reg.rightRail)
                    .filter(v => Math.abs(vertices[v * 3] - lineU) < R37_U_MERGE);
                if (rail.length === 0) return;
                rail.sort((a, b) => vertices[a * 3 + 1] - vertices[b * 3 + 1]);
                for (let k = 0; k < rows.length - 1; k++) {
                    const row0 = rows[k], row1 = rows[k + 1];
                    if (row0.length === 0 || row1.length === 0) continue;
                    const P0 = side === 'R' ? row0[row0.length - 1] : row0[0];
                    const P1 = side === 'R' ? row1[row1.length - 1] : row1[0];
                    const t0 = vertices[P0 * 3 + 1], t1 = vertices[P1 * 3 + 1];
                    const lo = Math.min(t0, t1), hi = Math.max(t0, t1);
                    const between = rail.filter(v => {
                        const tv = vertices[v * 3 + 1];
                        return tv > lo + 1e-9 && tv < hi - 1e-9 && v !== P0 && v !== P1;
                    });
                    if (between.length === 0) continue;
                    const ordered = t0 <= t1 ? between : [...between].reverse();
                    ownedSpanRailPatchCandidates++;
                    const replaced = replaceBoundaryTriangle(P0, P1, ordered);
                    if (replaced) {
                        ownedSpanRailPatchReplaced++;
                    } else {
                        ownedSpanRailPatchRejected++;
                        const poly = [P0, ...ordered, P1];
                        for (let i = 1; i < poly.length - 1; i++) {
                            emitTriCCW(indexBuf, poly[0], poly[i], poly[i + 1], vertices);
                        }
                    }
                }
            };
            doSide('L');
            doSide('R');
        };

        // ── R37: Band splitting for column-crossing dip elimination ──
        const r37 = ownedSpanR37.get(span.ownerKey);

        if (r37 && r37.phantomRows.length > 0) {
            const sortedRows = [...r37.phantomRows].sort((a, b) => a.tCross - b.tCross);
            const r37ProtectedVertices = new Set<number>();
            for (const [v0, v1] of r37.subEdges) {
                r37ProtectedVertices.add(v0);
                r37ProtectedVertices.add(v1);
            }

            // Build sub-band boundary edge arrays: [coalBot, phantomRow1, ..., coalTop]
            const boundaries: number[][] = [
                pruneNearDuplicateRowEdgePins(
                    coalBot,
                    vertices,
                    r37ProtectedVertices,
                    GRID_CHAIN_COALESCE_RADIUS,
                    recordGridToChainPruneRemap,
                ),
            ];
            for (const pr of sortedRows) {
                boundaries.push(pruneNearDuplicateRowEdgePins(
                    [...pr.vertexIndices],
                    vertices,
                    r37ProtectedVertices,
                    GRID_CHAIN_COALESCE_RADIUS,
                    recordGridToChainPruneRemap,
                ));
            }
            boundaries.push(pruneNearDuplicateRowEdgePins(
                coalTop,
                vertices,
                r37ProtectedVertices,
                GRID_CHAIN_COALESCE_RADIUS,
                recordGridToChainPruneRemap,
            ));

            // R55: Coalesce intermediate phantom row boundaries
            for (let i = 1; i < boundaries.length - 1; i++) {
                boundaries[i] = pruneNearDuplicateRowEdgePins(
                    dedupeSortedVertexEdge(
                        coalesceNearGridChain(boundaries[i], vertices, isGridLike, isChainLike, GRID_CHAIN_COALESCE_RADIUS, coalesceMap, safeToCoalesce),
                    ),
                    vertices,
                    r37ProtectedVertices,
                    GRID_CHAIN_COALESCE_RADIUS,
                    recordGridToChainPruneRemap,
                );
            }

            for (let sb = 0; sb < boundaries.length - 1; sb++) {
                const provenanceStart = indexBuf.length;
                const subBot = boundaries[sb];
                const subTop = boundaries[sb + 1];

                // Assign pre-split chain sub-edges to this sub-band (A5)
                const subBotSet = new Set(subBot);
                const subTopSet = new Set(subTop);
                const subEdges: Array<[number, number]> = [];
                for (const [ev0, ev1] of r37.subEdges) {
                    if ((subBotSet.has(ev0) && subTopSet.has(ev1)) ||
                        (subBotSet.has(ev1) && subTopSet.has(ev0))) {
                        subEdges.push([ev0, ev1]);
                    }
                }

                if (subEdges.length === 0) {
                    sweepQuad(indexBuf, subBot, subTop, vertices, metricAspect);
                } else {
                    constrainedSweepCell(indexBuf, subBot, subTop, subEdges, vertices, fanDiagEdges, metricAspect, crossingConstraintFallbackMaxEdge);
                }
                markTriangleProvenance(provenanceStart, `owned-${span.kind}:b${band}:c${colStart}-${colEnd}:sb${sb}:edges${subEdges.length}`);
            }
            patchBoundarySlivers(boundaries);
            return;
        }

        const provenanceStart = indexBuf.length;
        if (geometry.uniqueEdges.length === 0) {
            sweepQuad(indexBuf, coalBot, coalTop, vertices, metricAspect);
        } else {
            constrainedSweepCell(indexBuf, coalBot, coalTop, geometry.uniqueEdges, vertices, fanDiagEdges, metricAspect, crossingConstraintFallbackMaxEdge);
        }
        markTriangleProvenance(provenanceStart, `owned-${span.kind}:b${band}:c${colStart}-${colEnd}:single:edges${geometry.uniqueEdges.length}`);
        patchBoundarySlivers([coalBot, coalTop]);
    };

    const emitSupportedCorridorSpan = (segment: OuterWallCorridorOwnershipSegment): void => {
        const { band, colStart, colEnd } = segment;
        const spanLength = colEnd - colStart + 1;
        chainCellCount += spanLength;

        for (let col = colStart; col <= colEnd; col++) {
            quadMap[band * cellsPerRow + col] = -1;
        }
        for (let col = colStart + 1; col <= colEnd; col++) {
            chainAdjacentGridVerts.add(band * numU + col);
            chainAdjacentGridVerts.add((band + 1) * numU + col);
        }

        const geometry = buildCorridorSpanGeometry(segment);
        const coalescedBottom = dedupeSortedVertexEdge(coalesceNearGridChain(
            geometry.bottomEdge,
            vertices,
            isGridLike,
            isChainLike,
            GRID_CHAIN_COALESCE_RADIUS,
            coalesceMap,
            safeToCoalesce,
        ));
        const coalescedTop = dedupeSortedVertexEdge(coalesceNearGridChain(
            geometry.topEdge,
            vertices,
            isGridLike,
            isChainLike,
            GRID_CHAIN_COALESCE_RADIUS,
            coalesceMap,
            safeToCoalesce,
        ));

        const provenanceStart = indexBuf.length;
        if (geometry.uniqueEdges.length === 0) {
            sweepQuad(indexBuf, coalescedBottom, coalescedTop, vertices, metricAspect);
            markTriangleProvenance(provenanceStart, `corridor:b${band}:c${colStart}-${colEnd}:sweep`);
            return;
        }
        constrainedSweepCell(indexBuf, coalescedBottom, coalescedTop, geometry.uniqueEdges, vertices, fanDiagEdges, metricAspect, crossingConstraintFallbackMaxEdge);
        markTriangleProvenance(provenanceStart, `corridor:b${band}:c${colStart}-${colEnd}:edges${geometry.uniqueEdges.length}`);
    };

    // Main cell emission loop (R34/R35): super-cells first, then standard/chain cells
    console.log(`[CDT] R35 cell-local: ${totalBands} bands × ${cellsPerRow} cells, cellChainMap size=${cellChainMap.size}, batch2Remap=${batch2Remap.size}, fusionRequests=${fusionRequests.length}`);

    for (let band = 0; band < totalBands; band++) {
        for (let c = 0; c < cellsPerRow; c++) {
            const key = cellKey(band, c);

            if (ownedSpanCells.has(key)) {
                const ownedSpan = ownedSpanStarts.get(key);
                if (ownedSpan) {
                    emitOwnedSpan(ownedSpan);
                    c = ownedSpan.colEnd;
                }
                continue;
            }

            if (supportedCorridorCells.has(key)) {
                const corridor = supportedCorridorStarts.get(key);
                if (corridor) {
                    emitSupportedCorridorSpan(corridor);
                    c = corridor.colEnd;
                }
                continue;
            }

            const uSpan = unionU[c + 1] - unionU[c];

            if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
                indexBuf.push(0, 0, 0, 0, 0, 0);
                quadMap[band * cellsPerRow + c] = -1;
                seamSkipCount++;
                continue;
            }

            const info = cellChainMap.get(key);

            if (!info) {
                // R53 BPP: Check if this standard cell has phantom boundary vertices
                const bppInfo = phantomBoundaryMap.get(key);
                if (bppInfo) {
                    emitSplitCell(band, c, bppInfo);
                } else {
                    emitStandardCell(band, c);
                }
            } else {
                const bppInfo = phantomBoundaryMap.get(key);
                if (bppInfo) {
                    emitChainSplitCell(band, c, info, bppInfo);
                } else {
                    emitChainCell(band, c, info);
                }
            }
        }
    }
    if (
        sourceDiagnosticsGlobal.__pfEnableSourceDiagnostics === true ||
        ownedSpanRailRegistrationCount > 0 ||
        ownedSpanRailPatchCandidates > 0
    ) {
        const message =
            `[CDT] Task#18 owned-span rail patches: regs=${ownedSpanRailRegistrationCount} ` +
            `candidates=${ownedSpanRailPatchCandidates} replaced=${ownedSpanRailPatchReplaced} ` +
            `disabled=${ownedSpanRailPatchDisabled} rejected=${ownedSpanRailPatchRejected}`;
        if (sourceDiagnosticsGlobal.__pfEnableSourceDiagnostics === true) {
            console.warn(message);
        } else {
            console.log(message);
        }
    }

    // R53 Phase 2: Update phantom count to include vertices created by emitChainSplitCell
    phantomVertexCount = nextPhantomIdx - phantomVertexStart;

    const globalRowRemapCount = recordNearRowGridChainRemaps(
        vertices,
        totalVertexCount + phantomVertexCount,
        isGridLike,
        isChainLike,
        GRID_CHAIN_ROW_REMAP_RADIUS,
        coalesceMap,
    );
    if (globalRowRemapCount > 0) {
        console.log(`[CDT] R58 row grid-chain remaps: ${globalRowRemapCount}`);
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║ R55 GRID/CHAIN VERTEX COALESCING — Post-processing T-junction fix   ║
    // ║ Grid vertices dropped from chain/super-cell edges may still be      ║
    // ║ referenced by adjacent standard cells. Replace all references with  ║
    // ║ the surviving chain vertex to maintain watertight mesh topology.     ║
    // ║ COALESCE_RADIUS = 0.0006 = mathematical 4:1 aspect violation bound. ║
    // ║ R52 safe: chain vertices never move; grid vertices dropped, not     ║
    // ║ merged. Post-processing replaces grid vertex REFERENCES only.       ║
    // ║ NOTE: Same-cell coalescing can produce degenerate triangles [C,C,X] ║
    // ║ when G and its target C are both on the same cell's edge. These are ║
    // ║ geometrically harmless (zero area) and tolerated by the pipeline.   ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    if (coalesceMap.size > 0) {
        let coalesceRemapCount = 0;
        for (let i = 0; i < indexBuf.length; i++) {
            const mapped = coalesceMap.get(indexBuf[i]);
            if (mapped !== undefined) { indexBuf[i] = mapped; coalesceRemapCount++; }
        }
        for (let i = 0; i < fanDiagEdges.length; i++) {
            const [v0, v1] = fanDiagEdges[i];
            fanDiagEdges[i] = [coalesceMap.get(v0) ?? v0, coalesceMap.get(v1) ?? v1];
        }
        console.log(`[CDT] R55 coalescing: ${coalesceMap.size} grid vertices coalesced, ${coalesceRemapCount} index references remapped`);
    }

    let indices = new Uint32Array(indexBuf);

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║ 🔒 R52 PRECISION LOCK — Batch 6 cross-type dedup guard              ║
    // ║ The vIsChain !== existIsChain check prevents chain and grid vertices ║
    // ║ from merging even when quantized to the same 1e-5 grid cell.        ║
    // ║ Removing this guard causes chain vertices to be replaced by grid    ║
    // ║ vertices, destroying sub-sample feature edge precision.             ║
    // ║ See ChainVertexBuilder.ts for the full R52 precision guarantee.     ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    // ── Batch 6: Global vertex deduplication pass ──
    // R52: NEVER merge chain↔grid vertices. Chain vertices preserve exact
    // feature positions; grid vertices preserve exact grid positions.
    // Only same-type dedup (grid↔grid or chain↔chain) is allowed.
    let dedupMergeCount = 0;
    const batch6Remap = new Map<number, number>();
    {
        const QUANT = 1e5; // 1e-5 precision
        const uvToCanonical = new Map<string, number>();
        const remap = batch6Remap;
        const totalVerts = totalVertexCount + phantomVertexCount; // R37: Include phantom vertices in dedup

        for (let v = 0; v < totalVerts; v++) {
            const qu = Math.round(vertices[v * 3] * QUANT);
            const qt = Math.round(vertices[v * 3 + 1] * QUANT);
            const key = `${qu}:${qt}`;
            const existing = uvToCanonical.get(key);
            if (existing !== undefined) {
                const vIsChain = v >= gridVertexCount;
                const existIsChain = existing >= gridVertexCount;
                // R52: Skip cross-type merging — never merge chain↔grid
                if (vIsChain !== existIsChain) {
                    // Both vertices survive at their exact positions
                    continue;
                }
                // Same-type dedup: keep first as canonical
                if (existing !== v) {
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
            // Also remap chainEdges so edge verification uses correct indices
            for (let e = 0; e < chainEdges.length; e++) {
                const [v0, v1] = chainEdges[e];
                const m0 = remap.get(v0);
                const m1 = remap.get(v1);
                if (m0 !== undefined || m1 !== undefined) {
                    chainEdges[e] = [m0 ?? v0, m1 ?? v1];
                }
            }
        }
    }
    if (dedupMergeCount > 0) {
        console.log(`[ParametricExport]   v24.0 Global vertex dedup: ${dedupMergeCount} vertices merged`);
    }

    // ── Periodic u-seam closure (opt-in). Runs AFTER coalesce/dedup so it zippers
    //    the FINAL post-coalesce seam boundary verts (grid OR chain). Manifold-safe
    //    and non-regressive: only appends triangles that close an existing seam
    //    boundary edge without ever creating a >2-incidence (non-manifold) edge. ──
    if (options?.periodicSeamU) {
        const closure = buildPeriodicSeamClosure(indices, vertices);
        if (closure.triangles.length > 0) {
            for (const ti of closure.triangles) indexBuf.push(ti);
            indices = new Uint32Array(indexBuf);
        }
        console.warn(
            `[SEAM-CLOSURE] closed low=${closure.closedLowEdges}/${closure.lowSeamEdges} ` +
            `high=${closure.closedHighEdges}/${closure.highSeamEdges} skipped=${closure.skippedUnsafe} ` +
            `+${closure.triangles.length / 3} tris`,
        );
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
    const inverseRemap = new Map<number, number>();
    for (const [chainIdx, gridIdx] of batch2Remap) {
        inverseRemap.set(gridIdx, chainIdx);
    }
    for (const [sourceIdx, targetIdx] of batch6Remap) {
        if (sourceIdx >= gridVertexCount && targetIdx < gridVertexCount) {
            inverseRemap.set(targetIdx, sourceIdx);
        }
    }
    let enforced = 0, missing = 0;
    let missingSameRow = 0, missingCrossRow = 0;
    let primaryTotal = 0, primaryEnforced = 0, primaryMissing = 0;
    const missingExamples: string[] = [];
    for (const [v0, v1] of chainEdges) {
        if (v0 === v1) continue;
        const pi0 = v0 - gridVertexCount;
        const pi1 = v1 - gridVertexCount;
        const pcv0 = (pi0 >= 0 && pi0 < chainVertices.length) ? chainVertices[pi0] : undefined;
        const pcv1 = (pi1 >= 0 && pi1 < chainVertices.length) ? chainVertices[pi1] : undefined;
        const rpcv0 = pcv0 ?? (() => { const o = inverseRemap.get(v0); return o !== undefined ? chainVertices[o - gridVertexCount] : undefined; })();
        const rpcv1 = pcv1 ?? (() => { const o = inverseRemap.get(v1); return o !== undefined ? chainVertices[o - gridVertexCount] : undefined; })();
        const isPrimary = rpcv0 && rpcv1 && rpcv0.pointIdx >= 0 && rpcv1.pointIdx >= 0;
        if (isPrimary) primaryTotal++;
        const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
        if (meshEdgeSet.has(key)) {
            enforced++;
            if (isPrimary) primaryEnforced++;
        } else {
            missing++;
            if (isPrimary) primaryMissing++;
            const idx0 = v0 - gridVertexCount;
            const idx1 = v1 - gridVertexCount;
            const cv0 = (idx0 >= 0 && idx0 < chainVertices.length) ? chainVertices[idx0] : undefined;
            const cv1 = (idx1 >= 0 && idx1 < chainVertices.length) ? chainVertices[idx1] : undefined;
            if (cv0 && cv1) {
                if (cv0.rowIdx === cv1.rowIdx) missingSameRow++;
                else missingCrossRow++;
            }
            if (missingExamples.length < 10 && cv0 && cv1) {
                const col0 = bsearchFloor(unionU, cv0.u);
                const col1 = bsearchFloor(unionU, cv1.u);
                missingExamples.push(
                    `  chain${cv0.chainId} pt${cv0.pointIdx}\u2192pt${cv1.pointIdx}: ` +
                    `row${cv0.rowIdx}\u2192${cv1.rowIdx} col${col0}\u2192${col1} ` +
                    `u=${cv0.u.toFixed(6)}\u2192${cv1.u.toFixed(6)} vidx=${v0}\u2192${v1}`
                );
            }
        }
    }
    if (missingExamples.length > 0) {
        console.log(`[ParametricExport]   Missing edge examples:`);
        for (const ex of missingExamples) console.log(`[ParametricExport]     ${ex}`);
    }

    const buildMs = performance.now() - buildStart;
    const finalVertexCount = vertices.length / 3;
    const triCount = indices.length / 3;
    const realTriCount = triCount - seamSkipCount * 2;
    console.log(`[ParametricExport]   R34 Cell-local mesh: ${finalVertexCount} verts (${numU}\u00d7${numT} grid + ${chainVertices.length} chain), ${realTriCount} real tris`);
    console.log(`[ParametricExport]   R35 Chain edges: ${chainEdges.length} (enforced=${enforced}, missing=${missing} [sameRow=${missingSameRow}, crossRow=${missingCrossRow}]), chain cells: ${chainCellCount}, cross-cell: ${crossCellEdgeCount}, super-cells: ${superCellCount} (${superCellColumnsConsumed} cols), interpolated: ${interpolatedCount}`);
    // R46 Phase 2: Build interpolated chain vertex list (excluding batch2Remap'd vertices)
    const interpolatedChainVertices = chainVertices
        .filter(cv => cv.pointIdx === -1 && !batch2Remap.has(cv.vertexIdx))
        .map(cv => ({
            vertexIdx: cv.vertexIdx,
            chainId: cv.chainId,
            rowIdx: cv.rowIdx,
            gapSize: interpolatedGapSizes.get(cv.vertexIdx) ?? 2,
        }));

    console.log(`[ParametricExport]   R46 Fan diagonals: ${fanDiagEdges.length} (protected as constraint edges)`);
    console.log(`[ParametricExport]   R46 Interpolated chain vertices for re-snap: ${interpolatedChainVertices.length}/${interpolatedCount}`);
    console.log(`[ParametricExport]   R37 Phantom vertices: ${phantomVertexCount} (start=${phantomVertexStart}), band-split owned spans: ${ownedSpanR37.size}`);
    console.log(`[ParametricExport]   R53 BPP split cells: ${bppSplitCellCount} (standard=${bppSplitCellCount - bppChainSplitCellCount}, chain=${bppChainSplitCellCount}), propagated phantoms: ${bppPropagatedCount}`);
    if (qualityCompanionCount > 0) {
        console.log(`[ParametricExport]   R56 quality companions: ${qualityCompanionCount}`);
    }
    console.log(`[ParametricExport]   R34 Primary chain edges: total=${primaryTotal}, enforced=${primaryEnforced}, missing=${primaryMissing}`);
    if (windingFixCount > 0) {
        console.log(`[ParametricExport]   R34 Standard cell winding fixes: ${windingFixCount}`);
    }
    console.log(`[ParametricExport]   R34 Grid: ${numU}\u00d7${numT}, seam skips: ${seamSkipCount}, build time: ${buildMs.toFixed(1)}ms`);
    console.log(`[ParametricExport]   R34 batch2Remap: ${batch2Remap.size}, cellChainMap: ${cellChainMap.size}`);

    // Build chain vertex → chainId map for FeatureEdgeGraph
    const chainVertexChainIds = new Map<number, number>();
    for (const cv of chainVertices) {
        chainVertexChainIds.set(cv.vertexIdx, cv.chainId);
    }
    for (const [vertexIdx, chainId] of phantomVertexChainIds) {
        chainVertexChainIds.set(vertexIdx, chainId);
    }

    // R37: Trim overallocated phantom buffer to actual size to avoid GPU waste
    const usedVertexCount = totalVertexCount + phantomVertexCount;
    const finalVertices = vertices.subarray(0, usedVertexCount * 3);

    return {
        vertices: finalVertices,
        indices,
        ...(triangleProvenance ? { triangleProvenance } : {}),
        quadMap,
        gridVertexCount,
        chainEdges,
        origToFinal,
        chainVertexChainIds,
        chainAdjacentVertices: chainAdjacentGridVerts,
        protectedStripVertices,
        fanDiagonalEdges: fanDiagEdges,
        interpolatedChainVertices,
        // Bug #1 fix: expose phantom chain anchors for downstream GPU re-snap.
        // Filtered against live phantomChainAnchorSet for defensive consistency.
        phantomChainAnchors: Array.from(phantomChainAnchorData.entries())
            .filter(([vertexIdx]) => phantomChainAnchorSet.has(vertexIdx))
            .map(([vertexIdx, meta]) => ({
                vertexIdx,
                chainId: meta.chainId,
                tCross: meta.tCross,
            })),
        corridorPlan,
    };
}
