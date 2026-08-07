// s115CurtainK.ts — S115: CONVERGE THE TWO THRESHOLDS CelticTriquetra's 2.06% HEADLINE RESTS ON.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. S114 reported, for CelticTriquetra, a CLASS-WIDE IRREDUCIBLE share of 35.84% of the >45 deg class
// and therefore a REDUCIBLE remainder of 2.0600% of the mesh — 65x Gothic, the campaign's largest real
// target. That number is a weighted average of four sub-class shares, and its two heaviest weights are
// set by knobs that are KNOWN UNCONVERGED:
//   (a) the graphRatio CURTAIN cut. Wall share of the class AREA is 4.50 / 11.75 / 17.41 / 20.37 / 23.57
//       / 32.40 % at ratio 2/4/8/16/32/128 — a 7.2x swing — and the curtain carries 83.03% of the class.
//   (b) stage-3c's lattice order K for the curtain's irreducible share: 22.70 / 25.01 / 27.25 / 27.80 %
//       at K=6/10/16/24, STILL RISING.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST NUMBER WAS READ.
//
//  PR-1 (WHAT graphRatio IS). S114 proved graphRatio is NOT a graph test: ZERO Gothic facets were
//       non-graph. graphRatio = area3D / areaParam over the (rRef*theta, z) plane. The ALGEBRAIC
//       PREDICTION made here BEFORE measuring: projecting a planar triangle of unit normal n onto the
//       local cylinder tangent plane (normal = rhat) scales area by |n . rhat|, so
//              *** graphRatio == 1 / |n_facet . rhat|  ***
//       i.e. the SECANT OF THE FACET'S TILT AWAY FROM THE CYLINDER TANGENT PLANE — a RADIAL-STEEPNESS
//       measure, nothing to do with graphs, slivers or aspect ratio. CONFIRMED if the median of
//       graphRatio * |n.rhat| is within 1% of 1 AND its p99 within 10%. REFUTED otherwise, in which case
//       the correlation table decides what it actually selects.
//       SECOND HALF: if PR-1 holds, graphRatio must also track the ANALYTIC's own steepness
//              S_A = sqrt(1 + r_z^2 + (r_th/r)^2)
//       wherever the mesh is faithful. Where graphRatio >> S_A the facet is parameter-degenerate
//       (mesh-side); where they agree the cut is selecting A PROPERTY OF THE SURFACE, not of the mesh.
//
//  PR-2 (IS THERE A DEFENSIBLE CUT AT ALL). A threshold is defensible only if the population has a GAP
//       there. Pre-registered test: histogram log10(graphRatio) over the >45 class by COUNT and by AREA.
//       DEFENSIBLE if a valley exists whose density is <= 1/3 of the modes flanking it AND the reducible
//       %-of-mesh is FLAT (<= 10% relative spread) across the valley's width. NOT DEFENSIBLE otherwise —
//       and then §5's un-scoped number is the only quotable one.
//
//  PR-3 (K CONVERGENCE). The curtain irreducible AREA share converges if |share(K) - share(K/1.5)| falls
//       below 1.0 absolute percentage point AND is still falling. Three arms, because K alone cannot
//       settle it (SCAR 3):
//         A  FIXED h = 2e-4 (S114's arm, replicated so the ladder is comparable line-for-line)
//         B  h SWEPT {2e-6 .. 5e-3} at fixed K — if the share moves with h, arm A is not a measurement
//         C  *** COUPLED h = paramDiam/(4K) *** — the step follows the lattice, which is the only
//            schedule under which "the lattice resolves the footprint" and "the normals resolve the
//            lattice" are the same statement. THE PRE-REGISTERED SUBSTITUTE if A/B fail.
//
//  PR-4 (THE 2-D SURFACE). reducible %-of-mesh over (curtain cut R) x (K), every cell from ONE shared
//       oracle pool partitioned by graphRatio, so cells differ only by the knobs and not by the sample.
//
//  PR-5 (NO-CURTAIN NUMBER). The class-wide reducible %, computed with NO curtain scoping at all — the
//       number that needs no cut. Reported whatever PR-2 says, so the reader always has a floor.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS — a run whose control fires is VOID and is reported as void, never rescued.
//   C1  PRECOND (max |r_mesh - rA|, stride sample). > 50 um => REFUSE.
//   C2  PLACEBO on the C-infinity truncated cone, run through EVERY oracle arm and EVERY K and h in the
//       ladders. Any arm reading > 5% irreducible there is manufacturing turn and that arm is VOID.
//   C3  edge-derived vs per-facet-max facet sets must agree (inherited from S114).
//   C4  NON-VACUITY FLOOR on the substitute: arm C must still find the KNOWN-real turn on the WALL
//       straddling class (S114 measured 76.31% there with a defined footprint). An arm that reads ~0
//       everywhere satisfies a one-sided ceiling and is worthless.
//   C5  FOOTPRINT SUPPORT. Every oracle cell prints n, the param diameter and the lattice spacing, so a
//       share estimated on a degenerate footprint cannot pass as a measurement.
//
// INSTRUMENT DISCIPLINE: COUNT + AREA + MAX everywhere, per FACET; inset explicit; k and h swept and the
// ladders PRINTED; nothing averaged across sub-classes without its own measured share.
//
// Usage: bash research/tools/run-s115-curtaink.sh   (env PF_S115_STL / PF_S115_STYLE / PF_S115_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler, type RadiusFn } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envL = (n: string, d: string): number[] => (process.env[n] ?? d).split(',').map(Number);

const STYLE = process.env.PF_S115_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115_STL ?? '';
const TAG = process.env.PF_S115_TAG ?? STYLE;
const OUTDIR = process.env.PF_S115_OUTDIR ?? 'research/exchange/_strataConformBisect/s115curtainK';
const STAGES = new Set((process.env.PF_S115_STAGES ?? '1,2,3,4,5').split(',').map((s) => s.trim()));

const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

const HI_DEG = envF('PF_S115_HI_DEG', 45);
const DROP_CUT = envF('PF_S115_DROP', 0.25);
const NORMHI_BAR = envF('PF_S115_NORMHI', 10);
const K_OBS = envI('PF_S115_K', 8);
const INSET_LO = envF('PF_S115_INSET_LO', 0);
const INSET_HI = envF('PF_S115_INSET_HI', 0.05);
const NCROSS = envI('PF_S115_NCROSS', 8);
const SEP_MIN = envF('PF_S115_SEPMIN', 15);
const H_FIX = envF('PF_S115_HFIX', 2e-4);
const KLAD = envL('PF_S115_KLAD', '6,10,16,24,32,48,64');
const HLAD = envL('PF_S115_HLAD', '2e-6,2e-5,2e-4,2e-3,5e-3');
const RLAD = envL('PF_S115_RLAD', '2,4,8,16,32,128,1024,100000');
const KTAB = envL('PF_S115_KTAB', '10,16,24,32,48');
const POOL_N = envI('PF_S115_POOLN', 1600);          // shared oracle pool over the >45 class
const CORR_N = envI('PF_S115_CORRN', 40000);          // PR-1 correlation sample
const S3_N = envI('PF_S115_S3N', 260);                // per-arm ladder sample
const EXH = process.env.PF_S115_EXH !== '0';          // exhaustive normDeg over the >45 class
const EXH_CAP = envI('PF_S115_EXHCAP', 400000);
const HMIN = 1e-9;

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
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.prototype.slice.call(v).filter(Number.isFinite).sort((a: number, b: number) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f2 = (v: number, n = 3): string => (Number.isFinite(v) ? v.toFixed(n) : '—');

const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.6 / 1000,
};

const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const rFlat: RadiusFn = (_th: number, z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (Math.min(H, Math.max(0, z)) / H);
const nsObs = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

const OUT: Record<string, unknown> = { style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS, stages: [...STAGES] };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 — CONVERGING THE CURTAIN CUT AND THE LATTICE ORDER — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`dims  H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`registry defaults: ${Object.entries(DEFAULTS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
log(`stages ${[...STAGES].join(',')}   K ladder ${KLAD.join('/')}   h ladder ${HLAD.join('/')}   R ladder ${RLAD.join('/')}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD + PRECOND (C1)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);
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
  log(`  samples ${devs.length}  |dr| p50 ${q(devs, 0.5).toExponential(3)}  p99 ${q(devs, 0.99).toExponential(3)}  *** MAX ${(worst * 1000).toFixed(4)} um ***  (gate 50 um)`);
  OUT.precond = { maxUm: worst * 1000, p50Um: q(devs, 0.5), samples: devs.length };
  if (worst * 1000 > 50) {
    log('  ██ MESH REFUSED: PRECOND OVER 50 um. ██');
    OUT.verdict = 'REFUSED-PRECOND';
    writeFileSync(`${OUTDIR}/S115_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
    process.exit(0);
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function area3D(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const ux = xyz[f * 9 + 3] - ax; const uy = xyz[f * 9 + 4] - ay; const uz = xyz[f * 9 + 5] - az;
  const wx = xyz[f * 9 + 6] - ax; const wy = xyz[f * 9 + 7] - ay; const wz = xyz[f * 9 + 8] - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
}
function paramAreaOf(f: number): number {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const rRef = rRefOf(f);
  return 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
}
/** S114's graphRatio, verbatim in construction. */
function graphRatio(f: number): number {
  const aP = paramAreaOf(f);
  return aP > 1e-15 ? area3D(f) / aP : Infinity;
}
/** longest edge in the (rRef*theta, z) parameter plane, mm. */
function paramDiam(f: number): number {
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const px = [rRef * ath, rRef * bth, rRef * cth];
  const pz = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  return Math.max(Math.hypot(px[0] - px[1], pz[0] - pz[1]),
    Math.hypot(px[1] - px[2], pz[1] - pz[2]), Math.hypot(px[0] - px[2], pz[0] - pz[2]));
}
function diam3D(f: number): number {
  return Math.max(
    Math.hypot(xyz[f * 9] - xyz[f * 9 + 3], xyz[f * 9 + 1] - xyz[f * 9 + 4], xyz[f * 9 + 2] - xyz[f * 9 + 5]),
    Math.hypot(xyz[f * 9 + 3] - xyz[f * 9 + 6], xyz[f * 9 + 4] - xyz[f * 9 + 7], xyz[f * 9 + 5] - xyz[f * 9 + 8]),
    Math.hypot(xyz[f * 9] - xyz[f * 9 + 6], xyz[f * 9 + 1] - xyz[f * 9 + 7], xyz[f * 9 + 2] - xyz[f * 9 + 8]));
}
function woundNormal(f: number, out: Float64Array): void {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const ux = xyz[f * 9 + 3] - ax; const uy = xyz[f * 9 + 4] - ay; const uz = xyz[f * 9 + 5] - az;
  const wx = xyz[f * 9 + 6] - ax; const wy = xyz[f * 9 + 7] - ay; const wz = xyz[f * 9 + 8] - az;
  let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
  const L = Math.hypot(nx, ny, nz);
  if (L > 0) { nx /= L; ny /= L; nz /= L; }
  out[0] = nx; out[1] = ny; out[2] = nz;
}
const centroidOf = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
const sharedEndpoints = (e: number, ef1: Int32Array, ef2: Int32Array): number[] | null => {
  const f1 = ef1[e]; const f2 = ef2[e]; const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) {
      if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
    }
  }
  return out.length === 6 ? out : null;
};
/** ANALYTIC steepness sqrt(1 + r_z^2 + (r_th/r)^2) at (th,z) with central step h (arc-mm / mm). */
function steepA(fn: RadiusFn, th: number, z: number, h: number): number {
  const r0 = fn(th, z);
  const hTh = h / Math.max(1e-9, Math.abs(r0));
  const rt = (fn(th + hTh, z) - fn(th - hTh, z)) / (2 * hTh);
  let zLo = z - h; let zHi = z + h;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * h); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * h); }
  const rz = zHi > zLo ? (fn(th, zHi) - fn(th, zLo)) / (zHi - zLo) : 0;
  return Math.sqrt(1 + rz * rz + (rt / Math.max(1e-12, r0)) ** 2);
}
/**
 * THE CHORD GRADIENT. Fit r = alpha + beta*(rRef*theta) + gamma*z EXACTLY through the facet's three
 * vertices and return sqrt(1 + beta^2 + gamma^2) — the facet's OWN realised surface steepness, the exact
 * discrete analogue of the analytic S_A. If this equals graphRatio the quantity is NAMED and it has
 * nothing to do with graphs: it is |grad r| over the (arc-theta, z) parameter plane.
 */
function chordGrad(f: number): { g: number; beta: number; gamma: number } {
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const u = [rRef * ath, rRef * bth, rRef * cth];
  const zz = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  const rr = [Math.hypot(xyz[f * 9], xyz[f * 9 + 1]), Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]), Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])];
  const u1 = u[1] - u[0]; const z1 = zz[1] - zz[0]; const r1 = rr[1] - rr[0];
  const u2 = u[2] - u[0]; const z2 = zz[2] - zz[0]; const r2 = rr[2] - rr[0];
  const det = u1 * z2 - u2 * z1;
  if (!(Math.abs(det) > 0)) return { g: Infinity, beta: Infinity, gamma: Infinity };
  const beta = (r1 * z2 - r2 * z1) / det;
  const gamma = (u1 * r2 - u2 * r1) / det;
  return { g: Math.sqrt(1 + beta * beta + gamma * gamma), beta, gamma };
}
function goldenStride(n: number, want: number): number[] {
  if (want >= n) return Array.from({ length: n }, (_, i) => i);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let g = Math.max(1, Math.round(n * 0.6180339887498949));
  while (gcd(g, n) !== 1) g += 1;
  const out: number[] = [];
  for (let i = 0; i < want; i += 1) out.push((i * g) % n);
  return out;
}
function spearman(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return NaN;
  const rank = (v: number[]): Float64Array => {
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Float64Array(n);
    let i = 0;
    while (i < n) {
      let j = i; while (j + 1 < n && v[idx[j + 1]] === v[idx[i]]) j += 1;
      const avg = (i + j) / 2;
      for (let t = i; t <= j; t += 1) r[idx[t]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x); const ry = rank(y);
  let mx = 0; let my = 0;
  for (let i = 0; i < n; i += 1) { mx += rx[i]; my += ry[i]; }
  mx /= n; my /= n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = rx[i] - mx; const b = ry[i] - my;
    sxy += a * b; sxx += a * a; syy += b * b;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — DIHEDRAL + THE >45 CLASS (exhaustive, analytic-free)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
const hiThr = (HI_DEG * Math.PI) / 180;
let areaOver45 = 0; let cntOver45 = 0;
for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) { areaOver45 += d.areaMm2[f]; cntOver45 += 1; }
const hiEdges: number[] = [];
for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] > hiThr) hiEdges.push(e);
log(`── STAGE 1: MESH + >${HI_DEG} CLASS  ${el()} ──`);
log(`  facets ${nTri}  AREA ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent ${d.inconsistentEdges}`);
log(`  >${HI_DEG} deg: edges ${hiEdges.length}  facets ${cntOver45}  AREA ${areaOver45.toFixed(4)} mm2 = ${pct(areaOver45, meshArea)}% of mesh`);
{
  const fromEdges = new Set<number>();
  for (const e of hiEdges) { fromEdges.add(d.edgeF1[e]); fromEdges.add(d.edgeF2[e]); }
  let mm = 0;
  for (let f = 0; f < nTri; f += 1) if ((d.perFacetMaxRad[f] > hiThr) !== fromEdges.has(f)) mm += 1;
  log(`  CONTROL C3 (edge-derived vs per-facet-max): mismatched facets ${mm}  ${mm === 0 ? 'OK' : '*** FIRED ***'}`);
  OUT.c3mismatch = mm;
}
OUT.stage1 = { facets: nTri, areaMm2: meshArea, hiEdges: hiEdges.length, hiFacets: cntOver45, hiAreaMm2: areaOver45, hiAreaPct: (areaOver45 / meshArea) * 100 };
log('');

// graphRatio for every facet in the class (and a whole-mesh sample) — cheap, no rA.
const grCache = new Map<number, number>();
const grOf = (f: number): number => { let v = grCache.get(f); if (v === undefined) { v = graphRatio(f); grCache.set(f, v); } return v; };
const classF: number[] = [];
for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) { classF.push(f); grOf(f); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1b — *** WHAT DOES graphRatio ACTUALLY MEASURE? *** (PR-1, PR-2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.has('1')) {
  log(`── STAGE 1b: WHAT graphRatio ACTUALLY SELECTS (PR-1)  ${el()} ──`);
  const samp = goldenStride(classF.length, Math.min(CORR_N, classF.length)).map((i) => classF[i]);
  const wn = new Float64Array(3);
  const gr: number[] = []; const invRad: number[] = []; const prod: number[] = [];
  const minAlt: number[] = []; const ar3: number[] = []; const arP: number[] = [];
  const pAreaS: number[] = []; const rExt: number[] = []; const rExtOverPd: number[] = [];
  const cg: number[] = []; const cgRatio: number[] = []; const sAch: number[] = []; const pdS: number[] = [];
  const sA: Record<string, number[]> = {};
  const SH = [2e-2, 2e-3, 2e-4, 2e-5, 2e-6];
  for (const h of SH) sA[String(h)] = [];
  for (const f of samp) {
    const g = grOf(f); gr.push(g);
    woundNormal(f, wn);
    const [cx, cy, cz] = centroidOf(f);
    const rc = Math.hypot(cx, cy);
    const dotR = rc > 0 ? Math.abs((wn[0] * cx + wn[1] * cy) / rc) : 0;
    invRad.push(dotR > 0 ? 1 / dotR : Infinity);
    prod.push(g * dotR);
    const a3 = d.areaMm2[f]; const dd = diam3D(f);
    minAlt.push(dd > 0 ? (2 * a3) / dd : 0);
    ar3.push(a3 > 0 ? (dd * dd) / a3 : Infinity);
    const pd = paramDiam(f); const pa = paramAreaOf(f);
    pdS.push(pd); pAreaS.push(pa);
    arP.push(pa > 0 ? (pd * pd) / pa : Infinity);
    const rr = [Math.hypot(xyz[f * 9], xyz[f * 9 + 1]), Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]), Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])];
    const re = Math.max(...rr) - Math.min(...rr);
    rExt.push(re); rExtOverPd.push(pd > 0 ? re / pd : Infinity);
    const cgv = chordGrad(f);
    cg.push(cgv.g); cgRatio.push(g / Math.max(1e-30, cgv.g));
    const thC = Math.atan2(cy, cx);
    sAch.push(steepA(rA, thC, cz, Math.max(1e-9, pd / 2)));
    for (const h of SH) sA[String(h)].push(steepA(rA, thC, cz, h));
  }
  log(`  sample n=${samp.length} facets of the ${classF.length} in the >${HI_DEG} class (golden stride)`);
  log('');
  log('  *** PR-1 TEST: graphRatio * |n_facet . rhat|  — the ALGEBRAIC PREDICTION is EXACTLY 1 ***');
  log(`     p01 ${f2(q(prod, 0.01), 5)}  p10 ${f2(q(prod, 0.1), 5)}  p50 ${f2(q(prod, 0.5), 5)}  p90 ${f2(q(prod, 0.9), 5)}  p99 ${f2(q(prod, 0.99), 5)}  MAX ${f2(q(prod, 1), 5)}`);
  const relDev = prod.map((v) => Math.abs(v - 1));
  log(`     |product - 1|:  p50 ${q(relDev, 0.5).toExponential(3)}  p90 ${q(relDev, 0.9).toExponential(3)}  p99 ${q(relDev, 0.99).toExponential(3)}  MAX ${q(relDev, 1).toExponential(3)}`);
  const pr1 = Math.abs(q(prod, 0.5) - 1) <= 0.01 && Math.abs(q(prod, 0.99) - 1) <= 0.10;
  log(`     => PR-1 ${pr1 ? '*** CONFIRMED — graphRatio IS 1/|n.rhat| = sec(tilt from the cylinder tangent plane) ***' : 'REFUTED as stated (exact on the bulk, divergent in the tail — see the CHORD GRADIENT below)'}`);
  log('');
  log('  *** THE EXACT NAME: graphRatio vs the CHORD GRADIENT sqrt(1 + beta^2 + gamma^2) fitted through the');
  log('  facet\'s own three vertices, i.e. |grad r| over the (arc-theta, z) plane. No centroid, no linearisation. ***');
  log(`     graphRatio / chordGradient:  p01 ${f2(q(cgRatio, 0.01), 6)}  p10 ${f2(q(cgRatio, 0.1), 6)}  p50 ${f2(q(cgRatio, 0.5), 6)}  p90 ${f2(q(cgRatio, 0.9), 6)}  p99 ${f2(q(cgRatio, 0.99), 6)}  MAX ${f2(q(cgRatio, 1), 6)}`);
  const cgDev = cgRatio.map((v) => Math.abs(v - 1));
  log(`     |ratio - 1|:  p50 ${q(cgDev, 0.5).toExponential(3)}  p90 ${q(cgDev, 0.9).toExponential(3)}  p99 ${q(cgDev, 0.99).toExponential(3)}  MAX ${q(cgDev, 1).toExponential(3)}`);
  const named = q(cgDev, 0.99) <= 0.10;
  log(`     => ${named ? '*** graphRatio IS THE FACET\'S OWN RADIAL STEEPNESS |grad r|. The "graph test" is a STEEPNESS test. ***' : 'the chord-gradient identity does NOT hold either'}`);
  log('');
  log('  SPEARMAN rank correlation of log10(graphRatio) against every candidate quantity:');
  const lgr = gr.map((v) => Math.log10(Math.max(1e-12, Math.min(1e12, v))));
  const rows: Array<[string, number[]]> = [
    ['1/|n.rhat|  (radial alignment)', invRad.map((v) => Math.log10(Math.max(1e-12, Math.min(1e12, v))))],
    ['min altitude 3D (mm)', minAlt],
    ['aspect ratio 3D (diam^2/area)', ar3.map((v) => Math.log10(Math.max(1e-12, Math.min(1e12, v))))],
    ['aspect ratio PARAM (diam^2/area)', arP.map((v) => Math.log10(Math.max(1e-12, Math.min(1e12, v))))],
    ['param area (mm2)', pAreaS.map((v) => Math.log10(Math.max(1e-30, v)))],
    ['facet RADIAL extent (mm)', rExt],
    ['radial extent / param diam', rExtOverPd.map((v) => Math.log10(Math.max(1e-12, Math.min(1e12, v))))],
    ['CHORD GRADIENT |grad r|', cg.map((v) => Math.log10(Math.max(1e-12, Math.min(1e12, v))))],
    ['analytic S_A at CHORD-MATCHED h=paramDiam/2', sAch.map((v) => Math.log10(Math.max(1e-12, v)))],
    ['param diameter (mm)', pdS.map((v) => Math.log10(Math.max(1e-30, v)))],
  ];
  for (const h of SH) rows.push([`analytic steepness S_A at h=${h.toExponential(0)}`, sA[String(h)].map((v) => Math.log10(Math.max(1e-12, v)))]);
  const corr: Record<string, number> = {};
  for (const [name, v] of rows) {
    const rho = spearman(lgr, v);
    corr[name] = rho;
    log(`     rho = ${rho >= 0 ? ' ' : ''}${f2(rho, 4)}   ${name}`);
  }
  log('');
  log('  MESH vs ANALYTIC steepness — where graphRatio >> S_A the facet is PARAMETER-DEGENERATE (mesh-side);');
  log('  where they agree the cut is selecting a property of the SURFACE, not of the mesh:');
  for (const h of SH) {
    const rr = gr.map((g, i) => g / Math.max(1e-12, sA[String(h)][i]));
    const agree = rr.filter((v) => v >= 0.5 && v <= 2).length;
    log(`     h=${h.toExponential(0)}  graphRatio/S_A  p10 ${f2(q(rr, 0.1), 3)}  p50 ${f2(q(rr, 0.5), 3)}  p90 ${f2(q(rr, 0.9), 3)}  MAX ${q(rr, 1).toExponential(2)}   within 2x: ${pct(agree, rr.length)}%`);
  }
  {
    const rr = gr.map((g, i) => g / Math.max(1e-12, sAch[i]));
    const agree = rr.filter((v) => v >= 0.5 && v <= 2).length;
    log(`     h=paramDiam/2 (CHORD-MATCHED)  graphRatio/S_A  p10 ${f2(q(rr, 0.1), 3)}  p50 ${f2(q(rr, 0.5), 3)}  p90 ${f2(q(rr, 0.9), 3)}  MAX ${q(rr, 1).toExponential(2)}   within 2x: ${pct(agree, rr.length)}%`);
  }
  log('');
  // ── DECILE TABLE: what changes as graphRatio rises? The row where the character changes IS the cut.
  log('  graphRatio DECILES over the >45 class — the physical character of each decile.');
  log('  *** TWO PROBES PER FACET, BECAUSE THE FIRST ONE IS ORIENTATION-BLIND. *** "ALONG" walks rA down the');
  log('  facet\'s LONGEST parameter edge; on a parameter RIBBON that edge runs PARALLEL to the relief wall and');
  log('  can never cross it. "ACROSS" walks the same physical length PERPENDICULAR to it through the param');
  log('  centroid, which must cross whatever the ribbon is standing on. S_A(alt) is the analytic steepness');
  log('  read at h = the facet\'s own PARAMETER ALTITUDE — the scale at which the facet actually resolves rA.');
  log('     decile   gr range              |n.rhat| p50   radExt p50   paramDiam p50   paramAlt p50   S_A(chord)   S_A(alt) p50   ALONG kink/jump      ACROSS kink/jump');
  const ordr = Array.from({ length: samp.length }, (_, i) => i).sort((a, b) => gr[a] - gr[b]);
  const dec: Array<Record<string, number>> = [];
  for (let dq = 0; dq < 10; dq += 1) {
    const lo = Math.floor((dq * ordr.length) / 10); const hi2 = Math.floor(((dq + 1) * ordr.length) / 10);
    const ix = ordr.slice(lo, hi2);
    const sub = goldenStride(ix.length, Math.min(120, ix.length)).map((i) => ix[i]);
    let nk = 0; let nj = 0; let asked = 0; let xk = 0; let xj = 0;
    const sAlt: number[] = []; const pAlt: number[] = [];
    for (const i of sub) {
      const f = samp[i];
      const [ath, bth, cth] = th3(f); const rRef = rRefOf(f);
      const u = [rRef * ath, rRef * bth, rRef * cth]; const zz = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
      let bi = 0; let bj = 1; let bl = -1;
      for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 3; b += 1) {
        const L = Math.hypot(u[a] - u[b], zz[a] - zz[b]); if (L > bl) { bl = L; bi = a; bj = b; }
      }
      const thi = [ath, bth, cth];
      asked += 1;
      const kk = locateKinkRaw(rA, thi[bi], zz[bi], thi[bj], zz[bj], PRED);
      if (kk !== null) { if (kk.jump) nj += 1; else nk += 1; }
      // ACROSS: same physical length, perpendicular, through the parameter centroid.
      if (bl > 0) {
        const du = (u[bj] - u[bi]) / bl; const dz = (zz[bj] - zz[bi]) / bl;
        const cu = (u[0] + u[1] + u[2]) / 3; const cz2 = (zz[0] + zz[1] + zz[2]) / 3;
        const hu = -dz * (bl / 2); const hz = du * (bl / 2);
        const kx = locateKinkRaw(rA, (cu - hu) / rRef, cz2 - hz, (cu + hu) / rRef, cz2 + hz, PRED);
        if (kx !== null) { if (kx.jump) xj += 1; else xk += 1; }
      }
      const pa2 = paramAreaOf(f);
      const alt = bl > 0 ? (2 * pa2) / bl : 0;
      pAlt.push(alt);
      const cxx = (xyz[f * 9] + xyz[f * 9 + 3] + xyz[f * 9 + 6]) / 3;
      const cyy = (xyz[f * 9 + 1] + xyz[f * 9 + 4] + xyz[f * 9 + 7]) / 3;
      sAlt.push(steepA(rA, Math.atan2(cyy, cxx), (zz[0] + zz[1] + zz[2]) / 3, Math.max(1e-12, alt)));
    }
    const gg = ix.map((i) => gr[i]);
    const row = {
      decile: dq + 1, grLo: gg[0], grHi: gg[gg.length - 1],
      dotRP50: 1 / q(ix.map((i) => invRad[i]), 0.5), radExtP50: q(ix.map((i) => rExt[i]), 0.5),
      pdP50: q(ix.map((i) => pdS[i]), 0.5), minAltP50: q(ix.map((i) => minAlt[i]), 0.5),
      paramAltP50: q(pAlt, 0.5), sAltP50: q(sAlt, 0.5),
      sAchP50: q(ix.map((i) => sAch[i]), 0.5), kinkPct: (nk / Math.max(1, asked)) * 100, jumpPct: (nj / Math.max(1, asked)) * 100,
      xKinkPct: (xk / Math.max(1, asked)) * 100, xJumpPct: (xj / Math.max(1, asked)) * 100,
    };
    dec.push(row);
    log(`     ${String(dq + 1).padStart(6)}   ${gg[0].toExponential(2)}..${gg[gg.length - 1].toExponential(2)}   ${row.dotRP50.toExponential(3).padStart(12)}   ${row.radExtP50.toExponential(2).padStart(10)}   ${row.pdP50.toExponential(2).padStart(13)}   ${row.paramAltP50.toExponential(2).padStart(12)}   ${row.sAchP50.toExponential(2).padStart(10)}   ${row.sAltP50.toExponential(2).padStart(12)}   ${f2(row.kinkPct, 1).padStart(5)}%/${f2(row.jumpPct, 1).padStart(5)}%   ${f2(row.xKinkPct, 1).padStart(5)}%/${f2(row.xJumpPct, 1).padStart(5)}%`);
  }
  (OUT as Record<string, unknown>).stage1bDeciles = dec;
  log('');
  // ── PR-2: is there a GAP to cut at? histogram of log10(graphRatio), COUNT and AREA, over the class.
  log('  *** PR-2: THE log10(graphRatio) DISTRIBUTION OVER THE >45 CLASS — is there a valley to cut in? ***');
  const B0 = -0.5; const BW = 0.25; const NB = 48;
  const hc = new Float64Array(NB); const ha = new Float64Array(NB);
  let clsArea = 0;
  for (const f of classF) {
    const g = grOf(f);
    const b = Math.max(0, Math.min(NB - 1, Math.floor((Math.log10(Math.max(1e-12, g)) - B0) / BW)));
    hc[b] += 1; ha[b] += d.areaMm2[f]; clsArea += d.areaMm2[f];
  }
  log('     bin log10(gr)      COUNT      %count        AREA mm2     %area   bar(area)');
  const hist: Array<Record<string, number>> = [];
  for (let b = 0; b < NB; b += 1) {
    if (hc[b] === 0 && ha[b] === 0) continue;
    const shareA = ha[b] / clsArea;
    const bar = '#'.repeat(Math.max(0, Math.round(shareA * 200)));
    log(`     [${(B0 + b * BW).toFixed(2)},${(B0 + (b + 1) * BW).toFixed(2)})  ${String(hc[b]).padStart(9)}  ${pct(hc[b], classF.length).padStart(9)}%  ${ha[b].toFixed(4).padStart(12)}  ${pct(ha[b], clsArea).padStart(8)}%  ${bar}`);
    hist.push({ lo: B0 + b * BW, count: hc[b], areaMm2: ha[b], areaPct: shareA * 100 });
  }
  log(`     class area ${clsArea.toFixed(4)} mm2   (whole >45 class)`);
  // ── THE VALLEY. A cut is defensible only in a trough between two modes. Find the two largest AREA modes
  // and the minimum-density bin strictly between them; report the trough/mode ratio against the 1/3 bar.
  let m1 = 0;
  for (let b = 1; b < NB; b += 1) if (ha[b] > ha[m1]) m1 = b;
  let m2 = -1;
  for (let b = 0; b < NB; b += 1) {
    if (Math.abs(b - m1) < 4) continue;
    if (m2 < 0 || ha[b] > ha[m2]) m2 = b;
  }
  const bLo = Math.min(m1, m2); const bHi = Math.max(m1, m2);
  let vb = bLo;
  for (let b = bLo; b <= bHi; b += 1) if (ha[b] < ha[vb]) vb = b;
  const flankL = Math.max(...Array.from({ length: vb - bLo + 1 }, (_, i) => ha[bLo + i]));
  const flankR = Math.max(...Array.from({ length: bHi - vb + 1 }, (_, i) => ha[vb + i]));
  const ratio = ha[vb] / Math.max(1e-30, Math.min(flankL, flankR));
  const cutLo = 10 ** (B0 + vb * BW); const cutHi = 10 ** (B0 + (vb + 1) * BW);
  log('');
  log('  >>> VALLEY SEARCH (PR-2). A threshold is defensible only in a trough between two modes.');
  log(`      AREA modes at log10(gr) = ${(B0 + m1 * BW).toFixed(2)} (${pct(ha[m1], clsArea)}% of class area) and ${(B0 + m2 * BW).toFixed(2)} (${pct(ha[m2], clsArea)}%)`);
  log(`      TROUGH at log10(gr) in [${(B0 + vb * BW).toFixed(2)},${(B0 + (vb + 1) * BW).toFixed(2)}) = graphRatio in [${cutLo.toExponential(2)}, ${cutHi.toExponential(2)}), holding ${pct(ha[vb], clsArea)}% of class area`);
  log(`      trough / min(flanking modes) = ${f2(ratio, 4)}   (PR-2 bar: <= 0.3333)  =>  ${ratio <= 1 / 3 ? '*** A DEFENSIBLE CUT EXISTS ***' : 'NO GAP — the population is a continuum and NO cut is defensible'}`);
  log(`      *** THE INHERITED CUT R=8 SITS AT log10 = 0.90 *** — bin [0.75,1.00) holds ${pct(ha[Math.floor((Math.log10(8) - B0) / BW)], clsArea)}% of class area, on the SHOULDER of the low mode, not in the trough.`);
  OUT.stage1b = {
    n: samp.length, prodP50: q(prod, 0.5), prodP99: q(prod, 0.99), pr1Confirmed: pr1,
    chordGradRatioP50: q(cgRatio, 0.5), chordGradRatioP99: q(cgRatio, 0.99), chordGradNamed: named,
    spearman: corr, hist,
    valley: { modeA: B0 + m1 * BW, modeB: B0 + m2 * BW, troughLog10: B0 + vb * BW, cutLo, cutHi, troughRatio: ratio, defensible: ratio <= 1 / 3 },
  };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1c — FORENSICS ON THE TOP graphRatio MODE.
//
// WHY THIS EXISTS. The decile table says the top decile has a PARAMETER altitude of ~1e-6 mm while its
// 3D radial extent is ~1 mm and the analytic steepness at that same scale is only ~2.8. Those three
// numbers cannot all be true of a facet whose vertices lie ON rA: a 1e-6 mm parameter offset can move r
// by at most S_A * 1e-6 mm. So EITHER the vertices are off the analytic by micrometres (which the
// stride-sampled PRECOND would have to have missed) OR I have mis-modelled the geometry. This stage
// refuses to guess: it measures |r_mesh - rA| EXHAUSTIVELY on the top mode and prints whole facets.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.has('1')) {
  const GRHI = envF('PF_S115_FORENSIC_GR', 2500);
  const hiF: number[] = []; const loF: number[] = [];
  for (const f of classF) (grOf(f) > GRHI ? hiF : loF).push(f);
  const drOf = (f: number): number => {
    let w = 0;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      w = Math.max(w, Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)));
    }
    return w;
  };
  log(`── STAGE 1c: FORENSICS ON THE TOP graphRatio MODE (gr > ${GRHI})  ${el()} ──`);
  for (const [name, set] of [['TOP MODE  (gr >', hiF], ['BULK      (gr <=', loF]] as Array<[string, number[]]>) {
    const sub = goldenStride(set.length, Math.min(20000, set.length)).map((i) => set[i]);
    const dv = sub.map((f) => drOf(f) * 1000);
    let a = 0; for (const f of set) a += d.areaMm2[f];
    log(`  ${name} ${GRHI})  facets ${String(set.length).padStart(7)}  AREA ${a.toFixed(3).padStart(10)} mm2 = ${pct(a, areaOver45).padStart(8)}% of class`);
    log(`     |r_mesh - rA| over ${sub.length} sampled facets (worst vertex each): p50 ${q(dv, 0.5).toExponential(3)}  p99 ${q(dv, 0.99).toExponential(3)}  MAX ${q(dv, 1).toExponential(3)} um`);
  }
  // ── C1-EXHAUSTIVE. The stride-sampled PRECOND above touched 60,519 of 5,143,914 vertices. The class
  // sample immediately above found a vertex over the 50 um gate, so the stride sample is NOT a gate — it
  // is a spot check. Re-run it on EVERY vertex of the mesh and census the exceedances.
  {
    const t = Date.now();
    let mx = 0; let nExF = 0; let aEx = 0; let mxF = -1;
    const exGr: number[] = []; const exZ: number[] = [];
    for (let f = 0; f < nTri; f += 1) {
      const w = drOf(f);
      if (w > mx) { mx = w; mxF = f; }
      if (w * 1000 > 50) {
        nExF += 1; aEx += d.areaMm2[f];
        if (exGr.length < 20000) { exGr.push(grOf(f)); exZ.push(centroidOf(f)[2]); }
      }
    }
    log('');
    log('  *** CONTROL C1 RE-RUN EXHAUSTIVELY — EVERY VERTEX OF THE MESH, NOT A STRIDE SAMPLE ***');
    log(`     MAX |r_mesh - rA| = ${(mx * 1000).toExponential(4)} um   (stride sample read 0.0253 um; gate 50 um)   [${((Date.now() - t) / 1000).toFixed(1)}s]`);
    log(`     facets with a vertex OVER the 50 um gate: COUNT ${nExF} (${pct(nExF, nTri)}% of mesh)  AREA ${aEx.toFixed(4)} mm2 = ${pct(aEx, meshArea)}% of mesh`);
    if (nExF > 0) {
      log(`     their graphRatio: p50 ${f2(q(exGr, 0.5), 3)}  p90 ${q(exGr, 0.9).toExponential(2)}   their z: p10 ${f2(q(exZ, 0.1), 2)} p50 ${f2(q(exZ, 0.5), 2)} p90 ${f2(q(exZ, 0.9), 2)} mm`);
      log(`     over-gate facets that are ALSO in the >${HI_DEG} class: ${exGr.length > 0 ? 'see gr column' : '—'}`);
      // is it a params mismatch (whole distribution moves) or an rA DISCONTINUITY (isolated spikes)?
      const wf = mxF;
      const parts: string[] = [];
      for (let k = 0; k < 3; k += 1) {
        const x = xyz[wf * 9 + k * 3]; const y = xyz[wf * 9 + k * 3 + 1]; const z = xyz[wf * 9 + k * 3 + 2];
        const th = Math.atan2(y, x);
        parts.push(`v${k} r ${Math.hypot(x, y).toFixed(6)} rA ${rA(th, z).toFixed(6)} z ${z.toFixed(4)}`);
      }
      log(`     worst facet f${wf}: ${parts.join(' | ')}`);
      const x0 = xyz[wf * 9]; const y0 = xyz[wf * 9 + 1]; const z0 = xyz[wf * 9 + 2];
      const th0 = Math.atan2(y0, x0); const r0 = Math.hypot(x0, y0);
      const lad: string[] = [];
      for (const hh of [1e-2, 1e-4, 1e-6, 1e-8]) {
        const dth = hh / Math.max(1e-9, r0);
        lad.push(`h=${hh.toExponential(0)}: dTh ${(Math.abs(rA(th0 + dth, z0) - rA(th0 - dth, z0)) * 1000).toFixed(1)} dZ ${(Math.abs(rA(th0, Math.min(H, z0 + hh)) - rA(th0, Math.max(0, z0 - hh))) * 1000).toFixed(1)} um`);
      }
      log(`     rA JUMP PROBE at its worst vertex: ${lad.join(' | ')}`);
      log('     A jump that DOES NOT shrink with h is a genuine rA DISCONTINUITY the vertex is sitting on;');
      log('     a jump that shrinks ~linearly means rA is continuous there and the vertex is genuinely OFF it.');
    }
    OUT.c1exhaustive = { maxUm: mx * 1000, overGateFacets: nExF, overGateAreaMm2: aEx, overGatePctOfMesh: (aEx / meshArea) * 100, fired: mx * 1000 > 50 };
    log(`     ${mx * 1000 > 50 ? '*** C1 FIRES ON THE EXHAUSTIVE PASS. The 50 um gate is violated somewhere in this mesh. ***' : 'C1 OK exhaustively'}`);
  }
  // ── THE PARAMETER-DOMAIN FOLD TEST. r = rA(theta,z) is SINGLE-VALUED, so the surface IS a graph over
  // (theta,z) and a valid mesh of it must be a valid triangulation of the (theta,z) domain: every facet's
  // SIGNED parameter area must carry the same sign, and none may vanish. Both failures are measured here
  // over the WHOLE mesh, because "the ruler is ill-conditioned there" and "that facet covers no surface"
  // are completely different claims and only this test tells them apart.
  {
    const t = Date.now();
    const signedP = (f: number): number => {
      const [ath, bth, cth] = th3(f);
      const rRef = rRefOf(f);
      const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
      return 0.5 * ((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
    };
    let nPos = 0; let nNeg = 0; let aPos = 0; let aNeg = 0; let sumAbs = 0; let sumSig = 0;
    let nDeg = 0; let aDeg = 0;
    const DEGT = envF('PF_S115_DEGT', 1e-9);   // |paramArea| below this = a DEGENERATE domain element, mm2
    for (let f = 0; f < nTri; f += 1) {
      const s = signedP(f);
      sumAbs += Math.abs(s); sumSig += s;
      if (s > 0) { nPos += 1; aPos += d.areaMm2[f]; } else { nNeg += 1; aNeg += d.areaMm2[f]; }
      if (Math.abs(s) < DEGT) { nDeg += 1; aDeg += d.areaMm2[f]; }
    }
    const minor = Math.min(nPos, nNeg);
    log('  *** THE PARAMETER-DOMAIN FOLD TEST (whole mesh; rA is single-valued so the surface IS a graph) ***');
    log(`     signed parameter area: POSITIVE ${nPos} facets (${pct(nPos, nTri)}%) AREA ${aPos.toFixed(3)} mm2 | NEGATIVE ${nNeg} (${pct(nNeg, nTri)}%) AREA ${aNeg.toFixed(3)} mm2`);
    log(`     minority orientation = ${pct(minor, nTri)}% of facets  ==  the FOLDED share of the (theta,z) triangulation`);
    log(`     sum|aP| ${sumAbs.toFixed(4)} vs |sum aP| ${Math.abs(sumSig).toFixed(4)} mm2  =>  fold excess ${pct(sumAbs - Math.abs(sumSig), sumAbs)}% of parameter area`);
    log(`     DEGENERATE domain elements (|paramArea| < ${DEGT.toExponential(0)} mm2): COUNT ${nDeg} (${pct(nDeg, nTri)}%)  *** 3D AREA ${aDeg.toFixed(3)} mm2 = ${pct(aDeg, meshArea)}% of mesh ***`);
    log('     READ: a degenerate domain element covers ZERO surface but carries REAL 3D area — it is a FIN');
    log('     standing on a parameter line, not a patch of the surface. No 3D sliver test can see it: the');
    log(`     example facets above have 3D min altitude ~5e-2 mm and AREA ABOVE the mesh mean (${(meshArea / nTri).toExponential(3)} mm2).  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
    // CROSS-TAB: is the top graphRatio mode THE SAME SET as the orientation-inverted domain elements?
    // A triangle whose (theta,z) shadow has collapsed sits exactly ON the sign-change locus, so a class
    // that is really "shadow collapsed" must split roughly evenly between the two signs — while an
    // ordinary tilted facet cannot be inverted at all. That is a falsifiable prediction, tested here.
    {
      const VC2 = envF('PF_S115_VALLEY', 2500);
      const cnt = [[0, 0], [0, 0]]; const ar = [[0, 0], [0, 0]];
      const zHi: number[] = [];
      for (const f of classF) {
        const hiG = grOf(f) > VC2 ? 1 : 0;
        const neg = signedP(f) > 0 ? 0 : 1;
        cnt[hiG][neg] += 1; ar[hiG][neg] += d.areaMm2[f];
        if (hiG === 1 && zHi.length < 40000) zHi.push(centroidOf(f)[2]);
      }
      log('');
      log(`     CROSS-TAB over the >${HI_DEG} class:  rows = graphRatio vs the STAGE-1b VALLEY (${VC2}), cols = domain orientation`);
      log('                            POSITIVE (count / area mm2)      NEGATIVE (count / area mm2)     inverted share');
      for (const g of [0, 1]) {
        const tot = cnt[g][0] + cnt[g][1];
        log(`        gr ${g === 1 ? '>' : '<='} ${String(VC2).padStart(6)}      ${String(cnt[g][0]).padStart(8)} / ${ar[g][0].toFixed(3).padStart(10)}      ${String(cnt[g][1]).padStart(8)} / ${ar[g][1].toFixed(3).padStart(10)}     COUNT ${pct(cnt[g][1], tot)}%  AREA ${pct(ar[g][1], ar[g][0] + ar[g][1])}%`);
      }
      log(`        z of the gr>${VC2} class: p05 ${f2(q(zHi, 0.05), 2)} p25 ${f2(q(zHi, 0.25), 2)} p50 ${f2(q(zHi, 0.5), 2)} p75 ${f2(q(zHi, 0.75), 2)} p95 ${f2(q(zHi, 0.95), 2)} mm  (mesh spans 0..${H})`);
      // *** THE DECISIVE NUMBER: how much SURFACE does the high-gr class actually render? ***
      {
        let a3 = 0; let ap = 0; let a3lo = 0; let aplo = 0;
        for (let f = 0; f < nTri; f += 1) {
          const s = Math.abs(signedP(f));
          if (grOf(f) > VC2) { a3 += d.areaMm2[f]; ap += s; } else { a3lo += d.areaMm2[f]; aplo += s; }
        }
        log(`        WHOLE-MESH SURFACE COVERAGE of the two graphRatio regimes (|signed parameter area| = the`);
        log('        domain each facet actually renders; the domain itself is sum|aP| over the whole mesh):');
        log(`           gr >  ${VC2}: 3D AREA ${a3.toFixed(3)} mm2 = ${pct(a3, meshArea)}% of mesh, but DOMAIN COVERED ${ap.toExponential(4)} mm2 = ${pct(ap, ap + aplo)}% of the domain`);
        log(`           gr <= ${VC2}: 3D AREA ${a3lo.toFixed(3)} mm2 = ${pct(a3lo, meshArea)}% of mesh, DOMAIN COVERED ${aplo.toFixed(4)} mm2 = ${pct(aplo, ap + aplo)}% of the domain`);
        log('        *** A facet that renders no domain renders no surface. Its 3D area is a FIN, and no');
        log('        analytic turn anywhere can make it IRREDUCIBLE — there is nothing there to represent. ***');
        (OUT as Record<string, unknown>).coverage = { hiArea3D: a3, hiDomain: ap, loArea3D: a3lo, loDomain: aplo, valley: VC2 };
      }
      log('        PREDICTION UNDER "SHADOW COLLAPSE": the high-gr row is ~50/50 by sign (it sits ON the');
      log('        sign-change locus) while the low-gr row is ~0% inverted. Read the two rows against it.');
      (OUT as Record<string, unknown>).foldCrossTab = { valley: VC2, count: cnt, area: ar };
    }
    OUT.foldTest = {
      posFacets: nPos, negFacets: nNeg, minorityPct: (minor / nTri) * 100,
      sumAbs, sumSigned: sumSig, foldExcessPct: ((sumAbs - Math.abs(sumSig)) / sumAbs) * 100,
      degenerateFacets: nDeg, degenerateAreaMm2: aDeg, degeneratePctOfMesh: (aDeg / meshArea) * 100, degThreshold: DEGT,
    };
  }
  log('');
  const worst = hiF.slice().sort((x, y) => grOf(y) - grOf(x)).slice(0, 4);
  log('  the 4 highest-graphRatio facets, in full (the numbers that have to be reconciled):');
  for (const f of worst) {
    const [ath, bth, cth] = th3(f); const rRef = rRefOf(f);
    const u = [rRef * ath, rRef * bth, rRef * cth]; const zz = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
    const rr = [Math.hypot(xyz[f * 9], xyz[f * 9 + 1]), Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]), Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])];
    const pd = paramDiam(f); const pa = paramAreaOf(f);
    log(`     f${f}  gr ${grOf(f).toExponential(3)}  area3D ${area3D(f).toExponential(3)}  areaParam ${pa.toExponential(3)}  paramDiam ${pd.toExponential(3)}  paramAlt ${((2 * pa) / Math.max(1e-300, pd)).toExponential(3)} mm`);
    for (let k = 0; k < 3; k += 1) {
      const th = [ath, bth, cth][k];
      log(`        v${k}  th ${th.toFixed(12)}  z ${zz[k].toFixed(9)}  r_mesh ${rr[k].toFixed(9)}  rA ${rA(th, zz[k]).toFixed(9)}  |dr| ${(Math.abs(rr[k] - rA(th, zz[k])) * 1e3).toExponential(3)} um   u ${u[k].toFixed(9)}`);
    }
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ORACLE MACHINERY — S114's construction, re-implemented allocation-free so K can be pushed to 64+.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const KMAX = Math.max(...KLAD, ...KTAB, 24);
const CAP = ((KMAX + 1) * (KMAX + 2)) / 2 * 4;
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

/** Fill bufN/bufT/bufZ from offset `m0` with facet f's order-k lattice normals. Returns the new count. */
function sampleInto(f: number, k: number, ns: NormalSampler, m0: number): number {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const rRef = rRefOf(f);
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
        bufT[m] = rRef * th; bufZ[m] = z; m += 1;
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

type HMode = 'fix' | 'coupled';
interface PairOracle { sepCentDeg: number; sepCreaseDeg: number; gapMm: number; crease: boolean; irr: boolean; m: number; pdMm: number; spacingMm: number; hUsed: number }
const nsFixMap = new Map<number, NormalSampler>();
function nsFixCache(h: number): NormalSampler {
  let s = nsFixMap.get(h);
  if (s === undefined) { s = fdNormals(rA, H, h, h); nsFixMap.set(h, s); }
  return s;
}

/**
 * THE ORACLE. `mode='fix'` uses a global finite-difference step `hFix` (S114's arm A). `mode='coupled'`
 * ties the step to the lattice: h = paramDiam/(4K), the ONLY schedule under which "the lattice resolves
 * the footprint" and "the normals resolve the lattice" are the same statement (arm C, the substitute).
 */
function oraclePair(f1: number, f2: number, k: number, fn: RadiusFn, mode: HMode, hFix: number): PairOracle {
  const pd1 = paramDiam(f1); const pd2 = paramDiam(f2);
  const pd = Math.max(pd1, pd2);
  const h1 = mode === 'fix' ? hFix : Math.max(HMIN, pd1 / (4 * k));
  const h2 = mode === 'fix' ? hFix : Math.max(HMIN, pd2 / (4 * k));
  const m1 = sampleInto(f1, k, fn === rA && mode === 'fix' ? nsFixCache(hFix) : fdNormals(fn, H, h1, h1), 0);
  const m = sampleInto(f2, k, fn === rA && mode === 'fix' ? nsFixCache(hFix) : fdNormals(fn, H, h2, h2), m1);
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
      // insertion into the ascending-by-distance top-NCROSS list
      let p = Math.min(filled, NCROSS - 1);
      while (p > 0 && ddK[p - 1] > dd) { ddK[p] = ddK[p - 1]; angK[p] = angK[p - 1]; p -= 1; }
      ddK[p] = dd; angK[p] = ag;
      if (filled < NCROSS) filled += 1;
      worst = ddK[filled - 1];
    }
  }
  let sepCrease = 0;
  for (let i = 0; i < filled; i += 1) if (angK[i] > sepCrease) sepCrease = angK[i];
  const sepCentDeg = sp.sepRad * DEG;
  const crease = sepCentDeg >= SEP_MIN && Math.min(na, nb) >= 2 && sepCentDeg > Math.max(sp.wA, sp.wB) * DEG;
  return {
    sepCentDeg, sepCreaseDeg: sepCrease * DEG, gapMm: filled > 0 ? Math.sqrt(ddK[filled - 1]) : NaN,
    crease, irr: sepCrease * DEG >= HI_DEG, m, pdMm: pd, spacingMm: pd / k, hUsed: mode === 'fix' ? hFix : Math.max(h1, h2),
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — EXHAUSTIVE normDeg OVER THE >45 CLASS (so the four-way split is exact at EVERY cut R)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const ndHi = new Float64Array(nTri).fill(NaN);
const ndLo = new Float64Array(nTri).fill(NaN);
const orientArgs = (f: number): [number, number, number, number, number, number, number, number, number, number, number, number] => {
  const [ath, bth, cth] = th3(f);
  return [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth];
};
const normDegOf = (f: number, inset: number): number =>
  orientOfFacet(nsObs, ...orientArgs(f), { k: K_OBS, inset, orient: 'winding', scratch }).normDeg;
let CLS_SAMPLED = false;
let clsScope: number[] = classF;
if (STAGES.has('2') || STAGES.has('3') || STAGES.has('4') || STAGES.has('5')) {
  clsScope = EXH && classF.length <= EXH_CAP ? classF : goldenStride(classF.length, Math.min(EXH_CAP, classF.length)).map((i) => classF[i]);
  CLS_SAMPLED = clsScope.length < classF.length;
  log(`── STAGE 2: normDeg over the >${HI_DEG} class, insets ${INSET_LO}/${INSET_HI}, k=${K_OBS}  (${clsScope.length} facets${CLS_SAMPLED ? ', GOLDEN-STRIDE SAMPLE' : ', EXHAUSTIVE'})  ${el()} ──`);
  const t = Date.now();
  for (let i = 0; i < clsScope.length; i += 1) {
    const f = clsScope[i];
    ndHi[f] = normDegOf(f, INSET_HI); ndLo[f] = normDegOf(f, INSET_LO);
    if ((i + 1) % 50000 === 0) log(`     ... ${i + 1}/${clsScope.length}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  }
  log(`  done in ${((Date.now() - t) / 1000).toFixed(1)}s  ${el()}`);
  log('');
}
/** S112's four-way label for an edge, given a curtain cut R. CURTAIN is decided by graphRatio only. */
function labelEdge(e: number, R: number): 'CURTAIN' | 'ACCURATE' | 'CONFORMED' | 'STRADDLING' | 'UNSCORED' {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  if (grOf(f1) > R || grOf(f2) > R) return 'CURTAIN';
  const nh = Math.max(ndHi[f1], ndHi[f2]);
  const nl = Math.max(ndLo[f1], ndLo[f2]);
  if (!Number.isFinite(nh) || !Number.isFinite(nl)) return 'UNSCORED';
  if (nh <= NORMHI_BAR) return 'ACCURATE';
  return (nl > 1e-9 ? nh / nl : 1) < DROP_CUT ? 'CONFORMED' : 'STRADDLING';
}
const areaOfFacets = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const facetsOfEdges = (es: number[]): Set<number> => { const s = new Set<number>(); for (const e of es) { s.add(d.edgeF1[e]); s.add(d.edgeF2[e]); } return s; };

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — THE THREE ARMS OF THE K/h LADDER (PR-3) + PLACEBO (C2) + FLOOR (C4)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const CUT_REF = 8;
const curtRefE: number[] = []; const wallRefE: number[] = [];
for (const e of hiEdges) { if (grOf(d.edgeF1[e]) > CUT_REF || grOf(d.edgeF2[e]) > CUT_REF) curtRefE.push(e); else wallRefE.push(e); }
interface LadRow { K: number; n: number; nEff: number; irrCountPct: number; irrAreaPct: number; ciLo: number; ciHi: number; turnP50: number; turnP90: number; turnMax: number; mP50: number; pdP50: number; spacingP50: number; hP50: number }
/**
 * KISH EFFECTIVE SAMPLE SIZE and a BOOTSTRAP CI on an AREA-WEIGHTED share.
 *
 * *** WHY THIS IS NOT OPTIONAL HERE. *** The curtain class's facet areas span four orders of magnitude,
 * so an area-weighted share over n pairs is really a share over n_eff = (sum a)^2 / sum a^2 pairs — and
 * on the S115 smoke n=40 gave n_eff ~ 6. A "ladder" whose rungs differ by less than its own CI is not a
 * drift and not a convergence; it is noise, and quoting either verdict from it would be fabrication.
 */
function shareStats(area: number[], irr: boolean[], seed = 12345): { share: number; nEff: number; lo: number; hi: number } {
  let sa = 0; let sa2 = 0; let si = 0;
  for (let i = 0; i < area.length; i += 1) { sa += area[i]; sa2 += area[i] * area[i]; if (irr[i]) si += area[i]; }
  const nEff = sa2 > 0 ? (sa * sa) / sa2 : 0;
  let st = seed >>> 0;
  const rnd = (): number => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const B = 400; const out = new Float64Array(B);
  const n = area.length;
  for (let b = 0; b < B; b += 1) {
    let a = 0; let ai = 0;
    for (let i = 0; i < n; i += 1) {
      const j = Math.min(n - 1, Math.floor(rnd() * n));
      a += area[j]; if (irr[j]) ai += area[j];
    }
    out[b] = a > 0 ? (ai / a) * 100 : NaN;
  }
  const s = Array.from(out).filter(Number.isFinite).sort((x, y) => x - y);
  return { share: sa > 0 ? (si / sa) * 100 : NaN, nEff, lo: s[Math.floor(s.length * 0.05)], hi: s[Math.floor(s.length * 0.95)] };
}
function runLadder(es: number[], ks: number[], fn: RadiusFn, mode: HMode, hFix: number, label: string): LadRow[] {
  const rows: LadRow[] = [];
  for (const k of ks) {
    const t = Date.now();
    const turns: number[] = []; const ms: number[] = []; const pds: number[] = []; const sps: number[] = []; const hs: number[] = [];
    const ars: number[] = []; const irs: boolean[] = [];
    let nIrr = 0;
    for (const e of es) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const o = oraclePair(f1, f2, k, fn, mode, hFix);
      const a = d.areaMm2[f1] + d.areaMm2[f2];
      turns.push(o.sepCreaseDeg); ms.push(o.m); pds.push(o.pdMm); sps.push(o.spacingMm); hs.push(o.hUsed);
      ars.push(a); irs.push(o.irr); if (o.irr) nIrr += 1;
    }
    const ss = shareStats(ars, irs);
    const row: LadRow = {
      K: k, n: es.length, nEff: ss.nEff, irrCountPct: (nIrr / Math.max(1, es.length)) * 100, irrAreaPct: ss.share,
      ciLo: ss.lo, ciHi: ss.hi,
      turnP50: q(turns, 0.5), turnP90: q(turns, 0.9), turnMax: q(turns, 1),
      mP50: q(ms, 0.5), pdP50: q(pds, 0.5), spacingP50: q(sps, 0.5), hP50: q(hs, 0.5),
    };
    rows.push(row);
    log(`     ${label}  K=${String(k).padStart(3)}  turn p50 ${f2(row.turnP50, 2).padStart(7)} p90 ${f2(row.turnP90, 2).padStart(7)} MAX ${f2(row.turnMax, 2).padStart(7)} deg | IRR COUNT ${f2(row.irrCountPct, 2).padStart(6)}%  *** AREA ${f2(row.irrAreaPct, 2).padStart(6)}% *** [90% CI ${f2(row.ciLo, 1).padStart(5)}–${f2(row.ciHi, 1).padStart(5)}, n_eff ${f2(row.nEff, 1)}] | m ${String(row.mP50).padStart(5)}  spacing ${row.spacingP50.toExponential(2)}  h ${row.hP50.toExponential(2)} mm  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  }
  return rows;
}
if (STAGES.has('3')) {
  log(`── STAGE 3: THE K / h LADDERS ON THE CURTAIN CLASS (cut R=${CUT_REF})  ${el()} ──`);
  const cs = goldenStride(curtRefE.length, Math.min(S3_N, curtRefE.length)).map((i) => curtRefE[i]);
  const wsAll = wallRefE.filter((e) => labelEdge(e, CUT_REF) === 'STRADDLING');
  const ws = goldenStride(wsAll.length, Math.min(S3_N, wsAll.length)).map((i) => wsAll[i]);
  log(`  curtain sample n=${cs.length} of ${curtRefE.length};  WALL/STRADDLING floor sample n=${ws.length} of ${wsAll.length}`);
  log('');
  log('  ARM A — FIXED h (S114 replication). If the AREA column drifts, the S114 ladder was never converged.');
  const armA = runLadder(cs, KLAD, rA, 'fix', H_FIX, 'A/fix ');
  log('');
  log('  ARM B — h SWEPT AT FIXED K (SCAR 3). A number that moves with h is not a measurement.');
  const armB: Array<Record<string, number>> = [];
  const KB = envI('PF_S115_KB', 24);
  for (const hh of HLAD) {
    const t = Date.now();
    let nIrr = 0; const turns: number[] = []; const ars: number[] = []; const irs: boolean[] = [];
    for (const e of cs) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const o = oraclePair(f1, f2, KB, rA, 'fix', hh);
      turns.push(o.sepCreaseDeg); ars.push(d.areaMm2[f1] + d.areaMm2[f2]); irs.push(o.irr); if (o.irr) nIrr += 1;
    }
    const ss = shareStats(ars, irs);
    log(`     B/h=${hh.toExponential(0).padStart(6)}  K=${KB}  turn p50 ${f2(q(turns, 0.5), 2).padStart(7)} p90 ${f2(q(turns, 0.9), 2).padStart(7)} MAX ${f2(q(turns, 1), 2).padStart(7)} deg | IRR COUNT ${f2((nIrr / cs.length) * 100, 2).padStart(6)}%  *** AREA ${f2(ss.share, 2).padStart(6)}% *** [90% CI ${f2(ss.lo, 1)}–${f2(ss.hi, 1)}]  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
    armB.push({ h: hh, K: KB, irrCountPct: (nIrr / cs.length) * 100, irrAreaPct: ss.share, ciLo: ss.lo, ciHi: ss.hi, turnP50: q(turns, 0.5), turnMax: q(turns, 1) });
  }
  log('');
  log('  ARM C — *** COUPLED h = paramDiam/(4K) — THE PRE-REGISTERED SUBSTITUTE *** ');
  const armC = runLadder(cs, KLAD, rA, 'coupled', H_FIX, 'C/cpl ');
  log('');
  log('  CONTROL C4 — NON-VACUITY FLOOR: arm C on the WALL/STRADDLING class, where the footprint IS defined');
  log('  and S114 measured 76.31% irreducible. An arm that reads ~0 here is worthless, not conservative.');
  const armCFloor = runLadder(ws, KTAB, rA, 'coupled', H_FIX, 'C4/wal');
  log('');
  log('  CONTROL C2 — THE PLACEBO: every arm re-run against the C-infinity truncated cone, SAME footprints.');
  const plA = runLadder(cs, [KLAD[0], KLAD[Math.floor(KLAD.length / 2)], KLAD[KLAD.length - 1]], rFlat, 'fix', H_FIX, 'P/fix ');
  const plC = runLadder(cs, [KLAD[0], KLAD[Math.floor(KLAD.length / 2)], KLAD[KLAD.length - 1]], rFlat, 'coupled', H_FIX, 'P/cpl ');
  const placeboMax = Math.max(...plA.map((r) => r.irrAreaPct), ...plC.map((r) => r.irrAreaPct));
  log(`     PLACEBO worst irreducible AREA share across all cells: ${f2(placeboMax, 3)}%   ${placeboMax > 5 ? '*** C2 FIRED — THE ARM IS VOID ***' : 'C2 OK'}`);
  log('');
  const dA = armA.length >= 2 ? Math.abs(armA[armA.length - 1].irrAreaPct - armA[armA.length - 2].irrAreaPct) : NaN;
  const dC = armC.length >= 2 ? Math.abs(armC[armC.length - 1].irrAreaPct - armC[armC.length - 2].irrAreaPct) : NaN;
  const hSpread = Math.max(...armB.map((r) => r.irrAreaPct)) - Math.min(...armB.map((r) => r.irrAreaPct));
  const ciW = (rs: LadRow[]): number => rs.reduce((m, r) => Math.max(m, r.ciHi - r.ciLo), 0);
  const wA = ciW(armA); const wC = ciW(armC);
  const rngA = Math.max(...armA.map((r) => r.irrAreaPct)) - Math.min(...armA.map((r) => r.irrAreaPct));
  const rngC = Math.max(...armC.map((r) => r.irrAreaPct)) - Math.min(...armC.map((r) => r.irrAreaPct));
  log(`  >>> PR-3 VERDICT.  arm A last-step |delta| ${f2(dA, 3)} pp, FULL K-RANGE ${f2(rngA, 2)} pp, widest CI ${f2(wA, 2)} pp`);
  log(`                     arm C last-step |delta| ${f2(dC, 3)} pp, FULL K-RANGE ${f2(rngC, 2)} pp, widest CI ${f2(wC, 2)} pp`);
  log(`                     arm B h-SPREAD ${f2(hSpread, 3)} pp at fixed K=${KB}`);
  log(`      arm A ${dA <= 1 ? 'CONVERGED' : '*** NOT CONVERGED ***'} in K;  h-dependence ${hSpread <= 1 ? 'negligible' : '*** MATERIAL — arm A is h-limited, not only K-limited ***'};  arm C ${dC <= 1 ? 'CONVERGED' : '*** NOT CONVERGED ***'} in K.`);
  log('      *** READ THE CI COLUMN BEFORE THE LADDER. *** If the full K-range is INSIDE the widest CI the');
  log('      ladder is NOISE, not drift, and neither "converged" nor "rising" is a measurement at this n.');
  log(`      arm A: K-range ${rngA <= wA ? 'INSIDE its own CI ==> the ladder is NOISE at this n' : 'EXCEEDS its CI ==> the K-dependence is REAL'};  arm C: ${rngC <= wC ? 'INSIDE its own CI ==> NOISE' : 'EXCEEDS its CI ==> REAL'}.`);
  // ── THE SUB-LADDERS. Stage 1b found TWO mechanisms inside "curtain": TILT (shadow intact, gr = 1/|n.rhat|)
  // and SHADOW COLLAPSE (the three vertices collinear in (theta,z), so the footprint is a LINE and its
  // "area turn" is not a footprint quantity at all). They cannot converge the same way, so they are laddered
  // SEPARATELY rather than averaged into one unconverged number.
  const VC = envF('PF_S115_VALLEY', 2500);
  const tiltE = cs.filter((e) => Math.max(grOf(d.edgeF1[e]), grOf(d.edgeF2[e])) <= VC);
  const collE = cs.filter((e) => Math.max(grOf(d.edgeF1[e]), grOf(d.edgeF2[e])) > VC);
  log(`  SUB-LADDERS: the curtain-at-8 sample splits at the STAGE-1b VALLEY (graphRatio ${VC}) into`);
  log(`  TILTED n=${tiltE.length} (shadow intact) and SHADOW-COLLAPSED n=${collE.length} (footprint is a LINE).`);
  const armTilt = tiltE.length >= 20 ? runLadder(tiltE, KLAD, rA, 'coupled', H_FIX, 'TILT  ') : [];
  const armColl = collE.length >= 20 ? runLadder(collE, KLAD, rA, 'coupled', H_FIX, 'COLLPS') : [];
  const rng = (rs: LadRow[]): number => (rs.length === 0 ? NaN : Math.max(...rs.map((r) => r.irrAreaPct)) - Math.min(...rs.map((r) => r.irrAreaPct)));
  const ciw = (rs: LadRow[]): number => rs.reduce((m, r) => Math.max(m, r.ciHi - r.ciLo), 0);
  log(`     TILTED   K-range ${f2(rng(armTilt), 2)} pp vs widest CI ${f2(ciw(armTilt), 2)} pp  =>  ${rng(armTilt) <= ciw(armTilt) ? 'CONVERGED (drift inside noise)' : '*** STILL MOVING ***'}`);
  log(`     COLLAPSED K-range ${f2(rng(armColl), 2)} pp vs widest CI ${f2(ciw(armColl), 2)} pp  =>  ${rng(armColl) <= ciw(armColl) ? 'CONVERGED (drift inside noise)' : '*** STILL MOVING ***'}`);
  OUT.stage3 = {
    curtainN: cs.length, wallStradN: ws.length, armA, armB, armC, armCFloor,
    placeboFix: plA, placeboCoupled: plC, placeboMax, dA, dC, hSpread,
    rangeA: rngA, rangeC: rngC, ciWidthA: wA, ciWidthC: wC,
    valleyCut: VC, tiltN: tiltE.length, collapsedN: collE.length, armTilt, armColl,
    tiltRange: rng(armTilt), tiltCI: ciw(armTilt), collRange: rng(armColl), collCI: ciw(armColl),
  };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — THE 2-D SURFACE: reducible %-of-mesh over (curtain cut R) x (K)   (PR-4)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ── ONE shared pool over the whole >45 class, oracled ONCE per (K, mode) and reused by Stages 4 and 5.
// Every (R,K) cell is that pool PARTITIONED by graphRatio, so cells differ by the KNOBS ONLY, never by
// the sample. Two cells that disagree therefore disagree because of the knob, which is the whole point.
const pool = goldenStride(hiEdges.length, Math.min(POOL_N, hiEdges.length)).map((i) => hiEdges[i]);
const pf1 = pool.map((e) => d.edgeF1[e]); const pf2 = pool.map((e) => d.edgeF2[e]);
const pGr = pool.map((_e, i) => Math.max(grOf(pf1[i]), grOf(pf2[i])));
const pArea = pool.map((_e, i) => d.areaMm2[pf1[i]] + d.areaMm2[pf2[i]]);
const irrByK: Record<string, boolean[]> = {};
const turnByK: Record<string, number[]> = {};
if (STAGES.has('4') || STAGES.has('5')) {
  log(`── SHARED ORACLE POOL n=${pool.length} of ${hiEdges.length} >${HI_DEG} edges (golden stride)  ${el()} ──`);
  log(`  *** WEIGHTING CAVEAT (see Stage 5b), INHERITED FROM S114 AND CARRIED HERE SO IT CANNOT HIDE: every share below is`);
  log('  PER EDGE-PAIR, so a facet is weighted once per >45 edge it touches. Stage 5b re-does the headline');
  log('  PER FACET. Do not compare a per-pair share to a per-facet area without reading 5b first. ***');
  log(`  graphRatio over the pool: p10 ${f2(q(pGr, 0.1), 2)} p50 ${f2(q(pGr, 0.5), 2)} p90 ${q(pGr, 0.9).toExponential(2)} MAX ${q(pGr, 1).toExponential(2)}`);
  for (const mode of ['fix', 'coupled'] as HMode[]) {
    for (const k of KTAB) {
      const t = Date.now();
      const v: boolean[] = []; const tv: number[] = [];
      for (let i = 0; i < pool.length; i += 1) {
        const o = oraclePair(pf1[i], pf2[i], k, rA, mode, H_FIX);
        v.push(o.irr); tv.push(o.sepCreaseDeg);
      }
      irrByK[`${mode}:${k}`] = v; turnByK[`${mode}:${k}`] = tv;
      log(`     oracled pool at mode=${mode.padEnd(7)} K=${String(k).padStart(3)}  turn p50 ${f2(q(tv, 0.5), 2).padStart(7)} MAX ${f2(q(tv, 1), 2).padStart(7)} deg  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
    }
  }
  log('');
}

if (STAGES.has('4')) {
  log(`── STAGE 4: THE 2-D SURFACE — reducible %-of-mesh over (curtain cut R) x (K)  ${el()} ──`);
  // exhaustive per-R sub-class areas
  const perR: Array<Record<string, number>> = [];
  const tables: Record<string, string[]> = {};
  for (const mode of ['fix', 'coupled'] as HMode[]) tables[mode] = [];
  log('');
  log('  EXHAUSTIVE sub-class areas at each cut R (COUNT + AREA, per FACET, no sampling):');
  log('     R           curtainA   accurateA  conformedA  straddleA   unscoredA   curtain%class  strad%class');
  const RA: Record<number, { cA: number; accA: number; conA: number; strA: number; unsA: number }> = {};
  for (const R of RLAD) {
    const buckets: Record<string, number[]> = { CURTAIN: [], ACCURATE: [], CONFORMED: [], STRADDLING: [], UNSCORED: [] };
    for (const e of hiEdges) buckets[labelEdge(e, R)].push(e);
    const cA = areaOfFacets(facetsOfEdges(buckets.CURTAIN));
    const accA = areaOfFacets(facetsOfEdges(buckets.ACCURATE));
    const conA = areaOfFacets(facetsOfEdges(buckets.CONFORMED));
    const strA = areaOfFacets(facetsOfEdges(buckets.STRADDLING));
    const unsA = areaOfFacets(facetsOfEdges(buckets.UNSCORED));
    RA[R] = { cA, accA, conA, strA, unsA };
    log(`     ${String(R).padStart(8)}  ${cA.toFixed(3).padStart(10)}  ${accA.toFixed(3).padStart(10)}  ${conA.toFixed(3).padStart(10)}  ${strA.toFixed(3).padStart(10)}  ${unsA.toFixed(3).padStart(10)}   ${pct(cA, areaOver45).padStart(8)}%   ${pct(strA, areaOver45).padStart(8)}%`);
    perR.push({ R, curtainA: cA, accurateA: accA, conformedA: conA, straddlingA: strA, unscoredA: unsA });
  }
  log('');
  const cells: Array<Record<string, number | string>> = [];
  for (const mode of ['fix', 'coupled'] as HMode[]) {
    log(`  *** TABLE: REDUCIBLE % OF MESH  —  rows = curtain cut R, cols = K   [h mode = ${mode}] ***`);
    log(`     R \\ K   ${KTAB.map((k) => String(k).padStart(9)).join('')}      nCurtain  nStrad   (pool support)`);
    for (const R of RLAD) {
      const { cA, accA, conA, strA, unsA } = RA[R];
      const ci: number[] = []; const si: number[] = [];
      for (let i = 0; i < pool.length; i += 1) (pGr[i] > R ? ci : si).push(i);
      // the wall side of the pool must be restricted to the STRADDLING label, exactly as Stage 7 does
      const siS = si.filter((i) => labelEdge(pool[i], R) === 'STRADDLING');
      const parts: string[] = [];
      for (const k of KTAB) {
        const irr = irrByK[`${mode}:${k}`];
        const shr = (idx: number[]): number => {
          let a = 0; let ai = 0;
          for (const i of idx) { a += pArea[i]; if (irr[i]) ai += pArea[i]; }
          return a > 0 ? ai / a : NaN;
        };
        const sC = shr(ci); const sS = shr(siS);
        const red = cA * (1 - (Number.isFinite(sC) ? sC : 1)) + strA * (1 - (Number.isFinite(sS) ? sS : 1)) + unsA;
        parts.push(((red / meshArea) * 100).toFixed(4).padStart(9));
        cells.push({ mode, R, K: k, reduciblePctOfMesh: (red / meshArea) * 100, curtainIrrShare: sC * 100, stradIrrShare: sS * 100, nCurtain: ci.length, nStrad: siS.length });
      }
      log(`     ${String(R).padStart(8)}${parts.join('')}      ${String(ci.length).padStart(8)}${String(siS.length).padStart(8)}`);
    }
    log('');
  }
  const allRed = cells.map((c) => c.reduciblePctOfMesh as number).filter(Number.isFinite);
  log(`  SURFACE SPREAD: reducible %-of-mesh ranges ${f2(Math.min(...allRed), 4)}% .. ${f2(Math.max(...allRed), 4)}%  =  ${f2(Math.max(...allRed) / Math.max(1e-9, Math.min(...allRed)), 2)}x across the two knobs.`);
  log(`  (S114 quoted ONE cell of this surface: R=8, K=16, mode=fix -> 2.0600%.)`);
  OUT.stage4 = { poolN: pool.length, perR, cells, redMin: Math.min(...allRed), redMax: Math.max(...allRed) };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — THE NUMBER THAT NEEDS NO CUT (PR-5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.has('5')) {
  log(`── STAGE 5: THE CLASS-WIDE REDUCIBLE NUMBER WITH **NO CURTAIN SCOPING AT ALL**  ${el()} ──`);
  log('  Every >45 facet, one ruler, no R. The oracle is applied UNIFORMLY: a facet is IRREDUCIBLE if the');
  log('  analytic turn across its pair footprint reaches 45 deg. ACCURATE/CONFORMED are NOT short-circuited');
  log('  to 100% here — they are oracled like everything else, so no sub-class is credited by construction.');
  const rows: Array<Record<string, number | string>> = [];
  for (const mode of ['fix', 'coupled'] as HMode[]) {
    for (const k of KTAB) {
      const irr = irrByK[`${mode}:${k}`]; const turns = turnByK[`${mode}:${k}`];
      let aIrr = 0; let aTot = 0; let nIrr = 0;
      for (let i = 0; i < pool.length; i += 1) { aTot += pArea[i]; if (irr[i]) { aIrr += pArea[i]; nIrr += 1; } }
      const irrShare = aIrr / aTot;
      const red = areaOver45 * (1 - irrShare);
      log(`     mode=${mode.padEnd(7)} K=${String(k).padStart(3)}  IRR COUNT ${f2((nIrr / pool.length) * 100, 2).padStart(6)}%  AREA ${f2(irrShare * 100, 2).padStart(6)}%   ==> REDUCIBLE ${red.toFixed(3).padStart(9)} mm2 = *** ${f2((red / meshArea) * 100, 4)}% OF MESH ***   turn p50 ${f2(q(turns, 0.5), 2)} MAX ${f2(q(turns, 1), 2)} deg`);
      rows.push({ mode, K: k, irrCountPct: (nIrr / pool.length) * 100, irrAreaPct: irrShare * 100, reducibleMm2: red, reduciblePctOfMesh: (red / meshArea) * 100, turnP50: q(turns, 0.5), turnMax: q(turns, 1) });
    }
  }
  // ── the analytic-free floor: locateKinkRaw on the shared edge, no footprint, no lattice, no h.
  {
    let nJump = 0; let nKink = 0; let nNone = 0; let aJ = 0; let aK = 0; let aN = 0; let nDegen = 0;
    for (let i = 0; i < pool.length; i += 1) {
      const p = sharedEndpoints(pool[i], d.edgeF1, d.edgeF2);
      let kk = null as ReturnType<typeof locateKinkRaw>;
      let segMm = 0;
      if (p !== null) {
        const thE = Math.atan2(p[1], p[0]);
        const dth = dThRaw(thE, Math.atan2(p[4], p[3]));
        segMm = Math.hypot(Math.hypot(p[0], p[1]) * dth, p[5] - p[2]);
        kk = locateKinkRaw(rA, thE, p[2], thE + dth, p[5], PRED);
      }
      if (segMm < 1e-6) nDegen += 1;
      if (kk === null) { nNone += 1; aN += pArea[i]; } else if (kk.jump) { nJump += 1; aJ += pArea[i]; } else { nKink += 1; aK += pArea[i]; }
    }
    const aT = aJ + aK + aN;
    log('');
    log('  CROSS-CHECK, ANALYTIC-FREE OF THE FOOTPRINT (locateKinkRaw on the shared edge — no lattice, no h):');
    log(`     rA JUMP ${nJump} (${pct(nJump, pool.length)}%) AREA ${pct(aJ, aT)}% | KINK ${nKink} (${pct(nKink, pool.length)}%) AREA ${pct(aK, aT)}% | NEITHER ${nNone} (${pct(nNone, pool.length)}%) AREA ${pct(aN, aT)}%`);
    log(`     shared-edge segments shorter than 1e-6 mm (the probe cannot reach): ${nDegen} (${pct(nDegen, pool.length)}%)`);
    OUT.stage5kink = { jump: nJump, kink: nKink, none: nNone, jumpAreaPct: (aJ / aT) * 100, kinkAreaPct: (aK / aT) * 100, noneAreaPct: (aN / aT) * 100, degenerate: nDegen };
  }
  OUT.stage5 = { poolN: pool.length, hiAreaMm2: areaOver45, rows };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5b — THE SAME NUMBER, PER FACET INSTEAD OF PER PAIR, AND WITH h SWEPT.
//
// *** WHY THIS EXISTS AND WHY IT IS NOT OPTIONAL. *** Stage 5 (and S114's Stage 4/7, and every share in
// this campaign that came through `oraclePair`) weights each facet ONCE PER >45 EDGE it touches. On this
// mesh that is 475,670 facet-slots over 306,737 distinct facets = 1.551 counts per facet, and the
// weighting is not uniform: a facet with three >45 edges is counted three times. Per-pair accounting has
// already inflated one published figure in this campaign by 1.711x. Here the pool is aggregated PER
// FACET — a facet is IRREDUCIBLE if ANY of its sampled pairs is (the LOOSE rule S114 used), and STRICT
// (all pairs) is printed beside it so the reader can see the bracket rather than one convention.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.has('5b')) {
  const KF = envI('PF_S115_S5K', 16);
  const HS = envL('PF_S115_S5H', '2e-8,2e-7,2e-6,2e-5,2e-4,2e-3');
  log(`── STAGE 5b: NO-CURTAIN CLASS-WIDE NUMBER, PER FACET, h SWEPT (K=${KF}, n=${pool.length} pool edges)  ${el()} ──`);
  let slots = 0;
  for (const e of hiEdges) { void e; slots += 2; }
  const uniqAll = new Set<number>();
  for (const e of hiEdges) { uniqAll.add(d.edgeF1[e]); uniqAll.add(d.edgeF2[e]); }
  log(`   per-pair vs per-facet exposure on THIS mesh: ${slots} facet-slots over ${uniqAll.size} distinct facets = ${(slots / uniqAll.size).toFixed(3)} counts/facet`);
  log('      h        IRR/facet LOOSE   IRR/facet STRICT   IRR/pair    ==>  REDUCIBLE %-of-mesh (loose / strict)');
  const rows5b: Array<Record<string, number>> = [];
  for (const hh of HS) {
    const anyIrr = new Map<number, boolean>(); const allIrr = new Map<number, boolean>();
    let pIrrA = 0; let pTotA = 0;
    for (let i = 0; i < pool.length; i += 1) {
      const o = oraclePair(pf1[i], pf2[i], KF, rA, 'fix', hh);
      pTotA += pArea[i]; if (o.irr) pIrrA += pArea[i];
      for (const f of [pf1[i], pf2[i]]) {
        anyIrr.set(f, (anyIrr.get(f) ?? false) || o.irr);
        allIrr.set(f, (allIrr.get(f) ?? true) && o.irr);
      }
    }
    let tA = 0; let lA = 0; let sA2 = 0;
    for (const [f, v] of anyIrr) { tA += d.areaMm2[f]; if (v) lA += d.areaMm2[f]; if (allIrr.get(f) === true) sA2 += d.areaMm2[f]; }
    const loose = lA / tA; const strict = sA2 / tA; const perPair = pIrrA / pTotA;
    const redL = (areaOver45 * (1 - loose)) / meshArea * 100;
    const redS = (areaOver45 * (1 - strict)) / meshArea * 100;
    log(`   ${hh.toExponential(0).padStart(7)}    ${f2(loose * 100, 2).padStart(8)}%          ${f2(strict * 100, 2).padStart(8)}%       ${f2(perPair * 100, 2).padStart(7)}%    ***  ${f2(redL, 4)}%  /  ${f2(redS, 4)}%  ***`);
    rows5b.push({ h: hh, K: KF, irrFacetLoose: loose * 100, irrFacetStrict: strict * 100, irrPair: perPair * 100, redLoosePct: redL, redStrictPct: redS, facets: anyIrr.size });
  }
  log('   READ: LOOSE is the ceiling on irreducibility (so the FLOOR on reducible); STRICT is the reverse.');
  log('   The honest headline is the pair, at the h where the h-ladder has stopped moving.');
  OUT.stage5b = { K: KF, poolN: pool.length, slotsPerFacet: slots / uniqAll.size, rows: rows5b };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — THE (K, h) GRID. THE ONLY HONEST FORM OF THE CONVERGENCE QUESTION.
//
// Arm A converges in K at fixed h. Arm B moves 1.5x in h at fixed K. Neither settles the quantity: the
// footprint turn is a limit in BOTH knobs and a plateau in one of them alone is worth nothing. This stage
// puts the whole corner on the page. A defensible number exists only if there is a CELL whose neighbours
// in BOTH directions agree with it.
//
// FP FLOOR, STATED SO THE SMALL-h COLUMN CANNOT BE READ PAST IT. rA ~ 45 mm in float64 resolves to
// ~1e-14 mm. A one-sided difference over step h on a surface of slope ~2 produces dr ~ 2h, so the
// difference carries ~log10(2h / 1e-14) significant digits. That is printed per column.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.has('6')) {
  const KG = envL('PF_S115_KGRID', '16,32,64');
  const HG = envL('PF_S115_HGRID', '2e-8,2e-7,2e-6,2e-5,2e-4,2e-3');
  const NG = envI('PF_S115_NG', 400);
  const src = process.env.PF_S115_GRIDSET === 'wall' ? wallRefE : curtRefE;
  const gs = goldenStride(src.length, Math.min(NG, src.length)).map((i) => src[i]);
  log(`── STAGE 6: THE (K, h) GRID on the ${process.env.PF_S115_GRIDSET === 'wall' ? 'WALL' : 'CURTAIN'} class at cut R=${CUT_REF}, n=${gs.length}  ${el()} ──`);
  log(`   fp headroom per h column (significant digits in the finite difference): ${HG.map((h) => `${h.toExponential(0)}:${Math.log10((2 * h) / 1e-14).toFixed(1)}`).join('  ')}`);
  log('   irreducible AREA share (%) — rows K, cols h.  A defensible cell agrees with BOTH its neighbours.');
  log(`      K \\ h   ${HG.map((h) => h.toExponential(0).padStart(11)).join('')}`);
  const grid: Array<Record<string, number>> = [];
  for (const k of KG) {
    const cells: string[] = [];
    for (const hh of HG) {
      const ars: number[] = []; const irs: boolean[] = [];
      for (const e of gs) {
        const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
        const o = oraclePair(f1, f2, k, rA, 'fix', hh);
        ars.push(d.areaMm2[f1] + d.areaMm2[f2]); irs.push(o.irr);
      }
      const ss = shareStats(ars, irs);
      cells.push(ss.share.toFixed(2).padStart(11));
      grid.push({ K: k, h: hh, share: ss.share, ciLo: ss.lo, ciHi: ss.hi });
    }
    log(`      ${String(k).padStart(5)}   ${cells.join('')}   ${el()}`);
  }
  // PLACEBO at the extreme corner — the small-h column must still read 0 on the C-infinity cone, or the
  // column is fp noise rather than a measurement.
  {
    const kk = KG[KG.length - 1]; const hh = HG[0];
    const ars: number[] = []; const irs: boolean[] = [];
    for (const e of gs) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const o = oraclePair(f1, f2, kk, rFlat, 'fix', hh);
      ars.push(d.areaMm2[f1] + d.areaMm2[f2]); irs.push(o.irr);
    }
    const ss = shareStats(ars, irs);
    log(`   PLACEBO at the extreme corner (K=${kk}, h=${hh.toExponential(0)}, C-infinity cone): irreducible AREA ${f2(ss.share, 4)}%  ${ss.share > 5 ? '*** FIRED — the small-h column is fp noise ***' : 'OK'}`);
    (OUT as Record<string, unknown>).stage6placebo = ss.share;
  }
  const sh = grid.map((g) => g.share);
  log(`   GRID SPREAD ${f2(Math.min(...sh), 2)}% .. ${f2(Math.max(...sh), 2)}%  = ${f2(Math.max(...sh) / Math.max(1e-9, Math.min(...sh)), 2)}x across the two knobs alone.`);
  OUT.stage6 = { n: gs.length, K: KG, h: HG, grid };
  log('');
}

OUT.meshArea = meshArea;
OUT.hiAreaMm2 = areaOver45;
writeFileSync(`${OUTDIR}/S115_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`wrote ${OUTDIR}/S115_${TAG}.json   done ${el()}`);
