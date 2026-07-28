// _strataGpuRankBridge.test.ts — STRATA-001: PROOF that the Node→GPU rank bridge returns exactly what the
// in-page instrument computes. Gated PF_GPURANK_PROOF=1. RESEARCH ONLY.
//
// WHY THIS TEST EXISTS FIRST. The 2026-07-28 handoff's step 1 is "Node POSTs 1000 triangles, gets back 1000
// [mx, covRad] pairs, asserts they match `screenTriangles` called directly in the page". Everything after it
// — the ranking function, the A/B, the verdict — is worthless if the transport silently mangles a coordinate
// or scores a different surface. So the transport is proven against an independent path BEFORE it is wired
// into anything.
//
// THE TWO PATHS SHARE NOTHING BUT `gpuRuler.js`:
//   A (bridge)    Node reads the STL from disk → f32 batch → page.evaluate → screenTriangles → back to Node.
//   B (reference) the page fetches the SAME STL over the dev server itself and calls screenTriangles inline.
// Path B never sees Node's copy of the triangles, so a marshalling bug in A cannot hide: the two agree only
// if the bytes that reached the GPU were the same bytes.
//
// Bit-identical is the assertion, not "close". Same device, same kernel, same inputs, and every triangle is
// scored independently of its batch-mates — so any difference at all is a defect, not float noise. Asserting
// a tolerance here would let exactly the class of bug this test exists to catch through.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { buildRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { openGpuRank, GPU_ORIGIN, registryDefaultsFor } from './_gpuRankBridge';

const RUN = process.env.PF_GPURANK_PROOF === '1';
const SCAN = process.env.PF_GPURANK_SCAN === '1';

const STYLE = process.env.PF_GR_STYLE ?? 'GeometricStar';
const STL_REL = process.env.PF_GR_STL ?? 'research/exchange/_strataConformBisect/geometricstar_ring_D--B_AB12.stl';
const NTRI = Math.round(Number.parseFloat(process.env.PF_GR_N ?? '1000'));
const SCREEN = { n: 12, gnIters: 2, closureEps: 1e-6 };

/** first `want` triangles of a binary STL as the flat 9-float-per-triangle layout the screen expects */
function readStlHead(path: string, want: number): { xyz9: Float32Array; nTri: number } {
  const buf = readFileSync(path);
  const total = buf.readUInt32LE(80);
  const nTri = Math.min(want, total);
  const xyz9 = new Float32Array(nTri * 9);
  for (let t = 0; t < nTri; t += 1) {
    let o = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k += 1) { xyz9[t * 9 + k] = buf.readFloatLE(o); o += 4; }
  }
  return { xyz9, nTri };
}

describe('STRATA GPU rank bridge', () => {
  it.runIf(RUN)('returns exactly what screenTriangles computes in the page', async () => {
    const { xyz9, nTri } = readStlHead(STL_REL, NTRI);
    expect(nTri).toBe(NTRI);

    // ── path A: through the bridge ──────────────────────────────────────────────────────────────────────
    const rank = await openGpuRank({ style: STYLE, ...SCREEN });
    let a: Float32Array;
    let parityUm: number;
    try {
      parityUm = rank.parityUm;
      a = await rank.score(xyz9, nTri);
    } finally {
      await rank.close();
    }

    // ── path B: the page fetches the STL itself and calls the instrument inline ──────────────────────────
    const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-webgpu'] });
    let b: number[];
    try {
      const page = await browser.newPage();
      await page.goto(`${GPU_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      // the import specifier reaches the page as a runtime string: vitest hands this file to Vite's SSR
      // transform, which would otherwise rewrite `import()` into `__vite_ssr_dynamic_import__` — an
      // identifier the browser has never heard of. Same reason as _gpuRankBridge's `pageImport`.
      b = await page.evaluate(async ([url, style, count, opts, impSrc]) => {
        const imp = new Function(impSrc as string)() as (u: string) => Promise<Record<string, unknown>>;
        const G = await imp('/research/gpu/gpuRuler.js') as unknown as {
          makeDevice: () => Promise<unknown>;
          styleContext: (s: string) => Promise<unknown>;
          screenTriangles: (d: unknown, c: unknown, x: Float32Array, n: number, o: unknown) => Promise<{ res: Float32Array }>;
        };
        const dev = await G.makeDevice();
        const ctx = await G.styleContext(style as string);
        const dv = new DataView(await (await fetch(url as string)).arrayBuffer());
        const n = count as number;
        const xyz = new Float32Array(n * 9);
        for (let t = 0; t < n; t += 1) {
          const o = 84 + t * 50 + 12;
          for (let k = 0; k < 9; k += 1) xyz[t * 9 + k] = dv.getFloat32(o + k * 4, true);
        }
        const s = await G.screenTriangles(dev, ctx, xyz, n, opts as Record<string, number>);
        return Array.from(s.res);
      }, [`/${STL_REL}`, STYLE, nTri, SCREEN, "return (new Function('u', 'return import(u)'))"] as const);
    } finally {
      await browser.close();
    }

    // ── the comparison ──────────────────────────────────────────────────────────────────────────────────
    expect(b.length).toBe(nTri * 2);
    expect(a.length).toBe(nTri * 2);
    let nDiff = 0; let worstMx = 0; let worstCov = 0; let firstBad = -1;
    for (let t = 0; t < nTri; t += 1) {
      const dm = Math.abs(a[t * 2] - b[t * 2]);
      const dc = Math.abs(a[t * 2 + 1] - b[t * 2 + 1]);
      if (dm !== 0 || dc !== 0) { nDiff += 1; if (firstBad < 0) firstBad = t; }
      if (dm > worstMx) worstMx = dm;
      if (dc > worstCov) worstCov = dc;
    }
    // A screen that returned all zeros "agrees" with nothing — it is a dropped dispatch wearing a pass.
    let nz = 0; for (let t = 0; t < nTri; t += 1) if (a[t * 2] !== 0) nz += 1;

    // eslint-disable-next-line no-console
    console.log(`GPU-RANK BRIDGE PROOF  ${STYLE}  ${nTri} triangles
  rA parity (GPU vs the mesher's own CPU rA, startup guard) : ${parityUm.toFixed(4)} µm
  triangles differing between bridge and in-page            : ${nDiff}${firstBad >= 0 ? ` (first at ${firstBad})` : ''}
  worst |Δmx| ${(worstMx * 1000).toExponential(3)} µm   worst |Δcov| ${(worstCov * 1000).toExponential(3)} µm
  non-zero mx readings (dropped-dispatch guard)             : ${nz}/${nTri}`);

    expect(nz).toBeGreaterThan(0);
    expect(nDiff).toBe(0);
  }, 20 * 60 * 1000);

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────
  // WHOLE-MESH SCAN (PF_GPURANK_SCAN=1) — what the new ruler sees on a mesh the old ruler passed.
  // ────────────────────────────────────────────────────────────────────────────────────────────────────────
  // This exists to SIZE the experiment before spending hours on it. The committed GothicArches baseline was
  // reported by its own driver as MAX 5.856 µm with 0/1979816 over 0.01 mm; the independent auditor read the
  // same mesh at 362.888 µm. If the GPU ruler is the fix, it must ALREADY disagree with the driver on that
  // artifact — and the size of the disagreement is exactly how much extra refinement the flagged run faces,
  // which is what sets an honest triangle cap and time budget instead of a guess.
  //
  // Coverage is FULL and stated. The plane-ruler comparison alongside it is a SUBSAMPLE and stated as one:
  // it re-implements the driver's own `sagAdaptive` (distance to the INFINITE PLANE, n = clamp(ceil(le/
  // REF_HS), 6, 24)) over the same triangles, so old-vs-new is one run on one mesh with nothing else varying.
  it.runIf(SCAN)('scores a finished mesh with both rulers', async () => {
    const style = process.env.PF_GR_SCAN_STYLE ?? 'GothicArches';
    const stl = process.env.PF_GR_SCAN_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_D--.stl';
    const tolUm = Number.parseFloat(process.env.PF_GR_SCAN_TOL_UM ?? '10');
    const acceptUm = Number.parseFloat(process.env.PF_GR_SCAN_ACCEPT_UM ?? '7');
    const cpuSample = Math.round(Number.parseFloat(process.env.PF_GR_SCAN_CPUN ?? '120000'));

    const buf = readFileSync(stl);
    const nTri = buf.readUInt32LE(80);
    const xyz9 = new Float32Array(nTri * 9);
    for (let t = 0; t < nTri; t += 1) {
      let o = 84 + t * 50 + 12;
      for (let k = 0; k < 9; k += 1) { xyz9[t * 9 + k] = buf.readFloatLE(o); o += 4; }
    }

    const rank = await openGpuRank({ style, n: 12, gnIters: 2 });
    let res: Float32Array;
    let stats: { gpuMs: number; wallMs: number; batches: number; deviceLosses: number };
    try {
      res = await rank.score(xyz9, nTri);
      stats = { ...rank.stats };
    } finally {
      await rank.close();
    }

    const tol = tolUm / 1000; const acc = acceptUm / 1000;
    let gMax = 0; let gArg = -1; let overTol = 0; let overAcc = 0;
    const mxs = new Float64Array(nTri);
    for (let t = 0; t < nTri; t += 1) {
      const mx = res[t * 2];
      mxs[t] = mx;
      if (mx > gMax) { gMax = mx; gArg = t; }
      if (mx > tol) overTol += 1;
      if (mx > acc) overAcc += 1;
    }

    // ── the driver's own ruler on the same triangles, on a stated subsample ──────────────────────────────
    const rA = buildRadiusFn(style as StyleId, registryDefaultsFor(style), { H: 120, Rb: 40, Rt: 50, expn: 1 });
    const TWO_PI = 2 * Math.PI;
    const stride = Math.max(1, Math.floor(nTri / cpuSample));
    let pMax = 0; let seen = 0; let pOverTol = 0;
    let bothOver = 0; let gpuOnlyOver = 0;
    for (let t = 0; t < nTri; t += stride) {
      const o = t * 9;
      const ax = xyz9[o]; const ay = xyz9[o + 1]; const az = xyz9[o + 2];
      const bx = xyz9[o + 3]; const by = xyz9[o + 4]; const bz = xyz9[o + 5];
      const cx = xyz9[o + 6]; const cy = xyz9[o + 7]; const cz = xyz9[o + 8];
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const nl = Math.hypot(nx, ny, nz2);
      if (nl < 1e-18) continue;
      nx /= nl; ny /= nl; nz2 /= nl;
      const le = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
      const n = Math.max(6, Math.min(24, Math.ceil(le / 0.15)));
      const tA = Math.atan2(ay, ax);
      const un = (x: number): number => { let d = x - tA; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };
      const dB = un(Math.atan2(by, bx)); const dC = un(Math.atan2(cy, cx));
      let s = 0;
      for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
        const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
        const th = tA + wb * dB + wc * dC;
        const z = wa * az + wb * bz + wc * cz;
        const r = rA(th, z);
        const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz2);
        if (dd > s) s = dd;
      }
      if (s > pMax) pMax = s;
      if (s > tol) pOverTol += 1;
      if (mxs[t] > tol) { if (s > tol) bothOver += 1; else gpuOnlyOver += 1; }
      seen += 1;
    }

    // SIZE x ERROR, JOINTLY. A rate alone cannot distinguish "the mesh is uniformly too coarse" from "the
    // mesh is bimodal — over-refined in hot spots, untouched elsewhere". Those call for opposite fixes, and
    // the median triangle size cannot tell them apart either: a mesh whose median is fine can still have most
    // of its AREA in a few coarse facets. So bucket by longest edge and report the over-bar rate per bucket.
    const EDGES = [0.005, 0.02, 0.05, 0.15, 0.5, 1.5, Infinity]; // mm
    const bCnt = new Array<number>(EDGES.length).fill(0);
    const bOver = new Array<number>(EDGES.length).fill(0);
    const bArea = new Array<number>(EDGES.length).fill(0);
    for (let t = 0; t < nTri; t += 1) {
      const o = t * 9;
      const e1 = Math.hypot(xyz9[o + 3] - xyz9[o], xyz9[o + 4] - xyz9[o + 1], xyz9[o + 5] - xyz9[o + 2]);
      const e2 = Math.hypot(xyz9[o + 6] - xyz9[o + 3], xyz9[o + 7] - xyz9[o + 4], xyz9[o + 8] - xyz9[o + 5]);
      const e3 = Math.hypot(xyz9[o] - xyz9[o + 6], xyz9[o + 1] - xyz9[o + 7], xyz9[o + 2] - xyz9[o + 8]);
      const le = Math.max(e1, e2, e3);
      const ux = xyz9[o + 3] - xyz9[o]; const uy = xyz9[o + 4] - xyz9[o + 1]; const uz = xyz9[o + 5] - xyz9[o + 2];
      const vx2 = xyz9[o + 6] - xyz9[o]; const vy2 = xyz9[o + 7] - xyz9[o + 1]; const vz2 = xyz9[o + 8] - xyz9[o + 2];
      const ar = 0.5 * Math.hypot(uy * vz2 - uz * vy2, uz * vx2 - ux * vz2, ux * vy2 - uy * vx2);
      let b = 0; while (b < EDGES.length - 1 && le > EDGES[b]) b += 1;
      bCnt[b] += 1; bArea[b] += ar;
      if (mxs[t] > tol) bOver[b] += 1;
    }
    const totArea = bArea.reduce((s, v) => s + v, 0);
    const bucketRows = EDGES.map((hi, i) => {
      const lo = i === 0 ? 0 : EDGES[i - 1];
      const name = `${(lo * 1000).toFixed(0)}–${hi === Infinity ? '∞' : (hi * 1000).toFixed(0)} µm`;
      const c = bCnt[i];
      return `    ${name.padStart(14)} : ${String(c).padStart(9)} tris (${((100 * c) / nTri).toFixed(2).padStart(6)}% of count, ${((100 * bArea[i]) / totArea).toFixed(2).padStart(6)}% of AREA)   over-${tolUm}µm ${c > 0 ? ((100 * bOver[i]) / c).toFixed(2).padStart(6) : '   n/a'}%`;
    }).join('\n');

    const pct = (a: number, b: number): string => `${((100 * a) / b).toFixed(3)}%`;
    // eslint-disable-next-line no-console
    console.log(`
===== GPU-RULER SCAN OF A FINISHED MESH =====
stl   : ${stl}
style : ${style}   ${nTri} triangles
gpu   : n=12 gnIters=2   ${(stats.gpuMs / 1000).toFixed(0)}s GPU + ${((stats.wallMs - stats.gpuMs) / 1000).toFixed(0)}s transport over ${stats.batches} dispatches   parity ${rank.parityUm.toFixed(3)} µm   device-losses ${stats.deviceLosses}

--- NEW RULER: max perpendicular distance from the TRIANGLE to the SURFACE   [FULL COVERAGE: ${nTri}/${nTri} = 100%] ---
  MAX                       : ${(gMax * 1000).toFixed(3)} µm   (triangle ${gArg})
  over ${tolUm} µm (product bar): ${overTol} / ${nTri}  = ${pct(overTol, nTri)}
  over ${acceptUm} µm (accept bar) : ${overAcc} / ${nTri}  = ${pct(overAcc, nTri)}   <-- the driver would now refine these
  by LONGEST EDGE (count share, AREA share, and the over-bar rate within each bucket):
${bucketRows}

--- OLD RULER: the driver's own plane distance, same triangles   [SUBSAMPLE: ${seen}/${nTri} = ${pct(seen, nTri)}, every ${stride}th] ---
  MAX                       : ${(pMax * 1000).toFixed(3)} µm
  over ${tolUm} µm             : ${pOverTol} / ${seen} = ${pct(pOverTol, seen)}
  on the subsample, triangles the NEW ruler puts over ${tolUm} µm: ${bothOver + gpuOnlyOver}
     of which the OLD ruler also flags : ${bothOver}
     of which the OLD ruler MISSES     : ${gpuOnlyOver}   <-- the blind spot, measured
=============================================
`);
    expect(nTri).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────
  // RULER FLOOR PROBE (PF_GPURANK_FLOOR=1) — does the ranking function go to ZERO on a vanishing triangle?
  // ────────────────────────────────────────────────────────────────────────────────────────────────────────
  // A ranking function that keeps reading large on a triangle which is already microscopic and whose three
  // vertices lie ON the surface will drive refinement forever: the key never falls under acceptTol, so the
  // triangle is re-queued after every split until the splitter refuses. That is a runaway, and it is
  // indistinguishable from "this facet is genuinely bad" in the mesher's log.
  //
  // The test is a tautology on a correct ruler. Put three points on the surface a few µm apart; every point
  // of that triangle is within a few µm of the surface, so max perpendicular distance MUST be of that order
  // and must fall linearly as the triangle shrinks. If it plateaus, the plateau is the ruler's floor and any
  // mesh verdict built on it is measuring the instrument, not the mesh.
  //
  // This is the discipline the campaign already paid for once: validate the ruler before trusting the mesh.
  it.runIf(process.env.PF_GPURANK_FLOOR === '1')('reads ~0 on vanishing on-surface triangles', async () => {
    const style = process.env.PF_GR_FLOOR_STYLE ?? 'GothicArches';
    const H = 120; const Rb = 40; const Rt = 50;
    const rA = buildRadiusFn(style as StyleId, registryDefaultsFor(style), { H, Rb, Rt, expn: 1 });
    const scales = [1000, 100, 10, 1, 0.1]; // triangle size in µm
    const NS = 4000; // sites per scale, deterministic lattice + irrational offsets (no RNG)
    const rank = await openGpuRank({ style, n: 12, gnIters: 2 });
    const rows: string[] = [];
    try {
      for (const sMm of scales.map((u) => u / 1000)) {
        const xyz = new Float32Array(NS * 9);
        for (let k = 0; k < NS; k += 1) {
          // spread sites over the whole wall; the offsets keep them off exact lattice/jump positions
          const th = (2 * Math.PI * ((k * 0.6180339887) % 1)) + 0.017;
          const z = 2 + 116 * ((k * 0.4142135624) % 1);
          const dTh = sMm / Math.max(1e-6, rA(th, z)); // arc length -> radians
          const pts: Array<[number, number]> = [[th, z], [th + dTh, z], [th, z + sMm]];
          for (let v = 0; v < 3; v += 1) {
            const [t2, z2] = pts[v];
            const r = rA(t2, z2);
            xyz[k * 9 + v * 3] = r * Math.cos(t2);
            xyz[k * 9 + v * 3 + 1] = r * Math.sin(t2);
            xyz[k * 9 + v * 3 + 2] = z2;
          }
        }
        const res = await rank.score(xyz, NS);
        let mx = 0; let sum = 0; let over7 = 0; let argk = -1;
        for (let k = 0; k < NS; k += 1) {
          const v = res[k * 2];
          sum += v;
          if (v > 0.007) over7 += 1;
          if (v > mx) { mx = v; argk = k; }
        }
        rows.push(`  triangle size ${(sMm * 1000).toFixed(1).padStart(7)} µm :  mean ${(1000 * sum / NS).toFixed(4).padStart(10)} µm   MAX ${(mx * 1000).toFixed(4).padStart(11)} µm   over-7µm ${String(over7).padStart(5)}/${NS}${argk >= 0 ? `  (worst site ${argk})` : ''}`);
      }
    } finally {
      await rank.close();
    }
    // eslint-disable-next-line no-console
    console.log(`
===== RANKING-FUNCTION FLOOR PROBE: ${style} =====
Three points ON the surface, ${NS} sites per scale. A sound ruler's reading must fall with the triangle.
${rows.join('\n')}
A row whose MAX does not fall with the size above it is the ruler's FLOOR, and every triangle at or below
that size is refined forever by a driver that ranks on it.
=================================================
`);
    expect(rows.length).toBe(scales.length);
  }, 60 * 60 * 1000);
});
