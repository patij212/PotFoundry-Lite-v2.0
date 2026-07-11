# Curved-Element Phase-2 Charter — closing the unified flat-P1 frontier

**Program:** PROD-TIERC Phase 2 (curved / higher-order elements). **Opened 2026-07-12** (user
directive). **Predecessor:** the fix phase (`research/lab/tierc/FIX-PHASE-VERDICT.md`) proved
true-0.01 for flat-P1-tractable features and characterized ONE unified frontier: **flat-P1 triangles
cannot follow a high-curvature relief feature at cell-bound facet sizes** — density-invariant, driving
Gyroid's knee (fidelity 0.0247), DS's sheet cliff (0.046), and the Gothic/DS sliver concessions.

## The mandate & the honest constraint

Reach true-0.01 (or honestly bound) the frontier features. **Constraint:** the export is FLAT
triangles (STL/3MF). So "curved element" here does NOT mean shipping curved primitives — it means
using a higher-order/curvature-aware REPRESENTATION during meshing whose adaptive flat tessellation
meets 0.01mm BY CONSTRUCTION, where a uniform quadtree of flat facets cannot.

## The discipline (same as the fix phase)

Prove the CHEAP alternative fails before building the expensive thing. The A3 work refuted
along-curve densification and GLOBAL cross-band refinement, but left ONE lever untested:
**cell-scoped (local) across-band refinement at just the ~166 hot knee cells.** A3-relocate's
mechanism says a knee facet's chord = f(across-band extent², curvature); halving the across-band
extent locally should cut the chord ~4×. GLOBAL refinement failed because it added straddle facets
everywhere (relief-chord-cliff); LOCAL at aligned knee cells is different and mechanistically
plausible. If it works, the frontier closes WITHOUT curved elements (huge saving). If it fails, that
failure is the evidence curved elements are genuinely required.

## Phase-2 plan

- **P2.0 — FEASIBILITY DISCRIMINATOR (first, cheap, research-side, NO kernel change).** On the
  Gyroid band-edge twin (the cleanest characterized frontier), SIMULATE cell-scoped across-band
  refinement: at the ~166 hot cells (from `armA3_char`), manually subdivide the knee-flanking facets
  across-band and re-score vs exact analytic. GATE: does Newton-worst drop 0.0247 → ≤0.01 at bounded
  tri cost? **PASS ⇒ cell-scoped refinement is the answer** (build the kernel primitive next, curved
  elements unneeded). **FAIL ⇒ curved elements REQUIRED** — and characterize WHY (even smaller flat
  facets can't follow the curvature ⇒ genuine curvature-following need). Either outcome decides the
  whole program.
- **P2.1 (if P2.0 PASS) — cell-scoped level-override kernel primitive:** per-cell featureLevel
  escalation at flagged cells, with 2:1-balance / T-junction handling, default-off byte-identical.
  Prototype on Gyroid knee → DS sheet → generalize.
- **P2.1' (if P2.0 FAIL) — curved-element prototype:** PN/Bézier surface patch at frontier features
  + curvature-adaptive flat tessellation ≤0.01. Prototype on Gyroid knee (sharpest, cleanest), then
  DS sheet, then the sliver concessions (Gothic/DS quality — a curved element also fixes the needle,
  since the element follows the cusp instead of chording/needling it).
- **P2.2 — generalize + gates:** the composite gates harness (already built) scores every prototype
  on the true-analytic + G3/G7 + quality basis. Honest cost accounting (tris, build time).

## Proven inputs (do not re-derive)

Gyroid knee = edge-class-localized to ~166 hot arcs, curvature up to 1350 mm⁻¹, curve already at the
exact analytic peak locus (Addenda 13/14). DS sheet = density-invariant relief cliff (champion §V11x).
Gothic/GeoStar true-0.01 via the C2 analytic lever (the ruler-and-target fix — curved elements build
ON this, scoring against the true analytic surface). All frontier floors measured in FIX-PHASE-VERDICT.

## Honesty rails (binding)

Pre-register each experiment before scoring. Cheap-alternative-first (P2.0 before any build). Every
kill names the mechanism. Flat-triangle-export reality is the acceptance basis (tessellate + score
≤0.01 vs analytic, never "the curved element is close"). No exclusion classes — if a feature proves
genuinely unreachable at practical tri budgets, DOCUMENT the honest bound, don't hide it.
