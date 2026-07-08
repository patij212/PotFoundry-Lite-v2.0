// _ds_conformRef.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-DS-CONFORMING-RULER. The tread-CONFORMING OPEN-SURFACE reference for DragonScales, ROUND 3.
//
// Two prior whole-mesh instruments are REFUTED for the DragonScales doubled-valued tread:
//   - the RADIAL twin S(θ,z)=(rA·cosθ, rA·sinθ, z) is one-sided-safe + fine-on-sheet but TREAD-BLIND (a single
//     radius per (θ,z) ⇒ the riser face is not on the surface ⇒ ~141k designed-riser facets read as "outliers");
//   - the FILLED-ANNULUS step twin (`buildStepReference`) represents the tread but FAILED 1b (coarse-on-sheet,
//     own residual 0.0116 > tol ⇒ inflates smooth-body verdicts) AND 1d (its FILLED disk at the ring z catches
//     off-surface points pushed radially OUTWARD ⇒ understates up to 0.116mm ⇒ can HIDE a genuine mesh gap).
//
// This reference is the V11f-prescribed cure: an OPEN surface =
//   (sheet) the radial-twin DENSE grid (proven fine, reused verbatim — same per-(θ,z) radial lift) on z∈[0,H],
//           but EXCLUDING a THIN z-annulus [z_k − wallEps, z_k + wallEps] around every ring z_k. Reusing the
//           radial-twin sheet density is what fixes 1b; keeping the excluded band THIN (wallEps ~ tol) is what
//           keeps sheet coverage to within wallEps of every ring ⇒ an off-ring off-surface probe scores against
//           the SHEET, not a hovering tread disk (fixes 1d).
//   (riser) per ring z_k a skirt-below ring (z_k − wallEps, radius rA(θ, z_k − wallEps)) + a skirt-above ring
//           (z_k + wallEps, radius rA(θ, z_k + wallEps)) connected by ONE near-vertical quad-strip per θ interval
//           — the riser FACE, as an OPEN wall. NO interior radial fill (the step-twin defect): the wall occupies
//           only |z − z_k| < wallEps and spans radius rIn→rOut vertically, so it cannot reach out past the
//           designed wall to catch an off-wall probe.
//
// Anchored to the analytic rA in f64 (rIn/rOut evaluated at z_k ∓ wallEps). COPIES nothing from src/. No kernel edits.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { RefMesh, RefLocator } from './_sharp3dRef';
import type { StepRing } from './_sharp3dRef';

const TAU = 2 * Math.PI;

export interface ConformOpts {
  /** θ columns for the sheet + wall rings (periodic). */
  nTheta: number;
  /** interior sheet z-rows per open band between consecutive rings (and the two end bands). */
  nZperBand: number;
  /** half-thickness (mm) of the excluded near-ring band = where the riser wall lives. Small (~tol). */
  wallEps: number;
}

/**
 * Build the OPEN tread-conforming reference. Levels are ordered in z:
 *   sheet rows on the open bands (each at its own z, radius rA(θ,z)); then at each ring z_k a skirt-below level
 *   (z_k − wallEps) and a skirt-above level (z_k + wallEps). Strips connect ADJACENT sheet levels (sheet band)
 *   and the skirt-below → skirt-above pair (the RISER wall). There is NO strip across the excluded [z_k−wallEps,
 *   z_k+wallEps] gap other than the wall itself, and NO radial fill — the surface is open at the tread but the
 *   wall is the only geometry there, spanning the full radial jump vertically.
 */
export function buildConformingReference(rA: AnalyticRadiusFn, H: number, rings: StepRing[], opts: ConformOpts): RefMesh {
  const { nTheta, nZperBand, wallEps } = opts;
  const evenTh = (): Float64Array => { const a = new Float64Array(nTheta); for (let j = 0; j < nTheta; j++) a[j] = TAU * (j / nTheta); return a; };
  type Level = { z: number; rz: number; join: 'strip' | 'break'; kind: 'sheet' | 'skirtBelow' | 'skirtAbove' };
  // join='strip' => connect this level to the NEXT one with a merge-strip; 'break' => no strip to next (open gap).
  const levels: Level[] = [];
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = evenTh();
  // bottom boundary sheet row
  levels.push({ z: 0, rz: wallEps, join: 'strip', kind: 'sheet' });
  let cursor = 0;
  const pushSheetBand = (z0: number, z1: number, n: number): void => {
    for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); levels.push({ z, rz: z, join: 'strip', kind: 'sheet' }); }
  };
  for (const ring of sorted) {
    // sheet band cursor → (ring.z − wallEps). The last sheet row of the band sits at ring.z − wallEps (skirt-below).
    pushSheetBand(cursor, ring.z - wallEps, nZperBand);
    // skirt-below: last sheet-side row, at z_k − wallEps, radius one-sided below the jump. It STRIPS to the
    // skirt-above (that strip IS the riser wall).
    levels.push({ z: ring.z - wallEps, rz: ring.z - wallEps, join: 'strip', kind: 'skirtBelow' });
    // skirt-above: at z_k + wallEps, radius one-sided above the jump. BREAK to the next (the sheet band above
    // starts fresh at z_k + wallEps and is contiguous, so actually strip to continue the sheet).
    levels.push({ z: ring.z + wallEps, rz: ring.z + wallEps, join: 'strip', kind: 'skirtAbove' });
    cursor = ring.z + wallEps;
  }
  pushSheetBand(cursor, H, nZperBand);
  levels.push({ z: H, rz: H - wallEps, join: 'break', kind: 'sheet' });

  const nLev = levels.length;
  const rowStart: number[] = [0];
  for (let l = 0; l < nLev; l++) rowStart.push(rowStart[l] + nTheta);
  const total = rowStart[nLev];
  const xyz = new Float64Array(total * 3);
  for (let l = 0; l < nLev; l++) {
    const { z, rz } = levels[l]; const base = rowStart[l];
    for (let j = 0; j < nTheta; j++) {
      const t = th[j]; const r = rA(t, rz); const o = (base + j) * 3;
      xyz[o] = r * Math.cos(t); xyz[o + 1] = r * Math.sin(t); xyz[o + 2] = z;
    }
  }
  const idx: number[] = [];
  for (let l = 0; l + 1 < nLev; l++) {
    if (levels[l].join !== 'strip') continue;
    const tb = rowStart[l], bb = rowStart[l + 1];
    for (let c = 0; c < nTheta; c++) {
      const cn = (c + 1) % nTheta;
      const a = tb + c, an = tb + cn, b = bb + c, bn = bb + cn;
      idx.push(a, b, bn); idx.push(a, bn, an);
    }
  }
  return { xyz, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

/**
 * WALL-ONLY reference: JUST the near-vertical riser strips (skirt-below → skirt-above), NO sheet. Tiny
 * (nRings × nTheta × 2 tris). Composed with the radial twin via `compositeLocator` to make the OPEN-surface
 * conforming ruler cheaply: the radial twin (proven fast, fine-on-sheet) supplies the sheet; this supplies the
 * riser. `min(radial, wall)` is the distance to the union = the conforming open surface.
 */
export function buildWallOnlyReference(rA: AnalyticRadiusFn, rings: StepRing[], nTheta: number, wallEps: number): RefMesh {
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const nLev = sorted.length * 2; // skirtBelow + skirtAbove per ring
  const xyz = new Float64Array(nLev * nTheta * 3);
  let lv = 0;
  const ringOfLevel: number[] = [];
  for (const ring of sorted) {
    for (const [z, rz] of [[ring.z - wallEps, ring.z - wallEps], [ring.z + wallEps, ring.z + wallEps]] as const) {
      const base = lv * nTheta;
      for (let j = 0; j < nTheta; j++) { const th = TAU * (j / nTheta); const r = rA(th, rz); const o = (base + j) * 3; xyz[o] = r * Math.cos(th); xyz[o + 1] = r * Math.sin(th); xyz[o + 2] = z; }
      ringOfLevel.push(lv); lv++;
    }
  }
  // strip ONLY skirtBelow(2k) → skirtAbove(2k+1) for each ring (the riser); NO strip across rings.
  const idx: number[] = [];
  for (let r = 0; r < sorted.length; r++) {
    const tb = (2 * r) * nTheta, bb = (2 * r + 1) * nTheta;
    for (let c = 0; c < nTheta; c++) { const cn = (c + 1) % nTheta; const a = tb + c, an = tb + cn, b = bb + c, bn = bb + cn; idx.push(a, b, bn); idx.push(a, bn, an); }
  }
  return { xyz, idx: Uint32Array.from(idx), nV: nLev * nTheta, nF: idx.length / 3 };
}

/**
 * Composite OPEN-surface conforming ruler = min(radial-sheet twin, riser wall-only). Distance to the union.
 *
 * PERF: the wall-only ref is a SPARSE set of thin strips at the ring z's. Querying it from a point FAR from every
 * ring makes the expanding-shell BVH search expand across the whole z-range before finding any wall tri (~2ms/query,
 * vs 175µs for the radial twin). But a point far from all rings has a large true wall distance ⇒ the SHEET always
 * wins the min there. So we z-GATE the wall query: only consult the wall BVH when the point's z is within `wallZBand`
 * of some ring z; otherwise wallDist = +∞ (the sheet is the answer). This is EXACT (never changes the min) as long as
 * wallZBand ≥ the largest wall-distance a point could have while still being the nearest-to-wall — the wall spans
 * radius rIn→rOut over z∈[z_k∓wallEps], so any point whose wall-distance could beat the sheet is within ~(jump+tol) of
 * z_k; wallZBand=3mm ≫ the ~1.2mm max jump ⇒ safe. `ringZs` sorted ascending.
 */
export function compositeLocator(sheetLoc: RefLocator, wallLoc: RefLocator, ringZs: number[], wallZBand = 3.0): RefLocator {
  const zs = [...ringZs].sort((a, b) => a - b);
  const nearRingZ = (z: number): boolean => { for (const rz of zs) { if (Math.abs(z - rz) <= wallZBand) return true; if (rz - z > wallZBand) break; } return false; };
  return {
    dist: (x, y, z) => { const s = sheetLoc.dist(x, y, z); if (!nearRingZ(z)) return s; return Math.min(s, wallLoc.dist(x, y, z)); },
    distTri: (x, y, z) => { const s = sheetLoc.distTri(x, y, z); if (!nearRingZ(z)) return s; const w = wallLoc.distTri(x, y, z); return s.dist <= w.dist ? s : { dist: w.dist, tri: -1 - w.tri }; },
    bruteDist: (x, y, z) => { const s = sheetLoc.bruteDist(x, y, z); if (!nearRingZ(z)) return s; return Math.min(s, wallLoc.bruteDist(x, y, z)); },
  };
}

/**
 * Riser wall anchor points (the analytic wall surface) for the 1a construction audit + 1c wall-residual: at each
 * ring z_k, points on the near-vertical riser at fraction s∈[0,1] between (rIn, z_k−wallEps) and (rOut, z_k+wallEps).
 */
export function riserWallPoints(
  rA: AnalyticRadiusFn, rings: StepRing[], wallEps: number, nTheta: number, nS: number,
): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  for (const ring of rings) {
    for (let it = 0; it < nTheta; it++) {
      const th = TAU * (it / nTheta);
      const rIn = rA(th, ring.z - wallEps), rOut = rA(th, ring.z + wallEps);
      const zIn = ring.z - wallEps, zOut = ring.z + wallEps;
      for (let is = 0; is <= nS; is++) {
        const s = is / nS;
        const r = (1 - s) * rIn + s * rOut; const z = (1 - s) * zIn + s * zOut;
        pts.push([r * Math.cos(th), r * Math.sin(th), z]);
      }
    }
  }
  return pts;
}
