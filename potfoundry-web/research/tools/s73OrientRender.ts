// s73OrientRender.ts — THE VISUAL: one mesh, three panels, one question each.
//
// The lab rule is that a fidelity verdict needs a render and that if the render disagrees with the metric
// the render wins. S61 makes two claims that are only believable if they can be SEEN:
//
//   A  POSITION (the driver's own `sagAdaptiveRaw`, ramp 0..10 um) — the mesh the pipeline calls clean.
//   B  ORIENTATION SUP (normDeg, ramp 0..30 deg) — the class no ruler in this repo scored. If S61 is
//      right this lights up the cell walls and leaves the cell interiors dark.
//   C  ORIENTATION AREA (`overFrac` at the 5 deg bar, ramp 0..1) — how much OF EACH FACET the sup in B
//      speaks for. S61 measures the facet count over-stating the mis-oriented AREA by 12.96x on Voronoi
//      and 183.76x on LowPolyFacet; B and C side by side are that number as a picture. If B is lit and C
//      is dark the sup is riding on hairs; if B and C agree the defect is real over area.
//
// Usage:  bash research/tools/run-s73-orient-render.sh [STEM] [STYLE]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { vertErrColors, dumpRenderBins } from '../bridge/labkit';
import { mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S73_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S73_STEM ?? 'voronoi_ring_D--';
const OUT = process.env.PF_S73_OUT ?? 'research/exchange/_strataConformBisect/s73render';
const MAXF = Math.round(envF('PF_S73_MAXF', 1200000));
const K = Math.round(envF('PF_S73_K', 4));
const INSET = envF('PF_S73_INSET', 0.01);
const DEGSCALE = envF('PF_S73_DEGSCALE', 30);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

const DIMS: StyleDims = { H: envF('PF_S73_H', 120), Rb: envF('PF_S73_RB', 40), Rt: envF('PF_S73_RT', 50), expn: 1 };
const H = DIMS.H;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log(`===== S73 — ORIENTATION RENDER: ${STYLE} / ${STEM} =====`);
mkdirSync(OUT, { recursive: true });
const path = `research/exchange/_strataConformBisect/${STEM}.stl`;
const { xyz, nTri } = readMeshFloat64(path, false);
const step = Math.max(1, Math.ceil(nTri / MAXF));
const n = Math.floor(nTri / step);
log(`${nTri} tri -> rendering ${n} (stride ${step})`);

const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
const P = new Float32Array(9 * n); const IDX = new Uint32Array(3 * n);
for (let k = 0; k < n; k += 1) {
  const o = (k * step) * 9;
  for (let v = 0; v < 3; v += 1) {
    vx[3 * k + v] = xyz[o + 3 * v]; vy[3 * k + v] = xyz[o + 3 * v + 1]; vz[3 * k + v] = xyz[o + 3 * v + 2];
    P[9 * k + 3 * v] = xyz[o + 3 * v]; P[9 * k + 3 * v + 1] = xyz[o + 3 * v + 1]; P[9 * k + 3 * v + 2] = xyz[o + 3 * v + 2];
  }
  const thA = Math.atan2(vy[3 * k], vx[3 * k]);
  vth[3 * k] = thA;
  vth[3 * k + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 1], vx[3 * k + 1]));
  vth[3 * k + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 2], vx[3 * k + 2]));
  ta[k] = 3 * k; tb[k] = 3 * k + 1; tc[k] = 3 * k + 2;
  IDX[3 * k] = 3 * k; IDX[3 * k + 1] = 3 * k + 1; IDX[3 * k + 2] = 3 * k + 2;
}
const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy }; const ARG = makeSagArgmax();
const ns = fdNormals(rA, H); const scratch = new Float64Array(12);
const ePos = new Float64Array(3 * n); const eSup = new Float64Array(3 * n); const eArea = new Float64Array(3 * n);
let posMax = 0; let supMax = 0; let posOver = 0; let supOver = 0; let totA = 0; let badA = 0;
for (let k = 0; k < n; k += 1) {
  const i0 = 3 * k;
  const o = orientOfFacet(ns, vx[i0], vy[i0], vz[i0], vx[i0 + 1], vy[i0 + 1], vz[i0 + 1], vx[i0 + 2], vy[i0 + 2], vz[i0 + 2],
    vth[i0], vth[i0 + 1], vth[i0 + 2], { k: K, inset: INSET, orient: 'outward', scratch, barRad: (5 * Math.PI) / 180 });
  const pos = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000;
  const nd = Number.isFinite(o.normDeg) ? o.normDeg : 0;
  const of = Number.isFinite(o.overFrac) ? o.overFrac : 0;
  const ux = vx[i0 + 1] - vx[i0]; const uy = vy[i0 + 1] - vy[i0]; const uz = vz[i0 + 1] - vz[i0];
  const wx = vx[i0 + 2] - vx[i0]; const wy = vy[i0 + 2] - vy[i0]; const wz = vz[i0 + 2] - vz[i0];
  const ar = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  totA += ar; badA += ar * of;
  if (pos > posMax) posMax = pos;
  if (nd > supMax) supMax = nd;
  if (pos > 10) posOver += 1;
  if (nd > 5) supOver += 1;
  for (let v = 0; v < 3; v += 1) { ePos[3 * k + v] = pos / 1000; eSup[3 * k + v] = nd; eArea[3 * k + v] = of; }
}
log(`  A POSITION       max ${posMax.toFixed(2)} um   over-10um ${posOver} (${((100 * posOver) / n).toFixed(3)}%)`);
log(`  B ORIENT SUP     max ${supMax.toFixed(2)} deg  over-5deg ${supOver} (${((100 * supOver) / n).toFixed(3)}%)`);
log(`  C ORIENT AREA    mis-oriented surface fraction over 5 deg ${((100 * badA) / totA).toFixed(4)}%   (${(supOver / n / Math.max(1e-12, badA / totA)).toFixed(2)}x over-statement by count)`);

dumpRenderBins(OUT, `${STEM}_A_position`, P, IDX, {
  colors: vertErrColors(ePos, 0.01),
  meta: { ruler: 'true3d', worstMm: posMax / 1000, p99Mm: 0, pctOver0_03: (100 * posOver) / n, nonMan: 0,
    cls: `A POSITION sagAdaptive  ramp 0-10um  max ${posMax.toFixed(1)}um  over10um ${((100 * posOver) / n).toFixed(3)}%` },
});
dumpRenderBins(OUT, `${STEM}_B_orient_sup`, P, IDX, {
  colors: vertErrColors(eSup, DEGSCALE),
  meta: { ruler: 'true3d', worstMm: supMax, p99Mm: 0, pctOver0_03: (100 * supOver) / n, nonMan: 0,
    cls: `B ORIENTATION SUP deg  ramp 0-${DEGSCALE}deg  max ${supMax.toFixed(1)}deg  over5deg ${((100 * supOver) / n).toFixed(2)}%` },
});
dumpRenderBins(OUT, `${STEM}_C_orient_area`, P, IDX, {
  colors: vertErrColors(eArea, 1),
  meta: { ruler: 'true3d', worstMm: 1, p99Mm: 0, pctOver0_03: (100 * badA) / totA, nonMan: 0,
    cls: `C ORIENTATION AREA overFrac@5deg  ramp 0-1  mis-oriented SURFACE ${((100 * badA) / totA).toFixed(3)}%` },
});
log(`bins -> ${OUT}`);
log('done');
