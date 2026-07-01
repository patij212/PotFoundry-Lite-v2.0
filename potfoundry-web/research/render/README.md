# research/render — dev-only mesh renderers for the meshing lab

Turn a lab mesh into a **picture** (flat-shaded montage or per-face chord-error heatmap). This is how a finding
ships with visual evidence, not just numbers — the thing the user actually reacts to. `src/` never touches this.

## Why render at all
A metric can say "0.08mm p99" while a flat-shaded render shows a chamfered crest, or a heatmap shows a red rib the
number averaged away. **If a render disagrees with a metric, trust the render and fix the metric.**

## Recipe (3 steps)

1. **In a probe (TS), dump bins with `labkit.dumpRenderBins`** as soon as each mesh is built (checkpoint-friendly):
   ```ts
   import { dumpRenderBins, perFaceChordSag, vertErrColors, buildMeshUt } from './labkit';
   const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);          // lifted xyz
   // plain flat-shade:
   dumpRenderBins(OUTDIR, 'gothic_conf', m.xyz, mesh.indices, { meta: { true3D_p99 }, stl: true });
   // OR chord-error heatmap (adds <name>.col.bin):
   const sag = perFaceChordSag(mesh.ut, mesh.indices, rA, H);
   dumpRenderBins(OUTDIR, 'gothic_conf', m.xyz, mesh.indices,
     { colors: vertErrColors(sag.vertErr, 0.15), meta: { pctOver0_15: 100 * sag.fracOver(0.15) } });
   ```

2. **Render** (auto-detects `.col.bin` → heatmap mode with legend; else solid clay):
   ```bash
   # NOTE the NODE_PATH — a research/scratchpad .cjs can't resolve the project node_modules on its own.
   NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs \
     out.png research/exchange/_showcase 2 gothic_base gothic_conf
   #        ^png    ^binDir              ^cols ^cell names (each → <name>.xyz.bin/.idx.bin[/.col.bin][/.meta.json])
   ```

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
