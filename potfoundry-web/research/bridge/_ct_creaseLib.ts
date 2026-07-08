// _ct_creaseLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-CT-PREDICATE. A CelticTriquetra braid-crease predicate reconstructed from the LIVE
// rOuterCelticTriquetra diamond-lattice structure (src/geometry/styles.ts), analogous to celticKnotCreasePredicate.
//
// WHERE THE C0 LOCI LIVE (derived from rOuterCelticTriquetra):
//   The relief h(u,t) = max over {upper braid band, lower braid band, medallion, rim lines}. Each braid band maps
//   (u,t) into a 45deg-rotated diamond lattice q=(pX+pY, -pX+pY) with pX=u*Nx+offsetX, pY=vBand*Ny (vBand the
//   normalized position in the band). Per unit tile (ix=floor(qx), iy=floor(qy)) a DISCRETE tileId=ctBraidTileId(ix,iy)
//   in {0,1,2} selects arc-bend (0/1) vs crossing (2) height formulas. The C0 crease families are:
//     (A) TILE BOUNDARIES: qx or qy integer — tileId can switch AND the per-tile arc/crossing height is C0 across
//         the seam (each tile's formula uses tile-local tx,ty). This is the dominant braid over-under weave crease.
//     (B) CROSSING-TILE STRAND FLIP: inside a tileId==2 tile, max(hV,hH) has a C0 ridge on the tile diagonal(s)
//         (where hV==hH) and the carve gouges the UNDER strand (verticalOnTop switch by (ix+iy)&1) — the over/under
//         discontinuity. Captured jointly with (A) since the crossing centre sits at a tile and its ridges radiate
//         to the tile edges; a tile-edge band with a modest widening covers the strand-flip ridge neighbourhood.
//     (C) BAND EDGES: the two bands are masked by ctBandMask (feathered smoothstep) over t in
//         [0.55,0.88]/[0.18,0.48]; the mask is C1 (smoothstep) so NOT a hard crease, but the band ENTRY/EXIT where
//         a braid tile suddenly appears IS a C0 onset. We flag the 4 band-edge t-lines thinly.
//     (D) MEDALLION: ctTriquetraHeight has 3-fold sector boundaries (floor(angle/(TAU/3))) and a vesica arc; a
//         3-fold angular crease set + the ring |hypot - 0.55|. Flagged in the medallion disc (pLen<1.1 around u=0.5).
//     (E) RIM LINES at t=0.15/0.52/0.90 (thin smoothstep ridges) — narrow constant-t bands.
//
// PREDICATE = union of (A/B) tile-edge bands (both braid bands, in the (u,t)->lattice coords), (C) band edges,
// (D) medallion sector+arc, (E) rim lines. `band` is in NORMALIZED (u,t) units (same convention as the weave probe).
// Tile-edge distance is converted from lattice units to (u,t) via the per-band Jacobian so `band` means the same
// physical thing everywhere.
//
// VALIDATION (mandatory, gates the adjudication): _ct_predicate.test.ts measures the relief-field C0 kink magnitude
// K(u,t) (max local |2nd-difference| of h) and shows mean K inside the flagged band >> outside, AND that the tileId
// flips across the flagged tile-edge band (sign/label flip check).

import { rOuterCelticTriquetra } from '../../src/geometry/styles';
import { DEFAULT_CELTIC_TRIQUETRA } from '../../src/geometry/types';
import type { StyleOptions } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

export interface CTParams {
  Nx: number; Ny: number; halfW: number; medR: number; medY: number; gap: number;
}
export function ctParams(opts?: Partial<typeof DEFAULT_CELTIC_TRIQUETRA>): CTParams {
  const p = { ...DEFAULT_CELTIC_TRIQUETRA, ...(opts ?? {}) };
  return {
    Nx: Math.max(1, Math.floor(p.ctScaleX + 0.5)),
    Ny: Math.max(2, Math.floor(p.ctRows + 0.5)),
    halfW: p.ctWidth, medR: p.ctMedScale, medY: p.ctMedY, gap: p.ctGap,
  };
}

// Band regions (verbatim from rOuterCelticTriquetra).
const UPPER_Y0 = 0.55, UPPER_Y1 = 0.88;
const LOWER_Y0 = 0.18, LOWER_Y1 = 0.48;
const RIMS = [0.15, 0.52, 0.90];

/** tileId parity replica — only the parity of tx/ty lattice cell matters for the boundary set. */
function frac(x: number): number { return x - Math.floor(x); }

/**
 * Distance (in NORMALIZED (u,t)) of a point to the NEAREST diamond-lattice tile edge of ONE braid band.
 * The band maps (u,t)->pX=u*Nx+offX, pY=vBand*Ny (vBand=(t-y0)/(y1-y0)); q=(pX+pY, -pX+pY). Tile edges are
 * qx∈Z or qy∈Z. Distance to nearest integer in q is min(dqx,dqy) where dq=|frac(q)-round-ish|. We convert that
 * lattice distance back to a (u,t) distance using the local gradient magnitude |∇q| so `band` is physical.
 */
function bandTileEdgeDistUT(
  u: number, t: number, y0: number, y1: number, Nx: number, Ny: number, offX: number,
): number {
  const vBand = (t - y0) / (y1 - y0);
  if (vBand < 0 || vBand > 1) return Infinity;
  const pX = u * Nx + offX;
  const pY = vBand * Ny;
  const qx = pX + pY;
  const qy = -pX + pY;
  const dEdge = (q: number): number => { const f = frac(q); return Math.min(f, 1 - f); };
  const dq = Math.min(dEdge(qx), dEdge(qy));
  // |∂q/∂u| and |∂q/∂t|: ∂pX/∂u=Nx, ∂pY/∂t=Ny/(y1-y0). qx=pX+pY, qy=-pX+pY.
  // For the tighter of the two edges we approximate the (u,t) distance by dq / |∇q|, |∇q| ~ hypot over the
  // dominant coord. Use the max component gradient (conservative small distance ⇒ slightly WIDER band, safe).
  const dpXdu = Nx, dpYdt = Ny / (y1 - y0);
  // |∇qx| = hypot(∂qx/∂u, ∂qx/∂t) = hypot(dpXdu, dpYdt); same magnitude for qy.
  const gradMag = Math.hypot(dpXdu, dpYdt);
  return dq / Math.max(gradMag, 1e-6);
}

/** tileId label at (u,t) in a band (for the flip-across-band validation). -1 if outside band. */
export function bandTileId(
  u: number, t: number, y0: number, y1: number, Nx: number, Ny: number, offX: number,
): number {
  const vBand = (t - y0) / (y1 - y0);
  if (vBand < 0 || vBand > 1) return -1;
  const pX = u * Nx + offX, pY = vBand * Ny;
  const qx = pX + pY, qy = -pX + pY;
  const ix = Math.floor(qx), iy = Math.floor(qy);
  const xodd = (ix & 1) !== 0, yodd = (iy & 1) !== 0;
  if (!yodd) return xodd ? 2 : 0;
  return xodd ? 1 : 2;
}

/**
 * Build the CT braid-crease predicate. `band` in normalized (u,t) units.
 *  - upper + lower braid tile-edge bands (families A/B),
 *  - band-onset edges (family C, thin),
 *  - medallion 3-fold sector + vesica arc (family D),
 *  - rim lines (family E).
 * tileEdgeMul widens the tile-edge band relative to `band` (crossing strand-flip ridges radiate off the edges);
 * default 1.0 keeps it honest — the exclFrac gate will catch over-widening.
 */
export function celticTriquetraCreasePredicate(
  band: number,
  opts?: Partial<typeof DEFAULT_CELTIC_TRIQUETRA>,
  cfg: { tileEdgeMul?: number; medallion?: boolean; rims?: boolean; bandEdges?: boolean } = {},
): (u: number, t: number) => boolean {
  const P = ctParams(opts);
  const NyL = Math.max(2, P.Ny - 2);
  const tileMul = cfg.tileEdgeMul ?? 1.0;
  const doMed = cfg.medallion !== false;
  const doRim = cfg.rims !== false;
  const doBandEdge = cfg.bandEdges !== false;
  const feather = 0.02;

  return (u: number, t: number): boolean => {
    const uu = ((u % 1) + 1) % 1;
    // (A/B) braid tile edges — upper band (offX 0), lower band (offX 0.5, NyL rows)
    if (t >= UPPER_Y0 && t <= UPPER_Y1) {
      if (bandTileEdgeDistUT(uu, t, UPPER_Y0, UPPER_Y1, P.Nx, P.Ny, 0) < band * tileMul) return true;
    }
    if (t >= LOWER_Y0 && t <= LOWER_Y1) {
      if (bandTileEdgeDistUT(uu, t, LOWER_Y0, LOWER_Y1, P.Nx, NyL, 0.5) < band * tileMul) return true;
    }
    // (C) band onset/exit (thin) — where a braid tile suddenly masks in.
    if (doBandEdge) {
      for (const e of [UPPER_Y0, UPPER_Y1, LOWER_Y0, LOWER_Y1]) if (Math.abs(t - e) < band) return true;
    }
    // (E) rim lines
    if (doRim) { for (const rc of RIMS) if (Math.abs(t - rc) < band) return true; }
    // (D) medallion — around u=0.5, t=medY. sector boundaries (3-fold) + vesica arc |hypot-0.55|.
    if (doMed) {
      let du = uu - 0.5; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
      const dv = t - P.medY;
      const px = du / P.medR, py = dv / P.medR;
      const pLen = Math.hypot(px, py);
      if (pLen < 1.15) {
        // sector boundary: angle = atan2(py,-px)+PI; sector edges at k*(TAU/3).
        const angle = Math.atan2(py, -px) + Math.PI;
        const sectPos = angle / (TAU / 3);
        const dSect = Math.min(frac(sectPos), 1 - frac(sectPos)); // dist to sector edge in sector-units
        // convert sector-unit distance to (u,t): dAngle = dSect*(TAU/3); arc radius ~ pLen*medR; dPhysUT ~ dAngle*pLen*medR... use medR scale.
        const dAngle = dSect * (TAU / 3);
        const arcR = Math.max(pLen, 0.05) * P.medR;
        if (dAngle * arcR < band) return true;
        // vesica arc ring: within each rotated sector, dArc=|hypot(prX,prY-0.35)-0.55| in p-units → *medR to (u,t).
        const sector = Math.floor(sectPos);
        const c = Math.cos(sector * (TAU / 3)), s = Math.sin(sector * (TAU / 3));
        const prX = px * c - py * s, prY = px * s + py * c;
        const dArc = Math.abs(Math.hypot(prX, prY - 0.35) - 0.55) * P.medR;
        // The arc itself is a smooth ridge (not C0) but its ENDS/joins are C0; flag a thin arc band.
        if (dArc < band * 0.5) return true;
      }
    }
    void feather;
    return false;
  };
}

/**
 * DIRECT C0-LOCUS predicate for CelticTriquetra, reconstructed from the LIVE style function's own discontinuity
 * structure (NOT the mesh, NOT the extractor's curves). The tile-edge predicate above was REFUTED by validation
 * (c0Recall 0.10): CT's C0 loci are NOT on the diamond tile grid — they are the ribbon-presence smoothstep clamps
 * (`ctRibbonPresence` hard d>=w+aa / d<=w-aa), the `max(hV,hH)` strand ridges, and the `abs(hypot-r)` arc folds,
 * which sweep through (u,t) as curved arcs (extractCelticTriquetra: "braided, u oscillates with t"). Those are
 * exactly the points where the relief field h has a SLOPE JUMP: the local 2nd-difference K refines with exponent
 * p≈1 (C0) rather than p≈2 (smooth). This predicate flags (u,t) where p<pThresh AND the kink is non-trivial, then
 * DILATES by `band` (in u/t) so a facet straddling the crease is caught. It is self-validating (it IS the analytic
 * C0 detector of the live surface) — the exclusion arm reports exclFrac + survival honestly.
 *
 * Precomputes a boolean C0 grid at `gridN`×`gridT` (fast; ~1-2s) then band-dilates at query time via a distance
 * check to the nearest flagged grid cell within `band`.
 */
export function celticTriquetraC0Predicate(
  band: number,
  opts?: Partial<typeof DEFAULT_CELTIC_TRIQUETRA>,
  cfg: { gridN?: number; gridT?: number; pThresh?: number; kMin?: number } = {},
): (u: number, t: number) => boolean {
  const h = ctReliefField(opts);
  const gridN = cfg.gridN ?? 3072;
  const gridT = cfg.gridT ?? 2048;
  const pThresh = cfg.pThresh ?? 1.4;
  const kMin = cfg.kMin ?? 3e-4;
  const dx = 1 / 4096;
  // C0 boolean grid (only where relief present: t in bands+medallion). Marked cells store 1.
  const flag = new Uint8Array(gridN * gridT);
  for (let j = 0; j < gridT; j++) {
    const t = (j + 0.5) / gridT;
    if (t < 0.12 || t > 0.94) continue;
    for (let i = 0; i < gridN; i++) {
      const u = (i + 0.5) / gridN;
      const c = h(u, t);
      const k1 = Math.abs(h(u + dx, t) - 2 * c + h(u - dx, t)) + Math.abs(h(u, t + dx) - 2 * c + h(u, t - dx));
      if (k1 < kMin) continue;
      const k2 = Math.abs(h(u + 2 * dx, t) - 2 * c + h(u - 2 * dx, t)) + Math.abs(h(u, t + 2 * dx) - 2 * c + h(u, t - 2 * dx));
      const p = Math.log2(Math.max(k2, 1e-12) / Math.max(k1, 1e-12));
      if (p < pThresh) flag[j * gridN + i] = 1;
    }
  }
  // band radius in grid cells (u and t use different pitch)
  const ru = Math.max(0, Math.round(band * gridN));
  const rt = Math.max(0, Math.round(band * gridT));
  return (u: number, t: number): boolean => {
    const uu = ((u % 1) + 1) % 1;
    const ci = Math.min(gridN - 1, Math.floor(uu * gridN));
    const cj = Math.min(gridT - 1, Math.max(0, Math.floor(t * gridT)));
    for (let dj = -rt; dj <= rt; dj++) {
      const jj = cj + dj; if (jj < 0 || jj >= gridT) continue;
      for (let di = -ru; di <= ru; di++) {
        const ii = ((ci + di) % gridN + gridN) % gridN;
        if (flag[jj * gridN + ii]) return true;
      }
    }
    return false;
  };
}

/** Live relief field h(u,t) = (r - base)/relief in [0,1]-ish, for the K second-difference validation. */
export function ctReliefField(opts?: Partial<typeof DEFAULT_CELTIC_TRIQUETRA>): (u: number, t: number) => number {
  const p = { ...DEFAULT_CELTIC_TRIQUETRA, ...(opts ?? {}) };
  const O: StyleOptions = { ...p } as StyleOptions;
  const R0 = 40, Hh = 120;
  const relief = p.ctRelief;
  const base = R0 - relief * 0.15;
  return (u: number, t: number): number => {
    const theta = ((u % 1) + 1) % 1 * TAU;
    const r = rOuterCelticTriquetra(theta, t * Hh, R0, Hh, O);
    return (r - base) / Math.max(relief, 1e-6);
  };
}
