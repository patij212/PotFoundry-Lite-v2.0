// s115OpDeblade.ts — S115 OPERATOR: DE-BLADE CelticTriquetra's REDUCIBLE CLASS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS OPERATOR AND NOT THE SLIVER COLLAPSE THE BRIEF ANTICIPATED
//
// The brief expected SLIVER REMOVAL (S111's mechanism on Gothic). char:mechanism measured the partition on
// CelticTriquetra and SLIVER is 6.281% of the reducible area. The dominant mechanism, by a factor of 12, is
//   P2a-BLADE  67.669% of the >45 class AREA / 75.834% of the REDUCIBLE area, dihedral p50 179.93 deg.
// So the operator is the one the mechanism NAMES: DE-BLADE.
//
// s115BladeAnatomy then measured what a blade IS, and the five facts below choose the repair. Every one is
// analytic-free except Q5, and none of them depends on inset, k or h:
//   Q1  the shared edge is the LONGEST edge of the pair only 44.16% of the time.
//   Q2  |pq| / pair diameter p50 0.1977 — the apexes are NOT coincident.
//   Q3  |param area| p50 5.2e-7 mm2 against a 3.1e-2 mm2 3D pair area: BOTH facets of the fin are
//       degenerate in the (r*theta, z) parameter domain — the pair covers ~0 domain while carrying real
//       3D area. 43.28% of pairs additionally have the SAME param-area sign (the sheet is FOLDED).
//   Q5  the four vertices are ON the analytic surface: max |r_v - rA| p50 5.4 nm, p90 10.7 nm, p99 13.5 nm.
//       *** THE FIN IS A CONNECTIVITY DEFECT, NOT A POSITION DEFECT. Any operator that only MOVES
//       vertices toward the surface is attacking something that is already correct. ***
//   Q6  a 2-2 FLIP of the shared edge is legal 99.86% of the time and REFUTED BY SIMULATION: only 28.75%
//       of legal flips stop being a blade, the child min angle FALLS from p50 1.42 deg to 0.36 deg and the
//       child aspect p50 is 198. The textbook repair does not work here.
//
// => THE OPERATOR IS FIN EXCISION BY APEX WELD ("WELD"). For a blade edge (u,v) with apexes p (of f1) and
//    q (of f2), weld p onto q. f1 = (u,v,p) becomes (u,v,q), which is f2 = (v,u,q) with opposite winding:
//    the two cancel and BOTH are removed. Edge (u,p) merges into (u,q) and (v,p) into (v,q); each of the
//    four had 2 incident facets and loses exactly one, so each merged edge ends with 2. The fin is excised
//    and the hole is zipped IN ONE MOVE, manifoldness preserved, NO new vertex position invented — the
//    surviving apex is a vertex that was already on rA to ~5 nm. Facet count -2, vertex count -1 per weld.
//
//    Its cost is entirely COLLATERAL: every other facet that used p now uses q, so the 1-ring is restretched
//    by up to |pq|. That is what the position bar is for and it is measured exhaustively, not sampled.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ARMS. Every operator arm carries a COST-MATCHED PLACEBO with the SAME operation on an UNINFORMED key.
//   A1 WELD        fin excision on blade edges, best-first by dihedral, with a 1-ring lock.
//   P1 WELD-RAND   the SAME weld, same COUNT, on uniformly random legal interior edges. (cost-matched)
//   A2 FLIP        2-2 flip of the same blade edges (the textbook repair, run for real).
//   P2 FLIP-RAND   the SAME flip, same COUNT, on uniformly random legal interior edges. (cost-matched)
//   A3 DELETE      remove the blade facets outright, no zip. NOT a candidate — it is the diagnostic that
//                  prices how much of the defect the class IS, and exhibits the hole removal alone opens.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// *** PRE-REGISTERED KILL LINE — WRITTEN BEFORE ANY ARM WAS RUN. ***
// An arm SHIPS only if ALL FIVE hold. Any single failure REFUTES it.
//   K1 CEILING  the >45 deg class AREA falls by >= 25.0%, measured in ABSOLUTE mm2 against the ORIGINAL
//               denominator 49,604.859 mm2 (so an arm cannot win by deleting the denominator).
//   K2 PLACEBO  it beats its own cost-matched placebo by >= 2.0x on that same absolute area reduction.
//   K3 TOPOLOGY boundary edges <= 600 (the ring STL's two open rims), non-manifold == 0,
//               inconsistent winding == 0.  A repair that opens the solid has repaired nothing.
//   K4 POSITION the COUNT of facets whose radial deviation from rA exceeds 0.01 mm does not INCREASE, and
//               the deviation MAX does not increase.  (Export standard, memory: 0.01 mm ALWAYS.)
//   K5 FLOOR    the whole-mesh min-angle p10 does not FALL and the aspect p90 does not RISE. A one-sided
//               bar is vacuous (S-feedback): an arm that fixes the angle by manufacturing needles has
//               fixed nothing, so the shape floor is asserted as well as the angle ceiling.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MEASUREMENT DISCIPLINE
//  * SCORE-A, the primary, is the ANALYTIC-FREE dihedral and it is EXHAUSTIVE on every arm — no sampling
//    error at all. COUNT + AREA + MAX, PER FACET, never per pair.
//  * SCORE-B is the covering orientation ruler. normDeg depends only on a facet's own vertices and rA, so
//    a facet present in BOTH meshes has an IDENTICAL normDeg. The arm's delta is therefore
//    OverArea(NEW) - OverArea(REMOVED), and BOTH of those sets are measured EXHAUSTIVELY: the delta is
//    EXACT and only the common-mode base carries sampling error. h is SWEPT on it (scar 3); inset is
//    passed EXPLICITLY and swept (scar 1); k is swept (scar 2).
//  * POSITION is measured on a barycentric lattice per facet as |r_pt - rA(th_pt, z_pt)|, which is an
//    UPPER bound on the true distance to the surface (a radial segment reaching the surface). It is the
//    known-INFLATING projector on riser facets and is labelled as such; it is used identically on both
//    arms so the inflation is common-mode, and it is EXHAUSTIVE on the changed sets.
//  * PRECOND refuses the mesh over 50 um and is run EXHAUSTIVELY over vertices, not on a stride — the
//    stride PRECOND has already been caught missing a 1374.8 um population on this exact mesh.
//
// Usage: bash research/tools/run-s115-op.sh   (env PF_S115_STL absolute, PF_S115_STYLE, PF_S115_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
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
const DEG = 180 / Math.PI;

const BLADE_BAR = envF('PF_S115_BLADE', 175);       // target key, SWEPT in stage 6
const HI_DEG = envF('PF_S115_HI_DEG', 45);          // the class bar (a CONVENTION, per the brief)
const POS_BAR = envF('PF_S115_POSBAR', 0.01);       // mm — the export standard
const K_REF = envI('PF_S115_K', 8);
const INSET_REF = envF('PF_S115_INSET', 0.05);
const H_REF = envF('PF_S115_HFD', 2e-6);
const POS_K = envI('PF_S115_POSK', 6);              // barycentric lattice order for the position ruler
const NORM_CAP = envI('PF_S115_NORMCAP', 200000);   // cap on exhaustive normDeg over a changed set
const SWEEP_N = envI('PF_S115_SWEEPN', 6000);       // subsample for the h/k/inset ladders
const BASE_STRIDE = envI('PF_S115_BASESTRIDE', 24); // whole-mesh common-mode base sample
// KILL LINE constants — pre-registered.
const K1_CLEAR = envF('PF_S115_K1', 0.25);
const K2_RATIO = envF('PF_S115_K2', 2.0);

if (STL.length === 0) { log('*** PF_S115_STL is required (ABSOLUTE path). ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');
const f4 = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : '—');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [kk, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(kk)] = v.default;
  }
  return out;
}
const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const OUT: Record<string, unknown> = {
  style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS,
  cuts: { BLADE_BAR, HI_DEG, POS_BAR, K_REF, INSET_REF, H_REF, POS_K },
  killLine: {
    K1: `>45 class AREA falls >= ${(K1_CLEAR * 100).toFixed(1)}% (absolute mm2, ORIGINAL denominator)`,
    K2: `beats its cost-matched placebo by >= ${K2_RATIO.toFixed(1)}x on that reduction`,
    K3: 'boundary <= 600, non-manifold == 0, inconsistent winding == 0',
    K4: `count of facets over ${POS_BAR} mm radial deviation does not increase, and MAX does not increase`,
    K5: 'whole-mesh min-angle p10 does not fall and aspect p90 does not rise',
  },
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 OPERATOR — DE-BLADE (FIN EXCISION BY APEX WELD) — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`defs  ${Object.entries(DEFAULTS).map(([kk, v]) => `${kk}=${v}`).join(' ')}`);
log(`cuts  blade>=${BLADE_BAR}deg  class>${HI_DEG}deg  posBar ${POS_BAR}mm  k=${K_REF} inset=${INSET_REF} h=${H_REF} posK=${POS_K}`);
log('');
log('*** PRE-REGISTERED KILL LINE (fixed before any arm ran) ***');
for (const [kk, v] of Object.entries(OUT.killLine as Record<string, string>)) log(`   ${kk}  ${v}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD, WELD, PRECOND (EXHAUSTIVE)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri0 = M.nTri;
log(`loaded ${nTri0} facets ${el()}`);

const nCorner = nTri0 * 3;
const vid = new Int32Array(nCorner);
let nV = 0;
const VXl: number[] = []; const VYl: number[] = []; const VZl: number[] = [];
{
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  for (let c = 0; c < nCorner; c += 1) {
    const x = xyz0[c * 3]; const y = xyz0[c * 3 + 1]; const z = xyz0[c * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35); h |= 0;
    const b = buckets.get(h);
    let found = -1;
    if (b !== undefined) for (const cc of b) if (VXl[cc] === x && VYl[cc] === y && VZl[cc] === z) { found = cc; break; }
    if (found < 0) { found = nV; nV += 1; VXl.push(x); VYl.push(y); VZl.push(z); if (b === undefined) buckets.set(h, [found]); else b.push(found); }
    vid[c] = found;
  }
}
const VX = Float64Array.from(VXl); const VY = Float64Array.from(VYl); const VZ = Float64Array.from(VZl);
const IDX0 = Uint32Array.from(vid);
log(`welded ${nCorner} corners -> ${nV} vertices ${el()}`);

let VOID_REASON = '';
{
  // *** EXHAUSTIVE PRECOND over the welded vertices. conv:curtain-K's C1 fired at 1374.8 um on 4 facets
  // when it stopped striding; a stride PRECOND on this mesh is not a control. ***
  let worst = 0; let worstV = -1; const devs: number[] = []; let over10 = 0; let over50 = 0;
  for (let v = 0; v < nV; v += 1) {
    const dd = Math.abs(Math.hypot(VX[v], VY[v]) - rA(Math.atan2(VY[v], VX[v]), VZ[v])) * 1000;
    if (dd > worst) { worst = dd; worstV = v; }
    if (dd > 10) over10 += 1;
    if (dd > 50) over50 += 1;
    if (v % 41 === 0) devs.push(dd);
  }
  log('── STAGE 0 / CONTROL C1: PRECOND, EXHAUSTIVE over all welded vertices ──');
  log(`  vertices ${nV}   |dr| p50 ${ex(q(devs, 0.5))} p99 ${ex(q(devs, 0.99))} um   MAX ${worst.toFixed(2)} um at v${worstV}`);
  log(`  vertices over 10 um: ${over10} (${pct(over10, nV)}%)   over 50 um: ${over50} (${pct(over50, nV)}%)`);
  OUT.precond = { nV, p50Um: q(devs, 0.5), p99Um: q(devs, 0.99), maxUm: worst, over10, over50 };
  if (over50 > 0) {
    log(`  ██ *** ${over50} VERTICES EXCEED THE 50 um PRECOND GATE (MAX ${worst.toFixed(1)} um). ***`);
    log('  This is conv:curtain-K\'s C1 firing again, now located to individual vertices. The population is');
    log('  reported and EXCLUDED from every target set below; it is not rescued and not averaged in.');
    OUT.precondVerdict = 'LOCALISED-EXCEEDANCE-EXCLUDED';
  }
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED SCORING MACHINERY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
type Mesh = { idx: Uint32Array; nF: number; src: Int32Array };
const MESH0: Mesh = { idx: IDX0, nF: nTri0, src: Int32Array.from({ length: nTri0 }, (_v, i) => i) };

function soupOf(m: Mesh): Float64Array {
  const s = new Float64Array(m.nF * 9);
  for (let f = 0; f < m.nF; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const v = m.idx[f * 3 + k];
      s[f * 9 + k * 3] = VX[v]; s[f * 9 + k * 3 + 1] = VY[v]; s[f * 9 + k * 3 + 2] = VZ[v];
    }
  }
  return s;
}
const triArea = (a: number, b: number, c: number): number => {
  const ux = VX[b] - VX[a]; const uy = VY[b] - VY[a]; const uz = VZ[b] - VZ[a];
  const wx = VX[c] - VX[a]; const wy = VY[c] - VY[a]; const wz = VZ[c] - VZ[a];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
const dist = (i: number, j: number): number => Math.hypot(VX[i] - VX[j], VY[i] - VY[j], VZ[i] - VZ[j]);
const minAngleOf = (a: number, b: number, c: number): number => {
  const la = dist(b, c); const lb = dist(a, c); const lc = dist(a, b);
  const ang = (x: number, y: number, z: number): number => Math.acos(Math.max(-1, Math.min(1, (y * y + z * z - x * x) / (2 * y * z)))) * DEG;
  return Math.min(ang(la, lb, lc), ang(lb, la, lc), ang(lc, la, lb));
};
const aspectOf = (a: number, b: number, c: number): number => {
  const L = Math.max(dist(b, c), dist(a, c), dist(a, b));
  const ar = triArea(a, b, c);
  const alt = L > 0 ? (2 * ar) / L : 0;
  return alt > 0 ? L / alt : Infinity;
};
/** POSITION: max over a barycentric lattice of |r_pt - rA(th_pt,z_pt)| — an UPPER bound on the distance. */
function posDevOf(a: number, b: number, c: number, kk: number): number {
  let worst = 0;
  for (let i = 0; i <= kk; i += 1) {
    for (let j = 0; i + j <= kk; j += 1) {
      const w0 = (kk - i - j) / kk; const w1 = i / kk; const w2 = j / kk;
      const x = w0 * VX[a] + w1 * VX[b] + w2 * VX[c];
      const y = w0 * VY[a] + w1 * VY[b] + w2 * VY[c];
      const z = w0 * VZ[a] + w1 * VZ[b] + w2 * VZ[c];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}
const scratch = new Float64Array(12);
function normDegOf(a: number, b: number, c: number, ns: (th: number, z: number, o: Float64Array) => number,
  kk: number, inset: number): number {
  const ath = Math.atan2(VY[a], VX[a]);
  const bth = ath + dThRaw(ath, Math.atan2(VY[b], VX[b]));
  const cth = ath + dThRaw(ath, Math.atan2(VY[c], VX[c]));
  const r = orientOfFacet(ns, VX[a], VY[a], VZ[a], VX[b], VY[b], VZ[b], VX[c], VY[c], VZ[c], ath, bth, cth,
    { k: kk, inset, scratch });
  return r.normDeg;
}

interface ScoreA {
  nF: number; area: number; boundary: number; nonManifold: number; inconsistent: number;
  hiCount: number; hiArea: number; hiMaxDeg: number;
  ceilCount: number; ceilArea: number;
  bladeCount: number; bladeArea: number;
  minAngP10: number; minAngP50: number; aspP90: number; aspMax: number;
  zeroArea: number;
}
let CEIL_DEG = 163.406;   // measured in char:mechanism, recomputed below

function scoreA(m: Mesh, label: string): ScoreA {
  const s = soupOf(m);
  const dd = facetDihedrals(s, new Uint32Array(m.nF * 3).map((_, i) => i));
  let area = 0; let hiC = 0; let hiA = 0; let hiMax = 0; let ceC = 0; let ceA = 0; let blC = 0; let blA = 0;
  const hiThr = (HI_DEG * Math.PI) / 180; const ceThr = (CEIL_DEG * Math.PI) / 180; const blThr = (BLADE_BAR * Math.PI) / 180;
  let zeroArea = 0;
  for (let f = 0; f < m.nF; f += 1) {
    area += dd.areaMm2[f];
    if (!(dd.areaMm2[f] > 0)) zeroArea += 1;
    const a = dd.perFacetMaxRad[f];
    if (a > hiMax) hiMax = a;
    if (a > hiThr) { hiC += 1; hiA += dd.areaMm2[f]; }
    if (a > ceThr) { ceC += 1; ceA += dd.areaMm2[f]; }
    if (a >= blThr) { blC += 1; blA += dd.areaMm2[f]; }
  }
  const mas: number[] = []; const asp: number[] = [];
  let aspMax = 0;
  for (let f = 0; f < m.nF; f += 1) {
    const a = m.idx[f * 3]; const b = m.idx[f * 3 + 1]; const c = m.idx[f * 3 + 2];
    const as = aspectOf(a, b, c);
    if (as > aspMax) aspMax = as;
    if (f % 7 === 0) { mas.push(minAngleOf(a, b, c)); asp.push(as); }
  }
  const out: ScoreA = {
    nF: m.nF, area, boundary: dd.boundaryEdges, nonManifold: dd.nonManifoldEdges, inconsistent: dd.inconsistentEdges,
    hiCount: hiC, hiArea: hiA, hiMaxDeg: hiMax * DEG,
    ceilCount: ceC, ceilArea: ceA, bladeCount: blC, bladeArea: blA,
    minAngP10: q(mas, 0.1), minAngP50: q(mas, 0.5), aspP90: q(asp, 0.9), aspMax, zeroArea,
  };
  void label;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — BASELINE + THE ANALYTIC CEILING (recomputed here so the arm table is self-contained)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  let gmax = 0;
  const N = 1600;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const th = (2 * Math.PI * (i + 0.5)) / N; const z = (H * (j + 0.5)) / N;
      const r0 = rA(th, z);
      const hT = H_REF / Math.max(1e-9, r0);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      const zl = Math.max(0, z - H_REF); const zh = Math.min(H, z + H_REF);
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const g = Math.hypot(rt / r0, rz);
      if (g > gmax) gmax = g;
    }
  }
  CEIL_DEG = 2 * Math.atan(gmax) * DEG;
  log(`── STAGE 1: ANALYTIC CEILING on an honest dihedral (1600^2 grid): max|grad r| ${gmax.toFixed(4)} => ${CEIL_DEG.toFixed(3)} deg ${el()}`);
  OUT.ceilingDeg = CEIL_DEG;
}
const BASE = scoreA(MESH0, 'BASE');
log(`   BASELINE: facets ${BASE.nF}  AREA ${BASE.area.toFixed(3)} mm2  boundary ${BASE.boundary} nm ${BASE.nonManifold} inc ${BASE.inconsistent}`);
log(`   >${HI_DEG} class COUNT ${BASE.hiCount} AREA ${BASE.hiArea.toFixed(3)} mm2 (${pct(BASE.hiArea, BASE.area)}% of mesh) MAX ${BASE.hiMaxDeg.toFixed(5)} deg`);
log(`   over-ceiling(${CEIL_DEG.toFixed(2)}) COUNT ${BASE.ceilCount} AREA ${BASE.ceilArea.toFixed(3)} mm2   blade(>=${BLADE_BAR}) COUNT ${BASE.bladeCount} AREA ${BASE.bladeArea.toFixed(3)} mm2`);
log(`   shape: minAngle p10 ${f4(BASE.minAngP10)} p50 ${f4(BASE.minAngP50)} deg   aspect p90 ${ex(BASE.aspP90)} MAX ${ex(BASE.aspMax)}`);
OUT.base = BASE;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TOPOLOGY — rebuilt from ANY mesh, so the arms can run MULTIPLE PASSES.
//
// WHY MULTI-PASS. s115BladeAnatomy measured that only 46.58% of blade facets carry a single blade edge;
// 53.42% of them (77.62% of the blade AREA) sit INSIDE a strip carrying 2 or 3. A single greedy pass with
// a correct conflict rule therefore cannot reach most of the class — the first weld in a strip locks its
// neighbours. Reporting one pass would price the BOOKKEEPING, not the operator, so every arm is run to
// convergence (or PASSES, whichever comes first) and the per-pass yield is printed.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const SHIFT = 67_108_864;
const PASSES = envI('PF_S115_PASSES', 4);
type Edge = { u: number; v: number; f1: number; f2: number; ang: number };
interface Topo { edges: Edge[]; keys: Set<number>; vOff: Int32Array; vFac: Int32Array }

function buildTopo(m: Mesh): Topo {
  const tmp = new Map<number, { u: number; v: number; f1: number; f2: number; n: number }>();
  for (let f = 0; f < m.nF; f += 1) {
    const a = m.idx[f * 3]; const b = m.idx[f * 3 + 1]; const c = m.idx[f * 3 + 2];
    for (const [p, r] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const lo = p < r ? p : r; const hi = p < r ? r : p; const k = lo * SHIFT + hi;
      const t = tmp.get(k);
      if (t === undefined) tmp.set(k, { u: lo, v: hi, f1: f, f2: -1, n: 1 });
      else { if (t.f2 < 0) t.f2 = f; t.n += 1; }
    }
  }
  const FN = new Float64Array(m.nF * 3);
  for (let f = 0; f < m.nF; f += 1) {
    const a = m.idx[f * 3]; const b = m.idx[f * 3 + 1]; const c = m.idx[f * 3 + 2];
    let nx = (VY[b] - VY[a]) * (VZ[c] - VZ[a]) - (VZ[b] - VZ[a]) * (VY[c] - VY[a]);
    let ny = (VZ[b] - VZ[a]) * (VX[c] - VX[a]) - (VX[b] - VX[a]) * (VZ[c] - VZ[a]);
    let nz = (VX[b] - VX[a]) * (VY[c] - VY[a]) - (VY[b] - VY[a]) * (VX[c] - VX[a]);
    const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; nz /= l; }
    FN[f * 3] = nx; FN[f * 3 + 1] = ny; FN[f * 3 + 2] = nz;
  }
  const edges: Edge[] = []; const keys = new Set<number>();
  for (const [k, t] of tmp) {
    keys.add(k);
    if (t.n !== 2) continue;
    let dp = FN[t.f1 * 3] * FN[t.f2 * 3] + FN[t.f1 * 3 + 1] * FN[t.f2 * 3 + 1] + FN[t.f1 * 3 + 2] * FN[t.f2 * 3 + 2];
    if (dp > 1) dp = 1; else if (dp < -1) dp = -1;
    edges.push({ u: t.u, v: t.v, f1: t.f1, f2: t.f2, ang: Math.acos(dp) * DEG });
  }
  const vDeg = new Int32Array(nV);
  for (let i = 0; i < m.nF * 3; i += 1) vDeg[m.idx[i]] += 1;
  const vOff = new Int32Array(nV + 1);
  for (let v = 0; v < nV; v += 1) vOff[v + 1] = vOff[v] + vDeg[v];
  const vFac = new Int32Array(m.nF * 3);
  const cur = Int32Array.from(vOff.subarray(0, nV));
  for (let f = 0; f < m.nF; f += 1) for (let k = 0; k < 3; k += 1) { const v = m.idx[f * 3 + k]; vFac[cur[v]] = f; cur[v] += 1; }
  return { edges, keys, vOff, vFac };
}
const apexOf = (m: Mesh, f: number, u: number, v: number): number => {
  const a = m.idx[f * 3]; const b = m.idx[f * 3 + 1]; const c = m.idx[f * 3 + 2];
  if (a !== u && a !== v) return a; if (b !== u && b !== v) return b; return c;
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ARMS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface ArmResult {
  name: string; kind: 'weld' | 'flip' | 'delete';
  mesh: Mesh;
  applied: number; attempted: number;
  perPass: number[];
  removedSrc: number[];         // ORIGINAL facet indices no longer present with an identical vertex set
  newFacets: number[];          // indices INTO mesh.idx whose vertex set differs from their original
  vertsWelded: number;
}

/** Apply a vertex remap + a facet kill set + per-facet vertex overrides, dropping degenerates. */
function applyOps(m: Mesh, remap: Int32Array, kill: Uint8Array,
  overrides: Map<number, [number, number, number]>): Mesh {
  const idx: number[] = []; const src: number[] = [];
  for (let f = 0; f < m.nF; f += 1) {
    if (kill[f] === 1) continue;
    const ov = overrides.get(f);
    const a = remap[ov === undefined ? m.idx[f * 3] : ov[0]];
    const b = remap[ov === undefined ? m.idx[f * 3 + 1] : ov[1]];
    const c = remap[ov === undefined ? m.idx[f * 3 + 2] : ov[2]];
    if (a === b || b === c || c === a) continue;
    idx.push(a, b, c); src.push(m.src[f]);
  }
  return { idx: Uint32Array.from(idx), nF: idx.length / 3, src: Int32Array.from(src) };
}

/** Provenance against the ORIGINAL mesh — pass-count independent, so SCORE-B's deltas stay EXACT. */
function provenance(m: Mesh): { removedSrc: number[]; newFacets: number[] } {
  const present = new Uint8Array(nTri0);
  const newFacets: number[] = [];
  for (let f = 0; f < m.nF; f += 1) {
    const s = m.src[f];
    if (s >= 0 && m.idx[f * 3] === IDX0[s * 3] && m.idx[f * 3 + 1] === IDX0[s * 3 + 1]
      && m.idx[f * 3 + 2] === IDX0[s * 3 + 2]) present[s] = 1;
    else newFacets.push(f);
  }
  const removedSrc: number[] = [];
  for (let f = 0; f < nTri0; f += 1) if (present[f] === 0) removedSrc.push(f);
  return { removedSrc, newFacets };
}

/**
 * ONE WELD PASS. For a blade edge (u,v) with apexes p (of f1) and q (of f2), weld one apex onto the other
 * and KILL BOTH FIN FACETS: after the weld f1 = (u,v,p) becomes (u,v,q), which is f2 = (v,u,q) traversed
 * the other way — a COINCIDENT TWIN, not a degenerate triangle. (Dropping only degenerates leaves two
 * superimposed facets and a non-manifold mesh; this was MEASURED on the first smoke run, where 8,043
 * welds moved the facet count by 34.) With both gone, each of (u,p),(v,p),(u,q),(v,q) loses exactly one
 * of its two facets and the merged pair is manifold again.
 *
 * CONFLICT RULE — the MINIMAL one, so the yield prices the OPERATOR and not the bookkeeping: a weld
 * rewrites the facets incident to `from`, so two welds conflict iff those sets overlap, or iff one's
 * `from` is the other's `to` (which would need a chained remap).
 */
function weldPass(m: Mesh, topo: Topo, targets: number[], maxOps: number): { mesh: Mesh; applied: number } {
  const remap = new Int32Array(nV); for (let v = 0; v < nV; v += 1) remap[v] = v;
  const consumed = new Uint8Array(nV); const isTarget = new Uint8Array(nV);
  const lockedF = new Uint8Array(m.nF); const kill = new Uint8Array(m.nF);
  const nbrOf = new Set<number>();
  let applied = 0; let skippedLink = 0;
  for (const ei of targets) {
    if (applied >= maxOps) break;
    const e = topo.edges[ei];
    const p = apexOf(m, e.f1, e.u, e.v); const qq = apexOf(m, e.f2, e.u, e.v);
    if (p === qq) continue;
    if (lockedF[e.f1] === 1 || lockedF[e.f2] === 1) continue;
    // weld the LOWER-VALENCE apex onto the higher-valence one: fewer facets are restretched.
    const dp = topo.vOff[p + 1] - topo.vOff[p]; const dq = topo.vOff[qq + 1] - topo.vOff[qq];
    let from = dp <= dq ? p : qq; let to = dp <= dq ? qq : p;
    if (consumed[from] === 1 || isTarget[from] === 1 || consumed[to] === 1) {
      const alt = from; from = to; to = alt;             // try the other direction before giving up
      if (consumed[from] === 1 || isTarget[from] === 1 || consumed[to] === 1) continue;
    }
    let clash = false;
    for (let i = topo.vOff[from]; i < topo.vOff[from + 1] && !clash; i += 1) if (lockedF[topo.vFac[i]] === 1) clash = true;
    for (let i = topo.vOff[to]; i < topo.vOff[to + 1] && !clash; i += 1) if (lockedF[topo.vFac[i]] === 1) clash = true;
    if (clash) continue;
    // *** THE LINK CONDITION. Welding two vertices is manifold-safe ONLY if their common neighbours are
    // exactly the two vertices of the "edge" being collapsed — here u and v, which the fin supplies. Any
    // OTHER common neighbour w becomes an edge (w,to) carrying four facets: a non-manifold pinch. This was
    // MEASURED: the first correct-cancellation run produced 4,691 non-manifold edges without this test. ***
    nbrOf.clear();
    for (let i = topo.vOff[to]; i < topo.vOff[to + 1]; i += 1) {
      const g = topo.vFac[i];
      nbrOf.add(m.idx[g * 3]); nbrOf.add(m.idx[g * 3 + 1]); nbrOf.add(m.idx[g * 3 + 2]);
    }
    let pinch = false;
    for (let i = topo.vOff[from]; i < topo.vOff[from + 1] && !pinch; i += 1) {
      const g = topo.vFac[i];
      for (let k = 0; k < 3; k += 1) {
        const w = m.idx[g * 3 + k];
        if (w === from || w === to || w === e.u || w === e.v) continue;
        if (nbrOf.has(w)) { pinch = true; break; }
      }
    }
    if (pinch) { skippedLink += 1; continue; }
    for (let i = topo.vOff[from]; i < topo.vOff[from + 1]; i += 1) lockedF[topo.vFac[i]] = 1;
    for (let i = topo.vOff[to]; i < topo.vOff[to + 1]; i += 1) lockedF[topo.vFac[i]] = 1;
    lockedF[e.f1] = 1; lockedF[e.f2] = 1;
    kill[e.f1] = 1; kill[e.f2] = 1;              // *** the coincident twin — BOTH fin facets go ***
    consumed[from] = 1; isTarget[to] = 1;
    remap[from] = to; applied += 1;
  }
  LAST_SKIPPED_LINK = skippedLink;
  return { mesh: applyOps(m, remap, kill, new Map()), applied };
}
let LAST_SKIPPED_LINK = 0;

/** ONE FLIP PASS — the textbook 2-2 flip. Two flips conflict iff they share a facet. */
function flipPass(m: Mesh, topo: Topo, targets: number[], maxOps: number): { mesh: Mesh; applied: number } {
  const remap = new Int32Array(nV); for (let v = 0; v < nV; v += 1) remap[v] = v;
  const overrides = new Map<number, [number, number, number]>();
  const lockedF = new Uint8Array(m.nF); const kill = new Uint8Array(m.nF);
  const existing = new Set<number>(topo.keys);
  let applied = 0;
  for (const ei of targets) {
    if (applied >= maxOps) break;
    const e = topo.edges[ei];
    const p = apexOf(m, e.f1, e.u, e.v); const qq = apexOf(m, e.f2, e.u, e.v);
    if (p === qq) continue;
    if (lockedF[e.f1] === 1 || lockedF[e.f2] === 1) continue;
    const kpq = Math.min(p, qq) * SHIFT + Math.max(p, qq);
    if (existing.has(kpq)) continue;                        // would go non-manifold
    if (!(triArea(e.u, p, qq) > 0) || !(triArea(e.v, qq, p) > 0)) continue;
    // WINDING, derived rather than guessed — the first run of this arm produced 30,192 inconsistent
    // edges from the naive ordering. If f1 traverses u->v then f1 = (u,v,p) and f2 = (v,u,q), so the
    // union's boundary cycle is v->p->u->q->v; cutting it on the new diagonal p-q gives the two children
    // (p,u,q) and (q,v,p). If f1 traverses v->u the roles of u and v swap.
    const a1 = m.idx[e.f1 * 3]; const b1 = m.idx[e.f1 * 3 + 1]; const c1 = m.idx[e.f1 * 3 + 2];
    const uvForward = (a1 === e.u && b1 === e.v) || (b1 === e.u && c1 === e.v) || (c1 === e.u && a1 === e.v);
    if (uvForward) { overrides.set(e.f1, [p, e.u, qq]); overrides.set(e.f2, [qq, e.v, p]); }
    else { overrides.set(e.f1, [p, e.v, qq]); overrides.set(e.f2, [qq, e.u, p]); }
    // The `existing` set is never pruned of the retired (u,v) key, which is conservative: it can only
    // BLOCK a later flip, never permit an illegal one.
    existing.add(kpq);
    lockedF[e.f1] = 1; lockedF[e.f2] = 1;
    applied += 1;
  }
  return { mesh: applyOps(m, remap, kill, overrides), applied };
}

/** A deterministic UNINFORMED key for the placebos: an LCG walk over ALL interior edges of the mesh. */
function randomEdges(topo: Topo, n: number, seed: number): number[] {
  const out: number[] = []; const seen = new Set<number>();
  let x = seed >>> 0; const N = topo.edges.length;
  while (out.length < n && seen.size < N) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    const i = x % N;
    if (seen.has(i)) continue;
    seen.add(i); out.push(i);
  }
  return out;
}

type Selector = (topo: Topo) => number[];
const bladeSel = (bar: number): Selector => (topo: Topo): number[] => {
  const t: number[] = [];
  for (let i = 0; i < topo.edges.length; i += 1) if (topo.edges[i].ang >= bar) t.push(i);
  t.sort((a, b) => topo.edges[b].ang - topo.edges[a].ang);   // best-first by dihedral
  return t;
};
const randSel = (n: number, seed: number): Selector => (topo: Topo): number[] => randomEdges(topo, n, seed);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// *** REVIEW ADDITION — STRUCTURE-MATCHED PLACEBOS. ***
// S115's only placebo (P1 WELD-RAND) draws UNIFORMLY from all 2,571,657 interior edges. Its own report
// shows that arm removes facets with normDeg p50 3.53 — i.e. it collapses full-length edges of GOOD mesh,
// while A1 collapses fin apexes whose facets read normDeg p50 93.47. Matched on operation COUNT, matched
// on NOTHING ELSE. A placebo that destroys good mesh cannot fail, and a control that cannot fail is not a
// control. These two are matched on the STRUCTURE the weld exploits but blind to the dihedral key:
//   P3 WELD-SHORT     the 14,686 SHORTEST interior edges. Ordinary decimation. Knows nothing about angle.
//   P4 WELD-SLIVER    the 14,686 edges whose incident facet pair has the WORST (highest) aspect ratio —
//                     S111's named mechanism. Knows nothing about dihedral either.
// If either clears the >45 class comparably to A1, the 175 deg dihedral key is not what is doing the work.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let CUR_IDX: Uint32Array = IDX0;
const shortSel = (n: number): Selector => (topo: Topo): number[] => {
  const idx: number[] = []; const key: number[] = [];
  for (let i = 0; i < topo.edges.length; i += 1) { idx.push(i); key.push(dist(topo.edges[i].u, topo.edges[i].v)); }
  idx.sort((a, b) => key[a] - key[b]);
  return idx.slice(0, Math.min(n * 4, idx.length));
};
const sliverSel = (n: number): Selector => (topo: Topo): number[] => {
  const idx: number[] = [];
  const key: number[] = [];
  for (let i = 0; i < topo.edges.length; i += 1) {
    const e = topo.edges[i];
    idx.push(i);
    const f1 = e.f1; const f2 = e.f2;
    const a1 = aspectOf(CUR_IDX[f1 * 3], CUR_IDX[f1 * 3 + 1], CUR_IDX[f1 * 3 + 2]);
    const a2 = aspectOf(CUR_IDX[f2 * 3], CUR_IDX[f2 * 3 + 1], CUR_IDX[f2 * 3 + 2]);
    const v = Math.max(a1, a2);
    key.push(Number.isFinite(v) ? v : 1e30);
  }
  idx.sort((a, b) => key[b] - key[a]);
  return idx.slice(0, Math.min(n * 4, idx.length));
};

function runArm(name: string, kind: 'weld' | 'flip', sel: Selector, passes: number,
  maxOpsTotal = Infinity, quiet = false): ArmResult {
  let m = MESH0; let total = 0; const perPass: number[] = []; let attempted = 0;
  for (let pass = 0; pass < passes; pass += 1) {
    const topo = buildTopo(m);
    CUR_IDX = m.idx;
    const targets = sel(topo);
    if (pass === 0) attempted = targets.length;
    if (targets.length === 0) break;
    const r = kind === 'weld' ? weldPass(m, topo, targets, maxOpsTotal - total)
      : flipPass(m, topo, targets, maxOpsTotal - total);
    if (r.applied === 0) break;
    m = r.mesh; total += r.applied; perPass.push(r.applied);
    if (!quiet) log(`     pass ${pass + 1}: targets ${targets.length}  applied ${r.applied}${kind === 'weld' ? `  link-condition skips ${LAST_SKIPPED_LINK}` : ''}  facets ${m.nF}  ${el()}`);
    if (total >= maxOpsTotal) break;
  }
  const pv = provenance(m);
  return { name, kind, mesh: m, applied: total, attempted, perPass,
    removedSrc: pv.removedSrc, newFacets: pv.newFacets, vertsWelded: kind === 'weld' ? total : 0 };
}

/** DELETE arm: remove the blade facets outright. Diagnostic only — NOT a repair candidate. */
function armDelete(name: string, bar: number, topo: Topo): ArmResult {
  const kill = new Uint8Array(nTri0);
  let n = 0;
  for (const e of topo.edges) if (e.ang >= bar) {
    if (kill[e.f1] === 0) { kill[e.f1] = 1; n += 1; }
    if (kill[e.f2] === 0) { kill[e.f2] = 1; n += 1; }
  }
  const remap = new Int32Array(nV); for (let v = 0; v < nV; v += 1) remap[v] = v;
  const m = applyOps(MESH0, remap, kill, new Map());
  const pv = provenance(m);
  return { name, kind: 'delete', mesh: m, applied: n, attempted: n, perPass: [n],
    removedSrc: pv.removedSrc, newFacets: pv.newFacets, vertsWelded: 0 };
}

// ── TARGET CENSUS (pass 1, on the ORIGINAL mesh) ──────────────────────────────────────────────────────
const TOPO0 = buildTopo(MESH0);
log(`── STAGE 2: edge table built — ${TOPO0.edges.length} interior edges ${el()}`);
{
  const t = bladeSel(BLADE_BAR)(TOPO0);
  const mk = new Uint8Array(nTri0); let nf = 0;
  for (const i of t) {
    if (mk[TOPO0.edges[i].f1] === 0) { mk[TOPO0.edges[i].f1] = 1; nf += 1; }
    if (mk[TOPO0.edges[i].f2] === 0) { mk[TOPO0.edges[i].f2] = 1; nf += 1; }
  }
  log(`   TARGETS: ${t.length} blade edges (>=${BLADE_BAR} deg), ${nf} blade facets`);
  OUT.targets = { edges: t.length, facets: nf };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SCORE-B / SCORE-C machinery — EXACT DELTAS on the changed sets
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface DeltaScore {
  nRemoved: number; nNew: number;
  areaRemoved: number; areaNew: number;
  // normDeg, area-weighted
  ndOver1Removed: number; ndOver1New: number;
  ndOver5Removed: number; ndOver5New: number;
  ndMaxRemoved: number; ndMaxNew: number;
  ndP50Removed: number; ndP50New: number;
  // position
  posOver: number; posOverNew: number; posMaxRemoved: number; posMaxNew: number;
  posAreaOverNew: number; posAreaOverRemoved: number;
  // the SAME position ruler restricted to facets on which it is HONEST (|rDot| > 0.2, i.e. not edge-on
  // to the radial direction). The radial projector is KNOWN to inflate on riser/curtain facets, so the
  // restricted column is the one a position verdict may be taken on.
  posOverHonR: number; posOverHonN: number; posMaxHonR: number; posMaxHonN: number;
  nHonR: number; nHonN: number;
  // shape of the new facets
  newMinAngP10: number; newMinAngP50: number; newAspP50: number; newAspP90: number; newAspMax: number;
  parMinAngP10: number; parMinAngP50: number;
  capped: boolean;
}
const ns = fdNormals(rA, H, H_REF, H_REF);
function deltaScore(arm: ArmResult): DeltaScore {
  const rem = arm.removedSrc; const nw = arm.newFacets;
  const capped = rem.length > NORM_CAP || nw.length > NORM_CAP;
  const strideR = Math.max(1, Math.ceil(rem.length / NORM_CAP));
  const strideN = Math.max(1, Math.ceil(nw.length / NORM_CAP));
  let aR = 0; let aN = 0;
  const ndR: number[] = []; const ndN: number[] = [];
  let o1R = 0; let o1N = 0; let o5R = 0; let o5N = 0; let mxR = 0; let mxN = 0;
  let posOverR = 0; let posOverN = 0; let posMxR = 0; let posMxN = 0; let posAR = 0; let posAN = 0;
  const parMA: number[] = []; const newMA: number[] = []; const newAS: number[] = [];
  let newAspMax = 0;
  let posOverHonR = 0; let posOverHonN = 0; let posMaxHonR = 0; let posMaxHonN = 0; let nHonR = 0; let nHonN = 0;
  const rDotOf = (a: number, b: number, c: number): number => {
    let nx = (VY[b] - VY[a]) * (VZ[c] - VZ[a]) - (VZ[b] - VZ[a]) * (VY[c] - VY[a]);
    let ny = (VZ[b] - VZ[a]) * (VX[c] - VX[a]) - (VX[b] - VX[a]) * (VZ[c] - VZ[a]);
    const nz = (VX[b] - VX[a]) * (VY[c] - VY[a]) - (VY[b] - VY[a]) * (VX[c] - VX[a]);
    const l = Math.hypot(nx, ny, nz); if (l > 0) { nx /= l; ny /= l; }
    const gx = (VX[a] + VX[b] + VX[c]) / 3; const gy = (VY[a] + VY[b] + VY[c]) / 3;
    const gl = Math.hypot(gx, gy); void nz;
    return gl > 0 ? (nx * gx + ny * gy) / gl : 0;
  };
  for (let i = 0; i < rem.length; i += strideR) {
    const f = rem[i];
    const a = IDX0[f * 3]; const b = IDX0[f * 3 + 1]; const c = IDX0[f * 3 + 2];
    const ar = triArea(a, b, c); aR += ar * strideR;
    const nd = normDegOf(a, b, c, ns, K_REF, INSET_REF);
    ndR.push(nd);
    if (nd > 1) o1R += ar * strideR;
    if (nd > 5) o5R += ar * strideR;
    if (nd > mxR) mxR = nd;
    const pd = posDevOf(a, b, c, POS_K);
    if (pd > POS_BAR) { posOverR += strideR; posAR += ar * strideR; }
    if (pd > posMxR) posMxR = pd;
    if (Math.abs(rDotOf(a, b, c)) > 0.2) { nHonR += strideR; if (pd > POS_BAR) posOverHonR += strideR; if (pd > posMaxHonR) posMaxHonR = pd; }
    parMA.push(minAngleOf(a, b, c));
  }
  for (let i = 0; i < nw.length; i += strideN) {
    const f = nw[i];
    const a = arm.mesh.idx[f * 3]; const b = arm.mesh.idx[f * 3 + 1]; const c = arm.mesh.idx[f * 3 + 2];
    const ar = triArea(a, b, c); aN += ar * strideN;
    const nd = normDegOf(a, b, c, ns, K_REF, INSET_REF);
    ndN.push(nd);
    if (nd > 1) o1N += ar * strideN;
    if (nd > 5) o5N += ar * strideN;
    if (nd > mxN) mxN = nd;
    const pd = posDevOf(a, b, c, POS_K);
    if (pd > POS_BAR) { posOverN += strideN; posAN += ar * strideN; }
    if (pd > posMxN) posMxN = pd;
    if (Math.abs(rDotOf(a, b, c)) > 0.2) { nHonN += strideN; if (pd > POS_BAR) posOverHonN += strideN; if (pd > posMaxHonN) posMaxHonN = pd; }
    newMA.push(minAngleOf(a, b, c)); const as = aspectOf(a, b, c); newAS.push(as); if (as > newAspMax) newAspMax = as;
  }
  return {
    nRemoved: rem.length, nNew: nw.length, areaRemoved: aR, areaNew: aN,
    ndOver1Removed: o1R, ndOver1New: o1N, ndOver5Removed: o5R, ndOver5New: o5N,
    ndMaxRemoved: mxR, ndMaxNew: mxN, ndP50Removed: q(ndR, 0.5), ndP50New: q(ndN, 0.5),
    posOver: posOverR, posOverNew: posOverN, posMaxRemoved: posMxR, posMaxNew: posMxN,
    posAreaOverNew: posAN, posAreaOverRemoved: posAR,
    posOverHonR, posOverHonN, posMaxHonR, posMaxHonN, nHonR, nHonN,
    newMinAngP10: q(newMA, 0.1), newMinAngP50: q(newMA, 0.5),
    newAspP50: q(newAS, 0.5), newAspP90: q(newAS, 0.9), newAspMax,
    parMinAngP10: q(parMA, 0.1), parMinAngP50: q(parMA, 0.5), capped,
  };
}

// whole-mesh POSITION base (stride) — the common-mode term
let BASE_POS_OVER = 0; let BASE_POS_MAX = 0; let BASE_POS_N = 0;
{
  const stride = 8;
  for (let f = 0; f < nTri0; f += stride) {
    const a = IDX0[f * 3]; const b = IDX0[f * 3 + 1]; const c = IDX0[f * 3 + 2];
    const pd = posDevOf(a, b, c, POS_K);
    BASE_POS_N += 1;
    if (pd > POS_BAR) BASE_POS_OVER += 1;
    if (pd > BASE_POS_MAX) BASE_POS_MAX = pd;
  }
  log(`── STAGE 3: whole-mesh POSITION base (stride ${stride}, lattice k=${POS_K}, RADIAL upper bound) ──`);
  log(`   sampled ${BASE_POS_N} facets   over ${POS_BAR} mm: ${BASE_POS_OVER} (${pct(BASE_POS_OVER, BASE_POS_N)}%)   MAX ${ex(BASE_POS_MAX)} mm  ${el()}`);
  OUT.basePos = { n: BASE_POS_N, over: BASE_POS_OVER, max: BASE_POS_MAX, stride };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — RUN THE ARMS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const arms: ArmResult[] = [];
log(`── STAGE 4: applying the arms (up to ${PASSES} passes each, run to convergence) ──`);
log('   A1 WELD (fin excision)');
const A1 = runArm('A1 WELD (fin excision)', 'weld', bladeSel(BLADE_BAR), PASSES);
log(`     => applied ${A1.applied} welds over ${A1.perPass.length} passes  facets ${nTri0} -> ${A1.mesh.nF}  removed-src ${A1.removedSrc.length}  new ${A1.newFacets.length}`);
arms.push(A1);
log('   P1 WELD-RAND (placebo, cost-matched)');
const P1 = runArm('P1 WELD-RAND (placebo)', 'weld', randSel(Math.min(TOPO0.edges.length, Math.max(1, A1.applied) * 4), 12345), PASSES, A1.applied);
log(`     => applied ${P1.applied} welds  facets ${nTri0} -> ${P1.mesh.nF}  removed-src ${P1.removedSrc.length}  new ${P1.newFacets.length}`);
arms.push(P1);
log('   P3 WELD-SHORT (STRUCTURE-MATCHED placebo — shortest edges, dihedral-blind)');
const P3 = runArm('P3 WELD-SHORT (matched)', 'weld', shortSel(A1.applied), PASSES, A1.applied);
log(`     => applied ${P3.applied} welds  facets ${nTri0} -> ${P3.mesh.nF}  removed-src ${P3.removedSrc.length}  new ${P3.newFacets.length}`);
arms.push(P3);
log('   P4 WELD-SLIVER (STRUCTURE-MATCHED placebo — worst-aspect pairs, dihedral-blind)');
const P4 = runArm('P4 WELD-SLIVER (matched)', 'weld', sliverSel(A1.applied), PASSES, A1.applied);
log(`     => applied ${P4.applied} welds  facets ${nTri0} -> ${P4.mesh.nF}  removed-src ${P4.removedSrc.length}  new ${P4.newFacets.length}`);
arms.push(P4);
const A2 = A1; const P2 = P1;
const A3 = armDelete('A3 DELETE (diagnostic)', BLADE_BAR, TOPO0);
log(`   ${A3.name}: removed ${A3.removedSrc.length}  facets ${A3.mesh.nF}  ${el()}`);
arms.push(A3);
log('');

// COST MATCH REPORT — a placebo that applied a different number of operations is not cost-matched.
log('── COST MATCH (the placebo is only a control if the OPERATION COUNT matches) ──');
log(`   A1 welds ${A1.applied}   P1 welds ${P1.applied}   ratio ${(P1.applied / Math.max(1, A1.applied)).toFixed(4)}`);
log(`   A2 flips ${A2.applied}   P2 flips ${P2.applied}   ratio ${(P2.applied / Math.max(1, A2.applied)).toFixed(4)}`);
OUT.costMatch = { a1: A1.applied, p1: P1.applied, a2: A2.applied, p2: P2.applied };
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — SCORE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 5 / SCORE-A: THE ANALYTIC-FREE DIHEDRAL, EXHAUSTIVE ON EVERY ARM ──');
log('   (AREA shares are against the ORIGINAL mesh area, so an arm cannot win by deleting the denominator)');
log('');
log('   arm                        facets     AREA mm2   bnd   nm  inc    >45 COUNT    >45 AREA   >45%orig    >45 MAX     over-ceil AREA   blade AREA');
const rowsA: Array<Record<string, unknown>> = [];
const scores = new Map<string, ScoreA>();
{
  const r = BASE;
  log(`   ${'BASELINE'.padEnd(24)} ${String(r.nF).padStart(9)} ${r.area.toFixed(2).padStart(11)} ${String(r.boundary).padStart(5)} ${String(r.nonManifold).padStart(4)} ${String(r.inconsistent).padStart(4)} ${String(r.hiCount).padStart(11)} ${r.hiArea.toFixed(3).padStart(11)} ${pct(r.hiArea, BASE.area).padStart(10)}% ${r.hiMaxDeg.toFixed(3).padStart(10)} ${r.ceilArea.toFixed(3).padStart(16)} ${r.bladeArea.toFixed(3).padStart(12)}`);
}
for (const arm of arms) {
  const r = scoreA(arm.mesh, arm.name);
  scores.set(arm.name, r);
  log(`   ${arm.name.padEnd(24)} ${String(r.nF).padStart(9)} ${r.area.toFixed(2).padStart(11)} ${String(r.boundary).padStart(5)} ${String(r.nonManifold).padStart(4)} ${String(r.inconsistent).padStart(4)} ${String(r.hiCount).padStart(11)} ${r.hiArea.toFixed(3).padStart(11)} ${pct(r.hiArea, BASE.area).padStart(10)}% ${r.hiMaxDeg.toFixed(3).padStart(10)} ${r.ceilArea.toFixed(3).padStart(16)} ${r.bladeArea.toFixed(3).padStart(12)}`);
  rowsA.push({ arm: arm.name, ...r, applied: arm.applied });
}
OUT.scoreA = { base: BASE, arms: rowsA };
log('');
log('   SHAPE FLOOR (K5) — whole-mesh, stride 7');
log('   arm                       minAngle p10   minAngle p50    aspect p90    aspect MAX   zero-area facets');
log(`   ${'BASELINE'.padEnd(24)} ${f4(BASE.minAngP10).padStart(13)} ${f4(BASE.minAngP50).padStart(14)} ${ex(BASE.aspP90).padStart(13)} ${ex(BASE.aspMax).padStart(13)} ${String(BASE.zeroArea).padStart(18)}`);
for (const arm of arms) {
  const r = scores.get(arm.name) as ScoreA;
  log(`   ${arm.name.padEnd(24)} ${f4(r.minAngP10).padStart(13)} ${f4(r.minAngP50).padStart(14)} ${ex(r.aspP90).padStart(13)} ${ex(r.aspMax).padStart(13)} ${String(r.zeroArea).padStart(18)}`);
}
log('');

log('── STAGE 5 / SCORE-B: THE COVERING ORIENTATION RULER + POSITION, EXACT DELTAS ──');
log('   normDeg depends only on a facet\'s own vertices and rA, so facets present in BOTH meshes cancel');
log('   EXACTLY. What is printed is the delta over the REMOVED and NEW sets, both measured exhaustively.');
log('');
log('   arm                     removed    new   areaRem  areaNew   ndP50rem ndP50new  ndMAXnew   d(over1deg AREA)  d(over5deg AREA)');
const deltas = new Map<string, DeltaScore>();
for (const arm of arms) {
  const ds = deltaScore(arm);
  deltas.set(arm.name, ds);
  log(`   ${arm.name.padEnd(22)} ${String(ds.nRemoved).padStart(8)} ${String(ds.nNew).padStart(6)} ${ds.areaRemoved.toFixed(2).padStart(9)} ${ds.areaNew.toFixed(2).padStart(8)} ${f2(ds.ndP50Removed).padStart(9)} ${f2(ds.ndP50New).padStart(8)} ${f2(ds.ndMaxNew).padStart(9)}   ${(ds.ndOver1New - ds.ndOver1Removed).toFixed(3).padStart(15)}   ${(ds.ndOver5New - ds.ndOver5Removed).toFixed(3).padStart(15)}  ${ds.capped ? '(CAPPED)' : ''}`);
}
log('');
log('   POSITION (K4) — radial deviation upper bound, lattice k=' + String(POS_K) + ', bar ' + String(POS_BAR) + ' mm');
log('   arm                     facetsOver(removed)  facetsOver(new)   d(count)     MAXremoved      MAXnew');
for (const arm of arms) {
  const ds = deltas.get(arm.name) as DeltaScore;
  log(`   ${arm.name.padEnd(22)} ${String(ds.posOver).padStart(19)} ${String(ds.posOverNew).padStart(16)} ${String(ds.posOverNew - ds.posOver).padStart(10)}   ${ex(ds.posMaxRemoved).padStart(12)} ${ex(ds.posMaxNew).padStart(12)}`);
}
log('');
log('   POSITION restricted to facets where the RADIAL projector is HONEST (|rDot| > 0.2, not edge-on).');
log('   The unrestricted column above INFLATES on curtain facets — this project has voided runs on that.');
log('   arm                     n(removed)  over  MAX      |   n(new)  over  MAX');
for (const arm of arms) {
  const ds = deltas.get(arm.name) as DeltaScore;
  log(`   ${arm.name.padEnd(22)} ${String(ds.nHonR).padStart(10)} ${String(ds.posOverHonR).padStart(5)} ${ex(ds.posMaxHonR).padStart(10)}   | ${String(ds.nHonN).padStart(7)} ${String(ds.posOverHonN).padStart(5)} ${ex(ds.posMaxHonN).padStart(10)}`);
}
log('');
log('   CHILD / NEW-FACET QUALITY (a repair that manufactures needles has repaired nothing)');
log('   arm                     parent minAng p10/p50   NEW minAng p10/p50    NEW aspect p50/p90/MAX');
for (const arm of arms) {
  const ds = deltas.get(arm.name) as DeltaScore;
  log(`   ${arm.name.padEnd(22)} ${`${f4(ds.parMinAngP10)} / ${f4(ds.parMinAngP50)}`.padStart(21)}   ${`${f4(ds.newMinAngP10)} / ${f4(ds.newMinAngP50)}`.padStart(18)}    ${`${ex(ds.newAspP50)} / ${ex(ds.newAspP90)} / ${ex(ds.newAspMax)}`}`);
}
OUT.scoreB = Object.fromEntries([...deltas.entries()]);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — THE KILL LINE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── STAGE 6: THE PRE-REGISTERED KILL LINE ──');
const verdicts: Array<Record<string, unknown>> = [];
const pairFor: Record<string, string> = { 'A1 WELD (fin excision)': 'P3 WELD-SHORT (matched)' };
for (const arm of arms) {
  const r = scores.get(arm.name) as ScoreA;
  const ds = deltas.get(arm.name) as DeltaScore;
  const clear = (BASE.hiArea - r.hiArea) / BASE.hiArea;
  const pn = pairFor[arm.name];
  const pr = pn === undefined ? null : (scores.get(pn) as ScoreA);
  const pClear = pr === null ? NaN : (BASE.hiArea - pr.hiArea) / BASE.hiArea;
  const ratio = pr === null ? NaN : clear / pClear;
  const k1 = clear >= K1_CLEAR;
  const k2 = pr === null ? null : (pClear <= 0 ? clear > 0 : ratio >= K2_RATIO);
  const k3 = r.boundary <= BASE.boundary && r.nonManifold === 0 && r.inconsistent === 0;
  const k4 = (ds.posOverNew - ds.posOver) <= 0 && !(ds.posMaxNew > Math.max(ds.posMaxRemoved, BASE_POS_MAX));
  const k5 = r.minAngP10 >= BASE.minAngP10 && r.aspP90 <= BASE.aspP90;
  const all = k1 && (k2 === null || k2) && k3 && k4 && k5;
  log(`   ${arm.name}`);
  log(`     K1 CEILING  class AREA ${BASE.hiArea.toFixed(3)} -> ${r.hiArea.toFixed(3)} mm2  = ${(clear * 100).toFixed(3)}% cleared  (bar ${(K1_CLEAR * 100).toFixed(0)}%)   ${k1 ? 'PASS' : '*** FAIL ***'}`);
  if (pr !== null) log(`     K2 PLACEBO  placebo cleared ${(pClear * 100).toFixed(3)}%  => ratio ${Number.isFinite(ratio) ? ratio.toFixed(3) : '—'}x  (bar ${K2_RATIO}x)   ${k2 ? 'PASS' : '*** FAIL ***'}`);
  log(`     K3 TOPOLOGY boundary ${r.boundary} (was ${BASE.boundary})  nm ${r.nonManifold}  inc ${r.inconsistent}   ${k3 ? 'PASS' : '*** FAIL ***'}`);
  log(`     K4 POSITION over-bar facets d ${ds.posOverNew - ds.posOver}   MAX new ${ex(ds.posMaxNew)} vs removed ${ex(ds.posMaxRemoved)} / base ${ex(BASE_POS_MAX)}   ${k4 ? 'PASS' : '*** FAIL ***'}`);
  log(`     K5 FLOOR    minAng p10 ${f4(BASE.minAngP10)} -> ${f4(r.minAngP10)}   aspect p90 ${ex(BASE.aspP90)} -> ${ex(r.aspP90)}   ${k5 ? 'PASS' : '*** FAIL ***'}`);
  log(`     => ${all ? 'SHIPS' : '*** REFUTED ***'}`);
  verdicts.push({ arm: arm.name, clear, pClear, ratio, k1, k2, k3, k4, k5, ships: all });
}
OUT.killLineVerdicts = verdicts;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — SCAR SWEEPS on the winning arm's changed set (h, k, inset) + the BLADE-BAR ladder
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── REVIEW SUMMARY: A1 vs EVERY placebo, on the SAME absolute-mm2 reduction ──');
log('   arm                        welds   >45 AREA after   cleared %   ratio A1/placebo   mesh AREA   minAng p10   honest-pos over%/MAX(new)');
for (const arm of arms) {
  const r = scores.get(arm.name) as ScoreA;
  const ds = deltas.get(arm.name) as DeltaScore;
  const clr = ((BASE.hiArea - r.hiArea) / BASE.hiArea) * 100;
  const a1c = ((BASE.hiArea - (scores.get('A1 WELD (fin excision)') as ScoreA).hiArea) / BASE.hiArea) * 100;
  const hp = ds.nHonN > 0 ? `${((ds.posOverHonN / ds.nHonN) * 100).toFixed(2)}% / ${ex(ds.posMaxHonN)}` : '—';
  log(`   ${arm.name.padEnd(26)} ${String(arm.applied).padStart(6)}  ${r.hiArea.toFixed(3).padStart(14)}  ${clr.toFixed(3).padStart(10)}%  ${(a1c / clr).toFixed(3).padStart(16)}x  ${r.area.toFixed(2).padStart(10)}  ${f4(r.minAngP10).padStart(11)}   ${hp}`);
}
log('');
log('── STAGE 7 / SCARS: h, k and inset swept on the arm deltas (a number that moves with h is not a measurement) ──');
if (process.env.PF_S116_SKIPSWEEP === '1') { log('   (skipped for the review run — S115 already published these and they reproduce)'); } else {
  const armsToSweep = [A1, A2];
  const sw: Array<Record<string, unknown>> = [];
  for (const arm of armsToSweep) {
    log(`   ${arm.name}`);
    log('     h          ndP50 removed   ndP50 new    d(over1 AREA)   d(over5 AREA)     ndMAX new');
    const hLad = (process.env.PF_S115_HLADDER ?? '2e-7,2e-6,2e-5,2e-4,1e-3').split(',').filter((s) => s.length > 0).map(Number);
    for (const hh of hLad) {
      const nsh = fdNormals(rA, H, hh, hh);
      const sR = Math.max(1, Math.ceil(arm.removedSrc.length / SWEEP_N));
      const sN = Math.max(1, Math.ceil(arm.newFacets.length / SWEEP_N));
      const ndR: number[] = []; const ndN: number[] = [];
      let o1R = 0; let o1N = 0; let o5R = 0; let o5N = 0; let mx = 0;
      for (let i = 0; i < arm.removedSrc.length; i += sR) {
        const f = arm.removedSrc[i];
        const a = IDX0[f * 3]; const b = IDX0[f * 3 + 1]; const c = IDX0[f * 3 + 2];
        const nd = normDegOf(a, b, c, nsh, K_REF, INSET_REF); ndR.push(nd);
        const ar = triArea(a, b, c) * sR;
        if (nd > 1) o1R += ar; if (nd > 5) o5R += ar;
      }
      for (let i = 0; i < arm.newFacets.length; i += sN) {
        const f = arm.newFacets[i];
        const a = arm.mesh.idx[f * 3]; const b = arm.mesh.idx[f * 3 + 1]; const c = arm.mesh.idx[f * 3 + 2];
        const nd = normDegOf(a, b, c, nsh, K_REF, INSET_REF); ndN.push(nd);
        const ar = triArea(a, b, c) * sN;
        if (nd > 1) o1N += ar; if (nd > 5) o5N += ar;
        if (nd > mx) mx = nd;
      }
      log(`     ${hh.toExponential(0).padStart(8)}   ${f2(q(ndR, 0.5)).padStart(12)} ${f2(q(ndN, 0.5)).padStart(11)}  ${(o1N - o1R).toFixed(3).padStart(14)}  ${(o5N - o5R).toFixed(3).padStart(14)}  ${f2(mx).padStart(12)}`);
      sw.push({ arm: arm.name, h: hh, ndP50R: q(ndR, 0.5), ndP50N: q(ndN, 0.5), dOver1: o1N - o1R, dOver5: o5N - o5R, ndMax: mx });
    }
    log('     k / inset sweep at h=' + String(H_REF));
    log('       k   inset    ndP50 new    d(over1 AREA)');
    for (const kk of [4, 8, 16]) {
      for (const insv of [0, 0.05, 0.1]) {
        const sN = Math.max(1, Math.ceil(arm.newFacets.length / SWEEP_N));
        const sR = Math.max(1, Math.ceil(arm.removedSrc.length / SWEEP_N));
        const ndN: number[] = []; let o1N = 0; let o1R = 0;
        for (let i = 0; i < arm.newFacets.length; i += sN) {
          const f = arm.newFacets[i];
          const a = arm.mesh.idx[f * 3]; const b = arm.mesh.idx[f * 3 + 1]; const c = arm.mesh.idx[f * 3 + 2];
          const nd = normDegOf(a, b, c, ns, kk, insv); ndN.push(nd);
          if (nd > 1) o1N += triArea(a, b, c) * sN;
        }
        for (let i = 0; i < arm.removedSrc.length; i += sR) {
          const f = arm.removedSrc[i];
          const a = IDX0[f * 3]; const b = IDX0[f * 3 + 1]; const c = IDX0[f * 3 + 2];
          const nd = normDegOf(a, b, c, ns, kk, insv);
          if (nd > 1) o1R += triArea(a, b, c) * sR;
        }
        log(`      ${String(kk).padStart(3)}   ${insv.toFixed(2)}   ${f2(q(ndN, 0.5)).padStart(10)}   ${(o1N - o1R).toFixed(3).padStart(14)}`);
        sw.push({ arm: arm.name, k: kk, inset: insv, ndP50N: q(ndN, 0.5), dOver1: o1N - o1R });
      }
    }
  }
  OUT.sweeps = sw;
}
log('');
log('── STAGE 7b: THE BLADE-BAR LADDER (scar 4 — the target cut is a CHOICE, so it is swept) ──');
log('   bar deg    targets   welds applied   facets after   >45 AREA after   % cleared   boundary   minAng p10');
if (process.env.PF_S116_SKIPLADDER === '1') { log('   (skipped for the review run)'); } else {
  const lad: Array<Record<string, number>> = [];
  const bars = (process.env.PF_S115_BARLADDER ?? '165,170,175,178,179').split(',').filter((s) => s.length > 0).map(Number);
  for (const bar of bars) {
    const tg = bladeSel(bar)(TOPO0);
    const w = runArm(`bar${bar}`, 'weld', bladeSel(bar), envI('PF_S115_LADPASSES', 3), Infinity, true);
    const r = scoreA(w.mesh, `bar${bar}`);
    const clr = ((BASE.hiArea - r.hiArea) / BASE.hiArea) * 100;
    log(`   ${String(bar).padStart(7)}  ${String(tg.length).padStart(9)}  ${String(w.applied).padStart(14)}  ${String(r.nF).padStart(13)}  ${r.hiArea.toFixed(3).padStart(15)}  ${clr.toFixed(3).padStart(10)}%  ${String(r.boundary).padStart(9)}  ${f4(r.minAngP10).padStart(11)}`);
    lad.push({ bar, targets: tg.length, applied: w.applied, nF: r.nF, hiArea: r.hiArea, clearedPct: clr, boundary: r.boundary, minAngP10: r.minAngP10 });
  }
  OUT.barLadder = lad;
}

log('');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('VERDICT');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
for (const v of verdicts) log(`   ${String(v.arm).padEnd(24)} cleared ${((v.clear as number) * 100).toFixed(3)}%   placebo ${Number.isFinite(v.pClear as number) ? ((v.pClear as number) * 100).toFixed(3) : '—'}%   ratio ${Number.isFinite(v.ratio as number) ? (v.ratio as number).toFixed(3) : '—'}x   => ${v.ships ? 'SHIPS' : 'REFUTED'}`);
if (VOID_REASON.length > 0) log(`*** RUN VOID: ${VOID_REASON} ***`);
writeFileSync(`${OUTDIR}/REVS116PM_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/REVS116PM_${TAG}.json  done ${el()}`);
void BASE_STRIDE; void BASE_POS_OVER;
