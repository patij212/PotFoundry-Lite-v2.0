/**
 * SurfaceMetric — UV metric field with Jacobian-based anisotropic split criterion.
 *
 * Computes the first fundamental form (metric tensor) of a parametric surface
 * from triangle mesh positions and UV coordinates. The metric tensor encodes
 * how UV-space distances map to 3D distances, enabling metric-aware refinement
 * that concentrates triangles in stretched regions (flared walls, deep grooves)
 * and relaxes in uniform areas (smooth cylinders).
 *
 * Key concepts:
 * - **Jacobian** J = [∂X/∂u, ∂X/∂v]: 3×2 matrix of partial derivatives
 * - **First fundamental form** G = Jᵀ J: 2×2 symmetric positive-definite tensor
 *   with entries E = Xu·Xu, F = Xu·Xv, G = Xv·Xv
 * - **Principal stretches** σ₁, σ₂: square roots of eigenvalues of G
 * - **Metric length**: √(E·du² + 2F·du·dv + G·dv²) for edge (du, dv)
 * - **Anisotropy ratio** σ₁/σ₂: how much the surface stretches differently
 *   in the two principal directions (1.0 = isotropic)
 *
 * @module SurfaceMetric
 * @see AdaptiveRefinement.ts for integration into the split priority
 * @see MeshValidator.ts for distortion quality checks
 */

// ============================================================================
// RunningStats — O(1) streaming statistics (Phase 11.3 — I6, P1)
// ============================================================================

/**
 * Welford's online algorithm for streaming mean, variance, min, max.
 *
 * Accumulates statistics in O(1) space per `push()` call, avoiding the
 * need to store all values in a temporary array. This is critical for
 * large meshes where edge-length arrays would consume >10MB.
 *
 * @example
 * ```ts
 * const stats = new RunningStats();
 * for (const length of edgeLengths) stats.push(length);
 * console.log(stats.mean, stats.stddev, stats.min, stats.max);
 * ```
 */
export class RunningStats {
    private _count = 0;
    private _mean = 0;
    private _m2 = 0;     // Sum of squared differences from current mean
    private _min = Infinity;
    private _max = -Infinity;

    /**
     * Push a new observation.
     *
     * @param value - The value to accumulate.
     */
    push(value: number): void {
        this._count++;
        const delta = value - this._mean;
        this._mean += delta / this._count;
        const delta2 = value - this._mean;
        this._m2 += delta * delta2;
        if (value < this._min) this._min = value;
        if (value > this._max) this._max = value;
    }

    /** Number of values accumulated. */
    get count(): number { return this._count; }

    /** Running mean. Returns 0 for empty series. */
    get mean(): number { return this._count > 0 ? this._mean : 0; }

    /** Population variance (N denominator). */
    get variance(): number { return this._count > 1 ? this._m2 / this._count : 0; }

    /** Sample variance (N-1 denominator). */
    get sampleVariance(): number { return this._count > 1 ? this._m2 / (this._count - 1) : 0; }

    /** Population standard deviation. */
    get stddev(): number { return Math.sqrt(this.variance); }

    /** Coefficient of variation (stddev / mean). Returns 0 when mean ≈ 0. */
    get cv(): number { return Math.abs(this._mean) > 1e-12 ? this.stddev / Math.abs(this._mean) : 0; }

    /** Minimum value seen (Infinity if no values pushed). */
    get min(): number { return this._min; }

    /** Maximum value seen (-Infinity if no values pushed). */
    get max(): number { return this._max; }

    /** Reset all accumulators to initial state. */
    reset(): void {
        this._count = 0;
        this._mean = 0;
        this._m2 = 0;
        this._min = Infinity;
        this._max = -Infinity;
    }
}

// ============================================================================
// Types
// ============================================================================

/**
 * 2×2 symmetric metric tensor (first fundamental form).
 *
 * Represents the matrix [[E, F], [F, G]] where:
 * - E = ∂X/∂u · ∂X/∂u (stretch in u direction)
 * - F = ∂X/∂u · ∂X/∂v (shear coupling)
 * - G = ∂X/∂v · ∂X/∂v (stretch in v direction)
 */
export interface MetricTensor {
    /** E component: |∂X/∂u|² */
    E: number;
    /** F component: ∂X/∂u · ∂X/∂v */
    F: number;
    /** G component: |∂X/∂v|² */
    G: number;
}

/**
 * Principal stretches and directions from eigendecomposition of the metric tensor.
 */
export interface PrincipalStretches {
    /** Larger principal stretch (mm per UV unit). */
    sigma1: number;
    /** Smaller principal stretch (mm per UV unit). */
    sigma2: number;
    /** Direction of σ₁ in UV space: [du, dv] (unit vector). */
    dir1: [number, number];
    /** Direction of σ₂ in UV space: [du, dv] (unit vector). */
    dir2: [number, number];
    /** Anisotropy ratio σ₁/σ₂ (≥ 1.0, 1.0 = perfectly isotropic). */
    anisotropy: number;
}

/**
 * Grid-sampled metric field over the UV domain.
 *
 * Stores one MetricTensor per grid cell in row-major order [resT][resU].
 * Supports bilinear interpolation for arbitrary UV queries.
 */
export interface MetricField {
    /** E values in row-major order [resT * resU]. */
    E: Float32Array;
    /** F values in row-major order [resT * resU]. */
    F: Float32Array;
    /** G values in row-major order [resT * resU]. */
    G: Float32Array;
    /** Number of U samples. */
    resU: number;
    /** Number of T samples. */
    resT: number;
}

/**
 * Per-triangle Jacobian result (intermediate, rarely needed externally).
 */
export interface TriangleJacobian {
    /** ∂X/∂u: [dx/du, dy/du, dz/du] */
    Xu: [number, number, number];
    /** ∂X/∂v: [dx/dv, dy/dv, dz/dv] */
    Xv: [number, number, number];
    /** Determinant of the UV-space edge matrix (signed area in UV). */
    uvDet: number;
}

// ============================================================================
// Per-Triangle Jacobian
// ============================================================================

/**
 * Compute the surface Jacobian (∂X/∂u, ∂X/∂v) for a single triangle.
 *
 * Given a triangle with 3D positions (P0, P1, P2) and UV coordinates
 * (uv0, uv1, uv2), the Jacobian columns are computed by solving:
 *
 *   e1 = P1 - P0,  e2 = P2 - P0   (3D edge vectors)
 *   δ1 = uv1 - uv0, δ2 = uv2 - uv0 (UV edge vectors)
 *   det = δ1_u * δ2_v - δ2_u * δ1_v
 *   Xu = (δ2_v * e1 - δ1_v * e2) / det
 *   Xv = (-δ2_u * e1 + δ1_u * e2) / det
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param i0 - First vertex index.
 * @param i1 - Second vertex index.
 * @param i2 - Third vertex index.
 * @returns Jacobian columns, or null for degenerate UV triangles (det ≈ 0).
 */
export function computeTriangleJacobian(
    positions: Float32Array,
    uvs: Float32Array,
    i0: number,
    i1: number,
    i2: number,
): TriangleJacobian | null {
    // 3D edge vectors
    const e1x = positions[i1 * 3] - positions[i0 * 3];
    const e1y = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const e1z = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const e2x = positions[i2 * 3] - positions[i0 * 3];
    const e2y = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
    const e2z = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];

    // UV edge vectors
    const d1u = uvs[i1 * 3] - uvs[i0 * 3];
    const d1v = uvs[i1 * 3 + 1] - uvs[i0 * 3 + 1];
    const d2u = uvs[i2 * 3] - uvs[i0 * 3];
    const d2v = uvs[i2 * 3 + 1] - uvs[i0 * 3 + 1];

    const det = d1u * d2v - d2u * d1v;
    if (Math.abs(det) < 1e-20) return null;

    const invDet = 1 / det;

    // Xu = (δ2_v * e1 - δ1_v * e2) / det
    const Xu: [number, number, number] = [
        (d2v * e1x - d1v * e2x) * invDet,
        (d2v * e1y - d1v * e2y) * invDet,
        (d2v * e1z - d1v * e2z) * invDet,
    ];

    // Xv = (-δ2_u * e1 + δ1_u * e2) / det
    const Xv: [number, number, number] = [
        (-d2u * e1x + d1u * e2x) * invDet,
        (-d2u * e1y + d1u * e2y) * invDet,
        (-d2u * e1z + d1u * e2z) * invDet,
    ];

    return { Xu, Xv, uvDet: det };
}

// ============================================================================
// First Fundamental Form
// ============================================================================

/**
 * Compute the first fundamental form (metric tensor) from Jacobian columns.
 *
 * G = Jᵀ J = [[Xu·Xu, Xu·Xv], [Xu·Xv, Xv·Xv]] = [[E, F], [F, G]]
 *
 * @param Xu - ∂X/∂u column [dx/du, dy/du, dz/du].
 * @param Xv - ∂X/∂v column [dx/dv, dy/dv, dz/dv].
 * @returns MetricTensor with E, F, G components.
 */
export function firstFundamentalForm(
    Xu: [number, number, number],
    Xv: [number, number, number],
): MetricTensor {
    const E = Xu[0] * Xu[0] + Xu[1] * Xu[1] + Xu[2] * Xu[2];
    const F = Xu[0] * Xv[0] + Xu[1] * Xv[1] + Xu[2] * Xv[2];
    const G = Xv[0] * Xv[0] + Xv[1] * Xv[1] + Xv[2] * Xv[2];
    return { E, F, G };
}

// ============================================================================
// Eigendecomposition
// ============================================================================

/**
 * Eigendecompose a 2×2 symmetric matrix [[E, F], [F, G]].
 *
 * Returns eigenvalues λ₁ ≥ λ₂ ≥ 0 and corresponding unit eigenvectors.
 * Principal stretches are σᵢ = √λᵢ. The anisotropy ratio is σ₁/σ₂.
 *
 * @param M - Metric tensor {E, F, G}.
 * @returns Principal stretches, directions, and anisotropy ratio.
 */
export function eigenDecompose(M: MetricTensor): PrincipalStretches {
    const { E, F, G } = M;

    // Eigenvalues of [[E, F], [F, G]]:
    // λ = (E + G ± √((E - G)² + 4F²)) / 2
    const trace = E + G;
    const disc = Math.sqrt(Math.max(0, (E - G) * (E - G) + 4 * F * F));
    const lambda1 = (trace + disc) * 0.5;
    const lambda2 = (trace - disc) * 0.5;

    // Clamp to non-negative (numerical safety)
    const l1 = Math.max(0, lambda1);
    const l2 = Math.max(0, lambda2);

    const sigma1 = Math.sqrt(l1);
    const sigma2 = Math.sqrt(l2);

    // Eigenvectors
    let dir1: [number, number];
    let dir2: [number, number];

    if (Math.abs(F) > 1e-12) {
        // First eigenvector: (λ₁ - G, F) normalized
        const vx1 = l1 - G;
        const vy1 = F;
        const len1 = Math.sqrt(vx1 * vx1 + vy1 * vy1);
        dir1 = len1 > 1e-12 ? [vx1 / len1, vy1 / len1] : [1, 0];

        // Second eigenvector: perpendicular
        dir2 = [-dir1[1], dir1[0]];
    } else {
        // Diagonal matrix: eigenvectors are axis-aligned
        if (E >= G) {
            dir1 = [1, 0];
            dir2 = [0, 1];
        } else {
            dir1 = [0, 1];
            dir2 = [1, 0];
        }
    }

    const anisotropy = sigma2 > 1e-12 ? sigma1 / sigma2 : (sigma1 > 1e-12 ? Infinity : 1.0);

    return { sigma1, sigma2, dir1, dir2, anisotropy };
}

// ============================================================================
// Metric Length
// ============================================================================

/**
 * Compute the metric-weighted length of a UV-space displacement.
 *
 * For a displacement (du, dv) in UV space, the 3D arc length is approximately:
 *   ds = √(E·du² + 2F·du·dv + G·dv²)
 *
 * @param M - Metric tensor at the evaluation point.
 * @param du - Displacement in u direction.
 * @param dv - Displacement in v direction.
 * @returns Metric length in mm (3D distance).
 */
export function metricLength(M: MetricTensor, du: number, dv: number): number {
    const qf = M.E * du * du + 2 * M.F * du * dv + M.G * dv * dv;
    return Math.sqrt(Math.max(0, qf));
}

/**
 * Compute the squared metric length (avoids sqrt for comparison purposes).
 *
 * @param M - Metric tensor.
 * @param du - Displacement in u.
 * @param dv - Displacement in v.
 * @returns Squared metric length.
 */
export function metricLengthSq(M: MetricTensor, du: number, dv: number): number {
    return Math.max(0, M.E * du * du + 2 * M.F * du * dv + M.G * dv * dv);
}

// ============================================================================
// Per-Vertex Metric Accumulation
// ============================================================================

/**
 * Compute per-vertex metric tensors by area-weighted averaging of
 * per-triangle metrics.
 *
 * For each triangle, computes the Jacobian and metric tensor, then
 * distributes it to the three vertices weighted by the triangle's
 * UV-space area. This produces smooth vertex metrics suitable for
 * edge-based split decisions.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param indices - Triangle index buffer.
 * @param indexCount - Number of indices to process.
 * @returns Object with per-vertex E, F, G arrays and vertex count.
 */
export function computeVertexMetrics(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    indexCount: number,
): { E: Float32Array; F: Float32Array; G: Float32Array; vertexCount: number } {
    const vertexCount = positions.length / 3;
    const vE = new Float32Array(vertexCount);
    const vF = new Float32Array(vertexCount);
    const vG = new Float32Array(vertexCount);
    const weights = new Float32Array(vertexCount);

    for (let t = 0; t < indexCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const jac = computeTriangleJacobian(positions, uvs, i0, i1, i2);
        if (!jac) continue;

        const metric = firstFundamentalForm(jac.Xu, jac.Xv);
        const area = Math.abs(jac.uvDet) * 0.5; // UV-space triangle area
        if (area < 1e-20) continue;

        // Distribute to vertices weighted by UV area
        for (const vi of [i0, i1, i2]) {
            vE[vi] += metric.E * area;
            vF[vi] += metric.F * area;
            vG[vi] += metric.G * area;
            weights[vi] += area;
        }
    }

    // Normalize
    for (let i = 0; i < vertexCount; i++) {
        if (weights[i] > 1e-20) {
            const inv = 1 / weights[i];
            vE[i] *= inv;
            vF[i] *= inv;
            vG[i] *= inv;
        } else {
            // Fallback: identity metric (1mm per UV unit in each direction)
            vE[i] = 1;
            vG[i] = 1;
        }
    }

    return { E: vE, F: vF, G: vG, vertexCount };
}

// ============================================================================
// MetricField — Grid-Sampled Tensor Field
// ============================================================================

/**
 * Build a grid-sampled metric field from per-vertex metrics.
 *
 * Resamples the per-vertex metric data onto a regular UV grid by
 * interpolation from the triangle mesh. Each grid cell stores the
 * metric tensor (E, F, G) interpolated from the enclosing triangle.
 *
 * For simplicity, this implementation stores per-vertex metric data
 * directly when resU × resT matches vertex count, or builds a spatial
 * lookup for general cases.
 *
 * @param vertexMetrics - Per-vertex E, F, G arrays from computeVertexMetrics.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param resU - U resolution for the metric field grid.
 * @param resT - T resolution for the metric field grid.
 * @returns MetricField with E, F, G grids.
 */
export function buildMetricField(
    vertexMetrics: { E: Float32Array; F: Float32Array; G: Float32Array; vertexCount: number },
    uvs: Float32Array,
    resU: number,
    resT: number,
): MetricField {
    const n = resU * resT;
    const fE = new Float32Array(n);
    const fF = new Float32Array(n);
    const fG = new Float32Array(n);

    const vc = vertexMetrics.vertexCount;

    // Spatial binning for O(1) average nearest-vertex lookup instead of O(vc)
    const binResU = Math.max(1, Math.min(resU, 64));
    const binResT = Math.max(1, Math.min(resT, 64));
    const bins: number[][] = new Array(binResU * binResT);
    for (let i = 0; i < bins.length; i++) bins[i] = [];

    for (let vi = 0; vi < vc; vi++) {
        const u = Math.max(0, Math.min(1, uvs[vi * 3]));
        const t = Math.max(0, Math.min(1, uvs[vi * 3 + 1]));
        const bu = Math.min(Math.floor(u * binResU), binResU - 1);
        const bt = Math.min(Math.floor(t * binResT), binResT - 1);
        bins[bt * binResU + bu].push(vi);
    }

    for (let tIdx = 0; tIdx < resT; tIdx++) {
        const tParam = resT > 1 ? tIdx / (resT - 1) : 0.5;
        for (let uIdx = 0; uIdx < resU; uIdx++) {
            const uParam = resU > 1 ? uIdx / (resU - 1) : 0.5;
            const gi = tIdx * resU + uIdx;

            // Search this bin and its immediate neighbors
            const bu = Math.min(Math.floor(uParam * binResU), binResU - 1);
            const bt = Math.min(Math.floor(tParam * binResT), binResT - 1);

            let bestDist = Infinity;
            let bestVi = 0;

            for (let dbt = -1; dbt <= 1; dbt++) {
                const nbt = bt + dbt;
                if (nbt < 0 || nbt >= binResT) continue;
                for (let dbu = -1; dbu <= 1; dbu++) {
                    const nbu = bu + dbu;
                    if (nbu < 0 || nbu >= binResU) continue;
                    const bin = bins[nbt * binResU + nbu];
                    for (const vi of bin) {
                        const du = uvs[vi * 3] - uParam;
                        const dv = uvs[vi * 3 + 1] - tParam;
                        const d = du * du + dv * dv;
                        if (d < bestDist) { bestDist = d; bestVi = vi; }
                    }
                }
            }

            // If no vertex found in neighbors (sparse mesh), fall back to scan
            if (bestDist === Infinity) {
                for (let vi = 0; vi < vc; vi++) {
                    const du = uvs[vi * 3] - uParam;
                    const dv = uvs[vi * 3 + 1] - tParam;
                    const d = du * du + dv * dv;
                    if (d < bestDist) { bestDist = d; bestVi = vi; }
                }
            }

            fE[gi] = vertexMetrics.E[bestVi];
            fF[gi] = vertexMetrics.F[bestVi];
            fG[gi] = vertexMetrics.G[bestVi];
        }
    }

    return { E: fE, F: fF, G: fG, resU, resT };
}

/**
 * Bilinear interpolation of the metric tensor at an arbitrary UV point.
 *
 * @param field - Grid-sampled metric field.
 * @param u - U coordinate in [0, 1].
 * @param v - V coordinate (t) in [0, 1].
 * @returns Interpolated MetricTensor.
 */
export function interpolateMetric(field: MetricField, u: number, v: number): MetricTensor {
    const { resU, resT, E, F, G } = field;

    const uf = Math.max(0, Math.min(1, u)) * (resU - 1);
    const vf = Math.max(0, Math.min(1, v)) * (resT - 1);

    const ui = Math.min(Math.floor(uf), resU - 2);
    const vi = Math.min(Math.floor(vf), resT - 2);

    const su = uf - ui;
    const sv = vf - vi;

    // Four corner indices
    const i00 = vi * resU + ui;
    const i10 = vi * resU + ui + 1;
    const i01 = (vi + 1) * resU + ui;
    const i11 = (vi + 1) * resU + ui + 1;

    // Bilinear weights
    const w00 = (1 - su) * (1 - sv);
    const w10 = su * (1 - sv);
    const w01 = (1 - su) * sv;
    const w11 = su * sv;

    return {
        E: E[i00] * w00 + E[i10] * w10 + E[i01] * w01 + E[i11] * w11,
        F: F[i00] * w00 + F[i10] * w10 + F[i01] * w01 + F[i11] * w11,
        G: G[i00] * w00 + G[i10] * w10 + G[i01] * w01 + G[i11] * w11,
    };
}

// ============================================================================
// Metric-Aware Edge Length
// ============================================================================

/**
 * Compute the metric-weighted length of a mesh edge using vertex UVs.
 *
 * Uses the averaged metric tensor at the edge midpoint for evaluation.
 *
 * @param vertexMetrics - Per-vertex E, F, G arrays.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param v0 - First vertex index.
 * @param v1 - Second vertex index.
 * @returns Metric-weighted edge length in mm.
 */
export function metricEdgeLength(
    vertexMetrics: { E: Float32Array; F: Float32Array; G: Float32Array },
    uvs: Float32Array,
    v0: number,
    v1: number,
): number {
    // UV displacement
    const du = uvs[v1 * 3] - uvs[v0 * 3];
    const dv = uvs[v1 * 3 + 1] - uvs[v0 * 3 + 1];

    // Average metric at edge midpoint
    const ME = (vertexMetrics.E[v0] + vertexMetrics.E[v1]) * 0.5;
    const MF = (vertexMetrics.F[v0] + vertexMetrics.F[v1]) * 0.5;
    const MG = (vertexMetrics.G[v0] + vertexMetrics.G[v1]) * 0.5;

    const qf = ME * du * du + 2 * MF * du * dv + MG * dv * dv;
    return Math.sqrt(Math.max(0, qf));
}

/**
 * Compute the squared metric-weighted length of a mesh edge using vertex UVs.
 *
 * Avoids the sqrt for comparison-only use cases (e.g., selecting the longest
 * metric edge within a triangle). Uses the averaged metric tensor at the
 * edge midpoint.
 *
 * @param vertexMetrics - Per-vertex E, F, G arrays.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param v0 - First vertex index.
 * @param v1 - Second vertex index.
 * @returns Squared metric-weighted edge length.
 */
export function metricEdgeLengthSq(
    vertexMetrics: { E: Float32Array; F: Float32Array; G: Float32Array },
    uvs: Float32Array,
    v0: number,
    v1: number,
): number {
    // UV displacement
    const du = uvs[v1 * 3] - uvs[v0 * 3];
    const dv = uvs[v1 * 3 + 1] - uvs[v0 * 3 + 1];

    // Average metric at edge midpoint
    const ME = (vertexMetrics.E[v0] + vertexMetrics.E[v1]) * 0.5;
    const MF = (vertexMetrics.F[v0] + vertexMetrics.F[v1]) * 0.5;
    const MG = (vertexMetrics.G[v0] + vertexMetrics.G[v1]) * 0.5;

    return Math.max(0, ME * du * du + 2 * MF * du * dv + MG * dv * dv);
}

// ============================================================================
// Anisotropic Split Priority
// ============================================================================

/**
 * Compute metric-aware split priority for a triangle edge.
 *
 * Instead of prioritizing by 3D Euclidean edge length, this uses the
 * metric tensor to estimate how much the edge "stretches" in 3D relative
 * to its UV extent. Longer edges (in metric space) get higher priority.
 *
 * The priority score is:  metricLength(edge) / targetEdgeLength
 *
 * where targetEdgeLength is derived from the triangle budget and surface area.
 *
 * @param vertexMetrics - Per-vertex metric tensors.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param v0 - First vertex index.
 * @param v1 - Second vertex index.
 * @param targetLength - Target edge length in mm (from quality profile).
 * @returns Split priority score (> 1.0 means edge should be split).
 */
export function anisotropicSplitPriority(
    vertexMetrics: { E: Float32Array; F: Float32Array; G: Float32Array },
    uvs: Float32Array,
    v0: number,
    v1: number,
    targetLength: number,
): number {
    if (targetLength <= 0) return 0;
    const mLen = metricEdgeLength(vertexMetrics, uvs, v0, v1);
    return mLen / targetLength;
}

// ============================================================================
// Surface Area Estimation
// ============================================================================

/**
 * Estimate the total 3D surface area from per-triangle metric tensors.
 *
 * For each triangle, the 3D area is |det(J)| * UV_area = √(EG - F²) * UV_area.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param indices - Triangle index buffer.
 * @param indexCount - Number of indices to process.
 * @returns Total 3D surface area in mm².
 */
export function estimateSurfaceArea(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    indexCount: number,
): number {
    let totalArea = 0;
    for (let t = 0; t < indexCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        // Direct 3D area via cross product
        const e1x = positions[i1 * 3] - positions[i0 * 3];
        const e1y = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
        const e1z = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
        const e2x = positions[i2 * 3] - positions[i0 * 3];
        const e2y = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
        const e2z = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];

        const cx = e1y * e2z - e1z * e2y;
        const cy = e1z * e2x - e1x * e2z;
        const cz = e1x * e2y - e1y * e2x;
        totalArea += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
    }
    return totalArea;
}

/**
 * Compute the target edge length for a given triangle budget and surface area.
 *
 * For N equilateral triangles of edge length L covering area A:
 *   A ≈ N * (√3/4) * L²  →  L ≈ √(4A / (√3 * N))
 *
 * @param surfaceArea - Total 3D surface area in mm².
 * @param triangleBudget - Target number of triangles.
 * @returns Target edge length in mm.
 */
export function targetEdgeLength(surfaceArea: number, triangleBudget: number): number {
    if (triangleBudget <= 0 || surfaceArea <= 0) return 1;
    return Math.sqrt((4 * surfaceArea) / (Math.sqrt(3) * triangleBudget));
}

// ============================================================================
// Edge Length Variance (for regression testing)
// ============================================================================

/**
 * Compute statistics on 3D edge lengths within the mesh.
 *
 * Used for regression testing: after metric-aware refinement, the
 * variance of 3D edge lengths should decrease compared to UV-uniform.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param indexCount - Number of indices to process.
 * @returns Object with mean, variance, stddev, min, max, p5, p95 edge lengths.
 */
export function edgeLengthStats(
    positions: Float32Array,
    indices: Uint32Array,
    indexCount: number,
): {
    mean: number;
    variance: number;
    stddev: number;
    min: number;
    max: number;
    p5: number;
    p95: number;
    count: number;
} {
    const seen = new Set<string>();
    const stats = new RunningStats();
    const lengths: number[] = []; // still needed for percentiles

    for (let t = 0; t < indexCount; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        const edges: [number, number][] = [[a, b], [b, c], [c, a]];

        for (const [v0, v1] of edges) {
            const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const dx = positions[v0 * 3] - positions[v1 * 3];
            const dy = positions[v0 * 3 + 1] - positions[v1 * 3 + 1];
            const dz = positions[v0 * 3 + 2] - positions[v1 * 3 + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            stats.push(len);
            lengths.push(len);
        }
    }

    if (stats.count === 0) {
        return { mean: 0, variance: 0, stddev: 0, min: 0, max: 0, p5: 0, p95: 0, count: 0 };
    }

    // Percentiles still need a sorted array
    lengths.sort((a, b) => a - b);
    const n = stats.count;
    const p5idx = Math.max(0, Math.ceil(0.05 * n) - 1);
    const p95idx = Math.max(0, Math.ceil(0.95 * n) - 1);

    return {
        mean: stats.mean,
        variance: stats.variance,
        stddev: stats.stddev,
        min: stats.min,
        max: stats.max,
        p5: lengths[p5idx],
        p95: lengths[p95idx],
        count: n,
    };
}

// ============================================================================
// Distortion Metrics (for MeshValidator integration)
// ============================================================================

/**
 * Compute per-triangle metric distortion: ratio of max/min principal stretches.
 *
 * Returns the distribution of anisotropy ratios across all triangles.
 * A perfectly isotropic mesh has ratio 1.0 everywhere; a highly
 * distorted mesh has large ratios in stretched regions.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,v,surfaceId,...] UV coordinates.
 * @param indices - Triangle index buffer.
 * @param indexCount - Number of indices to process.
 * @returns Object with mean, max, p95 anisotropy ratios.
 */
export function computeDistortion(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    indexCount: number,
): {
    meanAnisotropy: number;
    maxAnisotropy: number;
    p95Anisotropy: number;
    triangleCount: number;
} {
    const ratios: number[] = [];

    for (let t = 0; t < indexCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const jac = computeTriangleJacobian(positions, uvs, i0, i1, i2);
        if (!jac) continue;

        const metric = firstFundamentalForm(jac.Xu, jac.Xv);
        const { anisotropy } = eigenDecompose(metric);
        ratios.push(isFinite(anisotropy) ? anisotropy : 1.0);
    }

    if (ratios.length === 0) {
        return { meanAnisotropy: 1, maxAnisotropy: 1, p95Anisotropy: 1, triangleCount: 0 };
    }

    ratios.sort((a, b) => a - b);
    const n = ratios.length;
    const mean = ratios.reduce((s, v) => s + v, 0) / n;
    const p95idx = Math.max(0, Math.ceil(0.95 * n) - 1);

    return {
        meanAnisotropy: mean,
        maxAnisotropy: ratios[n - 1],
        p95Anisotropy: ratios[p95idx],
        triangleCount: n,
    };
}
