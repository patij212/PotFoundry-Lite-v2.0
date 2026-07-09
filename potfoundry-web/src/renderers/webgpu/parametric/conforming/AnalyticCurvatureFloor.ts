/**
 * AnalyticCurvatureFloor.ts — per-style CLOSED-FORM curvature lower bounds for the
 * conforming sizing field (E-2026-07-09-ANALYTIC-FLOOR).
 *
 * The production sizing reads curvature by finite differences on the band-limited
 * 256² sampler grid, which under-reads sub-cell ridges (E-2026-07-01-FRONTIER-BET2,
 * mechanism CONFIRMED); the sizing GRID (128²) then samples that κ field at ~4.7
 * nodes per SpiralRidges groove cycle, so crests BETWEEN nodes are missed outright.
 * A style that knows its ridge curvature analytically can floor the field via the
 * dormant {@link SizingOptions.curvatureFloor} hook — but only as a CELL-SUPREMUM:
 * each sizing node carries the max closed-form κ over its ±1-node cell window
 * (dense sub-sampling of the closed form, ~57 samples per groove cycle), because a
 * nodal read would alias exactly like the sampler it is meant to correct.
 *
 * SpiralRidges (the pilot): the horizontal polar section r(θ) = r0(z)·f(θ,t) with
 * f = 1 + amp(t)·sin(kθ+φ(t)) + g·sin(mkθ+pφ(t)) has exact θ-derivatives, giving the
 * section curvature κ_polar = |r² + 2r'² − r·r''| / (r² + r'²)^{3/2} (mm⁻¹). The
 * ridges are helical (pitch ≈ atan(r·TAU·turns/(k·H)) from vertical), so the
 * horizontal section under-reads the cross-ridge principal curvature by cos²(pitch)
 * (Euler); the floor multiplies by 1/cos²(pitch) = 1 + tan²(pitch). The along-ridge
 * (t-direction) curvature contribution is second-order for this field and is NOT
 * modelled — the sagitta target (maxSagMm ≪ export tolerance) absorbs it.
 *
 * Every style without an implemented closed form returns null (the caller passes no
 * floor ⇒ byte-identical sizing). Consumed behind the dev flag
 * `__pfConformingAnalyticFloor` — production default is byte-identical OFF.
 *
 * @module conforming/AnalyticCurvatureFloor
 */
import { DEFAULT_SPIRAL } from '../../../../geometry/types';
import type { SpiralRidgesParams, StyleOptions } from '../../../../geometry/types';
import { baseRadius } from '../../../../geometry/profile';

const TAU = Math.PI * 2;

/** A sizing-field floor: κ lower bound (mm⁻¹) over (u,t) + the cusp cap. */
export interface AnalyticFloorSpec {
  /** Cell-supremum analytic κ at (u,t) — plug into {@link SizingOptions.curvatureFloor}. */
  curvatureFloor: (u: number, t: number) => number;
  /** 8·maxSag/minEdge² — beyond this κ the minEdge clamp binds anyway. */
  maxKappa: number;
}

/** Pot-body dims the closed forms need (subset of PotDimensions). */
export interface AnalyticFloorDims {
  H: number;
  Rt: number;
  Rb: number;
  expn?: number;
}

/** Sizing-grid geometry + sagitta knobs the floor must match. */
export interface AnalyticFloorSizing {
  resU: number;
  resT: number;
  maxSagMm: number;
  minEdgeMm: number;
}

/**
 * Build the analytic curvature floor for a style, or null when no closed form is
 * implemented (null ⇒ caller passes no floor ⇒ byte-identical sizing).
 */
export function buildAnalyticCurvatureFloor(
  styleId: string,
  styleOpts: StyleOptions,
  dims: AnalyticFloorDims,
  sizing: AnalyticFloorSizing,
): AnalyticFloorSpec | null {
  if (styleId !== 'SpiralRidges') return null;
  return buildSpiralRidgesFloor(styleOpts, dims, sizing);
}

/** SpiralRidges: exact θ-derivatives of the sin(kθ+helix) field → polar-section κ,
 *  helix-corrected, cell-sup-sampled onto the sizing lattice. */
function buildSpiralRidgesFloor(
  styleOpts: StyleOptions,
  dims: AnalyticFloorDims,
  sizing: AnalyticFloorSizing,
): AnalyticFloorSpec {
  const p = styleOpts as Partial<SpiralRidgesParams>;
  const k = p.spiralK ?? DEFAULT_SPIRAL.spiralK;
  const turns = p.spiralTurns ?? DEFAULT_SPIRAL.spiralTurns;
  const ampMin = p.spiralAmpMin ?? DEFAULT_SPIRAL.spiralAmpMin;
  const ampMax = p.spiralAmpMax ?? DEFAULT_SPIRAL.spiralAmpMax;
  const ampCurve = p.spiralAmpCurve ?? DEFAULT_SPIRAL.spiralAmpCurve;
  const grooveAmp = p.spiralGrooveAmp ?? DEFAULT_SPIRAL.spiralGrooveAmp;
  const grooveMult = p.spiralGrooveMult ?? DEFAULT_SPIRAL.spiralGrooveMult;
  const phaseMult = p.spiralPhaseMult ?? DEFAULT_SPIRAL.spiralPhaseMult;
  const { H, Rt, Rb } = dims;
  const expn = dims.expn ?? 1;

  const kappaAt = (u: number, t: number): number => {
    const theta = (u - Math.floor(u)) * TAU;
    const tc = Math.min(1, Math.max(0, t));
    const z = tc * H;
    const r0 = baseRadius(z, H, Rb, Rt, expn, styleOpts);
    const phase = TAU * turns * tc;
    const amp = ampMin + (ampMax - ampMin) * Math.pow(tc, ampCurve);
    const a1 = k * theta + phase;
    const a2 = grooveMult * k * theta + phaseMult * phase;
    const f = 1 + amp * Math.sin(a1) + grooveAmp * Math.sin(a2);
    const fp = amp * k * Math.cos(a1) + grooveAmp * grooveMult * k * Math.cos(a2);
    const fpp = -amp * k * k * Math.sin(a1) - grooveAmp * grooveMult * grooveMult * k * k * Math.sin(a2);
    const r = r0 * f;
    const rp = r0 * fp;
    const rpp = r0 * fpp;
    const denom = Math.pow(r * r + rp * rp, 1.5);
    if (!(denom > 1e-12)) return 0;
    const kPolar = Math.abs(r * r + 2 * rp * rp - r * rpp) / denom;
    // Helix (Euler) correction: cross-ridge principal κ ≥ κ_horizontal/cos²(pitch).
    const tanB = (r * TAU * turns) / (k * H);
    return kPolar * (1 + tanB * tanB);
  };

  // Cell-supremum onto the sizing lattice (nodes u=i/resU periodic, t=j/(resT−1)):
  // ±1-node window, sub-sampled densely enough that the highest angular frequency
  // (grooveMult·k per rev) is seen ~57× per cycle — the anti-aliasing this floor
  // exists to provide.
  const { resU, resT } = sizing;
  const SUB_U = 24;
  const SUB_T = 4;
  const grid = new Float64Array(resU * resT);
  const du = 1 / resU;
  const dt = resT > 1 ? 1 / (resT - 1) : 1;
  for (let j = 0; j < resT; j++) {
    const tj = resT > 1 ? j / (resT - 1) : 0;
    for (let i = 0; i < resU; i++) {
      const ui = i / resU;
      let sup = 0;
      for (let jj = -SUB_T; jj <= SUB_T; jj++) {
        const t = Math.min(1, Math.max(0, tj + (jj / SUB_T) * dt));
        for (let ii = -SUB_U; ii <= SUB_U; ii++) {
          const kap = kappaAt(ui + (ii / SUB_U) * du, t);
          if (kap > sup) sup = kap;
        }
      }
      grid[j * resU + i] = sup;
    }
  }

  const curvatureFloor = (u: number, t: number): number => {
    const uu = u - Math.floor(u);
    const x = uu * resU;
    const i0 = Math.floor(x) % resU;
    const i1 = (i0 + 1) % resU;
    const fx = x - Math.floor(x);
    const tt = Math.min(1, Math.max(0, t));
    const y = tt * (resT - 1);
    const j0 = Math.min(resT - 1, Math.floor(y));
    const j1 = Math.min(resT - 1, j0 + 1);
    const fy = y - j0;
    const g00 = grid[j0 * resU + i0];
    const g10 = grid[j0 * resU + i1];
    const g01 = grid[j1 * resU + i0];
    const g11 = grid[j1 * resU + i1];
    return (g00 * (1 - fx) + g10 * fx) * (1 - fy) + (g01 * (1 - fx) + g11 * fx) * fy;
  };

  return {
    curvatureFloor,
    maxKappa: (8 * sizing.maxSagMm) / (sizing.minEdgeMm * sizing.minEdgeMm),
  };
}
