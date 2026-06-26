# NEXT SESSION — Feature-Aligned Whole-Wall Assembler (complete the mesher)

**Date written:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Read this first.**

> **One-paragraph state.** The feature-aligned mesher's foundation is COMPLETE and validated: the
> feature-graph **conditioner** (clean junction skeleton, fidelity-safe) and every paving **primitive**
> (`paveRidge` watertight crease, `paveJunction` fan, `stitch` band-weld) are built, tested, and
> **weld-ready** (quantized to the QSCALE dyadic grid so they weld bit-compatibly with the production
> complement). What remains is the **whole-wall ASSEMBLER** — orchestrate the conditioned graph into
> ridge bands + junction fans + a `cdt2d`-filled featureless interior, all welded into one watertight
> wall, flag-gated. The architecture is **chosen + grounded** (a 5-agent mapping workflow). Your job:
> execute the 6-step build order, starting at **STEP 0 — the keystone weld de-risk.**

**START HERE:** read this file → `docs/superpowers/specs/2026-06-26-feature-aligned-assembler-design.md`
(the assembler design — your main reference) → memory `project_wholewall_mesher_decision.md` (dense state)
→ then run **STEP 0** as a measure-first throwaway before any production wiring.

---

## 1. What is DONE + COMMITTED this session (don't rebuild)

| commit | what |
|---|---|
| `4f9ab19` | **`densifyRail` arc-length fix** — sizes by measured 3D sub-gap, not chord (was throwing on relief rails). |
| `f57461f` | **`graphMetric.ts`** — shared periodic-u/mm primitives (extracted from `unify.ts`, byte-identical). |
| `a111f85`,`2fae8f0` | **`conditionGraph.ts`** — prune/simplify/merge/type, deterministic; FIDELITY gate (20 styles, **no regressions**) + SKELETON gate (Voronoi junctions 485→234, NN spacing 1.8→5.0mm, count-stability 251%→11%). Calibrated config: **merge 2.5mm + simplify 0.5mm, prune off**. `fidelityMetric.ts` (dense-truth recall/precision). |
| `69f5546` | Part A detector **hysteresis** — built, gated, **measured NO-GO** (regresses braid recall; the ~2000 spurs are real weak features, not noise). Off by default. |
| `b0fa439`,`4b7bb97` | **`featureStrip.ts:paveRidge`** — conditioned spine → 2-flank watertight CREASE band, rows ∥ ridge, metric-sized; density-invariant 36.9°/36.8° worst min-angle; **quantized to QSCALE + exposes `vertexUT`** (weld-ready). |
| `c9eead7`,`29c3713` | the two design specs (conditioning + assembler). |
| `ccc78d6`,`c961ecc` | 5 de-risk spikes (`junctionWedge.*`), **gated behind `PF_DERISK`** (off in CI). |

The conditioning gates + de-risk spikes are heavy → all behind `PF_DERISK=1`. CI-light unit tests
(`conditionGraph.test`, `featureStrip.test`, `densifyRail.test`) run by default and are green.

---

## 2. What is PROVEN (don't re-litigate — measured)

- **Feature-aligned strip-pave kills serration + slivers** for ridges: `paveRidge` gives density-invariant
  ~37-42° worst 3D min-angle, 0 slivers, watertight crease by construction (shared spine rail).
- **Junction fans are watertight + accept-class** across the real Voronoi wedge distribution (Step 2): weld
  100%, fan clean, only the geometrically-irreducible acute-wedge sliver remains (`min(20°,θ)`).
- **The conditioner is fidelity-safe:** junction MERGE never drops a real feature (recall preserved on all
  20 styles incl. the CelticTriquetra braid); length-based PRUNE is NOT recall-safe (off by default).
- **The weld is exact-(u,t)-key on the QSCALE dyadic grid** — `paveRidge.vertexUT` is dyadic, bit-compatible
  with the complement's `railVertexKey`. This is the assembler's load-bearing invariant.
- **`densifyRail` + `planarizeChains`** fixes are banked (relief rails; cdt2d crossing-PSLG 'upperIds' crash).

---

## 3. The assembler architecture (CHOSEN: "clean assembler"; grounded by wf_e54904b4)

> conditioned graph + `SurfaceSampler` → `paveRidge` per ridge edge + `paveJunction` per degree-3 node +
> **`cdt2d` corridor-fill of the featureless interior** → all welded by quantize-first exact-(u,t) key.

- **Interior = `cdt2d` (corridorPave fill core), NOT the quadtree** — the axis-aligned dyadic quadtree
  cannot conform to a diagonal metric rail without perturbing it off-surface.
- **Weld is ASYMMETRIC:** bands are the SOURCE OF TRUTH for shared rail vertices; the interior CONSUMES
  those exact (u,t) as fixed boundary constraints (resolves the feature-aligned-rows-vs-weld tension).
- **REUSE:** `paveRidge`, `paveBand`, `buildStations`/`densifyRail`, `railKey.quantizeRailUT`/`railVertexKey`,
  `corridorPave`/`corridorPaveMulti` (cdt2d fill + topological flood-fill + `reconcileToComplement`),
  `planarizeChains`, `seamFill.extractHoleBoundary`, `realCorridor.internOuterWall`,
  `assembleWithFeatures.mergeCorridorIntoAssembly`, `WatertightAssembly` orient/caps.
- **AVOID:** quadtree as interior; `regH`/`regV` as the primary weld; per-triangle centroid inside/outside
  test; `cdt2d {exterior:false}`; feeding the whole ~1e5-vert wall to cdt2d; post-hoc 3D-distance "snapping";
  over-wide corridor selection. (Rationale in the assembler spec §4.)

---

## 4. Build order (measure-first, TDD) — execute in order

**STEP 0 — KEYSTONE weld de-risk (DO THIS FIRST; throwaway, no production code).**
Prove a curved rail welds to a `cdt2d` interior with zero T-junctions, by EDGE-INCIDENCE (UV tests
understate cracks — measure incidence directly). Recipe:
1. `SyntheticCylinderSampler(50,100,amp,k)`; pick a **DIAGONAL** spine (u:0.2→0.6, t:0.1→0.9) — the worst
   case (a vertical rail is already proven by `stitch.test`).
2. `paveRidge(spine, sampler, {widthMm:6, edgeMm:3})` → `vertexUT` (dyadic) + `railVertexIds`-equivalent
   outer rails (the two flank crest rails) as the hole boundary.
3. Build the cylinder t=0/t=1 rings as boundary vertices (dyadic).
4. **Fill the featureless complement** bounded by {band outer rails ∪ t-rings}. FIRST sub-task: confirm the
   right fill entry — `corridorPave` is corridor-oriented (expects a feature crossing); for a FEATURELESS
   complement you may call `corridorPaveMulti` (per the mapping synthesis) OR `cdt2d` directly on the hole
   boundary + a Steiner interior + the topological flood-fill (corridorPave's fill core). Read
   `corridorPave.ts:297-460` + `corridorPaveMulti` (657-756) and pick the entry; document the choice.
5. Merge band + fill by `railVertexKey` (exact-key intern; bands = source of truth).
6. **GATE (assert, don't eyeball):** every band-outer-rail edge incidence==2; every non-rail count-1 edge
   lies on a t=0/t=1 ring; `inversionCount==0`; `unfillablePinches==[]`; hole boundary degree-2.
   **Do NOT proceed until green.**

**STEP 1 — junction:** 2–3 diagonal ridges at one degree-3 node; `paveJunction` fed a SINGLE shared
`junctionFoot`/`junctionCrest` source; fill the surround. Gate = band↔fan seams count-2 + STEP-0 gate.

**STEP 2 — crossing:** two crossing ridges in one fill region → exercises `planarizeChains` (the cdt2d
crossing-PSLG crash). Gate = residualCrossings==0, no 'upperIds' crash, STEP-0 gate holds.

**STEP 3 — conditioned graph, real style:** drive from `conditionGraph` output (nodes+edges+nodeTypes) on a
real style — `paveRidge` per edge, `paveJunction` per triple node, cdt2d fill the rest; conservative
feature selection (targetEdges≤4). Gate = 0/0 watertight by index at Phase-1 dims (H=100). (Degree-4+ nodes:
the conditioner TYPES them `highDegree` — apply an N-arm fan or split; start by skipping/accepting them.)

**STEP 4 — graft into production:** `internOuterWall` + `mergeCorridorIntoAssembly`; bands interior,
rings/caps by-reference; flag `__pfFeatureMesher` (`ParametricExportComputer.ts:2069`), default-OFF.
Gate = the **FAITHFUL e2e/export-fidelity watertight gate (real WebGPU)** — NOT UV-only unit tests.

**STEP 5 — scale + re-baseline:** whole-wall feature density; widen `targetEdges` only while
`unfillablePinches` stays empty; re-baseline `gateThresholds.ts`; then perf/LOD/STL-3MF parity.

---

## 5. The biggest risk + mitigation

The **rail-quantization weld is a single, SILENT point of failure** — UV/unit watertight tests understate
seam cracks (the faithful gate is e2e/real-WebGPU). `paveRidge` quantization is already enforced+tested
(`4b7bb97`); the mitigation that matters is **measure edge-incidence directly (STEP 0) and re-verify on the
faithful gate at every step, never the unit gate alone.** Secondary: feature-density footprint self-touch →
`unfillablePinches` — surfaces LOUDLY (recorded, never silent), a selection concern not a weld bug.

---

## 6. Guardrails (honor these)

- **Measure-first / TDD.** Every step needs a failing test or a measurement first. NO-GOs are valuable.
- **Flag-gated default-OFF + faithful gate.** `__pfFeatureMesher`; the shipping conforming path stays default.
  The faithful watertight gate is **e2e/real-WebGPU**, not UV-only unit tests (which overstate AND understate
  different cracks).
- **Commit hygiene.** NEVER stage the 5 cellSamples-WIP conforming files (`WatertightAssembly.ts`,
  `PeriodicBalancedQuadtree.ts`, `windowHook.ts`, `ParametricExportComputer.ts`, `ConformingWall.ts`).
  `corridorPave.ts`/`assembleWithFeatures.ts`/`realCorridor.ts`/`seamFill.ts`/`railKey.ts` are CLEAN — reuse
  freely. Scope every `git add`. GitNexus `impact` before prod edits; `detect_changes` before commits;
  warn on HIGH/CRITICAL. (The GitNexus index is STALE — `npx gitnexus analyze` early.)
- **Heavy tests behind `PF_DERISK=1`.** Keep CI light.
- **Reap orphaned ms-playwright chromium + dev-server PIDs after probes.** Faithful gate = real WebGPU.
- **Preserve work.** Commit WIP/partial/NO-GO with honest status; never `git revert`/`restore` to discard.

---

## 7. Key files

- **Conditioner:** `featureGraph/conditionGraph.ts` (+ `.test`, `.fidelity.test`, `.skeleton.test`),
  `graphMetric.ts`, `fidelityMetric.ts`. Detector: `featureGraph/detectFeatures.ts`, `unify.ts`
  (hysteresis option, off), `styleSampler.ts`, `groundTruth.ts`, `validation.test.ts` (14/20 detector gate).
- **Primitives (`src/fidelity/bandRemesh/`):** `featureStrip.ts` (`paveRidge`), `junction.ts`
  (`paveJunction`), `paver.ts` (`paveBand`), `stations.ts` (`buildStations`), `stitch.ts` (`densifyRail`,
  `stitchBandIntoGrid`), `railKey.ts`, `audit.ts` (`auditWatertight`, `triangleQuality3D`).
- **Fill/weld to reuse:** `corridorPave.ts` (`corridorPave`/`corridorPaveMulti`), `planarizeChains.ts`,
  `seamFill.ts` (`extractHoleBoundary`, `HoleBoundary`), `realCorridor.ts` (`internOuterWall`),
  `assembleWithFeatures.ts` (`mergeCorridorIntoAssembly`).
- **Production assembly (reuse orient/caps; DON'T modify — WIP):** `conforming/WatertightAssembly.ts`,
  `PeriodicBalancedQuadtree.ts`, `FeatureConformingTriangulator.ts`, `ConformingWall.ts`.
- **Specs:** `docs/superpowers/specs/2026-06-26-feature-aligned-assembler-design.md` (main),
  `…-feature-graph-conditioning-design.md`. **Memory:** `project_wholewall_mesher_decision.md`.
