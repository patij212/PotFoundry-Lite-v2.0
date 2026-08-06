// s113StraddleDump.ts — PIN THE TARGET SET. The 3,282 straddling crease pairs, as a durable artifact.
//
// WHY A DUMP AND NOT A RECOMPUTATION IN EVERY TOOL. S113 fans several independent analyses at this class.
// If each recomputes its own membership, a threshold drift in any one of them silently changes WHICH
// facets are being discussed, and the analyses stop being about the same thing. This writes the set once,
// with every quantity a downstream tool could want, so that every S113 result is about the SAME 3,282.
//
// MEMBERSHIP (S112's definition, reproduced exactly — see 2026-08-06-S112-ANGULAR-QUANTITY.md):
//   dihedral > 45 deg                                   (S108's visible class)
//   AND graphRatio <= 8                                 (WALL: the analytic ruler is DEFINED here)
//   AND normDeg(inset 0.05) / normDeg(inset 0) >= 0.25   (STRADDLING, not merely crease-CONFORMED)
//   AND normDeg(inset 0.05) > 10 deg
//   AND a crease on the shared edge or the centroid segment  (S109/S110's label)
// => 3,282 pairs, 0.1816% of mesh area. That is the WHOLE remaining Gothic crease problem, and it is
// 4.7x smaller than the 15,424 the campaign has been aiming at.
//
// WHY THIS CLASS IS THE RIGHT TARGET AND REFINEMENT IS NOT THE OPERATOR. Fixture H2 in
// `_orientRulerValidate.test.ts` measures a crease straddle under five halvings: the ANGLE is invariant
// (x0.9968) while a smooth control decays x28.43. *** DENSITY PROVABLY CANNOT FIX A STRADDLE. *** The
// only remedy is to put a mesh edge ON the crease. This dump carries, per pair, WHERE that edge would
// have to go — `locateTurnAdaptive`'s parameter along each facet edge — so an operator can be priced
// without re-deriving it.
//
// ⚠ `locateTurnAdaptive` CARRIES A KNOWN UNPATCHED TIE-BREAK DEFECT (S99, and visible at
// `orientRuler.ts:529`): when both half-angles compare equal the `>=` sends the bracket LEFT every
// iteration, so a genuinely smooth segment walks to the left end and returns a plausible-looking `s`.
// `turn` is dumped beside every `s` for exactly that reason — a small `turn` means IGNORE the `s`.
//
// Usage: bash research/tools/run-s113-dump.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, locateTurnAdaptive } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S113_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S113_HI_DEG', 45);
const K = Math.round(envF('PF_S113_K', 8));
const INSET_LO = envF('PF_S113_INSET_LO', 0);
const INSET_HI = envF('PF_S113_INSET_HI', 0.05);
const CURTAIN_RATIO = envF('PF_S113_CURTAIN', 8);
const DROP_CUT = envF('PF_S113_DROP', 0.25);
const DIMS: StyleDims = { H: envF('PF_S113_H', 120), Rb: envF('PF_S113_RB', 40), Rt: envF('PF_S113_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';

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
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== S113 — PIN THE TARGET SET: the straddling crease pairs =====');
log(`style ${STYLE}  tag ${TAG}   cuts: dihedral>${HI_DEG}  graphRatio<=${CURTAIN_RATIO}  drop>=${DROP_CUT}  normHi>10`);
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
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112 read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2  interior edges ${d.interiorEdges}  ${el()}`);

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
function orientOf(f: number, inset: number): { normDeg: number; spreadDeg: number } {
  const [ath, bth, cth] = th3(f);
  const o = orientOfFacet(nsKink,
    xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K, inset, scratch });
  return { normDeg: o.normDeg, spreadDeg: (o.spreadRad * 180) / Math.PI };
}
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
const centroid = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
const sharedEndpoints = (e: number): number[] | null => {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) {
      if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
    }
  }
  return out.length === 6 ? out : null;
};

const rows: Array<Record<string, unknown>> = [];
const hiThr = (HI_DEG * Math.PI) / 180;
let nHigh = 0; let nWall = 0; let nStrad = 0;
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  nHigh += 1;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) continue;   // CURTAIN: ruler undefined
  nWall += 1;
  const hi1 = orientOf(f1, INSET_HI); const hi2 = orientOf(f2, INSET_HI);
  const lo1 = orientOf(f1, INSET_LO); const lo2 = orientOf(f2, INSET_LO);
  const normHi = Math.max(hi1.normDeg, hi2.normDeg);
  const normLo = Math.max(lo1.normDeg, lo2.normDeg);
  const drop = normLo > 1e-9 ? normHi / normLo : 1;
  if (!(drop >= DROP_CUT && normHi > 10)) continue;                                  // CONFORMED, not straddling
  nStrad += 1;
  // crease label — S109/S110's, and WHERE on each locus
  const p = sharedEndpoints(e); if (p === null) continue;
  const thE = Math.atan2(p[1], p[0]);
  const kEdge = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
  const c1 = centroid(f1); const c2 = centroid(f2);
  const thC = Math.atan2(c1[1], c1[0]);
  const kSeg = locateKinkRaw(rA, thC, c1[2], thC + dThRaw(thC, Math.atan2(c2[1], c2[0])), c2[2], PRED);
  const onEdge = kEdge !== null && !kEdge.jump;
  const onSeg = kSeg !== null && !kSeg.jump;
  if (!onEdge && !onSeg) continue;                                                    // not crease-labelled
  // WHERE THE ALIGNED EDGE WOULD HAVE TO GO: locate the turn along each edge of BOTH facets.
  // `turn` is dumped beside every `s` — locateTurnAdaptive's tie-break walks left on a smooth segment,
  // so a small `turn` means the `s` is meaningless (S99's unpatched defect, orientRuler.ts:529).
  const locs: Array<{ f: number; edge: number; s: number; turnDeg: number; hFinal: number }> = [];
  for (const f of [f1, f2]) {
    const [ath, bth, cth] = th3(f);
    const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
    const ths = [ath, bth, cth];
    const rRef = (Math.hypot(xyz[f * 9], xyz[f * 9 + 1]) + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
    for (let ei = 0; ei < 3; ei += 1) {
      const j = (ei + 1) % 3;
      const lt = locateTurnAdaptive(rA, H, ths[ei], zs[ei], ths[j], zs[j], rRef, 14);
      locs.push({ f, edge: ei, s: lt.s, turnDeg: (lt.turn * 180) / Math.PI, hFinal: lt.hFinal });
    }
  }
  const mz = (c1[2] + c2[2]) / 2;
  let thDeg = (canonTheta((thC + Math.atan2(c2[1], c2[0])) / 2) * 180) / Math.PI; if (thDeg < 0) thDeg += 360;
  rows.push({
    e, f1, f2,
    measDeg: (d.edgeAngRad[e] * 180) / Math.PI,
    normHi, normLo, drop,
    spread1: hi1.spreadDeg, spread2: hi2.spreadDeg,
    area1: d.areaMm2[f1], area2: d.areaMm2[f2],
    gr1: graphRatio(f1), gr2: graphRatio(f2),
    onEdge, onSeg,
    kEdgeT: onEdge ? kEdge?.t : null,
    kSegT: onSeg ? kSeg?.t : null,
    z: mz, thDeg, thMod30: thDeg % 30,
    tri1: [xyz[f1 * 9], xyz[f1 * 9 + 1], xyz[f1 * 9 + 2], xyz[f1 * 9 + 3], xyz[f1 * 9 + 4], xyz[f1 * 9 + 5], xyz[f1 * 9 + 6], xyz[f1 * 9 + 7], xyz[f1 * 9 + 8]],
    tri2: [xyz[f2 * 9], xyz[f2 * 9 + 1], xyz[f2 * 9 + 2], xyz[f2 * 9 + 3], xyz[f2 * 9 + 4], xyz[f2 * 9 + 5], xyz[f2 * 9 + 6], xyz[f2 * 9 + 7], xyz[f2 * 9 + 8]],
    shared: p,
    locs,
  });
}

const uniqF = new Set<number>();
for (const r of rows) { uniqF.add(r.f1 as number); uniqF.add(r.f2 as number); }
let stradArea = 0;
for (const f of uniqF) stradArea += d.areaMm2[f];

log('');
log('── FUNNEL (every cut printed, so a membership drift downstream is visible) ──');
log(`  dihedral > ${HI_DEG} deg                    ${nHigh}     (S108: 19,582)`);
log(`  ... AND WALL (graphRatio <= ${CURTAIN_RATIO})        ${nWall}     (S112: 13,092)`);
log(`  ... AND STRADDLING (drop >= ${DROP_CUT}, normHi>10)  ${nStrad}     (S112: 5,174)`);
log(`  ... AND crease-labelled                 ${rows.length}     (S112: 3,282)   <== THE TARGET SET`);
log(`  unique facets ${uniqF.size}   AREA ${stradArea.toFixed(3)} mm2 = ${((stradArea / meshArea) * 100).toFixed(4)}% of mesh  (S112: 0.1816%)`);
log('');

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
log('── SHAPE OF THE TARGET SET ──');
log(`  measDeg   p10 ${q(rows.map((r) => r.measDeg as number), 0.1).toFixed(2)}  p50 ${q(rows.map((r) => r.measDeg as number), 0.5).toFixed(2)}  p90 ${q(rows.map((r) => r.measDeg as number), 0.9).toFixed(2)}`);
log(`  normHi    p10 ${q(rows.map((r) => r.normHi as number), 0.1).toFixed(2)}  p50 ${q(rows.map((r) => r.normHi as number), 0.5).toFixed(2)}  p90 ${q(rows.map((r) => r.normHi as number), 0.9).toFixed(2)}`);
log(`  drop      p10 ${q(rows.map((r) => r.drop as number), 0.1).toFixed(3)}  p50 ${q(rows.map((r) => r.drop as number), 0.5).toFixed(3)}  p90 ${q(rows.map((r) => r.drop as number), 0.9).toFixed(3)}`);
log(`  z         p10 ${q(rows.map((r) => r.z as number), 0.1).toFixed(1)}  p50 ${q(rows.map((r) => r.z as number), 0.5).toFixed(1)}  p90 ${q(rows.map((r) => r.z as number), 0.9).toFixed(1)} mm`);
log(`  crease on SHARED EDGE ${rows.filter((r) => r.onEdge).length}   on CENTROID SEGMENT ${rows.filter((r) => r.onSeg).length}   both ${rows.filter((r) => r.onEdge && r.onSeg).length}`);
const bins = new Array(12).fill(0);
for (const r of rows) bins[Math.min(11, Math.floor(((r.thMod30 as number) / 30) * 12))] += 1;
log(`  theta mod 30 deg (12-fold fundamental domain), 12 bins: ${bins.join(' ')}`);
const turns = rows.flatMap((r) => (r.locs as Array<{ turnDeg: number }>).map((l) => l.turnDeg));
log(`  locateTurnAdaptive turn over all ${turns.length} facet edges: p10 ${q(turns, 0.1).toFixed(3)} p50 ${q(turns, 0.5).toFixed(3)} p90 ${q(turns, 0.9).toFixed(2)} deg`);
log('    (a SMALL turn means that edge carries no crease and its `s` must be IGNORED — the tie-break defect)');
log('');

writeFileSync(`${OUTDIR}/S113_STRADDLE_${TAG}.ndjson`, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
writeFileSync(`${OUTDIR}/S113_STRADDLE_${TAG}.meta.json`, `${JSON.stringify({
  style: STYLE, stl: STL, cuts: { HI_DEG, CURTAIN_RATIO, DROP_CUT, INSET_LO, INSET_HI, K },
  meshFacets: nTri, meshAreaMm2: meshArea,
  funnel: { high: nHigh, wall: nWall, straddling: nStrad, target: rows.length },
  uniqueFacets: uniqF.size, targetAreaMm2: stradArea, targetAreaPct: (stradArea / meshArea) * 100,
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S113_STRADDLE_${TAG}.ndjson  (${rows.length} rows)`);
log(`done ${el()}`);
