// revS116AreaHFree.ts — REVIEW CONTROL for S115's "independent analytic-area control".
//
// S115 justifies deleting 871 mm2 of mesh area by claiming the analytic surface area is 48,348.368 mm2,
// so the shipping mesh carries 1,256.491 mm2 (2.5988%) of spurious fin area. That number comes from
// s115AreaTruth.ts, which evaluates  A = int int sqrt(r_th^2 + r^2 (1+r_z^2)) dth dz  using CENTRAL
// FINITE DIFFERENCES at a HARD-CODED, UNSWEPT hFD = 1e-6 (line 78). Brief scar 3 says an unswept fd step
// is not a measurement. r_th^2 DOMINATES that integrand in the feature bands (r ~ 45, |grad r| up to 6.86
// => r_th ~ 309, r_th^2 ~ 9.5e4 against r^2 ~ 2.0e3), so an h that smooths r_th UNDER-states the analytic
// area and therefore OVER-states the "fin budget" the operator claims to be removing.
//
// TWO CHECKS, both independent of s115AreaTruth:
//   A. SWEEP hFD at a fixed quadrature grid. Paired: same grid, same rA, only h moves.
//   B. An h-FREE area: inscribe the graph r = rA(th,z) on an N x N grid, split each cell into two
//      triangles and sum true 3D triangle areas. No derivative, no h at all. For a Lipschitz graph on a
//      regular grid this converges to the true area from below as N -> inf.
//
// Usage: bash research/tools/run-rev-s116-areahfree.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S116_STYLE ?? 'CelticTriquetra';
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== REV S116 — IS S115's ANALYTIC AREA AN h-ARTIFACT? — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`defs ${Object.entries(D).map(([k, v]) => `${k}=${v}`).join(' ')}`);
log('S115 claims: MESH 49604.859  ANALYTIC 48348.368  EXCESS 1256.491 mm2 (2.5988%)');
log('');

// ── A. h SWEEP of the SAME quadrature s115AreaTruth uses, at a fixed grid ──────────────────────────────
const NQ = Math.round(envF('PF_S116_NQ', 800));
log(`── A. h SWEEP of  A = int int sqrt(r_th^2 + r^2(1+r_z^2)) dth dz   (midpoint, FIXED ${NQ}x${NQ} grid) ──`);
log('   S115 used hFD = 1e-6 and NEVER SWEPT IT.');
log('     hFD          area mm2      vs h=1e-6      implied EXCESS vs mesh 49604.859');
const MESH_AREA = 49604.859;
const hLad = (process.env.PF_S116_HLADDER ?? '1e-9,1e-8,1e-7,1e-6,1e-5,1e-4,1e-3').split(',').map(Number);
const areasA: number[] = [];
let ref = NaN;
for (const hFD of hLad) {
  let A = 0;
  const dth = TAU / NQ; const dz = H / NQ;
  for (let i = 0; i < NQ; i += 1) {
    const th = (i + 0.5) * dth;
    for (let j = 0; j < NQ; j += 1) {
      const z = (j + 0.5) * dz;
      const r = rA(th, z);
      const hT = hFD / Math.max(1e-9, r);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      const zl = Math.max(0, z - hFD); const zh = Math.min(H, z + hFD);
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      A += Math.sqrt(rt * rt + r * r * (1 + rz * rz)) * dth * dz;
    }
  }
  if (hFD === 1e-6) ref = A;
  areasA.push(A);
  log(`   ${hFD.toExponential(0).padStart(8)}   ${A.toFixed(4).padStart(14)}   ${Number.isFinite(ref) ? (A - ref).toFixed(4).padStart(12) : '—'.padStart(12)}   ${(MESH_AREA - A).toFixed(3).padStart(12)} mm2 = ${(((MESH_AREA - A) / A) * 100).toFixed(4)}%  ${el()}`);
}
const aMin = Math.min(...areasA); const aMax = Math.max(...areasA);
log(`   h-SPREAD of the analytic area: ${(aMax - aMin).toFixed(4)} mm2  (${(((aMax - aMin) / aMin) * 100).toFixed(5)}%)`);
log(`   h-SPREAD of the implied EXCESS: ${(aMax - aMin).toFixed(4)} mm2 on a claimed excess of 1256.491 => ${(((aMax - aMin) / 1256.491) * 100).toFixed(3)}% of the fin budget`);
log('');

// ── B. h-FREE INSCRIBED GRAPH AREA ────────────────────────────────────────────────────────────────────
log('── B. h-FREE AREA: inscribe r=rA(th,z) on an NxN grid, 2 triangles/cell, sum true 3D areas ──');
log('   No derivative and no h anywhere. Converges from BELOW for a Lipschitz graph on a regular grid.');
log('     N        area mm2      delta vs prev     ratio mesh/analytic     implied EXCESS mm2');
const nLad = (process.env.PF_S116_NLADDER ?? '250,500,1000,2000,3000').split(',').map(Number);
let prevB = NaN;
let lastB = NaN;
for (const N of nLad) {
  const dth = TAU / N; const dz = H / N;
  // stream two z-rows at a time; column j wraps in theta
  let rPrev = new Float64Array(N + 1);
  let rCur = new Float64Array(N + 1);
  for (let i = 0; i <= N; i += 1) rPrev[i] = rA(i * dth, 0);
  let A = 0;
  const triArea = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number => {
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  };
  for (let j = 1; j <= N; j += 1) {
    const z1 = j * dz; const z0 = (j - 1) * dz;
    for (let i = 0; i <= N; i += 1) rCur[i] = rA(i * dth, z1);
    for (let i = 0; i < N; i += 1) {
      const t0 = i * dth; const t1 = (i + 1) * dth;
      const c0 = Math.cos(t0); const s0 = Math.sin(t0); const c1 = Math.cos(t1); const s1 = Math.sin(t1);
      // corners: (i,j-1) (i+1,j-1) (i,j) (i+1,j)
      const p00x = rPrev[i] * c0; const p00y = rPrev[i] * s0;
      const p10x = rPrev[i + 1] * c1; const p10y = rPrev[i + 1] * s1;
      const p01x = rCur[i] * c0; const p01y = rCur[i] * s0;
      const p11x = rCur[i + 1] * c1; const p11y = rCur[i + 1] * s1;
      A += triArea(p00x, p00y, z0, p10x, p10y, z0, p11x, p11y, z1);
      A += triArea(p00x, p00y, z0, p11x, p11y, z1, p01x, p01y, z1);
    }
    const sw = rPrev; rPrev = rCur; rCur = sw;
  }
  log(`   ${String(N).padStart(5)}   ${A.toFixed(4).padStart(14)}   ${Number.isFinite(prevB) ? (A - prevB).toFixed(4).padStart(14) : '—'.padStart(14)}   ${(MESH_AREA / A).toFixed(6).padStart(20)}   ${(MESH_AREA - A).toFixed(3).padStart(18)}  ${el()}`);
  prevB = A; lastB = A;
}
log('');
log(`   *** h-FREE ANALYTIC AREA (finest N) ${lastB.toFixed(3)} mm2  vs S115's 48348.368 mm2 ***`);
log(`   implied EXCESS ${(MESH_AREA - lastB).toFixed(3)} mm2 vs S115's claimed 1256.491 mm2`);
log(`   S115's weld leaves a mesh of 48733.47 mm2 => UNDERSHOOT of ${(lastB - 48733.47).toFixed(3)} mm2 (positive = the weld ate REAL surface)`);
log('');
log(`done ${el()}`);
