# SP0 — 3D Export Fidelity Measurement Harness

**Date:** 2026-05-28
**Status:** Design approved (proceeding to plan + implementation)
**Branch:** `refactor/core-migration`
**Sub-project:** SP0 of the "Rhino/Grasshopper-grade export fidelity" program (SP0→SP3).

## Problem

The parametric export pipeline (v4.1, `ParametricExportComputer` + `parametric/`) is
instrumented almost entirely in **UV space** (`parametric.audit.test.ts`) and **triangle
budget** (`PARAMETRIC_PRESETS`). The goal — Rhino/Grasshopper-grade fidelity — is defined in
**3D against the analytic surface**: bounded chord/sag deviation, well-shaped 3D triangles, a
watertight oriented solid, and faithful feature edges.

What is already measured and healthy:
- Feature-ridge accuracy: `parametric.precision.audit.test.ts` shows `|∂r/∂u| < 1e-6` at chain
  vertices after `AnalyticRidgeSolver`.
- UV topology: cross-row slivers eliminated (`maxRowSpan = 1`), manifold mostly clean.

What is **not** measured (the gap to the goal):
- **3D sag deviation** of the emitted mesh from the analytic surface — the core Rhino metric.
- **3D triangle quality** (UV aspect ≠ 3D aspect under physical anisotropy; current UV
  `maxAspect` hits 7341 at production scale).
- **Full-pot watertightness / normal consistency** proven on real exports of every style
  (the `exportValidation.ts` validator is only unit-tested on synthetic cubes).
- **Feature preservation** — the F12 audit fixture silently drops *all* chains under
  steep-spiral + multi-row-gap; nothing catches dropped features end-to-end.

Per the project's measurement-first discipline, no fix may land without a pinned metric that
proves the symptom is real and that the fix improves it. SP0 builds that instrument. It is the
acceptance gate for SP1 (tolerance-driven tessellation), SP2 (sliver/topology), and SP3
(watertight assembly).

## Goal

A **real-WebGPU Playwright harness** that exports **every registered style** and emits a
per-style × per-metric fidelity matrix plus pinned invariants, with **zero changes to pipeline
logic**. Real GPU is required so we measure exactly what ships (no CPU↔GPU divergence in the
mesh under test).

Non-goals (deferred to SP1–SP3): changing tessellation, removing slivers, stitching the full
pot, enforcing gates in production. SP0 only *measures*.

## Decisions

- **Surface evaluation:** real WebGPU via Playwright (Chromium + Edge, `--enable-unsafe-webgpu`,
  already configured). Dev server on `:3001` locally.
- **Style scope:** all `STYLE_REGISTRY` entries.
- **Mesh capture:** `useParametricExport().generateMesh()` already returns full `MeshData`
  (`{vertices, indices, vertexCount, triangleCount}`). Expose it to Playwright via a minimal,
  dev/test-gated `window.__pfFidelity` hook. No pipeline logic touched.
- **Ground truth for sag:** the pottery surface is radial — `r = R_true(θ, z)`. For any 3D
  point, `θ = atan2(y, x)`, `z` is the height, and deviation is
  `|hypot(x, y) − R_true(θ, z)|`. This needs no per-vertex `(u,t)` bookkeeping. `R_true` is
  evaluated the same way the live surface is, to avoid divergence; the harness also reports a
  CPU↔GPU vertex-radius delta as a divergence sanity check.

## Architecture

```
e2e/
  export-fidelity.spec.ts     # Playwright: load app once, loop all styles, capture mesh,
                              # run metrics in page.evaluate, write matrix + assert invariants
  fidelity/
    metrics.ts                # Pure metric functions (no DOM/GPU) — also unit-tested in vitest
    metrics.test.ts           # vitest unit tests for metrics on synthetic meshes
    types.ts                  # FidelityMetrics, FidelityMatrixRow, thresholds
    baseline.json             # Emitted matrix artifact (git-tracked baseline)
src/
  <one small dev/test-gated window hook to expose generateMesh + setStyle>
```

### Test-only window hook (the single production touch)

A dev/test-gated registration (guarded by `import.meta.env.DEV` or a `?fidelity=1` query param,
never shipped active in prod) attached where `useParametricExport` is live:

```ts
window.__pfFidelity = {
  listStyles(): StyleId[],
  async generate(styleId: StyleId, targetTriangles: number): Promise<MeshData>,
};
```

It sets the style in the store, waits for the renderer to settle, calls `generateMesh`, and
returns the `MeshData`. It contains no measurement logic and no pipeline changes.

### Metrics (`fidelity/metrics.ts`, pure)

Operate on `{ vertices: Float32Array, indices: Uint32Array }` plus an `R_true(θ, z)` callback.

1. **Sag deviation** — for each triangle, sample interior points on a barycentric grid
   (configurable density, default order 4 → 15 samples/tri). Each sample's deviation is
   `|hypot(x,y) − R_true(atan2(y,x), z)|`. Report `maxSagMm`, `rmsSagMm` per style.
2. **3D triangle quality** — `aspect = longest² / (4·area·√3)` and `minAngleDeg`, computed on
   3D positions. Report `maxAspect3D`, `minAngleDeg`, and a sliver count
   (`tris with aspect > 100`).
3. **Watertightness** — position-weld vertices (tolerance ~1e-4 mm, matching
   `exportValidation.ts`), build the edge→face map, report `boundaryEdges`, `nonManifoldEdges`.
4. **Normal consistency** — directed shared-edge orientation mismatches (reuse the
   `exportValidation.ts` algorithm).
5. **Feature preservation** — expected peak/valley count for the style (from row probing /
   `getLastChainDebugData`) vs. feature edges actually present. Report
   `featuresExpected`, `featuresPresent`, `featuresDropped`.

All metric functions are pure and unit-tested in vitest against hand-built meshes (a closed
cylinder of known radius → near-zero sag; a deliberately slivered mesh → high aspect; an open
quad → boundary edges) so the instrument itself is trusted before it judges the pipeline.

### Output

- Console table mirroring the Phase A matrix format (one row per style).
- `e2e/fidelity/baseline.json`: `{ generatedAt, budget, refDimensions, rows: FidelityMatrixRow[] }`.
- This file is the **baseline** SP1–SP3 must beat; regressions are diffs against it.

### Pinned invariants (Phase B)

One assertion per fidelity dimension, per style. Written as failing/skip-tolerant where the
pipeline is currently broken so they flip the moment a later sub-project fixes them
(consistent with the audit's `it.fails` convention):

- `maxSagMm <= SAG_TOL_MM` (target derived from the selected budget; see Thresholds)
- `maxAspect3D < 100`
- `boundaryEdges == 0` (full pot) / documented expected value if SP0 measures outer-wall-only
- `orientationMismatches == 0`
- `featuresDropped == 0`

### Thresholds

- `SAG_TOL_MM`: start at **0.1 mm** (typical FDM nozzle ~0.4 mm; Rhino "smooth" defaults are
  sub-tenth-mm). Recorded in `types.ts`, revisited in SP1 when tessellation becomes
  tolerance-driven.
- `ASPECT_MAX`: 100 (matches the UV audit's B5 bound).
- `WELD_TOL_MM`: 1e-4 (matches `exportValidation.ts`).

## Risks & mitigations

- **What `generateMesh` returns (outer wall vs. full pot).** If it returns the parametric
  outer wall only, watertightness will legitimately show boundary edges (top/bottom/seam). The
  harness records *which* mesh it measured and sets the watertight invariant's expected value
  accordingly; SP3 drives it to a closed solid. This is documented, not silently tolerated.
- **GPU flakiness / CI.** Locally requires `npm run dev` first (`webServer` only auto-starts in
  CI). Harness loads the app once and reuses the page across styles to amortize init.
- **CPU↔GPU `R_true` divergence.** Reported as an explicit sanity metric; if vertex-radius
  delta is large, the sag numbers are flagged untrustworthy rather than believed.
- **Runtime across ~20 styles × full export.** Use the `draft`/`standard` budget for the
  matrix; a single style can be re-run at higher budgets on demand.

## Acceptance criteria for SP0

1. `npm run dev` + the fidelity spec produces a complete matrix for every registered style.
2. `metrics.ts` unit tests pass in vitest (instrument is trusted).
3. `baseline.json` is committed as the reference SP1–SP3 must beat.
4. Pinned invariants exist for all five dimensions and correctly reflect current HEAD (red
   where broken, green where already good — e.g. ridge precision).
5. No pipeline logic changed; the only production touch is the dev/test-gated window hook.
