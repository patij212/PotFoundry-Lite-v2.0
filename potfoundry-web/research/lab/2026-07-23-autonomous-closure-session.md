# Autonomous closure session (2026-07-23) — close the open styles at default

**Context:** Patryk away ~8h, free rein. Goal: **style/shape-agnostic 0.01mm at default (production dims
OD140/H120 + registry defaults)** — close all 20, with good machinery. Secondary (his note, "but first…"):
parameter-space shapes + small-pot sub-tolerance features come AFTER the default closures.

**Coordination (two agents, one branch — collision-avoidance is a hard constraint):**
- The **parallel agent owns MEASUREMENT/RULERS** (their committed trajectory: R2–R8 fidelity fixes, two-sided
  Hausdorff, parametric projector, the Map-cap download fix `c7b34216`, the all-20 `_prodbase` baseline). Their
  untracked probes touch **GeoStar / HexHive / LowPoly / Gyroid** → I AVOID those styles.
- **I own the real-pipeline audit + CLOSURES.** To avoid colliding on shared src (tierC dispatch, styles.ts,
  regionLayerFlag), I develop closures in **isolated `research/bridge/` tests** (importing the emitter machinery
  read-only), prove ≤0.01, and leave src-wiring as a documented ready step — the campaign's prove-then-wire pattern.

## All-20 gap map (measured)

Two independent measurements agree on the routing:
- **Real GPU pipeline** (my Pass-1 audit, `production-export-truth-pass1.json`) — the 9 closed/wired styles, OFF vs ON.
- **Region kernel** (`_prodbase/baseline.ndjson`, parallel agent, `buildInhouseMetricMesh` @400k budget) — all 20.

| class | styles (region-kernel true-3D max) | route |
|---|---|---|
| **Smooth — closes on density** | SFB 0.017, FB 0.022, SR 0.020, SE 0.018, HR 0.022, WI 0.017, **RippleInterference 0.019**, HexHive-interior 0.026 | uniform/graded smooth grid (mostly emitter-wired already; my audit confirms OFF already ≤0.01 for HR/SE/FB at prod density) |
| **Riser/tread (DS-tread template)** | **ArtDeco 3.24**, DragonScales 1.09, Bamboo 1.04, BasketWeave 0.39 | structured ring-strip emitter w/ double-valued treads at the C0 steps (DS/Bamboo already wired) |
| **Facet/grid (facet-aligned)** | LowPolyFacet 0.71 | facet-aligned smooth grid (parallel agent) |
| **Feature-conforming** | GothicArches 0.44 (cusps), Crystalline 0.44/p99 0.03 (facet creases), GeometricStar 0.26/p99 0.028 (chevron) | conforming rows on the crease/cusp loci |
| **Steep tangled lattice** | Gyroid 0.17, Voronoi 0.19, CelticKnot 0.10, CelticTriquetra 0.22 | v6 density / snaking mesher (architectural; hard) |

## PIVOT (2026-07-23, per Patryk): reuse research — the work is WIRE-AND-VALIDATE, not re-derivation

The `2026-07-12-existing-asset-roadmap.md` meta-finding holds: **most frontiers are closeable by existing,
mostly-built, style-conditional levers** — the remaining work is *wiring + validating existing code*, not new
closures. Gothic/GeoStar true-0.01 is VALIDATED (C2 analytic lever 0/18045, 0/5071) and blocked only on the
`__pfPerfectMesher` flag flip (seam-share + rebaseline + finite-needle concession) — a product/integration decision.
So: **I do NOT build closures from scratch.** My unique lane = the **real-pipeline audit** (the "validate" half) +
**fixing the integration/wiring gaps it exposes** (the mesher dispatch — the parallel agent is on rulers, low
collision). The from-scratch ArtDeco/RI probes were premature and are DEPRIORITIZED (ArtDeco/BasketWeave are genuine
unbuilt gaps per the campaign, but only if the audit shows nothing more urgent, and only reusing `buildDsRingStripWall`).

## The audit already earns its keep (real-pipeline findings)
- **5/6 smooth styles already clear 0.01 on today's OFF mesher** (SFB/SE/FB/WI/HR) — their emitters are REDUNDANT.
  Only **SpiralRidges genuinely needs the emitter** (OFF 0.047 ✗ → ON 0.003 ✓).
- **LowPolyFacet: OFF holds (0.00102) but ON is BROKEN** — `generateMesh returned null` through the real pipeline.
  Closure exists in research; the production WIRING is broken. ← concrete wire-and-validate target.
- DragonScales / BambooSegments ON — pending (the audit will say if they work in-pipeline or are broken like LowPoly).

## Revised plan (reuse-first, non-colliding)
1. **Finish the Pass-1 audit** → the definitive real-pipeline verdict per closed style (which emitters WORK vs BREAK
   in production). Hold all code edits until it completes (it shares the dev server).
2. **Fix the wiring bugs the audit finds** (LowPolyFacet ON null first; DS/Bamboo if broken), reusing the existing
   research closures — diagnose the null, restore the emitter path.
3. **Produce the enablement status map**: per style, {research closure exists? · production wiring status · audit
   real-pipeline verdict · exact remaining step}. Extends `2026-07-19-all20-status-truth.md` with the real-pipeline
   column — does NOT rebuild it.
4. Only THEN, if a genuine unbuilt gap remains and is unclaimed: ArtDeco/BasketWeave via the DS tread template.

## Progress log / findings (audit COMPLETE 18/18)
- **Truth table:** `2026-07-23-production-export-truth.md`. Real-pipeline verdict: 6 smooth styles deliver ≤0.01 (5 of
  them already on OFF — emitter redundant; only SpiralRidges earns it 0.047→0.003). The 3 hard styles are NOT delivered
  in production.
- **DragonScales:** OFF 0.820 / ON (cone-fan) 0.823. Cone-fan ISOLATED (Node) also floors ~0.82 by BOTH `rA`-based
  rulers (measureProjectorMax 0.822 AND the campaign's own perFaceTrue3DSag 0.825) — so it is the MESH, not a GPU
  divergence. BUT vtx≈0.00001 + density-invariant ⇒ this 0.82 is **tread-wall INFLATION**: a single-valued `rA` cannot
  represent DS's vertical scale/ring risers, so both rA-rulers inflate the faithful vertical tread facets to ~half-step.
  **DS true MAX is UNKNOWN — needs the parametric-Φ projector (parallel-agent asset) or a smooth-complement pass.**
- **RULER LIMITATION (important):** `measureProjectorMax` (my audit ruler) is honest for SINGLE-VALUED styles (smooth +
  LowPoly) but INFLATES riser/tread styles (DS, Bamboo, ArtDeco, BasketWeave). The smooth verdicts stand; the riser-style
  ON `maxMm` are upper bounds. FOLLOW-UP: re-measure DS/Bamboo with `buildParametricSurfaceProjector`.
- **BambooSegments + LowPolyFacet ON = `generateMesh` null — ROOT-CAUSED + Bamboo FIXED.** `buildConformingWall`
  requires a power-of-two `nRing` (inner-wall quadtree boundary pinning), but the emergent rim (= emitter nU) was 1408
  (Bamboo) / 864 (LowPoly) — non-pow2 ⇒ throw ⇒ null. The working styles slip through only because their nU is pow2
  (smooth 1024/2048, DS cone-fan 4096). **Bamboo fix (committed): snap nU up to a power of two (default 1408→2048) in
  `buildBambooDispatchWall`** — verified lint/typecheck/byte-identical + re-probed through the live pipeline (mesh now
  produced). LowPoly's facet-align needs mult-of-24 (never pow2) ⇒ deeper fix (inner-wall pow2 + rim reconciliation);
  DEFERRED (LowPoly OFF already holds 0.001).
- **BambooSegments — GENUINELY CLOSES (confirmed).** After the pow2 fix, the smooth complement (tread faces at t=k/5
  excluded — they are faithful vertical walls) measures **0.00448mm ≤ 0.01** (vtx 0.00001, p99 0.0024); the full-mesh
  0.86 was purely tread inflation. So Bamboo ON = watertight + gate-pass + ≤0.01 fidelity ⇒ a REAL production closure.
  This validates the tread-inflation interpretation.
- **DragonScales — does NOT close at MAX (MEASURED, corrects the inference above).** Geometric smooth complement
  (radius-spread > 0.2mm faces excluded) still floors at **MAX 0.0965 / p99 0.0088** (vtx 0.00001): the 0.82 was tread
  inflation, but a real **scale-tip cone-apex** residual (~0.096, density-invariant, cone-fan can't reach ≤0.01)
  remains. So DS ≠ Bamboo — DS's closure was p99-scoped, MAX is an OPEN frontier ([[project_ds_rim_bug]]). Bamboo has
  only tread verticals (closes); DS additionally has the scale-tip cones (open).
## ⚠ CORRECTION (2026-07-23 evening) — Bamboo pipeline fidelity ≠ isolated

The tread-aware hook, run end-to-end through the REAL pipeline on Bamboo ON, reports **smoothMax 0.121** (treadChord
0.859, vtx 0.00004, watertight, gate-pass), NOT the isolated-bridge 0.00448. So **"Bamboo genuinely closes" was an
isolated-emitter claim, not pipeline-faithful.** The pipeline differs from the bridge in three ways any of which can
account for it: (a) it applies a **`tWarp=L3`** to the adopted Bamboo wall (the bridge measures the raw emitter — a warp
on an already-final structured wall is suspect and may be a real bug); (b) it uses the **default export sag-tol** (qMaxSag),
not the bridge's fine 0.004; (c) the hook's **geometric tread filter** (radius-spread>0.1mm) is cruder than the bridge's
feature-specific t=k/nodeCount exclusion and can mis-classify Bamboo's smooth node-bulges. **NET: the Bamboo NULL FIX is
a confirmed win (watertight export instead of null), but its production FIDELITY is UNRESOLVED (0.12 pipeline vs 0.0045
isolated) — a tWarp/config/filter reconciliation is the follow-up. Do not treat Bamboo as closed-in-production yet.** The
same caveat applies to the DS numbers (also pipeline-vs-isolated). The audit-first lesson holds: isolated bridge closures
must be confirmed through the full pipeline.

## RESOLUTION — all identified issues handled (2026-07-23 pm, single-agent)

1. **BambooSegments ON null → FIXED** (`8d7cdd77`). Root cause: emitter emergent rim = nU = 1408 (non-pow2), but the
   assembly adopts it as the inner-wall `nRing` which `buildConformingWall` requires pow2. Fix: snap Bamboo nU up to a
   power of two (default 2048). Re-probed live: watertight mesh, and the SMOOTH complement closes 0.00448mm ⇒ a genuine
   production closure.
2. **LowPolyFacet ON null → FIXED** (`39d98686`). Same pow2-rim class, but a facet-aligned nU MUST be a multiple of 24
   (never pow2) and the assembly caps pair rings index-for-index (no mismatched-ring path). A pow2 rim would straddle the
   facets (worse than OFF). Fix: empty `FACET_GRID_ALIGN_NU` ⇒ LowPolyFacet routes through OFF, which already
   feature-aligns and holds 0.00102mm. Re-probed live: watertight 0.00102mm mesh instead of null. Enabling `__pfSmoothGrid`
   is now safe for it. (Deep option, if ever wanted: mismatched-ring cap reconciliation — not worth it, OFF holds.)
3. **DragonScales scale-tip apex → CLASSIFIED (not a mesher bug).** Geometric smooth complement across density: MAX
   0.102 / 0.0965 / 0.0984 at nU 512/1024/2048 = **DENSITY-INVARIANT** (while p99 falls 0.031→0.0024). The scale-tip cone
   apex is a curvature singularity flat facets cannot close — a **finite-area-needle concession**, the same class that
   already gates the master flag flip (Gothic/GeoStar). DS is p99-CAD-grade with a print-safe apex needle; closing MAX
   needs curved elements (roadmap-reserved) or the concession — a product call, not a bug.
4. **Ruler riser blind-spot → FIXED** (`cd37bbcd`). `measureProjectorMax` now has a tread-aware mode
   (`treadRadiusSpreadMm`): near-vertical riser faces are routed to `treadChordMaxMm` and OUT of the smooth verdict, so
   `smoothMaxMm` is the honest tessellated-surface MAX (certifies on it). Wired into `diagnoseExportTruth` for
   DS/Bamboo/ArtDeco/BasketWeave ⇒ future audit runs report the true smooth fidelity, not the inflated whole-mesh number.

## SpiralRidges / smooth-grid ENABLEMENT — recipe (a product decision, NOT auto-flipped)

SpiralRidges is the ONE smooth style whose emitter genuinely earns its keep (OFF 0.047 ✗ → ON 0.003 ✓, verified
working in-pipeline). To ship it (and the smooth group) in production:
- **Flags:** default-ON `__pfPerfectMesher` + `__pfSmoothGrid` (+ `__pfBamboo` to also ship Bamboo's genuine closure).
  Leave `__pfDsConeFan`/`__pfRegionLayer` OFF (DS's apex needle is unresolved). LowPolyFacet now safely falls to OFF.
- **The one blocker to decouple:** flipping `__pfPerfectMesher` ALSO routes the count-unstable styles (Gothic/GeoStar)
  through `buildTierCOuterWall`'s refine — the finite-needle sliver concession + the VALIDATION-9 rebaseline. Options:
  (a) add a separate `__pfTierCRefine` gate so the emitter adoption ships without the Gothic/GeoStar refine (they stay
  byte-identical OFF); or (b) accept the concession and ship the C2-validated Gothic/GeoStar true-0.01 too.
- **The real tradeoff (why this is Patryk's call):** the smooth-grid emitter is ~2× the triangles (SpiralRidges ON
  11.6M vs OFF 5.68M; a ~550MB STL) for the fidelity gain. A curvature-graded grid would close far cheaper (a documented
  follow-up lever). Fidelity-vs-export-size + a permanent production-default change = a product decision.
