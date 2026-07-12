# Raycast-Oracle Fidelity Spike — Design

- **Date:** 2026-07-12
- **Status:** Design (pre-plan)
- **Sub-project:** PROD-TIERC / export-fidelity
- **Type:** Measurement spike — **zero production code**
- **Author:** brainstorming session (Patryk + Claude)

## Decision provenance

Four decisions were made interactively and are frozen for this spec:

1. **End-state = "prove it first."** A measurement spike that quantifies where the
   current pipeline stands against the true bar *before* committing to an
   architecture. It does **not** build the oracle-refine path or a remesher.
2. **Oracle = hybrid, GPU-anchored / CPU-swept.** Bulk per-facet sag sweep runs
   in fast Node against the CPU `SurfaceSampler`; a sample is cross-certified
   against the real GPU `style_radius` field. The delta is the headline honesty
   number.
3. **Scope = 3 frontier styles + 1 clean control** (not all 20 — extensible later).
4. **Condition C real-slice = validator + manual.** The harness runs the automated
   `validateMeshForExport` + `selfIntersection` gate and emits the export files;
   the human does the final real-slice confirmation per style.

## 1. Problem & insight

**Observation (Patryk):** the ray-cast preview renders every style perfectly with
zero per-style work — could it generate a perfect mesh at 0.01 mm true-3D tolerance?

**Reframe (established during exploration):**

- The raycaster is **not** a separate geometry source. Every style's surface is a
  single-valued radial height field `r = style_radius(θ, t)` (confirmed in
  [raycast_bound.wgsl](../../../src/assets/shaders/raycast_bound.wgsl) — it reduces
  `r`, `∂r/∂θ`, `∂r/∂t` per z-bin). The raycaster is style-agnostic for the *same*
  reason all four export pipelines are: they all call `style_radius` generically.
- **Rendering ≠ meshing.** The raycaster emits independent per-pixel hits — no
  connectivity, no watertightness, no triangle quality. A cliff is two adjacent
  pixels at different depths: trivially perfect. A *mesh* must connect those samples
  with a triangle whose **interior** chords across the cliff — and that chord is what
  blows the 0.01 mm sag. Placing vertices on the surface was never the blocker
  (the parametric pipeline already does; every grid vertex sits on `style_radius`).
  The blocker is feature-conforming, watertight **topology** — a mesh problem that
  exact sampling does not remove.
- **Therefore the raycast's real leverage is as an exact, style-agnostic _oracle_,**
  not a mesh generator: (a) exact true-3D sag measurement, (b) exact feature
  localization. An honest max-sag oracle + refine loop **already exist**
  ([verdictRefine.ts](../../../src/renderers/webgpu/parametric/conforming/verdictRefine.ts),
  `PeriodicBalancedQuadtree.verdictReach`), but they measure against the pipeline's
  **own** warp-composed `SurfaceSampler` — not the independently-certified field the
  raycaster marches. Whether those agree is unknown and load-bearing.

**Spike purpose:** measure, per style, where the current production mesh stands
against the true acceptance bar, using the certified field as ground truth — and in
doing so, produce the **CPU-sampler-vs-certified drift number** that decides whether a
raycast oracle is *necessary* or merely *confirmatory*. This resolves the deferred
fork (oracle-refine vs full remesher) on data, honoring the audit-first rule.

## 2. Non-goals

- **No production code changes.** The harness only reads the pipeline and reports.
  It lives in test/harness locations, not `src/**` production paths.
- **No triangle-count reduction.** Outer-wall bloat to reach tolerance is a
  downstream decimation problem, explicitly out of scope — reported, not solved
  ("if the outer wall has too many triangles we can think of a solution to that").
- **No architecture commitment.** The spike *informs* oracle-refine vs remesher; it
  builds neither.
- **No new field math.** The certified oracle reuses the existing `style_radius`
  (`styles.wgsl` via `pot_export.wgsl`), the same function the raycaster marches.
- **Not all 20 styles.** Four styles only (§6).

## 3. Acceptance bar — three conjunctive conditions

Success for a style = **A ∧ B ∧ C**. Measured per style at fixed dims/params (§6).

### A — Tolerance (everywhere)
Certified true max-sag ≤ **0.01 mm** on **every** facet — not a percentage, not a
mean. Measured with the honest geometry already in `verdictRefine.ts`:
`denseBary(8)` interior sampling + `perpDistToPlane` (max perpendicular deviation of
the lifted surface point from the facet's own plane).

Because the GPU anchor is **sampled** (§5), A is established in two parts: **(i)** CPU
sag ≤ 0.01 mm on **every** facet (full-mesh sweep), and **(ii)** a certified drift
bound `δ` from the GPU sample such that `CPU_sag + δ ≤ 0.01 mm` ⇒ certified sag
≤ 0.01 mm everywhere. If the sampled drift is too large to close that bound, A
**cannot** be certified from the sample — which is itself a decisive finding (the
certified oracle is required for the verdict, per §9), and the plan escalates GPU
coverage on the affected band rather than declaring A green.

### B — Fidelity (vertices on surface, edges preserved)
- **B1 — vertices on surface:** `max` over all mesh vertices of
  `|SurfaceSampler.position(u,t) − GPU_position(u,t)|` ≤ **ε_vertex** (proposed
  1e-3 mm; final value set in plan). This is the drift check restricted to vertices.
- **B2 — feature edges preserved:** condition A holds on **all feature-band facets**
  (a chorded cliff manifests as a feature-band facet with certified sag ≫ 0.01 mm, so
  A-in-the-band is the operational test that features are represented by edges, not
  chords). Feature bands come from the pipeline's existing feature graph
  ([FeatureLineGraph.ts](../../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts)).
  *(Optional richer diagnostic, not gating: fraction of feature-line length coincident
  with mesh edges.)*

### C — Sliceable
- **Automated (in harness):** full assembled export
  ([WatertightAssembly](../../../src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts))
  passes `validateMeshForExport`
  ([exportValidation.ts](../../../src/geometry/exportValidation.ts): `boundaryEdges == 0`,
  `nonManifoldEdges == 0`, orientation consistent, under byte ceiling) **and**
  `selfIntersection` ([selfIntersection.ts](../../../src/geometry/selfIntersection.ts)).
  The harness emits STL/3MF via [stlExport.ts](../../../src/geometry/stlExport.ts) /
  [export3MF.ts](../../../src/geometry/exporters/export3MF.ts).
- **Manual (human):** Patryk loads each emitted file in the slicer and confirms it
  slices cleanly. The scorecard records the manual verdict per style.

> **Known caveat (honest, expected):** `export-fidelity.spec.ts:179` documents
> `INVARIANT watertight: boundaryEdges == 0` as `test.fail()` — "outer wall is open by
> design at HEAD; SP3 (watertight assembly) target." The **full** assembly may still be
> closed; the spike checks this per style. If the full export is not yet watertight,
> condition C reports **"blocked on SP3"** — a real finding, not a harness bug. This is
> exactly why the slice bar matters: it refuses to let a green sag number hide an open shell.

## 4. Architecture & reuse map

A read-only measurement harness composed of three stages plus an orchestrator.

```
For each style (fixed dims/params):
  [build]   production conforming mesh (CPU)  ── existing pipeline, unchanged
     │
  [CPU sweep] score EVERY facet's sag vs SurfaceSampler        ── verdictRefine geometry
     │        (denseBary(8) + perpDistToPlane)
     │
  [GPU anchor] re-evaluate a SAMPLE of facets' sample points   ── pot_export style_radius
     │         against certified style_radius; compute drift       readback (headless GPU)
     │
  [refine loop] run score→escalate→rebuild at tolMm=0.01       ── scoreCandidateFacets +
     │          under a recorded, reasoned cap                     buildOneRingLevelAt +
     │                                                             PeriodicBalancedQuadtree
  [condition C] assemble full solid → validateMeshForExport     ── exportValidation +
     │          + selfIntersection → emit STL/3MF                   selfIntersection + export
     │
  [row] emit scorecard row (+ export file for manual slice)
```

**Reuse (no reinvention):**

| Need | Existing asset |
|---|---|
| Honest sag geometry | `verdictRefine.ts` — `denseBary(8)`, `perpDistToPlane`, `scoreCandidateFacets` |
| Refine escalation | `verdictRefine.ts` — `buildOneRingLevelAt`; driver assembled from these pieces |
| Refine rebuild | `PeriodicBalancedQuadtree` + `ConformingWall` (CPU) |
| Certified GPU field | `pot_export.wgsl:546` `style_radius(...)` + twist → positions (same fn the raycaster marches) |
| CPU field | `SurfaceSampler.position(u,t)` (warp-composed; the pipeline's own surface of record) |
| Condition C | `exportValidation.ts` `validateMeshForExport`, `selfIntersection.ts`, `WatertightAssembly`, `stlExport`/`export3MF` |
| Feature bands (B2) | `FeatureLineGraph.ts` |

**Isolation:** each stage is independently testable — CPU sweep and refine loop are
pure Node (no GPU); only the GPU-anchor stage needs headless WebGPU. This separation is
what makes the spike tractable.

## 5. The hybrid oracle (detail)

- **CPU sweep (bulk, all facets).** For the honest "0.01 everywhere" audit the sweep
  scores **every** facet with `SurfaceSampler` — not just the `selectCandidateFacets`
  near-band superset (a facet outside the band could still exceed tol; the spike must
  not assume the selector is complete). Full-mesh CPU scoring is minutes-scale
  (acceptable offline; it is measurement, not production).
- **GPU anchor (certified, sampled).** The certified surface point at `(u,t)` =
  `style_radius(styleId, θ(u), t, r_base)` then `(r·cos(θ_twist), r·sin(θ_twist), z)` —
  identical to `pot_export.wgsl:546-551`, the function the raycaster marches. The plan
  builds a minimal compute kernel that takes a `(θ,t)` list and writes positions (a
  ~20-line trim of `calc_vertices`), run headless via the existing e2e WebGPU harness
  pattern ([e2e/_raycast_*.mjs](../../../e2e/)). Because GPU readback is the expensive
  part, anchor the sample on: **(a)** the worst-N facets by CPU sag, **(b)** all
  feature-band facets, **(c)** a random control sample — enough to bound drift globally
  and pin it at features.
- **Drift.** Same mesh, same facets: `sag_CPU − sag_GPU`. Report distribution + max,
  split feature-band vs smooth. This is the number that decides oracle-necessity.

### Harness self-validation gate (mandatory, runs first)
The CPU and GPU **must** use identical `(u,t) → (θ, t, twist, r_base)` mapping or the
drift is spurious. Before any drift is trusted, assert `CPU == GPU` within **ε_selfval**
(proposed 1e-4 mm) on: **(i)** the smooth control across the full `(u,t)` grid, and
**(ii)** SpiralRidges' base profile with **twist active** (twist is load-bearing for the
helical style; the flat control alone does not exercise it). If this gate fails, drift
numbers are meaningless and the harness is fixed before proceeding.

## 6. Scope — styles, dims, params

Four styles at **registry-default params** (fully reproducible from
[registry.ts](../../../src/styles/registry.ts)) and a **single fixed pot dimension**
(the store's default new-pot `PotDimensions`), held constant across all four:

| Role | Style | id | shaderName | Why |
|---|---|---|---|---|
| Frontier | SpiralRidges | 2 | `spiral_radius` | helix-shear / twist path; fine grooves |
| Frontier | GothicArches | 5 | `gothic_arches_radius` | "Gothic band" frontier (κ-floor band edges) |
| Frontier | GyroidManifold | 12 | `style_gyroid_manifold` | "Gyroid knee" — off-contour outlier |
| Control | SuperformulaBlossom | 0 | `sf_radius` | `sf_strength=0` → pure smooth surface of revolution; harness must read ~0 sag and CPU≈GPU |

*Export settings:* the parametric/conforming production path at its production-default
triangle budget. Exact default dims/budget are read from source at plan kickoff and
recorded verbatim in the scorecard (reproducibility).

## 7. Cap policy — recorded and reasoned, never silent

The refine loop needs a termination cap. Per the no-silent-caps rule, the cap is an
**instrument, not a gate**:

- The scorecard **states the cap** (max passes and/or max triangles) **and the
  reasoning** for its chosen value.
- Each style's convergence is reported **against** the cap — e.g. *"Gyroid knee:
  0.014 mm after 6 passes / 4.2 M tris — cap reached, NOT converged; cause: …"*.
- Hitting the cap is a **valid, decisive finding**, never a silent truncation.
- **Proposed starting cap** (revisit in plan): ≤ 8 passes OR ≤ 8 M outer-wall
  triangles, whichever first. Rationale to be recorded: 8 dyadic passes = up to
  256× local refinement over the base cell, past which non-convergence indicates a
  *topology* limit (chord-across-feature the escalation can't resolve) rather than
  insufficient density — which is itself the signal that a remesher, not more
  refinement, is required.

## 8. Deliverables

1. **The harness** (measurement only; test/harness locations, not `src/**` production).
2. **A committed scorecard** `research/lab/2026-07-12-raycast-oracle-fidelity.md`, in
   the DRIVE-ALL-20 / prod-artifact-truth table shape. Columns per style: dims/params,
   #facets, certified max-sag (mm), #facets > 0.01 mm, worst-facet location
   (feature/smooth), vertex-drift max (B1), CPU-vs-GPU drift (max, and at-feature),
   A pass?, B pass?, C automated (boundaryEdges / nonManifold / selfIntersect) + emitted
   file, C manual verdict, refine loop (passes / final tris / A-reached? / cap-hit?),
   notes.
3. **Emitted export files** (STL/3MF) per style for the manual slice step.
4. **Go/No-Go readout** (§9) written into the scorecard.

## 9. Go / No-Go — resolving the deferred fork

The scorecard maps results to the next sub-project:

- **All 4 reach A ∧ B ∧ C within the reasoned cap** → *oracle-refine path validated.*
  Next sub-project wires the two-pass verdict loop into the production build; triangle
  counts noted for a follow-on decimation task.
- **Any style fails A within cap** (can't reach 0.01 mm everywhere even with
  escalation) → existing refine machinery is insufficient → **remesher justified**, or a
  specific machinery fix is identified.
- **Drift large & structural at features** (CPU sampler ≠ certified) → the current
  verdict is optimistic → a raycast/GPU oracle must be wired into the verdict
  **regardless of path**.
- **Any style fails C** (open shell / non-manifold / self-intersecting) → watertight
  assembly (SP3) is the blocker → sequence SP3 before/with tolerance work.

These are not mutually exclusive; the readout states which hold per style.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| CPU/GPU parameterization mismatch (esp. twist) fabricates drift | Self-validation gate (§5) runs first; twist explicitly exercised |
| Full-mesh CPU scoring is slow (minutes) | Acceptable offline; parallelize if needed; it is measurement, not production |
| GPU readback volume (dense points × facets) | Anchor on a sample (worst-N + all feature-band + random), not every point |
| Refine loop non-termination / triangle explosion | Reasoned cap (§7) + honest "cap-hit, not converged" reporting |
| Outer wall open at HEAD (SP3 pending) | Expected; condition C reports "blocked on SP3" as a finding; sequence accordingly |
| Non-determinism across runs | Fix seeds/params/dims; record them; assert reproducibility of the scorecard |
| Selector incompleteness hides an outlier | CPU sweep scores **every** facet, not just `selectCandidateFacets` |

## 11. Open items for the plan

- Exact `ε_vertex`, `ε_selfval`, and starting cap values (proposals above).
- Exact production-default dims + triangle budget (read from source at kickoff).
- GPU-anchor headless runner: Playwright+Chromium (matching `_raycast_*.mjs`) vs a
  node-webgpu path (note the recorded `Node Map cap 2^23 vs Chrome 2^24` constraint).
- Harness file layout (CPU sweep + loop as Node/Vitest; GPU anchor as e2e probe;
  orchestrator writes the scorecard).
- Confirm SuperformulaBlossom(strength 0) as the control vs a mild-feature alternative
  (e.g. SuperellipseMorph) if a non-trivial smooth surface is preferred.
