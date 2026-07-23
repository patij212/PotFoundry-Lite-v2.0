/* eslint-disable no-console */
// _pfCloseBambooFilter.test.ts — DEV-ONLY (autonomous session 2026-07-23 evening).
// Hypothesis #4: the pipeline's tread-aware smoothMax=0.121 is a RULER ARTIFACT of the CRUDE geometric tread filter
// (measureProjectorMax {treadRadiusSpreadMm:0.1} = exclude faces whose vertex-RADIUS-spread > 0.1mm), NOT a fidelity
// loss. The crude filter can't see a tread face whose radius-spread happens to fall < 0.1mm (e.g. a low-relief node or
// a warp-slanted tread) — that face's ~half-step chord (~0.12 = half the asymVar step) then LEAKS into "smoothMax".
// The bridge's PRECISE filter (exclude faces whose t-span crosses a step locus t=k/nodeCount) has no such leak → 0.0045.
// DECISIVE: build ONE mesh at the EXACT pipeline config (nU=2048, sagTolMm=qMaxSag=0.05) and measure it BOTH ways.
// crude ≫ precise on the IDENTICAL mesh ⇒ the 0.121 is the filter, and Bamboo genuinely closes in production.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseBambooFilter.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildBambooRingStripWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const NODE_COUNT = 5;
const NU = 2048;
const SAG = 0.05; // the pipeline default qMaxSag (high profile epsPosMm)

describe('BambooSegments — precise vs crude tread filter on ONE pipeline-config mesh', () => {
  it('smooth-complement MAX: t-band (precise) vs radius-spread>0.1 (crude, the pipeline ruler)', async () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const wall = buildBambooRingStripWallGeometric(rA, DIMS.H, NU, { sagTolMm: SAG, nodeCount: NODE_COUNT });
    const V = wall.vertices, ut = wall.ut, I = wall.indices;

    // (a) PRECISE t-band filter — exclude any face whose t-span crosses an interior step locus t=k/nodeCount.
    const edges: number[] = [];
    for (let k = 1; k < NODE_COUNT; k++) edges.push(k / NODE_COUNT);
    const tOf = (vi: number): number => ut[2 * vi + 1];
    const keepPrecise: number[] = [];
    for (let f = 0; f + 2 < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2];
      const lo = Math.min(tOf(a), tOf(b), tOf(c)), hi = Math.max(tOf(a), tOf(b), tOf(c));
      if (!edges.some((e) => lo < e - 1e-6 && hi > e + 1e-6)) keepPrecise.push(a, b, c);
    }
    const rP = await measureProjectorMax({ vertices: V, indices: new Uint32Array(keepPrecise) }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });

    // (b) CRUDE geometric filter — replicate measureProjectorMax's treadRadiusSpreadMm classifier exactly:
    // a face is a "riser" iff max(|v|_xz) - min(|v|_xz) > 0.1mm across its 3 vertices. Keep the REST.
    const radOf = (vi: number): number => Math.hypot(V[3 * vi], V[3 * vi + 2]);
    const keepCrude: number[] = [];
    for (let f = 0; f + 2 < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2];
      const ra = radOf(a), rb = radOf(b), rc = radOf(c);
      const spread = Math.max(ra, rb, rc) - Math.min(ra, rb, rc);
      if (spread <= 0.1) keepCrude.push(a, b, c);
    }
    const rC = await measureProjectorMax({ vertices: V, indices: new Uint32Array(keepCrude) }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });

    console.log(`[BFILT] tris=${I.length / 3} nU=${NU} sag=${SAG}`);
    console.log(`[BFILT] PRECISE t-band : keptTris=${keepPrecise.length / 3} smoothMax=${rP.maxMm.toFixed(5)} p99=${rP.p99Mm.toFixed(5)}`);
    console.log(`[BFILT] CRUDE  rspread : keptTris=${keepCrude.length / 3} smoothMax=${rC.maxMm.toFixed(5)} p99=${rC.p99Mm.toFixed(5)}`);
    console.log(`[BFILT] VERDICT: ${rC.maxMm > rP.maxMm * 3 ? 'CRUDE-FILTER-ARTIFACT (0.121 is the ruler, Bamboo closes)' : 'NOT-filter — real inflation, chase warp/WGSL'}`);
    expect(true).toBe(true);
  }, 1200000);
});
