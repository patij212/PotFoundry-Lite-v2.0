/**
 * conditionGraph.test.ts — per-operation unit tests for the feature-graph
 * conditioner, on small synthetic graphs with known noise. Each operation is
 * isolated via its toggle so the test pins exactly one behaviour.
 *
 * @module conforming/featureGraph/conditionGraph.test
 */

import { describe, it, expect } from 'vitest';
import { conditionGraph } from './conditionGraph';
import type { ConditionGraphOptions } from './conditionGraph';
import type { FeatureGraph, FeatureEdge, Vec2 } from './types';

const U_TO_MM = 220;
const T_TO_MM = 100;

/** Base options; individual tests override toggles to isolate one operation. */
function opts(over: Partial<ConditionGraphOptions> = {}): ConditionGraphOptions {
  return {
    uToMm: U_TO_MM,
    tToMm: T_TO_MM,
    minFeatureMm: 2.5,
    simplifyTolMm: 0.75,
    junctionMergeMm: 3.5,
    prune: false,
    simplify: false,
    mergeJunctions: false,
    typeNodes: true,
    splitHighDegree: false,
    ...over,
  };
}

/** Build an open edge between node ids a,b with a straight 2-point polyline. */
function edge(nodes: Vec2[], a: number, b: number, extra: Vec2[] = []): FeatureEdge {
  return {
    polyline: [nodes[a], ...extra, nodes[b]],
    strength: 2,
    types: ['curvature-ridge'],
    kind: 'open',
    endpoints: [a, b],
  };
}

/** Find a node index in the OUTPUT graph nearest a target (u,t), within tol. */
function nodeNear(g: FeatureGraph, u: number, t: number, tol = 0.02): number {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    const d = Math.hypot(g.nodes[i].u - u, g.nodes[i].t - t);
    if (d < bestD) { bestD = d; best = i; }
  }
  return bestD <= tol ? best : -1;
}

/** Degree of every node in a graph (loop endpoints count twice). */
function degrees(g: FeatureGraph): number[] {
  const d = new Array(g.nodes.length).fill(0);
  for (const e of g.edges) { d[e.endpoints[0]]++; d[e.endpoints[1]]++; }
  return d;
}

// ───────────────────────────────────────────────────────────────────────────
// Op 1 — prune spurs
// ───────────────────────────────────────────────────────────────────────────

describe('conditionGraph — prune spurs', () => {
  it('removes a short dangling spur off a junction, leaving a clean triple', () => {
    // A central junction with 3 long arms + 1 short spur.
    const nodes: Vec2[] = [
      { u: 0.5, t: 0.5 },  // 0 = center
      { u: 0.7, t: 0.5 },  // 1 = arm B (0.2u*220 = 44mm)
      { u: 0.3, t: 0.5 },  // 2 = arm C
      { u: 0.5, t: 0.7 },  // 3 = arm D (0.2t*100 = 20mm)
      { u: 0.51, t: 0.5 }, // 4 = spur tip (0.01u*220 = 2.2mm < 2.5)
    ];
    const g: FeatureGraph = {
      nodes,
      edges: [edge(nodes, 0, 1), edge(nodes, 0, 2), edge(nodes, 0, 3), edge(nodes, 0, 4)],
    };
    const out = conditionGraph(g, opts({ prune: true }));
    // The spur is pruned: 4 nodes remain (center + 3 arm tips), center is a clean
    // degree-3 triple. (The spur tip at 0.51 sits within 0.01u of the center, so a
    // position probe can't distinguish them — assert structure instead.)
    expect(out.nodes.length).toBe(4);
    const center = nodeNear(out, 0.5, 0.5, 0.005);
    expect(center).toBeGreaterThanOrEqual(0);
    expect(degrees(out)[center]).toBe(3);
    expect(out.stats.prunedSpurs).toBe(1);
  });

  it('keeps a long arm even when its far end is degree-1', () => {
    const nodes: Vec2[] = [{ u: 0.5, t: 0.5 }, { u: 0.8, t: 0.5 }]; // 0.3u*220 = 66mm
    const g: FeatureGraph = { nodes, edges: [edge(nodes, 0, 1)] };
    const out = conditionGraph(g, opts({ prune: true }));
    expect(out.edges.length).toBe(1);
    expect(out.stats.prunedSpurs).toBe(0);
  });

  it('never prunes a closed loop', () => {
    const nodes: Vec2[] = [{ u: 0.5, t: 0.5 }];
    const loop: FeatureEdge = {
      // a tiny loop, total length < minFeatureMm, but loops are features not spurs
      polyline: [{ u: 0.5, t: 0.5 }, { u: 0.505, t: 0.5 }, { u: 0.5, t: 0.505 }, { u: 0.5, t: 0.5 }],
      strength: 2, types: ['curvature-ridge'], kind: 'loop', endpoints: [0, 0],
    };
    const g: FeatureGraph = { nodes, edges: [loop] };
    const out = conditionGraph(g, opts({ prune: true }));
    expect(out.edges.length).toBe(1);
    expect(out.edges[0].kind).toBe('loop');
  });

  it('dissolves a degree-2 node created by pruning (two edges merge into one)', () => {
    // center(0) has arms to 1,2 and a spur to 3. After pruning the spur, center
    // becomes degree-2 and should dissolve, merging the two arms into one edge.
    const nodes: Vec2[] = [
      { u: 0.5, t: 0.5 },  // 0 center
      { u: 0.7, t: 0.5 },  // 1
      { u: 0.3, t: 0.5 },  // 2
      { u: 0.505, t: 0.5 }, // 3 spur (0.005u*220 = 1.1mm < 2.5)
    ];
    const g: FeatureGraph = {
      nodes, edges: [edge(nodes, 0, 1), edge(nodes, 0, 2), edge(nodes, 0, 3)],
    };
    const out = conditionGraph(g, opts({ prune: true }));
    // Spur + center dissolved → a single edge between (0.7,0.5) and (0.3,0.5).
    expect(out.stats.prunedSpurs).toBe(1);
    expect(out.edges.length).toBe(1);
    expect(nodeNear(out, 0.5, 0.5)).toBe(-1); // center dissolved
    expect(nodeNear(out, 0.7, 0.5)).toBeGreaterThanOrEqual(0);
    expect(nodeNear(out, 0.3, 0.5)).toBeGreaterThanOrEqual(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Op 2 — simplify polylines
// ───────────────────────────────────────────────────────────────────────────

describe('conditionGraph — simplify polylines', () => {
  it('removes near-collinear interior jitter within tolerance, keeps endpoints', () => {
    const nodes: Vec2[] = [{ u: 0.4, t: 0.5 }, { u: 0.6, t: 0.5 }];
    // interior wiggle ≤ ~0.1mm in t (< 0.75mm tol) → should collapse.
    const jagged: Vec2[] = [
      { u: 0.40, t: 0.5 },
      { u: 0.45, t: 0.5008 },
      { u: 0.50, t: 0.4994 },
      { u: 0.55, t: 0.5006 },
      { u: 0.60, t: 0.5 },
    ];
    const g: FeatureGraph = {
      nodes,
      edges: [{ polyline: jagged, strength: 2, types: ['curvature-ridge'], kind: 'open', endpoints: [0, 1] }],
    };
    const out = conditionGraph(g, opts({ simplify: true }));
    expect(out.edges[0].polyline.length).toBeLessThan(jagged.length);
    // endpoints preserved exactly
    expect(out.edges[0].polyline[0]).toEqual({ u: 0.4, t: 0.5 });
    expect(out.edges[0].polyline[out.edges[0].polyline.length - 1]).toEqual({ u: 0.6, t: 0.5 });
    expect(out.stats.simplifiedPoints).toBeGreaterThan(0);
  });

  it('preserves a genuine corner above tolerance', () => {
    const nodes: Vec2[] = [{ u: 0.4, t: 0.5 }, { u: 0.6, t: 0.5 }];
    // a real ~5mm bump at the middle (0.05t*100 = 5mm ≫ 0.75) → corner kept.
    const bent: Vec2[] = [{ u: 0.4, t: 0.5 }, { u: 0.5, t: 0.55 }, { u: 0.6, t: 0.5 }];
    const g: FeatureGraph = {
      nodes,
      edges: [{ polyline: bent, strength: 2, types: ['curvature-ridge'], kind: 'open', endpoints: [0, 1] }],
    };
    const out = conditionGraph(g, opts({ simplify: true }));
    expect(out.edges[0].polyline.length).toBe(3); // corner retained
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Op 3 — merge junction clusters
// ───────────────────────────────────────────────────────────────────────────

describe('conditionGraph — merge junction clusters', () => {
  it('collapses two near-coincident junctions into one, dropping the connector', () => {
    // J1(0) and J2(1) are 0.015u*220 = 3.3mm apart (< 3.5) — both degree-3.
    const nodes: Vec2[] = [
      { u: 0.5, t: 0.5 },    // 0 = J1
      { u: 0.515, t: 0.5 },  // 1 = J2
      { u: 0.3, t: 0.5 },    // 2 = J1 arm
      { u: 0.5, t: 0.3 },    // 3 = J1 arm
      { u: 0.7, t: 0.5 },    // 4 = J2 arm
      { u: 0.5, t: 0.7 },    // 5 = J2 arm
    ];
    const g: FeatureGraph = {
      nodes,
      edges: [
        edge(nodes, 0, 2), edge(nodes, 0, 3), // J1 arms
        edge(nodes, 1, 4), edge(nodes, 1, 5), // J2 arms
        edge(nodes, 0, 1),                    // the short connector (collapses)
      ],
    };
    const out = conditionGraph(g, opts({ mergeJunctions: true }));
    // J1+J2 → one merged node with 4 external arms; connector dropped.
    expect(out.stats.mergedClusters).toBe(1);
    const merged = nodeNear(out, 0.5075, 0.5, 0.05); // near the centroid
    expect(merged).toBeGreaterThanOrEqual(0);
    expect(degrees(out)[merged]).toBe(4);
    // The four arm tips survive.
    for (const [u, t] of [[0.3, 0.5], [0.5, 0.3], [0.7, 0.5], [0.5, 0.7]] as const) {
      expect(nodeNear(out, u, t)).toBeGreaterThanOrEqual(0);
    }
  });

  it('does NOT merge two junctions farther apart than junctionMergeMm', () => {
    // 0.05u*220 = 11mm apart — distinct true junctions, must stay separate.
    const nodes: Vec2[] = [
      { u: 0.5, t: 0.5 }, { u: 0.55, t: 0.5 },
      { u: 0.3, t: 0.5 }, { u: 0.5, t: 0.3 },
      { u: 0.7, t: 0.5 }, { u: 0.55, t: 0.7 },
    ];
    const g: FeatureGraph = {
      nodes,
      edges: [edge(nodes, 0, 2), edge(nodes, 0, 3), edge(nodes, 1, 4), edge(nodes, 1, 5), edge(nodes, 0, 1)],
    };
    const out = conditionGraph(g, opts({ mergeJunctions: true }));
    expect(out.stats.mergedClusters).toBe(0);
    expect(nodeNear(out, 0.5, 0.5)).toBeGreaterThanOrEqual(0);
    expect(nodeNear(out, 0.55, 0.5)).toBeGreaterThanOrEqual(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Op 4 — type nodes
// ───────────────────────────────────────────────────────────────────────────

describe('conditionGraph — type nodes', () => {
  it('classifies endpoint / triple / reflex / highDegree', () => {
    // Place each arm at a desired (u,t)→mm AZIMUTH (the space the classifier uses):
    // mm-dir (cosθ,sinθ) → uv step (cosθ/uToMm, sinθ/tToMm)·Rmm, so the recovered
    // mm-azimuth equals θ regardless of the anisotropy.
    const Rmm = 18;
    const tri = (cx: number, cy: number, azDeg: number[]): { nodes: Vec2[]; edges: FeatureEdge[] } => {
      const nodes: Vec2[] = [{ u: cx, t: cy }];
      const edges: FeatureEdge[] = [];
      azDeg.forEach((a, k) => {
        const th = (a * Math.PI) / 180;
        nodes.push({ u: cx + (Math.cos(th) / U_TO_MM) * Rmm, t: cy + (Math.sin(th) / T_TO_MM) * Rmm });
        edges.push(edge(nodes, 0, k + 1));
      });
      return { nodes, edges };
    };

    // well-formed triple: mm-azimuths 120° apart → all sectors 120° → 'triple'.
    const well = tri(0.5, 0.5, [0, 120, 240]);
    const wOut = conditionGraph({ nodes: well.nodes, edges: well.edges }, opts({ typeNodes: true }));
    expect(wOut.nodeTypes[nodeNear(wOut, 0.5, 0.5, 0.005)]).toBe('triple');
    expect(wOut.stats.nodeKindCounts.endpoint).toBe(3); // the three arm tips

    // reflex: all three arms bunched (0°,30°,60°) → biggest sector 300° > 180°.
    const refl = tri(0.5, 0.5, [0, 30, 60]);
    const rOut = conditionGraph({ nodes: refl.nodes, edges: refl.edges }, opts({ typeNodes: true }));
    expect(rOut.nodeTypes[nodeNear(rOut, 0.5, 0.5, 0.005)]).toBe('reflex');

    // highDegree: 4 arms.
    const hi = tri(0.5, 0.5, [0, 90, 180, 270]);
    const hOut = conditionGraph({ nodes: hi.nodes, edges: hi.edges }, opts({ typeNodes: true }));
    expect(hOut.nodeTypes[nodeNear(hOut, 0.5, 0.5, 0.005)]).toBe('highDegree');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Determinism
// ───────────────────────────────────────────────────────────────────────────

describe('conditionGraph — determinism', () => {
  it('is invariant under input edge/node reordering', () => {
    const nodes: Vec2[] = [
      { u: 0.5, t: 0.5 }, { u: 0.515, t: 0.5 },
      { u: 0.3, t: 0.5 }, { u: 0.5, t: 0.3 },
      { u: 0.7, t: 0.5 }, { u: 0.5, t: 0.7 },
      { u: 0.505, t: 0.51 }, // a spur tip near J1
    ];
    const edges = [
      edge(nodes, 0, 2), edge(nodes, 0, 3), edge(nodes, 1, 4),
      edge(nodes, 1, 5), edge(nodes, 0, 1), edge(nodes, 0, 6),
    ];
    const full = opts({ prune: true, simplify: true, mergeJunctions: true, typeNodes: true });
    const a = conditionGraph({ nodes, edges }, full);

    // Reverse edge order + remap node ids by a permutation.
    const perm = [3, 1, 5, 0, 2, 6, 4];
    const nodes2 = perm.map((p) => nodes[p]);
    const inv = new Array(perm.length);
    perm.forEach((p, i) => { inv[p] = i; });
    const edges2 = [...edges].reverse().map((e) => ({
      ...e,
      polyline: e.polyline.map((q) => ({ ...q })),
      endpoints: [inv[e.endpoints[0]], inv[e.endpoints[1]]] as [number, number],
    }));
    const b = conditionGraph({ nodes: nodes2, edges: edges2 }, full);

    const norm = (g: FeatureGraph): string =>
      JSON.stringify({
        nodes: [...g.nodes].map((n) => [n.u, n.t]).sort(),
        nEdges: g.edges.length,
      });
    expect(norm(a)).toBe(norm(b));
    expect(a.edges.length).toBe(b.edges.length);
  });
});
