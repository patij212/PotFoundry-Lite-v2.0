# NEXT SESSION — Finish the feature-aligned whole-wall mesher (integrate + graft + e2e)

**Date written:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Read this first.**

> **One-paragraph state.** The feature-aligned mesher's BAND-CONSTRUCTION and JUNCTION
> primitives are now BUILT + de-risked, and the whole-wall STRATEGY (selective paving) is
> PROVEN. What remains is the INTEGRATION: assemble the proven pieces into ONE callable
> whole-wall mesher (conditioned graph → selective strip-bands + CDT-followed spines +
> junctions + interior fill, one watertight mesh), graft it behind `__pfFeatureMesher` at
> `ParametricExportComputer.ts:2069`, and prove it on the FAITHFUL e2e/real-WebGPU gate.
> The canary is **SFB@1**: today's best conforming export is CAD-grade SURFACE + watertight
> but carries **15.7% crest-band sliver triangles** — the feature-aligned mesher is proven
> to drive that to **0% <20°**. That delta is the finish line.

**START HERE:** read this file → memory `project_wholewall_mesher_decision.md` (dense
authoritative state — the LAST ~6 paragraphs are this session) → the assembler design
`docs/superpowers/specs/2026-06-26-feature-aligned-assembler-design.md` → the selective-paving
+ junction de-risk tests (the integration pattern, see §6).

---

## 1. What is DONE + COMMITTED this session (don't rebuild) — all on `refactor/core-migration`

| commit | what |
|---|---|
| `abd03a7` | **corner-join**: export `triangulatePolygon3D` + `joinCorner` (2-arm miter+wedge). 5 unit tests. |
| `48bca48` | **`paveRidgeCornerSplit` + `assembleSubSpines`** (N-corner chain; `joinCorner` delegates). 3 tests. |
| `37576da` | **full-coverage GATE** — full-width REFUTED (43/45/67% on Voronoi/Gyroid/Hex), corner-join PROVEN sound + welds 0/0. |
| `d4dea65` | **conditioning feasibility** — stronger simplify can't rescue full width (the curvature is 3D RELIEF, re-introduced by densify; not removable polyline noise). |
| `de7b580` | **degenerate-rail guard** in `assembleSubSpines` (no crash on dense corners; gate THROW 141/110/136→0). |
| `2c02961` | **operating-point + ceiling diagnostics** — feature-width ceiling ~67/61/83% (relief-limited); self-touch minor (~7%); fewer splits = higher coverage. |
| `b9a5261` | **selective-paving MECHANISM PROVEN** — clean strip-bands + folding-spine CDT constraints weld 0/0 in one `corridorPaveMulti` fill; crest followed (no serration). |
| `1713b20` | **STEP 3b design spec** (ridge-junction-composition, full-band central-fill). |
| `9d60dda` | **STEP 3b implementation plan**. |
| `b6f3db1` | **`paveRidgeJunction`** (degree-N junction, miter-per-sector + reflex wedge). 4 unit tests (deg-3 Y, narrow, reflex, deg-4). |
| `5e35053` | **3b real-junction GATE** — full-band central-fill REFUTED on real Voronoi junctions (7/8 fold+crack, highDegree-dominant) + paveRidgeJunction degenerate guard. |
| `1e5b675` | **`e2e/_sfb1_export.cjs`** — best SFB@1 conforming export probe (the canary tool). |

`bandConstruct.ts` unit tests 19/19; featureStrip 10/10; junction 20/20; stitch 15/15. No
production code touched. The 5 cellSamples-WIP files (`WatertightAssembly.ts`/`PeriodicBalancedQuadtree.ts`/`windowHook.ts`/`ParametricExportComputer.ts`/`ConformingWall.ts`) are UNTOUCHED — NEVER stage them.

---

## 2. What is PROVEN / DECIDED (don't re-litigate — measured)

- **The corner-join is sound** (unit-proven on 90°/60°/zigzag + degree-N junctions on synthetic).
- **Full-WIDTH full-coverage is REFUTED** on dense lattices — the offset folds wherever the
  surface's 3D RELIEF curvature radius < band width. Confirmed three ways (corner-spacing,
  3D-vs-flat curvature discriminator, safety sweep). NOT algorithmic; NOT conditioning-fixable.
- **Feature-SIZED width + SELECTIVE PAVING is the answer** (the user's choice, proven): strip-pave
  the edges whose band footprint is SIMPLE at feature width (~67/61/83% — premium quality); for the
  folding (relief-dense) edges, insert just the SPINE as a `corridorPaveMulti` feature constraint.
  **KEY: the spine is ALWAYS simple in (u,t) — only the band OFFSET folds — so EVERY feature inserts
  cleanly (crest followed, NO serration), strip-paved where clean, CDT-followed elsewhere ⇒ 100%
  feature coverage.**
- **Junctions: `paveRidgeJunction` (full-band central-fill) is PROVEN on synthetic but REFUTED on
  real junctions** (7/8 fold+crack — real nodes are highDegree-dominant deg-4..9 with tight sectors;
  even clean triples develop small defects; not bending arms). **The ROBUST junction path is CDT via
  `corridorPaveMulti`'s `junction` anchor (proven STEP-2, already used by selective paving).**
  `paveRidgeJunction` is BANKED for clean low-degree band-junctions only (a quality upgrade, optional).
- **SFB@1 export baseline (the canary to beat, `e2e/_sfb1_export.cjs`, 4.29M tris):** watertight
  0/0/0; surface CAD-grade (perp-3D vertexMax 0.0015mm, chord p99 0.0086mm); crests inserted; BUT the
  crest band is the weak spot — true crestRms ~0.09mm (borderline tol), worst facets ~0.3mm, and
  **15.7% crest-band triangle slivers (<15°, worst 0.22°)**. The feature-aligned strip-pave is proven
  to give SFB crests **0% <20°** (40–46° min-angle, density-invariant) — THIS is the delta to deliver.

---

## 3. The whole-wall ARCHITECTURE (resolved — this is what to build)

Every feature is FOLLOWED (no serration); quality is premium where the geometry is clean, robust CDT where it is hard:

```
conditioned graph (conditionGraph)  +  outer/inner samplers  +  dims
  → for each interior feature EDGE:
        paveRidgeCornerSplit(spine, sampler, {feature-sized width, edge})
        footprintSelfCrossings === 0 ?  → STRIP-PAVE it (a band hole)   [premium]
                                  else  → its SPINE becomes a corridorPaveMulti feature constraint  [CDT-followed]
  → for each graph NODE (junction):
        incident folding spines → corridorPaveMulti `junction` anchor (shared id)   [robust CDT]
        (clean low-degree band-junctions MAY use paveRidgeJunction — optional premium)
  → corridorPaveMulti({ boundary: frame + band holes, features: folding spines + junction-anchored, ... })
        fills the featureless interior + welds everything by exact-(u,t)/QSCALE key
  → STEP-4 production WatertightAssembly merge: periodic u-seam + caps + inner wall
```

**The missing piece is the INTEGRATION FUNCTION** — a single `assembleFeatureAligned(...)` (or
extend the existing `assembleWithFeatures.ts` / `integrate.ts`) that orchestrates the above on a
REAL conditioned graph and returns one watertight mesh. The selective de-risk (`b9a5261`) proved
the mechanism on SEPARATED edges with `free-interior` anchors; the integration must handle:
1. **Shared-node welding** — adjacent edges share graph junctions. Folding spines anchor at the
   node (`junction` anchor — corridorPaveMulti already does this). Strip-BAND edges meeting a node:
   their band-ends are hole-boundary near the node; the CDT fill triangulates between them and the
   node/folding-spines (weld by exact (u,t)). DE-RISK this first (the selective de-risk skipped it).
2. **The full edge set** (not a separated subset) — all interior edges partitioned clean/folding.
3. **Periodicity + caps** — defer the u-seam + t-caps + inner wall to the production
   `WatertightAssembly` merge (consistent with STEP 0–3a using a non-periodic frame). STEP 4 wires this.

---

## 4. Build order (measure-first, TDD) — execute in order

1. **Shared-node weld de-risk** (PF_DERISK, new `featureAssembler.sharednode.derisk.test.ts`):
   extend the selective de-risk (`featureAssembler.selective.derisk.test.ts`) to a CLUSTER of
   real edges that SHARE a junction node — clean bands + folding spines + the node, in one
   `corridorPaveMulti` fill, anchored at the node (`junction`), welded 0/0. This is the one
   unproven weld (the selective de-risk used separated edges). If GREEN → integration is unblocked.
2. **Build the integrated assembler** `assembleFeatureAligned(outerSampler, graph, dims, opts)`:
   partition all interior edges (clean strip / folding spine), build the band holes, build the
   feature-constraint + junction-anchor list, ONE `corridorPaveMulti` fill, merge. Returns the
   unrolled-rectangle interior mesh (periodicity deferred). TDD on a real style (Voronoi) →
   watertight 0/0 by index, every feature count-2 (followed), bands count-2.
3. **STEP 4 production graft** (the flag): wire `assembleFeatureAligned` behind `__pfFeatureMesher`
   at `ParametricExportComputer.ts:2069`, plumbing the periodic u-seam + caps + inner wall through
   the production `WatertightAssembly` merge. Flag default-OFF; conforming path stays default.
4. **FAITHFUL e2e/WebGPU gate** — re-run `e2e/_sfb1_export.cjs` with `__pfFeatureMesher=true` and
   compare to the baseline (§2): assert watertight 0/0/0, surface ≤ CAD tolerance, and crest-band
   slivers **driven from 15.7% → ~0%** (the deliverable). Then SpiralRidges + the other
   diagonal/morphing-crest styles.
5. **Scale + re-baseline** all 20 styles (real WebGPU, by-index audit): serration=0 + watertight
   20/20 + slivers gated min(20°,θ) (acute-junction accept-class per the standing posture).

---

## 5. Guardrails (honor these — same as the whole arc)

- **Measure-first / TDD.** Failing test → watch fail → minimal code → watch pass → commit. NO-GOs
  are valuable (full-width + full-band-central-fill refutations were the most useful results). Use
  `systematic-debugging` on any gate failure (root cause before fixes); if 3+ fixes fail or the
  approach degenerates, STOP and question the architecture WITH THE USER.
- **Flag-gated default-OFF + faithful gate.** `__pfFeatureMesher` at `ParametricExportComputer.ts:2069`;
  the conforming path stays default. The faithful watertight gate is **e2e/real-WebGPU** (STEP 4),
  NOT UV-only unit tests.
- **Commit hygiene.** NEVER stage the 5 cellSamples-WIP files. `bandConstruct.ts`/`featureStrip.ts`/
  `junction.ts`/`corridorPave.ts`/`seamFill.ts`/`railKey.ts`/`stations.ts`/`paver.ts`/`stitch.ts`/
  `audit.ts`/`assembleWithFeatures.ts`/`integrate.ts`/`realCorridor.ts`/`conditionGraph.ts` are CLEAN
  — reuse/extend freely. Scope every `git add` (verify `git diff --cached --name-only`). NEVER commit
  the `export-deliverables/` binaries (untracked, ~250MB; not gitignored — be careful).
  GitNexus `impact` before editing a committed symbol; `detect_changes` before commits. **Index STALE
  → `node .gitnexus/run.cjs analyze` early.**
- **Heavy de-risk/gate tests behind `PF_DERISK=1`** (`describe.skipIf(!process.env.PF_DERISK)`);
  real-pipeline builds (`detectFeatures` ~13s) in `beforeAll(() => …, 120000+)`; LAZY selection
  (never pave the whole graph in `beforeAll` — it times out; pave only separated/selected candidates).
- **GPU hygiene** (e2e): `headless:false` + `--enable-unsafe-webgpu --enable-features=Vulkan`; ALL
  page work in try/finally; ALWAYS `browser.close()`; never hard-kill; reap orphaned chromium after.
  Each `getMeshForRender`/`diagnose*` REBUILDS the mesh (slow at deep density) — minimize calls.
- **Preserve work.** Commit WIP/partial/NO-GO honestly; never `git revert`/`restore` to discard.

---

## 6. Key files + reuse

- **The proven primitives** (`src/fidelity/bandRemesh/`): `bandConstruct.ts` (`paveRidgeCornerSplit`,
  `joinCorner`, `assembleSubSpines`, `paveRidgeJunction`, `footprintSelfCrossings`, the guard,
  `measureSpineCurvatureRadius`, `splitAtFoldPoints`); `featureStrip.ts` (`paveRidge`,
  `assembleRidgeBands`, `perpUV`); `junction.ts` (`paveJunction`, `triangulatePolygon3D`);
  `corridorPave.ts` (`corridorPaveMulti` — the fill + `junction`/`free-interior` anchors +
  feature-constraint planarization); `seamFill.ts` (`extractHoleBoundary`, `HoleBoundary`);
  `railKey.ts` (`quantizeRailUT`, `QSCALE`); `audit.ts` (`auditWatertight`, `triangleQuality3D`);
  `stations.ts`/`paver.ts`/`stitch.ts` (`buildStations`/`paveBand`/`densifyRail`).
- **The integration scaffolds to extend:** `featureAssembler.selective.derisk.test.ts` (selective
  paving mechanism — the integration pattern), `featureAssembler.step3a.derisk.test.ts` (multi-band
  weld + frame), `bandConstruct.junction.derisk.test.ts` (real-junction gate); `assembleWithFeatures.ts`
  / `integrate.ts` / `realCorridor.ts` (existing partial integration glue — check before rewriting).
- **The conditioned graph:** `conforming/featureGraph/conditionGraph.ts` (`conditionGraph`, calibrated
  config: merge 2.5mm + gentle simplify 0.5mm, prune off), `detectFeatures.ts`, `styleSampler.ts`,
  `fidelityMetric.ts` (dense-truth recall/precision gate — the conditioner's hard constraint).
- **The canary export tool:** `e2e/_sfb1_export.cjs` (drives the real GPU export; levers
  `__pfFeatureMesher` (to wire), `__pfSurfaceFidelityExact`, `__pfConformingMaxLevel/MaxSag/UBias`,
  `setStyleParams({sf_strength:1})`). Baseline output in `export-deliverables/` (untracked).
- **Specs/plans:** `2026-06-26-feature-aligned-assembler-design.md` (the assembler architecture),
  `2026-06-26-ridge-junction-composition-design.md` + plan, `2026-06-26-band-construction-corner-split-design.md`.
  **Memory:** `project_wholewall_mesher_decision.md` (authoritative).
