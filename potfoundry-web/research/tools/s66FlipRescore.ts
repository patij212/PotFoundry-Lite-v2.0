// s66FlipRescore.ts — RE-SCORE EVERY S60 ARM AFTER TWO REDIRECTS. Cheap, decisive, no arm re-run.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY, AND WHAT IS BEING FALSIFIED — MY OWN HEADLINE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// GUARD found that `tangExc = sin(acos(dot)) * diam` is NON-MONOTONE: sin peaks at 90 deg and returns to
// ZERO at 180, so a fully INVERTED facet scores ~0. My s60/s61/s63/s64/s65 all carry that same expression
// (transcribed from S56/S58 on purpose, so the numbers would be comparable). If my flip pass drove facets
// PAST 90 deg, it would have scored them as improved while making them worse, and my headline
// "Gothic 129,757 -> 37,157" would be partly manufactured.
//
// I am not going to re-run six arms to find out; the question is answerable in seconds from the STLs that
// already exist. This probe recomputes, for every mesh, on the SAME facets:
//
//   tangSin  = sin(theta) * diam            the OLD (broken) key -- reproduced so the A/B is exact
//   tangChd  = 2*sin(theta/2) * diam        GUARD's monotone chord-between-unit-normals key
//   nOver90  = facets with theta > 90 deg   the population where the two disagree AT ALL
//   nOver90_new                             on the AFTER mesh -- IF the flip manufactured inversions,
//                                           this is where they are, and it must be ~0 for my claim to hold
//
// plus the two things the second redirect asked for:
//   * AREA-WEIGHTED over-bar fraction, because facet COUNT overstates mis-oriented SURFACE 13-184x;
//   * the split by aspect3 = diam / minAlt (my explicit definition, named so it is not confused with
//     GUARD's): MIS-ORIENTED (aspect3 high) vs TURNING (aspect3 low) are different mechanisms and a flip
//     that helps one may harm the other.
//
// KILL-CRITERION (pre-registered here, before running): if `nOver90` is non-zero on any AFTER mesh and
// larger than on its BEFORE mesh, the flip manufactured inversions and the affected arm's orientation
// claim is WITHDRAWN. If `nOver90 == 0` everywhere, the two keys are ORDER-IDENTICAL on this population
// (sin is monotone on [0,90]) and the bug, while real, was INERT for these arms -- which must be shown,
// not assumed.
//
// READ-ONLY. Usage: bash research/tools/run-s66-rescore.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const BAR = envF('PF_S66_BAR_UM', 10);
const AR_SPLIT = envF('PF_S66_AR', 50);
const JOBS: Array<[string, string, string]> = (process.env.PF_S66_JOBS
  ?? 'GothicArches=gothicarches_ring_DS-HT_S39CTL=G-before,'
   + 'GothicArches=s60flip/gothicarches_ring_DS-HT_S39CTL_G2CON=G-after-CONSTRAINED,'
   + 'GothicArches=s56flip/S39CTL_flipped_tangexc=G-after-S56-UNCONSTRAINED,'
   + 'Voronoi=voronoi_ring_D--=V-before,'
   + 'Voronoi=s60flip/voronoi_ring_D--_A2CON=V-after-CONSTRAINED,'
   + 'Voronoi=s60flip/voronoi_ring_D--_A1TANG=V-after-UNCONSTRAINED,'
   + 'LowPolyFacet=lowpolyfacet_ring_D--=L-before,'
   + 'LowPolyFacet=s60flip/lowpolyfacet_ring_D--_L2CON=L-after-CONSTRAINED')
  .split(',').map((s) => { const p = s.split('='); return [p[0], p[1], p[2]] as [string, string, string]; });

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);

log('===== S66 — RE-SCORE THE S60 ARMS ON THE MONOTONE KEY, AREA-WEIGHTED, SPLIT BY ASPECT =====');
log(`bar ${BAR} um   aspect3 split at ${AR_SPLIT} (aspect3 := diam / minAlt)`);
log('');

for (const [style, stem, label] of JOBS) {
  const path = `research/exchange/_strataConformBisect/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`${label}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  const DIMS: StyleDims = { H: envF('PF_S66_H', 120), Rb: envF('PF_S66_RB', 40), Rt: envF('PF_S66_RT', 50), expn: 1 };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

  const sinArr: number[] = []; const chdArr: number[] = [];
  let nOver90 = 0; let nOver120 = 0; let overSin = 0; let overChd = 0;
  let areaTot = 0; let areaOverChd = 0; let areaOverSin = 0;
  let hiN = 0; let hiOver = 0; let loN = 0; let loOver = 0;
  let maxDeg = 0;
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) continue;
    const area = fl / 2; areaTot += area;
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thA = Math.atan2(ay, ax);
    const thc = thA + (dThRaw(thA, Math.atan2(by, bx)) + dThRaw(thA, Math.atan2(cy, cx))) / 3;
    const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
    const r = rA(thc, zc);
    const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const ang = Math.acos(dot);
    const deg = ang * (180 / Math.PI); if (deg > maxDeg) maxDeg = deg;
    if (deg > 90) nOver90 += 1;
    if (deg > 120) nOver120 += 1;
    const diam = Math.max(
      Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
    const tSin = Math.sin(ang) * diam * 1000;
    const tChd = 2 * Math.sin(ang / 2) * diam * 1000;
    sinArr.push(tSin); chdArr.push(tChd);
    if (tSin > BAR) { overSin += 1; areaOverSin += area; }
    if (tChd > BAR) { overChd += 1; areaOverChd += area; }
    const minAlt = fl / Math.max(1e-300, diam);
    const aspect3 = diam / Math.max(1e-300, minAlt);
    if (aspect3 >= AR_SPLIT) { hiN += 1; if (tChd > BAR) hiOver += 1; } else { loN += 1; if (tChd > BAR) loOver += 1; }
  }
  const sS = sinArr.slice().sort((a, b) => a - b); const sC = chdArr.slice().sort((a, b) => a - b);
  log(`── ${label}  (${stem}, ${nTri} facets) ──`);
  log(`   OLD sin key : p99 ${pq(sS, 0.99).toFixed(2)}  max ${sS[sS.length - 1].toFixed(1)} um   over-${BAR}um ${overSin} (${((100 * overSin) / nTri).toFixed(3)}%)`);
  log(`   MONOTONE chd: p99 ${pq(sC, 0.99).toFixed(2)}  max ${sC[sC.length - 1].toFixed(1)} um   over-${BAR}um ${overChd} (${((100 * overChd) / nTri).toFixed(3)}%)   [chd/sin over-bar ratio ${(overChd / Math.max(1, overSin)).toFixed(4)}]`);
  log(`   *** theta > 90 deg (where the two keys disagree at all): ${nOver90}   > 120 deg: ${nOver120}   max theta ${maxDeg.toFixed(2)} deg ***`);
  log(`   AREA-WEIGHTED over-bar (monotone key): ${((100 * areaOverChd) / Math.max(1e-30, areaTot)).toFixed(3)}% of surface   vs COUNT ${((100 * overChd) / nTri).toFixed(3)}%   -> count overstates area ${(((overChd / nTri)) / Math.max(1e-12, areaOverChd / areaTot)).toFixed(2)}x`);
  log(`   BY MECHANISM (aspect3 = diam/minAlt):  MIS-ORIENTED aspect3>=${AR_SPLIT}: ${hiN} facets, ${hiOver} over-bar (${((100 * hiOver) / Math.max(1, hiN)).toFixed(2)}%)   TURNING aspect3<${AR_SPLIT}: ${loN} facets, ${loOver} over-bar (${((100 * loOver) / Math.max(1, loN)).toFixed(2)}%)`);
  log('');
}
log('done');
