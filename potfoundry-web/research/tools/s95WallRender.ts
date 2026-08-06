// s95WallRender.ts — THE FINDING IN ONE IMAGE: the SAME Voronoi surface, meshed two ways.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE PICTURE HAS TO SHOW, WITHOUT NUMBERS. S95-WALL measured that the "near-vertical wall"
// class is not a class: binned on WALL ANGLE, Voronoi folds 112x more than Gothic at the SAME angle;
// binned on SHAPE it collapses to 0.30x; and the SAME style on the SAME rA with the mesher's aspect
// gate ON folds 28.7x less and then closes the 10 um chord bar at 9.22x with 0.00% uncleared instead
// of 221.95x with 15.57% uncleared.
//
// So the two panels are the SAME SURFACE and the colour is the MECHANISM, per facet:
//     t = max over the facet's 3 edges of  phi_apex = 2*|dApex| / h_min
// where dApex is the APEX-ward in-plane part of the displacement the mesher's own radial lift
// (`r = rA(theta_m, z_m)`) applies to the edge midpoint, and h_min = 2*Area/diam. phi_apex >= 1 is a
// near-necessary condition for a child to INVERT (measured recall 0.9994 / 1.0000), so RED = "one
// bisection here can fold a child". Green at 0, red at phi_apex = 1.
//
//   LEFT  — voronoi_ring_D--.stl        (SHAPE-off, 806,765 tris)   the artefact every campaign
//                                        result was measured on
//   RIGHT — voronoi_ring_D--H_S94CTL    (SHAPE-on,  492,068 tris)   same style, same rA, same params
//
// Colours are per-FACET (written to all three corners) so nothing smooths across a facet boundary,
// and the mesh is rendered as STL soup (an index per corner) — no welding, flat shading, per the
// research/render README ("flat shading is mandatory for sharp relief").
//
// Usage: bash research/tools/run-s95-wall-render.sh
//   env: PF_S95R_MAXTRI(1200000)  PF_S95R_H/RB/RT
// ══════════════════════════════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { dumpRenderBins } from '../bridge/labkit';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const MAXTRI = Math.round(envF('PF_S95R_MAXTRI', 1200000));
const DIMS: StyleDims = { H: envF('PF_S95R_H', 120), Rb: envF('PF_S95R_RB', 40), Rt: envF('PF_S95R_RT', 50), expn: 1 };
const H = DIMS.H;
const OUT = 'research/exchange/_strataConformBisect/s95/render';
mkdirSync(OUT, { recursive: true });

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
const rAbase = buildRadiusFn('Voronoi' as StyleId, { ...registryDefaults('Voronoi') }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const HARC = 2e-4; const HZ = 2e-4;

/** green -> yellow -> red on t in [0,1] — the lab heatmap ramp. */
function ramp(t: number, o: Float32Array, i: number): void {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  let r: number; let g: number; let b: number;
  if (u < 0.5) { const s = u * 2; r = 33 + (250 - 33) * s; g = 158 + (209 - 158) * s; b = 59 + (26 - 59) * s; } else { const s = (u - 0.5) * 2; r = 250 + (219 - 250) * s; g = 209 + (33 - 209) * s; b = 26 + (33 - 26) * s; }
  o[i] = r / 255; o[i + 1] = g / 255; o[i + 2] = b / 255;
}

const PANELS = [
  { name: 's95_vor_SHAPEoff', stl: 'research/exchange/_strataConformBisect/voronoi_ring_D--.stl', label: 'SHAPE-off 806,765 tris — LEPP 221.95x, 15.57% uncleared' },
  { name: 's95_vor_SHAPEon', stl: 'research/exchange/_strataConformBisect/voronoi_ring_D--H_S94CTL.stl', label: 'SHAPE-on 492,068 tris — LEPP 9.22x, 0.00% uncleared' },
];

for (const P of PANELS) {
  const T0 = Date.now();
  const M = readMeshFloat64(P.stl, false);
  const nTri = Math.min(M.nTri, MAXTRI);
  const xyz = M.xyz;
  const pos = new Float32Array(nTri * 9);
  const idx = new Uint32Array(nTri * 3);
  const col = new Float32Array(nTri * 9);
  let foldArea = 0; let areaTot = 0; let foldCnt = 0;
  const SCAT_N = Math.round(envF('PF_S95R_SCATN', 400000));
  const scatStride = Math.max(1, Math.round(nTri / SCAT_N));
  const scat: string[] = [];

  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    for (let k = 0; k < 9; k += 1) pos[o + k] = xyz[o + k];
    idx[3 * t] = 3 * t; idx[3 * t + 1] = 3 * t + 1; idx[3 * t + 2] = 3 * t + 2;
    const V = [xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8]];
    // (B-A) x (C-A) — see s95WallCensus: the fx component was wrong on its first run and produced an
    // impossible fold rate. Kept spelled out here for the same reason.
    let fx = (V[4] - V[1]) * (V[8] - V[2]) - (V[5] - V[2]) * (V[7] - V[1]);
    let fy = (V[5] - V[2]) * (V[6] - V[0]) - (V[3] - V[0]) * (V[8] - V[2]);
    let fz = (V[3] - V[0]) * (V[7] - V[1]) - (V[4] - V[1]) * (V[6] - V[0]);
    const fl = Math.hypot(fx, fy, fz);
    if (!(fl > 0)) { for (let v = 0; v < 3; v += 1) ramp(0, col, o + 3 * v); continue; }
    const area = 0.5 * fl; areaTot += area;
    fx /= fl; fy /= fl; fz /= fl;
    const eA = Math.hypot(V[3] - V[6], V[4] - V[7], V[5] - V[8]);
    const eB = Math.hypot(V[0] - V[6], V[1] - V[7], V[2] - V[8]);
    const eC = Math.hypot(V[0] - V[3], V[1] - V[4], V[2] - V[5]);
    const hmin = (2 * area) / Math.max(1e-30, Math.max(eA, eB, eC));
    const th0 = Math.atan2(V[1], V[0]);
    const TH = [th0, th0 + dThRaw(th0, Math.atan2(V[4], V[3])), th0 + dThRaw(th0, Math.atan2(V[7], V[6]))];
    let worst = 0;
    for (const [i, j, k] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]] as const) {
      const Ax = V[3 * i]; const Ay = V[3 * i + 1]; const Az = V[3 * i + 2];
      const Bx = V[3 * j]; const By = V[3 * j + 1]; const Bz = V[3 * j + 2];
      const Cx = V[3 * k]; const Cy = V[3 * k + 1]; const Cz = V[3 * k + 2];
      const mx = 0.5 * (Ax + Bx); const my = 0.5 * (Ay + By); const mz = 0.5 * (Az + Bz);
      const thM = 0.5 * (TH[i] + TH[j]); const zM = mz;
      const r0 = rA(thM, zM);
      const Rx = r0 * Math.cos(thM); const Ry = r0 * Math.sin(thM); const Rz = zM;
      const ex = Bx - Ax; const ey = By - Ay; const ez = Bz - Az;
      const eL = Math.hypot(ex, ey, ez) || 1;
      const ehx = ex / eL; const ehy = ey / eL; const ehz = ez / eL;
      const acx = Cx - Ax; const acy = Cy - Ay; const acz = Cz - Az;
      const acd = acx * ehx + acy * ehy + acz * ehz;
      let mhx = acx - acd * ehx; let mhy = acy - acd * ehy; let mhz = acz - acd * ehz;
      const mL = Math.hypot(mhx, mhy, mhz) || 1; mhx /= mL; mhy /= mL; mhz /= mL;
      const dApex = (Rx - mx) * mhx + (Ry - my) * mhy + (Rz - mz) * mhz;
      const phiApex = (2 * Math.abs(dApex)) / Math.max(1e-30, hmin);
      if (phiApex > worst) worst = phiApex;
    }
    if (worst >= 1) {
      foldArea += area; foldCnt += 1;
      // *** THE 3-D RENDER CANNOT SHOW THIS CLASS AND SAYING SO IS THE POINT: the fold facets are
      // SLIVERS, so they hold 18.1% of the COUNT and 1.47% of the AREA — sub-pixel in a surface
      // render, which coloured the whole wall green on the first attempt. A parameter-domain SCATTER
      // is the honest instrument for a population that has count but no area. Sampled to a FIXED
      // budget (SCAT_N facets, golden stride) on BOTH meshes so the point densities are comparable. ***
      if (t % scatStride === 0) {
        const gx = (V[0] + V[3] + V[6]) / 3; const gy = (V[1] + V[4] + V[7]) / 3;
        const gz = (V[2] + V[5] + V[8]) / 3;
        let u = Math.atan2(gy, gx) / (2 * Math.PI); if (u < 0) u += 1;
        scat.push(`{"uc":${u.toFixed(6)},"tc":${(gz / H).toFixed(6)},"dev":${Math.min(4, worst).toFixed(4)}}`);
      }
    }
    for (let v = 0; v < 3; v += 1) ramp(worst, col, o + 3 * v);
  }
  const pctA = (100 * foldArea) / Math.max(1e-30, areaTot);
  const pctC = (100 * foldCnt) / Math.max(1, nTri);
  writeFileSync(`${OUT}/${P.name}.scatter.ndjson`, `${scat.join('\n')}\n`);
  log(`${P.name}: ${nTri} tris   phi_apex>=1 (a bisection here CAN fold a child): ${foldCnt} = ${pctC.toFixed(3)}% of count, ${pctA.toFixed(4)}% of AREA   scatter ${scat.length} pts of ${Math.round(nTri / scatStride)} sampled (stride ${scatStride})   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
  dumpRenderBins(OUT, P.name, pos, idx, {
    colors: col,
    meta: {
      ruler: 'phi_apex = 2|dApex|/h_min  (>=1 => the mesher lift CAN invert a child; green 0 -> red 1)',
      cls: P.label,
      worstMm: pctA / 100,
      p99Mm: pctC / 100,
      pctOver0_03: pctA,
      nonMan: 0,
    },
  });
}
log(`bins in ${OUT}`);
