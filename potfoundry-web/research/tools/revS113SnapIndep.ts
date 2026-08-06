// revS113SnapIndep.ts — ADVERSARIAL REVIEW of S113OP_SNAP. Independent, NON-BISECTION crease locator.
//
// WHAT THIS EXISTS TO SETTLE
// The snap refutation's mechanism rests on one inference the author flagged as un-cross-checked:
//   "60.9% of located crossings (3,466 of 5,687) sit at a bisection endpoint (s<=1e-4 or >=1-1e-4).
//    I read that as 'the crease passes through a mesh vertex'."
// The competing explanation is locateTurnAdaptive's KNOWN UNPATCHED tie-break defect (orientRuler.ts:529)
// walking the bracket to an end. If the defect is the cause, the snap's plans were no-ops for the wrong
// reason, 43.13% of the target AREA was never actually attempted, and the refutation is a refutation of a
// broken implementation rather than of the operator.
//
// THE INDEPENDENT INSTRUMENT (no bisection anywhere in it)
// Along each edge, sample the ANALYTIC normal at N+1 uniform parameter points and take the angle between
// CONSECUTIVE normals. A crease shows up as ONE interval carrying almost all of the turning. argmax of that
// sequence localises the crease to +-1/N of the edge with no bracket, no tie-break and no search. This is a
// FOOTPRINT probe (N=512 samples), not a 2-point probe.
//   Positive control: on edges where the bisection reports an INTERIOR s, the two locators must AGREE.
//   Negative control: on random ordinary facets the sequence must be flat (no dominant interval).
//
// PHASE D tests the second half of the mechanism claim — "the crease runs from that vertex ACROSS THE
// INTERIOR" — with orientOfFacet's spreadRad at inset 0.05 EXPLICIT (interior only, collar excluded).
//
// DISCIPLINE: every population is COUNT + AREA-share + MAX. inset is passed EXPLICITLY. theta is unwrapped
// onto one branch with dThRaw before every orientOfFacet call. Nothing under src/ or the driver is touched.
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, fdNormalsCentral, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJSON = process.env.PF_S113_SET
  ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const K = Math.round(envF('PF_S113_K', 8));
const TURN_THR_DEG = envF('PF_S113_TURN', 30);
const NSAMP = Math.round(envF('PF_REV_N', 512));
const SUB = Math.round(envF('PF_REV_SUB', 900));
const DIMS: StyleDims = { H: envF('PF_S113_H', 120), Rb: envF('PF_S113_RB', 40), Rt: envF('PF_S113_RT', 50), expn: 1 };
const H = DIMS.H;

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => { let m = -Infinity; for (const x of v) if (x > m) m = x; return m; };

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== REV S113-SNAP — INDEPENDENT (NON-BISECTION) CREASE LOCATOR =====');
log(`style ${STYLE}  K ${K}  turnThr ${TURN_THR_DEG} deg  dense-probe N ${NSAMP}  subsample cap ${SUB}`);
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d0 = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d0.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2  ${el()}`);

interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row { e: number; f1: number; f2: number; measDeg: number; locs: Loc[] }
const rows: Row[] = readFileSync(NDJSON, 'utf8').trim().split('\n').map((L) => JSON.parse(L) as Row);
const uniqF: number[] = [...new Set(rows.flatMap((r) => [r.f1, r.f2]))].sort((a, b) => a - b);
let targetArea = 0;
for (const f of uniqF) targetArea += d0.areaMm2[f];
log(`target set: ${rows.length} pairs, ${uniqF.length} unique facets, AREA ${targetArea.toFixed(3)} mm2 (${((targetArea / meshArea) * 100).toFixed(4)}%)`);

// ── geometry, theta UNWRAPPED onto one branch (dThRaw), same as every other tool here ──────────────
const th3 = (f: number): [number, number, number] => {
  const t = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = t + dThRaw(t, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = t + dThRaw(t, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [t, b, c];
};
const rRefOf = (f: number): number => (
  Math.hypot(xyz[f * 9], xyz[f * 9 + 1]) + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])
) / 3;

/**
 * THE INDEPENDENT LOCATOR. N+1 analytic normals along the edge; the angle between CONSECUTIVE normals.
 * A crease concentrates the turning into ONE interval; argmax localises it to +-1/N. No bracket, no
 * tie-break, no search — structurally incapable of the orientRuler.ts:529 defect.
 * The finite-difference step is tied to the SAMPLE SPACING (len/(4N)) so neighbouring windows do not
 * overlap and a single crease cannot smear across several intervals.
 */
function denseTurn(ath: number, az: number, bth: number, bz: number, rRef: number, n: number): {
  sStar: number; dMaxDeg: number; totalDeg: number; share: number; kStar: number; d0Deg: number; dNDeg: number;
} {
  const lenMm = Math.hypot(rRef * (bth - ath), bz - az);
  const h = Math.max(1e-9, lenMm / (4 * n));
  const ns = fdNormalsCentral(rA, H, h, h);
  const sc = new Float64Array(12);
  const nx = new Float64Array(n + 1); const ny = new Float64Array(n + 1); const nz = new Float64Array(n + 1);
  for (let k = 0; k <= n; k += 1) {
    const s = k / n;
    ns(ath + (bth - ath) * s, az + (bz - az) * s, sc);
    nx[k] = sc[0]; ny[k] = sc[1]; nz[k] = sc[2];
  }
  let total = 0; let dmax = -1; let kStar = 0; let dFirst = 0; let dLast = 0;
  for (let k = 0; k < n; k += 1) {
    let d = nx[k] * nx[k + 1] + ny[k] * ny[k + 1] + nz[k] * nz[k + 1];
    d = d > 1 ? 1 : d < -1 ? -1 : d;
    const a = Math.acos(d);
    total += a;
    if (k === 0) dFirst = a;
    if (k === n - 1) dLast = a;
    if (a > dmax) { dmax = a; kStar = k; }
  }
  const R = 180 / Math.PI;
  return {
    sStar: (kStar + 0.5) / n, dMaxDeg: dmax * R, totalDeg: total * R,
    share: total > 0 ? dmax / total : 0, kStar, d0Deg: dFirst * R, dNDeg: dLast * R,
  };
}

// ── rebuild the bisection locators exactly as the snap tool does (same call, same iters) ───────────
interface EdgeRec {
  f: number; ei: number; sBis: number; turnBis: number; area: number;
  ath: number; az: number; bth: number; bz: number; rRef: number; lenMm: number;
}
const edges: EdgeRec[] = [];
for (const f of uniqF) {
  const [ath, bth, cth] = th3(f);
  const ths = [ath, bth, cth];
  const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  const rRef = rRefOf(f);
  for (let ei = 0; ei < 3; ei += 1) {
    const j = (ei + 1) % 3;
    const lt = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[j], zs[j], rRef, 14);
    const turnDeg = (lt.turn * 180) / Math.PI;
    if (turnDeg <= TURN_THR_DEG) continue;
    edges.push({
      f, ei, sBis: lt.s, turnBis: turnDeg, area: d0.areaMm2[f],
      ath: ths[ei], az: zs[ei], bth: ths[j], bz: zs[j], rRef,
      lenMm: Math.hypot(rRef * (ths[j] - ths[ei]), zs[j] - zs[ei]),
    });
  }
}
const END = 1e-4;
const pinned = edges.filter((e) => e.sBis <= END || e.sBis >= 1 - END);
const interior = edges.filter((e) => e.sBis > END && e.sBis < 1 - END);
log('');
log('══ REPRODUCTION OF THE CLAIM UNDER TEST ══');
log(`  large-turn (>${TURN_THR_DEG} deg) edge crossings: ${edges.length}   (snap tool printed 5687)`);
log(`  pinned at a bisection END (s<=1e-4 or >=1-1e-4): ${pinned.length} (${((pinned.length / edges.length) * 100).toFixed(1)}%)   (snap tool printed 3466 = 60.9%)`);
log(`  strictly interior: ${interior.length} (${((interior.length / edges.length) * 100).toFixed(1)}%)`);
log(`  ${el()}`);

const pick = <T>(a: T[], n: number): T[] => (a.length <= n ? a : a.filter((_, i) => i % Math.ceil(a.length / n) === 0).slice(0, n));

// ── PHASE A — the POSITIVE CONTROL first. If the dense probe cannot reproduce an interior crossing the
//    bisection found, it has no standing to contradict the bisection anywhere else. ─────────────────
{
  const sub = pick(interior, SUB);
  const ds: number[] = []; const dsMm: number[] = []; const shares: number[] = [];
  let agree = 0;
  for (const e of sub) {
    const t = denseTurn(e.ath, e.az, e.bth, e.bz, e.rRef, NSAMP);
    const d = Math.abs(t.sStar - e.sBis);
    ds.push(d); dsMm.push(d * e.lenMm * 1000); shares.push(t.share);
    if (d <= 2 / NSAMP) agree += 1;
  }
  log('');
  log(`══ PHASE A — POSITIVE CONTROL: dense probe vs bisection on ${sub.length} INTERIOR crossings ══`);
  log(`  |s_dense - s_bisect|:  p50 ${q(ds, 0.5).toExponential(2)}  p90 ${q(ds, 0.9).toExponential(2)}  MAX ${mx(ds).toExponential(2)}   (probe resolution 1/N = ${(1 / NSAMP).toExponential(2)})`);
  log(`  same in um along the edge: p50 ${q(dsMm, 0.5).toFixed(3)}  p90 ${q(dsMm, 0.9).toFixed(3)}  MAX ${mx(dsMm).toFixed(2)} um`);
  log(`  AGREE within 2/N: COUNT ${agree} of ${sub.length} (${((agree / sub.length) * 100).toFixed(1)}%)`);
  log(`  dominant-interval share of total turning: p10 ${q(shares, 0.1).toFixed(3)}  p50 ${q(shares, 0.5).toFixed(3)}`);
  log(`  ${el()}`);
}

// ── PHASE B — THE TEST. On the END-PINNED crossings, where does the independent probe put the crease? ──
{
  const sub = pick(pinned, SUB);
  let atEnd = 0; let inMid = 0; let noCrease = 0;
  let areaEnd = 0; let areaMid = 0; let areaNo = 0;
  const midS: number[] = []; const midTurn: number[] = []; const shares: number[] = [];
  const midMm: number[] = [];
  const seenEnd = new Set<number>(); const seenMid = new Set<number>();
  for (const e of sub) {
    const t = denseTurn(e.ath, e.az, e.bth, e.bz, e.rRef, NSAMP);
    shares.push(t.share);
    // "at an end" = the dominant turning interval is the first or last one, i.e. the crease is within
    // 1/N of the vertex the bisection named.
    const isEnd = t.kStar === 0 || t.kStar === NSAMP - 1;
    if (t.dMaxDeg < 5) { noCrease += 1; areaNo += e.area; continue; }
    if (isEnd) { atEnd += 1; areaEnd += e.area; seenEnd.add(e.f); } else {
      inMid += 1; areaMid += e.area; seenMid.add(e.f);
      midS.push(Math.min(t.sStar, 1 - t.sStar));
      midMm.push(Math.min(t.sStar, 1 - t.sStar) * e.lenMm * 1000);
      midTurn.push(t.dMaxDeg);
    }
  }
  const den = Math.max(1, sub.length);
  log('');
  log(`══ PHASE B — THE TEST: independent probe on ${sub.length} END-PINNED crossings ══`);
  log('  (if the bisection tie-break defect were manufacturing these, the dense probe would put the crease');
  log('   in the INTERIOR of the edge, not in the first/last 1/N of it)');
  log(`  crease AT AN END (kStar 0 or N-1):  COUNT ${atEnd} (${((atEnd / den) * 100).toFixed(2)}%)   facet AREA ${areaEnd.toFixed(3)} mm2   -- CONFIRMS the snap tool`);
  log(`  crease IN THE INTERIOR:             COUNT ${inMid} (${((inMid / den) * 100).toFixed(2)}%)   facet AREA ${areaMid.toFixed(3)} mm2   -- would REFUTE it`);
  log(`  no crease found at all (dMax<5deg): COUNT ${noCrease} (${((noCrease / den) * 100).toFixed(2)}%)   facet AREA ${areaNo.toFixed(3)} mm2`);
  if (inMid > 0) {
    log(`  of the interior ones: dist-to-nearest-end s p50 ${q(midS, 0.5).toExponential(2)}  MAX ${mx(midS).toFixed(4)}`);
    log(`                        dist-to-nearest-end um p50 ${q(midMm, 0.5).toFixed(3)}  p90 ${q(midMm, 0.9).toFixed(3)}  MAX ${mx(midMm).toFixed(2)} um`);
    log(`                        their crease turn: p50 ${q(midTurn, 0.5).toFixed(2)}  MAX ${mx(midTurn).toFixed(2)} deg`);
  }
  log(`  dominant-interval share of total turning: p10 ${q(shares, 0.1).toFixed(3)}  p50 ${q(shares, 0.5).toFixed(3)}`);
  log(`  ${el()}`);
}

// ── PHASE C — NEGATIVE CONTROL. Random ordinary facet edges: the probe must read FLAT. ─────────────
{
  const tset = new Set(uniqF);
  const rnd: number[] = [];
  let seed = 987654321;
  while (rnd.length < Math.min(SUB, 400)) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const f = seed % nTri;
    if (!tset.has(f)) rnd.push(f);
  }
  const dmaxs: number[] = []; const shares: number[] = []; let big = 0;
  for (const f of rnd) {
    const [ath, bth, cth] = th3(f);
    const ths = [ath, bth, cth];
    const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
    const rRef = rRefOf(f);
    const t = denseTurn(ths[0], zs[0], ths[1], zs[1], rRef, NSAMP);
    dmaxs.push(t.dMaxDeg); shares.push(t.share);
    if (t.dMaxDeg > TURN_THR_DEG) big += 1;
  }
  log('');
  log(`══ PHASE C — NEGATIVE CONTROL: ${rnd.length} random ORDINARY facet edges ══`);
  log(`  dominant-interval turn: p50 ${q(dmaxs, 0.5).toFixed(4)}  p90 ${q(dmaxs, 0.9).toFixed(4)}  MAX ${mx(dmaxs).toFixed(3)} deg`);
  log(`  over ${TURN_THR_DEG} deg: COUNT ${big} (${((big / rnd.length) * 100).toFixed(2)}%)   (a crease-free edge must read ~0; a large number here would void PHASE B)`);
  log(`  dominant-interval share: p50 ${q(shares, 0.5).toFixed(3)}  MAX ${mx(shares).toFixed(3)}`);
  log(`  ${el()}`);
}

// ── PHASE D — the second half of the mechanism: does the crease RUN ACROSS THE INTERIOR of the
//    facets the snap tool called NO-OP? orientOfFacet spreadRad, inset EXPLICIT and SWEPT. ──────────
{
  // NO-OP facets, reconstructed the tool's way: every large-turn crossing on the facet sits at an end.
  const byF = new Map<number, EdgeRec[]>();
  for (const e of edges) { const l = byF.get(e.f); if (l === undefined) byF.set(e.f, [e]); else l.push(e); }
  const noopF: number[] = []; const realF: number[] = [];
  for (const [f, es] of byF) {
    if (es.every((e) => e.sBis <= END || e.sBis >= 1 - END)) noopF.push(f); else realF.push(f);
  }
  const noneF = uniqF.filter((f) => !byF.has(f));
  const ar = (fs: number[]): number => fs.reduce((s, f) => s + d0.areaMm2[f], 0);
  log('');
  log('══ PHASE D — "the crease runs from that vertex ACROSS THE INTERIOR": spreadDeg, inset EXPLICIT ══');
  log(`  reconstructed classes:  NONE ${noneF.length} / ${ar(noneF).toFixed(3)} mm2 (${((ar(noneF) / targetArea) * 100).toFixed(2)}%)`
    + `   ALL-AT-END ${noopF.length} / ${ar(noopF).toFixed(3)} mm2 (${((ar(noopF) / targetArea) * 100).toFixed(2)}%)`
    + `   HAS-INTERIOR ${realF.length} / ${ar(realF).toFixed(3)} mm2 (${((ar(realF) / targetArea) * 100).toFixed(2)}%)`);
  log('  (snap tool printed NONE 2215 / 15.52%, NO-OP 2479 / 43.13%, REAL 1499 / 41.35%)');
  for (const inset of [0, 0.05]) {
    for (const [name, fs] of [['ALL-AT-END(no-op)', noopF], ['HAS-INTERIOR(real)', realF]] as Array<[string, number[]]>) {
      const sub = pick(fs, SUB);
      const sp: number[] = []; const nd: number[] = [];
      for (const f of sub) {
        const [ath, bth, cth] = th3(f);
        const o = orientOfFacet(nsKink,
          xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
          xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K, inset, scratch });
        sp.push((o.spreadRad * 180) / Math.PI); nd.push(o.normDeg);
      }
      const over30 = sub.filter((_, i) => sp[i] > 30);
      const a30 = over30.reduce((s, f) => s + d0.areaMm2[f], 0);
      const aSub = sub.reduce((s, f) => s + d0.areaMm2[f], 0);
      log(`  inset ${inset}  ${name.padEnd(19)} n=${String(sub.length).padStart(4)}  spreadDeg p50 ${q(sp, 0.5).toFixed(2)}  p90 ${q(sp, 0.9).toFixed(2)}  MAX ${mx(sp).toFixed(2)}`
        + `  |  spread>30deg COUNT ${over30.length} (${((over30.length / sub.length) * 100).toFixed(1)}%) AREA ${a30.toFixed(3)}/${aSub.toFixed(3)} mm2 (${((a30 / aSub) * 100).toFixed(1)}%)`
        + `  |  normDeg p50 ${q(nd, 0.5).toFixed(2)} MAX ${mx(nd).toFixed(2)}`);
    }
  }
  log('  A LARGE interior spread on the ALL-AT-END class means the crease genuinely traverses the facet');
  log('  interior with a vertex already on it => no vertex snap can fix it, at any radius. A SMALL one');
  log('  would mean the class is mislabelled and the snap was never really tried there.');
  log(`  ${el()}`);
}

// ── PHASE E — WHY MY PARTITION AND THE TOOL'S DISAGREE, MEASURED not inferred. ─────────────────────
// The tool classes a facet NO-OP when its PLAN's 3-D move is < 1 um, and REAL otherwise. I class it
// ALL-AT-END when every large-turn crossing sits at an edge end. Same 3,978 facets, very different AREA
// split. The candidate rule explains it only if facets exist whose two crossings sit at TWO DIFFERENT
// corners: the plan then takes the perpendicular foot of the third corner onto the chord joining them —
// which is the OPPOSITE EDGE — and that is a facet-collapsing move, not a sliver-collapsing one.
{
  const byF = new Map<number, EdgeRec[]>();
  for (const e of edges) { const l = byF.get(e.f); if (l === undefined) byF.set(e.f, [e]); else l.push(e); }
  let sameCorner = 0; let diffCorner = 0; let single = 0;
  let aSame = 0; let aDiff = 0; let aSingle = 0;
  const footFrac: number[] = [];
  for (const [f, es] of byF) {
    if (!es.every((e) => e.sBis <= END || e.sBis >= 1 - END)) continue;   // ALL-AT-END facets only
    const [ath, bth, cth] = th3(f);
    const ths = [ath, bth, cth];
    const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
    const rRef = rRefOf(f);
    // which CORNER does each crossing land on? s<=END => corner ei; s>=1-END => corner (ei+1)%3
    const corners = es.map((e) => (e.sBis <= END ? e.ei : (e.ei + 1) % 3));
    const uniq = new Set(corners);
    if (es.length < 2) { single += 1; aSingle += d0.areaMm2[f]; continue; }
    if (uniq.size === 1) { sameCorner += 1; aSame += d0.areaMm2[f]; continue; }
    diffCorner += 1; aDiff += d0.areaMm2[f];
    // how big is the plan's move, as a fraction of the facet's mean edge length? Perp foot of the third
    // corner onto the chord between two crossings that sit on two different corners.
    const px = [rRef * ths[0], rRef * ths[1], rRef * ths[2]];
    const py = [zs[0], zs[1], zs[2]];
    const cs = [...uniq];
    const m = [0, 1, 2].find((k) => !uniq.has(k));
    if (m === undefined) continue;
    const ex = px[cs[1]] - px[cs[0]]; const ey = py[cs[1]] - py[cs[0]];
    const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((px[m] - px[cs[0]]) * ex + (py[m] - py[cs[0]]) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const fx = px[cs[0]] + ex * t; const fy = py[cs[0]] + ey * t;
    const L = (Math.hypot(px[1] - px[0], py[1] - py[0]) + Math.hypot(px[2] - px[1], py[2] - py[1])
      + Math.hypot(px[0] - px[2], py[0] - py[2])) / 3;
    footFrac.push(Math.hypot(px[m] - fx, py[m] - fy) / Math.max(1e-12, L));
  }
  const aAll = aSame + aDiff + aSingle;
  log('');
  log('══ PHASE E — inside the ALL-AT-END class: do the crossings share ONE corner, or sit on TWO? ══');
  log(`  ONE crossing only            COUNT ${single}  AREA ${aSingle.toFixed(3)} mm2 (${((aSingle / aAll) * 100).toFixed(2)}%)  -> plan target IS the corner, move ~0 (a true no-op)`);
  log(`  >=2 crossings, SAME corner   COUNT ${sameCorner}  AREA ${aSame.toFixed(3)} mm2 (${((aSame / aAll) * 100).toFixed(2)}%)  -> plan target IS the corner, move ~0 (a true no-op)`);
  log(`  >=2 crossings, TWO corners   COUNT ${diffCorner}  AREA ${aDiff.toFixed(3)} mm2 (${((aDiff / aAll) * 100).toFixed(2)}%)  -> plan drags the THIRD corner onto the OPPOSITE EDGE`);
  if (footFrac.length > 0) {
    log(`    that plan's move as a fraction of mean edge length: p50 ${q(footFrac, 0.5).toFixed(3)}  p90 ${q(footFrac, 0.9).toFixed(3)}  MAX ${mx(footFrac).toFixed(3)}`);
    log(`    over 0.5 L: COUNT ${footFrac.filter((v) => v > 0.5).length} of ${footFrac.length} — a move of that size COLLAPSES the facet, it does not conform it.`);
  }
  log(`  ${el()}`);
}

log('');
log(`done ${el()}`);
