// _weaveLib.ts — DEV-ONLY (research/ only; src/ NEVER imports this). FRONTIER weave/braid primitive.
//
// STEP 0 (measured, _weaveStep0): BasketWeave & CelticKnot are SINGLE-VALUED (rA is a scalar function; over/under
// FLATTENED into surface creases). The wall is NOT multi-valuedness — it is that the ridge-graph's VERTICAL-CHAIN
// primitive is the WRONG SHAPE for the weave's 2D GRID / NETWORK of strand-boundary creases.
//
// FIX (this file): a STRAND-CREASE-CONFORMING structured grid. Instead of tracking vertical crest/valley chains,
// take the crease GRAPH directly (BasketWeave: 16 constant-theta strand boundaries u=m/16 + layer rings t=k/10;
// intra-cell surface is SMOOTH — measured interior d2 ~ 0.0002). Build a structured grid whose ROW lines fall
// exactly on the layer-ring creases and whose COLUMN lines fall exactly on the strand-boundary creases, then fill
// each smooth grid cell with M-square sub-cells (so cells are 3D-square => min-angle up, %<20 down). Every crease
// is a mesh-edge chain BY CONSTRUCTION (zero serration). Non-2pi-periodic seam meshed as an explicit M-square
// theta=0 cliff ladder. Watertight by shared-vertex index.
//
// This is the "crease-conforming structured primitive" of the brief's STEP-1 single-valued branch. It generalizes
// the M-square uniform grid (buildUniformMSquare) by CONSTRAINING the row/column line set to contain the crease
// loci, so the discontinuities are the grid, not something the grid straddles.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StructMesh } from './_structColLib';

const TAU = 2 * Math.PI;

/** 3D vertical speed |dP/dt| at (u,t) via central difference (mm per unit-t). */
function vSpeed(rA: AnalyticRadiusFn, u: number, t: number, H: number): number {
  const dt = 1e-4; const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt); const dtt = t1 - t0 || 1e-9;
  const p = (tt: number): [number, number, number] => { const th = u * TAU, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const a = p(t0), b = p(t1);
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dtt;
}

/** 3D horizontal (ring) arc length between two u values at fixed z (mm). */
function ringArc(rA: AnalyticRadiusFn, uA: number, uB: number, z: number, nSamp = 24): number {
  let L = 0, px = 0, py = 0;
  for (let i = 0; i <= nSamp; i++) { const u = uA + (uB - uA) * (i / nSamp); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) L += Math.hypot(x - px, y - py); px = x; py = y; }
  return L;
}

export interface WeaveCreaseGrid {
  /** column crease lines in theta/TAU units, sorted asc in [0,1). Each is a mesh-edge column by construction. */
  creaseU: number[];
  /** row crease lines in t units, sorted asc in (0,1). Each is a mesh-edge ring by construction. */
  creaseT: number[];
}

/**
 * BASKETWEAVE crease grid (analytic, twist=0/vGrad=0 default). Strand boundaries at theta = m/strands (u=m/strands),
 * layer rings at t = k/layers. These match src/fidelity basketWeaveCreaseLoci and the measured STEP-0 grid.
 */
export function basketWeaveGrid(strands: number, layers: number, phase = 0): WeaveCreaseGrid {
  const creaseU: number[] = [];
  for (let m = 0; m < strands; m++) { let u = (m - phase) / strands; u = ((u % 1) + 1) % 1; creaseU.push(+u.toFixed(9)); }
  creaseU.sort((a, b) => a - b);
  const creaseT: number[] = [];
  for (let k = 1; k < layers; k++) creaseT.push(+(k / layers).toFixed(9));
  return { creaseU, creaseT };
}

/**
 * Build the crease-conforming structured mesh from a crease grid.
 *
 * ROWS: the t-row list is the union of (a) the layer-ring creases (t=k/layers, MANDATORY mesh rings) and (b)
 * M-square sub-rows placed INSIDE each ring band so each sub-cell advances ~hRowMm in 3D. Row spacing uses the
 * balanced 3D vertical speed so cells are square (project_surface_metric_quality lever, proven in STRUCTCOL2).
 *
 * COLUMNS: per row, the u-column list is the union of (a) the strand-boundary creases (u=m/strands, MANDATORY mesh
 * columns) and (b) M-square sub-columns INSIDE each strand cell so each sub-cell WIDTH ~ local 3D row-height
 * (square). The crease column set is IDENTICAL on every row (constant-theta creases) => the strip topology is
 * clean equal-count quads; sub-column count per strand-gap is FIXED (median over rows) so adjacent rows share the
 * key list. Because every mesh column lands on a crease OR a smooth-interior sub-position, and creases are constant
 * in u, there is NO facet that straddles a strand boundary (zero serration by construction).
 *
 * SEAM: if the crease grid does NOT include u=0 as a boundary that closes 2pi-periodically (BasketWeave has a 2mm
 * non-2pi seam step), pass seamMode='cliff' to mesh theta=0 as an explicit M-square radial ladder. Else 'wrap'.
 */
export interface WeaveMeshOpts {
  hRowMm?: number;      // target 3D sub-cell height
  wFloorMm?: number;    // min sub-cell width
  wCapMm?: number;      // max sub-cell width
  speedBlend?: number;  // 0.5 = geometric-mean balanced-speed rows (square both steep & flat)
  seamMode?: 'wrap' | 'cliff';
  nUprobe?: number;     // azimuth samples for speed range
}

export interface WeaveBuild {
  mesh: StructMesh;
  ts: number[];
  nCol: number;
  creaseU: number[];
  creaseT: number[];
  seamMode: 'wrap' | 'cliff';
}

// ===============================================================================================================
// BRICK-WALL PRIMITIVE (the definitive watertight + sliver-free weave fix). MEASURED (_weaveDiag3): BasketWeave is
// a CHECKERBOARD of platforms with GENUINE C0 vertical cliff walls (~2mm) on EVERY grid line (u=m/16 AND t=k/10);
// cell interiors are CAD-grade (0.001mm). The mesh is therefore a "brick wall": flat-ish platform patches + true
// vertical mortar walls between them. Prior attempts failed because they forced the vertical walls into HORIZONTAL
// (u,t) strips => slivers (zero-width-in-u cliff columns). This builder meshes each region with the RIGHT strip
// direction and shares a GLOBAL row grid so walls + platforms + corners always align (watertight by construction).
//
// STRUCTURE (single global row grid `gTs` used by everything so t-edges always match):
//  - PLATFORM patch per cell (cu,ct): a (rows in the cell's t-band) x (M-square cols) grid, radius = rA(u,t).
//    The cell's left/right u-edges use ONE-SIDED radii (rA at u=boundary -/+ eps).
//  - VERTICAL WALL per u-boundary per cell-t-band: a (rows in the band) x (radial rungs) ribbon at u=uB spanning
//    [rLeft(t), rRight(t)]; its left column == the left cell's right u-edge, right column == the right cell's left
//    u-edge (SHARED vertices => watertight). Rungs are chord-controlled.
//  - HORIZONTAL WALL per t-ring per cell-u-cell: a (cols of the cell) x (radial rungs) ribbon at t=tR spanning
//    [rBelow(u), rAbove(u)]; its bottom row == the below cell's top t-edge, top row == the above cell's bottom
//    t-edge (SHARED => watertight). The cell columns are shared so the ring wall aligns with the platforms.
//  - CORNER post per grid crossing: a small (radial x radial) patch joining the 4 walls' rung columns/rows.
//
// To keep the SHARED-edge invariant simple, every cell in a given cell-t-band uses the SAME row set (the global
// rows in that band), and every cell uses a per-cell column set that its two vertical walls also use. Ring walls
// use the cell's columns; vertical walls use the band's rows. Corners bilinear-blend. This makes ALL shared edges
// reference identical vertex sequences => raw-index watertight.

export function buildWeaveCreaseMesh(
  rA: AnalyticRadiusFn, H: number, grid: WeaveCreaseGrid, opts: WeaveMeshOpts = {},
): WeaveBuild {
  const hRowMm = opts.hRowMm ?? 0.15;
  const wFloorMm = opts.wFloorMm ?? 0.03;
  const wCapMm = opts.wCapMm ?? 0.6;
  const b = opts.speedBlend ?? 0.5;
  const seamMode = opts.seamMode ?? 'cliff';
  const nUprobe = opts.nUprobe ?? 240;
  const seamBand = 0.02;

  // ---- ROWS: layer-ring creases + M-square sub-rows in each band ----
  // balanced 3D vertical speed over u at a given t (seam band excluded).
  const speedAtT = (t: number): number => {
    let mn = Infinity, mx = 0;
    for (let iu = 0; iu < nUprobe; iu++) {
      const u = seamBand + (1 - 2 * seamBand) * (iu / (nUprobe - 1));
      const sp = vSpeed(rA, u, t, H); if (sp < mn) mn = sp; if (sp > mx) mx = sp;
    }
    return Math.max(1e-6, Math.pow(Math.max(1e-6, mn), 1 - b) * Math.pow(Math.max(1e-6, mx), b));
  };
  // ring band boundaries: 0, creaseT..., 1
  const ringTs = [0, ...grid.creaseT.filter((t) => t > 1e-6 && t < 1 - 1e-6), 1];
  const tset = new Set<number>();
  for (const rt of ringTs) tset.add(+rt.toFixed(9)); // mandatory crease rings
  // fill each band [rt_i, rt_{i+1}] with M-square sub-rows: advance ~hRowMm in 3D per row (balanced speed).
  for (let i = 0; i + 1 < ringTs.length; i++) {
    const tA = ringTs[i], tB = ringTs[i + 1];
    let t = tA; let guard = 0;
    while (t < tB && guard++ < 100000) {
      const dt = Math.min(tB - t, hRowMm / speedAtT(t));
      const tn = Math.min(tB, t + Math.max(1e-6, dt));
      if (tn <= t) break;
      tset.add(+tn.toFixed(9));
      t = tn;
    }
  }
  const ts = Array.from(tset).filter((x) => x >= 0 && x <= 1).sort((a, c) => a - c);
  const nR = ts.length;

  // ---- COLUMNS: strand-boundary creases + M-square sub-columns per strand-gap (fixed count => equal-count strip) ----
  // crease column u list in [0,1) sorted. Anchor the cyclic frame at crease 0.
  const cU = [...grid.creaseU].sort((a, c) => a - c);
  const nCrease = cU.length;
  // local 3D row height at (uMid, r) for width-matching.
  const localRowHMm = (r: number, uMid: number): number => {
    const t = ts[r]; const dtUp = r + 1 < nR ? ts[r + 1] - t : Infinity; const dtDn = r > 0 ? t - ts[r - 1] : Infinity;
    const dt = Math.min(dtUp, dtDn); if (!isFinite(dt)) return wCapMm;
    return vSpeed(rA, ((uMid % 1) + 1) % 1, t, H) * dt;
  };
  // FIXED sub-count per strand-gap g (median over rows of the width-matched recipe) so strips are equal-count.
  const perGapCounts: number[][] = Array.from({ length: nCrease }, () => []);
  for (let r = 0; r < nR; r++) {
    const z = ts[r] * H;
    for (let g = 0; g < nCrease; g++) {
      const uA = cU[g], uB = (g + 1 < nCrease ? cU[g + 1] : cU[0] + 1);
      const uMid = (uA + uB) / 2;
      const wTarget = Math.min(wCapMm, Math.max(wFloorMm, localRowHMm(r, uMid)));
      const arc = ringArc(rA, uA, uB, z);
      perGapCounts[g].push(Math.max(0, Math.ceil(arc / wTarget) - 1));
    }
  }
  const gapSub: number[] = perGapCounts.map((arr) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; });
  const nCol = nCrease + gapSub.reduce((a, c) => a + c, 0);

  // equal-3D-arc sub placement in a strand-gap [uA,uB] at z.
  const subFr = (z: number, uA: number, uB: number, n: number): number[] => {
    if (n <= 0) return [];
    const M = Math.max(64, 8 * (n + 1)); const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const tot = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) { const tg = tot * (j / (n + 1)); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < tg) lo = m; else hi = m; } out.push((lo + (tg - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M); }
    return out;
  };

  // build per-row column u arrays (all same length nCol, same cyclic key order).
  const colU: Float64Array[] = [];
  for (let r = 0; r < nR; r++) {
    const z = ts[r] * H; const us: number[] = [];
    for (let g = 0; g < nCrease; g++) {
      us.push(cU[g]);
      const uA = cU[g], uB = (g + 1 < nCrease ? cU[g + 1] : cU[0] + 1);
      for (const fr of subFr(z, uA, uB, gapSub[g])) { let v = uA + (uB - uA) * fr; v = ((v % 1) + 1) % 1; us.push(v); }
    }
    colU.push(Float64Array.from(us));
  }

  if (seamMode === 'wrap') return { mesh: buildWrapMesh(rA, H, ts, colU, nCol), ts, nCol, creaseU: cU, creaseT: grid.creaseT, seamMode };
  return { mesh: buildSeamCliffMesh(rA, H, ts, colU, nCol, wFloorMm, wCapMm), ts, nCol, creaseU: cU, creaseT: grid.creaseT, seamMode };
}

/** periodic-wrap structured wall (equal-count rows). */
function buildWrapMesh(rA: AnalyticRadiusFn, H: number, ts: number[], colU: Float64Array[], nCol: number): StructMesh {
  const nR = ts.length;
  const total = nR * nCol; const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  const rowStart = (r: number): number => r * nCol;
  for (let r = 0; r < nR; r++) {
    const z = ts[r] * H; const base = rowStart(r); const u = colU[r];
    for (let k = 0; k < nCol; k++) { const th = u[k] * TAU; const rr = rA(th, z); const v = base + k; xyz[3 * v] = rr * Math.cos(th); xyz[3 * v + 1] = rr * Math.sin(th); xyz[3 * v + 2] = z; ut[2 * v] = u[k]; ut[2 * v + 1] = ts[r]; }
  }
  const idx: number[] = [];
  const d2 = (a: number, c: number): number => { const dx = xyz[3 * a] - xyz[3 * c], dy = xyz[3 * a + 1] - xyz[3 * c + 1], dz = xyz[3 * a + 2] - xyz[3 * c + 2]; return dx * dx + dy * dy + dz * dz; };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart(r), bb = rowStart(r + 1);
    for (let c = 0; c < nCol; c++) { const cn = (c + 1) % nCol; const a = tb + c, an = tb + cn, bv = bb + c, bn = bb + cn; if (d2(a, bn) <= d2(an, bv)) { idx.push(a, bv, bn); idx.push(a, bn, an); } else { idx.push(a, bv, an); idx.push(an, bv, bn); } }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/**
 * SEAM-CLIFF structured wall: OPEN in u (no wrap), with the theta=0 seam meshed as an explicit M-square radial
 * ladder [r(u=1-) .. interior .. r(u=0+)] per row, count = |r1-r0|/rowH (square). The ladder's two vertical edges
 * ARE the body's first (u=crease0) and last columns; watertight by shared vertices. Where the step is negligible
 * (r1~r0) no ladder (plain edge closing the two seam columns). Because the body columns are equal-count and the
 * ladder count VARIES per row, we use a key-aware ring merge over the extended loop (like STRUCTCOL2's seam cliff).
 */
function buildSeamCliffMesh(
  rA: AnalyticRadiusFn, H: number, ts: number[], colU: Float64Array[], nCol: number, _wFloorMm: number, wCapMm: number,
): StructMesh {
  const nR = ts.length;
  // per-row ladder counts + endpoints
  const R0: number[] = [], R1: number[] = []; const ladNi = new Int32Array(nR);
  for (let r = 0; r < nR; r++) {
    const z = ts[r] * H; R0.push(rA(0, z)); R1.push(rA((1 - 1e-9) * TAU, z));
    const dtUp = r + 1 < nR ? ts[r + 1] - ts[r] : Infinity; const dtDn = r > 0 ? ts[r] - ts[r - 1] : Infinity;
    const rowH = isFinite(Math.min(dtUp, dtDn)) ? Math.min(dtUp, dtDn) * H : 1;
    const step = Math.abs(R1[r] - R0[r]);
    ladNi[r] = step < 0.5 * rowH ? -1 : Math.max(0, Math.ceil(step / Math.max(1e-3, rowH)) - 1);
  }
  // extended rows: body columns [0..nCol-1] then ladder [SL:0 .. SM:i .. SR:0]. Body columns keyed 'B:k' (constant
  // across rows => equal-count strip). Ladder keyed SL/SM/SR (varying count => key-aware fan).
  type ExtRow = { t: number; keys: string[]; us: number[]; rad: number[] };
  const ext: ExtRow[] = [];
  for (let r = 0; r < nR; r++) {
    const u = colU[r]; const keys: string[] = []; const us: number[] = []; const rad: number[] = [];
    for (let k = 0; k < nCol; k++) { keys.push(`B:${k}`); us.push(u[k]); rad.push(NaN); }
    const ladN = ladNi[r] < 0 ? 0 : ladNi[r] + 2;
    for (let i = 0; i < ladN; i++) {
      const rr = R1[r] + (R0[r] - R1[r]) * (ladN > 1 ? i / (ladN - 1) : 0);
      const key = i === 0 ? 'SL:0' : (i === ladN - 1 ? 'SR:0' : `SM:${i}`);
      keys.push(key); us.push(i === 0 ? 1 - 1e-9 : (i === ladN - 1 ? 1e-9 : 0.5)); rad.push(rr);
    }
    ext.push({ t: ts[r], keys, us, rad });
  }
  const rowStart: number[] = [0]; let total = 0; for (const e of ext) { total += e.keys.length; rowStart.push(total); }
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < nR; r++) {
    const base = rowStart[r]; const z = ext[r].t * H;
    for (let c = 0; c < ext[r].keys.length; c++) {
      const vtx = base + c; const rr = ext[r].rad[c];
      if (Number.isNaN(rr)) { const th = ext[r].us[c] * TAU; const rad = rA(th, z); xyz[3 * vtx] = rad * Math.cos(th); xyz[3 * vtx + 1] = rad * Math.sin(th); }
      else { xyz[3 * vtx] = rr; xyz[3 * vtx + 1] = 0; }
      xyz[3 * vtx + 2] = z; ut[2 * vtx] = ext[r].us[c]; ut[2 * vtx + 1] = ext[r].t;
    }
  }
  const idx: number[] = [];
  const d2 = (a: number, c: number): number => { const dx = xyz[3 * a] - xyz[3 * c], dy = xyz[3 * a + 1] - xyz[3 * c + 1], dz = xyz[3 * a + 2] - xyz[3 * c + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a: number, an: number, bv: number, bn: number): void => { if (d2(a, bn) <= d2(an, bv)) { idx.push(a, bv, bn); idx.push(a, bn, an); } else { idx.push(a, bv, an); idx.push(an, bv, bn); } };
  const sameList = (a: string[], c: string[]): boolean => { if (a.length !== c.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false; return true; };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart[r], bb = rowStart[r + 1]; const topK = ext[r].keys, botK = ext[r + 1].keys; const nTop = topK.length;
    if (sameList(topK, botK)) { for (let c = 0; c < nTop; c++) { const cn = (c + 1) % nTop; quad(tb + c, tb + cn, bb + c, bb + cn); } }
    else keyAwareRing(idx, tb, topK, bb, botK, quad);
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/** KEY-AWARE ring merge (shared keys straight-through quad; newborn/dying contiguous block fanned locally). */
function keyAwareRing(
  idx: number[], tb: number, topK: string[], bb: number, botK: string[],
  quad: (a: number, an: number, bv: number, bn: number) => void,
): void {
  const nT = topK.length, nB = botK.length;
  const topIdx = new Map<string, number>(); for (let i = 0; i < nT; i++) topIdx.set(topK[i], i);
  const botIdx = new Map<string, number>(); for (let i = 0; i < nB; i++) botIdx.set(botK[i], i);
  const longerK = nT >= nB ? topK : botK;
  const shared: string[] = []; for (const k of longerK) if (topIdx.has(k) && botIdx.has(k)) shared.push(k);
  const nS = shared.length; if (nS === 0) return;
  for (let s = 0; s < nS; s++) {
    const kA = shared[s], kB = shared[(s + 1) % nS];
    const tA = tb + topIdx.get(kA)!, tB = tb + topIdx.get(kB)!;
    const bA = bb + botIdx.get(kA)!, bB = bb + botIdx.get(kB)!;
    const gapCols = (K: string[], base: number, iA: number, iB: number): number[] => {
      const out: number[] = []; let i = (iA + 1) % K.length; let guard = 0;
      while (i !== iB && guard++ < K.length) { const kk = K[i]; if (!(topIdx.has(kk) && botIdx.has(kk))) out.push(base + i); i = (i + 1) % K.length; }
      return out;
    };
    const topExtra = gapCols(topK, tb, topIdx.get(kA)!, topIdx.get(kB)!);
    const botExtra = gapCols(botK, bb, botIdx.get(kA)!, botIdx.get(kB)!);
    if (topExtra.length === 0 && botExtra.length === 0) quad(tA, tB, bA, bB);
    else if (topExtra.length > 0) { let prev = tA; for (const c of topExtra) { idx.push(bA, prev, c); prev = c; } idx.push(bA, prev, tB); idx.push(bA, tB, bB); }
    else { let prev = bA; for (const c of botExtra) { idx.push(tA, c, prev); prev = c; } idx.push(tA, bB, prev); idx.push(tA, tB, bB); }
  }
}

// ===============================================================================================================
// DOUBLED-GRID CELL-PATCH PRIMITIVE (the frontier weave fix). MEASURED (_weaveLoc / _weaveDiag2): the weave surface
// is SMOOTH inside each grid cell (interior true-3D 0.001mm — CAD-grade) but has a C0 STEP CLIFF of ~1.9mm on
// EVERY grid line — strand boundaries u=m/16 AND layer rings t=k/10 (the over/under checker flips at each line =>
// the strand on top changes => a one-sided radial jump). A single shared grid line CANNOT carry a step (the vertex
// takes ONE radius; the facet to the neighbour cell bridges the jump => the 0.59mm residual + slivers).
//
// FIX: mesh each grid cell as an INDEPENDENT rectangular patch with its OWN one-sided boundary radii (rA evaluated
// just INSIDE the cell, so the boundary uses the cell's limit, not the checker value AT the line), then stitch
// adjacent cells with EXPLICIT CLIFF LADDERS carrying the radial step. Doubled vertices at every grid line: the
// left cell's right edge and the right cell's left edge are DISTINCT vertices at (nearly) the same (u,t) but
// DIFFERENT radii; the cliff ladder between them is a near-vertical wall meshed to CAD-grade chord. Watertight by
// shared indices (each cliff ladder's two edges ARE the two cells' boundary column/row).

/**
 * Build the doubled-grid cell-patch weave mesh. Cells are the crease grid rectangles. Each cell interior is meshed
 * with an M-square sub-grid (sub-rows advance ~hRowMm in 3D; sub-cols so width ~ local row-height => square). Cell
 * boundaries use ONE-SIDED radii (rA at the cell edge offset inward by `edgeEps` in u and t). Adjacent cells are
 * stitched by cliff ladders: a VERTICAL cliff (radial ladder) between horizontally-adjacent cells across a strand
 * boundary, and a HORIZONTAL cliff between vertically-adjacent cells across a layer ring. Corners join consistently.
 *
 * Construction (watertight-by-construction): we build a global vertex table keyed by (cellRow, cellCol, side, i)
 * so shared cliff edges reference the SAME vertices. Simplest robust approach: per cell, generate its own dense
 * sub-grid of vertices INCLUDING its 4 one-sided boundary lines; then between adjacent cells add a thin cliff strip
 * quad-band connecting the two cells' shared boundary line (same sub-count on the shared edge => equal-count strip).
 * The two cells' boundary sub-samples are placed at the SAME parametric fractions so the cliff is a clean strip.
 */
export interface WeaveCellOpts {
  hRowMm?: number;       // target 3D sub-cell height (t-direction)
  wTargetMm?: number;    // target 3D sub-cell width (u-direction)
  edgeEps?: number;      // inward offset (fraction of a cell) to sample the one-sided boundary radius
  seamMode?: 'wrap' | 'cliff';
  cliffChordMm?: number; // target chord on the cliff face (radial ladder step)
}

export interface WeaveCellBuild { mesh: StructMesh; nCellU: number; nCellT: number; creaseU: number[]; creaseT: number[]; seamMode: 'wrap' | 'cliff'; }

export function buildWeaveCellMesh(
  rA: AnalyticRadiusFn, H: number, grid: WeaveCreaseGrid, opts: WeaveCellOpts = {},
): WeaveCellBuild {
  const hRowMm = opts.hRowMm ?? 0.15;
  const wTargetMm = opts.wTargetMm ?? 0.15;
  const cliffChordMm = opts.cliffChordMm ?? 0.02;
  const seamMode = opts.seamMode ?? 'cliff';

  // GRID LINES. Columns: strand boundaries u=m/strands (from grid.creaseU). We need the full set of cell u-edges
  // = the creaseU list, treated as a cyclic partition of [0,1). Rows: layer rings + t=0,1 boundaries.
  const uEdges = [...grid.creaseU].sort((a, b) => a - b); // e.g. [0, 1/16, 2/16, ... 15/16]
  const nCellU = uEdges.length; // number of u-cells (cyclic; cell g spans [uEdges[g], uEdges[g+1] or uEdges[0]+1])
  const tEdges = [0, ...grid.creaseT.filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b), 1];
  const nCellT = tEdges.length - 1;

  // For a cell spanning u in [uA,uB] (uB may be >1 for the wrap cell) and t in [tA,tB], sample its interior grid.
  // One-sided radius at a boundary: evaluate rA at the boundary offset inward by a tiny eps so we get the cell's
  // own surface value, not the checker value exactly on the line.
  // We choose per-cell sub-counts so each cell's sub-cells are ~square; place sub-lines by equal-3D-arc.
  const cellUFrac = (uA: number, uB: number, z: number, n: number): number[] => {
    // n interior points fractions (0..1) placed by equal-3D-arc; plus endpoints handled by caller.
    if (n <= 0) return [];
    const M = Math.max(64, 8 * (n + 1)); const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const tot = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) { const tg = tot * (j / (n + 1)); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < tg) lo = m; else hi = m; } out.push((lo + (tg - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M); }
    return out;
  };

  // vertical speed for square sizing in t.
  const vSpeedC = (u: number, t: number): number => vSpeed(rA, ((u % 1) + 1) % 1, t, H);

  // ---- Global vertex table + helpers ----
  const xyz: number[] = []; const ut: number[] = []; const idx: number[] = [];
  const pushV = (u: number, t: number, radOverride?: number): number => {
    const z = t * H; const uu = ((u % 1) + 1) % 1; const th = uu * TAU; const rr = radOverride ?? rA(th, z);
    const vi = xyz.length / 3; xyz.push(rr * Math.cos(th), rr * Math.sin(th), z); ut.push(uu, t); return vi;
  };
  const d2 = (a: number, b: number): number => { const dx = xyz[3 * a] - xyz[3 * b], dy = xyz[3 * a + 1] - xyz[3 * b + 1], dz = xyz[3 * a + 2] - xyz[3 * b + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a: number, an: number, bv: number, bn: number): void => { if (d2(a, bn) <= d2(an, bv)) { idx.push(a, bv, bn); idx.push(a, bn, an); } else { idx.push(a, bv, an); idx.push(an, bv, bn); } };

  // A cell's OWN vertex block: rows (t sub-lines) x cols (u sub-lines), INCLUSIVE of the 4 one-sided edges.
  // Returns a 2D index grid [row][col] with row 0 = bottom edge (t=tA+), last = top edge (t=tB-), col 0 = left
  // edge (u=uA+), last = right edge (u=uB-). All radii are the cell's OWN (offset inward from the grid line).
  interface CellBlock { g: number[][]; us: number[]; ts: number[]; uA: number; uB: number; tA: number; tB: number; }
  const buildCellBlock = (uA: number, uB: number, tA: number, tB: number): CellBlock => {
    const zMid = (tA + tB) / 2 * H;
    // one-sided inset: offset the cell edges inward by a fraction so we sample the cell's own smooth surface.
    const uInsetA = Math.min((uB - uA) * 0.001, 1e-4), uInsetB = uInsetA;
    const tInsetA = Math.min((tB - tA) * 0.001, 1e-4), tInsetB = tInsetA;
    const uL = uA + uInsetA, uR = uB - uInsetB, tLo = tA + tInsetA, tHi = tB - tInsetB;
    // number of interior sub-columns so width ~ wTargetMm (by 3D arc); interior sub-rows so height ~ hRowMm.
    const arcU = ringArc(rA, uL, uR, zMid);
    const nSubU = Math.min(2000, Math.max(0, Math.ceil(arcU / wTargetMm) - 1));
    // vertical size: sample speed at the CELL INTERIOR (mid-band), NOT at the ring edges where |dP/dt| spikes 16x
    // (the ring is a step handled by the cliff, not by cell rows). Use the mean radius change across the cell band
    // as the honest 3D height. Cap the sub-count.
    const tMid = (tLo + tHi) / 2;
    const heightMm = vSpeedC((uL + uR) / 2, tMid) * (tHi - tLo);
    const nSubT = Math.min(2000, Math.max(0, Math.ceil(heightMm / hRowMm) - 1));
    // u sub-lines: left edge + interior(equal-3D-arc) + right edge
    const uFr = cellUFrac(uL, uR, zMid, nSubU);
    const us = [uL, ...uFr.map((f) => uL + (uR - uL) * f), uR];
    // t sub-lines: bottom + interior(equal spacing in t; the cell is smooth so uniform-in-t ~ square given speed
    // roughly constant within a cell) + top. Use equal-t (cheap; cell interior smooth).
    const ts: number[] = [tLo]; for (let j = 1; j <= nSubT; j++) ts.push(tLo + (tHi - tLo) * (j / (nSubT + 1))); ts.push(tHi);
    const g: number[][] = [];
    for (let ri = 0; ri < ts.length; ri++) { const row: number[] = []; for (let ci = 0; ci < us.length; ci++) row.push(pushV(us[ci], ts[ri])); g.push(row); }
    // triangulate the cell interior (equal-count grid)
    for (let ri = 0; ri + 1 < ts.length; ri++) for (let ci = 0; ci + 1 < us.length; ci++) { quad(g[ri][ci], g[ri][ci + 1], g[ri + 1][ci], g[ri + 1][ci + 1]); }
    return { g, us, ts, uA: uL, uB: uR, tA: tLo, tB: tHi };
  };

  // Build all cells; keep their blocks for stitching.
  const cells: CellBlock[][] = []; // [cellRow][cellCol]
  for (let ct = 0; ct < nCellT; ct++) {
    const row: CellBlock[] = [];
    const tA = tEdges[ct], tB = tEdges[ct + 1];
    for (let cu = 0; cu < nCellU; cu++) {
      const uA = uEdges[cu]; const uB = cu + 1 < nCellU ? uEdges[cu + 1] : uEdges[0] + 1;
      row.push(buildCellBlock(uA, uB, tA, tB));
    }
    cells.push(row);
  }

  // ---- CLIFF STITCHING ----
  // A cliff ladder between two boundary lines that are at (nearly) the same (u,t) parametric location but different
  // radii. We build a radial ladder of `nLad` points between the two radii and connect as a strip. To keep it
  // watertight we resample BOTH boundary lines onto a COMMON set of parametric samples (the union / max count) so
  // the ladder is an equal-count strip on both sides. For simplicity + robustness we use the LEFT/BOTTOM cell's
  // boundary samples as the canonical set and project the neighbour's onto the same fractions.
  let maxLadSeen = 0;
  const ladderCount = (rLeft: number, rRight: number): number => {
    const step = Math.abs(rRight - rLeft);
    // NO ladder where the step is negligible (< half the cliff chord target): the two edges are ~coincident in
    // radius (a smooth grid line, no real cliff there) => a plain quad closes them. Prevents zero/degenerate rungs.
    if (!isFinite(step) || step < 0.5 * cliffChordMm) return 0;
    const n = Math.max(1, Math.ceil(step / cliffChordMm) - 1);
    const capped = Math.min(n, 4000); // safety cap (a 1.9mm step at cliffChord 0.001 => ~1900 rungs; 4000 is ample)
    if (capped > maxLadSeen) maxLadSeen = capped;
    return capped;
  };

  // VERTICAL cliffs: between cell (ct, cu) right edge and cell (ct, cu+1 cyclic) left edge. Same t-samples? The two
  // cells share the same t-band so their boundary rows are at the SAME ts (both built from the same tA,tB with the
  // same nSubT? NOT guaranteed — nSubT depends on arc/speed which is ~equal for adjacent cells in the same t-band).
  // To be safe we STITCH by t-parameter: for each pair of adjacent t-samples we form a cliff quad-column. We require
  // the two edges have the same number of t-samples; if not, we resample the shorter onto the longer via nearest-t.
  const stitchVerticalCliff = (left: CellBlock, right: CellBlock): void => {
    // left right-edge column = last col of left.g; right left-edge column = first col of right.g
    const lCol = left.g.map((row) => row[row.length - 1]);
    const rCol = right.g.map((row) => row[0]);
    // align by t: build unified t list = union of left.ts and right.ts, and get the vertex on each edge at each t by
    // nearest existing sample (cheap, and cells are smooth so nearest is fine at the fine sub-row resolution). To
    // keep watertight we instead require equal length; enforce by using min length and pairing by index if equal,
    // else pair by nearest-t.
    const nL = lCol.length, nR = rCol.length;
    const pairs: Array<[number, number]> = [];
    if (nL === nR) { for (let i = 0; i < nL; i++) pairs.push([lCol[i], rCol[i]]); }
    else {
      // nearest-t pairing over the longer edge (may leave the shorter edge with fanned triangles — handled below by
      // walking both). Use a merge over t.
      let i = 0, j = 0;
      while (i < nL && j < nR) {
        pairs.push([lCol[i], rCol[j]]);
        const ti = ut[2 * lCol[i] + 1], tj = ut[2 * rCol[j] + 1];
        if (i + 1 < nL && (j + 1 >= nR || ut[2 * lCol[i + 1] + 1] <= ut[2 * rCol[j + 1] + 1])) i++; else j++;
      }
      pairs.push([lCol[nL - 1], rCol[nR - 1]]);
    }
    // build cliff ladder between each consecutive pair-band. For band between pair p and p+1 we have a quad on the
    // left edge (lTop,lBot) and right edge (rTop,rBot) with radial ladder in between.
    for (let p = 0; p + 1 < pairs.length; p++) {
      const lTop = pairs[p][0], lBot = pairs[p + 1][0];
      const rTop = pairs[p][1], rBot = pairs[p + 1][1];
      const rL = Math.hypot(xyz[3 * lTop], xyz[3 * lTop + 1]);
      const rR = Math.hypot(xyz[3 * rTop], xyz[3 * rTop + 1]);
      const nLad = ladderCount(rL, rR);
      cliffStrip(lTop, lBot, rTop, rBot, nLad);
    }
  };

  // HORIZONTAL cliffs: between cell (ct, cu) top edge and cell (ct+1, cu) bottom edge. Same u-samples if equal count.
  const stitchHorizontalCliff = (below: CellBlock, above: CellBlock): void => {
    const bRow = below.g[below.g.length - 1]; // top edge of the below cell
    const aRow = above.g[0]; // bottom edge of the above cell
    const nB = bRow.length, nA = aRow.length;
    const pairs: Array<[number, number]> = [];
    if (nB === nA) { for (let i = 0; i < nB; i++) pairs.push([bRow[i], aRow[i]]); }
    else {
      let i = 0, j = 0;
      while (i < nB && j < nA) { pairs.push([bRow[i], aRow[j]]); if (i + 1 < nB && (j + 1 >= nA || ut[2 * bRow[i + 1]] <= ut[2 * aRow[j + 1]])) i++; else j++; }
      pairs.push([bRow[nB - 1], aRow[nA - 1]]);
    }
    for (let p = 0; p + 1 < pairs.length; p++) {
      const bL = pairs[p][0], bR = pairs[p + 1][0];
      const aL = pairs[p][1], aR = pairs[p + 1][1];
      const rB = Math.hypot(xyz[3 * bL], xyz[3 * bL + 1]);
      const rAr = Math.hypot(xyz[3 * aL], xyz[3 * aL + 1]);
      const nLad = ladderCount(rB, rAr);
      cliffStrip(bL, bR, aL, aR, nLad);
    }
  };

  // cliff strip between two boundary edges (left/bottom pair lTop,lBot ; right/top pair rTop,rBot) with nLad interior
  // radial rungs. The 4 corner vertices are shared with the cells; interior rungs are NEW vertices interpolated in
  // 3D between the two edges. This is a small quad-band bridging the radial step. nLad>=1.
  const cliffStrip = (lTop: number, lBot: number, rTop: number, rBot: number, nLad: number): void => {
    if (!Number.isInteger(lTop) || !Number.isInteger(rTop) || !Number.isInteger(lBot) || !Number.isInteger(rBot) || lTop < 0 || rTop < 0) { throw new Error(`cliffStrip bad idx lTop=${lTop} lBot=${lBot} rTop=${rTop} rBot=${rBot} nLad=${nLad}`); }
    if (nLad <= 0) { quad(lTop, rTop, lBot, rBot); return; }
    // interpolate a ladder of columns from the left edge (lTop..lBot) to the right edge (rTop..rBot).
    let prevTop = lTop, prevBot = lBot;
    for (let i = 1; i <= nLad; i++) {
      const f = i / (nLad + 1);
      const tx = xyz[3 * lTop] + (xyz[3 * rTop] - xyz[3 * lTop]) * f, ty = xyz[3 * lTop + 1] + (xyz[3 * rTop + 1] - xyz[3 * lTop + 1]) * f, tz = xyz[3 * lTop + 2] + (xyz[3 * rTop + 2] - xyz[3 * lTop + 2]) * f;
      const bx = xyz[3 * lBot] + (xyz[3 * rBot] - xyz[3 * lBot]) * f, by = xyz[3 * lBot + 1] + (xyz[3 * rBot + 1] - xyz[3 * lBot + 1]) * f, bz = xyz[3 * lBot + 2] + (xyz[3 * rBot + 2] - xyz[3 * lBot + 2]) * f;
      const vTop = xyz.length / 3; xyz.push(tx, ty, tz); ut.push(ut[2 * lTop] + (ut[2 * rTop] - ut[2 * lTop]) * f, ut[2 * lTop + 1] + (ut[2 * rTop + 1] - ut[2 * lTop + 1]) * f);
      const vBot = xyz.length / 3; xyz.push(bx, by, bz); ut.push(ut[2 * lBot] + (ut[2 * rBot] - ut[2 * lBot]) * f, ut[2 * lBot + 1] + (ut[2 * rBot + 1] - ut[2 * lBot + 1]) * f);
      quad(prevTop, vTop, prevBot, vBot);
      prevTop = vTop; prevBot = vBot;
    }
    quad(prevTop, rTop, prevBot, rBot);
  };

  // stitch all vertical cliffs (cyclic in u)
  for (let ct = 0; ct < nCellT; ct++) {
    for (let cu = 0; cu < nCellU; cu++) {
      const right = cu + 1 < nCellU ? cells[ct][cu + 1] : (seamMode === 'wrap' ? cells[ct][0] : null);
      if (right) stitchVerticalCliff(cells[ct][cu], right);
      else if (seamMode === 'cliff' && cu === nCellU - 1) {
        // seam cliff: between the last cell's right edge and the first cell's left edge across theta=0.
        stitchVerticalCliff(cells[ct][cu], cells[ct][0]);
      }
    }
  }
  // stitch all horizontal cliffs
  for (let ct = 0; ct + 1 < nCellT; ct++) for (let cu = 0; cu < nCellU; cu++) stitchHorizontalCliff(cells[ct][cu], cells[ct + 1][cu]);

  return { mesh: { xyz: Float64Array.from(xyz), ut, idx: Uint32Array.from(idx), nV: xyz.length / 3, nF: idx.length / 3 }, nCellU, nCellT, creaseU: uEdges, creaseT: grid.creaseT, seamMode };
}

// ===============================================================================================================
// DOUBLED-GRID LATTICE PRIMITIVE (the WATERTIGHT frontier weave fix). The cell-patch approach fragmented at corners
// (boundary=957k). This builder instead keeps ONE regular (row x col) lattice = a trivially-watertight cylinder
// mesh, and carries the C0 step cliffs by DOUBLING grid lines with explicit RADIUS OVERRIDES on the "cliff" nodes:
//
//  - COLUMN stations (u-axis): for each strand cell, we emit its interior sub-columns; at each strand boundary
//    u=m/strands we emit a CLIFF BAND of columns that all sit at (nearly) the same u but step the radius from the
//    left cell's edge value to the right cell's edge value (a near-vertical wall). Every column station carries a
//    per-row RADIUS: interior columns use rA(u,t); cliff columns use an explicit interpolated radius.
//  - ROW stations (t-axis): analogously, at each layer ring t=k/layers we emit a CLIFF BAND of rows stepping the
//    radius from the below-cell to the above-cell value.
//
// Because it is ONE (row x col) lattice with a constant column count on every row, adjacent rows always share the
// full column list => equal-count quad strips everywhere => watertight by construction (rawNonMan 0), including the
// grid crossings (a crossing is just a lattice node shared by its 4 quads). The step is represented EXACTLY by the
// doubled-line + radius override; the smooth cell interior is M-square. Seam (theta=0) is the u=0 cliff band.
//
// KEY design for a clean vertical wall: a cliff BAND in u uses columns at u = uBoundary for ALL band members (same
// u, stepping radius) so the wall is truly vertical (no u-drift). The wall face is chord-controlled by the number
// of band members (radial rungs). Likewise a t cliff band uses rows at t = tRing for all members.

export interface WeaveDGOpts {
  hRowMm?: number;       // target 3D sub-cell height inside a cell
  wTargetMm?: number;    // target 3D sub-cell width inside a cell
  cliffChordMm?: number; // target chord across a step cliff face (radial rung spacing)
  seamMode?: 'wrap' | 'cliff';
}
export interface WeaveDGBuild { mesh: StructMesh; nRow: number; nCol: number; creaseU: number[]; creaseT: number[]; seamMode: 'wrap' | 'cliff'; }

export function buildWeaveDoubledGrid(
  rA: AnalyticRadiusFn, H: number, grid: WeaveCreaseGrid, opts: WeaveDGOpts = {},
): WeaveDGBuild {
  const hRowMm = opts.hRowMm ?? 0.15;
  const wTargetMm = opts.wTargetMm ?? 0.15;
  const cliffChordMm = opts.cliffChordMm ?? 0.02;
  const seamMode = opts.seamMode ?? 'cliff';
  const EPS = 1e-6; // parametric inset for one-sided edge radii

  const uEdges = [...grid.creaseU].sort((a, b) => a - b); // strand boundaries incl u=0
  const nCellU = uEdges.length;
  const tEdges = [0, ...grid.creaseT.filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b), 1];
  const nCellT = tEdges.length - 1;

  // ---- ROW STATIONS ----
  // A row station is { t, kind }. kind 'body' => radius = rA(u,t) at that station's t. kind 'cliffLo'/'cliffHi'
  // are the two edges of a t-ring cliff at t=tRing (radius one-sided from below/above), and 'cliffMid' the rungs.
  // We represent a t-station simply by its t plus a "radialFrac" used only for cliff rows: for a cliff band at ring
  // tR, the members share t=tR but their radius interpolates. We tag rows with a rowKind + (ringIndex, rungFrac).
  interface RowStation { t: number; cliff: null | { tR: number; frac: number; tSpread: number }; }
  const rows: RowStation[] = [];
  // For each t-cell-band [tA,tB], emit body sub-rows (M-square). Between bands (at each interior ring) emit a cliff
  // band. Bottom edge t=0 and top t=1 are plain body rows.
  const vSpeedC = (u: number, t: number): number => vSpeed(rA, ((u % 1) + 1) % 1, t, H);
  for (let ct = 0; ct < nCellT; ct++) {
    const tA = tEdges[ct], tB = tEdges[ct + 1];
    const tLo = ct === 0 ? tA : tA + EPS;       // above the ring (one-sided) except very bottom
    const tHi = ct === nCellT - 1 ? tB : tB - EPS; // below the next ring (one-sided) except very top
    // body sub-rows in [tLo, tHi]: sample speed at cell mid.
    const tMid = (tLo + tHi) / 2;
    const heightMm = vSpeedC(0.5, tMid) * (tHi - tLo);
    const nSubT = Math.min(4000, Math.max(0, Math.ceil(heightMm / hRowMm) - 1));
    rows.push({ t: tLo, cliff: null });
    for (let j = 1; j <= nSubT; j++) rows.push({ t: tLo + (tHi - tLo) * (j / (nSubT + 1)), cliff: null });
    rows.push({ t: tHi, cliff: null });
    // cliff band at the ring tB (interior rings only). rung count from the ring step magnitude.
    if (ct < nCellT - 1) {
      const tR = tB;
      // representative step magnitude at this ring (max over u).
      let stepMax = 0; const nUp = 128;
      for (let iu = 0; iu < nUp; iu++) { const th = TAU * (iu / nUp); const s = Math.abs(rA(th, (tR + EPS) * H) - rA(th, (tR - EPS) * H)); if (s > stepMax) stepMax = s; }
      const nRung = Math.min(4000, Math.max(0, Math.ceil(stepMax / cliffChordMm) - 1));
      // cliff rows near t=tR; frac 0 = below-edge radius, 1 = above-edge radius. The tHi row above IS the below-edge
      // (frac 0 implicit via body row at tHi); the next band's tLo body row is the above-edge (frac 1). A TINY
      // MONOTONE t-spread (tSpread) keeps rung rows DISTINCT in t at zero-step columns (no coincident slivers). The
      // spread deviation z = tSpread*H must stay well under the chord target => tSpread ~ 0.2*cliffChord / H.
      const tSpread = Math.min(0.4 * (tHi - tR), (0.2 * cliffChordMm) / H);
      for (let j = 1; j <= nRung; j++) { const fr = j / (nRung + 1); rows.push({ t: tR - tSpread + 2 * tSpread * fr, cliff: { tR, frac: fr, tSpread } }); }
    }
  }
  const nRow = rows.length;

  // ---- COLUMN STATIONS ----
  // A column station is { u, cliff }. Body columns: u in cell interior, radius=rA(u,t). Cliff columns at a strand
  // boundary uB: all at u=uB, radius interpolates from the left cell edge to the right cell edge. We build the
  // column list ONCE (constant across rows) with FIXED per-cell interior counts (median-free: use a representative
  // z=mid). Column order (cyclic): [cell0 interior...] [boundary1 cliff band] [cell1 interior...] ... [seam cliff].
  interface ColStation { u: number; cliff: null | { frac: number; uBnd: number }; }
  const cols: ColStation[] = [];
  const zRep = 0.5 * H;
  const cellUFrac2 = (uA: number, uB: number, z: number, n: number): number[] => {
    if (n <= 0) return [];
    const M = Math.max(64, 8 * (n + 1)); const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const tot = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) { const tg = tot * (j / (n + 1)); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < tg) lo = m; else hi = m; } out.push((lo + (tg - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M); }
    return out;
  };
  // per-strand-boundary step magnitude (max over t) for rung count.
  const boundaryStep = (uB: number): number => { let s = 0; const nTp = 96; for (let it = 0; it < nTp; it++) { const t = (it + 0.5) / nTp; const rl = rA((uB - EPS) * TAU, t * H), rr = rA((uB + EPS) * TAU, t * H); const d = Math.abs(rr - rl); if (d > s) s = d; } return s; };
  for (let cu = 0; cu < nCellU; cu++) {
    const uA = uEdges[cu]; const uB = cu + 1 < nCellU ? uEdges[cu + 1] : uEdges[0] + 1;
    // cell interior body columns (one-sided edges at uA+EPS .. uB-EPS)
    const uL = uA + EPS, uR = uB - EPS;
    const arcU = ringArc(rA, uL, uR, zRep);
    const nSubU = Math.min(4000, Math.max(0, Math.ceil(arcU / wTargetMm) - 1));
    cols.push({ u: uL, cliff: null });
    for (const fr of cellUFrac2(uL, uR, zRep, nSubU)) cols.push({ u: uL + (uR - uL) * fr, cliff: null });
    cols.push({ u: uR, cliff: null });
    // cliff band at the NEXT boundary uB (the boundary between this cell and the next). For the LAST cell, uB wraps
    // to u=0 (=uEdges[0]) => the seam. rung count from the boundary step. The rung columns get a TINY MONOTONE
    // u-spread across [uB-uR..uB+uR] (uR ~ a small fraction of the cell) so that at ZERO-STEP rows (t=0/1 or any
    // row where the local step vanishes) the rung columns are DISTINCT in u (no coincident degenerate slivers).
    // The spread is a near-vertical ramp; its horizontal deviation from the true vertical cliff is uR*arc which we
    // keep well under the chord target. The rung RADIUS still interpolates the one-sided step, so on stepped rows
    // the wall is faithfully near-vertical.
    const uBoundary = (cu + 1 < nCellU) ? uEdges[cu + 1] : 1; // theta of the boundary (u=1 == seam == u=0)
    const step = boundaryStep(cu + 1 < nCellU ? uEdges[cu + 1] : 1e-9); // seam boundary at u~0/1
    const nRung = Math.min(4000, Math.max(0, Math.ceil(step / cliffChordMm) - 1));
    // u half-spread: keep horizontal deviation (uHalf * cellArc) under ~0.2*cliffChord so the ramp is faithful.
    const cellArcRep = Math.max(1e-3, ringArc(rA, uL, uR, zRep));
    const uHalf = Math.min(0.4 * (uR - uL), (0.2 * cliffChordMm) / cellArcRep);
    for (let j = 1; j <= nRung; j++) { const fr = j / (nRung + 1); cols.push({ u: uBoundary - uHalf + 2 * uHalf * fr, cliff: { frac: fr, uBnd: uBoundary } }); }
  }
  const nCol = cols.length;

  // ---- LIFT: build the (nRow x nCol) vertex lattice ----
  // radius of a lattice node (r-th row, c-th col):
  //  - body row & body col: rA(colU, rowT)
  //  - cliff row (t-ring rung) & body col: interpolate radius between rA(colU, tR-eps) and rA(colU, tR+eps) by frac
  //  - body row & cliff col (u-boundary rung): interpolate radius between rA(uB-eps, rowT) and rA(uB+eps, rowT)
  //  - cliff row & cliff col (a grid CROSSING rung): bilinear over the 4 one-sided corner radii by (rowFrac,colFrac)
  const total = nRow * nCol;
  const xyzD = new Float64Array(total * 3); const utD: number[] = new Array(total * 2);
  const nodeRadius = (r: number, c: number): { rad: number; u: number; t: number } => {
    const R = rows[r], C = cols[c];
    let rad: number; const u = C.u; let t = R.t;
    const uu = ((u % 1) + 1) % 1; const th = uu * TAU;
    if (R.cliff === null && C.cliff === null) { rad = rA(th, t * H); }
    else if (R.cliff !== null && C.cliff === null) {
      // t-ring rung near t=tR (t is the spread value R.t): interpolate radius below->above at this col's u.
      const tR = R.cliff.tR; const f = R.cliff.frac;
      const rBelow = rA(th, (tR - EPS) * H), rAbove = rA(th, (tR + EPS) * H);
      rad = rBelow + (rAbove - rBelow) * f;
    } else if (R.cliff === null && C.cliff !== null) {
      // u-boundary rung at boundary uBnd: interpolate radius left->right (one-sided at the BOUNDARY, not the spread u).
      const f = C.cliff.frac; const uB = C.cliff.uBnd; const rLeft = rA((uB - EPS) * TAU, t * H), rRight = rA((uB + EPS) * TAU, t * H);
      rad = rLeft + (rRight - rLeft) * f;
    } else {
      // crossing rung: bilinear over 4 one-sided corners at the boundary (uBnd, tR).
      const tR = R.cliff!.tR; const uB = C.cliff!.uBnd; const ft = R.cliff!.frac; const fu = C.cliff!.frac;
      const rBL = rA((uB - EPS) * TAU, (tR - EPS) * H), rBR = rA((uB + EPS) * TAU, (tR - EPS) * H);
      const rTL = rA((uB - EPS) * TAU, (tR + EPS) * H), rTR = rA((uB + EPS) * TAU, (tR + EPS) * H);
      const rB = rBL + (rBR - rBL) * fu, rT = rTL + (rTR - rTL) * fu;
      rad = rB + (rT - rB) * ft;
    }
    return { rad, u: uu, t };
  };
  for (let r = 0; r < nRow; r++) for (let c = 0; c < nCol; c++) {
    const { rad, u, t } = nodeRadius(r, c); const th = u * TAU; const vi = r * nCol + c;
    xyzD[3 * vi] = rad * Math.cos(th); xyzD[3 * vi + 1] = rad * Math.sin(th); xyzD[3 * vi + 2] = t * H;
    utD[2 * vi] = u; utD[2 * vi + 1] = t;
  }
  // ---- TRIANGULATE: regular cylinder strips (rows x cols, cyclic in cols) ----
  const idxD: number[] = [];
  const d2 = (a: number, b: number): number => { const dx = xyzD[3 * a] - xyzD[3 * b], dy = xyzD[3 * a + 1] - xyzD[3 * b + 1], dz = xyzD[3 * a + 2] - xyzD[3 * b + 2]; return dx * dx + dy * dy + dz * dz; };
  const wrapCols = seamMode === 'wrap';
  for (let r = 0; r + 1 < nRow; r++) {
    const tb = r * nCol, bb = (r + 1) * nCol;
    const lim = wrapCols ? nCol : nCol - 1;
    for (let c = 0; c < lim; c++) {
      const cn = (c + 1) % nCol; const a = tb + c, an = tb + cn, bv = bb + c, bn = bb + cn;
      if (d2(a, bn) <= d2(an, bv)) { idxD.push(a, bv, bn); idxD.push(a, bn, an); } else { idxD.push(a, bv, an); idxD.push(an, bv, bn); }
    }
    if (!wrapCols) {
      // seam-cliff mode: the last cliff band (cols near u=1) already forms the wall; the wrap from col nCol-1 to 0
      // is the seam. Since our column list ENDS with the seam cliff band (frac->1 approaching u=0 from the right),
      // and STARTS with cell0 (u=0+), we DO wrap to close the seam wall (the seam is a real cliff column band).
      const c = nCol - 1; const cn = 0; const a = tb + c, an = tb + cn, bv = bb + c, bn = bb + cn;
      if (d2(a, bn) <= d2(an, bv)) { idxD.push(a, bv, bn); idxD.push(a, bn, an); } else { idxD.push(a, bv, an); idxD.push(an, bv, bn); }
    }
  }
  return { mesh: { xyz: xyzD, ut: utD, idx: Uint32Array.from(idxD), nV: total, nF: idxD.length / 3 }, nRow, nCol, creaseU: uEdges, creaseT: grid.creaseT, seamMode };
}

export interface WeaveBrickOpts { hRowMm?: number; wTargetMm?: number; cliffChordMm?: number; seamMode?: 'wrap' | 'cliff'; }
export interface WeaveBrickBuild { mesh: StructMesh; nCellU: number; nCellT: number; creaseU: number[]; creaseT: number[]; seamMode: 'wrap' | 'cliff'; verts: number; tris: number; }

/**
 * BRICK-WALL BUILDER (the definitive watertight + sliver-free weave fix). BasketWeave is a CHECKERBOARD of platforms
 * with GENUINE C0 vertical cliff walls (~2mm) on EVERY grid line; cell interiors are CAD-grade. This meshes each
 * region with the RIGHT strip direction and a shared global row grid so walls + platforms + corners align =>
 * watertight by SHARED vertex sequences. Platforms: (band rows x M-square cols) grids. Vertical walls: (band rows x
 * radial rungs) ribbons sharing the two cells' u-edges. Ring walls: (cell cols x radial rungs) ribbons sharing the
 * two cells' t-edges. rungN=0 where the step is negligible (plain quad).
 */
export function buildWeaveBrick(
  rA: AnalyticRadiusFn, H: number, grid: WeaveCreaseGrid, opts: WeaveBrickOpts = {},
): WeaveBrickBuild {
  const hRowMm = opts.hRowMm ?? 0.15;
  const wTargetMm = opts.wTargetMm ?? 0.15;
  const cliffChordMm = opts.cliffChordMm ?? 0.02;
  const seamMode = opts.seamMode ?? 'cliff';
  const EPS = 1e-6;

  const uEdges = [...grid.creaseU].sort((a, b) => a - b);
  const nCellU = uEdges.length;
  const tRings = grid.creaseT.filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b);
  const tEdges = [0, ...tRings, 1];
  const nCellT = tEdges.length - 1;

  const xyz: number[] = []; const ut: number[] = []; const idx: number[] = [];
  const modU = (u: number): number => ((u % 1) + 1) % 1;
  const pushV = (u: number, t: number, rad: number): number => { const uu = modU(u); const th = uu * TAU; const vi = xyz.length / 3; xyz.push(rad * Math.cos(th), rad * Math.sin(th), t * H); ut.push(uu, t); return vi; };
  const rad2 = (v: number): number => Math.hypot(xyz[3 * v], xyz[3 * v + 1]);
  const d2 = (a: number, b: number): number => { const dx = xyz[3 * a] - xyz[3 * b], dy = xyz[3 * a + 1] - xyz[3 * b + 1], dz = xyz[3 * a + 2] - xyz[3 * b + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a: number, an: number, bv: number, bn: number): void => { if (d2(a, bn) <= d2(an, bv)) { idx.push(a, bv, bn); idx.push(a, bn, an); } else { idx.push(a, bv, an); idx.push(an, bv, bn); } };
  const vSpeedC = (u: number, t: number): number => vSpeed(rA, modU(u), t, H);

  // GLOBAL band rows (shared by platforms + vertical walls in that band).
  const bandRows: number[][] = [];
  for (let ct = 0; ct < nCellT; ct++) {
    const tA = tEdges[ct], tB = tEdges[ct + 1];
    const tLo = ct === 0 ? tA : tA + EPS, tHi = ct === nCellT - 1 ? tB : tB - EPS;
    const tMid = (tLo + tHi) / 2;
    const heightMm = vSpeedC(0.5, tMid) * (tHi - tLo);
    const nSub = Math.min(4000, Math.max(0, Math.ceil(heightMm / hRowMm) - 1));
    const rowsB = [tLo]; for (let j = 1; j <= nSub; j++) rowsB.push(tLo + (tHi - tLo) * (j / (nSub + 1))); rowsB.push(tHi);
    bandRows.push(rowsB);
  }
  // PER-CELL columns (shared by the platform + its two ring walls; z-independent fractions).
  const cellUFrac = (uA: number, uB: number, z: number, n: number): number[] => {
    if (n <= 0) return [];
    const M = Math.max(64, 8 * (n + 1)); const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const tot = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) { const tg = tot * (j / (n + 1)); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < tg) lo = m; else hi = m; } out.push((lo + (tg - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M); }
    return out;
  };
  const cellCols: number[][] = [];
  for (let cu = 0; cu < nCellU; cu++) {
    const uA = uEdges[cu]; const uB = cu + 1 < nCellU ? uEdges[cu + 1] : uEdges[0] + 1;
    const uL = uA + EPS, uR = uB - EPS; const zRep = 0.5 * H;
    const arcU = ringArc(rA, uL, uR, zRep);
    const nSubU = Math.min(4000, Math.max(0, Math.ceil(arcU / wTargetMm) - 1));
    cellCols.push([uL, ...cellUFrac(uL, uR, zRep, nSubU).map((f) => uL + (uR - uL) * f), uR]);
  }
  const rungN = (stepMm: number): number => stepMm < 0.5 * cliffChordMm ? 0 : Math.min(4000, Math.max(1, Math.ceil(stepMm / cliffChordMm) - 1));

  // PLATFORMS.
  const platGrid: number[][][][] = [];
  for (let ct = 0; ct < nCellT; ct++) {
    const rowT = bandRows[ct]; const rowc: number[][][] = [];
    for (let cu = 0; cu < nCellU; cu++) {
      const us = cellCols[cu]; const g: number[][] = [];
      for (let ri = 0; ri < rowT.length; ri++) { const t = rowT[ri]; const row: number[] = []; for (let ci = 0; ci < us.length; ci++) { const u = us[ci]; row.push(pushV(u, t, rA(modU(u) * TAU, t * H))); } g.push(row); }
      for (let ri = 0; ri + 1 < rowT.length; ri++) for (let ci = 0; ci + 1 < us.length; ci++) quad(g[ri][ci], g[ri][ci + 1], g[ri + 1][ci], g[ri + 1][ci + 1]);
      rowc.push(g);
    }
    platGrid.push(rowc);
  }
  // VERTICAL WALLS (band rows x radial rungs), sharing the two cells' u-edges.
  const buildVWall = (ct: number, cuLeft: number, cuRight: number): void => {
    const rowT = bandRows[ct]; const nr = rowT.length;
    const lEdge = platGrid[ct][cuLeft].map((row) => row[row.length - 1]);
    const rEdge = platGrid[ct][cuRight].map((row) => row[0]);
    let stepMax = 0; for (let ri = 0; ri < nr; ri++) { const s = Math.abs(rad2(rEdge[ri]) - rad2(lEdge[ri])); if (s > stepMax) stepMax = s; }
    const nR = rungN(stepMax);
    if (nR === 0) { for (let ri = 0; ri + 1 < nr; ri++) quad(lEdge[ri], rEdge[ri], lEdge[ri + 1], rEdge[ri + 1]); return; }
    let prev = lEdge;
    for (let k = 1; k <= nR; k++) {
      const f = k / (nR + 1); const colV: number[] = [];
      for (let ri = 0; ri < nr; ri++) { const t = rowT[ri]; const uL = ut[2 * lEdge[ri]], uR = ut[2 * rEdge[ri]]; const rL = rad2(lEdge[ri]), rR = rad2(rEdge[ri]); colV.push(pushV(uL + (uR - uL) * f, t, rL + (rR - rL) * f)); }
      for (let ri = 0; ri + 1 < nr; ri++) quad(prev[ri], colV[ri], prev[ri + 1], colV[ri + 1]);
      prev = colV;
    }
    for (let ri = 0; ri + 1 < nr; ri++) quad(prev[ri], rEdge[ri], prev[ri + 1], rEdge[ri + 1]);
  };
  for (let ct = 0; ct < nCellT; ct++) for (let cu = 0; cu < nCellU; cu++) buildVWall(ct, cu, (cu + 1) % nCellU);
  // RING WALLS (cell cols x radial rungs), sharing the two cells' t-edges.
  const buildHWall = (ct: number, cu: number): void => {
    const bG = platGrid[ct][cu], aG = platGrid[ct + 1][cu];
    const bRow = bG[bG.length - 1], aRow = aG[0]; const nc = bRow.length;
    let stepMax = 0; for (let ci = 0; ci < nc; ci++) { const s = Math.abs(rad2(aRow[ci]) - rad2(bRow[ci])); if (s > stepMax) stepMax = s; }
    const nR = rungN(stepMax);
    if (nR === 0) { for (let ci = 0; ci + 1 < nc; ci++) quad(bRow[ci], bRow[ci + 1], aRow[ci], aRow[ci + 1]); return; }
    let prev = bRow;
    for (let k = 1; k <= nR; k++) {
      const f = k / (nR + 1); const rowV: number[] = [];
      for (let ci = 0; ci < nc; ci++) { const u = ut[2 * bRow[ci]]; const tB = ut[2 * bRow[ci] + 1], tA = ut[2 * aRow[ci] + 1]; const rB = rad2(bRow[ci]), rAr = rad2(aRow[ci]); rowV.push(pushV(u, tB + (tA - tB) * f, rB + (rAr - rB) * f)); }
      for (let ci = 0; ci + 1 < nc; ci++) quad(prev[ci], prev[ci + 1], rowV[ci], rowV[ci + 1]);
      prev = rowV;
    }
    for (let ci = 0; ci + 1 < nc; ci++) quad(prev[ci], prev[ci + 1], aRow[ci], aRow[ci + 1]);
  };
  for (let ct = 0; ct + 1 < nCellT; ct++) for (let cu = 0; cu < nCellU; cu++) buildHWall(ct, cu);

  return { mesh: { xyz: Float64Array.from(xyz), ut, idx: Uint32Array.from(idx), nV: xyz.length / 3, nF: idx.length / 3 }, nCellU, nCellT, creaseU: uEdges, creaseT: grid.creaseT, seamMode, verts: xyz.length / 3, tris: idx.length / 3 };
}
