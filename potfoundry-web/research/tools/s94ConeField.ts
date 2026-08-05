// s94ConeField.ts — CAN A CONE-DRIVEN SIZING FIELD BEAT LEPP?  (the ANALYTIC frontier, from the S93 census)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS ARM, AND WHY IT IS NOT THE ANISOTROPIC BISECTION MISTAKE AGAIN
//
// S93 measured that 88-99% of the over-bar orientation AREA is IRREDUCIBLE for its own footprint — no
// plane through that footprint clears the bar — and that the mesher already sits within 14-23% of the
// per-footprint optimum. So every connectivity operator died for one reason: THE ONLY WAY TO SHRINK A
// CONE IS TO SHRINK THE FOOTPRINT. S93 then re-measured density in ONE currency and found it works
// (over-bar chord AREA 0.2082x/level against a 0.428x coplanar null).
//
// S93 ALSO REFUTED an anisotropic proposal: bisecting the largest-normal-TURN edge cost 2.76x MORE than
// plain LEPP, left 41.5% uncleared and collapsed leaf minAngle to 2.9 deg (worst 0.00).
//
// *** WHY THIS IS A DIFFERENT MECHANISM, STATED BEFORE THE FIRST RUN. *** That arm was a BISECTION RULE:
// a greedy per-step choice of WHICH EDGE to cut, with no shape control and no target size. It degenerates
// because repeatedly cutting the same direction manufactures needles, and a needle's own normal is
// ill-conditioned — the same "required child aspect 3,009" obstruction as S82. A SIZING FIELD is the
// opposite construction: it names a TARGET SIZE h*(p) up front from the local turning rate, and the
// elements are then generated to be well-shaped WITH RESPECT TO THAT SIZE. Shape is an INPUT here, not a
// casualty. Concretely, in this file every arm's element count is derived from a target size, never from
// a greedy edge choice, and the anisotropic arm's saving is capped at an aspect ratio a mesher will
// actually emit. If the anisotropic column only pays at uncapped aspect ratio, that is a refutation and
// it is reported as one.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED HYPOTHESIS AND KILL LINES  (written before the first run)
//
//  H1 (the headline the PI asked for): an IDEAL cone-driven isotropic sizing field clears GothicArches'
//     10 um orientation CHORD bar at FEWER triangles than plain LEPP's measured 6.67x.
//     *** KILL: if the ideal count-weighted multiplier is >= 6.67x, then NO implementation of a
//     cone-driven isotropic field can beat LEPP and H1 is refuted before any mesher is built. ***
//
//  H2 (the campaign kill line): a cone-driven field brings GothicArches' over-1-degree AREA below 5%
//     at <= 12x the flag-OFF triangle count (1,142,166 facets => <= 13.71M).
//     *** KILL: > 12x, or over-1deg AREA does not reach 5%. ***
//
//  H3 (anisotropy, as a SIZING field not a bisection rule): the III = dN^T dN anisotropy buys a further
//     >= 1.5x at an aspect-ratio cap of 5. *** KILL: < 1.5x at AR cap 5. ***
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CURRENCY BUG THIS FILE EXISTS TO CATCH FIRST
//
// `frontierTaxonomy.ts` printed "AREA-WEIGHTED TRIANGLE MULTIPLIER ... isotropic refinement: 1.95x" and
// `frontierRefine.ts` printed "lepp ... 6.67x". THOSE TWO NUMBERS ARE IN DIFFERENT CURRENCIES and must
// not be compared:
//   * leaves/parent           = sum(tri_i) / N              <- THE TRIANGLE MULTIPLIER of a real mesh
//   * area-weighted multiplier= sum(A_i tri_i) / sum(A_i)   <- what a unit of AREA sees; over-weights big facets
// Every number below is printed in BOTH, labelled, and the headline uses the COUNT currency because that
// is what "12x the flag-OFF triangle count" means.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MODEL, AND THE CONTROL THAT CALIBRATES IT
//
// From the theorem (arXiv:1911.03424 / Morvan-Thibert): the normal angle is LINEAR in the footprint
// radius. So splitting a footprint by a linear factor k gives, per child, angle ~ theta/k and
// diam ~ diam/k, hence chord = 2 sin(theta/2)*diam ~ chord/k^2, at a cost of k^2 triangles. Therefore:
//     ANGLE bar theta* :  k = theta/theta*      => tri = (theta/theta*)^2   QUADRATIC in the excess
//     CHORD bar c*     :  k = sqrt(c/c*)        => tri = c/c*               LINEAR in the excess
//
// THAT IS A MODEL. `frontierRefine.ts` measured the same quantity by actually refining, and the two must
// be reconciled BEFORE either is quoted (the taxonomy file says so in its own output). So this file
// re-predicts S93's MEASURED uniform sweep from the census and prints the disagreement:
//     measured   level 1 over-bar chord AREA  8.934%   mean-chord ratio 0.2953   mean-ANGLE ratio 0.6349
//     measured   level 2                      1.012%                    0.3063                   0.6357
// If the model does not reproduce those to within ~20% it is not calibrated and every multiplier below is
// quoted with that caveat attached. THE MEASURED OPERATOR (s94ConeRefine.ts) IS THE VERDICT; this file is
// the cheap discriminator that decides whether building it is worth a night.
//
// ORACLE vs CONE. Two drivers are priced separately and the gap between them is the price of the model:
//   * ORACLE — drive from the facet's own MEASURED sup angle `nd`. Not implementable without a mesh; it is
//     the cheapest correct allocation and therefore a LOWER BOUND on any driver.
//   * CONE   — drive from `cub` (coneUB), the per-footprint normal-cone aperture, which is computable from
//     the SURFACE ALONE at 225 rA evals/facet and is what a real sizing field would use. `nd/cub` has
//     area-wt p50 1.142, so the cone UNDER-predicts the achieved angle by ~14% at the median: the CONE
//     column is therefore optimistic by that factor and a SAFETY column at cub*1.142 and cub*1.42 (p75)
//     is printed next to it.
//
// Usage: bash research/tools/run-s94-cone-field.sh
//   env: PF_S94_NDJSON  PF_S94_BAR_UM(10)  PF_S94_ANGBAR(1)  PF_S94_BASETRIS(1142166)
import { readFileSync, mkdirSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const NDJ = process.env.PF_S94_NDJSON
  ?? 'research/exchange/_strataConformBisect/frontier/FR_TAX_S39CTL.ndjson';
const TAG = process.env.PF_S94_TAG ?? 'S39CTL';
const BAR_UM = envF('PF_S94_BAR_UM', 10);
const ANGBAR = envF('PF_S94_ANGBAR', 1);
const BASETRIS = envF('PF_S94_BASETRIS', 1142166);
const OUTDIR = 'research/exchange/_strataConformBisect/frontier';

const T0 = Date.now();
mkdirSync(OUTDIR, { recursive: true });
log('===== S94 CONE FIELD — THE ANALYTIC FRONTIER OF A CONE-DRIVEN SIZING FIELD =====');
log(`census ${NDJ}   tag ${TAG}   chord bar ${BAR_UM} um   angle bar ${ANGBAR} deg   flag-OFF tris ${BASETRIS}`);
log('ALL multipliers printed in BOTH currencies. COUNT = sum(tri)/N = the triangle multiplier. AREA = sum(A*tri)/sum(A).');
log('');

interface Row {
  ar: number; dm: number; ma: number; cr: number; rp: number; nd: number; tu: number;
  clb: number; cub: number; sp: number; kk: number; of: number; ka: number; kb: number; mis: number;
}
const R: Row[] = [];
{
  const txt = readFileSync(NDJ, 'utf8');
  for (const ln of txt.split('\n')) {
    if (ln.length < 5) continue;
    const o = JSON.parse(ln) as Row;
    if (!Number.isFinite(o.nd) || !(o.ar > 0)) continue;
    R.push(o);
  }
}
const N = R.length;
const Atot = R.reduce((s, r) => s + r.ar, 0);
log(`rows ${N}   total sampled area ${Atot.toFixed(3)} mm^2   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

// ── NON-VACUITY CONTROL: reproduce the census's own headline off the same file ──
{
  const oc = R.filter((r) => r.tu > BAR_UM);
  const oa = oc.reduce((s, r) => s + r.ar, 0);
  log('');
  log('── CONTROL (non-vacuity): reproduce the S93 census headline from this file ──');
  log(`   over-bar COUNT ${oc.length}/${N} = ${((100 * oc.length) / N).toFixed(2)}%   (census printed 61.08%)`);
  log(`   over-bar AREA  ${((100 * oa) / Atot).toFixed(3)}%                (census printed 43.220%)`);
  const irr = oc.filter((r) => 2 * Math.sin((0.5 * r.clb * Math.PI) / 180) * r.dm * 1000 > BAR_UM);
  log(`   IRREDUCIBLE share of over-bar AREA ${((100 * irr.reduce((s, r) => s + r.ar, 0)) / oa).toFixed(2)}%   (census printed 88.33%)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MODEL CALIBRATION AGAINST THE MEASURED UNIFORM SWEEP — do this BEFORE quoting any multiplier.
// A uniform 1->4 split is k=2. Model: every leaf of facet i has chord tu_i/4 and angle nd_i/2, and the
// leaf areas sum to A_i. So the predicted over-bar AREA at level L is the area share of {tu/4^L > bar}
// and the predicted mean-chord ratio is exactly 4^-L. Measured values are S93's, quoted in the header.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('');
log('══ MODEL CALIBRATION — predict S93\'s MEASURED uniform 1->4 sweep from the census ══');
log('   (model: chord ~ d^2, angle ~ d. If this does not reproduce the measurement the multipliers below are not quotable.)');
log('   lev   predicted over-bar AREA%   MEASURED    predicted meanChord ratio   MEASURED   predicted meanAngle ratio  MEASURED');
const MEAS_OVER = [42.912, 8.934, 1.012, 0.581];
const MEAS_CH = [NaN, 0.2953, 0.3063, 0.3108];
const MEAS_AN = [NaN, 0.6349, 0.6357, 0.6360];
let calibWorst = 0;
for (let L = 0; L <= 3; L += 1) {
  const f = 4 ** L;
  const ov = R.reduce((s, r) => s + (r.tu / f > BAR_UM ? r.ar : 0), 0) / Atot;
  const pred = 100 * ov;
  const rel = Math.abs(pred - MEAS_OVER[L]) / Math.max(1e-9, MEAS_OVER[L]);
  if (L > 0 && rel > calibWorst) calibWorst = rel;
  log(`   ${String(L).padStart(3)}   ${pred.toFixed(3).padStart(20)}   ${MEAS_OVER[L].toFixed(3).padStart(8)}   ${(L === 0 ? NaN : 0.25).toFixed(4).padStart(23)}   ${(MEAS_CH[L]).toFixed(4).padStart(8)}   ${(L === 0 ? NaN : 0.5).toFixed(4).padStart(24)}   ${(MEAS_AN[L]).toFixed(4).padStart(8)}`);
}
log(`   *** worst relative disagreement on over-bar AREA, levels 1-3: ${(100 * calibWorst).toFixed(1)}% ***`);
log('   NOTE the ANGLE column: the model says 0.500/level, the measurement says 0.635. The surface does NOT');
log('   halve its facet-normal angle under a halving of the footprint — so every ANGLE-bar multiplier below');
log('   is an OPTIMISTIC LOWER BOUND, and the exponent-corrected column beside it is the honest one.');
// exponent implied by the measurement: angle ~ d^pAng, chord ~ d^pCh with d halving per level
const pAng = Math.log2(1 / 0.6355);
const pCh = Math.log2(1 / 0.3041);
log(`   implied exponents from the measured sweep: angle ~ d^${pAng.toFixed(3)} (model 1.000), chord ~ d^${pCh.toFixed(3)} (model 2.000)`);
log(`   => to divide an angle by X the footprint must shrink by X^(1/${pAng.toFixed(3)}) and the triangles cost X^(2/${pAng.toFixed(3)}) = X^${(2 / pAng).toFixed(3)} (model X^2)`);
log(`   => to divide a chord by X the footprint must shrink by X^(1/${pCh.toFixed(3)}) and the triangles cost X^${(2 / pCh).toFixed(3)} (model X^1)`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const floorChordUB = (r: Row): number => 2 * Math.sin((0.5 * r.cub * Math.PI) / 180) * r.dm * 1000;

interface Arm { name: string; tri: (r: Row) => number; }
/** tri counts under the MODEL exponent (2 for chord, 1 for angle) and under the MEASURED exponent. */
function chordArm(name: string, c: (r: Row) => number, exp: number): Arm {
  return { name, tri: (r) => Math.max(1, (c(r) / BAR_UM) ** exp) };
}
function angArm(name: string, a: (r: Row) => number, exp: number): Arm {
  return { name, tri: (r) => Math.max(1, (a(r) / ANGBAR) ** exp) };
}

function report(arms: Arm[], title: string): void {
  log('');
  log(`── ${title} ──`);
  log('   arm                                       COUNT mult    AREA mult    x flag-OFF tris     abs tris');
  for (const a of arms) {
    let sc = 0; let sa = 0;
    for (const r of R) { const t = a.tri(r); sc += t; sa += r.ar * t; }
    const mc = sc / N; const ma = sa / Atot;
    log(`   ${a.name.padEnd(40)} ${mc.toFixed(3).padStart(10)}   ${ma.toFixed(3).padStart(10)}   ${mc.toFixed(2).padStart(12)}x   ${(mc * BASETRIS / 1e6).toFixed(2).padStart(10)}M`);
  }
}

report([
  chordArm(`ORACLE chord (measured nd)  exp ${1}`, (r) => r.tu, 1),
  chordArm(`ORACLE chord  MEASURED exp ${(2 / pCh).toFixed(3)}`, (r) => r.tu, 2 / pCh),
  chordArm(`CONE   chord (coneUB)       exp ${1}`, floorChordUB, 1),
  chordArm(`CONE   chord  MEASURED exp ${(2 / pCh).toFixed(3)}`, floorChordUB, 2 / pCh),
  chordArm(`CONE   chord x1.142 (nd/cub p50)`, (r) => 1.142 * floorChordUB(r), 2 / pCh),
  chordArm(`CONE   chord x1.420 (nd/cub p75)`, (r) => 1.420 * floorChordUB(r), 2 / pCh),
], `H1 — CHORD BAR ${BAR_UM} um.  ANCHOR: plain LEPP measured 6.67x (N=150) / red 9.09-9.72x (N=1500-2000), COUNT currency`);

report([
  angArm(`ORACLE angle (measured nd)  exp 2`, (r) => r.nd, 2),
  angArm(`ORACLE angle  MEASURED exp ${(2 / pAng).toFixed(3)}`, (r) => r.nd, 2 / pAng),
  angArm(`CONE   angle (coneUB)       exp 2`, (r) => r.cub, 2),
  angArm(`CONE   angle  MEASURED exp ${(2 / pAng).toFixed(3)}`, (r) => r.cub, 2 / pAng),
], `H2 — ANGLE BAR ${ANGBAR} deg (FULL CLEARANCE).  ANCHOR: red 1->4 measured 351x at 1 deg, 20.7% uncleared`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H2 PROPERLY: the kill line is an AREA SHARE (< 5% over 1 deg), NOT full clearance. That is a knapsack:
// clearing facet i costs (tri_i - 1) extra triangles and removes A_i from the over-bar area. The greedy
// order by A_i/(tri_i - 1) is the EXACT optimum of the fractional relaxation, so this curve is the
// FRONTIER of over-bar-area vs triangles for ANY isotropic sizing field. No operator can be left of it.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function pareto(label: string, tri: (r: Row) => number, over: (r: Row) => boolean): void {
  const items = R.map((r) => ({ r, t: tri(r), o: over(r) }));
  const overA0 = items.reduce((s, it) => s + (it.o ? it.r.ar : 0), 0);
  const base = items.reduce((s, it) => s + (it.o ? 0 : 1), 0); // unrefined facets stay at 1 triangle
  const cand = items.filter((it) => it.o).sort((a, b) => (b.r.ar / Math.max(1e-12, b.t - 1)) - (a.r.ar / Math.max(1e-12, a.t - 1)));
  log('');
  log(`── ${label} — GREEDY FRONTIER (fractional-knapsack optimum: no isotropic field can beat this) ──`);
  log(`   start: over-bar AREA ${((100 * overA0) / Atot).toFixed(3)}%  on ${cand.length}/${N} facets`);
  log('   target over-bar AREA%     COUNT mult    x flag-OFF     facets refined');
  const targets = [20, 15, 10, 7.5, 5, 3, 2, 1, 0];
  let ti = 0;
  let tris = base + cand.length; // all candidates still 1 triangle
  let remA = overA0;
  for (let q = 0; q <= cand.length; q += 1) {
    while (ti < targets.length && (100 * remA) / Atot <= targets[ti]) {
      const mc = tris / N;
      log(`   ${targets[ti].toFixed(1).padStart(20)}%   ${mc.toFixed(3).padStart(11)}   ${mc.toFixed(2).padStart(10)}x   ${String(q).padStart(16)}`);
      ti += 1;
    }
    if (ti >= targets.length || q >= cand.length) break;
    tris += cand[q].t - 1; remA -= cand[q].r.ar;
  }
  if (ti < targets.length) {
    const mc = tris / N;
    log(`   *** floor reached at over-bar AREA ${((100 * remA) / Atot).toFixed(4)}% and ${mc.toFixed(3)}x — targets below that are UNREACHABLE by this field ***`);
  }
}
pareto(`H2 ANGLE ${ANGBAR} deg, ORACLE driver, MEASURED exponent ${(2 / pAng).toFixed(3)}`,
  (r) => Math.max(1, (r.nd / ANGBAR) ** (2 / pAng)), (r) => r.nd > ANGBAR);
pareto(`H2 ANGLE ${ANGBAR} deg, CONE driver, MEASURED exponent ${(2 / pAng).toFixed(3)}`,
  (r) => Math.max(1, (r.cub / ANGBAR) ** (2 / pAng)), (r) => r.nd > ANGBAR);
pareto(`H1 CHORD ${BAR_UM} um, ORACLE driver, MEASURED exponent ${(2 / pCh).toFixed(3)}`,
  (r) => Math.max(1, (r.tu / BAR_UM) ** (2 / pCh)), (r) => r.tu > BAR_UM);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// H3 — ANISOTROPY AS A SIZING FIELD.  III = dN^T dN in the (r*theta, z) arclength chart; kapA >= kapB are
// its principal turning rates (1/mm). An element may be stretched by kapA/kapB along the slow direction at
// the SAME aperture, so the metric element count falls by that ratio, CAPPED at the aspect ratio a mesher
// will actually emit. kapB UNDERFLOWS on developable patches (census p05 = 0.00000) so the uncapped ratio
// is a division artefact and is NOT quoted; only capped columns are.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('');
log('── H3 — ANISOTROPIC SIZING (capped). saving = min(ARcap, kapA/kapB) on the isotropic multiplier ──');
log('   NOTE: this prices a REMESH under an anisotropic metric. It does NOT price subdividing the existing');
log('   facets, whose long axes are misaligned with the slow direction by area-wt p50 28.43 deg — a');
log('   subdivision operator captures only the part of the anisotropy its parents are already aligned with.');
for (const [label, tri] of [
  [`CHORD ${BAR_UM}um CONE exp ${(2 / pCh).toFixed(3)}`, (r: Row) => Math.max(1, (floorChordUB(r) / BAR_UM) ** (2 / pCh))],
  [`ANGLE ${ANGBAR}deg CONE exp ${(2 / pAng).toFixed(3)}`, (r: Row) => Math.max(1, (r.cub / ANGBAR) ** (2 / pAng))],
] as Array<[string, (r: Row) => number]>) {
  const caps = [1, 2, 3, 5, 10, 20];
  const parts: string[] = [];
  for (const cap of caps) {
    let sc = 0;
    for (const r of R) {
      const a = Math.min(cap, r.ka / Math.max(1e-12, r.kb));
      sc += Math.max(1, tri(r) / Math.max(1, a));
    }
    parts.push(`AR<=${String(cap).padStart(2)}: ${(sc / N).toFixed(3)}x`);
  }
  log(`   ${label.padEnd(34)} ${parts.join('   ')}`);
}
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
