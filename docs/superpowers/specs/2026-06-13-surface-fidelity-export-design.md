# Surface-Fidelity Export — Design Spec (2026-06-13, **REVISION 3** — edges-only, sizing cut)

**Status:** measurement phase CLOSED, adversarially red-teamed, RE-BASELINED, and
the (1a)-sizing hypothesis DE-RISKED + REFUTED by direct measurement. This is the
edges-centered design.

**What changed in Rev 3 (the decisive measurement):** Rev 2 promoted "exact-curvature
sizing" (Task 3) as the (1a) fix. A de-risk spike
(`potfoundry-web/src/fidelity/verify_task3_curvatureFloor.test.ts` +
`verify_edgeVsFlank_adaptive.test.ts`) **refuted it**: on the REAL adaptive
production mesh (SFB@1, exact eval, seam excluded), of 6,786 triangles >0.1mm —
**96.7% are EDGE-attributable** (62.3% straddle a feature; 34.4% are flank cells
*adjacent to a dropped born petal*, which `featureRefine` shrinks once the petal is
inserted), **3.3% are the out-of-scope seam**, and the **true in-scope sizing
residual is 4 triangles (0.06%)** — at the base junction, not a wall flank. The
analytic `curvatureFloor` changes the flank over-tol fraction 1%→1% (the "(1a)
0.48mm" of Rev 2 was sampling AT the singular cusp tip, which is an inserted edge,
not a cell). **⇒ Sizing is adequate; Task 3 is CUT. The fix is EDGES.**

**What changed (and why):** Revision 1 attributed the export's surface error to
*bilinear-256 vertex flattening* and made "exact per-vertex GPU eval" the dominant
fix. A 49-agent red-team (`docs/superpowers/specs/2026-06-13-surface-fidelity-redteam.md`)
plus an independent code-verified re-baseline
(`potfoundry-web/src/fidelity/verify_rebaseline_realpath.test.ts`) proved that
**production already evaluates every mesh vertex exactly on the GPU**
(`ParametricExportComputer.ts:2701-2706` → `evaluate_vertices`, no grid lookup);
the bilinear-256 sampler feeds **only the sizing field** (`ConformingWall.ts:250`).
The "1.35mm p99 / 3.4mm max" baseline measured a *position path production never
takes*. So **exact per-vertex eval is a near no-op**, and the real, unfixed
mechanisms are: **(1b) missing/partial feature edges** (dominant) and **(1a) the
sizing field reads the band-limited bilinear sampler** (so it under-refines
crests). Two foundational measurement defects were also found: the gate's "true
surface" was config-blind, and the budget contract was wrong.

**Goal (unchanged):** every exported mesh lies on the true mathematical surface —
sharp where the model is sharp, smooth where it is smooth — with deviation below
tolerance everywhere. **Slivers are accepted** (user reframe 2026-06-13).

Evidence: `potfoundry-web/src/fidelity/verify_*.test.ts` (CPU, production
byte-identical). Memory: `project-export-endgame-design`.

---

## 1. Goal & success metric

**Success metric:** `dev(triangle) = max over the triangle's (u,t) footprint of
|exactSurface_C(u,t) − flatTriangle(u,t)|` (mm), measured against the exact
surface **evaluated at the export's ACTUAL config `C`** (packed params + dims) —
NOT a fixed full-relief reference (see §2, BLOCKING-2). Pass = every non-seam
triangle below tolerance.

**Budget contract (corrected):** the binding ceiling is the **quality profile's
`maxTriangleBudget`** (`high` = 6M; `ultra` = 12M), NOT the slicer cap. The slicer
cap (`MAX_BINARY_STL_TRIANGLES` ≈ 21.4M / ~1GB) is the STL *write* gate. Below the
profile budget, two actuators currently degrade fidelity **silently**: cap-mode
coarsening (`budgetMode:'cap'`, raises the sag edge-target up to
`MAX_BUDGET_SCALE=4` → effective sag ~0.2mm = 4× tol) and decimation (0.2mm error
ceiling). The fix makes these **honest**: under `surfaceFidelityExact`, the
fidelity ceiling is decoupled from the 6M profile budget (raised toward the slicer
cap), and any cap-coarsen/decimate that would push a triangle over tolerance fires
an **honest refusal** (export best-achievable + a warning), never a silent
over-tolerance mesh. Tolerance default: **0.05mm** (the `high` profile `epsPosMm`);
configurable per profile.

---

## 2. Measured evidence (what the spec is built on)

All deviations vs the exact f64/GPU surface; sampler validated faithful to ~1e-9mm
for SFB (`verify_cross_consistency`). Re-baseline (SFB@1, seam excluded):

- **Vertex placement is already EXACT.** Production evaluates every emitted
  `(u,t,surfaceId)` vertex exactly (`ParametricExportComputer.ts:2701`). The
  re-baseline confirms production vertex-placement error ≈ 0; the prior "p99
  1.35mm / max 3.4mm" was the *bilinear sampler's* error, a path production does
  not take for positions. **⇒ "exact per-vertex eval" is a no-op** (`verify_rebaseline_realpath` PART A).
- **(1b) Missing/partial feature edges are the DOMINANT residual.** At the real
  triangulator (uniform L7, exact eval, seam excluded): **8,259 triangles >0.1mm,
  26% straddle a crest locus, worst 3.39mm** — and this **survives exact vertices**
  (it is a flat triangle spanning a feature that is not a mesh edge). Source: SFB
  **born petals dropped** (`SF_CREST_FULL_HEIGHT_SPAN=0.85`), and the un-covered /
  partial styles (`verify_rebaseline_realpath` PART C, `verify_worstTriangle`).
- **(1a) Sizing is ADEQUATE (Rev-3 correction).** Decisive measurement on the
  REAL adaptive mesh (`verify_edgeVsFlank_adaptive`): of 6,786 triangles >0.1mm,
  **96.7% are EDGE-attributable** (62.3% straddle a feature; 34.4% flank cells
  adjacent to a *dropped born petal*), **3.3% out-of-scope seam**, and **4
  triangles (0.06%) are a true in-scope sizing residual** (at the base junction).
  The crest-flank implied sag is 0.006mm median (1% over tol); the analytic
  `curvatureFloor` changes it 1%→1% (`verify_task3_curvatureFloor`). The Rev-2
  "0.48mm / 100% over" was sampling AT the singular cusp TIP — an inserted edge,
  not a cell. **Task 3 (sizing) is CUT.**
- **BLOCKING-2: the gate's truth was config-blind.** `STYLE_FUNCTIONS(id,{})` for
  SFB has no strength term → always full petals; but the **default export packs
  `sf_strength=0`** (`registry.ts:27`) → a smooth pot. A config-blind gate reports
  up to **17.5mm** spurious deviation on a default export forever
  (`verify_rebaseline_realpath` PART D).
- **The e2e "ship gate" measured the wrong reference.** `__pfFidelity` builds its
  reference from a second GPU **uniform-grid** mesh (`gpuExport.generateMesh()`,
  1280×720, `FidelityHookMount.tsx:75`), not the analytic surface — it flattens the
  same cusps in the reference, so it cannot certify §1.
- **STL export silently re-welds + re-orients + quantizes.** `orientMeshForSTL`
  runs on every export (`stlExport.ts:350`): a separate 0.001mm weld + BFS/volume
  re-orientation; coordinates are `float32`-quantized and face normals recomputed
  from the quantized verts (`:391,399-416`). "No weld / connectivity untouched"
  was false at the byte level; the gate never measured the round-tripped bytes.
- **No geometric-validity gate exists.** `assertMeshExportable` is topology-only
  (`exportValidation.ts:312-340`); a folded/inverted/self-intersecting triangle
  ships green (`selfIntersection.ts` is dead code). Edge insertion + warps move
  geometry with only parameter-space monotonicity as the safety argument.
- **Extractor mechanism mismatches** (the two new extractors): **ArtDeco's**
  dominant feature is a **C0 t-step jump** (horizontal band, `styles.wgsl:632`),
  invisible to a `marchingSquares(∂r/∂u)` trace — it needs the horizontal-line /
  `CreaseTWarp` family. **Crystalline's** dominant relief is a non-helical ~8.5mm
  17-fold `crAsymmetry` ripple (`styles.wgsl:599`) — a **density** problem; only 12
  of ~38 extrema are true creases, and `crHeightPhase=0` makes the helix slope 0
  (`chooseHelixGrid` refuses → must route to `CreaseUWarp`).
- **Inner wall carries full sharp relief** (`inner = outer − tWall`,
  `adaptive_mesh.wgsl:132-134`) but gets no feature edges (`WatertightAssembly`
  omits them) → general-curve styles can straddle on the inner wall.

---

## 3. Fix architecture — three mechanisms (relief-independent), re-prioritized

### 3.1 Complete feature edges (the DOMINANT fix — was §3.2)

Every sharp model feature must be a real mesh edge so no flat triangle spans it
(the 3.39mm straddle class). Watertight-by-construction (grid-line registry +
crease warps); NO post-hoc repair.

- **Un-defer SFB born petals** (`SF_CREST_FULL_HEIGHT_SPAN` 0.85→~0; insert born
  crests with exact birth-point endpoints on grid lines).
- **Build ArtDeco** — but as **horizontal-band C0 t-step edges** (the dominant
  feature; model on `extractDragonScales`/`CreaseTWarp`) PLUS in-u fan + diagonal
  chevron cusps only where their amplitude exceeds tolerance after sizing. (NOT a
  `marchingSquares(∂r/∂u)` trace — that misses the t-step.)
- **Build Crystalline** — insert the **12 true apex creases** via the helical
  family (k=`crFacetCount`, turns=`crHeightPhase·crSubFacets` from live params),
  with a `crHeightPhase≈0 → CreaseUWarp` branch. The ~8.5mm asymmetry ripple +
  sub-facets are resolved by **density** (§3.2), not edges.
- **Complete partial extractors** (BasketWeave non-axis, CelticTriquetra
  braid/medallion, GothicArches full) + **t-band edges** (`CreaseTWarp`) for
  segmented styles.
- **Inner-wall feature edges** for general-curve styles (measure first — §6).
- Smooth styles stay edge-free (correctly `()=>[]`); resolved by density (§3.2).

### 3.2 Adaptive sizing — ADEQUATE; analytic-curvature sizing CUT (measured)

**Rev 3 result: the production adaptive sizing already meets tolerance on crest
flanks** (0.006mm median, 1% over tol; true in-scope residual = 4 triangles =
0.06%). The dormant `curvatureFloor`/`maxKappa` hooks (`MetricSizingField.ts:49,55`)
do NOT materially help (1%→1%, +0.24 quadtree levels) — the cusp tip they would
target is an inserted EDGE, and the sampler reads the finite *flank* curvature
fine. **So no sizing work is planned.** The hooks remain available (documented) if
a future cross-style measurement surfaces a real sizing residual; smooth
high-frequency styles (FourierBloom/Wave/Ripple) should be CHECKED with the
cross-style edge-vs-flank probe — if any shows a clean-body flank residual, the
hooks are wired then, gated by its own measurement (not pre-emptively).

### 3.3 Verify-and-lock exact per-vertex eval + finiteness refusal (was §3.1, demoted)

Production final positions are already exact GPU eval — do NOT re-implement.
Instead: (a) a CPU **contract** test pinning that the evaluated `(u,t)` list ==
`mesh.vertices` u,t columns with connectivity unchanged; (b) add a **finiteness
pass** on `pos3D` that refuses/reports (honest refusal) rather than relying on the
writer's silent `[0,0,0]` origin-collapse (`stlExport.ts:380-382`). The
`surfaceFidelityExact` flag's real gating target becomes the **sizing change**
(§3.2), where flag-off/on genuinely differ.

### 3.4 Cross-cutting gates (new, from the red-team)

- **Geometric validity:** add `foldedTriangles == 0` (signed per-triangle normal
  vs area-weighted pseudo-normal; reuse `countFoldedTriangles` **unconditionally**)
  to the shared gate; `detectSelfIntersections` as a warning. Fold risk comes from
  edge insertion + warps (§3.1), not decimation.
- **Config-aware truth:** the gate evaluates the true surface from the **same
  packed params + dims the export uses** (config an explicit, echoed argument).
- **Byte-level fidelity:** the ship gate measures the **round-tripped STL/3MF
  bytes** (post weld/orient/quantize), not just the in-memory mesh.
- **Budget honesty:** decouple the fidelity ceiling from the 6M profile budget;
  cap-coarsen/decimate beyond tolerance → honest refusal; fix the
  `effectiveMaxSagMm = capScale·qMaxSag` telemetry (sag ∝ edge², not linear).

---

## 4. Per-class fix mapping (corrected)

| class | styles | dominant error | fix |
|---|---|---|---|
| smooth | Harmonic, Superellipse, Fourier, Wave, Ripple, SpiralRidges | chord (sampler-blind κ on high-freq) | §3.2 exact-curvature density |
| medium sharp | SFB, GeometricStar, GothicArches, GyroidManifold, HexagonalHive, LowPolyFacet, Voronoi | straddle (partial edges) + §3.2 | §3.1 edges + §3.2 |
| fine detail | DragonScales, CelticKnot, CelticTriquetra, BasketWeave | straddle (missing/partial edges) | §3.1 (mandatory) + §3.2 |
| t-step / segmented | ArtDeco, BambooSegments, BasketWeave | C0 t-step jump | §3.1 `CreaseTWarp` band edges |
| ripple + creases | Crystalline | 8.5mm density ripple + 12 creases | §3.1 (12 creases) + §3.2 (ripple) |

---

## 5. Watertightness (must hold; reconcile the export-boundary weld)

Carried by: (a) feature insertion via the grid-line registry + crease warps
(watertight-by-construction); (b) exact eval leaves connectivity unchanged; (c)
2:1 balance + caps shared-by-index. **New:** the STL writer's `orientMeshForSTL`
0.001mm weld + re-orientation is 10× looser than the construction weld
(`WELD_TOL_MM=1e-4`) — exact-eval onto a cusp can land distinct vertices in
(1e-4, 1e-3) that the export gate then welds into a manufactured boundary edge.
Thread `topologyWeldToleranceMm: WELD_TOL_MM` into the conforming export's
`assertMeshExportable`, and assert construction-weld == export-gate weld. Add
`foldedTriangles = 0` to the gate (§3.4). No new center-fan/T-junction repair.

---

## 6. Scope

- **OUT (accepted):** triangle slivers/min-angle; the periodic u-seam cliff (the
  surface is genuinely non-periodic for non-integer petal counts — the seam weld
  spans a real ~11mm discontinuity; accepted, explored later); base/rim cap
  *triangle* quality (flat → ~0 surface error).
- **IN (newly, narrow):** **inner-wall** feature edges for general-curve styles
  (measure the inner straddle first; the warps already pin warp-styles' inner
  creases). Geometric-validity, byte-level, budget-honesty, config-aware gates.
- **FUTURE (#3):** the CPU-truth mirror omits `compute_twist` + Gaussian `bellAmp`
  — but these are **azimuth-only / t-only** and do NOT move (u,t) feature loci
  (`adaptive_mesh.wgsl:118-124,784-789`; refuted red-team finding), so extractors
  are correct under global twist/bell; a CPU-truth probe for twisted/belled presets
  is still deferred. (Per-STYLE packed twist — BasketWeave/SpiralRidges — IS in
  scope and already received by extractors.)

---

## 7. Rejected / refuted alternatives (binding)

| idea | why rejected | evidence |
|---|---|---|
| Exact per-vertex eval as the dominant fix | production positions are ALREADY exact | `verify_rebaseline_realpath` PART A; `:2701` |
| Denser sampler (DENSE_RES↑) for (1a) | finite grid can't resolve the cusp; only +0.55 levels @1024 | `verify_rebaseline_realpath` PART B2 |
| `marchingSquares(∂r/∂u)` for ArtDeco | misses the dominant C0 t-step (no ∂r/∂u sign-cross) | `styles.wgsl:632` |
| 12 helical creases alone for Crystalline | misses the dominant 8.5mm density ripple | `styles.wgsl:599` |
| Gate truth = `STYLE_FUNCTIONS({})` | config-blind → 17.5mm spurious on default | `verify_rebaseline_realpath` PART D |
| e2e gate vs `gpuExport.generateMesh()` | GPU-grid reference flattens the same cusps | `FidelityHookMount.tsx:75` |
| Feature-aligned / Route-B triangle-quality rebuild | solves min-angle, not fidelity; slivers accepted | user reframe |
| Threading global twist/bell into extractors | global twist/bell don't move (u,t) loci | red-team (refuted) |
| Post-hoc weld / T-junction-split / repair | banned (legacy defect factory) | project history |

---

## 8. Pre-registered Stage-0 gates (define "done")

All measured in 3D vs the **config-aware** exact surface, seam excluded (band
sized from the mesh's finest seam cell), tolerance 0.05mm:

1. **Edge-coverage gate (dominant):** every sharp style's features are inserted as
   edges — **no triangle straddles an inserted locus** (the `verify_worstTriangle`
   straddle classifier, exact CPU eval, current mesh — genuinely red→green). Born
   petals inserted; ArtDeco (t-step) + Crystalline (12 creases) extractors exist.
2. **Sizing-adequacy gate (1a, confirmation not fix):** the cross-style
   edge-vs-flank probe (`verify_edgeVsFlank_adaptive`) shows ~0 CLEAN-BODY flank
   triangles >tol per style (edges + seam explain the residual). If any style
   shows a real clean-body flank residual, THEN wire the dormant
   `curvatureFloor`/`maxKappa` for that style — gated by its own measurement.
3. **Exact-eval contract gate:** the evaluated `(u,t)` list == `mesh.vertices`;
   flag-off byte-identical; finiteness pass refuses non-finite `pos3D`.
4. **Config-aware fidelity gate:** the gate truth = the export's packed params +
   dims; the DEFAULT (smooth, `sf_strength=0`) SFB export is faithful to the
   smooth pot; the cranked (SFB@1) export ≤ tol. (Replaces the config-blind
   `verify_crossStyleFidelity` baseline.)
5. **Geometric-validity gate:** `foldedTriangles = 0`; `boundaryEdges = non-manifold
   = orientation-defect = 0` with construction-weld == export-gate weld; self-
   intersections reported.
6. **Budget gate:** residual chord < tolerance within the resolved fidelity ceiling;
   honest refusal fires (no silent cap-coarsen/decimate over tol); measured on the
   FINAL post-cap, post-decimation mesh at the default `high` profile.
7. **Byte-level + end-to-end gate (#2):** a REAL WebGPU export of each style
   (default + high-relief), sampled from the **round-tripped STL/3MF bytes** vs the
   **analytic** surface (not the GPU-grid reference), deviates < tolerance — or
   records an honest refusal. (Hardware/headed-GPU gated; CI via a committed
   real-export fixture if no GPU runner.)

---

## 9. Honest residual risks

- **ArtDeco + Crystalline extractors are new code** with corrected mechanisms
  (t-step band / 12-crease + density). Their family decomposition must be measured
  first (the `verify_styleSharpnessClass` uStep/tStep classifier already does this).
- **Analytic `curvatureFloor` per style** is the load-bearing new sizing input;
  it must be cusp-aware (bounded by `maxKappa`) and wired into BOTH the field and
  the quadtree cell-size test.
- **Budget vs profile ceiling:** decoupling the fidelity ceiling from 6M may push
  feature-dense styles toward the slicer cap → honest-refusal regime; tabulate the
  achievable tolerance per style/config.
- **e2e (#2) is hardware-gated** and currently has the wrong reference; the gate
  must be re-pointed at the analytic surface and the STL bytes.
- **Inner-wall coverage** is newly in scope — measure the inner straddle before
  adding edges (it may be narrow).
