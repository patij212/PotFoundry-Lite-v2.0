// _pf_crestStripDirectLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// GATE-2 (SLIVERS on GothicArches / GeometricStar): an EXPLICIT STRUCTURED-QUAD FLANK STRIP whose connectivity is
// EMITTED DIRECTLY — NOT handed to free cdt2d (the V6 refineCrestStrip refutation).
//
// KEY GEOMETRIC FACTS (measured, _pf_direct_diag):
//   - The two Gothic crests per bay are SLANTED diagonal ribs drifting in OPPOSITE u directions across the z-band
//     (0.033→0.017 and 0.050→0.067 over 8mm) — an X-junction. A single linear shear cannot straighten both; a
//     FIXED vertical-u grid crosses the slanted crest (→ apex bridge → needles). So the grid must be CREST-ALIGNED
//     PER CREST.
//
// THE STRUCTURE (this file) — a CREST-ALIGNED PER-CREST RIBBON grid, connectivity EMITTED DIRECTLY (no cdt2d):
//   For each crest curve C_j (tracked row-to-row by rowCrests + nearest-u linking), build a ribbon of rows ALONG
//   the crest (arc-length pitch dtRow) × columns ACROSS the crest into BOTH flanks (metric arc-length offsets,
//   FINE near the crest → COARSE on the panel, the SAME offset sequence every row). Because the columns are indexed
//   by the SAME offset-k on the SAME crest at every row, column k is a CONTINUOUS track parallel to the (slanted)
//   crest ⇒ each inter-row quad is a parallelogram in 3D ⇒ SQUARE by construction, NO cross-flank needle. The crest
//   column (offset 0) is a shared mesh-edge chain ⇒ NO facet bridges the apex (no-bridge). Each quad → 2 tris,
//   consistent diagonal, emitted directly.
//   Adjacent crests' ribbons MEET at the shared VALLEY track (the perpendicular bisector of the two crests). Each
//   ribbon marches its outer flank to the valley; the two ribbons SHARE the identical valley node ids (built once,
//   keyed by (rowIndex, valleyBetween j and j+1)) ⇒ watertight seam between ribbons. Domain-edge flanks clip to
//   the patch boundary. All rows share the same t-values (one global row-t list) so ribbon seams are index-shared.
//
// Count-instability (GeoStar birth/merge): a crest that appears/vanishes only spans the rows where it exists; its
// ribbon caps at the birth/merge row and the neighbouring valley track absorbs the transition (the valley is the
// midpoint of whatever crests exist that row). No cdt2d; watertight by shared valley/edge tracks.
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib + _pf_perfectMesherMsquareLib + labkit READ-ONLY. NO cdt2d, NO
// src/ or existing-kernel edit. The honest whole-mesh guard (acceptanceGuardWhole) is reused VERBATIM by the probe.
import { type AnalyticRadiusFn } from './labkit';
import { type PatchDef, lift, rowCrests } from './_pf_perfectMesherLib';
import { metricScales } from './_pf_perfectMesherMsquareLib';

const TAU = 2 * Math.PI;

// fixed arc-length offset sequence from a crest into ONE flank: 0 (crest), then FINE (hCrest) ramping to COARSE.
function offsetSequence(hCrest: number, hPanel: number, ramp: number, maxOffMm: number): number[] {
  const offs = [0];
  let o = 0, h = hCrest;
  while (o < maxOffMm - 1e-9) { o += h; offs.push(Math.min(maxOffMm, o)); h = Math.min(hPanel, h * ramp); }
  return offs;
}

// march from crest u by arc-length targetMm along ±u using local metric su (sub-stepped for steep-flank accuracy).
function marchU(patch: PatchDef, u0: number, t: number, sgn: number, targetMm: number): number {
  const { rA, H, uLo, uHi } = patch;
  let u = u0, acc = 0; const sub = 6; const step = targetMm / sub;
  for (let s = 0; s < sub; s++) {
    const { su } = metricScales(rA, H, ((u % 1) + 1) % 1, t);
    u = u + sgn * step / (su || 1e-9); acc += step;
    if (u <= uLo) return uLo; if (u >= uHi) return uHi;
  }
  void acc; return u;
}

export interface DirectStripResult {
  uv: number[]; tris: number[]; nRows: number; nNodes: number;
  rowCounts: number[]; minRowCount: number; maxRowCount: number; nCrestTracks: number;
}

// track the crests row-to-row (nearest-u linking) so each crest keeps a stable index j across rows.
function trackCrests(patch: PatchDef, rowT: number[], minAmp: number): Array<Array<number | null>> {
  const { rA, H, uLo, uHi } = patch;
  const perRow = rowT.map((t) => rowCrests(rA, t, H, uLo, uHi, 3000, minAmp).filter((u) => u > uLo + 1e-9 && u < uHi - 1e-9).sort((a, b) => a - b));
  // Link into tracks: greedy nearest-u chaining. tracks[j] = array over rows of u|null.
  const tracks: Array<Array<number | null>> = [];
  const linkTol = (uHi - uLo) * 0.25; // a crest can drift at most ~1/4 patch between adjacent rows
  for (let r = 0; r < rowT.length; r++) {
    const used = new Array(perRow[r].length).fill(false);
    // extend existing tracks
    for (const tr of tracks) {
      const prev = tr[r - 1];
      if (prev == null) { tr.push(null); continue; }
      let best = -1, bd = linkTol;
      for (let k = 0; k < perRow[r].length; k++) { if (used[k]) continue; const d = Math.abs(perRow[r][k] - prev); if (d < bd) { bd = d; best = k; } }
      if (best >= 0) { tr.push(perRow[r][best]); used[best] = true; } else tr.push(null);
    }
    // new tracks for unmatched crests this row
    for (let k = 0; k < perRow[r].length; k++) {
      if (used[k]) continue;
      const tr: Array<number | null> = new Array(r).fill(null); tr.push(perRow[r][k]); tracks.push(tr);
    }
  }
  return tracks;
}

// ── the direct-emit CREST-ALIGNED RIBBON mesher ──────────────────────────────────────────────────────────────
export function buildDirectCrestStrip(
  patch: PatchDef,
  opts: { dtRowMm: number; hCrestMm: number; hPanelMm: number; nRamp: number; minAmp: number; ramp?: number },
): DirectStripResult {
  const { rA, H, tLo, tHi, uLo, uHi } = patch;
  const { dtRowMm, hCrestMm, hPanelMm, minAmp } = opts;
  const ramp = opts.ramp ?? 1.35;

  // global row-t list (all ribbons share these rows ⇒ seam node ids are index-shared).
  // ROW SPACING = uniform arc length ALONG THE DOMINANT CREST (not vertical t): the Gothic crest is DIAGONAL, so a
  // vertical-t row pitch makes the crest EDGE per row (sqrt((st·dt)²+(su·du_crest)²)) much LONGER than the flank
  // column pitch → crest cells are needles (measured: 0.29mm crest edge vs 0.08mm flank column). Placing rows at
  // equal along-crest 3D arc makes the crest edge ≈ dtRow ≈ hCrest ⇒ square crest cells. We integrate the strongest
  // crest's 3D arc-length s(t) over a fine t-grid, then invert to equal-arc t samples.
  const NFINE = 400;
  const crestUFine: number[] = new Array(NFINE + 1).fill(NaN);
  let uPrev = NaN;
  for (let i = 0; i <= NFINE; i++) {
    const t = tLo + (tHi - tLo) * (i / NFINE);
    const cs = rowCrests(rA, t, H, uLo, uHi, 3000, minAmp).filter((u) => u > uLo + 1e-9 && u < uHi - 1e-9);
    if (!cs.length) { crestUFine[i] = uPrev; continue; }
    // track the crest nearest to the previous (a single stable rib); seed at the band-center strongest crest
    if (Number.isNaN(uPrev)) { let bu = cs[0], ba = -Infinity; for (const u of cs) { const a = rA(TAU * (((u % 1) + 1) % 1), t * H); if (a > ba) { ba = a; bu = u; } } uPrev = bu; }
    else { let best = cs[0], bd = Infinity; for (const u of cs) { const d = Math.abs(u - uPrev); if (d < bd) { bd = d; best = u; } } uPrev = best; }
    crestUFine[i] = uPrev;
  }
  // cumulative 3D arc length of the crest curve
  const arc: number[] = new Array(NFINE + 1).fill(0);
  for (let i = 1; i <= NFINE; i++) {
    const t0 = tLo + (tHi - tLo) * ((i - 1) / NFINE), t1 = tLo + (tHi - tLo) * (i / NFINE);
    const u0 = Number.isNaN(crestUFine[i - 1]) ? (uLo + uHi) / 2 : crestUFine[i - 1];
    const u1 = Number.isNaN(crestUFine[i]) ? (uLo + uHi) / 2 : crestUFine[i];
    const P0 = lift(rA, ((u0 % 1) + 1) % 1, t0, H), P1 = lift(rA, ((u1 % 1) + 1) % 1, t1, H);
    arc[i] = arc[i - 1] + Math.hypot(P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]);
  }
  const totalArc = arc[NFINE] || ((tHi - tLo) * metricScales(rA, H, (uLo + uHi) / 2, (tLo + tHi) / 2).st);
  const nRows = Math.max(2, Math.round(totalArc / dtRowMm));
  const rowT: number[] = [];
  for (let r = 0; r <= nRows; r++) {
    const target = totalArc * (r / nRows);
    // invert arc(t): find i with arc[i-1] <= target <= arc[i], interpolate t
    let i = 1; while (i < NFINE && arc[i] < target) i++;
    const a0 = arc[i - 1], a1 = arc[i]; const fr = a1 > a0 ? (target - a0) / (a1 - a0) : 0;
    const ti = tLo + (tHi - tLo) * ((i - 1 + fr) / NFINE);
    rowT.push(Math.min(tHi, Math.max(tLo, ti)));
  }

  const tracks = trackCrests(patch, rowT, minAmp);      // crest tracks, index j stable across rows
  const nJ = tracks.length;

  const uv: number[] = [];
  // node cache: key = row*1e7 + Math.round(u*1e5) to SHARE valley/edge nodes between adjacent ribbons.
  const nodeCache = new Map<number, number>();
  const cellU = (hCrestMm * 0.4) / patch.arcPerU;
  const nodeAt = (r: number, u: number): number => {
    const uc = Math.min(uHi, Math.max(uLo, u));
    const key = r * 10000000 + Math.round(uc / Math.max(cellU, 1e-9));
    const hit = nodeCache.get(key); if (hit !== undefined) return hit;
    const id = uv.length / 2; uv.push(uc, rowT[r]); nodeCache.set(key, id); return id;
  };

  // Per row, compute the crest u's (from tracks) and the valley u's between consecutive present crests (+ domain
  // edges as the outer valleys). A ribbon for crest j spans rows where track j is present; its flanks march from
  // the crest to the neighbouring valley (or domain edge). We build ROW COLUMN LISTS as: for each present crest,
  // its offset fan into ±u CLIPPED at the adjacent valley; the valley/edge nodes are SHARED.
  // valleyU(r, between crest a-index and b-index) = perpendicular bisector in u (midpoint of the two crest u's).
  const crestUAt = (r: number): Array<{ j: number; u: number }> => {
    const out: Array<{ j: number; u: number }> = [];
    for (let j = 0; j < nJ; j++) { const u = tracks[j][r]; if (u != null) out.push({ j, u }); }
    out.sort((a, b) => a.u - b.u); return out;
  };

  // Build each row's ordered column node-id list (crest fans clipped to valleys, valleys+edges shared).
  const offs = offsetSequence(hCrestMm, hPanelMm, ramp, (uHi - uLo) * patch.arcPerU);
  const rowIds: number[][] = []; const rowUs: number[][] = []; const rowCounts: number[] = [];
  for (let r = 0; r <= nRows; r++) {
    const t = rowT[r];
    const cr = crestUAt(r);
    // valley boundaries: uLo, midpoints between consecutive crests, uHi
    const bounds: number[] = [uLo];
    for (let k = 0; k + 1 < cr.length; k++) bounds.push((cr[k].u + cr[k + 1].u) / 2);
    bounds.push(uHi);
    // collect u's for this row: all bounds (shared) + each crest fan clipped to its [leftBound,rightBound]
    const us = new Set<number>();
    const addU = (u: number): void => { us.add(Math.min(uHi, Math.max(uLo, u))); };
    for (const b of bounds) addU(b);
    for (let k = 0; k < cr.length; k++) {
      const uc = cr[k].u; const left = bounds[k], right = bounds[k + 1];
      addU(uc);
      for (const sgn of [+1, -1]) {
        const lim = sgn > 0 ? right : left;
        for (let m = 1; m < offs.length; m++) {
          const u = marchU(patch, uc, t, sgn, offs[m]);
          if (sgn > 0 ? u >= lim - 1e-9 : u <= lim + 1e-9) break;
          addU(u);
        }
      }
    }
    // if no crest this row, just the domain edges + a coarse panel fill so rows still stitch
    if (cr.length === 0) {
      const span = uHi - uLo; const n = Math.max(2, Math.round(span * patch.arcPerU / hPanelMm));
      for (let m = 0; m <= n; m++) addU(uLo + span * (m / n));
    }
    const sortedU = Array.from(us).sort((a, b) => a - b);
    const ids = sortedU.map((u) => nodeAt(r, u));
    rowIds.push(ids); rowUs.push(sortedU); rowCounts.push(sortedU.length);
  }

  // MONOTONE ZIPPER between consecutive rows — emit tris directly. Column tracks align (same offset seq anchored to
  // tracked crests + shared bounds) so this is a near-structured quad strip; the u-nearest advance handles the few
  // birth/merge transitions. Watertight by shared node ids.
  const tris: number[] = [];
  const P = (id: number): [number, number, number] => lift(rA, uv[2 * id], uv[2 * id + 1], H);
  for (let r = 0; r < rowIds.length - 1; r++) {
    const A = rowIds[r], B = rowIds[r + 1]; const Au = rowUs[r], Bu = rowUs[r + 1];
    let i = 0, j = 0;
    while (i < A.length - 1 || j < B.length - 1) {
      const canA = i < A.length - 1, canB = j < B.length - 1;
      let advB: boolean;
      if (canA && canB) {
        // choose the diagonal that gives the BETTER-shaped pair of 3D triangles (max-min-angle Delaunay-like local
        // choice) — the render showed a u-only choice skews diagonals into needles where rows drift. Compare the
        // two candidate diagonals by their 3D length (shorter diagonal ⇒ rounder cells) with a min-angle refinement.
        const Pai = P(A[i]), Pai1 = P(A[i + 1]), Pbj = P(B[j]), Pbj1 = P(B[j + 1]);
        const l3A = Math.hypot(Pai1[0] - Pbj[0], Pai1[1] - Pbj[1], Pai1[2] - Pbj[2]);  // diagonal A[i+1]-B[j]
        const l3B = Math.hypot(Pbj1[0] - Pai[0], Pbj1[1] - Pai[1], Pbj1[2] - Pai[2]);  // diagonal A[i]-B[j+1]
        advB = l3A <= l3B;
        void Au; void Bu;
      } else advB = canA;
      if (advB) { if (A[i] !== A[i + 1] && A[i] !== B[j] && A[i + 1] !== B[j]) tris.push(A[i], A[i + 1], B[j]); i++; }
      else { if (A[i] !== B[j + 1] && A[i] !== B[j] && B[j + 1] !== B[j]) tris.push(A[i], B[j + 1], B[j]); j++; }
    }
  }
  let minRC = Infinity, maxRC = 0; for (const c of rowCounts) { if (c < minRC) minRC = c; if (c > maxRC) maxRC = c; }
  return { uv, tris, nRows: rowIds.length, nNodes: uv.length / 2, rowCounts, minRowCount: minRC, maxRowCount: maxRC, nCrestTracks: nJ };
}

void TAU;
