/* eslint-disable no-console */
// _pfCloseBambooSmooth.test.ts — DEV-ONLY (autonomous session 2026-07-23).
// Bamboo ON now builds (pow2 fix) but measureProjectorMax reports 0.86 MAX = tread inflation (rA can't score the
// vertical asymVar tread walls). Disambiguate like ArtDeco: exclude the tread faces (t-span crossing a segment
// boundary t=k/nodeCount — where the emitter brackets the C0 asymVar step) and measure the SMOOTH complement vs rA.
// If ≤0.01 ⇒ Bamboo is TRULY closed (treads faithful-by-construction; the 0.86 was inflation). If it floors ⇒ real gap.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseBambooSmooth.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildBambooRingStripWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const NODE_COUNT = 5; // DEFAULT bsNodeCount

describe('BambooSegments — smooth-complement true-3D (treads excluded)', () => {
  it('excludes segment-boundary tread faces and measures the smooth surface', async () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const nU = 1024; // pow2; smooth complement closes at lower density than the full mesh needs for u-chord
    const wall = buildBambooRingStripWallGeometric(rA, DIMS.H, nU, { sagTolMm: 0.004, nodeCount: NODE_COUNT });
    const edges: number[] = [];
    for (let k = 1; k < NODE_COUNT; k++) edges.push(k / NODE_COUNT);

    const ut = wall.ut;
    const tOf = (vi: number): number => ut[2 * vi + 1];
    const I = wall.indices;
    const EPS = 1e-6;
    const keep: number[] = [];
    let treads = 0;
    for (let f = 0; f + 2 < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2];
      const lo = Math.min(tOf(a), tOf(b), tOf(c));
      const hi = Math.max(tOf(a), tOf(b), tOf(c));
      if (edges.some((e) => lo < e - EPS && hi > e + EPS)) treads++;
      else keep.push(a, b, c);
    }
    const smooth = { vertices: wall.vertices, indices: new Uint32Array(keep) };
    const rFull = await measureProjectorMax({ vertices: wall.vertices, indices: wall.indices }, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
    const rSmooth = await measureProjectorMax(smooth, rA, { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 });
    console.log(
      `[BBS] nU=${nU} tris=${I.length / 3} treads=${treads} | fullMax=${rFull.maxMm.toFixed(5)}(inflated) | ` +
        `SMOOTH max=${rSmooth.maxMm.toFixed(5)} chord=${rSmooth.chordMaxMm.toFixed(5)} vtx=${rSmooth.vertexMaxMm.toFixed(5)} ` +
        `p99=${rSmooth.p99Mm.toFixed(5)} | ${rSmooth.maxMm <= 0.01 ? 'SMOOTH CLOSES — treads were inflation, Bamboo TRULY closes' : 'SMOOTH FLOORS >' + rSmooth.maxMm.toFixed(3)}`,
    );
    expect(Number.isFinite(rSmooth.maxMm)).toBe(true);
  }, 1800000);
});
