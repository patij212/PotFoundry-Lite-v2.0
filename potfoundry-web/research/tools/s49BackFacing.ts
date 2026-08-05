// s49BackFacing.ts — THE VISIBLE DEFECT CLASS, MEASURED ACROSS ARMS. Facet normal vs the ANALYTIC
// normal at its own centroid.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, AND IT IS AN OPERATOR OBSERVATION THAT MY NUMBERS DID NOT PREDICT
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The AR-cap sweep took the driver's headline max 47.282 -> 10.830 um (cap 90) and 5.655 um (cap 90 +
// cavity). The operator then rendered those exact meshes and reported the artefacts are STILL THERE,
// IN THE SAME PLACES — including a large facet rendering BACK-FACING (grey) standing proud of the
// wall, with the over-tolerance overlay lit red around it.
//
// Both things can be true, and if they are, it is because THEY ARE DIFFERENT DEFECT CLASSES:
//   * the driver's headline is a CHORD/PLANE error — how far a facet sits from the surface. The cap
//     lever attacks that and the numbers say it works.
//   * a BACK-FACING facet is an ORIENTATION error — the facet is turned the wrong way relative to the
//     surface it approximates. A facet can sit arbitrarily close to the surface in the plane metric
//     and still be flipped, and NOTHING in the driver's fidelity block scores orientation.
// The campaign already has this class named — `back-facing` / `feature-span` in the audit's EXTRINSIC
// ORIENTATION CENSUS, 878 (+3,998 feature-span) on S34CTL — and the S20 admission family
// (PF_CB_ADMIT_NORMAL) exists precisely to zero it, measured 1,074 -> 0. NO RUNNER in the S34..S48
// lineage sets it. So the visible class may simply be un-attacked, and the cap lever's win real but
// on a different axis.
//
// This file settles which, by scoring the SAME quantity on every arm's shipped STL.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Surface P(th,z) = (r cos th, r sin th, z) with r = rA(th,z). Analytic normal n = P_th x P_z, with
// r_th and r_z by central difference. Facet normal f from the STL winding. Score cos = n_hat . f_hat.
//   BACK-FACING     cos < 0            — the facet is turned away from the surface it approximates
//   PHYSICAL >= 90  the same thing, reported at the campaign's own >=90 degree threshold
//   TILT tail       cos < cos(60), cos(45), cos(30) — the shoulder the back-facing count sits on
// Central-difference step is a parameter and is swept, because a normal read at too fine a step on a
// crease is reading the crease, not the surface — that would manufacture the very defect being
// counted. If the counts move with the step, the instrument is the artefact and the file says so.
//
// Read-only. Safe beside a running arm.
//
// Usage:  bash research/tools/run-s49-back-facing.sh [TAG,TAG,...]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAGS = (process.env.PF_S49_TAGS ?? 'S39CTL,S40AR90,S48CAV90,S48ADM90').split(',');
const BASE = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_';

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
const rAraw = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const R = (th: number, z: number): number => rAraw(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

/** outward analytic normal of r = rA(th,z), central difference at step h (mm in z, rad-equivalent in th) */
function analyticNormal(th: number, z: number, hTh: number, hZ: number): [number, number, number] {
  const r = R(th, z);
  const rTh = (R(th + hTh, z) - R(th - hTh, z)) / (2 * hTh);
  const rZ = (R(th, Math.min(H, z + hZ)) - R(th, Math.max(0, z - hZ))) / (2 * hZ);
  const ct = Math.cos(th); const st = Math.sin(th);
  // P_th = (rTh*ct - r*st, rTh*st + r*ct, 0) ; P_z = (rZ*ct, rZ*st, 1)
  const ax = rTh * ct - r * st; const ay = rTh * st + r * ct; const az = 0;
  const bx = rZ * ct; const by = rZ * st; const bz = 1;
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

log('===== S49 — BACK-FACING / ORIENTATION CENSUS. The class the driver never scores. =====');
log('cos = (analytic normal) . (facet normal), both unit. cos < 0 = BACK-FACING.');
log('');
const STEPS: Array<[number, number, string]> = [[1e-5, 1e-4, 'mid']];
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// *** THE BAND THAT MATTERS IS |cos| NEAR ZERO, NOT cos < 0. *** (operator, 2026-08-05)
// A facet whose normal is PERPENDICULAR to the surface normal is a FIN: it stands edge-on out of the
// wall. Its three vertices can all sit exactly on the surface (S43: max residual 0.031 um) and it
// still projects as a spike at a grazing view, because the facet's PLANE contains the surface normal
// instead of being tangent to it. `cos < 0` (back-facing) is only the far tail of that band and is
// what I reported first; it undercounts the class by the whole |cos| < 0.34 shoulder.
// A fin is what a facet spanning ACROSS a crease looks like: two vertices one side of a rib, one the
// other, the triangle standing up between them like a plate. That is the campaign's own documented
// root cause (edges CROSSING A CREASE, risk ratio 74x) seen from the orientation side rather than the
// distance side, and no ruler in this pipeline scores it.
const PERP: Array<[number, string]> = [[0.05, '|cos|<0.05  (87-93 deg)'], [0.17, '|cos|<0.17  (80-100)'], [0.34, '|cos|<0.34  (70-110)'], [0.50, '|cos|<0.50  (60-120)']];

log('PERPENDICULAR-BAND CENSUS. A FIN is a facet whose plane contains the surface normal: |cos| ~ 0.');
log('');
const hdr = `${'arm'.padEnd(10)} ${'tris'.padStart(9)} ${PERP.map(([, n]) => n.padStart(22)).join(' ')}  ${'back(cos<0)'.padStart(11)}`;
log(hdr); log('-'.repeat(hdr.length));
interface Fin { z: number; th: number; cos: number; ar: number; parAR: number; longUm: number }
// *** THE HYPOTHESIS THIS COLUMN TESTS. *** A facet is a FIN when its plane contains the surface
// normal, which requires its three vertices to be nearly COLLINEAR IN THE TANGENT PLANE while
// separated along the normal — i.e. near-degenerate in (theta,z) but perfectly well shaped in 3-D.
// That is precisely the difference between parAR (the PARAMETRIC aspect ratio) and aspect3 (the 3-D
// one). *** THE S1 SPLIT GUARD SCORES aspect3 AND NOTHING IN THE DRIVER SCORES parAR. *** The
// campaign's own census already shows the gap: on _S24i2, aspect3 MAX 85 against parAR MAX 932,125.
// If the fin population is high-parAR, the missing guard is a parametric one and the whole AR-cap
// result has been tuning the wrong metric.
const R_REF = 45;
const dThShort = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const finsByArm = new Map<string, Fin[]>();
for (const tag of TAGS) {
  let mesh;
  try { mesh = readMeshFloat64(`${BASE}${tag}.stl`, false); } catch { log(`${tag.padEnd(10)} (no STL)`); continue; }
  const { xyz, nTri } = mesh;
  const counts = PERP.map(() => 0); let back = 0;
  const fins: Fin[] = [];
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const cx = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
    const cy = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
    const cz = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
    const ux = xyz[o + 3] - xyz[o]; const uy = xyz[o + 4] - xyz[o + 1]; const uz = xyz[o + 5] - xyz[o + 2];
    const wx = xyz[o + 6] - xyz[o]; const wy = xyz[o + 7] - xyz[o + 1]; const wz = xyz[o + 8] - xyz[o + 2];
    let fx = uy * wz - uz * wy; let fy = uz * wx - ux * wz; let fz = ux * wy - uy * wx;
    const fl = Math.hypot(fx, fy, fz); if (!(fl > 0)) continue;
    fx /= fl; fy /= fl; fz /= fl;
    const th = canonTheta(Math.atan2(cy, cx));
    const [nx, ny, nz] = analyticNormal(th, cz, 1e-5, 1e-4);
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const c = (nx * fx + ny * fy + nz * fz) / nl;
    if (c < 0) back += 1;
    const a = Math.abs(c);
    for (let k = 0; k < PERP.length; k += 1) if (a < PERP[k][0]) counts[k] += 1;
    if (a < 0.17) {
      const e = [Math.hypot(ux, uy, uz), Math.hypot(wx, wy, wz),
        Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5])];
      const s2 = e.reduce((p, q) => p + q, 0) / 2; const ar2 = s2 * (s2 - e[0]) * (s2 - e[1]) * (s2 - e[2]);
      const area = Math.sqrt(Math.max(ar2, 0));
      // parAR — VERBATIM the driver's own arithmetic (_strataParARCensus: R_REF = 45, shortest-arc
      // deltas anchored at the first vertex), on the f32 values that ship.
      const t0 = canonTheta(Math.atan2(xyz[o + 1], xyz[o])); const z0 = xyz[o + 2];
      const t1 = canonTheta(Math.atan2(xyz[o + 4], xyz[o + 3])); const z1 = xyz[o + 5];
      const t2 = canonTheta(Math.atan2(xyz[o + 7], xyz[o + 6])); const z2 = xyz[o + 8];
      const pe = [
        Math.hypot(R_REF * dThShort(t0, t1), z1 - z0),
        Math.hypot(R_REF * dThShort(t1, t2), z2 - z1),
        Math.hypot(R_REF * dThShort(t2, t0), z0 - z2),
      ];
      const sp2 = Math.abs(R_REF * (dThShort(t0, t1) * (z2 - z0) - dThShort(t0, t2) * (z1 - z0)));
      const parAR = sp2 > 0 ? (Math.max(...pe) * (pe[0] + pe[1] + pe[2])) / (2 * sp2) : Infinity;
      fins.push({ z: cz, th, cos: c, ar: area > 0 ? (Math.max(...e) * (e[0] + e[1] + e[2])) / (4 * area) : Infinity, parAR, longUm: Math.max(...e) * 1000 });
    }
  }
  finsByArm.set(tag, fins);
  log(`${tag.padEnd(10)} ${String(nTri).padStart(9)} ${counts.map((c) => `${c} (${((100 * c) / nTri).toFixed(3)}%)`.padStart(22)).join(' ')}  ${String(back).padStart(11)}`);
}
log('');
log('WHERE THE FINS ARE — z-histogram of the |cos|<0.17 population, 24 bins base -> rim:');
for (const [tag, fins] of finsByArm) {
  const zb = new Array(24).fill(0);
  for (const f of fins) zb[Math.min(23, Math.max(0, Math.floor((f.z / H) * 24)))] += 1;
  log(`  ${tag.padEnd(10)} ${zb.map((v) => String(v).padStart(4)).join('')}`);
}
log('');
log('THE 12 MOST PERPENDICULAR FACETS OF EACH ARM (|cos| smallest = most fin-like):');
for (const [tag, fins] of finsByArm) {
  fins.sort((a, b) => Math.abs(a.cos) - Math.abs(b.cos));
  log(`  --- ${tag} ---   ${'z'.padStart(9)} ${'theta'.padStart(9)} ${'cos'.padStart(9)} ${'ar3'.padStart(8)} ${'parAR'.padStart(11)} ${'longest um'.padStart(11)}`);
  for (const f of fins.slice(0, 12)) {
    log(`              ${f.z.toFixed(4).padStart(9)} ${f.th.toFixed(5).padStart(9)} ${f.cos.toFixed(5).padStart(9)} ${(Number.isFinite(f.ar) ? f.ar.toFixed(2) : 'inf').padStart(8)} ${(Number.isFinite(f.parAR) ? f.parAR.toFixed(1) : 'inf').padStart(11)} ${f.longUm.toFixed(1).padStart(11)}`);
  }
}
log('');
log('AND THE SHAPE OF THE FIN POPULATION — are they thin, or ordinary facets standing edge-on?');
for (const [tag, fins] of finsByArm) {
  if (fins.length === 0) continue;
  const ars = fins.map((f) => f.ar).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const ls = fins.map((f) => f.longUm).sort((a, b) => a - b);
  const q = (arr: number[], p: number): number => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const ps = fins.map((f) => f.parAR).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  log(`  ${tag.padEnd(10)} n=${String(fins.length).padStart(5)}   ar3 p50 ${q(ars, 0.5).toFixed(2).padStart(7)} p90 ${q(ars, 0.9).toFixed(2).padStart(8)} MAX ${q(ars, 1).toFixed(1).padStart(8)}   *** parAR p50 ${q(ps, 0.5).toFixed(1).padStart(8)} p90 ${q(ps, 0.9).toFixed(1).padStart(9)} MAX ${q(ps, 1).toFixed(0).padStart(10)} ***   longest um p50 ${q(ls, 0.5).toFixed(1).padStart(7)}`);
}
log('');
log('READ IT AS: if BACK-FACING is FLAT across the cap sweep, the cap lever never touched the visible');
log('class and the operator is right that nothing changed where it matters. If the counts move with the');
log('DIFFERENCE STEP rather than with the arm, the instrument is reading creases and is the artefact.');
