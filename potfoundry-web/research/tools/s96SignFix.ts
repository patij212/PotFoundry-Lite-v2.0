// s96SignFix.ts — NON-VACUITY BAR FOR THE `orient:'outward'` SIGN FIX.
//
// The fix (orientRuler.ts, 2026-08-06) replaces the outward reference — it was the facet normal's XY
// components against the centroid's XY position, which VANISH on a near-horizontal facet — with the
// ANALYTIC surface normal, which is outward by construction and well defined everywhere.
//
// The ruler's own 11 fixtures pass BOTH before and after, because none of them exercises a
// near-horizontal facet in outward mode. *** A FIX THAT NO BAR CAN SEE IS INDISTINGUISHABLE FROM NO
// FIX. *** So this measures the population the defect lives in, on a real mesh, and states in advance
// what a working fix must and must not do:
//
//   ⚠ MY PRE-REGISTERED "INVARIANT" WAS WRONG AND THIS TOOL REFUTED IT ON ITS FIRST RUN. I predicted
//     over-bar COUNT and AREA identical between 'winding' and 'outward', reasoning that theta ->
//     180-theta cannot cross a sub-90-degree bar. IT CAN: a facet at 3 degrees maps to 177, which is
//     over a 5-degree bar. Measured 20,173 vs 20,157 of 40,000 — the two conventions differ on
//     exactly the inverted-winding population near the bar's complement. The prediction is retained
//     here, refuted, rather than quietly restated.
//   MUST (non-vacuity):
//     a non-trivial population must have signMargin BELOW the legacy XY test's effective resolution
//     — those are exactly the facets the old code decided by noise. If that population is empty on a
//     style with near-horizontal facets, the fix is inert and should be reverted as dead weight.
//
// Read-only over a finished STL.
//
// Usage:  bash research/tools/run-s96-signfix.sh [STEM]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STEM = process.env.PF_S96_STEM ?? 'voronoi_ring_D--';
const STYLE = process.env.PF_S96_STYLE ?? 'Voronoi';
const N = Math.round(envF('PF_S96_N', 40000));
const K = Math.round(envF('PF_S96_K', 8));
const INSET = envF('PF_S96_INSET', 0.02);
const BARDEG = envF('PF_S96_BARDEG', 5);

const snake = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function defs(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const o: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') o[snake(k)] = v.default;
  }
  return o;
}
const rAraw = buildRadiusFn(STYLE as StyleId, defs(STYLE), DIMS);
const rA = (th: number, z: number): number => rAraw(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const ns = fdNormals(rA, H);

log('===== S96 — NON-VACUITY BAR FOR THE outward-SIGN FIX =====');
const path = `research/exchange/_strataConformBisect/${STEM}.stl`;
const { xyz, nTri } = readMeshFloat64(path, false);
log(`${path}   ${nTri} triangles   sampling ${N}   k=${K} inset=${INSET} bar=${BARDEG} deg`);

const scratch = new Float64Array(12);
const bar = (BARDEG * Math.PI) / 180;
interface Acc { over: number; overArea: number; max: number; area: number }
const mk = (): Acc => ({ over: 0, overArea: 0, max: 0, area: 0 });
const W = mk(); const O = mk();
const margins: number[] = [];
let scored = 0;
for (let s = 0; s < N; s += 1) {
  const t = Math.floor(((s + 0.5) / N) * nTri); const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) continue;
  const t0 = canonTheta(Math.atan2(ay, ax)); const t1 = canonTheta(Math.atan2(by, bx)); const t2 = canonTheta(Math.atan2(cy, cx));
  const rw = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, t0, t1, t2, { k: K, inset: INSET, scratch });
  const ro = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, t0, t1, t2, { k: K, inset: INSET, orient: 'outward', scratch });
  if (!Number.isFinite(rw.normRad) || !Number.isFinite(ro.normRad)) continue;
  scored += 1;
  margins.push(ro.signMargin);
  for (const [acc, r] of [[W, rw], [O, ro]] as Array<[Acc, typeof rw]>) {
    acc.area += area;
    if (r.normRad > acc.max) acc.max = r.normRad;
    if (r.normRad > bar) { acc.over += 1; acc.overArea += area; }
  }
}
const deg = (x: number): string => ((x * 180) / Math.PI).toFixed(3);
const q = (v: number[], p: number): number => { const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
log('');
log(`scored ${scored} facets`);
log(`${'mode'.padEnd(10)} ${'over-bar'.padStart(9)} ${'over AREA %'.padStart(12)} ${'MAX deg'.padStart(10)}`);
log(`${'winding'.padEnd(10)} ${String(W.over).padStart(9)} ${((100 * W.overArea) / W.area).toFixed(4).padStart(12)} ${deg(W.max).padStart(10)}`);
log(`${'outward'.padEnd(10)} ${String(O.over).padStart(9)} ${((100 * O.overArea) / O.area).toFixed(4).padStart(12)} ${deg(O.max).padStart(10)}`);
log('');
// NOT an invariant — see the header. Reported as a MAGNITUDE so the size of the convention's effect
// on shares is visible next to its (much larger) effect on maxima.
log(`convention effect on the SHARE : ${W.over} -> ${O.over} facets (${(100 * Math.abs(W.over - O.over) / Math.max(1, W.over)).toFixed(3)}%), area ${((100 * Math.abs(W.overArea - O.overArea)) / Math.max(1e-30, W.overArea)).toFixed(4)}%`);
log('  (the inverted-winding population near the complement of the bar — small, real, and NOT zero)');
log('');
log('signMargin |f . n_S(centroid)| in outward mode — how decisive the sign flip was:');
log(`   p01 ${q(margins, 0.01).toFixed(4)}   p10 ${q(margins, 0.10).toFixed(4)}   p50 ${q(margins, 0.50).toFixed(4)}   p90 ${q(margins, 0.90).toFixed(4)}`);
for (const b of [0.01, 0.05, 0.1, 0.2]) {
  const n = margins.filter((m) => m < b).length;
  log(`   margin < ${b.toFixed(2)} : ${n} facets (${((100 * n) / margins.length).toFixed(3)}%)`);
}
log('');
log('NON-VACUITY: the facets with a SMALL margin are the ones the legacy XY test decided by noise —');
log('it read those signs off a quantity that vanishes for exactly that population. A non-empty tail');
log('here is what makes the fix live; an empty one would mean it is dead weight and should be reverted.');
