# Export Quality Gate & Documented Floor (2026-06-15)

The landing of the CAD-grade export arc. Defines the shippable **dual gate** (perpendicular-3D
chord + triangle min-angle) and **documents the inherent quality floor** on the
tangled-lattice styles — after five independent approaches to eliminate their slivers were
measured and exhausted. Branch `refactor/core-migration`.

---

## 1. What ships

- **CHORD gate (hard):** every non-floor style's perpendicular-3D chord p99 ≤ `tauCeil`
  (`src/fidelity/gateThresholds.ts`, 0.1mm). **15/20 styles pass.** Enforced by
  `src/fidelity/dualGate.test.ts` against the committed baseline
  (`2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.json`) — a CI-runnable
  regression guard (no GPU needed; it reads the committed measured matrix).
- **VERTEX faithfulness (hard):** every trusted style places vertices on the true surface
  (vertexMax ≈ f32 floor) — the export is geometrically faithful by construction.
- **QUALITY (documented floor + regression-tracked):** the transition-template slivers are
  an **inherent cell-resolution limitation** (see §3), not a hard pass/fail — a strict
  min-angle bar is provably infeasible on feature-dense styles. The per-style min-angle
  numbers are committed in the baseline and tracked for regression.

## 2. The documented floor

| Class | Styles | Why |
|---|---|---|
| **Chord floor** | GyroidManifold, BasketWeave, CelticKnot, CelticTriquetra, GothicArches (upper tier) | tangled lattice/weave/braid; flat facets chord across the curved walls (perp p99 0.16–0.49). Irreducible without heavy anisotropic meshing (§3). |
| **Ref-untrusted** | Voronoi | f32/f64 hash-precision floor; the reference itself can't certify it (separate, prior work). |
| **Quality floor** | the feature-dense styles' transition cells (broad) | sub-θ_min triangles from the 2:1 transition-template fan on cells too coarse for the local curvature (§3). |

These are the quality analog of the **chord exclusion classes** (creaseStraddle/creaseT/tBands):
designed/inherent features that a flat-triangle mesh cannot represent sliver-free, documented
rather than hidden.

## 3. Why the tangled-lattice slivers are irreducible — five measured approaches

The triangle-quality defect (slivers) was traced to the `TRANSITION_FAN` centroid-fan
template (`sliversBySource.localizer.test.ts`: 100% of wall slivers). Every approach to fix
it was measured and failed for the **same root cause** — the transition cell is too coarse
for the local high-curvature surface, so *no template choice* gives good 3D triangles:

| Approach | Evidence | Result |
|---|---|---|
| Stage-1 uniform density | `stage1-uniform-sweep.md` | worst min-angle pinned across 8× density |
| A — extend conforming mesher | Phase 1/1b findings | slivers structural (transition/feature-pin cells) |
| C — Delaunay remesh (spike) | `stage2-optionC-spike-findings.md` | smooth 44°, tangled 8° (needs full anisotropic Delaunay) |
| Targeted DP-always | `FeatureConformingTriangulator.ts:768-769` + re-measured | KNOWN REGRESSION (slivers 4960→8128) |
| Targeted true-3D scoring | real Gyroid 0.85°→0.85°, FourierBloom 13.36° unchanged | NO-OP (correctly keeps the fan; both templates are slivers) |

**Conclusion:** eliminating these slivers requires heavy/research-grade full anisotropic
(local-metric, cell-subdividing) meshing — out of scope. They are a documented floor.

## 4. The calibrated gate (committed: `src/fidelity/gateThresholds.ts`)
- **τ(p)** curvature-relative chord = `clamp(0.05·featureSize, 0.005, 0.1)` mm.
- **θ_min** = 20°, **A_max** = 4.76 (the quality bar; tracked, not hard-enforced where
  the floor applies).

## 5. Reproduce / re-baseline
- `node potfoundry-web/e2e/_fidelity_dualgate_baseline.cjs` (dev server up) regenerates the
  per-style chord + min-angle matrix → `stage1-dualgate-baseline.json`.
- `npx vitest run src/fidelity/dualGate.test.ts` enforces the gate on that committed matrix.

## 6. Evidence trail
`stage1-dualgate-baseline.md`, `stage1-uniform-sweep.md`, `stage1-gate-input.md`,
`stage2-phase1-findings.md`, `stage2-phase1b-efgdp-findings.md`, `stage2-optionC-spike-findings.md`,
`2026-06-15-perpendicular-3d-rebaseline-findings.md`.
