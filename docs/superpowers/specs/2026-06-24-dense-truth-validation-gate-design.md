# Dense-Truth Validation Gate — Design

**Date:** 2026-06-24
**Branch:** refactor/core-migration
**Status:** Design — pending user review → writing-plans
**Position:** Closing task of **sub-project 1** (the style-agnostic feature detector). Replaces the
partial-reference precision/recall gate (`validation.test.ts`) with a meaningful one, then the
sub-project gets its final whole-branch review.

## 1. Context & motivation

The detector (Tasks 1–7, committed through `4e2b596`) is built and hardened. Its validation gate
scores precision/recall against the **old per-style extractors** (`extractAnalyticFeatures`,
`FeatureLineGraph.ts`). Those extractors are **deliberately partial** — each emits only the loci its
bespoke warp machinery could pin (e.g. `extractVoronoi` emits only the foot level-set; DragonScales'
reference omits the real vertical scale edges; CelticTriquetra's is only 3 rim rings). So the
detector's `precision` against them is **structurally meaningless**: a correct generic detector that
finds *more* real features scores as "imprecise." The strict 0.9/0.9 gate reads 0/8 purely on this
artifact. Worse, the partial references hid a real over-firing risk: the fired-cell dilation
experiment produced a huge **recall** number that an adversarial probe showed was a tolerance-coverage
artifact (only 5–25% of the added edges sat on genuine signal) — the partial-reference gate could not
see it.

We need a reference that is **complete** (captures all the real features) and **independent of the
detector's machinery**, so precision and recall both mean what they say.

## 2. Goal & success criteria

A validation gate whose reference is the surface's **true feature set**, computed brute-force at high
resolution, against which the efficient detector is scored. The gate must:

- Make **precision meaningful**: a detected edge is "correct" iff it lies on a true feature locus;
  spurious edges (e.g. across flat inter-band wall) are penalized.
- Make **recall meaningful** against a *complete* truth: missing any true feature (e.g. fired-cell
  intermittency dropping rows of a real feature) lowers recall.
- Be **style-agnostic**: one truth extractor, no per-style code, scales to future styles.
- **Isolate the efficiency machinery**: because the truth uses the *same signal definitions* as the
  detector but *none* of its pipeline (§4), the gate measures whether the two-scale + fired-cell +
  connected-component + unifier pipeline faithfully reproduces the brute-force ideal of that
  definition. (It validates the ALGORITHM, not the feature *definition* — that is intended; the
  definition "feature = curvature ridge ∪ normal crease ∪ relief-boundary wall on a height field" is
  sound and out of scope to re-litigate.)
- Produce an **honest per-style table** + a **tolerance sweep** (no hiding behind one loose tol).

## 3. The reference: detector-matched thresholds, brute-force machinery

The truth uses the **same signal families and thresholds** the detector uses
(`kappaFloor = RIDGE_KAPPA_FACTOR/Rchar`, `minAngleDeg`, the generic relief indicator), so the gate is
the purest test of "does the efficient pipeline reproduce the high-resolution version of its own
feature definition." Independence comes entirely from using **none of the detector's machinery**:

| dimension | detector (under test) | dense truth (reference) |
|---|---|---|
| resolution | two-scale: coarse 40 → fine 120 | single-scale **uniform high res** (target 384–512², tractability-tuned) |
| cell selection | fired-cell mask + dilation | **none** — every cell evaluated |
| grouping | connected components + union-bbox fine pass | **none** — direct global trace |
| assembly | unifier (weld, dedup, saliency) | **none** — simple direct marching/thinning to loci |

So the truth is a genuinely separate computation; any infidelity in the detector's machinery
(intermittency, coarsening, over-firing, weld/dedup loss) shows up as a precision/recall gap.

## 4. The dense-truth extractor (new module `featureGraph/groundTruth.ts`)

`denseFeatureGroundTruth(sampler, opts): FeatureLocusSet` — given the same `SurfaceSampler` the gate
feeds the detector:

1. **Sample fields on a uniform high-res grid** (no fired-cell logic). Use the existing
   `sampleFeatureFields` at the high res. The sampler MUST be the pre-evaluated `GpuSurfaceSampler`
   grid (bilinear), grid resolution ≥ the truth sampling res, to avoid the known C0-crease curvature
   blow-up (feeding the raw analytic radius made κ explode to ~1e6/NaN at creases — Task-7 finding).
2. **Mark true-feature cells** by the three detector-matched signals: κ_max ≥ kappaFloor (ridge),
   normal-jump ≥ minAngleDeg (crease), relief-indicator sign-structure (wall).
3. **Trace to loci** with simple, obviously-correct primitives (`marchingSquaresZero` for the relief
   contour; a direct ridge/crease thinning) — NOT the detector's unifier/connected-component code.
4. Return the loci as polylines (a `FeatureLine[]`-compatible set) the gate metrics consume.

Keep it deliberately simple and readable — its correctness is load-bearing for the gate.

## 5. Metric + tolerance (anti-artifact)

- `recall` = fraction of **truth-locus** arclength within `tol` (mm, via uToMm/tToMm) of a detected edge.
- `precision` = fraction of **detected** arclength within `tol` of a truth locus.
- `tol` is **calibrated to the detector's placement accuracy**, ~1 fine cell (`uToMm/fineRes ≈ 1.8mm`),
  NOT the loose 2.5mm that enabled the dilation artifact. The gate reports a **tolerance sweep**
  (e.g. 0.5 / 1.0 / 1.8 / 2.5 mm) so placement fidelity is visible and no result hides on a tol cliff.
- Why this kills the artifact: the truth is now *complete*, so recall demands covering ALL real
  features; and because the truth (detector-matched threshold) also does NOT fire on genuinely flat
  inter-band wall, spurious edges there are FAR from any truth locus → they HURT precision. The exact
  failure the partial reference couldn't see is now penalized.

## 6. Validate the validator (cross-check)

Before trusting the gate's verdicts, validate the truth machinery itself: for styles with a trusted
**exact analytic locus** (Voronoi worley web, Gyroid TPMS formula, HexagonalHive), confirm the dense
truth reproduces that exact locus within tolerance. If the dense truth disagrees with a known-exact
locus, fix the extractor before trusting any per-style number.

## 7. Output & pass bar

- A per-style table: style → recall, precision, #detected-edges, #truth-loci, at the calibrated tol,
  plus the tol-sweep summary.
- Pass bar: recall ≥ 0.9 AND precision ≥ 0.9 at the calibrated tol. Styles that genuinely can't meet
  it are recorded with a specific, measured reason (not weakened). Honest partial is acceptable; a
  gamed pass is not.
- This becomes the real GO/NO-GO evidence for sub-project 2 (the mesher).

## 8. Scope, module, process

- New `src/renderers/webgpu/parametric/conforming/featureGraph/groundTruth.ts` + rewrite the
  reference half of `validation.test.ts` to use it. The detector code (Tasks 1–6) is unchanged —
  this is validation only.
- On `refactor/core-migration` (finish sub-project 1 here), then the **final whole-branch review** +
  finishing-a-development-branch.
- The old `extractAnalyticFeatures` references may be retained as a secondary cross-reference but are
  no longer the gate's truth.

## 9. Risks

- **Dense-truth correctness is load-bearing** → §6 cross-check against exact loci; keep the extractor
  simple.
- **Tolerance cliff / gameability** → §5 tol-sweep + calibration; complete truth penalizes flat-wall
  over-firing.
- **Cost** (high-res × 20 styles in vitest) → tune truth res for tractability; it's a validation gate,
  slower-than-production is acceptable; cap and report if a style is too slow.
- **Shared feature definition** (truth and detector both = curvature/normal/relief) → ACCEPTED and
  intended (§2): the gate validates the machinery's fidelity, not the definition.

## 10. Out of scope

- Re-litigating the feature *definition* (curvature/normal/relief on a height field).
- Sub-project 2 (the mesher) and sub-project 3 (production integration) — separate specs.
- Changing the detector's own thresholds (this is measurement, not tuning).
