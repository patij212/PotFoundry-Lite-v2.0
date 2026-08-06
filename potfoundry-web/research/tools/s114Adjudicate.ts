// s114Adjudicate.ts — SETTLE THE CONTESTED 12.7x. ONE DEFENSIBLE NUMBER FOR GOTHIC'S VISIBLE DEFECT AREA.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS BEING ADJUDICATED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S112 published "Gothic's visible defect class is 0.1872% of mesh area, not S108's 2.3699%" — a 12.66x
// reduction — via two independent scoping legs. Two reviewers then moved the figure in OPPOSITE
// directions and it was never settled:
//
//   LEG 1 (CURTAIN). S112 dropped every high-dihedral pair whose `graphRatio` (3D area / (r*theta,z)
//   parameter area) exceeds 8, on the grounds that "the surface is not a graph of rA there, so the ruler
//   is undefined". Worth 2.3699 -> 1.7602 = 1.35x. REVIEWER A: that class is continuous on-surface STEEP
//   WALL, not non-graph, so the exclusion is wrong and the honest figure RISES.
//
//   LEG 2 (ACCOUNTING). S112's rows are EDGE PAIRS. `drop` is a ratio of two PAIR maxima and the area is
//   credited over the UNION of both facets of every qualifying pair, while the claim is per facet.
//   REVIEWER B: only ~62% of the credited facets individually straddle, so the figure FALLS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DECISIVE TESTS, CHOSEN BEFORE THE FIRST RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// LEG 1 is a mathematical question with a mathematical answer. A surface fails to be a graph of rA over
// (theta, z) at a point iff rA is MULTI-VALUED or DISCONTINUOUS there. `graphRatio > 8` is NOT that test:
// a graph with a large but finite area-distortion Jacobian J = sqrt(1 + r_z^2 + (r_th/r)^2) produces a
// large graphRatio and is still perfectly a graph. So three DIRECT tests replace the proxy:
//
//   T1  DISCONTINUITY, PROBED OVER THE FOOTPRINT.  `locateKinkRaw` carries the driver's own `jump` flag:
//       its two-scale ratio |D2r|(w/4)/|D2r|(w) reads ~1/16 on a smooth curvature peak, ~1/4 on a C0
//       crease (r continuous, r' jumps) and ~1 on a genuine JUMP in r. `jump := ratio > 0.62` is
//       therefore a discontinuity detector, and the driver already calls jump loci "curtain material".
//       *** PROBED OVER A CHORD FAN COVERING THE FOOTPRINT, NOT THE THREE EDGES *** — the 13x endpoint
//       under-read scar — with a CHORD-DENSITY LADDER so the reader sees convergence.
//   T2  DEGENERATE PROJECTION.  Do the three vertices project to DISTINCT (r*theta, z)? A truly vertical
//       curtain facet collapses in parameter space; a steep wall facet does not.
//   T3  MERELY LARGE vs SINGULAR.  For any graph, 3D area = INTEGRAL of J over the parameter footprint,
//       hence graphRatio <= sup J over that footprint. So `graphRatio / J_sup` is a near-rigorous
//       non-graph certificate: ~1 means the ratio is fully explained by a steep-but-finite Jacobian.
//       J_sup is measured ON EACH FACET'S OWN FOOTPRINT at the ruler's own step, not on a global grid.
//   T4  ON-SURFACE RESIDUAL. max |hypot(x,y) - rA| over the interior footprint (S113c's D2, replicated).
//
// LEG 2 is an accounting question. Every quantity is recomputed PER FACET and reported beside the pair
// form, with the swap rate (how often the two pair maxima are attained on DIFFERENT facets) priced.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS — every one of them two-sided, because a one-sided bar is satisfied by a degenerate answer
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  C0  FUNNEL REPRODUCTION. S112's five printed numbers must come back to the digit. If any drifts I am
//      not measuring S112's object and the whole run is VOID.
//  C1  FLOOR on T1/T2/T3: the WALL class must read ~zero non-graph. If the tests fire on wall too, they
//      are not discriminating and leg 1 cannot be settled with them.
//  C2  *** POSITIVE CONTROL ON T1 — the one that makes a NEGATIVE result mean something. *** A negative
//      finding ("no facet is non-graph") is worthless unless the probe CAN fire. The identical chord fan
//      is run against a SYNTHETIC radius `rA + step*[theta >= pi]` at a ladder of step sizes, on the same
//      footprint shapes. If the probe cannot see a 1-um step it is not entitled to say "no jump here".
//  C3  GLOBAL CONTINUITY SCAN of rA itself on a dense (theta,z) grid — a whole-surface statement that
//      the per-facet result must agree with.
//  C4  ORACLE INDEPENDENCE is VERIFIED, NOT ASSERTED: S113's fidelity predicate (interior straddle at
//      inset 0.1) is re-evaluated on the pinned set (must reproduce 1,537 / 15.8233 mm2) AND on the
//      leg-1-restored and leg-2-strict sets, so the reader sees whether the PREDICATE or only the TALLY
//      is cut-independent.
//
// MEASUREMENT DISCIPLINE. Every population is COUNT + AREA-SHARE + MAX. `inset` is passed EXPLICITLY at
// every call site and swept. Lattice order k is swept. No verdict rests on a single threshold: the
// curtain cut, the drop cut, the norm bar and the inset are all laddered in the final table.
//
// Usage: bash research/tools/run-s114-adjudicate.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst, type SweepRadiusFn } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114_STYLE ?? 'GothicArches';
const STL = process.env.PF_S114_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S114_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/adjudicate';

const HI_DEG = envF('PF_S114_HI_DEG', 45);
const K = Math.round(envF('PF_S114_K', 8));
const INSET_LO = envF('PF_S114_INSET_LO', 0);
const INSET_HI = envF('PF_S114_INSET_HI', 0.05);
const DROP_CUT = envF('PF_S114_DROP', 0.25);
const NORM_BAR = envF('PF_S114_BAR', 10);
const CURTAIN_RATIO = envF('PF_S114_CURTAIN', 8);
const NCH = Math.round(envF('PF_S114_NCH', 6));           // chord-fan density for T1
const WALL_SAMP = Math.round(envF('PF_S114_WALLSAMP', 5000));
const STAGES = process.env.PF_S114_STAGES ?? '01234';
const VISLIM = Math.round(envF('PF_S114_VISLIM', 0));     // smoke only: cap the per-facet ruler set
const H_FD = 2e-4;
const DEG = 180 / Math.PI;

const DIMS: StyleDims = { H: envF('PF_S114_H', 120), Rb: envF('PF_S114_RB', 40), Rt: envF('PF_S114_RT', 50), expn: 1 };
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

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);

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
const nsKink: NormalSampler = fdNormals(rA, H, H_FD, H_FD);
const scratch = new Float64Array(12);

log('===== S114 — ADJUDICATION OF THE CONTESTED 12.7x =====');
log(`style ${STYLE}  tag ${TAG}  visibility cut ${HI_DEG} deg  k=${K}  insets ${INSET_LO}/${INSET_HI}  drop ${DROP_CUT}  bar ${NORM_BAR}  curtain ${CURTAIN_RATIO}x`);
log(`sampler fdNormals (KINK-AWARE) h=${H_FD} mm   convention=winding   chord-fan NCH=${NCH}`);
log('LEG 1 asks: is the curtain class NON-GRAPH (rA multi-valued/discontinuous) or merely STEEP?');
log('LEG 2 asks: does the class survive strict PER-FACET accounting?');
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
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um on this mesh)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch voids every analytic number. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  inconsistent ${d.inconsistentEdges}  ${el()}`);
log('');

// ─────────────────────────────── shared geometry, byte-identical to S112/S113 ───────────────────────────
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
  const aP = 0.5 * Math.abs((rRefOf(f) * (bth - ath)) * (cz - az) - (bz - az) * (rRefOf(f) * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
function orientOf(f: number, inset: number, k = K): { normDeg: number; spreadDeg: number } {
  const [ath, bth, cth] = th3(f);
  const o = orientOfFacet(nsKink, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4],
    xyz[f * 9 + 5], xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
    { k, orient: 'winding', scratch, inset });
  return { normDeg: o.normDeg, spreadDeg: (o.spreadRad * 180) / Math.PI };
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
/** S109/S110/S112's crease label EXACTLY: a non-jump kink on the shared edge OR on the centroid segment. */
const creaseLabel = (e: number): boolean => {
  const p = sharedEndpoints(e);
  if (p !== null) {
    const th0 = Math.atan2(p[1], p[0]);
    const kEdge = locateKinkRaw(rA, th0, p[2], th0 + dThRaw(th0, Math.atan2(p[4], p[3])), p[5], PRED);
    if (kEdge !== null && !kEdge.jump) return true;
  }
  const c1 = centroid(d.edgeF1[e]); const c2 = centroid(d.edgeF2[e]);
  const thc = Math.atan2(c1[1], c1[0]);
  const kSeg = locateKinkRaw(rA, thc, c1[2], thc + dThRaw(thc, Math.atan2(c2[1], c2[0])), c2[2], PRED);
  return kSeg !== null && !kSeg.jump;
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — THE PER-FACET TABLE, THEN S112'S FUNNEL REPRODUCED FROM IT (control C0)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const hiThr = (HI_DEG * Math.PI) / 180;
const vis: number[] = [];
for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) vis.push(f);
if (VISLIM > 0 && vis.length > VISLIM) vis.length = VISLIM;
const idxOf = new Map<number, number>();
for (let i = 0; i < vis.length; i += 1) idxOf.set(vis[i], i);
const fGr = new Float64Array(vis.length);
const fNormLo = new Float64Array(vis.length);
const fNormHi = new Float64Array(vis.length);
const fSpread = new Float64Array(vis.length);
for (let i = 0; i < vis.length; i += 1) {
  const f = vis[i];
  fGr[i] = graphRatio(f);
  const lo = orientOf(f, INSET_LO); const hi = orientOf(f, INSET_HI);
  fNormLo[i] = lo.normDeg; fNormHi[i] = hi.normDeg; fSpread[i] = hi.spreadDeg;
}
const fDrop = new Float64Array(vis.length);
for (let i = 0; i < vis.length; i += 1) fDrop[i] = fNormLo[i] > 1e-9 ? fNormHi[i] / fNormLo[i] : 1;
log(`VIS universe: ${vis.length} facets with an adjacent dihedral > ${HI_DEG} deg   ${el()}`);

const areaOfSet = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const uniqOfRows = (rs: Array<{ f1: number; f2: number }>): Set<number> => {
  const s = new Set<number>(); for (const r of rs) { s.add(r.f1); s.add(r.f2); } return s;
};

type Row = { e: number; f1: number; f2: number; measDeg: number; curtain: boolean; grMax: number; crease: boolean; normHi: number; normLo: number; drop: number; spread1: number; spread2: number };
const allRows: Row[] = [];
if (VISLIM === 0) {
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const i1 = idxOf.get(f1) as number; const i2 = idxOf.get(f2) as number;
    const normHi = Math.max(fNormHi[i1], fNormHi[i2]);
    const normLo = Math.max(fNormLo[i1], fNormLo[i2]);
    allRows.push({
      e, f1, f2, measDeg: d.edgeAngRad[e] * DEG,
      curtain: fGr[i1] > CURTAIN_RATIO || fGr[i2] > CURTAIN_RATIO, grMax: Math.max(fGr[i1], fGr[i2]),
      crease: false, normHi, normLo, drop: normLo > 1e-9 ? normHi / normLo : 1,
      spread1: fSpread[i1], spread2: fSpread[i2],
    });
  }
}
log(`high-dihedral PAIRS: ${allRows.length}   ${el()}`);

const rep = (name: string, fs: Set<number> | number[], extra = ''): void => {
  const arr = Array.isArray(fs) ? fs : [...fs];
  const a = areaOfSet(arr);
  const nd = arr.map((f) => fNormHi[idxOf.get(f) as number]);
  log(`    ${name.padEnd(46)} n=${String(arr.length).padStart(6)}  AREA ${a.toFixed(4).padStart(10)} mm2 = ${((a / meshArea) * 100).toFixed(4).padStart(7)}% of mesh  MAX normDeg ${mx(nd).toFixed(2).padStart(7)}${extra}`);
};

if (STAGES.includes('0')) {
  log('');
  log('══════════ STAGE 0 — CONTROL C0: S112\'s FUNNEL REPRODUCED (a drift here VOIDS the run) ══════════');
  const wallRows = allRows.filter((r) => !r.curtain);
  const curtRows = allRows.filter((r) => r.curtain);
  const conf = wallRows.filter((r) => r.drop < DROP_CUT && r.normLo > NORM_BAR);
  const strad = wallRows.filter((r) => r.drop >= DROP_CUT && r.normHi > NORM_BAR);
  const tab = (nm: string, rs: Row[], expN: number, expPct: number): void => {
    const s = uniqOfRows(rs); const a = areaOfSet(s);
    const pct = (a / meshArea) * 100;
    const ok = rs.length === expN && Math.abs(pct - expPct) < 0.0002;
    log(`  ${nm.padEnd(34)} pairs ${String(rs.length).padStart(6)} (S112 ${String(expN).padStart(6)})  facets ${String(s.size).padStart(6)}  AREA ${a.toFixed(3).padStart(9)} mm2 = ${pct.toFixed(4)}% (S112 ${expPct.toFixed(4)}%)  ${ok ? '[ok]' : '*** DRIFT ***'}`);
  };
  tab('ALL high-dihedral', allRows, 19582, 2.3699);
  tab('WALL (graphRatio <= 8)', wallRows, 13092, 1.7602);
  tab('CURTAIN (graphRatio > 8)', curtRows, 6490, 0.6111);
  tab('CONFORMED (drop < 0.25)', conf, 7918, 1.5731);
  tab('STRADDLING (drop >= 0.25)', strad, 5174, 0.1872);
  log('  (S112\'s published funnel: 19582 / 13092 / 6490 / 7918 / 5174 and 2.3699 / 1.7602 / 0.6111 / 1.5731 / 0.1872 %)');
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — LEG 1. IS THE CURTAIN CLASS GENUINELY NON-GRAPH?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
/** T1 — the chord fan over a facet's parameter footprint. Returns the jump/kink verdict for that facet. */
function footprintJump(R: SweepRadiusFn, ath: number, az: number, bth: number, bz: number, cth: number, cz: number, nch: number):
{ jump: boolean; kink: boolean; maxRatio: number; nChords: number; nJump: number; jumpBigUm: number } {
  const V: Array<[number, number]> = [[ath, az], [bth, bz], [cth, cz]];
  let jump = false; let kink = false; let maxRatio = 0; let nChords = 0; let nJump = 0; let jumpBigUm = 0;
  const probe = (t0: number, y0: number, t1: number, y1: number): void => {
    nChords += 1;
    const k = locateKinkRaw(R, t0, y0, t1, y1, PRED);
    if (k === null) return;
    kink = true;
    if (k.ratio > maxRatio) maxRatio = k.ratio;
    // *** THE MAGNITUDE MATTERS AS MUCH AS THE FLAG. *** `jump` is a pure SHAPE test on |D2r|'s decay,
    // so it also fires when `big` is at the cancellation floor and the ratio is fp noise (a ratio > 1 is
    // not physical for a jump and the smoke run produced ratios up to 29). `big` IS the size of the
    // discontinuity the flag is claiming. A "cliff" of 0.3 um is not a cliff.
    if (k.jump) { jump = true; nJump += 1; if (k.big * 1000 > jumpBigUm) jumpBigUm = k.big * 1000; }
  };
  // the three edges
  for (let i = 0; i < 3; i += 1) { const a = V[i]; const b = V[(i + 1) % 3]; probe(a[0], a[1], b[0], b[1]); }
  // the fan: from each vertex to nch-1 interior points of the opposite edge — this COVERS the footprint
  for (let i = 0; i < 3; i += 1) {
    const v = V[i]; const p = V[(i + 1) % 3]; const qv = V[(i + 2) % 3];
    for (let j = 1; j < nch; j += 1) {
      const t = j / nch;
      probe(v[0], v[1], p[0] + t * (qv[0] - p[0]), p[1] + t * (qv[1] - p[1]));
    }
  }
  // ⚠ `jumpBigUm` WAS MISSING FROM THIS RETURN IN RUN 1 AND I AM RECORDING THAT RATHER THAN DELETING IT.
  // The consumer then evaluated `undefined >= 10`, which is false for every facet, so the ">= 10 um step"
  // gate in the LEG 1 VERDICT was VACUOUS: T1 contributed 0 to the certificate BY CONSTRUCTION, not by
  // measurement. It was caught because the printed step-size percentiles came back NaN while the jump
  // COUNT was non-zero — the exact "diff printed values, not verdicts" discipline this campaign runs on.
  // `s114JumpDiag.ts` then read the real values off `locateKinkRaw` directly: the flagged steps are
  // 1.3e-4 to 3.9e-2 um. So the direction did not change; the gate is now genuinely evaluated.
  return { jump, kink, maxRatio, nChords, nJump, jumpBigUm };
}

/** T3 — sup of the analytic area-distortion Jacobian J over a facet's own parameter footprint. */
function jacSup(ath: number, az: number, bth: number, bz: number, cth: number, cz: number, k: number, hArc: number): number {
  let best = 0;
  const hz = H_FD;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const a = i / k; const b = j / k; const c = 1 - a - b;
    const th = a * ath + b * bth + c * cth; const z = a * az + b * bz + c * cz;
    const r = rA(th, z);
    if (!(r > 1e-9)) continue;
    const dth = hArc / r;
    const rTh = (rA(th + dth, z) - rA(th - dth, z)) / (2 * dth);
    const zc = z < hz ? hz : z > H - hz ? H - hz : z;
    const rZ = (rA(th, zc + hz) - rA(th, zc - hz)) / (2 * hz);
    const J = Math.sqrt(1 + rZ * rZ + (rTh / r) * (rTh / r));
    if (J > best) best = J;
  }
  return best;
}

/** T4 — max |hypot(x,y) - rA(atan2(y,x), z)| over the facet's interior lattice, in um. */
function offSurfaceUm(f: number, k: number, inset: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const sh = 1 - inset; const sc = inset / 3;
  let worst = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const a = sh * (i / k) + sc; const b = sh * (j / k) + sc; const c = 1 - a - b;
    const px = a * ax + b * bx + c * cx; const py = a * ay + b * by + c * cy; const pz = a * az + b * bz + c * cz;
    const dd = Math.abs(Math.hypot(px, py) - rA(Math.atan2(py, px), pz));
    if (dd > worst) worst = dd;
  }
  return worst * 1000;
}

/**
 * T3' — THE WELL-POSED AREA TEST, and the one the verdict rests on.
 *
 * `graphRatio` divides the flat facet's 3D area by the area of its PARAMETER TRIANGLE. That denominator
 * collapses whenever the three parameter points are near-COLLINEAR — a NEEDLE footprint — and a needle
 * footprint is not a failure of graph-ness at all: the surface over a parameter LINE is a perfectly
 * single-valued ribbon, and a flat triangle spanning that ribbon has real 3D area over ~zero parameter
 * area. So a large graphRatio has TWO sufficient causes, only one of which S112's premise names.
 *
 * This replaces the ill-posed denominator with the ACTUAL analytic surface area over the SAME footprint,
 * summed over the lifted barycentric lattice — which is perfectly well conditioned on a needle. For a
 * facet whose vertices lie on a graph, A3/Asurf ~ 1. For a facet BRIDGING a discontinuity, the flat
 * triangle spans material the surface does not have there and the ratio diverges. That is a direct test
 * of the thing S112 claimed, with no parameter-triangle area anywhere in it.
 */
function surfAreaOverFootprint(f: number, k: number): number {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const np = ((k + 1) * (k + 2)) / 2;
  const P = new Float64Array(np * 3);
  const idOf: number[][] = [];
  let m = 0;
  for (let i = 0; i <= k; i += 1) {
    idOf.push([]);
    for (let j = 0; i + j <= k; j += 1) {
      const a = i / k; const b = j / k; const c = 1 - a - b;
      const th = a * ath + b * bth + c * cth; const z = a * az + b * bz + c * cz;
      const r = rA(th, z);
      P[m * 3] = r * Math.cos(th); P[m * 3 + 1] = r * Math.sin(th); P[m * 3 + 2] = z;
      idOf[i].push(m); m += 1;
    }
  }
  const tri = (p: number, qi: number, s: number): number => {
    const ux = P[qi * 3] - P[p * 3]; const uy = P[qi * 3 + 1] - P[p * 3 + 1]; const uz = P[qi * 3 + 2] - P[p * 3 + 2];
    const wx = P[s * 3] - P[p * 3]; const wy = P[s * 3 + 1] - P[p * 3 + 1]; const wz = P[s * 3 + 2] - P[p * 3 + 2];
    return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  };
  let a = 0;
  for (let i = 0; i < k; i += 1) for (let j = 0; i + j < k; j += 1) {
    a += tri(idOf[i][j], idOf[i + 1][j], idOf[i][j + 1]);
    if (i + j + 1 < k) a += tri(idOf[i + 1][j], idOf[i + 1][j + 1], idOf[i][j + 1]);
  }
  return a;
}
const facetArea3D = (f: number): number => d.areaMm2[f];
/** the shape quality of the PARAMETER triangle: 4*sqrt(3)*A / sum(edge^2). 1 = equilateral, 0 = needle. */
function paramQuality(f: number): number {
  const [ath, bth, cth] = th3(f);
  const rr = rRefOf(f);
  const P: Array<[number, number]> = [[rr * ath, xyz[f * 9 + 2]], [rr * bth, xyz[f * 9 + 5]], [rr * cth, xyz[f * 9 + 8]]];
  let s2 = 0;
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    s2 += (P[i][0] - P[j][0]) ** 2 + (P[i][1] - P[j][1]) ** 2;
  }
  const A = 0.5 * Math.abs((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]));
  return s2 > 0 ? (4 * Math.sqrt(3) * A) / s2 : 0;
}

/** T2 — the parameter footprint: min pairwise (r*theta, z) separation, and its ratio to the 3D diameter. */
function paramFootprint(f: number): { minParamMm: number; max3DMm: number; ratio: number; paramAreaMm2: number } {
  const [ath, bth, cth] = th3(f);
  const rr = rRefOf(f);
  const P: Array<[number, number]> = [[rr * ath, xyz[f * 9 + 2]], [rr * bth, xyz[f * 9 + 5]], [rr * cth, xyz[f * 9 + 8]]];
  const V: Array<[number, number, number]> = [
    [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2]],
    [xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5]],
    [xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8]]];
  let minP = Infinity; let max3 = 0;
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const dp = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
    const d3 = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]);
    if (dp < minP) minP = dp;
    if (d3 > max3) max3 = d3;
  }
  const pa = 0.5 * Math.abs((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]));
  return { minParamMm: minP, max3DMm: max3, ratio: max3 > 0 ? minP / max3 : 0, paramAreaMm2: pa };
}

const curtF: number[] = []; const wallF: number[] = [];
for (let i = 0; i < vis.length; i += 1) (fGr[i] > CURTAIN_RATIO ? curtF : wallF).push(vis[i]);
/** filled by STAGE 1: facets for which at least one of T1/T2/T3 certifies NON-GRAPH. */
const nonGraph = new Set<number>();
let nonGraphMeasured = false;

if (STAGES.includes('1')) {
  log('══════════ STAGE 1 — LEG 1: IS THE CURTAIN CLASS NON-GRAPH, OR MERELY STEEP? ══════════');
  log(`  per-FACET partition at graphRatio ${CURTAIN_RATIO}x:  CURTAIN ${curtF.length} facets  WALL ${wallF.length} facets`);
  rep('CURTAIN facets (per-facet gr > 8)', curtF);
  rep('WALL facets    (per-facet gr <= 8)', wallF);
  log('');
  log('  ── T0 IS THE RULER ACTUALLY UNDEFINED THERE? S112\'s premise, read straight off the instrument ──');
  log('     If rA has no normal to compare against on the curtain class, the ruler must return garbage on');
  log('     it. `inset` is passed EXPLICITLY and SWEPT, because the default is a measurement choice.');
  {
    const sub = (fs: number[], n: number): number[] => fs.filter((_, i) => i % Math.max(1, Math.floor(fs.length / n)) === 0).slice(0, n);
    const cs = sub(curtF, 1200); const ws = sub(wallF, 1200);
    for (const ins of [0, 0.02, 0.05, 0.1]) {
      const cn = cs.map((f) => orientOf(f, ins).normDeg); const wn = ws.map((f) => orientOf(f, ins).normDeg);
      const cp = cs.map((f) => orientOf(f, ins).spreadDeg);
      log(`     inset ${ins.toFixed(2)}  CURTAIN normDeg p50 ${q(cn, 0.5).toFixed(3).padStart(8)} p90 ${q(cn, 0.9).toFixed(3).padStart(8)} MAX ${mx(cn).toFixed(2).padStart(7)}  spreadDeg p50 ${q(cp, 0.5).toFixed(3)}   |   WALL normDeg p50 ${q(wn, 0.5).toFixed(3).padStart(8)} p90 ${q(wn, 0.9).toFixed(3).padStart(8)} MAX ${mx(wn).toFixed(2)}`);
    }
    for (const kk of [4, 8, 16]) {
      const cn = cs.map((f) => orientOf(f, INSET_HI, kk).normDeg);
      log(`     k=${String(kk).padStart(2)}       CURTAIN normDeg (inset ${INSET_HI}) p50 ${q(cn, 0.5).toFixed(3)} p90 ${q(cn, 0.9).toFixed(3)} MAX ${mx(cn).toFixed(2)}   [a footprint probe must converge in k]`);
    }
  }
  log('');

  // ── C2 POSITIVE CONTROL FIRST. A negative result is worthless if the probe cannot fire. ──
  log('  ── C2 POSITIVE CONTROL — can the T1 chord fan SEE a discontinuity at all? ──');
  log('     Identical probe, identical footprint shapes, against rJump = rA + step*[canonTheta >= pi].');
  {
    const samp = curtF.filter((_, i) => i % Math.max(1, Math.floor(curtF.length / 300)) === 0).slice(0, 300);
    for (const stepMm of [0.001, 0.01, 0.1, 1.0]) {
      const rJ: SweepRadiusFn = (th, z) => rA(th, z) + (canonTheta(th) >= Math.PI ? stepMm : 0);
      let fired = 0; let kinked = 0;
      for (const f of samp) {
        const [ath, bth, cth] = th3(f);
        const mid = (ath + bth + cth) / 3;
        const sh = Math.PI - mid;   // slide the footprint so it straddles the synthetic step
        const r = footprintJump(rJ, ath + sh, xyz[f * 9 + 2], bth + sh, xyz[f * 9 + 5], cth + sh, xyz[f * 9 + 8], NCH);
        if (r.jump) fired += 1;
        if (r.kink) kinked += 1;
      }
      log(`     step ${String(stepMm).padStart(6)} mm  =>  JUMP fired on ${fired}/${samp.length} (${((fired / samp.length) * 100).toFixed(1)}%)   any kink ${kinked}/${samp.length}`);
    }
    // and the negative half of the same control: the SAME shifted footprints against the REAL rA
    let fired0 = 0;
    for (const f of samp) {
      const [ath, bth, cth] = th3(f);
      const mid = (ath + bth + cth) / 3; const sh = Math.PI - mid;
      if (footprintJump(rA, ath + sh, xyz[f * 9 + 2], bth + sh, xyz[f * 9 + 5], cth + sh, xyz[f * 9 + 8], NCH).jump) fired0 += 1;
    }
    log(`     step  0.000 mm (the real rA, same shifted footprints)  =>  JUMP fired on ${fired0}/${samp.length}`);
    log('     [the probe is entitled to say "no jump" only if it fires on the small steps above]');
  }
  log('');

  // ── C3 GLOBAL CONTINUITY SCAN of rA ──
  log('  ── C3 GLOBAL CONTINUITY SCAN of rA — a whole-surface statement the per-facet result must match ──');
  {
    // A THREE-scale test, not two. The two-scale ratio alone also fires on CANCELLATION: when |D2r| at
    // the coarse window sits near a sign change, `big` collapses to the fp floor and small/big blows up
    // (the smoke run returned ratios of 29 — not physical for a jump). A genuine step of size S reads
    // |D2r| ~ S at EVERY scale, so the discriminator is that the three magnitudes AGREE, and the
    // magnitude itself says how big the alleged cliff is. Both are printed.
    const NT = 2400; const NZ = 200;
    let nJump2 = 0; let nJump3 = 0; let nBig = 0;
    const jumpBig: number[] = [];
    let worstBigUm = 0; let wth = 0; let wz = 0;
    const w = (2 * Math.PI) / NT;
    for (let iz = 1; iz < NZ; iz += 1) {
      const z = (iz / NZ) * H;
      for (let it = 0; it < NT; it += 1) {
        const th = (it / NT) * 2 * Math.PI;
        const c = rA(th, z);
        const b1 = Math.abs(rA(th + w, z) - 2 * c + rA(th - w, z));
        if (b1 < 1e-9) continue;
        nBig += 1;
        const b2 = Math.abs(rA(th + w / 4, z) - 2 * c + rA(th - w / 4, z));
        if (!(b2 / b1 > PRED.jumpRatio)) continue;
        nJump2 += 1;
        const b3 = Math.abs(rA(th + w / 16, z) - 2 * c + rA(th - w / 16, z));
        const lo = Math.min(b1, b2, b3); const hi = Math.max(b1, b2, b3);
        if (lo / hi > 0.5) {
          nJump3 += 1; jumpBig.push(hi * 1000);
          if (hi * 1000 > worstBigUm) { worstBigUm = hi * 1000; wth = th; wz = z; }
        }
      }
    }
    log(`     theta scan ${NT}x${NZ - 1} = ${(NT * (NZ - 1))} points, coarse window ${(w * DEG).toFixed(4)} deg`);
    log(`     points with |D2r| > 1e-9 mm: ${nBig}`);
    log(`       ... TWO-scale ratio > ${PRED.jumpRatio} (the driver's own flag):        ${nJump2}`);
    log(`       ... AND three-scale magnitudes agree within 2x (a REAL step):  ${nJump3}`);
    if (nJump3 > 0) {
      log(`     step size at those points: p50 ${q(jumpBig, 0.5).toFixed(4)} p90 ${q(jumpBig, 0.9).toFixed(4)} MAX ${worstBigUm.toFixed(4)} um  (worst at theta ${(wth * DEG).toFixed(3)} deg z ${wz.toFixed(2)} mm)`);
    }
    log('     [ratio ~0.0625 = smooth curvature peak; ~0.25 = C0 crease; >0.62 = a JUMP in r itself]');
  }
  log('');

  // ── T1 on the real classes, with the CHORD-DENSITY LADDER ──
  log('  ── T1 DISCONTINUITY over the FOOTPRINT (chord fan), with a DENSITY LADDER ──');
  {
    const wsamp = wallF.filter((_, i) => i % Math.max(1, Math.floor(wallF.length / WALL_SAMP)) === 0).slice(0, WALL_SAMP);
    log('     (a JUMP flag is reported WITH the size of the step it is claiming: `big` = |D2r| at the');
    log('      located point, in um. The 0.01 mm export standard is 10 um — a sub-um "cliff" is not one.)');
    for (const nch of [2, 4, 6, 12]) {
      const run = (fs: number[]): { j: number; j1: number; j10: number; k: number; ar: number; ar10: number; mr: number; nc: number; bigs: number[] } => {
        let j = 0; let j1 = 0; let j10 = 0; let k = 0; let ar = 0; let ar10 = 0; let mr = 0; let nc = 0;
        const bigs: number[] = [];
        for (const f of fs) {
          const [ath, bth, cth] = th3(f);
          const r = footprintJump(rA, ath, xyz[f * 9 + 2], bth, xyz[f * 9 + 5], cth, xyz[f * 9 + 8], nch);
          nc = r.nChords;
          if (r.jump) {
            j += 1; ar += d.areaMm2[f]; bigs.push(r.jumpBigUm);
            if (r.jumpBigUm >= 1) j1 += 1;
            if (r.jumpBigUm >= 10) { j10 += 1; ar10 += d.areaMm2[f]; }
          }
          if (r.kink) k += 1;
          if (r.maxRatio > mr) mr = r.maxRatio;
        }
        return { j, j1, j10, k, ar, ar10, mr, nc, bigs };
      };
      const cu = run(curtF); const wa = run(wsamp);
      log(`     NCH=${String(nch).padStart(2)} (${String(cu.nc).padStart(2)} chords/facet)`);
      log(`        CURTAIN n=${curtF.length}  jump ${cu.j} = ${((cu.j / curtF.length) * 100).toFixed(3)}%  AREA ${cu.ar.toFixed(4)} mm2 = ${((cu.ar / meshArea) * 100).toFixed(5)}% of mesh   step um (n=${cu.bigs.length}) p50 ${q(cu.bigs, 0.5).toExponential(3)} MAX ${mx(cu.bigs).toExponential(3)}   >=1um ${cu.j1}  >=10um ${cu.j10} (AREA ${cu.ar10.toFixed(4)} mm2 = ${((cu.ar10 / meshArea) * 100).toFixed(5)}%)`);
      log(`        WALL FLOOR n=${wsamp.length}  jump ${wa.j} = ${((wa.j / wsamp.length) * 100).toFixed(3)}%   step um (n=${wa.bigs.length}) p50 ${q(wa.bigs, 0.5).toExponential(3)} MAX ${mx(wa.bigs).toExponential(3)}   >=1um ${wa.j1}  >=10um ${wa.j10}`);
      log(`        (kink-anywhere: curtain ${((cu.k / curtF.length) * 100).toFixed(1)}%  wall ${((wa.k / wsamp.length) * 100).toFixed(1)}%;  maxRatio curtain ${cu.mr.toFixed(2)} wall ${wa.mr.toFixed(2)} — a ratio > 1 is a CANCELLATION artefact, not a jump)`);
    }
  }
  log('');

  // ── T2 the parameter footprint ──
  log('  ── T2 DO THE 3 VERTICES PROJECT TO DISTINCT (r*theta, z)? ──');
  {
    const stat = (fs: number[], nm: string): void => {
      const mp = fs.map((f) => paramFootprint(f).minParamMm);
      const rt = fs.map((f) => paramFootprint(f).ratio);
      const coinc = fs.filter((f) => paramFootprint(f).minParamMm < 1e-12).length;
      let aCo = 0; for (const f of fs) if (paramFootprint(f).minParamMm < 1e-12) aCo += d.areaMm2[f];
      log(`     ${nm.padEnd(9)} min param edge mm  p1 ${q(mp, 0.01).toExponential(3)}  p50 ${q(mp, 0.5).toExponential(3)}   minParam/max3D  p1 ${q(rt, 0.01).toFixed(5)} p50 ${q(rt, 0.5).toFixed(5)}`);
      log(`     ${' '.repeat(9)} EXACTLY coincident projections (< 1e-12 mm): ${coinc} (${((coinc / fs.length) * 100).toFixed(4)}%)  AREA ${aCo.toFixed(5)} mm2`);
    };
    stat(curtF, 'CURTAIN'); stat(wallF.filter((_, i) => i % Math.max(1, Math.floor(wallF.length / WALL_SAMP)) === 0).slice(0, WALL_SAMP), 'WALL');
    for (const cut of [1e-6, 1e-4, 1e-3, 1e-2]) {
      const cc = curtF.filter((f) => paramFootprint(f).ratio < cut);
      let a = 0; for (const f of cc) a += d.areaMm2[f];
      log(`     minParam/max3D < ${cut.toExponential(0)}:  CURTAIN n=${cc.length} (${((cc.length / curtF.length) * 100).toFixed(3)}%)  AREA ${a.toFixed(5)} mm2 = ${((a / meshArea) * 100).toFixed(5)}% of mesh`);
    }
  }
  log('');

  // ── T3 MERELY LARGE vs SINGULAR: graphRatio against the facet's OWN sup J ──
  log('  ── T3 MERELY LARGE vs SINGULAR:  for ANY graph, graphRatio <= sup J over the footprint ──');
  {
    const kLad = [4, 8, 16];
    const wsamp = wallF.filter((_, i) => i % Math.max(1, Math.floor(wallF.length / WALL_SAMP)) === 0).slice(0, WALL_SAMP);
    for (const kk of kLad) {
      const js = curtF.map((f) => { const [a, b, c] = th3(f); return jacSup(a, xyz[f * 9 + 2], b, xyz[f * 9 + 5], c, xyz[f * 9 + 8], kk, H_FD); });
      const gr = curtF.map((f) => fGr[idxOf.get(f) as number]);
      const rt = gr.map((g, i) => g / Math.max(1e-12, js[i]));
      const jw = wsamp.map((f) => { const [a, b, c] = th3(f); return jacSup(a, xyz[f * 9 + 2], b, xyz[f * 9 + 5], c, xyz[f * 9 + 8], kk, H_FD); });
      const grw = wsamp.map((f) => fGr[idxOf.get(f) as number]);
      const rtw = grw.map((g, i) => g / Math.max(1e-12, jw[i]));
      log(`     k=${String(kk).padStart(2)}  CURTAIN  supJ p50 ${q(js, 0.5).toFixed(3)} p90 ${q(js, 0.9).toFixed(3)} MAX ${mx(js).toFixed(3)}   gr/supJ p50 ${q(rt, 0.5).toFixed(3)} p90 ${q(rt, 0.9).toFixed(3)} MAX ${mx(rt).toFixed(3)}`);
      log(`     ${' '.repeat(5)}  WALL     supJ p50 ${q(jw, 0.5).toFixed(3)} p90 ${q(jw, 0.9).toFixed(3)} MAX ${mx(jw).toFixed(3)}   gr/supJ p50 ${q(rtw, 0.5).toFixed(3)} p90 ${q(rtw, 0.9).toFixed(3)} MAX ${mx(rtw).toFixed(3)}`);
    }
    const js16 = curtF.map((f) => { const [a, b, c] = th3(f); return jacSup(a, xyz[f * 9 + 2], b, xyz[f * 9 + 5], c, xyz[f * 9 + 8], 16, H_FD); });
    for (const cut of [1.5, 2, 4, 8]) {
      const bad = curtF.filter((f, i) => fGr[idxOf.get(f) as number] / Math.max(1e-12, js16[i]) > cut);
      let a = 0; for (const f of bad) a += d.areaMm2[f];
      log(`     gr/supJ(k=16) > ${String(cut).padStart(3)}:  CURTAIN n=${String(bad.length).padStart(5)} (${((bad.length / curtF.length) * 100).toFixed(3)}%)  AREA ${a.toFixed(4)} mm2 = ${((a / meshArea) * 100).toFixed(5)}% of mesh`);
    }
    log('');
    log('     ── WHY graphRatio IS NOT A GRAPH TEST: it divides by the PARAMETER-TRIANGLE area, which');
    log('        collapses on a NEEDLE footprint even when the surface is a perfect single-valued graph. ──');
    {
      const pq = curtF.map((f) => paramQuality(f));
      const rt = curtF.map((f, i) => fGr[idxOf.get(f) as number] / Math.max(1e-12, js16[i]));
      const pqw = wsamp.map((f) => paramQuality(f));
      log(`        param-triangle quality (1=equilateral, 0=needle):  CURTAIN p10 ${q(pq, 0.1).toFixed(4)} p50 ${q(pq, 0.5).toFixed(4)}   WALL p10 ${q(pqw, 0.1).toFixed(4)} p50 ${q(pqw, 0.5).toFixed(4)}`);
      const hi = curtF.filter((_, i) => rt[i] > 1.5); const lo = curtF.filter((_, i) => rt[i] <= 1.5);
      log(`        of the CURTAIN facets with gr/supJ > 1.5 (n=${hi.length}): param quality p50 ${q(hi.map((f) => paramQuality(f)), 0.5).toFixed(5)} p90 ${q(hi.map((f) => paramQuality(f)), 0.9).toFixed(5)}`);
      log(`        of the CURTAIN facets with gr/supJ <= 1.5 (n=${lo.length}): param quality p50 ${q(lo.map((f) => paramQuality(f)), 0.5).toFixed(5)} p90 ${q(lo.map((f) => paramQuality(f)), 0.9).toFixed(5)}`);
      log('        (a needle parameter footprint EXPLAINS a large graphRatio with no non-graph anywhere)');
    }
  }
  log('');

  log('  ── T3\' THE WELL-POSED AREA TEST: facet 3D area / ANALYTIC SURFACE AREA over the SAME footprint ──');
  log('     No parameter-triangle area anywhere. ~1 => the facet spans exactly the surface material that');
  log('     is there. >>1 => it BRIDGES material the surface does not have, i.e. a genuine cliff span.');
  {
    const wsamp = wallF.filter((_, i) => i % Math.max(1, Math.floor(wallF.length / WALL_SAMP)) === 0).slice(0, WALL_SAMP);
    for (const kk of [8, 16, 32]) {
      const rc = curtF.map((f) => facetArea3D(f) / Math.max(1e-15, surfAreaOverFootprint(f, kk)));
      const rw = wsamp.map((f) => facetArea3D(f) / Math.max(1e-15, surfAreaOverFootprint(f, kk)));
      log(`     k=${String(kk).padStart(2)}  CURTAIN A3/Asurf p10 ${q(rc, 0.1).toFixed(4)} p50 ${q(rc, 0.5).toFixed(4)} p90 ${q(rc, 0.9).toFixed(4)} p99 ${q(rc, 0.99).toFixed(4)} MAX ${mx(rc).toFixed(4)}`);
      log(`     ${' '.repeat(5)} WALL    A3/Asurf p10 ${q(rw, 0.1).toFixed(4)} p50 ${q(rw, 0.5).toFixed(4)} p90 ${q(rw, 0.9).toFixed(4)} p99 ${q(rw, 0.99).toFixed(4)} MAX ${mx(rw).toFixed(4)}`);
    }
    const r32 = curtF.map((f) => facetArea3D(f) / Math.max(1e-15, surfAreaOverFootprint(f, 32)));
    for (const cut of [1.2, 1.5, 2, 4]) {
      const bad = curtF.filter((_, i) => r32[i] > cut);
      let a = 0; for (const f of bad) a += d.areaMm2[f];
      log(`     A3/Asurf(k=32) > ${cut.toFixed(1)}:  CURTAIN n=${String(bad.length).padStart(5)} (${((bad.length / curtF.length) * 100).toFixed(3)}%)  AREA ${a.toFixed(4)} mm2 = ${((a / meshArea) * 100).toFixed(5)}% of mesh`);
    }
    log('');
    log('     ── IS THAT TAIL A BRIDGED CLIFF, OR THE SAME NEEDLE ARTEFACT ONE LEVEL DOWN? ──');
    log('        THE DISCRIMINATOR IS THE k-GROWTH. A facet bridging a real cliff has a 2-D footprint, so');
    log('        Asurf CONVERGES and A3/Asurf is k-STABLE. A NEEDLE footprint has parameter measure ZERO,');
    log('        so Asurf falls like 1/k and A3/Asurf DOUBLES per doubling of k — with no cliff anywhere.');
    log('        A converged ratio is a finding; a ratio that tracks k is an artefact of the denominator.');
    {
      const flagged = curtF.filter((_, i) => r32[i] > 1.5);
      const sub = flagged.filter((_, i) => i % Math.max(1, Math.floor(flagged.length / 800)) === 0).slice(0, 800);
      const stable = curtF.filter((_, i) => r32[i] <= 1.5).filter((_, i) => i % Math.max(1, Math.floor((curtF.length - flagged.length) / 800)) === 0).slice(0, 800);
      const rk = (fs: number[], kk: number): number[] => fs.map((f) => facetArea3D(f) / Math.max(1e-15, surfAreaOverFootprint(f, kk)));
      for (const [nm, fs] of [['A3/Asurf>1.5 (flagged)', sub], ['A3/Asurf<=1.5 (rest)', stable]] as Array<[string, number[]]>) {
        const a8 = rk(fs, 8); const a16 = rk(fs, 16); const a32 = rk(fs, 32); const a64 = rk(fs, 64);
        const g = a64.map((v, i) => v / Math.max(1e-12, a8[i]));
        log(`        ${nm.padEnd(24)} n=${String(fs.length).padStart(4)}  A3/Asurf p50 at k=8/16/32/64: ${q(a8, 0.5).toFixed(3)} / ${q(a16, 0.5).toFixed(3)} / ${q(a32, 0.5).toFixed(3)} / ${q(a64, 0.5).toFixed(3)}   ratio k64/k8 p50 ${q(g, 0.5).toFixed(3)} (8x if Asurf ~ 1/k, 1.0 if converged)`);
        log(`        ${' '.repeat(24)}   param quality p50 ${q(fs.map((f) => paramQuality(f)), 0.5).toFixed(5)}   T4 off-surface p50 ${q(fs.map((f) => offSurfaceUm(f, 8, 0.05)), 0.5).toFixed(2)} MAX ${mx(fs.map((f) => offSurfaceUm(f, 8, 0.05))).toFixed(1)} um`);
        let jbig = 0; let jmax = 0;
        for (const f of fs) {
          const [a, b, c] = th3(f);
          const jr = footprintJump(rA, a, xyz[f * 9 + 2], b, xyz[f * 9 + 5], c, xyz[f * 9 + 8], 12);
          if (jr.jump && jr.jumpBigUm >= 10) jbig += 1;
          if (jr.jump && jr.jumpBigUm > jmax) jmax = jr.jumpBigUm;
        }
        log(`        ${' '.repeat(24)}   T1 jumps with a step >= 10 um: ${jbig}/${fs.length}   largest step found ${jmax.toExponential(3)} um`);
      }
    }
  }
  log('');

  // ── T4 on-surface residual ──
  log('  ── T4 DOES THE FACET LIE ON rA? max |hypot(x,y) - rA| over the interior footprint (um) ──');
  {
    const wsamp = wallF.filter((_, i) => i % Math.max(1, Math.floor(wallF.length / WALL_SAMP)) === 0).slice(0, WALL_SAMP);
    const oc = curtF.map((f) => offSurfaceUm(f, 8, 0.05));
    const ow = wsamp.map((f) => offSurfaceUm(f, 8, 0.05));
    log(`     CURTAIN  p10 ${q(oc, 0.1).toFixed(2)} p50 ${q(oc, 0.5).toFixed(2)} p90 ${q(oc, 0.9).toFixed(2)} MAX ${mx(oc).toFixed(1)} um`);
    log(`     WALL     p10 ${q(ow, 0.1).toFixed(2)} p50 ${q(ow, 0.5).toFixed(2)} p90 ${q(ow, 0.9).toFixed(2)} MAX ${mx(ow).toFixed(1)} um`);
    for (const cut of [50, 200, 1000]) {
      const bad = curtF.filter((_, i) => oc[i] > cut);
      let a = 0; for (const f of bad) a += d.areaMm2[f];
      log(`     CURTAIN off-surface > ${String(cut).padStart(4)} um:  n=${String(bad.length).padStart(5)} (${((bad.length / curtF.length) * 100).toFixed(3)}%)  AREA ${a.toFixed(4)} mm2 = ${((a / meshArea) * 100).toFixed(5)}% of mesh`);
    }
  }
  log('');

  // ── THE LEG-1 VERDICT: the union certificate, on BOTH classes (the FLOOR is not optional) ──
  log('  ── LEG 1 VERDICT ──');
  log('     "Not a graph of rA" has exactly one meaning: rA is MULTI-VALUED or DISCONTINUOUS over the');
  log('     footprint. The certificate is therefore T1 (a discontinuity in rA, step >= 10 um = the export');
  log('     standard) OR T2 (the footprint itself collapses, so there is no footprint to be a graph over).');
  log('     *** NEITHER graphRatio NOR A3/Asurf IS IN THE CERTIFICATE. *** Both divide by a quantity that');
  log('     vanishes on a NEEDLE parameter footprint, and the k-ladder above shows the flagged tail is');
  log('     exactly that: a denominator falling like 1/k, not a cliff. A needle footprint is a graph.');
  log('     Both classes are run, because the wall FLOOR is what makes the curtain ceiling mean anything. ──');
  {
    const cert = (fs: number[]): { set: Set<number>; t1: number; t2: number; t3diag: number } => {
      const s = new Set<number>(); let t1 = 0; let t2 = 0; let t3diag = 0;
      for (const f of fs) {
        const [a, b, c] = th3(f);
        const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
        const j = footprintJump(rA, a, az, b, bz, c, cz, 12);
        const p = paramFootprint(f);
        const h1 = j.jump && j.jumpBigUm >= 10; const h2 = p.ratio < 1e-3;
        if (h1) t1 += 1; if (h2) t2 += 1;
        if (facetArea3D(f) / Math.max(1e-15, surfAreaOverFootprint(f, 32)) > 1.5) t3diag += 1;
        if (h1 || h2) s.add(f);
      }
      return { set: s, t1, t2, t3diag };
    };
    const wsamp2 = wallF.filter((_, i) => i % Math.max(1, Math.floor(wallF.length / WALL_SAMP)) === 0).slice(0, WALL_SAMP);
    const cc = cert(curtF); const cw = cert(wsamp2);
    const aC = areaOfSet([...cc.set]); const aW = areaOfSet([...cw.set]);
    log(`     CURTAIN  truly non-graph ${cc.set.size}/${curtF.length} = ${((cc.set.size / curtF.length) * 100).toFixed(3)}% by count   AREA ${aC.toFixed(4)} mm2 = ${((aC / Math.max(1e-12, areaOfSet(curtF))) * 100).toFixed(3)}% of the curtain class = ${((aC / meshArea) * 100).toFixed(5)}% of mesh`);
    log(`              (fired by: T1 ${cc.t1}   T2 ${cc.t2};   the DEMOTED A3/Asurf>1.5 diagnostic would have flagged ${cc.t3diag})`);
    log(`     WALL[FLOOR] truly non-graph ${cw.set.size}/${wsamp2.length} = ${((cw.set.size / wsamp2.length) * 100).toFixed(3)}% by count   AREA ${aW.toFixed(4)} mm2`);
    log(`              (fired by: T1 ${cw.t1}   T2 ${cw.t2};   demoted diagnostic would have flagged ${cw.t3diag})`);
    for (const f of cc.set) nonGraph.add(f);
    for (const f of cw.set) nonGraph.add(f);
    nonGraphMeasured = true;
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — LEG 2. PAIR vs STRICT PER-FACET ACCOUNTING.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const stradFacet = (f: number): boolean => {
  const i = idxOf.get(f) as number;
  return fDrop[i] >= DROP_CUT && fNormHi[i] > NORM_BAR;
};
if (STAGES.includes('2')) {
  log('══════════ STAGE 2 — LEG 2: PAIR vs STRICT PER-FACET ACCOUNTING ══════════');
  const wallRows = allRows.filter((r) => !r.curtain);
  const stradRows = wallRows.filter((r) => r.drop >= DROP_CUT && r.normHi > NORM_BAR);
  const pairSet = uniqOfRows(stradRows);
  const pairArr = [...pairSet];
  const indiv = pairArr.filter((f) => stradFacet(f));
  const aPair = areaOfSet(pairArr); const aInd = areaOfSet(indiv);
  log('  S112 credits the area of BOTH facets of every qualifying PAIR. Reviewer B: only the facets that');
  log('  individually straddle should be credited. Both accountings, on the SAME rows:');
  log(`    PAIR accounting  (S112)        pairs ${stradRows.length}  facets ${pairArr.length}  AREA ${aPair.toFixed(4)} mm2 = ${((aPair / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`    PER-FACET within the same set  facets ${indiv.length} (${((indiv.length / pairArr.length) * 100).toFixed(2)}% of them)  AREA ${aInd.toFixed(4)} mm2 = ${((aInd / meshArea) * 100).toFixed(4)}% of mesh  = ${((aInd / aPair) * 100).toFixed(2)}% of the pair area`);
  log(`    => the accounting leg is worth ${(aPair / Math.max(1e-12, aInd)).toFixed(3)}x by AREA, ${(pairArr.length / Math.max(1, indiv.length)).toFixed(3)}x by COUNT`);
  log('');
  log('  ── the R2 defect priced: `drop` is max_pair(normHi) / max_pair(normLo), two maxima that may be');
  log('     attained on DIFFERENT facets. How often do they swap? ──');
  {
    let swap = 0;
    for (const r of stradRows) {
      const i1 = idxOf.get(r.f1) as number; const i2 = idxOf.get(r.f2) as number;
      const argHi = fNormHi[i1] >= fNormHi[i2] ? 1 : 2;
      const argLo = fNormLo[i1] >= fNormLo[i2] ? 1 : 2;
      if (argHi !== argLo) swap += 1;
    }
    log(`     argmax(normHi) != argmax(normLo) on ${swap}/${stradRows.length} straddling pairs = ${((swap / Math.max(1, stradRows.length)) * 100).toFixed(2)}%`);
    log('     (on those rows the pair `drop` is a ratio of two different facets\' readings and means nothing)');
  }
  log('');
  log('  ── STRICT PER-FACET class, built from scratch (not filtered out of the pair set) ──');
  const strictWall = wallF.filter((f) => stradFacet(f));
  const strictAll = vis.filter((f) => stradFacet(f));
  rep('per-facet straddling, WALL-scoped', strictWall);
  rep('per-facet straddling, NO curtain scope', strictAll);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — THE LADDER OF CHOICES, AND THE ONE NUMBER
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGES.includes('3')) {
  log('══════════ STAGE 3 — THE FULL LADDER: every knob, one at a time ══════════');
  const pct = (a: number): string => `${((a / meshArea) * 100).toFixed(4)}%`;
  const line = (nm: string, fs: number[] | Set<number>): void => {
    const arr = Array.isArray(fs) ? fs : [...fs];
    const a = areaOfSet(arr);
    const nd = arr.map((f) => fNormHi[idxOf.get(f) as number]);
    log(`  ${nm.padEnd(52)} n=${String(arr.length).padStart(6)}  AREA ${a.toFixed(4).padStart(10)} mm2  ${pct(a).padStart(8)} of mesh  MAX normDeg ${mx(nd).toFixed(2)}`);
  };
  log('  (all rows are PER-FACET area over the unique facet set; MAX normDeg at inset 0.05)');
  line('A  VIS: adjacent dihedral > 45 deg (S108 headline)', vis);
  line('B  A, minus per-PAIR curtain (S112 leg 1)', uniqOfRows(allRows.filter((r) => !r.curtain)));
  line('C  A, minus per-FACET curtain gr>8', wallF);
  if (nonGraphMeasured) line('D  A, minus only TRULY non-graph facets (leg 1 honest)', vis.filter((f) => !nonGraph.has(f)));
  else log('  D  A, minus only TRULY non-graph facets      [NOT MEASURED — stage 1 did not run]');
  log('');
  log('  CURTAIN-CUT SWEEP (leg 1 as a threshold, per facet):');
  for (const c of [2, 4, 8, 16, 64, 1e9]) {
    const keep = vis.filter((f) => fGr[idxOf.get(f) as number] <= c);
    const a = areaOfSet(keep);
    log(`     keep gr <= ${String(c === 1e9 ? 'inf' : c).padStart(4)}:  n=${String(keep.length).padStart(6)}  AREA ${a.toFixed(4).padStart(10)} mm2  ${pct(a)} of mesh`);
  }
  log('');
  log('  ACCOUNTING x DROP-CUT x BAR x INSET (leg 2 as thresholds), NO curtain scope:');
  log('     inset  drop   bar |  PAIR n / area / %mesh      |  PER-FACET n / area / %mesh');
  for (const ins of [0.02, 0.05, 0.1]) {
    // recompute normHi at this inset for the whole VIS set
    const nHi = new Float64Array(vis.length);
    for (let i = 0; i < vis.length; i += 1) nHi[i] = orientOf(vis[i], ins).normDeg;
    for (const dc of [0.1, 0.25, 0.5]) {
      for (const bar of [10]) {
        const dr = (i: number): number => (fNormLo[i] > 1e-9 ? nHi[i] / fNormLo[i] : 1);
        const rowsQ = allRows.filter((r) => {
          const i1 = idxOf.get(r.f1) as number; const i2 = idxOf.get(r.f2) as number;
          const hi = Math.max(nHi[i1], nHi[i2]); const lo = Math.max(fNormLo[i1], fNormLo[i2]);
          return (lo > 1e-9 ? hi / lo : 1) >= dc && hi > bar;
        });
        const ps = uniqOfRows(rowsQ); const ap = areaOfSet([...ps]);
        const fsq = vis.filter((f) => { const i = idxOf.get(f) as number; return dr(i) >= dc && nHi[i] > bar; });
        const af = areaOfSet(fsq);
        log(`     ${ins.toFixed(2)}   ${dc.toFixed(2)}  ${String(bar).padStart(3)} |  ${String(ps.size).padStart(6)} / ${ap.toFixed(3).padStart(9)} / ${pct(ap).padStart(8)} |  ${String(fsq.length).padStart(6)} / ${af.toFixed(3).padStart(9)} / ${pct(af).padStart(8)}`);
      }
    }
  }
  log('');
  log('  ══ THE NUMBER, and every knob that produced it ══');
  {
    const final = vis.filter((f) => !nonGraph.has(f) && stradFacet(f));
    const aF = areaOfSet(final);
    const wallRows2 = allRows.filter((r) => !r.curtain);
    const s112set = uniqOfRows(wallRows2.filter((r) => r.drop >= DROP_CUT && r.normHi > NORM_BAR));
    const a112 = areaOfSet([...s112set]);
    const aVis = areaOfSet(vis);
    log(`     S108 unscoped visible class .......... ${areaOfSet(vis).toFixed(4)} mm2  ${pct(aVis)} of mesh`);
    log(`     S112 published (pair, wall-scoped) ... ${a112.toFixed(4)} mm2  ${pct(a112)} of mesh`);
    log(`     *** THIS ADJUDICATION ................ ${aF.toFixed(4)} mm2  ${pct(aF)} of mesh ***`);
    log(`     knobs: leg 1 = ${nonGraphMeasured ? `only the ${nonGraph.size} MEASURED non-graph facets removed` : 'NOT MEASURED'};  leg 2 = strict PER-FACET;`);
    log(`            inset ${INSET_LO}->${INSET_HI};  drop >= ${DROP_CUT};  normDeg bar > ${NORM_BAR} deg;  visibility cut ${HI_DEG} deg;  k=${K}`);
    log(`     vs S112: ${(a112 / Math.max(1e-12, aF)).toFixed(3)}x by area.   vs S108 unscoped: ${(aVis / Math.max(1e-12, aF)).toFixed(2)}x`);
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — ORACLE INDEPENDENCE, VERIFIED NOT ASSERTED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Samp { n: Float64Array; m: number }
function sampleFacet(f: number, k: number, inset: number): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3);
  const sh = 1 - inset; const sc = inset / 3;
  let m = 0;
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
    const a = sh * (i / k) + sc; const b = sh * (j / k) + sc; const c = 1 - a - b;
    const nc = nsKink(a * ath + b * bth + c * cth, a * az + b * bz + c * cz, scratch);
    for (let qi = 0; qi < nc; qi += 1) {
      n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2]; m += 1;
    }
  }
  return { n, m };
}
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp; return Math.acos(dp);
};
/** s113opOracleC's `twoMeansOn`, transcribed verbatim so the reproduction is like-for-like. */
function twoMeansOn(n: Float64Array, idx: number[]): { sepDeg: number; minor: number } {
  const m = idx.length;
  if (m < 2) return { sepDeg: 0, minor: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (const i of idx) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  const L0 = Math.hypot(sx, sy, sz) || 1;
  const mean = new Float64Array([sx / L0, sy / L0, sz / L0]);
  let i1 = idx[0]; let best = -1;
  for (const i of idx) { const a = angU(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = idx[0]; best = -1;
  for (const i of idx) { const a = angU(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
  const c = new Float64Array([n[i1 * 3], n[i1 * 3 + 1], n[i1 * 3 + 2], n[i2 * 3], n[i2 * 3 + 1], n[i2 * 3 + 2]]);
  let na = 0;
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; na = 0;
    for (const i of idx) {
      if (angU(n, i * 3, c, 0) <= angU(n, i * 3, c, 3)) { ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
      else { bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (m - na > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || na === m) break;
  }
  return { sepDeg: na > 0 && na < m ? angU(c, 0, c, 3) * DEG : 0, minor: Math.min(na, m - na) / m };
}
/** S113's FIDELITY predicate, verbatim: interior (inset 0.1, K=12) two-means sep >= 45 deg, minority >= 5%. */
const interiorStraddle = (f: number): boolean => {
  const s = sampleFacet(f, 12, 0.1);
  const idx: number[] = []; for (let i = 0; i < s.m; i += 1) idx.push(i);
  const r = twoMeansOn(s.n, idx);
  return r.sepDeg >= 45 && r.minor >= 0.05;
};

if (STAGES.includes('4')) {
  log('══════════ STAGE 4 — IS S113\'s ORACLE BOUND INDEPENDENT OF BOTH LEGS? (verified, not asserted) ══════════');
  log('  S113\'s reducible remainder is "1,537 facets / 15.8233 mm2 = 0.0411% of mesh". It is a TALLY of the');
  log('  FIDELITY predicate (interior straddle at inset 0.1, K=12, sep>=45, minority>=5%) over the PINNED');
  log('  6,193-facet target set. The PREDICATE reads only the analytic normal field on the facet\'s own');
  log('  interior footprint — it touches neither graphRatio (leg 1) nor the inset-drop (leg 2). The SET it');
  log('  was tallied over is defined by BOTH legs. So the two must be checked separately.');
  log('');
  // rebuild the pinned target set exactly: straddling wall rows that are ALSO crease-labelled
  const wallRows = allRows.filter((r) => !r.curtain);
  const stradRows = wallRows.filter((r) => r.drop >= DROP_CUT && r.normHi > NORM_BAR);
  for (const r of stradRows) r.crease = creaseLabel(r.e);
  const target = stradRows.filter((r) => r.crease);
  const uniqT = [...uniqOfRows(target)];
  log(`  pinned target set rebuilt: ${target.length} pairs (S113: 3282), ${uniqT.length} unique facets (S113: 6193), AREA ${areaOfSet(uniqT).toFixed(4)} mm2 = ${((areaOfSet(uniqT) / meshArea) * 100).toFixed(4)}% (S113: 69.8258 / 0.1816%)  ${el()}`);
  const evalSet = (nm: string, fs: number[], expN = -1, expA = -1): void => {
    const hit = fs.filter((f) => interiorStraddle(f));
    const a = areaOfSet(hit);
    const okN = expN < 0 ? '' : hit.length === expN ? '  [reproduces S113]' : `  *** S113 read ${expN} ***`;
    const okA = expA < 0 ? '' : Math.abs(a - expA) < 0.002 ? '' : ` (S113 area ${expA})`;
    log(`    ${nm.padEnd(46)} set n=${String(fs.length).padStart(6)}  interior-straddlers ${String(hit.length).padStart(5)}  AREA ${a.toFixed(4).padStart(9)} mm2 = ${((a / meshArea) * 100).toFixed(4)}% of mesh${okN}${okA}`);
  };
  log('');
  log('  the SAME predicate, tallied over four different sets:');
  evalSet('S113 pinned target (both legs applied)', uniqT, 1537, 15.8233);
  evalSet('leg 1 RESTORED: all VIS facets', vis);
  evalSet('leg 1 as S112: wall facets only', wallF);
  evalSet('leg 2 STRICT: per-facet straddling, no curtain cut', vis.filter((f) => stradFacet(f)));
  log('');
  log('  => if the four tallies differ, the PREDICATE is leg-independent but the PUBLISHED FIGURE is not.');
  log(`  ${el()}`);
  log('');

  // ── THE VISIBLE-METRIC ORACLE, the "99.40%", re-derived on the leg-1-RESTORED class ──
  log('  ── AND THE VISIBLE-METRIC ORACLE (S113\'s 99.40%), re-derived on every high-dihedral pair ──');
  log('     S113 asked, per pair, whether the ANALYTIC surface turns >= 45 deg across a crease in the');
  log('     pair\'s neighbourhood — a statement about rA alone, computed on the pair\'s own footprints.');
  log('     Instrument note: S113 took the turn over the 8 CLOSEST cross-flank sample pairs (p50 146.52');
  log('     deg); this takes it between the two CLUSTER CENTRES, which S113 also printed (p50 142.95 deg).');
  log('     The pinned-set row below is the CALIBRATION of that substitution — read it before the others.');
  {
    const pairTurn = (f1: number, f2: number): number => {
      const s1 = sampleFacet(f1, 12, 0); const s2 = sampleFacet(f2, 12, 0);
      const m = s1.m + s2.m;
      const n = new Float64Array(m * 3);
      n.set(s1.n.subarray(0, s1.m * 3), 0); n.set(s2.n.subarray(0, s2.m * 3), s1.m * 3);
      const idx: number[] = []; for (let i = 0; i < m; i += 1) idx.push(i);
      return twoMeansOn(n, idx).sepDeg;
    };
    const irrOfRows = (rs: Row[], nm: string, cmp = ''): void => {
      const anyIrr = new Map<number, boolean>();
      const seps: number[] = [];
      for (const r of rs) {
        const s = pairTurn(r.f1, r.f2);
        seps.push(s);
        const irr = s >= HI_DEG;
        for (const f of [r.f1, r.f2]) anyIrr.set(f, (anyIrr.get(f) ?? false) || irr);
      }
      const fs = [...anyIrr.keys()];
      const irrF = fs.filter((f) => anyIrr.get(f) === true);
      const aAll = areaOfSet(fs); const aIrr = areaOfSet(irrF);
      const red = aAll - aIrr;
      log(`     ${nm.padEnd(40)} pairs ${String(rs.length).padStart(6)}  turn p50 ${q(seps, 0.5).toFixed(2).padStart(7)} deg`);
      log(`     ${' '.repeat(40)} IRREDUCIBLE ${String(irrF.length).padStart(6)}/${String(fs.length).padStart(6)} facets  AREA ${aIrr.toFixed(4).padStart(10)} mm2 = ${((aIrr / Math.max(1e-12, aAll)) * 100).toFixed(2)}% of the set${cmp}`);
      log(`     ${' '.repeat(40)} REDUCIBLE                      AREA ${red.toFixed(4).padStart(10)} mm2 = ${((red / meshArea) * 100).toFixed(4)}% of mesh`);
    };
    irrOfRows(target, 'PINNED target set (CALIBRATION)', '   [S113: 99.40%]');
    irrOfRows(allRows.filter((r) => !r.curtain), 'WALL pairs (leg 1 as S112)');
    irrOfRows(allRows, 'ALL high-dihedral pairs (leg 1 RESTORED)');
  }
  log(`  ${el()}`);
  log('');
}

writeFileSync(`${OUTDIR}/S114_ADJUDICATE_${TAG}.json`, `${JSON.stringify({
  style: STYLE, stl: STL, meshFacets: nTri, meshAreaMm2: meshArea,
  cuts: { HI_DEG, K, INSET_LO, INSET_HI, DROP_CUT, NORM_BAR, CURTAIN_RATIO, NCH },
  visFacets: vis.length, visAreaMm2: areaOfSet(vis),
  curtainFacets: curtF.length, curtainAreaMm2: areaOfSet(curtF),
  wallFacets: wallF.length, wallAreaMm2: areaOfSet(wallF),
  perFacetStraddlingAll: vis.filter((f) => stradFacet(f)).length,
  perFacetStraddlingAllAreaMm2: areaOfSet(vis.filter((f) => stradFacet(f))),
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S114_ADJUDICATE_${TAG}.json`);
log(`done ${el()}`);
