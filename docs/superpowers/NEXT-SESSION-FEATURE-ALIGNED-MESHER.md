# NEXT SESSION — Feature-Aligned Mesher (the cure for serration + slivers)

**Date written:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Read this first.**

> One-paragraph state: The export's remaining visible defect (serrated crests + slivers) is **one** root cause — the mesh is built in axis-aligned **(u,t) UV space** while the features and the surface metric live in **3D**. The cure is **feature-ALIGNED meshing** (features become mesh edges, the adjacent mesh is structured *along* the feature, cells sized by the 3D metric) — **NOT** feature-*insertion* into axis-aligned cells (what ships today, which still serrates). This session **PROVED the cure works for ridge-type features** (SFB) and produced an honest universality verdict + a 5–7 session build plan. **Your job: build it.** Start at Step 2.

---

## 1. What is PROVEN (don't re-litigate — measured this session)

- **The root cause is UV≠3D, and serration↔slivers are the SAME defect.** User-validated by eye on a real SFB@1 export. Inserting a feature as a *constraint edge* into axis-aligned cells does NOT reorient the surrounding cells → residual facet-serration + the cells that span a fold are slivers. Density only shrinks the facets.
- **The SFB petal crest is a genuine SHARP RIDGE** — measured tent angle ~99–135° (a crease). ⇒ "perfect representation" of it = a **crease EDGE** with two well-shaped flank faces, NOT a smooth surface.
- **Feature-ALIGNED strip-paving CURES the ridge class (DECISIVE PASS).** `paveBand` (crest = shared **spine rail**, two flank bands with rows **parallel** to the ridge, zipped to maximize 3D min-angle) on the exact SFB crest:

  | density (3D edge) | 2.0mm | 1.0mm | 0.5mm | 0.2mm |
  |---|---|---|---|---|
  | worst 3D min-angle | 41.5° | 43.2° | 41.8° | 40.5° |
  | % below 20° | 0% | 0% | 0% | 0% |

  **Density-invariant ~40–46°, 0% slivers** vs axis-aligned insertion **22% <20° (worst 0.02°)** / generic anisotropic Delaunay **52% <20°**. The 3D↔UV defect is **eliminated** for ridges.

- **The UNIVERSALITY verdict (workflow wf_ddeeae89, 14 agents, adversarially stressed):**
  - **Serration-kill: UNIVERSAL** (all 20) — proven by construction.
  - **Watertight: UNIVERSAL by construction** (shared-vertex rails; proven at primitive scale in `junction.test.ts` for 15°–120° wedges; whole-wall scale UNTESTED — the build risk).
  - **Sliver-free: NOT universal — geometrically irreducible at acute loci.** At any feature angle θ<20°, *any* watertight wall-preserving mesh MUST contain a triangle ≤θ (Steiner-splitting makes it θ/2, worse). Bites: acute Voronoi junctions (~10.6% of nodes, min 3.0°), tight braid under-dives, acute cusps (SFB base-petal tip ~2.5°). **These are ACCEPT-CLASS** — gate `min(20°, θ)` per locus, like the steep-face metric artifacts already accepted.
  - **Clean styles (~11–13):** the 8 axis-aligned-crease styles (ArtDeco, BambooSegments, GeometricStar, GothicArches-lower, LowPolyFacet, DragonScales) + the 5 smooth styles (HarmonicRipple, SuperellipseMorph, FourierBloom, RippleInterference, WaveInterference). **Hard 7** (serration-clean + acute-sliver residual): SuperformulaBlossom, SpiralRidges, Voronoi, GyroidManifold, HexagonalHive, CelticKnot, CelticTriquetra.
  - **Myth busted:** the Celtic over/under braid is NOT multi-valued — it resolves to ONE radius per (u,t) via occlusion (a C0 cliff), so it IS a meshable height field. Residual = under-strand pinch, not a second sheet.

---

## 2. The unifying construction (3 primitives, all already exist)

> **Features become mesh edges; the adjacent mesh is structured ALONG the feature (strip-pave) or AROUND it (fan at junctions); cells sized by the 3D metric; everything welds by exact-(u,t)-key vertex sharing.**

| Primitive | File | Role |
|---|---|---|
| **paveBand** (advancing-front strip, rows ∥ feature, zips for 3D min-angle) | `src/fidelity/bandRemesh/paver.ts` + `stations.ts` (3D-arclength sizing) | the BODY of any single-direction feature (ridge flanks, band strips, braid arms) |
| **paveJunction** (3 strip arms + best-ear + Lawson max-min central fan) | `src/fidelity/bandRemesh/junction.ts` | degree-≥3 NODES where "parallel rows" has no direction |
| **3D-metric squared quadtree** | `src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree.ts` | featureless fields (the 5 smooth styles) |

---

## 3. The build plan (5–7 sessions) — Step 1 DONE

1. **✅ Strip-pave the ridge — PROVEN** (40–46°, 0% slivers, density-invariant on SFB).
2. **▶ NEXT — Junction fan de-risk.** Drive `paveJunction` across the **real Voronoi wedge-angle distribution** (extract the actual node wedge angles from `detectFeatures` on a real Voronoi sampler); bucket worst-triangle 3D min-angle by wedge. **Expect ~10–11% irreducibly <20° at acute nodes; the fan itself stays clean (aspect ≤4); the sub-20° lands on the incident ARM band (`junction.test.ts:218-223`).** GATE: serration=0, watertight=100%, and confirm the residual is exactly the acute-wedge set ⇒ accept `min(20°, θ)` per node. CPU spike, throwaway.
3. **Whole-wall lattice integration — THE BIGGEST RISK.** Replace `corridorPaveMulti`'s `cdt2d` interior with strip+fan paving (OR prove `planarizeChains`+`cdt2d` completes at production density without the dyadic fallback). GATE: no `unfillablePinch`, no cdt2d crash, on real Voronoi/Gyroid samplers, whole-wall, watertight-by-index. (The committed `verify_wholewall_scaling.test.ts` spike is FLAWED — scattered tubes; correct the region selection first.)
4. **Born-petal / tier-jog fans.** The "junction-free ridge class" is a false premise: SFB petal count grows 6→10 with height → degree-3 Y-merges; LowPolyFacet tier jogs are T-junctions. Add the merge fan to the ridge class. Bounded, axis-aligned, buildable.
5. **Braid silhouette constraint.** Insert the occlusion cliff as a closed constraint loop; under-band dead-ends on it. Verify single-valuedness first (~30-line CPU grid sample of `rOuterCelticKnot`).
6. **e2e cutover.** Flip `__pfFeatureMesher` default-OFF → ON only after a real-WebGPU battery: 20/20 watertight, serration=0, slivers gated `min(20°, θ)` per locus, flag-OFF byte-identical preserved.

---

## 4. Reproduce the Step-1 proof (the strip-pave de-risk) — it was a throwaway, here's the recipe

- Exact surface: `rOuterSuperformulaBlossom(θ=2πu, z=tH, r0=RB+(RT-RB)t, H, DEFAULT_SUPERFORMULA)` (from `src/geometry/styles.ts` + `types.ts`); `pos3d(u,t)=[r·cosθ, r·sinθ, z]`. H=100, RB=30, RT=40.
- Ridge spine: track `argmax_u r` **CONTINUOUSLY** (narrow ±0.02-u window around the running peak — global argmax HOPS between petals → 19mm rail jumps → `buildStations` throws).
- Two flank bands: `buildStations(leftFoot, spine, sampler, targetMm)` + `buildStations(spine, rightFoot, sampler, targetMm)`, each → `paveBand(grid, sampler)`. The spine is the shared rail (crease edge).
- **GOTCHA:** rails MUST be densified to ≤ `targetMm/2` 3D-spacing before `buildStations` (it throws otherwise) — ~480 rows over a 27mm patch covers down to 0.2mm.
- Measure: per triangle, `min` of the three 3D angles via `sampler.position`. Worst, %<20°.

---

## 5. Standing constraints & gotchas (honor these)

- **Measure-first / TDD.** Every fix needs a failing test or measurement first (the user rejects un-measured fix claims). This session's NO-GOs were the valuable findings.
- **Flag-gated default-OFF + byte-identical when off.** `__pfFeatureMesher` (`ParametricExportComputer.ts:2069`). Never break the shipping conforming default.
- **Accept-class posture.** Gate serration + watertightness UNIVERSALLY; gate triangle quality at `min(20°, θ)` per locus — do NOT chase ≥20° at genuinely-acute features (it's geometrically impossible; chasing it re-introduces serration via tip-flattening).
- **Commit hygiene.** 5 conforming files carry pre-existing uncommitted cellSamples/cadFidelity WIP (`ConformingWall.ts`, `PeriodicBalancedQuadtree.ts`, `WatertightAssembly.ts`, `windowHook.ts`, `ParametricExportComputer.ts`). NEVER stage those hunks — scope every `git add` to your files.
- **GitNexus:** re-index if stale; `impact({target, direction:'upstream'})` before editing a production symbol; `detect_changes()` before committing; warn on HIGH/CRITICAL. (Note: `buildConformingWall` is HIGH-risk but `triangulateQuadtreeWithFeatures` is LOW — only 2 callers.)
- **GPU / process hygiene.** Headless WebGPU exports run on a SOFTWARE adapter (no hardware GPU, slow, single-thread-bound on the CPU mesher — ~20% of cores). Reap orphaned `ms-playwright` chromium + dev-server PIDs after every probe (the user is protective — don't kill a *running* export). The faithful fidelity gate is **e2e/real-WebGPU**, not unit tests (which overstate seam cracks).
- **Preserve work.** Commit WIP/partial/NO-GO with honest status; never `git revert`/`restore` to discard.

---

## 6. What's committed this session (stands) vs throwaway (gone)

- **Committed (3 scoped commits):** `6caf20a` planarizeChains (fixes the cdt2d non-planar-PSLG 'upperIds' crash — a feature crossing-constraint problem), `b4b70c9` paver-crash fallback (re-assembles watertight instead of returning a holed mesh), `3178cd1` planarizeChains wired into `corridorPaveMulti` (no-op on non-crossing, 28/28 regression green).
- **Throwaway (all removed; tree clean apart from the pre-existing WIP):** the cdt2d analysis scripts, the GAP-2 cornerSnap attempts (NO-GO, reverted), the generic-Delaunay de-risk, the strip-pave de-risk, the SFB 3MF export probes.
- **Memory of record:** `project_wholewall_mesher_decision.md` (the dense, authoritative state) + `project_cdt_planarization.md`.

---

## 7. Deliverables produced for the user this session

- Two real GPU-exported 3MFs of SuperformulaBlossom @ strength 1: the default (crests staircased) and `surfaceFidelityExact`-ON (crests inserted as edges, 15.6% slivers) — the empirical tradeoff that proved the serration↔sliver coupling.

---

**START HERE:** read this file → `project_wholewall_mesher_decision.md` (memory) → then run **Step 2** (the junction-fan de-risk) as a measure-first throwaway. The ridge primitive is proven; the next question is whether the junction fan's residual is *exactly* the acute-wedge accept-class set (it should be) — settle that empirically before committing to the whole-wall integration (Step 3, the real risk).
