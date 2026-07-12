# PROD-TIERC Fix Phase — Verdict & the Complete Answer to the 0.01mm Mandate

**Program:** E-2026-07-11-TIERC-HEADTOHEAD, kernel-fix phase (Addenda 1–15). **Closed 2026-07-12.**
This is the measured answer to the original question: *can we truly achieve 0.01mm precision across
every style, and if not, can we honestly define the goal?*

---

## The answer: two regimes, boundary now precise

### Regime 1 — true-0.01 ACHIEVED (flat-P1-tractable features)
- **Smooth styles** (FourierBloom, SuperellipseMorph, HarmonicRipple): already clean (PROD-BATCH).
- **Gothic + GeoStar** (K2 knife-edge count-unstable): **TRUE-0.01 fidelity, proven end-to-end
  against the exact analytic surface** via the C2 `surfaceSource:'analytic'` lever (committed
  6c71b850, default-off byte-identical). Gothic full patch: 18,045 tris, literal scan **0/18,045
  outliers, max 0.009952mm**, watertight. GeoStar: 5,071 tris, **0/5,071**, watertight. The blocker
  was never the mesher — it was measuring against a 512² sampler that chorded the crests (both styles
  read clean vs the sampler but 45–70% off analytic). Fix the target to the true surface and flat-P1
  triangles ride to tolerance. Honest cost: 1.2–1.8× tris, 8.1× build wall-time.

### Regime 2 — a UNIFIED, CHARACTERIZED flat-P1 FRONTIER (high-curvature relief features)
Gyroid's knee, DragonScales' sheet, and the Gothic/DS sliver concessions are **one problem, not
three**: flat-P1 triangles cannot follow a high-curvature relief feature at cell-bound facet sizes.
Proven, density-invariant, on both fidelity and quality axes:

| style | axis | floor | why (measured) |
|---|---|---|---|
| Gyroid | fidelity | Newton-worst **0.0247** | curve already at exact curvature-peak locus (closed-form); featureLevel=11 bounds cross-band cell; flat facet chords the 1350 mm⁻¹ knee. Cross-band refine WORSE, along-curve refine no-op (A3-relocate) |
| DragonScales | fidelity | **0.046** sheet cliff | density-invariant relief-chord cliff (θ-doubling makes it worse; champion §V11x) |
| DragonScales | quality | 96% <20° at tight sizing | body quadtree chasing relief to maxLevel 16 w/o converging (needles) + ring-riser facets thin by geometry (Finding 3) |
| Gothic/GeoStar | quality | 19% <20° | flat-P1 needle at the cusp (13 levers refuted, banked) |

**All density-invariant; all one root.** The unified true-0.01 path is a **curved (higher-order / PN)
element** that bends to follow the feature — a Phase-2 research program, not a kernel tweak.

## What's proven vs. frontier vs. closeable

- **PROVEN:** the region-orchestration architecture reproduces all 3 champion kernels through one
  general path (Gyroid K1 bit-exact, Gothic K2 CI-exact, DS chain builds + topology CLOSED, control
  clean). The composite gates harness (true-analytic + G3/G7) measures what no prior gate did, and
  found the honest floor below every celebrated win.
- **FRONTIER (curved-element Phase-2):** Gyroid knee fidelity, DS sheet fidelity, Gothic/DS quality
  slivers. Each floor measured, each mechanism named, one remaining mechanism (curved elements).
- **CLOSEABLE (engineering, not frontier):** Gyroid band-edge watertightness (A4-orient local
  seam-registry fix + A4b-v2 provenance holes — band-edge is a FUTURE path; production ships val=0
  clean); DS region-layer sizing/budget threading (body sizing + targetTriangles not threaded on the
  N-region chain path); DS body maxLevel knee-sweep (mitigation only).

## Fix-phase ledger (all committed)

| item | commit | result |
|---|---|---|
| C2 analytic-surface lever | 6c71b850 | Gothic true-0.01 mechanism |
| C2 full-patch confirm | 378dac63 | Gothic true-0.01 whole-patch (0/18045) |
| GeoStar C2 | 988964b8 | GeoStar true-0.01 (0/5071); lever generalizes |
| DS topology (Findings 1+2) | d4eeb5c8 | nonMan 3584→0 + orient 7168→0 |
| Winding diagnosis | c695e35c | Gyroid/DS winding DISTINCT |
| A4b snapMerge | 381febad | REFUTED-v1 (measured-negative) |
| A3 characterization | 26e4223a | knee = edge-class-localized; pins/density refuted |
| A3-relocate | b3546e81 | Gyroid fidelity frontier 0.0247 (flat-P1) |
| DS Finding 3 | d3ab714c | STRUCTURAL (flat-P1); tight sizing worse |

## Bottom line for the mandate

No exclusion classes are hidden. Every style's floor is **measured**. true-0.01 is **reached** for the
flat-P1-tractable majority (smooth + analytic-faithful knife-edges) and **honestly defined** as a
single named curved-element frontier for high-curvature relief — with exact mechanism, exact residual,
and exact next mechanism. The audit-first discipline turned "we think the champions are good" into a
complete, measured map of what is true, what is not, and the one mechanism that remains.

---

## CORRECTION (2026-07-12, featureAlignedCell cross-style eval) — the sliver "frontier" was over-broad

The Regime-2 table above lists "Gothic/GeoStar quality | 19% <20°" as a flat-P1/curved-element frontier.
**That is corrected:** the 19% is the K2 perfect-mesher/tierC refine-policy floor (the path C2 makes
true-0.01), NOT the production conforming path — which sits at **1.9% <20°** for Gothic. The two are
disjoint code paths; the "19%" figure also partly traces to a standalone research prototype
(`_pf_perfectMesherBruteLib`) never wired to `src/`. See `featureAlignedCell-crossstyle-verdict.md`.

The sliver "frontier" is **style/topology-conditional, mostly specific existing levers, not monolithic
curved-element work:**
- Production Gothic: the existing `featureAlignedCell` (default-off `__pfFeatureAlignedCells`) takes it
  1.9%→1.1% <20°, watertight held — a WIRING/VALIDATION win (confirm true-3D fidelity + GPU A/B, then
  flip default-on for Gothic).
- DragonScales: NO-OP for featureAlignedCell; its ring/body slivers live in FCT_PLAIN_FAN/PLAIN_QUAD
  ring-transition templates — a different, now-identified lever.
- SuperformulaBlossom: featureAlignedCell REGRESSES it (per-cell granularity wrong for diagonal chains;
  needs railLines).
- The genuine curved-element question, if any, narrows to the K2 literal-0 refine-policy floor alone.
