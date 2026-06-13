# Feature-Aligned Crest Mesher — Design Spec (2026-06-13)

**Status:** feasibility PROVEN + adversarially verified (evidence:
`docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage3-connectivity-ceiling.md`
§Stages 3–8, plus 9 fidelity probes under `potfoundry-web/src/fidelity/`).
This spec is the design handoff for implementation; the companion plan is
`docs/superpowers/plans/2026-06-13-feature-aligned-crest-mesher.md`.

---

## 1. Problem

The conforming exporter ships sharp feature crests (e.g. SuperformulaBlossom
cusps, n1=0.35) as **visible serration**: stretched sliver triangles where the
axis-aligned (u,t) quadtree grid crosses a diagonal/cusped crest. Refinement
cannot fix it (normals don't converge at a cusp). The user requires every
triangle well-shaped — a faithful mesh of the mathematical model.

## 2. What the measurements proved (the binding evidence)

All measured in 3D on the true surface (`SfbWallSampler`), never in (u,t)
(the reference-domination trap). Each claim has a committed probe + threshold:

1. **Connectivity alone cannot fix it** — on the axis-aligned grid even the BEST
   triangulation leaves 55.5% of crest cells <15° (Stage 3, `cellTriangulationCeiling`).
2. **Feature-aligned cells cure it** — aligning the lattice to the crest drops
   sub-15° to 0.1–0.9% (Stage 3b, `crestAlignedCeiling`).
3. **No cusp/birth floor** — per-cell-aspect-controlled aligned cells reach min
   18.4° (crests), 21.5° (valleys), births clean (Stage 5, `featureDensityLocalization`).
4. **The watertight-tileable dyadic version holds it** — dyadic 2:1 feature-
   aligned grid: worst 17.15° (regular) / 17.23° (forced 2:1 transition), 0%
   sub-15° across crest/valley/bulk/transition (Stage 6, `dyadicWarpFloor`).
5. **M2 perpendicular framing does NOT help** — it plunges into the cusp flank;
   crest min 12.0° (worse than M1's 18°). M1 is the architecture (Stage 7,
   `m2PerpendicularFloor`).
6. **The cap junction is warp-NEUTRAL** — the warp is linear at fixed t so the
   boundary ring stays uniform-u; cap quality identical with/without the warp
   (Stage 8, `capJunctionFloor`).

**Out of scope (user, 2026-06-13):** the periodic u-seam. SFB-class styles are
genuinely non-periodic in u (an ~11.4 mm radial discontinuity, `seamPeriodicityVerify`);
the sharp seam cliff is accepted and explored after the pipeline.

**Separate pre-existing defect (NOT this work):** the cap disc itself slivers
(~22% sub-15° on the default drain annulus) — `emitRadialCap` keeps nRing verts
at every radius + clamps to 64 bands. Independent of the warp; tracked separately.

## 3. Architecture — "M1 feature-phase warp + dyadic aspect refinement"

Two pieces, both built on existing, connectivity-invariant machinery.

### 3.1 Feature alignment (the warp)

A **t-dependent, periodic, monotone u-warp** `CreasePetalWarp` that pins mesh
columns onto the analytic crest AND valley loci at every height. It is the
t-dependent generalization of `CreaseUWarp` (CreaseUWarp.ts) — exactly as
`CreaseHelixWarp` (CreaseHelixWarp.ts) generalizes it with a t-shear — so it
inherits the watertight proof:

- At each fixed t, the map `φ_t : [0,1]→[0,1]` is a strictly-increasing circle
  homeomorphism with the seam fixed (`φ_t(0)=0, φ_t(1)=1`).
- Applied UNIFORMLY per vertex AFTER triangulation (the existing
  `applyUWarp`/`applyHelixWarp` sweep), so connectivity is byte-untouched → the
  watertight, oriented, T-junction-free mesh stays exactly that; only u moves.
- **Loci:** SFB crests at `u*_j(t) = (2j−1)/(2·m(t))`, valleys at `j/m(t)`,
  `m(t) = p[1] + (p[2]−p[1])·t^p[3]` (mirrors `sfMOf` in crestLateralDeviation.ts;
  the single source of truth is the closed-form ridge `sfClosedFormParamRidge`).
  These are equally spaced (spacing `1/m(t)`) — the "feature phase" `φ = u·m(t)`
  places every feature on a half-integer line independent of t.
- **Refuse-on-unsafe → identity** (the CreaseUWarp safety contract): any t where
  pinning would reorder/collide falls back to identity at that t (topology-safe).
- **Births** (m(t) crosses j−0.5 / j as m: 6→10): a feature's anchor simply does
  not exist below its birth t (solved by bisection on monotone m(t), exactly as
  `sfClosedFormParamRidge` locates births). The warp's anchor set grows with t;
  monotonicity + seam-fixity hold at every t by the same validation.

**Recommended construction route (A):** build the existing (u,t) quadtree, then
apply `CreasePetalWarp` post-triangulation (minimal reuse — mirrors how every
existing warp is applied at `ParametricExportComputer.ts` warp sweep). Route B
(quadtree directly in feature-phase (φ,t)) is the alternative if A cannot hold
the aspect floor; A is preferred for risk (no quadtree-core changes).

### 3.2 Per-cell aspect control (the refinement)

The cure has a HARD rule: cross-feature cell extent ≤ along-feature spacing
(widthScale ≤ 1; Stage 5 — widthScale 2 regresses to ~50% sub-15°). The column
density must track m(t) (more petals higher up). This is delivered by the
EXISTING 2:1-balanced directional u-refine in `PeriodicBalancedQuadtree`
(`:929-960`) driven by a feature-aware sizing field so that, in the warped frame,
every crest/valley flank cell satisfies cross ≤ along. Dyadic 2:1 steps + the
existing mid-edge transition templates hold the floor (Stage 6, transitions
measured clean).

### 3.3 What it reaches

Watertight by construction; **min ≈17°, 0% sub-15°, median 26–41° in 3D** across
crests, valleys, bulk, transitions, and births at production density; crests
land on columns; caps unaffected (warp linear at fixed t → uniform ring). Seam =
accepted cliff.

## 4. Watertight argument (must hold, no post-hoc repair)

Watertightness is carried entirely by (a) the per-vertex bijective warp
(connectivity untouched — CreaseUWarp.ts:19–24) and (b) the existing grid-line
registry + 2:1 balance for any aspect refinement (FeatureConformingTriangulator
regH/regV, PeriodicBalancedQuadtree balance). NO weld / T-junction-split /
center-fan-repair pass is added (the banned legacy class). The cap rings stay
index-shared because the warp is linear at fixed t (uniform-u rings preserved;
Stage 8).

## 5. Integration points (exact)

- New: `potfoundry-web/src/renderers/webgpu/parametric/conforming/CreasePetalWarp.ts`
  (mirror `CreaseUWarp.ts`: `buildPetalWarpAnchors(loci, grid)`, `applyPetalWarp(warp, u, t)`,
  refuse-on-unsafe; t-dependent via per-t anchors from `sfClosedFormParamRidge`).
- Modify: the warp application sweep (where `applyUWarp`/`applyHelixWarp` run —
  `ParametricExportComputer.ts`; grep `applyHelixWarp`) to apply `applyPetalWarp`
  for SFB-class styles, flag-gated.
- Modify: `ConformingWall.ts` / `WatertightAssembly.ts` to thread the feature-
  aware u-refine sizing so column density tracks m(t) (reuse directional u-refine).
- Flag: a new `DEFAULT_FEATURE_FLAGS` entry (e.g. `featurePetalWarp`, default
  false) resolved in `parametric/contracts.ts` — gate the whole path; legacy =
  flag false (reversible), exactly like the conformingMesher flag.
- Gates (acceptance, pre-registered): the 9 fidelity probes under
  `src/fidelity/` are the unit/measurement gates; a real-`assembleWatertight`
  integration probe is added in the plan's final stage.

## 6. Rejected alternatives (binding — do not re-litigate)

| Idea | Why rejected | Evidence |
|---|---|---|
| Better diagonals / connectivity only (Step C) | caps at 12.94° median, 55% sub-15° | Stage 3 |
| M2 perpendicular crest-frame | worse for cusps (12° vs 18°) | Stage 7 |
| Uniform (φ,t) lattice global warp | regresses at density (16.6% sub-20°) | Stage 4 + verify |
| Anisotropic metric Ruppert | no min-angle floor under anisotropy; not watertight-by-construction; replaces the stack | workflow proposal #3 |
| Advancing-front / cross-field quad | alien to codebase; births = singularities; worse worst-case | workflow proposals #4/#5 |
| Any post-hoc weld/T-junction/repair | banned (the legacy defect factory) | project history |
| Fixing the seam now | out of scope (accepted cliff) | user 2026-06-13 |

## 7. Honest residual risks

- The exact `CreasePetalWarp` formulation (t-dependent anchors + births) is the
  load-bearing new code; the warpDomainCeiling/dyadicWarpFloor gates define done.
- Route A (post-hoc warp) must deliver the aspect floor via the existing u-refine;
  if it can't, fall back to Route B (feature-phase quadtree). Decide at Stage 2's gate.
- Caps t=0/1 are warp-neutral but the cap-disc sliver is a separate pre-existing
  item (confirm vs real `assembleWatertight`; fix is its own work).
- Other non-periodic styles share the mechanism; each style's extractor/loci is
  bounded additional work (SFB is the pilot).
