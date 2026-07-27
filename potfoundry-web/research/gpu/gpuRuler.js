// gpuRuler.js — GPU throughput for the SOUND ruler. RESEARCH ONLY, served by the Vite dev server.
//
// WHY THIS EXISTS. The binding cost of a certificate is `area / tol^2`: certifying at 10 um means sampling
// at ~10 um however good the mesh is. On CPU that is ~1.4 ms/triangle (30 min for GeometricStar's 885k).
// The fix is throughput, NOT a cheaper metric — so this ports the *same* sound computation to the GPU
// rather than substituting a ray-gap measure, which would trade the guarantee away (a ray gap is the
// perpendicular distance divided by cos(incidence): unbounded at grazing angles, i.e. worst exactly on the
// steep features where every failure in the 2026-07-27 re-audit lives).
//
// WHY IT RUNS IN A BROWSER. There is no Node WebGPU binding in this repo (`@webgpu/types` is types-only),
// and WebGPU needs a secure context. The Vite dev server serves the app's own modules, so the page can
// import ShaderManager/styles.ts directly and compare GPU against the EXACT CPU function the auditor uses.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SOUNDNESS ARGUMENT FOR A GPU SCREEN
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The screen computes, per triangle, the max over a barycentric lattice of the RADIAL-FOOT distance. The
// radial foot is a genuine surface point, so that distance is an UPPER bound on dist(p, S). Therefore
//
//        gpuMax + covRad/n + margin  <=  tol   =>   the triangle is certified clean
//
// with no false negatives: anything the screen clears really is clean. Everything else goes to the CPU for
// the exact treatment. On these meshes the vast majority clears, so the CPU only sees the tail.
//
// `margin` covers f32. MEASURED, not assumed: `parity()` below compares GPU style_radius against CPU
// STYLE_FUNCTIONS over 73k-131k samples per style. All 20 styles agree to <= 0.48 um away from jump loci.
// BasketWeave reads 1999.967 um ON its 16 theta-jumps (k*2pi/16) and 0.042 um off them — a tie-break at a
// measure-zero discontinuity where the value is genuinely two-valued, not a disagreement about the surface.
// A 1 um margin therefore covers f32 with >2x headroom; jump loci are handled by the closure, not here.

const U = () => GPUBufferUsage;

/** Kernel preamble: the style environment expects the consumer to supply these. */
export const PREAMBLE = `
@group(0) @binding(0) var<storage, read> style_params: array<f32>;
@group(0) @binding(1) var<storage, read> samples: array<f32>;
@group(0) @binding(2) var<storage, read_write> outR: array<f32>;
@group(0) @binding(3) var<storage, read> ufield: array<f32>;
fn style_param(idx: u32) -> f32 { if (idx >= arrayLength(&style_params)) { return 0.0; } return style_params[idx]; }
fn style_params_active() -> bool { return arrayLength(&style_params) > 0u; }
fn getf(idx: u32) -> f32 { if (idx >= arrayLength(&ufield)) { return 0.0; } return ufield[idx]; }
fn geti(idx: u32) -> i32 { return i32(getf(idx)); }
`;

/**
 * Evaluate style_radius at (theta, t, r0) triples.
 * The `ufield[0] > 1e30` branch can never fire; it exists to keep binding 3 LIVE, because `layout:'auto'`
 * drops a binding the style function happens not to reference and the bind group then fails validation.
 */
// 2-D DISPATCH IS NOT OPTIONAL. maxComputeWorkgroupsPerDimension is 65535, so a 1-D dispatch caps at
// 65535*64 = 4,194,240 invocations — and exceeding it does not throw where you can see it, the pass is
// simply dropped and the output buffer stays zero. That reads as an absurdly fast, perfectly wrong result
// (measured: "8.7 billion evals/sec" with an all-zero output). ufield[4] carries the row stride.
export const KERNEL_EVAL = PREAMBLE + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let stride = u32(ufield[4]);
  let i = gid.y * stride + gid.x;
  if (i >= arrayLength(&outR)) { return; }
  var r = style_radius(0, samples[i*3u], samples[i*3u+1u], samples[i*3u+2u]);
  if (ufield[0] > 1.0e30) { r = -1.0; }
  outR[i] = r;
}`;

/** Workgroup counts for a 1-D problem of `n` invocations, respecting the 65535-per-dimension limit. */
export function dispatchDims(n, wgSize = 64) {
  const MAXD = 65535;
  const total = Math.ceil(n / wgSize);
  if (total <= MAXD) return { x: total, y: 1, stride: total * wgSize };
  const x = MAXD;
  return { x, y: Math.ceil(total / x), stride: x * wgSize };
}

export const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };

export async function makeDevice() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  return adapter.requestDevice();
}

const camel = (s) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

/** Registry defaults + the packed 48-float GPU payload + the CPU function, for one style. */
export async function styleContext(styleName) {
  const sp = await import('/src/utils/styleParams.ts');
  const st = await import('/src/geometry/styles.ts');
  const ty = await import('/src/geometry/types.ts');
  const reg = await import('/src/styles/registry.ts');
  const sm = await import('/src/renderers/webgpu/ShaderManager.ts');
  const cfg = reg.STYLE_REGISTRY[styleName];
  if (!cfg) throw new Error(`unknown style ${styleName}`);
  const opts = {};
  for (const g of [cfg.params, cfg.advancedParams]) {
    if (!g) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') opts[camel(k)] = v.default;
  }
  const merged = { ...ty.DEFAULT_STYLE_PARAMS[styleName], ...opts };
  const [numId, params48] = sp.buildStyleParamPayload(styleName, merged);
  return {
    numId, params48, merged,
    cpuFn: st.STYLE_FUNCTIONS[styleName],
    env: sm.ShaderManager.getInstance().getStyleEnvironmentWGSL(numId),
  };
}

function upload(dev, arr) {
  const b = dev.createBuffer({ size: Math.max(16, arr.byteLength), usage: U().STORAGE | U().COPY_DST, mappedAtCreation: true });
  new Float32Array(b.getMappedRange()).set(arr);
  b.unmap();
  return b;
}

/** Run a compute kernel over `samples` (3 floats each) and read back one f32 per sample. */
export async function dispatch(dev, ctx, kernel, samples, nOut) {
  const mod = dev.createShaderModule({ code: ctx.env + '\n' + kernel });
  const info = await mod.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(`WGSL: ${errs[0].lineNum}: ${errs[0].message}`);
  const pipe = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
  const bP = upload(dev, new Float32Array(ctx.params48));
  const bS = upload(dev, samples);
  const dd = dispatchDims(nOut);
  const bU = upload(dev, new Float32Array([DIMS.H, DIMS.Rt, DIMS.Rb, 4, dd.stride, 0, 0, 0]));
  const bO = dev.createBuffer({ size: nOut * 4, usage: U().STORAGE | U().COPY_SRC });
  const bR = dev.createBuffer({ size: nOut * 4, usage: U().MAP_READ | U().COPY_DST });
  const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: bP } }, { binding: 1, resource: { buffer: bS } },
    { binding: 2, resource: { buffer: bO } }, { binding: 3, resource: { buffer: bU } }] });
  const enc = dev.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipe); pass.setBindGroup(0, bg);
  pass.dispatchWorkgroups(dd.x, dd.y); pass.end();
  enc.copyBufferToBuffer(bO, 0, bR, 0, nOut * 4);
  dev.queue.submit([enc.finish()]);
  await bR.mapAsync(U().MAP_READ);
  const out = new Float32Array(bR.getMappedRange().slice(0));
  bR.unmap();
  [bP, bS, bU, bO, bR].forEach((b) => b.destroy());
  return out;
}

/**
 * GPU-vs-CPU parity for one style. `offsetFrac` shifts the theta grid off exact lattice positions; pass a
 * non-zero value to avoid landing on a discontinuity, where the surface is genuinely two-valued and the two
 * implementations may legitimately choose different branches.
 */
export async function parity(dev, styleName, NU = 512, NV = 256, offsetFrac = 0.37) {
  const pr = await import('/src/geometry/profile.ts');
  const ctx = await styleContext(styleName);
  const { H, Rb, Rt, expn } = DIMS;
  const n = NU * NV;
  const samples = new Float32Array(n * 3);
  const cpu = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < NU; i += 1) {
    for (let j = 0; j < NV; j += 1) {
      const th = (2 * Math.PI * (i + offsetFrac)) / NU;
      const z = (H * j) / (NV - 1);
      const r0 = pr.baseRadius(z, H, Rb, Rt, expn, ctx.merged);
      samples[k * 3] = th; samples[k * 3 + 1] = z / H; samples[k * 3 + 2] = r0;
      cpu[k] = ctx.cpuFn(th, z, r0, H, ctx.merged);
      k += 1;
    }
  }
  const t0 = performance.now();
  const gpu = await dispatch(dev, ctx, KERNEL_EVAL, samples, n);
  const ms = performance.now() - t0;
  let maxAbs = 0; let over1 = 0;
  for (let i = 0; i < n; i += 1) {
    const d = Math.abs(gpu[i] - cpu[i]);
    if (d > maxAbs) maxAbs = d;
    if (d > 0.001) over1 += 1;
  }
  return { style: styleName, n, ms: +ms.toFixed(1), maxDiffUm: +(maxAbs * 1000).toFixed(4), over1um: over1,
           evalsPerSec: Math.round(n / (ms / 1000)) };
}
