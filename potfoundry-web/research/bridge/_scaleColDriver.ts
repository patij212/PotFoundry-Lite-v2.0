// _scaleColDriver.ts — DEV-ONLY (research/ only; src/ NEVER imports this). E-2026-07-03-SCALECOL STEP-1: the
// STYLE-AGNOSTIC composition of the proven SFB@1 recipe. COMPOSES the committed libs READ-ONLY (no edits to
// _structColLib.ts / _qcolMsquare.ts) and auto-detects the per-style structure:
//   feature loci -> RIDGE GRAPH (buildRidgeGraph, style-agnostic already) -> M-SQUARE columns
//   (msquareRows + rasterizeColumnsSquare) -> explicit SEAM CLIFF iff rA is non-2pi-periodic (auto).
//
// AUTO-DETECT (from pure rA sampling, cheap):
//   - seamStep = max_t |rA(0,z) - rA(2pi-,z)|. If < seamTolMm the style is 2pi-periodic => WRAP builder (no cliff).
//     Else => buildStructWallSeamSquare (explicit inline M-square theta=0 cliff ladder).
//   - the ridge graph tracks whatever crest+valley slots the style HAS (constant count => pure strips; births =>
//     the newborn-block key-aware fan). No per-style code.
//
// The step/riser TREAD class (ArtDeco) is NOT handled here: a tread is a RANGE of radii at one z (multi-valued in z)
// that the single-valued rA(theta,z) cannot represent — it needs _sharp3dMesh's doubled-ring native-3D builder.
// The driver flags a style whose relief is a z-jump (handled elsewhere) vs a theta-feature (handled here).

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { RidgeGraph, StructMesh } from './_structColLib';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import {
  msquareRows, rasterizeColumnsSquare, buildStructWallSquare, buildStructWallSeamSquare,
} from './_qcolMsquare';

const TAU = 2 * Math.PI;

export interface ScaleColOpts {
  hRowMm?: number;       // target 3D row-height for M-square rows (density lever)
  scanN?: number;        // azimuth samples for extrema tracking
  seamTolMm?: number;    // below this the seam step is treated as 2pi-periodic (wrap, no cliff)
  wFloorMm?: number;     // min cell width
  wCapMm?: number;       // max cell width
  tipArcMm?: number;     // shoulder arc near a feature cusp
  nShoulder?: number;    // shoulder sub-columns per flank
  speedBlend?: number;   // b for msquareRows (0.5 = geometric-mean, the sweet spot)
  hRowCapMm?: number;    // cap on flat-region row height (chord guard)
  kinkTolMm?: number;    // below this max-2nd-diff the style is SMOOTH -> uniform M-square grid (no ridge graph)
  forcePath?: 'ridge-graph' | 'uniform-smooth'; // override the sharpness gate (A/B testing)
}

export interface ScaleColBuild {
  mesh: StructMesh;
  graph: RidgeGraph;
  ts: number[];
  seamStepMaxMm: number;
  seamIsPeriodic: boolean;
  builder: 'wrap' | 'seamCliff' | 'uniform';
  nCrest: number;
  nValley: number;
  births: number;
  genuineBirths: number;
  flickerFilledRows: number;
  kinkiness: number;
  path: 'ridge-graph' | 'uniform-smooth';
}

/** max_t |rA(0,z) - rA(2pi-,z)| across a t-scan (the seam step = non-2pi-periodic cliff height). */
export function measureSeamStep(rA: AnalyticRadiusFn, H: number, nT = 121): { max: number; mean: number } {
  let mx = 0, sum = 0;
  for (let i = 0; i < nT; i++) {
    const z = (i / (nT - 1)) * H;
    const s = Math.abs(rA(0, z) - rA((1 - 1e-9) * TAU, z));
    if (s > mx) mx = s; sum += s;
  }
  return { max: mx, mean: sum / nT };
}

/** SHARPNESS SCREEN: max over a (theta,z) grid of the discrete 2nd-difference of r along theta (a C1 crease/kink
 * indicator, mm). Smooth styles read ~0; step/strap/lattice styles read high. Drives the ridge-graph-vs-uniform gate:
 * a SMOOTH style needs no feature embedding — a plain M-square uniform grid is CAD-grade (the 13/20 smooth tier). */
export function measureKinkiness(rA: AnalyticRadiusFn, H: number, nT = 61, nU = 2048): number {
  let mx = 0;
  for (let it = 0; it < nT; it++) {
    const z = (it / (nT - 1)) * H; const r = new Float64Array(nU);
    for (let i = 0; i < nU; i++) r[i] = rA(TAU * (i / nU), z);
    for (let i = 0; i < nU; i++) { const d2 = Math.abs(r[(i - 1 + nU) % nU] - 2 * r[i] + r[(i + 1) % nU]); if (d2 > mx) mx = d2; }
  }
  return mx;
}

/**
 * UNIFORM M-SQUARE GRID (the SMOOTH-style path): no ridge graph. Place t-rows by equal-3D-arc of the balanced-speed
 * column (msquareRows) and, per row, place columns by equal-3D-arc so cell WIDTH ~= local 3D row-height (square).
 * Periodic wrap in u. This is CAD-grade for smooth relief (no sharp features to embed) and avoids the ridge-graph
 * fragility on helical-interference styles (HarmonicRipple: 2-freq helical crests that the slot-tracker mis-chains).
 */
export function buildUniformMSquare(rA: AnalyticRadiusFn, H: number, opts: ScaleColOpts = {}): StructMesh {
  const hRowMm = opts.hRowMm ?? 0.15;
  const speedBlend = opts.speedBlend ?? 0.5;
  const hRowCapMm = opts.hRowCapMm ?? hRowMm * 6;
  const ts = msquareRows(rA, H, hRowMm, [], { seamBand: 0.02, speedBlend, hRowCapMm });
  const nR = ts.length;
  // per row: number of columns so cell width ~ local row-height. Use a FIXED column count (median over rows) so
  // adjacent rows are equal-count => clean quad strips. Column j placed by equal-3D-arc over the full ring.
  const rowHeightMm = (r: number): number => {
    const t = ts[r]; const dtUp = r + 1 < nR ? ts[r + 1] - t : Infinity, dtDn = r > 0 ? t - ts[r - 1] : Infinity;
    const dt = Math.min(dtUp, dtDn); if (!isFinite(dt)) return hRowMm;
    // representative vertical speed at mid-u
    const z0 = Math.max(0, t - 1e-4) * H, z1 = Math.min(1, t + 1e-4) * H; const th = Math.PI;
    const p = (zz: number): [number, number, number] => { const rr = rA(th, zz); return [rr * Math.cos(th), rr * Math.sin(th), zz]; };
    const a = p(z0), b = p(z1); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (2e-4) * dt;
  };
  const ringLenMm = (z: number): number => { let L = 0, px = 0, py = 0; const M = 4096; for (let i = 0; i <= M; i++) { const th = TAU * (i / M); const rr = rA(th, z); const x = rr * Math.cos(th), y = rr * Math.sin(th); if (i > 0) L += Math.hypot(x - px, y - py); px = x; py = y; } return L; };
  const perRowCols: number[] = [];
  for (let r = 0; r < nR; r++) { const w = Math.max(opts.wFloorMm ?? 0.03, Math.min(opts.wCapMm ?? 0.6, rowHeightMm(r))); perRowCols.push(Math.max(8, Math.ceil(ringLenMm(ts[r] * H) / w))); }
  const sorted = [...perRowCols].sort((a, b) => a - b); const nCol = sorted[Math.floor(sorted.length / 2)];
  // equal-3D-arc column placement per row.
  const colU = (z: number, n: number): Float64Array => {
    const M = Math.max(4096, 8 * n); const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const th = TAU * (i / M); const rr = rA(th, z); const x = rr * Math.cos(th), y = rr * Math.sin(th); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const tot = cum[M] || 1; const out = new Float64Array(n);
    for (let j = 0; j < n; j++) { const tg = tot * (j / n); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < tg) lo = m; else hi = m; } out[j] = (lo + (tg - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M; }
    return out;
  };
  const rowStart: number[] = [0]; for (let r = 0; r < nR; r++) rowStart.push(rowStart[r] + nCol);
  const total = nR * nCol; const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  const us: Float64Array[] = [];
  for (let r = 0; r < nR; r++) {
    const z = ts[r] * H; const u = colU(z, nCol); us.push(u); const base = rowStart[r];
    for (let k = 0; k < nCol; k++) { const th = u[k] * TAU; const rr = rA(th, z); const v = base + k; xyz[3 * v] = rr * Math.cos(th); xyz[3 * v + 1] = rr * Math.sin(th); xyz[3 * v + 2] = z; ut[2 * v] = u[k]; ut[2 * v + 1] = ts[r]; }
  }
  const idx: number[] = [];
  const d2 = (a: number, b: number): number => { const dx = xyz[3 * a] - xyz[3 * b], dy = xyz[3 * a + 1] - xyz[3 * b + 1], dz = xyz[3 * a + 2] - xyz[3 * b + 2]; return dx * dx + dy * dy + dz * dz; };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart[r], bb = rowStart[r + 1];
    for (let c = 0; c < nCol; c++) { const cn = (c + 1) % nCol; const a = tb + c, an = tb + cn, b = bb + c, bn = bb + cn; if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); } else { idx.push(a, b, an); idx.push(an, b, bn); } }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/**
 * The style-agnostic build. Auto-detects the seam cliff and dispatches to the right M-square wall builder.
 * Returns the mesh + the graph + the detected structure (for the scorecard). NO per-style branching.
 */
export function buildScaleColMesh(rA: AnalyticRadiusFn, H: number, opts: ScaleColOpts = {}): ScaleColBuild {
  const hRowMm = opts.hRowMm ?? 0.15;
  const scanN = opts.scanN ?? 4096;
  const seamTolMm = opts.seamTolMm ?? 0.05;
  const wFloorMm = opts.wFloorMm ?? 0.03;
  const wCapMm = opts.wCapMm ?? 0.6;
  const tipArcMm = opts.tipArcMm ?? 0.03;
  const nShoulder = opts.nShoulder ?? 2;
  const speedBlend = opts.speedBlend ?? 0.5;
  const hRowCapMm = opts.hRowCapMm ?? hRowMm * 6;

  const kinkTolMm = opts.kinkTolMm ?? 0.12;

  // 0) SHARPNESS GATE + seam detection.
  const seam = measureSeamStep(rA, H);
  const seamIsPeriodic = seam.max < seamTolMm;
  const kinkiness = measureKinkiness(rA, H);
  const path = opts.forcePath ?? (kinkiness < kinkTolMm && seamIsPeriodic ? 'uniform-smooth' : 'ridge-graph');

  // SMOOTH PATH: no ridge graph — a uniform M-square grid is CAD-grade for smooth relief and avoids the ridge-graph
  // fragility on helical-interference styles (HarmonicRipple's 2-freq helical crests mis-chain the slot-tracker).
  if (path === 'uniform-smooth') {
    const uMesh = buildUniformMSquare(rA, H, { hRowMm, speedBlend, hRowCapMm, wFloorMm, wCapMm });
    const uTs = msquareRows(rA, H, hRowMm, [], { seamBand: 0.02, speedBlend, hRowCapMm });
    const emptyGraph = buildRidgeGraphDeflicker(rA, H, [0, 0.5, 1], 512); // trivial (unused; for shape only)
    return {
      mesh: uMesh, graph: emptyGraph, ts: uTs,
      seamStepMaxMm: seam.max, seamIsPeriodic, builder: 'uniform',
      nCrest: 0, nValley: 0, births: 0, genuineBirths: 0, flickerFilledRows: 0,
      kinkiness, path,
    };
  }

  // RIDGE-GRAPH PATH (sharp features): feature loci -> ridge graph -> M-square columns -> seam cliff.
  // 1) M-square row placement (needs the births for mandatory rows; pre-scan of PERSISTENT count changes).
  const births = findBirths(rA, H, scanN);
  const ts = msquareRows(rA, H, hRowMm, births, { seamBand: 0.02, speedBlend, hRowCapMm });

  // 2) DE-FLICKERED ridge graph (continuous slot identity through GENUINE births + seam; robust to extrema-count
  //    OSCILLATION that fooled the committed buildRidgeGraph into spurious seam-births — the generalization fix).
  const graph = buildRidgeGraphDeflicker(rA, H, ts, scanN, { persistFrac: 0.06 });

  // 3) M-square columns (width matched to local 3D row-height; ridges stay exact columns => zero serration).
  const rows = rasterizeColumnsSquare(graph, rA, H, tipArcMm, nShoulder, wFloorMm, wCapMm);

  // 4) wall builder: explicit cliff iff non-2pi-periodic, else periodic wrap.
  const mesh = seamIsPeriodic
    ? buildStructWallSquare(rA, H, rows, 'wrap')
    : buildStructWallSeamSquare(rA, H, rows, wFloorMm, wCapMm);

  const nBirths = (graph.nCrest - crestCountAt0(graph)) + (graph.nValley - valleyCountAt0(graph));
  return {
    mesh, graph, ts,
    seamStepMaxMm: seam.max, seamIsPeriodic,
    builder: seamIsPeriodic ? 'wrap' : 'seamCliff',
    nCrest: graph.nCrest, nValley: graph.nValley, births: nBirths,
    genuineBirths: graph.diag.crestGenuineBirths + graph.diag.valleyGenuineBirths,
    flickerFilledRows: graph.diag.crestFilledRows + graph.diag.valleyFilledRows,
    kinkiness, path,
  };
}

function crestCountAt0(g: RidgeGraph): number { let n = 0; for (let s = 0; s < g.nCrest; s++) if (!Number.isNaN(g.crestU[0][s])) n++; return n; }
function valleyCountAt0(g: RidgeGraph): number { let n = 0; for (let s = 0; s < g.nValley; s++) if (!Number.isNaN(g.valleyU[0][s])) n++; return n; }

/** t values where the crest OR valley count PERSISTENTLY changes (genuine births/deaths), for mandatory M-square
 * rows. Smooths the count series by a running mode (window = persistFrac*nT) so a transient FLICKER (a marginal
 * extremum that dips out for 1-2 rows — HarmonicRipple wobbles 19<->20 46× ) does NOT register as a birth; only a
 * count level held for a run of rows does. Coarse scan. */
export function findBirths(rA: AnalyticRadiusFn, H: number, scanN: number, nT = 240, persistFrac = 0.06): number[] {
  const countAt = (z: number, sign: number): number => {
    let c = 0; const N = Math.min(2048, scanN);
    const v = new Float64Array(N); for (let i = 0; i < N; i++) v[i] = sign * rA(TAU * (i / N), z);
    for (let i = 0; i < N; i++) { const a = v[(i - 1 + N) % N], b = v[i], cc = v[(i + 1) % N]; if (b >= a && b > cc) c++; }
    return c;
  };
  const cC: number[] = [], vC: number[] = [];
  for (let i = 0; i < nT; i++) { const z = (i / (nT - 1)) * H; cC.push(countAt(z, 1)); vC.push(countAt(z, -1)); }
  const win = Math.max(2, Math.floor(persistFrac * nT));
  const mode = (arr: number[], i: number): number => {
    const lo = Math.max(0, i - win), hi = Math.min(nT - 1, i + win);
    const h = new Map<number, number>(); for (let k = lo; k <= hi; k++) h.set(arr[k], (h.get(arr[k]) ?? 0) + 1);
    let best = arr[i], bn = -1; for (const [c, n] of h) if (n > bn || (n === bn && c > best)) { best = c; bn = n; } return best;
  };
  const births: number[] = [];
  let prevC = -1, prevV = -1;
  for (let i = 0; i < nT; i++) {
    const cc = mode(cC, i), vv = mode(vC, i);
    if (i > 0 && (cc !== prevC || vv !== prevV)) births.push(i / (nT - 1));
    prevC = cc; prevV = vv;
  }
  return births;
}
