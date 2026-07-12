# Existing-Asset Roadmap — the frontiers are mostly WIRE-AND-VALIDATE, not new research

**Date:** 2026-07-12. **Source:** two full corpus reviews (docs half + code half) + the P2.4 root-cause
finding. **Supersedes the "unified curved-element frontier" framing** in FIX-PHASE-VERDICT.md. The
corpus's own recent verdicts already dismantled it; this folds the scattered assets into one map.

## The meta-finding

Every open frontier I'd characterized as "needs a curved-element Phase-2 program" is, per the corpus,
mostly closeable by **existing, mostly-built, style/path-conditional levers**. Curved elements narrow
to **at most the K2 literal-0 residual sliver floor, "if at all."** The remaining work is dominated by
*wiring and validating existing code*, plus building the one designed-but-unbuilt seam (`levelAt`).

## Corrected per-frontier map

### Gyroid knee fidelity (0.0247) — SEAM BUILT, production close NOT reproduced (⚠ P2.5)
- **⚠ CORRECTION (P2.5, 2026-07-12):** the `levelAt` seam is now BUILT into the production kernel
  (committed `f86b9521`, byte-identical-off, watertight) — but driving cell-scoped escalation on the
  REAL 2:1-balanced quadtree did NOT close the knee: worst 0.02492→**0.01652** at **+113.8% tris**.
  P2.0's "+4.54% close" was a transition-free proxy the production `balance()`+CDT path does not
  reproduce; the mechanism is **unadjudicated** (anisotropic-B / straddle-sliver / coverage — the
  pre-escalation histogram already had L12–L15 outliers), and the **curved-element question is
  REOPENED** for this knee. Next = P2.5b (two-pass VERDICT-driven targeting + per-facet chord
  decomposition to locate the K2/curved boundary). See `tierc/P2.5-verdict.md`. The pre-P2.5 optimism below is SUPERSEDED.
- **Proven close (PROXY ONLY — see correction):** P2.0 cell-scoped local quadrisection → ≤0.01 at **+4.54% tris** (vs global bump
  +68.8%/worse). The `levelAt` seam (`P2.1-design.md`) is a ONE-field additive extension of shipped
  infra (`FeatureRefineSpec`, `intersects`, and `balance()` handles T-junctions FREE).
- **The criterion is the only blocker, and P2.1–P2.4 chased a dead end:** a build-time closed-form
  *predictor* keeps failing because (P2.4 root cause) the production base sizing field
  (`MetricSizingField`, 256² sampler FD curvature) **under-reads true curvature 1.2–20× broadly** near
  features, so no delta against it discriminates. **The corpus already has the right mechanism:
  VERDICT-DRIVEN refinement** — HexHive §V11u reached literal-0 by refining only Newton-flagged
  residual facets (where global refinement couldn't reach 0 at 9.99M); the tierC `refineToZeroOutliers`
  IS a verdict-driven loop (for K2). **Accelerated path: drive `levelAt` from a Newton verdict pass
  (two-pass build), not a build-time predictor** — proven to close; the predictor is a later perf
  optimization, not the unblock.

### DragonScales — NOT a monolithic cliff; three sub-problems, mostly existing levers
- **"0.046 sheet cliff" corrected:** decomposes into ~5,552 **body-wide SMOOTH-C2 sheet** chord-sag
  (all ≥2mm from rings) + ~3,200 near-ring **C0 lip** + <90 straddle tail; and V11f already corrected
  the "0.046 riser" to ~1mm (step-twin ruler refuted). Every DS refutation on record was GLOBAL/row-
  structured; **true per-facet local refinement (P2.0-style) on the smooth-C2 sheet is UNTESTED** and
  mechanistically predicted to converge fastest (smooth-C2 rate). So DS fidelity likely = local-refine
  the sheet + ring-embed the lip, NOT curved elements.
- **DS quality (production 19.2% <20°, dominant FCT_PLAIN_FAN 32,917 + PLAIN_QUAD 14,837 = 63%):** the
  fix is the **DS doubled-ring embedding + structured connectivity** (lab-proven, `champion-spec-ds`,
  never ported) — replaces the plain-fan ring-transition slivers with structured rows AND closes ring
  fidelity AND reclaims 6–8× density. ONE lever, three DS sub-problems. BLOCKED on the region-layer
  core (build item 4) being unbuilt (manifest is data-only). Part of the ring-riser sliver is geometric
  (thin-by-construction, density-invariant — `_gap_treadsq` forced treadSub=1).

### Gothic/GeoStar — true-0.01 VALIDATED (C2), quality is a wiring win
- **Fidelity:** the C2 `surfaceSource:'analytic'` lever (validated: 0/18045, 0/5071) is off only
  because the parent `__pfPerfectMesher` tier flag never flips (seam-share + rebaseline + the finite-
  needle concession) — the LEVER is proven. Shipping = product decision + seam-share, not research.
- **Quality:** the "19% <20°" was a THREE-path conflation (production conforming = 1.9%; the 19% is the
  K2 refine-policy floor + a `_pf_perfectMesherBruteLib` prototype never in src/). `featureAlignedCell`
  (built, `__pfFeatureAlignedCells`, default-off) takes production Gothic 1.9%→1.1% — needs only a
  true-3D fidelity confirm + GPU A/B before default-on. `flankBand.ts` (built, NOT wired) gives 4×/8×
  on the Gothic band frontier.

### The general sliver concession — style/path-conditional, mostly existing levers
- Gothic: `featureAlignedCell` (net-positive). SFB: `railLines` (the "band that spans cells" — built +
  threaded, behind the two-gate `__pfFeatureMesher`+`__pfByConstruction` corridor; per-cell grafts
  provably can't substitute). DS: doubled-ring embedding. **The registry's OWN recommended sliver
  closer is the surface-metric M=g/h² Ruppert loop** (`surfaceMetricField.ts`, research-only; the
  in-house kernel already beats production 2:1 by ~2° min-angle) — under-used because I framed slivers
  as curved-element work. Genuine curved-element (apexPn/crestStrip, research-only) reserved for the
  K2 residual needle floor alone.

### Anisotropic sizing — the pipe is wired, the field is isotropic
- Production sizes on SCALAR `principalCurvatureMax` (isotropic). The `AnalyticCurvatureFloor` path is
  wired end-to-end (`__pfConformingAnalyticFloor` → `MetricSizingField.curvatureFloor`), default-off
  (1.935× blanket cost + level-quantization-dead via Lipschitz grading). The true anisotropic mesher
  (`surfaceMetricField.ts` M=g/h², research-only) injects at the same `curvatureFloor` hook. warp-J²
  `max(1,Ju²)` (81× SpiralRidges) is wired for one style, named fleet-wide.

## Prioritized action list (merged from both reviews' shortlists)

1. **Gyroid knee — build the `levelAt` seam, drive it VERDICT-DRIVEN** (Newton-flag over-tol cells →
   escalate), not the build-time predictor. Proven mechanism (HexHive precedent), designed seam, shipped
   infra. Then verify on the DS smooth-C2 sheet (untested, predicted to close).
2. **Gothic quality — `featureAlignedCell` default-on** (confirm true-3D fidelity + GPU A/B). Lowest-
   effort quality win on the board.
3. **Ship the C2 win — Gothic/GeoStar true-0.01** (product decision on the finite-needle concession +
   seam-share integration; the lever is validated).
4. **DS — build the region-layer core (build item 4)** so the doubled-ring embedding can run (closes 3
   DS sub-problems). Heaviest, highest DS payoff.
5. **Gothic band — wire `flankBand.ts`** (4×/8×, built/tested/unwired) + GeoStar overlap check.
6. **SFB slivers — exercise `railLines`** on the default path (built + threaded, corridor-gated).
7. **Anisotropic sizing — prototype `surfaceMetricField` M=g/h²** via the wired `curvatureFloor` hook
   (the registry's own recommended quality closer).
8. **Curved elements (apexPn/crestStrip) — reserve for the K2 residual sliver floor only**, if pursued.

## Structural caveats
- The tierc region-layer core (RegionPlan/ChainSpec dispatch) is **data-only — build/dispatch unbuilt**
  (build item 4). The DS embedding + manifest dispatch need it first.
- The knee-**pin** kernel (`PinSeed`, §V11aa) was proven only on a non-production kernel at 5-spot scale;
  no `pin`/`injectedPoints` field exists in any production interface — NOT a near-term graft (unlike
  `levelAt`, which reuses shipped infra). The verdict-driven `levelAt` supersedes it for the knee.
- Newton-worst can overstate true-3D up to ~7× on tangled lattices; the Gyroid 0.0247 was `newtonNearest`
  on the bit-exact twin (likely honest) but worth a `bruteAnchoredRedPerp` confirm before treating it as
  the exact floor.
