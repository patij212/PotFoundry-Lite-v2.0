// s114bCurtainProbe.ts — S114-B FOLLOW-UP. THE DOMAIN OF THE S113 ORACLE COLLAPSES OFF GOTHIC.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS SECOND TOOL EXISTS. S114-B ran the S112 funnel + S113 oracle on five styles. On GothicArches
// the funnel reproduced the pinned 19,582 / 13,092 / 5,174 / 3,282 to the digit and the oracle reproduced
// 99.37% vs the pinned 99.40%. But on the other three non-empty styles the funnel's FIRST cut throws away
// almost the whole class:
//
//     style           >45 class area   CURTAIN share of that area   S113 target reaches
//     GothicArches      911.29 mm2            25.79%                 7.90% of the class
//     Crystalline      1976.57 mm2            99.42%                 0.35% of the class
//     DragonScales     2111.56 mm2            99.16%                 0.33% of the class
//     GeometricStar    6503.27 mm2            99.39%                 0.008% of the class
//
// CURTAIN = graphRatio > 8, i.e. the facet's 3D area is >8x its (theta, z) parameter footprint: a
// near-radial cliff face. S112 excluded it because `orientOfFacet` covers the PARAMETER footprint, and on
// a curtain that footprint is a sliver — the covering does not represent the 3D triangle. So the campaign's
// entire angular verdict is silent on 99% of the visible class on three of my five styles, and answering
// "does S113's conclusion generalise" WITHOUT saying so would be answering a different question.
//
// AND a pre-registered control FIRED: on DragonScales the flank classifier labelled 1/309 target facets
// crease-bearing (floor: >= 50%), so *** THE DRAGONSCALES ORACLE NUMBER IS VOID *** and is not rescued.
// Its own sepCrease p50 of 0.97 deg says the analytic surface under that target set is SMOOTH while
// `locateKinkRaw` labelled the pairs crease-bearing — two crease detectors disagreeing. That needs a third
// instrument, not an argument.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PROBE. A PATH probe, not a footprint probe, chosen because it does not need the graph ruler to be
// well conditioned — only the analytic normal, which is defined everywhere on r(theta, z).
//
// For a pair of adjacent facets, take the segment in (theta, z) between their two centroids (unwrapped
// with dThRaw — the campaign's own convention, and the same segment `locateKinkRaw` uses for `kSeg`), and
// sample the analytic normal at M points along it with the KINK-AWARE sampler. Report:
//
//   pathJumpDeg   MAX angle between the normals at CONSECUTIVE samples. On a smooth path with M samples
//                 this is O(total turn / M) and vanishes; where the path crosses a C0 crease exactly one
//                 consecutive pair straddles it and reads the FULL one-sided jump. This is the statistic.
//   pathDiamDeg   MAX angle over ALL sample pairs — crease jump PLUS accumulated smooth curvature. An
//                 upper bracket, printed so the two cannot be confused.
//   ptSpreadDeg   MAX over samples of the spread among the up-to-4 one-sided candidates AT ONE point —
//                 orientRuler's own crease detector, free with the kink-aware sampler.
//   endTurnDeg    angle between the normals at the TWO ENDPOINTS ONLY. Printed for one reason: this
//                 campaign's two-point probes have under-read curved quantities 13x, and the ratio
//                 pathJump/endTurn measures that here instead of assuming it.
//   pathLenMm     length of the probe path in the (rRef*theta, z) metric. A curtain pair can have both
//                 facets over nearly the SAME parameter point; then the path carries no information and
//                 the row must be excluded rather than counted as "no turn". Reported and split on.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST RUN. Two-sided, because a one-sided bar is vacuous.
//
//  CTL-SMOOTH (ceiling, VOIDS the style). Wall pairs with mesh dihedral < 2 deg. The probe must call
//      <= 5% of them >= 45 deg. Higher ⇒ the probe manufactures turn out of smooth curvature.
//  CTL-CALIB (floor, VOIDS THE WHOLE PROBE). Run on GothicArches' S113 TARGET SET, where the independent
//      footprint oracle already says 99.37% of area is irreducible. The path probe must agree on >= 90%
//      of those pairs. If it does not, the two instruments disagree and NEITHER number is quotable.
//  CTL-DEGEN (reported, not a bar). Fraction of probed pairs whose pathLenMm is below the finite-
//      difference step — those rows are EXCLUDED from every share, and the exclusion is printed.
//
// COUNT + AREA-SHARE + MAX on every population. Never averaged across styles.
//
// Usage: bash research/tools/run-s114b-curtain.sh
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormals, orientOfFacet } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const DEG = 180 / Math.PI;

const DIR = process.env.PF_S114B_DIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';
const DEFAULT_STEMS = [
  'Crystalline:crystalline_ring_D--',
  'DragonScales:dragonscales_ring_D--',
  'GeometricStar:geometricstar_ring_D--',
  'GothicArches:gothicarches_ring_DS-HT_S39CTL',
].join(',');
const STEMS = (process.env.PF_S114C_STEMS ?? DEFAULT_STEMS).split(',').map((s) => s.trim()).filter((s) => s.length > 0);
const TAG = process.env.PF_S114C_TAG ?? 'B';
const OUTDIR = 'research/exchange/_strataConformBisect/s114sweep';

const DIMS: StyleDims = { H: envF('PF_S114C_H', 120), Rb: envF('PF_S114C_RB', 40), Rt: envF('PF_S114C_RT', 50), expn: 1 };
const H = DIMS.H;
const HI_DEG = envF('PF_S114C_HI_DEG', 45);
const CURTAIN_RATIO = envF('PF_S114C_CURTAIN', 8);
const MSAMP = envI('PF_S114C_M', 513);          // samples along the probe path
const NPAIR = envI('PF_S114C_NPAIR', 3000);     // probed pairs per population
const NSMOOTH = envI('PF_S114C_NSMOOTH', 2000); // smooth-control pairs
const H_FD = envF('PF_S114C_HFD', 2e-4);
const K = envI('PF_S114C_K', 8);
const INSET_HI = envF('PF_S114C_INSET_HI', 0.05);
const DROP_CUT = envF('PF_S114C_DROP', 0.25);
const NORMHI_MIN = envF('PF_S114C_NORMHI', 10);
const CALIB_FLOOR = envF('PF_S114C_CALIB', 90);  // % of Gothic's target the path probe must confirm
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.6 / 1000,
};

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const NDJSON = `${OUTDIR}/S114_CURTAIN_${TAG}.ndjson`;

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
function goldenStride(n: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let gs = Math.max(1, Math.round(n * 0.6180339887498949) | 1);
  while (gs > 1 && gcd(gs, n) !== 1) gs += 2;
  return gs >= n ? 1 : gs;
}

log('===================================================================================================');
log('  S114-B FOLLOW-UP — THE CURTAIN CLASS: is the >45 deg dihedral REAL ANALYTIC TURN there too?');
log('===================================================================================================');
log(`path probe: M=${MSAMP} samples, kink-aware fd h=${H_FD} mm, centroid-to-centroid in (theta,z), dThRaw-unwrapped`);
log(`pre-registered: CTL-SMOOTH <= 5% over ${HI_DEG} deg (VOIDS style)   CTL-CALIB >= ${CALIB_FLOOR}% agreement with the S113 oracle on Gothic's target (VOIDS THE PROBE)`);
log('');

interface Row { [k: string]: unknown }
const out: Row[] = [];
let calibPct = NaN;

for (const spec of STEMS) {
  const [STYLE, stem] = spec.split(':');
  const STL = `${DIR}/${stem}.stl`;
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${STYLE}   ${stem} ═════`);
  if (!existsSync(STL)) { log(`  *** MISSING: ${STL} ***`); continue; }
  const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const M = readMeshFloat64(STL, false);
  const xyz = M.xyz; const nTri = M.nTri;
  {
    let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    }
    log(`  PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um`);
    if (worst * 1000 > 50) { log('  *** REFUSED ***'); continue; }
  }
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  const ns = fdNormals(rA, H, H_FD, H_FD);
  const scratch = new Float64Array(12);
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
  // centroid in (theta, z), theta unwrapped from the facet's own first vertex
  const cenTZ = (f: number): [number, number] => {
    const [ath, bth, cth] = th3(f);
    return [(ath + bth + cth) / 3, (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3];
  };
  const sharedEndpoints = (e: number): number[] | null => {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e]; const o: number[] = [];
    for (let a = 0; a < 3; a += 1) {
      const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
      for (let b = 0; b < 3; b += 1) {
        if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { o.push(ax, ay, az); break; }
      }
    }
    return o.length === 6 ? o : null;
  };
  const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
    let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    return Math.acos(dp);
  };

  interface Probe { jump: number; diam: number; ptSpread: number; endTurn: number; lenMm: number }
  const buf = new Float64Array(MSAMP * 4 * 3);
  const cnt = new Int32Array(MSAMP);
  function probe(f1: number, f2: number): Probe {
    const [t1, z1] = cenTZ(f1);
    const c2 = cenTZ(f2);
    const t2 = t1 + dThRaw(t1, c2[0]); const z2 = c2[1];
    const rRef = (rRefOf(f1) + rRefOf(f2)) / 2;
    const lenMm = Math.hypot(rRef * (t2 - t1), z2 - z1);
    let m = 0;
    for (let i = 0; i < MSAMP; i += 1) {
      const u = i / (MSAMP - 1);
      const nc = ns(t1 + (t2 - t1) * u, z1 + (z2 - z1) * u, scratch);
      cnt[i] = nc;
      for (let qi = 0; qi < nc; qi += 1) {
        buf[m * 3] = scratch[qi * 3]; buf[m * 3 + 1] = scratch[qi * 3 + 1]; buf[m * 3 + 2] = scratch[qi * 3 + 2];
        m += 1;
      }
    }
    // per-sample offsets
    const off = new Int32Array(MSAMP + 1);
    for (let i = 0; i < MSAMP; i += 1) off[i + 1] = off[i] + cnt[i];
    let ptSpread = 0;
    for (let i = 0; i < MSAMP; i += 1) {
      for (let a = off[i]; a < off[i + 1]; a += 1) for (let b = a + 1; b < off[i + 1]; b += 1) {
        const t = angU(buf, a * 3, buf, b * 3); if (t > ptSpread) ptSpread = t;
      }
    }
    // MIN over candidate pairs between consecutive samples: the smallest consistent step. Taking the MAX
    // here would read the crease jump at EVERY sample on a kink-aware sampler and manufacture turn.
    let jump = 0;
    for (let i = 0; i + 1 < MSAMP; i += 1) {
      let best = Infinity;
      for (let a = off[i]; a < off[i + 1]; a += 1) for (let b = off[i + 1]; b < off[i + 2]; b += 1) {
        const t = angU(buf, a * 3, buf, b * 3); if (t < best) best = t;
      }
      if (Number.isFinite(best) && best > jump) jump = best;
    }
    // diameter over the first candidate at each sample (a consistent one-sided branch), on a STRIDED
    // subset so the O(M^2) term stays bounded — it is a bracket, not the statistic, and the stride is
    // printed in the header rather than hidden.
    let diam = 0;
    const ds = Math.max(1, Math.ceil(MSAMP / 64));
    for (let i = 0; i < MSAMP; i += ds) for (let j = i + ds; j < MSAMP; j += ds) {
      const t = angU(buf, off[i] * 3, buf, off[j] * 3); if (t > diam) diam = t;
    }
    const endTurn = angU(buf, off[0] * 3, buf, off[MSAMP - 1] * 3);
    return { jump: jump * DEG, diam: diam * DEG, ptSpread: ptSpread * DEG, endTurn: endTurn * DEG, lenMm };
  }

  // ── populations ────────────────────────────────────────────────────────────────────────────────────
  const hiE: number[] = []; const smoothE: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    const a = d.edgeAngRad[e] * DEG;
    if (a > HI_DEG) hiE.push(e); else if (a < 2) smoothE.push(e);
  }
  const isCurtain = (e: number): boolean => graphRatio(d.edgeF1[e]) > CURTAIN_RATIO || graphRatio(d.edgeF2[e]) > CURTAIN_RATIO;
  const curtainE: number[] = []; const wallE: number[] = [];
  {
    const gs = hiE.length > 0 ? goldenStride(hiE.length) : 1;
    const cap = Math.min(hiE.length, NPAIR * 4);
    for (let i = 0; i < cap; i += 1) { const e = hiE[(i * gs) % hiE.length]; (isCurtain(e) ? curtainE : wallE).push(e); }
  }
  const take = (arr: number[], n: number): number[] => {
    if (arr.length <= n) return arr;
    const gs = goldenStride(arr.length); const o: number[] = [];
    for (let i = 0; i < n; i += 1) o.push(arr[(i * gs) % arr.length]);
    return o;
  };
  const smoothWall = take(smoothE.filter((e, i) => i % 7 === 0 && !isCurtain(e)), NSMOOTH);

  function scoreSet(name: string, es: number[]): Row | null {
    if (es.length === 0) { log(`  ── ${name}: EMPTY population ──`); return null; }
    const rows = es.map((e) => {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const p = probe(f1, f2);
      return { e, f1, f2, area: d.areaMm2[f1] + d.areaMm2[f2], meas: d.edgeAngRad[e] * DEG, ...p };
    });
    const live = rows.filter((r) => r.lenMm > H_FD);
    const degen = rows.length - live.length;
    // ⚠ THE CRITERION, AND WHY `jump` IS NOT IN IT. `jump` is the MIN-MATCHED angle between consecutive
    // samples' candidate sets. At M=513 over a ~0.03 mm path the sample spacing (~6e-5 mm) is BELOW the
    // finite-difference step (2e-4 mm), so many consecutive samples BOTH carry both one-sided branches and
    // the min-match finds the same-side pair — the jump collapses to ~0 even across a 150 deg crease.
    // MEASURED on Gothic's straddling set: jump p50 0.22 deg while ptSpread p50 103.65 deg on the same
    // rows. `jump` is therefore a LOWER bound that goes vacuous under refinement; it is printed (so the
    // effect is visible) and EXCLUDED from the decision. The criterion is the one-sided candidate spread
    // at a point (the crease detector `orientRuler` documents) OR the normal-set diameter along the path.
    const irr = live.filter((r) => r.ptSpread >= HI_DEG || r.diam >= HI_DEG);
    let aAll = 0; let aIrr = 0;
    for (const r of live) aAll += r.area;
    for (const r of irr) aIrr += r.area;
    const pct = live.length > 0 ? (100 * irr.length) / live.length : NaN;
    const apct = aAll > 0 ? (100 * aIrr) / aAll : NaN;
    log(`  ── ${name}  n=${rows.length}  (degenerate path < ${H_FD} mm: ${degen} = ${((100 * degen) / rows.length).toFixed(2)}%, EXCLUDED)  ──`);
    log(`     pathLen mm      p10 ${q(live.map((r) => r.lenMm), 0.1).toExponential(2)} p50 ${q(live.map((r) => r.lenMm), 0.5).toExponential(2)} p90 ${q(live.map((r) => r.lenMm), 0.9).toExponential(2)}`);
    log(`     pathJump deg    p10 ${q(live.map((r) => r.jump), 0.1).toFixed(2)} p50 ${q(live.map((r) => r.jump), 0.5).toFixed(2)} p90 ${q(live.map((r) => r.jump), 0.9).toFixed(2)} MAX ${mx(live.map((r) => r.jump)).toFixed(2)}`);
    log(`     pathDiam deg    p50 ${q(live.map((r) => r.diam), 0.5).toFixed(2)} p90 ${q(live.map((r) => r.diam), 0.9).toFixed(2)} MAX ${mx(live.map((r) => r.diam)).toFixed(2)}`);
    log(`     ptSpread deg    p50 ${q(live.map((r) => r.ptSpread), 0.5).toFixed(2)} p90 ${q(live.map((r) => r.ptSpread), 0.9).toFixed(2)} MAX ${mx(live.map((r) => r.ptSpread)).toFixed(2)}`);
    log(`     endTurn  deg    p50 ${q(live.map((r) => r.endTurn), 0.5).toFixed(2)} p90 ${q(live.map((r) => r.endTurn), 0.9).toFixed(2)}   FOOTPRINT/ENDPOINT ratio at p50 x${(q(live.map((r) => r.jump), 0.5) / Math.max(1e-9, q(live.map((r) => r.endTurn), 0.5))).toFixed(2)}`);
    log(`     mesh dihedral   p50 ${q(live.map((r) => r.meas), 0.5).toFixed(2)} p90 ${q(live.map((r) => r.meas), 0.9).toFixed(2)} MAX ${mx(live.map((r) => r.meas)).toFixed(2)}`);
    log(`     *** ANALYTIC TURN >= ${HI_DEG} deg:  COUNT ${irr.length}/${live.length} = ${pct.toFixed(2)}%   AREA-share ${apct.toFixed(2)}% ***`);
    return {
      style: STYLE, stem, pop: name, n: rows.length, live: live.length, degen,
      irrN: irr.length, irrPct: pct, irrAreaPct: apct,
      jumpP50: q(live.map((r) => r.jump), 0.5), jumpP90: q(live.map((r) => r.jump), 0.9), jumpMax: mx(live.map((r) => r.jump)),
      endP50: q(live.map((r) => r.endTurn), 0.5),
      lenP50: q(live.map((r) => r.lenMm), 0.5),
      measP50: q(live.map((r) => r.meas), 0.5),
    };
  }

  const rCur = scoreSet(`CURTAIN pairs (>${HI_DEG} deg, graphRatio>${CURTAIN_RATIO})`, take(curtainE, NPAIR));
  const rWall = scoreSet(`WALL pairs (>${HI_DEG} deg, graphRatio<=${CURTAIN_RATIO})`, take(wallE, NPAIR));
  const rSm = scoreSet('CTL-SMOOTH wall pairs (dihedral < 2 deg)', smoothWall);
  for (const r of [rCur, rWall, rSm]) if (r !== null) { out.push(r); appendFileSync(NDJSON, `${JSON.stringify(r)}\n`); }
  if (rSm !== null) {
    const v = rSm.irrPct as number;
    log(`  CTL-SMOOTH: ${v.toFixed(2)}% of smooth pairs read >= ${HI_DEG} deg analytic turn  (VOIDS this style if > 5%)`);
    if (v > 5) log('  *** CTL-SMOOTH FIRED — the path probe manufactures turn on this style. ITS NUMBERS ARE VOID. ***');
  }

  // ── CTL-CALIB: on Gothic, re-probe the S113 TARGET SET and compare with the footprint oracle ────────
  if (STYLE === 'GothicArches') {
    const tgt: number[] = [];
    for (const e of hiE) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) continue;
      const nd = (f: number, ins: number): number => {
        const [ath, bth, cth] = th3(f);
        return orientOfFacet(ns, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
          xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K, inset: ins, orient: 'winding', scratch }).normDeg;
      };
      const hi = Math.max(nd(f1, INSET_HI), nd(f2, INSET_HI));
      const lo = Math.max(nd(f1, 0), nd(f2, 0));
      const drop = lo > 1e-9 ? hi / lo : 1;
      if (!(drop >= DROP_CUT && hi > NORMHI_MIN)) continue;
      // CREASE-LABEL, so the calibration population is the oracle's OWN 3,282 and not the 5,174
      // straddling superset. Comparing an instrument against another instrument's number on a DIFFERENT
      // population is how a population difference gets reported as an instrument disagreement.
      const pE = sharedEndpoints(e); if (pE === null) continue;
      const thE = Math.atan2(pE[1], pE[0]);
      const kE = locateKinkRaw(rA, thE, pE[2], thE + dThRaw(thE, Math.atan2(pE[4], pE[3])), pE[5], PRED);
      const a1 = cenTZ(f1); const a2 = cenTZ(f2);
      const kS = locateKinkRaw(rA, a1[0], a1[1], a1[0] + dThRaw(a1[0], a2[0]), a2[1], PRED);
      if ((kE === null || kE.jump) && (kS === null || kS.jump)) continue;
      tgt.push(e);
    }
    log(`  ── CTL-CALIB: the S113 crease-labelled TARGET set rebuilt here = ${tgt.length} pairs (S112/S113 pinned 3,282) ──`);
    const rC = scoreSet('CTL-CALIB Gothic straddling set', take(tgt, NPAIR));
    if (rC !== null) {
      calibPct = rC.irrPct as number;
      out.push(rC); appendFileSync(NDJSON, `${JSON.stringify(rC)}\n`);
      log(`  *** CTL-CALIB: path probe confirms ${calibPct.toFixed(2)}% where the S113 footprint oracle read 99.37% of area / 93.29% of pairs. FLOOR ${CALIB_FLOOR}%. ***`);
      if (calibPct < CALIB_FLOOR) log('  *** CTL-CALIB FIRED — path probe and footprint oracle DISAGREE. NEITHER IS QUOTABLE. ***');
    }
  }
  log(`  ${el()}`);
}

log('');
log('===================================================================================================');
log('  S114-B CURTAIN TABLE   (COUNT + AREA-share, per style, never averaged)');
log('===================================================================================================');
log('style           population                                        n   live  turn>=45 cnt%  area%   jump p50  dihedral p50');
for (const r of out) {
  log(`${String(r.style).padEnd(15)} ${String(r.pop).padEnd(48)} ${String(r.n).padStart(5)} ${String(r.live).padStart(6)} ${(r.irrPct as number).toFixed(2).padStart(13)} ${(r.irrAreaPct as number).toFixed(2).padStart(7)} ${(r.jumpP50 as number).toFixed(2).padStart(10)} ${(r.measP50 as number).toFixed(2).padStart(13)}`);
}
writeFileSync(`${OUTDIR}/S114_CURTAIN_${TAG}.json`, `${JSON.stringify({
  tag: TAG, dims: DIMS, probe: { MSAMP, H_FD, HI_DEG, CURTAIN_RATIO, NPAIR }, calibPct, rows: out,
}, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_CURTAIN_${TAG}.json`);
log(`done ${el()}`);
