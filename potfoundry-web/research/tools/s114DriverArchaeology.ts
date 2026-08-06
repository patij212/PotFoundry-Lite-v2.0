// s114DriverArchaeology.ts — WHY DID THE MESHER LEAVE THE 3,282 STRADDLING CREASE PAIRS?
//
// READ-ONLY archaeology. Nothing under src/ or the driver is touched. The question is not "what is wrong
// with these facets" (S112/S113 answered that: they straddle a crease, and refinement provably cannot fix
// a straddle) but "what did the DRIVER see when it walked past them".
//
// THE INSTRUMENT IS THE DRIVER'S OWN RULER, NOT A NEW ONE. `sagAdaptiveRaw` from research/bridge/_sagKernel.ts
// is the SAME function object the driver calls (`sagAdaptive` at _strataConformBisectL.test.ts:606 is a
// one-line wrapper around it). Running it here on the SHIPPED STL reproduces what the driver believed.
//
// THE CONTROL. The run's own report.txt prints the whole-mesh distribution of exactly this quantity:
//     adaptive oracle (<=0.03mm sample pitch, n in [12,64])
//     MAX 47.230 um   p99 3.425   p50 1.529   over-0.01mm 75/1142166
// If my whole-mesh numbers do not land on those, my ruler is NOT the driver's ruler and every subset
// number below is void. The comparison is PRINTED, not assumed.
//
// Usage: bash research/tools/run-s114-archaeology.sh
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, edgeSagRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { sagAdaptiveRaw, sagOfNRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114_STYLE ?? 'GothicArches';
const STL = process.env.PF_S114_STL ?? '';
const ART = process.env.PF_S114_ART ?? '';          // dir holding *.unresolved.json / *.loci.json / *.run.json
const TAG = process.env.PF_S114_TAG ?? 'gothicarches_ring_DS-HT_S39CTL';
const NDJSON = process.env.PF_S114_NDJSON ?? '';
const TIGHTEN = process.env.PF_S114_TIGHTEN ?? '';
const FULL = process.env.PF_S114_FULL !== '0';      // run the whole-mesh control pass
const DIMS: StyleDims = { H: envF('PF_S114_H', 120), Rb: envF('PF_S114_RB', 40), Rt: envF('PF_S114_RT', 50), expn: 1 };
const H = DIMS.H;

// The driver's own constants, read from the same env names with the same defaults (driver lines 133-159, 567).
const ACCEPT_TOL = envF('PF_CB_ACCEPT', 0.007) / 2; // run.json says acceptTolMm 0.0035 = tol/2; asserted below
const REF_HS = envF('PF_CB_REF_HS', 0.03);
const REF_NMIN = Math.round(envF('PF_CB_REF_NMIN', 12));
const REF_NMAX = Math.round(envF('PF_CB_REF_NMAX', 64));
const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
const SNAP_ALPHA = envF('PF_CB_SNAP_ALPHA', 0.12);

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
const um = (mm: number): string => (mm * 1000).toFixed(3);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
let rEvals = 0;
const rA = (th: number, z: number): number => {
  rEvals += 1;
  return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
};

log('===== S114 — DRIVER ARCHAEOLOGY: what did the mesher SEE at the 3,282 straddling crease pairs? =====');
log(`style ${STYLE}  tag ${TAG}`);
log(`driver constants replayed: acceptTol ${um(ACCEPT_TOL)} um  REF_HS ${REF_HS}mm n in [${REF_NMIN},${REF_NMAX}]  FLOOR ${um(FLOOR_MM)} um  SNAP_ALPHA ${SNAP_ALPHA}`);
log('');

// ───────────────────────── run.json: the flags this mesh was made with ─────────────────────────
const run = JSON.parse(readFileSync(`${ART}/${TAG}.run.json`, 'utf8')) as Record<string, unknown>;
log('--- P2a  run.json: THE FLAGS ---');
for (const k of ['driver', 'rank', 'directed', 'snap', 'reproj', 'tolMm', 'acceptTolMm', 'gridU', 'gridV', 'triCap', 'nTri', 'alloc', 'unresolvedLeft', 'capped', 'timeCapped', 'curtainSites', 'verdict', 'headlineMaxMm', 'secs']) {
  log(`  ${k.padEnd(14)} ${JSON.stringify(run[k])}`);
}
log(`  tighten        ${JSON.stringify(run.tighten)}`);
if (Number(run.acceptTolMm) !== ACCEPT_TOL) {
  log(`*** CONTROL FIRED: run.json acceptTolMm ${run.acceptTolMm} != replayed ${ACCEPT_TOL}. RUN IS VOID. ***`);
  process.exit(4);
}
log('');

// ───────────────────────── mesh ─────────────────────────
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rAbase(canonTheta(Math.atan2(y, x)), z < 0 ? 0 : z > H ? H : z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um)`);
  if (worst * 1000 > 0.05) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
if (nTri !== Number(run.nTri)) { log(`*** CONTROL FIRED: STL ${nTri} != run.json nTri ${run.nTri}. VOID. ***`); process.exit(4); }

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
const area = d.areaMm2;
let meshArea = 0; for (let f = 0; f < nTri; f += 1) meshArea += area[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2  ${el()}`);
log('');

// ───────────────────────── the target set ─────────────────────────
interface Row {
  e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number;
  area1: number; area2: number; z: number; thDeg: number; onEdge: boolean; onSeg: boolean;
}
const rows: Row[] = [];
for (const line of readFileSync(NDJSON, 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  rows.push(JSON.parse(line) as Row);
}
const targetSet = new Set<number>();
for (const r of rows) { targetSet.add(r.f1); targetSet.add(r.f2); }
const target = [...targetSet].sort((a, b) => a - b);
let targetArea = 0; for (const f of target) targetArea += area[f];
log('--- P0  THE TARGET SET (membership NOT re-derived; read from S113 dump) ---');
log(`  pairs ${rows.length}   unique facets ${target.length}   area ${targetArea.toFixed(3)} mm2 = ${((targetArea / meshArea) * 100).toFixed(4)}% of mesh`);
if (rows.length !== 3282 || target.length !== 6193) {
  log(`*** CONTROL FIRED: expected 3282 pairs / 6193 facets, read ${rows.length}/${target.length}. VOID. ***`);
  process.exit(4);
}
{
  const nh = rows.map((r) => r.normHi).sort((a, b) => a - b);
  const q = (p: number): number => nh[Math.min(nh.length - 1, Math.floor(p * nh.length))];
  log(`  orientation (pair normHi, inset 0.05): p50 ${q(0.5).toFixed(2)} deg  p90 ${q(0.9).toFixed(2)}  max ${nh[nh.length - 1].toFixed(2)}`);
}
log('');

// ───────────────────────── the driver's OWN position ruler on the shipped mesh ─────────────────────────
// A soup view: facet f uses corner indices 3f, 3f+1, 3f+2. vth is raw atan2; sagOfNRaw only ever consumes
// vth through dThRaw (shortest arc), so a per-corner raw atan2 reproduces the driver's stored vth exactly.
const NV = nTri * 3;
const vx = new Float64Array(NV); const vy = new Float64Array(NV); const vz = new Float64Array(NV);
const vth = new Float64Array(NV);
for (let i = 0; i < NV; i += 1) {
  vx[i] = xyz[i * 3]; vy[i] = xyz[i * 3 + 1]; vz[i] = xyz[i * 3 + 2];
  vth[i] = Math.atan2(vy[i], vx[i]);
}
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
for (let f = 0; f < nTri; f += 1) { ta[f] = f * 3; tb[f] = f * 3 + 1; tc[f] = f * 3 + 2; }
const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy };
const ARG = makeSagArgmax();
const sagAdaptive = (f: number): number => sagAdaptiveRaw(rA, SAGM, f, REF_HS, REF_NMIN, REF_NMAX, ARG);
const sagFixed12 = (f: number): number => sagOfNRaw(rA, SAGM, f, 12, ARG);

const PRED: SweepPredConst = {
  esN: Math.round(envF('PF_CB_ESN', 8)), refHs: REF_HS, refNmax: REF_NMAX,
  kinkScan: Math.round(envF('PF_CB_KINK_SCAN', 16)), kinkHalvings: Math.round(envF('PF_CB_KINK_HALVINGS', 24)),
  kinkRatio: envF('PF_CB_KINK_RATIO', 0.15), jumpRatio: envF('PF_CB_JUMP_RATIO', 0.62),
  snap: true, confMm: envF('PF_CB_CONF_UM', 0.6) / 1000,
};
const worstEdgeSag = (f: number): number => {
  const a = ta[f]; const b = tb[f]; const c = tc[f];
  let best = 0;
  for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
    const s = edgeSagRaw(rA, vx[p], vy[p], vz[p], vx[q], vy[q], vz[q], vth[p], dThRaw(vth[p], vth[q]), PRED);
    if (s > best) best = s;
  }
  return best;
};
const maxEdge = (f: number): number => {
  const a = ta[f]; const b = tb[f]; const c = tc[f];
  return Math.max(
    Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]),
    Math.hypot(vx[b] - vx[c], vy[b] - vy[c], vz[b] - vz[c]),
    Math.hypot(vx[c] - vx[a], vy[c] - vy[a], vz[c] - vz[a]),
  );
};

function stats(vals: Float64Array | number[], w: Float64Array | number[] | null, label: string): void {
  const n = vals.length;
  const idx = [...Array(n).keys()].sort((i, j) => vals[i] - vals[j]);
  const q = (p: number): number => vals[idx[Math.min(n - 1, Math.floor(p * n))]];
  let mx = 0; for (let i = 0; i < n; i += 1) if (vals[i] > mx) mx = vals[i];
  let line = `  ${label.padEnd(26)} n=${String(n).padStart(8)}  p50 ${um(q(0.5)).padStart(9)}  p90 ${um(q(0.9)).padStart(9)}  p99 ${um(q(0.99)).padStart(9)}  MAX ${um(mx).padStart(10)} um`;
  if (w !== null) {
    let tot = 0; for (let i = 0; i < n; i += 1) tot += w[i];
    let acc = 0; let aq50 = 0; let aq90 = 0;
    for (const i of idx) { acc += w[i]; if (aq50 === 0 && acc >= 0.5 * tot) aq50 = vals[i]; if (aq90 === 0 && acc >= 0.9 * tot) { aq90 = vals[i]; break; } }
    line += `   [AREA-weighted p50 ${um(aq50)}  p90 ${um(aq90)}]`;
  }
  log(line);
}
function overBars(vals: Float64Array | number[], w: Float64Array | number[], bars: number[], totArea: number, label: string): void {
  for (const bar of bars) {
    let c = 0; let a = 0;
    for (let i = 0; i < vals.length; i += 1) if (vals[i] > bar) { c += 1; a += w[i]; }
    log(`  ${label} over ${um(bar).padStart(7)} um: COUNT ${String(c).padStart(8)} (${((c / vals.length) * 100).toFixed(4)}% of set)   AREA ${a.toFixed(4)} mm2 (${((a / totArea) * 100).toFixed(4)}% of set area, ${((a / meshArea) * 100).toFixed(5)}% of mesh)`);
  }
}

// ── the tightening field: was acceptTol locally SMALLER at these facets? (localAcceptTol, driver:2646) ──
interface Cl { x: number; y: number; z: number; tolScale: number }
let clusters: Cl[] = []; let tightenRadius = 0; let tightenMax = 1;
if (TIGHTEN !== '') {
  const tf = JSON.parse(readFileSync(TIGHTEN, 'utf8')) as { tighten: { radiusMm: number; maxScale: number }; clusters: Cl[] };
  clusters = tf.clusters; tightenRadius = tf.tighten.radiusMm;
  tightenMax = Math.min(tf.tighten.maxScale, Number((run.tighten as Record<string, unknown> | null)?.maxScale ?? 1));
}
// VERBATIM the driver's localAcceptTol geometry: centroid + bounding-sphere radius, ball test, clamp at maxScale.
const localAcceptTol = (f: number): number => {
  if (clusters.length === 0) return ACCEPT_TOL;
  const a = ta[f]; const b = tb[f]; const c = tc[f];
  const cx = (vx[a] + vx[b] + vx[c]) / 3; const cy = (vy[a] + vy[b] + vy[c]) / 3; const cz = (vz[a] + vz[b] + vz[c]) / 3;
  const rad = Math.sqrt(Math.max(
    (vx[a] - cx) ** 2 + (vy[a] - cy) ** 2 + (vz[a] - cz) ** 2,
    (vx[b] - cx) ** 2 + (vy[b] - cy) ** 2 + (vz[b] - cz) ** 2,
    (vx[c] - cx) ** 2 + (vy[c] - cy) ** 2 + (vz[c] - cz) ** 2,
  ));
  let s = 1;
  for (const cl of clusters) {
    const dd = Math.hypot(cl.x - cx, cl.y - cy, cl.z - cz);
    if (dd <= tightenRadius + rad) s = Math.max(s, Math.min(tightenMax, cl.tolScale));
  }
  return ACCEPT_TOL / s;
};

// ───────────────────────── P3: position error, target vs whole mesh ─────────────────────────
log('--- P3  THE DRIVER\'S OWN POSITION RULER (sagAdaptive = _sagKernel.sagAdaptiveRaw, THE function the driver calls) ---');
const tSag = new Float64Array(target.length);
const tEdge = new Float64Array(target.length);
const tW = new Float64Array(target.length);
const tAT = new Float64Array(target.length);
const tLen = new Float64Array(target.length);
for (let i = 0; i < target.length; i += 1) {
  const f = target[i];
  tSag[i] = sagAdaptive(f); tEdge[i] = worstEdgeSag(f); tW[i] = area[f]; tAT[i] = localAcceptTol(f); tLen[i] = maxEdge(f);
}
log(`  TARGET SET (${target.length} facets, ${targetArea.toFixed(3)} mm2 = ${((targetArea / meshArea) * 100).toFixed(4)}% of mesh)`);
stats(tSag, tW, 'sagAdaptive (plane key)');
stats(tEdge, tW, 'worstEdgeSag (edge key)');
overBars(tSag, tW, [ACCEPT_TOL, 0.01], targetArea, 'sagAdaptive');
overBars(tEdge, tW, [ACCEPT_TOL, 0.01], targetArea, 'worstEdgeSag');
{
  let overLocal = 0; let overLocalArea = 0; let tightened = 0;
  for (let i = 0; i < target.length; i += 1) {
    if (tAT[i] < ACCEPT_TOL - 1e-12) tightened += 1;
    if (tSag[i] > tAT[i]) { overLocal += 1; overLocalArea += tW[i]; }
  }
  log(`  inside a TIGHTENING ball (localAcceptTol < acceptTol): ${tightened}/${target.length}   over their OWN localAcceptTol: COUNT ${overLocal}  AREA ${overLocalArea.toFixed(4)} mm2 (${((overLocalArea / targetArea) * 100).toFixed(3)}% of set area)`);
  let subFloor = 0; let inBand = 0;
  for (let i = 0; i < target.length; i += 1) if (tLen[i] < FLOOR_MM) subFloor += 1;
  const le = [...tLen].sort((a, b) => a - b);
  log(`  longest edge: p50 ${um(le[Math.floor(le.length / 2)])} um  p90 ${um(le[Math.floor(le.length * 0.9)])} um  MAX ${um(le[le.length - 1])} um   below FLOOR_MM: ${subFloor}   (inBand ${inBand})`);
}
log('');

// ───────────────────────── P3b: the whole-mesh CONTROL ─────────────────────────
if (FULL) {
  log(`--- P3b  WHOLE-MESH CONTROL (same ruler, all ${nTri} facets) — must land on report.txt's 47.230 / 3.425 / 1.529 / 75 ---`);
  const all = new Float64Array(nTri);
  let mx = 0; let mxF = -1; let over10 = 0; let over10Area = 0; let overAccept = 0; let overAcceptArea = 0;
  const t1 = Date.now();
  for (let f = 0; f < nTri; f += 1) {
    const s = sagAdaptive(f); all[f] = s;
    if (s > mx) { mx = s; mxF = f; }
    if (s > 0.01) { over10 += 1; over10Area += area[f]; }
    if (s > ACCEPT_TOL) { overAccept += 1; overAcceptArea += area[f]; }
    if ((f & 0x3FFFF) === 0 && f > 0) log(`   … ${f}/${nTri}  ${((Date.now() - t1) / 1000).toFixed(0)}s  rA ${(rEvals / 1e6).toFixed(0)}M`);
  }
  const srt = Float64Array.from(all).sort();
  const q = (p: number): number => srt[Math.min(nTri - 1, Math.floor(p * nTri))];
  log(`  MESH  p50 ${um(q(0.5))}  p90 ${um(q(0.9))}  p99 ${um(q(0.99))}  MAX ${um(mx)} um  (argmax facet ${mxF})`);
  log(`  MESH  over-0.01mm ${over10}/${nTri}  AREA ${over10Area.toFixed(4)} mm2 (${((over10Area / meshArea) * 100).toFixed(5)}% of mesh)`);
  log(`  MESH  over-acceptTol(${um(ACCEPT_TOL)}um) ${overAccept}/${nTri}  AREA ${overAcceptArea.toFixed(4)} mm2 (${((overAcceptArea / meshArea) * 100).toFixed(5)}% of mesh)`);
  log('  REPORT.TXT SAYS: MAX 47.230  p99 3.425  p50 1.529  over-0.01mm 75/1142166');
  const okMax = Math.abs(mx * 1000 - 47.230) / 47.230 < 0.02;
  const okP50 = Math.abs(q(0.5) * 1000 - 1.529) / 1.529 < 0.05;
  const okP99 = Math.abs(q(0.99) * 1000 - 3.425) / 3.425 < 0.05;
  log(`  CONTROL: MAX ${okMax ? 'MATCH' : '*** MISMATCH ***'}   p50 ${okP50 ? 'MATCH' : '*** MISMATCH ***'}   p99 ${okP99 ? 'MATCH' : '*** MISMATCH ***'}   over-10um ${over10} vs 75`);
  if (!okMax || !okP50 || !okP99) log('  *** IF ANY OF THE THREE MISMATCHED, EVERY SUBSET NUMBER ABOVE IS VOID. ***');
  // ratio of target to mesh, honestly: both count and area
  const srtT = Float64Array.from(tSag).sort();
  const qt = (p: number): number => srtT[Math.min(target.length - 1, Math.floor(p * target.length))];
  log(`  TARGET / MESH position ratio: p50 ${(qt(0.5) / q(0.5)).toFixed(3)}x   p90 ${(qt(0.9) / q(0.9)).toFixed(3)}x   p99 ${(qt(0.99) / q(0.99)).toFixed(3)}x`);
  // Where does the target set sit in the mesh-wide sag distribution? (rank of each target facet)
  let below = 0;
  for (let i = 0; i < target.length; i += 1) {
    // binary search rank of tSag[i] in srt
    let lo = 0; let hi = nTri;
    while (lo < hi) { const md = (lo + hi) >> 1; if (srt[md] < tSag[i]) lo = md + 1; else hi = md; }
    below += lo / nTri;
  }
  log(`  MEAN PERCENTILE of a target facet within the mesh-wide sagAdaptive distribution: ${((below / target.length) * 100).toFixed(2)}th`);
  log('');
  // fixed-12 second ruler on the target set for cross-check
  log('--- P3c  SECOND DRIVER RULER (sagOfN fixed n=12, the report\'s STRATA-comparable oracle) on the target set ---');
  const t12 = new Float64Array(target.length);
  for (let i = 0; i < target.length; i += 1) t12[i] = sagFixed12(target[i]);
  stats(t12, tW, 'sagOfN(12) TARGET');
  overBars(t12, tW, [ACCEPT_TOL, 0.01], targetArea, 'sagOfN(12)');
  log('');
}

// ───────────────────────── P2b: the unresolved list ─────────────────────────
log('--- P2b  CROSS-TAB vs the driver\'s OWN `unresolved` list ---');
interface UF { tri: number; theta: number; z: number; shortUm: number; midUm: number; longUm: number; ar3: number; why: string; keyUm: number; sagNowUm: number; declared: boolean }
const uj = JSON.parse(readFileSync(`${ART}/${TAG}.unresolved.json`, 'utf8')) as { counts: Record<string, number>; facets: UF[] };
log(`  counts ${JSON.stringify(uj.counts)}`);
// Match each unresolved entry to an STL facet by its EXACT emitted key: centroid (theta,z) + sorted edge lengths.
// The driver wrote all six from the f32 values that ship, so the match is a lookup, not a nearest-neighbour guess.
const key3 = (f: number): string => {
  const a = ta[f]; const b = tb[f]; const c = tc[f];
  const e3 = [
    Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]),
    Math.hypot(vx[b] - vx[c], vy[b] - vy[c], vz[b] - vz[c]),
    Math.hypot(vx[c] - vx[a], vy[c] - vy[a], vz[c] - vz[a]),
  ].sort((x, y) => x - y).map((v) => (v * 1000).toFixed(1));
  const cth = canonTheta(Math.atan2((vy[a] + vy[b] + vy[c]) / 3, (vx[a] + vx[b] + vx[c]) / 3)).toFixed(6);
  const cz = ((vz[a] + vz[b] + vz[c]) / 3).toFixed(5);
  return `${cth}|${cz}|${e3[0]}|${e3[1]}|${e3[2]}`;
};
const index = new Map<string, number[]>();
for (let f = 0; f < nTri; f += 1) {
  const k = key3(f);
  const cur = index.get(k); if (cur === undefined) index.set(k, [f]); else cur.push(f);
}
let matched = 0; let ambiguous = 0; let unmatched = 0;
const unresolvedFacets: number[] = [];
for (const u of uj.facets) {
  const k = `${u.theta.toFixed(6)}|${u.z.toFixed(5)}|${u.shortUm.toFixed(1)}|${u.midUm.toFixed(1)}|${u.longUm.toFixed(1)}`;
  const hit = index.get(k);
  if (hit === undefined) { unmatched += 1; continue; }
  if (hit.length > 1) ambiguous += 1;
  matched += 1; unresolvedFacets.push(hit[0]);
}
log(`  matched ${matched}/${uj.facets.length} unresolved entries to STL facets (ambiguous keys ${ambiguous}, unmatched ${unmatched})`);
if (unmatched > uj.facets.length * 0.05) log('  *** CONTROL: >5% unmatched — treat the intersection below as a LOWER BOUND. ***');
const uSet = new Set(unresolvedFacets);
let inBoth = 0; let inBothArea = 0;
for (const f of unresolvedFacets) if (targetSet.has(f)) { inBoth += 1; inBothArea += area[f]; }
let uArea = 0; for (const f of uSet) uArea += area[f];
log(`  unresolved facets located in the STL: ${uSet.size}   AREA ${uArea.toFixed(4)} mm2 (${((uArea / meshArea) * 100).toFixed(5)}% of mesh)`);
log(`  *** INTERSECTION unresolved ∩ TARGET: COUNT ${inBoth} of ${target.length} target facets (${((inBoth / target.length) * 100).toFixed(4)}%)   AREA ${inBothArea.toFixed(5)} mm2 (${((inBothArea / targetArea) * 100).toFixed(4)}% of target area) ***`);
{
  const whys = new Map<string, number>();
  for (const u of uj.facets) whys.set(u.why, (whys.get(u.why) ?? 0) + 1);
  log(`  unresolved reason histogram: ${JSON.stringify([...whys])}`);
}
// PROXIMITY, not just identity: how close is the nearest unresolved facet to a target facet?
{
  const uc: Array<[number, number, number]> = [];
  for (const f of uSet) { const a = ta[f]; const b = tb[f]; const c = tc[f]; uc.push([(vx[a] + vx[b] + vx[c]) / 3, (vy[a] + vy[b] + vy[c]) / 3, (vz[a] + vz[b] + vz[c]) / 3]); }
  const dists: number[] = [];
  for (const f of target) {
    const a = ta[f]; const b = tb[f]; const c = tc[f];
    const cx = (vx[a] + vx[b] + vx[c]) / 3; const cy = (vy[a] + vy[b] + vy[c]) / 3; const cz = (vz[a] + vz[b] + vz[c]) / 3;
    let best = Infinity;
    for (const [ux, uy, uz] of uc) { const dd = (ux - cx) ** 2 + (uy - cy) ** 2 + (uz - cz) ** 2; if (dd < best) best = dd; }
    dists.push(Math.sqrt(best));
  }
  dists.sort((a, b) => a - b);
  log(`  distance from a TARGET facet to the NEAREST unresolved facet (mm): p10 ${dists[Math.floor(dists.length * 0.1)].toFixed(3)}  p50 ${dists[Math.floor(dists.length * 0.5)].toFixed(3)}  p90 ${dists[Math.floor(dists.length * 0.9)].toFixed(3)}  min ${dists[0].toFixed(4)}`);
}
// Is the unresolved∩target set the SAME set as "over its own localAcceptTol"? If it is, the driver's own
// two records agree exactly and there is no third population hiding between them.
{
  const overLocal = new Set<number>();
  for (let i = 0; i < target.length; i += 1) if (tSag[i] > tAT[i]) overLocal.add(target[i]);
  let both = 0; let onlyU = 0; let onlyO = 0;
  for (const f of unresolvedFacets) if (targetSet.has(f)) { if (overLocal.has(f)) both += 1; else onlyU += 1; }
  for (const f of overLocal) if (!uSet.has(f)) onlyO += 1;
  log(`  set identity: (unresolved ∩ target) ∩ (over localAcceptTol) = ${both}   unresolved-only ${onlyU}   over-tol-only ${onlyO}`);
}
// ── SEED SURVIVOR vs REFINEMENT PRODUCT. The STL soup is built by ascending driver triangle id
// (driver:4349 `for (let t = 0; t < ta.length; t += 1) if (alive[t]) soup.push(...)`), and every SEED
// triangle has t < initTris while every child has t >= initTris. So the STL is seed-survivors first,
// children second, and there is a single cut index K. The 774 (tri -> STL index) pairs I just matched
// BRACKET K without any modelling.
{
  const initTris = 254926; // report.txt: "grid 200x140 (254926 init tris)"; CONFORM_FIRST OFF so no pre-seed allocs
  let loSeed = -1; let hiChild = nTri;
  for (let i = 0; i < uj.facets.length; i += 1) {
    const t = uj.facets[i].tri;
    const k = `${uj.facets[i].theta.toFixed(6)}|${uj.facets[i].z.toFixed(5)}|${uj.facets[i].shortUm.toFixed(1)}|${uj.facets[i].midUm.toFixed(1)}|${uj.facets[i].longUm.toFixed(1)}`;
    const hit = index.get(k); if (hit === undefined) continue;
    const f = hit[0];
    if (t < initTris) { if (f > loSeed) loSeed = f; } else if (f < hiChild) hiChild = f;
  }
  log(`  SEED/CHILD cut K bracketed by the 774 matched pairs: last seed-survivor STL index >= ${loSeed}, first child STL index <= ${hiChild}`);
  if (loSeed >= 0 && hiChild < nTri && loSeed < hiChild) {
    let tSeed = 0; let tSeedA = 0; let tChild = 0; let tChildA = 0; let tAmb = 0;
    for (const f of target) {
      if (f <= loSeed) { tSeed += 1; tSeedA += area[f]; } else if (f >= hiChild) { tChild += 1; tChildA += area[f]; } else tAmb += 1;
    }
    log(`  TARGET facets that are SEED SURVIVORS: COUNT ${tSeed} (${((tSeed / target.length) * 100).toFixed(2)}%)  AREA ${tSeedA.toFixed(3)} mm2 (${((tSeedA / targetArea) * 100).toFixed(2)}% of set area)`);
    log(`  TARGET facets that are REFINEMENT PRODUCTS: COUNT ${tChild} (${((tChild / target.length) * 100).toFixed(2)}%)  AREA ${tChildA.toFixed(3)} mm2 (${((tChildA / targetArea) * 100).toFixed(2)}%)   ambiguous (inside the bracket) ${tAmb}`);
    let mSeed = 0; for (let f = 0; f <= loSeed; f += 1) mSeed += 1;
    log(`  CONTROL — whole mesh under the same cut: <=${loSeed} is ${((mSeed / nTri) * 100).toFixed(2)}% of facets (seed survivors are at most that)`);
  } else {
    log('  *** BRACKET DEGENERATE — cannot separate seed survivors from children; report as UNKNOWN. ***');
  }
}
log('');

// ───────────────────────── P4: would SNAP have conformed them, had they been popped? ─────────────────────────
log('--- P4  THE MECHANISM THAT EXISTED BUT WAS NEVER INVOKED: locateKink + SNAP on the target facets\' edges ---');
log('    (heap path: splitEdge() SNAPs to a crease only when the facet is POPPED; a facet accepted by consider() is never popped again)');
{
  let facetsWithKink = 0; let facetsWithSnappable = 0; let facetsAllInBand = 0; let facetsNoKink = 0;
  let aKink = 0; let aSnap = 0; let aBand = 0; let aNone = 0;
  let edgesKink = 0; let edgesSnappable = 0; let edgesInBand = 0; let edgesJump = 0;
  for (const f of target) {
    const A = ta[f]; const B = tb[f]; const C = tc[f];
    let nk = 0; let ns = 0; let nb = 0;
    for (const [p, q] of [[A, B], [B, C], [C, A]] as Array<[number, number]>) {
      const k = locateKinkRaw(rA, vth[p], vz[p], vth[p] + dThRaw(vth[p], vth[q]), vz[q], PRED);
      if (k === null) continue;
      nk += 1; edgesKink += 1;
      if (k.jump) edgesJump += 1;
      if (k.t > SNAP_ALPHA && k.t < 1 - SNAP_ALPHA) { ns += 1; edgesSnappable += 1; }
      else { nb += 1; edgesInBand += 1; }
    }
    if (nk === 0) { facetsNoKink += 1; aNone += area[f]; }
    else {
      facetsWithKink += 1; aKink += area[f];
      if (ns > 0) { facetsWithSnappable += 1; aSnap += area[f]; }
      else { facetsAllInBand += 1; aBand += area[f]; }
    }
  }
  log(`  target facets with >=1 edge carrying a locateKink crease: COUNT ${facetsWithKink} (${((facetsWithKink / target.length) * 100).toFixed(2)}%)  AREA ${aKink.toFixed(3)} mm2 (${((aKink / targetArea) * 100).toFixed(2)}% of set area)`);
  log(`    of which SNAP-PLACEABLE (some crossing at t in (${SNAP_ALPHA}, ${1 - SNAP_ALPHA})): COUNT ${facetsWithSnappable} (${((facetsWithSnappable / target.length) * 100).toFixed(2)}%)  AREA ${aSnap.toFixed(3)} mm2 (${((aSnap / targetArea) * 100).toFixed(2)}%)`);
  log(`    all crossings inside the SNAP_ALPHA end-band (refusal R4): COUNT ${facetsAllInBand}  AREA ${aBand.toFixed(3)} mm2 (${((aBand / targetArea) * 100).toFixed(2)}%)`);
  log(`  target facets with NO locateKink crease on any edge: COUNT ${facetsNoKink} (${((facetsNoKink / target.length) * 100).toFixed(2)}%)  AREA ${aNone.toFixed(3)} mm2 (${((aNone / targetArea) * 100).toFixed(2)}%)`);
  log(`  edges: kink ${edgesKink} of ${target.length * 3}   snap-placeable ${edgesSnappable}   in end-band ${edgesInBand}   jump-class ${edgesJump}`);
}
log('');

// ── P4b: the ONE orientation-aware term in the driver (S20 footBack, PF_CB_ADMIT_NORMAL, DEFAULT OFF).
// Transcribed from _strataConformBisectL.test.ts:1430-1487 so the numbers below say what THAT gate would
// have said. It is a SIGN test (back-facing at centroid AND all three vertices, against the BEST of five
// one-sided analytic normals), not an angle, so the question is simply: would it have fired here?
log('--- P4b  WOULD THE DRIVER\'S ONLY ORIENTATION TERM (S20 footBack) HAVE FLAGGED THEM? (it was OFF; this is the counterfactual) ---');
{
  const ADM_H = 1e-6;
  const admBestDot = (th: number, z: number, fx: number, fy: number, fz: number): number => {
    const r0 = rA(th, z);
    const rTp = rA(th + ADM_H, z); const rTm = rA(th - ADM_H, z);
    const rZp = rA(th, z + ADM_H); const rZm = rA(th, z - ADM_H);
    const ct = Math.cos(th); const st = Math.sin(th);
    const cands: Array<[number, number]> = [
      [(rTp - rTm) / (2 * ADM_H), (rZp - rZm) / (2 * ADM_H)],
      [(rTp - r0) / ADM_H, (rZp - r0) / ADM_H], [(rTp - r0) / ADM_H, (r0 - rZm) / ADM_H],
      [(r0 - rTm) / ADM_H, (rZp - r0) / ADM_H], [(r0 - rTm) / ADM_H, (r0 - rZm) / ADM_H],
    ];
    let best = -Infinity;
    for (const [rt, rz] of cands) {
      const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
      const n = Math.hypot(nx, ny, nz) || 1;
      const dd = (fx * nx + fy * ny + fz * nz) / n;
      if (dd > best) best = dd;
    }
    return best;
  };
  const footBackF = (f: number): boolean => {
    const p = ta[f]; const q = tb[f]; const s = tc[f];
    const px = vx[p]; const py = vy[p]; const pz = vz[p];
    const qx = vx[q]; const qy = vy[q]; const qz = vz[q];
    const sx = vx[s]; const sy = vy[s]; const sz = vz[s];
    let fx = (qy - py) * (sz - pz) - (qz - pz) * (sy - py);
    let fy = (qz - pz) * (sx - px) - (qx - px) * (sz - pz);
    let fz = (qx - px) * (sy - py) - (qy - py) * (sx - px);
    const fl = Math.hypot(fx, fy, fz);
    if (!(fl > 0)) return false;
    fx /= fl; fy /= fl; fz /= fl;
    const cth = canonTheta(Math.atan2((py + qy + sy) / 3, (px + qx + sx) / 3));
    if (admBestDot(cth, (pz + qz + sz) / 3, fx, fy, fz) >= 0) return false;
    if (admBestDot(canonTheta(vth[p]), pz, fx, fy, fz) >= 0) return false;
    if (admBestDot(canonTheta(vth[q]), qz, fx, fy, fz) >= 0) return false;
    if (admBestDot(canonTheta(vth[s]), sz, fx, fy, fz) >= 0) return false;
    return true;
  };
  let c = 0; let a = 0;
  for (const f of target) if (footBackF(f)) { c += 1; a += area[f]; }
  log(`  footBack TRUE on the target set: COUNT ${c} of ${target.length} (${((c / target.length) * 100).toFixed(4)}%)  AREA ${a.toFixed(5)} mm2 (${((a / targetArea) * 100).toFixed(4)}% of set area)`);
  // CONTROL on the whole mesh: without it, "0 on the target set" could just mean the gate never fires anywhere.
  let mc = 0; let ma = 0; const STEP = Math.max(1, Math.floor(nTri / 200000));
  let sampled = 0;
  for (let f = 0; f < nTri; f += STEP) { sampled += 1; if (footBackF(f)) { mc += 1; ma += area[f]; } }
  log(`  CONTROL — every ${STEP}th mesh facet (${sampled} sampled): footBack TRUE COUNT ${mc} (${((mc / sampled) * 100).toFixed(4)}%)  AREA ${ma.toFixed(5)} mm2`);
  if (mc === 0 && c === 0) log('  *** BOTH ZERO: the gate is silent on this mesh, so "0 on the target set" is NOT evidence the gate discriminates. Report as a NULL, not a pass. ***');
}
log('');

// ───────────────────────── P5: THE OTHER HALF OF THE CONTRAST — orientation, same facets ─────────────────────────
// Position above is the DRIVER's ruler. Orientation here is the ANGULAR ruler (orientRuler), per FACET (the
// S113 dump carries it per PAIR). The inset is SWEPT because it is a measurement choice, not a default.
log('--- P5  ORIENTATION on the SAME facets (orientOfFacet, k=8), inset SWEPT, with a random-mesh CONTROL ---');
{
  const nsK = fdNormals(rA, H, 2e-4, 2e-4);
  const sc = new Float64Array(12);
  const normDeg = (f: number, inset: number): number => {
    const A = ta[f]; const B = tb[f]; const C = tc[f];
    const a = Math.atan2(vy[A], vx[A]);
    const b = a + dThRaw(a, Math.atan2(vy[B], vx[B]));
    const c = a + dThRaw(a, Math.atan2(vy[C], vx[C]));
    return orientOfFacet(nsK, vx[A], vy[A], vz[A], vx[B], vy[B], vz[B], vx[C], vy[C], vz[C], a, b, c,
      { k: 8, inset, scratch: sc }).normDeg;
  };
  let seed2 = 987654321;
  const nextR = (): number => { seed2 = (seed2 * 1103515245 + 12345) & 0x7FFFFFFF; return seed2 / 0x7FFFFFFF; };
  const NS = 20000;
  const sample: number[] = [];
  for (let i = 0; i < NS; i += 1) sample.push(Math.floor(nextR() * nTri));
  let sampleArea = 0; for (const f of sample) sampleArea += area[f];
  for (const inset of [0, 0.02, 0.05, 0.1]) {
    const tv = new Float64Array(target.length); const tw = new Float64Array(target.length);
    for (let i = 0; i < target.length; i += 1) { tv[i] = normDeg(target[i], inset); tw[i] = area[target[i]]; }
    const sv = new Float64Array(NS); const sw = new Float64Array(NS);
    for (let i = 0; i < NS; i += 1) { sv[i] = normDeg(sample[i], inset); sw[i] = area[sample[i]]; }
    const qOf = (v: Float64Array, p: number): number => { const s = Float64Array.from(v).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    let tOver = 0; let tOverA = 0; for (let i = 0; i < tv.length; i += 1) if (tv[i] > 45) { tOver += 1; tOverA += tw[i]; }
    let sOver = 0; let sOverA = 0; for (let i = 0; i < NS; i += 1) if (sv[i] > 45) { sOver += 1; sOverA += sw[i]; }
    log(`  inset ${inset.toFixed(2)}  TARGET normDeg p50 ${qOf(tv, 0.5).toFixed(2)}  p90 ${qOf(tv, 0.9).toFixed(2)}  MAX ${qOf(tv, 1).toFixed(2)} deg   over 45deg: COUNT ${tOver} (${((tOver / target.length) * 100).toFixed(2)}%) AREA ${tOverA.toFixed(3)} mm2 (${((tOverA / targetArea) * 100).toFixed(2)}% of set area)`);
    log(`  inset ${inset.toFixed(2)}  CONTROL(${NS} random) p50 ${qOf(sv, 0.5).toFixed(2)}  p90 ${qOf(sv, 0.9).toFixed(2)}  MAX ${qOf(sv, 1).toFixed(2)} deg   over 45deg: COUNT ${sOver} (${((sOver / NS) * 100).toFixed(2)}%) AREA ${sOverA.toFixed(3)} mm2 (${((sOverA / sampleArea) * 100).toFixed(2)}% of sample area)`);
  }
}
log('');

// ───────────────────────── P2c: the loci the driver KNEW about ─────────────────────────
log('--- P2c  CROSS-TAB vs the loci the driver TRACED and SEEDED (loci.json) ---');
const lj = JSON.parse(readFileSync(`${ART}/${TAG}.loci.json`, 'utf8')) as {
  counts: Record<string, number>; seed: Record<string, number>; meta: Record<string, unknown>;
  loci: Array<{ id: number; pts: Array<[number, number]> }>;
};
log(`  counts ${JSON.stringify(lj.counts)}`);
log(`  seed   ${JSON.stringify(lj.seed).slice(0, 500)}`);
// Point-to-SEGMENT distance in (arc,z) with arc = R_REF * dTheta. R_REF = 45 mm, the campaign's parAR reference,
// so this is directly comparable with the parAR column in unresolved.json. FOOTPRINT, not endpoints: the
// polylines are sampled at ~0.6 mm, so a nearest-POINT distance would over-read by up to half that.
const R_REF = 45;
interface Seg { th0: number; z0: number; dth: number; dz: number; len2: number; zmin: number; zmax: number }
const segs: Seg[] = [];
for (const L of lj.loci) {
  for (let i = 0; i + 1 < L.pts.length; i += 1) {
    const [t0, z0] = L.pts[i]; const [t1, z1] = L.pts[i + 1];
    const dth = dThRaw(canonTheta(t0), canonTheta(t1)) * R_REF; const dz = z1 - z0;
    segs.push({ th0: canonTheta(t0), z0, dth, dz, len2: dth * dth + dz * dz, zmin: Math.min(z0, z1) - 1, zmax: Math.max(z0, z1) + 1 });
  }
}
log(`  traced loci ${lj.loci.length}, polyline segments ${segs.length}`);
// z-bucket the segments so the 6,193 x ~10,700 loop stays cheap and EXACT (buckets are padded by 1 mm).
const ZB = 1; const nzb = Math.ceil(H / ZB) + 2;
const buckets: number[][] = Array.from({ length: nzb }, () => []);
for (let s = 0; s < segs.length; s += 1) {
  const lo = Math.max(0, Math.floor(segs[s].zmin / ZB)); const hi = Math.min(nzb - 1, Math.ceil(segs[s].zmax / ZB));
  for (let b = lo; b <= hi; b += 1) buckets[b].push(s);
}
const distToLocus = (th: number, z: number): number => {
  let best = Infinity;
  const b0 = Math.max(0, Math.floor(z / ZB) - 1); const b1 = Math.min(nzb - 1, Math.floor(z / ZB) + 1);
  for (let b = b0; b <= b1; b += 1) for (const s of buckets[b]) {
    const S = segs[s];
    const px = dThRaw(S.th0, th) * R_REF; const pz = z - S.z0;
    let t = S.len2 > 0 ? (px * S.dth + pz * S.dz) / S.len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - t * S.dth; const qz = pz - t * S.dz;
    const dd = qx * qx + qz * qz;
    if (dd < best) best = dd;
  }
  return Math.sqrt(best);
};
{
  const dt: number[] = [];
  for (const f of target) {
    const a = ta[f]; const b = tb[f]; const c = tc[f];
    const cth = canonTheta(Math.atan2((vy[a] + vy[b] + vy[c]) / 3, (vx[a] + vx[b] + vx[c]) / 3));
    const cz = (vz[a] + vz[b] + vz[c]) / 3;
    dt.push(distToLocus(cth, cz));
  }
  dt.sort((a, b) => a - b);
  const qd = (p: number): number => dt[Math.min(dt.length - 1, Math.floor(p * dt.length))];
  log(`  TARGET facet centroid -> nearest TRACED locus (mm, arc at R=45): p10 ${qd(0.1).toFixed(4)}  p50 ${qd(0.5).toFixed(4)}  p90 ${qd(0.9).toFixed(4)}  MAX ${dt[dt.length - 1].toFixed(4)}`);
  // recompute UNSORTED so COUNT and AREA are reported together (never a bare count)
  const dtU: number[] = [];
  for (const f of target) {
    const A = ta[f]; const B = tb[f]; const C = tc[f];
    const cth = canonTheta(Math.atan2((vy[A] + vy[B] + vy[C]) / 3, (vx[A] + vx[B] + vx[C]) / 3));
    const cz = (vz[A] + vz[B] + vz[C]) / 3;
    dtU.push(distToLocus(cth, cz));
  }
  for (const bar of [0.05, 0.1, 0.25, 0.5, 1.0, 2.0]) {
    let ca = 0; let cc = 0;
    for (let i = 0; i < target.length; i += 1) if (dtU[i] <= bar) { cc += 1; ca += area[target[i]]; }
    log(`    within ${bar.toFixed(2)} mm of a traced locus: COUNT ${cc} (${((cc / target.length) * 100).toFixed(2)}%)  AREA ${ca.toFixed(4)} mm2 (${((ca / targetArea) * 100).toFixed(2)}% of set area)`);
  }
  // CONTROL: the same measurement on a RANDOM sample of the whole mesh. Without it "82% within 0.25mm"
  // means nothing — the loci may simply be everywhere.
  const rnd: number[] = [];
  let seed = 12345;
  const nextR = (): number => { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return seed / 0x7FFFFFFF; };
  const NS = 20000;
  for (let i = 0; i < NS; i += 1) {
    const f = Math.floor(nextR() * nTri);
    const A = ta[f]; const B = tb[f]; const C = tc[f];
    const cth = canonTheta(Math.atan2((vy[A] + vy[B] + vy[C]) / 3, (vx[A] + vx[B] + vx[C]) / 3));
    const cz = (vz[A] + vz[B] + vz[C]) / 3;
    rnd.push(distToLocus(cth, cz));
  }
  rnd.sort((a, b) => a - b);
  const qr = (p: number): number => rnd[Math.min(rnd.length - 1, Math.floor(p * rnd.length))];
  log(`  CONTROL — ${NS} RANDOM mesh facets -> nearest traced locus (mm): p10 ${qr(0.1).toFixed(4)}  p50 ${qr(0.5).toFixed(4)}  p90 ${qr(0.9).toFixed(4)}`);
  for (const bar of [0.05, 0.25, 1.0]) {
    let c = 0; for (const v of rnd) if (v <= bar) c += 1;
    log(`    CONTROL within ${bar.toFixed(2)} mm: ${((c / NS) * 100).toFixed(2)}%`);
  }
}
log('');
log(`DONE ${el()}  rA evals ${(rEvals / 1e6).toFixed(1)}M`);
