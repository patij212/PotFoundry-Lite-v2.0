// s115AreaTruth.ts — S115 ADDENDUM: THE INDEPENDENT AREA CONTROL, AND THE normDeg DENOMINATOR.
//
// TWO NUMBERS THE OPERATOR RUN CANNOT SUPPLY ABOUT ITSELF.
//
// 1. THE ANALYTIC AREA. s115BladeAnatomy measured that a blade pair carries 3.1e-2 mm2 of 3D area while
//    covering 5.2e-7 mm2 of the (r*theta, z) parameter domain — a sheet that covers NOTHING. If that is
//    true, the shipped mesh's 3D area must EXCEED the true surface area by roughly the fin area, and a
//    correct de-blade must move the mesh area TOWARD the analytic value, not merely down. An operator
//    that overshoots is eating real surface.
//      A = int int sqrt( r_th^2 + r^2 (1 + r_z^2) ) dth dz     (exact for a radial graph r = rA(th,z))
//    The quadrature is refined until it converges, and the convergence ladder is printed rather than a
//    single number — the same discipline the dihedral ceiling is held to.
//
// 2. THE normDeg DENOMINATOR. The operator run reports EXACT deltas of over-bar AREA (mm2) because the
//    unchanged facets cancel; but a delta is only quotable against a base. This measures the whole-mesh
//    area-weighted over-1 deg / over-5 deg normDeg base by golden stride, at the h-converged step and with
//    inset passed EXPLICITLY, and SWEEPS h so the base is not itself an h-artifact.
//
// Usage: bash research/tools/run-s115-area.sh   (env PF_S115_STL absolute)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, dflt: number): number => (process.env[n] === undefined ? dflt : Number(process.env[n]));
const envI = (n: string, dflt: number): number => Math.round(envF(n, dflt));
const STYLE = process.env.PF_S115_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115_STL ?? '';
const TAG = process.env.PF_S115_TAG ?? STYLE;
const OUTDIR = process.env.PF_S115_OUTDIR ?? 'research/exchange/_strataConformBisect/s115op';
const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const K_REF = envI('PF_S115_K', 8);
const INSET_REF = envF('PF_S115_INSET', 0.05);
const STRIDE = envI('PF_S115_ASTRIDE', 40);
if (STL.length === 0) { log('*** PF_S115_STL required ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const DEFAULTS: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [kk, v] of Object.entries(g)) if (typeof v.default === 'number') DEFAULTS[snakeToCamel(kk)] = v.default;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
let meshArea = 0; let zMin = Infinity; let zMax = -Infinity;
for (let f = 0; f < nTri; f += 1) {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  meshArea += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  zMin = Math.min(zMin, az, bz, cz); zMax = Math.max(zMax, az, bz, cz);
}
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 ADDENDUM — ANALYTIC AREA vs MESH AREA, and the normDeg DENOMINATOR — ${STYLE} (${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`facets ${nTri}   MESH AREA ${meshArea.toFixed(4)} mm2   z span [${zMin.toFixed(4)}, ${zMax.toFixed(4)}]`);
log('');
log('── THE ANALYTIC AREA  A = int int sqrt(r_th^2 + r^2 (1 + r_z^2)) dth dz  (midpoint rule, refined) ──');
log('   READ THE CONVERGENCE, NOT THE NUMBER.');
log('     Nth x Nz          area mm2        delta vs previous     ratio to mesh');
const ladder: Array<Record<string, number>> = [];
let prev = NaN;
for (const N of [400, 800, 1600, 3200]) {
  const Nz = N; let A = 0;
  const dth = TAU / N; const dz = (zMax - zMin) / Nz;
  const hFD = 1e-6;
  for (let i = 0; i < N; i += 1) {
    const th = (i + 0.5) * dth;
    for (let j = 0; j < Nz; j += 1) {
      const z = zMin + (j + 0.5) * dz;
      const r = rA(th, z);
      const hT = hFD / Math.max(1e-9, r);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      const zl = Math.max(0, z - hFD); const zh = Math.min(H, z + hFD);
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      A += Math.sqrt(rt * rt + r * r * (1 + rz * rz)) * dth * dz;
    }
  }
  log(`     ${String(N).padStart(4)} x ${String(Nz).padStart(4)}   ${A.toFixed(4).padStart(14)}   ${Number.isFinite(prev) ? (A - prev).toExponential(3).padStart(18) : '—'.padStart(18)}   ${(meshArea / A).toFixed(6).padStart(14)}`);
  ladder.push({ N, area: A, ratio: meshArea / A });
  prev = A;
}
const AA = ladder[ladder.length - 1].area;
log('');
log(`   *** MESH AREA ${meshArea.toFixed(3)} mm2  vs  ANALYTIC AREA ${AA.toFixed(3)} mm2  =>  EXCESS ${(meshArea - AA).toFixed(3)} mm2 = ${(((meshArea - AA) / AA) * 100).toFixed(4)}% ***`);
log('   A mesh of a graph surface can only EXCEED the analytic area (a piecewise-linear interpolant of a');
log('   curved graph is shorter, but a FOLDED sheet double-counts). Excess is the fin budget: a de-blade');
log('   should move the mesh area toward this value and must not undershoot it.');
log('');
log('── THE normDeg DENOMINATOR — whole-mesh, area-weighted, golden stride ──');
log('     h          n     over-1deg AREA mm2   (% of mesh)   over-5deg AREA mm2   (% of mesh)      p50      MAX');
const nd: Array<Record<string, number>> = [];
const scratch = new Float64Array(12);
for (const hh of [2e-7, 2e-6, 2e-5, 2e-4]) {
  const ns = fdNormals(rA, H, hh, hh);
  let o1 = 0; let o5 = 0; let tot = 0; let mx = 0; const all: number[] = [];
  for (let f = 0; f < nTri; f += STRIDE) {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    const ar = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const ath = Math.atan2(ay, ax);
    const bth = ath + dThRaw(ath, Math.atan2(by, bx));
    const cth = ath + dThRaw(ath, Math.atan2(cy, cx));
    const r = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, ath, bth, cth, { k: K_REF, inset: INSET_REF, scratch });
    tot += ar; all.push(r.normDeg);
    if (r.normDeg > 1) o1 += ar;
    if (r.normDeg > 5) o5 += ar;
    if (r.normDeg > mx) mx = r.normDeg;
  }
  const sc = meshArea / tot;
  const s = all.slice().sort((a, b) => a - b);
  log(`     ${hh.toExponential(0).padStart(8)} ${String(all.length).padStart(7)}   ${(o1 * sc).toFixed(3).padStart(16)}   ${(((o1 * sc) / meshArea) * 100).toFixed(4).padStart(10)}%   ${(o5 * sc).toFixed(3).padStart(16)}   ${(((o5 * sc) / meshArea) * 100).toFixed(4).padStart(10)}%   ${s[Math.floor(s.length / 2)].toFixed(2).padStart(7)}  ${mx.toFixed(2).padStart(7)}`);
  nd.push({ h: hh, n: all.length, over1Mm2: o1 * sc, over5Mm2: o5 * sc, p50: s[Math.floor(s.length / 2)], max: mx });
}
writeFileSync(`${OUTDIR}/S115AREA_${TAG}.json`, `${JSON.stringify({ style: STYLE, meshArea, analyticArea: AA, ladder, normDegBase: nd }, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S115AREA_${TAG}.json`);
