// _gf_gothicFlankLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/). E-2026-07-04-GF-GOTHIC.
//
// Generate explicit FLANK-STRIP points for GothicArches' near-vertical rib crests. The GD-GOTHIC diagnosis proved
// 93.5% of the worst true-3D facets are on the rib crest/FLANK (steep u-wall: gradU_arc p90 3.46; steep t-wall:
// gradT p90 3.15), and chordTol is BLIND there (radial chord-sag is tiny along a near-vertical wall) so chordSteiner
// stalls at ~0.088. The recon (_gf_gothic_recon) proved the flank is flank-pitch-RESPONSIVE (u-flank crest->valley
// true-3D chord 0.968@N1 -> 0.0187@N16, curved-surface quadratic; crosses 0.012 at pitch ~0.126mm-arc, ~N20).
//
// DESIGN: reuse the per-row crest scan (extractGothicCrestSegments' crestUt already samples crests at 640 rows). For
// each crest sample (u_c, t), walk BOTH u-flanks toward the adjacent radial valley and emit points at a fine EXPLICIT
// u-pitch (sized in mm-arc, NOT chord-sag), and walk BOTH t-flanks toward the adjacent valley in z and emit points at
// a t-pitch. These are injected as PINNED points (NOT constraint segments) so the CDT anchors flat facets ONTO the
// curved flank WITHOUT adding crossing constraints (which capped Track-B recovery at 65.7%). The crest segments stay
// the only locked edges (zero serration). This is the "density exactly where chordTol is blind" lever.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface FlankPitchOpts {
  /** target u-flank pitch in mm of AZIMUTHAL ARC (recon: ~0.126 for chord 0.012). */ uPitchMmArc: number;
  /** target t-flank pitch in mm of Z (recon: t-flank falls slower; ~0.10 for chord 0.012). */ tPitchMmZ: number;
  /** mean radius for u-arc<->du conversion (Gothic Rt~50/Rb~40 => ~48). */ rMean: number;
  /** wall height mm (for t<->z). */ H: number;
  /** max half-bay window in u to search for the valley (bay pitch 1/N; default half-bay*1.2). */ maxDu: number;
  /** max z-window (t units) to search for the t-valley. */ maxDt: number;
  /** only lay a u-flank where |dr/du| exceeds this (mm/rad) at the crest — skip flat crests. */ minGradU: number;
  /** only lay a t-flank where |dr/dz| exceeds this (mm/mmz). */ minGradT: number;
}

/** Find the adjacent VALLEY on one side of a u-crest (walk +/- u at fixed t; stop when radius climbs again). */
function findValleyU(rA: AnalyticRadiusFn, uC: number, t: number, dir: number, maxDu: number, H: number): number {
  const z = t * H; const N = 256; let uPrev = uC, rPrev = rA(TAU * (uC - Math.floor(uC)), z);
  for (let i = 1; i <= N; i++) {
    const u = uC + dir * maxDu * (i / N);
    const r = rA(TAU * (u - Math.floor(u)), z);
    if (r > rPrev + 1e-9) return uPrev;
    uPrev = u; rPrev = r;
  }
  return uC + dir * maxDu;
}
/** Find the adjacent valley on one side of a t-crest (walk +/- t at fixed u). */
function findValleyT(rA: AnalyticRadiusFn, u: number, tC: number, dir: number, maxDt: number, H: number): number {
  const th = TAU * (u - Math.floor(u)); const N = 256; let tPrev = tC, rPrev = rA(th, tC * H);
  for (let i = 1; i <= N; i++) {
    const t = Math.max(0, Math.min(1, tC + dir * maxDt * (i / N)));
    const r = rA(th, t * H);
    if (r > rPrev + 1e-9) return tPrev;
    tPrev = t; rPrev = r;
  }
  return Math.max(0, Math.min(1, tC + dir * maxDt));
}

export interface FlankPointsResult {
  /** flat (u,t) flank points to inject as PINNED (deduped on a fine grid). */ points: number[];
  nUFlank: number; nTFlank: number; nCrestUsed: number;
}

/**
 * Emit pinned flank points around each crest sample. u-flank points march from the crest to the adjacent valley at
 * uPitchMmArc; t-flank points march in z at tPitchMmZ. Deduped on a fine (u,t) grid (kernel dedupeEps ~1e-7). The
 * crest point itself is NOT re-emitted here (it is already injected+locked by the crest-segment extraction).
 */
export function buildFlankPoints(
  rA: AnalyticRadiusFn, crestUt: number[], opts: FlankPitchOpts,
): FlankPointsResult {
  const { uPitchMmArc, tPitchMmZ, rMean, H, maxDu, maxDt, minGradU, minGradT } = opts;
  // dedupe grid
  const cellU = 1 / 262144, cellT = 1 / 262144; // ~fine; kernel dedupe merges anything closer
  const nU = Math.round(1 / cellU);
  const seen = new Set<number>();
  const points: number[] = [];
  const add = (u: number, t: number): boolean => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const gu = ((Math.round(uu / cellU) % nU) + nU) % nU;
    const gt = Math.round(tc / cellT);
    const key = gu * 16_777_216 + gt;
    if (seen.has(key)) return false; seen.add(key);
    points.push(uu, tc); return true;
  };
  const duGrad = 1 / 8192, dtGrad = 1 / 8192;
  let nUFlank = 0, nTFlank = 0, nCrestUsed = 0;
  // u-pitch in du: pitch_arc / (rMean * TAU) ; t-pitch in dt: pitch_z / H
  const duPitch = uPitchMmArc / (rMean * TAU);
  const dtPitch = tPitchMmZ / H;

  for (let i = 0; i + 1 < crestUt.length; i += 2) {
    const uC = crestUt[i], t = crestUt[i + 1];
    const z = t * H;
    const gU = Math.abs(rA(TAU * ((uC + duGrad) - Math.floor(uC + duGrad)), z) - rA(TAU * ((uC - duGrad) - Math.floor(uC - duGrad)), z)) / (2 * duGrad * TAU);
    const tzHi = Math.min(1, t + dtGrad) * H, tzLo = Math.max(0, t - dtGrad) * H;
    const gT = Math.abs(rA(TAU * (uC - Math.floor(uC)), tzHi) - rA(TAU * (uC - Math.floor(uC)), tzLo)) / Math.max(1e-9, tzHi - tzLo);
    let used = false;
    // U-FLANK: both sides
    if (gU >= minGradU) {
      for (const dir of [1, -1]) {
        const uV = findValleyU(rA, uC, t, dir, maxDu, H);
        const span = Math.abs(uV - uC);
        if (span < duPitch * 0.5) continue; // flank shorter than one pitch => nothing to add
        const nSteps = Math.max(1, Math.round(span / duPitch));
        for (let k = 1; k <= nSteps; k++) { // start at k=1 (skip crest); include valley (k=nSteps)
          const u = uC + dir * span * (k / nSteps);
          if (add(u, t)) nUFlank++;
        }
        used = true;
      }
    }
    // T-FLANK: both sides
    if (gT >= minGradT) {
      for (const dir of [1, -1]) {
        const tV = findValleyT(rA, uC, t, dir, maxDt, H);
        const span = Math.abs(tV - t);
        if (span < dtPitch * 0.5) continue;
        const nSteps = Math.max(1, Math.round(span / dtPitch));
        for (let k = 1; k <= nSteps; k++) {
          const tt = t + (tV - t) * (k / nSteps);
          if (add(uC, tt)) nTFlank++;
        }
        used = true;
      }
    }
    if (used) nCrestUsed++;
  }
  return { points, nUFlank, nTFlank, nCrestUsed };
}
