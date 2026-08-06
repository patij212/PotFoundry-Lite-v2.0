// s113aLegality.ts — S113-A. IS THERE A LEGAL ALIGNED EDGE AT ALL?
//
// THE QUESTION. S113 pinned 3,282 straddling crease pairs (6,193 unique facets, 69.826 mm2 = 0.1816% of the
// GothicArches mesh). Fixture H2 proves refinement CANNOT fix a straddle (the angle is density-invariant,
// x0.9968 over five halvings, against a smooth control's x28.43). The ONLY remedy is to put a mesh edge ON
// the crease. So before any operator is designed, priced or built, one number bounds the whole programme:
//
//        FOR HOW MANY OF THOSE FACETS DOES A LEGAL ALIGNED EDGE EVEN EXIST?
//
// An operator cannot fix what has no legal aligned edge. This tool answers it, per facet, with COUNT +
// AREA-share + MAX, and names the blocker for every facet it cannot fix.
//
// WHAT "LEGAL" MEANS HERE — THE DRIVER'S OWN BARS, NOT INVENTED ONES:
//   * FLOOR_MM   = PF_CB_FLOOR_UM / 1000, default 1.5 um = 0.0015 mm. `_strataConformBisectL.test.ts:144`.
//                  The driver only ever offers an edge with `ls[e] >= FLOOR_MM` to `splitEdge` (:1980, :2527).
//   * SHAPE_AR   = PF_CB_SHAPE_AR, default 50 (:234), applied via `_shapeGuard.aspect3` to EVERY child of a
//                  split (S1 shape guard). aspect3 = longestEdge * perimeter / (4 * area); equilateral = 1.732.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THE DUMPED `locs` ARE THE CONTROL AND NOT THE INSTRUMENT — MEASURED, NOT ASSUMED
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The first version of this tool classified from S113's dumped `locateTurnAdaptive` results, thresholding on
// `turnDeg` and sweeping the threshold at 5/15/45 deg exactly as the brief requires. THE SWEEP REFUTED THE
// INSTRUMENT: the "already aligned" class moved 2,359 -> 1,839 -> 844 facets and "no crossing found" moved
// 3,322 -> 3,897 -> 5,080 across those three cuts. There is no valley in the turn histogram to cut in — the
// distribution is a continuum (1,294 edges in [1,5), 2,018 in [5,15), 3,213 in [15,45) deg). A conclusion
// taken from it would have been a conclusion about the threshold.
//
// The cause is structural, and it is a SECOND face of the documented tie-break defect (orientRuler.ts:529):
// `locateTurnAdaptive` bisects on the Gauss map from the WHOLE edge, so (a) it can only ever return ONE
// crossing per edge, (b) on an edge that lies ALONG a crease every probe returns the same straddling normal,
// the half-angles tie, and it walks to the left end reporting a small turn — an already-conformed edge is
// indistinguishable from a smooth one, and (c) its `turn` is read at whatever bracket it happened to land in.
//
// THE INSTRUMENT THIS TOOL USES INSTEAD is a DENSE BOUNDARY SCAN — a footprint probe, not an endpoint probe:
//   1. sample the analytic normal at N+1 points along each facet edge (central FD at h = len/(8N), so a
//      window never reaches the neighbouring sample);
//   2. every consecutive-sample gap over GAP_FIND deg opens a bracket; ADJACENT flagged gaps are MERGED
//      (a sample landing within h of the crease splits one big gap into two, and that must not read as two
//      crossings);
//   3. each bracket is refined by bisection with the step tied to the bracket (the S74 fix) — this cannot
//      tie, because a bracket that contains a crease always has one strictly larger half-turn;
//   4. THE H2 TEST IS THE CLASSIFIER: after refinement the bracket is ~1e-4 mm wide, so SMOOTH curvature has
//      decayed to ~0 while a C0 crease still reads its full dihedral. `turnDeg` after refinement therefore
//      separates crease from curvature by MECHANISM, not by a tuned cut — which is why the 5/15/45 sweep
//      below moves it so little.
// It finds MULTIPLE crossings per edge, and the whole classification is re-run at N = 128 and N = 256 so the
// answer can be seen not to rest on the scan resolution either.
//
// AND FOR THE ONE THING A BOUNDARY SCAN STRUCTURALLY CANNOT SEE — an edge lying ON the crease, where every
// probe straddles and no gap ever opens — there is a separate KINK LADDER: the kink-aware 4-combination
// sampler (`fdNormals`) is evaluated at a fixed ladder of steps 0.3/1/3/10/30/100 um, and the smallest step
// whose normal cone opens past 5 deg BRACKETS THE DISTANCE from that point to the nearest crease. Run at 5
// points along every edge and at 3 interior points of every facet, it distinguishes
//    "the crease runs along this edge"  from  "the crease terminates inside this facet"  from  "no crease".
//
// EVERY NUMBER IS COUNT + AREA + MAX. In this project count over-states defect AREA by 13-184x and the two
// have repeatedly disagreed in DIRECTION, so a bare count is not reportable.
//
// Usage: bash research/tools/run-s113a-legality.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { fdNormals, radialNormal, type NormalSampler } from '../bridge/orientRuler';
import { aspect3 } from '../bridge/_shapeGuard';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const NDJ = process.env.PF_S113A_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const META = NDJ.replace(/\.ndjson$/, '.meta.json');
const STL = process.env.PF_S113A_STL ?? '';
const STYLE = process.env.PF_S113A_STYLE ?? 'GothicArches';
const TAG = process.env.PF_S113A_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_S113A_H', 120), Rb: envF('PF_S113A_RB', 40), Rt: envF('PF_S113A_RT', 50), expn: 1 };
const H = DIMS.H;

// ── THE DRIVER'S BARS, transcribed with their source lines ──────────────────────────────────────────────
const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;     // _strataConformBisectL.test.ts:144
const SHAPE_AR = envF('PF_CB_SHAPE_AR', 50);             // _strataConformBisectL.test.ts:234
const CREASE_THRS = (process.env.PF_S113A_THRS ?? '5,15,45').split(',').map(Number);
const THR_PRIMARY = envF('PF_S113A_THR', 15);
const SCAN_NS = (process.env.PF_S113A_NS ?? '128,256').split(',').map(Number);
const N_PRIMARY = Math.round(envF('PF_S113A_N', 256));
const GAP_FIND = envF('PF_S113A_GAPFIND', 2);            // deg: opens a bracket. Below every CREASE_THR.
const REF_ITERS = Math.round(envF('PF_S113A_REFIT', 60));   // a CAP; the h > H_MIN test is what stops it
const H_MIN = envF('PF_S113A_HMIN', 1e-7);               // mm; FD step floor (keeps ~7 good digits in dr)
const LADDER_UM = [0.3, 1, 3, 10, 30, 100];
const LADDER_DEG = envF('PF_S113A_LADDER_DEG', 5);
// ── THE ALONG-EDGE TEST. The boundary scan is STRUCTURALLY BLIND to a crease that runs ALONG an edge:
// every probe on that edge straddles, every probe returns the same averaged normal, no gap ever opens. That
// is not a tuning problem, it is what a 1-D scan of a curve coinciding with the scan line must do. The
// LADDER sees it — it asks "how far is the nearest crease from THIS POINT", which is answerable on the
// crease itself. An edge counts as CARRYING the crease when >= 4 of its 5 interior probes are within
// ALIGN_UM of one; ALIGN_UM is SWEPT 1/3/10/100 um, because a 100-um "alignment" on a 300-um edge is not
// alignment at all — it is a crease crossing the interior nearly parallel to the edge.
const ALIGN_CUTS = [1, 3, 10, 100];
const alignHits = new Map<number, number[][]>();   // f -> [cutIdx][edge] = probes within that cut

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

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
mkdirSync(OUTDIR, { recursive: true });

// ── quantiles / helpers ─────────────────────────────────────────────────────────────────────────────────
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const dist = (v: number[], f = 4): string => (v.length === 0 ? '(empty)'
  : `min ${q(v, 0).toFixed(f)} p10 ${q(v, 0.1).toFixed(f)} p50 ${q(v, 0.5).toFixed(f)} p90 ${q(v, 0.9).toFixed(f)} max ${q(v, 0.999999).toFixed(f)}`);

function angDeg(px: number, py: number, pz: number, qx: number, qy: number, qz: number, rx: number, ry: number, rz: number): number {
  const ux = qx - px; const uy = qy - py; const uz = qz - pz;
  const wx = rx - px; const wy = ry - py; const wz = rz - pz;
  const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
  return (Math.atan2(Math.hypot(cx, cy, cz), ux * wx + uy * wy + uz * wz) * 180) / Math.PI;
}
interface TriMetric { minEdge: number; minAngDeg: number; ar: number }
function triMetrics(t: number[]): TriMetric {
  const e0 = Math.hypot(t[3] - t[0], t[4] - t[1], t[5] - t[2]);
  const e1 = Math.hypot(t[6] - t[3], t[7] - t[4], t[8] - t[5]);
  const e2 = Math.hypot(t[0] - t[6], t[1] - t[7], t[2] - t[8]);
  return {
    minEdge: Math.min(e0, e1, e2),
    minAngDeg: Math.min(
      angDeg(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]),
      angDeg(t[3], t[4], t[5], t[6], t[7], t[8], t[0], t[1], t[2]),
      angDeg(t[6], t[7], t[8], t[0], t[1], t[2], t[3], t[4], t[5]),
    ),
    ar: aspect3(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]),
  };
}
const pt = (t: number[], i: number): [number, number, number] => [t[i * 3], t[i * 3 + 1], t[i * 3 + 2]];
const triOf = (a: number[], b: number[], c: number[]): number[] => [...a, ...b, ...c];

// ── load ────────────────────────────────────────────────────────────────────────────────────────────────
interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row {
  e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number;
  area1: number; area2: number; z: number; thDeg: number; onEdge: boolean; onSeg: boolean;
  tri1: number[]; tri2: number[]; shared: number[]; locs: Loc[];
}

log('===== S113-A — IS THERE A LEGAL ALIGNED EDGE AT ALL? (the ceiling on the crease programme) =====');
log(`ndjson ${NDJ}`);
log(`driver bars: FLOOR_MM ${FLOOR_MM} mm (PF_CB_FLOOR_UM ${FLOOR_MM * 1000})   SHAPE_AR ${SHAPE_AR} (aspect3; equilateral 1.732)`);
log(`instrument: DENSE BOUNDARY SCAN  N ${SCAN_NS.join('/')}  gap-find ${GAP_FIND} deg  refine ${REF_ITERS} iters  hMin ${H_MIN} mm`);
log(`crease bar swept: ${CREASE_THRS.join(', ')} deg on the REFINED turn (primary ${THR_PRIMARY}, N ${N_PRIMARY})`);
log('');

const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
const meta = JSON.parse(readFileSync(META, 'utf8')) as { meshAreaMm2: number; uniqueFacets: number; targetAreaMm2: number; meshFacets: number; stl: string };
log(`${rows.length} pairs read   (pinned 3282)   ${el()}`);

// ── CONTROL 1: reproduce the pinned unique-facet count and AREA from the rows themselves ────────────────
interface FacetRec { f: number; xyz: number[]; area: number; locs: Loc[]; normHi: number; nPairs: number }
const facets = new Map<number, FacetRec>();
let locsMismatch = 0;
let areaMismatch = 0;
for (const r of rows) {
  for (const [f, tri, area] of [[r.f1, r.tri1, r.area1], [r.f2, r.tri2, r.area2]] as Array<[number, number[], number]>) {
    const ls = r.locs.filter((l) => l.f === f).sort((a, b) => a.edge - b.edge);
    const prev = facets.get(f);
    if (prev === undefined) { facets.set(f, { f, xyz: tri, area, locs: ls, normHi: r.normHi, nPairs: 1 }); continue; }
    prev.nPairs += 1;
    prev.normHi = Math.max(prev.normHi, r.normHi);
    if (Math.abs(prev.area - area) > 0) areaMismatch += 1;
    for (let i = 0; i < 3; i += 1) {
      if (!Object.is(prev.locs[i].s, ls[i].s) || !Object.is(prev.locs[i].turnDeg, ls[i].turnDeg)) locsMismatch += 1;
    }
  }
}
let classArea = 0;
for (const fr of facets.values()) classArea += fr.area;
const meshArea = meta.meshAreaMm2;
log('── CONTROL 1: the set I am measuring IS the pinned set ──');
log(`  unique facets ${facets.size}  (pinned ${meta.uniqueFacets})   ${facets.size === meta.uniqueFacets ? 'OK' : '*** DRIFT ***'}`);
log(`  class AREA ${classArea.toFixed(4)} mm2 = ${((classArea / meshArea) * 100).toFixed(4)}% of mesh  (pinned ${meta.targetAreaMm2.toFixed(4)} mm2 / 0.1816%)  ${Math.abs(classArea - meta.targetAreaMm2) < 1e-9 ? 'OK' : '*** DRIFT ***'}`);
log(`  repeated-facet locs / area disagreements ${locsMismatch} / ${areaMismatch}   (must be 0 0)`);
const CTRL1 = facets.size === meta.uniqueFacets && Math.abs(classArea - meta.targetAreaMm2) < 1e-9 && locsMismatch === 0 && areaMismatch === 0;
if (!CTRL1) log('  *** CONTROL 1 FIRED — THE RUN IS VOID. ***');
log('');

// ── CONTROL 2: rA identity (PRECOND) and coordinate identity against the STL ────────────────────────────
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
let CTRL2 = true;
log('── CONTROL 2: rA is the same surface S113 measured ──');
if (STL !== '') {
  const M = readMeshFloat64(STL, false);
  let worst = 0; const step = Math.max(1, Math.floor(M.nTri / 20000));
  for (let f = 0; f < M.nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = M.xyz[f * 9 + k * 3]; const y = M.xyz[f * 9 + k * 3 + 1]; const z = M.xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`  PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um)`);
  if (M.nTri !== meta.meshFacets || worst * 1000 > 0.05) { log('  *** PRECOND MISMATCH — params/dims wrong. ***'); CTRL2 = false; }
  let coordBad = 0;
  for (const fr of facets.values()) for (let k = 0; k < 9; k += 1) if (!Object.is(M.xyz[fr.f * 9 + k], fr.xyz[k])) coordBad += 1;
  log(`  ndjson tri coords vs STL facet coords: ${coordBad} of ${facets.size * 9} disagree   (must be 0)`);
  if (coordBad !== 0) CTRL2 = false;
} else {
  let worst = 0;
  for (const fr of facets.values()) for (let k = 0; k < 3; k += 1) {
    const x = fr.xyz[k * 3]; const y = fr.xyz[k * 3 + 1]; const z = fr.xyz[k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`  PRECOND over the CLASS's own ${facets.size * 3} vertices: MAX = ${(worst * 1000).toFixed(4)} um  (no STL supplied)`);
  if (worst * 1000 > 0.5) { log('  *** PRECOND MISMATCH. ***'); CTRL2 = false; }
}
if (!CTRL2) log('  *** CONTROL 2 FIRED — THE RUN IS VOID. ***');
log('');

// ── the normal sampler, inlined ─────────────────────────────────────────────────────────────────────────
// VERBATIM `fdNormalsCentral` (orientRuler.ts:170) with the closure hoisted out so the step can be changed
// per call without allocating; the z-window shift at the domain ends is kept exactly.
const angOf = (p: Float64Array, po: number, r: Float64Array, ro: number): number => {
  let d = p[po] * r[ro] + p[po + 1] * r[ro + 1] + p[po + 2] * r[ro + 2];
  d = d > 1 ? 1 : d < -1 ? -1 : d;
  return (Math.acos(d) * 180) / Math.PI;
};
interface Cross { edge: number; s: number; turnDeg: number; turnScanDeg: number; brWidthMm: number }
interface Scanner {
  scanEdge: (edge: number, th0: number, z0: number, th1: number, z1: number, lenMm: number, N: number) => Cross[];
  creaseWithinUm: (th: number, z: number) => number;
}

/**
 * ⚠ THE DEFECT THIS FACTORY EXISTS TO NOT HAVE, FOUND BY CONTROL 5 IN THIS TOOL'S OWN FIRST RUN.
 *
 * The refinement's step is tied to the bracket (`h = bracket/8`) — that is the S74 fix and it is what makes
 * the bisection able to see a crease at all. My first version ALSO floored it, `h = max(H_MIN, bracket/8)`,
 * for numerical safety. *** ONCE THE BRACKET FALLS BELOW 8*H_MIN THE FLOOR WINS, BOTH ENDPOINT PROBES'
 * WINDOWS THEN STRADDLE THE CREASE, BOTH RETURN THE SAME AVERAGED NORMAL, AND THE MEASURED TURN COLLAPSES
 * TO ZERO. *** i.e. the fixed number of iterations silently converted every crease into "no crease".
 * Signature: the finer scan found FEWER creases than the coarse one (N=256 reached the collapse one halving
 * sooner than N=128) — 892 facets, 45.55% of the class area, changed class between the two resolutions.
 * That is the same failure `locateTurnAdaptive` was written to fix, reintroduced by a safety clamp.
 *
 * THE FIX: iterate WHILE `bracket/8 > H_MIN` and stop there. The step is then never floored, the two probes
 * are always strictly on opposite sides, and the final bracket is ~8e-7 mm — 1,800x under FLOOR_MM, so
 * nothing is lost in placement. `brWidthMm` is returned so a collapse can never again be invisible.
 */
function makeScanner(R: (th: number, z: number) => number): Scanner {
  const nBuf = new Float64Array(3 * 1030);
  const n0 = new Float64Array(3); const n1 = new Float64Array(3); const nm = new Float64Array(3);
  const normalAt = (th: number, z: number, h: number, out: Float64Array, o: number): void => {
    const r0 = R(th, z);
    const hTh = h / Math.max(1e-9, Math.abs(r0));
    const rt = (R(th + hTh, z) - R(th - hTh, z)) / (2 * hTh);
    let zLo = z - h; let zHi = z + h;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * h); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * h); }
    const rz = zHi > zLo ? (R(th, zHi) - R(th, zLo)) / (zHi - zLo) : 0;
    radialNormal(r0, rt, rz, th, out, o);
  };
  const scanEdge = (edge: number, th0: number, z0: number, th1: number, z1: number, lenMm: number, N: number): Cross[] => {
    const out: Cross[] = [];
    if (!(lenMm > 0)) return out;
    const dth = th1 - th0; const dz = z1 - z0;
    const hScan = Math.max(H_MIN, lenMm / (8 * N));
    for (let k = 0; k <= N; k += 1) normalAt(th0 + dth * (k / N), z0 + dz * (k / N), hScan, nBuf, 3 * k);
    let k0 = -1; let acc = 0;
    // ⚠ SECOND DEFECT, ALSO FOUND BY THE SELF-TEST AND ALSO A STRADDLE. Bisecting on lo/mid/hi — which is
    // what `locateTurn`/`locateTurnAdaptive` do — evaluates a probe AT the midpoint, and the midpoint's own
    // FD window straddles the crease whenever the crease is within bracket/8 of it. The probe then returns
    // an INTERMEDIATE normal, the half containing the crease can look like the smaller turn, and the bracket
    // DISCARDS THE CREASE. On a SYMMETRIC kink the intermediate normal is equidistant from both sides and it
    // survives; on an ASYMMETRIC one it does not. Measured on the tent fixture: the symmetric crest refined
    // to 156.280 deg (exact), the asymmetric outer clamp — slope -200 meeting slope 0 — refined to 0.000
    // deg while the scan across it read 78.7. A silent, plausible "no crease here".
    //
    // THE FIX: never probe at a point that may be the crease. Refine by RE-SCANNING the bracket (16 cells,
    // window 1/8 of a cell), keep the largest-gap cell WIDENED BY ONE CELL EITHER SIDE so a straddling
    // sample cannot push the crease out, and read the final turn from two points a full bracket OUTSIDE the
    // bracket, whose windows therefore cannot reach the crease. Both ends of the fixture now pass.
    const flush = (kEnd: number): void => {
      if (k0 < 0) return;
      let lo = k0 / N; let hi = (kEnd + 1) / N;
      const M = 16;
      for (let lvl = 0; lvl < REF_ITERS; lvl += 1) {
        const wMm = lenMm * (hi - lo);
        if (!(wMm > 8 * H_MIN) || wMm <= 1e-6) break;
        const h = wMm / (8 * M);
        for (let k = 0; k <= M; k += 1) {
          const t = lo + ((hi - lo) * k) / M;
          normalAt(th0 + dth * t, z0 + dz * t, h, nBuf, 3 * k);
        }
        let bg = -1; let bi = 0;
        for (let k = 0; k < M; k += 1) { const g = angOf(nBuf, 3 * k, nBuf, 3 * (k + 1)); if (g > bg) { bg = g; bi = k; } }
        const a2 = lo + ((hi - lo) * Math.max(0, bi - 1)) / M;
        const b2 = lo + ((hi - lo) * Math.min(M, bi + 2)) / M;
        lo = a2; hi = b2;
      }
      const w = hi - lo;
      const h = Math.max(H_MIN, (lenMm * w) / 8);
      const tL = lo - w; const tR = hi + w;                 // OUTSIDE the bracket: windows cannot reach it
      normalAt(th0 + dth * tL, z0 + dz * tL, h, n0, 0);
      normalAt(th0 + dth * tR, z0 + dz * tR, h, n1, 0);
      out.push({ edge, s: 0.5 * (lo + hi), turnDeg: angOf(n0, 0, n1, 0), turnScanDeg: acc, brWidthMm: lenMm * w });
      k0 = -1; acc = 0;
    };
    for (let k = 0; k < N; k += 1) {
      const g = angOf(nBuf, 3 * k, nBuf, 3 * (k + 1));
      if (g > GAP_FIND) { if (k0 < 0) k0 = k; acc += g; } else flush(k - 1);
    }
    flush(N - 1);
    return out;
  };

  // ── THE KINK LADDER — brackets the DISTANCE from a point to the nearest crease ────────────────────────
  // ⚠ AN ABSOLUTE ANGLE BAR IS NOT A CREASE TEST, and the first version of this tool used one. The
  // kink-aware sampler's 4 one-sided combinations differ by O(h * second derivative) on a SMOOTH patch, and
  // GothicArches' ribs are `pow(max(0,1-|d|/w), sharp)` with w ~ 0.05 in normalised units — second
  // derivatives of order 1e5 mm/rad^2, which clears a 5-deg bar at h = 0.3 um on smooth material. Read that
  // way the ladder said "a crease is within 1 um of 92% of the class", which is an artefact of the bar.
  // THE H2 TEST IS THE DISCRIMINATOR: a crease's cone SATURATES at the dihedral once h exceeds the distance,
  // while smooth curvature's grows LINEARLY in h. The rungs are spaced ~3.3x, so a rung fires only if the
  // next rung up is LESS THAN 2x wider — i.e. it has saturated.
  const rungs = [...LADDER_UM, 300, 1000];
  const ladders: NormalSampler[] = rungs.map((um) => fdNormals(R, H, um / 1000, um / 1000));
  const ladScratch = new Float64Array(12);
  const spreadAt = (i: number, th: number, z: number): number => {
    const nc = ladders[i](th, z, ladScratch);
    let mk = 0;
    for (let p = 1; p < nc; p += 1) for (let r = 0; r < p; r += 1) {
      const a = angOf(ladScratch, 3 * p, ladScratch, 3 * r);
      if (a > mk) mk = a;
    }
    return mk;
  };
  const creaseWithinUm = (th: number, z: number): number => {
    const sp = rungs.map((_u, i) => spreadAt(i, th, z));
    for (let i = 0; i < LADDER_UM.length; i += 1) {
      if (sp[i] > LADDER_DEG && sp[i + 1] < 2 * sp[i]) return LADDER_UM[i];
    }
    return Infinity;
  };
  return { scanEdge, creaseWithinUm };
}

// ── SELF-TEST ON CLOSED FORMS. TWO-SIDED: the crease fixture must find EXACTLY the creases that are there
// (a ceiling AND a floor), and the smooth control must find NONE. A one-sided bar is satisfied by a
// degenerate scanner that returns nothing, which is precisely the defect above.
let SELFTEST = true;
{
  log('── SELF-TEST of the dense scanner on closed forms (two-sided) ──');
  const R0 = 40; const AMP = 2; const TH0 = 0.3; const W = 0.01;
  const rTent = (th: number): number => R0 + AMP * Math.max(0, 1 - Math.abs(th - TH0) / W);
  const sT = makeScanner((th) => rTent(th));
  // edge spans th 0.292 -> 0.318 at z=50: kinks at th=0.30 (crest) and th=0.31 (outer clamp)
  const thA = 0.292; const thB = 0.318; const lenT = R0 * (thB - thA);
  const rawT = sT.scanEdge(0, thA, 50, thB, 50, lenT, 256);
  const gotT = rawT.filter((c) => c.turnDeg >= 5);
  const sCrest = (TH0 - thA) / (thB - thA); const sClamp = (TH0 + W - thA) / (thB - thA);
  const tCrest = (2 * Math.atan((AMP / W) / (R0 + AMP)) * 180) / Math.PI;
  const tClamp = (Math.atan((AMP / W) / R0) * 180) / Math.PI;
  log(`  TENT: expect 2 crossings — s ${sCrest.toFixed(5)} turn ${tCrest.toFixed(2)} deg, s ${sClamp.toFixed(5)} turn ${tClamp.toFixed(2)} deg`);
  log(`  TENT: brackets opened ${rawT.length}: ${rawT.map((c) => `s ${c.s.toFixed(5)} turn ${c.turnDeg.toFixed(3)} scan ${c.turnScanDeg.toFixed(1)} br ${c.brWidthMm.toExponential(1)}mm`).join(' | ')}`);
  const okN = gotT.length === 2;
  const okA = okN && Math.abs(gotT[0].s - sCrest) * lenT < 1e-3 && Math.abs(gotT[0].turnDeg - tCrest) < 0.5;
  const okB = okN && Math.abs(gotT[1].s - sClamp) * lenT < 1e-3 && Math.abs(gotT[1].turnDeg - tClamp) < 0.5;
  const rSmooth = (th: number): number => R0 + AMP * Math.cos(60 * th);
  const sS = makeScanner((th) => rSmooth(th));
  const gotS = sS.scanEdge(0, thA, 50, thB, 50, lenT, 256);
  const overS = gotS.filter((c) => c.turnDeg >= 5);
  const tvS = ((Math.atan((AMP * 60 * Math.sin(60 * thB)) / R0) - Math.atan((AMP * 60 * Math.sin(60 * thA)) / R0)) * 180) / Math.PI;
  log(`  SMOOTH CONTROL cos(60 th): the normal genuinely turns ${Math.abs(tvS).toFixed(1)} deg across this edge.`);
  log(`  SMOOTH: brackets opened ${gotS.length}, surviving the 5 deg bar ${overS.length} (must be 0)  refined turns: ${gotS.map((c) => c.turnDeg.toExponential(1)).join(',') || '-'}`);
  // LADDER CALIBRATION, two-sided. The rungs are 3.3x apart and the cone only SATURATES a few multiples of
  // the distance out, so the ladder brackets d to within about one rung; it must be FINITE and small near a
  // crease, LARGE far from one, and INFINITE on smooth material. Asserting "exactly 1 um at 0.5 um" would be
  // asserting a resolution the instrument does not have.
  const ladNear = sT.creaseWithinUm(TH0 + 0.5e-3 / R0, 50);
  const ladFar = sT.creaseWithinUm(TH0 + 30e-3 / R0, 50);
  const ladS = sS.creaseWithinUm(thA + 0.5 * (thB - thA), 50);
  log(`  LADDER: 0.5 um off the tent crest -> ${ladNear} um (must be finite, <= 10);  30 um off -> ${ladFar} um (must be >= 10);  smooth control -> ${ladS} um (must be Infinity)`);
  const okL = Number.isFinite(ladNear) && ladNear <= 10 && ladFar >= 10 && !Number.isFinite(ladS);
  SELFTEST = okN && okA && okB && overS.length === 0 && okL;
  log(`  SELF-TEST ${SELFTEST ? 'PASS' : '*** FAILED — THE RUN IS VOID ***'}   (count ${okN}, crest ${okA}, clamp ${okB}, smooth ${overS.length === 0}, ladder ${okL})`);
  log('');
  if (process.env.PF_S113A_SELFONLY === '1') process.exit(SELFTEST ? 0 : 3);
}
const { scanEdge, creaseWithinUm } = makeScanner(rA);

// ── per-facet parameter-space setup ─────────────────────────────────────────────────────────────────────
interface FacetGeom { ths: number[]; zs: number[]; rRef: number; edgeLen: number[] }
const geom = new Map<number, FacetGeom>();
for (const fr of facets.values()) {
  const t = fr.xyz;
  const a = Math.atan2(t[1], t[0]);
  const b = a + dThRaw(a, Math.atan2(t[4], t[3]));
  const c = a + dThRaw(a, Math.atan2(t[7], t[6]));
  const rRef = (Math.hypot(t[0], t[1]) + Math.hypot(t[3], t[4]) + Math.hypot(t[6], t[7])) / 3;
  const eL = [0, 1, 2].map((i) => {
    const j = (i + 1) % 3;
    return Math.hypot(t[j * 3] - t[i * 3], t[j * 3 + 1] - t[i * 3 + 1], t[j * 3 + 2] - t[i * 3 + 2]);
  });
  geom.set(fr.f, { ths: [a, b, c], zs: [t[2], t[5], t[8]], rRef, edgeLen: eL });
}

// ── run the scan at each resolution ─────────────────────────────────────────────────────────────────────
const scans = new Map<number, Map<number, Cross[]>>();
for (const N of SCAN_NS) {
  const m = new Map<number, Cross[]>();
  for (const fr of facets.values()) {
    const g = geom.get(fr.f) as FacetGeom;
    const cs: Cross[] = [];
    for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      for (const c of scanEdge(i, g.ths[i], g.zs[i], g.ths[j], g.zs[j], g.edgeLen[i], N)) cs.push(c);
    }
    m.set(fr.f, cs);
  }
  scans.set(N, m);
  log(`dense boundary scan at N=${N} done  ${el()}`);
}

// ── the ladder, on every edge (5 interior points) and every facet interior (3 points) ───────────────────
interface Ladder { edgeUm: number[][]; interiorUm: number[] }
const ladderOf = new Map<number, Ladder>();
for (const fr of facets.values()) {
  const g = geom.get(fr.f) as FacetGeom;
  const edgeUm: number[][] = [];
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3; const row: number[] = [];
    for (let k = 1; k <= 5; k += 1) {
      const s = k / 6;
      row.push(creaseWithinUm(g.ths[i] + s * (g.ths[j] - g.ths[i]), g.zs[i] + s * (g.zs[j] - g.zs[i])));
    }
    edgeUm.push(row);
  }
  const interiorUm: number[] = [];
  for (const w of [[0.5, 0.25, 0.25], [0.25, 0.5, 0.25], [0.25, 0.25, 0.5]]) {
    interiorUm.push(creaseWithinUm(
      w[0] * g.ths[0] + w[1] * g.ths[1] + w[2] * g.ths[2],
      w[0] * g.zs[0] + w[1] * g.zs[1] + w[2] * g.zs[2],
    ));
  }
  ladderOf.set(fr.f, { edgeUm, interiorUm });
}
log(`kink ladder done (${facets.size * 18} probes)  ${el()}`);
for (const fr of facets.values()) {
  const L = ladderOf.get(fr.f) as Ladder;
  alignHits.set(fr.f, ALIGN_CUTS.map((cut) => L.edgeUm.map((row) => row.filter((x) => x <= cut).length)));
}
// which edge index of each facet is the pair's SHARED edge
const sharedEdgeOf = new Map<string, number>();
for (const r of rows) {
  for (const [f, tri] of [[r.f1, r.tri1], [r.f2, r.tri2]] as Array<[number, number[]]>) {
    const idx: number[] = [];
    for (let v = 0; v < 3; v += 1) {
      for (let s = 0; s < 2; s += 1) {
        if (tri[v * 3] === r.shared[s * 3] && tri[v * 3 + 1] === r.shared[s * 3 + 1] && tri[v * 3 + 2] === r.shared[s * 3 + 2]) { idx.push(v); break; }
      }
    }
    let e = -1;
    if (idx.length === 2) {
      const a = Math.min(idx[0], idx[1]); const b = Math.max(idx[0], idx[1]);
      e = a === 0 && b === 1 ? 0 : a === 1 && b === 2 ? 1 : a === 0 && b === 2 ? 2 : -1;
    }
    sharedEdgeOf.set(`${r.e}:${f}`, e);
  }
}
log('');

// ── CLASSIFY + TEST LEGALITY ────────────────────────────────────────────────────────────────────────────
type Cls = 'TWO_EDGE' | 'VERTEX_THROUGH' | 'ALIGNED' | 'NONE' | 'ONE' | 'MULTI' | 'DEGENERATE';
interface FacetVerdict {
  f: number; cls: Cls; area: number; normHi: number; legal: boolean; blocker: string;
  alignedLenMm: number; minChildEdgeMm: number; minChildAngDeg: number; maxChildAr: number;
  parentMinSplitEdgeMm: number; nearVertexMm: number; nSplits: number; nCross: number;
}

function classify(fr: FacetRec, crossings: Cross[], thr: number, alignCutIdx: number): FacetVerdict {
  const g = geom.get(fr.f) as FacetGeom;
  const t = fr.xyz;
  const V = [pt(t, 0), pt(t, 1), pt(t, 2)];
  if (alignCutIdx >= 0) {
    const be = (alignHits.get(fr.f) as number[][])[alignCutIdx].findIndex((h) => h >= 4);
    if (be >= 0) {
      return {
        f: fr.f, cls: 'ALIGNED', area: fr.area, normHi: fr.normHi, legal: true,
        blocker: 'none(already-aligned)', alignedLenMm: g.edgeLen[be], minChildEdgeMm: NaN,
        minChildAngDeg: NaN, maxChildAr: NaN, parentMinSplitEdgeMm: NaN, nearVertexMm: NaN,
        nSplits: 0, nCross: crossings.filter((c) => c.turnDeg >= thr).length,
      };
    }
  }
  const vtxLoci = new Set<number>();
  const interior: Array<{ edge: number; s: number; P: [number, number, number]; toVtxMm: number }> = [];
  for (const c of crossings) {
    if (!(c.turnDeg >= thr)) continue;
    const i = c.edge; const j = (i + 1) % 3; const len = g.edgeLen[i];
    const dLo = c.s * len; const dHi = (1 - c.s) * len;
    // PHYSICAL vertex snap: a crossing closer to a vertex than FLOOR_MM cannot be split off — the operator
    // would snap it to the vertex instead. FLOOR_MM/len ~ 5e-3, far above any bisection residual.
    if (dLo < FLOOR_MM) { vtxLoci.add(i); continue; }
    if (dHi < FLOOR_MM) { vtxLoci.add(j); continue; }
    interior.push({
      edge: i,
      s: c.s,
      P: [V[i][0] + c.s * (V[j][0] - V[i][0]), V[i][1] + c.s * (V[j][1] - V[i][1]), V[i][2] + c.s * (V[j][2] - V[i][2])],
      toVtxMm: Math.min(dLo, dHi),
    });
  }
  const nLoci = vtxLoci.size + interior.length;
  const nCross = crossings.filter((c) => c.turnDeg >= thr).length;
  const base = {
    f: fr.f, area: fr.area, normHi: fr.normHi, legal: false, blocker: '', alignedLenMm: NaN,
    minChildEdgeMm: NaN, minChildAngDeg: NaN, maxChildAr: NaN, parentMinSplitEdgeMm: NaN,
    nearVertexMm: interior.length > 0 ? Math.min(...interior.map((x) => x.toVtxMm)) : NaN, nSplits: 0, nCross,
  };
  if (nLoci === 0) return { ...base, cls: 'NONE', blocker: 'no-crossing' };
  if (nLoci === 1) return { ...base, cls: 'ONE', blocker: 'one-crossing-only' };
  if (nLoci > 2) return { ...base, cls: 'MULTI', blocker: 'multi-crossing' };

  let children: number[][] = [];
  let alignedLen = NaN;
  let parentMinSplit = Infinity;
  let nSplits = 0;

  if (vtxLoci.size === 2) {
    const vs = [...vtxLoci];
    return {
      ...base, cls: 'ALIGNED', legal: true, blocker: 'none(already-aligned)', nSplits: 0,
      alignedLenMm: Math.hypot(V[vs[0]][0] - V[vs[1]][0], V[vs[0]][1] - V[vs[1]][1], V[vs[0]][2] - V[vs[1]][2]),
    };
  }
  if (vtxLoci.size === 1) {
    const v = [...vtxLoci][0];
    const ic = interior[0];
    const j = (ic.edge + 1) % 3;
    if (ic.edge === v || j === v) return { ...base, cls: 'DEGENERATE', blocker: 'vertex-on-its-own-edge' };
    nSplits = 1;
    parentMinSplit = g.edgeLen[ic.edge];
    alignedLen = Math.hypot(V[v][0] - ic.P[0], V[v][1] - ic.P[1], V[v][2] - ic.P[2]);
    children = [triOf(V[v], V[ic.edge], ic.P), triOf(V[v], ic.P, V[j])];
  } else {
    const [c0, c1] = interior;
    const e0 = c0.edge; const e1 = c1.edge;
    const shared = [e0, (e0 + 1) % 3].filter((x) => x === e1 || x === (e1 + 1) % 3);
    if (shared.length !== 1) return { ...base, cls: 'DEGENERATE', blocker: 'edges-share-no-vertex' };
    const apex = shared[0];
    const far0 = e0 === apex ? (e0 + 1) % 3 : e0;
    const far1 = e1 === apex ? (e1 + 1) % 3 : e1;
    if (far0 === far1) return { ...base, cls: 'DEGENERATE', blocker: 'apex-resolution-failed' };
    nSplits = 2;
    parentMinSplit = Math.min(g.edgeLen[e0], g.edgeLen[e1]);
    alignedLen = Math.hypot(c0.P[0] - c1.P[0], c0.P[1] - c1.P[1], c0.P[2] - c1.P[2]);
    // the quad (P, far0, far1, Q) admits two diagonals; a shape-guarded operator takes the better one, so
    // BOTH are built and the smaller max-aspect3 one is kept. Reported, not assumed.
    const optA = [triOf(c0.P, V[far0], V[far1]), triOf(c0.P, V[far1], c1.P)];
    const optB = [triOf(c0.P, V[far0], c1.P), triOf(V[far0], V[far1], c1.P)];
    const arA = Math.max(...optA.map((x) => triMetrics(x).ar));
    const arB = Math.max(...optB.map((x) => triMetrics(x).ar));
    children = [triOf(V[apex], c0.P, c1.P), ...(arA <= arB ? optA : optB)];
  }

  const ms = children.map(triMetrics);
  const minChildEdge = Math.min(...ms.map((m) => m.minEdge));
  const minChildAng = Math.min(...ms.map((m) => m.minAngDeg));
  const maxAr = Math.max(...ms.map((m) => m.ar));
  let blocker = 'none';
  if (!(parentMinSplit >= FLOOR_MM)) blocker = 'floor-parent';
  else if (!(alignedLen >= FLOOR_MM)) blocker = 'floor-aligned-edge';
  else if (!(minChildEdge >= FLOOR_MM)) blocker = 'floor-child';
  else if (!(maxAr <= SHAPE_AR)) blocker = 'sliver-aspect';
  return {
    ...base, cls: nSplits === 2 ? 'TWO_EDGE' : 'VERTEX_THROUGH', legal: blocker === 'none', blocker,
    alignedLenMm: alignedLen, minChildEdgeMm: minChildEdge, minChildAngDeg: minChildAng, maxChildAr: maxAr,
    parentMinSplitEdgeMm: parentMinSplit, nSplits,
  };
}

interface Bucket { n: number; area: number; maxNorm: number }
const bump = (m: Map<string, Bucket>, k: string, v: FacetVerdict): void => {
  const b = m.get(k) ?? { n: 0, area: 0, maxNorm: 0 };
  b.n += 1; b.area += v.area; b.maxNorm = Math.max(b.maxNorm, v.normHi);
  m.set(k, b);
};
const pct = (a: number): string => `${((a / classArea) * 100).toFixed(2)}%`;
const pctMesh = (a: number): string => `${((a / meshArea) * 100).toFixed(4)}%`;
const CLS_ORDER = ['TWO_EDGE', 'VERTEX_THROUGH', 'ALIGNED', 'MULTI', 'ONE', 'NONE', 'DEGENERATE'];

// ── the refined-turn histogram: the classifier's own separation, printed ────────────────────────────────
{
  const tv: number[] = [];
  for (const cs of (scans.get(N_PRIMARY) as Map<number, Cross[]>).values()) for (const c of cs) tv.push(c.turnDeg);
  const HB = [0, 0.1, 1, 2, 5, 15, 45, 90, 135, 180.0001];
  const hist = new Array(HB.length - 1).fill(0);
  for (const v of tv) for (let i = 0; i < HB.length - 1; i += 1) if (v >= HB[i] && v < HB[i + 1]) { hist[i] += 1; break; }
  const bw: number[] = [];
  for (const cs of (scans.get(N_PRIMARY) as Map<number, Cross[]>).values()) for (const c of cs) bw.push(c.brWidthMm);
  log(`  final bracket width, mm (the S74 collapse guard): ${dist(bw, 9)}   8*H_MIN = ${(8 * H_MIN).toExponential(1)} mm`);
  log(`── THE CREASE BAR, JUSTIFIED. Refined turn of every bracket found at N=${N_PRIMARY} (n=${tv.length}) ──`);
  log(`  ${dist(tv, 3)}`);
  for (let i = 0; i < hist.length; i += 1) log(`   [${String(HB[i]).padStart(5)}, ${String(HB[i + 1]).padStart(8)}) deg : ${String(hist[i]).padStart(6)}  ${((hist[i] / Math.max(1, tv.length)) * 100).toFixed(2)}%`);
  log('  After 16 bracket-tied halvings the bracket is ~1e-4 mm wide, so SMOOTH curvature has decayed and');
  log('  what is left at 15+ deg is C0. The gap between the modes is where the 5/15/45 sweep lands.');
  log('');
}

const ALIGN_IDX = ALIGN_CUTS.indexOf(3);
let primary: Map<number, FacetVerdict> | null = null;
const runs: Array<{ tag: string; N: number; thr: number; ai: number }> = [];
for (const N of SCAN_NS) for (const thr of CREASE_THRS) runs.push({ tag: `N=${N}  crease bar ${thr} deg  along-edge cut ${ALIGN_CUTS[ALIGN_IDX]} um`, N, thr, ai: ALIGN_IDX });
for (let i = 0; i < ALIGN_CUTS.length; i += 1) {
  if (i === ALIGN_IDX) continue;
  runs.push({ tag: `N=${N_PRIMARY}  crease bar ${THR_PRIMARY} deg  along-edge cut ${ALIGN_CUTS[i]} um`, N: N_PRIMARY, thr: THR_PRIMARY, ai: i });
}
runs.push({ tag: `N=${N_PRIMARY}  crease bar ${THR_PRIMARY} deg  along-edge test OFF (boundary scan alone)`, N: N_PRIMARY, thr: THR_PRIMARY, ai: -1 });
for (const run of runs) {
  const N = run.N; const thr = run.thr;
  const sc = scans.get(N) as Map<number, Cross[]>;
  {
    const verdicts = new Map<number, FacetVerdict>();
    for (const fr of facets.values()) verdicts.set(fr.f, classify(fr, sc.get(fr.f) as Cross[], thr, run.ai));
    if (N === N_PRIMARY && thr === THR_PRIMARY && run.ai === ALIGN_IDX) primary = verdicts;
    const byCls = new Map<string, Bucket>();
    const byBlock = new Map<string, Bucket>();
    let legalN = 0; let legalA = 0; let legalMax = 0;
    for (const v of verdicts.values()) {
      bump(byCls, v.cls, v); bump(byBlock, v.blocker, v);
      if (v.legal) { legalN += 1; legalA += v.area; legalMax = Math.max(legalMax, v.normHi); }
    }
    log(`════ ${run.tag} ════   (${facets.size} facets, ${classArea.toFixed(3)} mm2 = ${pctMesh(classArea)} of mesh)`);
    log('  CLASSIFICATION            count    area mm2   %class    %mesh   max normHi');
    for (const k of CLS_ORDER) {
      const b = byCls.get(k); if (b === undefined) continue;
      log(`   ${k.padEnd(22)} ${String(b.n).padStart(6)}  ${b.area.toFixed(4).padStart(10)}  ${pct(b.area).padStart(7)}  ${pctMesh(b.area).padStart(8)}   ${b.maxNorm.toFixed(2).padStart(7)} deg`);
    }
    log(`  ===> LEGAL ALIGNED EDGE EXISTS: ${legalN} facets (${((legalN / facets.size) * 100).toFixed(2)}%)  ${legalA.toFixed(4)} mm2 = ${pct(legalA)} of class = ${pctMesh(legalA)} of mesh  max normHi ${legalMax.toFixed(2)} deg`);
    log('  BLOCKER                   count    area mm2   %class    %mesh   max normHi');
    for (const [k, b] of [...byBlock.entries()].sort((a, b2) => b2[1].area - a[1].area)) {
      log(`   ${k.padEnd(22)} ${String(b.n).padStart(6)}  ${b.area.toFixed(4).padStart(10)}  ${pct(b.area).padStart(7)}  ${pctMesh(b.area).padStart(8)}   ${b.maxNorm.toFixed(2).padStart(7)} deg`);
    }
    log('');
  }
}

const P = primary as Map<number, FacetVerdict>;
log(`════ DETAIL AT N=${N_PRIMARY}, CREASE BAR ${THR_PRIMARY} deg ════`);
const twoE = [...P.values()].filter((v) => v.cls === 'TWO_EDGE');
const vThr = [...P.values()].filter((v) => v.cls === 'VERTEX_THROUGH');
const splitAble = [...twoE, ...vThr];
log('── the ALIGNED EDGE the operation would create (the crease chord inside the facet), mm ──');
log(`  TWO_EDGE       (n=${twoE.length})  ${dist(twoE.map((v) => v.alignedLenMm), 5)}`);
log(`  VERTEX_THROUGH (n=${vThr.length})  ${dist(vThr.map((v) => v.alignedLenMm), 5)}`);
log(`  under FLOOR_MM (${FLOOR_MM} mm): ${splitAble.filter((v) => !(v.alignedLenMm >= FLOOR_MM)).length}`);
log('── how close the crossing lands to an existing vertex (min over the crossings of a facet), mm ──');
log(`  ${dist(splitAble.map((v) => v.nearVertexMm).filter(Number.isFinite), 6)}`);
log('  (crossings under FLOOR_MM from a vertex were snapped to it and re-classified, so none appear here)');
log('── child geometry a split-at-the-crossings would make ──');
log(`  min child EDGE mm       ${dist(splitAble.map((v) => v.minChildEdgeMm), 6)}`);
log(`  min child MIN-ANGLE deg ${dist(splitAble.map((v) => v.minChildAngDeg), 3)}`);
log(`  max child aspect3       ${dist(splitAble.map((v) => v.maxChildAr), 3)}   (cap ${SHAPE_AR}, equilateral 1.732)`);
const arBins = [0, 2, 4, 8, 16, 50, 200, 1e9];
const arH = new Array(arBins.length - 1).fill(0); const arAr = new Array(arBins.length - 1).fill(0);
for (const v of splitAble) for (let i = 0; i < arBins.length - 1; i += 1) if (v.maxChildAr >= arBins[i] && v.maxChildAr < arBins[i + 1]) { arH[i] += 1; arAr[i] += v.area; break; }
log('  max-child-aspect3 (count / area mm2 / % of class):');
for (let i = 0; i < arH.length; i += 1) log(`   [${String(arBins[i]).padStart(4)}, ${(arBins[i + 1] === 1e9 ? 'inf' : String(arBins[i + 1])).padStart(4)}) : ${String(arH[i]).padStart(6)}  ${arAr[i].toFixed(4).padStart(9)}  ${pct(arAr[i]).padStart(7)}`);
const angBins = [0, 1, 5, 15, 30, 60, 180];
const angH = new Array(angBins.length - 1).fill(0); const angA = new Array(angBins.length - 1).fill(0);
for (const v of splitAble) for (let i = 0; i < angBins.length - 1; i += 1) if (v.minChildAngDeg >= angBins[i] && v.minChildAngDeg < angBins[i + 1]) { angH[i] += 1; angA[i] += v.area; break; }
log('  min-child-min-angle (count / area mm2 / % of class):');
for (let i = 0; i < angH.length; i += 1) log(`   [${String(angBins[i]).padStart(4)}, ${String(angBins[i + 1]).padStart(4)}) deg : ${String(angH[i]).padStart(6)}  ${angA[i].toFixed(4).padStart(9)}  ${pct(angA[i]).padStart(7)}`);
log('');

// ── WHAT THE "NO CROSSING" FACETS ACTUALLY ARE — the kink ladder speaks ─────────────────────────────────
{
  const nc = [...P.values()].filter((v) => v.cls === 'NONE' || v.cls === 'ONE');
  const alongEdge: FacetVerdict[] = []; const interiorOnly: FacetVerdict[] = []; const noCreaseNear: FacetVerdict[] = [];
  const nearestEdgeUm: number[] = [];
  for (const v of nc) {
    const L = ladderOf.get(v.f) as Ladder;
    let bestEdgeHits = 0; let anyEdge = Infinity;
    for (const row of L.edgeUm) {
      const hits = row.filter((x) => Number.isFinite(x)).length;
      if (hits > bestEdgeHits) bestEdgeHits = hits;
      for (const x of row) if (x < anyEdge) anyEdge = x;
    }
    const intHit = L.interiorUm.filter((x) => Number.isFinite(x)).length;
    nearestEdgeUm.push(anyEdge);
    if (bestEdgeHits >= 4) alongEdge.push(v);
    else if (intHit > 0 || bestEdgeHits > 0) interiorOnly.push(v);
    else noCreaseNear.push(v);
  }
  const roll = (a: FacetVerdict[]): string => {
    let ar = 0; let mx = 0;
    for (const v of a) { ar += v.area; mx = Math.max(mx, v.normHi); }
    return `${String(a.length).padStart(5)} facets  ${ar.toFixed(4).padStart(9)} mm2 = ${pct(ar).padStart(7)} of class = ${pctMesh(ar)} of mesh  max normHi ${mx.toFixed(2)} deg`;
  };
  log(`── DIAGNOSING "NO CROSSING FOUND" (${nc.length} facets) with the kink ladder ──`);
  log(`  crease runs ALONG an edge (>=4 of 5 probe points on one edge are within 100 um of a crease):`);
  log(`    ${roll(alongEdge)}`);
  log(`  crease near the facet but NOT along a whole edge (terminus / junction / grazing):`);
  log(`    ${roll(interiorOnly)}`);
  log(`  NO crease within 100 um of any of the 18 probe points — the crease LABEL is not reproduced here:`);
  log(`    ${roll(noCreaseNear)}`);
  log(`  nearest crease to any edge probe point, um (Inf = none within 100 um): ${dist(nearestEdgeUm.filter(Number.isFinite), 2)}  Inf: ${nearestEdgeUm.filter((x) => !Number.isFinite(x)).length}`);
  log('');
}

// ── the ALIGNED class: does the crease really follow that edge, or only touch its ends? ─────────────────
{
  const al = [...P.values()].filter((v) => v.cls === 'ALIGNED');
  const followers: FacetVerdict[] = []; const endpointsOnly: FacetVerdict[] = [];
  for (const v of al) {
    const L = ladderOf.get(v.f) as Ladder;
    let best = 0;
    for (const row of L.edgeUm) best = Math.max(best, row.filter((x) => Number.isFinite(x)).length);
    if (best >= 4) followers.push(v); else endpointsOnly.push(v);
  }
  const roll = (a: FacetVerdict[]): string => {
    let ar = 0; let mx = 0;
    for (const v of a) { ar += v.area; mx = Math.max(mx, v.normHi); }
    return `${String(a.length).padStart(5)} facets  ${ar.toFixed(4).padStart(9)} mm2 = ${pct(ar).padStart(7)} of class  max normHi ${mx.toFixed(2)} deg`;
  };
  log(`── THE "ALIGNED" CLASS AUDITED (${al.length} facets). Two vertex-loci is NOT proof the crease follows the edge ──`);
  log(`  crease follows the edge (>=4 of 5 interior probes within 100 um): ${roll(followers)}`);
  log(`  crease touches the ENDS only — it bows away from the chord INTO the facet, so this facet still`);
  log(`  straddles and NO aligned edge exists on the present vertex set: ${roll(endpointsOnly)}`);
  log('');
}

// ── CONTROL 3: the split parameter, t = s. Is the (theta,z) parameter usable as the 3-D chord parameter? ─
{
  const errs: number[] = [];
  const sc = scans.get(N_PRIMARY) as Map<number, Cross[]>;
  for (const fr of facets.values()) {
    const g = geom.get(fr.f) as FacetGeom;
    for (const c of sc.get(fr.f) as Cross[]) {
      if (!(c.turnDeg >= THR_PRIMARY)) continue;
      const i = c.edge; const j = (i + 1) % 3; const t = fr.xyz;
      const px = t[i * 3] + c.s * (t[j * 3] - t[i * 3]); const py = t[i * 3 + 1] + c.s * (t[j * 3 + 1] - t[i * 3 + 1]);
      const thT = g.ths[i] + c.s * (g.ths[j] - g.ths[i]);
      errs.push(Math.abs(g.rRef * dThRaw(canonTheta(thT), Math.atan2(py, px))));
    }
  }
  log('── CONTROL 3: |theta(3-D chord at t=s) - theta_target| as an arc length, mm ──');
  log(`  n = ${errs.length}   ${dist(errs, 7)}   vs FLOOR_MM ${FLOOR_MM}`);
  log(`  over FLOOR_MM: ${errs.filter((x) => x > FLOOR_MM).length}  (0 => "t = s" cannot move any legality verdict)`);
  log('');
}

// ── CONTROL 4: the dumped locateTurnAdaptive locs, and locateKinkRaw, against the dense scan ────────────
{
  const sc = scans.get(N_PRIMARY) as Map<number, Cross[]>;
  let agreeN = 0; let scanOnly = 0; let locOnly = 0; let neither = 0;
  const dLoc: number[] = []; const dKink: number[] = [];
  let kinkAgree = 0; let kinkOnly = 0; let scanOnlyK = 0; let neitherK = 0; let kinkJump = 0;
  for (const fr of facets.values()) {
    const g = geom.get(fr.f) as FacetGeom;
    const cs = sc.get(fr.f) as Cross[];
    for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      const mine = cs.filter((c) => c.edge === i && c.turnDeg >= THR_PRIMARY);
      const locFires = fr.locs[i].turnDeg >= THR_PRIMARY;
      if (mine.length > 0 && locFires) {
        agreeN += 1;
        dLoc.push(Math.min(...mine.map((c) => Math.abs(c.s - fr.locs[i].s))) * g.edgeLen[i]);
      } else if (mine.length > 0) scanOnly += 1;
      else if (locFires) locOnly += 1;
      else neither += 1;
      const k = locateKinkRaw(rA, g.ths[i], g.zs[i], g.ths[j], g.zs[j], PRED);
      const kf = k !== null && !k.jump;
      if (k !== null && k.jump) kinkJump += 1;
      if (mine.length > 0 && kf) { kinkAgree += 1; dKink.push(Math.min(...mine.map((c) => Math.abs(c.s - (k as { t: number }).t))) * g.edgeLen[i]); }
      else if (mine.length > 0) scanOnlyK += 1;
      else if (kf) kinkOnly += 1;
      else neitherK += 1;
    }
  }
  const tot = facets.size * 3;
  log(`── CONTROL 4: three detectors on the same ${tot} facet edges, at the ${THR_PRIMARY} deg bar ──`);
  log(`  DENSE SCAN vs the dumped locateTurnAdaptive: agree ${agreeN}  scan-only ${scanOnly}  loc-only ${locOnly}  neither ${neither}`);
  log(`    where both fire, |s_scan - s_loc| * edgeLen, mm : ${dist(dLoc, 6)}   over FLOOR_MM: ${dLoc.filter((x) => x > FLOOR_MM).length} of ${dLoc.length}`);
  log(`  DENSE SCAN vs locateKinkRaw(non-jump): agree ${kinkAgree}  scan-only ${scanOnlyK}  kink-only ${kinkOnly}  neither ${neitherK}  (JUMP/curtain ${kinkJump})`);
  log(`    where both fire, |s_scan - t_kink| * edgeLen, mm : ${dist(dKink, 6)}   over FLOOR_MM: ${dKink.filter((x) => x > FLOOR_MM).length} of ${dKink.length}`);
  log('');
}

// ── CONTROL 5: resolution stability of the PRIMARY verdict ──────────────────────────────────────────────
if (SCAN_NS.length > 1) {
  const other = SCAN_NS.find((n) => n !== N_PRIMARY) as number;
  const vOther = new Map<number, FacetVerdict>();
  for (const fr of facets.values()) vOther.set(fr.f, classify(fr, (scans.get(other) as Map<number, Cross[]>).get(fr.f) as Cross[], THR_PRIMARY, ALIGN_IDX));
  let clsMoved = 0; let clsMovedArea = 0; let legalMoved = 0; let legalMovedArea = 0;
  for (const fr of facets.values()) {
    const a = P.get(fr.f) as FacetVerdict; const b = vOther.get(fr.f) as FacetVerdict;
    if (a.cls !== b.cls) { clsMoved += 1; clsMovedArea += fr.area; }
    if (a.legal !== b.legal) { legalMoved += 1; legalMovedArea += fr.area; }
  }
  log(`── CONTROL 5: scan resolution N=${N_PRIMARY} vs N=${other}, same ${THR_PRIMARY} deg bar ──`);
  log(`  facets whose CLASS moves : ${clsMoved} (${((clsMoved / facets.size) * 100).toFixed(2)}%)  ${clsMovedArea.toFixed(4)} mm2 = ${pct(clsMovedArea)} of class`);
  log(`  facets whose LEGAL moves : ${legalMoved} (${((legalMoved / facets.size) * 100).toFixed(2)}%)  ${legalMovedArea.toFixed(4)} mm2 = ${pct(legalMovedArea)} of class`);
  log('');
}

// ── IS THE CREASE ON THE PAIR'S SHARED EDGE? — the question the target set's own membership turns on ────
// If the crease runs ALONG the shared edge, then the pair's big dihedral IS the crease, faithfully
// represented, and there is nothing for a crease operator to do. The pair would be correctly conformed
// geometry sitting inside a set labelled "straddling".
{
  log('── DOES THE CREASE RUN ALONG THE PAIR\'S SHARED EDGE? (per pair, by the ladder) ──');
  let bad = 0;
  for (let ci = 0; ci < ALIGN_CUTS.length; ci += 1) {
    let onShared = 0; let onOther = 0; let neither2 = 0;
    const uf = new Set<number>();
    for (const r of rows) {
      let hit = false; let other = false;
      for (const f of [r.f1, r.f2]) {
        const e = sharedEdgeOf.get(`${r.e}:${f}`);
        const ah = (alignHits.get(f) as number[][])[ci];
        if (e === undefined || e < 0) { bad += 1; continue; }
        if (ah[e] >= 4) hit = true;
        for (let k = 0; k < 3; k += 1) if (k !== e && ah[k] >= 4) other = true;
      }
      if (hit) { onShared += 1; uf.add(r.f1); uf.add(r.f2); } else if (other) onOther += 1; else neither2 += 1;
    }
    let ar = 0;
    for (const f of uf) ar += (facets.get(f) as FacetRec).area;
    log(`  cut ${String(ALIGN_CUTS[ci]).padStart(4)} um: crease ALONG THE SHARED EDGE ${String(onShared).padStart(5)} pairs (${((onShared / rows.length) * 100).toFixed(2)}%)  ${ar.toFixed(3)} mm2 = ${pct(ar)} of class`
    + `   | along another edge only ${String(onOther).padStart(5)}   | neither ${String(neither2).padStart(5)}`);
  }
  log(`  (shared-edge resolution failures: ${bad} of ${rows.length * 2} — must be 0)`);
  log('');
}

// ── THE OFFSET, MEASURED DIRECTLY — no rungs, no cuts ───────────────────────────────────────────────────
// The ladder answers in RUNGS (0.3/1/3/10/30/100 um) and over-reads by 3-6x (self-test: 0.5 um read as 3,
// 30 um read as 100), so every "cut" above is quantised and calibrated on ONE fixture. This measures the
// thing itself: scan PERPENDICULAR to the pair's shared edge and read where the crease actually crosses.
// A perpendicular is never parallel to the crease, so the along-edge blindness cannot bite here. Three
// probe points per edge (s = 0.25/0.5/0.75) because a two-point probe of a curved locus has under-read by
// 13x in this campaign; the crease is a CURVE and its offset varies along the edge.
{
  const perProbe: number[] = [];
  const perPairMax: number[] = [];
  let noCross = 0; let nPairs = 0;
  let areaUnderFloor = 0; let areaOver = 0;
  const uf = new Set<number>();
  for (const r of rows) {
    const f = r.f1;
    const e = sharedEdgeOf.get(`${r.e}:${f}`);
    if (e === undefined || e < 0) continue;
    const g = geom.get(f) as FacetGeom;
    const i = e; const j = (e + 1) % 3;
    const dth = g.ths[j] - g.ths[i]; const dz = g.zs[j] - g.zs[i];
    const dArc = g.rRef * dth;
    const L = Math.hypot(dArc, dz);
    if (!(L > 0)) continue;
    const pArc = -dz / L; const pZ = dArc / L;         // unit perpendicular in the (rRef*theta, z) metric
    nPairs += 1;
    let worst = 0; let any = false;
    for (const s of [0.25, 0.5, 0.75]) {
      const thM = g.ths[i] + s * dth; const zM = g.zs[i] + s * dz;
      const th0p = thM - (L * pArc) / g.rRef; const z0p = zM - L * pZ;
      const th1p = thM + (L * pArc) / g.rRef; const z1p = zM + L * pZ;
      const cs = scanEdge(0, th0p, z0p, th1p, z1p, 2 * L, N_PRIMARY).filter((c) => c.turnDeg >= THR_PRIMARY);
      if (cs.length === 0) continue;
      const off = Math.min(...cs.map((c) => Math.abs(c.s - 0.5) * 2 * L));
      perProbe.push(off); any = true;
      if (off > worst) worst = off;
    }
    if (!any) { noCross += 1; continue; }
    perPairMax.push(worst);
    uf.add(r.f1); uf.add(r.f2);
    const a = (facets.get(r.f1) as FacetRec).area + (facets.get(r.f2) as FacetRec).area;
    if (worst < FLOOR_MM) areaUnderFloor += a; else areaOver += a;
  }
  log('── HOW FAR IS THE CREASE FROM THE PAIR\'S SHARED EDGE? (perpendicular dense scan, 3 probes/edge) ──');
  log(`  ${nPairs} pairs probed; ${noCross} had NO crease crossing any perpendicular (report, not hide)`);
  log(`  offset per probe point, mm  (n=${perProbe.length}): ${dist(perProbe, 6)}`);
  log(`  WORST of the 3 probes per pair, mm (n=${perPairMax.length}): ${dist(perPairMax, 6)}`);
  const cuts = [0.0015, 0.003, 0.01, 0.03, 0.1];
  for (const c of cuts) {
    const n = perPairMax.filter((x) => x <= c).length;
    log(`    worst offset <= ${(c * 1000).toFixed(1).padStart(6)} um : ${String(n).padStart(5)} pairs (${((n / Math.max(1, perPairMax.length)) * 100).toFixed(2)}%)`);
  }
  log(`  by AREA (union of both facets): under FLOOR_MM everywhere on the edge ${areaUnderFloor.toFixed(3)} mm2 = ${pct(areaUnderFloor)} of class`);
  log(`                                  over  FLOOR_MM somewhere            ${areaOver.toFixed(3)} mm2 = ${pct(areaOver)} of class`);
  log('  FLOOR_MM = 1.5 um is the driver\'s own split floor: an offset under it is a correction the driver');
  log('  is not permitted to make, and an offset a few um over it is a correction of a few um.');
  log('');
}

// ── PAIR-LEVEL ROLLUP ───────────────────────────────────────────────────────────────────────────────────
{
  let both = 0; let one = 0; let none = 0;
  const noneBlockers = new Map<string, number>();
  for (const r of rows) {
    const a = P.get(r.f1) as FacetVerdict; const b = P.get(r.f2) as FacetVerdict;
    const k = (a.legal ? 1 : 0) + (b.legal ? 1 : 0);
    if (k === 2) both += 1; else if (k === 1) one += 1; else {
      none += 1;
      const key = [a.blocker, b.blocker].sort().join(' + ');
      noneBlockers.set(key, (noneBlockers.get(key) ?? 0) + 1);
    }
  }
  log(`── PAIR-LEVEL (${rows.length} pairs; a straddle is only removed if BOTH facets get the aligned edge) ──`);
  log(`  BOTH facets legal : ${both}  (${((both / rows.length) * 100).toFixed(2)}%)`);
  log(`  exactly ONE legal : ${one}   (${((one / rows.length) * 100).toFixed(2)}%)`);
  log(`  NEITHER legal     : ${none}  (${((none / rows.length) * 100).toFixed(2)}%)`);
  for (const [k, v] of [...noneBlockers.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8)) log(`     ${String(v).padStart(5)}  ${k}`);
  log('');
}

const outRows = [...P.values()].map((v) => JSON.stringify(v)).join('\n');
writeFileSync(`${OUTDIR}/S113A_LEGALITY_${TAG}.ndjson`, `${outRows}\n`);
log(`wrote ${OUTDIR}/S113A_LEGALITY_${TAG}.ndjson  (${P.size} facets, N=${N_PRIMARY}, bar ${THR_PRIMARY} deg)`);
log(`SELF-TEST ${SELFTEST ? 'PASS' : '*** FIRED — RUN VOID ***'}   CONTROL 1 ${CTRL1 ? 'PASS' : '*** FIRED — RUN VOID ***'}   CONTROL 2 ${CTRL2 ? 'PASS' : '*** FIRED — RUN VOID ***'}`);
log(`done ${el()}`);
