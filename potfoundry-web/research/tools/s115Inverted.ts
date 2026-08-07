// s115Inverted.ts — S115: THE 2.994% "INVERTED" CLASS ON CelticTriquetra. CENSUS + OPERATOR PRICING.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT S114 ACTUALLY MEASURED, AND WHY THIS TOOL STARTS WITH A DENOMINATOR AUDIT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S114's control C4 read `2,367 of 43,206 = 5.478% by count, 2.994% BY AREA` on CelticTriquetra, against
// a Gothic figure of "0.006-0.013%". Those two numbers have DIFFERENT DENOMINATORS:
//   * C4's `n` is `scopedF` — the facets of the golden-stride-sampled WALL half of the >45 deg dihedral
//     class. Its area denominator is `scopedA`, the area of THAT SET (79.4 mm2 on CT), not the mesh.
//   * S98's Gothic "0.006-0.013%" is a share of the WHOLE MESH.
// So the headline comparison is class-share vs mesh-share. STAGE 1b reproduces C4 byte-for-byte, prints
// both denominators, and prints the like-for-like Gothic number from the SAME instrument (S114A_CTL_Gothic
// c4: 283/24,587 = 1.151% count, 0.0329% of scoped WALL area). Everything after that is measured on the
// WHOLE MESH so the question can be asked without a denominator in the way.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR INSTRUMENT SCARS — ALL FOUR OBEYED, EXPLICITLY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  1. `inset` swept {0, 0.02, 0.05, 0.1} and passed EXPLICITLY everywhere.
//  2. lattice order `k` swept {4,8,16,32} with the ladder PRINTED. `spreadRad` is NEVER quoted at one k
//     (it does not converge); it is reported across the whole ladder or not at all.
//  3. *** h SWEPT {5e-3, 1e-3, 2e-4, 2e-5, 2e-6} ON EVERY normDeg QUOTED. *** A number that moves with h
//     is not a measurement. The SURVIVOR set is the intersection across the whole 4x5 (inset x h) cross.
//  4. classification thresholds (graphRatio curtain cut, the 90 deg inversion cut, the inverted-FRACTION
//     cut) all swept with the ladder printed.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THREE DEFINITIONS OF "INVERTED", BECAUSE THEY ARE NOT THE SAME CLASS (S98's LESSON)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `orientOfFacet` with `barRad = 90 deg` returns BOTH the sup (`normDeg`) and `overFrac` = the fraction of
// the order-k covering whose angle exceeds 90 deg. So one call gives:
//   INV_MAX   normDeg > 90            — SOME point of the footprint is past 90 deg. A GRAZING facet
//                                       qualifies. This is the loosest reading and the one the brief quotes.
//   INV_HALF  overFrac >= 0.5         — most of the footprint is past 90 deg.
//   INV_ALL   overFrac >= 0.999       — the WHOLE footprint is past 90 deg. *** THE HONEST CLASS. ***
// A facet that is genuinely pointing the wrong way is INV_ALL. A facet clipping the far side of a crease
// is INV_MAX only. S98's "back-facing census measured the COMPLEMENT" is exactly this failure mode.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ANALYTIC-INVERTED IS NOT THE SAME QUESTION AS STL-BACK-FACING. BOTH ARE MEASURED, AND CROSS-TABULATED.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  ANALYTIC  angle(wound facet normal, analytic surface normal) > 90 deg.  Needs rA. Fidelity question.
//  MESH-ONLY three independent tests that never touch rA:
//    B1  PARAMETER-SPACE FOLD. sign of the facet's signed area in the (theta, z) plane (theta unwrapped).
//        For P(th,z) the outward normal is dP/dth x dP/dz, so the wound normal is outward iff the
//        parameter-space signed area carries the mesh's MAJORITY sign. A minority sign is a genuine FOLD.
//        Ill-conditioned exactly on CURTAIN facets (near-vertical => parameter area -> 0), so it is
//        reported split by graphRatio, never aggregated blind.
//    B2  1-RING DISAGREEMENT. dot(n_f, area-weighted sum of its edge-neighbours' normals) < 0.
//    B3  *** RAY PARITY — THE DECISIVE ONE. *** Step off the facet along +n by eps and count mesh
//        crossings. EVEN => the ray started outside the solid => n points out => renders front-facing.
//        ODD => n points into the solid => renders INSIDE-OUT. Three jittered directions; a facet whose
//        parity is not unanimous is reported UNDECIDED, never forced.
// The 2x2 (ANALYTIC x MESH) is printed with COUNT and AREA in every cell.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, BEFORE THE FIRST NUMBER WAS READ
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  PR1 (IS THE CLASS REAL). The INV_ALL class must survive the whole 4x5 inset x h cross AND the k-ladder.
//      REAL if the surviving set holds >= 50% of the base-config INV_ALL area. ARTEFACT if < 50%.
//  PR2 (DENOMINATOR). The whole-mesh area share of the surviving class is the number that may be quoted.
//      The 2.994% may only be quoted with "of the scoped WALL >45 class" attached.
//  PR3 (THE PAYOFF). The 2-2 edge flip is priced against a COST-MATCHED PLACEBO. It is a WIN only if it
//      clears >= 25% of the class area AND beats BOTH placebos (random-choice, random-location) by >= 2x
//      on delta-inverted-area. Anything less is REFUTED — the campaign has already lost five operators
//      to placebos and this one gets no discount.
//  PR4 (THE FLOOR, two-sided). The operator must not INCREASE inverted area anywhere it touches. A
//      one-sided "cleared X%" bar is vacuous; delta over the affected pair is reported signed.
//
// CONTROLS — a run whose control fires is VOID and is reported void, never rescued.
//  C1  PRECOND max |r_mesh - rA| > 50 um => REFUSE.
//  C2  C4-REPRO: this tool must reproduce S114's C4 count/percentages exactly. If not, the denominator
//      audit is void and is reported as such.
//  C3  MESH-ONLY SANITY: `inconsistentEdges` must be 0 (it is what makes the mesh-only tests meaningful),
//      and B1's majority sign must agree with the mesh's signed volume.
//  C4  PLACEBO ON THE INVERSION TEST ITSELF: the identical pipeline against the provably C-infinity
//      truncated cone. It must find ~0 inverted facets (the cone's own mesh is not this mesh, so this is
//      run as "the SAME facets scored against a smooth analytic" — a facet that is inverted against a
//      smooth reference is inverted because of the MESH, not because of the relief).
//
// Usage: bash research/tools/run-s115-inverted.sh   (env PF_S115_STL absolute, PF_S115_STYLE, PF_S115_TAG)
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
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));

const STYLE = process.env.PF_S115_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115_STL ?? '';
const TAG = process.env.PF_S115_TAG ?? STYLE;
const OUTDIR = process.env.PF_S115_OUTDIR ?? 'research/exchange/_strataConformBisect/s115inverted';
const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;

const HI_DEG = envF('PF_S115_HI_DEG', 45);
const CURTAIN_RATIO = envF('PF_S115_CURTAIN', 8);
const K_BASE = envI('PF_S115_K', 8);
const INSET_BASE = envF('PF_S115_INSET', 0.05);
const H_BASE = envF('PF_S115_HFD', 2e-4);
const INSETS = (process.env.PF_S115_INSETS ?? '0,0.02,0.05,0.1').split(',').map(Number);
const HS = (process.env.PF_S115_HS ?? '5e-3,1e-3,2e-4,2e-5,2e-6').split(',').map(Number);
const KS = (process.env.PF_S115_KS ?? '4,8,16,32').split(',').map(Number);
const NSAMP = envI('PF_S115_N', 20000);          // whole-mesh lattice sample
const NCROSS = envI('PF_S115_NCROSS', 4000);     // independent sample carrying the FULL inset x h cross
const CLASS_CAP = envI('PF_S115_CLASSCAP', 3000);// max class facets carried through the cross/k-ladder
const RAY_N = envI('PF_S115_RAYN', 500);         // ray-parity rays per arm
const FLIP_CAP = envI('PF_S115_FLIPCAP', 1200);  // flip targets
const HICAP = envI('PF_S115_HICAP', 24000);      // S114's HI_SCOPE_CAP — needed to reproduce C4
const DEG = 180 / Math.PI;
const INV_RAD = Math.PI / 2;

if (STL.length === 0) { log('*** PF_S115_STL is required (ABSOLUTE path). ***'); process.exit(2); }

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
function goldenStride(n: number, want: number): number[] {
  if (want >= n) return Array.from({ length: n }, (_, i) => i);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let g = Math.max(1, Math.round(n * 0.6180339887498949));
  while (gcd(g, n) !== 1) g += 1;
  const out: number[] = [];
  for (let i = 0; i < want; i += 1) out.push((i * g) % n);
  return out;
}

const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
/** THE PLACEBO ANALYTIC — a provably C-infinity truncated cone at the same scale. */
const rFlat = (_th: number, z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (Math.min(H, Math.max(0, z)) / H);
const scratch = new Float64Array(12);
const nsCache = new Map<number, ReturnType<typeof fdNormals>>();
const nsOf = (h: number): ReturnType<typeof fdNormals> => {
  let s = nsCache.get(h);
  if (s === undefined) { s = fdNormals(rA, H, h, h); nsCache.set(h, s); }
  return s;
};
const nsBase = nsOf(H_BASE);

const OUT: Record<string, unknown> = { session: 'S115', style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 — THE INVERTED CLASS: CENSUS, CROSS-TAB, OPERATOR PRICING — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`dims  H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`registry defaults: ${Object.entries(DEFAULTS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
log(`base config: k=${K_BASE} inset=${INSET_BASE} h=${H_BASE}   sweeps: inset {${INSETS.join(',')}}  h {${HS.join(',')}}  k {${KS.join(',')}}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD + PRECOND (C1)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);
{
  const step = Math.max(1, Math.floor(nTri / 20000));
  const devs: number[] = []; let worst = 0;
  for (let f = 0; f < nTri; f += step) {
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      devs.push(dd * 1000); if (dd > worst) worst = dd;
    }
  }
  log('── STAGE 0 / CONTROL C1: PRECOND  max |r_mesh - rA| (registry defaults, stride sample) ──');
  log(`  samples ${devs.length}   |dr| p50 ${q(devs, 0.5).toExponential(3)}  p99 ${q(devs, 0.99).toExponential(3)}  MAX ${(worst * 1000).toFixed(4)} um   (gate 50 um)`);
  OUT.precond = { maxUm: worst * 1000, p50Um: q(devs, 0.5), p99Um: q(devs, 0.99), samples: devs.length };
  if (worst * 1000 > 50) {
    log('  ██ *** MESH REFUSED: PRECOND > 50 um. THIS IS A RESULT, NOT A GAP. ***');
    OUT.verdict = 'REFUSED-PRECOND';
    writeFileSync(`${OUTDIR}/S115_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
    process.exit(0);
  }
  log('  C1 OK');
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — MESH TOPOLOGY, AREA, WINDING (analytic-free, EXHAUSTIVE)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
// wound normals, exhaustive
const fnx = new Float64Array(nTri); const fny = new Float64Array(nTri); const fnz = new Float64Array(nTri);
let signedVol6 = 0;
let zMin = Infinity; let zMax = -Infinity; let rMin = Infinity; let rMax = -Infinity;
for (let f = 0; f < nTri; f += 1) {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz);
  if (L > 0) { nx /= L; ny /= L; nz /= L; }
  fnx[f] = nx; fny[f] = ny; fnz[f] = nz;
  signedVol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  for (let k = 0; k < 3; k += 1) {
    const z = xyz[f * 9 + k * 3 + 2]; const r = Math.hypot(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1]);
    if (z < zMin) zMin = z; if (z > zMax) zMax = z; if (r < rMin) rMin = r; if (r > rMax) rMax = r;
  }
}
const signedVol = signedVol6 / 6;
log(`── STAGE 1: MESH (facetDihedrals — analytic-free, EXHAUSTIVE)  ${el()} ──`);
log(`  facets ${nTri}   AREA ${meshArea.toFixed(3)} mm2   z [${zMin.toFixed(3)}, ${zMax.toFixed(3)}]   r [${rMin.toFixed(3)}, ${rMax.toFixed(3)}]`);
log(`  edges: interior ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  *** inconsistent-winding ${d.inconsistentEdges} ***`);
log(`  SIGNED VOLUME (divergence, as wound) ${signedVol.toFixed(3)} mm3  => global winding is ${signedVol > 0 ? 'OUTWARD' : 'INWARD'}`);
log(`  CONTROL C3a: inconsistentEdges === 0 ? ${d.inconsistentEdges === 0 ? 'YES — winding IS globally consistent, so a per-facet winding flip is NOT free' : '*** NO — C3 FIRED ***'}`);
OUT.stage1 = {
  facets: nTri, areaMm2: meshArea, interiorEdges: d.interiorEdges, boundaryEdges: d.boundaryEdges,
  nonManifoldEdges: d.nonManifoldEdges, inconsistentEdges: d.inconsistentEdges,
  signedVolMm3: signedVol, zMin, zMax, rMin, rMax,
};
log('');

// ── geometry helpers ────────────────────────────────────────────────────────────────────────────────
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
/** signed area in the (rRef*theta, z) plane — SIGN is B1's fold test, |value| feeds graphRatio. */
function paramSignedArea(f: number): number {
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  return 0.5 * ((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
}
const graphRatio = (f: number): number => {
  const ap = Math.abs(paramSignedArea(f));
  return ap > 1e-15 ? d.areaMm2[f] / ap : Infinity;
};
function orientArgs(f: number): [number, number, number, number, number, number, number, number, number, number, number, number] {
  const [ath, bth, cth] = th3(f);
  return [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth];
}
interface Meas { normDeg: number; invFrac: number; meanDeg: number; spreadDeg: number }
function measure(f: number, inset: number, hfd: number, k: number): Meas {
  const o = orientOfFacet(nsOf(hfd), ...orientArgs(f), { k, inset, orient: 'winding', barRad: INV_RAD, scratch });
  return { normDeg: o.normDeg, invFrac: o.overFrac, meanDeg: o.meanRad * DEG, spreadDeg: o.spreadRad * DEG };
}
/** centroid-only inversion test — 5 rA evals, the same instrument S114's C4 used. */
function centroidDot(f: number, rFn: (th: number, z: number) => number): number {
  const [ath, bth, cth] = th3(f);
  const gth = (ath + bth + cth) / 3;
  const gz = (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
  const r0 = rFn(gth, gz); const hTh = H_BASE / Math.max(1e-9, Math.abs(r0));
  const rt = (rFn(gth + hTh, gz) - rFn(gth - hTh, gz)) / (2 * hTh);
  const zl = Math.max(0, gz - H_BASE); const zh = Math.min(H, gz + H_BASE);
  const rz = zh > zl ? (rFn(gth, zh) - rFn(gth, zl)) / (zh - zl) : 0;
  const an = new Float64Array(3);
  radialNormal(r0, rt, rz, gth, an, 0);
  return fnx[f] * an[0] + fny[f] * an[1] + fnz[f] * an[2];
}
const areaOf = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
/** min altitude (mm) and aspect ratio of a facet. */
function shapeOf(f: number): { minAltUm: number; ar: number; maxEdge: number } {
  const e = [
    Math.hypot(xyz[f * 9 + 3] - xyz[f * 9], xyz[f * 9 + 4] - xyz[f * 9 + 1], xyz[f * 9 + 5] - xyz[f * 9 + 2]),
    Math.hypot(xyz[f * 9 + 6] - xyz[f * 9 + 3], xyz[f * 9 + 7] - xyz[f * 9 + 4], xyz[f * 9 + 8] - xyz[f * 9 + 5]),
    Math.hypot(xyz[f * 9] - xyz[f * 9 + 6], xyz[f * 9 + 1] - xyz[f * 9 + 7], xyz[f * 9 + 2] - xyz[f * 9 + 8]),
  ];
  const maxEdge = Math.max(e[0], e[1], e[2]);
  const minAlt = maxEdge > 0 ? (2 * d.areaMm2[f]) / maxEdge : 0;
  return { minAltUm: minAlt * 1000, ar: minAlt > 0 ? maxEdge / minAlt : Infinity, maxEdge };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1b — *** THE DENOMINATOR AUDIT: REPRODUCE S114's C4 EXACTLY (CONTROL C2) ***
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const hiThr = (HI_DEG * Math.PI) / 180;
  const hiEdges: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] > hiThr) hiEdges.push(e);
  const grCache = new Map<number, number>();
  const grOf = (f: number): number => { let v = grCache.get(f); if (v === undefined) { v = graphRatio(f); grCache.set(f, v); } return v; };
  const wallE: number[] = []; const curtainE: number[] = [];
  for (const e of hiEdges) {
    if (grOf(d.edgeF1[e]) > CURTAIN_RATIO || grOf(d.edgeF2[e]) > CURTAIN_RATIO) curtainE.push(e); else wallE.push(e);
  }
  const wallScope = wallE.length > HICAP ? goldenStride(wallE.length, HICAP).map((i) => wallE[i]) : wallE;
  const scopedF = new Set<number>();
  for (const e of wallScope) { scopedF.add(d.edgeF1[e]); scopedF.add(d.edgeF2[e]); }
  const scopedA = areaOf(scopedF);
  let inv = 0; let invA = 0; const marg: number[] = [];
  for (const f of scopedF) {
    const dp = centroidDot(f, rA);
    marg.push(Math.abs(dp));
    if (dp < 0) { inv += 1; invA += d.areaMm2[f]; }
  }
  let areaOver45 = 0;
  for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) areaOver45 += d.areaMm2[f];
  log(`── STAGE 1b / CONTROL C2: THE DENOMINATOR AUDIT — reproduce S114's C4  ${el()} ──`);
  log(`  >${HI_DEG} deg edges ${hiEdges.length}  (WALL ${wallE.length} / CURTAIN ${curtainE.length});  scoped WALL edges ${wallScope.length} of ${wallE.length}`);
  log(`  scopedF ${scopedF.size} facets   scopedA ${scopedA.toFixed(4)} mm2   >45 class area ${areaOver45.toFixed(3)} mm2   MESH area ${meshArea.toFixed(3)} mm2`);
  log(`  REPRODUCED  INVERTED (centroid dot < 0):  COUNT ${inv} (${pct(inv, scopedF.size)}%)   AREA ${invA.toFixed(4)} mm2 = ${pct(invA, scopedA)}% of scoped WALL area`);
  log(`  S114 C4 reported: 2367 (5.4784%)  AREA 2.3765 mm2 = 2.9941% of scoped WALL area   [n=43206]`);
  const reproOk = scopedF.size === 43206 && inv === 2367;
  log(`  CONTROL C2: ${reproOk ? 'REPRODUCED EXACTLY — the denominator audit below is admissible.' : '*** C2 did not reproduce byte-for-byte; the audit is reported with BOTH sets of numbers and is NOT used to overturn S114. ***'}`);
  log('');
  log('  ████ THE SAME NUMBER, RE-BASED. THIS IS THE POINT OF THIS STAGE. ████');
  log(`    of the scoped WALL >${HI_DEG} class area (${scopedA.toFixed(2)} mm2) : ${pct(invA, scopedA)}%     <== the 2.994% S114 quoted`);
  log(`    of the whole >${HI_DEG} dihedral class area (${areaOver45.toFixed(2)} mm2) : ${pct(invA, areaOver45)}%`);
  log(`    *** of the WHOLE MESH area (${meshArea.toFixed(2)} mm2) : ${pct(invA, meshArea)}% ***`);
  log('    Gothic\'s S98 "0.006-0.013%" is a WHOLE-MESH share. The like-for-like Gothic number from this');
  log('    SAME instrument (S114A_CTL_Gothic c4) is 283/24,587 = 1.1510% by count, 0.0329% of ITS scoped');
  log('    WALL area, i.e. 0.2229 mm2 = 0.00058% of the Gothic mesh.');
  log(`    => CT/Gothic on the SAME denominator (scoped WALL class share): ${(Number(pct(invA, scopedA)) / 0.0329).toFixed(1)}x`);
  log(`    => CT/Gothic on the WHOLE-MESH share:                            ${(Number(pct(invA, meshArea)) / 0.00058).toFixed(1)}x`);
  log('    NOTE: this stage only re-bases S114\'s own restricted census. The WHOLE-MESH inverted census');
  log('    (Stage 2) has NEVER been run on CelticTriquetra and is the number PR2 asks for.');
  OUT.stage1b = {
    hiEdges: hiEdges.length, wallEdges: wallE.length, curtainEdges: curtainE.length, scopedFacets: scopedF.size,
    scopedAreaMm2: scopedA, over45AreaMm2: areaOver45, inverted: inv, invertedAreaMm2: invA,
    invPctCount: (inv / scopedF.size) * 100, invPctScopedArea: (invA / scopedA) * 100,
    invPctOver45Area: (invA / areaOver45) * 100, invPctMeshArea: (invA / meshArea) * 100,
    margP10: q(marg, 0.1), margP50: q(marg, 0.5), margP90: q(marg, 0.9), reproducedC4: reproOk,
  };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — THE WHOLE-MESH INVERTED CENSUS
//   2a EXHAUSTIVE centroid census (every facet, 5 rA evals each) — the honest whole-mesh denominator
//   2b LATTICE census on a golden-stride sample at the base config, three definitions
//   2c *** THE 3-SCAR SURVIVAL CROSS: inset x h, then the k-ladder ***
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const centDot = new Float64Array(nTri);
const centInv: number[] = [];
{
  const t = Date.now();
  let invA = 0; let invN = 0;
  for (let f = 0; f < nTri; f += 1) {
    const dp = centroidDot(f, rA);
    centDot[f] = dp;
    if (dp < 0) { invN += 1; invA += d.areaMm2[f]; centInv.push(f); }
  }
  const margs = centInv.map((f) => Math.abs(centDot[f]));
  log(`── STAGE 2a: *** WHOLE-MESH EXHAUSTIVE centroid-inversion census *** (all ${nTri} facets)  ${el()} ──`);
  log(`  INVERTED (dot(wound normal, analytic normal at centroid) < 0):`);
  log(`     COUNT ${invN} of ${nTri} = ${pct(invN, nTri)}%      *** AREA ${invA.toFixed(4)} mm2 = ${pct(invA, meshArea)}% OF THE MESH ***`);
  log(`     |dot| margin over the inverted set: p10 ${q(margs, 0.1).toFixed(4)} p50 ${q(margs, 0.5).toFixed(4)} p90 ${q(margs, 0.9).toFixed(4)}  (small = coin toss)`);
  log(`     margin < 0.05 (a coin toss): ${margs.filter((v) => v < 0.05).length} = ${pct(margs.filter((v) => v < 0.05).length, invN)}% of the inverted set`);
  log(`     [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  // CONTROL C4 — SPECIFICITY. The SAME test on the SAME facets against the C-infinity cone, EXHAUSTIVE.
  // This is not a "does the instrument invent creases" placebo — it is a SPECIFICITY placebo. A facet that
  // is inverted against the SMOOTH cone points into the gross body and would be back-facing with no relief
  // at all; one inverted ONLY against the relief analytic is a relief-scale fidelity defect. The 2x2 says
  // which. Reporting only the target arm would let a mesh-side defect masquerade as a relief-fidelity one.
  const coneInv = new Uint8Array(nTri);
  let n11 = 0; let n10 = 0; let n01 = 0; let a11 = 0; let a10 = 0; let a01 = 0;
  let pInv = 0; let pA = 0;
  for (let f = 0; f < nTri; f += 1) {
    const ci = centroidDot(f, rFlat) < 0;
    if (ci) { coneInv[f] = 1; pInv += 1; pA += d.areaMm2[f]; }
    const ri = centDot[f] < 0;
    if (ri && ci) { n11 += 1; a11 += d.areaMm2[f]; } else if (ri) { n10 += 1; a10 += d.areaMm2[f]; } else if (ci) { n01 += 1; a01 += d.areaMm2[f]; }
  }
  log('  CONTROL C4 (SPECIFICITY PLACEBO): the SAME test, EXHAUSTIVE, against the C-infinity truncated cone:');
  log(`     inverted-vs-CONE  COUNT ${pInv} (${pct(pInv, nTri)}%)  AREA ${pA.toFixed(4)} mm2 = ${pct(pA, meshArea)}% of mesh`);
  log(`     inverted-vs-RELIEF COUNT ${invN} (${pct(invN, nTri)}%)  AREA ${invA.toFixed(4)} mm2 = ${pct(invA, meshArea)}% of mesh`);
  log('     2x2 (RELIEF x CONE), COUNT + AREA per cell:');
  log(`        BOTH        COUNT ${String(n11).padStart(7)} (${pct(n11, nTri)}%)   AREA ${a11.toFixed(4).padStart(10)} mm2 (${pct(a11, meshArea)}% of mesh)   <= points into the GROSS BODY: mesh-side`);
  log(`        RELIEF only COUNT ${String(n10).padStart(7)} (${pct(n10, nTri)}%)   AREA ${a10.toFixed(4).padStart(10)} mm2 (${pct(a10, meshArea)}%)   <= relief-scale fidelity defect`);
  log(`        CONE only   COUNT ${String(n01).padStart(7)} (${pct(n01, nTri)}%)   AREA ${a01.toFixed(4).padStart(10)} mm2 (${pct(a01, meshArea)}%)   <= correct on the relief, "inverted" only against a wrong reference`);
  log(`     => of the RELIEF-inverted class, ${pct(n11, invN)}% by count / ${pct(a11, invA)}% by AREA is ALSO cone-inverted.`);
  log('     READ: a HIGH overlap means the label is NOT specific to the relief — the facets point into the');
  log('     body, which is a MESH-side property, and the relief analytic is not what is producing the label.');
  OUT.stage2a = {
    invCount: invN, invPctCount: (invN / nTri) * 100, invAreaMm2: invA, invPctMeshArea: (invA / meshArea) * 100,
    margP10: q(margs, 0.1), margP50: q(margs, 0.5), margP90: q(margs, 0.9),
    coinTossFrac: margs.filter((v) => v < 0.05).length / Math.max(1, invN),
    coneInvCount: pInv, coneInvPctCount: (pInv / nTri) * 100, coneInvAreaPct: (pA / meshArea) * 100,
    both: n11, reliefOnly: n10, coneOnly: n01, bothArea: a11, reliefOnlyArea: a10, coneOnlyArea: a01,
    overlapCountPct: (n11 / Math.max(1, invN)) * 100, overlapAreaPct: (a11 / Math.max(1e-30, invA)) * 100,
  };
  log('');
}

// 2b — lattice census, base config, on a whole-mesh golden-stride sample
const samp = goldenStride(nTri, Math.min(NSAMP, nTri));
const sampArea = areaOf(samp);
const baseMeas = new Map<number, Meas>();
{
  const t = Date.now();
  let cMax = 0; let aMax = 0; let cHalf = 0; let aHalf = 0; let cAll = 0; let aAll = 0;
  const nds: number[] = [];
  for (const f of samp) {
    const m = measure(f, INSET_BASE, H_BASE, K_BASE);
    baseMeas.set(f, m); nds.push(m.normDeg);
    if (m.normDeg > 90) { cMax += 1; aMax += d.areaMm2[f]; }
    if (m.invFrac >= 0.5) { cHalf += 1; aHalf += d.areaMm2[f]; }
    if (m.invFrac >= 0.999) { cAll += 1; aAll += d.areaMm2[f]; }
  }
  log(`── STAGE 2b: LATTICE census, base config (k=${K_BASE}, inset=${INSET_BASE}, h=${H_BASE}), golden-stride n=${samp.length}  ${el()} ──`);
  log(`  sample holds ${sampArea.toFixed(2)} mm2 = ${pct(sampArea, meshArea)}% of mesh area. Shares are ratio estimates.`);
  log(`  normDeg  p50 ${q(nds, 0.5).toFixed(3)}  p90 ${q(nds, 0.9).toFixed(3)}  p99 ${q(nds, 0.99).toFixed(3)}  MAX ${q(nds, 1).toFixed(3)} deg`);
  log('  THREE DEFINITIONS — they are NOT the same class:');
  log(`     INV_MAX  (normDeg > 90)        COUNT ${cMax} (${pct(cMax, samp.length)}%)   AREA ${pct(aMax, sampArea)}% of mesh`);
  log(`     INV_HALF (invFrac >= 0.5)      COUNT ${cHalf} (${pct(cHalf, samp.length)}%)   AREA ${pct(aHalf, sampArea)}% of mesh`);
  log(`     INV_ALL  (invFrac >= 0.999)    COUNT ${cAll} (${pct(cAll, samp.length)}%)   AREA ${pct(aAll, sampArea)}% of mesh   <== THE HONEST CLASS`);
  log(`     (exhaustive centroid census above: COUNT ${pct(centInv.length, nTri)}%  AREA ${pct(areaOf(centInv), meshArea)}%)`);
  log(`     [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  // the inverted-FRACTION ladder — scar 4, the classification threshold
  const fr = samp.map((f) => (baseMeas.get(f) as Meas).invFrac).filter((v) => v > 0);
  log(`  invFrac LADDER over the ${fr.length} facets with any inverted lattice point:`);
  const lad: Array<Record<string, number>> = [];
  for (const cut of [0.001, 0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
    let c = 0; let a = 0;
    for (const f of samp) if ((baseMeas.get(f) as Meas).invFrac >= cut) { c += 1; a += d.areaMm2[f]; }
    log(`     invFrac >= ${String(cut).padStart(6)}   COUNT ${String(c).padStart(6)} (${pct(c, samp.length).padStart(8)}%)   AREA ${pct(a, sampArea).padStart(8)}% of mesh`);
    lad.push({ cut, count: c, countPct: (c / samp.length) * 100, areaPct: (a / sampArea) * 100 });
  }
  OUT.stage2b = {
    n: samp.length, sampAreaPct: (sampArea / meshArea) * 100,
    normDegP50: q(nds, 0.5), normDegP90: q(nds, 0.9), normDegP99: q(nds, 0.99), normDegMax: q(nds, 1),
    invMaxCount: cMax, invMaxCountPct: (cMax / samp.length) * 100, invMaxAreaPct: (aMax / sampArea) * 100,
    invHalfCount: cHalf, invHalfCountPct: (cHalf / samp.length) * 100, invHalfAreaPct: (aHalf / sampArea) * 100,
    invAllCount: cAll, invAllCountPct: (cAll / samp.length) * 100, invAllAreaPct: (aAll / sampArea) * 100,
    invFracLadder: lad,
  };
  log('');
}

// 2c — THE 3-SCAR SURVIVAL CROSS.
//   Arm 1: an INDEPENDENT whole-mesh sample carries the FULL inset x h cross, so each config's whole-mesh
//          share is MEASURED, not extrapolated.
//   Arm 2: the base INV_MAX class (capped) plus a matched control of base-NON-inverted facets carries the
//          same cross, so SURVIVAL and RECRUITMENT are both measured on the class itself.
const crossSamp = goldenStride(nTri, Math.min(NCROSS, nTri));
const crossArea = areaOf(crossSamp);
const survivors = { all: new Set<number>(), max: new Set<number>() };
{
  log(`── STAGE 2c: *** THE 3-SCAR CROSS — inset x h, k, ON EVERY normDeg *** ${el()} ──`);
  log(`  ARM 1 — independent whole-mesh sample n=${crossSamp.length} (${pct(crossArea, meshArea)}% of area), full ${INSETS.length}x${HS.length} cross at k=${K_BASE}:`);
  log('     inset      h        INV_MAX cnt%/area%      INV_HALF cnt%/area%     INV_ALL cnt%/area%    normDeg p50 / MAX');
  const grid: Array<Record<string, number>> = [];
  for (const ins of INSETS) {
    for (const hh of HS) {
      let cM = 0; let aM = 0; let cH = 0; let aH = 0; let cA = 0; let aA = 0; const nn: number[] = [];
      for (const f of crossSamp) {
        const m = measure(f, ins, hh, K_BASE);
        nn.push(m.normDeg);
        if (m.normDeg > 90) { cM += 1; aM += d.areaMm2[f]; }
        if (m.invFrac >= 0.5) { cH += 1; aH += d.areaMm2[f]; }
        if (m.invFrac >= 0.999) { cA += 1; aA += d.areaMm2[f]; }
      }
      log(`     ${ins.toFixed(2).padStart(5)}  ${hh.toExponential(0).padStart(7)}    ${pct(cM, crossSamp.length).padStart(7)}% ${pct(aM, crossArea).padStart(7)}%     ${pct(cH, crossSamp.length).padStart(7)}% ${pct(aH, crossArea).padStart(7)}%    ${pct(cA, crossSamp.length).padStart(7)}% ${pct(aA, crossArea).padStart(7)}%     ${q(nn, 0.5).toFixed(3).padStart(8)} / ${q(nn, 1).toFixed(2)}`);
      grid.push({
        inset: ins, h: hh, invMaxCountPct: (cM / crossSamp.length) * 100, invMaxAreaPct: (aM / crossArea) * 100,
        invHalfCountPct: (cH / crossSamp.length) * 100, invHalfAreaPct: (aH / crossArea) * 100,
        invAllCountPct: (cA / crossSamp.length) * 100, invAllAreaPct: (aA / crossArea) * 100,
        normDegP50: q(nn, 0.5), normDegMax: q(nn, 1),
      });
    }
  }
  OUT.cross = grid;
  const aAllv = grid.map((g) => g.invAllAreaPct).filter(Number.isFinite);
  const aMaxv = grid.map((g) => g.invMaxAreaPct).filter(Number.isFinite);
  log(`     h-STABILITY of the class area: INV_ALL  min ${Math.min(...aAllv).toFixed(4)}%  max ${Math.max(...aAllv).toFixed(4)}%  spread ${(Math.max(...aAllv) / Math.max(1e-12, Math.min(...aAllv))).toFixed(2)}x`);
  log(`                                    INV_MAX  min ${Math.min(...aMaxv).toFixed(4)}%  max ${Math.max(...aMaxv).toFixed(4)}%  spread ${(Math.max(...aMaxv) / Math.max(1e-12, Math.min(...aMaxv))).toFixed(2)}x`);
  log('');

  // ARM 2 — survival / recruitment on the class itself
  const baseMax = samp.filter((f) => (baseMeas.get(f) as Meas).normDeg > 90);
  const baseAll = samp.filter((f) => (baseMeas.get(f) as Meas).invFrac >= 0.999);
  const baseNot = samp.filter((f) => (baseMeas.get(f) as Meas).normDeg <= 90);
  const clsMax = baseMax.length > CLASS_CAP ? goldenStride(baseMax.length, CLASS_CAP).map((i) => baseMax[i]) : baseMax;
  const clsSet = new Set(clsMax);
  const ctl = goldenStride(baseNot.length, Math.min(clsMax.length, baseNot.length)).map((i) => baseNot[i]);
  const clsA0 = areaOf(clsMax); const ctlA0 = areaOf(ctl);
  log(`  ARM 2 — SURVIVAL and RECRUITMENT. class n=${clsMax.length} (base INV_MAX), matched control n=${ctl.length} (base non-inverted).`);
  log('     config              INV_MAX survival of class   |  RECRUITMENT from control   |  INV_ALL survival');
  const surv: Array<Record<string, number>> = [];
  for (const f of clsMax) survivors.max.add(f);
  for (const f of baseAll) if (clsSet.has(f)) survivors.all.add(f);
  for (const ins of INSETS) {
    for (const hh of HS) {
      let sM = 0; let sMa = 0; let sA = 0; let rc = 0; let rca = 0;
      const stillMax = new Set<number>(); const stillAll = new Set<number>();
      for (const f of clsMax) {
        const m = measure(f, ins, hh, K_BASE);
        if (m.normDeg > 90) { sM += 1; sMa += d.areaMm2[f]; stillMax.add(f); }
        if (m.invFrac >= 0.999) { sA += 1; stillAll.add(f); }
      }
      for (const f of ctl) { const m = measure(f, ins, hh, K_BASE); if (m.normDeg > 90) { rc += 1; rca += d.areaMm2[f]; } }
      for (const f of survivors.max) if (!stillMax.has(f)) survivors.max.delete(f);
      for (const f of survivors.all) if (!stillAll.has(f)) survivors.all.delete(f);
      log(`     inset ${ins.toFixed(2)} h ${hh.toExponential(0).padStart(7)}    ${pct(sM, clsMax.length).padStart(8)}% cnt  ${pct(sMa, clsA0).padStart(8)}% area  |  ${pct(rc, ctl.length).padStart(8)}% cnt ${pct(rca, ctlA0).padStart(8)}% area  |  ${pct(sA, clsMax.length).padStart(8)}% cnt`);
      surv.push({
        inset: ins, h: hh, survMaxCountPct: (sM / clsMax.length) * 100, survMaxAreaPct: (sMa / clsA0) * 100,
        recruitCountPct: (rc / Math.max(1, ctl.length)) * 100, survAllCountPct: (sA / clsMax.length) * 100,
      });
    }
  }
  OUT.survival = surv;
  log(`     *** SURVIVED ALL ${INSETS.length * HS.length} (inset,h) CONFIGS as INV_MAX: ${survivors.max.size} of ${clsMax.length} = ${pct(survivors.max.size, clsMax.length)}% by count, ${pct(areaOf(survivors.max), clsA0)}% by area ***`);
  log(`     *** SURVIVED ALL as INV_ALL (the honest class): ${survivors.all.size} of ${clsMax.length} = ${pct(survivors.all.size, clsMax.length)}% by count, ${pct(areaOf(survivors.all), clsA0)}% by area ***`);
  OUT.survivorSets = {
    invMaxSurvived: survivors.max.size, invMaxSurvivedAreaPct: (areaOf(survivors.max) / clsA0) * 100,
    invAllSurvived: survivors.all.size, invAllSurvivedAreaPct: (areaOf(survivors.all) / clsA0) * 100,
    baseAllInClass: baseAll.filter((f) => clsSet.has(f)).length, clsA0,
  };
  log('');

  // k-LADDER on the class + control (scar 2). spreadRad printed ACROSS the ladder, never at one k.
  log(`  ARM 3 — k-LADDER at inset=${INSET_BASE}, h=${H_BASE}, on the class (n=${clsMax.length}):`);
  const kl: Array<Record<string, number>> = [];
  for (const kk of KS) {
    let cM = 0; let cA = 0; const nn: number[] = []; const sp: number[] = [];
    for (const f of clsMax) {
      const m = measure(f, INSET_BASE, H_BASE, kk);
      nn.push(m.normDeg); sp.push(m.spreadDeg);
      if (m.normDeg > 90) cM += 1;
      if (m.invFrac >= 0.999) cA += 1;
    }
    log(`     k=${String(kk).padStart(3)}  normDeg p50 ${q(nn, 0.5).toFixed(3)} MAX ${q(nn, 1).toFixed(3)}   INV_MAX ${pct(cM, clsMax.length)}%   INV_ALL ${pct(cA, clsMax.length)}%   spreadDeg p50 ${q(sp, 0.5).toFixed(2)} (NOT converged — do not quote at one k)`);
    kl.push({ k: kk, normDegP50: q(nn, 0.5), normDegMax: q(nn, 1), invMaxPct: (cM / clsMax.length) * 100, invAllPct: (cA / clsMax.length) * 100, spreadP50: q(sp, 0.5) });
  }
  OUT.kLadder = kl;
  OUT.classSizes = { baseMax: baseMax.length, baseAll: baseAll.length, clsMax: clsMax.length, survivedAll: survivors.max.size };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2d — *** THE SURVIVOR CLASS, EXHAUSTIVE. NOT A SAMPLE. ***
//   (i)  base-config lattice on EVERY facet of the mesh -> exact whole-mesh INV_MAX / INV_HALF / INV_ALL
//   (ii) the full inset x h cross on every CANDIDATE (base INV_MAX  union  centroid-inverted)
//   The SURVIVOR class is the set that is INV_ALL in ALL 20 (inset,h) configs. PR1 is decided on it.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const baseNormDeg = new Float64Array(nTri);
const baseInvFrac = new Float32Array(nTri);
const SURV: number[] = [];
{
  const t = Date.now();
  let cM = 0; let aM = 0; let cH = 0; let aH = 0; let cA = 0; let aA = 0;
  for (let f = 0; f < nTri; f += 1) {
    const m = measure(f, INSET_BASE, H_BASE, K_BASE);
    baseNormDeg[f] = m.normDeg; baseInvFrac[f] = m.invFrac;
    if (m.normDeg > 90) { cM += 1; aM += d.areaMm2[f]; }
    if (m.invFrac >= 0.5) { cH += 1; aH += d.areaMm2[f]; }
    if (m.invFrac >= 0.999) { cA += 1; aA += d.areaMm2[f]; }
    if ((f & 0x3ffff) === 0) log(`     ... ${f}/${nTri}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  }
  log(`── STAGE 2d(i): *** EXHAUSTIVE base-config lattice over ALL ${nTri} facets *** (k=${K_BASE}, inset=${INSET_BASE}, h=${H_BASE})  ${el()} ──`);
  log(`     INV_MAX  (normDeg > 90)     COUNT ${cM} (${pct(cM, nTri)}%)   *** AREA ${aM.toFixed(3)} mm2 = ${pct(aM, meshArea)}% OF THE MESH ***`);
  log(`     INV_HALF (invFrac >= 0.5)   COUNT ${cH} (${pct(cH, nTri)}%)   AREA ${aH.toFixed(3)} mm2 = ${pct(aH, meshArea)}%`);
  log(`     INV_ALL  (invFrac >= 0.999) COUNT ${cA} (${pct(cA, nTri)}%)   AREA ${aA.toFixed(3)} mm2 = ${pct(aA, meshArea)}%   <== the honest class, base config`);
  log(`     centroid census for comparison: COUNT ${pct(centInv.length, nTri)}%  AREA ${pct(areaOf(centInv), meshArea)}%   [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  OUT.stage2d = {
    invMax: cM, invMaxAreaMm2: aM, invMaxAreaPct: (aM / meshArea) * 100,
    invHalf: cH, invHalfAreaMm2: aH, invHalfAreaPct: (aH / meshArea) * 100,
    invAll: cA, invAllAreaMm2: aA, invAllAreaPct: (aA / meshArea) * 100,
  };
  // (ii) the cross, exhaustive over candidates
  const candSet = new Set<number>(centInv);
  for (let f = 0; f < nTri; f += 1) if (baseNormDeg[f] > 90) candSet.add(f);
  const cand = [...candSet];
  log(`── STAGE 2d(ii): the FULL ${INSETS.length}x${HS.length} (inset,h) cross on ALL ${cand.length} candidates (base INV_MAX union centroid-inverted)  ${el()} ──`);
  const alive = new Uint8Array(nTri);
  for (const f of cand) if (baseInvFrac[f] >= 0.999) alive[f] = 1;
  const aliveMax = new Uint8Array(nTri);
  for (const f of cand) if (baseNormDeg[f] > 90) aliveMax[f] = 1;
  const t2 = Date.now();
  for (const ins of INSETS) {
    for (const hh of HS) {
      for (const f of cand) {
        if (alive[f] === 0 && aliveMax[f] === 0) continue;
        const m = measure(f, ins, hh, K_BASE);
        if (m.invFrac < 0.999) alive[f] = 0;
        if (!(m.normDeg > 90)) aliveMax[f] = 0;
      }
      log(`     ... inset ${ins} h ${hh.toExponential(0)} done  [${((Date.now() - t2) / 1000).toFixed(1)}s]`);
    }
  }
  let sc = 0; let sa = 0; let mc = 0; let ma = 0;
  for (const f of cand) { if (alive[f] === 1) { SURV.push(f); sc += 1; sa += d.areaMm2[f]; } if (aliveMax[f] === 1) { mc += 1; ma += d.areaMm2[f]; } }
  log(`     *** SURVIVOR CLASS (INV_ALL in ALL ${INSETS.length * HS.length} configs): COUNT ${sc} (${pct(sc, nTri)}% of mesh)  AREA ${sa.toFixed(4)} mm2 = ${pct(sa, meshArea)}% OF THE MESH ***`);
  log(`     (INV_MAX in all ${INSETS.length * HS.length} configs: COUNT ${mc} (${pct(mc, nTri)}%)  AREA ${ma.toFixed(4)} mm2 = ${pct(ma, meshArea)}%)`);
  log(`     PR1: the survivor holds ${pct(sa, aA)}% of the base-config INV_ALL area (kill line 50%)  =>  ${sa >= 0.5 * aA ? '*** THE CLASS IS REAL ***' : '*** ARTEFACT — it does not survive the h/inset cross ***'}`);
  OUT.stage2dii = {
    candidates: cand.length, survCount: sc, survAreaMm2: sa, survAreaPctMesh: (sa / meshArea) * 100,
    survPctOfBaseInvAll: (sa / Math.max(1e-30, aA)) * 100, invMaxAllConfigs: mc, invMaxAllConfigsAreaMm2: ma,
    pr1Real: sa >= 0.5 * aA,
  };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — MESH-ONLY BACK-FACING TESTS (mesh-wide half; the class-dependent half is in runClassStages)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// facet -> its interior edges (CSR), needed by B2 and by the flip operator
const fes = new Int32Array(nTri + 1);
for (let e = 0; e < d.edgeF1.length; e += 1) { fes[d.edgeF1[e] + 1] += 1; fes[d.edgeF2[e] + 1] += 1; }
for (let f = 0; f < nTri; f += 1) fes[f + 1] += fes[f];
const feList = new Int32Array(fes[nTri]);
{
  const cur = fes.slice(0, nTri);
  for (let e = 0; e < d.edgeF1.length; e += 1) {
    feList[cur[d.edgeF1[e]]] = e; cur[d.edgeF1[e]] += 1;
    feList[cur[d.edgeF2[e]]] = e; cur[d.edgeF2[e]] += 1;
  }
}
const nbrOf = (f: number, e: number): number => (d.edgeF1[e] === f ? d.edgeF2[e] : d.edgeF1[e]);

// B1 — parameter-space fold. Majority sign first (C3b).
const paramSign = new Int8Array(nTri);
{
  let pos = 0; let neg = 0; let posA = 0; let negA = 0;
  for (let f = 0; f < nTri; f += 1) {
    const s = paramSignedArea(f);
    paramSign[f] = s > 0 ? 1 : s < 0 ? -1 : 0;
    if (s > 0) { pos += 1; posA += d.areaMm2[f]; } else if (s < 0) { neg += 1; negA += d.areaMm2[f]; }
  }
  const maj = posA >= negA ? 1 : -1;
  log(`── STAGE 4: MESH-ONLY BACK-FACING TESTS (no rA anywhere in this stage)  ${el()} ──`);
  log('  B1 PARAMETER-SPACE FOLD — sign of the facet\'s signed area in the (rRef*theta, z) plane.');
  log(`     For P(th,z) the outward normal is dP/dth x dP/dz, so a wound normal is outward iff this sign is`);
  log('     the mesh MAJORITY. A minority sign is a genuine FOLD in the parameterisation.');
  log(`     sign +1: COUNT ${pos} (${pct(pos, nTri)}%)  AREA ${pct(posA, meshArea)}%   |   sign -1: COUNT ${neg} (${pct(neg, nTri)}%)  AREA ${pct(negA, meshArea)}%   |   zero ${nTri - pos - neg}`);
  log(`     MAJORITY = ${maj > 0 ? '+1' : '-1'}.  CONTROL C3b: signed volume says winding is ${signedVol > 0 ? 'OUTWARD' : 'INWARD'}; B1 majority says ${maj > 0 ? 'OUTWARD' : 'INWARD'} => ${(signedVol > 0) === (maj > 0) ? 'AGREE' : '*** C3b FIRED — disagree ***'}`);
  log(`     *** B1 MINORITY (the mesh-only FOLD class): COUNT ${maj > 0 ? neg : pos} (${pct(maj > 0 ? neg : pos, nTri)}%)  AREA ${pct(maj > 0 ? negA : posA, meshArea)}% of mesh ***`);
  OUT.b1 = {
    posCount: pos, negCount: neg, posAreaPct: (posA / meshArea) * 100, negAreaPct: (negA / meshArea) * 100,
    majority: maj, foldCount: maj > 0 ? neg : pos, foldAreaPct: ((maj > 0 ? negA : posA) / meshArea) * 100,
    agreesWithSignedVolume: (signedVol > 0) === (maj > 0),
  };
  (OUT.b1 as Record<string, unknown>).majoritySign = maj;
}
const B1_MAJ = (OUT.b1 as Record<string, number>).majority;
const b1Fold = (f: number): boolean => paramSign[f] !== 0 && paramSign[f] !== B1_MAJ;

// B2 — 1-ring disagreement
const b2Back = new Uint8Array(nTri);
{
  let c = 0; let a = 0;
  for (let f = 0; f < nTri; f += 1) {
    let sx = 0; let sy = 0; let sz = 0;
    for (let i = fes[f]; i < fes[f + 1]; i += 1) {
      const g = nbrOf(f, feList[i]);
      sx += d.areaMm2[g] * fnx[g]; sy += d.areaMm2[g] * fny[g]; sz += d.areaMm2[g] * fnz[g];
    }
    if (fnx[f] * sx + fny[f] * sy + fnz[f] * sz < 0) { b2Back[f] = 1; c += 1; a += d.areaMm2[f]; }
  }
  log('  B2 1-RING DISAGREEMENT — dot(n_f, area-weighted sum of edge-neighbour normals) < 0:');
  log(`     COUNT ${c} (${pct(c, nTri)}%)  AREA ${a.toFixed(4)} mm2 = ${pct(a, meshArea)}% of mesh`);
  OUT.b2 = { count: c, countPct: (c / nTri) * 100, areaMm2: a, areaPct: (a / meshArea) * 100 };
}

// B3 — RAY PARITY, the decisive one. z-slab acceleration.
const NSLAB = 1024;
const slabStart = new Int32Array(NSLAB + 1);
const slabOf = (z: number): number => {
  const t = Math.floor(((z - zMin) / Math.max(1e-12, zMax - zMin)) * NSLAB);
  return t < 0 ? 0 : t >= NSLAB ? NSLAB - 1 : t;
};
let slabList = new Int32Array(0);
{
  const lo = new Int32Array(nTri); const hi = new Int32Array(nTri);
  for (let f = 0; f < nTri; f += 1) {
    const z0 = Math.min(xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]);
    const z1 = Math.max(xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]);
    lo[f] = slabOf(z0); hi[f] = slabOf(z1);
    for (let s = lo[f]; s <= hi[f]; s += 1) slabStart[s + 1] += 1;
  }
  for (let s = 0; s < NSLAB; s += 1) slabStart[s + 1] += slabStart[s];
  slabList = new Int32Array(slabStart[NSLAB]);
  const cur = slabStart.slice(0, NSLAB);
  for (let f = 0; f < nTri; f += 1) for (let s = lo[f]; s <= hi[f]; s += 1) { slabList[cur[s]] = f; cur[s] += 1; }
  log(`  B3 RAY PARITY — z-slab grid built: ${NSLAB} slabs, ${slabList.length} entries (${(slabList.length / nTri).toFixed(2)} per facet)  ${el()}`);
}
const stamp = new Int32Array(nTri).fill(-1);
let rayId = 0;
const RAY_L = 4 * Math.max(rMax, zMax - zMin) + 50;
/** Moller-Trumbore crossings along a ray. Returns {n, degenerate}. */
function rayCross(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, skip: number): { n: number; deg: boolean } {
  rayId += 1;
  let n = 0; let deg = false;
  // CLIP TO THE MESH AABB. Without this every near-vertical ray sweeps all 1024 z-slabs and tests the
  // whole mesh; the parity is identical because nothing can be hit outside the box.
  const PAD = 1;
  let tMax = RAY_L;
  const clip = (o: number, dd: number, lo: number, hi: number): void => {
    if (Math.abs(dd) < 1e-15) { if (o < lo || o > hi) tMax = 0; return; }
    const t1 = (lo - o) / dd; const t2 = (hi - o) / dd;
    const far = Math.max(t1, t2);
    if (far < tMax) tMax = far < 0 ? 0 : far;
  };
  clip(ox, dx, -rMax - PAD, rMax + PAD);
  clip(oy, dy, -rMax - PAD, rMax + PAD);
  clip(oz, dz, zMin - PAD, zMax + PAD);
  if (!(tMax > 0)) return { n: 0, deg: false };
  const z0 = oz; const z1 = oz + dz * tMax;
  let s0 = slabOf(Math.min(z0, z1)); let s1 = slabOf(Math.max(z0, z1));
  if (s0 > s1) { const t = s0; s0 = s1; s1 = t; }
  for (let s = s0; s <= s1; s += 1) {
    for (let i = slabStart[s]; i < slabStart[s + 1]; i += 1) {
      const f = slabList[i];
      if (f === skip || stamp[f] === rayId) continue;
      stamp[f] = rayId;
      const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
      const e1x = xyz[f * 9 + 3] - ax; const e1y = xyz[f * 9 + 4] - ay; const e1z = xyz[f * 9 + 5] - az;
      const e2x = xyz[f * 9 + 6] - ax; const e2y = xyz[f * 9 + 7] - ay; const e2z = xyz[f * 9 + 8] - az;
      const px = dy * e2z - dz * e2y; const py = dz * e2x - dx * e2z; const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-14 && det < 1e-14) continue;
      const inv = 1 / det;
      const tx = ox - ax; const ty = oy - ay; const tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const qx = ty * e1z - tz * e1y; const qy = tz * e1x - tx * e1z; const qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t <= 1e-7 || t >= tMax) continue;
      if (u < 1e-7 || v < 1e-7 || u + v > 1 - 1e-7) deg = true;
      n += 1;
    }
  }
  return { n, deg };
}
/** parity with 3 jittered directions; UNDECIDED (=-1) when they disagree. 1 = BACK-FACING (odd). */
function backFacing(f: number): number {
  const cx = (xyz[f * 9] + xyz[f * 9 + 3] + xyz[f * 9 + 6]) / 3;
  const cy = (xyz[f * 9 + 1] + xyz[f * 9 + 4] + xyz[f * 9 + 7]) / 3;
  const cz = (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
  const eps = 1e-4;
  const votes: number[] = [];
  for (const j of [0, 1, 2]) {
    const a = j * 2.3999632; // golden-angle jitter around the normal
    let dx = fnx[f]; let dy = fny[f]; let dz = fnz[f];
    if (j > 0) {
      // build an orthonormal frame and tilt by ~4 deg
      let ux = -fny[f]; let uy = fnx[f]; let uz = 0;
      if (Math.hypot(ux, uy) < 1e-9) { ux = 1; uy = 0; uz = 0; }
      const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      const vx = fny[f] * uz - fnz[f] * uy; const vy = fnz[f] * ux - fnx[f] * uz; const vz = fnx[f] * uy - fny[f] * ux;
      const tilt = 0.07; const ca = Math.cos(a); const sa = Math.sin(a);
      dx += tilt * (ca * ux + sa * vx); dy += tilt * (ca * uy + sa * vy); dz += tilt * (ca * uz + sa * vz);
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    }
    const r = rayCross(cx + eps * fnx[f], cy + eps * fny[f], cz + eps * fnz[f], dx, dy, dz, f);
    votes.push(r.n & 1);
  }
  return votes[0] === votes[1] && votes[1] === votes[2] ? votes[0] : -1;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGES 3-7 — RUN TWICE: once on the LOOSE centroid-inverted class, once on the h-ROBUST SURVIVOR class.
// A result that holds on only one of them is reported as holding on only one of them.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function runClassStages(label: string, CLASS: number[], key: string): void {
const classArea = areaOf(CLASS);
if (CLASS.length === 0) { log(`── ${label}: EMPTY CLASS — stages 3-7 skipped.`); return; }
const R: Record<string, unknown> = { label, count: CLASS.length, areaMm2: classArea, areaPctMesh: (classArea / meshArea) * 100 };
log('');
log('████████████████████████████████████████████████████████████████████████████████████████████████████');
log(`██  STAGES 3-7 ON: ${label}   n=${CLASS.length}  area ${classArea.toFixed(4)} mm2 = ${pct(classArea, meshArea)}% of mesh`);
log('████████████████████████████████████████████████████████████████████████████████████████████████████');
// ── STAGE 3: CURTAIN vs WALL ────────────────────────────────────────────────────────────────────────
const grClass = CLASS.map((f) => graphRatio(f));
{
  log(`── STAGE 3: CURTAIN vs WALL  ${el()} ──`);
  log(`  graphRatio over the class: p10 ${q(grClass, 0.1).toFixed(3)} p50 ${q(grClass, 0.5).toFixed(3)} p90 ${q(grClass, 0.9).toFixed(3)} MAX ${q(grClass, 1).toExponential(2)}`);
  const grAll = samp.map((f) => graphRatio(f));
  log(`  graphRatio over the mesh (sample n=${samp.length}): p10 ${q(grAll, 0.1).toFixed(3)} p50 ${q(grAll, 0.5).toFixed(3)} p90 ${q(grAll, 0.9).toFixed(3)}`);
  log('  LADDER — how much of the CURTAIN/WALL verdict the ratio-8 default is carrying (scar 4):');
  const lad: Array<Record<string, number>> = [];
  for (const RR of [2, 4, 8, 16, 32, 128]) {
    let cw = 0; let aw = 0;
    for (let i = 0; i < CLASS.length; i += 1) if (grClass[i] <= RR) { cw += 1; aw += d.areaMm2[CLASS[i]]; }
    log(`     ratio > ${String(RR).padStart(4)} => CURTAIN;  WALL share of the class:  COUNT ${String(cw).padStart(7)} (${pct(cw, CLASS.length).padStart(8)}%)   AREA ${pct(aw, classArea).padStart(8)}%   = ${pct(aw, meshArea)}% of mesh`);
    lad.push({ ratio: RR, wallCount: cw, wallCountPct: (cw / CLASS.length) * 100, wallAreaPctOfClass: (aw / classArea) * 100, wallAreaPctOfMesh: (aw / meshArea) * 100 });
  }
  R.stage3 = { curtainLadder: lad, grP50: q(grClass, 0.5), grMeshP50: q(grAll, 0.5) };
  log('');
}
const isWall = (i: number): boolean => grClass[i] <= CURTAIN_RATIO;
const b3 = new Map<number, number>();
{
  const t = Date.now();
  const clsRay = CLASS.length > RAY_N ? goldenStride(CLASS.length, RAY_N).map((i) => CLASS[i]) : CLASS;
  const notClass: number[] = [];
  {
    const inCls = new Set(CLASS);
    const cand = goldenStride(nTri, Math.min(RAY_N * 4, nTri));
    for (const f of cand) { if (!inCls.has(f)) notClass.push(f); if (notClass.length >= RAY_N) break; }
  }
  const arm = (fs: number[]): { n: number; back: number; und: number; backA: number; totA: number } => {
    let back = 0; let und = 0; let backA = 0; let totA = 0;
    for (const f of fs) {
      const r = backFacing(f); b3.set(f, r); totA += d.areaMm2[f];
      if (r === 1) { back += 1; backA += d.areaMm2[f]; } else if (r < 0) und += 1;
    }
    return { n: fs.length, back, und, backA, totA };
  };
  const wallIdx = CLASS.filter((_f, i) => isWall(i));
  const curtIdx = CLASS.filter((_f, i) => !isWall(i));
  const clsW = wallIdx.length > RAY_N ? goldenStride(wallIdx.length, RAY_N).map((i) => wallIdx[i]) : wallIdx;
  const clsC = curtIdx.length > RAY_N ? goldenStride(curtIdx.length, RAY_N).map((i) => curtIdx[i]) : curtIdx;
  const A = arm(clsRay); const W = arm(clsW); const C = arm(clsC); const P = arm(notClass);
  log('  B3 RAY PARITY — step off along +n by 1e-4 mm, count crossings. ODD => the normal points INTO the');
  log('     solid => the facet renders INSIDE-OUT. 3 jittered directions; disagreement => UNDECIDED.');
  const row = (nm: string, r: typeof A): void => log(`     ${nm.padEnd(30)} n=${String(r.n).padStart(5)}  BACK-FACING ${String(r.back).padStart(5)} (${pct(r.back, r.n).padStart(8)}%)  AREA ${pct(r.backA, r.totA).padStart(8)}% of the arm   UNDECIDED ${String(r.und).padStart(5)} (${pct(r.und, r.n)}%)`);
  row('CLASS (all)', A);
  row(`CLASS / WALL (gr<=${CURTAIN_RATIO})`, W);
  row(`CLASS / CURTAIN (gr>${CURTAIN_RATIO})`, C);
  row('CONTROL (off-class, PLACEBO)', P);
  log(`     [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  log(`     NOTE the mesh has ${d.boundaryEdges} boundary edges (z-range [${zMin.toFixed(2)}, ${zMax.toFixed(2)}], r in [${rMin.toFixed(2)}, ${rMax.toFixed(2)}]).`);
  log('     A ray escaping through an open rim would flip the parity; that is what UNDECIDED and the');
  log('     CONTROL arm are for. A control arm well above 0% means B3 is not measuring what it claims');
  log('     and must not be quoted.');
  R.b3 = {
    all: A, wall: W, curtain: C, ctl: P,
    classBackPct: (A.back / Math.max(1, A.n)) * 100, classBackAreaPct: (A.backA / Math.max(1e-30, A.totA)) * 100,
    ctlBackPct: (P.back / Math.max(1, P.n)) * 100,
  };
}
// ── THE 2x2 ──────────────────────────────────────────────────────────────────────────────────────────
{
  log('');
  log('  ████ THE 2x2: ANALYTIC-INVERTED  x  MESH-ONLY BACK-FACING ████');
  const rows: Array<{ name: string; test: (f: number) => boolean | null }> = [
    { name: 'B1 param-fold ', test: (f) => b1Fold(f) },
    { name: 'B2 1-ring     ', test: (f) => b2Back[f] === 1 },
    { name: 'B3 ray parity ', test: (f) => { const v = b3.get(f); return v === undefined || v < 0 ? null : v === 1; } },
  ];
  const inCls = new Set(CLASS);
  const wallSet = new Set<number>();
  for (let i = 0; i < CLASS.length; i += 1) if (isWall(i)) wallSet.add(CLASS[i]);
  const tab: Record<string, unknown> = {};
  for (const r of rows) {
    for (const scope of ['ALL', 'WALL-ONLY'] as const) {
      // the population: whole mesh for B1/B2 (exhaustive), the rayed subset for B3
      let pop = r.name.startsWith('B3') ? [...b3.keys()].filter((f) => (b3.get(f) as number) >= 0) : Array.from({ length: nTri }, (_, i) => i);
      if (scope === 'WALL-ONLY') pop = pop.filter((f) => (inCls.has(f) ? wallSet.has(f) : graphRatio(f) <= CURTAIN_RATIO));
      let n11 = 0; let n10 = 0; let n01 = 0; let n00 = 0;
      let a11 = 0; let a10 = 0; let a01 = 0; let a00 = 0;
      for (const f of pop) {
        const t = r.test(f); if (t === null) continue;
        const ai = inCls.has(f);
        const ar = d.areaMm2[f];
        if (ai && t) { n11 += 1; a11 += ar; } else if (ai && !t) { n10 += 1; a10 += ar; } else if (!ai && t) { n01 += 1; a01 += ar; } else { n00 += 1; a00 += ar; }
      }
      const tot = n11 + n10 + n01 + n00; const totA = a11 + a10 + a01 + a00;
      log(`     ${r.name} [${scope}] population ${tot} facets, ${totA.toFixed(2)} mm2${r.name.startsWith('B3') ? '   (RAYED SUBSET — ENRICHED, NOT a mesh share)' : '   (EXHAUSTIVE)'}`);
      log(`        ANALYTIC-INV & MESH-BACK   COUNT ${String(n11).padStart(8)} (${pct(n11, tot).padStart(8)}%)   AREA ${a11.toFixed(4).padStart(11)} mm2 (${pct(a11, totA).padStart(8)}%)`);
      log(`        ANALYTIC-INV & mesh-front  COUNT ${String(n10).padStart(8)} (${pct(n10, tot).padStart(8)}%)   AREA ${a10.toFixed(4).padStart(11)} mm2 (${pct(a10, totA).padStart(8)}%)`);
      log(`        analytic-ok  & MESH-BACK   COUNT ${String(n01).padStart(8)} (${pct(n01, tot).padStart(8)}%)   AREA ${a01.toFixed(4).padStart(11)} mm2 (${pct(a01, totA).padStart(8)}%)`);
      log(`        analytic-ok  & mesh-front  COUNT ${String(n00).padStart(8)} (${pct(n00, tot).padStart(8)}%)   AREA ${a00.toFixed(4).padStart(11)} mm2 (${pct(a00, totA).padStart(8)}%)`);
      log(`        agreement ${pct(n11 + n00, tot)}%   |   of the ANALYTIC-INV class here, ${pct(n11, n11 + n10)}% by count / ${pct(a11, a11 + a10)}% by AREA is ALSO mesh-back-facing`);
      tab[`${r.name.trim()}|${scope}`] = { n11, n10, n01, n00, a11, a10, a01, a00, tot, totA };
    }
  }
  R.crosstab = tab;
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — SHAPE. Is this S111's SLIVER mechanism?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const clsShape = CLASS.map((f) => shapeOf(f));
  const ctlIdx = goldenStride(nTri, Math.min(60000, nTri));
  const ctlShape = ctlIdx.map((f) => shapeOf(f));
  const cAlt = clsShape.map((s) => s.minAltUm); const kAlt = ctlShape.map((s) => s.minAltUm);
  const cAr = clsShape.map((s) => s.ar); const kAr = ctlShape.map((s) => s.ar);
  const cA = CLASS.map((f) => d.areaMm2[f]); const kA = ctlIdx.map((f) => d.areaMm2[f]);
  log(`── STAGE 5: SHAPE — is the inverted class S111's SLIVER mechanism (min altitude 5.94 um)?  ${el()} ──`);
  log(`  CLASS   n=${CLASS.length}   minAlt(um) p10 ${q(cAlt, 0.1).toFixed(3)} p50 ${q(cAlt, 0.5).toFixed(3)} p90 ${q(cAlt, 0.9).toFixed(2)}   AR p50 ${q(cAr, 0.5).toFixed(2)} p90 ${q(cAr, 0.9).toFixed(1)} MAX ${q(cAr, 1).toExponential(2)}   area(mm2) p50 ${q(cA, 0.5).toExponential(3)} MAX ${q(cA, 1).toExponential(3)}`);
  log(`  CONTROL n=${ctlIdx.length}   minAlt(um) p10 ${q(kAlt, 0.1).toFixed(3)} p50 ${q(kAlt, 0.5).toFixed(3)} p90 ${q(kAlt, 0.9).toFixed(2)}   AR p50 ${q(kAr, 0.5).toFixed(2)} p90 ${q(kAr, 0.9).toFixed(1)} MAX ${q(kAr, 1).toExponential(2)}   area(mm2) p50 ${q(kA, 0.5).toExponential(3)} MAX ${q(kA, 1).toExponential(3)}`);
  log(`  RATIO class/control: minAlt p50 ${(q(cAlt, 0.5) / q(kAlt, 0.5)).toFixed(3)}x   AR p50 ${(q(cAr, 0.5) / q(kAr, 0.5)).toFixed(3)}x   area p50 ${(q(cA, 0.5) / q(kA, 0.5)).toFixed(3)}x`);
  log('  SLIVER LADDER (COUNT + AREA in each bucket, per facet):');
  const lad: Array<Record<string, number>> = [];
  for (const bar of [1, 5.94, 20, 100, 1000]) {
    let c = 0; let a = 0; let kc = 0;
    for (let i = 0; i < CLASS.length; i += 1) if (cAlt[i] < bar) { c += 1; a += d.areaMm2[CLASS[i]]; }
    for (let i = 0; i < ctlIdx.length; i += 1) if (kAlt[i] < bar) kc += 1;
    log(`     minAlt < ${String(bar).padStart(7)} um:  CLASS COUNT ${String(c).padStart(7)} (${pct(c, CLASS.length).padStart(8)}%)  AREA ${pct(a, classArea).padStart(8)}% of class   |   CONTROL ${pct(kc, ctlIdx.length).padStart(8)}%   ENRICHMENT ${(((c / CLASS.length) || 0) / Math.max(1e-9, kc / ctlIdx.length)).toFixed(2)}x`);
    lad.push({ barUm: bar, classCount: c, classCountPct: (c / CLASS.length) * 100, classAreaPct: (a / classArea) * 100, ctlPct: (kc / ctlIdx.length) * 100 });
  }
  R.stage5 = {
    classMinAltP50: q(cAlt, 0.5), ctlMinAltP50: q(kAlt, 0.5), classArP50: q(cAr, 0.5), ctlArP50: q(kAr, 0.5),
    classAreaP50: q(cA, 0.5), ctlAreaP50: q(kA, 0.5), sliverLadder: lad,
  };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — WHERE ARE THEY? z, theta (mod the 3-fold triquetra), r
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const cz = (f: number): number => (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
  const cth = (f: number): number => {
    const gx = (xyz[f * 9] + xyz[f * 9 + 3] + xyz[f * 9 + 6]) / 3;
    const gy = (xyz[f * 9 + 1] + xyz[f * 9 + 4] + xyz[f * 9 + 7]) / 3;
    return ((Math.atan2(gy, gx) * DEG) + 360) % 360;
  };
  log(`── STAGE 6: WHERE ARE THEY?  (${DEFAULTS.ctRows ?? '?'} rows, 3-fold triquetra => theta mod 120 deg)  ${el()} ──`);
  const NZ = 12;
  const zc = new Float64Array(NZ); const za = new Float64Array(NZ); const zaAll = new Float64Array(NZ);
  for (const f of CLASS) { const b = Math.min(NZ - 1, Math.floor((cz(f) / H) * NZ)); zc[b] += 1; za[b] += d.areaMm2[f]; }
  for (let f = 0; f < nTri; f += 1) { const b = Math.min(NZ - 1, Math.max(0, Math.floor((cz(f) / H) * NZ))); zaAll[b] += d.areaMm2[f]; }
  log('  z-band (12 bands over H):  class COUNT / class AREA share / mesh AREA share / ENRICHMENT');
  const zrows: Array<Record<string, number>> = [];
  for (let b = 0; b < NZ; b += 1) {
    const cs = za[b] / Math.max(1e-30, classArea); const ms = zaAll[b] / meshArea;
    log(`     z ${(b * H / NZ).toFixed(0).padStart(3)}-${((b + 1) * H / NZ).toFixed(0).padStart(3)} mm  COUNT ${String(zc[b]).padStart(7)}   class ${(cs * 100).toFixed(3).padStart(7)}%   mesh ${(ms * 100).toFixed(3).padStart(7)}%   ENRICH ${(cs / Math.max(1e-12, ms)).toFixed(2)}x`);
    zrows.push({ band: b, count: zc[b], classAreaPct: cs * 100, meshAreaPct: ms * 100, enrich: cs / Math.max(1e-12, ms) });
  }
  const NT = 12;
  const tc = new Float64Array(NT); const ta = new Float64Array(NT); const taAll = new Float64Array(NT);
  for (const f of CLASS) { const b = Math.min(NT - 1, Math.floor(((cth(f) % 120) / 120) * NT)); tc[b] += 1; ta[b] += d.areaMm2[f]; }
  for (let f = 0; f < nTri; f += 1) { const b = Math.min(NT - 1, Math.max(0, Math.floor(((cth(f) % 120) / 120) * NT))); taAll[b] += d.areaMm2[f]; }
  log('  theta MOD 120 deg (the 3-fold fundamental domain):  class COUNT / class AREA share / mesh AREA share / ENRICHMENT');
  const trows: Array<Record<string, number>> = [];
  for (let b = 0; b < NT; b += 1) {
    const cs = ta[b] / Math.max(1e-30, classArea); const ms = taAll[b] / meshArea;
    log(`     th ${(b * 120 / NT).toFixed(0).padStart(3)}-${((b + 1) * 120 / NT).toFixed(0).padStart(3)} deg  COUNT ${String(tc[b]).padStart(7)}   class ${(cs * 100).toFixed(3).padStart(7)}%   mesh ${(ms * 100).toFixed(3).padStart(7)}%   ENRICH ${(cs / Math.max(1e-12, ms)).toFixed(2)}x`);
    trows.push({ band: b, count: tc[b], classAreaPct: cs * 100, meshAreaPct: ms * 100, enrich: cs / Math.max(1e-12, ms) });
  }
  // 3-fold consistency: the class split across the three sectors must be ~equal if it follows the pattern
  const sec = [0, 0, 0]; const secA = [0, 0, 0];
  for (const f of CLASS) { const s = Math.min(2, Math.floor(cth(f) / 120)); sec[s] += 1; secA[s] += d.areaMm2[f]; }
  log(`  3-fold sectors [0-120) [120-240) [240-360): COUNT ${sec.join(' / ')}   AREA ${secA.map((v) => v.toFixed(3)).join(' / ')} mm2`);
  log(`     => max/min sector count ratio ${(Math.max(...sec) / Math.max(1, Math.min(...sec))).toFixed(3)} (1.000 = the class follows the 3-fold symmetry exactly)`);
  R.stage6 = { zBands: zrows, thetaBands: trows, sectors: sec, sectorArea: secA };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — *** THE PAYOFF: IS THE CLASS FLIPPABLE AT ZERO TRIANGLE COST? ***
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  log(`── STAGE 7: THE PAYOFF — IS IT FLIPPABLE AT ZERO TRIANGLE COST?  ${el()} ──`);
  // 7a — the WINDING-REVERSAL option, priced exactly. It is NOT free.
  const inCls = new Set(CLASS);
  let boundaryE = 0; let interiorE = 0;
  for (let e = 0; e < d.edgeF1.length; e += 1) {
    const a = inCls.has(d.edgeF1[e]); const b = inCls.has(d.edgeF2[e]);
    if (a !== b) boundaryE += 1; else if (a && b) interiorE += 1;
  }
  log('  7a  WINDING REVERSAL (reverse the class facets in place, zero triangle cost):');
  log(`      the mesh currently has inconsistentEdges = ${d.inconsistentEdges}. Reversing the class creates one`);
  log('      inconsistent edge for every edge with EXACTLY ONE endpoint-facet in the class.');
  log(`      class-boundary edges = ${boundaryE}   (class-interior edges ${interiorE})`);
  log(`      => reversal trades ${CLASS.length} inverted facets (${classArea.toFixed(4)} mm2) for ${boundaryE} NEW winding defects.`);
  log(`      *** ratio ${(boundaryE / Math.max(1, CLASS.length)).toFixed(3)} new winding defects per facet fixed. A per-facet winding flip is NOT free. ***`);
  R.stage7a = { classBoundaryEdges: boundaryE, classInteriorEdges: interiorE, ratio: boundaryE / Math.max(1, CLASS.length) };

  // 7b — the 2-2 EDGE FLIP, priced with TWO placebos.
  const inv90 = (args: number[]): boolean => {
    const o = orientOfFacet(nsBase, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8],
      args[9], args[10], args[11], { k: K_BASE, inset: INSET_BASE, orient: 'winding', barRad: INV_RAD, scratch });
    return o.normDeg > 90;
  };
  /** build the 12-arg orient tuple for an arbitrary triangle given as 9 coords. */
  const argsOf = (p: number[]): number[] => {
    const a = Math.atan2(p[1], p[0]);
    const b = a + dThRaw(a, Math.atan2(p[4], p[3]));
    const c = a + dThRaw(a, Math.atan2(p[7], p[6]));
    return [p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], a, b, c];
  };
  const vtx = (f: number, i: number): number[] => [xyz[f * 9 + i * 3], xyz[f * 9 + i * 3 + 1], xyz[f * 9 + i * 3 + 2]];
  const same = (p: number[], q0: number[]): boolean => p[0] === q0[0] && p[1] === q0[1] && p[2] === q0[2];
  const triArea = (p: number[]): number => {
    const ux = p[3] - p[0]; const uy = p[4] - p[1]; const uz = p[5] - p[2];
    const wx = p[6] - p[0]; const wy = p[7] - p[1]; const wz = p[8] - p[2];
    return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  };
  const paramSignOfTri = (p: number[]): number => {
    const a = argsOf(p);
    const rRef = (Math.hypot(p[0], p[1]) + Math.hypot(p[3], p[4]) + Math.hypot(p[6], p[7])) / 3;
    const s = (rRef * (a[10] - a[9])) * (p[8] - p[2]) - (p[5] - p[2]) * (rRef * (a[11] - a[9]));
    return s > 0 ? 1 : s < 0 ? -1 : 0;
  };
  interface FlipEval { dInvArea: number; clearedTarget: boolean; dFoldArea: number; clearedFold: boolean }
  function evalFlip(f: number, e: number): FlipEval | null {
    const g = nbrOf(f, e);
    if (g === f) return null;
    // ordered shared edge (p,q) in f's cyclic order; u = f's apex
    let ui = -1;
    for (let i = 0; i < 3; i += 1) {
      const p0 = vtx(f, i); const p1 = vtx(f, (i + 1) % 3);
      let hit0 = false; let hit1 = false;
      for (let j = 0; j < 3; j += 1) { if (same(vtx(g, j), p0)) hit0 = true; if (same(vtx(g, j), p1)) hit1 = true; }
      if (hit0 && hit1) { ui = (i + 2) % 3; break; }
    }
    if (ui < 0) return null;
    const u = vtx(f, ui); const p = vtx(f, (ui + 1) % 3); const qv = vtx(f, (ui + 2) % 3);
    let v: number[] | null = null;
    for (let j = 0; j < 3; j += 1) { const w = vtx(g, j); if (!same(w, p) && !same(w, qv)) { v = w; break; } }
    if (v === null) return null;
    const t1 = [u[0], u[1], u[2], p[0], p[1], p[2], v[0], v[1], v[2]];
    const t2 = [u[0], u[1], u[2], v[0], v[1], v[2], qv[0], qv[1], qv[2]];
    // LEGALITY IS GEOMETRIC ONLY (non-degenerate children). A fold-creating flip is NOT excluded — it is
    // MEASURED, because PR4's floor is exactly "the operator must not make things worse", and an operator
    // that is defined so it cannot lose is the vacuous one-sided bar this campaign has already been burnt by.
    if (!(triArea(t1) > 1e-12) || !(triArea(t2) > 1e-12)) return null;
    const oldInv = (inCls.has(f) ? d.areaMm2[f] : 0) + (inCls.has(g) ? d.areaMm2[g] : 0);
    const oldFold = (b1Fold(f) ? d.areaMm2[f] : 0) + (b1Fold(g) ? d.areaMm2[g] : 0);
    const a1 = argsOf(t1); const a2 = argsOf(t2);
    const i1 = inv90(a1); const i2 = inv90(a2);
    const f1 = paramSignOfTri(t1) !== B1_MAJ; const f2 = paramSignOfTri(t2) !== B1_MAJ;
    const newInv = (i1 ? triArea(t1) : 0) + (i2 ? triArea(t2) : 0);
    const newFold = (f1 ? triArea(t1) : 0) + (f2 ? triArea(t2) : 0);
    return { dInvArea: newInv - oldInv, clearedTarget: !i1 && !i2, dFoldArea: newFold - oldFold, clearedFold: !f1 && !f2 };
  }
  const targets = CLASS.length > FLIP_CAP ? goldenStride(CLASS.length, FLIP_CAP).map((i) => CLASS[i]) : CLASS;
  const tArea = areaOf(targets);
  log(`  7b  2-2 EDGE FLIP on the inverted class, n=${targets.length} targets (${tArea.toFixed(4)} mm2 = ${pct(tArea, classArea)}% of the class)`);
  log('      objective = signed change in INVERTED AREA over the affected PAIR {f,g}. Negative = better.');
  const t7 = Date.now();
  let nLegal = 0; let nCleared = 0; let aCleared = 0; let sumBest = 0; let sumRand = 0; let nWorse = 0;
  let nFoldT = 0; let nFoldCleared = 0; let aFoldCleared = 0; let sumFold = 0;
  const bests: number[] = [];
  for (const f of targets) {
    let best: FlipEval | null = null; let bestF: FlipEval | null = null; const legal: FlipEval[] = [];
    for (let i = fes[f]; i < fes[f + 1]; i += 1) {
      const ev = evalFlip(f, feList[i]);
      if (ev === null) continue;
      legal.push(ev);
      if (best === null || ev.dInvArea < best.dInvArea) best = ev;
      if (bestF === null || ev.dFoldArea < bestF.dFoldArea) bestF = ev;
    }
    if (legal.length === 0) continue;
    nLegal += 1;
    sumBest += (best as FlipEval).dInvArea;
    bests.push((best as FlipEval).dInvArea);
    if ((best as FlipEval).dInvArea > 0) nWorse += 1;
    if ((best as FlipEval).clearedTarget) { nCleared += 1; aCleared += d.areaMm2[f]; }
    sumRand += legal[Math.floor((f * 2654435761) % legal.length)].dInvArea;
    if (b1Fold(f)) {
      nFoldT += 1; sumFold += (bestF as FlipEval).dFoldArea;
      if ((bestF as FlipEval).clearedFold) { nFoldCleared += 1; aFoldCleared += d.areaMm2[f]; }
    }
  }
  log(`      LEGAL flips available on ${nLegal} of ${targets.length} targets (${pct(nLegal, targets.length)}%)`);
  log(`      ARM T (best-of-3, inversion-informed): CLEARED both children on ${nCleared} (${pct(nCleared, targets.length)}% of targets)  AREA ${aCleared.toFixed(4)} mm2 = ${pct(aCleared, tArea)}% of the target area`);
  log(`             total delta inverted area ${sumBest.toFixed(6)} mm2  (negative = improvement)   flips that made it WORSE: ${nWorse} (${pct(nWorse, nLegal)}%)`);
  log(`             delta per target: p10 ${q(bests, 0.1).toExponential(2)} p50 ${q(bests, 0.5).toExponential(2)} p90 ${q(bests, 0.9).toExponential(2)} mm2`);
  log(`      ARM P1 (PLACEBO — RANDOM choice among the same legal flips, identical cost): total delta ${sumRand.toFixed(6)} mm2`);
  // PLACEBO P2 — cost-matched RANDOM-LOCATION flips elsewhere in the mesh
  const rndTargets = goldenStride(nTri, Math.min(nLegal * 3, nTri)).filter((f) => !inCls.has(f)).slice(0, nLegal);
  let sumP2 = 0; let nP2 = 0; let nP2Worse = 0;
  for (const f of rndTargets) {
    let best: FlipEval | null = null;
    for (let i = fes[f]; i < fes[f + 1]; i += 1) {
      const ev = evalFlip(f, feList[i]);
      if (ev === null) continue;
      if (best === null || ev.dInvArea < best.dInvArea) best = ev;
    }
    if (best === null) continue;
    nP2 += 1; sumP2 += best.dInvArea; if (best.dInvArea > 0) nP2Worse += 1;
  }
  log(`      ARM P2 (PLACEBO — same operator, same COUNT (${nP2}), RANDOM LOCATIONS off the class): total delta ${sumP2.toFixed(6)} mm2   made-worse ${nP2Worse} (${pct(nP2Worse, Math.max(1, nP2))}%)`);
  log(`      [${((Date.now() - t7) / 1000).toFixed(1)}s]`);
  const beatsP1 = Math.abs(sumBest) >= 2 * Math.abs(sumRand) && sumBest < 0;
  const beatsP2 = Math.abs(sumBest) >= 2 * Math.abs(sumP2) && sumBest < 0;
  const clearedPct = (aCleared / Math.max(1e-30, tArea)) * 100;
  const verdict7 = clearedPct >= 25 && beatsP1 && beatsP2 ? 'WIN' : 'REFUTED';
  log('');
  log(`      *** PR3 VERDICT: cleared ${clearedPct.toFixed(2)}% of target area (kill line 25%); beats P1 by 2x? ${beatsP1 ? 'YES' : 'NO'}; beats P2 by 2x? ${beatsP2 ? 'YES' : 'NO'}  =>  ${verdict7} ***`);
  log(`      PR4 FLOOR (two-sided): the operator must not increase inverted area. It made ${pct(nWorse, Math.max(1, nLegal))}% of targets WORSE.`);
  log('');
  log('      7c  THE SAME FLIP AGAINST A MESH-ONLY OBJECTIVE (B1 parameter fold). No rA, no ill-conditioning,');
  log('          no analytic reference at all — so a curtain facet cannot hide behind a broken ruler.');
  log(`          targets that ARE B1-folds: ${nFoldT} of ${targets.length}   fold CLEARED on both children: ${nFoldCleared} (${pct(nFoldCleared, Math.max(1, nFoldT))}% of folded targets)  AREA ${aFoldCleared.toFixed(4)} mm2`);
  log(`          total delta FOLD area ${sumFold.toFixed(6)} mm2 (negative = improvement)`);
  R.stage7b = {
    targets: targets.length, targetAreaMm2: tArea, legal: nLegal, cleared: nCleared, clearedAreaMm2: aCleared,
    clearedPctOfTargetArea: clearedPct, sumBestDelta: sumBest, sumRandDelta: sumRand, sumP2Delta: sumP2,
    worsePct: (nWorse / Math.max(1, nLegal)) * 100, p2N: nP2, p2WorsePct: (nP2Worse / Math.max(1, nP2)) * 100,
    beatsP1, beatsP2, verdict: verdict7,
    foldTargets: nFoldT, foldCleared: nFoldCleared, foldClearedPct: (nFoldCleared / Math.max(1, nFoldT)) * 100,
    foldClearedAreaMm2: aFoldCleared, sumFoldDelta: sumFold,
  };
  log('');
}
OUT[key] = R;
}

runClassStages('CLASS-A  LOOSE: whole-mesh centroid-inverted', centInv, 'classLoose');
runClassStages(`CLASS-B  h-ROBUST SURVIVOR: INV_ALL in all ${INSETS.length * HS.length} (inset,h) configs`, SURV, 'classSurvivor');

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`S115 DONE ${el()}`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
writeFileSync(`${OUTDIR}/S115_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/S115_${TAG}.json`);
