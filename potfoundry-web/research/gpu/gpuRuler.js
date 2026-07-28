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

/**
 * Run `fn` with a validation error scope and THROW if WebGPU rejected anything inside it.
 *
 * WHY THIS IS NOT OPTIONAL. WebGPU validation failures are asynchronous and non-fatal: an invalid bind group
 * does not throw at the call site, it makes the subsequent dispatch a no-op and leaves the output buffer at
 * its initial zeros. That is indistinguishable from a real measurement of zero, and this file has now been
 * bitten by it twice — once by a 1-D dispatch exceeding maxComputeWorkgroupsPerDimension (reported as
 * "8.7 billion evals/sec"), once by `layout:'auto'` dropping an unreferenced binding (the structure map read
 * 0.000 um bulge for all 20 styles, including ones with 2 mm of relief). Both were silent.
 *
 * An error scope converts that entire class into a loud failure at the point of origin, with Dawn's own
 * message. It costs one round-trip per dispatch and it is the difference between a wrong number and no number.
 */
/**
 * Compile-once pipeline cache, keyed by device then by WGSL source.
 *
 * WHY. `screenTriangles` used to `createShaderModule` + `createComputePipeline` on EVERY call, and the
 * cascade calls it once per CHUNK. That was tolerable while chunks held thousands of triangles, but the
 * eval-budget fix (§15f) correctly shrank them: at n=768 with Gauss-Newton one triangle costs ~7.4 M rA
 * evals, so a 4e7-eval chunk holds ~5 triangles — meaning a style with 50 000 survivors at that level
 * recompiled the same shader ~10 000 times. MEASURED: RippleInterference lost the device 12 minutes in,
 * three times running, on settings that were otherwise safe.
 *
 * The two fixes interact, which is why the first one alone did not help: making chunks smaller is right for
 * the watchdog, but it multiplies compile count unless the pipeline is cached. WeakMap on the device so a
 * lost device's pipelines are collectable rather than pinned.
 */
const PIPE_CACHE = new WeakMap();
async function getPipeline(dev, code) {
  let byCode = PIPE_CACHE.get(dev);
  if (byCode === undefined) { byCode = new Map(); PIPE_CACHE.set(dev, byCode); }
  const hit = byCode.get(code);
  if (hit !== undefined) return hit;
  const mod = dev.createShaderModule({ code });
  const info = await mod.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(`WGSL: ${errs[0].lineNum}: ${errs[0].message}`);
  const pipe = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
  byCode.set(code, pipe);
  return pipe;
}

async function guardValidation(dev, label, fn) {
  dev.pushErrorScope('validation');
  let out;
  let thrown = null;
  try {
    out = await fn();
  } catch (e) {
    thrown = e;
  }
  const err = await dev.popErrorScope();
  if (err) throw new Error(`${label}: WebGPU validation — ${err.message}`);
  if (thrown) throw thrown;
  return out;
}

function upload(dev, arr) {
  const b = dev.createBuffer({ size: Math.max(16, arr.byteLength), usage: U().STORAGE | U().COPY_DST, mappedAtCreation: true });
  new Float32Array(b.getMappedRange()).set(arr);
  b.unmap();
  return b;
}

/** Run a compute kernel over `samples` (3 floats each) and read back one f32 per sample. */
export async function dispatch(dev, ctx, kernel, samples, nOut) {
  const pipe = await getPipeline(dev, ctx.env + '\n' + kernel);
  return guardValidation(dev, 'dispatch', async () => {
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
  });
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

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SCREEN — per-triangle, sound, and the whole point of the GPU port
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// For each triangle: sample a barycentric lattice of level n, take the max RADIAL-foot distance, and also
// report covRad. The radial foot is a genuine surface point, so its distance UPPER-bounds dist(p,S), hence
//
//        maxRadial + covRad/n + margin  <=  tol   =>   the triangle is certified clean, no false negatives
//
// Everything else is a SURVIVOR and goes to the CPU for the exact perpendicular treatment. Radial is used
// deliberately here despite over-stating (perpendicular / cos(tilt)): over-stating is the safe direction
// for a screen — it can only send extra work to the CPU, never wave a bad triangle through.
//
// Triangles are laid out as 9 consecutive floats (ax..cz). `samples` carries them; `outR` gets 2 floats per
// triangle: [maxRadial, covRad].
export const KERNEL_SCREEN = PREAMBLE + `
fn fr_at(th: f32, z: f32, H: f32, Rt: f32, Rb: f32) -> f32 {
  let t = clamp(z, 0.0, H) / H;
  return style_radius(0, th, t, Rb + (Rt - Rb) * t);
}
// THE CLOSURE. The printed boundary is the CLOSURE of the graph r = rA(th,z), not the graph itself: at a C0
// z-step the solid carries a vertical TREAD WALL and at a theta-jump a CURTAIN. Both are correct geometry
// the mesher deliberately emits, and both are absent from the bare graph — so scoring a tread facet against
// the graph reports about half the jump height as an error. That is why the un-closed screen sent 19-37 % of
// BasketWeave / GeoStar / Gyroid to the CPU: those were DEFERRALS, not failures.
//
// Rather than locate the jumps (per-style, and the thing this campaign is trying to stop doing), take the
// one-sided limits at +-eps in BOTH parameters and clamp the query radius into the interval they span. On a
// smooth patch the limits coincide to within slope*eps, so it is a no-op; exactly at a jump the interval IS
// the wall, so a point on the wall scores ~0. Shape-agnostic, no feature detector, 4 extra rA evals.
//
// SOUNDNESS. At a jump every radius in the interval is a genuine boundary point, so the distance is exact.
// At a smooth point the interval adds points lying at most slope*eps off the surface, so the reading can
// under-state by at most that — with eps = 1e-6 mm/rad that is <= 1e-6 mm = 0.001 um, which is folded into
// \`marginMm\` (default 1 um, i.e. 1000x cover). Without that term the screen would not be sound.
// Distance from p to the closure-clamped surface at a GIVEN parameter (th, z). The surface footprint there
// is the radial segment [rmin, rmax] spanned by the one-sided limits; the closest point of that segment to p
// is at radius clamp(p . u_th, rmin, rmax) where u_th is the radial direction. For th = atan2(py,px) this
// reduces to the plain radial foot, so it generalises the old radial_dist rather than replacing it.
fn surf_dist(p: vec3<f32>, th: f32, zRaw: f32, H: f32, Rt: f32, Rb: f32, eps: f32) -> f32 {
  let z = clamp(zRaw, 0.0, H);
  let ct = cos(th); let st = sin(th);
  let r0 = fr_at(th, z, H, Rt, Rb);
  var rmin = r0;
  var rmax = r0;
  if (eps > 0.0) {
    let a = fr_at(th, z - eps, H, Rt, Rb);
    let b = fr_at(th, z + eps, H, Rt, Rb);
    let c = fr_at(th - eps, z, H, Rt, Rb);
    let d = fr_at(th + eps, z, H, Rt, Rb);
    rmin = min(min(r0, min(a, b)), min(c, d));
    rmax = max(max(r0, max(a, b)), max(c, d));
  }
  let rc = clamp(p.x * ct + p.y * st, rmin, rmax);
  return length(p - vec3<f32>(rc * ct, rc * st, z));
}
// GAUSS-NEWTON TIGHTENING. The radial foot over-states dist(p,S) by 1/cos(tilt) — MEASURED at 19.871x on a
// ridged surface (V10) — which is why the screen's survivor rate is ~0 % on smooth styles and 35-37 % on
// exactly the steep ones. It is NOT the jump closure: GeoStar and Gyroid contain zero tread facets.
//
// One Gauss-Newton step on the closest-point problem, seeded at the radial foot, recovers most of that gap
// for ~5 extra rA evals: build the tangents P_th, P_z by central differences, solve the 2x2 normal equations
// for the parameter step, and evaluate there.
//
// SOUNDNESS IS FREE HERE. Any surface point gives an UPPER bound on dist(p,S), so the Newton point is a valid
// bound however badly the step behaves, and min(radial, newton) is a valid bound too. A bad step can only
// fail to help — it can never wave a bad triangle through. That is why no globalisation (descent-first) is
// needed for a SCREEN, unlike distPerp, which must find the true global foot.
fn tightened_dist(p: vec3<f32>, H: f32, Rt: f32, Rb: f32, eps: f32, iters: i32) -> f32 {
  var th = atan2(p.y, p.x);
  var z = clamp(p.z, 0.0, H);
  var best = surf_dist(p, th, z, H, Rt, Rb, eps);
  let hT = 2.0e-4;
  let hZ = 2.0e-4 * H;
  for (var k: i32 = 0; k < iters; k = k + 1) {
    let rC = fr_at(th, z, H, Rt, Rb);
    let P = vec3<f32>(rC * cos(th), rC * sin(th), z);
    let rTp = fr_at(th + hT, z, H, Rt, Rb); let rTm = fr_at(th - hT, z, H, Rt, Rb);
    let rZp = fr_at(th, z + hZ, H, Rt, Rb); let rZm = fr_at(th, z - hZ, H, Rt, Rb);
    let Pt = (vec3<f32>(rTp * cos(th + hT), rTp * sin(th + hT), z)
            - vec3<f32>(rTm * cos(th - hT), rTm * sin(th - hT), z)) / (2.0 * hT);
    let Pz = (vec3<f32>(rZp * cos(th), rZp * sin(th), z + hZ)
            - vec3<f32>(rZm * cos(th), rZm * sin(th), z - hZ)) / (2.0 * hZ);
    let d = p - P;
    let a11 = dot(Pt, Pt); let a12 = dot(Pt, Pz); let a22 = dot(Pz, Pz);
    let b1 = dot(d, Pt); let b2 = dot(d, Pz);
    let det = a11 * a22 - a12 * a12;
    if (abs(det) < 1e-20) { break; }
    let dth = (b1 * a22 - b2 * a12) / det;
    let dz = (a11 * b2 - a12 * b1) / det;
    th = th + dth;
    z = clamp(z + dz, 0.0, H);
    best = min(best, surf_dist(p, th, z, H, Rt, Rb, eps));
  }
  return best;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let stride = u32(ufield[4]);
  let tri = gid.y * stride + gid.x;
  let nTri = arrayLength(&outR) / 2u;
  if (tri >= nTri) { return; }
  let H = ufield[0]; let Rt = ufield[1]; let Rb = ufield[2];
  let n = i32(ufield[5]);
  let eps = ufield[6];
  let gnIters = i32(ufield[7]);
  let o = tri * 9u;
  let a = vec3<f32>(samples[o+0u], samples[o+1u], samples[o+2u]);
  let b = vec3<f32>(samples[o+3u], samples[o+4u], samples[o+5u]);
  let c = vec3<f32>(samples[o+6u], samples[o+7u], samples[o+8u]);
  var mx = 0.0;
  let fn_ = f32(n);
  for (var i: i32 = 0; i <= n; i = i + 1) {
    for (var j: i32 = 0; j <= n - i; j = j + 1) {
      let wa = f32(i) / fn_; let wb = f32(j) / fn_; let wc = 1.0 - wa - wb;
      let p = a * wa + b * wb + c * wc;
      mx = max(mx, tightened_dist(p, H, Rt, Rb, eps, gnIters));
    }
  }
  // covRad: circumradius if acute, else half the longest edge (identical rule to the CPU certifier)
  let la = length(b - c); let lb = length(a - c); let lc = length(a - b);
  let s1 = la*la; let s2 = lb*lb; let s3 = lc*lc;
  let sMax = max(s1, max(s2, s3));
  var cov = max(la, max(lb, lc)) * 0.5;
  if (sMax < s1 + s2 + s3 - sMax) {
    let ar2 = length(cross(b - a, c - a));
    if (ar2 > 1e-18) { cov = (la * lb * lc) / (2.0 * ar2); }
  }
  if (ufield[0] > 1.0e30) { mx = -1.0; }
  outR[tri*2u] = mx;
  outR[tri*2u+1u] = cov;
}`;

/**
 * Screen a triangle soup on the GPU. Returns per-triangle [maxRadial, covRad] plus the sound partition into
 * certified-clean and survivors at the given tol/margin.
 */
export async function screenTriangles(dev, ctx, xyz9, nTri, { n = 12, tolMm = 0.01, marginMm = 0.001, closureEps = 1e-6, gnIters = 0 } = {}) {
  const pipe = await getPipeline(dev, ctx.env + '\n' + KERNEL_SCREEN);
  return guardValidation(dev, 'screenTriangles', async () => {
  const dd = dispatchDims(nTri);
  const bP = upload(dev, new Float32Array(ctx.params48));
  const bS = upload(dev, xyz9);
  const bU = upload(dev, new Float32Array([DIMS.H, DIMS.Rt, DIMS.Rb, 4, dd.stride, n, closureEps, gnIters]));
  const bO = dev.createBuffer({ size: nTri * 8, usage: U().STORAGE | U().COPY_SRC });
  const bR = dev.createBuffer({ size: nTri * 8, usage: U().MAP_READ | U().COPY_DST });
  const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: bP } }, { binding: 1, resource: { buffer: bS } },
    { binding: 2, resource: { buffer: bO } }, { binding: 3, resource: { buffer: bU } }] });
  const t0 = performance.now();
  const enc = dev.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipe); pass.setBindGroup(0, bg);
  pass.dispatchWorkgroups(dd.x, dd.y); pass.end();
  dev.queue.submit([enc.finish()]);
  await dev.queue.onSubmittedWorkDone();
  const computeMs = performance.now() - t0;
  const enc2 = dev.createCommandEncoder();
  enc2.copyBufferToBuffer(bO, 0, bR, 0, nTri * 8);
  dev.queue.submit([enc2.finish()]);
  await bR.mapAsync(U().MAP_READ);
  const res = new Float32Array(bR.getMappedRange().slice(0));
  bR.unmap();
  [bP, bS, bU, bO, bR].forEach((b) => b.destroy());
  const survivors = [];
  let worstBound = 0; let allZero = true;
  for (let t = 0; t < nTri; t += 1) {
    const mx = res[t * 2]; const cov = res[t * 2 + 1];
    if (mx !== 0) allZero = false;
    const bound = mx + cov / n + marginMm;
    if (bound > worstBound) worstBound = bound;
    if (bound > tolMm) survivors.push(t);
  }
  return { res, survivors, nTri, computeMs: +computeMs.toFixed(2), worstBoundUm: +(worstBound * 1000).toFixed(3),
           clearedFrac: +(1 - survivors.length / nTri).toFixed(4), allZero,
           trisPerSec: Math.round(nTri / (computeMs / 1000)) };
  });
}

/**
 * Certify a whole mesh by cascading the screen: each round raises the lattice level and carries ONLY the
 * survivors forward, exactly as the CPU certifier's doubling loop does, but with the population shrinking
 * every round so the expensive levels are paid for on a small tail.
 *
 * Measured on LowPolyFacet (137,480 tris): 137480 -> 84641 -> 55444 -> 0 survivors at n = 12/48/192,
 * worst bound 5.490 um, 353 ms of GPU compute against 72 s for the CPU H1 pass — 204x, same verdict.
 *
 * Returns `survivors` = triangle indices INTO THE ORIGINAL SOUP that could not be certified; those need the
 * exact perpendicular treatment on the CPU. An empty list means the whole mesh is certified at `tolMm`.
 */
export async function certifyMeshGpu(dev, ctx, xyz9, nTri, opts = {}) {
  // LEVELS STOP AT 192 BY DESIGN — see the note on per-thread cost below. Anything still uncertified is
  // returned as a survivor for the CPU perpendicular pass, which is sound: the screen never clears a bad
  // triangle, it only declines to certify one.
  const { tolMm = 0.01, marginMm = 0.001, levels = [12, 48, 192], chunkSamples = 4e8, closureEps = 1e-6, gnIters = 0 } = opts;
  let cur = xyz9; let curN = nTri; let idx = null;
  const rounds = []; let totalMs = 0;
  for (const n of levels) {
    if (curN === 0) break;
    // CHUNKING IS A CORRECTNESS REQUIREMENT ON WINDOWS, not a tuning knob. A single dispatch that runs for
    // ~2 s trips the OS GPU watchdog (TDR) and the device is LOST — taking every subsequent style with it.
    // Measured: GeometricStar at n=192 ran 2633 ms and the next five styles all died with
    // "[Device] is lost". Cost per triangle is ~(n+1)(n+2)/2 rA evals, so cap the samples per dispatch.
    // ────────────────────────────────────────────────────────────────────────────────────────────────
    // WHY `levels` STOPS AT 192, AND WHY CHUNKING CANNOT RAISE IT
    // ────────────────────────────────────────────────────────────────────────────────────────────────
    // KERNEL_SCREEN walks the whole barycentric lattice INSIDE ONE THREAD (`for i… for j…`). Per-thread
    // work is therefore O(n^2) and depends on `n` ALONE — the batch size sets how many threads run, not how
    // long any one of them takes. At n=768 a single invocation performs 296 065 iterations x ~25 rA evals
    // with transcendentals = ~7.4 M serial evals, which exceeds the ~2 s watchdog on its own.
    //
    // MEASURED, after four failed fixes that all reduced thread count (eval-based budget, removed dispatch
    // floor, pipeline cache, device re-acquisition): a calibration sweep on RippleInterference completed
    // n=12 @ 4000 tris (606 ms), n=48 @ 1000 (72 ms), n=192 @ 40 (406 ms), n=192 @ 80 (266 ms) — and then
    // LOST THE DEVICE at **n=768 with a batch of TWO triangles**. That is the proof that batch size is the
    // wrong knob.
    //
    // THE REAL FIX, not done here: split the lattice across threads (one workgroup per triangle, each
    // invocation taking a stripe of (i,j), then a workgroup reduction for the max and the gap). That makes
    // per-thread cost O(n^2 / workgroupSize) and removes the ceiling. It is a kernel redesign, so until then
    // the cascade stops at 192 and hands the rest to the CPU — a stated limitation, not a silent one.
    // ────────────────────────────────────────────────────────────────────────────────────────────────
    // COST PER SAMPLE IS NOT 1 rA EVAL. The closure adds 4 one-sided probes and each Gauss-Newton iteration
    // adds ~10 (centre + 4 tangent differences + a clamped re-evaluation). `chunkSamples` is a budget in
    // rA EVALS, so it must be divided by that multiplier — otherwise adding GN silently multiplies the
    // dispatch length by ~35x and trips the TDR watchdog. MEASURED the hard way: a cascade that had been
    // chunked safely for the radial kernel lost the device on the second style with gnIters=3, and every
    // style after it died with "[Device] is lost". TDR is a correctness constraint, not a tuning knob.
    const evalsPerSample = 1 + (closureEps > 0 ? 4 : 0) + 10 * gnIters;
    const perTri = (((n + 1) * (n + 2)) / 2) * evalsPerSample;
    // NO FLOOR. A minimum triangles-per-dispatch silently OVERRIDES the eval budget exactly where the budget
    // matters most: at n=768 with GN a single triangle already costs ~7.4 M rA evals, so a floor of 256
    // forces ~1.9e9 evals — about 11 s — straight through the watchdog. MEASURED: with the floor in place
    // the device was lost on the third style even after the budget itself was corrected. One triangle per
    // dispatch is ~45 ms and perfectly acceptable; a slow sweep beats a dead device.
    const maxTri = Math.max(1, Math.floor(chunkSamples / perTri));
    const r = { survivors: [], computeMs: 0, worstBoundUm: 0, allZero: true };
    for (let base = 0; base < curN; base += maxTri) {
      const cnt = Math.min(maxTri, curN - base);
      const part = cur.subarray(base * 9, (base + cnt) * 9);
      const pr = await screenTriangles(dev, ctx, part, cnt, { n, tolMm, marginMm, closureEps, gnIters });
      r.computeMs += pr.computeMs;
      r.worstBoundUm = Math.max(r.worstBoundUm, pr.worstBoundUm);
      if (!pr.allZero) r.allZero = false;
      for (const t of pr.survivors) r.survivors.push(base + t);
    }
    totalMs += r.computeMs;
    rounds.push({ n, in: curN, survivors: r.survivors.length, ms: +r.computeMs.toFixed(1), worstBoundUm: r.worstBoundUm });
    if (r.allZero) throw new Error('screen produced an all-zero buffer — dispatch dropped, do not trust this run');
    const keep = r.survivors;
    const next = new Float32Array(keep.length * 9);
    const nextIdx = new Int32Array(keep.length);
    for (let s = 0; s < keep.length; s += 1) {
      const t = keep[s];
      nextIdx[s] = idx ? idx[t] : t;
      for (let k = 0; k < 9; k += 1) next[s * 9 + k] = cur[t * 9 + k];
    }
    // NB: update the counter BEFORE any early exit. A previous version broke out on survivors===0 without
    // doing so and reported 55444 survivors for a mesh it had in fact fully certified.
    cur = next; curN = keep.length; idx = nextIdx;
  }
  return { nTri, rounds, survivors: idx ? Array.from(idx.slice(0, curN)) : [], nSurvivors: curN,
           certified: curN === 0, totalComputeMs: +totalMs.toFixed(1) };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H2's LIMIT, MADE MEASURABLE — the surface STRUCTURE MAP
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H2 (surface -> mesh) is a WITNESSED lower bound, not a certificate, and it always will be until something
// supplies a modulus of continuity for rA: you cannot certify a sampled function without knowing how fast
// it can move between samples. Interval arithmetic on rA would do it, but the in-repo envelopes are
// per-style (Gothic, WI), so that is not a general answer today.
//
// What IS generally answerable, and what actually bounds the risk, is: *how much structure does this
// surface have below the pitch H2 sampled at?* That is a pure rA question — no mesh, no BVH — so it is
// exactly the part the GPU can take. For each cell of a coarse grid this evaluates rA on a K x K
// sub-lattice and reports the largest departure from the cell's own bilinear corner interpolant. A feature
// that hides from H2 must live inside a cell AND be taller than tol; this map says, at a stated sub-pitch,
// whether any such feature exists anywhere on the surface.
//
// So it does not convert H2 into a certificate. It converts "resolving power ~11.5 um, unknown what is
// below that" into a measured statement about what is below it.
export const KERNEL_STRUCT = PREAMBLE + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let stride = u32(ufield[4]);
  // CHUNKED, for the same TDR reason as the screen: this kernel costs (K+1)^2 rA evals per cell, so a
  // full 1024x512 grid at K=32 is ~571 M evals in one dispatch (~3.5 s at the measured 164 M/s) and the
  // Windows watchdog kills the device well before that. ufield[8] carries the chunk's first cell index;
  // outR is sized to the CHUNK, so the bound test is local and the surface index is global.
  let local = gid.y * stride + gid.x;
  if (local >= arrayLength(&outR)) { return; }
  let cell = u32(ufield[8]) + local;
  let H = ufield[0]; let Rt = ufield[1]; let Rb = ufield[2];
  let NU = u32(ufield[5]); let NV = u32(ufield[6]); let K = i32(ufield[7]);
  if (cell >= NU * NV) { return; }
  let cu = cell % NU; let cv = cell / NU;
  let TAU2 = 6.2831853071795864;
  let th0 = TAU2 * f32(cu) / f32(NU); let th1 = TAU2 * f32(cu + 1u) / f32(NU);
  let z0 = H * f32(cv) / f32(NV);    let z1 = H * f32(cv + 1u) / f32(NV);
  let rAt = fn_r(th0, z0, H, Rt, Rb);
  let r00 = rAt;
  let r10 = fn_r(th1, z0, H, Rt, Rb);
  let r01 = fn_r(th0, z1, H, Rt, Rb);
  let r11 = fn_r(th1, z1, H, Rt, Rb);
  var worst = 0.0;
  for (var i: i32 = 0; i <= K; i = i + 1) {
    let a = f32(i) / f32(K);
    let th = th0 + (th1 - th0) * a;
    for (var j: i32 = 0; j <= K; j = j + 1) {
      let b = f32(j) / f32(K);
      let z = z0 + (z1 - z0) * b;
      let lin = (1.0-a)*(1.0-b)*r00 + a*(1.0-b)*r10 + (1.0-a)*b*r01 + a*b*r11;
      worst = max(worst, abs(fn_r(th, z, H, Rt, Rb) - lin));
    }
  }
  // KEEPS BINDING 1 LIVE — same trick as KERNEL_EVAL's ufield guard, and it is load-bearing for the SAME
  // reason. This kernel has no other reason to read \`samples\`, so \`layout:'auto'\` dropped binding 1 from the
  // pipeline layout, createBindGroup failed validation, the bind group was invalid and the dispatch was
  // silently discarded — the map read 0.000 um bulge for all 20 styles including 2 mm-relief ones. The
  // dropped-dispatch failure mode is now caught loudly by \`guardValidation\` regardless, but the reference
  // must stay: without it the pass does not run at all.
  if (ufield[0] > 1.0e30) { worst = samples[0] - 1.0; }
  outR[local] = worst;
}
fn fn_r(th: f32, z: f32, H: f32, Rt: f32, Rb: f32) -> f32 {
  let t = clamp(z, 0.0, H) / H;
  return style_radius(0, th, t, Rb + (Rt - Rb) * t);
}`;

/**
 * Surface structure map. Returns the per-cell max departure of rA from its bilinear corner interpolant,
 * measured on a K x K sub-lattice, plus the sub-pitch that departure was measured at.
 */
export async function structureMap(dev, ctx, { nu = 1024, nv = 512, K = 32, chunkSamples = 1.5e8 } = {}) {
  const pipe = await getPipeline(dev, ctx.env + '\n' + KERNEL_STRUCT);
  return guardValidation(dev, 'structureMap', async () => {
  const nCell = nu * nv;
  const map = new Float32Array(nCell);
  const bP = upload(dev, new Float32Array(ctx.params48));
  const bS = upload(dev, new Float32Array(16));
  const perCell = (K + 1) * (K + 1);
  const maxCells = Math.max(4096, Math.floor(chunkSamples / perCell));
  let ms = 0;
  for (let base = 0; base < nCell; base += maxCells) {
    const cnt = Math.min(maxCells, nCell - base);
    const dd = dispatchDims(cnt);
    const bU = upload(dev, new Float32Array([DIMS.H, DIMS.Rt, DIMS.Rb, 4, dd.stride, nu, nv, K, base]));
    const bO = dev.createBuffer({ size: cnt * 4, usage: U().STORAGE | U().COPY_SRC });
    const bR = dev.createBuffer({ size: cnt * 4, usage: U().MAP_READ | U().COPY_DST });
    const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: bP } }, { binding: 1, resource: { buffer: bS } },
      { binding: 2, resource: { buffer: bO } }, { binding: 3, resource: { buffer: bU } }] });
    const t0 = performance.now();
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe); pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(dd.x, dd.y); pass.end();
    dev.queue.submit([enc.finish()]);
    await dev.queue.onSubmittedWorkDone();
    ms += performance.now() - t0;
    const enc2 = dev.createCommandEncoder();
    enc2.copyBufferToBuffer(bO, 0, bR, 0, cnt * 4);
    dev.queue.submit([enc2.finish()]);
    await bR.mapAsync(U().MAP_READ);
    map.set(new Float32Array(bR.getMappedRange().slice(0)), base);
    bR.unmap();
    [bU, bO, bR].forEach((b) => b.destroy());
  }
  [bP, bS].forEach((b) => b.destroy());
  let max = 0; let arg = 0; let nz = 0;
  for (let i = 0; i < nCell; i += 1) { if (map[i] !== 0) nz += 1; if (map[i] > max) { max = map[i]; arg = i; } }
  // An all-zero map over an entire real style surface is not a measurement, it is a dropped dispatch. Every
  // registry style has relief, so some cell must depart from its own bilinear interpolant. Refuse to return
  // a number that would read as "this surface has no sub-pitch structure".
  if (nz === 0) throw new Error('structureMap produced an all-zero map — dispatch dropped, do not trust this run');
  const rNom = 50;
  const subPitchUm = Math.max((2 * Math.PI * rNom) / nu / K, DIMS.H / nv / K) * 1000;
  return { map, nCell, ms: +ms.toFixed(1), evals: nCell * (K + 1) * (K + 1),
           maxBulgeUm: +(max * 1000).toFixed(3), argCell: arg, nonZeroCells: nz,
           subPitchUm: +subPitchUm.toFixed(3),
           argTheta: +((2 * Math.PI * (arg % nu)) / nu).toFixed(5),
           argZ: +((DIMS.H * Math.floor(arg / nu)) / nv).toFixed(3) };
  });
}
