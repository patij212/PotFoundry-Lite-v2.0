// s110TurnBudget.ts — WHAT IS THE 59.5%? Test the ONE prediction geometry forces.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SETUP. S108 found 2.3699% of Gothic's shipping AREA at 45-180 deg adjacent-facet dihedral, on
// WELL-SHAPED facets (so not S98's needles). S109 cross-tabulated it against the crease class:
// RR 20.12x but RECALL only 40.50% — so 59.50% of the visible class does NOT cross a crease, and BOTH
// of the campaign's named mechanisms are excluded for the majority of it. What is left?
//
// GEOMETRY FORCES A CANDIDATE, AND IT IS FALSIFIABLE. The dihedral between two facets is bounded by the
// sum of their individual angles to the true surface normal, so a >45 deg dihedral REQUIRES at least one
// facet ~22.5 deg+ off the analytic surface. On a well-shaped facet away from any crease, that means the
// surface normal genuinely TURNS that much across one element. And on a smooth patch the turn across an
// element of length L in a principal direction is
//
//        turn  ~=  L * kappa                      <-- the ANGLE law, the same identity as E-2026-08-06-ANGLE-SIZING
//
// So the prediction is: for the NON-CROSSING high-dihedral class, measured dihedral / (L*kappa_max) ~= 1.
// If it holds, the class is ORDINARY SMOOTH RELIEF THAT IS SIMPLY TOO COARSE FOR ITS CURVATURE — an
// element-size failure with a known law, not a new mechanism. If measured >> predicted, the surface is
// doing something the smooth model does not capture (a fold, a chart defect, a sub-resolution feature)
// and that IS a new mechanism.
//
// *** THE CONTROL IS THE TEST. *** `turn ~= L*kappa` is a smooth-surface identity, so it must read ~1 on
// ORDINARY edges. A control group of ordinary edges is therefore not decoration — it is what licenses any
// reading of the other two groups. If the control does not read ~1, the predictor is broken and NOTHING
// here is interpretable. That is the campaign's own rule (diff printed values against a control), and it
// is a stronger validation than a unit test could give, because it exercises the real rA on the real mesh.
//
// THREE GROUPS, ONE RULER: (A) high-dihedral NON-crossing (the 59.5%), (B) high-dihedral crossing (the
// 40.5% — a crease is NOT smooth, so this group SHOULD blow the predictor), (C) ordinary edges (control).
//
// Usage: bash research/tools/run-s110-turnbudget.sh
//   env: PF_S110_STL PF_S110_STYLE PF_S110_TAG PF_S110_HI_DEG(45) PF_S110_CTRL(20000)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { kappaMaxAt } from '../bridge/surfaceMetricField';
import { fdNormalsCentral } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S110_STYLE ?? 'GothicArches';
const STL = process.env.PF_S110_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S110_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S110_HI_DEG', 45);
const CTRL_N = Math.round(envF('PF_S110_CTRL', 20000));
const SNAP_ALPHA = envF('PF_CB_SNAP_ALPHA', 0.12);
const DIMS: StyleDims = { H: envF('PF_S110_H', 120), Rb: envF('PF_S110_RB', 40), Rt: envF('PF_S110_RT', 50), expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const OUTDIR = 'research/exchange/_strataConformBisect/turnbudget';

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

// ⚠ FIRST PREDICTOR REJECTED BY ITS OWN CONTROL, AND THE DIAGNOSIS IS KEPT HERE ON PURPOSE.
// v1 used `L * kappaMaxAt` and the ORDINARY-EDGE control read 0.23, not ~1, so nothing downstream was
// interpretable and the guard refused to let it be read. Two independent errors, both structural:
//   * `kappaMaxAt` is the MAXIMUM principal curvature, but a dihedral bends ACROSS the edge, in whatever
//     direction that is — the normal curvature there lies anywhere in [k_min, k_max], so k_max
//     systematically OVER-predicts (group A read a nonsensical pred p50 of 1863 deg);
//   * `L` is the EDGE length, while the relevant extent is the facet width PERPENDICULAR to the edge.
// Rather than repair a curvature model with two free choices in it, v2 drops the model entirely.
//
// v2 — MODEL-FREE, and it asks the question that actually matters: compare the MEASURED facet dihedral
// against the ANALYTIC normal turn between the SAME two footprint points. No curvature, no direction
// choice, no length scale.
//    ratio ~= 1   the mesh faithfully tracks a genuine surface turn  => HONEST UNDER-RESOLUTION
//    ratio >> 1   the mesh MANUFACTURES turn the surface does not have => A MESH DEFECT
//    ratio << 1   the mesh SMOOTHS AWAY turn the surface does have    => under-representation
const nsCentral = fdNormalsCentral(rA, H, 2e-4, 2e-4);
const nBufA = new Float64Array(3); const nBufB = new Float64Array(3);
/** angle (rad) between the ANALYTIC surface normals at two (x,y,z) points, via their (theta,z). */
const analyticTurn = (
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
): number => {
  nsCentral(Math.atan2(ay, ax), Math.min(H, Math.max(0, az)), nBufA);
  nsCentral(Math.atan2(by, bx), Math.min(H, Math.max(0, bz)), nBufB);
  let dp = nBufA[0] * nBufB[0] + nBufA[1] * nBufB[1] + nBufA[2] * nBufB[2];
  if (dp > 1) dp = 1; else if (dp < -1) dp = -1;
  return Math.acos(dp);
};
void kappaMaxAt; void TAU;

log('===== S110 TURN BUDGET — is the 59.5% just SMOOTH RELIEF TOO COARSE FOR ITS CURVATURE? =====');
log(`style ${STYLE}  tag ${TAG}   high cut ${HI_DEG} deg   control n ${CTRL_N}`);
log(`PREDICTION under test:  measured facet dihedral / ANALYTIC normal turn over the same footprint  ~= 1`);
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
  log(`PRECOND radial  MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um`);
  if (worst * 1000 > 50) { log('*** REFUSING: style params / dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
log(`mesh ${nTri} facets   interior edges ${d.interiorEdges}  ${el()}`);

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

const hiThr = (HI_DEG * Math.PI) / 180;
type Row = { ratio: number; measDeg: number; predDeg: number; L: number; kappa: number; z: number };
const A: Row[] = []; const B: Row[] = []; const C: Row[] = [];

// golden stride over ALL edges for the control group, so it is a phase-translate sample and not a prefix
let cs = Math.round(d.edgeAngRad.length * 0.6180339887); if (cs % 2 === 0) cs += 1;
const ctrlWanted = new Set<number>();
for (let i = 0; i < CTRL_N; i += 1) ctrlWanted.add((i * cs) % d.edgeAngRad.length);

/** centroid of facet f. */
const centroid = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};

const measure = (e: number): Row | null => {
  const p = sharedEndpoints(e);
  if (p === null) return null;
  const [x0, y0, z0, x1, y1, z1] = p;
  const L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  if (!(L > 0)) return null;
  // the two footprint points the dihedral is taken between: the two facet CENTROIDS.
  const c1 = centroid(d.edgeF1[e]); const c2 = centroid(d.edgeF2[e]);
  const predRad = analyticTurn(c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
  const measRad = d.edgeAngRad[e];
  return {
    ratio: predRad > 1e-9 ? measRad / predRad : Infinity,
    measDeg: (measRad * 180) / Math.PI, predDeg: (predRad * 180) / Math.PI, L, kappa: 0, z: (z0 + z1) / 2,
  };
};

for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  const high = d.edgeAngRad[e] > hiThr;
  const wantCtrl = !high && ctrlWanted.has(e);
  if (!high && !wantCtrl) continue;
  const r = measure(e);
  if (r === null) continue;
  if (!high) { C.push(r); continue; }
  const p = sharedEndpoints(e) as number[];
  const th0 = Math.atan2(p[1], p[0]);
  const k = locateKinkRaw(rA, th0, p[2], th0 + dThRaw(th0, Math.atan2(p[4], p[3])), p[5], PRED);
  const crosses = k !== null && !k.jump;
  if (crosses) B.push(r); else A.push(r);
}
log(`groups  A(high,NON-crossing) ${A.length}   B(high,crossing) ${B.length}   C(control ordinary) ${C.length}  ${el()}`);
log('');

const q = (rows: Row[], sel: (r: Row) => number, p: number): number => {
  if (rows.length === 0) return NaN;
  const v = rows.map(sel).filter((x) => Number.isFinite(x)).sort((a2, b2) => a2 - b2);
  return v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))];
};
const row = (name: string, rows: Row[]): void => {
  log(`  ${name.padEnd(28)} n=${String(rows.length).padStart(7)}  ratio p10 ${q(rows, (r) => r.ratio, 0.1).toFixed(2).padStart(7)}  p50 ${q(rows, (r) => r.ratio, 0.5).toFixed(2).padStart(7)}  p90 ${q(rows, (r) => r.ratio, 0.9).toFixed(2).padStart(8)}`);
  log(`  ${''.padEnd(28)}          meas p50 ${q(rows, (r) => r.measDeg, 0.5).toFixed(2).padStart(7)} deg   pred p50 ${q(rows, (r) => r.predDeg, 0.5).toFixed(3).padStart(7)} deg   L p50 ${(q(rows, (r) => r.L, 0.5) * 1000).toFixed(1)} um`);
};
log('── measured facet dihedral / ANALYTIC normal turn between the two facet centroids ──');
row('C control (ordinary)', C);
row('A high, NON-crossing', A);
row('B high, crossing', B);
log('');

const cP50 = q(C, (r) => r.ratio, 0.5); const aP50 = q(A, (r) => r.ratio, 0.5); const bP50 = q(B, (r) => r.ratio, 0.5);
log('── READING IT ──');
if (!(cP50 > 0.7 && cP50 < 1.4)) {
  log(`  *** CONTROL FAILS: ordinary edges read ${cP50.toFixed(2)}, not ~1. THE PREDICTOR IS BROKEN AND NOTHING`);
  log('  HERE IS INTERPRETABLE. Fix the predictor before reading A or B. ***');
} else if (aP50 > 3) {
  log(`  CONTROL VALID (${cP50.toFixed(2)}). *** GROUP A READS ${aP50.toFixed(2)} — THE MESH IS MANUFACTURING TURN THE`);
  log('  SURFACE DOES NOT HAVE. The 59.5% is a MESH DEFECT, not under-resolution: no amount of density or');
  log('  angle-aware sizing removes turn that the analytic surface never asked for. This is a PLACEMENT /');
  log('  TOPOLOGY class and it needs an operator, not a field. ***');
} else if (aP50 > 0.7) {
  log(`  CONTROL VALID (${cP50.toFixed(2)}). *** GROUP A READS ${aP50.toFixed(2)} — THE TURN IS REAL. The surface genuinely`);
  log('  bends that much across these footprints, so the class is HONEST UNDER-RESOLUTION and density/');
  log('  angle-aware GENERATION is the lever. The angle-sizing refutation was then about BUDGET ALLOCATION,');
  log('  not about the diagnosis. ***');
} else {
  log(`  CONTROL VALID (${cP50.toFixed(2)}). GROUP A READS ${aP50.toFixed(2)} — the mesh UNDER-represents the surface's own`);
  log('  turn here. Unexpected for a high-dihedral class; characterise before acting.');
}
log(`  (B reads ${bP50.toFixed(2)} — a crease is not smooth, so B blowing the predictor is the EXPECTED positive control.)`);
log('');

// ══════════ S109 RE-EXAMINED: I PROBED THE WRONG LOCUS ══════════
// Group A reads ratio 1.00 with a PREDICTED turn of 134.58 deg. A smooth surface does not turn 134 deg
// across 200 um. So there is almost certainly a tangent discontinuity INSIDE the footprint — and S109
// only ever asked whether the SHARED EDGE crosses one. The two facet CENTROIDS can straddle a crease
// that the shared edge never touches. If so, S109's 40.50% recall UNDER-states the crease association
// and its "59.5% has no operator pointed at it" reading is an artefact of probing the wrong segment.
// Re-probe group A on the CENTROID-TO-CENTROID segment.
{
  let creaseOnSeg = 0; let jumpOnSeg = 0; let none = 0;
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    const pp = sharedEndpoints(e); if (pp === null) continue;
    const th0e = Math.atan2(pp[1], pp[0]);
    const ke = locateKinkRaw(rA, th0e, pp[2], th0e + dThRaw(th0e, Math.atan2(pp[4], pp[3])), pp[5], PRED);
    if (ke !== null && !ke.jump) continue;              // group B (edge-crossing) — already accounted
    const c1 = centroid(d.edgeF1[e]); const c2 = centroid(d.edgeF2[e]);
    const thc = Math.atan2(c1[1], c1[0]);
    const kc = locateKinkRaw(rA, thc, c1[2], thc + dThRaw(thc, Math.atan2(c2[1], c2[0])), c2[2], PRED);
    if (kc === null) none += 1; else if (kc.jump) jumpOnSeg += 1; else creaseOnSeg += 1;
  }
  const tot = creaseOnSeg + jumpOnSeg + none;
  log('── S109 RE-EXAMINED ON THE CENTROID SEGMENT (group A only) ──');
  log(`  group A ${tot}:  crease on the centroid segment ${creaseOnSeg} (${((creaseOnSeg / Math.max(1, tot)) * 100).toFixed(2)}%)   jump ${jumpOnSeg}   none ${none}`);
  if (creaseOnSeg / Math.max(1, tot) > 0.5) {
    log('  *** S109 PROBED THE WRONG LOCUS. The majority of "non-crossing" high-dihedral pairs DO straddle a');
    log('  crease — the SHARED EDGE just does not cross it. S109 recall 40.50% UNDER-states the association and');
    log('  its "59.5% has no operator" reading MUST BE WITHDRAWN. ***');
  } else {
    log('  S109 STANDS: even on the centroid segment the majority carry no crease, so the class really is');
    log('  outside the reach of the crease programme.');
  }
  log('');
}

writeFileSync(`${OUTDIR}/S110_TURNBUDGET_${TAG}.json`, `${JSON.stringify({
  style: STYLE, hiDeg: HI_DEG,
  groups: { A: A.length, B: B.length, C: C.length },
  ratioP50: { control: cP50, highNonCrossing: aP50, highCrossing: bP50 },
}, null, 2)}\n`);
log(`rows -> ${OUTDIR}/S110_TURNBUDGET_${TAG}.json`);
log(`done ${el()}`);
