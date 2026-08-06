// s114Requote.ts — FIX TWO STATISTICAL DEFECTS IN S112'S P1/P3 AND RE-QUOTE THEM HONESTLY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO DEFECTS, AS HANDED TO ME
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D1. `spreadRad` IS NOT CONVERGED IN LATTICE ORDER. Measured p50 90.1 / 75.3 / 58.8 / 44.5 / 36.7 deg at
//     k = 4/8/16/32/64 on the pinned straddling set, still falling 0.76-0.82x per doubling, while
//     `normDeg` is converged to 4 digits. S112's P1 (spreadDeg/normDeg) and P3 (normDeg - spreadDeg) BOTH
//     depend on it, so BOTH were quoted at an arbitrary k.
// D2. P3 WAS COMPUTED ON A CONTAMINATED POPULATION — the whole wall crease class (11,146 pairs), 60.48%
//     of which is the CONFORMED population S112 itself declares non-defective (normDeg ~0 by
//     construction). On the pinned straddling set the same statistic reads p50 58.98 deg.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D1 — WHAT `spreadRad` SHOULD DO AS k -> INFINITY. WORKED OUT FIRST, THEN CHECKED.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `orientRuler.ts:436` computes
//        spreadRad = 2 * acos( | (1/nAcc) * SUM over ALL CANDIDATE normals n_i | )
// where the sum runs over the order-k barycentric VERTEX lattice and, at each lattice point, over the
// 1..4 candidates `fdNormals` returns. Two facts follow immediately.
//
//  (a) SMOOTH PATCH. The order-k vertex lattice is an affine image of a regular lattice, so as k -> inf
//      the point set equidistributes on the footprint and the mean converges to the AREA AVERAGE of the
//      unit normal field. For a field sweeping uniformly through an angle `a`, the mean of the unit
//      vectors has length sin(a/2)/(a/2) = 1 - a^2/24 + O(a^4), so
//              spreadRad -> 2*acos(1 - a^2/24) = 2 * a/sqrt(12) = 0.57735 * a.
//      A FINITE, NON-ZERO LIMIT. (This is the ruler's own documented "~0.577*a", and it is right.)
//
//  (b) FOOTPRINT SPLIT BY A C0 CREASE, area fractions p and 1-p, dihedral D. The area average is
//      p*n_A + (1-p)*n_B, whose length is sqrt(1 - 2p(1-p)(1 - cos D)), so
//              spreadRad -> 2*acos( sqrt(1 - 2p(1-p)(1-cos D)) ),
//      which is EXACTLY D at p = 1/2 and falls to 0 like 2*sqrt(2p(1-cos D)) as p -> 0.
//      Again a FINITE limit.
//
// *** SO THE QUANTITY HAS A LIMIT AND THE DRIFT IS AN ESTIMATOR DEFECT, NOT A PROPERTY OF THE SURFACE. ***
// There are exactly two ways the shipped estimator fails to be that Riemann sum, and this tool separates
// them by measurement instead of assertion:
//
//   E1. CANDIDATE WEIGHTING, NOT POINT WEIGHTING. `nAcc` counts CANDIDATES, so a lattice point where
//       `fdNormals` returns 4 distinct normals gets FOUR TIMES the weight of a point where it returns 1.
//       The points that return several are exactly the ones within `hArc` of a crease — a set of measure
//       O(h) that the estimator inflates by up to 4x. This is not a Riemann sum of anything.
//   E2. THE VERTEX LATTICE SAMPLES THE BOUNDARY. The order-k lattice contains the footprint's three
//       vertices and all three edges: (3k) of its (k+1)(k+2)/2 points lie ON the boundary, a fraction
//       ~6/k. A CONFORMED facet puts its vertices and edges ON the crease ON PURPOSE, so those points
//       return both flanks. Their weight decays only like 1/k, and since spreadRad ~ 2*sqrt(2*eps*(1-cosD))
//       in the contaminating fraction eps, the READING decays like 1/sqrt(k) = 0.707x per doubling.
//       *** THE OBSERVED 0.76-0.82x PER DOUBLING IS THAT SIGNATURE. *** `inset` mitigates but does not
//       remove it: `inset` shrinks the lattice by 1-inset toward the centroid, so the outer ring sits at
//       inset/3 of the altitude, i.e. 1.67% of the altitude at inset 0.05 — micrometres on these facets.
//
// THE SUBSTITUTE, and it is the obvious one once E1/E2 are named:
//     spreadCent := 2*acos(| (1/N) SUM over the N = k^2 CENTROIDS of the k^2 congruent sub-triangles
//                             of  (1/nc)*SUM of that point's candidates | ).
// Equal-area midpoint quadrature: every point carries weight 1/k^2 exactly, no point is on the boundary,
// and each point contributes exactly one normal. It IS a Riemann sum for the area average, so it converges
// to the limits derived above. Its ladder is run beside the shipped one so the difference is visible.
//
// AND A SECOND, BETTER QUANTITY — because `spreadRad` was being used for something it is not.
// P3 asks "is the facet already as good as any single plane can be over this footprint?". The answer to
// THAT is the CHEBYSHEV RADIUS of the footprint's normal set:
//     cheb := min over unit c of max over the footprint of angle(c, n_S) — the best achievable normDeg.
// `spreadRad` is not it, and the gap is not small: at a balanced crease cheb = D/2 while spreadRad = D
// (a factor 2.000), and on a smooth sweep cheb = a/2 while spreadRad = 0.577a (a factor 1.155).
// *** SO P3's "normDeg - spreadDeg ~ 0 => plane-optimal" USED A FLOOR THAT IS 1.155x TO 2x TOO HIGH, i.e.
// IT SYSTEMATICALLY UNDER-STATES THE HEADROOM IT WAS MEASURING. *** `normDeg - cheb` is >= 0 by
// construction and is exactly "how much a better-oriented plane over the SAME footprint would buy".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, BEFORE THE FIRST RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  Q1  spreadCent CONVERGES: on the pinned straddling set its per-doubling ratio reaches 1.00 +/- 0.02 by
//      k = 64, while the shipped spreadRad's does not. *** KILL: if spreadCent's ratio is still outside
//      [0.95, 1.05] at the top of the ladder, my substitute is no better and I must say so. ***
//  Q2  The shipped spreadRad's decay is the BOUNDARY term (E2): removing the boundary (centroid lattice)
//      while KEEPING candidate weighting removes most of the drift. Descriptive; both decompositions are
//      printed either way.
//  Q3  HEADROOM ON THE STRADDLING CLASS. normDeg - cheb, both on the SAME converged lattice, is > 20 deg
//      at the median on the pinned straddling set. *** KILL: if it is under 5 deg, there is no orientation
//      headroom and the ~59 deg of S113's correction banner is an artefact of spreadRad's 2x floor. ***
//  Q4  CROSS-CHECK. The per-facet prize normDeg / chebFlank (best plane CONFINED TO ONE FLANK) agrees
//      with S113's empirical-ceiling route (35.2x whole target / 73.6x interior straddlers) to within 3x.
//      *** KILL: if the two routes differ by more than 3x, they are not measuring the same thing and
//      neither number may be quoted as "the fidelity prize". ***
//
// CONTROLS — the run is VOID if any fires, and I will say so rather than rescue the number.
//  C-A  MY RE-IMPLEMENTATION OF THE VERTEX LATTICE MUST REPRODUCE `orientOfFacet` TO 1e-9 deg on the
//       pinned set at k=8 / inset 0.05, on BOTH normDeg and spreadRad. If it does not, every ladder below
//       is measuring my bug.
//  C-B  THE PINNED DUMP MUST RECONCILE WITH THE STL (measDeg, area, coords) exactly, as S113 required.
//  C-C  ESTIMATOR FIXTURES with closed-form answers, TWO-SIDED (a floor AND a ceiling on each):
//       balanced crease -> spread = D, cheb = D/2;  smooth sweep -> spread = 0.577a, cheb = a/2.
//  C-D  SMOOTH NEGATIVE CONTROL on the same mesh: wall facets with adjacent dihedral < 2 deg must read
//       small cheb AND small headroom. A headroom instrument that fires on flat mesh is broken.
//  C-E  PLACEBO on the flank machinery: a RANDOM straight split of the footprint through its centroid,
//       cost-matched. If the random split's chebFlank matches the crease-located one, the crease location
//       bought nothing — S113's split operator scored 1.081x against a 1.080x placebo and that is exactly
//       the trap this arm exists to spring.
//
// MEASUREMENT DISCIPLINE. Never a bare COUNT, never a bare MAX: COUNT + AREA-share + MAX together, area
// over the UNIQUE facet set. `inset` is passed EXPLICITLY everywhere and swept. k is swept and its
// convergence shown, never assumed. h is swept. Every number says which mesh and which population.
//
// Usage: bash research/tools/run-s114-requote.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => process.env[n] ?? d;

const STYLE = envS('PF_S114_STYLE', 'GothicArches');
const STL = envS('PF_S114_STL', 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl');
const NDJ = envS('PF_S114_NDJSON', 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson');
const NDJC = envS('PF_S114_NDJSONC', 'research/exchange/_strataConformBisect/straddle/S113OPC_ORACLE_GOTH.ndjson');
const TAG = envS('PF_S114_TAG', 'GOTH');
const OUTDIR = 'research/exchange/_strataConformBisect/requote';

const HI_DEG = envF('PF_S114_HI_DEG', 45);
const CURTAIN_RATIO = envF('PF_S114_CURTAIN', 8);
const DROP_CUT = envF('PF_S114_DROP', 0.25);
const K_PUB = Math.round(envF('PF_S114_KPUB', 8));         // the k S112 published at
const INSET_PUB = envF('PF_S114_INSET_PUB', 0.05);         // the inset S112/S113 published at
const INSET_LO = envF('PF_S114_INSET_LO', 0);
const K_LADDER = envS('PF_S114_KLADDER', '4,8,16,32,64,128').split(',').map(Number);
const K_JUST = Math.round(envF('PF_S114_KJUST', 64));      // justified k, re-justified by the ladder below
const H_FD = envF('PF_S114_HFD', 2e-4);
const H_LADDER = envS('PF_S114_HLADDER', '2e-5,5e-5,2e-4,1e-3').split(',').map(Number);
const LADN = Math.round(envF('PF_S114_LADN', 160));        // ladder subsample size
const POPN = Math.round(envF('PF_S114_POPN', 900));        // high-k population subsample size
const K_FLANK = Math.round(envF('PF_S114_KFLANK', 24));    // lattice order for the flank decomposition
const AMBIG_DEG = envF('PF_S114_AMBIG', 5);                // candidate spread above which a point is ambiguous
const DIMS: StyleDims = { H: envF('PF_S114_H', 120), Rb: envF('PF_S114_RB', 40), Rt: envF('PF_S114_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

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
/** AREA-WEIGHTED percentile: sort by value, walk the area CDF. Count and area disagree here by 13-184x. */
const qArea = (v: number[], a: number[], p: number): number => {
  const idx = v.map((_, i) => i).filter((i) => Number.isFinite(v[i])).sort((x, y) => v[x] - v[y]);
  let tot = 0; for (const i of idx) tot += a[i];
  if (!(tot > 0)) return NaN;
  let acc = 0;
  for (const i of idx) { acc += a[i]; if (acc >= p * tot) return v[i]; }
  return v[idx[idx.length - 1]];
};

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
const nsMain: NormalSampler = fdNormals(rA, H, H_FD, H_FD);
const scratch = new Float64Array(12);

log('===== S114 — RE-QUOTING P1 AND P3 AFTER TWO STATISTICAL DEFECTS =====');
log(`style ${STYLE}  tag ${TAG}   published k=${K_PUB} inset=${INSET_PUB}   justified-k candidate ${K_JUST}   h=${H_FD} mm  H_ADAPT=${envF('PF_S114_HADAPT', 0) !== 0 ? 'ON (h = min(hFd, cell/4))' : 'OFF (fixed h)'}`);
log('D1 spreadRad drifts in k; D2 P3 was computed over a population 60.48% of which is non-defective.');
log('See this file\'s header for the k->infinity derivation and the four pre-registered predictions.');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — MESH, PRECOND, PINNED SET, RECONCILIATION CONTROL (C-B)
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
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um on this mesh)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  inconsistent ${d.inconsistentEdges}  ${el()}`);

interface PinRow {
  e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number;
  spread1: number; spread2: number; area1: number; area2: number;
}
const pin: PinRow[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as PinRow);
log(`loaded ${pin.length} pinned straddling pairs from ${NDJ}  (S112/S113: 3282)`);
{
  let dMeas = 0; let dArea = 0;
  for (const r of pin) {
    dMeas = Math.max(dMeas, Math.abs(d.edgeAngRad[r.e] * DEG - r.measDeg));
    dArea = Math.max(dArea, Math.abs(d.areaMm2[r.f1] - r.area1), Math.abs(d.areaMm2[r.f2] - r.area2));
  }
  log(`C-B CONTROL vs pinned dump: max |dmeasDeg| ${dMeas.toExponential(2)}  max |darea| ${dArea.toExponential(2)}`);
  if (dMeas > 1e-9 || dArea > 1e-12) { log('*** C-B FIRED: STL and pinned dump disagree. THE RUN IS VOID. ***'); process.exit(5); }
}
const pinF: number[] = [];
{ const seen = new Set<number>(); for (const r of pin) for (const f of [r.f1, r.f2]) if (!seen.has(f)) { seen.add(f); pinF.push(f); } }
let pinArea = 0; for (const f of pinF) pinArea += d.areaMm2[f];
log(`PINNED TARGET SET: ${pin.length} pairs, ${pinF.length} unique facets, AREA ${pinArea.toFixed(3)} mm2 = ${((pinArea / meshArea) * 100).toFixed(4)}% of mesh`);

// Part C's interior-straddler membership (intSep >= 45 && intMinor >= 0.05 at inset 0.10), 1,537 facets.
const intStrad = new Set<number>();
try {
  for (const l of readFileSync(NDJC, 'utf8').split('\n')) {
    if (l.length < 3) continue;
    const o = JSON.parse(l) as { f: number; intSep: number; intMinor: number };
    if (o.intSep >= 45 && o.intMinor >= 0.05) intStrad.add(o.f);
  }
  let a = 0; for (const f of intStrad) a += d.areaMm2[f];
  log(`Part C INTERIOR STRADDLERS: ${intStrad.size} facets, AREA ${a.toFixed(4)} mm2 = ${((a / meshArea) * 100).toFixed(4)}% of mesh  (S113: 1537 / 15.8233 / 0.0411%)`);
} catch { log(`(Part C ndjson ${NDJC} not readable — the interior-straddler arm will be skipped)`); }
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// GEOMETRY + LATTICES + ESTIMATORS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function woundNormal(f: number, out: Float64Array): void {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / L; out[1] = ny / L; out[2] = nz / L;
}
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
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};

/** the SHIPPED order-k barycentric VERTEX lattice, reproduced byte-for-byte from orientOfFacet:399-402. */
function baryVertex(k: number, inset: number): Float64Array {
  const sh = 1 - inset; const sc = inset / 3;
  const out = new Float64Array((((k + 1) * (k + 2)) / 2) * 3);
  let m = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc;
    out[m * 3] = wa; out[m * 3 + 1] = wb; out[m * 3 + 2] = 1 - wa - wb; m += 1;
  }
  return out;
}
/**
 * THE SUBSTITUTE'S LATTICE — the k^2 congruent sub-triangles' CENTROIDS. Equal area, so equal weight;
 * NO point on the boundary; it is exactly the midpoint rule for the area average.
 */
function baryCentroid(k: number): Float64Array {
  const out = new Float64Array(k * k * 3);
  let m = 0;
  for (let i = 0; i < k; i += 1) for (let j = 0; i + j <= k - 1; j += 1) {
    const wa = (i + 1 / 3) / k; const wb = (j + 1 / 3) / k;
    out[m * 3] = wa; out[m * 3 + 1] = wb; out[m * 3 + 2] = 1 - wa - wb; m += 1;
  }
  for (let i = 0; i < k; i += 1) for (let j = 0; i + j <= k - 2; j += 1) {
    const wa = (i + 2 / 3) / k; const wb = (j + 2 / 3) / k;
    out[m * 3] = wa; out[m * 3 + 1] = wb; out[m * 3 + 2] = 1 - wa - wb; m += 1;
  }
  return out;
}

interface Sampled {
  /** all candidate unit normals, 3 floats each */
  n: Float64Array;
  /** candidates at point i */
  nc: Int32Array;
  /** first candidate index of point i */
  off: Int32Array;
  /** parameter coords of point i, in (rRef*theta, z) mm */
  pth: Float64Array; pz: Float64Array;
  m: number; pts: number;
}
const sbuf = { n: new Float64Array(0), nc: new Int32Array(0), off: new Int32Array(0), pth: new Float64Array(0), pz: new Float64Array(0) };
function ensure(pts: number): void {
  if (sbuf.nc.length < pts) {
    sbuf.n = new Float64Array(pts * 4 * 3); sbuf.nc = new Int32Array(pts); sbuf.off = new Int32Array(pts);
    sbuf.pth = new Float64Array(pts); sbuf.pz = new Float64Array(pts);
  }
}
function sampleBary(f: number, bary: Float64Array, ns: NormalSampler): Sampled {
  const pts = bary.length / 3;
  ensure(pts);
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const rRef = rRefOf(f);
  let m = 0;
  for (let p = 0; p < pts; p += 1) {
    const wa = bary[p * 3]; const wb = bary[p * 3 + 1]; const wc = bary[p * 3 + 2];
    const th = wa * ath + wb * bth + wc * cth;
    const z = wa * az + wb * bz + wc * cz;
    const c = ns(th, z, scratch);
    sbuf.off[p] = m; sbuf.nc[p] = c; sbuf.pth[p] = rRef * th; sbuf.pz[p] = z;
    for (let i = 0; i < c; i += 1) {
      sbuf.n[m * 3] = scratch[i * 3]; sbuf.n[m * 3 + 1] = scratch[i * 3 + 1]; sbuf.n[m * 3 + 2] = scratch[i * 3 + 2]; m += 1;
    }
  }
  return { n: sbuf.n, nc: sbuf.nc, off: sbuf.off, pth: sbuf.pth, pz: sbuf.pz, m, pts };
}

/** SHIPPED estimator: mean over ALL CANDIDATES (orientRuler.ts:436). */
function spreadCandDeg(s: Sampled): number {
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < s.m; i += 1) { sx += s.n[i * 3]; sy += s.n[i * 3 + 1]; sz += s.n[i * 3 + 2]; }
  return 2 * Math.acos(Math.min(1, s.m > 0 ? Math.hypot(sx, sy, sz) / s.m : 1)) * DEG;
}
/** POINT-weighted: each lattice point contributes its candidates' average, weight 1. Kills E1. */
function spreadPtDeg(s: Sampled): number {
  let sx = 0; let sy = 0; let sz = 0;
  for (let p = 0; p < s.pts; p += 1) {
    let ax = 0; let ay = 0; let az = 0;
    for (let i = 0; i < s.nc[p]; i += 1) { const o = (s.off[p] + i) * 3; ax += s.n[o]; ay += s.n[o + 1]; az += s.n[o + 2]; }
    const c = Math.max(1, s.nc[p]);
    sx += ax / c; sy += ay / c; sz += az / c;
  }
  return 2 * Math.acos(Math.min(1, s.pts > 0 ? Math.hypot(sx, sy, sz) / s.pts : 1)) * DEG;
}
/** the facet's own normDeg over THIS sample set — so headroom is taken on one lattice, not two. */
function normDegOf(fn: Float64Array, s: Sampled): number {
  let best = -1;
  for (let i = 0; i < s.m; i += 1) { const a = angU(fn, 0, s.n, i * 3); if (a > best) best = a; }
  return best * DEG;
}
/**
 * CHEBYSHEV RADIUS of a normal subset — the best achievable normDeg over that subset.
 * `ub` is attained by an explicitly-constructed centre (Frank-Wolfe from the mean), hence ACHIEVABLE and
 * a valid upper bound. `lb` is half a two-pass diameter witness (farthest-from-mean, then farthest from
 * that), valid by the triangle inequality. TWO-SIDED: a collapsed implementation cannot satisfy both.
 */
const CORE = Math.round(envF('PF_S114_CHEBCORE', 192));
const CORE_ROUNDS = Math.round(envF('PF_S114_CHEBROUNDS', 6));
const coreBuf = { idx: new Int32Array(0), ang: new Float64Array(0), core: new Int32Array(0) };
/**
 * ⚠ THE FIRST VERSION OF THIS FUNCTION WAS CAUGHT BY C-C AND I AM RECORDING THAT RATHER THAN DELETING IT.
 * It picked the `CORE` FARTHEST-FROM-MEAN points and ran Frank-Wolfe on those alone. On the balanced
 * two-flank fixture (p=0.5, D=140 deg) every point is EXACTLY 70 deg from the mean, so "farthest" is a
 * 20,000-way tie, the selection took the first 256 by index — all of them in flank A — and the returned
 * centre was flank A's own normal. MEASURED: cheb UB 130.34 deg against a closed form of 70.00, a 1.86x
 * OVER-read, while the LB read 70.00 exactly. *** THE FIXTURE'S TWO-SIDEDNESS IS WHAT CAUGHT IT: a bare
 * upper-bound assertion would have passed, because 130 IS a valid upper bound. *** It was never unsound,
 * only useless — and useless in the direction that would have inflated the very ceiling this tool exists
 * to measure.
 *
 * THE CURE — COLUMN GENERATION, which is exact at convergence rather than heuristic. The core is seeded
 * with BOTH the extremes (farthest from the mean, which is where a thin far-flank lens lives) AND a
 * stride subsample (which a tie or a balanced split needs), Frank-Wolfe runs on the core, and then the
 * FULL set's argmax against the constructed centre is ADDED to the core and the whole thing repeats.
 * It stops when the full set has nothing worse than the core already had, at which point the core's
 * minimax IS the full set's. `ub` is always the achieved max over the FULL set from an explicit centre
 * (a valid UPPER bound whatever the core did) and `lb` is half a two-pass diameter witness over the FULL
 * set (a valid LOWER bound). Two-sided at every exit.
 */
function chebOf(n: Float64Array, idx: Int32Array, cnt: number): { ub: number; lb: number } {
  if (cnt === 0) return { ub: NaN, lb: NaN };
  let sx = 0; let sy = 0; let sz = 0;
  for (let t = 0; t < cnt; t += 1) { const i = idx[t]; sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  const L = Math.hypot(sx, sy, sz) || 1;
  const mean = new Float64Array([sx / L, sy / L, sz / L]);
  if (coreBuf.idx.length < cnt) { coreBuf.idx = new Int32Array(cnt); coreBuf.ang = new Float64Array(cnt); }
  let far = -1; let iFar = idx[0];
  for (let t = 0; t < cnt; t += 1) {
    const i = idx[t]; const a = angU(n, i * 3, mean, 0);
    coreBuf.idx[t] = i; coreBuf.ang[t] = a;
    if (a > far) { far = a; iFar = i; }
  }
  // LB first: half a two-pass diameter witness over the FULL set.
  const p1 = new Float64Array([n[iFar * 3], n[iFar * 3 + 1], n[iFar * 3 + 2]]);
  let diam = 0;
  for (let t = 0; t < cnt; t += 1) { const i = idx[t]; const v = angU(n, i * 3, p1, 0); if (v > diam) diam = v; }
  const lb = 0.5 * diam;

  const capCore = Math.min(cnt, CORE) + CORE_ROUNDS + 2;
  if (coreBuf.core.length < capCore) coreBuf.core = new Int32Array(capCore);
  let nCore = 0;
  if (cnt <= CORE) {
    for (let t = 0; t < cnt; t += 1) { coreBuf.core[nCore] = coreBuf.idx[t]; nCore += 1; }
  } else {
    // HALF the core = the EXTREMES (where a thin far-flank lens lives), selected by an O(cnt) histogram
    // rather than an O(cnt log cnt) sort; HALF = a uniform STRIDE (which a tie or a balanced split needs).
    const NB = 512; const hist = new Int32Array(NB);
    const sc = far > 0 ? (NB - 1) / far : 0;
    for (let t = 0; t < cnt; t += 1) hist[Math.min(NB - 1, Math.floor(coreBuf.ang[t] * sc))] += 1;
    const half = CORE >> 1;
    let acc = 0; let b0 = NB - 1;
    for (let b = NB - 1; b >= 0; b -= 1) { acc += hist[b]; b0 = b; if (acc >= half) break; }
    for (let t = 0; t < cnt && nCore < half; t += 1) {
      if (Math.min(NB - 1, Math.floor(coreBuf.ang[t] * sc)) >= b0) { coreBuf.core[nCore] = coreBuf.idx[t]; nCore += 1; }
    }
    const rest = CORE - nCore;
    const stride = cnt / Math.max(1, rest);
    for (let t = 0; t < rest; t += 1) { coreBuf.core[nCore] = coreBuf.idx[Math.min(cnt - 1, Math.floor(t * stride))]; nCore += 1; }
  }
  const cur = new Float64Array(3);
  const bestC = new Float64Array(3);
  let ub = Infinity;
  for (let round = 0; round < CORE_ROUNDS; round += 1) {
    const worstCore = (c: Float64Array): { a: number; i: number } => {
      let a = -1; let bi = coreBuf.core[0];
      for (let t = 0; t < nCore; t += 1) { const i = coreBuf.core[t]; const v = angU(n, i * 3, c, 0); if (v > a) { a = v; bi = i; } }
      return { a, i: bi };
    };
    cur.set(mean); bestC.set(mean);
    let bestA = worstCore(cur).a;
    for (let it = 0; it < 90; it += 1) {
      const w = worstCore(cur);
      const lam = 0.5 / (it + 2);
      const tx = (1 - lam) * cur[0] + lam * n[w.i * 3];
      const ty = (1 - lam) * cur[1] + lam * n[w.i * 3 + 1];
      const tz = (1 - lam) * cur[2] + lam * n[w.i * 3 + 2];
      const l2 = Math.hypot(tx, ty, tz) || 1;
      cur[0] = tx / l2; cur[1] = ty / l2; cur[2] = tz / l2;
      const a = worstCore(cur).a;
      if (a < bestA) { bestA = a; bestC.set(cur); }
    }
    let fullMax = -1; let iFull = idx[0];
    for (let t = 0; t < cnt; t += 1) { const i = idx[t]; const v = angU(n, i * 3, bestC, 0); if (v > fullMax) { fullMax = v; iFull = i; } }
    ub = fullMax;
    if (fullMax <= bestA * (1 + 1e-9) + 1e-12 || nCore >= coreBuf.core.length) break;
    coreBuf.core[nCore] = iFull; nCore += 1;   // column generation: the full set's witness joins the core
  }
  return { ub: ub * DEG, lb: lb * DEG };
}
const ALLIDX = { buf: new Int32Array(0) };
function allIdx(m: number): Int32Array {
  if (ALLIDX.buf.length < m) { ALLIDX.buf = new Int32Array(m); for (let i = 0; i < ALLIDX.buf.length; i += 1) ALLIDX.buf[i] = i; }
  return ALLIDX.buf;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// C-A — MY VERTEX LATTICE MUST REPRODUCE `orientOfFacet` EXACTLY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const bv = baryVertex(K_PUB, INSET_PUB);
  const fn = new Float64Array(3);
  let dn = 0; let ds = 0;
  const sub = pinF.filter((_, i) => i % Math.max(1, Math.floor(pinF.length / 300)) === 0).slice(0, 300);
  for (const f of sub) {
    const [ath, bth, cth] = th3(f);
    const o = orientOfFacet(nsMain, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_PUB, inset: INSET_PUB, orient: 'winding', scratch });
    woundNormal(f, fn);
    const s = sampleBary(f, bv, nsMain);
    dn = Math.max(dn, Math.abs(normDegOf(fn, s) - o.normDeg));
    ds = Math.max(ds, Math.abs(spreadCandDeg(s) - o.spreadRad * DEG));
  }
  log(`── C-A CONTROL: my vertex lattice vs the SHIPPED orientOfFacet (n=${sub.length}, k=${K_PUB}, inset ${INSET_PUB}) ──`);
  log(`   max |dnormDeg| ${dn.toExponential(2)} deg   max |dspreadDeg| ${ds.toExponential(2)} deg   (bar 1e-9)`);
  if (dn > 1e-9 || ds > 1e-9) { log('*** C-A FIRED: my re-implementation is not the shipped ruler. THE RUN IS VOID. ***'); process.exit(6); }
  log('   [PASS] every ladder below measures the shipped estimator, not a re-implementation of it.');
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// C-C — ESTIMATOR FIXTURES WITH CLOSED-FORM ANSWERS, TWO-SIDED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  log('── C-C FIXTURES: the two limits derived in the header, checked on synthetic normal sets ──');
  const mkTwo = (p: number, Ddeg: number, N: number): { n: Float64Array; m: number } => {
    const n = new Float64Array(N * 3); const Dr = (Ddeg * Math.PI) / 180;
    const nA = Math.round(p * N);
    for (let i = 0; i < N; i += 1) {
      const th = i < nA ? 0 : Dr;
      n[i * 3] = Math.cos(th); n[i * 3 + 1] = Math.sin(th); n[i * 3 + 2] = 0;
    }
    return { n, m: N };
  };
  const spreadOfRaw = (n: Float64Array, m: number): number => {
    let sx = 0; let sy = 0; let sz = 0;
    for (let i = 0; i < m; i += 1) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
    return 2 * Math.acos(Math.min(1, Math.hypot(sx, sy, sz) / m)) * DEG;
  };
  let fail = 0;
  for (const [p, D] of [[0.5, 140], [0.5, 60], [0.2, 140], [0.05, 140]] as Array<[number, number]>) {
    const N = 20000; const t = mkTwo(p, D, N);
    const meas = spreadOfRaw(t.n, t.m);
    const Dr = (D * Math.PI) / 180;
    const pred = 2 * Math.acos(Math.sqrt(Math.max(0, 1 - 2 * p * (1 - p) * (1 - Math.cos(Dr))))) * DEG;
    const ch = chebOf(t.n, allIdx(t.m), t.m);
    const chPred = D / 2;
    const ok = Math.abs(meas - pred) < 0.05 && Math.abs(ch.ub - chPred) < 0.25 && ch.lb <= ch.ub + 1e-9 && ch.lb > chPred - 0.25;
    if (!ok) fail += 1;
    log(`   two-flank p=${p.toFixed(2)} D=${D}deg :  spread measured ${meas.toFixed(4)} vs closed form ${pred.toFixed(4)}   |  cheb UB ${ch.ub.toFixed(4)} LB ${ch.lb.toFixed(4)} vs D/2 ${chPred.toFixed(4)}   ${ok ? 'ok' : '*** MISMATCH ***'}`);
  }
  for (const a of [10, 60, 140]) {
    const N = 40000; const n = new Float64Array(N * 3); const ar = (a * Math.PI) / 180;
    for (let i = 0; i < N; i += 1) { const th = (ar * (i + 0.5)) / N; n[i * 3] = Math.cos(th); n[i * 3 + 1] = Math.sin(th); }
    const meas = spreadOfRaw(n, N);
    const pred = 2 * Math.acos(Math.sin(ar / 2) / (ar / 2)) * DEG;
    const ch = chebOf(n, allIdx(N), N);
    const ok = Math.abs(meas - pred) < 0.02 && Math.abs(ch.ub - a / 2) < 0.25 && ch.lb > a / 2 - 0.25;
    if (!ok) fail += 1;
    log(`   smooth sweep a=${a}deg      :  spread measured ${meas.toFixed(4)} vs closed form ${pred.toFixed(4)} (=${(pred / a).toFixed(5)}*a)  |  cheb UB ${ch.ub.toFixed(4)} LB ${ch.lb.toFixed(4)} vs a/2 ${(a / 2).toFixed(4)}   ${ok ? 'ok' : '*** MISMATCH ***'}`);
  }
  log(`   >>> spreadRad OVERSTATES the single-plane floor by 2.000x at a balanced crease and 1.155x on a`);
  log('       smooth sweep. P3 subtracted THAT from normDeg, so P3 under-states its own headroom.');
  if (fail > 0) { log('*** C-C FIRED: the estimator does not match its own closed form. THE RUN IS VOID. ***'); process.exit(7); }
  log('   [PASS] both closed forms reproduced, cheb bracketed two-sided.');
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — POPULATIONS. Rebuild S112's wall/crease/conformed/straddling funnel, printed in full.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface WRow { e: number; f1: number; f2: number; measDeg: number; crease: boolean; normHi: number; normLo: number; drop: number; }
const wall: WRow[] = [];
{
  const centroid = (f: number): [number, number, number] => {
    let cx = 0; let cy = 0; let cz = 0;
    for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
    return [cx / 3, cy / 3, cz / 3];
  };
  const sharedEndpoints = (e: number): number[] | null => {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e]; const out: number[] = [];
    for (let a = 0; a < 3; a += 1) {
      const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
      for (let b = 0; b < 3; b += 1) {
        if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
      }
    }
    return out.length === 6 ? out : null;
  };
  const creaseLabel = (e: number): boolean => {
    const p = sharedEndpoints(e);
    if (p !== null) {
      const th0 = Math.atan2(p[1], p[0]);
      const kE = locateKinkRaw(rA, th0, p[2], th0 + dThRaw(th0, Math.atan2(p[4], p[3])), p[5], PRED);
      if (kE !== null && !kE.jump) return true;
    }
    const c1 = centroid(d.edgeF1[e]); const c2 = centroid(d.edgeF2[e]);
    const thc = Math.atan2(c1[1], c1[0]);
    const kS = locateKinkRaw(rA, thc, c1[2], thc + dThRaw(thc, Math.atan2(c2[1], c2[0])), c2[2], PRED);
    return kS !== null && !kS.jump;
  };
  const nOf = (f: number, inset: number): number => {
    const [ath, bth, cth] = th3(f);
    return orientOfFacet(nsMain, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_PUB, inset, orient: 'winding', scratch }).normDeg;
  };
  const hiThr = (HI_DEG * Math.PI) / 180;
  let nHigh = 0;
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    nHigh += 1;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) continue;
    const normHi = Math.max(nOf(f1, INSET_PUB), nOf(f2, INSET_PUB));
    const normLo = Math.max(nOf(f1, INSET_LO), nOf(f2, INSET_LO));
    wall.push({ e, f1, f2, measDeg: d.edgeAngRad[e] * DEG, crease: creaseLabel(e), normHi, normLo, drop: normLo > 1e-9 ? normHi / normLo : 1 });
  }
  log(`── STAGE 1: POPULATIONS (S112's funnel, rebuilt and printed in full)  ${el()} ──`);
  log(`   dihedral > ${HI_DEG} deg                 ${nHigh}   (S108: 19,582)`);
  log(`   ... AND WALL (graphRatio <= ${CURTAIN_RATIO})     ${wall.length}   (S112: 13,092)`);
}
const creasePairs = wall.filter((r) => r.crease);
const residPairs = wall.filter((r) => !r.crease);
const conformedPairs = creasePairs.filter((r) => r.drop < DROP_CUT && r.normLo > 10);
const straddlingPairs = creasePairs.filter((r) => r.drop >= DROP_CUT && r.normHi > 10);
const areaOfPairs = (rs: WRow[]): { n: number; a: number; nf: number } => {
  const s = new Set<number>(); for (const r of rs) { s.add(r.f1); s.add(r.f2); }
  let a = 0; for (const f of s) a += d.areaMm2[f];
  return { n: rs.length, a, nf: s.size };
};
{
  const c = areaOfPairs(creasePairs); const rr = areaOfPairs(residPairs);
  const cf = areaOfPairs(conformedPairs); const st = areaOfPairs(straddlingPairs);
  log(`   ... crease-labelled              ${creasePairs.length}   (S112 P3 population: 11,146)   facets ${c.nf}  AREA ${c.a.toFixed(3)} mm2 = ${((c.a / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`   ... residual (no crease)         ${residPairs.length}                                    facets ${rr.nf}  AREA ${rr.a.toFixed(3)} mm2 = ${((rr.a / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`   of the crease class:  CONFORMED (drop<${DROP_CUT}, normLo>10) ${conformedPairs.length} = ${((conformedPairs.length / Math.max(1, creasePairs.length)) * 100).toFixed(2)}%  facets ${cf.nf}  AREA ${cf.a.toFixed(3)} mm2`);
  log(`                         STRADDLING (drop>=${DROP_CUT}, normHi>10) ${straddlingPairs.length} = ${((straddlingPairs.length / Math.max(1, creasePairs.length)) * 100).toFixed(2)}%  facets ${st.nf}  AREA ${st.a.toFixed(3)} mm2`);
  log(`   *** THE D2 CONTAMINATION, MEASURED: ${((conformedPairs.length / Math.max(1, creasePairs.length)) * 100).toFixed(2)}% of P3's population is the class S112 itself calls`);
  log('       non-defective. (S113 correction banner: 60.48%.)');
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — DEFECT 1: WHAT DOES `spreadRad` CONVERGE TO?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
type Est = {
  cand: number; pt: number; cent: number; centCand: number; chebUB: number; chebLB: number; norm: number;
  multiFrac: number; meanNc: number; minorArea: number; sepDeg: number;
};
const fnBuf = new Float64Array(3);
/**
 * 2-means on the sphere over the PER-POINT normals of an EQUAL-AREA lattice, so the minority cluster's
 * point share IS an AREA share. This is the quantity that says how big the far flank actually is —
 * without it a large `normDeg` and a large `cheb` cannot be told from a sliver.
 */
function minorityOf(pn: Float64Array, pts: number): { minor: number; sepDeg: number } {
  if (pts < 4) return { minor: 0, sepDeg: 0 };
  const c = new Float64Array(6);
  let sx = 0; let sy = 0; let sz = 0;
  for (let p = 0; p < pts; p += 1) { sx += pn[p * 3]; sy += pn[p * 3 + 1]; sz += pn[p * 3 + 2]; }
  const L = Math.hypot(sx, sy, sz) || 1;
  const mean = new Float64Array([sx / L, sy / L, sz / L]);
  let i1 = 0; let best = -1;
  for (let p = 0; p < pts; p += 1) { const a = angU(pn, p * 3, mean, 0); if (a > best) { best = a; i1 = p; } }
  let i2 = 0; best = -1;
  for (let p = 0; p < pts; p += 1) { const a = angU(pn, p * 3, pn, i1 * 3); if (a > best) { best = a; i2 = p; } }
  c[0] = pn[i1 * 3]; c[1] = pn[i1 * 3 + 1]; c[2] = pn[i1 * 3 + 2];
  c[3] = pn[i2 * 3]; c[4] = pn[i2 * 3 + 1]; c[5] = pn[i2 * 3 + 2];
  let na = 0; let nb = 0;
  for (let it = 0; it < 20; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; na = 0; nb = 0;
    for (let p = 0; p < pts; p += 1) {
      if (angU(pn, p * 3, c, 0) <= angU(pn, p * 3, c, 3)) { ax += pn[p * 3]; ay += pn[p * 3 + 1]; az += pn[p * 3 + 2]; na += 1; }
      else { bx += pn[p * 3]; by += pn[p * 3 + 1]; bz += pn[p * 3 + 2]; nb += 1; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (nb > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || nb === 0) break;
  }
  return { minor: Math.min(na, nb) / pts, sepDeg: na > 0 && nb > 0 ? angU(c, 0, c, 3) * DEG : 0 };
}
const pnBuf = { a: new Float64Array(0) };
function perPointNormals(s: Sampled): Float64Array {
  if (pnBuf.a.length < s.pts * 3) pnBuf.a = new Float64Array(s.pts * 3);
  for (let p = 0; p < s.pts; p += 1) {
    let ax = 0; let ay = 0; let az = 0;
    for (let i = 0; i < s.nc[p]; i += 1) { const o = (s.off[p] + i) * 3; ax += s.n[o]; ay += s.n[o + 1]; az += s.n[o + 2]; }
    const L = Math.hypot(ax, ay, az) || 1;
    pnBuf.a[p * 3] = ax / L; pnBuf.a[p * 3 + 1] = ay / L; pnBuf.a[p * 3 + 2] = az / L;
  }
  return pnBuf.a;
}
/** the footprint's diameter in the (rRef*theta, z) parameter plane, mm — the scale h must live under. */
function paramDiamMm(f: number): number {
  const [ath, bth, cth] = th3(f);
  const r = rRefOf(f);
  const px = [r * ath, r * bth, r * cth];
  const pz = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  return Math.max(Math.hypot(px[0] - px[1], pz[0] - pz[1]), Math.hypot(px[1] - px[2], pz[1] - pz[2]), Math.hypot(px[0] - px[2], pz[0] - pz[2]));
}
/**
 * SCALE-ADAPTIVE h. *** A FIXED h IS ITSELF A RESOLUTION CAP AND THE LADDER RAN INTO IT. *** Once the
 * lattice cell is comparable to `hArc`, EVERY probe's own finite-difference window reaches its
 * neighbours, so a crease sitting on the footprint BOUNDARY leaks into interior probes and the sup jumps
 * — which is exactly the failure `locateTurnAdaptive` exists to avoid (`orientRuler.ts:566-593`), and it
 * is the same rule: keep h to a QUARTER of the cell. MEASURED on the CONFORMED population with h fixed at
 * 2e-4 mm: k=64 -> 128 moved cheb 2.094 -> 18.663 and normDeg 2.41 -> 34.85 while the minority-flank AREA
 * share COLLAPSED 34.4% -> 0.78%, i.e. the jump is carried by a set of ~zero area. That is the window
 * leaking, not the surface.
 */
const H_ADAPT = envF('PF_S114_HADAPT', 0) !== 0;
function samplerFor(f: number, k: number, base: NormalSampler): NormalSampler {
  if (!H_ADAPT) return base;
  const cell = paramDiamMm(f) / Math.max(1, k);
  const h = Math.max(1e-9, Math.min(H_FD, cell / 4));
  return fdNormals(rA, H, h, h);
}
function estimate(f: number, k: number, inset: number, nsIn: NormalSampler, withCheb: boolean): Est {
  const ns = samplerFor(f, k, nsIn);
  woundNormal(f, fnBuf);
  const sv = sampleBary(f, baryVertex(k, inset), ns);
  const cand = spreadCandDeg(sv); const pt = spreadPtDeg(sv);
  let multi = 0; let ncSum = 0;
  for (let p = 0; p < sv.pts; p += 1) { if (sv.nc[p] > 1) multi += 1; ncSum += sv.nc[p]; }
  const mf = sv.pts > 0 ? multi / sv.pts : 0; const mn = sv.pts > 0 ? ncSum / sv.pts : 0;
  const sc = sampleBary(f, baryCentroid(k), ns);
  const cent = spreadPtDeg(sc); const centCand = spreadCandDeg(sc);
  const norm = normDegOf(fnBuf, sc);
  let ub = NaN; let lb = NaN;
  if (withCheb) { const ch = chebOf(sc.n, allIdx(sc.m), sc.m); ub = ch.ub; lb = ch.lb; }
  const mo = minorityOf(perPointNormals(sc), sc.pts);
  return { cand, pt, cent, centCand, chebUB: ub, chebLB: lb, norm, multiFrac: mf, meanNc: mn, minorArea: mo.minor, sepDeg: mo.sepDeg };
}

/**
 * DETERMINISTIC SUBSAMPLE — a GOLDEN-RATIO stride coprime to the list length, NOT a fixed stride.
 *
 * ⚠ THE FIXED STRIDE WAS MEASURED WRONG AND I AM RECORDING IT RATHER THAN DELETING IT. The pinned facet
 * list is ordered by EDGE INDEX, which is spatially ordered, so a fixed stride ALIASES against the mesh's
 * own periodicity. MEASURED (`research/tools/s114qSubBias.cjs`, straight from the pinned dump so there is
 * no instrument in the loop): the full 6,193-facet population reads spreadDeg(k=8, inset 0.05) p50 20.71,
 * while a fixed stride reads 40.77 at n=80 (1.97x), 30.41 at n=350 (1.47x) and 16.63 at n=1200 (0.80x) —
 * biased, and not even in a consistent DIRECTION. The golden-ratio stride reads 18.79 / 21.07 / 18.89
 * (0.91x / 1.02x / 0.91x). A first run of this tool used the fixed stride; its LEVELS were void and it
 * was discarded. Convergence RATIOS were unaffected (same facets at every k), which is exactly why a
 * ladder cannot substitute for an unbiased sample.
 */
const strat = (arr: number[], n: number): number[] => {
  if (arr.length <= n) return arr.slice();
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let g = Math.max(1, Math.round(arr.length * 0.6180339887498949) | 1);
  while (g > 1 && gcd(g, arr.length) !== 1) g += 2;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(arr[(i * g) % arr.length]);
  return out;
};
const conformedF: number[] = [];
{ const s = new Set<number>(); for (const r of conformedPairs) for (const f of [r.f1, r.f2]) if (!s.has(f)) { s.add(f); conformedF.push(f); } }
const smoothF: number[] = [];
{
  let seed = 987654321;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const inPin = new Set(pinF); const lo = (2 * Math.PI) / 180;
  for (let t = 0; t < 600000 && smoothF.length < 900; t += 1) {
    const f = Math.floor(rnd() * nTri);
    if (inPin.has(f) || d.perFacetMaxRad[f] >= lo || graphRatio(f) > CURTAIN_RATIO) continue;
    smoothF.push(f);
  }
}
// ── C-F SUBSAMPLE BIAS CONTROL. Every level below is quoted off a subsample, so the subsample must be
// checked against the FULL population on a quantity that needs no instrument: the dump's own per-facet
// spreadDeg at k=8 / inset 0.05. See `strat`'s header for the fixed-stride bias this control caught.
{
  const spOf = new Map<number, number>();
  for (const r of pin) { if (!spOf.has(r.f1)) spOf.set(r.f1, r.spread1); if (!spOf.has(r.f2)) spOf.set(r.f2, r.spread2); }
  const full = pinF.map((f) => spOf.get(f) as number);
  log('── C-F SUBSAMPLE BIAS CONTROL (dump values only, no instrument in the loop) ──');
  log(`   FULL pinned population n=${full.length}  per-facet spreadDeg(k=8, inset 0.05)  p10 ${q(full, 0.1).toFixed(2)} p50 ${q(full, 0.5).toFixed(2)} p90 ${q(full, 0.9).toFixed(2)}`);
  let bad = 0;
  for (const n of [LADN, POPN]) {
    const s = strat(pinF, n).map((f) => spOf.get(f) as number);
    const rat = q(s, 0.5) / Math.max(1e-9, q(full, 0.5));
    if (rat < 0.8 || rat > 1.25) bad += 1;
    log(`   subsample n=${String(n).padStart(4)}  p50 ${q(s, 0.5).toFixed(2).padStart(7)}  = ${rat.toFixed(2)}x the full population   ${rat < 0.8 || rat > 1.25 ? '*** BIASED ***' : 'ok'}`);
  }
  if (bad > 0) { log('*** C-F FIRED: the subsample does not represent the population. THE RUN IS VOID. ***'); process.exit(8); }
  log('   [PASS] bar is 0.80-1.25x; a fixed stride read 1.97x here and its run was discarded.');
  log('');
}

// ── THE THIRD ACCOUNTING DEFECT, and it needs no new measurement: P1 and P3 as published are a PAIR MAX
// of normDeg against a PAIR MAX of spreadDeg, and the two maxima need not be the SAME FACET.
{
  const dsp = pin.map((r) => Math.abs(r.spread1 - r.spread2));
  const exMax = pin.map((r) => r.normHi - Math.max(r.spread1, r.spread2));
  const exMin = pin.map((r) => r.normHi - Math.min(r.spread1, r.spread2));
  const spPair = pin.map((r) => Math.max(r.spread1, r.spread2));
  const spOf = new Map<number, number>();
  for (const r of pin) { if (!spOf.has(r.f1)) spOf.set(r.f1, r.spread1); if (!spOf.has(r.f2)) spOf.set(r.f2, r.spread2); }
  const perF = pinF.map((f) => spOf.get(f) as number);
  log('── D3 (FOUND HERE, NOT HANDED TO ME): P1/P3 ARE PAIR-MAX STATISTICS AND THE TWO MAXIMA CAN BE');
  log('   DIFFERENT FACETS. Straight from the pinned dump — no instrument, no subsample, all 3,282 rows. ──');
  log(`   |spread1 - spread2| within a pair: p10 ${q(dsp, 0.1).toFixed(2)} p50 ${q(dsp, 0.5).toFixed(2)} p90 ${q(dsp, 0.9).toFixed(2)} MAX ${mx(dsp).toFixed(2)} deg`);
  log(`   pairs whose two facets differ by > 1 deg in spreadDeg: ${dsp.filter((x) => x > 1).length} = ${((dsp.filter((x) => x > 1).length / pin.length) * 100).toFixed(2)}%`);
  log(`   P3 AS PUBLISHED   normHi - MAX(spread1,spread2): p10 ${q(exMax, 0.1).toFixed(2)} p50 ${q(exMax, 0.5).toFixed(2)} p90 ${q(exMax, 0.9).toFixed(2)}   (S113 banner: 25.28 / 58.98 / 84.51)`);
  log(`   SAME STATISTIC    normHi - MIN(spread1,spread2): p10 ${q(exMin, 0.1).toFixed(2)} p50 ${q(exMin, 0.5).toFixed(2)} p90 ${q(exMin, 0.9).toFixed(2)}`);
  log(`   *** THE PUBLISHED NUMBER MOVES ${(q(exMin, 0.5) / Math.max(1e-9, q(exMax, 0.5))).toFixed(3)}x AT THE MEDIAN PURELY ON WHICH FACET'S SPREAD IS SUBTRACTED. ***`);
  log(`   spreadDeg PER FACET p50 ${q(perF, 0.5).toFixed(2)} (n=${perF.length})  vs PAIR-MAX p50 ${q(spPair, 0.5).toFixed(2)} (n=${pin.length})  => pair-max inflates the median ${(q(spPair, 0.5) / Math.max(1e-9, q(perF, 0.5))).toFixed(2)}x`);
  log('   Everything below is therefore quoted PER FACET.');
  log('');
}

log(`── STAGE 2: DEFECT 1 — THE k-LADDER, DECOMPOSED  ${el()} ──`);
log('   COLUMNS:  cand = the SHIPPED spreadRad (vertex lattice, candidate-weighted)');
log('             pt   = same lattice, POINT-weighted (removes E1: multi-candidate over-weighting)');
log('             cent = CENTROID lattice, point-weighted  <== THE SUBSTITUTE (removes E1 AND E2)');
log('             cCnd = centroid lattice but candidate-weighted (isolates E1 alone)');
log('             cheb = Chebyshev radius over the centroid lattice = BEST ACHIEVABLE normDeg');
log('             norm = normDeg over the SAME centroid lattice;  minA = MINORITY-FLANK AREA share');
log('   Each column shows p50 and, in brackets, the ratio to the previous k (1.000 = converged).');
log('   *** TWO KINDS OF QUANTITY, AND THEY CONVERGE FROM OPPOSITE SIDES. *** `cent` is an INTEGRAL');
log('   (area average) and converges from either side; `norm` and `cheb` are SUPREMA over the sample set,');
log('   so at every finite k they are LOWER BOUNDS and can only rise. A sup that is still rising has not');
log('   resolved the feature yet — `minA` says how much area it is looking for.');
const ladderSets: Array<[string, number[]]> = [
  ['STRADDLING (pinned 3,282)', strat(pinF, LADN)],
  ['CONFORMED (S112 calls it OK)', strat(conformedF, LADN)],
  ['SMOOTH control (<2 deg)', strat(smoothF, Math.min(LADN, smoothF.length))],
];
const ladderJson: Record<string, unknown> = {};
for (const [nm, set] of ladderSets) {
  log(`   ${nm}  n=${set.length}`);
  let prev: Est | null = null;
  const rows: Array<Record<string, number>> = [];
  for (const k of K_LADDER) {
    const es = set.map((f) => estimate(f, k, INSET_PUB, nsMain, true));
    const cur = {
      cand: q(es.map((x) => x.cand), 0.5), pt: q(es.map((x) => x.pt), 0.5), cent: q(es.map((x) => x.cent), 0.5),
      centCand: q(es.map((x) => x.centCand), 0.5), chebUB: q(es.map((x) => x.chebUB), 0.5), chebLB: q(es.map((x) => x.chebLB), 0.5),
      norm: q(es.map((x) => x.norm), 0.5), multiFrac: q(es.map((x) => x.multiFrac), 0.5), meanNc: q(es.map((x) => x.meanNc), 0.5),
      minorArea: q(es.map((x) => x.minorArea), 0.5), sepDeg: q(es.map((x) => x.sepDeg), 0.5),
    } as Est;
    const r = (a: number, b: number): string => (prev === null || !(b > 0) ? '       ' : `[${(a / b).toFixed(3)}]`);
    log(`     k=${String(k).padStart(3)}  cand ${cur.cand.toFixed(3).padStart(8)}${r(cur.cand, prev?.cand ?? 0)} pt ${cur.pt.toFixed(3).padStart(8)}${r(cur.pt, prev?.pt ?? 0)} cent ${cur.cent.toFixed(3).padStart(8)}${r(cur.cent, prev?.cent ?? 0)} cheb ${cur.chebUB.toFixed(3).padStart(8)}${r(cur.chebUB, prev?.chebUB ?? 0)} norm ${cur.norm.toFixed(2).padStart(7)}${r(cur.norm, prev?.norm ?? 0)} minA ${(cur.minorArea * 100).toFixed(3).padStart(7)}%  sep ${cur.sepDeg.toFixed(1).padStart(6)}  <nc> ${cur.meanNc.toFixed(2)}`);
    rows.push({ k, ...cur } as unknown as Record<string, number>);
    prev = cur;
  }
  ladderJson[nm] = rows;
  log('');
}
log('   *** READ THE `cand` COLUMN AGAINST `cent`. *** If `cand` keeps falling while `cent` flattens, the');
log('   drift is the ESTIMATOR (boundary sampling + candidate weighting), not the surface — which is what');
log('   the k->infinity derivation in the header says must happen.');
log('');
log('   h-LADDER on the substitute at the justified k (a convergent statistic must not be a function of h):');
{
  const set = strat(pinF, Math.min(LADN, 80));
  for (const h of H_LADDER) {
    const ns = fdNormals(rA, H, h, h);
    const es = set.map((f) => estimate(f, K_JUST, INSET_PUB, ns, true));
    log(`     h=${h.toExponential(0).padStart(6)}  cand ${q(es.map((x) => x.cand), 0.5).toFixed(3).padStart(8)}  cent ${q(es.map((x) => x.cent), 0.5).toFixed(3).padStart(8)}  cheb ${q(es.map((x) => x.chebUB), 0.5).toFixed(3).padStart(8)}  norm ${q(es.map((x) => x.norm), 0.5).toFixed(2).padStart(7)}`);
  }
}
log('');
log('   inset-LADDER on the substitute (an option default is a measurement choice; the centroid lattice');
log('   should be MUCH less inset-sensitive than the vertex lattice, because it never touches the boundary):');
{
  const set = strat(pinF, Math.min(LADN, 80));
  for (const ins of [0, 0.02, 0.05, 0.1]) {
    const es = set.map((f) => estimate(f, K_JUST, ins, nsMain, false));
    log(`     inset ${ins.toFixed(3)}  cand(vertex lattice) ${q(es.map((x) => x.cand), 0.5).toFixed(3).padStart(8)}   cent(centroid lattice, inset-FREE) ${q(es.map((x) => x.cent), 0.5).toFixed(3).padStart(8)}`);
  }
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — DEFECT 2: RE-QUOTE P1 AND P3 ON BOTH POPULATIONS, PER FACET, AT THE JUSTIFIED k
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log(`── STAGE 3: DEFECT 2 — P1 AND P3 RE-QUOTED. justified k=${K_JUST} (see the ladder above), h=${H_FD}  ${el()} ──`);
const estCache = new Map<string, Est>();
const estOf = (f: number, k: number): Est => {
  const key = `${f}:${k}`;
  let e = estCache.get(key);
  if (e === undefined) { e = estimate(f, k, INSET_PUB, nsMain, true); estCache.set(key, e); }
  return e;
};
/** the SHIPPED per-facet pair as S112 quoted it: k=8, inset 0.05, vertex lattice. */
const pubCache = new Map<number, { norm: number; spread: number }>();
const pubOf = (f: number): { norm: number; spread: number } => {
  let e = pubCache.get(f);
  if (e === undefined) {
    const [ath, bth, cth] = th3(f);
    const o = orientOfFacet(nsMain, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_PUB, inset: INSET_PUB, orient: 'winding', scratch });
    e = { norm: o.normDeg, spread: o.spreadRad * DEG }; pubCache.set(f, e);
  }
  return e;
};

interface PopOut { name: string; facets: number[]; nPairs: number }
const facetsOfPairs = (rs: WRow[]): number[] => {
  const s = new Set<number>(); const out: number[] = [];
  for (const r of rs) for (const f of [r.f1, r.f2]) if (!s.has(f)) { s.add(f); out.push(f); }
  return out;
};
const pops: PopOut[] = [
  { name: 'A  WALL CREASE CLASS (S112 P3 pop.)', facets: facetsOfPairs(creasePairs), nPairs: creasePairs.length },
  { name: 'A1   ...its CONFORMED part', facets: facetsOfPairs(conformedPairs), nPairs: conformedPairs.length },
  { name: 'A2   ...its STRADDLING part', facets: facetsOfPairs(straddlingPairs), nPairs: straddlingPairs.length },
  { name: 'B  PINNED STRADDLING (3,282)', facets: pinF, nPairs: pin.length },
  { name: 'R  WALL RESIDUAL (no crease)', facets: facetsOfPairs(residPairs), nPairs: residPairs.length },
  { name: 'S  SMOOTH control (<2 deg)', facets: smoothF, nPairs: 0 },
];
if (intStrad.size > 0) pops.push({ name: 'C  INTERIOR STRADDLERS (1,537)', facets: pinF.filter((f) => intStrad.has(f)), nPairs: 0 });

const p13: Array<Record<string, unknown>> = [];
log('   PER-FACET accounting on a stratified subsample of each population (COUNT + AREA-share + MAX, never one alone).');
log('   OLD  = as S112 published it: spreadRad, vertex lattice, k=8, inset 0.05.');
log('   NEW  = spreadCent (convergent substitute) and cheb (best achievable normDeg), centroid lattice, k=K_JUST.');
log('   All of normDeg / spread / cheb in the NEW block are taken on the SAME sample set, so');
log('   headroom = normDeg - cheb is >= 0 BY CONSTRUCTION and is exactly what P3 was trying to measure.');
log('');
for (const p of pops) {
  const sub = strat(p.facets, POPN);
  let popArea = 0; for (const f of p.facets) popArea += d.areaMm2[f];
  const ar = sub.map((f) => d.areaMm2[f]);
  const oldN = sub.map((f) => pubOf(f).norm); const oldS = sub.map((f) => pubOf(f).spread);
  const oldRatio = sub.map((f) => { const e = pubOf(f); return e.norm > 1e-9 ? e.spread / e.norm : NaN; });
  const oldExc = sub.map((f) => { const e = pubOf(f); return e.norm - e.spread; });
  log(`  ${p.name}   pairs ${p.nPairs}  facets ${p.facets.length}  AREA ${popArea.toFixed(3)} mm2 = ${((popArea / meshArea) * 100).toFixed(4)}% of mesh   [subsample n=${sub.length}]`);
  log(`     OLD  normDeg    p10 ${q(oldN, 0.1).toFixed(2).padStart(7)} p50 ${q(oldN, 0.5).toFixed(2).padStart(7)} p90 ${q(oldN, 0.9).toFixed(2).padStart(7)} MAX ${mx(oldN).toFixed(2).padStart(7)}   area-p50 ${qArea(oldN, ar, 0.5).toFixed(2)}`);
  log(`     OLD  spreadRad  p10 ${q(oldS, 0.1).toFixed(2).padStart(7)} p50 ${q(oldS, 0.5).toFixed(2).padStart(7)} p90 ${q(oldS, 0.9).toFixed(2).padStart(7)} MAX ${mx(oldS).toFixed(2).padStart(7)}   area-p50 ${qArea(oldS, ar, 0.5).toFixed(2)}`);
  log(`     OLD  P1 spread/norm  p10 ${q(oldRatio, 0.1).toFixed(3)} p50 ${q(oldRatio, 0.5).toFixed(3)} p90 ${q(oldRatio, 0.9).toFixed(3)}    OLD P3 norm-spread  p10 ${q(oldExc, 0.1).toFixed(2)} p50 ${q(oldExc, 0.5).toFixed(2)} p90 ${q(oldExc, 0.9).toFixed(2)} MAX ${mx(oldExc).toFixed(2)}`);
  const rec: Record<string, unknown> = {
    pop: p.name, pairs: p.nPairs, facets: p.facets.length, areaMm2: popArea, sub: sub.length,
    oldNormP50: q(oldN, 0.5), oldSpreadP50: q(oldS, 0.5), oldP1P50: q(oldRatio, 0.5), oldP3P50: q(oldExc, 0.5),
  };
  for (const kk of [K_JUST, 2 * K_JUST]) {
    const nw = sub.map((f) => estOf(f, kk));
    const newRatio = nw.map((e) => (e.norm > 1e-9 ? e.cent / e.norm : NaN));
    const chebRatio = nw.map((e) => (e.norm > 1e-9 ? e.chebUB / e.norm : NaN));
    const head = nw.map((e) => e.norm - e.chebUB);
    log(`     NEW k=${String(kk).padStart(3)}  normDeg p50 ${q(nw.map((e) => e.norm), 0.5).toFixed(2).padStart(7)} MAX ${mx(nw.map((e) => e.norm)).toFixed(2).padStart(7)} area-p50 ${qArea(nw.map((e) => e.norm), ar, 0.5).toFixed(2).padStart(7)}  |  spreadCent p50 ${q(nw.map((e) => e.cent), 0.5).toFixed(2).padStart(7)} MAX ${mx(nw.map((e) => e.cent)).toFixed(2).padStart(7)}  |  cheb UB p50 ${q(nw.map((e) => e.chebUB), 0.5).toFixed(2).padStart(7)} LB p50 ${q(nw.map((e) => e.chebLB), 0.5).toFixed(2).padStart(7)} MAX ${mx(nw.map((e) => e.chebUB)).toFixed(2).padStart(7)}`);
    log(`              P1 cent/norm p50 ${q(newRatio, 0.5).toFixed(3)}  cheb/norm p50 ${q(chebRatio, 0.5).toFixed(3)}   |   P3 HEADROOM normDeg-cheb  p10 ${q(head, 0.1).toFixed(2)} p50 ${q(head, 0.5).toFixed(2)} p90 ${q(head, 0.9).toFixed(2)} MAX ${mx(head).toFixed(2)} deg  area-p50 ${qArea(head, ar, 0.5).toFixed(2)}`);
    const over = sub.filter((_, i) => head[i] > 10);
    let oa = 0; for (const f of over) oa += d.areaMm2[f];
    let sa = 0; for (const f of sub) sa += d.areaMm2[f];
    log(`              >10 deg of headroom: COUNT ${over.length}/${sub.length} (${((over.length / Math.max(1, sub.length)) * 100).toFixed(2)}%)  AREA-share ${((oa / Math.max(1e-12, sa)) * 100).toFixed(2)}%  MAX ${mx(head).toFixed(2)} deg   |  minority-flank AREA p50 ${(q(nw.map((e) => e.minorArea), 0.5) * 100).toFixed(3)}%`);
    rec[`k${kk}`] = {
      normP50: q(nw.map((e) => e.norm), 0.5), spreadCentP50: q(nw.map((e) => e.cent), 0.5),
      chebP50: q(nw.map((e) => e.chebUB), 0.5), p1P50: q(newRatio, 0.5), headroomP50: q(head, 0.5),
      headroomOver10Count: over.length, headroomOver10AreaShare: oa / Math.max(1e-12, sa),
      minorAreaP50: q(nw.map((e) => e.minorArea), 0.5),
    };
  }
  p13.push(rec);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — THE CROSS-CHECK: BEST ACHIEVABLE normDeg FOR A FACET CONFINED TO ONE FLANK
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log(`── STAGE 4: BEST ACHIEVABLE normDeg CONFINED TO ONE FLANK — the second route to the fidelity prize  ${el()} ──`);
log(`   Footprint sampled on the centroid lattice at k=${K_FLANK} (${K_FLANK * K_FLANK} equal-area points, none on the`);
log(`   boundary). Points whose own candidate set spans > ${AMBIG_DEG} deg are AMBIGUOUS (inside the fd window of the`);
log('   crease) and are EXCLUDED with their share reported; the rest are 2-means split into flanks and the');
log('   Chebyshev radius is taken over EACH flank. chebFlank = the WORSE of the two = what an oracle');
log('   aligned-edge operator must live with. PLACEBO ARM (C-E): the same computation with the footprint cut');
log('   by a RANDOM line through its centroid instead of by the crease.');
interface FlankOut { f: number; area: number; obs: number; flankUB: number; flankLB: number; majUB: number; placeboUB: number; ambigFrac: number; minorFrac: number; sepDeg: number }
function flankOf(f: number, seedIn: number, kf: number): FlankOut {
  const s = sampleBary(f, baryCentroid(kf), nsMain);
  woundNormal(f, fnBuf);
  // per-point single normal (average of candidates) + ambiguity flag
  const pn = new Float64Array(s.pts * 3); const amb = new Uint8Array(s.pts);
  const ambR = (AMBIG_DEG * Math.PI) / 180;
  for (let p = 0; p < s.pts; p += 1) {
    let ax = 0; let ay = 0; let az = 0; let worst = 0;
    for (let i = 0; i < s.nc[p]; i += 1) {
      const o = (s.off[p] + i) * 3; ax += s.n[o]; ay += s.n[o + 1]; az += s.n[o + 2];
      for (let j = 0; j < i; j += 1) { const v = angU(s.n, s.off[p] * 3 + i * 3, s.n, s.off[p] * 3 + j * 3); if (v > worst) worst = v; }
    }
    const L = Math.hypot(ax, ay, az) || 1;
    pn[p * 3] = ax / L; pn[p * 3 + 1] = ay / L; pn[p * 3 + 2] = az / L;
    amb[p] = worst > ambR ? 1 : 0;
  }
  const keep: number[] = []; for (let p = 0; p < s.pts; p += 1) if (amb[p] === 0) keep.push(p);
  const ambigFrac = 1 - keep.length / Math.max(1, s.pts);
  // 2-means on the sphere over the kept points
  const c = new Float64Array(6);
  let sx = 0; let sy = 0; let sz = 0;
  for (const p of keep) { sx += pn[p * 3]; sy += pn[p * 3 + 1]; sz += pn[p * 3 + 2]; }
  let L0 = Math.hypot(sx, sy, sz) || 1;
  const mean = new Float64Array([sx / L0, sy / L0, sz / L0]);
  let i1 = keep[0] ?? 0; let best = -1;
  for (const p of keep) { const a = angU(pn, p * 3, mean, 0); if (a > best) { best = a; i1 = p; } }
  let i2 = keep[0] ?? 0; best = -1;
  for (const p of keep) { const a = angU(pn, p * 3, pn, i1 * 3); if (a > best) { best = a; i2 = p; } }
  c[0] = pn[i1 * 3]; c[1] = pn[i1 * 3 + 1]; c[2] = pn[i1 * 3 + 2];
  c[3] = pn[i2 * 3]; c[4] = pn[i2 * 3 + 1]; c[5] = pn[i2 * 3 + 2];
  const lab = new Int8Array(s.pts);
  for (let it = 0; it < 25; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; let na = 0; let nb = 0;
    for (const p of keep) {
      const da = angU(pn, p * 3, c, 0); const db = angU(pn, p * 3, c, 3);
      if (da <= db) { lab[p] = 0; ax += pn[p * 3]; ay += pn[p * 3 + 1]; az += pn[p * 3 + 2]; na += 1; }
      else { lab[p] = 1; bx += pn[p * 3]; by += pn[p * 3 + 1]; bz += pn[p * 3 + 2]; nb += 1; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (nb > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || nb === 0) break;
  }
  const iA: number[] = []; const iB: number[] = [];
  for (const p of keep) (lab[p] === 0 ? iA : iB).push(p);
  const minorFrac = Math.min(iA.length, iB.length) / Math.max(1, keep.length);
  const sepDeg = iA.length > 0 && iB.length > 0 ? angU(c, 0, c, 3) * DEG : 0;
  const chA = chebOf(pn, Int32Array.from(iA), iA.length);
  const chB = chebOf(pn, Int32Array.from(iB), iB.length);
  const flankUB = Math.max(Number.isFinite(chA.ub) ? chA.ub : 0, Number.isFinite(chB.ub) ? chB.ub : 0);
  const flankLB = Math.max(Number.isFinite(chA.lb) ? chA.lb : 0, Number.isFinite(chB.lb) ? chB.lb : 0);
  const majUB = iA.length >= iB.length ? chA.ub : chB.ub;
  // PLACEBO: cut the footprint by a RANDOM line through its parameter centroid, same point budget.
  let seed = (seedIn * 1103515245 + 12345) & 0x7fffffff;
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  const ang0 = (seed / 0x7fffffff) * Math.PI;
  let gth = 0; let gz = 0;
  for (const p of keep) { gth += s.pth[p]; gz += s.pz[p]; }
  gth /= Math.max(1, keep.length); gz /= Math.max(1, keep.length);
  const ux = Math.cos(ang0); const uy = Math.sin(ang0);
  const pA: number[] = []; const pB: number[] = [];
  for (const p of keep) ((s.pth[p] - gth) * ux + (s.pz[p] - gz) * uy >= 0 ? pA : pB).push(p);
  const pchA = chebOf(pn, Int32Array.from(pA), pA.length);
  const pchB = chebOf(pn, Int32Array.from(pB), pB.length);
  const placeboUB = Math.max(Number.isFinite(pchA.ub) ? pchA.ub : 0, Number.isFinite(pchB.ub) ? pchB.ub : 0);
  return { f, area: d.areaMm2[f], obs: pubOf(f).norm, flankUB, flankLB, majUB, placeboUB, ambigFrac, minorFrac, sepDeg };
}

const FLANKN = Math.round(envF('PF_S114_FLANKN', 1500));
const flankPops: Array<[string, number[]]> = [
  ['PINNED TARGET SET (6,193 facets)', strat(pinF, FLANKN)],
  ['SMOOTH control (<2 deg)', strat(smoothF, Math.min(600, smoothF.length))],
];
if (intStrad.size > 0) flankPops.push(['INTERIOR STRADDLERS (1,537 facets)', strat(pinF.filter((f) => intStrad.has(f)), FLANKN)]);
const flankJson: Record<string, unknown> = {};
for (const [nm, set] of flankPops) {
  const fo = set.map((f, i) => flankOf(f, i + 7, K_FLANK));
  const ar = fo.map((x) => x.area);
  let sa = 0; for (const x of fo) sa += x.area;
  const prize = fo.map((x) => (x.flankUB > 1e-9 ? x.obs / x.flankUB : NaN));
  const prizePlac = fo.map((x) => (x.placeboUB > 1e-9 ? x.obs / x.placeboUB : NaN));
  log(`   ${nm}   n=${fo.length}   subsample AREA ${sa.toFixed(3)} mm2`);
  log(`     observed normDeg (k=${K_PUB}, inset ${INSET_PUB}, winding)  p50 ${q(fo.map((x) => x.obs), 0.5).toFixed(3)}  p90 ${q(fo.map((x) => x.obs), 0.9).toFixed(2)}  MAX ${mx(fo.map((x) => x.obs)).toFixed(2)}  area-p50 ${qArea(fo.map((x) => x.obs), ar, 0.5).toFixed(2)}`);
  log(`     chebFlank UB (worse flank)   p10 ${q(fo.map((x) => x.flankUB), 0.1).toFixed(4)} p50 ${q(fo.map((x) => x.flankUB), 0.5).toFixed(4)} p90 ${q(fo.map((x) => x.flankUB), 0.9).toFixed(4)} MAX ${mx(fo.map((x) => x.flankUB)).toFixed(3)} deg`);
  log(`                    LB            p50 ${q(fo.map((x) => x.flankLB), 0.5).toFixed(4)}  (a two-sided bracket; a collapsed fit cannot satisfy both)`);
  log(`     chebFlank on the MAJORITY flank only  p50 ${q(fo.map((x) => x.majUB), 0.5).toFixed(4)}  MAX ${mx(fo.map((x) => x.majUB)).toFixed(3)} deg`);
  log(`     *** PLACEBO (random cut through the centroid) chebFlank p50 ${q(fo.map((x) => x.placeboUB), 0.5).toFixed(4)} MAX ${mx(fo.map((x) => x.placeboUB)).toFixed(3)} deg ***`);
  log(`     ambiguous (fd window straddles) point share p50 ${(q(fo.map((x) => x.ambigFrac), 0.5) * 100).toFixed(3)}%  p90 ${(q(fo.map((x) => x.ambigFrac), 0.9) * 100).toFixed(3)}%`);
  log(`     minority-flank share p50 ${q(fo.map((x) => x.minorFrac), 0.5).toFixed(3)}   flank separation p50 ${q(fo.map((x) => x.sepDeg), 0.5).toFixed(2)} deg`);
  log(`     PRIZE  per-facet obs/chebFlank   p10 ${q(prize, 0.1).toFixed(2)} p50 ${q(prize, 0.5).toFixed(2)} p90 ${q(prize, 0.9).toFixed(2)} MAX ${mx(prize).toFixed(1)}   ratio-of-medians ${(q(fo.map((x) => x.obs), 0.5) / Math.max(1e-9, q(fo.map((x) => x.flankUB), 0.5))).toFixed(2)}x`);
  log(`     PRIZE on the PLACEBO cut         p50 ${q(prizePlac, 0.5).toFixed(2)}   ==> crease-over-placebo ${(q(prize, 0.5) / Math.max(1e-9, q(prizePlac, 0.5))).toFixed(3)}x`);
  flankJson[nm] = {
    n: fo.length, obsP50: q(fo.map((x) => x.obs), 0.5), flankUBP50: q(fo.map((x) => x.flankUB), 0.5),
    placeboP50: q(fo.map((x) => x.placeboUB), 0.5), prizeP50: q(prize, 0.5),
    prizeRatioOfMedians: q(fo.map((x) => x.obs), 0.5) / Math.max(1e-9, q(fo.map((x) => x.flankUB), 0.5)),
    prizePlaceboP50: q(prizePlac, 0.5),
  };
  log('');
}
log(`   K_FLANK LADDER — the flank ceiling must CONVERGE in the lattice order too, never be assumed  ${el()}`);
{
  const set = strat(pinF, Math.min(FLANKN, 250));
  const setI = intStrad.size > 0 ? strat(pinF.filter((f) => intStrad.has(f)), Math.min(FLANKN, 250)) : [];
  let prevA = 0; let prevB = 0;
  for (const kf of [8, 12, 16, 24, 32, 48]) {
    const a = set.map((f, i) => flankOf(f, i + 7, kf));
    const ub = q(a.map((x) => x.flankUB), 0.5);
    let sI = '';
    if (setI.length > 0) {
      const b = setI.map((f, i) => flankOf(f, i + 11, kf));
      const ubI = q(b.map((x) => x.flankUB), 0.5);
      sI = `   INTERIOR-STRAD chebFlank p50 ${ubI.toFixed(4).padStart(8)}${prevB > 0 ? `[${(ubI / prevB).toFixed(3)}]` : ''}  ambig p50 ${(q(b.map((x) => x.ambigFrac), 0.5) * 100).toFixed(2)}%`;
      prevB = ubI;
    }
    log(`     K_FLANK=${String(kf).padStart(2)} (${kf * kf} pts)  PINNED chebFlank p50 ${ub.toFixed(4).padStart(8)}${prevA > 0 ? `[${(ub / prevA).toFixed(3)}]` : ''}  ambig p50 ${(q(a.map((x) => x.ambigFrac), 0.5) * 100).toFixed(2)}%${sI}`);
    prevA = ub;
  }
}
log('');
log('   S113 ROUTE (empirical ceiling): the 18,430 already-aligned wall facets achieve normDeg(inset 0.10)');
log('   p50 1.9487 deg, giving 68.564/1.9487 = 35.2x on the whole target set and 143.41/1.9487 = 73.6x on');
log('   the interior straddlers. THIS route computes the ceiling ANALYTICALLY per facet instead. The two');
log('   numbers above and these are the cross-check; Q4 kills if they differ by more than 3x.');
log('');

writeFileSync(`${OUTDIR}/S114_REQUOTE_${TAG}.json`, `${JSON.stringify({
  style: STYLE, stl: STL, ndjson: NDJ, meshFacets: nTri, meshAreaMm2: meshArea,
  kPub: K_PUB, insetPub: INSET_PUB, kJust: K_JUST, hFd: H_FD, kFlank: K_FLANK, ambigDeg: AMBIG_DEG,
  funnel: { wallPairs: wall.length, creasePairs: creasePairs.length, residualPairs: residPairs.length, conformedPairs: conformedPairs.length, straddlingPairs: straddlingPairs.length },
  ladder: ladderJson, p13, flank: flankJson,
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S114_REQUOTE_${TAG}.json`);
log(`done ${el()}`);
