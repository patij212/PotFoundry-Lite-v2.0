// _strataAlignedSeed.ts — S10. THE ALIGNED CONSTRAINED SEED. RESEARCH ONLY; nothing in src/ may import this.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IT REPLACES AND WHY
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The driver seeds with a UNIFORM gu x gv grid in (theta,z). Every campaign measurement since 2026-07-30
// says the visible artifact class is born there: a grid edge that CROSSES a feature locus is a fossil, and
// the refinement loop cannot discharge it (S8: 18,102 of 18,102 self-blocked under the AR cap; S9a: only
// 80.0% of gen-0 crossings conform even on a fat grid, and the 2,126 that deadlock are the shallow-angle
// junction crossings). S9a attacks the crossings by SPLITTING them. This attacks them by NOT CREATING THEM:
// the seed is a constrained triangulation whose edges LIE ALONG the traced loci, so
//
//        NO SEED EDGE CROSSES A LOCUS, BY CONSTRUCTION — the birth channel is deleted, not discharged.
//
// THE EXPECTED CEILING, STATED IN ADVANCE (it is not a disappointment when it lands): alignment is
// well-defined along a locus and ILL-DEFINED where two loci cross. This shrinks the problem to the junction
// disks; it does not solve them. It composes with P5 (route the disks to the certified M=g/h^2 kernel or to
// structured patches); it does not replace it. The junction disks this file consumes are the same artifact
// P5 needs, and they are emitted whether the A/B wins or loses.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE CONSTRAINT-RECOVERY PRECEDENT — WHY EVERY CONSTRAINT IS PRE-SPLIT INTO THE POINT SET
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2026-07-24 (research/lab/2026-07-23-strata001-research-plan.md, "S6 production CDT — generic path
// EXHAUSTED"): every CDT arm topped out at true-3D MAX ~0.11 mm because constraint recovery embedded only
// 21-42% of the dense bisector graph. An edge handed to a triangulator and not recovered is an edge that
// SILENTLY IS NOT THERE — and a locus constraint that is not there is exactly the fossil this seed exists
// to prevent, reintroduced with a clean-looking report.
// SO: every constraint here is ONE SEGMENT BETWEEN TWO CONSECUTIVE INSERTED POINTS. The chains are
// resampled into the point set before triangulation, all crossings are split so no two constraints cross,
// and `verifyConstraints` ASSERTS that 100% of them appear as edges of output triangles. It THROWS on a
// shortfall. That is an assertion, not a report line.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SEAM
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// cdt2d triangulates a FLAT chart, so the cylinder is cut at theta=0. Two rules, both measured elsewhere in
// this repo rather than assumed:
//   1. NO CONSTRAINT MAY SPAN THE CUT. `splitAtSeam` ends one chain exactly at 2pi and starts the next
//      exactly at 0. 2026-07-13 measured what happens otherwise: 56 chart-spanning constraint edges
//      produced 2,947 of 2,965 proper crossings and crashed cdt2d in `mergeHulls`.
//   2. THE TWO SEAM COLUMNS CARRY AN IDENTICAL z SET, so the lift welds them exactly. The driver's `addV`
//      canonicalises theta (canonTheta(2pi) === 0) and welds by 3-D position, so a vertex emitted at
//      (2pi, z) and one at (0, z) are THE SAME VERTEX — closure is exact, not tolerance-bound. The guard's
//      own primitives are seam-safe on the resulting wrapped triangles: `signedAreaParam` uses shortest-arc
//      deltas and `aspect3` is 3-D.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// SIZING — LONG ALONG THE LOCUS, SHORT ACROSS IT
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// R2's field (worklog §R2) solves, per point and per direction, the largest chord length whose sagitta
// stays under tol. `hAcross` (perpendicular to the locus) is small and `hAlong` (parallel) is large — that
// ratio IS the anisotropy the AR cap fights and the M=g/h^2 kernel exists to express.
//
// THE FIELD SETS THE SHAPE, NOT THE ABSOLUTE SCALE, and the reason is arithmetic: R2 measures GothicArches'
// worst conforming h at 37.6 um, and the traced loci run 6,738 mm, so adopting the field's absolute scale
// would put ~180,000 points on the loci BEFORE a single split — a seed larger than the control's finished
// mesh. The seed's job is topology and initial anisotropy; reaching h is the refinement loop's job. So the
// spacings are `mul * backgroundPitch * clamp(h/hMedian, 1/fieldRange, fieldRange)`.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// S15 / PHASE C STEP 1b — THE ACROSS-SPACING RULE. `acrossAbs`, DEFAULT OFF.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE DEFECT THE S13 ADDENDUM NAMED, IN THIS FILE AND NOWHERE ELSE. The paragraph above is right about the
// ALONG spacing and wrong about the ACROSS one, and the arithmetic separates them cleanly:
//   * the ~180,000-point explosion is an ALONG-spacing cost — 6,738.2 mm of locus divided by an absolute
//     h of 37.6 um. It is real.
//   * the ACROSS spacing places NO NEW POINTS. The offset ring is two points PER CHAIN POINT (stage 3c);
//     `across` sets only HOW FAR OFF THE LOCUS they sit. Shrinking it moves the ring inward at zero
//     point cost.
// So one global clamp was priced on the along-cost and then applied to the across-question too. Measured
// consequence (worklog, S13 addendum): at the mesh's two worst fidelity sites R2's field asks for 44.7 um
// ACROSS against a MEASURED crease turnover of 106.0 um — correctly sub-feature, 0.42x — and the clamp
// floors it at `acrossBase / fieldRange` = 385.3/2 = **192.6 um, 1.82x the turnover, straddling the V**.
// A global clamp answering a local question.
//
// THE RULE, when `acrossAbs` is on. Per chain point, with `hAc` = R2's own across answer there:
//        across := max(acrossMinMm, min(acrossBase * clamp(hAc/hMedian, ...), hAc))
// It is MONOTONE-DOWNWARD by construction (the `min` with today's value), so it can only ever REFINE, and
// it binds ONLY where hAc < acrossBase/fieldRange. Smooth regions are untouched — bit-for-bit, not
// approximately: for hAc >= 192.6 um the `min` selects today's value and nothing downstream sees a change.
//
// AND IT CARRIES ITS OWN ANISOTROPY GUARD, because the seed IS the mesh. A locus element is
// (along x across) and `aspect3` of a thin triangle is ~ along/across, so shrinking across alone drives the
// seed's own AR up in proportion: at across 50 um with along left at its field value of 2,201.6 um the
// element would sit at AR ~44 against a cap of 50, and a facet BORN over the cap is FROZEN (S1 refuses its
// splits). So WHERE THE ACROSS RULE BINDS, AND ONLY THERE, the along spacing is bounded by
//        along := min(along, seedARmax * across)
// which is the one place this rule may add points. That cost is measured and pre-registered, never assumed.
//
// S16 STEP 1b' ADDS ONE MORE CLAUSE TO THE SAME RULE, `bowFrac`, DEFAULT 0 = OFF. S15 measured the cost of
// its own fix: `alignedSeedCrossings` 963 -> 3,425, because the ring at 50 um is now nearer the locus than
// the locus's own BOW over the along-span (bow exceeds 50 um on 6.0% of 1,200 um chords; it exceeded the
// old 192.6 um ring on only 1.4% of the old 2,202 um chords). The ring hugs the CHAIN; the chord between
// two consecutive ring points is straight and the locus between them is not, so where the bow wins, that
// chord cuts the locus. The repair shortens the ALONG span until the bow fits inside `bowFrac * across`,
// which costs points only where the locus actually curves. The other repair — raising the across floor to
// k x bow — is REFUSED: it re-coarsens the ring exactly at junction approaches, where the geometry is worst.
//
// PRECONDITION, asserted rather than commented: `acrossMinMm * 0.55 > pslgEpsMm`. Stage 3e re-routes a
// constraint through ANY point within `pslgEpsMm` of its interior, and its correctness note leans on free
// Steiner points being kept far away by the `nearSeg` clearance. For the offset ring that clearance is
// `across * 0.55`, so an across floor small enough to break the inequality would let a free point bend a
// traced locus. The build refuses instead.

import cdt2d from 'cdt2d';
import { canonTheta, dThRaw, type SweepRadiusFn } from './_sweepPredicate';
import { aspect3, signedAreaParam } from './_shapeGuard';
import { splitAtSeam, type LocusArtifact } from './_strataLocusTrace';
// TYPE-ONLY, so it emits no runtime code and the seed builder's execution is untouched. One definition of
// a declared patch region exists in this repo and it is the JUDGE's, so a drift between what the emitter
// declares and what the blade gate exempts becomes a COMPILE error rather than a silent exemption.
import type { PatchRegion } from './_judgeShape';

const TWO_PI = Math.PI * 2;

export interface AlignedSeedOpts {
  H: number;
  /** background density — the CONTROL's own gu x gv, so the A/B varies alignment and not density. */
  gu: number;
  gv: number;
  /** along-locus resample spacing, as a multiple of the background cell size. */
  alongMul: number;
  /** offset-chain distance from the locus, as a fraction of the background cell size. */
  acrossFrac: number;
  /** background points closer than this fraction of the cell size to a constraint are dropped. */
  clearFrac: number;
  /** modulate spacings by R2's sizing field (0 disables and takes zero extra rA evals). */
  useField: boolean;
  /** clamp on the field modulation: spacing multiplier stays in [1/fieldRange, fieldRange]. */
  fieldRange: number;
  /**
   * S15 STEP 1b, DEFAULT OFF. Key the ACROSS-locus spacing to R2's ABSOLUTE answer where that answer is
   * sharper than the relative rule, instead of to the global `1/fieldRange` floor. See the header block.
   * Monotone-downward: it can only refine, and it binds only where `hAc < acrossBase / fieldRange`.
   */
  acrossAbs: boolean;
  /** hard floor on the across spacing, mm. Must satisfy `acrossMinMm * 0.55 > pslgEpsMm` (asserted). */
  acrossMinMm: number;
  /** where the across rule binds, bound the along spacing so the seed's local aspect stays under this. */
  seedARmax: number;
  /**
   * S16 STEP 1b', DEFAULT 0 = OFF. Where the across rule binds, shorten the along spacing until the
   * TRACED POLYLINE's bow over that span is at most `bowFrac * across` — so a chord between two
   * consecutive offset-ring points cannot cut the locus it hugs. Active only when `acrossAbs` is on.
   */
  bowFrac: number;
  /**
   * S18 / P5 STEP 3 — the junction disks to ROUTE with a structured patch. EMPTY = OFF (the default), and
   * the stage is then not merely inert but unreachable. Ordinarily filled from a run's `regions.json`
   * (`_strataRegionExtract`), whose per-disk record is a superset of this shape.
   */
  patchRoute?: PatchRegion[];
  /** cap on the routed radius, mm — the 4.000 mm radius-capped clusters get their core routed, not all of it. */
  patchMaxMm: number;
  /** innermost ring radius, mm. */
  patchInnerMm: number;
  /** ring-to-ring radius ratio; `patchM` is derived from it (see the emitter). */
  patchGrade: number;
  /** points per ring. */
  patchM: number;
  /** chord tolerance for the sizing solve, mm. */
  tolMm: number;
  /** LAYER-2 NEGATIVE CONTROL: push every locus this far along its own normal before seeding, um. */
  mistraceUm: number;
  /** the census cap — used to MEASURE the emitted seed, never to refuse (the grid is the mesh). */
  shapeAR: number;
  /** weld radius for coincident chain points, mm. */
  weldMm: number;
  /** chart-area threshold below which a cdt2d output triangle is dropped as a collinear hull sliver. */
  chartAreaEpsMm2?: number;
  /**
   * PSLG conditioning tolerance, mm: a vertex within this of a constraint's INTERIOR splits it.
   *
   * THE BOUND THIS BUYS, stated because it is the whole justification: conditioning can displace a
   * constraint from the traced locus by AT MOST `pslgEpsMm`. It is set BELOW the tracer's own validated
   * accuracy bar (layer-1 control T1: every traced vertex within 25 um of the closed-form locus), so
   * conditioning can never move a constraint off the locus by more than the trace already is.
   * MEASURED need: at 4 um one constraint of 7,427 was unrecoverable because a vertex of a neighbouring
   * locus sat 5.6 um off its interior.
   */
  pslgEpsMm: number;
  /**
   * Chain vertices to OMIT, as `chainIndex:vertexIndex` keys in the post-decimation chain numbering.
   * Filled by `buildAlignedSeedRepaired`; see its note for why the repair must run on the triangles the
   * triangulator ACTUALLY built rather than on predicted ones.
   */
  banned?: Set<string>;
}

export const DEFAULT_SEED_OPTS: Omit<AlignedSeedOpts, 'H' | 'gu' | 'gv'> = {
  alongMul: 1.0,
  acrossFrac: 0.35,
  clearFrac: 0.30,
  useField: true,
  fieldRange: 2.0,
  acrossAbs: false,
  acrossMinMm: 0.050,
  seedARmax: 24,
  bowFrac: 0,
  patchMaxMm: 1.5,
  patchInnerMm: 0.05,
  patchGrade: 1.6,
  patchM: 16,
  tolMm: 0.01,
  mistraceUm: 0,
  shapeAR: 50,
  weldMm: 0.002,
  pslgEpsMm: 0.02,
};

export interface AlignedSeed {
  /** (theta, z) per seed vertex; theta in [0, 2pi] with 2pi ONLY on the seam column. */
  pts: Array<[number, number]>;
  /** triangles, normalised to POSITIVE signed area in (theta,z) — the uniform grid's own convention. */
  tris: Array<[number, number, number]>;
  /** the locus constraint segments, as vertex index pairs. */
  constraints: Array<[number, number]>;
  /**
   * Chain vertices whose removal would clear an over-cap facet, as `chainIndex:vertexIndex` keys.
   * Each is a BOW-CAP apex: a non-fixed constraint vertex whose two incident constraint edges bound an
   * over-cap triangle, and which is redundant to within `pslgEpsMm` of the chord across it.
   */
  suggestedBans: string[];
  /**
   * S18: the patch regions this seed ACTUALLY emitted geometry into, at the radius it actually routed —
   * the provenance the blade gate consumes as `CensusOptions.patches`. Empty unless `patchRoute` was given.
   * Declared at the ROUTED radius, never at the requested one: a region declared larger than the geometry
   * it covers would exempt blades the emitter did not create.
   */
  patches: PatchRegion[];
  stats: {
    lociUsed: number;
    chains: number;
    chainPts: number;
    crossingsSplit: number;
    seamZ: number;
    bgKept: number;
    bgDropped: number;
    offsetPts: number;
    points: number;
    tris: number;
    constraints: number;
    constraintsRecovered: number;
    /** constraints that had to be SPLIT because a vertex lay in their interior (PSLG conditioning). */
    constraintsConditioned: number;
    /** chain vertices removed for sitting closer than the minimum separation. */
    decimated: number;
    /** chain vertices snapped exactly onto the domain boundary or the seam. */
    boundarySnapped: number;
    /** cdt2d output triangles with ~zero chart area (collinear hull slivers) — dropped, they cover nothing. */
    degenerateDropped: number;
    /** chain vertices omitted because a previous repair round banned them. */
    banApplied: number;
    /** constraint segments added for the four domain sides (seam columns + the two rims). */
    boundaryConstraints: number;
    /** degenerate triangles KEPT because dropping them would have opened a non-rim boundary edge. */
    dropRefused: number;
    /** SEED EDGES THAT STILL CROSS A LOCUS — the whole point of the lever, measured. */
    edgesCrossingLocus: number;
    edgesTested: number;
    overCap: number;
    worstAR: number;
    worstParAR: number;
    negArea: number;
    alongMm: number;
    acrossMm: number;
    /** S15: chain points where the ABSOLUTE across rule bound (i.e. R2 asked for less than the clamp). */
    acrossBoundPts: number;
    /** S15: chain points where the anisotropy guard then shortened the along spacing. */
    alongBoundPts: number;
    /** S16: chain points where the BOW rule shortened the along spacing further. */
    bowShortenedPts: number;
    /** S18: routed junctions, structured points emitted, rings laid, and points the guards refused. */
    patchRegions: number;
    patchPts: number;
    patchRings: number;
    patchRefusedPt: number;
    patchRefusedSeg: number;
    /** S15: the across spacing ACTUALLY placed, over all chain points — min / p50, mm. */
    acrossMinPlacedMm: number;
    acrossP50PlacedMm: number;
    fieldEvals: number;
    wallMs: number;
  };
}

// ───────────────────────────── the local sizing solve (R2's arithmetic, 2 directions) ─────────────────────────────

/**
 * Largest chord length L along direction (ca,sa) at (th,z) whose ONE-SIDED sagitta stays <= tol.
 * `sag1` and the LOG bisection are transcribed from _sizingFeasibilityLib (`sag1`, `solveH`) — log, not
 * linear, because linear bisection over [2e-4,4] has 61 um absolute resolution and these answers are ~40 um.
 */
function solveHDir(
  rA: SweepRadiusFn, th: number, z: number, ca: number, sa: number, r: number,
  tol: number, iters: number, hMin: number, hMax: number, bump: () => void,
): number {
  const P = (t: number, zz: number, out: [number, number, number]): void => {
    const c = canonTheta(t); bump();
    const rr = rA(c, zz);
    out[0] = rr * Math.cos(c); out[1] = rr * Math.sin(c); out[2] = zz;
  };
  const p0: [number, number, number] = [0, 0, 0];
  const pA: [number, number, number] = [0, 0, 0];
  const pB: [number, number, number] = [0, 0, 0];
  const sag1 = (L: number): number => {
    const dth = (ca * L) / Math.max(1e-6, r);
    const dz = sa * L;
    P(th, z, p0); P(th + dth / 2, z + dz / 2, pA); P(th + dth, z + dz, pB);
    return 0.5 * Math.hypot(pB[0] - 2 * pA[0] + p0[0], pB[1] - 2 * pA[1] + p0[1], pB[2] - 2 * pA[2] + p0[2]);
  };
  const f = (L: number): number => Math.max(sag1(L), (() => {
    // both one-sided directions, as R2 does (h1 = max of the two)
    const sca = -ca; const ssa = -sa;
    const dth = (sca * L) / Math.max(1e-6, r); const dz = ssa * L;
    P(th, z, p0); P(th + dth / 2, z + dz / 2, pA); P(th + dth, z + dz, pB);
    return 0.5 * Math.hypot(pB[0] - 2 * pA[0] + p0[0], pB[1] - 2 * pA[1] + p0[1], pB[2] - 2 * pA[2] + p0[2]);
  })());
  if (f(hMax) <= tol) return hMax;
  if (f(hMin) > tol) return hMin;
  let lo = Math.log(hMin); let hi = Math.log(hMax);
  for (let i = 0; i < iters; i += 1) {
    const m = 0.5 * (lo + hi);
    if (f(Math.exp(m)) <= tol) lo = m; else hi = m;
  }
  return Math.exp(lo);
}

// ───────────────────────────────────────── geometry helpers ─────────────────────────────────────────

/** proper segment intersection in the flat chart; returns [tA, tB] parameters or null. */
function segParams(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): [number, number] | null {
  const rx = bx - ax; const ry = by - ay;
  const sx = dx - cx; const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-15) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  const E = 1e-9;
  if (t <= E || t >= 1 - E || u <= E || u >= 1 - E) return null;   // proper interior crossings only
  return [t, u];
}

// ───────────────────────────────────────── the builder ─────────────────────────────────────────

export function buildAlignedSeed(rA: SweepRadiusFn, art: LocusArtifact, o: AlignedSeedOpts): AlignedSeed {
  const t0 = Date.now();
  // S15 PRECONDITION — see the header. Stage 3e re-routes a constraint through any point within
  // `pslgEpsMm` of its interior; the offset ring's own clearance to a constraint segment is `across*0.55`.
  // An across floor that breaks this inequality would let a FREE Steiner point bend a TRACED LOCUS, which
  // is the misplaced-constraint failure the whole layer-2 negative control exists to catch. Refuse.
  if (o.acrossAbs && o.acrossMinMm * 0.55 <= o.pslgEpsMm) {
    throw new Error(
      `ALIGNED SEED: acrossMinMm ${(o.acrossMinMm * 1000).toFixed(1)} um is too small for pslgEpsMm `
      + `${(o.pslgEpsMm * 1000).toFixed(1)} um — the offset ring's segment clearance (across*0.55 = `
      + `${(o.acrossMinMm * 550).toFixed(1)} um) must EXCEED the PSLG conditioning radius, or a free Steiner `
      + `point can bend a traced locus constraint. Raise acrossMinMm above `
      + `${((o.pslgEpsMm / 0.55) * 1000).toFixed(1)} um, or lower pslgEpsMm.`,
    );
  }
  const H = o.H;
  const rRef = 45;                                   // isotropic chart: x = rRef * theta, y = z
  let fieldEvals = 0;
  const bump = (): void => { fieldEvals += 1; };
  const rAt = (th: number, z: number): number => { fieldEvals += 1; return Math.max(1e-6, rA(canonTheta(th), z)); };

  // background cell size, in mm, at the mean radius — the CONTROL's own density
  const pitchTh = (TWO_PI * rRef) / o.gu;
  const pitchZ = H / o.gv;
  const pitchMean = Math.sqrt(pitchTh * pitchZ);
  const alongBase = o.alongMul * pitchMean;
  const acrossBase = o.acrossFrac * pitchMean;
  const clearMm = o.clearFrac * pitchMean;

  // ── 1. CHAINS: mistrace (layer-2 control), seam-split, resample by the field ─────────────────────
  const mist = o.mistraceUm / 1000;
  const chainsRaw: Array<Array<[number, number]>> = [];
  let lociUsed = 0;
  for (const L of art.loci) {
    let pts = L.pts;
    if (mist !== 0) {
      // push every vertex along the local normal — the DELIBERATE MISTRACE the layer-2 control needs
      pts = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
        const r = rAt(p[0], p[1]);
        const tx = r * dThRaw(canonTheta(a[0]), canonTheta(b[0])); const ty = b[1] - a[1];
        const n = Math.hypot(tx, ty);
        if (n < 1e-12) return p;
        return [p[0] + (mist * (-ty / n)) / r, p[1] + mist * (tx / n)] as [number, number];
      });
    }
    lociUsed += 1;
    for (const piece of splitAtSeam(pts)) chainsRaw.push(piece);
  }

  // field-modulated resample. `hMedian` is computed from a strided sample of the chain vertices so the
  // modulation is RELATIVE to this surface rather than to an absolute the seed cannot afford.
  let hMedian = 1;
  if (o.useField) {
    const samp: number[] = [];
    for (let c = 0; c < chainsRaw.length; c += Math.max(1, Math.floor(chainsRaw.length / 40))) {
      const P = chainsRaw[c];
      for (let i = 0; i < P.length; i += Math.max(1, Math.floor(P.length / 6))) {
        const r = rAt(P[i][0], P[i][1]);
        samp.push(solveHDir(rA, P[i][0], P[i][1], 1, 0, r, o.tolMm, 14, 2e-4, 4, bump));
      }
    }
    samp.sort((a, b) => a - b);
    if (samp.length > 0) hMedian = Math.max(1e-6, samp[Math.floor(samp.length / 2)]);
  }

  interface ChainPt { th: number; z: number; nx: number; ny: number; along: number; across: number; fixed?: boolean }
  const chains: ChainPt[][] = [];
  let chainPts = 0;
  let acrossBoundPts = 0; let alongBoundPts = 0; let bowShortenedPts = 0;
  const acrossPlaced: number[] = [];
  for (const P of chainsRaw) {
    // arc-length parameterise in the chart
    const X = P.map((p) => rRef * p[0]);
    const Y = P.map((p) => p[1]);
    const cum: number[] = [0];
    for (let i = 1; i < P.length; i += 1) cum.push(cum[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]));
    const total = cum[cum.length - 1];
    if (total < alongBase * 0.5) continue;
    const out: ChainPt[] = [];
    const emit = (s: number): void => {
      // locate s
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i += 1;
      const f = cum[i] === cum[i - 1] ? 0 : (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
      const th = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f;
      const z = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f;
      const tx = X[i] - X[i - 1]; const ty = Y[i] - Y[i - 1];
      const n = Math.hypot(tx, ty) || 1;
      out.push({ th, z, nx: -ty / n, ny: tx / n, along: alongBase, across: acrossBase });
    };
    // ── S16: the chart point at arc-length `sv`, and the BOW of the polyline over a chord. ──────────
    // Read off the TRACED POLYLINE itself, so no curvature model enters. Used only by the bow rule.
    const at = (sv: number): [number, number] => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < sv) i += 1;
      const f = cum[i] === cum[i - 1] ? 0 : (sv - cum[i - 1]) / (cum[i] - cum[i - 1]);
      return [X[i - 1] + (X[i] - X[i - 1]) * f, Y[i - 1] + (Y[i] - Y[i - 1]) * f];
    };
    const bowOver = (s0: number, s1: number): number => {
      const A = at(s0); const B = at(s1);
      const ux = B[0] - A[0]; const uy = B[1] - A[1];
      const l2 = ux * ux + uy * uy;
      if (l2 < 1e-18) return 0;
      let worst = 0;
      for (let i = 0; i < cum.length; i += 1) {
        if (cum[i] <= s0) continue;
        if (cum[i] >= s1) break;
        let t = ((X[i] - A[0]) * ux + (Y[i] - A[1]) * uy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(X[i] - (A[0] + t * ux), Y[i] - (A[1] + t * uy));
        if (d > worst) worst = d;
      }
      return worst;
    };
    let s = 0;
    emit(0);
    for (let guard = 0; guard < 200000 && s < total; guard += 1) {
      const last = out[out.length - 1];
      let a = alongBase; let cr = acrossBase;
      if (o.useField) {
        const r = rAt(last.th, last.z);
        // ALONG the locus is the tangent direction; ACROSS is the normal. Both in the chart's mm frame.
        const tAx = -last.nx; const tAy = -last.ny;              // any consistent tangent
        const hAl = solveHDir(rA, last.th, last.z, -tAy, tAx, r, o.tolMm, 14, 2e-4, 4, bump);
        const hAc = solveHDir(rA, last.th, last.z, last.nx, last.ny, r, o.tolMm, 14, 2e-4, 4, bump);
        const cl = (x: number): number => Math.max(1 / o.fieldRange, Math.min(o.fieldRange, x));
        a = alongBase * cl(hAl / hMedian);
        cr = acrossBase * cl(hAc / hMedian);
        // ── S15 STEP 1b: the LOCALLY-KEYED across rule (see the header). Monotone-downward, so the OFF
        //    path and every point where R2 does NOT ask for less are arithmetically untouched. ────────
        if (o.acrossAbs) {
          const crAbs = Math.max(o.acrossMinMm, hAc);
          if (crAbs < cr) {
            cr = crAbs;
            acrossBoundPts += 1;
            // ANISOTROPY GUARD — the seed IS the mesh, and aspect3 of a thin (along x across) element is
            // ~along/across. Bounding along HERE, and only here, is what keeps the sharpened elements
            // sub-cap; it is also the only place this rule can add points, which is why it is counted.
            const aBound = o.seedARmax * cr;
            if (aBound < a) { a = aBound; alongBoundPts += 1; }
            // ── S16 STEP 1b': THE BOW RULE. The offset ring hugs the CHAIN, but the chord between two
            //    consecutive ring points is straight while the locus between them is not. Where the BOW
            //    exceeds the ring radius that chord CUTS the locus it was placed to hug — measured in S15
            //    as `alignedSeedCrossings` 963 -> 3,425 with the ring at 50 um, against a bow that exceeds
            //    50 um on 6.0% of 1,200 um chords. Shorten the span until the bow fits INSIDE the ring.
            //    The other repair — raising the across floor to k x bow — is REFUSED on purpose: it pushes
            //    the ring back out exactly where the locus curves hardest, i.e. at junction approaches,
            //    undoing the gain precisely where it matters. See the S16 registration in the worklog.
            if (o.bowFrac > 0) {
              const aMin = Math.max(o.weldMm * 4, acrossBase * 0.5) * 1.05;   // just above the decimator
              let shortened = false;
              for (let k = 0; k < 12 && a > aMin; k += 1) {
                if (bowOver(s, Math.min(total, s + a)) <= o.bowFrac * cr) break;
                a = Math.max(aMin, a * 0.75);
                shortened = true;
              }
              if (shortened) bowShortenedPts += 1;
            }
          }
        }
        last.across = cr;
        acrossPlaced.push(cr);
      }
      last.along = a;
      s = Math.min(total, s + a);
      if (total - s < a * 0.35 && s < total) s = total;
      emit(s);
      if (s >= total) break;
    }
    if (out.length >= 2) { chains.push(out); chainPts += out.length; }
  }

  // ── 1b. SNAP + DECIMATE, **BEFORE** planarization. ORDER IS LOAD-BEARING. ───────────────────────
  // These two passes MOVE and REMOVE chain vertices, so running them after the crossing split destroys
  // the planarity that split just established: dropping a vertex makes the chain go straight from its
  // neighbours, and that new segment can cross a chain it did not cross before. MEASURED: with decimation
  // last, one constraint of 1,515 was unrecoverable at the pilot config with NO vertex anywhere near it —
  // it was crossed by another constraint that decimation had re-introduced.
  //   SNAP: a chain vertex 1 um above z=0 makes a 1 um-tall sliver against the boundary row; on the
  //   boundary it simply IS a boundary vertex.
  //   DECIMATE: a crossing split lands wherever two loci meet, with no relation to the along-spacing, and
  //   three near-coincident collinear points make a facet no downstream pass can repair — the seed IS the
  //   mesh. Endpoints are never removed.
  const minSepMm = Math.max(o.weldMm * 4, acrossBase * 0.5);
  const snapMm = Math.min(minSepMm, acrossBase * 0.5);
  let decimated = 0; let boundarySnapped = 0; let banApplied = 0;
  for (let c = 0; c < chains.length; c += 1) {
    const P = chains[c];
    for (const p of P) {
      if (p.z > 0 && p.z < snapMm) { p.z = 0; boundarySnapped += 1; } else if (p.z < H && p.z > H - snapMm) { p.z = H; boundarySnapped += 1; }
      const xs = rRef * p.th;
      if (xs > 0 && xs < snapMm) { p.th = 0; boundarySnapped += 1; } else if (xs < rRef * TWO_PI && xs > rRef * TWO_PI - snapMm) { p.th = TWO_PI; boundarySnapped += 1; }
    }
    const keep: ChainPt[] = [P[0]];
    for (let i = 1; i < P.length; i += 1) {
      const q = keep[keep.length - 1];
      if (i !== P.length - 1 && Math.hypot(rRef * (P[i].th - q.th), P[i].z - q.z) < minSepMm) { decimated += 1; continue; }
      keep.push(P[i]);
    }
    chains[c] = keep;
  }

  // ── 2. PLANARIZE: split every proper crossing between chain segments ─────────────────────────────
  interface Seg { c: number; i: number }
  const segs: Seg[] = [];
  for (let c = 0; c < chains.length; c += 1) for (let i = 0; i + 1 < chains[c].length; i += 1) segs.push({ c, i });
  const CX = (p: ChainPt): number => rRef * p.th;
  // bucket by chart cell for an O(n) sweep instead of O(n^2)
  const BS = Math.max(alongBase * 2, 1);
  const bkey = (x: number, y: number): string => `${Math.floor(x / BS)},${Math.floor(y / BS)}`;
  const buckets = new Map<string, number[]>();
  for (let s = 0; s < segs.length; s += 1) {
    const A = chains[segs[s].c][segs[s].i]; const B = chains[segs[s].c][segs[s].i + 1];
    const x0 = Math.min(CX(A), CX(B)); const x1 = Math.max(CX(A), CX(B));
    const y0 = Math.min(A.z, B.z); const y1 = Math.max(A.z, B.z);
    for (let bx = Math.floor(x0 / BS); bx <= Math.floor(x1 / BS); bx += 1) {
      for (let by = Math.floor(y0 / BS); by <= Math.floor(y1 / BS); by += 1) {
        const k = `${bx},${by}`;
        const l = buckets.get(k);
        if (l === undefined) buckets.set(k, [s]); else l.push(s);
      }
    }
  }
  const splitsAt = new Map<number, number[]>();      // seg index -> list of t parameters
  let crossingsSplit = 0;
  const seen = new Set<string>();
  for (const [, list] of buckets) {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        const sa = list[a]; const sb = list[b];
        const pk = sa < sb ? `${sa}:${sb}` : `${sb}:${sa}`;
        if (seen.has(pk)) continue;
        seen.add(pk);
        if (segs[sa].c === segs[sb].c && Math.abs(segs[sa].i - segs[sb].i) <= 1) continue;
        const A0 = chains[segs[sa].c][segs[sa].i]; const A1 = chains[segs[sa].c][segs[sa].i + 1];
        const B0 = chains[segs[sb].c][segs[sb].i]; const B1 = chains[segs[sb].c][segs[sb].i + 1];
        const r = segParams(CX(A0), A0.z, CX(A1), A1.z, CX(B0), B0.z, CX(B1), B1.z);
        if (r === null) continue;
        const la = splitsAt.get(sa); if (la === undefined) splitsAt.set(sa, [r[0]]); else la.push(r[0]);
        const lb = splitsAt.get(sb); if (lb === undefined) splitsAt.set(sb, [r[1]]); else lb.push(r[1]);
        crossingsSplit += 1;
      }
    }
  }
  // rebuild chains with the split points inserted. Snap and decimation already ran (stage 1b), so this
  // pass only inserts the crossing vertices — which are FIXED: removing one un-shares the vertex two
  // chains meet at, their segments then properly cross, and cdt2d's PSLG precondition is violated (the
  // 2026-07-13 `upperIds` crash class).
  const chains2: ChainPt[][] = [];
  {
    let sIdx = 0;
    for (let c = 0; c < chains.length; c += 1) {
      const out: ChainPt[] = [{ ...chains[c][0], fixed: true }];
      for (let i = 0; i + 1 < chains[c].length; i += 1, sIdx += 1) {
        const ts = (splitsAt.get(sIdx) ?? []).slice().sort((x, y) => x - y);
        const A = chains[c][i]; const B = chains[c][i + 1];
        for (const t of ts) {
          out.push({
            th: A.th + (B.th - A.th) * t, z: A.z + (B.z - A.z) * t,
            nx: A.nx, ny: A.ny, along: A.along, across: A.across, fixed: true,
          });
        }
        out.push({ ...B, fixed: i + 2 >= chains[c].length });
      }
      if (out.length >= 2) chains2.push(out);
    }
  }

  // ── 3. POINT SET ────────────────────────────────────────────────────────────────────────────────
  const px: number[] = []; const py: number[] = [];      // chart coords
  const pth: number[] = []; const pz: number[] = [];     // (theta,z)
  // ONE spatial hash, cell sized by the LARGEST query radius rather than the smallest. Sizing it by
  // `weldMm` (2 um) made a `clearMm` (330 um) proximity query scan (2*165+1)^2 = 109,561 cells — the
  // background pass alone was ~3e9 cell lookups and did not finish in 10 minutes. Points here are ~1 mm
  // apart, so a cell of ~clearMm holds O(1) of them and every query is a 3x3 scan.
  const CELL = Math.max(o.weldMm, clearMm, acrossBase * 0.6);
  const hash = new Map<string, number[]>();
  const addPt = (th: number, z: number, weld = o.weldMm): number => {
    const x = rRef * th; const y = z;
    const cx = Math.floor(x / CELL); const cy = Math.floor(y / CELL);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      const l = hash.get(`${cx + dx},${cy + dy}`);
      if (l === undefined) continue;
      for (const j of l) if (Math.hypot(px[j] - x, py[j] - y) <= weld) return j;
    }
    const idx = px.length;
    px.push(x); py.push(y); pth.push(th); pz.push(z);
    const k = `${cx},${cy}`;
    const l = hash.get(k); if (l === undefined) hash.set(k, [idx]); else l.push(idx);
    return idx;
  };
  const nearPt = (th: number, z: number, rad: number): boolean => {
    const x = rRef * th; const y = z;
    const n = Math.ceil(rad / CELL);
    const cx = Math.floor(x / CELL); const cy = Math.floor(y / CELL);
    for (let dx = -n; dx <= n; dx += 1) for (let dy = -n; dy <= n; dy += 1) {
      const l = hash.get(`${cx + dx},${cy + dy}`);
      if (l === undefined) continue;
      for (const j of l) if (Math.hypot(px[j] - x, py[j] - y) <= rad) return true;
    }
    return false;
  };

  // 3b-bis. SEGMENT clearance. Point-to-POINT clearance is not enough and the failure is measured: with an
  // along-spacing of 1,101 um and a clearance of 330 um, a background lattice point can sit 470 um from
  // every chain VERTEX and 21 um from the chain SEGMENT between two of them — and a 21 um-thick triangle
  // over a 2,207 um base is an AR-107 facet frozen into the STL. 58 of the 64 residual over-cap facets
  // were exactly this. Clearance must be measured to the CONSTRAINT, which is a segment.
  const segBuckets = new Map<string, number[]>();
  const segAx: number[] = []; const segAy: number[] = []; const segBx: number[] = []; const segBy: number[] = [];
  for (const C of chains2) {
    for (let i = 0; i + 1 < C.length; i += 1) {
      const ax = rRef * C[i].th; const ay = C[i].z; const bx = rRef * C[i + 1].th; const by = C[i + 1].z;
      const si = segAx.length;
      segAx.push(ax); segAy.push(ay); segBx.push(bx); segBy.push(by);
      for (let gx = Math.floor(Math.min(ax, bx) / BS); gx <= Math.floor(Math.max(ax, bx) / BS); gx += 1) {
        for (let gy = Math.floor(Math.min(ay, by) / BS); gy <= Math.floor(Math.max(ay, by) / BS); gy += 1) {
          const k = `${gx},${gy}`; const l = segBuckets.get(k); if (l === undefined) segBuckets.set(k, [si]); else l.push(si);
        }
      }
    }
  }
  const nearSeg = (th: number, z: number, rad: number): boolean => {
    const x = rRef * th; const y = z;
    const n = Math.ceil(rad / BS);
    const gx0 = Math.floor(x / BS); const gy0 = Math.floor(y / BS);
    for (let dx = -n; dx <= n; dx += 1) for (let dy = -n; dy <= n; dy += 1) {
      for (const si of segBuckets.get(`${gx0 + dx},${gy0 + dy}`) ?? []) {
        const ux = segBx[si] - segAx[si]; const uy = segBy[si] - segAy[si];
        const l2 = ux * ux + uy * uy;
        let t = l2 < 1e-18 ? 0 : ((x - segAx[si]) * ux + (y - segAy[si]) * uy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (Math.hypot(x - (segAx[si] + t * ux), y - (segAy[si] + t * uy)) <= rad) return true;
      }
    }
    return false;
  };

  // 3a. constraint chains first (they own their positions)
  const constraints: Array<[number, number]> = [];
  const chainIdx: number[][] = [];
  const seamZ = new Set<number>();
  const ownerChain: number[] = []; const ownerIdx: number[] = []; const ownerFixed: boolean[] = [];
  let ci = -1;
  for (const C of chains2) {
    ci += 1;
    const ids: number[] = [];
    let pi = -1;
    for (const p of C) {
      pi += 1;
      if (o.banned !== undefined && o.banned.has(`${ci}:${pi}`) && p.fixed !== true) { banApplied += 1; continue; }
      const th = Math.min(TWO_PI, Math.max(0, p.th));
      // FIXED (crossing) points weld to each other at the minimum separation: two crossings that close
      // together are one junction, and merging them is only ever reachable inside a junction disk.
      // NON-fixed points weld at the same radius too — cross-chain, which the per-chain decimation above
      // cannot see. Measured: two loci passing 9 um apart produced an AR-175 facet the seed could not undo.
      // The displacement bound is minSep, which only ever binds where two loci are that close, i.e. at a
      // junction approach.
      const id = addPt(th, p.z, minSepMm);
      while (ownerChain.length <= id) { ownerChain.push(-1); ownerIdx.push(-1); ownerFixed.push(false); }
      if (ownerChain[id] < 0) { ownerChain[id] = ci; ownerIdx[id] = pi; ownerFixed[id] = p.fixed === true; }
      ids.push(id);
      if (th <= 1e-12 || th >= TWO_PI - 1e-12) seamZ.add(p.z);
    }
    chainIdx.push(ids);
    for (let i = 0; i + 1 < ids.length; i += 1) if (ids[i] !== ids[i + 1]) constraints.push([ids[i], ids[i + 1]]);
  }

  // 3b. domain boundary. The two seam columns MUST carry an identical z set.
  //
  // AND THEY MUST BE **CONSTRAINED**, not merely populated. MEASURED (S10A/S10B, every aligned arm):
  // `seam-crack edges 3`, boundary loops 3, Euler V-E+F = -1 — one triangular hole, and the seed carries
  // it BEFORE a single refinement split (seed Euler -1 with 513 boundary edges against 510 in the two rim
  // loops). The offending edge runs from (theta=0, z=119.1429) to (theta=2pi, z=119.5882): a CHART-
  // SPANNING edge, 282.74 mm across a 282.74 mm chart. cdt2d triangulates a FLAT rectangle and has no way
  // to know its left and right edges are the same meridian, so nothing stopped it from connecting them;
  // the resulting triangle is near-collinear in the chart, gets dropped as degenerate, and its edges lose
  // their second facet. Constraining the four domain sides removes the freedom that creates it — the same
  // remedy the 2026-07-13 cdt2d note reaches for, and the same idiom ConstrainedTriangulator uses.
  // The seam column carries the chain endpoints that reached it PLUS the background lattice rows. A
  // lattice row landing within the minimum separation of a chain endpoint makes a collinear near-zero-area
  // triple ON the seam — measured, an AR-177 facet whose three vertices all sat at theta=2pi. The chain
  // endpoint is a CONSTRAINT vertex and may not move; the lattice row is a free point, so the lattice row
  // is the one that yields.
  const chainSeamZ = [...seamZ];
  for (let j = 0; j <= o.gv; j += 1) {
    const z = (H * j) / o.gv;
    if (chainSeamZ.some((cz) => Math.abs(cz - z) < minSepMm)) continue;
    seamZ.add(z);
  }
  const seamZs = [...seamZ].filter((z) => z >= 0 && z <= H).sort((a, b) => a - b);
  const col0: number[] = []; const col1: number[] = [];
  for (const z of seamZs) { col0.push(addPt(0, z)); col1.push(addPt(TWO_PI, z)); }
  const rim0: number[] = []; const rimH: number[] = [];
  for (let i = 0; i <= o.gu; i += 1) {
    const th = (TWO_PI * i) / o.gu;
    if (!nearPt(th, 0, clearMm * 0.5) && !nearSeg(th, 0, clearMm * 0.5)) addPt(th, 0);
    if (!nearPt(th, H, clearMm * 0.5) && !nearSeg(th, H, clearMm * 0.5)) addPt(th, H);
  }
  // Every point that ended up ON a domain side becomes part of that side's constraint chain, in order.
  // Built AFTER all boundary points exist so nothing is left out of the chain.
  const sideEps = 1e-9;
  const collectSide = (pick: (i: number) => boolean, sortKey: (i: number) => number): number[] => {
    const ids: number[] = [];
    for (let i = 0; i < pth.length; i += 1) if (pick(i)) ids.push(i);
    ids.sort((a, b) => sortKey(a) - sortKey(b));
    return ids;
  };
  void col0; void col1; void rim0; void rimH;
  const boundaryChains: number[][] = [
    collectSide((i) => pth[i] <= sideEps, (i) => pz[i]),
    collectSide((i) => pth[i] >= TWO_PI - sideEps, (i) => pz[i]),
    collectSide((i) => pz[i] <= sideEps, (i) => pth[i]),
    collectSide((i) => pz[i] >= H - sideEps, (i) => pth[i]),
  ];

  const freeFrom = px.length;   // every point added from here on is a FREE Steiner point
  const freeKey = (th: number, z: number): string => `f:${Math.round(rRef * th * 1e6)}:${Math.round(z * 1e6)}`;
  const addFree = (th: number, z: number): void => {
    if (o.banned !== undefined && o.banned.has(freeKey(th, z))) { banApplied += 1; return; }
    addPt(th, z);
  };
  // 3c. offset ("short across") points hugging each locus — POINTS, not constraints: they pull the
  //     triangulation into thin elements along the locus without adding an edge that could cross anything.
  //     SKIPPED INSIDE A JUNCTION DISK, which is precisely where the normal has no meaning.
  let offsetPts = 0;
  const jn = art.junctions;
  const inDisk = (th: number, z: number): boolean => {
    for (const j of jn) {
      const dth = dThRaw(canonTheta(th), j.theta);
      if (Math.hypot(rRef * dth, z - j.z) <= j.radiusMm) return true;
    }
    return false;
  };
  for (const C of chains2) {
    for (const p of C) {
      if (inDisk(p.th, p.z)) continue;
      for (const sgn of [1, -1]) {
        const th = p.th + (sgn * p.across * p.nx) / rRef;
        const z = p.z + sgn * p.across * p.ny;
        if (th < 0 || th > TWO_PI || z < 0 || z > H) continue;
        if (nearPt(th, z, p.across * 0.35)) continue;
        // The segment clearance is FLOORED at 1.5x the PSLG conditioning radius when the across rule is
        // live. A no-op on the OFF path by arithmetic, not by measurement: there across >= acrossBase /
        // fieldRange = 192.6 um, so across*0.55 >= 105.9 um >> 1.5*pslgEps = 30 um and the max never binds.
        if (nearSeg(th, z, o.acrossAbs ? Math.max(p.across * 0.55, o.pslgEpsMm * 1.5) : p.across * 0.55)) continue;
        addFree(th, z); offsetPts += 1;
      }
    }
  }

  // ── 3c-bis. S18 / P5 STEP 3 — THE X-CROSSING PATCH EMITTER. Default OFF (empty `patchRoute`). ──────
  //
  // WHAT IT EMITS: a deterministic GRADED POLAR point set per routed junction — the centre plus concentric
  // rings from `patchInnerMm` out to the routed radius, geometric with a ratio of at most `patchGrade`.
  //
  // WHY POINTS AND NOT CONSTRAINTS, which is the whole design decision:
  //   * WATERTIGHT BY CONSTRUCTION. Everything here goes through the SAME `addPt` weld and the SAME single
  //     cdt2d call as the rest of the seed, so there is no stitch to get wrong — the S11 argument, unchanged.
  //     There is no separate patch mesh to sew in, and therefore no seam to leak.
  //   * THE 2026-07-13 cdt2d SPANNER LESSON IS SATISFIED TRIVIALLY: this stage adds ZERO constraint edges,
  //     so no constraint can span the chart and the theta=0/2pi weld is untouched.
  //   * CONSTRAINT RECOVERY IS ALREADY THE FRAGILE PART. It is an assertion that THROWS, and S15/S16
  //     Stage 0 measured it failing at 7,268 and 7,614 segments. Adding ~2,400 ring constraints would put
  //     the whole build on that edge for no gain the Delaunay does not already give on a graded polar set.
  //   * ALIGNMENT TO THE BRANCHES COMES FREE. The locus chains already pass THROUGH the disk as
  //     constraints, so the triangulation is forced to respect every branch without this stage naming any
  //     of them. Nothing here depends on `branchDirs` being right.
  //
  // WHY M = 16 POINTS PER RING, derived rather than chosen: for near-isotropic elements the arc spacing
  // must match the radial spacing. Radial spacing at ring i is r_i - r_{i-1} = r_i (1 - 1/grade), arc
  // spacing is 2*pi*r_i/M, so M = 2*pi/(1 - 1/grade) = 16.75 at grade 1.6. Both scale with r_i, so ONE M
  // serves every ring.
  //
  // GUARDS: the same two the offset ring uses, at the ring's own local scale, with the segment clearance
  // FLOORED at 1.5x `pslgEpsMm` — a patch point closer than that to a locus constraint would be re-routed
  // INTO it by stage 3e, which is the free-point-bends-a-traced-locus failure the across rule's precondition
  // exists to prevent. Near the centre the rings are ~20 um apart, so this floor genuinely binds here.
  let patchPts = 0; let patchRings = 0; let patchRefusedPt = 0; let patchRefusedSeg = 0;
  const patchEmitted: PatchRegion[] = [];
  for (const reg of o.patchRoute ?? []) {
    const R = Math.min(reg.radiusMm, o.patchMaxMm);
    const rIn = Math.min(o.patchInnerMm, R * 0.5);
    if (!(R > 0) || !(rIn > 0)) continue;
    const K = Math.max(1, Math.ceil(Math.log(R / rIn) / Math.log(o.patchGrade)));
    const M = Math.max(6, Math.round(o.patchM));
    let emittedHere = 0;
    // the junction centre itself — the one point that is ON the crossing
    {
      const gp = rIn * 0.35; const gs = Math.max(rIn * 0.55, o.pslgEpsMm * 1.5);
      if (reg.z >= 0 && reg.z <= H && !nearPt(reg.theta, reg.z, gp) && !nearSeg(reg.theta, reg.z, gs)) {
        addFree(canonTheta(reg.theta), reg.z); patchPts += 1; emittedHere += 1;
      }
    }
    for (let i = 0; i <= K; i += 1) {
      const r = rIn * ((R / rIn) ** (i / K));
      const prev = i === 0 ? rIn / o.patchGrade : rIn * ((R / rIn) ** ((i - 1) / K));
      const ds = Math.max(1e-6, r - prev);                       // this ring's own radial spacing
      const gp = ds * 0.35; const gs = Math.max(ds * 0.55, o.pslgEpsMm * 1.5);
      const phase = (i % 2) * (Math.PI / M);                     // stagger alternate rings
      patchRings += 1;
      for (let k = 0; k < M; k += 1) {
        const a = phase + (2 * Math.PI * k) / M;
        const th = canonTheta(reg.theta + (r * Math.cos(a)) / rRef);
        const z = reg.z + r * Math.sin(a);
        if (z < 0 || z > H) continue;
        if (nearPt(th, z, gp)) { patchRefusedPt += 1; continue; }
        if (nearSeg(th, z, gs)) { patchRefusedSeg += 1; continue; }
        addFree(th, z); patchPts += 1; emittedHere += 1;
      }
    }
    // PROVENANCE: declared at the ROUTED radius, which is what the emitter actually touched. A region
    // declared larger than the geometry it covers would exempt blades it did not create — the judge's
    // PROVENANCE-2 negative control (a mis-registered region exempts nothing) is the other direction of
    // the same discipline.
    if (emittedHere > 0) patchEmitted.push({ id: reg.id, theta: canonTheta(reg.theta), z: reg.z, radiusMm: R });
  }

  // 3d. background lattice — the control's own density, minus anything the constraints already own
  let bgKept = 0; let bgDropped = 0;
  for (let j = 1; j < o.gv; j += 1) {
    const z = (H * j) / o.gv;
    for (let i = 0; i < o.gu; i += 1) {
      const th = (TWO_PI * i) / o.gu;
      if (nearPt(th, z, clearMm) || nearSeg(th, z, clearMm)) { bgDropped += 1; continue; }
      addFree(th, z); bgKept += 1;
    }
  }

  // 3f. the four domain sides as CONSTRAINT CHAINS (see 3b). Each is one segment between consecutive
  // points on that side, so nothing has to be "recovered" — the same pre-split discipline the loci use.
  let boundaryConstraints = 0;
  for (const chain of boundaryChains) {
    for (let i = 0; i + 1 < chain.length; i += 1) {
      if (chain[i] === chain[i + 1]) continue;
      constraints.push([chain[i], chain[i + 1]]);
      boundaryConstraints += 1;
    }
  }

  // ── 3e. PSLG CONDITIONING: no point may lie in the INTERIOR of a constraint ─────────────────────
  // A constrained Delaunay triangulation cannot make segment (a,b) an edge if a third vertex sits on it —
  // the segment must pass THROUGH that vertex, so it can only exist as two edges. Handing such a segment
  // to cdt2d is exactly the "recovery" gamble the 2026-07-24 arms lost. MEASURED here before this pass
  // existed: 92 of 8,762 locus segments (1.05%) were unrecoverable for this reason, all of them where two
  // traced loci run close enough that one chain's vertex lands on another chain's segment.
  // The fix is not a tolerance, it is a SPLIT: the constraint is subdivided at every interior point, so
  // the locus is still covered edge-for-edge and the PSLG is admissible by construction.
  let constraintsConditioned = 0;
  for (let condPass = 0; condPass < 3; condPass += 1) {
    const EPS = o.pslgEpsMm;
    const out: Array<[number, number]> = [];
    let moved = 0;
    for (const [a, b] of constraints) {
      const ax = px[a]; const ay = py[a]; const bx = px[b]; const by = py[b];
      const ux = bx - ax; const uy = by - ay;
      const l2 = ux * ux + uy * uy;
      const hits: Array<[number, number]> = [];
      if (l2 > 1e-18) {
        const midx = 0.5 * (ax + bx); const midy = 0.5 * (ay + by);
        const rad = 0.5 * Math.sqrt(l2) + EPS;
        const n = Math.ceil(rad / CELL);
        const cx = Math.floor(midx / CELL); const cy = Math.floor(midy / CELL);
        for (let dx = -n; dx <= n; dx += 1) for (let dy = -n; dy <= n; dy += 1) {
          for (const j of hash.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (j === a || j === b) continue;
            const t = ((px[j] - ax) * ux + (py[j] - ay) * uy) / l2;
            if (t <= 1e-9 || t >= 1 - 1e-9) continue;
            const fx = ax + t * ux; const fy = ay + t * uy;
            if (Math.hypot(px[j] - fx, py[j] - fy) > EPS) continue;
            // PROJECT THE BLOCKER ONTO THE CONSTRAINT, then split there. Splitting at the blocker's own
            // position would bend the constraint OFF the traced locus by its offset; splitting at the FOOT
            // leaves the constraint geometrically UNCHANGED (the new vertex is on the segment) and moves
            // only the blocker, by at most EPS. The blocker is always a vertex of a NEIGHBOURING locus
            // passing within EPS — free Steiner points are already excluded by the `nearSeg` clearance,
            // which is 330 um — so what this does is make two loci that pass within 20 um SHARE a vertex,
            // which is what "they meet here" means. MEASURED need: at 4 um, 92 of 8,762 constraints were
            // unrecoverable at production and 1 of 1,515 at the pilot config; the assertion caught both.
            void fx; void fy;
            hits.push([t, j]);
          }
        }
      }
      if (hits.length === 0) { out.push([a, b]); continue; }
      hits.sort((p, q) => p[0] - q[0]);
      constraintsConditioned += 1;
      let prev = a;
      for (const [, j] of hits) { if (j !== prev) out.push([prev, j]); prev = j; }
      if (prev !== b) out.push([prev, b]);
    }
    const grew = out.length !== constraints.length;
    constraints.length = 0;
    for (const e of out) constraints.push(e);
    // Iterate to a fixed point: projecting a blocker can put it inside ANOTHER constraint's interior.
    if (!grew && moved === 0) break;
  }
  // dedupe (two chains meeting at a junction can produce the same segment twice)
  {
    const seenE = new Set<number>();
    const out: Array<[number, number]> = [];
    for (const [a, b] of constraints) {
      const k = a < b ? a * 33554432 + b : b * 33554432 + a;
      if (seenE.has(k)) continue;
      seenE.add(k); out.push([a, b]);
    }
    constraints.length = 0;
    for (const e of out) constraints.push(e);
  }

  // ── 4. TRIANGULATE ──────────────────────────────────────────────────────────────────────────────
  const ptArray: Array<[number, number]> = px.map((x, i) => [x, py[i]]);
  const raw = cdt2d(ptArray, constraints, { interior: true, exterior: true });

  // ── 5. VERIFY CONSTRAINT RECOVERY — AN ASSERTION, NOT A REPORT LINE (see the header) ────────────
  const ek = (a: number, b: number): number => (a < b ? a * 33554432 + b : b * 33554432 + a);
  // Zero-chart-area output triangles are dropped below; an edge that exists ONLY inside one of them is not
  // in the mesh, so recovery is checked against the SURVIVING triangles, not against cdt2d's raw output.
  const CHART_AREA_EPS0 = o.chartAreaEpsMm2 ?? 1e-7;
  const kept = raw.filter((t) => Math.abs((px[t[1]] - px[t[0]]) * (py[t[2]] - py[t[0]]) - (py[t[1]] - py[t[0]]) * (px[t[2]] - px[t[0]])) / 2 >= CHART_AREA_EPS0);
  const edgeSet = new Set<number>();
  for (const t of kept) { edgeSet.add(ek(t[0], t[1])); edgeSet.add(ek(t[1], t[2])); edgeSet.add(ek(t[2], t[0])); }
  let recovered = 0;
  for (const [a, b] of constraints) if (edgeSet.has(ek(a, b))) recovered += 1;
  if (recovered !== constraints.length && process.env.PF_S10_SEED_DIAG === '1') {
    for (const [a, b] of constraints) {
      if (edgeSet.has(ek(a, b))) continue;
      // eslint-disable-next-line no-console
      console.log(`  UNRECOVERED (${a},${b}) chart A=(${px[a].toFixed(6)},${py[a].toFixed(6)}) B=(${px[b].toFixed(6)},${py[b].toFixed(6)}) len=${Math.hypot(px[b]-px[a],py[b]-py[a]).toExponential(3)}`);
      const nb: number[] = [];
      for (let j = 0; j < px.length; j += 1) {
        if (j === a || j === b) continue;
        if (Math.hypot(px[j] - px[a], py[j] - py[a]) < 0.5 || Math.hypot(px[j] - px[b], py[j] - py[b]) < 0.5) nb.push(j);
      }
      // eslint-disable-next-line no-console
      console.log(`     neighbours within 0.5mm: ${nb.length}  ${nb.slice(0, 8).map((j) => `${j}:(${px[j].toFixed(6)},${py[j].toFixed(6)})`).join(' ')}`);
    }
  }
  if (recovered !== constraints.length) {
    throw new Error(
      `ALIGNED SEED: constraint recovery INCOMPLETE — ${recovered} of ${constraints.length} locus segments `
      + `are edges of the triangulation (${constraints.length - recovered} missing). A locus constraint that `
      + `is not an edge is a fossil reintroduced with a clean report; refusing to seed. `
      + `(2026-07-24 precedent: generic CDT arms recovered only 21-42% of a dense constraint graph.)`,
    );
  }

  // ── 6. LIFT, ORIENT, CENSUS ─────────────────────────────────────────────────────────────────────
  const lx: number[] = []; const ly: number[] = []; const lz: number[] = [];
  for (let i = 0; i < pth.length; i += 1) {
    const c = canonTheta(pth[i]); fieldEvals += 1;
    const r = rA(c, pz[i]);
    lx.push(r * Math.cos(c)); ly.push(r * Math.sin(c)); lz.push(pz[i]);
  }
  const tris: Array<[number, number, number]> = [];
  let overCap = 0; let worstAR = 0; let worstParAR = 0; let negArea = 0; let degenerateDropped = 0;
  // cdt2d emits ZERO-AREA triangles among the exactly-collinear points of a hull edge — measured: 598 of
  // them along z=0 and z=H, several with a theta=2pi vertex whose 3-D lift coincides with theta=0, giving
  // a 0.000 um edge and AR 2.8e9. They cover no area, so dropping them cannot open a hole; leaving them in
  // would freeze an unrepairable blade into the STL and poison the blade gate.
  const CHART_AREA_EPS = o.chartAreaEpsMm2 ?? 1e-7;
  // ── THE DROP IS TOPOLOGICALLY GUARDED. ──────────────────────────────────────────────────────────
  // Dropping a zero-area triangle is safe ONLY where its edges are still carried by a neighbour, or lie
  // along a domain side (where a boundary edge is CORRECT — a ring has two rim loops). MEASURED: the
  // unguarded drop opened exactly one triangular hole, and it is the whole of the `seam-crack edges 3 /
  // Euler -1` defect that every aligned arm has carried. With nothing dropped the seed reads boundary 0 /
  // Euler 2 (the rim slivers falsely close the rims); with the drop guarded it reads two rim loops and
  // Euler 0, which is what an annulus is.
  const dropEK = (a: number, b: number): number => (a < b ? a * 33554432 + b : b * 33554432 + a);
  const edgeUse = new Map<number, number>();
  for (const t of raw) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
    const k = dropEK(u, v); edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  }
  // ONLY z=0 and z=H are real rims. The theta=0 and theta=2pi columns are NOT boundary — they are the
  // SAME meridian, welded into interior edges by `addV`, so a seam-column edge orphaned in the chart is an
  // interior hole in the mesh. Exempting them (the first draft did) is exactly why the guard reported
  // `dropRefused 0` while the crack survived: the pairing that matters is invisible in the flat chart.
  const onSide = (i: number, j: number): boolean => (
    (pz[i] <= 1e-9 && pz[j] <= 1e-9) || (pz[i] >= H - 1e-9 && pz[j] >= H - 1e-9)
  );
  let dropRefused = 0;
  for (const t of raw) {
    let [a, b, c] = t;
    const chA = Math.abs((px[b] - px[a]) * (py[c] - py[a]) - (py[b] - py[a]) * (px[c] - px[a])) / 2;
    if (chA < CHART_AREA_EPS) {
      let safe = true;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        if ((edgeUse.get(dropEK(u, v)) ?? 0) - 1 === 1 && !onSide(u, v)) { safe = false; break; }
      }
      if (safe) {
        for (const [u, v] of [[a, b], [b, c], [c, a]]) edgeUse.set(dropEK(u, v), (edgeUse.get(dropEK(u, v)) ?? 1) - 1);
        degenerateDropped += 1; continue;
      }
      dropRefused += 1;
    }
    const s = signedAreaParam(pth[a], pz[a], pth[b], pz[b], pth[c], pz[c]);
    if (s === 0) { negArea += 1; continue; }
    if (s < 0) { const tmp = b; b = c; c = tmp; }
    tris.push([a, b, c]);
    const ar = aspect3(lx[a], ly[a], lz[a], lx[b], ly[b], lz[b], lx[c], ly[c], lz[c]);
    if (ar > o.shapeAR) overCap += 1;
    if (ar > worstAR) worstAR = ar;
    // parametric AR in (arc, z) — the quantity nothing in the driver bounds and the eye actually sees
    const P = (i: number, j: number): number => Math.hypot(rRef * dThRaw(canonTheta(pth[i]), canonTheta(pth[j])), pz[j] - pz[i]);
    const e0 = P(a, b); const e1 = P(b, c); const e2 = P(c, a);
    const A2 = Math.abs(signedAreaParam(pth[a], pz[a], pth[b], pz[b], pth[c], pz[c])) * rRef;
    const parAR = A2 > 0 ? (Math.max(e0, e1, e2) * (e0 + e1 + e2)) / (2 * A2) : Infinity;
    if (Number.isFinite(parAR) && parAR > worstParAR) worstParAR = parAR;
  }

  // ── 6b. BOW-CAP DIAGNOSIS — which chain vertex, if removed, would clear each over-cap facet ─────
  // A constraint chain that BOWS produces a "cap" triangle spanning the bow: its two long sides are
  // consecutive constraint edges and its base is the chord across them, so its height is the bow depth.
  // MEASURED on GothicArches: a 21 um bow over a 2.2 mm span is an AR-111 facet, and nothing downstream
  // can repair it — the clearance band beside a locus is empty BY DESIGN and an offset point 385 um out is
  // nowhere near a 21 um lens; the seed IS the mesh, so the facet freezes into the STL.
  //
  // THE TEST MUST RUN ON TRIANGLES THAT EXIST. Predicting it from the chain alone does not work and the
  // failure is not subtle: three consecutive vertices of a nearly-straight locus have a huge triangle
  // aspect ratio whether or not the triangulator ever joins them, so an a-priori rule removed 62% of the
  // constraints (7,253 -> 2,839) on its first run. Here the apex is identified from the ACTUAL over-cap
  // facet, and only when it is non-fixed and redundant to within pslgEps.
  const conKeys = new Set<number>();
  for (const [a, b] of constraints) conKeys.add(ek(a, b));
  const suggested = new Set<string>();
  let dbgOver = 0; let dbgCon2 = 0; let dbgOwned = 0; let dbgBow = 0;
  for (const [a, b, c] of tris) {
    const ar = aspect3(lx[a], ly[a], lz[a], lx[b], ly[b], lz[b], lx[c], ly[c], lz[c]);
    if (ar <= o.shapeAR) continue;
    dbgOver += 1;
    for (const [u, v, w] of [[a, b, c], [b, c, a], [c, a, b]] as Array<[number, number, number]>) {
      // v is the candidate apex: edges (u,v) and (v,w) must both be constraints, (u,w) the chord
      if (!conKeys.has(ek(u, v)) || !conKeys.has(ek(v, w))) continue;
      dbgCon2 += 1;
      if (v >= ownerChain.length || ownerChain[v] < 0 || ownerFixed[v]) continue;
      dbgOwned += 1;
      const ux = px[w] - px[u]; const uy = py[w] - py[u];
      const l2 = ux * ux + uy * uy;
      if (l2 < 1e-18) continue;
      const t = ((px[v] - px[u]) * ux + (py[v] - py[u]) * uy) / l2;
      if (t <= 0 || t >= 1) continue;
      const bow = Math.hypot(px[v] - (px[u] + t * ux), py[v] - (py[u] + t * uy));
      dbgBow += 1;
      if (bow >= o.pslgEpsMm) continue;            // too deep to straighten inside the stated bound
      suggested.add(`${ownerChain[v]}:${ownerIdx[v]}`);
    }
    // LAST RESORT, and the safest move available: a FREE Steiner point (offset or background) is not a
    // constraint and carries no geometry of its own, so DELETING it cannot move a locus or open a hole —
    // the triangulation simply re-fills its neighbourhood. Only free points are eligible; a constraint
    // vertex is never removed this way.
    for (const v of [a, b, c]) {
      if (v < freeFrom) continue;
      suggested.add(freeKey(pth[v], pz[v]));
    }
  }

  if (process.env.PF_S10_SEED_DIAG === '1') {
    // eslint-disable-next-line no-console
    console.log(`  BOWDIAG overCapTris ${dbgOver}  with-2-constraint-edges ${dbgCon2}  owned-nonfixed ${dbgOwned}  bow-computed ${dbgBow}  suggested ${suggested.size}`);
  }

  // ── 7. THE LEVER'S OWN HEADLINE MEASUREMENT: do any SEED EDGES still cross a locus? ─────────────
  // Measured against the TRACED loci (the same object the constraints came from), so this is an
  // internal-consistency check on the seed, not a re-detection. The driver measures the same quantity
  // independently with `locateKink`; the two must agree or one of them is wrong.
  let edgesCrossingLocus = 0; let edgesTested = 0;
  {
    const conSet = new Set<number>();
    for (const [a, b] of constraints) conSet.add(ek(a, b));
    const segList: Array<[number, number, number, number]> = [];
    for (const C of chains2) for (let i = 0; i + 1 < C.length; i += 1) segList.push([rRef * C[i].th, C[i].z, rRef * C[i + 1].th, C[i + 1].z]);
    const gb = new Map<string, number[]>();
    for (let s = 0; s < segList.length; s += 1) {
      const [x0, y0, x1, y1] = segList[s];
      for (let bx = Math.floor(Math.min(x0, x1) / BS); bx <= Math.floor(Math.max(x0, x1) / BS); bx += 1) {
        for (let by = Math.floor(Math.min(y0, y1) / BS); by <= Math.floor(Math.max(y0, y1) / BS); by += 1) {
          const k = `${bx},${by}`; const l = gb.get(k); if (l === undefined) gb.set(k, [s]); else l.push(s);
        }
      }
    }
    for (const e of edgeSet) {
      if (conSet.has(e)) continue;
      const a = Math.floor(e / 33554432); const b = e % 33554432;
      edgesTested += 1;
      const ax = px[a]; const ay = py[a]; const bx2 = px[b]; const by2 = py[b];
      const cand = new Set<number>();
      for (let bxi = Math.floor(Math.min(ax, bx2) / BS); bxi <= Math.floor(Math.max(ax, bx2) / BS); bxi += 1) {
        for (let byi = Math.floor(Math.min(ay, by2) / BS); byi <= Math.floor(Math.max(ay, by2) / BS); byi += 1) {
          for (const s of gb.get(`${bxi},${byi}`) ?? []) cand.add(s);
        }
      }
      let hit = false;
      for (const s of cand) {
        const [x0, y0, x1, y1] = segList[s];
        if (segParams(ax, ay, bx2, by2, x0, y0, x1, y1) !== null) { hit = true; break; }
      }
      if (hit) edgesCrossingLocus += 1;
    }
  }

  return {
    pts: pth.map((th, i) => [th, pz[i]] as [number, number]),
    tris,
    constraints,
    suggestedBans: [...suggested],
    patches: patchEmitted,
    stats: {
      lociUsed, chains: chains2.length, chainPts, crossingsSplit, seamZ: seamZs.length,
      bgKept, bgDropped, offsetPts, points: pth.length, tris: tris.length,
      constraints: constraints.length, constraintsRecovered: recovered, constraintsConditioned,
      decimated, boundarySnapped, degenerateDropped, banApplied, boundaryConstraints, dropRefused,
      edgesCrossingLocus, edgesTested,
      overCap, worstAR, worstParAR, negArea,
      alongMm: alongBase, acrossMm: acrossBase,
      acrossBoundPts,
      alongBoundPts,
      bowShortenedPts,
      patchRegions: patchEmitted.length,
      patchPts,
      patchRings,
      patchRefusedPt,
      patchRefusedSeg,
      // reduce, not Math.min(...arr): the array is one entry per chain point (tens of thousands) and a
      // spread that long overflows the argument stack.
      acrossMinPlacedMm: acrossPlaced.length > 0 ? acrossPlaced.reduce((m, v) => (v < m ? v : m), Infinity) : acrossBase,
      acrossP50PlacedMm: acrossPlaced.length > 0
        ? acrossPlaced.slice().sort((x, y) => x - y)[Math.floor(acrossPlaced.length / 2)]
        : acrossBase,
      fieldEvals, wallMs: Date.now() - t0,
    },
  };
}


/**
 * Build the seed, then REPAIR it: every round, the bow-cap apexes of the over-cap facets are banned and
 * the seed is rebuilt. Bounded rounds — a repair that does not converge is reported through the returned
 * seed's `overCap`, never hidden by looping harder.
 *
 * The build is a pure function of (rA, art, opts), so the chain numbering the bans refer to is stable
 * across rounds by construction.
 */
export function buildAlignedSeedRepaired(
  rA: SweepRadiusFn, art: LocusArtifact, o: AlignedSeedOpts, rounds = 6,
): { seed: AlignedSeed; roundsUsed: number; banned: number } {
  const banned = new Set<string>();
  let seed = buildAlignedSeed(rA, art, { ...o, banned });
  let used = 0;
  for (let r = 0; r < rounds; r += 1) {
    if (seed.stats.overCap === 0 || seed.suggestedBans.length === 0) break;
    let added = 0;
    for (const k of seed.suggestedBans) if (!banned.has(k)) { banned.add(k); added += 1; }
    if (added === 0) break;
    seed = buildAlignedSeed(rA, art, { ...o, banned });
    used = r + 1;
  }
  return { seed, roundsUsed: used, banned: banned.size };
}
