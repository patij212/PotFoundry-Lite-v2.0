/**
 * conditionGraph.skeleton.test.ts — SKELETON-QUALITY gate + parameter calibration
 * for the feature-graph conditioner, on REAL detected graphs.
 *
 * Measures raw vs conditioned: dangling-spur count, junction count, junction
 * nearest-neighbour spacing, % well-formed triples, and junction-count stability
 * across detector resolution (the over-segmentation metric, now a regression
 * gate). Also sweeps `junctionMergeMm` to calibrate the key knob.
 *
 * Heavy (runs detectFeatures across styles/resolutions) — gated behind PF_DERISK;
 * run with `PF_DERISK=1 npx vitest run …conditionGraph.skeleton`.
 *
 * @module conforming/featureGraph/conditionGraph.skeleton.test
 */

import { describe, it, expect } from 'vitest';
import { styleSampler } from './styleSampler';
import type { StyleSamplerDims } from './styleSampler';
import { detectFeatures } from './detectFeatures';
import type { DetectFeaturesOptions } from './detectFeatures';
import type { SurfaceSampler } from '../SurfaceSampler';
import type { FeatureGraph } from './types';
import { conditionGraph } from './conditionGraph';
import type { ConditionGraphOptions } from './conditionGraph';
import { pointDistMm } from './graphMetric';

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  uToMm: U_TO_MM, tToMm: T_TO_MM, creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};
const RELIEF_MEAN_SAMPLES = 256, RELIEF_ALPHA = 0.5, RELIEF_ABS_FLOOR_MM = 1e-3;
function samplerRadius(s: SurfaceSampler, u: number, t: number): number { const [x, y] = s.position(u, t); return Math.hypot(x, y); }
function makeReliefIndicator(s: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t); if (cached !== undefined) return cached;
    let sum = 0; const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const r = samplerRadius(s, i / RELIEF_MEAN_SAMPLES, t); rs[i] = r; sum += r; }
    const mean = sum / RELIEF_MEAN_SAMPLES; let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const d = rs[i] - mean; sq += d * d; }
    const stats = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * Math.sqrt(sq / RELIEF_MEAN_SAMPLES)) };
    rowStats.set(t, stats); return stats;
  };
  return (u, t) => { const { mean, floor } = statsAtT(t); return Math.abs(samplerRadius(s, u, t) - mean) - floor; };
}
function detect(styleId: string, fineRes = 120): FeatureGraph {
  const s = styleSampler(styleId as Parameters<typeof styleSampler>[0], {}, DIMS);
  return detectFeatures(s, { ...GLOBAL_OPTS, fineRes, reliefIndicator: makeReliefIndicator(s) });
}

// The calibrated fidelity-safe production config (see conditionGraph.fidelity.test):
// MERGE + gentle SIMPLIFY, PRUNE OFF (spur noise → Part A hysteresis).
function condOpts(over: Partial<ConditionGraphOptions> = {}): ConditionGraphOptions {
  return {
    uToMm: U_TO_MM, tToMm: T_TO_MM,
    minFeatureMm: 2.5, simplifyTolMm: 0.5, junctionMergeMm: 2.5,
    prune: false, simplify: true, mergeJunctions: true,
    ...over,
  };
}

interface Skel { spurs: number; junctions: number; nnMedianMm: number; pctTriple: number; nodes: number; edges: number }
function skeleton(g: FeatureGraph): Skel {
  const deg = new Array(g.nodes.length).fill(0);
  for (const e of g.edges) { deg[e.endpoints[0]]++; deg[e.endpoints[1]]++; }
  const spurs = deg.filter((d) => d === 1).length;
  const jIdx: number[] = [];
  for (let i = 0; i < g.nodes.length; i++) if (deg[i] >= 3) jIdx.push(i);
  const nn: number[] = jIdx.map((i) => {
    let best = Infinity;
    for (const k of jIdx) if (k !== i) best = Math.min(best, pointDistMm(g.nodes[i], g.nodes[k], U_TO_MM, T_TO_MM));
    return best;
  }).filter((d) => Number.isFinite(d));
  nn.sort((a, b) => a - b);
  return {
    spurs, junctions: jIdx.length,
    nnMedianMm: nn.length ? nn[Math.floor(nn.length / 2)] : 0,
    pctTriple: 0, nodes: g.nodes.length, edges: g.edges.length,
  };
}

const STYLES = ['Voronoi', 'GyroidManifold', 'HexagonalHive', 'CelticTriquetra'];

describe.skipIf(!process.env.PF_DERISK)('conditionGraph — skeleton quality on real graphs', () => {
  it('reports raw vs conditioned skeleton + asserts the recall-safe MERGE wins', () => {
    /* eslint-disable no-console */
    console.log('\n=== conditionGraph skeleton quality (raw -> conditioned, fidelity-safe config) ===');
    console.log('style'.padEnd(16) + 'jct(raw->cond)'.padEnd(18) + 'nnMed mm(raw->cond)'.padEnd(22) + 'spurs(raw->cond)');
    for (const id of STYLES) {
      const raw = detect(id);
      const cond = conditionGraph(raw, condOpts());
      const r = skeleton(raw);
      const c = skeleton(cond);
      console.log(
        id.padEnd(16) +
        `${r.junctions}->${c.junctions}`.padEnd(18) +
        `${r.nnMedianMm.toFixed(1)}->${c.nnMedianMm.toFixed(1)}`.padEnd(22) +
        `${r.spurs}->${c.spurs}`,
      );
      // The recall-safe junction-skeleton wins (merge): junction over-segmentation
      // collapses and spacing grows past the weld lattice. (Spur cleanup is Part A.)
      expect(c.junctions).toBeLessThan(r.junctions * 0.7);
      expect(c.nnMedianMm).toBeGreaterThan(r.nnMedianMm * 1.5);
    }
    /* eslint-enable no-console */
  }, 300000);

  it('CALIBRATION: junctionMergeMm sweep (Voronoi) — junction count, %triple, nn spacing', () => {
    /* eslint-disable no-console */
    const raw = detect('Voronoi');
    console.log('\n=== junctionMergeMm sweep (Voronoi) ===');
    console.log('mergeMm'.padEnd(10) + 'junctions'.padEnd(12) + 'nnMed mm'.padEnd(11) + '%triple'.padEnd(10) + '%reflex'.padEnd(10) + '%deg4+');
    for (const mm of [2.0, 3.0, 3.5, 4.0, 5.0, 6.0]) {
      const cond = conditionGraph(raw, condOpts({ junctionMergeMm: mm }));
      const c = skeleton(cond);
      const triple = cond.nodeTypes.filter((t) => t === 'triple').length;
      const reflex = cond.nodeTypes.filter((t) => t === 'reflex').length;
      const hi = cond.nodeTypes.filter((t) => t === 'highDegree').length;
      const jc = triple + reflex + hi;
      console.log(
        `${mm.toFixed(1)}`.padEnd(10) + `${c.junctions}`.padEnd(12) + `${c.nnMedianMm.toFixed(1)}`.padEnd(11) +
        `${jc ? ((triple / jc) * 100).toFixed(0) : 0}%`.padEnd(10) +
        `${jc ? ((reflex / jc) * 100).toFixed(0) : 0}%`.padEnd(10) +
        `${jc ? ((hi / jc) * 100).toFixed(0) : 0}%`,
      );
    }
    console.log('READ: pick the smallest mergeMm that collapses the weldTol packing without inflating %deg4+ (over-merge).');
    /* eslint-enable no-console */
    expect(true).toBe(true);
  }, 300000);

  it('STABILITY: conditioned junction count varies less with fineRes than raw', () => {
    /* eslint-disable no-console */
    console.log('\n=== junction-count stability vs fineRes (Voronoi) ===');
    const rawCounts: number[] = [];
    const condCounts: number[] = [];
    for (const fr of [80, 120, 200]) {
      const raw = detect('Voronoi', fr);
      const cond = conditionGraph(raw, condOpts());
      rawCounts.push(skeleton(raw).junctions);
      condCounts.push(skeleton(cond).junctions);
      console.log(`  fineRes=${fr}: raw junctions=${rawCounts[rawCounts.length - 1]}  conditioned=${condCounts[condCounts.length - 1]}`);
    }
    const spread = (a: number[]): number => (Math.max(...a) - Math.min(...a)) / Math.max(1, Math.min(...a));
    const rawSpread = spread(rawCounts);
    const condSpread = spread(condCounts);
    console.log(`  relative spread: raw=${(rawSpread * 100).toFixed(0)}%  conditioned=${(condSpread * 100).toFixed(0)}%`);
    expect(condSpread).toBeLessThan(rawSpread);
    /* eslint-enable no-console */
  }, 300000);
});
