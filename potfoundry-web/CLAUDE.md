# PotFoundry Web

3D pottery design tool — TypeScript/React SPA on Cloudflare Pages.
Dual WebGPU (primary) / WebGL (fallback) renderer. Auth via Supabase, payments via Stripe.

## Environment Variables

```
VITE_SUPABASE_URL              # Supabase project URL
VITE_SUPABASE_ANON_KEY         # Supabase anon key
VITE_STRIPE_PRICE_PRO_MONTHLY  # Stripe monthly price ID
VITE_STRIPE_PRICE_PRO_YEARLY   # Stripe yearly price ID
```

Without Supabase vars, auth is disabled and all exports are allowed (dev mode).

## Architecture

`src/utils/geometry/` — CDT triangulation, mesh stitching, chain constraints.
See `docs/geometry.md` for the full file-by-file reference.

## WebGPU Renderer Files (`src/renderers/webgpu/`)

| File | Purpose |
|---|---|
| `WebGPURenderer.ts` | Top-level WebGPU renderer class. Owns the device, swap chain, and frame loop. |
| `SceneManager.ts` | Manages render pipelines and uniform/style-param buffers. Caches compiled pipelines per style ID. Runs a smoke test on init to detect incompatible drivers. |
| `ShaderManager.ts` | Singleton. Assembles WGSL programs from raw shader modules. Key methods: `getStyleWGSL(id)` (preview vertex/fragment), `getStyleEnvironmentWGSL(id)` (compute environment), `getUniversalWGSL()` (thumbnail renderer — includes all styles with switch dispatch), `getDebugLinesWGSL(id)` / `getDebugPointsWGSL(id)` (debug overlay shaders). Calls `stripShaderCode()` to remove inactive style functions before upload. |
| `ExportComputer.ts` | GPU Grid export (pipeline 2). Runs `calc_vertices` + `calc_indices` compute kernels. Handles adaptive Z-LUT, tiling (≤16 MB tiles), and optional meshoptimizer decimation. |
| `FeatureExtractionComputer.ts` | Adaptive pipeline stage 1. GPU compute pass that detects ridges/valleys/creases. Outputs up to 100,000 `FeaturePoint` structs (`{theta, t, type, strength}`). Uses RAII-style `ResourceScope` for buffer cleanup. |
| `ImportanceMapComputer.ts` | Adaptive pipeline stage 2. GPU compute that samples style curvature across a 64×64 UV grid to produce an importance map. Output drives adaptive background point density in `ConstrainedTriangulator`. |
| `AdaptiveExportComputer.ts` | Adaptive pipeline stage 4. GPU triangle subdivision using feature proximity importance. Uses `weldMesh` post-GPU to merge seam vertices. Known issue: T-junctions where neighbour triangles split independently at the importance threshold. |
| `ParametricExportComputer.ts` | Parametric pipeline orchestrator (pipeline 4, current best path). ~1400 lines — delegates to modular `parametric/` sub-modules for curvature analysis, feature detection, chain linking, grid building, tessellation, optimization, and subdivision. See `parametric/` directory for individual module docs. |
| `raycast/RaycastController.ts` | Exact ray-cast preview (flag-gated: `?preview=raycast` / Settings → Preview engine / `localStorage['pf-preview-mode']`). Fullscreen bounded-march+bisection against the true style_radius solid; progressive accumulation AA (16 spp desktop / 8 mobile). Mesh preview remains the default and the wireframe/thumbnail/WebGL path. Dev API: `window.__pfRaycast.controller` (setQuality/setDebugMode/readbackPixels). Spec: `../docs/superpowers/specs/2026-07-08-raycast-preview-design.md`. |

## Dev Hooks (`.claude/hooks/`)

Two hooks run automatically during agent editing sessions.

**`env-guard.js`** — `PreToolUse` hook (runs before every Edit/Write):
- Blocks any attempt to edit files matching `*.env*` or ending in `.env`.
- Exit code 2 = hard block. The edit will not proceed.

**`eslint-check.js`** — `PostToolUse` hook (runs after every Edit/Write on `.ts`/`.tsx` files):
- Runs `npx eslint <file> --max-warnings=0` on the edited file.
- Exit code mirrors ESLint result. A non-zero exit warns the agent of lint errors.
- This enforces the 0-warnings policy in CI locally during editing.

Agents should expect ESLint output after every TypeScript file edit. A lint failure does not prevent the write, but the agent should fix warnings before moving on — they will fail CI.

## State Management

Use named selector hooks — not raw `useAppStore` — to avoid unnecessary re-renders:

```ts
useGeometry(), useStyle(), useMesh(), useAppearance(), usePerformance()
useGeometryActions(), useStyleActions(), useMeshActions(), etc.
```

Only `geometry`, `style`, `mesh`, `appearance` are persisted to localStorage.
`ui` and `performance` slices are transient (reset on reload).

## Key Gotchas

**Renderer selection order:**
1. `forceRenderer` API arg
2. URL param `?renderer=webgl|webgpu` (emergency override when UI inaccessible)
3. `localStorage['pf-preferred-renderer']` (user Settings preference)
4. Auto-detect (WebGPU preferred, WebGL fallback)

Auto-recovery on GPU crash: `sessionStorage['pf-gpu-recovery']` prevents reload loops.

**Ray-cast preview flag:** `resolvePreviewMode` (url > localStorage > mesh). The ray-cast
path is desktop+mobile WebGPU only; wireframe mode always uses the mesh path. The RC
uniform layout (112 bytes, r_max at byte 80 written by a GPU buffer copy) is shared between
`preview_raycast.wgsl` and `RaycastController.writeRcUniforms` — change both together.

**Ray-cast banded march (2026-07-08):** the march skips empty air/cavity analytically and
fine-steps (at `min(pixel footprint, feature floor)`) only inside a per-z-bin radial band
`[minR−wall−pad, maxR+pad]` computed by `raycast_bound.wgsl` (129-u32 layout: global max,
64× bin-max, 64× bin-min — atomicMin slots pre-seeded 0x7F7FFFFF by `boundInit`). Three
artifacts must change together: the kernel's output layout, `RaycastController` (BOUND_RESULT_BYTES,
boundInit pattern, the two copyBufferToBuffer calls, binding 10 lutUniform) and the WGSL
`RcLut`/`band_for_z` in `preview_raycast.wgsl`. Step caps bound FIELD EVALS (not step size);
quality levers: `setQuality({stepCapInteractive, stepCapAccum, featureFloorInteractive, featureFloor, maxSamples})`.
**Probe trap:** never take hit-field readbacks after a mouse drag — camera INERTIA keeps
drifting between reads and fabricates huge phantom "wrong surface" rates; measure with a
stationary camera (see `e2e/_raycast_quality_diag.mjs`).

**Supabase null safety:** `supabase` client in `services/supabase.ts` can be `null`.
Always call `isSupabaseConfigured()` before any `supabase.*` call.

**Export tier gating:** `checkExportAllowed()` in `useExportTier.ts` is client-side.
The `increment_exports` Supabase RPC uses `auth.uid()` server-side — users can only
increment their own count. Free tier: 10 exports/month, 84×42 max resolution.

**ConsolePatch:** Installed in `main.tsx` before React mounts. All `console.*` output
is intercepted for the debug overlay. Don't assume native console behaviour in dev.

**ESLint strict:** 0 max-warnings policy. Any ESLint warning fails `npm run lint`.

**WGSL alignment:** `vec3<f32>` requires 16-byte alignment in compute shader structs.
Missing padding causes silent data corruption in the export pipeline.

**Adding a new style — required update order:**
1. `src/styles/registry.ts` — register `id` (must be unique, current max is 19), `shaderName`, `params`, `advancedParams`
2. WGSL shader in `src/renderers/webgpu/` — the GPU implementation (drives all live rendering)
3. `src/geometry/styles.ts` — CPU function (export pipeline only; may be deprecated soon)
4. If step 3 is added, regenerate `src/geometry/__fixtures__/styleGoldenValues.json`

**Style IDs are permanent:** IDs in `STYLE_REGISTRY` are serialized into localStorage
presets and the GPU geometry buffer. Never renumber existing styles. Use ID ≥ 20 for new ones.

**CPU style functions are export-only:** `src/geometry/styles.ts` is only used by the
export pipeline (STL/3MF generation). Live rendering runs entirely on WGSL shaders.
The CPU layer may be removed once the export pipeline migrates to GPU.

**Export formats:** Supports binary STL and 3MF. Binary STL is default (80% smaller,
10× faster than ASCII). 3MF via `src/geometry/exporters/export3MF.ts`.

## Export Pipeline

Four distinct export paths exist. The parametric pipeline is the current best path.

### 1. Legacy CPU — `useExport.ts`
`buildPotMesh()` (CPU, `src/geometry/meshBuilder.ts`) → `downloadSTL()`.
Uniform nTheta×nZ grid. Uses `src/geometry/styles.ts` for style radius evaluation.
**Targeted for deprecation** once all paths are fully GPU.

### 2. GPU Grid — `useGPUExport.ts` → `ExportComputer`
Uniform grid computed entirely on GPU via `calc_vertices` + `calc_indices` compute kernels.
Shaders: `common.wgsl` + `styles.wgsl` + `pot_export.wgsl` + `scan_profile.wgsl`.

- **Adaptive Z-LUT**: optionally scans 100k profile points to build a Z-row lookup table,
  concentrating rows at high-curvature areas before the full mesh dispatch
- **Tiling**: Z-axis auto-splits into ≤16MB tiles when mesh exceeds GPU buffer limits
  (up to 2000 tiles; index buffer is the bottleneck at ~48 bytes × nTheta × nZ)
- **Decimation**: optional `meshoptimizer` (lazy-loaded) targets 2M triangles;
  `lockBorders: true` is critical — required to preserve tile seam vertices for stitching

### 3. Adaptive Subdivision — `useAdaptiveExport.ts` → `AdaptiveExportComputer`
GPU feature extraction → constrained base mesh → GPU triangle subdivision.
Stages: `FeatureExtractionComputer` → `ImportanceMapComputer` → `ConstrainedTriangulator` (CDT) → `AdaptiveExportComputer`.
Shaders: `feature_extract.wgsl`, `importance_map.wgsl`, `adaptive_mesh.wgsl`.

### 4. Parametric — `useParametricExport.ts` → `ParametricExportComputer` ← current best
8-stage CPU+GPU hybrid. Produces a non-uniform curvature-adaptive grid where feature
edges (style ridges, peaks) are actual mesh edges — not approximated by the grid.

```
1. GPU  — 16-strip curvature sampling (4096 samples/strip) → gradient + curvature profiles
2. CPU  — Feature detection: gradient zero-crossings → peak/valley classification with
           confidence scoring (Strategy 3 / inflection-point detection removed — was noise source)
3. CPU  — Uniform base grid sized to user triangle budget (LOCAL_ONLY_OUTER_ADAPTATION=true;
           CDF-adaptive spacing removed v16.10 — was causing visible "density band" artifacts)
4. GPU  — Per-row probing (4096 samples/row): 5-point stencil + GSS sub-sample for exact
           peak/valley U positions
5. CPU  — Kind-separated chain linking: peaks and valleys linked independently into continuous
           (u,t) polylines (kind-separation added v16.3 — valleys were being orphaned otherwise)
6. CPU  — Chain vertices appended to grid (never merged into columns); per-row interpolation
           fills multi-row chain gaps; row-band strip triangulation enforces chain edges as mesh
           constraints without post-hoc edge flipping (stitch fans removed v16.9)
7. GPU  — Re-snap chain vertices: re-probes each peak/valley to exact GPU position (v13.0)
8. GPU  — Evaluate full mesh → 3D positions (positions only, no normals in buffer)
```

Shaders: `common.wgsl` + `styles.wgsl` + `adaptive_mesh.wgsl`.

### Shared Export Gotchas

**Shader stripping:** `stripShaderCode()` in `src/utils/shaderStripper.ts` removes all
inactive style functions before GPU upload. Only the current style's WGSL ships to the device.

**Vertex buffer layout:** Export buffers store position only (`vec3`, 3 floats/vertex,
12 bytes). No normals — STL normals are computed per-face from the triangle geometry.

**Workgroup dispatch cap:** `getDispatchSize()` in `ExportComputer` wraps dispatches into
a 2D grid when `totalWorkgroups > 65535` (WebGPU per-dimension limit).

**No CPU fallback on WebGL:** Export requires WebGPU. If the renderer fell back to WebGL,
GPU export paths are unavailable; only the legacy CPU path (`useExport`) will work.

## Testing

- Unit tests: `src/**/*.test.ts` — Vitest + jsdom + @testing-library/react
- Setup file: `src/test/setup.ts`
- E2E: `playwright.config.ts` — Chromium + Edge only, both with `--enable-unsafe-webgpu`
- Coverage thresholds are commented out in `vite.config.ts` (can be re-enabled)
- Golden fixtures: `src/geometry/__fixtures__/styleGoldenValues.json` and `topologySnapshots.json`
  — regenerate when style function outputs intentionally change

**E2E requires a running dev server** — `webServer` is commented out in `playwright.config.ts`.
Start `npm run dev` first, then run `npm run test:e2e` in a second terminal.

## Deployment

Hosted on Cloudflare Pages. Wrangler handles edge functions for auth callbacks.
`npm run deploy` builds and pushes. Env vars set in Cloudflare Pages dashboard.

## Deep Context

For parametric pipeline engineering knowledge, bug patterns, critical constants,
and architectural decisions that must not be reverted, see `../docs/AGENT_CONTEXT_DISTILLED.md`.

For agent workflow protocol and journal rules, see `../agents.md`.

For GitNexus code-intelligence directives, see the root `../CLAUDE.md` (always loaded).
