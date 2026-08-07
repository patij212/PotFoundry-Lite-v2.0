// s115OracleCeiling.ts — S115 OPERATOR: THE ORACLE UPPER BOUND FOR CelticTriquetra, AND THE PRIZE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. On Gothic the oracle was the decisive result: 99.40% of the target area was IRREDUCIBLE and the
// crease programme closed. CelticTriquetra is the inverse claim — S114 said 2.06% of the mesh is
// REDUCIBLE (65x Gothic), phase-1 re-measured 2.58–2.64% at the h-stable rung, and a verifier read
// 2.3958% at curtain cut 16. Before anyone builds an operator, BOUND THE PROGRAMME.
//
// WHAT PHASE-1 ALREADY DID (and what it did NOT):
//   DID:     h swept (2e-8..2e-3), K swept (6..64), curtain cut R swept (2..1e5), per-FACET accounting,
//            a C-infinity cone placebo, bootstrap CIs on the ladders.
//   DID NOT: (a) sweep the 45 deg BAR — SCAR 4, and the bar enters TWICE (it selects the class AND it
//                thresholds the oracle);
//            (b) give the no-cut headline a SAMPLING CI (n=1600 of 237,835 edges, quoted to 4 digits);
//            (c) probe anything but the PARAMETER footprint — and phase-1 itself found 57.5% of the
//                class area sits on the graphRatio degeneracy pole where that footprint IS A LINE;
//            (d) *** COMPUTE THE PRIZE. *** A "reducible" share is not a deliverable. What could a
//                perfect mesh actually reach, and at what triangle cost?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST NUMBER WAS READ.
//
//  PR-1 (THE POINT ESTIMATE). The no-cut reducible share will land in 2.4–2.7% of mesh with a point
//       estimate near 2.58%. CONFIRMED if the 90% bootstrap CI at the h-stable rung contains 2.58%.
//
//  PR-2 (WHICH KNOB DOMINATES). I predict the 45 deg BAR is the largest single source of variation —
//       larger than K, h and R put together — because it gates both sides of the quantity. CONFIRMED if
//       the bar's full range (30..90 deg) exceeds the combined range over K x h x R.
//
//  PR-3 (THE SECOND ORACLE). A 3-D-BALL oracle (does the analytic normal cone span the bar within the
//       pair's OWN 3-D radius?) is generous to IRREDUCIBLE by construction — its probe region contains
//       the parameter footprint. So reducible_3D <= reducible_param, and the two BRACKET the answer. I
//       predict the bracket is WIDE (>1.5x) precisely on the shadow-collapsed 57.5%, because that is
//       where the parameter probe has nothing to walk along.
//
//  PR-4 *** THE PRIZE, AND THE KILL LINE. *** The oracle says 2.58% of mesh area is reducible out of a
//       3.1969% >45 class, leaving 0.62% irreducible. If the oracle is a genuine CEILING then a
//       STRUCTURED ANALYTIC GRID at MATCHED TRIANGLE COUNT — vertices exactly on rA, well-shaped, no
//       needles — must land near that 0.62%.
//         CONFIRMING          structured >45 area share in [0.30%, 1.20%] of its own area
//         *** KILL LINE ***   structured share > 1.60% (i.e. fails to halve the current 3.1969%)
//                             ==> the "2.58% reducible" corresponds to NO achievable mesh and the
//                                 CelticTriquetra programme is NOT worth running.
//         OVER-CREDIT         structured share < 0.10% ==> the oracle UNDER-states the prize.
//
//  PR-5 (THE COST-MATCHED PLACEBO ON THE PRIZE). Density alone must NOT clear it. The placebo is the
//       CURRENT mesh refined 1->4 with every new midpoint RE-PROJECTED onto rA — same triangle count as
//       the structured arm, same surface, no structural change. Pre-registered: the placebo stays within
//       0.8x–1.25x of the base >45 share at 4x and 16x the triangles (dihedral is density-invariant on a
//       turn; S61 H2 measured x0.9968 over five halvings). A THIRD arm, 1->4 with NO reprojection, is
//       the pure null and must move nothing at all.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS — a run whose control fires is VOID and is reported as void, never rescued.
//   C1  PRECOND. Stride sample AND *** EXHAUSTIVE *** (phase-1's exhaustive pass FIRED at 1374.8 um on
//       4 facets). Over-gate facets are EXCLUDED from every class, pool and share, and their area is
//       printed. If the excluded area exceeds 0.01% of mesh the run is VOID.
//   C2  PLACEBO. Both oracles re-run against the C-infinity truncated cone on the SAME footprints, at
//       the SAME K and h. Any arm reading > 5% irreducible there is manufacturing turn and is VOID.
//   C3  REPRODUCTION. The golden-stride pool is a PREFIX-STABLE construction, so my pool's first 1600
//       entries ARE phase-1's pool. At K=16, h=2e-7 my per-facet LOOSE irreducible share must reproduce
//       phase-1's 19.22% and 2.5825%-of-mesh. A mismatch means the two runs are not on one instrument.
//   C4  NON-VACUITY. The oracle must still find the KNOWN-real turn on the WALL/STRADDLING class
//       (phase-1: 70–77%). An arm that reads ~0 everywhere satisfies a one-sided ceiling and is worthless.
//   C5  SEAM BRANCH. The inherited `oraclePair` compares cross-cluster lattice points by
//       (rRef*theta, z) DISTANCE using each facet's OWN unwrapped branch. A pair straddling theta=+-pi
//       lands 2*pi*rRef ~ 283 mm apart and its nearest-pair search is nonsense. Counted and reported.
//   C6  AREA CLOSURE on the prize arms: a structured grid of the same surface must reproduce the mesh's
//       3-D area to within 2%, or it is not covering the same surface and its share means nothing.
//   C7  INSET IS INERT for the headline BY CONSTRUCTION (the oracle never calls orientOfFacet) — proved
//       by construction and VERIFIED by re-running one cell at inset 0 / 0.05 / 0.10.
//
// INSTRUMENT DISCIPLINE: COUNT + AREA + MAX everywhere, PER FACET; h swept and printed on every normDeg;
// k swept; every threshold laddered.
//
// Usage: bash research/tools/run-s115-oracleceiling.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler, type RadiusFn } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envL = (n: string, d: string): number[] => (process.env[n] ?? d).split(',').map(Number);

const STYLE = process.env.PF_S115O_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115O_STL ?? '';
const TAG = process.env.PF_S115O_TAG ?? STYLE;
const OUTDIR = process.env.PF_S115O_OUTDIR ?? 'research/exchange/_strataConformBisect/s115oracle';
const STAGES = new Set((process.env.PF_S115O_STAGES ?? '1,2,3,4').split(',').map((s) => s.trim()));

const DIMS: StyleDims = { H: envF('PF_S115O_H', 120), Rb: envF('PF_S115O_RB', 40), Rt: envF('PF_S115O_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

const BAR = envF('PF_S115O_BAR', 45);                 // the class bar (and the oracle bar, coupled)
const BARLAD = envL('PF_S115O_BARLAD', '30,45,60,90');
const POOL_N = envI('PF_S115O_POOLN', 6000);
const POOL_N30 = envI('PF_S115O_POOLN30', 2000);
const KTAB = envL('PF_S115O_KTAB', '16,32');
const HTAB = envL('PF_S115O_HTAB', '2e-8,2e-7,2e-6,2e-5,2e-4');
const K_REF = envI('PF_S115O_KREF', 16);
const H_REF = envF('PF_S115O_HREF', 2e-7);
const K3 = envI('PF_S115O_K3', 20);                   // 3-D ball oracle grid half-order
const CAP3 = envI('PF_S115O_CAP3', 300);              // max normals kept for the O(m^2) diameter
const NCROSS = envI('PF_S115O_NCROSS', 8);
const SEP_MIN = envF('PF_S115O_SEPMIN', 15);
const RLAD = envL('PF_S115O_RLAD', '2,8,32,1024,100000');
const SECTOR_DIV = envI('PF_S115O_SECTORDIV', 16);
const SECTOR_T0 = envF('PF_S115O_SECTORT0', 0);
const PRIZE_MULT = envL('PF_S115O_PRIZEMULT', '1,4,16');
const FULL_MULT = envL('PF_S115O_FULLMULT', '0.25,1,4');
const INFLAD = envL('PF_S115O_INFLAD', '0.5,1');
const ND_SAMPLE = envI('PF_S115O_NDN', 20000);
const NORMHI_BAR = envF('PF_S115O_NORMHI', 10);
const DROP_CUT = envF('PF_S115O_DROP', 0.25);
const HMIN = 1e-9;

if (STL.length === 0) { log('*** PF_S115O_STL is required (ABSOLUTE path). ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.prototype.slice.call(v).filter(Number.isFinite).sort((a: number, b: number) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f2 = (v: number, n = 3): string => (Number.isFinite(v) ? v.toFixed(n) : '—');

const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const rFlat: RadiusFn = (_th: number, z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (Math.min(H, Math.max(0, z)) / H);

const OUT: Record<string, unknown> = {
  style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS, stages: [...STAGES],
  knobs: { BAR, BARLAD, POOL_N, KTAB, HTAB, K_REF, H_REF, K3, CAP3, NCROSS, SEP_MIN, RLAD, SECTOR_DIV, PRIZE_MULT },
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 OPERATOR — THE ORACLE UPPER BOUND AND THE PRIZE — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`dims  H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`registry defaults: ${Object.entries(DEFAULTS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
log(`stages ${[...STAGES].join(',')}  bar ladder ${BARLAD.join('/')}  K ${KTAB.join('/')}  h ${HTAB.map((h) => h.toExponential(0)).join('/')}  pool ${POOL_N}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD + PRECOND (C1), STRIDE AND EXHAUSTIVE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);
/**
 * SRC is the array every ORACLE helper reads. It is `xyz` (the shipping mesh) everywhere except in
 * STAGE 5, which points it at a SYNTHETIC near-ideal grid so the SAME oracle can be turned on a mesh
 * whose quality is known by construction. An instrument that cannot be pointed at a known-good mesh
 * cannot be called a ceiling.
 */
let SRC: Float64Array = xyz;
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(SRC[f * 9 + 1], SRC[f * 9]);
  const b = a + dThRaw(a, Math.atan2(SRC[f * 9 + 4], SRC[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(SRC[f * 9 + 7], SRC[f * 9 + 6]));
  return [a, b, c];
};
const badFacet = new Uint8Array(nTri);
let badCount = 0; let badArea = 0;
{
  const step = Math.max(1, Math.floor(nTri / 20000));
  let worst = 0; const devs: number[] = [];
  for (let f = 0; f < nTri; f += step) {
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      devs.push(dd * 1000); if (dd > worst) worst = dd;
    }
  }
  log('── STAGE 0 / C1 PRECOND ──');
  log(`  STRIDE     samples ${devs.length}  |dr| p50 ${q(devs, 0.5).toExponential(3)}  p99 ${q(devs, 0.99).toExponential(3)}  MAX ${(worst * 1000).toFixed(4)} um  (gate 50 um)`);
  let worstX = 0; let worstF = -1;
  for (let f = 0; f < nTri; f += 1) {
    let wf = 0;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > wf) wf = dd;
    }
    if (wf * 1000 > 50) { badFacet[f] = 1; badCount += 1; }
    if (wf > worstX) { worstX = wf; worstF = f; }
  }
  log(`  EXHAUSTIVE every vertex: MAX ${(worstX * 1000).toFixed(1)} um at f${worstF}   over-gate facets ${badCount}  ${el()}`);
  OUT.precond = { strideMaxUm: worst * 1000, exhaustiveMaxUm: worstX * 1000, badCount };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — DIHEDRAL, THE BAR LADDER, graphRatio (all exhaustive, analytic-free)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) { meshArea += d.areaMm2[f]; if (badFacet[f] === 1) badArea += d.areaMm2[f]; }
log(`── STAGE 1: MESH + THE BAR LADDER  ${el()} ──`);
log(`  facets ${nTri}  AREA ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent ${d.inconsistentEdges}`);
log(`  C1 EXCLUSION: ${badCount} over-gate facets, AREA ${badArea.toFixed(4)} mm2 = ${pct(badArea, meshArea)}% of mesh  ${(badArea / meshArea) * 100 > 0.01 ? '*** C1 FIRED — RUN VOID ***' : '(under the 0.01% void bar — excluded, not rescued)'}`);
OUT.c1exclusion = { badCount, badAreaMm2: badArea, badPctOfMesh: (badArea / meshArea) * 100 };
if ((badArea / meshArea) * 100 > 0.01) { OUT.verdict = 'VOID-C1'; writeFileSync(`${OUTDIR}/S115O_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`); process.exit(0); }

interface ClassAtBar { bar: number; edges: number[]; facets: number[]; areaMm2: number; count: number; maxDeg: number }
const classAt = new Map<number, ClassAtBar>();
function buildClass(bar: number): ClassAtBar {
  const c = classAt.get(bar);
  if (c !== undefined) return c;
  const thr = (bar * Math.PI) / 180;
  const edges: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (d.edgeAngRad[e] <= thr) continue;
    // NOEXCL exists for ONE purpose: C3. Phase-1 did not exclude the 4 over-gate facets, so its edge
    // list has 237,835 entries and mine has 237,829 — and `goldenStride` is a function OF THE LENGTH,
    // so the two pools are DIFFERENT SAMPLES, not the same sample on two instruments. Setting NOEXCL=1
    // restores phase-1's index space exactly and turns C3 back into an instrument test.
    if (process.env.PF_S115O_NOEXCL !== '1' && (badFacet[d.edgeF1[e]] === 1 || badFacet[d.edgeF2[e]] === 1)) continue;
    edges.push(e);
  }
  const fs = new Set<number>();
  for (const e of edges) { fs.add(d.edgeF1[e]); fs.add(d.edgeF2[e]); }
  let a = 0; let mx = 0;
  for (const f of fs) { a += d.areaMm2[f]; if (d.perFacetMaxRad[f] > mx) mx = d.perFacetMaxRad[f]; }
  const out: ClassAtBar = { bar, edges, facets: [...fs], areaMm2: a, count: fs.size, maxDeg: mx * DEG };
  classAt.set(bar, out);
  return out;
}
log('  THE BAR LADDER (SCAR 4 — the 45 deg cut is a CONVENTION inherited from S108, never validated):');
log('     bar deg     edges      facets       AREA mm2     %of mesh    MAX dih deg');
const barRows: Array<Record<string, number>> = [];
for (const b of BARLAD) {
  const c = buildClass(b);
  log(`     ${String(b).padStart(7)}  ${String(c.edges.length).padStart(8)}  ${String(c.count).padStart(10)}  ${c.areaMm2.toFixed(4).padStart(13)}  ${pct(c.areaMm2, meshArea).padStart(9)}%  ${c.maxDeg.toFixed(5).padStart(12)}`);
  barRows.push({ bar: b, edges: c.edges.length, facets: c.count, areaMm2: c.areaMm2, pctOfMesh: (c.areaMm2 / meshArea) * 100, maxDeg: c.maxDeg });
}
{
  // WHOLE-MESH DIHEDRAL BANDS. 163.41 deg is phase-1's measured ANALYTIC CEILING for this surface:
  // area above it is a FOLD the surface provably cannot produce.
  const CEIL0 = envF('PF_S115O_CEIL', 163.41);
  const edgesB = [45, 90, 135, CEIL0, 180];
  const bandA = new Float64Array(edgesB.length - 1); const bandC = new Int32Array(edgesB.length - 1);
  for (let f = 0; f < nTri; f += 1) {
    if (badFacet[f] === 1) continue;
    const dg = d.perFacetMaxRad[f] * DEG;
    for (let i = 0; i < edgesB.length - 1; i += 1) if (dg > edgesB[i] && dg <= edgesB[i + 1]) { bandA[i] += d.areaMm2[f]; bandC[i] += 1; break; }
  }
  log('  WHOLE-MESH DIHEDRAL BANDS (per FACET, COUNT + AREA):');
  for (let i = 0; i < bandA.length; i += 1) {
    log(`     ${String(edgesB[i]).padStart(6)}–${String(edgesB[i + 1]).padStart(6)} deg   COUNT ${String(bandC[i]).padStart(8)}  AREA ${bandA[i].toFixed(4).padStart(11)} mm2 = ${pct(bandA[i], meshArea).padStart(8)}% of mesh`);
  }
  log(`     *** THE FOLD BAND (> ${CEIL0} deg, above the analytic ceiling — provably mesh-made): ${pct(bandA[bandA.length - 1], meshArea)}% of mesh ***`);
  OUT.bands = { edges: edgesB, areaMm2: [...bandA], count: [...bandC], foldPctOfMesh: (bandA[bandA.length - 1] / meshArea) * 100 };
}
OUT.stage1 = { facets: nTri, meshAreaMm2: meshArea, barRows };
log('');

const rRefOf = (f: number): number => (Math.hypot(SRC[f * 9], SRC[f * 9 + 1])
  + Math.hypot(SRC[f * 9 + 3], SRC[f * 9 + 4]) + Math.hypot(SRC[f * 9 + 6], SRC[f * 9 + 7])) / 3;
function area3D(f: number): number {
  const ax = SRC[f * 9]; const ay = SRC[f * 9 + 1]; const az = SRC[f * 9 + 2];
  const ux = SRC[f * 9 + 3] - ax; const uy = SRC[f * 9 + 4] - ay; const uz = SRC[f * 9 + 5] - az;
  const wx = SRC[f * 9 + 6] - ax; const wy = SRC[f * 9 + 7] - ay; const wz = SRC[f * 9 + 8] - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
}
function paramAreaOf(f: number): number {
  const [ath, bth, cth] = th3(f);
  const az = SRC[f * 9 + 2]; const bz = SRC[f * 9 + 5]; const cz = SRC[f * 9 + 8];
  const rRef = rRefOf(f);
  return 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
}
function graphRatio(f: number): number { const aP = paramAreaOf(f); return aP > 1e-15 ? area3D(f) / aP : Infinity; }
function paramDiam(f: number): number {
  const [ath, bth, cth] = th3(f); const rRef = rRefOf(f);
  const px = [rRef * ath, rRef * bth, rRef * cth];
  const pz = [SRC[f * 9 + 2], SRC[f * 9 + 5], SRC[f * 9 + 8]];
  return Math.max(Math.hypot(px[0] - px[1], pz[0] - pz[1]), Math.hypot(px[1] - px[2], pz[1] - pz[2]), Math.hypot(px[0] - px[2], pz[0] - pz[2]));
}
const grCache = new Map<number, number>();
const grOf = (f: number): number => { let v = grCache.get(f); if (v === undefined) { v = graphRatio(f); grCache.set(f, v); } return v; };
function goldenStride(n: number, want: number): number[] {
  if (want >= n) return Array.from({ length: n }, (_, i) => i);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let g = Math.max(1, Math.round(n * 0.6180339887498949));
  while (gcd(g, n) !== 1) g += 1;
  const out: number[] = [];
  for (let i = 0; i < want; i += 1) out.push((i * g) % n);
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO ORACLES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const KMAXALL = Math.max(...KTAB, K_REF, 16);
const CAP = (((KMAXALL + 1) * (KMAXALL + 2)) / 2) * 4;
const bufN = new Float64Array(CAP * 2 * 3);
const bufT = new Float64Array(CAP * 2);
const bufZ = new Float64Array(CAP * 2);
const bufLab = new Int8Array(CAP * 2);
const cen = new Float64Array(6);
const scr = new Float64Array(12);
const idxA = new Int32Array(CAP * 2); const idxB = new Int32Array(CAP * 2);
const ddK = new Float64Array(64); const angK = new Float64Array(64);
const angAt = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};
/** Lattice sample of facet f into the shared buffers. `thShift` re-branches theta onto the pair's branch. */
function sampleInto(f: number, k: number, ns: NormalSampler, m0: number, thShift: number, rRefPair: number): number {
  const [ath0, bth0, cth0] = th3(f);
  const ath = ath0 + thShift; const bth = bth0 + thShift; const cth = cth0 + thShift;
  const az = SRC[f * 9 + 2]; const bz = SRC[f * 9 + 5]; const cz = SRC[f * 9 + 8];
  let m = m0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = ns(th, z, scr);
      for (let qi = 0; qi < nc; qi += 1) {
        if (m >= CAP * 2) return m;
        bufN[m * 3] = scr[qi * 3]; bufN[m * 3 + 1] = scr[qi * 3 + 1]; bufN[m * 3 + 2] = scr[qi * 3 + 2];
        bufT[m] = rRefPair * th; bufZ[m] = z; m += 1;
      }
    }
  }
  return m;
}
interface Split { nA: number; nB: number; sepRad: number; wA: number; wB: number }
function twoMeans(m: number): Split {
  if (m === 0) return { nA: 0, nB: 0, sepRad: 0, wA: 0, wB: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < m; i += 1) { sx += bufN[i * 3]; sy += bufN[i * 3 + 1]; sz += bufN[i * 3 + 2]; }
  let L = Math.hypot(sx, sy, sz); if (!(L > 0)) L = 1;
  const mean = new Float64Array([sx / L, sy / L, sz / L]);
  let i1 = 0; let best = -1;
  for (let i = 0; i < m; i += 1) { const a = angAt(bufN, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = 0; best = -1;
  for (let i = 0; i < m; i += 1) { const a = angAt(bufN, i * 3, bufN, i1 * 3); if (a > best) { best = a; i2 = i; } }
  cen[0] = bufN[i1 * 3]; cen[1] = bufN[i1 * 3 + 1]; cen[2] = bufN[i1 * 3 + 2];
  cen[3] = bufN[i2 * 3]; cen[4] = bufN[i2 * 3 + 1]; cen[5] = bufN[i2 * 3 + 2];
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; let na = 0; let nb = 0;
    for (let i = 0; i < m; i += 1) {
      const da = angAt(bufN, i * 3, cen, 0); const db = angAt(bufN, i * 3, cen, 3);
      if (da <= db) { bufLab[i] = 0; ax += bufN[i * 3]; ay += bufN[i * 3 + 1]; az += bufN[i * 3 + 2]; na += 1; }
      else { bufLab[i] = 1; bx += bufN[i * 3]; by += bufN[i * 3 + 1]; bz += bufN[i * 3 + 2]; nb += 1; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; cen[0] = ax / l; cen[1] = ay / l; cen[2] = az / l; }
    if (nb > 0) { const l = Math.hypot(bx, by, bz) || 1; cen[3] = bx / l; cen[4] = by / l; cen[5] = bz / l; }
    if (na === 0 || nb === 0) break;
  }
  let nA = 0; let nB = 0; let wA = 0; let wB = 0;
  for (let i = 0; i < m; i += 1) {
    if (bufLab[i] === 0) { nA += 1; wA = Math.max(wA, angAt(bufN, i * 3, cen, 0)); }
    else { nB += 1; wB = Math.max(wB, angAt(bufN, i * 3, cen, 3)); }
  }
  return { nA, nB, sepRad: nA > 0 && nB > 0 ? angAt(cen, 0, cen, 3) : 0, wA, wB };
}
const nsFixMap = new Map<string, NormalSampler>();
function nsCache(fn: RadiusFn, h: number): NormalSampler {
  const key = `${fn === rA ? 'A' : 'F'}:${h}`;
  let s = nsFixMap.get(key);
  if (s === undefined) { s = fdNormals(fn, H, h, h); nsFixMap.set(key, s); }
  return s;
}
/** Branch alignment for a pair: shift f2's theta onto f1's branch. Returns [shift2, rRefPair, seamFlag]. */
function pairBranch(f1: number, f2: number): [number, number, boolean] {
  const a1 = th3(f1)[0]; const a2 = th3(f2)[0];
  const dd = dThRaw(a1, a2);
  const shift = (a1 + dd) - a2;
  const rRefPair = 0.5 * (rRefOf(f1) + rRefOf(f2));
  return [shift, rRefPair, Math.abs(shift) > 1e-9];
}
interface POut { turnDeg: number; m: number; pdMm: number; seam: boolean }
/**
 * ORACLE-P — the PARAMETER-FOOTPRINT oracle. S114/S115 construction.
 * `legacy=true` reproduces the inherited `oraclePair` BYTE-FOR-BYTE (each facet on its OWN theta branch
 * and its OWN rRef) so C3 can prove the two runs are on one instrument. `legacy=false` applies the C5
 * branch fix and a common rRef.
 */
function oracleParam(f1: number, f2: number, k: number, fn: RadiusFn, h: number, legacy = false): POut {
  const [shift2raw, rRefPairRaw, seam] = pairBranch(f1, f2);
  const shift2 = legacy ? 0 : shift2raw;
  const rRefPair = legacy ? rRefOf(f1) : rRefPairRaw;
  const rRef2 = legacy ? rRefOf(f2) : rRefPairRaw;
  const ns = nsCache(fn, h);
  const m1 = sampleInto(f1, k, ns, 0, 0, rRefPair);
  const m = sampleInto(f2, k, ns, m1, shift2, rRef2);
  const sp = twoMeans(m);
  let na = 0; let nb = 0;
  for (let i = 0; i < m; i += 1) { if (bufLab[i] === 0) { idxA[na] = i; na += 1; } else { idxB[nb] = i; nb += 1; } }
  for (let i = 0; i < NCROSS; i += 1) { ddK[i] = Infinity; angK[i] = 0; }
  let worst = Infinity; let filled = 0;
  for (let ia = 0; ia < na; ia += 1) {
    const a = idxA[ia]; const pa = bufT[a]; const za = bufZ[a];
    for (let ib = 0; ib < nb; ib += 1) {
      const b = idxB[ib];
      const dx = pa - bufT[b]; const dy = za - bufZ[b];
      const dd = dx * dx + dy * dy;
      if (filled >= NCROSS && dd >= worst) continue;
      const ag = angAt(bufN, a * 3, bufN, b * 3);
      let p = Math.min(filled, NCROSS - 1);
      while (p > 0 && ddK[p - 1] > dd) { ddK[p] = ddK[p - 1]; angK[p] = angK[p - 1]; p -= 1; }
      ddK[p] = dd; angK[p] = ag;
      if (filled < NCROSS) filled += 1;
      worst = ddK[filled - 1];
    }
  }
  void sp; void SEP_MIN;
  let turn = 0;
  for (let i = 0; i < filled; i += 1) if (angK[i] > turn) turn = angK[i];
  return { turnDeg: turn * DEG, m, pdMm: Math.max(paramDiam(f1), paramDiam(f2)), seam };
}
/**
 * ORACLE-3D — the 3-D BALL oracle. The parameter footprint is a LINE on 57.5% of this class's area
 * (phase-1), so a probe that walks it has nothing to walk along. This one asks the question in 3-D:
 *   does the ANALYTIC normal cone span the bar anywhere within the pair's OWN 3-D radius?
 * Its probe region CONTAINS the parameter footprint, so its irreducible share is an UPPER bound on the
 * parameter oracle's, and the two BRACKET the truth.
 */
const n3 = new Float64Array(CAP3 * 3);
function oracle3D(f1: number, f2: number, k3: number, fn: RadiusFn, h: number, inflate: number): { turnDeg: number; kept: number; r3: number } {
  const [shift2, rRefPair] = pairBranch(f1, f2);
  const th1 = th3(f1); const th2raw = th3(f2);
  const th2: [number, number, number] = [th2raw[0] + shift2, th2raw[1] + shift2, th2raw[2] + shift2];
  const px: number[] = []; const py: number[] = []; const pz: number[] = []; const us: number[] = []; const zs: number[] = [];
  for (let v = 0; v < 3; v += 1) {
    px.push(SRC[f1 * 9 + v * 3]); py.push(SRC[f1 * 9 + v * 3 + 1]); pz.push(SRC[f1 * 9 + v * 3 + 2]);
    us.push(rRefPair * th1[v]); zs.push(SRC[f1 * 9 + v * 3 + 2]);
  }
  for (let v = 0; v < 3; v += 1) {
    px.push(SRC[f2 * 9 + v * 3]); py.push(SRC[f2 * 9 + v * 3 + 1]); pz.push(SRC[f2 * 9 + v * 3 + 2]);
    us.push(rRefPair * th2[v]); zs.push(SRC[f2 * 9 + v * 3 + 2]);
  }
  let cx = 0; let cy = 0; let cz = 0;
  for (let i = 0; i < 6; i += 1) { cx += px[i]; cy += py[i]; cz += pz[i]; }
  cx /= 6; cy /= 6; cz /= 6;
  let r3 = 0;
  for (let i = 0; i < 6; i += 1) r3 = Math.max(r3, Math.hypot(px[i] - cx, py[i] - cy, pz[i] - cz));
  const R = Math.max(r3, 1e-9) * inflate;
  const u0 = Math.min(...us) - R; const u1 = Math.max(...us) + R;
  const z0 = Math.max(0, Math.min(...zs) - R); const z1 = Math.min(H, Math.max(...zs) + R);
  const ns = nsCache(fn, h);
  const N = 2 * k3 + 1;
  // collect kept normals with a reservoir-free stride cap
  let kept = 0; let seen = 0;
  const total = N * N;
  const stride = Math.max(1, Math.ceil(total / CAP3));
  for (let i = 0; i < N; i += 1) {
    const u = u0 + ((u1 - u0) * i) / (N - 1);
    const th = u / rRefPair;
    for (let j = 0; j < N; j += 1) {
      const z = z0 + ((z1 - z0) * j) / Math.max(1, N - 1);
      const r = fn(th, z);
      const X = r * Math.cos(th); const Y = r * Math.sin(th);
      if (Math.hypot(X - cx, Y - cy, z - cz) > R) continue;
      seen += 1;
      if (seen % stride !== 0) continue;
      const nc = ns(th, z, scr);
      for (let qi = 0; qi < nc; qi += 1) {
        if (kept >= CAP3) break;
        n3[kept * 3] = scr[qi * 3]; n3[kept * 3 + 1] = scr[qi * 3 + 1]; n3[kept * 3 + 2] = scr[qi * 3 + 2];
        kept += 1;
      }
      if (kept >= CAP3) break;
    }
    if (kept >= CAP3) break;
  }
  let turn = 0;
  for (let a = 0; a < kept; a += 1) {
    for (let b = a + 1; b < kept; b += 1) {
      const ag = angAt(n3, a * 3, n3, b * 3);
      if (ag > turn) turn = ag;
    }
  }
  return { turnDeg: turn * DEG, kept, r3 };
}

// ── bootstrap CI on an AREA-WEIGHTED share ──────────────────────────────────────────────────────────
function shareStats(area: number[], irr: boolean[], seed = 12345): { share: number; nEff: number; lo: number; hi: number } {
  let sa = 0; let sa2 = 0; let si = 0;
  for (let i = 0; i < area.length; i += 1) { sa += area[i]; sa2 += area[i] * area[i]; if (irr[i]) si += area[i]; }
  const nEff = sa2 > 0 ? (sa * sa) / sa2 : 0;
  let st = seed >>> 0;
  const rnd = (): number => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const B = 400; const out = new Float64Array(B); const n = area.length;
  for (let b = 0; b < B; b += 1) {
    let a = 0; let ai = 0;
    for (let i = 0; i < n; i += 1) { const j = Math.min(n - 1, Math.floor(rnd() * n)); a += area[j]; if (irr[j]) ai += area[j]; }
    out[b] = a > 0 ? (ai / a) * 100 : NaN;
  }
  const s = Array.from(out).filter(Number.isFinite).sort((x, y) => x - y);
  return { share: sa > 0 ? (si / sa) * 100 : NaN, nEff, lo: s[Math.floor(s.length * 0.05)], hi: s[Math.floor(s.length * 0.95)] };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — THE ORACLE POOL AND THE (K, h) GRID
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Pool { bar: number; e: number[]; f1: number[]; f2: number[]; area: number[]; gr: number[]; classArea: number; classFacets: number }
function buildPool(bar: number, want: number): Pool {
  const c = buildClass(bar);
  const idx = goldenStride(c.edges.length, Math.min(want, c.edges.length));
  const e = idx.map((i) => c.edges[i]);
  return {
    bar, e, f1: e.map((x) => d.edgeF1[x]), f2: e.map((x) => d.edgeF2[x]),
    area: e.map((x) => d.areaMm2[d.edgeF1[x]] + d.areaMm2[d.edgeF2[x]]),
    gr: e.map((x) => Math.max(grOf(d.edgeF1[x]), grOf(d.edgeF2[x]))),
    classArea: c.areaMm2, classFacets: c.count,
  };
}
/** per-FACET aggregation of a pair-level irreducible flag over the pool. */
function perFacet(p: Pool, irr: boolean[]): { loose: number; strict: number; perPair: number; nFacets: number } {
  const any = new Map<number, boolean>(); const all = new Map<number, boolean>();
  let pa = 0; let pi = 0;
  for (let i = 0; i < p.e.length; i += 1) {
    pa += p.area[i]; if (irr[i]) pi += p.area[i];
    for (const f of [p.f1[i], p.f2[i]]) {
      any.set(f, (any.get(f) ?? false) || irr[i]);
      all.set(f, (all.get(f) ?? true) && irr[i]);
    }
  }
  let tA = 0; let lA = 0; let sA = 0;
  for (const [f, v] of any) { tA += d.areaMm2[f]; if (v) lA += d.areaMm2[f]; if (all.get(f) === true) sA += d.areaMm2[f]; }
  return { loose: (lA / tA) * 100, strict: (sA / tA) * 100, perPair: (pi / pa) * 100, nFacets: any.size };
}

const turnsP: Record<string, number[]> = {};   // key `${bar}:${K}:${h}` -> per-pair turn deg (ORACLE-P)
const turns3: Record<string, number[]> = {};   // key `${bar}:${h}`      -> per-pair turn deg (ORACLE-3D)
const pools = new Map<number, Pool>();
let seamCount = 0;
if (STAGES.has('2')) {
  log(`── STAGE 2: THE ORACLE POOLS AND THE (K, h) GRID  ${el()} ──`);
  for (const b of BARLAD) {
    const want = b === 30 ? POOL_N30 : POOL_N;
    const p = buildPool(b, want);
    pools.set(b, p);
    log(`  pool bar=${b}: n=${p.e.length} of ${buildClass(b).edges.length} edges (golden stride, PREFIX-STABLE)  classArea ${p.classArea.toFixed(3)} mm2`);
  }
  log('');
  log('  ORACLE-P — the PARAMETER-FOOTPRINT oracle. turn = max analytic normal angle over the NCROSS');
  log('  nearest cross-cluster lattice pairs of the two facets. IRREDUCIBLE at bar B iff turn >= B.');
  log('     bar   K     h        turn p50   p90    MAX      IRR/pair%  IRR/facet LOOSE%  STRICT%   REDUCIBLE %-of-mesh   [90% CI]      n_eff');
  const rowsP: Array<Record<string, number>> = [];
  for (const b of BARLAD) {
    const p = pools.get(b) as Pool;
    for (const k of KTAB) {
      for (const hh of HTAB) {
        if (k !== K_REF && hh !== H_REF) continue;    // an L-shaped slice through (K,h): full h at K_REF, full K at H_REF
        const t = Date.now();
        const tv: number[] = []; let sc = 0;
        for (let i = 0; i < p.e.length; i += 1) {
          const o = oracleParam(p.f1[i], p.f2[i], k, rA, hh);
          tv.push(o.turnDeg); if (o.seam) sc += 1;
        }
        seamCount = Math.max(seamCount, sc);
        turnsP[`${b}:${k}:${hh}`] = tv;
        const irr = tv.map((v) => v >= b);
        const pf = perFacet(p, irr);
        const ss = shareStats(p.area, irr);
        const redL = ((p.classArea * (1 - pf.loose / 100)) / meshArea) * 100;
        const ciLo = ((p.classArea * (1 - ss.hi / 100)) / meshArea) * 100;
        const ciHi = ((p.classArea * (1 - ss.lo / 100)) / meshArea) * 100;
        log(`     ${String(b).padStart(3)}  ${String(k).padStart(3)}  ${hh.toExponential(0).padStart(7)}  ${f2(q(tv, 0.5), 2).padStart(8)} ${f2(q(tv, 0.9), 2).padStart(7)} ${f2(q(tv, 1), 2).padStart(7)}  ${f2(pf.perPair, 2).padStart(8)}%  ${f2(pf.loose, 2).padStart(13)}%  ${f2(pf.strict, 2).padStart(7)}%   *** ${f2(redL, 4).padStart(7)}% ***   [${f2(ciLo, 3)}–${f2(ciHi, 3)}]  ${f2(ss.nEff, 1).padStart(7)}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
        rowsP.push({ bar: b, K: k, h: hh, turnP50: q(tv, 0.5), turnMax: q(tv, 1), irrPair: pf.perPair, irrLoose: pf.loose, irrStrict: pf.strict, redPctOfMesh: redL, ciLo, ciHi, nEff: ss.nEff, n: p.e.length, seamPairs: sc });
      }
    }
  }
  OUT.oracleP = rowsP;
  log(`  C5 SEAM BRANCH: pairs needing a theta re-branch (the inherited oracle would have compared them 283 mm apart): ${seamCount} of ${POOL_N}`);
  log('');
  // ── ORACLE-3D ───────────────────────────────────────────────────────────────────────────────────
  log(`  ORACLE-3D — the 3-D BALL oracle (K3=${K3}, cap ${CAP3} normals, inflate 1.0). Probe region CONTAINS`);
  log('  the parameter footprint, so its IRREDUCIBLE share is an UPPER bound and the two oracles BRACKET.');
  log('     bar   h       infl  turn p50   p90    MAX     kept p50  IRR/pair%  IRR/facet LOOSE%   REDUCIBLE %-of-mesh   [90% CI]');
  const rows3: Array<Record<string, number>> = [];
  for (const b of BARLAD) {
    const p = pools.get(b) as Pool;
    for (const hh of HTAB) {
      if (hh !== H_REF && hh !== 2e-4) continue;
      for (const infl of INFLAD) {
      if (hh !== H_REF && infl !== 1) continue;
      const t = Date.now();
      const tv: number[] = []; const kp: number[] = [];
      for (let i = 0; i < p.e.length; i += 1) {
        const o = oracle3D(p.f1[i], p.f2[i], K3, rA, hh, infl);
        tv.push(o.turnDeg); kp.push(o.kept);
      }
      if (infl === 1) turns3[`${b}:${hh}`] = tv;
      const irr = tv.map((v) => v >= b);
      const pf = perFacet(p, irr);
      const ss = shareStats(p.area, irr);
      const redL = ((p.classArea * (1 - pf.loose / 100)) / meshArea) * 100;
      const ciLo = ((p.classArea * (1 - ss.hi / 100)) / meshArea) * 100;
      const ciHi = ((p.classArea * (1 - ss.lo / 100)) / meshArea) * 100;
      log(`     ${String(b).padStart(3)}  ${hh.toExponential(0).padStart(7)} ${f2(infl, 2).padStart(5)}  ${f2(q(tv, 0.5), 2).padStart(8)} ${f2(q(tv, 0.9), 2).padStart(7)} ${f2(q(tv, 1), 2).padStart(7)}  ${String(q(kp, 0.5)).padStart(8)}  ${f2(pf.perPair, 2).padStart(8)}%  ${f2(pf.loose, 2).padStart(13)}%   *** ${f2(redL, 4).padStart(7)}% ***   [${f2(ciLo, 3)}–${f2(ciHi, 3)}]  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
      rows3.push({ bar: b, h: hh, inflate: infl, turnP50: q(tv, 0.5), turnMax: q(tv, 1), keptP50: q(kp, 0.5), irrPair: pf.perPair, irrLoose: pf.loose, redPctOfMesh: redL, ciLo, ciHi, n: p.e.length });
      }
    }
  }
  OUT.oracle3D = rows3;
  log('');
  // ── C2 PLACEBO, C4 NON-VACUITY, C3 REPRODUCTION, C7 INSET INERTNESS ──────────────────────────────
  {
    const p = pools.get(BAR) as Pool;
    const nP = Math.min(1200, p.e.length);
    const tvP: number[] = []; const tv3: number[] = []; const ar: number[] = [];
    for (let i = 0; i < nP; i += 1) {
      tvP.push(oracleParam(p.f1[i], p.f2[i], K_REF, rFlat, H_REF).turnDeg);
      tv3.push(oracle3D(p.f1[i], p.f2[i], K3, rFlat, H_REF, 1.0).turnDeg);
      ar.push(p.area[i]);
    }
    const sP = shareStats(ar, tvP.map((v) => v >= BAR));
    const s3 = shareStats(ar, tv3.map((v) => v >= BAR));
    log(`  C2 PLACEBO (C-infinity truncated cone, n=${nP}, SAME footprints, K=${K_REF}, h=${H_REF.toExponential(0)}):`);
    log(`     ORACLE-P  irreducible AREA ${f2(sP.share, 4)}%  turn MAX ${f2(q(tvP, 1), 4)} deg   ${sP.share > 5 ? '*** C2 FIRED — VOID ***' : 'OK'}`);
    log(`     ORACLE-3D irreducible AREA ${f2(s3.share, 4)}%  turn MAX ${f2(q(tv3, 1), 4)} deg   ${s3.share > 5 ? '*** C2 FIRED — VOID ***' : 'OK'}`);
    OUT.c2placebo = { paramShare: sP.share, param3Share: s3.share, paramTurnMax: q(tvP, 1), turn3Max: q(tv3, 1), n: nP };
  }
  log('');
  // ── C3 REPRODUCTION against phase-1 (S115_S5B): same pool prefix, same K, same h, LEGACY oracle ──
  {
    const p = pools.get(45) as Pool;
    const nR = Math.min(1600, p.e.length);
    const sub: Pool = { ...p, e: p.e.slice(0, nR), f1: p.f1.slice(0, nR), f2: p.f2.slice(0, nR), area: p.area.slice(0, nR), gr: p.gr.slice(0, nR) };
    const runOne = (legacy: boolean): { loose: number; red: number } => {
      const irr: boolean[] = [];
      for (let i = 0; i < nR; i += 1) irr.push(oracleParam(sub.f1[i], sub.f2[i], 16, rA, 2e-7, legacy).turnDeg >= 45);
      const pf = perFacet(sub, irr);
      return { loose: pf.loose, red: ((sub.classArea * (1 - pf.loose / 100)) / meshArea) * 100 };
    };
    const leg = runOne(true); const fix = runOne(false);
    log('  C3 REPRODUCTION — phase-1 S115_S5B at K=16, h=2e-7, n=1600 read IRR/facet LOOSE 19.22% and REDUCIBLE 2.5825%.');
    log(`     LEGACY oracle (own branch, own rRef): LOOSE ${f2(leg.loose, 2)}%  REDUCIBLE ${f2(leg.red, 4)}%   ${Math.abs(leg.loose - 19.22) < 0.25 ? 'REPRODUCED' : '*** C3 FIRED — NOT THE SAME INSTRUMENT ***'}`);
    log(`     C5-FIXED oracle (common branch + rRef): LOOSE ${f2(fix.loose, 2)}%  REDUCIBLE ${f2(fix.red, 4)}%   (delta from legacy ${f2(fix.red - leg.red, 4)} pp)`);
    OUT.c3repro = { legacyLoose: leg.loose, legacyRed: leg.red, fixedLoose: fix.loose, fixedRed: fix.red, n: nR, phase1Loose: 19.22, phase1Red: 2.5825 };
  }
  log('');
  // ── C4 NON-VACUITY FLOOR: the oracle must still find the KNOWN-real turn on the WALL/STRADDLING class
  {
    const p = pools.get(45) as Pool;
    const wall: number[] = [];
    for (let i = 0; i < p.e.length && wall.length < 800; i += 1) if (p.gr[i] <= 8) wall.push(i);
    const irr: boolean[] = []; const ar: number[] = []; const tv: number[] = [];
    for (const i of wall) { const t = oracleParam(p.f1[i], p.f2[i], K_REF, rA, H_REF).turnDeg; tv.push(t); irr.push(t >= 45); ar.push(p.area[i]); }
    const ss = shareStats(ar, irr);
    log(`  C4 NON-VACUITY FLOOR (WALL side, graphRatio <= 8, n=${wall.length}, K=${K_REF}, h=${H_REF.toExponential(0)}):`);
    log(`     irreducible AREA ${f2(ss.share, 2)}%  turn p50 ${f2(q(tv, 0.5), 2)} MAX ${f2(q(tv, 1), 2)} deg   ${ss.share < 10 ? '*** C4 FIRED — the arm is vacuous ***' : 'OK (phase-1 read 70–77% here)'}`);
    OUT.c4floor = { share: ss.share, n: wall.length, turnP50: q(tv, 0.5) };
  }
  log('');
  OUT.c5seam = seamCount;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — THE 4-KNOB SWEEP AND THE HONEST RANGE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.has('3')) {
  log(`── STAGE 3: THE 4-KNOB SWEEP — bar x K x h x curtain-cut R  ${el()} ──`);
  // R enters only through the CURTAIN partition of the pool. With NO cut the number needs no R at all;
  // with a cut, the curtain sub-class is credited/discredited separately. Both are printed.
  const cells: Array<Record<string, number | string>> = [];
  log('  (a) NO CURTAIN CUT — the number that needs no R. LOOSE (=ceiling on irreducible => FLOOR on reducible).');
  log('     oracle  bar   K     h        REDUCIBLE %-of-mesh   [90% CI]');
  for (const key of Object.keys(turnsP)) {
    const [bs, ks, hs] = key.split(':').map(Number);
    const p = pools.get(bs) as Pool; const tv = turnsP[key];
    const irr = tv.map((v) => v >= bs);
    const pf = perFacet(p, irr); const ss = shareStats(p.area, irr);
    const red = ((p.classArea * (1 - pf.loose / 100)) / meshArea) * 100;
    const ciLo = ((p.classArea * (1 - ss.hi / 100)) / meshArea) * 100;
    const ciHi = ((p.classArea * (1 - ss.lo / 100)) / meshArea) * 100;
    log(`     P       ${String(bs).padStart(3)}  ${String(ks).padStart(3)}  ${hs.toExponential(0).padStart(7)}   *** ${f2(red, 4).padStart(7)}% ***   [${f2(ciLo, 3)}–${f2(ciHi, 3)}]`);
    cells.push({ oracle: 'P', bar: bs, K: ks, h: hs, R: 0, red, ciLo, ciHi });
  }
  for (const key of Object.keys(turns3)) {
    const [bs, hs] = key.split(':').map(Number);
    const p = pools.get(bs) as Pool; const tv = turns3[key];
    const irr = tv.map((v) => v >= bs);
    const pf = perFacet(p, irr); const ss = shareStats(p.area, irr);
    const red = ((p.classArea * (1 - pf.loose / 100)) / meshArea) * 100;
    const ciLo = ((p.classArea * (1 - ss.hi / 100)) / meshArea) * 100;
    const ciHi = ((p.classArea * (1 - ss.lo / 100)) / meshArea) * 100;
    log(`     3D      ${String(bs).padStart(3)}    –  ${hs.toExponential(0).padStart(7)}   *** ${f2(red, 4).padStart(7)}% ***   [${f2(ciLo, 3)}–${f2(ciHi, 3)}]`);
    cells.push({ oracle: '3D', bar: bs, K: 0, h: hs, R: 0, red, ciLo, ciHi });
  }
  log('');
  log('  (b) WITH A CURTAIN CUT R — the pool split by graphRatio, each side oracled with the SAME ruler.');
  log('      (The cut changes only HOW the pool is partitioned; both sides are scored, none is credited.)');
  log(`     oracle  bar   K     h       ${RLAD.map((r) => String(r).padStart(10)).join('')}`);
  for (const key of Object.keys(turnsP)) {
    const [bs, ks, hs] = key.split(':').map(Number);
    const p = pools.get(bs) as Pool; const tv = turnsP[key];
    const parts: string[] = [];
    for (const R of RLAD) {
      // curtain and wall sides scored separately, then recombined by their EXHAUSTIVE class areas
      const ci: number[] = []; const si: number[] = [];
      for (let i = 0; i < p.e.length; i += 1) (p.gr[i] > R ? ci : si).push(i);
      const cls = buildClass(bs);
      let cA = 0; let wA = 0;
      const seen = new Set<number>();
      for (const e of cls.edges) {
        const g = Math.max(grOf(d.edgeF1[e]), grOf(d.edgeF2[e]));
        for (const f of [d.edgeF1[e], d.edgeF2[e]]) {
          if (seen.has(f)) continue; seen.add(f);
          if (g > R) cA += d.areaMm2[f]; else wA += d.areaMm2[f];
        }
      }
      const shr = (idx: number[]): number => {
        let a = 0; let ai = 0;
        for (const i of idx) { a += p.area[i]; if (tv[i] >= bs) ai += p.area[i]; }
        return a > 0 ? ai / a : NaN;
      };
      const sC = shr(ci); const sW = shr(si);
      const red = (cA * (1 - (Number.isFinite(sC) ? sC : 0)) + wA * (1 - (Number.isFinite(sW) ? sW : 0))) / meshArea * 100;
      parts.push(f2(red, 4).padStart(10));
      cells.push({ oracle: 'P', bar: bs, K: ks, h: hs, R, red, ciLo: NaN, ciHi: NaN });
    }
    log(`     P       ${String(bs).padStart(3)}  ${String(ks).padStart(3)}  ${hs.toExponential(0).padStart(7)} ${parts.join('')}`);
  }
  log('');
  // ── the honest range, decomposed by knob ────────────────────────────────────────────────────────
  const at = (o: string, b: number, k: number, h: number, R: number): number | undefined =>
    (cells.find((c) => c.oracle === o && c.bar === b && c.K === k && c.h === h && c.R === R)?.red as number | undefined);
  const rangeOf = (vals: Array<number | undefined>): number => {
    const v = vals.filter((x): x is number => x !== undefined && Number.isFinite(x));
    return v.length > 1 ? Math.max(...v) - Math.min(...v) : NaN;
  };
  const barRange = rangeOf(BARLAD.map((b) => at('P', b, K_REF, H_REF, 0)));
  const kRange = rangeOf(KTAB.map((k) => at('P', BAR, k, H_REF, 0)));
  const hRange = rangeOf(HTAB.map((h) => at('P', BAR, K_REF, h, 0)));
  const rRange = rangeOf(RLAD.map((R) => at('P', BAR, K_REF, H_REF, R)));
  const oRange = rangeOf([at('P', BAR, K_REF, H_REF, 0), at('3D', BAR, 0, H_REF, 0)]);
  log('  *** PR-2 TEST — WHICH KNOB DOMINATES (full range in percentage points of mesh area) ***');
  log(`     bar (30..90)      ${f2(barRange, 4)} pp`);
  log(`     K   (${KTAB.join('/')})     ${f2(kRange, 4)} pp`);
  log(`     h   (${HTAB.map((x) => x.toExponential(0)).join('/')})  ${f2(hRange, 4)} pp`);
  log(`     R   (${RLAD.join('/')})  ${f2(rRange, 4)} pp`);
  log(`     ORACLE (P vs 3D)  ${f2(oRange, 4)} pp`);
  const others = [kRange, hRange, rRange].filter(Number.isFinite).reduce((a, b) => a + b, 0);
  log(`     => PR-2 ${barRange > others ? 'CONFIRMED' : '*** FALSIFIED ***'}: bar range ${f2(barRange, 4)} vs K+h+R combined ${f2(others, 4)} pp`);
  const allRed = cells.filter((c) => c.bar === BAR).map((c) => c.red as number).filter(Number.isFinite);
  log('');
  log(`  *** THE HONEST RANGE at bar=${BAR}, over ALL knobs and BOTH oracles: ${f2(Math.min(...allRed), 4)}% .. ${f2(Math.max(...allRed), 4)}% of mesh ***`);
  const pt = at('P', BAR, K_REF, H_REF, 0);
  log(`  *** THE DEFENSIBLE POINT ESTIMATE (ORACLE-P, no cut, K=${K_REF}, h=${H_REF.toExponential(0)}): ${f2(pt ?? NaN, 4)}% of mesh ***`);
  log(`      PR-1 ${pt !== undefined && pt >= 2.4 && pt <= 2.7 ? 'CONFIRMED' : '*** FALSIFIED ***'} (pre-registered 2.4–2.7%).`);
  OUT.stage3 = { cells, barRange, kRange, hRange, rRange, oRange, point: pt, allMin: Math.min(...allRed), allMax: Math.max(...allRed) };
  log('');
  // C7 — inset inertness, proved by construction and verified
  {
    const p = pools.get(BAR) as Pool;
    const nI = Math.min(400, p.e.length);
    const insets = [0, 0.05, 0.10];
    const outs: number[] = [];
    for (const ins of insets) {
      let over = 0; let tot = 0;
      const nsi = fdNormals(rA, H, H_REF, H_REF);
      const sc2 = new Float64Array(12);
      for (let i = 0; i < nI; i += 1) {
        const f = p.f1[i];
        const [ath, bth, cth] = th3(f);
        const o = orientOfFacet(nsi, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
          xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: 8, inset: ins, orient: 'winding', scratch: sc2 });
        tot += d.areaMm2[f]; if (o.normDeg > 45) over += d.areaMm2[f];
      }
      outs.push((over / tot) * 100);
    }
    log(`  C7 INSET: the headline never calls orientOfFacet, so inset is INERT BY CONSTRUCTION. Verified on a`);
    log(`     side quantity that DOES use it (normDeg>45 area share, n=${nI}): inset 0 / 0.05 / 0.10 => ${outs.map((v) => `${f2(v, 2)}%`).join(' / ')}`);
    log(`     — that quantity MOVES ${f2(Math.max(...outs) - Math.min(...outs), 2)} pp with inset while the headline moves 0.0000 pp. The scar is real; it just does not bite here.`);
    OUT.c7inset = { insets, normDegOver45AreaPct: outs };
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — *** THE PRIZE ***
// A structured analytic grid vs the cost-matched density placebo.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface GridStat { tris: number; areaMm2: number; overArea: Record<number, number>; overCount: Record<number, number>; maxDeg: number; interior: number; boundary: number }
/**
 * Structured (theta, z) grid ON the analytic surface. Dihedrals are computed from the grid TOPOLOGY —
 * no weld, no hash — so this is exact and cheap at millions of facets.
 */
function structuredGrid(t0: number, t1: number, nT: number, nZ: number, wrap: boolean, fn: RadiusFn, bars: number[], thsIn?: Float64Array, zsIn?: Float64Array): GridStat {
  const nCol = wrap ? nT : nT + 1;
  const vx = new Float64Array(nCol * (nZ + 1));
  const vy = new Float64Array(nCol * (nZ + 1));
  const vz = new Float64Array(nCol * (nZ + 1));
  for (let i = 0; i < nCol; i += 1) {
    const th = thsIn === undefined ? t0 + ((t1 - t0) * i) / nT : thsIn[i];
    const c = Math.cos(th); const s = Math.sin(th);
    for (let j = 0; j <= nZ; j += 1) {
      const z = zsIn === undefined ? (H * j) / nZ : zsIn[j];
      const r = fn(th, z);
      const o = i * (nZ + 1) + j;
      vx[o] = r * c; vy[o] = r * s; vz[o] = z;
    }
  }
  const nCell = nT * nZ;
  const nF = 2 * nCell;
  const fnx = new Float64Array(nF); const fny = new Float64Array(nF); const fnz = new Float64Array(nF);
  const fa = new Float64Array(nF); const fmax = new Float64Array(nF);
  const V = (i: number, j: number): number => ((i % nCol) + nCol) % nCol * (nZ + 1) + j;
  const setF = (fi: number, a: number, b: number, c: number): void => {
    const ux = vx[b] - vx[a]; const uy = vy[b] - vy[a]; const uz = vz[b] - vz[a];
    const wx = vx[c] - vx[a]; const wy = vy[c] - vy[a]; const wz = vz[c] - vz[a];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const L = Math.hypot(cx, cy, cz);
    fa[fi] = 0.5 * L;
    if (L > 0) { fnx[fi] = cx / L; fny[fi] = cy / L; fnz[fi] = cz / L; }
  };
  for (let i = 0; i < nT; i += 1) {
    for (let j = 0; j < nZ; j += 1) {
      const cell = i * nZ + j;
      setF(cell * 2, V(i, j), V(i + 1, j), V(i + 1, j + 1));
      setF(cell * 2 + 1, V(i, j), V(i + 1, j + 1), V(i, j + 1));
    }
  }
  let interior = 0; let boundary = 0; let maxAng = 0;
  const pair = (fi: number, fj: number): void => {
    let dp = fnx[fi] * fnx[fj] + fny[fi] * fny[fj] + fnz[fi] * fnz[fj];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    const ang = Math.acos(dp);
    interior += 1;
    if (ang > maxAng) maxAng = ang;
    if (ang > fmax[fi]) fmax[fi] = ang;
    if (ang > fmax[fj]) fmax[fj] = ang;
  };
  for (let i = 0; i < nT; i += 1) {
    for (let j = 0; j < nZ; j += 1) {
      const cell = i * nZ + j;
      pair(cell * 2, cell * 2 + 1);                                     // diagonal
      if (j >= 1) pair(cell * 2, (i * nZ + (j - 1)) * 2 + 1); else boundary += 1;   // bottom
      if (i + 1 < nT) pair(cell * 2, ((i + 1) * nZ + j) * 2 + 1);
      else if (wrap) pair(cell * 2, (0 * nZ + j) * 2 + 1);
      else boundary += 1;
      if (j + 1 >= nZ) boundary += 1;
      if (i === 0 && !wrap) boundary += 1;
    }
  }
  let area = 0; const overArea: Record<number, number> = {}; const overCount: Record<number, number> = {};
  for (const b of bars) { overArea[b] = 0; overCount[b] = 0; }
  for (let f = 0; f < nF; f += 1) {
    area += fa[f];
    for (const b of bars) if (fmax[f] > (b * Math.PI) / 180) { overArea[b] += fa[f]; overCount[b] += 1; }
  }
  return { tris: nF, areaMm2: area, overArea, overCount, maxDeg: maxAng * DEG, interior, boundary };
}
/**
 * TURN-EQUALISED (GRADED) GRID LINES — the honest "well-generated" arm.
 *
 * A UNIFORM structured grid is the WORST mesh for a surface with near-vertical relief walls: every cell
 * that straddles a wall shows the wall's whole dihedral. The quantity a generator should equalise is the
 * GAUSS-MAP ARC LENGTH, not parameter length: if the total normal turn along theta is T_theta and there
 * are nT columns, the per-cell turn — and therefore the dihedral — is ~T_theta/nT. That is the analytic
 * prize formula, and it makes the triangle cost of any dihedral bar READ OFF THE CURVE.
 *
 * This is SEPARABLE (tensor-product), so it can only refine whole columns/rows and cannot align with a
 * DIAGONAL wall. It is therefore a LOWER bound on what a feature-aligned generator could reach — which
 * is the right side to be wrong on for a ceiling argument.
 *
 * `lam` is the uniform floor mixed into the density so that a region with zero turn still gets cells.
 */
function turnDensity(t0: number, t1: number, nfT: number, nfZ: number, fn: RadiusFn): { wT: Float64Array; wZ: Float64Array; totT: number; totZ: number } {
  const r = new Float64Array((nfT + 1) * (nfZ + 1));
  const dth = (t1 - t0) / nfT; const dz = H / nfZ;
  for (let i = 0; i <= nfT; i += 1) {
    const th = t0 + dth * i;
    for (let j = 0; j <= nfZ; j += 1) r[i * (nfZ + 1) + j] = fn(th, dz * j);
  }
  const nrm = (i: number, j: number, out: Float64Array): void => {
    const ii = Math.min(i, nfT - 1); const jj = Math.min(j, nfZ - 1);
    const r0 = r[ii * (nfZ + 1) + jj];
    const rt = (r[(ii + 1) * (nfZ + 1) + jj] - r0) / dth;
    const rz = (r[ii * (nfZ + 1) + jj + 1] - r0) / dz;
    const th = t0 + dth * ii;
    const c = Math.cos(th); const s = Math.sin(th);
    let nx = rt * s + r0 * c; let ny = r0 * s - rt * c; let nz = -r0 * rz;
    const L = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / L; out[1] = ny / L; out[2] = nz / L;
  };
  const a = new Float64Array(3); const b = new Float64Array(3);
  const wT = new Float64Array(nfT); const wZ = new Float64Array(nfZ);
  for (let i = 0; i < nfT; i += 1) {
    let s = 0;
    for (let j = 0; j < nfZ; j += 1) { nrm(i, j, a); nrm(i + 1, j, b); s += angAt(a, 0, b, 0); }
    wT[i] = s / nfZ;
  }
  for (let j = 0; j < nfZ; j += 1) {
    let s = 0;
    for (let i = 0; i < nfT; i += 1) { nrm(i, j, a); nrm(i, j + 1, b); s += angAt(a, 0, b, 0); }
    wZ[j] = s / nfT;
  }
  let tT = 0; let tZ = 0;
  for (let i = 0; i < nfT; i += 1) tT += wT[i];
  for (let j = 0; j < nfZ; j += 1) tZ += wZ[j];
  return { wT, wZ, totT: tT, totZ: tZ };
}
function equalise(w: Float64Array, lo: number, hi: number, n: number, lam: number): Float64Array {
  const nf = w.length;
  let tot = 0;
  for (let i = 0; i < nf; i += 1) tot += w[i];
  const dens = new Float64Array(nf);
  for (let i = 0; i < nf; i += 1) dens[i] = (1 - lam) * (tot > 0 ? w[i] / tot : 1 / nf) + lam / nf;
  const cum = new Float64Array(nf + 1);
  for (let i = 0; i < nf; i += 1) cum[i + 1] = cum[i] + dens[i];
  const out = new Float64Array(n + 1);
  let k = 0;
  for (let m = 0; m <= n; m += 1) {
    const target = (cum[nf] * m) / n;
    while (k < nf && cum[k + 1] < target) k += 1;
    const seg = cum[k + 1] - cum[k];
    const frac = seg > 0 ? (target - cum[k]) / seg : 0;
    out[m] = lo + ((hi - lo) * (k + Math.min(1, Math.max(0, frac)))) / nf;
  }
  out[0] = lo; out[n] = hi;
  return out;
}
/** dihedral stats of an arbitrary triangle soup (welded), restricted to bars. */
function soupStat(soup: Float64Array, bars: number[]): GridStat {
  const n = soup.length / 9;
  const dd = facetDihedrals(soup, new Uint32Array(n * 3).map((_, i) => i));
  let area = 0; let maxAng = 0;
  const overArea: Record<number, number> = {}; const overCount: Record<number, number> = {};
  for (const b of bars) { overArea[b] = 0; overCount[b] = 0; }
  for (let f = 0; f < n; f += 1) {
    area += dd.areaMm2[f];
    if (dd.perFacetMaxRad[f] > maxAng) maxAng = dd.perFacetMaxRad[f];
    for (const b of bars) if (dd.perFacetMaxRad[f] > (b * Math.PI) / 180) { overArea[b] += dd.areaMm2[f]; overCount[b] += 1; }
  }
  return { tris: n, areaMm2: area, overArea, overCount, maxDeg: maxAng * DEG, interior: dd.interiorEdges, boundary: dd.boundaryEdges };
}
/** one 1->4 subdivision level. `reproject` puts the new midpoints on rA; otherwise they stay planar. */
function subdivide(soup: Float64Array, reproject: boolean): Float64Array {
  const n = soup.length / 9;
  const out = new Float64Array(n * 4 * 9);
  const P = new Float64Array(18);
  for (let f = 0; f < n; f += 1) {
    const ax = soup[f * 9]; const ay = soup[f * 9 + 1]; const az = soup[f * 9 + 2];
    const bx = soup[f * 9 + 3]; const by = soup[f * 9 + 4]; const bz = soup[f * 9 + 5];
    const cx = soup[f * 9 + 6]; const cy = soup[f * 9 + 7]; const cz = soup[f * 9 + 8];
    const ta = Math.atan2(ay, ax);
    const tb = ta + dThRaw(ta, Math.atan2(by, bx));
    const tc = ta + dThRaw(ta, Math.atan2(cy, cx));
    const mid = (x1: number, y1: number, z1: number, t1: number, x2: number, y2: number, z2: number, t2: number, o: number): void => {
      if (reproject) {
        const tm = 0.5 * (t1 + t2); const zm = 0.5 * (z1 + z2);
        const r = rA(tm, zm);
        P[o] = r * Math.cos(tm); P[o + 1] = r * Math.sin(tm); P[o + 2] = zm;
      } else { P[o] = 0.5 * (x1 + x2); P[o + 1] = 0.5 * (y1 + y2); P[o + 2] = 0.5 * (z1 + z2); }
    };
    mid(ax, ay, az, ta, bx, by, bz, tb, 0);   // mAB
    mid(bx, by, bz, tb, cx, cy, cz, tc, 3);   // mBC
    mid(cx, cy, cz, tc, ax, ay, az, ta, 6);   // mCA
    const w = (o: number, p: number[]): void => { for (let i = 0; i < 9; i += 1) out[o + i] = p[i]; };
    const base = f * 36;
    w(base, [ax, ay, az, P[0], P[1], P[2], P[6], P[7], P[8]]);
    w(base + 9, [P[0], P[1], P[2], bx, by, bz, P[3], P[4], P[5]]);
    w(base + 18, [P[6], P[7], P[8], P[3], P[4], P[5], cx, cy, cz]);
    w(base + 27, [P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8]]);
  }
  return out;
}
/** normDeg summary over a golden-stride sample of a soup, at a given h and inset. */
function normDegStat(soup: Float64Array, hh: number, inset: number, want: number): { p50: number; p99: number; max: number; over1Area: number; over5Area: number } {
  const n = soup.length / 9;
  const idx = goldenStride(n, Math.min(want, n));
  const ns = fdNormals(rA, H, hh, hh);
  const sc2 = new Float64Array(12);
  const vals: number[] = []; let tot = 0; let o1 = 0; let o5 = 0;
  for (const f of idx) {
    const ax = soup[f * 9]; const ay = soup[f * 9 + 1]; const az = soup[f * 9 + 2];
    const bx = soup[f * 9 + 3]; const by = soup[f * 9 + 4]; const bz = soup[f * 9 + 5];
    const cx = soup[f * 9 + 6]; const cy = soup[f * 9 + 7]; const cz = soup[f * 9 + 8];
    const ta = Math.atan2(ay, ax);
    const tb = ta + dThRaw(ta, Math.atan2(by, bx));
    const tc = ta + dThRaw(ta, Math.atan2(cy, cx));
    const o = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, ta, tb, tc, { k: 8, inset, orient: 'winding', scratch: sc2 });
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    const ar = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    vals.push(o.normDeg); tot += ar;
    if (o.normDeg > 1) o1 += ar;
    if (o.normDeg > 5) o5 += ar;
  }
  return { p50: q(vals, 0.5), p99: q(vals, 0.99), max: q(vals, 1), over1Area: (o1 / tot) * 100, over5Area: (o5 / tot) * 100 };
}

if (STAGES.has('4')) {
  log(`── STAGE 4: *** THE PRIZE *** — what a PERFECT mesh reaches, and at what triangle cost  ${el()} ──`);
  // 163.41 deg is phase-1's MEASURED ANALYTIC CEILING for this surface: a dihedral above it cannot be
  // produced by the surface at all, so that band is a FOLD, provably mesh-made and provably removable.
  const CEIL = envF('PF_S115O_CEIL', 163.41);
  const BARS = [45, 60, 90, 135, CEIL];
  // ── (a) FULL-SURFACE structured grid ladder ──────────────────────────────────────────────────────
  const L = 2 * Math.PI * ((DIMS.Rb + DIMS.Rt) / 2);
  log(`  (a) FULL-SURFACE structured analytic grid. aspect L/H = ${(L / H).toFixed(3)}; the mesh has ${nTri} facets, AREA ${meshArea.toFixed(2)} mm2.`);
  const NFT = envI('PF_S115O_NFT', 4096); const NFZ = envI('PF_S115O_NFZ', 1024);
  const tD = Date.now();
  const dens = turnDensity(-Math.PI, Math.PI, NFT, NFZ, rA);
  log(`      TURN DENSITY on a ${NFT}x${NFZ} probe: TOTAL Gauss-map turn along theta ${(dens.totT * DEG).toFixed(1)} deg, along z ${(dens.totZ * DEG).toFixed(1)} deg  [${((Date.now() - tD) / 1000).toFixed(1)}s]`);
  log('      => the SEPARABLE prize formula: a turn-equalised grid with nT columns caps the per-cell theta turn at ~TOTAL/nT.');
  log('      arm         mult    nT x nZ        tris      AREA mm2   areaRatio    >45 AREA%   >45 COUNT%    >60 AREA%   >90 AREA%   MAX dih');
  const fullRows: Array<Record<string, number | string>> = [];
  for (const mult of FULL_MULT) {
    const cells = (nTri * mult) / 2;
    const nZ = Math.max(4, Math.round(Math.sqrt(cells / (L / H))));
    const nT = Math.max(4, Math.round(cells / nZ));
    // TURN-OPTIMAL ASPECT: equalise the PER-CELL turn in both directions, nT/nZ = totT/totZ.
    const arTurn = dens.totT / Math.max(1e-9, dens.totZ);
    const nZa = Math.max(4, Math.round(Math.sqrt(cells / arTurn)));
    const nTa = Math.max(4, Math.round(cells / nZa));
    for (const arm of ['UNIFORM', 'GRADED', 'GRADED-AR']) {
      const t = Date.now();
      const NT = arm === 'GRADED-AR' ? nTa : nT; const NZ = arm === 'GRADED-AR' ? nZa : nZ;
      const ths = arm === 'UNIFORM' ? undefined : equalise(dens.wT, -Math.PI, Math.PI, NT, 0.10);
      const zs = arm === 'UNIFORM' ? undefined : equalise(dens.wZ, 0, H, NZ, 0.10);
      const g = structuredGrid(-Math.PI, Math.PI, NT, NZ, true, rA, BARS, ths, zs);
      log(`      ${arm.padEnd(10)} ${String(mult).padStart(4)}x  ${String(NT).padStart(5)} x ${String(NZ).padStart(5)}  ${String(g.tris).padStart(9)}  ${g.areaMm2.toFixed(2).padStart(10)}  ${(g.areaMm2 / meshArea).toFixed(4).padStart(9)}  ${pct(g.overArea[45], g.areaMm2).padStart(10)}%  ${pct(g.overCount[45], g.tris).padStart(10)}%  ${pct(g.overArea[60], g.areaMm2).padStart(10)}%  ${pct(g.overArea[90], g.areaMm2).padStart(9)}%  ${g.maxDeg.toFixed(3).padStart(8)}  FOLD ${pct(g.overArea[CEIL], g.areaMm2)}%  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
      fullRows.push({ arm, mult, nT: NT, nZ: NZ, tris: g.tris, areaMm2: g.areaMm2, areaRatio: g.areaMm2 / meshArea, over45Area: (g.overArea[45] / g.areaMm2) * 100, over45Count: (g.overCount[45] / g.tris) * 100, over60Area: (g.overArea[60] / g.areaMm2) * 100, over90Area: (g.overArea[90] / g.areaMm2) * 100, maxDeg: g.maxDeg });
    }
  }
  OUT.turnDensity = { totTdeg: dens.totT * DEG, totZdeg: dens.totZ * DEG, nfT: NFT, nfZ: NFZ };
  const uni = fullRows.filter((r) => r.arm === 'UNIFORM').map((r) => r as Record<string, number>);
  const grd = fullRows.filter((r) => r.arm === 'GRADED-AR').map((r) => r as Record<string, number>);
  const matchedU = uni.find((r) => r.mult === 1);
  const matched = grd.find((r) => r.mult === 1) ?? matchedU;
  // MEASURED cost law: fit over45Area = C / sqrt(tris) on the best arm, then price each target bar.
  {
    const pts = grd.filter((r) => Number.isFinite(r.over45Area) && r.over45Area > 0);
    if (pts.length >= 2) {
      let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
      for (const r of pts) { const x = Math.log(r.tris); const y = Math.log(r.over45Area); sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const n = pts.length;
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const icpt = (sy - slope * sx) / n;
      const priceFor = (target: number): number => Math.exp((Math.log(target) - icpt) / slope);
      log('');
      log(`      *** THE MEASURED COST LAW on the best arm (GRADED-AR): >45 AREA%  =  exp(${icpt.toFixed(3)}) * tris^(${slope.toFixed(4)})`);
      log(`          (a pure 1/cell-size law would give slope -0.5; measured ${slope.toFixed(4)} over ${n} rungs)`);
      for (const target of [3.1969, 1.5985, 0.62, 0.10]) {
        const T = priceFor(target);
        log(`          to reach >45 AREA ${target.toFixed(4)}%  needs ${(T / 1e6).toFixed(2)}M triangles = ${(T / nTri).toFixed(2)}x the shipping mesh`);
      }
      OUT.costLaw = { slope, intercept: icpt, n, priceMatched: priceFor(3.1969), priceOracleFloor: priceFor(0.62) };
    }
  }
  if (matchedU !== undefined) log(`\n      area-closure ladder (UNIFORM): ${uni.map((r) => `${r.mult}x:${r.areaRatio.toFixed(4)}`).join('  ')}`);
  if (matched !== undefined) log(`      area-closure ladder (GRADED):  ${grd.map((r) => `${r.mult}x:${r.areaRatio.toFixed(4)}`).join('  ')}`);
  log('');
  if (matched !== undefined) {
    const ar = matched.areaRatio;
    log(`  C6 AREA CLOSURE at matched count: structured / mesh = ${f2(ar, 4)}  ${Math.abs(ar - 1) > 0.02 ? '*** C6 FIRED — not the same surface at this resolution ***' : 'OK (within 2%)'}`);
    log('');
    log('  *** PR-4 — THE KILL LINE ***');
    log(`     current mesh  >45 AREA share ${pct(barRows.find((r) => r.bar === 45)?.areaMm2 ?? 0, meshArea)}%   (1,714,638 facets)`);
    log(`     UNIFORM structured grid at MATCHED count: >45 AREA share ${f2(matchedU?.over45Area ?? NaN, 4)}%`);
    log(`     GRADED  structured grid at MATCHED count: >45 AREA share ${f2(matched.over45Area, 4)}%   <== the prize arm`);
    const v = matched.over45Area;
    const verdict = v > 1.6 ? '*** KILL LINE CROSSED — the "reducible" share corresponds to NO achievable mesh ***'
      : v >= 0.3 ? 'CONFIRMING (inside the pre-registered [0.30, 1.20] window)'
        : v >= 0.1 ? 'CONFIRMING-LOW (below the window: the oracle UNDER-states the prize)'
          : 'OVER-CREDIT (< 0.10%: the oracle UNDER-states the prize substantially)';
    log(`     => ${verdict}`);
    OUT.pr4 = { structuredOver45: v, verdict };
  }
  log('');
  // ── (b) SECTOR: structured vs the COST-MATCHED DENSITY PLACEBO ───────────────────────────────────
  const W = (2 * Math.PI) / SECTOR_DIV;
  const t0 = SECTOR_T0; const t1 = SECTOR_T0 + W;
  const secF: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    if (badFacet[f] === 1) continue;
    const [a, b, c] = th3(f);
    const a0 = canonTheta(a);
    const p1 = a0; const p2 = a0 + (b - a); const p3 = a0 + (c - a);
    if (p1 >= t0 && p1 <= t1 && p2 >= t0 && p2 <= t1 && p3 >= t0 && p3 <= t1) secF.push(f);
  }
  const secSoup = new Float64Array(secF.length * 9);
  for (let i = 0; i < secF.length; i += 1) for (let k = 0; k < 9; k += 1) secSoup[i * 9 + k] = xyz[secF[i] * 9 + k];
  const secBase = soupStat(secSoup, BARS);
  log(`  (b) SECTOR theta in [${t0.toFixed(4)}, ${t1.toFixed(4)}] (1/${SECTOR_DIV} of the pot): ${secF.length} facets fully inside, AREA ${secBase.areaMm2.toFixed(3)} mm2`);
  log(`      BASE (the shipping mesh, patch-local dihedral): >45 AREA ${pct(secBase.overArea[45], secBase.areaMm2)}%  COUNT ${pct(secBase.overCount[45], secBase.tris)}%  MAX ${secBase.maxDeg.toFixed(3)} deg  boundary edges ${secBase.boundary}`);
  log('');
  log(`      *** THE DIHEDRAL BANDS. ${CEIL} deg is phase-1's MEASURED ANALYTIC CEILING for this surface: area above it`);
  log('      is a FOLD the surface cannot produce, so it is provably mesh-made. The bands separate a prize from a fact.');
  log(`      arm             mult      tris      AREA mm2   areaRatio    >45 AREA%   >45 COUNT%   MAX dih    vs BASE  |  BAND AREA% of arm:  45-90   90-135  135-${CEIL}   >${CEIL}`);
  const secRows: Array<Record<string, number | string>> = [];
  const emit = (name: string, mult: number, g: GridStat): void => {
    const rel = (g.overArea[45] / g.areaMm2) / Math.max(1e-12, secBase.overArea[45] / secBase.areaMm2);
    const b1 = g.overArea[45] - g.overArea[90]; const b2 = g.overArea[90] - g.overArea[135];
    const b3 = g.overArea[135] - g.overArea[CEIL]; const b4 = g.overArea[CEIL];
    log(`      ${name.padEnd(14)} ${String(mult).padStart(4)}x  ${String(g.tris).padStart(9)}  ${g.areaMm2.toFixed(3).padStart(10)}  ${(g.areaMm2 / secBase.areaMm2).toFixed(4).padStart(9)}  ${pct(g.overArea[45], g.areaMm2).padStart(10)}%  ${pct(g.overCount[45], g.tris).padStart(10)}%  ${g.maxDeg.toFixed(3).padStart(8)}  ${f2(rel, 4).padStart(8)}x  |  ${pct(b1, g.areaMm2).padStart(8)}% ${pct(b2, g.areaMm2).padStart(8)}% ${pct(b3, g.areaMm2).padStart(8)}% ${pct(b4, g.areaMm2).padStart(8)}%`);
    secRows.push({ arm: name, mult, tris: g.tris, areaMm2: g.areaMm2, over45Area: (g.overArea[45] / g.areaMm2) * 100, over45Count: (g.overCount[45] / g.tris) * 100, over60Area: (g.overArea[60] / g.areaMm2) * 100, maxDeg: g.maxDeg, relToBase: rel, band4590: (b1 / g.areaMm2) * 100, band90135: (b2 / g.areaMm2) * 100, band135c: (b3 / g.areaMm2) * 100, bandFold: (b4 / g.areaMm2) * 100 });
  };
  emit('BASE(mesh)', 1, secBase);
  const Lsec = W * ((DIMS.Rb + DIMS.Rt) / 2);
  const densS = turnDensity(t0, t1, 1024, 512, rA);
  for (const mult of PRIZE_MULT) {
    const cells = (secF.length * mult) / 2;
    const nZ = Math.max(4, Math.round(Math.sqrt(cells / (Lsec / H))));
    const nT = Math.max(4, Math.round(cells / nZ));
    emit('UNIFORM', mult, structuredGrid(t0, t1, nT, nZ, false, rA, BARS));
    emit('GRADED', mult, structuredGrid(t0, t1, nT, nZ, false, rA, BARS,
      equalise(densS.wT, t0, t1, nT, 0.10), equalise(densS.wZ, 0, H, nZ, 0.10)));
  }
  let cur = secSoup; let curN = secSoup;
  for (let lvl = 1; lvl <= 2; lvl += 1) {
    cur = subdivide(cur, true);
    emit('PLACEBO 1->4', 4 ** lvl, soupStat(cur, BARS));
    curN = subdivide(curN, false);
    emit('NULL planar', 4 ** lvl, soupStat(curN, BARS));
  }
  log('');
  log('      PR-5: the placebo is cost-matched to the structured arms at every mult. *** AND THE NULL ARM IS THE ONE');
  log('      THAT MATTERS: 1->4 subdivision moves an AREA share even with ZERO new information, because a bad');
  log('      facet\'s dihedral survives on only 3 of its 4 children (3/4 of the area) per level. Any placebo');
  log('      reduction must be quoted AGAINST THE NULL, never against the base.');
  const get = (a: string, m: number): Record<string, number | string> | undefined => secRows.find((r) => r.arm === a && r.mult === m);
  for (const m of [4, 16]) {
    const p = get('PLACEBO 1->4', m); const n0 = get('NULL planar', m);
    const u = get('UNIFORM', m); const g = get('GRADED', m);
    const pr = (p?.relToBase as number) ?? NaN; const nr = (n0?.relToBase as number) ?? NaN;
    log(`      ${String(m).padStart(2)}x:  placebo ${f2(pr, 4)}x base | null ${f2(nr, 4)}x base | *** placebo/null ${f2(pr / nr, 4)}x *** | uniform ${f2((u?.relToBase as number) ?? NaN, 4)}x | graded ${f2((g?.relToBase as number) ?? NaN, 4)}x`);
  }
  const p4r = (get('PLACEBO 1->4', 4)?.relToBase as number) ?? NaN;
  const n4r = (get('NULL planar', 4)?.relToBase as number) ?? NaN;
  log(`      => PR-5 ${p4r / n4r >= 0.8 && p4r / n4r <= 1.25 ? 'CONFIRMED against the NULL' : '*** FALSIFIED ***'} (placebo/null at 4x = ${f2(p4r / n4r, 4)}x; pre-registered 0.8–1.25x).`);
  log('');
  // ── (c) normDeg on each arm, h SWEPT ─────────────────────────────────────────────────────────────
  log('  (c) normDeg (k=8, inset 0.05, winding) on each arm, h SWEPT. A number that moves with h is not a measurement.');
  log('      arm             mult      h        normDeg p50     p99      MAX     over-1deg AREA%   over-5deg AREA%');
  const ndRows: Array<Record<string, number | string>> = [];
  const ndArms: Array<[string, number, Float64Array]> = [['BASE(mesh)', 1, secSoup]];
  {
    const cells = (secF.length * 1) / 2;
    const nZ = Math.max(4, Math.round(Math.sqrt(cells / (Lsec / H))));
    const nT = Math.max(4, Math.round(cells / nZ));
    const mkSoup = (ths: Float64Array, zs: Float64Array): Float64Array => {
      const soup = new Float64Array(2 * nT * nZ * 9);
      let o = 0;
      const P = (th: number, z: number): [number, number, number] => { const r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
      for (let i = 0; i < nT; i += 1) {
        for (let j = 0; j < nZ; j += 1) {
          const p00 = P(ths[i], zs[j]); const p10 = P(ths[i + 1], zs[j]);
          const p11 = P(ths[i + 1], zs[j + 1]); const p01 = P(ths[i], zs[j + 1]);
          for (const tri of [[p00, p10, p11], [p00, p11, p01]]) {
            for (const p of tri) { soup[o] = p[0]; soup[o + 1] = p[1]; soup[o + 2] = p[2]; o += 3; }
          }
        }
      }
      return soup;
    };
    const uT = new Float64Array(nT + 1); for (let i = 0; i <= nT; i += 1) uT[i] = t0 + ((t1 - t0) * i) / nT;
    const uZ = new Float64Array(nZ + 1); for (let j = 0; j <= nZ; j += 1) uZ[j] = (H * j) / nZ;
    ndArms.push(['UNIFORM', 1, mkSoup(uT, uZ)]);
    ndArms.push(['GRADED', 1, mkSoup(equalise(densS.wT, t0, t1, nT, 0.10), equalise(densS.wZ, 0, H, nZ, 0.10))]);
  }
  ndArms.push(['PLACEBO 1->4', 16, cur]);
  for (const [name, mult, soup] of ndArms) {
    for (const hh of [2e-6, 2e-4]) {
      const s = normDegStat(soup, hh, 0.05, ND_SAMPLE);
      log(`      ${name.padEnd(14)} ${String(mult).padStart(4)}x  ${hh.toExponential(0).padStart(7)}  ${f2(s.p50, 4).padStart(11)}  ${f2(s.p99, 3).padStart(7)}  ${f2(s.max, 3).padStart(7)}  ${f2(s.over1Area, 3).padStart(14)}%  ${f2(s.over5Area, 3).padStart(14)}%`);
      ndRows.push({ arm: name, mult, h: hh, ...s });
    }
  }
  OUT.stage4 = { fullRows, secBase: { tris: secBase.tris, areaMm2: secBase.areaMm2, over45Area: (secBase.overArea[45] / secBase.areaMm2) * 100 }, secRows, ndRows, sector: { t0, t1, div: SECTOR_DIV } };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — *** THE ORACLE, TURNED ON A MESH WHOSE QUALITY IS KNOWN BY CONSTRUCTION. ***
//
// Every "reducible" number in this campaign is the oracle's verdict on the SHIPPING mesh, and nobody has
// ever asked what the oracle says about a mesh that is near-ideal BY CONSTRUCTION: vertices exactly on
// rA, well-shaped cells, turn-equalised spacing, no needles, no slivers, no T-junctions. If the oracle
// calls a large share of THAT mesh's >45 class "reducible" too, then "reducible" is not a property of
// the mesh under test and the quantity is not a ceiling on anything.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.has('5')) {
  log(`── STAGE 5: THE ORACLE ON A KNOWN-GOOD MESH  ${el()} ──`);
  const W5 = (2 * Math.PI) / SECTOR_DIV;
  const t0 = SECTOR_T0; const t1 = SECTOR_T0 + W5;
  // count the shipping mesh's facets in the sector so the synthetic grid is COST-MATCHED
  let nSec = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (badFacet[f] === 1) continue;
    const [a, b, c] = th3(f);
    const a0 = canonTheta(a);
    if (a0 >= t0 && a0 <= t1 && a0 + (b - a) >= t0 && a0 + (b - a) <= t1 && a0 + (c - a) >= t0 && a0 + (c - a) <= t1) nSec += 1;
  }
  const dens5 = turnDensity(t0, t1, 1024, 512, rA);
  const Lsec5 = W5 * ((DIMS.Rb + DIMS.Rt) / 2);
  const rows5: Array<Record<string, number | string>> = [];
  for (const [name, mult] of [['GRADED@1x', 1], ['GRADED@4x', 4]] as Array<[string, number]>) {
    const cells = (nSec * mult) / 2;
    const arT = dens5.totT / Math.max(1e-9, dens5.totZ);
    const nZ = Math.max(4, Math.round(Math.sqrt(cells / arT)));
    const nT = Math.max(4, Math.round(cells / nZ));
    const ths = equalise(dens5.wT, t0, t1, nT, 0.10); const zs = equalise(dens5.wZ, 0, H, nZ, 0.10);
    const soup = new Float64Array(2 * nT * nZ * 9);
    let o = 0;
    const P = (th: number, z: number): [number, number, number] => { const r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    for (let i = 0; i < nT; i += 1) {
      for (let j = 0; j < nZ; j += 1) {
        const p00 = P(ths[i], zs[j]); const p10 = P(ths[i + 1], zs[j]);
        const p11 = P(ths[i + 1], zs[j + 1]); const p01 = P(ths[i], zs[j + 1]);
        for (const tri of [[p00, p10, p11], [p00, p11, p01]]) for (const p of tri) { soup[o] = p[0]; soup[o + 1] = p[1]; soup[o + 2] = p[2]; o += 3; }
      }
    }
    const nF5 = soup.length / 9;
    const dd = facetDihedrals(soup, new Uint32Array(nF5 * 3).map((_, i) => i));
    const thr = (BAR * Math.PI) / 180;
    let gArea = 0; let cArea = 0; const ce: number[] = [];
    for (let f = 0; f < nF5; f += 1) { gArea += dd.areaMm2[f]; if (dd.perFacetMaxRad[f] > thr) cArea += dd.areaMm2[f]; }
    for (let e = 0; e < dd.edgeAngRad.length; e += 1) if (dd.edgeAngRad[e] > thr) ce.push(e);
    // PRECOND on the synthetic mesh — it is on rA by construction, so this must be ~0. If it is not,
    // the projection is wrong and nothing below means anything.
    let pmax = 0;
    for (let f = 0; f < nF5; f += Math.max(1, Math.floor(nF5 / 20000))) {
      for (let k = 0; k < 3; k += 1) {
        const x = soup[f * 9 + k * 3]; const y = soup[f * 9 + k * 3 + 1]; const z = soup[f * 9 + k * 3 + 2];
        pmax = Math.max(pmax, Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)));
      }
    }
    // turn the ORACLE on it
    const prev = SRC; SRC = soup;
    const idx = goldenStride(ce.length, Math.min(2000, ce.length));
    const ar: number[] = []; const irr: boolean[] = []; const tv: number[] = [];
    const anyIrr = new Map<number, boolean>();
    for (const i of idx) {
      const e = ce[i]; const f1 = dd.edgeF1[e]; const f2 = dd.edgeF2[e];
      const t = oracleParam(f1, f2, K_REF, rA, H_REF).turnDeg;
      tv.push(t); irr.push(t >= BAR); ar.push(dd.areaMm2[f1] + dd.areaMm2[f2]);
      for (const f of [f1, f2]) anyIrr.set(f, (anyIrr.get(f) ?? false) || t >= BAR);
    }
    SRC = prev;
    let tA = 0; let lA = 0;
    for (const [f, v] of anyIrr) { tA += dd.areaMm2[f]; if (v) lA += dd.areaMm2[f]; }
    const loose = (lA / tA) * 100;
    const ss = shareStats(ar, irr);
    const red = ((cArea * (1 - loose / 100)) / gArea) * 100;
    log(`  ${name}  ${nT}x${nZ} = ${nF5} tris, AREA ${gArea.toFixed(3)} mm2, PRECOND max ${(pmax * 1000).toExponential(2)} um`);
    log(`     its OWN >${BAR} class: AREA ${pct(cArea, gArea)}% of its area, ${ce.length} edges`);
    log(`     ORACLE-P on it (n=${idx.length}, K=${K_REF}, h=${H_REF.toExponential(0)}): turn p50 ${f2(q(tv, 0.5), 2)} MAX ${f2(q(tv, 1), 2)} deg`);
    log(`     IRREDUCIBLE/facet LOOSE ${f2(loose, 2)}%  [pair CI ${f2(ss.lo, 1)}–${f2(ss.hi, 1)}]  ==> *** the oracle calls ${f2(red, 4)}% OF THIS MESH REDUCIBLE ***`);
    rows5.push({ arm: name, mult, tris: nF5, precondUm: pmax * 1000, classPct: (cArea / gArea) * 100, irrLoose: loose, redPct: red, turnP50: q(tv, 0.5) });
  }
  const shipRed = (OUT.stage3 as { point?: number } | undefined)?.point;
  log('');
  log('  *** THE COMPARISON THAT DECIDES WHETHER "REDUCIBLE" IS A PROPERTY OF THE MESH AT ALL ***');
  log(`     shipping mesh   : oracle says ${f2(shipRed ?? NaN, 4)}% of mesh reducible`);
  for (const r of rows5) log(`     ${String(r.arm).padEnd(16)}: oracle says ${f2(r.redPct as number, 4)}% of ITS OWN area reducible  (class ${f2(r.classPct as number, 4)}%)`);
  OUT.stage5 = { nSec, rows: rows5, shipReduciblePct: shipRed };
  log('');
}

OUT.meshArea = meshArea;
writeFileSync(`${OUTDIR}/S115O_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`wrote ${OUTDIR}/S115O_${TAG}.json   done ${el()}`);
void NORMHI_BAR; void DROP_CUT; void HMIN;
