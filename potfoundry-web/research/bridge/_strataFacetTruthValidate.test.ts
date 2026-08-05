// _strataFacetTruthValidate.test.ts — VALIDATE THE RULER BEFORE TRUSTING ANY VERDICT.
// Gated PF_STRATA_FTV=1. RESEARCH ONLY.
//
// The STRATA-001 scorecard was produced by a ruler nobody had validated against a known answer. This file
// refuses to repeat that: every claim `_facetTruthLib` makes is checked here against either a CLOSED-FORM
// value or a deliberately constructed defect of known size, on synthetic surfaces where the truth is not in
// dispute. If these fail, no measurement made with this instrument means anything.
//
//   V1  cylinder chord sagitta        — H1 against the exact R(1-cos(dth/2))
//   V2  H1 monotone + bound soundness — bound >= witnessed, and the bound tightens as n rises
//   V3  H1 is BLIND to a missing ridge — proves H1 alone cannot audit this pipeline (the reason H2 exists)
//   V4  H2 finds a ridge the mesh never represents, to its true height
//   V5  THE BLIND SPOT ITSELF         — a feature narrower than the old ruler's 0.03 mm pitch: the old
//                                       ruler reads ~0, H2 reads the full relief
//   V6  agreement on an honest mesh   — a mesh that DOES resolve the ridge reads small in both directions,
//                                       so V4/V5 are detecting the defect and not an instrument bias
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// 2026-08-05 — NON-VACUITY SWEEP (agent AUDIT). READ THIS BEFORE ADDING OR RELAXING A BAR.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// *** A CONFIRMED HOLE, AND IT WAS EXPLOITED THE SAME NIGHT. *** `PF_FT_DESCENT_K=8` truncates the
// coordinate descent's halving tail. It passed this file **12/12 with V3 and V7c exact** while silently
// collapsing the perpendicular ruler onto the radial one:
//        V10 worst radial/perpendicular  19.871x -> 1.000x
//        V10 worst ortho                 2.70e-7 -> 6.83e-2   (5 orders of magnitude, and UNASSERTED)
// It passed because V10 asserted only `perpendicular <= radial`, and a DEGENERATE `perpendicular ==
// radial` satisfies that. `worstRatio > 1.0` was the only floor and 1.0000001 clears it. `maxOrtho` was
// COMPUTED, PRINTED, AND NEVER ASSERTED — the solver's own self-report that its "perpendicular" foot is
// not perpendicular was sitting in the log, green.
//
// THE GENERAL LESSON, applied to all twelve bars below: **an assertion with a bound on only one side
// is satisfied by a DEAD instrument or an EXPLODING one.** Every bar that read `x < ceiling` has been
// given a floor and every bar that read `x > floor` has been given a ceiling, and where a closed form
// or an independent oracle exists the bar is now written against THAT instead of against a threshold.
// The audit, bar by bar (values are the 2026-08-05 baseline, PF_FT_DESCENT_K unset):
//
//   V1   `bound >= witnessed` — unbounded above; `bound = Infinity` passed.  FIXED: bound is now
//        asserted EQUAL to `witnessed + covRadius/n`, which is its definition.
//   V2   `bound <= prev + 1e-12` allowed a bound that never tightens, while the test's own title says
//        "tightens with n".  FIXED: STRICT decrease across the sweep; `tight.witnessed` given a ceiling.
//   V3   all three assertions were UPPER bounds — an H1 that returns literally 0 passed.  FIXED: floors.
//   V4   `res.max > amp*0.9` only — an H2 that returns 1e9 passed.  FIXED: ceiling at amp*1.1.
//   V5   `oldMax < 0.02` — an old ruler that returns 0 passed, which would make the whole "blind spot"
//        result vacuous.  FIXED: `oldMax` is now asserted against the CLOSED-FORM background chord
//        sagitta R0*(1-cos(dth/2)) — it must read exactly the sagitta it CAN see, and miss only the
//        crest. Plus a ceiling on `res.max`.
//   V6   `res.max < amp*0.1` — UPPER BOUND ONLY. *** The one test whose entire job is "the instrument is
//        not biased" was passed by a DEAD INSTRUMENT. ***  FIXED: a paired NEGATIVE CONTROL at V6's own
//        options on a mesh that does NOT resolve the ridge; the ratio must exceed 100x.
//   V7   `witnessed < jump*0.05` — upper bound only, and `detectZJumps(...).length` was printed but not
//        asserted.  FIXED: the jump count and location are asserted, and a PAIRED run of the same facet
//        with `zJumps: []` must read ~the full jump — proving the small reading is the CLOSURE and not
//        a dead ruler.
//   V7b  `witnessed > off*0.9` only.  FIXED: ceiling at off*1.1.
//   V7c  `d > halfUm*0.6` only.  FIXED: ceiling at halfUm*2.5.
//   V8   sound (two-sided on d, ortho is a residual so a ceiling is the right shape). ADDED: the solver
//        must report `converged` and a real iteration count.
//   V9   `radial/perp > 1.0` was a weak floor.  FIXED: the ratio is now asserted against its CLOSED FORM
//        sqrt(1+k^2) to 1e-4 — this is what makes a perp/radial COLLAPSE unrepresentable.
//   V10  THE HOLE. FIXED: `maxOrtho` asserted; the ratio floor raised from 1.0 to 5.0 (baseline 19.871);
//        and a MEDIAN separation clause so one lucky probe cannot carry it.
//   V11  NEW, and it is the permanent regression fixture for the K=8 case: `distPerp` is compared
//        against an INDEPENDENT brute-force oracle written inline in this file that calls no library
//        code at all. Two-sided, absolute, and no degenerate collapse can satisfy it.
//
// MUTATION PROOFS (`PF_FTV_MUT=1`): every hardened bar's numeric content is a pure predicate, and the
// mutation block feeds each one the exact degenerate value the OLD one-sided bar accepted and asserts
// it now THROWS. A bar that cannot be made to fail on purpose is not a bar.
import { describe, it, expect } from 'vitest';
import { certifyTriangle, covRadius, detectZJumps, distPerp, distRadial, pickLocatorCell, surfaceToMeshMax, type RadiusFn } from './_facetTruthLib';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';

const RUN = process.env.PF_STRATA_FTV === '1';
const MUT = process.env.PF_FTV_MUT === '1';
const TAU = 2 * Math.PI;
const H = 120;
const R0 = 45;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE BARS AS PURE PREDICATES. Each one holds the NUMERIC CONTENT of a bar and nothing else, so the
// MUTATION PROOFS block can call it with a deliberately broken instrument's numbers and prove it throws.
// If a predicate here is weakened, the mutation proof for it fails — that coupling is the point.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
/** V1: witnessed must equal the closed form AND `bound` must be exactly `witnessed + covRad/n`. */
export function barV1(exact: number, witnessed: number, bound: number, cov: number, n: number): void {
  expect(Math.abs(witnessed - exact) / exact).toBeLessThan(0.01);
  expect(bound).toBeGreaterThanOrEqual(witnessed);
  // NON-VACUITY: an unbounded `bound` (Infinity, or any inflated number) is not a certificate.
  expect(Number.isFinite(bound)).toBe(true);
  expect(Math.abs(bound - (witnessed + cov / n))).toBeLessThan(1e-12);
}
/** V2: the bound must STRICTLY tighten across the tolerance sweep, not merely fail to grow. */
export function barV2Monotone(bounds: number[]): void {
  for (let i = 1; i < bounds.length; i += 1) expect(bounds[i]).toBeLessThanOrEqual(bounds[i - 1] + 1e-12);
  // NON-VACUITY: "tightens with n" is the test's own title; a constant bound is not a tightening.
  expect(bounds[bounds.length - 1]).toBeLessThan(bounds[0] * 0.999);
}
/** V3: H1 under-reports a thin ridge — but it must still read SOMETHING, or the result is vacuous. */
export function barV3(reading: number, halfWidthMm: number, reliefMm: number, ratioFloor: number): void {
  expect(reading).toBeLessThan(reliefMm * 0.5);
  expect(reliefMm / reading).toBeGreaterThan(ratioFloor);
  // NON-VACUITY: H1 legitimately reads about the ridge HALF-WIDTH. A dead ruler reads 0 and would have
  // passed every original assertion in V3, including `relief/reading > 20` (which is Infinity at 0).
  expect(reading).toBeGreaterThan(halfWidthMm * 0.6);
  expect(reading).toBeLessThan(halfWidthMm * 2.5);
}
/** V4/V5: H2 must find the missing relief — and must not EXPLODE past it. */
export function barH2FindsRelief(max: number, amp: number, floorFrac: number): void {
  expect(max).toBeGreaterThan(amp * floorFrac);
  expect(max).toBeLessThan(amp * 1.1);
}
/** V5: the OLD ruler must read EXACTLY the background chord sagitta it can see — not zero. */
export function barV5OldRuler(oldMax: number, sagittaClosedForm: number): void {
  expect(oldMax).toBeLessThan(0.02);
  // NON-VACUITY, and it is a closed form rather than a threshold: the old ruler is blind to the CREST,
  // not blind altogether. A ruler returning 0 satisfies `oldMax < 0.02` and makes V5's whole "blind
  // spot" claim unfalsifiable.
  expect(Math.abs(oldMax - sagittaClosedForm) / sagittaClosedForm).toBeLessThan(0.05);
}
/** V6: small on a resolved mesh — AND large on an unresolved one at the SAME options. */
export function barV6(resolvedMax: number, unresolvedMax: number, amp: number): void {
  expect(resolvedMax).toBeLessThan(amp * 0.1);
  // NON-VACUITY: this is the bar a DEAD H2 passed. The same call, same options, same tolerance, on a
  // mesh that does NOT represent the ridge must scream.
  expect(unresolvedMax).toBeGreaterThan(amp * 0.4);
  expect(unresolvedMax / Math.max(resolvedMax, 1e-12)).toBeGreaterThan(100);
}
/** V7: the closure forgives a tread wall — and its absence must NOT forgive it. */
export function barV7(withClosure: number, withoutClosure: number, jump: number, nSteps: number, stepZ: number, zStep: number): void {
  expect(withClosure).toBeLessThan(jump * 0.05);
  // NON-VACUITY: the small reading must be the CLOSURE doing its job, not the ruler being dead.
  expect(nSteps).toBe(1);
  expect(Math.abs(stepZ - zStep)).toBeLessThan(1e-3);
  expect(withoutClosure).toBeGreaterThan(jump * 0.5);
}
/** V7b/V7c: a real error must be read at its real size — floor AND ceiling. */
export function barTwoSided(reading: number, truth: number, lo: number, hi: number): void {
  expect(reading).toBeGreaterThan(truth * lo);
  expect(reading).toBeLessThan(truth * hi);
}
/** V9: the radial/perpendicular ratio has a CLOSED FORM on a cone. This is what a collapse cannot fake. */
export function barV9(radial: number, perp: number, gap: number, k: number): void {
  const expected = gap / Math.sqrt(1 + k * k);
  expect(Math.abs(radial - gap)).toBeLessThan(1e-9);
  expect(Math.abs(perp - expected) / expected).toBeLessThan(1e-4);
  // THE CLAUSE THAT MAKES A perp==radial COLLAPSE UNREPRESENTABLE. `ratio > 1.0` did not.
  expect(Math.abs(radial / perp - Math.sqrt(1 + k * k))).toBeLessThan(1e-4);
}
/**
 * V10: THE BAR THAT PF_FT_DESCENT_K=8 WALKED THROUGH.
 *
 * *** AND A SECOND DEFECT, FOUND BY THE FIRST VERSION OF THIS VERY CLAUSE (2026-08-05). *** The first
 * hardening attempt asserted a MEDIAN ratio over V10's original 40 probes and FAILED AT BASELINE:
 *     `worst 19.871x, MEDIAN 1.000x, separated(>1.05x) 1/40`
 * The ridge is 4.444e-4 rad in half-width and the probes step 8e-4 rad apart, so **exactly ONE of the
 * forty probes (i=20, the crest apex) lands on the feature at all**; the other thirty-nine sit on the
 * plain cylinder where radial IS perpendicular and the ratio is correctly 1.000. V10's entire
 * non-vacuity signal was carried by a SINGLE PROBE. That is not a population, and a regression that
 * happened to spare one point would have gone straight through the hardened bar too.
 *
 * FIXED BY FIXING THE FIXTURE, not by lowering the bar: 11 probes are added strictly INSIDE the ridge
 * half-width, and the two populations are now scored SEPARATELY and in OPPOSITE directions —
 *   FLANK probes: the surface has slope r_theta = amp/half, so radial/perp = sqrt(1+(r_theta/r)^2) ~ 20.
 *                 A collapse is a 20x error here and cannot hide.
 *   FLAT probes:  on a plain cylinder radial IS perpendicular, so the ratio must be 1 to 1e-6. This
 *                 catches the opposite defect — a "perpendicular" ruler that under-reports on a
 *                 cylinder — which no previous clause could see.
 */
export function barV10(
  worstRatio: number, maxOrtho: number, flankMedian: number, flankSeparated: number, nFlank: number, worstFlatDev: number,
): void {
  expect(worstRatio).toBeGreaterThan(1.0);
  // *** THE NON-VACUITY CLAUSE. *** Baseline on this fixture is 19.871x; PF_FT_DESCENT_K=8 gives 1.000x.
  // The floor is set an order of magnitude below the baseline and an order ABOVE a degenerate collapse.
  expect(worstRatio).toBeGreaterThan(5.0);
  // *** THE CLAUSE THAT WAS COMPUTED AND NEVER ASSERTED. *** Baseline 2.70e-7; K=8 gives 6.83e-2. The
  // solver's own report that its foot is not perpendicular is a FAILURE, not a log line.
  expect(maxOrtho).toBeLessThan(1e-5);
  // and no single probe may carry it: the ON-FEATURE population must separate as a population.
  expect(nFlank).toBeGreaterThanOrEqual(8);
  expect(flankMedian).toBeGreaterThan(5.0);
  expect(flankSeparated / nFlank).toBeGreaterThan(0.8);
  // THE OPPOSITE DIRECTION, which nothing in this file tested before: off the feature the two rulers
  // must AGREE, because a cylinder has no tilt. A perpendicular ruler that under-reads here is as broken
  // as one that collapses on the flank.
  expect(worstFlatDev).toBeLessThan(1e-6);
}
/** V11: distPerp against an INDEPENDENT brute-force oracle. Absolute, two-sided, no library code. */
export function barV11(worstRelErr: number, footInside: boolean): void {
  expect(footInside).toBe(true);
  expect(worstRelErr).toBeLessThan(1e-3);
}

/** Plain cylinder. */
const cylinder: RadiusFn = () => R0;

/**
 * Cylinder + one vertical ridge at theta=thc of angular half-width `half` and height `amp`.
 * Triangular profile, so the crest is a genuine C1 crease of exactly known height.
 */
function ridged(thc: number, half: number, amp: number): RadiusFn {
  return (th: number) => {
    let d = th - thc;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const a = Math.abs(d);
    return a >= half ? R0 : R0 + amp * (1 - a / half);
  };
}

/**
 * Structured theta x z mesh of a radial surface, with the theta columns given explicitly. Passing columns
 * that straddle a ridge without landing on its crest is how a "feature-spanning facet" is constructed.
 */
function structuredMesh(rA: RadiusFn, cols: number[], nZ: number): RefMesh {
  const nT = cols.length;
  const nRow = nZ + 1;
  const xyz = new Float64Array(nT * nRow * 3);
  for (let j = 0; j < nRow; j += 1) {
    const z = (H * j) / nZ;
    for (let i = 0; i < nT; i += 1) {
      const th = cols[i];
      const r = rA(th, z);
      const o = (j * nT + i) * 3;
      xyz[o] = r * Math.cos(th); xyz[o + 1] = r * Math.sin(th); xyz[o + 2] = z;
    }
  }
  const idx = new Uint32Array(nZ * nT * 6);
  let k = 0;
  for (let j = 0; j < nZ; j += 1) {
    for (let i = 0; i < nT; i += 1) {
      const i1 = (i + 1) % nT;
      const a = j * nT + i; const b = j * nT + i1; const c = (j + 1) * nT + i; const d = (j + 1) * nT + i1;
      idx[k] = a; idx[k + 1] = b; idx[k + 2] = d; k += 3;
      idx[k] = a; idx[k + 1] = d; idx[k + 2] = c; k += 3;
    }
  }
  return { xyz, idx, nV: nT * nRow, nF: nZ * nT * 2 };
}

/** The old ruler, re-implemented faithfully: plane distance on a fixed lattice, n = clamp(le/0.03, 12, 64). */
function oldRulerMax(rA: RadiusFn, mesh: RefMesh): number {
  const { xyz, idx, nF } = mesh;
  let worst = 0;
  for (let f = 0; f < nF; f += 1) {
    const ia = idx[f * 3] * 3; const ib = idx[f * 3 + 1] * 3; const ic = idx[f * 3 + 2] * 3;
    const ax = xyz[ia]; const ay = xyz[ia + 1]; const az = xyz[ia + 2];
    const bx = xyz[ib]; const by = xyz[ib + 1]; const bz = xyz[ib + 2];
    const cx = xyz[ic]; const cy = xyz[ic + 1]; const cz = xyz[ic + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-18) continue;
    nx /= nl; ny /= nl; nz /= nl;
    const le = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    const n = Math.max(12, Math.min(64, Math.ceil(le / 0.03)));
    const tA = Math.atan2(ay, ax);
    const un = (x: number): number => { let d = x - tA; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
    const dB = un(Math.atan2(by, bx)); const dC = un(Math.atan2(cy, cx));
    for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
      const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
      const th = tA + wb * dB + wc * dC;
      const z = wa * az + wb * bz + wc * cz;
      const r = rA(th, z);
      const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}

/**
 * H1 witnessed max for a single facet that spans [thc-halfSpan, thc+halfSpan] with its vertices sitting on
 * the surface — i.e. a "feature-spanning facet" built on purpose.
 */
function certifyTriangleAcross(rA: RadiusFn, thc: number, halfSpan: number): number {
  const th0 = thc - halfSpan; const th1 = thc + halfSpan;
  const r0 = rA(th0, 50); const r1 = rA(th1, 50); const r2 = rA(th0, 51);
  return certifyTriangle(rA,
    r0 * Math.cos(th0), r0 * Math.sin(th0), 50,
    r1 * Math.cos(th1), r1 * Math.sin(th1), 50,
    r2 * Math.cos(th0), r2 * Math.sin(th0), 51,
    { H, tol: 0.01, nMax: 4096 }).witnessed;
}

describe('facet-truth ruler validation', () => {
  it.runIf(RUN)('V1: H1 reproduces the closed-form cylinder chord sagitta', () => {
    const dth = 0.02;
    const th0 = 0.3; const th1 = th0 + dth;
    const a: [number, number, number] = [R0 * Math.cos(th0), R0 * Math.sin(th0), 40];
    const b: [number, number, number] = [R0 * Math.cos(th1), R0 * Math.sin(th1), 40];
    const thm = 0.5 * (th0 + th1);
    const c: [number, number, number] = [R0 * Math.cos(thm), R0 * Math.sin(thm), 41];
    // deepest point is the midpoint of the a-b chord; nearest cylinder point is radially outward
    const exact = R0 * (1 - Math.cos(dth / 2));
    const v = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
      { H, tol: 1e-7, nMax: 256 });
    const cov = covRadius(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    // eslint-disable-next-line no-console
    console.log(`V1 exact ${(exact * 1000).toFixed(6)} um   witnessed ${(v.witnessed * 1000).toFixed(6)} um   bound ${(v.bound * 1000).toFixed(6)} um   covRad/n ${((cov / v.n) * 1000).toFixed(6)} um   n=${v.n}`);
    barV1(exact, v.witnessed, v.bound, cov, v.n);
  });

  it.runIf(RUN)('V2: the certified bound is sound, and tightens with n while it still certifies', () => {
    const th0 = 1.1; const th1 = 1.1 + 0.05;
    const a: [number, number, number] = [R0 * Math.cos(th0), R0 * Math.sin(th0), 30];
    const b: [number, number, number] = [R0 * Math.cos(th1), R0 * Math.sin(th1), 30];
    const c: [number, number, number] = [R0 * Math.cos(th0), R0 * Math.sin(th0), 32];
    const cov = covRadius(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    expect(cov).toBeGreaterThan(0);
    // The chord sagitta of this facet is ~14 um, so tolerances below that CANNOT be certified and the
    // routine correctly stops early instead of burning resolution on a settled verdict. Monotonicity is
    // therefore asserted only across the tolerances where a certificate is actually attainable.
    const bounds: number[] = [];
    for (const tol of [0.05, 0.03, 0.02]) {
      const v = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H, tol, nMax: 4096 });
      expect(v.certified).toBe(true);
      expect(v.bound).toBeGreaterThanOrEqual(v.witnessed - 1e-15);
      expect(v.bound).toBeLessThanOrEqual(tol + 1e-15);
      bounds.push(v.bound);
    }
    // eslint-disable-next-line no-console
    console.log(`V2 bounds at tol 0.05/0.03/0.02: ${bounds.map((b) => (b * 1000).toFixed(4)).join(' / ')} um`);
    // NON-VACUITY: the title says "tightens with n". `bound <= prev + 1e-12` was satisfied by a bound
    // that never moved; barV2Monotone requires a STRICT decrease across the sweep.
    barV2Monotone(bounds);
    // Below the true sagitta the verdict must be an honest NOT-CERTIFIED, never a silent pass.
    const tight = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H, tol: 0.008, nMax: 4096 });
    expect(tight.certified).toBe(false);
    expect(tight.witnessed).toBeGreaterThan(0.008);
    // NON-VACUITY: the facet's true sagitta is ~14 um, so an EXPLODING reading is as wrong as a dead
    // one and `witnessed > 0.008` alone does not exclude it.
    expect(tight.witnessed).toBeLessThan(0.02);
    // and the witness is a real point whose radial distance is genuinely what was reported
    const v = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H, tol: 1e-7, nMax: 128 });
    expect(Math.abs(distRadial(cylinder, H, v.px, v.py, v.pz) - v.witnessed)).toBeLessThan(1e-9);
  });

  it.runIf(RUN)('V3: H1 UNDER-REPORTS missing relief by the feature width/height ratio', () => {
    // A facet spanning a ridge that the mesh never represents. H1 does not read zero — it reads roughly the
    // ridge HALF-WIDTH, because that is how far a facet point sits from the nearest SURVIVING surface. So a
    // thin, tall feature is invisible to H1 while hundreds of microns of geometry are absent. This is not a
    // defect of H1; it is the reason a mesh->surface number alone can never audit this pipeline.
    const thc = 0.5;
    const amp = 0.5;
    const wide = certifyTriangleAcross(ridged(thc, 0.004, amp), thc, 0.02);
    // eslint-disable-next-line no-console
    console.log(`V3 wide ridge (half-width ${(0.004 * R0 * 1000).toFixed(0)} um, relief ${amp * 1000} um): H1 ${(wide * 1000).toFixed(3)} um`);
    // NON-VACUITY (2026-08-05): every original assertion in V3 was an UPPER bound, so an H1 that returns
    // literally 0 passed all of them — including `relief/reading > 20`, which is Infinity at 0. barV3
    // adds the floor: H1 legitimately reads about the ridge HALF-WIDTH (that IS V3's mechanism), never
    // materially less, and never more than a small multiple of it.
    barV3(wide, 0.004 * R0, amp, 2);

    // Now the case that matters: a ridge 8 um in half-width and 400 um tall. H1 reads UNDER TOLERANCE.
    const thinAmp = 0.4;
    const thin = certifyTriangleAcross(ridged(thc, 0.008 / R0, thinAmp), thc, 0.02);
    // eslint-disable-next-line no-console
    console.log(`V3 thin ridge (half-width 8 um, relief ${thinAmp * 1000} um): H1 ${(thin * 1000).toFixed(3)} um  <-- passes a 10 um bar`);
    // 12 um against 400 um of absent relief: H1 under-reports by 33x. The exact threshold is not the
    // point — the ratio is, and it is set by width/height, so it is unbounded for a thin enough feature.
    expect(thin).toBeLessThan(0.02);
    barV3(thin, 0.008, thinAmp, 20);
  });

  it.runIf(RUN)('V4: H2 finds an unrepresented ridge at its true height', () => {
    const thc = 0.5; const half = 0.004; const amp = 0.5;
    const rA = ridged(thc, half, amp);
    // columns deliberately straddle the crest without landing on it
    const cols: number[] = [];
    const nT = 240;
    for (let i = 0; i < nT; i += 1) cols.push(thc + 0.013 + (TAU * i) / nT);
    const mesh = structuredMesh(rA, cols, 60);
    const loc = buildRefLocator(mesh, pickLocatorCell(mesh.xyz, mesh.idx, mesh.nF));
    const res = surfaceToMeshMax(rA, loc.dist, { H, tol: 0.01, coveragePitch: 0.05, minPitch: 0.004, budget: 2e7 });
    // eslint-disable-next-line no-console
    console.log(`V4 H2 witnessed ${(res.max * 1000).toFixed(3)} um vs true ridge height ${amp * 1000} um (queries ${res.queries}, capped ${res.capped})`);
    // `capped` only truncates phase-B refinement; phase-A coverage of the whole domain always completes,
    // which is why the ridge is found regardless. Asserting on it would be asserting on a budget, not a
    // measurement.
    // NON-VACUITY (2026-08-05): `res.max > amp*0.9` was one-sided, so an H2 returning 1e9 passed. The
    // ridge height is KNOWN, so the reading has a ceiling as well as a floor.
    barH2FindsRelief(res.max, amp, 0.9);
    expect(res.queries).toBeGreaterThan(0);
  });

  it.runIf(RUN)('V5: THE BLIND SPOT, deterministically — a crest placed BETWEEN the old rulers samples', () => {
    // The old ruler's sample positions are computable, not random. For a structured mesh every facet spans
    // the same [th_i, th_i+1] and its barycentric lattice puts theta samples exactly at th_i + k*dth/n with
    // n = clamp(ceil(longestEdge/0.03), 12, 64). Placing a crest at a HALF-INTEGER multiple of that pitch,
    // narrower than the pitch itself, guarantees NO sample ever lands on it. Nothing here is chance.
    const nT = 200; const nZ = 140;
    const dth = TAU / nT;
    const arc = dth * R0;                                   // 1.414 mm
    const dz = H / nZ;                                      // 0.857 mm
    const le = Math.hypot(arc, dz);                         // the facet diagonal is the longest edge
    const n = Math.max(12, Math.min(64, Math.ceil(le / 0.03)));
    const samplePitchArc = arc / n;                         // ~25 um
    const halfArc = 0.4 * samplePitchArc;                   // crest fits strictly between two samples
    const amp = 0.4;
    const i0 = 37;
    const thc = dth * i0 + (28 + 0.5) * (dth / n);          // exactly half-way between sample columns
    const rA = ridged(thc, halfArc / R0, amp);
    const cols: number[] = [];
    for (let i = 0; i < nT; i += 1) cols.push(dth * i);
    const mesh = structuredMesh(rA, cols, nZ);
    const oldMax = oldRulerMax(rA, mesh);
    const loc = buildRefLocator(mesh, pickLocatorCell(mesh.xyz, mesh.idx, mesh.nF));
    const res = surfaceToMeshMax(rA, loc.dist, {
      H, tol: 0.01, coveragePitch: 0.05, minPitch: 0.0015, structN: 48, budget: 4e7,
    });
    // eslint-disable-next-line no-console
    console.log(`V5 crest half-width ${(halfArc * 1000).toFixed(1)} um at half-pitch offset (sample pitch ${(samplePitchArc * 1000).toFixed(1)} um, n=${n})`);
    // eslint-disable-next-line no-console
    console.log(`V5 OLD ruler ${(oldMax * 1000).toFixed(3)} um   H2 ${(res.max * 1000).toFixed(3)} um   true relief ${amp * 1000} um   structPitch ${(res.structPitch * 1000).toFixed(2)} um`);
    // NON-VACUITY, AND IT IS A CLOSED FORM (2026-08-05). `oldMax < 0.02` alone was satisfied by an old
    // ruler that returns 0 — which would make V5's entire "blind spot" claim unfalsifiable, because a
    // dead ruler is blind to everything. The old ruler is blind to the CREST and must still read the
    // BACKGROUND chord sagitta of this structured mesh exactly: R0*(1-cos(dth/2)). Measured 5.552 um
    // against a closed form of 5.552 um.
    const bgSagitta = R0 * (1 - Math.cos(dth / 2));
    // eslint-disable-next-line no-console
    console.log(`V5 background chord sagitta closed form ${(bgSagitta * 1000).toFixed(3)} um   (the old ruler must READ this, and miss only the crest)`);
    barV5OldRuler(oldMax, bgSagitta);
    barH2FindsRelief(res.max, amp, 0.5);                    // floor AND ceiling
    expect(res.max / Math.max(oldMax, 1e-9)).toBeGreaterThan(10);
  });

  it.runIf(RUN)('V6: on a mesh that DOES resolve the ridge, both directions read small', () => {
    // Same ridge, but columns placed ON the crest and on both flanks, plus a fine background. If the
    // instrument still screamed here it would be biased, not diagnostic.
    const thc = 1.9; const amp = 0.4;
    const half = 0.02 / R0;
    const rA = ridged(thc, half, amp);
    const cols: number[] = [];
    const nT = 600;
    for (let i = 0; i < nT; i += 1) cols.push((TAU * i) / nT);
    for (let k = -6; k <= 6; k += 1) cols.push(thc + (k * half) / 6);
    cols.sort((p, q) => p - q);
    const mesh = structuredMesh(rA, cols, 200);
    const loc = buildRefLocator(mesh, pickLocatorCell(mesh.xyz, mesh.idx, mesh.nF));
    // This control named its configuration `u0: 512, v0: 128, maxDepth: 10`. None of the three is a member of
    // SurfaceToMeshOpts, so all three were SILENTLY DROPPED and V6 in fact ran at library defaults
    // (coveragePitch = 4*tol = 0.2 mm, minPitch = tol/8 = 6.25 um). The one test whose job is to show that
    // V4/V5 read a real defect rather than an instrument bias cannot itself run at an unstated configuration.
    // Same intent, in the options that exist: u0/v0 were a QUERY-LATTICE RESOLUTION and `coveragePitch` is one
    // scalar in mm of arc AND of z, so take the finer axis (theta binds: 2*pi*45.4/512 = 0.557 mm against
    // 120/128 = 0.938 mm) and neither axis is coarser than named; `maxDepth` was REFINEMENT LEVELS, i.e. the
    // refinement floor after 10 halvings of that pitch.
    // CHANGES WHAT V6 MEASURES relative to every run published before this: phase-A coverage becomes 2.8x
    // coarser than the default it had been silently using, and the phase-B floor 11x finer.
    const rNom = R0 + amp;
    const coveragePitch = Math.min((TAU * rNom) / 512, H / 128);
    const minPitch = coveragePitch / 2 ** 10;
    const res = surfaceToMeshMax(rA, loc.dist, { H, tol: 0.05, coveragePitch, minPitch, budget: 8e6 });
    // eslint-disable-next-line no-console
    console.log(`V6 resolved-ridge mesh: H2 ${(res.max * 1000).toFixed(3)} um (must be far below the ${amp * 1000} um relief)   queries ${res.queries}`);

    // ══════════════════════════════════════════════════════════════════════════════════════════════
    // *** THE PAIRED NEGATIVE CONTROL (2026-08-05). THIS IS THE FIX FOR THE WORST VACUITY IN THE FILE. ***
    // V6 asserted ONLY `res.max < amp*0.1`. The one test in this file whose entire job is to show that
    // V4/V5 detect a real defect rather than an instrument bias WAS PASSED BY A DEAD INSTRUMENT: an H2
    // that returns 0 clears `< 40 um` trivially. And V6 runs at a configuration NO OTHER TEST USES —
    // the comment above records that its coveragePitch/minPitch were changed — so V4's and V5's proof
    // that H2 is alive does not transfer.
    //
    // The control is the SAME rA, the SAME `surfaceToMeshMax` options and the SAME tolerance, on a mesh
    // whose columns do NOT land on the crest. It must read the relief. Kept small (200 x 60 rather than
    // 613 x 201) because the locator, not the coverage pitch, is what costs — coverage query COUNT is
    // identical, so the configuration under test is genuinely the same one.
    // ══════════════════════════════════════════════════════════════════════════════════════════════
    const ctlCols: number[] = [];
    for (let i = 0; i < 200; i += 1) ctlCols.push((TAU * i) / 200);
    const ctlMesh = structuredMesh(rA, ctlCols, 60);
    const ctlLoc = buildRefLocator(ctlMesh, pickLocatorCell(ctlMesh.xyz, ctlMesh.idx, ctlMesh.nF));
    const ctl = surfaceToMeshMax(rA, ctlLoc.dist, { H, tol: 0.05, coveragePitch, minPitch, budget: 8e6 });
    // eslint-disable-next-line no-console
    console.log(`V6 NEGATIVE CONTROL, same options, crest NOT resolved: H2 ${(ctl.max * 1000).toFixed(3)} um   queries ${ctl.queries}   ratio ${(ctl.max / Math.max(res.max, 1e-12)).toFixed(1)}x`);
    barV6(res.max, ctl.max, amp);
  });
});

/**
 * Cylinder with a single C0 z-step at zStep: radius jumps by `jump`. The printed solid carries a vertical
 * TREAD WALL there, which the mesher emits and which is correct geometry — but it is not on the bare graph.
 */
function stepped(zStep: number, jump: number): RadiusFn {
  return (_th: number, z: number) => (z < zStep ? R0 : R0 + jump);
}

describe('facet-truth closure at discontinuities', () => {
  it.runIf(RUN)('V7: a TREAD WALL facet is correct geometry and must not read as an error', () => {
    // A tread annulus quad: it lies in the plane z = zStep and spans the full radial jump. Scored against
    // the bare graph it reads ~the jump height; scored against the CLOSURE of the graph — which is what the
    // solid's boundary actually is — it reads ~0.
    //
    // This is the case that the first closure attempt silently failed: it probed a fixed z +/- 1e-6, so the
    // interval only opened if a probe landed within a micron of the step. H2 never exercised it (H2 samples
    // the surface), so it went unnoticed until H1 ran on ArtDeco and returned 2086 um on exactly this shape.
    const zStep = 60; const jump = 2.0;
    const rA = stepped(zStep, jump);
    const th0 = 0.4; const th1 = 0.4 + 0.09;              // ~4 mm of arc, like the real ArtDeco tread
    const rLo = R0; const rHi = R0 + jump;
    const steps = detectZJumps(rA, H);
    const v = certifyTriangle(rA,
      rLo * Math.cos(th0), rLo * Math.sin(th0), zStep,
      rHi * Math.cos(th0), rHi * Math.sin(th0), zStep,
      rHi * Math.cos(th1), rHi * Math.sin(th1), zStep,
      { H, tol: 0.01, nMax: 512, zJumps: steps });
    // *** THE PAIRED NON-VACUITY (2026-08-05). *** `witnessed < jump*0.05` was an UPPER BOUND ONLY, so a
    // certifyTriangle that returns 0 passed V7 — and the whole point of V7 is that the CLOSURE is what
    // makes the reading small. Run the identical facet with the closure REMOVED: it must read ~the full
    // jump. Then the small number is attributable to the mechanism under test and to nothing else. The
    // step count and its LOCATION were printed but never asserted; they are now.
    const bare = certifyTriangle(rA,
      rLo * Math.cos(th0), rLo * Math.sin(th0), zStep,
      rHi * Math.cos(th0), rHi * Math.sin(th0), zStep,
      rHi * Math.cos(th1), rHi * Math.sin(th1), zStep,
      { H, tol: 0.01, nMax: 512 });
    // eslint-disable-next-line no-console
    console.log(`V7 tread wall across a ${jump * 1000} um step: H1 witnessed ${(v.witnessed * 1000).toFixed(3)} um WITH closure, ${(bare.witnessed * 1000).toFixed(3)} um WITHOUT  (steps found: ${steps.length} at z=${steps.map((s) => s.toFixed(4)).join(',')})`);
    barV7(v.witnessed, bare.witnessed, jump, steps.length, steps[0] ?? -1, zStep);
  });

  it.runIf(RUN)('V7b: the closure must NOT forgive a genuinely misplaced facet on a smooth surface', () => {
    // Same machinery, but no discontinuity anywhere near: a facet pushed 0.4 mm off a plain cylinder must
    // still read 0.4 mm. If the two-scale test were sloppy it would widen the interval on ordinary slope
    // and quietly forgive real error — the failure direction that actually matters.
    const off = 0.4;
    const th0 = 0.4; const th1 = 0.4 + 0.02;
    const r = R0 - off;
    const v = certifyTriangle(cylinder,
      r * Math.cos(th0), r * Math.sin(th0), 50,
      r * Math.cos(th1), r * Math.sin(th1), 50,
      r * Math.cos(th0), r * Math.sin(th0), 51,
      { H, tol: 0.01, nMax: 512 });
    // eslint-disable-next-line no-console
    console.log(`V7b facet ${off * 1000} um inside a smooth cylinder: H1 witnessed ${(v.witnessed * 1000).toFixed(3)} um`);
    // NON-VACUITY (2026-08-05): `> off*0.9` was one-sided. The displacement is KNOWN, so an EXPLODING
    // reading is as much a defect as a dead one. (The facet is a chord of the inner circle, so its
    // farthest point sits a little beyond `off` — baseline 402.230 um against 400. Ceiling at 1.1x.)
    barTwoSided(v.witnessed, off, 0.9, 1.1);
  });
});

describe('facet-truth closure must not forgive a NARROW FEATURE', () => {
  it.runIf(RUN)('V7c: a narrow ridge is NOT a discontinuity and must not widen the closure', () => {
    // REGRESSION LOCK. The two-scale jump test compares the radius range over a window w and over w/4. If w
    // is much wider than the feature, BOTH ranges saturate at the full relief, the ratio is 1, and a narrow
    // ridge is mistaken for a jump — so the closure widens and quietly forgives real error. That is the
    // unsound direction: it turns a missing feature into a pass.
    //
    // V7b does not catch it (smooth cylinder, no feature) and V3's threshold had been relaxed for an
    // unrelated reason, so the regression rode in green. Measured: an 8 um half-width, 400 um ridge read
    // 12.040 um before the closure rewrite and 9.000 um after — i.e. under a 10 um bar.
    //
    // A ridge is CONTINUOUS. Its closure interval must stay degenerate however wide the search window is.
    const thc = 0.5; const amp = 0.4;
    for (const halfUm of [8, 30, 120]) {
      const rA = ridged(thc, halfUm / 1000 / R0, amp);
      const d = certifyTriangleAcross(rA, thc, 0.02);
      // eslint-disable-next-line no-console
      console.log(`V7c ridge half-width ${halfUm} um, relief ${amp * 1000} um: H1 ${(d * 1000).toFixed(3)} um`);
      // H1 legitimately reads about the ridge HALF-WIDTH (see V3) — never materially less. If the closure
      // has wrongly opened, the reading collapses well below that.
      // NON-VACUITY (2026-08-05): the floor was one-sided; a reading that EXPLODES past the half-width
      // is also wrong and was accepted. Baseline ratios are 1.505 / 1.326 / 1.189, so 2.5x is generous.
      barTwoSided(d, halfUm / 1000, 0.6, 2.5);
    }
  });
});

// ── THE V10/V11 PROBE SET, SHARED so the regression lock and the ratio bar see the same points.
// The original 40 stepped 8e-4 rad apart across a ridge only 4.444e-4 rad in HALF-width, so exactly one
// of them touched the feature (see barV10's header). The 11 flank probes are placed strictly inside the
// half-width, at |d| <= 0.85*half, so none of them sits on the C0 apex itself.
const V10_HALF = 0.02 / R0;
const V10_AMP = 0.4;
function v10Probes(): Array<{ th: number; z: number; flank: boolean }> {
  const out: Array<{ th: number; z: number; flank: boolean }> = [];
  for (let i = 0; i < 40; i += 1) {
    const th = 1.9 + (i - 20) * 0.0008;
    out.push({ th, z: 40 + i * 0.7, flank: Math.abs(th - 1.9) < V10_HALF });
  }
  for (let j = -5; j <= 5; j += 1) {
    if (j === 0) continue;                                   // skip the apex; it is already probe i=20
    const th = 1.9 + (j / 5) * 0.85 * V10_HALF;
    out.push({ th, z: 30 + (j + 5) * 4.5, flank: true });
  }
  return out;
}

describe('perpendicular ruler', () => {
  it.runIf(RUN)('V8: cylinder — exact |r-R|, and the foot is provably perpendicular', () => {
    // On a cylinder the perpendicular distance is |r_p - R| in closed form, and radial == perpendicular
    // because the surface has no z-slope. This is the case that CANNOT distinguish the two rulers, so it
    // only checks the solver's accuracy and its self-reported orthogonality.
    for (const off of [0.4, 0.05, 0.004]) {
      const rp = R0 - off;
      const th = 1.1; const z = 47;
      const r = distPerp(cylinder, H, rp * Math.cos(th), rp * Math.sin(th), z, { nu: 64, nv: 48 });
      // eslint-disable-next-line no-console
      console.log(`V8 offset ${off * 1000} um -> d ${(r.d * 1000).toFixed(6)} um  ortho ${r.ortho.toExponential(2)}  iters ${r.iters}  converged ${r.converged}`);
      expect(Math.abs(r.d - off)).toBeLessThan(1e-7);
      expect(r.ortho).toBeLessThan(1e-6);
      // NON-VACUITY (2026-08-05): the solver's own self-report was printed and never asserted, which is
      // exactly how V10's `ortho` regression rode in green.
      expect(r.converged).toBe(true);
      expect(r.iters).toBeGreaterThanOrEqual(1);
    }
  });

  it.runIf(RUN)('V9: a SLOPED surface — radial over-states, perpendicular is exact cos(slope)', () => {
    // r(z) = R0 + k*z is an exact cone. For a point on the axis-parallel line through a surface point, the
    // radial gap and the perpendicular distance differ by exactly cos(atan(k)) — a closed form, so this
    // measures whether the ruler is genuinely perpendicular rather than radial.
    for (const k of [0.2, 0.5, 1.0]) {
      const cone: RadiusFn = (_th, z) => R0 + k * z;
      const th = 0.7; const z = 50;
      const gap = 0.3;
      const rp = cone(th, z) - gap;                       // pushed straight inward (radially)
      const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
      const radial = distRadial(cone, H, p[0], p[1], p[2]);
      const perp = distPerp(cone, H, p[0], p[1], p[2], { nu: 128, nv: 96 });
      const expected = gap / Math.sqrt(1 + k * k);        // = gap * cos(slope)
      // eslint-disable-next-line no-console
      console.log(`V9 slope k=${k}: radial ${(radial * 1000).toFixed(3)} um, perpendicular ${(perp.d * 1000).toFixed(3)} um, closed form ${(expected * 1000).toFixed(3)} um, ratio ${(radial / perp.d).toFixed(6)} vs sqrt(1+k^2) ${Math.sqrt(1 + k * k).toFixed(6)}, ortho ${perp.ortho.toExponential(2)}`);
      expect(perp.ortho).toBeLessThan(1e-5);
      // `radial/perp > 1.0` was a WEAK FLOOR — a perpendicular ruler that has collapsed onto the radial
      // one reads 1.0000001 and clears it. The ratio has a CLOSED FORM on a cone; assert THAT.
      barV9(radial, perp.d, gap, k);
    }
  });

  it.runIf(RUN)('V10: perpendicular <= radial always, on a real feature-bearing surface', () => {
    // The inequality is structural (radial = perpendicular / cos(tilt)), so any violation is a solver bug.
    //
    // *** AND THE INEQUALITY ALONE IS NOT A BAR. *** `perpendicular == radial` — a perpendicular ruler
    // that has DEGENERATED into the radial one — satisfies `<=` exactly. On 2026-08-05 that is what
    // happened: PF_FT_DESCENT_K=8 truncated the coordinate descent's halving tail, `distPerp`'s descent
    // seed stopped finding the right basin, and this test went 19.871x -> 1.000x and 2.70e-7 -> 6.83e-2
    // ortho WHILE STILL PASSING 12/12. See the sweep note at the top of this file.
    const rA = ridged(1.9, V10_HALF, V10_AMP);
    let worstRatio = 0; let maxOrtho = 0; let worstFlatDev = 0;
    let nFlank = 0; let nFlankSep = 0;
    const flankRatios: number[] = [];
    for (const pr of v10Probes()) {
      const rp = rA(pr.th, pr.z) - 0.05;
      const p: [number, number, number] = [rp * Math.cos(pr.th), rp * Math.sin(pr.th), pr.z];
      const radial = distRadial(rA, H, p[0], p[1], p[2]);
      const perp = distPerp(rA, H, p[0], p[1], p[2], { nu: 256, nv: 64 });
      expect(perp.d).toBeLessThanOrEqual(radial + 1e-9);
      const ratio = radial / Math.max(perp.d, 1e-12);
      worstRatio = Math.max(worstRatio, ratio);
      maxOrtho = Math.max(maxOrtho, perp.ortho);
      if (pr.flank) {
        nFlank += 1; flankRatios.push(ratio); if (ratio > 1.05) nFlankSep += 1;
      } else {
        worstFlatDev = Math.max(worstFlatDev, Math.abs(ratio - 1));
      }
    }
    flankRatios.sort((a, b) => a - b);
    const flankMedian = flankRatios[Math.floor(flankRatios.length / 2)];
    // eslint-disable-next-line no-console
    console.log(`V10 ${v10Probes().length} probes (${nFlank} ON the ridge flank, ${v10Probes().length - nFlank} off it): worst radial/perpendicular ${worstRatio.toFixed(3)}x; FLANK median ${flankMedian.toFixed(3)}x, separated(>1.05x) ${nFlankSep}/${nFlank}; FLAT worst |ratio-1| ${worstFlatDev.toExponential(2)}; worst ortho ${maxOrtho.toExponential(2)}`);
    barV10(worstRatio, maxOrtho, flankMedian, nFlankSep, nFlank, worstFlatDev);
  });

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // V11 — THE PERMANENT REGRESSION FIXTURE FOR THE PF_FT_DESCENT_K=8 HOLE.
  //
  // V10's clauses are thresholds on a RATIO, and a threshold is only as good as the number behind it.
  // V11 removes the threshold entirely: it compares `distPerp` against an INDEPENDENT brute-force
  // oracle written inline in this file, which calls NO code from `_facetTruthLib` at all — not
  // distLocal, not distPerpFrom, not distGlobal, not the seed grid. The comparison is ABSOLUTE and
  // TWO-SIDED, so no degenerate collapse of any kind can satisfy it: a perpendicular ruler that
  // returns the radial distance disagrees with the oracle by the very factor V10 measures.
  //
  // ORACLE SOUNDNESS, stated rather than assumed:
  //  * The probe sits 50 um inside the surface, so its nearest surface point is within 50 um of its
  //    own (theta, z). The search window is +/- 0.3 rad x +/- 3 mm — 270x larger in theta and 60x in
  //    z — and the test ASSERTS the found foot is strictly interior to the window, so the window
  //    assumption is self-checking rather than believed.
  //  * The lattice is 4096 columns over 0.6 rad = 1.5e-4 rad, which is 3x finer than the ridge
  //    half-width 4.44e-4 rad. A coarser lattice could step over the crest; this one cannot.
  //  * After the lattice, a plain 8-neighbour descent with step halving to 1e-13 polishes to machine
  //    precision. That is the same ALGORITHM `distLocal` uses, deliberately re-written here with no
  //    truncation of any kind, so a truncation defect in the library cannot be inherited.
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  it.runIf(RUN)('V11: distPerp against an INDEPENDENT brute-force oracle (the K=8 regression lock)', () => {
    const rA = ridged(1.9, V10_HALF, V10_AMP);
    /** Nearest-distance oracle. Uses NOTHING from _facetTruthLib. Returns the distance and its foot. */
    const oracle = (px: number, py: number, pz: number, th0: number, z0: number): { d: number; th: number; z: number; onEdge: boolean } => {
      const at = (t: number, zz: number): number => {
        const zc = zz < 0 ? 0 : zz > H ? H : zz;
        const r = rA(t, zc);
        return Math.hypot(px - r * Math.cos(t), py - r * Math.sin(t), pz - zc);
      };
      const TW = 0.3; const ZW = 3;
      const NU = 4096; const NV = 128;
      let best = Infinity; let bt = th0; let bz = z0;
      for (let i = 0; i <= NU; i += 1) {
        const t = th0 - TW + (2 * TW * i) / NU;
        for (let j = 0; j <= NV; j += 1) {
          const z = z0 - ZW + (2 * ZW * j) / NV;
          if (z < 0 || z > H) continue;
          const v = at(t, z);
          if (v < best) { best = v; bt = t; bz = z; }
        }
      }
      const onEdge = Math.abs(bt - th0) > TW * 0.95 || Math.abs(bz - z0) > ZW * 0.95;
      let ht = (2 * TW) / NU; let hz = (2 * ZW) / NV;
      for (let k = 0; k < 400; k += 1) {
        let improved = false;
        for (let a = -1; a <= 1; a += 1) {
          for (let b = -1; b <= 1; b += 1) {
            if (a === 0 && b === 0) continue;
            const t = bt + a * ht; const z = bz + b * hz;
            if (z < -1e-9 || z > H + 1e-9) continue;
            const v = at(t, z);
            if (v < best - 1e-16) { best = v; bt = t; bz = z; improved = true; }
          }
        }
        if (!improved) { ht *= 0.5; hz *= 0.5; if (ht < 1e-13 && hz < 1e-13) break; }
      }
      return { d: best, th: bt, z: bz, onEdge };
    };
    let worstRel = 0; let anyEdge = false; let worstIdx = -1; let worstRelFlank = 0;
    let libSum = 0; let oraSum = 0;
    const probes = v10Probes();
    for (let i = 0; i < probes.length; i += 1) {
      const { th, z, flank } = probes[i];
      const rp = rA(th, z) - 0.05;
      const p: [number, number, number] = [rp * Math.cos(th), rp * Math.sin(th), z];
      const lib = distPerp(rA, H, p[0], p[1], p[2], { nu: 256, nv: 64 });
      const ora = oracle(p[0], p[1], p[2], th, z);
      if (ora.onEdge) anyEdge = true;
      const rel = Math.abs(lib.d - ora.d) / Math.max(ora.d, 1e-12);
      if (rel > worstRel) { worstRel = rel; worstIdx = i; }
      if (flank && rel > worstRelFlank) worstRelFlank = rel;
      libSum += lib.d; oraSum += ora.d;
    }
    // eslint-disable-next-line no-console
    console.log(`V11 ${probes.length} probes: worst |distPerp - oracle| / oracle = ${worstRel.toExponential(3)} (probe ${worstIdx}); worst ON THE FLANK ${worstRelFlank.toExponential(3)}; mean distPerp ${((libSum / probes.length) * 1000).toFixed(4)} um vs oracle ${((oraSum / probes.length) * 1000).toFixed(4)} um; foot on window edge: ${anyEdge}`);
    barV11(worstRel, !anyEdge);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MUTATION PROOFS — A BAR THAT CANNOT BE MADE TO FAIL ON PURPOSE IS NOT A BAR.
//
// Every non-vacuity clause added on 2026-08-05 is proved here by feeding its predicate THE EXACT VALUE
// THE OLD ONE-SIDED BAR ACCEPTED and asserting it now throws. The "pass" side of each pair is the
// measured 2026-08-05 baseline, so this block is also the file's record of those values.
//
// These run whenever the gate runs (they cost microseconds), because a hardened bar that has quietly
// been relaxed again is exactly the failure this file exists to prevent. `PF_FTV_MUT=1` runs them alone.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('MUTATION PROOFS — each hardened bar must reject the degenerate instrument it used to accept', () => {
  const MRUN = RUN || MUT;

  it.runIf(MRUN)('M1: V1 rejects an unbounded certificate (old bar: `bound >= witnessed` only)', () => {
    const exact = 0.00224998; const wit = 0.00224998; const cov = 0.5; const n = 256;
    barV1(exact, wit, wit + cov / n, cov, n);                                   // baseline PASSES
    expect(() => barV1(exact, wit, Number.POSITIVE_INFINITY, cov, n)).toThrow(); // bound = Infinity
    expect(() => barV1(exact, wit, wit * 100, cov, n)).toThrow();               // bound inflated 100x
  });

  it.runIf(MRUN)('M2: V2 rejects a bound that never tightens (old bar: `<= prev + 1e-12`)', () => {
    barV2Monotone([0.0492, 0.0298, 0.0199]);                                    // baseline PASSES
    expect(() => barV2Monotone([0.05, 0.05, 0.05])).toThrow();                  // constant: old bar OK
    expect(() => barV2Monotone([0.05, 0.05, 0.049999999999])).toThrow();        // 1e-12 of "tightening"
  });

  it.runIf(MRUN)('M3: V3 rejects an H1 that reads ZERO (old bar: three UPPER bounds, and 0.5/0 = Infinity)', () => {
    barV3(0.197167, 0.004 * R0, 0.5, 2);                                        // baseline PASSES
    barV3(0.012041, 0.008, 0.4, 20);                                            // baseline PASSES
    expect(() => barV3(0, 0.008, 0.4, 20)).toThrow();                           // *** the dead ruler ***
    expect(() => barV3(1e-9, 0.008, 0.4, 20)).toThrow();
    expect(() => barV3(0.05, 0.008, 0.4, 20)).toThrow();                        // and an exploding one
  });

  it.runIf(MRUN)('M4: V4/V5 reject an H2 that EXPLODES (old bar: `res.max > amp*0.9` only)', () => {
    barH2FindsRelief(0.502615, 0.5, 0.9);                                       // baseline PASSES
    barH2FindsRelief(0.391661, 0.4, 0.5);                                       // baseline PASSES
    expect(() => barH2FindsRelief(1e9, 0.5, 0.9)).toThrow();                    // *** the exploding ruler ***
    expect(() => barH2FindsRelief(0, 0.5, 0.9)).toThrow();
  });

  it.runIf(MRUN)('M5: V5 rejects an OLD ruler that reads zero (old bar: `oldMax < 0.02` only)', () => {
    barV5OldRuler(0.005552, 0.0055518);                                         // baseline PASSES
    expect(() => barV5OldRuler(0, 0.0055518)).toThrow();                        // *** dead => V5 vacuous ***
    expect(() => barV5OldRuler(0.0001, 0.0055518)).toThrow();
  });

  it.runIf(MRUN)('M6: V6 rejects a DEAD H2 — the worst vacuity in the file (old bar: `< amp*0.1` only)', () => {
    barV6(0.000617, 0.4, 0.4);                                                  // baseline PASSES
    expect(() => barV6(0, 0, 0.4)).toThrow();                                   // *** dead instrument ***
    expect(() => barV6(0.000617, 0.001, 0.4)).toThrow();                        // alive but blind at V6's config
  });

  it.runIf(MRUN)('M7: V7 rejects a dead certifyTriangle and a missing step (old bar: `< jump*0.05` only)', () => {
    barV7(0.0, 1.9, 2.0, 1, 60, 60);                                            // baseline PASSES
    expect(() => barV7(0.0, 0.0, 2.0, 1, 60, 60)).toThrow();                    // *** dead: small WITHOUT closure too ***
    expect(() => barV7(0.0, 1.9, 2.0, 0, -1, 60)).toThrow();                    // no step detected at all
    expect(() => barV7(0.0, 1.9, 2.0, 1, 59.0, 60)).toThrow();                  // step found in the wrong place
  });

  it.runIf(MRUN)('M8: V7b/V7c reject an exploding reading (old bars: lower bound only)', () => {
    barTwoSided(0.40223, 0.4, 0.9, 1.1);                                        // baseline PASSES
    barTwoSided(0.012041, 0.008, 0.6, 2.5);                                     // baseline PASSES
    expect(() => barTwoSided(1e9, 0.4, 0.9, 1.1)).toThrow();
    expect(() => barTwoSided(0.5, 0.008, 0.6, 2.5)).toThrow();
  });

  it.runIf(MRUN)('M9: V9 rejects a perpendicular ruler COLLAPSED onto the radial one (old bar: `ratio > 1.0`)', () => {
    for (const k of [0.2, 0.5, 1.0]) barV9(0.3, 0.3 / Math.sqrt(1 + k * k), 0.3, k);  // baseline PASSES
    // *** THE COLLAPSE, at every slope. The old `radial/perp > 1.0` accepted all three. ***
    for (const k of [0.2, 0.5, 1.0]) expect(() => barV9(0.3, 0.3, 0.3, k)).toThrow();
    expect(() => barV9(0.3, 0.3 * (1 - 1e-9), 0.3, 1.0)).toThrow();
  });

  it.runIf(MRUN)('M10: V10 rejects THE ACTUAL PF_FT_DESCENT_K=8 NUMBERS (old bar passed them 12/12)', () => {
    barV10(19.871, 2.70e-7, 19.8, 11, 11, 1e-12);                               // baseline PASSES
    // *** THE MEASURED K=8 VALUES. This is the whole reason the file was swept. ***
    expect(() => barV10(1.000, 6.83e-2, 1.000, 0, 11, 1e-12)).toThrow();
    // and each clause independently, so none of them is load-bearing alone:
    expect(() => barV10(1.0000001, 2.70e-7, 1.0000001, 0, 11, 1e-12)).toThrow(); // ratio collapse, ortho fine
    expect(() => barV10(19.871, 6.83e-2, 19.8, 11, 11, 1e-12)).toThrow();        // ratio fine, ortho blown
    // *** AND THE DEFECT THIS CLAUSE ITSELF FOUND (2026-08-05): one probe on the feature, 39 off it.
    // The pre-fix fixture read exactly this and no bar in the file could see it. ***
    expect(() => barV10(19.871, 2.70e-7, 1.0, 1, 11, 1e-12)).toThrow();          // one lucky probe carrying it
    expect(() => barV10(19.871, 2.70e-7, 19.8, 11, 1, 1e-12)).toThrow();         // a one-probe "population"
    // the OPPOSITE direction: a perpendicular ruler that under-reads on a plain cylinder.
    expect(() => barV10(19.871, 2.70e-7, 19.8, 11, 11, 0.02)).toThrow();
  });

  it.runIf(MRUN)('M11: V11 rejects both a disagreeing oracle and a foot on the window edge', () => {
    barV11(1e-9, true);                                                         // baseline PASSES
    expect(() => barV11(0.5, true)).toThrow();                                  // distPerp 50% off the oracle
    expect(() => barV11(1e-9, false)).toThrow();                                // oracle window not self-checked
  });
});
