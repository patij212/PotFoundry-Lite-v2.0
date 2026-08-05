// s45PerpCacheEquiv.ts — PROVE THE distPerp SEED-GRID CACHE IS BIT-IDENTICAL, AND PRICE IT.
//
// The cache is bit-identical BY CONSTRUCTION (same rA, same arguments, the stored double IS the one
// the loop computed), but "by construction" is an argument and this campaign scores on measurements.
// So this re-implements the ORIGINAL uncached sweep verbatim beside the cached one, runs both over
// the same points, and compares every returned field with Object.is — not a tolerance.
//
// It also prices the thing the cache actually unlocks. Standing defect #3: the default nu=180,
// nv=120 seeding grid was MEASURED over-stating by 30.902 um (26%) at tri 690730, because a coarse
// seed lands in the wrong basin and the descent converges to a local foot. The fix is density; the
// reason density was never taken is that it multiplied the per-call cost. With the table built once,
// this reports what 360x240 and 540x360 now cost per call, and — more importantly — HOW MANY
// READINGS THEY CHANGE and in which direction. A denser seed can only ever find an equal or NEARER
// foot, so every disagreement is the coarse grid having over-read.
//
// Usage:  bash research/tools/run-s45-perp-cache-equiv.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { readFileSync } from 'node:fs';
import { distPerp, perpSeedGrid as perpSeedGridForTest } from '../bridge/_facetTruthLib';
import type { RadiusFn } from '../bridge/_facetTruthLib';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const N = Math.round(envF('PF_S45_N', 300));
const STL = process.env.PF_S45_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
let evals = 0;
const rAbase = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const rA: RadiusFn = (th: number, z: number): number => { evals += 1; return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z); };

/**
 * THE ORIGINAL SWEEP, VERBATIM — and ONLY the sweep.
 *
 * ⚠ THE FIRST VERSION OF THIS FILE REIMPLEMENTED THE WHOLE OF `distPerp` AND WAS WRONG. It omitted
 * the `distLocal` seed the real function pushes as a FOURTH start, so the "uncached" control ran a
 * 3-seed search against the cached path's 4 and reported 82/300 "mismatches" at |delta d| ~3e-11 um —
 * the fourth Newton converging to the same foot from a different direction. That is a defect in the
 * CONTROL, not in the cache, and re-deriving the same wrong bar is how a good change gets rejected.
 *
 * The cache changes exactly ONE thing: which two seeds (s1, s2) the coarse sweep hands to the Newton
 * stage. So the bar is on (s1, s2) — bit-identical or not — and nothing downstream is reimplemented.
 */
function sweepSeedsUncached(px: number, py: number, pz: number, nu: number, nv: number): [number, number, number, number] {
  const TAU = 2 * Math.PI;
  const s0: [number, number] = [Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz];
  let b1 = Infinity; let b2 = Infinity; let s1: [number, number] = s0; let s2: [number, number] = s0;
  for (let i = 0; i < nu; i += 1) {
    const th = (TAU * i) / nu; const ct = Math.cos(th); const st = Math.sin(th);
    for (let j = 0; j <= nv; j += 1) {
      const z = (H * j) / nv;
      const r = rA(th, z);
      const dx = px - r * ct; const dy = py - r * st; const dz = pz - z;
      const v = dx * dx + dy * dy + dz * dz;
      if (v < b1) { b2 = b1; s2 = s1; b1 = v; s1 = [th, z]; } else if (v < b2) { b2 = v; s2 = [th, z]; }
    }
  }
  return [s1[0], s1[1], s2[0], s2[1]];
}
/** the same two seeds, read out of the cached grid — the code path the library now takes */
function sweepSeedsCached(px: number, py: number, pz: number, nu: number, nv: number): [number, number, number, number] {
  const g = perpSeedGridForTest(rA, H, nu, nv);
  const s0: [number, number] = [Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz];
  let b1 = Infinity; let b2 = Infinity; let s1: [number, number] = s0; let s2: [number, number] = s0;
  for (let k = 0; k < g.x.length; k += 1) {
    const dx = px - g.x[k]; const dy = py - g.y[k]; const dz = pz - g.z[k];
    const v = dx * dx + dy * dy + dz * dz;
    if (v < b1) { b2 = b1; s2 = s1; b1 = v; s1 = [g.th[k], g.z[k]]; } else if (v < b2) { b2 = v; s2 = [g.th[k], g.z[k]]; }
  }
  return [s1[0], s1[1], s2[0], s2[1]];
}

log('===== S45 — distPerp SEED-GRID CACHE: EQUIVALENCE AND PRICE =====');
const { xyz, nTri } = readMeshFloat64(STL, false);
log(`points from ${STL}  (${nTri} triangles, sampling ${N} facet centroids)`);
const P: Array<[number, number, number]> = [];
for (let k = 0; k < N; k += 1) {
  const t = Math.floor(((k + 0.5) / N) * nTri); const o = t * 9;
  P.push([
    (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3,
    (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3,
    (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3,
  ]);
}

// ── 1. EQUIVALENCE. The uncached path shares distPerpFrom with the cached one, so comparing the
//      SEED-DERIVED result isolates exactly what the cache changed. Object.is, never a tolerance. ──
log('');
log('1. EQUIVALENCE — the coarse sweep is the ONLY thing the cache changes, so the bar is on the two');
log('   seeds it hands to Newton. Object.is on all four numbers, never a tolerance.');
let diff = 0;
for (const [px, py, pz] of P) {
  const a = sweepSeedsCached(px, py, pz, 180, 120);
  const b = sweepSeedsUncached(px, py, pz, 180, 120);
  if (!a.every((v, i) => Object.is(v, b[i]))) diff += 1;
}
log(`   points ${P.length}   DIFFERING ${diff}`);
log(`   ${diff === 0 ? '*** BIT-IDENTICAL seeds on every point. The cache cannot change any downstream result. ***' : '*** MISMATCH — the cache is NOT equivalent. DO NOT SHIP. ***'}`);
// and the end-to-end reading, for completeness: same function, called twice, must be stable
let selfDiff = 0;
for (const [px, py, pz] of P) {
  const a = distPerp(rA, H, px, py, pz, {});
  const b = distPerp(rA, H, px, py, pz, {});
  if (!Object.is(a.d, b.d) || !Object.is(a.th, b.th) || !Object.is(a.z, b.z)) selfDiff += 1;
}
log(`   distPerp called twice on each point, cached both times: ${selfDiff} differing (must be 0)`);

// ── 2. PRICE. rA evals per call, cached vs uncached, at three densities. ──
log('');
log('2. PRICE — rA evaluations per distPerp call.');
const price = (nu: number, nv: number): void => {
  // uncached: measure one call's evals
  evals = 0; sweepSeedsUncached(P[0][0], P[0][1], P[0][2], nu, nv); const un = evals;
  // cached: warm once (pays the build), then measure a steady-state call
  distPerp(rA, H, P[1][0], P[1][1], P[1][2], { nu, nv });
  evals = 0; distPerp(rA, H, P[2][0], P[2][1], P[2][2], { nu, nv }); const ca = evals;
  const t0 = Date.now(); for (const [px, py, pz] of P) distPerp(rA, H, px, py, pz, { nu, nv }); const tc = Date.now() - t0;
  const t1 = Date.now(); for (const [px, py, pz] of P) sweepSeedsUncached(px, py, pz, nu, nv); const tu = Date.now() - t1;
  log(`   ${String(nu).padStart(4)}x${String(nv).padEnd(4)}  grid ${String(nu * (nv + 1)).padStart(7)} pts   uncached ${String(un).padStart(7)} evals/sweep   cached ${String(ca).padStart(5)}   ${(un / Math.max(1, ca)).toFixed(0)}x fewer   |   ${N} calls: ${String(tu).padStart(6)} ms -> ${String(tc).padStart(5)} ms  (${(tu / Math.max(1, tc)).toFixed(1)}x)`);
};
price(180, 120);
price(360, 240);
price(540, 360);

// ── 3. WHAT DENSITY BUYS. A denser seed can only find an equal or NEARER foot, so any disagreement
//      is the coarse grid over-reading — standing defect #3, measured across a population.
//      ⚠ MEASURED ON TWO POPULATIONS ON PURPOSE. Defect #3 was found at ONE facet (tri 690730, 26%
//      over-read). A uniform sample of facet centroids is the wrong place to look for it: the coarse
//      seed only fails where the surface has a competing basin within the grid pitch, which is the
//      FEATURE-BEARING population, not the smooth bulk. So the stranded facets are sampled too. ──
log('');
log('3. WHAT THE DENSER GRID BUYS — standing defect #3 over populations, not one facet.');
log('   (a denser seed can only find an equal or NEARER foot, so every disagreement is a coarse OVER-READ)');
interface JamRow { z: number; shortUm: number; midUm: number; longUm: number }
let JAM: Array<[number, number, number]> = [];
try {
  const jr = (JSON.parse(readFileSync(STL.replace(/\.stl$/, '.unresolved.json'), 'utf8')) as { facets: JamRow[] }).facets;
  const byZ = new Map<number, number[]>();
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const z = Math.round((((xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3)) * 1000) / 1000;
    const l = byZ.get(z); if (l === undefined) byZ.set(z, [t]); else l.push(t);
  }
  for (const r of jr) {
    const want = [r.shortUm, r.midUm, r.longUm].sort((a, b) => a - b);
    let hit = -1;
    for (const dz of [0, 0.001, -0.001]) {
      for (const t of byZ.get(Math.round((r.z + dz) * 1000) / 1000) ?? []) {
        const o = t * 9;
        const e = [
          Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]),
          Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]),
          Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]),
        ].map((v) => Math.round(v * 10000) / 10).sort((a, b) => a - b);
        if (e.every((v, k) => Math.abs(v - want[k]) < 0.35)) { hit = t; break; }
      }
      if (hit >= 0) break;
    }
    if (hit >= 0) {
      const o = hit * 9;
      JAM.push([
        (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3,
        (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3,
        (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3,
      ]);
    }
  }
} catch { JAM = []; }
log(`   populations: UNIFORM ${P.length} facet centroids, STRANDED ${JAM.length} (the shape-ar jam)`);
for (const [name, pts] of [['UNIFORM ', P], ['STRANDED', JAM]] as Array<[string, Array<[number, number, number]>]>) {
  if (pts.length === 0) { log(`   ${name}: (no points)`); continue; }
  for (const [nu, nv] of [[360, 240], [540, 360]] as Array<[number, number]>) {
    let changed = 0; let sumRel = 0; let maxRel = 0; let maxAbs = 0;
    for (const [px, py, pz] of pts) {
      const a = distPerp(rA, H, px, py, pz, {});
      const b = distPerp(rA, H, px, py, pz, { nu, nv });
      if (b.d < a.d - 1e-12) {
        changed += 1;
        const rel = (a.d - b.d) / Math.max(1e-12, b.d);
        sumRel += rel; if (rel > maxRel) maxRel = rel;
        if ((a.d - b.d) * 1000 > maxAbs) maxAbs = (a.d - b.d) * 1000;
      }
    }
    log(`   ${name} ${nu}x${nv}: ${changed}/${pts.length} readings FELL (${((100 * changed) / pts.length).toFixed(1)}%)   mean over-read ${changed > 0 ? ((100 * sumRel) / changed).toFixed(2) : '0.00'}%   max ${(100 * maxRel).toFixed(1)}%   max abs ${maxAbs.toFixed(3)} um`);
  }
}
log('');
log('READ IT AS: the cache is free and exact; the DENSITY is a separate decision this file prices but');
log('does not take. The default stays 180x120 so every published number reproduces.');
