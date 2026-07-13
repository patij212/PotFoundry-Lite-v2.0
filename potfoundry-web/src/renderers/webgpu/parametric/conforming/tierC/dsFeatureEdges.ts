// dsFeatureEdges.ts — DragonScales PER-SCALE feature-conforming edge graph (PROD-TIERC region layer).
//
// Ports the PROVEN DS-INTERIOR-CLOSE recipe (E-2026-07-13-DS-INTERIOR-CLOSE, research probe
// research/bridge/_dsInteriorClose.test.ts) into src as a PURE, browser-capable module. The recipe closes the
// DragonScales body to the LITERAL 0.01mm true-3D standard by embedding the per-scale C1 creases as mesh
// constraint edges: (1) the θ-tile-boundary VALLEY lines (scaleLocal=0), and (2) the per-scale FLANK-TOE
// silhouette contour (distFromCenter=1). Fed to the M=g/h² region kernel ({@link buildMetricMesh}) as
// `injectedPoints` + `constraintEdges` (+ `pinInjected` + `recoverySubdivideCollinear`), so a mesh edge lies ON
// each crease → no facet chords across the crease apex. Combined with `curvatureFineStep` sub-cell curvature
// sizing this drove witness body p99 ~0.009 ≤ 0.01 at 2.64M tris, %<20° 2.8, nonMan 0 (baseline OFF p99 0.0147).
//
// BROWSER-CAPABLE: pure arithmetic over plain arrays (no node:/gmsh/WASM/DOM). Ships to the browser exactly like
// the ported {@link buildMetricMesh} kernel. Zero imports beyond the DS-lattice default type/constants.
//
// The graphs derive ANALYTICALLY from the DragonScales scale lattice (scaleRows/scalesPerRow/overlap — the
// `rOuterDragonScales` params). They are geometry-only (independent of mesh density) so they are the SAME whatever
// resolution the kernel runs at.
//
// The three generators (`buildThetaEdgeGraph`, `buildFlankToeGraph`, `mergeGraphs`) are a byte-faithful port of the
// research helpers; the ONLY additions are (a) parameterization by the DS lattice (research hard-coded 8/16/0.5),
// (b) {@link clipGraphToInterior} (rim-pin safety — see below), and (c) the {@link buildDragonScalesConformingGraph}
// composer that assembles the winning `combo|fine` arm's graph.
//
// RIM-PIN SAFETY: the region kernel runs rim-pinned (see {@link MetricMeshOpts.rimPinRing}), which LOCKS the four
// (u,t) patch boundaries and welds the u=0/u=1 seam columns by an exact t-station bijection. A raw θ/toe graph puts
// its seam-scale valley line + flank mid-node EXACTLY on u=0 (the periodic seam), which would leak extra vertices
// onto the u=0 column and break the weld bijection (the kernel would throw). {@link clipGraphToInterior} drops any
// point that lands on a locked boundary (mirroring the kernel's own `wOnBnd` Steiner discipline) and re-indexes the
// edges, so the injected graph is confined to the patch interior and the rim-pin invariants hold. The seam scale's
// exact-on-seam crease points are dropped (their crease coincides with the seam weld itself); every interior
// crease point survives.

/** DragonScales scale-lattice parameters that drive the feature-conforming graph (subset of `DragonScalesParams`). */
export interface DsLattice {
  /** Number of stacked scale rows (default `dsScaleRows` = 8). */
  scaleRows: number;
  /** Scales around the circumference per row (default `dsScalesPerRow` = 16). */
  scalesPerRow: number;
  /** Row vertical overlap fraction (default `dsOverlap` = 0.5). */
  overlap: number;
}

/** DEFAULT DragonScales lattice (mirrors `DEFAULT_DRAGON_SCALES` in src/geometry/types.ts). */
export const DEFAULT_DS_LATTICE: DsLattice = { scaleRows: 8, scalesPerRow: 16, overlap: 0.5 };

/** A constraint graph in (u,t) space: flat `pts` (u0,t0,u1,t1,…) + `edges` (vertex-index PAIRS into `pts`). */
export interface FeatureGraph {
  pts: number[];
  edges: number[];
}

/**
 * θ-tile-boundary VALLEY lines (verbatim from E-DS-THETAEDGE): vertical (in t) lines at scaleLocal=0
 * (u_edge = m/scalesPerRow on even rows, (m−0.5)/scalesPerRow on odd rows), one disjoint line per (row band,
 * valley), inset from the ring boundaries by `insTmm`. Each line is `nTper` collinear points chained by edges.
 */
export function buildThetaEdgeGraph(
  H: number,
  nTper: number,
  insTmm: number,
  lat: DsLattice = DEFAULT_DS_LATTICE,
): FeatureGraph & { lines: number } {
  const pts: number[] = [];
  const edges: number[] = [];
  const insT = insTmm / H;
  const { scaleRows, scalesPerRow } = lat;
  let lines = 0;
  for (let k = 0; k < scaleRows; k++) {
    const odd = (k % 2) === 1;
    const t0 = k / scaleRows + insT;
    const t1 = (k + 1) / scaleRows - insT;
    for (let m = 0; m < scalesPerRow; m++) {
      let u = odd ? (m - 0.5) / scalesPerRow : m / scalesPerRow;
      u -= Math.floor(u);
      let prev = -1;
      for (let s = 0; s < nTper; s++) {
        const t = t0 + (t1 - t0) * (s / (nTper - 1));
        const pos = pts.length / 2;
        pts.push(u, t);
        if (prev >= 0) edges.push(prev, pos);
        prev = pos;
      }
      lines++;
    }
  }
  return { pts, edges, lines };
}

/**
 * Per-scale FLANK-TOE contour (verbatim from E-DS-FLANKTOE, distFromCenter=1): two flank arcs
 * u(rowLocal)=u_v ± (1−w)/(2·scalesPerRow), w=√(1−yDist²), yDist=|rowLocal−overlap|/max(1−overlap·0.5,0.1),
 * meeting at a shared mid-row node M per valley. Full band in t at the pot boundaries.
 */
export function buildFlankToeGraph(
  H: number,
  nHalf: number,
  ringInsetMm: number,
  tEndEps: number,
  lat: DsLattice = DEFAULT_DS_LATTICE,
): FeatureGraph & { arcs: number } {
  const pts: number[] = [];
  const edges: number[] = [];
  const { scaleRows, scalesPerRow, overlap } = lat;
  const insRL = (ringInsetMm / H) * scaleRows;
  const endRL = (tEndEps / H) * scaleRows;
  const uOf = (u: number): number => u - Math.floor(u);
  const wOf = (rl: number): number => {
    const yDist = Math.abs(rl - overlap) / Math.max(1 - overlap * 0.5, 0.1);
    return Math.sqrt(Math.max(0, 1 - yDist * yDist));
  };
  let arcs = 0;
  for (let k = 0; k < scaleRows; k++) {
    const s_k = (k % 2 === 1) ? 0.5 : 0;
    const loRL = (k === 0) ? endRL : insRL;
    const hiRL = (k === scaleRows - 1) ? (1 - endRL) : (1 - insRL);
    const lower: number[] = [];
    const upper: number[] = [];
    for (let s = 0; s < nHalf; s++) {
      const fr = s / nHalf;
      lower.push(loRL + (0.5 - loRL) * fr);
      upper.push(0.5 + (hiRL - 0.5) * ((s + 1) / nHalf));
    }
    for (let mV = 0; mV < scalesPerRow; mV++) {
      const u_v = uOf((mV - s_k) / scalesPerRow);
      const tMid = (k + 0.5) / scaleRows;
      const Mpos = pts.length / 2;
      pts.push(u_v, tMid);
      for (const sign of [-1, 1] as const) {
        let prev = -1;
        const emit = (rl: number): number => {
          const w = wOf(rl);
          const u = uOf(u_v + sign * (1 - w) / (2 * scalesPerRow));
          const t = (k + rl) / scaleRows;
          const pos = pts.length / 2;
          pts.push(u, t);
          if (prev >= 0) edges.push(prev, pos);
          prev = pos;
          return pos;
        };
        for (const rl of lower) emit(rl);
        if (prev >= 0) edges.push(prev, Mpos);
        prev = Mpos;
        for (const rl of upper) emit(rl);
        arcs++;
      }
    }
  }
  return { pts, edges, arcs };
}

/** Merge two constraint graphs (offset the second's edge indices by the first's vertex count). Verbatim port. */
export function mergeGraphs(a: FeatureGraph, b: FeatureGraph): FeatureGraph {
  const off = a.pts.length / 2;
  const pts = a.pts.concat(b.pts);
  const edges = a.edges.concat(b.edges.map((v) => v + off));
  return { pts, edges };
}

/**
 * RIM-PIN safety filter: drop every point that lands ON a locked (u,t) patch boundary — u≤eps, u≥1−eps, t≤eps or
 * t≥1−eps — and drop every edge that referenced a dropped point, re-indexing the survivors to a dense range.
 *
 * The region kernel runs rim-pinned: it locks the four boundaries and welds the u=0/u=1 seam by an exact t-station
 * bijection. An injected point on a boundary line leaks onto a locked row/column and breaks that bijection (the
 * kernel throws). Confining the graph to the strict interior preserves the rim-pin invariants; the seam scale's
 * exact-on-seam crease points (u=0) are the only real casualties, and their crease coincides with the periodic
 * seam weld itself. NO-OP for a graph already strictly interior (returns the same points/edges, re-indexed 1:1).
 */
export function clipGraphToInterior(g: FeatureGraph, eps = 1e-6): FeatureGraph {
  const nPts = g.pts.length / 2;
  const keep = new Int32Array(nPts).fill(-1);
  const pts: number[] = [];
  for (let i = 0; i < nPts; i++) {
    const u = g.pts[2 * i];
    const t = g.pts[2 * i + 1];
    if (u <= eps || u >= 1 - eps || t <= eps || t >= 1 - eps) continue;
    keep[i] = pts.length / 2;
    pts.push(u, t);
  }
  const edges: number[] = [];
  for (let e = 0; e + 1 < g.edges.length; e += 2) {
    const a = keep[g.edges[e]];
    const b = keep[g.edges[e + 1]];
    if (a >= 0 && b >= 0) edges.push(a, b);
  }
  return { pts, edges };
}

/** Options for {@link buildDragonScalesConformingGraph}. Defaults reproduce the winning `combo|fine` arm's graph. */
export interface DsConformingGraphOpts {
  /** θ-valley samples per line (default 24). */
  thetaSamplesPerLine?: number;
  /** θ-valley t-inset from ring boundaries, mm (default 1.3). */
  thetaInsetMm?: number;
  /** Flank-toe samples per half-arc (default 16). */
  flankSamplesPerHalf?: number;
  /** Flank-toe ring inset, mm (default 1.3). */
  flankRingInsetMm?: number;
  /** Flank-toe t-end epsilon, mm (default 0.04). */
  flankEndEpsMm?: number;
  /** Interior clip epsilon in (u,t) fraction (default 1e-6). */
  clipEps?: number;
  /** DragonScales lattice (default {@link DEFAULT_DS_LATTICE} = 8/16/0.5). */
  lattice?: DsLattice;
}

/**
 * Assemble the DragonScales feature-conforming constraint graph (θ-valley ∪ flank-toe, the proven `combo` graph),
 * clipped to the patch interior for rim-pin safety. Pure + browser-capable.
 *
 * @param H  Wall height (mm) — the θ/flank insets are specified in mm and normalized by H.
 */
export function buildDragonScalesConformingGraph(H: number, opts: DsConformingGraphOpts = {}): FeatureGraph {
  const lat = opts.lattice ?? DEFAULT_DS_LATTICE;
  const theta = buildThetaEdgeGraph(H, opts.thetaSamplesPerLine ?? 24, opts.thetaInsetMm ?? 1.3, lat);
  const toe = buildFlankToeGraph(
    H,
    opts.flankSamplesPerHalf ?? 16,
    opts.flankRingInsetMm ?? 1.3,
    opts.flankEndEpsMm ?? 0.04,
    lat,
  );
  const combo = mergeGraphs({ pts: theta.pts, edges: theta.edges }, { pts: toe.pts, edges: toe.edges });
  return clipGraphToInterior(combo, opts.clipEps ?? 1e-6);
}

/** Default curvatureFineStep for the DS region path (the ≤3M-tri confirming arm `combo|fine|s0.0022`). */
export const DS_CURVATURE_FINE_STEP = 0.0022;
/** Default curvatureSubsamples for the DS region path. */
export const DS_CURVATURE_SUBSAMPLES = 4;
