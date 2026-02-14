/**
 * ParametricExportComputer.ts — v11.3 Gap-Free Index Layout + Budget Cap
 *
 * COMPLETELY SEPARATE pipeline from AdaptiveExportComputer (CDT+GPU subdivision).
 *
 * Architecture:
 *   1. GPU: Multi-strip curvature sampling (16 strips × 4096 samples) → gradient + curvature profiles
 *   2. CPU: Feature detection via gradient zero-crossings + d²r/du² curvature peaks
 *   3. CPU: CDF-adaptive base grid sized to respect the user's triangle budget
 *   4. GPU: Per-row probing (4096 samples/row) → 5-point stencil + GSS sub-sample peak detection
 *   5. CPU: Feature CHAIN LINKING — connect per-row peaks across adjacent rows into
 *          continuous polylines through (u,t) space.
 *   6. CPU: Chain-guided T-row insertion — subdivide grid rows at T positions where
 *          chains cross row boundaries.
 *   7. CPU: PER-ROW FEATURE PATCHING — union grid provides representative feature
 *          columns; each row's vertices are snapped to the chain's exact U position.
 *          Chain edges become mesh edges via diagonal alignment.
 *   8. GPU: Evaluate full mesh → 3D positions
 *
 * v11.2 DENSITY FIX:
 *   v11.1 merged ALL chain vertex U-positions into the global grid as full-height
 *   columns. With 70 chains × ~97 points = ~6800 chain U-values → 5593 new columns
 *   spanning ALL rows. This created a near-uniform 6331×279 mesh with 3.5M tris
 *   instead of the target ~360K (10× over budget).
 *
 *   v11.2 fixes this by using the UNION GRID (which clusters features into
 *   representative columns with flanking companions, ~200-400 extra columns)
 *   as the global grid topology. Per-row vertex patching then snaps each row's
 *   feature-column vertices to the chain's exact U position at that row.
 *   Diagonal alignment ensures chain edges are mesh edges.
 *
 *   Result: Grid stays at ~1900 columns (union grid) instead of 6331.
 *   Features are mesh edges via per-row patching + diagonal alignment.
 *   Triangle count respects the user's budget.
 *
 * Key Properties (v11.2):
 *   - FEATURE-EDGE MESH: per-row patching places vertices exactly on chain positions
 *   - DIAGONAL ALIGNMENT: cells containing chain edges use aligned diagonals
 *   - BUDGET-RESPECTING: union grid density controlled by CDF + clustering
 *   - O(n) COMPLEXITY: grid triangulation is linear in cell count
 *   - Watertight by construction (shared boundary vertices with other surfaces)
 *   - No external CDT library dependency for the hot path
 */

import { MeshData, PotDimensions, StyleOptions, StyleId } from '../../geometry/types';
import { buildStyleParamPayload } from '../../utils/styleParams';
// NOTE: cdt2d import removed in v11.1 — no longer needed on the hot path.
// The grid-native approach eliminates the O(n²) CDT library dependency.

// ============================================================================
// Types
// ============================================================================

export interface ParametricExportParams {
    dimensions: PotDimensions;
    styleId: StyleId;
    styleOpts: StyleOptions;
    styleIndex: number;
    /** Target triangle count (default: 2M = ~100MB STL) */
    targetTriangles?: number;
    /** Number of anisotropic relaxation steps (v5.3). Default: 20 */
    relaxIterations?: number;
}

export interface ParametricExportResult {
    mesh: MeshData;
    computeTimeMs: number;
    gridDimensions: { nu: number; nt: number };
    adaptiveStats: {
        densityRatio: number;
        featurePeaksSnapped: number;
        tCurvatureRange: [number, number];
        uCurvatureRange: [number, number];
    };
}

export interface ChainDebugLine {
    points: Array<[number, number]>; // [u, t]
}

export interface ChainDebugData {
    createdAt: number;
    chainCount: number;
    lineCount: number;
    lines: ChainDebugLine[];
}

/** Feature kind: ridge peak (local max radius) or valley (local min radius). */
export type FeatureKind = 'peak' | 'valley';

/** A classified, verified feature point detected by row/column probing. */
export interface FeaturePoint {
    /** U position in [0, 1) */
    u: number;
    /** Feature classification */
    kind: FeatureKind;
    /** Cylindrical radius at the feature position */
    radius: number;
    /** Peak-to-valley prominence in the local neighbourhood (mm) */
    prominence: number;
    /** Confidence score in [0, 1]: 1 = strong isolated extremum, 0 = marginal */
    confidence: number;
}

/** Raw per-row (and per-column) peak positions for debug visualization. */
export interface PeakDebugData {
    createdAt: number;
    /** Total number of raw peak points */
    totalPeaks: number;
    /** Peak positions as [u, t, kind] triples (flattened: [u0,t0,k0, u1,t1,k1, ...])
     *  k=0 for peak, k=1 for valley */
    points: Float32Array;
    /** Number of row-detected peaks */
    rowPeaks: number;
    /** Number of column-detected peaks */
    colPeaks: number;
    /** Breakdown: peaks vs valleys */
    peakCount: number;
    valleyCount: number;
    /** Number of candidates that failed verification */
    rejected: number;
}

let LAST_CHAIN_DEBUG_DATA: ChainDebugData | null = null;
let LAST_PEAK_DEBUG_DATA: PeakDebugData | null = null;

export function getLastChainDebugData(): ChainDebugData | null {
    return LAST_CHAIN_DEBUG_DATA;
}

export function getLastPeakDebugData(): PeakDebugData | null {
    return LAST_PEAK_DEBUG_DATA;
}

// ============================================================================
// Surface Grid Definitions
// ============================================================================

const SURFACE_CONFIG = [
    { id: 0, name: 'Outer Wall', budgetFrac: 0.72, invertWinding: false },
    { id: 1, name: 'Inner Wall', budgetFrac: 0.14, invertWinding: true },
    { id: 2, name: 'Rim', budgetFrac: 0.04, invertWinding: false },
    { id: 3, name: 'Bottom Under', budgetFrac: 0.04, invertWinding: true },
    { id: 4, name: 'Bottom Top', budgetFrac: 0.03, invertWinding: true },
    { id: 5, name: 'Drain', budgetFrac: 0.03, invertWinding: true },
] as const;

/** Samples per strip for curvature probing.
 * 4096 gives ~0.088° resolution for feature detection. */
const CURVATURE_SAMPLES = 4096;

/** Number of parallel strips for multi-angle curvature detection */
const NUM_STRIPS = 16;

// ============================================================================
// Curvature Computation from 3D Positions
// ============================================================================

/**
 * Compute RAW (unnormalized) curvature from 3D positions along a parameter.
 * Returns absolute second-derivative magnitudes — no clamping, no scaling.
 */
function computeRawCurvature(positions: Float32Array, numSamples: number): Float32Array {
    const curvature = new Float32Array(numSamples);

    for (let i = 1; i < numSamples - 1; i++) {
        const x0 = positions[(i - 1) * 3], y0 = positions[(i - 1) * 3 + 1], z0 = positions[(i - 1) * 3 + 2];
        const x1 = positions[i * 3], y1 = positions[i * 3 + 1], z1 = positions[i * 3 + 2];
        const x2 = positions[(i + 1) * 3], y2 = positions[(i + 1) * 3 + 1], z2 = positions[(i + 1) * 3 + 2];

        const dx = x0 - 2 * x1 + x2;
        const dy = y0 - 2 * y1 + y2;
        const dz = z0 - 2 * z1 + z2;

        curvature[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    curvature[0] = curvature[1];
    curvature[numSamples - 1] = curvature[numSamples - 2];

    return curvature;
}

/**
 * Normalize a curvature profile to [0, 1] using percentile scaling.
 * Applied AFTER max-aggregation across all strips.
 */
function normalizeProfile(curvature: Float32Array): Float32Array {
    const n = curvature.length;
    const result = new Float32Array(n);

    const sorted = Array.from(curvature).sort((a, b) => a - b);
    const p05 = sorted[Math.floor(n * 0.05)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const range = p95 - p05;

    if (range > 1e-8) {
        for (let i = 0; i < n; i++) {
            result[i] = Math.max(0, Math.min(1, (curvature[i] - p05) / range));
        }
    }
    // else: all curvatures are similar → keep zeros → uniform grid (correct!)

    return result;
}

/**
 * Smooth a curvature profile using a moving average window.
 * Prevents CDF from creating excessively sharp density transitions.
 */
function smoothProfile(profile: Float32Array, radius: number): Float32Array {
    const n = profile.length;
    const result = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        const lo = Math.max(0, i - radius);
        const hi = Math.min(n - 1, i + radius);
        for (let j = lo; j <= hi; j++) {
            sum += profile[j];
            count++;
        }
        result[i] = sum / count;
    }
    return result;
}

/** Smoothing radius for curvature profiles before CDF generation.
 * Keep small (2) to preserve sharp feature peaks while preventing noise. */
const SMOOTH_RADIUS = 2;

/** Minimum prominence for a peak to be considered a feature edge.
 * Expressed as fraction of max curvature. Lower = catch subtler features. */
const FEATURE_PROMINENCE_THRESHOLD = 0.08;

/** Flanking companion offset as fraction of average grid spacing.
 * Each feature gets two companion grid lines at ±FLANK_OFFSET * avgSpacing
 * to properly capture the curvature on both sides of the ridge/valley. */
const FLANK_OFFSET = 0.3;

/** v10.7: Number of columns on EACH side of the ridge to include in the
 * stitch band.  Total band width = 2 * STITCH_BAND_HALF_WIDTH + 1 quads.
 * Wider band → more quads get 4-tri fan subdivision → smoother transition
 * zone between ridge crest and flat regions.
 * At 500K export (outerW≈1290, m=6 ridges), each ridge spans ~215 columns.
 * A half-width of 3 gives a 7-column band ≈ 3.3% of a ridge period,
 * increasing stitch coverage from ~3% to ~10%.
 * Performance impact: each extra band column adds 2 tris per quad row per
 * chain segment.  At 500K with 93 chains × 73 avg pts → +27K extra tris
 * per extra column, well within budget. */
// v16.8: Further narrow stitch band to minimize visible density rings.
// Keep only ±1 columns around ridge for fan triangulation.
const STITCH_BAND_HALF_WIDTH = 1;

/**
 * v16.5: Keep chain-directed LOCKING narrower than stitch coverage.
 *
 * A wide stitch band is useful for fan triangulation and smooth normals near
 * features, but locking that entire band blocks `flipEdges3D()` from improving
 * neighboring triangle quality. That can make the area around good feature
 * edges look coarse/rough.
 *
 * v16.12: Reduced from 1 to 0. Only lock the ridge quad itself.
 * The ±1 neighbor quads still get chain-directed diagonals, but are
 * left UNLOCKED so flipEdges3D can override them with 3D-optimal
 * diagonals. On sharp ridges, this lets the quality flipper smooth
 * the transition from peak to slope instead of forcing chain-aligned
 * diagonals on quads that don't contain the ridge vertex.
 */
const CHAIN_LOCK_BAND_HALF_WIDTH = 0;

// v16.8: Supplemental stitch pass can create broad density bands because it
// stitches many adjacent-row feature pairs beyond linked chains.
// Disable it for local-only, chain-constrained topology.
const ENABLE_SUPPLEMENTAL_STITCHING = false;

/**
 * v16.6: Local-only outer-wall adaptation.
 *
 * When true:
 *  - No global T-row insertion
 *  - No global U-column insertion from per-row features
 *
 * Feature fidelity is driven by per-row vertex patching + stitch fan topology,
 * avoiding global grid reshaping that can hurt surrounding smoothness.
 */
const LOCAL_ONLY_OUTER_ADAPTATION = true;

/** v10.8: Number of columns on EACH side of the peak to receive gradient-based
 * U redistribution.  Total redistribution band = 2 * GRADIENT_PATCH_HALF_WIDTH + 1.
 * v10.10: NO LONGER USED — peak-only patching eliminates flanking column movement.
 * Retained as documentation of the historical value. */
// const GRADIENT_PATCH_HALF_WIDTH = 4;

/**
 * Detect feature edges (ridges and valleys) in a curvature profile.
 *
 * Uses TWO complementary detection strategies:
 * 1. Curvature peaks: Local maxima in |d²r/dp²| with prominence filtering.
 *    These mark positions of maximum bending (where the surface curves most).
 * 2. Gradient zero-crossings: Sign changes in dr/dp (first derivative).
 *    These are the ACTUAL ridge peaks and valley bottoms — the extrema of
 *    the radius function itself, which is where grid lines matter most.
 *
 * Both types are merged and deduplicated. This dual approach ensures we
 * catch both sharp cusps (high curvature) and gentle hills (gradient zero
 * but low curvature).
 *
 * @param curvature - Raw (unnormalized) curvature profile (|d²r/dp²|)
 * @param numSamples - Length of the profile
 * @param positions3D - Optional: the 3D positions used to compute curvature.
 *   If provided, also detects gradient zero-crossings (radius extrema).
 * @returns Array of feature positions in [0, 1) normalized coordinates
 */
function detectFeatureEdges(
    curvature: Float32Array,
    numSamples: number,
    positions3D?: Float32Array
): number[] {
    const features: number[] = [];
    if (numSamples < 5) return features;

    // --- Strategy 1: Curvature peaks (high |d²r/dp²|) ---
    let maxCurv = 0;
    for (let i = 0; i < numSamples; i++) {
        maxCurv = Math.max(maxCurv, curvature[i]);
    }

    if (maxCurv > 1e-8) {
        const prominenceThreshold = maxCurv * FEATURE_PROMINENCE_THRESHOLD;

        for (let i = 2; i < numSamples - 2; i++) {
            const c = curvature[i];
            if (c <= curvature[i - 1] || c <= curvature[i + 1]) continue;

            // Prominence: height above the higher of the two flanking minima
            let leftMin = c;
            for (let j = i - 1; j >= 0; j--) {
                leftMin = Math.min(leftMin, curvature[j]);
                if (curvature[j] > c) break;
            }
            let rightMin = c;
            for (let j = i + 1; j < numSamples; j++) {
                rightMin = Math.min(rightMin, curvature[j]);
                if (curvature[j] > c) break;
            }
            const prominence = c - Math.max(leftMin, rightMin);

            if (prominence >= prominenceThreshold) {
                const L = curvature[i - 1];
                const R = curvature[i + 1];
                const denom = 2 * (L - 2 * c + R);
                const offset = Math.abs(denom) > 1e-9 ? (L - R) / denom : 0;
                const refinedPos = (i + offset) / numSamples;
                features.push(Math.max(0, Math.min(1 - 1e-6, refinedPos)));
            }
        }
    }

    // --- Strategy 2: Gradient zero-crossings (radius extrema) ---
    // These are the actual ridge tops and valley bottoms.
    // Even gentle hills with low curvature create zero-crossings.
    if (positions3D && positions3D.length >= numSamples * 3) {
        // Compute cylindrical radius at each sample
        const radii = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const x = positions3D[i * 3];
            const y = positions3D[i * 3 + 1];
            radii[i] = Math.sqrt(x * x + y * y);
        }

        // Compute first derivative (gradient) via central differences
        const gradient = new Float32Array(numSamples);
        for (let i = 1; i < numSamples - 1; i++) {
            gradient[i] = radii[i + 1] - radii[i - 1]; // proportional to dr/dp
        }
        gradient[0] = gradient[1];
        gradient[numSamples - 1] = gradient[numSamples - 2];

        // Find zero-crossings with minimum curvature gate
        // (only add if curvature at zero-crossing exceeds noise floor)
        const noiseFloor = maxCurv * 0.02; // 2% of max = very sensitive
        for (let i = 1; i < numSamples - 1; i++) {
            if (gradient[i - 1] * gradient[i] < 0 || // Sign change
                (gradient[i] === 0 && gradient[i - 1] !== 0)) { // Exact zero
                // Linear interpolation for sub-sample zero-crossing position
                const g0 = gradient[i - 1];
                const g1 = gradient[i];
                const frac = Math.abs(g0) / (Math.abs(g0) + Math.abs(g1) + 1e-12);
                const pos = (i - 1 + frac) / numSamples;

                // Gate: must have non-trivial curvature nearby
                const localCurv = Math.max(
                    curvature[Math.max(0, i - 1)],
                    curvature[i],
                    curvature[Math.min(numSamples - 1, i + 1)]
                );
                if (localCurv > noiseFloor) {
                    features.push(Math.max(0, Math.min(1 - 1e-6, pos)));
                }
            }
        }
    }

    // Deduplicate features that are too close together (within 0.5 sample)
    features.sort((a, b) => a - b);
    const minSep = 0.5 / numSamples;
    const deduped: number[] = [];
    for (const f of features) {
        if (deduped.length === 0 || f - deduped[deduped.length - 1] > minSep) {
            deduped.push(f);
        }
    }

    return deduped;
}

/**
 * Merge feature edge positions into a CDF-adaptive position array.
 *
 * Instead of replacing existing grid lines (which loses CDF coverage),
 * this function INSERTS feature positions plus flanking companion lines
 * into the grid, then deduplicates lines that are too close together.
 *
 * For each feature, up to 3 grid lines are added:
 *   - The feature position itself (exact ridge/valley)
 *   - A companion at feature - FLANK_OFFSET * avgSpacing
 *   - A companion at feature + FLANK_OFFSET * avgSpacing
 *
 * Lines that end up within minSep of each other are merged to prevent
 * degenerate triangles.
 *
 * @param cdfPositions - CDF-adaptive positions (NOT modified)
 * @param features - Feature edge positions in [0, 1)
 * @param isPeriodic - If true, positions wrap around [0, 1)
 * @returns New Float32Array with merged positions (may be larger than input)
 */
function mergeFeaturePositions(
    cdfPositions: Float32Array,
    features: number[],
    isPeriodic: boolean = false
): { positions: Float32Array; injected: number } {
    if (features.length === 0) {
        return { positions: cdfPositions, injected: 0 };
    }

    const n = cdfPositions.length;
    const avgSpacing = 1.0 / Math.max(n, 1);
    const flankDist = avgSpacing * FLANK_OFFSET;
    // Minimum separation: 10% of average spacing to prevent degenerate triangles
    const minSep = avgSpacing * 0.1;

    // Collect all candidate positions: CDF + features + flanking companions
    const allPositions: number[] = Array.from(cdfPositions);
    let injected = 0;

    for (const feat of features) {
        // Add the feature itself
        allPositions.push(feat);
        injected++;

        // Add flanking companions
        const leftFlank = feat - flankDist;
        const rightFlank = feat + flankDist;

        if (isPeriodic) {
            // Wrap around for periodic (U) direction
            allPositions.push(((leftFlank % 1.0) + 1.0) % 1.0);
            allPositions.push(((rightFlank % 1.0) + 1.0) % 1.0);
        } else {
            // Clamp for non-periodic (T) direction
            if (leftFlank > 0.001) allPositions.push(leftFlank);
            if (rightFlank < 0.999) allPositions.push(rightFlank);
        }
    }

    // Sort all positions
    allPositions.sort((a, b) => a - b);

    // Deduplicate: merge positions closer than minSep
    const merged: number[] = [allPositions[0]];
    for (let i = 1; i < allPositions.length; i++) {
        if (allPositions[i] - merged[merged.length - 1] > minSep) {
            merged.push(allPositions[i]);
        }
    }

    // Ensure boundaries
    if (merged[0] > 0.001 && !isPeriodic) {
        merged.unshift(0);
    }
    if (merged[merged.length - 1] < 0.999 && !isPeriodic) {
        merged.push(1.0);
    }

    const result = new Float32Array(merged.length);
    for (let i = 0; i < merged.length; i++) {
        result[i] = merged[i];
    }

    return { positions: result, injected };
}

/**
 * Generate CDF-adaptive positions from a curvature profile.
 *
 * Uses curvature-weighted CDF inversion to place more samples in high-curvature
 * regions while enforcing a minimum spacing floor to prevent large gaps
 * in low-curvature areas.
 *
 * @param curvature - Normalized curvature profile [0,1], length = CURVATURE_SAMPLES
 * @param count - Number of output positions to generate
 * @param minSpacingFactor - Minimum spacing as fraction of uniform spacing (0.3 = 30% of uniform)
 * @returns Float32Array of positions in [0, 1)
 */
function generateCDFAdaptivePositions(
    curvature: Float32Array,
    count: number,
    minSpacingFactor: number = 0.3
): Float32Array {
    const n = curvature.length;

    // Build density: baseline + curvature boost (squared for stronger contrast)
    // The baseline prevents gaps in low-curvature regions.
    // Squaring the curvature amplifies the difference between high and low areas.
    const density = new Float32Array(n);
    const baseline = minSpacingFactor;
    for (let i = 0; i < n; i++) {
        const c = curvature[i];
        const boosted = c * c; // Square for stronger contrast
        density[i] = baseline + (1 - baseline) * boosted;
    }

    // Build CDF
    const cdf = new Float32Array(n + 1);
    cdf[0] = 0;
    for (let i = 0; i < n; i++) {
        cdf[i + 1] = cdf[i] + density[i];
    }
    // Normalize CDF to [0, 1]
    const total = cdf[n];
    if (total < 1e-8) {
        // Flat curvature → uniform spacing
        const positions = new Float32Array(count);
        for (let i = 0; i < count; i++) positions[i] = i / count;
        return positions;
    }
    for (let i = 0; i <= n; i++) cdf[i] /= total;

    // Invert CDF to get positions
    const positions = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const target = (i + 0.5) / count; // Center of each bin
        // Binary search in CDF
        let lo = 0, hi = n;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cdf[mid + 1] < target) lo = mid + 1;
            else hi = mid;
        }
        // Linear interpolation within the bin
        const cdfLo = cdf[lo];
        const cdfHi = cdf[lo + 1];
        const frac = cdfHi > cdfLo ? (target - cdfLo) / (cdfHi - cdfLo) : 0.5;
        positions[i] = (lo + frac) / n;
    }

    // Ensure periodicity: first position at 0 (or very near)
    // and no position >= 1
    positions[0] = 0;
    for (let i = 1; i < count; i++) {
        positions[i] = Math.min(positions[i], 1 - 1e-6);
    }

    return positions;
}



// ============================================================================
// Grid Generation
// ============================================================================

/**
 * Generate a periodic UV grid with non-uniform but SHARED spacing.
 * Used for inner wall, rim, bottom, drain (non-feature surfaces).
 */
function generateAdaptiveGrid(
    uPositions: Float32Array,
    tPositions: Float32Array,
    surfaceId: number,
    invertWinding: boolean
): { vertices: Float32Array; indices: Uint32Array; w: number } {
    const w = uPositions.length;
    const h = tPositions.length - 1;
    const vertCount = w * tPositions.length;
    const vertices = new Float32Array(vertCount * 3);
    const triCount = w * h * 2;
    const indices = new Uint32Array(triCount * 3);

    let vIdx = 0;
    for (let j = 0; j < tPositions.length; j++) {
        for (let i = 0; i < w; i++) {
            vertices[vIdx++] = uPositions[i];
            vertices[vIdx++] = tPositions[j];
            vertices[vIdx++] = surfaceId;
        }
    }

    const stride = w;
    let iIdx = 0;
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const i0 = j * stride + i;
            const i1 = j * stride + ((i + 1) % w);
            const i2 = (j + 1) * stride + i;
            const i3 = (j + 1) * stride + ((i + 1) % w);

            if (invertWinding) {
                indices[iIdx++] = i0; indices[iIdx++] = i2; indices[iIdx++] = i1;
                indices[iIdx++] = i1; indices[iIdx++] = i2; indices[iIdx++] = i3;
            } else {
                indices[iIdx++] = i0; indices[iIdx++] = i1; indices[iIdx++] = i2;
                indices[iIdx++] = i1; indices[iIdx++] = i3; indices[iIdx++] = i2;
            }
        }
    }

    return { vertices, indices, w };
}

// ============================================================================
// v11.1 — Grid-Native Constrained Meshing (No CDT Library)
// ============================================================================
//
// v11.2 DENSITY FIX:
//
// v11.1 merged ALL chain U-positions into the global U array, creating 5593
// new columns spanning every row. This produced a 6331×279 grid with 3.5M tris
// instead of the target ~360K (10× over budget). The mesh was near-uniform
// with no feature-following.
//
// v11.2 fixes this with a two-layer approach:
//   1. UNION GRID: Uses buildUnionFeatureGrid() which clusters per-row features
//      into representative columns with flanking companions (~200-400 extra cols).
//      This is the global grid topology — respects the triangle budget.
//   2. PER-ROW PATCHING: For each chain point, find the nearest grid column and
//      overwrite that row's vertex U-coordinate with the exact chain position.
//      This makes chain vertices mesh vertices without adding global columns.
//   3. DIAGONAL ALIGNMENT: Cells containing chain edge segments get their
//      diagonal oriented to follow the chain direction.
//
// The result: ~1900 columns instead of 6331. Features are mesh edges via
// per-row patching. Triangle count respects the budget. O(numU × numT).
// ============================================================================

/**
 * Binary search for the insertion point in a sorted array.
 * Returns the index of the last element <= value.
 *
 * @param arr - Sorted array to search
 * @param value - Value to locate
 * @returns Index i such that arr[i] <= value < arr[i+1], or -1 if value < arr[0]
 */
function bsearchFloor(arr: Float32Array | number[], value: number): number {
    let lo = 0;
    let hi = arr.length - 1;
    if (value < arr[0]) return -1;
    if (value >= arr[hi]) return hi;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (arr[mid] <= value) lo = mid;
        else hi = mid - 1;
    }
    return lo;
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
 * @param targetOuterTris Target triangle count for the outer wall
 * @param surfaceId       Surface ID (0 for outer wall)
 * @returns vertices (u,t,surfaceId interleaved), indices, grid width
 */
function buildCDTOuterWall(
    chains: FeatureChain[],
    rowMapping: number[],
    tPositions: Float32Array,
    unionU: Float32Array,
    _targetOuterTris: number,
    surfaceId: number = 0
): { vertices: Float32Array; indices: Uint32Array; quadMap: Int32Array } {
    const buildStart = performance.now();

    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    const numT = tPositions.length;
    const numU = unionU.length;
    const gridVertexCount = numU * numT;

    // ── 1. Collect chain points remapped to UV space with vertex indices ──
    const SEAM_THRESHOLD = 0.4;

    // Each chain point gets a unique vertex index (appended after grid)
    interface ChainVertex {
        u: number;
        rowIdx: number;     // final row index
        vertexIdx: number;  // global vertex index
        chainId: number;    // which chain this belongs to
        pointIdx: number;   // index within the chain
    }

    const chainVertices: ChainVertex[] = [];
    const cellsPerRow = numU - 1;

    // Chain edge segments: pairs of consecutive chain vertex indices.
    // After interpolation, every edge spans exactly 1 row band.
    const chainEdges: Array<[number, number]> = [];

    let nextVertexIdx = gridVertexCount;

    // v16.14: For chain edges spanning multiple rows (chain skips a row where
    // no feature was detected), interpolate intermediate chain vertices so
    // that every chain edge spans exactly one row band. Without this, a chain
    // edge from row j to row j+3 has no chain vertices on rows j+1 and j+2,
    // so no strip can create the connecting mesh edges.
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
        // Then record single-row chain edges.
        const fullChain: ChainVertex[] = [];
        for (let k = 0; k < rawRemapped.length; k++) {
            fullChain.push(rawRemapped[k]);

            if (k < rawRemapped.length - 1) {
                const p0 = rawRemapped[k];
                const p1 = rawRemapped[k + 1];

                // Skip seam-crossing edges
                let du = p1.u - p0.u;
                if (du > 0.5) du -= 1;
                if (du < -0.5) du += 1;
                if (Math.abs(du) > SEAM_THRESHOLD) continue;

                const rowGap = p1.rowIdx - p0.rowIdx;
                if (rowGap <= 1 && rowGap >= -1) {
                    // Single row step — no interpolation needed
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
                        pointIdx: -1 // interpolated, not a real chain point
                    };
                    chainVertices.push(interpCV);
                    fullChain.push(interpCV);
                    interpolatedCount++;
                }
            }
        }

        // Record chain edges between consecutive fullChain entries (single-row steps)
        for (let k = 1; k < fullChain.length; k++) {
            const p0 = fullChain[k - 1];
            const p1 = fullChain[k];
            // Skip seam-crossing edges
            let du = Math.abs(p1.u - p0.u);
            if (du > SEAM_THRESHOLD) continue;
            // Only record edges spanning exactly 1 row
            const rowGap = Math.abs(p1.rowIdx - p0.rowIdx);
            if (rowGap !== 1) continue;
            chainEdges.push([p0.vertexIdx, p1.vertexIdx]);
        }
    }

    const totalChainPoints = chainVertices.length;

    // ── 2. Generate vertices: grid + chain points ──
    const totalVertexCount = gridVertexCount + totalChainPoints;
    const vertices = new Float32Array(totalVertexCount * 3);

    // Grid vertices (same as before)
    let vIdx = 0;
    for (let j = 0; j < numT; j++) {
        for (let i = 0; i < numU; i++) {
            vertices[vIdx++] = unionU[i];
            vertices[vIdx++] = tPositions[j];
            vertices[vIdx++] = surfaceId;
        }
    }

    // Chain point vertices (appended after grid)
    for (const cv of chainVertices) {
        vertices[vIdx++] = cv.u;
        vertices[vIdx++] = tPositions[cv.rowIdx];
        vertices[vIdx++] = surfaceId;
    }

    // ── 3. Build per-row chain vertex lookup (sorted by U) ──
    // For each row, collect chain vertices sorted by U position.
    const rowChainVerts = new Map<number, ChainVertex[]>();
    for (const cv of chainVertices) {
        let list = rowChainVerts.get(cv.rowIdx);
        if (!list) { list = []; rowChainVerts.set(cv.rowIdx, list); }
        list.push(cv);
    }
    // Sort each row's chain vertices by U
    for (const [, list] of rowChainVerts) {
        list.sort((a, b) => a.u - b.u);
    }

    // ── 4. Full-row strip triangulation ──
    // For each row band (j to j+1), build a SINGLE merged vertex sequence
    // spanning ALL columns on both the bottom and top edges (grid columns +
    // chain points sorted by U), then sweep L→R to create a triangle strip
    // across the entire row.
    //
    // This is critical for cross-cell chain edges: when chain point P is in
    // column i (row j) and chain point Q is in column i+1 (row j+1), a
    // per-cell approach processes them separately and never creates edge P→Q.
    // The full-row sweep sees both P and Q in the same pass and naturally
    // creates a triangle with edge P→Q.
    //
    // For quadMap: after the strip, we classify each triangle by which grid
    // column its centroid falls in. Standard cells (2 tris, no chain vertices)
    // get valid quadMap entries. Cells touched by chain vertices get -1.

    const totalCells = cellsPerRow * (numT - 1);
    const indexBuf: number[] = [];

    // quadMap: for grid-based flip functions. -1 for cells with chain vertices.
    const quadMap = new Int32Array(totalCells);
    quadMap.fill(-1); // Default to -1, set valid entries for standard cells
    let seamSkipCount = 0;
    let chainCellCount = 0;
    let crossCellEdgeCount = 0;

    const SEAM_GUARD = 0.3;

    // Pre-build row-indexed chain edge lookup for efficient bridge-gap marking.
    // For each row band j (from row j to j+1), store the chain edges that span it.
    const rowBandEdges = new Map<number, Array<[number, number]>>(); // row → edges
    for (const [v0, v1] of chainEdges) {
        const cv0 = chainVertices[v0 - gridVertexCount];
        const cv1 = chainVertices[v1 - gridVertexCount];
        if (!cv0 || !cv1) continue;
        // Edges go from smaller rowIdx to larger rowIdx
        const r0 = Math.min(cv0.rowIdx, cv1.rowIdx);
        const r1 = Math.max(cv0.rowIdx, cv1.rowIdx);
        if (r1 - r0 !== 1) continue; // Only adjacent-row edges
        let list = rowBandEdges.get(r0);
        if (!list) { list = []; rowBandEdges.set(r0, list); }
        list.push([v0, v1]);
    }

    // Build merged sequences: grid columns interleaved with chain points.
    // Each entry records the vertex index, U position, and whether it's a chain vertex.
    interface StripVertex { idx: number; u: number; isChain: boolean; gridCol: number; }

    const buildMergedRow = (row: number): StripVertex[] => {
        const result: StripVertex[] = [];
        const chainList = rowChainVerts.get(row) || [];
        let ci = 0; // chain index

        for (let i = 0; i < numU; i++) {
            // Insert any chain points that fall before this grid column
            while (ci < chainList.length && chainList[ci].u < unionU[i] - 1e-9) {
                const col = i > 0 ? i - 1 : 0;
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: col });
                ci++;
            }

            // Check if a chain point is very close to this grid column.
            // If so, REPLACE the grid vertex with the chain vertex to avoid
            // degenerate triangles while keeping the chain vertex in the topology.
            // This is critical for constraint enforcement — skipping chain vertices
            // breaks the vtxBotPos/vtxTopPos lookup in constraintAwareTriangulate.
            if (ci < chainList.length && Math.abs(chainList[ci].u - unionU[i]) <= 1e-6) {
                // Chain vertex coincides with grid column — emit chain vertex
                // at this grid column's position in the sorted sequence
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: i });
                ci++;
            } else {
                // Normal: add grid column vertex
                result.push({ idx: row * numU + i, u: unionU[i], isChain: false, gridCol: i });
            }

            // Insert chain points between this grid column and the next
            const uNext = (i < numU - 1) ? unionU[i + 1] : 1.0 + 1e-6;
            while (ci < chainList.length && chainList[ci].u < uNext - 1e-9) {
                // v16.19: Always include chain vertices — never skip them.
                // Skipping chain vertices close to grid columns breaks constraint
                // enforcement because the vertex won't appear in the strip's
                // bot/top arrays. The constraint-aware sweep handles thin triangles.
                result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: i });
                ci++;
            }
        }
        // Remaining chain points (should be rare)
        while (ci < chainList.length) {
            result.push({ idx: chainList[ci].vertexIdx, u: chainList[ci].u, isChain: true, gridCol: numU - 1 });
            ci++;
        }

        return result;
    };

    // ── v16.19: Constraint-aware strip triangulation ──
    //
    // Instead of a naive strip sweep + post-hoc edge flipping (which has
    // numerical issues with convexity tests and winding corruption), this
    // approach builds a CONSTRAINT-AWARE triangulation directly.
    //
    // For each row band with chain constraints:
    //   1. Build merged bottom/top vertex sequences (grid + chain, sorted by U)
    //   2. Sort constraint edges by the U midpoint
    //   3. Triangulate by processing "pillars" — each constraint edge acts as
    //      a mandatory diagonal that splits the strip. The regions between
    //      constraints are filled with a simple fan from the constraint vertex.
    //
    // This guarantees every constraint edge is a mesh edge without any
    // post-processing flips, and winding order is always CCW by construction.

    /**
     * Triangulate a strip between two rows with mandatory constraint edges.
     * Returns triangle indices directly (no post-flip needed).
     *
     * Strategy: Process the strip left-to-right. At each step, we have a
     * "current front" of bottom and top pointers. When we reach a constraint
     * edge's position, we fan-triangulate from both endpoints to close the
     * region before the constraint, then emit the constraint edge and continue.
     *
     * For strips WITHOUT constraints, this is equivalent to the standard
     * alternating-advance sweep.
     */
    function constraintAwareTriangulate(
        buf: number[],
        bot: StripVertex[],
        top: StripVertex[],
        constraints: Array<[number, number]>,
        chainVerts: ChainVertex[],
        gridVCount: number
    ): void {
        if (bot.length < 2 && top.length < 2) return;

        // If no constraints, do a simple strip sweep
        if (constraints.length === 0) {
            simpleSweep(buf, bot, top);
            return;
        }

        // Build index→position maps for constraint vertices
        const vtxBotPos = new Map<number, number>(); // vertex index → position in bot[]
        const vtxTopPos = new Map<number, number>(); // vertex index → position in top[]
        for (let i = 0; i < bot.length; i++) vtxBotPos.set(bot[i].idx, i);
        for (let i = 0; i < top.length; i++) vtxTopPos.set(top[i].idx, i);

        // Classify each constraint: which endpoint is on bot, which on top?
        interface ClassifiedConstraint {
            botIdx: number;  // vertex index on bottom row
            topIdx: number;  // vertex index on top row
            botPos: number;  // position in bot[] array
            topPos: number;  // position in top[] array
            midU: number;    // average U for sorting
        }

        const classified: ClassifiedConstraint[] = [];
        for (const [v0, v1] of constraints) {
            const cv0 = chainVerts[v0 - gridVCount];
            const cv1 = chainVerts[v1 - gridVCount];
            if (!cv0 || !cv1) continue;

            let bIdx: number, tIdx: number;
            // Determine which is on bottom row, which on top
            const bp0 = vtxBotPos.get(v0);
            const tp0 = vtxTopPos.get(v0);
            const bp1 = vtxBotPos.get(v1);
            const tp1 = vtxTopPos.get(v1);

            if (bp0 !== undefined && tp1 !== undefined) {
                bIdx = v0; tIdx = v1;
            } else if (bp1 !== undefined && tp0 !== undefined) {
                bIdx = v1; tIdx = v0;
            } else {
                continue; // Both on same row or not found — skip
            }

            const bPos = vtxBotPos.get(bIdx);
            const tPos = vtxTopPos.get(tIdx);
            if (bPos === undefined || tPos === undefined) continue;

            classified.push({
                botIdx: bIdx,
                topIdx: tIdx,
                botPos: bPos,
                topPos: tPos,
                midU: (bot[bPos].u + top[tPos].u) / 2
            });
        }

        // Sort constraints by midU (left to right)
        classified.sort((a, b) => a.midU - b.midU);

        // Now triangulate in segments separated by constraints.
        // curBot, curTop track the leftmost un-triangulated position.
        let curBot = 0;
        let curTop = 0;

        for (const con of classified) {
            const targetBot = con.botPos;
            const targetTop = con.topPos;

            // Only sweep forward — if a constraint's endpoint is already
            // behind the cursor (because a previous constraint crossed it),
            // we still need to ensure the constraint edge exists.
            const sweepBotEnd = Math.max(targetBot, curBot);
            const sweepTopEnd = Math.max(targetTop, curTop);

            // Sweep the region from cursor to the further of the two targets
            if (sweepBotEnd > curBot || sweepTopEnd > curTop) {
                sweepRegion(buf, bot, top, curBot, sweepBotEnd, curTop, sweepTopEnd);
            }

            // Now we're at (sweepBotEnd, sweepTopEnd). The constraint edge
            // bot[targetBot]→top[targetTop] should be in the triangulation
            // if the sweep covered both endpoints. But if one endpoint was
            // already behind the cursor, the edge might not be present.
            // In that case, explicitly emit a triangle containing the edge.
            if (targetBot < curBot || targetTop < curTop) {
                // The constraint edge crosses a previously-swept region.
                // We need to check if the edge already exists and if not,
                // emit an explicit triangle. For safety, emit the triangle:
                // Use the nearest available vertex on the other row.
                if (targetBot < curBot && targetTop >= curTop) {
                    // bot endpoint is behind, top endpoint is at cursor or ahead
                    // Create triangle: bot[targetBot], top[targetTop], top[Math.max(targetTop-1, curTop)]
                    // (only if the three vertices are distinct)
                    const anchorTop = targetTop > 0 ? targetTop - 1 : targetTop + 1;
                    if (anchorTop >= 0 && anchorTop < top.length && anchorTop !== targetTop) {
                        buf.push(bot[targetBot].idx, top[targetTop].idx, top[anchorTop].idx);
                    }
                } else if (targetTop < curTop && targetBot >= curBot) {
                    const anchorBot = targetBot > 0 ? targetBot - 1 : targetBot + 1;
                    if (anchorBot >= 0 && anchorBot < bot.length && anchorBot !== targetBot) {
                        buf.push(bot[targetBot].idx, bot[anchorBot].idx, top[targetTop].idx);
                    }
                }
            }

            // Advance cursor to the furthest point
            curBot = Math.max(curBot, targetBot);
            curTop = Math.max(curTop, targetTop);
        }

        // 3. Triangulate the remaining region after the last constraint
        if (curBot < bot.length - 1 || curTop < top.length - 1) {
            sweepRegion(buf, bot, top, curBot, bot.length - 1, curTop, top.length - 1);
        }
    }

    /**
     * Sweep a sub-region of the strip from (botStart..botEnd) × (topStart..topEnd).
     * Standard alternating-advance: at each step, advance whichever pointer
     * has the smaller next-U, creating one triangle per step.
     */
    function sweepRegion(
        buf: number[],
        bot: StripVertex[],
        top: StripVertex[],
        botStart: number, botEnd: number,
        topStart: number, topEnd: number
    ): void {
        let bi = botStart, ti = topStart;
        while (bi < botEnd || ti < topEnd) {
            if (bi >= botEnd) {
                // Only top can advance
                buf.push(bot[bi].idx, top[ti + 1].idx, top[ti].idx);
                ti++;
            } else if (ti >= topEnd) {
                // Only bot can advance
                buf.push(bot[bi].idx, bot[bi + 1].idx, top[ti].idx);
                bi++;
            } else {
                // Both can advance — choose the one with smaller next U
                const nextBotU = bot[bi + 1].u;
                const nextTopU = top[ti + 1].u;
                if (nextBotU <= nextTopU) {
                    buf.push(bot[bi].idx, bot[bi + 1].idx, top[ti].idx);
                    bi++;
                } else {
                    buf.push(bot[bi].idx, top[ti + 1].idx, top[ti].idx);
                    ti++;
                }
            }
        }
    }

    /**
     * Simple strip sweep (no constraints). Equivalent to standard algorithm.
     */
    function simpleSweep(buf: number[], bot: StripVertex[], top: StripVertex[]): void {
        sweepRegion(buf, bot, top, 0, bot.length - 1, 0, top.length - 1);
    }

    const colHasChain = new Uint8Array(cellsPerRow);

    for (let j = 0; j < numT - 1; j++) {
        const botRow = buildMergedRow(j);
        const topRow = buildMergedRow(j + 1);

        // Collect chain edges for this row band
        const bandEdges = rowBandEdges.get(j);
        const bandConstraintEdges: Array<[number, number]> = [];

        colHasChain.fill(0);

        if (bandEdges) {
            for (const [v0, v1] of bandEdges) {
                const cv0 = chainVertices[v0 - gridVertexCount];
                const cv1 = chainVertices[v1 - gridVertexCount];
                if (!cv0 || !cv1) continue;

                bandConstraintEdges.push([v0, v1]);

                // Mark columns as chain-involved (bridge-gap)
                // Clamp to valid cell range [0, cellsPerRow-1]: a vertex
                // at u≈1.0 returns col=numU-1 from bsearchFloor, but the
                // last valid cell is cellsPerRow-1 (between col numU-2 and numU-1).
                const col0raw = bsearchFloor(unionU, cv0.u);
                const col1raw = bsearchFloor(unionU, cv1.u);
                const col0 = col0raw < 0 ? 0 : (col0raw >= cellsPerRow ? cellsPerRow - 1 : col0raw);
                const col1 = col1raw < 0 ? 0 : (col1raw >= cellsPerRow ? cellsPerRow - 1 : col1raw);
                const cMin = Math.min(col0, col1);
                const cMax = Math.max(col0, col1);
                for (let c = cMin; c <= cMax; c++) {
                    colHasChain[c] = 1;
                }
            }
        }

        // Also mark columns that have chain vertices
        for (const sv of botRow) {
            if (sv.isChain) {
                const col = bsearchFloor(unionU, sv.u);
                const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
                colHasChain[gc] = 1;
            }
        }
        for (const sv of topRow) {
            if (sv.isChain) {
                const col = bsearchFloor(unionU, sv.u);
                const gc = col < 0 ? 0 : (col >= cellsPerRow ? cellsPerRow - 1 : col);
                colHasChain[gc] = 1;
            }
        }

        // Process columns
        let i = 0;
        while (i < cellsPerRow) {
            const quadIdx = j * cellsPerRow + i;
            const uLeft = unionU[i];
            const uRight = unionU[i + 1];
            const uSpan = uRight - uLeft;

            // Seam check
            if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
                indexBuf.push(0, 0, 0, 0, 0, 0); // degenerate
                quadMap[quadIdx] = -1;
                seamSkipCount++;
                i++;
                continue;
            }

            if (!colHasChain[i]) {
                // ── Standard cell: 2 triangles (default diagonal) ──
                const bl = j * numU + i;
                const br = j * numU + (i + 1);
                const tl = (j + 1) * numU + i;
                const tr = (j + 1) * numU + (i + 1);

                const triBase = indexBuf.length;
                indexBuf.push(bl, br, tr);
                indexBuf.push(bl, tr, tl);
                quadMap[quadIdx] = triBase;
                i++;
            } else {
                // ── Chain segment: contiguous run of chain-involved columns ──
                const segStart = i;
                while (i < cellsPerRow && colHasChain[i]) {
                    chainCellCount++;
                    quadMap[j * cellsPerRow + i] = -1;
                    i++;
                }
                const segEnd = i;

                const uStripLeft = unionU[segStart];
                const uStripRight = unionU[segEnd];

                // Collect vertices in the strip range
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

                // Filter constraints to those within this strip
                const segConstraints: Array<[number, number]> = [];
                for (const [v0, v1] of bandConstraintEdges) {
                    const cv0 = chainVertices[v0 - gridVertexCount];
                    const cv1 = chainVertices[v1 - gridVertexCount];
                    if (!cv0 || !cv1) continue;
                    const uMin = Math.min(cv0.u, cv1.u);
                    const uMax = Math.max(cv0.u, cv1.u);
                    if (uMax >= uStripLeft - 1e-9 && uMin <= uStripRight + 1e-9) {
                        segConstraints.push([v0, v1]);
                    }
                }

                // v16.19: Constraint-aware triangulation (no post-hoc flips)
                constraintAwareTriangulate(indexBuf, stripBot, stripTop, segConstraints, chainVertices, gridVertexCount);
            }
        }
    }

    // Count cross-cell chain edges (consecutive chain points in different columns)
    for (const [v0, v1] of chainEdges) {
        const cv0 = chainVertices[v0 - gridVertexCount];
        const cv1 = chainVertices[v1 - gridVertexCount];
        if (cv0 && cv1) {
            const col0 = bsearchFloor(unionU, cv0.u);
            const col1 = bsearchFloor(unionU, cv1.u);
            if (col0 !== col1) crossCellEdgeCount++;
        }
    }

    // Convert to Uint32Array
    const indices = new Uint32Array(indexBuf);

    // ── Verify chain edges are actual mesh edges ──
    // Build a set of mesh edges for quick lookup
    const meshEdgeSet = new Set<string>();
    for (let t = 0; t < indexBuf.length; t += 3) {
        const a = indexBuf[t], b = indexBuf[t + 1], c = indexBuf[t + 2];
        // Add all 3 edges (in sorted order for canonical key)
        meshEdgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`);
        meshEdgeSet.add(b < c ? `${b}-${c}` : `${c}-${b}`);
        meshEdgeSet.add(a < c ? `${a}-${c}` : `${c}-${a}`);
    }
    let enforced = 0, missing = 0;
    let missingExamples: string[] = [];
    for (const [v0, v1] of chainEdges) {
        const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
        if (meshEdgeSet.has(key)) {
            enforced++;
        } else {
            missing++;
            if (missingExamples.length < 10) {
                const cv0 = chainVertices[v0 - gridVertexCount];
                const cv1 = chainVertices[v1 - gridVertexCount];
                if (cv0 && cv1) {
                    const col0 = bsearchFloor(unionU, cv0.u);
                    const col1 = bsearchFloor(unionU, cv1.u);
                    missingExamples.push(
                        `  chain${cv0.chainId} pt${cv0.pointIdx}→pt${cv1.pointIdx}: ` +
                        `row${cv0.rowIdx}→${cv1.rowIdx} col${col0}→${col1} ` +
                        `u=${cv0.u.toFixed(6)}→${cv1.u.toFixed(6)} ` +
                        `vidx=${v0}→${v1}`
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
    const triCount = indices.length / 3;
    const realTriCount = triCount - seamSkipCount * 2;
    console.log(`[ParametricExport]   v16.19 Chain-constrained mesh: ${totalVertexCount} verts (${gridVertexCount} grid + ${totalChainPoints} chain [${totalChainPoints - interpolatedCount} real + ${interpolatedCount} interpolated]), ${realTriCount} real tris`);
    console.log(`[ParametricExport]   v16.19 Grid: ${numU}×${numT}, chain cells: ${chainCellCount}/${totalCells} (${(chainCellCount/totalCells*100).toFixed(1)}%)`);    
    console.log(`[ParametricExport]   v16.19 Chain edges: ${chainEdges.length}, cross-cell: ${crossCellEdgeCount}, seam skips: ${seamSkipCount}`);
    console.log(`[ParametricExport]   v16.19 Edge enforcement: ${enforced}/${chainEdges.length} enforced, ${missing} missing`);
    console.log(`[ParametricExport]   v16.19 Build time: ${buildMs.toFixed(1)}ms`);

    return { vertices, indices, quadMap };
}

/**
 * v9.0: Flip triangle diagonals to follow feature curves.
 *
 * In a regular grid, each quad cell is split with a fixed diagonal.
 * When a feature curve crosses a cell diagonally, the default split
 * creates a triangle edge that CROSSES the feature — producing a
 * visible stair-step alias.
 *
 * This function examines each quad cell and flips its diagonal if the
 * alternative diagonal better aligns with the feature direction.
 * The feature direction is determined by comparing the U-coordinates
 * of the vertices (which have been patched to sit on feature curves).
 *
 * Detection criterion:
 *   For cell (col, row) with corners A=(i,j), B=(i+1,j), C=(i,j+1), D=(i+1,j+1):
 *   - Default diagonal: B-C   (connects (i+1,j) to (i,j+1))
 *   - Alternative diagonal: A-D (connects (i,j) to (i+1,j+1))
 *
 *   If the U-displacement between rows suggests the feature runs from
 *   A→D (both rows shifted same direction), flip to A-D diagonal.
 *   If it suggests B→C, keep default.
 *
 *   Specifically: measure how much the U coordinate shifts between rows
 *   at column i and column i+1.  If both shift in the same direction
 *   (feature runs diagonally), flip to follow it.
 *
 * @param indices       Triangle index buffer (modified in-place)
 * @param vertices      Vertex buffer (u, t, surfaceId interleaved)
 * @param w             Grid width (columns per row)
 * @param h             Grid height (number of quad rows = T positions - 1)
 * @param unionU        Original union grid U positions (before patching)
 * @param invertWinding Whether this surface uses inverted winding
 * @returns Number of quads flipped
 */
function flipFeatureAlignedDiagonals(
    indices: Uint32Array,
    vertices: Float32Array,
    w: number,
    h: number,
    unionU: Float32Array,
    invertWinding: boolean
): number {
    let flipCount = 0;
    const MIN_SHIFT = 0.0005; // Minimum U-shift to consider a feature displacement

    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const iNext = (i + 1) % w;

            // Vertex indices in the grid
            const v00 = j * w + i;       // A = (col i, row j)
            const v10 = j * w + iNext;   // B = (col i+1, row j)
            const v01 = (j + 1) * w + i; // C = (col i, row j+1)
            const v11 = (j + 1) * w + iNext; // D = (col i+1, row j+1)

            // Get actual U coordinates (after patching)
            const uA = vertices[v00 * 3];
            const uB = vertices[v10 * 3];
            const uC = vertices[v01 * 3];
            const uD = vertices[v11 * 3];

            // Get template U coordinates (before patching)
            const uTemplateI = unionU[i];
            const uTemplateNext = unionU[iNext];

            // Compute per-column U shifts (how much patching moved each column)
            const shiftI_topRow = uA - uTemplateI;
            const shiftI_botRow = uC - uTemplateI;
            const shiftNext_topRow = uB - uTemplateNext;
            const shiftNext_botRow = uD - uTemplateNext;

            // Determine if there's a coherent diagonal displacement:
            // If column i shifts right in bottom row and column i+1 shifts right in top row
            // (or vice versa), the feature runs diagonally through this cell.
            //
            // More precisely: if the U-displacement between rows changes monotonically
            // across columns, the feature crosses diagonally.

            // Check: does a feature cross this cell?
            // A feature vertex exists if the patched U differs from template U
            const hasFeatureInCell = (
                Math.abs(shiftI_topRow) > MIN_SHIFT ||
                Math.abs(shiftI_botRow) > MIN_SHIFT ||
                Math.abs(shiftNext_topRow) > MIN_SHIFT ||
                Math.abs(shiftNext_botRow) > MIN_SHIFT
            );

            if (!hasFeatureInCell) continue; // No feature here, keep default

            // Determine which diagonal better aligns with the feature direction.
            //
            // Compare diagonal lengths in NORMALIZED UV space (scale T by
            // cell aspect ratio so U and T contribute equally).
            // Without normalization, T-spacing dominates and flips never trigger.

            // Local cell dimensions
            let cellDU = unionU[iNext] - unionU[i];
            if (cellDU < 0) cellDU += 1; // wrap
            const cellDT = Math.abs(vertices[v01 * 3 + 1] - vertices[v00 * 3 + 1]);

            // Normalize: scale T by (cellDU / cellDT) so both axes have similar range
            const tScale = (cellDT > 1e-8) ? (cellDU / cellDT) : 1.0;

            // Default diagonal B-C: length² in normalized UV space
            const duBC = uB - uC;
            const dtBC = (vertices[v10 * 3 + 1] - vertices[v01 * 3 + 1]) * tScale;
            const lenBC2 = duBC * duBC + dtBC * dtBC;

            // Alternative diagonal A-D: length² in normalized UV space
            const duAD = uA - uD;
            const dtAD = (vertices[v00 * 3 + 1] - vertices[v11 * 3 + 1]) * tScale;
            const lenAD2 = duAD * duAD + dtAD * dtAD;

            // Flip if the alternative diagonal is shorter
            // (shorter diagonal = better aspect ratio = more aligned with feature)
            const shouldFlip = lenAD2 < lenBC2 * 0.95; // 5% threshold to avoid unnecessary flips

            if (shouldFlip) {
                // Locate this cell's triangles in the index buffer
                // Each cell at (i, j) has 2 triangles starting at offset (j * w + i) * 6
                const triBase = (j * w + i) * 6;

                if (invertWinding) {
                    // Default inverted: (A,C,B) (B,C,D)
                    // Flipped inverted: (A,C,D) (A,D,B)
                    indices[triBase + 0] = v00; indices[triBase + 1] = v01; indices[triBase + 2] = v11;
                    indices[triBase + 3] = v00; indices[triBase + 4] = v11; indices[triBase + 5] = v10;
                } else {
                    // Default: (A,B,C) (B,D,C)
                    // Flipped: (A,D,C) (A,B,D) — wait, need correct winding
                    // Default: tri0=(A,B,C)=(v00,v10,v01)  tri1=(B,D,C)=(v10,v11,v01)
                    // Flipped: tri0=(A,B,D)=(v00,v10,v11)  tri1=(A,D,C)=(v00,v11,v01)
                    indices[triBase + 0] = v00; indices[triBase + 1] = v10; indices[triBase + 2] = v11;
                    indices[triBase + 3] = v00; indices[triBase + 4] = v11; indices[triBase + 5] = v01;
                }

                flipCount++;
            }
        }
    }

    return flipCount;
}

// ============================================================================
// v10.7 — Wide-Band Ridge-Edge Stitching (insert midpoint vertices along chain paths)
// ============================================================================

/**
 * Phase A (pre-GPU): Collect stitch points along feature chain paths and
 * append new vertices to the vertex buffer for GPU evaluation.
 *
 * THE PROBLEM: Even with correct diagonal flipping, the sawtooth persists
 * because each triangle flanking a ridge edge has only 2 vertices on the
 * ridge and 1 vertex far from it. The off-ridge vertex pulls the triangle's
 * face normal away from the ridge tangent plane, creating visible faceting.
 *
 * THE FIX (v10.7): For each quad that a chain segment passes through, AND
 * for STITCH_BAND_HALF_WIDTH additional quads on each side, insert a new
 * vertex at the quad center. The GPU evaluates these at exact surface
 * positions. Phase B then re-triangulates affected quads as 4-triangle
 * fans from the center vertex.
 *
 * The ridge column's stitch vertex sits at the exact chain UV position.
 * Flanking columns' stitch vertices sit at their quad centers (midpoint of
 * the column's U range and the row's T range), providing proper fan
 * geometry that smooths the transition between ridge crest and flat regions.
 *
 * v10.7 vs v10.5: Stitch band width increased from 2 columns (ridge + left)
 * to (2 × STITCH_BAND_HALF_WIDTH + 1) = 7 columns. Coverage increases
 * from ~3% to ~10% of outer wall quads at 500K triangle budget.
 *
 * @param vertices       Outer wall vertex buffer (u, t, surfaceId interleaved)
 * @param w              Grid width (columns per row)
 * @param h              Grid height (number of quad rows)
 * @param tPositions     T positions for each row
 * @param unionU         Union grid U positions (sorted ascending)
 * @param chains         Linked feature chains from Phase 2.5
 * @param rowMapping     Maps final row index → original row index
 * @returns Extended vertex buffer + map of quadIdx → new vertex index
 */
function prepareStitchVertices(
    vertices: Float32Array,
    w: number,
    h: number,
    tPositions: Float32Array,
    unionU: Float32Array,
    chains: FeatureChain[],
    rowMapping: number[],
    supplementalRowFeatures?: number[][]
): { vertices: Float32Array; stitchMap: Map<number, number> } {
    const cellsPerRow = w - 1;
    const quadRows = h - 1;

    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    // Binary search for nearest column in unionU
    const findColumn = (u: number): number => {
        let lo = 0, hi = w - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (unionU[mid] < u) lo = mid + 1;
            else hi = mid;
        }
        let bestCol = lo;
        let bestDist = Math.abs(unionU[lo] - u);
        if (lo > 0) {
            const d = Math.abs(unionU[lo - 1] - u);
            if (d < bestDist) { bestCol = lo - 1; bestDist = d; }
        }
        const dWrap0 = Math.min(Math.abs(u - unionU[0]), Math.abs(u - unionU[0] - 1), Math.abs(u - unionU[0] + 1));
        if (dWrap0 < bestDist) { bestCol = 0; bestDist = dWrap0; }
        const dWrapN = Math.min(Math.abs(u - unionU[w - 1]), Math.abs(u - unionU[w - 1] - 1), Math.abs(u - unionU[w - 1] + 1));
        if (dWrapN < bestDist) { bestCol = w - 1; }
        return bestCol;
    };

    // Collect stitch points: for each chain segment in each quad row,
    // record the UV position and the quad it belongs to.
    const stitchUV = new Map<number, { u: number; t: number }>();

    for (const chain of chains) {
        if (chain.points.length < 2) continue;

        const remapped: { u: number; finalRow: number }[] = [];
        for (const pt of chain.points) {
            const fr = origToFinal.get(pt.row);
            if (fr !== undefined) {
                remapped.push({ u: pt.u, finalRow: fr });
            }
        }
        if (remapped.length < 2) continue;

        for (let k = 0; k < remapped.length - 1; k++) {
            const p0 = remapped[k];
            const p1 = remapped[k + 1];
            if (p1.finalRow <= p0.finalRow) continue;

            for (let j = p0.finalRow; j < p1.finalRow && j < quadRows; j++) {
                const totalSpan = p1.finalRow - p0.finalRow;
                const fracMid = (j - p0.finalRow + 0.5) / totalSpan;

                let uDelta = p1.u - p0.u;
                if (uDelta > 0.5) uDelta -= 1;
                if (uDelta < -0.5) uDelta += 1;
                let midU = p0.u + uDelta * fracMid;
                midU = ((midU % 1) + 1) % 1;

                const midT = (tPositions[j] + tPositions[j + 1]) / 2;
                const ridgeCol = Math.max(0, Math.min(cellsPerRow - 1, findColumn(midU)));

                // v10.7: Place stitch vertices across a BAND of columns
                // centered on the ridge. The ridge column gets the exact
                // chain UV; flanking columns get their own quad-center UVs.
                // This ensures the transition zone between ridge crest and
                // flat regions has 4-tri fan subdivision for smooth normals.
                for (let band = -STITCH_BAND_HALF_WIDTH; band <= STITCH_BAND_HALF_WIDTH; band++) {
                    const col = ridgeCol + band;
                    if (col < 0 || col >= cellsPerRow) continue;

                    const quadIdx = j * cellsPerRow + col;
                    if (stitchUV.has(quadIdx)) continue; // first-chain-wins

                    if (band === 0) {
                        // Ridge column: exact chain UV
                        stitchUV.set(quadIdx, { u: midU, t: midT });
                    } else {
                        // Flanking column: quad-center UV for proper fan geometry
                        const colNext = col + 1;
                        let colU = unionU[col];
                        let colNextU = unionU[colNext];
                        let centerU = (colU + colNextU) / 2;
                        centerU = Math.max(0, Math.min(1 - 1e-7, centerU));
                        stitchUV.set(quadIdx, { u: centerU, t: midT });
                    }
                }
            }
        }
    }

    // v11.6: Supplemental stitching directly from adjacent-row feature pairs.
    // This bridges visual gaps when chain linker fragments in split/merge zones.
    if (ENABLE_SUPPLEMENTAL_STITCHING && supplementalRowFeatures && supplementalRowFeatures.length >= 2) {
        const pairRadius = Math.max(CHAIN_LINK_RADIUS, 3 / Math.max(1, w));

        for (let j = 0; j < Math.min(quadRows, supplementalRowFeatures.length - 1); j++) {
            const rowA = supplementalRowFeatures[j];
            const rowB = supplementalRowFeatures[j + 1];
            if (rowA.length === 0 || rowB.length === 0) continue;

            // Greedy nearest-neighbor pairing from rowA -> rowB
            const usedB = new Set<number>();
            for (const uA of rowA) {
                let bestIdx = -1;
                let bestDist = Number.POSITIVE_INFINITY;

                for (let b = 0; b < rowB.length; b++) {
                    if (usedB.has(b)) continue;
                    let d = Math.abs(rowB[b] - uA);
                    if (d > 0.5) d = 1 - d;
                    if (d < bestDist) {
                        bestDist = d;
                        bestIdx = b;
                    }
                }

                if (bestIdx < 0 || bestDist > pairRadius) continue;
                usedB.add(bestIdx);

                // Midpoint in circular U space
                let uDelta = rowB[bestIdx] - uA;
                if (uDelta > 0.5) uDelta -= 1;
                if (uDelta < -0.5) uDelta += 1;
                let midU = uA + 0.5 * uDelta;
                midU = ((midU % 1) + 1) % 1;

                const midT = (tPositions[j] + tPositions[j + 1]) / 2;
                const ridgeCol = Math.max(0, Math.min(cellsPerRow - 1, findColumn(midU)));

                for (let band = -STITCH_BAND_HALF_WIDTH; band <= STITCH_BAND_HALF_WIDTH; band++) {
                    const col = ridgeCol + band;
                    if (col < 0 || col >= cellsPerRow) continue;

                    const quadIdx = j * cellsPerRow + col;
                    if (stitchUV.has(quadIdx)) continue; // preserve chain-derived stitch points

                    if (band === 0) {
                        stitchUV.set(quadIdx, { u: midU, t: midT });
                    } else {
                        const colNext = col + 1;
                        const centerU = Math.max(0, Math.min(1 - 1e-7, (unionU[col] + unionU[colNext]) * 0.5));
                        stitchUV.set(quadIdx, { u: centerU, t: midT });
                    }
                }
            }
        }
    }

    if (stitchUV.size === 0) {
        return { vertices, stitchMap: new Map() };
    }

    // Append stitch vertices to vertex buffer
    const origVertCount = vertices.length / 3;
    const newVertices = new Float32Array(vertices.length + stitchUV.size * 3);
    newVertices.set(vertices);

    const stitchMap = new Map<number, number>(); // quadIdx → vertex index
    let nextVert = origVertCount;

    for (const [quadIdx, uv] of stitchUV) {
        const vi = nextVert * 3;
        newVertices[vi] = Math.max(0, Math.min(1 - 1e-7, uv.u));
        newVertices[vi + 1] = uv.t;
        newVertices[vi + 2] = 0; // surfaceId = outer wall
        stitchMap.set(quadIdx, nextVert);
        nextVert++;
    }

    return { vertices: newVertices, stitchMap };
}

/**
 * Phase B (post-flip): Rebuild the index buffer, replacing stitched quads
 * with 4-triangle fans around the ridge vertex.
 *
 * Non-stitched quads keep whatever topology the flip functions gave them.
 * Stitched quads get a center-fan that creates 4 triangles, ensuring the
 * ridge vertex E connects to all 4 quad corners.
 *
 *  A ────── B         A ──── B
 *  │ ╲      │   →     │╲  ╱│
 *  │   ╲    │         │ E  │
 *  │     ╲  │         │╱  ╲│
 *  C ────── D         C ──── D
 *
 * @param indices        Original index buffer (with flipped diagonals)
 * @param w              Grid width
 * @param h              Grid height (quad rows)
 * @param stitchMap      Map of quadIdx → stitch vertex index
 * @param invertWinding  Whether this surface uses inverted winding
 * @returns New index buffer with stitched quads expanded to 4-tri fans
 */
function applyStitchTriangulation(
    indices: Uint32Array,
    w: number,
    h: number,
    stitchMap: Map<number, number>,
    invertWinding: boolean,
    quadMap?: Int32Array
): Uint32Array {
    if (stitchMap.size === 0) return indices;

    const cellsPerRow = w - 1;
    const quadRows = h - 1;

    // New buffer: original quads = 2 tris (6 idx), stitched = 4 tris (12 idx)
    const origTriCount = indices.length / 3;
    const newTriCount = origTriCount + stitchMap.size * 2;
    const newIndices = new Uint32Array(newTriCount * 3);

    let iOut = 0;
    for (let j = 0; j < quadRows; j++) {
        for (let i = 0; i < cellsPerRow; i++) {
            const quadIdx = j * cellsPerRow + i;
            const stitchVert = stitchMap.get(quadIdx);

            if (stitchVert !== undefined) {
                // Fan triangulation from center vertex E
                const vA = j * w + i;
                const vB = j * w + (i + 1);
                const vC = (j + 1) * w + i;
                const vD = (j + 1) * w + (i + 1);
                const vE = stitchVert;

                if (invertWinding) {
                    newIndices[iOut++] = vA; newIndices[iOut++] = vE; newIndices[iOut++] = vB;
                    newIndices[iOut++] = vB; newIndices[iOut++] = vE; newIndices[iOut++] = vD;
                    newIndices[iOut++] = vD; newIndices[iOut++] = vE; newIndices[iOut++] = vC;
                    newIndices[iOut++] = vC; newIndices[iOut++] = vE; newIndices[iOut++] = vA;
                } else {
                    newIndices[iOut++] = vA; newIndices[iOut++] = vB; newIndices[iOut++] = vE;
                    newIndices[iOut++] = vB; newIndices[iOut++] = vD; newIndices[iOut++] = vE;
                    newIndices[iOut++] = vD; newIndices[iOut++] = vC; newIndices[iOut++] = vE;
                    newIndices[iOut++] = vC; newIndices[iOut++] = vA; newIndices[iOut++] = vE;
                }
            } else {
                // Copy original (possibly flipped) triangulation
                const srcBase = quadMap ? (quadMap[quadIdx] >= 0 ? quadMap[quadIdx] : quadIdx * 6) : quadIdx * 6;
                newIndices[iOut++] = indices[srcBase + 0];
                newIndices[iOut++] = indices[srcBase + 1];
                newIndices[iOut++] = indices[srcBase + 2];
                newIndices[iOut++] = indices[srcBase + 3];
                newIndices[iOut++] = indices[srcBase + 4];
                newIndices[iOut++] = indices[srcBase + 5];
            }
        }
    }

    return newIndices;
}

// ============================================================================
// v10.4 — Chain-Directed Ridge Flipping (uses actual chains)
// ============================================================================

/**
 * Walk feature chains and flip quad diagonals so that ridge crests become
 * contiguous edges in the mesh with consistent diagonal orientation.
 *
 * v10.4: Rewritten to use the actual FeatureChain objects from Phase 2.5
 * instead of re-linking features row-by-row. Flips quads along EVERY chain
 * segment (not just column crossings) and also orients flanking quads for
 * smooth normal transitions.
 *
 * For each consecutive pair of chain points, we:
 *   1. Find which column each point maps to in the union grid
 *   2. Determine the chain's local U-direction (tangent)
 *   3. Flip the quad AT the ridge column and its neighbors so diagonals
 *      follow the ridge direction
 *   4. Lock all affected quads from the generic 3D flip
 *
 * @param indices        Triangle index buffer (modified in-place)
 * @param unionU         Union grid U positions (sorted ascending)
 * @param w              Grid width (columns per row)
 * @param h              Grid height (number of quad rows = T positions - 1)
 * @param chains         Linked feature chains from Phase 2.5
 * @param rowMapping     Maps final row index → original row index (negative = inserted)
 * @param invertWinding  Whether this surface uses inverted winding
 * @returns Object with flipCount and a Set of locked quad indices
 */
function chainDirectedFlip(
    indices: Uint32Array,
    unionU: Float32Array,
    w: number,
    h: number,
    chains: FeatureChain[],
    rowMapping: number[],
    invertWinding: boolean,
    quadMap: Int32Array
): { flipCount: number; lockedQuads: Set<number> } {
    let flipCount = 0;
    const lockedQuads = new Set<number>();

    // v11.3: cellsPerRow = w - 1 (non-wrapping grid, no seam cell)
    const cellsPerRow = w - 1;

    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    // Binary search for nearest column in unionU, with circular wrap handling
    const findColumn = (u: number): number => {
        let lo = 0, hi = w - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (unionU[mid] < u) lo = mid + 1;
            else hi = mid;
        }
        let bestCol = lo;
        let bestDist = Math.abs(unionU[lo] - u);
        if (lo > 0) {
            const d = Math.abs(unionU[lo - 1] - u);
            if (d < bestDist) { bestCol = lo - 1; bestDist = d; }
        }
        // Circular wrap checks
        const dWrap0 = Math.min(Math.abs(u - unionU[0]), Math.abs(u - unionU[0] - 1), Math.abs(u - unionU[0] + 1));
        if (dWrap0 < bestDist) { bestCol = 0; bestDist = dWrap0; }
        const dWrapN = Math.min(Math.abs(u - unionU[w - 1]), Math.abs(u - unionU[w - 1] - 1), Math.abs(u - unionU[w - 1] + 1));
        if (dWrapN < bestDist) { bestCol = w - 1; }
        return bestCol;
    };

    // Flip a quad to A-D diagonal (if not already)
    // v11.3: quadIdx is now j * cellsPerRow + quadCol (non-wrapping layout)
    const flipToAD = (quadIdx: number, j: number, quadCol: number): void => {
        // Bounds check: quadCol must be < cellsPerRow (no wrapping)
        if (quadCol >= cellsPerRow || j >= h - 1) return;

        const triBase = quadMap[quadIdx];
        if (triBase < 0) return; // Degenerate/seam cell — skip

        const vA = j * w + quadCol;
        const vB = j * w + (quadCol + 1);
        const vC = (j + 1) * w + quadCol;
        const vD = (j + 1) * w + (quadCol + 1);

        // Check if already A-D (tri0 contains vD)
        if (indices[triBase + 0] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD) {
            return; // Already A-D
        }

        if (invertWinding) {
            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vD;
            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vB;
        } else {
            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vD;
            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
        }
        flipCount++;
    };

    // Flip a quad to B-C diagonal (default, if not already)
    // v11.3: quadIdx is now j * cellsPerRow + quadCol (non-wrapping layout)
    const flipToBC = (quadIdx: number, j: number, quadCol: number): void => {
        // Bounds check: quadCol must be < cellsPerRow (no wrapping)
        if (quadCol >= cellsPerRow || j >= h - 1) return;

        const triBase = quadMap[quadIdx];
        if (triBase < 0) return; // Degenerate/seam cell — skip

        const vA = j * w + quadCol;
        const vB = j * w + (quadCol + 1);
        const vC = (j + 1) * w + quadCol;
        const vD = (j + 1) * w + (quadCol + 1);

        // Check if already B-C (tri0 does NOT contain vD)
        if (!(indices[triBase + 0] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD)) {
            return; // Already B-C
        }

        if (invertWinding) {
            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vB;
            indices[triBase + 3] = vB; indices[triBase + 4] = vC; indices[triBase + 5] = vD;
        } else {
            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vC;
            indices[triBase + 3] = vB; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
        }
        flipCount++;
    };

    // Process each chain
    for (const chain of chains) {
        if (chain.points.length < 2) continue;

        // Remap chain points to final grid rows
        const remapped: { u: number; finalRow: number }[] = [];
        for (const pt of chain.points) {
            const fr = origToFinal.get(pt.row);
            if (fr !== undefined) {
                remapped.push({ u: pt.u, finalRow: fr });
            }
        }
        if (remapped.length < 2) continue;

        // Walk consecutive pairs of remapped chain points
        for (let k = 0; k < remapped.length - 1; k++) {
            const p0 = remapped[k];
            const p1 = remapped[k + 1];

            // Process each final row between p0.finalRow and p1.finalRow
            // (including intermediate rows from T-insertion)
            const rowStart = p0.finalRow;
            const rowEnd = p1.finalRow;
            if (rowEnd <= rowStart) continue; // Skip if not consecutive

            // v14.0: Use the chain's EXACT U for diagonal direction at each row,
            // not interpolated column indices. Column indices create binary
            // stair-steps; exact U gives smooth sub-column direction.
            let uDelta = p1.u - p0.u;
            if (uDelta > 0.5) uDelta -= 1;  // circular wrap
            if (uDelta < -0.5) uDelta += 1;

            for (let j = rowStart; j < rowEnd && j < h - 1; j++) {
                // v14.0: Interpolate the chain's exact U at this row
                const frac = (rowEnd > rowStart) ? (j - rowStart) / (rowEnd - rowStart) : 0;
                let uAtRow = p0.u + uDelta * frac;
                uAtRow = ((uAtRow % 1) + 1) % 1;

                // Find which column the chain occupies at this row
                const ridgeCol = findColumn(uAtRow);

                // v14.0: Compute per-row U direction using interpolated positions
                // at this row and the next row for consistent diagonal orientation.
                const fracNext = (rowEnd > rowStart) ? (j + 1 - rowStart) / (rowEnd - rowStart) : 1;
                let uAtNextRow = p0.u + uDelta * fracNext;
                uAtNextRow = ((uAtNextRow % 1) + 1) % 1;
                let localUDelta = uAtNextRow - uAtRow;
                if (localUDelta > 0.5) localUDelta -= 1;
                if (localUDelta < -0.5) localUDelta += 1;

                const LEAN_THRESHOLD = 0.0001; // ~0.036° — below this, treat as vertical

                // v16.5: Traverse the full stitch band, but only LOCK a narrow core.
                // This preserves chain continuity while allowing surrounding quads to
                // be improved by the generic 3D quality flipper.
                for (let band = -STITCH_BAND_HALF_WIDTH; band <= STITCH_BAND_HALF_WIDTH; band++) {
                    const bandCol = ridgeCol + band;
                    if (bandCol < 0 || bandCol >= cellsPerRow) continue;

                    const bandQuadIdx = j * cellsPerRow + bandCol;
                    const shouldLockBand = Math.abs(band) <= CHAIN_LOCK_BAND_HALF_WIDTH;
                    if (shouldLockBand && lockedQuads.has(bandQuadIdx)) continue;

                    // Only flip the 3 core columns (ridge, left, right).
                    // Outer band columns are left for generic 3D optimization.
                    if (band >= -1 && band <= 1) {
                        if (localUDelta > LEAN_THRESHOLD) {
                            flipToAD(bandQuadIdx, j, bandCol);
                        } else if (localUDelta < -LEAN_THRESHOLD) {
                            flipToBC(bandQuadIdx, j, bandCol);
                        } else {
                            if (j % 2 === 0) {
                                flipToAD(bandQuadIdx, j, bandCol);
                            } else {
                                flipToBC(bandQuadIdx, j, bandCol);
                            }
                        }
                    }
                    if (shouldLockBand) {
                        lockedQuads.add(bandQuadIdx);
                    }
                }

                // v14.0: If ridge column changes between this row and next row,
                // also flip the crossing quad between the two columns
                const nextRidgeCol = findColumn(uAtNextRow);
                if (ridgeCol !== nextRidgeCol) {
                    const crossQuadCol = localUDelta > 0
                        ? Math.min(ridgeCol, nextRidgeCol)
                        : Math.max(ridgeCol, nextRidgeCol) - 1;
                    if (crossQuadCol >= 0 && crossQuadCol < cellsPerRow) {
                        const crossQuadIdx = j * cellsPerRow + crossQuadCol;
                        if (!lockedQuads.has(crossQuadIdx)) {
                            if (localUDelta > 0) {
                                flipToAD(crossQuadIdx, j, crossQuadCol);
                            } else {
                                flipToBC(crossQuadIdx, j, crossQuadCol);
                            }
                            lockedQuads.add(crossQuadIdx);
                        }
                    }
                }
            }
        }
    }

    return { flipCount, lockedQuads };
}

// ============================================================================
// v10.2 — Post-GPU 3D Edge Flipping (with dihedral awareness)
// ============================================================================

/**
 * Flip quad diagonals using actual 3D vertex positions from GPU evaluation.
 *
 * After the GPU evaluates UV→XYZ, we have the true 3D surface positions.
 * For each quad cell on the outer wall, compare the two possible diagonal
 * splits and choose the one that produces triangles whose normals better
 * match the true surface. This is the classic "Delaunay-like" edge flip
 * criterion adapted for surface meshes.
 *
 * v10.3: Respects locked quads from chain-directed pre-flip. Also detects
 * the CURRENT diagonal orientation instead of always assuming default B-C.
 *
 * The criterion: for quad ABCD with two possible splits:
 *   Default:     tri(A,B,C) + tri(B,D,C)   — diagonal B-C
 *   Alternative: tri(A,B,D) + tri(A,D,C)   — diagonal A-D
 *
 * We flip if the alternative diagonal produces a LARGER minimum interior
 * angle (Delaunay criterion) OR if the alternative produces more co-planar
 * triangle normals (valence-based criterion).
 *
 * For surface mesh quality, we use the "max-min angle" criterion:
 * flip if the minimum angle across both triangles improves.
 *
 * @param indices       Triangle index buffer (modified in-place)
 * @param positions3D   3D vertex positions (x,y,z interleaved) from GPU
 * @param w             Grid width (columns per row)
 * @param h             Grid height (total rows, NOT quad rows)
 * @param invertWinding Whether this surface uses inverted winding
 * @param lockedQuads   Set of quad indices locked by chain-directed flip
 * @param quadMap       v11.3: Maps logical quad index → index buffer offset (or -1 for degenerate)
 * @returns Number of quads flipped
 */
function flipEdges3D(
    indices: Uint32Array,
    positions3D: Float32Array,
    w: number,
    h: number,
    invertWinding: boolean,
    lockedQuads?: Set<number>,
    quadMap?: Int32Array
): number {
    let totalFlips = 0;

    // v11.3: cellsPerRow = w - 1 (non-wrapping grid layout)
    const cellsPerRow = w - 1;

    // Helper: compute minimum angle of a triangle given 3D positions
    const minAngle = (ax: number, ay: number, az: number,
                      bx: number, by: number, bz: number,
                      cx: number, cy: number, cz: number): number => {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;

        const lenAB = Math.sqrt(abx * abx + aby * aby + abz * abz);
        const lenAC = Math.sqrt(acx * acx + acy * acy + acz * acz);
        const lenBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);

        if (lenAB < 1e-10 || lenAC < 1e-10 || lenBC < 1e-10) return 0;

        const cosA = (abx * acx + aby * acy + abz * acz) / (lenAB * lenAC);
        const cosB = (-abx * bcx - aby * bcy - abz * bcz) / (lenAB * lenBC);
        const cosC = (-acx * (-bcx) + (-acy) * (-bcy) + (-acz) * (-bcz)) / (lenAC * lenBC);

        const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
        const angB = Math.acos(Math.max(-1, Math.min(1, cosB)));
        const angC = Math.acos(Math.max(-1, Math.min(1, cosC)));

        return Math.min(angA, angB, angC);
    };

    // Helper: compute triangle face normal (unnormalized)
    const faceNormal = (ax: number, ay: number, az: number,
                        bx: number, by: number, bz: number,
                        cx: number, cy: number, cz: number): [number, number, number] => {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        return [
            aby * acz - abz * acy,
            abz * acx - abx * acz,
            abx * acy - aby * acx
        ];
    };

    // Helper: dihedral angle between two triangles sharing an edge.
    // Returns cosine of the angle between their normals (1 = coplanar, -1 = folded).
    const dihedralCos = (n1: [number, number, number], n2: [number, number, number]): number => {
        const len1 = Math.sqrt(n1[0] * n1[0] + n1[1] * n1[1] + n1[2] * n1[2]);
        const len2 = Math.sqrt(n2[0] * n2[0] + n2[1] * n2[1] + n2[2] * n2[2]);
        if (len1 < 1e-15 || len2 < 1e-15) return 1; // degenerate → treat as coplanar
        return (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (len1 * len2);
    };

    // Multi-pass iteration: flipping one diagonal can make a neighbor's
    // flip criterion newly satisfied.  Up to MAX_PASSES, stopping early
    // when a pass produces zero flips (convergence).
    const MAX_PASSES = 5;
    const THRESHOLD_INITIAL = 0.0175;  // ~1° in radians
    const THRESHOLD_CLEANUP = 0.0087;  // ~0.5° in radians

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let passFlips = 0;
        const threshold = pass === 0 ? THRESHOLD_INITIAL : THRESHOLD_CLEANUP;

        for (let j = 0; j < h - 1; j++) {
            for (let i = 0; i < cellsPerRow; i++) {
                // v11.3: quadIdx uses cellsPerRow (non-wrapping layout)
                const quadIdx = j * cellsPerRow + i;

                // Skip quads locked by chain-directed flip
                if (lockedQuads && lockedQuads.has(quadIdx)) continue;

                // v11.3: Use quadMap if available, otherwise fall back to quadIdx * 6
                const triBase = quadMap ? quadMap[quadIdx] : quadIdx * 6;
                if (triBase < 0) continue; // Degenerate/seam cell — skip

                const vA = j * w + i;
                const vB = j * w + (i + 1);
                const vC = (j + 1) * w + i;
                const vD = (j + 1) * w + (i + 1);

                const ax = positions3D[vA * 3], ay = positions3D[vA * 3 + 1], az = positions3D[vA * 3 + 2];
                const bx = positions3D[vB * 3], by = positions3D[vB * 3 + 1], bz = positions3D[vB * 3 + 2];
                const cx = positions3D[vC * 3], cy = positions3D[vC * 3 + 1], cz = positions3D[vC * 3 + 2];
                const dx = positions3D[vD * 3], dy = positions3D[vD * 3 + 1], dz = positions3D[vD * 3 + 2];

                // ── Detect current diagonal orientation ──
                // Read the actual indices to determine which diagonal is present.
                // Default: tri0=(A,B,C) tri1=(B,D,C) → diagonal B-C
                // Flipped: tri0=(A,B,D) tri1=(A,D,C) → diagonal A-D
                const curI0 = indices[triBase + 0];
                const curI1 = indices[triBase + 1];
                const curI2 = indices[triBase + 2];

                // Determine current diagonal: check if any triangle vertex is D
                // In default B-C diagonal: vertices are {A,B,C} and {B,D,C} — D appears in tri1 only
                // In A-D diagonal: vertices are {A,B,D} and {A,D,C} — D appears in both tris
                // Simple check: does tri0 contain vD?
                const tri0HasD = (curI0 === vD || curI1 === vD || curI2 === vD);
                const currentIsAD = tri0HasD; // true = A-D diagonal, false = B-C diagonal

                // Compute quality for BOTH diagonal options (regardless of current state)
                // Option BC: tri(A,B,C) + tri(B,D,C) — diagonal B-C
                const bcMinAng1 = minAngle(ax, ay, az, bx, by, bz, cx, cy, cz);
                const bcMinAng2 = minAngle(bx, by, bz, dx, dy, dz, cx, cy, cz);
                const bcMin = Math.min(bcMinAng1, bcMinAng2);

                // Option AD: tri(A,B,D) + tri(A,D,C) — diagonal A-D
                const adMinAng1 = minAngle(ax, ay, az, bx, by, bz, dx, dy, dz);
                const adMinAng2 = minAngle(ax, ay, az, dx, dy, dz, cx, cy, cz);
                const adMin = Math.min(adMinAng1, adMinAng2);

                // Dihedral for both options
                const bcN1 = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
                const bcN2 = faceNormal(bx, by, bz, dx, dy, dz, cx, cy, cz);
                const bcDihedral = dihedralCos(bcN1, bcN2);

                const adN1 = faceNormal(ax, ay, az, bx, by, bz, dx, dy, dz);
                const adN2 = faceNormal(ax, ay, az, dx, dy, dz, cx, cy, cz);
                const adDihedral = dihedralCos(adN1, adN2);

                // Determine which diagonal is better
                // Compute benefit of switching TO the other diagonal
                let angleBenefit: number;
                let dihedralBenefit: number;
                let targetIsAD: boolean;

                if (currentIsAD) {
                    // Currently A-D, consider switching to B-C
                    angleBenefit = bcMin - adMin;
                    dihedralBenefit = bcDihedral - adDihedral;
                    targetIsAD = false;
                } else {
                    // Currently B-C, consider switching to A-D
                    angleBenefit = adMin - bcMin;
                    dihedralBenefit = adDihedral - bcDihedral;
                    targetIsAD = true;
                }

                // Same combined criterion as v10.2
                const shouldFlip =
                    angleBenefit > threshold ||
                    (dihedralBenefit > 0.05 && angleBenefit > -threshold) ||
                    (angleBenefit > threshold * 0.5 && dihedralBenefit > 0.02);

                if (shouldFlip) {
                    // v10.7: Normal-inversion guard — reject flips that would
                    // invert a triangle normal relative to the current orientation.
                    // This prevents creating triangles that face inward, which
                    // appear as "glitched connections through the inside."
                    let invertionSafe = true;
                    if (targetIsAD) {
                        // Target: tri(A,B,D) + tri(A,D,C)
                        // Current: tri(A,B,C) + tri(B,D,C)
                        const curN = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
                        const newN1 = faceNormal(ax, ay, az, bx, by, bz, dx, dy, dz);
                        const newN2 = faceNormal(ax, ay, az, dx, dy, dz, cx, cy, cz);
                        // Check both new triangles have normals in roughly the same
                        // hemisphere as the current triangle
                        const dot1 = curN[0] * newN1[0] + curN[1] * newN1[1] + curN[2] * newN1[2];
                        const dot2 = curN[0] * newN2[0] + curN[1] * newN2[1] + curN[2] * newN2[2];
                        if (dot1 < 0 || dot2 < 0) invertionSafe = false;
                    } else {
                        // Target: tri(A,B,C) + tri(B,D,C)
                        // Current: tri(A,B,D) + tri(A,D,C)
                        const curN = faceNormal(ax, ay, az, bx, by, bz, dx, dy, dz);
                        const newN1 = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
                        const newN2 = faceNormal(bx, by, bz, dx, dy, dz, cx, cy, cz);
                        const dot1 = curN[0] * newN1[0] + curN[1] * newN1[1] + curN[2] * newN1[2];
                        const dot2 = curN[0] * newN2[0] + curN[1] * newN2[1] + curN[2] * newN2[2];
                        if (dot1 < 0 || dot2 < 0) invertionSafe = false;
                    }

                    if (!invertionSafe) continue; // Skip this flip — would invert normals

                    if (targetIsAD) {
                        // Write A-D diagonal
                        if (invertWinding) {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vD;
                            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vB;
                        } else {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vD;
                            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
                        }
                    } else {
                        // Write B-C diagonal (revert to default)
                        if (invertWinding) {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vB;
                            indices[triBase + 3] = vB; indices[triBase + 4] = vC; indices[triBase + 5] = vD;
                        } else {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vC;
                            indices[triBase + 3] = vB; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
                        }
                    }

                    passFlips++;
                }
            }
        }

        totalFlips += passFlips;
        if (passFlips === 0) break; // Converged
    }

    return totalFlips;
}

// ============================================================================
// Per-Row Feature Tracking (v16.0 — Verified Peak/Valley Detection)
// ============================================================================

/**
 * v16.0: COMPLETELY REWRITTEN peak/valley detection with separate logic for
 * peaks (radius local maxima) and valleys (radius local minima).
 *
 * KEY CHANGES from v10/v13/v15:
 *   1. TYPED features: each detection carries kind (peak/valley), radius,
 *      prominence, and confidence score.
 *   2. SEPARATE peak and valley detection: peaks search for local maxima,
 *      valleys search for local minima. No shared code path that could
 *      confuse the two.
 *   3. VERIFICATION: every candidate is verified by checking that the
 *      refined position is still an extremum of the correct type.
 *      Parabolic fit is checked for consistency (curvature sign must
 *      match the extremum type).
 *   4. CONFIDENCE scoring: based on prominence relative to neighbourhood,
 *      curvature sharpness, and consistency of surrounding gradient.
 *   5. NO inflection points: Strategy 3 is REMOVED. Inflections are not
 *      features — they're curvature sign changes that create noise in the
 *      point cloud without corresponding to visible edges.
 *   6. Strategy 2 (curvature) is REWORKED: only emits a feature if the
 *      curvature peak corresponds to a VERIFIED radius extremum. No more
 *      blind redirection to "nearest extremum within ±3 samples".
 *
 * Detection Pipeline:
 *   1. Compute cylindrical radii from GPU probe data
 *   2. Find all gradient sign changes (candidate extrema)
 *   3. Classify each as peak or valley based on gradient direction
 *   4. Parabolic refinement for sub-sample position
 *   5. VERIFY: check that refined position is consistent with extremum type
 *   6. Compute prominence, confidence, and local radius
 *   7. Apply prominence gate to reject noise
 *   8. Curvature-shoulder detection: find high-curvature points that are
 *      ALSO verified as radius extrema within a 5-sample window
 *   9. Deduplicate, keeping highest-confidence detection at each location
 *
 * @param positions3D   Interleaved [x,y,z, ...] from GPU evaluate
 * @param numSamples    Number of samples (= positions3D.length / 3)
 * @param minProminence Min peak-to-valley radius change (mm) to keep
 * @returns Object with:
 *   - features: FeaturePoint[] (classified, verified)
 *   - uPositions: number[] (sorted U values, backward-compatible)
 *   - rejected: number (candidates that failed verification)
 */
function detectRowFeaturesV16(
    positions3D: Float32Array,
    numSamples: number,
    minProminence: number = 0.005
): { features: FeaturePoint[]; uPositions: number[]; rejected: number } {
    if (numSamples < 7) return { features: [], uPositions: [], rejected: 0 };

    // 1. Cylindrical radius at each sample — GROUND TRUTH from GPU
    const radii = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        const x = positions3D[i * 3];
        const y = positions3D[i * 3 + 1];
        radii[i] = Math.sqrt(x * x + y * y);
    }

    const wrap = (idx: number) => ((idx % numSamples) + numSamples) % numSamples;
    const prominenceWindow = Math.max(5, Math.floor(numSamples * 0.008));

    // Pre-compute 5-point stencil second derivative (sign-preserving)
    // Negative = concave down (peak), Positive = concave up (valley)
    const d2r = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        d2r[i] = (
            -radii[wrap(i - 2)] + 16 * radii[wrap(i - 1)]
            - 30 * radii[i]
            + 16 * radii[wrap(i + 1)] - radii[wrap(i + 2)]
        ) / 12;
    }

    const candidates: FeaturePoint[] = [];
    let rejected = 0;

    // ── Strategy 1: Gradient Sign Changes (True Extrema) ──
    // This is the PRIMARY and most reliable detection strategy.
    // A gradient sign change means dr/du went from positive to negative (peak)
    // or negative to positive (valley).
    for (let i = 0; i < numSamples; i++) {
        const prev = wrap(i - 1);
        const next = wrap(i + 1);
        const dLeft  = radii[i] - radii[prev];
        const dRight = radii[next] - radii[i];

        // Gradient must change sign for this to be an extremum
        if (dLeft * dRight >= 0) continue;

        // Classify: peak (rising then falling) vs valley (falling then rising)
        const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

        // ── Parabolic refinement ──
        // 3-point fit: optimal for smooth peaks, safe for cusps
        const L = radii[prev];
        const C = radii[i];
        const R = radii[next];
        const denom = L - 2 * C + R;
        let delta = 0;
        if (Math.abs(denom) > 1e-14) {
            delta = 0.5 * (L - R) / denom;
            delta = Math.max(-0.5, Math.min(0.5, delta));
        }

        // ── VERIFICATION: parabolic curvature must agree with extremum type ──
        // For a peak: denom (= d²r) must be NEGATIVE (concave down)
        // For a valley: denom (= d²r) must be POSITIVE (concave up)
        // If they disagree, this is likely noise or an inflection, not a real extremum
        const curvatureCorrect = kind === 'peak' ? (denom < 0) : (denom > 0);
        if (!curvatureCorrect && Math.abs(denom) > 1e-10) {
            // Curvature disagrees with extremum type — likely a saddle or noise
            rejected++;
            continue;
        }

        // ── VERIFICATION: the refined position must still be an extremum ──
        // Check that the value at the refined position is indeed a local max/min
        // compared to its immediate neighbours
        const refinedIdx = i + delta;
        const refinedU = ((refinedIdx / numSamples) % 1 + 1) % 1;

        // Interpolate radius at refined position for verification
        const fracIdx = ((refinedIdx % numSamples) + numSamples) % numSamples;
        const iLo = Math.floor(fracIdx);
        const frac = fracIdx - iLo;
        const iHi = wrap(iLo + 1);
        const refinedRadius = radii[iLo] * (1 - frac) + radii[iHi] * frac;

        // Check: is the refined position still an extremum vs its ±1 neighbours?
        const rMinus1 = radii[prev];
        const rPlus1 = radii[next];
        const isStillExtremum = kind === 'peak'
            ? (refinedRadius >= rMinus1 - 1e-10 && refinedRadius >= rPlus1 - 1e-10)
            : (refinedRadius <= rMinus1 + 1e-10 && refinedRadius <= rPlus1 + 1e-10);

        if (!isStillExtremum) {
            rejected++;
            continue;
        }

        // ── Prominence: peak-to-valley range in local window ──
        let localMax = -Infinity, localMin = Infinity;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = wrap(i + k);
            localMax = Math.max(localMax, radii[idx]);
            localMin = Math.min(localMin, radii[idx]);
        }
        const prominence = localMax - localMin;
        if (prominence < minProminence) {
            rejected++;
            continue;
        }

        // ── Confidence scoring ──
        // Higher confidence for: sharp curvature, strong gradient change, isolated peaks
        const gradientStrength = Math.abs(dLeft) + Math.abs(dRight);
        const curvatureStrength = Math.abs(d2r[i]);

        // Compute max gradient and curvature in neighbourhood for normalization
        let maxGrad = 0, maxCurv = 0;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = wrap(i + k);
            const nextIdx = wrap(idx + 1);
            maxGrad = Math.max(maxGrad, Math.abs(radii[nextIdx] - radii[idx]));
            maxCurv = Math.max(maxCurv, Math.abs(d2r[idx]));
        }

        const gradConf = maxGrad > 1e-12 ? Math.min(1, gradientStrength / (2 * maxGrad)) : 0.5;
        const curvConf = maxCurv > 1e-12 ? Math.min(1, curvatureStrength / maxCurv) : 0.5;
        const promConf = Math.min(1, prominence / (minProminence * 5));
        const confidence = 0.4 * gradConf + 0.3 * curvConf + 0.3 * promConf;

        candidates.push({
            u: refinedU,
            kind,
            radius: refinedRadius,
            prominence,
            confidence,
        });
    }

    // ── Strategy 2: Curvature Shoulders (Verified) ──
    // Find positions where |d²r/du²| is high AND the position is a VERIFIED
    // radius extremum (peak or valley) within a tight window.
    // This catches features that Strategy 1 misses when the gradient sign
    // change falls exactly between two samples.
    const absCurv = new Float32Array(numSamples);
    let maxCurvGlobal = 0;
    for (let i = 0; i < numSamples; i++) {
        absCurv[i] = Math.abs(d2r[i]);
        maxCurvGlobal = Math.max(maxCurvGlobal, absCurv[i]);
    }

    if (maxCurvGlobal > 1e-10) {
        const curvThreshold = maxCurvGlobal * 0.20; // top 20% curvature

        for (let i = 0; i < numSamples; i++) {
            // Must be a local maximum of |curvature|
            if (absCurv[i] <= absCurv[wrap(i - 1)] ||
                absCurv[i] <= absCurv[wrap(i + 1)]
            ) continue;
            if (absCurv[i] < curvThreshold) continue;

            // Determine expected extremum type from curvature sign
            // Negative d²r = concave down = PEAK
            // Positive d²r = concave up = VALLEY
            const expectedKind: FeatureKind = d2r[i] < 0 ? 'peak' : 'valley';

            // ── VERIFICATION: Find and verify the actual radius extremum ──
            // Search within ±2 samples for the actual extremum
            let bestIdx = i;
            let bestVal = radii[i];
            for (let k = -2; k <= 2; k++) {
                const idx = wrap(i + k);
                if (expectedKind === 'peak' ? (radii[idx] > bestVal) : (radii[idx] < bestVal)) {
                    bestVal = radii[idx];
                    bestIdx = idx;
                }
            }

            // Verify: the best sample must actually be a local extremum
            const bPrev = radii[wrap(bestIdx - 1)];
            const bNext = radii[wrap(bestIdx + 1)];
            const bCur = radii[bestIdx];
            const isExtremum = expectedKind === 'peak'
                ? (bCur >= bPrev && bCur >= bNext)
                : (bCur <= bPrev && bCur <= bNext);
            if (!isExtremum) {
                rejected++;
                continue;
            }

            // Parabolic refinement at the verified extremum
            const eL = radii[wrap(bestIdx - 1)];
            const eC = radii[bestIdx];
            const eR = radii[wrap(bestIdx + 1)];
            const eDenom = eL - 2 * eC + eR;
            let eDelta = 0;
            if (Math.abs(eDenom) > 1e-14) {
                eDelta = 0.5 * (eL - eR) / eDenom;
                eDelta = Math.max(-0.5, Math.min(0.5, eDelta));
            }

            // Verify curvature sign agrees with expected kind
            if (expectedKind === 'peak' && eDenom > 0) { rejected++; continue; }
            if (expectedKind === 'valley' && eDenom < 0) { rejected++; continue; }

            const curvPeakU = ((bestIdx + eDelta) / numSamples + 1) % 1;

            // Prominence
            let localMax = -Infinity, localMin = Infinity;
            for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
                const idx = wrap(bestIdx + k);
                localMax = Math.max(localMax, radii[idx]);
                localMin = Math.min(localMin, radii[idx]);
            }
            const prominence = localMax - localMin;
            if (prominence < minProminence) { rejected++; continue; }

            // Interpolate radius at refined position
            const fracIdx = ((bestIdx + eDelta) % numSamples + numSamples) % numSamples;
            const iLo = Math.floor(fracIdx);
            const fr = fracIdx - iLo;
            const refinedRadius = radii[iLo] * (1 - fr) + radii[wrap(iLo + 1)] * fr;

            candidates.push({
                u: curvPeakU,
                kind: expectedKind,
                radius: refinedRadius,
                prominence,
                confidence: 0.5 * Math.min(1, absCurv[i] / maxCurvGlobal)
                          + 0.5 * Math.min(1, prominence / (minProminence * 5)),
            });
        }
    }

    // ── Deduplicate: keep highest-confidence feature at each location ──
    candidates.sort((a, b) => a.u - b.u);
    const minSep = 1.5 / numSamples;
    const features: FeaturePoint[] = [];

    for (const cand of candidates) {
        if (features.length === 0) {
            features.push(cand);
            continue;
        }
        const last = features[features.length - 1];
        let gap = cand.u - last.u;
        if (gap < 0) gap += 1;

        if (gap > minSep && (1 - gap) > minSep) {
            // Far enough from any existing feature — add
            features.push(cand);
        } else {
            // Too close: keep the one with higher confidence
            if (cand.confidence > last.confidence) {
                features[features.length - 1] = cand;
            }
            // Otherwise keep the existing one
        }
    }

    // Extract sorted U positions for backward compatibility
    const uPositions = features.map(f => f.u);
    uPositions.sort((a, b) => a - b);

    return { features, uPositions, rejected };
}

/**
 * Backward-compatible wrapper: returns just the U positions.
 * Used by the existing pipeline that expects number[].
 */
function detectRowFeatures(
    positions3D: Float32Array,
    numSamples: number,
    minProminence: number = 0.005
): number[] {
    return detectRowFeaturesV16(positions3D, numSamples, minProminence).uPositions;
}

/**
 * v16.0: Detect features for all rows. Returns per-row U positions (backward
 * compatible) plus typed feature data and total rejection count.
 *
 * @returns Object with:
 *   - allRowFeatures: number[][] (sorted U positions per row)
 *   - allRowTypedFeatures: FeaturePoint[][] (classified features per row)
 *   - totalRejected: number (total candidates that failed verification)
 */
function detectAllRowFeatures(
    rowProbeData: Float32Array[],
    probeSamples: number
): { allRowFeatures: number[][]; allRowTypedFeatures: FeaturePoint[][]; totalRejected: number } {
    const allRowFeatures: number[][] = [];
    const allRowTypedFeatures: FeaturePoint[][] = [];
    let totalRejected = 0;

    for (let j = 0; j < rowProbeData.length; j++) {
        if (rowProbeData[j].length >= probeSamples * 3) {
            const result = detectRowFeaturesV16(rowProbeData[j], probeSamples);
            allRowFeatures.push(result.uPositions);
            allRowTypedFeatures.push(result.features);
            totalRejected += result.rejected;
        } else {
            allRowFeatures.push([]);
            allRowTypedFeatures.push([]);
        }
    }
    return { allRowFeatures, allRowTypedFeatures, totalRejected };
}

// ============================================================================
// v16.0 — Column-Direction Feature Detection (Verified Peak/Valley)
// ============================================================================

/**
 * v16.0: Detect VERIFIED features along a column (T-direction) at a fixed U.
 *
 * Same verification pipeline as detectRowFeaturesV16 but adapted for
 * non-periodic T domain. Every detected feature is classified as peak
 * or valley, verified for consistency, and scored for confidence.
 *
 * @param radiiAlongT   Cylindrical radius at each T sample
 * @param numSamples    Number of T-direction samples
 * @param tPositions    The T values corresponding to each sample
 * @param minProminence Minimum peak-to-valley range to qualify
 * @returns Object with T positions and feature details
 */
function detectColumnFeaturesV16(
    radiiAlongT: Float32Array,
    numSamples: number,
    tPositions: Float32Array | number[],
    minProminence: number = 0.003
): { tPositions: number[]; features: FeaturePoint[]; rejected: number } {
    if (numSamples < 5) return { tPositions: [], features: [], rejected: 0 };

    const prominenceWindow = Math.max(3, Math.floor(numSamples * 0.02));
    const clamp = (idx: number) => Math.max(0, Math.min(numSamples - 1, idx));

    // Pre-compute second derivative (non-periodic)
    const d2r = new Float32Array(numSamples);
    for (let i = 2; i < numSamples - 2; i++) {
        d2r[i] = (
            -radiiAlongT[i - 2] + 16 * radiiAlongT[i - 1]
            - 30 * radiiAlongT[i]
            + 16 * radiiAlongT[i + 1] - radiiAlongT[i + 2]
        ) / 12;
    }
    // Edge: 3-point stencil
    if (numSamples > 2) {
        d2r[1] = radiiAlongT[0] - 2 * radiiAlongT[1] + radiiAlongT[2];
        d2r[numSamples - 2] = radiiAlongT[numSamples - 3] - 2 * radiiAlongT[numSamples - 2] + radiiAlongT[numSamples - 1];
    }

    const candidates: FeaturePoint[] = [];
    let rejected = 0;

    // Helper: interpolate T position from fractional index
    const interpT = (refinedIdx: number): number => {
        const iLo = Math.max(0, Math.min(numSamples - 2, Math.floor(refinedIdx)));
        const iFrac = refinedIdx - iLo;
        const iHi = Math.min(iLo + 1, numSamples - 1);
        return (tPositions[iLo] as number) * (1 - iFrac) + (tPositions[iHi] as number) * iFrac;
    };

    // ── Strategy 1: Gradient sign changes ──
    for (let i = 1; i < numSamples - 1; i++) {
        const dLeft = radiiAlongT[i] - radiiAlongT[i - 1];
        const dRight = radiiAlongT[i + 1] - radiiAlongT[i];

        if (dLeft * dRight >= 0) continue;

        const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

        // Parabolic refinement
        const L = radiiAlongT[i - 1];
        const C = radiiAlongT[i];
        const R = radiiAlongT[i + 1];
        const denom = L - 2 * C + R;
        let delta = 0;
        if (Math.abs(denom) > 1e-14) {
            delta = 0.5 * (L - R) / denom;
            delta = Math.max(-0.5, Math.min(0.5, delta));
        }

        // VERIFY: curvature sign must match extremum type
        const curvatureCorrect = kind === 'peak' ? (denom < 0) : (denom > 0);
        if (!curvatureCorrect && Math.abs(denom) > 1e-10) {
            rejected++;
            continue;
        }

        // VERIFY: refined position still an extremum
        const refinedRadius = C + delta * (R - L) / 2 + delta * delta * denom / 2;
        const isStillExtremum = kind === 'peak'
            ? (refinedRadius >= L - 1e-10 && refinedRadius >= R - 1e-10)
            : (refinedRadius <= L + 1e-10 && refinedRadius <= R + 1e-10);
        if (!isStillExtremum) { rejected++; continue; }

        // Prominence
        let localMax = -Infinity, localMin = Infinity;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = clamp(i + k);
            localMax = Math.max(localMax, radiiAlongT[idx]);
            localMin = Math.min(localMin, radiiAlongT[idx]);
        }
        const prominence = localMax - localMin;
        if (prominence < minProminence) { rejected++; continue; }

        const peakT = interpT(i + delta);

        // Confidence
        const gradStrength = Math.abs(dLeft) + Math.abs(dRight);
        const curvStrength = Math.abs(d2r[i]);
        let maxGrad = 0, maxCurv = 0;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = clamp(i + k);
            const nIdx = clamp(idx + 1);
            maxGrad = Math.max(maxGrad, Math.abs(radiiAlongT[nIdx] - radiiAlongT[idx]));
            maxCurv = Math.max(maxCurv, Math.abs(d2r[idx]));
        }
        const confidence = 0.4 * (maxGrad > 1e-12 ? Math.min(1, gradStrength / (2 * maxGrad)) : 0.5)
            + 0.3 * (maxCurv > 1e-12 ? Math.min(1, curvStrength / maxCurv) : 0.5)
            + 0.3 * Math.min(1, prominence / (minProminence * 5));

        candidates.push({ u: peakT, kind, radius: refinedRadius, prominence, confidence });
    }

    // ── Strategy 2: Curvature shoulders (verified) ──
    const absCurv = new Float32Array(numSamples);
    let maxCurvGlobal = 0;
    for (let i = 0; i < numSamples; i++) {
        absCurv[i] = Math.abs(d2r[i]);
        maxCurvGlobal = Math.max(maxCurvGlobal, absCurv[i]);
    }

    if (maxCurvGlobal > 1e-10) {
        const curvThreshold = maxCurvGlobal * 0.20;
        for (let i = 1; i < numSamples - 1; i++) {
            if (absCurv[i] <= absCurv[clamp(i - 1)] ||
                absCurv[i] <= absCurv[clamp(i + 1)]) continue;
            if (absCurv[i] < curvThreshold) continue;

            const expectedKind: FeatureKind = d2r[i] < 0 ? 'peak' : 'valley';

            // Find and verify the actual extremum within ±2 samples
            let bestIdx = i;
            let bestVal = radiiAlongT[i];
            for (let k = -2; k <= 2; k++) {
                const idx = clamp(i + k);
                if (expectedKind === 'peak' ? (radiiAlongT[idx] > bestVal) : (radiiAlongT[idx] < bestVal)) {
                    bestVal = radiiAlongT[idx];
                    bestIdx = idx;
                }
            }

            // Verify extremum
            if (bestIdx > 0 && bestIdx < numSamples - 1) {
                const bP = radiiAlongT[bestIdx - 1];
                const bC = radiiAlongT[bestIdx];
                const bN = radiiAlongT[bestIdx + 1];
                const isExtremum = expectedKind === 'peak'
                    ? (bC >= bP && bC >= bN)
                    : (bC <= bP && bC <= bN);
                if (!isExtremum) { rejected++; continue; }

                // Verify curvature sign
                const eDenom = bP - 2 * bC + bN;
                if (expectedKind === 'peak' && eDenom > 0) { rejected++; continue; }
                if (expectedKind === 'valley' && eDenom < 0) { rejected++; continue; }

                let eDelta = 0;
                if (Math.abs(eDenom) > 1e-14) {
                    eDelta = 0.5 * (bP - bN) / eDenom;
                    eDelta = Math.max(-0.5, Math.min(0.5, eDelta));
                }

                // Prominence
                let localMax = -Infinity, localMin = Infinity;
                for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
                    const idx = clamp(bestIdx + k);
                    localMax = Math.max(localMax, radiiAlongT[idx]);
                    localMin = Math.min(localMin, radiiAlongT[idx]);
                }
                const prominence = localMax - localMin;
                if (prominence < minProminence) { rejected++; continue; }

                const peakT = interpT(bestIdx + eDelta);
                const refinedRadius = bC + eDelta * (bN - bP) / 2;

                candidates.push({
                    u: peakT, kind: expectedKind, radius: refinedRadius, prominence,
                    confidence: 0.5 * Math.min(1, absCurv[i] / maxCurvGlobal)
                              + 0.5 * Math.min(1, prominence / (minProminence * 5)),
                });
            } else {
                rejected++;
            }
        }
    }

    // Deduplicate by T proximity, keeping highest confidence
    candidates.sort((a, b) => a.u - b.u);
    const tSpacing = numSamples > 1
        ? (Math.abs((tPositions[numSamples - 1] as number) - (tPositions[0] as number)) / (numSamples - 1))
        : 0.01;
    const minSepT = tSpacing * 1.5;
    const features: FeaturePoint[] = [];
    for (const cand of candidates) {
        if (features.length === 0 || cand.u - features[features.length - 1].u > minSepT) {
            features.push(cand);
        } else if (cand.confidence > features[features.length - 1].confidence) {
            features[features.length - 1] = cand;
        }
    }

    const resultT = features.map(f => f.u);
    return { tPositions: resultT, features, rejected };
}

/** Backward-compatible wrapper returning just T positions. */
function detectColumnFeatures(
    radiiAlongT: Float32Array,
    numSamples: number,
    tPositions: Float32Array | number[],
    minProminence: number = 0.003
): number[] {
    return detectColumnFeaturesV16(radiiAlongT, numSamples, tPositions, minProminence).tPositions;
}

/**
 * v16.1: Detect VERIFIED column-direction features and merge into row data.
 *
 * CRITICAL FIX from v16.0: Column detection now SNAPS to the nearest
 * verified peak/valley in the row's 8k U-probe data, instead of placing
 * features at the column's grid U position. This eliminates:
 *   1. "Horizontal lines" in UV debug (points at grid-aligned U positions)
 *   2. Points that miss the actual peak (placed at column U, not peak U)
 *   3. Misclassified peaks/valleys (column features now carry typed data)
 *
 * Algorithm:
 *   1. For each U column, extract T-direction radius profile from row data
 *   2. Detect T-direction extrema using verified pipeline
 *   3. For each detected T-feature, find the closest row
 *   4. In that row's 8k U-probe data, search for the nearest VERIFIED
 *      radius extremum within a tight U window around the column position
 *   5. Only add the feature if a verified extremum is found — at the
 *      EXACT peak U position from the 8k data, not the column grid U
 *
 * @param rowProbeData       Per-row GPU probe results (8k samples each)
 * @param probeSamples       Number of U samples per row (8192)
 * @param tPositions         T values for each row
 * @param numColProbes       Number of U columns to probe
 * @param allRowFeatures     Existing per-row feature U positions (MUTATED)
 * @param allRowTypedFeatures Existing per-row typed features (MUTATED)
 * @returns Object with addedCount and rejectedCount
 */
function detectAndMergeColumnFeatures(
    rowProbeData: Float32Array[],
    probeSamples: number,
    tPositions: Float32Array,
    numColProbes: number,
    allRowFeatures: number[][],
    allRowTypedFeatures: FeaturePoint[][]
): { addedCount: number; rejectedCount: number } {
    const numRows = rowProbeData.length;
    if (numRows < 5 || probeSamples < 16) return { addedCount: 0, rejectedCount: 0 };

    let addedCount = 0;
    let rejectedCount = 0;
    const colStep = Math.max(1, Math.floor(probeSamples / numColProbes));

    // v16.1: Search window in the row's U-probe data to find the actual peak.
    // ±SNAP_WINDOW samples around the column position. At 8192 samples,
    // ±16 samples = ±0.002 U, which is ~0.7° — tight enough to avoid
    // snapping to a different feature.
    const SNAP_WINDOW = 16;
    const MIN_SEP = 1.5 / probeSamples;

    for (let ci = 0; ci < probeSamples; ci += colStep) {
        const uPos = ci / probeSamples;

        // Extract radius profile along T at this U position
        const radiiAlongT = new Float32Array(numRows);
        for (let j = 0; j < numRows; j++) {
            const x = rowProbeData[j][ci * 3];
            const y = rowProbeData[j][ci * 3 + 1];
            radiiAlongT[j] = Math.sqrt(x * x + y * y);
        }

        // v16.0: Use verified detection — only genuine peaks/valleys pass
        const colResult = detectColumnFeaturesV16(radiiAlongT, numRows, tPositions);
        rejectedCount += colResult.rejected;

        // For each verified T-direction feature, snap to nearest U-peak in the row
        for (const feat of colResult.features) {
            // Find the row closest to this T position
            let bestRow = 0;
            let bestDist = Math.abs(tPositions[0] - feat.u);
            for (let j = 1; j < numRows; j++) {
                const d = Math.abs(tPositions[j] - feat.u);
                if (d < bestDist) {
                    bestDist = d;
                    bestRow = j;
                }
            }

            // v16.1: Search for a VERIFIED radius extremum in the row's 8k data
            // near the column position. This gives us the EXACT peak U at 8k resolution.
            const rowData = rowProbeData[bestRow];
            const wrap = (idx: number) => ((idx % probeSamples) + probeSamples) % probeSamples;

            // Compute radii in the search window
            const lo = ci - SNAP_WINDOW;
            const hi = ci + SNAP_WINDOW;

            // Find the best extremum (matching the column feature's kind) in the window
            let foundPeakU = -1;
            let foundKind: FeatureKind = feat.kind; // Inherit T-direction classification as hint
            let foundRadius = 0;
            let foundProminence = 0;
            let foundConfidence = 0;

            // Scan for gradient sign changes in the window — actual U-peaks/valleys
            for (let si = lo + 1; si < hi; si++) {
                const i = wrap(si);
                const prev = wrap(si - 1);
                const next = wrap(si + 1);

                const x_i = rowData[i * 3], y_i = rowData[i * 3 + 1];
                const x_p = rowData[prev * 3], y_p = rowData[prev * 3 + 1];
                const x_n = rowData[next * 3], y_n = rowData[next * 3 + 1];
                const r_i = Math.sqrt(x_i * x_i + y_i * y_i);
                const r_p = Math.sqrt(x_p * x_p + y_p * y_p);
                const r_n = Math.sqrt(x_n * x_n + y_n * y_n);

                const dLeft = r_i - r_p;
                const dRight = r_n - r_i;
                if (dLeft * dRight >= 0) continue; // Not an extremum

                const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

                // Parabolic refinement
                const denom = r_p - 2 * r_i + r_n;
                let delta = 0;
                if (Math.abs(denom) > 1e-14) {
                    delta = 0.5 * (r_p - r_n) / denom;
                    delta = Math.max(-0.5, Math.min(0.5, delta));
                }

                // Verify curvature sign
                const curvOk = kind === 'peak' ? (denom < 0) : (denom > 0);
                if (!curvOk && Math.abs(denom) > 1e-10) continue;

                // Verify refined position is still extremum
                const fracIdx = ((si + delta) % probeSamples + probeSamples) % probeSamples;
                const iLo = Math.floor(fracIdx);
                const frac = fracIdx - iLo;
                const iHi = wrap(iLo + 1);
                const x_lo = rowData[iLo * 3], y_lo = rowData[iLo * 3 + 1];
                const x_hi = rowData[iHi * 3], y_hi = rowData[iHi * 3 + 1];
                const r_refined = Math.sqrt(
                    (x_lo * (1 - frac) + x_hi * frac) ** 2 +
                    (y_lo * (1 - frac) + y_hi * frac) ** 2
                );

                const isStillExtremum = kind === 'peak'
                    ? (r_refined >= r_p - 1e-10 && r_refined >= r_n - 1e-10)
                    : (r_refined <= r_p + 1e-10 && r_refined <= r_n + 1e-10);
                if (!isStillExtremum) continue;

                // Prominence in local window
                const promWin = Math.max(5, Math.floor(probeSamples * 0.008));
                let localMax = -Infinity, localMin = Infinity;
                for (let k = -promWin; k <= promWin; k++) {
                    const idx = wrap(si + k);
                    const xk = rowData[idx * 3], yk = rowData[idx * 3 + 1];
                    const rk = Math.sqrt(xk * xk + yk * yk);
                    localMax = Math.max(localMax, rk);
                    localMin = Math.min(localMin, rk);
                }
                const prominence = localMax - localMin;
                if (prominence < 0.005) continue; // Same threshold as row detection

                const peakU = (((si + delta) / probeSamples) % 1 + 1) % 1;

                // Pick the closest verified extremum to the column position
                const distToCol = Math.min(
                    Math.abs(peakU - uPos),
                    Math.abs(peakU - uPos + 1),
                    Math.abs(peakU - uPos - 1)
                );

                if (foundPeakU < 0 || distToCol < Math.min(
                    Math.abs(foundPeakU - uPos),
                    Math.abs(foundPeakU - uPos + 1),
                    Math.abs(foundPeakU - uPos - 1)
                )) {
                    foundPeakU = peakU;
                    foundKind = kind;
                    foundRadius = r_refined;
                    foundProminence = prominence;
                    // Confidence: based on gradient strength and prominence
                    const gradStrength = Math.abs(dLeft) + Math.abs(dRight);
                    foundConfidence = 0.5 * Math.min(1, gradStrength * probeSamples)
                                   + 0.5 * Math.min(1, prominence / 0.025);
                }
            }

            // If no verified extremum found in the U-window, skip this column feature
            if (foundPeakU < 0) {
                rejectedCount++;
                continue;
            }

            // Dedup: don't add if an existing row feature is too close
            const existingFeats = allRowFeatures[bestRow];
            let isDuplicate = false;
            for (const ef of existingFeats) {
                if (circularDistance(ef, foundPeakU) < MIN_SEP) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                allRowFeatures[bestRow].push(foundPeakU);
                allRowFeatures[bestRow].sort((a, b) => a - b);

                // v16.1: Also add typed feature data for correct peak/valley visualization
                if (bestRow < allRowTypedFeatures.length) {
                    allRowTypedFeatures[bestRow].push({
                        u: foundPeakU,
                        kind: foundKind,
                        radius: foundRadius,
                        prominence: foundProminence,
                        confidence: foundConfidence,
                    });
                }
                addedCount++;
            }
        }
    }

    return { addedCount, rejectedCount };
}

// ============================================================================
// v10.0 — Feature Chain Linking
// ============================================================================

/** A single point on a feature chain: (u, rowIndex) */
interface ChainPoint {
    u: number;
    row: number;
}

/** A feature chain is a polyline through (u, t) space.
 *  Each chain connects features across adjacent rows. */
interface FeatureChain {
    points: ChainPoint[];
}

function circularDistance(u0: number, u1: number): number {
    let d = Math.abs(u0 - u1);
    if (d > 0.5) d = 1 - d;
    return d;
}

function circularSignedDelta(fromU: number, toU: number): number {
    let d = toU - fromU;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return d;
}

function liftUToReference(uWrapped: number, referenceUnwrapped: number): number {
    const base = uWrapped;
    const k = Math.round(referenceUnwrapped - base);
    return base + k;
}

function unwrapChain(chain: FeatureChain): number[] {
    if (chain.points.length === 0) return [];
    const unwrapped = new Array<number>(chain.points.length);
    unwrapped[0] = chain.points[0].u;
    for (let i = 1; i < chain.points.length; i++) {
        let du = chain.points[i].u - chain.points[i - 1].u;
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
        unwrapped[i] = unwrapped[i - 1] + du;
    }
    return unwrapped;
}

function chainRoughness(chain: FeatureChain): number {
    if (chain.points.length < 3) return 0;
    const u = unwrapChain(chain);
    let acc = 0;
    for (let i = 1; i < u.length - 1; i++) {
        acc += Math.abs(u[i - 1] - 2 * u[i] + u[i + 1]);
    }
    return acc / Math.max(1, u.length - 2);
}

/**
 * Remove near-parallel duplicate chains that track the same ridge.
 * Keeps the smoother/longer representative chain.
 */
function suppressDuplicateChains(chains: FeatureChain[]): FeatureChain[] {
    const DROP_DISTANCE = 0.0012;
    const MIN_SHARED_ROWS = 25;
    const dropped = new Set<number>();
    const rowMaps = chains.map((chain) => {
        const m = new Map<number, number>();
        for (const p of chain.points) m.set(p.row, p.u);
        return m;
    });
    const roughness = chains.map(chainRoughness);

    for (let i = 0; i < chains.length; i++) {
        if (dropped.has(i)) continue;
        for (let j = i + 1; j < chains.length; j++) {
            if (dropped.has(j)) continue;
            const a = chains[i];
            const b = chains[j];
            const minSharedByLength = Math.floor(Math.min(a.points.length, b.points.length) * 0.85);
            const sharedRows: number[] = [];
            for (const p of a.points) {
                if (rowMaps[j].has(p.row)) sharedRows.push(p.row);
            }
            if (sharedRows.length < Math.max(MIN_SHARED_ROWS, minSharedByLength)) continue;

            let sum = 0;
            let maxD = 0;
            for (const row of sharedRows) {
                const d = circularDistance(rowMaps[i].get(row) ?? 0, rowMaps[j].get(row) ?? 0);
                sum += d;
                if (d > maxD) maxD = d;
            }
            const meanD = sum / sharedRows.length;
            if (meanD > DROP_DISTANCE || maxD > DROP_DISTANCE * 2.2) continue;

            const scoreI = roughness[i] + (1 / Math.max(1, a.points.length));
            const scoreJ = roughness[j] + (1 / Math.max(1, b.points.length));
            if (scoreI <= scoreJ) dropped.add(j);
            else dropped.add(i);
        }
    }

    return chains.filter((_, idx) => !dropped.has(idx));
}

/**
 * v13.0: Re-snap each chain point to its nearest measured peak in that row.
 *
 * After chain linking, a chain point might have been assigned to a nearby
 * but not-exactly-matching peak (due to linking radius tolerance). This
 * pass ensures each point sits at the EXACT measured peak position from
 * detectRowFeatures, with zero approximation or smoothing.
 *
 * For each chain point, find the nearest feature in allRowFeatures[row]
 * and snap to it. If no feature is within snap radius, keep the original.
 */
function resnapChainToMeasuredPeaks(
    chain: FeatureChain,
    allRowFeatures: number[][]
): FeatureChain {
    const SNAP_RADIUS = 0.005; // Max u-distance for snapping
    const points: ChainPoint[] = chain.points.map((p) => {
        const rowFeats = (p.row >= 0 && p.row < allRowFeatures.length)
            ? allRowFeatures[p.row]
            : [];
        if (rowFeats.length === 0) return p;

        // Find nearest measured peak
        let bestU = p.u;
        let bestD = SNAP_RADIUS;
        for (const u of rowFeats) {
            const d = circularDistance(p.u, u);
            if (d < bestD) {
                bestD = d;
                bestU = u;
            }
        }
        return { row: p.row, u: bestU };
    });
    return { points };
}

/**
 * v13.0: Post-process feature chains.
 *
 * Pipeline:
 *   1. Suppress duplicate chains (same ridge tracked by two chains)
 *   2. Re-snap every point to the nearest measured peak (zero drift)
 *
 * NO smoothing. NO DP "optimization". These destroy measured accuracy
 * by moving peaks ±0.002 to ±0.008 away from their true positions.
 * The detected peaks from GPU probe data ARE the ground truth.
 */
function postProcessFeatureChains(chains: FeatureChain[], allRowFeatures: number[][]): FeatureChain[] {
    const deduped = suppressDuplicateChains(chains);
    return deduped.map((chain) => resnapChainToMeasuredPeaks(chain, allRowFeatures));
}

/**
 * Maximum circular U-distance to link a feature in row j to a feature in row j+1.
 * Features farther apart than this are considered unrelated.
 * Larger values follow diagonal/spiral features; too large risks false connections.
 */
const CHAIN_LINK_RADIUS = 0.04;

/**
 * Link per-row feature detections across adjacent rows into continuous chains.
 *
 * Features are arbitrary and unique to each style — they can run at ANY angle:
 * vertical, diagonal, curved, spiral. This function uses greedy nearest-neighbor
 * linking to build polylines through (u, rowIndex) space.
 *
 * Algorithm:
 *   1. For each consecutive pair of rows (j, j+1), find the best matching
 *      between features in row j and features in row j+1 using circular
 *      U-distance. Matches must be within CHAIN_LINK_RADIUS.
 *   2. Build chains by connecting matched features across rows.
 *      Each chain is a sequence of (u, row) points.
 *   3. Unmatched features start new chains.
 *   4. Chains shorter than 2 points are discarded (noise).
 *
 * @param allRowFeatures  Per-row detected feature U positions
 * @param numRows         Total number of T rows
 * @returns Array of FeatureChains
 */
function linkFeatureChainsCore(
    allRowFeatures: number[][],
    numRows: number,
    linkRadius: number,
    maxMissCount: number,
    momentumScale: number
): FeatureChain[] {
    // Active chains: chains being extended from the previous row
    // v10.6: Added missCount to support momentum-based gap bridging
    interface ActiveChain {
        chain: FeatureChain;
        missCount: number;        // consecutive rows without a match
        predictedU: number;       // extrapolated U for next row
    }
    let activeChains: ActiveChain[] = [];
    // Completed chains: chains that ended (no match in the next row)
    const completedChains: FeatureChain[] = [];

    // v10.8: Maximum consecutive misses before closing a chain.
    // Raised from 3 to 6 to bridge the m-transition zone where features
    // split/merge over 5-8 rows as m interpolates (e.g., m=6→10).
    // With momentum prediction, the search stays focused even across gaps.
    const MAX_MISS_COUNT = maxMissCount;

    // v10.6: Wider search radius when using momentum (2× normal)
    const MOMENTUM_LINK_RADIUS = linkRadius * momentumScale;

    for (let j = 0; j < numRows; j++) {
        const rowFeats = allRowFeatures[j];
        if (rowFeats.length === 0) {
            // No features in this row — increment miss count on all active chains
            const newActive: ActiveChain[] = [];
            for (const ac of activeChains) {
                ac.missCount++;
                if (ac.missCount > MAX_MISS_COUNT) {
                    if (ac.chain.points.length >= 2) completedChains.push(ac.chain);
                } else {
                    // Keep chain alive with momentum (predicted U stays the same)
                    newActive.push(ac);
                }
            }
            activeChains = newActive;
            continue;
        }

        // v10.8: OPTIMAL global matching replaces greedy per-chain matching.
        // Build all valid (chain, feature) pairs sorted by distance, then
        // assign closest-first. Longer chains get priority via a small
        // distance bonus. This prevents short chains from stealing features
        // that belong to longer, more important chains.
        const usedFeats = new Set<number>(); // indices in rowFeats already matched
        const usedChains = new Set<number>(); // indices in activeChains already matched
        const newActive: ActiveChain[] = [];

        // Build all candidate pairs: (chainIdx, featIdx, distance)
        interface MatchCandidate {
            chainIdx: number;
            featIdx: number;
            dist: number;
        }
        const candidates: MatchCandidate[] = [];

        for (let ci = 0; ci < activeChains.length; ci++) {
            const ac = activeChains[ci];
            const matchU = ac.missCount > 0 ? ac.predictedU : ac.chain.points[ac.chain.points.length - 1].u;
            const searchRadius = ac.missCount > 0 ? MOMENTUM_LINK_RADIUS : linkRadius;

            for (let f = 0; f < rowFeats.length; f++) {
                let d = Math.abs(rowFeats[f] - matchU);
                if (d > 0.5) d = 1 - d; // circular wrap
                if (d < searchRadius) {
                    // Priority bonus: longer chains get slightly lower effective distance
                    // so they win ties against shorter chains. The bonus is capped at
                    // 10% of search radius to avoid distorting true spatial proximity.
                    const lengthBonus = Math.min(
                        ac.chain.points.length * 0.0001,
                        searchRadius * 0.1
                    );
                    candidates.push({ chainIdx: ci, featIdx: f, dist: d - lengthBonus });
                }
            }
        }

        // Sort by distance (ascending) — closest pairs matched first
        candidates.sort((a, b) => a.dist - b.dist);

        // Assign: each chain and feature can only be used once
        for (const cand of candidates) {
            if (usedChains.has(cand.chainIdx) || usedFeats.has(cand.featIdx)) continue;

            const ac = activeChains[cand.chainIdx];
            ac.chain.points.push({ u: rowFeats[cand.featIdx], row: j });
            usedFeats.add(cand.featIdx);
            usedChains.add(cand.chainIdx);

            // Compute predicted U for next row using chain velocity
            const pts = ac.chain.points;
            if (pts.length >= 2) {
                const last = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                const rowSpan = last.row - prev.row;
                if (rowSpan > 0) {
                    let uVel = (last.u - prev.u) / rowSpan;
                    if (uVel > 0.5) uVel -= 1;
                    if (uVel < -0.5) uVel += 1;
                    ac.predictedU = ((last.u + uVel) % 1 + 1) % 1;
                } else {
                    ac.predictedU = last.u;
                }
            } else {
                ac.predictedU = rowFeats[cand.featIdx];
            }

            ac.missCount = 0;
            newActive.push(ac);
        }

        // Unmatched chains — increment miss count
        for (let ci = 0; ci < activeChains.length; ci++) {
            if (usedChains.has(ci)) continue;
            const ac = activeChains[ci];
            ac.missCount++;
            if (ac.missCount > MAX_MISS_COUNT) {
                if (ac.chain.points.length >= 2) completedChains.push(ac.chain);
            } else {
                newActive.push(ac);
            }
        }

        // Unmatched features start new chains
        for (let f = 0; f < rowFeats.length; f++) {
            if (!usedFeats.has(f)) {
                newActive.push({
                    chain: { points: [{ u: rowFeats[f], row: j }] },
                    missCount: 0,
                    predictedU: rowFeats[f],
                });
            }
        }

        activeChains = newActive;
    }

    // Close remaining active chains
    for (const ac of activeChains) {
        if (ac.chain.points.length >= 2) completedChains.push(ac.chain);
    }

    return completedChains;
}

function linkFeatureChains(
    allRowFeatures: number[][],
    numRows: number
): FeatureChain[] {
    // Primary pass: long, stable chains.
    const primary = linkFeatureChainsCore(
        allRowFeatures,
        numRows,
        CHAIN_LINK_RADIUS,
        6,
        2.0
    );

    // Secondary pass: recover missed/broken edge segments from unmatched features.
    // This adds coverage where split/merge or ambiguity caused chain breaks.
    const usedByRow: Array<boolean[]> = allRowFeatures.map((row) => new Array<boolean>(row.length).fill(false));
    const USE_EPS = 0.0015;

    for (const chain of primary) {
        for (const pt of chain.points) {
            const row = pt.row;
            if (row < 0 || row >= allRowFeatures.length) continue;
            const feats = allRowFeatures[row];
            for (let i = 0; i < feats.length; i++) {
                if (usedByRow[row][i]) continue;
                if (circularDistance(feats[i], pt.u) <= USE_EPS) {
                    usedByRow[row][i] = true;
                    break;
                }
            }
        }
    }

    const residual: number[][] = allRowFeatures.map((row, r) =>
        row.filter((_, i) => !usedByRow[r][i])
    );

    const secondary = linkFeatureChainsCore(
        residual,
        numRows,
        CHAIN_LINK_RADIUS * 0.7,
        2,
        1.25
    );

    return postProcessFeatureChains([...primary, ...secondary], allRowFeatures);
}

/**
 * v16.3: Link features into chains SEPARATELY by kind (peak vs valley).
 *
 * Previous versions mixed peaks and valleys in allRowFeatures before chain
 * linking. The chain linker connects features by U-proximity across rows,
 * so peaks and valleys at similar U positions competed with each other.
 * A row with 1 peak at U=0.17 and 1 valley at U=0.50 would have the peak
 * absorbed into the dominant chain, while the valley (only present in ~50%
 * of rows) would fail to form a chain due to too many gaps.
 *
 * v16.3 separates peaks and valleys before linking:
 *   - Peak features → linked independently → peak chains
 *   - Valley features → linked independently → valley chains
 *   - Both chain types get full mesh treatment (patching, stitch, flip)
 *
 * This typically DOUBLES the number of chains and gives valleys proper
 * mesh edge treatment, eliminating the "uneven edges with gaps" artifact
 * where valley boundaries had random triangle crossings.
 *
 * @param allRowFeatures      Per-row U positions of ALL features (mixed)
 * @param allRowTypedFeatures  Per-row classified features with kind info
 * @param numRows             Total number of T rows
 * @returns Combined array of peak chains and valley chains
 */
function linkFeatureChainsByKind(
    allRowFeatures: number[][],
    allRowTypedFeatures: FeaturePoint[][],
    numRows: number
): FeatureChain[] {
    // Split features by kind into separate per-row arrays
    const peakRows: number[][] = [];
    const valleyRows: number[][] = [];

    for (let j = 0; j < numRows; j++) {
        const peaks: number[] = [];
        const valleys: number[] = [];

        if (j < allRowTypedFeatures.length) {
            const typed = allRowTypedFeatures[j];
            const untyped = j < allRowFeatures.length ? allRowFeatures[j] : [];

            // Match each U position in allRowFeatures to its typed classification.
            // allRowFeatures[j] contains U positions; allRowTypedFeatures[j] has
            // FeaturePoint objects with .u and .kind for the same row.
            for (const u of untyped) {
                const match = typed.find(t => Math.abs(t.u - u) < 1e-6);
                if (match) {
                    if (match.kind === 'peak') peaks.push(u);
                    else valleys.push(u);
                } else {
                    // No typed match — default to peak (conservative)
                    peaks.push(u);
                }
            }
        } else if (j < allRowFeatures.length) {
            // No typed data for this row — all features default to peak
            peaks.push(...allRowFeatures[j]);
        }

        peakRows.push(peaks);
        valleyRows.push(valleys);
    }

    // Link peak features into chains
    const peakChains = linkFeatureChains(peakRows, numRows);

    // Link valley features into chains
    const valleyChains = linkFeatureChains(valleyRows, numRows);

    // Post-process against the FULL feature array (both peaks and valleys)
    // to ensure re-snap uses the complete ground truth
    const combined = [...peakChains, ...valleyChains];

    const peakTotal = peakRows.reduce((s, r) => s + r.length, 0);
    const valleyTotal = valleyRows.reduce((s, r) => s + r.length, 0);
    const peakChainPts = peakChains.reduce((s, c) => s + c.points.length, 0);
    const valleyChainPts = valleyChains.reduce((s, c) => s + c.points.length, 0);

    console.log(`[ParametricExport]   v16.3 kind-separated linking:`);
    console.log(`[ParametricExport]     Peaks: ${peakTotal} features → ${peakChains.length} chains (${peakChainPts} points)`);
    console.log(`[ParametricExport]     Valleys: ${valleyTotal} features → ${valleyChains.length} chains (${valleyChainPts} points)`);

    return combined;
}

/**
 * Insert additional T-rows where feature chains cross between grid rows.
 *
 * When a chain segment spans two rows (j to j+1) and the U-shift is
 * significant, the feature is running diagonally through the quad band.
 * Insert an extra row at the midpoint T to give the mesh a vertex ON
 * the feature curve between the two original rows.
 *
 * This is chain-guided subdivision: rows are only added where features
 * actually need them, not uniformly.
 *
 * @param tPositions    Original T positions (sorted ascending)
 * @param chains        Feature chains linking per-row detections
 * @param maxInsertions Maximum number of T-rows to insert (budget guard)
 * @returns New T positions array with inserted rows, plus a mapping from
 *          new row indices to original row indices (for feature propagation)
 */
function insertChainGuidedRows(
    tPositions: Float32Array,
    chains: FeatureChain[],
    maxInsertions: number = 200,
    minUShiftForInsert: number = 0.005
): { tPositions: Float32Array; rowMapping: number[]; insertedCount: number } {
    // Collect all (tMid, priority) pairs where chains cross row boundaries significantly
    const MIN_U_SHIFT_FOR_INSERT = minUShiftForInsert; // Minimum diagonal U-shift to warrant a new row
    const candidates: { tMid: number; priority: number }[] = [];

    for (const chain of chains) {
        for (let k = 0; k < chain.points.length - 1; k++) {
            const p0 = chain.points[k];
            const p1 = chain.points[k + 1];
            if (p1.row - p0.row !== 1) continue; // Only consecutive rows

            let uShift = Math.abs(p1.u - p0.u);
            if (uShift > 0.5) uShift = 1 - uShift; // Circular

            if (uShift >= MIN_U_SHIFT_FOR_INSERT) {
                const rowJ = p0.row;
                if (rowJ < tPositions.length - 1) {
                    const tMid = (tPositions[rowJ] + tPositions[rowJ + 1]) / 2;
                    candidates.push({ tMid, priority: uShift });
                }
            }
        }
    }

    if (candidates.length === 0) {
        // No insertions needed — build identity mapping
        const rowMapping: number[] = [];
        for (let j = 0; j < tPositions.length; j++) rowMapping.push(j);
        return { tPositions, rowMapping, insertedCount: 0 };
    }

    // Sort by priority (largest U-shift first) and limit
    candidates.sort((a, b) => b.priority - a.priority);
    const toInsert = candidates.slice(0, maxInsertions);

    // Collect unique T values, deduped against existing rows
    const MIN_T_SEP = 0.001; // Minimum separation from existing T rows
    const existingSet = new Set<number>();
    for (let j = 0; j < tPositions.length; j++) existingSet.add(tPositions[j]);

    const newTs: number[] = [];
    for (const c of toInsert) {
        // Check against existing T positions and already-inserted Ts
        let tooClose = false;
        for (let j = 0; j < tPositions.length; j++) {
            if (Math.abs(c.tMid - tPositions[j]) < MIN_T_SEP) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            // Also check against previously inserted
            let alreadyInserted = false;
            for (const nt of newTs) {
                if (Math.abs(c.tMid - nt) < MIN_T_SEP) {
                    alreadyInserted = true;
                    break;
                }
            }
            if (!alreadyInserted) {
                newTs.push(c.tMid);
            }
        }
    }

    if (newTs.length === 0) {
        const rowMapping: number[] = [];
        for (let j = 0; j < tPositions.length; j++) rowMapping.push(j);
        return { tPositions, rowMapping, insertedCount: 0 };
    }

    // Merge existing T positions with new ones, maintaining sorted order
    const allTs: { t: number; originalRow: number }[] = [];
    for (let j = 0; j < tPositions.length; j++) {
        allTs.push({ t: tPositions[j], originalRow: j });
    }
    for (const nt of newTs) {
        // Find which original row this falls after
        let afterRow = 0;
        for (let j = 0; j < tPositions.length - 1; j++) {
            if (tPositions[j] <= nt && tPositions[j + 1] > nt) {
                afterRow = j;
                break;
            }
        }
        // Mark as an inserted row (originalRow = -1 means "interpolated")
        allTs.push({ t: nt, originalRow: -(afterRow + 1) }); // Negative = inserted after row |val|-1
    }

    allTs.sort((a, b) => a.t - b.t);

    const result = new Float32Array(allTs.length);
    const rowMapping: number[] = [];
    for (let i = 0; i < allTs.length; i++) {
        result[i] = allTs[i].t;
        rowMapping.push(allTs[i].originalRow);
    }

    return { tPositions: result, rowMapping, insertedCount: newTs.length };
}

// ============================================================================
// v8.2 — Per-Row Feature Patching on a Regular Grid
// ============================================================================

/**
 * Minimum separation between consecutive U positions in the union grid.
 * Prevents degenerate (zero-area) triangles. Expressed as fraction of 1.0.
 * 0.05% of circumference ≈ 0.18° — well below any visible artifact.
 */
const MIN_U_SEPARATION = 0.0005;

/**
 * v10.9: Multi-level flanking offsets for feature companions in the union grid.
 * Each detected peak gets companion vertices at each offset × localSpacing
 * on both sides, creating a locally-dense column cluster that can trace
 * knife-edge cusps. Geometrically spaced: inner offsets are denser for
 * capturing the steep cusp slope, outer offsets are sparser for smooth
 * transition to the uniform grid.
 *
 * Total columns per feature: 1 (peak) + 2 × FLANK_OFFSETS.length (flanks)
 * = 1 + 2×4 = 9 columns per feature.
 *
 * Budget impact: ~183 clusters × 6 extra columns = ~1098 additional columns
 * over the v10.8 union grid.  Outer wall tris increase from ~714K to ~1.3M
 * at 500K target.  This is acceptable for perfect cusp representation.
 */
const FLANK_OFFSETS = [0.10, 0.25, 0.45, 0.70] as const;

/**
 * Cluster radius for merging per-row feature peaks into a single U column.
 * Peaks within this distance (circular) across different rows are considered
 * the same vertical feature and get a single column at their median position.
 * This determines the GRID WIDTH — we need enough columns to assign each
 * per-row peak to a nearby column for patching.
 *
 * v10.6: Reduced from 0.003 to 0.002. This creates tighter clusters so
 * each cluster's median column is closer to its constituent peaks. Combined
 * with the wider patching acceptance radius (0.85×), this ensures ~95%+ of
 * peaks get patched to exact positions (vs ~68% before).
 * Cost: ~50% more feature columns (modest triangle count increase).
 */
const FEATURE_CLUSTER_RADIUS = 0.002;

/**
 * Build a UNION feature grid: a single set of U positions that contains
 * BOTH the CDF-adaptive base grid AND columns for every detected feature
 * peak across ALL rows.
 *
 * v8.2: This grid determines the TOPOLOGY (number of columns, index buffer).
 * After grid generation, per-row feature patching overwrites each row's
 * feature-column U coordinates with the exact peak position for that row.
 *
 * Algorithm:
 *   1. Collect all per-row feature peaks into a flat list
 *   2. Sort and cluster peaks within FEATURE_CLUSTER_RADIUS → representative
 *      column positions (median of each cluster)
 *   3. Add flanking companions at ±FLANK_OFFSET_ROW × localSpacing
 *   4. Merge with CDF base grid using tagged deduplication
 *      (base positions are sacred — never collapsed)
 *   5. Return a single sorted Float32Array of U positions
 *
 * @param baseU           CDF-adaptive U positions (the budget-sized grid)
 * @param allRowFeatures  Per-row detected feature U positions
 * @param maxColumns      v11.3: Maximum total columns (budget cap). 0 = no limit.
 * @returns  Sorted Float32Array of union U positions (used as template for ALL rows)
 */
function buildUnionFeatureGrid(
    baseU: Float32Array,
    allRowFeatures: number[][],
    maxColumns: number = 0
): Float32Array {
    // 1. Collect ALL per-row peaks into a flat list
    const allPeaks: number[] = [];
    for (const rowFeats of allRowFeatures) {
        for (const u of rowFeats) {
            allPeaks.push(u);
        }
    }

    if (allPeaks.length === 0) {
        // No features detected — use base grid as-is
        return baseU;
    }

    // 2. Sort and cluster into representative columns
    allPeaks.sort((a, b) => a - b);

    const clusterCenters: number[] = [];
    let clusterStart = 0;
    while (clusterStart < allPeaks.length) {
        // Find the extent of this cluster
        let clusterEnd = clusterStart;
        while (
            clusterEnd + 1 < allPeaks.length &&
            allPeaks[clusterEnd + 1] - allPeaks[clusterStart] < FEATURE_CLUSTER_RADIUS
        ) {
            clusterEnd++;
        }

        // Representative = median of cluster
        const midIdx = Math.floor((clusterStart + clusterEnd) / 2);
        clusterCenters.push(allPeaks[midIdx]);

        clusterStart = clusterEnd + 1;
    }

    // 3. Build tagged position list: base (sacred) + feature centers (sacred) + flanks
    // v16.2: Feature cluster centers are marked as sacred (isFeatureCenter=true)
    // so the budget cap preserves them alongside base positions. Only flanking
    // companions are sacrificed when the column budget is tight.
    interface TaggedPos { u: number; isBase: boolean; isFeatureCenter: boolean; }
    const tagged: TaggedPos[] = [];

    const baseLen = baseU.length;
    const baseSpacing = 1.0 / Math.max(baseLen, 1);

    // All base positions — always kept
    for (let k = 0; k < baseLen; k++) {
        tagged.push({ u: baseU[k], isBase: true, isFeatureCenter: false });
    }

    // Feature column positions + multi-level flanking companions (v10.9)
    for (const feat of clusterCenters) {
        // v16.2: Feature cluster centers are sacred — they define where chains live
        tagged.push({ u: feat, isBase: false, isFeatureCenter: true });

        // Find local spacing at this feature position
        let localSpacing = baseSpacing;
        for (let k = 0; k < baseLen - 1; k++) {
            if (baseU[k] <= feat && baseU[k + 1] > feat) {
                localSpacing = baseU[k + 1] - baseU[k];
                break;
            }
        }

        // v10.9: Multiple flanking companions at geometrically-spaced offsets
        for (const offset of FLANK_OFFSETS) {
            const leftFlank = ((feat - offset * localSpacing) % 1 + 1) % 1;
            const rightFlank = ((feat + offset * localSpacing) % 1 + 1) % 1;
            tagged.push({ u: leftFlank, isBase: false, isFeatureCenter: false });
            tagged.push({ u: rightFlank, isBase: false, isFeatureCenter: false });
        }
    }

    // 4. Sort by U position
    tagged.sort((a, b) => a.u - b.u);

    // 5. Deduplicate: KEEP all base and feature center positions, only drop
    //    flanking companions that are too close to their predecessor.
    // v16.4: Track position kind through dedup and budget-cap stages so we can
    // apply a hard cap when sacred columns exceed budget (base first, feature
    // centers last-resort), instead of silently exploding triangle counts.
    // kind: 0=flank, 1=base, 2=feature-center
    interface DedupedPos { u: number; kind: 0 | 1 | 2; }
    const firstKind: 0 | 1 | 2 = tagged[0].isBase ? 1 : (tagged[0].isFeatureCenter ? 2 : 0);
    const deduped: DedupedPos[] = [{ u: tagged[0].u, kind: firstKind }];
    for (let k = 1; k < tagged.length; k++) {
        const gap = tagged[k].u - deduped[deduped.length - 1].u;
        if (gap <= 0) {
            // Exact duplicate (or out-of-order due to floating point) — always skip
            continue;
        }
        if (tagged[k].isBase || tagged[k].isFeatureCenter) {
            // v16.2: Base AND feature center positions are ALWAYS kept
            deduped.push({ u: tagged[k].u, kind: tagged[k].isBase ? 1 : 2 });
        } else if (gap > MIN_U_SEPARATION) {
            // Flanking companions kept only if far enough from predecessor
            deduped.push({ u: tagged[k].u, kind: 0 });
        }
    }

    // 6. Clamp to valid range and convert to Float32
    const raw = new Float32Array(deduped.length);
    const rawKind = new Uint8Array(deduped.length); // 0=flank, 1=base, 2=feature-center
    for (let k = 0; k < deduped.length; k++) {
        raw[k] = Math.max(0, Math.min(1 - 1e-7, deduped[k].u));
        rawKind[k] = deduped[k].kind;
    }

    // 7. Post-Float32 dedup: two distinct Float64 values can collapse
    //    to the same Float32 representation.  Remove duplicates.
    const final: number[] = [raw[0]];
    const finalKind: Array<0 | 1 | 2> = [rawKind[0] as 0 | 1 | 2];
    for (let k = 1; k < raw.length; k++) {
        if (raw[k] > final[final.length - 1]) {
            final.push(raw[k]);
            finalKind.push(rawKind[k] as 0 | 1 | 2);
        }
    }

    const result = new Float32Array(final.length);
    for (let k = 0; k < final.length; k++) {
        result[k] = final[k];
    }

    // v16.2: Budget cap — if maxColumns is specified and we exceed it,
    // downsample by removing only FLANKING positions (non-sacred) with the
    // smallest gaps to their neighbors. Base positions AND feature cluster
    // centers are SACRED and never dropped — they define where chains live.
    //
    // v11.3 BUG FIX: The old budget cap treated ALL non-base positions as
    // droppable, including feature cluster centers. When base grid (738 cols)
    // already exceeded the budget (470), ALL feature columns were dropped,
    // leaving 0 dedicated feature columns in the union grid. Per-row patching
    // could only bend existing grid columns, causing jagged mesh edges.
    if (maxColumns > 0 && result.length > maxColumns) {
        // Score each non-sacred position by contribution (min gap to neighbors)
        interface ScoredPos { u: number; kind: 0 | 1 | 2; score: number; idx: number; }
        const scored: ScoredPos[] = [];
        for (let k = 0; k < result.length; k++) {
            const gapLeft = k > 0 ? result[k] - result[k - 1] : 1;
            const gapRight = k < result.length - 1 ? result[k + 1] - result[k] : 1;
            const score = Math.min(gapLeft, gapRight); // Smaller = less unique, more droppable
            scored.push({ u: result[k], kind: finalKind[k], score, idx: k });
        }

        // v16.2: Only drop non-sacred positions (flanking companions).
        // Base positions and feature cluster centers are preserved.
        const droppable = scored.filter(s => s.kind === 0);
        droppable.sort((a, b) => a.score - b.score);

        const toDrop = result.length - maxColumns;
        const dropSet = new Set<number>();
        for (let k = 0; k < Math.min(toDrop, droppable.length); k++) {
            dropSet.add(droppable[k].idx);
        }

        // v16.4 HARD CAP: If sacred columns alone exceed budget, we must thin
        // them too or triangle count can blow up far beyond user target.
        // Priority: keep feature centers over base columns.
        const currentKept = () => result.length - dropSet.size;
        if (currentKept() > maxColumns) {
            const baseCandidates = scored
                .filter(s => s.kind === 1 && !dropSet.has(s.idx))
                .sort((a, b) => a.score - b.score);
            const needBaseDrop = currentKept() - maxColumns;
            for (let k = 0; k < Math.min(needBaseDrop, baseCandidates.length); k++) {
                dropSet.add(baseCandidates[k].idx);
            }
        }

        if (currentKept() > maxColumns) {
            const featureCandidates = scored
                .filter(s => s.kind === 2 && !dropSet.has(s.idx))
                .sort((a, b) => a.score - b.score);
            const needFeatureDrop = currentKept() - maxColumns;
            for (let k = 0; k < Math.min(needFeatureDrop, featureCandidates.length); k++) {
                dropSet.add(featureCandidates[k].idx);
            }
        }

        const capped: number[] = [];
        for (let k = 0; k < result.length; k++) {
            if (!dropSet.has(k)) capped.push(result[k]);
        }

        const baseCount = scored.filter(s => s.kind === 1).length;
        const featureCount = scored.filter(s => s.kind === 2).length;
        const flankCount = scored.filter(s => s.kind === 0).length;
        const droppedFlanks = scored.filter(s => s.kind === 0 && dropSet.has(s.idx)).length;
        const droppedBase = scored.filter(s => s.kind === 1 && dropSet.has(s.idx)).length;
        const droppedFeature = scored.filter(s => s.kind === 2 && dropSet.has(s.idx)).length;
        console.log(`[ParametricExport]   v16.4 Budget cap: ${result.length} → ${capped.length} columns (max=${maxColumns}, dropped flanks=${droppedFlanks}/${flankCount}, base=${droppedBase}/${baseCount}, features=${droppedFeature}/${featureCount})`);

        const cappedResult = new Float32Array(capped.length);
        for (let k = 0; k < capped.length; k++) cappedResult[k] = capped[k];
        return cappedResult;
    }

    return result;
}

/**
 * Patch the outer-wall vertex buffer so each row's peak column
 * traces the EXACT per-row feature U position.
 *
 * v10.10 REWRITE: Peak-only patching.
 *
 * Only the peak column (the nearest grid column to each detected feature)
 * is snapped to the exact feature U. Flanking columns are LEFT AT THEIR
 * UNION-GRID POSITIONS — identical across all rows.
 *
 * This eliminates the inter-row vertex inconsistency that caused sawtooth
 * artifacts in v10.9. The cusp-interpolated and Gaussian patching approaches
 * moved flanking columns to per-row-varying positions (because the arc-length
 * or shift varies with height-dependent superformula parameters). Since
 * triangulation connects vertices across rows, those inconsistent flanking
 * positions created zigzag triangles — the sawtooth.
 *
 * The multi-level flanking in buildUnionFeatureGrid already provides 9 columns
 * per feature at positions that are IDENTICAL across all rows (union grid).
 * The stitch fan system handles smooth normal transitions. Peak-only patching
 * lets the ridge follow the exact feature while flanking geometry stays clean.
 *
 * @param vertices       The outer wall vertex buffer (interleaved u, t, surfaceId)
 * @param W              Grid width (number of U columns per row)
 * @param numRows        Number of T rows
 * @param unionU         The union grid U positions (template, sorted ascending)
 * @param allRowFeatures Per-row detected feature U positions
 * @returns  Number of vertices patched
 */
function patchRowFeatures(
    vertices: Float32Array,
    W: number,
    numRows: number,
    unionU: Float32Array,
    allRowFeatures: number[][]
): number {
    let patchCount = 0;

    for (let j = 0; j < numRows && j < allRowFeatures.length; j++) {
        const rowFeats = allRowFeatures[j];
        if (rowFeats.length === 0) continue;

        const rowBase = j * W * 3;
        const patchedCols = new Set<number>();

        for (const peakU of rowFeats) {
            // Binary search for nearest column in sorted unionU
            let lo = 0, hi = W - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (unionU[mid] < peakU) lo = mid + 1;
                else hi = mid;
            }
            let bestCol = lo;
            let bestDist = Math.abs(unionU[lo] - peakU);
            if (lo > 0) {
                const d = Math.abs(unionU[lo - 1] - peakU);
                if (d < bestDist) { bestCol = lo - 1; bestDist = d; }
            }
            const dWrap0 = Math.abs(peakU - unionU[0] - 1);
            if (dWrap0 < bestDist) { bestCol = 0; bestDist = dWrap0; }
            const dWrapN = Math.abs(unionU[W - 1] - peakU + 1);
            if (dWrapN < bestDist) { bestCol = W - 1; bestDist = dWrapN; }

            // v14.0: No acceptance gate — always patch. Chain U IS ground truth.
            if (!patchedCols.has(bestCol)) {
                patchedCols.add(bestCol);
                const clampedPeak = Math.max(0, Math.min(1 - 1e-7, peakU));
                vertices[rowBase + bestCol * 3] = clampedPeak;
                patchCount++;
            }
            // Flanking columns remain at their union-grid positions (identical across rows)
        }
    }

    return patchCount;
}

function computeGridDimensions(
    totalTriangles: number,
    budgetFrac: number,
    aspectRatio: number
): { w: number; h: number } {
    // v8.0: Respect the user's triangle budget — no artificial floor.
    // Previous versions forced Math.max(2_000_000, ...) which wasted triangles on flat areas.
    const surfaceTriangles = totalTriangles * budgetFrac;
    const balancedAspect = Math.max(1, aspectRatio);
    const cells = surfaceTriangles / 2;
    let h = Math.max(4, Math.round(Math.sqrt(cells / balancedAspect)));
    let w = Math.max(8, Math.round(h * balancedAspect));

    // v16.4: Enforce triangle budget exactly for the base grid estimate.
    // Rounding w/h independently can overshoot targetTris by 10-20%.
    const maxCells = Math.max(1, Math.floor(cells));
    let guard = 0;
    while ((w - 1) * (h - 1) > maxCells && guard < 10_000) {
        if (w >= h * balancedAspect && w > 8) w--;
        else if (h > 4) h--;
        else if (w > 8) w--;
        else break;
        guard++;
    }
    return { w, h };
}

/**
 * Downsample sorted U positions to a target count while preserving monotonicity.
 * Keeps the first and last samples and picks evenly-spaced indices in-between.
 */
function downsampleSortedPositions(positions: Float32Array, targetCount: number): Float32Array {
    if (targetCount <= 0 || positions.length <= targetCount) return positions;
    if (targetCount === 1) return new Float32Array([positions[0]]);

    const picked: number[] = [];
    for (let k = 0; k < targetCount; k++) {
        const idx = Math.round((k * (positions.length - 1)) / (targetCount - 1));
        const u = positions[Math.max(0, Math.min(positions.length - 1, idx))];
        if (picked.length === 0 || u > picked[picked.length - 1]) picked.push(u);
    }

    // Safety: if rounding collisions reduced count too much, fill from source.
    if (picked.length < targetCount) {
        for (let i = 0; i < positions.length && picked.length < targetCount; i++) {
            const u = positions[i];
            if (picked.length === 0 || u > picked[picked.length - 1]) picked.push(u);
        }
    }

    const out = new Float32Array(picked.length);
    for (let i = 0; i < picked.length; i++) out[i] = picked[i];
    return out;
}

// ============================================================================
// GPU Compute Pipeline
// ============================================================================

export class ParametricExportComputer {
    private device: GPUDevice;
    private initialized = false;
    private evaluatePipeline: GPUComputePipeline | null = null;
    private snapPipeline: GPUComputePipeline | null = null;
    private metricPipeline: GPUComputePipeline | null = null;
    private relaxPipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipelineLayout: GPUPipelineLayout | null = null;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    async init(shaderSource: string): Promise<void> {
        if (this.initialized) return;

        const shaderModule = this.device.createShaderModule({
            label: 'parametric_eval_compute',
            code: shaderSource,
        });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'parametric_bind_group_layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Metric Tensor
                { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Ping-Pong Vertices
            ],
        });

        this.pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout],
        });

        this.evaluatePipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_evaluate_vertices',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'evaluate_vertices' },
        });

        this.snapPipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_snap_to_features',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'snap_to_feature_ridges' },
        });

        // Pipeline for Metric Field Computation (v5.3)
        this.metricPipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_compute_metric',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'compute_metric_field' },
        });

        // Pipeline for Anisotropic Relaxation (v5.3)
        this.relaxPipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_relax_vertices',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'relax_vertices' },
        });

        this.initialized = true;
        console.log('[ParametricExport] GPU pipelines initialized (Eval, Snap, Metric, Relax).');
    }

    isReady(): boolean { return this.initialized; }
    destroy(): void { this.initialized = false; }

    /**
     * Run evaluate_vertices on a set of UV points and read back 3D positions.
     * If snapToFeatures is true, runs snap_to_feature_ridges first to align
     * vertices to feature ridges/valleys using Newton's method on GPU.
     */
    private async evaluatePoints(
        uvVertices: Float32Array,
        uniformBuffer: GPUBuffer,
        styleParamBuffer: GPUBuffer,
        dummyWrite3: GPUBuffer,
        dummyWrite4: GPUBuffer,
        dummyWrite7: GPUBuffer,
        dummyWrite9: GPUBuffer,
        dummyWrite10: GPUBuffer,
        dummyReadOnly: GPUBuffer,
        snapToFeatures: boolean = false,
        relaxIterations: number = 0,
    ): Promise<Float32Array> {
        console.log(`[ParametricExport] Eval: relax=${relaxIterations}, snap=${snapToFeatures}`);
        console.log(`[ParametricExport]   Bind3=${dummyWrite3.label}, Bind9=${dummyWrite9.label}`);

        const vertexBytes = uvVertices.byteLength;
        const vertexCount = uvVertices.length / 3;

        const vertexBuffer = this.device.createBuffer({
            size: vertexBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            label: 'Parametric_EvalVerts'
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, uvVertices.buffer);

        // Buffers for Relaxation (created only if needed)
        let metricBuffer: GPUBuffer | null = null;
        let pingPongBuffer: GPUBuffer | null = null;

        if (relaxIterations > 0) {
            metricBuffer = this.device.createBuffer({
                size: vertexBytes, // 3 floats per vertex (m11, m12, m22) matches UVT size
                usage: GPUBufferUsage.STORAGE,
                label: 'Parametric_MetricTensor'
            });
            pingPongBuffer = this.device.createBuffer({
                size: vertexBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                label: 'Parametric_PingPong'
            });
        }

        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: styleParamBuffer } },
                { binding: 2, resource: { buffer: vertexBuffer } },
                { binding: 3, resource: { buffer: dummyWrite3 } },
                { binding: 4, resource: { buffer: dummyWrite4 } },
                { binding: 5, resource: { buffer: dummyReadOnly } },
                { binding: 6, resource: { buffer: dummyReadOnly } },
                { binding: 7, resource: { buffer: dummyWrite7 } },
                { binding: 8, resource: { buffer: dummyReadOnly } },
                { binding: 9, resource: { buffer: metricBuffer || dummyWrite9 } },
                { binding: 10, resource: { buffer: pingPongBuffer || dummyWrite10 } },
            ],
        });

        const encoder = this.device.createCommandEncoder();
        const workgroups = Math.ceil(vertexCount / 64);
        // Safety check: WebGPU limits dispatch to 65535 per dimension.
        // With original W (~1568) this is ~13K workgroups — well under limit.
        if (workgroups > 65535) {
            console.error(`[ParametricExport] Workgroup count ${workgroups} exceeds WebGPU limit 65535. Reduce grid resolution.`);
        }

        // Pass 1 (optional): Snap outer-wall vertices to feature ridges/valleys
        if (snapToFeatures && this.snapPipeline) {
            const snapPass = encoder.beginComputePass();
            snapPass.setPipeline(this.snapPipeline);
            snapPass.setBindGroup(0, bindGroup);
            snapPass.dispatchWorkgroups(workgroups);
            snapPass.end();
        }

        // Pass 1.5 (optional): Anisotropic Relaxation (v5.3)
        // BATCHED DISPATCH to prevent Windows TDR (timeout) with high iterations (8000+)
        if (relaxIterations > 0 && this.metricPipeline && this.relaxPipeline && metricBuffer && pingPongBuffer) {

            // Batched Relaxation with periodic metric recomputation
            // The metric field depends on vertex positions, so it must be
            // recomputed as vertices move during relaxation.
            const BATCH_SIZE = 500; // 500 iters per batch (safe for 2s TDR)
            const METRIC_RECOMPUTE_INTERVAL = 500; // Recompute metric every 500 steps
            let remaining = relaxIterations;
            let stepsSinceMetric = METRIC_RECOMPUTE_INTERVAL; // Force initial computation

            while (remaining > 0) {
                // Recompute metric field if stale
                if (stepsSinceMetric >= METRIC_RECOMPUTE_INTERVAL) {
                    const metricEncoder = this.device.createCommandEncoder({ label: 'Parametric_MetricRecompute' });
                    const metricPass = metricEncoder.beginComputePass();
                    metricPass.setPipeline(this.metricPipeline);
                    metricPass.setBindGroup(0, bindGroup);
                    metricPass.dispatchWorkgroups(workgroups);
                    metricPass.end();
                    this.device.queue.submit([metricEncoder.finish()]);
                    stepsSinceMetric = 0;
                }

                const currentBatch = Math.min(remaining, BATCH_SIZE);
                const batchEncoder = this.device.createCommandEncoder({ label: `Parametric_RelaxBatch_${currentBatch}` });

                for (let i = 0; i < currentBatch; i++) {
                    const relaxPass = batchEncoder.beginComputePass();
                    relaxPass.setPipeline(this.relaxPipeline);
                    relaxPass.setBindGroup(0, bindGroup);
                    relaxPass.dispatchWorkgroups(workgroups);
                    relaxPass.end();

                    // Copy PingPong -> VertexBuffer (Vertex is input for next step)
                    batchEncoder.copyBufferToBuffer(pingPongBuffer, 0, vertexBuffer, 0, vertexBytes);
                }

                // Submit batch immediately to yield to OS watchdog
                this.device.queue.submit([batchEncoder.finish()]);
                remaining -= currentBatch;
                stepsSinceMetric += currentBatch;
            }
        }

        // Pass 2: Evaluate UV → 3D positions (New Encoder for final step)
        const finalEncoder = this.device.createCommandEncoder({ label: 'Parametric_FinalEval' });
        const evalPass = finalEncoder.beginComputePass();
        evalPass.setPipeline(this.evaluatePipeline!);
        evalPass.setBindGroup(0, bindGroup);
        evalPass.dispatchWorkgroups(workgroups);
        evalPass.end();

        this.device.queue.submit([finalEncoder.finish()]);

        // Cleanup temp buffers immediately
        if (metricBuffer) metricBuffer.destroy();
        if (pingPongBuffer) pingPongBuffer.destroy();

        // Read back
        const stagingBuffer = this.device.createBuffer({
            size: vertexBytes,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label: 'Parametric_EvalStaging'
        });

        const readEncoder = this.device.createCommandEncoder();
        readEncoder.copyBufferToBuffer(vertexBuffer, 0, stagingBuffer, 0, vertexBytes);
        this.device.queue.submit([readEncoder.finish()]);

        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(stagingBuffer.getMappedRange().slice(0));
        stagingBuffer.unmap();

        vertexBuffer.destroy();
        stagingBuffer.destroy();

        return resultData;
    }

    /**
     * Main compute entry point.
     *
     * Phase 1: GPU curvature sampling (evaluate strips along T and U)
     * Phase 2: CPU adaptive grid via CDF inversion
     * Phase 3: GPU full mesh evaluation
     */
    async compute(params: ParametricExportParams): Promise<ParametricExportResult> {
        if (!this.initialized) throw new Error('[ParametricExport] Not initialized');
        const startTime = performance.now();

        const targetTris = params.targetTriangles ?? 2_000_000;
        console.log(`[ParametricExport] Target: ${targetTris.toLocaleString()} triangles`);

        // ── Shared GPU resources ──
        const buffers: GPUBuffer[] = [];
        const track = (b: GPUBuffer) => { buffers.push(b); return b; };

        try {
            const uniformBuffer = track(this.device.createBuffer({
                size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Parametric_Uniforms'
            }));

            const styleParamBuffer = track(this.device.createBuffer({
                size: 48 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'Parametric_StyleParams'
            }));

            const dummyWrite3 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW3'
            }));
            const dummyWrite4 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW4'
            }));
            const dummyWrite7 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW7'
            }));
            const dummyWrite9 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW9'
            }));
            const dummyWrite10 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW10'
            }));
            const dummyReadOnly = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'Parametric_DummyRO'
            }));

            console.log('[ParametricExport] Buffers created:', {
                w3: dummyWrite3.label,
                w9: dummyWrite9.label
            });

            // Write uniforms
            const { dimensions, styleOpts } = params;
            const uniformData = new Float32Array([
                dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
                dimensions.tBottom, dimensions.rDrain, dimensions.expn, params.styleIndex,
                styleOpts.spinTurns ?? 0,
                ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180,
                styleOpts.spinCurveExp ?? 1,
                styleOpts.seamAngle ?? 0,
                styleOpts.bellAmp ?? 0, styleOpts.bellCenter ?? 0.5, styleOpts.bellWidth ?? 0.22, 0,
                0, 0, 0, 0,
            ]);
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);

            const [, packedStyleParams] = buildStyleParamPayload(
                params.styleId,
                params.styleOpts as Record<string, unknown>
            );
            const styleData = new Float32Array(48);
            styleData.set(packedStyleParams.slice(0, Math.min(48, packedStyleParams.length)));
            this.device.queue.writeBuffer(styleParamBuffer, 0, styleData.buffer);

            // ═══════════════════════════════════════════
            // PHASE 1: Multi-Strip Curvature Sampling (GPU → CPU)
            //
            // Sample NUM_STRIPS T-strips (at different U values) and
            // NUM_STRIPS U-strips (at different T values).
            // Take MAX curvature across all strips at each position.
            // This captures features regardless of angular/height position.
            // ═══════════════════════════════════════════
            const curvStart = performance.now();
            const N = CURVATURE_SAMPLES;
            const S = NUM_STRIPS;
            const totalSamples = S * N * 2; // S T-strips + S U-strips

            const sampleVertices = new Float32Array(totalSamples * 3);
            let writeIdx = 0;

            // T-strips: vary T from 0 to 1 at S different U positions
            for (let s = 0; s < S; s++) {
                const uVal = s / S; // u = 0, 0.125, 0.25, ..., 0.875
                for (let i = 0; i < N; i++) {
                    sampleVertices[writeIdx++] = uVal;
                    sampleVertices[writeIdx++] = i / (N - 1);  // t ∈ [0, 1]
                    sampleVertices[writeIdx++] = 0;             // surface_id = 0
                }
            }

            // U-strips: vary U from 0 to 1 at S different T positions
            for (let s = 0; s < S; s++) {
                const tVal = (s + 0.5) / S; // t = 0.0625, 0.1875, ..., 0.9375
                for (let i = 0; i < N; i++) {
                    sampleVertices[writeIdx++] = i / N;  // u ∈ [0, 1) periodic
                    sampleVertices[writeIdx++] = tVal;
                    sampleVertices[writeIdx++] = 0;      // surface_id = 0
                }
            }

            // Evaluate ALL strips in a single GPU dispatch
            const samplePositions = await this.evaluatePoints(
                sampleVertices, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
            );

            // ── Aggregate T-curvature: MAX across all T-strips ──
            const tRawCurvatures: Float32Array[] = [];
            for (let s = 0; s < S; s++) {
                const offset = s * N * 3;
                const stripPos = samplePositions.subarray(offset, offset + N * 3);
                tRawCurvatures.push(computeRawCurvature(stripPos, N));
            }
            // Take element-wise MAX across all strips
            const tMaxCurvature = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                let maxVal = 0;
                for (let s = 0; s < S; s++) {
                    maxVal = Math.max(maxVal, tRawCurvatures[s][i]);
                }
                tMaxCurvature[i] = maxVal;
            }

            // ── Aggregate U-curvature: MAX across all U-strips ──
            const uRawCurvatures: Float32Array[] = [];
            for (let s = 0; s < S; s++) {
                const offset = (S + s) * N * 3; // U-strips start after T-strips
                const stripPos = samplePositions.subarray(offset, offset + N * 3);
                uRawCurvatures.push(computeRawCurvature(stripPos, N));
            }
            const uMaxCurvature = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                let maxVal = 0;
                for (let s = 0; s < S; s++) {
                    maxVal = Math.max(maxVal, uRawCurvatures[s][i]);
                }
                uMaxCurvature[i] = maxVal;
            }

            // Normalize AFTER aggregation
            const tCurvature = normalizeProfile(tMaxCurvature);
            const uCurvature = normalizeProfile(uMaxCurvature);

            const curvMs = performance.now() - curvStart;

            // Log curvature statistics
            const tMin = Math.min(...Array.from(tCurvature));
            const tMax = Math.max(...Array.from(tCurvature));
            const uMin = Math.min(...Array.from(uCurvature));
            const uMax = Math.max(...Array.from(uCurvature));
            console.log(`[ParametricExport] Curvature sampling: ${curvMs.toFixed(1)}ms (${S} strips × ${N} samples)`);
            console.log(`[ParametricExport]   T-curvature: min=${tMin.toFixed(4)}, max=${tMax.toFixed(4)}`);
            console.log(`[ParametricExport]   U-curvature: min=${uMin.toFixed(4)}, max=${uMax.toFixed(4)}`);

            // ═══════════════════════════════════════════
            // PHASE 2: Build Adaptive Grid (CPU)
            // ═══════════════════════════════════════════
            const gridStart = performance.now();

            const { H, Rt, Rb } = dimensions;
            const avgCircumference = Math.PI * (Rt + Rb);
            const aspectRatios: Record<number, number> = {
                0: avgCircumference / H,
                1: avgCircumference / H,
                2: avgCircumference / (dimensions.tWall || 3),
                3: avgCircumference / (Rb || 10),
                4: avgCircumference / (Rb || 10),
                5: avgCircumference / (dimensions.tBottom || 3),
            };
            for (const key of Object.keys(aspectRatios)) {
                aspectRatios[Number(key)] = Math.max(1, Math.min(20, aspectRatios[Number(key)]));
            }

            const outerDims = computeGridDimensions(
                targetTris, SURFACE_CONFIG[0].budgetFrac, aspectRatios[0]
            );
            const sharedW = outerDims.w;

            // NOTE: Grid Width uniform written AFTER feature merge (below)

            // v16.10: Smoothed profiles no longer used for grid generation.
            // CDF-adaptive spacing has been replaced by uniform spacing.
            // Curvature data is still used for feature detection (detectFeatureEdges).

            // ── Feature Edge Detection (v7.0) ──
            // Detect ridges/valleys using BOTH curvature peaks AND gradient zero-crossings.
            // Pass 3D positions from the BEST strip (highest total curvature) for
            // gradient zero-crossing detection (actual ridge/valley positions).
            
            // Find best T-strip (highest total curvature) for gradient analysis
            let bestTStrip = 0;
            let bestTSum = 0;
            for (let s = 0; s < S; s++) {
                let sum = 0;
                for (let i = 0; i < N; i++) sum += tRawCurvatures[s][i];
                if (sum > bestTSum) { bestTSum = sum; bestTStrip = s; }
            }
            const bestTPositions = samplePositions.subarray(bestTStrip * N * 3, (bestTStrip + 1) * N * 3);

            // Find best U-strip for gradient analysis
            let bestUStrip = 0;
            let bestUSum = 0;
            for (let s = 0; s < S; s++) {
                let sum = 0;
                for (let i = 0; i < N; i++) sum += uRawCurvatures[s][i];
                if (sum > bestUSum) { bestUSum = sum; bestUStrip = s; }
            }
            const bestUPositions = samplePositions.subarray((S + bestUStrip) * N * 3, (S + bestUStrip + 1) * N * 3);

            const tFeatures = detectFeatureEdges(tMaxCurvature, N, bestTPositions);
            const uFeatures = detectFeatureEdges(uMaxCurvature, N, bestUPositions);
            console.log(`[ParametricExport]   Feature edges detected: ${uFeatures.length} (U) + ${tFeatures.length} (T)`);

            // v16.10: UNIFORM grid spacing.
            //
            // CDF-adaptive spacing (v8.0) concentrated grid lines near high-curvature
            // areas, creating visible density banding on the exported mesh surface.
            // With per-row vertex patching achieving 100% patch rate and 0 collisions,
            // feature fidelity is fully handled by:
            //   1. Per-row vertex patching (exact chain positions on grid vertices)
            //   2. Chain-directed diagonal flip (edges follow ridges)
            //   3. 3D quality edge flip (optimizes surrounding triangles)
            //
            // A uniform grid eliminates density bands and gives the smoothest
            // possible base surface. Features emerge from patching, not from
            // grid concentration.
            //
            // v16.11: Generate U grid at final budget-aware width directly.
            // Previously, computeGridDimensions returned w=738 columns, then a
            // later downsample step trimmed to 735 (desiredBaseCols). The
            // downsampleSortedPositions picks evenly-spaced indices which creates
            // a handful of wider gaps in the otherwise uniform grid — visible as
            // "thicker columns." Fix: pre-compute the budget-constrained column
            // count and generate the uniform grid at that exact size, eliminating
            // the downsample step entirely.
            const tCount = outerDims.h + 1;
            const numOuterRowsEarly = tCount; // In local-only mode, no T-rows are injected
            const targetOuterBudgetEarly = Math.floor(targetTris * SURFACE_CONFIG[0].budgetFrac);
            const maxColsEarly = Math.floor(targetOuterBudgetEarly / (2 * Math.max(1, numOuterRowsEarly - 1))) + 1;
            const finalUCols = LOCAL_ONLY_OUTER_ADAPTATION
                ? Math.min(sharedW, maxColsEarly)
                : sharedW;
            const cdfU = new Float32Array(finalUCols);
            for (let i = 0; i < finalUCols; i++) cdfU[i] = i / finalUCols;
            const cdfT = new Float32Array(tCount);
            for (let i = 0; i < tCount; i++) cdfT[i] = i / (tCount - 1);
            // t=0 and t=1 are already exact from uniform generation
            if (finalUCols !== sharedW) {
                console.log(`[ParametricExport]   v16.11 Budget-aware U grid: ${sharedW} → ${finalUCols} columns (no downsample needed)`);
            }

            console.log(`[ParametricExport]   v16.6 mode: LOCAL_ONLY_OUTER_ADAPTATION=${LOCAL_ONLY_OUTER_ADAPTATION}`);

            // ── Merge Feature Edges into T Grid (v7.0) ──
            // v16.6 local-only mode: disable global T-row insertion and keep
            // feature handling local to per-row point-cloud constraints.
            const tMerged = LOCAL_ONLY_OUTER_ADAPTATION
                ? { positions: cdfT, injected: 0 }
                : mergeFeaturePositions(cdfT, tFeatures, false);
            const tPositions = tMerged.positions;

            // For U, the CDF base grid is used as-is — per-row features are inserted later.
            const uBasePositions = cdfU;
            const featurePeaksSnapped = tMerged.injected;

            console.log(`[ParametricExport]   T-feature edges merged: ${tMerged.injected} (localOnly=${LOCAL_ONLY_OUTER_ADAPTATION})`);
            console.log(`[ParametricExport]   Base grid: ${uBasePositions.length} U × ${tPositions.length} T`);

            // Compute density ratio diagnostics
            const computeDensityRatio = (pos: Float32Array): number => {
                let minSp = 1, maxSp = 0;
                for (let i = 1; i < pos.length; i++) {
                    const sp = pos[i] - pos[i - 1];
                    if (sp > 0) {
                        minSp = Math.min(minSp, sp);
                        maxSp = Math.max(maxSp, sp);
                    }
                }
                return maxSp / Math.max(minSp, 1e-8);
            };
            const densityRatioT = computeDensityRatio(tPositions);
            const densityRatioU = computeDensityRatio(uBasePositions);

            console.log(`[ParametricExport]   Density ratio: T=${densityRatioT.toFixed(1)}×, U=${densityRatioU.toFixed(1)}×`);
            console.log(`[ParametricExport]   Features: ${featurePeaksSnapped} T merged, ${uFeatures.length} U detected (injected per-row in Phase 2.5)`);

            // ═══════════════════════════════════════════
            // PHASE 2.5: Per-Row Feature Probing, Chain Linking & T-Subdivision (v10.0)
            //
            // 1. GPU-probe each T-row at 4096 U samples
            // 2. Detect per-row peaks with 5-point stencil + d²r/du² + inflections
            // 3. LINK features across rows into continuous chains (polylines in u,t space)
            // 4. INSERT additional T-rows where chains cross row boundaries diagonally
            // 5. GPU-probe INSERTED rows and detect their features
            // 6. Build union grid (determines column topology)
            // 7. Generate regular-grid mesh (index buffer)
            // 8. Patch each row's feature columns with EXACT peak U
            // 9. Flip diagonals to follow chain direction
            //
            // Result: chain-following topology with vertices ON feature curves.
            // Features are arbitrary — they run at ANY angle through (u,t) space.
            // ═══════════════════════════════════════════
            const probeStart = performance.now();
            // v12.0 high-fidelity mode: denser row probing to reduce sub-sample
            // aliasing before chain linking. User requested spending more compute
            // to improve chain curvature quality.
            const ROW_PROBE_SAMPLES = 8192;
            const numOuterRows = tPositions.length;

            // ── Step 1: GPU-probe all original T-rows ──
            const probeVerts = new Float32Array(numOuterRows * ROW_PROBE_SAMPLES * 3);
            let pIdx = 0;
            for (let j = 0; j < numOuterRows; j++) {
                const tVal = tPositions[j];
                for (let i = 0; i < ROW_PROBE_SAMPLES; i++) {
                    probeVerts[pIdx++] = i / ROW_PROBE_SAMPLES; // u ∈ [0, 1)
                    probeVerts[pIdx++] = tVal;
                    probeVerts[pIdx++] = 0; // outer wall
                }
            }

            const probePositions = await this.evaluatePoints(
                probeVerts, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
            );

            const rowProbeData: Float32Array[] = [];
            for (let j = 0; j < numOuterRows; j++) {
                const offset = j * ROW_PROBE_SAMPLES * 3;
                rowProbeData.push(probePositions.subarray(offset, offset + ROW_PROBE_SAMPLES * 3));
            }

            // ── Step 2: Detect features for all original rows (v16.0 verified) ──
            const {
                allRowFeatures,
                allRowTypedFeatures,
                totalRejected: rowRejected
            } = detectAllRowFeatures(rowProbeData, ROW_PROBE_SAMPLES);

            const rowsWithFeatures = allRowFeatures.filter(f => f.length > 0).length;
            const totalRowPeaks = allRowFeatures.reduce((sum, f) => sum + f.length, 0);

            // Count peaks vs valleys from typed data
            let rowPeakCount = 0, rowValleyCount = 0;
            for (const rowFeats of allRowTypedFeatures) {
                for (const f of rowFeats) {
                    if (f.kind === 'peak') rowPeakCount++;
                    else rowValleyCount++;
                }
            }

            console.log(`[ParametricExport] Per-row probing: ${(performance.now() - probeStart).toFixed(1)}ms (${numOuterRows} rows × ${ROW_PROBE_SAMPLES} samples)`);
            console.log(`[ParametricExport]   Rows with features: ${rowsWithFeatures}/${numOuterRows}`);
            console.log(`[ParametricExport]   v16.0 VERIFIED per-row: ${totalRowPeaks} features (${rowPeakCount} peaks, ${rowValleyCount} valleys, ${rowRejected} rejected)`);
            console.log(`[ParametricExport]   Avg features/row: ${(totalRowPeaks / numOuterRows).toFixed(1)}, rejection rate: ${(100 * rowRejected / Math.max(1, totalRowPeaks + rowRejected)).toFixed(1)}%`);

            // ── Step 2.5: v16.0 Column-direction probing (verified) ──
            // v16.6 local-only mode: disabled. Rely on per-row point-cloud
            // constraints only to avoid global feature insertion side effects.
            let colPeaksAdded = 0;
            let colRejected = 0;
            if (!LOCAL_ONLY_OUTER_ADAPTATION) {
                const COL_PROBE_COUNT = 512;
                const colProbeStart = performance.now();
                const colResult = detectAndMergeColumnFeatures(
                    rowProbeData, ROW_PROBE_SAMPLES, tPositions, COL_PROBE_COUNT, allRowFeatures, allRowTypedFeatures
                );
                colPeaksAdded = colResult.addedCount;
                colRejected = colResult.rejectedCount;
                console.log(`[ParametricExport]   v16.0 Column probing: ${colPeaksAdded} verified peaks from ${COL_PROBE_COUNT} columns (${colRejected} rejected, ${(performance.now() - colProbeStart).toFixed(1)}ms)`);
            } else {
                console.log('[ParametricExport]   v16.6 Column probing: disabled (localOnly=true)');
            }
            const totalPeaks = allRowFeatures.reduce((sum, f) => sum + f.length, 0);
            const totalRejected = rowRejected + colRejected;
            console.log(`[ParametricExport]   Total verified peaks: ${totalPeaks} (row=${totalRowPeaks}, col=${colPeaksAdded}), total rejected: ${totalRejected}`);

            // ── Build raw peak debug data for green point cloud overlay ──
            // v16.0: Now includes feature kind (peak=0, valley=1) as third value
            {
                const peakPoints: number[] = [];
                let finalPeakCount = 0, finalValleyCount = 0;
                for (let j = 0; j < allRowFeatures.length; j++) {
                    const tVal = tPositions[j];
                    const typed = j < allRowTypedFeatures.length ? allRowTypedFeatures[j] : [];
                    for (let fi = 0; fi < allRowFeatures[j].length; fi++) {
                        const u = allRowFeatures[j][fi];
                        // Try to find typed info for this feature
                        // v16.1: Use wider tolerance to match column-snapped features
                        const typedMatch = typed.find(t => Math.abs(t.u - u) < 1e-6);
                        const kind = typedMatch ? (typedMatch.kind === 'peak' ? 0 : 1) : 0;
                        peakPoints.push(u, tVal, kind);
                        if (kind === 0) finalPeakCount++; else finalValleyCount++;
                    }
                }
                LAST_PEAK_DEBUG_DATA = {
                    createdAt: Date.now(),
                    totalPeaks: peakPoints.length / 3,
                    points: new Float32Array(peakPoints),
                    rowPeaks: totalRowPeaks,
                    colPeaks: colPeaksAdded,
                    peakCount: finalPeakCount,
                    valleyCount: finalValleyCount,
                    rejected: totalRejected,
                };
            }

            // ── Step 3: Link features into chains (v16.3: separated by kind) ──
            const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, numOuterRows);
            console.log(`[ParametricExport]   v16.3 feature chains: ${chains.length} chains linked`);

            // Chain diagnostics
            if (chains.length > 0) {
                const chainLengths = chains.map(c => c.points.length);
                const avgLen = chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length;
                const maxLen = Math.max(...chainLengths);
                console.log(`[ParametricExport]     Chain lengths: avg=${avgLen.toFixed(1)}, max=${maxLen}, total points=${chainLengths.reduce((a, b) => a + b, 0)}`);
            }

            // ── Step 3.5: GPU RE-SNAP — find the EXACT mathematical peak for each chain point ──
            // The per-row probe gives 8192 uniformly-spaced samples. The detected
            // peaks are within ±1/(2*8192) ≈ ±0.00006 of the true peak. This is
            // good, but for sharp cusps the true peak can be BETWEEN samples.
            //
            // Re-snap evaluates a tight window of 32 candidates around each chain
            // point on the GPU, finds the one with max/min radius, then does a
            // final parabolic refinement. This gives ~20× better precision than
            // the initial 8192-sample probe.
            if (chains.length > 0) {
                const RESNAP_CANDIDATES = 32;
                const RESNAP_HALFWIDTH = 2.0 / ROW_PROBE_SAMPLES; // ±2 sample widths
                const RESNAP_STEP = (2 * RESNAP_HALFWIDTH) / (RESNAP_CANDIDATES - 1);

                // Collect all chain points
                const allChainPoints: Array<{ chainIdx: number; ptIdx: number; u: number; row: number }> = [];
                for (let ci = 0; ci < chains.length; ci++) {
                    for (let pi = 0; pi < chains[ci].points.length; pi++) {
                        const pt = chains[ci].points[pi];
                        allChainPoints.push({ chainIdx: ci, ptIdx: pi, u: pt.u, row: pt.row });
                    }
                }

                // Build GPU probe vertices: for each chain point, RESNAP_CANDIDATES positions
                const totalProbes = allChainPoints.length * RESNAP_CANDIDATES;
                const resnapVerts = new Float32Array(totalProbes * 3);
                let rIdx = 0;
                for (const cp of allChainPoints) {
                    const tVal = tPositions[Math.min(cp.row, tPositions.length - 1)];
                    for (let k = 0; k < RESNAP_CANDIDATES; k++) {
                        let uCandidate = cp.u - RESNAP_HALFWIDTH + k * RESNAP_STEP;
                        // Wrap to [0, 1)
                        uCandidate = ((uCandidate % 1) + 1) % 1;
                        resnapVerts[rIdx++] = uCandidate;
                        resnapVerts[rIdx++] = tVal;
                        resnapVerts[rIdx++] = 0; // outer wall
                    }
                }

                // GPU evaluate all resnap candidates
                const resnapPositions = await this.evaluatePoints(
                    resnapVerts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
                );

                // For each chain point, find the candidate with the highest/lowest radius
                let resnapCount = 0;
                for (let cpIdx = 0; cpIdx < allChainPoints.length; cpIdx++) {
                    const cp = allChainPoints[cpIdx];
                    const baseOffset = cpIdx * RESNAP_CANDIDATES * 3;

                    // Determine if this is a peak (maximum) or valley (minimum).
                    // Use the original probe data: check if radius at this u is a local max or min.
                    const origRowData = rowProbeData[Math.min(cp.row, rowProbeData.length - 1)];
                    const sampleIdx = Math.round(cp.u * ROW_PROBE_SAMPLES) % ROW_PROBE_SAMPLES;
                    const rCenter = Math.sqrt(
                        origRowData[sampleIdx * 3] ** 2 +
                        origRowData[sampleIdx * 3 + 1] ** 2
                    );
                    const prevSampleIdx = (sampleIdx - 1 + ROW_PROBE_SAMPLES) % ROW_PROBE_SAMPLES;
                    const nextSampleIdx = (sampleIdx + 1) % ROW_PROBE_SAMPLES;
                    const rPrev = Math.sqrt(
                        origRowData[prevSampleIdx * 3] ** 2 +
                        origRowData[prevSampleIdx * 3 + 1] ** 2
                    );
                    const rNext = Math.sqrt(
                        origRowData[nextSampleIdx * 3] ** 2 +
                        origRowData[nextSampleIdx * 3 + 1] ** 2
                    );
                    const isMax = (rCenter >= rPrev && rCenter >= rNext);

                    // Extract radii from resnap candidates
                    const candidateRadii = new Float32Array(RESNAP_CANDIDATES);
                    for (let k = 0; k < RESNAP_CANDIDATES; k++) {
                        const off = baseOffset + k * 3;
                        const x = resnapPositions[off];
                        const y = resnapPositions[off + 1];
                        candidateRadii[k] = Math.sqrt(x * x + y * y);
                    }

                    // Find the best candidate
                    let bestK = 0;
                    let bestR = candidateRadii[0];
                    for (let k = 1; k < RESNAP_CANDIDATES; k++) {
                        if (isMax ? (candidateRadii[k] > bestR) : (candidateRadii[k] < bestR)) {
                            bestR = candidateRadii[k];
                            bestK = k;
                        }
                    }

                    // Parabolic refinement on the resnap candidates
                    let finalU: number;
                    if (bestK > 0 && bestK < RESNAP_CANDIDATES - 1) {
                        const L = candidateRadii[bestK - 1];
                        const C = candidateRadii[bestK];
                        const R = candidateRadii[bestK + 1];
                        const denom = L - 2 * C + R;
                        let delta = 0;
                        if (Math.abs(denom) > 1e-14) {
                            delta = 0.5 * (L - R) / denom;
                            delta = Math.max(-0.5, Math.min(0.5, delta));
                        }
                        const refinedK = bestK + delta;
                        finalU = cp.u - RESNAP_HALFWIDTH + refinedK * RESNAP_STEP;
                    } else {
                        finalU = cp.u - RESNAP_HALFWIDTH + bestK * RESNAP_STEP;
                    }

                    // Wrap to [0, 1)
                    finalU = ((finalU % 1) + 1) % 1;

                    // Only apply if the resnap moved the point (avoid noise)
                    const moved = circularDistance(cp.u, finalU);
                    if (moved > 1e-7 && moved < RESNAP_HALFWIDTH * 1.5) {
                        chains[cp.chainIdx].points[cp.ptIdx] = { row: cp.row, u: finalU };
                        resnapCount++;
                    }
                }

                console.log(`[ParametricExport]   v13.0 GPU re-snap: ${resnapCount}/${allChainPoints.length} points refined (${RESNAP_CANDIDATES} candidates/point, ±${(RESNAP_HALFWIDTH * ROW_PROBE_SAMPLES).toFixed(1)} samples)`);
            }

            // ── Step 4: Insert additional T-rows where chains cross diagonally ──
            // v16.4: Make row insertion budget-aware to avoid exploding outer-wall
            // triangle count (and visual over-tessellation) on high-feature styles.
            const targetOuterBudget = Math.floor(targetTris * SURFACE_CONFIG[0].budgetFrac);

            // v16.11: In local-only mode, the U grid was already generated at the
            // budget-constrained width (finalUCols), so no downsample is needed.
            // In non-local mode, optionally slim the outer-wall base U set before
            // insertion so there is room for feature columns in the later union grid.
            const maxColsAtCurrentRows = Math.floor(targetOuterBudget / (2 * Math.max(1, numOuterRows - 1))) + 1;
            const desiredBaseCols = LOCAL_ONLY_OUTER_ADAPTATION
                ? maxColsAtCurrentRows
                : Math.max(160, Math.floor(maxColsAtCurrentRows * 0.82));
            const outerBaseU = (LOCAL_ONLY_OUTER_ADAPTATION && uBasePositions.length <= desiredBaseCols)
                ? uBasePositions // Already at correct size from v16.11 pre-computation
                : downsampleSortedPositions(uBasePositions, Math.min(uBasePositions.length, desiredBaseCols));
            if (outerBaseU.length !== uBasePositions.length) {
                console.log(`[ParametricExport]   v16.4 Outer base downsample: ${uBasePositions.length} → ${outerBaseU.length} columns (pre-union)`);
            }

            // Maximum rows allowed by targetOuterBudget for this base width.
            const maxRowsForBudget = Math.floor(targetOuterBudget / (2 * Math.max(1, outerBaseU.length - 1))) + 1;
            const budgetInsertionCap = Math.max(0, maxRowsForBudget - numOuterRows);
            const maxRowInsertions = LOCAL_ONLY_OUTER_ADAPTATION
                ? 0
                : Math.min(200, Math.floor(numOuterRows * 0.5), budgetInsertionCap);
            // v11.5: adaptive insertion threshold improves ridge coverage on both
            // sharp and smooth features by adding intermediate rows when per-step
            // U-shifts are smaller than legacy 0.005 but still significant.
            const adaptiveInsertThreshold = Math.max(0.0035, 2.0 / Math.max(1, outerBaseU.length));
            const insertion = insertChainGuidedRows(tPositions, chains, maxRowInsertions, adaptiveInsertThreshold);
            let finalT = insertion.tPositions;
            const rowMapping = insertion.rowMapping;
            console.log(`[ParametricExport]   v16.6 T-row insertion: ${insertion.insertedCount} rows added (${numOuterRows} → ${finalT.length}, minUShift=${adaptiveInsertThreshold.toFixed(4)}, cap=${maxRowInsertions}, localOnly=${LOCAL_ONLY_OUTER_ADAPTATION})`);

            // ── Step 5: GPU-probe inserted rows and detect their features ──
            let finalRowFeatures: number[][];
            let insertedRowProbeData: Float32Array[] = []; // used for inserted-row feature detection
            if (insertion.insertedCount > 0) {
                // Find which rows are inserted (negative rowMapping)
                const insertedRowIndices: number[] = [];
                for (let j = 0; j < rowMapping.length; j++) {
                    if (rowMapping[j] < 0) insertedRowIndices.push(j);
                }

                // GPU-probe the inserted rows
                const insertProbeVerts = new Float32Array(insertedRowIndices.length * ROW_PROBE_SAMPLES * 3);
                let ipIdx = 0;
                for (const j of insertedRowIndices) {
                    const tVal = finalT[j];
                    for (let i = 0; i < ROW_PROBE_SAMPLES; i++) {
                        insertProbeVerts[ipIdx++] = i / ROW_PROBE_SAMPLES;
                        insertProbeVerts[ipIdx++] = tVal;
                        insertProbeVerts[ipIdx++] = 0;
                    }
                }

                const insertProbePositions = await this.evaluatePoints(
                    insertProbeVerts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
                );

                // Detect features on inserted rows
                insertedRowProbeData = [];
                for (let k = 0; k < insertedRowIndices.length; k++) {
                    const offset = k * ROW_PROBE_SAMPLES * 3;
                    insertedRowProbeData.push(insertProbePositions.subarray(offset, offset + ROW_PROBE_SAMPLES * 3));
                }
                const insertedResult = detectAllRowFeatures(insertedRowProbeData, ROW_PROBE_SAMPLES);
                const insertedFeatures = insertedResult.allRowFeatures;

                // Build final feature array: original rows keep their features,
                // inserted rows get GPU-detected features (not just interpolated)
                finalRowFeatures = [];
                let insertIdx = 0;
                for (let j = 0; j < rowMapping.length; j++) {
                    if (rowMapping[j] >= 0) {
                        // Original row
                        const origRow = rowMapping[j];
                        finalRowFeatures.push(
                            origRow < allRowFeatures.length ? [...allRowFeatures[origRow]] : []
                        );
                    } else {
                        // Inserted row — use GPU-detected features
                        finalRowFeatures.push(
                            insertIdx < insertedFeatures.length ? insertedFeatures[insertIdx] : []
                        );
                        insertIdx++;
                    }
                }

                const insertedPeaks = insertedFeatures.reduce((sum: number, f: number[]) => sum + f.length, 0);
                console.log(`[ParametricExport]   Inserted rows detected ${insertedPeaks} additional peaks`);
            } else {
                finalRowFeatures = allRowFeatures;
            }

            // Build UV-space chain debug lines for preview overlay visualization.
            // This lets users verify where chain continuity breaks after export.
            const origToFinalRow = new Map<number, number>();
            for (let f = 0; f < rowMapping.length; f++) {
                if (rowMapping[f] >= 0) origToFinalRow.set(rowMapping[f], f);
            }

            const debugLines: ChainDebugLine[] = [];
            for (const chain of chains) {
                if (chain.points.length < 2) continue;
                const remapped: Array<[number, number]> = [];
                for (const pt of chain.points) {
                    const fr = origToFinalRow.get(pt.row);
                    if (fr === undefined || fr < 0 || fr >= finalT.length) continue;
                    remapped.push([pt.u, finalT[fr]]);
                }
                if (remapped.length >= 2) debugLines.push({ points: remapped });
            }

            LAST_CHAIN_DEBUG_DATA = {
                createdAt: Date.now(),
                chainCount: chains.length,
                lineCount: debugLines.length,
                lines: debugLines,
            };

            // ── Step 6: Build UNION feature grid from ALL rows (original + inserted) ──
            // v11.3: Union grid used for ALL surfaces including outer wall.
            // Budget cap: compute max columns from targetTris and T-row count.
            // Formula: maxTris = 2 * (numU-1) * (numT-1) → numU = maxTris/(2*(numT-1)) + 1
            const numTRows = finalT.length;
            const maxOuterColumns = Math.floor(targetOuterBudget / (2 * Math.max(1, numTRows - 1))) + 1;
            const unionU = LOCAL_ONLY_OUTER_ADAPTATION
                ? outerBaseU
                : buildUnionFeatureGrid(outerBaseU, finalRowFeatures, maxOuterColumns);
            const featureColumnsAdded = unionU.length - outerBaseU.length;
            console.log(`[ParametricExport]   Union grid: ${unionU.length} U (base=${outerBaseU.length} + ${featureColumnsAdded} feature columns, budget max=${maxOuterColumns}, localOnly=${LOCAL_ONLY_OUTER_ADAPTATION})`);

            // ── Step 7-9: Generate surfaces ──
            // v11.2: Outer wall uses union grid + per-row patching (no column explosion).
            // Other surfaces use the regular adaptive grid (no features).
            const surfaceStats: string[] = [];
            const allVertArrays: Float32Array[] = [];
            const allIdxArrays: Uint32Array[] = [];
            let vertexOffset = 0;

            // v11.3: Per-row feature patching replaces global column merging
            let outerW = unionU.length; // kept for diagnostics
            let outerQuadMap: Int32Array | null = null; // v11.3: gap-free quad→index mapping

            for (const surf of SURFACE_CONFIG) {
                if (surf.id === 0) {
                    // ═══════════════════════════════════════════
                    // v11.3: PER-ROW PATCHED OUTER WALL — union grid + chain vertex patching
                    // ═══════════════════════════════════════════
                    const targetOuterTris = Math.floor(targetTris * surf.budgetFrac);
                    const cdtResult = buildCDTOuterWall(
                        chains, rowMapping, finalT, unionU,
                        targetOuterTris, surf.id
                    );

                    // v16.9: Stitch vertices REMOVED.
                    // With 100% patch rate, 0 collisions, chain-directed flip,
                    // and 3D quality flip, the stitch fan pass is redundant.
                    // Feature fidelity comes from:
                    //   1. Per-row vertex patching (exact chain positions)
                    //   2. Chain-directed diagonal flip (edges follow ridges)
                    //   3. 3D quality edge flip (optimizes surrounding triangles)
                    // Removing stitch vertices eliminates density banding artifacts
                    // and frees ~4-5% of triangle budget for uniform base density.

                    allVertArrays.push(cdtResult.vertices);

                    if (vertexOffset > 0) {
                        const offsetIndices = new Uint32Array(cdtResult.indices.length);
                        for (let i = 0; i < cdtResult.indices.length; i++) {
                            offsetIndices[i] = cdtResult.indices[i] + vertexOffset;
                        }
                        allIdxArrays.push(offsetIndices);
                    } else {
                        allIdxArrays.push(cdtResult.indices);
                    }

                    const outerVerts = cdtResult.vertices.length / 3;
                    const outerTris = cdtResult.indices.length / 3;
                    vertexOffset += outerVerts;
                    outerW = unionU.length; // grid width = number of columns in union grid
                    outerQuadMap = cdtResult.quadMap; // v11.3: quad→index mapping
                    surfaceStats.push(`  ${surf.name}: ${outerW}×${finalT.length} grid = ${outerTris.toLocaleString()} tris (chains=${chains.length})`);
                } else {
                    // Other surfaces: uniform grid with base U positions
                    const surfBudget = targetTris * surf.budgetFrac;
                    const nonOuterW = uBasePositions.length;
                    const h = Math.max(2, Math.round(surfBudget / (2 * nonOuterW)));
                    const surfT = new Float32Array(h + 1);
                    for (let j = 0; j <= h; j++) surfT[j] = j / h;
                    const grid = generateAdaptiveGrid(uBasePositions, surfT, surf.id, surf.invertWinding);

                    allVertArrays.push(grid.vertices);

                    if (vertexOffset > 0) {
                        const offsetIndices = new Uint32Array(grid.indices.length);
                        for (let i = 0; i < grid.indices.length; i++) {
                            offsetIndices[i] = grid.indices[i] + vertexOffset;
                        }
                        allIdxArrays.push(offsetIndices);
                    } else {
                        allIdxArrays.push(grid.indices);
                    }

                    vertexOffset += grid.vertices.length / 3;
                    const tris = grid.indices.length / 3;
                    const w = grid.w;
                    const h2 = (grid.vertices.length / 3 / w) - 1;
                    surfaceStats.push(`  ${surf.name}: ${w}×${h2} grid = ${tris.toLocaleString()} tris`);
                }
            }

            // Combine all surfaces
            const totalVerts = allVertArrays.reduce((sum, a) => sum + a.length, 0);
            const totalIdxs = allIdxArrays.reduce((sum, a) => sum + a.length, 0);
            const combinedVerts = new Float32Array(totalVerts);
            const combinedIdxs = new Uint32Array(totalIdxs);
            let vOff = 0, iOff = 0;
            for (const v of allVertArrays) { combinedVerts.set(v, vOff); vOff += v.length; }
            for (const ix of allIdxArrays) { combinedIdxs.set(ix, iOff); iOff += ix.length; }

            const vertexCount = combinedVerts.length / 3;
            const triangleCount = combinedIdxs.length / 3;
            const gridMs = performance.now() - gridStart;

            console.log(`[ParametricExport] Grid generation: ${gridMs.toFixed(1)}ms`);
            console.log(`[ParametricExport] Total: ${vertexCount.toLocaleString()} verts, ${triangleCount.toLocaleString()} tris`);
            for (const stat of surfaceStats) console.log(`[ParametricExport] ${stat}`);

            // ═══════════════════════════════════════════
            // PHASE 3: Evaluate Full Mesh (GPU)
            // ═══════════════════════════════════════════
            const gpuStart = performance.now();

            // Write Grid Width (W) to Uniforms — used by relax_vertices shader
            // for row/col neighbor addressing.  chunk4.w is at offset 76 (19 * 4 bytes).
            // v8.2: outerW = union grid width (same topology for all rows)
            const widthUniform = new Float32Array([outerW]);
            this.device.queue.writeBuffer(uniformBuffer, 76, widthUniform.buffer);

            // v8.2: Relaxation DISABLED.  Per-row feature patching writes
            // different U values into the same column across rows.  The
            // relax shader assumes column c has the same U in every row
            // (it averages with left/right neighbors at col±1).  With
            // patched vertices, relaxation would smear the exact feature
            // positions back toward the union-grid median — destroying the
            // per-row precision we just established.
            const resultData = await this.evaluatePoints(
                combinedVerts, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                false, // Snap disabled — union grid has dedicated feature columns
                0      // v8.2: relax=0 — patched per-row U would be smeared by Laplacian
            );

            const gpuMs = performance.now() - gpuStart;

            // ═══════════════════════════════════════════
            // PHASE 4: Post-GPU Quality Improvement (v11.3)
            //
            // v11.3 FIX: chainDirectedFlip and flipEdges3D now use the quadMap
            // from buildCDTOuterWall instead of the broken `quadIdx * 6` formula.
            // The old formula assumed a gap-free index buffer, but seam-guard
            // cells produce gaps, causing index corruption ("tons of bad triangles").
            //
            // v11.2: Per-row patching places vertices at exact chain positions
            // but UV-space diagonal alignment may not be optimal in 3D.
            // After GPU evaluation provides actual XYZ positions, we run:
            //   Stage 1: chainDirectedFlip — forces diagonals along chain edges
            //   Stage 2: flipEdges3D — generic dihedral+angle quality improvement
            // ═══════════════════════════════════════════
            const flip3DStart = performance.now();

            // The outer wall occupies the first outerW × finalT.length vertices
            // in the combined buffer. Its indices are at the start of combinedIdxs.
            const outerH = finalT.length;

            // Stage 1: Chain-directed flip — uses chain topology to force
            // diagonals along ridge lines (v11.3: with quadMap)
            const { flipCount: chainFlips, lockedQuads } = chainDirectedFlip(
                combinedIdxs,    // indices (outer wall at start, mutated in-place)
                unionU,          // column U positions
                outerW,          // grid width (number of columns)
                outerH,          // grid height (number of rows)
                chains,          // feature chains from Phase 2.5
                rowMapping,      // row mapping (final → original)
                false,           // invertWinding = false for outer wall
                outerQuadMap!    // v11.3: quad→index mapping from buildCDTOuterWall
            );
            console.log(`[ParametricExport]   v14.0 chain-directed flip: ${chainFlips} diagonals along ridges (${lockedQuads.size} quads locked)`);

            // Stage 2: Generic 3D edge flip — improves triangle quality using
            // dihedral angle + min-angle criterion on actual 3D positions (v10.2)
            // Skips quads locked by chain-directed flip.
            const genericFlips = flipEdges3D(
                combinedIdxs,    // indices (mutated in-place)
                resultData,      // 3D positions from GPU
                outerW,          // grid width
                outerH,          // grid height
                false,           // invertWinding = false for outer wall
                lockedQuads,     // locked quads from chain-directed flip
                outerQuadMap!    // v11.3: quad→index mapping
            );

            const flip3DMs = performance.now() - flip3DStart;
            console.log(`[ParametricExport]   v11.3 3D edge flip: ${genericFlips} quality flips (${flip3DMs.toFixed(1)}ms)`);

            // v16.9: Stitch triangulation REMOVED.
            // Chain-directed flip + 3D quality flip provide all necessary
            // topology optimization. No fan re-triangulation needed.
            const finalIndices = combinedIdxs;
            console.log('[ParametricExport]   v16.9 stitch triangulation: removed (chain flip + 3D flip handle topology)');

            const finalVertexCount = resultData.length / 3;
            const finalTriangleCount = finalIndices.length / 3;

            // NaN guard
            let nanCount = 0;
            for (let i = 0; i < resultData.length; i++) {
                if (!Number.isFinite(resultData[i])) {
                    resultData[i] = 0;
                    nanCount++;
                }
            }
            if (nanCount > 0) {
                console.warn(`[ParametricExport] Stripped ${nanCount} NaN/Inf values.`);
            }

            const totalMs = performance.now() - startTime;
            console.log(`[ParametricExport] Complete: ${totalMs.toFixed(0)}ms (curvature: ${curvMs.toFixed(0)}ms, grid: ${gridMs.toFixed(0)}ms, GPU: ${gpuMs.toFixed(0)}ms)`);

            return {
                mesh: {
                    vertices: resultData,
                    indices: finalIndices,
                    vertexCount: finalVertexCount,
                    triangleCount: finalTriangleCount,
                },
                computeTimeMs: totalMs,
                gridDimensions: { nu: outerW, nt: finalT.length - 1 },
                adaptiveStats: {
                    densityRatio: densityRatioT,
                    featurePeaksSnapped,
                    tCurvatureRange: [tMin, tMax],
                    uCurvatureRange: [uMin, uMax],
                },
            };

        } finally {
            buffers.forEach(b => b.destroy());
        }
    }
}
