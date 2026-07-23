/* eslint-disable no-console */
// _pfCloseBambooTWarp.test.ts — DEV-ONLY (autonomous session 2026-07-23 evening).
// Does the post-assembly t-warp FIRE for BambooSegments? The pipeline applies creaseTChoice.warp to the adopted outer
// wall (surfaceId<1.5) BEFORE the GPU re-evaluates (u,ψ(t)). If ψ is non-identity it remaps our verify-bisect body rows
// off the intervals they were sized for — potentially re-busting the chord bound the fix just established. The warp is
// built from featureGraph 'horizontal-band' lines (ParametricExportComputer.ts:2731-2747). Replicate that selection
// EXACTLY for Bamboo (both surfaceFidelityExact off=default and on) and report whether chooseCreaseTGrid is identity.
// Identity ⇒ the adopted Bamboo wall is NOT t-warped ⇒ the GPU mesh == the emitter re-eval ⇒ the fix survives the pipe.
// Run: npx vitest run --config vitest.closure.config.ts research/bridge/_pfCloseBambooTWarp.test.ts
import { describe, it, expect } from 'vitest';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import { extractAnalyticFeatures } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';

const DIMS = { H: 120, Rb: 45, Rt: 70 };

describe('BambooSegments — does the post-assembly t-warp fire?', () => {
  for (const sfe of [false, true]) {
    it(`crease-T warp identity? (surfaceFidelityExact=${sfe})`, () => {
      const [, packed] = buildStyleParamPayload('BambooSegments', {});
      const graph = extractAnalyticFeatures(
        'BambooSegments',
        Float32Array.from(packed as ArrayLike<number>),
        { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
        { surfaceFidelityExact: sfe },
      );
      const kinds = new Map<string, number>();
      for (const l of graph.lines) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
      const creaseTSet = new Set<number>();
      const creaseT: number[] = [];
      for (const line of graph.lines) {
        if (line.kind === 'horizontal-band') {
          const t = line.points[0].t;
          const key = Math.round(t * 1e7);
          if (creaseTSet.has(key)) continue;
          creaseTSet.add(key);
          creaseT.push(t);
        }
      }
      const choice = chooseCreaseTGrid(creaseT);
      console.log(`[TWARP sfe=${sfe}] lineKinds=${JSON.stringify([...kinds])} horizBandTs=[${creaseT.map((t) => t.toFixed(4)).join(',')}] warp.isIdentity=${choice.warp.isIdentity} grid=${choice.grid} level=${choice.level}`);
    });
  }
});
