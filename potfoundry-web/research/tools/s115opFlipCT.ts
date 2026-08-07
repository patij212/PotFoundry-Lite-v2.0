// s115opFlipCT.ts — S115 OPERATOR: THE CONSTRAINED FLIP on CelticTriquetra's REDUCIBLE >45 deg CLASS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS RUN EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S114/S115 established that CelticTriquetra is the campaign's biggest REAL target: its >45 deg dihedral
// class is 3.1969% of mesh AREA and, unlike Gothic, 89.23% of it is REDUCIBLE (Gothic's class is 94.83%
// ACCURATE facets rendering a real crease; CelticTriquetra's ACCURATE share is 10.77%).
//
// The campaign already owns a CONSTRAINED FLIP (PF_LAND_FLIP / s60ConstrainedFlip.ts). Its headline 3.73x
// was shown by S92 to be a CENTROID-RULER ARTEFACT (1.050x on the covering ruler). It has NEVER been run
// on a style whose inverted class is this large. This runs it OFFLINE on the STL. The driver is untouched.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED KILL LINE — printed BEFORE any result, and not negotiable afterwards
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   PRIMARY   : WHOLE-MESH over-45deg dihedral AREA must fall by >= 2.0x.
//               (Whole-mesh, not target-set: S100's scar is that a scoped bar is satisfied by RELOCATION.)
//   PLACEBO   : the real arm's whole-mesh over-bar AREA REDUCTION must exceed the best cost-matched
//               placebo's by >= 2.0x. If a placebo matches it, the SELECTION is worthless => REFUTED.
//   FLOOR-1   : triangle count identical (a flip adds zero).
//   FLOOR-2   : whole-mesh over-45deg AREA must NOT increase.
//   FLOOR-3   : no facet's normDeg (inset 0.05, k=8, h-stable) may increase by more than 5.0 deg.
//   FLOOR-4   : topology — nonManifold stays 0, boundary stays 600, inconsistent-winding must NOT increase.
//   FLOOR-5   : POSITION — the new diagonal's midpoint may not move off the analytic surface by more than
//               0.01 mm relative to the old diagonal's midpoint. (Vertices themselves do not move: a flip
//               re-labels. The SURFACE still moves, because a quad's two cuts are different surfaces.)
//   PRIMARY < 2.0x, or PLACEBO not beaten, or any FLOOR violated  =>  the flip is REFUTED for this class.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TWO RULERS, AND THE RULER IS NOT THE OBJECTIVE (S92's lesson)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   R1  ANALYTIC-FREE — `facetDihedrals`, exhaustive over all 1.71 M facets, recomputed GLOBALLY after
//       each arm. This is the PRIMARY. It touches no analytic surface, so it cannot inherit an rA or
//       parameterisation confound, and it is the quantity a preview actually shades.
//   R2  COVERING — `orientOfFacet.normDeg` against the analytic surface, inset EXPLICIT and swept, k
//       swept, h swept. Reported beside R1. ARM B's accept clause is an R2 quantity, so R2 IS arm B's
//       objective — which is exactly why R1 decides the verdict.
//   IF THEY DISAGREE, THAT DISAGREEMENT IS THE RESULT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// FIVE ARMS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   0  IDENTITY   — zero flips. A negative control on the whole differencing machine: every number must
//                   come back byte-identical. If it does not, nothing below means anything.
//   A  UNCONDITIONAL — every LEGAL flip among the class edges, worst-dihedral-first. Raw REACH.
//   B  GUARDED    — additionally require the pair's max normDeg to STRICTLY decrease (landFlipPass's C1).
//                   The operator's BEST CASE: it can only accept flips that help the pair by R2.
//   P1 PLACEBO-GLOBAL — the SAME NUMBER of flips as arm A, drawn at random (seeded) from ALL legal
//                   interior edges of the mesh. Answers "would any N flips have done this?"
//   P2 PLACEBO-INCLASS — the SAME NUMBER of flips as arm B, drawn at random from the CLASS candidate set.
//                   Answers "is the C1 accept clause doing any work, or is it just picking N of them?"
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR INSTRUMENT SCARS — all four obeyed, explicitly
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  1 inset  — passed EXPLICITLY everywhere (never the 0 default) and SWEPT {0, 0.02, 0.05, 0.10}.
//  2 k      — SWEPT {4, 8, 16, 32} with the ladder printed. spreadRad is NOT quoted anywhere (it does not
//             converge in k and this tool has no use for it).
//  3 h      — SWEPT {2e-8 .. 1e-3} on every normDeg headline, with the h-stability ratio printed. A number
//             that moves with h is not a measurement.
//  4 cuts   — the 45 deg class bar is SWEPT {30,45,60,90,120,163.41,175} and the whole verdict re-scored
//             at each rung. The graphRatio curtain cut is swept {2,8,32,128} where it is used to LABEL.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS (any one firing VOIDS the run — no rescuing the number)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   C0 PRECOND      — max |r_mesh - rA|, stride AND exhaustive. Refuse over 50 um on the stride sample.
//   C1 REPRODUCTION — my >45 class census must reproduce S115's 306737 / 1585.8350 mm2 / 3.1969%.
//   C2 WELD         — my own vertex/edge census must agree with facetDihedrals' independent one.
//   C3 ANGLE        — my per-edge dihedral must agree with facetDihedrals' to < 1e-12 rad.
//   C4 IDENTITY ARM — arm 0 must return byte-identical everything.
//   C5 PARTITION    — facets outside the probe set touch no flipped facet, so their over-bar area delta
//                     MUST be exactly 0.
//   C6 INSTRUMENT   — every UNTOUCHED probe facet must return a byte-identical normDeg in every arm.
//
// Usage: bash research/tools/run-s115-opflipct.sh
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const DEG = 180 / Math.PI;

const STYLE = process.env.PF_S115F_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115F_STL
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/celtictriquetra_ring_D--.stl';
const TAG = process.env.PF_S115F_TAG ?? 'CT';
const K_REF = Math.round(envF('PF_S115F_K', 8));
const INSET_REF = envF('PF_S115F_INSET', 0.05);
const H_REF = envF('PF_S115F_H', 2e-6);
const HI_DEG = envF('PF_S115F_HI', 45);
const AR_CAP = envF('PF_S115F_ARCAP', 50);
const KILL_X = envF('PF_S115F_KILLX', 2.0);
const PLACEBO_X = envF('PF_S115F_PLACEBOX', 2.0);
const WORSE_DEG = envF('PF_S115F_WORSE', 5.0);
const POS_BAR_MM = envF('PF_S115F_POSBAR', 0.01);
const SEED = Math.round(envF('PF_S115F_SEED', 20260807));
const SWEEP_N = Math.round(envF('PF_S115F_SWEEPN', 4000));
const MAX_CAND = Math.round(envF('PF_S115F_MAXCAND', 0));   // 0 = all; smoke only
const CURTAIN_REF = envF('PF_S115F_CURTAIN', 8);
const DIMS: StyleDims = {
  H: envF('PF_S115F_H_DIM', 120), Rb: envF('PF_S115F_RB', 40), Rt: envF('PF_S115F_RT', 50), expn: 1,
};
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s115flip';

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
/** max over an array. NOT `Math.max(...a)` — that blows the call stack past ~1e5 elements, and this
 *  campaign's candidate lists are 2.4e5. A crash mid-run is a voided run. */
const mx = (a: ArrayLike<number>): number => {
  let m = -Infinity;
  for (let i = 0; i < a.length; i += 1) if (a[i] > m) m = a[i];
  return m;
};
const f2 = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const f4 = (x: number): string => (Number.isFinite(x) ? x.toFixed(4) : 'n/a');
/** deterministic PRNG — mulberry32. A placebo whose draw cannot be reproduced is not a control. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a += 0x6d2b79f5; a >>>= 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 OPERATOR — THE CONSTRAINED FLIP on ${STYLE}'s >${HI_DEG} deg CLASS  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`dims  H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`ruler R1 facetDihedrals (analytic-free, PRIMARY)  |  R2 orientOfFacet k=${K_REF} inset=${INSET_REF} h=${H_REF}`);
log(`seed  ${SEED}   AR cap ${AR_CAP}   sweep sample ${SWEEP_N}`);
log('');
log('── PRE-REGISTERED KILL LINE (stated BEFORE any result; not negotiable afterwards) ───────────────');
log(`  PRIMARY : WHOLE-MESH over-${HI_DEG}deg dihedral AREA must fall by >= ${KILL_X.toFixed(1)}x`);
log(`  PLACEBO : the real arm's whole-mesh over-bar AREA REDUCTION must exceed the best cost-matched`);
log(`            placebo's reduction by >= ${PLACEBO_X.toFixed(1)}x. A placebo that matches it REFUTES the selection.`);
log('  FLOOR-1 : triangle count identical');
log(`  FLOOR-2 : whole-mesh over-${HI_DEG}deg AREA must NOT increase`);
log(`  FLOOR-3 : no facet's normDeg (inset ${INSET_REF}, k=${K_REF}, h=${H_REF}) may increase by more than ${WORSE_DEG.toFixed(1)} deg`);
log('  FLOOR-4 : nonManifold stays 0, boundary stays 600, inconsistent-winding must NOT increase');
log(`  FLOOR-5 : POSITION — new-diagonal midpoint may not move off the analytic surface by > ${POS_BAR_MM} mm vs the old`);
log(`  PRIMARY < ${KILL_X.toFixed(1)}x  OR  placebo not beaten  OR  any FLOOR violated  =>  REFUTED for this class.`);
log('────────────────────────────────────────────────────────────────────────────────────────────────');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SURFACE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const defs = registryDefaults(STYLE);
log(`defs  ${Object.entries(defs).map(([k, v]) => `${k}=${v}`).join(' ')}`);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...defs }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
/** kink-aware sampler at a given finite-difference step. SCAR 3: h is a parameter, never a default. */
const nsAt = (h: number): ReturnType<typeof fdNormals> => fdNormals(rA, H, h, h);
const nsRef = nsAt(H_REF);
const scratch = new Float64Array(12);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MESH
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz0 = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);

// ── CONTROL C0: PRECOND, stride AND exhaustive ────────────────────────────────────────────────────
{
  const t = Date.now();
  let worstS = 0; const devS: number[] = [];
  const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    devS.push(dd); if (dd > worstS) worstS = dd;
  }
  log('── CONTROL C0: PRECOND  max |r_mesh - rA| (registry defaults) ──');
  log(`  STRIDE n=${devS.length}  p50 ${(q(devS, 0.5) * 1000).toExponential(3)} um  p99 ${(q(devS, 0.99) * 1000).toExponential(3)} um  MAX ${(worstS * 1000).toFixed(4)} um   (gate 50 um)`);
  if (worstS * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
  // EXHAUSTIVE. conv:curtain-K reported 1374.8 um on 4 facets — 27x the gate. That must be reproduced
  // and LOCALISED, not left as a rumour, because a target set containing them would be measuring rubbish.
  let worstE = 0; let nOver = 0; const overF: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    let dm = 0;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz0[f * 9 + k * 3]; const y = xyz0[f * 9 + k * 3 + 1]; const z = xyz0[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > dm) dm = dd;
    }
    if (dm > worstE) worstE = dm;
    if (dm * 1000 > 50) { nOver += 1; if (overF.length < 24) overF.push(f); }
  }
  log(`  EXHAUSTIVE n=${nTri * 3} vertices  MAX ${(worstE * 1000).toFixed(1)} um   facets over the 50 um gate: ${nOver} (${((nOver / nTri) * 100).toExponential(3)}%)  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  if (nOver > 0) log(`  offending facets (first ${overF.length}): ${overF.join(' ')}   <- carried into the target-set membership check below`);
  (globalThis as unknown as { __precondOver: number[] }).__precondOver = overF;
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// RULER R1 — BEFORE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const idxIdentity = new Uint32Array(nTri * 3);
for (let i = 0; i < nTri * 3; i += 1) idxIdentity[i] = i;
const d0 = facetDihedrals(xyz0, idxIdentity);
let meshArea0 = 0;
for (let f = 0; f < nTri; f += 1) meshArea0 += d0.areaMm2[f];
const thrRef = (HI_DEG * Math.PI) / 180;
log('── RULER R1 (analytic-free): the BEFORE census  ──');
log(`  facets ${nTri}   AREA ${meshArea0.toFixed(3)} mm2   interior ${d0.interiorEdges}  boundary ${d0.boundaryEdges}  nonManifold ${d0.nonManifoldEdges}  inconsistent ${d0.inconsistentEdges}  ${el()}`);
{
  let cN = 0; let cA = 0;
  for (let f = 0; f < nTri; f += 1) if (d0.perFacetMaxRad[f] > thrRef) { cN += 1; cA += d0.areaMm2[f]; }
  log(`  >${HI_DEG} DEG CLASS: COUNT ${cN} (${((cN / nTri) * 100).toFixed(4)}%)  AREA ${cA.toFixed(4)} mm2 = ${((cA / meshArea0) * 100).toFixed(4)}% of mesh`);
  log(`  CONTROL C1 REPRODUCTION vs S115 (306737 / 1585.8350 mm2 / 3.1969%): ${cN === 306737 && Math.abs(cA - 1585.8350) < 5e-3 ? 'EXACT' : '*** DIFFERS — investigate before reading anything below ***'}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// EXHAUSTIVE ANALYTIC-FREE SHAPE LABELS (so the ACCEPTED flips can be attributed to a MECHANISM)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const minAlt = new Float64Array(nTri);
const aspect = new Float64Array(nTri);
const gRatio = new Float64Array(nTri);
const rDot = new Float64Array(nTri);
const angUnc = new Float64Array(nTri);
const ulpOf = (x: number): number => {
  const a = Math.abs(x);
  if (!(a > 0)) return 2 ** -149;
  return 2 ** (Math.floor(Math.log2(a)) - 23);
};
{
  const t = Date.now();
  for (let f = 0; f < nTri; f += 1) {
    const ax = xyz0[f * 9]; const ay = xyz0[f * 9 + 1]; const az = xyz0[f * 9 + 2];
    const bx = xyz0[f * 9 + 3]; const by = xyz0[f * 9 + 4]; const bz = xyz0[f * 9 + 5];
    const cx = xyz0[f * 9 + 6]; const cy = xyz0[f * 9 + 7]; const cz = xyz0[f * 9 + 8];
    const L = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    const a3 = d0.areaMm2[f];
    const alt = L > 0 ? (2 * a3) / L : 0;
    minAlt[f] = alt; aspect[f] = alt > 0 ? L / alt : Infinity;
    const ath = Math.atan2(ay, ax);
    const bth = ath + dThRaw(ath, Math.atan2(by, bx));
    const cth = ath + dThRaw(ath, Math.atan2(cy, cx));
    const rR = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const sp = 0.5 * ((rR * (bth - ath)) * (cz - az) - (bz - az) * (rR * (cth - ath)));
    gRatio[f] = Math.abs(sp) > 1e-15 ? a3 / Math.abs(sp) : Infinity;
    const qz = Math.max(ulpOf(ax), ulpOf(ay), ulpOf(az), ulpOf(bx), ulpOf(by), ulpOf(bz), ulpOf(cx), ulpOf(cy), ulpOf(cz));
    angUnc[f] = alt > 0 ? Math.atan(qz / alt) * DEG : 180;
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 0) { nx /= nl; ny /= nl; }
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    const gl = Math.hypot(gx, gy);
    rDot[f] = gl > 0 ? (nx * gx + ny * gy) / gl : 0;
    void nz;
  }
  log(`── EXHAUSTIVE SHAPE LABELS (minAlt / aspect / graphRatio / rDot / f32 angUnc)  [${((Date.now() - t) / 1000).toFixed(1)}s] ──`);
}
const CEILING_DEG = 163.406;   // S115's measured analytic ceiling 2*atan(max|grad r|) at the 1600^2 grid
const isBlade = (f: number): boolean => d0.perFacetMaxRad[f] * DEG >= 175;
const isOverCeil = (f: number): boolean => d0.perFacetMaxRad[f] * DEG > CEILING_DEG;
const isCurtain = (f: number): boolean => gRatio[f] > CURTAIN_REF;
const isSliver = (f: number): boolean => aspect[f] >= 20;
const foldBand = (f: number): number => Math.sin(Math.min(Math.PI / 2, (3 * angUnc[f] * Math.PI) / 180));
const isInverted = (f: number): boolean => rDot[f] < 0 && Math.abs(rDot[f]) > foldBand(f);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WELD + EDGE TOPOLOGY (my own; cross-checked against facetDihedrals' independent census)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function weldSoup(xyz: Float64Array, n: number): { id: Int32Array; vx: Float64Array; vy: Float64Array; vz: Float64Array; nV: number } {
  const nVin = n * 3;
  const id = new Int32Array(nVin);
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const cx: number[] = []; const cy: number[] = []; const cz: number[] = [];
  let next = 0;
  for (let v = 0; v < nVin; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35);
    h |= 0;
    const bucket = buckets.get(h);
    let found = -1;
    if (bucket !== undefined) for (const cc of bucket) if (cx[cc] === x && cy[cc] === y && cz[cc] === z) { found = cc; break; }
    if (found < 0) {
      found = next; next += 1;
      cx.push(x); cy.push(y); cz.push(z);
      if (bucket === undefined) buckets.set(h, [found]); else bucket.push(found);
    }
    id[v] = found;
  }
  return { id, vx: Float64Array.from(cx), vy: Float64Array.from(cy), vz: Float64Array.from(cz), nV: next };
}
const W = weldSoup(xyz0, nTri);
const EKEY = 67_108_864;
if (W.nV >= EKEY) { log('*** REFUSING: vertex count exceeds the 2^26 edge-key packing limit ***'); process.exit(4); }
const ekey = (a: number, b: number): number => (a < b ? a * EKEY + b : b * EKEY + a);
const edgeMap = new Map<number, number[]>();
for (let f = 0; f < nTri; f += 1) {
  const a = W.id[f * 3]; const b = W.id[f * 3 + 1]; const c = W.id[f * 3 + 2];
  for (const k of [ekey(a, b), ekey(b, c), ekey(c, a)]) {
    const g = edgeMap.get(k);
    if (g === undefined) edgeMap.set(k, [f]); else g.push(f);
  }
}
let myInterior = 0; let myBoundary = 0; let myNonMan = 0;
for (const g of edgeMap.values()) { if (g.length === 1) myBoundary += 1; else if (g.length === 2) myInterior += 1; else myNonMan += 1; }
log('── CONTROL C2: WELD ──');
log(`  my unique vertices ${W.nV}   my undirected edges ${edgeMap.size}   interior ${myInterior} boundary ${myBoundary} nonManifold ${myNonMan}`);
log(`  facetDihedrals says interior ${d0.interiorEdges} boundary ${d0.boundaryEdges} nonManifold ${d0.nonManifoldEdges}   ${myInterior === d0.interiorEdges && myBoundary === d0.boundaryEdges && myNonMan === d0.nonManifoldEdges ? 'AGREE' : '*** DISAGREE — VOID ***'}`);
if (!(myInterior === d0.interiorEdges && myBoundary === d0.boundaryEdges && myNonMan === d0.nonManifoldEdges)) process.exit(7);
const VT = new Float64Array(W.nV);
for (let v = 0; v < W.nV; v += 1) VT[v] = Math.atan2(W.vy[v], W.vx[v]);

// ── every interior edge, with its dihedral computed INDEPENDENTLY (control C3) ────────────────────
function nrmOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  return L > 0 ? [nx / L, ny / L, nz / L] : [0, 0, 0];
}
const FN = new Float64Array(nTri * 3);
for (let f = 0; f < nTri; f += 1) {
  const n = nrmOf(xyz0[f * 9], xyz0[f * 9 + 1], xyz0[f * 9 + 2], xyz0[f * 9 + 3], xyz0[f * 9 + 4], xyz0[f * 9 + 5], xyz0[f * 9 + 6], xyz0[f * 9 + 7], xyz0[f * 9 + 8]);
  FN[f * 3] = n[0]; FN[f * 3 + 1] = n[1]; FN[f * 3 + 2] = n[2];
}
interface EdgeRec { u: number; v: number; f1: number; f2: number; ang: number }
const edges: EdgeRec[] = [];
for (const [k, g] of edgeMap) {
  if (g.length !== 2) continue;
  const u = Math.floor(k / EKEY); const v = k - u * EKEY;
  const f1 = g[0]; const f2 = g[1];
  let dp = FN[f1 * 3] * FN[f2 * 3] + FN[f1 * 3 + 1] * FN[f2 * 3 + 1] + FN[f1 * 3 + 2] * FN[f2 * 3 + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  edges.push({ u, v, f1, f2, ang: Math.acos(dp) });
}
{
  // C3: my per-edge angles, as a multiset, must equal facetDihedrals'.
  const mine = edges.map((e) => e.ang).sort((a, b) => a - b);
  const theirs = Array.from(d0.edgeAngRad).sort((a, b) => a - b);
  let worst = 0;
  for (let i = 0; i < mine.length; i += 1) worst = Math.max(worst, Math.abs(mine[i] - theirs[i]));
  log(`── CONTROL C3: ANGLE — max |my edge dihedral - facetDihedrals'| over ${mine.length} interior edges = ${worst.toExponential(3)} rad   ${worst < 1e-12 ? 'AGREE' : '*** DISAGREE — VOID ***'}`);
  if (!(worst < 1e-12)) process.exit(7);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// RULER R2 — normDeg over a soup, with h / k / inset ALL explicit (no defaults anywhere)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const nsCache = new Map<number, ReturnType<typeof fdNormals>>();
const nsFor = (h: number): ReturnType<typeof fdNormals> => {
  let s = nsCache.get(h);
  if (s === undefined) { s = nsAt(h); nsCache.set(h, s); }
  return s;
};
function normDegXYZ(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
  inset: number, k: number, h: number,
): number {
  const a = Math.atan2(ay, ax);
  const b = a + dThRaw(a, Math.atan2(by, bx));
  const c = a + dThRaw(a, Math.atan2(cy, cx));
  return orientOfFacet(h === H_REF ? nsRef : nsFor(h), ax, ay, az, bx, by, bz, cx, cy, cz, a, b, c, { k, inset, scratch }).normDeg;
}
const normDegOf = (xyz: Float64Array, f: number, inset: number, k: number, h: number): number => normDegXYZ(
  xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
  xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], inset, k, h,
);
function arOf(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const s = 0.5 * (ab + bc + ca);
  if (!(area > 0) || !(s > 0)) return Infinity;
  return Math.max(ab, bc, ca) / (2 * (area / s));
}
/** |r - rA| at the 3D midpoint of a welded-vertex segment — the FLOOR-5 position quantity. */
const midDev = (p: number, qv: number): number => {
  const mx = 0.5 * (W.vx[p] + W.vx[qv]); const my = 0.5 * (W.vy[p] + W.vy[qv]); const mz = 0.5 * (W.vz[p] + W.vz[qv]);
  return Math.abs(Math.hypot(mx, my) - rA(Math.atan2(my, mx), mz));
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CANDIDATES — interior edges whose dihedral exceeds the class bar
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let cand: EdgeRec[] = edges.filter((e) => e.ang > thrRef);
cand.sort((a, b) => b.ang - a.ang);                  // worst-first: the operator's INFORMED key
if (MAX_CAND > 0 && cand.length > MAX_CAND) cand = cand.slice(0, MAX_CAND);
log('── THE CANDIDATE SET ──');
log(`  interior edges with dihedral > ${HI_DEG} deg: ${cand.length} of ${edges.length} (${((cand.length / edges.length) * 100).toFixed(4)}%)   (S114 read 237,835)`);
log(`  their dihedral p10 ${f2(q(cand.map((e) => e.ang * DEG), 0.1))} p50 ${f2(q(cand.map((e) => e.ang * DEG), 0.5))} p90 ${f2(q(cand.map((e) => e.ang * DEG), 0.9))} MAX ${f2(mx(cand.map((e) => e.ang)) * DEG)} deg`);
{
  const pre = (globalThis as unknown as { __precondOver: number[] }).__precondOver;
  const bad = new Set(pre);
  let hit = 0;
  for (const e of cand) if (bad.has(e.f1) || bad.has(e.f2)) hit += 1;
  log(`  candidates touching a PRECOND-failing facet: ${hit}  ${hit === 0 ? '(none — the exhaustive PRECOND outliers are outside the operator scope)' : '(REPORTED; these are excluded from the accept list below)'}`);
  (globalThis as unknown as { __badFacets: Set<number> }).__badFacets = bad;
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE OPERATOR
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Acc {
  e: number; f1: number; f2: number; angBefore: number; angAfter: number;
  ndB: number; ndA: number; arP: number; arC: number; posOld: number; posNew: number;
}
interface Rej { notPair: number; conflict: number; sameOpp: number; dup: number; fold: number; invert3d: number; shape: number; noImprove: number; precond: number }
interface ArmOut { xyz: Float64Array; touched: Uint8Array; acc: Acc[]; rej: Rej; strictShape: number; scanned: number }

const ndBeforeCache = new Float64Array(nTri).fill(NaN);
const ndBeforeRef = (f: number): number => {
  if (Number.isNaN(ndBeforeCache[f])) ndBeforeCache[f] = normDegOf(xyz0, f, INSET_REF, K_REF, H_REF);
  return ndBeforeCache[f];
};

function runArm(list: EdgeRec[], guard: boolean, cap: number): ArmOut {
  const xyz = Float64Array.from(xyz0);
  const touched = new Uint8Array(nTri);
  const created = new Set<number>();
  const rej: Rej = { notPair: 0, conflict: 0, sameOpp: 0, dup: 0, fold: 0, invert3d: 0, shape: 0, noImprove: 0, precond: 0 };
  const acc: Acc[] = [];
  const bad = (globalThis as unknown as { __badFacets: Set<number> }).__badFacets;
  let strictShape = 0; let scanned = 0;
  const P = (id: number, k: number): number => (k === 0 ? W.vx[id] : k === 1 ? W.vy[id] : W.vz[id]);
  for (let i = 0; i < list.length; i += 1) {
    if (cap > 0 && acc.length >= cap) break;
    scanned += 1;
    const r = list[i];
    const f1 = r.f1; const f2 = r.f2;
    if (bad.has(f1) || bad.has(f2)) { rej.precond += 1; continue; }
    if (touched[f1] === 1 || touched[f2] === 1) { rej.conflict += 1; continue; }
    const A1 = [W.id[f1 * 3], W.id[f1 * 3 + 1], W.id[f1 * 3 + 2]];
    const A2 = [W.id[f2 * 3], W.id[f2 * 3 + 1], W.id[f2 * 3 + 2]];
    const u = r.u; const v = r.v;
    if (!(A1.includes(u) && A1.includes(v) && A2.includes(u) && A2.includes(v))) { rej.notPair += 1; continue; }
    const c = A1.find((x) => x !== u && x !== v) as number;
    const dv = A2.find((x) => x !== u && x !== v) as number;
    if (c === undefined || dv === undefined || c === dv) { rej.sameOpp += 1; continue; }
    if (edgeMap.has(ekey(c, dv)) || created.has(ekey(c, dv))) { rej.dup += 1; continue; }
    // STRICT CONVEXITY of the quad in the (theta, z) GRAPH domain — landFlipPass's C4 predicate, verbatim.
    const t0th = VT[u];
    const pux = 0; const puy = W.vz[u];
    const pvx = dThRaw(t0th, VT[v]); const pvy = W.vz[v];
    const pcx = dThRaw(t0th, VT[c]); const pcy = W.vz[c];
    const pdx = dThRaw(t0th, VT[dv]); const pdy = W.vz[dv];
    const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
    const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
    if (!(s1 * s2 < 0 && s3 * s4 < 0)) { rej.fold += 1; continue; }
    // ORIENTATION-CORRECT RE-LABEL from the quad's real boundary cycle.
    let f1IsUV = false;
    for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
    const cc = f1IsUV ? c : dv; const dd = f1IsUV ? dv : c;
    const n1 = [cc, u, dd]; const n2 = [cc, dd, v];
    const g1 = nrmOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const g2 = nrmOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const mx = FN[f1 * 3] + FN[f2 * 3]; const my = FN[f1 * 3 + 1] + FN[f2 * 3 + 1]; const mz = FN[f1 * 3 + 2] + FN[f2 * 3 + 2];
    if (!(Math.hypot(mx, my, mz) > 0) || !(g1[0] * mx + g1[1] * my + g1[2] * mz > 0 && g2[0] * mx + g2[1] * my + g2[2] * mz > 0)) { rej.invert3d += 1; continue; }
    // SHAPE FLOOR — do-no-harm: children may not be worse than max(AR_CAP, the two parents).
    const arC1 = arOf(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2));
    const arC2 = arOf(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2));
    const arP1 = arOf(xyz0[f1 * 9], xyz0[f1 * 9 + 1], xyz0[f1 * 9 + 2], xyz0[f1 * 9 + 3], xyz0[f1 * 9 + 4], xyz0[f1 * 9 + 5], xyz0[f1 * 9 + 6], xyz0[f1 * 9 + 7], xyz0[f1 * 9 + 8]);
    const arP2 = arOf(xyz0[f2 * 9], xyz0[f2 * 9 + 1], xyz0[f2 * 9 + 2], xyz0[f2 * 9 + 3], xyz0[f2 * 9 + 4], xyz0[f2 * 9 + 5], xyz0[f2 * 9 + 6], xyz0[f2 * 9 + 7], xyz0[f2 * 9 + 8]);
    if (!(arC1 <= Math.max(AR_CAP, arP1, arP2) && arC2 <= Math.max(AR_CAP, arP1, arP2))) { rej.shape += 1; continue; }
    if (!(arC1 <= AR_CAP && arC2 <= AR_CAP)) strictShape += 1;
    // C1 — GUARDED arm only: the pair's max normDeg must STRICTLY decrease. (This is an R2 quantity, i.e.
    // arm B's objective; that is exactly why the VERDICT is decided on R1.)
    let ndB = NaN; let ndA = NaN;
    if (guard) {
      ndB = Math.max(ndBeforeRef(f1), ndBeforeRef(f2));
      ndA = Math.max(
        normDegXYZ(P(n1[0], 0), P(n1[0], 1), P(n1[0], 2), P(n1[1], 0), P(n1[1], 1), P(n1[1], 2), P(n1[2], 0), P(n1[2], 1), P(n1[2], 2), INSET_REF, K_REF, H_REF),
        normDegXYZ(P(n2[0], 0), P(n2[0], 1), P(n2[0], 2), P(n2[1], 0), P(n2[1], 1), P(n2[1], 2), P(n2[2], 0), P(n2[2], 1), P(n2[2], 2), INSET_REF, K_REF, H_REF),
      );
      if (!(ndA < ndB - 1e-9)) { rej.noImprove += 1; continue; }
    }
    for (let k = 0; k < 3; k += 1) {
      xyz[f1 * 9 + k * 3] = W.vx[n1[k]]; xyz[f1 * 9 + k * 3 + 1] = W.vy[n1[k]]; xyz[f1 * 9 + k * 3 + 2] = W.vz[n1[k]];
      xyz[f2 * 9 + k * 3] = W.vx[n2[k]]; xyz[f2 * 9 + k * 3 + 1] = W.vy[n2[k]]; xyz[f2 * 9 + k * 3 + 2] = W.vz[n2[k]];
    }
    touched[f1] = 1; touched[f2] = 1;
    created.add(ekey(c, dv));
    let dp = g1[0] * g2[0] + g1[1] * g2[1] + g1[2] * g2[2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    acc.push({
      e: i, f1, f2, angBefore: r.ang * DEG, angAfter: Math.acos(dp) * DEG, ndB, ndA,
      arP: Math.max(arP1, arP2), arC: Math.max(arC1, arC2), posOld: midDev(u, v), posNew: midDev(c, dv),
    });
  }
  return { xyz, touched, acc, rej, strictShape, scanned };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SCORING
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Cen { n: number; area: number; max: number }
function censusAt(per: Float64Array, ar: Float64Array, thr: number, set: number[] | null): Cen {
  let n = 0; let area = 0; let max = 0;
  const walk = (f: number): void => {
    const a = per[f];
    if (a > max) max = a;
    if (a > thr) { n += 1; area += ar[f]; }
  };
  if (set === null) { for (let f = 0; f < per.length; f += 1) walk(f); } else for (const f of set) walk(f);
  return { n, area, max: max * DEG };
}

// candidate facet set U (every facet on a class edge) and its 1-ring — the only facets a flip can touch
const inU = new Uint8Array(nTri);
for (const e of cand) { inU[e.f1] = 1; inU[e.f2] = 1; }
const U: number[] = [];
for (let f = 0; f < nTri; f += 1) if (inU[f] === 1) U.push(f);
const inP = new Uint8Array(nTri);
for (const f of U) inP[f] = 1;
for (let e = 0; e < d0.edgeF1.length; e += 1) {
  const a = d0.edgeF1[e]; const b = d0.edgeF2[e];
  if (inU[a] === 1) inP[b] = 1;
  if (inU[b] === 1) inP[a] = 1;
}
const probe: number[] = [];
for (let f = 0; f < nTri; f += 1) if (inP[f] === 1) probe.push(f);
const outside: number[] = [];
for (let f = 0; f < nTri; f += 1) if (inP[f] === 0) outside.push(f);
let areaU0 = 0;
for (const f of U) areaU0 += d0.areaMm2[f];
log(`  target facet set U (both facets of every class edge): ${U.length}  AREA ${areaU0.toFixed(4)} mm2 = ${((areaU0 / meshArea0) * 100).toFixed(4)}% of mesh`);
log(`  probe set (U + 1-ring; the only facets any flip can move): ${probe.length}   outside ${outside.length}  ${el()}`);
log('');

const BARS = [30, 45, 60, 90, 120, CEILING_DEG, 175];
const cM0: Record<string, Cen> = {}; const cU0: Record<string, Cen> = {};
for (const b of BARS) { cM0[String(b)] = censusAt(d0.perFacetMaxRad, d0.areaMm2, (b * Math.PI) / 180, null); cU0[String(b)] = censusAt(d0.perFacetMaxRad, d0.areaMm2, (b * Math.PI) / 180, U); }

interface ArmScore {
  name: string; accepted: number; scanned: number; rej: Rej; strictShape: number;
  meshArea1: number; topo: { interior: number; boundary: number; nonMan: number; incons: number };
  mesh: Record<string, Cen>; target: Record<string, Cen>; outsideDelta: number;
  primaryX: number; reduction: number; posMaxNew: number; posMaxDelta: number;
  worseN: number; worseArea: number; betterN: number; betterArea: number; worstUp: number; overWorse: number;
  ndU: { bar: number; nB: number; aB: number; mB: number; nA: number; aA: number; mA: number }[];
  mech: Record<string, { n: number; area: number }>;
}
const scores: ArmScore[] = [];
const shots: Record<string, { touched: Uint8Array; acc: Acc[] }> = {};

function scoreArm(name: string, R: ArmOut): ArmScore {
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`ARM ${name}`);
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log('── LEGALITY (every refusal counted by reason; a silent skip is a lie about coverage) ──');
  log(`  candidates scanned               ${R.scanned}`);
  log(`  ACCEPTED (flip applied)          ${R.acc.length}   = ${((R.acc.length / Math.max(1, R.scanned)) * 100).toFixed(3)}% of scanned`);
  log(`  refused: PRECOND-failing facet   ${R.rej.precond}`);
  log(`  refused: facet already flipped   ${R.rej.conflict}   (a facet on two class edges; worst-first, first wins)`);
  log(`  refused: not an edge pair        ${R.rej.notPair}`);
  log(`  refused: same opposite vertex    ${R.rej.sameOpp}`);
  log(`  refused: new edge already exists ${R.rej.dup}   (the flip would make a non-manifold edge)`);
  log(`  refused: NON-CONVEX quad (fold)  ${R.rej.fold}   (the flip would invert a triangle in the graph domain)`);
  log(`  refused: 3D normal inversion     ${R.rej.invert3d}`);
  log(`  refused: shape floor AR          ${R.rej.shape}   (cap = max(${AR_CAP}, parents))`);
  log(`  refused: C1 no normDeg gain      ${R.rej.noImprove}`);
  log(`  [a STRICT AR<=${AR_CAP} rule would refuse ${R.strictShape} MORE of the accepted]  ${el()}`);
  log('');
  const d1 = facetDihedrals(R.xyz, idxIdentity);
  let meshArea1 = 0;
  for (let f = 0; f < nTri; f += 1) meshArea1 += d1.areaMm2[f];
  log(`AFTER: area ${meshArea1.toFixed(3)} mm2 (delta ${(meshArea1 - meshArea0).toFixed(4)} = ${(((meshArea1 - meshArea0) / meshArea0) * 100).toFixed(5)}%)  interior ${d1.interiorEdges}  boundary ${d1.boundaryEdges}  nonManifold ${d1.nonManifoldEdges}  inconsistent ${d1.inconsistentEdges}  ${el()}`);
  const mesh: Record<string, Cen> = {}; const target: Record<string, Cen> = {};
  for (const b of BARS) { mesh[String(b)] = censusAt(d1.perFacetMaxRad, d1.areaMm2, (b * Math.PI) / 180, null); target[String(b)] = censusAt(d1.perFacetMaxRad, d1.areaMm2, (b * Math.PI) / 180, U); }
  // ── the ONLY facets this arm can move: its own touched set plus that set's 1-ring. ───────────────
  // *** SCOPE FIX, 2026-08-07. THIS CONTROL FIRED AND VOIDED THE FIRST RUN, CORRECTLY. ***
  // It was originally computed from the CLASS-EDGE target set U. That is the right invariant for arms
  // A/B/P2, whose every flip is on a class edge, so every touched facet is in U. It is the WRONG
  // invariant for PLACEBO-GLOBAL, which flips edges drawn from the whole mesh: those facets are not in
  // U, so they land in `outside`, and the control fired with a 61.90 mm2 delta. The control was right
  // and the SCOPE was wrong. The invariant that is actually true of a flip — and the one asserted here
  // — is per-arm: a facet neither touched nor adjacent to a touched facet cannot change, whatever the
  // selection rule was. Arms A and B must reproduce their pre-fix numbers EXACTLY; that is checked.
  const tp: number[] = [];
  const inTP = new Uint8Array(nTri);
  {
    for (let f = 0; f < nTri; f += 1) if (R.touched[f] === 1) inTP[f] = 1;
    for (let e = 0; e < d0.edgeF1.length; e += 1) {
      const a = d0.edgeF1[e]; const b = d0.edgeF2[e];
      if (R.touched[a] === 1) inTP[b] = 1;
      if (R.touched[b] === 1) inTP[a] = 1;
    }
    for (let f = 0; f < nTri; f += 1) if (inTP[f] === 1) tp.push(f);
  }
  const armOutside: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (inTP[f] === 0) armOutside.push(f);
  const o0 = censusAt(d0.perFacetMaxRad, d0.areaMm2, thrRef, armOutside);
  const o1 = censusAt(d1.perFacetMaxRad, d1.areaMm2, thrRef, armOutside);
  const outsideDelta = o1.area - o0.area;
  log(`  CONTROL C5 PARTITION (per-arm: complement of touched+1-ring, ${armOutside.length} facets) — over-${HI_DEG} AREA ${o0.area.toFixed(6)} -> ${o1.area.toFixed(6)}  delta ${outsideDelta.toExponential(2)}   ${o1.area === o0.area && o1.n === o0.n ? 'EXACTLY 0 — OK' : '*** NOT 0 — VOID ***'}`);
  if (!(o1.area === o0.area && o1.n === o0.n)) { log('*** VOID ***'); process.exit(8); }
  log('');
  log(`══ R1 (ANALYTIC-FREE DIHEDRAL) — SCAR 4: the class bar SWEPT, the verdict re-scored at each rung ══`);
  log('   bar deg        WHOLE-MESH COUNT      WHOLE-MESH AREA mm2 (=%of mesh)        MAX deg      ratio');
  for (const b of BARS) {
    const a = cM0[String(b)]; const z = mesh[String(b)];
    const x = z.area > 0 ? a.area / z.area : Infinity;
    log(`   >${f2(b).padStart(7)}   ${String(a.n).padStart(8)} -> ${String(z.n).padStart(8)}   ${a.area.toFixed(4).padStart(10)} -> ${z.area.toFixed(4).padStart(10)}  (${((a.area / meshArea0) * 100).toFixed(4)}% -> ${((z.area / meshArea1) * 100).toFixed(4)}%)   ${f2(a.max).padStart(7)} -> ${f2(z.max).padStart(7)}   ${x.toFixed(4)}x`);
  }
  const a45 = cM0[String(HI_DEG)]; const z45 = mesh[String(HI_DEG)];
  const primaryX = z45.area > 0 ? a45.area / z45.area : Infinity;
  const reduction = a45.area - z45.area;
  log(`   => PRIMARY (whole-mesh over-${HI_DEG} AREA) = ${primaryX.toFixed(4)}x   REDUCTION ${reduction >= 0 ? '+' : ''}${reduction.toFixed(4)} mm2`);
  log(`      by COUNT ${(z45.n > 0 ? a45.n / z45.n : Infinity).toFixed(4)}x, by MAX ${(z45.max > 0 ? a45.max / z45.max : Infinity).toFixed(4)}x  (NEVER quote one alone)`);
  log('');
  log(`   TARGET SET U (${U.length} facets, over-${HI_DEG}): COUNT ${cU0[String(HI_DEG)].n} -> ${target[String(HI_DEG)].n}   AREA ${cU0[String(HI_DEG)].area.toFixed(4)} -> ${target[String(HI_DEG)].area.toFixed(4)} mm2 = ${(target[String(HI_DEG)].area > 0 ? cU0[String(HI_DEG)].area / target[String(HI_DEG)].area : Infinity).toFixed(4)}x`);
  log(`   RELOCATION CHECK: whole-mesh delta ${(z45.area - a45.area).toFixed(4)} vs target-set delta ${(target[String(HI_DEG)].area - cU0[String(HI_DEG)].area).toFixed(4)} mm2`);
  log(`   (a target-set win larger than the whole-mesh win means the defect MOVED into the 1-ring, not away)`);
  log('');

  // ── FLOOR-3 + R2, on the touched facets and their 1-ring only (nothing else can move) ────────────
  log(`── R2 (COVERING RULER) on the ${tp.length} facets a flip can move (touched + 1-ring); inset ${INSET_REF} k=${K_REF} h=${H_REF} ──`);
  const ndB = new Float64Array(tp.length); const ndA = new Float64Array(tp.length);
  for (let i = 0; i < tp.length; i += 1) {
    ndB[i] = normDegOf(xyz0, tp[i], INSET_REF, K_REF, H_REF); ndA[i] = normDegOf(R.xyz, tp[i], INSET_REF, K_REF, H_REF);
    if (i > 0 && i % 200000 === 0) log(`     ... R2 ${i}/${tp.length}  ${el()}`);
  }
  {
    let bad = 0; let worst = 0; let nUn = 0;
    for (let i = 0; i < tp.length; i += 1) {
      if (R.touched[tp[i]] === 1) continue;
      nUn += 1;
      if (ndA[i] !== ndB[i]) { bad += 1; worst = Math.max(worst, Math.abs(ndA[i] - ndB[i])); }
    }
    log(`  CONTROL C6 INSTRUMENT: ${nUn} UNTOUCHED readings, ${bad} differ (worst ${worst}). MUST be 0.  ${bad === 0 ? 'OK' : '*** VOID ***'}`);
    if (bad > 0) process.exit(6);
  }
  const ndU: ArmScore['ndU'] = [];
  for (const bar of [1, 5, 45, 90]) {
    let nB = 0; let aB = 0; let mB = 0; let nA = 0; let aA = 0; let mA = 0;
    for (let i = 0; i < tp.length; i += 1) {
      if (ndB[i] > mB) mB = ndB[i];
      if (ndA[i] > mA) mA = ndA[i];
      if (ndB[i] > bar) { nB += 1; aB += d0.areaMm2[tp[i]]; }
      if (ndA[i] > bar) { nA += 1; aA += d1.areaMm2[tp[i]]; }
    }
    ndU.push({ bar, nB, aB, mB, nA, aA, mA });
    log(`  bar ${String(bar).padStart(2)} deg | BEFORE n=${String(nB).padStart(7)} area=${aB.toFixed(4).padStart(10)} max=${f2(mB).padStart(7)}  ->  AFTER n=${String(nA).padStart(7)} area=${aA.toFixed(4).padStart(10)} max=${f2(mA).padStart(7)}   ratio ${(aA > 0 ? aB / aA : Infinity).toFixed(4)}x`);
  }
  let worseN = 0; let worseArea = 0; let betterN = 0; let betterArea = 0; let worstUp = 0; let overWorse = 0;
  const ups: number[] = [];
  for (let i = 0; i < tp.length; i += 1) {
    const del = ndA[i] - ndB[i];
    if (del > 1e-12) { worseN += 1; worseArea += d0.areaMm2[tp[i]]; ups.push(del); if (del > worstUp) worstUp = del; if (del > WORSE_DEG) overWorse += 1; }
    else if (del < -1e-12) { betterN += 1; betterArea += d0.areaMm2[tp[i]]; }
  }
  log(`  FLOOR-3 HARM: WORSE n=${worseN} area=${worseArea.toFixed(4)} mm2 | BETTER n=${betterN} area=${betterArea.toFixed(4)} mm2`);
  log(`          worst single increase ${f2(worstUp)} deg;  ${overWorse} facets increased by more than ${WORSE_DEG.toFixed(1)} deg (must be 0)`);
  if (ups.length > 0) log(`          increase distribution p50 ${f2(q(ups, 0.5))} p90 ${f2(q(ups, 0.9))} p99 ${f2(q(ups, 0.99))} deg`);
  log('');

  // ── FLOOR-5 POSITION, and the mechanism attribution of what was actually reached ─────────────────
  let posMaxNew = 0; let posMaxDelta = 0;
  for (const a of R.acc) { if (a.posNew > posMaxNew) posMaxNew = a.posNew; if (a.posNew - a.posOld > posMaxDelta) posMaxDelta = a.posNew - a.posOld; }
  log(`  FLOOR-5 POSITION: vertices moved 0 mm exactly (a flip re-labels). NEW-DIAGONAL midpoint |r - rA|:`);
  if (R.acc.length > 0) {
    log(`          old diagonal p50 ${q(R.acc.map((a) => a.posOld), 0.5).toExponential(3)} MAX ${mx(R.acc.map((a) => a.posOld)).toExponential(3)} mm`);
    log(`          new diagonal p50 ${q(R.acc.map((a) => a.posNew), 0.5).toExponential(3)} MAX ${posMaxNew.toExponential(3)} mm   worst INCREASE ${posMaxDelta.toExponential(3)} mm  (bar ${POS_BAR_MM})`);
  }
  const mech: Record<string, { n: number; area: number }> = {};
  const labs: [string, (f: number) => boolean][] = [
    ['BLADE(dih>=175)', isBlade], [`OVER-CEILING(>${CEILING_DEG.toFixed(2)})`, isOverCeil],
    [`CURTAIN(gr>${CURTAIN_REF})`, isCurtain], ['SLIVER(asp>=20)', isSliver], ['INVERTED(rDot<0)', isInverted],
  ];
  for (const [nm, fn] of labs) {
    let n = 0; let area = 0;
    for (const a of R.acc) for (const f of [a.f1, a.f2]) if (fn(f)) { n += 1; area += d0.areaMm2[f]; }
    mech[nm] = { n, area };
  }
  if (R.acc.length > 0) {
    log('');
    log('  ── WHICH MECHANISM DID THE OPERATOR ACTUALLY REACH? (labels are analytic-free, exhaustive) ──');
    let clsN = 0; let clsA = 0;
    for (const f of U) if (d0.perFacetMaxRad[f] > thrRef) { clsN += 1; clsA += d0.areaMm2[f]; }
    let accA = 0;
    for (const a of R.acc) accA += d0.areaMm2[a.f1] + d0.areaMm2[a.f2];
    log(`     flipped facets ${R.acc.length * 2}  AREA ${accA.toFixed(4)} mm2 = ${((accA / cM0[String(HI_DEG)].area) * 100).toFixed(4)}% of the >${HI_DEG} class AREA (class ${clsN} facets / ${clsA.toFixed(3)} mm2)`);
    for (const [nm, fn] of labs) {
      let mn = 0; let ma = 0;
      for (const f of U) if (d0.perFacetMaxRad[f] > thrRef && fn(f)) { mn += 1; ma += d0.areaMm2[f]; }
      log(`     ${nm.padEnd(24)} flipped ${String(mech[nm].n).padStart(7)} facets / ${mech[nm].area.toFixed(4).padStart(10)} mm2   |  in class: ${String(mn).padStart(7)} / ${ma.toFixed(3).padStart(10)} mm2   REACH ${ma > 0 ? ((mech[nm].area / ma) * 100).toFixed(4) : 'n/a'}% of that mechanism's class area`);
    }
    log('');
    log('  ── THE FLIPPED PAIRS THEMSELVES ──');
    const bAng = R.acc.map((a) => a.angBefore); const aAng = R.acc.map((a) => a.angAfter);
    log(`     pair dihedral BEFORE p10 ${f2(q(bAng, 0.1))} p50 ${f2(q(bAng, 0.5))} p90 ${f2(q(bAng, 0.9))} MAX ${f2(mx(bAng))} deg`);
    log(`     pair dihedral AFTER  p10 ${f2(q(aAng, 0.1))} p50 ${f2(q(aAng, 0.5))} p90 ${f2(q(aAng, 0.9))} MAX ${f2(mx(aAng))} deg`);
    log(`     pairs whose own diagonal fell under ${HI_DEG} deg: ${aAng.filter((x) => x <= HI_DEG).length} of ${R.acc.length} (${((aAng.filter((x) => x <= HI_DEG).length / R.acc.length) * 100).toFixed(2)}%)`);
    log(`     pairs whose own diagonal got WORSE:              ${R.acc.filter((a) => a.angAfter > a.angBefore).length} (${((R.acc.filter((a) => a.angAfter > a.angBefore).length / R.acc.length) * 100).toFixed(2)}%)`);
    log(`     AR parents p50 ${f2(q(R.acc.map((a) => a.arP), 0.5))} MAX ${f2(mx(R.acc.map((a) => a.arP)))}  ->  children p50 ${f2(q(R.acc.map((a) => a.arC), 0.5))} MAX ${f2(mx(R.acc.map((a) => a.arC)))}`);
  }
  log('');
  shots[name.slice(0, 2).trim()] = { touched: R.touched, acc: R.acc };
  return {
    name, accepted: R.acc.length, scanned: R.scanned, rej: R.rej, strictShape: R.strictShape,
    meshArea1, topo: { interior: d1.interiorEdges, boundary: d1.boundaryEdges, nonMan: d1.nonManifoldEdges, incons: d1.inconsistentEdges },
    mesh, target, outsideDelta, primaryX, reduction, posMaxNew, posMaxDelta,
    worseN, worseArea, betterN, betterArea, worstUp, overWorse, ndU, mech,
  };
}

// ── ARM 0: IDENTITY (control C4) ──────────────────────────────────────────────────────────────────
{
  const R = runArm([], false, 0);
  const d1 = facetDihedrals(R.xyz, idxIdentity);
  let a1 = 0;
  for (let f = 0; f < nTri; f += 1) a1 += d1.areaMm2[f];
  const c1 = censusAt(d1.perFacetMaxRad, d1.areaMm2, thrRef, null);
  const c0 = cM0[String(HI_DEG)];
  const ok = a1 === meshArea0 && c1.n === c0.n && c1.area === c0.area && c1.max === c0.max
    && d1.interiorEdges === d0.interiorEdges && d1.inconsistentEdges === d0.inconsistentEdges;
  log('── CONTROL C4: ARM 0 IDENTITY (zero flips) — every number must return byte-identical ──');
  log(`  area ${a1 === meshArea0 ? 'IDENTICAL' : '*** MOVED ***'}   over-${HI_DEG} count ${c1.n} vs ${c0.n}   area ${c1.area} vs ${c0.area}   max ${c1.max} vs ${c0.max}   ${ok ? 'OK' : '*** VOID ***'}`);
  if (!ok) process.exit(9);
  log('');
}

// ── ARM A ────────────────────────────────────────────────────────────────────────────────────────
const RA = runArm(cand, false, 0);
const SA = scoreArm('A  UNCONDITIONAL (every LEGAL flip on a class edge, worst-dihedral-first)', RA);
scores.push(SA);
const NA = RA.acc.length;

// ── ARM B ────────────────────────────────────────────────────────────────────────────────────────
const RB = runArm(cand, true, 0);
const SB = scoreArm('B  GUARDED (C1: the pair max normDeg must strictly decrease)', RB);
scores.push(SB);
const NB = RB.acc.length;

// ── CONTROL C7: REPRODUCTION ACROSS THE C5 SCOPE FIX ──────────────────────────────────────────────
// The first run of this tool VOIDED at the placebo arm because C5's partition was scoped to the class
// target set U. The fix changed the CONTROL, not the operator — so arms A and B must come back with
// byte-identical accept counts and PRIMARY ratios. If they do not, the fix touched the measurement and
// nothing here is quotable.
{
  const ok = RA.acc.length === 42050 && RB.acc.length === 20580
    && Math.abs(SA.primaryX - 0.99327) < 5e-5 && Math.abs(SB.primaryX - 1.03393) < 5e-5;
  log('── CONTROL C7: REPRODUCTION across the C5 scope fix (pre-fix run: A 42050 flips @ 0.99327x, B 20580 @ 1.03393x) ──');
  log(`  now: A ${RA.acc.length} flips @ ${SA.primaryX.toFixed(5)}x   B ${RB.acc.length} flips @ ${SB.primaryX.toFixed(5)}x   ${ok ? 'REPRODUCES — the fix touched the control, not the operator' : '*** DIFFERS — the fix moved the measurement, VOID ***'}`);
  if (!ok) process.exit(10);
}
log('');

// ── ARM P1: PLACEBO-GLOBAL, cost-matched to A ────────────────────────────────────────────────────
{
  const rnd = rng(SEED);
  const perm = edges.slice();
  for (let i = perm.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  log(`(placebo P1 draw: uniform over all ${edges.length} interior edges, seed ${SEED}, cost-matched to arm A's ${NA} flips)`);
  const RP = runArm(perm, false, NA);
  scores.push(scoreArm(`P1 PLACEBO-GLOBAL (random legal edges, cost-matched to A = ${NA} flips)`, RP));
}

// ── ARM P2: PLACEBO-INCLASS, cost-matched to B ───────────────────────────────────────────────────
{
  const rnd = rng(SEED ^ 0x5bf03635);
  const perm = cand.slice();
  for (let i = perm.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  log(`(placebo P2 draw: uniform over the ${cand.length} CLASS edges, seed ${SEED ^ 0x5bf03635}, cost-matched to arm B's ${NB} flips)`);
  const RP = runArm(perm, false, NB);
  scores.push(scoreArm(`P2 PLACEBO-INCLASS (random class edges, cost-matched to B = ${NB} flips)`, RP));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SCARS 1-3 — h, k, inset sweeps on the R2 headline, on a PINNED PAIRED sample of arm A's moved facets
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('SCARS 1-3 — h / k / inset SWEEPS on the R2 (covering-ruler) headline, arm A');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
{
  const moved: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (RA.touched[f] === 1) moved.push(f);
  const rnd = rng(SEED ^ 0x1234abcd);
  const samp: number[] = [];
  if (moved.length <= SWEEP_N) samp.push(...moved);
  else {
    const seen = new Set<number>();
    while (samp.length < SWEEP_N) { const j = Math.floor(rnd() * moved.length); if (!seen.has(j)) { seen.add(j); samp.push(moved[j]); } }
  }
  log(`  PINNED PAIRED SAMPLE: ${samp.length} of arm A's ${moved.length} moved facets. The SAME facet list at every`);
  log('  rung, before and after, so the RATIO carries no sampling noise at all — only the level does.');
  log('');
  const run = (inset: number, k: number, h: number): { p50B: number; p50A: number; overB: number; overA: number; ratio: number; maxB: number; maxA: number } => {
    let sB = 0; let sA = 0; let mB = 0; let mA = 0;
    const bs: number[] = []; const as: number[] = [];
    for (const f of samp) {
      const b = normDegOf(xyz0, f, inset, k, h); const a = normDegOf(RA.xyz, f, inset, k, h);
      bs.push(b); as.push(a);
      if (b > 5) sB += d0.areaMm2[f];
      if (a > 5) sA += d0.areaMm2[f];
      if (b > mB) mB = b;
      if (a > mA) mA = a;
    }
    return { p50B: q(bs, 0.5), p50A: q(as, 0.5), overB: sB, overA: sA, ratio: sA > 0 ? sB / sA : Infinity, maxB: mB, maxA: mA };
  };
  log(`  ── SCAR 3: the h-LADDER (inset ${INSET_REF}, k=${K_REF}). A NUMBER THAT MOVES WITH h IS NOT A MEASUREMENT. ──`);
  log('     h            normDeg p50 B -> A      over-5deg AREA B -> A (mm2)     ratio      MAX B -> A');
  const hs = [2e-8, 2e-7, 2e-6, 2e-5, 2e-4, 1e-3];
  const hRat: number[] = [];
  for (const h of hs) {
    const r = run(INSET_REF, K_REF, h);
    hRat.push(r.ratio);
    log(`     ${h.toExponential(0).padStart(8)}     ${f2(r.p50B).padStart(7)} -> ${f2(r.p50A).padStart(7)}       ${r.overB.toFixed(4).padStart(9)} -> ${r.overA.toFixed(4).padStart(9)}      ${r.ratio.toFixed(4).padStart(7)}x   ${f2(r.maxB).padStart(6)} -> ${f2(r.maxA).padStart(6)}`);
  }
  const fin = hRat.filter(Number.isFinite);
  const hStab = fin.length > 0 ? Math.max(...fin) / Math.min(...fin) : NaN;
  log(`     h-STABILITY of the RATIO across the whole ladder: ${f4(hStab)}x    ${hStab < 1.1 ? 'h-STABLE — quotable' : '*** h-UNSTABLE — the ratio is an artefact of the step, DO NOT QUOTE ***'}`);
  const fin3 = hRat.slice(0, 3).filter(Number.isFinite);
  log(`     h-STABILITY over the CONVERGED rungs (2e-8..2e-6): ${f4(fin3.length > 0 ? Math.max(...fin3) / Math.min(...fin3) : NaN)}x`);
  log('');
  log(`  ── SCAR 2: the k-LADDER (inset ${INSET_REF}, h=${H_REF}). spreadRad is NOT quoted: it does not converge in k. ──`);
  log('     k        normDeg p50 B -> A      over-5deg AREA B -> A (mm2)     ratio      MAX B -> A');
  const kRat: number[] = [];
  for (const k of [4, 8, 16, 32]) {
    const r = run(INSET_REF, k, H_REF);
    kRat.push(r.ratio);
    log(`     ${String(k).padStart(3)}      ${f2(r.p50B).padStart(7)} -> ${f2(r.p50A).padStart(7)}       ${r.overB.toFixed(4).padStart(9)} -> ${r.overA.toFixed(4).padStart(9)}      ${r.ratio.toFixed(4).padStart(7)}x   ${f2(r.maxB).padStart(6)} -> ${f2(r.maxA).padStart(6)}`);
  }
  const kf = kRat.filter(Number.isFinite);
  log(`     k-STABILITY of the RATIO: ${f4(kf.length > 0 ? Math.max(...kf) / Math.min(...kf) : NaN)}x`);
  log('');
  log(`  ── SCAR 1: the inset SWEEP (k=${K_REF}, h=${H_REF}). The default is 0; the honest value on crease classes is 0.05. ──`);
  log('     inset    normDeg p50 B -> A      over-5deg AREA B -> A (mm2)     ratio      MAX B -> A');
  const iRat: number[] = [];
  for (const ins of [0, 0.02, 0.05, 0.10]) {
    const r = run(ins, K_REF, H_REF);
    iRat.push(r.ratio);
    log(`     ${ins.toFixed(2).padStart(5)}    ${f2(r.p50B).padStart(7)} -> ${f2(r.p50A).padStart(7)}       ${r.overB.toFixed(4).padStart(9)} -> ${r.overA.toFixed(4).padStart(9)}      ${r.ratio.toFixed(4).padStart(7)}x   ${f2(r.maxB).padStart(6)} -> ${f2(r.maxA).padStart(6)}`);
  }
  const inf = iRat.filter(Number.isFinite);
  log(`     inset-STABILITY of the RATIO: ${f4(inf.length > 0 ? Math.max(...inf) / Math.min(...inf) : NaN)}x`);
  (globalThis as unknown as { __sweep: unknown }).__sweep = { hs, hRat, kRat, iRat, hStab, n: samp.length };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// VERDICT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('THE VERDICT TABLE — every arm, one row, R1 (PRIMARY) and R2 side by side');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('  ARM                                                flips   R1 whole-mesh over-45 AREA mm2      R1 x     R2 over-5 AREA (moved)   R2 x');
for (const s of scores) {
  const b = cM0[String(HI_DEG)]; const a = s.mesh[String(HI_DEG)];
  const r2 = s.ndU.find((x) => x.bar === 5);
  log(`  ${s.name.slice(0, 46).padEnd(48)} ${String(s.accepted).padStart(6)}   ${b.area.toFixed(4).padStart(10)} -> ${a.area.toFixed(4).padStart(10)}   ${s.primaryX.toFixed(4).padStart(8)}x   ${(r2 ? r2.aB.toFixed(4) : 'n/a').padStart(10)} -> ${(r2 ? r2.aA.toFixed(4) : 'n/a').padStart(10)}  ${(r2 && r2.aA > 0 ? (r2.aB / r2.aA).toFixed(4) : 'n/a').padStart(8)}x`);
}
log('');
const bestPlacebo = mx(scores.filter((s) => s.name.startsWith('P')).map((s) => s.reduction));
for (const s of scores.filter((x) => !x.name.startsWith('P'))) {
  const arm = s.name.slice(0, 1);
  const primaryPass = s.primaryX >= KILL_X;
  const placeboPass = bestPlacebo <= 0 ? s.reduction > 0 : s.reduction >= PLACEBO_X * bestPlacebo;
  const floor1 = true;
  const floor2 = s.mesh[String(HI_DEG)].area <= cM0[String(HI_DEG)].area;
  const floor3 = s.overWorse === 0;
  const floor4 = s.topo.nonMan === d0.nonManifoldEdges && s.topo.boundary === d0.boundaryEdges && s.topo.incons <= d0.inconsistentEdges;
  const floor5 = s.posMaxDelta <= POS_BAR_MM;
  const verdict = primaryPass && placeboPass && floor1 && floor2 && floor3 && floor4 && floor5 ? 'CONFIRMED' : 'REFUTED';
  log(`══ VERDICT — ARM ${arm} ══`);
  log(`  PRIMARY  whole-mesh over-${HI_DEG} AREA ${cM0[String(HI_DEG)].area.toFixed(4)} -> ${s.mesh[String(HI_DEG)].area.toFixed(4)} mm2 = ${s.primaryX.toFixed(4)}x   ${primaryPass ? 'PASS' : 'FAIL'} (need >= ${KILL_X.toFixed(1)}x)`);
  log(`  PLACEBO  reduction ${s.reduction.toFixed(4)} mm2 vs best placebo ${bestPlacebo.toFixed(4)} mm2   ${placeboPass ? 'PASS' : 'FAIL'} (need >= ${PLACEBO_X.toFixed(1)}x the placebo)`);
  log(`  FLOOR-1  triangles ${nTri} -> ${nTri}   PASS`);
  log(`  FLOOR-2  whole-mesh AREA did not increase   ${floor2 ? 'PASS' : 'FAIL'}`);
  log(`  FLOOR-3  ${s.overWorse} facets over +${WORSE_DEG} deg normDeg, worst +${f2(s.worstUp)} deg   ${floor3 ? 'PASS' : 'FAIL'}`);
  log(`  FLOOR-4  nonManifold ${s.topo.nonMan} boundary ${s.topo.boundary} inconsistent ${d0.inconsistentEdges} -> ${s.topo.incons}   ${floor4 ? 'PASS' : 'FAIL'}`);
  log(`  FLOOR-5  worst new-diagonal position increase ${s.posMaxDelta.toExponential(3)} mm (bar ${POS_BAR_MM})   ${floor5 ? 'PASS' : 'FAIL'}`);
  log(`  *** ARM ${arm} => ${verdict} ***`);
  log('');
}
writeFileSync(`${OUTDIR}/S115_OPFLIP_${TAG}.json`, `${JSON.stringify({
  stl: STL, style: STYLE, dims: DIMS, k: K_REF, inset: INSET_REF, h: H_REF, hiDeg: HI_DEG, arCap: AR_CAP,
  killX: KILL_X, placeboX: PLACEBO_X, worseDeg: WORSE_DEG, posBarMm: POS_BAR_MM, seed: SEED,
  nTri, meshArea0, interiorEdges: d0.interiorEdges, candidates: cand.length, targetFacets: U.length,
  probeFacets: probe.length, barsBefore: cM0, arms: scores, sweep: (globalThis as unknown as { __sweep: unknown }).__sweep,
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S115_OPFLIP_${TAG}.json`);
log(`done ${el()}`);
