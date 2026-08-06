// s109CreaseCrossTab.ts — IS S108's HIGH-DIHEDRAL CLASS THE SAME POPULATION AS S99's CREASE CLASS?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION, AND WHY IT IS THE NEXT ONE. S108 found 2.3699% of GothicArches' shipping AREA sitting at
// 45-180 deg of ADJACENT-FACET dihedral (p99 162 deg), on well-shaped facets (minAngle median 26.71 vs
// 26.42 whole-mesh), 19,582 pairs each sharing exactly ONE edge, zero duplicates, spanning z 17.87-120.
// S99 found a crease-crossing class carrying 228 um of orientation chord / 82.5 deg. Those are CONSISTENT
// but were measured by different instruments on different quantities and have NEVER been cross-tabulated.
//
//   * If they are the SAME population, the conform-first / aligned-seed machinery already aims at it and
//     the remaining work is to make that machinery actually discharge (S100's lesson: a demand without an
//     operator relocates the defect).
//   * If they are DIFFERENT, there are TWO locus classes and one of them has no operator pointed at it
//     at all — which would be a new finding and the more important outcome.
//
// A one-number answer ("62% overlap") is NOT the deliverable. The deliverable is the 2x2 CONTINGENCY
// TABLE with a RISK RATIO, in the exact form the S24i2 micro probe used (risk ratio 74.36, odds 2202),
// so this result is directly comparable to the one that established the crease mechanism.
//
// ⚠ UNLIKE dihedralRuler, THIS IS NOT ANALYTIC-FREE. locateKinkRaw needs rA, so a style-params mismatch
// would void the whole run silently — exactly what voided S101's CelticKnot/BasketWeave and S102's
// CelticTriquetra. S103's remedy is carried here: a PRECOND on max |r_mesh - rA|, and the run REFUSES
// rather than reporting a number it cannot stand behind.
//
// ⛔⛔ THIS TOOL'S HEADLINE IS WITHDRAWN BY S110 (same day). READ THIS BEFORE QUOTING ANY NUMBER BELOW.
// S109 asks whether the SHARED EDGE crosses a crease. That is the wrong locus for this question: the
// dihedral is a property of the two FACET CENTROIDS, and they can straddle a crease that the shared edge
// never touches. s110TurnBudget re-probed the 11,651 "non-crossing" pairs on the CENTROID-TO-CENTROID
// segment and found 7,493 of them (64.31%) DO straddle a crease.
//   CORRECTED:  crease-associated 7,931 + 7,493 = 15,424 / 19,582 = 78.77%  (not the 40.50% below)
//               genuinely crease-free                    4,158 / 19,582 = 21.23%  (not 59.50%)
// The CONTINGENCY TABLE below is still correct FOR THE QUESTION IT ASKS (edge-crossing), and the risk
// ratio 20.12x stands. What must NOT be repeated is the inference "59.5% has no operator pointed at it".
//
// Usage: bash research/tools/run-s109-crosstab.sh
//   env: PF_S109_STL PF_S109_STYLE PF_S109_TAG PF_S109_HI_DEG(45) PF_S109_STRIDE(1) PF_S109_PRECOND_UM(50)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S109_STYLE ?? 'GothicArches';
const STL = process.env.PF_S109_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S109_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S109_HI_DEG', 45);
const STRIDE = Math.max(1, Math.round(envF('PF_S109_STRIDE', 1)));
const PRECOND_UM = envF('PF_S109_PRECOND_UM', 50);
const SNAP_ALPHA = envF('PF_CB_SNAP_ALPHA', 0.12);
const DIMS: StyleDims = { H: envF('PF_S109_H', 120), Rb: envF('PF_S109_RB', 40), Rt: envF('PF_S109_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/crosstab';

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

// THE DRIVER'S OWN CONSTANTS, transcribed from s99CreaseCensus so this table is comparable to S99's.
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

log('===== S109 CROSS-TAB — is S108\'s HIGH-DIHEDRAL class S99\'s CREASE class? =====');
log(`style ${STYLE}  tag ${TAG}`);
log(`STL ${STL}`);
log(`high-dihedral cut ${HI_DEG} deg   stride ${STRIDE}   snapAlpha ${SNAP_ALPHA}`);
log(`driver PRED: kinkScan ${PRED.kinkScan} halvings ${PRED.kinkHalvings} kinkRatio ${PRED.kinkRatio} jumpRatio ${PRED.jumpRatio}`);
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`mesh ${nTri} facets ${el()}`);

// ── PRECOND (S103's guard). A params mismatch makes every locateKinkRaw answer meaningless. ──
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (d > worst) worst = d;
  }
  log(`PRECOND radial  MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um  (bar ${PRECOND_UM} um)`);
  if (worst * 1000 > PRECOND_UM) {
    log('*** REFUSING: the STL was not built with these style params / dims. Every kink verdict would be noise. ***');
    process.exit(4);
  }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
log(`dihedrals ${el()}  interior ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}`);

/** recover the two shared-edge endpoint positions of interior edge slot `e` (common to both facets). */
const sharedEndpoints = (e: number): [number, number, number, number, number, number] | null => {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) {
      if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) {
        out.push(ax, ay, az); break;
      }
    }
  }
  if (out.length !== 6) return null;
  return [out[0], out[1], out[2], out[3], out[4], out[5]];
};

const hiThr = (HI_DEG * Math.PI) / 180;
// 2x2: [crosses][high]
const T = [[0, 0], [0, 0]];
let jumpClass = 0; let inBand = 0; let noEdge = 0; let tested = 0;

for (let e = 0; e < d.edgeAngRad.length; e += STRIDE) {
  const p = sharedEndpoints(e);
  if (p === null) { noEdge += 1; continue; }
  const [x0, y0, z0, x1, y1, z1] = p;
  const th0 = Math.atan2(y0, x0); const th1 = Math.atan2(y1, x1);
  // CANONICAL: locateKinkRaw parameterises t from its FIRST endpoint, and the wrapped delta must be used
  // or a seam-spanning edge is measured the long way round (the driver's own dTh convention).
  const dth = dThRaw(th0, th1);
  const k = locateKinkRaw(rA, th0, z0, th0 + dth, z1, PRED);
  tested += 1;
  const high = d.edgeAngRad[e] > hiThr ? 1 : 0;
  let crosses = 0;
  if (k !== null) {
    if (k.jump) { jumpClass += 1; } else if (k.t <= SNAP_ALPHA || k.t >= 1 - SNAP_ALPHA) { inBand += 1; crosses = 1; } else { crosses = 1; }
  }
  T[crosses][high] += 1;
}

const a = T[1][1]; const b = T[1][0]; const c = T[0][1]; const dd = T[0][0];
const riskCross = a + b > 0 ? a / (a + b) : 0;      // P(high | crosses)
const riskNo = c + dd > 0 ? c / (c + dd) : 0;       // P(high | does not)
const rr = riskNo > 0 ? riskCross / riskNo : Infinity;
const or = b * c > 0 ? (a * dd) / (b * c) : Infinity;
const recall = a + c > 0 ? a / (a + c) : 0;         // of HIGH edges, how many cross
const precision = a + b > 0 ? a / (a + b) : 0;      // of CROSSING edges, how many are high

log('');
log(`TESTED ${tested} interior edges (stride ${STRIDE})   no-shared-edge ${noEdge}   jump-class ${jumpClass}   in-band ${inBand}   ${el()}`);
log('');
log(`── CONTINGENCY TABLE: crease-crossing (locateKinkRaw, non-jump) x dihedral > ${HI_DEG} deg ──`);
log('');
log('                        | HIGH dihedral |  not   |   rate');
log(`  crosses a crease      | ${String(a).padStart(13)} | ${String(b).padStart(6)} | ${(riskCross * 100).toFixed(3)}%`);
log(`  does not              | ${String(c).padStart(13)} | ${String(dd).padStart(6)} | ${(riskNo * 100).toFixed(3)}%`);
log('');
log(`  RISK RATIO  ${rr === Infinity ? 'inf' : rr.toFixed(2)}x        ODDS RATIO  ${or === Infinity ? 'inf' : or.toFixed(1)}`);
log(`  RECALL    (of HIGH edges, share that cross a crease)  ${(recall * 100).toFixed(2)}%`);
log(`  PRECISION (of CROSSING edges, share that are HIGH)    ${(precision * 100).toFixed(2)}%`);
log('');
log('── READING IT ──');
if (recall > 0.8 && rr > 5) {
  log(`  SAME POPULATION: ${(recall * 100).toFixed(1)}% of the high-dihedral class crosses a crease locus at`);
  log('  a risk ratio far above chance. The conform machinery already POINTS at this class — the gap is');
  log('  DISCHARGE, not detection. (S100: a demand without an operator relocates the defect.)');
} else if (recall < 0.5) {
  // NOT "different populations" — a risk ratio this far above 1 is a real association. The honest
  // statement is that neither class CONTAINS the other, and the actionable half is the recall.
  log(`  *** PARTIAL OVERLAP WITH A STRONG ASSOCIATION (RR ${rr === Infinity ? 'inf' : rr.toFixed(2)}x), AND NEITHER CLASS CONTAINS THE OTHER. ***`);
  log(`  ${((1 - recall) * 100).toFixed(1)}% OF THE HIGH-DIHEDRAL CLASS DOES NOT CROSS A CREASE — so the crease machinery,`);
  log(`  even PERFECTED, cannot reach the majority of it. And ${((1 - precision) * 100).toFixed(1)}% of crease crossings are NOT`);
  log('  high-dihedral, i.e. most crossings are benign for VISIBILITY. Quote BOTH numbers; the risk ratio');
  log('  alone would read as "same class" and the recall alone would read as "unrelated". Neither is true.');
} else {
  log(`  PARTIAL OVERLAP (recall ${(recall * 100).toFixed(1)}%, RR ${rr === Infinity ? 'inf' : rr.toFixed(2)}x): the classes intersect but neither contains the`);
  log('  other. Report BOTH shares; do not call them the same class, and do not call them disjoint.');
}
log('');

writeFileSync(`${OUTDIR}/S109_CROSSTAB_${TAG}.json`, `${JSON.stringify({
  style: STYLE, stl: STL, hiDeg: HI_DEG, stride: STRIDE, tested,
  table: { crossHigh: a, crossNotHigh: b, noCrossHigh: c, noCrossNotHigh: dd },
  riskRatio: rr, oddsRatio: or, recall, precision, jumpClass, inBand,
}, null, 2)}\n`);
log(`rows -> ${OUTDIR}/S109_CROSSTAB_${TAG}.json`);
log(`done ${el()}`);
