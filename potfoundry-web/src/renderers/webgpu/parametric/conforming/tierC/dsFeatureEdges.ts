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
// research helpers; the additions are (a) parameterization by the DS lattice (research hard-coded 8/16/0.5), (b) the
// rim-pin seam handling ({@link seamSymmetrizeGraph} + {@link buildSeamRail}; {@link clipGraphToInterior} is the
// retained simpler-drop utility), and (c) the {@link buildDragonScalesConformingGraph} composer.
//
// RIM-PIN SEAM HANDLING: the region kernel runs rim-pinned (see {@link MetricMeshOpts.rimPinRing}), which LOCKS the
// four (u,t) patch boundaries and welds the u=0/u=1 seam columns by an exact t-station bijection. A raw θ/toe graph
// puts its seam-scale valley line + flank mid-node EXACTLY on u=0 (the periodic seam). Simply DROPPING those (the
// clip predecessor) leaves the seam-column scales UN-conformed AND — because the rim-pin locks the seam columns —
// the u=1→u=0 weld bridges the fine interior to the coarse locked seam with long "wrap" triangles that chord the
// seam relief (MEASURED: a ~1.87mm true-3D spike at the seam). {@link seamSymmetrizeGraph} instead MIRRORS every
// seam point onto both the u=0 and u=1 columns at shared t-stations (bijection preserved) and routes edges to the
// nearest column (no long seam-spanning edge), and {@link buildSeamRail} seeds a dense t-rail on the (locked) seam
// column so the wrap triangles are short. Together these conform the seam-column scales without breaking the weld.

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

/**
 * §V11l u-running RISER edge family (E-2026-07-19-DS-RISER-CLOSE). The 7 interior stagger-flip rings at
 * `t = k/scaleRows` (k=1..scaleRows−1) are a genuine C0 radius JUMP: the row-parity flip shifts the scale θ-lattice
 * by half a scale, so `rOuterDragonScales` is discontinuous across each ring (LOCATE-measured 0.95–1.13mm jump,
 * INVARIANT as dz→0 ⇒ a true C0 step, not a steep-but-continuous slope). This is the near-HORIZONTAL annular TREAD
 * where the r⁻ wall (row k−1, below) steps out/in to the r⁺ wall (row k, above). A single-valued radial mesh cannot
 * place a vertex at an intermediate radius AT z_k (rA(θ,z_k) is single-valued = r⁺), and the prior t-running edge
 * families (θ-valley, flank-toe) are ORTHOGONAL to a t=const tread ⇒ leave it chorded (E-DS-THETAEDGE / E-DS-FLANKTOE
 * both left the ring MAX byte-unmoved; E-DS-PERP-MAX measured the residual ring composite MAX ≈ 0.25mm).
 *
 * The cure is a DOUBLED u-running (horizontal, t=const) edge ring straddling each stagger ring — one BELOW at
 * `t = k/R − dtHalf` (its vertices sample the row-(k−1) limit r⁻) and one ABOVE at `t = k/R + dtHalf` (sample the
 * row-k limit r⁺). The Delaunay strip the kernel builds between the pair BECOMES the tread face (r⁻→r⁺ over a thin
 * z-band 2·dtHalf) instead of a single flat facet chording the whole 1mm step. `dtHalfMm` sets the strip half-height:
 * the strip's worst deviation from the true tread ≈ (dtHalfMm − rulerWallEps), so `dtHalfMm ≈ 0.005mm` lands the
 * ring composite ~0.0045mm ≤ 0.01 (rulerWallEps = 5e-4 is the V11g composite wall band). Each ring is `nUper`+1
 * collinear points across u∈[0,1] (endpoints on both seam columns), chained by u-running edges. NO vertical strip
 * edges — the Delaunay + metric split connects the pair directly (the two rings are ~0.01mm apart in z, far closer
 * than any body vertex) and the metric refines the u-resolution to body density; explicit ~0.01mm vertical
 * constraints would only risk recovery folds. The endpoints at u=0/u=1 are mirrored onto both seam columns by
 * {@link seamSymmetrizeGraph} (bijection preserved); the rings are strictly t-interior (k/R ∈ [1/8,7/8], off the
 * locked t-rims) and sit in the ~0.01-in-t GAP between adjacent row-bands' θ/toe graphs (t-inset 1.3mm) ⇒ they cross
 * NO existing constraint edge.
 */
export function buildRiserEdgeGraph(
  H: number,
  nUper: number,
  dtHalfMm: number,
  lat: DsLattice = DEFAULT_DS_LATTICE,
): FeatureGraph & { rings: number } {
  const pts: number[] = [];
  const edges: number[] = [];
  const { scaleRows } = lat;
  const dtHalf = dtHalfMm / H;
  const nU = Math.max(2, Math.floor(nUper));
  let rings = 0;
  for (let k = 1; k < scaleRows; k++) {
    const tk = k / scaleRows;
    for (const side of [-1, 1] as const) {
      const t = tk + side * dtHalf;
      let prev = -1;
      for (let j = 0; j <= nU; j++) {
        const u = j / nU; // includes u=0 and u=1 (seam endpoints → seamSymmetrizeGraph mirrors both columns).
        const pos = pts.length / 2;
        pts.push(u, t);
        if (prev >= 0) edges.push(prev, pos);
        prev = pos;
      }
      rings++;
    }
  }
  return { pts, edges, rings };
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

/**
 * A dense vertical constraint RAIL on the u=0 seam column: `nSamples` t-stations chained into one line, inset off
 * the locked t-rims by `tEps`. {@link seamSymmetrizeGraph} mirrors it onto BOTH u=0 and u=1 columns.
 *
 * WHY: rim-pin LOCKS the u=0/u=1 seam columns (their edges never split), so they stay at the coarse seed resolution
 * while the interior refines by the metric. The u=1→u=0 weld then bridges the fine interior to the coarse seam with
 * long "wrap" triangles that chord the seam-column scale relief (MEASURED: a ~1.87mm true-3D spike concentrated on
 * the seam, dominating witMax although body p99 was already ≤0.01). The research twin never saw this — with no
 * rim-pin its seam boundary refined freely. Seeding the locked seam column with a dense rail (pinned, both columns,
 * so the bijection holds) makes the wrap triangles short ⇒ the seam relief is resolved. The rail is uniform in t
 * (feature-agnostic) because the seam column crosses every scale row at a different scaleLocal (even rows: a valley
 * on u=0; odd rows: a scale centre) — a uniform rail conforms them all.
 */
export function buildSeamRail(nSamples: number, tEps = 1e-3): FeatureGraph {
  const pts: number[] = [];
  const edges: number[] = [];
  const n = Math.max(2, Math.floor(nSamples));
  let prev = -1;
  for (let s = 0; s < n; s++) {
    const t = tEps + (1 - 2 * tEps) * (s / (n - 1));
    const pos = pts.length / 2;
    pts.push(0, t);
    if (prev >= 0) edges.push(prev, pos);
    prev = pos;
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
  /**
   * Dense seam-rail t-samples on the (mirrored) u=0≡u=1 seam column (default 512 — MEASURED to fully evict the seam
   * from the worst-facet tail at ≥1.6M tris; 192 leaves it at body-residual level). Resolves the locked-seam wrap-
   * triangle chord (see {@link buildSeamRail}). 0 disables the rail (θ+toe only — leaves the seam-column spike).
   */
  seamRailSamples?: number;
  /** Interior clip epsilon in (u,t) fraction (default 1e-6). */
  clipEps?: number;
  /** DragonScales lattice (default {@link DEFAULT_DS_LATTICE} = 8/16/0.5). */
  lattice?: DsLattice;
  /**
   * §V11l RISER EDGES (E-2026-07-19-DS-RISER-CLOSE): add the doubled u-running (t=const) edge rings straddling each
   * interior stagger ring (t=k/R±riserHalfMm) so the Delaunay strip between the pair becomes the near-horizontal
   * TREAD face instead of chording the ~1mm C0 step (see {@link buildRiserEdgeGraph}). Default FALSE ⇒ the composed
   * graph is byte-identical to the pre-riser build (the riser generator is never called). Set true only via the DS
   * region dispatch's default-off riser sub-flag (measurement); production leaves it off.
   */
  riserEdges?: boolean;
  /** With {@link riserEdges}: u-stations per riser ring (default 128 — the metric refines finer via the chord/κ
   *  split; the constraint just establishes the ring so the strip is a tread, not a chord). */
  riserSamplesPerRing?: number;
  /** With {@link riserEdges}: strip half-height in mm (default 0.005 — worst tread deviation ≈ riserHalfMm − 5e-4
   *  ⇒ ~0.0045mm ≤ 0.01 at the V11g composite wall band; smaller closes tighter but risks a sub-metric sliver band). */
  riserHalfMm?: number;
}

/**
 * SEAM-SYMMETRIC transform for the periodic u=0≡u=1 seam under rim-pin (the production replacement for the seam
 * CLIP). The rim-pin weld ({@link MetricMeshOpts.rimPinRing}, in metricMeshToOuterWall) folds the u=1 column onto
 * u=0 and REQUIRES the two seam columns to be an exact t-station bijection. A raw θ/toe graph puts the seam-column
 * scale's valley line + flank mid-node on u=0 ONLY (asymmetric), so the earlier fix simply DROPPED them — leaving
 * the seam-column scales UN-conformed (MEASURED: a ~1.87mm true-3D chord spike concentrated at the seam, dominating
 * witMax while body p99 was already ≤0.01). This transform instead makes the seam feature SYMMETRIC:
 *   • every constraint point that lands on the seam is snapped to a canonical t-station present on BOTH the u=0 and
 *     the u=1 column (so col0 and col1 hold the identical t-set ⇒ the weld bijection holds), and
 *   • each edge that touches a seam point is routed to the seam column NEAREST its interior partner — so a flank arc
 *     on the u≈0 side connects to the u=0 mid-node and the wrapped u≈1 side connects to the u=1 mirror (no long
 *     seam-spanning edge) — while a purely on-seam edge (a θ-valley segment) is emitted on BOTH columns.
 * After the weld the two mirrored columns merge into ONE conformed seam column (manifold-by-construction): the
 * seam-column scales get their creases AND the bijection survives. Points on the locked t-rims are dropped
 * (defensive; the DS graph is t-inset by construction). Pure + browser-capable; NO-OP-equivalent for a graph with
 * no seam points (every point becomes an interior point, re-indexed).
 */
export function seamSymmetrizeGraph(g: FeatureGraph, seamEps = 1e-6): FeatureGraph {
  const nPts = g.pts.length / 2;
  const uAt = (i: number): number => g.pts[2 * i];
  const tAt = (i: number): number => g.pts[2 * i + 1];
  const onTRim = (i: number): boolean => tAt(i) <= seamEps || tAt(i) >= 1 - seamEps;
  const isSeam = (i: number): boolean => uAt(i) <= seamEps || uAt(i) >= 1 - seamEps;

  const outPts: number[] = [];
  const interiorOut = new Int32Array(nPts).fill(-1);
  // canonical seam t-station (rounded key) → its {left(u=0), right(u=1)} output indices.
  const seamCols = new Map<number, { left: number; right: number }>();
  const seamKey = (t: number): number => Math.round(t / seamEps);
  const ensureSeam = (t: number): { left: number; right: number } => {
    const k = seamKey(t);
    let e = seamCols.get(k);
    if (e === undefined) {
      const left = outPts.length / 2; outPts.push(0, t);
      const right = outPts.length / 2; outPts.push(1, t);
      e = { left, right }; seamCols.set(k, e);
    }
    return e;
  };
  const outInterior = (i: number): number => {
    if (interiorOut[i] < 0) { interiorOut[i] = outPts.length / 2; outPts.push(uAt(i), tAt(i)); }
    return interiorOut[i];
  };
  const seamOnCol = (i: number, col: 0 | 1): number => { const e = ensureSeam(tAt(i)); return col === 0 ? e.left : e.right; };

  // Pre-create BOTH columns for every seam t-station so col0 and col1 are t-identical regardless of edge routing.
  for (let i = 0; i < nPts; i++) if (isSeam(i) && !onTRim(i)) ensureSeam(tAt(i));

  const outEdges: number[] = [];
  const push = (a: number, b: number): void => { if (a !== b) outEdges.push(a, b); };
  for (let e = 0; e + 1 < g.edges.length; e += 2) {
    const a = g.edges[e], b = g.edges[e + 1];
    if (onTRim(a) || onTRim(b)) continue; // drop edges touching the locked t-rims (defensive)
    const sa = isSeam(a), sb = isSeam(b);
    if (!sa && !sb) push(outInterior(a), outInterior(b));
    else if (sa && !sb) push(seamOnCol(a, uAt(b) < 0.5 ? 0 : 1), outInterior(b));
    else if (!sa && sb) push(outInterior(a), seamOnCol(b, uAt(a) < 0.5 ? 0 : 1));
    else { push(seamOnCol(a, 0), seamOnCol(b, 0)); push(seamOnCol(a, 1), seamOnCol(b, 1)); } // on-seam segment: mirror both columns
  }
  return { pts: outPts, edges: outEdges };
}

/**
 * Assemble the DragonScales feature-conforming constraint graph (θ-valley ∪ flank-toe, the proven `combo` graph),
 * made SEAM-SYMMETRIC for the rim-pin weld (see {@link seamSymmetrizeGraph} — conforms the seam-column scales WITHOUT
 * breaking the u=1→u=0 bijection). Pure + browser-capable.
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
  let combo = mergeGraphs({ pts: theta.pts, edges: theta.edges }, { pts: toe.pts, edges: toe.edges });
  // §V11l RISER EDGES (opt-in, default OFF ⇒ byte-identical): doubled u-running rings straddling each interior
  // stagger ring so the strip between them is the tread face, not a chord across the ~1mm C0 step.
  if (opts.riserEdges === true) {
    const riser = buildRiserEdgeGraph(H, opts.riserSamplesPerRing ?? 128, opts.riserHalfMm ?? 0.005, lat);
    combo = mergeGraphs(combo, { pts: riser.pts, edges: riser.edges });
  }
  // Dense seam rail on u=0 (symmetrize mirrors it to u=1) so the locked seam column resolves the wrap-triangle chord.
  const railN = opts.seamRailSamples ?? 512;
  const withRail = railN >= 2 ? mergeGraphs(combo, buildSeamRail(railN)) : combo;
  return seamSymmetrizeGraph(withRail, opts.clipEps ?? 1e-6);
}

/** Default curvatureFineStep for the DS region path (the ≤3M-tri confirming arm `combo|fine|s0.0022`). */
export const DS_CURVATURE_FINE_STEP = 0.0022;
/** Default curvatureSubsamples for the DS region path. */
export const DS_CURVATURE_SUBSAMPLES = 4;
