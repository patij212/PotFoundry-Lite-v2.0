// SPIKE (throwaway, NOT production) — metric Delaunay refinement of a (u,t) surface
// patch. De-risks "Option C" for the CAD-grade export: can a Ruppert/Chew-style
// Delaunay refinement, driven by TRUE 3D triangle angle + facet-to-surface chord,
// drive a tangled anisotropic surface (e.g. GyroidManifold) to a provable min-angle
// AND chord bound — where the conforming mesher structurally cannot?
//
// Scope: an interior (u,t) PATCH (no u-seam periodicity, no t=0/1 rim boundary — those
// are known-solvable engineering; the patch isolates the hard core: the tangled metric).
// Anisotropy is handled by working in metric-scaled coordinates (u·s, t) where
// s = median(sqrt(E/G)) so plain (u,t) Delaunay approximates the 3D Delaunay; residual
// local anisotropy is absorbed by refining on the TRUE 3D angle.

import Delaunator from 'delaunator';

/** Surface oracle: maps a (u,t) parameter point to its true 3D position. */
export interface SurfaceOracle {
  pos(u: number, t: number): readonly [number, number, number];
}

export interface PatchBounds {
  uMin: number;
  uMax: number;
  tMin: number;
  tMax: number;
}

export interface QualityBounds {
  /** Minimum acceptable 3D interior angle (deg). */
  minAngleDeg: number;
  /** Maximum acceptable facet→surface chord sag (mm). */
  maxChordMm: number;
}

export interface RefineOptions {
  seedN?: number; // initial grid resolution per axis (default 8)
  chordSamples?: number; // barycentric interior samples per triangle for sag (default 6)
  maxPoints?: number; // budget cap (default 40000)
  maxRounds?: number; // safety cap on refinement rounds (default 400)
  dedupeEps?: number; // min (scaled) spacing between inserted points (default 1e-4)
  flips?: boolean; // apply metric Lawson flips after each Delaunay (default true)
}

export interface RefineResult {
  points: number; // final vertex count
  triangles: number; // final triangle count
  rounds: number;
  worstMinAngleDeg: number;
  pctBelowAngle: number; // % triangles below minAngleDeg
  worstChordMm: number;
  pctAboveChord: number;
  hitBudget: boolean; // true if it stopped on the point/round cap (did NOT converge)
  // raw mesh (for the probe to re-measure independently)
  uv: Float64Array; // 2·points
  tris: Uint32Array; // 3·triangles (indices into uv)
}

const RAD2DEG = 180 / Math.PI;

/** Min interior angle (deg) of the 3D triangle (a,b,c). 0 for a degenerate triangle. */
export function minAngle3D(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): number {
  const lab = dist(a, b);
  const lbc = dist(b, c);
  const lca = dist(c, a);
  if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) return 0;
  // angle at each vertex via law of cosines, opposite side over the two adjacent
  const angA = lawCos(lca, lab, lbc); // at A, opposite side is bc
  const angB = lawCos(lab, lbc, lca); // at B, opposite side is ca
  const angC = lawCos(lbc, lca, lab); // at C, opposite side is ab
  return Math.min(angA, angB, angC) * RAD2DEG;
}

function lawCos(adj1: number, adj2: number, opp: number): number {
  const cosv = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  return Math.acos(Math.max(-1, Math.min(1, cosv)));
}

function dist(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Max facet→surface chord sag (mm): interior surface points vs the flat triangle plane. */
export function chordSag(
  ua: number, ta: number, ub: number, tb: number, uc: number, tc: number,
  oracle: SurfaceOracle,
  samples: number,
): number {
  const a = oracle.pos(ua, ta);
  const b = oracle.pos(ub, tb);
  const c = oracle.pos(uc, tc);
  // plane normal
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
  const fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
  let nx = ey * fz - ez * fy;
  let ny = ez * fx - ex * fz;
  let nz = ex * fy - ey * fx;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-15) return 0;
  nx /= nl; ny /= nl; nz /= nl;
  let worst = 0;
  // barycentric interior grid (excludes vertices)
  for (let i = 1; i < samples; i++) {
    for (let j = 1; j < samples - i; j++) {
      const w0 = i / samples;
      const w1 = j / samples;
      const w2 = 1 - w0 - w1;
      if (w2 <= 0) continue;
      const u = w0 * ua + w1 * ub + w2 * uc;
      const t = w0 * ta + w1 * tb + w2 * tc;
      const p = oracle.pos(u, t);
      const d = Math.abs((p[0] - a[0]) * nx + (p[1] - a[1]) * ny + (p[2] - a[2]) * nz);
      if (d > worst) worst = d;
    }
  }
  return worst;
}

/** First-fundamental-form sqrt scales (√E, √G) at (u,t) via central differences. */
function metricScales(oracle: SurfaceOracle, u: number, t: number, hu: number, ht: number): [number, number] {
  const pu1 = oracle.pos(u + hu, t), pu0 = oracle.pos(u - hu, t);
  const pt1 = oracle.pos(u, t + ht), pt0 = oracle.pos(u, t - ht);
  const su = Math.hypot(pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]) / (2 * hu);
  const st = Math.hypot(pt1[0] - pt0[0], pt1[1] - pt0[1], pt1[2] - pt0[2]) / (2 * ht);
  return [su, st];
}

/** Median anisotropy scale s = median(√E/√G) over a coarse sampling of the patch. */
export function anisotropyScale(oracle: SurfaceOracle, b: PatchBounds): number {
  const hu = (b.uMax - b.uMin) * 1e-4 + 1e-6;
  const ht = (b.tMax - b.tMin) * 1e-4 + 1e-6;
  const ratios: number[] = [];
  const N = 8;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const u = b.uMin + ((b.uMax - b.uMin) * i) / N;
      const t = b.tMin + ((b.tMax - b.tMin) * j) / N;
      const [su, st] = metricScales(oracle, u, t, hu, ht);
      if (su > 1e-9 && st > 1e-9) ratios.push(su / st);
    }
  }
  if (ratios.length === 0) return 1;
  ratios.sort((x, y) => x - y);
  return ratios[Math.floor(ratios.length / 2)];
}

/**
 * Lawson edge-flips that MAXIMIZE the true 3D min-angle: where the (globally-scaled)
 * Euclidean Delaunay guessed the diagonal wrong for the LOCAL surface metric, flipping
 * to the other diagonal raises the worst angle of the pair. This is the local-metric
 * correction a global anisotropy scale cannot make. Returns a flipped triangle list.
 */
export function metricFlipPasses(
  uv: ArrayLike<number>,
  triIn: Uint32Array | number[],
  oracle: SurfaceOracle,
  maxPasses = 24,
): Uint32Array {
  const T = Array.from(triIn);
  const P = (vi: number): readonly [number, number, number] => oracle.pos(uv[vi * 2], uv[vi * 2 + 1]);
  // a and b are on opposite sides of line r–s (in (u,t)) ⇒ r–s is a valid diagonal.
  const validFlip = (a: number, b: number, r: number, s: number): boolean => {
    const ru = uv[r * 2], rt = uv[r * 2 + 1], su = uv[s * 2], st = uv[s * 2 + 1];
    const side = (p: number): number => (su - ru) * (uv[p * 2 + 1] - rt) - (st - rt) * (uv[p * 2] - ru);
    return side(a) * side(b) < 0;
  };
  const MULT = 100000000; // numeric edge key a*MULT+b (a<b); fast vs string keys
  for (let pass = 0; pass < maxPasses; pass++) {
    const edges = new Map<number, Array<{ tri: number; opp: number }>>();
    const nt = T.length / 3;
    const addEdge = (a: number, b: number, tri: number, opp: number): void => {
      const k = a < b ? a * MULT + b : b * MULT + a;
      const l = edges.get(k);
      if (l) l.push({ tri, opp }); else edges.set(k, [{ tri, opp }]);
    };
    for (let t = 0; t < nt; t++) {
      const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
      addEdge(a, b, t, c); addEdge(b, c, t, a); addEdge(c, a, t, b);
    }
    let flips = 0;
    const touched = new Set<number>();
    for (const [k, list] of edges) {
      if (list.length !== 2) continue;
      const t0 = list[0].tri, t1 = list[1].tri, r = list[0].opp, s = list[1].opp;
      if (touched.has(t0) || touched.has(t1)) continue;
      const a = Math.floor(k / MULT), b = k % MULT;
      const curMin = Math.min(minAngle3D(P(a), P(b), P(r)), minAngle3D(P(a), P(b), P(s)));
      const flpMin = Math.min(minAngle3D(P(a), P(r), P(s)), minAngle3D(P(b), P(r), P(s)));
      if (flpMin > curMin + 1e-6 && validFlip(a, b, r, s)) {
        T[3 * t0] = a; T[3 * t0 + 1] = r; T[3 * t0 + 2] = s;
        T[3 * t1] = b; T[3 * t1 + 1] = r; T[3 * t1 + 2] = s;
        touched.add(t0); touched.add(t1); flips++;
      }
    }
    if (flips === 0) break;
  }
  return Uint32Array.from(T);
}

/**
 * Metric Delaunay refinement of a (u,t) patch to the given quality bounds, by
 * METRIC-LONGEST-EDGE midpoint bisection: each bad triangle's longest 3D edge is
 * split at its (u,t) midpoint. Midpoints land strictly inside existing edges (no
 * out-of-patch circumcenters → no coincident-point degeneracy), and splitting the
 * longest 3D edge directly attacks the anisotropy (the long u-edges) → squares the
 * triangles in 3D. The Delaunay runs in metric-scaled coords (u·s, t).
 *
 * Quality is measured on the patch INTERIOR (triangles not touching the artificial
 * patch boundary), since the patch is a cut of a larger surface.
 */
export function metricDelaunayRefine(
  oracle: SurfaceOracle,
  bounds: PatchBounds,
  quality: QualityBounds,
  opts: RefineOptions = {},
): RefineResult {
  const seedN = opts.seedN ?? 8;
  const chordSamples = opts.chordSamples ?? 6;
  const maxPoints = opts.maxPoints ?? 40000;
  const maxRounds = opts.maxRounds ?? 400;
  const dedupeEps = opts.dedupeEps ?? 1e-4;
  const useFlips = opts.flips ?? true;

  const s = anisotropyScale(oracle, bounds); // u-axis scale so (u·s, t) ≈ isotropic in 3D
  const uSpan = bounds.uMax - bounds.uMin;
  const tSpan = bounds.tMax - bounds.tMin;
  const margU = uSpan * 2e-3, margT = tSpan * 2e-3; // "on the patch boundary" band

  const uv: number[] = [];
  // hash-set dedupe on rounded scaled coords (prevents re-adding an existing point)
  const seen = new Set<string>();
  const key = (u: number, t: number): string =>
    `${Math.round((u * s) / dedupeEps)},${Math.round(t / dedupeEps)}`;
  const addPoint = (u: number, t: number): boolean => {
    const k = key(u, t);
    if (seen.has(k)) return false;
    seen.add(k);
    uv.push(u, t);
    return true;
  };
  // Seed ISOTROPIC IN THE SCALED METRIC: a (u,t) cell has 3D aspect s·(du/dt), so for
  // square scaled cells the u axis needs s·(uSpan/tSpan)× more divisions than t.
  const seedNt = Math.max(2, seedN);
  const seedNu = Math.max(2, Math.round(seedN * s * (uSpan / tSpan)));
  for (let i = 0; i <= seedNu; i++) {
    for (let j = 0; j <= seedNt; j++) {
      addPoint(bounds.uMin + (uSpan * i) / seedNu, bounds.tMin + (tSpan * j) / seedNt);
    }
  }

  const scaledCoords = (): Float64Array => {
    const c = new Float64Array(uv.length);
    for (let k = 0; k < uv.length; k += 2) { c[k] = uv[k] * s; c[k + 1] = uv[k + 1]; }
    return c;
  };
  const onBoundary = (u: number, t: number): boolean =>
    u <= bounds.uMin + margU || u >= bounds.uMax - margU || t <= bounds.tMin + margT || t >= bounds.tMax - margT;

  let rounds = 0;
  let tris: Uint32Array = new Uint32Array(0);
  let hitBudget = false;

  for (; rounds < maxRounds; rounds++) {
    tris = new Delaunator(scaledCoords()).triangles;
    if (useFlips) tris = metricFlipPasses(uv, tris, oracle, 6);
    let added = 0;
    for (let ti = 0; ti < tris.length; ti += 3) {
      const i0 = tris[ti] * 2, i1 = tris[ti + 1] * 2, i2 = tris[ti + 2] * 2;
      const ua = uv[i0], ta = uv[i0 + 1], ub = uv[i1], tb = uv[i1 + 1], uc = uv[i2], tc = uv[i2 + 1];
      const pa = oracle.pos(ua, ta), pb = oracle.pos(ub, tb), pc = oracle.pos(uc, tc);
      const ang = minAngle3D(pa, pb, pc);
      const sag = chordSag(ua, ta, ub, tb, uc, tc, oracle, chordSamples);
      if (ang >= quality.minAngleDeg && sag <= quality.maxChordMm) continue;
      // longest 3D edge → split at its (u,t) midpoint
      const lAB = dist(pa, pb), lBC = dist(pb, pc), lCA = dist(pc, pa);
      let mu: number, mt: number;
      if (lAB >= lBC && lAB >= lCA) { mu = (ua + ub) / 2; mt = (ta + tb) / 2; }      // AB longest
      else if (lBC >= lAB && lBC >= lCA) { mu = (ub + uc) / 2; mt = (tb + tc) / 2; } // BC longest
      else { mu = (uc + ua) / 2; mt = (tc + ta) / 2; }                               // CA longest
      if (addPoint(mu, mt)) added++;
      if (uv.length / 2 > maxPoints) { hitBudget = true; break; }
    }
    if (hitBudget) { rounds++; break; }
    if (added === 0) break; // converged
  }
  if (rounds >= maxRounds) hitBudget = true;

  // final measurement (interior triangles only)
  tris = new Delaunator(scaledCoords()).triangles;
  if (useFlips) tris = metricFlipPasses(uv, tris, oracle);
  let worstAng = 180, belowAng = 0, worstChord = 0, aboveChord = 0, counted = 0;
  for (let ti = 0; ti < tris.length; ti += 3) {
    const i0 = tris[ti] * 2, i1 = tris[ti + 1] * 2, i2 = tris[ti + 2] * 2;
    const ua = uv[i0], ta = uv[i0 + 1], ub = uv[i1], tb = uv[i1 + 1], uc = uv[i2], tc = uv[i2 + 1];
    if (onBoundary(ua, ta) || onBoundary(ub, tb) || onBoundary(uc, tc)) continue;
    counted++;
    const ang = minAngle3D(oracle.pos(ua, ta), oracle.pos(ub, tb), oracle.pos(uc, tc));
    const sag = chordSag(ua, ta, ub, tb, uc, tc, oracle, chordSamples);
    if (ang < worstAng) worstAng = ang;
    if (ang < quality.minAngleDeg) belowAng++;
    if (sag > worstChord) worstChord = sag;
    if (sag > quality.maxChordMm) aboveChord++;
  }

  return {
    points: uv.length / 2,
    triangles: tris.length / 3,
    rounds,
    worstMinAngleDeg: counted > 0 ? worstAng : 0,
    pctBelowAngle: counted > 0 ? (100 * belowAng) / counted : 0,
    worstChordMm: worstChord,
    pctAboveChord: counted > 0 ? (100 * aboveChord) / counted : 0,
    hitBudget,
    uv: Float64Array.from(uv),
    tris,
  };
}
