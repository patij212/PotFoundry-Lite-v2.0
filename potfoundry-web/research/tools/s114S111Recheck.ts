// s114S111Recheck.ts — DOES S111's "~12% OF THE VISIBLE CLASS IS TURN THE MESH ADDS" SURVIVE A
// CORRECTED INSTRUMENT? And if it does, WHAT IS THE MECHANISM?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS UNDER TEST
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S111 censused the 4,158 crease-free pairs of Gothic's >45 deg dihedral class and reported, per pair,
// `measured dihedral / footprint-max analytic turn`:  p50 2.38, 38.12% <= 1.5x ("the surface explains
// it"), 55.63% > 2x ("the mesh adds turn"). The campaign has carried the second number as an
// UNIDENTIFIED MECHANISM for four sessions.
//
// *** S111's PROBE HAS TWO KNOWN DEFECTS, BOTH DOCUMENTED IN THE RULER IT DID NOT USE. ***
//   (D1) It sampled a barycentric lattice INCLUDING THE FACET VERTICES with NO INSET. S112 measured that
//        a crease-conformed mesh puts its vertices ON the crease on purpose, where a finite-difference
//        normal is ill-defined; normDeg moves 64x across inset 0 -> 0.05 on this very mesh
//        (157.079 -> 2.442 deg, S112_ANGDECOMP_GOTH.report.txt:84-87).
//   (D2) It used `fdNormalsCentral`, which at a C0 crease returns the AVERAGE of the two flanks
//        (`orientRuler.ts` defect (3)) instead of both of them.
//
// AND THE TWO DEFECTS PUSH THE VERDICT IN OPPOSITE DIRECTIONS, which is why this has to be a SWEEP and
// not a fix:
//   * INSET shrinks the sampled region => footprint-max can only FALL => the ratio RISES => the
//     "mesh adds turn" class GROWS.
//   * KINK-AWARENESS returns both flanks wherever a probe window straddles a locus => footprint-max
//     RISES => the ratio FALLS => the class SHRINKS.
// Guessing which dominates is exactly the move this campaign has been burned by. Both are swept, on the
// same 4,158 pairs, against S111's own arm reproduced VERBATIM as the control.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE THEOREM THAT MAKES THE ANSWER SOUND RATHER THAN A RATIO OF TWO LOWER BOUNDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `footprint-max` is a MAX OVER SAMPLED POINTS, i.e. a LOWER bound on the true normal-cone opening. A
// ratio whose denominator is a lower bound is one-sided, and a one-sided bar is satisfied by a degenerate
// answer — the exact failure mode this project priced on 2026-08-05. So the ratio ALONE cannot decide.
//
// It does not have to. For unit vectors, for ANY p in lattice(F1) and q in lattice(F2):
//
//     angle(f1,f2) <= angle(f1,n(p)) + angle(n(p),n(q)) + angle(n(q),f2)
//                  <= normDeg(F1) + footMax + normDeg(F2)                      ... (T)
//
// so  EXCESS := measured - footMax  satisfies  EXCESS <= normDeg1 + normDeg2  IDENTICALLY, provided all
// three are computed on the SAME lattice/sampler/inset. (T) is therefore run as a HARD CONTROL: a single
// violation means the instruments disagree and the run is VOID.
//
// And (T) FORCES the interpretation. Every pair here has measured > 45 deg by selection. If the ratio
// exceeds 2 then footMax < measured/2, so EXCESS > 22.5 deg, so normDeg1 + normDeg2 > 22.5 deg, so
//     *** max(normDeg1, normDeg2) > 11.25 deg IS FORCED BY ARITHMETIC ON A WITNESS. ***
// `normDeg` is a witnessed sup over points strictly INSIDE the footprint (inset > 0): it is SOUND FOR
// REFUSALS. So a surviving >2x class is not a probe artefact — those facet planes really do sit more
// than 11 deg away from every analytic normal over their own footprint. That converts "mesh adds turn"
// from a label into a refutable geometric claim, and it is what the mechanism hunt is aimed at.
//
// ⚠ THE ONE ESCAPE HATCH, AND IT IS SCOPED, NOT WAVED AWAY. `normDeg` compares against rA's normal, and
// rA HAS no normal on a facet that is not a graph of rA (S112's CURTAIN class: 33.14% of the >45 deg
// class at graphRatio cut 8x). Every population below is reported WALL / CURTAIN separately, with the
// cut swept, exactly as S112/S103 did. A cliff that turns 90 deg is a feature, not a defect.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, BEFORE THE FIRST RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// R1 — CONTROL. The S111-VERBATIM arm must reproduce 38.12% <=1.5x and 55.63% >2x to within 0.5 points
//      on the same STL. If it does not, my rebuild of the residual set is not S111's and the run is VOID.
// R2 — DIRECTION. I predict the corrected instrument makes the >2x class LARGER, not smaller, because
//      the inset correction is worth 64x on this mesh and the kink correction was measured at 1.003x
//      (S112's sampler ladder). Written down so the run can falsify me: if it SHRINKS below 20%, the
//      label is closed as an instrument artefact and I say so plainly.
// R3 — MECHANISM. If the class survives, exactly one of these must carry it, and each is measured with
//      COUNT + AREA + MAX against a whole-mesh control, never asserted:
//        (a) vertices off the analytic surface   -> per-vertex |r_mesh - rA|, vs the EXHAUSTIVE mesh max
//        (b) parameter-degenerate facets         -> min altitude / aspect ratio in the (r*th, z) plane
//        (c) non-manifold / T-junction neighbours-> boundary + 3+-facet edges incident to the facet
//        (d) hub / high-valence vertices         -> max incident-facet count over the facet's vertices
//      *** KILL LINE: if none of (a)-(d) separates the class from the control by >= 2x at the median,
//      the mechanism is NOT identified and this tool reports UNKNOWN. It does not get to pick a story. ***
//
// NEGATIVE CONTROL / PLACEBO ARM. The whole ratio machinery also runs on a size-matched sample of
// MID-dihedral pairs (5-45 deg — the part of the mesh nobody calls defective). If the >2x share is the
// same there, the ratio is not measuring defect at all and every number above it is uninterpretable.
//
// Usage: bash research/tools/run-s114-recheck.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, fdNormalsCentral, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114_STYLE ?? 'GothicArches';
const STL = process.env.PF_S114_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S114_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S114_HI_DEG', 45);
const CURTAIN_RATIO = envF('PF_S114_CURTAIN', 8);
const K_PRIMARY = Math.round(envF('PF_S114_K', 8));
const INSET_PRIMARY = envF('PF_S114_INSET', 0.05);
const SUB16 = Math.round(envF('PF_S114_SUB16', 800));   // subsample for the expensive k=16 rung
const LIMIT = Math.round(envF('PF_S114_LIMIT', 0));     // >0 truncates the census: SMOKE ONLY, never a result
const DIMS: StyleDims = { H: envF('PF_S114_H', 120), Rb: envF('PF_S114_RB', 40), Rt: envF('PF_S114_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/recheck';

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

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink: NormalSampler = fdNormals(rA, H, 2e-4, 2e-4);
const nsCentral: NormalSampler = fdNormalsCentral(rA, H, 2e-4, 2e-4);

log('===== S114 — RE-RUNNING S111\'s DICHOTOMY ON A CORRECTED INSTRUMENT =====');
log(`style ${STYLE}  tag ${TAG}  STL ${STL}`);
log(`high cut ${HI_DEG} deg   primary k=${K_PRIMARY}  inset=${INSET_PRIMARY}  curtain cut ${CURTAIN_RATIO}x`);
log('Under test: S111\'s "55.63% > 2x = the mesh adds turn". Read this file\'s header for the theorem');
log('that turns the ratio into a sound claim, and for the pre-registration R1/R2/R3.');
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
// ── PRECOND. Stride sample FOR COMPARABILITY with every prior session, then the EXHAUSTIVE max, which
// no prior session ran and which the mechanism hunt needs (a stride sample cannot see a rare bad vertex).
let precondStrideUm = 0; let precondAllUm = 0;
{
  const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > precondStrideUm) precondStrideUm = dd;
  }
  precondStrideUm *= 1000;
  log(`PRECOND radial MAX |r_mesh - rA| (stride sample, ~20k facets) = ${precondStrideUm.toFixed(4)} um`);
  if (precondStrideUm > 50) { log('*** REFUSING THE MESH: params/dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2   interior ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent-winding ${d.inconsistentEdges}   ${el()}`);
log('');

// ══════════════════════════════ per-facet geometry helpers ══════════════════════════════
const V = new Float64Array(9);
const loadV = (f: number): void => { for (let i = 0; i < 9; i += 1) V[i] = xyz[f * 9 + i]; };
/** unwrapped theta of the three vertices, on ONE branch — orientOfFacet's stated precondition. */
const TH = new Float64Array(3);
const loadTh = (): void => {
  TH[0] = Math.atan2(V[1], V[0]);
  TH[1] = TH[0] + dThRaw(TH[0], Math.atan2(V[4], V[3]));
  TH[2] = TH[0] + dThRaw(TH[0], Math.atan2(V[7], V[6]));
};
const rRefOf = (): number => (Math.hypot(V[0], V[1]) + Math.hypot(V[3], V[4]) + Math.hypot(V[6], V[7])) / 3;

/** 3D area / (r*theta, z) parameter area. Diverges on a vertical curtain, where rA has no normal. */
function graphRatio(f: number): number {
  loadV(f); loadTh();
  const ux = V[3] - V[0]; const uy = V[4] - V[1]; const uz = V[5] - V[2];
  const wx = V[6] - V[0]; const wy = V[7] - V[1]; const wz = V[8] - V[2];
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const rr = rRefOf();
  const aP = 0.5 * Math.abs((rr * (TH[1] - TH[0])) * (V[8] - V[2]) - (V[5] - V[2]) * (rr * (TH[2] - TH[0])));
  return aP > 1e-15 ? a3 / aP : Infinity;
}

// ══════════════════════════════ the two footprint probes ══════════════════════════════
const LATMAX = 16;
const MAXPTS = 2 * (((LATMAX + 1) * (LATMAX + 2)) / 2);
const NB = new Float64Array(3 * 4 * MAXPTS);
const SC = new Float64Array(12);

/**
 * CORRECTED PROBE. Order-k barycentric lattice in the PARAMETER plane (the footprint orientOfFacet uses),
 * shrunk toward the centroid by `inset`, pooled over BOTH facets, every candidate normal kept.
 * Returns the number of normals written into NB.
 */
function collectPar(f1: number, f2: number, ns: NormalSampler, k: number, inset: number): number {
  let n = 0;
  const sh = 1 - inset; const sc = inset / 3;
  const ff = [f1, f2];
  for (let t = 0; t < 2; t += 1) {
    loadV(ff[t]); loadTh();
    const ath = TH[0]; const bth = TH[1]; const cth = TH[2];
    const az = V[2]; const bz = V[5]; const cz = V[8];
    for (let i = 0; i <= k; i += 1) {
      for (let j = 0; i + j <= k; j += 1) {
        const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
        const nc = ns(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz, SC);
        for (let qq = 0; qq < nc; qq += 1) {
          NB[3 * n] = SC[3 * qq]; NB[3 * n + 1] = SC[3 * qq + 1]; NB[3 * n + 2] = SC[3 * qq + 2]; n += 1;
        }
      }
    }
  }
  return n;
}

/**
 * S111's PROBE, VERBATIM (s111ResidualCensus.ts:224-245): order-4 lattice interpolated in 3D CARTESIAN
 * space, theta recovered by atan2, `fdNormalsCentral`, NO inset. Kept exactly so R1 can be checked.
 */
function collectS111(f1: number, f2: number): number {
  let n = 0;
  const LAT = 4;
  const ff = [f1, f2];
  for (let t = 0; t < 2; t += 1) {
    loadV(ff[t]);
    for (let i = 0; i <= LAT; i += 1) {
      for (let j = 0; j <= LAT - i; j += 1) {
        const wa = i / LAT; const wb = j / LAT; const wc = 1 - wa - wb;
        const px = wa * V[0] + wb * V[3] + wc * V[6];
        const py = wa * V[1] + wb * V[4] + wc * V[7];
        const pz = wa * V[2] + wb * V[5] + wc * V[8];
        nsCentral(Math.atan2(py, px), Math.min(H, Math.max(0, pz)), SC);
        NB[3 * n] = SC[0]; NB[3 * n + 1] = SC[1]; NB[3 * n + 2] = SC[2]; n += 1;
      }
    }
  }
  return n;
}

/** EXACT diameter of the normal set in NB, in degrees. O(n^2), no acos in the loop. */
function diamDeg(n: number): number {
  let mn = 1;
  for (let i = 0; i < n; i += 1) {
    const ax = NB[3 * i]; const ay = NB[3 * i + 1]; const az = NB[3 * i + 2];
    for (let j = i + 1; j < n; j += 1) {
      const dd = ax * NB[3 * j] + ay * NB[3 * j + 1] + az * NB[3 * j + 2];
      if (dd < mn) mn = dd;
    }
  }
  if (mn > 1) mn = 1; else if (mn < -1) mn = -1;
  return (Math.acos(mn) * 180) / Math.PI;
}

// ══════════════════════════════ REBUILD S111's RESIDUAL SET ══════════════════════════════
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
const centroid = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
const hiThr = (HI_DEG * Math.PI) / 180;
const resE: number[] = [];        // the residual edge ids, in S111's own order
let nHigh = 0;
const midE: number[] = [];        // PLACEBO ARM: 5-45 deg pairs, the "visibly fine" mesh
const midLo = (5 * Math.PI) / 180;
// *** S111's SELECTION, LINE FOR LINE (s111ResidualCensus.ts:142-167), including its three `continue`s.
// A pair with no shared endpoint pair, or a zero-length centroid segment, is DROPPED by S111 — it is
// neither crease-labelled nor residual. Reproducing that exactly is what makes R1 a real control. ***
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  const a = d.edgeAngRad[e];
  if (!(a > hiThr)) { if (a >= midLo) midE.push(e); continue; }
  nHigh += 1;
  const p = sharedEndpoints(e); if (p === null) continue;
  const th0 = Math.atan2(p[1], p[0]);
  const kEdge = locateKinkRaw(rA, th0, p[2], th0 + dThRaw(th0, Math.atan2(p[4], p[3])), p[5], PRED);
  if (kEdge !== null && !kEdge.jump) continue;                     // crease on the shared edge
  const c1 = centroid(d.edgeF1[e]); const c2 = centroid(d.edgeF2[e]);
  const thc = Math.atan2(c1[1], c1[0]);
  const kSeg = locateKinkRaw(rA, thc, c1[2], thc + dThRaw(thc, Math.atan2(c2[1], c2[0])), c2[2], PRED);
  if (kSeg !== null && !kSeg.jump) continue;                       // crease on the centroid segment
  if (!(Math.hypot(c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]) > 0)) continue;
  resE.push(e);
}
if (LIMIT > 0 && resE.length > LIMIT) { resE.length = LIMIT; log(`*** SMOKE MODE: residual truncated to ${LIMIT} pairs. NOT A RESULT. ***`); }
log(`high-dihedral pairs (>${HI_DEG} deg) ${nHigh}   RESIDUAL (no crease on either locus) ${resE.length}   ${el()}`);
log(`  S111 published highPairs 19582, residual 4158 on this STL.`);
const R1a = nHigh === 19582 && resE.length === 4158;
log(`  ${R1a ? '[R1 set-rebuild PASS] the residual set is S111\'s, facet for facet.'
  : '*** R1 SET-REBUILD FAILED — this is not S111\'s population. Every comparison below is VOID. ***'}`);
log('');

const areaOfPairs = (es: number[]): number => {
  const s = new Set<number>();
  for (const e of es) { s.add(d.edgeF1[e]); s.add(d.edgeF2[e]); }
  let a = 0; for (const f of s) a += d.areaMm2[f];
  return a;
};
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const measDegOf = (e: number): number => (d.edgeAngRad[e] * 180) / Math.PI;

// AREA — the number S111 never printed. A bare count over-states defect area 13-184x in this project.
{
  const ar = areaOfPairs(resE);
  log('── THE RESIDUAL CLASS, WITH THE AREA S111 OMITTED ──');
  log(`  COUNT ${resE.length} pairs   AREA (unique facets) ${ar.toFixed(4)} mm2 = ${((ar / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`  measured dihedral p50 ${q(resE.map(measDegOf), 0.5).toFixed(2)}  p90 ${q(resE.map(measDegOf), 0.9).toFixed(2)}  MAX ${Math.max(...resE.map(measDegOf)).toFixed(2)} deg`);
  const hiAll: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] > hiThr) hiAll.push(e);
  log(`  the whole >45 deg class for reference: ${hiAll.length} pairs, AREA ${((areaOfPairs(hiAll) / meshArea) * 100).toFixed(4)}% of mesh`);
  log('');
}

// ══════════════════════════════ THE RATIO, ARM BY ARM ══════════════════════════════
interface ArmOut { name: string; ratios: number[]; footMax: number[]; infN: number }

function runArm(name: string, es: number[], fn: (e: number) => number): ArmOut {
  const ratios: number[] = []; const footMax: number[] = []; let infN = 0;
  for (const e of es) {
    const fm = fn(e);
    footMax.push(fm);
    const m = measDegOf(e);
    if (fm > 1e-9) ratios.push(m / fm); else { ratios.push(Infinity); infN += 1; }
  }
  return { name, ratios, footMax, infN };
}

/** COUNT + AREA + MAX for one arm — never a bare count, never a bare max. */
function reportArm(a: ArmOut, es: number[]): { under: number; over: number; overAreaPct: number } {
  const fin = a.ratios.filter(Number.isFinite);
  let under = 0; let over = 0;
  const overE: number[] = []; const underE: number[] = [];
  for (let i = 0; i < a.ratios.length; i += 1) {
    const r = a.ratios[i];
    if (r <= 1.5) { under += 1; underE.push(es[i]); }
    if (r > 2) { over += 1; overE.push(es[i]); }
  }
  const overArea = areaOfPairs(overE); const underArea = areaOfPairs(underE);
  const n = fin.length;
  log(`  ${a.name}`);
  log(`     footprint-max deg  p10 ${q(a.footMax, 0.1).toFixed(2).padStart(7)} p50 ${q(a.footMax, 0.5).toFixed(2).padStart(7)} p90 ${q(a.footMax, 0.9).toFixed(2).padStart(7)}`);
  log(`     ratio meas/foot    p10 ${q(fin, 0.1).toFixed(3).padStart(7)} p25 ${q(fin, 0.25).toFixed(3).padStart(7)} p50 ${q(fin, 0.5).toFixed(3).padStart(7)} p75 ${q(fin, 0.75).toFixed(3).padStart(7)} p90 ${q(fin, 0.9).toFixed(3).padStart(7)}  MAX ${(n === 0 ? NaN : Math.max(...fin)).toFixed(2)}   (+${a.infN} with footMax=0, ratio infinite, EXCLUDED from the quantiles exactly as S111 did)`);
  log(`     <=1.5x "surface explains it"  n=${String(under).padStart(5)} (${((under / a.ratios.length) * 100).toFixed(2).padStart(6)}%)  AREA ${underArea.toFixed(4).padStart(9)} mm2 = ${((underArea / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`     > 2x  "the MESH adds turn"    n=${String(over).padStart(5)} (${((over / a.ratios.length) * 100).toFixed(2).padStart(6)}%)  AREA ${overArea.toFixed(4).padStart(9)} mm2 = ${((overArea / meshArea) * 100).toFixed(4)}% of mesh`);
  return { under: (under / a.ratios.length) * 100, over: (over / a.ratios.length) * 100, overAreaPct: (overArea / meshArea) * 100 };
}

log('══════════ ARM 0 — S111 VERBATIM (3D lattice, k=4, fdNormalsCentral, inset 0). THE CONTROL. ══════════');
const arm0 = runArm('S111-VERBATIM', resE, (e) => diamDeg(collectS111(d.edgeF1[e], d.edgeF2[e])));
const r0 = reportArm(arm0, resE);
const R1b = Math.abs(r0.under - 38.12) < 0.5 && Math.abs(r0.over - 55.63) < 0.5;
log(`  R1: S111 published <=1.5x 38.12% and >2x 55.63%.  reproduced ${r0.under.toFixed(2)}% / ${r0.over.toFixed(2)}%`);
log(`  ${R1b ? '[R1 PASS] the control arm reproduces S111 to within 0.5 points. The comparison below is like-for-like.'
  : '*** R1 FAILED — I cannot reproduce S111\'s own numbers with its own code. THE RUN IS VOID; diagnose, do not rescue. ***'}`);
log(`  ${el()}`);
log('');

log('══════════ ARM 1 — THE CORRECTED INSTRUMENT, SWEPT. sampler x inset x k, SAME 4,158 PAIRS. ══════════');
log('  (inset RAISES the ratio by shrinking the probed region; kink-awareness LOWERS it by returning both');
log('   flanks at a locus. Both are swept because guessing which dominates is how this campaign gets burned.)');
const grid: Array<{ smp: string; ins: number; k: number; under: number; over: number; overAreaPct: number; footP50: number; ratP50: number }> = [];
for (const [sname, sfn] of [['central', nsCentral], ['kink   ', nsKink]] as Array<[string, NormalSampler]>) {
  for (const ins of [0, 0.02, 0.05]) {
    for (const kk of [4, K_PRIMARY]) {
      const a = runArm(`sampler=${sname}  inset=${ins.toFixed(2)}  k=${String(kk).padStart(2)}`, resE,
        (e) => diamDeg(collectPar(d.edgeF1[e], d.edgeF2[e], sfn, kk, ins)));
      const rr = reportArm(a, resE);
      grid.push({
        smp: sname.trim(), ins, k: kk, under: rr.under, over: rr.over, overAreaPct: rr.overAreaPct,
        footP50: q(a.footMax, 0.5), ratP50: q(a.ratios.filter(Number.isFinite), 0.5),
      });
      log(`     ${el()}`);
    }
  }
}
log('');
log('  ── THE SWEEP AS ONE TABLE (this is the answer to question 1) ──');
log('     sampler  inset   k   footMax p50   ratio p50   <=1.5x %   >2x %    >2x AREA % of mesh');
for (const g of grid) {
  log(`     ${g.smp.padEnd(8)} ${g.ins.toFixed(2)}  ${String(g.k).padStart(2)}   ${g.footP50.toFixed(2).padStart(10)}   ${g.ratP50.toFixed(3).padStart(9)}   ${g.under.toFixed(2).padStart(8)}   ${g.over.toFixed(2).padStart(6)}   ${g.overAreaPct.toFixed(4).padStart(16)}`);
}
log('');

// k-CONVERGENCE. k=16 on a subsample — the lattice order is a measurement choice too, and an unconverged
// denominator is exactly how a lower bound flatters itself.
{
  const stride = Math.max(1, Math.floor(resE.length / SUB16));
  const sub = resE.filter((_, i) => i % stride === 0).slice(0, SUB16);
  log(`  ── k-CONVERGENCE LADDER (subsample n=${sub.length}; k=16 is O(n^2) in 1,224 normals per pair) ──`);
  log('     sampler  inset    k    footMax p50   ratio p50   >2x %');
  for (const [sname, sfn] of [['central', nsCentral], ['kink   ', nsKink]] as Array<[string, NormalSampler]>) {
    for (const ins of [0, INSET_PRIMARY]) {
      for (const kk of [4, 8, 16]) {
        const a = runArm('', sub, (e) => diamDeg(collectPar(d.edgeF1[e], d.edgeF2[e], sfn, kk, ins)));
        const fin = a.ratios.filter(Number.isFinite);
        const over = a.ratios.filter((r) => r > 2).length;
        log(`     ${sname} ${ins.toFixed(2)}  ${String(kk).padStart(3)}   ${q(a.footMax, 0.5).toFixed(2).padStart(10)}   ${q(fin, 0.5).toFixed(3).padStart(9)}   ${((over / a.ratios.length) * 100).toFixed(2).padStart(6)}`);
      }
    }
  }
  log(`  ${el()}`);
}
log('');

// ══════════════════════════════ PLACEBO ARM ══════════════════════════════
log('══════════ PLACEBO ARM — the SAME ratio on MID-dihedral (5-45 deg) pairs nobody calls defective ══════════');
{
  const stride = Math.max(1, Math.floor(midE.length / resE.length));
  const sub = midE.filter((_, i) => i % stride === 0).slice(0, resE.length);
  const a = runArm(`MID-dihedral 5-45 deg  sampler=kink  inset=${INSET_PRIMARY}  k=${K_PRIMARY}  n=${sub.length}`, sub,
    (e) => diamDeg(collectPar(d.edgeF1[e], d.edgeF2[e], nsKink, K_PRIMARY, INSET_PRIMARY)));
  const pr = reportArm(a, sub);
  log(`  If the >2x share here (${pr.over.toFixed(2)}%) matches the residual class's, the ratio is not measuring`);
  log('  defect and no number above it is interpretable. If it is far lower, the ratio does separate.');
  log(`  ${el()}`);
}
log('');

// ══════════════════════════════ THE THEOREM, AS A HARD CONTROL ══════════════════════════════
// EXCESS = measured - footMax  MUST be <= normDeg1 + normDeg2 on the same lattice. Any violation means my
// two instruments disagree about the same footprint and everything downstream is void.
interface Row {
  e: number; f1: number; f2: number; meas: number; foot: number; ratio: number;
  n1: number; n2: number; spread: number; gr: number;
}
const rows: Row[] = [];
const orScratch = new Float64Array(12);
function normDegOf(f: number, ns: NormalSampler, k: number, inset: number): { nd: number; sp: number } {
  loadV(f); loadTh();
  const o = orientOfFacet(ns, V[0], V[1], V[2], V[3], V[4], V[5], V[6], V[7], V[8], TH[0], TH[1], TH[2],
    { k, orient: 'winding', scratch: orScratch, inset });
  return { nd: o.normDeg, sp: (o.spreadRad * 180) / Math.PI };
}
for (const e of resE) {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const foot = diamDeg(collectPar(f1, f2, nsKink, K_PRIMARY, INSET_PRIMARY));
  const a = normDegOf(f1, nsKink, K_PRIMARY, INSET_PRIMARY);
  const b = normDegOf(f2, nsKink, K_PRIMARY, INSET_PRIMARY);
  rows.push({
    e, f1, f2, meas: measDegOf(e), foot, ratio: foot > 1e-9 ? measDegOf(e) / foot : Infinity,
    n1: a.nd, n2: b.nd, spread: Math.max(a.sp, b.sp), gr: Math.max(graphRatio(f1), graphRatio(f2)),
  });
}
log('══════════ CONTROL (T) — the triangle inequality that ties the two instruments together ══════════');
{
  let viol = 0; let worst = -Infinity;
  for (const r of rows) {
    const slack = (r.n1 + r.n2) - (r.meas - r.foot);
    if (slack < -1e-6) viol += 1;
    if (-slack > worst) worst = -slack;
  }
  log(`  measured - footMax <= normDeg1 + normDeg2 must hold IDENTICALLY (same lattice/sampler/inset).`);
  log(`  violations ${viol} of ${rows.length}   worst overshoot ${worst.toFixed(9)} deg`);
  log(`  ${viol === 0 ? '[CONTROL T PASS] the footprint probe and the orientation ruler agree on every pair.'
    : '*** CONTROL T FIRED — the instruments disagree. THE RUN IS VOID. ***'}`);
  log('');
}

// ══════════════════════════════ WALL / CURTAIN SCOPE ══════════════════════════════
const wall = rows.filter((r) => r.gr <= CURTAIN_RATIO);
const curtain = rows.filter((r) => r.gr > CURTAIN_RATIO);
const areaOfRows = (rs: Row[]): number => {
  const s = new Set<number>();
  for (const r of rs) { s.add(r.f1); s.add(r.f2); }
  let a = 0; for (const f of s) a += d.areaMm2[f];
  return a;
};
const rep = (nm: string, rs: Row[]): void => {
  const ar = areaOfRows(rs);
  log(`  ${nm.padEnd(40)} n=${String(rs.length).padStart(5)} (${((rs.length / Math.max(1, rows.length)) * 100).toFixed(2).padStart(6)}%)  AREA ${ar.toFixed(4).padStart(9)} mm2 = ${((ar / meshArea) * 100).toFixed(4)}% of mesh`);
};
log('══════════ SCOPE — is rA even a graph here? (normDeg is UNDEFINED on a curtain facet) ══════════');
rep('WALL    (graph of rA — normDeg SOUND)', wall);
rep('CURTAIN (not a graph — REPORTED only)', curtain);
log('  cut sweep, so no verdict rests on the threshold:');
for (const c of [4, 8, 16, 64]) {
  const cr = rows.filter((r) => r.gr > c);
  log(`    cut ${String(c).padStart(3)}x   curtain n=${String(cr.length).padStart(5)} (${((cr.length / rows.length) * 100).toFixed(2)}%)  AREA ${((areaOfRows(cr) / meshArea) * 100).toFixed(4)}% of mesh`);
}
log('');

// ══════════════════════════════ THE FORCED READING ══════════════════════════════
const over2 = wall.filter((r) => r.ratio > 2);
const under15 = wall.filter((r) => r.ratio <= 1.5);
log('══════════ WHAT THE SURVIVING >2x CLASS IS, BY THEOREM (T) — NOT BY ASSERTION ══════════');
log(`  every pair here has measured > ${HI_DEG} deg, so ratio > 2 forces normDeg1+normDeg2 > ${(HI_DEG / 2).toFixed(1)} deg.`);
rep('>2x  (WALL scope)', over2);
rep('<=1.5x (WALL scope)', under15);
log(`  >2x   normDeg max(f1,f2)  p10 ${q(over2.map((r) => Math.max(r.n1, r.n2)), 0.1).toFixed(2)}  p50 ${q(over2.map((r) => Math.max(r.n1, r.n2)), 0.5).toFixed(2)}  p90 ${q(over2.map((r) => Math.max(r.n1, r.n2)), 0.9).toFixed(2)}  MAX ${(over2.length ? Math.max(...over2.map((r) => Math.max(r.n1, r.n2))) : NaN).toFixed(2)} deg`);
log(`        spreadDeg (surface's own turn) p50 ${q(over2.map((r) => r.spread), 0.5).toFixed(2)}  p90 ${q(over2.map((r) => r.spread), 0.9).toFixed(2)} deg`);
log(`  <=1.5x normDeg max(f1,f2)  p10 ${q(under15.map((r) => Math.max(r.n1, r.n2)), 0.1).toFixed(2)}  p50 ${q(under15.map((r) => Math.max(r.n1, r.n2)), 0.5).toFixed(2)}  p90 ${q(under15.map((r) => Math.max(r.n1, r.n2)), 0.9).toFixed(2)} deg`);
log('  normDeg is a WITNESSED sup over points strictly INSIDE the footprint: sound for refusals. A large');
log('  value is a claim that the facet plane misses every analytic normal over its own footprint.');
log('');

// ══════════════════════════════ MECHANISM: (a) VERTICES OFF THE SURFACE ══════════════════════════════
// EXHAUSTIVE per-vertex |r_mesh - rA| over the whole mesh, so the class can be compared to a real max and
// not to a stride sample that cannot see a rare bad vertex.
const vertErrUm = new Float64Array(nTri);
{
  for (let f = 0; f < nTri; f += 1) {
    let w = 0;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > w) w = dd;
    }
    vertErrUm[f] = w * 1000;
    if (w * 1000 > precondAllUm) precondAllUm = w * 1000;
  }
  log(`── MECHANISM (a): are the vertices ON the surface? EXHAUSTIVE per-vertex |r_mesh - rA| ──`);
  log(`  WHOLE MESH (all ${nTri * 3} vertices): MAX ${precondAllUm.toFixed(4)} um   (the stride sample read ${precondStrideUm.toFixed(4)} um)   ${el()}`);
}

// ══════════════════════════════ MECHANISM (b)-(d): shape, manifoldness, valence ══════════════════════════════
// weld by EXACT f32 coordinate equality — the same test dihedralRuler uses, for the same reason.
const vid = new Int32Array(nTri * 3);
let nVert = 0;
{
  const buckets = new Map<number, number[]>();
  const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
  const cx: number[] = []; const cy: number[] = []; const cz: number[] = [];
  for (let v = 0; v < nTri * 3; v += 1) {
    const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
    f32[0] = x; f32[1] = y; f32[2] = z;
    let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35); h |= 0;
    const b = buckets.get(h); let found = -1;
    if (b !== undefined) for (const c of b) if (cx[c] === x && cy[c] === y && cz[c] === z) { found = c; break; }
    if (found < 0) {
      found = nVert; nVert += 1; cx.push(x); cy.push(y); cz.push(z);
      if (b === undefined) buckets.set(h, [found]); else b.push(found);
    }
    vid[v] = found;
  }
}
const valence = new Int32Array(nVert);
for (let v = 0; v < nTri * 3; v += 1) valence[vid[v]] += 1;
const edgeCount = new Map<number, number>();
{
  const SHIFT = 67_108_864;
  const push = (u: number, w: number): void => {
    const k = (u < w ? u : w) * SHIFT + (u < w ? w : u);
    edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
  };
  for (let f = 0; f < nTri; f += 1) {
    const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
    push(a, b); push(b, c); push(c, a);
  }
}
const facetEdgeDefect = (f: number): number => {   // 0 = all three edges are interior (exactly 2 facets)
  const SHIFT = 67_108_864;
  const a = vid[f * 3]; const b = vid[f * 3 + 1]; const c = vid[f * 3 + 2];
  let bad = 0;
  for (const [u, w] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
    const n = edgeCount.get((u < w ? u : w) * SHIFT + (u < w ? w : u)) ?? 0;
    if (n !== 2) bad += 1;
  }
  return bad;
};
const maxValence = (f: number): number => Math.max(valence[vid[f * 3]], valence[vid[f * 3 + 1]], valence[vid[f * 3 + 2]]);
/** min altitude of the facet in the (rRef*theta, z) PARAMETER plane, in mm, and the 3D aspect ratio. */
function shapeOf(f: number): { paramAltUm: number; alt3dUm: number; aspect: number } {
  loadV(f); loadTh();
  const rr = rRefOf();
  const p0x = rr * TH[0]; const p1x = rr * TH[1]; const p2x = rr * TH[2];
  const p0y = V[2]; const p1y = V[5]; const p2y = V[8];
  const a2 = Math.abs((p1x - p0x) * (p2y - p0y) - (p1y - p0y) * (p2x - p0x));
  const eP = Math.max(Math.hypot(p1x - p0x, p1y - p0y), Math.hypot(p2x - p0x, p2y - p0y), Math.hypot(p2x - p1x, p2y - p1y));
  const ux = V[3] - V[0]; const uy = V[4] - V[1]; const uz = V[5] - V[2];
  const wx = V[6] - V[0]; const wy = V[7] - V[1]; const wz = V[8] - V[2];
  const a3 = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const e3 = Math.max(Math.hypot(ux, uy, uz), Math.hypot(wx, wy, wz), Math.hypot(V[6] - V[3], V[7] - V[4], V[8] - V[5]));
  return {
    paramAltUm: eP > 0 ? (a2 / eP) * 1000 : 0,
    alt3dUm: e3 > 0 ? (a3 / e3) * 1000 : 0,
    aspect: a3 > 0 ? (e3 * e3) / a3 : Infinity,
  };
}

log('');
log('══════════ MECHANISM HUNT — R3(a)-(d), each COUNT + AREA + MAX against a whole-mesh control ══════════');
{
  // control population: an evenly-spread whole-mesh facet sample of the same size as the >2x class.
  const nCtl = Math.max(200, over2.length * 2);
  const stride = Math.max(1, Math.floor(nTri / nCtl));
  const ctlF: number[] = [];
  for (let f = 0; f < nTri && ctlF.length < nCtl; f += stride) ctlF.push(f);
  const facetsOf = (rs: Row[]): number[] => Array.from(new Set(rs.flatMap((r) => [r.f1, r.f2])));
  const popOver = facetsOf(over2); const popUnder = facetsOf(under15);
  const areaOfF = (fs: number[]): number => fs.reduce((s, f) => s + d.areaMm2[f], 0);

  const metric = (label: string, fn: (f: number) => number, unit: string): void => {
    const line = (nm: string, fs: number[]): void => {
      const v = fs.map(fn);
      log(`     ${nm.padEnd(22)} n=${String(fs.length).padStart(5)}  AREA ${((areaOfF(fs) / meshArea) * 100).toFixed(4).padStart(8)}%   p50 ${q(v, 0.5).toFixed(4).padStart(11)}  p90 ${q(v, 0.9).toFixed(4).padStart(11)}  MAX ${(fs.length ? Math.max(...v.filter(Number.isFinite)) : NaN).toFixed(4).padStart(12)} ${unit}`);
    };
    log(`  ${label}`);
    line('>2x  (mesh-adds)', popOver);
    line('<=1.5x (surface)', popUnder);
    line('WHOLE-MESH control', ctlF);
    const a = q(popOver.map(fn), 0.5); const b = q(ctlF.map(fn), 0.5);
    const sep = a > b ? a / Math.max(1e-12, b) : b / Math.max(1e-12, a);
    log(`     separation at the median vs control: ${Number.isFinite(sep) ? `${sep.toFixed(2)}x` : 'inf'}   ${sep >= 2 ? '<= R3 THRESHOLD MET' : '(below the 2x R3 threshold)'}`);
    log('');
  };
  metric('(a) |r_mesh - rA| over the facet\'s 3 vertices', (f) => vertErrUm[f], 'um');
  metric('(b1) min altitude in the (r*th, z) PARAMETER plane', (f) => shapeOf(f).paramAltUm, 'um');
  metric('(b2) min altitude in 3D', (f) => shapeOf(f).alt3dUm, 'um');
  metric('(b3) 3D aspect ratio  (longest edge)^2 / (2*area)', (f) => shapeOf(f).aspect, '');
  metric('(b4) graphRatio  3D area / parameter area', (f) => graphRatio(f), '');
  metric('(c) non-interior edges on the facet (0..3)  [T-junction / crack]', (f) => facetEdgeDefect(f), 'edges');
  metric('(d) max vertex valence  [hub]', (f) => maxValence(f), 'facets');

  // (c) as a share, because a median of 0 hides a real tail.
  const shareBad = (fs: number[]): string => {
    const bad = fs.filter((f) => facetEdgeDefect(f) > 0);
    return `${bad.length}/${fs.length} = ${((bad.length / Math.max(1, fs.length)) * 100).toFixed(3)}%  AREA ${((areaOfF(bad) / meshArea) * 100).toFixed(6)}% of mesh`;
  };
  log('  (c) SHARE with any non-interior edge (a median of 0 hides the tail):');
  log(`     >2x  ${shareBad(popOver)}`);
  log(`     <=1.5x ${shareBad(popUnder)}`);
  log(`     control ${shareBad(ctlF)}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MECHANISM CONFIRMATION — THE SEPARATION SAYS "SLIVER". THAT IS A HYPOTHESIS UNTIL IT PREDICTS.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// R3(a) is REFUTED by an exhaustive check: no vertex on this mesh is more than 0.0310 um off rA. So the
// facets' CORNERS are on the surface and the plane through them is still 66 deg out. The only geometry
// that permits that is SLIVERING: for a triangle inscribed in a curved surface the normal error grows
// like sag / minAltitude, which is UNBOUNDED as the altitude goes to zero even with exact vertices.
//
// Three tests, because "the numbers separate" is not a mechanism:
//   C1 WHOLE-MESH DOSE-RESPONSE. Bin EVERY facet on the mesh by aspect ratio and read normDeg per bin.
//      If slivering is the cause, normDeg must rise with aspect ACROSS THE WHOLE MESH — not only inside
//      the class I selected. A property that only holds on the population I picked is a selection effect.
//   C2 THE WELL-SHAPED SIBLING (a PLACEBO ARM for the shape). For each >2x facet build an EQUILATERAL
//      triangle in the SAME parameter footprint, same centroid, same circumradius, vertices lifted onto
//      the ANALYTIC surface, and measure it with the SAME ruler at the same k/inset. Same surface, same
//      scale, same sampler — only the SHAPE differs. If the sibling reads small, the turn is the shape.
//      If the sibling reads 66 deg too, the surface really does turn there and slivering is REFUTED.
//   C3 FD-STEP SENSITIVITY. On a 6 um sliver the inset margin (~0.1 um) is SMALLER than the sampler's
//      own hArc (0.2 um), so a probe window can reach past the facet edge. Sweep hArc 2e-3/2e-4/2e-5 mm.
//      If normDeg moves with hArc, the reading is the sampler's and not the mesh's, and C1/C2 are void.
function sagUmOf(f: number, k: number, inset: number): number {
  loadV(f); loadTh();
  let fx = (V[4] - V[1]) * (V[8] - V[2]) - (V[5] - V[2]) * (V[7] - V[1]);
  let fy = (V[5] - V[2]) * (V[6] - V[0]) - (V[3] - V[0]) * (V[8] - V[2]);
  let fz = (V[3] - V[0]) * (V[7] - V[1]) - (V[4] - V[1]) * (V[6] - V[0]);
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 0)) return Infinity;
  fx /= fl; fy /= fl; fz /= fl;
  const ox = V[0]; const oy = V[1]; const oz = V[2];
  const ath = TH[0]; const bth = TH[1]; const cth = TH[2];
  const az = V[2]; const bz = V[5]; const cz = V[8];
  const sh = 1 - inset; const sc = inset / 3;
  let mx = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth; const z = wa * az + wb * bz + wc * cz;
      const r = rA(th, z);
      const dd = Math.abs((r * Math.cos(th) - ox) * fx + (r * Math.sin(th) - oy) * fy + (z - oz) * fz);
      if (dd > mx) mx = dd;
    }
  }
  return mx * 1000;
}
/** C2's sibling: an EQUILATERAL triangle on the same parameter footprint, lifted onto rA. */
function siblingNormDeg(f: number, k: number, inset: number): number {
  loadV(f); loadTh();
  const rr = rRefOf();
  const px = [rr * TH[0], rr * TH[1], rr * TH[2]]; const py = [V[2], V[5], V[8]];
  const gx = (px[0] + px[1] + px[2]) / 3; const gy = (py[0] + py[1] + py[2]) / 3;
  let R = 0;
  for (let i = 0; i < 3; i += 1) R += Math.hypot(px[i] - gx, py[i] - gy) / 3;
  if (!(R > 0)) return NaN;
  const vx = new Float64Array(3); const vy = new Float64Array(3); const vz = new Float64Array(3);
  const vth = new Float64Array(3);
  for (let i = 0; i < 3; i += 1) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const th = (gx + R * Math.cos(a)) / rr; const z = gy + R * Math.sin(a);
    const r = rA(th, z);
    vx[i] = r * Math.cos(th); vy[i] = r * Math.sin(th); vz[i] = z; vth[i] = th;
  }
  const o = orientOfFacet(nsKink, vx[0], vy[0], vz[0], vx[1], vy[1], vz[1], vx[2], vy[2], vz[2],
    vth[0], vth[1], vth[2], { k, orient: 'winding', scratch: orScratch, inset });
  // the sibling's winding is arbitrary; report the acute reading so an inverted build cannot fake a hit
  return Math.min(o.normDeg, 180 - o.normDeg);
}

log('══════════ C1 — WHOLE-MESH DOSE-RESPONSE: normDeg AS A FUNCTION OF ASPECT RATIO ══════════');
const aspectAll = new Float64Array(nTri);
{
  for (let f = 0; f < nTri; f += 1) aspectAll[f] = shapeOf(f).aspect;
  const edges = [1, 2, 4, 8, 16, 32, Infinity];
  log('  EVERY facet on the mesh, binned by (longest edge)^2 / (2*area). normDeg on <=300 facets per bin.');
  log('    aspect bin      facets      AREA % of mesh    normDeg p50   p90     MAX      spreadDeg p50   sag p50 um   minAlt3D p50 um');
  for (let b = 0; b < edges.length - 1; b += 1) {
    const lo = edges[b]; const hi = edges[b + 1];
    const ids: number[] = []; let ar = 0; let cnt = 0;
    for (let f = 0; f < nTri; f += 1) {
      if (!(aspectAll[f] >= lo && aspectAll[f] < hi)) continue;
      cnt += 1; ar += d.areaMm2[f]; ids.push(f);
    }
    const stride = Math.max(1, Math.floor(ids.length / 300));
    const sub = ids.filter((_, i) => i % stride === 0).slice(0, 300);
    const nd = sub.map((f) => normDegOf(f, nsKink, K_PRIMARY, INSET_PRIMARY).nd);
    const sp = sub.map((f) => normDegOf(f, nsKink, K_PRIMARY, INSET_PRIMARY).sp);
    const sg = sub.map((f) => sagUmOf(f, K_PRIMARY, INSET_PRIMARY));
    const ma = sub.map((f) => shapeOf(f).alt3dUm);
    log(`    [${String(lo).padStart(3)},${hi === Infinity ? ' inf' : String(hi).padStart(4)})  ${String(cnt).padStart(9)}   ${((ar / meshArea) * 100).toFixed(4).padStart(10)}%   ${q(nd, 0.5).toFixed(2).padStart(11)}  ${q(nd, 0.9).toFixed(2).padStart(7)}  ${(sub.length ? Math.max(...nd) : NaN).toFixed(2).padStart(7)}   ${q(sp, 0.5).toFixed(2).padStart(13)}   ${q(sg, 0.5).toFixed(4).padStart(10)}   ${q(ma, 0.5).toFixed(2).padStart(14)}    (n=${sub.length})`);
  }
  log('  A monotone rise here means the quantity is ASPECT, not class membership — the >2x class is where');
  log('  slivers CONCENTRATE, not a separate mechanism. A flat table refutes slivering outright.');
  // THE ADDRESSABLE POPULATION, mesh-wide — the class this mechanism names, not the class I selected.
  for (const thr of [8, 16, 32]) {
    let cnt = 0; let ar = 0;
    for (let f = 0; f < nTri; f += 1) if (aspectAll[f] >= thr) { cnt += 1; ar += d.areaMm2[f]; }
    log(`  WHOLE MESH aspect >= ${String(thr).padStart(2)}:  ${String(cnt).padStart(7)} facets (${((cnt / nTri) * 100).toFixed(4)}%)   AREA ${ar.toFixed(3).padStart(9)} mm2 = ${((ar / meshArea) * 100).toFixed(4)}% of mesh`);
  }
  // IS THERE A CEILING? Three independent populations above all topped out at 49.96-49.97. If the
  // whole-mesh max also sits just under 50 the distribution is CLIPPED, which is a fact about the
  // producer, not about the surface. Reported as a measurement; this tool does not test causality.
  let amax = 0; let amaxF = -1; let over50 = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (aspectAll[f] > amax) { amax = aspectAll[f]; amaxF = f; }
    if (aspectAll[f] > 50) over50 += 1;
  }
  log(`  WHOLE MESH aspect MAX ${amax.toFixed(4)} (facet ${amaxF})   facets with aspect > 50: ${over50}`);
  log('');
}

log('══════════ C2 — THE WELL-SHAPED SIBLING (placebo for SHAPE: same surface, same scale) ══════════');
{
  const popOver2 = Array.from(new Set(over2.flatMap((r) => [r.f1, r.f2])));
  const stride = Math.max(1, Math.floor(popOver2.length / 1200));
  const sub = popOver2.filter((_, i) => i % stride === 0).slice(0, 1200);
  const act = sub.map((f) => normDegOf(f, nsKink, K_PRIMARY, INSET_PRIMARY).nd);
  const sib = sub.map((f) => siblingNormDeg(f, K_PRIMARY, INSET_PRIMARY));
  const per = act.map((x, i) => (sib[i] > 1e-9 ? x / sib[i] : Infinity));
  log(`  n=${sub.length} facets from the >2x WALL class.`);
  log(`  ACTUAL  facet normDeg  p10 ${q(act, 0.1).toFixed(2)}  p50 ${q(act, 0.5).toFixed(2)}  p90 ${q(act, 0.9).toFixed(2)}  MAX ${Math.max(...act).toFixed(2)} deg`);
  log(`  SIBLING (equilateral, same footprint, on rA) p10 ${q(sib, 0.1).toFixed(2)}  p50 ${q(sib, 0.5).toFixed(2)}  p90 ${q(sib, 0.9).toFixed(2)}  MAX ${Math.max(...sib.filter(Number.isFinite)).toFixed(2)} deg`);
  log(`  PER-FACET actual/sibling  p10 ${q(per, 0.1).toFixed(2)}  p50 ${q(per, 0.5).toFixed(2)}  p90 ${q(per, 0.9).toFixed(2)}`);
  log('  The sibling spans the SAME footprint of the SAME surface with the SAME sampler. If it reads small');
  log('  and the actual facet reads large, the difference IS the shape. If both read large, the surface');
  log('  turns there and slivering is REFUTED — which is why this arm is here.');
  // REACH. A median is not a share: how much of the class does the shape explanation actually cover?
  const areaOfF = (fs: number[]): number => fs.reduce((s, f) => s + d.areaMm2[f], 0);
  const explained = sub.filter((_, i) => per[i] >= 2);
  const unexplained = sub.filter((_, i) => per[i] < 1.25);
  log(`  REACH  shape explains it (actual/sibling >= 2)   n=${explained.length}/${sub.length} = ${((explained.length / sub.length) * 100).toFixed(2)}%   sampled AREA ${areaOfF(explained).toFixed(4)} mm2`);
  log(`         shape does NOT (actual/sibling < 1.25)   n=${unexplained.length}/${sub.length} = ${((unexplained.length / sub.length) * 100).toFixed(2)}%   sampled AREA ${areaOfF(unexplained).toFixed(4)} mm2`);
  // THE CLOSED FORM. For a triangle inscribed in a curved surface the plane tilts by ~ atan(sag/altitude).
  // If that predicts the measured normDeg without a fitted constant, the mechanism is not a story.
  const pred = sub.map((f) => (Math.atan(sagUmOf(f, K_PRIMARY, INSET_PRIMARY) / Math.max(1e-9, shapeOf(f).alt3dUm)) * 180) / Math.PI);
  const mr = act.map((x, i) => (pred[i] > 1e-9 ? x / pred[i] : Infinity));
  log(`  CLOSED FORM  measured normDeg / atan(sag / minAlt3D):  p10 ${q(mr, 0.1).toFixed(2)}  p25 ${q(mr, 0.25).toFixed(2)}  p50 ${q(mr, 0.5).toFixed(2)}  p75 ${q(mr, 0.75).toFixed(2)}  p90 ${q(mr, 0.9).toFixed(2)}`);
  log('  (no fitted constant. ~1 means the sliver formula predicts the angle outright.)');
  log('');
}

log('══════════ C3 — FD-STEP SENSITIVITY (on a 6 um sliver the inset margin is under hArc) ══════════');
{
  const popOver2 = Array.from(new Set(over2.flatMap((r) => [r.f1, r.f2])));
  const stride = Math.max(1, Math.floor(popOver2.length / 600));
  const sub = popOver2.filter((_, i) => i % stride === 0).slice(0, 600);
  log('     hArc=hZ (mm)   normDeg p50    p90       MAX     spreadDeg p50');
  for (const hh of [2e-3, 2e-4, 2e-5, 2e-6]) {
    const ns = fdNormals(rA, H, hh, hh);
    const nd = sub.map((f) => normDegOf(f, ns, K_PRIMARY, INSET_PRIMARY).nd);
    const sp = sub.map((f) => normDegOf(f, ns, K_PRIMARY, INSET_PRIMARY).sp);
    log(`     ${hh.toExponential(0).padStart(9)}     ${q(nd, 0.5).toFixed(3).padStart(9)}  ${q(nd, 0.9).toFixed(3).padStart(8)}  ${Math.max(...nd).toFixed(2).padStart(8)}   ${q(sp, 0.5).toFixed(3).padStart(12)}`);
  }
  log('  If these rows agree, normDeg on this class is a property of the MESH, not of the sampler step.');
  log(`  ${el()}`);
  log('');
}

log('══════════ SUMMARY NUMBERS FOR THE LEDGER ══════════');
{
  const bestGrid = grid.find((g) => g.smp === 'kink' && g.ins === INSET_PRIMARY && g.k === K_PRIMARY);
  log(`  S111 (verbatim, reproduced):        <=1.5x ${r0.under.toFixed(2)}%   >2x ${r0.over.toFixed(2)}%   >2x AREA ${r0.overAreaPct.toFixed(4)}% of mesh`);
  if (bestGrid !== undefined) {
    log(`  CORRECTED (kink, inset ${INSET_PRIMARY}, k=${K_PRIMARY}): <=1.5x ${bestGrid.under.toFixed(2)}%   >2x ${bestGrid.over.toFixed(2)}%   >2x AREA ${bestGrid.overAreaPct.toFixed(4)}% of mesh`);
    log(`  R2 (I predicted the >2x class GROWS): ${bestGrid.over > r0.over ? 'CONFIRMED' : bestGrid.over < 20 ? 'REFUTED — the class collapsed; the label was an instrument artefact' : 'PARTIAL — it moved but did not collapse'}`);
  }
  log(`  >2x class in the WALL scope: n=${over2.length}, AREA ${areaOfRows(over2).toFixed(4)} mm2 = ${((areaOfRows(over2) / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`  whole-mesh EXHAUSTIVE |r_mesh - rA| MAX ${precondAllUm.toFixed(4)} um`);
}

writeFileSync(`${OUTDIR}/S114_RECHECK_${TAG}.json`, `${JSON.stringify({
  style: STYLE, stl: STL, hiDeg: HI_DEG, kPrimary: K_PRIMARY, insetPrimary: INSET_PRIMARY,
  curtainCut: CURTAIN_RATIO, meshFacets: nTri, meshAreaMm2: meshArea,
  precondStrideUm, precondExhaustiveUm: precondAllUm,
  highPairs: nHigh, residual: resE.length, residualAreaMm2: areaOfPairs(resE),
  r1SetRebuild: R1a, r1RatioReproduced: R1b,
  s111Verbatim: r0, grid,
  wallPairs: wall.length, curtainPairs: curtain.length,
  over2Wall: over2.length, over2WallAreaMm2: areaOfRows(over2),
  under15Wall: under15.length, under15WallAreaMm2: areaOfRows(under15),
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S114_RECHECK_${TAG}.json`);
log(`done ${el()}`);
