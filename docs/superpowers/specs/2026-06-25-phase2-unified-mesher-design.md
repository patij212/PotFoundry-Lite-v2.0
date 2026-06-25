# Phase 2 — Unified Feature Mesher (sparse → whole-wall) — Design

**Date:** 2026-06-25
**Branch:** refactor/core-migration
**Status:** Design (approved architecture; pending spec review)
**Predecessors:** `2026-06-25-production-feature-mesher-design.md` (Phase-1 design) + the Phase-1 build (commits 453c9d8..8a2cc99)

## 1. Goal

Make the exported triangulation **follow the model's features across the WHOLE wall**, not just one corridor — so a dense lattice (Voronoi/Gyroid) renders as clean diagonal edge-flow along every cell ridge instead of axis-aligned staircase. Watertight-by-construction, flag-gated default-OFF, byte-identical when off. Quality-first: a multi-minute dense export is acceptable for now; slivers are survivable (minimize, do not gate on them). Watertight + feature-followed are the gates.

## 2. What Phase 1 proved (and the gap this closes)

Phase 1 proved the hard, risky parts end-to-end: the production-frame corridor graft welds **watertight (0/0/0) on the real WebGPU `evaluate_vertices` path**, flag-OFF byte-identical, the (u,t)-space weld transfers CPU→GPU. But on a dense lattice it perfects ONE ~4-edge corridor and drops feature coverage elsewhere (`selectCorridorFeatures` + the paver's ~4-edge ceiling). The GPU render confirmed: both ON and OFF staircase the diagonal ridges across the lattice; the corridor is too small to see. **Phase 2 scales the proven mechanism from one patch to the whole wall.**

## 3. The unifying principle

The Phase-1 mechanism is already "exclude the feature cells from the axis-aligned complement, then pave the excluded region with the features pinned." It is density-agnostic in principle — the paved region simply scales:

- **Sparse** (few features) → the paved region is a few patches in the dyadic complement. *Phase-1 path, proven.*
- **Dense** (Voronoi/Gyroid) → exclude the whole feature-dense **interior** → the paved region becomes the **whole wall**, bounded above/below by the t=0/t=1 ring rows (which stay in the complement so the wall stays cap-attached), periodic at the u-seam. *All* feature edges pinned; the dyadic complement shrinks to the ring strips.
- **In between** → a continuum; the dyadic complement keeps doing curvature-adaptive sizing of the smooth gaps, the paved region grows with feature density.

The watertight weld is unchanged in kind: the paved region reuses the complement's EXACT registered boundary vertices. For the whole-wall case that boundary is the assembly's `nRing` t=0/t=1 ring vertices (+ the u-seam), which the caps/rim already reference by index → the cap weld is automatic. Features are clipped to `t∈[tMargin, 1−tMargin]` (the existing `ConformingWall` clipping) so the exclusion never reaches the rings — this is the fix for the Phase-1 "band covered 96.5% incl. rings → wall ring mismatch → crash."

## 4. The load-bearing de-risk (BUILD FIRST)

The whole approach rests on one hypothesis:

> **The ~4-edge `unfillablePinches` ceiling is a THIN-BAND artifact, not a feature-count limit.** The Phase-1 pinches came from a thin (~1.5-cell) corridor tube self-approaching where the feature curves back near itself (299 pinch-pairs <0.6 cell). A whole-wall region is a big simply-connected area, not a self-approaching tube, so it should not pinch.

**Build step 1 is a spike** that grows the paved region from a patch toward the whole dense Voronoi wall and measures, at each scale: `unfillablePinches`, watertight (0/0/0 by index), quality (%<10°, aspectMax), and time. Outcomes:
- **Holds** (pinches stay ~0 as the region grows) → Approach 1 works as-is; proceed to the whole-wall production path.
- **Pinches** → harden the paver's pinch handling (the constraint-respecting flood-fill's `unfillablePinches` resolution) as part of Phase 2 — the user chose Approach 1, so we FIX the paver rather than retreat to tiling. The spike localizes exactly which region shapes pinch, cheaply, before any production commitment.

The spike is CPU-only (Vitest, `styleSampler`), reusing the de-risk harness (`verify_real_feature_mesher.test.ts` patterns) — no GPU, fast to iterate.

## 5. Components

1. **Dense feature selection** — when dense, pin "all features, t-clipped" (vs Phase-1 `selectCorridorFeatures`'s one ~4-edge region, kept for the sparse path). A density signal (feature coverage of the wall cells) routes sparse vs whole-wall; the routing is internal to `assembleWatertightWithFeatures`.
2. **Whole-wall exclusion / direct pave** — exclude the whole feature-dense interior (bounded by ring rows), or, cleaner, pave the whole wall directly when dense (skip building a complement that gets ~entirely excluded). Decided in the plan after the spike.
3. **The paver at scale** — `corridorPaveMulti` (compact-point cdt2d + constraint-respecting topological flood-fill), with pinch handling hardened iff the spike demands it.
4. **Ring-vertex weld** — reuse the assembly's `nRing` t=0/t=1 ring vertices + the u-seam exactly (`railVertexKey`/`quantizeRailUT`).
5. **Sparse visible-win deliverable** — a sparse style where the proven path already yields a clean before/after render (the early user-facing proof, unlike the dense Voronoi crop).

## 6. Build sequence

1. **Paver-scaling spike** (§4) — decide whole-wall feasibility; harden pinches if needed. CPU, fast.
2. **Sparse visible-win** — pick a sparse-feature style; render before/after on the real GPU path. Fast proof the value is real and *visible*.
3. **Whole-wall dense path** — build on the spike result; flag-gated; watertight-by-index at whole-wall scale; the dense routing in `assembleWatertightWithFeatures`.
4. **All-20 + GPU render before/after + re-baseline** `gateThresholds.ts`; flag-default decision.

## 7. Testing & error handling

- **Watertight-by-index** at whole-wall scale + the non-vacuous INDEX-crack control (duplicate a shared vertex + re-point one incidence ⇒ tJunctions>0; never perturb position — the audit is by index).
- **Feature-followed**: EVERY feature edge is a mesh edge (the de-risk `allMeshEdges`/`featureChainAllEdges` check, now over all ~2378 features).
- **Quality**: sliver % (`%<10°`, `aspectMax`) reported; survivable, minimized; NOT a gate.
- **The GPU before/after render is the human gate** — the dense zoom must turn from axis-aligned staircase into diagonal edge-flow along the ridges.
- **Flag-OFF byte-identity** preserved per task (the load-bearing guarantee).
- **Graceful degradation**: if a region still pinches after hardening, it falls back to the dyadic complement for that region (no crash, `console.warn` logged) — a feature may staircase there, but the export is never broken/unwatertight.
- **Perf** measured (minutes acceptable); reported, not gated.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Pinch ceiling is a real feature-count limit (not thin-band) | The spike (§4) resolves it BEFORE production commitment; if real, harden the flood-fill pinch resolution (Phase-2 in-scope). |
| Whole-wall CDT perf (2378 features + density Steiner) | "Minutes OK"; the compact-point fix already cut cdt2d ~120-370×; optimize only if it exceeds minutes. |
| Quality collapse at 2378 junctions/tips (slivers) | Survivable per the user; report %<10°; the corridor quality held at the dense 11-edge region (%<10°≈0.23). |
| Ring-vertex weld breaks at whole-wall scale (u-seam dup / ring mismatch) | Reuse the proven `railVertexKey` interning + the Phase-1 ring-attachment; watertight-by-index test is the net. |
| Dense routing misfires (sparse style takes the whole-wall path or vice-versa) | Internal density signal + flag-OFF byte-identity; the all-20 test exercises both. |
| Whole-wall replaces the dyadic complement's good curvature sizing | Only the feature-dense interior is paved; smooth styles/regions keep the dyadic mesh; the paver adds density Steiner for the smooth parts of a dense wall. |

## 9. Standing constraints (honor throughout)

- **Flag-gated default-OFF + byte-identical** when off — proven per task.
- **Commit hygiene**: never stage the pre-existing cellSamples/cadFidelity-WIP hunks in `ConformingWall.ts` / `WatertightAssembly.ts` / `PeriodicBalancedQuadtree.ts` / `ParametricExportComputer.ts` / `windowHook.ts`; scope each `git add` to the task's files.
- **Preserve work** — commit WIP/partial with honest status; never `git revert`/`restore` to discard.
- **GitNexus**: re-index (stale) before production edits; `impact({target, direction:'upstream'})` before editing a production symbol; `detect_changes()` before committing; warn on HIGH/CRITICAL.
- **GPU/process hygiene** (Phase-1 lesson): GPU e2e subagents orphan Playwright chromium + dev servers and degrade the GPU; the controller reaps them (kill `ms-playwright` chrome by PATH + dev-server PID trees; leave the user's `Program Files` Chrome).
- **Per-task opus review + independent controller verification**; audit by INDEX not position; non-vacuous controls.
- **Carry-forward from Phase 1**: Task-1 `featuresFromGraph` is retained for the sparse path / future use; the `__pfFeatureMesher` + `__pfByConstruction` flag dependency; the `__pfConformingMaxSag` lever for tractable e2e mesh sizes.
