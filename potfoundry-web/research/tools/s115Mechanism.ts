// s115Mechanism.ts — S115: WHAT IS CelticTriquetra's REDUCIBLE DEFECT, MECHANICALLY?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. S114 measured CelticTriquetra as the INVERSE of Gothic. On Gothic 94.83% of the >45 deg adjacent
// dihedral area is carried by facets that are ACCURATE (normDeg MAX 4.99 deg) — correct geometry rendering
// a real analytic dihedral. On CelticTriquetra that class is 26 edges / 52 facets / 0.0034% of the mesh:
// essentially absent. CelticTriquetra's flagged facets are therefore GENUINELY INACCURATE, and the
// reducible remainder is 2.06% of the mesh (1,021.87 mm2) = 65x Gothic's. This tool asks WHY, mechanically,
// and produces a MUTUALLY EXCLUSIVE, EXHAUSTIVE partition whose shares sum to 100%.
//
// It is a CENSUS. Nothing is flipped, split, snapped or collapsed.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIVE HYPOTHESES, PRE-REGISTERED, AND THE MEASUREMENT THAT DECIDES EACH
//
//  H1 SLIVERS. S111's mechanism for the "mesh adds turn" class (min altitude 5.94 um; sag over altitude).
//     MEASURE: min altitude, aspect = longestEdge/minAlt, area — for the class AND for a WHOLE-MESH
//     control. A mechanism claim needs ENRICHMENT over the control, not mere presence.
//
//  H2 UNDER-RESOLUTION. The surface turns fast but SMOOTHLY inside the footprint and the facet is too big.
//     MEASURE: the offset-shrink (multi-scale turn) test. turn(delta) at shrinking probe offset with the
//     finite-difference step SLAVED to delta (h = delta/8). A C0/C1 crease HOLDS its turn; a smooth patch's
//     turn falls proportionally to delta. holdRatio = turn(deltaMin)/turn(deltaMax) over a 32x shrink:
//     ~1 => crease, ~1/32 => smooth. Density is the lever ONLY for the smooth class.
//
//  H3 MIS-ORIENTATION. The normal field barely moves across the footprint but the facet is placed wrong.
//     MEASURE: the analytic normal CONE over the footprint, bracketed TWO-SIDED:
//        coneLo = witnessed diameter (2-pass farthest-pair)   — a LOWER bound. Sound for "it turns".
//        coneHi = 2 * max angle from the mean direction        — an UPPER bound. Sound for "it does not".
//     MIS-ORIENTED requires coneHi < bar AND normDeg > bar: the surface provably does NOT turn in there.
//     *** spreadRad is NOT used as a class boundary — it is not converged in k (p50 90.1/75.3/58.8/44.5/
//     36.7 at k=4/8/16/32/64, still falling). It is printed as a relative comparator at ONE k and labelled.
//
//  H4 FEATURE STRADDLE. CelticTriquetra is a woven knot: bands cross over and under. MEASURE: the style's
//     own loci, re-derived (tile grid from floor(), ribbon edge at ctWidth, ribbon crest, max()-branch
//     switch, band edges, rim lines, medallion) and evaluated on the SAME order-k lattice. Reported as a
//     CROSS-TAB, not as a partition class, because a locus is a CAUSE and the same locus produces both
//     H2-crease and H3-misorientation facets. It carries a PHASE-SHIFTED PLACEBO grid of identical density.
//
//  H5 THE 600 BOUNDARY EDGES. The mesh is not closed. MEASURE: where they are (z, theta, r), how much area
//     they touch, and whether they coincide with the defect.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PARTITION — PRE-REGISTERED PRIORITY ORDER, FIRST MATCH WINS, SHARES SUM TO 100%
//
//   P0 DEGENERATE   the facet normal is NOT DETERMINED by the f32 STL data (see the floor derivation in
//                   Stage 2). No angular statement about it is admissible, so it is removed FIRST.
//   P1 BOUNDARY     the facet carries a boundary or non-manifold edge (H5).
//   P2 FOLD         the facet's SIGNED (r*theta, z) projected area has the minority sign => the mesh is
//                   not a consistent graph there. Analytic-free, indisputable, and no orientation or
//                   density operator repairs it.
//   P3 ACCURATE     normDeg <= ACC_BAR. Correct geometry rendering a real dihedral (the Gothic class).
//                   NOT a defect. IRREDUCIBLE.
//   P4 TURN-INSIDE  coneLo >= TURN_BAR. The analytic normal cone inside the footprint is PROVABLY wide;
//                   no facet plane can fit. Split by the offset-shrink test into
//                     P4a CREASE  (holdRatio >= HOLD_HI)  => operator = ALIGN / conform
//                     P4b SMOOTH  (holdRatio <= HOLD_LO)  => operator = REFINE / density
//                     P4c MIXED   (in between)
//   P5 SLIVER       aspect >= ASPECT_BAR. The field is fine; the triangle is a needle and its normal is
//                   hyper-sensitive to vertex sag.                => operator = COLLAPSE
//   P6 MIS-ORIENTED coneHi < TURN_BAR (the surface provably does NOT turn) and normDeg > ACC_BAR.
//                                                                 => operator = RE-PLACE / FLIP
//   P7 UNDECIDED    coneLo < TURN_BAR <= coneHi. The bracket does not close at this k. Reported, never
//                   silently folded into a neighbour.
//
// The order is a CHOICE, so the SHAPE-FIRST alternative (P5 promoted above P3) is computed as a second
// complete partition and the raw INDICATOR OVERLAP MATRIX is printed. Nothing hides behind the ordering.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR INSTRUMENT SCARS — ALL FOUR OBEYED, EXPLICITLY
//   1 inset   PASSED EXPLICITLY and SWEPT {0, 0.02, 0.05, 0.1}. Reference = 0.05.
//   2 k       SWEPT {4,8,12,16} with the convergence SHOWN. spreadRad is NOT quoted as a converged number.
//   3 h       *** SWEPT {2e-6, 2e-5, 2e-4, 1e-3, 5e-3} ON EVERY normDeg AND EVERY CONE QUOTED, AND THE
//             WHOLE PARTITION IS RE-RUN AT EACH h. *** A class share that moves is declared h-UNSTABLE.
//   4 cuts    ACC_BAR, TURN_BAR, ASPECT_BAR, HOLD_LO/HI and the graphRatio curtain cut are each swept and
//             the ladder printed.
//
// MEASUREMENT DISCIPLINE
//   * COUNT + AREA-share + MAX together, PER FACET, never per pair.
//   * STRATIFIED sampling: the >45 class's area is long-tailed, so the facets holding the top half of the
//     class area are measured EXHAUSTIVELY (a HEAVY stratum) and the remainder by golden stride, with a
//     per-stratum ratio estimator. The area denominator is EXACT.
//   * PLACEBO ARMS: (a) the whole classifier against a provably C-infinity truncated cone; (b) a
//     phase-shifted feature-locus grid of identical density.
//   * PRECOND refuses the mesh over 50 um.
//
// Usage: bash research/tools/run-s115-mech.sh   (env PF_S115_STL absolute, PF_S115_STYLE, PF_S115_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, radialNormal } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, dflt: number): number => (process.env[n] === undefined ? dflt : Number(process.env[n]));
const envI = (n: string, dflt: number): number => Math.round(envF(n, dflt));

const STYLE = process.env.PF_S115_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115_STL ?? '';
const TAG = process.env.PF_S115_TAG ?? STYLE;
const OUTDIR = process.env.PF_S115_OUTDIR ?? 'research/exchange/_strataConformBisect/s115mech';

const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;
const TAU = 2 * Math.PI;

const HI_DEG = envF('PF_S115_HI_DEG', 45);        // S108's visibility cut (a CONVENTION, never validated)
const ACC_BAR = envF('PF_S115_ACC', 10);          // S112's ACCURATE bar, deg
const TURN_BAR = envF('PF_S115_TURN', 45);        // cone bar, deg
const ASPECT_BAR = envF('PF_S115_ASPECT', 20);    // sliver bar, longestEdge/minAlt
const HOLD_HI = envF('PF_S115_HOLDHI', 0.5);      // holdRatio >= => CREASE
const HOLD_LO = envF('PF_S115_HOLDLO', 0.125);    // holdRatio <= => SMOOTH
const K_REF = envI('PF_S115_K', 8);
const INSET_REF = envF('PF_S115_INSET', 0.05);
// *** SCAR 3. The campaign default is 2e-4. THE SMOKE RUN MEASURED THAT AS ALREADY INFLATED on this style
// (P4-TURN share 8.4% at h<=2e-5 vs 14.1% at 2e-4 vs 17.7% at 5e-3), while h=2e-6 and h=2e-5 agree to the
// printed digit. The h-CONVERGED value is therefore the reference and 2e-4 is carried in the ladder as the
// campaign-comparability point, clearly labelled. ***
const H_REF = envF('PF_S115_HFD', 2e-6);
const FOLD_MARGIN = envF('PF_S115_FOLDMARGIN', 3);   // how many f32 normal-uncertainty sigmas a sign needs
const BLADE_BAR = envF('PF_S115_BLADE', 175);        // deg: adjacent dihedral above which the mesh DOUBLES BACK
const CURTAIN_RATIO = envF('PF_S115_CURTAIN', 8);
const HEAVY_CAP = envI('PF_S115_HEAVY', 40000);
const TAIL_N = envI('PF_S115_TAILN', 20000);
const SHRINK_N = envI('PF_S115_SHRINKN', 2500);   // per stratum
const LAD_N = envI('PF_S115_LADN', 1200);         // h / k / inset ladder subsample (per stratum)
const H_LADDER = (process.env.PF_S115_HLADDER ?? '2e-8,2e-7,2e-6,2e-5,2e-4,1e-3,5e-3').split(',').map(Number);
const K_LADDER = (process.env.PF_S115_KLADDER ?? '4,8,12,16,24,32').split(',').map(Number);
const INSETS = (process.env.PF_S115_INSETS ?? '0,0.02,0.05,0.1').split(',').map(Number);
const SHRINK_STEPS = envI('PF_S115_SHRINKSTEPS', 6);
const SHRINK_SCAN = envI('PF_S115_SHRINKSCAN', 9);

if (STL.length === 0) { log('*** PF_S115_STL is required (ABSOLUTE path). ***'); process.exit(2); }

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f4 = (v: number): string => (Number.isFinite(v) ? v.toFixed(4) : '—');
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');

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
/** The PLACEBO analytic: a provably C-infinity truncated cone. Nothing on it is a crease or a turn. */
const rFlat = (_th: number, z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (Math.min(H, Math.max(0, z)) / H);

const OUT: Record<string, unknown> = {
  style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS,
  cuts: { HI_DEG, ACC_BAR, TURN_BAR, ASPECT_BAR, HOLD_HI, HOLD_LO, K_REF, INSET_REF, H_REF, CURTAIN_RATIO },
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 — MECHANISM PARTITION OF THE REDUCIBLE DEFECT — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`dims  H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`defs  ${Object.entries(DEFAULTS).map(([kk, v]) => `${kk}=${v}`).join(' ')}`);
log(`cuts  hi>${HI_DEG}deg  acc<=${ACC_BAR}deg  turn>=${TURN_BAR}deg  aspect>=${ASPECT_BAR}  hold ${HOLD_LO}/${HOLD_HI}  k=${K_REF} inset=${INSET_REF} h=${H_REF}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE NORMAL SAMPLERS — inline copies of orientRuler's fdNormals / fdNormalsCentral with h as an ARGUMENT
// (a closure per h would allocate 60 M times). CONTROL C0 below diffs them against the library bodies.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
type RadFn = (th: number, z: number) => number;
/** side channel: the r0 of the last fdCands call, so the sag loop does not pay a second rA. */
let LAST_R0 = 0;
function fdCands(rf: RadFn, th: number, z: number, hh: number, out: Float64Array): number {
  const r0 = rf(th, z);
  LAST_R0 = r0;
  const hTh = hh / Math.max(1e-9, Math.abs(r0));
  const rP = rf(th + hTh, z); const rM = rf(th - hTh, z);
  let zLo = z - hh; let zHi = z + hh;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * hh); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * hh); }
  const rZp = rf(th, zHi); const rZm = rf(th, zLo);
  const dz = zHi - zLo;
  const rzF = dz > 0 ? (rZp - r0) / Math.max(1e-300, zHi - z) : 0;
  const rzB = dz > 0 ? (r0 - rZm) / Math.max(1e-300, z - zLo) : 0;
  const rtF = (rP - r0) / hTh;
  const rtB = (r0 - rM) / hTh;
  let n = 0;
  const rt4 = [rtF, rtF, rtB, rtB]; const rz4 = [rzF, rzB, rzF, rzB];
  for (let ci = 0; ci < 4; ci += 1) {
    radialNormal(r0, rt4[ci], rz4[ci], th, out, 3 * n);
    let dup = false;
    for (let j = 0; j < n; j += 1) {
      const dd = 1 - (out[3 * n] * out[3 * j] + out[3 * n + 1] * out[3 * j + 1] + out[3 * n + 2] * out[3 * j + 2]);
      if (dd <= 1e-12) { dup = true; break; }
    }
    if (!dup) n += 1;
  }
  return n === 0 ? 1 : n;
}
function fdCentral(rf: RadFn, th: number, z: number, hh: number, out: Float64Array, o: number): void {
  const r0 = rf(th, z);
  const hTh = hh / Math.max(1e-9, Math.abs(r0));
  const rt = (rf(th + hTh, z) - rf(th - hTh, z)) / (2 * hTh);
  let zLo = z - hh; let zHi = z + hh;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * hh); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * hh); }
  const rz = zHi > zLo ? (rf(th, zHi) - rf(th, zLo)) / (zHi - zLo) : 0;
  radialNormal(r0, rt, rz, th, out, o);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD + PRECOND (CONTROL C1) + SAMPLER IDENTITY (CONTROL C0)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);

let VOID_REASON = '';
{
  const step = Math.max(1, Math.floor(nTri / 20000));
  const devs: number[] = []; let worst = 0;
  for (let f = 0; f < nTri; f += step) {
    for (let kk = 0; kk < 3; kk += 1) {
      const x = xyz[f * 9 + kk * 3]; const y = xyz[f * 9 + kk * 3 + 1]; const z = xyz[f * 9 + kk * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      devs.push(dd * 1000); if (dd > worst) worst = dd;
    }
  }
  log('── STAGE 0 / CONTROL C1: PRECOND  max |r_mesh - rA| (registry defaults, stride sample) ──');
  log(`  samples ${devs.length}   |dr| p50 ${q(devs, 0.5).toExponential(3)}  p99 ${q(devs, 0.99).toExponential(3)}  MAX ${(worst * 1000).toFixed(4)} um   (gate 50 um)`);
  OUT.precond = { maxUm: worst * 1000, p50Um: q(devs, 0.5), p99Um: q(devs, 0.99), samples: devs.length };
  if (worst * 1000 > 50) {
    log(`  ██ *** MESH REFUSED: PRECOND ${(worst * 1000).toFixed(2)} um > 50 um. *** THIS IS A RESULT, NOT A GAP.`);
    OUT.verdict = 'REFUSED-PRECOND';
    writeFileSync(`${OUTDIR}/S115_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
    process.exit(0);
  }
}
{
  // C0 — the inline samplers must be BIT-IDENTICAL to orientRuler's. A silent divergence here would make
  // every number below a measurement of a private surface. Diffed at three h over a lattice.
  const a = new Float64Array(12); const b = new Float64Array(12);
  let maxDiff = 0; let nChk = 0; let cntDiff = 0;
  for (const hh of [2e-6, 2e-4, 5e-3]) {
    const ns = fdNormals(rA, H, hh, hh);
    for (let i = 0; i < 400; i += 1) {
      const th = (i * 0.6180339887) * TAU; const z = ((i * 0.3819660113) % 1) * H;
      const na = ns(th, z, a); const nb = fdCands(rA, th, z, hh, b);
      nChk += 1; if (na !== nb) cntDiff += 1;
      for (let j = 0; j < Math.min(na, nb) * 3; j += 1) maxDiff = Math.max(maxDiff, Math.abs(a[j] - b[j]));
    }
  }
  log(`── STAGE 0 / CONTROL C0: inline sampler vs orientRuler.fdNormals over ${nChk} points x 3 h ──`);
  log(`  candidate-count mismatches ${cntDiff}   max |component diff| ${maxDiff.toExponential(3)}   ${cntDiff === 0 && maxDiff === 0 ? 'BIT-IDENTICAL — OK' : '*** CONTROL C0 FIRED ***'}`);
  OUT.c0 = { n: nChk, countMismatch: cntDiff, maxDiff };
  if (cntDiff !== 0 || maxDiff !== 0) VOID_REASON = 'C0 sampler identity';
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — DIHEDRAL + THE >45 CLASS (analytic-free, EXHAUSTIVE)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
const hiThr = (HI_DEG * Math.PI) / 180;
const clsIdx: number[] = [];
let clsArea = 0;
for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) { clsIdx.push(f); clsArea += d.areaMm2[f]; }
log(`── STAGE 1: DIHEDRAL (EXHAUSTIVE)  ${el()} ──`);
log(`  facets ${nTri}   AREA ${meshArea.toFixed(3)} mm2   mean facet ${(meshArea / nTri).toExponential(3)} mm2`);
log(`  edges: interior ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent-winding ${d.inconsistentEdges}`);
log(`  *** THE >${HI_DEG} DEG CLASS: COUNT ${clsIdx.length} (${pct(clsIdx.length, nTri)}%)  AREA ${clsArea.toFixed(4)} mm2 = ${pct(clsArea, meshArea)}% of mesh ***`);
log(`  class mean facet area ${(clsArea / clsIdx.length).toExponential(3)} mm2 = ${((clsArea / clsIdx.length) / (meshArea / nTri)).toFixed(3)}x the whole-mesh mean`);
OUT.stage1 = {
  facets: nTri, areaMm2: meshArea, interiorEdges: d.interiorEdges, boundaryEdges: d.boundaryEdges,
  nonManifoldEdges: d.nonManifoldEdges, inconsistentEdges: d.inconsistentEdges,
  hiFacets: clsIdx.length, hiAreaMm2: clsArea, hiAreaPctOfMesh: (clsArea / meshArea) * 100,
};
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// GEOMETRY — EXHAUSTIVE, ANALYTIC-FREE SHAPE CENSUS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
/** f32 ulp at |x| — the STL stores coordinates as f32 (readMeshFloat64 reads readFloatLE). */
const ulpOf = (x: number): number => {
  const a = Math.abs(x);
  if (!(a > 0)) return 2 ** -149;
  return 2 ** (Math.floor(Math.log2(a)) - 23);
};

const minAlt = new Float64Array(nTri);      // mm — 2*area/longestEdge
const aspect = new Float64Array(nTri);      // longestEdge/minAlt
const gRatio = new Float64Array(nTri);      // 3D area / |(r*theta, z) projected area|
const signedPA = new Float64Array(nTri);    // SIGNED (r*theta, z) projected area
const angUnc = new Float64Array(nTri);      // deg of facet-normal uncertainty from f32 quantisation
const rDot = new Float64Array(nTri);        // wound facet normal . outward radial unit vector at the centroid
const edgeLenAll: number[] = [];
{
  const t = Date.now();
  for (let f = 0; f < nTri; f += 1) {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const eAB = Math.hypot(bx - ax, by - ay, bz - az);
    const eBC = Math.hypot(cx - bx, cy - by, cz - bz);
    const eCA = Math.hypot(ax - cx, ay - cy, az - cz);
    const L = Math.max(eAB, eBC, eCA);
    const a3 = d.areaMm2[f];
    const alt = L > 0 ? (2 * a3) / L : 0;
    minAlt[f] = alt;
    aspect[f] = alt > 0 ? L / alt : Infinity;
    const [ath, bth, cth] = th3(f);
    const rR = rRefOf(f);
    const sp = 0.5 * ((rR * (bth - ath)) * (cz - az) - (bz - az) * (rR * (cth - ath)));
    signedPA[f] = sp;
    gRatio[f] = Math.abs(sp) > 1e-15 ? a3 / Math.abs(sp) : Infinity;
    const qz = Math.max(ulpOf(ax), ulpOf(ay), ulpOf(az), ulpOf(bx), ulpOf(by), ulpOf(bz), ulpOf(cx), ulpOf(cy), ulpOf(cz));
    angUnc[f] = alt > 0 ? Math.atan(qz / alt) * DEG : 180;
    // wound facet normal vs the OUTWARD RADIAL direction. For ANY radial surface r=rA(th,z) the analytic
    // normal has a STRICTLY POSITIVE radial component (it is exactly r, before normalisation — see
    // orientRuler.radialNormal), so `rDot < 0` is an INVERTED facet and needs no analytic evaluation at
    // all. It is also the honest CURTAIN measure: |rDot| -> 0 is a facet edge-on to the radial direction,
    // and such a facet's orientation sign is decided on a quantity that vanishes for it.
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 0) { nx /= nl; ny /= nl; nz /= nl; }
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    const gl = Math.hypot(gx, gy);
    rDot[f] = gl > 0 ? (nx * gx + ny * gy) / gl : 0;
    void nz;
    if (f % 37 === 0) { edgeLenAll.push(eAB, eBC, eCA); }
  }
  log(`── STAGE 2: EXHAUSTIVE SHAPE CENSUS (analytic-free)  [${((Date.now() - t) / 1000).toFixed(1)}s] ──`);
}
// per-facet interior-edge incidence -> BOUNDARY-TOUCHING facets (H5). Free from facetDihedrals' edge list.
const incid = new Uint8Array(nTri);
for (let e = 0; e < d.edgeF1.length; e += 1) { incid[d.edgeF1[e]] += 1; incid[d.edgeF2[e]] += 1; }
const isBoundary = (f: number): boolean => incid[f] < 3;
// FOLD, WITH A DERIVED DETERMINACY BAND. `rDot < 0` is inversion; but the STL is f32 and the facet normal
// carries `angUnc` degrees of quantisation uncertainty, so |rDot| must clear sin(FOLD_MARGIN*angUnc)
// before the sign means anything. Without this band the census counts fp noise on edge-on facets as
// topological folds — the exact shape of the four instrument scars this campaign has already paid for.
const foldBand = (f: number): number => Math.sin(Math.min(Math.PI / 2, (FOLD_MARGIN * angUnc[f] * Math.PI) / 180));
const isFold = (f: number): boolean => rDot[f] < 0 && Math.abs(rDot[f]) > foldBand(f);
const isSignUndet = (f: number): boolean => Math.abs(rDot[f]) <= foldBand(f);
let nPos = 0; let nNeg = 0;
for (let f = 0; f < nTri; f += 1) { if (rDot[f] > 0) nPos += 1; else if (rDot[f] < 0) nNeg += 1; }

const ALT_FLOOR_DEG = HI_DEG;   // "not determined" = f32 quantisation can move the normal by the class bar
const isDegen = (f: number): boolean => !(d.areaMm2[f] > 0) || angUnc[f] > ALT_FLOOR_DEG;
/**
 * BLADE — the mesh DOUBLES BACK on itself: a facet whose max adjacent dihedral is ~180 deg, i.e. it is
 * near-coplanar with a neighbour and their normals are OPPOSITE. A zero-thickness fin.
 *
 * WHY IT IS UNAMBIGUOUS, unlike every other test in this file. It uses NO analytic surface, NO parameter
 * projection and NO centroid reference, so none of the three degeneracies that bite the other tests on a
 * near-vertical facet can touch it. And it is well DETERMINED: the two facets carrying a blade on this
 * mesh have min altitudes ~0.13 mm, so their f32 normal uncertainty is ~0.003 deg against a 5 deg band.
 */
const isBlade = (f: number): boolean => d.perFacetMaxRad[f] * DEG >= BLADE_BAR;

{
  const sel = (arr: Float64Array, idx: number[] | null): number[] => {
    if (idx === null) { const o: number[] = []; for (let f = 0; f < nTri; f += 32) o.push(arr[f]); return o; }
    return idx.map((f) => arr[f]);
  };
  const eL = edgeLenAll;
  log(`  MESH EDGE LENGTH (stride sample n=${eL.length}): p10 ${q(eL, 0.1).toExponential(3)} p50 ${q(eL, 0.5).toExponential(3)} p90 ${q(eL, 0.9).toExponential(3)} MAX ${q(eL, 1).toFixed(4)} mm`);
  log('');
  log('  QUANTITY            WHOLE MESH (stride/32)                        >45 CLASS (exhaustive)               ENRICH');
  const row = (name: string, arr: Float64Array, fmt: (v: number) => string): void => {
    const w = sel(arr, null); const c = sel(arr, clsIdx);
    const e50 = q(c, 0.5) / Math.max(1e-30, q(w, 0.5));
    log(`  ${name.padEnd(18)} p10 ${fmt(q(w, 0.1))} p50 ${fmt(q(w, 0.5))} p90 ${fmt(q(w, 0.9))}   p10 ${fmt(q(c, 0.1))} p50 ${fmt(q(c, 0.5))} p90 ${fmt(q(c, 0.9))}   ${Number.isFinite(e50) ? `${e50.toFixed(3)}x` : '—'}`);
  };
  const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(2).padStart(9) : '      inf');
  row('minAltitude mm', minAlt, ex);
  row('aspect L/alt', aspect, ex);
  row('graphRatio', gRatio, ex);
  row('area mm2', d.areaMm2, ex);
  row('normalUnc deg', angUnc, ex);
  log('');
  // *** THE SLIVER LADDER — the ASPECT_BAR is a measurement choice, so it is SWEPT. ***
  log('  H1 SLIVER LADDER — COUNT and AREA share at each aspect bar, class vs WHOLE-MESH control:');
  log('    aspectBar        >45 CLASS count%   >45 CLASS area%      WHOLE MESH count%   WHOLE MESH area%    AREA ENRICH');
  const sladder: Array<Record<string, number>> = [];
  for (const bar of [4, 8, 12, 20, 32, 64, 128, 512]) {
    let cN = 0; let cA = 0;
    for (const f of clsIdx) if (aspect[f] >= bar) { cN += 1; cA += d.areaMm2[f]; }
    let wN = 0; let wA = 0; let wT = 0;
    for (let f = 0; f < nTri; f += 1) { wT += 1; if (aspect[f] >= bar) { wN += 1; wA += d.areaMm2[f]; } }
    const enr = (cA / Math.max(1e-30, clsArea)) / Math.max(1e-30, wA / meshArea);
    log(`    >= ${String(bar).padStart(4)}       ${pct(cN, clsIdx.length).padStart(10)}%      ${pct(cA, clsArea).padStart(10)}%        ${pct(wN, wT).padStart(10)}%       ${pct(wA, meshArea).padStart(10)}%       ${Number.isFinite(enr) ? `${enr.toFixed(3)}x` : '—'}`);
    sladder.push({ bar, clsCountPct: (cN / clsIdx.length) * 100, clsAreaPct: (cA / clsArea) * 100, meshCountPct: (wN / wT) * 100, meshAreaPct: (wA / meshArea) * 100, areaEnrich: enr });
  }
  log('    READ: ENRICH ~1x means slivers are NO MORE COMMON in the defect class than in the mesh at large,');
  log('    i.e. the sliver population is not what selects the class. H1 requires ENRICH >> 1.');
  // f32 determinacy ladder
  log('');
  log('  P0 DETERMINACY LADDER — f32 quantisation (STL stores f32; ulp ~4e-6 mm at r=45, ~7.6e-6 mm at z=100):');
  log('    the facet normal carries this much uncertainty from vertex quantisation alone: q/minAlt.');
  const dladder: Array<Record<string, number>> = [];
  for (const bar of [45, 10, 5, 1, 0.1]) {
    let cN = 0; let cA = 0;
    for (const f of clsIdx) if (angUnc[f] > bar) { cN += 1; cA += d.areaMm2[f]; }
    log(`    normal uncertainty > ${String(bar).padStart(4)} deg:  >45 class COUNT ${String(cN).padStart(8)} (${pct(cN, clsIdx.length).padStart(8)}%)  AREA ${pct(cA, clsArea).padStart(8)}% of class`);
    dladder.push({ bar, count: cN, countPct: (cN / clsIdx.length) * 100, areaPctOfClass: (cA / clsArea) * 100 });
  }
  OUT.stage2 = { sliverLadder: sladder, determinacyLadder: dladder, edgeLenP50: q(eL, 0.5), edgeLenP90: q(eL, 0.9) };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — H5: THE 600 BOUNDARY EDGES, AND H-FOLD: PARAMETER-SPACE INVERSION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const bF: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (isBoundary(f)) bF.push(f);
  let bA = 0; for (const f of bF) bA += d.areaMm2[f];
  const zs = bF.map((f) => (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3);
  const ths = bF.map((f) => ((Math.atan2(xyz[f * 9 + 1], xyz[f * 9]) * DEG) + 360) % 360);
  const rs = bF.map((f) => rRefOf(f));
  let inCls = 0; let inClsA = 0;
  for (const f of bF) if (d.perFacetMaxRad[f] > hiThr) { inCls += 1; inClsA += d.areaMm2[f]; }
  log('── STAGE 3 / H5: THE BOUNDARY EDGES — the mesh is not closed. WHERE, AND DOES IT COINCIDE? ──');
  log(`  boundary edges ${d.boundaryEdges}   boundary-TOUCHING facets ${bF.length}  AREA ${bA.toExponential(4)} mm2 = ${pct(bA, meshArea)}% of mesh`);
  log(`  z of those facets:     MIN ${f4(q(zs, 0))} p10 ${f4(q(zs, 0.1))} p50 ${f4(q(zs, 0.5))} p90 ${f4(q(zs, 0.9))} MAX ${f4(q(zs, 1))} mm   (pot H=${H})`);
  log(`  r of those facets:     MIN ${f4(q(rs, 0))} p50 ${f4(q(rs, 0.5))} MAX ${f4(q(rs, 1))} mm`);
  log(`  theta spread:          MIN ${f2(q(ths, 0))} p50 ${f2(q(ths, 0.5))} MAX ${f2(q(ths, 1))} deg`);
  const atRim = zs.filter((z) => z < 0.5 || z > H - 0.5).length;
  log(`  within 0.5 mm of a RIM (z<0.5 or z>${H - 0.5}): ${atRim}/${bF.length} = ${pct(atRim, bF.length)}%`);
  log(`  overlap with the >${HI_DEG} class: COUNT ${inCls} (${pct(inCls, bF.length)}% of boundary facets, ${pct(inCls, clsIdx.length)}% of the class)  AREA ${pct(inClsA, clsArea)}% of the class`);
  log(`  >>> H5 VERDICT: ${atRim === bF.length ? 'the open boundary is EXACTLY the two open rims of this WALL-ONLY ring STL — expected for this artefact, NOT a defect of the wall mesh.' : 'the open boundary is NOT confined to the rims — there is a genuine HOLE.'}`);
  OUT.h5boundary = {
    boundaryEdges: d.boundaryEdges, facets: bF.length, areaMm2: bA, areaPctOfMesh: (bA / meshArea) * 100,
    zMin: q(zs, 0), zMax: q(zs, 1), atRimPct: (atRim / Math.max(1, bF.length)) * 100,
    inClassCount: inCls, inClassAreaPctOfClass: (inClsA / Math.max(1e-30, clsArea)) * 100,
  };
  log('');
  // FOLD / INVERSION, WITH THE DERIVED f32 DETERMINACY BAND
  log('── STAGE 3b / P2 INVERTED: `n_wound . r_hat` — an ANALYTIC-FREE back-facing test with a DERIVED f32 band ──');
  log('  For any radial surface the analytic normal has a strictly positive RADIAL component (= r), so');
  log('  rDot = n_wound . r_hat < 0 IS inversion. The band is sin(FOLD_MARGIN * angUnc): below it the sign');
  log('  is decided on a quantity that vanishes for exactly the facets being decided about.');
  log(`  raw sign census: positive ${nPos}  negative ${nNeg}  zero ${nTri - nPos - nNeg}   (FOLD_MARGIN=${FOLD_MARGIN})`);
  const fl: Array<Record<string, number>> = [];
  for (const marg of [0, 1, 3, 10, 30, 100]) {
    let n1 = 0; let a1 = 0; let n2 = 0; let a2 = 0; let cN = 0; let cA = 0;
    for (let f = 0; f < nTri; f += 1) {
      const band = Math.sin(Math.min(Math.PI / 2, (marg * angUnc[f] * Math.PI) / 180));
      if (Math.abs(rDot[f]) <= band) { n2 += 1; a2 += d.areaMm2[f]; } else if (rDot[f] < 0) {
        n1 += 1; a1 += d.areaMm2[f];
        if (d.perFacetMaxRad[f] > hiThr) { cN += 1; cA += d.areaMm2[f]; }
      }
    }
    log(`    margin ${String(marg).padStart(4)} sigma:  DETERMINED-INVERTED ${String(n1).padStart(7)} (${pct(a1, meshArea).padStart(8)}% of mesh)   SIGN-UNDETERMINED ${String(n2).padStart(7)} (${pct(a2, meshArea).padStart(8)}% of mesh)   inverted within the >45 class ${pct(cA, clsArea).padStart(8)}% of class AREA`);
    fl.push({ marg, invCount: n1, invAreaPctOfMesh: (a1 / meshArea) * 100, undetCount: n2, undetAreaPctOfMesh: (a2 / meshArea) * 100, invAreaPctOfClass: (cA / clsArea) * 100 });
  }
  log('    READ: if DETERMINED-INVERTED barely moves across the margin ladder, the inversions are REAL');
  log('    topology. If it collapses, the census was reading f32 noise on edge-on facets.');
  const rd = clsIdx.map((f) => Math.abs(rDot[f]));
  const rdAll: number[] = []; for (let f = 0; f < nTri; f += 32) rdAll.push(Math.abs(rDot[f]));
  log(`  |rDot| (0 = facet exactly EDGE-ON to the radial direction; the honest CURTAIN measure):`);
  log(`    whole mesh  p10 ${f4(q(rdAll, 0.1))} p50 ${f4(q(rdAll, 0.5))} p90 ${f4(q(rdAll, 0.9))}`);
  log(`    >45 class   p10 ${f4(q(rd, 0.1))} p50 ${f4(q(rd, 0.5))} p90 ${f4(q(rd, 0.9))}`);
  // ── CROSS-CHECK: rDot's sign against the SIGNED PARAMETER AREA's sign. For a graph r=rA(theta,z) the
  // 3D facet normal is (dTh_B*dZ_C - dZ_B*dTh_C) * (dP/dth x dP/dz) to first order, and dP/dth x dP/dz has
  // radial component exactly r > 0 — so the two signs must AGREE. They are computed from completely
  // different arithmetic, so a disagreement means one of them is fp noise and the census is unsafe.
  let agree = 0; let disagree = 0; let disA = 0;
  let sPos = 0; let sNeg = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (signedPA[f] > 0) sPos += 1; else if (signedPA[f] < 0) sNeg += 1;
    const sMaj = signedPA[f] > 0 ? 1 : -1;
    if ((rDot[f] > 0 ? 1 : -1) === sMaj) agree += 1; else { disagree += 1; disA += d.areaMm2[f]; }
  }
  log('  CROSS-CHECK — sign(rDot) vs sign(SIGNED PARAMETER AREA). These coincide only in the SMALL-TRIANGLE');
  log('  LIMIT: n_3D = (dTh_B*dZ_C - dZ_B*dTh_C)(dP/dth x dP/dz) + O(2nd order), and the second-order term is');
  log('  NOT small on a facet spanning a 2.5 mm radial swing. So a divergence here is EXPECTED on the steep');
  log('  class and is NOT evidence against either. *** rDot IS THE PRIMARY: it is the exact 3D statement');
  log('  "this facet\'s outward-wound normal points INTO the solid", which is the visible/printable defect.');
  log('  The parameter-area sign is a topological statement about the mesh\'s parameterisation. ***');
  log(`    param-area sign census: positive ${sPos}  negative ${sNeg}`);
  log(`    same-sign ${agree} (${pct(agree, nTri)}%)   different-sign ${disagree} (${pct(disagree, nTri)}%, ${pct(disA, meshArea)}% of mesh AREA)`);
  log('    (a different-sign count comparable to the inverted population means the two labels select');
  log('     LARGELY DIFFERENT facets — i.e. back-facing and parameter-fold are separate defects here.)');
  // ── The mesh is CONSISTENTLY WOUND (inconsistentEdges = 0), so no facet is flipped RELATIVE TO ITS
  // NEIGHBOURS. An inward-pointing facet in a coherently-oriented sheet is therefore a GEOMETRIC fold of
  // the sheet, not a winding error — which is a different (and worse) defect.
  let fdIn = 0; let fdInA = 0; let fdTot = 0; let fdTotA = 0;
  for (let f = 0; f < nTri; f += 1) if (isFold(f)) { fdTot += 1; fdTotA += d.areaMm2[f]; if (d.perFacetMaxRad[f] > hiThr) { fdIn += 1; fdInA += d.areaMm2[f]; } }
  log(`  the inverted facets are ${pct(fdIn, fdTot)}% by COUNT / ${pct(fdInA, fdTotA)}% by AREA inside the >${HI_DEG} dihedral class`);
  log(`  and inconsistentEdges = ${d.inconsistentEdges}: the sheet is COHERENTLY WOUND, so these are not`);
  log('  individually flipped triangles — the SHEET ITSELF turns to face inward there.');
  OUT.p2fold = {
    ladder: fl, rDotClassP10: q(rd, 0.1), rDotClassP50: q(rd, 0.5), rDotMeshP50: q(rdAll, 0.5),
    crossCheckAgreePct: (agree / nTri) * 100, crossCheckDisagreeAreaPct: (disA / meshArea) * 100,
    foldTotal: fdTot, foldTotalAreaMm2: fdTotA, foldInClassPct: (fdIn / Math.max(1, fdTot)) * 100,
    foldInClassAreaPct: (fdInA / Math.max(1e-30, fdTotA)) * 100,
    foldAreaPctOfClass: (fdInA / clsArea) * 100,
  };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3c — THE BLADE CENSUS, AND THE ANALYTIC CEILING ON A HONEST DIHEDRAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  log('── STAGE 3c: BLADES — does the mesh DOUBLE BACK on itself? (analytic-free, EXHAUSTIVE) ──');
  log('  A dihedral near 180 deg means two adjacent facets are near-COPLANAR with OPPOSITE normals: a');
  log('  zero-thickness fin. No analytic surface, no parameter projection, no centroid reference — so');
  log('  none of the degeneracies that bite the other tests on a near-vertical facet apply here.');
  log('   bar (deg)     facets      count% of mesh    AREA% of mesh    AREA% of the >45 class   minAlt p50 mm   angUnc p50 deg');
  const bl: Array<Record<string, number>> = [];
  for (const bar of [150, 165, 170, 175, 178, 179, 179.9, 179.99]) {
    const th = (bar * Math.PI) / 180;
    let n = 0; let a = 0; let ca = 0; const alts: number[] = []; const uncs: number[] = [];
    for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] >= th) {
      n += 1; a += d.areaMm2[f]; if (d.perFacetMaxRad[f] > hiThr) ca += d.areaMm2[f];
      if (n % 7 === 0) { alts.push(minAlt[f]); uncs.push(angUnc[f]); }
    }
    log(`   >= ${String(bar).padStart(7)}  ${String(n).padStart(9)}   ${pct(n, nTri).padStart(12)}%   ${pct(a, meshArea).padStart(12)}%   ${pct(ca, clsArea).padStart(20)}%   ${q(alts, 0.5).toExponential(2).padStart(12)}   ${q(uncs, 0.5).toExponential(2).padStart(12)}`);
    bl.push({ bar, count: n, countPctOfMesh: (n / nTri) * 100, areaPctOfMesh: (a / meshArea) * 100, areaPctOfClass: (ca / clsArea) * 100, minAltP50: q(alts, 0.5), angUncP50: q(uncs, 0.5) });
  }
  // A blade PAIR's two facets should be nearly COINCIDENT in space, not merely steeply folded.
  const bth = (BLADE_BAR * Math.PI) / 180;
  const seps: number[] = []; const diams: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length && seps.length < 5000; e += 1) {
    if (!(d.edgeAngRad[e] >= bth)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const c1x = (xyz[f1 * 9] + xyz[f1 * 9 + 3] + xyz[f1 * 9 + 6]) / 3;
    const c1y = (xyz[f1 * 9 + 1] + xyz[f1 * 9 + 4] + xyz[f1 * 9 + 7]) / 3;
    const c1z = (xyz[f1 * 9 + 2] + xyz[f1 * 9 + 5] + xyz[f1 * 9 + 8]) / 3;
    const c2x = (xyz[f2 * 9] + xyz[f2 * 9 + 3] + xyz[f2 * 9 + 6]) / 3;
    const c2y = (xyz[f2 * 9 + 1] + xyz[f2 * 9 + 4] + xyz[f2 * 9 + 7]) / 3;
    const c2z = (xyz[f2 * 9 + 2] + xyz[f2 * 9 + 5] + xyz[f2 * 9 + 8]) / 3;
    seps.push(Math.hypot(c1x - c2x, c1y - c2y, c1z - c2z));
    let dm = 0;
    for (const ff of [f1, f2]) for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      dm = Math.max(dm, Math.hypot(xyz[ff * 9 + i * 3] - xyz[ff * 9 + j * 3], xyz[ff * 9 + i * 3 + 1] - xyz[ff * 9 + j * 3 + 1], xyz[ff * 9 + i * 3 + 2] - xyz[ff * 9 + j * 3 + 2]));
    }
    diams.push(dm);
  }
  const ratio = seps.map((s, i) => s / Math.max(1e-12, diams[i]));
  log(`  BLADE PAIR GEOMETRY at the ${BLADE_BAR} deg bar (n=${seps.length} pairs):`);
  log(`    centroid separation p50 ${q(seps, 0.5).toExponential(2)} mm   pair diameter p50 ${q(diams, 0.5).toExponential(2)} mm   RATIO p50 ${f4(q(ratio, 0.5))}`);
  log('    a RATIO well under 1 means the two facets occupy the SAME PLACE facing OPPOSITE ways — a fin.');
  // *** THE ANALYTIC CEILING. The angle between any two analytic normals is at most 2*atan(max|grad r|),
  // where grad r = (r_theta/r, r_z). A perfectly-placed mesh cannot exceed it. GMAX is measured on a GRID,
  // so it is a LOWER bound on the true max and the ceiling is therefore a LOWER bound too — the ladder is
  // printed so the reader can see it converge instead of taking it on trust. ***
  log('  ANALYTIC CEILING on an HONEST dihedral: 2*atan(max |grad r|), grad r = (r_theta/r, r_z).');
  log('    *** READ THE CONVERGENCE COLUMN, NOT JUST THE NUMBER. A style whose rA is LIPSCHITZ converges');
  log('    (the grid finds the true max and stops moving). A style with a genuine C0 crease does NOT — a');
  log('    finer grid keeps finding steeper points and the ceiling keeps rising, which makes the');
  log('    over-ceiling census CONSERVATIVE for that style rather than wrong. ***');
  log('    grid       max|grad r|   => ceiling deg    p99 |grad r|   (grid scan: a LOWER bound on the true max)');
  const gl: Array<Record<string, number>> = [];
  for (const N of [400, 800, 1600]) {
    let gmax = 0; const gs: number[] = [];
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const th = (TAU * (i + 0.5)) / N; const z = (H * (j + 0.5)) / N;
        const r0 = rA(th, z);
        const hT = H_REF / Math.max(1e-9, r0);
        const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
        const zl = Math.max(0, z - H_REF); const zh = Math.min(H, z + H_REF);
        const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
        const g = Math.hypot(rt / r0, rz);
        if (g > gmax) gmax = g;
        if ((i + j) % 17 === 0) gs.push(g);
      }
    }
    log(`    ${String(N).padStart(4)}^2   ${gmax.toExponential(4).padStart(12)}   ${(2 * Math.atan(gmax) * DEG).toFixed(3).padStart(12)}    ${q(gs, 0.99).toExponential(3).padStart(12)}`);
    gl.push({ grid: N, gmax, ceilingDeg: 2 * Math.atan(gmax) * DEG, gp99: q(gs, 0.99) });
  }
  const ceil = gl[gl.length - 1].ceilingDeg;
  let overN = 0; let overA = 0; let overCA = 0;
  for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] * DEG > ceil) {
    overN += 1; overA += d.areaMm2[f]; if (d.perFacetMaxRad[f] > hiThr) overCA += d.areaMm2[f];
  }
  log(`  *** facets whose dihedral EXCEEDS the measured ceiling ${ceil.toFixed(2)} deg — the analytic surface`);
  log(`      CANNOT produce that angle, so the mesh manufactured it: COUNT ${overN} (${pct(overN, nTri)}% of mesh)`);
  log(`      AREA ${overA.toFixed(3)} mm2 = ${pct(overA, meshArea)}% of mesh = ${pct(overCA, clsArea)}% of the >${HI_DEG} class AREA ***`);
  OUT.blades = { ladder: bl, sepRatioP50: q(ratio, 0.5), gradLadder: gl, ceilingDeg: ceil, overCeilCount: overN, overCeilAreaPctOfMesh: (overA / meshArea) * 100, overCeilAreaPctOfClass: (overCA / clsArea) * 100 };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — H4: THE STYLE'S OWN FEATURE LOCI, RE-DERIVED, WITH THE mm SCALE WORKED OUT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A faithful re-derivation of ONLY the locus-bearing coordinates of `rOuterCelticTriquetra`
// (src/geometry/styles.ts:2142-2417). It is NOT a re-implementation of the radius: it computes the tile
// cell, the ribbon branch and the ribbon distance, which is what a straddle test needs. It is VALIDATED,
// not asserted: Stage 6 cross-tabs the offset-shrink exponent by locus type, and a PHASE-SHIFTED placebo
// grid of identical density is carried alongside.
const CT_NX = Math.max(1, Math.floor((DEFAULTS.ctScaleX ?? 14) + 0.5));
const CT_NY = Math.max(2, Math.floor((DEFAULTS.ctRows ?? 6) + 0.5));
const CT_HW = DEFAULTS.ctWidth ?? 0.18;
const CT_RELIEF = DEFAULTS.ctRelief ?? 2.5;
const CT_MEDR = DEFAULTS.ctMedScale ?? 0.22;
const CT_MEDY = DEFAULTS.ctMedY ?? 0.69;
const CT_FEATHER = 0.02;
const CT_RIMW = 0.008;
const BANDS = [
  { y0: 0.55, y1: 0.88, ny: CT_NY, off: 0 },
  { y0: 0.18, y1: 0.48, ny: Math.max(2, CT_NY - 2), off: 0.5 },
];
/** H4 is CelticTriquetra-specific by construction. On any other style the locus stage is SKIPPED and
 *  reported as skipped, rather than printing a table of another style's tile grid as if it meant
 *  something — which is how a control arm gets quoted for a quantity it never measured. */
const H4_ACTIVE = STYLE === 'CelticTriquetra';
const braidTile = (ix: number, iy: number): number => {
  const xo = (ix & 1) !== 0; const yo = (iy & 1) !== 0;
  if (!yo) return xo ? 2 : 0;
  return xo ? 1 : 2;
};
/** Locus key of a parameter point: an integer signature whose CHANGE across a footprint = a straddle. */
interface LocKey { cell: number; branch: number; edge: number; crest: number; band: number; rim: number; med: number }
function locusKeyAt(th: number, z: number, phase: number): LocKey {
  const t = Math.min(1, Math.max(0, z / H));
  const u = (((th + phase * TAU / CT_NX) / TAU) % 1 + 1) % 1;
  let cell = 0; let branch = 0; let edge = 0; let crest = 0; let band = 0;
  for (let bi = 0; bi < BANDS.length; bi += 1) {
    const B = BANDS[bi];
    const vB = (t - B.y0) / (B.y1 - B.y0);
    // band activation + feather shoulders
    band = band * 8 + (vB < 0 ? 0 : vB > 1 ? 1 : t < B.y0 + CT_FEATHER ? 2 : t > B.y1 - CT_FEATHER ? 3 : 4);
    if (vB < 0 || vB > 1) { cell = cell * 1048573 + 7; branch = branch * 5 + 4; edge = edge * 3 + 2; crest = crest * 3 + 2; continue; }
    const pX = u * CT_NX + B.off; const pY = vB * B.ny;
    const qx = pX + pY; const qy = -pX + pY;
    const ix = Math.floor(qx); const iy = Math.floor(qy);
    const tx = qx - ix; const ty = qy - iy;
    const tid = braidTile(ix, iy);
    let sA: number; let sB: number;
    if (tid === 0) { sA = Math.hypot(tx - 1, ty - 1) - 0.5; sB = Math.hypot(tx, ty) - 0.5; }
    else if (tid === 1) { sA = Math.hypot(tx, ty - 1) - 0.5; sB = Math.hypot(tx - 1, ty) - 0.5; }
    else { sA = tx - 0.5; sB = ty - 0.5; }
    const br = Math.abs(sA) <= Math.abs(sB) ? 0 : 1;
    const sw = br === 0 ? sA : sB;
    cell = cell * 1048573 + (ix * 9176 + iy);
    branch = branch * 5 + br;
    edge = edge * 3 + (Math.abs(sw) >= CT_HW ? 0 : 1);
    crest = crest * 3 + (sw >= 0 ? 0 : 1);
  }
  let rim = 0;
  for (const rc of [0.90, 0.52, 0.15]) rim = rim * 3 + (Math.abs(t - rc) >= CT_RIMW ? 0 : (t >= rc ? 1 : 2));
  const du = ((u - 0.5 + 0.5) % 1 + 1) % 1 - 0.5;
  const px = du / CT_MEDR; const py = (t - CT_MEDY) / CT_MEDR;
  const pLen = Math.hypot(px, py);
  let med = pLen >= 1.1 ? 0 : pLen >= 1 ? 1 : 2;
  if (med === 2) {
    const ang = Math.atan2(py, -px) + Math.PI;
    const sector = Math.floor(ang / (TAU / 3));
    const c = Math.cos(sector * (TAU / 3)); const s = Math.sin(sector * (TAU / 3));
    const prX = px * c - py * s; const prY = px * s + py * c;
    const dArc = Math.abs(Math.hypot(prX, prY - 0.35) - 0.55);
    const hwMed = (CT_HW * 0.55) / Math.max(CT_MEDR, 1e-4);
    med = 3 + sector * 2 + (dArc >= hwMed ? 0 : 1);
  }
  return { cell, branch, edge, crest, band, rim, med };
}
if (!H4_ACTIVE) {
  log(`── STAGE 4 / H4: SKIPPED — the feature-locus stage is CelticTriquetra-specific and STYLE is ${STYLE}. ──`);
  OUT.h4scale = { skipped: true, reason: `style ${STYLE} is not CelticTriquetra` };
} else {
  // *** THE mm SCALE — worked out, printed, and compared against the mesh's own edge length. ***
  const rMid = (DIMS.Rb + DIMS.Rt) / 2;
  const arcPerU = TAU * rMid;                       // mm of arc per unit u
  const dqx_ds = CT_NX / arcPerU;                   // dq_x per mm of arc  (dpX/ds)
  const B = BANDS[0];
  const dpY_dz = B.ny / ((B.y1 - B.y0) * H);        // dpY per mm of z
  const gradQx = Math.hypot(dqx_ds, dpY_dz);        // |grad q_x| per mm
  const tilePitchArc = 1 / dqx_ds;                  // mm of arc per q unit
  const tilePitchZ = 1 / dpY_dz;                    // mm of z per q unit
  const ribbonHalfMm = CT_HW / gradQx;              // shortest crest->edge distance in mm
  // ctRibbonHeight(x) = (1-x)*0.15 + cos(x*pi/2)*0.85, so |dh/dx| at the ribbon EDGE (x=1) is
  // 0.15 + 0.85*pi/2 = 1.485, i.e. 1.485x the mean slope of 1 over the half-width.
  const flankSlope = (CT_RELIEF * 1.485) / ribbonHalfMm;
  log('── STAGE 4 / H4: THE FEATURE LOCI OF CelticTriquetra AND THEIR mm SCALE ──');
  log(`  parameters: Nx=${CT_NX} tiles around, Ny=${CT_NY}/${BANDS[1].ny} rows (upper/lower band), ctWidth(halfW)=${CT_HW}, ctRelief=${CT_RELIEF} mm, ctGap=${DEFAULTS.ctGap}`);
  log(`  bands: upper t in [${BANDS[0].y0}, ${BANDS[0].y1}] => z in [${(BANDS[0].y0 * H).toFixed(1)}, ${(BANDS[0].y1 * H).toFixed(1)}] mm ; lower t in [${BANDS[1].y0}, ${BANDS[1].y1}] => z in [${(BANDS[1].y0 * H).toFixed(1)}, ${(BANDS[1].y1 * H).toFixed(1)}] mm`);
  log(`  the knot grid is floor(qx),floor(qy) with qx=pX+pY, qy=-pX+pY  =>  an INTEGER LATTICE of C1 seams`);
  log(`  ONE q UNIT = ${tilePitchArc.toFixed(3)} mm of ARC  and  ${tilePitchZ.toFixed(3)} mm of Z   (r_mid=${rMid} mm)`);
  log(`  *** RIBBON HALF-WIDTH ctWidth=${CT_HW} q-units = ${ribbonHalfMm.toFixed(4)} mm along the steepest-descent direction ***`);
  log(`  ribbon flank: radius swings ${CT_RELIEF} mm across ${ribbonHalfMm.toFixed(4)} mm of surface => mean |dr/ds| ${(CT_RELIEF / ribbonHalfMm).toFixed(3)}, peak (profile 1.485x) ${flankSlope.toFixed(3)} => flank angle ${(Math.atan(CT_RELIEF / ribbonHalfMm) * DEG).toFixed(1)}-${(Math.atan(flankSlope) * DEG).toFixed(1)} deg from horizontal, i.e. graphRatio ${Math.hypot(1, CT_RELIEF / ribbonHalfMm).toFixed(2)}-${Math.hypot(1, flankSlope).toFixed(2)}`);
  log(`  *** => the STYLE ITSELF cannot make graphRatio much over ${Math.hypot(1, flankSlope).toFixed(1)}. A facet reading 1e3-1e4 is a`);
  log(`      PARAMETER-SPACE NEEDLE (two vertices nearly coincident in (theta,z)), not a steep surface. ***`);
  log(`  band feather ${CT_FEATHER} t-units = ${(CT_FEATHER * H).toFixed(3)} mm of z ; rim line half-width ${CT_RIMW} t-units = ${(CT_RIMW * H).toFixed(3)} mm of z`);
  const eL = edgeLenAll;
  log(`  *** MESH EDGE p50 ${q(eL, 0.5).toExponential(3)} mm  vs  RIBBON HALF-WIDTH ${ribbonHalfMm.toFixed(4)} mm  =>  ${(ribbonHalfMm / q(eL, 0.5)).toFixed(1)} edges span the flank ***`);
  log(`  *** MESH EDGE p50 vs RIM-LINE half-width ${(CT_RIMW * H).toFixed(3)} mm => ${((CT_RIMW * H) / q(eL, 0.5)).toFixed(1)} edges span it ***`);
  OUT.h4scale = {
    tilePitchArcMm: tilePitchArc, tilePitchZMm: tilePitchZ, ribbonHalfMm, flankAngleDeg: Math.atan(flankSlope) * DEG,
    meshEdgeP50: q(eL, 0.5), edgesPerFlank: ribbonHalfMm / q(eL, 0.5),
  };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIELD RULER — one lattice pass returning normDeg, coneLo, coneHi, spreadRad and the cone diameter
// endpoints, at a given (k, inset, h). CROSS-CHECKED against orientOfFacet.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const KMAX = Math.max(...K_LADDER, K_REF);
const CAP = ((KMAX + 1) * (KMAX + 2)) / 2 * 4;
const NBUF = new Float64Array(CAP * 3);
const PTH = new Float64Array(CAP);
const PZ = new Float64Array(CAP);
const SC = new Float64Array(12);
interface FieldOut {
  normDeg: number; coneLo: number; coneHi: number; spreadDeg: number;
  iA: number; iB: number; m: number; overFrac: number; sagMm: number;
}
function fieldOfFacet(f: number, k: number, inset: number, hh: number, rf: RadFn): FieldOut {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 0)) return { normDeg: NaN, coneLo: NaN, coneHi: NaN, spreadDeg: NaN, iA: -1, iB: -1, m: 0, overFrac: NaN, sagMm: NaN };
  fx /= fl; fy /= fl; fz /= fl;
  const [ath, bth, cth] = th3(f);
  const rR = rRefOf(f);
  const sh = 1 - inset; const scw = inset / 3;
  let m = 0; let best = -1; let sx = 0; let sy = 0; let sz = 0; let overN = 0; let sag = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + scw; const wb = sh * (j / k) + scw; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = fdCands(rf, th, z, hh, SC);
      // SAG — the perpendicular distance from the ANALYTIC surface point to the facet PLANE. With minAlt
      // this is S111's "sag over altitude" mechanism written down: a needle facet converts a given sag
      // into atan(sag/minAlt) of normal tilt, while a well-shaped one converts it into far less.
      {
        const sp = Math.abs((LAST_R0 * Math.cos(th) - ax) * fx + (LAST_R0 * Math.sin(th) - ay) * fy + (z - az) * fz);
        if (sp > sag) sag = sp;
      }
      for (let qi = 0; qi < nc; qi += 1) {
        NBUF[m * 3] = SC[qi * 3]; NBUF[m * 3 + 1] = SC[qi * 3 + 1]; NBUF[m * 3 + 2] = SC[qi * 3 + 2];
        PTH[m] = rR * th; PZ[m] = z;
        sx += SC[qi * 3]; sy += SC[qi * 3 + 1]; sz += SC[qi * 3 + 2];
        let dp = fx * SC[qi * 3] + fy * SC[qi * 3 + 1] + fz * SC[qi * 3 + 2];
        dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
        const ang = Math.acos(dp);
        if (ang > best) best = ang;
        if (ang > (5 * Math.PI) / 180) overN += 1;
        m += 1;
      }
    }
  }
  if (m === 0) return { normDeg: NaN, coneLo: NaN, coneHi: NaN, spreadDeg: NaN, iA: -1, iB: -1, m: 0, overFrac: NaN, sagMm: NaN };
  const L = Math.hypot(sx, sy, sz);
  const mnx = L > 0 ? sx / L : 1; const mny = L > 0 ? sy / L : 0; const mnz = L > 0 ? sz / L : 0;
  // coneHi = 2 * max angle from the mean direction: an UPPER bound on the cone diameter (triangle ineq).
  let minDotMean = 1;
  for (let i = 0; i < m; i += 1) {
    const dp = NBUF[i * 3] * mnx + NBUF[i * 3 + 1] * mny + NBUF[i * 3 + 2] * mnz;
    if (dp < minDotMean) minDotMean = dp;
  }
  // *** coneLo = the EXACT DIAMETER over the lattice — every pair, no acos in the inner loop (compare
  // dot products; the angle is monotone decreasing in the dot). At k=8 the lattice carries <= 180 normals,
  // so this is <= 16k comparisons per facet and it removes the UNDECIDED band the 2-pass approximation
  // left. It remains a LOWER bound on the TRUE footprint cone because the lattice is a covering — which is
  // what the k-LADDER is printed for. ***
  let iA = 0; let iB = 0; let minDot = 1;
  if (m <= 320) {
    for (let i = 0; i < m; i += 1) {
      const nix = NBUF[i * 3]; const niy = NBUF[i * 3 + 1]; const niz = NBUF[i * 3 + 2];
      for (let j = i + 1; j < m; j += 1) {
        const dp = nix * NBUF[j * 3] + niy * NBUF[j * 3 + 1] + niz * NBUF[j * 3 + 2];
        if (dp < minDot) { minDot = dp; iA = i; iB = j; }
      }
    }
  } else {
    let iFar = 0; let dmin = 1;
    for (let i = 0; i < m; i += 1) {
      const dp = NBUF[i * 3] * mnx + NBUF[i * 3 + 1] * mny + NBUF[i * 3 + 2] * mnz;
      if (dp < dmin) { dmin = dp; iFar = i; }
    }
    iA = iFar;
    for (let i = 0; i < m; i += 1) {
      const dp = NBUF[i * 3] * NBUF[iFar * 3] + NBUF[i * 3 + 1] * NBUF[iFar * 3 + 1] + NBUF[i * 3 + 2] * NBUF[iFar * 3 + 2];
      if (dp < minDot) { minDot = dp; iB = i; }
    }
  }
  const md = minDot > 1 ? 1 : minDot < -1 ? -1 : minDot;
  const mdm = minDotMean > 1 ? 1 : minDotMean < -1 ? -1 : minDotMean;
  return {
    normDeg: best * DEG, coneLo: Math.acos(md) * DEG, coneHi: Math.min(Math.PI, 2 * Math.acos(mdm)) * DEG,
    spreadDeg: 2 * Math.acos(Math.min(1, L / m)) * DEG, iA, iB, m, overFrac: overN / m, sagMm: sag,
  };
}
{
  // CONTROL C2 — fieldOfFacet's normDeg must equal orientOfFacet's to the last bit on the same inputs.
  const scr = new Float64Array(12);
  const ns = fdNormals(rA, H, H_REF, H_REF);
  let worst = 0; let n = 0;
  const probe = clsIdx.length > 0 ? clsIdx : Array.from({ length: Math.min(300, nTri) }, (_, i) => i);
  for (let i = 0; i < Math.min(300, probe.length); i += 1) {
    const f = probe[Math.floor((i * 0.6180339887 * probe.length)) % probe.length];
    const mine = fieldOfFacet(f, K_REF, INSET_REF, H_REF, rA).normDeg;
    const [ath, bth, cth] = th3(f);
    const theirs = orientOfFacet(ns, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4],
      xyz[f * 9 + 5], xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
      { k: K_REF, inset: INSET_REF, orient: 'winding', scratch: scr }).normDeg;
    if (Number.isFinite(mine) && Number.isFinite(theirs)) { worst = Math.max(worst, Math.abs(mine - theirs)); n += 1; }
  }
  log(`── CONTROL C2: fieldOfFacet.normDeg vs orientRuler.orientOfFacet.normDeg over n=${n} class facets ──`);
  log(`  max |diff| ${worst.toExponential(3)} deg   ${worst === 0 ? 'BIT-IDENTICAL — OK' : worst < 1e-9 ? 'OK (< 1e-9 deg)' : '*** CONTROL C2 FIRED ***'}`);
  OUT.c2ruler = { n, maxDiffDeg: worst };
  if (!(worst < 1e-9)) VOID_REASON = 'C2 ruler identity';
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE OFFSET-SHRINK (MULTI-SCALE TURN) TEST — H2's discriminator
// turn(delta) = max over SHRINK_SCAN positions along the cone-diameter segment of the angle between the
// analytic normals at p-delta*e and p+delta*e, with the FINITE-DIFFERENCE STEP SLAVED to delta (h=delta/8)
// so that no probe's own window can reach across the locus. A C0/C1 crease HOLDS its turn as delta shrinks;
// a C2 patch's turn falls proportionally.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const NA = new Float64Array(3); const NB = new Float64Array(3);
interface ShrinkOut { turns: number[]; deltas: number[]; hold: number }
function shrinkOfFacet(f: number, fo: FieldOut, rf: RadFn): ShrinkOut | null {
  if (fo.iA < 0 || fo.iB < 0 || fo.iA === fo.iB) return null;
  const rR = rRefOf(f);
  const pA = PTH[fo.iA]; const zA = PZ[fo.iA]; const pB = PTH[fo.iB]; const zB = PZ[fo.iB];
  const Lmm = Math.hypot(pB - pA, zB - zA);
  if (!(Lmm > 1e-12)) return null;
  const ex = (pB - pA) / Lmm; const ez = (zB - zA) / Lmm;
  const turns: number[] = []; const deltas: number[] = [];
  for (let s = 0; s < SHRINK_STEPS; s += 1) {
    const delta = (Lmm / 2) / 2 ** s;
    const hh = Math.max(1e-9, delta / 8);
    let best = 0;
    for (let j = 0; j < SHRINK_SCAN; j += 1) {
      const u = (j + 0.5) / SHRINK_SCAN;
      const pc = pA + (pB - pA) * u; const zc = zA + (zB - zA) * u;
      fdCentral(rf, (pc - delta * ex) / rR, zc - delta * ez, hh, NA, 0);
      fdCentral(rf, (pc + delta * ex) / rR, zc + delta * ez, hh, NB, 0);
      let dp = NA[0] * NB[0] + NA[1] * NB[1] + NA[2] * NB[2];
      dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
      const a = Math.acos(dp);
      if (a > best) best = a;
    }
    turns.push(best * DEG); deltas.push(delta);
  }
  const t0 = turns[0]; const tN = turns[turns.length - 1];
  return { turns, deltas, hold: t0 > 1e-12 ? tN / t0 : NaN };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STRATIFIED SAMPLE OF THE >45 CLASS — HEAVY (top-area, exhaustive within cap) + TAIL (golden stride)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function goldenStride(n: number, want: number): number[] {
  if (want >= n) return Array.from({ length: n }, (_, i) => i);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let g = Math.max(1, Math.round(n * 0.6180339887498949));
  while (gcd(g, n) !== 1) g += 1;
  const out: number[] = [];
  for (let i = 0; i < want; i += 1) out.push((i * g) % n);
  return out;
}
const byArea = clsIdx.slice().sort((a, b) => d.areaMm2[b] - d.areaMm2[a]);
const heavy: number[] = [];
{
  let acc = 0;
  for (const f of byArea) {
    if (heavy.length >= HEAVY_CAP || acc >= 0.5 * clsArea) break;
    heavy.push(f); acc += d.areaMm2[f];
  }
}
const heavySet = new Set(heavy);
const tailAll = clsIdx.filter((f) => !heavySet.has(f));
const tailSamp = goldenStride(tailAll.length, Math.min(TAIL_N, tailAll.length)).map((i) => tailAll[i]);
let heavyArea = 0; for (const f of heavy) heavyArea += d.areaMm2[f];
let tailAreaAll = 0; for (const f of tailAll) tailAreaAll += d.areaMm2[f];
let tailAreaSamp = 0; for (const f of tailSamp) tailAreaSamp += d.areaMm2[f];
const TAIL_CW = tailAll.length / Math.max(1, tailSamp.length);
log('── STRATIFIED SAMPLE OF THE >45 CLASS (area is long-tailed; a count sample alone would be noisy) ──');
log(`  HEAVY stratum: ${heavy.length} facets (top by area), AREA ${heavyArea.toFixed(4)} mm2 = ${pct(heavyArea, clsArea)}% of the class — EXHAUSTIVE`);
log(`  TAIL  stratum: ${tailAll.length} facets, AREA ${tailAreaAll.toFixed(4)} mm2 = ${pct(tailAreaAll, clsArea)}% — SAMPLED n=${tailSamp.length} (${pct(tailSamp.length, tailAll.length)}%), holding ${tailAreaSamp.toFixed(4)} mm2`);
log(`  class AREA DENOMINATOR is EXACT (${(heavyArea + tailAreaAll).toFixed(4)} mm2); only the WITHIN-TAIL split is estimated.`);
log('');

// measured rows
interface Row {
  f: number; heavy: boolean; area: number; normDeg: number; coneLo: number; coneHi: number; spreadDeg: number;
  hold: number; turnBig: number; turnSmall: number; sagMm: number; loc: number; locPl: number;
  cls: string; clsShape: string;
}
const rows: Row[] = [];
const LOCNAMES = ['CELL', 'BRANCH', 'EDGE', 'CREST', 'BAND', 'RIM', 'MED'];
function locusFlagsOfFacet(f: number, k: number, inset: number, phase: number): number {
  if (!H4_ACTIVE) return 0;
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const sh = 1 - inset; const scw = inset / 3;
  let first: LocKey | null = null; let flags = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + scw; const wb = sh * (j / k) + scw; const wc = 1 - wa - wb;
      const kx = locusKeyAt(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz, phase);
      if (first === null) { first = kx; continue; }
      if (kx.cell !== first.cell) flags |= 1;
      if (kx.branch !== first.branch) flags |= 2;
      if (kx.edge !== first.edge) flags |= 4;
      if (kx.crest !== first.crest) flags |= 8;
      if (kx.band !== first.band) flags |= 16;
      if (kx.rim !== first.rim) flags |= 32;
      if (kx.med !== first.med) flags |= 64;
    }
  }
  return flags;
}
{
  const t = Date.now();
  const all = heavy.concat(tailSamp);
  log(`── STAGE 5: THE FIELD RULER over ${all.length} facets (k=${K_REF} inset=${INSET_REF} h=${H_REF}); offset-shrink on ALL of them ──`);
  for (let i = 0; i < all.length; i += 1) {
    const f = all[i];
    const fo = fieldOfFacet(f, K_REF, INSET_REF, H_REF, rA);
    const sk = shrinkOfFacet(f, fo, rA);
    rows.push({
      f, heavy: heavySet.has(f), area: d.areaMm2[f], normDeg: fo.normDeg, coneLo: fo.coneLo, coneHi: fo.coneHi,
      spreadDeg: fo.spreadDeg,
      hold: sk === null ? NaN : sk.hold, turnBig: sk === null ? NaN : sk.turns[0],
      turnSmall: sk === null ? NaN : sk.turns[sk.turns.length - 1], sagMm: fo.sagMm,
      loc: locusFlagsOfFacet(f, K_REF, INSET_REF, 0), locPl: locusFlagsOfFacet(f, K_REF, INSET_REF, 0.5),
      cls: '', clsShape: '',
    });
    if ((i + 1) % 10000 === 0) log(`     ... ${i + 1}/${all.length}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  }
  log(`  done  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE STRATIFIED ESTIMATOR
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Est { count: number; countPct: number; areaMm2: number; areaPct: number; max: number; n: number }
function estimate(pred: (r: Row) => boolean, maxOf: (r: Row) => number): Est {
  let hN = 0; let hA = 0; let tN = 0; let tA = 0; let mx = -Infinity; let n = 0;
  for (const r of rows) {
    const ok = pred(r);
    if (ok) { n += 1; const v = maxOf(r); if (Number.isFinite(v) && v > mx) mx = v; }
    if (r.heavy) { if (ok) { hN += 1; hA += r.area; } } else if (ok) { tN += 1; tA += r.area; }
  }
  const cnt = hN + tN * TAIL_CW;
  const area = hA + (tailAreaSamp > 0 ? tailAreaAll * (tA / tailAreaSamp) : 0);
  return {
    count: cnt, countPct: (cnt / clsIdx.length) * 100, areaMm2: area, areaPct: (area / clsArea) * 100,
    max: mx === -Infinity ? NaN : mx, n,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — THE PARTITION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function turnSplit(r: Row, holdHi: number, holdLo: number): string {
  if (!Number.isFinite(r.hold)) return 'P4-TURN(unsplit)';
  if (r.hold >= holdHi) return 'P4a-TURN-CREASE';
  if (r.hold <= holdLo) return 'P4b-TURN-SMOOTH';
  return 'P4c-TURN-MIXED';
}
function classifyField(r: Row, accBar: number, turnBar: number, aspBar: number, holdHi: number, holdLo: number): string {
  const f = r.f;
  if (isDegen(f)) return 'P0-DEGENERATE';
  if (isBoundary(f)) return 'P1-BOUNDARY';
  if (isBlade(f)) return 'P2a-BLADE';
  if (isSignUndet(f)) return 'P1b-SIGN-UNDET';
  if (isFold(f)) return 'P2-INVERTED';
  if (!(r.normDeg > accBar)) return 'P3-ACCURATE';
  if (r.coneLo >= turnBar) return turnSplit(r, holdHi, holdLo);
  if (aspect[f] >= aspBar) return 'P5-SLIVER';
  return 'P6-MISORIENTED';
}
function classifyShape(r: Row, accBar: number, turnBar: number, aspBar: number, holdHi: number, holdLo: number): string {
  const f = r.f;
  if (isDegen(f)) return 'P0-DEGENERATE';
  if (isBoundary(f)) return 'P1-BOUNDARY';
  if (isBlade(f)) return 'P2a-BLADE';
  if (isSignUndet(f)) return 'P1b-SIGN-UNDET';
  if (isFold(f)) return 'P2-INVERTED';
  if (aspect[f] >= aspBar) return 'P5-SLIVER';
  if (!(r.normDeg > accBar)) return 'P3-ACCURATE';
  if (r.coneLo >= turnBar) return turnSplit(r, holdHi, holdLo);
  return 'P6-MISORIENTED';
}
const ORDER = ['P0-DEGENERATE', 'P1-BOUNDARY', 'P2a-BLADE', 'P1b-SIGN-UNDET', 'P2-INVERTED', 'P3-ACCURATE',
  'P4a-TURN-CREASE', 'P4b-TURN-SMOOTH', 'P4c-TURN-MIXED', 'P4-TURN(unsplit)', 'P5-SLIVER', 'P6-MISORIENTED'];
const OPER: Record<string, string> = {
  'P0-DEGENERATE': 'remove (normal undetermined)',
  'P1-BOUNDARY': 'close the boundary',
  'P2a-BLADE': 'DE-BLADE (remove the double-back fin)',
  'P1b-SIGN-UNDET': 'UNKNOWN — below the f32 floor',
  'P2-INVERTED': 'REORIENT/untangle (back-facing)',
  'P3-ACCURATE': 'NONE — correct geometry',
  'P4a-TURN-CREASE': 'ALIGN / conform to the locus',
  'P4b-TURN-SMOOTH': 'REFINE / density',
  'P4c-TURN-MIXED': 'align+refine',
  'P4-TURN(unsplit)': '(shrink not run)',
  'P5-SLIVER': 'COLLAPSE',
  'P6-MISORIENTED': 'RE-PLACE / flip',
};
for (const r of rows) {
  r.cls = classifyField(r, ACC_BAR, TURN_BAR, ASPECT_BAR, HOLD_HI, HOLD_LO);
  r.clsShape = classifyShape(r, ACC_BAR, TURN_BAR, ASPECT_BAR, HOLD_HI, HOLD_LO);
}
function printPartition(label: string, key: (r: Row) => string): Record<string, Est> {
  log(`  ${label}`);
  log('   class                COUNT (est)    count%      AREA mm2      AREA%      normDeg MAX   n meas   OPERATOR');
  const res: Record<string, Est> = {};
  let sc = 0; let sa = 0;
  for (const c of ORDER) {
    const e = estimate((r) => key(r) === c, (r) => r.normDeg);
    if (e.n === 0) continue;
    res[c] = e; sc += e.countPct; sa += e.areaPct;
    log(`   ${c.padEnd(18)} ${e.count.toFixed(0).padStart(11)}  ${e.countPct.toFixed(3).padStart(8)}%  ${e.areaMm2.toFixed(4).padStart(11)}  ${e.areaPct.toFixed(3).padStart(8)}%   ${f2(e.max).padStart(9)}   ${String(e.n).padStart(6)}   ${OPER[c]}`);
  }
  log(`   ${'SUM'.padEnd(18)} ${''.padStart(11)}  ${sc.toFixed(3).padStart(8)}%  ${''.padStart(11)}  ${sa.toFixed(3).padStart(8)}%   <== EXHAUSTIVENESS CONTROL (must be 100.000)`);
  if (Math.abs(sc - 100) > 0.05 || Math.abs(sa - 100) > 0.05) log('   *** EXHAUSTIVENESS CONTROL FIRED — the partition does not sum to 100%. ***');
  return res;
}
// *** CONTROL C5 — PRICE THE STRATIFIED ESTIMATOR AGAINST EXHAUSTIVE TRUTH. Five of the partition's
// indicators are computable over ALL 306,737 class facets with no rA at all. Estimating them from the
// SAME stratified sample the partition uses and diffing against the exhaustive number is a direct,
// quantitative measurement of the sampling error the whole partition carries. ***
{
  log('── CONTROL C5: STRATIFIED ESTIMATOR vs EXHAUSTIVE TRUTH on the analytic-free indicators ──');
  const IND: Array<[string, (f: number) => boolean]> = [
    ['DEGENERATE', isDegen], ['BOUNDARY', isBoundary], ['BLADE(dih>=bar)', isBlade],
    ['SIGN-UNDET', isSignUndet], ['INVERTED(rDot)', isFold],
    ['SLIVER(asp>=bar)', (f) => aspect[f] >= ASPECT_BAR], ['CURTAIN(gr>bar)', (f) => gRatio[f] > CURTAIN_RATIO],
  ];
  log('   indicator             EXHAUSTIVE area%   ESTIMATED area%   error (pp)    EXHAUSTIVE count%  ESTIMATED count%');
  const c5: Array<Record<string, number | string>> = [];
  for (const [nm, p] of IND) {
    let exA = 0; let exN = 0;
    for (const f of clsIdx) if (p(f)) { exA += d.areaMm2[f]; exN += 1; }
    const e = estimate((r) => p(r.f), (r) => r.normDeg);
    log(`   ${nm.padEnd(20)} ${pct(exA, clsArea).padStart(14)}%   ${e.areaPct.toFixed(4).padStart(14)}%   ${(e.areaPct - (exA / clsArea) * 100).toFixed(3).padStart(9)}    ${pct(exN, clsIdx.length).padStart(14)}%  ${e.countPct.toFixed(4).padStart(15)}%`);
    c5.push({ indicator: nm, exhaustiveAreaPct: (exA / clsArea) * 100, estimatedAreaPct: e.areaPct, errPp: e.areaPct - (exA / clsArea) * 100 });
  }
  log('   READ: this is the sampling error of EVERY area share below. A partition class whose share is');
  log('   smaller than these errors is not resolved by this sample and must not be ranked.');
  OUT.c5estimator = c5;
}
log('');
log(`── STAGE 6: THE PARTITION OF THE >${HI_DEG} DEG CLASS  ${el()} ──`);
const partField = printPartition('PARTITION A — FIELD-FIRST (pre-registered primary)', (r) => r.cls);
log('');
const partShape = printPartition('PARTITION B — SHAPE-FIRST (SLIVER promoted above ACCURATE; the ordering-sensitivity control)', (r) => r.clsShape);
OUT.partitionField = partField;
OUT.partitionShape = partShape;
log('');
{
  // PER-CLASS FINGERPRINT — the medians that say WHAT KIND OF FACET each class actually is. This is what
  // turns a partition into a mechanism: a class whose fingerprint is indistinguishable from another's is
  // not a separate mechanism, whatever the priority order says.
  log('  PER-CLASS FINGERPRINT (medians over the measured facets of each partition-A class)');
  log('   class               area mm2   minAlt mm   aspect  graphRatio   |rDot|   sag mm    cone   normDeg    hold   dihedral');
  const fp: Record<string, Record<string, number>> = {};
  for (const c of ORDER) {
    const rs = rows.filter((r) => r.cls === c);
    if (rs.length === 0) continue;
    const g = (fn: (r: Row) => number): number => q(rs.map(fn), 0.5);
    const v = {
      area: g((r) => r.area), minAlt: g((r) => minAlt[r.f]), aspect: g((r) => aspect[r.f]),
      graphRatio: g((r) => gRatio[r.f]), rDot: g((r) => Math.abs(rDot[r.f])), sag: g((r) => r.sagMm),
      cone: g((r) => r.coneLo), normDeg: g((r) => r.normDeg), hold: g((r) => r.hold),
      dihedral: g((r) => d.perFacetMaxRad[r.f] * DEG),
    };
    fp[c] = v;
    log(`   ${c.padEnd(18)} ${v.area.toExponential(2)}  ${v.minAlt.toExponential(2)}  ${f2(v.aspect).padStart(7)}  ${v.graphRatio.toExponential(2).padStart(10)}  ${f4(v.rDot).padStart(7)}  ${v.sag.toExponential(2)}  ${f2(v.cone).padStart(6)}  ${f2(v.normDeg).padStart(7)}  ${f4(v.hold).padStart(6)}  ${f2(v.dihedral).padStart(7)}`);
  }
  OUT.fingerprint = fp;
}
log('');
// the REDUCIBLE remainder = everything except P3-ACCURATE (which is correct geometry).
{
  const acc = partField['P3-ACCURATE'];
  const accA = acc === undefined ? 0 : acc.areaMm2;
  log('  *** RECONCILIATION WITH S114. S114 reported ACCURATE as 26 EDGES / 52 facets / 0.0034% of the mesh.');
  log('  That number is (a) PER EDGE PAIR — normHi = max(normDeg of BOTH facets), which is far stricter than');
  log('  a per-facet test, (b) scoped to WALL edges only (graphRatio <= 8, 17.4% of the class area), and');
  log('  (c) taken at h=2e-4. This tool scores PER FACET over the WHOLE class at the h-converged step.');
  log('  The two are not the same quantity and the difference below is expected, not a contradiction. ***');
  log(`  IRREDUCIBLE (P3-ACCURATE, correct geometry rendering a real dihedral): AREA ${accA.toFixed(4)} mm2 = ${pct(accA, clsArea)}% of the class = ${pct(accA, meshArea)}% of the mesh`);
  log(`  *** REDUCIBLE REMAINDER: AREA ${(clsArea - accA).toFixed(4)} mm2 = ${pct(clsArea - accA, clsArea)}% of the class = ${pct(clsArea - accA, meshArea)}% of the MESH ***`);
  log('  MECHANISM SHARES WITHIN THE REDUCIBLE REMAINDER (partition A, renormalised):');
  const denom = clsArea - accA;
  const ranked: Array<[string, number]> = [];
  for (const c of ORDER) {
    if (c === 'P3-ACCURATE') continue;
    const e = partField[c]; if (e === undefined) continue;
    ranked.push([c, (e.areaMm2 / Math.max(1e-30, denom)) * 100]);
  }
  ranked.sort((a, b) => b[1] - a[1]);
  for (const [c, v] of ranked) log(`     ${c.padEnd(18)} ${v.toFixed(3).padStart(8)}% of the reducible AREA     => ${OPER[c]}`);
  OUT.reducible = { irrAreaMm2: accA, redAreaMm2: denom, redPctOfMesh: (denom / meshArea) * 100, shares: Object.fromEntries(ranked) };
  OUT.dominant = ranked.length > 0 ? ranked[0][0] : 'NONE';
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — CROSS-TABS: H4 feature loci (+ PLACEBO), curtain/wall, inversion, shrink behaviour
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (!H4_ACTIVE) {
  log(`── STAGE 7a / H4: SKIPPED (STYLE ${STYLE} is not CelticTriquetra; the locus grid does not apply) ──`);
} else {
  log('── STAGE 7a / H4: FEATURE-LOCUS CROSS-TAB, with the PHASE-SHIFTED PLACEBO GRID alongside ──');
  log('   locus                straddling AREA% of class   PLACEBO AREA%   ENRICH    normDeg p50 (straddling)');
  const h4: Array<Record<string, number | string>> = [];
  for (let bit = 0; bit < LOCNAMES.length; bit += 1) {
    const mask = 1 << bit;
    const e = estimate((r) => (r.loc & mask) !== 0, (r) => r.normDeg);
    const p = estimate((r) => (r.locPl & mask) !== 0, (r) => r.normDeg);
    const nd = rows.filter((r) => (r.loc & mask) !== 0).map((r) => r.normDeg);
    const enr = e.areaPct / Math.max(1e-9, p.areaPct);
    log(`   ${LOCNAMES[bit].padEnd(18)} ${e.areaPct.toFixed(3).padStart(12)}%           ${p.areaPct.toFixed(3).padStart(8)}%   ${enr.toFixed(3).padStart(7)}x   ${f2(q(nd, 0.5)).padStart(8)}`);
    h4.push({ locus: LOCNAMES[bit], areaPct: e.areaPct, placeboAreaPct: p.areaPct, enrich: enr, normDegP50: q(nd, 0.5) });
  }
  const eAny = estimate((r) => r.loc !== 0, (r) => r.normDeg);
  const pAny = estimate((r) => r.locPl !== 0, (r) => r.normDeg);
  const eNone = estimate((r) => r.loc === 0, (r) => r.normDeg);
  log(`   ${'ANY LOCUS'.padEnd(18)} ${eAny.areaPct.toFixed(3).padStart(12)}%           ${pAny.areaPct.toFixed(3).padStart(8)}%   ${(eAny.areaPct / Math.max(1e-9, pAny.areaPct)).toFixed(3).padStart(7)}x`);
  log(`   ${'NO LOCUS'.padEnd(18)} ${eNone.areaPct.toFixed(3).padStart(12)}%     normDeg p50 ${f2(q(rows.filter((r) => r.loc === 0).map((r) => r.normDeg), 0.5))}  MAX ${f2(eNone.max)}`);
  log('   READ: the PLACEBO grid has the SAME density and the SAME geometry, shifted half a tile in u. An');
  log('   ENRICH near 1x means the locus test is measuring facet SIZE, not the feature. H4 needs ENRICH > 1.');
  OUT.h4crosstab = { rowsPerLocus: h4, anyAreaPct: eAny.areaPct, placeboAnyAreaPct: pAny.areaPct, noneAreaPct: eNone.areaPct };
  log('');
  // locus x class
  log('   LOCUS x PARTITION-A CLASS (AREA% of the class, partition A):');
  const cls6 = ORDER.filter((c) => partField[c] !== undefined);
  log(`     ${'locus'.padEnd(12)}${cls6.map((c) => c.replace(/^P\d[a-c]?-/, '').slice(0, 9).padStart(10)).join('')}`);
  for (let bit = 0; bit < LOCNAMES.length; bit += 1) {
    const mask = 1 << bit;
    const cells = cls6.map((c) => estimate((r) => (r.loc & mask) !== 0 && r.cls === c, (r) => r.normDeg).areaPct);
    log(`     ${LOCNAMES[bit].padEnd(12)}${cells.map((v) => v.toFixed(3).padStart(10)).join('')}`);
  }
  const cellsNone = cls6.map((c) => estimate((r) => r.loc === 0 && r.cls === c, (r) => r.normDeg).areaPct);
  log(`     ${'NONE'.padEnd(12)}${cellsNone.map((v) => v.toFixed(3).padStart(10)).join('')}`);
}
log('');
{
  // *** H1's MECHANISM, not just its shape proxy. S111's claim is "SAG OVER ALTITUDE". Write it down:
  // a facet whose vertices lie ON the surface departs from it by `sag` somewhere inside; a needle of min
  // altitude `alt` converts that departure into atan(sag/alt) of normal tilt, an equilateral facet of the
  // SAME AREA into atan(sag/altEq). The RATIO is how much of the observed error the SHAPE is responsible
  // for, and it is a derived quantity with no threshold in it. ***
  log('── STAGE 7a2 / H1 MECHANISM: SAG OVER ALTITUDE — is the SHAPE the amplifier, or just correlated? ──');
  const sub = rows.filter((r) => Number.isFinite(r.sagMm) && minAlt[r.f] > 0);
  const tilt = sub.map((r) => Math.atan(r.sagMm / minAlt[r.f]) * DEG);
  const altEq = sub.map((r) => Math.sqrt((4 * d.areaMm2[r.f]) / Math.sqrt(3)) * (Math.sqrt(3) / 2));
  const tiltEq = sub.map((r, i) => Math.atan(r.sagMm / Math.max(1e-12, altEq[i])) * DEG);
  const amp = tilt.map((v, i) => v / Math.max(1e-9, tiltEq[i]));
  const explains = sub.map((r, i) => (tilt[i] >= r.normDeg ? 1 : 0));
  let expA = 0; let totA = 0;
  for (let i = 0; i < sub.length; i += 1) { totA += sub[i].area; if (explains[i] === 1) expA += sub[i].area; }
  log(`  n=${sub.length}   sag p50 ${q(sub.map((r) => r.sagMm), 0.5).toExponential(2)} p90 ${q(sub.map((r) => r.sagMm), 0.9).toExponential(2)} mm`);
  log(`  atan(sag/minAlt)      p50 ${f2(q(tilt, 0.5))} p90 ${f2(q(tilt, 0.9))} deg      <- the tilt the NEEDLE shape produces`);
  log(`  atan(sag/altEquilat)  p50 ${f2(q(tiltEq, 0.5))} p90 ${f2(q(tiltEq, 0.9))} deg   <- the tilt a WELL-SHAPED facet of the same AREA would produce`);
  log(`  SHAPE AMPLIFICATION   p50 ${f2(q(amp, 0.5))}x  p90 ${f2(q(amp, 0.9))}x`);
  log(`  *** the sliver mechanism ACCOUNTS FOR the observed normDeg (atan(sag/minAlt) >= normDeg) on ${pct(expA, totA)}% of the measured AREA ***`);
  OUT.h1sag = {
    n: sub.length, sagP50: q(sub.map((r) => r.sagMm), 0.5), tiltP50: q(tilt, 0.5), tiltEqP50: q(tiltEq, 0.5),
    ampP50: q(amp, 0.5), ampP90: q(amp, 0.9), explainsAreaPct: (expA / Math.max(1e-30, totA)) * 100,
  };
  log('');
  // SOUNDNESS of the MIS-ORIENTED label: coneLo is a LOWER bound, so "cone < bar" is not by itself sound.
  const mo = rows.filter((r) => r.cls === 'P6-MISORIENTED');
  const unsound = mo.filter((r) => r.coneHi >= TURN_BAR);
  let uA = 0; let mA = 0;
  for (const r of mo) mA += r.area;
  for (const r of unsound) uA += r.area;
  log('── STAGE 7a3: SOUNDNESS OF THE MIS-ORIENTED LABEL ──');
  log(`  coneLo is the EXACT lattice diameter (a LOWER bound on the true footprint cone); coneHi = 2*max-from-mean is an UPPER bound.`);
  log(`  of the P6-MISORIENTED facets, those whose coneHi still reaches ${TURN_BAR} deg (i.e. NOT soundly excluded):`);
  log(`     COUNT ${unsound.length}/${mo.length} = ${pct(unsound.length, mo.length)}%   AREA ${pct(uA, mA)}% of the class's MISORIENTED area`);
  log('  The k-LADDER (Stage 8) is what settles whether the lattice resolves these footprints.');
  OUT.misorientSoundness = { n: mo.length, unsoundCount: unsound.length, unsoundAreaPct: (uA / Math.max(1e-30, mA)) * 100 };
}
log('');
{
  log('── STAGE 7b: CURTAIN (graphRatio) CROSS-TAB — the S114 curtain cut is KNOWN UNCONVERGED, so SWEPT ──');
  log('   ratio bar     CURTAIN AREA% of class   CURTAIN normDeg p50   CURTAIN coneLo p50   WALL normDeg p50');
  const cl: Array<Record<string, number>> = [];
  for (const R of [2, 4, 8, 16, 32, 128]) {
    const e = estimate((r) => gRatio[r.f] > R, (r) => r.normDeg);
    const cur = rows.filter((r) => gRatio[r.f] > R);
    const wal = rows.filter((r) => !(gRatio[r.f] > R));
    log(`   > ${String(R).padStart(4)}        ${e.areaPct.toFixed(3).padStart(14)}%       ${f2(q(cur.map((r) => r.normDeg), 0.5)).padStart(10)}         ${f2(q(cur.map((r) => r.coneLo), 0.5)).padStart(10)}         ${f2(q(wal.map((r) => r.normDeg), 0.5)).padStart(10)}`);
    cl.push({ ratio: R, curtainAreaPct: e.areaPct, curtainNormP50: q(cur.map((r) => r.normDeg), 0.5), curtainConeLoP50: q(cur.map((r) => r.coneLo), 0.5), wallNormP50: q(wal.map((r) => r.normDeg), 0.5) });
  }
  OUT.curtainLadder = cl;
  log('   CURTAIN x PARTITION-A CLASS at the reference bar (AREA% of class):');
  for (const c of ORDER) {
    if (partField[c] === undefined) continue;
    const cu = estimate((r) => gRatio[r.f] > CURTAIN_RATIO && r.cls === c, (r) => r.normDeg);
    const wa = estimate((r) => !(gRatio[r.f] > CURTAIN_RATIO) && r.cls === c, (r) => r.normDeg);
    log(`     ${c.padEnd(18)} CURTAIN ${cu.areaPct.toFixed(3).padStart(8)}%   WALL ${wa.areaPct.toFixed(3).padStart(8)}%`);
  }
}
log('');
{
  log('── STAGE 7c: INVERSION (normDeg > 90) — S114 read 5.478% by count / 2.994% by area on the scoped WALL ──');
  const e = estimate((r) => r.normDeg > 90, (r) => r.normDeg);
  const inv = rows.filter((r) => r.normDeg > 90);
  log(`   >45 class, normDeg > 90 deg: COUNT ${e.count.toFixed(0)} (${e.countPct.toFixed(3)}% of class)  AREA ${e.areaMm2.toFixed(4)} mm2 = ${e.areaPct.toFixed(3)}% of class = ${pct(e.areaMm2, meshArea)}% of MESH`);
  log(`   their coneLo p50 ${f2(q(inv.map((r) => r.coneLo), 0.5))}  graphRatio p50 ${q(inv.map((r) => gRatio[r.f]), 0.5).toExponential(2)}  aspect p50 ${f2(q(inv.map((r) => aspect[r.f]), 0.5))}  |rDot| p50 ${f4(q(inv.map((r) => Math.abs(rDot[r.f])), 0.5))}`);
  let fInv = 0; let uInv = 0;
  for (const r of inv) { if (isFold(r.f)) fInv += 1; if (isSignUndet(r.f)) uInv += 1; }
  log(`   of the normDeg>90 population: DETERMINED-INVERTED by the analytic-free rDot test ${fInv}/${inv.length} = ${pct(fInv, inv.length)}%   SIGN-UNDETERMINED ${uInv}/${inv.length} = ${pct(uInv, inv.length)}%`);
  log('   READ: normDeg>90 and rDot<0 are the SAME statement measured two ways (analytic vs analytic-free).');
  log('   A large disagreement means one of the two is reading noise — that is what the rDot band is for.');
  log('   class breakdown of the inverted population (AREA% of class):');
  for (const c of ORDER) {
    if (partField[c] === undefined) continue;
    const ee = estimate((r) => r.normDeg > 90 && r.cls === c, (r) => r.normDeg);
    if (ee.n === 0) continue;
    log(`     ${c.padEnd(18)} ${ee.areaPct.toFixed(4).padStart(9)}%`);
  }
  OUT.inversion = { countPct: e.countPct, areaPctOfClass: e.areaPct, areaPctOfMesh: (e.areaMm2 / meshArea) * 100, foldPct: (fInv / Math.max(1, inv.length)) * 100 };
}
log('');
{
  log('── STAGE 7d: THE OFFSET-SHRINK LADDER — turn(delta) vs delta on the measured facets ──');
  const sub = rows.filter((r) => Number.isFinite(r.hold));
  log(`   n=${sub.length} facets with a shrink measurement (SHRINK_STEPS=${SHRINK_STEPS} => a ${2 ** (SHRINK_STEPS - 1)}x shrink, scan=${SHRINK_SCAN} positions, h=delta/8)`);
  log(`   holdRatio = turn(deltaMin)/turn(deltaMax):  p10 ${f4(q(sub.map((r) => r.hold), 0.1))}  p50 ${f4(q(sub.map((r) => r.hold), 0.5))}  p90 ${f4(q(sub.map((r) => r.hold), 0.9))}`);
  log(`   PURE-SMOOTH reference = ${(1 / 2 ** (SHRINK_STEPS - 1)).toFixed(4)} (turn falls exactly with delta);  PURE-CREASE reference = 1.0`);
  log('   holdRatio ladder — how much of the verdict the HOLD cut is carrying (AREA% of class):');
  for (const cut of [0.9, 0.75, 0.5, 0.25, 0.125, 0.0625]) {
    const eC = estimate((r) => Number.isFinite(r.hold) && r.coneLo >= TURN_BAR && r.hold >= cut, (r) => r.normDeg);
    const eS = estimate((r) => Number.isFinite(r.hold) && r.coneLo >= TURN_BAR && r.hold < cut, (r) => r.normDeg);
    log(`     hold >= ${cut.toFixed(4)}  CREASE-side ${eC.areaPct.toFixed(3).padStart(8)}%   SMOOTH-side ${eS.areaPct.toFixed(3).padStart(8)}%`);
  }
  log(`   turn(deltaMax) p50 ${f2(q(sub.map((r) => r.turnBig), 0.5))} deg   turn(deltaMin) p50 ${f2(q(sub.map((r) => r.turnSmall), 0.5))} deg`);
  OUT.shrink = { n: sub.length, holdP10: q(sub.map((r) => r.hold), 0.1), holdP50: q(sub.map((r) => r.hold), 0.5), holdP90: q(sub.map((r) => r.hold), 0.9), smoothRef: 1 / 2 ** (SHRINK_STEPS - 1) };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 8 — CONTROLS: h-LADDER (SCAR 3), k-LADDER (SCAR 2), inset SWEEP (SCAR 1), C-infinity PLACEBO
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const ladIdx = goldenStride(heavy.length, Math.min(LAD_N, heavy.length)).map((i) => heavy[i])
  .concat(goldenStride(tailSamp.length, Math.min(LAD_N, tailSamp.length)).map((i) => tailSamp[i]));
const ladHeavy = new Set(goldenStride(heavy.length, Math.min(LAD_N, heavy.length)).map((i) => heavy[i]));
function ladderPartition(k: number, inset: number, hh: number, rf: RadFn): { rows: Row[]; shares: Record<string, number> } {
  const rr: Row[] = [];
  for (const f of ladIdx) {
    const fo = fieldOfFacet(f, k, inset, hh, rf);
    const sk = shrinkOfFacet(f, fo, rf);
    rr.push({
      f, heavy: ladHeavy.has(f), area: d.areaMm2[f], normDeg: fo.normDeg, coneLo: fo.coneLo, coneHi: fo.coneHi,
      spreadDeg: fo.spreadDeg, hold: sk === null ? NaN : sk.hold, turnBig: sk === null ? NaN : sk.turns[0],
      turnSmall: sk === null ? NaN : sk.turns[sk.turns.length - 1], sagMm: fo.sagMm,
      loc: 0, locPl: 0, cls: '', clsShape: '',
    });
  }
  for (const r of rr) r.cls = classifyField(r, ACC_BAR, TURN_BAR, ASPECT_BAR, HOLD_HI, HOLD_LO);
  // area shares WITHIN the ladder subsample (self-consistent: the same facets at every h)
  let tot = 0; const acc: Record<string, number> = {};
  for (const r of rr) { tot += r.area; acc[r.cls] = (acc[r.cls] ?? 0) + r.area; }
  const shares: Record<string, number> = {};
  for (const c of ORDER) shares[c] = ((acc[c] ?? 0) / Math.max(1e-30, tot)) * 100;
  return { rows: rr, shares };
}
{
  log(`── STAGE 8 / SCAR 3 — THE h-LADDER. THE WHOLE PARTITION RE-RUN AT EACH h, n=${ladIdx.length}  ${el()} ──`);
  log('   *** A NUMBER THAT MOVES WITH h IS NOT A MEASUREMENT. ***');
  const hdr = ORDER.map((c) => c.replace(/^P\d[a-c]?-/, '').slice(0, 8).padStart(9)).join('');
  log(`   h            normDeg p50  p90     coneLo p50 ${hdr}`);
  const hl: Array<Record<string, unknown>> = [];
  for (const hh of H_LADDER) {
    const t = Date.now();
    const { rows: rr, shares } = ladderPartition(K_REF, INSET_REF, hh, rA);
    const nd = rr.map((r) => r.normDeg);
    log(`   ${hh.toExponential(0).padStart(8)}    ${f2(q(nd, 0.5)).padStart(8)} ${f2(q(nd, 0.9)).padStart(8)}   ${f2(q(rr.map((r) => r.coneLo), 0.5)).padStart(9)} ${ORDER.map((c) => shares[c].toFixed(2).padStart(9)).join('')}  [${((Date.now() - t) / 1000).toFixed(0)}s]`);
    hl.push({ h: hh, normP50: q(nd, 0.5), normP90: q(nd, 0.9), coneLoP50: q(rr.map((r) => r.coneLo), 0.5), shares });
  }
  // h-STABILITY verdict per class
  log('   h-STABILITY of each class share across the ladder (max/min over h):');
  const stab: Record<string, number> = {};
  for (const c of ORDER) {
    const vs = hl.map((x) => (x.shares as Record<string, number>)[c]).filter((v) => v > 0.005);
    if (vs.length === 0) continue;
    const rr = Math.max(...vs) / Math.max(1e-9, Math.min(...vs));
    stab[c] = rr;
    log(`     ${c.padEnd(18)} ${Math.min(...vs).toFixed(3).padStart(8)}% .. ${Math.max(...vs).toFixed(3).padStart(8)}%   ratio ${rr.toFixed(2)}x  ${rr > 2 ? '*** h-UNSTABLE — DO NOT QUOTE ***' : 'h-STABLE'}`);
  }
  OUT.hLadder = hl; OUT.hStability = stab;
}
log('');
{
  log(`── STAGE 8 / SCAR 2 — THE k-LADDER (coneLo/coneHi/spreadRad convergence), n=${ladIdx.length} ──`);
  log('   k      normDeg p50   coneLo p50   coneHi p50   spreadRad p50   [spreadRad is NOT converged — comparator only]');
  const kl: Array<Record<string, number>> = [];
  for (const kk of K_LADDER) {
    const { rows: rr, shares } = ladderPartition(kk, INSET_REF, H_REF, rA);
    const turnShare = shares['P4a-TURN-CREASE'] + shares['P4b-TURN-SMOOTH'] + shares['P4c-TURN-MIXED'] + shares['P4-TURN(unsplit)'];
    log(`   ${String(kk).padStart(3)}    ${f2(q(rr.map((r) => r.normDeg), 0.5)).padStart(9)}   ${f2(q(rr.map((r) => r.coneLo), 0.5)).padStart(9)}   ${f2(q(rr.map((r) => r.coneHi), 0.5)).padStart(9)}   ${f2(q(rr.map((r) => r.spreadDeg), 0.5)).padStart(11)}     TURN share ${turnShare.toFixed(2)}%  MISORIENTED ${shares['P6-MISORIENTED'].toFixed(2)}%`);
    kl.push({ k: kk, normP50: q(rr.map((r) => r.normDeg), 0.5), coneLoP50: q(rr.map((r) => r.coneLo), 0.5), coneHiP50: q(rr.map((r) => r.coneHi), 0.5), spreadP50: q(rr.map((r) => r.spreadDeg), 0.5), turnShare, misoriented: shares['P6-MISORIENTED'] });
  }
  OUT.kLadder = kl;
  log('');
  log(`── STAGE 8 / SCAR 1 — THE inset SWEEP, n=${ladIdx.length} ──`);
  const il: Array<Record<string, number>> = [];
  for (const ins of INSETS) {
    const { rows: rr, shares } = ladderPartition(K_REF, ins, H_REF, rA);
    log(`   inset ${ins.toFixed(3)}   normDeg p50 ${f2(q(rr.map((r) => r.normDeg), 0.5)).padStart(8)}  p90 ${f2(q(rr.map((r) => r.normDeg), 0.9)).padStart(8)}   ACCURATE ${shares['P3-ACCURATE'].toFixed(2)}%  TURN ${(shares['P4a-TURN-CREASE'] + shares['P4b-TURN-SMOOTH'] + shares['P4c-TURN-MIXED']).toFixed(2)}%  MISORIENTED ${shares['P6-MISORIENTED'].toFixed(2)}%`);
    il.push({ inset: ins, normP50: q(rr.map((r) => r.normDeg), 0.5), normP90: q(rr.map((r) => r.normDeg), 0.9), accurate: shares['P3-ACCURATE'], misoriented: shares['P6-MISORIENTED'] });
  }
  OUT.insetSweep = il;
}
log('');
{
  // *** THE PLACEBO ARM. The identical classifier on the identical footprints against a C-infinity cone. ***
  log('── STAGE 8 / CONTROL C3 — *** THE PLACEBO ARM (the voiding gate) *** ──');
  log(`   The SAME ruler, SAME k/inset/h, SAME ${ladIdx.length} footprints, against a provably C-infinity`);
  log(`   truncated cone r = ${DIMS.Rb} + ${DIMS.Rt - DIMS.Rb}*z/${H}. Nothing on it turns and nothing on it creases.`);
  const { rows: rr, shares } = ladderPartition(K_REF, INSET_REF, H_REF, rFlat);
  log(`   normDeg p50 ${q(rr.map((r) => r.normDeg), 0.5).toExponential(2)}  p99 ${q(rr.map((r) => r.normDeg), 0.99).toExponential(2)}  MAX ${f2(q(rr.map((r) => r.normDeg), 1))} deg`);
  log(`   coneLo  p50 ${q(rr.map((r) => r.coneLo), 0.5).toExponential(2)}  MAX ${f2(q(rr.map((r) => r.coneLo), 1))} deg`);
  const turnShare = shares['P4a-TURN-CREASE'] + shares['P4b-TURN-SMOOTH'] + shares['P4c-TURN-MIXED'] + shares['P4-TURN(unsplit)'];
  log(`   PLACEBO class shares: ACCURATE ${shares['P3-ACCURATE'].toFixed(3)}%   TURN ${turnShare.toFixed(3)}%   MISORIENTED ${shares['P6-MISORIENTED'].toFixed(3)}%   SLIVER ${shares['P5-SLIVER'].toFixed(3)}%`);
  const fired = turnShare > 5;
  log(`   ${fired ? '*** CONTROL C3 FIRED — the ruler manufactures TURN out of facet shape alone. STAGE 6 IS VOID. ***' : 'C3 OK — every TURN the partition reports is in the ANALYTIC, not in the instrument.'}`);
  log('   (SLIVER and MISORIENTED are EXPECTED to be non-zero on the placebo: a needle facet on a cone really');
  log('    IS a needle, and a facet placed at 45 deg to a cone really IS mis-oriented. Only TURN must vanish.)');
  OUT.c3placebo = { shares, turnShare, normP50: q(rr.map((r) => r.normDeg), 0.5), coneLoMax: q(rr.map((r) => r.coneLo), 1), fired };
  if (fired) VOID_REASON = 'C3 placebo';
}
log('');
{
  // C4 — the RAW INDICATOR OVERLAP MATRIX. The partition's ordering is a choice; this shows what it hid.
  log('── STAGE 8 / CONTROL C4 — RAW INDICATOR OVERLAP (AREA% of class; these DO overlap, by design) ──');
  const IND: Array<[string, (r: Row) => boolean]> = [
    ['BLADE', (r) => isBlade(r.f)],
    ['SIGN-UNDET', (r) => isSignUndet(r.f)],
    ['INVERTED(rDot)', (r) => isFold(r.f)],
    ['ACCURATE', (r) => !(r.normDeg > ACC_BAR)],
    ['TURNS(cone)', (r) => r.coneLo >= TURN_BAR],
    ['CREASE(hold)', (r) => Number.isFinite(r.hold) && r.hold >= HOLD_HI],
    ['SLIVER', (r) => aspect[r.f] >= ASPECT_BAR],
    ['CURTAIN', (r) => gRatio[r.f] > CURTAIN_RATIO],
    ['INVERTED', (r) => r.normDeg > 90],
    ['ON-LOCUS', (r) => r.loc !== 0],
  ];
  log(`     ${'indicator'.padEnd(16)}${IND.map((x) => x[0].slice(0, 8).padStart(9)).join('')}   MARGINAL`);
  const marg: Record<string, number> = {};
  for (const [na, pa] of IND) {
    const cells = IND.map(([, pb]) => estimate((r) => pa(r) && pb(r), (r) => r.normDeg).areaPct);
    const m = estimate(pa, (r) => r.normDeg).areaPct;
    marg[na] = m;
    log(`     ${na.padEnd(16)}${cells.map((v) => v.toFixed(2).padStart(9)).join('')}   ${m.toFixed(3).padStart(8)}%`);
  }
  OUT.overlapMarginals = marg;
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// VERDICT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
if (VOID_REASON.length > 0) {
  log(`*** RUN VOID: ${VOID_REASON} fired. The numbers above are NOT admissible. ***`);
  OUT.verdict = `VOID-${VOID_REASON}`;
} else {
  const dom = OUT.dominant as string;
  const sh = (OUT.reducible as Record<string, unknown>).shares as Record<string, number>;
  const bl = OUT.blades as Record<string, number>;
  log(`VERDICT for ${STYLE}: DOMINANT MECHANISM BY AREA = ${dom}  (${(sh[dom] ?? NaN).toFixed(2)}% of the reducible area)`);
  log(`  => the operator that mechanism names: ${OPER[dom] ?? '?'}`);
  log('');
  log('  THE PARTITION-INDEPENDENT HEADLINE (no priority order, no threshold except the measured ceiling):');
  log(`    measured analytic ceiling on an honest dihedral: ${bl.ceilingDeg.toFixed(2)} deg`);
  log(`    facets ABOVE it: ${bl.overCeilCount}  =  ${bl.overCeilAreaPctOfMesh.toFixed(4)}% of the MESH area`);
  log(`                        =  ${bl.overCeilAreaPctOfClass.toFixed(4)}% of the >${HI_DEG} class AREA`);
  log(`    blade (dihedral >= ${BLADE_BAR} deg) area: ${(bl.ladder as unknown as Array<Record<string, number>>).filter((x) => x.bar === BLADE_BAR)[0]?.areaPctOfMesh.toFixed(4)}% of the mesh; blade-pair centroid separation / diameter = ${bl.sepRatioP50.toFixed(4)}`);
  OUT.verdict = `DOMINANT=${dom}`;
}
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
writeFileSync(`${OUTDIR}/S115_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/S115_${TAG}.json   done ${el()}`);
