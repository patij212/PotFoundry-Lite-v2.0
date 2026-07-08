/**
 * morseComplex.ts — the Tier-C Morse ridge-graph protected complex.
 *
 * Extracts the multi-family feature 1-skeleton (all ridge/crease families plus
 * their birth/merge junction 0-cells) and planarizes it into an EXACTLY
 * non-crossing PSLG in the same flat (u·uToMm, t·tToMm) metric cdt2d consumes.
 * This is the topology half of the perfect-mesher kernel, proven whole-mesh in
 * research (residualCrossings 0, 100% recovery, watertight across junctions).
 *
 * Pipeline: detectFeatures (style-agnostic) → conditionGraph (junction
 * skeleton) → seam-aware unwrap to mm → planarizeMM (port of the FGJ-proven
 * research/bridge/_pf_planarizeMM.ts — split proper crossings + T-junctions,
 * weld near-triple-points, cull micro-stubs, iterate to zero crossings).
 *
 * u-seam convention: each polyline is unwrapped CONTINUOUSLY in u (each sample
 * takes the periodic representative nearest its predecessor), so a chain that
 * crosses the seam stays one straight chain in flat mm space and may extend
 * slightly outside [0, circumference). The downstream mesher locks the complex
 * with the same convention. Crossings between features that only meet ACROSS
 * the seam re-enter through the mesher's periodic quadtree, not this PSLG.
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import type { FeatureGraph } from '../featureGraph/types';
import { detectFeatures } from '../featureGraph/detectFeatures';
import { conditionGraph } from '../featureGraph/conditionGraph';
import { TIER_C_DETECT_OPTS } from './detectOpts';

/** The planarized, junction-typed protected complex. */
export interface ProtectedComplex {
  /** Flat mm-space vertex coordinates, packed [x0,y0, x1,y1, ...]. */
  vertices: number[];
  /** Non-crossing constraint segments as vertex-index pairs. */
  edges: Array<[number, number]>;
  /** Indices of junction (degree ≥3) vertices — the birth/merge 0-cells. */
  junctions: number[];
  /** Proper crossings remaining after planarization (invariant: 0). */
  residualCrossings: number;
  /**
   * Geometry-preservation coverage (≥99): % of input constraint samples
   * within COVER_TOL_MM of a planarized constraint. See the recovery note
   * above coveragePct for why this is NOT an arc-length ratio.
   */
  recoveryPct: number;
  /** u→mm scale used (circumference at t=0.5). */
  uToMm: number;
  /** t→mm scale used (wall height along u=0). */
  tToMm: number;
}

/**
 * NEEDLE-FORBIDDING PICKET (E-2026-07-08-TIERC-TOPOLOGY, DESIGN A, opt-in).
 *
 * A short LOCKED t-aligned constraint segment injected at a constant u-column
 * across a t-band. Its purpose: the whole-domain re-CDT re-forms a long
 * t-spanning needle (pin 1.0592mm, pin_diag.json: 3 verts at u≈0.0585, edges
 * ≈8.9mm spanning t≈0.464-0.538) across the smooth apex bump because no
 * interior LOCKED structure forbids a facet from bridging that t-gap. A picket
 * places a chain of vertices along the needle's own u-column, LOCKED between
 * consecutive vertices at `maxChordMm` 3D pitch, so cdt2d cannot form any facet
 * whose edge spans more than the local chord across the bump — the long needle
 * edge would have to cross a locked picket edge (forbidden).
 *
 * Planarity-safe by construction: pickets are appended to the raw mm segment
 * soup BEFORE `planarizeMM`, which splits any picket-vs-rib crossing into a
 * T-junction and drives `residualCrossings` to 0 with the proven machinery.
 */
export interface PicketSpec {
  /** Constant chart-u column (fraction) the picket runs along. */
  u: number;
  /** t-band start (fraction). */
  tLo: number;
  /** t-band end (fraction). */
  tHi: number;
  /** Max 3D chord (mm) between consecutive locked picket vertices. Default 0.09. */
  maxChordMm?: number;
}

// ---------------------------------------------------------------------------
// Physical scale measurement (same 128-pt chord sums detectFeatures uses
// internally; module-private there, so re-measured locally).
// ---------------------------------------------------------------------------

const MEASURE_N = 128;

function measureUCircumference(sampler: SurfaceSampler): number {
  let total = 0;
  let [prevX, prevY, prevZ] = sampler.position(0, 0.5);
  for (let i = 1; i <= MEASURE_N; i++) {
    const [cx, cy, cz] = sampler.position((i / MEASURE_N) % 1, 0.5);
    total += Math.hypot(cx - prevX, cy - prevY, cz - prevZ);
    prevX = cx;
    prevY = cy;
    prevZ = cz;
  }
  return total;
}

function measureTHeight(sampler: SurfaceSampler): number {
  let total = 0;
  let [prevX, prevY, prevZ] = sampler.position(0, 0);
  for (let i = 1; i <= MEASURE_N; i++) {
    const [cx, cy, cz] = sampler.position(0, i / MEASURE_N);
    total += Math.hypot(cx - prevX, cy - prevY, cz - prevZ);
    prevX = cx;
    prevY = cy;
    prevZ = cz;
  }
  return total;
}

// ---------------------------------------------------------------------------
// planarizeMM — ported from research/bridge/_pf_planarizeMM.ts (FGJ-proven:
// the normalized-metric planarizer left 840 real mm-space crossings on a
// 5-bay Gothic patch and cdt2d throws `upperIds` on any crossing constraint;
// see project memory cdt_planarization). Logic and constants identical;
// reformatted to house style.
// ---------------------------------------------------------------------------

/** Orientation epsilon (mm²). */
const EPS_CROSS = 1e-9;
/** Point-on-segment perpendicular tolerance (mm); ridge samples ~0.1mm apart. */
const EPS_ON = 3e-3;
/**
 * Weld coincident vertices below this (mm): at a near-triple-point the three
 * pairwise crossings land within ~WELD_MM and must collapse to ONE shared fan
 * vertex, or the residual chases its tail forever.
 */
const WELD_MM = 3e-4;
/** Micro-edge cull (mm): sub-tolerance stubs re-cross long ridges forever. */
const MICRO_MM = 5e-3;
/** Near-endpoint snap band (param): reuse the endpoint as the fan vertex. */
const ENDPOINT_BAND = 0.02;

interface PlanarResult {
  pts: number[];
  edges: Array<[number, number]>;
  residual: number;
}

function orient(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Proper crossing param s on (a,b) of segment (a,b)×(c,d), or null. */
function properCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number | null {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  if (
    ((d1 > EPS_CROSS && d2 < -EPS_CROSS) ||
      (d1 < -EPS_CROSS && d2 > EPS_CROSS)) &&
    ((d3 > EPS_CROSS && d4 < -EPS_CROSS) ||
      (d3 < -EPS_CROSS && d4 > EPS_CROSS))
  ) {
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-15) return null;
    return ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
  }
  return null;
}

function planarizeMM(
  mm0: number[],
  edges0: Array<[number, number]>,
  maxPass = 12,
): PlanarResult {
  const pts = mm0.slice();

  // Weld map on a fine grid.
  const wmap = new Map<string, number>();
  const wkey = (x: number, y: number): string =>
    `${Math.round(x / WELD_MM)}_${Math.round(y / WELD_MM)}`;
  for (let i = 0; i < pts.length / 2; i++) {
    const k = wkey(pts[2 * i], pts[2 * i + 1]);
    if (!wmap.has(k)) wmap.set(k, i);
  }
  const addVert = (x: number, y: number): number => {
    const k = wkey(x, y);
    const h = wmap.get(k);
    if (h !== undefined) return h;
    const id = pts.length / 2;
    pts.push(x, y);
    wmap.set(k, id);
    return id;
  };

  // Weld endpoints through the map + cull micro-edges (extraction noise).
  const canon = (v: number): number => {
    const h = wmap.get(wkey(pts[2 * v], pts[2 * v + 1]));
    return h ?? v;
  };
  let edges = edges0
    .map((e) => [canon(e[0]), canon(e[1])] as [number, number])
    .filter(
      (e) =>
        e[0] !== e[1] &&
        Math.hypot(
          pts[2 * e[0]] - pts[2 * e[1]],
          pts[2 * e[0] + 1] - pts[2 * e[1] + 1],
        ) >= MICRO_MM,
    );

  const cell = 0.5; // spatial-hash cell (mm) for the edge broadphase
  let residual = 0;
  for (let pass = 0; pass < maxPass; pass++) {
    // Spatial hash of edges by bbox cells.
    const grid = new Map<number, number[]>();
    const put = (gx: number, gy: number, ei: number): void => {
      const k = gx * 100003 + gy;
      const a = grid.get(k);
      if (a) a.push(ei);
      else grid.set(k, [ei]);
    };
    const bbox = (e: [number, number]): [number, number, number, number] => {
      const [a, b] = e;
      return [
        Math.min(pts[2 * a], pts[2 * b]),
        Math.min(pts[2 * a + 1], pts[2 * b + 1]),
        Math.max(pts[2 * a], pts[2 * b]),
        Math.max(pts[2 * a + 1], pts[2 * b + 1]),
      ];
    };
    for (let ei = 0; ei < edges.length; ei++) {
      const [x0, y0, x1, y1] = bbox(edges[ei]);
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
        for (
          let gy = Math.floor(y0 / cell);
          gy <= Math.floor(y1 / cell);
          gy++
        ) {
          put(gx, gy, ei);
        }
      }
    }

    // One split list per edge (crossings + T-junction verts), then rebuild.
    const splitsOnEdge: Array<Array<{ s: number; v: number }>> = edges.map(
      () => [],
    );
    let crossFound = 0;
    const tested = new Set<number>();
    for (let ei = 0; ei < edges.length; ei++) {
      const [x0, y0, x1, y1] = bbox(edges[ei]);
      const cand = new Set<number>();
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
        for (
          let gy = Math.floor(y0 / cell);
          gy <= Math.floor(y1 / cell);
          gy++
        ) {
          const a = grid.get(gx * 100003 + gy);
          if (a) for (const ej of a) if (ej > ei) cand.add(ej);
        }
      }
      const [a, b] = edges[ei];
      const ax = pts[2 * a];
      const ay = pts[2 * a + 1];
      const bx = pts[2 * b];
      const by = pts[2 * b + 1];
      for (const ej of cand) {
        const pk = ei * 1e7 + ej;
        if (tested.has(pk)) continue;
        tested.add(pk);
        const [c, d] = edges[ej];
        if (a === c || a === d || b === c || b === d) continue; // shared endpoint
        const cx = pts[2 * c];
        const cy = pts[2 * c + 1];
        const dx = pts[2 * d];
        const dy = pts[2 * d + 1];
        const s = properCross(ax, ay, bx, by, cx, cy, dx, dy);
        if (s === null) continue;
        crossFound++;
        const ix = ax + s * (bx - ax);
        const iy = ay + s * (by - ay);
        const den2 = (dx - cx) ** 2 + (dy - cy) ** 2 || 1e-12;
        const sj = ((ix - cx) * (dx - cx) + (iy - cy) * (dy - cy)) / den2;
        // Near-endpoint snap: the two chains meet AT that existing vertex (a
        // T-junction at an endpoint) — reuse it as the shared fan vertex and
        // split only the other edge through it.
        let v: number;
        if (s < ENDPOINT_BAND) v = a;
        else if (s > 1 - ENDPOINT_BAND) v = b;
        else if (sj < ENDPOINT_BAND) v = c;
        else if (sj > 1 - ENDPOINT_BAND) v = d;
        else v = addVert(ix, iy);
        if (v !== a && v !== b) splitsOnEdge[ei].push({ s, v });
        if (v !== c && v !== d) splitsOnEdge[ej].push({ s: sj, v });
      }
    }

    // T-junctions: any vertex lying on an edge interior.
    const vgrid = new Map<number, number[]>();
    for (let vi = 0; vi < pts.length / 2; vi++) {
      const k =
        Math.floor(pts[2 * vi] / cell) * 100003 +
        Math.floor(pts[2 * vi + 1] / cell);
      const a = vgrid.get(k);
      if (a) a.push(vi);
      else vgrid.set(k, [vi]);
    }
    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei];
      const ax = pts[2 * a];
      const ay = pts[2 * a + 1];
      const bx = pts[2 * b];
      const by = pts[2 * b + 1];
      const [x0, y0, x1, y1] = bbox(edges[ei]);
      const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-12;
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
        for (
          let gy = Math.floor(y0 / cell);
          gy <= Math.floor(y1 / cell);
          gy++
        ) {
          const a2 = vgrid.get(gx * 100003 + gy);
          if (!a2) continue;
          for (const vi of a2) {
            if (vi === a || vi === b) continue;
            const px = pts[2 * vi];
            const py = pts[2 * vi + 1];
            const s = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2;
            if (s <= 1e-4 || s >= 1 - 1e-4) continue;
            const projx = ax + s * (bx - ax);
            const projy = ay + s * (by - ay);
            if (Math.hypot(px - projx, py - projy) < EPS_ON) {
              splitsOnEdge[ei].push({ s, v: vi });
            }
          }
        }
      }
    }

    // Rebuild the edge list with splits.
    const next: Array<[number, number]> = [];
    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei];
      const sp = splitsOnEdge[ei];
      if (!sp.length) {
        if (a !== b) next.push([a, b]);
        continue;
      }
      sp.sort((p, q) => p.s - q.s);
      let prev = a;
      for (const s of sp) {
        if (s.v !== prev && s.s > 1e-4 && s.s < 1 - 1e-4) {
          next.push([prev, s.v]);
          prev = s.v;
        }
      }
      if (prev !== b) next.push([prev, b]);
    }

    // Dedupe + cull micro-edges each pass (a split near an endpoint can spawn
    // a sub-micron stub that re-crosses forever).
    const eset = new Set<number>();
    const ded: Array<[number, number]> = [];
    for (const [a, b] of next) {
      if (a === b) continue;
      if (
        Math.hypot(pts[2 * a] - pts[2 * b], pts[2 * a + 1] - pts[2 * b + 1]) <
        MICRO_MM
      ) {
        continue;
      }
      const k = a < b ? a * 1e7 + b : b * 1e7 + a;
      if (!eset.has(k)) {
        eset.add(k);
        ded.push([a, b]);
      }
    }
    edges = ded;
    residual = crossFound;
    if (crossFound === 0) break;
  }
  return { pts, edges, residual };
}

// ---------------------------------------------------------------------------
// Recovery = COVERAGE, not length ratio.
//
// The planarizer legitimately DEDUPES overlapping collinear chains (two
// detector families sharing a run), so an input-vs-output arc-length ratio
// conflates dedup with loss (measured on Gothic: 92.5% length ratio while
// 100% of input samples lie within 0.05mm of an output constraint). The
// honest geometry-preservation metric is coverage: the fraction of input
// constraint samples (every SAMPLE_STEP_MM) within COVER_TOL_MM of some
// planarized constraint. COVER_TOL_MM bounds the planarizer's documented
// snap displacements (weld 3e-4, T-junction EPS_ON 3e-3, near-endpoint
// crossing snap; worst measured 0.031mm) — the refine loop (Task 4) drives
// true surface deviation independently, exactly as in the proven kernel.
// ---------------------------------------------------------------------------

const COVER_TOL_MM = 0.05;
const SAMPLE_STEP_MM = 0.05;

function coveragePct(
  inPts: number[],
  inEdges: Array<[number, number]>,
  outPts: number[],
  outEdges: Array<[number, number]>,
): number {
  if (inEdges.length === 0) return 100;
  // Spatial hash of output edges (cell must exceed COVER_TOL_MM so the 3×3
  // neighbourhood query below cannot miss a candidate).
  const cell = 0.5;
  const grid = new Map<number, number[]>();
  for (let ei = 0; ei < outEdges.length; ei++) {
    const [a, b] = outEdges[ei];
    const x0 = Math.min(outPts[2 * a], outPts[2 * b]);
    const x1 = Math.max(outPts[2 * a], outPts[2 * b]);
    const y0 = Math.min(outPts[2 * a + 1], outPts[2 * b + 1]);
    const y1 = Math.max(outPts[2 * a + 1], outPts[2 * b + 1]);
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const k = gx * 100003 + gy;
        const arr = grid.get(k);
        if (arr) arr.push(ei);
        else grid.set(k, [ei]);
      }
    }
  }
  const isCovered = (x: number, y: number): boolean => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get((gx + dx) * 100003 + (gy + dy));
        if (!arr) continue;
        for (const ei of arr) {
          const [a, b] = outEdges[ei];
          const ax = outPts[2 * a];
          const ay = outPts[2 * a + 1];
          const bx = outPts[2 * b];
          const by = outPts[2 * b + 1];
          const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-12;
          let s = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L2;
          s = Math.max(0, Math.min(1, s));
          const d = Math.hypot(
            x - (ax + s * (bx - ax)),
            y - (ay + s * (by - ay)),
          );
          if (d <= COVER_TOL_MM) return true;
        }
      }
    }
    return false;
  };
  let covered = 0;
  let total = 0;
  for (const [a, b] of inEdges) {
    const ax = inPts[2 * a];
    const ay = inPts[2 * a + 1];
    const bx = inPts[2 * b];
    const by = inPts[2 * b + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / SAMPLE_STEP_MM));
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      total++;
      if (isCovered(ax + s * (bx - ax), ay + s * (by - ay))) covered++;
    }
  }
  return (100 * covered) / total;
}

/**
 * Build the Tier-C protected complex for one surface.
 *
 * @param sampler  The surface sampler (style-agnostic).
 * @param _styleId Accepted for future explicit overrides only; the extraction
 *                 is graph-driven (spec §1 Tier-C definition).
 * @param prebuilt Optional already-detected feature graph (the dispatch
 *                 predicate runs the same detector; avoids a second pass).
 */
export function buildProtectedComplex(
  sampler: SurfaceSampler,
  _styleId: string,
  prebuilt?: FeatureGraph,
  pickets?: readonly PicketSpec[],
): ProtectedComplex {
  const uToMm = measureUCircumference(sampler);
  const tToMm = measureTHeight(sampler);

  const graph = prebuilt ?? detectFeatures(sampler, TIER_C_DETECT_OPTS);
  // simplify: false — the u-seam unwrap below picks each sample's periodic
  // representative nearest its predecessor, which is only sound on DENSE
  // chains (raw ridge samples are ~0.1mm apart, so genuine consecutive du is
  // ≪ 0.5). DP-simplified chains can span >0.5 in u between vertices and
  // would fold at the seam; the proven research kernel also planarized the
  // dense chains (see _pf_planarizeMM.ts EPS_ON rationale).
  const conditioned = conditionGraph(graph, {
    uToMm,
    tToMm,
    minFeatureMm: 2.5,
    simplifyTolMm: 0.5,
    junctionMergeMm: 2.5,
    prune: false,
    simplify: false,
    mergeJunctions: true,
  });

  // DENSIFY + RIDGE-SNAP the chains BEFORE planarizing (load-bearing, and it
  // MUST happen here so planarizeMM sees the final geometry — snapping AFTER
  // planarization re-introduces crossings and cdt2d throws `upperIds`,
  // project memory cdt_planarization). Two measured facts drive this:
  //  (1) detectFeatures places chain vertices ~1 fine cell off the true ridge
  //      (p50 1.02mm at fineRes 120, probe _tierc_crestOffset) → snap each
  //      point to the local radius max along the segment NORMAL;
  //  (2) detector chains arrive at ~2.4mm pitch, but cdt2d cannot split a
  //      LOCKED edge, so a long constraint edge floors every crest-adjacent
  //      facet at ~L²κ/8 (~0.4mm for a 1mm chord — the full-gate plateau,
  //      probe _tierc_constraintLen) → densify to DENSIFY_MM 3D pitch so the
  //      locked crest can refine along its length (matches the research
  //      kernel's ~0.1mm analytic crest chains).
  // Normal-direction snap: a small window crosses exactly ONE rib (an
  // axis-aligned window on a diagonal rib is bimodal); amp-gated so
  // component-boundary / flat-crease chains stay put.
  const DENSIFY_MM = 0.15;
  const SNAP_WIN_MM = 2.5;
  const SNAP_MIN_AMP_MM = 0.05;
  const rAt = (u: number, t: number): number => {
    const [x, y] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
    return Math.hypot(x, y);
  };
  const pos3D = (u: number, t: number): [number, number, number] => [
    ...sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t))),
  ];
  const goldenMax = (f: (s: number) => number, lo: number, hi: number): number => {
    const gr = (Math.sqrt(5) - 1) / 2;
    let a = lo;
    let b = hi;
    let c = b - gr * (b - a);
    let d = a + gr * (b - a);
    for (let i = 0; i < 48; i++) {
      if (f(c) > f(d)) b = d;
      else a = c;
      c = b - gr * (b - a);
      d = a + gr * (b - a);
    }
    return (a + b) / 2;
  };
  const snapAlongNormal = (
    u: number,
    t: number,
    txMm: number,
    tyMm: number,
  ): { u: number; t: number } => {
    const L = Math.hypot(txMm, tyMm);
    if (L < 1e-9) return { u, t };
    const nxMm = -tyMm / L;
    const nyMm = txMm / L;
    const at = (s: number): [number, number] => [
      u + (s * nxMm) / uToMm,
      t + (s * nyMm) / tToMm,
    ];
    const f = (s: number): number => {
      const [uu, tt] = at(s);
      return rAt(uu, tt);
    };
    const sStar = goldenMax(f, -SNAP_WIN_MM, SNAP_WIN_MM);
    if (f(sStar) - Math.max(f(-SNAP_WIN_MM), f(SNAP_WIN_MM)) < SNAP_MIN_AMP_MM) {
      return { u, t };
    }
    const [su, st] = at(sStar);
    return { u: su, t: Math.min(1, Math.max(0, st)) };
  };
  const densifyAndSnap = (
    poly: ReadonlyArray<{ u: number; t: number }>,
  ): Array<{ u: number; t: number }> => {
    if (poly.length < 2) return poly.map((p) => ({ u: p.u, t: p.t }));
    const out: Array<{ u: number; t: number }> = [];
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      let du = b.u - a.u;
      while (du > 0.5) du -= 1;
      while (du < -0.5) du += 1;
      const A = pos3D(a.u, a.t);
      const B = pos3D(a.u + du, b.t);
      const len3 = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      const nSeg = Math.max(1, Math.ceil(len3 / DENSIFY_MM));
      const txMm = du * uToMm;
      const tyMm = (b.t - a.t) * tToMm;
      for (let s = 0; s < nSeg; s++) {
        const fr = s / nSeg; // include start, exclude end (next seg / final)
        out.push(snapAlongNormal(a.u + fr * du, a.t + fr * (b.t - a.t), txMm, tyMm));
      }
    }
    const last = poly[poly.length - 1];
    out.push({ u: last.u, t: Math.min(1, Math.max(0, last.t)) });
    return out;
  };

  // Polylines → flat mm segment soup, unwrapping u continuously per chain.
  const pts: number[] = [];
  const rawEdges: Array<[number, number]> = [];
  for (const edge of conditioned.edges) {
    const poly = densifyAndSnap(edge.polyline);
    if (poly.length < 2) continue;
    let uPrev = poly[0].u;
    let prevIdx = pts.length / 2;
    pts.push(uPrev * uToMm, poly[0].t * tToMm);
    for (let i = 1; i < poly.length; i++) {
      let u = poly[i].u;
      // Periodic representative nearest the predecessor.
      while (u - uPrev > 0.5) u -= 1;
      while (u - uPrev < -0.5) u += 1;
      const idx = pts.length / 2;
      pts.push(u * uToMm, poly[i].t * tToMm);
      rawEdges.push([prevIdx, idx]);
      prevIdx = idx;
      uPrev = u;
    }
  }

  // NEEDLE-FORBIDDING PICKETS (E-2026-07-08-TIERC-TOPOLOGY DESIGN A, opt-in).
  // Append each picket as a chain of vertices along its constant-u column,
  // spaced at maxChordMm 3D pitch, with LOCKED edges between consecutive
  // vertices. Injected into the raw mm soup BEFORE planarizeMM so any crossing
  // with a rib chain is split into a T-junction (residualCrossings stays 0 by
  // the proven planarizer). Off ⇒ byte-identical to the prior complex.
  if (pickets && pickets.length > 0) {
    for (const pk of pickets) {
      const maxChordMm = pk.maxChordMm ?? 0.09;
      const A = pos3D(pk.u, pk.tLo);
      const B = pos3D(pk.u, pk.tHi);
      const len3 = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      const nSeg = Math.max(1, Math.ceil(len3 / maxChordMm));
      let prevIdx = pts.length / 2;
      pts.push(pk.u * uToMm, pk.tLo * tToMm);
      for (let s = 1; s <= nSeg; s++) {
        const fr = s / nSeg;
        const t = pk.tLo + fr * (pk.tHi - pk.tLo);
        const idx = pts.length / 2;
        pts.push(pk.u * uToMm, t * tToMm);
        rawEdges.push([prevIdx, idx]);
        prevIdx = idx;
      }
    }
  }

  const planar = planarizeMM(pts, rawEdges);
  const recoveryPct = coveragePct(pts, rawEdges, planar.pts, planar.edges);

  // Junction 0-cells: degree ≥3 over the planarized constraint set.
  const degree = new Array<number>(planar.pts.length / 2).fill(0);
  for (const [a, b] of planar.edges) {
    degree[a] += 1;
    degree[b] += 1;
  }
  const junctions: number[] = [];
  for (let i = 0; i < degree.length; i++) {
    if (degree[i] >= 3) junctions.push(i);
  }

  return {
    vertices: planar.pts,
    edges: planar.edges,
    junctions,
    residualCrossings: planar.residual,
    recoveryPct,
    uToMm,
    tToMm,
  };
}
