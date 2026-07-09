// E-2026-07-09-VORONOI-TRUTHBRIDGE — measurement arm (pre-registered; see EXPERIMENT-REGISTRY.md).
// Scores the ALREADY-CAPTURED Voronoi production artifact (research/exchange/_prod_truth/Voronoi,
// captured 2026-07-09 by E-2026-07-09-PROD-ARTIFACT-TRUTH) against (a) the existing f64 truth
// (instrument-match gate — must reproduce the banked p99=0.065/max=0.140) and (b) the f32-emulated
// truth (_voronoi_truthbridge_lib.ts). DEV-ONLY; src/ never imports research/; this probe imports
// src/ READ-ONLY (STYLE_FUNCTIONS/baseRadius/DEFAULT_VORONOI) to build the reference radius fn,
// same pattern as every other research/bridge probe.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { baseRadius } from '../../src/geometry/profile';
import { DEFAULT_VORONOI } from '../../src/geometry/types';
import { buildRadiusFn } from './runStyle';
import { loadBinMesh } from './_pf_bvhRuler';
import { rOuterVoronoiF32, rOuterVoronoiF64Ref, cellArgminBothPrecisions } from './_voronoi_truthbridge_lib';

const ON = process.env.PF_VTB === '1';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TOL = 0.01;
const TAU = Math.PI * 2;
const ROOT = join('research', 'exchange', '_prod_truth', 'Voronoi');

const VPARAMS = {
  scale: DEFAULT_VORONOI.vScale,
  jitter: DEFAULT_VORONOI.vJitter,
  thickness: DEFAULT_VORONOI.vThickness,
  relief: DEFAULT_VORONOI.vRelief,
  morph: DEFAULT_VORONOI.vMorph,
  zStretch: DEFAULT_VORONOI.vZStretch,
  pulse: DEFAULT_VORONOI.vPulse,
  edgeFade: DEFAULT_VORONOI.vEdgeFade,
};

interface PctStats { max: number; p99: number; p50: number }
function pctStats(devs: Float64Array): PctStats {
  const a = devs.slice();
  a.sort();
  const n = a.length;
  return { max: n ? a[n - 1] : 0, p99: n ? a[Math.min(n - 1, Math.floor(0.99 * n))] : 0, p50: n ? a[Math.floor(0.5 * n)] : 0 };
}

describe('E-2026-07-09-VORONOI-TRUTHBRIDGE', () => {
  it.skipIf(!ON)('f32-emulated CPU truth vs f64 truth on the captured production artifact', () => {
    const outer = loadBinMesh(join(ROOT, 'outer.xyz.bin'), join(ROOT, 'outer.idx.bin'));
    const nV = outer.xyz.length / 3;
    const rA_f64prod = buildRadiusFn('Voronoi', {}, DIMS); // the EXISTING production f64 truth

    const devF64prod = new Float64Array(nV);
    const devF64ref = new Float64Array(nV); // local f64 re-derivation self-check
    const devF32 = new Float64Array(nV);
    let sanityWorst = -1, sanityIdx = -1;

    for (let v = 0; v < nV; v++) {
      const x = outer.xyz[v * 3], y = outer.xyz[v * 3 + 1];
      const z = Math.min(DIMS.H, Math.max(0, outer.xyz[v * 3 + 2]));
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      const rho = Math.hypot(x, y);
      const r0 = baseRadius(z, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn, DEFAULT_VORONOI);

      devF64prod[v] = Math.abs(rho - rA_f64prod(th, z));
      devF64ref[v] = Math.abs(rho - rOuterVoronoiF64Ref(th, z, r0, DIMS.H, VPARAMS));
      devF32[v] = Math.abs(rho - rOuterVoronoiF32(th, z, r0, DIMS.H, VPARAMS));
      if (devF64prod[v] > sanityWorst) { sanityWorst = devF64prod[v]; sanityIdx = v; }
    }

    const statsProd = pctStats(devF64prod);
    const statsRef = pctStats(devF64ref);
    const statsF32 = pctStats(devF32);

    console.log(
      `[voronoi-truthbridge] f64-PRODUCTION (instrument-match): max=${statsProd.max.toFixed(5)} p99=${statsProd.p99.toFixed(5)} p50=${statsProd.p50.toFixed(5)}`,
    );
    console.log(
      `[voronoi-truthbridge] f64-LOCAL-REF (self-check vs production, should ~match): max=${statsRef.max.toFixed(5)} p99=${statsRef.p99.toFixed(5)}`,
    );
    console.log(
      `[voronoi-truthbridge] f32-EMULATED (the hypothesis): max=${statsF32.max.toFixed(5)} p99=${statsF32.p99.toFixed(5)} p50=${statsF32.p50.toFixed(5)}`,
    );
    const improvement = statsProd.p99 / Math.max(statsF32.p99, 1e-12);
    console.log(`[voronoi-truthbridge] p99 improvement ratio (f64prod/f32): ${improvement.toFixed(2)}x`);

    // Divergence-locus classification: among the worst-by-f64 vertices, what fraction show a
    // MATERIAL f1/f2 argmin difference between f64 and f32-emulated at the SAME (theta,z)?
    const order = Array.from({ length: nV }, (_, i) => i).sort((a, b) => devF64prod[b] - devF64prod[a]);
    const K = Math.min(500, nV);
    let argminDiverge = 0;
    const ARGMIN_EPS = 0.003; // normalized (u,v) units — a real cell-boundary-scale difference
    for (let i = 0; i < K; i++) {
      const v = order[i];
      const x = outer.xyz[v * 3], y = outer.xyz[v * 3 + 1];
      const z = Math.min(DIMS.H, Math.max(0, outer.xyz[v * 3 + 2]));
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      const { f64, f32 } = cellArgminBothPrecisions(th, z, DIMS.H, VPARAMS);
      if (Math.abs(f64.f1 - f32.f1) > ARGMIN_EPS || Math.abs(f64.f2 - f32.f2) > ARGMIN_EPS) argminDiverge++;
    }
    console.log(
      `[voronoi-truthbridge] divergence-locus: ${argminDiverge}/${K} worst-by-f64 vertices show a material ` +
        `f1/f2 argmin difference between f64 and f32-emulated (>${ARGMIN_EPS} normalized units)`,
    );

    // INSTRUMENT-MATCH GATE (pre-registered): must reproduce the banked production numbers before
    // any f32-hypothesis conclusion is trusted.
    expect(statsProd.p99).toBeGreaterThan(0.055);
    expect(statsProd.p99).toBeLessThan(0.075);
    expect(statsProd.max).toBeGreaterThan(0.12);
    expect(statsProd.max).toBeLessThan(0.16);
    // Local f64 re-derivation must agree with production's exported f64 truth (confirms the port
    // is faithful before trusting the f32 comparison).
    expect(statsRef.p99).toBeCloseTo(statsProd.p99, 2);

    console.log(`[voronoi-truthbridge] worst-f64 vertex idx=${sanityIdx} dev=${sanityWorst.toFixed(5)}`);
  }, 600_000);
});
