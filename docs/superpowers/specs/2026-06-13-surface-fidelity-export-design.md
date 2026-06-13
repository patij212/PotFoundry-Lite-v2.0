# Surface-Fidelity Export — Design Spec (2026-06-13)

**Status:** measurement phase CLOSED + adversarially validated. This spec is the
design handoff for implementation. Companion plan to follow at
`docs/superpowers/plans/2026-06-13-surface-fidelity-export.md`.

**Supersedes** `2026-06-13-feature-aligned-crest-mesher-design.md` (and its plan):
that targeted triangle *quality* (min-angle/slivers). The user's 2026-06-13
reframing — *"I can accept slivers as long as every exported mesh represents the
true surface perfectly smoothly with no error"* — makes **surface fidelity** the
sole criterion. Triangle min-angle / feature-aligned (Route-B) / cap-min-angle
work is **out of scope** here (slivers are acceptable; the flat base cap carries
~0 surface error regardless of its slivers).

Evidence: the `verify_*` fidelity probes under `potfoundry-web/src/fidelity/`
(all CPU, production byte-identical) + the measured-evidence record in
`stage3-connectivity-ceiling.md`. Memory: `project-export-endgame-design`.

---

## 1. Goal & success metric

**Goal:** every exported mesh lies on the true mathematical surface — sharp where
the model is sharp (cusps/creases as real mesh edges), smooth where it is smooth —
with deviation below tolerance everywhere.

**Success metric:** `dev(triangle) = max over the triangle's (u,t) footprint of
|exactSurface(u,t) − flatTriangle(u,t)|` (mm), combining vertex-placement error
and chord/faceting error, measured against the **exact** surface. Pass = every
triangle below tolerance (seam excluded — §6).

**Budget contract (user, 2026-06-13):** drive `dev` toward the **f32 floor**
(~tens of µm). Triangle budget is spent **adaptively where curvature demands it**,
until the user's quality metric is satisfied. The **only hard cap is the slicer**:
~1GB STL ≈ **20M triangles** — meshes above that crash slicers. So budget is a
ceiling, not a target; if a style/config cannot reach tolerance within 20M tris,
**honest refusal** (export at best-achievable + a warning), never a silent
over-budget or a silently-low-fidelity mesh. Tolerance default: **0.05mm**
(print-resolution class); configurable per quality profile.

---

## 2. Measured evidence (what the spec is built on)

All deviations vs the exact f64 surface; sampler validated faithful (grid-point
error 5.3e-6mm across all 20 styles — `verify_styleSharpnessClass`).

- **The current export does NOT represent the true surface.** Real-mesh deviation
  (SFB@1, L7, seam excluded): p99 1.35mm, **max 3.4mm**, ~10% of triangles >0.1mm
  (`verify_exportSurfaceFidelity`, `verify_chordConvergence`).
- **Cross-style: 15/20 styles exceed 0.1mm at the production DENSE_RES=256**
  (`verify_crossStyleFidelity`). Worst: ArtDeco 4.6mm (p99 3.6mm pervasive), SFB
  8.2mm (born petals), DragonScales/CelticKnot/Gothic/BasketWeave/CelticTriquetra/
  Gyroid/GeometricStar/Crystalline 1.1–1.5mm. Smooth styles <0.26mm.
- **Two error mechanisms, both confirmed:**
  1. **Vertex-placement error** — production evaluates vertices via a bilinear
     `GpuSurfaceSampler` at DENSE_RES=256 (`ParametricExportComputer.ts:2294`,
     `:2301-2325`); the `gpuResnap` step fixes only feature-vertex *u*, not the
     position. Sharp cusps are flattened. **Refinement-immune** (the worst crest's
     1.95mm deviation is flat across cell width — `verify_maxSagReferenceDomination`):
     smaller cells do not move a vertex onto the true surface. DENSE_RES↑ helps
     medium styles (SFB 8.2→0.84 @1024) but **not** fine-detail styles
     (DragonScales/CelticKnot ≈ unchanged @1024) → those need **exact** eval.
  2. **Missing / partial feature edges → straddled sharp features.** From the
     `FeatureLineGraph.EXTRACTORS` table (all 20 styles): **ArtDeco has NO
     extractor** (→ 4.6mm worst), **Crystalline `()=>[]` is a documented GAP**
     (helical creases → 1.15mm); SFB inserts full-height crests only (**born
     petals dropped** → the 3.4mm straddle), BasketWeave axis-only, CelticTriquetra
     3-rim-rings-only, GothicArches seam-only. 5 smooth styles `()=>[]` correctly.
- **maxSag reference-domination:** the curvature/chord refinement reads the
  flattened bilinear-256 surface, so it under-resolves crests; it must read the
  exact (or sufficiently dense) surface to refine correctly (`verify_maxSagReferenceDomination`).
- **Junctions inherit it:** shared base/rim rings are 1.5–2.65mm off the true
  surface at crests (`verify_junctionFidelity`); caps/rim reference them by index,
  so fixing the wall sampler fixes the junction. Inner wall mirrors the path.
- **Segmented styles (Bamboo/BasketWeave)** have real z-step (t-band) discontinuities
  — a bilinear grid cannot represent them at any resolution; they need band edges
  (`CreaseTWarp`, the t-direction analog of crests), which their extractors insert
  where axis-aligned.

---

## 3. Fix architecture — three mechanisms (relief-independent)

### 3.1 Exact per-vertex surface evaluation (the dominant, refinement-immune fix)

Replace bilinear-256 vertex positions with **exact evaluation at each vertex's
(u,t)**. The surface is GPU-evaluated, so the faithful implementation is a **final
per-vertex GPU evaluation pass** (a compute kernel over the emitted vertex list,
evaluating `style_param`/`r_outer` at exact (u,t)) — NOT a denser interpolation
grid (insufficient for fine-detail styles, measured). The sizing/extraction may
still use a sampled grid; only the **final positions** must be exact.

- Watertightness: connectivity untouched — only positions move onto the true
  surface. The registry / 2:1-balance / warp contracts are preserved.
- This alone removes the 1–8mm vertex-flattening across all featured styles and
  fixes the junction rings (they are the same vertices).

### 3.2 Complete feature extractors (sharp features as mesh edges)

Every sharp model feature must be a real mesh edge so no flat triangle spans it:

- **Radial crests/creases** via the existing insertion (general-curve / crease
  warps) — but **un-defer the born petals** (SFB `SF_CREST_FULL_HEIGHT_SPAN`
  0.85→~0) and complete the partial extractors (BasketWeave non-axis under twist,
  CelticTriquetra braid/medallion, GothicArches full).
- **t-band edges** (z-step discontinuities) via `CreaseTWarp` for segmented styles.
- **Build the two missing extractors: ArtDeco** (the worst, currently none) and
  **Crystalline** (the documented helical-crease gap — via `chooseHelixGrid` +
  `CreaseHelixWarp`).
- Smooth styles (Harmonic/Superellipse/Fourier/Wave/Ripple) stay edge-free
  (correctly `()=>[]`) — resolved by density alone (§3.3).
- Watertightness: insertion (grid-line registry) + crease warps are
  watertight-by-construction; NO post-hoc repair/weld (the banned legacy class).

### 3.3 Curvature-adaptive density against the EXACT surface

The existing `maxSag`/quality-profile refinement, but its curvature/chord input
**must come from exact evaluation** (not bilinear-256 — the reference-domination
trap, §2). Refine to drive residual chord error < tolerance, spending the budget
where curvature demands, down to the f32 floor, capped at the slicer limit
(§1). Smooth high-frequency styles (e.g. FourierBloom) are resolved here.

---

## 4. Per-class fix mapping

| class | styles | dominant error | fix |
|---|---|---|---|
| smooth | Harmonic, Superellipse, Fourier, Wave, Ripple | chord only (small) | §3.3 density (exact-referenced) |
| medium sharp | SFB, GeometricStar, Crystalline*, GothicArches, GyroidManifold, HexagonalHive, LowPolyFacet, Voronoi | vertex flattening (DENSE_RES↑ helps) + partial edges | §3.1 exact eval + §3.2 complete edges + §3.3 |
| fine detail | ArtDeco, DragonScales, CelticKnot, CelticTriquetra, BasketWeave | sub-grid detail (DENSE_RES↑ insufficient) + missing/partial edges | §3.1 exact eval (mandatory) + §3.2 (ArtDeco extractor is new) + §3.3 |
| segmented (t-bands) | BambooSegments, BasketWeave | z-step discontinuity | §3.2 `CreaseTWarp` band edges + §3.1 + §3.3 |

\*Crystalline needs a new helical-crease extractor (§3.2).

---

## 5. Watertightness (must hold; no post-hoc repair)

Carried entirely by: (a) exact per-vertex eval leaves connectivity byte-identical
(positions only move onto the true surface); (b) feature insertion via the
edge-local grid-line registry + crease warps (watertight-by-construction); (c) 2:1
balance + caps shared-by-index. No weld / T-junction-split / center-fan repair is
added. `assertMeshExportable` (boundaryEdges=0, non-manifold=0, orientation) must
pass on every export, unchanged.

---

## 6. Scope

- **OUT (accepted):** triangle slivers/min-angle; the periodic u-seam cliff (the
  surface is genuinely non-periodic for non-integer petal counts — accepted, to be
  explored after this pipeline); the base/rim cap *triangle* quality (flat → ~0
  surface error).
- **FUTURE (#3 task):** the CPU/GPU truth-reference completeness — the f64 mirror
  omits `compute_twist` and the Gaussian `bellAmp` bulge (both default-zero, so
  SFB@1-safe, but real on other configs). Exact eval MUST use the GPU surface
  (source of truth) to sidestep this; a CPU-truth probe for twisted/belled presets
  is deferred.

---

## 7. Rejected alternatives (binding)

| idea | why rejected | evidence |
|---|---|---|
| Feature-aligned / Route-B triangle-quality rebuild | solves min-angle, not fidelity; slivers are accepted | user reframing 2026-06-13 |
| Denser grid alone (DENSE_RES↑, no exact eval) | insufficient for fine-detail styles (DragonScales/CelticKnot ≈ unchanged @1024) | `verify_crossStyleFidelity` |
| `maxSag` refinement against the bilinear-256 surface | under-refines crests (reads the flattened surface) | `verify_maxSagReferenceDomination` |
| Post-hoc weld / T-junction-split / repair | banned (legacy defect factory) | project history |
| Fixing the seam now | out of scope (accepted cliff) | user 2026-06-13 |

---

## 8. Pre-registered Stage-0 gates (define "done")

All measured in 3D vs the exact surface, seam excluded, tolerance 0.05mm:

1. **Exact-eval gate:** with exact per-vertex eval, every style's vertex-placement
   deviation → ~0 (grid-independent). (Extends `verify_crossStyleFidelity`.)
2. **High-relief gate (the bounded loose end):** per style, at cranked
   relief/sharpness (camelCase params), max deviation still meets tolerance after
   the fixes — confirms relief-independence of the spec.
3. **Per-style coverage gate:** every sharp style's features are inserted as edges
   (no straddled feature); ArtDeco + Crystalline extractors exist and cover their
   features; born petals inserted.
4. **Density gate:** residual chord error < tolerance everywhere within the 20M-tri
   slicer cap; honest-refusal fires where a config cannot.
5. **Watertight gate:** boundaryEdges = non-manifold = orientation-defect = 0 on
   every style/config (`assertMeshExportable`).
6. **End-to-end gate (#2, after spec):** a REAL WebGPU export of each style,
   sliced/sampled, deviates < tolerance from the true surface — the missing
   real-GPU fidelity gate (also the differential-CI gate).

---

## 9. Honest residual risks

- **ArtDeco + Crystalline extractors are new code** (the two worst gaps); their
  feature families (pervasive high-frequency / helical creases) are non-trivial to
  extract analytically.
- **Exact per-vertex GPU eval** is the load-bearing new pass; it must match the
  sizing surface to avoid a vertex-vs-curvature mismatch.
- **Budget vs slicer cap:** some high-detail styles at extreme relief may need
  >20M tris to reach 0.05mm → honest-refusal regime; the achievable tolerance per
  style/config should be tabulated.
- **End-to-end (#2) is unmeasured** — the actual exported artifact's fidelity is
  validated only after the spec, by gate #6.
- **CPU/GPU truth divergence (#3)** — deferred; exact eval on the GPU avoids it for
  default configs.
