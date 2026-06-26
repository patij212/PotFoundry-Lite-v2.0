/**
 * junctionWedge.conditioning.test.ts — STEP 3 (throwaway) junction graph-CONDITIONING
 * de-risk: are the reflex (21-53% of deg-3) + degree-4+ junction nodes DETECTOR
 * ARTIFACTS (fixable upstream) or REAL geometry (need N-arm fans / typing)?
 *
 * A generic Voronoi vertex is degree-3 with all sectors < 180° (the three cell
 * walls meet ~120° apart). So reflex (one sector > 180°, the arms bunched on one
 * side) and degree-4+ nodes are NOT generic — they are either (a) detection
 * artifacts (the two-scale fired-cell + unifier weldTol=1/fineRes merges two nearby
 * triple points into a deg-4, or mis-places arms near a junction so the layout reads
 * reflex), or (b) real near-tangent/branch geometry. Whole-wall integration must
 * know which: (a) ⇒ a junction-TYPING / split-merge pass cleans it; (b) ⇒ a true
 * N-arm fan primitive is required.
 *
 * Two discriminators (measure-first):
 *   1. fineRes SWEEP — if reflex% / deg4+% SHRINK as detector resolution rises, they
 *      are a detection-resolution artifact (better detection splits the merge).
 *   2. NEAREST-JUNCTION DISTANCE — if reflex / deg4+ nodes sit systematically CLOSER
 *      to another junction than well-formed nodes do, they are crowding/weld-merge
 *      artifacts (two true triple points fused inside weldTol).
 *
 * Throwaway; touches no production code.
 *
 * @module fidelity/bandRemesh/junctionWedge.conditioning.test
 */

import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { SurfaceSampler, Vec3 } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;

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
function optsAt(s: SurfaceSampler, coarseRes: number, fineRes: number): DetectFeaturesOptions {
  return {
    coarseRes, fineRes, minStrength: 1.0, minAngleDeg: 28, uToMm: U_TO_MM, tToMm: T_TO_MM,
    creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
    reliefIndicator: makeReliefIndicator(s),
  };
}

function sub3(a: Vec3, b: Vec3): [number, number, number] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len3(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
function norm3(a: Vec3): [number, number, number] { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
const METRIC_EPS = 1e-4;

function utDistMm(au: number, at: number, bu: number, bt: number): number {
  let d = Math.abs(au - bu) % 1; if (d > 0.5) d = 1 - d;
  return Math.hypot(d * U_TO_MM, (at - bt) * T_TO_MM);
}

interface NodeInfo { u: number; t: number; degree: number; kind: 'wellformed' | 'reflex' | 'deg4plus' | 'other' }

function classifyNodes(graph: FeatureGraph, sampler: SurfaceSampler): NodeInfo[] {
  const degree = new Map<number, number>();
  for (const e of graph.edges) for (const idx of e.endpoints) degree.set(idx, (degree.get(idx) ?? 0) + 1);

  // incident azimuths per node (same construction as the de-risk spikes)
  const incident = new Map<number, number[]>();
  const add = (nodeIdx: number, dir: { du: number; dt: number } | null): void => {
    if (!dir) return;
    const node = graph.nodes[nodeIdx];
    const p0 = sampler.position(node.u, node.t);
    const ps = sampler.position(node.u + dir.du * METRIC_EPS, node.t + dir.dt * METRIC_EPS);
    const d3 = norm3(sub3(ps, p0));
    const eu = norm3(sub3(sampler.position(node.u + METRIC_EPS, node.t), sampler.position(node.u - METRIC_EPS, node.t)));
    let ev = sub3(sampler.position(node.u, node.t + METRIC_EPS), sampler.position(node.u, node.t - METRIC_EPS));
    const pr = dot3(ev, eu); ev = [ev[0] - pr * eu[0], ev[1] - pr * eu[1], ev[2] - pr * eu[2]];
    const evn = norm3(ev);
    const arr = incident.get(nodeIdx) ?? []; arr.push(Math.atan2(dot3(d3, evn), dot3(d3, eu))); incident.set(nodeIdx, arr);
  };
  for (const e of graph.edges) {
    const poly = e.polyline; if (poly.length < 2) continue;
    const [ia, ib] = e.endpoints; if (ia === ib) continue;
    const dirFrom = (nodeIdx: number): { du: number; dt: number } | null => {
      const node = graph.nodes[nodeIdx];
      const dH = utDistMm(node.u, node.t, poly[0].u, poly[0].t);
      const dT = utDistMm(node.u, node.t, poly[poly.length - 1].u, poly[poly.length - 1].t);
      const seq = dH <= dT ? poly : [...poly].reverse();
      for (let k = 1; k < seq.length; k++) {
        let su = (seq[k].u - node.u) % 1; if (su > 0.5) su -= 1; if (su < -0.5) su += 1;
        const dt = seq[k].t - node.t;
        if (utDistMm(node.u, node.t, seq[k].u, seq[k].t) > 0.5) { const l = Math.hypot(su, dt) || 1; return { du: su / l, dt: dt / l }; }
      }
      return null;
    };
    add(ia, dirFrom(ia)); add(ib, dirFrom(ib));
  }

  const out: NodeInfo[] = [];
  for (const [idx, deg] of degree) {
    if (deg < 3) continue;
    const node = graph.nodes[idx];
    let kind: NodeInfo['kind'] = 'other';
    if (deg >= 4) kind = 'deg4plus';
    else {
      const az = incident.get(idx);
      if (az && az.length === 3) {
        const s = [...az].sort((a, b) => a - b);
        let maxW = 0;
        for (let i = 0; i < 3; i++) { let g = s[(i + 1) % 3] - s[i]; if (g <= 0) g += 2 * Math.PI; maxW = Math.max(maxW, (g * 180) / Math.PI); }
        kind = maxW > 180 ? 'reflex' : 'wellformed';
      }
    }
    out.push({ u: node.u, t: node.t, degree: deg, kind });
  }
  return out;
}

/** Nearest OTHER junction-node distance (mm) for each node. */
function nearestNeighborMm(nodes: NodeInfo[]): number[] {
  return nodes.map((a, i) => {
    let best = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const d = utDistMm(a.u, a.t, nodes[j].u, nodes[j].t);
      if (d < best) best = d;
    }
    return best;
  });
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0; const v = [...arr].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

describe('STEP 3 — junction graph-conditioning: reflex/deg4+ artifact vs real', () => {
  const STYLES = ['Voronoi', 'GyroidManifold'];

  it('DISCRIMINATOR 1: fineRes sweep — does reflex%/deg4+% shrink as detection sharpens?', () => {
    /* eslint-disable no-console */
    console.log('\n=== fineRes sweep (coarseRes=40): reflex% of deg3, deg4+% of all junctions ===');
    console.log('style'.padEnd(16) + 'fineRes'.padEnd(9) + 'deg3'.padEnd(7) + 'reflex%'.padEnd(9) + 'deg4+'.padEnd(7) + 'deg4+%');
    for (const id of STYLES) {
      const s = styleSampler(id as Parameters<typeof styleSampler>[0], {}, DIMS);
      for (const fineRes of [80, 120, 200]) {
        const g = detectFeatures(s, optsAt(s, 40, fineRes));
        const nodes = classifyNodes(g, s);
        const deg3 = nodes.filter((n) => n.degree === 3).length;
        const reflex = nodes.filter((n) => n.kind === 'reflex').length;
        const deg4 = nodes.filter((n) => n.kind === 'deg4plus').length;
        const all = nodes.length;
        console.log(
          id.padEnd(16) + String(fineRes).padEnd(9) + String(deg3).padEnd(7) +
          `${((reflex / Math.max(1, deg3)) * 100).toFixed(0)}%`.padEnd(9) + String(deg4).padEnd(7) +
          `${((deg4 / Math.max(1, all)) * 100).toFixed(0)}%`,
        );
      }
    }
    console.log('READ: shrinking with fineRes ⇒ detection-resolution artifact; stable ⇒ intrinsic.');
    /* eslint-enable no-console */
    expect(STYLES.length).toBeGreaterThan(0);
  }, 240000);

  it('DISCRIMINATOR 2: are reflex/deg4+ nodes CROWDED (closer to a neighbour than well-formed)?', () => {
    /* eslint-disable no-console */
    console.log('\n=== nearest-junction distance by node kind (mm), default fineRes=120 ===');
    console.log('style'.padEnd(16) + 'wellformed(med)'.padEnd(18) + 'reflex(med)'.padEnd(14) + 'deg4+(med)'.padEnd(14) + 'weldTol≈1.83mm');
    for (const id of STYLES) {
      const s = styleSampler(id as Parameters<typeof styleSampler>[0], {}, DIMS);
      const g = detectFeatures(s, optsAt(s, 40, 120));
      const nodes = classifyNodes(g, s);
      const nn = nearestNeighborMm(nodes);
      const byKind = (k: NodeInfo['kind']): number => median(nodes.map((n, i) => ({ n, d: nn[i] })).filter((x) => x.n.kind === k).map((x) => x.d));
      console.log(
        id.padEnd(16) +
        `${byKind('wellformed').toFixed(1)}`.padEnd(18) +
        `${byKind('reflex').toFixed(1)}`.padEnd(14) +
        `${byKind('deg4plus').toFixed(1)}`.padEnd(14) +
        '',
      );
    }
    console.log('READ: reflex/deg4+ median ≪ wellformed median (and near weldTol) ⇒ crowding/weld-merge artifact.');
    /* eslint-enable no-console */
    expect(STYLES.length).toBeGreaterThan(0);
  }, 240000);
});
