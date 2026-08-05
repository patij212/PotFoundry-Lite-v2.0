// s87LedgerReexam.ts — DID STRATA'S LINEAGE IMPROVE THE MESH, OR A BLIND RULER'S OPINION OF IT?
//
// The campaign's lineage table claims a seven-arm progression
//     _S9A -> _S10A -> _S11A -> _S15A -> _S21B -> _S22B -> _S24i2   (+ _S28i1, refuted)
// Every step in it was accepted on `sagAdaptiveRaw`, the driver's INFINITE-PLANE position ruler, which
// S85 measured to under-report honest position error by 21x-1527x and to OVER-report it 28-37% of the
// time. This tool re-scores the whole chain on the two HONEST rulers, and on nothing else.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-05, WRITTEN BEFORE THE FIRST RUN. Nothing below was edited after a number was read.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// H-L1 (THE HEADLINE).  The lineage did NOT improve honest fidelity from its first arm to its closing one.
//      MEASURE: `_S9A` vs `_S24i2` on (a) honest position PROVEN-FAIL by COUNT-RATE and by AREA-FRACTION
//      (`certifyTriangle` @ tol 0.010 mm, one uniform golden-stride sample per mesh, identical construction,
//      equal N); (b) orientation over-bar by COUNT and by AREA at the same 10 um bar, WHOLE MESH, using the
//      MONOTONE normal chord 2*sin(theta/2)*diam from `orientRuler.orientOfFacet`.
//      KILL (H-L1 REFUTED — the lineage IS a real improvement): `_S24i2` beats `_S9A` on BOTH position
//      count-rate AND position area-fraction with the count-rate ratio <= 0.80 and the two 1-sigma Poisson
//      intervals disjoint, AND does not worsen orientation over-bar AREA by more than 1.10x.
//      CONFIRM (H-L1 HELD — the progression is the ruler's opinion): position count-rate ratio >= 0.95, OR
//      the count and area directions disagree, OR orientation area worsens by >= 1.25x.
//      Anything between -> "improved on one axis, not the other"; quote both and claim nothing stronger.
//
// H-L2 (PER-STEP).  At most ONE of the six steps moves honest position by more than its own 1-sigma.
//      MEASURE: for each consecutive pair, the ratio of honest PROVEN-FAIL count-rates and of area
//      fractions, with the 1-sigma Poisson interval on each.
//      KILL: three or more steps move count-rate by more than 2 sigma IN THE IMPROVING DIRECTION.
//      CONFIRM: <= 1 step does.
//
// H-L3 (THE BLIND RULER'S RANKING).  The driver's own `over-0.01mm` ORDERING of the seven arms does not
//      match the honest ordering.
//      MEASURE: Spearman rank correlation between the driver's published over-0.01mm RATE (from each arm's
//      own .report.txt, whole mesh) and the honest PROVEN-FAIL rate, over the seven lineage arms.
//      KILL (H-L3 REFUTED, the blind ruler ranked correctly): rho >= 0.80.
//      CONFIRM: rho < 0.50. Between -> "degraded, not reversed".
//
// H-L4 (ORIENTATION IS THE AXIS THE LEDGER NEVER SCORED).  Orientation over-bar AREA does not fall across
//      the lineage even though the ledger claims the orientation class went 6,613 -> 959 -> 0 gated.
//      MEASURE: whole-mesh orientation over-bar by count and by AREA for all eight meshes.
//      KILL: `_S24i2`'s orientation over-bar AREA fraction is <= 0.50x `_S9A`'s.
//      CONFIRM: >= 0.90x.
//
// ── FOUR CONTROLS, CHECKED BEFORE ANY VERDICT IS READ ─────────────────────────────────────────────────
// C1  NON-VACUITY (H-R3, s85's control, re-run here). My whole-mesh plane pass must REPRODUCE the arm's own
//     .report.txt: the adaptive-oracle MAX to within 0.5% and the `over-0.01mm` count EXACTLY. If it does
//     not, my mesh loading / theta unwrapping / rA is wrong and no number in this run is admissible.
// C2  CROSS-TOOL. Run the `pos` arm on `gothicarches_ring_DS-HT_S39CTL` (an S85 mesh) at N=8,000 and compare
//     facet-for-facet against the first 8,000 rows of s85's own `S39CTL.uniform.ndjson`. The golden stride is
//     nested, so this is an EXACT comparison of two independently-driven tools on the same facets. This tool
//     uses `buildAuditRadiusFn` (the hoisted `_raFast` twin) where s85 used `buildRadiusFn` directly, so C2
//     also proves the twin is not changing an answer.
// C3  IDENTITY. `*ID*` tags are byte-identical controls (all seven checked: one md5, 8a59fb37). Scoring two
//     of them must give bit-identical rows. Different answers => the harness is wrong.
// C4  ORIENTATION VERTEX-STRADDLE. `orientRuler`'s own header records that a finite-difference normal
//     sampler evaluated EXACTLY ON a C0 crease false-alarms at the full dihedral, and a CONFORMED mesh puts
//     its vertices on the crease ON PURPOSE. That would penalise exactly the arms this lineage is about.
//     So EVERY orientation number is reported TWICE — `inset = 0` (raw) and `inset = 0.02` (vertex-safe) —
//     and no orientation verdict is read until the two are compared.
//
// ── WHAT THIS TOOL DOES NOT MEASURE, STATED UP FRONT ──────────────────────────────────────────────────
//   * The honest WHOLE-MESH POSITION MAX. Unreachable at this budget. Position maxima here are IN-SAMPLE
//     maxima at the stated coverage and are LOWER BOUNDS, never "the max".
//   * H2 (surface -> mesh). `certifyTriangle` walks points ON THE FACET: it is H1. A missing-material
//     defect the mesh does not cover is invisible to it. Ledger verdicts resting on H2, on topology, or on
//     a census are NOT touched by anything here and are not re-opened by it.
//   * Whether an arm is REPRODUCIBLE. These are the STLs on disk. Committed STRATA baselines have already
//     been shown non-reproducible from their saved commands (2026-07-28); this scores the artifacts.
//   * Equal budget. THE ARMS ARE NOT EQUAL-BUDGET — 1,010,435 to 1,495,804 triangles, a 1.48x spread. Every
//     delta is reported with both triangle counts beside it and RATES are the comparable quantity, not counts.
//
// Usage:  bash research/tools/run-s87-ledger.sh
//   env:  PF_S87_ARM=orient|pos   PF_S87_TAG  PF_S87_STEM  PF_S87_STYLE  PF_S87_N  PF_S87_TOL_MM(0.010)
//         PF_S87_K(8)  PF_S87_NMAX(512)  PF_S87_RESUME(1)  PF_S87_H/RB/RT/EXPN  PF_S87_REPORT
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');

const ARM = process.env.PF_S87_ARM ?? 'orient';
const TAG = process.env.PF_S87_TAG ?? 'S9A';
const STYLE = process.env.PF_S87_STYLE ?? 'GothicArches';
const STEM = process.env.PF_S87_STEM ?? 'gothicarches_ring_DS-H_S9A';
const NSAMP = Math.round(envF('PF_S87_N', 25000));
const TOL = envF('PF_S87_TOL_MM', 0.010);
const KLAT = Math.round(envF('PF_S87_K', 8));
const NMAX = Math.round(envF('PF_S87_NMAX', 512));
const RESUME = envB('PF_S87_RESUME', true);
const DIMS: StyleDims = { H: envF('PF_S87_H', 120), Rb: envF('PF_S87_RB', 40), Rt: envF('PF_S87_RT', 50), expn: envF('PF_S87_EXPN', 1) };
const H = DIMS.H;
const BAR = TOL * 1000;                       // um
// C4 — raw and vertex-safe. Overridable so the inset-CONVERGENCE control can add rungs without
// disturbing the two columns every other row is quoted on (index 0 = raw, index 1 = the verdict column).
const INSETS = (process.env.PF_S87_INSETS ?? '0,0.02').split(',').map(Number);
// THE ORIENTATION BAR SWEEP. Extra accumulators, ZERO extra rA evaluations — so a verdict cannot rest on
// one arbitrary bar. Index 0 (10 um) is the product bar and the one quoted; the rest test bar-robustness.
const OBARS = [10, 25, 50, 100, 250];
const DIR = 'research/exchange/_strataConformBisect';
const OUTDIR = `${DIR}/s87ledger`;
const CARD = `${DIR}/S87_LEDGER_REEXAM.md`;

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
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;

mkdirSync(OUTDIR, { recursive: true });
log('===== S87 LEDGER RE-EXAMINATION — the STRATA lineage on honest rulers =====');
log(`arm ${ARM}   tag ${TAG}   style ${STYLE}   stem ${STEM}`);
log(`tol ${BAR} um   k ${KLAT}   insets [${INSETS.join(', ')}]   nMax ${NMAX}   N ${NSAMP}   dims H${DIMS.H} Rb${DIMS.Rb} Rt${DIMS.Rt}`);

// ── C1 — THE ARM'S OWN SELF-REPORT, parsed so the contrast cannot be mis-transcribed. ────────────────
interface DriverSay { headline: number; adaptiveMax: number; overBar: number; nTri: number; found: boolean }
function readDriver(stem: string): DriverSay {
  const p = process.env.PF_S87_REPORT ?? `${DIR}/${stem}.report.txt`;
  const d: DriverSay = { headline: NaN, adaptiveMax: NaN, overBar: -1, nTri: -1, found: false };
  if (!existsSync(p)) return d;
  const txt = readFileSync(p, 'utf8');
  const h = /HEADLINE MAX\s+([\d.]+)\s*µm/.exec(txt);
  if (h !== null) d.headline = Number(h[1]);
  const a = /MAX\s+([\d.]+)\s*µm\s+(?:FAIL|PASS|NOT-CONVERGED)\s+p99\s+[\d.]+\s+p50\s+[\d.]+\s+over-0\.01mm\s+(\d+)\/(\d+)/.exec(txt);
  if (a !== null) { d.adaptiveMax = Number(a[1]); d.overBar = Number(a[2]); d.nTri = Number(a[3]); }
  if (!Number.isFinite(d.headline) && Number.isFinite(d.adaptiveMax)) d.headline = d.adaptiveMax;
  d.found = h !== null || a !== null;
  return d;
}
const DRV = readDriver(STEM);
log(`driver self-report: headline ${DRV.headline} um   adaptive MAX ${DRV.adaptiveMax} um   over-0.01mm ${DRV.overBar}/${DRV.nTri}   (${DRV.found ? 'parsed' : 'NOT FOUND'})`);

// ── rA. The SAME wrapper s85 used (canonTheta + z clamp), through `buildAuditRadiusFn` so the hoisted
//    `_raFast` twin is used ONLY if it proves bit-identical in this process. C2 checks the twin end-to-end.
const AR = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, H);
const rA = AR.rA;
log(`rA: fastUsed ${AR.fastUsed}   fastDiffs ${AR.fastDiffs}   (a twin is taken ONLY at 0 diffs; worst case is no speedup)`);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}   detectThetaJumps ${thJ.length}`);
// sanity: the wrapper must agree with the canonTheta form s85 used, at a few arbitrary points
{
  const raw = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, H).rA;
  let bad = 0;
  for (const [t, z] of [[0.3, 12.5], [4.1, 88.25], [-1.7, -3], [7.9, 131]] as [number, number][]) {
    if (!Object.is(raw(canonTheta(t), z < 0 ? 0 : z > H ? H : z), rA(t, z))) bad += 1;
  }
  log(`   wrapper-equivalence probe (canonTheta+clamp vs the wrapper): ${bad} mismatches of 4`);
}

const MESH = readMeshFloat64(`${DIR}/${STEM}.stl`, false);
const nTri = MESH.nTri;
log(`mesh ${nTri} facets loaded   [${el()}]`);
if (DRV.nTri > 0 && DRV.nTri !== nTri) log(`*** WARNING: report says ${DRV.nTri} facets, STL has ${nTri}. The report may belong to another arm. ***`);

/** THE sample construction. Byte-for-byte s85PosRebase / s80HonestPos, so rows cross-check (C2). */
function goldenIdx(count: number): Int32Array {
  const out = new Int32Array(Math.min(count, nTri));
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (s > 1 && gcd(s, nTri) !== 1) s += 2;
  if (s >= nTri) s = 1;
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % nTri;
  return out;
}

/** Pack a facet index list into a SagMesh with unwrapped theta. Byte-for-byte s85PosRebase's `mkSag`. */
function mkSag(idx: ArrayLike<number>): SagMesh {
  const n = idx.length;
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  const xyz = MESH.xyz;
  for (let q = 0; q < n; q += 1) {
    const o = idx[q] * 9;
    for (let v = 0; v < 3; v += 1) { vx[3 * q + v] = xyz[o + 3 * v]; vy[3 * q + v] = xyz[o + 3 * v + 1]; vz[3 * q + v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(vy[3 * q], vx[3 * q]);
    vth[3 * q] = thA;
    vth[3 * q + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 1], vx[3 * q + 1]));
    vth[3 * q + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * q + 2], vx[3 * q + 2]));
    ta[q] = 3 * q; tb[q] = 3 * q + 1; tc[q] = 3 * q + 2;
  }
  return { ta, tb, tc, vth, vz, vx, vy };
}

function areaOf(m: SagMesh, q: number): number {
  const { vx, vy, vz } = m;
  const ax = vx[3 * q]; const ay = vy[3 * q]; const az = vz[3 * q];
  const ux = vx[3 * q + 1] - ax; const uy = vy[3 * q + 1] - ay; const uz = vz[3 * q + 1] - az;
  const wx = vx[3 * q + 2] - ax; const wy = vy[3 * q + 2] - ay; const wz = vz[3 * q + 2] - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
}

const NS = fdNormals(rA, H);
const SCRATCH = new Float64Array(12);
/** THE ORIENTATION RULER, through `orientRuler.orientOfFacet` — monotone 2*sin(th/2)*diam, WINDING normal. */
function orientOne(m: SagMesh, q: number, inset: number): { um: number; deg: number; legacyUm: number; spreadDeg: number; overFrac: number } {
  const { vx, vy, vz, vth } = m;
  const o = orientOfFacet(
    NS,
    vx[3 * q], vy[3 * q], vz[3 * q],
    vx[3 * q + 1], vy[3 * q + 1], vz[3 * q + 1],
    vx[3 * q + 2], vy[3 * q + 2], vz[3 * q + 2],
    vth[3 * q], vth[3 * q + 1], vth[3 * q + 2],
    { k: KLAT, inset, scratch: SCRATCH, barRad: (5 * Math.PI) / 180 },
  );
  return { um: o.tangMm * 1000, deg: o.normDeg, legacyUm: o.legacyTangMm * 1000, spreadDeg: (o.spreadRad * 180) / Math.PI, overFrac: o.overFrac };
}
/** Does the facet's WINDING normal point outward? A per-mesh control on the winding convention. */
function windOutward(m: SagMesh, q: number): boolean {
  const { vx, vy, vz } = m;
  const ax = vx[3 * q]; const ay = vy[3 * q]; const az = vz[3 * q];
  const bx = vx[3 * q + 1]; const by = vy[3 * q + 1]; const bz = vz[3 * q + 1];
  const cx = vx[3 * q + 2]; const cy = vy[3 * q + 2]; const cz = vz[3 * q + 2];
  const fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  return fx * ((ax + bx + cx) / 3) + fy * ((ay + by + cy) / 3) >= 0;
}

function certOne(m: SagMesh, q: number): { w: number; b: number; v: number; c: 0 | 1 } {
  const { vx, vy, vz } = m;
  const r = certifyTriangle(rA,
    vx[3 * q], vy[3 * q], vz[3 * q],
    vx[3 * q + 1], vy[3 * q + 1], vz[3 * q + 1],
    vx[3 * q + 2], vy[3 * q + 2], vz[3 * q + 2],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
  return { w: r.witnessed * 1000, b: r.bound * 1000, v: r.witnessed > TOL ? 1 : r.certified ? 0 : -1, c: r.witnessedComplete ? 1 : 0 };
}

function appendCard(line: string): void {
  if (!existsSync(CARD)) writeFileSync(CARD, '');
  appendFileSync(CARD, `${line}\n`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ARM `orient` — WHOLE MESH, 100% coverage, no sampling error. Plus the C1 plane control, free on the way.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (ARM === 'orient') {
  const CHUNK = 100000;
  const ARG = makeSagArgmax();
  // accumulators
  let areaAll = 0; let planeMax = 0; let planeArg = -1; let planeOver = 0; let windOut = 0;
  const overN = INSETS.map(() => 0); const overA = INSETS.map(() => 0);
  // bar sweep, [inset][bar]
  const barN = INSETS.map(() => OBARS.map(() => 0)); const barA = INSETS.map(() => OBARS.map(() => 0));
  const legOverN = INSETS.map(() => 0);
  const invN = INSETS.map(() => 0);            // normDeg > 90 — a genuinely inverted facet
  const oriMax = INSETS.map(() => 0); const oriArgIdx = INSETS.map(() => -1);
  const oriSum = INSETS.map(() => 0);
  // reservoir for percentiles: a deterministic every-Rth facet, so p50/p99 are quotable with a stated stride
  const PSTRIDE = Math.max(1, Math.floor(nTri / 200000));
  const pOri: number[][] = INSETS.map(() => []); const pPlane: number[] = [];
  const CK = `${OUTDIR}/${TAG}.orient.progress.json`;
  let k0 = 0;
  if (RESUME && existsSync(CK)) {
    const st = JSON.parse(readFileSync(CK, 'utf8')) as Record<string, unknown>;
    if ((st.nTri as number) === nTri && (st.k as number) === KLAT
      && JSON.stringify(st.insets) === JSON.stringify(INSETS) && JSON.stringify(st.obars) === JSON.stringify(OBARS)) {
      k0 = st.done as number;
      areaAll = st.areaAll as number; planeMax = st.planeMax as number; planeArg = st.planeArg as number;
      planeOver = st.planeOver as number; windOut = st.windOut as number;
      for (let i = 0; i < INSETS.length; i += 1) {
        overN[i] = (st.overN as number[])[i]; overA[i] = (st.overA as number[])[i];
        legOverN[i] = (st.legOverN as number[])[i]; invN[i] = (st.invN as number[])[i];
        oriMax[i] = (st.oriMax as number[])[i]; oriArgIdx[i] = (st.oriArgIdx as number[])[i];
        oriSum[i] = (st.oriSum as number[])[i];
        pOri[i] = (st.pOri as number[][])[i];
        barN[i] = (st.barN as number[][])[i]; barA[i] = (st.barA as number[][])[i];
      }
      for (const v of st.pPlane as number[]) pPlane.push(v);
      log(`RESUME: ${k0}/${nTri} facets already swept   [${el()}]`);
    } else log('RESUME: checkpoint is for a different mesh/k — starting over');
  }
  const tS = Date.now();
  for (let base = k0; base < nTri; base += CHUNK) {
    const hi = Math.min(nTri, base + CHUNK);
    const idx = new Int32Array(hi - base);
    for (let q = 0; q < idx.length; q += 1) idx[q] = base + q;
    const M = mkSag(idx);
    for (let q = 0; q < idx.length; q += 1) {
      const gi = base + q;
      const a = areaOf(M, q); areaAll += a;
      const p = sagAdaptiveRaw(rA, M, q, 0.03, 12, 64, ARG) * 1000;
      if (p > planeMax) { planeMax = p; planeArg = gi; }
      if (p > BAR) planeOver += 1;
      if (windOutward(M, q)) windOut += 1;
      if (gi % PSTRIDE === 0) pPlane.push(p);
      for (let i = 0; i < INSETS.length; i += 1) {
        const o = orientOne(M, q, INSETS[i]);
        oriSum[i] += o.um * a;
        for (let bi = 0; bi < OBARS.length; bi += 1) if (o.um > OBARS[bi]) { barN[i][bi] += 1; barA[i][bi] += a; }
        if (o.um > BAR) { overN[i] += 1; overA[i] += a; }
        if (o.legacyUm > BAR) legOverN[i] += 1;
        if (o.deg > 90) invN[i] += 1;
        if (o.um > oriMax[i]) { oriMax[i] = o.um; oriArgIdx[i] = gi; }
        if (gi % PSTRIDE === 0) pOri[i].push(o.um);
      }
    }
    const done = hi;
    writeFileSync(CK, JSON.stringify({
      nTri, k: KLAT, insets: INSETS, obars: OBARS, done, areaAll, planeMax, planeArg, planeOver, windOut,
      overN, overA, barN, barA, legOverN, invN, oriMax, oriArgIdx, oriSum, pOri, pPlane,
    }));
    const rate = (done - k0) / Math.max(1e-9, (Date.now() - tS) / 1000);
    log(`   swept ${done}/${nTri}   ${rate.toFixed(0)} facet/s   eta ${(((nTri - done) / Math.max(1e-9, rate)) / 60).toFixed(1)} min   [${el()}]`);
  }

  log('');
  log('   ══ C1 NON-VACUITY — my whole-mesh plane pass vs the arm\'s own .report.txt ══');
  const dPct = Number.isFinite(DRV.adaptiveMax) ? (100 * Math.abs(planeMax - DRV.adaptiveMax)) / Math.max(1e-9, DRV.adaptiveMax) : NaN;
  log(`      adaptive MAX   mine ${planeMax.toFixed(3)} um   driver ${DRV.adaptiveMax} um   delta ${Number.isFinite(dPct) ? `${dPct.toFixed(3)}%` : 'n/a'}`);
  log(`      over-0.01mm    mine ${planeOver}                driver ${DRV.overBar}`);
  const c1 = Number.isFinite(DRV.adaptiveMax) && dPct <= 0.5 && planeOver === DRV.overBar;
  log(`      *** C1 ${c1 ? 'PASSES' : 'DOES NOT MATCH — read the two lines above before trusting anything below'} ***`);
  log('');
  log(`   winding control: ${windOut}/${nTri} (${((100 * windOut) / nTri).toFixed(4)}%) facets have an OUTWARD winding normal`);
  log(`   total mesh area ${areaAll.toFixed(3)} mm^2`);
  log('');
  log(`══ ORIENTATION — WHOLE MESH, ${nTri} facets, 100% coverage, monotone 2*sin(th/2)*diam @ ${BAR} um ══`);
  for (let i = 0; i < INSETS.length; i += 1) {
    const so = S(pOri[i]);
    log(`   inset ${INSETS[i].toFixed(2)}   over-bar COUNT ${overN[i]} (${((100 * overN[i]) / nTri).toFixed(4)}%)   over-bar AREA ${((100 * overA[i]) / Math.max(1e-30, areaAll)).toFixed(5)}%   inverted(>90deg) ${invN[i]}   MAX ${oriMax[i].toFixed(3)} um @ tri ${oriArgIdx[i]}   area-weighted mean ${(oriSum[i] / Math.max(1e-30, areaAll)).toFixed(4)} um   legacy sin(th)*diam over-bar ${legOverN[i]}`);
    log(`                p50 ${pq(so, 0.5).toFixed(4)}  p90 ${pq(so, 0.9).toFixed(3)}  p99 ${pq(so, 0.99).toFixed(3)} um   (stride-${PSTRIDE} reservoir, n=${so.length})`);
    log(`                BAR SWEEP  ${OBARS.map((b, bi) => `>${b}um: ${((100 * barN[i][bi]) / nTri).toFixed(3)}% cnt / ${((100 * barA[i][bi]) / Math.max(1e-30, areaAll)).toFixed(3)}% area`).join('   ')}`);
  }
  const sp = S(pPlane);
  log(`   plane ruler (the driver's own):   MAX ${planeMax.toFixed(3)}   over-bar ${planeOver}/${nTri} (${((100 * planeOver) / nTri).toFixed(5)}%)   p50 ${pq(sp, 0.5).toFixed(4)} p99 ${pq(sp, 0.99).toFixed(3)} um`);

  const sum = {
    arm: 'orient', tag: TAG, style: STYLE, stem: STEM, nTri, k: KLAT, insets: INSETS, tol: TOL,
    driver: DRV, c1pass: c1, planeMax, planeArg, planeOver, windOutFrac: windOut / nTri, areaAll,
    overN, overA, overAreaFrac: overA.map((v) => v / Math.max(1e-30, areaAll)),
    obars: OBARS, barN, barAreaFrac: barA.map((row) => row.map((v) => v / Math.max(1e-30, areaAll))),
    legOverN, invN, oriMax, oriArgIdx, oriAreaWtMean: oriSum.map((v) => v / Math.max(1e-30, areaAll)),
    oriP50: INSETS.map((_v, i) => pq(S(pOri[i]), 0.5)), oriP90: INSETS.map((_v, i) => pq(S(pOri[i]), 0.9)),
    oriP99: INSETS.map((_v, i) => pq(S(pOri[i]), 0.99)),
    planeP50: pq(sp, 0.5), planeP99: pq(sp, 0.99), pStride: PSTRIDE, secs: (Date.now() - T0) / 1000,
  };
  writeFileSync(`${OUTDIR}/${TAG}.orient.summary.json`, JSON.stringify(sum, null, 2));
  appendCard(`| ORIENT | ${TAG} | ${nTri} | ${DRV.overBar} | ${planeOver} | ${c1 ? 'C1 PASS' : 'C1 FAIL'} | ${overN[0]} (${((100 * overN[0]) / nTri).toFixed(4)}%) | ${((100 * overA[0]) / Math.max(1e-30, areaAll)).toFixed(5)}% | ${overN[1]} (${((100 * overN[1]) / nTri).toFixed(4)}%) | ${((100 * overA[1]) / Math.max(1e-30, areaAll)).toFixed(5)}% | ${invN[1]} | ${oriMax[1].toFixed(2)} | ${areaAll.toFixed(1)} | 100% coverage |`);
  log('');
  log(`row appended to ${CARD}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ARM `pos` — SAMPLED honest position. Three buckets, never folded; count AND area; per-facet ndjson.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (ARM === 'pos') {
  interface Row { k: number; area: number; p: number; w: number; b: number; v: number; c: 0 | 1; o0: number; o2: number }
  const REC = `${OUTDIR}/${TAG}.pos.ndjson`;
  const IDX = goldenIdx(NSAMP);
  const SM = mkSag(IDX); const ARG = makeSagArgmax();
  log(`sample: ${IDX.length} facets, golden stride, coverage ${((100 * IDX.length) / nTri).toFixed(3)}%`);
  let rows: Row[] = [];
  if (RESUME && existsSync(REC)) {
    for (const ln of readFileSync(REC, 'utf8').split('\n')) {
      if (ln.length < 3) continue;
      try { rows.push(JSON.parse(ln) as Row); } catch { /* truncated tail — re-score it */ }
    }
  } else if (existsSync(REC)) writeFileSync(REC, '');
  if (rows.length > IDX.length) rows = rows.slice(0, IDX.length);
  log(`RESUME: ${rows.length}/${IDX.length} already scored   [${el()}]`);
  const tS = Date.now();
  for (let q = rows.length; q < IDX.length; q += 1) {
    const c = certOne(SM, q);
    const r: Row = {
      k: IDX[q], area: areaOf(SM, q),
      p: sagAdaptiveRaw(rA, SM, q, 0.03, 12, 64, ARG) * 1000,
      w: c.w, b: c.b, v: c.v, c: c.c,
      o0: orientOne(SM, q, 0).um, o2: orientOne(SM, q, 0.02).um,
    };
    rows.push(r); appendFileSync(REC, `${JSON.stringify(r)}\n`);
    if ((q + 1) % 500 === 0) {
      const rate = (q + 1 - 0) / ((Date.now() - tS) / 1000);
      log(`  scored ${q + 1}/${IDX.length}   ${rate.toFixed(1)} facet/s   eta ${(((IDX.length - q - 1) / rate) / 60).toFixed(1)} min   [${el()}]`);
    }
  }
  const n = rows.length;
  const fail = rows.filter((r) => r.v === 1);
  const pass = rows.filter((r) => r.v === 0).length;
  const unk = rows.filter((r) => r.v === -1).length;
  const incomplete = rows.filter((r) => r.c === 0).length;
  const areaAll = rows.reduce((s, r) => s + r.area, 0);
  const areaFail = fail.reduce((s, r) => s + r.area, 0);
  const cov = n / nTri;
  const sigCount = fail.length > 0 ? Math.sqrt(fail.length) / fail.length : 1;
  const areaSq = fail.reduce((s, r) => s + r.area * r.area, 0);
  const sigArea = areaFail > 0 ? Math.sqrt(areaSq) / areaFail : 1;
  const sw = S(rows.map((r) => r.w)); const sp = S(rows.map((r) => r.p));
  const planeOver = rows.filter((r) => r.p > BAR).length;
  const o0Over = rows.filter((r) => r.o0 > BAR).length; const o2Over = rows.filter((r) => r.o2 > BAR).length;
  const o2OverArea = rows.filter((r) => r.o2 > BAR).reduce((s, r) => s + r.area, 0);
  log('');
  log(`══ POS ARM — ${TAG} — honest position, ${n} facets (${(100 * cov).toFixed(4)}% coverage) ══`);
  log(`   PROVEN-FAIL ${fail.length} (${(100 * fail.length / Math.max(1, n)).toFixed(4)}% +- ${(100 * sigCount).toFixed(1)}%, ${fail.length} failures)   PROVEN-PASS ${pass}   UNKNOWN ${unk}   witnessedComplete-false ${incomplete}`);
  log(`   PROVEN-FAIL AREA fraction ${(100 * areaFail / Math.max(1e-30, areaAll)).toFixed(5)}% +- ${(100 * sigArea).toFixed(1)}% relative`);
  log(`   scaled to the whole mesh: ${Math.round(fail.length / cov)} PROVEN-FAIL facets   (the arm's own over-0.01mm: ${DRV.overBar})`);
  log(`   honest witnessed in-sample  p50 ${pq(sw, 0.5).toFixed(3)}  p99 ${pq(sw, 0.99).toFixed(3)}  max ${sw[sw.length - 1].toFixed(3)} um   (IN-SAMPLE max, a LOWER BOUND)`);
  log(`   plane ruler in-sample       p50 ${pq(sp, 0.5).toFixed(3)}  p99 ${pq(sp, 0.99).toFixed(3)}  max ${sp[sp.length - 1].toFixed(3)} um   over-bar ${planeOver}/${n}`);
  log(`   orientation on the SAME facets: inset0 ${o0Over}/${n} (${(100 * o0Over / Math.max(1, n)).toFixed(3)}%)   inset0.02 ${o2Over}/${n} (${(100 * o2Over / Math.max(1, n)).toFixed(3)}%)  area ${(100 * o2OverArea / Math.max(1e-30, areaAll)).toFixed(5)}%   <= cross-checks the whole-mesh orient arm`);
  const ratio = DRV.overBar > 0 ? ((fail.length / cov) / DRV.overBar) : NaN;
  log(`   *** UNDER-REPORT RATIO (honest scaled count / arm's own over-bar count): ${Number.isFinite(ratio) ? `${ratio.toFixed(2)}x` : 'n/a'} ***`);
  const sum = {
    arm: 'pos', tag: TAG, style: STYLE, stem: STEM, nTri, N: n, coverage: cov, tol: TOL, nMax: NMAX,
    driver: DRV, fail: fail.length, pass, unknown: unk, incomplete,
    failRate: fail.length / Math.max(1, n), sigmaCountRel: sigCount,
    areaAll, areaFail, areaFailFrac: areaFail / Math.max(1e-30, areaAll), sigmaAreaRel: sigArea,
    scaledFail: fail.length / cov, underReportRatio: ratio, planeOverInSample: planeOver,
    witP50: pq(sw, 0.5), witP99: pq(sw, 0.99), witMaxInSample: sw[sw.length - 1],
    planeP50: pq(sp, 0.5), planeP99: pq(sp, 0.99), planeMaxInSample: sp[sp.length - 1],
    o0Over, o2Over, o2OverAreaFrac: o2OverArea / Math.max(1e-30, areaAll), secs: (Date.now() - T0) / 1000,
  };
  writeFileSync(`${OUTDIR}/${TAG}.pos.summary.json`, JSON.stringify(sum, null, 2));
  appendCard(`| POS | ${TAG} | ${nTri} | ${n} (${(100 * cov).toFixed(3)}%) | ${DRV.overBar} | ${fail.length} | ${(100 * fail.length / Math.max(1, n)).toFixed(4)}% +-${(100 * sigCount).toFixed(1)}% | ${Math.round(fail.length / cov)} | ${(100 * areaFail / Math.max(1e-30, areaAll)).toFixed(5)}% +-${(100 * sigArea).toFixed(1)}% | ${unk} | ${sw[sw.length - 1].toFixed(2)} | ${Number.isFinite(ratio) ? `${ratio.toFixed(2)}x` : 'n/a'} |`);
  log('');
  log(`row appended to ${CARD}`);
}
log(`done  [${el()}]   rA evals ${AR.evals()}   inflightRejected ${AR.inflightRejected()}`);
