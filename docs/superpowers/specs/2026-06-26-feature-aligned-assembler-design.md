# Feature-Aligned Whole-Wall Assembler — Design

**Date:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Status:** design (user chose "clean assembler"); grounded by the weld-machinery mapping workflow (wf_e54904b4).

## 1. Goal

Assemble the validated primitives into ONE watertight, serration-free, feature-aligned whole-wall mesh, flag-gated (`__pfFeatureMesher`), default-OFF (the conforming path keeps shipping):

> conditioned feature graph (`conditionGraph`) + `SurfaceSampler` → `paveRidge` per ridge edge (watertight crease, rows ∥ ridge) + `paveJunction` per degree-3 node + `cdt2d`-filled featureless interior → all welded by exact (u,t) key into one watertight mesh.

## 2. The core tension & its resolution

Feature-aligned band rows run PARALLEL to a (possibly diagonal) ridge, so a band's
curved outer-rail discretization is dictated by the ridge and is arbitrary w.r.t.
any axis-aligned interior. **Resolution (asymmetric weld): the bands are the SOURCE
OF TRUTH for shared rail vertices; the interior CONSUMES those exact (u,t) as fixed
boundary constraints and triangulates AROUND them.** Neither side re-derives the
other's vertices.

- **Interior fill = `cdt2d` (corridorPave's fill core)**, NOT the quadtree. The
  axis-aligned dyadic quadtree cannot conform to a diagonal metric rail without
  snapping that perturbs rail vertices off-surface (6 documented hazards). `cdt2d`
  fills an arbitrary multiply-connected complement, consuming the rail vertices as
  fixed boundary ids.
- **Weld = quantize-first + exact-key intern.** Snap every rail (u,t) onto the
  QSCALE=1<<24 dyadic grid (`railKey.quantizeRailUT`) BEFORE paving, so the band's
  exact-string key and the complement's `railVertexKey` agree bit-for-bit. ✅ DONE
  in `paveRidge` (commit 4b7bb97; `vertexUT` is now dyadic + exposed).

## 3. Reuse (grounded in the mapping)

- `featureStrip.ts:paveRidge` — the rows-∥-ridge crease primitive (AS-IS; weld-ready).
- `paver.ts:paveBand`/`zipRows`, `stations.ts:buildStations`, `stitch.ts:densifyRail`
  — band paving + densify-and-share precondition.
- `railKey.ts:quantizeRailUT`/`railVertexKey` — THE weld-key reconciliation.
- `corridorPave.ts:corridorPave`/`corridorPaveMulti` — the arbitrary-complement
  `cdt2d` fill + constraint-respecting TOPOLOGICAL flood-fill (component-max-area
  classification) + boundary-completeness audit + `unfillablePinches` reporting +
  `reconcileToComplement` winding. Inputs: `HoleBoundary` (loops of existing ids) +
  `vertexUT` + a feature polyline + sampler; outputs triangles + diagnostics.
- `planarizeChains.ts` — weld-safe crossing-PSLG planarizer (the cdt2d 'upperIds'
  crash fix); needed when two features cross in one fill region.
- `seamFill.ts:extractHoleBoundary` — builds fill boundary loops + asserts degree-2.
- `realCorridor.ts:internOuterWall` + `assembleWithFeatures.ts:mergeCorridorIntoAssembly`
  — production-frame merge of fill into `WatertightAssembly` by `railVertexKey`.
- `WatertightAssembly` `orientOutward` + by-reference rings/caps — UNCHANGED.

## 4. Avoid (known failure modes)

- Quadtree/`regH`/`regV` as the interior weld (couples to the grid we're dropping).
- Per-triangle centroid inside/outside test (flips in self-proximate pinches → T-junctions); use the flood-fill component-representative test.
- `cdt2d {exterior:false}` flood-fill (carves concave bays out); use `{exterior:true,interior:true}` + custom topological flood-fill.
- Feeding the whole ~1e5-vert wall to cdt2d (O(N log N) blowup); feed ONLY participating ids (hole boundary + chains + Steiner).
- Post-hoc 3D-distance/position "snapping" to repair seams — weld by exact (u,t) key only.
- Over-wide corridor selection (targetEdges≥6 self-touches → genuine `unfillablePinches`); keep conservative.

## 5. Build order (measure-first, TDD)

- **STEP 0 — keystone weld de-risk (NEXT):** ONE **diagonal** ridge band
  (spine u:0.2→0.6, t:0.1→0.9 on a `SyntheticCylinderSampler`) + `cdt2d` complement
  fill; prove the weld by **edge-incidence count** — every band-outer-rail edge
  incidence==2 (1 band-tri + 1 fill-tri), every non-rail count-1 edge on a t=0/t=1
  ring, `inversionCount==0`, `unfillablePinches==[]`, degree-2 boundary. This proves
  the one thing everything depends on (curved rail welds to cdt2d via quantize +
  exact key). Throwaway, reuses every component above, touches no production code.
- **STEP 1 — junction:** 2–3 diagonal ridges at one degree-3 node; `paveJunction`
  with a single shared `junctionFoot`/`junctionCrest` source; fill the surround.
  Gate = band↔fan seams count-2 + the STEP-0 gate.
- **STEP 2 — crossing:** two crossing ridges in one fill region → exercises
  `planarizeChains` (the cdt2d crossing-PSLG crash path). Gate = residualCrossings==0.
- **STEP 3 — conditioned graph, real style:** drive from `conditionGraph` output
  (nodes+edges+nodeTypes) — `paveRidge` per edge, `paveJunction` per triple node,
  cdt2d fill the rest; conservative `selectCorridorFeatures` (targetEdges≤4). Gate =
  0/0 watertight by index at Phase-1 dims (H=100).
- **STEP 4 — graft into production:** `internOuterWall` + `mergeCorridorIntoAssembly`;
  bands interior, rings/caps by-reference. Gate = the FAITHFUL e2e/export-fidelity
  watertight gate (real WebGPU), NOT UV-only unit tests (which understate cracks).
- **STEP 5 — scale + re-baseline:** whole-wall density; widen `targetEdges` only as
  far as `unfillablePinches` stays empty; re-baseline `gateThresholds.ts`; then
  perf/LOD/STL-3MF parity (cutover items, not topology).

## 6. Biggest risk

The rail-quantization weld is a **single, silent** point of failure (UV/unit tests
understate seam cracks — faithful gate is e2e/real-WebGPU). Mitigations: STEP-0
measures **edge-incidence directly** (cannot be fooled by UV metrics); `paveRidge`
quantization is enforced + tested (4b7bb97); re-verify on the faithful gate at every
step. Secondary: feature-density footprint self-touch → `unfillablePinches` — surfaces
LOUDLY (recorded, never silent), a selection concern not a weld-correctness one.

## 7. Commit/hygiene constraints

Never stage the cellSamples WIP in the 5 conforming files (`WatertightAssembly.ts`,
`PeriodicBalancedQuadtree.ts`, `windowHook.ts`, `ParametricExportComputer.ts`,
`ConformingWall.ts`). `corridorPave.ts`/`assembleWithFeatures.ts`/`realCorridor.ts`/
`seamFill.ts`/`railKey.ts` are clean — reuse/extend freely. GitNexus `impact` before
prod edits; `detect_changes` before commits. Heavy de-risk tests behind `PF_DERISK`.
