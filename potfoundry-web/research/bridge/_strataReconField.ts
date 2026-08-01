// _strataReconField.ts — S23B: THE EXTRACTED DENSITY FIELD, PREPARED FOR THE CONSTRUCTOR.
//
// NEW FILE. Nothing imports it unless `PF_CB_RECON` is set, and it imports nothing from `src/`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AT ALL, RATHER THAN THE PREPARATION LIVING INSIDE THE EXTRACTOR OR THE BUILDER
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The Stage-0 extractor writes the field UNSMOOTHED and NOT gradient-limited **on purpose** and says so in
// the artifact (`estimator.smoothed:false`, `estimator.gradientLimited:false`), because "deciding it
// silently inside the extractor would hide a design decision inside an instrument, which is the mistake
// this campaign keeps paying for" (S23B entry handoff §3). The decision therefore has to be made
// somewhere it can be REGISTERED, MEASURED BEFORE THE RUN, and re-measured afterwards by a second reader.
// This file is that somewhere: ONE definition of the prepared field, consumed by the cost predictor and by
// the seed builder alike, so the number registered before the build and the field the build actually
// honours cannot drift apart.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO PREPARATION STEPS. BOTH ARE DECLARED VARIABLES, NOT IMPLEMENTATION DETAILS.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  1. **THE FLOOR** (`floorMm`). `_strataAlignedSeed.ts:398` ASSERTS `acrossMinMm * 0.55 > pslgEpsMm` with
//     a THROW, and the emitters independently floor every free point's segment clearance at
//     `1.5 * pslgEpsMm`. At `pslgEpsMm = 0.02` both put the constructor's smallest placeable feature at
//     **36.4 um**. This is architectural, not a preference: the bound exists so that PSLG conditioning
//     (which re-routes a constraint through any vertex within `pslgEpsMm` of its interior) can never let a
//     FREE Steiner point bend a TRACED LOCUS. A field asking for less than the floor is asking for
//     something the constructor is forbidden to place, so it is clamped and the clamped population is
//     REPORTED, never absorbed.
//  2. **THE GRADATION** (`alpha`). The prepared field satisfies `h(y) <= h(x) + alpha * d(x,y)` for every
//     pair of points in the chart — i.e. `h` is `alpha`-Lipschitz. It is applied as a min-plus envelope,
//     which is MONOTONE-DOWNWARD by construction: `hOut <= hIn` everywhere, so the gradation can only ever
//     refine, never coarsen, and it cannot move a feature. `alpha = Infinity` disables it and returns the
//     raw field unchanged, bit for bit, so the OFF path is a no-op by arithmetic and not by measurement.
//
//     WHAT `alpha` MEANS IN ELEMENTS, WHICH IS THE ONLY UNITS THAT MATTER HERE: from a point demanding
//     `h`, the field one element away may demand at most `h * (1 + alpha)`. So `alpha` IS the bound on the
//     size ratio between neighbouring elements, minus one. It is SCALE-FREE — the same statement binds a
//     36 um element and a 1.1 mm one — which is exactly what a single per-mm Lipschitz number is not.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE METRIC THE GRADATION IS COMPUTED IN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The chart `x = rRef*theta, y = z` at `rRef = 45` — the seed builder's own (`_strataAlignedSeed.ts:408`),
// and the chart the field was extracted in. It is PERIODIC in x and the sweep wraps accordingly; y is
// clamped (the two rims are real boundaries, not a seam).
// The envelope is computed with an 8-neighbour chamfer sweep whose step lengths are the true chart
// distances `dx`, `dy`, `hypot(dx,dy)`. A chamfer metric OVER-estimates Euclidean distance by at most
// ~8% on the 8-neighbour stencil, so the delivered field is at most ~8% MORE permissive than a true
// Euclidean `alpha` would be. Stated rather than hidden; it is a bound in the safe direction for cost and
// the unsafe direction for gradation, and 8% of a declared constant is smaller than the constant's own
// discretion.
import { readFileSync } from 'node:fs';

export const RECON_SCHEMA = 'pf.strata.density/1';
export const RECON_SCHEMA_2 = 'pf.strata.density/2';

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S23B-R / R1 — THE SCATTERED FIELD IS THE FIELD. THE GRID IS A FALLBACK.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S23B was priced by, and built from, the 0.25 mm REPORTING GRID, because that is what Stage 0
// serialized. The attribution measured what that cost: the grid under-prices 174 of the 194 sites that
// refuted THE CLAUSE (89.7%, median x3.45, MAX x6.54) and over-prices smooth wall in the other direction.
// Schema `/2` carries the SCATTERED field the registration always called primary — the source vertices'
// own chart positions and `hA`, plus the oracle mesh's own edge graph.
//
// **THREE THINGS CHANGE AND NOTHING ELSE DOES.**
//  1. `hAt(th,z)` answers with `h` of the NEAREST SOURCE VERTEX instead of a bilinear read off a 0.25 mm
//     lattice. That is the S23 registration's own words — *"the PRIMARY field is `h(th,z) := hA` of the
//     NEAREST source vertex in the `(arc, z)` metric"* — finally shipped rather than described.
//  2. THE FLOOR clamps per SOURCE VERTEX rather than per cell. Same constant, same meaning.
//  3. THE GRADATION runs as a min-plus envelope over THE ORACLE MESH'S OWN EDGE GRAPH, in the chart
//     metric, instead of over an 8-neighbour chamfer stencil on the grid. Same `alpha`, same
//     monotone-downward property (`hOut <= hIn` everywhere), same `alpha = Infinity` no-op.
//     >> THE METRIC'S BIAS, STATED RATHER THAN HIDDEN, exactly as the chamfer note above states its own:
//     >> graph distance over a triangulation OVER-estimates chart distance, so the delivered envelope is
//     >> at most that factor MORE PERMISSIVE than a true Euclidean `alpha`. It is the same direction as
//     >> the chamfer's ~8% and it is reported as `graphStretchP99` beside the result, measured against
//     >> the straight-line chart distance on every relaxed edge, not assumed.
//
// **WHAT IS NOT CLAIMED:** that the grid was wrong to exist. It is the instrument every Stage-0 landmark
// was read on and every number this campaign banked off it stays reproducible — schema `/1` artifacts
// load byte-for-byte as they always did, and a `/2` artifact can still be read as a grid on request.
// What is claimed is narrower and measured: a 0.0625 mm^2 cell holding ONE value cannot carry a field
// whose whole content is its tails.

export interface ReconFieldOpts {
  /** hard floor on what may be asked for, mm. The constructor's own architectural floor. */
  floorMm: number;
  /** Lipschitz gradation constant: `h(y) <= h(x) + alpha*d(x,y)`. `Infinity` = OFF (raw field). */
  alpha: number;
  /**
   * WHICH FIELD THE CONSTRUCTOR IS DRIVEN BY. `scatter` is the default on a schema `/2` artifact and is
   * the only option on which any S23B-R number is priced; `grid` reproduces the S23B path exactly and
   * is the only option a schema `/1` artifact can offer.
   */
  source?: 'scatter' | 'grid';
}

/** THE SCATTERED FIELD — the source vertices themselves, prepared. Present only on schema `/2`. */
export interface ReconScatter {
  n: number;
  /** chart coordinates, mm. `x = rRef*theta` (periodic at `xMaxMm`), `y = z`. */
  x: Float64Array;
  y: Float64Array;
  /** `hA` as extracted, mm. */
  hRaw: Float64Array;
  /** `hMin` as extracted, mm — a DIAGNOSTIC. Nothing is priced by it. Empty on an artifact without one. */
  hMin: Float64Array;
  /** `hA` floored then graded, mm. */
  h: Float64Array;
  /** nearest source vertex to a chart point: `[vertexId, distanceMm]`. */
  nearest: (x: number, y: number) => [number, number];
}

export interface ReconField {
  cols: number;
  rows: number;
  /** chart cell size, mm. */
  dxMm: number;
  dyMm: number;
  rRef: number;
  H: number;
  xMaxMm: number;
  floorMm: number;
  alpha: number;
  /** the RAW field as read, mm, row-major (row 0 = z 0, col 0 = theta 0). */
  hRaw: Float64Array;
  /** the PREPARED field, mm, row-major. */
  h: Float64Array;
  /**
   * `h` at (theta, z), mm. On `scatter` (the default from schema `/2`): the prepared `h` of the NEAREST
   * SOURCE VERTEX. On `grid`: bilinear on the prepared grid, periodic in theta, clamped in z.
   */
  hAt: (th: number, z: number) => number;
  /** which field `hAt` answers from. */
  fieldSource: 'scatter' | 'grid';
  /** the scattered field, or `null` on a schema `/1` artifact. Present even when `fieldSource` is grid. */
  scatter: ReconScatter | null;
  stats: {
    source: string;
    nCells: number;
    /** cells the FLOOR clamped, and the smallest raw value it clamped. */
    flooredCells: number;
    rawMinUm: number;
    /** cells the GRADATION lowered, and the largest factor by which it lowered one. */
    gradedCells: number;
    worstGradeRatio: number;
    sweeps: number;
    /** percentiles of the prepared field, um. */
    p01: number; p10: number; p50: number; p90: number; p99: number; min: number; max: number;
    /** the 8-neighbour size ratio `max(h_i/h_j)` over the grid, before and after preparation. */
    ratioRawP50: number; ratioRawP99: number; ratioRawMax: number;
    ratioP50: number; ratioP99: number; ratioMax: number;
    /** SCATTERED ONLY — the same three quantities over the source vertices and their own edge graph. */
    scatterN: number;
    scatterFloored: number;
    scatterGraded: number;
    scatterWorstGrade: number;
    scatterRelaxations: number;
    /** SCATTERED ONLY — edge-wise size ratio over the oracle's own graph, before and after. */
    scatterRatioRawP50: number; scatterRatioRawP99: number; scatterRatioRawMax: number;
    scatterRatioP50: number; scatterRatioP99: number; scatterRatioMax: number;
    /** SCATTERED ONLY — percentiles of the prepared scattered field, um. */
    sP01: number; sP10: number; sP50: number; sP90: number; sP99: number; sMin: number; sMax: number;
    /** SCATTERED ONLY — graph-vs-straight-line stretch of the gradation metric, MEASURED. */
    graphStretchP50: number; graphStretchP99: number; graphStretchMax: number;
  };
}

interface DensityArtifact {
  schema: string;
  source: { stl: string; nTri: number; nVert: number; nEdge?: number; arm: string };
  chart: { rRef: number; xMaxMm: number; H: number };
  grid: { cols: number; rows: number; cellMm: number; dxMm: number; dyMm: number };
  scatter?: { xMm: number[]; yMm: number[]; hUm: number[]; hMinUm?: number[]; edges: number[] };
  hUm: number[];
}

/** percentile of a COPY (the caller's array is never reordered). */
function pct(src: Float64Array | number[], p: number): number {
  const a = Float64Array.from(src as ArrayLike<number>);
  a.sort();
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))];
}

/**
 * The 8-neighbour size-ratio census: `max(h_i/h_j, h_j/h_i)` over adjacent cells. This is the quantity
 * the gradation bounds, expressed the way the constructor sees it (a ratio between neighbours), rather
 * than as a per-mm log-derivative whose meaning changes with the local scale.
 */
function ratioCensus(h: Float64Array, cols: number, rows: number): [number, number, number] {
  const out: number[] = [];
  let mx = 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = h[r * cols + c];
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as Array<[number, number]>) {
        const r2 = r + dr; if (r2 >= rows) continue;
        const c2 = ((c + dc) % cols + cols) % cols;
        const b = h[r2 * cols + c2];
        const q = a > b ? a / b : b / a;
        out.push(q);
        if (q > mx) mx = q;
      }
    }
  }
  return [pct(out, 0.5), pct(out, 0.99), mx];
}

/**
 * Load the Stage-0 density artifact and PREPARE it: floor, then gradation.
 *
 * ORDER IS LOAD-BEARING AND IT IS FLOOR-THEN-GRADE. Grading first and flooring second would let a
 * sub-floor well pull its whole neighbourhood down to a size the constructor cannot place, and then clamp
 * only the well itself — spending the cost of a feature it is then forbidden to build. Flooring first
 * makes the gradation act on the field the constructor can actually honour, which is the only field whose
 * cost prediction means anything.
 */
/**
 * THE SCATTERED FIELD, PREPARED. Same two declared variables, applied where the field actually lives.
 *
 * THE GRADATION IS A MIN-PLUS ENVELOPE OVER THE ORACLE MESH'S OWN EDGE GRAPH — multi-source Dijkstra,
 * every vertex seeded with its own floored `hA`, edge weight `alpha * chartLength(a,b)`. Popping in
 * increasing `h` settles each vertex exactly once, so the result is the exact fixed point of the min-plus
 * operator on that graph and is order-independent; ties break on vertex id, so it is deterministic.
 *
 * WHY THE MESH'S OWN GRAPH AND NOT A k-NEAREST-NEIGHBOUR GRAPH BUILT AT LOAD TIME: the source vertices
 * span 13 um to 1.26 mm of spacing in the same chart. A fixed `k` is a fixed scale, and a fixed scale is
 * precisely the defect R1 exists to remove — a k-NN graph over this point set either disconnects the
 * coarse lattice or drowns the fine one. The oracle's own connectivity is scale-adaptive BY
 * CONSTRUCTION, for the same reason the field on it is.
 */
function buildScatter(
  art: DensityArtifact, o: ReconFieldOpts, xMax: number,
): { s: ReconScatter; floored: number; graded: number; worstGrade: number; relax: number;
     stretchP50: number; stretchP99: number; stretchMax: number;
     ratRawP50: number; ratRawP99: number; ratRawMax: number;
     ratP50: number; ratP99: number; ratMax: number } {
  const sc = art.scatter as { xMm: number[]; yMm: number[]; hUm: number[]; hMinUm?: number[]; edges: number[] };
  const n = sc.hUm.length;
  if (sc.xMm.length !== n || sc.yMm.length !== n) {
    throw new Error(`PF_CB_RECON: scatter has ${sc.xMm.length}/${sc.yMm.length}/${n} x/y/h values.`);
  }
  const x = Float64Array.from(sc.xMm); const y = Float64Array.from(sc.yMm);
  const hRaw = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = sc.hUm[i];
    if (!Number.isFinite(v) || !(v > 0)) {
      throw new Error(`PF_CB_RECON: scatter vertex ${i} carries ${String(v)} um. A hole in the scattered `
        + 'field is a density the constructor would invent.');
    }
    hRaw[i] = v / 1000;
  }

  // ── 1. THE FLOOR, per SOURCE VERTEX ──────────────────────────────────────────────────────────────
  const h = Float64Array.from(hRaw);
  let floored = 0;
  for (let i = 0; i < n; i += 1) if (h[i] < o.floorMm) { h[i] = o.floorMm; floored += 1; }
  const before = Float64Array.from(h);

  // ── the edge graph, as CSR, with CHART lengths (periodic in x, a rim is a rim in y) ───────────────
  const nE = sc.edges.length >>> 1;
  const dxw = (a: number, b: number): number => { let d = Math.abs(a - b); if (d > xMax / 2) d = xMax - d; return d; };
  const deg = new Int32Array(n + 1);
  for (let e = 0; e < nE; e += 1) { deg[sc.edges[e * 2]] += 1; deg[sc.edges[e * 2 + 1]] += 1; }
  const off = new Int32Array(n + 1);
  for (let v = 0; v < n; v += 1) off[v + 1] = off[v] + deg[v];
  const adj = new Int32Array(off[n]); const len = new Float64Array(off[n]);
  {
    const fill = new Int32Array(n);
    for (let e = 0; e < nE; e += 1) {
      const a = sc.edges[e * 2]; const b = sc.edges[e * 2 + 1];
      const L = Math.hypot(dxw(x[a], x[b]), y[a] - y[b]);
      adj[off[a] + fill[a]] = b; len[off[a] + fill[a]] = L; fill[a] += 1;
      adj[off[b] + fill[b]] = a; len[off[b] + fill[b]] = L; fill[b] += 1;
    }
  }
  // the RAW edge-wise size-ratio census — the quantity the gradation bounds, on the graph it bounds it on
  const ratioEdges = (src: Float64Array): [number, number, number] => {
    const out = new Float64Array(nE); let mx = 1;
    for (let e = 0; e < nE; e += 1) {
      const a = src[sc.edges[e * 2]]; const b = src[sc.edges[e * 2 + 1]];
      const q = a > b ? a / b : b / a; out[e] = q; if (q > mx) mx = q;
    }
    return [pct(out, 0.5), pct(out, 0.99), mx];
  };
  const [rr50, rr99, rrmx] = ratioEdges(hRaw);

  // ── 2. THE GRADATION — multi-source Dijkstra min-plus over that graph ─────────────────────────────
  let relax = 0;
  const stretch: number[] = [];
  if (Number.isFinite(o.alpha) && o.alpha > 0) {
    // binary heap on (key, id), typed arrays, no allocation in the hot loop
    const hk = new Float64Array(n * 4); const hv = new Int32Array(n * 4);
    let hn = 0;
    const push = (k: number, v: number): void => {
      let i = hn; hn += 1;
      if (hn > hk.length) throw new Error('PF_CB_RECON: gradation heap overflow');
      hk[i] = k; hv[i] = v;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= hk[i]) break;
        const tk = hk[p]; const tv = hv[p]; hk[p] = hk[i]; hv[p] = hv[i]; hk[i] = tk; hv[i] = tv;
        i = p;
      }
    };
    const pop = (): number => {
      const top = hv[0];
      hn -= 1; hk[0] = hk[hn]; hv[0] = hv[hn];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1;
        let m = i;
        if (l < hn && hk[l] < hk[m]) m = l;
        if (r < hn && hk[r] < hk[m]) m = r;
        if (m === i) break;
        const tk = hk[m]; const tv = hv[m]; hk[m] = hk[i]; hv[m] = hv[i]; hk[i] = tk; hv[i] = tv;
        i = m;
      }
      return top;
    };
    const settled = new Uint8Array(n);
    // WHICH SOURCE EACH VERTEX'S ENVELOPE VALUE CAME FROM. Carried so the metric's bias can be MEASURED
    // rather than asserted: the accumulated GRAPH walk from that source, against the straight chart line
    // to it. (Measuring a single edge against its own endpoints returns 1 by construction and says
    // nothing — that was the first draft of this instrument and it was worthless.)
    const origin = new Int32Array(n);
    for (let v = 0; v < n; v += 1) origin[v] = v;
    for (let v = 0; v < n; v += 1) push(h[v], v);
    while (hn > 0) {
      const v = pop();
      if (settled[v] === 1) continue;
      settled[v] = 1;
      const hv0 = h[v];
      for (let i = off[v]; i < off[v + 1]; i += 1) {
        const w = adj[i];
        if (settled[w] === 1) continue;
        const cand = hv0 + o.alpha * len[i];
        if (cand < h[w] - 1e-15) { h[w] = cand; origin[w] = origin[v]; relax += 1; push(cand, w); }
      }
    }
    // THE GRAPH METRIC'S BIAS, over every vertex the envelope actually moved. The walk length is
    // recovered from the envelope itself — `(h[v] - h0[origin]) / alpha` IS the graph distance — so this
    // measures the quantity that priced the field and not a proxy for it.
    for (let v = 0; v < n; v += 1) {
      const s = origin[v];
      if (s === v) continue;
      const walk = (h[v] - before[s]) / o.alpha;
      const straight = Math.hypot(dxw(x[s], x[v]), y[s] - y[v]);
      if (walk > 0 && straight > 0) stretch.push(walk / straight);
    }
  }
  let graded = 0; let worstGrade = 1;
  for (let i = 0; i < n; i += 1) {
    if (h[i] < before[i] - 1e-12) { graded += 1; const q = before[i] / h[i]; if (q > worstGrade) worstGrade = q; }
  }
  const [q50, q99, qmx] = ratioEdges(h);

  // ── THE QUERY HASH. 0.1 mm cells — an order below the 0.25 mm grid this replaces and well under the
  //    36.4 um floor's own scale, so a fine query terminates in ring 1 and a coarse one walks empty
  //    cells (two array reads each) rather than scanning a bucket holding hundreds of points.
  const QC = 0.1;
  const qCols = Math.max(1, Math.round(xMax / QC));
  const qW = xMax / qCols;
  let yMax = 0; for (let i = 0; i < n; i += 1) if (y[i] > yMax) yMax = y[i];
  const qRows = Math.max(1, Math.ceil(yMax / QC) + 1);
  const cellOf = (px: number, py: number): number => {
    let ci = Math.floor(px / qW); ci = ((ci % qCols) + qCols) % qCols;
    const ri = Math.min(qRows - 1, Math.max(0, Math.floor(py / QC)));
    return ri * qCols + ci;
  };
  const cnt = new Int32Array(qCols * qRows + 1);
  for (let i = 0; i < n; i += 1) cnt[cellOf(x[i], y[i]) + 1] += 1;
  for (let i = 0; i < qCols * qRows; i += 1) cnt[i + 1] += cnt[i];
  const idx = new Int32Array(n);
  { const f = new Int32Array(qCols * qRows);
    for (let i = 0; i < n; i += 1) { const c = cellOf(x[i], y[i]); idx[cnt[c] + f[c]] = i; f[c] += 1; } }
  const RING_MAX = Math.max(qCols, qRows);
  const nearest = (px: number, py: number): [number, number] => {
    const ci0 = ((Math.floor(px / qW) % qCols) + qCols) % qCols;
    const ri0 = Math.min(qRows - 1, Math.max(0, Math.floor(py / QC)));
    let best = -1; let bd = Infinity;
    for (let ring = 0; ring < RING_MAX; ring += 1) {
      // a hit closer than the ring's guaranteed clearance cannot be beaten by any further ring
      if (best >= 0 && bd <= (ring - 1) * QC) break;
      for (let dr = -ring; dr <= ring; dr += 1) {
        const ri = ri0 + dr; if (ri < 0 || ri >= qRows) continue;
        const full = Math.abs(dr) === ring;
        for (let dc = -ring; dc <= ring; dc += 1) {
          if (!full && Math.abs(dc) !== ring) continue;
          const ci = ((ci0 + dc) % qCols + qCols) % qCols;
          const c = ri * qCols + ci;
          for (let i = cnt[c]; i < cnt[c + 1]; i += 1) {
            const v = idx[i];
            const d = Math.hypot(dxw(x[v], px), y[v] - py);
            if (d < bd) { bd = d; best = v; }
          }
        }
      }
    }
    return [best, bd];
  };
  stretch.sort((a, b) => a - b);
  const sp = (p: number): number => (stretch.length === 0 ? 1
    : stretch[Math.min(stretch.length - 1, Math.floor(p * stretch.length))]);
  return {
    s: { n, x, y, hRaw, hMin: sc.hMinUm === undefined ? new Float64Array(0)
      : Float64Array.from(sc.hMinUm, (u) => u / 1000), h, nearest },
    floored, graded, worstGrade: Number(worstGrade.toFixed(4)), relax,
    stretchP50: Number(sp(0.5).toFixed(4)), stretchP99: Number(sp(0.99).toFixed(4)),
    stretchMax: Number((stretch.length === 0 ? 1 : stretch[stretch.length - 1]).toFixed(4)),
    ratRawP50: Number(rr50.toFixed(4)), ratRawP99: Number(rr99.toFixed(4)), ratRawMax: Number(rrmx.toFixed(4)),
    ratP50: Number(q50.toFixed(4)), ratP99: Number(q99.toFixed(4)), ratMax: Number(qmx.toFixed(4)),
  };
}

export function loadReconField(path: string, o: ReconFieldOpts): ReconField {
  const art = JSON.parse(readFileSync(path, 'utf8')) as DensityArtifact;
  if (art.schema !== RECON_SCHEMA && art.schema !== RECON_SCHEMA_2) {
    throw new Error(`PF_CB_RECON: expected schema ${RECON_SCHEMA} or ${RECON_SCHEMA_2}, `
      + `got ${String(art.schema)}. `
      + 'A density field from a different producer is a mis-priced constructor waiting to happen.');
  }
  const wantScatter = (o.source ?? (art.scatter === undefined ? 'grid' : 'scatter')) === 'scatter';
  if (wantScatter && art.scatter === undefined) {
    throw new Error(`PF_CB_RECON: the scattered field was asked for and ${path} (schema ${art.schema}) `
      + 'does not carry one. Re-emit the field with the S23B-R extractor, or ask for source:"grid" and '
      + 'accept the 0.25 mm reporting grid — which under-priced 89.7% of the sites that refuted S23B.');
  }
  const cols = art.grid.cols; const rows = art.grid.rows;
  const dx = art.grid.dxMm; const dy = art.grid.dyMm;
  if (art.hUm.length !== cols * rows) {
    throw new Error(`PF_CB_RECON: field has ${art.hUm.length} values for a ${cols}x${rows} grid.`);
  }
  const hRaw = new Float64Array(cols * rows);
  let rawMin = Infinity;
  for (let i = 0; i < hRaw.length; i += 1) {
    const v = art.hUm[i];
    if (!Number.isFinite(v) || !(v > 0)) {
      throw new Error(`PF_CB_RECON: cell ${i} carries ${String(v)}. The extractor reported every cell `
        + 'populated; a hole here means the artifact and the reader disagree, and a silently-patched hole '
        + 'is a density the constructor would invent.');
    }
    const mm = v / 1000;
    hRaw[i] = mm;
    if (mm < rawMin) rawMin = mm;
  }

  // ── 1. THE FLOOR ────────────────────────────────────────────────────────────────────────────────
  const h = Float64Array.from(hRaw);
  let flooredCells = 0;
  for (let i = 0; i < h.length; i += 1) if (h[i] < o.floorMm) { h[i] = o.floorMm; flooredCells += 1; }

  // ── 2. THE GRADATION — a min-plus envelope over the 8-neighbour chamfer metric ───────────────────
  // `h(i) <- min_j ( h(j) + alpha * d(i,j) )`. Raster sweeps in alternating directions propagate the
  // envelope; the sweep is repeated until a full pass changes nothing, which is the exact fixed point of
  // the chamfer min-plus operator and therefore deterministic and order-independent in its RESULT.
  const before = Float64Array.from(h);
  let sweeps = 0;
  if (Number.isFinite(o.alpha) && o.alpha > 0) {
    const cx = o.alpha * dx; const cy = o.alpha * dy; const cd = o.alpha * Math.hypot(dx, dy);
    const wrap = (c: number): number => ((c % cols) + cols) % cols;
    for (let pass = 0; pass < 24; pass += 1) {
      let changed = false;
      const fwd = pass % 2 === 0;
      const r0 = fwd ? 0 : rows - 1; const rEnd = fwd ? rows : -1; const rStep = fwd ? 1 : -1;
      const c0 = fwd ? 0 : cols - 1; const cEnd = fwd ? cols : -1; const cStep = fwd ? 1 : -1;
      for (let r = r0; r !== rEnd; r += rStep) {
        for (let c = c0; c !== cEnd; c += cStep) {
          const i = r * cols + c;
          let v = h[i];
          // the four neighbours the sweep has already visited this pass, plus their mirrors on the
          // reverse pass — over two alternating passes every one of the eight is relaxed.
          const cL = wrap(c - cStep);
          const rP = r - rStep;
          const cand: number[] = [h[r * cols + cL] + cx];
          if (rP >= 0 && rP < rows) {
            cand.push(h[rP * cols + c] + cy);
            cand.push(h[rP * cols + cL] + cd);
            cand.push(h[rP * cols + wrap(c + cStep)] + cd);
          }
          for (const q of cand) if (q < v) v = q;
          if (v < h[i] - 1e-15) { h[i] = v; changed = true; }
        }
      }
      sweeps += 1;
      if (!changed && sweeps >= 2) break;
    }
  }
  let gradedCells = 0; let worstGrade = 1;
  for (let i = 0; i < h.length; i += 1) {
    if (h[i] < before[i] - 1e-12) {
      gradedCells += 1;
      const q = before[i] / h[i];
      if (q > worstGrade) worstGrade = q;
    }
  }

  const [rr50, rr99, rrmx] = ratioCensus(hRaw, cols, rows);
  const [q50, q99, qmx] = ratioCensus(h, cols, rows);
  const um = (v: number): number => Number((v * 1000).toFixed(3));

  const xMax = art.chart.xMaxMm; const rRef = art.chart.rRef; const H = art.chart.H;
  // BILINEAR on the prepared grid. Cell (c,r) carries the value at its CENTRE ((c+0.5)dx, (r+0.5)dy) —
  // the artifact's own convention (`estimator.query`) — so the interpolation origin is that centre and
  // NOT the cell corner. Periodic in x; clamped in y, where a rim is a rim.
  const hAt = (th: number, z: number): number => {
    let x = (rRef * th) % xMax; if (x < 0) x += xMax;
    const fx = x / dx - 0.5;
    const fy = Math.min(rows - 1, Math.max(0, z / dy - 0.5));
    const c0 = Math.floor(fx); const tx = fx - c0;
    const r0 = Math.min(rows - 1, Math.max(0, Math.floor(fy))); const ty = fy - r0;
    const r1 = Math.min(rows - 1, r0 + 1);
    const ca = ((c0 % cols) + cols) % cols; const cb = ((c0 + 1) % cols + cols) % cols;
    const h00 = h[r0 * cols + ca]; const h10 = h[r0 * cols + cb];
    const h01 = h[r1 * cols + ca]; const h11 = h[r1 * cols + cb];
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  };

  // ── THE SCATTERED FIELD, when the artifact carries one — built even when `grid` was asked for, so a
  //    diagnostic run can hold the two side by side without loading the file twice.
  const SC = art.scatter === undefined ? null : buildScatter(art, o, xMax);
  const hAtScatter = SC === null ? hAt : (th: number, z: number): number => {
    let x = (rRef * th) % xMax; if (x < 0) x += xMax;
    const [v] = SC.s.nearest(x, Math.min(H, Math.max(0, z)));
    return v < 0 ? hAt(th, z) : SC.s.h[v];
  };
  const sh = SC === null ? null : SC.s.h;

  return {
    cols, rows, dxMm: dx, dyMm: dy, rRef, H, xMaxMm: xMax,
    floorMm: o.floorMm, alpha: o.alpha, hRaw, h,
    hAt: wantScatter ? hAtScatter : hAt,
    fieldSource: wantScatter ? 'scatter' : 'grid',
    scatter: SC === null ? null : SC.s,
    stats: {
      source: art.source.stl, nCells: cols * rows,
      flooredCells, rawMinUm: um(rawMin),
      gradedCells, worstGradeRatio: Number(worstGrade.toFixed(4)), sweeps,
      p01: um(pct(h, 0.01)), p10: um(pct(h, 0.10)), p50: um(pct(h, 0.50)),
      p90: um(pct(h, 0.90)), p99: um(pct(h, 0.99)),
      min: um(pct(h, 0)), max: um(pct(h, 1 - 1e-12)),
      ratioRawP50: Number(rr50.toFixed(4)), ratioRawP99: Number(rr99.toFixed(4)), ratioRawMax: Number(rrmx.toFixed(4)),
      ratioP50: Number(q50.toFixed(4)), ratioP99: Number(q99.toFixed(4)), ratioMax: Number(qmx.toFixed(4)),
      scatterN: SC === null ? 0 : SC.s.n,
      scatterFloored: SC === null ? 0 : SC.floored,
      scatterGraded: SC === null ? 0 : SC.graded,
      scatterWorstGrade: SC === null ? 1 : SC.worstGrade,
      scatterRelaxations: SC === null ? 0 : SC.relax,
      scatterRatioRawP50: SC === null ? 0 : SC.ratRawP50,
      scatterRatioRawP99: SC === null ? 0 : SC.ratRawP99,
      scatterRatioRawMax: SC === null ? 0 : SC.ratRawMax,
      scatterRatioP50: SC === null ? 0 : SC.ratP50,
      scatterRatioP99: SC === null ? 0 : SC.ratP99,
      scatterRatioMax: SC === null ? 0 : SC.ratMax,
      sP01: sh === null ? 0 : um(pct(sh, 0.01)), sP10: sh === null ? 0 : um(pct(sh, 0.10)),
      sP50: sh === null ? 0 : um(pct(sh, 0.50)), sP90: sh === null ? 0 : um(pct(sh, 0.90)),
      sP99: sh === null ? 0 : um(pct(sh, 0.99)),
      sMin: sh === null ? 0 : um(pct(sh, 0)), sMax: sh === null ? 0 : um(pct(sh, 1 - 1e-12)),
      graphStretchP50: SC === null ? 1 : SC.stretchP50,
      graphStretchP99: SC === null ? 1 : SC.stretchP99,
      graphStretchMax: SC === null ? 1 : SC.stretchMax,
    },
  };
}

/**
 * THE COST THE PREPARED FIELD IMPLIES — the D6 integral, transcribed operand-for-operand from
 * `research/tools/s23Density.ts` (the `D6b CONSTRUCTOR-FACING prediction` block) so the number registered
 * before this build is comparable, to the digit, with the 1,761,257 Stage 0 registered from the raw field.
 *   `N_tri = SUM_cells dA / ((sqrt3/4) h^2)`,  `dA = sqrt(r^2 (1+r_z^2) + r_th^2) dTh dZ`.
 */
export function impliedTris(
  f: ReconField, rA: (th: number, z: number) => number, which: 'raw' | 'prepared',
): { nTri: number; areaMm2: number } {
  const SQRT3 = Math.sqrt(3);
  const hFD = 1e-6;
  const src = which === 'raw' ? f.hRaw : f.h;
  const dTh = f.dxMm / f.rRef; const dZ = f.dyMm;
  let n = 0; let area = 0;
  for (let r = 0; r < f.rows; r += 1) {
    const z = (r + 0.5) * dZ;
    for (let c = 0; c < f.cols; c += 1) {
      const th = ((c + 0.5) * f.dxMm) / f.rRef;
      const hh = src[r * f.cols + c];
      const r0 = rA(th, z);
      const rt = (rA(th + hFD, z) - rA(th - hFD, z)) / (2 * hFD);
      const rz = (rA(th, Math.min(f.H, z + hFD)) - rA(th, Math.max(0, z - hFD))) / (2 * hFD);
      const dA = Math.sqrt(r0 * r0 * (1 + rz * rz) + rt * rt) * dTh * dZ;
      area += dA;
      n += dA / ((SQRT3 / 4) * hh * hh);
    }
  }
  return { nTri: n, areaMm2: area };
}

/**
 * THE SCATTERED FIELD'S COST, INTEGRATED OVER ITS OWN VORONOI PARTITION — the EXACT one, with no lattice
 * anywhere in it.
 *
 * The scattered field is piecewise-constant on the source vertices' Voronoi cells, and each source vertex
 * owns, by the estimator's own definition, `A(v) = (sqrt3/2) * hA_raw(v)^2` of surface. So
 *   `N_tri = SUM_v A(v) / ((sqrt3/4) h_prep(v)^2) = SUM_v 2 * (hA_raw(v) / h_prep(v))^2`
 * with NO discretisation error of any kind. Its own sanity check is arithmetic and it is worth stating
 * because it is the whole reason this function exists: with `h_prep == hA_raw` it returns exactly `2*nV`,
 * i.e. the oracle mesh's own triangle count via Euler. **A lattice integral of this field that does not
 * converge to this number is measuring its own lattice**, which is precisely what the 0.25 mm grid's
 * 1,761,257 turned out to be.
 */
export function impliedTrisVoronoi(f: ReconField): { nTri: number; areaMm2: number; nTriRaw: number } {
  const SC = f.scatter;
  if (SC === null) throw new Error('impliedTrisVoronoi: this artifact carries no scattered field.');
  let n = 0; let area = 0;
  for (let v = 0; v < SC.n; v += 1) {
    const a = (Math.sqrt(3) / 2) * SC.hRaw[v] * SC.hRaw[v];
    area += a;
    n += a / ((Math.sqrt(3) / 4) * SC.h[v] * SC.h[v]);
  }
  return { nTri: n, areaMm2: area, nTriRaw: 2 * SC.n };
}

/**
 * THE SCATTERED FIELD'S COST OVER THE TRUE ANALYTIC AREA, at a stated sub-sampling of the reporting cell.
 *
 * The area element is evaluated once per 0.25 mm reporting cell (it is smooth at that scale — the D6
 * integral has always been computed this way) and the FIELD is sampled `k x k` times inside it. So `k`
 * dials the integral's resolving power on the field and nothing else, and the sequence over `k` is a
 * CONVERGENCE TEST rather than a set of alternative answers.
 *
 * **`k = 1` REPRODUCES THE 0.25 mm GRID'S OWN NUMBER TO THE DIGIT** — one sample at the cell centre IS
 * `gNear`, the value Stage 0 serialized — which is what makes this instrument comparable with everything
 * this campaign has already banked, and what makes the k-sequence a measurement of the grid's error
 * rather than an assertion about it.
 */
export function impliedTrisScatterSub(
  f: ReconField, rA: (th: number, z: number) => number, k: number,
): { nTri: number; areaMm2: number } {
  const SC = f.scatter;
  if (SC === null) throw new Error('impliedTrisScatterSub: this artifact carries no scattered field.');
  const SQRT3 = Math.sqrt(3);
  const hFD = 1e-6;
  const dTh = f.dxMm / f.rRef; const dZ = f.dyMm;
  const kk = Math.max(1, Math.round(k));
  let n = 0; let area = 0;
  for (let r = 0; r < f.rows; r += 1) {
    const z = (r + 0.5) * dZ;
    for (let c = 0; c < f.cols; c += 1) {
      const th = ((c + 0.5) * f.dxMm) / f.rRef;
      const r0 = rA(th, z);
      const rt = (rA(th + hFD, z) - rA(th - hFD, z)) / (2 * hFD);
      const rz = (rA(th, Math.min(f.H, z + hFD)) - rA(th, Math.max(0, z - hFD))) / (2 * hFD);
      const dA = Math.sqrt(r0 * r0 * (1 + rz * rz) + rt * rt) * dTh * dZ;
      area += dA;
      const dAs = dA / (kk * kk);
      for (let a = 0; a < kk; a += 1) {
        const px = (c + (a + 0.5) / kk) * f.dxMm;
        for (let b = 0; b < kk; b += 1) {
          const py = (r + (b + 0.5) / kk) * f.dyMm;
          const [v] = SC.nearest(px % f.xMaxMm, py);
          const hh = v < 0 ? f.h[r * f.cols + c] : SC.h[v];
          n += dAs / ((SQRT3 / 4) * hh * hh);
        }
      }
    }
  }
  return { nTri: n, areaMm2: area };
}
