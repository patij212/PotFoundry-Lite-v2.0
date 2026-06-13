# Surface-Fidelity Export — Session Handoff (2026-06-13)

A long measurement-and-implementation session. Everything below is **flag-gated
(`surfaceFidelityExact`, default OFF) — zero default-behavior change shipped.**

## What shipped (flag-gated, e2e-validated on real GPU)

| Style | Fix | Status |
|---|---|---|
| **SuperformulaBlossom** | born petals (un-defer) + feature-proximity density | e2e: features 12→19, ~2.1× tris, watertight. Wall p99 0.037 below tol. |
| **ArtDeco** | paired-ring t-step riser (C0 jump) + density | e2e: features 0→16, watertight (bnd=0). Wall (riser bands excl) 0.158mm / p99 0.008. |

Both validated end-to-end via `e2e/_fidelity_flag_validate.cjs` (headed Chromium,
real WebGPU adapter confirmed available here).

## The validated model (use this to classify any style)

- **C0 radius jump** (discontinuity, e.g. ArtDeco step) → **paired-ring riser**:
  two horizontal lines at `t_step ± ε` (ε≈1e-3); the band between IS the vertical
  face (excluded from the `r(u,t)` fidelity metric, like the seam). ε too small
  (3e-4) welds/leaks. A single edge REGRESSES (can't represent a vertical face).
- **C1 crease** (tangent discontinuity, e.g. SFB crests) → **single edge** (insert
  the locus).
- **Smooth** (Gaussian/sin/poly, e.g. BambooSegments nodes, the 5 smooth styles) →
  **density** (no edges).
- **Density lever is only safe with COMPLETE extraction** — partial extraction +
  density REGRESSES (proved on ArtDeco t-step-only).
- Vertex positions are ALREADY exact GPU eval (no "exact-eval" work needed).

## The recipe in code (production, flag-gated)

- Flag: `surfaceFidelityExact` in `PipelineFeatureFlags` (`parametric/contracts.ts`,
  default false) + the `__pfSurfaceFidelityExact` e2e hatch in `resolveFeatureFlags`.
- `ParametricExportComputer.compute` conforming branch (`:~2442, :~2612, :~2764`):
  passes `{ surfaceFidelityExact: flags.surfaceFidelityExact }` to
  `extractAnalyticFeatures`, and sets `featureLevel: flag ? 11 : 7` (the density lever).
- `FeatureLineGraph.extractSuperformulaBlossom` (born petals, `SF_CREST_BORN_MIN_SPAN`)
  and `extractArtDeco` (paired-ring risers, `AD_RISER_HALF_T=1e-3`), gated by
  `ExtractOpts.surfaceFidelityExact` (?? per-style `__pfSfbBornCrests`/`__pfArtDecoSteps`
  dev levers for probes).
- `fidelity/fidelityGate.ts` — the shared gate: `deviationVsTrueSurface(mesh, surface,
  opts)` (config-aware truth, seam + `tBands` riser exclusion), `countFoldedTriangles`,
  `straddleStats`, `minVertexSpacing3D`.

## Open items (prioritized, with entry points)

1. **B5 — absolute-fidelity gate — ✅ DONE (commit 4feb9af, GPU-certified).**
   `windowHook.diagnoseSurfaceFidelity` + `analyticSurfaceGate.radialAnalyticDeviation`
   map the 3D exported mesh back (`theta=atan2(y,x)`, z direct) → `|hypot(x,y) −
   r_analytic|` vs the analytic surface (seam + riser excluded via the pre-existing
   `LAST_CONFORMING_ASSEMBLY_UT` stash). CPU-proven (`verify_b5_analyticMetric`, 5/5)
   and real-GPU-certified (`e2e/_fidelity_surface_validate.cjs`): SFB vertices exact
   (~f32 floor), chordMax 1.93→0.87mm (flag improves); ArtDeco wall 0.1175mm. Spec:
   `2026-06-13-b5-absolute-fidelity-gate.md`.
   **NEW residual it surfaced:** SFB absolute chord **0.87mm ON is still >tol** (born
   petals+density don't fully close at the 1M target → density/budget, item 2). And
   the **STL-bytes round-trip** (re-weld 0.001mm + f32 quantize) is a separate
   follow-up gate (the B5 number is in-memory GPU-f32).
2. **Budget honesty (Task 9).** `featureLevel 11` ~2× tris; cap-mode coarsening
   (`MAX_BUDGET_SCALE=4`, ~0.2mm) + decimation degrade silently below the 6M `high`
   budget (NOT 20M — spec §1 was corrected). ArtDeco e2e showed tris cap-limited
   (density absorbed). Entry: `ConformingWall.searchBudgetScale`,
   `ParametricExportComputer :~2596/:2812/:2817`, `QualityProfiles.ts`.
3. **BambooSegments rim-node density** (smooth, NOT a riser): the worst (2.256mm) is
   the t=1 rim node bulge — `extractBambooSegments` stops at k=nodeCount-1 and the
   density lever only refines inserted rings. Needs boundary-aware sizing / exact
   curvature at t=1. Probe: `verify_bambooSegments.test.ts`.
4. **ArtDeco chevron** (`R5`, 0.34mm |sin| diagonal C0 corners) — density or a
   diagonal general-curve extractor; fan negligible (0.006mm). Spec:
   `2026-06-13-artdeco-tstep-riser.md`.
5. **Other partials** (cross-style ranking, `verify_crossStyleEdgeGap`): DragonScales
   1.64, GeometricStar 1.60, CelticTriquetra 1.53, Gothic 1.43, Gyroid 1.35, Voronoi
   1.02 — classify each (C0/C1/smooth) then apply the matching mechanism. DragonScales
   likely C1 (existing horizontal-line extractor) = a quick win.
6. **CelticKnot** flagged config-suspect by the consistency guard (1.80mm) — needs a
   packed-vs-CPU truth-parity fix before its number is trusted.
7. **Flag-flip / UI** — decide when to default `surfaceFidelityExact` on (re-baseline)
   or wire it to a quality-profile toggle.
8. **Smooth high-freq** (FourierBloom etc.) confirmed clean at production density
   (≤0.08mm) — no action.

## Key probes (CPU, `npx vitest run src/fidelity/<name>`)

- `verify_rebaseline_realpath` — the corrected baseline (positions exact; straddle + sizing).
- `verify_edgeVsFlank_adaptive` — edge vs sizing split on the real adaptive mesh.
- `verify_crossStyleEdgeGap` — per-style edge-gap ranking (config-aware, consistency guard).
- `verify_task3_curvatureFloor` — proves analytic sizing is a no-op (Task 3 cut).
- `verify_featureRefineLevel` — the density lever (p99 0.125→0.037).
- `verify_sfbBornPetals`, `verify_artDecoFidelity`, `verify_artDecoDecompose`,
  `verify_artDecoRiser`, `verify_bambooSegments` — the per-style work.
- `fidelityGate.test` — the shared gate.
- e2e: `e2e/_fidelity_flag_validate.cjs` (`PF_STYLE=<style> node ...`, dev server up).

## Docs

- Spec (Rev 3, edges-only): `docs/superpowers/specs/2026-06-13-surface-fidelity-export-design.md`
- Plan (Rev 3): `docs/superpowers/plans/2026-06-13-surface-fidelity-export.md`
- Red-team: `docs/superpowers/specs/2026-06-13-surface-fidelity-redteam.md`
- ArtDeco riser: `docs/superpowers/specs/2026-06-13-artdeco-tstep-riser.md`
- Memory: `project-export-endgame-design` (full running log).

## The 4 audit-first corrections this session (measurement beat the diagnosis)

1. Exact per-vertex eval — **no-op** (production positions already exact).
2. Analytic-curvature sizing — **no-op** (flank already at tol; 4-triangle residual).
3. ArtDeco — dominant is the **C0 t-step (riser)**, NOT fan/chevron (those are 0.17mm).
4. BambooSegments — **smooth (density)**, NOT a C0-step; residual is a rim-node bulge.
