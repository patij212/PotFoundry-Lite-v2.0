// _qcolMsquare.ts — DEV-ONLY (research/ only; src/ NEVER imports this). E-2026-07-03-STRUCTCOL2 M-SQUARE
// column sizing = the sliver-kill lever. COPIES rasterizeColumns/buildStructWall from _structColLib (committed,
// read-only) and MODIFIES the cell SIZING to make every cell ~3D-SQUARE under the first-fundamental-form metric
// (project_surface_metric_quality: cells sized by the local metric so 3D triangles are isotropic -> min-angle up,
// %<20 -> ~0). The ridge graph itself (buildRidgeGraph) is UNCHANGED (ridges stay exact columns = zero serration).
//
// THE MECHANISM (from _qcolDiag1/2, MEASURED):
//  - column WIDTH is already ~dthMm (equal-3D-arc sub-columns) — NOT the sliver source.
//  - row HEIGHT-3D = verticalSpeed(u,t)*dt; verticalSpeed varies 3-7x WITHIN one t-row (steep flank vs valley).
//    A GLOBALLY-SHARED row spacing therefore CANNOT square all columns (the structural sliver source).
//  FIX (M-square): (a) place rows by EQUAL-3D-ARC of the MAX-speed column (so the tallest cell in each row is ~h);
//    (b) per gap, set the sub-column count so the cell WIDTH matches the LOCAL 3D row-height at that gap (adapt
//    width to height per-column) => steep-flank cells wide+square, valley cells narrow+square. Both DoF are the
//    first-fundamental-form metric; the strip topology (equal-count within a band) is preserved because sub-count
//    is fixed per (leftFeatKey) as max over the band's rows.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { RidgeGraph } from './_structColLib';
import type { StructMesh, RowColumns } from './_structColLib';

const TAU = 2 * Math.PI;

/** 3D vertical speed |dP/dt| at (u,t) via central difference (mm per unit-t). */
function vSpeed(rA: AnalyticRadiusFn, u: number, t: number, H: number): number {
  const dt = 1e-4; const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt); const dtt = t1 - t0 || 1e-9;
  const p = (tt: number): [number, number, number] => { const th = u * TAU, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const a = p(t0), b = p(t1);
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dtt;
}

/** min & max 3D vertical speed over u at a given t (seam band excluded so the C0 seam cliff, handled separately,
 * does not force absurd global refinement). The BALANCED speed = geometric blend min^(1-b)*max^b drives the row
 * spacing: b=1 => rows-by-max (steep square, flat over-refined+exploded); b=0.5 => geometric mean (steep and flat
 * cells BOTH ~sqrt(max/min):1 aspect — the sweet spot that keeps min-angle above 20 without exploding tri count;
 * MEASURED intra-row max/min ~5-7 => sqrt ~2.3:1 => min-angle ~24). */
function speedRangeAtT(rA: AnalyticRadiusFn, t: number, H: number, nU: number, seamBand: number): { mn: number; mx: number } {
  let mn = Infinity, mx = 0;
  for (let iu = 0; iu < nU; iu++) {
    const u = seamBand + (1 - 2 * seamBand) * (iu / (nU - 1));
    const sp = vSpeed(rA, u, t, H); if (sp < mn) mn = sp; if (sp > mx) mx = sp;
  }
  return { mn, mx };
}

/**
 * M-SQUARE ROW PLACEMENT: choose t-rows so the BALANCED-speed column advances ~hRowMm in 3D per row. With
 * speedBlend b in [0,1] the row spacing dt = hRowMm / (mn^(1-b) * mx^b). b=0.5 (geometric mean) makes the steep
 * flank cells and the flat valley cells BOTH ~sqrt(mx/mn):1 aspect after width-matching => symmetric, min-angle
 * above 20, without the b=1 explosion (rows-by-max over-refines flat columns' height then width-match makes them
 * super-narrow -> ~9000 cols/row, MEASURED). Adds mandatory rows at the 4 births +/- eps and z=0/z=H.
 * hRowCapMm caps dz so flat regions still get enough rows for chord fidelity.
 */
export function msquareRows(
  rA: AnalyticRadiusFn, H: number, hRowMm: number, births: number[],
  opts: { nUprobe?: number; seamBand?: number; hRowCapMm?: number; birthWinT?: number; speedBlend?: number } = {},
): number[] {
  const nU = opts.nUprobe ?? 240; const seamBand = opts.seamBand ?? 0.02;
  const cap = opts.hRowCapMm ?? hRowMm * 6; // never let a flat cell be taller than 6x target (chord guard)
  const birthWinT = opts.birthWinT ?? 8e-4;
  const b = opts.speedBlend ?? 0.5;
  const tset = new Set<number>(); tset.add(0);
  let t = 0; let guard = 0;
  while (t < 1 && guard++ < 2_000_000) {
    const { mn, mx } = speedRangeAtT(rA, t, H, nU, seamBand);
    const sp = Math.max(1e-6, Math.pow(Math.max(1e-6, mn), 1 - b) * Math.pow(Math.max(1e-6, mx), b));
    let dt = hRowMm / sp;
    const dzCap = cap / H; if (dt > dzCap) dt = dzCap;
    const dtMin = 1e-6; if (dt < dtMin) dt = dtMin;
    t = Math.min(1, t + dt); tset.add(+t.toFixed(8));
  }
  tset.add(1);
  for (const tb of births) {
    tset.add(+Math.max(0, tb - birthWinT).toFixed(8));
    tset.add(+Math.min(1, tb + birthWinT).toFixed(8));
  }
  return Array.from(tset).filter((x) => x >= 0 && x <= 1).sort((a, b2) => a - b2);
}

/** graded sub-column fractions in a gap of width gapMm targeting cell width == wTargetMm (M-square: width matched
 * to the local row-height). Uniform interior; small geometric shoulders near each feature so the cusp is captured
 * without a fat first cell. Returns fractions in (0,1). */
function gapFracsSquare(gapMm: number, wTargetMm: number, tipArcMm: number, nShoulder: number): number[] {
  const set = new Set<number>();
  const subN = Math.max(0, Math.ceil(gapMm / Math.max(1e-6, wTargetMm)) - 1);
  for (let j = 1; j <= subN; j++) set.add(+(j / (subN + 1)).toFixed(9));
  for (let i = 0; i < nShoulder; i++) {
    const arc = tipArcMm * Math.pow(Math.max(wTargetMm, tipArcMm) / tipArcMm, i / Math.max(1, nShoulder - 1));
    const fr = arc / gapMm; if (fr > 1e-7 && fr < 0.5) { set.add(+fr.toFixed(9)); set.add(+(1 - fr).toFixed(9)); }
  }
  return Array.from(set).filter((x) => x > 1e-7 && x < 1 - 1e-7).sort((a, b) => a - b);
}

/**
 * M-SQUARE RASTERIZER: like _structColLib.rasterizeColumns BUT the per-gap sub-count targets cell WIDTH ==
 * LOCAL 3D ROW-HEIGHT at that gap (square cells), instead of a fixed dthMm. Row-height at a gap is estimated as
 * verticalSpeed(uMid, t)*dtLocal where dtLocal is the min row-step at that row (from the row list). Sub-count is
 * FIXED per leftFeatKey = MAX over the band's rows of that recipe (keeps equal-count strips => the strip topology
 * / zero serration is preserved). Sub placement stays equal-3D-arc (faithful chord).
 */
export function rasterizeColumnsSquare(
  g: RidgeGraph, rA: AnalyticRadiusFn, H: number, tipArcMm: number, nShoulder: number,
  wFloorMm: number, wCapMm: number,
): RowColumns[] {
  const nR = g.ts.length;
  const activeFeats = (r: number): Array<{ u: number; key: string }> => {
    const raw: Array<{ u: number; key: string }> = [];
    for (let s = 0; s < g.nCrest; s++) { const u = g.crestU[r][s]; if (!Number.isNaN(u)) raw.push({ u: ((u % 1) + 1) % 1, key: `F:c:${s}` }); }
    for (let s = 0; s < g.nValley; s++) { const u = g.valleyU[r][s]; if (!Number.isNaN(u)) raw.push({ u: ((u % 1) + 1) % 1, key: `F:v:${s}` }); }
    const anchorU = ((g.crestU[r][0] % 1) + 1) % 1;
    for (const f of raw) { let u = f.u; while (u < anchorU) u += 1; f.u = u; }
    raw.sort((a, b) => a.u - b.u);
    const dd: Array<{ u: number; key: string }> = [];
    for (const f of raw) if (dd.length === 0 || f.u - dd[dd.length - 1].u > 1e-9) dd.push(f);
    return dd;
  };
  const gap3dMm = (r: number, uA: number, uB: number): number => {
    const z = g.ts[r] * H; const nSamp = 16; let L = 0;
    let px = 0, py = 0;
    for (let i = 0; i <= nSamp; i++) { const u = uA + (uB - uA) * (i / nSamp); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) L += Math.hypot(x - px, y - py); px = x; py = y; }
    return L;
  };
  // local row-height (mm, 3D) at (uMid,t) = min(dt above, dt below)*speed. Squaring uses the SMALLER neighbor
  // step (the tighter constraint) so we never under-refine a cell that is short on one side.
  const localRowHeightMm = (r: number, uMid: number): number => {
    const t = g.ts[r];
    const dtUp = r + 1 < nR ? g.ts[r + 1] - t : Infinity;
    const dtDn = r > 0 ? t - g.ts[r - 1] : Infinity;
    const dt = Math.min(dtUp, dtDn); if (!isFinite(dt)) return wCapMm;
    return vSpeed(rA, ((uMid % 1) + 1) % 1, t, H) * dt;
  };
  // width target per gap = clamp(localRowHeight, wFloor, wCap). Sub-count FIXED per leftFeatKey = the MEDIAN over
  // that band's rows of the square recipe (NOT max — a single fine birth/base row would inflate the whole band's
  // column count to ~9000 cols/row, MEASURED; median tracks the representative width so cells stay ~square across
  // the band while equal-count strips are preserved).
  const perKeyCounts = new Map<string, number[]>();
  for (let r = 0; r < nR; r++) {
    const feats = activeFeats(r); const nf = feats.length;
    for (let k = 0; k < nf; k++) {
      const a = feats[k]; const bU = (k + 1 < nf ? feats[k + 1].u : feats[0].u + 1);
      const uMid = (a.u + bU) / 2;
      const wTarget = Math.min(wCapMm, Math.max(wFloorMm, localRowHeightMm(r, uMid)));
      const cnt = gapFracsSquare(gap3dMm(r, a.u, bU), wTarget, tipArcMm, nShoulder).length;
      if (!perKeyCounts.has(a.key)) perKeyCounts.set(a.key, []);
      perKeyCounts.get(a.key)!.push(cnt);
    }
  }
  const subCount = new Map<string, number>();
  for (const [key, arr] of perKeyCounts) { arr.sort((x, y) => x - y); subCount.set(key, arr[Math.floor(arr.length / 2)] ?? 0); }
  const subFracs = (r: number, uA: number, uB: number, n: number): number[] => {
    if (n <= 0) return [];
    const z = g.ts[r] * H; const M = Math.max(64, 8 * (n + 1));
    const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const total = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) {
      const target = total * (j / (n + 1));
      let lo = 0, hi = M; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
      const seg = cum[hi] - cum[lo] || 1; const fr = (lo + (target - cum[lo]) / seg) / M;
      out.push(Math.min(1 - 1e-9, Math.max(1e-9, fr)));
    }
    return out;
  };
  const rows: RowColumns[] = [];
  for (let r = 0; r < nR; r++) {
    const feats = activeFeats(r); const nf = feats.length;
    const us: number[] = []; const keys: string[] = [];
    for (let k = 0; k < nf; k++) {
      const a = feats[k]; const bU = (k + 1 < nf ? feats[k + 1].u : feats[0].u + 1);
      us.push(((a.u % 1) + 1) % 1); keys.push(a.key);
      const n = subCount.get(a.key) ?? 0;
      const fr = subFracs(r, a.u, bU, n);
      for (let j = 0; j < fr.length; j++) { let v = a.u + (bU - a.u) * fr[j]; v = ((v % 1) + 1) % 1; us.push(v); keys.push(`G:${a.key}:${j}`); }
    }
    rows.push({ t: g.ts[r], z: 0, u: Float64Array.from(us), key: keys });
  }
  return rows;
}

// Re-export the committed builders (used by A/B). buildStructWall/buildStructWallSeam are UNCHANGED.
export { buildStructWall, buildStructWallSeam } from './_structColLib';
export type { StructMesh, RowColumns } from './_structColLib';

/**
 * ADD SEAM COLUMNS: post-process the rasterized rows so the seam (theta=0) has explicit u=0+ (key 'S:0') and
 * u=1- (key 'S:1') columns with M-SQUARE sub-columns bridging the FLANK between them and crest-0 (first column)
 * / the last real column. Then buildStructWallSeamSquare's cliff ladder connects DIRECTLY to these u=0+/u=1-
 * columns (no ~0.05-wide crest-0 gap -> no wide corner sliver, the seam-square regression source). The seam
 * columns get FIXED keys + a FIXED sub-count (median over rows) so strips stay equal-count. Idempotent per row.
 */
export function addSeamColumns(
  rows: RowColumns[], rA: AnalyticRadiusFn, H: number, wFloorMm: number, wCapMm: number,
): RowColumns[] {
  const nR = rows.length;
  const flank3d = (z: number, uA: number, uB: number): number => {
    const nSamp = 16; let L = 0, px = 0, py = 0;
    for (let i = 0; i <= nSamp; i++) { const u = uA + (uB - uA) * (i / nSamp); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) L += Math.hypot(x - px, y - py); px = x; py = y; }
    return L;
  };
  const localRowHMm = (r: number): number => {
    const t = rows[r].t; const dtUp = r + 1 < nR ? rows[r + 1].t - t : Infinity; const dtDn = r > 0 ? t - rows[r - 1].t : Infinity;
    const dt = Math.min(dtUp, dtDn); return isFinite(dt) ? dt * H : wCapMm; // seam flanks change slowly in r -> row-height ~ pure z = dt*H
  };
  // fixed sub-count for the two seam flank gaps (median over rows). Width target = the LOCAL M-square row-height
  // (NOT wFloor — wFloor over-refines the ~15mm seam flank to ~500 subs, MEASURED 9M-tri explosion). Cap at wCap.
  const cnt0: number[] = [], cnt1: number[] = [];
  for (let r = 0; r < nR; r++) {
    const z = rows[r].t * H; const u = rows[r].u; const n = u.length;
    const crest0U = ((u[0] % 1) + 1) % 1; const lastU = ((u[n - 1] % 1) + 1) % 1;
    const w = Math.min(wCapMm, Math.max(localRowHMm(r), wFloorMm));
    cnt0.push(Math.max(0, Math.ceil(flank3d(z, 0, crest0U) / w) - 1));
    cnt1.push(Math.max(0, Math.ceil(flank3d(z, lastU, 1) / w) - 1));
  }
  const med = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
  const n0 = med(cnt0), n1 = med(cnt1);
  // equal-3D-arc sub placement in a seam flank gap [uA,uB].
  const subFr = (z: number, uA: number, uB: number, n: number): number[] => {
    if (n <= 0) return []; const M = Math.max(64, 8 * (n + 1)); const cum = new Float64Array(M + 1); let px = 0, py = 0;
    for (let i = 0; i <= M; i++) { const u = uA + (uB - uA) * (i / M); const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - px, y - py); px = x; py = y; }
    const tot = cum[M] || 1; const out: number[] = [];
    for (let j = 1; j <= n; j++) { const tg = tot * (j / (n + 1)); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < tg) lo = m; else hi = m; } out.push((lo + (tg - cum[lo]) / (cum[hi] - cum[lo] || 1)) / M); }
    return out;
  };
  const out: RowColumns[] = [];
  for (let r = 0; r < nR; r++) {
    const z = rows[r].t * H; const uOld = rows[r].u; const kOld = rows[r].key; const n = uOld.length;
    const crest0U = ((uOld[0] % 1) + 1) % 1; const lastU = ((uOld[n - 1] % 1) + 1) % 1;
    const us: number[] = []; const keys: string[] = [];
    // u=0+ seam column, then subs up to crest-0, then the original columns, then subs to u=1-, then u=1-.
    us.push(1e-9); keys.push('S:0');
    for (const fr of subFr(z, 0, crest0U, n0)) { us.push(0 + (crest0U - 0) * fr); keys.push(`G:S:0:${keys.length}`); }
    for (let k = 0; k < n; k++) { us.push(((uOld[k] % 1) + 1) % 1); keys.push(kOld[k]); }
    const subs1 = subFr(z, lastU, 1, n1);
    for (let j = 0; j < subs1.length; j++) { us.push(lastU + (1 - lastU) * subs1[j]); keys.push(`G:S:1:${j}`); }
    us.push(1 - 1e-9); keys.push('S:1');
    out.push({ t: rows[r].t, z: 0, u: Float64Array.from(us), key: keys });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// KEY-AWARE structured wall (the birth-sliver fix). MEASURED (_qcolLoc): 26% of the residual <10-deg slivers are
// birth-adjacent because the committed buildStructWall uses a U-MONOTONE merge at birth rows that IGNORES the
// column KEY identity: adjacent rows' equal-3D-arc sub-columns u-drift slightly, so the u-merge re-pairs ALL ~2600
// shared columns with a small skew => ~1900 skewed slivers per birth. FIX: at a birth row, connect SHARED-KEY
// columns straight-through (quad, exactly as a same-count strip) and fan ONLY the newborn feature's local block.
// Because subCount is fixed per key across the band, the two rows' key lists differ ONLY by the newborn feature +
// its subs (a contiguous block); the shared prefix/suffix are identical => a clean local fan, zero skew elsewhere.

/** Build the watertight wall connecting shared-KEY columns straight-through; birth rows fan only the newborn block.
 * Periodic in u (last column wraps to first via the shared crest-0 anchor). seamMode: 'wrap' (periodic, C0 seam
 * bridged by one facet/row — chord residual) or 'open' (no wrap; caller must close the seam separately). */
export function buildStructWallSquare(
  rA: AnalyticRadiusFn, H: number, rows: RowColumns[], seamMode: 'wrap' | 'open' = 'wrap',
): StructMesh {
  const nR = rows.length;
  const rowStart: number[] = [0]; let total = 0;
  for (const r of rows) { total += r.u.length; rowStart.push(total); }
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < nR; r++) {
    const base = rowStart[r]; const z = rows[r].t * H;
    for (let k = 0; k < rows[r].u.length; k++) {
      const th = rows[r].u[k] * TAU; const rad = rA(th, z); const vtx = base + k;
      xyz[3 * vtx] = rad * Math.cos(th); xyz[3 * vtx + 1] = rad * Math.sin(th); xyz[3 * vtx + 2] = z;
      ut[2 * vtx] = rows[r].u[k]; ut[2 * vtx + 1] = z / H;
    }
  }
  const idx: number[] = [];
  const d2 = (u: number, v: number): number => { const dx = xyz[3 * u] - xyz[3 * v], dy = xyz[3 * u + 1] - xyz[3 * v + 1], dz = xyz[3 * u + 2] - xyz[3 * v + 2]; return dx * dx + dy * dy + dz * dz; };
  const sameList = (a: string[], b: string[]): boolean => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  // quad between top col c (global tv) and bot col c (global bv), and their +1 neighbours — best diagonal.
  const quad = (a: number, an: number, b: number, bn: number): void => {
    if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
    else { idx.push(a, b, an); idx.push(an, b, bn); }
  };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart[r], bb = rowStart[r + 1];
    const topK = rows[r].key, botK = rows[r + 1].key;
    const nTop = topK.length, nBot = botK.length;
    const wrap = seamMode === 'wrap';
    if (sameList(topK, botK)) {
      const lim = wrap ? nTop : nTop - 1;
      for (let c = 0; c < lim; c++) { const cn = wrap ? (c + 1) % nTop : c + 1; quad(tb + c, tb + cn, bb + c, bb + cn); }
    } else {
      keyAwareStrip(idx, tb, topK, bb, botK, quad, wrap);
    }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/**
 * KEY-AWARE strip between two rows whose key lists differ (a birth). Align by KEY: walk both lists with two
 * pointers; when keys match -> a straight-through quad to the NEXT matching pair; when a key exists in only one
 * row (the newborn feature + subs, a contiguous block in the LONGER row) -> fan that block to the partner column
 * on the shorter row. Zero skew on the shared columns (the whole-ring skew of the u-merge is eliminated).
 * Uses index-of maps for O(n) alignment; the differing block is contiguous so we fan it as a local triangle fan.
 */
function keyAwareStrip(
  idx: number[], tb: number, topK: string[], bb: number, botK: string[],
  quad: (a: number, an: number, b: number, bn: number) => void, wrap: boolean,
): void {
  const nT = topK.length, nB = botK.length;
  // Map key -> column index within each row.
  const topIdx = new Map<string, number>(); for (let i = 0; i < nT; i++) topIdx.set(topK[i], i);
  const botIdx = new Map<string, number>(); for (let i = 0; i < nB; i++) botIdx.set(botK[i], i);
  // The SHARED keys in row order (they appear in the SAME cyclic order on both rows — ridges never cross). Build
  // the shared ordered list from the LONGER row's order (contains all shared keys). Then stitch consecutive shared
  // keys with a quad, and fan any unmatched columns BETWEEN two consecutive shared keys.
  const longerK = nT >= nB ? topK : botK;
  const shared: string[] = []; for (const k of longerK) if (topIdx.has(k) && botIdx.has(k)) shared.push(k);
  const nS = shared.length;
  if (nS === 0) return; // degenerate (should not happen — crest-0 is always shared)
  const lim = wrap ? nS : nS - 1;
  for (let s = 0; s < lim; s++) {
    const kA = shared[s], kB = shared[(s + 1) % nS];
    const tA = tb + topIdx.get(kA)!, tB = tb + topIdx.get(kB)!;
    const bA = bb + botIdx.get(kA)!, bB = bb + botIdx.get(kB)!;
    // extra columns strictly BETWEEN kA and kB on each row (present in only that row = the newborn block).
    const gapCols = (K: string[], base: number, iA: number, iB: number): number[] => {
      const out: number[] = []; let i = (iA + 1) % K.length; const stop = iB; let guard = 0;
      while (i !== stop && guard++ < K.length) { const kk = K[i]; if (!(topIdx.has(kk) && botIdx.has(kk))) out.push(base + i); i = (i + 1) % K.length; }
      return out;
    };
    const topExtra = gapCols(topK, tb, topIdx.get(kA)!, topIdx.get(kB)!);
    const botExtra = gapCols(botK, bb, botIdx.get(kA)!, botIdx.get(kB)!);
    if (topExtra.length === 0 && botExtra.length === 0) {
      // no birth in this gap -> straight-through quad (exactly a same-count strip cell).
      quad(tA, tB, bA, bB);
    } else if (topExtra.length > 0) {
      // top has the newborn block kA..(extras)..kB; bottom has just kA,kB. Fan: bA -> [tA, extras..., tB], bB.
      let prev = tA;
      for (const c of topExtra) { idx.push(bA, prev, c); prev = c; }
      idx.push(bA, prev, tB); idx.push(bA, tB, bB);
    } else {
      // bottom has the newborn block.
      let prev = bA;
      for (const c of botExtra) { idx.push(tA, c, prev); prev = c; }
      idx.push(tA, bB, prev); idx.push(tA, tB, bB);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// M-SQUARE SEAM CLIFF (the seam-sliver + seam-chord fix). MEASURED (_qcolLoc): ~65% of the residual <10-deg
// slivers live in the u~0.98-1.0 band = the periodic WRAP of buildStructWall folding the u=1- column (r1) onto the
// u=0+ column (r0) across the GENUINE C0 seam cliff (SFB@1 rA non-2pi-periodic: radial step 0..6mm at theta=0).
// One wrap facet/row also = the 2.87mm chord residual. FIX: build the body OPEN (no wrap) and mesh the theta=0
// cliff as an M-SQUARE vertical ladder — radial sub-count per row = |r1-r0| / localRowHeight (square cells), so
// the near-vertical face is tessellated to CAD-grade chord with good aspect. Watertight by shared vertices:
// the cliff's two vertical edges ARE the body's u=0+ and u=1- seam columns.
//
// SEAM COLUMN IDENTIFICATION: the rasterizer anchors columns at crest-0 and unwraps to [anchorU, anchorU+1). The
// FIRST column (index 0) is crest-0 (u=anchorU~0.05). The theta=0 seam lies between the LAST column (largest
// unwrapped u, just below anchorU+1) and column 0 (crest-0). We add per row an explicit u=0+ vertex (r0=rA(0)) and
// u=1- vertex (r1=rA(2pi-)) as the true seam edges, connect column0..(0+ vertex) and (1- vertex)..lastColumn with
// small flank quads, and ladder the cliff between the 0+ and 1- vertices.

export function buildStructWallSeamSquare(
  rA: AnalyticRadiusFn, H: number, rows: RowColumns[], _wFloorMm = 0.03, _wCapMm = 0.6,
): StructMesh {
  // CLEAN DESIGN (manifold-by-construction): INLINE the theta=0 cliff ladder INTO each row's column loop, then
  // mesh with the NORMAL wrap strip (sameList -> strip; birth -> u-merge). The rows are crest-0-anchored so each
  // has exactly ONE mod-1 DROP (u[k] > u[k+1]) = the theta=0 STRADDLE (u~0.98 -> u~0.01) = the genuine C0 cliff
  // (MEASURED: 65% of residual slivers + the 2.87mm chord). We REPLACE that single straddle adjacency with a run
  // of ladder columns [r1 (u=1-), interior..., r0 (u=0+)] positioned at theta=0 (off the wall surface, explicit
  // radius) and keyed 'SL:i'. Because the ladder is just more columns in the SAME closed loop, the whole ring
  // meshes as one strip => watertight incl. births (the u-merge handles the newborn against the ladder cleanly).
  const nR = rows.length;
  // build EXTENDED rows: each = body cols [0..sT] then ladder [r1..r0] then body cols [sT+1..last]. Ladder columns
  // carry an explicit (radius,theta=0) position via a parallel 'seamRad' array (NaN for body cols => use rA(u,z)).
  // PER-ROW ladder count (M-square, NOT equal-count): ladNi[r] = max(0, |r1-r0|/rowH - 1) INTERIOR points. Where
  // the seam step is small (t near 0/1, m=6/10 integer => r1==r0), ladNi=0 and NO ladder is inserted (the two
  // straddle columns wrap with a plain quad — correct: no cliff there). The per-row count VARIES => the ladder keys
  // ('SL:i') appear/disappear between rows => handled by the KEY-AWARE ring merge (the newborn/dying ladder block
  // is fanned locally, exactly like a feature birth). This is the M-square cliff: dense where steep, none where flat.
  const straddle = new Int32Array(nR); const R0: number[] = [], R1: number[] = []; const ladNi = new Int32Array(nR);
  for (let r = 0; r < nR; r++) {
    const u = rows[r].u; const n = u.length; let sIdx = n - 1;
    for (let k = 0; k + 1 < n; k++) { if (u[k] > u[k + 1]) { sIdx = k; break; } }
    straddle[r] = sIdx;
    const z = rows[r].t * H; R0.push(rA(0, z)); R1.push(rA((1 - 1e-9) * TAU, z));
    const dtUp = r + 1 < nR ? rows[r + 1].t - rows[r].t : Infinity; const dtDn = r > 0 ? rows[r].t - rows[r - 1].t : Infinity;
    const rowH = isFinite(Math.min(dtUp, dtDn)) ? Math.min(dtUp, dtDn) * H : 1;
    // NO seam columns where the step is negligible (< ~half a row-height): r1≈r0 => the seam is NOT a cliff there,
    // and forcing SL:0/SR:0 at ~equal radius collapses to a ZERO-WIDTH degenerate cell (MEASURED aspect 1e29).
    // ladNi=-1 encodes "no seam columns" (plain wrap of the two body straddle columns).
    const step = Math.abs(R1[r] - R0[r]);
    ladNi[r] = step < 0.5 * rowH ? -1 : Math.max(0, Math.ceil(step / Math.max(1e-3, rowH)) - 1);
  }
  type ExtRow = { t: number; keys: string[]; us: Float64Array; rad: Float64Array }; // rad NaN => on-surface
  const ext: ExtRow[] = [];
  for (let r = 0; r < nR; r++) {
    const u = rows[r].u; const k = rows[r].key; const n = u.length; const sT = straddle[r];
    const ladN = ladNi[r] < 0 ? 0 : ladNi[r] + 2; // [r1(SL:0), interior(SM:i), r0(SR:0)] or 0 (no cliff).
    const keys: string[] = []; const us: number[] = []; const rad: number[] = [];
    for (let c = 0; c <= sT; c++) { keys.push(k[c]); us.push(u[c]); rad.push(NaN); }
    for (let i = 0; i < ladN; i++) {
      const rr = R1[r] + (R0[r] - R1[r]) * (ladN > 1 ? i / (ladN - 1) : 0);
      // FIXED keys for the two seam EDGES so they always connect across rows; interior points keyed from the r1
      // side (SM:i) so a varying interior count is fanned by the key-aware merge (dense cliff -> sparse cliff).
      const key = i === 0 ? 'SL:0' : (i === ladN - 1 ? 'SR:0' : `SM:${i}`);
      keys.push(key); us.push(i === 0 ? 1 - 1e-9 : (i === ladN - 1 ? 1e-9 : 0.5)); rad.push(rr);
    }
    for (let c = sT + 1; c < n; c++) { keys.push(k[c]); us.push(u[c]); rad.push(NaN); }
    ext.push({ t: rows[r].t, keys, us: Float64Array.from(us), rad: Float64Array.from(rad) });
  }
  // lay out vertices
  const rowStart: number[] = [0]; let total = 0; for (const e of ext) { total += e.keys.length; rowStart.push(total); }
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < nR; r++) {
    const base = rowStart[r]; const z = ext[r].t * H;
    for (let c = 0; c < ext[r].keys.length; c++) {
      const vtx = base + c; const rr = ext[r].rad[c];
      if (Number.isNaN(rr)) { const th = ext[r].us[c] * TAU; const rad = rA(th, z); xyz[3 * vtx] = rad * Math.cos(th); xyz[3 * vtx + 1] = rad * Math.sin(th); }
      else { xyz[3 * vtx] = rr; xyz[3 * vtx + 1] = 0; }
      xyz[3 * vtx + 2] = z; ut[2 * vtx] = ext[r].us[c]; ut[2 * vtx + 1] = z / H;
    }
  }
  const idx: number[] = [];
  const d2 = (u: number, v: number): number => { const dx = xyz[3 * u] - xyz[3 * v], dy = xyz[3 * u + 1] - xyz[3 * v + 1], dz = xyz[3 * u + 2] - xyz[3 * v + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a: number, an: number, b: number, bn: number): void => {
    if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
    else { idx.push(a, b, an); idx.push(an, b, bn); }
  };
  const sameList = (a: string[], b: string[]): boolean => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart[r], bb = rowStart[r + 1];
    const topK = ext[r].keys, botK = ext[r + 1].keys; const nTop = topK.length;
    if (sameList(topK, botK)) {
      for (let c = 0; c < nTop; c++) { const cn = (c + 1) % nTop; quad(tb + c, tb + cn, bb + c, bb + cn); }
    } else {
      // birth row: key-aware ring merge over the EXTENDED loop (shared keys straight-through, newborn block fanned).
      keyAwareStrip(idx, tb, topK, bb, botK, quad, true);
    }
  }
  return { xyz, ut, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/** OPEN u-monotone merge for a birth row, with the ring CUT at the straddle (sT/sB) so the chain runs from just
 * AFTER the straddle around to the straddle, NEVER crossing theta=0 (the cliff closes that). Both rows are rotated
 * to start at index (straddle+1) and unwrapped ascending; the last column is the straddle column (chain end). */
function openUMergeCut(idx: number[], tb: number, topU: Float64Array, sT: number, bb: number, botU: Float64Array, sB: number): void {
  const nT = topU.length, nB = botU.length;
  const seq = (base: number, U: Float64Array, N: number, s: number): Array<{ v: number; u: number }> => {
    const out: Array<{ v: number; u: number }> = []; let prev = -Infinity;
    for (let c = 0; c < N; c++) {
      const i = (s + 1 + c) % N; let u = ((U[i] % 1) + 1) % 1; while (u < prev - 1e-12) u += 1;
      out.push({ v: base + i, u }); prev = u;
    }
    return out;
  };
  const top = seq(tb, topU, nT, sT), bot = seq(bb, botU, nB, sB);
  let i = 0, j = 0;
  while (i + 1 < top.length || j + 1 < bot.length) {
    const advTop = (j + 1 >= bot.length) || (i + 1 < top.length && top[i + 1].u <= bot[j + 1].u);
    if (advTop) { idx.push(top[i].v, bot[j].v, top[i + 1].v); i++; }
    else { idx.push(top[i].v, bot[j].v, bot[j + 1].v); j++; }
  }
}
