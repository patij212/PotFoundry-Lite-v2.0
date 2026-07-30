// _gpuRankBridge.ts — the Node→GPU bridge. RESEARCH ONLY.
//
// WHY THIS EXISTS. The 2026-07-28 diagnosis closed on the driver's RANKING FUNCTION: `sagOfN` measures the
// distance from the surface to a triangle's INFINITE PLANE, which is small for exactly the facet that spans a
// feature, so the driver cannot see what it is failing to refine. The instrument that measures the right
// quantity — true perpendicular distance from points OF THE TRIANGLE to the surface — already exists in
// research/gpu/gpuRuler.js, cross-validates against the CPU auditor to within 2 points, and runs ~42x faster.
// It just could not be called: the mesher runs in Node under vitest and WebGPU needs a browser.
//
// THE TRANSPORT. The handoff proposed inverting research/tools/statusSink.cjs into an HTTP job broker. This
// does the same job with strictly less machinery: Playwright drives the INSTALLED Chrome, so Node holds a
// direct handle on the page and `page.evaluate` IS the call. No broker, no long-poll, no second process to
// keep alive — and, decisively, the whole run stays a single Node job, which is the only kind of job that
// survives between agent turns (research/lab traps #3/#4: a browser-console job dies to an HMR reload and
// notifies nobody).
//
// IT MUST BE THE INSTALLED CHROME. Playwright's bundled Chromium ships without dxil.dll, so Dawn's D3D12
// backend fails at `requestDevice` with "DynamicLib.Open: dxil.dll Windows Error: 87" — an adapter is granted
// and the device is then refused. `channel: 'chrome'` uses the installed browser, which has the DXC runtime.
// MEASURED here: bundled → device refused; channel 'chrome' headless → nvidia/turing, real device.
//
// THE PARITY GUARD IS NOT OPTIONAL. The GPU evaluates `style_radius` over a base radius it derives from the
// dispatched dims, while the mesher evaluates `buildRadiusFn`, which routes through `baseRadius(z,H,Rb,Rt,
// expn,opts)`. Those must be the same function, and nothing but this guard enforces it: a ranking function
// scoring a DIFFERENT surface from the mesher it steers would produce a plausible mesh that is wrong
// everywhere. So the bridge measures the disagreement at startup over a lattice and REFUSES to open if it
// exceeds `parityTolUm`. When two measurements that must agree disagree, that is the bug report.
//
// 2026-07-29: the guard used to hand the GPU its own r0 (computed here as the LINEAR `Rb + (Rt-Rb)*z/H`),
// which quietly narrowed it to a style_radius comparison and made it blind to the base profile — the exact
// place the missing `expn` was hiding. It now runs KERNEL_EVAL in `baseFromDims` mode, so the GPU derives r0
// through the same `r_base` the screen uses and the guard covers the WHOLE surface: geometry, flare
// exponent, bell and style. That is the only version of this check that is worth the name.
import { chromium, type Browser, type Page } from 'playwright';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

/** Vite dev server that serves both the app modules and research/. */
export const GPU_ORIGIN = process.env.PF_GPU_ORIGIN ?? 'http://127.0.0.1:3001';

/**
 * DEFAULT geometry, overridable per call via `GpuRankOpts.dims`. The GPU reconstructs its base radius from
 * these numbers, so they ARE the surface the ranking function scores against. While they were unreachable the
 * bridge always scored an H=120 pot whatever the mesher was building, and the parity guard could not catch it:
 * the guard compares rA VALUES between GPU and CPU, so a geometry mismatch shows up only as a side effect of
 * the lattice sampling z over the wrong range, not as the mismatch it is.
 */
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TWO_PI = 2 * Math.PI;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

export function registryDefaultsFor(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

export interface GpuRankOpts {
  /** registry style id, e.g. 'GothicArches' */
  style: string;
  /** style params; defaults to the registry defaults (what the mesher uses when PF_CB_PARAMS is unset) */
  params?: Record<string, number>;
  /** the mesher's OWN radius function, so the parity guard compares the two things that must agree */
  cpuRadius?: (th: number, z: number) => number;
  /** pot geometry the GPU scores against; MUST match the geometry the mesh under test was built at */
  dims?: StyleDims;
  /** barycentric lattice level for the screen (per-thread cost is O(n^2) — see gpuRuler's n<=192 note) */
  n?: number;
  gnIters?: number;
  closureEps?: number;
  /** triangles per GPU dispatch; adapts toward targetMs from here */
  chunk?: number;
  targetMs?: number;
  parityTolUm?: number;
  headless?: boolean;
  origin?: string;
  /** where page console errors go; default stderr */
  onPageLog?: (line: string) => void;
}

export interface GpuRank {
  /** max |GPU rA − CPU rA| over the startup lattice, in µm */
  readonly parityUm: number;
  /** the geometry the GPU is scoring against — echoed so a caller can assert it, not merely hope */
  readonly dims: StyleDims;
  /** score a triangle soup: returns 2 floats per triangle, [maxPerpDist, covRad], both in mm */
  score(xyz9: Float32Array, nTri: number): Promise<Float32Array>;
  close(): Promise<void>;
  readonly stats: { batches: number; tris: number; gpuMs: number; wallMs: number; deviceLosses: number };
}

/**
 * Is this failure worth rebuilding the browser for? A lost/destroyed device, a dropped dispatch or a dead
 * Playwright target are transient and a fresh page fixes them. A guard throw from gpuRuler — wrong geometry,
 * short buffer, dims disagreement — is a statement about the ARGUMENTS and survives any number of retries.
 */
const isDeviceFailure = (e: unknown): boolean =>
  /\bis lost\b|\bdevice lost\b|\bdestroyed\b|\badapter\b|dispatch dropped|out of memory|Target (page|closed)|Protocol error|browser has been closed/i.test(String(e));

const b64encode = (a: Float32Array): string => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const b64decode = (s: string): Float32Array => {
  const buf = Buffer.from(s, 'base64');
  // copy: Buffer's ArrayBuffer is pooled, so a view onto it would alias unrelated data
  const out = new Float32Array(buf.byteLength / 4);
  Buffer.from(out.buffer).set(buf);
  return out;
};

// PAGE-SIDE DYNAMIC IMPORT, VIA `new Function`. These callbacks are source-serialised into the browser, but
// vitest hands this file to Vite's SSR transform FIRST — which rewrites every real `import()` expression into
// `__vite_ssr_dynamic_import__`, an identifier that does not exist in the page. The import specifier has to
// reach the browser as a string, so it is built at runtime where no AST transform can see it.
const pageImport = "return (new Function('u', 'return import(u)'))";

/**
 * page-side setup: import the ruler, get a device and the style context, park them on window.
 *
 * It RETURNS the dims the context actually ended up holding, and the caller compares them. `dims` crosses
 * into the page through Playwright's serialiser, which drops `undefined` properties, and `styleContext`
 * defaults a missing argument to its own module constant — so "I passed dims" and "the kernels will use my
 * dims" are two different claims with a silent gap between them. That gap is the whole bug this file's
 * header is about; measure it rather than assume it closed.
 */
async function installPageRuler(
  page: Page, style: string, params: Record<string, number>, dims: StyleDims,
): Promise<StyleDims> {
  return await page.evaluate(async ([styleName, explicit, impSrc, d]) => {
    const w = window as unknown as Record<string, unknown>;
    const imp = new Function(impSrc as string)() as (u: string) => Promise<Record<string, unknown>>;
    const G = await imp('/research/gpu/gpuRuler.js') as unknown as {
      makeDevice: () => Promise<unknown>;
      styleContext: (s: string, dm: unknown) => Promise<{ merged: Record<string, number>; params48: number[]; dims: { H: number; Rb: number; Rt: number; expn?: number } }>;
    };
    const dev = await G.makeDevice();
    const ctx = await G.styleContext(styleName as string, d);
    // OVERRIDE the page's own defaults with the params the MESHER is actually using. styleContext derives
    // registry defaults independently; that is the right default but the wrong answer whenever the caller
    // meshed with something else (PF_CB_PARAMS). The packed payload is what the kernel reads, so it has to be
    // rebuilt from the caller's merged options or the GPU scores a different pot.
    const sp = await imp('/src/utils/styleParams.ts') as unknown as {
      buildStyleParamPayload: (s: string, o: Record<string, number>) => [number, number[]];
    };
    const merged = { ...ctx.merged, ...(explicit as Record<string, number>) };
    const [, params48] = sp.buildStyleParamPayload(styleName as string, merged);
    ctx.params48 = params48;
    ctx.merged = merged;
    w.__pfGr = { G, dev, ctx };
    return ctx.dims;
  }, [style, params, pageImport, dims] as const);
}

/** Throw unless the geometry that reached the page is the geometry the caller asked for. */
function assertPageDims(want: StyleDims, got: StyleDims): void {
  const same = Object.is(+want.H, +got.H) && Object.is(+want.Rb, +got.Rb) && Object.is(+want.Rt, +got.Rt)
    && Object.is(+(want.expn ?? 1), +(got.expn ?? 1));
  if (!same) {
    throw new Error(`gpuRank: the page's style context holds ${JSON.stringify(got)} but this bridge was opened for ${JSON.stringify(want)}. Every kernel reads the context, so the GPU would be scoring a pot nobody asked for.`);
  }
}

export async function openGpuRank(o: GpuRankOpts): Promise<GpuRank> {
  const style = o.style;
  const params = o.params ?? registryDefaultsFor(style);
  const n = o.n ?? 12;
  const gnIters = o.gnIters ?? 2;
  const closureEps = o.closureEps ?? 1e-6;
  const targetMs = o.targetMs ?? 250;
  const parityTolUm = o.parityTolUm ?? 2;
  const origin = o.origin ?? GPU_ORIGIN;
  const log = o.onPageLog ?? ((l: string): void => { process.stderr.write(`${l}\n`); });
  let chunk = o.chunk ?? 4096;
  const dims: StyleDims = { ...(o.dims ?? DIMS), expn: (o.dims ?? DIMS).expn ?? 1 };

  // A SUPPLIED cpuRadius CARRIES ITS OWN GEOMETRY, AND NOTHING HERE CAN SEE IT. `buildRadiusFn` closes over
  // the mesher's H/Rb/Rt/expn; passing that closure while leaving `dims` unset silently pairs the mesher's
  // pot with the module default on the GPU side. The parity guard below does catch it — an H mismatch moves
  // every t and the disagreement is enormous — but it reports "the two rulers disagree", which is a much
  // worse diagnosis than "you forgot to say what pot this is". Say the second one first.
  if (o.cpuRadius !== undefined && o.dims === undefined) {
    log(`  [gpuRank] cpuRadius supplied without dims — the GPU will score ${JSON.stringify(DIMS)}. If the mesh was built at anything else, pass { dims } too.`);
  }

  const cpuRadius = o.cpuRadius ?? buildRadiusFn(style as StyleId, params, dims);

  const launch = async (): Promise<{ browser: Browser; page: Page }> => {
    // channel 'chrome' — the bundled Chromium has no dxil.dll and its device request is refused. Failing to
    // launch is the RIGHT outcome if Chrome is absent: the alternative is a CPU/SwiftShader adapter quietly
    // producing numbers 100x slower, or none at all.
    const browser = await chromium.launch({ headless: o.headless !== false, channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
    const page = await browser.newPage();
    page.on('pageerror', (e) => log(`  [gpuRank page error] ${String(e).slice(0, 300)}`));
    page.on('console', (m) => { if (m.type() === 'error') log(`  [gpuRank page] ${m.text().slice(0, 300)}`); });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    // Checked on EVERY launch, not just the first — `launch()` is also the device-loss recovery path, and a
    // recovery that quietly rebuilt the page on default geometry would change the surface mid-run.
    assertPageDims(dims, await installPageRuler(page, style, params, dims));
    return { browser, page };
  };

  let { browser, page } = await launch();

  // ── the parity guard ────────────────────────────────────────────────────────────────────────────────────
  // offsetFrac keeps the θ lattice off exact jump loci, where the surface is genuinely two-valued and the two
  // implementations may legitimately pick different branches (gpuRuler's `parity` documents the same choice).
  const NU = 256; const NV = 128; const off = 0.37;
  const nS = NU * NV;
  const samples = new Float32Array(nS * 3);
  const cpu = new Float64Array(nS);
  {
    const { H } = dims;
    let k = 0;
    for (let i = 0; i < NU; i += 1) {
      for (let j = 0; j < NV; j += 1) {
        const th = (TWO_PI * (i + off)) / NU;
        const z = (H * j) / (NV - 1);
        // slot 2 is IGNORED in baseFromDims mode — the kernel derives r0 itself. Left at 0 rather than
        // filled with a plausible-looking base radius, so nobody reads this loop as still supplying one.
        samples[k * 3] = th; samples[k * 3 + 1] = z / H; samples[k * 3 + 2] = 0;
        cpu[k] = cpuRadius(th, z);
        k += 1;
      }
    }
  }
  const gpuR = b64decode(await page.evaluate(async ([b64, count]) => {
    const w = window as unknown as { __pfGr: { G: Record<string, unknown>; dev: unknown; ctx: unknown } };
    const { G, dev, ctx } = w.__pfGr;
    const bin = atob(b64 as string);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
    const f = new Float32Array(u8.buffer);
    const dispatch = G.dispatch as (d: unknown, c: unknown, k: unknown, s: Float32Array, m: number, op?: unknown) => Promise<Float32Array>;
    const out = await dispatch(dev, ctx, G.KERNEL_EVAL, f, count as number, { baseFromDims: true });
    let s = '';
    const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
  }, [b64encode(samples), nS] as const));
  let parityUm = 0;
  for (let i = 0; i < nS; i += 1) {
    const d = Math.abs(gpuR[i] - cpu[i]) * 1000;
    if (d > parityUm) parityUm = d;
  }
  if (!(parityUm <= parityTolUm)) {
    await browser.close();
    throw new Error(`gpuRank parity guard: GPU rA disagrees with the mesher's CPU rA by ${parityUm.toFixed(3)} µm over ${nS} samples (limit ${parityTolUm} µm) at dims ${JSON.stringify(dims)}. This compares the FULL surface — geometry, expn, bell and style — so a large disagreement most often means the dims passed here are not the dims the cpuRadius closure was built at. Do not run.`);
  }

  const stats = { batches: 0, tris: 0, gpuMs: 0, wallMs: 0, deviceLosses: 0 };

  /** one dispatch, page-side. Returns [ms, base64 of 2*count f32]. */
  const dispatchOne = async (part: Float32Array, count: number): Promise<{ ms: number; res: Float32Array }> => {
    const r = await page.evaluate(async ([b64, cnt, opts]) => {
      const w = window as unknown as { __pfGr: { G: Record<string, unknown>; dev: unknown; ctx: unknown } };
      const { G, dev, ctx } = w.__pfGr;
      const bin = atob(b64 as string);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
      const f = new Float32Array(u8.buffer);
      const screen = G.screenTriangles as (d: unknown, c: unknown, x: Float32Array, m: number, op: unknown) => Promise<{ res: Float32Array; computeMs: number; allZero: boolean }>;
      const s = await screen(dev, ctx, f, cnt as number, opts);
      // An all-zero result buffer is a DROPPED DISPATCH, not a measurement of zero — gpuRuler has been bitten
      // by this twice (1-D dispatch overflow, layout:'auto' pruning a binding). Refuse it here too: a silent
      // zero would read as "every triangle is perfect" and drain the heap.
      if (s.allZero) throw new Error('gpuRank: screen returned an all-zero buffer — dispatch dropped');
      let out = '';
      const bytes = new Uint8Array(s.res.buffer);
      for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { ms: s.computeMs, b64: btoa(out) };
    }, [b64encode(part), count, { n, gnIters, closureEps }] as const);
    return { ms: r.ms, res: b64decode(r.b64) };
  };

  const score = async (xyz9: Float32Array, nTri: number): Promise<Float32Array> => {
    const t0 = Date.now();
    const out = new Float32Array(nTri * 2);
    let base = 0;
    while (base < nTri) {
      // ADVANCE BY WHAT WAS ACTUALLY PROCESSED, never by the adaptive size — a `base += chunk` header reads
      // `chunk` after the body mutated it, so growth SKIPS triangles. In gpuRuler that produced a silent
      // FALSE PASS (a skipped triangle is never a survivor); here it would silently drop candidates from the
      // heap, which is the same defect wearing different clothes.
      const cnt = Math.min(chunk, nTri - base);
      const part = xyz9.subarray(base * 9, (base + cnt) * 9);
      let r: { ms: number; res: Float32Array };
      try {
        r = await dispatchOne(part, cnt);
      } catch (e) {
        // RE-ACQUIRE ONLY FOR DEVICE FAILURES. This used to retry on ANY throw, which is wrong for the
        // guard class the ruler now raises: a geometry mismatch or a short buffer is a property of the CALL,
        // so tearing down Chrome and rebuilding the page just runs the same bad call again, doubling the
        // wall-time and burying the real message under a device-loss line. Retry the transient, surface the
        // permanent immediately.
        if (!isDeviceFailure(e)) throw e;
        stats.deviceLosses += 1;
        log(`  [gpuRank] dispatch failed (${String(e).slice(0, 140)}) — re-acquiring the device`);
        try { await browser.close(); } catch { /* already gone */ }
        ({ browser, page } = await launch());
        r = await dispatchOne(part, cnt);
      }
      out.set(r.res, base * 2);
      stats.gpuMs += r.ms; stats.batches += 1;
      base += cnt;
      if (r.ms > 0) {
        const scale = Math.min(2, Math.max(0.25, targetMs / r.ms));
        chunk = Math.max(64, Math.min(Math.round(chunk * scale), 16384));
      }
    }
    stats.tris += nTri;
    stats.wallMs += Date.now() - t0;
    return out;
  };

  return {
    parityUm,
    dims,
    score,
    close: async (): Promise<void> => { await browser.close(); },
    stats,
  };
}
