# Export Fidelity Arc — Synthesis, Experiment Ledger & Roadmap (2026-06-15)

**Read this first** before continuing export-fidelity / mesh-quality work. It consolidates the
whole 2026-06-15 arc: every experiment + result, what shipped, the reusable tooling, and a
prioritized roadmap. Branch `refactor/core-migration`. All production code stayed
**byte-identical** throughout (every change was flag-gated/diagnostic or reverted).

---

## 0. TL;DR — the state of the export

- **The export is geometrically faithful.** Every style places its vertices on the true analytic
  surface (vertexMax ≈ f32 floor). CI-enforced (`dualGate.test.ts`).
- **Chord: 15/20 styles CAD-grade** (perpendicular-3D p99 ≤ 0.1mm). Enforced by the committed
  dual-gate.
- **5 tangled-lattice styles are a PROVEN-irreducible floor** (Gyroid, BasketWeave, CelticKnot,
  CelticTriquetra, Gothic-upper): their flat facets chord across curved walls, and their
  transition-template slivers are a cell-resolution limit. **Five independent fix approaches were
  measured and exhausted.** Eliminating them needs heavy anisotropic meshing (roadmap §4).
- **Voronoi** is ref-untrusted (f32/f64 hash floor) — separate, prior work.
- **Shipped:** the CI dual-gate + the documented floor (`2026-06-15-export-quality-gate-and-floor.md`).

---

## 1. The experiment ledger (everything run this arc)

| # | Experiment | What it tested | Result | Doc |
|---|---|---|---|---|
| 1 | **Dual-gate baseline** (20 styles, perp-3D chord + min-angle, denseN=6) | the honest per-style matrix | 15/20 chord-CAD; quality fails ~16/20 (slivers); vtx≈f32 floor 19/20 | `stage1-dualgate-baseline.{md,json}` |
| 2 | **Uniform-density A-vs-C sweep** (`__pfConformingUniformLevel`) | does density close the chord gap? | chord density-RESPONSIVE (Gyroid p99 0.455→0.249; BasketWeave 0.433→0.106); **quality worst PINNED** (0.85°/2.64° across 8× density) | `stage1-uniform-sweep.md` |
| 3 | **Gate-input classification + calibration** | τ(p), θ_min, A_max; per-style A/C class | calibrated gate; 2 independent workstreams (chord + quality) | `stage1-gate-input.md`, `gateThresholds.ts` |
| 4 | **uBias discriminator** (`__pfConformingUBias=0`) | is GATE-B anisotropy the sliver cause? | **REFUTED** — uBias=0 EXPLODES %<20° (4-17%→50-92%) on all 9 styles; GATE-B is the mitigation | `stage2-phase1-ubias-sweep.{md,json}`, `stage2-phase1-findings.md` |
| 5 | **efg/DP correction** (`__pfConformingEfg`) | is the max-min-angle DP dead? | **NO — already ON** by default; guard-suppressed on tangled cells; toggling barely moves Gyroid (7.1↔7.2%) | `stage2-phase1b-efgdp-findings.md` |
| 6 | **Option-C de-risk spike** (metric Delaunay refinement) | can a Delaunay remesh CAD-grade the tangled lattice? | smooth 44.67° ✓; **tangled 4–8° ✗** (global-scale + Lawson flips insufficient → needs full anisotropic Delaunay) | `stage2-optionC-spike-findings.md` |
| 7 | **Sliver-source localizer** (per-triangle `TRI_SOURCE`) | which template makes the slivers? | **100% TRANSITION_FAN** (centroid fan); PLAIN_QUAD/EAR_CLIP = 0 | `sliversBySource.localizer.test.ts` |
| 8 | **Targeted fix: DP-always** | force DP over the fan | **REGRESSION** (slivers 4960→8128; code-documented dead-end) | `stage2-phase2-targeted-fix-findings.md` |
| 9 | **Targeted fix: true-3D scoring** | score fan-vs-DP by real 3D angles | **NO-OP** (Gyroid 0.85° / FourierBloom 13.36° unchanged) — correctly keeps the fan; cell-resolution wall | `stage2-phase2-targeted-fix-findings.md` |
| 10 | **Targeted fix: metric-aware refinement** (`__pfConformingMetricRefine`) | subdivide metric-non-uniform cells | **WORSE** (slivers 4960→25616, 5×) — refinement *creates* transitions, transitions *create* slivers | `stage2-phase2-targeted-fix-findings.md` |

**The unifying conclusion (deepened by experiment 10):** the quadtree's **2:1-balanced transition
templates** are the structural source of the slivers, and **refinement *creates* transitions** — so
chord (wants more refinement) and quality (wants fewer transitions) **conflict through the mesher's
own mechanism.** No refinement strategy (uniform, targeted, metric-aware) and no template choice can
win. The only escape is a **transition-free** mesher — a Delaunay refinement where every triangle is
a proper Delaunay triangle (no 2:1 templates) — which, per the spike (exp. 6), needs the **heavy
anisotropic** version for tangled lattices.

---

## 2. What ships (committed, production byte-identical)

- `src/fidelity/gateThresholds.ts` — calibrated τ(p) curvature-relative chord, θ_min=20°, A_max=4.76.
- `src/fidelity/dualGate.test.ts` — **CI-runnable dual-gate** over the committed baseline (no GPU):
  chord ≤ τ for the 15 tractable styles, the 5 floor styles pinned, vertex faithfulness verified.
- `2026-06-15-export-quality-gate-and-floor.md` — the gate definition + the documented floor.

## 3. Reusable tooling (all committed)

- **Diagnostic levers** (window globals, `?fidelity=1`, default off → byte-identical):
  `__pfConformingUniformLevel` (force uniform density), plus the pre-existing `__pfConformingMaxSag`,
  `__pfConformingNRing`, `__pfConformingUBias`, `__pfConformingEfg`, `__pfSurfaceFidelityExact`,
  `__pfReferenceDenseRes`.
- **Probes** (`potfoundry-web/e2e/`): `_fidelity_dualgate_baseline.cjs` (the authoritative matrix),
  `_fidelity_uniform_sweep.cjs` (A-vs-C), `_fidelity_quality_ubias_sweep.cjs`,
  `_fidelity_quality_efgdp_sweep.cjs`, `_fidelity_perp3d_baseline.cjs`, `_fidelity_maxsag_audit.cjs`,
  `_fidelity_nring_audit.cjs`, `_fidelity_t_localize.cjs`.
- **Instruments:** `perpendicular3DDeviation` + `diagnoseSurfaceFidelity({metric:'perpendicular'})`
  (the honest 3D chord); `crestBandTriangleQuality` + `diagnoseCrestQuality` (reference-free
  min-angle, band-vs-bulk); the per-triangle `TRI_SOURCE` channel on `QuadtreeMesh.triangleSource`
  (attribute slivers to a template — no instrumentation needed).
- **Spike harness:** `src/fidelity/spike/metricDelaunayRefine.ts` (throwaway metric Delaunay
  refinement + Lawson flips — a starting point for the anisotropic mesher).

## 4. Roadmap — future pipeline work (prioritized)

1. **[TESTED — DEAD END] ~~Perp-3D-oracle-driven targeted refinement~~.** Built + measured
   (experiment 10): subdividing high-sliver cells makes it **5× worse** — refinement *creates* the
   transitions that *create* the slivers. Do not re-try refinement-based quality fixes. This leaves
   #2 as the only path for the tangled styles.
2. **[ONLY remaining path for tangled — definitive, heavy] Full anisotropic (local-metric) Delaunay
   mesher.** A **transition-free** triangulation (no 2:1 quadtree templates → no transition slivers
   by construction), with a per-point metric tensor + anisotropic in-circle/refinement, seeded by
   `projectPointToRadialSurface`. The spike (`metricDelaunayRefine.ts`) is the kernel to grow; it
   showed the *global-scale* version handles smooth but not tangled (needs the true anisotropic
   in-circle). Large re-architecture; re-prove watertightness/vertex-exactness. **This is the ONLY
   way to CAD-grade the 5 tangled styles** — accept-the-floor (shipped) is the alternative.
3. **[Hygiene] Wire the dual-gate into a GPU-capable CI** (currently it guards the *committed*
   baseline; a GPU CI lane could regenerate + gate live). And re-baseline (`_fidelity_dualgate_baseline.cjs`)
   whenever the mesher changes.
4. **[Closeable] Voronoi** ref-untrusted hash floor — a `Math.fround` hash simulation could certify it.
5. **[Open] SuperformulaBlossom @1 petals / Crystalline helical grooves** — near-CAD; minor residuals.

## 5. Process lessons (worth keeping)
- **Measure before fixing — and measure the RIGHT thing.** Two leading hypotheses (GATE-B, dead-DP)
  and two targeted fixes (DP-always, true-3D) were *all* refuted by measurement; the code even
  documented the DP-always dead-end. Cheap discriminators (existing levers) beat building fixes blind.
- **Synthetic proxies validate mechanism + direction, not magnitude.** The localizer's synthetic wall
  had mild slivers (17.977°), not the real <1° — the real-style GPU sweep was always the decisive test.
- **Never vary sampling resolution and mesh density in the same comparison** (denseN confound, caught
  in the perp-3D re-baseline).
- **GPU hygiene:** let Playwright probes reach `browser.close()`; hard-killing orphans chromium and
  degrades the GPU ~3×.

## 6. Document index
- **Design specs:** `2026-06-15-cad-grade-dual-gate-export-design.md`, `2026-06-15-stage2-triangle-quality-design.md`.
- **Plans:** `2026-06-15-stage1-refiner-diagnostic-and-calibration.md`,
  `2026-06-15-stage2-phase1-sliver-origin-diagnostic.md`, `2026-06-15-stage2-phase1b-efg-dp-lever.md`.
- **Evidence:** the `2026-06-10-export-endgame-evidence/stage1-*.md` + `stage2-*.md` set (this dir).
- **Gate & floor:** `2026-06-15-export-quality-gate-and-floor.md`.
- **Prior context:** `2026-06-15-perpendicular-3d-rebaseline-findings.md`, `2026-06-15-cad-grade-export-findings-and-handoff.md`.
