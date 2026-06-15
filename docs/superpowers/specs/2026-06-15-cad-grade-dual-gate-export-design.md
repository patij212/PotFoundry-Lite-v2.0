# CAD-Grade Conforming Export — Dual-Gate Design (2026-06-15)

Branch `refactor/core-migration`. This spec defines the work to make the parametric
mesh export **CAD-interchange grade for every triangle of every style** — no facet
that chords across a curved feature, no slivers, no serrations, no stretched
triangles — enforced by two automated gates rather than by per-style hand-tuning.

It supersedes the "accept & document" framing of the prior chord-program handoffs
(`2026-06-15-cad-grade-export-findings-and-handoff.md`,
`2026-06-15-perpendicular-3d-rebaseline-findings.md`): the steep lattice/weave/braid
styles are now **in scope to fix**, not to relabel.

---

## 1. Goal & acceptance bar (definition of done)

For **all 20 styles**, on the real exported mesh (STL **and** 3MF), with production
feature flags **on**:

- **Chord gate** — every facet's perpendicular-3D distance to the true analytic
  surface ≤ `τ(p)`, a **curvature-relative** sag bound (a chord-height tolerance
  whose allowance scales with local feature size, clamped to an absolute floor and
  ceiling so it can neither collapse to zero nor run away). Constants pinned in
  Stage 1 calibration. Measured by `perpendicular3DDeviation`.
- **Quality gate** — every triangle min-angle ≥ `θ_min` and aspect ratio ≤ `A_max`
  (pinned in Stage 1). This is the instrument that catches **slivers, serrations,
  aliasing-as-needles, and stretched facets**.
- **Watertight** — boundary / non-manifold / orientation edges = 0. Already met;
  must be **preserved**, not regained (see §6 — exports hard-fail on topology break).
- **featDrop = 0** — no designed feature lost to decimation.
- **Gated in CI** — both gates run per style on a real export so the bar cannot
  silently regress.

Non-negotiable: production stays **byte-identical when the work is flag-off** until
all 20 pass both gates, then the flag flips.

---

## 2. Current state (Stage 0 — verified in code, not memory)

The conforming mesher is **already the production default**; this work reaches users.

| Fact | Evidence |
|---|---|
| Conforming mesher is the default export path | `parametric/contracts.ts:435` `conformingMesher: true` in `DEFAULT_FEATURE_FLAGS`; comment `contracts.ts:420-422` ("production path since the 2026-06-11 dominance checkpoint") |
| A normal export runs it and skips legacy | `ParametricExportComputer.ts:2306` `if (flags.conformingMesher)`; conforming path `2306-2987`, early return `2986`; legacy battery `2989+` skipped |
| Legacy reachable only by opt-out / dev hatch | dialog override `conformingMesher:false` via `ExportPanel.tsx:240-285`; dev global `__pfConforming` `contracts.ts:451-453`. No automatic fallback if conforming throws (one try/catch). |
| No surface-fidelity gate guards exports | `summarizeConformingValidation()` `ParametricExportComputer.ts:429-470` checks topology/orientation/slivers only, measurement-only; export throws on topology fail (`useParametricExport.ts:405-406`) but nothing checks chord error or stretched facets |
| Refiner is driven by a sag target, not the perp oracle | only sizing lever is the quality profile's `epsPosMm` (pre-triangulation surface-error target); `surfaceFidelityExact` defaults OFF (`contracts.ts:436`) |

**The honest residuals to close** (from today's perpendicular-3D re-baseline):

- **5 genuine 3D chord gaps** — flat facets chord across curved walls: GyroidManifold
  (perp p99 0.49), BasketWeave (0.48), CelticKnot (0.23), GothicArches upper tier
  (0.21), CelticTriquetra (0.16). Density dev-levers (`maxSag`, `nRing`) proven NOT
  to move these (Gyroid wallTris 683k→683k) — closing them needs a real mesher change.
- **Triangle-quality residuals** — serration slivers on 9/20 styles at default (from
  the uBias GATE-B re-baseline), SpiralRidges helix-shear slivers (~479), and
  high-relief residuals on FourierBloom / Crystalline.
- **Voronoi** — a separate f32/f64 hash-precision floor (~0.14mm), possibly
  irreducible; tracked but not allowed to block the rest.

---

## 3. Architectural principle (the root-cause fix)

**The refiner and the gate must share one perpendicular-3D surface oracle.**

Today the mesher subdivides on a sag target (`epsPosMm`) sampled at cell corners; the
honest error lives in the cell **interior** where a lattice/weave/braid wall passes
between the corners. That mismatch — the refiner measuring something weaker and
coarser than the gate — is the aliasing that ships stretched facets: the refiner
never "sees" the wall, so it never subdivides, so the facet stretches across it.

Align them — drive subdivision by the **same** `perpendicular3DDeviation` oracle the
gate enforces, evaluated in the cell interior — and **a facet over tolerance becomes
structurally impossible to produce**. The defect class is closed by construction, not
patched per style. The oracle already exists (`projectPointToRadialSurface` in
`src/fidelity/analyticSurfaceGate.ts`, built and adversarially verified for the perp
metric).

This principle is also the antidote to the multi-session whack-a-mole: regressions
came from fixes that satisfied one criterion while a different criterion (the gate)
still failed. One shared oracle removes that gap.

---

## 4. The two instruments

- **Chord** — `perpendicular3DDeviation` (built, adversarially verified, currently a
  diagnostic). Promote it to (a) the refiner's subdivision criterion and (b) the
  export/CI gate.
- **Quality** — generalize the existing `crestBandTriangleQuality` /
  `diagnoseCrestQuality` from a crest-band probe to a whole-mesh min-angle / aspect
  gate. This is the instrument for "serrations / aliasing / uneven."

Both run flag-gated and diagnostic-only first; they only ever **reject or refine**,
never silently repair.

---

## 5. Staged plan (measurement-first; every stage gated by re-measurement + adversarial review)

### Stage 0 — Verify what ships ✅ DONE
Resolved in §2: conforming mesher ships by default; no fidelity gate; exports
hard-fail on topology break. The cutover is complete, so the production-integration
work is **wiring the gates in**, not migrating the path.

### Stage 1 — Diagnostic that forks A vs C, and calibration
1. **Why does the refiner cap density on the 5 lattice styles?** Instrument the
   subdivision decision: is the criterion corner-only/aliased, is a max-level or
   budget cap firing, or is it a structural conformity limit? Feed the perp-3D oracle
   into the decision as a probe and observe whether cells *would* subdivide.
2. **Classify all 20 styles** into `{already-passes, fixable-by-refiner (A),
   needs-remesh (C), irreducible-C0-riser}`. This is the gate-input document.
3. **Calibrate the constants**: `τ(p)` (the curvature-relative sag function +
   absolute floor/ceiling), `θ_min`, `A_max` — pinned against the measured baseline,
   not guessed. Output: a written calibration table.

Decision point: Stage-1 data decides which styles go through Stage 3 (A) vs Stage 4 (C).

### Stage 2 — Quality workstream (parallel, largely independent)
Turn the quality gate on across all 20 and drive the triangle-quality residuals to
zero: the 9/20 serration slivers (re-examine the uBias GATE-B re-baseline that
introduced them), SpiralRidges helix-shear (~479), FourierBloom / Crystalline. The
crest-fidelity handoff already names the lever (activate the dead earClip/efg
max-min-angle diagonal path). May share the Stage-3 refiner fix; tracked separately
so it can land independently.

### Stage 3 — Refiner fix (Option A)
Subdivide cells by the perp-3D oracle until `τ(p)`, **preserving by-construction
conformity/watertightness** (hard requirement — see §6). Re-baseline all 20; confirm
the 5 lattice styles drop under tolerance **with even triangles** (the quality gate
must pass too — isotropic refinement is chosen precisely because it yields
well-shaped triangles). Per-style **budget telemetry**; any cap hit is logged
honestly, never silent.

### Stage 4 — Escalate (Option C) — only where Stage 3 cannot hit both gates within budget
Per-style Delaunay-refinement surface remesh driven by the same oracle, giving a
provable simultaneous min-angle + chord bound. Scoped to the minimal set the Stage-3
data demands — not a blanket re-architecture. Reuses the projection oracle as the
surface-query primitive.

### Stage 5 — Production integration & CI
Wire both gates into a per-style CI check on a real export. Flip the production flag
once 20/20 pass; prove STL/3MF parity. Keep byte-identical when off until then.

---

## 6. Risks & guardrails

- **Watertightness is load-bearing.** Exports hard-fail on a topology break with no
  fallback (`useParametricExport.ts:405-406`). The refiner change MUST keep the
  conforming mesher's by-construction conformity, or it breaks live exports. Every
  Stage-3/4 change re-runs `summarizeConformingValidation` (bnd/nonMan/orient/sliver
  = 0) before it's accepted.
- **Triangle-count explosion** on dense lattices under a tight bound. Mitigations:
  the curvature-relative `τ(p)` spends triangles only where features are sharp;
  per-style budget telemetry; honest logging of any cap (never a silent truncation
  that reads as "covered").
- **Whack-a-mole regression.** Mitigated by the gate=refiner oracle unification (§3)
  and adversarial review at each stage.
- **Voronoi hash-precision floor** is a separate, possibly irreducible precision item
  (may need a `Math.fround` hash simulation). Tracked; not allowed to block the
  others; if irreducible, documented as the one honest exception with evidence.

---

## 7. Non-goals (YAGNI)

- Not re-architecting the whole mesher up front (Option C is a per-style escalation).
- Not feature-aligned anisotropic insertion (Option B) — it is in tension with the
  aspect-ratio gate (long/thin cells along features) and has a dead-end history; only
  revisited if a specific style needs it *and* can keep its min-angle.
- Not touching the legacy path (it no longer ships to normal users).
- Not changing production output until the flag flip in Stage 5.

---

## 8. Open items to pin during Stage 1 (these are measurement outputs, not guesses)

- The exact `τ(p)` curvature-relative function and its absolute floor/ceiling.
- `θ_min` and `A_max` for the quality gate.
- The per-style A-vs-C classification.
- Whether the quality workstream (Stage 2) and refiner fix (Stage 3) share one code
  change or stay separate.

---

## 9. Success criteria recap

20/20 styles: perp-3D chord ≤ `τ(p)` every facet · min-angle ≥ `θ_min`, no slivers ·
watertight 0 · featDrop 0 · STL+3MF parity · CI dual-gate green · production flag
flipped · each result adversarially reviewed.
