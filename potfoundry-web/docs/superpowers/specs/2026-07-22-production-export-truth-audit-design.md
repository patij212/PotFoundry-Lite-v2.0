# Production Export Truth audit — design (2026-07-22)

## Problem

"Full fidelity at all shapes in production" is currently blocked by a **verification
gap**, not (only) by missing meshers:

- Production ships the **OLD free-Delaunay conforming mesher**. Every high-fidelity
  path (6 smooth-grid styles, DragonScales cone-fan, BambooSegments ring-strip,
  LowPolyFacet facet-grid) is wired into the export dispatch but gated behind a
  master `__pfPerfectMesher` flag **plus** a per-family sub-flag, **all default-OFF**.
  Flag-off is byte-identical to today (guarded by `flagOff.byteIdentical.test.ts`).
- The ~9 "closed" claims (≤0.01 mm true-3D + judge-ACCEPT at production scale) were
  measured through **Node bridge harnesses** (`research/bridge/*`), never through the
  **real in-app export pipeline** (GPU eval + real `WatertightAssembly` + the actual
  `exportValidation` download gate).
- The authoritative status docs (`2026-07-19-all20-status-truth.md`) self-mark every
  production-default fidelity number **SUSPECTED** and say "Track B is re-measuring."

Standing project discipline (`feedback_audit_first`): **no fix proposals without
measurement.** So before enabling any mesher or building any new one, we measure what
the real pipeline actually produces.

## Goal (non-negotiable framing)

Produce **one commit-pinned table** — measured through the **real export pipeline on
real WebGPU**, **MAX-first**, at **production dims + registry-default params** — that
says, per style, what a user gets today (flag-OFF) and whether the flag-ON structured
mesher genuinely delivers ≤0.01 mm and a passing download gate.

This audit is **measurement only**: no production code changes, no flag flips, no new
mesher. The sole code touch is a dev-gated diagnostic hook (below), byte-identical in
production.

## Scope

**Pass 1 (this spec):** the **9 closed-and-wired styles**, each in both flag states,
at production dims (`H120 / OD140 / bottom 90 / drain 10`) + registry defaults. This
answers the actionable question — *do the closures hold in the real pipeline?* —
fastest (~30–40 min real-GPU).

**Pass 2 (follow-up, not this spec):** the remaining 11 open styles (OFF baseline +
their genuine per-style gap), to complete the all-20 table.

### Style → ON-flag map (Pass 1)

| # | Style | Shape class | ON flags (all also need `__pfPerfectMesher`) | Emitter |
|---|-------|-------------|-----------------------------------------------|---------|
| 1 | HarmonicRipple | single-valued smooth | `__pfSmoothGrid` | smoothGrid |
| 2 | SuperellipseMorph | single-valued smooth | `__pfSmoothGrid` | smoothGrid |
| 3 | FourierBloom | single-valued smooth | `__pfSmoothGrid` | smoothGrid |
| 4 | SpiralRidges | single-valued smooth | `__pfSmoothGrid` | smoothGrid |
| 5 | SuperformulaBlossom | single-valued smooth | `__pfSmoothGrid` | smoothGrid |
| 6 | WaveInterference | single-valued smooth | `__pfSmoothGrid` | smoothGrid |
| 7 | LowPolyFacet | single-valued faceted (C0 vertical edges) | `__pfSmoothGrid` (facet-aligned `alignNU=24`) | smoothGrid+facet |
| 8 | DragonScales | **multi-valued** (scale overhang + ring cliffs) | `__pfRegionLayer` + `__pfDsConeFan` | region → cone-fan |
| 9 | BambooSegments | **multi-valued** (double-valued tread curtains) | `__pfBamboo` | ring-strip |

## Ruler — MAX-first, selected by shape class (Measurement Compendium §3)

- **Single-valued (1–7):** `window.__pfFidelity.diagnoseSurfaceFidelity({ metric:
  'perpendicular', referenceSource: 'auto' })` → `chordMaxMm` + `vertexMaxMm`, and the
  `referenceTrusted` self-check (vertexMax ≤ 0.05 mm ⇒ the CPU reference tracks the GPU
  shader; a drifted reference is flagged, not silently trusted).
- **Multi-valued (8–9):** `diagnoseSurfaceFidelity` is **structurally blind** to
  over/under sheets and cliffs (it drops seam/riser/crease bands into a tracked-not-
  gated channel) — it would fake-green DS/Bamboo. Measure them with the existing
  `src/fidelity/parametricSurfaceProjector.ts` (`buildParametricSurfaceProjector`, §4.5b)
  wired into a **new dev-gated** `diagnoseParametricFidelity` hook (see below).
- **Watertight / slivers (all):** `diagnoseTopoQuality` → `boundaryEdges` (must be 0),
  `nonManifoldEdges`, `orientationMismatches`, and `minAngleDeg` (the depth-invariant
  sliver headline).
- **Headline verdict per cell:** `max(true-3D) ≤ 0.01 mm ∧ boundaryEdges = 0`. Report
  the whole vector `{max, p99, rms, minAngle, watertight, tris, buildMs}` — never let
  one scalar stand in (Compendium §2). p99 is diagnosis only; **certify on MAX**.

## The two honesty layers a Node bridge harness cannot see

These are the reason the audit runs the *real* pipeline rather than re-running bridge tests:

1. **Flag-plumbing check.** Confirm ON actually changes routing/tri-count vs OFF (the
   `_fidelity_flag_validate.cjs` pattern). If ON == OFF, the emitter is not reaching
   `generateMesh` — a finding, measured not assumed. This is step 1 of every ON run.
2. **Download-gate pass.** Run the real `src/geometry/exportValidation.ts` on the ON
   mesh at production tri-counts, to catch the known **Map-cap crash** and **10×
   watertight-tolerance divergence** (Compendium §6.4) that would block the export for
   a real user even when the geometry is fine. Report pass/fail/crash per cell.

## The one code change — `diagnoseExportTruth` (dev-gated)

A new method on the `PfFidelityApi` (`src/fidelity/windowHook.ts`), gated identically
to the rest of the hook (`import.meta.env.DEV || ?fidelity=1`; production imports only
types). It generates the mesh **once** and returns the full audit row in-page (numbers
only across the CDP bridge — the multi-million-tri mesh never leaves the page):
fidelity, watertight (`topologyMetric`), and the real `validateMeshForExport` download
gate.

For the **fidelity number** it reuses the shipped, in-`src` `measureRadialFidelity`
(the global-correct radial projector + honest perpendicular chord, MAX-first) with a
**fine** projector grid and **no exclusion loci**, so cliffs are measured rather than
dropped into a tracked-not-gated band. This is chosen over hand-rolling
`buildParametricSurfaceProjector` because both DS and Bamboo emitters build their walls
from a single-valued `analyticRA` — so a single-valued radial ruler is the exact-right
reference, *if* it reproduces the known closures.

**Validation gate (safety net for the two multi-valued styles):** an **offline Vitest**
runs `measureRadialFidelity` on the DS cone-fan and Bamboo ring-strip reference walls and
must reproduce the bridge campaign's honest MAX (DS ≈ 0.005 mm, Bamboo ≈ 0.0074 mm)
within tolerance — before any GPU run. If it does not, those rows are stamped
**INCONCLUSIVE** and escalated to `buildParametricSurfaceProjector` (a follow-up), never
reported as a confident number.

## Harness

A focused `e2e/_production_export_truth.cjs`, built on the `_authoritative_matrix.cjs`
pattern: Playwright + `--enable-unsafe-webgpu`, `?fidelity=1`, `PF_RESUME` support,
JSON output. Per style: OFF run (nothing set) then ON run (`addInitScript` sets the
flag map above). `PF_STYLES` env override; default = the 9 closed styles.

Output: `e2e/baselines/production-export-truth-pass1.json` + a rendered
`research/lab/2026-07-22-production-export-truth.md` table (the commit-pinned
deliverable that supersedes the SUSPECTED rows for these 9 styles).

## Feasibility & handoff (confirmed empirically, not assumed)

- **First execution step is a 1-style smoke** (HarmonicRipple, both states) to prove
  the harness + real-GPU launch in this sandbox. Memory shows heavy compute here is
  usually Node-side; if headed-WebGPU Playwright cannot launch a real GPU in the agent
  sandbox, the harness is built to hand to the user to run on the real machine — the
  deliverable (harness + table) is identical either way.
- The `diagnoseParametricFidelity` hook and its bridge-cross-validation are pure TS and
  run under Vitest regardless of the browser situation, so the risky part is de-risked
  independent of the GPU run.

## Non-goals

- No flag flip, no production enablement (that is the *next* increment, gated on this
  audit's results).
- No new or modified mesher; no change to any export code path.
- No Pass-2 open-style closure work.
- Not the final STL bytes' rigorous certificate (the in-memory GPU-f32 metric is
  necessary-but-not-sufficient; float32 STL is ~750× below the 10 µm bar per Compendium
  §8, so the in-page number is the right cost/faithfulness point for this audit). The
  download-gate pass covers the STL-path *validity*, not a second fidelity number.

## Testing

- `diagnoseParametricFidelity`: a Vitest unit test on a known mesh (the DS cone-fan /
  Bamboo ring-strip reference wall) asserting it reproduces the bridge MAX — the
  cross-validation gate above.
- Harness: the 1-style smoke is its own acceptance test (produces a sane OFF/ON row).
- No production behavior is touched, so `flagOff.byteIdentical.test.ts` and the existing
  suite must stay green (the hook addition is dev-only and additive).

## Deliverable acceptance

The Pass-1 table is "done" when, for each of the 9 styles, both flag states have a
measured `{true-3D MAX, watertight, tris, buildMs, download-gate}` row from the real
pipeline, the multi-valued rows carry a bridge-cross-validated ruler, and each closure
is stamped **CLOSED-holds** / **CLOSED-refuted (gap X mm / non-watertight / gate-fail)**.
