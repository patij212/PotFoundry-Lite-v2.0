// s115GothicFunnelH.ts — RE-RUN THE GOTHIC S112/S113 FUNNEL AT AN HONEST FINITE-DIFFERENCE STEP.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TOOL EXISTS — S114's #1 OUTSTANDING ITEM
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S114 measured the newest and largest instrument scar in this campaign: `fdNormals`' finite-difference
// step `h` (hArc/hZ, default 2e-4 mm). On Gothic, 4,656 of the 6,193 facets S112/S113 pinned as
// "straddling" read normDeg p50 2.93 deg at h=2e-6 versus 141.68 deg at h=5e-3. A number that moves with
// h is not a measurement. Everything downstream of S112's "0.1872% of mesh" and S113's "0.1816% target
// set" is therefore suspect until the funnel is re-run with h swept.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHICH STAGES CAN EVEN MOVE — READ THE SOURCES FIRST, DON'T RE-MEASURE WHAT IS ALGEBRAICALLY FIXED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The funnel has four cuts. Only ONE of them can be h-sensitive, and that is checkable by reading:
//
//   (1) dihedral > 45 deg      `dihedralRuler.facetDihedrals` — facet normals from the STL's own
//                              coordinates. NO analytic surface, NO sampler, NO h. ALGEBRAICALLY h-FREE.
//   (2) WALL graphRatio <= 8   3D facet area / (rRef*theta, z) parameter area. Pure mesh geometry plus
//                              `dThRaw`. NO sampler. ALGEBRAICALLY h-FREE.
//   (3) STRADDLING             normDeg(inset 0.05)/normDeg(inset 0) >= 0.25 AND normDeg(inset 0.05) > 10.
//                              BOTH come from `orientOfFacet` over `fdNormals(rA, H, h, h)`.
//                              *** THIS IS THE ONLY h-SENSITIVE CUT IN THE FUNNEL. ***
//   (4) crease-labelled        `locateKinkRaw` (_sweepPredicate.ts:124). Its two-scale test uses a window
//                              w = 1/kinkScan of the SEGMENT and w/4 — a step tied to the segment length,
//                              not to any `h`. It never touches `fdNormals`. ALGEBRAICALLY h-FREE.
//
// So stages 1, 2 and 4 are computed ONCE here and reused at every h; only stage 3 is recomputed. That is
// not an optimisation, it is the finding: if the class collapses, it collapses entirely inside the
// STRADDLING cut, and the crease LABEL is not what is wrong.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MECHANISM, STATED BEFORE THE RUN SO THE RESULT CAN CONTRADICT IT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `drop = normDeg(inset 0.05) / normDeg(inset 0)` was designed to separate CONFORMED facets (all their
// error on the boundary, i.e. a vertex ON the crease) from STRADDLING ones (the crease crosses the
// interior). But BOTH numerator and denominator are h-contaminated, and NOT in the same way:
//   * normLo (inset 0) samples the VERTICES. A conformed mesh puts vertices exactly ON the crease, where
//     the kink-aware sampler legitimately returns both flanks AT ANY h. normLo should be h-STABLE.
//   * normHi (inset 0.05) samples the INTERIOR. An interior lattice point at parameter distance D from
//     the crease false-alarms only while h > D. normHi should FALL as h falls.
// If that is right, `drop` must fall with h, the STRADDLING cut must shed members, and the survivors are
// the facets whose crease crossing is genuinely interior. *** THIS IS A PREDICTION, NOT A RESULT. *** The
// ladder below is what decides it, and stage 4 reports drop's own h-sensitivity against its two factors
// separately, because a RATIO of two h-contaminated quantities can move when neither factor alone does.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, IN THE SOURCE, BEFORE THE FIRST RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  C0  SELF-TEST, CLOSED FORM, TWO-SIDED. Before a mesh facet is touched:
//      (a) SMOOTH fixture, exact derivatives known: fd-vs-exact normDeg must agree to < 0.01 deg at EVERY
//          h in the ladder AND must not GROW at the smallest h (that would be the round-off floor, and it
//          would void every small-h number below).
//      (b) TENT fixture with a C0 crease, closed-form flank normals:
//          - a facet ENTIRELY inside one flank, its nearest lattice point D=1e-4 mm from the crease, must
//            read the FULL flank angle at h=5e-3 and ~0 at h=1e-6. That is the h-artefact, in closed form.
//          - a facet STRADDLING the crease must read the SAME angle at every h (spread < 1.25x) and stay
//            above 8 deg. *** THE SECOND HALF IS THE FLOOR. *** Without it, "small h kills the class"
//            would be satisfied by a sampler that has simply stopped working.
//      If either fires, THE RUN IS VOID and this file says so instead of quoting a number.
//  C1  CONTROL — REPRODUCE THE PUBLISHED FUNNEL AT THE PUBLISHED h (2e-4) EXACTLY:
//      19,582 -> 13,092 -> 5,174 -> 3,282 pairs; 6,193 facets; 69.826 mm2 = 0.1816% of mesh.
//      *** IF THIS DOES NOT REPRODUCE, STOP AND REPORT IT. *** S114 rewrote `locateTurnAdaptive`; it was
//      proven not to touch this funnel (no call site here), so a deviation is a BIGGER finding than the
//      h sweep and must not be papered over by continuing.
//  C2  NEGATIVE CONTROL AT EVERY h. LOW-dihedral (<2 deg) pairs on the same mesh, against a whole-mesh
//      reference. If the ruler reads WORSE on locally-flat facets than on the mesh at large at some h,
//      that h's numbers are void. (This is S112's own control, kept, and it is what caught S112 run 1.)
//  C3  AGREEMENT WITH THE INDEPENDENT ROUTE. S113's interior-crease route (2-means clustering of the
//      analytic normal field, k=12, inset 0.1, sep>=45 deg, minority>=0.05) selected 1,537 facets /
//      15.8233 mm2 / 0.0411% of mesh. Both routes are run HERE, at every h, on the SAME h-free domain
//      (the unique facets of the 13,092 WALL pairs), and cross-tabulated as a 2x2 with COUNTS AND AREAS.
//      Two independent routes agreeing is the point. Disagreement is quantified, not narrated.
//
// EVERY population is COUNT + AREA-share + MAX together, per FACET (never per pair — per-pair accounting
// inflated a published figure by 1.711x). No operator is applied, so no placebo arm is required; the
// placebo-shaped control here is C1 (the published funnel) and C2 (the flat-facet population).
//
// Usage: bash research/tools/run-s115-funnelh.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, exactNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, dflt: number): number => (process.env[n] === undefined ? dflt : Number(process.env[n]));

const STYLE = process.env.PF_S115_STYLE ?? 'GothicArches';
const STL = process.env.PF_S115_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S115_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/s115funnelh';
const STAGES = process.env.PF_S115_STAGES ?? '012345';

// ── the funnel constants, verbatim from s113StraddleDump.ts ──
const HI_DEG = envF('PF_S115_HI_DEG', 45);
const K = Math.round(envF('PF_S115_K', 8));
const INSET_LO = envF('PF_S115_INSET_LO', 0);
const INSET_HI = envF('PF_S115_INSET_HI', 0.05);
const CURTAIN_RATIO = envF('PF_S115_CURTAIN', 8);
const DROP_CUT = envF('PF_S115_DROP', 0.25);
const NORMHI_CUT = envF('PF_S115_NORMHI', 10);
// ── S113 Part-C interior-crease route constants, verbatim from s114Interior.ts ──
const K_LAT = Math.round(envF('PF_S115_KLAT', 12));
const INSET_INT = envF('PF_S115_INSET_INT', 0.1);
const SEP_CUT = envF('PF_S115_SEP', 45);
const MINOR_CUT = envF('PF_S115_MINOR', 0.05);
// ── THE LADDER. `H_PUB` is the step every published S112/S113/S114 number was taken at. ──
const H_PUB = envF('PF_S115_HPUB', 2e-4);
const HS = (process.env.PF_S115_HS ?? '5e-3,1e-3,2e-4,5e-5,1e-5,2e-6,1e-6,1e-7').split(',').map(Number);
const SUB = Math.round(envF('PF_S115_SUB', 400));

const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

const PRED: SweepPredConst = {
  esN: Math.round(envF('PF_CB_ESN', 8)),
  refHs: envF('PF_CB_REF_HS', 0.03),
  refNmax: Math.round(envF('PF_CB_REF_NMAX', 64)),
  kinkScan: Math.round(envF('PF_CB_KINK_SCAN', 16)),
  kinkHalvings: Math.round(envF('PF_CB_KINK_HALVINGS', 24)),
  kinkRatio: envF('PF_CB_KINK_RATIO', 0.15),
  jumpRatio: envF('PF_CB_JUMP_RATIO', 0.62),
  snap: true,
  confMm: envF('PF_CB_CONF_UM', 0.6) / 1000,
};

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

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: ArrayLike<number>): number => {
  let b = -Infinity;
  for (let i = 0; i < v.length; i += 1) if (Number.isFinite(v[i]) && v[i] > b) b = v[i];
  return b;
};

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const scratch = new Float64Array(12);

log('===== S115 — THE GOTHIC S112/S113 FUNNEL, RE-RUN AT HONEST h =====');
log(`style ${STYLE}  tag ${TAG}  stages ${STAGES}`);
log(`funnel: dih>${HI_DEG} deg  ->  graphRatio<=${CURTAIN_RATIO}  ->  drop>=${DROP_CUT} AND normHi>${NORMHI_CUT}  ->  crease-labelled`);
log(`ruler: orientOfFacet k=${K}, WINDING, insets ${INSET_LO}/${INSET_HI}, sampler fdNormals (KINK-AWARE)`);
log(`h LADDER (hArc = hZ, mm): ${HS.map((x) => x.toExponential(0)).join('  ')}      published h = ${H_PUB.toExponential(0)}`);
log('ALGEBRAIC FACT ESTABLISHED BY READING THE SOURCES: stages 1 (facetDihedrals), 2 (graphRatio) and');
log('4 (locateKinkRaw) contain no finite-difference step at all. ONLY the STRADDLING cut can move with h.');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — CLOSED-FORM SELF-TEST OF THE h LADDER ITSELF (C0). TWO-SIDED.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
/** normDeg of a synthetic facet given three (theta, z) parameter points on a radius function. */
function orientSynth(R: (th: number, z: number) => number, ns: NormalSampler, ths: number[], zs: number[], inset: number, k: number): number {
  const xs: number[] = []; const ys: number[] = [];
  for (let i = 0; i < 3; i += 1) { const r = R(ths[i], zs[i]); xs.push(r * Math.cos(ths[i])); ys.push(r * Math.sin(ths[i])); }
  return orientOfFacet(ns, xs[0], ys[0], zs[0], xs[1], ys[1], zs[1], xs[2], ys[2], zs[2],
    ths[0], ths[1], ths[2], { k, inset, orient: 'winding', scratch }).normDeg;
}

let selfTest: Record<string, unknown> = {};
if (STAGES.includes('0')) {
  log('══════════ STAGE 0 — CLOSED-FORM SELF-TEST OF THE h LADDER (C0). TWO-SIDED. ══════════');
  // (a) SMOOTH. r = 40 + 2 cos(6 th); exact derivatives known, so the fd sampler has a TRUTH to miss.
  const rSm = (th: number): number => 40 + 2 * Math.cos(6 * th);
  const nsExact = exactNormals((th) => rSm(th), (th) => -12 * Math.sin(6 * th), () => 0);
  const smTh = [0.30, 0.30 + 0.004, 0.30 + 0.002]; const smZ = [60, 60, 60.3];
  const exactDeg = orientSynth((th) => rSm(th), nsExact, smTh, smZ, 0, K);
  const smErr: number[] = [];
  for (const h of HS) smErr.push(Math.abs(orientSynth((th) => rSm(th), fdNormals((th) => rSm(th), H, h, h), smTh, smZ, 0, K) - exactDeg));
  log(`  (a) SMOOTH r=40+2cos(6th):  exact normDeg ${exactDeg.toFixed(6)} deg`);
  log(`      |fd - exact| per h: ${HS.map((h, i) => `${h.toExponential(0)}:${smErr[i].toExponential(2)}`).join('  ')}`);
  const smMaxErr = Math.max(...smErr);
  const smallestErr = smErr[smErr.length - 1];
  const okSmoothAcc = smMaxErr < 0.01;
  const okSmoothFloor = smallestErr <= Math.max(smErr[0], 1e-9);
  log(`      bars: every |fd-exact| < 0.01 deg => ${okSmoothAcc ? 'PASS' : `*** FAIL (max ${smMaxErr.toExponential(2)}) ***`};  no round-off blow-up at the smallest h => ${okSmoothFloor ? 'PASS' : '*** FAIL ***'}`);
  log('      (h barely matters on a smooth patch. That is the point: h only bites at a C0 crease.)');

  // (b) TENT with a C0 crease. r = 40 (left of thC), 40 + S*(th-thC) (right). ASYMMETRIC, so a
  //     symmetric-window cancellation cannot fake a pass. Flank azimuths 0 and atan(S/40).
  const THC = 0.5; const SLOPE = 20;
  const rTn = (th: number): number => (th <= THC ? 40 : 40 + SLOPE * (th - THC));
  const flankDeg = Math.atan(SLOPE / 40) * DEG;
  // A: entirely inside the RIGHT flank, nearest vertex D_MM from the crease in arc length.
  const D_MM = 1e-4; const dTh = D_MM / 40; const spanTh = 0.2 / 40;
  const aTh = [THC + dTh, THC + dTh + spanTh, THC + dTh + spanTh / 2]; const aZ = [60, 60, 60.2];
  // B: STRADDLING — the crease crosses the interior of the footprint.
  const bTh = [THC - 0.002, THC + 0.002, THC + 0.001]; const bZ = [60, 60, 60.4];
  const aDeg: number[] = []; const bDeg: number[] = [];
  for (const h of HS) {
    const ns = fdNormals((th) => rTn(th), H, h, h);
    aDeg.push(orientSynth((th) => rTn(th), ns, aTh, aZ, 0, K));
    bDeg.push(orientSynth((th) => rTn(th), ns, bTh, bZ, 0, K));
  }
  log(`  (b) TENT (asymmetric clamp at th=${THC}, flank angle ${flankDeg.toFixed(3)} deg):`);
  log(`      A = facet WHOLLY inside one flank, nearest lattice point ${(D_MM * 1000).toFixed(1)} um from the crease`);
  log(`          normDeg per h: ${HS.map((h, i) => `${h.toExponential(0)}:${aDeg[i].toFixed(3)}`).join('  ')}`);
  log(`      B = facet STRADDLING the crease (the crease genuinely crosses its interior)`);
  log(`          normDeg per h: ${HS.map((h, i) => `${h.toExponential(0)}:${bDeg[i].toFixed(3)}`).join('  ')}`);
  const okArtefact = aDeg[0] > 0.75 * flankDeg && aDeg[aDeg.length - 1] < 0.5;
  const bSpread = Math.max(...bDeg) / Math.max(1e-9, Math.min(...bDeg));
  const okStraddle = bSpread < 1.25 && Math.min(...bDeg) > 8;
  log(`      CEILING bar: A reads > ${(0.75 * flankDeg).toFixed(2)} deg at h=${HS[0].toExponential(0)} and < 0.5 deg at h=${HS[HS.length - 1].toExponential(0)}  => ${okArtefact ? 'PASS' : '*** FAIL ***'}`);
  log(`      FLOOR   bar: B is h-STABLE (spread ${bSpread.toFixed(4)}x < 1.25x) and stays > 8 deg (min ${Math.min(...bDeg).toFixed(3)})  => ${okStraddle ? 'PASS' : '*** FAIL ***'}`);
  log('      (the FLOOR is the whole two-sidedness: a sampler that had simply stopped working would satisfy');
  log('       the ceiling alone. A genuine interior straddle must survive every h.)');
  const ok = okSmoothAcc && okSmoothFloor && okArtefact && okStraddle;
  log(`  >>> C0 SELF-TEST ${ok ? 'PASS' : '*** FAIL — THE RUN IS VOID ***'}   ${el()}`);
  selfTest = { exactDeg, smErr, aDeg, bDeg, flankDeg, okSmoothAcc, okSmoothFloor, okArtefact, okStraddle, ok };
  if (!ok) { log('*** ABORTING: the h ladder itself does not behave in closed form. No mesh number may be quoted. ***'); process.exit(6); }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MESH + PRECOND
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent ${d.inconsistentEdges}  ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED GEOMETRY — transcribed from s113StraddleDump.ts so the funnel is THE SAME funnel
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
function orientOf(f: number, ns: NormalSampler, inset: number, k: number): number {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(ns,
    xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k, inset, orient: 'winding', scratch }).normDeg;
}
const centroid = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
const sharedEndpoints = (e: number): number[] | null => {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) {
      if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
    }
  }
  return out.length === 6 ? out : null;
};
const areaOfSet = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const uniqFacets = (idx: number[], f1s: Int32Array, f2s: Int32Array): number[] => {
  const s = new Set<number>();
  for (const i of idx) { s.add(f1s[i]); s.add(f2s[i]); }
  return [...s];
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — THE h-FREE STAGES, COMPUTED ONCE (1, 2 and 4)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('══════════ STAGE 1 — THE h-FREE CUTS (dihedral, graphRatio, crease label), COMPUTED ONCE ══════════');
const hiThr = (HI_DEG * Math.PI) / 180;
const hiE: number[] = [];
for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] > hiThr) hiE.push(e);
const grCache = new Map<number, number>();
const grOf = (f: number): number => { const c = grCache.get(f); if (c !== undefined) return c; const v = graphRatio(f); grCache.set(f, v); return v; };
const hiF1 = new Int32Array(hiE.length); const hiF2 = new Int32Array(hiE.length);
for (let i = 0; i < hiE.length; i += 1) { hiF1[i] = d.edgeF1[hiE[i]]; hiF2[i] = d.edgeF2[hiE[i]]; }
const hiIdx = hiE.map((_v, i) => i);
const hiFacets = uniqFacets(hiIdx, hiF1, hiF2);
const hiArea = areaOfSet(hiFacets);
log(`  STAGE 1 dihedral > ${HI_DEG} deg:      pairs ${hiE.length} (S108/S112/S113: 19582)   unique facets ${hiFacets.length}   AREA ${hiArea.toFixed(3)} mm2 = ${((hiArea / meshArea) * 100).toFixed(4)}% of mesh   MAX dihedral ${(mx(Array.from(hiIdx, (i) => d.edgeAngRad[hiE[i]])) * DEG).toFixed(6)} deg`);

const wallIdx: number[] = [];
for (let i = 0; i < hiE.length; i += 1) if (!(grOf(hiF1[i]) > CURTAIN_RATIO || grOf(hiF2[i]) > CURTAIN_RATIO)) wallIdx.push(i);
const wallFacets = uniqFacets(wallIdx, hiF1, hiF2);
const wallArea = areaOfSet(wallFacets);
log(`  STAGE 2 ... AND WALL (graphRatio <= ${CURTAIN_RATIO}):  pairs ${wallIdx.length} (S112/S113: 13092)   unique facets ${wallFacets.length}   AREA ${wallArea.toFixed(3)} mm2 = ${((wallArea / meshArea) * 100).toFixed(4)}% of mesh`);
log('  CURTAIN-CUT LADDER (scar 4 — a classification threshold must never rest on one value):');
for (const c of [2, 4, 8, 16, 32, 128]) {
  const sel: number[] = [];
  for (let i = 0; i < hiE.length; i += 1) if (!(grOf(hiF1[i]) > c || grOf(hiF2[i]) > c)) sel.push(i);
  const fs = uniqFacets(sel, hiF1, hiF2); const a = areaOfSet(fs);
  log(`     cut ${String(c).padStart(3)}x  WALL pairs ${String(sel.length).padStart(6)} (${((sel.length / hiE.length) * 100).toFixed(2).padStart(6)}% of class)  facets ${String(fs.length).padStart(6)}  AREA ${a.toFixed(3).padStart(9)} mm2 = ${((a / meshArea) * 100).toFixed(4)}% of mesh`);
}
log(`  ${el()}`);

// crease label on EVERY wall pair — h-free, so computed once and reused at every h
const creaseOK = new Uint8Array(wallIdx.length);
{
  let nOnEdge = 0; let nOnSeg = 0; let nShared = 0;
  for (let j = 0; j < wallIdx.length; j += 1) {
    const i = wallIdx[j]; const e = hiE[i]; const f1 = hiF1[i]; const f2 = hiF2[i];
    const p = sharedEndpoints(e);
    if (p === null) continue;
    nShared += 1;
    const thE = Math.atan2(p[1], p[0]);
    const kEdge = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
    const c1 = centroid(f1); const c2 = centroid(f2);
    const thC = Math.atan2(c1[1], c1[0]);
    const kSeg = locateKinkRaw(rA, thC, c1[2], thC + dThRaw(thC, Math.atan2(c2[1], c2[0])), c2[2], PRED);
    const onEdge = kEdge !== null && !kEdge.jump;
    const onSeg = kSeg !== null && !kSeg.jump;
    if (onEdge) nOnEdge += 1;
    if (onSeg) nOnSeg += 1;
    creaseOK[j] = onEdge || onSeg ? 1 : 0;
  }
  let nLab = 0; for (let j = 0; j < creaseOK.length; j += 1) nLab += creaseOK[j];
  log(`  STAGE 4 crease label (locateKinkRaw — h-FREE, computed ONCE over all ${wallIdx.length} WALL pairs):`);
  log(`     shared-endpoint pairs ${nShared}   on SHARED EDGE ${nOnEdge}   on CENTROID SEGMENT ${nOnSeg}   labelled (either) ${nLab}`);
  log(`  ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DOMAIN — the unique facets of the WALL pairs. h-FREE, so BOTH routes select from the SAME set.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const domain = Int32Array.from(wallFacets);
const dIdx = new Int32Array(nTri).fill(-1);
for (let i = 0; i < domain.length; i += 1) dIdx[domain[i]] = i;
log(`DOMAIN for both routes = the ${domain.length} unique WALL facets (h-FREE). AREA ${wallArea.toFixed(3)} mm2.`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE INTERIOR-CREASE ROUTE (S113 Part C / S114), transcribed verbatim
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const angAt = (p: Float64Array, po: number, r: Float64Array, ro: number): number => {
  let dd = p[po] * r[ro] + p[po + 1] * r[ro + 1] + p[po + 2] * r[ro + 2];
  dd = dd > 1 ? 1 : dd < -1 ? -1 : dd;
  return Math.acos(dd);
};
/** hoisted so the 18k-facet x 8-rung sweep does not allocate 8.7 kB per facet (GC, not arithmetic). */
const sampBuf = new Float64Array((((K_LAT + 1) * (K_LAT + 2)) / 2) * 4 * 3);
function sampleFacet(f: number, k: number, inset: number, ns: NormalSampler): { n: Float64Array; m: number } {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = cap * 4 * 3 <= sampBuf.length ? sampBuf : new Float64Array(cap * 4 * 3);
  const sh = 1 - inset; const sc = inset / 3;
  let m = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const a = sh * (i / k) + sc; const b = sh * (j / k) + sc; const c = 1 - a - b;
    const nc = ns(a * ath + b * bth + c * cth, a * az + b * bz + c * cz, scratch);
    for (let qi = 0; qi < nc; qi += 1) {
      n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2]; m += 1;
    }
  }
  return { n, m };
}
function twoMeans(n: Float64Array, m: number): { sepDeg: number; minor: number } {
  if (m < 2) return { sepDeg: 0, minor: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < m; i += 1) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  const L0 = Math.hypot(sx, sy, sz) || 1;
  const mean = new Float64Array([sx / L0, sy / L0, sz / L0]);
  let i1 = 0; let best = -1;
  for (let i = 0; i < m; i += 1) { const a = angAt(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = 0; best = -1;
  for (let i = 0; i < m; i += 1) { const a = angAt(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
  const c = new Float64Array([n[i1 * 3], n[i1 * 3 + 1], n[i1 * 3 + 2], n[i2 * 3], n[i2 * 3 + 1], n[i2 * 3 + 2]]);
  let na = 0;
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; na = 0;
    for (let i = 0; i < m; i += 1) {
      if (angAt(n, i * 3, c, 0) <= angAt(n, i * 3, c, 3)) { ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
      else { bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (m - na > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || na === m) break;
  }
  return { sepDeg: na > 0 && na < m ? angAt(c, 0, c, 3) * DEG : 0, minor: Math.min(na, m - na) / m };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ONE RUNG OF THE LADDER
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Rung {
  h: number;
  nHi: Float64Array; nLo: Float64Array;                       // per DOMAIN index
  stradIdx: number[]; targetIdx: number[];                    // per WALL-pair index (into wallIdx)
  onlyNormHi: number; onlyDrop: number;
  stradFacets: number[]; targetFacets: number[];
  stradArea: number; targetArea: number;
  stradMax: number; targetMax: number;
  dropP10: number; dropP50: number; dropP90: number;
  nHiP50: number; nHiP90: number; nLoP50: number; nLoP90: number;
  ctlLoP50: number; ctlLoP90: number; ctlRefP50: number; ctlRefP90: number; ctlPass: boolean;
  intFacets: number[]; intArea: number; intMax: number;
  pairDrop: Float64Array; pairHi: Float64Array; pairLo: Float64Array;
}

// negative-control populations, chosen ONCE so every rung scores the same facets
const ctlLoPairs: number[] = [];
{
  const loThr = (2 * Math.PI) / 180;
  const stride = Math.max(1, Math.floor(d.edgeAngRad.length / (SUB * 8)));
  for (let e = 0; e < d.edgeAngRad.length && ctlLoPairs.length < SUB; e += stride) if (d.edgeAngRad[e] < loThr) ctlLoPairs.push(e);
}
const ctlRefFacets: number[] = [];
{
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let gsr = Math.max(1, Math.round(nTri * 0.6180339887498949));
  if (gsr % 2 === 0) gsr += 1;
  while (gsr > 1 && gcd(gsr, nTri) !== 1) gsr += 2;
  for (let i = 0; i < 1500; i += 1) ctlRefFacets.push((i * gsr) % nTri);
}

const doInterior = STAGES.includes('5');

function runRung(h: number): Rung {
  const ns = fdNormals(rA, H, h, h);
  const nHi = new Float64Array(domain.length);
  const nLo = new Float64Array(domain.length);
  for (let i = 0; i < domain.length; i += 1) {
    nHi[i] = orientOf(domain[i], ns, INSET_HI, K);
    nLo[i] = orientOf(domain[i], ns, INSET_LO, K);
  }
  const stradIdx: number[] = []; const targetIdx: number[] = [];
  const pairDrop = new Float64Array(wallIdx.length);
  const pairHi = new Float64Array(wallIdx.length);
  const pairLo = new Float64Array(wallIdx.length);
  let onlyNormHi = 0; let onlyDrop = 0;
  for (let j = 0; j < wallIdx.length; j += 1) {
    const i = wallIdx[j];
    const a = dIdx[hiF1[i]]; const b = dIdx[hiF2[i]];
    const normHi = Math.max(nHi[a], nHi[b]); const normLo = Math.max(nLo[a], nLo[b]);
    const drop = normLo > 1e-9 ? normHi / normLo : 1;
    pairHi[j] = normHi; pairLo[j] = normLo; pairDrop[j] = drop;
    if (normHi > NORMHI_CUT) onlyNormHi += 1;
    if (drop >= DROP_CUT) onlyDrop += 1;
    if (!(drop >= DROP_CUT && normHi > NORMHI_CUT)) continue;
    stradIdx.push(j);
    if (creaseOK[j] === 1) targetIdx.push(j);
  }
  const wIdxOf = (js: number[]): number[] => js.map((j) => wallIdx[j]);
  const stradFacets = uniqFacets(wIdxOf(stradIdx), hiF1, hiF2);
  const targetFacets = uniqFacets(wIdxOf(targetIdx), hiF1, hiF2);
  // NEGATIVE CONTROL at this h
  const ctlLo: number[] = [];
  for (const e of ctlLoPairs) ctlLo.push(Math.max(orientOf(d.edgeF1[e], ns, INSET_HI, K), orientOf(d.edgeF2[e], ns, INSET_HI, K)));
  const ctlRef = ctlRefFacets.map((f) => orientOf(f, ns, INSET_HI, K));
  // INTERIOR ROUTE at this h, on the SAME h-free domain
  const intFacets: number[] = [];
  if (doInterior) {
    for (let i = 0; i < domain.length; i += 1) {
      const s = sampleFacet(domain[i], K_LAT, INSET_INT, ns);
      const r = twoMeans(s.n, s.m);
      if (r.sepDeg >= SEP_CUT && r.minor >= MINOR_CUT) intFacets.push(domain[i]);
    }
  }
  const ndOf = (fs: number[]): number[] => fs.map((f) => nHi[dIdx[f]]);
  return {
    h, nHi, nLo, stradIdx, targetIdx, onlyNormHi, onlyDrop,
    stradFacets, targetFacets,
    stradArea: areaOfSet(stradFacets), targetArea: areaOfSet(targetFacets),
    stradMax: stradFacets.length > 0 ? mx(ndOf(stradFacets)) : NaN,
    targetMax: targetFacets.length > 0 ? mx(ndOf(targetFacets)) : NaN,
    dropP10: q(pairDrop, 0.1), dropP50: q(pairDrop, 0.5), dropP90: q(pairDrop, 0.9),
    nHiP50: q(pairHi, 0.5), nHiP90: q(pairHi, 0.9), nLoP50: q(pairLo, 0.5), nLoP90: q(pairLo, 0.9),
    ctlLoP50: q(ctlLo, 0.5), ctlLoP90: q(ctlLo, 0.9), ctlRefP50: q(ctlRef, 0.5), ctlRefP90: q(ctlRef, 0.9),
    ctlPass: q(ctlLo, 0.9) <= q(ctlRef, 0.9) * 1.25,
    intFacets, intArea: areaOfSet(intFacets), intMax: intFacets.length > 0 ? mx(ndOf(intFacets)) : NaN,
    pairDrop, pairHi, pairLo,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — THE CONTROL: THE PUBLISHED FUNNEL AT THE PUBLISHED h (C1)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log(`══════════ STAGE 2 — CONTROL (C1): THE PUBLISHED FUNNEL AT THE PUBLISHED h = ${H_PUB.toExponential(0)} ══════════`);
const rungPub = runRung(H_PUB);
log(`  dihedral > ${HI_DEG} deg                        ${hiE.length}   (published 19582)   ${hiE.length === 19582 ? 'MATCH' : '*** DEVIATES ***'}`);
log(`  ... AND WALL (graphRatio <= ${CURTAIN_RATIO})            ${wallIdx.length}   (published 13092)   ${wallIdx.length === 13092 ? 'MATCH' : '*** DEVIATES ***'}`);
log(`  ... AND STRADDLING (drop>=${DROP_CUT}, normHi>${NORMHI_CUT})  ${rungPub.stradIdx.length}   (published 5174)   ${rungPub.stradIdx.length === 5174 ? 'MATCH' : '*** DEVIATES ***'}`);
log(`  ... AND crease-labelled                     ${rungPub.targetIdx.length}   (published 3282)   ${rungPub.targetIdx.length === 3282 ? 'MATCH' : '*** DEVIATES ***'}`);
log(`  unique facets ${rungPub.targetFacets.length} (published 6193)   AREA ${rungPub.targetArea.toFixed(4)} mm2 (published 69.8258) = ${((rungPub.targetArea / meshArea) * 100).toFixed(4)}% of mesh (published 0.1816%)`);
const c1 = hiE.length === 19582 && wallIdx.length === 13092 && rungPub.stradIdx.length === 5174
  && rungPub.targetIdx.length === 3282 && rungPub.targetFacets.length === 6193
  && Math.abs(rungPub.targetArea - 69.8258) < 5e-3;
log(`  >>> C1 ${c1 ? 'THE PUBLISHED FUNNEL IS REPRODUCED EXACTLY.' : '*** C1 FIRED — THE PUBLISHED FUNNEL DOES NOT REPRODUCE. STOPPING. ***'}`);
if (!c1) {
  log('  The brief pre-registers this as a BIGGER finding than the h sweep: it would mean the S114 ruler');
  log('  rewrite moved something it was proven not to move. Reporting the deviation and halting rather');
  log('  than continuing onto numbers whose baseline is unknown.');
  writeFileSync(`${OUTDIR}/S115_FUNNELH_${TAG}.summary.json`, `${JSON.stringify({
    style: STYLE, stl: STL, VOID: 'C1 control failed — published funnel not reproduced',
    got: { high: hiE.length, wall: wallIdx.length, strad: rungPub.stradIdx.length, target: rungPub.targetIdx.length, facets: rungPub.targetFacets.length, areaMm2: rungPub.targetArea },
    expected: { high: 19582, wall: 13092, strad: 5174, target: 3282, facets: 6193, areaMm2: 69.8258 },
  }, null, 2)}\n`);
  process.exit(5);
}
log(`  NEGATIVE CONTROL (C2) at this h: low-dihedral p90 ${rungPub.ctlLoP90.toFixed(3)} vs whole-mesh p90 ${rungPub.ctlRefP90.toFixed(3)}  => ${rungPub.ctlPass ? 'PASS' : '*** FAIL ***'}`);
log(`  ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — THE LADDER
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('══════════ STAGE 3 — THE WHOLE FUNNEL, RE-RUN AT EVERY h ══════════');
log('  Stages 1 and 2 are h-FREE and printed once above (19,582 pairs / 13,092 WALL pairs).');
log('');
const rungs: Rung[] = [];
for (const h of HS) {
  const r = h === H_PUB ? rungPub : runRung(h);
  rungs.push(r);
  log(`  ── h = ${h.toExponential(0)} ${h === H_PUB ? '(THE PUBLISHED STEP)' : ''} ${el()}`);
  log(`     STRADDLING  pairs ${String(r.stradIdx.length).padStart(6)}  facets ${String(r.stradFacets.length).padStart(6)}  AREA ${r.stradArea.toFixed(4).padStart(9)} mm2 = ${((r.stradArea / meshArea) * 100).toFixed(4)}% of mesh  MAX normDeg ${r.stradMax.toFixed(3)}`);
  log(`     TARGET SET  pairs ${String(r.targetIdx.length).padStart(6)}  facets ${String(r.targetFacets.length).padStart(6)}  AREA ${r.targetArea.toFixed(4).padStart(9)} mm2 = ${((r.targetArea / meshArea) * 100).toFixed(4)}% of mesh  MAX normDeg ${r.targetMax.toFixed(3)}`);
  log(`     sub-cuts    normHi>${NORMHI_CUT} alone ${String(r.onlyNormHi).padStart(6)}   drop>=${DROP_CUT} alone ${String(r.onlyDrop).padStart(6)}   both ${String(r.stradIdx.length).padStart(6)}   (of ${wallIdx.length} WALL pairs)`);
  log(`     over WALL   normHi p50 ${r.nHiP50.toFixed(3).padStart(8)} p90 ${r.nHiP90.toFixed(3).padStart(8)}   normLo p50 ${r.nLoP50.toFixed(3).padStart(8)} p90 ${r.nLoP90.toFixed(3).padStart(8)}   drop p10 ${r.dropP10.toFixed(4)} p50 ${r.dropP50.toFixed(4)} p90 ${r.dropP90.toFixed(4)}`);
  log(`     C2 control  low-dih p50 ${r.ctlLoP50.toFixed(3)} p90 ${r.ctlLoP90.toFixed(3)}   whole-mesh p50 ${r.ctlRefP50.toFixed(3)} p90 ${r.ctlRefP90.toFixed(3)}   => ${r.ctlPass ? 'PASS' : '*** FAIL — THIS RUNG IS VOID ***'}`);
  if (doInterior) log(`     INTERIOR route (independent): facets ${String(r.intFacets.length).padStart(6)}  AREA ${r.intArea.toFixed(4).padStart(9)} mm2 = ${((r.intArea / meshArea) * 100).toFixed(4)}% of mesh  MAX normDeg ${r.intMax.toFixed(3)}`);
}
log('');
log('  ── THE LADDER AS ONE TABLE (COUNT + AREA + MAX at every stage; stages 1/2 are h-free) ──');
log('     h        STRAD pairs  STRAD facets   STRAD mm2   %mesh   | TARGET pairs  facets    mm2     %mesh    MAX   | C2');
for (const r of rungs) {
  log(`     ${r.h.toExponential(0).padStart(7)}  ${String(r.stradIdx.length).padStart(11)}  ${String(r.stradFacets.length).padStart(12)}  ${r.stradArea.toFixed(3).padStart(10)}  ${((r.stradArea / meshArea) * 100).toFixed(4).padStart(7)} | ${String(r.targetIdx.length).padStart(12)}  ${String(r.targetFacets.length).padStart(6)}  ${r.targetArea.toFixed(3).padStart(8)}  ${((r.targetArea / meshArea) * 100).toFixed(4).padStart(7)}  ${r.targetMax.toFixed(1).padStart(6)}  | ${r.ctlPass ? 'ok' : 'FAIL'}`);
}
log(`  ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — IS `drop` h-SENSITIVE IN A WAY NEITHER FACTOR IS ALONE? (the brief's item 5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.includes('4') && HS.indexOf(H_PUB) >= 0) {
  log('══════════ STAGE 4 — `drop` IS A RATIO OF TWO h-CONTAMINATED QUANTITIES ══════════');
  log('  Per WALL PAIR, against the SAME pair at the published h. A ratio can move when neither factor');
  log('  moves, and it can also stay put while both factors move together. Both are checked.');
  const base = rungs[HS.indexOf(H_PUB)];
  log('     h        normHi(h)/normHi(hpub)   normLo(h)/normLo(hpub)   drop(h)/drop(hpub)      |log| p50: Hi / Lo / drop');
  for (const r of rungs) {
    const rHi: number[] = []; const rLo: number[] = []; const rDr: number[] = [];
    const lHi: number[] = []; const lLo: number[] = []; const lDr: number[] = [];
    for (let j = 0; j < wallIdx.length; j += 1) {
      if (base.pairHi[j] > 1e-9) { const v = r.pairHi[j] / base.pairHi[j]; rHi.push(v); lHi.push(Math.abs(Math.log(Math.max(1e-12, v)))); }
      if (base.pairLo[j] > 1e-9) { const v = r.pairLo[j] / base.pairLo[j]; rLo.push(v); lLo.push(Math.abs(Math.log(Math.max(1e-12, v)))); }
      if (base.pairDrop[j] > 1e-9) { const v = r.pairDrop[j] / base.pairDrop[j]; rDr.push(v); lDr.push(Math.abs(Math.log(Math.max(1e-12, v)))); }
    }
    log(`     ${r.h.toExponential(0).padStart(7)}  p50 ${q(rHi, 0.5).toFixed(4).padStart(8)}  p90 ${q(rHi, 0.9).toFixed(4).padStart(8)}   p50 ${q(rLo, 0.5).toFixed(4).padStart(8)}  p90 ${q(rLo, 0.9).toFixed(4).padStart(8)}   p50 ${q(rDr, 0.5).toFixed(4).padStart(8)}  p90 ${q(rDr, 0.9).toFixed(4).padStart(8)}    ${q(lHi, 0.5).toFixed(4)} / ${q(lLo, 0.5).toFixed(4)} / ${q(lDr, 0.5).toFixed(4)}`);
  }
  log('  READ: |log ratio| p50 is the typical multiplicative move of each quantity away from the published h.');
  log('  If drop\'s column exceeds BOTH factor columns, the ratio is more h-sensitive than either factor and');
  log('  the STRADDLING cut inherits a sensitivity that neither of its inputs advertises.');
  log('');
  log('  ── DROP-CUT LADDER at every h (scar 4: the 0.25 cut is a convention, so sweep it) ──');
  log('     h        drop>=0.10   0.25   0.50   0.75   (STRADDLING pairs, with normHi>10 held)');
  for (const r of rungs) {
    const cells: string[] = [];
    for (const dc of [0.10, 0.25, 0.50, 0.75]) {
      let n = 0;
      for (let j = 0; j < wallIdx.length; j += 1) if (r.pairDrop[j] >= dc && r.pairHi[j] > NORMHI_CUT) n += 1;
      cells.push(String(n).padStart(6));
    }
    log(`     ${r.h.toExponential(0).padStart(7)}  ${cells.join('  ')}`);
  }
  log(`  ${el()}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — THE TWO ROUTES, CROSS-TABULATED (C3)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const agree: Array<Record<string, number>> = [];
if (doInterior) {
  log('══════════ STAGE 5 — THE TWO INDEPENDENT ROUTES, CROSS-TABULATED (C3) ══════════');
  log('  ROUTE A = the S112/S113 FUNNEL target set at this h (dihedral -> wall -> straddling -> crease label).');
  log(`  ROUTE B = the INTERIOR-CREASE route: 2-means on the analytic normal field, k=${K_LAT}, inset ${INSET_INT},`);
  log(`            sep>=${SEP_CUT} deg, minority>=${MINOR_CUT}. It never looks at the dihedral or at any mesh boundary.`);
  log(`  Both select from the SAME h-free domain (${domain.length} WALL facets), so the 2x2 is honest.`);
  log('  S113 published ROUTE B = 1,537 facets / 15.8233 mm2 / 0.0411% of mesh (measured at h = 2e-4, and');
  log('  restricted to the 6,193 facets ROUTE A had already selected).');
  log('');
  for (const r of rungs) {
    const A = new Set(r.targetFacets); const B = new Set(r.intFacets);
    const both: number[] = []; const aOnly: number[] = []; const bOnly: number[] = [];
    for (const f of r.targetFacets) { if (B.has(f)) both.push(f); else aOnly.push(f); }
    for (const f of r.intFacets) if (!A.has(f)) bOnly.push(f);
    const jc = both.length / Math.max(1, A.size + B.size - both.length);
    const abo = areaOfSet(both); const aao = areaOfSet(aOnly); const abo2 = areaOfSet(bOnly);
    const ja = abo / Math.max(1e-12, abo + aao + abo2);
    // S113-COMPARABLE: route B restricted to route A's set, exactly as S113 did
    const bInA = r.intFacets.filter((f) => A.has(f));
    log(`  ── h = ${r.h.toExponential(0)}`);
    log(`     ROUTE A  n ${String(A.size).padStart(6)}  AREA ${areaOfSet(r.targetFacets).toFixed(4).padStart(9)} mm2 = ${((areaOfSet(r.targetFacets) / meshArea) * 100).toFixed(4)}% of mesh`);
    log(`     ROUTE B  n ${String(B.size).padStart(6)}  AREA ${r.intArea.toFixed(4).padStart(9)} mm2 = ${((r.intArea / meshArea) * 100).toFixed(4)}% of mesh   (on the whole WALL domain)`);
    log(`       both ${String(both.length).padStart(6)} / ${abo.toFixed(4)} mm2   A-only ${String(aOnly.length).padStart(6)} / ${aao.toFixed(4)} mm2   B-only ${String(bOnly.length).padStart(6)} / ${abo2.toFixed(4)} mm2`);
    log(`       JACCARD by count ${(jc * 100).toFixed(2)}%   by area ${(ja * 100).toFixed(2)}%   A/B size ratio ${(A.size / Math.max(1, B.size)).toFixed(3)}x by count, ${(areaOfSet(r.targetFacets) / Math.max(1e-12, r.intArea)).toFixed(3)}x by area`);
    log(`       S113-COMPARABLE (route B restricted to route A, as S113 measured it): n ${bInA.length}  AREA ${areaOfSet(bInA).toFixed(4)} mm2 = ${((areaOfSet(bInA) / meshArea) * 100).toFixed(4)}% of mesh`);
    agree.push({
      h: r.h, aN: A.size, aArea: areaOfSet(r.targetFacets), bN: B.size, bArea: r.intArea,
      bothN: both.length, bothArea: abo, aOnlyN: aOnly.length, bOnlyN: bOnly.length,
      jaccardCount: jc, jaccardArea: ja, bInAN: bInA.length, bInAArea: areaOfSet(bInA),
    });
  }
  log(`  ${el()}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — THE k-LADDER AT THE HONEST h (scar 2) AND THE CORRECTED HEADLINES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.includes('3')) {
  const hHonest = HS[HS.length - 1];
  log(`══════════ STAGE 6a — LATTICE-ORDER LADDER AT THE HONEST h = ${hHonest.toExponential(0)} (scar 2) ══════════`);
  const ns = fdNormals(rA, H, hHonest, hHonest);
  const sub = domain.filter((_v, i) => i % Math.max(1, Math.floor(domain.length / SUB)) === 0).slice(0, SUB);
  for (const kk of [4, 8, 16, 32]) {
    const nd = Array.from(sub, (f) => orientOf(f, ns, INSET_HI, kk));
    log(`     k=${String(kk).padStart(2)}  normDeg p50 ${q(nd, 0.5).toFixed(4).padStart(9)} p90 ${q(nd, 0.9).toFixed(4).padStart(9)} p99 ${q(nd, 0.99).toFixed(4).padStart(9)}  MAX ${mx(nd).toFixed(3)}   (n=${sub.length})`);
  }
  log(`  ${el()}`);
  log('');
}

log('══════════ STAGE 6b — THE CORRECTED HEADLINES ══════════');
{
  const pct = (a: number): string => `${((a / meshArea) * 100).toFixed(4)}%`;
  const rel = (a: number, b: number): number => Math.abs(a - b) / Math.max(1e-12, b);
  // "stable at h" := the first (largest) h whose target area is within 5% of EVERY smaller h in the ladder
  let stableH = NaN; let stableArea = NaN;
  for (let i = 0; i < rungs.length; i += 1) {
    let ok = true;
    for (let j = i + 1; j < rungs.length; j += 1) if (rel(rungs[j].targetArea, rungs[i].targetArea) > 0.05) { ok = false; break; }
    if (ok) { stableH = rungs[i].h; stableArea = rungs[i].targetArea; break; }
  }
  let stableSH = NaN; let stableSArea = NaN;
  for (let i = 0; i < rungs.length; i += 1) {
    let ok = true;
    for (let j = i + 1; j < rungs.length; j += 1) if (rel(rungs[j].stradArea, rungs[i].stradArea) > 0.05) { ok = false; break; }
    if (ok) { stableSH = rungs[i].h; stableSArea = rungs[i].stradArea; break; }
  }
  const last = rungs[rungs.length - 1];
  log(`  S112 HEADLINE — the STRADDLING class ("genuine defect area"):`);
  log(`     published (h=2e-4): ${rungPub.stradArea.toFixed(4)} mm2 = ${pct(rungPub.stradArea)} of mesh, ${rungPub.stradFacets.length} facets`);
  log(`     CORRECTED         : ${last.stradArea.toFixed(4)} mm2 = ${pct(last.stradArea)} of mesh, ${last.stradFacets.length} facets   at h=${last.h.toExponential(0)}`);
  log(`     stable from h = ${Number.isFinite(stableSH) ? stableSH.toExponential(0) : 'NOT REACHED IN THIS LADDER'} downward (5% band on AREA), area there ${Number.isFinite(stableSArea) ? stableSArea.toFixed(4) : 'n/a'} mm2`);
  log(`     shrink factor published -> honest: ${(rungPub.stradArea / Math.max(1e-12, last.stradArea)).toFixed(3)}x by AREA, ${(rungPub.stradFacets.length / Math.max(1, last.stradFacets.length)).toFixed(3)}x by FACET COUNT`);
  log('');
  log(`  S113 HEADLINE — the TARGET SET (straddling AND crease-labelled):`);
  log(`     published (h=2e-4): ${rungPub.targetArea.toFixed(4)} mm2 = ${pct(rungPub.targetArea)} of mesh, ${rungPub.targetFacets.length} facets, ${rungPub.targetIdx.length} pairs`);
  log(`     CORRECTED         : ${last.targetArea.toFixed(4)} mm2 = ${pct(last.targetArea)} of mesh, ${last.targetFacets.length} facets, ${last.targetIdx.length} pairs   at h=${last.h.toExponential(0)}`);
  log(`     stable from h = ${Number.isFinite(stableH) ? stableH.toExponential(0) : 'NOT REACHED IN THIS LADDER'} downward (5% band on AREA), area there ${Number.isFinite(stableArea) ? stableArea.toFixed(4) : 'n/a'} mm2`);
  log(`     shrink factor published -> honest: ${(rungPub.targetArea / Math.max(1e-12, last.targetArea)).toFixed(3)}x by AREA, ${(rungPub.targetFacets.length / Math.max(1, last.targetFacets.length)).toFixed(3)}x by FACET COUNT`);
  log('');
  log(`  S113's INTERIOR-CREASE ROUTE for comparison (1,537 / 15.8233 mm2 / 0.0411% of mesh, published at h=2e-4):`);
  if (doInterior) {
    for (const r of rungs) log(`     h=${r.h.toExponential(0).padStart(7)}  route B on the WALL domain: ${String(r.intFacets.length).padStart(6)} facets  ${r.intArea.toFixed(4).padStart(9)} mm2 = ${pct(r.intArea)} of mesh`);
  } else log('     (stage 5 disabled — route B not run)');
}
log(`  ${el()}`);
log('');

writeFileSync(`${OUTDIR}/S115_FUNNELH_${TAG}.summary.json`, `${JSON.stringify({
  style: STYLE, stl: STL, tag: TAG,
  cuts: { HI_DEG, CURTAIN_RATIO, DROP_CUT, NORMHI_CUT, INSET_LO, INSET_HI, K, K_LAT, INSET_INT, SEP_CUT, MINOR_CUT },
  meshFacets: nTri, meshAreaMm2: meshArea,
  hFree: {
    highPairs: hiE.length, highFacets: hiFacets.length, highAreaMm2: hiArea,
    wallPairs: wallIdx.length, wallFacets: wallFacets.length, wallAreaMm2: wallArea,
  },
  selfTest,
  c1Reproduced: c1,
  ladder: rungs.map((r) => ({
    h: r.h,
    stradPairs: r.stradIdx.length, stradFacets: r.stradFacets.length, stradAreaMm2: r.stradArea, stradPctMesh: (r.stradArea / meshArea) * 100, stradMaxNormDeg: r.stradMax,
    targetPairs: r.targetIdx.length, targetFacets: r.targetFacets.length, targetAreaMm2: r.targetArea, targetPctMesh: (r.targetArea / meshArea) * 100, targetMaxNormDeg: r.targetMax,
    onlyNormHi: r.onlyNormHi, onlyDrop: r.onlyDrop,
    normHiP50: r.nHiP50, normHiP90: r.nHiP90, normLoP50: r.nLoP50, normLoP90: r.nLoP90,
    dropP10: r.dropP10, dropP50: r.dropP50, dropP90: r.dropP90,
    ctlLoP90: r.ctlLoP90, ctlRefP90: r.ctlRefP90, ctlPass: r.ctlPass,
    intFacets: r.intFacets.length, intAreaMm2: r.intArea, intPctMesh: (r.intArea / meshArea) * 100,
  })),
  agreement: agree,
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S115_FUNNELH_${TAG}.summary.json`);
log(`done ${el()}`);
