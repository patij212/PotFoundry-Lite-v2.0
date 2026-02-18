---
name: debug-export
description: Diagnose issues in the PotFoundry parametric mesh export pipeline. Traces from symptom backward through WebGPU compute → CDT triangulation → mesh stitching → STL/GLB output. Use when exports produce bad geometry, wrong vertex counts, holes, flipped faces, or crashes.
---

## Export Pipeline Debug Guide

The PotFoundry export pipeline has these stages (in order):

1. **`ParametricExportComputer.ts`** — WebGPU compute: samples the parametric surface, outputs vertex positions + normals
2. **`AdaptiveExportComputer.ts`** — LOD/adaptive: selects resolution based on `ImportanceMapComputer.ts` output
3. **`ExportComputer.ts`** — Base pipeline: manages GPU buffers, dispatch, and CPU readback
4. **`src/utils/geometry/`** — CDT triangulation with chain constraint enforcement, mesh stitching, outer wall tessellation
5. **Final output** — STL or GLB written via `jszip` / `meshoptimizer`

## Diagnosis Steps

First, ask the user: **What symptom are you seeing?**

- **Holes / missing faces** → Check CDT constraint enforcement and chain vertex deduplication in `src/utils/geometry/`
- **Inverted / flipped faces** → Check winding order (should be CCW) in the triangulation output
- **Wrong vertex/triangle count** → Check dispatch sizing in `ParametricExportComputer.ts` and buffer readback size
- **Crash / GPU error** → Check workgroup sizes, buffer alignment (`vec3` needs 16-byte padding), and `mapAsync` ordering in `ExportComputer.ts`
- **Jagged edges / smoothing issues** → Check normal computation and the smoothing/tolerance settings in the shader
- **Chain edges not enforced** → Check the constraint-aware strip triangulation and `bsearchFloor` boundary clamping

## After Identifying the Symptom

1. Read the relevant file(s) listed above.
2. Check the corresponding `.test.ts` for that stage to understand expected behavior.
3. Trace the data flow from the symptom backward to find where the corruption enters.
4. Propose a targeted fix with the specific file and line range.
