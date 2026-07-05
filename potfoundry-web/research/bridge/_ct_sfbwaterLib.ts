// _ct_sfbwaterLib.ts — DEV-ONLY (research/ only; src/ NEVER imports this). E-2026-07-03-SFB-WATER Fix A.
//
// PROBLEM (localized, _ct_sfbwater L-probe + E-STRUCTCOL2): buildStructWallSeamSquare INLINES the θ=0 cliff ladder
// into each row's column loop with POSITIONAL keys SL:0 / SM:i / SR:0. When the per-row ladder interior count
// changes between rows, the SM:i keys index a DIFFERENT radius per row; the key-aware merge treats a mid-ladder
// SM:k as "shared" while the block is NOT contiguous relative to the SL:0/SR:0 anchors ⇒ the local fan
// double-covers an edge ⇒ rawNonMan (6-8 edges, all at u=0.5 = the SM rungs) + degenerate count-transition cells
// (measured: 487 degen at hRow=0.35). The rawNonMan edges live at t≈0.177/0.44 = the seam-step peaks.
//
// FIX A (watertight by construction): build the BODY as an OPEN wall (crest-0 .. body .. last col, NO seam wrap)
// from the ORIGINAL M-square rows (no extra seam columns → no explosion). Then close the θ=0 gap with an
// INDEPENDENT ladder strip: per row create two rail vertices — vL at (u=1-, r1=rA(2π-,z)) and vR at (u=0+,
// r0=rA(0,z)) — plus interior rungs at θ=0 spaced by 3D-arc (M-square: dense where the cliff is steep, ZERO where
// r1≈r0). The two rails are stitched to the body's LAST and FIRST columns by a single flank quad per row-pair, and
// the ladder between vL and vR is stitched across adjacent rows by ONE monotone-by-fraction two-pointer merge (the
// same primitive as a same-surface strip whose two sides have different counts) ⇒ every interior edge shared
// exactly twice ⇒ raw-index watertight. No positional-key fan anywhere. Where r1≈r0 no interior rungs are inserted.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StructMesh, RowColumns } from './_structColLib';

const TAU = 2 * Math.PI;

/**
 * Build the OPEN body wall from the ridge-graph M-square rows (crest-0-anchored, ascending u in [anchorU,
 * anchorU+1)). Adjacent rows are stitched by a key-aware strip WITHOUT wrap: the FIRST (crest-0) and LAST body
 * columns are left as open boundaries at θ=0 for the ladder to close. Returns the body + the global vertex index
 * of each row's FIRST (crest-0, u≈small) and LAST (u≈near crest0+1) column.
 */
function buildOpenBody(
  rA: AnalyticRadiusFn, H: number, rows: RowColumns[],
): { xyz: number[]; ut: number[]; idx: number[]; nV: number; first: number[]; last: number[] } {
  const nR = rows.length;
  const rowStart: number[] = [0]; let total = 0;
  for (const r of rows) { total += r.u.length; rowStart.push(total); }
  const xyz = new Array(total * 3); const ut = new Array(total * 2);
  const first: number[] = new Array(nR), last: number[] = new Array(nR);
  for (let r = 0; r < nR; r++) {
    const base = rowStart[r]; const z = rows[r].t * H; const n = rows[r].u.length;
    for (let k = 0; k < n; k++) {
      const u = ((rows[r].u[k] % 1) + 1) % 1; const th = u * TAU; const rad = rA(th, z); const vtx = base + k;
      xyz[3 * vtx] = rad * Math.cos(th); xyz[3 * vtx + 1] = rad * Math.sin(th); xyz[3 * vtx + 2] = z;
      ut[2 * vtx] = u; ut[2 * vtx + 1] = z / H;
    }
    first[r] = base; last[r] = base + n - 1;
  }
  const idx: number[] = [];
  const d2 = (a: number, b: number): number => { const dx = xyz[3 * a] - xyz[3 * b], dy = xyz[3 * a + 1] - xyz[3 * b + 1], dz = xyz[3 * a + 2] - xyz[3 * b + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a: number, an: number, b: number, bn: number): void => {
    if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
    else { idx.push(a, b, an); idx.push(an, b, bn); }
  };
  const sameList = (a: string[], b: string[]): boolean => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
  for (let r = 0; r + 1 < nR; r++) {
    const tb = rowStart[r], bb = rowStart[r + 1];
    const topK = rows[r].key, botK = rows[r + 1].key; const nTop = topK.length;
    if (sameList(topK, botK)) {
      for (let c = 0; c + 1 < nTop; c++) quad(tb + c, tb + c + 1, bb + c, bb + c + 1); // OPEN: no wrap
    } else {
      keyAwareStripOpen(idx, tb, topK, bb, botK, quad);
    }
  }
  return { xyz, ut, idx, nV: total, first, last };
}

/**
 * OPEN key-aware strip (no wrap): align two rows by shared key order; straight-through quad between consecutive
 * shared keys; fan the newborn/dying block (present in only one row, contiguous) to the partner column. Same as
 * _qcolMsquare.keyAwareStrip but wrap disabled — the seam is closed separately by the ladder, so the two rows must
 * NOT be stitched across θ=0. Shared keys appear in the SAME order (ridges never cross); the FIRST (crest-0) and
 * LAST columns are always shared (they exist on every row) so the open boundary is exactly first/last.
 */
function keyAwareStripOpen(
  idx: number[], tb: number, topK: string[], bb: number, botK: string[],
  quad: (a: number, an: number, b: number, bn: number) => void,
): void {
  const nT = topK.length, nB = botK.length;
  const topIdx = new Map<string, number>(); for (let i = 0; i < nT; i++) topIdx.set(topK[i], i);
  const botIdx = new Map<string, number>(); for (let i = 0; i < nB; i++) botIdx.set(botK[i], i);
  const longerK = nT >= nB ? topK : botK;
  const shared: string[] = []; for (const k of longerK) if (topIdx.has(k) && botIdx.has(k)) shared.push(k);
  const nS = shared.length; if (nS < 2) return;
  for (let s = 0; s + 1 < nS; s++) {
    const kA = shared[s], kB = shared[s + 1];
    const iTA = topIdx.get(kA)!, iTB = topIdx.get(kB)!, iBA = botIdx.get(kA)!, iBB = botIdx.get(kB)!;
    const tA = tb + iTA, tB = tb + iTB, bA = bb + iBA, bB = bb + iBB;
    const gapCols = (K: string[], base: number, iA: number, iB: number): number[] => {
      const out: number[] = []; for (let i = iA + 1; i < iB; i++) { const kk = K[i]; if (!(topIdx.has(kk) && botIdx.has(kk))) out.push(base + i); } return out;
    };
    const topExtra = gapCols(topK, tb, iTA, iTB);
    const botExtra = gapCols(botK, bb, iBA, iBB);
    if (topExtra.length === 0 && botExtra.length === 0) { quad(tA, tB, bA, bB); }
    else if (topExtra.length > 0) { let prev = tA; for (const c of topExtra) { idx.push(bA, prev, c); prev = c; } idx.push(bA, prev, tB); idx.push(bA, tB, bB); }
    else { let prev = bA; for (const c of botExtra) { idx.push(tA, c, prev); prev = c; } idx.push(tA, bB, prev); idx.push(tA, tB, bB); }
  }
}

/**
 * INDEPENDENT WATERTIGHT SEAM-CLIFF LADDER. Per row: rail vertices vL=(u=1-, r1) and vR=(u=0+, r0) at θ=0, plus
 * interior rungs between them (radii r1→r0, count = ceil(|r1-r0|/rowH)-1, ZERO where r1≈r0). The full seam chain
 * per row = [ last-body-col, vL, interior rungs, vR, first-body-col ], ordered by a monotone fraction key
 * (last=−ε, vL=0, rungs∈(0,1), vR=1, first=1+ε). Adjacent rows are stitched by ONE monotone two-pointer merge over
 * this chain ⇒ the flank cells (body↔rail) AND the cliff cells (rail↔rung↔rail) are all quads/tris shared exactly
 * twice ⇒ watertight by construction. The last/first body columns are shared with the body BY INDEX.
 */
function buildLadderStrip(
  rA: AnalyticRadiusFn, H: number, rows: RowColumns[], first: number[], last: number[],
  xyz: number[], ut: number[], idx: number[], startV: number,
): number {
  const nR = rows.length;
  // per-row interior rung radii (from r1 side toward r0 side, exclusive of the two rails).
  const rung: number[][] = [];
  for (let r = 0; r < nR; r++) {
    const z = rows[r].t * H; const r1 = rA((1 - 1e-9) * TAU, z), r0 = rA(0, z);
    const dtUp = r + 1 < nR ? rows[r + 1].t - rows[r].t : Infinity;
    const dtDn = r > 0 ? rows[r].t - rows[r - 1].t : Infinity;
    const rowH = isFinite(Math.min(dtUp, dtDn)) ? Math.min(dtUp, dtDn) * H : 1;
    const step = Math.abs(r1 - r0);
    const ni = step < 0.5 * rowH ? 0 : Math.max(0, Math.ceil(step / Math.max(1e-3, rowH)) - 1);
    const arr: number[] = []; for (let i = 1; i <= ni; i++) arr.push(r1 + (r0 - r1) * (i / (ni + 1)));
    rung.push(arr);
  }
  // allocate rail + interior rung vertices at θ=0 (x=rad, y=0). Rails: vL, vR. Interior rungs between.
  const vLarr: number[] = new Array(nR), vRarr: number[] = new Array(nR); const rungV: number[][] = [];
  let v = startV;
  for (let r = 0; r < nR; r++) {
    const z = rows[r].t * H; const r1 = rA((1 - 1e-9) * TAU, z), r0 = rA(0, z);
    xyz[3 * v] = r1; xyz[3 * v + 1] = 0; xyz[3 * v + 2] = z; ut[2 * v] = 1 - 1e-9; ut[2 * v + 1] = z / H; vLarr[r] = v++;
    // interior rung: physically at θ=0 (x=rad,y=0). LABEL u=0+ (NOT 0.5) so (u,t)-based rulers lift it to rA(0,z)
    // = the seam radius r0 (the near-vertical cliff face it belongs to) → the radial/brute error reads the TRUE
    // cliff step (≤ seamStep ~6mm), NOT the pot-diameter artifact a fake u=0.5 (θ=π) label produced (62mm).
    const vs: number[] = [];
    for (const rr of rung[r]) { xyz[3 * v] = rr; xyz[3 * v + 1] = 0; xyz[3 * v + 2] = z; ut[2 * v] = 1e-9; ut[2 * v + 1] = z / H; vs.push(v++); }
    rungV.push(vs);
    xyz[3 * v] = r0; xyz[3 * v + 1] = 0; xyz[3 * v + 2] = z; ut[2 * v] = 1e-9; ut[2 * v + 1] = z / H; vRarr[r] = v++;
  }
  const d2 = (a: number, b: number): number => { const dx = xyz[3 * a] - xyz[3 * b], dy = xyz[3 * a + 1] - xyz[3 * b + 1], dz = xyz[3 * a + 2] - xyz[3 * b + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a: number, an: number, b: number, bn: number): void => {
    if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
    else { idx.push(a, b, an); idx.push(an, b, bn); }
  };
  // Stitch adjacent rows as THREE INDEPENDENT strips so a flank vertex can NEVER pair with a far cliff vertex
  // (the 24mm bridge a single count-varying merge produced when rung counts differed):
  //   (1) LEFT flank: last ↔ vL  (2 verts each side → 1 quad),
  //   (2) CLIFF: vL → interior rungs → vR  (varying rung count → monotone two-pointer merge, bounded to the cliff),
  //   (3) RIGHT flank: vR ↔ first  (1 quad).
  // The shared vertices vL/vR are used by BOTH the adjacent flank and the cliff strip ⇒ watertight seam between pieces.
  const cliffChain = (r: number): number[] => {
    const arr = rungV[r]; const out: number[] = [vLarr[r]]; for (const vv of arr) out.push(vv); out.push(vRarr[r]); return out;
  };
  for (let r = 0; r + 1 < nR; r++) {
    // (1) left flank quad
    quad(last[r], vLarr[r], last[r + 1], vLarr[r + 1]);
    // (3) right flank quad
    quad(vRarr[r], first[r], vRarr[r + 1], first[r + 1]);
    // (2) cliff strip (monotone by fractional position along the cliff; both start at vL, end at vR)
    const top = cliffChain(r), bot = cliffChain(r + 1);
    const nT = top.length, nB = bot.length;
    // monotone merge using each list's own normalized position (0=vL … 1=vR); vL/vR shared endpoints keep it watertight.
    const kT = (i: number): number => (nT > 1 ? i / (nT - 1) : 0);
    const kB = (j: number): number => (nB > 1 ? j / (nB - 1) : 0);
    let i = 0, j = 0;
    while (i + 1 < nT || j + 1 < nB) {
      const advTop = (j + 1 >= nB) || (i + 1 < nT && kT(i + 1) <= kB(j + 1));
      if (advTop) { idx.push(top[i], bot[j], top[i + 1]); i++; }
      else { idx.push(top[i], bot[j], bot[j + 1]); j++; }
    }
  }
  return v;
}

/**
 * FIX A entry point: watertight structured SFB wall. Body OPEN (no seam wrap) from the ridge-graph M-square rows;
 * the θ=0 cliff closed by the independent watertight ladder strip (rails + M-square rungs, monotone-merge stitched,
 * flanks shared with the body's first/last columns by index). Raw-index watertight by construction; only internal
 * boundaries are the top/bottom rims. Feature ridges stay exact columns (zero serration); the seam is a clean
 * explicit vertical cliff feature (u=0+/u=1- are exact mesh edges on rA(0,z)/rA(2π-,z)).
 */
export function buildSeamLadderWatertight(
  rA: AnalyticRadiusFn, H: number, rows: RowColumns[],
): StructMesh {
  const body = buildOpenBody(rA, H, rows);
  const xyz = body.xyz, ut = body.ut, idx = body.idx;
  const finalV = buildLadderStrip(rA, H, rows, body.first, body.last, xyz, ut, idx, body.nV);
  const XYZ = Float64Array.from(xyz.slice(0, finalV * 3));
  return { xyz: XYZ, ut: ut.slice(0, finalV * 2), idx: Uint32Array.from(idx), nV: finalV, nF: idx.length / 3 };
}
