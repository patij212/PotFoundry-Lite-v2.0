# Feature-Region Triangle Quality — Implementation Blueprint

**Date:** 2026-06-10
**Author:** lead architect (synthesis of 4 designs + adversarial verdicts)
**Status:** ready to execute (TDD)
**Target file for execution log:** this document + a session journal under `docs/superpowers/`

---

## Goal

Raise feature-region triangle quality in the conforming mesher to a **clean-CAD bar — min interior angle ≳ 20° (Ruppert-grade), aspect ≲ 6** — across feature-insertion and grading-transition regions, **without breaking the watertight + T-junction-free-by-construction contract** and **without regressing the byte-identical smooth-style baseline (20/20 default-dim meshes)**.

Measured baseline this session (% of feature-band triangles with min 3D interior angle < 20°, via `triangleQualityDistribution` on the outer-wall submesh): HexagonalHive 85%, GyroidManifold 83%, GothicArches 89% (smooth wall clean), ArtDeco 74%, Crystalline 40%, DragonScales 17%; smooth styles (SuperformulaBlossom) ~0%. Worst min-angles 1.4–7°. Proven NOT a budget/resolution issue (400k vs 1.5M target → byte-identical for smooth+braid). The anisotropy is **structural**: the per-cell constrained CDT (`cdt2d(xy, edges, {exterior:false})`) inserts **zero** interior Steiner points, and the grading-transition centre-fan templates radiate stretched triangles from a single centroid.

**Accepted exception (user-chosen):** genuine sharp feature *corners* (acute curve intersections — braid crossings, hex/cell-curve junctions) may never reach 20°. These are detected, protected, and **reported separately**, never counted as a failure.

---

## Architecture (chosen approach: HYBRID, two-tier, both inside the existing PASS A / PASS B)

The four candidate designs converge on one root cause and one fatal trap:

- **Root cause** (all four agree, verified in code): `ConstrainedCellTriangulator.ts:77` runs a *constrained* Delaunay kernel with no quality/Steiner step; the grading-transition centre-fans (`FeatureConformingTriangulator.ts:677-678`, mirrored from `QuadtreeTriangulator.ts:331-332/:349-350`) emit anisotropic needles.
- **The fatal trap** (verdicts on ruppert-in-cell, chew-second, AND hybrid all converged here): a Ruppert *encroachment* split of a shared cell edge is **interior-set-dependent** — the two neighbouring cells have different interior triangulations, decide different splits, register different on-edge points, and re-introduce a T-junction. The registry (`regH`/`regV`) is **frozen at the end of PASS A** before any cell is triangulated in PASS B, so a split *discovered during* PASS B can never be mirrored. This is non-negotiable and dictates the whole design.

Therefore the chosen architecture splits the problem so the **only** vertices that ever land on a shared edge are placed by a **deterministic, interior-INDEPENDENT, edge-local rule** computed to a **fixpoint during PASS A** (when the registry is still open), and **all quality-driven refinement is strictly cell-interior** (needs no mirroring, exactly like today's planarization Steiner points).

### TIER 1 — kill the bulk anisotropy by construction (cheap, deterministic, no refinement loop)
Removes ~80–90% of the failures so Tier 2 fires on a small minority of cells.

- **(1a) Aspect-aware stop** in `PeriodicBalancedQuadtree.shouldRefine`: split while `max(physW,physH) > target` **OR** `cellAspect3D > ASPECT_CAP` (≈4), using the **F-inclusive** `cellAspect3D` (already implemented at `PeriodicBalancedQuadtree.ts:752-766`) so it does NOT fight `uBias` and does NOT over-split F-shear cells whose long axis is not u. Bounded by the existing `levelCap`/`maxLevel` + 2:1 balance fixpoint.
- **(1b) Shape-aware templates** in `QuadtreeTriangulator` (plain-quad diagonal + single-mid/N-mid transition fan), gated to fire **only** on anisotropic cells (`cellAspect3D > EPS` OR `B>0`), tie-broken to the **legacy SW→NE / centroid-fan** choice when isotropic so smooth default cells stay byte-identical. Uses **per-leaf E,F,G tagged onto the leaf** (computed once in the quadtree where the metric already lives) — NOT a per-triangle sampler call.

### TIER 2 — bounded, registry-mirrored quality refinement on the residual feature cells
Two-phase, structured to obey the frozen-registry constraint:

- **PASS A2 (edge-local segment densification, registry-mirrored):** a NEW fixpoint pass that runs **between PASS A's existing body and the registry freeze** (i.e. still inside PASS A, after line 614 logic, before PASS B's `readH`/`readV`). For every shared cell edge it computes split points by a **pure function of the registered edge-vertex set + the feature crossings on that edge only** — never any cell's interior triangulation. Each split midpoint is `regAdd`-ed at its absolute, formula-derived grid-line key, so BOTH neighbours read it in PASS B. Iterated to a fixpoint (splitting one sub-segment can encroach another) with an order-independent, idempotent predicate.
- **PASS B interior Ruppert/Chew (no mirroring):** after `triangulateConstrainedCell` returns (`FeatureConformingTriangulator.ts:796-800`), run a bounded circumcenter/off-center refinement on **interior points only**, in the **3D metric** (via a threaded sampler closure), with **on-edge insertion forbidden** (any candidate within `ON_EDGE_EPS` of a side is rejected — the cell keeps its best triangulation for that triangle; the boundary was already densified by PASS A2). Sharp corners protected; hard per-cell insertion cap guarantees termination.

**Division of labour rationale:** Tier 1 squares the bulk → most cells clear ≥20° with no refinement and near-zero triangle growth. Tier 2's interior loop then only fires on the off-centre-chord / grading-residual cells, and the only watertight-critical surface (PASS A2) is a *deterministic edge function*, not the angle-driven loop — so it is provably symmetric.

### Why the boundary split is symmetric (the load-bearing argument)
PASS A2's split predicate depends ONLY on quantities both cells compute identically:
1. The **registered edge-vertex set** on that grid line (`regH`/`regV` already guarantees both cells read the identical ordered set — that is the existing watertight invariant).
2. The **feature crossings** on that edge (computed by `edgeCrossingsInto`, which already yields bit-identical points from both sides, `FeatureConformingTriangulator.ts:128-152`).
3. A **target sub-segment length** derived from the local sizing field evaluated at the **edge-line coordinate** (a 1-D function of position on the line — identical from both sides), NOT from either cell's 2-D interior shape.

Split point = exact arithmetic midpoint of two registry points on the same line (or a power-of-two concentric shell radius from a sharp-corner apex, also a pure function of the two endpoints). `regAdd`'s `if (!inner.has(sub))` dedups the two triggers to one point. Result: identical ordered split set on both sides → `readH`/`readV` return identical sequences → `interiorBoundary == 0`.

---

## Tech Stack

- **Language/build:** TypeScript, Vitest (jsdom). `npm run test`, `npm run typecheck`, `npm run lint` (0 max-warnings — any warning fails CI).
- **Geometry deps (already present):** `cdt2d` (constrained Delaunay kernel, reused — no new kernel), `delaunator`, `robust-predicates`.
- **Metric:** `firstFundamentalForm(sampler, u, t, hu, ht)` → `{E,F,G}` (`SurfaceMetricTensor.ts:115`). 3D angle gate via `lawOfCosines` on `sampler.position` (`metrics.ts:782`).
- **Gate metric (already built this session):** `triangleQualityDistribution` (`metrics.ts:758`) → `pctBelow10/20/30`, `minAngleDeg`, percentiles, **`degenerateCount`** (`area<=1e-12` excluded — must watch this). Feature-region scoping via `extractOuterWallSubmesh` (`metrics.ts:1423`) + `diagnoseTriangleQuality` hook (`windowHook.ts:359`).
- **Watertight unit gate (reuse + extend):** test-local `wallEdgeAudit` (`FeatureConformingTriangulator.test.ts:55-85`) → `nonManifold`, `interiorBoundary` (T-junctions). Assert both `== 0`.
- **Faithful watertight gate (do NOT run in this agent):** the real-WebGPU export-fidelity e2e is the *authoritative* crack detector; unit `wallEdgeAudit` is (u,t)-only and can UNDERSTATE seam cracks (per project memory). The plan structures unit-test proofs but flags the e2e as the final acceptance.

---

## Key Facts Verified In Code (do not re-derive)

| Fact | Location | Consequence for the plan |
|---|---|---|
| CDT inserts zero interior Steiner pts; only winding-flips by sign | `ConstrainedCellTriangulator.ts:77`, :81-87 | root cause; Tier 2 interior loop is the fix |
| Registry stores real `CellPoint`s; both cells read identical ordered set | `FeatureConformingTriangulator.ts:488-496`, `readH`/`readV` :621-634 | reusable mirror; PASS A2 plugs in here |
| `regAdd` dedups via `if (!inner.has(sub))` | :495 | two split triggers → one point |
| `uKey` = `u mod 1` (periodic seam shares key); `tKey` exact | :486-487 | seam splits mirror across u=1≡u=0 |
| `readH`/`readV` exclude pts within `ON_EDGE_EPS` of **each cell's own** `lo/hi` | :625, :632 | **ASYMMETRY RISK** — must fix to absolute-key inclusion OR keep splits ≥ posTol clear of endpoints (see Task 5) |
| `dedupSide` keeps canonical **min-qk** point (both sides agree) | :717-734 | the symmetric-dedup pattern PASS A2 must follow |
| `features.length===0` → `triangulateQuadtree` verbatim | :223 | smooth styles never enter feature body |
| plain (non-feature) cell branch | :661-681 | untouched by Tier 2 |
| `triangulateConstrainedCell` call site (before `globalOf` map) | :796-801 | Tier 2 interior loop hooks here |
| WELD_TAU (1e-6) jitter weld + u=1→u=0 seam index-merge | :819-862 | downstream, unchanged |
| **`sampler` already in scope** at the dispatch; one arg from the triangulator | `ConformingWall.ts:434` (`buildWallMeshAtScale` holds `sampler`) | 3D refinement needs only a closure plumb-through — NOT new architecture |
| `cornerSnap = 0.06 / 2^featureLevel` (absolute) | `ConformingWall.ts:433` | shell radii must compose with this (≥ cornerSnap) |
| `shouldRefine` bounds only `max(physW,physH)`; F-inclusive `cellAspect3D` exists but is only used in the gated directional pass | `PeriodicBalancedQuadtree.ts:294`, :752-766 | Tier 1a OR-clause source |
| GATE A deferred w/ features; GATE B feature-agnostic, forces u-short/t-long cells | `WatertightAssembly.ts:148`, :153-160 | Tier 1a must NOT fight uBias; Tier 2 fixes the GATE-B residual via interior insertion |

---

## File Touch-Map

| File | Tier | Change |
|---|---|---|
| `src/fidelity/metrics.ts` | gate | **No production change.** Reuse `triangleQualityDistribution` + `extractOuterWallSubmesh`. (Task 1 only wires a test harness around it.) |
| `src/renderers/webgpu/parametric/conforming/CellQualityRefinement.ts` | **NEW** | Tier 2 interior Ruppert/Chew kernel: 3D-metric bad-triangle scan, circumcenter/off-center, **on-edge rejection**, sharp-corner protection, per-cell cap. ~250–350 LOC. |
| `src/renderers/webgpu/parametric/conforming/EdgeSegmentDensifier.ts` | **NEW** | Tier 2 PASS A2: deterministic, interior-independent, edge-local split-point computation + fixpoint. Pure function of registered edge points + feature crossings + 1-D edge-line sizing. ~120–180 LOC. |
| `src/renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator.ts` | T2 | Add an OPTIONAL `refine?: CellRefineOptions` param to `triangulateConstrainedCell` that, when present, calls `CellQualityRefinement` after the seed CDT. Default absent ⇒ byte-identical to today (existing 3-arg callers/tests unchanged). |
| `src/renderers/webgpu/parametric/conforming/FeatureConformingTriangulator.ts` | T2 | (i) PASS A2 invocation + `regAdd` of edge splits before the freeze; (ii) **fix `readH`/`readV` inclusion to absolute-key** (Task 5); (iii) thread the sampler closure + `angleBar`/cap options into the PASS B `triangulateConstrainedCell` call; (iv) detect/forbid on-edge interior insertion. |
| `src/renderers/webgpu/parametric/conforming/QuadtreeTriangulator.ts` | T1b | Aspect-gated shorter-3D-diagonal + apex-anchored/ear-clip transition templates; strict legacy tie-break when isotropic. Reads per-leaf E,F,G. |
| `src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree.ts` | T1a | Aspect-aware OR-clause in `shouldRefine` using F-inclusive `cellAspect3D`; tag per-leaf E,F,G onto leaves for the templates. |
| `src/renderers/webgpu/parametric/conforming/ConformingWall.ts` | wiring | Thread the sampler closure + a `qualityRefine` enable option (default OFF) through `buildWallMeshAtScale` → `triangulateQuadtreeWithFeatures`. |
| `src/renderers/webgpu/parametric/conforming/CellQualityRefinement.test.ts` | **NEW** | Unit tests (Tasks 4, 6, 7, 8). |
| `src/renderers/webgpu/parametric/conforming/EdgeSegmentDensifier.test.ts` | **NEW** | Two-cell conformance tests (Task 5). |
| `src/fidelity/featureQualityHarness.test.ts` | **NEW** | Task 1 measurement-gate harness. |

**Constants (single source, top of `CellQualityRefinement.ts`):**
`THETA_MIN = 20` (gate bar), `THETA_REFINE = 25` (drive refinement slightly above the bar for margin), `MAX_STEINER_PER_CELL = 32`, `MAX_STEINER_PER_WALL` (global belt), `ASPECT_CAP = 4` (Tier 1a), `SHARP_CORNER_DEG = 36` (input angle below which a corner is "unfixable" and protected; ≈ the Ruppert "no all-output ≥ 20° below ~2× bound" rule), `MIN_EGF2 = 1e-9` (F-shear degeneracy floor → no-refine fallback).

---

## TDD Tasks (bite-sized; failing test first, then implement)

> **Discipline (per project memory — measurement before fixes):** every task lands its failing test FIRST, runs it red, then implements to green. No task may touch production code before its test exists and fails. Run `npm run typecheck && npm run lint && npm run test -- <file>` after each. The 20/20 byte-identical snapshot battery is the regression gate for every Tier-1 task.

### Task 1 — Measurement harness wiring (FIRST; no production change)
**Why first:** establishes the gate the whole plan is judged against; reproduces the live measurement deterministically.

- **Test (`featureQualityHarness.test.ts`):** build a small synthetic feature wall (e.g. `SyntheticCylinderSampler` + one non-dyadic vertical crease and one braid-like crossing, reusing the `vertical(u)` helper pattern from `FeatureConformingTriangulator.test.ts:135`), evaluate to 3D via the sampler, run `triangleQualityDistribution` over the **outer-wall submesh** (`extractOuterWallSubmesh`). Assert the harness REPORTS `pctBelow20`, `minAngleDeg`, `degenerateCount`, and a **feature-band-only** variant (mask to cells the feature crosses). Assert it currently shows `pctBelow20 > 0` on the feature band (locks in the baseline; this is the red→stays-red-until-Tier-2 gate).
- **Also assert** a "sharp-corner-excluded" `pctBelow20` accessor exists (returns the percentage *excluding* triangles incident to an apex with input angle `< SHARP_CORNER_DEG`) — even if it equals the raw value for now (no corners in the smooth-crease fixture). This pins the API the later tasks gate on.
- **Implement:** harness helper only (test file + a tiny exported `measureFeatureQuality(mesh, mask)` wrapper if convenient). No production geometry change.
- **Green = ** baseline numbers printed and asserted; CI green.

### Task 2 — Tier 1a: aspect-aware stop (no template change yet)
- **Test (`PeriodicBalancedQuadtree.test.ts`):** (a) **byte-identical guard** — on a smooth default-dim config, assert the leaf set is **identical** with the aspect OR-clause added (measure: count leaves whose `cellAspect3D > ASPECT_CAP` at default dims FIRST; if any exist the byte-identical contract is at risk and must be re-reviewed — see Required Fix). (b) **positive** — on a synthetic anisotropic config (force a 1:N physical cell), assert the cell now splits until `cellAspect3D ≤ ASPECT_CAP`. (c) **F-shear guard** — a cell with `physW ≈ physH` but high F (shear) splits per `cellAspect3D` and an axis-aligned-only predicate would NOT have; assert `cellAspect3D` (F-inclusive) drives it, and a u-long uBias cell is NOT over-split (does not fight GATE-B).
- **Implement:** add `|| cellAspect3D(...) > ASPECT_CAP` to `shouldRefine` (line 294), reusing the existing F-inclusive helper. Tag per-leaf `{E,F,G}` onto the leaf for Task 3.
- **Green + run the 20/20 byte-identical snapshot battery** (the real regression gate, not the unit pins).

### Task 3 — Tier 1b: shape-aware templates (plain diagonal + transition fan)
- **Test (`QuadtreeTriangulator.test.ts`):** (a) **byte-identical** — isotropic cell (E==G, F==0, B==0) emits the EXACT legacy indices (SW→NE diagonal; centroid fan); tie at equal 3D diagonal length resolves to SW→NE (compare **quantized** 3D lengths to avoid jitter flips). (b) **positive** — a 2:1 anisotropic transition cell's worst-triangle min 3D angle is materially higher with the apex-anchored/ear-clip template than with the centroid fan. (c) **degenerate guard** — N-mid ear-clip on a near-collinear mid set emits NO zero-area triangle; assert `degenerateCount` does not rise and CCW/positive-area holds.
- **Implement:** in the singleMid/plain branches, choose shorter 3D diagonal / ear-clip the boundary polygon by locally-max-min-angle ear, using per-leaf E,F,G. Strictly gated on `cellAspect3D > EPS || B>0`, else fall through to the existing branch unchanged.
- **Green + re-run snapshot battery.** Re-measure the harness (Task 1): expect grading-band-dominated styles (Crystalline, DragonScales, the smooth-wall portion of Gothic) to drop sharply.

### Task 4 — Tier 2 kernel skeleton: 3D-metric bad-triangle scan + interior circumcenter (single isolated cell, no registry)
- **Test (`CellQualityRefinement.test.ts`):** synthetic single cell — a unit box with one off-centre feature constraint chord that, under a supplied anisotropic sampler closure, makes the seed CDT emit a triangle with min 3D angle < 20°. Assert: after `refineCellInterior(seedResult, sampler3D, {angleBar:20, cap:32})`, **every** non-corner triangle has min 3D angle ≥ 20°, AND **no inserted point lies within `ON_EDGE_EPS` of any cell side** (interior-only invariant), AND `degenerateCount == 0`, AND aspect3D p95 falls.
- **Implement (`CellQualityRefinement.ts`):** worklist of bad triangles (min 3D angle via the sampler closure, matching the gate's `lawOfCosines` basis); insert the circumcenter (mapped to (u,t)); **reject** any candidate outside the box or within `ON_EDGE_EPS` of a side (do NOT insert, do NOT split — the boundary is PASS A2's job); re-run `triangulateConstrainedCell` with augmented interior (boundary + constraints unchanged); skip re-`planarizeConstraints` (midpoints are collinear, add no crossings). Use **off-center (Üngör)** placement to cut insertion count.
- **Green.** This proves the quality engine in isolation with zero watertight surface.

### Task 5 — Tier 2 watertight core: PASS A2 edge densifier + the two-cell conformance proof (THE load-bearing task)
**This is the single highest-risk invariant. Budget the most time here.**

- **Test (`EdgeSegmentDensifier.test.ts`):** construct TWO adjacent cells sharing one edge, each with DIFFERENT interior point sets and different feature chords clipped to their own boxes (so any interior-dependent rule would diverge). Run the full `triangulateQuadtreeWithFeatures` path with Tier 2 enabled. Assert:
  1. `readH`/`readV` return the **identical ordered split set** for the shared edge from both cells (call them directly on the post-A2 registry).
  2. `wallEdgeAudit(mesh).interiorBoundary == 0` AND `.nonManifold == 0` (extend the existing GAP-2 / tangent-border watertight test).
  3. **Periodic seam case:** repeat with the shared edge ON the u=1≡u=0 seam (via `uKey` mod-1); assert identical split set and `interiorBoundary == 0`.
  4. **Idempotence / order-independence:** running PASS A2 twice yields the same registry; processing cells in reversed order yields the same registry.
- **Implement (`EdgeSegmentDensifier.ts` + wiring in `FeatureConformingTriangulator.ts`):**
  - For each shared edge (grid line), gather its registered points (`regH`/`regV` inner map) + the feature crossings on that line; sort along the line.
  - For each consecutive sub-segment, if its length exceeds a **target derived from the 1-D sizing field at the edge-line coordinate** (`field.edgeLength` evaluated at the midpoint's (u,t) — a pure function of position), insert the **arithmetic midpoint** via `regAdd` at the absolute grid-line key. Iterate to a **fixpoint** (a freshly split sub-segment may itself still exceed target).
  - **Fix the `readH`/`readV` asymmetry:** replace the per-cell `> lo+ON_EDGE_EPS && < hi-ON_EDGE_EPS` interior test with an **absolute quantized-position** inclusion (point's `uKey`/`tKey` strictly between the two corner keys of the edge), so both cells make a bit-identical keep/drop decision regardless of which cell's `u0/u1` is the reference. Guard the change behind the byte-identical snapshot battery (it must be a no-op when there are no A2 splits).
  - Run PASS A2 **after** the existing PASS A registration, **before** the registry is read in PASS B (still inside the open-registry window).
- **Green = ** the conformance test passes AND the byte-identical battery is unchanged (A2 is a strict no-op without splits, because the feature path with no over-long sub-segments registers nothing new).

### Task 6 — Sharp-corner detection + protection + concentric-shell termination
- **Test (`CellQualityRefinement.test.ts`):** a cell with two feature constraints meeting at an apex at ~30° (below `SHARP_CORNER_DEG`). Assert: (a) refinement TERMINATES (no infinite cascade) within the per-cell cap; (b) triangles incident to the apex are **excluded from the bad-triangle worklist** (not chased toward 20°); (c) the harness's "sharp-corner-excluded" `pctBelow20` (Task 1 API) reports those residual sub-20° triangles **separately**; (d) if the apex sits on a shared edge, its shell splits are `regAdd`-ed and the two-cell audit stays `interiorBoundary == 0` (mirrors via PASS A2's pure-function shell radii).
- **Implement:** classify an apex by the 3D input angle between incident constraint segments (computed identically across cells sharing the apex); mark incident triangles "corner-locked"; for sub-segments incident to such an apex, split at **power-of-two metric distance from the apex** (concentric shells; radii ≥ `cornerSnap` so they compose with the absolute corner-snap) so flanking sub-segments stay congruent and stop mutually encroaching.

### Task 7 — Termination bound + F-shear degeneracy fallback
- **Test:** (a) an adversarial high-curvature F-shear cell (`EG − F² < MIN_EGF2`) is detected and **left at the seed triangulation** (no-refine fallback), `degenerateCount` does not rise, no hang. (b) a pathological cell that cannot clear the bar exits at exactly `MAX_STEINER_PER_CELL` insertions and returns a valid (still-watertight) triangulation. (c) global `MAX_STEINER_PER_WALL` is honored.
- **Implement:** the `MIN_EGF2` floor (skip refinement, accept today's triangles), the per-cell hard cap (best-so-far on exhaustion), and the per-wall counter. **Termination guarantee statement:** Tier 2 interior refinement is unconditionally bounded by the per-cell cap regardless of acute inputs; the ≥20° *guarantee* degrades to best-effort-with-cap near protected corners and F-shear (accepted by the target). PASS A2's fixpoint terminates because each split strictly shortens sub-segments and the sizing-field target floors at `minEdge` (bounded number of splits per edge).

### Task 8 — End-to-end feature-quality + smooth no-regression + budget interplay
- **Test (`featureQualityHarness.test.ts`, extended):** with Tier 1+2 enabled, on the 5 failing-style fixtures (or their synthetic stand-ins): assert feature-band `pctBelow20` (sharp-corner-excluded) drops to **single digits**; worst non-corner min-angle ≥ ~15–20°; aspect3D p95 ≤ ~6; `degenerateCount` does not rise.
- **Smooth no-regression:** assert the `features.length===0` short-circuit path is byte-identical (the existing delegate test, `:142`), AND the 20/20 default snapshot battery is unchanged (15 byte-identical, 5 re-baselined — re-review the 5 only if a deliberate change is justified).
- **Budget interplay:** assert Tier-2 quality-Steiner insertions either (i) are exempt from the `targetTriangles` cap, or (ii) trigger a budget re-evaluation — so a feature-dense style does NOT overshoot the user budget. Document which is chosen.
- **Flag default:** the new `qualityRefine` option defaults **OFF** end-to-end; this task flips it on only for the feature-quality assertions, leaving production gating to a follow-up flag flip (consistent with the conforming-mesher cutover being integration-gated).

---

## Registry-Mirror Mechanism (detail)

1. **Keys (unchanged):** `tKey(t) = round(t·QSCALE)`; `uKey(u) = round(((u mod 1)+1 mod 1)·QSCALE)` so the periodic seam u=1≡u=0 shares a key (`FeatureConformingTriangulator.ts:486-487`).
2. **What is mirrored:** ONLY PASS A2 edge-densification midpoints (and sharp-corner shell points on a shared edge). Tier-2 interior circumcenters are **never** mirrored (rejected if on-edge) — exactly like today's planarization Steiner points (`:611`, "lie strictly inside one cell").
3. **How:** `regAdd(regH, tKey(tEdge), uKey(uMid), {u:uMid, t:tEdge})` for a horizontal edge; `regAdd(regV, uKey(uEdge), tKey(tMid), {u:uEdge, t:tMid})` for vertical. `regAdd`'s `if (!inner.has(sub))` collapses the two neighbour triggers to one point.
4. **Bit-identical value:** the split point is the arithmetic mean of two registered points on the SAME line (or a power-of-two shell radius from a shared apex) — both pure functions of the two endpoints' (u,t), so both cells derive the identical coordinate regardless of float reduction order.
5. **Symmetric inclusion at read time:** `readH`/`readV` inclusion is changed to an **absolute quantized-position** test (Task 5) so endpoint/epsilon decisions cannot diverge across the edge — closing the `ON_EDGE_EPS`-against-own-`u0/u1` asymmetry the adversarial review flagged.
6. **Ordering invariant:** ALL on-edge splits are registered (PASS A2 fixpoint) **before** PASS B reads the registry. No split is ever discovered during PASS B (interior refinement is forbidden from touching edges). This is what makes the mirror sound where the naive Ruppert designs failed.
7. **Untouched downstream:** the WELD_TAU jitter weld (`:819`) and the u=1→u=0 seam index-merge (`:848-862`) operate on the refined output unchanged; CCW winding renormalized per triangle by signed area (`ConstrainedCellTriangulator.ts:81-87`).

---

## Termination Bound (summary)

- **Tier 1a/1b:** non-iterative templates (O(points/cell), ear-clip yields k−2 ≤ k triangles) + aspect splits bounded by `ceil(log2(A/ASPECT_CAP))` extra levels, hard-capped by `levelCap`/`maxLevel` and the 2:1 balance fixpoint.
- **PASS A2:** each split strictly halves a sub-segment; the sizing-field target floors at `minEdge`, so finitely many splits per edge; fixpoint is monotone (only adds points) and idempotent → terminates and is order-independent.
- **Tier 2 interior:** unconditionally bounded by `MAX_STEINER_PER_CELL` (best-so-far on exhaustion) and `MAX_STEINER_PER_WALL`; sharp-corner protection + concentric shells prevent acute-input cascades; `MIN_EGF2` fallback prevents F-shear ill-conditioning non-termination. **No global pass** → none of the old O(bbox³) hang class.

## Smooth-Style No-Regression Gate

Three independent guards, each verifiable:
1. `features.length===0` → `triangulateQuadtree` verbatim (`:223`) — smooth styles never enter the feature body. Pinned by the delegate test (`:142`).
2. Tier-1 template/stop changes are strict no-ops at the no-op value (isotropic, B=0), tie-broken to the legacy choice; **proven against the 20/20 byte-identical snapshot battery**, not just the weak unit pins.
3. Tier-2 is opt-in (`qualityRefine` default OFF) AND a no-op when no triangle is bad (clean feature cells, e.g. the 83% of DragonScales already ≥20°, keep their triangulation).

## Sharp-Corner Exception Policy

A feature apex whose incident-constraint 3D input angle `< SHARP_CORNER_DEG` (≈36°) is **protected**: its incident triangles are excluded from the bad-triangle worklist (never chased toward 20°), and its boundary sub-segments are split by concentric power-of-two shells (radii ≥ `cornerSnap`) so refinement halts in a small congruent fan instead of cascading. Residual sub-20° triangles AT such corners are reported **separately** by the harness and are NOT counted as failures — matching the user's explicit allowance.

---

## Top Risks & Mitigations

1. **PASS A2 split predicate accidentally depends on interior state → T-junction.** Mitigation: derive splits ONLY from registered edge points + edge-line sizing (1-D) + feature crossings; the two-cell conformance test (Task 5) with deliberately-divergent interiors is the proof; the real-WebGPU export-fidelity e2e is the final acceptance (unit `wallEdgeAudit` is (u,t)-only and can understate seam cracks).
2. **`readH`/`readV` endpoint-epsilon asymmetry** (verified at `:625`/`:632`). Mitigation: switch to absolute-key inclusion (Task 5); guard with the byte-identical battery.
3. **3D-vs-(u,t) angle divergence on high-curvature F-shear cells.** Mitigation: refine in the 3D metric via the threaded sampler closure (matching the gate); `MIN_EGF2` no-refine fallback for near-singular cells; validate empirically on the feature-restricted submesh before claiming the bar is cleared.
4. **Byte-identical regression from a loose Tier-1 gate.** Mitigation: strict tie-break to legacy; quantized-length comparison; the snapshot battery is the acceptance gate, not the 6 weak unit pins.
5. **Budget overshoot** (Tier-2 adds triangles after the `targetTriangles` cap search). Mitigation: exempt quality-Steiner triangles from the cap or re-run the budget search; asserted in Task 8.
6. **Degenerate-trade illusion** (gate excludes `area<=1e-12`). Mitigation: every quality assertion also checks `degenerateCount` does not rise and aspect3D p95 falls.
7. **Perf on HexagonalHive/Gyroid** (per-insertion `cdt2d` re-run). Mitigation: Tier 1 shrinks the cell count entering Tier 2; per-cell cap; skip re-`planarizeConstraints`; measure Gyroid triangle count + build time explicitly.

---

## Expected Result

- After Tier 1: grading-band-dominated styles (Crystalline 40%, DragonScales 17%, Gothic smooth wall, and a large share of Gyroid/ArtDeco/Hex) drop sharply (toward ~15–35%).
- After Tier 2: feature-region `pctBelow20` (sharp-corner-excluded) → single digits everywhere; worst non-corner min-angle 1.4–7° → ~15–20°+; aspect3D p95 ≤ ~6.
- Smooth styles: byte-identical; 20/20 default watertight baseline green.
- Triangle growth: small constant factor on feature regions only (Tier-1 squares the bulk; Tier-2 fires on the minority); whole-mesh growth negligible, within the budget cap.
- **Acceptance is the real-WebGPU export-fidelity watertight gate**, not unit `wallEdgeAudit` alone.
