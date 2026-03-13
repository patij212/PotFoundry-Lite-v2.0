/**
 * parametric/ChainLinker.ts — Feature chain linking, interpolation, and seam-wrap.
 *
 * Links per-row feature detections across adjacent rows into continuous chains
 * (polylines through (u, t) space), post-processes chains to remove duplicates
 * and re-snap to measured peaks, and inserts chain-guided T-rows for diagonal
 * feature coverage.
 *
 * Extracted from ParametricExportComputer.ts for modularity and testability.
 *
 * @module ChainLinker
 */

import type { ChainPoint, FeatureChain, FeaturePoint } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum circular U-distance to link a feature in row j to a feature in row j+1.
 * Features farther apart than this are considered unrelated.
 * Larger values follow diagonal/spiral features; too large risks false connections.
 */
export const CHAIN_LINK_RADIUS = 0.02;

/** Maximum circular U-distance for re-snapping chain points to measured peaks. */
const RESNAP_RADIUS = 0.005;

/** Weight on acceleration penalty in cost-based scoring (v24: prevents zigzag at bifurcations). */
const ACCEL_PENALTY_WEIGHT = 0.3;

/** R51: Rolling window size for prominence tracking in chain extension. */
const PROMINENCE_WINDOW = 10;

/** R51: Weight of prominence mismatch penalty in cost function. */
const PROMINENCE_MISMATCH_PENALTY = 0.5;

/** R51: Minimum chain rows for stable-chain bypass of prominence gating. */
const PROMINENCE_STABLE_CHAIN_MIN_ROWS = 200;

/** R51: Maximum roughness for stable-chain bypass of prominence gating. */
const PROMINENCE_STABLE_ROUGHNESS = 0.001;

/**
 * Bonus subtracted from cost for each match in non-crossing DP (v25).
 * Ensures matching is always preferred over skipping when a valid pair exists.
 * Must exceed the maximum possible score for any valid (chain, feature) pair.
 * Scores bounded by ~2 × CHAIN_LINK_RADIUS + ACCEL_PENALTY_WEIGHT ×
 * CHAIN_LINK_RADIUS ≈ 0.046, so 1.0 provides ≥20× margin.
 */
const MATCH_BONUS = 1.0;

// ============================================================================
// Circular Helpers
// ============================================================================

/**
 * Circular distance between two U positions on [0, 1).
 *
 * @param a  First U position
 * @param b  Second U position
 * @returns Unsigned shortest-arc distance in [0, 0.5]
 */
function circularDistance(a: number, b: number): number {
    const d = Math.abs(a - b);
    return d > 0.5 ? 1 - d : d;
}

/**
 * Compute signed circular delta between two U positions on [0, 1).
 *
 * Returns a value in [-0.5, 0.5] representing the shortest signed arc from
 * `fromU` to `toU`.
 *
 * @param fromU  Start U position in [0, 1)
 * @param toU    End U position in [0, 1)
 * @returns Signed delta in [-0.5, 0.5]
 */
export function circularSignedDelta(fromU: number, toU: number): number {
    let d = toU - fromU;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return d;
}

/**
 * Lift a wrapped U coordinate to the neighbourhood of a reference unwrapped value.
 *
 * Given a U in [0, 1) and an unwrapped reference (possibly outside [0, 1)),
 * returns the integer-shifted version of `uWrapped` closest to `referenceUnwrapped`.
 *
 * @param uWrapped           U position in [0, 1)
 * @param referenceUnwrapped Unwrapped reference value
 * @returns Lifted U closest to referenceUnwrapped
 */
export function liftUToReference(uWrapped: number, referenceUnwrapped: number): number {
    const base = uWrapped;
    const k = Math.round(referenceUnwrapped - base);
    return base + k;
}

// ============================================================================
// Chain Unwrapping & Roughness
// ============================================================================

/**
 * Unwrap a chain's U positions into a monotone sequence (no 0/1 jumps).
 *
 * Consecutive points may jump across the u=0/1 seam. This function
 * produces an unwrapped sequence where each step is the minimal circular
 * delta, allowing linear operations (slope, roughness) on the result.
 *
 * @param chain  Feature chain with wrapped U positions
 * @returns Array of unwrapped U values (same length as chain.points)
 */
export function unwrapChain(chain: FeatureChain): number[] {
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

/**
 * Compute the roughness (average second-derivative magnitude) of a chain's U path.
 *
 * Higher roughness indicates a noisy or zigzagging chain. Used to choose
 * between duplicate chains tracking the same ridge — the smoother one wins.
 *
 * @param chain  Feature chain
 * @returns Roughness measure (0 = perfectly smooth, higher = noisier)
 */
export function chainRoughness(chain: FeatureChain): number {
    if (chain.points.length < 3) return 0;
    const u = unwrapChain(chain);
    let acc = 0;
    for (let i = 1; i < u.length - 1; i++) {
        acc += Math.abs(u[i - 1] - 2 * u[i] + u[i + 1]);
    }
    return acc / Math.max(1, u.length - 2);
}

// ============================================================================
// Chain Diagnostics
// ============================================================================

/**
 * Compute diagnostic metrics for chain jaggedness analysis.
 *
 * @param chains          Feature chains to analyze
 * @param allRowFeatures  Per-row measured feature U positions
 * @returns Diagnostic object with per-chain and global metrics
 */
export function computeChainDiagnostics(
    chains: FeatureChain[],
    allRowFeatures: number[][],
): {
    perChain: Array<{ maxLinearDeviation: number; maxConsecutiveDelta: number; length: number }>;
    minSameKindSpacing: number;
} {
    const perChain: Array<{ maxLinearDeviation: number; maxConsecutiveDelta: number; length: number }> = [];

    for (const chain of chains) {
        const pts = chain.points;
        const unwrapped = unwrapChain(chain);

        // Max consecutive-point U-delta (seam-unwrapped)
        let maxDelta = 0;
        for (let i = 1; i < unwrapped.length; i++) {
            const d = Math.abs(unwrapped[i] - unwrapped[i - 1]);
            if (d > maxDelta) maxDelta = d;
        }

        // Max deviation from local 5-point linear fit
        let maxDev = 0;
        for (let i = 2; i < unwrapped.length - 2; i++) {
            // Fit line through points i-2..i+2, measure deviation at i
            const x0 = pts[i - 2].row, x4 = pts[i + 2].row;
            const y0 = unwrapped[i - 2], y4 = unwrapped[i + 2];
            const span = x4 - x0;
            if (span === 0) continue;
            const predicted = y0 + (y4 - y0) * (pts[i].row - x0) / span;
            const dev = Math.abs(unwrapped[i] - predicted);
            if (dev > maxDev) maxDev = dev;
        }

        perChain.push({ maxLinearDeviation: maxDev, maxConsecutiveDelta: maxDelta, length: pts.length });
    }

    // Min same-kind feature spacing per row
    let minSpacing = Infinity;
    for (const row of allRowFeatures) {
        if (row.length < 2) continue;
        const sorted = [...row].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
            const d = sorted[i] - sorted[i - 1];
            if (d > 0 && d < minSpacing) minSpacing = d;
        }
        // Wrap-around distance
        const wrap = 1 - sorted[sorted.length - 1] + sorted[0];
        if (wrap > 0 && wrap < minSpacing) minSpacing = wrap;
    }

    return { perChain, minSameKindSpacing: minSpacing === Infinity ? 0 : minSpacing };
}

// ============================================================================
// Chain Deduplication & Post-Processing
// ============================================================================

/**
 * Remove near-parallel duplicate chains that track the same ridge.
 * Keeps the smoother/longer representative chain.
 *
 * Two chains are considered duplicates if they share enough rows and
 * their mean/max U-distance is below a tight threshold.
 *
 * @param chains  Array of feature chains
 * @returns Deduplicated array of chains
 */
export function suppressDuplicateChains(chains: FeatureChain[]): FeatureChain[] {
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
 *
 * @param chain           Feature chain to re-snap
 * @param allRowFeatures  Per-row measured feature U positions
 * @returns New chain with snapped positions
 */
export function resnapChainToMeasuredPeaks(
    chain: FeatureChain,
    allRowFeatures: number[][]
): FeatureChain {
    const points: ChainPoint[] = chain.points.map((p) => {
        const rowFeats = (p.row >= 0 && p.row < allRowFeatures.length)
            ? allRowFeatures[p.row]
            : [];
        if (rowFeats.length === 0) return p;

        // Find nearest measured peak
        let bestU = p.u;
        let bestD = RESNAP_RADIUS;
        for (const u of rowFeats) {
            const d = circularDistance(p.u, u);
            if (d < bestD) {
                bestD = d;
                bestU = u;
            }
        }
        return { row: p.row, u: bestU };
    });
    return { ...chain, points };
}

/**
 * v13.0: Post-process feature chains.
 *
 * Pipeline:
 *   1. Suppress duplicate chains (same ridge tracked by two chains)
 *
 * NO smoothing. NO DP "optimization". NO re-snapping to measured peaks.
 * The detected peaks from GPU probe data ARE the ground truth.
 * Re-snapping was found to be a no-op (chain points already sit at
 * measured peak positions from the linker's greedy nearest-neighbor).
 *
 * @param chains  Raw linked chains
 * @returns Post-processed chains
 */
export function postProcessFeatureChains(
    chains: FeatureChain[],
): FeatureChain[] {
    return suppressDuplicateChains(chains);
}

// ============================================================================
// Chain Smoothing & Confidence Filtering
// ============================================================================

/** R43: Increased from 50 to 200 for smoother mesh-chain trajectories (~0.001 maxConsecDelta). */
const WH_LAMBDA = 200;

/**
 * Solve a symmetric positive-definite pentadiagonal linear system A·x = rhs
 * using banded LDLᵀ factorization.
 *
 * A has three bands: diag (main), off1 (±1), off2 (±2). Because A is symmetric
 * only the lower triangle is needed. The factorization overwrites diag/off1/off2
 * in-place.
 *
 * @param diag  Main diagonal of A (length n, modified in-place)
 * @param off1  First sub/super-diagonal (length n-1, modified in-place)
 * @param off2  Second sub/super-diagonal (length n-2, modified in-place)
 * @param rhs   Right-hand side vector (length n)
 * @returns Solution vector x (length n)
 */
function solvePentadiagonalSPD(
    diag: Float64Array,
    off1: Float64Array,
    off2: Float64Array,
    rhs: Float64Array
): Float64Array {
    const n = diag.length;
    // L factors: l1[i] = L[i+1, i], l2[i] = L[i+2, i]
    const l1 = new Float64Array(n - 1);
    const l2 = new Float64Array(n - 2);

    // Forward pass: compute L and D (D stored in diag)
    for (let i = 0; i < n; i++) {
        // Subtract contributions from previous columns
        if (i >= 1) {
            diag[i] -= l1[i - 1] * l1[i - 1] * diag[i - 1];
        }
        if (i >= 2) {
            diag[i] -= l2[i - 2] * l2[i - 2] * diag[i - 2];
        }
        // Compute l1[i] = off1[i] / diag[i]
        if (i < n - 1) {
            if (i >= 1) {
                off1[i] -= l1[i - 1] * diag[i - 1] * l2[i - 1];
            }
            l1[i] = off1[i] / diag[i];
        }
        // Compute l2[i] = off2[i] / diag[i]
        if (i < n - 2) {
            l2[i] = off2[i] / diag[i];
        }
    }

    // Forward solve: L·z = rhs (z stored in rhs)
    for (let i = 1; i < n; i++) {
        rhs[i] -= l1[i - 1] * rhs[i - 1];
        if (i >= 2) {
            rhs[i] -= l2[i - 2] * rhs[i - 2];
        }
    }

    // Diagonal solve: D·y = z
    for (let i = 0; i < n; i++) {
        rhs[i] /= diag[i];
    }

    // Back solve: Lᵀ·x = y
    for (let i = n - 2; i >= 0; i--) {
        rhs[i] -= l1[i] * rhs[i + 1];
        if (i < n - 2) {
            rhs[i] -= l2[i] * rhs[i + 2];
        }
    }

    return rhs;
}

/**
 * Whittaker-Henderson smoother for feature chain U-paths.
 *
 * Minimizes  ||y - s||² + λ · ||D₂ s||²  where D₂ is the second-difference
 * operator. This produces the optimal balance between fidelity to the
 * detected peaks and smoothness of the resulting path.
 *
 * The normal equations (I + λ D₂ᵀD₂) s = y form a symmetric positive-definite
 * pentadiagonal system solved by banded LDLᵀ factorization — O(n) time, O(n)
 * memory, no iterative convergence needed.
 *
 * TODO: D₂ assumes uniform row spacing. For grids with non-uniform t-spacing,
 * the operator should be weighted by 1/Δtᵢ² per row pair (Verifier C5).
 *
 * @param chain   Feature chain to smooth
 * @param lambda  Smoothing penalty (default: WH_LAMBDA = 200)
 * @returns New chain with smoothed U positions
 */
export function whittakerSmooth(
    chain: FeatureChain,
    lambda: number = WH_LAMBDA
): FeatureChain {
    const n = chain.points.length;
    if (n < 3) return chain;

    // Unwrap to monotone sequence for seam-safe arithmetic
    const unwrapped = unwrapChain(chain);
    const y = Float64Array.from(unwrapped);

    // Build pentadiagonal bands of (I + λ D₂ᵀD₂)
    const diag = new Float64Array(n);
    const off1 = new Float64Array(n - 1);
    const off2 = new Float64Array(n - 2);

    // D₂ᵀD₂ contributions to main diagonal
    diag[0]     = 1 + lambda;
    diag[1]     = 1 + 5 * lambda;
    for (let i = 2; i <= n - 3; i++) {
        diag[i] = 1 + 6 * lambda;
    }
    diag[n - 2] = 1 + 5 * lambda;
    diag[n - 1] = 1 + lambda;

    // First sub/super-diagonal
    off1[0]     = -2 * lambda;
    for (let i = 1; i <= n - 3; i++) {
        off1[i] = -4 * lambda;
    }
    off1[n - 2] = -2 * lambda;

    // Second sub/super-diagonal
    for (let i = 0; i < n - 2; i++) {
        off2[i] = lambda;
    }

    // Solve (I + λ D₂ᵀD₂) s = y
    const s = solvePentadiagonalSPD(diag, off1, off2, y);

    // Re-wrap to [0, 1) and build new chain
    const newPoints: ChainPoint[] = chain.points.map((p, i) => ({
        row: p.row,
        u: ((s[i] % 1) + 1) % 1,
    }));

    return { ...chain, points: newPoints };
}

/** Default baseline mesh-guide blend weight toward the smoothed chain path. */
const MESH_GUIDE_BASE_BLEND_WEIGHT = 0.40;  // R42: was 0.12 — 40% baseline correction

/** Additional blend weight unlocked at strongly jagged points. */
const MESH_GUIDE_ADAPTIVE_BLEND_GAIN = 0.60;  // R42: was 0.88 — maintains BASE + GAIN = 1.00

/** Local second-difference magnitude that triggers full adaptive mesh guidance. */
const MESH_GUIDE_ACCEL_FULL_BLEND = 0.002;  // R42: was 0.003 — trigger adaptive earlier

/**
 * Maximum per-point U displacement allowed when building mesh-guide chains.
 *
 * Keeps the mesh path visually smoother than the raw chain while staying close
 * to the exact GPU re-snapped feature positions that generated the detections.
 */
const MESH_GUIDE_MAX_POINT_SHIFT = 0.005;  // R42: was 0.003, Verifier-amended from 0.008 (~3.4 grid cells)

/**
 * Blend a raw chain toward its smoothed counterpart with a hard displacement cap.
 *
 * The smoothed chain provides a better large-scale trajectory, but using it
 * directly can drift the mesh away from the exact measured ridge/valley. This
 * helper moves each point only part of the way toward the smoothed position and
 * never more than `maxPointShift` in circular U-space.
 *
 * If the chains do not have matching row topology, the raw chain is returned
 * unchanged to preserve constraint integrity.
 *
 * @param rawChain        Exact post-repair chain
 * @param smoothedChain   Smoothed guide chain with matching rows
 * @param blendWeight     Baseline fraction of the raw→smoothed delta to apply
 * @param maxPointShift   Hard cap on final per-point displacement
 * @returns Mesh-guide chain suitable for downstream tessellation
 */
export function blendTowardSmoothedChain(
    rawChain: FeatureChain,
    smoothedChain: FeatureChain,
    blendWeight: number = MESH_GUIDE_BASE_BLEND_WEIGHT,
    maxPointShift: number = MESH_GUIDE_MAX_POINT_SHIFT
): FeatureChain {
    const n = rawChain.points.length;
    if (n === 0 || smoothedChain.points.length !== n) return rawChain;

    for (let i = 0; i < n; i++) {
        if (rawChain.points[i].row !== smoothedChain.points[i].row) {
            return rawChain;
        }
    }

    const clampedBaseBlend = Math.max(0, Math.min(1, blendWeight));
    const rawUnwrapped = unwrapChain(rawChain);
    const smoothUnwrapped = unwrapChain(smoothedChain);
    const newPoints: ChainPoint[] = new Array(n);

    for (let i = 0; i < n; i++) {
        const rawPt = rawChain.points[i];
        const rawU = rawUnwrapped[i];
        const smoothU = smoothUnwrapped[i];
        let accel = 0;
        if (i > 0 && i < n - 1) {
            accel = Math.abs(rawUnwrapped[i - 1] - 2 * rawU + rawUnwrapped[i + 1]);
        }
        const severity = Math.max(0, Math.min(1, accel / MESH_GUIDE_ACCEL_FULL_BLEND));
        const adaptiveBlend = Math.max(0, Math.min(1,
            clampedBaseBlend + MESH_GUIDE_ADAPTIVE_BLEND_GAIN * severity
        ));
        const desiredShift = (smoothU - rawU) * adaptiveBlend;
        const finalShift = Math.max(-maxPointShift, Math.min(maxPointShift, desiredShift));
        newPoints[i] = {
            row: rawPt.row,
            u: ((rawU + finalShift) % 1 + 1) % 1,
        };
    }

    return { ...rawChain, points: newPoints };
}

/**
 * Minimum chain length (in rows) to be considered a real feature.
 * Shorter chains are likely from noise peaks passing the prominence gate.
 */
const MIN_CHAIN_LENGTH = 10;

/**
 * Maximum roughness (2nd-derivative magnitude) for a chain to survive filtering.
 * Chains above this threshold are too noisy to represent real mathematical features.
 */
const MAX_CHAIN_ROUGHNESS = 0.008;

/**
 * Savitzky-Golay smoothing window half-width (in points).
 * The full window is 2*SMOOTH_HALFWIDTH + 1 points.
 * Larger values produce smoother paths but can over-smooth tight curves.
 * v22.1: Increased from 3 to 8 for stronger multi-row oscillation removal.
 */
const SMOOTH_HALFWIDTH = 8;

/**
 * Remove chains that are too short or too noisy to represent real features.
 *
 * The chain linker's greedy matching can produce short chains from noise peaks
 * that pass the prominence gate at consistent U positions across a few rows.
 * This filter removes them before they become CDT constraints.
 *
 * @param chains           Array of feature chains
 * @param minLength        Minimum chain length in rows (default: MIN_CHAIN_LENGTH)
 * @param maxRoughness     Maximum allowed roughness (default: MAX_CHAIN_ROUGHNESS)
 * @returns Filtered array of chains
 */
export function filterLowConfidenceChains(
    chains: FeatureChain[],
    minLength: number = MIN_CHAIN_LENGTH,
    maxRoughness: number = MAX_CHAIN_ROUGHNESS
): FeatureChain[] {
    const result: FeatureChain[] = [];
    let dropped = 0;
    const SEAM_NEAR_THRESHOLD = 0.002;  // Filter chains within 0.2% of seam boundary
    
    for (const chain of chains) {
        if (chain.points.length < minLength) { dropped++; continue; }
        const rough = chainRoughness(chain);
        if (rough > maxRoughness) { dropped++; continue; }
        
        // R28: Seam guard — reject chains that have points near both U=0 and U=1.
        // These wrap-around chains create coordinate system confusion in CDT.
        let hasNearZero = false, hasNearOne = false;
        for (const pt of chain.points) {
            if (pt.u < SEAM_NEAR_THRESHOLD) hasNearZero = true;
            if (pt.u > 1 - SEAM_NEAR_THRESHOLD) hasNearOne = true;
        }
        if (hasNearZero && hasNearOne) {
            // Chain spans the seam — skip it, CDT can't handle wrap-around topology
            dropped++;
            continue;
        }
        
        result.push(chain);
    }
    if (dropped > 0) {
        console.log(`[ChainLinker] filterLowConfidenceChains: dropped ${dropped}/${chains.length} chains (minLen=${minLength}, maxRoughness=${maxRoughness})`);
    }
    return result;
}

// ============================================================================
// R51: Post-Linking Chain Validation
// ============================================================================

/** R51: Minimum U-stdev threshold for a chain's stable core to be considered valid. */
const STABLE_CORE_THRESHOLD = 0.0005;

/** R51: Minimum chain length for stable core validation. */
const VALIDATE_MIN_LENGTH = 20;

/** R51: Minimum length of contiguous wrong-feature run to trigger truncation. */
const WRONG_SEGMENT_MIN_RUN = 3;

/**
 * R51: Validate and repair chains by checking tail vertices against the
 * chain's stable core identity. Truncates chain tails that track the wrong
 * feature (birth/death zone artifacts).
 *
 * Algorithm:
 *   1. For each chain, compute "stable core" (middle 60%) U-stdev.
 *   2. If core is unstable or chain too short, skip.
 *   3. Compute core identity: mean U + linear U-trend.
 *   4. Check tail vertices (first/last 20%) against trend extrapolation.
 *   5. If a contiguous run of ≥3 wrong-feature vertices is found, truncate.
 *   6. Drop chains that became too short after truncation.
 *
 * @param chains               Feature chains to validate
 * @param allRowTypedFeatures  Per-row classified features with kind info
 * @param minChainLength       Minimum chain length after truncation (default: MIN_CHAIN_LENGTH)
 * @returns Validated chains (some may be truncated or removed)
 */
export function validateAndRepairChains(
    chains: FeatureChain[],
    allRowTypedFeatures: FeaturePoint[][],
    minChainLength: number = MIN_CHAIN_LENGTH,
): FeatureChain[] {
    const result: FeatureChain[] = [];
    let truncated = 0;
    let dropped = 0;

    for (const chain of chains) {
        const n = chain.points.length;
        // Skip short chains — not enough data for meaningful core validation
        if (n < VALIDATE_MIN_LENGTH) {
            result.push(chain);
            continue;
        }

        // Compute stable core boundaries (middle 60%)
        const coreStart = Math.floor(n * 0.2);
        const coreEnd = Math.ceil(n * 0.8);
        const corePoints = chain.points.slice(coreStart, coreEnd);

        // Unwrap core U positions to handle seam crossings
        const coreUnwrapped: number[] = [corePoints[0].u];
        for (let i = 1; i < corePoints.length; i++) {
            coreUnwrapped.push(liftUToReference(corePoints[i].u, coreUnwrapped[i - 1]));
        }

        // Check core stability via U-stdev
        const coreMean = coreUnwrapped.reduce((a, b) => a + b, 0) / coreUnwrapped.length;
        const coreStdev = Math.sqrt(
            coreUnwrapped.reduce((s, u) => s + (u - coreMean) ** 2, 0) / coreUnwrapped.length
        );
        if (coreStdev > STABLE_CORE_THRESHOLD) {
            // No reliable identity — skip validation for this chain
            result.push(chain);
            continue;
        }

        // Compute linear U-trend via least-squares fit on core
        // U(rowIndex) = slope * rowIndex + intercept
        const coreN = coreUnwrapped.length;
        let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
        for (let i = 0; i < coreN; i++) {
            const x = coreStart + i;
            const y = coreUnwrapped[i];
            sumX += x;
            sumY += y;
            sumXX += x * x;
            sumXY += x * y;
        }
        const denom = coreN * sumXX - sumX * sumX;
        const slope = denom !== 0 ? (coreN * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / coreN;

        // Validate tail vertices against trend extrapolation
        const chainKind = chain.kind;
        // Use tolerance based on core stdev, with minimum floor
        const tolerance = Math.max(coreStdev * 5, 0.001);

        // Check front tail (first 20%)
        let frontTruncate = 0;
        {
            let wrongRun = 0;
            let maxWrongRun = 0;
            let maxWrongRunEnd = 0;
            for (let i = 0; i < coreStart; i++) {
                const expectedU = slope * i + intercept;
                const actualU = liftUToReference(chain.points[i].u, expectedU);
                const deviation = Math.abs(actualU - expectedU);
                // Check if a same-kind feature closer to expectedU exists
                const row = chain.points[i].row;
                let isWrong = false;
                if (deviation > tolerance && row < allRowTypedFeatures.length) {
                    const rowTyped = allRowTypedFeatures[row];
                    const sameKind = rowTyped.filter(t => !chainKind || t.kind === chainKind);
                    for (const fp of sameKind) {
                        const fpLifted = liftUToReference(fp.u, expectedU);
                        if (Math.abs(fpLifted - expectedU) < deviation * 0.5) {
                            isWrong = true;
                            break;
                        }
                    }
                }
                if (isWrong) {
                    wrongRun++;
                    if (wrongRun > maxWrongRun) {
                        maxWrongRun = wrongRun;
                        maxWrongRunEnd = i + 1;
                    }
                } else {
                    wrongRun = 0;
                }
            }
            if (maxWrongRun >= WRONG_SEGMENT_MIN_RUN) {
                frontTruncate = maxWrongRunEnd;
            }
        }

        // Check back tail (last 20%)
        let backTruncate = n;
        {
            let wrongRun = 0;
            let maxWrongRun = 0;
            let maxWrongRunStart = n;
            for (let i = n - 1; i >= coreEnd; i--) {
                const expectedU = slope * i + intercept;
                const actualU = liftUToReference(chain.points[i].u, expectedU);
                const deviation = Math.abs(actualU - expectedU);
                const row = chain.points[i].row;
                let isWrong = false;
                if (deviation > tolerance && row < allRowTypedFeatures.length) {
                    const rowTyped = allRowTypedFeatures[row];
                    const sameKind = rowTyped.filter(t => !chainKind || t.kind === chainKind);
                    for (const fp of sameKind) {
                        const fpLifted = liftUToReference(fp.u, expectedU);
                        if (Math.abs(fpLifted - expectedU) < deviation * 0.5) {
                            isWrong = true;
                            break;
                        }
                    }
                }
                if (isWrong) {
                    wrongRun++;
                    if (wrongRun > maxWrongRun) {
                        maxWrongRun = wrongRun;
                        maxWrongRunStart = i;
                    }
                } else {
                    wrongRun = 0;
                }
            }
            if (maxWrongRun >= WRONG_SEGMENT_MIN_RUN) {
                backTruncate = maxWrongRunStart;
            }
        }

        // Apply truncation if needed
        if (frontTruncate > 0 || backTruncate < n) {
            const newPoints = chain.points.slice(frontTruncate, backTruncate);
            if (newPoints.length >= minChainLength) {
                result.push({ ...chain, points: newPoints });
                truncated++;
            } else {
                dropped++;
            }
        } else {
            result.push(chain);
        }
    }

    if (truncated > 0 || dropped > 0) {
        console.log(`[ChainLinker] validateAndRepairChains: truncated=${truncated}, dropped=${dropped}/${chains.length}`);
    }
    return result;
}

/**
 * Apply Savitzky-Golay smoothing to a chain's U positions, removing
 * per-row jitter while preserving the true feature trajectory.
 *
 * The mathematical feature is a smooth curve through (u, t) space.
 * Each row's detected peak position contains sampling jitter from the
 * 8192-sample probe (±0.00006 at best). After linking and GPU re-snap,
 * consecutive rows' U positions still zigzag slightly. This creates
 * serrated chain edges in the mesh.
 *
 * Savitzky-Golay filtering fits local quadratic polynomials, preserving
 * slopes (the chain can be diagonal/spiraling) while removing noise.
 * The filter operates on unwrapped U to handle seam crossings, then
 * re-wraps to [0, 1).
 *
 * @param chain      Feature chain to smooth
 * @param halfWidth  Smoothing window half-width (default: SMOOTH_HALFWIDTH)
 * @returns New chain with smoothed U positions
 */
export function smoothChainPath(
    chain: FeatureChain,
    halfWidth: number = SMOOTH_HALFWIDTH
): FeatureChain {
    const n = chain.points.length;
    if (n < 3) return chain; // Too short for any meaningful smoothing

    // Adaptive halfWidth: use smaller window for short chains
    const m = Math.min(halfWidth, Math.floor((n - 1) / 2));
    if (m < 1) return chain;

    // Unwrap to monotone sequence for seam-safe arithmetic
    const unwrapped = unwrapChain(chain);

    // Mirror-extend the array for boundary handling.
    // This eliminates the boundary/interior split and gives every point
    // full SG treatment, preserving curvature at chain boundaries.
    const extended = new Float64Array(n + 2 * m);
    // Mirror leading boundary
    for (let i = 0; i < m; i++) {
        extended[i] = 2 * unwrapped[0] - unwrapped[m - i];
    }
    // Copy interior
    for (let i = 0; i < n; i++) {
        extended[m + i] = unwrapped[i];
    }
    // Mirror trailing boundary
    for (let i = 0; i < m; i++) {
        extended[m + n + i] = 2 * unwrapped[n - 1] - unwrapped[n - 2 - i];
    }

    // Savitzky-Golay quadratic smoothing (degree 2, window 2*m+1)
    // For a quadratic fit over window [-m, m], the SG coefficients for the
    // central value (0th derivative) are:
    //   c[k] = (3m(m+1) - 1 - 5k²) / norm
    // where norm = (2m+1)(2m+3)(2m-1)/3  (ensures coefficients sum to 1).
    const w = 2 * m + 1;
    const denom = (w * (2 * m + 3) * (2 * m - 1)) / 3;
    const coeffs = new Float64Array(w);
    for (let k = -m; k <= m; k++) {
        coeffs[k + m] = (3 * m * (m + 1) - 1 - 5 * k * k) / denom;
    }

    // Apply SG to extended array, extract middle n values
    const smoothed = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = -m; k <= m; k++) {
            sum += coeffs[k + m] * extended[m + i + k];
        }
        smoothed[i] = sum;
    }

    // Re-wrap to [0, 1) and build new chain
    const newPoints: ChainPoint[] = chain.points.map((p, i) => ({
        row: p.row,
        u: ((smoothed[i] % 1) + 1) % 1,
    }));

    return { ...chain, points: newPoints };
}

// ============================================================================
// Core Chain Linking
// ============================================================================

/**
 * Link per-row feature detections across adjacent rows into continuous chains.
 *
 * Features are arbitrary and unique to each style — they can run at ANY angle:
 * vertical, diagonal, curved, spiral. This function uses greedy nearest-neighbor
 * linking to build polylines through (u, rowIndex) space.
 *
 * v24: Momentum now used for ALL matching (not just gap bridging) to reduce
 * zigzag at feature bifurcation zones where nearby features compete.
 *
 * Algorithm:
 *   1. For each consecutive pair of rows (j, j+1), find the best matching
 *      between features in row j and features in row j+1 using circular
 *      U-distance. Matches must be within the given linkRadius.
 *   2. Build chains by connecting matched features across rows.
 *      Each chain is a sequence of (u, row) points.
 *   3. Unmatched features start new chains.
 *   4. Chains shorter than 2 points are discarded (noise).
 *
 * @param allRowFeatures  Per-row detected feature U positions
 * @param numRows         Total number of T rows
 * @param linkRadius      Maximum circular U-distance for linking
 * @param maxMissCount    Maximum consecutive row misses before closing a chain
 * @param momentumScale   Multiplier for search radius when using momentum prediction
 * @param allRowTypedFeatures  Optional per-row classified features with full FeaturePoint data (R51)
 * @returns Array of FeatureChains
 */
export function linkFeatureChainsCore(
    allRowFeatures: number[][],
    numRows: number,
    linkRadius: number,
    maxMissCount: number,
    momentumScale: number,
    allRowTypedFeatures?: FeaturePoint[][],
): FeatureChain[] {
    // Active chains: chains being extended from the previous row
    // v10.6: Added missCount to support momentum-based gap bridging
    // R51: Added prominence tracking for birth/death gating
    interface ActiveChain {
        chain: FeatureChain;
        missCount: number;        // consecutive rows without a match
        predictedU: number;       // extrapolated U for next row
        recentProminence: number[];   // R51: rolling window of normalized prominences
        medianProminence: number;     // R51: median of recentProminence
        prominenceDecaying: boolean;  // R51: true if prominence trend is negative
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

    // Pre-allocate DP buffers for non-crossing matching (reused across rows).
    // K ≈ 6-72 depending on style (WaveInterference worst case K ≈ 72).
    // Cost: ~53μs per row at K=M=72 (~14ms for 264 rows) — negligible.
    let _dpCostBuf = new Float64Array(0);
    let _dpTableBuf = new Float64Array(0);
    let _dpFromBuf = new Uint8Array(0);

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

        // ============================================================
        // NON-CROSSING DP MATCHING (v25)
        //
        // Replaces greedy sorted-scan with non-crossing bipartite matching
        // via O(K×M) dynamic programming. Chains sorted by U position can
        // only match features in the same U order, making zigzag crossings
        // structurally impossible.
        //
        // Why same-kind features never cross in U-space:
        //   1. Superformula: extrema at θ_k = 4πk/m preserve order under
        //      continuous m variation (shift proportionally, never swap).
        //   2. Spiral/Wave: uniform phase velocity → constant spacing in U,
        //      features translate but never overtake each other.
        //   3. Product styles (HarmonicRipples): fold bifurcation theorem —
        //      same-kind extrema of f(θ)=g₁(θ)·g₂(θ) merge/split through
        //      degeneracies but never swap positions (implicit function thm).
        //   4. Defensive: if crossing did occur, the DP produces a clean
        //      chain break (missCount++) rather than a zigzag artifact.
        // ============================================================
        const usedFeats = new Set<number>();
        const usedChains = new Set<number>();
        const newActive: ActiveChain[] = [];

        const K = activeChains.length;
        const M = rowFeats.length;
        const matches: Array<[number, number]> = [];

        if (K > 0) {
            // Step 1: Circular linearization — find cut in largest gap of
            // chain predictedU positions (C6: use predictedU, not last-assigned U)
            const chainUs = new Array<number>(K);
            for (let ci = 0; ci < K; ci++) chainUs[ci] = activeChains[ci].predictedU;
            const sortedForCut = chainUs.slice().sort((a, b) => a - b);
            let bestGap = 0, cutU = 0;
            for (let ci = 0; ci < K; ci++) {
                const nextIdx = (ci + 1) % K;
                const curr = sortedForCut[ci];
                const next = sortedForCut[nextIdx];
                const gap = ci === K - 1 ? (1 - curr + next) : (next - curr);
                if (gap > bestGap) {
                    bestGap = gap;
                    cutU = ci === K - 1
                        ? ((curr + next + 1) / 2) % 1
                        : (curr + next) / 2;
                }
            }

            const shiftU = (u: number): number => ((u - cutU) % 1 + 1) % 1;

            // Step 2: Sort chains and features by shifted U
            const chainOrder = Array.from({ length: K }, (_, i) => i);
            chainOrder.sort((a, b) => shiftU(chainUs[a]) - shiftU(chainUs[b]));

            const featOrder = Array.from({ length: M }, (_, i) => i);
            featOrder.sort((a, b) => shiftU(rowFeats[a]) - shiftU(rowFeats[b]));

            // Step 3: Cost matrix (score - MATCH_BONUS for valid pairs, INF otherwise)
            const INF = 1e9;
            const neededCost = K * M;
            const neededDp = (K + 1) * (M + 1);
            if (neededCost > _dpCostBuf.length) _dpCostBuf = new Float64Array(neededCost);
            if (neededDp > _dpTableBuf.length) {
                _dpTableBuf = new Float64Array(neededDp);
                _dpFromBuf = new Uint8Array(neededDp);
            }
            const costMatrix = _dpCostBuf;
            costMatrix.fill(INF, 0, neededCost);

            for (let ci = 0; ci < K; ci++) {
                const ac = activeChains[chainOrder[ci]];
                const matchU = ac.predictedU;
                const searchRadius = ac.missCount > 0 ? MOMENTUM_LINK_RADIUS : linkRadius;

                for (let fi = 0; fi < M; fi++) {
                    const featU = rowFeats[featOrder[fi]];
                    let rawDist = Math.abs(featU - matchU);
                    if (rawDist > 0.5) rawDist = 1 - rawDist;
                    if (rawDist >= searchRadius) continue;

                    const pts = ac.chain.points;
                    let score: number;
                    if (pts.length < 2) {
                        score = rawDist;
                    } else {
                        // Cost-based scoring: α·rawDist + (1-α)·predDist + β·|accel|
                        const predDist = circularDistance(featU, ac.predictedU);
                        const window = Math.min(pts.length - 1, 5);
                        const deltas: number[] = [];
                        for (let k = pts.length - window; k < pts.length; k++) {
                            const rs = pts[k].row - pts[k - 1].row;
                            if (rs > 0) {
                                let du = (pts[k].u - pts[k - 1].u) / rs;
                                if (du > 0.5) du -= 1;
                                if (du < -0.5) du += 1;
                                deltas.push(du);
                            }
                        }
                        deltas.sort((a, b) => a - b);
                        const currentVel = deltas.length > 0
                            ? deltas[Math.floor(deltas.length / 2)]
                            : 0;
                        const lastPt = pts[pts.length - 1];
                        const rowGap = j - lastPt.row;
                        let impliedDu = featU - lastPt.u;
                        if (impliedDu > 0.5) impliedDu -= 1;
                        if (impliedDu < -0.5) impliedDu += 1;
                        const impliedVel = rowGap > 0 ? impliedDu / rowGap : impliedDu;
                        const accel = Math.abs(impliedVel - currentVel);
                        const alpha = Math.max(0.3, 1.0 - pts.length * 0.07);
                        score = alpha * rawDist + (1 - alpha) * predDist
                            + ACCEL_PENALTY_WEIGHT * accel;
                    }

                    // R51: Prominence mismatch penalty — prevent dying chains from
                    // grabbing strong nascent features at birth/death zones.
                    // Guard: bypass for stable chains (≥200 rows, low roughness).
                    if (allRowTypedFeatures && j < allRowTypedFeatures.length
                        && allRowTypedFeatures[j].length > 0
                        && ac.recentProminence.length >= 3
                        && !(ac.chain.points.length >= PROMINENCE_STABLE_CHAIN_MIN_ROWS
                            && chainRoughness(ac.chain) < PROMINENCE_STABLE_ROUGHNESS)) {
                        const candidateFp = allRowTypedFeatures[j][featOrder[fi]];
                        if (candidateFp && ac.medianProminence > 0) {
                            const normalizedCandProm = candidateFp.prominence
                                / Math.max(candidateFp.radius, 0.001);
                            const ratio = normalizedCandProm / ac.medianProminence;
                            // Heavy penalty when a decaying chain tries to grab a much-stronger feature
                            if (ratio > 2.0 && ac.prominenceDecaying) {
                                score += PROMINENCE_MISMATCH_PENALTY * Math.log(ratio);
                            }
                        }
                    }

                    costMatrix[ci * M + fi] = score - MATCH_BONUS;
                }
            }

            // Step 4: Non-crossing DP
            // dp[i][j] = min cost using chains 0..i-1, features 0..j-1
            const dp = _dpTableBuf;
            const from = _dpFromBuf;
            dp.fill(0, 0, neededDp);
            from.fill(0, 0, neededDp);

            for (let i = 1; i <= K; i++) {
                for (let jj = 1; jj <= M; jj++) {
                    const idx = i * (M + 1) + jj;
                    let best = dp[i * (M + 1) + (jj - 1)];        // skip feature
                    let bestChoice = 0;
                    const valB = dp[(i - 1) * (M + 1) + jj];      // skip chain
                    if (valB < best) { best = valB; bestChoice = 1; }
                    const c = costMatrix[(i - 1) * M + (jj - 1)];
                    if (c < INF) {
                        const valC = dp[(i - 1) * (M + 1) + (jj - 1)] + c;
                        if (valC < best) { best = valC; bestChoice = 2; }
                    }
                    dp[idx] = best;
                    from[idx] = bestChoice;
                }
            }

            // Step 5: Backtrace — recover optimal non-crossing assignment
            let bi = K, bj = M;
            while (bi > 0 && bj > 0) {
                const choice = from[bi * (M + 1) + bj];
                if (choice === 2) {
                    matches.push([chainOrder[bi - 1], featOrder[bj - 1]]);
                    bi--; bj--;
                } else if (choice === 1) {
                    bi--;
                } else {
                    bj--;
                }
            }
        }

        // Step 6: Extend matched chains, update velocity predictions
        for (const [ci, fi] of matches) {
            const ac = activeChains[ci];
            ac.chain.points.push({ u: rowFeats[fi], row: j });
            usedChains.add(ci);
            usedFeats.add(fi);

            const pts = ac.chain.points;
            if (pts.length >= 2) {
                const window = Math.min(pts.length - 1, 5);
                const deltas: number[] = [];
                for (let k = pts.length - window; k < pts.length; k++) {
                    const rs = pts[k].row - pts[k - 1].row;
                    if (rs > 0) {
                        let du = (pts[k].u - pts[k - 1].u) / rs;
                        if (du > 0.5) du -= 1;
                        if (du < -0.5) du += 1;
                        deltas.push(du);
                    }
                }
                if (deltas.length > 0) {
                    deltas.sort((a, b) => a - b);
                    const uVel = deltas[Math.floor(deltas.length / 2)];
                    const last = pts[pts.length - 1];
                    ac.predictedU = ((last.u + uVel) % 1 + 1) % 1;
                } else {
                    ac.predictedU = pts[pts.length - 1].u;
                }
            } else {
                ac.predictedU = rowFeats[fi];
            }

            ac.missCount = 0;

            // R51: Update prominence tracking after chain extension
            if (allRowTypedFeatures && j < allRowTypedFeatures.length) {
                const fp = allRowTypedFeatures[j][fi];
                if (fp) {
                    const normalizedProm = fp.prominence / Math.max(fp.radius, 0.001);
                    ac.recentProminence.push(normalizedProm);
                    if (ac.recentProminence.length > PROMINENCE_WINDOW) ac.recentProminence.shift();
                    // Update median
                    const sorted = [...ac.recentProminence].sort((a, b) => a - b);
                    ac.medianProminence = sorted[Math.floor(sorted.length / 2)];
                    // Decay detection: compare recent half vs older half
                    if (ac.recentProminence.length >= PROMINENCE_WINDOW) {
                        const mid = Math.floor(ac.recentProminence.length / 2);
                        const recentHalf = ac.recentProminence.slice(mid).slice().sort((a, b) => a - b);
                        const olderHalf = ac.recentProminence.slice(0, mid).slice().sort((a, b) => a - b);
                        const recentMedian = recentHalf[Math.floor(recentHalf.length / 2)];
                        const olderMedian = olderHalf[Math.floor(olderHalf.length / 2)];
                        ac.prominenceDecaying = recentMedian < olderMedian * 0.7;
                    }
                }
            }

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
                // R51: Initialize prominence tracking for new chains
                const initProm: number[] = [];
                let initMedian = 0;
                if (allRowTypedFeatures && j < allRowTypedFeatures.length) {
                    const fp = allRowTypedFeatures[j][f];
                    if (fp) {
                        const normalizedProm = fp.prominence / Math.max(fp.radius, 0.001);
                        initProm.push(normalizedProm);
                        initMedian = normalizedProm;
                    }
                }
                newActive.push({
                    chain: { points: [{ u: rowFeats[f], row: j }] },
                    missCount: 0,
                    predictedU: rowFeats[f],
                    recentProminence: initProm,
                    medianProminence: initMedian,
                    prominenceDecaying: false,
                });
            }
        }

        activeChains = newActive;
    }

    // Close remaining active chains
    for (const ac of activeChains) {
        if (ac.chain.points.length >= 2) completedChains.push(ac.chain);
    }

    // v25 diagnostic: confirm non-crossing DP is active
    console.log(`[ChainLinker] v25 non-crossing DP: ${completedChains.length} chains linked`);

    return completedChains;
}

/**
 * Two-pass feature chain linking: primary (long stable chains) + secondary
 * (recover missed/broken segments from unmatched features).
 *
 * @param allRowFeatures  Per-row detected feature U positions
 * @param numRows         Total number of T rows
 * @param allRowTypedFeatures  Optional per-row classified features with full FeaturePoint data (R51)
 * @returns Post-processed array of FeatureChains
 */
export function linkFeatureChains(
    allRowFeatures: number[][],
    numRows: number,
    allRowTypedFeatures?: FeaturePoint[][],
): FeatureChain[] {
    // Primary pass: long, stable chains.
    const primary = linkFeatureChainsCore(
        allRowFeatures,
        numRows,
        CHAIN_LINK_RADIUS,
        6,
        1.5,
        allRowTypedFeatures,
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

    return postProcessFeatureChains([...primary, ...secondary]);
}

// ============================================================================
// Post-Linker Zigzag Repair
// ============================================================================

/**
 * v24.0: Post-linker zigzag repair pass.
 *
 * Detects chain points that zigzag (swap to a nearby feature and back) by
 * computing the second-derivative of the unwrapped U-path. Points where
 * |u[i-1] - 2*u[i] + u[i+1]| exceeds `maxAccel` are flagged as zigzags.
 *
 * For each zigzag point, predicts the correct U as the midpoint of its
 * neighbours and searches same-kind features in that row for the closest
 * feature to the predicted position. If a closer feature exists, the chain
 * point is reassigned.
 *
 * v24.1: Kind-aware filtering — searches only features of the same kind
 * (peak/valley) as the chain, preventing cross-kind snapping. Removed
 * usedFeatures deadlock that blocked symmetric zigzag repairs.
 *
 * Runs multiple passes for convergence since repairing one zigzag can
 * expose another.
 *
 * @param chains               Feature chains to repair
 * @param allRowFeatures       Per-row detected feature U positions (all kinds)
 * @param allRowTypedFeatures  Per-row classified features with kind info
 * @param maxAccel             Second-derivative threshold (default 0.003)
 * @param maxPasses            Maximum repair passes (default 3)
 * @returns Repaired chains (same array length, possibly modified points)
 */
export function repairChainsZigzags(
    chains: FeatureChain[],
    allRowFeatures: number[][],
    allRowTypedFeatures?: FeaturePoint[][],
    maxAccel: number = 0.003,
    maxPasses: number = 3
): FeatureChain[] {
    // Deep-copy chains so we don't mutate the input
    const result: FeatureChain[] = chains.map(c => ({
        ...c,
        points: c.points.map(p => ({ ...p })),
    }));

    let totalRepairs = 0;

    for (let pass = 0; pass < maxPasses; pass++) {
        let repairsThisPass = 0;

        for (const chain of result) {
            const n = chain.points.length;
            if (n < 3) continue;

            // Build kind-filtered feature arrays for this chain
            const chainKind = chain.kind; // 'peak' | 'valley' | undefined

            const unwrapped = unwrapChain(chain);

            for (let i = 1; i < n - 1; i++) {
                // Second-derivative (second difference) test
                const accel = Math.abs(unwrapped[i - 1] - 2 * unwrapped[i] + unwrapped[i + 1]);
                if (accel <= maxAccel) continue;

                // This point is a zigzag — compute predicted position
                const predictedUnwrapped = (unwrapped[i - 1] + unwrapped[i + 1]) / 2;
                // Wrap predicted to [0, 1) for feature matching
                const predictedU = ((predictedUnwrapped % 1) + 1) % 1;

                const row = chain.points[i].row;
                if (row < 0 || row >= allRowFeatures.length) continue;

                // Get kind-filtered features for this row
                const rowFeats = getKindFilteredFeatures(
                    row, chainKind, allRowFeatures, allRowTypedFeatures
                );
                if (rowFeats.length === 0) continue;

                // Find the closest same-kind feature to the predicted position
                let bestU = chain.points[i].u;
                let bestDist = circularDistance(chain.points[i].u, predictedU);
                for (const featU of rowFeats) {
                    const d = circularDistance(featU, predictedU);
                    if (d < bestDist - 1e-9) {
                        bestDist = d;
                        bestU = featU;
                    }
                }

                if (bestU !== chain.points[i].u) {
                    chain.points[i] = { row, u: bestU };
                    unwrapped[i] = liftUToReference(bestU, predictedUnwrapped);
                    repairsThisPass++;
                }
            }
        }

        totalRepairs += repairsThisPass;
        if (repairsThisPass === 0) break; // Converged
    }

    if (totalRepairs > 0) {
        console.log(`[ParametricExport]     Zigzag repair: ${totalRepairs} points fixed`);
    }

    return result;
}

/**
 * Get features for a row filtered by kind, or all features if no kind info.
 */
function getKindFilteredFeatures(
    row: number,
    chainKind: string | undefined,
    allRowFeatures: number[][],
    allRowTypedFeatures?: FeaturePoint[][]
): number[] {
    if (!chainKind || !allRowTypedFeatures || row >= allRowTypedFeatures.length) {
        return row < allRowFeatures.length ? allRowFeatures[row] : [];
    }
    const typed = allRowTypedFeatures[row];
    return typed
        .filter(t => t.kind === chainKind)
        .map(t => t.u);
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
 * @param allRowFeatures       Per-row U positions of ALL features (mixed)
 * @param allRowTypedFeatures  Per-row classified features with kind info
 * @param numRows              Total number of T rows
 * @returns Combined array of peak chains and valley chains
 */
export function linkFeatureChainsByKind(
    allRowFeatures: number[][],
    allRowTypedFeatures: FeaturePoint[][],
    numRows: number
): FeatureChain[] {
    // Split features by kind into separate per-row arrays
    const peakRows: number[][] = [];
    const valleyRows: number[][] = [];
    // R51: Also build kind-separated typed feature arrays for prominence tracking
    const peakTyped: FeaturePoint[][] = [];
    const valleyTyped: FeaturePoint[][] = [];

    for (let j = 0; j < numRows; j++) {
        const peaks: number[] = [];
        const valleys: number[] = [];
        const peakFps: FeaturePoint[] = [];
        const valleyFps: FeaturePoint[] = [];

        if (j < allRowTypedFeatures.length) {
            const typed = allRowTypedFeatures[j];
            const untyped = j < allRowFeatures.length ? allRowFeatures[j] : [];

            // Match each U position in allRowFeatures to its typed classification.
            // allRowFeatures[j] contains U positions; allRowTypedFeatures[j] has
            // FeaturePoint objects with .u and .kind for the same row.
            for (const u of untyped) {
                const match = typed.find(t => Math.abs(t.u - u) < 1e-6);
                if (match) {
                    if (match.kind === 'peak') {
                        peaks.push(u);
                        peakFps.push(match);
                    } else {
                        valleys.push(u);
                        valleyFps.push(match);
                    }
                } else {
                    // No typed match — default to peak (conservative)
                    peaks.push(u);
                    // R51: Synthesize a conservative FeaturePoint for untyped features
                    peakFps.push({ u, kind: 'peak', radius: 1, prominence: 0, confidence: 0 });
                }
            }
        } else if (j < allRowFeatures.length) {
            // No typed data for this row — all features default to peak
            peaks.push(...allRowFeatures[j]);
            for (const u of allRowFeatures[j]) {
                peakFps.push({ u, kind: 'peak', radius: 1, prominence: 0, confidence: 0 });
            }
        }

        peakRows.push(peaks);
        valleyRows.push(valleys);
        peakTyped.push(peakFps);
        valleyTyped.push(valleyFps);
    }

    // Link peak features into chains (R51: pass typed features for prominence tracking)
    const peakChains = linkFeatureChains(peakRows, numRows, peakTyped);
    for (const c of peakChains) c.kind = 'peak';

    // Link valley features into chains (R51: pass typed features for prominence tracking)
    const valleyChains = linkFeatureChains(valleyRows, numRows, valleyTyped);
    for (const c of valleyChains) c.kind = 'valley';

    // Post-process against the FULL feature array (both peaks and valleys)
    // to ensure re-snap uses the complete ground truth
    const combined = [...peakChains, ...valleyChains];

    return combined;
}

// ============================================================================
// Chain-Guided Row Insertion
// ============================================================================

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
 * @param tPositions       Original T positions (sorted ascending)
 * @param chains           Feature chains linking per-row detections
 * @param maxInsertions    Maximum number of T-rows to insert (budget guard)
 * @param minUShiftForInsert  Minimum diagonal U-shift to warrant a new row
 * @returns Object with new tPositions, rowMapping, and insertedCount
 */
export function insertChainGuidedRows(
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
