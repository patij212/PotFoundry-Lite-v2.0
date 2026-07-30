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

// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE UFIELD LAYOUT — NOT this file's private scratch array
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `getf()` in the PREAMBLE is the SAME accessor `src/assets/shaders/styles.wgsl` uses for the app's geometry
// uniforms, and that file is pasted verbatim into every context by `getStyleEnvironmentWGSL`. So every index
// this file writes is an index some style function may read. The app's convention (styles.wgsl `r_base` /
// `twist_theta` / `surf`, mirrored by pot_export.wgsl's own getf switch) is:
//
//   0 H | 1 Rt | 2 Rb | 3 expn | 4 spinTurns | 5 spinPhase | 6 spinCurve | 7 styleId
//   8..12 superformula m_base/m_top/n1/n2/n3 | 14 bellAmp | 15 bellCenter | 25 tWall | 26 tBottom
//   28 rings | 72 bellWidth
//
// Until 2026-07-29 this file wrote its OWN controls straight through that space: a literal `4` into the
// `expn` slot, the dispatch stride into `spinTurns`, the lattice level `n` into `spinPhase`, `closureEps`
// into `spinCurve`, `gnIters` into `styleId`, and (structureMap) the chunk's base cell index — a number up
// to ~500 000 — into superformula `m_base`. Nothing misbehaved, but only by accident: the ruler calls
// `style_radius` directly and never reaches `surf`/`r_base`/`twist_theta`, and `style_params_active()` is
// true here so `sf_radius` overwrites its own getf(8..12) reads from the packed payload. Both are properties
// of today's call graph, not invariants — and `fr_at` below now DOES call `r_base`, which would have read
// expn = 4.
//
// So: 0..3 carry the real geometry, in the app's order, and the ruler's controls move to 96+, past every
// index the app defines. There is now exactly one base-radius implementation in the GPU path.
const UF = {
  H: 0, RT: 1, RB: 2, EXPN: 3, BELL_AMP: 14, BELL_CENTER: 15, BELL_WIDTH: 72,
  STRIDE: 96, P0: 97, P1: 98, P2: 99, P3: 100,
};
const UF_LEN = 104;

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
 *
 * `ufield[P0] > 0.5` switches the BASE RADIUS source. With it off the kernel takes r0 from the caller's
 * sample triple, which tests `style_radius` and nothing else. With it on the kernel derives r0 from the
 * dispatched dims through `r_base` — the SAME path `KERNEL_SCREEN`/`KERNEL_STRUCT` use — so the caller's
 * CPU reference is then compared against the whole surface, base profile included. `parity()` runs both:
 * the first number is blind by construction to the base reconstruction, which is exactly how a wrong
 * `expn` could have sat under a passing parity report.
 */
// 2-D DISPATCH IS NOT OPTIONAL. maxComputeWorkgroupsPerDimension is 65535, so a 1-D dispatch caps at
// 65535*64 = 4,194,240 invocations — and exceeding it does not throw where you can see it, the pass is
// simply dropped and the output buffer stays zero. That reads as an absurdly fast, perfectly wrong result
// (measured: "8.7 billion evals/sec" with an all-zero output). ufield[STRIDE] carries the row stride.
export const KERNEL_EVAL = PREAMBLE + `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let stride = u32(ufield[${UF.STRIDE}u]);
  let i = gid.y * stride + gid.x;
  if (i >= arrayLength(&outR)) { return; }
  let th = samples[i*3u];
  let t = samples[i*3u+1u];
  var r0 = samples[i*3u+2u];
  if (ufield[${UF.P0}u] > 0.5) { r0 = r_base(t); }
  var r = style_radius(0, th, t, r0);
  if (ufield[${UF.H}u] > 1.0e30) { r = -1.0; }
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

/**
 * DEFAULT pot geometry. It is a DEFAULT, not a constant: every dispatch uploads `ctx.dims` as ufield[0..3]
 * and the kernel derives the base radius from it through the app's own `r_base`, so whatever is in here IS
 * the surface the GPU scores against. When it was unreachable from the callers, the ruler always measured an
 * H=120 pot no matter what geometry the triangles came from — every bridge test happens to mesh at these
 * numbers, so it stayed latent, but auditing any other size (the potscope rows in this series are H32_OD30)
 * would have scored a different surface while the parity guard, which compares rA VALUES, saw nothing wrong.
 * Pass `dims` to `styleContext` to override.
 *
 * `expn` IS PART OF THE SURFACE, and it was the second layer of the same bug. The CPU side of this campaign
 * builds rA through `baseRadius(z,H,Rb,Rt,expn,opts) = Rb + (Rt-Rb)*t^expn` (+ an optional bell); the GPU
 * kernels hardcoded `Rb + (Rt-Rb)*t`, i.e. expn = 1, and no upload site ever carried `expn` at all. Every
 * research harness uses expn = 1 so it stayed latent here too — but `DEFAULT_DIMENSIONS` in
 * src/geometry/types.ts, the geometry the APP ships, is `{H:120, Rt:70, Rb:45, expn:1.1}`, and 1.1 vs 1.0
 * on that pot is a base-radius error of (Rt-Rb)*max_t(t - t^1.1) = 25 * 0.035049 = 0.876 mm = 876 um, at
 * t = 0.3855 — 88x the 10 um bar, i.e. larger than every defect this campaign is chasing. Pointing the
 * certificate engine at a production export would have measured a different pot. NOTE it is a LANDMINE, not
 * a correction: every harness in this series runs expn = 1, so no number already published moves.
 * Fixed by uploading expn and calling `r_base`.
 */
export const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };

export async function makeDevice() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  return adapter.requestDevice();
}

const camel = (s) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

/** Registry defaults + the packed 48-float GPU payload + the CPU function, for one style. */
export async function styleContext(styleName, dims = DIMS) {
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
    // `dimsExplicit` records whether the CALLER named the geometry or inherited the module default. It is
    // not used to change any number — it exists so a guard can say "you never told me what pot this is"
    // instead of the far less useful "the numbers disagree".
    numId, params48, merged, dims: { ...dims, expn: dims.expn ?? 1 }, dimsExplicit: dims !== DIMS,
    cpuFn: st.STYLE_FUNCTIONS[styleName],
    env: sm.ShaderManager.getInstance().getStyleEnvironmentWGSL(numId),
  };
}

/** The geometry a context scores against; every ufield upload must go through this. */
const dimsOf = (ctx) => ctx?.dims ?? DIMS;

/**
 * THE ONLY PLACE A UFIELD IS PACKED. Three upload sites used to build their own literal arrays, each
 * repeating `[D.H, D.Rt, D.Rb, 4, stride, …]` — three chances for the order to drift from what a kernel
 * reads, and three copies of the `4` that was silently occupying the app's `expn` slot. One builder, one
 * layout, and the geometry validated once on the way through.
 *
 * `ctrl` are the ruler's own per-kernel controls; they land at UF.P0..P3, clear of the app's index space.
 *
 * EXPORTED so the packing can be asserted without a GPU. The layout is the thing this whole audit was
 * about; it should be checkable by a plain unit test, not only by reading three upload sites.
 */
export function ufieldFor(ctx, stride, ctrl = []) {
  const D = dimsOf(ctx);
  const expn = D.expn ?? 1;
  if (!(Number.isFinite(D.H) && D.H > 0) || !Number.isFinite(D.Rt) || !Number.isFinite(D.Rb) || !(expn > 0)) {
    throw new Error(`gpuRuler: unusable dims ${JSON.stringify(D)} — need finite H > 0, finite Rt/Rb, expn > 0`);
  }
  const u = new Float32Array(UF_LEN);
  u[UF.H] = D.H; u[UF.RT] = D.Rt; u[UF.RB] = D.Rb; u[UF.EXPN] = expn;
  const m = ctx?.merged ?? {};
  u[UF.BELL_AMP] = m.bellAmp ?? 0;
  u[UF.BELL_CENTER] = m.bellCenter ?? 0.5;
  u[UF.BELL_WIDTH] = m.bellWidth ?? 0.22;
  // THE TWO BELLS DISAGREE BELOW WIDTH 0.1. src/geometry/profile.ts floors the Gaussian width at 0.05
  // (`Math.max(0.05, opts.bellWidth ?? 0.22)`); styles.wgsl's `r_base` floors it at 0.1
  // (`max(getf(72u), 0.1)`). Above 0.1 they are the same function, so the GPU can carry the bell honestly;
  // inside [0, 0.1) they are two different surfaces and no amount of care here reconciles them. Refuse,
  // rather than return a number produced by whichever floor happened to win. Inert at every current call
  // site — DEFAULT_PROFILE.bellAmp is 0 and no registry style sets it.
  if (u[UF.BELL_AMP] !== 0 && u[UF.BELL_WIDTH] < 0.1) {
    throw new Error(`gpuRuler: bellAmp=${u[UF.BELL_AMP]} with bellWidth=${u[UF.BELL_WIDTH]} — the CPU floors the bell width at 0.05 and styles.wgsl floors it at 0.1, so below 0.1 the two implementations describe different surfaces. Widen the bell or drop it; do not measure across the disagreement.`);
  }
  u[UF.STRIDE] = stride;
  for (let i = 0; i < ctrl.length; i += 1) u[UF.P0 + i] = ctrl[i];
  return u;
}

/**
 * `opts.dims` IS AN ASSERTION, NEVER A SECOND SOURCE OF TRUTH. The geometry reaches the kernels through
 * `ctx` alone, so a caller who hands `dims` to `screenTriangles`/`certifyMeshGpu` — the natural thing to
 * try, since those take an opts bag — would previously have had it silently ignored and gone on scoring the
 * module default. Now it is checked against the context and disagreement throws.
 */
function assertDimsAgree(ctx, dims, where) {
  if (dims === undefined || dims === null) return;
  const D = dimsOf(ctx);
  const same = Object.is(+D.H, +dims.H) && Object.is(+D.Rb, +dims.Rb) && Object.is(+D.Rt, +dims.Rt)
    && Object.is(+(D.expn ?? 1), +(dims.expn ?? 1));
  if (!same) {
    throw new Error(`${where}: opts.dims ${JSON.stringify(dims)} disagrees with the context's dims ${JSON.stringify(D)}. The kernels read the CONTEXT — build it with styleContext(style, dims) rather than passing geometry here.`);
  }
}

/**
 * REFUSE TO SCORE A SOUP THAT CANNOT LIE ON THIS SURFACE.
 *
 * The failure this exists for is entirely silent: a ctx built with the module default DIMS and a triangle
 * soup meshed at some other size produce a full, plausible survivor table for a pot that was never built.
 * The parity guard cannot see it — it compares rA VALUES, and both sides are self-consistent.
 *
 * Only the bounds that NO legitimate mesh can violate are enforced, so this cannot false-alarm:
 *   * every point of the closed solid has r <= base + relief, and measured relief is a few percent of the
 *     base, so 2x the larger base radius is roughly a 20x margin;
 *   * every point has z in [0, H] up to the bottom-slab offset.
 * Caps, drain rims and sliver-collapsed facets only make r SMALLER and are therefore invisible here — a
 * lower bound on r is the one test that would false-alarm on a legitimate base disc, so there isn't one.
 * The complementary check (is the soup actually NEAR the surface) is `grossFrac`, which is free because the
 * screen already measures it.
 */
function assertSoupOnSurface(D, xyz9, nTri, where) {
  const rCap = 2 * Math.max(Math.abs(D.Rb), Math.abs(D.Rt)) + 1;
  const zLo = -0.05 * D.H - 1;
  const zHi = 1.05 * D.H + 1;
  let rMax = 0; let zMin = Infinity; let zMax = -Infinity; let nBad = 0;
  const nV = nTri * 3;
  for (let v = 0; v < nV; v += 1) {
    const x = xyz9[v * 3]; const y = xyz9[v * 3 + 1]; const z = xyz9[v * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { nBad += 1; continue; }
    const r = Math.sqrt(x * x + y * y);
    if (r > rMax) rMax = r;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  if (nBad > 0) throw new Error(`${where}: ${nBad} of ${nV} vertex coordinates are not finite — the soup is corrupt, not merely misplaced.`);
  if (rMax > rCap || zMin < zLo || zMax > zHi) {
    throw new Error(`${where}: this triangle soup cannot lie on the surface it is being scored against. dims H=${D.H} Rb=${D.Rb} Rt=${D.Rt} expn=${D.expn ?? 1} admits r <= ${rCap.toFixed(2)} and z in [${zLo.toFixed(2)}, ${zHi.toFixed(2)}]; the soup has rMax=${rMax.toFixed(3)} and z in [${zMin.toFixed(3)}, ${zMax.toFixed(3)}] over ${nTri} triangles. Build the context with the MESH'S OWN geometry — styleContext(style, dims) — not the module default. Pass { geometryGuard: false } only if you mean to.`);
  }
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

/**
 * Run a compute kernel over `samples` (3 floats each) and read back one f32 per sample.
 * `baseFromDims` makes KERNEL_EVAL derive r0 from the dispatched geometry instead of reading it out of the
 * sample triple — see the note on KERNEL_EVAL.
 */
export async function dispatch(dev, ctx, kernel, samples, nOut, { baseFromDims = false } = {}) {
  // A SHORT SAMPLE BUFFER IS NOT A CRASH. WGSL storage reads are robustness-clamped, so `nOut` larger than
  // the samples provided silently re-reads an in-bounds element and returns a full, wrong result column.
  if (!(nOut > 0)) throw new Error(`dispatch: nOut must be > 0, got ${nOut}`);
  if (samples.length < nOut * 3) throw new Error(`dispatch: samples holds ${samples.length} floats but nOut=${nOut} needs ${nOut * 3} — out-of-range reads are clamped, not trapped, so this would return a plausible wrong answer.`);
  const pipe = await getPipeline(dev, ctx.env + '\n' + kernel);
  return guardValidation(dev, 'dispatch', async () => {
  const bP = upload(dev, new Float32Array(ctx.params48));
  const bS = upload(dev, samples);
  const dd = dispatchDims(nOut);
  const bU = upload(dev, ufieldFor(ctx, dd.stride, [baseFromDims ? 1 : 0]));
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
export async function parity(dev, styleName, NU = 512, NV = 256, offsetFrac = 0.37, dims = DIMS) {
  const pr = await import('/src/geometry/profile.ts');
  const ctx = await styleContext(styleName, dims);
  // `expn` is OPTIONAL on StyleDims and the repo's own buildRadiusFn guards it with `?? 1`. Destructuring it
  // bare would hand `undefined` to baseRadius, NaN the entire CPU reference, and report a clean parity pass.
  const { H, Rb, Rt } = dims;
  const expn = dims.expn ?? 1;
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
  // SECOND PASS — THE ONE THAT ACTUALLY COVERS THE SCREEN. The pass above hands the kernel the CPU's own
  // `baseRadius`, so it tests `style_radius` and nothing else; it is blind BY CONSTRUCTION to the base-radius
  // reconstruction that KERNEL_SCREEN and KERNEL_STRUCT depend on. That blindness is how a hardcoded expn = 1
  // sat underneath a passing 20-style parity report. This pass makes the GPU derive r0 itself, through the
  // same `r_base` the screen uses, so `maxDiffSurfUm` covers the WHOLE surface: base profile, expn, bell and
  // style. Both numbers are reported; when they differ, the difference is the base reconstruction alone.
  const gpuSurf = await dispatch(dev, ctx, KERNEL_EVAL, samples, n, { baseFromDims: true });
  let maxAbs = 0; let over1 = 0; let maxSurf = 0;
  for (let i = 0; i < n; i += 1) {
    const d = Math.abs(gpu[i] - cpu[i]);
    if (d > maxAbs) maxAbs = d;
    if (d > 0.001) over1 += 1;
    const ds = Math.abs(gpuSurf[i] - cpu[i]);
    if (ds > maxSurf) maxSurf = ds;
  }
  return { style: styleName, n, ms: +ms.toFixed(1), maxDiffUm: +(maxAbs * 1000).toFixed(4), over1um: over1,
           maxDiffSurfUm: +(maxSurf * 1000).toFixed(4),
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
// ONE BASE-RADIUS IMPLEMENTATION, AND IT IS THE APP'S. This used to inline \`Rb + (Rt - Rb) * t\`, a second
// implementation of \`baseRadius\` that silently omitted the flare exponent and the bell — the exact shape of
// the Voronoi hash-desync defect (four copies, one updated). \`r_base(t)\` is defined in styles.wgsl, sits
// OUTSIDE every \`#region\`, and is therefore kept verbatim by \`stripShaderCode\` in every style environment,
// so it is available in every context this file compiles. It reads Rt/Rb/expn and the bell from getf(), which
// is why the ufield now carries the geometry in the app's own index order.
//
// UNMEASURED COST, stated rather than hidden: r_base adds a pow and an exp per call against the old two
// flops, and fr_at runs 9x per surf_dist. On these kernels style_radius (many transcendentals) dominates, so
// the expected effect is small — but it was NOT measured here, because a live meshing run had the machine.
// If a sweep later shows it matters, the fix is a specialisation inside r_base, not a fork back to here.
fn fr_at(th: f32, z: f32, H: f32) -> f32 {
  let t = clamp(z, 0.0, H) / H;
  return style_radius(0, th, t, r_base(t));
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
// SOUNDNESS, AND WHY THE ONE-SCALE VERSION DID NOT HAVE IT. At a jump every radius in the interval is a
// genuine boundary point, so the distance is exact. At a SMOOTH point the interval instead admits radii that
// are NOT on the surface, and the reading under-states by up to the interval width. The previous note put that
// width at "slope*eps ... <= 1e-6 mm = 0.001 um", which silently assumed slope <= 1 — but dr/dtheta is in mm
// per RADIAN, and a style with 2 mm of relief over 1e-3 rad has dr/dtheta ~ 2000 mm/rad, giving a width of
// 2000 * 1e-6 = 2.0e-3 mm = 2 um against a \`marginMm\` default of 1 um. The screen could therefore clear a
// triangle whose true deviation exceeded tol — a FALSE NEGATIVE, on exactly the steep styles where every
// failure in this campaign lives, and gnIters > 0 compounded it by sampling more clamped locations.
//
// The fix discriminates the two cases with a second probe at eps/4, which needs no feature detector and stays
// shape-agnostic: a genuine C0 jump keeps its full width as the probe shrinks, while a smooth ramp's width
// falls ~4x with it. Widen ONLY when the width survives, and then only into the narrower interval (so the
// residual slack at a jump is slope*eps/4, not slope*eps). Otherwise fall back to the plain radial foot, which
// is unconditionally an upper bound. Conservative in the unsure direction, which is what a screen requires.
// Distance from p to the closure-clamped surface at a GIVEN parameter (th, z). The surface footprint there
// is the radial segment [rmin, rmax] spanned by the one-sided limits; the closest point of that segment to p
// is at radius clamp(p . u_th, rmin, rmax) where u_th is the radial direction. For th = atan2(py,px) this
// reduces to the plain radial foot, so it generalises the old radial_dist rather than replacing it.
// THE (Rt, Rb) PARAMETERS ARE GONE ON PURPOSE. They were threaded through fr_at/surf_dist/tightened_dist as
// positional f32s, three call sites deep, in an order that had to match a packing order maintained by hand at
// three separate upload sites. That is the argument-order bug waiting to happen, and it is the same class as
// the missing dims. \`r_base\` sources them from the ufield, so nothing but H (needed to form t) is passed.
fn surf_dist(p: vec3<f32>, th: f32, zRaw: f32, H: f32, eps: f32) -> f32 {
  let z = clamp(zRaw, 0.0, H);
  let ct = cos(th); let st = sin(th);
  let r0 = fr_at(th, z, H);
  var rmin = r0;
  var rmax = r0;
  if (eps > 0.0) {
    // BOTH PROBE WIDTHS MUST SURVIVE f32. The two-scale test compares the interval at a narrow width against
    // one at 4x that width — but shrinking BELOW eps is not available here: f32 half-ULP already exceeds
    // 2.5e-7 for z >= 8 mm, so an eps/4 z-probe rounds straight back to z and the z-cross contributes
    // nothing. A pure C0 z-step (a tread wall is a constant-z annulus, locally flat in theta) then reads
    // width 0 at the narrow scale, the gate calls it smooth, and the closure never widens — which silently
    // re-opens the whole deferral class on BasketWeave (walls at z = 12, 24), DragonScales (15, 30),
    // BambooSegments (24) and ArtDeco (27). So widen UPWARD instead: probe at eps and at 4*eps, and keep the
    // NARROW interval when the width survives. Scale the z step with |z| so it stays above ULP for tall pots.
    let ez = max(eps, abs(z) * 2.0e-7);
    let et = eps;
    let aN = fr_at(th, z - ez, H);
    let bN = fr_at(th, z + ez, H);
    let cN = fr_at(th - et, z, H);
    let dN = fr_at(th + et, z, H);
    let loN = min(min(r0, min(aN, bN)), min(cN, dN));
    let hiN = max(max(r0, max(aN, bN)), max(cN, dN));
    let aW = fr_at(th, z - 4.0 * ez, H);
    let bW = fr_at(th, z + 4.0 * ez, H);
    let cW = fr_at(th - 4.0 * et, z, H);
    let dW = fr_at(th + 4.0 * et, z, H);
    let wW = max(max(r0, max(aW, bW)), max(cW, dW)) - min(min(r0, min(aW, bW)), min(cW, dW));
    // Jump-like iff the width survives the 4x shrink; a smooth slope's falls to ~wW/4.
    if (wW > 0.0 && (hiN - loN) >= 0.5 * wW) { rmin = loN; rmax = hiN; }
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
fn tightened_dist(p: vec3<f32>, H: f32, eps: f32, iters: i32) -> f32 {
  var th = atan2(p.y, p.x);
  var z = clamp(p.z, 0.0, H);
  var best = surf_dist(p, th, z, H, eps);
  let hT = 2.0e-4;
  let hZ = 2.0e-4 * H;
  for (var k: i32 = 0; k < iters; k = k + 1) {
    let rC = fr_at(th, z, H);
    let P = vec3<f32>(rC * cos(th), rC * sin(th), z);
    let rTp = fr_at(th + hT, z, H); let rTm = fr_at(th - hT, z, H);
    let rZp = fr_at(th, z + hZ, H); let rZm = fr_at(th, z - hZ, H);
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
    best = min(best, surf_dist(p, th, z, H, eps));
  }
  return best;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let stride = u32(ufield[${UF.STRIDE}u]);
  let tri = gid.y * stride + gid.x;
  let nTri = arrayLength(&outR) / 2u;
  if (tri >= nTri) { return; }
  let H = ufield[${UF.H}u];
  let n = i32(ufield[${UF.P0}u]);
  let eps = ufield[${UF.P1}u];
  let gnIters = i32(ufield[${UF.P2}u]);
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
      mx = max(mx, tightened_dist(p, H, eps, gnIters));
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
  if (ufield[${UF.H}u] > 1.0e30) { mx = -1.0; }
  outR[tri*2u] = mx;
  outR[tri*2u+1u] = cov;
}`;

/**
 * Screen a triangle soup on the GPU. Returns per-triangle [maxRadial, covRad] plus the sound partition into
 * certified-clean and survivors at the given tol/margin.
 *
 * `dims` here is an ASSERTION against the context's geometry, not an override — see `assertDimsAgree`.
 * `grossMm` is the wrong-surface threshold behind the returned `grossFrac`; it defaults to 5 % of the larger
 * base radius, which is ~250x the 0.01 mm bar and therefore unreachable by any mesh that is merely bad.
 */
export async function screenTriangles(dev, ctx, xyz9, nTri, { n = 12, tolMm = 0.01, marginMm = 0.001, closureEps = 1e-6, gnIters = 0,
                                                              dims = null, geometryGuard = true, grossMm = 0 } = {}) {
  const D = dimsOf(ctx);
  assertDimsAgree(ctx, dims, 'screenTriangles');
  if (!(nTri > 0)) throw new Error(`screenTriangles: nTri must be > 0, got ${nTri}`);
  // Same robustness-clamping hazard as `dispatch`: a short soup does not fault, it returns wrong numbers.
  if (xyz9.length < nTri * 9) throw new Error(`screenTriangles: xyz9 holds ${xyz9.length} floats but nTri=${nTri} needs ${nTri * 9} — out-of-range storage reads are clamped, not trapped.`);
  if (geometryGuard) assertSoupOnSurface(D, xyz9, nTri, 'screenTriangles geometry guard');
  const gross = grossMm > 0 ? grossMm : Math.max(0.5, 0.05 * Math.max(Math.abs(D.Rb), Math.abs(D.Rt)));
  const pipe = await getPipeline(dev, ctx.env + '\n' + KERNEL_SCREEN);
  return guardValidation(dev, 'screenTriangles', async () => {
  const dd = dispatchDims(nTri);
  const bP = upload(dev, new Float32Array(ctx.params48));
  const bS = upload(dev, xyz9);
  const bU = upload(dev, ufieldFor(ctx, dd.stride, [n, closureEps, gnIters]));
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
  let worstBound = 0; let allZero = true; let nGross = 0;
  for (let t = 0; t < nTri; t += 1) {
    const mx = res[t * 2]; const cov = res[t * 2 + 1];
    // WRONG-SURFACE DETECTOR, PAID FOR BY A MEASUREMENT ALREADY MADE. The bbox guard above cannot catch a
    // soup whose radii happen to fit but whose HEIGHT does not — mesh a 32 mm pot, score it against a 120 mm
    // one at the same radii and every bbox test passes while every facet is registered against the wrong
    // part of the profile. That soup reads millimetres from the surface on essentially every triangle, and
    // no legitimately bad mesh does: the worst in this campaign is 0.928 mm MAX. So the FRACTION over
    // `gross` is the discriminator, and it needs no assumption about caps, drains or slivers.
    if (mx > gross) nGross += 1;
    // THE DROP TEST NEEDS BOTH COLUMNS. Keying it on mx alone false-alarms on a chunk that is legitimately
    // perfect (mx === 0 everywhere); keying it on cov alone false-alarms on a chunk of sliver-collapsed
    // facets, where three coincident vertices give cov = max(la,lb,lc)*0.5 = exactly 0 and the acute branch
    // cannot fire — and with the per-chunk throw below, one such chunk would abort an entire certification
    // run. A dropped dispatch leaves BOTH columns at their initial zeros, so require both.
    if (cov !== 0 || mx !== 0) allZero = false;
    const bound = mx + cov / n + marginMm;
    if (bound > worstBound) worstBound = bound;
    if (bound > tolMm) survivors.push(t);
  }
  return { res, survivors, nTri, computeMs: +computeMs.toFixed(2), worstBoundUm: +(worstBound * 1000).toFixed(3),
           clearedFrac: +(1 - survivors.length / nTri).toFixed(4), allZero,
           nGross, grossMm: gross, grossFrac: +(nGross / nTri).toFixed(4),
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
  // targetMs is the REAL safety knob — dispatches are steered to this measured wall-time, well under the
  // ~2 s watchdog. chunkSamples now only seeds the first dispatch of each level.
  // `dims` REACHES THE KERNELS THROUGH `ctx`, NEVER THROUGH `opts`. It is accepted here only so that a
  // caller who passes it — the obvious thing to try, given everything else lives in this bag — gets an
  // assertion instead of silence. `assertDimsAgree` throws on disagreement; it does not override.
  const { tolMm = 0.01, marginMm = 0.001, levels = [12, 48, 192], chunkSamples = 4e7,
          closureEps = 1e-6, gnIters = 0, targetMs = 400, maxTriCap = 4096,
          dims = null, geometryGuard = true, grossMm = 0, grossAbortFrac = 0.5 } = opts;
  assertDimsAgree(ctx, dims, 'certifyMeshGpu');
  let cur = xyz9; let curN = nTri; let idx = null;
  const rounds = []; let totalMs = 0; let firstRound = true;
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
    // COUNT `surf_dist` ONCE AND REUSE IT. The closure costs EIGHT probes, not four (the two-scale jump test
    // evaluates a narrow cross and a wide one), so surf_dist is 9 rA evals with the closure on and 1 without.
    // Each Gauss-Newton iteration then costs 1 centre + 4 tangent probes + a full surf_dist — so the old
    // fixed `10 * gnIters` was only right while surf_dist cost 5. Deriving both terms from the same figure
    // keeps them from drifting apart again; under-counting lengthens every dispatch past the budget it was
    // sized against, which is the TDR watchdog failure this constant exists to prevent.
    const surfCost = closureEps > 0 ? 9 : 1;
    const evalsPerSample = surfCost + gnIters * (5 + surfCost);
    const perTri = (((n + 1) * (n + 2)) / 2) * evalsPerSample;
    // NO FLOOR. A minimum triangles-per-dispatch silently OVERRIDES the eval budget exactly where the budget
    // matters most: at n=768 with GN a single triangle already costs ~7.4 M rA evals, so a floor of 256
    // forces ~1.9e9 evals — about 11 s — straight through the watchdog. MEASURED: with the floor in place
    // the device was lost on the third style even after the budget itself was corrected. One triangle per
    // dispatch is ~45 ms and perfectly acceptable; a slow sweep beats a dead device.
    // The eval count is only a SEED. It is a poor time proxy: MEASURED on two completed rows at identical
    // settings it implies 138 M evals/s (RippleInterference) and 867 M (LowPolyFacet) — the latter 5x above
    // the measured hardware peak of 164 M/s. Early exits, divergence and per-style rA cost make the model
    // wrong by ~6x in either direction, so ANY fixed budget derived from it is guesswork wearing arithmetic.
    // So: seed from it, then CLOSE THE LOOP on observed dispatch wall-time, steering toward targetMs. That
    // is self-calibrating per style, per kernel and per GPU, and needs no cost model to be correct.
    let maxTri = Math.max(1, Math.floor(chunkSamples / perTri));
    const r = { survivors: [], computeMs: 0, worstBoundUm: 0, allZero: true, nGross: 0, seen: 0, grossMm: 0 };
    // ADVANCE BY WHAT WAS ACTUALLY PROCESSED. A `for (…; base += maxTri)` header is a correctness bug once
    // maxTri is adaptive: the header reads the value AFTER the body mutated it, so the cursor and the batch
    // disagree. Shrinking re-screens triangles (inflated survivor counts — MEASURED: SuperellipseMorph read
    // 3927 where the fixed-chunk run read 2563); growing SKIPS them, and a skipped triangle never enters
    // `survivors`, i.e. it is silently reported as certified. That is a FALSE PASS, the exact failure class
    // this auditor exists to catch. Caught only because chunking changed a number it cannot legitimately
    // change — the same "measurements disagreeing" signal as every other defect found in this campaign.
    let base = 0;
    while (base < curN) {
      const cnt = Math.min(maxTri, curN - base);
      const part = cur.subarray(base * 9, (base + cnt) * 9);
      const pr = await screenTriangles(dev, ctx, part, cnt, { n, tolMm, marginMm, closureEps, gnIters, geometryGuard, grossMm });
      // PER CHUNK, NOT PER ROUND. Aggregating with `if (!pr.allZero) r.allZero = false` only fires when EVERY
      // chunk came back empty, so a drop affecting one chunk among the hundreds a large mesh runs passed
      // unnoticed — and a dropped chunk reads mx = 0, cov = 0, hence bound = marginMm <= tolMm, so every
      // triangle in it is classed certified-clean and never reaches the CPU. That is a silent FALSE PASS of
      // thousands of triangles. guardValidation covers the validation-error class; a TDR or device-loss drop
      // mid-round is not a validation error, so it has to be caught here.
      if (pr.allZero && cnt > 0) {
        throw new Error(`screen returned an all-zero buffer for ${cnt} triangles at n=${n}, base=${base} — dispatch dropped, do not trust this run`);
      }
      r.computeMs += pr.computeMs;
      r.worstBoundUm = Math.max(r.worstBoundUm, pr.worstBoundUm);
      r.nGross += pr.nGross; r.seen += cnt; r.grossMm = pr.grossMm;
      if (!pr.allZero) r.allZero = false;
      for (const t of pr.survivors) r.survivors.push(base + t);
      base += cnt;
      // Adapt from what that dispatch ACTUALLY cost. Growth is capped at 2x per step so a fast first chunk
      // cannot overshoot into the watchdog; shrink is faster so a slow one is corrected immediately.
      if (pr.computeMs > 0) {
        const scale = Math.min(2, Math.max(0.25, targetMs / pr.computeMs));
        maxTri = Math.max(1, Math.min(Math.round(maxTri * scale), maxTriCap));
      }
    }
    totalMs += r.computeMs;
    const grossFrac = r.seen > 0 ? r.nGross / r.seen : 0;
    rounds.push({ n, in: curN, survivors: r.survivors.length, ms: +r.computeMs.toFixed(1), worstBoundUm: r.worstBoundUm,
                  grossFrac: +grossFrac.toFixed(4) });
    if (r.allZero) throw new Error('screen produced an all-zero buffer — dispatch dropped, do not trust this run');
    // THE WRONG-SURFACE ABORT, ON THE FIRST ROUND ONLY — later rounds see the SURVIVORS, which are by
    // definition the worst facets, so their gross fraction is legitimately high and means nothing. Round 1
    // sees the whole mesh. Over half of a whole mesh sitting more than `grossMm` from the surface is not a
    // mesh-quality result, it is a statement that these triangles were not built on this surface.
    if (firstRound && grossFrac > grossAbortFrac) {
      throw new Error(`certifyMeshGpu: ${(100 * grossFrac).toFixed(1)}% of ${r.seen} triangles read more than ${r.grossMm.toFixed(3)} mm from the surface at dims ${JSON.stringify(dimsOf(ctx))}. The worst mesh in this campaign is 0.928 mm at its MAX, so this is a geometry mismatch, not a quality result — build the context with the mesh's own dims. Raise grossAbortFrac only if you can say why.`);
    }
    firstRound = false;
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
  // THE GEOMETRY IS PART OF THE RESULT. A survivors count without the pot it was measured on is not a
  // measurement, and this file has already been bitten once by exactly that gap. `dimsExplicit: false` means
  // the caller never named a geometry and inherited the module default — the table is then only as good as
  // the assumption that the mesh was built at H=120/Rb=40/Rt=50, which nothing here has checked.
  return { nTri, rounds, survivors: idx ? Array.from(idx.slice(0, curN)) : [], nSurvivors: curN,
           certified: curN === 0, totalComputeMs: +totalMs.toFixed(1),
           dims: dimsOf(ctx), dimsExplicit: ctx?.dimsExplicit !== false };
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
  let stride = u32(ufield[${UF.STRIDE}u]);
  // CHUNKED, for the same TDR reason as the screen: this kernel costs (K+1)^2 rA evals per cell, so a
  // full 1024x512 grid at K=32 is ~571 M evals in one dispatch (~3.5 s at the measured 164 M/s) and the
  // Windows watchdog kills the device well before that. ufield[P3] carries the chunk's first cell index;
  // outR is sized to the CHUNK, so the bound test is local and the surface index is global.
  let local = gid.y * stride + gid.x;
  if (local >= arrayLength(&outR)) { return; }
  let cell = u32(ufield[${UF.P3}u]) + local;
  let H = ufield[${UF.H}u];
  let NU = u32(ufield[${UF.P0}u]); let NV = u32(ufield[${UF.P1}u]); let K = i32(ufield[${UF.P2}u]);
  if (cell >= NU * NV) { return; }
  let cu = cell % NU; let cv = cell / NU;
  let TAU2 = 6.2831853071795864;
  let th0 = TAU2 * f32(cu) / f32(NU); let th1 = TAU2 * f32(cu + 1u) / f32(NU);
  let z0 = H * f32(cv) / f32(NV);    let z1 = H * f32(cv + 1u) / f32(NV);
  let rAt = fn_r(th0, z0, H);
  let r00 = rAt;
  let r10 = fn_r(th1, z0, H);
  let r01 = fn_r(th0, z1, H);
  let r11 = fn_r(th1, z1, H);
  var worst = 0.0;
  for (var i: i32 = 0; i <= K; i = i + 1) {
    let a = f32(i) / f32(K);
    let th = th0 + (th1 - th0) * a;
    for (var j: i32 = 0; j <= K; j = j + 1) {
      let b = f32(j) / f32(K);
      let z = z0 + (z1 - z0) * b;
      let lin = (1.0-a)*(1.0-b)*r00 + a*(1.0-b)*r10 + (1.0-a)*b*r01 + a*b*r11;
      worst = max(worst, abs(fn_r(th, z, H) - lin));
    }
  }
  // KEEPS BINDING 1 LIVE — same trick as KERNEL_EVAL's ufield guard, and it is load-bearing for the SAME
  // reason. This kernel has no other reason to read \`samples\`, so \`layout:'auto'\` dropped binding 1 from the
  // pipeline layout, createBindGroup failed validation, the bind group was invalid and the dispatch was
  // silently discarded — the map read 0.000 um bulge for all 20 styles including 2 mm-relief ones. The
  // dropped-dispatch failure mode is now caught loudly by \`guardValidation\` regardless, but the reference
  // must stay: without it the pass does not run at all.
  if (ufield[${UF.H}u] > 1.0e30) { worst = samples[0] - 1.0; }
  outR[local] = worst;
}
// Same single base-radius implementation as KERNEL_SCREEN's fr_at — \`r_base\` from styles.wgsl, which reads
// Rt/Rb/expn/bell out of the ufield. This kernel used to carry its own \`Rb + (Rt - Rb) * t\`, a THIRD copy.
fn fn_r(th: f32, z: f32, H: f32) -> f32 {
  let t = clamp(z, 0.0, H) / H;
  return style_radius(0, th, t, r_base(t));
}`;

/**
 * Surface structure map. Returns the per-cell max departure of rA from its bilinear corner interpolant,
 * measured on a K x K sub-lattice, plus the sub-pitch that departure was measured at.
 */
export async function structureMap(dev, ctx, { nu = 1024, nv = 512, K = 32, chunkSamples = 1.5e8 } = {}) {
  const pipe = await getPipeline(dev, ctx.env + '\n' + KERNEL_STRUCT);
  return guardValidation(dev, 'structureMap', async () => {
  const D = dimsOf(ctx);
  const nCell = nu * nv;
  const map = new Float32Array(nCell);
  const bP = upload(dev, new Float32Array(ctx.params48));
  const bS = upload(dev, new Float32Array(16));
  const perCell = (K + 1) * (K + 1);
  // NO FLOOR — the same rule certifyMeshGpu states and for the same measured reason. `Math.max(4096, …)`
  // OVERRODE the eval budget exactly where it matters: at K = 256 the budget allows 2 271 cells and the
  // floor forced 4 096, i.e. ~270 M evals in one dispatch, straight through the Windows TDR watchdog. It
  // never bound at the K = 32 default, which is why it survived; that makes it a trap for the first caller
  // who raises K, not a tuning knob.
  const maxCells = Math.max(1, Math.floor(chunkSamples / perCell));
  let ms = 0;
  for (let base = 0; base < nCell; base += maxCells) {
    const cnt = Math.min(maxCells, nCell - base);
    const dd = dispatchDims(cnt);
    const bU = upload(dev, ufieldFor(ctx, dd.stride, [nu, nv, K, base]));
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
  // `subPitchUm` is the whole point of this map — it is what turns "resolving power ~11.5 um, unknown what is
  // below that" into a stated limit. It was computed from a hardcoded rNom = 50 regardless of style, context
  // or geometry, so on any larger pot it claimed to have looked below a scale it never reached (OD140, r = 70:
  // the true sub-pitch is 1.4x coarser than reported). Take the radius from the geometry actually dispatched.
  //
  // KNOWN REMAINING LOOSENESS, stated rather than hidden: this is the BASE radius bound. The theta sub-pitch
  // is an arc length rA*dtheta/K, and style relief pushes rA outside [Rb, Rt], so on a high-relief style the
  // true coarsest arc step is larger than reported — the same optimistic direction as the constant it
  // replaces, just far smaller. Bounding it exactly needs the max radius over the surface, which this kernel
  // does not return; `subPitchBaseOnly` marks the figure so no caller reads it as the whole story.
  const rNom = Math.max(D.Rb, D.Rt);
  const subPitchUm = Math.max((2 * Math.PI * rNom) / nu / K, D.H / nv / K) * 1000;
  return { map, nCell, ms: +ms.toFixed(1), evals: nCell * (K + 1) * (K + 1),
           maxBulgeUm: +(max * 1000).toFixed(3), argCell: arg, nonZeroCells: nz,
           subPitchUm: +subPitchUm.toFixed(3), subPitchBaseOnly: true,
           argTheta: +((2 * Math.PI * (arg % nu)) / nu).toFixed(5),
           // D.H, not DIMS.H: the kernel places row cv at z = D.H*cv/NV, so reporting the module default
           // here would locate the worst cell on a pot that was never dispatched.
           argZ: +((D.H * Math.floor(arg / nu)) / nv).toFixed(3) };
  });
}
