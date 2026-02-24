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

import { circularDistance } from './FeatureDetection';
import type { ChainPoint, FeatureChain, FeaturePoint } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum circular U-distance to link a feature in row j to a feature in row j+1.
 * Features farther apart than this are considered unrelated.
 * Larger values follow diagonal/spiral features; too large risks false connections.
 */
export const CHAIN_LINK_RADIUS = 0.04;

// ============================================================================
// Circular Helpers
// ============================================================================

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
 *
 * @param chains          Raw linked chains
 * @param allRowFeatures  Per-row measured feature U positions
 * @returns Post-processed chains
 */
export function postProcessFeatureChains(
    chains: FeatureChain[],
    allRowFeatures: number[][]
): FeatureChain[] {
    const deduped = suppressDuplicateChains(chains);
    return deduped.map((chain) => resnapChainToMeasuredPeaks(chain, allRowFeatures));
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
 * @returns Array of FeatureChains
 */
export function linkFeatureChainsCore(
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

/**
 * Two-pass feature chain linking: primary (long stable chains) + secondary
 * (recover missed/broken segments from unmatched features).
 *
 * @param allRowFeatures  Per-row detected feature U positions
 * @param numRows         Total number of T rows
 * @returns Post-processed array of FeatureChains
 */
export function linkFeatureChains(
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
