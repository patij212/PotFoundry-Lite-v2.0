/**
 * parametricSurfaceProjector.ts — a SHAPE-AGNOSTIC, globally-correct perpendicular
 * projector onto a surface given as a PARAMETRIC 2-manifold `Φ(u,v) → ℝ³`.
 *
 * WHY THIS EXISTS. `buildRadialSurfaceProjector` measures against a single-valued
 * radius field `S(θ,z) = (rA·cosθ, rA·sinθ, z)`, so it cannot represent an over/under
 * (multi-sheet) wall — a weave/braid has TWO r at one (θ,z). But the surface's
 * parametric map is single-valued in the `(u,v)` chart even where its 3D image
 * self-folds (the occlusion is a property of the embedding, not the chart). So
 * measuring in the `(u,v)` domain against `Φ(u,v)` is feature-complete: over/under,
 * cusps, cliffs, twist are all just points of one single-valued map.
 *
 * The true perpendicular (Hausdorff) distance from a mesh point P to the surface is
 * `min_(u,v) |P − Φ(u,v)|`. This finds it by Gauss-Newton on `(u,v)` seeded from a
 * precomputed global SEED-FIELD (Φ sampled on a `(u,v)` grid, indexed in a 3D bucket
 * grid). Because the seed-field covers the WHOLE domain, the globally-nearest sample
 * is on the CORRECT sheet — so the multi-valuedness is resolved automatically and the
 * wrong-well overstatement (worse here than in the radial case, since a folded surface
 * has more basins) never bites.
 *
 * This is the mesh→surface half of a two-sided Hausdorff measurement; the surface→mesh
 * half (missing-feature detection) is a dense Φ-sample against a mesh BVH — a separate
 * pass (see research/MEASUREMENT-COMPENDIUM.md §0, the Tier-1 write-up).
 *
 * Pure CPU. Additive: imports nothing from the existing projectors/metrics.
 */

/** A parametric surface: (u,v) ↦ 3D point. Single-valued in (u,v); image may self-fold. */
export type ParametricSurface = (u: number, v: number) => readonly [number, number, number];

export interface ParametricProjectorOptions {
  /** Parameter domain (defaults [0,1]²). */
  uMin?: number; uMax?: number; vMin?: number; vMax?: number;
  /** Whether the domain wraps in u / v (a closed surface). GN steps and finite
   *  differences wrap; a non-periodic axis is clamped to its range. Default false. */
  uPeriodic?: boolean; vPeriodic?: boolean;
  /** Seed-grid resolution. Must resolve the surface's feature basins so the nearest
   *  grid sample lands in the correct sheet's well. Default 256 × 256. */
  nu?: number; nv?: number;
  /** GN-polish the K globally-nearest seed samples. Default 6. */
  seedTopK?: number;
  /** 3D bucket cell size (mm). Default: derived from the sample spacing. */
  cellMm?: number;
  /** GN max iterations per seed. Default 24. */
  maxIter?: number;
  /** Central-difference steps in u / v. Default 1e-5. */
  hU?: number; hV?: number;
}

export interface ParametricProjection {
  /** Recovered surface parameters (wrapped/clamped into the domain). */
  u: number; v: number;
  /** Shortest 3D distance |P − Φ(u,v)| (mm). */
  dist: number;
}

export interface ParametricSurfaceProjector {
  /** Shortest 3D distance + foot parameters from P to the surface (globally correct). */
  project(px: number, py: number, pz: number): ParametricProjection;
  readonly gridUCount: number;
  readonly gridVCount: number;
  readonly sampleCount: number;
}

export function buildParametricSurfaceProjector(
  Phi: ParametricSurface,
  opts: ParametricProjectorOptions = {},
): ParametricSurfaceProjector {
  const uMin = opts.uMin ?? 0, uMax = opts.uMax ?? 1;
  const vMin = opts.vMin ?? 0, vMax = opts.vMax ?? 1;
  const uSpan = uMax - uMin, vSpan = vMax - vMin;
  const uPeriodic = opts.uPeriodic ?? false, vPeriodic = opts.vPeriodic ?? false;
  const nu = Math.max(4, Math.floor(opts.nu ?? 256));
  const nv = Math.max(4, Math.floor(opts.nv ?? 256));
  const topK = Math.max(1, Math.floor(opts.seedTopK ?? 6));
  const maxIter = opts.maxIter ?? 24;
  const hU = opts.hU ?? 1e-5, hV = opts.hV ?? 1e-5;

  const wrapU = (u: number): number =>
    uPeriodic ? uMin + (((u - uMin) % uSpan) + uSpan) % uSpan : Math.min(uMax, Math.max(uMin, u));
  const wrapV = (v: number): number =>
    vPeriodic ? vMin + (((v - vMin) % vSpan) + vSpan) % vSpan : Math.min(vMax, Math.max(vMin, v));
  const phiAt = (u: number, v: number): readonly [number, number, number] => Phi(wrapU(u), wrapV(v));

  // ── Precompute the seed-field: Φ on an (nu × nv+1)/(nv+1) grid. ──
  // For a non-periodic axis we include the far endpoint; for a periodic axis the far
  // endpoint duplicates the near one, so we stop one short.
  const nUv = uPeriodic ? nu : nu + 1;
  const nVv = vPeriodic ? nv : nv + 1;
  const nSamples = nUv * nVv;
  const sx = new Float64Array(nSamples);
  const sy = new Float64Array(nSamples);
  const sz = new Float64Array(nSamples);
  const su = new Float64Array(nSamples);
  const sv = new Float64Array(nSamples);
  let maxSpacing = 0;
  for (let i = 0; i < nUv; i++) {
    const u = uMin + uSpan * (i / nu);
    for (let j = 0; j < nVv; j++) {
      const v = vMin + vSpan * (j / nv);
      const p = phiAt(u, v);
      const idx = i * nVv + j;
      sx[idx] = p[0]; sy[idx] = p[1]; sz[idx] = p[2]; su[idx] = u; sv[idx] = v;
      if (i > 0) {
        const q = idx - nVv;
        const d = Math.hypot(sx[idx] - sx[q], sy[idx] - sy[q], sz[idx] - sz[q]);
        if (d > maxSpacing) maxSpacing = d;
      }
      if (j > 0) {
        const q = idx - 1;
        const d = Math.hypot(sx[idx] - sx[q], sy[idx] - sy[q], sz[idx] - sz[q]);
        if (d > maxSpacing) maxSpacing = d;
      }
    }
  }

  // ── 3D uniform-grid bucket index over the sample points. ──
  const cell = opts.cellMm ?? Math.max(1e-6, 2 * maxSpacing);
  const invCell = 1 / cell;
  const buckets = new Map<string, number[]>();
  const key = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
  for (let idx = 0; idx < nSamples; idx++) {
    if (!Number.isFinite(sx[idx])) continue;
    const k = key(Math.floor(sx[idx] * invCell), Math.floor(sy[idx] * invCell), Math.floor(sz[idx] * invCell));
    let list = buckets.get(k);
    if (!list) { list = []; buckets.set(k, list); }
    list.push(idx);
  }

  // One Gauss-Newton descent to the foot from a seed (u0,v0). General 2×2 normal
  // equations with the surface tangents Φ_u, Φ_v by central FD; backtracking line search.
  const gnFoot = (px: number, py: number, pz: number, u0: number, v0: number): ParametricProjection => {
    let u = u0, v = v0;
    const dsq = (uu: number, vv: number): number => {
      const p = phiAt(uu, vv);
      const ex = px - p[0], ey = py - p[1], ez = pz - p[2];
      return ex * ex + ey * ey + ez * ez;
    };
    let f = dsq(u, v);
    for (let it = 0; it < maxIter; it++) {
      const up = phiAt(u + hU, v), um = phiAt(u - hU, v);
      const vp = phiAt(u, v + hV), vm = phiAt(u, v - hV);
      const Pux = (up[0] - um[0]) / (2 * hU), Puy = (up[1] - um[1]) / (2 * hU), Puz = (up[2] - um[2]) / (2 * hU);
      const Pvx = (vp[0] - vm[0]) / (2 * hV), Pvy = (vp[1] - vm[1]) / (2 * hV), Pvz = (vp[2] - vm[2]) / (2 * hV);
      const cur = phiAt(u, v);
      const ex = px - cur[0], ey = py - cur[1], ez = pz - cur[2];
      const a = Pux * Pux + Puy * Puy + Puz * Puz;
      const b = Pux * Pvx + Puy * Pvy + Puz * Pvz;
      const c = Pvx * Pvx + Pvy * Pvy + Pvz * Pvz;
      const g1 = Pux * ex + Puy * ey + Puz * ez;
      const g2 = Pvx * ex + Pvy * ey + Pvz * ez;
      const det = a * c - b * b;
      if (!(Math.abs(det) > 1e-20)) break;
      const du = (c * g1 - b * g2) / det;
      const dv = (a * g2 - b * g1) / det;
      let step = 1, improved = false;
      for (let bt = 0; bt < 24; bt++) {
        const fNew = dsq(u + step * du, v + step * dv);
        if (fNew < f) { u += step * du; v += step * dv; f = fNew; improved = true; break; }
        step *= 0.5;
      }
      if (!improved) break;
      if (step * step * (du * du + dv * dv) < 1e-16) break;
    }
    return { u: wrapU(u), v: wrapV(v), dist: Math.sqrt(f) };
  };

  // Collect the K globally-nearest grid samples to P via expanding bucket shells; stops
  // once no farther shell can beat the current K-th nearest.
  const nearestSeeds = (px: number, py: number, pz: number): Int32Array => {
    const qx = Math.floor(px * invCell), qy = Math.floor(py * invCell), qz = Math.floor(pz * invCell);
    const bestIdx = new Int32Array(topK).fill(-1);
    const bestD2 = new Float64Array(topK).fill(Infinity);
    const consider = (idx: number): void => {
      const dx = px - sx[idx], dy = py - sy[idx], dz = pz - sz[idx];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= bestD2[topK - 1]) return;
      let p = topK - 1;
      while (p > 0 && bestD2[p - 1] > d2) { bestD2[p] = bestD2[p - 1]; bestIdx[p] = bestIdx[p - 1]; p--; }
      bestD2[p] = d2; bestIdx[p] = idx;
    };
    const maxRing = nUv + nVv;
    let found = 0;
    for (let ring = 0; ring <= maxRing; ring++) {
      if (found >= topK) {
        const ringMinDist = (ring - 1) * cell;
        if (ringMinDist > 0 && ringMinDist * ringMinDist > bestD2[topK - 1]) break;
      }
      let hits = 0;
      for (let gx = qx - ring; gx <= qx + ring; gx++) {
        for (let gy = qy - ring; gy <= qy + ring; gy++) {
          for (let gz = qz - ring; gz <= qz + ring; gz++) {
            if (ring > 0 && gx > qx - ring && gx < qx + ring && gy > qy - ring && gy < qy + ring && gz > qz - ring && gz < qz + ring) continue;
            const list = buckets.get(key(gx, gy, gz));
            if (!list) continue;
            for (const idx of list) { consider(idx); hits++; }
          }
        }
      }
      found += hits;
      if (ring > 4 && found === 0 && ring > Math.max(nUv, nVv)) break;
    }
    return bestIdx;
  };

  return {
    gridUCount: nUv,
    gridVCount: nVv,
    sampleCount: nSamples,
    project(px: number, py: number, pz: number): ParametricProjection {
      // Seed from the K globally-nearest grid samples — which span the WHOLE domain,
      // so the nearest sample is on the correct sheet — and GN-polish each to the exact
      // foot; keep the smallest. Every seed is polished to an actual surface point, so
      // the result is always a valid upper bound on the true distance.
      const seeds = nearestSeeds(px, py, pz);
      let best: ParametricProjection | null = null;
      for (let s = 0; s < seeds.length; s++) {
        const idx = seeds[s];
        if (idx < 0) continue;
        const cand = gnFoot(px, py, pz, su[idx], sv[idx]);
        if (best === null || cand.dist < best.dist) best = cand;
      }
      // Degenerate fallback (empty far field): seed from the domain midpoint.
      return best ?? gnFoot(px, py, pz, uMin + uSpan * 0.5, vMin + vSpan * 0.5);
    },
  };
}
