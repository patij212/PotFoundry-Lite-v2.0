/**
 * parametric/GridBuilder.ts — Adaptive grid generation with curvature-based density.
 *
 * Provides CDF-adaptive grid generation from curvature profiles, density profile
 * construction with Gaussian feature floor, chain dead zone filtering,
 * feature-position merging, per-row feature patching, and grid dimension computation.
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
    minSpacingFactor: number = 0.3,
    rawDensity: boolean = false,
): Float32Array {
    const n = curvature.length;

    // Build density: baseline + curvature boost.
    // When rawDensity=true, the input is already a density profile (e.g. from
    // buildDensityProfile with κ² + feature floor) — skip internal squaring.
    // When rawDensity=false (default), square the curvature for stronger contrast.
    const density = new Float32Array(n);
    const baseline = minSpacingFactor;
    for (let i = 0; i < n; i++) {
        const c = curvature[i];
        const boosted = rawDensity ? c : c * c;
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
// Curvature-Adaptive Density Profile
// ============================================================================

/**
 * Build a density profile combining curvature and feature proximity.
 *
 * Produces a density signal in [0, 1] suitable for CDF-adaptive grid generation.
 * High values = place more grid columns here. The profile is the element-wise MAX of:
 *   - κ²(u): squared normalized curvature (concentrates columns at high-curvature regions)
 *   - featureFloor × Gaussian(u, chain_u): ensures minimum density near chain vertices
 *
 * @param curvatureEnvelope  Normalized [0,1] curvature profile (U-direction MAX across strips)
 * @param chainVertexUs      All chain vertex U positions (post-resnap)
 * @param featureFloor       Minimum relative density at feature positions (default: 0.6)
 * @param featureRadius      U-space Gaussian σ for feature influence (default: 0.004)
 * @returns Float32Array density profile, same length as curvatureEnvelope
 */
export function buildDensityProfile(
    curvatureEnvelope: Float32Array,
    chainVertexUs: number[],
    featureFloor: number = 0.6,
    featureRadius: number = 0.004,
): Float32Array {
    const N = curvatureEnvelope.length;
    const density = new Float32Array(N);

    // Curvature contribution: κ²
    for (let i = 0; i < N; i++) {
        const c = curvatureEnvelope[i];
        density[i] = c * c;
    }

    // Feature proximity floor: Gaussian envelope around each chain vertex U
    for (const cu of chainVertexUs) {
        const centerIdx = Math.round(cu * N) % N;
        const spreadSamples = Math.ceil(featureRadius * N * 3); // 3σ cutoff
        for (let off = -spreadSamples; off <= spreadSamples; off++) {
            const idx = ((centerIdx + off) % N + N) % N;
            const du = off / (featureRadius * N);
            const contribution = featureFloor * Math.exp(-0.5 * du * du);
            density[idx] = Math.max(density[idx], contribution);
        }
    }

    return density;
}

/**
 * Remove CDF-generated columns that land too close to chain vertex positions.
 *
 * Prevents near-degenerate sliver triangles caused by a CDF column and a chain
 * vertex being almost coincident. Chain vertices are first-class mesh vertices
 * (appended after grid vertices) — a grid column at nearly the same U would
 * create a pair of extremely thin triangles.
 *
 * @param cdfColumns     CDF-adaptive column positions (sorted Float32Array)
 * @param chainVertexUs  Chain vertex U positions
 * @param deadZoneRadius Minimum U-distance from any chain vertex (default: 0.0005)
 * @returns Filtered Float32Array with dead-zone columns removed
 */
export function applyChainDeadZones(
    cdfColumns: Float32Array,
    chainVertexUs: number[],
    deadZoneRadius: number = 0.0005,
): Float32Array {
    if (chainVertexUs.length === 0) return cdfColumns;

    const sortedChainUs = [...chainVertexUs].sort((a, b) => a - b);
    const kept: number[] = [];

    for (let i = 0; i < cdfColumns.length; i++) {
        const u = cdfColumns[i];
        // Binary search for nearest chain vertex
        let lo = 0, hi = sortedChainUs.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sortedChainUs[mid] < u) lo = mid + 1;
            else hi = mid;
        }
        // Check neighbors for proximity
        let tooClose = false;
        for (let k = Math.max(0, lo - 1); k <= Math.min(sortedChainUs.length - 1, lo + 1); k++) {
            if (Math.abs(sortedChainUs[k] - u) < deadZoneRadius) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) kept.push(u);
    }

    const result = new Float32Array(kept.length);
    for (let i = 0; i < kept.length; i++) result[i] = kept[i];
    return result;
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
 * GRID POSITIONS — identical across all rows.
 *
 * This eliminates the inter-row vertex inconsistency that caused sawtooth
 * artifacts in v10.9. Peak-only patching lets the ridge follow the exact
 * feature while the surrounding grid geometry stays clean.
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
