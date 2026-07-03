// _braidLib.ts — DEV-ONLY (research/ only; src/ NEVER imports this). FRONTIER braid primitive (CelticKnot).
//
// CelticKnot (measured STEP-0): SINGLE-VALUED, seam-periodic (seamStep 0), relief 12.5mm. Unlike BasketWeave's
// AXIS-ALIGNED crease grid, CelticKnot's strand boundaries SWEEP as curved sinusoidal ribbons through (u,t):
// per column the strand centerlines are localU = 0.4*sin(v + basePhase + phaseStep*i), so the crease network is a
// set of SWEPT diagonal curves, not constant-u lines. A constant-u column grid would STRADDLE these swept creases
// (the SCALECOL wall: 23mm chord, %<20 44%, nonMan 272).
//
// This lib extracts the CelticKnot crease loci as SWEPT CURVES and provides a chart/curve-conforming grid. FIRST
// deliverable is a placeholder grid extraction so the validate harness type-checks; the real swept-curve conforming
// mesh is built in _braidChart (STEP-1 braid branch) after BasketWeave is proven.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { WeaveCreaseGrid } from './_weaveLib';

const TAU = 2 * Math.PI;

export interface CelticKnotParams { ckScale: number; ckWidth: number; ckRelief: number; ckGap: number; ckRoundness: number; ckTwist: number; ckStrands: number; }

/**
 * PLACEHOLDER grid for CelticKnot: sample the per-row crest/valley extrema (constant-t rings only; the vertical
 * creases sweep so we DON'T force constant-u columns — that is the wall). This will produce a POOR mesh (it is the
 * SCALECOL wall reproduction) and exists only so _weaveValidate can measure the braid baseline before the real
 * swept-curve conforming primitive (_braidChart) replaces it. Returns the constant-t ring creases + NO constant-u
 * creases (the honest statement: constant-u columns are wrong for the braid).
 */
export function celticKnotGrid(rA: AnalyticRadiusFn, H: number, _p: CelticKnotParams): WeaveCreaseGrid {
  // horizontal ring creases: where the braid crosses a t-level with a sharp radial kink. Detect via t-2nd-diff at
  // a representative theta. This is a baseline; the braid's real creases are swept.
  const nT = 400; const thC = TAU * 0.05;
  const rCol = new Float64Array(nT + 1); for (let it = 0; it <= nT; it++) rCol[it] = rA(thC, (it / nT) * H);
  const creaseT: number[] = [];
  for (let it = 2; it < nT - 1; it++) { const d2 = Math.abs(rCol[it - 1] - 2 * rCol[it] + rCol[it + 1]); const d2a = Math.abs(rCol[it - 2] - 2 * rCol[it - 1] + rCol[it]); const d2b = Math.abs(rCol[it] - 2 * rCol[it + 1] + rCol[it + 2]); if (d2 > d2a && d2 >= d2b && d2 > 0.02) creaseT.push(+(it / nT).toFixed(4)); }
  return { creaseU: [], creaseT };
}

export { TAU };
