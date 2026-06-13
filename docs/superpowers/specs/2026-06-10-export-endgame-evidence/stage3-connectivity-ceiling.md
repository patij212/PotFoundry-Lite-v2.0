# Stage 3 input — the connectivity ceiling at oblique crest crossings (measured 2026-06-13)

**Question (blueprint `openRisks` #1 / Stage 3 Step C):** with crest crossings
placed EXACTLY on the grid lines (the Stage-4 watertight-preserving placement),
can a smarter cell-interior triangulation (connectivity alone — no Steiner, no
cell re-alignment) remove the slivers an axis-aligned (u,t) grid produces where
a sharp/cusped crest crosses a cell?

**Hypothesis H (falsifiable):** for a real SFB@1 crest-crossing feature cell,
there EXISTS a triangulation of the fixed exact-placed point set (crest held as
a constraint) whose minimum triangle angle, measured **in 3D on the true
surface**, exceeds 15°.

**VERDICT: H is REFUTED.** Connectivity helps but cannot reach the bar. More
than half of all real crest cells cannot be triangulated above 15° by ANY
triangulation.

Instrument: `potfoundry-web/src/fidelity/cellTriangulationCeiling.ts`
(`measureCellCeiling` / `runSfbCrestCellCeilingAudit`), test-pinned by
`cellTriangulationCeiling.test.ts`. CPU-only, vitest-runnable, **production
byte-identical** (it imports the REAL production cell fill
`triangulateConstrainedCell` = cdt2d, the REAL analytic ridge
`sfClosedFormParamRidge`, and the IDENTICAL surface + config as the snap-floor
audit — `SfbWallSampler`, SFB1_PACKED, featureLevel 7, B=2; only `export`
keywords added). The min-angle is measured in **3D**, never in (u,t), so the
reference-domination trap that fooled prior sessions cannot recur.

## Method

For every SFB@1 closed-form **crest** branch, walk it across the production
`512×128` (L=7, B=2) grid. For each crossed cell place the crest entry/exit at
the exact crest∩grid-line intersection (the only watertight-shareable
placement). A single straight chord splits the axis-aligned cell into two convex
sub-polygons sharing only the chord, so the chord-respecting triangulations are
exactly the products of each side's triangulations. Enumerate **all** of them
(Catalan, n≤6) and report `bestCellMinAngle = min(best(subA), best(subB))` in
3D, alongside the production fill's 3D min-angle on the identical input.

Validated against known cases (`cellTriangulationCeiling.test.ts`): Catalan
counts (3→1, 4→2, 5→5, 6→14, 7→42); equilateral=60°, square=45°; a corner-graze
reads a forced <1° sliver; a centred opposite-edge crossing reads >20°; and
`best ≥ cdt2d` on every non-suspect cell (cdt2d's output is in the enumerated
set).

## Result (SFB@1, default dims, exact placement)

`2010` crest cells measured — corner-clip `1501`, opposite-edge `509`,
same-side `0`, degenerate `2`; cdt2d dropped/flipped on `0` (the production-fill
numbers are trustworthy).

| 3D min-angle (deg) | min | p05 | median | <15° | <20° | <30° |
|---|---|---|---|---|---|---|
| **CEILING (best achievable, any triangulation)** | 0.01 | 0.95 | **12.94** | **1116** | 1373 | 1922 |
| production fill (cdt2d, ships today) | 0.01 | 0.77 | 8.91 | 1624 | 1896 | 2008 |

- **VERDICT: 55.5% of crest cells have a best-achievable 3D min-angle < 15°**
  (68.3% < 20°). The MEDIAN best-achievable is 12.94° — below the bar.
- Connectivity is a **real but partial** lever: cdt2d→ceiling improves the
  median +4.0° and removes ~31% of the sub-15° cells (1624→1116). It does NOT
  clear 15°.
- **Forced corner-triangle slivers** (one sub is a single triangle whose 3
  vertices are all pinned — provably unfixable by connectivity): `70` below 15°,
  `186` below 20°, worst `6.04°`. These are a HARD floor, but they are NOT the
  main driver — only 70 of the 1116 sub-15° ceilings.

## Mechanism (corrects the "it's the corner triangles" framing)

The sub-15° ceiling is **pervasive across all crossing topologies**, not
confined to forced corner triangles. The root cause is that the crest locus
`u*(t) = (2j−1)/(2·m(t))` is **incommensurate with the axis-aligned grid**: it
grazes grid lines and corners at essentially arbitrary offsets, carving thin
slivers off cells (a thin slab beside a near-parallel crossing; a thin corner
triangle beside a corner graze). A thin region in (u,t) maps to a thin region in
3D — and near the n1=0.35 **cusp** the surface metric is additionally
anisotropic, so even a geometrically "fat" (u,t) sub-polygon can be a 3D sliver.
B=2 squares the cell on AVERAGE but not at the cusp, where curvature spikes.
No choice of diagonals removes a sliver that is intrinsic to the point set.

This is exactly the user's report — "columns/rows crossing features still
produce bad results" — quantified: the defect is the grid-vs-feature
misalignment, not the triangulation policy.

## Implications for the plan

1. **Step C (metric-aware feature-cell fill) is worth doing but is NOT
   sufficient** — it buys ~+4° median / −31% sub-15° cells, then plateaus far
   below the goal. It cannot be the serration cure on sharp crests.
2. **Crest-aligned / sheared cells are NECESSARY, not optional.** The deferred
   "Stage 5 likely no-op" verdict (from the warp-composed ceiling map, which
   measured SpiralRidges' helix-shear case, not the SFB cusp-crossing case) does
   NOT generalize to inserted sharp cusps. Aligning a local grid line to the
   crest tangent is the only lever that removes the slivers by construction (the
   crest becomes a cell edge with full cells either side).
3. **Reconciles the contradiction:** Stage 1's connectivity work legitimately
   drove the SMOOTH-relief styles' bands to <2% — connectivity suffices there.
   The styles the user sees serrate are the SHARP cusps (SFB), where this
   measurement shows connectivity provably cannot reach the bar. Two style
   classes, two cures.

## Caveats (what this does and does not prove)

- It bounds the **connectivity-only** ceiling. It does NOT measure crest-aligned
  cells or anisotropic Steiner insertion — those change the point set / cell
  structure and are the proposed cures, to be measured next.
- Single-chord-per-cell crest model (the most charitable case; denser crest
  vertices add MORE thin cells, never fewer).
- featureLevel-7 cells; finer cells do not help — cusp cross-anisotropy is
  scale-invariant (Kobbelt: normals don't converge).
- Specific to sharp cusps (n1<1). Smooth-relief crests are a separate, milder
  regime.

Reproduce: `npx vitest run src/fidelity/cellTriangulationCeiling.test.ts`
(the headline test logs the full table; values from the 2026-06-13 run at the
pinned SFB@1 config).

---

# Stage 3b — the cure: crest-ALIGNED cells (measured 2026-06-13)

**Question:** if the local lattice is aligned to the crest so the crest is a
grid LINE (not a chord cutting across cells), do the crest-adjacent cells become
well-shaped in 3D?

**VERDICT: YES, decisively.** Aligning the lattice converts the problem from
"55.5% of crest cells unfixable" to "≥99.8% well-shaped."

Instrument: `potfoundry-web/src/fidelity/crestAlignedCeiling.ts`
(`runSfbCrestAlignedCeilingAudit`) + test. Same real SFB@1 crests, same grid
spacing, same `SfbWallSampler` 3D surface (cusp included), production
byte-identical. Two alignment models, both crest-adjacent flank cells (the ones
that were slivered), best of the two diagonals in 3D:

- **M1 — SHEARED lattice** `v = u − u*(t)` (parallelogram cells; EXACTLY what
  the repo's `CreaseUWarp`/`CreaseHelixWarp` already do — shift u by the crease
  offset).
- **M2 — PERPENDICULAR crest-frame ribbon** (rectangle in the crest frame; the
  ideal, via a surface-Jacobian perpendicular offset).

## Result (1996 crest-adjacent flank cells)

| model / aspect | min | p05 | median | <15° | <20° |
|---|---|---|---|---|---|
| AXIS-ALIGNED (best connectivity, Stage 3) | 0.01 | 0.95 | 12.94 | **55.5%** | 68.3% |
| M1 sheared, widthScale 0.5 | 6.56 | 29.19 | **38.41** | 0.2% | 0.2% |
| M1 sheared, widthScale 1.0 | 7.24 | 21.57 | 27.23 | 0.2% | 0.2% |
| M2 perpendicular, widthScale 0.5 | 8.63 | 26.82 | 34.08 | 0.1% | 0.2% |
| M2 perpendicular, widthScale 1.0 | 13.93 | 16.36 | 23.38 | 0.9% | 27.5% |
| M1 sheared, widthScale 2.0 | 7.63 | 12.78 | 15.47 | 46.0% | 66.0% |
| M2 perpendicular, widthScale 2.0 | 3.61 | 10.11 | 13.79 | 57.6% | 79.3% |

## Readings

- **Alignment is the cure.** At cross-crest extent ≤ along-crest (widthScale
  ≤ 1) BOTH models drive the sub-15° fraction from 55.5% to **0.1–0.9%** and the
  median from 12.94° to **23–38°**. The sharp cusp does NOT poison flank cells —
  it lives on the crest EDGE (a dihedral between the two flank ribbons), exactly
  where a sharp feature belongs, so it never appears as a bad triangle ANGLE.
- **The cheap version already works.** M1 is the EXISTING `CreaseUWarp` shear
  (no new meshing primitive) and at widthScale 0.5–1 it is sliver-free
  (<20°: 0.2%). M2 (true perpendicular) has the better worst-case floor (no cell
  below 13.93° at widthScale 1) but needs a Jacobian-based offset.
- **Sizing constraint (actionable):** widthScale 2 REGRESSES to ~50% sub-15° —
  if the crest-adjacent ribbon is wider cross-crest than the along-crest
  spacing, slivers return. The ribbon cells must be sized cross ≤ along (refine
  ACROSS the feature). The instrument discriminates (not rigged): the cure has a
  real aspect window.
- Residual tail (M1 min ~6.5–7.6°, ~0.1–0.2% of cells): a handful at branch
  births / seam / cusp apex — the structurally-untested cell-interior-endpoint
  class the blueprint already flags for per-style endpoint measurement.

## Net architecture conclusion (Stage 3 + 3b)

Connectivity-only is insufficient on the axis-aligned grid (55.5% sub-15°);
crest-aligned cells are the cure (→0.1–0.9% sub-15°), and the existing
crease-warp machinery is most of the way there. The work is: (1) a warped
(sheared/perpendicular) local lattice along inserted SHARP crests with
cross ≤ along sizing, (2) watertight tiling of the ribbon into the surrounding
axis-aligned grid (the transition zone — the remaining engineering unknown, not
measured here), (3) per-style endpoint handling at births/seam. Step C (better
diagonals) stays as a cheap partial improvement, NOT the cure.

Reproduce: `npx vitest run src/fidelity/crestAlignedCeiling.test.ts`.

---

# Stage 4 — multi-angle workflow + independent verification (2026-06-13)

An 11-agent workflow (ground-truth → 5 architectures → 2 probes → adversarial
refute → synthesize) attacked "every-triangle-perfect mesher." Its real value
was the **adversarial refutations**, three of which I then **independently
re-measured and CONFIRMED** (`src/fidelity/seamPeriodicityVerify.test.ts` +
the agent probes `warpDomainCeiling.ts`, `ribbonTransitionCeiling.ts`).

## VERIFIED findings (these overturn the naive "global warp cures it")

1. **★ SFB@1 is genuinely NON-PERIODIC in u — a real ~11.4 mm seam discontinuity
   in the MODEL.** `max|sfRf(1,t) − sfRf(0,t)| = 0.6146` rf units → 11.414 mm
   radial gap at t=0.675 (m=8.496). `sfRf` does not self-wrap; production WGSL
   evaluates literal `u`. The Gielis superformula with non-integer petal count
   `m(t)=6+4·t^1.2` is not 2π-periodic. **`SfbWallSampler` HID this** by wrapping
   u (`position(1,t)=position(0,t)` by construction → the `warpDomainCeiling`
   seamGap=1.86e-14 is a coordinate tautology, NOT closure). IMPLICATION: "perfect
   representation of the model" at the seam means representing the discontinuity
   as a SHARP FEATURE EDGE (like a crest), not bridging it with a stretched cell.
   The current export index-welds u=1→u=0, so the seam strip spans the 11mm cliff
   — a likely real production seam defect, separate from crest serration.
2. **The crest-aligned "cure" (Stage 3b) was measured on CRESTS ONLY.**
   `sfClosedFormParamRidge` returns 10 crests / 0 valleys; the generic solver
   finds 10 crests + 10 valleys. The 10 cusp valleys (n1=0.35 minima) are
   unmeasured — the cure is confirmed for crests, OPEN for valleys.
3. **The global warp φ=u·m(t) regresses at production along-density.** Fold-free
   (verified, single-signed) and great at tRows=64 (crest 0.5% sub-20°), but at
   production tRows=256 crest sub-20° = **16.6% (min 2.91°)** and seam sub-15° =
   **62.1%**, even with φ/petal grown 26→100 to hold aspect≤1. The bulk/valley
   are clean at coarse density but the crest cure does NOT survive density unless
   φ-refinement is coupled to t-refinement (and even then the refutation shows it
   regressing). The naive global warp is NOT a production cure.
4. **The local ribbon's naive transition is a new sliver source** (31% sub-15°,
   median 3D aspect 1.39, 82.6% violate aspect≤1) — the cure RELOCATES, not
   removes, the slivers; watertight contract held (0 edge mismatches) but the
   seam transition emits a phantom column past u=1 (masked by QSCALE wrap).

## Workflow's recommended architecture (FPL-SS) — directional, NOT yet proven

"Feature-Phase Lattice with Snapped Seam + Birth-Wedge": global φ=u·m(t) warp
(reusing the CreaseUWarp family) + registry-tiled seam wedge + birth-wedge
closure. Reasonable direction, but EVERY load-bearing part is unproven and two
(seam non-periodicity, density regression) are now confirmed HARDER than the
synthesis grappled with. Its own pre-registered GATE 2 (the non-integer seam at
tRows=256, with 3D-angle AND geometric non-overlap, not just key-match) is the
correct next measurement.

## Honest state: there is NO proven every-triangle-perfect solution yet

Confirmed: crest-aligned cells cure crest cells in isolation (Stage 3b). Refuted:
naive global warp at density; naive ribbon transition. Newly confirmed: the seam
is a genuine model discontinuity (must be a feature edge); valleys unmeasured.
The path (feature-aligned cells for crests + valleys + SEAM-as-feature, with
density-coupled aspect refinement) is clear but unbuilt/unmeasured. Next probes:
(a) seam-as-feature-edge ceiling, (b) valley-aligned ceiling, (c) density-coupled
φ-refinement that holds aspect≤1 AND crest quality at tRows≥256.

Reproduce: `npx vitest run src/fidelity/seamPeriodicityVerify.test.ts`.

---

# Stage 5 — the density regression is a UNIFORM-LATTICE artifact, NOT cusp/birth (2026-06-13)

**Scope correction (user, 2026-06-13):** the sharp seam cliff is ACCEPTED and
OUT OF SCOPE (not unique to SFB; to be explored after the pipeline). So Stage 4's
seam slivers (62%) are a non-issue; the only in-scope blocker was the crest
density regression (16.6% sub-20°, min 2.91° at tRows=256).

**Probe:** `src/fidelity/featureDensityLocalization.test.ts` — builds PER-ROW
3D-SQUARE feature-aligned flank cells (dφ chosen per row so cross == along, the
ideal aspect; isolates cusp/birth irreducibility from the uniform-lattice cost),
at production density tRows=256, seam excluded, partitioned crest/valley ×
steady/near-birth, 3D angles via SfbWallSampler.

| region | n | min | median | <15° | <20° |
|---|---|---|---|---|---|
| crest steady | 3968 | **18.38°** | 33.84° | **0.0%** | 5.7% |
| crest near-birth | 24 | 24.55° | 41.72° | 0% | 0% |
| valley steady | 3730 | **21.46°** | 49.72° | 0% | 0% |
| valley near-birth | 20 | 21.35° | 27.80° | 0% | 0% |

## VERDICT — every-triangle-perfect IS reachable for crests + valleys

- **No triangle below 18° anywhere** at production density. **0% sub-15°.** The
  n1=0.35 cusp does NOT poison aligned flank cells (it is the crest EDGE
  dihedral, confirmed again); BIRTHS are clean (min 24.55°). The Stage-4
  regression (min 2.91°, 16.6% sub-20°) was the UNIFORM φ-lattice (fixed
  φ-count across t while m(t) + the surface metric vary), NOT cusp/birth
  irreducibility — i.e. a SIZING artifact, fixable.
- **Valleys are pristine** (min 21.46°, 0% sub-20°) — and they ARE covered here
  (φ=integer columns are the real analytic valleys), closing the Stage-4 valley
  gap for the global-aligned frame.
- The 18.4° crest floor is the SHEARED-parallelogram limit (M1 frame: column
  edges crest-parallel, row edges horizontal). M2 (perpendicular crest-frame)
  had a better worst-case floor in Stage 3b, so ~25-30° is reachable with
  perpendicular framing if a higher floor is wanted. 18° with 0% slivers already
  clears any print/CAD bar.

## What this means for the architecture (in-scope)

The cure is feature-aligned cells with **per-cell aspect control** — and the
machinery already exists: the 2:1-balanced `PeriodicBalancedQuadtree` +
directional u-refine (`:929-960`) does adaptive (dyadic) cross-feature sizing.
Apply it in the feature-aligned (warped) frame (the CreaseUWarp family) and it
should hold the ≥18° floor. The uniform-(φ,t)-lattice global warp tested in
Stage 4 was the WRONG construction (fixed φ-count → regression); the adaptive
quadtree in the warped frame is the right one.

## Remaining in-scope unknown (the next gate)

Per-row-square cells are not directly watertight-tileable (continuously-varying
dφ). The watertight construction uses DYADIC 2:1 refinement, which approximates
per-row-square in factor-of-2 steps. NEXT PROBE: does dyadic 2:1 cross-feature
refinement in the warped frame hold the ≥15° floor (ideally ≥18°) at production
density — i.e. is the factor-of-2 aspect slack within the headroom (square gives
34-50° median, so 2× off should still clear 20°)? If yes, the architecture is
proven end-to-end for crests+valleys+bulk (seam out of scope).

Reproduce: `npx vitest run src/fidelity/featureDensityLocalization.test.ts`.

---

# Stage 6 — dyadic 2:1 gate PASSES: feasibility COMPLETE (in-scope) (2026-06-13)

**Probe:** `src/fidelity/dyadicWarpFloor.test.ts` — the watertight-tileable
DYADIC approximation of per-row-square: feature-phase frame φ=u·m(t), per-row
φ-level snapped to a power of 2 + 2:1-balanced, transition cells (2:1 mid-edge)
triangulated the production way (max of best-diagonal and centroid-fan), 3D
angles, tRows=256, seam excluded.

| cell class | crest | valley | bulk | WORST |
|---|---|---|---|---|
| regular | 18.58° | 19.85° | 17.15° | **17.15°** |
| forced 2:1 transition | 18.58° | 19.87° | 17.23° | **17.23°** |

(all 0% sub-15°; crest sub-20° 0.9% regular / 4.5% transition; medians 26-41°)

## VERDICT — every-triangle-perfect is PROVEN reachable (in-scope), watertight-tileable

- **No triangle below 17° anywhere** at production density — regular AND
  transition cells. The dyadic 2:1 grid holds the per-row-square floor.
- The natural SFB@1 dyadic grid is **uniform (q=6, NO natural transitions)** —
  the aspect need barely varies with height, so the simplest uniform feature-
  aligned grid already works; transitions (forced everywhere as a worst case)
  still clear 17°. The Stage-4 "regression" was purely the warpDomainCeiling
  probe under-sizing φ (100 vs the needed 128/petal) + including seam/births.
- The 17° floor is the M1 sheared-parallelogram limit; M2 perpendicular framing
  (Stage 3b: better worst-case) lifts it toward ~25-30° if wanted. 17° / 0%
  sub-15° already clears any print/CAD bar.

## The complete proven chain (Stages 3→6)

axis-aligned 55% sub-15° (connectivity can't fix) → crest-aligned cells cure it
→ uniform-lattice global warp regresses (artifact) → per-row-square: no cusp/birth
floor (min 18°) → **dyadic 2:1 (watertight) holds it (min 17°, transitions incl.)**.

## Architecture (proven) — mostly existing machinery

Feature-aligned cells via the **CreaseUWarp warp family** (connectivity-invariant,
watertight by construction) + **per-cell dyadic aspect control via the existing
2:1 PeriodicBalancedQuadtree directional u-refine** (`:929-960`), applied in the
warped frame. New code is bounded: a `CreasePetalWarp` (mirror CreaseUWarp) that
pins crest+valley loci φ=k/2, and wiring the aspect-driven φ-refinement. Caps
(t fixed by the u-only warp) and the seam (accepted cliff, out of scope) are
untouched. **Feasibility/research phase is DONE; remaining work is IMPLEMENTATION.**

## Residual (small, honest)

- Caps t=0/1 junction unmeasured (low risk — warp fixes t, pinned rings
  byte-identical).
- 17° floor not "perfect-perfect"; M2 framing is the lever to ~25-30° if a
  higher floor is required.
- Other non-periodic styles: the mechanism is style-agnostic, but each style's
  feature extractor/warp is its own (bounded) work.

Reproduce: `npx vitest run src/fidelity/dyadicWarpFloor.test.ts`.

---

# Stage 7 — M2 perpendicular framing does NOT lift the floor (2026-06-13)

Tested whether the M2 perpendicular crest-frame (Jacobian offset ⊥ crest tangent)
beats M1's 17-18° floor, at per-cell-square width, tRows=256, crests+valleys,
seam excluded (`src/fidelity/m2PerpendicularFloor.test.ts`).

| frame | crest steady | valley steady |
|---|---|---|
| M1 (feature-phase) | min 18.4°, 0% sub-15° | min 21.5°, 0% sub-20° |
| M2 (perpendicular) | **min 12.0°, 12.8% sub-15°** | min 31.1°, 0% sub-25° |

**VERDICT: M2 is WORSE for cusp crests, not better.** Physical cause: M2 offsets
PERPENDICULAR into the flank; for the n1=0.35 cusp the flank curves sharply right
next to the crest, so a full-cell perpendicular offset plunges into that curvature
and distorts the cell. M1's horizontal (t=const) cross-edge stays on the gentler
flank. M2 only helps VALLEYS (gentle minima → 31-45°), but the CREST is the
binding constraint either way → even an M1-crest/M2-valley hybrid floors at the
crest's ~18°. The Stage-3b "M2 better worst-case floor (13.93°)" was config-
specific (fixed widthScale, crests-only, tRows=128) and does not hold at
production per-cell-square.

**CONCLUSION: commit to M1 (feature-phase warp). ~17-18° / 0% sub-15° is
effectively the floor for feature-aligned meshing of an n1=0.35 cusp crest — no
cheap lever above it.** The remaining headroom would require non-uniform
cusp-hugging cells (diminishing returns) and is not worth it; 17-18° with zero
slivers and 26-41° median clears any print/CAD bar.

Reproduce: `npx vitest run src/fidelity/m2PerpendicularFloor.test.ts`.

---

# Stage 8 — cap junction verified: warp is cap-NEUTRAL (+ a pre-existing cap finding) (2026-06-13)

**Probe:** `src/fidelity/capJunctionFloor.test.ts` — models the bottom cap
(`emitRadialCap` / `radialBandCount`, WatertightAssembly.ts: nRing uniform-U
intermediate rings + annulusStrip by index + disc fan/drain), fanning to the
petaled wall ring at t=0, 3D angles, nRing=768.

| cap config | min | median | <15° | <20° |
|---|---|---|---|---|
| annulus rDrain=10 (default), crests ON vertices (M1 warp) | 6.63° | 23.84° | 22.46% | 37.70% |
| annulus rDrain=10 (default), crests BETWEEN (unwarped) | 6.56° | 24.03° | 22.56% | 37.67% |
| solid base (no drain), worst case | 0.47° | 15.90° | 47.29% | 63.33% |

## VERDICT — the M1 warp does NOT break the cap junction

- **The warp is cap-NEUTRAL** (ON-vertices vs BETWEEN ≈ identical: 22.46% vs
  22.56%). The M1 warp `u=φ/m(t)` is LINEAR at fixed t ⇒ the boundary ring stays
  uniform-u at every height ⇒ the cap's uniform-U rings still match by index, and
  crests land ON ring vertices (cleaner). **Cap junction is clean w.r.t. the warp
  ⇒ feasibility for the crest/warp architecture is fully closed.**
- **BONUS (separate, pre-existing): the cap DISC itself slivers** (~22% sub-15° on
  the default annulus, 47% on a solid base, min 6.6°) — `emitRadialCap` keeps
  nRing (768-1024) vertices at EVERY radius while `radialBandCount` clamps to 64
  bands ⇒ radial elongation toward the inner radius (drain/centre), where the
  tangential spacing shrinks but the radial step stays. This is INDEPENDENT of
  the warp and affects CURRENT production (nRing 1024 high → worse). A separate
  cap-mesh defect class, NOT a warp blocker.

## Caveats
- The warp-neutral COMPARISON is robust (both sides use the same cap model). The
  ABSOLUTE sliver % is from a faithful-but-approximate emitRadialCap model
  (linear radius interp); confirm against real `assembleWatertight` output before
  treating the cap sliver as a committed production defect. The structural cause
  (nRing-at-every-radius + 64-band clamp) is real (copied from the source).
- Fix direction for the cap (separate work): coarsen tangentially toward the
  inner radius (drop ring vertices in concentric steps) and/or raise the band
  clamp — standard concentric-disc meshing.

## Feasibility status: COMPLETE (in scope)
Wall crests/valleys/bulk/transitions/births (Stages 5-7) + cap junction (Stage 8,
warp-neutral) all addressed; seam out of scope. M1 feature-phase warp + dyadic
2:1 aspect refinement is the proven architecture (~17° floor, 0% sub-15°). The
cap-disc sliver is a pre-existing, separate item.

Reproduce: `npx vitest run src/fidelity/capJunctionFloor.test.ts`.
