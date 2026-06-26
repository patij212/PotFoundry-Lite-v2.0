# NEXT SESSION — Build the corner-join (complete approach C; full-coverage band construction)

**Date written:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Read this first.**

> **One-paragraph state.** The feature-aligned assembler's entire WELD machinery is PROVEN + committed
> (STEP 0–2 + 3a multi-hole, all 0/0 by direct edge-incidence). The remaining blocker is **band
> CONSTRUCTION on real spines**: a constant-or-variable-width flank offset SELF-FOLDS in (u,t) at the sharp
> corners of real conditioned feature edges, which breaks the multi-hole weld. Approach **A** (curvature-aware
> variable width) was built and **REFUTED by measurement** (shrink-net degenerates → more crossings; smoothing
> plateaus at 10–22mm fidelity loss). The user chose approach **C** (corner-split + join), which is **spec'd**
> and whose first component (`splitAtFoldPoints`) is **built + green**. What remains is the **corner-join** —
> the intricate 2-arm miter geometry — then `paveRidgeCornerSplit`, then the full-coverage gate (C's GO/NO-GO,
> exactly as the gate refuted A).

**START HERE:** read this file → `docs/superpowers/specs/2026-06-26-band-construction-corner-split-design.md`
(the C design — your main reference) → `docs/superpowers/specs/2026-06-26-band-construction-design.md` (the
REFUTED approach-A design, for the negative-result context) → memory `project_wholewall_mesher_decision.md`
(dense authoritative state — the last two paragraphs are this arc).

---

## 1. What is DONE + COMMITTED (don't rebuild) — all on `refactor/core-migration`

| commit | what |
|---|---|
| `dd626b4` | **STEP 0** weld de-risk — diagonal `paveRidge` band ↔ `corridorPaveMulti({features:[]})` fill: 0/0 by incidence, rail edges count-2, non-vacuous negative control. |
| `cd519d4` | **STEP 1** junction de-risk + **fixed `paveJunction`'s missing QSCALE quantization** (the handoff's #1 silent-crack risk; it keyed raw `${u}|${t}`). Now interns via `quantizeRailUT` + exposes `vertexUT`. junction.test 20/20. |
| `07157d5` | **STEP 2** crossing de-risk — two crossing features → `planarizeChains` → no cdt2d `upperIds` crash, residualCrossings=0, fill watertight. |
| `bf8f0fa` | **STEP 3a** multi-band weld PROVEN on a REAL conditioned graph (N bands ↔ one multi-hole cdt2d interior, 0/0) + the finding that band construction (not the weld) is the blocker. |
| `04e6bae` | **featureStrip refactor**: extract `assembleRidgeBands` + export `perpUV` (paveRidge behavior-identical, featureStrip.test 10/10). |
| `04e6bae`→`a4e4943` | band primitives: `measureSpineCurvatureRadius` (3D Menger), `safeHalfWidthProfile`, `offsetRailVariable`, `footprintSelfCrossings`. |
| `90d5ee5` | `paveRidgeAdaptive` (approach A — **retired in place**; its verify-and-shrink net is the refuted part; keep as a straight-sub-band fallback / negative-result record). |
| `cd6e5b6` | **approach-C design spec** (your main reference). |
| `8fa5577` | **`splitAtFoldPoints`** (C's split step) — splits the spine where `radius < safety·widthMm` into sub-spines that share the corner vertex; 2 unit tests green. |

`bandConstruct.ts` unit tests: **6/6 green**. No production code touched. The 5 cellSamples-WIP files
(`WatertightAssembly.ts`/`PeriodicBalancedQuadtree.ts`/`windowHook.ts`/`ParametricExportComputer.ts`/`ConformingWall.ts`)
are UNTOUCHED (pre-existing working-tree mods — NEVER stage them). (Branch also has concurrent `meshing-lab`
commits `f32b8dd`/`fd05de7` from another effort — not ours; our commits are intact.)

---

## 2. What is PROVEN / DECIDED (don't re-litigate — measured)

- **The weld is fully proven** (STEP 0–2 + 3a). Single, junction, crossing, and multi-hole-on-real-geometry all
  weld 0/0 by direct edge-incidence. The weld is NOT a risk.
- **Approach A is REFUTED** (the full-coverage gate, since deleted, measured it): variable-width pinching
  DEGENERATES corners (foot/crest coincide → zero area → MORE crossing artifacts, edge0 7→11 at 8 shrinks);
  smoothing PLATEAUS (2/4 stubborn Voronoi edges never reach simple) and costs 10–22mm crest fidelity. The
  densified spines are themselves SIMPLE (`spineSelfX=0`) — the folds are purely the OFFSET at sharp corners.
- **User decisions (hard constraints for C):** FULL COVERAGE (every selected edge gets a band) + FULL FIDELITY
  (crest = exact spine, never smoothed) + FULL WIDTH (no pinch). Corners become JOINS (shared vertex + small
  element), not slivers/pinches.
- **`footprintSelfCrossings(mesh, vertexUT)`** is the by-construction simplicity check (count-1 perimeter
  self-crossings in (u,t); `Infinity` if not one simple loop). This is the precondition `corridorPaveMulti`'s
  even-odd `pointInLoop` band-hole exclusion REQUIRES — a non-simple footprint double-covers the hole.

---

## 3. The corner-join (the crux to build) — design + my analysis

`paveRidgeCornerSplit(spine, sampler, opts) → RidgeResult` (drop-in for `paveRidge`):
densify → measure curvature → `splitAtFoldPoints` (DONE) → pave each sub-spine with `paveRidge` (FULL width;
simple by its straightness) → **`joinCorner` at each interior split** → combine (exact-(u,t)-key + QSCALE) → assert `footprintSelfCrossings === 0`.

**The geometry (worked out — this is the hard part):** a ridge sub-band from `paveRidge` is two flanks sharing
the spine crease (foot = spine at offset 0; the two crest rails at ±widthMm). At a corner `C` (a shared spine
vertex, turn angle θ), sub-band A ends and B starts, sharing `C`. Because the two flanks are on OPPOSITE sides
of the spine, at any corner **exactly one flank is convex and the other concave**:
- **Convex flank** (outside of the turn): A's crest-end and B's crest-start DIVERGE → a wedge GAP. Fill it:
  a triangle/fan `[crestA(C), C, crestB(C)]`, or the polygon between A's end-row and B's start-row on the
  convex side, triangulated Steiner-free via `paveJunction`'s **`triangulatePolygon3D`** (max-min-angle;
  currently module-PRIVATE in `junction.ts` — export it, like `perpUV` was exported).
- **Concave flank** (inside of the turn): A's crest-end and B's crest-start CONVERGE → they OVERLAP (the fold,
  localized to the corner). Resolve by **mitering**: clip both concave crest rails to their intersection point
  `M` (the meet of the two offset crest lines) so they share `M` — no overlap. Beyond a miter limit (very acute
  θ) fall back to a small **bevel** (pull `M` in to a bounded distance). The concave side closes at the shared
  spine vertex `C` + the miter `M`.

**This is a degree-2 analog of `paveJunction`** (arms stop at end-rows, central polygon fills between). The
SAME machinery STEP 3b (degree-3 junctions) needs — so building it here de-risks 3b.

**Two viable framings (next session's call — both reach the same result):**
1. **Split + join (the spec):** pave sub-bands independently, then `joinCorner` stitches them (stop-short + corner
   polygon + concave miter). Cleanest for the SPINE (each sub-band is a clean ridge).
2. **Continuous per-rail miter (a possible simplification):** keep ONE continuous spine; build each of the two
   flank crest rails with corner resolution inline (convex → fan/keep; concave → clip to miter). Cleanest for
   the RAILS; avoids the stop-short bookkeeping. Consider this if the split+join corner-stitch gets fiddly —
   the fold is ONLY ever on the concave rail, so "offset each flank rail with concave-corner miter" may be the
   most direct path. (This is approach-B-flavored but per-rail and bounded; the user chose C but the goal is a
   simple-footprint full-coverage band — pick whichever proves out on the gate.)

**The decisive validation is the gate (build it; it is C's GO/NO-GO):** re-create the full-coverage gate (the
deleted `bandConstruct.gate.derisk.test.ts` — its structure is preserved in `featureAssembler.step3a.derisk.test.ts`:
select separated interior edges, pave each, multi-hole `corridorPaveMulti` fill, weld) but pave with
`paveRidgeCornerSplit`. Assert, per style `['Voronoi','GyroidManifold','HexagonalHive']`: **every** selected
edge → `footprintSelfCrossings === 0` (FULL coverage), multi-band weld `nonManifold=0, tJunctions=0`, every
band-perimeter edge incidence==2, `inversionCount=0`, `unfillablePinches=[]`, crest fidelity = exact (0mm),
non-vacuous negative control. If a stubborn corner still folds → that's the honest C verdict (report it, like
the gate refuted A); if green → C is PROVEN and you unblock full-3a + 3b.

---

## 4. Build order (measure-first, TDD) — execute in order

1. **Export `triangulatePolygon3D`** from `junction.ts` (+ run junction.test 20/20 to confirm unchanged). Trivial unblock.
2. **`joinCorner` (or per-rail miter)** — TDD on a SYNTHETIC 90° corner (and a ~60° corner): two straight sub-bands
   meeting at `C`; assert the joined region has `footprintSelfCrossings === 0`, is internally watertight
   (`auditWatertight` 0/0), seam edges count-2, crest vertices = exact input spine. Work the miter geometry out
   INCREMENTALLY with the test (do NOT pre-bake it — it's fiddly).
3. **`paveRidgeCornerSplit`** — orchestrate split → pave sub-bands → joinCorner → combine; assert simple footprint +
   watertight on the synthetic corner spine + a multi-corner zigzag.
4. **The full-coverage GATE** (PF_DERISK) on Voronoi/Gyroid/Hex — C's GO/NO-GO. Calibrate `safety` (the split
   threshold) only by TIGHTENING construction, never by loosening the gate.
5. **If GREEN:** update memory (C PROVEN), then resume the ORIGINAL build order — full-3a (all edges incl.
   junction-sharing) then **STEP 3b** (junction composition — the corner-join generalizes to it), STEP 4
   (production graft, flag `__pfFeatureMesher` at `ParametricExportComputer.ts:2069`, FAITHFUL e2e/WebGPU gate),
   STEP 5 (scale + re-baseline). **If a stubborn corner refutes C:** report honestly + reconsider (offset-fold
   trimming B, or accept-with-fallback).

---

## 5. Guardrails (honor these — same as the whole arc)

- **Measure-first / TDD.** Failing test → watch fail → minimal code → watch pass → commit. NO-GOs are valuable
  (A's refutation was the most useful result this arc). Use `systematic-debugging` on any gate failure (root
  cause before fixes); if 3+ fixes fail or the approach degenerates, STOP and question the architecture with the user.
- **Flag-gated default-OFF + faithful gate.** `__pfFeatureMesher`; the conforming path stays default. The
  faithful watertight gate is **e2e/real-WebGPU** (STEP 4), NOT UV-only unit tests.
- **Commit hygiene.** NEVER stage the 5 cellSamples-WIP files. `corridorPave.ts`/`assembleWithFeatures.ts`/
  `realCorridor.ts`/`seamFill.ts`/`railKey.ts`/`featureStrip.ts`/`junction.ts`/`bandConstruct.ts` are CLEAN —
  reuse/extend freely. Scope every `git add` (verify `git diff --cached --name-only`). GitNexus `impact` before
  editing a committed symbol (`junction.ts:triangulatePolygon3D` export = trivial LOW); `detect_changes` before
  commits. **The GitNexus index is STALE → `node .gitnexus/run.cjs analyze` early** (needed by STEP 4).
- **Heavy de-risk/gate tests behind `PF_DERISK=1`** (`describe.skipIf(!process.env.PF_DERISK)` + the throwaway-spike
  header comment). Real-pipeline builds (`detectFeatures` ~13s) go in `beforeAll(() => …, 120000)`, not inside an `it`.
- **Reap orphaned ms-playwright chromium + dev-server PIDs after probes.** (This arc was pure-CPU vitest — nothing to reap.)
- **Preserve work.** Commit WIP/partial/NO-GO honestly; never `git revert`/`restore` to discard.

---

## 6. Key files + reuse

- **Build here:** `src/fidelity/bandRemesh/bandConstruct.ts` (+ `.test.ts` unit, + a new `bandConstruct.gate.derisk.test.ts`).
  Already in `bandConstruct.ts`: `measureSpineCurvatureRadius`, `safeHalfWidthProfile`, `offsetRailVariable`,
  `footprintSelfCrossings`, `splitAtFoldPoints`, `paveRidgeAdaptive` (retired). ADD: `joinCorner`, `paveRidgeCornerSplit`.
- **Reuse:** `featureStrip.ts` (`paveRidge`, `assembleRidgeBands`, `perpUV`), `junction.ts` (`triangulatePolygon3D` —
  export it; `paveJunction` is the degree-3 pattern to mirror), `stitch.ts` (`densifyRail`), `stations.ts`
  (`buildStations`, `StationPoint`), `railKey.ts` (`quantizeRailUT`, `QSCALE`), `seamFill.ts` (`extractHoleBoundary`,
  `HoleBoundary`), `corridorPave.ts` (`corridorPaveMulti` — the multi-hole fill), `audit.ts` (`auditWatertight`,
  `triangleQuality3D`).
- **Gate scaffold to copy:** `featureAssembler.step3a.derisk.test.ts` (real-pipeline config + `selectSeparatedEdges`
  + frame + multi-hole merge — swap `paveRidge`+manual-smooth for `paveRidgeCornerSplit`).
- **Specs:** `…2026-06-26-band-construction-corner-split-design.md` (C, main), `…2026-06-26-band-construction-design.md`
  (A, refuted). **Memory:** `project_wholewall_mesher_decision.md`.
