// s114Interior.ts — CHARACTERISE THE ONE GENUINELY OPEN TARGET: S113's 1,537 "interior straddlers".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT S113 LEFT, AND WHY IT NEEDS AN INDEPENDENT RE-DERIVATION BEFORE ANYTHING ELSE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S113's Part C (`s113opOracleC.ts`, report S113OPC_ORACLE_GOTH.report.txt line 66) closed the crease
// programme for 99.40% of the pinned straddle class and left exactly one open set:
//
//     COUNT 1537/6193 (24.82%)  AREA 15.8233 mm2 = 22.66% of target = 0.0411% of mesh
//
// defined as `interiorSep >= 45 deg AND interiorMinor >= 0.05`, where both come from a 2-MEANS CLUSTERING
// of the ANALYTIC SURFACE NORMALS sampled on an order-12 barycentric lattice INSET BY 0.1. That is a
// NORMAL-FIELD test. It never looks at the mesh boundary and it never asks whether a C0 crease exists.
//
// *** THE TENSION THAT MOTIVATES THIS FILE. *** S113-A's DENSE BOUNDARY SCAN classified the SAME 6,193
// facets (S113A_LEGALITY_GOTH.report.txt, N=256 bar 15) as: TWO_EDGE 107, VERTEX_THROUGH 337, MULTI 33,
// ONE 484, NONE 492, ALIGNED 4,735. A crease that crosses a facet's INTERIOR must cross its BOUNDARY twice
// (or pass through a vertex). At most 107+337+33 = 477 facets have that. But the normal-clustering test
// says 1,537. Those two statements cannot both be about the same geometric fact. One of:
//   (i)  the 2-means test fires on a SMOOTH-but-fast bend (no C0 crease at all) — a false positive;
//   (ii) the crease enters and leaves through the SAME edge, or terminates inside (no legal chord);
//   (iii) S113-A's scan missed crossings.
// This file measures which, with a geometric instrument that is independent of the clustering.
//
// ⚠ AND THE INSTRUMENT ITSELF MOVED UNDER S113'S FEET. `locateTurnAdaptive` in `orientRuler.ts` was a
// BISECTION when S113 ran; it is now a RE-SCAN (S114, same worktree, 13/13 fixtures green including F11's
// asymmetric clamp which the bisection under-read 1.7e6x and F12's flat skirt which it invented an `s` on).
// S113-A/OP2 therefore had to hand-roll a dense scanner because the shipped locator was broken. It is not
// broken any more. Every crossing in this file comes from the FIXED locator, and the same closed-form
// self-test (TENT: 2 crossings at s=0.30769/156.280 deg and s=0.69231/78.690 deg; SMOOTH cos(60 th)
// control: 0) is run HERE, in-process, before a single mesh facet is scanned.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, IN THE SOURCE, BEFORE ANY RESULT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  R1  RE-DERIVATION. Rebuilding S112's funnel from the STL must reproduce 19,582 / 13,092 / 5,174 / 3,282
//      pairs and 6,193 facets / 69.826 mm2, and the clustering criterion must reproduce 1,537 / 15.8233
//      mm2. Any deviation is REPORTED AS THE FINDING and every downstream number is re-quoted against MY
//      count, never S113's.
//  R2  STABILITY. The 1,537 is a function of three arbitrary constants (lattice order k, inset, minority
//      floor). Sweep all three. If the count moves by more than 2x across k in {8,12,16,24} at fixed
//      inset, the set is an artefact of the lattice and cannot be a target.
//  R3  INDEPENDENCE. A GEOMETRIC interior-straddle test (a C0 crease crossing the facet boundary at two
//      points, both further than the driver's 1.5 um vertex floor from any vertex) is run on the same
//      facets. Cross-tabulated against the clustering test. Agreement is reported as a 2x2 table, not a
//      rate.
//  R4  OPERATOR. The conform split is re-priced ON THIS SUBSET ONLY, with TWO cost-matched placebo arms
//      (midpoint of the same edges; seeded-random s on the same edges). Same child count, same topology,
//      same analytic snap, different location.
//      *** KILL LINE: the operator must deliver BOTH (a) R_op = base/op area-weighted-mean normDeg >= 5.0x
//      — a FLOOR, so that a 2x advantage over a placebo that does nothing cannot pass — AND (b) advantage
//      R_op / max(R_placebo) >= 2.0x. If either fails, the class is CLOSED and this file says so. ***
//      FLOORS (a one-sided bar is vacuous): child area conserved to <= 0.5% per parent; no NaN normDeg;
//      children strictly more numerous than parents where split; both placebo arms must produce the SAME
//      number of children as the operator or the comparison is VOID.
//
// EVERY population number in this file is COUNT + AREA-share + MAX together. Never a bare count.
//
// Usage: bash research/tools/run-s114-interior.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, fdNormalsCentral, locateTurnAdaptive, type NormalSampler } from '../bridge/orientRuler';
import { aspect3 } from '../bridge/_shapeGuard';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114I_STYLE ?? 'GothicArches';
const STL = process.env.PF_S114I_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S114I_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/s114interior';
const STAGES = process.env.PF_S114I_STAGES ?? '012345';

const DIMS: StyleDims = { H: envF('PF_S114I_H', 120), Rb: envF('PF_S114I_RB', 40), Rt: envF('PF_S114I_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

// ── S112 funnel constants, verbatim from s113StraddleDump.ts ──
const HI_DEG = envF('PF_S114I_HI_DEG', 45);
const K_FUNNEL = Math.round(envF('PF_S114I_KF', 8));
const INSET_LO = envF('PF_S114I_INSET_LO', 0);
const INSET_HI = envF('PF_S114I_INSET_HI', 0.05);
const CURTAIN_RATIO = envF('PF_S114I_CURTAIN', 8);
const DROP_CUT = envF('PF_S114I_DROP', 0.25);
// ── S113 Part-C interior-straddle constants, verbatim from s113opOracleC.ts ──
const K_LAT = Math.round(envF('PF_S114I_KLAT', 12));
const INSET_INT = envF('PF_S114I_INSET_INT', 0.1);
const SEP_CUT = envF('PF_S114I_SEP', 45);
const MINOR_CUT = envF('PF_S114I_MINOR', 0.05);
// ── crossing scanner ──
const SCAN_N = Math.round(envF('PF_S114I_SCAN_N', 192));
const GAP_DEG = envF('PF_S114I_GAP', 2);
const CREASE_BAR = envF('PF_S114I_CREASE_BAR', 15);
const REF_ITERS = Math.round(envF('PF_S114I_REFIT', 16));
// ── driver bars ──
const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
const SHAPE_AR = envF('PF_CB_SHAPE_AR', 50);
// ── operator kill line ──
const KILL_FLOOR = envF('PF_S114I_KILL_FLOOR', 5.0);
const KILL_ADV = envF('PF_S114I_KILL_ADV', 2.0);

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
const mn = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b < a ? b : a), Infinity);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsMain = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== S114-INTERIOR — CHARACTERISE S113\'s 1,537 INTERIOR STRADDLERS =====');
log(`style ${STYLE}  tag ${TAG}  stages ${STAGES}`);
log(`funnel: dih>${HI_DEG} graphRatio<=${CURTAIN_RATIO} drop>=${DROP_CUT} normHi>10 (k=${K_FUNNEL}, insets ${INSET_LO}/${INSET_HI}, WINDING)`);
log(`interior test: 2-means on order-${K_LAT} lattice, inset ${INSET_INT}, sep>=${SEP_CUT} deg, minority>=${MINOR_CUT}`);
log(`crossing scanner: N=${SCAN_N} gap ${GAP_DEG} deg, refine ${REF_ITERS} rounds, crease bar ${CREASE_BAR} deg, vertex floor ${FLOOR_MM} mm`);
log(`KILL LINE (R4): R_op >= ${KILL_FLOOR.toFixed(1)}x AND R_op/R_placebo >= ${KILL_ADV.toFixed(1)}x`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CROSSING SCANNER — a dense normal scan with a BRACKET-TIED step, refined by the FIXED locator.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Crossing { s: number; turnDeg: number }
const angAt = (p: Float64Array, po: number, r: Float64Array, ro: number): number => {
  let d = p[po] * r[ro] + p[po + 1] * r[ro + 1] + p[po + 2] * r[ro + 2];
  d = d > 1 ? 1 : d < -1 ? -1 : d;
  return Math.acos(d);
};
const scanBuf = new Float64Array(3 * (SCAN_N + 1));
const scanTurn = new Float64Array(SCAN_N);
/**
 * Every C0 crease crossing of the (theta,z) segment, as a parameter s in [0,1] and the REFINED turn.
 * The scan step is tied to the cell width (a fixed h smears a crease over its own window), so a smooth
 * segment returns nothing at all — that is what the F12 fixture pins.
 */
function scanSegment(th0: number, z0: number, th1: number, z1: number, rRef: number): Crossing[] {
  const lenMm = Math.hypot(rRef * (th1 - th0), z1 - z0);
  if (!(lenMm > 0)) return [];
  const h = Math.max(1e-9, lenMm / (4 * SCAN_N));
  const ns = fdNormalsCentral(rA, H, h, h);
  for (let i = 0; i <= SCAN_N; i += 1) {
    const t = i / SCAN_N;
    ns(th0 + (th1 - th0) * t, z0 + (z1 - z0) * t, scratch);
    scanBuf[i * 3] = scratch[0]; scanBuf[i * 3 + 1] = scratch[1]; scanBuf[i * 3 + 2] = scratch[2];
  }
  for (let i = 0; i < SCAN_N; i += 1) scanTurn[i] = angAt(scanBuf, i * 3, scanBuf, (i + 1) * 3) * DEG;
  const out: Crossing[] = [];
  let i = 0;
  while (i < SCAN_N) {
    if (!(scanTurn[i] >= GAP_DEG)) { i += 1; continue; }
    let j = i;
    while (j + 1 < SCAN_N && scanTurn[j + 1] >= GAP_DEG) j += 1;
    const lo = Math.max(0, (i - 1) / SCAN_N);
    const hi = Math.min(1, (j + 2) / SCAN_N);
    const lt = locateTurnAdaptive(rA, H,
      th0 + (th1 - th0) * lo, z0 + (z1 - z0) * lo,
      th0 + (th1 - th0) * hi, z0 + (z1 - z0) * hi, rRef, REF_ITERS);
    out.push({ s: lo + (hi - lo) * lt.s, turnDeg: lt.turn * DEG });
    i = j + 1;
  }
  return out;
}

// ── SELF-TEST, in-process, before any mesh facet is touched. Same closed forms S113-A used. ──
if (STAGES.includes('0')) {
  log('── SELF-TEST of the crossing scanner on closed forms (must be TWO-SIDED) ──');
  // A piecewise-linear tent with TWO features of KNOWN closed-form turn, and they are DIFFERENT sizes so a
  // symmetric-only search (the defect that killed the bisection, fixture F11) cannot pass:
  //   SYMMETRIC crest at th=0.40, slope +40 -> -40 mm/rad on r=56       => turn 2*atan(40/56) deg
  //   ASYMMETRIC clamp at th=0.70, slope -40 -> 0     on r=44           => turn   atan(40/44) deg
  const rTent = (th: number, _z: number): number => {
    const t = canonTheta(th);
    if (t < 0.4) return 40 + 40 * t;
    if (t < 0.7) return 56 - 40 * (t - 0.4);
    return 44;
  };
  const rSmooth = (th: number, _z: number): number => 40 + 2 * Math.cos(60 * canonTheta(th));
  const crestExp = 2 * Math.atan(40 / 56) * DEG;
  const clampExp = Math.atan(40 / 44) * DEG;
  // scanSegment closes over the module-level rA, so run the fixtures through a local clone of its body.
  const scanWith = (R: (th: number, z: number) => number, th0: number, th1: number): Crossing[] => {
    const rRef = 40;
    const lenMm = rRef * (th1 - th0);
    const h = Math.max(1e-9, lenMm / (4 * SCAN_N));
    const ns = fdNormalsCentral(R, H, h, h);
    const nn = new Float64Array(3 * (SCAN_N + 1));
    const tt = new Float64Array(SCAN_N);
    const sc = new Float64Array(12);
    for (let i = 0; i <= SCAN_N; i += 1) {
      ns(th0 + (th1 - th0) * (i / SCAN_N), 60, sc);
      /* z is held at 60 mm: both fixtures are functions of theta alone. */
      nn[i * 3] = sc[0]; nn[i * 3 + 1] = sc[1]; nn[i * 3 + 2] = sc[2];
    }
    for (let i = 0; i < SCAN_N; i += 1) tt[i] = angAt(nn, i * 3, nn, (i + 1) * 3) * DEG;
    const out: Crossing[] = [];
    let i = 0;
    while (i < SCAN_N) {
      if (!(tt[i] >= GAP_DEG)) { i += 1; continue; }
      let j = i;
      while (j + 1 < SCAN_N && tt[j + 1] >= GAP_DEG) j += 1;
      const lo = Math.max(0, (i - 1) / SCAN_N); const hi = Math.min(1, (j + 2) / SCAN_N);
      const lt = locateTurnAdaptive(R, H, th0 + (th1 - th0) * lo, 60, th0 + (th1 - th0) * hi, 60, rRef, REF_ITERS);
      out.push({ s: lo + (hi - lo) * lt.s, turnDeg: lt.turn * DEG });
      i = j + 1;
    }
    return out;
  };
  const TH0 = 0.05; const TH1 = 1.25;
  const thOf = (s: number): number => TH0 + (TH1 - TH0) * s;
  const tentAll = scanWith(rTent, TH0, TH1);
  const tent = tentAll.filter((c) => c.turnDeg >= CREASE_BAR);
  const smoothAll = scanWith(rSmooth, TH0, TH1);
  const smooth = smoothAll.filter((c) => c.turnDeg >= CREASE_BAR);
  log(`  TENT expects crest th=0.400 turn ${crestExp.toFixed(3)} deg and ASYMMETRIC clamp th=0.700 turn ${clampExp.toFixed(3)} deg`);
  log(`  TENT got ${tent.length} over the ${CREASE_BAR}-deg bar (${tentAll.length} brackets): ${tent.map((c) => `th=${thOf(c.s).toFixed(5)} turn=${c.turnDeg.toFixed(3)}`).join(' | ')}`);
  log(`  SMOOTH cos(60 th): its normal genuinely turns ${(mx(smoothAll.map((c) => c.turnDeg)) > 0 ? '' : '')}>100 deg here; brackets over the ${GAP_DEG}-deg gap bar ${smoothAll.length}, surviving the ${CREASE_BAR}-deg crease bar ${smooth.length} (must be 0)`);
  const okCount = tent.length === 2;
  const okTh = okCount && Math.abs(thOf(tent[0].s) - 0.4) < 5e-3 && Math.abs(thOf(tent[1].s) - 0.7) < 5e-3;
  const okCrest = okCount && Math.abs(tent[0].turnDeg - crestExp) / crestExp < 0.1;
  const okClamp = okCount && Math.abs(tent[1].turnDeg - clampExp) / clampExp < 0.1;
  const okSmooth = smooth.length === 0;
  const ok = okCount && okTh && okCrest && okClamp && okSmooth;
  log(`  SELF-TEST ${ok ? 'PASS' : '*** FAIL ***'}  (count ${okCount}, location ${okTh}, crest-magnitude ${okCrest}, ASYMMETRIC-clamp-magnitude ${okClamp}, smooth-negative ${okSmooth})`);
  if (!ok) { log('*** SCANNER SELF-TEST FAILED — THE RUN IS VOID. ***'); process.exit(6); }
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
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  ${el()}`);

// ── whole-mesh weld: vertex ids (for degree, canonical edges, connectivity) ──
const vid = new Int32Array(nTri * 3);
let nVert = 0;
{
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const cx: number[] = []; const cy: number[] = []; const cz: number[] = [];
  for (let v = 0; v < nTri * 3; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35);
    h |= 0;
    const b = buckets.get(h);
    let found = -1;
    if (b !== undefined) for (const c of b) if (cx[c] === x && cy[c] === y && cz[c] === z) { found = c; break; }
    if (found < 0) {
      found = nVert; nVert += 1; cx.push(x); cy.push(y); cz.push(z);
      if (b === undefined) buckets.set(h, [found]); else b.push(found);
    }
    vid[v] = found;
  }
}
const vDeg = new Int32Array(nVert);
for (let v = 0; v < nTri * 3; v += 1) vDeg[vid[v]] += 1;
log(`welded ${nVert} vertices; vertex degree p50 ${q(Array.from(vDeg.slice(0, Math.min(nVert, nVert))), 0.5)} MAX ${mx(Array.from(vDeg))}  ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SHARED GEOMETRY
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
/** normDeg of facet f. `orient` is EXPLICIT at every call site — the convention moves maxima a lot. */
function orientOf(f: number, inset: number, k: number, ns: NormalSampler, mode: 'winding' | 'outward'): number {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(ns,
    xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k, inset, orient: mode, scratch }).normDeg;
}
/** normDeg of an ARBITRARY triangle given by 9 coordinates (used for split children). */
function orientOfTri(t: Float64Array, o: number, inset: number, k: number, ns: NormalSampler, mode: 'winding' | 'outward'): number {
  const a = Math.atan2(t[o + 1], t[o]);
  const b = a + dThRaw(a, Math.atan2(t[o + 4], t[o + 3]));
  const c = a + dThRaw(a, Math.atan2(t[o + 7], t[o + 6]));
  return orientOfFacet(ns, t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8],
    a, b, c, { k, inset, orient: mode, scratch }).normDeg;
}
const triArea = (t: Float64Array, o: number): number => {
  const ux = t[o + 3] - t[o]; const uy = t[o + 4] - t[o + 1]; const uz = t[o + 5] - t[o + 2];
  const wx = t[o + 6] - t[o]; const wy = t[o + 7] - t[o + 1]; const wz = t[o + 8] - t[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
const areaOf = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
/** COUNT + AREA-share + MAX, the mandated triple. */
const rep3 = (name: string, fs: number[], denomArea: number, vals: number[]): void => {
  const ar = areaOf(fs);
  log(`  ${name.padEnd(46)} n=${String(fs.length).padStart(6)}  AREA ${ar.toFixed(4).padStart(9)} mm2 = ${((ar / Math.max(1e-12, denomArea)) * 100).toFixed(2).padStart(6)}% of class, ${((ar / meshArea) * 100).toFixed(4)}% of mesh  MAX ${vals.length > 0 ? mx(vals).toFixed(3) : 'n/a'}`);
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1a — REBUILD S112's FUNNEL FROM THE STL (R1). No pinned dump is read anywhere in this file.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface FacCache { nHi: number; nLo: number; gr: number }
const facCache = new Map<number, FacCache>();
const facOf = (f: number): FacCache => {
  const c = facCache.get(f);
  if (c !== undefined) return c;
  const v: FacCache = {
    nHi: orientOf(f, INSET_HI, K_FUNNEL, nsMain, 'winding'),
    nLo: orientOf(f, INSET_LO, K_FUNNEL, nsMain, 'winding'),
    gr: graphRatio(f),
  };
  facCache.set(f, v); return v;
};
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

log('══════════ STAGE 1a — S112/S113 FUNNEL, REBUILT FROM THE STL (R1) ══════════');
const targetSet: number[] = [];
let nHigh = 0; let nWall = 0; let nStrad = 0; let nPairs = 0;
{
  const hiThr = (HI_DEG * Math.PI) / 180;
  const seen = new Set<number>();
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    nHigh += 1;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const a = facOf(f1); const b = facOf(f2);
    if (a.gr > CURTAIN_RATIO || b.gr > CURTAIN_RATIO) continue;
    nWall += 1;
    const normHi = Math.max(a.nHi, b.nHi); const normLo = Math.max(a.nLo, b.nLo);
    const drop = normLo > 1e-9 ? normHi / normLo : 1;
    if (!(drop >= DROP_CUT && normHi > 10)) continue;
    nStrad += 1;
    const p = sharedEndpoints(e); if (p === null) continue;
    const thE = Math.atan2(p[1], p[0]);
    const kEdge = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
    const c1 = centroid(f1); const c2 = centroid(f2);
    const thC = Math.atan2(c1[1], c1[0]);
    const kSeg = locateKinkRaw(rA, thC, c1[2], thC + dThRaw(thC, Math.atan2(c2[1], c2[0])), c2[2], PRED);
    const onEdge = kEdge !== null && !kEdge.jump;
    const onSeg = kSeg !== null && !kSeg.jump;
    if (!onEdge && !onSeg) continue;
    nPairs += 1;
    for (const f of [f1, f2]) if (!seen.has(f)) { seen.add(f); targetSet.push(f); }
  }
}
const targetArea = areaOf(targetSet);
log(`  dihedral > ${HI_DEG} deg                        ${nHigh}   (S108/S112/S113: 19582)`);
log(`  ... AND WALL (graphRatio <= ${CURTAIN_RATIO})            ${nWall}   (S112/S113: 13092)`);
log(`  ... AND STRADDLING (drop>=${DROP_CUT}, normHi>10)  ${nStrad}   (S112/S113: 5174)`);
log(`  ... AND crease-labelled                     ${nPairs}   (S112/S113: 3282)`);
log(`  unique facets ${targetSet.length}  (S113: 6193)   AREA ${targetArea.toFixed(4)} mm2 = ${((targetArea / meshArea) * 100).toFixed(4)}% of mesh  (S113: 69.8258 / 0.1816%)`);
const funnelOK = nHigh === 19582 && nWall === 13092 && nStrad === 5174 && nPairs === 3282 && targetSet.length === 6193;
log(`  >>> R1 funnel ${funnelOK ? 'REPRODUCED EXACTLY' : '*** DEVIATES — every downstream number below is quoted against MY counts ***'}`);
log(`  ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1b — REPRODUCE THE 1,537 (the 2-means interior test), THEN SWEEP ITS THREE CONSTANTS (R2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Samp { n: Float64Array; m: number }
function sampleFacet(f: number, k: number, inset: number, ns: NormalSampler): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3);
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
/** S113-C's twoMeansOn, transcribed verbatim so the criterion is the SAME criterion. */
function twoMeans(n: Float64Array, m: number): { sepDeg: number; minor: number; iA: number; iB: number } {
  if (m < 2) return { sepDeg: 0, minor: 0, iA: 0, iB: 0 };
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
  return { sepDeg: na > 0 && na < m ? angAt(c, 0, c, 3) * DEG : 0, minor: Math.min(na, m - na) / m, iA: i1, iB: i2 };
}
const interiorTest = (f: number, k: number, inset: number): { sepDeg: number; minor: number } => {
  const s = sampleFacet(f, k, inset, nsMain);
  return twoMeans(s.n, s.m);
};

log('══════════ STAGE 1b — THE 1,537, RE-DERIVED, AND ITS THREE CONSTANTS SWEPT (R2) ══════════');
const intFlag = new Map<number, boolean>();
let INT: number[] = [];
{
  const seps: number[] = []; const minors: number[] = [];
  for (const f of targetSet) {
    const r = interiorTest(f, K_LAT, INSET_INT);
    seps.push(r.sepDeg); minors.push(r.minor);
    const isInt = r.sepDeg >= SEP_CUT && r.minor >= MINOR_CUT;
    intFlag.set(f, isInt);
    if (isInt) INT.push(f);
  }
  const intArea = areaOf(INT);
  log(`  CANONICAL (k=${K_LAT}, inset ${INSET_INT}, sep>=${SEP_CUT}, minor>=${MINOR_CUT}):`);
  log(`    COUNT ${INT.length}/${targetSet.length} (${((INT.length / targetSet.length) * 100).toFixed(2)}%)  AREA ${intArea.toFixed(4)} mm2 = ${((intArea / targetArea) * 100).toFixed(2)}% of target = ${((intArea / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`    S113 published: COUNT 1537 (24.82%)  AREA 15.8233 mm2 = 22.66% of target = 0.0411% of mesh`);
  log(`    >>> R1 interior set ${INT.length === 1537 && Math.abs(intArea - 15.8233) < 5e-3 ? 'REPRODUCED EXACTLY' : '*** DEVIATES — see the delta above; MY numbers are used below ***'}`);
  log(`    sep over target: p10 ${q(seps, 0.1).toFixed(2)} p50 ${q(seps, 0.5).toFixed(2)} p90 ${q(seps, 0.9).toFixed(2)} MAX ${mx(seps).toFixed(2)} deg;  minority p50 ${q(minors, 0.5).toFixed(3)} p90 ${q(minors, 0.9).toFixed(3)}`);
  log(`  ${el()}`);
}
if (STAGES.includes('2')) {
  log('');
  log('  ── R2 SWEEP. An option default is a measurement choice: k, inset and the minority floor all swept. ──');
  log('     (COUNT / AREA mm2 / % of mesh, at sep>=45 minor>=0.05 unless stated)');
  const KS = (process.env.PF_S114I_KS ?? '8,12,16,24').split(',').map(Number);
  const INS = (process.env.PF_S114I_INS ?? '0.05,0.08,0.10,0.15,0.20').split(',').map(Number);
  const grid = new Map<string, { n: number; a: number }>();
  for (const kk of KS) {
    const cells: string[] = [];
    for (const ins of INS) {
      const sel: number[] = [];
      for (const f of targetSet) { const r = interiorTest(f, kk, ins); if (r.sepDeg >= SEP_CUT && r.minor >= MINOR_CUT) sel.push(f); }
      const a = areaOf(sel);
      grid.set(`${kk}|${ins}`, { n: sel.length, a });
      cells.push(`${String(sel.length).padStart(5)}/${a.toFixed(2).padStart(6)}`);
    }
    log(`     k=${String(kk).padStart(2)}  inset ${INS.map((i) => i.toFixed(2)).join('    ')}`);
    log(`           ${cells.join('  ')}`);
    log(`     ${el()}`);
  }
  const at = (kk: number, ins: number): { n: number; a: number } => grid.get(`${kk}|${ins}`) ?? { n: 0, a: 0 };
  const kCounts = KS.map((kk) => at(kk, INSET_INT).n);
  const kAreas = KS.map((kk) => at(kk, INSET_INT).a);
  const insCounts = INS.map((ins) => at(K_LAT, ins).n);
  const insAreas = INS.map((ins) => at(K_LAT, ins).a);
  const kSpread = mx(kCounts) / Math.max(1, mn(kCounts));
  log(`     k-SWEEP at inset ${INSET_INT}:     COUNT ${kCounts.join(' -> ')}   AREA ${kAreas.map((a) => a.toFixed(2)).join(' -> ')} mm2   spread ${kSpread.toFixed(2)}x`);
  log(`     inset-SWEEP at k=${K_LAT}:      COUNT ${insCounts.join(' -> ')}   AREA ${insAreas.map((a) => a.toFixed(2)).join(' -> ')} mm2   spread ${(mx(insCounts) / Math.max(1, mn(insCounts))).toFixed(2)}x`);
  log(`     >>> R2 ${kSpread <= 2 ? 'the set is STABLE in the lattice order (<=2x)' : '*** R2 KILL — the set moves more than 2x with the lattice order; it is a LATTICE ARTEFACT ***'}`);
  log('');
  log('     minority floor at k=12 inset 0.10 (sep>=45 fixed):');
  for (const mf of [0.02, 0.05, 0.1, 0.2]) {
    const sel: number[] = [];
    for (const f of targetSet) { const r = interiorTest(f, K_LAT, INSET_INT); if (r.sepDeg >= SEP_CUT && r.minor >= mf) sel.push(f); }
    const a = areaOf(sel);
    log(`       minor >= ${mf.toFixed(2)}:  COUNT ${String(sel.length).padStart(5)}  AREA ${a.toFixed(4).padStart(8)} mm2 = ${((a / meshArea) * 100).toFixed(4)}% of mesh`);
  }
  log(`  ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — THE INDEPENDENT GEOMETRIC TEST (R3) + WHAT THESE FACETS ARE + WHY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
/** A facet's boundary crossings, per edge, in the facet's own (theta,z) coordinates. */
interface FacetScan {
  perEdge: Crossing[][];
  free: Array<{ edge: number; s: number; turnDeg: number; distVertMm: number }>;
  atVertex: number[];            // local vertex indices the crease passes through
  nOverBar: number;
  minDistVertMm: number;
}
const edgeLenMm = (f: number, ei: number): number => {
  const [ath, bth, cth] = th3(f);
  const ths = [ath, bth, cth]; const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  const j = (ei + 1) % 3;
  return Math.hypot(rRefOf(f) * (ths[j] - ths[ei]), zs[j] - zs[ei]);
};
function scanFacet(f: number): FacetScan {
  const [ath, bth, cth] = th3(f);
  const ths = [ath, bth, cth]; const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  const rRef = rRefOf(f);
  const perEdge: Crossing[][] = [];
  const free: FacetScan['free'] = [];
  const atV = new Set<number>();
  let nOver = 0; let minD = Infinity;
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    const cs = scanSegment(ths[ei], zs[ei], ths[j], zs[j], rRef);
    perEdge.push(cs);
    const L = Math.hypot(rRef * (ths[j] - ths[ei]), zs[j] - zs[ei]);
    for (const c of cs) {
      if (!(c.turnDeg >= CREASE_BAR)) continue;
      nOver += 1;
      const dv = Math.min(c.s, 1 - c.s) * L;
      if (dv < minD) minD = dv;
      if (dv <= FLOOR_MM) atV.add(c.s < 0.5 ? ei : j);
      else free.push({ edge: ei, s: c.s, turnDeg: c.turnDeg, distVertMm: dv });
    }
  }
  return { perEdge, free, atVertex: [...atV], nOverBar: nOver, minDistVertMm: minD };
}
/** (theta,z) -> (u,v) arc-length coordinates for the facet, and back. */
const uvOf = (rRef: number, th: number, z: number): [number, number] => [rRef * th, z];

const scanCache = new Map<number, FacetScan>();
const scanOf = (f: number): FacetScan => {
  const c = scanCache.get(f);
  if (c !== undefined) return c;
  const v = scanFacet(f); scanCache.set(f, v); return v;
};

const CTL = targetSet.filter((f) => intFlag.get(f) !== true);
if (STAGES.includes('3')) {
  log('══════════ STAGE 3 — THE INDEPENDENT GEOMETRIC TEST, AND THE 2x2 (R3) ══════════');
  log('  GEOMETRIC interior straddle := a C0 crease (refined turn >= bar) crosses the facet boundary at');
  log(`  >= 2 points that are BOTH further than the driver's ${(FLOOR_MM * 1000).toFixed(1)} um vertex floor from any vertex, on`);
  log('  DIFFERENT edges — i.e. a chord genuinely cuts the interior and an aligned edge has something to cut.');
  const geoInt: number[] = []; const geoVertThrough: number[] = []; const geoOne: number[] = [];
  const geoNone: number[] = []; const geoAligned: number[] = []; const geoMulti: number[] = [];
  for (const f of targetSet) {
    const s = scanOf(f);
    const nf = s.free.length;
    const edges = new Set(s.free.map((c) => c.edge));
    if (nf >= 2 && edges.size >= 2) { if (nf > 2) geoMulti.push(f); else geoInt.push(f); }
    else if (nf === 1 && s.atVertex.length >= 1) geoVertThrough.push(f);
    else if (nf >= 1) geoOne.push(f);
    else if (s.atVertex.length >= 2) geoAligned.push(f);
    else geoNone.push(f);
  }
  const legal = [...geoInt, ...geoMulti, ...geoVertThrough];
  log('');
  log('  ── GEOMETRIC CLASSIFICATION of all target facets (COUNT + AREA + MAX normDeg(0.05,k=8,outward)) ──');
  const nsOut = nsMain;
  const nd = (fs: number[]): number[] => fs.map((f) => orientOf(f, INSET_HI, K_FUNNEL, nsOut, 'outward'));
  rep3('TWO_EDGE (chord cuts the interior)', geoInt, targetArea, nd(geoInt));
  rep3('MULTI (>2 free crossings)', geoMulti, targetArea, nd(geoMulti));
  rep3('VERTEX_THROUGH (vertex + 1 free)', geoVertThrough, targetArea, nd(geoVertThrough));
  rep3('ONE (a single free crossing)', geoOne, targetArea, nd(geoOne));
  rep3('ALIGNED (crease on an existing edge)', geoAligned, targetArea, nd(geoAligned));
  rep3('NONE (no C0 crease on the boundary)', geoNone, targetArea, nd(geoNone));
  rep3('=> A LEGAL CUT EXISTS (TWO_EDGE+MULTI+VERTEX)', legal, targetArea, nd(legal));
  log(`  ${el()}`);
  log('');
  const legalSet = new Set(legal);
  const cutSet = new Set([...geoInt, ...geoMulti]);
  const a = INT.filter((f) => cutSet.has(f)); const b = INT.filter((f) => !cutSet.has(f));
  const c2 = CTL.filter((f) => cutSet.has(f)); const dd = CTL.filter((f) => !cutSet.has(f));
  log('  ── THE 2x2: clustering test (rows) vs geometric chord test (cols) ──');
  log(`                              GEO chord      GEO no-chord      row total`);
  log(`    CLUSTER interior    n ${String(a.length).padStart(6)}         ${String(b.length).padStart(6)}          ${String(INT.length).padStart(6)}`);
  log(`                     area ${areaOf(a).toFixed(4).padStart(8)}      ${areaOf(b).toFixed(4).padStart(8)}       ${areaOf(INT).toFixed(4).padStart(8)} mm2`);
  log(`    CLUSTER other       n ${String(c2.length).padStart(6)}         ${String(dd.length).padStart(6)}          ${String(CTL.length).padStart(6)}`);
  log(`                     area ${areaOf(c2).toFixed(4).padStart(8)}      ${areaOf(dd).toFixed(4).padStart(8)}       ${areaOf(CTL).toFixed(4).padStart(8)} mm2`);
  const rInt = a.length / Math.max(1, INT.length); const rCtl = c2.length / Math.max(1, CTL.length);
  log(`    chord rate  INTERIOR ${(rInt * 100).toFixed(2)}%  vs  OTHER ${(rCtl * 100).toFixed(2)}%   separation ${(rInt / Math.max(1e-9, rCtl)).toFixed(2)}x by count`);
  const arInt = areaOf(a) / Math.max(1e-12, areaOf(INT)); const arCtl = areaOf(c2) / Math.max(1e-12, areaOf(CTL));
  log(`    chord rate BY AREA   INTERIOR ${(arInt * 100).toFixed(2)}%  vs  OTHER ${(arCtl * 100).toFixed(2)}%   separation ${(arInt / Math.max(1e-9, arCtl)).toFixed(2)}x by area`);
  log(`    legal-cut rate INTERIOR ${((INT.filter((f) => legalSet.has(f)).length / Math.max(1, INT.length)) * 100).toFixed(2)}%  vs OTHER ${((CTL.filter((f) => legalSet.has(f)).length / Math.max(1, CTL.length)) * 100).toFixed(2)}%`);
  log(`  ${el()}`);
  log('');

  // ── WHY do the cluster-interior facets with NO boundary chord look bimodal? Probe the DIAGONAL. ──
  log('  ── DIAGNOSIS of CLUSTER-interior facets with NO boundary chord: is there a C0 crease AT ALL? ──');
  log('     Probe: the segment between the two 2-means EXTREMES inside the footprint (both are interior');
  log('     lattice points at inset 0.1), scanned with the same bracket-tied locator. A C0 crease returns');
  log('     its dihedral; a SMOOTH-but-fast bend returns ~0 because the refined probes close on the locus.');
  {
    const sub = b.slice(0, Math.min(Math.round(envF('PF_S114I_DIAGN', 400)), b.length));
    const turns: number[] = []; const seps: number[] = [];
    let nC0 = 0;
    for (const f of sub) {
      const [ath, bth, cth] = th3(f);
      const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
      const s = sampleFacet(f, K_LAT, INSET_INT, nsMain);
      const tm = twoMeans(s.n, s.m);
      seps.push(tm.sepDeg);
      // recover the lattice coordinates of the two extreme samples
      const sh = 1 - INSET_INT; const sc = INSET_INT / 3;
      const coord = (idx: number): [number, number] => {
        let m = 0;
        for (let i = 0; i <= K_LAT; i += 1) for (let j = 0; i + j <= K_LAT; j += 1) {
          const wa = sh * (i / K_LAT) + sc; const wb = sh * (j / K_LAT) + sc; const wc = 1 - wa - wb;
          const nc = nsMain(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz, scratch);
          for (let qq = 0; qq < nc; qq += 1) { if (m === idx) return [wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz]; m += 1; }
        }
        return [ath, az];
      };
      const pA = coord(tm.iA); const pB = coord(tm.iB);
      const cs = scanSegment(pA[0], pA[1], pB[0], pB[1], rRefOf(f));
      const t = cs.length > 0 ? mx(cs.map((x) => x.turnDeg)) : 0;
      turns.push(t);
      if (t >= CREASE_BAR) nC0 += 1;
    }
    log(`     n=${sub.length} probed.  2-means sep p50 ${q(seps, 0.5).toFixed(2)} MAX ${mx(seps).toFixed(2)} deg`);
    log(`     refined C0 turn on the diagonal: p10 ${q(turns, 0.1).toFixed(4)} p50 ${q(turns, 0.5).toFixed(4)} p90 ${q(turns, 0.9).toFixed(2)} MAX ${mx(turns).toFixed(2)} deg`);
    log(`     carry a REAL C0 crease inside (turn >= ${CREASE_BAR} deg): ${nC0}/${sub.length} = ${((nC0 / Math.max(1, sub.length)) * 100).toFixed(2)}%`);
    log(`     => ${nC0 / Math.max(1, sub.length) < 0.5 ? 'the MAJORITY of them have NO C0 crease inside: the 2-means test fires on a SMOOTH fast bend.'
      : 'the MAJORITY do carry a C0 crease that never reaches the boundary (it enters and leaves through one edge, or terminates inside).'}`);
  }
  log(`  ${el()}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — WHAT ARE THEY: geometry, position, topology; and WHAT DISTINGUISHES THEM
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Geom { area: number; minEdge: number; maxEdge: number; ar: number; minAngDeg: number; z: number; thDeg: number; thMod30: number; maxVdeg: number }
function geomOf(f: number): Geom {
  const p = [
    [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2]],
    [xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5]],
    [xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8]],
  ];
  const e = [0, 1, 2].map((i) => Math.hypot(p[(i + 1) % 3][0] - p[i][0], p[(i + 1) % 3][1] - p[i][1], p[(i + 1) % 3][2] - p[i][2]));
  let minAng = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const a = e[i]; const b = e[(i + 1) % 3]; const c = e[(i + 2) % 3];
    let cs = (a * a + b * b - c * c) / (2 * a * b);
    cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
    minAng = Math.min(minAng, Math.acos(cs) * DEG);
  }
  const [cx, cy, cz] = centroid(f);
  let th = (canonTheta(Math.atan2(cy, cx)) * 180) / Math.PI;
  if (th < 0) th += 360;
  let vd = 0;
  for (let k = 0; k < 3; k += 1) vd = Math.max(vd, vDeg[vid[f * 3 + k]]);
  return {
    area: d.areaMm2[f], minEdge: mn(e), maxEdge: mx(e),
    ar: aspect3(p[0][0], p[0][1], p[0][2], p[1][0], p[1][1], p[1][2], p[2][0], p[2][1], p[2][2]),
    minAngDeg: minAng, z: cz, thDeg: th, thMod30: th % 30, maxVdeg: vd,
  };
}
const cmp = (name: string, ga: number[], gb: number[], f = 3): void => {
  log(`    ${name.padEnd(24)} INT  p10 ${q(ga, 0.1).toFixed(f).padStart(9)} p50 ${q(ga, 0.5).toFixed(f).padStart(9)} p90 ${q(ga, 0.9).toFixed(f).padStart(9)} MAX ${mx(ga).toFixed(f).padStart(10)}`);
  log(`    ${''.padEnd(24)} CTL  p10 ${q(gb, 0.1).toFixed(f).padStart(9)} p50 ${q(gb, 0.5).toFixed(f).padStart(9)} p90 ${q(gb, 0.9).toFixed(f).padStart(9)} MAX ${mx(gb).toFixed(f).padStart(10)}   p50 ratio ${(q(ga, 0.5) / Math.max(1e-12, q(gb, 0.5))).toFixed(2)}x`);
};
if (STAGES.includes('4')) {
  log('══════════ STAGE 4 — WHAT THEY ARE (INT) vs THE REST OF THE TARGET CLASS (CTL) ══════════');
  log(`  INT n=${INT.length} area ${areaOf(INT).toFixed(4)} mm2    CTL n=${CTL.length} area ${areaOf(CTL).toFixed(4)} mm2`);
  const gi = INT.map(geomOf); const gc = CTL.map(geomOf);
  log('  ── GEOMETRY ──');
  cmp('area mm2', gi.map((g) => g.area), gc.map((g) => g.area), 6);
  cmp('min edge mm', gi.map((g) => g.minEdge), gc.map((g) => g.minEdge), 5);
  cmp('max edge mm', gi.map((g) => g.maxEdge), gc.map((g) => g.maxEdge), 5);
  cmp('aspect3 (equi 1.732)', gi.map((g) => g.ar), gc.map((g) => g.ar), 3);
  cmp('min angle deg', gi.map((g) => g.minAngDeg), gc.map((g) => g.minAngDeg), 3);
  cmp('graphRatio', INT.map(graphRatio), CTL.map(graphRatio), 3);
  log(`    over the driver's aspect bar ${SHAPE_AR}: INT ${gi.filter((g) => g.ar > SHAPE_AR).length} (${areaOf(INT.filter((_f, i) => gi[i].ar > SHAPE_AR)).toFixed(4)} mm2)  CTL ${gc.filter((g) => g.ar > SHAPE_AR).length}`);
  log(`    under the driver's edge floor ${FLOOR_MM} mm: INT ${gi.filter((g) => g.minEdge < FLOOR_MM).length}  CTL ${gc.filter((g) => g.minEdge < FLOOR_MM).length}`);
  log('  ── POSITION ──');
  cmp('z mm', gi.map((g) => g.z), gc.map((g) => g.z), 2);
  {
    const binsI = new Array(12).fill(0); const binsC = new Array(12).fill(0);
    const areaI = new Array(12).fill(0); const areaC = new Array(12).fill(0);
    gi.forEach((g, i) => { const b = Math.min(11, Math.floor((g.thMod30 / 30) * 12)); binsI[b] += 1; areaI[b] += g.area; });
    gc.forEach((g, i) => { const b = Math.min(11, Math.floor((g.thMod30 / 30) * 12)); binsC[b] += 1; areaC[b] += g.area; });
    log(`    theta mod 30 deg (the 12-fold fundamental domain), 12 bins:`);
    log(`      INT count ${binsI.join(' ')}`);
    log(`      INT area  ${areaI.map((x) => x.toFixed(2)).join(' ')}`);
    log(`      CTL count ${binsC.join(' ')}`);
    const topI = binsI.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).slice(0, 4);
    log(`      INT top-4 bins hold ${((topI.reduce((s, x) => s + x[0], 0) / Math.max(1, INT.length)) * 100).toFixed(1)}% of the count  (S113 measured 82% for the whole class)`);
    const zH = new Array(12).fill(0);
    gi.forEach((g) => { zH[Math.min(11, Math.max(0, Math.floor((g.z / H) * 12)))] += g.area; });
    log(`      INT area by z decile-ish (12 bands of ${(H / 12).toFixed(0)} mm): ${zH.map((x) => x.toFixed(2)).join(' ')}`);
  }
  log('  ── LOCAL TOPOLOGY ──');
  cmp('max vertex degree', gi.map((g) => g.maxVdeg), gc.map((g) => g.maxVdeg), 1);
  {
    const HUB = Math.round(envF('PF_S114I_HUB', 12));
    const hi = INT.filter((f, i) => gi[i].maxVdeg >= HUB); const hc = CTL.filter((f, i) => gc[i].maxVdeg >= HUB);
    log(`    touching a HUB vertex (degree >= ${HUB}): INT ${hi.length}/${INT.length} = ${((hi.length / Math.max(1, INT.length)) * 100).toFixed(2)}% (${areaOf(hi).toFixed(4)} mm2)   CTL ${hc.length}/${CTL.length} = ${((hc.length / Math.max(1, CTL.length)) * 100).toFixed(2)}%`);
    // connectivity of INT among themselves, through shared welded edges
    const SHIFT = 67_108_864;
    const inInt = new Set(INT);
    const eMap = new Map<number, number[]>();
    for (const f of INT) {
      const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        const k = (u < v ? u : v) * SHIFT + (u < v ? v : u);
        const arr = eMap.get(k); if (arr === undefined) eMap.set(k, [f]); else arr.push(f);
      }
    }
    const parent = new Map<number, number>();
    const find = (x: number): number => { let r = x; while ((parent.get(r) ?? r) !== r) r = parent.get(r) as number; let c = x; while ((parent.get(c) ?? c) !== c) { const n = parent.get(c) as number; parent.set(c, r); c = n; } return r; };
    const uni = (x: number, y: number): void => { const rx = find(x); const ry = find(y); if (rx !== ry) parent.set(rx, ry); };
    for (const f of INT) parent.set(f, f);
    for (const fs of eMap.values()) for (let i = 1; i < fs.length; i += 1) uni(fs[0], fs[i]);
    const comp = new Map<number, number[]>();
    for (const f of INT) { const r = find(f); const arr = comp.get(r); if (arr === undefined) comp.set(r, [f]); else arr.push(f); }
    const sizes = [...comp.values()].map((v) => v.length).sort((x, y) => y - x);
    const singletons = sizes.filter((s) => s === 1).length;
    log(`    connected components of INT (through shared mesh edges): ${sizes.length}   sizes p50 ${q(sizes, 0.5)} p90 ${q(sizes, 0.9)} MAX ${sizes[0]}`);
    log(`      ISOLATED (component of 1): ${singletons} = ${((singletons / Math.max(1, INT.length)) * 100).toFixed(1)}% of INT facets;  largest 5 components ${sizes.slice(0, 5).join(', ')}`);
    // how many INT facets have an INT neighbour vs a CTL neighbour vs an out-of-class neighbour
    let withIntNb = 0;
    for (const f of INT) {
      const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
      let has = false;
      for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
        const k = (u < v ? u : v) * SHIFT + (u < v ? v : u);
        const arr = eMap.get(k); if (arr !== undefined && arr.some((g) => g !== f && inInt.has(g))) has = true;
      }
      if (has) withIntNb += 1;
    }
    log(`      INT facets with at least one INT edge-neighbour: ${withIntNb} = ${((withIntNb / Math.max(1, INT.length)) * 100).toFixed(1)}%`);
  }
  log(`  ${el()}`);
  log('');

  // ── WHY: the distinguishing feature, MEASURED ──
  log('  ── WHY DID THE CREASE END UP INSIDE? candidate mechanisms, each measured on INT vs CTL ──');
  {
    const dvI: number[] = []; const dvC: number[] = [];
    const nFreeI: number[] = []; const nFreeC: number[] = [];
    const nVI: number[] = []; const nVC: number[] = [];
    for (const f of INT) { const s = scanOf(f); dvI.push(Number.isFinite(s.minDistVertMm) ? s.minDistVertMm * 1000 : NaN); nFreeI.push(s.free.length); nVI.push(s.atVertex.length); }
    for (const f of CTL) { const s = scanOf(f); dvC.push(Number.isFinite(s.minDistVertMm) ? s.minDistVertMm * 1000 : NaN); nFreeC.push(s.free.length); nVC.push(s.atVertex.length); }
    log('    (a) DISTANCE FROM THE NEAREST BOUNDARY CREASE CROSSING TO THE NEAREST VERTEX, um');
    cmp('crossing->vertex um', dvI.filter(Number.isFinite), dvC.filter(Number.isFinite), 3);
    const onVI = INT.filter((f) => scanOf(f).atVertex.length > 0); const onVC = CTL.filter((f) => scanOf(f).atVertex.length > 0);
    log(`        crease passes through >= 1 VERTEX: INT ${onVI.length}/${INT.length} = ${((onVI.length / Math.max(1, INT.length)) * 100).toFixed(2)}% (${((areaOf(onVI) / Math.max(1e-12, areaOf(INT))) * 100).toFixed(2)}% by area)`);
    log(`                                            CTL ${onVC.length}/${CTL.length} = ${((onVC.length / Math.max(1, CTL.length)) * 100).toFixed(2)}% (${((areaOf(onVC) / Math.max(1e-12, areaOf(CTL))) * 100).toFixed(2)}% by area)   [S113 wider class: 56.7%]`);
    log('    (b) NUMBER OF BOUNDARY CROSSINGS (free = not within the vertex floor)');
    for (const nn of [0, 1, 2, 3]) {
      const si = INT.filter((f) => (nn === 3 ? scanOf(f).free.length >= 3 : scanOf(f).free.length === nn));
      const sc2 = CTL.filter((f) => (nn === 3 ? scanOf(f).free.length >= 3 : scanOf(f).free.length === nn));
      log(`        free crossings ${nn === 3 ? '>=3' : `= ${nn}`}:  INT ${String(si.length).padStart(5)} (${((areaOf(si) / Math.max(1e-12, areaOf(INT))) * 100).toFixed(2).padStart(6)}% area)   CTL ${String(sc2.length).padStart(5)} (${((areaOf(sc2) / Math.max(1e-12, areaOf(CTL))) * 100).toFixed(2).padStart(6)}% area)`);
    }
    void nFreeI; void nFreeC; void nVI; void nVC;
  }
  // ── (c) LOCUS CURVATURE INSIDE THE FACET: a 3-POINT probe, never a 2-point one ──
  log('    (c) LOCUS CURVATURE INSIDE THE FOOTPRINT — 3-point probe (entry, mid-perpendicular, exit).');
  log('        A 2-point probe of a curved locus under-reads; the perpendicular probe at the chord midpoint');
  log('        is CLIPPED TO THE TRIANGLE so the sagitta is measured strictly inside the facet.');
  {
    const sag: number[] = []; const turnLoc: number[] = []; const chord: number[] = [];
    const sagC: number[] = []; const turnLocC: number[] = [];
    const doSet = (fs: number[], outSag: number[], outTurn: number[], outChord: number[] | null, cap: number): void => {
      let done = 0;
      for (const f of fs) {
        if (done >= cap) break;
        const s = scanOf(f);
        if (s.free.length !== 2 || s.free[0].edge === s.free[1].edge) continue;
        const [ath, bth, cth] = th3(f);
        const ths = [ath, bth, cth]; const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
        const rRef = rRefOf(f);
        const pt = (cr: { edge: number; s: number }): [number, number] => {
          const i = cr.edge; const j = (i + 1) % 3;
          return uvOf(rRef, ths[i] + (ths[j] - ths[i]) * cr.s, zs[i] + (zs[j] - zs[i]) * cr.s);
        };
        const P1 = pt(s.free[0]); const P2 = pt(s.free[1]);
        const L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
        if (!(L > 1e-9)) continue;
        const dx = (P2[0] - P1[0]) / L; const dy = (P2[1] - P1[1]) / L;
        const px = -dy; const py = dx;
        const Mx = 0.5 * (P1[0] + P2[0]); const My = 0.5 * (P1[1] + P2[1]);
        // clip the perpendicular ray to the parameter triangle
        const V = [uvOf(rRef, ths[0], zs[0]), uvOf(rRef, ths[1], zs[1]), uvOf(rRef, ths[2], zs[2])];
        let tPos = Infinity; let tNeg = -Infinity;
        for (let i = 0; i < 3; i += 1) {
          const A = V[i]; const B = V[(i + 1) % 3];
          const ex = B[0] - A[0]; const ey = B[1] - A[1];
          const det = px * (-ex) - py * (-ey);
          if (Math.abs(det) < 1e-15) continue;
          const rx = A[0] - Mx; const ry = A[1] - My;
          const t = (rx * (-ey) - ry * (-ex)) / det;
          const u = (px * ry - py * rx) / det;
          if (u < -1e-9 || u > 1 + 1e-9) continue;
          if (t > 0 && t < tPos) tPos = t;
          if (t < 0 && t > tNeg) tNeg = t;
        }
        if (!Number.isFinite(tPos) || !Number.isFinite(tNeg)) continue;
        const w0 = 0.95 * tNeg; const w1 = 0.95 * tPos;
        const th0 = (Mx + px * w0) / rRef; const zz0 = My + py * w0;
        const th1 = (Mx + px * w1) / rRef; const zz1 = My + py * w1;
        const cs = scanSegment(th0, zz0, th1, zz1, rRef).filter((c) => c.turnDeg >= CREASE_BAR);
        if (cs.length === 0) continue;
        // the crossing closest to the chord midpoint
        let bestOff = Infinity;
        for (const c of cs) {
          const t = w0 + (w1 - w0) * c.s;
          if (Math.abs(t) < Math.abs(bestOff)) bestOff = t;
        }
        outSag.push(Math.abs(bestOff) * 1000);
        const Qx = Mx + px * bestOff; const Qy = My + py * bestOff;
        const a1x = Qx - P1[0]; const a1y = Qy - P1[1];
        const a2x = P2[0] - Qx; const a2y = P2[1] - Qy;
        const l1 = Math.hypot(a1x, a1y) || 1; const l2 = Math.hypot(a2x, a2y) || 1;
        let cd = (a1x * a2x + a1y * a2y) / (l1 * l2);
        cd = cd > 1 ? 1 : cd < -1 ? -1 : cd;
        outTurn.push(Math.acos(cd) * DEG);
        if (outChord !== null) outChord.push(L);
        done += 1;
      }
    };
    const CAP = Math.round(envF('PF_S114I_SAGCAP', 400));
    doSet(INT, sag, turnLoc, chord, CAP);
    doSet(CTL, sagC, turnLocC, null, CAP);
    log(`        INT n=${sag.length} probed (of ${INT.length}; only 2-free-crossing facets are probeable)`);
    if (sag.length > 0) {
      log(`          chord length mm     p10 ${q(chord, 0.1).toFixed(5)} p50 ${q(chord, 0.5).toFixed(5)} p90 ${q(chord, 0.9).toFixed(5)} MAX ${mx(chord).toFixed(5)}`);
      log(`          SAGITTA um          p10 ${q(sag, 0.1).toFixed(3)} p50 ${q(sag, 0.5).toFixed(3)} p90 ${q(sag, 0.9).toFixed(3)} MAX ${mx(sag).toFixed(3)}`);
      log(`          LOCUS TURN deg      p10 ${q(turnLoc, 0.1).toFixed(3)} p50 ${q(turnLoc, 0.5).toFixed(3)} p90 ${q(turnLoc, 0.9).toFixed(3)} MAX ${mx(turnLoc).toFixed(3)}`);
    }
    log(`        CTL n=${sagC.length} probed`);
    if (sagC.length > 0) {
      log(`          SAGITTA um          p10 ${q(sagC, 0.1).toFixed(3)} p50 ${q(sagC, 0.5).toFixed(3)} p90 ${q(sagC, 0.9).toFixed(3)} MAX ${mx(sagC).toFixed(3)}`);
      log(`          LOCUS TURN deg      p10 ${q(turnLocC, 0.1).toFixed(3)} p50 ${q(turnLocC, 0.5).toFixed(3)} p90 ${q(turnLocC, 0.9).toFixed(3)} MAX ${mx(turnLocC).toFixed(3)}`);
    }
  }
  log(`  ${el()}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — THE FIDELITY PRIZE, AND THE OPERATOR WITH TWO COST-MATCHED PLACEBO ARMS (R4)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const wtdMean = (fs: number[], v: (f: number) => number): number => {
  let s = 0; let a = 0;
  for (const f of fs) { const w = d.areaMm2[f]; s += w * v(f); a += w; }
  return a > 0 ? s / a : NaN;
};
if (STAGES.includes('5')) {
  log('══════════ STAGE 5 — THE FIDELITY PRIZE AND THE OPERATOR (R4) ══════════');
  log('  Convention stated: normDeg k=8, OUTWARD sign (the convention S113-C quoted), inset SWEPT.');
  for (const ins of [0, 0.02, 0.05, 0.1]) {
    const vi = INT.map((f) => orientOf(f, ins, K_FUNNEL, nsMain, 'outward'));
    const over45 = INT.filter((_f, i) => vi[i] > 45);
    const over5 = INT.filter((_f, i) => vi[i] > 5);
    log(`    inset ${ins.toFixed(2)}  area-wtd mean ${wtdMean(INT, (f) => orientOf(f, ins, K_FUNNEL, nsMain, 'outward')).toFixed(3).padStart(8)} deg   p50 ${q(vi, 0.5).toFixed(3).padStart(8)}  MAX ${mx(vi).toFixed(3).padStart(8)}   over 45 deg: n=${String(over45.length).padStart(5)} ${areaOf(over45).toFixed(4).padStart(8)} mm2 (${((areaOf(over45) / Math.max(1e-12, areaOf(INT))) * 100).toFixed(2)}%)   over 5 deg: n=${String(over5.length).padStart(5)} ${areaOf(over5).toFixed(4).padStart(8)} mm2`);
  }
  const windMean = wtdMean(INT, (f) => orientOf(f, INSET_HI, K_FUNNEL, nsMain, 'winding'));
  log(`    WINDING convention at inset ${INSET_HI} for comparison: area-wtd mean ${windMean.toFixed(3)} deg`);
  log(`  THE EMPIRICAL CEILING (S113-C stage 2, the operator's own output already in this mesh):`);
  log('    a facet already aligned to these creases reads normDeg(inset 0.1) p50 1.9487 / MAX 4.994 deg.');
  log(`  ${el()}`);
  log('');

  // ── the operator ──
  log('  ── THE CONFORM SPLIT ON THIS SUBSET ONLY, WITH TWO COST-MATCHED PLACEBOS ──');
  log('     ARM OP      : cut at the two located crease crossings, snapped to rA.');
  log('     ARM MID     : same edges, same point count, s = 0.5, snapped to rA.  (cost-matched placebo)');
  log('     ARM RAND    : same edges, same point count, seeded s in [0.15,0.85], snapped to rA.');
  log('     Scored LOCALLY per parent (children of that parent only). The whole-mesh cascade/T-junction');
  log('     cost is NOT modelled here and is reported separately as a neighbour count.');
  const child = new Float64Array(9 * 8);
  const snap = (th: number, z: number, out: Float64Array, o: number): void => {
    const tc = canonTheta(th); const r = rA(tc, z);
    out[o] = r * Math.cos(tc); out[o + 1] = r * Math.sin(tc); out[o + 2] = z;
  };
  interface ArmOut { nParents: number; nChildren: number; areaSum: number; wtd: number; maxDeg: number; over45Area: number; over5Area: number; minEdge: number; maxAr: number; nNaN: number }
  const newArm = (): ArmOut => ({ nParents: 0, nChildren: 0, areaSum: 0, wtd: 0, maxDeg: -Infinity, over45Area: 0, over5Area: 0, minEdge: Infinity, maxAr: 0, nNaN: 0 });
  const accum = (arm: ArmOut, t: Float64Array, nCh: number): void => {
    for (let ci = 0; ci < nCh; ci += 1) {
      const o = ci * 9;
      const a = triArea(t, o);
      const nd2 = orientOfTri(t, o, INSET_HI, K_FUNNEL, nsMain, 'outward');
      if (!Number.isFinite(nd2)) { arm.nNaN += 1; continue; }
      arm.nChildren += 1; arm.areaSum += a; arm.wtd += a * nd2;
      if (nd2 > arm.maxDeg) arm.maxDeg = nd2;
      if (nd2 > 45) arm.over45Area += a;
      if (nd2 > 5) arm.over5Area += a;
      const e0 = Math.hypot(t[o + 3] - t[o], t[o + 4] - t[o + 1], t[o + 5] - t[o + 2]);
      const e1 = Math.hypot(t[o + 6] - t[o + 3], t[o + 7] - t[o + 4], t[o + 8] - t[o + 5]);
      const e2 = Math.hypot(t[o] - t[o + 6], t[o + 1] - t[o + 7], t[o + 2] - t[o + 8]);
      arm.minEdge = Math.min(arm.minEdge, e0, e1, e2);
      const ar = aspect3(t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8]);
      if (Number.isFinite(ar) && ar > arm.maxAr) arm.maxAr = ar;
    }
  };
  /** Build the children of a corner-cut / vertex-through split; returns child count (triangles in `child`). */
  const buildSplit = (f: number, cuts: Array<{ edge: number; s: number }>, vThrough: number[]): number => {
    const [ath, bth, cth] = th3(f);
    const ths = [ath, bth, cth]; const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
    const V: number[][] = [
      [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2]],
      [xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5]],
      [xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8]],
    ];
    const P = new Float64Array(6);
    for (let i = 0; i < cuts.length && i < 2; i += 1) {
      const e0 = cuts[i].edge; const e1 = (e0 + 1) % 3; const s = cuts[i].s;
      snap(ths[e0] + (ths[e1] - ths[e0]) * s, zs[e0] + (zs[e1] - zs[e0]) * s, P, i * 3);
    }
    const put = (o: number, A: number[] | Float64Array, ao: number, B: number[] | Float64Array, bo: number, C: number[] | Float64Array, co: number): void => {
      child[o] = A[ao]; child[o + 1] = A[ao + 1]; child[o + 2] = A[ao + 2];
      child[o + 3] = B[bo]; child[o + 4] = B[bo + 1]; child[o + 5] = B[bo + 2];
      child[o + 6] = C[co]; child[o + 7] = C[co + 1]; child[o + 8] = C[co + 2];
    };
    if (cuts.length >= 2) {
      const eA = cuts[0].edge; const eB = cuts[1].edge;
      // shared vertex of the two edges (edge i joins vertices i and i+1)
      const sA = new Set([eA, (eA + 1) % 3]); const sB = new Set([eB, (eB + 1) % 3]);
      const shared = [...sA].filter((x) => sB.has(x));
      if (shared.length !== 1) return 0;
      const vs = shared[0];
      const vA = [...sA].filter((x) => x !== vs)[0];
      const vB = [...sB].filter((x) => x !== vs)[0];
      put(0, P, 0, V[vs], 0, P, 3);
      put(9, V[vA], 0, P, 0, P, 3);
      put(18, V[vA], 0, P, 3, V[vB], 0);
      return 3;
    }
    if (cuts.length === 1 && vThrough.length >= 1) {
      const e0 = cuts[0].edge; const e1 = (e0 + 1) % 3;
      const opp = [0, 1, 2].filter((x) => x !== e0 && x !== e1)[0];
      const vt = vThrough.includes(opp) ? opp : -1;
      if (vt < 0) return 0;
      put(0, V[vt], 0, V[e0], 0, P, 0);
      put(9, V[vt], 0, P, 0, V[e1], 0);
      return 2;
    }
    return 0;
  };
  const armOP = newArm(); const armMID = newArm(); const armRND = newArm(); const armBASE = newArm();
  let seed = 987654321;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let nSplit = 0; let splitPts = 0; let nCascadeNb = 0;
  const splitParents: number[] = [];
  const SHIFT2 = 67_108_864;
  const edgeCount = new Map<number, number>();
  for (let f = 0; f < nTri; f += 1) {
    const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const k = (u < v ? u : v) * SHIFT2 + (u < v ? v : u);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  }
  for (const f of INT) {
    const s = scanOf(f);
    const free = s.free.slice().sort((x, y) => y.turnDeg - x.turnDeg);
    let cuts: Array<{ edge: number; s: number }> = [];
    let vT: number[] = [];
    if (free.length >= 2) {
      const first = free[0];
      const second = free.find((c) => c.edge !== first.edge);
      if (second !== undefined) cuts = [{ edge: first.edge, s: first.s }, { edge: second.edge, s: second.s }];
    }
    if (cuts.length === 0 && free.length === 1 && s.atVertex.length >= 1) { cuts = [{ edge: free[0].edge, s: free[0].s }]; vT = s.atVertex; }
    if (cuts.length === 0) continue;
    const nCh = buildSplit(f, cuts, vT);
    if (nCh === 0) continue;
    nSplit += 1; splitPts += cuts.length;
    splitParents.push(f);
    accum(armOP, child, nCh);
    // cascade cost: neighbours sharing each cut edge
    for (const c of cuts) {
      const u = vid[f * 3 + c.edge]; const v = vid[f * 3 + ((c.edge + 1) % 3)];
      const k = (u < v ? u : v) * SHIFT2 + (u < v ? v : u);
      nCascadeNb += Math.max(0, (edgeCount.get(k) ?? 1) - 1);
    }
    // baseline: the parent itself
    for (let ci = 0; ci < 1; ci += 1) {
      child[0] = xyz[f * 9]; child[1] = xyz[f * 9 + 1]; child[2] = xyz[f * 9 + 2];
      child[3] = xyz[f * 9 + 3]; child[4] = xyz[f * 9 + 4]; child[5] = xyz[f * 9 + 5];
      child[6] = xyz[f * 9 + 6]; child[7] = xyz[f * 9 + 7]; child[8] = xyz[f * 9 + 8];
    }
    accum(armBASE, child, 1);
    const nM = buildSplit(f, cuts.map((c) => ({ edge: c.edge, s: 0.5 })), vT);
    if (nM === nCh) accum(armMID, child, nM); else armMID.nNaN += 1;
    const nR = buildSplit(f, cuts.map((c) => ({ edge: c.edge, s: 0.15 + 0.7 * rnd() })), vT);
    if (nR === nCh) accum(armRND, child, nR); else armRND.nNaN += 1;
    armOP.nParents += 1; armMID.nParents += 1; armRND.nParents += 1; armBASE.nParents += 1;
  }
  const parentArea = areaOf(splitParents);
  log('');
  log(`     REACH: ${nSplit}/${INT.length} INT facets carry a legal cut = ${((nSplit / Math.max(1, INT.length)) * 100).toFixed(2)}% by count;`);
  log(`            AREA ${parentArea.toFixed(4)} mm2 = ${((parentArea / Math.max(1e-12, areaOf(INT))) * 100).toFixed(2)}% of INT = ${((parentArea / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`            split points ${splitPts};  neighbours that would need cascading (T-junction avoidance): ${nCascadeNb}`);
  const show = (nm: string, a: ArmOut): void => {
    const wm = a.areaSum > 0 ? a.wtd / a.areaSum : NaN;
    log(`     ${nm.padEnd(10)} children ${String(a.nChildren).padStart(5)}  area ${a.areaSum.toFixed(4).padStart(9)} mm2  area-wtd normDeg ${wm.toFixed(4).padStart(9)} deg  MAX ${a.maxDeg.toFixed(3).padStart(9)}  over45 ${a.over45Area.toFixed(4).padStart(8)} mm2  over5 ${a.over5Area.toFixed(4).padStart(8)} mm2  minEdge ${a.minEdge.toExponential(2)}  maxAR ${a.maxAr.toFixed(1)}  NaN ${a.nNaN}`);
  };
  log('');
  show('BASELINE', armBASE); show('OP', armOP); show('MID(plac)', armMID); show('RAND(plac)', armRND);
  const wm = (a: ArmOut): number => (a.areaSum > 0 ? a.wtd / a.areaSum : NaN);
  const rOp = wm(armBASE) / Math.max(1e-12, wm(armOP));
  const rMid = wm(armBASE) / Math.max(1e-12, wm(armMID));
  const rRnd = wm(armBASE) / Math.max(1e-12, wm(armRND));
  const rBestPl = Math.max(rMid, rRnd);
  log('');
  log(`     REDUCTION (baseline area-wtd normDeg / arm):  OP ${rOp.toFixed(3)}x   MID ${rMid.toFixed(3)}x   RAND ${rRnd.toFixed(3)}x`);
  log(`     over-45 AREA:  base ${armBASE.over45Area.toFixed(4)} -> OP ${armOP.over45Area.toFixed(4)} (${(armBASE.over45Area / Math.max(1e-12, armOP.over45Area)).toFixed(3)}x)  MID ${armMID.over45Area.toFixed(4)} (${(armBASE.over45Area / Math.max(1e-12, armMID.over45Area)).toFixed(3)}x)  RAND ${armRND.over45Area.toFixed(4)} (${(armBASE.over45Area / Math.max(1e-12, armRND.over45Area)).toFixed(3)}x)`);
  log(`     MAX normDeg:   base ${armBASE.maxDeg.toFixed(3)} -> OP ${armOP.maxDeg.toFixed(3)}  MID ${armMID.maxDeg.toFixed(3)}  RAND ${armRND.maxDeg.toFixed(3)} deg`);
  log(`     ADVANTAGE over the best placebo: ${(rOp / Math.max(1e-12, rBestPl)).toFixed(3)}x`);
  log('');
  log('     ── FLOORS (a one-sided bar is vacuous) ──');
  const consOP = Math.abs(armOP.areaSum - armBASE.areaSum) / Math.max(1e-12, armBASE.areaSum);
  const consMID = Math.abs(armMID.areaSum - armBASE.areaSum) / Math.max(1e-12, armBASE.areaSum);
  log(`       child area vs parent area: OP ${(consOP * 100).toFixed(4)}%  MID ${(consMID * 100).toFixed(4)}%   (must be <= 0.5%)  ${consOP <= 0.005 && consMID <= 0.005 ? 'PASS' : '*** FAIL ***'}`);
  log(`       cost-matched: OP children ${armOP.nChildren}, MID ${armMID.nChildren}, RAND ${armRND.nChildren}  ${armOP.nChildren === armMID.nChildren && armOP.nChildren === armRND.nChildren ? 'PASS' : '*** NOT COST-MATCHED — comparison VOID ***'}`);
  log(`       NaN normDeg among children: OP ${armOP.nNaN} MID ${armMID.nNaN} RAND ${armRND.nNaN}  ${armOP.nNaN === 0 ? 'PASS' : '*** FAIL ***'}`);
  log(`       children under the driver's edge floor ${FLOOR_MM} mm: OP minEdge ${armOP.minEdge.toExponential(3)}  MID ${armMID.minEdge.toExponential(3)}`);
  log(`       children over the driver's aspect bar ${SHAPE_AR}: OP maxAR ${armOP.maxAr.toFixed(1)}  MID ${armMID.maxAr.toFixed(1)}`);
  log('');
  const passFloor = rOp >= KILL_FLOOR;
  const passAdv = rOp / Math.max(1e-12, rBestPl) >= KILL_ADV;
  const costOK = armOP.nChildren === armMID.nChildren && armOP.nChildren === armRND.nChildren;
  log('     ════ VERDICT against the PRE-REGISTERED R4 KILL LINE ════');
  log(`       (a) R_op = ${rOp.toFixed(3)}x   need >= ${KILL_FLOOR.toFixed(1)}x   ${passFloor ? 'PASS' : 'FAIL'}`);
  log(`       (b) advantage = ${(rOp / Math.max(1e-12, rBestPl)).toFixed(3)}x   need >= ${KILL_ADV.toFixed(1)}x   ${passAdv ? 'PASS' : 'FAIL'}`);
  log(`       cost-match floor ${costOK ? 'PASS' : 'FAIL'}`);
  log(`       ==> ${passFloor && passAdv && costOK
    ? '*** THE OPERATOR SURVIVES ON THIS SUBSET — the first operator win of the campaign, scoped to the reach printed above. ***'
    : '*** KILL LINE FIRED — the conform split is REFUTED on this subset too, and the class is CLOSED for it. ***'}`);
  log(`  ${el()}`);
  writeFileSync(`${OUTDIR}/S114I_${TAG}.summary.json`, `${JSON.stringify({
    style: STYLE, stl: STL, meshFacets: nTri, meshAreaMm2: meshArea,
    funnel: { high: nHigh, wall: nWall, straddling: nStrad, pairs: nPairs, facets: targetSet.length, areaMm2: targetArea },
    interior: { count: INT.length, areaMm2: areaOf(INT), pctMesh: (areaOf(INT) / meshArea) * 100 },
    operator: {
      reachFacets: nSplit, reachAreaMm2: parentArea, splitPoints: splitPts, cascadeNeighbours: nCascadeNb,
      baseWtdDeg: wm(armBASE), opWtdDeg: wm(armOP), midWtdDeg: wm(armMID), rndWtdDeg: wm(armRND),
      rOp, rMid, rRnd, advantage: rOp / Math.max(1e-12, rBestPl),
      maxBase: armBASE.maxDeg, maxOp: armOP.maxDeg, maxMid: armMID.maxDeg,
      over45Base: armBASE.over45Area, over45Op: armOP.over45Area, over45Mid: armMID.over45Area,
      verdict: passFloor && passAdv && costOK ? 'SURVIVES' : 'REFUTED',
    },
  }, null, 2)}\n`);
  log(`  wrote ${OUTDIR}/S114I_${TAG}.summary.json`);
}
log('');
log(`done ${el()}`);
