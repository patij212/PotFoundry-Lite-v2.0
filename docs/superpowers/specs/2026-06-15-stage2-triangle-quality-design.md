# Stage 2 — Triangle-Quality (Sliver Elimination) Design (2026-06-15)

Branch `refactor/core-migration`. Implements **Stage 2** of the CAD-grade dual-gate
export plan (`2026-06-15-cad-grade-dual-gate-export-design.md`), informed by the
Stage-1 measured findings (`2026-06-10-export-endgame-evidence/stage1-gate-input.md`).

This is the **quality** workstream — eliminating the triangulation-pattern slivers that
Stage 1 proved are the *dominant, wider, density-invariant* defect (~16/20 styles fail
min-angle ≥ 20°, including styles whose chord is already CAD-grade). It is independent of
the chord workstream (Stage 3) and runs first because it blocks the most styles.

---

## 1. Goal & acceptance bar

For every style, on the real conforming export, with production flags on:
- **Quality:** every outer-wall triangle min interior angle ≥ **θ_min = 20°** and aspect
  ≤ **A_max = 4.76** (`src/fidelity/gateThresholds.ts`), **EXCEPT** at documented
  genuine sharp-input-feature loci (see §5). I.e. **eliminate every *fixable*
  (triangulation-pattern) sliver**; allow sub-θ_min triangles only where the input
  surface itself meets at < θ_min (geometrically unavoidable).
- **Watertight + vertices-on-surface preserved** — bnd/nonMan/orient/sliver-topology
  and featDrop unchanged (exports hard-fail on a topology break; no regression allowed).
- **Chord not regressed** — the perpendicular-3D chord per style must not get worse.
- **Production byte-identical when flag-off** until the fix is proven, then enabled.

---

## 2. Why (the Stage-1 finding this acts on)

The slivers are **density-invariant** — forcing 8× uniform density left the worst
min-angle pinned (Gyroid 0.85°, BasketWeave 2.64°). So they are NOT under-tessellation;
they are produced by the mesher's *triangulation choices*. The catastrophic-sliver set
(worst < ~3°) correlates with feature density / anisotropy.

Located candidate mechanisms (code):
- **Cell-diagonal choice.** The max-min-angle (Klincsek DP) diagonal in
  `QuadtreeTriangulator.ts` (gate at ~:125, emit ~:196) runs **only when `efg` is
  populated** (`PeriodicBalancedQuadtree.leaves()` computes `efg` only if `efgSampler`
  is injected). When `efg` is absent the cell falls back to a plain fan → thin triangles.
- **uBias GATE-B anisotropy** (`computeUBias`, `WatertightAssembly.ts:114-162`): widens
  cells in u (bias `B`), so a square-ish cell becomes a wide rectangle whose diagonal
  split yields thin triangles. The prior re-baseline flagged GATE-B as *introducing*
  slivers on 9/20.
- **2:1 transition templates** at refinement-level boundaries; **feature-pinned / crease
  columns** (`minUniformLevel`); **`directionalRefine`** u-splits (aspect-trigger 20).

Different styles' slivers may trace to different mechanisms — hence diagnose first.

---

## 3. Principle

Fix the mesher's triangulation choices so well-shaped triangles are produced **by
construction**, rather than bolting on a post-pass that risks the conforming mesher's
by-construction watertightness and its exact-vertex-on-surface guarantee. Exclude only
the genuinely input-forced slivers, measured.

---

## 4. Approaches

- **A — Fix the triangulation choices (RECOMMENDED).** Activate the max-min-angle
  diagonal selection in the default path (inject the `efgSampler` so `efg` is populated
  and the Klincsek DP runs) and/or tame the GATE-B anisotropy (the lever the prior
  re-baseline implicated). Lowest-risk; preserves watertightness + vertices-on-surface;
  matches the existing lead. The diagnostic (§6.1) confirms which dominates per style.
- **B — Post-triangulation constrained edge-flip pass.** Mechanism-agnostic but fights
  the deliberate no-post-hoc-flips design; risks re-opening seams / moving vertices off
  the surface. Hold unless A can't reach a style.
- **C — Per-cell quality-guaranteed triangulator** (revive the disabled
  `refineCellInterior` / a proper per-cell constrained Delaunay). Strongest guarantee,
  heaviest; the disabled version regressed on curved surfaces (affine off-center
  back-map). Escalation only.

---

## 5. The fixable-vs-input-forced distinction (the crux)

A sliver is **input-forced (exclude + document)** iff its small angle sits AT a known
sharp-feature locus (a `creaseU`/`creaseT`/facet-edge already modelled by the chord
gate) AND the true surface tangents there genuinely meet at < θ_min (the corner is real,
not a triangulation artifact). Otherwise it is **fixable (must be eliminated)** — a small
angle in a smooth region is purely a cell-shape/diagonal artifact.

This yields a **quality analog of `creaseStraddle`**: a sharp-feature angle-exclusion
field the quality gate respects, populated only from genuine sub-θ_min input corners,
adversarially reviewed so it cannot hide fixable slivers (the chord gate's per-vertex
leak lesson — 178 straddlers — applies here too).

---

## 6. Staged plan (measurement-first; each step gated by re-measurement + adversarial review)

### 6.1 Phase 1 — Sliver-origin diagnostic (the first implementation plan)
Build a per-triangle attribution instrument: for each sub-θ_min triangle, record its
(u,t) location, which mechanism produced it (diagonal-fan vs DP, GATE-B cell aspect,
transition template, feature-pin column, directional split), and whether it sits at a
genuine sharp-input locus. Output per style: a mechanism histogram + the
fixable-vs-input-forced split. **This forks A-vs-B/C and identifies the exclusion loci.**
Run on the catastrophic-sliver styles first (worst < 3°: SFB, CelticKnot, Voronoi,
Gyroid, HexHive, ArtDeco, DragonScales, BasketWeave), plus a chord-clean quality-fail
control (FourierBloom). No production change — instrument is flag-gated/diagnostic.

### 6.2 Phase 2 — Fix the dominant mechanism(s)
Apply Approach A to the mechanism(s) the diagnostic implicates (expected: diagonal
selection + GATE-B anisotropy), one measured change at a time. After each: re-run the
quality gate (worst min-angle, %<θ_min) AND `summarizeConformingValidation`
(bnd/nonMan/orient/sliver-topology=0) AND the chord gate (no regression) AND featDrop=0.
Adversarially review each fix. Escalate a style to B/C only if A provably can't reach it.

### 6.3 Phase 3 — Sharp-feature exclusion + gate + re-baseline
Build the §5 angle-exclusion field; wire the quality gate (worst min-angle ≥ θ_min
outside the documented loci). Re-baseline the ~16 failing styles; produce the
quality-clean matrix. Keep production flag-gated until clean, then enable.

---

## 7. Risks & guardrails
- **Watertightness + vertices-on-surface are load-bearing.** Every fix re-runs the
  topology/sliver validation and the vertex channel; exports hard-fail on a topology
  break, so a quality fix that breaks conformity is rejected.
- **Don't trade chord for quality.** The chord gate runs alongside; a triangulation
  change that worsens perp-3D chord is rejected (the two gates are jointly enforced).
- **Anisotropy tension.** GATE-B exists for a reason (u-long relief styles); taming it
  must not regress those styles' chord/watertightness — measure on the styles GATE-B
  serves, not just the slivered ones.
- **Exclusion honesty.** The sharp-feature exclusion must not hide fixable slivers —
  adversarial-review the loci (per-vertex leaks like the chord gate's 178 straddlers).

---

## 8. Non-goals
- Not the chord/density work (Stage 3) — separate, runs after.
- Not a blanket re-architecture (C is per-style escalation only).
- Not touching styles that already pass both gates (regression-guard only).
- No production output change until the Phase-3 flag enable.

---

## 9. Open items to pin during Phase 1 (measurement outputs, not guesses)
- The per-style dominant sliver mechanism(s) → the A-vs-B/C choice per style.
- Whether `efgSampler` injection alone (activating the DP) suffices, or GATE-B also
  needs taming.
- The genuine sharp-input-feature loci per style (the exclusion field inputs).
- Whether any style needs Approach C.
