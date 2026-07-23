/* eslint-disable no-console */
// _pfCloseBambooWarpEffect.test.ts — DEV-ONLY (autonomous session 2026-07-23 evening).
// The t-warp FIRES for Bamboo (grid=8, non-identity). It is applied to the adopted wall's t BEFORE the GPU evaluates
// surface(u, ψ(t)). Question: does ψ move the emitter's rows off the intervals/creases they were sized for, re-busting
// the chord bound the sag-law fix established? Measure PRECISELY IN NODE (no GPU): apply the ACTUAL applyTWarp to the
// emitter's rows, then (1) check the tread pairs still bracket the surface steps at t=k/5, and (2) measure the true
// chord-sag of every body interval IN WARPED SURFACE SPACE. If the bracket breaks or worst body chord > 0.01, the warp
// is harmful to the adopted wall ⇒ exempt surfaceId 0 from the t-warp when a Tier-C emitter is adopted.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseBambooWarpEffect.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildBambooTSchedule } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import { extractAnalyticFeatures } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseTGrid, applyTWarp } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const NODE = 5;

function bambooTWarp() {
  const [, packed] = buildStyleParamPayload('BambooSegments', {});
  const graph = extractAnalyticFeatures('BambooSegments', Float32Array.from(packed as ArrayLike<number>), { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb }, { surfaceFidelityExact: false });
  const seen = new Set<number>(); const creaseT: number[] = [];
  for (const line of graph.lines) if (line.kind === 'horizontal-band') { const t = line.points[0].t; const k = Math.round(t * 1e7); if (!seen.has(k)) { seen.add(k); creaseT.push(t); } }
  return chooseCreaseTGrid(creaseT).warp;
}

describe('BambooSegments — is the adopted wall harmed by the t-warp?', () => {
  it('bracket + warped-space body chord after applyTWarp', () => {
    const rA = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);
    const rP = (z: number): number => rA(0, Math.max(0, Math.min(DIMS.H, z)));
    const warp = bambooTWarp();
    const creases: number[] = []; for (let k = 1; k < NODE; k++) creases.push(k / NODE);
    const crosses = (a: number, b: number): boolean => creases.some((e) => a < e - 1e-6 && b > e + 1e-6);
    const chordSag = (tA: number, tB: number): number => { const zA = tA * DIMS.H, zB = tB * DIMS.H, ra = rP(zA), rb = rP(zB); let w = 0; for (let i = 1; i < 100; i++) { const f = i / 100; w = Math.max(w, Math.abs(rP(zA + (zB - zA) * f) - (ra + (rb - ra) * f))); } return w; };
    console.log(`[WARPEFF] applyTWarp @creases: ${creases.map((c) => `${c}->${applyTWarp(warp, c).toFixed(4)}`).join(' ')}`);
    // Sweep the REAL pipeline tols: 0.003 = the default (high, cadFidelity clamps qMaxSag→CAD_SAG_MM); 0.01 = the new
    // emitter-CAD floor for draft/standard; 0.05 = a coarse request. If the warp busts even at 0.003, Bug-2 (the warp)
    // was the DEFAULT-pipeline killer (not the nodal sag-law, which is fine ≤0.01), and the exemption is the real fix.
    for (const sag of [0.05, 0.01, 0.003]) {
      const rows = buildBambooTSchedule(DIMS.H, rA, { sagTolMm: sag, nodeCount: NODE });
      const warped = rows.map((t) => applyTWarp(warp, t));
      let worst = 0, worstAt = -1;
      for (let i = 0; i + 1 < warped.length; i++) { if (crosses(warped[i], warped[i + 1])) continue; const s = chordSag(warped[i], warped[i + 1]); if (s > worst) { worst = s; worstAt = 0.5 * (warped[i] + warped[i + 1]); } }
      console.log(`[WARPEFF] sag=${sag} rows=${rows.length} worstBodyChordWARPED=${worst.toFixed(5)}mm @t≈${worstAt.toFixed(4)} ${worst <= 0.01 ? 'STILL-CLOSED' : 'WARP-BREAKS-IT'}`);
    }
    expect(true).toBe(true);
  });
});
