// _pf_geostarPatchLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// Applies the PROVEN perfect-mesher brute kernel (topology: extract/seed/guard/lift from _pf_perfectMesherLib;
// honest brute-driven refine from _pf_perfectMesherBruteLib) to GeometricStar — the OTHER count-unstable cusp style
// (chevron strapwork, per-row u-crest count oscillates 0→7→16→32→8→0 per tile, RECON-confirmed 2026-07-05).
//
// The ONLY new thing here is makeGeoStarPatch: it produces the SAME PatchDef shape the Gothic kernel consumes, with
// the GeometricStar analytic radius fn and a patch window centred on a HIGH-RELIEF strap band (t≈0.08, RECON: amp
// ~1.7mm, 16-32 crests) spanning a few u-bays. Everything downstream is style-agnostic (nearest-neighbour crest
// linking + planarizeMM X-crossing split — COUNT-AGNOSTIC, unlike the fixed-nSlot doubled-crest column primitive
// that floored GeoStar at 26mm in E-2026-07-04-DCGS). This is the whole point: the FGJ+CDT-lock+brute-refine kernel
// does NOT pin vanished straps — it just births/dies chains, so a count-unstable field is admissible.
//
// ISOLATION: NEW file. Imports _pf_perfectMesherLib (buildRadiusFn via labkit) READ-ONLY. NO src/ edit.
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { rowCrests, colCrests, type PatchDef } from './_pf_perfectMesherLib';

const TAU = 2 * Math.PI;

// Find a strap junction: the strongest strap-apex (an X where a u-family strap crosses a t-family strap) in a
// high-relief band. GeoStar chevrons are finite-width kinks; the strap network X's are the count-unstable junctions.
function findStrapJunction(rA: (th: number, z: number) => number, H: number, rMean: number, tCenter: number): { u: number; t: number } {
  let best = { u: 0.02, t: tCenter, amp: -1 };
  for (let ti = 0; ti < 40; ti++) {
    const t = tCenter - 0.03 + 0.06 * (ti / 39);
    const uc = rowCrests(rA, t, H, 0, 0.2, 4000, 0.03);
    for (const u of uc) {
      const tc = colCrests(rA, u, H, Math.max(0.001, t - 0.05), Math.min(0.999, t + 0.05), 2000, 0.03);
      for (const tt of tc) if (Math.abs(tt - t) < 0.006) { const amp = rA(TAU * u, t * H) - rMean; if (amp > best.amp) best = { u, t, amp }; }
    }
  }
  // fallback: if no clean X in the band, use the highest-amplitude crest in the band centre row.
  if (best.amp < 0) {
    const uc = rowCrests(rA, tCenter, H, 0, 0.2, 4000, 0.03);
    let bu = 0.02, ba = -1;
    for (const u of uc) { const a = rA(TAU * u, tCenter * H) - rMean; if (a > ba) { ba = a; bu = u; } }
    best = { u: bu, t: tCenter, amp: ba };
  }
  return { u: best.u, t: best.t };
}

function countRowCrests(rA: (th: number, z: number) => number, t: number, H: number): number {
  return rowCrests(rA, t, H, 0, 1, 8192, 0.03).length;
}

// makeGeoStarPatch — SAME shape as makeGothicPatch. bays = # u-bays in the window; zBandMm = z-band height.
// tCenter defaults to a high-relief strap band (RECON: t≈0.08, amp ~1.7mm; the tile boundary at t=0.25 kills relief).
export function makeGeoStarPatch(bays: number, zBandMm: number, tCenter = 0.08): PatchDef {
  const dims: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
  const H = dims.H;
  const rMean = 45;
  const arcPerU = TAU * rMean;
  const rA = buildRadiusFn('GeometricStar' as StyleId, {}, dims);
  const j = findStrapJunction(rA, H, rMean, tCenter);
  // bay width in u: use the strongest crest count in the band (max over a small t-sweep so we don't read a dead row).
  let nCr = 0;
  for (let k = -3; k <= 3; k++) { const t = j.t + k * 0.01; if (t > 0.01 && t < 0.99) nCr = Math.max(nCr, countRowCrests(rA, t, H)); }
  const bayDu = nCr > 0 ? 1 / nCr : 1 / 32;
  const halfU = (bays / 2) * bayDu;
  const halfT = (zBandMm / 2) / H;
  const uLo = j.u - halfU, uHi = j.u + halfU;
  const tLo = Math.max(0.01, j.t - halfT), tHi = Math.min(0.99, j.t + halfT);
  return { rA, H, rMean, arcPerU, uLo, uHi, tLo, tHi };
}
