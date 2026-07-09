/**
 * _dispatchSignals.test.ts — DEV-ONLY signal-measurement probe
 * (E-2026-07-09-DISPATCH-PREDICATE, PF_DISPATCHSIG=1).
 *
 * §V12 fired the kill: the production dispatch predicate
 * `isCountUnstableStyle = countJunctionNodes(graph) > 0` selects 17/20 styles.
 * Raw junction COUNT does not separate the intended count-unstable pair
 * (Gothic 163 / GeoStar 230) from smooth/relief junction NOISE (Wave 219,
 * ArtDeco 349, Voronoi 263). This probe measures candidate replacement signals
 * on ALL 20 styles (detector-level, no meshing) and dumps one ndjson row per
 * style so a clean margin (ideally an order of magnitude, not a knife-edge)
 * can be picked — or the allow-list interim justified.
 *
 * Signals measured per style (at TIER_C_DETECT_OPTS unless noted):
 *   RAW:      nodes, edges, junctions (deg>=3), maxDeg
 *   (a) junction DENSITY = junctions / totalArcLenMm  (noise scales with
 *       spurious segments, not real feature length ⇒ density should separate)
 *   (b) count-INSTABILITY across scales: run detectFeatures at fineRes 120 and
 *       240; report junctions@120, junctions@240, and the ratio. Genuine
 *       birth/merge networks keep junctions as scale doubles; noise junctions
 *       (weld-lattice crossings of smooth relief) should EXPLODE with res.
 *   (c) CHAIN-WEIGHTED junction score: connected-component arc-length of the
 *       edge graph; fraction of junctions living on components whose total arc
 *       length >= a physical floor (long connected ribs) vs short stubs.
 *   (d) CONDITIONED graph: run conditionGraph (prune + merge weld-lattice
 *       clusters + node typing) and report the surviving junction/triple/
 *       reflex/highDegree counts. The conditioner is PURPOSE-BUILT to collapse
 *       the ~2000-spur weld-lattice noise into a stable skeleton — the residual
 *       junctions after conditioning are the real birth/merge nodes.
 *
 * ONE env-gated probe; appends per style the INSTANT it is computed (resilience).
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { STYLE_FUNCTIONS } from '../../../../../geometry/styles';
import type { StyleId } from '../../../../../geometry/types';
import { styleSampler } from '../featureGraph/styleSampler';
import { detectFeatures } from '../featureGraph/detectFeatures';
import type { FeatureGraph } from '../featureGraph/types';
import { conditionGraph } from '../featureGraph/conditionGraph';
import { polyLengthMm } from '../featureGraph/graphMetric';
import { TIER_C_DETECT_OPTS } from './detectOpts';
import { countJunctionNodes } from './countUnstable';

const RUN = process.env.PF_DISPATCHSIG === '1';
const OUT = 'research/exchange/_dispatch_predicate';
const NDJSON = `${OUT}/signals.ndjson`;

const DIMS = { H: 120, Rt: 50, Rb: 40 };
// The intended count-unstable pair (birth/merge feature networks).
const UNSTABLE = new Set<StyleId>(['GothicArches', 'GeometricStar']);

/** degree array over the graph edges (loop endpoints count twice). */
function degrees(graph: FeatureGraph): number[] {
  const deg = new Array<number>(graph.nodes.length).fill(0);
  for (const e of graph.edges) {
    deg[e.endpoints[0]] += 1;
    deg[e.endpoints[1]] += 1;
  }
  return deg;
}

/** Total feature arc-length (mm) over every edge polyline. */
function totalArcLenMm(graph: FeatureGraph, uToMm: number, tToMm: number): number {
  let tot = 0;
  for (const e of graph.edges) tot += polyLengthMm(e.polyline, uToMm, tToMm);
  return tot;
}

/**
 * (c) connected components of the node graph (edges connect endpoints); for
 * each component sum its edge arc-lengths, and count how many deg>=3 junctions
 * live on components whose total arc length >= floorMm. Returns:
 *   { compCount, junctionsOnLong, junctionsTotal, longFrac, maxCompArcMm }.
 */
function chainWeighted(
  graph: FeatureGraph,
  uToMm: number,
  tToMm: number,
  floorMm: number,
): {
  compCount: number;
  junctionsOnLong: number;
  junctionsTotal: number;
  longFrac: number;
  maxCompArcMm: number;
} {
  const n = graph.nodes.length;
  const parent = new Array<number>(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    let c = x;
    while (parent[c] !== r) {
      const nx = parent[c];
      parent[c] = r;
      c = nx;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const arcOf = new Array<number>(n).fill(0); // per-endpoint accumulation, then per-root
  for (const e of graph.edges) union(e.endpoints[0], e.endpoints[1]);
  const compArc = new Map<number, number>();
  for (const e of graph.edges) {
    const r = find(e.endpoints[0]);
    compArc.set(r, (compArc.get(r) ?? 0) + polyLengthMm(e.polyline, uToMm, tToMm));
  }
  void arcOf;
  const deg = degrees(graph);
  let junctionsTotal = 0;
  let junctionsOnLong = 0;
  for (let i = 0; i < n; i++) {
    if (deg[i] >= 3) {
      junctionsTotal++;
      const arc = compArc.get(find(i)) ?? 0;
      if (arc >= floorMm) junctionsOnLong++;
    }
  }
  let maxCompArcMm = 0;
  for (const v of compArc.values()) if (v > maxCompArcMm) maxCompArcMm = v;
  return {
    compCount: compArc.size,
    junctionsOnLong,
    junctionsTotal,
    longFrac: junctionsTotal > 0 ? junctionsOnLong / junctionsTotal : 0,
    maxCompArcMm,
  };
}

describe.skipIf(!RUN)('dispatch predicate signal measurement (all 20)', () => {
  it('measure signals (a)-(d) per style', () => {
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    writeFileSync(NDJSON, ''); // fresh
    const styleIds = Object.keys(STYLE_FUNCTIONS) as StyleId[];

    // u/t → mm scale for the pot (shared across styles; DIMS fixed).
    // Derive once from a smooth ring/column of a neutral sampler.
    for (const styleId of styleIds) {
      const sampler = styleSampler(styleId, {}, DIMS);

      // circumference (u→mm) and height (t→mm) from the actual surface.
      const uToMm = (() => {
        let tot = 0;
        let [px, py, pz] = sampler.position(0, 0.5);
        for (let i = 1; i <= 128; i++) {
          const [cx, cy, cz] = sampler.position((i / 128) % 1, 0.5);
          tot += Math.hypot(cx - px, cy - py, cz - pz);
          px = cx;
          py = cy;
          pz = cz;
        }
        return tot;
      })();
      const tToMm = DIMS.H;

      // RAW graph at production opts (fineRes 120).
      const g120 = detectFeatures(sampler, TIER_C_DETECT_OPTS);
      const deg120 = degrees(g120);
      const maxDeg = deg120.reduce((m, d) => Math.max(m, d), 0);
      const j120 = countJunctionNodes(g120);
      const arc120 = totalArcLenMm(g120, uToMm, tToMm);

      // (a) junction density (junctions per mm of feature arc).
      const density = arc120 > 0 ? j120 / arc120 : 0;

      // (b) count-instability across scale: fineRes 240 (2x).
      const g240 = detectFeatures(sampler, { ...TIER_C_DETECT_OPTS, fineRes: 240 });
      const j240 = countJunctionNodes(g240);
      const jRatio = j120 > 0 ? j240 / j120 : j240 > 0 ? Infinity : 1;

      // (c) chain-weighted junction score (floor = 20mm connected feature arc).
      const chain = chainWeighted(g120, uToMm, tToMm, 20);

      // (d) conditioned graph: prune weld-lattice noise + merge junction
      // clusters, then count residual junctions. minFeatureMm 2mm spurs,
      // junctionMergeMm 3mm cluster radius (the weld lattice = 1/fineRes ≈
      // 0.42mm in u, so 3mm dissolves the lattice packs).
      const cond = conditionGraph(g120, {
        uToMm,
        tToMm,
        minFeatureMm: 2,
        spurMaxSaliency: Infinity,
        simplifyTolMm: 0.2,
        junctionMergeMm: 3,
        prune: true,
      });
      const condJ = countJunctionNodes(cond);
      const condTriple = cond.stats.nodeKindCounts.triple;
      const condHigh = cond.stats.nodeKindCounts.highDegree;
      const condReflex = cond.stats.nodeKindCounts.reflex;
      const condJunctions = condTriple + condHigh + condReflex;

      const row = {
        styleId,
        intended: UNSTABLE.has(styleId),
        // RAW
        nodes: g120.nodes.length,
        edges: g120.edges.length,
        j120,
        maxDeg,
        arcMm: +arc120.toFixed(1),
        // (a)
        density_junc_per_mm: +density.toFixed(4),
        // (b)
        j240,
        jRatio: Number.isFinite(jRatio) ? +jRatio.toFixed(3) : 'inf',
        // (c)
        compCount: chain.compCount,
        junctionsOnLong: chain.junctionsOnLong,
        longFrac: +chain.longFrac.toFixed(3),
        maxCompArcMm: +chain.maxCompArcMm.toFixed(1),
        // (d)
        condNodes: cond.nodes.length,
        condEdges: cond.edges.length,
        condJ,
        condJunctions,
        condTriple,
        condReflex,
        condHigh,
      };
      appendFileSync(NDJSON, JSON.stringify(row) + '\n');
      // eslint-disable-next-line no-console
      console.log('[dispatchsig]', JSON.stringify(row));
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
