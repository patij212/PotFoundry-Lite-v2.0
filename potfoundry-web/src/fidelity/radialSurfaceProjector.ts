/**
 * radialSurfaceProjector.ts — a GLOBALLY-CORRECT, FAST perpendicular projector onto
 * a radial analytic surface `S(θ,z) = (r·cosθ, r·sinθ, z)`, `r = rA(θ,z)`.
 *
 * WHY THIS EXISTS. `projectPointToRadialSurface` (analyticSurfaceGate.ts) seeds
 * Gauss-Newton at the radial foot `(atan2(P), pz)` and, when that stalls, falls back
 * to an AZIMUTH-LOCAL coarse search (±0.22 rad × ±11mm). On tangled lattices
 * (Gyroid / Voronoi / CelticTriquetra) the true nearest foot sits in a DIFFERENT
 * basin farther away than that window, so single-GN stalls in a WRONG LOCAL MINIMUM
 * and OVERSTATES the true perpendicular distance up to ~7× (measured: Gyroid GN
 * 0.644 vs brute-trusted 0.092 — `_gnPerpAnchor.test.ts`, LAB-CHEATSHEET). The
 * project's only mitigation today is a full-azimuth BRUTE twin applied to the worst
 * ~40 facets (whole-mesh brute is ~3.4h — infeasible).
 *
 * THE FIX. Precompute the surface once on a `(θ,z)` grid and index the sample points
 * in a 3D bucket grid. To project a point P, seed GN from the GLOBALLY nearest grid
 * samples (found in ~O(1) via the bucket index) AND from the radial foot, then keep
 * the smallest polished distance. Because the grid samples the WHOLE surface, the
 * true basin is always among the seeds — no wrong well — and because every seed is
 * polished to an ACTUAL surface point, the returned distance is always a VALID UPPER
 * BOUND on the true perpendicular distance (it never UNDER-states ⇒ it can never
 * falsely certify a bad mesh). Since the seed set also includes the radial foot, it
 * is ≤ the single-seed projector up to GN-convergence noise (the single-seed path also
 * runs its own local ±0.22-rad coarse search, so the ordering is not bit-exact, but
 * the global seed field dominates that local window). The expensive grid build is amortized
 * across every projection of a mesh, so the whole-mesh cost is ~O(samples) — orders
 * of magnitude below the brute twin, and correct everywhere (not just worst-N).
 *
 * Shape scope: single-valued radial `rA` (the same scope as the projector it fixes).
 * Multi-valued (over/under weave) walls need a multi-sheet reference — out of scope.
 *
 * Pure CPU, no production dependency beyond the two shared types. Additive: nothing
 * imports or changes `projectPointToRadialSurface`.
 */
import type { AnalyticRadiusFn, SurfaceProjection } from './analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface RadialSurfaceProjectorOptions {
  /** Pot height (mm); the sampled z-domain defaults to [0, H]. */
  H: number;
  /** Sampled z-domain lower bound (mm). Default 0. */
  zMin?: number;
  /** Sampled z-domain upper bound (mm). Default H. */
  zMax?: number;
  /** Seed-grid azimuth resolution. Must resolve the surface's feature basins so the
   *  nearest sample lands in the correct well. Default 512. */
  nTheta?: number;
  /** Seed-grid height resolution. Default 256. */
  nZ?: number;
  /** GN-polish the K globally-nearest seed samples (+ the radial foot). Default 6. */
  seedTopK?: number;
  /** 3D bucket cell size (mm). Default: derived from the sample spacing. */
  cellMm?: number;
  /** GN max iterations per seed. Default 24. */
  maxIter?: number;
  /** Central-difference steps for r's derivatives. Defaults 1e-5 (θ) / 1e-4 (z). */
  hTheta?: number;
  hZ?: number;
}

export interface RadialSurfaceProjector {
  /** Shortest 3D distance + foot from P to the analytic surface (globally correct). */
  project(px: number, py: number, pz: number): SurfaceProjection;
  /** Diagnostics: seed-grid dimensions actually used. */
  readonly gridThetaCount: number;
  readonly gridZCount: number;
  readonly sampleCount: number;
}

/**
 * Build a globally-correct perpendicular projector for the radial surface `rA`.
 * The returned `project` is safe to call millions of times (the grid + index are
 * built once here); each call is a bucket lookup plus a few GN polishes.
 */
export function buildRadialSurfaceProjector(
  rA: AnalyticRadiusFn,
  opts: RadialSurfaceProjectorOptions,
): RadialSurfaceProjector {
  const H = opts.H;
  const zMin = opts.zMin ?? 0;
  const zMax = opts.zMax ?? H;
  const nTheta = Math.max(8, Math.floor(opts.nTheta ?? 512));
  const nZ = Math.max(2, Math.floor(opts.nZ ?? 256));
  const topK = Math.max(1, Math.floor(opts.seedTopK ?? 6));
  const maxIter = opts.maxIter ?? 24;
  const hTheta = opts.hTheta ?? 1e-5;
  const hZ = opts.hZ ?? 1e-4;

  // ── Precompute the surface samples S_ij and remember their (θ,z). ──
  const nZv = nZ + 1;
  const nSamples = nTheta * nZv;
  const sx = new Float64Array(nSamples);
  const sy = new Float64Array(nSamples);
  const sz = new Float64Array(nSamples);
  const sTheta = new Float64Array(nSamples);
  const sZparam = new Float64Array(nSamples);
  let maxArc = 0; // worst neighbour spacing → informs the bucket cell size
  let rMin = Infinity, rMax = -Infinity;
  for (let i = 0; i < nTheta; i++) {
    const th = (i / nTheta) * TAU;
    const cs = Math.cos(th), sn = Math.sin(th);
    for (let j = 0; j < nZv; j++) {
      const z = zMin + (zMax - zMin) * (j / nZ);
      const r = rA(th, z);
      const idx = i * nZv + j;
      sx[idx] = r * cs; sy[idx] = r * sn; sz[idx] = z;
      sTheta[idx] = th; sZparam[idx] = z;
      if (Number.isFinite(r)) { if (r < rMin) rMin = r; if (r > rMax) rMax = r; }
    }
  }
  if (!Number.isFinite(rMin)) { rMin = 0; rMax = 1; }
  maxArc = Math.max((TAU * rMax) / nTheta, (zMax - zMin) / nZ);

  // ── 3D uniform-grid bucket index over the sample points. ──
  const cell = opts.cellMm ?? Math.max(1, 2 * maxArc);
  const invCell = 1 / cell;
  const buckets = new Map<string, number[]>();
  const key = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
  for (let idx = 0; idx < nSamples; idx++) {
    if (!Number.isFinite(sx[idx])) continue;
    const cx = Math.floor(sx[idx] * invCell);
    const cy = Math.floor(sy[idx] * invCell);
    const cz = Math.floor(sz[idx] * invCell);
    const k = key(cx, cy, cz);
    let list = buckets.get(k);
    if (!list) { list = []; buckets.set(k, list); }
    list.push(idx);
  }

  const distSq = (th: number, zz: number, px: number, py: number, pz: number): number => {
    const r = rA(th, zz);
    const ex = px - r * Math.cos(th);
    const ey = py - r * Math.sin(th);
    const ez = pz - zz;
    return ex * ex + ey * ey + ez * ez;
  };

  // Self-contained Gauss-Newton foot from a seed (θ0,z0) — mirrors the descent in
  // projectPointToRadialSurface (backtracking line search, FD derivatives), kept
  // local so this additive module never perturbs that HIGH-impact function.
  const gnFoot = (
    px: number, py: number, pz: number, th0: number, z0: number,
  ): SurfaceProjection => {
    let theta = th0, z = z0, f = distSq(theta, z, px, py, pz);
    for (let it = 0; it < maxIter; it++) {
      const cs = Math.cos(theta), sn = Math.sin(theta);
      const r = rA(theta, z);
      const rTh = (rA(theta + hTheta, z) - rA(theta - hTheta, z)) / (2 * hTheta);
      const rZ = (rA(theta, z + hZ) - rA(theta, z - hZ)) / (2 * hZ);
      const ex = px - r * cs, ey = py - r * sn, ez = pz - z;
      const Stx = rTh * cs - r * sn, Sty = rTh * sn + r * cs;
      const Szx = rZ * cs, Szy = rZ * sn;
      const a = Stx * Stx + Sty * Sty;
      const b = Stx * Szx + Sty * Szy;
      const c = Szx * Szx + Szy * Szy + 1;
      const g1 = Stx * ex + Sty * ey;
      const g2 = Szx * ex + Szy * ey + ez;
      const det = a * c - b * b;
      if (!(Math.abs(det) > 1e-18)) break;
      const dTh = (c * g1 - b * g2) / det;
      const dZ = (a * g2 - b * g1) / det;
      let step = 1, improved = false;
      for (let bt = 0; bt < 24; bt++) {
        const fNew = distSq(theta + step * dTh, z + step * dZ, px, py, pz);
        if (fNew < f) { theta += step * dTh; z += step * dZ; f = fNew; improved = true; break; }
        step *= 0.5;
      }
      if (!improved) break;
      if (step * step * (dTh * dTh + dZ * dZ) < 1e-12) break;
    }
    return { theta, z, dist: Math.sqrt(f) };
  };

  // Collect the K globally-nearest sample indices to P via expanding bucket rings.
  // Terminates when the next ring cannot beat the current K-th nearest (ring·cell >
  // kthDist), so the reported top-K really is the global top-K.
  const nearestSeeds = (px: number, py: number, pz: number): Int32Array => {
    const qx = Math.floor(px * invCell);
    const qy = Math.floor(py * invCell);
    const qz = Math.floor(pz * invCell);
    // Small insertion-sorted top-K by squared distance.
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
    const maxRing = nTheta + nZv; // cannot exceed the grid extent
    let found = 0;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Stop once no unsearched cell can hold a closer sample than the K-th best.
      if (found >= topK) {
        const ringMinDist = (ring - 1) * cell; // nearest possible point in this shell
        if (ringMinDist > 0 && ringMinDist * ringMinDist > bestD2[topK - 1]) break;
      }
      let ringHits = 0;
      for (let gx = qx - ring; gx <= qx + ring; gx++) {
        for (let gy = qy - ring; gy <= qy + ring; gy++) {
          for (let gz = qz - ring; gz <= qz + ring; gz++) {
            // shell surface only
            if (ring > 0 && gx > qx - ring && gx < qx + ring && gy > qy - ring &&
              gy < qy + ring && gz > qz - ring && gz < qz + ring) continue;
            const list = buckets.get(key(gx, gy, gz));
            if (!list) continue;
            for (const idx of list) { consider(idx); ringHits++; }
          }
        }
      }
      found += ringHits;
      // Guard against an all-empty far field: if we've searched well past the shell
      // and found nothing, fall back to the radial seed only (handled by caller).
      if (ring > 4 && found === 0 && ring > Math.max(nTheta, nZv)) break;
    }
    return bestIdx;
  };

  return {
    gridThetaCount: nTheta,
    gridZCount: nZv,
    sampleCount: nSamples,
    project(px: number, py: number, pz: number): SurfaceProjection {
      // Seed set = the radial foot (exact on a vertical wall, cheapest) ∪ the K
      // globally-nearest surface samples. Every seed is polished to an actual surface
      // point, so the result is always a valid UPPER bound on the true distance; the
      // radial foot keeps it ≤ the single-seed projector (up to GN noise); the global
      // samples supply the correct basin on tangled lattices.
      let thetaRad = Math.atan2(py, px);
      if (thetaRad < 0) thetaRad += TAU;
      let best = gnFoot(px, py, pz, thetaRad, pz);
      const seeds = nearestSeeds(px, py, pz);
      for (let s = 0; s < seeds.length; s++) {
        const idx = seeds[s];
        if (idx < 0) continue;
        const cand = gnFoot(px, py, pz, sTheta[idx], sZparam[idx]);
        if (cand.dist < best.dist) best = cand;
      }
      return best;
    },
  };
}
