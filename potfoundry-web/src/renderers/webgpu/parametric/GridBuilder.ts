/**
 * parametric/GridBuilder.ts — Adaptive grid generation and union feature grid construction.
 *
 * Provides CDF-adaptive grid generation from curvature profiles, feature-position
 * merging with flanking companions, union feature grid construction, per-row
 * feature patching, and grid dimension computation.
 *
 * Extracted from ParametricExportComputer.ts for modularity and testability.
 *
 * @module GridBuilder
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Flanking companion offset as fraction of average grid spacing.
 * Each feature gets two companion grid lines at ±FLANK_OFFSET * avgSpacing
 * to properly capture the curvature on both sides of the ridge/valley.
 */
export const FLANK_OFFSET = 0.3;

/**
 * Minimum separation between consecutive U positions in the union grid.
 * Prevents degenerate (zero-area) triangles. Expressed as fraction of 1.0.
 * 0.05% of circumference ≈ 0.18° — well below any visible artifact.
 */
export const MIN_U_SEPARATION = 0.0005;

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
export const FLANK_OFFSETS = [0.10, 0.25, 0.45, 0.70] as const;

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
export const FEATURE_CLUSTER_RADIUS = 0.002;

// ============================================================================
// Utility
// ============================================================================

/**
 * Binary-search for the floor index in a sorted array.
 *
 * @param arr   Sorted array to search
 * @param value Value to locate
 * @returns Index i such that arr[i] <= value < arr[i+1], or -1 if value < arr[0]
 */
export function bsearchFloor(arr: Float32Array | number[], value: number): number {
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

// ============================================================================
// CDF-Adaptive Grid Generation
// ============================================================================

/**
 * Merge feature positions into a CDF-adaptive grid with flanking companions.
 *
 * For each feature, three grid lines are injected:
 *   - The feature position itself (exact ridge/valley)
 *   - A companion at feature - FLANK_OFFSET * avgSpacing
 *   - A companion at feature + FLANK_OFFSET * avgSpacing
 *
 * Lines that end up within minSep of each other are merged to prevent
 * degenerate triangles.
 *
 * @param cdfPositions  CDF-adaptive positions (NOT modified)
 * @param features      Feature edge positions in [0, 1)
 * @param isPeriodic    If true, positions wrap around [0, 1)
 * @returns Object with merged positions and count of injected positions
 */
export function mergeFeaturePositions(
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
 * @param curvature         Normalized curvature profile [0,1], length = CURVATURE_SAMPLES
 * @param count             Number of output positions to generate
 * @param minSpacingFactor  Minimum spacing as fraction of uniform spacing (0.3 = 30% of uniform)
 * @returns Float32Array of positions in [0, 1)
 */
export function generateCDFAdaptivePositions(
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
// Grid Topology
// ============================================================================

/**
 * Generate a periodic UV grid with non-uniform but SHARED spacing.
 * Used for inner wall, rim, bottom, drain (non-feature surfaces).
 *
 * @param uPositions     U positions (periodic, shared across rows)
 * @param tPositions     T positions (sorted ascending)
 * @param surfaceId      Surface identifier written as the Z component
 * @param invertWinding  Whether to flip triangle winding order
 * @returns Object with vertices (interleaved u,t,surfaceId), indices, and width w
 */
export function generateAdaptiveGrid(
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
// Union Feature Grid
// ============================================================================

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
 *   3. Add flanking companions at ±FLANK_OFFSETS × localSpacing
 *   4. Merge with CDF base grid using tagged deduplication
 *      (base positions are sacred — never collapsed)
 *   5. Return a single sorted Float32Array of U positions
 *
 * @param baseU           CDF-adaptive U positions (the budget-sized grid)
 * @param allRowFeatures  Per-row detected feature U positions
 * @param maxColumns      v11.3: Maximum total columns (budget cap). 0 = no limit.
 * @returns Sorted Float32Array of union U positions (used as template for ALL rows)
 */
export function buildUnionFeatureGrid(
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

// ============================================================================
// Per-Row Feature Patching
// ============================================================================

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
 * @param vertices        The outer wall vertex buffer (interleaved u, t, surfaceId)
 * @param W               Grid width (number of U columns per row)
 * @param numRows         Number of T rows
 * @param unionU          The union grid U positions (template, sorted ascending)
 * @param allRowFeatures  Per-row detected feature U positions
 * @returns Number of vertices patched
 */
export function patchRowFeatures(
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

// ============================================================================
// Grid Dimension Computation
// ============================================================================

/**
 * Compute grid width and height from triangle budget and aspect ratio.
 *
 * @param totalTriangles  Total triangle budget for all surfaces
 * @param budgetFrac      Fraction of budget allocated to this surface
 * @param aspectRatio     Width/height aspect ratio of the surface
 * @returns Object with w (columns) and h (rows)
 */
export function computeGridDimensions(
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
 *
 * @param positions    Sorted Float32Array of U positions
 * @param targetCount  Desired number of output positions
 * @returns Downsampled Float32Array
 */
export function downsampleSortedPositions(
    positions: Float32Array,
    targetCount: number
): Float32Array {
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
