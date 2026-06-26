/**
 * conditionGraph.fidelity.test.ts — the FIDELITY gate (the hard constraint) +
 * joint parameter calibration for the conditioner.
 *
 * The conditioned graph must still cover the dense-truth feature loci: recall ≥ 0.9
 * AND precision ≥ 0.9 at CAL_TOL, on every style the RAW detector already passes.
 * We never trade a real feature for a cleaner skeleton. Calibration sweeps
 * minFeatureMm × junctionMergeMm and reports fidelity + cleanliness so the chosen
 * defaults are evidence-based.
 *
 * Heavy (detectFeatures + dense-truth per style) — gated behind PF_DERISK.
 *
 * @module conforming/featureGraph/conditionGraph.fidelity.test
 */

import { describe, it, expect } from 'vitest';
import { styleSampler } from './styleSampler';
import type { StyleSamplerDims } from './styleSampler';
import { detectFeatures } from './detectFeatures';
import type { DetectFeaturesOptions } from './detectFeatures';
import type { SurfaceSampler } from '../SurfaceSampler';
import type { FeatureGraph } from './types';
import type { StyleId } from '../../../../../geometry/types';
import { denseFeatureGroundTruth } from './groundTruth';
import type { FeatureLine } from '../FeatureLineGraph';
import { conditionGraph } from './conditionGraph';
import type { ConditionGraphOptions } from './conditionGraph';
import { fidelity } from './fidelityMetric';
import type { UtPoint } from './fidelityMetric';

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;
const FINE_RES = 120;
const CAL_TOL = U_TO_MM / FINE_RES; // ≈ 1.83 mm
const TRUTH_RES = 384;
const GATE = 0.9;

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40, fineRes: FINE_RES, minStrength: 1.0, minAngleDeg: 28,
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

interface Cached { graph: FeatureGraph; truth: FeatureLine[] }
const cache = new Map<string, Cached>();
function get(styleId: string): Cached {
  let c = cache.get(styleId);
  if (!c) {
    const s = styleSampler(styleId as StyleId, {}, DIMS);
    const graph = detectFeatures(s, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(s) });
    const truth = denseFeatureGroundTruth(s, { res: TRUTH_RES, uToMm: U_TO_MM, tToMm: T_TO_MM });
    c = { graph, truth };
    cache.set(styleId, c);
  }
  return c;
}

const edgePolys = (g: FeatureGraph): UtPoint[][] => g.edges.map((e) => e.polyline);
const truthPolys = (t: FeatureLine[]): UtPoint[][] => t.map((l) => l.points);

function condOpts(over: Partial<ConditionGraphOptions> = {}): ConditionGraphOptions {
  return { uToMm: U_TO_MM, tToMm: T_TO_MM, minFeatureMm: 2.5, simplifyTolMm: 0.75, junctionMergeMm: 3.5, ...over };
}

function spurCount(g: FeatureGraph): number {
  const deg = new Array(g.nodes.length).fill(0);
  for (const e of g.edges) { deg[e.endpoints[0]]++; deg[e.endpoints[1]]++; }
  return deg.filter((d) => d === 1).length;
}

const STYLE_IDS: string[] = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments',
  'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave', 'GeometricStar',
  'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
];

// CHOSEN defaults — from the op-isolation calibration above. Op isolation showed
// MERGE is recall-safe on every style (incl. the CelticTriquetra braid, 0.913 ≈
// raw 0.914) while PRUNE costs braid recall (0.897 < 0.9). So the fidelity-safe
// conditioner is MERGE + gentle SIMPLIFY with PRUNE OFF; spur noise is handled by
// Part A hysteresis (connectivity-based), not length-based pruning.
const CHOSEN: Partial<ConditionGraphOptions> = {
  prune: false,
  simplify: true,
  simplifyTolMm: 0.5,
  mergeJunctions: true,
  junctionMergeMm: 2.5,
};

describe.skipIf(!process.env.PF_DERISK)('conditionGraph — fidelity gate + calibration', () => {
  it('CALIBRATION: spurMaxSaliency sweep — clean noise without dropping real features', () => {
    /* eslint-disable no-console */
    const styles = ['Voronoi', 'GyroidManifold', 'HexagonalHive', 'CelticTriquetra', 'HarmonicRipple'];
    console.log('\n=== conditioner calibration: spurMaxSaliency sweep (minF=6, mergeMm=4, simplify=0.9) ===');
    for (const id of styles) {
      const { graph, truth } = get(id);
      const raw = fidelity(truthPolys(truth), edgePolys(graph), U_TO_MM, T_TO_MM, CAL_TOL);
      // raw spur-saliency distribution (degree-1 edges)
      const deg = new Array(graph.nodes.length).fill(0);
      for (const e of graph.edges) { deg[e.endpoints[0]]++; deg[e.endpoints[1]]++; }
      const spurSal = graph.edges.filter((e) => deg[e.endpoints[0]] === 1 || deg[e.endpoints[1]] === 1).map((e) => e.strength).sort((a, b) => a - b);
      const q = (p: number): number => spurSal.length ? spurSal[Math.floor(spurSal.length * p)] : 0;
      console.log(
        `\n${id}: RAW r/p=${raw.recall.toFixed(3)}/${raw.precision.toFixed(3)} spurs=${spurCount(graph)}  ` +
        `spur-saliency p10/p50/p90=${q(0.1).toFixed(1)}/${q(0.5).toFixed(1)}/${q(0.9).toFixed(1)}`,
      );
      console.log('  op            recall  prec   spurs  junctions');
      // Op isolation at fidelity-safe params (everything within ~CAL_TOL): find
      // which operation, if any, costs recall on tight-feature (braid) styles.
      const safe = { minFeatureMm: 2.5, junctionMergeMm: 2.5, simplifyTolMm: 0.9, spurMaxSaliency: 4 };
      const ops: Array<[string, Partial<ConditionGraphOptions>]> = [
        ['none', { prune: false, simplify: false, mergeJunctions: false }],
        ['prune-only', { prune: true, simplify: false, mergeJunctions: false }],
        ['simplify-only', { prune: false, simplify: true, mergeJunctions: false }],
        ['merge-only', { prune: false, simplify: false, mergeJunctions: true }],
        ['all', { prune: true, simplify: true, mergeJunctions: true }],
      ];
      for (const [name, toggles] of ops) {
        const cond = conditionGraph(graph, condOpts({ ...safe, ...toggles }));
        const f = fidelity(truthPolys(truth), edgePolys(cond), U_TO_MM, T_TO_MM, CAL_TOL);
        const jc = cond.nodeTypes.filter((t) => t === 'triple' || t === 'reflex' || t === 'highDegree').length;
        const flag = raw.recall >= GATE && f.recall < GATE ? '  <-- REGRESSED' : '';
        console.log(
          `  ${name.padEnd(13)} ${f.recall.toFixed(3)}  ${f.precision.toFixed(3)}  ${String(spurCount(cond)).padEnd(6)} ${jc}${flag}`,
        );
      }
    }
    /* eslint-enable no-console */
    expect(cache.size).toBeGreaterThan(0);
  }, 600000);

  it('HYSTERESIS (Part A): does the detector noise gate cut spurs recall-safely?', () => {
    /* eslint-disable no-console */
    const styles = ['Voronoi', 'GyroidManifold', 'HexagonalHive', 'CelticTriquetra', 'HarmonicRipple'];
    console.log('\n=== detector hysteresis noise gate (strongSaliency sweep) ===');
    console.log('style'.padEnd(16) + 'mode'.padEnd(10) + 'edges'.padEnd(8) + 'spurs'.padEnd(8) + 'recall'.padEnd(9) + 'prec');
    for (const id of styles) {
      const { truth } = get(id);
      const s = styleSampler(id as StyleId, {}, DIMS);
      const base = { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(s) };
      for (const strong of [0, 2, 3, 4]) {
        const g = detectFeatures(s, strong === 0 ? base : { ...base, hysteresis: { strongSaliency: strong } });
        const f = fidelity(truthPolys(truth), edgePolys(g), U_TO_MM, T_TO_MM, CAL_TOL);
        console.log(
          (strong === 0 ? id : '').padEnd(16) +
          (strong === 0 ? 'raw' : `hyst${strong}`).padEnd(10) +
          String(g.edges.length).padEnd(8) + String(spurCount(g)).padEnd(8) +
          f.recall.toFixed(3).padEnd(9) + f.precision.toFixed(3),
        );
      }
    }
    console.log('READ: pick the largest strongSaliency that cuts spurs/edges while keeping recall ≥ raw−ε.');
    /* eslint-enable no-console */
    expect(cache.size).toBeGreaterThan(0);
  }, 600000);

  it('FIDELITY GATE: conditioned graph preserves recall/precision ≥ 0.9 where raw passes (20 styles)', () => {
    /* eslint-disable no-console */
    console.log('\n=== fidelity gate: RAW vs CONDITIONED (recall/precision @ CAL_TOL) ===');
    console.log('style'.padEnd(22) + 'raw r/p'.padEnd(16) + 'cond r/p'.padEnd(16) + 'spurs r->c'.padEnd(14) + 'verdict');
    const regressions: string[] = [];
    for (const id of STYLE_IDS) {
      const { graph, truth } = get(id);
      const raw = fidelity(truthPolys(truth), edgePolys(graph), U_TO_MM, T_TO_MM, CAL_TOL);
      const cond = conditionGraph(graph, condOpts(CHOSEN));
      const c = fidelity(truthPolys(truth), edgePolys(cond), U_TO_MM, T_TO_MM, CAL_TOL);
      const rawPass = raw.recall >= GATE && raw.precision >= GATE;
      const condPass = c.recall >= GATE && c.precision >= GATE;
      const regressed = rawPass && !condPass;
      if (regressed) regressions.push(`${id} (raw ${raw.recall.toFixed(2)}/${raw.precision.toFixed(2)} -> cond ${c.recall.toFixed(2)}/${c.precision.toFixed(2)})`);
      console.log(
        id.padEnd(22) +
        `${raw.recall.toFixed(2)}/${raw.precision.toFixed(2)}`.padEnd(16) +
        `${c.recall.toFixed(2)}/${c.precision.toFixed(2)}`.padEnd(16) +
        `${spurCount(graph)}->${spurCount(cond)}`.padEnd(14) +
        (regressed ? 'REGRESSED' : rawPass ? 'ok' : 'raw<gate'),
      );
    }
    console.log(regressions.length === 0 ? '\nNo fidelity regressions.' : `\nREGRESSIONS: ${regressions.join('; ')}`);
    /* eslint-enable no-console */
    expect(regressions).toEqual([]);
  }, 900000);
});
