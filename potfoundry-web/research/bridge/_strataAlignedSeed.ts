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
import { canonTheta, dThRaw, locateKinkRaw, type SweepRadiusFn, type SweepPredConst } from './_sweepPredicate';
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
  /**
   * S19 — GRADED ACROSS-COMPLETION. Number of offset RINGS per chain point. 1 = the single ring this file
   * has always placed (the default, and then every S19 clause below is arithmetically absent). >1 fills the
   * measured void between the innermost ring and the background lattice with a geometric progression.
   */
  acrossRings: number;
  /** ring-to-ring radius ratio for the progression; also sets the ALONG stride, so elements stay similar. */
  acrossGrade: number;
  /**
   * S32 research shadow: maximum chain-index stride on an offset ring.
   * Historical value 4 preserves the current graded collar exactly; 2 or 1
   * densifies only the outer collar boundary where repeated many-to-one fans
   * can form. Point placement, constraints, exclusions and ring radii stay fixed.
   */
  acrossStrideMax: number;
  /**
   * S32 research shadow, DEFAULT OFF. Turn the already-emitted graded offset
   * points into a planar collar PSLG: consecutive points on each ring become
   * rails, and matched chain/ring points become radial rungs. Every candidate
   * is refused before insertion if it properly crosses an existing locus or
   * collar segment, or if an existing vertex lies within the conditioning
   * radius of its interior. The historical free-Steiner collar is unchanged
   * when false.
  */
  acrossStructured: boolean;
  /** S32 collar scope: all rails/rungs, rails only, outer rail only, or outer rail plus its inward rungs. */
  acrossStructuredMode: 'full' | 'rails' | 'outer' | 'outer-cell';
  /** outermost ring radius, mm — where the progression is expected to meet the background lattice. */
  acrossMaxMm: number;
  /**
   * S19 — bound the ALONG spacing by `turnMul * hAc` wherever the across rule binds. CALIBRATION, measured:
   * at the two named sites R2's across answer hAc = 44.7 um against a MEASURED crease turnover of 106.0 um,
   * so hAc = 0.42 x turnover and `turnMul` = k / 0.42 for a bound of k x turnover. 0 = OFF.
   */
  turnMul: number;
  /** cap on the routed radius, mm — the 4.000 mm radius-capped clusters get their core routed, not all of it. */
  patchMaxMm: number;
  /**
   * S30 SHADOW ONLY: raw junction ids whose offset-ring exclusion is owned by the
   * patch geometry that was ACTUALLY routed. Empty/undefined preserves the historical
   * rule exactly: every raw junction suppresses offset rings to its full `radiusMm`.
   *
   * A named id must have a matching `patchRoute` entry `D<id>` at the identical
   * centre. Its effective exclusion becomes
   * `min(raw radius, requested patch radius, patchMaxMm)`. This closes the otherwise
   * unowned annulus created when a raw 4 mm disk is paired with a 1.5 mm routed cap.
   * It is deliberately id-scoped for the S24 shadow A/B; raw clustered junctions are
   * not trustworthy enough for a global policy.
   */
  patchExclusionIds?: ReadonlySet<number>;
  /** innermost ring radius, mm. */
  patchInnerMm: number;
  /** ring-to-ring radius ratio; `patchM` is derived from it (see the emitter). */
  patchGrade: number;
  /** points per ring, at the polar grading's own spacing; the S21 field cap scales it up where it binds. */
  patchM: number;
  /**
   * S21 — THE GRADING FIX'S ONLY GUARD. Maximum sub-rings the sizing-field cap may insert between two
   * consecutive polar rings. It exists so a pathologically small field answer cannot make the patch set
   * unbounded; when it CLIPS it is counted into `patchSubCapped` and reported, never absorbed silently.
   */
  patchSubMax: number;
  /** chord tolerance for the sizing solve, mm. */
  tolMm: number;
  /** LAYER-2 NEGATIVE CONTROL: push every locus this far along its own normal before seeding, um. */
  mistraceUm: number;
  /** the census cap — used to MEASURE the emitted seed, never to refuse (the grid is the mesh). */
  shapeAR: number;
  /** weld radius for coincident chain points, mm. */
  weldMm: number;
  /**
   * S31 R3a research shadow: consecutive-chain decimation distance, mm.
   * Undefined preserves the historical coupled value
   * `max(4*weldMm, 0.5*acrossBase)`. This changes only stage 3a's
   * consecutive-point filter; cross-chain welding, bow floor, seam/boundary
   * snapping, PSLG conditioning, and patch geometry keep the historical value.
   */
  chainDecimateMm?: number;
  /**
   * S31 R4 research shadow: weld radius for NON-fixed vertices from
   * different feature chains. Undefined preserves the historical minSep
   * coupling. Fixed intersection vertices continue to use minSep so a real
   * junction is represented by one topological vertex.
   */
  chainWeldMm?: number;
  /**
   * S33 — SEED-TIME CHAIN RE-SOLVE. Transverse probe half-width in mm. UNDEFINED OR 0 = OFF, and
   * with it off not one line of the pass executes, so every prior arm is byte-identical.
   *
   * WHY IT EXISTS. Chain vertices are interpolated onto the tracer's POLYLINE, which is a secant of
   * the true analytic locus (tracer resample ~0.61 mm, chain resample ~1.1 mm). Measured 2026-08-04,
   * they sit p50 4.19 um OFF the locus perpendicular — and a constraint vertex is supposed to BE on
   * it. That placement error is what puts a crease crossing in the INTERIOR of edges radiating from
   * the chain: 9,363 actionable crossings, 88.4% of them with exactly one constrained endpoint.
   * Re-solving collapses them to 1,399 (-85%) at zero PSLG planarity breaks.
   *
   * ⚠ 0.050 IS THE MEASURED SHIPPING VALUE AND WIDER IS NOT BETTER. ±100/±200 um reduce the residual
   * further but BREAK PSLG planarity (13 / 10 proper constraint crossings) and wreck shape (folds
   * 24 / 89) — a wider transverse probe reaches a NEIGHBOURING locus, which is exactly the failure
   * `_strataConformBisect.test.ts:2218-2221` documents for the same primitive. Raise this only
   * behind a re-planarization pass. See `research/tools/s33ChainResolve.ts` for the A/B.
   */
  resolveSpanMm?: number;
  /**
   * Kink-locator constants for the re-solve probe. REQUIRED when `resolveSpanMm > 0` — there is no
   * default on purpose: the probe must use the SAME detector the driver does, or the seed conforms
   * to one surface and the driver measures another. Callers pass their own `PRED`.
   */
  resolvePred?: SweepPredConst;
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
  /**
   * S23 — THE EXTRACTED ABSOLUTE DENSITY FIELD. `undefined` = OFF (the default), and then every S23
   * clause in this file is arithmetically absent — no branch taken, no point emitted, no eval spent.
   *
   * IT ENTERS AS AN ABSOLUTE RULE OF THE `acrossAbs` / offset-ring FAMILY AND NOT THROUGH `useField`'s
   * `cl()` CLAMP, and the reason is measured: `cl` is `max(1/fieldRange, min(fieldRange, x))` at
   * `fieldRange = 2`, and a +-2x clamp cannot express a 50 um -> 1,101 um demand range. That is the same
   * reason S15's `acrossAbs` and S19's rings exist as separate absolute rules (S23 registration, 95cd8662).
   *
   * WHAT IT DRIVES, AND — MORE IMPORTANTLY — WHAT IT DOES NOT. It drives ONE new stage: a greedy
   * minimum-distance infill of FREE STEINER POINTS (3g below) and the boundary densification that stage
   * needs to reach the four domain sides. It drives NO constraint, NO chain spacing, NO ring radius and
   * NO patch grading — those keep their declared rules unchanged, so the constraint count and the
   * designed-lattice census are preserved BY CONSTRUCTION rather than by measurement. Registered
   * 2026-08-01 in the worklog block "S23B — THE FIELD-PREPARATION DECISION" with all three reasons.
   */
  reconField?: { hAt: (th: number, z: number) => number; floorMm: number; dxMm: number };
  /**
   * S23 — the packing radius as a fraction of the local field demand. A maximal minimum-distance point
   * set at radius `r` carries a vertex density of ~0.8/r^2 against an equilateral mesh of edge `h`'s
   * 2/(sqrt3 h^2) = 1.1547/h^2, so `beta = sqrt(0.8/1.1547) = 0.83` is the CALIBRATION that makes the
   * placed density equal the demanded one. It is a unit conversion, not a design choice, and its value is
   * measured on the low-density probe against the registered point count before the production arm.
   */
  reconBeta: number;
  /**
   * S23B AMENDMENT, DEFAULT FALSE. Let the extracted field bound the chain ALONG spacing as well as the
   * free infill. Registered as an amendment, with the measurement that forced it, before the re-score:
   * free-Steiner infill alone cannot reach the corridor the across rule owns, so the declared along
   * spacing (up to 1,200 um beside a locus) caps the achievable fidelity no matter how dense the field is.
   * IT IS THE ONE THING THAT ADDS CONSTRAINTS, so the S7 tripwire is aimed straight at it: a
   * constraint-recovery shortfall here is INFEASIBLE and is reported, not tuned around.
   */
  reconChain: boolean;
  /**
   * S23 — candidate lattice fineness: candidates inside a field cell are placed at `h / reconCand`, so the
   * greedy set is maximal to within `h/reconCand`. 3 is the registered value; below ~2 the set stops being
   * maximal and the largest empty circle (hence the worst element) grows.
   */
  reconCand: number;
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
  acrossRings: 1,
  acrossGrade: 1.6,
  acrossStrideMax: 4,
  acrossStructured: false,
  acrossStructuredMode: 'full',
  acrossMaxMm: 0.65,
  turnMul: 0,
  patchMaxMm: 1.5,
  patchInnerMm: 0.05,
  patchGrade: 1.6,
  patchM: 16,
  patchSubMax: 16,
  tolMm: 0.01,
  mistraceUm: 0,
  shapeAR: 50,
  weldMm: 0.002,
  pslgEpsMm: 0.02,
  reconBeta: 0.83,
  reconCand: 3,
  reconChain: false,
};

export interface AlignedSeed {
  /** (theta, z) per seed vertex; theta in [0, 2pi] with 2pi ONLY on the seam column. */
  pts: Array<[number, number]>;
  /** triangles, normalised to POSITIVE signed area in (theta,z) — the uniform grid's own convention. */
  tris: Array<[number, number, number]>;
  /** the locus constraint segments, as vertex index pairs. */
  constraints: Array<[number, number]>;
  /**
   * The same final segments with the durable obligations they discharge.
   *
   * `constraints` remains the compact cdt2d input. This ledger is the
   * correctness identity that used to be lost when conditioning or final
   * planarisation split/deduplicated a bare edge pair. A coincident segment
   * may carry more than one id; consumers must preserve the complete set when
   * they split that edge again.
   */
  constraintLedger: Array<{
    vertices: [number, number];
    obligationIds: string[];
  }>;
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
    /** S33: chain vertices MOVED onto the true locus by the seed-time re-solve (0 when the lever is off). */
    chainResolved: number;
    /** S33: re-solve probes rejected — no kink, jump-class, or a kink near the probe end (a DIFFERENT locus). */
    chainResolveRefused: number;
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
    /** S19: chain points where the crease-turnover bound shortened the along spacing, and rings used. */
    turnBoundPts: number;
    offsetRingsUsed: number;
    /** S32: accepted structured-collar constraints and their preflight refusals. */
    collarRailConstraints: number;
    collarRungConstraints: number;
    collarRefusedCrossing: number;
    collarRefusedInteriorPoint: number;
    /** S18: routed junctions, structured points emitted, rings laid, and points the guards refused. */
    patchRegions: number;
    patchPts: number;
    patchRings: number;
    patchRefusedPt: number;
    patchRefusedSeg: number;
    /** S30: named raw disks whose exclusion was reduced to actual routed coverage. */
    patchExclusionRegions: number;
    /** S30: chain sites reclaimed from a raw no-ring disk by the routed-coverage rule. */
    patchExclusionReclaimedChainPts: number;
    /** S30: intended outer-patch sectors and sectors with no point/constraint owner. */
    patchOuterSectors: number;
    patchOuterUncoveredSectors: number;
    /**
     * S21 — THE GRADING FIX. Polar rings where the SIZING FIELD asked for less than the polar grading and
     * therefore bound the interior sizing, the sub-rings that bound inserted, and the number of times the
     * `patchSubMax` guard CLIPPED the refinement. A non-zero `patchSubCapped` means the fix could not be
     * fully applied somewhere and the routed disk may still be coarser than the field there — it is
     * reported rather than silently absorbed.
     */
    patchFieldBoundRings: number;
    patchSubRings: number;
    patchSubCapped: number;
    /** S21: the worst ratio polar/field over all rings — how far the polar set was from the field's answer. */
    patchWorstRatio: number;
    /** S15: the across spacing ACTUALLY placed, over all chain points — min / p50, mm. */
    acrossMinPlacedMm: number;
    acrossP50PlacedMm: number;
    /**
     * S23 — THE FIELD INFILL, measured rather than asserted. `reconCandidates` is how many free-point
     * candidates the field asked for; `reconPts` how many the greedy minimum-distance test ACCEPTED;
     * `reconRefusedPt` / `reconRefusedSeg` why the rest were refused. `reconBoundaryPts` is the boundary
     * densification (rim rows + the two seam columns, identical z-set on both, per S11).
     * `reconFloorHits` counts candidates whose field demand was already AT the prepared floor — the
     * population the constructor is architecturally forbidden to resolve any finer, reported so the
     * density deficit is visible in the built mesh and not only in the field.
     */
    reconPts: number;
    reconCandidates: number;
    /** S23B amendment: chain points whose ALONG spacing the extracted field shortened. */
    reconAlongBoundPts: number;
    reconRefusedPt: number;
    reconRefusedSeg: number;
    reconBoundaryPts: number;
    reconFloorHits: number;
    reconMs: number;
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

interface PatchExclusionResolution {
  effectiveRadiusByJunction: Map<number, number>;
  selectedIds: Set<number>;
}

export interface RoutedAnnulusCandidate {
  junctionId: number;
  patchId: string;
  centerErrorMm: number;
  rawRadiusMm: number;
  routedRadiusMm: number;
}

export interface RoutedAnnulusDiscovery {
  candidates: RoutedAnnulusCandidate[];
  exactCenterMatches: number;
  ambiguousJunctionIds: number[];
  ambiguousPatchIds: string[];
}

/**
 * S31 R1 research shadow: discover raw-exclusion annuli from geometry alone.
 *
 * A candidate is a one-to-one raw-junction/patch centre match within `centerTolMm`
 * whose raw exclusion radius is larger than the radius the patch can actually emit.
 * Defect scores, screenshots, raw ids, and top-N ordering are deliberately absent.
 * Ambiguous centre matches are reported and never selected by priority.
 */
export function discoverRoutedAnnuli(
  art: LocusArtifact,
  patchRoute: readonly PatchRegion[],
  patchMaxMm: number,
  rRef = 45,
  centerTolMm = 0.002,
): RoutedAnnulusDiscovery {
  const byJunction = new Map<number, Array<{ region: PatchRegion; errorMm: number }>>();
  const byPatch = new Map<string, Array<{ junctionId: number; errorMm: number }>>();
  for (const junction of art.junctions) {
    for (const region of patchRoute) {
      const errorMm = Math.hypot(
        rRef * dThRaw(canonTheta(junction.theta), canonTheta(region.theta)),
        junction.z - region.z,
      );
      if (errorMm > centerTolMm) continue;
      const jl = byJunction.get(junction.id);
      if (jl === undefined) byJunction.set(junction.id, [{ region, errorMm }]);
      else jl.push({ region, errorMm });
      const pl = byPatch.get(region.id);
      if (pl === undefined) byPatch.set(region.id, [{ junctionId: junction.id, errorMm }]);
      else pl.push({ junctionId: junction.id, errorMm });
    }
  }

  const ambiguousJunctionIds = [...byJunction]
    .filter(([, matches]) => matches.length !== 1)
    .map(([id]) => id)
    .sort((a, b) => a - b);
  const ambiguousPatchIds = [...byPatch]
    .filter(([, matches]) => matches.length !== 1)
    .map(([id]) => id)
    .sort();
  const candidates: RoutedAnnulusCandidate[] = [];
  for (const junction of art.junctions) {
    const matches = byJunction.get(junction.id) ?? [];
    if (matches.length !== 1) continue;
    const match = matches[0];
    if ((byPatch.get(match.region.id) ?? []).length !== 1) continue;
    const routedRadiusMm = Math.min(match.region.radiusMm, patchMaxMm);
    if (junction.radiusMm <= routedRadiusMm + centerTolMm) continue;
    candidates.push({
      junctionId: junction.id,
      patchId: match.region.id,
      centerErrorMm: match.errorMm,
      rawRadiusMm: junction.radiusMm,
      routedRadiusMm,
    });
  }
  candidates.sort((a, b) => a.junctionId - b.junctionId);
  return {
    candidates,
    exactCenterMatches: [...byJunction.values()].filter((matches) => matches.length === 1).length,
    ambiguousJunctionIds,
    ambiguousPatchIds,
  };
}

function resolvePatchExclusions(
  art: LocusArtifact,
  patchRoute: readonly PatchRegion[],
  patchMaxMm: number,
  ids: ReadonlySet<number> | undefined,
  rRef: number,
  centerTolMm: number,
): PatchExclusionResolution {
  const selectedIds = new Set(ids ?? []);
  const effectiveRadiusByJunction = new Map<number, number>();
  if (selectedIds.size === 0) return { effectiveRadiusByJunction, selectedIds };

  const junctionById = new Map(art.junctions.map((junction) => [junction.id, junction]));
  const routeById = new Map(patchRoute.map((region) => [region.id, region]));
  for (const id of selectedIds) {
    const junction = junctionById.get(id);
    if (junction === undefined) {
      throw new Error(`ALIGNED SEED S30: exclusion id ${id} is not a raw locus junction`);
    }
    const route = routeById.get(`D${id}`);
    if (route === undefined) {
      throw new Error(`ALIGNED SEED S30: exclusion id ${id} has no matching patchRoute entry D${id}`);
    }
    const centreErrorMm = Math.hypot(
      rRef * dThRaw(canonTheta(junction.theta), canonTheta(route.theta)),
      junction.z - route.z,
    );
    if (centreErrorMm > centerTolMm) {
      throw new Error(
        `ALIGNED SEED S30: D${id} route centre differs from raw junction by `
        + `${(centreErrorMm * 1000).toFixed(3)} um (limit ${(centerTolMm * 1000).toFixed(3)} um)`,
      );
    }
    const effectiveRadiusMm = Math.min(junction.radiusMm, route.radiusMm, patchMaxMm);
    if (!(effectiveRadiusMm > 0)) {
      throw new Error(`ALIGNED SEED S30: D${id} has non-positive effective routed radius ${effectiveRadiusMm}`);
    }
    effectiveRadiusByJunction.set(id, effectiveRadiusMm);
  }
  return { effectiveRadiusByJunction, selectedIds };
}

export interface PatchOwnershipAudit {
  rawJunctionIds: number[];
  effectiveJunctionIds: number[];
  requestedPatchIds: string[];
  overriddenJunctionIds: number[];
}

/**
 * Research-local ownership probe used to pre-register the S24 corridor A/B.
 * `requestedPatchIds` reports geometric coverage requested by the routed patch;
 * the seed's outer-sector audit separately proves that requested coverage was built.
 */
export function auditPatchOwnership(
  art: LocusArtifact,
  patchRoute: readonly PatchRegion[],
  patchMaxMm: number,
  patchExclusionIds: ReadonlySet<number> | undefined,
  theta: number,
  z: number,
  rRef = 45,
  centerTolMm = 0.002,
): PatchOwnershipAudit {
  const resolution = resolvePatchExclusions(
    art,
    patchRoute,
    patchMaxMm,
    patchExclusionIds,
    rRef,
    centerTolMm,
  );
  const rawJunctionIds: number[] = [];
  const effectiveJunctionIds: number[] = [];
  for (const junction of art.junctions) {
    const distanceMm = Math.hypot(
      rRef * dThRaw(canonTheta(theta), junction.theta),
      z - junction.z,
    );
    if (distanceMm <= junction.radiusMm) rawJunctionIds.push(junction.id);
    const effectiveRadiusMm = resolution.effectiveRadiusByJunction.get(junction.id) ?? junction.radiusMm;
    if (distanceMm <= effectiveRadiusMm) effectiveJunctionIds.push(junction.id);
  }
  const requestedPatchIds: string[] = [];
  for (const region of patchRoute) {
    const distanceMm = Math.hypot(
      rRef * dThRaw(canonTheta(theta), canonTheta(region.theta)),
      z - region.z,
    );
    if (distanceMm <= Math.min(region.radiusMm, patchMaxMm)) requestedPatchIds.push(region.id);
  }
  return {
    rawJunctionIds: rawJunctionIds.sort((a, b) => a - b),
    effectiveJunctionIds: effectiveJunctionIds.sort((a, b) => a - b),
    requestedPatchIds: requestedPatchIds.sort(),
    overriddenJunctionIds: [...resolution.effectiveRadiusByJunction.keys()].sort((a, b) => a - b),
  };
}

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
  if (!Number.isInteger(o.acrossStrideMax) || o.acrossStrideMax < 1) {
    throw new Error('ALIGNED SEED: acrossStrideMax must be a positive integer.');
  }
  if (o.acrossStructured && Math.round(o.acrossRings) <= 1) {
    throw new Error('ALIGNED SEED: acrossStructured needs acrossRings > 1.');
  }
  if (!['full', 'rails', 'outer', 'outer-cell'].includes(o.acrossStructuredMode)) {
    throw new Error('ALIGNED SEED: acrossStructuredMode must be full, rails, outer, or outer-cell.');
  }
  const H = o.H;
  const rRef = 45;                                   // isotropic chart: x = rRef * theta, y = z
  const patchExclusions = resolvePatchExclusions(
    art,
    o.patchRoute ?? [],
    o.patchMaxMm,
    o.patchExclusionIds,
    rRef,
    Math.max(1e-9, o.weldMm),
  );
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
  const chainsRaw: Array<{ pts: Array<[number, number]>; obligationId: string }> = [];
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
    const pieces = splitAtSeam(pts);
    for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 1) {
      chainsRaw.push({
        pts: pieces[pieceIndex],
        obligationId: `feature:locus:${L.id}:piece:${pieceIndex}`,
      });
    }
  }

  // field-modulated resample. `hMedian` is computed from a strided sample of the chain vertices so the
  // modulation is RELATIVE to this surface rather than to an absolute the seed cannot afford.
  let hMedian = 1;
  if (o.useField) {
    const samp: number[] = [];
    for (let c = 0; c < chainsRaw.length; c += Math.max(1, Math.floor(chainsRaw.length / 40))) {
      const P = chainsRaw[c].pts;
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
  const chainObligations: string[] = [];
  let chainPts = 0;
  let acrossBoundPts = 0; let alongBoundPts = 0; let bowShortenedPts = 0; let turnBoundPts = 0;
  let reconAlongBoundPts = 0;
  const acrossPlaced: number[] = [];
  for (const rawChain of chainsRaw) {
    const P = rawChain.pts;
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
            // S19 — ALONG BOUNDED BY THE LOCAL CREASE TURNOVER. The background pitch is 1,101 um and the
            // flank turns over in ~106 um, so an unbounded along spacing lands mm-scale chords across the
            // wall everywhere except at ring zero. `hAc` IS a local feature-scale measurement (0.42 x the
            // measured turnover at both named sites), so this needs no new rA evals.
            if (o.turnMul > 0) {
              const aTurn = o.turnMul * hAc;
              if (aTurn < a) { a = aTurn; turnBoundPts += 1; }
            }
            // ── S23B AMENDMENT — THE EXTRACTED FIELD BOUNDS THE ALONG SPACING TOO. DEFAULT OFF.
            // Exactly the shape of the two clauses above it (`seedARmax * cr`, `turnMul * hAc`): a
            // monotone-downward absolute bound on `a`, taken only where the across rule already binds, so
            // the OFF path and every point the rule does not touch are arithmetically unchanged.
            // WHY IT HAD TO EXIST, MEASURED BEFORE IT WAS WRITTEN: with free Steiner infill alone the
            // constructed mesh read HEADLINE 622.349 um against `_S22B`'s 95.484 — and read the SAME
            // 622.349 at 1/4, 1/2 and full field density, i.e. the residual does not move when the mesh
            // gets three times denser. The witness sits on DECLARED geometry, whose along spacing is
            // scale-independent by construction: the field asks for ~76-104 um beside a locus while the
            // declared rule places chain vertices up to 1,200 um apart there. A free point cannot repair
            // that, because the corridor beside a constraint belongs to the across rule.
            if (o.reconChain && o.reconField !== undefined) {
              const aFld = Math.max(o.acrossMinMm, o.reconField.hAt(last.th, last.z));
              if (aFld < a) { a = aFld; reconAlongBoundPts += 1; }
            }
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
    if (out.length >= 2) {
      chains.push(out);
      chainObligations.push(rawChain.obligationId);
      chainPts += out.length;
    }
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
  const chainDecimateMm = o.chainDecimateMm ?? minSepMm;
  if (!(chainDecimateMm > 0) || chainDecimateMm > minSepMm) {
    throw new Error(
      `ALIGNED SEED S31: chainDecimateMm ${chainDecimateMm} must be in (0, historical minSep ${minSepMm}] mm`,
    );
  }
  const chainWeldMm = o.chainWeldMm ?? minSepMm;
  if (!(chainWeldMm >= o.weldMm) || chainWeldMm > minSepMm) {
    throw new Error(
      `ALIGNED SEED S31: chainWeldMm ${chainWeldMm} must be in [base weld ${o.weldMm}, historical minSep ${minSepMm}] mm`,
    );
  }
  const snapMm = Math.min(minSepMm, acrossBase * 0.5);

  // ── 1a-bis. S33 SEED-TIME CHAIN RE-SOLVE (resolveSpanMm, DEFAULT OFF) ───────────────────────────
  // Move each interior chain vertex onto the TRUE analytic locus with a transverse kink probe. The
  // probe geometry and the end-of-probe rejection guard are transcribed from L3/REPROJECT
  // (_strataConformBisect.test.ts:2209-2222) — the same primitive, applied here at seed time instead
  // of mid-refinement, where planarization still gets the last word and no star is near the AR cap.
  //
  // POSITION IN THE PIPELINE IS LOAD-BEARING, for the reason stated at 1b directly below: this MOVES
  // vertices, so it must run BEFORE stage 2's planarization, never after. It runs before the
  // boundary snap and the decimation too, so snap still pins anything that lands near a boundary and
  // decimation measures the FINAL positions.
  //
  // ALL DISPLACEMENTS ARE COMPUTED FROM THE PRE-PASS POSITIONS AND APPLIED AFTERWARDS. Moving P[i]
  // and then using it as P[i+1]'s neighbour would make the result depend on iteration order and
  // would drag a chain along itself.
  let chainResolved = 0; let chainResolveRefused = 0;
  if (o.resolveSpanMm !== undefined && o.resolveSpanMm > 0) {
    if (o.resolvePred === undefined) {
      throw new Error('ALIGNED SEED S33: resolveSpanMm requires resolvePred — the re-solve must use the '
        + "caller's own kink-locator constants, or the seed conforms to a different surface than the driver measures.");
    }
    const pred = o.resolvePred;
    const span = o.resolveSpanMm;
    for (const P of chains) {
      const moves: Array<[number, number, number]> = []; // index, newTh, newZ
      for (let i = 1; i + 1 < P.length; i += 1) {        // endpoints are junction/boundary anchors — never moved
        const p = P[i];
        // already on a domain edge: the snap below owns it, and moving it off re-creates the
        // micron-tall boundary sliver that snap exists to prevent.
        const xs = rRef * p.th;
        if (p.z <= snapMm || p.z >= H - snapMm || xs <= snapMm || xs >= rRef * TWO_PI - snapMm) continue;
        const a = P[i - 1]; const b = P[i + 1];
        const rMid = rAt(p.th, p.z);
        const eArc = rMid * dThRaw(a.th, b.th); const eZ = b.z - a.z;
        const L = Math.hypot(eArc, eZ);
        if (!(L > 1e-9)) { chainResolveRefused += 1; continue; }
        const pArc = -eZ / L; const pZ = eArc / L;       // unit perpendicular in (arc, z)
        const dth = (pArc * span) / Math.max(1e-6, rMid); const dz = pZ * span;
        const k = locateKinkRaw(rA, p.th - dth, p.z - dz, p.th + dth, p.z + dz, pred);
        // GUARD, transcribed: a kink found near a probe END is a DIFFERENT locus. Following it drags
        // the vertex across neighbouring geometry. Rejecting leaves the vertex exactly where it was.
        if (k === null || k.jump || !(Math.abs(2 * k.t - 1) < 0.5)) { chainResolveRefused += 1; continue; }
        const off = 2 * k.t - 1;
        moves.push([i, p.th + off * dth, p.z + off * dz]);
      }
      for (const [i, nth, nz] of moves) { P[i].th = nth; P[i].z = nz; chainResolved += 1; }
    }
  }

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
      if (i !== P.length - 1 && Math.hypot(rRef * (P[i].th - q.th), P[i].z - q.z) < chainDecimateMm) { decimated += 1; continue; }
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
  // S23 — the ACROSS spacing the design PLACED beside this segment, i.e. the radius of its own innermost
  // offset ring. Read only by the field infill (3g), which uses it as a clearance floor: a free point
  // closer to a constraint than the design's own innermost ring is a point the design deliberately did
  // not place, and it makes the thin lens the across rule exists to forbid.
  const segAcr: number[] = [];
  const recordClearanceSegment = (
    ax: number, ay: number, bx: number, by: number, across: number,
  ): number => {
    const si = segAx.length;
    segAx.push(ax); segAy.push(ay); segBx.push(bx); segBy.push(by); segAcr.push(across);
    for (let gx = Math.floor(Math.min(ax, bx) / BS); gx <= Math.floor(Math.max(ax, bx) / BS); gx += 1) {
      for (let gy = Math.floor(Math.min(ay, by) / BS); gy <= Math.floor(Math.max(ay, by) / BS); gy += 1) {
        const k = `${gx},${gy}`;
        const l = segBuckets.get(k);
        if (l === undefined) segBuckets.set(k, [si]); else l.push(si);
      }
    }
    return si;
  };
  for (const C of chains2) {
    for (let i = 0; i + 1 < C.length; i += 1) {
      const ax = rRef * C[i].th; const ay = C[i].z; const bx = rRef * C[i + 1].th; const by = C[i + 1].z;
      recordClearanceSegment(ax, ay, bx, by, Math.min(C[i].across, C[i + 1].across));
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
  const constraintOwners: string[][] = [];
  const pushConstraint = (a: number, b: number, obligationIds: readonly string[]): void => {
    if (a === b) return;
    constraints.push([a, b]);
    constraintOwners.push([...new Set(obligationIds)].sort());
  };
  const replaceConstraints = (
    edges: Array<[number, number]>, owners: string[][],
  ): void => {
    if (edges.length !== owners.length) {
      throw new Error(`ALIGNED SEED: constraint ledger desynchronised (${edges.length} edges / ${owners.length} owners).`);
    }
    constraints.length = 0;
    constraintOwners.length = 0;
    for (let i = 0; i < edges.length; i += 1) {
      constraints.push(edges[i]);
      constraintOwners.push([...new Set(owners[i])].sort());
    }
  };
  const chainIdx: number[][] = [];
  const seamZ = new Set<number>();
  const ownerChain: number[] = []; const ownerIdx: number[] = []; const ownerFixed: boolean[] = [];
  // S23-T — THE WELD DISCRIMINATOR, registered in the R4 close-out as *"count hubs whose incident chain
  // vertices carry two different `ownerChain` values"*. `ownerChain` alone CANNOT answer it: line 844 only
  // writes the FIRST claimer and never overwrites, so a point two chains welded into is indistinguishable
  // from a point one chain placed. This map records the SET of chains that welded into each point id, and
  // it is the whole of the instrument. **Built ONLY under `PF_S10_SEED_DIAG`; `null` otherwise and no
  // branch reads it** — the same discipline as the R4 provenance markers 30 lines below.
  const weldOwners: Map<number, Set<number>> | null = process.env.PF_S10_SEED_DIAG === '1' ? new Map() : null;
  let ci = -1;
  for (const C of chains2) {
    ci += 1;
    const ids: number[] = [];
    const pointIds = new Array<number>(C.length).fill(-1);
    let pi = -1;
    for (const p of C) {
      pi += 1;
      if (o.banned !== undefined && o.banned.has(`${ci}:${pi}`) && p.fixed !== true) { banApplied += 1; continue; }
      const th = Math.min(TWO_PI, Math.max(0, p.th));
      // FIXED (crossing) points always weld at minSep: two crossings that close together are one junction,
      // and merging them is only reachable inside a junction disk. Historically NON-fixed points used the
      // same radius too — cross-chain, which per-chain decimation cannot see. S31 R4 may reduce only that
      // non-fixed radius; the default remains minSep. Measured caution: preserving two loci only 9 um apart
      // once produced an AR-175 facet, so every R4 arm remains behind the seed shape gate.
      const id = addPt(th, p.z, p.fixed === true ? minSepMm : chainWeldMm);
      while (ownerChain.length <= id) { ownerChain.push(-1); ownerIdx.push(-1); ownerFixed.push(false); }
      if (ownerChain[id] < 0) { ownerChain[id] = ci; ownerIdx[id] = pi; ownerFixed[id] = p.fixed === true; }
      if (weldOwners !== null) {
        let sset = weldOwners.get(id);
        if (sset === undefined) { sset = new Set<number>(); weldOwners.set(id, sset); }
        sset.add(ci);
      }
      ids.push(id);
      pointIds[pi] = id;
      if (th <= 1e-12 || th >= TWO_PI - 1e-12) seamZ.add(p.z);
    }
    chainIdx.push(pointIds);
    for (let i = 0; i + 1 < ids.length; i += 1) {
      pushConstraint(ids[i], ids[i + 1], [chainObligations[ci]]);
    }
  }
  // S23B-R / R4 — PROVENANCE MARKERS. Four integers, written where each emitter stage ends and read ONLY
  // by the `PF_S10_SEED_DIAG` failure block at stage 5. THE REASON THEY EXIST: the R2 probe located the
  // lost segment to the micron but could not say WHICH EMITTER placed either endpoint, and "same rim, same
  // pairing" as the two non-manifold edges was an INFERENCE, not a measurement. A fix registered on an
  // inferred mechanism is the guess this campaign keeps refusing to make. No branch reads these.
  const provChainEnd = px.length;
  const provChainConstraints = constraints.length;

  // S23-T — THE WELD CENSUS, EMITTED. One line per multi-chain weld, in the chart the hub census reports
  // its own loci in, so the two lists can be matched by an outside reader with no inference in between.
  if (weldOwners !== null) {
    let multi = 0; let worst = 1;
    const rows: string[] = [];
    for (const [id, s] of weldOwners) {
      if (s.size > 1) { multi += 1; if (s.size > worst) worst = s.size; }
      // EVERY welded chain point is emitted, not only the multi-chain ones, because the discriminator is
      // worthless without its own negative control: "hubs sit near a chain vertex" is vacuous at a
      // junction, and only the SINGLE-chain population can show whether "two different owners" separates
      // anything. The reader gets both lists from one dump and does not have to trust a threshold.
      rows.push(`  WELDPT ${pth[id].toFixed(6)} ${pz[id].toFixed(6)} ${s.size}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  WELDDIAG minSepUm ${(minSepMm * 1000).toFixed(2)}  chainPts ${chainPts}  distinctIds ${weldOwners.size}`
      + `  MULTI-CHAIN WELDS ${multi}  worst-fan ${worst}`);
    // eslint-disable-next-line no-console
    for (const r of rows) console.log(r);
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
  // ── 3b-S23. THE BOUNDARY DENSIFICATION. Default OFF (`reconField` undefined) and then this block is
  //    arithmetically absent. Without it the four domain sides stay at the DESIGNED pitch while the
  //    interior is rebuilt at the field's, and every element touching a rim or the seam spans that
  //    mismatch — which is the rim row the campaign already carries, manufactured on purpose.
  //    THE SEAM IS DENSIFIED AS A z-SET, NOT AS TWO COLUMNS. Both columns are then built from the SAME
  //    sorted list below, so they carry an identical z set BY CONSTRUCTION — the S11 lesson, unchanged:
  //    a seam column vertex welds to its twin in 3-D, and a z present on one side only is a crack.
  let reconBoundaryPts = 0;
  if (o.reconField !== undefined) {
    const base = [...seamZ].filter((z) => z >= 0 && z <= H).sort((a, b) => a - b);
    for (let i = 0; i + 1 < base.length; i += 1) {
      const zb = base[i + 1];
      let z = base[i];
      for (let g = 0; g < 200000; g += 1) {
        // THE STEP IS FLOORED AT THE CONDITIONING RADIUS, NOT AT THE WELD. MEASURED, at full density on
        // the first probe: a densified boundary row placed 18 um from a chain-crossing vertex that sat
        // 2.3 um off the rim CONSTRAINT produced a configuration cdt2d triangulated inconsistently — TWO
        // NON-MANIFOLD EDGES at th 2.4344, z 119.98, and the watertight assertion caught it. Stage 3e
        // re-routes a constraint through any vertex within `pslgEpsMm` of its interior, so anything this
        // side of 1.5x that radius is a sliver waiting to be constrained into existence. Every other
        // free-point emitter in this file already floors its clearance there; so does this one now.
        const step = Math.max(o.pslgEpsMm * 1.5, o.reconBeta * o.reconField.hAt(0, z));
        const zn = z + step;
        if (zn >= zb - step) break;
        seamZ.add(zn); reconBoundaryPts += 1;
        z = zn;
      }
    }
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
  // the two RIMS, at the field's own pitch. Same rule as the seam, walked in arc length; the existing
  // rim row is left exactly where it is and this only fills the gaps between its points.
  if (o.reconField !== undefined) {
    for (const zr of [0, H]) {
      const on: number[] = [];
      for (let i = 0; i < pth.length; i += 1) if (Math.abs(pz[i] - zr) <= 1e-9) on.push(pth[i]);
      on.sort((a, b) => a - b);
      for (let i = 0; i + 1 < on.length; i += 1) {
        const xb = rRef * on[i + 1];
        let x = rRef * on[i];
        for (let g = 0; g < 200000; g += 1) {
          const th = x / rRef;
          const step = Math.max(o.pslgEpsMm * 1.5, o.reconBeta * o.reconField.hAt(th, zr));
          const xn = x + step;
          if (xn >= xb - step) break;
          const thn = xn / rRef;
          // the point clearance is floored at the same conditioning radius, for the same measured reason
          const gp = Math.max(step * 0.5, o.pslgEpsMm * 1.5);
          if (!nearPt(thn, zr, gp) && !nearSeg(thn, zr, Math.max(step * 0.55, o.pslgEpsMm * 1.5))) {
            addPt(thn, zr); reconBoundaryPts += 1;
          }
          x = xn;
        }
      }
    }
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
  const addFree = (th: number, z: number): number => {
    if (o.banned !== undefined && o.banned.has(freeKey(th, z))) { banApplied += 1; return -1; }
    return addPt(th, z);
  };
  // 3c. offset ("short across") points hugging each locus — POINTS, not constraints: they pull the
  //     triangulation into thin elements along the locus without adding an edge that could cross anything.
  //     SKIPPED INSIDE A JUNCTION DISK, which is precisely where the normal has no meaning.
  let offsetPts = 0;
  const jn = art.junctions;
  const inDisk = (th: number, z: number): boolean => {
    for (const j of jn) {
      const dth = dThRaw(canonTheta(th), j.theta);
      const radiusMm = patchExclusions.effectiveRadiusByJunction.get(j.id) ?? j.radiusMm;
      if (Math.hypot(rRef * dth, z - j.z) <= radiusMm) return true;
    }
    return false;
  };
  const inRawDisk = (th: number, z: number): boolean => {
    for (const j of jn) {
      const dth = dThRaw(canonTheta(th), j.theta);
      if (Math.hypot(rRef * dth, z - j.z) <= j.radiusMm) return true;
    }
    return false;
  };
  let patchExclusionReclaimedChainPts = 0;
  // S19 — THE PROGRESSION, not a single ring. MEASURED REASON (S19 decomposition, 2026-07-31): 52% of the
  // large tilted offenders sit in [100, 400] um and another 36% in [400, ~650] um, i.e. in the EMPTY BAND
  // between the innermost ring and the background lattice. With one ring at 50 um and `clearMm` = 330 um
  // that band is 280 um of nothing, and the first background point beyond it sits on a 1,101 um pitch — so
  // a chord from the ring to the lattice crosses the whole flank, which turns over in 106 um, with no
  // intermediate vertex. Those chords ARE the operator's blades: mm-scale edges, 85-95 deg off the analytic
  // normal, parametric AR in the thousands, 3-D AR under the cap and therefore invisible to every gate.
  // THE STRIDE IS WHAT KEEPS IT AFFORDABLE AND IT IS DERIVED, NOT CHOSEN: ring j sits at across*g^j and its
  // radial spacing grows like g^j, so emitting it every g^j-th chain point keeps the element ASPECT
  // constant at every radius while the point cost falls geometrically — sum(g^-j) converges instead of
  // multiplying the ring count.
  let offsetRingsUsed = 0;
  interface CollarNode {
    chainPoint: number;
    ring: number;
    side: 1 | -1;
    stride: number;
    id: number;
    radiusMm: number;
  }
  interface CollarChain {
    rows: Map<string, CollarNode[]>;
    bySite: Map<string, CollarNode>;
  }
  const collarChains: CollarChain[] = [];
  for (const C of chains2) {
    const collar: CollarChain = { rows: new Map(), bySite: new Map() };
    collarChains.push(collar);
    for (let ci2 = 0; ci2 < C.length; ci2 += 1) {
      const p = C[ci2];
      const excluded = inDisk(p.th, p.z);
      if (!excluded && patchExclusions.selectedIds.size > 0 && inRawDisk(p.th, p.z)) {
        patchExclusionReclaimedChainPts += 1;
      }
      if (excluded) continue;
      const J = Math.max(1, Math.round(o.acrossRings));
      for (let j = 0; j < J; j += 1) {
        const rj = p.across * (o.acrossGrade ** j);
        if (j > 0 && rj > o.acrossMaxMm) break;
        // HISTORICAL STRIDE CAP 4. Uncapped it is g^j, which keeps the element aspect exactly constant but
        // sends the OUTER rings to a 6.8 mm along-spacing — chords that long run along a locus that curves,
        // and the proximity guards test points, not chord crossings. S32 may only LOWER this cap behind a
        // research flag; 4 keeps the byte-compatible control and 2/1 densify the many-to-one collar edge.
        const stride = Math.min(o.acrossStrideMax, Math.max(1, Math.round(o.acrossGrade ** j)));
        if (ci2 % stride !== 0) continue;
        if (j + 1 > offsetRingsUsed) offsetRingsUsed = j + 1;
        for (const sgn of [1, -1]) {
          const th = p.th + (sgn * rj * p.nx) / rRef;
          const z = p.z + sgn * rj * p.ny;
          if (th < 0 || th > TWO_PI || z < 0 || z > H) continue;
          if (nearPt(th, z, rj * 0.35)) continue;
          // The segment clearance is FLOORED at 1.5x the PSLG conditioning radius when the across rule is
          // live. A no-op on the OFF path by arithmetic, not by measurement: there across >= acrossBase /
          // fieldRange = 192.6 um, so across*0.55 >= 105.9 um >> 1.5*pslgEps = 30 um and the max never binds.
          if (nearSeg(th, z, o.acrossAbs ? Math.max(rj * 0.55, o.pslgEpsMm * 1.5) : rj * 0.55)) continue;
          const id = addFree(th, z); offsetPts += 1;
          if (o.acrossStructured && id >= 0) {
            const side = sgn as 1 | -1;
            const node: CollarNode = { chainPoint: ci2, ring: j, side, stride, id, radiusMm: rj };
            const rowKey = `${j}:${side}`;
            const row = collar.rows.get(rowKey);
            if (row === undefined) collar.rows.set(rowKey, [node]); else row.push(node);
            collar.bySite.set(`${ci2}:${j}:${side}`, node);
          }
        }
      }
    }
  }
  const provOffEnd = px.length;                                   // R4 provenance marker (see 3a)

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
  // ── S21 — THE GRADING FIX. `patch interior sizing = min(polar grading, sizing field)`. ─────────────
  //
  // THE DEFECT IT REPAIRS, MEASURED IN S18 AND NOT RE-DERIVED HERE: the polar set REPLACES the background
  // lattice inside a routed disk, so where the driver would have refined HARDER than the polar grading,
  // routing COSTS resolution. Disk #25's congruent copy went **0.008 -> 31.429 um** and its carrier went
  // from edges 86.2/133.8/215.6 um (AR 10.07) to 185.6/601.3/784.5 um (AR 30.58). Routing must never
  // under-resolve what the driver would have refined; an arm without this fix is invalid, not merely worse.
  //
  // HOW IT IS APPLIED, AND WHY THIS SHAPE RATHER THAN A REWRITE OF THE PROGRESSION. The polar radii are
  // left EXACTLY where they were and the fix only INSERTS between them. Per polar ring the field's own
  // answer `hLoc` is compared with that ring's radial spacing `dsPolar`; `nSub = ceil(dsPolar / hLoc)`
  // sub-rings then span the same gap, and the arc count is scaled by the SAME factor so the elements stay
  // as isotropic as the M-derivation above makes them. **nSub === 1 wherever the field does not bind, and
  // then every radius, every M, every phase and every guard radius is arithmetically what it was** — the
  // fix is MONOTONE-DOWNWARD exactly like the S15 across rule: it can only refine, never move or coarsen.
  //
  // `hLoc` IS A MINIMUM OVER THE RING, not a value at a point, because the requirement is that the disk is
  // never coarser than the field ANYWHERE on it. Four cardinal probes x both chart directions; the solve is
  // the same `solveHDir` the across rule uses, at the same `tolMm`, so no new sizing quantity enters.
  let patchPts = 0; let patchRings = 0; let patchRefusedPt = 0; let patchRefusedSeg = 0;
  let patchOuterSectors = 0; let patchOuterUncoveredSectors = 0;
  let patchFieldBoundRings = 0; let patchSubRings = 0; let patchSubCapped = 0; let patchWorstRatio = 1;
  const patchEmitted: PatchRegion[] = [];
  /** the sizing field's own answer at radius `r` about a routed centre — min over 4 probes x 2 directions. */
  const patchFieldAt = (cth: number, cz: number, r: number): number => {
    let h = Infinity;
    for (let p = 0; p < 4; p += 1) {
      const a = (Math.PI / 2) * p;
      const th = canonTheta(cth + (r * Math.cos(a)) / rRef);
      const z = cz + r * Math.sin(a);
      if (z < 0 || z > H) continue;
      const rr = rAt(th, z);
      const hA = solveHDir(rA, th, z, 1, 0, rr, o.tolMm, 14, 2e-4, 4, bump);
      const hB = solveHDir(rA, th, z, 0, 1, rr, o.tolMm, 14, 2e-4, 4, bump);
      h = Math.min(h, hA, hB);
    }
    return Number.isFinite(h) ? h : Infinity;
  };
  for (const reg of o.patchRoute ?? []) {
    const R = Math.min(reg.radiusMm, o.patchMaxMm);
    const rIn = Math.min(o.patchInnerMm, R * 0.5);
    if (!(R > 0) || !(rIn > 0)) continue;
    const K = Math.max(1, Math.ceil(Math.log(R / rIn) / Math.log(o.patchGrade)));
    const M0 = Math.max(6, Math.round(o.patchM));
    let emittedHere = 0;
    let outerSectorsHere = 0; let outerUncoveredHere = 0;
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
      const dsPolar = Math.max(1e-6, r - prev);                  // this ring's own radial spacing
      // ── THE FIX: min(polar grading, sizing field), as a refinement factor on the SAME progression ──
      // THE FIELD IS READ THROUGH THE SAME FLOOR THE REST OF THE SEED USES, AND THAT CLAUSE IS
      // LOAD-BEARING RATHER THAN COSMETIC. `acrossAbs` places `max(acrossMinMm, hAc)` — it never goes
      // below 50 um — so an unfloored patch would be resolving the SAME surface an order finer than the
      // chains beside it. Measured on the first probe of this arm: unfloored, the field asks for ~15 um
      // against a 0.56 mm outer polar spacing (ratio 36.44x), the emitter tries to fill 1.5 mm disks at
      // that pitch, and cdt2d dies in `mergeHulls` on the resulting point set. Floored, the routed disk is
      // never coarser than the field AND never finer than the seed's own established resolution.
      const hLoc = Math.max(o.acrossMinMm, patchFieldAt(reg.theta, reg.z, r));
      const ratio = dsPolar / Math.max(1e-9, hLoc);
      if (ratio > patchWorstRatio) patchWorstRatio = ratio;
      // THE WELD IS THE HARD FLOOR ON REFINEMENT, AND IT IS MEASURED RATHER THAN ASSUMED. `addPt` welds
      // anything within `weldMm` (2 um), so a sub-ring spacing below ~3x that collapses whole rings onto a
      // handful of surviving points and hands cdt2d a degenerate, near-collinear set — which it does not
      // refuse, it CRASHES in `mergeHulls`. Measured here on the first probe of this arm. So both the
      // radial subdivision AND the arc count are weld-bounded, and every clip is counted into
      // `patchSubCapped` so a routed disk that could NOT be brought down to the field's answer says so.
      const WELD_MIN = 3 * o.weldMm;
      let nSub = 1;
      if (ratio > 1) {
        patchFieldBoundRings += 1;
        const nWant = Math.ceil(ratio);
        const nWeld = Math.max(1, Math.floor(dsPolar / WELD_MIN));
        nSub = Math.min(nWant, Math.max(1, Math.round(o.patchSubMax)), nWeld);
        if (nSub < nWant) patchSubCapped += 1;
      }
      patchSubRings += nSub - 1;
      const ds = dsPolar / nSub;                                 // the EFFECTIVE radial spacing placed
      const gp = ds * 0.35; const gs = Math.max(ds * 0.55, o.pslgEpsMm * 1.5);
      for (let s = 1; s <= nSub; s += 1) {
        // s === nSub lands exactly on the polar radius `r`; nSub === 1 is that radius and nothing else.
        const rs = prev + (r - prev) * (s / nSub);
        // ARC COUNT. `nSub === 1` keeps `M0` EXACTLY — that is what makes the whole fix monotone-downward
        // and the unbound path arithmetically untouched. Where the field DID bind, the arc spacing is
        // matched to the effective radial spacing (isotropy, the same derivation as M0's) and then bounded
        // so no two neighbours on a ring are inside the weld.
        let M = M0;
        if (nSub > 1) {
          const mIso = Math.ceil((2 * Math.PI * rs) / ds);
          const mWeld = Math.max(6, Math.floor((2 * Math.PI * rs) / WELD_MIN));
          M = Math.max(6, Math.min(Math.max(M0, mIso), mWeld));
        }
        const phase = ((i + s - 1) % 2) * (Math.PI / M);         // stagger alternate rings
        patchRings += 1;
        for (let k = 0; k < M; k += 1) {
          const a = phase + (2 * Math.PI * k) / M;
          const th = canonTheta(reg.theta + (rs * Math.cos(a)) / rRef);
          const z = reg.z + rs * Math.sin(a);
          if (z < 0 || z > H) continue;
          const outerSector = i === K && s === nSub;
          if (outerSector) { patchOuterSectors += 1; outerSectorsHere += 1; }
          if (nearPt(th, z, gp)) { patchRefusedPt += 1; continue; }
          if (nearSeg(th, z, gs)) { patchRefusedSeg += 1; continue; }
          const refusedByRepairBan = o.banned?.has(freeKey(th, z)) === true;
          addFree(th, z); patchPts += 1; emittedHere += 1;
          if (outerSector && refusedByRepairBan) {
            patchOuterUncoveredSectors += 1;
            outerUncoveredHere += 1;
          }
        }
      }
    }
    const rawId = /^D(\d+)$/.exec(reg.id)?.[1];
    if (rawId !== undefined && patchExclusions.selectedIds.has(Number(rawId))) {
      if (outerSectorsHere === 0 || outerUncoveredHere > 0) {
        throw new Error(
          `ALIGNED SEED S30: ${reg.id} routed coverage is incomplete `
          + `(outer sectors ${outerSectorsHere}, uncovered ${outerUncoveredHere})`,
        );
      }
    }
    // PROVENANCE: declared at the ROUTED radius, which is what the emitter actually touched. A region
    // declared larger than the geometry it covers would exempt blades it did not create — the judge's
    // PROVENANCE-2 negative control (a mis-registered region exempts nothing) is the other direction of
    // the same discipline.
    if (emittedHere > 0) patchEmitted.push({ id: reg.id, theta: canonTheta(reg.theta), z: reg.z, radiusMm: R });
  }
  const provPatEnd = px.length;                                   // R4 provenance marker (see 3a)

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
  const provBgEnd = px.length;                                    // R4 provenance marker (see 3a)

  // ── 3g. S23 — THE EXTRACTED ABSOLUTE FIELD, AS FREE STEINER INFILL. Default OFF; with `reconField`
  //    undefined not one branch below is taken and the seed is arithmetically what it was.
  //
  // IT RUNS LAST, ON PURPOSE. Every declared emitter above has already placed its points under its own
  // declared rule — the traced chains, the graded offset rings, the routed polar disks, the 1,101/385
  // designed lattice. This stage only fills what the field says is still empty. That ordering is what
  // makes the rule MONOTONE-DOWNWARD in the S15 sense: where the field is coarser than what the design
  // already placed, NO candidate survives the minimum-distance test and the emitted set is bit-for-bit
  // the set the design emitted. The designed-lattice census is preserved by construction, not by luck.
  //
  // IT ADDS ZERO CONSTRAINTS, which is the S18 argument taken literally: constraint recovery is the
  // fragile part (an assertion that THROWS; S15/S16 Stage 0 watched it fail at 7,268 and 7,614 segments),
  // so the one thing a density change must not do is put more load on it.
  //
  // THE TEST IS A GREEDY MINIMUM-DISTANCE (maximal Poisson-disk) ACCEPTANCE at radius `beta * h`. Its
  // property is the one the shard census needs: no two points closer than `r` AND no empty disk of radius
  // `r + candidate pitch`, so the Delaunay of the result has bounded circumradius-to-edge everywhere the
  // field is smooth — and the field was made smooth on purpose, at `alpha = 1.0`, before it got here.
  let reconPts = 0; let reconCandidates = 0; let reconRefusedPt = 0; let reconRefusedSeg = 0;
  let reconFloorHits = 0; let reconMs = 0;
  if (o.reconField !== undefined) {
    const t3g = Date.now();
    const RF = o.reconField;
    const beta = Math.max(1e-3, o.reconBeta);
    const nCand = Math.max(1, Math.round(o.reconCand));
    const X_MAX = rRef * TWO_PI;
    // ── the multi-level point hash. ONE fixed cell size cannot serve a query radius that spans 30 um to
    //    1.1 mm: sized for the small end a coarse query scans thousands of cells, sized for the large end
    //    a fine query scans a cell holding hundreds of points. Levels at powers of two, every point in
    //    every level, and each query takes the smallest level whose cell covers its own radius — so every
    //    query is a 3x3 scan over cells that hold O(1) points at that query's own scale.
    const L0 = 0.03; const NL = 7;                       // 0.03 .. 1.92 mm
    const lvl: Array<Map<number, number[]>> = [];
    for (let l = 0; l < NL; l += 1) lvl.push(new Map<number, number[]>());
    const cellOf = (l: number): number => L0 * (1 << l);
    const keyOf = (x: number, y: number, s: number): number => (
      (Math.floor(x / s) + 4096) * 16384 + Math.floor(y / s)
    );
    const hx: number[] = []; const hy: number[] = [];
    const hInsert = (x: number, y: number): void => {
      const id = hx.length; hx.push(x); hy.push(y);
      for (let l = 0; l < NL; l += 1) {
        const k = keyOf(x, y, cellOf(l));
        const b = lvl[l].get(k); if (b === undefined) lvl[l].set(k, [id]); else b.push(id);
      }
    };
    // THE SEAM WRAPS AND THE CHART DOES NOT. theta = 0 and theta = 2pi are the SAME meridian, so a point
    // 20 um to the right of the seam and one 20 um to its left are NEIGHBOURS in the mesh and xMax apart
    // in the chart. Every point within `WRAP` of a seam gets a GHOST at the mirrored x, so the
    // minimum-distance test sees across the seam. Without this the infill manufactures a duplicate column
    // exactly where S11 spent a whole arm closing a crack.
    const WRAP = 2.0;
    const hInsertWrapped = (x: number, y: number): void => {
      hInsert(x, y);
      if (x < WRAP) hInsert(x + X_MAX, y);
      else if (x > X_MAX - WRAP) hInsert(x - X_MAX, y);
    };
    for (let i = 0; i < px.length; i += 1) hInsertWrapped(px[i], py[i]);
    const nearLocal = (x: number, y: number, r: number): boolean => {
      let l = 0; while (l < NL - 1 && cellOf(l) < r) l += 1;
      const s = cellOf(l); const M = lvl[l];
      const cx = Math.floor(x / s) + 4096; const cy = Math.floor(y / s);
      const r2 = r * r;
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
        const b = M.get((cx + dx) * 16384 + (cy + dy));
        if (b === undefined) continue;
        for (const j of b) { const ex = hx[j] - x; const ey = hy[j] - y; if (ex * ex + ey * ey <= r2) return true; }
      }
      return false;
    };
    // ── candidates, generated per FIELD CELL in row-major order — deterministic, and it lets the
    //    segment-clearance gather be amortised over the whole cell instead of paid per candidate.
    const cw = RF.dxMm;
    const cols = Math.max(1, Math.round(X_MAX / cw));
    const rows = Math.max(1, Math.round(H / cw));
    const dxc = X_MAX / cols; const dyc = H / rows;
    const KMAX = 96;
    const segLocal: number[] = [];
    for (let rr = 0; rr < rows; rr += 1) {
      const y0 = rr * dyc;
      for (let cc = 0; cc < cols; cc += 1) {
        const x0 = cc * dxc;
        // the cell's own demand: the MINIMUM over centre and corners, so the candidate pitch is fine
        // enough for the finest thing the cell is asked to carry, and the max sets the gather radius.
        let hMin = Infinity; let hMax = 0;
        for (const [ux, uy] of [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]] as Array<[number, number]>) {
          const hv = RF.hAt((x0 + ux * dxc) / rRef, y0 + uy * dyc);
          if (hv < hMin) hMin = hv;
          if (hv > hMax) hMax = hv;
        }
        const k = Math.max(1, Math.min(KMAX, Math.ceil((dxc * nCand) / hMin)));
        // the gather must cover the LARGEST clearance any segment can impose, which is now the design's
        // own across — bounded above by `acrossBase` — and not merely `beta * h`.
        const rGather = Math.max(beta * hMax, acrossBase);
        // gather the constraint segments that can possibly bind anywhere in this cell, ONCE
        segLocal.length = 0;
        {
          const pad = rGather + 1e-9;
          const gx0 = Math.floor((x0 - pad) / BS); const gx1 = Math.floor((x0 + dxc + pad) / BS);
          const gy0 = Math.floor((y0 - pad) / BS); const gy1 = Math.floor((y0 + dyc + pad) / BS);
          const seen = new Set<number>();
          for (let gx = gx0; gx <= gx1; gx += 1) for (let gy = gy0; gy <= gy1; gy += 1) {
            for (const si of segBuckets.get(`${gx},${gy}`) ?? []) {
              if (seen.has(si)) continue;
              seen.add(si);
              // keep only segments whose distance to the cell's box can be under the gather radius
              const bxLo = Math.min(segAx[si], segBx[si]); const bxHi = Math.max(segAx[si], segBx[si]);
              const byLo = Math.min(segAy[si], segBy[si]); const byHi = Math.max(segAy[si], segBy[si]);
              const ddx = Math.max(0, Math.max(bxLo - (x0 + dxc), x0 - bxHi));
              const ddy = Math.max(0, Math.max(byLo - (y0 + dyc), y0 - byHi));
              if (ddx * ddx + ddy * ddy > pad * pad) continue;
              segLocal.push(si);
            }
          }
        }
        for (let a = 0; a < k; a += 1) {
          const x = x0 + ((a + 0.5) * dxc) / k;
          for (let b = 0; b < k; b += 1) {
            const y = y0 + ((b + 0.5) * dyc) / k;
            const th = x / rRef;
            const hv = RF.hAt(th, y);
            const r = beta * hv;
            // STRICTLY INTERIOR TO ALL FOUR DOMAIN SIDES, at the same clearance the locus constraints get.
            // The four sides are CONSTRAINT CHAINS (3f) and `nearSeg` never tested against them — it is
            // built from the locus chains alone — so a candidate 20 um from the seam column would make
            // exactly the thin lens beside a constraint that the 0.55x clearance exists to forbid. The
            // seam and rim rows are densified at the field's own pitch by 3b-S23, so the band this leaves
            // is one element wide and is filled by the side's own points.
            const gsSide = Math.max(0.55 * r, o.pslgEpsMm * 1.5);
            if (y < gsSide || y > H - gsSide) continue;
            if (x < gsSide || x > X_MAX - gsSide) continue;
            reconCandidates += 1;
            if (hv <= RF.floorMm + 1e-9) reconFloorHits += 1;
            if (nearLocal(x, y, r)) { reconRefusedPt += 1; continue; }
            // THE CONSTRAINT CLEARANCE IS FLOORED AT THE DESIGN'S OWN INNERMOST RING, PER SEGMENT.
            // MEASURED, at full density on the first probe: with the clearance at 1.5*pslgEpsMm = 30 um
            // the infill placed free points 35-88 um from a chain whose own offset ring sits at 50 um,
            // and the triangle each made with two chain vertices 280-1160 um apart read aspect3 100-146.
            // 97 facets, ALL of them, and every one clustered on a 12-fold symmetric feature site — i.e.
            // a mechanism, not a tail. The floor is LOCAL (the across the design actually placed there),
            // not a global constant, which is the whole point of the absolute-field rule.
            const gsBase = Math.max(0.55 * r, o.pslgEpsMm * 1.5);
            let blocked = false;
            for (const si of segLocal) {
              const gs = Math.max(gsBase, segAcr[si]);
              const ux = segBx[si] - segAx[si]; const uy = segBy[si] - segAy[si];
              const l2 = ux * ux + uy * uy;
              let t = l2 < 1e-18 ? 0 : ((x - segAx[si]) * ux + (y - segAy[si]) * uy) / l2;
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const ex = x - (segAx[si] + t * ux); const ey = y - (segAy[si] + t * uy);
              if (ex * ex + ey * ey <= gs * gs) { blocked = true; break; }
            }
            if (blocked) { reconRefusedSeg += 1; continue; }
            // ACCEPT. The infill's own minimum distance is `r >= beta * floorMm` = 30 um, which is four
            // orders above `weldMm` (2 um), so `addPt`'s weld scan cannot fire and is not paid for.
            const idx = px.length;
            px.push(x); py.push(y); pth.push(th); pz.push(y);
            const gk = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
            const gb = hash.get(gk); if (gb === undefined) hash.set(gk, [idx]); else gb.push(idx);
            hInsertWrapped(x, y);
            reconPts += 1;
          }
        }
      }
    }
    reconMs = Date.now() - t3g;
  }

  // 3c-ter. S32 STRUCTURED FEATURE COLLAR, DEFAULT OFF.
  //
  // The historical collar points remain FREE Steiner points. That leaves cdt2d
  // free to connect an outer-ring vertex to an arbitrary run of inner-ring or
  // locus vertices, which is exactly the deterministic saw-tooth fan observed
  // in S30C1. This shadow changes CONNECTIVITY only: point placement has already
  // finished, then non-crossing ring rails and matched radial rungs are admitted
  // to the same PSLG. A candidate is rejected rather than repaired if it crosses
  // any traced/collar segment or passes through the conditioning disk of another
  // vertex. Therefore no collar edge can bend a feature constraint in stage 3e.
  let collarRailConstraints = 0;
  let collarRungConstraints = 0;
  let collarRefusedCrossing = 0;
  let collarRefusedInteriorPoint = 0;
  const collarConstraintKind = new Map<number, 'COLLAR-RAIL' | 'COLLAR-RUNG'>();
  if (o.acrossStructured) {
    const acceptedEdges = new Set<number>();
    const candidateCrossesRecorded = (a: number, b: number): boolean => {
      const ax = px[a]; const ay = py[a]; const bx = px[b]; const by = py[b];
      const seen = new Set<number>();
      for (let gx = Math.floor(Math.min(ax, bx) / BS); gx <= Math.floor(Math.max(ax, bx) / BS); gx += 1) {
        for (let gy = Math.floor(Math.min(ay, by) / BS); gy <= Math.floor(Math.max(ay, by) / BS); gy += 1) {
          for (const si of segBuckets.get(`${gx},${gy}`) ?? []) {
            if (seen.has(si)) continue;
            seen.add(si);
            if (segParams(ax, ay, bx, by, segAx[si], segAy[si], segBx[si], segBy[si]) !== null) return true;
          }
        }
      }
      return false;
    };
    const candidateHasInteriorPoint = (a: number, b: number): boolean => {
      const ax = px[a]; const ay = py[a]; const bx = px[b]; const by = py[b];
      const ux = bx - ax; const uy = by - ay; const l2 = ux * ux + uy * uy;
      if (l2 <= 1e-18) return true;
      const pad = o.pslgEpsMm;
      const seen = new Set<number>();
      for (let gx = Math.floor((Math.min(ax, bx) - pad) / CELL); gx <= Math.floor((Math.max(ax, bx) + pad) / CELL); gx += 1) {
        for (let gy = Math.floor((Math.min(ay, by) - pad) / CELL); gy <= Math.floor((Math.max(ay, by) + pad) / CELL); gy += 1) {
          for (const id of hash.get(`${gx},${gy}`) ?? []) {
            if (id === a || id === b || seen.has(id)) continue;
            seen.add(id);
            const t = ((px[id] - ax) * ux + (py[id] - ay) * uy) / l2;
            if (t <= 1e-9 || t >= 1 - 1e-9) continue;
            const ex = px[id] - (ax + t * ux); const ey = py[id] - (ay + t * uy);
            if (ex * ex + ey * ey <= pad * pad) return true;
          }
        }
      }
      return false;
    };
    const admitCollar = (
      a: number, b: number, across: number, kind: 'rail' | 'rung',
    ): void => {
      if (a < 0 || b < 0 || a === b) return;
      const key = a < b ? a * 33554432 + b : b * 33554432 + a;
      if (acceptedEdges.has(key)) return;
      if (candidateCrossesRecorded(a, b)) { collarRefusedCrossing += 1; return; }
      if (candidateHasInteriorPoint(a, b)) { collarRefusedInteriorPoint += 1; return; }
      acceptedEdges.add(key);
      collarConstraintKind.set(key, kind === 'rail' ? 'COLLAR-RAIL' : 'COLLAR-RUNG');
      pushConstraint(a, b, [`collar:${kind}:${key}`]);
      recordClearanceSegment(px[a], py[a], px[b], py[b], across);
      if (kind === 'rail') collarRailConstraints += 1; else collarRungConstraints += 1;
    };

    const outerRing = offsetRingsUsed - 1;
    for (let chain = 0; chain < collarChains.length; chain += 1) {
      const collar = collarChains[chain];
      for (const row of collar.rows.values()) {
        if ((o.acrossStructuredMode === 'outer' || o.acrossStructuredMode === 'outer-cell')
          && row[0]?.ring !== outerRing) continue;
        row.sort((a, b) => a.chainPoint - b.chainPoint);
        for (let i = 0; i + 1 < row.length; i += 1) {
          const a = row[i]; const b = row[i + 1];
          if (b.chainPoint - a.chainPoint !== a.stride) continue;
          admitCollar(a.id, b.id, Math.min(a.radiusMm, b.radiusMm), 'rail');
        }
      }
      if (o.acrossStructuredMode === 'rails' || o.acrossStructuredMode === 'outer') continue;
      for (const node of collar.bySite.values()) {
        if (o.acrossStructuredMode === 'outer-cell' && node.ring !== outerRing) continue;
        if (node.ring === 0) {
          admitCollar(chainIdx[chain]?.[node.chainPoint] ?? -1, node.id, node.radiusMm, 'rung');
          continue;
        }
        const inner = collar.bySite.get(`${node.chainPoint}:${node.ring - 1}:${node.side}`);
        if (inner !== undefined) admitCollar(inner.id, node.id, Math.min(inner.radiusMm, node.radiusMm), 'rung');
      }
    }
  }

  // 3f. the four domain sides as CONSTRAINT CHAINS (see 3b). Each is one segment between consecutive
  // points on that side, so nothing has to be "recovered" — the same pre-split discipline the loci use.
  let boundaryConstraints = 0;
  for (let boundaryChain = 0; boundaryChain < boundaryChains.length; boundaryChain += 1) {
    const chain = boundaryChains[boundaryChain];
    for (let i = 0; i + 1 < chain.length; i += 1) {
      if (chain[i] === chain[i + 1]) continue;
      pushConstraint(chain[i], chain[i + 1], [`boundary:${boundaryChain}`]);
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
  // S23B-R / R2 FOLLOW-UP — THE PASS CAP IS A DECLARED LEVER NOW, AND ITS DEFAULT IS 3, WHICH IS WHAT
  // THIS LINE ALWAYS WAS. Unset, this file is arithmetically what it was and the shipped seed is
  // byte-identical (proven: the grid-field control reproduces 382,576 / 763,965 / 13,220 exactly).
  // WHY IT EXISTS: this loop's own contract is "the PSLG is admissible BY CONSTRUCTION", and the pass
  // census MEASURED that it never reaches its fixed point — it is still splitting on the last allowed
  // pass in EVERY configuration tested, including the one that shipped. That is a standing defect in a
  // shipped path, and whether closing it clears the S23B-R recovery failure is a one-constant experiment
  // that deserves a lever rather than an edit.
  const COND_PASSES = Math.max(1, Math.round(Number(process.env.PF_S10_COND_PASSES ?? '3')));
  // S23B-R / R4 — THE DOCUMENTED PROJECTION, IMPLEMENTED, BEHIND A **DEFAULT-OFF** LEVER.
  // The correctness note six lines below has always described code that is not there: it says the blocker
  // is "PROJECT[ED] ONTO THE CONSTRAINT ... splitting at the FOOT leaves the constraint geometrically
  // UNCHANGED ... and moves only the blocker, by at most EPS", and `moved` is the counter its own exit
  // test reads. The foot was computed and discarded (`void fx; void fy;`) and `moved` was never written,
  // so the split was taken at the BLOCKER's own position: each sub-segment is a NEW line, off the parent
  // by the blocker's offset, which can acquire NEW blockers and NEW crossings. MEASURED consequences, both
  // on the record: the loop DOUBLES its list from ~pass 12 (16,683 -> 29,377,010 in 21 passes) and never
  // reaches the fixed point its comment claims; and on the arm's own seed it OSCILLATES between
  // (12913,93746) and (93746,93747), each a blocker 13.9 / 18.4 um inside the other, re-manufacturing the
  // segment that is then lost. With the projection ON, the split vertex is EXACTLY on the parent segment,
  // so every sub-segment is collinear with it and the pass is idempotent by construction.
  // A BOUNDARY vertex is NEVER moved: the two seam columns must carry an identical z set and a rim vertex
  // must stay at z=H exactly, so a point on a domain side is left where it is and only its split is taken.
  const COND_PROJECT = process.env.PF_S10_COND_PROJECT === '1';
  const onDomainSide = (i: number): boolean => (px[i] <= 0 || px[i] >= rRef * TWO_PI || py[i] <= 0 || py[i] >= H);
  const moveTo = (j: number, nx: number, ny: number): void => {
    const ocx = Math.floor(px[j] / CELL); const ocy = Math.floor(py[j] / CELL);
    const ncx = Math.floor(nx / CELL); const ncy = Math.floor(ny / CELL);
    if (ocx !== ncx || ocy !== ncy) {
      const ol = hash.get(`${ocx},${ocy}`);
      if (ol !== undefined) { const p = ol.indexOf(j); if (p >= 0) ol.splice(p, 1); }
      const k = `${ncx},${ncy}`; const nl = hash.get(k); if (nl === undefined) hash.set(k, [j]); else nl.push(j);
    }
    px[j] = nx; py[j] = ny; pth[j] = nx / rRef; pz[j] = ny;
  };
  let condProjected = 0;
  // S23B-R / R4 — PARENTAGE OF EVERY 3e SPLIT PRODUCT. Built ONLY under `PF_S10_SEED_DIAG`; the two maps
  // are `null` otherwise and every write below is inside `if (PROV !== null)`. It answers the one question
  // the R2 localisation could not: whether the lost segment is a TRACED LOCUS segment or a piece of one
  // that 3e manufactured, and which constraint it descends from.
  const PROV = process.env.PF_S10_SEED_DIAG === '1' ? new Map<number, number>() : null;   // child -> parent
  const provRootKind = new Map<number, string>();                                          // root  -> kind
  const provK = (a: number, b: number): number => (a < b ? a * 33554432 + b : b * 33554432 + a);
  if (PROV !== null) {
    for (let i = 0; i < constraints.length; i += 1) {
      const key = provK(constraints[i][0], constraints[i][1]);
      provRootKind.set(key, collarConstraintKind.get(key) ?? (i < provChainConstraints ? 'CHAIN' : 'BOUNDARY'));
    }
  }
  for (let condPass = 0; condPass < COND_PASSES; condPass += 1) {
    const EPS = o.pslgEpsMm;
    const out: Array<[number, number]> = [];
    const outOwners: string[][] = [];
    let moved = 0;
    for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex += 1) {
      const [a, b] = constraints[constraintIndex];
      const owners = constraintOwners[constraintIndex];
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
            if (COND_PROJECT && !onDomainSide(j)) {
              if (px[j] !== fx || py[j] !== fy) { moveTo(j, fx, fy); moved += 1; condProjected += 1; }
            } else { void fx; void fy; }
            hits.push([t, j]);
          }
        }
      }
      if (hits.length === 0) { out.push([a, b]); outOwners.push(owners); continue; }
      hits.sort((p, q) => p[0] - q[0]);
      constraintsConditioned += 1;
      let prev = a;
      const pk = PROV === null ? 0 : provK(a, b);
      for (const [, j] of hits) {
        if (j !== prev) {
          out.push([prev, j]);
          outOwners.push(owners);
          if (PROV !== null) PROV.set(provK(prev, j), pk);
        }
        prev = j;
      }
      if (prev !== b) {
        out.push([prev, b]);
        outOwners.push(owners);
        if (PROV !== null) PROV.set(provK(prev, b), pk);
      }
    }
    const grew = out.length !== constraints.length;
    replaceConstraints(out, outOwners);
    // S23B-R / R2 FOLLOW-UP — A PURE MEASUREMENT, GATED, CHANGING NOTHING. The R2 probe lost exactly one
    // constraint of 13-17 thousand on three separate rungs, and this loop is a named candidate: it is
    // capped at 3 passes and exits on "no split happened", so a blocker that only becomes interior after
    // the third pass is never split out. Whether that is what happened is a FACT, not a lead, and this
    // line is how it becomes one. No counter here is read by any branch.
    if (process.env.PF_S10_SEED_DIAG === '1') {
      // eslint-disable-next-line no-console
      console.log(`  3e PASS ${condPass}: constraints ${out.length}, grew=${grew}, projected ${moved}`
        + `${!grew && moved === 0 ? '  <- FIXED POINT REACHED, the pass cap did NOT bind' : ''}`
        + `${(grew || moved !== 0) && condPass === COND_PASSES - 1 ? '  *** STILL SPLITTING ON THE LAST ALLOWED PASS — THE CAP BOUND ***' : ''}`);
    }
    // Iterate to a fixed point: projecting a blocker can put it inside ANOTHER constraint's interior.
    if (!grew && moved === 0) break;
  }
  if (COND_PROJECT && process.env.PF_S10_SEED_DIAG === '1') {
    // eslint-disable-next-line no-console
    console.log(`  3e PROJECTION: ${condProjected} blockers moved onto their constraint (<= pslgEps = `
      + `${(o.pslgEpsMm * 1000).toFixed(1)} um each); domain-side vertices were never moved`);
  }
  // dedupe (two chains meeting at a junction can produce the same segment twice)
  {
    const seenE = new Map<number, number>();
    const out: Array<[number, number]> = [];
    const outOwners: string[][] = [];
    for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex += 1) {
      const [a, b] = constraints[constraintIndex];
      const k = a < b ? a * 33554432 + b : b * 33554432 + a;
      const previous = seenE.get(k);
      if (previous !== undefined) {
        outOwners[previous] = [...new Set([...outOwners[previous], ...constraintOwners[constraintIndex]])].sort();
        continue;
      }
      seenE.set(k, out.length);
      out.push([a, b]);
      outOwners.push(constraintOwners[constraintIndex]);
    }
    replaceConstraints(out, outOwners);
  }

  // ── 3h. S23B-R / R4 RE-DIAGNOSIS — THE PLANARITY CENSUS OF THE PSLG ACTUALLY HANDED TO cdt2d. ────
  // A PURE MEASUREMENT behind the seed's own `PF_S10_SEED_DIAG`; `xMap` is `null` otherwise and no branch
  // reads it. WHY IT EXISTS: cdt2d's precondition is a PLANAR straight-line graph — two constraints that
  // properly cross violate it, and the 2026-07-13 `upperIds` note measured that exact class (2,965 proper
  // crossings, 99.4% from one spanner family) crashing `mergeHulls`. The R2/R4 failures do not crash; they
  // lose EXACTLY ONE constraint of 13-17 thousand, which is what a triangulator does when it recovers one
  // arm of a crossing pair and cannot recover the other. Whether the lost segment is in such a pair is a
  // FACT, and this is how it becomes one. Stage 2 planarizes the CHAINS; nothing has ever checked the list
  // that leaves 3e.
  // Every proper crossing in a constraint list, bucketed by the chart cell the segment covers. ONE
  // predicate, shared by the guard below and the census after it, so the census cannot certify a
  // planarity the guard measured differently.
  const findProperCrossings = (cons: Array<[number, number]>): Array<[number, number]> => {
    const cbk = new Map<string, number[]>();
    for (let s = 0; s < cons.length; s += 1) {
      const [a, b] = cons[s];
      for (let gx = Math.floor(Math.min(px[a], px[b]) / BS); gx <= Math.floor(Math.max(px[a], px[b]) / BS); gx += 1) {
        for (let gy = Math.floor(Math.min(py[a], py[b]) / BS); gy <= Math.floor(Math.max(py[a], py[b]) / BS); gy += 1) {
          const k = `${gx},${gy}`; const l = cbk.get(k); if (l === undefined) cbk.set(k, [s]); else l.push(s);
        }
      }
    }
    const pairs: Array<[number, number]> = [];
    const seenX = new Set<number>();
    for (const [, list] of cbk) {
      for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
        const s = list[i]; const t = list[j];
        const pk = s < t ? s * 33554432 + t : t * 33554432 + s;
        if (seenX.has(pk)) continue;
        seenX.add(pk);
        const [a, b] = cons[s]; const [c, d] = cons[t];
        if (a === c || a === d || b === c || b === d) continue;
        if (segParams(px[a], py[a], px[b], py[b], px[c], py[c], px[d], py[d]) === null) continue;
        pairs.push([s, t]);
      }
    }
    return pairs;
  };

  // ── 3h. THE PSLG PLANARITY GUARD. **DEFAULT OFF** (`PF_S10_PLANARIZE` unset) — the shipped path is ──
  // arithmetically what it was, and the grid-field control proves it rather than asserting it.
  //
  // WHAT IT ENFORCES: cdt2d's own documented precondition, on the list actually handed to it. Stage 2
  // planarizes the CHAINS, in chain space, BEFORE the point set exists — and stage 3a's `addPt` then welds
  // at `minSepMm` (192.6 um here), which can annihilate the very crossing vertex stage 2 created, onto a
  // DIFFERENT existing point for each of the two chains that met there. Stage 3e then splits constraints
  // at the BLOCKER's own position rather than at the projected foot, so every sub-segment is a new line
  // that can cross a neighbour. **Both manufacture proper crossings AFTER the only planarization this file
  // has**, which is why the guard belongs here, at the last moment, and not earlier.
  //
  // THE SPLIT IS AT A SHARED VERTEX, computed ONCE from the first segment's own parametrisation and used
  // for both arms, welded only at `weldMm` — never at `minSepMm`, which is the radius that destroyed the
  // stage-2 crossing vertex in the first place. Sub-segments are collinear with their parent by
  // construction, so the pass cannot manufacture the defect it removes; it iterates to zero and reports
  // its residual rather than assuming one pass is enough. This is the 2026-07-13 `planarizeChartMM`
  // remedy applied at the seed's own cdt2d call site, and it is an INPUT-HYGIENE rule: the cdt2d library
  // is not touched.
  const PLANARIZE = process.env.PF_S10_PLANARIZE === '1';
  let planarSplits = 0; let planarPasses = 0; let planarResidual = 0; let planarPts = 0; let planarMs = 0;
  const planarFrom0 = px.length;
  if (PLANARIZE) {
    const tP = Date.now();
    const PLANAR_PASSES = Math.max(1, Math.round(Number(process.env.PF_S10_PLANAR_PASSES ?? '8')));
    for (planarPasses = 0; planarPasses < PLANAR_PASSES; planarPasses += 1) {
      const pairs = findProperCrossings(constraints);
      planarResidual = pairs.length;
      if (pairs.length === 0) break;
      const cut = new Map<number, Array<[number, number]>>();      // constraint index -> [param, vertex]
      for (const [s, t] of pairs) {
        const [a, b] = constraints[s]; const [c, d] = constraints[t];
        const r = segParams(px[a], py[a], px[b], py[b], px[c], py[c], px[d], py[d]);
        if (r === null) continue;
        const xx = px[a] + r[0] * (px[b] - px[a]); const yy = py[a] + r[0] * (py[b] - py[a]);
        const v = addPt(xx / rRef, yy, o.weldMm);
        if (v >= planarFrom0) planarPts += 1;
        for (const [si, pr] of [[s, r[0]] as const, [t, r[1]] as const]) {
          const [u, w] = constraints[si];
          if (v === u || v === w) continue;
          const l = cut.get(si); if (l === undefined) cut.set(si, [[pr, v]]); else l.push([pr, v]);
        }
      }
      if (cut.size === 0) break;
      const out: Array<[number, number]> = [];
      const outOwners: string[][] = [];
      for (let si = 0; si < constraints.length; si += 1) {
        const l = cut.get(si);
        if (l === undefined) { out.push(constraints[si]); outOwners.push(constraintOwners[si]); continue; }
        l.sort((p, q) => p[0] - q[0]);
        let prev = constraints[si][0];
        for (const [, v] of l) {
          if (v !== prev) {
            out.push([prev, v]);
            outOwners.push(constraintOwners[si]);
            planarSplits += 1;
          }
          prev = v;
        }
        if (prev !== constraints[si][1]) {
          out.push([prev, constraints[si][1]]);
          outOwners.push(constraintOwners[si]);
        }
      }
      const seenE = new Map<number, number>();
      const deduped: Array<[number, number]> = [];
      const dedupedOwners: string[][] = [];
      for (let outIndex = 0; outIndex < out.length; outIndex += 1) {
        const [a, b] = out[outIndex];
        const k = a < b ? a * 33554432 + b : b * 33554432 + a;
        const previous = seenE.get(k);
        if (previous !== undefined) {
          dedupedOwners[previous] = [...new Set([...dedupedOwners[previous], ...outOwners[outIndex]])].sort();
          continue;
        }
        seenE.set(k, deduped.length);
        deduped.push([a, b]);
        dedupedOwners.push(outOwners[outIndex]);
      }
      replaceConstraints(deduped, dedupedOwners);
    }
    planarMs = Date.now() - tP;
    if (process.env.PF_S10_SEED_DIAG === '1') {
      // eslint-disable-next-line no-console
      console.log(`  3h PSLG PLANARITY GUARD: ${planarPasses} pass(es), ${planarSplits} sub-segments from`
        + ` ${planarPts} new shared vertices, residual crossings ${planarResidual}, constraints now`
        + ` ${constraints.length}, ${planarMs} ms`
        + `${planarResidual === 0 ? '  <- PLANAR BY CONSTRUCTION' : '  *** RESIDUAL CROSSINGS REMAIN ***'}`);
    }
  }

  // ── 3i. S23B-R / R4 RE-DIAGNOSIS — THE PLANARITY CENSUS OF THE PSLG ACTUALLY HANDED TO cdt2d. ────
  // A PURE MEASUREMENT behind the seed's own `PF_S10_SEED_DIAG`; `xMap` is `null` otherwise and no branch
  // reads it. WHY IT EXISTS: cdt2d's precondition is a PLANAR straight-line graph — two constraints that
  // properly cross violate it, and the 2026-07-13 `upperIds` note measured that exact class (2,965 proper
  // crossings, 99.4% from one spanner family) crashing `mergeHulls`. The R2/R4 failures do not crash; they
  // lose EXACTLY ONE constraint of 13-17 thousand, which is what a triangulator does when it recovers one
  // arm of a crossing pair and cannot recover the other. Whether the lost segment is in such a pair is a
  // FACT, and this is how it becomes one. Stage 2 planarizes the CHAINS; nothing has ever checked the list
  // that leaves 3e.
  const xMap: Map<number, number[]> | null = process.env.PF_S10_SEED_DIAG === '1' ? new Map() : null;
  const xPairs: Array<[number, number]> = [];
  if (xMap !== null) {
    const tX = Date.now();
    for (const [s, t] of findProperCrossings(constraints)) {
      xPairs.push([s, t]);
      const ls = xMap.get(s); if (ls === undefined) xMap.set(s, [t]); else ls.push(t);
      const lt = xMap.get(t); if (lt === undefined) xMap.set(t, [s]); else lt.push(s);
    }
    // eslint-disable-next-line no-console
    console.log(`  3i PSLG PLANARITY CENSUS: ${constraints.length} constraints, ${xPairs.length} PROPER CROSSING PAIRS`
      + ` (${xMap.size} constraints involved) in ${Date.now() - tX} ms`
      + `${xPairs.length === 0 ? '  <- PLANAR' : '  *** NON-PLANAR — cdt2d PRECONDITION VIOLATED ***'}`);
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
  // S23B-R / R4 — WHICH EMITTER PLACED THIS POINT. The ranges are the provenance markers written at the
  // end of each emitter stage; `ownerFixed` is the seed's own crossing-split / chain-endpoint flag.
  const cls = (i: number): string => {
    if (i < provChainEnd) {
      const f = i < ownerFixed.length && ownerFixed[i] ? 'FIXED(crossing-split|chain-end)' : 'chain-vertex';
      return `CHAIN[${ownerChain[i] ?? -1}:${ownerIdx[i] ?? -1}] ${f}`;
    }
    if (i < freeFrom) return 'BOUNDARY(3b: seam col / rim row / recon densification)';
    if (i < provOffEnd) return 'FREE-OFFSET(3c)';
    if (i < provPatEnd) return 'FREE-PATCH(3c-bis)';
    if (i < provBgEnd) return 'FREE-LATTICE(3d)';
    return 'FREE-RECON-INFILL(3g)';
  };
  // S23B-R / R4 RE-DIAGNOSIS — EVERY CROSSING PAIR, RESOLVED AGAINST THE TRIANGULATION, ON PASSING RUNS
  // TOO. The census alone cannot separate the two things a non-planar PSLG can do: LOSE one arm (the S7
  // throw) or "recover" BOTH, which is a locally non-manifold triangulation reported as a clean seed.
  // The GRID field recovers 13,220 of 13,220 AND reads one crossing pair, so this distinction is not
  // hypothetical and printing it only on failure would have hidden it.
  if (xMap !== null && xPairs.length > 0) {
    for (const [s, t] of xPairs.slice(0, 8)) {
      const [a, b] = constraints[s]; const [c, d] = constraints[t];
      const r = segParams(px[a], py[a], px[b], py[b], px[c], py[c], px[d], py[d]);
      const rec = (u: number, v: number): string => (edgeSet.has(ek(u, v)) ? 'RECOVERED' : '*** LOST ***');
      // eslint-disable-next-line no-console
      console.log(`  3h CROSSING PAIR  (${a},${b}) ${rec(a, b)}  X  (${c},${d}) ${rec(c, d)}`
        + `  at chart (${(px[a] + (r?.[0] ?? 0) * (px[b] - px[a])).toFixed(6)},${(py[a] + (r?.[0] ?? 0) * (py[b] - py[a])).toFixed(6)})`
        + ` t=${(r?.[0] ?? -1).toFixed(4)} u=${(r?.[1] ?? -1).toFixed(4)}`);
      // eslint-disable-next-line no-console
      console.log(`       A ${cls(a)}  B ${cls(b)}   |   C ${cls(c)}  D ${cls(d)}`);
    }
  }
  if (recovered !== constraints.length && process.env.PF_S10_SEED_DIAG === '1') {
    const onSide = (i: number): string => {
      const d = [px[i], rRef * TWO_PI - px[i], py[i], H - py[i]];
      const nm = ['th=0', 'th=2pi', 'z=0', 'z=H'];
      let k = 0; for (let m = 1; m < 4; m += 1) if (d[m] < d[k]) k = m;
      return `${nm[k]} at ${(d[k] * 1000).toFixed(3)}um`;
    };
    // S23B-R / R4 RE-DIAGNOSIS — the RAW edge set, BEFORE the zero-chart-area filter. An edge present here
    // but absent from `edgeSet` was recovered by cdt2d and then dropped by this file's own sliver filter,
    // which is a DIFFERENT defect from a recovery failure and must not be attributed to cdt2d.
    const rawEdge = new Set<number>();
    for (const t of raw) { rawEdge.add(ek(t[0], t[1])); rawEdge.add(ek(t[1], t[2])); rawEdge.add(ek(t[2], t[0])); }
    for (let si = 0; si < constraints.length; si += 1) {
      const [a, b] = constraints[si];
      if (edgeSet.has(ek(a, b))) continue;
      // eslint-disable-next-line no-console
      console.log(`  UNRECOVERED (${a},${b}) chart A=(${px[a].toFixed(6)},${py[a].toFixed(6)}) B=(${px[b].toFixed(6)},${py[b].toFixed(6)}) len=${Math.hypot(px[b]-px[a],py[b]-py[a]).toExponential(3)}`);
      // eslint-disable-next-line no-console
      console.log(`     IN RAW cdt2d OUTPUT (pre-sliver-filter): ${rawEdge.has(ek(a, b)) ? 'YES — recovered then DROPPED by the chart-area filter' : 'NO — cdt2d never made it an edge'}`);
      {
        const xs = xMap === null ? [] : (xMap.get(si) ?? []);
        // eslint-disable-next-line no-console
        console.log(`     PROPER CROSSINGS with other constraints: ${xs.length}`);
        for (const t of xs.slice(0, 6)) {
          const [c, d] = constraints[t];
          const r = segParams(px[a], py[a], px[b], py[b], px[c], py[c], px[d], py[d]);
          // eslint-disable-next-line no-console
          console.log(`       X (${c},${d}) at t=${(r?.[0] ?? -1).toFixed(4)} u=${(r?.[1] ?? -1).toFixed(4)}`
            + ` chart X=(${(px[a] + (r?.[0] ?? 0) * (px[b] - px[a])).toFixed(6)},${(py[a] + (r?.[0] ?? 0) * (py[b] - py[a])).toFixed(6)})`
            + `  C ${cls(c)}  D ${cls(d)}  ${rawEdge.has(ek(c, d)) ? '[the CROSSER WAS recovered]' : '[the crosser was NOT recovered either]'}`);
        }
      }
      {
        // blockers still inside this constraint's interior — what 3e was supposed to have split out
        const ux = px[b] - px[a]; const uy = py[b] - py[a]; const l2 = ux * ux + uy * uy;
        const bl: string[] = [];
        for (let j = 0; j < px.length && bl.length < 6; j += 1) {
          if (j === a || j === b || l2 <= 1e-18) continue;
          const t = ((px[j] - px[a]) * ux + (py[j] - py[a]) * uy) / l2;
          if (t <= 1e-9 || t >= 1 - 1e-9) continue;
          const dd = Math.hypot(px[j] - (px[a] + t * ux), py[j] - (py[a] + t * uy));
          if (dd > o.pslgEpsMm) continue;
          bl.push(`${j}@t=${t.toFixed(4)} off=${(dd * 1000).toFixed(3)}um ${cls(j)}`);
        }
        // eslint-disable-next-line no-console
        console.log(`     BLOCKERS still within pslgEps of the INTERIOR (3e should have split these out): ${bl.length === 0 ? 'none' : bl.join(' | ')}`);
      }
      // eslint-disable-next-line no-console
      console.log(`     A ${a}: ${cls(a)}  nearest side ${onSide(a)}`);
      // eslint-disable-next-line no-console
      console.log(`     B ${b}: ${cls(b)}  nearest side ${onSide(b)}`);
      let k = ek(a, b); const chainUp: string[] = [];
      for (let g = 0; g < 8; g += 1) {
        const p = PROV === null ? undefined : PROV.get(k);
        if (p === undefined) break;
        const pa = Math.floor(p / 33554432); const pb = p - pa * 33554432;
        chainUp.push(`(${pa},${pb})`); k = p;
      }
      const kind = provRootKind.get(k);
      // eslint-disable-next-line no-console
      console.log(`     ORIGIN: ${chainUp.length === 0 ? 'THIS IS AN ORIGINAL CONSTRAINT (not produced by 3e)'
        : `3e SPLIT PRODUCT, ancestry ${chainUp.join(' <- ')}`}  root kind ${kind ?? 'UNKNOWN'}`);
      if (chainUp.length > 0) {
        const ra = Math.floor(k / 33554432); const rb = k - ra * 33554432;
        // eslint-disable-next-line no-console
        console.log(`     ROOT (${ra},${rb}) A=(${px[ra].toFixed(6)},${py[ra].toFixed(6)}) [${cls(ra)}] B=(${px[rb].toFixed(6)},${py[rb].toFixed(6)}) [${cls(rb)}] len=${Math.hypot(px[rb]-px[ra],py[rb]-py[ra]).toExponential(3)}`);
      }
      const nb: number[] = [];
      for (let j = 0; j < px.length; j += 1) {
        if (j === a || j === b) continue;
        if (Math.hypot(px[j] - px[a], py[j] - py[a]) < 0.5 || Math.hypot(px[j] - px[b], py[j] - py[b]) < 0.5) nb.push(j);
      }
      // eslint-disable-next-line no-console
      console.log(`     neighbours within 0.5mm: ${nb.length}  ${nb.slice(0, 8).map((j) => `${j}:(${px[j].toFixed(6)},${py[j].toFixed(6)})`).join(' ')}`);
      // the CLOSEST eight, with their class — the crowd that actually decides recoverability
      const near = nb.map((j) => ({ j, d: Math.min(Math.hypot(px[j] - px[a], py[j] - py[a]), Math.hypot(px[j] - px[b], py[j] - py[b])) }))
        .sort((u, v) => u.d - v.d).slice(0, 8);
      for (const { j, d } of near) {
        // eslint-disable-next-line no-console
        console.log(`       ${(d * 1000).toFixed(3)}um  ${j}:(${px[j].toFixed(6)},${py[j].toFixed(6)})  ${cls(j)}`);
      }
    }
  }
  if (recovered !== constraints.length && o.acrossStructured && process.env.PF_S10_SEED_DIAG !== '1') {
    const rawEdge = new Set<number>();
    for (const t of raw) { rawEdge.add(ek(t[0], t[1])); rawEdge.add(ek(t[1], t[2])); rawEdge.add(ek(t[2], t[0])); }
    for (const [a, b] of constraints) {
      const key = ek(a, b);
      if (edgeSet.has(key)) continue;
      // eslint-disable-next-line no-console
      console.log(`  S32 COLLAR UNRECOVERED ${collarConstraintKind.get(key) ?? 'NON-COLLAR'} (${a},${b})`
        + ` A=(${px[a].toFixed(6)},${py[a].toFixed(6)}) B=(${px[b].toFixed(6)},${py[b].toFixed(6)})`
        + ` len=${(Math.hypot(px[b] - px[a], py[b] - py[a]) * 1000).toFixed(3)}um`
        + ` raw=${rawEdge.has(key) ? 'YES-DROPPED' : 'NO'}`);
    }
  }
  if (recovered !== constraints.length) {
    throw new Error(
      `ALIGNED SEED: constraint recovery INCOMPLETE — ${recovered} of ${constraints.length} PSLG segments `
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
    constraintLedger: constraints.map((vertices, index) => ({
      vertices: [vertices[0], vertices[1]],
      obligationIds: [...constraintOwners[index]],
    })),
    suggestedBans: [...suggested],
    patches: patchEmitted,
    stats: {
      lociUsed, chains: chains2.length, chainPts, crossingsSplit, seamZ: seamZs.length,
      bgKept, bgDropped, offsetPts, points: pth.length, tris: tris.length,
      constraints: constraints.length, constraintsRecovered: recovered, constraintsConditioned,
      decimated, chainResolved, chainResolveRefused,
      boundarySnapped, degenerateDropped, banApplied, boundaryConstraints, dropRefused,
      edgesCrossingLocus, edgesTested,
      overCap, worstAR, worstParAR, negArea,
      alongMm: alongBase, acrossMm: acrossBase,
      acrossBoundPts,
      alongBoundPts,
      bowShortenedPts,
      turnBoundPts,
      offsetRingsUsed,
      collarRailConstraints,
      collarRungConstraints,
      collarRefusedCrossing,
      collarRefusedInteriorPoint,
      patchRegions: patchEmitted.length,
      patchPts,
      patchRings,
      patchRefusedPt,
      patchRefusedSeg,
      patchExclusionRegions: patchExclusions.effectiveRadiusByJunction.size,
      patchExclusionReclaimedChainPts,
      patchOuterSectors,
      patchOuterUncoveredSectors,
      patchFieldBoundRings,
      patchSubRings,
      patchSubCapped,
      patchWorstRatio,
      // reduce, not Math.min(...arr): the array is one entry per chain point (tens of thousands) and a
      // spread that long overflows the argument stack.
      acrossMinPlacedMm: acrossPlaced.length > 0 ? acrossPlaced.reduce((m, v) => (v < m ? v : m), Infinity) : acrossBase,
      acrossP50PlacedMm: acrossPlaced.length > 0
        ? acrossPlaced.slice().sort((x, y) => x - y)[Math.floor(acrossPlaced.length / 2)]
        : acrossBase,
      reconPts, reconCandidates, reconAlongBoundPts, reconRefusedPt, reconRefusedSeg, reconBoundaryPts, reconFloorHits, reconMs,
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
