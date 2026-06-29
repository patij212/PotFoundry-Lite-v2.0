/**
 * _diag_sfbFeatureKinds.derisk.test.ts — what features does the SFB extractor emit,
 * and are the petal VALLEYS (concave troughs) among them? The exact-eval folds sit
 * at the valley seam (r~44); if valleys aren't inserted, cells straddle them → fold.
 */
import { describe, it } from 'vitest';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';

const H = 120, R0 = 40;

describe.skipIf(!process.env.PF_DERISK)('SFB feature-kind census', () => {
  it('lists feature kinds + classifies each general-curve as peak/valley', () => {
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
    const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, { H, Rt: R0, Rb: R0, expn: 1 });

    const kinds: Record<string, number> = {};
    for (const l of graph.lines) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;

    // For each general-curve, sample radius at its midpoint AND just off it (±du) to
    // classify peak (local-max r) vs valley (local-min r).
    const gc = graph.lines.filter((l) => l.kind === 'general-curve');
    let peaks = 0, valleys = 0, flat = 0;
    const rAt = (u: number, t: number): number => { const p = sampler.position(u, t); return Math.hypot(p[0], p[1]); };
    for (const c of gc) {
      const m = c.points[Math.floor(c.points.length / 2)];
      const r0 = rAt(m.u, m.t), rL = rAt(m.u - 0.01, m.t), rR = rAt(m.u + 0.01, m.t);
      if (r0 > rL && r0 > rR) peaks++;
      else if (r0 < rL && r0 < rR) valleys++;
      else flat++;
    }

    // Independent ground truth: scan r(theta) at t=0.5, count local maxima (petals)
    // and minima (valleys).
    let nMax = 0, nMin = 0;
    const N = 2000;
    const rs: number[] = [];
    for (let i = 0; i < N; i++) rs.push(rAt(i / N, 0.5));
    for (let i = 0; i < N; i++) {
      const a = rs[(i - 1 + N) % N], b = rs[i], c = rs[(i + 1) % N];
      if (b > a && b > c) nMax++;
      if (b < a && b < c) nMin++;
    }

    /* eslint-disable no-console */
    console.log(`[SFB FEATURE KINDS] ${JSON.stringify(kinds)}`);
    console.log(`  general-curves: ${gc.length} → peaks=${peaks} valleys=${valleys} flat=${flat}`);
    console.log(`  ground-truth r(theta)@t=0.5: petal-maxima=${nMax} valley-minima=${nMin}`);
    console.log(`  ⇒ ${valleys === 0 ? 'VALLEYS NOT INSERTED (cells straddle them → folds)' : 'valleys present'}`);
    /* eslint-enable no-console */
  }, 120000);
});
