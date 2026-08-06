// revS113SplitReach.ts — ADVERSARIAL AUDIT of S113-OP2 (the targeted conform split).
//
// LENS: is the operator SILENTLY SKIPPING splittable cases, DOUBLE-COUNTING area, or reporting COUNT
// where AREA disagrees?
//
// The whole refutation reduces to ONE number: the operator's REACH. Untouched class facets pass through
// byte-identical, so the class-wide ratio is bounded above by
//        CEILING = beforeOverArea / (beforeOverArea - reachOverArea)
// If the reach is honest, no retriangulation, no placebo and no ruler subtlety can rescue the operator.
// So this tool measures the reach with an INDEPENDENT instrument:
//   * UNIFORM dense grid on every class-facet edge (no adaptive bracketing, no bracket-tied step),
//   * FIXED finite-difference step (fdNormalsCentral, hArc=hZ=2e-4 mm) instead of a step that shrinks to
//     1e-7 mm — the regime where FD noise, if any, would live,
//   * decision by MAX CONSECUTIVE GAP over the grid instead of open-bracket + 60 refinement levels.
// If S113-OP2's scanner were dropping interior crossings, this grid finds facets it did not reach.
//
// It also (a) re-reads the BEFORE angular numbers with an explicit inset sweep and my own theta unwrap,
// (b) checks the class area straight off the STL rather than the ndjson `area` field (double-count test),
// (c) quantifies what an UNWRAPPED-vs-RAW theta does to the same reading,
// (d) for the facets NO edge-split can reach, reports orientOfFacet's own `spreadRad` — how much the
//     SURFACE turns inside the footprint — which says whether the crease is in there at all.
//
// Usage: bash research/tools/run-rev-s113-reach.sh
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals, fdNormalsCentral, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const NDJ = process.env.PF_REV_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const META = NDJ.replace(/\.ndjson$/, '.meta.json');
const LEG = process.env.PF_REV_LEGALITY ?? 'research/exchange/_strataConformBisect/straddle/S113A_LEGALITY_GOTH.ndjson';
const STL = process.env.PF_REV_STL ?? '';
const STYLE = process.env.PF_REV_STYLE ?? 'GothicArches';
const DIMS: StyleDims = { H: envF('PF_REV_H', 120), Rb: envF('PF_REV_RB', 40), Rt: envF('PF_REV_RT', 50), expn: 1 };
const H = DIMS.H;
const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
const BAR_DEG = envF('PF_REV_BAR', 45);
const K = Math.round(envF('PF_REV_K', 8));
const STEP_MM = envF('PF_REV_STEP', 0.0005);      // uniform grid step target, mm
const M_MIN = Math.round(envF('PF_REV_MMIN', 512));
const M_MAX = Math.round(envF('PF_REV_MMAX', 4096));
const JUMP_BARS = (process.env.PF_REV_JUMPS ?? '10,45,90').split(',').map(Number);
const JUMP_PRIMARY = envF('PF_REV_JUMP', 45);

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const dist = (v: number[], f = 4): string => (v.length === 0 ? '(empty)'
  : `min ${q(v, 0).toFixed(f)} p10 ${q(v, 0.1).toFixed(f)} p50 ${q(v, 0.5).toFixed(f)} p90 ${q(v, 0.9).toFixed(f)} max ${q(v, 0.999999).toFixed(f)}`);
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
const triArea = (t: ArrayLike<number>, o = 0): number => {
  const ux = t[o + 3] - t[o]; const uy = t[o + 4] - t[o + 1]; const uz = t[o + 5] - t[o + 2];
  const wx = t[o + 6] - t[o]; const wy = t[o + 7] - t[o + 1]; const wz = t[o + 8] - t[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};

log('===== REV-S113 — ADVERSARIAL AUDIT OF THE CONFORM SPLIT (reach / area / count-vs-area) =====');
log(`ndjson ${NDJ}`);
log(`independent scanner: UNIFORM grid step<=${STEP_MM} mm (M in [${M_MIN},${M_MAX}]), FIXED fd step 2e-4 mm, jump bar ${JUMP_PRIMARY} deg`);
log(`angular ruler: orientOfFacet k=${K}, winding, inset EXPLICIT and swept`);
log('');

// ── the pinned set, rebuilt independently ───────────────────────────────────────────────────────────────
interface Row { e: number; f1: number; f2: number; normHi: number; area1: number; area2: number; tri1: number[]; tri2: number[] }
const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
const meta = JSON.parse(readFileSync(META, 'utf8')) as { meshAreaMm2: number; uniqueFacets: number; targetAreaMm2: number; meshFacets: number };
log(`${rows.length} pairs read (pinned 3282)`);
if (STL === '') { log('*** no PF_REV_STL — REFUSING. ***'); process.exit(4); }
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
const meshArea = meta.meshAreaMm2;

const fIdx: number[] = [];
const seenF = new Set<number>();
let dupRows = 0;
for (const r of rows) for (const f of [r.f1, r.f2]) {
  if (seenF.has(f)) { dupRows += 1; continue; }
  seenF.add(f); fIdx.push(f);
}
log('── CONTROL A: membership + AREA taken from the STL, NOT from the ndjson area field ──');
log(`  unique facets ${fIdx.length} (pinned ${meta.uniqueFacets})  ${fIdx.length === meta.uniqueFacets ? 'OK' : '*** DRIFT ***'}`);
log(`  facet appearances that were repeats (a naive sum would double-count these): ${dupRows}`);
let classAreaSTL = 0; for (const f of fIdx) classAreaSTL += triArea(xyz, f * 9);
let classAreaNDJ = 0;
{
  const seen = new Set<number>();
  for (const r of rows) {
    if (!seen.has(r.f1)) { seen.add(r.f1); classAreaNDJ += r.area1; }
    if (!seen.has(r.f2)) { seen.add(r.f2); classAreaNDJ += r.area2; }
  }
}
let naiveArea = 0; for (const r of rows) naiveArea += r.area1 + r.area2;
log(`  class AREA from STL coords          ${classAreaSTL.toFixed(6)} mm2 = ${((classAreaSTL / meshArea) * 100).toFixed(4)}% of mesh`);
log(`  class AREA from ndjson area fields  ${classAreaNDJ.toFixed(6)} mm2   (pinned ${meta.targetAreaMm2.toFixed(6)})`);
log(`  NAIVE per-ROW sum (the double-count trap) ${naiveArea.toFixed(6)} mm2 = ${(naiveArea / classAreaSTL).toFixed(3)}x the true class area`);
const CTRLA = fIdx.length === meta.uniqueFacets && Math.abs(classAreaSTL - meta.targetAreaMm2) < 1e-6;
log(`  CONTROL A ${CTRLA ? 'PASS' : '*** FIRED ***'}`);
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  const rAb0 = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
  const rA0 = (th: number, z: number): number => rAb0(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA0(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`  PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um (must read 0.0310)`);
}
log('');

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// ── PART A: the BEFORE reading, replicated. Explicit inset, my own unwrap, and a NO-UNWRAP control ──────
const nsKink: NormalSampler = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);
function orientOf(t: ArrayLike<number>, o: number, inset: number, unwrap: boolean): { normDeg: number; spreadDeg: number } {
  const a = Math.atan2(t[o + 1], t[o]);
  const b = unwrap ? a + dThRaw(a, Math.atan2(t[o + 4], t[o + 3])) : Math.atan2(t[o + 4], t[o + 3]);
  const c = unwrap ? a + dThRaw(a, Math.atan2(t[o + 7], t[o + 6])) : Math.atan2(t[o + 7], t[o + 6]);
  const r = orientOfFacet(nsKink, t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8], a, b, c, { k: K, inset, scratch });
  return { normDeg: r.normDeg, spreadDeg: (r.spreadRad * 180) / Math.PI };
}
interface Agg { n: number; area: number; max: number; totN: number; totArea: number; wMean: number }
const emptyAgg = (): Agg => ({ n: 0, area: 0, max: 0, totN: 0, totArea: 0, wMean: 0 });
const bump = (g: Agg, deg: number, area: number): void => {
  g.totN += 1; g.totArea += area; g.wMean += area * (Number.isFinite(deg) ? deg : 0);
  if (Number.isFinite(deg) && deg > BAR_DEG) { g.n += 1; g.area += area; }
  if (Number.isFinite(deg) && deg > g.max) g.max = deg;
};
const fmt = (g: Agg): string => `COUNT ${g.n}  AREA ${g.area.toFixed(4)} mm2 = ${((g.area / g.totArea) * 100).toFixed(2)}% of region (${((g.area / meshArea) * 100).toFixed(4)}% of mesh)  MAX ${g.max.toFixed(2)} deg  [region ${g.totN} / ${g.totArea.toFixed(4)} mm2, area-wtd mean ${(g.wMean / g.totArea).toFixed(2)} deg]`;

log('── PART A: the BEFORE reading, replicated independently (COUNT + AREA + MAX together) ──');
const areaOf = new Map<number, number>();
for (const f of fIdx) areaOf.set(f, triArea(xyz, f * 9));
const normAt05 = new Map<number, number>();
const spreadAt05 = new Map<number, number>();
for (const inset of [0, 0.02, 0.05]) {
  const g = emptyAgg();
  for (const f of fIdx) {
    const o = orientOf(xyz, f * 9, inset, true);
    bump(g, o.normDeg, areaOf.get(f) as number);
    if (inset === 0.05) { normAt05.set(f, o.normDeg); spreadAt05.set(f, o.spreadDeg); }
  }
  log(`  inset ${inset}  over ${BAR_DEG}deg: ${fmt(g)}`);
}
{
  const gU = emptyAgg(); const gR = emptyAgg(); let nDiff = 0; let worst = 0;
  for (const f of fIdx) {
    const a = orientOf(xyz, f * 9, 0.05, true).normDeg;
    const b = orientOf(xyz, f * 9, 0.05, false).normDeg;
    bump(gU, a, areaOf.get(f) as number); bump(gR, b, areaOf.get(f) as number);
    if (Math.abs(a - b) > 1e-9) { nDiff += 1; worst = Math.max(worst, Math.abs(a - b)); }
  }
  log(`  THETA UNWRAP CHECK (inset 0.05): unwrapped ${fmt(gU)}`);
  log(`                                   RAW atan2 ${fmt(gR)}`);
  log(`    facets whose reading moves when the unwrap is removed: ${nDiff}  max move ${worst.toFixed(4)} deg`);
  log(`    => the audited tool DOES unwrap (a + dThRaw(a,.)); this quantifies what that choice is worth here.`);
}
log(`  ${el()}`);
log('');

// ── PART B: THE INDEPENDENT REACH PROBE ────────────────────────────────────────────────────────────────
// A UNIFORM grid on every class-facet edge, a FIXED fd step, max-consecutive-gap decision. No brackets,
// no refinement, no shrinking h. If S113-OP2's adaptive scanner dropped interior crossings, this finds them.
const nsFix: NormalSampler = fdNormalsCentral(rA, H, 2e-4, 2e-4);
const nA = new Float64Array(3); const nB = new Float64Array(3);
const angBetween = (p: Float64Array, r: Float64Array): number => {
  let d = p[0] * r[0] + p[1] * r[1] + p[2] * r[2];
  d = d > 1 ? 1 : d < -1 ? -1 : d;
  return (Math.acos(d) * 180) / Math.PI;
};
const keyOf = (o: number): string => `${xyz[o]},${xyz[o + 1]},${xyz[o + 2]}`;
interface EdgeJump { distLoMm: number; distHiMm: number; gapDeg: number; sMid: number }
interface EdgeRec { lenMm: number; jumps: EdgeJump[]; maxGap: number; facets: number[]; corner: number[] }
const edges = new Map<string, EdgeRec>();
for (const f of fIdx) {
  for (let k = 0; k < 3; k += 1) {
    const j = (k + 1) % 3;
    const a = keyOf(f * 9 + k * 3); const b = keyOf(f * 9 + j * 3);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const e = edges.get(key);
    if (e === undefined) {
      const ax = xyz[f * 9 + k * 3]; const ay = xyz[f * 9 + k * 3 + 1]; const az = xyz[f * 9 + k * 3 + 2];
      const bx = xyz[f * 9 + j * 3]; const by = xyz[f * 9 + j * 3 + 1]; const bz = xyz[f * 9 + j * 3 + 2];
      edges.set(key, { lenMm: Math.hypot(bx - ax, by - ay, bz - az), jumps: [], maxGap: 0, facets: [f], corner: [k] });
    } else { e.facets.push(f); e.corner.push(k); }
  }
}
log('── PART B: INDEPENDENT REACH PROBE (uniform grid, fixed fd step, max-consecutive-gap) ──');
log(`  unique class edges ${edges.size}  (audited tool read 13606)`);
let scanned = 0; let totalSamples = 0;
for (const [key, e] of edges) {
  const [ak, bk] = key.split('|');
  const [axs, ays, azs] = ak.split(',').map(Number);
  const [bxs, bys, bzs] = bk.split(',').map(Number);
  if (!(e.lenMm > 0)) continue;
  const Mn = Math.min(M_MAX, Math.max(M_MIN, Math.ceil(e.lenMm / STEP_MM)));
  const thA = Math.atan2(ays, axs);
  const thB = thA + dThRaw(thA, Math.atan2(bys, bxs));
  const dth = thB - thA; const dz = bzs - azs;
  let prevOk = false; let prevGapDeg = 0;
  for (let i = 0; i <= Mn; i += 1) {
    const t = i / Mn;
    nsFix(thA + dth * t, azs + dz * t, i % 2 === 0 ? nA : nB);
    if (i === 0) { prevOk = true; continue; }
    const cur = i % 2 === 0 ? nA : nB; const prv = i % 2 === 0 ? nB : nA;
    const g = angBetween(prv, cur);
    if (g > e.maxGap) e.maxGap = g;
    if (g >= JUMP_BARS[0]) {
      const lo = (i - 1) / Mn; const hi = i / Mn;
      e.jumps.push({
        distLoMm: Math.min(lo, 1 - hi) * e.lenMm,
        distHiMm: Math.min(hi, 1 - lo) * e.lenMm,
        gapDeg: g, sMid: 0.5 * (lo + hi),
      });
    }
    prevGapDeg = g; prevOk = prevOk && Number.isFinite(prevGapDeg);
  }
  totalSamples += Mn + 1;
  scanned += 1;
  if (scanned % 4000 === 0) log(`    ... ${scanned}/${edges.size} edges  ${el()}`);
}
log(`  scanned ${scanned} edges, ${totalSamples} normal samples  ${el()}`);
{
  const gaps: number[] = []; const dlo: number[] = [];
  for (const e of edges.values()) for (const jp of e.jumps) { gaps.push(jp.gapDeg); dlo.push(jp.distLoMm); }
  log(`  jump events over ${JUMP_BARS[0]} deg: ${gaps.length};  gap deg ${dist(gaps, 2)}`);
  for (const B of JUMP_BARS) {
    const sel = edges.size === 0 ? [] : [...edges.values()].flatMap((e) => e.jumps.filter((jp) => jp.gapDeg >= B));
    const near = sel.filter((jp) => jp.distLoMm < FLOOR_MM).length;
    log(`    bar ${String(B).padStart(3)} deg: ${String(sel.length).padStart(6)} jumps;  within ${FLOOR_MM}mm of an endpoint (LOWER bound) ${String(near).padStart(6)} = ${((near / Math.max(1, sel.length)) * 100).toFixed(1)}%  (audited tool: 90.0%)`);
  }
  log(`  distance-to-nearest-endpoint (lower bound) of every over-${JUMP_BARS[0]}deg jump, mm: ${dist(dlo, 6)}`);
}

// per-facet reachability by MY scanner
const reach = new Set<number>();      // has an interior jump (>= FLOOR_MM from both endpoints, LOWER bound)
const reach5 = new Set<number>();     // the same with a 5 um margin — deliberately GENEROUS to the operator
for (const e of edges.values()) {
  for (const jp of e.jumps) {
    if (jp.gapDeg < JUMP_PRIMARY) continue;
    if (jp.distLoMm >= FLOOR_MM) for (const f of e.facets) reach.add(f);
    if (jp.distLoMm >= 0.005) for (const f of e.facets) reach5.add(f);
  }
}
const areaOfSet = (S: Set<number>): number => { let a = 0; for (const f of S) a += areaOf.get(f) as number; return a; };
const overAreaOfSet = (S: Set<number>): { n: number; area: number; max: number } => {
  let n = 0; let area = 0; let max = 0;
  for (const f of S) { const d = normAt05.get(f) as number; if (d > BAR_DEG) { n += 1; area += areaOf.get(f) as number; } if (d > max) max = d; }
  return { n, area, max };
};
const gClass = emptyAgg();
for (const f of fIdx) bump(gClass, normAt05.get(f) as number, areaOf.get(f) as number);
log('');
log(`  MY REACHABLE SET (jump >= ${JUMP_PRIMARY} deg, >= ${FLOOR_MM}mm from BOTH endpoints):`);
{
  const oa = overAreaOfSet(reach);
  log(`    COUNT ${reach.size} facets = ${((reach.size / fIdx.length) * 100).toFixed(2)}% by count;  AREA ${areaOfSet(reach).toFixed(4)} mm2 = ${((areaOfSet(reach) / classAreaSTL) * 100).toFixed(2)}% of the class AREA`);
  log(`    of which over ${BAR_DEG}deg: COUNT ${oa.n}  AREA ${oa.area.toFixed(4)} mm2  MAX ${oa.max.toFixed(2)} deg`);
  log(`    AUDITED TOOL reached 741 facets (11.97% by count) / 7.0389 mm2 (10.08% of class AREA), over-bar 6.6538 mm2`);
  log(`    ==> CEILING on the class-wide ratio if EVERY reachable facet went to ZERO over-bar area:`);
  log(`        mine  ${gClass.area.toFixed(4)} / (${gClass.area.toFixed(4)} - ${oa.area.toFixed(4)}) = ${(gClass.area / Math.max(1e-12, gClass.area - oa.area)).toFixed(3)}x   (kill line 2.0x)`);
  log(`        tool  40.5001 / (40.5001 - 6.6538) = ${(40.5001 / (40.5001 - 6.6538)).toFixed(3)}x`);
}
{
  const oa = overAreaOfSet(reach5);
  log(`  SAME with a GENEROUS 5 um margin: COUNT ${reach5.size}  AREA ${areaOfSet(reach5).toFixed(4)} mm2 (${((areaOfSet(reach5) / classAreaSTL) * 100).toFixed(2)}% of class);  over-bar AREA ${oa.area.toFixed(4)} mm2 => ceiling ${(gClass.area / Math.max(1e-12, gClass.area - oa.area)).toFixed(3)}x`);
}
log('');

// ── PART C: the facets NO edge split can reach — is the crease even inside them? ────────────────────────
log('── PART C: the UNREACHABLE facets. spreadDeg = how much the SURFACE turns inside the footprint ──');
{
  const un = fIdx.filter((f) => !reach.has(f));
  const spr = un.map((f) => spreadAt05.get(f) as number);
  let sprOverN = 0; let sprOverA = 0; let unA = 0; let unOverA = 0; let unOverN = 0;
  for (const f of un) {
    const a = areaOf.get(f) as number; unA += a;
    if ((spreadAt05.get(f) as number) > BAR_DEG) { sprOverN += 1; sprOverA += a; }
    if ((normAt05.get(f) as number) > BAR_DEG) { unOverN += 1; unOverA += a; }
  }
  log(`  unreachable ${un.length} facets  ${unA.toFixed(4)} mm2 = ${((unA / classAreaSTL) * 100).toFixed(2)}% of the class AREA`);
  log(`    their over-${BAR_DEG}deg normDeg: COUNT ${unOverN}  AREA ${unOverA.toFixed(4)} mm2 = ${((unOverA / gClass.area) * 100).toFixed(2)}% of ALL the class's over-bar area`);
  log(`    their spreadDeg: ${dist(spr, 2)}`);
  log(`    spreadDeg over ${BAR_DEG}deg: COUNT ${sprOverN}  AREA ${sprOverA.toFixed(4)} mm2 = ${((sprOverA / unA) * 100).toFixed(2)}% of the unreachable area`);
  log('    (a LARGE spread on a facet with NO interior edge crossing means the crease IS inside the footprint');
  log('     while entering/leaving at the VERTICES — a curved crease bowing off the chord. An edge SPLIT');
  log('     cannot reach that; only moving/adding geometry off the existing edges can.)');
}
log('');

// ── PART D: cross-tab my reach against S113-A's legality classes ───────────────────────────────────────
{
  const cls = new Map<number, string>();
  for (const l of readFileSync(LEG, 'utf8').split('\n')) {
    if (l.length < 3) continue;
    const o = JSON.parse(l) as { f: number; cls: string };
    cls.set(o.f, o.cls);
  }
  const tab = new Map<string, { n: number; area: number; r: number; rArea: number; overArea: number }>();
  for (const f of fIdx) {
    const c = cls.get(f) ?? '(absent)';
    const b = tab.get(c) ?? { n: 0, area: 0, r: 0, rArea: 0, overArea: 0 };
    const a = areaOf.get(f) as number;
    b.n += 1; b.area += a;
    if ((normAt05.get(f) as number) > BAR_DEG) b.overArea += a;
    if (reach.has(f)) { b.r += 1; b.rArea += a; }
    tab.set(c, b);
  }
  log('── PART D: MY reach cross-tabbed against S113-A legality (COUNT and AREA side by side) ──');
  for (const [c, b] of [...tab.entries()].sort((x, y) => y[1].area - x[1].area)) {
    log(`  ${c.padEnd(16)} ${String(b.n).padStart(5)} facets ${b.area.toFixed(4).padStart(9)} mm2  over-bar ${b.overArea.toFixed(4).padStart(9)} mm2   MY reach ${String(b.r).padStart(5)} = ${((b.rArea / b.area) * 100).toFixed(1)}% of their area`);
  }
}
log('');
log(`done ${el()}`);
