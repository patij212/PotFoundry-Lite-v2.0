---
name: oracle-harness
description: Use when you need ground-truth from a state-of-the-art meshing engine (gmsh, Triangle, libigl, or Blender QuadriFlow), want to benchmark the PotFoundry mesher against best-in-class at equal triangle budget, or want to prototype a meshing algorithm before porting it to TS/WGSL.
---

# Oracle Harness — SOTA engines as dev-only oracles (PotFoundry)

## Overview
A **dev-only** harness that runs proven engines on the SAME parametric surfaces our mesher does, and measures their output with **our own instruments**, so comparisons are apples-to-apples. Nothing external ships — production stays pure-browser TS/WGSL; `src/` never imports `research/`.

**The load-bearing contract — one metric, both meshes:** the oracle outputs a `(u,t)` triangulation; we lift it to 3D analytically and score it with `perpendicular3DDeviation` + `triangleQualityDistribution` — the exact instruments we run on our own mesh. No re-derived metric, no confound.

## Setup (once)
```bash
cd potfoundry-web/research/oracle
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # unix: .venv/bin/python
.venv/Scripts/python.exe -m pytest tests/ -q                  # smoke: engines install + run
```
Engines (pip wheels, no C compiler): **gmsh 4.13.1**, **triangle 20230923**, numpy, scipy, trimesh, meshio.

## The flow (TS entry: `research/bridge/runStyle.ts`)
```ts
import { runStyle } from './runStyle';
const rows = runStyle('GyroidManifold', { H: 120, Rb: 40, Rt: 50, expn: 1 },
  ['triangle', 'gmsh'], { tolMm: 0.1, sizeRes: 24, hMin: 0.003, hMax: 0.08 });
// rows: ScoreRow[] — { engine, tris, chordP99Mm, chordMaxMm, vertexMaxMm, pctUnder20deg, minAngleDeg, engineMs }
```
Internally: build the analytic `rA(θ,z)` (from `STYLE_FUNCTIONS` + `baseRadius`, production-identical) → curvature **sizing field** (`buildIsotropicSizingField`) → write `OracleInput` JSON → run the Python CLI → read back → **measure with our instruments**.

**Anisotropic gmsh:** pass `aniso: true` — `runStyle` then builds the 2nd-fundamental-form metric (`buildAnisotropicMetricField`) and routes gmsh to BAMG.

> **Common mistake (always go through `runStyle`):** do NOT re-implement the engine invocation / `OracleInput` assembly. Observed pressure-test failure (2026-06-26 ours-vs-SOTA): a hand-rolled oracle helper wrote only the scalar `sizing` field and omitted the `metric` tensor → `gmsh-aniso` **silently equalled `gmsh-iso`** (caught only because the agent compared the two columns). `runStyle`'s `aniso` flag is the single source of truth for wiring the metric.

## CLI contract (stateless, file-in/file-out)
```bash
.venv/Scripts/python.exe research/oracle/oracle.py mesh --in <exchange-dir> --engine <triangle|gmsh>
# reads <dir>/input.json → writes <dir>/out_<engine>.json  ({engine,config,ut,indices,engineMs,engineVersion})
```
`config.sizeField` records `"postview"` vs `"fallback"` so a silent size-field substitution can't confound results.

## Which engine is the oracle for what
| Engine | Use as oracle for |
|---|---|
| **gmsh** (Frontal-Delaunay + anisotropic background **metric**) | the H1 test: can a true anisotropic mesher CAD-grade the tangled lattices? `[measured]` PostView size-field works in 4.13.1 |
| **Triangle** (Shewchuk, Ruppert/Chew `pq`) | transition-free quality CDT in `(u,t)` |
| **libigl** (remesh, curvature, LSCM/ARAP) | remeshing ceiling; curvature sizing (Phase-2) |
| **Blender QuadriFlow** (via MCP) | field-aligned quad **edge-flow** — the "rival Blender/Rhino" look (recipe below) |

## Blender QuadriFlow recipe (the one interactive oracle)
Via the Blender MCP tools: import the dense reference mesh → `bpy.ops.object.quadriflow_remesh(target_faces=N)` (or voxel remesh) → export `mesh.ply` to the exchange dir → render a viewport image for the visual gate. If Blender isn't connected, skip + log (the Python engines still give a full scorecard).

## Reproducibility (non-negotiable)
Every run records engine version + exact config + seed in `out_<engine>.json`. gmsh seed pinned (`Mesh.RandomSeed=1`); Triangle is deterministic. Any number in `research/EXPERIMENT-REGISTRY.md` is re-runnable from its directory.

## When NOT to use
- Production export (nothing here ships; it's a measurement/prototyping bench).
- As the final word on *our* watertightness (oracles mesh a surface patch, not the closed solid — that's the production gate).

See [[meshing-research]] for the experiment protocol and [[tessellation-knowledge]] for which method to ask an engine to run.
