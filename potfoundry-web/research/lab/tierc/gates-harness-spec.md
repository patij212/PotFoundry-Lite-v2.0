# Tier-C Gates Harness — Inventory + Composition Spec

**Program:** PROD-TIERC, Phase 0 (design only). **Deliverable:** D0.2 (gates-harness inventory) per
`research/lab/2026-07-11-tierc-productionization-charter.md` §6.
**Method:** file reads + `git log` only — no vitest/build runs, no heavy compute (per the charter's Ops
protocol §8 and this arm's hard constraints). Every claim below is either a direct file citation
(`path:line`) or explicitly marked **OPEN** where I could not verify it from static reading. Nothing here
is guessed.
**Status:** design artifact. Does not touch production code. `research/lab/tierc/` did not exist before
this file (verified: `ls` returned no directory) — no prior Phase 0 output exists to reconcile against.

---

## 0. How to read this document

Section 1 inventories the PROVEN instrument for each of the charter's seven gates (G1–G7): what it is,
where it lives, what validated it, what it costs, and its caveats — including several places where the
"proven instrument" turns out to be 3–4 independent near-duplicates, or where the gate has **no**
instrument yet. Section 2 covers triangle-quality (the needle problem). Section 3 proposes the composite
harness's entry point and ndjson row schema, built from the *existing, working* composition in
`research/bridge/_prod_truth.test.ts` rather than a new design. Section 4 is the gap list.

One finding threads through the whole document and is worth stating up front: **there are two live
metrology stacks that don't share code** — a research-only stack (`research/bridge/labkit.ts` and friends,
warp-agnostic, arbitrary `rA(θ,z)`, no `src/` import allowed) and a production-ported stack
(`src/renderers/webgpu/parametric/conforming/tierC/*`, proven only at **patch scale** on **two** styles,
and explicitly **unsupported on warped/spin surfaces** — it throws). The Tier-C head-to-head in Phase 1
needs to decide, per gate, which stack the harness scores against. My recommendation is inline per gate.

---

## 1. Per-gate instrument inventory

### G1 — forward surface error ≤ 0.01 mm, every facet

**The proven composition** (not a single function — a pipeline, already working end-to-end in
`research/bridge/_prod_truth.test.ts:174–256`, gated `PF_PT_PRESCREEN=1`):

| Stage | Function | File:line | What it does |
|---|---|---|---|
| 1. Prescreen | inline loop using `denseBary(8)` | `_prod_truth.test.ts:174–208` | Dense 45-pt same-(u,t) **radial** upper bound per facet. A facet whose 45-pt lattice is radially ≤ tol is proven green *on the same dense basis the acceptance guard uses* — radial is a strict upper bound on true nearest distance, so this is exact-count-equivalent to scoring everything, not an approximation ("FAST-HONEST-RULER", comment at `_prod_truth.test.ts:40–43`). Survivors only proceed to stage 2. |
| 2. Whole-mesh honest ruler | `scoreWholeMeshInterior` | `research/bridge/_pf_rebaselineRuler.ts:105` (GN-screen/brute-confirm logic `:85–99`) | Per survivor facet: Gauss-Newton (`projectPointToRadialSurface`) first; if `gn ≤ gnScreen` (=tol) accept as green; if `gn > 5·gnScreen` confirm with `bruteNearestOnRadialSurface` and keep `min(gn,brute)`. No top-N cap — every scored facet counts. |
| 3. Worst-point re-score | `newtonNearest` | `research/bridge/_gyroid_truthLib.ts:103–198` | Grid-free multi-start Gauss-Newton (radial-anchor θ-window sized from the local radial bound, dense z-seeds, **plus** a coarse-grid "basin insurance" fallback for seeds that miss the well entirely, `:158–196`) applied **only to the single worst point** found by stage 2, as a tighter valid upper bound (`_prod_truth.test.ts:246–256`). |

Validated by: `_gyroid_truthLib.ts` header (`:1–13`, E-2026-07-08-GYROID-TRUTH) states `newtonNearest` was
cross-checked against the truth-grade brute on the worst-500 facets (`maxdiff<0.001, no false-0s`), and
the module comment at `:88–92` records `newtonSeeded == windowed brute8192 == FULL brute8192` to machine
precision on the 3 worst Gyroid facets. `scoreWholeMeshInterior`'s GN+brute composition is the ruler the
whole DRIVE-ALL-20 campaign scored against (`research/lab/2026-07-09-drive-final-scorecard.md:4–6`).

**A precondition, not optional:** `_prod_truth.test.ts:146–160` runs a `vertexOnSurf` check (every outer-wall
vertex's radial position must equal `rA(θ,z)` to within `tol`, exact for a `spin=0` capture) and sets
`interiorRulerPremiseOk = vStats.p99 <= TOL`. If this fails, the interior ruler's premise (that the mesh is
parameterized as a single-valued radial surface at all) is false and downstream numbers are **recorded but
flagged UNTRUSTED** — this precondition must be ported verbatim into the composite harness, not dropped.

**The production port (patch-scale only):** `src/renderers/webgpu/parametric/conforming/tierC/interiorRuler.ts`
re-implements the same two-stage idea (`facetInteriorHonest:239–334`, `scoreWholeMesh:444–454`,
`assertWholeMeshZero:468–482`) as a `src/`-legal port of `research/bridge/_pf_perfectMesherBruteLib`
(module doc `:1–21`). **Hard scope limit:** `radialSurfaceFromSampler` (`:49–74`) *throws* if the sampler's
azimuth deviates from `2πu` by more than 1e-3 rad — i.e. it explicitly rejects spin/twist-warped surfaces.
It is proven only via `wholeMesh0Outlier.test.ts` patch gates on GothicArches/GeometricStar at 2%–10% of
wall area (`runPatchGate`, `:48–103`; full-pot patches are gated `PF_TIERC_WHOLEMESH=1` and take
multi-hour-to-day single-thread, per the comment at `rebaseline20.test.ts:56–62`).
**Recommendation:** the Tier-C head-to-head harness should score G1 against the **research-side**
composition (warp-agnostic, operates directly on `buildRadiusFn`'s `rA`), not the `tierC/interiorRuler.ts`
port — the port's own scope note disqualifies it for any warped style (SpiralRidges' helix is central to
this program's G1 evidence, per the charter's champion table).

**Duplication found:** the 45-point dense barycentric lattice (`denseBary(8)`, 45 pts, "≥36 mandated" per
`_pf_bvhRuler.ts:94`) is independently defined **three times**: `_gyroid_truthLib.ts:203–207`,
`_pf_bvhRuler.ts:91–95`, `tierC/interiorRuler.ts:100–106`. Same lattice, same formula, three copies — a
labkit-promotion candidate (see Gap List #1). `bruteNearestOnRadialSurface` (full-azimuth grid + box-refine)
similarly exists three times: `labkit.ts:232–254`, `_gyroid_truthLib.ts`'s K-best variant `bruteTruth:36–78`,
and `tierC/interiorRuler.ts:152–220`.

**Cost profile.** No instrument in this inventory has been benchmarked at exactly the charter's reference
scale (~3M-tri outer wall) — I mark that number **OPEN**. Real measured numbers at their *actual* tested
scale, from `research/lab/2026-07-10-program-consolidation.md` §C (Perf ledger):
- prescreen + shard scoring: **36 min → 382 s** (~5.6×) "on Voronoi-class artifacts" (exact tri count not
  stated in that line — OPEN).
- Newton per-query: **71 ms** (stratified; "3× better than banked 205 ms") — applied once per style in the
  proven composition (worst-point only), so its aggregate cost is negligible next to stage 1–2.
- Whole-mesh **unscreened** brute-anchoring (no prescreen) is documented as infeasible at scale:
  `labkit.ts:348` (`bruteAnchoredRedPerp` doc) states whole-mesh brute anchoring is "~3.4h" at ~2,700 red
  facets — this is why the prescreen stage exists at all.
- tierC patch gate: Gothic smoke patch (2% wall area) ≈ 6 min single-thread; full-pot extrapolated "~50×
  the facets and superlinear" (`rebaseline20.test.ts:58–62`) — i.e. not tractable serially at whole-pot
  scale without the parallel scorer (see §3).

**Known truth-bridge bug feeding this gate:** SuperformulaBlossom's CPU-truth default is missing a
`strength` field (`src/geometry/types.ts:548`, per charter §7) — the G1 ruler's premise is false for that
style until fixed; the harness should surface this as a `truthBridgeOk` flag, not silently score garbage.

---

### G2 — reverse coverage ≤ 0.01 mm

**Instrument:** `buildRefLocator` — `research/bridge/_sharp3dRef.ts:193–275`. A flat-CSR (no per-cell
Map/array) uniform spatial hash over reference triangles by AABB, queried via expanding cube shells with a
visited-stamp array (no per-query Set), using the exact Ericson closest-point-on-triangle test
(*Real-Time Collision Detection* §5.1.5, `pointTriDist2:144–186`). Ships with its own brute-force
`bruteDist` for adversarial self-check.

**The proven composition:** `_prod_truth.test.ts:259–344`.
- Reference = the OUTER-WALL submesh itself (`ref: RefMesh = { xyz: refXyz, idx: outer.idx, ... }`, `:262`)
  — i.e. this is point-to-mesh, not point-to-analytic-surface.
- Locator cell sizing rule (banked V10 perf lesson): `cell = clamp(0.4, avgEdgeLen × 4, 3.0)` (`:264–274`).
- Sample lattice: dense **1024×1024** points on the TRUE analytic surface (`NU=1024, NT=1024`, `:276`),
  each queried against the locator for nearest-mesh distance.
- Worst cell gets a **4× local refinement** (±8 cells at ¼ pitch, `:296–307`).
- **Boundary bands** (t=0/t=1 attachment rings, `bandMm=0.5`) are sampled and reported **separately**
  (`:309–318`) — not folded into the main coverage stat, per pre-registration.
- **Adversarial locator-vs-brute self-check** on 24 random samples, asserted `< 1e-9` (`:320–327,343`) —
  this is instrument hygiene, not a fidelity claim, and the probe is explicit that it "never asserts
  fidelity... it asserts only its own instrument hygiene" (`:340–341`).

**A second, independent use of the same primitive:** `research/bridge/_pf_bvhRuler.ts` builds a *dense
triangulated twin* of the analytic surface (`buildRadialTwin:38–64`) and locates against it via the same
`buildRefLocator`, to **cross-validate the G1 ruler itself** (Q1 "ratio study", `ratioStudy:126–190`) — an
independent implementation-of "nearest point on the object surface" used to catch cases where the analytic
GN/brute ruler over- or under-states on steep facets. This is a different *purpose* (forward-ruler audit,
not reverse coverage) built on the same locator code — worth knowing they share a primitive but answer
different questions.

**Cost:** locator self-check is O(24) queries (negligible). Main cost is locator build (∝ outer-mesh tri
count) + 1,048,576 lattice queries + 289 refine queries. No isolated wall-clock for this stage was found in
what I read (it's folded into each style's `totalMs` in `_prod_truth.test.ts`) — **OPEN**.

**Caveat:** coverage is scored **only against the outer-wall submesh** (production's own `surfaceId` mask,
captured via `_debugOuterMesh()` in `e2e/_prod_truth_capture.mjs:97–100`). Inner wall, rim, base, cap are
not covered by this ruler — this is a direct link to the G7 gap (assembly-specific checks, below).

---

### G3 — watertight + orientation

**Watertight — canonical instrument:** `nonManRawBig` / `nonManRawBigStats` — `research/bridge/labkit.ts:91–147`.
Map-cap-free by construction: packs each undirected edge into one sortable key (Float64 for `maxIdx < 2^26`,
BigUint64 fallback otherwise — exact for all u32 indices), sorts, and does a linear run-length scan for
multiplicity > 2. This exists specifically because JS `Map` caps at ~2^24 entries, so any Map-based audit
dies above ~5.6M tris (`labkit.ts:104–108`). Non-vacuity is regression-tested: `labkit.test.ts:27–53`
asserts an injected 3rd-triangle-on-a-shared-edge moves the count, and separately asserts exactness above
the `2^26` Float64 boundary.

**Duplication — the charter asked me to verify current labkit state before assuming a dedup is still
needed. Verified directly (not inferred):**
- `research/bridge/_pf_tangledKernelLib.ts`'s `auditNonManRaw` **already delegates** to `labkit`'s
  `nonManRawBig` (confirmed: `LAB-CHEATSHEET.md:44–47`, "deprecated alias"). Git history confirms the
  mechanism: commit `0192a6f2` ("_prod_truth probe — large-mesh-safe watertight audit... **4th copy flagged
  for labkit promotion**") is the moment this was caught. **This dedup is DONE — remove it from any future
  gap list**, it is not open work.
- Still independently implemented (not importing `labkit`):
  1. `src/fidelity/metrics.ts` `topologyMetric:1033–1094` — production, `src/`-legal (cannot import
     `research/`), sort-based (same numeric-key trick as `nonManRawBig`, ported independently — see
     comment at `:1034–1040` citing the *same* Map-cap crash class), and does non-manifold + boundary +
     orientation in **one pass**. This is a legitimate, necessary fork (the research/`src` import boundary
     forbids collapsing it into `labkit`), not laziness.
  2. `src/geometry/exportValidation.ts` `validateMeshForExport:238–316` — production, but still
     **`Map<string,EdgeUse>`-keyed** (the *old*, capped style `metrics.ts` moved away from). Currently fine
     at typical export sizes but the same latent risk class if a Tier-C export approaches the 8–10M-tri
     budget ceiling on *this specific code path* (every export goes through it; it's not a research probe).
  3. `src/renderers/webgpu/parametric/conforming/tierC/wholeMesh0Outlier.test.ts` — a **local**,
     test-file-scoped `nonManifoldByIndex:19–37` (`Map<string,number>`-keyed), whose own comment says it
     "mirrors the labkit ruler" (`:16–18`). This one genuinely could import a shared `src/`-side helper
     instead of hand-rolling — see Gap List #2.

**Orientation:**
- `src/fidelity/metrics.ts` `topologyMetric` — `orientationMismatches` (a manifold edge whose two uses are
  not exactly one forward + one reverse), computed in the same pass as non-manifold/boundary
  (`:1033–1094`). This is the field `e2e/export-fidelity.spec.ts:136,184–189` asserts on.
- `src/geometry/exportValidation.ts` — its own `orientationMismatches` **plus** a genuinely different check
  I found nowhere else: a **global signed-volume "inside-out" test** (`signedTetraVolumeMm3` summed over
  all faces, `:295`, gate at `:329–340`) — per-edge winding-pair agreement (local) doesn't catch a mesh
  that is *entirely* consistently wound but globally inverted; the signed-volume check does. Worth pulling
  into the composite harness as a distinct G3 sub-check, not folded into "orientation mismatches."
- `orientOutward` (`src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts:820+`) is the **fix**,
  not a gate — it flips windings; the *detection* side for production is `topologyMetric` /
  `exportValidation.ts`, not this function.

**Weld-tolerance inconsistency (a genuine cross-instrument caveat, not just naming):** `auditNonManByIndex`
defaults to `quantizeMm=1e-4` (`labkit.ts:66`); `exportValidation.ts`'s topology weld defaults to
`topologyWeldToleranceMm=0.001` (`:29,174`) — **10× looser**. At a 0.01 mm gate, a 0.001 mm vs 0.0001 mm
weld tolerance can plausibly change whether two near-coincident seam vertices count as "the same vertex."
The composite harness should pick one weld tolerance explicitly and state it in the row schema (§3), not
inherit whichever default a called library happens to use.

---

### G4 — zero non-manifold / zero-area

Non-manifold: see G3 (same instrument family).

**Zero-area: no canonical instrument exists in `labkit`.** This is the one the charter's phrasing
("cite the zeroArea instrument") implies is already unified — it is not. Found, independently:

| Location | Threshold | Also catches |
|---|---|---|
| `_prod_truth.test.ts` `zeroAreaCount:82–92` | area ≤ **1e-12** mm² | cross-product-area triangles only |
| `tierC/collapseDegenerate.ts` `countZeroAreaFaces:27–40` | area ≤ **1e-6** mm² (default) | same, but **6 orders of magnitude looser default** |
| `src/geometry/exportValidation.ts` inline (`:276–293`) | area ≤ 1e-12 mm² | **plus** repeated-index degenerate, **plus** post-weld-collapse (two distinct vertices that become the same *after* geometric weld) — the most rigorous of the four |
| `src/fidelity/metrics.ts` `triangleQuality3D` (`:705–712`) | area ≤ 1e-12 mm² | folds into `degenerateCount`, feeds `sliverCount` |

The 1e-6 vs 1e-12 disagreement is real and load-bearing at CAD-fidelity scale: a facet with area
1e-8 mm² reads "degenerate" under the `tierC` default and "fine, just tiny" under every other instrument.
`tierC/collapseDegenerate.ts` is itself validated ("Gothic 36→0 zero-area, 77 verts welded, 0-outlier held",
doc `:1–12`, VALIDATION-6) at *its own* threshold — I did not find evidence the 1e-6 default was chosen
deliberately vs. inherited; **mark the reason OPEN**.

**Recommendation:** promote one `zeroAreaCount(xyz, idx, areaFloorMm2)` into `labkit.ts` (mirroring the
`nonManRawBig` promotion precedent), default it to **1e-12** (matching 3 of 4 existing call sites and the
production `exportValidation.ts`/`metrics.ts` convention), and have the composite harness call the `tierC`
variant only where its own 1e-6 default is *specifically* what's being tested (its own collapse gate).

---

### G5 — no unacceptable feature bridging

**There is no single "bridging" instrument.** What exists is three separable, complementary signals, and
the charter's own principle P3 ("never bridge incompatible surface regions") is enforced *topologically*
(by construction) rather than measured after the fact:

1. **Detector fidelity** (necessary, not sufficient): `detectFeatures` —
   `src/renderers/webgpu/parametric/conforming/featureGraph/detectFeatures.ts:209` ("Two-scale
   detectFeatures orchestrator", header `:2`) unifies curvature-ridge, normal-discontinuity, and
   component-boundary detectors (`curvatureRidge.ts`, `normalDiscontinuity.ts`, `componentBoundary.ts`) via
   `unify.ts` into a `FeatureGraph`. Validated against **brute-force dense ground truth**
   (`groundTruth.ts`'s `denseFeatureGroundTruth` = union of ridge+crease+wall truth, per commit
   `7a845d6b`) in `featureGraph/validation.test.ts`, scored by `fidelityMetric.ts`'s `fidelity()`
   (`:142–165` — periodic-u-aware arclength recall/precision) at `GATE_THRESHOLD = 0.9` for **both** recall
   and precision, across all 20 styles (`validation.test.ts:229` region; assertions ~`:542–548`; commits
   `32859370` "style-agnostic detector validation gate... 20 styles", `f4b64a74` "score detector vs
   dense-truth gate"). This tells you whether the detector *found the right lines* — not whether the final
   mesh respects them.
2. **Topology (the actual anti-bridging mechanism):** `buildProtectedComplex` —
   `src/renderers/webgpu/parametric/conforming/tierC/morseComplex.ts:512+`. Planarizes the multi-family
   feature 1-skeleton into an exactly non-crossing PSLG (module doc `:1–8`: "proven whole-mesh in research,
   `residualCrossings 0`, 100% recovery, watertight across junctions"). `residualCrossings === 0` is
   asserted directly in `wholeMesh0Outlier.test.ts:56`. This is P3 enforced *by construction*: locked
   constraint edges are re-passed unchanged to `cdt2d` on every re-triangulation
   (`tierC/noBridgeRefine.ts:9–12` states the causal chain explicitly — shared mesh edges ⇒ no facet
   interior straddles the cusp).
3. **Constraint recovery rate:** `research/bridge/constraintRecovery.ts` `recoverAndLockEdges` — a
   crossing-chain Lawson-flip walk (Sloan 1993 / de Berg ch.9 style, doc `:1–23`) that upgraded an earlier
   greedy walk from 83% to ~100% recovery on GothicArches (E-2026-06-30-FEAT-CONFORM-ALL20). It honestly
   reports `recoveryFailed` when a chain is blocked by an already-locked edge or an exact collinear vertex
   (`:29–33`) — a geometric bridging facet is, definitionally, one whose bounding feature edge is in that
   failed set.

**What "unacceptable bridging" means operationally, today:** no code synthesizes these three into one
verdict. The closest thing to a spatial correlation (does a G1 outlier sit near a *specific* unrecovered
feature edge, vs. just being a generic residual) **does not exist anywhere I found** — see Gap List #7.
For the harness, I recommend reporting all three signals per style (`detectorRecall`, `detectorPrecision`,
`residualCrossings`, `constraintRecoveryFailed`) and treating "no unacceptable bridging" as
`residualCrossings==0 AND constraintRecoveryFailed==0`, with detector recall/precision reported as an
upstream diagnostic, not folded into the same boolean — because a detector miss and a bridging facet are
different failure modes with different fixes.

**Scale caveat:** this whole chain (`morseComplex`/`noBridgeRefine`/`constraintRecovery`) is proven only at
**patch scale**, and only for the two count-unstable styles (Gothic, GeoStar) — same scope limit as G1's
production port, same root cause (`tierC` is patch-scale-proven; full-pot is documented integration scope,
`tierC/index.ts:169–171`).

---

### G6 — practical triangle, memory, and export-time budgets

**Triangle-count budget:** stated user policy, `research/lab/2026-07-09-drive-final-scorecard.md:12`:
"≤10M full-pot tris (prefer ≤8M)". Concrete measured per-style counts exist in that file's Tier tables
(`:16–61`, e.g. HexagonalHive 7.28M, GyroidManifold 6.61M, Crystalline 7.55M @ body, Voronoi 4.0M) and in
the PROD-BATCH all-20 capture run (`2026-07-10-program-consolidation.md` §F: CelticTriquetra 13.6M full
tris / 243 s the fleet heavyweight; LowPolyFacet 36 s clean; DS 131.3 s after retry, −88% vs the 1,113 s
pilot transient).

**Per-style manifest v1 — design only, not implemented.** `program-consolidation.md` §B sketches a
`StyleManifest { truth, features, closer, ruler, budget }` shape (`:22–42`). I grepped `research/` and
`src/` for `StyleManifest` and found **zero implementations** — it is a design comment in a markdown file,
not code. The harness's "style manifest row" input (per the mission brief) does not exist as a consumable
artifact yet; see Gap List #5.

**Export-time timing:** `e2e/_export_stage_timing_capture.mjs` drives one production-default export per
style via a DEV-gated `window.__pfFidelity.diagnoseStageTimings()` hook inside
`ParametricExportComputer.compute()` (script header `:1–19`; measurement-only, `import.meta.env.DEV`-gated,
never runs in production). Results already banked (`program-consolidation.md` §E, the PROFILER entry):
`assembleWatertight` = 94.1–98.8% of generate time (aggregate 97.4%); sub-split triangulation 48.3% /
budget-search 24.9% / duplicate final-quadtree-rebuild 23.8% (the last one **already fixed** — "guaranteed
final-quadtree reuse" ships, ~23% of export time structurally removed, re-capture pending). This is the
instrument to reuse for G6 timing — it already exists and is apples-to-apples with the `_prod_truth`
capture dims.

**Memory budget: zero instrumentation found.** I grepped `research/` and `e2e/` for
`heapUsed|performance.memory|memoryMB|process.memoryUsage` — no hits. There is currently no way to answer
"how much memory did this export use" anywhere in the lab or the e2e harnesses. This is a clean gap, not a
dedup problem — see Gap List #4.

**File-size budget (a G6 dimension the charter didn't name explicitly, but that's already gated in
production):** `src/geometry/exportValidation.ts` — `HARD_MAX_EXPORT_BYTES = 1024³` bytes (`:15`),
`estimateMeshExportBytes:142–161` (format-specific: STL/OBJ/3MF), warning at 75% of the cap
(`EXCESSIVE_SIZE_WARNING_RATIO`, `:30,345–348`). Worth including as a fourth G6 sub-field
(`fileSizeBytes`/`withinSizeBudget`) since it's already computed for free by any harness step that touches
`exportValidation.ts`.

---

### G7 — correct seam, inner-wall, rim, base, cap assembly

**What exists:** `e2e/export-fidelity.spec.ts` — the "SP0" 3D Export Fidelity Harness. Loops every
registered style via `window.__pfFidelity`, calls `computeFidelityMetrics` (`src/fidelity/metrics.ts:1324+`)
which bundles `sagDeviation`, `triangleQuality3D`, and `topologyMetric` into one row, writes
`e2e/fidelity/baseline.json`, and asserts one pinned invariant per dimension (`:169–199`).

**This is the gate project memory calls "faithful" — and it is, methodologically (real WebGPU, real
production `generateMesh`, not a UV-only unit test) — but three things about its *current state* matter a
lot for Tier-C and are easy to miss from the file name alone:**

1. **It is currently RED on 4 of 5 pinned dimensions, by design, at HEAD.** `test.fail()` wraps the sag
   (`:169–172`), quality (`:174–177`), watertight (`:179–182`), and orientation (`:184–189`) invariants —
   each comment says explicitly "RED at HEAD" and names the future sub-project (SP1/SP2/SP3) expected to
   flip it green. Only `featuresDropped == 0` (`:191–199`) is currently asserted straight, and it passes.
   The orientation comment is blunt: "every measured style has 1.5k–29k winding mismatches" (`:185–187`).
2. **Its sag tolerance is 10× looser than Tier-C's target.** `SAG_TOL_MM = 0.1` mm
   (`src/fidelity/types.ts:65`) vs. the charter's G1/G2 target of **0.01 mm**. A style that passes this
   gate today would not automatically pass Tier-C's bar.
3. **Its watertight check is explicitly outer-wall-only and known-open.** `:180–181`: "outer wall is open
   by design at HEAD" — matching the charter's own G7 framing that whole-pot assembly (seam+inner+rim+
   base+cap) is a distinct, harder claim than outer-wall topology alone.
4. It also runs at `TARGET_TRIANGLES = 500_000` (`:45`, "draft/standard-ish for matrix speed"), not
   production budget scale, and its dense reference is the GPU-uniform-grid mesh, not the analytic `rA` —
   a third methodological gap vs. the `_prod_truth` G1/G2 rulers (which use the analytic surface directly).

**What the metric *does* cover that's easy to undercount:** `buildNearestSurface`
(`src/fidelity/metrics.ts:266–400`, threshold `NEAR_VERTICAL_COS:237`) splits every test triangle by its
face normal — near-vertical (wall) triangles use the cheap radial metric, everything else (base, drain,
rim, **and** the sloped foot/base fillet) is measured by true nearest-point-on-dense-reference distance.
So base/rim/drain sag genuinely is being measured — it's just folded into one `maxSagMm`/`rmsSagMm` number
with no per-region breakout, so a rim defect and a wall defect are indistinguishable in the output today.

**Confirmed MISSING (assembly-specific, not found anywhere in the files read for this spec):**
- No seam-specific edge classification distinct from generic `boundaryEdges` (i.e. nothing that says "these
  N boundary edges are *supposed to be* the seam and should be zero after stitching" vs. a real hole).
- No rim/base/cap **region-specific** watertight or quality isolation — everything reduces to whole-mesh
  counts.
- No inner-wall-to-outer-wall stitching check beyond the whole-mesh topology totals.
- No drain-hole-specific check.
- `e2e/_v3_export_gate_verify.mjs` is a **different** kind of check — it drives the real v3 UI end-to-end
  (`ExportFooter.fire()`, real `useParametricExport`) to verify the export *gate itself* fires/doesn't-fire
  correctly (the DS-gate silent-failure fix, script header `:1–24`). It proves the button behaves, not that
  the geometry is assembled correctly.

**A partial mechanism already exists and is easy to miss:** `tierC/index.ts`'s `toOuterWallResult`
(`:91–127`) already tags the **outer wall's own** result with `seamTriangles: Uint8Array` (per-face,
derived from corner-u wrap span `:102–109`) and `bottomRing`/`topRing` (ordered boundary-vertex-index
arrays, `:111–118`). That's a real per-region tag — but it's scoped to the outer wall in isolation and I
found no evidence it survives into `WatertightAssembly.ts`'s final assembled mesh (rim+base+cap+inner wall
all get glued on downstream of this). Whether region tags propagate through `assembleWatertight` is
**OPEN** — I did not find a tag-propagation path in what I read, but I also did not read
`WatertightAssembly.ts` in full (it's the file the profiler says is 94–99% of export time; a full read was
out of scope for a read-only Phase-0 arm). This matters directly for Gap List #8.

---

## 2. Triangle-quality metrics (the needle problem)

**What's proven and already production-`src/` code** (not research/, unit-tested):

| Instrument | File:line | What it reports |
|---|---|---|
| `triangleQuality3D` | `src/fidelity/metrics.ts:676–735` | `maxAspect3D` (single worst), `minAngleDeg` (single worst, non-degenerate only), `sliverCount` (aspect > `ASPECT_MAX`), `degenerateCount` (area ≤ 1e-12, a subset of `sliverCount`) |
| `triangleQualityDistribution` | `metrics.ts:768–837` | Full **min-angle histogram** (0–60°, 61 integer bins), `p5MinAngleDeg`, `medianMinAngleDeg`, `meanMinAngleDeg`, `pctBelow10/20/30` |
| `crestBandTriangleQuality` | `metrics.ts:1852+` (GitNexus-confirmed: called by `diagnoseCrestQuality`, `crestQuality.test.ts`) | Same quality math, restricted to the crest band — narrower, serration-adjacent |
| Constants | `src/fidelity/types.ts:65,67` | `SAG_TOL_MM = 0.1`, `ASPECT_MAX = 100` |

**Why the distribution instrument matters for "the needle problem" specifically:**
`research/LAB-CHEATSHEET.md:43` states the discipline directly: "Slivers by minAngle
(`triangleQualityDistribution`, depth-invariant) — `%<20°` DILUTES under refinement." A single
`sliverCount` or `maxAspect3D` figure is exactly the kind of statistic that can be diluted by adding more
triangles elsewhere in the mesh without fixing the actual bad ones; the histogram/percentile form doesn't
have that failure mode. **This is the instrument the Tier-C head-to-head should gate on**, not
`sliverCount` alone.

**The Gothic/GeoStar needle concession, named precisely:** `metrics.ts:643–646`'s own doc comment defines
it: `degenerateCount` is "a genuine mesh defect"; `sliverCount − degenerateCount` is "the finite-area
high-aspect-needle count, the documented print-usable concession class (E-2026-07-09-EXPORT-PERF): positive
area, watertight, slicer-safe." `program-consolidation.md` §E confirms this was a deliberate production
gate change: `valid = manifold && normals && degenerates` — finite-area needles were demoted from
gate-blocking errors to warnings so DragonScales' default export would stop throwing. Per project memory
(`project_perfect_mesher.md`), this is also *why* the `tierC` flag stays off: "flip blocked on... sliver
concession" for Gothic/GeoStar specifically.

**Gap — small, well-scoped:** `sliverCount − degenerateCount` (the concession-class count) is not exposed
as its own named field anywhere; it's an implicit subtraction a caller has to know to do. Exposing it
explicitly (e.g. `needleCount`) would let the Tier-C harness make an *explicit, visible* accept/reject
decision on the same concession class instead of silently inheriting today's ad hoc threshold. Also
missing: an **area** histogram (only angle has one today — a needle can be low-angle-but-large or
low-angle-but-tiny, and those are different defects for a slicer). Both are S-effort (see Gap List #6).

---

## 3. Harness composition

### 3.1 What already works and should be reused, not redesigned

The composite harness is best understood as: **take the exact pipeline already proven in
`research/bridge/_prod_truth.test.ts`, keep its row shape and shard/breadcrumb conventions, and add the
gates it doesn't yet cover** (quality distribution, zero-area, G5 signals, G6 memory/manifest, G7
region-specific — all currently absent from that probe) as additional fields computed from the *same*
loaded mesh bins, not a second mesh load.

**Input contract (already proven, `e2e/_prod_truth_capture.mjs`):** two mesh artifacts per style —
`research/exchange/_prod_truth/<style>/{full,outer}.{xyz,idx}.bin` + `meta.json` — captured via Playwright
against real production `ParametricExportComputer.compute()` output (`full` = whole-pot,
`outer` = production's own `surfaceId`-masked outer-wall submesh via `_debugOuterMesh()`). This is the
"mesh artifact bins" half of the mission's proposed entry-point signature, already implemented.

### 3.2 Proposed entry point

```ts
// research/bridge/tierc/gatesHarness.ts (NEW — see Gap List #6)
function scoreAllGates(
  bins: { full: BinMesh; outer: BinMesh },      // loadBinMesh, _pf_bvhRuler.ts:383-390
  styleTruth: { styleId: StyleId; rA: AnalyticRadiusFn; H: number },
  manifestRow: StyleManifest | undefined,        // undefined until Gap List #5 lands; degrade gracefully
  opts: {
    tolMm?: number;                               // default 0.01
    shard?: number; nShards?: number;              // PF_PT_SHARD / PF_PT_NSHARDS convention (§3.3)
    breadcrumbPath?: string;                       // PF_PT_BREADCRUMB convention (§3.4)
    prescreen?: boolean;                           // default true — the FAST-HONEST-RULER lever
  },
): GatesRow;   // appended to research/exchange/tierc/gates.ndjson
```

This is a thin composition wrapper, not new metrology — every field below already has a proven function to
call (cited per-gate in §1), except where marked from Section 4.

### 3.3 Row schema

One ndjson row per **(style, shard)** for the sharded stages, plus one `merged:true` row per style after
merge (exact precedent below). All distances are millimetres; all times are milliseconds; every `basis`
string names the *actual* ruler composition used, not a generic label, so two rows are only comparable if
their basis strings match.

```jsonc
{
  "runId": "…", "at": "2026-…", "style": "GyroidManifold",
  "dims": { "H": 120, "Rb": 40, "Rt": 50, "expn": 1 },   // TANGLED_BASE convention, _prod_truth.test.ts:34
  "tolMm": 0.01,
  "shard": 0, "nShards": 4, "merged": false,              // PF_PT_SHARD/NSHARDS; merged rows set merged:true

  "truthBridge": { "ok": true, "note": null },            // SuperformulaBlossom-class premise failures surface here, not silently

  "g1_forward": {
    "basis": "prescreen45(dense-radial-upperBound) -> scoreWholeMeshInterior(GNscreen+bruteConfirm-if-gn>5x) -> newtonNearest(worstPointOnly)",
    "nFacets": 0, "survivors": 0, "outliers": 0,
    "maxMm": 0, "p50Mm": 0, "p90Mm": 0, "p99Mm": 0,
    "newtonWorstMm": null,                                 // null when no facet exceeded tol
    "vertexOnSurfP99Mm": 0, "rulerPremiseOk": true,        // the mandatory precondition, _prod_truth.test.ts:146-160
    "ms": 0
  },
  "g2_reverse": {
    "basis": "lattice1024x1024 + 4x-local-refine, boundaryBands(0.5mm)-separated",
    "maxMm": 0, "p99Mm": 0, "p50Mm": 0, "overCount": 0,
    "boundary": { "p99Mm": 0, "maxMm": 0 },
    "locatorCellMm": 0, "locatorSelfCheckMaxMm": 0,        // instrument-hygiene, not fidelity — must be <1e-9
    "ms": 0
  },
  "g3_watertight": {
    "weldToleranceMm": 0.0001,                              // STATE which of the two conflicting defaults was used (see §1 G3 caveat)
    "nonManRaw": 0, "nonManControlMoved": true,             // non-vacuity witness, MUST be true or the row is void
    "orientationMismatches": 0, "signedVolumeMm3": 0, "insideOut": false,
    "ms": 0
  },
  "g4_zeroDefect": {
    "areaFloorMm2": 1e-12,                                  // explicit, since tierC's own default (1e-6) disagrees — see §1 G4
    "zeroAreaCount": 0, "degenerateCount": 0,
    "ms": 0
  },
  "g5_bridging": {
    "detectorRecall": null, "detectorPrecision": null,       // vs dense truth, GATE_THRESHOLD=0.9 upstream signal
    "residualCrossings": null, "constraintRecoveryFailed": null,
    "verdict": "OPEN",                                       // no synthesized boolean exists yet — see Gap List #7; do not fabricate one
    "ms": 0
  },
  "g6_budget": {
    "triangleCount": 0, "policyMaxTris": 10_000_000, "withinTriBudget": true,
    "generateMs": null, "assembleWatertightMs": null,        // from diagnoseStageTimings(), when captured alongside
    "peakMemoryMB": null,                                    // OPEN — no instrument exists yet, see Gap List #4
    "estimatedFileSizeBytes": 0, "withinSizeBudget": true
  },
  "g7_assembly": {
    "wholeMeshBoundaryEdges": 0,                             // what exists today (whole-mesh, not region-specific)
    "outerWallSeamTriangleCount": null,                      // from tierC's own seamTriangles tag, OUTER WALL ONLY — see §1 G7
    "seamSpecificCheck": "OPEN", "rimCheck": "OPEN", "baseCheck": "OPEN", "capCheck": "OPEN",
    "innerOuterStitchCheck": "OPEN"                          // see Gap List #8 — do not fabricate a boolean here either
  },
  "quality": {
    "basis": "triangleQualityDistribution (depth-invariant, LAB-CHEATSHEET.md:43)",
    "minAngleDeg": 0, "p5MinAngleDeg": 0, "medianMinAngleDeg": 0,
    "pctBelow10": 0, "pctBelow20": 0, "pctBelow30": 0,
    "maxAspect3D": 0, "sliverCount": 0, "degenerateCount": 0,
    "needleCount": 0                                         // sliverCount - degenerateCount, exposed explicitly — see §2 gap
  },
  "totalMs": 0
}
```

Design notes:
- Every OPEN field is written as JSON `null` or the literal string `"OPEN"` (for enums), never a fabricated
  `0`/`false` — a harness that silently defaults an unmeasured gate to "pass" is worse than one that admits
  it doesn't know, per the project's own audit-first discipline.
- `g3_watertight.nonManControlMoved` and `g2_reverse.locatorSelfCheckMaxMm` are carried through unchanged
  from the proven probe as **non-negotiable non-vacuity witnesses** — a row where the control didn't move
  should be treated as instrument failure, not a clean pass.

### 3.4 Shard-parallelism

Reuse the `PF_PT_SHARD` / `PF_PT_NSHARDS` convention verbatim (`_prod_truth.test.ts:45–47`), not a new
scheme:
- Whole-artifact, cheap checks (G3 watertight, G4 zero-area, G1's `vertexOnSurf` premise, G2 coverage) run
  **shard-0-only** (`if (SHARD0)` pattern, `_prod_truth.test.ts:133,161,259,345`) — sharding these buys
  nothing and would require a merge rule for things like `locatorSelfCheckMax` that don't sum sensibly.
- Per-facet-expensive checks (G1 stage 2/3, quality distribution) shard by `f % NSHARDS === SHARD`
  (`_prod_truth.test.ts:196`; `_pf_bvhRuler.ts` `scoreWholeMeshBVH`'s `shard:{k,n}` param, `:225–237,269`,
  is the same pattern with a different call convention — worth reconciling to one signature before writing
  new code, not copying whichever is closer to hand).

**Merge — exact precedent, not a new design:** `research/bridge/_prod_truth_merge.mjs` (read in full for
this spec). The rule it implements, which the composite harness's merge step should copy: outlier counts
and scanned-facet counts **sum** across shards; `maxMm` **max**s, and `newtonWorst` is carried from
*whichever shard owns the global max* (each shard Newtons only its own worst facet — `:35–44`); shard-0-only
fields (nonMan, zeroArea, vertexOnSurf, coverage) are copied verbatim from the shard-0 row; **percentiles
(p50/p90/p99) are NULLED, not merged** (`:65–67`) — per-shard percentiles are percentiles of different
sub-populations and averaging or maxing them would be a fabricated number, so the merge script is explicit
that it doesn't attempt it. The merged row is tagged `merged:true` so downstream readers can filter partial
vs. final rows (`:47`).

**A second, different-granularity parallel option exists and is worth naming even though it's not the
recommended default:** `tierC/parallelScorer.ts` — an in-process `worker_threads` pool
(`ParallelScorerPool`, doc `:1–26`) with a **byte-identical mandate**: because facet scoring depends only on
the facet's 3 vertices + a serializable `GpuSurfaceSampler` grid, every worker reconstructs a bit-identical
surface, so the parallel `dev[]` is byte-identical to the sequential scorer and the aggregate reduction is
provably unchanged (regression-tested in `parallelScorer.test.ts`). This is finer-grained (thread pool
inside one Node process) vs. `PF_PT_SHARD`'s coarser OS-process sharding, and it is explicitly **not**
safe to import into the browser bundle (`tierC/index.ts:55–65` — pulling it through the barrel broke WebGPU
boot by externalizing `node:worker_threads`). For a Node-side gates harness this is a legitimate second
option; I recommend starting with the `PF_PT_SHARD` process-level convention (proven, simpler, matches the
mission brief's explicit ask) and treating `parallelScorer.ts`'s pool as a later perf optimization, not a
Phase-1 dependency.

### 3.5 Stage breadcrumbs

Reuse `PF_PT_BREADCRUMB` verbatim (`_prod_truth.test.ts:48–64`, the `crumb()` helper): env-gated (unset =
writes nothing, zero behavior change), `appendFileSync` one ndjson row per stage boundary
(`{style, shard, nShards, stage, pid, at, ...extra}`), **time-gated** so a watchdog can tell STUCK from
SLOW without the cadence itself scaling with facet count (the exact bug this fixes: "the previous
modulo-cadence tick fired every ~13–26 min at GothicArches' per-facet cost and straddled the 15-min stall
threshold", comment `:209–214`). Includes `pid` specifically so an external watchdog can kill a stalled
worker by exact PID/cmdline match (per the charter's Ops protocol §8: "Kill by PID/cmdline match — TaskStop
does not tree-kill").

**A precision note, not a contradiction:** the charter (§3, mission brief) describes this as "≤60s cadence."
The actual shipped code gates at **30,000 ms** (`_prod_truth.test.ts:224,283`: `if (Date.now() - lastTickAt
> 30_000)`). 30s satisfies a "≤60s" requirement, so this isn't a conflict — but the composite harness should
copy the *real* number (30s) rather than the charter's rounder paraphrase, since 30s is what's actually been
proven not to false-trigger a watchdog.

---

## 4. Gap list

Ranked roughly by how directly each blocks Phase 1 (the head-to-head prototype).

1. **[S] Promote `zeroAreaCount` into `labkit.ts`.** Four independent implementations, two different
   thresholds (1e-12 vs. 1e-6, tierC/collapseDegenerate.ts:30). Mirror the `nonManRawBig` promotion
   precedent (commit `0192a6f2`) exactly: one canonical function, default 1e-12, `tierC`'s looser default
   kept as an explicit opt-in for its own collapse gate. A few hours including a non-vacuity regression
   test in `labkit.test.ts`.

2. **[S] Replace `wholeMesh0Outlier.test.ts`'s local `nonManifoldByIndex` (`:19–37`)** with an import from a
   shared `src/`-legal helper. It cannot import `research/bridge/labkit.ts` (the `src`/`research` boundary
   is real and load-bearing, not an oversight), so this means extracting the non-manifold-count core out of
   `src/fidelity/metrics.ts`'s `topologyMetric` (or writing a tiny shared `src/`-side utility both
   `tierC` tests and `metrics.ts` import) rather than deleting the copy outright.

3. **[S/M] `src/geometry/exportValidation.ts`'s non-manifold audit is still `Map<string,EdgeUse>`-keyed**
   (`:238–316`) — the same capped-Map class `metrics.ts`'s `topologyMetric` already moved away from
   (comment at `metrics.ts:1034–1040` names the exact crash class). It runs on *every* export today, not
   just research probes, so it's the highest-exposure copy of the risk. Recommend `exportValidation.ts`
   call `topologyMetric` directly instead of re-implementing edge accounting — also closes the weld-
   tolerance mismatch (§1 G3, 0.001 vs 0.0001mm) by construction, since they'd share one code path.

4. **[M] Memory instrumentation — currently zero.** No `heapUsed`/`performance.memory`/`memoryUsage` call
   exists in `research/` or `e2e/` (confirmed by grep, no hits). Needs: a Node-side sampler
   (`process.memoryUsage()` at stage boundaries, reusing the breadcrumb timer cadence) plus a browser-side
   counterpart wired into the same `diagnoseStageTimings()`-style DEV-gated hook
   (`ParametricExportComputer.compute()` is already instrumented for timing — extending it for memory is
   the natural site). Needs a design decision on GC-volatility-robust "peak" sampling before it's just a
   wrapper.

5. **[M] `StyleManifest` does not exist as code** — `program-consolidation.md` §B is a markdown sketch;
   grep of `research/` and `src/` found zero implementations. The harness's own entry point (§3.2) wants a
   manifest row; recommend implementing only the fields the harness actually consumes now (`budget.maxTris`,
   `truth.fn` selection) rather than the full `features`/`closer` design, deferring the rest to Phase 1+.

6. **[M] Build the composite entry point itself (§3.2).** Today G1–G4 live in one probe
   (`_prod_truth.test.ts`), quality/G3-orientation live in a *different*, currently-red, looser-tolerance
   harness (`e2e/export-fidelity.spec.ts`), and G5/G6/G7 are scattered across `tierC/*` tests with no
   ndjson row output at all. This is the single biggest concrete build item in this spec — most of the
   difficulty is judgment calls about which OPEN fields (§3.3) to leave OPEN vs. stub with a real
   measurement, not new algorithm design. Also add: a first real benchmark run at the charter's own
   ~3M-tri reference scale (S-effort once the harness exists — today that number is OPEN everywhere).

7. **[M] Synthesize a single G5 "no bridging" verdict.** Currently three correlated-but-separate signals
   (detector recall/precision, `residualCrossings`, constraint-recovery-failed count) with no code that
   spatially correlates a G1 outlier facet to a specific unrecovered feature edge. The missing piece is not
   a new detector — it's a join between the G1 outlier list and the feature graph's failed-recovery edge
   list, keyed by (u,t) proximity.

8. **[M/L] Propagate region tags (seam/rim/base/cap/wall) through `assembleWatertight`'s output.** Half the
   mechanism already exists — `tierC/index.ts`'s `toOuterWallResult` tags `seamTriangles` and
   `bottomRing`/`topRing` (`:91–127`) — but scoped to the outer wall in isolation, and I could not confirm
   (without reading all of `WatertightAssembly.ts`, out of scope for this read-only arm) whether any tag
   survives into the final rim+base+cap+inner-wall-glued mesh. First task: read `WatertightAssembly.ts`'s
   `assembleWatertight` (`:448+`) to determine whether this is "wire existing tags through" (M) or
   "region tagging doesn't exist post-assembly at all" (L, since it would need the assembler itself
   changed, not just its output type).

9. **[S] Expose `needleCount` (= `sliverCount − degenerateCount`) as a first-class field** in
   `TriangleQualityResult` / the harness row, instead of an implicit subtraction callers must know to do.
   Lets the Tier-C head-to-head make an explicit, visible accept/reject call on the same needle concession
   Gothic/GeoStar already carry, rather than silently inheriting it.

10. **[S] Add an area histogram alongside `triangleQualityDistribution`'s existing angle histogram.** Only
    angle is currently binned (`metrics.ts:768–837`); a low-angle-and-tiny needle and a low-angle-and-large
    sliver are different defects for a slicer and currently indistinguishable in the distribution output.

11. **[Decision, not code] Score G1/G2 against the research-side composition, not `tierC/interiorRuler.ts`'s
    production port, for the head-to-head.** The port throws on spin/twist-warped surfaces
    (`interiorRuler.ts:49–74`) and is proven only at patch scale on 2 styles. Flagging this now so Phase 1
    doesn't accidentally build the harness around the narrower instrument by default (it's the one that
    lives in `src/`, so it's the "obvious" one to reach for).

---

*Sources cited throughout by path:line or commit hash. Unverified claims are marked OPEN inline rather than
asserted. No production code was modified to produce this document; no vitest/build was run.*
