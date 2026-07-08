// _ckFieldLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-CK-CLOSE. CelticKnot is RE-CLASSIFIED CLIFF-CLASS (§V11r-4: Newton NON-monotone UP 58,403→70,143 at
// converged density levels, worstTrue PINNED ~0.295, slopeMed rising 0.28→3.06, slopeP90 pinned ~16; bimodal — 37%
// steep crossing tail + 63% flat bulk). This lib derives the CK C0 cliff loci CLOSED-FORM from rOuterCelticKnot
// (src/geometry/styles.ts) and emits the DOUBLED flanking picket pair (the PROVEN Gyroid/BasketWeave mechanism) as
// (u,t) constraint polylines for the conforming re-mesh.
//
// FIELD ANALYSIS (from the WGSL-parity CPU port rOuterCelticKnot, defaults ckScale=3/ckStrands=3/ckWidth=0.15/
// ckTwist=0/ckRelief=2). Let u = thetaNorm ∈ [0,1), t ∈ [0,1]. The relief h(u,t) = r − r0 has THREE C0 families:
//
//  (A) COLUMN boundaries: columnId = floor(u·numColumns) jumps at u = j/numColumns (j integer). basePhase =
//      columnId·π·0.333 STEPS ⇒ the whole strand pattern phase-shifts across the boundary. VERTICAL walls u = j/nCol.
//
//  (B) STRAND EDGES (background transition): the closest-strand distance minD = min_i |localU − x_i(t)| where
//      localU = (frac(u·nCol) − 0.5)·2 and x_i(t) = amp·sin(v·frq + phase_i), v = t·tightness·2π·3. When minD crosses
//      strandW = ckWidth·0.15 the relief DROPS to the background r0 − relief·0.3 (a ~0.6mm step, roundness-smoothed
//      to zero only AT the edge). These are the strand-BORDER curves localU = x_i(t) ± strandW, mapped back to u.
//
//  (C) OCCLUSION switches (the over/under tail — the §V11r-4 steep 37%): where two strands are BOTH within strandW
//      and their Z-buffer heights zHeight_i = sin(arg_i·weaveDensity) CROSS, the winning strand (bestZ) flips ⇒
//      finalDist jumps ⇒ h STEPS by the full over/under relief (~0.3-0.6mm, the pinned worst). Locus: the strand-
//      CENTERLINE crossings x_i(t) = x_k(t) that are the braid over/under points. These are the near-VERTICAL walls.
//
// The DOUBLED contour = a picket a small (u,t)-offset δ on EACH side of each cliff locus so the conforming mesher
// lands an edge on each plateau/floor side; the facet spanning them IS the wall (chord-sag → chordTolMm lever).
//
// ISOLATION: NEW file. Imports labkit types + styles READ-ONLY. NO src/ edit.
import type { AnalyticRadiusFn } from './labkit';
import { rOuterCelticKnot } from '../../src/geometry/styles';
import { DEFAULT_CELTIC_KNOT } from '../../src/geometry/types';
import type { StyleOptions } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

export interface CKParams {
  numColumns: number; strandW: number; relief: number; numStrands: number;
  isOddStrands: boolean; weaveDensity: number; tightness: number; amp: number; frq: number;
  phaseStep: number;
}
// Reproduce the exact derived constants of rOuterCelticKnot at given opts (defaults if omitted).
export function ckParams(opts?: Partial<typeof DEFAULT_CELTIC_KNOT>): CKParams {
  const p = { ...DEFAULT_CELTIC_KNOT, ...(opts ?? {}) };
  const numColumns = Math.max(1.0, Math.floor(p.ckScale));
  const strandW = p.ckWidth * 0.15;
  const tightness = Math.max(0.5, p.ckTwist + 0.5);
  const numStrandsF = Math.max(2.0, Math.min(8.0, Math.floor(p.ckStrands + 0.5)));
  const numStrands = Math.trunc(numStrandsF);
  return {
    numColumns, strandW, relief: p.ckRelief, numStrands,
    isOddStrands: (numStrands % 2) !== 0, weaveDensity: Math.max(1.0, numStrandsF - 1.0),
    tightness, amp: 0.4, frq: 1.0, phaseStep: TAU / numStrandsF,
  };
}

/** Live relief field h(u,t) = r − r0 (mm) from rOuterCelticKnot. u = thetaNorm ∈ [0,1). */
export function ckReliefField(opts?: Partial<typeof DEFAULT_CELTIC_KNOT>): (u: number, t: number) => number {
  const p = { ...DEFAULT_CELTIC_KNOT, ...(opts ?? {}) };
  const O: StyleOptions = { ...p } as StyleOptions;
  const R0 = 40, H = 120;
  return (u: number, t: number): number => {
    const theta = (((u % 1) + 1) % 1) * TAU;
    return rOuterCelticKnot(theta, t * H, R0, H, O) - R0;
  };
}

// ── strand geometry helpers (the closed-form loci machinery) ─────────────────────────────────────────────────────
// v(t) = t·tightness·2π·3 ; per-column j, per-strand i:  arg = v + basePhase_j + phaseStep·i ; x = amp·sin(arg).
export function vOf(p: CKParams, t: number): number { return t * p.tightness * TAU * 3.0; }
export function basePhase(j: number): number { return j * Math.PI * 0.333; }
export function strandX(p: CKParams, j: number, i: number, t: number): number {
  return p.amp * Math.sin(vOf(p, t) + basePhase(j) + p.phaseStep * i);
}
export function strandZ(p: CKParams, j: number, i: number, t: number): number {
  const arg = vOf(p, t) + basePhase(j) + p.phaseStep * i;
  return p.isOddStrands ? Math.sin(arg * p.weaveDensity) : Math.cos(arg * p.weaveDensity);
}
// map a within-column localU∈[-1,1] + column index j → global u∈[0,1). localU = (fracCol−0.5)·2 ⇒ fracCol = localU/2+0.5.
export function localUToU(p: CKParams, j: number, localU: number): number {
  const fracCol = localU / 2 + 0.5;
  return ((j + fracCol) / p.numColumns % 1 + 1) % 1;
}

export interface Contour { pts: Array<[number, number]>; }

// ── (A) COLUMN wall lines: u = j/numColumns, one vertical polyline per interior boundary ────────────────────────
export function columnWallLines(p: CKParams, nT = 240): Array<{ j: number; u: number; pts: Array<[number, number]> }> {
  const lines: Array<{ j: number; u: number; pts: Array<[number, number]> }> = [];
  for (let j = 0; j < p.numColumns; j++) {
    const u = j / p.numColumns;
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= nT; k++) pts.push([u, k / nT]);
    lines.push({ j, u, pts });
  }
  return lines;
}

// ── (B)+(C) STRAND loci: for each column j, trace each strand centerline x_i(t) (mapped to u) AND its ±strandW
// borders across t. The strand CENTERLINES carry the occlusion switches (C) at strand crossings; the ±strandW
// BORDERS carry the background edges (B). We sample over t and split each into [0,1)-continuous runs (localU wraps
// out of [-1,1] where the strand leaves the column — those points are OFF the visible pattern and skipped). ──────
function traceStrandCurve(
  p: CKParams, j: number, i: number, borderSign: -1 | 0 | 1, nT: number,
): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [[]];
  for (let k = 0; k <= nT; k++) {
    const t = k / nT;
    const localU = strandX(p, j, i, t) + borderSign * p.strandW;
    // strand only exists within the column: |localU| ≤ 1 (plus a small margin for the border)
    if (Math.abs(localU) > 1.02) { if (runs[runs.length - 1].length > 0) runs.push([]); continue; }
    const u = localUToU(p, j, localU);
    const run = runs[runs.length - 1];
    if (run.length > 0 && Math.abs(u - run[run.length - 1][0]) > 0.5) runs.push([]); // u-wrap → new run
    runs[runs.length - 1].push([u, t]);
  }
  return runs.filter((r) => r.length >= 2);
}
export function strandCenterLines(p: CKParams, nT = 400): Array<{ j: number; i: number; pts: Array<[number, number]> }> {
  const out: Array<{ j: number; i: number; pts: Array<[number, number]> }> = [];
  for (let j = 0; j < p.numColumns; j++) for (let i = 0; i < p.numStrands; i++) {
    for (const r of traceStrandCurve(p, j, i, 0, nT)) out.push({ j, i, pts: r });
  }
  return out;
}
export function strandBorderLines(p: CKParams, nT = 400): Array<{ j: number; i: number; sign: number; pts: Array<[number, number]> }> {
  const out: Array<{ j: number; i: number; sign: number; pts: Array<[number, number]> }> = [];
  for (let j = 0; j < p.numColumns; j++) for (let i = 0; i < p.numStrands; i++) {
    for (const sign of [-1, 1] as const) {
      for (const r of traceStrandCurve(p, j, i, sign, nT)) out.push({ j, i, sign, pts: r });
    }
  }
  return out;
}

// ── DOUBLED PICKET generator ─────────────────────────────────────────────────────────────────────────────────────
// For each cliff locus polyline, emit an OFFSET ladder ± δ in the wall-NORMAL direction. Column walls are const-u ⇒
// offset in u. Strand curves are NEARLY const-t is FALSE (they sweep u fast with t) — their normal is dominated by
// the u-direction (dx/dt is bounded, du/dt from the strand can be large), so we offset in u (a u-picket fan across
// the strand border/crossing). δ chosen so the 3D offset frames the near-vertical relief. Signed ladder mirrored so
// both plateau/floor sides are caught regardless of orientation. Decimate along the wall to a 3D arc-length stepMm.
export interface DoubledOpts { offsetsU: number[]; stepMm: number; includeColumns: boolean; includeCenters: boolean; includeBorders: boolean; }
export const CK_LADDER_U = [0, 0.0004, 0.0009, 0.0015, 0.0022, 0.0030]; // ramp + boundary + floor lip (u-fan)
export const CK_FINE_LADDER_U = [0, 0.0004, 0.0008, 0.0012, 0.0016, 0.0022, 0.0028, 0.0034];

export function ckDoubledPickets(
  p: CKParams, rA: AnalyticRadiusFn, H: number, opts: DoubledOpts,
): { contours: Contour[]; nColumn: number; nCenter: number; nBorder: number } {
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const decimate = (pts: Array<[number, number]>): Array<[number, number]> => {
    if (pts.length < 2) return pts;
    const kept: Array<[number, number]> = [pts[0]];
    let [lx, ly, lz] = lift(pts[0][0], pts[0][1]);
    for (let idx = 1; idx < pts.length - 1; idx++) {
      const [x, y, z] = lift(pts[idx][0], pts[idx][1]);
      if (Math.hypot(x - lx, y - ly, z - lz) >= opts.stepMm) { kept.push(pts[idx]); lx = x; ly = y; lz = z; }
    }
    kept.push(pts[pts.length - 1]);
    return kept;
  };
  const signedLadder = Array.from(new Set(opts.offsetsU.flatMap((o) => [o, -o]))).sort((a, b) => a - b);
  const out: Contour[] = [];
  let nColumn = 0, nCenter = 0, nBorder = 0;
  if (opts.includeColumns) {
    for (const L of columnWallLines(p)) {
      for (const off of signedLadder) {
        const line = L.pts.map(([u, t]) => [((u + off) % 1 + 1) % 1, t] as [number, number]);
        const dec = decimate(line); if (dec.length >= 2) { out.push({ pts: dec }); nColumn++; }
      }
    }
  }
  if (opts.includeCenters) {
    for (const L of strandCenterLines(p)) {
      for (const off of signedLadder) {
        const line = L.pts.map(([u, t]) => [((u + off) % 1 + 1) % 1, t] as [number, number]);
        const dec = decimate(line); if (dec.length >= 2) { out.push({ pts: dec }); nCenter++; }
      }
    }
  }
  if (opts.includeBorders) {
    for (const L of strandBorderLines(p)) {
      for (const off of signedLadder) {
        const line = L.pts.map(([u, t]) => [((u + off) % 1 + 1) % 1, t] as [number, number]);
        const dec = decimate(line); if (dec.length >= 2) { out.push({ pts: dec }); nBorder++; }
      }
    }
  }
  return { contours: out, nColumn, nCenter, nBorder };
}

// ── placement validation: for each locus family, sample ±ε across the centreline and confirm the relief JUMPS
// (C0 step) there ⇒ the derived line sits ON the cliff (the STEP analog of sub-0.01). Reports max step-jump per
// family + the fraction of samples that actually jump (a curve that mostly does NOT jump is NOT a cliff). ─────────
export interface StepStat { family: string; maxStepJump: number; jumpFrac: number; nSample: number; }
export function lociOnCliff(p: CKParams, epsU = 6e-4, nPer = 40): StepStat[] {
  const h = ckReliefField();
  const stat = (family: string, lines: Array<{ pts: Array<[number, number]> }>): StepStat => {
    let maxJump = 0, nJump = 0, n = 0;
    for (const L of lines) {
      for (let s = 0; s < nPer; s++) {
        const [u, t] = L.pts[Math.floor((s / nPer) * L.pts.length)];
        const jump = Math.abs(h(u + epsU, t) - h(u - epsU, t));
        if (jump > maxJump) maxJump = jump;
        if (jump > 0.05) nJump++;
        n++;
      }
    }
    return { family, maxStepJump: +maxJump.toFixed(4), jumpFrac: n ? +(nJump / n).toFixed(3) : 0, nSample: n };
  };
  return [
    stat('column', columnWallLines(p)),
    stat('center', strandCenterLines(p)),
    stat('border', strandBorderLines(p)),
  ];
}

// ── polylines → injectedPoints + constraintEdges (kernel constraint format) ──────────────────────────────────────
export function contoursToConstraints(contours: Contour[]): { injectedPoints: number[]; constraintEdges: number[] } {
  const injectedPoints: number[] = []; const constraintEdges: number[] = [];
  for (const cont of contours) {
    const base = injectedPoints.length / 2;
    for (const [u, t] of cont.pts) injectedPoints.push(u, t);
    for (let i = 0; i < cont.pts.length - 1; i++) constraintEdges.push(base + i, base + i + 1);
  }
  return { injectedPoints, constraintEdges };
}
