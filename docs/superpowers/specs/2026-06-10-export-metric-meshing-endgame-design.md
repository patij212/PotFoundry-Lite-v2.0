# Export Endgame — Metric-Native Meshing on the Proven Registry Skeleton (Design)

**Date:** 2026-06-10 · **Branch:** `refactor/core-migration` · **Project:** `potfoundry-web/`
**Status:** AWAITING USER APPROVAL — no production code touched. Next step after approval: `superpowers:writing-plans` per stage.
**Provenance:** 21-agent design workflow (5 code verifiers → 3 web researchers → 3 competing architectures → 9 adversarial critiques → synthesis), run 2026-06-10 (`wf_fdc2001b-36b`). All file:line claims below were verified against the working tree at commit `407a091`.
**Supersedes / composes with:** `docs/superpowers/NEXT-SESSION-CREST-FIDELITY.md` (its Step-A "plain efg" is corrected below), `docs/superpowers/plans/2026-06-10-export-pipeline-cutover-plan.md` (Tasks 1.2/1.3 superseded; Phase 2/3 incorporated).

---

## 1. Mission and Definition of Done

True-to-the-mathematical-model export at Rhino/Grasshopper-grade quality or better: for **all 20 styles** across **default dims + the 4 dimension extremes** (short-wide H40/R150, tall-narrow, high-flare, no-drain) plus adversarial style params (SFB `sf_strength=1`, twisted BasketWeave):

- `sliver=0, boundaryEdges=0, nonManifold=0, orientationMismatches=0, featuresDropped=0` (or a **certified, committed, per-style exception** — see §6 validator semantics);
- crest band min-angle parity with the bulk (`bandPctBelow15 ≤ bulkPctBelow15 + ε`, ε pre-registered from run-to-run variance) and **zero red clusters** in the min-angle tint render;
- TRUE chord error (decoupled reference, `__pfReferenceDenseRes`) ≤ 0.03 mm on smooth regions at 'high' — below resin-printer resolution;
- 318+ unit tests green; default build ≤ 1.5× today's envelope;
- the conforming path is the **production default**, with CI gates that make every invariant regression-proof.

Research note that calibrates the bar: **"Rhino quality" is lower than assumed** — Rhino's mesher is a normal-divergence (~20°) + chordal-sag bound on a stitched structured grid with *no min-angle guarantee*. The conforming mesher's mechanisms already exceed it; what's missing is exactly the in-metric machinery Rhino itself doesn't have. The DoD above is *above* Rhino's bar.

## 2. Diagnosis (verified, measured — do not re-derive)

The two user screenshots are the two faces of one defect family:

1. **Sawtooth along ridge crests** = diagonal/helical-crest serration: axis-aligned (u,t) cells beside an inserted diagonal crest get CDT-filled with 3D-needle triangles spanning *across* the crest. The per-cell cdt2d runs in **raw (u,t) with zero quality constraints and zero Steiner policy of its own** (`ConstrainedCellTriangulator.ts:77`), blind to the 3D metric.
2. **Stepped sliver fields across large areas** = the 9-styles-slivered-at-default regression: GATE B applies one **global, worst-point** uBias per wall (`computeUBias`, `WatertightAssembly.ts:110-152`; `maxURatio` is the single worst point of a 192² lattice — no percentile damping), over-correcting locally-isotropic/t-dominant bands into 2^B:1 slivers — the mechanism the code itself documents (`WatertightAssembly.ts:42-49`, `FShearDiagnostics.ts:108-111`).

**Key verified facts (corrections to prior handoffs in bold):**

- The metric-aware triangulation path `shapedTemplate`/`earClipMaxMinAngle` (`QuadtreeTriangulator.ts:100-191`) is **dead in production**: `leaf.efg` is declared (`PeriodicBalancedQuadtree.ts:65`) and never assigned outside test fixtures; `efg` presence is the master switch.
- **The handoff's Step A (plain-sampler efg) is wrong as written**: the u-warp (`ParametricExportComputer.ts:2418-2422`) and t-warp (`:2434-2441`) are post-triangulation vertex remaps *just like* the helix (`:2466-2481`). Plain efg optimizes the wrong metric exactly at the pinned creases of DragonScales/GeometricStar/BambooSegments/BasketWeave/CelticTriquetra — most of the slivered set. **efg must be warp-composed from day one** (closed-form Jacobian pullback covering all three warps).
- **The greedy ear-clip itself has two crack hazards** (weakly-convex polygons: corner-mid-corner runs are collinear): an unguarded `break` (`:181`) can strand boundary sub-edges and the final-3 emission (`:188-190`) has no area check. It also **changes vertex count** (drops the legacy centroid on transition cells), not just connectivity → chord-error gate mandatory.
- The CDT path **bypasses shaped templates entirely** — its plain-cell branch center-fans unconditionally (`FeatureConformingTriangulator.ts:687-707`). Activating efg helps only the 8 plain-path slivered styles unless mirrored into the CDT path.
- SFB@1 B=3 non-manifold: strongest hypothesis is an **order-of-operations bug** — constraint planarization (PASS A, `:634`) runs *before* the PASS-B endpoint merges (dedupSide `:743-760`, interior weld `:777-791`, resolve `:798-813`); under the 8:1-anisotropic snap box (`cornerSnapU` shrinks 2^-B, `cornerSnapT` doesn't — `:263-264`) merges can re-introduce interior-crossing constraints that cdt2d can't handle, **silently masked** by the negative-area winding flip and the area==0 drop (`ConstrainedCellTriangulator.ts:82-87`). Hypothesis, not yet causally proven → Stage 0 instruments + Stage 3 refutation branch.
- Among the 9 slivered styles **only Voronoi routes through the CDT path** (`FeatureLineGraph.ts:735-782`: BasketWeave/CelticTriquetra emit only axis-aligned/rim lines; Crystalline/ArtDeco honest-empty) — so fix-classes must be gated per style class, not as one AND-gate.
- `MetricSizingField` is a **scalar isotropic** field (one target length per node from `principalCurvatureMax`; E/F/G never enter); splits are always square 4-way, so local anisotropy cannot change cell shape — only the global 2^B:1 root does.
- **Ship-path correction (new, important):** the default Export today does **not** reach the conforming mesher at all. Classic UI default button → GPU-grid uniform path (`ExportPanel.tsx:103,119-125`); v2 StatusFooter → legacy repair battery (`useParametricExport.ts:473` drops overrides; `contracts.ts:412` defaults false). Only classic UI → Advanced → "Parametric v4" → Export dialog flows commit `289de23`'s conforming+high+3MF defaults through. The 3MF/OBJ format bug is **already fixed** in live paths (cutover plan Task 2.3 is done in effect). The conforming validator hard-refuses meshes with `sliverCount>0` — relevant to flip timing.

## 3. Research verdict (3 independent surveys, sources in workflow artifacts)

Unanimous across production-mesher practice (Rhino/OCC/Netgen, gmsh/BAMG, CGAL), anisotropic-triangulation literature, and the alternatives survey:

1. Features are meshed **curve-first and frozen**; quality under anisotropy is bounded **in the Riemannian metric** (first fundamental form = true 3D angles), never in Euclidean parameter space. The dead efg path is precisely the industry-standard mechanism (BAMG-style in-metric connectivity selection).
2. Extra mappings (the helix/u/t warps) are handled by the standard **pullback-metric composition** M = Jᵀ·J.
3. A fixed sheared cell has a **provable min-angle ceiling** (the parallelogram's acute corner angle): diagonal choice + interior Steiners cannot beat it. Beyond the ceiling, **align the lattice** (d'Azevedo: build the quadtree in sheared coordinates — registry-safe because the shear is a global affine reparametrization), don't fight the corners.
4. Greedy ear-clipping has **no quality guarantee**; per tiny cell polygon, **Klincsek's O(n³) DP** gives the certified max-min-3D-angle optimum, interior-only and registry-safe. Frozen-per-cell metric makes Lawson flips terminate with constrained optimality.
5. Steiner points must be chosen **in (u,t) under the metric and evaluated analytically on the true surface** — never manufactured in the flat triangle plane (independently confirms the project's refineCellInterior measurement).
6. **Every rip-and-replace candidate is dominated**: DC/remeshers put vertices off-surface and need forbidden repair passes; subdivision swaps the analytic surface for a limit surface; GPU tessellation's crack rule *is* the registry re-derived. The quadtree+registry is the literature's answer. The only principled alternative — BLSURF-style curve-first Riemannian advancing front — solves the same root cause for months of robustness work; it is the **documented fallback**, triggered only if the crest gate is unreachable after all Stage-4 escalations.

## 4. Decision

**Keep the registry/quadtree watertight topology skeleton untouched. Rebuild only the METRIC layer on top of it.**
Base = "surgical evolution" design, hardened with the runner-up designs' best parts (single-source `PullbackMetric` module, Klincsek DP commitment, per-cell analytic ceiling map, percentile-damped GATE B, metric-stretched CDT option, d'Azevedo lattice alignment for SpiralRidges, certified-exception validator semantics) and all nine critiques' required amendments.

Non-negotiables preserved absolutely: every change is interior-only connectivity, refinement-decision-only, or an edge-local interior-independent point function; **no repair/weld/T-junction pass anywhere**; u stays periodic; vertices stay exact analytic GPU evaluations. Every behavior-changing stage ships behind a `__pf*` dev lever; re-baselines are batched into **three epochs** (S1+S2, S3, S4) plus style-scoped S5, with the 20-style hash baseline re-archived per epoch.

## 5. Staged plan (gates pre-registered; each stage lands green independently)

### Stage 0 — Ground truth + instruments + plan reconciliation (byte-identical; ~1 week; starts immediately)
- **Authoritative baseline matrix** (cutover Task 0.1/0.2): 20 styles × 5 dim-sets + adversarial params, production opts, real-WebGPU e2e; record topo vector, `triangleQualityDistribution`, `crestBandTriangleQuality` (n≥3 variance → pre-registered ε), decoupled `wallChordError`, featDrop, build wall-clock (n≥3), per-style default-dims export hashes. Committed to `e2e/baselines/`.
- **Instruments (dev-gated, byte-identical):** fail-loud counters for BOTH masking channels (negative-area flip AND area==0 drop, `ConstrainedCellTriangulator.ts:82-87`) + one-cell dump/replay harness + triangle→emitting-cell map (causal, not correlational, confirmation); per-triangle **provenance channel** (plain-quad diagonal / transition fan / FCT plain / FCT feature cell / surfaceId); **sliver attribution** bucketing thin-cell (connectivity-immune) vs bad-template; SpiralRidges **per-cell corner-angle ceiling map** (F-inclusive form).
- **TRUE-instrument forced-B sweep** {0,1,2,3,auto} via `__pfConformingUBias` over the 9 slivered styles + SFB@1 B2-vs-B3 on `crestBandTriangleQuality` + decoupled crestRms. The old "−38% serration" GATE-B justification is inadmissible (measured on the discredited reference-dominated metric). If B=3 shows no true gain over B=2 → ship the one-line `hasFeatures ? min(B,2)` cap immediately as **documented temporary containment** (removes the shipping SFB nonMan + worst CDT-style slivers), lifted at Stage 3's gate.
- **Plan reconciliation in writing:** supersede cutover Tasks 1.2 (GATE-A un-defer — stays deferred, wash-measured) and 1.3 (rotated cells — rejected, ArtDeco-cascade evidence); start mesher-independent cutover Phase-2 wiring **in parallel now** (flag source incl. fixing that the default UI never reaches conforming, validationSummary unification, memory guard); land per-PR CPU `evalSurface` goal-vector CI gates (cutover Task 3.1 pattern) as soon as the baseline exists.
- **Gate:** matrix + hashes committed; counters/attribution/ceiling-map/B-sweep recorded 20/20; SFB@1 repro harness reproduces (or refutes) the fold-over signature causally; production hash-identical; tests green.

### Stage 1 — Certify then arm: Klincsek DP templates + warp-composed PullbackMetric, mirrored into the CDT plain branch (re-baseline epoch 1; ~1.5–2.5 weeks)
- Replace the greedy ear loop with **Klincsek O(n³) max-min-3D-angle DP** (zero-area scored −∞; complete triangulation guaranteed — both crack hazards closed by construction). Property test ≥1e5 cases (collinear corner-mid-corner runs, k>8 feature polygons, sheared metrics to 16:1) asserting coverage/orientation/count. Atomic per-cell emission with rollback to legacy centroid fan.
- New **`PullbackMetric` module**: closed-form Jacobian composition of u-warp/t-warp/helix (E′=Eφ′², F′=φ′(F−sE), G′=G−2sF+s²E) mirroring the exact application guards at `ParametricExportComputer.ts:2418-2481`; pinned per style class by finite-difference-vs-closed-form unit tests; `gridResolution()` forwarded; unfolded-u wrap verified before composing.
- Populate `leaf.efg` lazily in `leaves()` only (never `leafOfCell` — hot path), metric sampler threaded per-wall (`ConformingWallOptions` → `buildConformingWall` → `buildQuadtreeAtScale`), **both walls**. **Warp-composed from day one — plain efg never ships alone.**
- Same epoch: mirror shaped templates into the CDT plain-cell branch (`FeatureConformingTriangulator.ts:687-707`). Sub-flags `__pfConformingEfg` / `__pfConformingShapedTemplates` / `__pfConformingShapedCdtCells` for bisection. Per-leaf fired-template instrument makes the B=0 byte-identity clause mechanically checkable. Re-verify `TRIS_PER_LEAF=2` budget calibration.
- **Gate:** property suite 0 cracks / 0 zero-area; **bad-template-class slivers → 0 per style** on ArtDeco/Crystalline/DragonScales/GeometricStar/BambooSegments/BasketWeave/CelticTriquetra (+ plain cells of CDT styles) via provenance attribution; SpiralRidges gets its own sub-gate (ceiling-map verdict, NOT a hard →0); bnd/orient/nonMan unchanged-or-better 20/20; decoupled chord error within pre-registered band (centroid removal changes sampling); B=0 styles byte-identical OR every diff enumerated by the leaf instrument; build ≤ +10%; hashes re-archived.

### Stage 2 — GATE-B percentile damping (pre-authorized contingency; inside epoch 1; ~2–5 days)
- Fires only if attribution shows **thin-cell** slivers remain (cells physically stretched 2^B:1 — no triangulation can fix). Recalibrate `computeUBias` from worst-point to a percentile (pre-registered candidates {P90, P95, worst-point} × relief floor), **time-boxed**, with the Stage-0 TRUE B-sweep as serration-vs-sliver tiebreaker. One B per wall pair stays (ring-match invariant); crease-coverage regression sentinel pinned first (the `6aafe5b` lesson). Optional scalar gradation bound in `MetricSizingField` only if extremes probe (run short-wide ArtDeco/CelticKnot **early, here**) measures grading-transition slivers. Full directional tensor sizing explicitly NOT built.
- **Gate:** sliver=0 on all 8 plain-path styles at default; SFB@1+Gothic crest non-regression on TRUE instruments; Gothic crease coverage ≥0.9; chord error in band; time-box expiry fallback = keep worst-point B + templates + documented residual.

### Stage 3 — CDT constraint-topology hardening at root (re-baseline epoch 2; ~1.5–2.5 weeks)
- Blocked on Stage-0's **causal repro**. Explicit refutation branch: if pre-flip inversions AND drops are 0 at B=3, the planarize-before-merge hypothesis is falsified → reopen dedupSide/weld asymmetry with a fresh minimal repro before any fix; B≤2 containment holds meanwhile.
- Fixes: (i) PASS-B **re-planarization after endpoint resolution**, extended to vertex-on-segment T-contacts and collinear overlaps; (ii) every planarize Steiner gets clearance to all four sides AND every existing vertex/constraint (≥2e-6, >2×WELD_TAU, >QSCALE quantum), violations → deterministic interior-only counted degradation; (iii) fail-loud on both masking channels + per-cell completeness assertion (boundary sub-edges 1-incident, interior 2-incident); (iv) deterministic min-qk tie-breaks; (v) cross-feature-line merge rules made **unconditional and edge-local** via feature-line provenance threaded into the registry — never conditioned on per-cell interior state (that breaks the cross-cell symmetry that IS the T-junction-free guarantee); (vi) optional sub-flagged **metric-stretched cdt2d** (power-of-two stretch or metric-in-predicate; orientation pinned to raw (u,t); deterministic fallback); (vii) **CelticKnot short-wide bnd=6 crack owned here** (cutover Task 1.1 repro recipe).
- **Gate:** SFB@1 auto-B nonMan 3→0; Voronoi nonMan 1→0, slivers 2076→0 or ceiling-certified; inversion+drop counters ==0 on 20 styles at default; featureDrop(real)=0 AND fallback-activation==0 on Hive/CelticKnot/Gyroid/Voronoi/SFB; CelticKnot short-wide bnd 6→0; crest non-regression; real-e2e gates; containment cap lifted; hashes re-archived.

### Stage 4 — Crest-band quality floor: residual-gated escalation ladder (re-baseline epoch 3; ~1–3 weeks)
- **Decision gate first:** re-measure crest band (numeric parity + tint + TRUE chord) on SFB@1/Hive/CelticKnot/Gyroid/Voronoi *after* Stages 1–3. Fund only what the residual demands, in cost order:
  - (a) **Registration-time edge-local in-metric clearance snap** of crest/constraint edge-points onto nearby registry grid vertices (pure function of global curve + grid line; metric at the candidate point; canonical order; registry vertices never move) — the only mechanism that can remove transition-edge dedup-survivor needles whose short edge is a *boundary* sub-edge.
  - (b) **Frozen-per-cell-metric Lawson flips** of interior non-constraint edges (constant metric ⇒ termination + constrained optimality), 3D-verified acceptance on crest cells.
  - (c) **Crest-aligned interior Steiners** via the proven `refineCellInterior` replay wiring with a metric-true kernel (tangent from constraint chords; candidates along the metric normal; positions on the true surface; accept only if measured 3D min-angle improves — worst case no-op, never a manufactured sliver).
  - (d) **Offset-curve ribbons: documented escalation only, never default-funded** (full spec + de-scope ladder retained in workflow artifacts).
- Also quantify the non-inserted diagonal-relief mass (CelticTriquetra braid bands, twisted BasketWeave) and disposition it honestly (out-of-scope sizing residual or separately-scoped extraction extension).
- **Gate:** crest numeric parity (band ≤ bulk + ε, bulk non-regressed) + zero red on crests (archived tint renders) + anti-relocation check (global distribution not worsened); Voronoi residual →0; featureDrop=0; feature-dense build ≤1.5×.

### Stage 5 — SpiralRidges resolution (style-scoped; 0–1.5 weeks)
Pre-registered decision rule on the Stage-0 **ceiling map**: (a) if post-S1/S2 sliver=0 and crest≈bulk → close as no-op; (b) if residual clusters at the per-cell analytic ceiling → **composed-sampler lattice alignment** (d'Azevedo): build the SpiralRidges quadtree in sheared coordinates v=u−s·t via a ComposedWarpSampler used for sizing + metric + evaluation — final positions arithmetically identical to today's post-warp, but cells become 3D rectangles and crest columns lattice-vertical (caps remapped with the same composed map; structural exclusivity assertion; per-seam-column boundary-edge counts in the gate); or (c) declined on cost → a **quantified certified ceiling-bound floor**, committed as a per-style exception and surfaced to the user as a product decision. Re-routing helical crests as inserted general curves is **rejected** (guaranteed wall-cap ring cracks; heaviest machinery made load-bearing for one style).
- **Gate:** sliver 479→0 + clean tint + TRUE chord ≤0.03mm + topo zeros incl. seam-column counts, OR certified exception list committed; all other styles hash-identical.

### Stage 6 — Extremes hardening, two-tier CI, validator semantics, cutover handshake (~1–1.5 weeks + matrix runtime)
- Full DoD matrix (20 × 5 + adversarial params) on real WebGPU; counters ==0 matrix-wide; short-wide budget/sliver-explosion class owned here with the gradation bound as the named lever (already probed at Stage 2).
- **Two-tier CI:** per-PR headless CPU `evalSurface` goal-vector gates (landed Stage 0/1); nightly full matrix on a pinned real-GPU machine; two-tier hashing (machine-independent CPU topology hash; float hashes per GPU/driver pin); determinism measured by duplicate runs; red path demonstrated by injecting a known-bad commit. Per-PR real-GPU CI explicitly not attempted (no runner; SwiftShader breaks position expectations).
- **Validator semantics:** conforming validity = zero-vector OR certified committed per-style exception — an accepted floor can never permanently block cutover.
- **Interim dominance checkpoint (executable any time after Stage 3):** if the matrix shows conforming ≥ legacy on every counter for every style/dim, **flip the default then** — crest-band work continues behind the default-on flag. Legacy ships 9 styles with up to ~35k orientation mismatches today; perfection must not hold user value hostage.
- **Gate:** DoD vector measured (not claimed) matrix-wide, green twice consecutively; cutover handoff executed; post-program hash baseline archived.

**Realistic program total: ~8–13 weeks solo** including three re-baseline epochs and matrix runtime, with the dominance checkpoint as the named early-exit for user value after Stage 3.

## 6. Rejected ideas (binding — do not re-litigate without new evidence)

| Idea | Why rejected |
|---|---|
| Ribbons as committed centerpiece | Only large-effort item not gated on a measured residual; known tar pits (offset cusps, junction collisions, metric-space floor vs raw-(u,t) snap hazards, `belowFeatureFloor` feedback). Retained solely as Stage-4(d) escalation with de-scope ladder. |
| Greedy ear-clip "minimal hardening" instead of Klincsek DP | No admissible-ear existence proof; undefined all-collinear behavior; DP gives certified completeness at negligible cost for n≤12. |
| Conditioning shared-edge merges on per-cell state / inversion-triggered boundary retries | Breaks cross-cell symmetry = the T-junction-free guarantee. Replaced by unconditional edge-local rules + registry provenance. |
| `hasFeatures B≤2` cap as the *fix* — or "never cap" | Both argued from bad evidence (−38% was reference-dominated). Stage-0 TRUE B-sweep decides; cap allowed only as temporary documented containment. |
| Re-routing SpiralRidges helix as inserted general curves | Guarantees wall-cap ring cracks (helix endpoints subdivide pinned rings); surrenders exact column pinning. Lattice alignment strictly dominates. |
| Full directional tensor sizing (per-node hU,hT) | Cannot change cell aspect under square splits + one global B (ring-match); maps to no measured defect; risks the shipped 0.021mm facet-free win. Scalar gradation bound only. |
| Per-axis splitting / "rotated cells" (cutover Task 1.3) | Measured-broken (eUL cascade → ArtDeco timeout). Superseded in writing at Stage 0. |
| refineCellInterior flat-plane kernel; sampler raising; sag/budget as crest fix | All measured FALSE by the project. Only the replay wiring is reused (Stage 4c) with a metric-true accept-only-if-improves kernel. |
| Rip-and-replace pipelines (advancing front, DC/Manifold DC, OpenSubdiv, Instant Meshes/QuadriFlow, LpCVT, GPU tessellation) | Each forfeits a hard constraint (off-surface vertices, repair passes, limit surface ≠ analytic) or re-derives the registry. BLSURF-style curve-first = documented fallback with concrete trigger (crest gate unreachable after all Stage-4 rungs). |
| Plain-sampler efg as standalone first increment (handoff Step A as written) | u/t warps are post-triangulation remaps too; plain efg is wrong at the pinned creases of most slivered styles — would burn a re-baseline epoch shipping a known-wrong metric. |
| Silent "drop newest constraint" CDT fallback | Converts topology defect into invisible crest-fidelity loss. Allowed only as counted, deterministic, interior-only terminal degradation surfaced in featureDrop (must read 0 at default). |
| Hard multi-style sliver→0 AND-gates before attribution | Thin-cell slivers are connectivity-immune → deadlock. Per-fix-class gates + pre-authorized Stage-2 contingency. |
| Meshing-first sequencing | Legacy ships defectively today; dominance checkpoint after Stage 3 + parallel Phase-2 wiring front-load user value. |
| Per-PR real-WebGPU CI / cross-machine byte-hash gates | No GPU runner; GPU floats not deterministic across hardware. Two-tier CI instead. |

## 7. Open risks (acknowledged, with mitigations in-plan)

1. Thin-cell slivers may dominate several styles → percentile-B becomes load-bearing; calibration time-boxed with written fallback.
2. Stage-3 root cause is still a hypothesis until the causal repro; refutation branch specified; containment holds meanwhile (SFB@1 keeps 10.4% sub-15° until then).
3. Fail-loud counters may surface latent fold-overs on braid styles currently passing by luck — by design (defects become measurable), but a real schedule risk at first matrix run.
4. Warp-composition guard drift = silent quality failure mode; FD pins + per-style crest gates are the defense.
5. Per-leaf constant cell-center metric on sub-cell relief (FourierBloom/Crystalline class) may not zero the high-relief residual — would ship as a measured documented floor with named follow-ups.
6. SpiralRidges may be ceiling-bound AND lattice alignment declined → certified-floor product decision, surfaced the moment the Stage-0 ceiling map lands.
7. Short-wide sliver-explosion class has a named lever but no proven fix; if the early probe fails, DoD may stage (default-dims first, extremes second).
8. Nightly CI depends on one pinned GPU machine; driver updates invalidate float-hash tier until re-pinned.
9. Byte-identity discipline across three re-baseline epochs must actually be enforced in review (per-epoch hash re-archival).

## 8. Measurement protocol (the project's constitution applies)

Ground truth established once at Stage 0, re-anchored after every epoch, never assumed. All topology claims from the **faithful real-WebGPU e2e path** (unit tests overstate seam cracks — known). Every gate's numeric thresholds pre-registered in the stage doc **before** work starts. Crest claims gated on all three faithful instruments together: `crestBandTriangleQuality` (band vs bulk), the archived min-angle tint render, TRUE chord error vs decoupled reference. Global distributions always recorded alongside band metrics (anti-relocation). Counters become standing zero-gates from Stage 3. The deliverable to the cutover plan is the measured all-zeros (or certified-exception) artifact — not a claim.

## 9. Immediate next actions on approval

1. `superpowers:writing-plans` → implementation plan for **Stage 0** (instruments + baseline + B-sweep + reconciliation memo). Zero production-behavior change, so it can start without further design risk.
2. In parallel: cutover-plan Phase-2 wiring plan (flag source — including the newly-found "default export never reaches conforming" gap — validationSummary, memory guard).
3. Surface the SpiralRidges ceiling-map result to the user as soon as it lands (potential product decision per risk 6).
