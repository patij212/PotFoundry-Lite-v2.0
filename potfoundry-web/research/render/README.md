# research/render — dev-only mesh renderers for the meshing lab

Turn a lab mesh into a **picture** (flat-shaded montage or per-face chord-error heatmap). This is how a finding
ships with visual evidence, not just numbers — the thing the user actually reacts to. `src/` never touches this.

## Why render at all
A metric can say "0.08mm p99" while a flat-shaded render shows a chamfered crest, or a heatmap shows a red rib the
number averaged away. **If a render disagrees with a metric, trust the render and fix the metric.**

## Recipe (3 steps)

1. **In a probe (TS), dump the heatmap with `labkit.dumpHeatmap`** as soon as each mesh is built (checkpoint-friendly).
   `dumpHeatmap` colours by the HONEST **true-3D** ruler by default (facet→nearest-surface) and writes `meta.ruler`
   so the legend labels it; `{ruler:'radial'}` opts into the legacy same-(u,t) chord (which OVERSTATES steep relief):
   ```ts
   import { dumpHeatmap, dumpRenderBins, buildMeshUt } from './labkit';
   const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);          // lifted xyz
   dumpHeatmap(OUTDIR, 'gothic_true3d', m.xyz, mesh.ut, mesh.indices, rA, H);                 // default true-3D
   dumpHeatmap(OUTDIR, 'gothic_radial', m.xyz, mesh.ut, mesh.indices, rA, H, { ruler: 'radial' }); // A/B
   // plain flat-shade (no heatmap): dumpRenderBins(OUTDIR, 'gothic', m.xyz, mesh.indices, { stl: true });
   ```

2. **Render** (auto-detects `.col.bin` → heatmap mode with legend; else solid clay). `PF_RENDER_CELL` sets the per-cell
   pixel size for HIGH-QUALITY output (default 560; use 1000–1400 for crisp per-map PNGs — fonts/legend scale with it):
   ```bash
   # NOTE the NODE_PATH — a research/scratchpad .cjs can't resolve the project node_modules on its own.
   PF_RENDER_CELL=1100 NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs \
     out.png research/exchange/_showcase 2 gothic_radial gothic_true3d
   #        ^png    ^binDir              ^cols ^cell names (each → <name>.xyz.bin/.idx.bin[/.col.bin][/.meta.json])
   ```
   The legend names the ruler (from `meta.ruler`, or inferred from a `_true3d`/`_radial` name suffix); each cell's
   label shows `[ruler · class] — tris · p99 · worst · %>0.03 · nonMan` from the meta.

3. **View** the PNG. Copy it into `research/exchange/…` (git-ignored) if you want it beside the STLs.

## Gotchas baked in (learned the hard way)
- **Flat shading is mandatory for sharp relief.** `flatShading:false` + smooth vertex normals average across near-C0
  grooves → they visually vanish (a whole "GothicArches missing relief" false alarm came from this).
- **Binary bins + localhost fetch, not JSON embedding** — embedding dies past ~600MB; multi-million-tri cells stream fine.
- **One renderer + per-cell viewports**, disposing each mesh after drawing → bounded GPU memory (avoids
  "too many WebGL contexts" past ~16 panels and OOM on big meshes).
- **NODE_PATH** must point at `potfoundry-web/node_modules` (for `@playwright/test`) when running from `research/`.
- swiftshader (headless, no real GPU) is fine and deterministic for these renders.

## Files
- `meshRender.cjs` — the renderer (solid flat-shade OR heatmap, auto by `.col.bin`; `<cols>` grid arg).
