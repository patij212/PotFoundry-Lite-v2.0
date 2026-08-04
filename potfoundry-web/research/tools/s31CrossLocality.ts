// s31CrossLocality.ts — ARE THE 9,363 REAL? Locality + magnitude census of the crossing edges.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY. 2026-08-04: three seed knobs have now been swept and the crossing RATE will not move.
//
//   lever                       arms                        crossing rate
//   bowFrac      (s16BowAB)     0 / .25 / .50 / 1.0         2.675 → 2.664%   (commit 181e6962)
//   chainDecimateMm (s31H0AB)   192.6 / 96.3 / 48.2 / 10 um 2.675 → 2.345%   (seed 1.74x bigger)
//   junctionMergeMm (s31H0AB)   2.0 / 1.0 / 0.5 / 0.25 mm   2.675 → 2.721%   (junctions 3.93x)
//
// Twelve arms, every control reproducing S47CAV to the digit, and the rate sits at 2.3-2.7%
// throughout. An INVARIANT that survives a 1.74x change in seed size and a 3.93x change in junction
// count is not a tuning residual. Before concluding anything architectural from it, the instrument
// itself has to be checked — because a FIXED FRACTION OF EDGES TRIPPING A THRESHOLD would produce
// exactly this signature.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE TWO READINGS, and this probe separates them
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// R-REAL   The 9,363 are genuine transversal crossings of a traced locus. Then they must sit ON the
//          traced loci: their midpoints cluster at distance ~0 from the nearest polyline, and their
//          kink `big` (the two-scale |Δ²r| at the located point — a proxy for kink strength) matches
//          what a real crease reads. The invariance then IS architectural: a CDT whose constraints
//          are a SECANT polyline of a curved analytic locus leaves crossings at a rate set by the
//          geometry, not by any knob, and no seed parameter can remove them.
//
// R-FALSE  A material fraction are DETECTOR FALSE POSITIVES. `locateKinkRaw` coarse-scans |Δ²r| over
//          `kinkScan`=16 bins, takes the argmax, and calls it a crease when small/big >= 0.15
//          (an ideal smooth peak reads ~1/16 = 0.0625, an ideal crease ~1/4). On a LONG background
//          edge (~1.1 mm) over a rippled surface that ratio can be tripped by ordinary curvature.
//          Then part of the 9,363 is instrument, the population is smaller than published, and the
//          invariance is the threshold's fixed false-positive rate — a different problem entirely.
//
// DISCRIMINATOR: distance from the crossing point to the nearest TRACED locus polyline. A real
// crossing is ON a locus (the tracer found it) — distance ~0 to a few um. A false positive has no
// reason to be near one. Reported as a distribution, plus the ratio/big distributions and a split by
// edge class (does the edge touch a constraint vertex, or is it pure background lattice?).
//
// ⚠ ONE-SIDEDNESS, STATED. Distance-to-locus is necessary, not sufficient: an edge near a locus
// could still be a false positive, and the tracer itself can miss loci (94 jump-class components are
// excluded from it by construction). So a FAR population proves false positives; a NEAR population
// is consistent with R-REAL but does not prove it alone. The `ratio` distribution is the second,
// independent read — a real crease clusters near 1/4, a curvature artefact sits just over the 0.15
// bar. Both are printed; neither is quoted alone.
//
// Control arm only — no sweep. One seed build + the census. ~4 min.
//
// Usage:  bash research/tools/run-s31-locality.sh          (from potfoundry-web/)
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// RESULT — 2026-08-04. *** R-REAL. THE 9,363 ARE GENUINE CREASE CROSSINGS. R-FALSE IS DEAD. ***
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Control reproduces: 9,363 / 349,992, seed 116,931 pts / 233,062 tris / 12,806 constraints.
//
//   kink ratio        p10 0.25   p50 0.25   p90 0.25   p99 0.27      ← TEXTBOOK CREASE (ideal = 1/4)
//                     99.6% in the crease-like band; 0.2% just over the 0.15 bar
//   dist to locus     p50 8.4 um   p90 20.8 um   |  63.6% <=10 um, 92.1% <=50 um
//   incidence         both endpoints on a constraint   731 (7.8%)
//                     *** EXACTLY ONE endpoint         8,280 (88.4%) ***
//                     neither                            352 (3.8%)
//   edge length       p10 50.0 um (= the across floor)   p50 139 um
//
// THE DETECTOR IS NOT THE PROBLEM. The ratio distribution is a spike at 0.25 — the ideal crease
// value — not a pile just over the acceptance bar. A threshold artefact would look like the latter.
// Every claim quoting 9,363 stands.
//
// *** THE 88.4% IS THE REPORTED DEFECT, MEASURED. *** An edge with EXACTLY ONE endpoint on the
// constraint is an edge radiating from a chain vertex whose far end is off the locus, re-crossing the
// curved locus in its interior — i.e. "a facet linking vertices on both sides of the chain, cutting
// through it". p10 edge length is 50.0 um, exactly the S15 across floor, so the population IS the
// chain-to-first-offset-ring strip. That is the band the micro-serrations are in.
//
// AND IT EXPLAINS THE RATE INVARIANCE (bow / decimation / junction clustering, 12 arms, 2.3-2.7%
// throughout). Splitting such an edge AT the locus creates a new on-locus vertex whose own new edges
// again have exactly one constrained endpoint and again cross the curved locus. The population is a
// FIXED POINT of edge bisection, which is why no seed knob and no refinement lever moves its rate.
// Consistent with [[project_strata_jam_census]]'s architectural finding from the opposite direction.
//
// SECOND, SMALLER, SEPARATE DEFECT — TRACER COVERAGE. dist p99 = 3,650 um and max = 8,553 um: about
// 4-6% of the crossings are real creases (ratio 0.25) that sit MILLIMETRES from any traced locus, so
// the tracer never found them and the seed never constrained them. Candidates: the 94 jump-class
// components excluded by construction, plus genuine tracer misses. Worth its own probe; do not fold
// it into the 88.4% population, it has a different repair.
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { traceLoci, DEFAULT_TRACE_OPTS } from '../bridge/_strataLocusTrace';
import { locateKinkRaw, dThRaw, canonTheta, type SweepPredConst } from '../bridge/_sweepPredicate';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS } from '../bridge/_strataAlignedSeed';
import { REGION_SCHEMA, type RegionArtifact } from '../bridge/_strataRegionExtract';
import type { PatchRegion } from '../bridge/_judgeShape';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const rRef = 45;                 // the chart's own theta->mm reference, as the seed builder uses it
const SNAP_ALPHA = 0.12;
const AL_PATCH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json';
const AL_PATCH_IDS = ('0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,'
  + '1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016').split(',');

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
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.6 / 1000,
};
const styleParams = { ...registryDefaults('GothicArches') };
const rA = buildRadiusFn('GothicArches' as StyleId, styleParams, DIMS);

log('===== S31 CROSSING LOCALITY — are the 9,363 real crossings or detector false positives? =====');
const t0 = Date.now();
const art = traceLoci(rA, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 400, nv: 280, hRefMm: 0.35 });
log(`trace ${((Date.now() - t0) / 1000).toFixed(0)}s — ${art.counts.loci} components, `
  + `${art.counts.polylinePts} points, junctions ${art.counts.junctions}`);

const regArt = JSON.parse(readFileSync(AL_PATCH, 'utf8')) as RegionArtifact;
if (regArt.schema !== REGION_SCHEMA) throw new Error('patch schema mismatch');
const chosen = new Map<number, { id: number; theta: number; z: number; radiusMm: number }>();
for (const s of AL_PATCH_IDS) {
  const r = regArt.regions.find((x) => x.id === Number(s));
  if (r === undefined) throw new Error(`patch id ${s} absent`);
  chosen.set(r.id, r);
}
const patchRoute: PatchRegion[] = [...chosen.values()].sort((a, b) => a.id - b.id)
  .map((r) => ({ id: `D${r.id}`, theta: r.theta, z: r.z, radiusMm: r.radiusMm }));

const t1 = Date.now();
const rep = buildAlignedSeedRepaired(rA, art, {
  ...DEFAULT_SEED_OPTS, H, gu: 200, gv: 140,
  alongMul: 1.0, acrossFrac: 0.35, useField: true,
  acrossAbs: true, acrossMinMm: 0.050, seedARmax: 24, bowFrac: 0,
  patchRoute, patchMaxMm: 1.5, patchSubMax: 16,
  acrossRings: 7, acrossGrade: 1.6, acrossStrideMax: 4,
  acrossStructured: false, acrossStructuredMode: 'full',
  acrossMaxMm: 0.650, turnMul: 9,
  mistraceUm: 0, shapeAR: 50, tolMm: 0.01,
}, 6);
const seed = rep.seed;
log(`seed ${((Date.now() - t1) / 1000).toFixed(0)}s — points ${seed.stats.points} tris ${seed.stats.tris} `
  + `constraints ${seed.stats.constraints} (S47CAV: 116931 / 233062 / 12806)`);

// ── the traced loci as a lookup grid in CHART coords (x = rRef*theta mm, y = z mm) ───────────────
const CELL = 2.0;
const grid = new Map<string, Array<[number, number, number, number]>>();  // segments x0,y0,x1,y1
const gk = (ix: number, iy: number): string => `${ix},${iy}`;
let segCount = 0;
for (const L of art.loci) {
  for (let i = 0; i + 1 < L.pts.length; i += 1) {
    const x0 = rRef * L.pts[i][0]; const y0 = L.pts[i][1];
    const x1 = rRef * L.pts[i + 1][0]; const y1 = L.pts[i + 1][1];
    const s: [number, number, number, number] = [x0, y0, x1, y1];
    segCount += 1;
    for (let ix = Math.floor(Math.min(x0, x1) / CELL); ix <= Math.floor(Math.max(x0, x1) / CELL); ix += 1) {
      for (let iy = Math.floor(Math.min(y0, y1) / CELL); iy <= Math.floor(Math.max(y0, y1) / CELL); iy += 1) {
        const k = gk(ix, iy); const l = grid.get(k);
        if (l === undefined) grid.set(k, [s]); else l.push(s);
      }
    }
  }
}
log(`locus segment grid: ${segCount} segments in ${grid.size} cells of ${CELL} mm`);

/** distance from a chart point to the nearest traced locus segment, mm. Rings outward until found. */
function distToLocus(x: number, y: number): number {
  let best = Infinity;
  for (let ring = 0; ring <= 6; ring += 1) {
    const ix0 = Math.floor(x / CELL); const iy0 = Math.floor(y / CELL);
    for (let ix = ix0 - ring; ix <= ix0 + ring; ix += 1) {
      for (let iy = iy0 - ring; iy <= iy0 + ring; iy += 1) {
        if (ring > 0 && Math.abs(ix - ix0) !== ring && Math.abs(iy - iy0) !== ring) continue;
        for (const [x0, y0, x1, y1] of grid.get(gk(ix, iy)) ?? []) {
          const ux = x1 - x0; const uy = y1 - y0; const l2 = ux * ux + uy * uy;
          let t = l2 < 1e-18 ? 0 : ((x - x0) * ux + (y - y0) * uy) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(x - (x0 + t * ux), y - (y0 + t * uy));
          if (d < best) best = d;
        }
      }
    }
    if (best < ring * CELL) return best;   // provably closest: no farther ring can beat it
  }
  return best;
}

// ── vertices that carry a CONSTRAINT (the chains as placed) ──────────────────────────────────────
const onCon = new Set<number>();
for (const [a, b] of seed.constraints) { onCon.add(a); onCon.add(b); }

// ── the census ───────────────────────────────────────────────────────────────────────────────────
const th = seed.pts.map(([t]) => t);
const z = seed.pts.map(([, zz]) => zz);
const seen = new Set<string>();
const dists: number[] = []; const ratios: number[] = []; const bigs: number[] = []; const lens: number[] = [];
let tested = 0; let cross = 0;
let clsBoth = 0; let clsOne = 0; let clsNone = 0;   // crossing edges by constraint-vertex incidence
for (const [a, b, c] of seed.tris) {
  for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
    const lo = p < q ? p : q; const hi = p < q ? q : p;
    const k0 = `${lo},${hi}`;
    if (seen.has(k0)) continue;
    seen.add(k0); tested += 1;
    const dth = dThRaw(th[lo], th[hi]);
    const kk = locateKinkRaw(rA, th[lo], z[lo], th[lo] + dth, z[hi], PRED);
    if (kk === null || kk.jump) continue;
    if (kk.t <= SNAP_ALPHA || kk.t >= 1 - SNAP_ALPHA) continue;
    cross += 1;
    const cth = canonTheta(th[lo] + dth * kk.t);
    dists.push(distToLocus(rRef * cth, z[lo] + (z[hi] - z[lo]) * kk.t));
    ratios.push(kk.ratio); bigs.push(kk.big);
    lens.push(Math.hypot(rRef * dth, z[hi] - z[lo]));
    const n = (onCon.has(lo) ? 1 : 0) + (onCon.has(hi) ? 1 : 0);
    if (n === 2) clsBoth += 1; else if (n === 1) clsOne += 1; else clsNone += 1;
  }
}
log(`crossings ${cross} / ${tested} (${((100 * cross) / tested).toFixed(3)}%)   [S47CAV: 9363 / 349848]`);
log('');

const pct = (arr: number[], f: number): number => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
function dist(name: string, arr: number[], scale: number, unit: string): void {
  const s = [...arr].sort((x, y) => x - y);
  log(`  ${name.padEnd(22)} p10 ${(pct(s, 0.10) * scale).toFixed(2).padStart(9)}  p50 ${(pct(s, 0.50) * scale).toFixed(2).padStart(9)}`
    + `  p90 ${(pct(s, 0.90) * scale).toFixed(2).padStart(9)}  p99 ${(pct(s, 0.99) * scale).toFixed(2).padStart(9)}`
    + `  max ${(s[s.length - 1] * scale).toFixed(2).padStart(9)} ${unit}`);
}

log('── DISCRIMINATOR 1: distance from the crossing point to the nearest TRACED locus ──');
dist('dist to locus', dists, 1000, 'um');
const near = (mm: number): string => `${((100 * dists.filter((d) => d <= mm).length) / dists.length).toFixed(1)}%`;
log(`    within 10 um ${near(0.010)}   50 um ${near(0.050)}   200 um ${near(0.200)}`
  + `   1 mm ${near(1.0)}   5 mm ${near(5.0)}`);
log('');
log('── DISCRIMINATOR 2: the two-scale ratio (smooth ~0.0625, bar 0.15, ideal crease ~0.25) ──');
dist('kink ratio', ratios, 1, '');
const band = (a: number, b: number): string =>
  `${((100 * ratios.filter((r) => r >= a && r < b).length) / ratios.length).toFixed(1)}%`;
log(`    0.15-0.18 ${band(0.15, 0.18)} (just over the bar)   0.18-0.22 ${band(0.18, 0.22)}`
  + `   0.22-0.30 ${band(0.22, 0.30)} (crease-like)   >=0.30 ${band(0.30, 1e9)}`);
log('');
log('── context ──');
dist('kink big |D2r|', bigs, 1000, 'um');
dist('edge length', lens, 1000, 'um');
log(`  crossing edges by constraint-vertex incidence:  both ${clsBoth}`
  + ` (${((100 * clsBoth) / cross).toFixed(1)}%)   one ${clsOne} (${((100 * clsOne) / cross).toFixed(1)}%)`
  + `   neither ${clsNone} (${((100 * clsNone) / cross).toFixed(1)}%)`);
log('');
log('READ IT LIKE THIS:');
log('  dist p90 small (<~50 um) AND ratio clustered near 0.25  ⇒ R-REAL. The crossings are genuine and');
log('    ON the loci; the rate invariance is ARCHITECTURAL — no seed knob can remove them, because the');
log('    constraint polyline is a secant of a curved analytic locus. Stop sweeping seed parameters.');
log('  dist p50 LARGE (mm-scale) OR ratio piled just over 0.15  ⇒ R-FALSE, in that fraction. Part of the');
log('    published 9,363 is instrument, the real population is smaller, and the FIRST repair is the');
log('    detector threshold, not the seed. Re-price every claim that quotes 9,363 before acting on it.');
log('  "neither" large ⇒ the crossings are on BACKGROUND lattice edges away from the placed chains,');
log('    which points at loci the seed never constrained at all (the 94 excluded jump-class components).');
