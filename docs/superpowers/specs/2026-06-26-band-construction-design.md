# Curvature-Aware Variable-Width Band Construction — Design

**Date:** 2026-06-26 · **Branch:** `refactor/core-migration` · **Status:** design (approved in brainstorm).
**Predecessors:** the assembler weld de-risks (STEP 0–2 + 3a multi-band) — `featureAssembler.step{0,1,2,3a}.derisk.test.ts`. **Memory:** `project_wholewall_mesher_decision.md`.

## 1. Why this exists (the STEP-3a finding)

The feature-aligned assembler's weld machinery is fully proven (STEP 0–2 + 3a:
N separated simple-footprint bands weld to one multiply-connected `cdt2d`
interior, `nonManifold=0`, `tJunctions=0`). STEP 3a, driving the REAL pipeline
(`styleSampler → detectFeatures → conditionGraph`) on Voronoi, surfaced the one
remaining blocker — and it is **not** the weld:

> `paveRidge`'s **constant-width** perpendicular flank offset **self-intersects in
> (u,t)** wherever the offset half-width exceeds the spine's local curvature radius
> (sharp Voronoi cell-wall corners, tight arcs). MEASURED: 4/4 selected Voronoi
> edges produced non-simple footprints (8–15 self-crossings each). The band *mesh*
> is itself watertight; only its (u,t) *projection* folds. A non-simple footprint
> breaks `corridorPaveMulti`'s even-odd `pointInLoop` band-hole exclusion → it
> double-covers the hole interior (`nonManifold=408`, slivers `aspectMax=1141`).

Laplacian smoothing + width-shrink reduce self-crossings monotonically (46→7) but
**do not guarantee** a simple footprint (best 3/4). The assembler therefore needs a
band-construction primitive that produces a **provably simple footprint** for
**every** real feature edge.

## 2. Goal + constraints (settled in brainstorm)

Produce a feature-following ridge band whose **(u,t) footprint is simple by
construction** (`selfCrossings == 0`), so it welds into the multi-hole interior
with zero T-junctions.

- **Full coverage** (decided): every spine yields a band — no skip/fallback.
- **Accept-class corner slivers** (decided): a thin/acute triangle AT a
  geometrically-sharp corner is acceptable, consistent with the standing
  `min(20°, θ)` accept-class posture (`project-export-endgame-design`). This is
  what makes width-pinching a valid mechanism.
- **Fidelity:** the crest/crease IS the exact spine — untouched. Only the flank
  *width* adapts; flank coverage narrows near corners and the `cdt2d` interior
  takes over there.
- **Density-invariant quality** preserved (rows ∥ ridge; Step-1 bars in the bulk).
- **Weld-ready:** QSCALE-dyadic quantized (parity with `paveRidge`/`paveJunction`).

## 3. Architecture + data flow

A new module `src/fidelity/bandRemesh/bandConstruct.ts`, beside `featureStrip.ts`,
reusing its proven pieces. `paveRidge` (constant width) is PRESERVED unchanged (the
synthetic de-risks + its proof depend on it). The new `paveRidgeAdaptive` shares
`paveRidge`'s body but swaps the constant-width offset for a curvature-capped one:

```
spine (u,t)
  → densifyRail (arc-length, ≤ edgeMm/2 · 0.95)        [reuse stitch.ts]
  → measureSpineCurvature  → per-station radius R_i
  → safeHalfWidthProfile   → per-station half-width w_i  (cap + taper + density bound)
  → offsetRailVariable (±w_i)  → densifyRail              [variable-width flanks]
  → buildStations(foot = spine, crest = variable rail)  [reuse stations.ts]
  → paveBand (zip, 3D min-angle diagonal)               [reuse paver.ts]
  → quantizeRailUT (QSCALE)                              [reuse railKey.ts]
  → RidgeResult                ⟸ assertSimpleFootprint (verify-and-shrink net)
```

Output is the **same `RidgeResult`** the assembler already consumes (`mesh`,
`vertexUT`, `spineVertexIds`, `openBoundaryVertices`) — a drop-in for `paveRidge`
on real edges.

## 4. Components (each small + independently testable)

- **`measureSpineCurvature(spine, sampler) → number[]`** — per-station radius of
  curvature `R_i` from the 3 consecutive stations (Menger curvature) measured in
  the **metric** (3D arclength, via `sampler.position`), so it reflects the true
  fold tendency. Sharp corner → `R_i → 0`; straight → `R_i → ∞`.
- **`safeHalfWidthProfile(R, targetWidthMm, opts) → number[]`** —
  `w_i = min(targetWidthMm, safety · R_i)` with `safety ≈ 0.8`; then a
  **min-filter/taper** over a small neighborhood (a corner's pinch tapers across
  its neighbors, not a lone vertex — prevents multi-segment folds); optionally
  bounded by feature density (`w_i ≤ 0.5 · nearest-other-feature distance`,
  deferred to the assembler which knows the graph). Endpoints handled (one-sided
  curvature).
- **`offsetRailVariable(spine, sampler, w, sign) → StationPoint[]`** — today's
  `perpUV` metric perpendicular per station, scaled by the per-station `w_i`
  instead of a constant. (Generalizes `featureStrip.ts:offsetRail`.)
- **`assertSimpleFootprint` (the safety net)** — after building, compute the
  footprint `selfCrossings`; if `> 0` (discrete-sampling residue the analytic cap
  missed), globally shrink `w` by `0.7` and rebuild. **Terminates** — `w → 0` is
  always simple. Records the shrink count (a diagnostic; >0 flags a pathological
  spine for the report).

## 5. The simplicity guarantee (load-bearing)

An offset rail self-intersects only where the offset distance exceeds the spine's
local radius of curvature. Capping `w_i ≤ safety · R_i` removes that condition
everywhere the curvature is continuous; sharp corners get `R_i → 0 ⇒ w_i → 0` (the
accept-class thin pinch). The neighborhood taper covers folds that span several
short segments; the verify-and-shrink net closes the residual discrete gap
deterministically. The footprint is therefore simple by construction, with an
asserted, terminating fallback — never a silent crack.

## 6. Testing (TDD + the real gate)

**Unit (analytic, fast, default CI):**
- `measureSpineCurvature` on a known arc/cylinder spine → matches the closed-form radius.
- `safeHalfWidthProfile` caps to `safety·R` where `R < target/safety`, else `target`; taper monotone into corners.
- `offsetRailVariable` on a synthetic right-angle-corner spine → footprint
  `selfCrossings == 0` (where constant width self-crosses) — the decisive unit gate.

**Integration GATE (PF_DERISK; the real proof = STEP 3a with full coverage):**
- On Voronoi **and** GyroidManifold + HexagonalHive conditioned graphs: **every**
  selected interior edge produces `selfCrossings == 0` (full coverage, not 3/4),
  AND the multi-band weld is `nonManifold == 0, tJunctions == 0` by index.
- Quality report: bulk min-angle ≥ Step-1 bars; corner slivers tracked as
  accept-class (`min(20°,θ)`), not hidden; density-invariance across two edge sizes.
- Non-vacuous negative control (split a band-perimeter vertex → `tJunctions > 0`).

## 7. Scope, integration, hygiene

- **Scope:** general by construction (any spine); validated on the corner-worst
  lattice styles. Feature TYPE handling (loops, braids) inherits the same offset —
  no per-type code.
- **Integration:** flag-gated default-OFF; no production path touched until STEP 4.
  The assembler (full-3a / 3b) calls `paveRidgeAdaptive`; `paveRidge` stays for the
  synthetic de-risks + its standing proof.
- **Hygiene:** never stage the 5 cellSamples-WIP conforming files; scope every
  `git add`; GitNexus `impact` before any prod edit (none expected here — this is a
  new `bandRemesh` module, spike-adjacent); heavy tests behind `PF_DERISK`.

## 8. Out of scope (YAGNI)

- Offset-fold trimming (approach B) and corner-split + mini-join (approach C) —
  both buy corner *width-preservation* the accept-class decision makes unnecessary.
- Junction composition (3b) and the production graft (STEP 4) — separate specs.
- Feature-density width bound is provided as a hook but driven by the assembler
  (which holds the graph), not this module.
