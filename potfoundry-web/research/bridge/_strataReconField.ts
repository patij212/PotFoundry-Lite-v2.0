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

export interface ReconFieldOpts {
  /** hard floor on what may be asked for, mm. The constructor's own architectural floor. */
  floorMm: number;
  /** Lipschitz gradation constant: `h(y) <= h(x) + alpha*d(x,y)`. `Infinity` = OFF (raw field). */
  alpha: number;
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
  /** `h` at (theta, z), mm — bilinear on the prepared grid, periodic in theta, clamped in z. */
  hAt: (th: number, z: number) => number;
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
  };
}

interface DensityArtifact {
  schema: string;
  source: { stl: string; nTri: number; nVert: number; arm: string };
  chart: { rRef: number; xMaxMm: number; H: number };
  grid: { cols: number; rows: number; cellMm: number; dxMm: number; dyMm: number };
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
export function loadReconField(path: string, o: ReconFieldOpts): ReconField {
  const art = JSON.parse(readFileSync(path, 'utf8')) as DensityArtifact;
  if (art.schema !== RECON_SCHEMA) {
    throw new Error(`PF_CB_RECON: expected schema ${RECON_SCHEMA}, got ${String(art.schema)}. `
      + 'A density field from a different producer is a mis-priced constructor waiting to happen.');
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

  return {
    cols, rows, dxMm: dx, dyMm: dy, rRef, H, xMaxMm: xMax,
    floorMm: o.floorMm, alpha: o.alpha, hRaw, h, hAt,
    stats: {
      source: art.source.stl, nCells: cols * rows,
      flooredCells, rawMinUm: um(rawMin),
      gradedCells, worstGradeRatio: Number(worstGrade.toFixed(4)), sweeps,
      p01: um(pct(h, 0.01)), p10: um(pct(h, 0.10)), p50: um(pct(h, 0.50)),
      p90: um(pct(h, 0.90)), p99: um(pct(h, 0.99)),
      min: um(pct(h, 0)), max: um(pct(h, 1 - 1e-12)),
      ratioRawP50: Number(rr50.toFixed(4)), ratioRawP99: Number(rr99.toFixed(4)), ratioRawMax: Number(rrmx.toFixed(4)),
      ratioP50: Number(q50.toFixed(4)), ratioP99: Number(q99.toFixed(4)), ratioMax: Number(qmx.toFixed(4)),
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
