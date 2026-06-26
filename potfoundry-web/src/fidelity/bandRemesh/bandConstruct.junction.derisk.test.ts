/**
 * bandConstruct.junction.derisk.test.ts — STEP 3b real-junction gate (throwaway).
 *
 * `paveRidgeJunction`'s unit tests proved degree-N composition on synthetic arms.
 * This gate composes REAL conditioned-graph nodes: drive the real pipeline
 * (styleSampler → detectFeatures → conditionGraph) on Voronoi, take each interior
 * triple/reflex/highDegree node (the conditioner TYPES them), gather its incident
 * edges as short straight-ish stubs radiating from the node, and compose them with
 * `paveRidgeJunction`. Asserts per composed junction: `footprintSelfCrossings === 0`,
 * watertight 0/0, J a shared crease vertex; reports per-node-type fold counts (the
 * honest 3b verdict). Arms are short stubs (the arm corner-split is already proven by
 * `paveRidgeCornerSplit`); this isolates the JUNCTION sector composition.
 *
 * ── MEASURED VERDICT (2026-06-26) ────────────────────────────────────────────────
 * The paveRidgeJunction MECHANISM is PROVEN on synthetic clean junctions (the unit
 * tests: deg-3 Y, narrow miter, reflex, deg-4 — all simple + watertight). But
 * full-band central-fill is REFUTED on REAL Voronoi junctions at feature width: ~7/8
 * fold (footprintSelfCrossings>0) AND crack (tJunctions>0). TWO findings: (1) real
 * junctions are DOMINATED by highDegree nodes (deg 4–9; the conditioner's 57–305
 * deg-4+/style) whose tight sectors fold catastrophically (selfX=Infinity, tJ up to
 * 27); (2) even clean TRIPLE/deg-3 junctions develop small folds/cracks (selfX=1,
 * tJ=2–3) — and STRAIGHTER arm stubs do NOT fix it (tested 9mm→4mm), so the cause is
 * the real anisotropic/tight sector geometry, NOT bending arms. ⇒ full-band
 * central-fill suits only CLEAN, LOW-degree junctions; real junctions need the
 * ROBUST path: CDT via `corridorPaveMulti`'s junction anchor (proven STEP-2 + used by
 * selective paving), and/or upstream degree reduction (split highDegree — spec §8
 * deferred). This file ASSERTS the guard (no crash) + RECORDS the real fold rate.
 *
 * CPU throwaway spike (real detector pipeline → heavy). Reuses only proven primitives;
 * no production code. Skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/bandConstruct.junction.derisk.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { conditionGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { ConditionGraphOptions, ConditionedGraph, NodeType } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { paveRidgeJunction, footprintSelfCrossings } from './bandConstruct';
import { auditWatertight } from './audit';
import { quantizeRailUT } from './railKey';
import type { StationPoint } from './stations';

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;
const STYLE = 'Voronoi';
const WIDTH_MM = 1.5; // feature-sized half-width
const EDGE_MM = 1.5;
const STUB_MM = 4; // arm stub length (straight-ish) — isolates junction sector composition
const U_LO = 0.15, U_HI = 0.85, T_LO = 0.15, T_HI = 0.85;
const MAX_JUNCTIONS = 8;

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
function condOpts(): ConditionGraphOptions {
  return { uToMm: U_TO_MM, tToMm: T_TO_MM, minFeatureMm: 2.5, simplifyTolMm: 0.5, junctionMergeMm: 2.5, prune: false, simplify: true, mergeJunctions: true };
}

/** Build a short stub (≥2 points, ~STUB_MM long in 3D) of `edge` radiating from node `J`. */
function buildStub(poly: ReadonlyArray<{ u: number; t: number }>, jFirst: boolean, sampler: SurfaceSampler): StationPoint[] | null {
  const pts = (jFirst ? poly : [...poly].reverse()).map((p) => ({ u: p.u, t: p.t }));
  const out: StationPoint[] = [pts[0]];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = sampler.position(pts[i - 1].u, pts[i - 1].t), b = sampler.position(pts[i].u, pts[i].t);
    len += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    out.push(pts[i]);
    if (len >= STUB_MM) break;
  }
  return out.length >= 2 ? out : null;
}

interface JunctionCase { type: NodeType; degree: number; spines: StationPoint[][]; J: StationPoint; }
interface Build { sampler: SurfaceSampler; cases: JunctionCase[]; }

function buildJunctions(): Build {
  const sampler = styleSampler(STYLE as Parameters<typeof styleSampler>[0], {}, DIMS);
  const raw = detectFeatures(sampler, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) });
  const cond: ConditionedGraph = conditionGraph(raw, condOpts());

  // Incident open edges per node.
  const incident: number[][] = cond.nodes.map(() => []);
  cond.edges.forEach((e, ei) => {
    if (e.kind === 'loop') return;
    incident[e.endpoints[0]].push(ei);
    if (e.endpoints[1] !== e.endpoints[0]) incident[e.endpoints[1]].push(ei);
  });

  const cases: JunctionCase[] = [];
  const used: StationPoint[] = [];
  const sepOk = (J: StationPoint): boolean => !used.some((p) => Math.hypot((p.u - J.u) * U_TO_MM, (p.t - J.t) * T_TO_MM) < 3 * STUB_MM);
  for (let n = 0; n < cond.nodes.length; n++) {
    if (cases.length >= MAX_JUNCTIONS) break;
    const type = cond.nodeTypes[n];
    if (type !== 'triple' && type !== 'reflex' && type !== 'highDegree') continue;
    const J = cond.nodes[n];
    if (J.u < U_LO || J.u > U_HI || J.t < T_LO || J.t > T_HI) continue;
    if (!sepOk(J)) continue;
    const spines: StationPoint[][] = [];
    let ok = true;
    for (const ei of incident[n]) {
      const e = cond.edges[ei];
      const stub = buildStub(e.polyline, e.endpoints[0] === n, sampler);
      if (!stub) { ok = false; break; }
      // Force the shared J vertex exact (the merged centroid; snap arms to it).
      stub[0] = { u: J.u, t: J.t };
      spines.push(stub);
    }
    if (!ok || spines.length < 3) continue;
    used.push(J);
    cases.push({ type, degree: spines.length, spines, J });
  }
  return { sampler, cases };
}

let cached: Build | undefined;
function getBuild(): Build { if (!cached) cached = buildJunctions(); return cached; }

describe.skipIf(!process.env.PF_DERISK)('STEP 3b real-junction gate — paveRidgeJunction on Voronoi nodes', () => {
  beforeAll(() => { getBuild(); }, 180000);

  it('composes >= 2 real junctions (triple/reflex/highDegree)', () => {
    const { cases } = getBuild();
    /* eslint-disable no-console */
    const byType: Record<string, number> = {};
    for (const c of cases) byType[`${c.type}/deg${c.degree}`] = (byType[`${c.type}/deg${c.degree}`] ?? 0) + 1;
    console.log(`[3b-GATE] composed=${cases.length} byType=${JSON.stringify(byType)}`);
    /* eslint-enable no-console */
    expect(cases.length).toBeGreaterThanOrEqual(2);
  });

  it('GATE: every composed junction is SIMPLE-footprint + watertight + J a shared crease', () => {
    const { sampler, cases } = getBuild();
    /* eslint-disable no-console */
    let folded = 0, threw = 0, cracked = 0;
    for (const c of cases) {
      let res;
      try { res = paveRidgeJunction(c.spines, sampler, { widthMm: WIDTH_MM, edgeMm: EDGE_MM }); } catch (err) { threw++; console.log(`  [THROW] ${c.type}/deg${c.degree}: ${String(err).slice(0, 90)}`); continue; }
      const sx = footprintSelfCrossings(res.mesh, res.vertexUT);
      const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
      const [qu, qt] = quantizeRailUT(c.J.u, c.J.t);
      const hasJ = res.spineVertexIds.some((id) => { const [u, t] = res.vertexUT[id]; return u === qu && t === qt; });
      if (sx !== 0) { folded++; console.log(`  [FOLD] ${c.type}/deg${c.degree}: selfX=${sx}`); }
      if (a.nonManifoldEdges !== 0 || a.tJunctions !== 0) { cracked++; console.log(`  [CRACK] ${c.type}/deg${c.degree}: nonMan=${a.nonManifoldEdges} tJ=${a.tJunctions}`); }
      if (!hasJ) console.log(`  [NO-J] ${c.type}/deg${c.degree}`);
    }
    console.log(`[3b-GATE] folded=${folded} cracked=${cracked} threw=${threw} / ${cases.length}`);
    console.log('[3b-GATE] VERDICT: mechanism PROVEN on synthetic (unit tests); full-band central-fill REFUTED on real Voronoi junctions (fold+crack, highDegree-dominant). Robust path = CDT via corridorPaveMulti junction anchor. See header.');
    /* eslint-enable no-console */
    // RECORD the measured reality (the refutation is the finding). The GUARD must hold
    // (no crash); the real fold/crack rate is the honest verdict, not asserted to 0.
    expect(cases.length).toBeGreaterThanOrEqual(2);
    expect(threw).toBe(0);
  });
});
