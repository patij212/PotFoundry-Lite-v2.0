---
name: meshing-research
description: Use when investigating a meshing or export-fidelity defect, proposing any change to the mesher, or running a tessellation experiment in PotFoundry — before building a fix, and before claiming a result is done, fixed, or improved.
---

# Meshing Research — the scientific loop (PotFoundry)

## Overview
Mesh/export fidelity work here is **experimental science**, not coding. The two failures that cost the most are (1) building a fix before measuring whether it can possibly work, and (2) declaring victory on a number that measured the wrong thing. This skill makes both impossible.

**Core principle:** Measure before fixing — and measure the RIGHT thing, against a stated reference, past a kill-criterion you wrote down *first*. **Violating the letter of this loop is violating its spirit.**

## The loop (do every step, in order)
1. **Hypothesis** — one falsifiable sentence ("anisotropic gmsh closes the Gyroid chord+quality gap at our budget").
2. **Cheapest discriminator** — the existing lever or the [[oracle-harness]] engine that can KILL it fastest, *before building anything*.
3. **Pre-register the kill-criterion** — write the exact number that confirms/refutes it **before running**. Append it to the experiment ledger. This is the step that prevents "it looks fixed".
4. **Run** under the controls (below).
5. **Measure** with the shared instruments — the SAME metric on every mesh.
6. **Classify** — confirmed / refuted / no-op.
7. **Record** in `research/EXPERIMENT-REGISTRY.md` (or `docs/superpowers/specs/.../evidence/`); commit. **Keep refuted results** — they are the most valuable; never revert to discard.
8. **Decide** — next experiment, or productionize (flag-gated, byte-identical-off, GitNexus impact, watertight re-proof).

## Quick reference
**Levers** (window globals; `?fidelity=1`; default off → byte-identical): `__pfConformingUniformLevel / MaxSag / NRing / UBias / Efg / MinEdge / MaxLevel / Budget`, `__pfSurfaceFidelityExact`, `__pfReferenceDenseRes / Bicubic`.
**Instruments:** `perpendicular3DDeviation` (honest 3D chord), `triangleQualityDistribution` (min-angle, `pctBelow20`), `crestBandTriangleQuality`, `deviationVsTrueSurface` (fidelityGate), the `TRI_SOURCE` channel (attribute a sliver to its template). The [[oracle-harness]] measures gmsh/Triangle on the SAME instruments.
**Gates:** chord p99 ≤ τ(p) (`src/fidelity/gateThresholds.ts`); min-angle ≥ 20°; watertight by **index**; vertex faithfulness ≤ f32 floor.
**Controls:**
- Never vary sampling-resolution and mesh-density in the same comparison (the denseN confound).
- Synthetic proxies validate **mechanism + direction, not magnitude** — the real-style GPU sweep is the decisive test.
- Compare only at **equal triangle budget**.
- GPU hygiene: let Playwright probes reach `browser.close()`; reap orphaned chromium; serialize GPU probes.

## Rationalizations — STOP if you think one (all observed in this project)
| Rationalization | Reality |
|---|---|
| "Round N is done / it looks fixed" | Write the kill-number BEFORE running. "Looks fixed" is not a measurement. (This exact pattern was rejected here.) |
| "Let me just build the fix" | A cheap discriminator can refute it in minutes. **Two built fixes were refuted last arc** by existing levers. |
| "The synthetic test passed" | Proxies validate mechanism+direction, not magnitude. The real-style GPU sweep decides. |
| "Denser mesh fixed it" | Did you vary sampling-res AND density together? And density is **sliver-invariant** here. |
| "The metric went down" | Down on which metric, vs what reference? A verified-TRUE number can measure the WRONG thing (the dilation-recall artifact). |
| "I'll keep the refuted code as reference" | Commit it WITH its honest NO-GO status. Reverting to discard loses the diagnosis. |

## Red flags — you are off the method
- Editing the mesher before naming a discriminator.
- No pre-registered kill-criterion in the ledger.
- A result claimed without its reference and budget stated.
- "It looks better" / a screenshot as the verdict.
- `git revert`/`restore` to throw away a refuted experiment.

**All of these mean: stop, return to step 2 or 3.**
