// s114bBow.ts — S114b. THE MECHANISM S114a's 2x2 EXPOSED, AND THE OPERATOR IT IMPLIES.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT S114a MEASURED (report S114I_GOTH.report.txt, same worktree, same STL, PRECOND 0.0310 um)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S113's 1,537 "interior straddlers" reproduce EXACTLY (1537 facets / 15.8233 mm2 / 0.0411% of mesh) from
// a clean rebuild of the funnel. But an INDEPENDENT geometric test — a C0 crease crossing the boundary at
// two points, both clear of the driver's 1.5 um vertex floor, on different edges — finds a chord in only
// 19 of them (0.1998 mm2 = 1.26% of the set's area). 1,518 facets / 15.6235 mm2 have NO transversal chord.
// And they are NOT false positives: probing the segment between the two 2-means extremes finds a REAL C0
// crease inside 86.00% of them, refined turn p50 120.44 deg.
//
// So the crease IS inside, and it does NOT cross the boundary. The only way both can be true is that it
// ENTERS AND LEAVES THROUGH THE VERTICES: 87.90% of the 1,537 (97.98% BY AREA) have the crease passing
// within 1.5 um of at least one vertex, and the geometric classifier puts 2,243 target facets (56.29% of
// class area) in ALIGNED — the crease running from one vertex of a mesh edge to the other.
//
// *** THE MESH EDGE IS A STRAIGHT CHORD OF A CURVED LOCUS. Both its endpoints are ON the crease and the
// crease BOWS OFF IT into the facet interior. *** That is the mechanism, and it is why every operator the
// campaign has built missed: FLIP re-chooses which chord, SPLIT needs a transversal crossing that does not
// exist, SNAP moves a vertex that is already on the locus. S114a's own re-price of the conform split on
// this subset came back 1.159x against a MIDPOINT PLACEBO at 1.944x — the operator was BEATEN BY ITS OWN
// PLACEBO (advantage 0.596x), because with the crossings sitting on vertices the "conform" cut only shaves
// a sliver while any cut that genuinely divides the facet does more.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE DOES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  B1  MEASURE THE BOW. For every INT facet, for each of its three edges, probe PERPENDICULARLY into the
//      facet at 9 stations along the edge and locate the crease. The SAGITTA is the max offset over the
//      station FOOTPRINT — never a 2-point probe (S111: a 2-point probe of a curved quantity under-read
//      13x here). Reported against the CONTROL (the 4,656 target facets that are NOT interior straddlers).
//  B2  IS THE BOW THE REASON? The inset-0.1 footprint stands off each edge by 0.1 * (that edge's altitude).
//      A crease bowing further than that enters the footprint and the 2-means test fires. Cross-tabulate
//      `sagitta > 0.1*altitude` against membership. If it separates, that IS the distinguishing feature.
//  B3  THE OPERATOR THE MECHANISM IMPLIES — BOW-SPLIT. Insert ONE vertex Q at the bow apex, ON the locus,
//      snapped to rA; retriangulate the facet into (Vi,Q,Vk)+(Q,Vj,Vk) AND the neighbour across the same
//      edge into (Vi,Q,Vn)+(Q,Vj,Vn), so the shared edge becomes the two-segment chain Vi-Q-Vj and NO
//      T-junction is created. Cost: +2 triangles per treated edge, exactly.
//      *** TWO COST-MATCHED PLACEBOS, and the second is the tight one: ***
//        P-MID  Q at the edge midpoint, snapped to rA  (position along the edge AND offset both wrong)
//        P-CHORD Q at the SAME station t as the operator but ON THE STRAIGHT CHORD, snapped to rA
//                (position along the edge RIGHT, offset ZERO) — this isolates exactly what knowing the
//                locus buys, which is the perpendicular displacement and nothing else.
//      *** PRE-REGISTERED KILL LINE: R_op = base/op area-weighted-mean normDeg must be >= 5.0x (a FLOOR,
//      so a big advantage over a useless placebo cannot pass) AND R_op / max(R_placebo) >= 2.0x. ***
//      FLOORS: both placebos must produce the SAME child count as the operator or the run is VOID; no NaN;
//      child area vs parent area REPORTED per arm (it is NOT bounded here and must not be assumed to be —
//      snapping a point onto a bowing ridge legitimately adds area, and S114a's 0.5% bar fired for exactly
//      that reason; it is reported, not asserted).
//
// Usage: bash research/tools/run-s114b-bow.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, fdNormalsCentral, locateTurnAdaptive, type NormalSampler } from '../bridge/orientRuler';
import { aspect3 } from '../bridge/_shapeGuard';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114B_STYLE ?? 'GothicArches';
const STL = process.env.PF_S114B_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S114B_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/s114interior';
const DIMS: StyleDims = { H: envF('PF_S114B_H', 120), Rb: envF('PF_S114B_RB', 40), Rt: envF('PF_S114B_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

const HI_DEG = envF('PF_S114B_HI_DEG', 45);
const K_FUNNEL = Math.round(envF('PF_S114B_KF', 8));
const INSET_LO = 0; const INSET_HI = envF('PF_S114B_INSET_HI', 0.05);
const CURTAIN_RATIO = envF('PF_S114B_CURTAIN', 8);
const DROP_CUT = envF('PF_S114B_DROP', 0.25);
const K_LAT = Math.round(envF('PF_S114B_KLAT', 12));
const INSET_INT = envF('PF_S114B_INSET_INT', 0.1);
const SEP_CUT = envF('PF_S114B_SEP', 45);
const MINOR_CUT = envF('PF_S114B_MINOR', 0.05);
const SCAN_N = Math.round(envF('PF_S114B_SCAN_N', 96));
const GAP_DEG = envF('PF_S114B_GAP', 2);
const CREASE_BAR = envF('PF_S114B_CREASE_BAR', 15);
const REF_ITERS = Math.round(envF('PF_S114B_REFIT', 16));
const STATIONS = Math.round(envF('PF_S114B_STATIONS', 9));
const CTL_CAP = Math.round(envF('PF_S114B_CTLCAP', 1200));
const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
const SHAPE_AR = envF('PF_CB_SHAPE_AR', 50);
const KILL_FLOOR = envF('PF_S114B_KILL_FLOOR', 5.0);
const KILL_ADV = envF('PF_S114B_KILL_ADV', 2.0);

const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.6 / 1000,
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
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsMain = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== S114b — THE BOW: A STRAIGHT MESH EDGE IS A CHORD OF A CURVED LOCUS =====');
log(`style ${STYLE}  tag ${TAG}   probe: ${STATIONS} perpendicular stations per edge, scan N=${SCAN_N}, crease bar ${CREASE_BAR} deg`);
log(`KILL LINE (B3): R_op >= ${KILL_FLOOR.toFixed(1)}x AND R_op / max(R_placebo) >= ${KILL_ADV.toFixed(1)}x`);
log('');

const angAt = (p: Float64Array, po: number, r: Float64Array, ro: number): number => {
  let dd = p[po] * r[ro] + p[po + 1] * r[ro + 1] + p[po + 2] * r[ro + 2];
  dd = dd > 1 ? 1 : dd < -1 ? -1 : dd;
  return Math.acos(dd);
};
interface Crossing { s: number; turnDeg: number }
const sBuf = new Float64Array(3 * (SCAN_N + 1));
const sTurn = new Float64Array(SCAN_N);
function scanSegment(th0: number, z0: number, th1: number, z1: number, rRef: number): Crossing[] {
  const lenMm = Math.hypot(rRef * (th1 - th0), z1 - z0);
  if (!(lenMm > 0)) return [];
  const h = Math.max(1e-9, lenMm / (4 * SCAN_N));
  const ns = fdNormalsCentral(rA, H, h, h);
  for (let i = 0; i <= SCAN_N; i += 1) {
    const t = i / SCAN_N;
    ns(th0 + (th1 - th0) * t, z0 + (z1 - z0) * t, scratch);
    sBuf[i * 3] = scratch[0]; sBuf[i * 3 + 1] = scratch[1]; sBuf[i * 3 + 2] = scratch[2];
  }
  for (let i = 0; i < SCAN_N; i += 1) sTurn[i] = angAt(sBuf, i * 3, sBuf, (i + 1) * 3) * DEG;
  const out: Crossing[] = [];
  let i = 0;
  while (i < SCAN_N) {
    if (!(sTurn[i] >= GAP_DEG)) { i += 1; continue; }
    let j = i;
    while (j + 1 < SCAN_N && sTurn[j + 1] >= GAP_DEG) j += 1;
    const lo = Math.max(0, (i - 1) / SCAN_N); const hi = Math.min(1, (j + 2) / SCAN_N);
    const lt = locateTurnAdaptive(rA, H, th0 + (th1 - th0) * lo, z0 + (z1 - z0) * lo,
      th0 + (th1 - th0) * hi, z0 + (z1 - z0) * hi, rRef, REF_ITERS);
    out.push({ s: lo + (hi - lo) * lt.s, turnDeg: lt.turn * DEG });
    i = j + 1;
  }
  return out;
}

// ── SELF-TEST: same two-sided closed forms S114a used, so a scanner regression cannot pass silently ──
{
  const rTent = (th: number, _z: number): number => {
    const t = canonTheta(th);
    if (t < 0.4) return 40 + 40 * t;
    if (t < 0.7) return 56 - 40 * (t - 0.4);
    return 44;
  };
  const rSmooth = (th: number, _z: number): number => 40 + 2 * Math.cos(60 * canonTheta(th));
  const crestExp = 2 * Math.atan(40 / 56) * DEG; const clampExp = Math.atan(40 / 44) * DEG;
  const scanWith = (R: (th: number, z: number) => number): Crossing[] => {
    const rRef = 40; const TH0 = 0.05; const TH1 = 1.25;
    const lenMm = rRef * (TH1 - TH0); const h = Math.max(1e-9, lenMm / (4 * SCAN_N));
    const ns = fdNormalsCentral(R, H, h, h);
    const nn = new Float64Array(3 * (SCAN_N + 1)); const tt = new Float64Array(SCAN_N); const sc = new Float64Array(12);
    for (let i = 0; i <= SCAN_N; i += 1) { ns(TH0 + (TH1 - TH0) * (i / SCAN_N), 60, sc); nn[i * 3] = sc[0]; nn[i * 3 + 1] = sc[1]; nn[i * 3 + 2] = sc[2]; }
    for (let i = 0; i < SCAN_N; i += 1) tt[i] = angAt(nn, i * 3, nn, (i + 1) * 3) * DEG;
    const out: Crossing[] = []; let i = 0;
    while (i < SCAN_N) {
      if (!(tt[i] >= GAP_DEG)) { i += 1; continue; }
      let j = i; while (j + 1 < SCAN_N && tt[j + 1] >= GAP_DEG) j += 1;
      const lo = Math.max(0, (i - 1) / SCAN_N); const hi = Math.min(1, (j + 2) / SCAN_N);
      const lt = locateTurnAdaptive(R, H, TH0 + (TH1 - TH0) * lo, 60, TH0 + (TH1 - TH0) * hi, 60, rRef, REF_ITERS);
      out.push({ s: TH0 + (TH1 - TH0) * (lo + (hi - lo) * lt.s), turnDeg: lt.turn * DEG }); i = j + 1;
    }
    return out;
  };
  const tent = scanWith(rTent).filter((c) => c.turnDeg >= CREASE_BAR);
  const smooth = scanWith(rSmooth).filter((c) => c.turnDeg >= CREASE_BAR);
  const ok = tent.length === 2 && Math.abs(tent[0].s - 0.4) < 5e-3 && Math.abs(tent[1].s - 0.7) < 5e-3
    && Math.abs(tent[0].turnDeg - crestExp) / crestExp < 0.1 && Math.abs(tent[1].turnDeg - clampExp) / clampExp < 0.1
    && smooth.length === 0;
  log(`SELF-TEST scanner: TENT ${tent.length} crossings ${tent.map((c) => `th=${c.s.toFixed(5)} turn=${c.turnDeg.toFixed(3)}`).join(' | ')}  (expect 0.400/${crestExp.toFixed(3)} and 0.700/${clampExp.toFixed(3)});  SMOOTH negatives ${smooth.length} (must be 0)  => ${ok ? 'PASS' : '*** FAIL ***'}`);
  if (!ok) { log('*** SELF-TEST FAILED — VOID ***'); process.exit(6); }
}
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
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113/S114a read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets ${meshArea.toFixed(3)} mm2  ${el()}`);

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
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
function orientOf(f: number, inset: number, k: number, mode: 'winding' | 'outward'): number {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(nsMain, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k, inset, orient: mode, scratch }).normDeg;
}
function orientOfTri(t: Float64Array, o: number, inset: number, k: number, ns: NormalSampler, mode: 'winding' | 'outward'): number {
  const a = Math.atan2(t[o + 1], t[o]);
  const b = a + dThRaw(a, Math.atan2(t[o + 4], t[o + 3]));
  const c = a + dThRaw(a, Math.atan2(t[o + 7], t[o + 6]));
  return orientOfFacet(ns, t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8],
    a, b, c, { k, inset, orient: mode, scratch }).normDeg;
}
const triArea = (t: Float64Array, o: number): number => {
  const ux = t[o + 3] - t[o]; const uy = t[o + 4] - t[o + 1]; const uz = t[o + 5] - t[o + 2];
  const wx = t[o + 6] - t[o]; const wy = t[o + 7] - t[o + 1]; const wz = t[o + 8] - t[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
const areaOf = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };

// ── funnel + interior set, rebuilt (identical bodies to S114a; R1 reproduced there to the digit) ──
interface FacCache { nHi: number; nLo: number; gr: number }
const facCache = new Map<number, FacCache>();
const facOf = (f: number): FacCache => {
  const c = facCache.get(f); if (c !== undefined) return c;
  const v: FacCache = { nHi: orientOf(f, INSET_HI, K_FUNNEL, 'winding'), nLo: orientOf(f, INSET_LO, K_FUNNEL, 'winding'), gr: graphRatio(f) };
  facCache.set(f, v); return v;
};
const centroid = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
const sharedEndpoints = (e: number): number[] | null => {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e]; const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
  }
  return out.length === 6 ? out : null;
};
const targetSet: number[] = [];
{
  const hiThr = (HI_DEG * Math.PI) / 180; const seen = new Set<number>();
  let nH = 0; let nW = 0; let nS = 0; let nP = 0;
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    nH += 1;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const a = facOf(f1); const b = facOf(f2);
    if (a.gr > CURTAIN_RATIO || b.gr > CURTAIN_RATIO) continue;
    nW += 1;
    const normHi = Math.max(a.nHi, b.nHi); const normLo = Math.max(a.nLo, b.nLo);
    if (!((normLo > 1e-9 ? normHi / normLo : 1) >= DROP_CUT && normHi > 10)) continue;
    nS += 1;
    const p = sharedEndpoints(e); if (p === null) continue;
    const thE = Math.atan2(p[1], p[0]);
    const kEdge = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
    const c1 = centroid(f1); const c2 = centroid(f2);
    const thC = Math.atan2(c1[1], c1[0]);
    const kSeg = locateKinkRaw(rA, thC, c1[2], thC + dThRaw(thC, Math.atan2(c2[1], c2[0])), c2[2], PRED);
    if (!((kEdge !== null && !kEdge.jump) || (kSeg !== null && !kSeg.jump))) continue;
    nP += 1;
    for (const f of [f1, f2]) if (!seen.has(f)) { seen.add(f); targetSet.push(f); }
  }
  log(`FUNNEL CONTROL ${nH}/${nW}/${nS}/${nP} pairs, ${targetSet.length} facets ${areaOf(targetSet).toFixed(4)} mm2  (must read 19582/13092/5174/3282, 6193, 69.8258)  ${el()}`);
  if (!(nH === 19582 && nW === 13092 && nS === 5174 && nP === 3282 && targetSet.length === 6193)) { log('*** FUNNEL CONTROL FAILED — VOID ***'); process.exit(5); }
}
function sampleFacet(f: number, k: number, inset: number): { n: Float64Array; m: number } {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3);
  const sh = 1 - inset; const sc = inset / 3; let m = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const a = sh * (i / k) + sc; const b = sh * (j / k) + sc; const c = 1 - a - b;
    const nc = nsMain(a * ath + b * bth + c * cth, a * az + b * bz + c * cz, scratch);
    for (let qi = 0; qi < nc; qi += 1) { n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2]; m += 1; }
  }
  return { n, m };
}
function twoMeans(n: Float64Array, m: number): { sepDeg: number; minor: number } {
  if (m < 2) return { sepDeg: 0, minor: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < m; i += 1) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  const L0 = Math.hypot(sx, sy, sz) || 1;
  const mean = new Float64Array([sx / L0, sy / L0, sz / L0]);
  let i1 = 0; let best = -1;
  for (let i = 0; i < m; i += 1) { const a = angAt(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = 0; best = -1;
  for (let i = 0; i < m; i += 1) { const a = angAt(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
  const c = new Float64Array([n[i1 * 3], n[i1 * 3 + 1], n[i1 * 3 + 2], n[i2 * 3], n[i2 * 3 + 1], n[i2 * 3 + 2]]);
  let na = 0;
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; na = 0;
    for (let i = 0; i < m; i += 1) {
      if (angAt(n, i * 3, c, 0) <= angAt(n, i * 3, c, 3)) { ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
      else { bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (m - na > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || na === m) break;
  }
  return { sepDeg: na > 0 && na < m ? angAt(c, 0, c, 3) * DEG : 0, minor: Math.min(na, m - na) / m };
}
const INT: number[] = []; const CTL: number[] = [];
for (const f of targetSet) {
  const r = twoMeans(...(():[Float64Array, number] => { const s = sampleFacet(f, K_LAT, INSET_INT); return [s.n, s.m]; })());
  if (r.sepDeg >= SEP_CUT && r.minor >= MINOR_CUT) INT.push(f); else CTL.push(f);
}
log(`INTERIOR CONTROL  INT ${INT.length} facets ${areaOf(INT).toFixed(4)} mm2  (must read 1537 / 15.8233)   CTL ${CTL.length} ${areaOf(CTL).toFixed(4)} mm2  ${el()}`);
if (!(INT.length === 1537)) { log('*** INTERIOR CONTROL FAILED — VOID ***'); process.exit(5); }
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// B1 — MEASURE THE BOW
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Bow { edge: number; sagUm: number; tStar: number; qTh: number; qZ: number; altMm: number; lenMm: number; nSta: number; turnDeg: number }
/**
 * For edge `ei` of facet `f`, probe PERPENDICULARLY into the facet at `STATIONS` stations and locate the
 * crease. Returns the station with the LARGEST offset (the bow apex) — a footprint measurement, not a
 * midpoint one. `altMm` is the triangle's altitude on that edge, so `sagUm/1000 / altMm` says how deep
 * into the facet the bow reaches as a fraction of the available depth.
 */
function bowOfEdge(f: number, ei: number): Bow | null {
  const [ath, bth, cth] = th3(f);
  const ths = [ath, bth, cth]; const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  const rRef = rRefOf(f);
  const V: Array<[number, number]> = [0, 1, 2].map((i) => [rRef * ths[i], zs[i]] as [number, number]);
  const j = (ei + 1) % 3; const k = (ei + 2) % 3;
  const A = V[ei]; const B = V[j]; const C = V[k];
  const ex = B[0] - A[0]; const ey = B[1] - A[1];
  const L = Math.hypot(ex, ey);
  if (!(L > 1e-12)) return null;
  const ux = ex / L; const uy = ey / L;
  let px = -uy; let py = ux;
  // point the perpendicular INTO the triangle (toward C)
  if ((C[0] - A[0]) * px + (C[1] - A[1]) * py < 0) { px = -px; py = -py; }
  const alt = Math.abs((C[0] - A[0]) * px + (C[1] - A[1]) * py);
  if (!(alt > 1e-12)) return null;
  let best: Bow | null = null;
  let nSta = 0;
  for (let s = 1; s < STATIONS + 1; s += 1) {
    const t = s / (STATIONS + 1);
    const Sx = A[0] + ex * t; const Sy = A[1] + ey * t;
    // depth available at this station: the triangle narrows linearly from the edge toward the apex
    const depth = alt * Math.min(t, 1 - t) * 2 * 0.95;
    if (!(depth > 1e-9)) continue;
    const th0 = Sx / rRef; const z0 = Sy;
    const th1 = (Sx + px * depth) / rRef; const z1 = Sy + py * depth;
    const cs = scanSegment(th0, z0, th1, z1, rRef).filter((c) => c.turnDeg >= CREASE_BAR);
    if (cs.length === 0) continue;
    nSta += 1;
    let near = cs[0];
    for (const c of cs) if (c.s < near.s) near = c;
    const off = near.s * depth;
    if (best === null || off > best.sagUm / 1000) {
      best = {
        edge: ei, sagUm: off * 1000, tStar: t,
        qTh: (Sx + px * off) / rRef, qZ: Sy + py * off,
        altMm: alt, lenMm: L, nSta, turnDeg: near.turnDeg,
      };
    }
  }
  if (best !== null) best.nSta = nSta;
  return best;
}
/** The best bow over the facet's three edges. */
function bowOfFacet(f: number): Bow | null {
  let best: Bow | null = null;
  for (let ei = 0; ei < 3; ei += 1) {
    const b = bowOfEdge(f, ei);
    if (b !== null && (best === null || b.sagUm > best.sagUm)) best = b;
  }
  return best;
}

log('══════════ B1 — THE BOW, MEASURED (perpendicular stations, footprint max) ══════════');
const bowInt = new Map<number, Bow>(); const bowCtl = new Map<number, Bow>();
{
  for (const f of INT) { const b = bowOfFacet(f); if (b !== null) bowInt.set(f, b); }
  const ctlSub = CTL.slice(0, Math.min(CTL_CAP, CTL.length));
  for (const f of ctlSub) { const b = bowOfFacet(f); if (b !== null) bowCtl.set(f, b); }
  const sInt = [...bowInt.values()].map((b) => b.sagUm);
  const sCtl = [...bowCtl.values()].map((b) => b.sagUm);
  const fInt = [...bowInt.entries()].map(([, b]) => (b.sagUm / 1000) / b.altMm);
  const fCtl = [...bowCtl.entries()].map(([, b]) => (b.sagUm / 1000) / b.altMm);
  const aInt = areaOf([...bowInt.keys()]); const aCtl = areaOf([...bowCtl.keys()]);
  log(`  INT: a bow found on ${bowInt.size}/${INT.length} = ${((bowInt.size / INT.length) * 100).toFixed(2)}% by count;  AREA ${aInt.toFixed(4)} mm2 = ${((aInt / areaOf(INT)) * 100).toFixed(2)}% of INT`);
  log(`  CTL: a bow found on ${bowCtl.size}/${ctlSub.length} = ${((bowCtl.size / Math.max(1, ctlSub.length)) * 100).toFixed(2)}% by count;  AREA ${aCtl.toFixed(4)} mm2 = ${((aCtl / Math.max(1e-12, areaOf(ctlSub))) * 100).toFixed(2)}% of the CTL sample`);
  log(`  SAGITTA um       INT p10 ${q(sInt, 0.1).toFixed(3)} p50 ${q(sInt, 0.5).toFixed(3)} p90 ${q(sInt, 0.9).toFixed(3)} MAX ${mx(sInt).toFixed(3)}`);
  log(`                   CTL p10 ${q(sCtl, 0.1).toFixed(3)} p50 ${q(sCtl, 0.5).toFixed(3)} p90 ${q(sCtl, 0.9).toFixed(3)} MAX ${mx(sCtl).toFixed(3)}   p50 ratio ${(q(sInt, 0.5) / Math.max(1e-12, q(sCtl, 0.5))).toFixed(2)}x`);
  log(`  SAG / ALTITUDE   INT p10 ${q(fInt, 0.1).toFixed(4)} p50 ${q(fInt, 0.5).toFixed(4)} p90 ${q(fInt, 0.9).toFixed(4)} MAX ${mx(fInt).toFixed(4)}`);
  log(`                   CTL p10 ${q(fCtl, 0.1).toFixed(4)} p50 ${q(fCtl, 0.5).toFixed(4)} p90 ${q(fCtl, 0.9).toFixed(4)} MAX ${mx(fCtl).toFixed(4)}   p50 ratio ${(q(fInt, 0.5) / Math.max(1e-12, q(fCtl, 0.5))).toFixed(2)}x`);
  log(`  stations firing per facet (of ${STATIONS}):  INT p50 ${q([...bowInt.values()].map((b) => b.nSta), 0.5)}  CTL p50 ${q([...bowCtl.values()].map((b) => b.nSta), 0.5)}`);
  log(`  refined turn at the apex, deg:  INT p50 ${q([...bowInt.values()].map((b) => b.turnDeg), 0.5).toFixed(2)} MAX ${mx([...bowInt.values()].map((b) => b.turnDeg)).toFixed(2)}`);
  log(`  ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// B2 — IS THE BOW THE REASON THE 2-MEANS TEST FIRES?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('══════════ B2 — DOES THE BOW REACH THE INSET-0.1 FOOTPRINT? ══════════');
log(`  The inset-${INSET_INT} lattice stands off each edge by ${INSET_INT} x that edge's altitude. A bow deeper`);
log('  than that puts C0 material inside the sampled footprint, which is exactly what the 2-means test sees.');
{
  const deep = (m: Map<number, Bow>): number[] => [...m.entries()].filter(([, b]) => (b.sagUm / 1000) > INSET_INT * b.altMm).map(([f]) => f);
  const dI = deep(bowInt); const dC = deep(bowCtl);
  const ctlSub = [...bowCtl.keys()];
  const rI = dI.length / Math.max(1, INT.length);
  const rC = dC.length / Math.max(1, CTL.slice(0, Math.min(CTL_CAP, CTL.length)).length);
  const arI = areaOf(dI) / Math.max(1e-12, areaOf(INT));
  const arC = areaOf(dC) / Math.max(1e-12, areaOf(CTL.slice(0, Math.min(CTL_CAP, CTL.length))));
  log(`  BOW DEEPER THAN ${INSET_INT} x altitude:`);
  log(`    INT ${dI.length}/${INT.length} = ${(rI * 100).toFixed(2)}% by count;  AREA ${areaOf(dI).toFixed(4)} mm2 = ${(arI * 100).toFixed(2)}% of INT`);
  log(`    CTL ${dC.length}/${ctlSub.length} sampled = ${(rC * 100).toFixed(2)}% by count;  AREA ${areaOf(dC).toFixed(4)} mm2 = ${(arC * 100).toFixed(2)}% of the CTL sample`);
  log(`    SEPARATION ${(rI / Math.max(1e-9, rC)).toFixed(2)}x by count, ${(arI / Math.max(1e-9, arC)).toFixed(2)}x by area`);
  log(`  ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// B3 — THE BOW-SPLIT OPERATOR, WITH TWO COST-MATCHED PLACEBOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('══════════ B3 — BOW-SPLIT vs P-MID vs P-CHORD (cost-matched) ══════════');
{
  // edge -> the (up to 2) facets on it, from the welded ids
  const vidL = new Int32Array(nTri * 3);
  {
    const buckets = new Map<number, number[]>();
    const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
    const cxA: number[] = []; const cyA: number[] = []; const czA: number[] = []; let nV = 0;
    for (let v = 0; v < nTri * 3; v += 1) {
      const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
      f32[0] = x; f32[1] = y; f32[2] = z;
      let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35); h |= 0;
      const b = buckets.get(h); let found = -1;
      if (b !== undefined) for (const c of b) if (cxA[c] === x && cyA[c] === y && czA[c] === z) { found = c; break; }
      if (found < 0) { found = nV; nV += 1; cxA.push(x); cyA.push(y); czA.push(z); if (b === undefined) buckets.set(h, [found]); else b.push(found); }
      vidL[v] = found;
    }
  }
  const SHIFT = 67_108_864;
  const eMap = new Map<number, number[]>();
  for (let f = 0; f < nTri; f += 1) {
    const a = vidL[f * 3]; const b = vidL[f * 3 + 1]; const c = vidL[f * 3 + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const k = (u < v ? u : v) * SHIFT + (u < v ? v : u);
      const arr = eMap.get(k); if (arr === undefined) eMap.set(k, [f]); else arr.push(f);
    }
  }
  const tri = new Float64Array(9 * 8);
  const snapTo = (th: number, z: number, out: Float64Array, o: number): void => {
    const tc = canonTheta(th); const r = rA(tc, z);
    out[o] = r * Math.cos(tc); out[o + 1] = r * Math.sin(tc); out[o + 2] = z;
  };
  interface Arm { nCh: number; area: number; wtd: number; maxDeg: number; over45: number; over5: number; minEdge: number; maxAr: number; nNaN: number }
  const mkArm = (): Arm => ({ nCh: 0, area: 0, wtd: 0, maxDeg: -Infinity, over45: 0, over5: 0, minEdge: Infinity, maxAr: 0, nNaN: 0 });
  const acc = (a: Arm, t: Float64Array, n: number): void => {
    for (let ci = 0; ci < n; ci += 1) {
      const o = ci * 9; const ar = triArea(t, o);
      const nd = orientOfTri(t, o, INSET_HI, K_FUNNEL, nsMain, 'outward');
      if (!Number.isFinite(nd)) { a.nNaN += 1; continue; }
      a.nCh += 1; a.area += ar; a.wtd += ar * nd;
      if (nd > a.maxDeg) a.maxDeg = nd;
      if (nd > 45) a.over45 += ar;
      if (nd > 5) a.over5 += ar;
      const e0 = Math.hypot(t[o + 3] - t[o], t[o + 4] - t[o + 1], t[o + 5] - t[o + 2]);
      const e1 = Math.hypot(t[o + 6] - t[o + 3], t[o + 7] - t[o + 4], t[o + 8] - t[o + 5]);
      const e2 = Math.hypot(t[o] - t[o + 6], t[o + 1] - t[o + 7], t[o + 2] - t[o + 8]);
      a.minEdge = Math.min(a.minEdge, e0, e1, e2);
      const q3 = aspect3(t[o], t[o + 1], t[o + 2], t[o + 3], t[o + 4], t[o + 5], t[o + 6], t[o + 7], t[o + 8]);
      if (Number.isFinite(q3) && q3 > a.maxAr) a.maxAr = q3;
    }
  };
  /** Build the two children of facet `g` when the shared edge (vertices p,r in 3D) gains the point Q. */
  const twoChildren = (g: number, pu: number, pv: number, Q: Float64Array, qo: number, out: Float64Array): number => {
    // local indices of the two welded ids pu, pv inside g, and the third
    let ia = -1; let ib = -1;
    for (let i = 0; i < 3; i += 1) { if (vidL[g * 3 + i] === pu) ia = i; else if (vidL[g * 3 + i] === pv) ib = i; }
    if (ia < 0 || ib < 0) return 0;
    const ic = 3 - ia - ib;
    const V = (i: number, o: number): void => { out[o] = xyz[g * 9 + i * 3]; out[o + 1] = xyz[g * 9 + i * 3 + 1]; out[o + 2] = xyz[g * 9 + i * 3 + 2]; };
    V(ia, 0); out[3] = Q[qo]; out[4] = Q[qo + 1]; out[5] = Q[qo + 2]; V(ic, 6);
    out[9] = Q[qo]; out[10] = Q[qo + 1]; out[11] = Q[qo + 2]; V(ib, 12); V(ic, 15);
    return 2;
  };
  const base = mkArm(); const op = mkArm(); const pmid = mkArm(); const pch = mkArm();
  const Q = new Float64Array(9);
  let nTreated = 0; let nEdges = 0; let nBothInClass = 0;
  const treated: number[] = [];
  const doneEdge = new Set<number>();
  const intSet = new Set(INT);
  for (const f of INT) {
    const b = bowInt.get(f);
    if (b === undefined) continue;
    const ei = b.edge; const j = (ei + 1) % 3;
    const pu = vidL[f * 3 + ei]; const pv = vidL[f * 3 + j];
    const key = (pu < pv ? pu : pv) * SHIFT + (pu < pv ? pv : pu);
    if (doneEdge.has(key)) continue;
    const fs = eMap.get(key);
    if (fs === undefined || fs.length !== 2) continue;
    doneEdge.add(key);
    nEdges += 1;
    const other = fs[0] === f ? fs[1] : fs[0];
    if (intSet.has(other)) nBothInClass += 1;
    // the three placements: OPERATOR on the locus; P-MID at the edge midpoint; P-CHORD at the SAME
    // station as the operator but ON the straight chord (offset zero) — the tight placebo.
    const [ath, bth, cth] = th3(f);
    const ths = [ath, bth, cth]; const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
    snapTo(b.qTh, b.qZ, Q, 0);
    snapTo(ths[ei] + (ths[j] - ths[ei]) * 0.5, zs[ei] + (zs[j] - zs[ei]) * 0.5, Q, 3);
    snapTo(ths[ei] + (ths[j] - ths[ei]) * b.tStar, zs[ei] + (zs[j] - zs[ei]) * b.tStar, Q, 6);
    if (twoChildren(f, pu, pv, Q, 0, tri) !== 2 || twoChildren(other, pu, pv, Q, 0, tri) !== 2) continue;
    nTreated += 1;
    treated.push(f, other);
    // BASELINE: the two parents exactly as they ship
    for (let kk = 0; kk < 9; kk += 1) { tri[kk] = xyz[f * 9 + kk]; tri[9 + kk] = xyz[other * 9 + kk]; }
    acc(base, tri, 2);
    for (const [arm, qo] of [[op, 0], [pmid, 3], [pch, 6]] as Array<[Arm, number]>) {
      twoChildren(f, pu, pv, Q, qo, tri);
      const t2 = new Float64Array(18);
      twoChildren(other, pu, pv, Q, qo, t2);
      for (let kk = 0; kk < 18; kk += 1) tri[18 + kk] = t2[kk];
      acc(arm, tri, 4);
    }
  }
  const parents = [...new Set(treated)];
  log(`  REACH: ${nEdges} distinct bow edges;  TREATED ${nTreated} edges = ${nTreated * 2} parent facets (${parents.length} distinct)`);
  log(`         parent AREA ${areaOf(parents).toFixed(4)} mm2 = ${((areaOf(parents) / Math.max(1e-12, areaOf(INT))) * 100).toFixed(2)}% of INT = ${((areaOf(parents) / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`         the neighbour across the bow edge is ALSO an interior straddler in ${nBothInClass}/${nEdges} cases`);
  log(`         triangle cost: +2 per treated edge = +${nTreated * 2} = +${((nTreated * 2 / nTri) * 100).toFixed(4)}% of the whole mesh;  T-junctions 0 BY CONSTRUCTION (both sides split at the same Q)`);
  const show = (nm: string, a: Arm): void => {
    const w = a.area > 0 ? a.wtd / a.area : NaN;
    log(`     ${nm.padEnd(10)} children ${String(a.nCh).padStart(5)}  area ${a.area.toFixed(4).padStart(9)} mm2  area-wtd normDeg ${w.toFixed(4).padStart(9)} deg  MAX ${a.maxDeg.toFixed(3).padStart(9)}  over45 ${a.over45.toFixed(4).padStart(8)}  over5 ${a.over5.toFixed(4).padStart(8)}  minEdge ${a.minEdge.toExponential(2)}  maxAR ${a.maxAr.toFixed(1)}  NaN ${a.nNaN}`);
  };
  log('');
  show('BASELINE', base); show('BOW-SPLIT', op); show('P-MID', pmid); show('P-CHORD', pch);
  const w = (a: Arm): number => (a.area > 0 ? a.wtd / a.area : NaN);
  const rOp = w(base) / Math.max(1e-12, w(op));
  const rMid = w(base) / Math.max(1e-12, w(pmid));
  const rCh = w(base) / Math.max(1e-12, w(pch));
  const rBest = Math.max(rMid, rCh);
  log('');
  log(`     REDUCTION (baseline / arm):  BOW-SPLIT ${rOp.toFixed(3)}x   P-MID ${rMid.toFixed(3)}x   P-CHORD ${rCh.toFixed(3)}x`);
  log(`     over-45 AREA: base ${base.over45.toFixed(4)} -> OP ${op.over45.toFixed(4)} (${(base.over45 / Math.max(1e-12, op.over45)).toFixed(3)}x)  P-MID ${pmid.over45.toFixed(4)} (${(base.over45 / Math.max(1e-12, pmid.over45)).toFixed(3)}x)  P-CHORD ${pch.over45.toFixed(4)} (${(base.over45 / Math.max(1e-12, pch.over45)).toFixed(3)}x)`);
  log(`     MAX normDeg:  base ${base.maxDeg.toFixed(3)} -> OP ${op.maxDeg.toFixed(3)}  P-MID ${pmid.maxDeg.toFixed(3)}  P-CHORD ${pch.maxDeg.toFixed(3)} deg`);
  log(`     ADVANTAGE over the best placebo: ${(rOp / Math.max(1e-12, rBest)).toFixed(3)}x`);
  log('');
  log('     ── FLOORS ──');
  log(`       cost-matched children: OP ${op.nCh}  P-MID ${pmid.nCh}  P-CHORD ${pch.nCh}  ${op.nCh === pmid.nCh && op.nCh === pch.nCh ? 'PASS' : '*** NOT COST-MATCHED — VOID ***'}`);
  log(`       NaN normDeg: OP ${op.nNaN} P-MID ${pmid.nNaN} P-CHORD ${pch.nNaN}  ${op.nNaN === 0 ? 'PASS' : '*** FAIL ***'}`);
  log(`       child area vs parent area (REPORTED, not asserted — snapping onto a ridge adds area):`);
  log(`         base ${base.area.toFixed(4)}  OP ${op.area.toFixed(4)} (${(((op.area - base.area) / base.area) * 100).toFixed(3)}%)  P-MID ${pmid.area.toFixed(4)} (${(((pmid.area - base.area) / base.area) * 100).toFixed(3)}%)  P-CHORD ${pch.area.toFixed(4)} (${(((pch.area - base.area) / base.area) * 100).toFixed(3)}%)`);
  log(`       children under the driver's edge floor ${FLOOR_MM} mm: OP ${op.minEdge < FLOOR_MM ? 'YES' : 'no'} (min ${op.minEdge.toExponential(3)})`);
  log(`       children over the driver's aspect bar ${SHAPE_AR}: OP maxAR ${op.maxAr.toFixed(1)}  P-MID ${pmid.maxAr.toFixed(1)}`);
  const passFloor = rOp >= KILL_FLOOR;
  const passAdv = rOp / Math.max(1e-12, rBest) >= KILL_ADV;
  const costOK = op.nCh === pmid.nCh && op.nCh === pch.nCh;
  log('');
  log('     ════ VERDICT against the PRE-REGISTERED B3 KILL LINE ════');
  log(`       (a) R_op = ${rOp.toFixed(3)}x   need >= ${KILL_FLOOR.toFixed(1)}x   ${passFloor ? 'PASS' : 'FAIL'}`);
  log(`       (b) advantage = ${(rOp / Math.max(1e-12, rBest)).toFixed(3)}x   need >= ${KILL_ADV.toFixed(1)}x   ${passAdv ? 'PASS' : 'FAIL'}`);
  log(`       ==> ${passFloor && passAdv && costOK
    ? '*** THE BOW-SPLIT SURVIVES — a genuinely new operator result, scoped to the reach printed above. ***'
    : '*** KILL LINE FIRED — the bow-split is REFUTED too. ***'}`);
  writeFileSync(`${OUTDIR}/S114B_${TAG}.summary.json`, `${JSON.stringify({
    style: STYLE, stl: STL, meshFacets: nTri, meshAreaMm2: meshArea,
    intCount: INT.length, intAreaMm2: areaOf(INT),
    bowFound: bowInt.size, bowEdges: nEdges, treatedEdges: nTreated, parentFacets: parents.length,
    parentAreaMm2: areaOf(parents), triangleCost: nTreated * 2,
    baseWtdDeg: w(base), opWtdDeg: w(op), midWtdDeg: w(pmid), chordWtdDeg: w(pch),
    rOp, rMid, rChord: rCh, advantage: rOp / Math.max(1e-12, rBest),
    maxBase: base.maxDeg, maxOp: op.maxDeg, maxMid: pmid.maxDeg, maxChord: pch.maxDeg,
    verdict: passFloor && passAdv && costOK ? 'SURVIVES' : 'REFUTED',
  }, null, 2)}\n`);
  log(`  wrote ${OUTDIR}/S114B_${TAG}.summary.json`);
}
log('');
log(`done ${el()}`);
