# WebGPU Uniform-Driven Preview — Implementation Roadmap

**Goal:** Deliver a buttery-smooth, *uniform-only* WebGPU interactive preview for PotFoundry Lite that renders ~**1M triangles** with first-class CAD viewer features, progressive LOD, robust fallback, full tests, and CI performance guards. This plan is written for an advanced VS Code Copilot setup to implement end-to-end.

---

## Table of Contents

- [Objective](#objective)
- [Architecture \& Decisions (ADR)](#architecture--decisions-adr)
- [Deliverables \& Milestones](#deliverables--milestones)
  - [M0 — Foundations \& Scaffolding](#m0--foundations--scaffolding)
  - [M1 — Uniform-Only Render Path (Zero-Buffer Draw)](#m1--uniform-only-render-path-zero-buffer-draw)
  - [M2 — CAD Viewer Feature Set](#m2--cad-viewer-feature-set)
  - [M3 — Compute-Then-Draw \[Optional but Recommended\]](#m3--compute-then-draw-optional-but-recommended)
  - [M4 — QA, Performance Hardening \& CI/CD](#m4--qa-performance-hardening--cicd)
- [File Layout](#file-layout)
- [Uniform Buffer Layout](#uniform-buffer-layout)
- [PostMessage Protocol (Python → JS)](#postmessage-protocol-python--js)
- [Implementation Notes (enforced by Copilot)](#implementation-notes-enforced-by-copilot)
- [Testing Strategy](#testing-strategy)
- [Performance Budgets](#performance-budgets)
- [Risks \& Mitigations](#risks--mitigations)
- [Definition of Done](#definition-of-done)
- [Appendix A — WGSL Shader Skeleton (Zero-Buffer Draw)](#appendix-a--wgsl-shader-skeleton-zero-buffer-draw)
- [Appendix B — JS Preview Scaffold (WebGPU Core)](#appendix-b--js-preview-scaffold-webgpu-core)
- [Appendix C — Streamlit Component Wrapper](#appendix-c--streamlit-component-wrapper)

---

## Objective

- Replace the current CPU/Plotly preview with a **client-side WebGPU renderer**.
- Compute vertex positions/normals **in the vertex shader** from a small set of parameters (uniforms). **No per-change vertex buffer uploads.**
- Ship **core CAD features**: orbit/pan/zoom with inertia, section cuts, wireframe, grid/axes, ortho/persp, x-ray/matcap/PBR, screenshots, measurements, saved views.
- Provide **progressive resolution** during interaction and a **fallback** to Plotly/WebGL2 when WebGPU is unavailable.
- Maintain **clean separation**: Python for generation/export; browser for preview.
- **Tested and performant** with CI perf guards.

---

## Architecture & Decisions (ADR)

1. **Parametric, fixed-topology surface**
   - Represent the pot as an indexed grid of **nθ × nᶻ** cells (2 triangles per cell).
   - Positions/normals are computed on-GPU per frame from uniforms (no CPU meshing).

2. **Two rendering modes**
   - **Zero-buffer draw (default for M1):** derive `(u, v)` from `@builtin(vertex_index)`; call `draw(6 * nθ * nᶻ)`.
   - **Compute-then-draw (M3):** compute shader fills position/normal buffers only on parameter changes; draw indexed with a static index buffer.

3. **Parameter updates via UBO**
   - Single **uniform buffer object** (UBO) with 16-byte alignment; update only when sliders change using `queue.writeBuffer`.
   - Shader receives all parameters (geometry, style, grid size).

4. **Integration**
   - Embed a self-contained preview page as a Streamlit component (or web module) and communicate via **`postMessage`** for parameter/camera/tool updates.

5. **Fallbacks**
   - If `navigator.gpu` is absent or limits are too low → automatic fallback to existing Plotly/WebGL2 preview.
   - Mobile: cap resolution automatically.

6. **Testing/CI**
   - Unit: shader math parity, UBO packing.
   - Integration: Python↔JS bridge.
   - E2E: Playwright with WebGPU-enabled browser; perf budgets enforced in CI.

---

## Deliverables & Milestones

### M0 — Foundations & Scaffolding
**Duration:** 1–2 days

- Create `pfui/webgpu_preview/` with:
  - `index.html`: secure-context canvas host
  - `preview.js`: WebGPU init, pipelines, UBO, draw loop
  - `shaders.wgsl`: vertex/fragment + compute kernel (stub)
  - `controls.js`: orbit/pan/zoom with inertia; section planes; screenshot
- Add Streamlit glue:
  - `pfui/webgpu_component.py`: embed `index.html` and bridge params via `postMessage`.
- Feature detection (`if (!('gpu' in navigator))`) and **hard fallback** to Plotly.

**Acceptance:**
- WebGPU canvas mounts in the app.
- Fallback path works when WebGPU is not present.

---

### M1 — Uniform-Only Render Path (Zero-Buffer Draw)
**Duration:** 2–4 days

- Implement **UBO struct** (height, Rt/Rb, flare exponent, twist params, style params, grid sizes).
- **Vertex shader**:
  - Derive cell corner from `@builtin(vertex_index)`.
  - Compute `(u, v)` in `[0,1]` and evaluate surface `p(u,v)`.
  - Compute normals via **central differences** (`(u±Δ, v)`, `(u, v±Δ)`). 
- **Fragment shader**: Lambert + rim lighting initially.
- **Param bridge**: slider change → pack floats (16B-aligned) → `queue.writeBuffer(paramsUBO, 0, ...)` → `draw()`.
- **Camera**: orbit/pan/zoom with inertia and **fit-to-object**.
- **Progressive LOD**: while sliders move → ¼ resolution; on idle (~200 ms debounce) → full resolution.
- **Render only when needed** (param or camera changes).

**Acceptance:**
- 1M triangles interactive on desktop; slider → near-instant redraw.
- CPU remains cool; no per-frame CPU geometry uploads.

---

### M2 — CAD Viewer Feature Set
**Duration:** 3–6 days

- **Navigation & Views**
  - Toggle **perspective/orthographic**.
  - View presets: top/front/right/isometric; reset/fit.
  - **Grid** and **axes gizmo** (overlay canvas or tiny extra pass).

- **Display Modes**
  - Solid, **wireframe** (barycentric or line pass), x-ray (alpha), **matcap** (texture), lightweight PBR with ibl.
  - Toggle AO/curvature placeholders for future upgrades.

- **Sections & Clipping**
  - Up to two clip planes; UI toggles and sliders.
  - Section plane gizmo (+ numeric entry).

- **Measurement**
  - Pick two points on surface (ray → UV solve or iterative projection) and show distance.
  - Display bounding dimensions.

- **Screenshot/Export**
  - PNG snapshot with camera and parameters (JSON in metadata or a sidecar).

- **Quality Controls**
  - Single slider for grid density and FXAA on/off.
  - Mobile presets (cap grid and effects).

**Acceptance:**
- Feature parity with modern CAD viewers; no jank toggling modes/sections.

---

### M3 — Compute-Then-Draw (Optional but Recommended)
**Duration:** 3–5 days

- **Compute pipeline**: on parameter changes, dispatch to fill `(nθ+1)*(nᶻ+1)` **position + normal** storage buffers.
- **Static index buffer** (uint32) created once.
- Render pass binds VBO/IBO and calls `drawIndexed(...)`.
- Upgrade lighting: environment map sampling (matcap first, then simple IBL).

**Acceptance:**
- Same UX with compute path; easier wireframe/advanced shading.
- Measurable CPU/GPU headroom at high resolutions.

---

### M4 — QA, Performance Hardening & CI/CD
**Duration:** 2–4 days

- **Unit tests**
  - WGSL math parity (JS/Python mirrors of `r_base`, twist, superformula).
  - Parameter packing & 16B padding tests.
  - Camera math & section plane math.

- **Integration tests**
  - Streamlit ↔ iframe `postMessage` round-trips.
  - Hot reload stress: re-mount safe, listener dedupe.

- **E2E tests (Playwright)**
  - With WebGPU on: first frame < **300 ms** (desktop), FPS > **45** at 1M tris, param latency < **25 ms**.
  - With WebGPU off: fallback preview renders and responds.

- **Performance budgets**
  - GPU frame time (full res) **< 10 ms** on mid-range desktop.
  - CPU time on slider change **< 2 ms**.
  - VRAM **< 350 MB** at 1M tris (positions/normals + indices + double-buffering).

- **CI**
  - GitHub Actions job launches Playwright with Chrome WebGPU flags.
  - Collect trace/screenshot artifacts; fail build on perf regress (>10%).

- **Docs**
  - README “Preview” section + troubleshooting (secure context/flags).

**Acceptance:**
- All tests pass locally & in CI; docs published.

---

## File Layout

```
pfui/
  webgpu_preview/
    index.html             # Canvas host + overlay UI hooks
    preview.js             # Init, pipelines, UBO, draw loop, perf HUD
    controls.js            # Orbit/pan/zoom inertia; sections; keybinds
    shaders.wgsl           # vs/fs; compute kernel for M3
    matcaps/*.png          # Optional for M2
  webgpu_component.py      # Streamlit embedding & postMessage bridge
```

---

## Uniform Buffer Layout

> Keep 16-byte alignment. Consider packing into `vec4` slots to avoid misalignment.

```
vec4(H, Rt, Rb, expn)
vec4(spin_turns, spin_phase, spin_curve, pad0)
vec4(sf_m_base, sf_m_top, sf_n1, sf_n2)
vec4(sf_n3, pad1, pad2, pad3)
u32 nTheta; u32 nZ; u32 padA; u32 padB   // can also be push-constants or a separate block
```

Provide a single packing helper in JS to map a params object → `Float32Array`/`Uint32Array` with correct byte offsets.

---

## PostMessage Protocol (Python → JS)

```jsonc
// Parameter update
{
  "type": "params",
  "payload": {
    "H": 120, "Rt": 70, "Rb": 45, "expn": 1.1,
    "spin_turns": 0.0, "spin_phase": 0.0, "spin_curve": 1.0,
    "style": "SuperformulaBlossom",
    "sf": {"m_base":6,"m_top":10,"n1":0.35,"n2":0.8,"n3":0.8},
    "grid": {"nTheta":1000,"nZ":500},
    "quality": "full|quarter"
  }
}

// Camera actions
{"type":"camera","payload":{"action":"fit"}}
{"type":"camera","payload":{"preset":"iso"}}

// Tools (sections, etc.)
{"type":"tool","payload":{"section":{"plane":"Z","offset":35.0}}}
```

---

## Implementation Notes (enforced by Copilot)

- **Zero-buffer draw** (M1): derive vertices in the vertex shader using `@builtin(vertex_index)`; `draw(6 * nθ * nᶻ)`.
- **Normals** via central differences (`u±Δ`, `v±Δ`). Clamp edges.
- **LOD strategy:** while a slider is *active*, halve both axes (¼ tris). On idle (200 ms), restore full grid.
- **Render loop:** only draw on param or camera changes; otherwise skip GPU work.
- **Controls/UX:**
  - Orbit (LMB), Pan (RMB/Alt+LMB), Zoom (wheel/pinch) with inertia.
  - Presets: `1` top, `2` front, `3` right, `4` iso, `0` fit.
  - Grid/axes as overlay to avoid shader complexity.
- **Wireframe:** barycentric (compute path) or a dedicated line pass.
- **Matcap/PBR:** begin with matcap; upgrade to simple IBL in M3.
- **Fallback:** Auto-detect; mount Plotly/WebGL2 when WebGPU unavailable.
- **Mobile:** cap grid (e.g., ≤ 250–500k tris) and disable heavy effects.

---

## Testing Strategy

**Unit**
- Parameter packing alignment (byte-accurate tests).
- WGSL math parity vs JS/Python mirrors for `r_base`, twist, superformula.
- Camera & section plane math.

**Integration**
- Streamlit ↔ iframe: `postMessage` send/receive; hot reload re-mount safety.

**E2E (Playwright)**
- WebGPU on: first frame < 300 ms; param latency < 25 ms; FPS > 45 at 1M tris.
- WebGPU off: fallback mounts and responds.

**Perf Telemetry**
- HUD toggle showing: frame time, grid size, tris, GPU timing (timestamp queries when available), UBO writes/frame.
- CI guard: fail if frame time regression > 10%.

---

## Performance Budgets

- **GPU frame time (full res):** < 10 ms on mid-range desktop.
- **Param-to-frame latency:** < 25 ms.
- **CPU per change:** < 2 ms.
- **VRAM budget:** < 350 MB at 1M tris (pos+normals+indices + overhead).

---

## Risks & Mitigations

- **Browser support variability** → Feature detection + robust fallback; doc flags/HTTPS.
- **UBO padding bugs** → Centralized packer + unit tests + fixed struct layout.
- **Shader drift vs Python geometry** → Parity tests & golden parameter sets.
- **Mobile performance** → Auto quality caps; disable heavy modes by default.

---

## Definition of Done

- WebGPU preview is default on supported browsers; **automatic fallback** verified.
- Uniform-only path delivers **interactive ~1M** tris; progressive LOD during interaction.
- CAD features: navigation, grid/axes, section cuts (2 planes), wireframe, x-ray, matcap, screenshots, ortho/persp, saved views, measurements.
- Unit, integration, E2E tests pass **locally and in CI**; performance budgets enforced.
- Documentation updated with usage and troubleshooting.

---

## Appendix A — WGSL Shader Skeleton (Zero-Buffer Draw)

```wgsl
struct Params {
  H: f32; Rt: f32; Rb: f32; expn: f32;
  spin_turns: f32; spin_phase: f32; spin_curve: f32; _pad0: f32;
  sf_m_base: f32; sf_m_top: f32; sf_n1: f32; sf_n2: f32;
  sf_n3: f32; _pad1: vec3<f32>;
  nTheta: u32; nZ: u32; _padA: u32; _padB: u32;
};
@group(0) @binding(0) var<uniform> P: Params;

fn r_base(t: f32) -> f32 {
  return mix(P.Rb, P.Rt, pow(max(t, 0.0), max(P.expn, 1e-4))) * 0.5;
}

fn superformula(theta:f32,m:f32,n1:f32,n2:f32,n3:f32)->f32 {
  let c = pow(abs(cos(m*theta*0.25)), n2);
  let s = pow(abs(sin(m*theta*0.25)), n3);
  let d = pow(c + s, 1.0/max(n1,1e-6));
  return select(0.0, 1.0/d, d != 0.0);
}

fn spin_angle(t:f32)->f32 {
  return P.spin_phase + (P.spin_turns * 6.28318530718) * pow(t, max(P.spin_curve, 0.1));
}

fn r_outer_sf(theta:f32, t:f32, r0:f32)->f32 {
  let m  = mix(P.sf_m_base, P.sf_m_top, pow(t, 1.2));
  let n1 = P.sf_n1 + 0.15*t;
  let n2 = P.sf_n2 + 0.6*t;
  let n3 = P.sf_n3 + 0.6*(1.0 - t);
  let rf = superformula(theta, m, n1, n2, n3);
  return r0 * (0.90 + 0.35*rf);
}

fn surf(u:f32, v:f32)->vec3<f32> {
  let t = clamp(v, 0.0, 1.0);
  let z = t * P.H;
  let r0 = r_base(t);
  let th = u * 6.28318530718 + spin_angle(t);
  let r  = r_outer_sf(th, t, r0);
  return vec3<f32>(r * cos(th), r * sin(th), z);
}

struct VSOut {
  @builtin(position) pos: vec4<f32>;
  @location(0) N: vec3<f32>;
  @location(1) P3: vec3<f32>;
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  let cells_x = P.nTheta;
  let cells_y = P.nZ;
  let verts_per_cell = 6u;
  let cell   = vid / verts_per_cell;
  let corner = vid % verts_per_cell;
  let cx = cell % cells_x;
  let cy = cell / cells_x;

  let u0 = f32(cx) / f32(cells_x);
  let v0 = f32(cy) / f32(cells_y);
  let u1 = f32(cx + 1u) / f32(cells_x);
  let v1 = f32(cy + 1u) / f32(cells_y);

  var u:f32; var v:f32;
  if (corner==0u){u=u0; v=v0;} else if (corner==1u){u=u0; v=v1;}
  else if (corner==2u){u=u1; v=v0;} else if (corner==3u){u=u1; v=v0;}
  else if (corner==4u){u=u0; v=v1;} else {u=u1; v=v1;}

  let p  = surf(u, v);
  let du = 1.0 / max(f32(cells_x), 2.0);
  let dv = 1.0 / max(f32(cells_y), 2.0);
  let pu = surf(min(u+du, 1.0), v) - p;
  let pv = surf(u, min(v+dv, 1.0)) - p;
  let N  = normalize(cross(pu, pv));

  var o:VSOut;
  o.pos = vec4<f32>(p, 1.0);
  o.N = N;
  o.P3 = p;
  return o;
}

@fragment
fn fs_main(@location(0) N: vec3<f32>, @location(1) P3: vec3<f32>) -> @location(0) vec4<f32> {
  let L = normalize(vec3<f32>(0.5, 0.7, 1.0));
  let ndl = max(dot(normalize(N), L), 0.0);
  let diff = 0.15 + 0.85 * ndl;
  let rim  = pow(1.0 - abs(dot(normalize(N), normalize(P3))), 2.0);
  return vec4<f32>(vec3<f32>(diff) + rim * 0.25, 1.0);
}
```

---

## Appendix B — JS Preview Scaffold (WebGPU Core)

```js
// preview.js
let device, context, format, pipeline, paramsBuffer, bindGroup;
let nTheta = 1000, nZ = 500; // default grid

const paramsSize = 256; // 16B-aligned struct size
const data = new ArrayBuffer(paramsSize);
const f32 = new Float32Array(data);
const u32 = new Uint32Array(data);

async function init(canvas) {
  const adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();
  context = canvas.getContext('webgpu');
  format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const shaderModule = device.createShaderModule({ code: await (await fetch('shaders.wgsl')).text() });
  pipeline = await device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' }
  });

  paramsBuffer = device.createBuffer({ size: paramsSize, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: paramsBuffer } }] });

  // Default params
  setParams({
    H:120, Rt:70, Rb:45, expn:1.1,
    spin_turns:0.0, spin_phase:0.0, spin_curve:1.0,
    sf_m_base:6.0, sf_m_top:10.0, sf_n1:0.35, sf_n2:0.8, sf_n3:0.8,
    grid:{ nTheta, nZ }
  });

  draw();
}

function setParams(p) {
  // pack floats (match WGSL struct & alignment)
  f32[0]=p.H; f32[1]=p.Rt; f32[2]=p.Rb; f32[3]=p.expn;
  f32[4]=p.spin_turns; f32[5]=p.spin_phase; f32[6]=p.spin_curve; /* pad */
  f32[8]=p.sf_m_base; f32[9]=p.sf_m_top; f32[10]=p.sf_n1; f32[11]=p.sf_n2;
  f32[12]=p.sf_n3; /* pad */
  if (p.grid){ nTheta=p.grid.nTheta ?? nTheta; nZ=p.grid.nZ ?? nZ; }
  u32[16]=nTheta; u32[17]=nZ;
  device.queue.writeBuffer(paramsBuffer, 0, data);
}

function draw() {
  const encoder = device.createCommandEncoder();
  const colorView = context.getCurrentTexture().createView();
  const depthTex = device.createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: colorView, clearValue: { r:0.05,g:0.05,b:0.07,a:1 }, loadOp:'clear', storeOp:'store' }],
    depthStencilAttachment: { view: depthTex.createView(), depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' }
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6 * nTheta * nZ);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

window.addEventListener('message', (e) => {
  const { type, payload } = e.data || {};
  if (type === 'params') {
    setParams(payload);
    draw();
  }
});

export { init, setParams, draw };
```

---

## Appendix C — Streamlit Component Wrapper

```python
# pfui/webgpu_component.py
import json
import streamlit as st

_HTML = '''
<iframe id="pf_wgpu" srcdoc="{doc}" style="width:100%;height:{h}px;border:0;"></iframe>
<script>
const frame = document.getElementById('pf_wgpu');
window.addEventListener('message', (e) => {
  if (e.data && e.data.__pfParams) {
    frame.contentWindow.postMessage({ type:'params', payload: e.data.__pfParams }, '*');
  }
});
</script>
'''

def render_webgpu_preview(params: dict, height: int = 600):
  doc = f'''
<!doctype html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#0a0a0a;">
<canvas id="c" style="display:block;width:100vw;height:100vh;"></canvas>
<script type="module">
  import {{ init }} from './preview.js'; // adjust path as hosted
  const canvas = document.getElementById('c');
  init(canvas);
</script>
</body></html>
'''
  st.components.v1.html(_HTML.format(doc=doc.replace('"','&quot;'), h=height), height=height)
  st.write(f"<script>window.postMessage({{__pfParams: {json.dumps(params)} }}, '*');</script>", unsafe_allow_html=True)
```

---

**End of document.**
