/**
 * radialParametricSurface.ts — the adapter that lifts a single-valued radius field
 * `rA(θ,z)` into the shape-agnostic parametric-surface interface `Φ(u,v) → ℝ³`.
 *
 * WHY THIS EXISTS. Every single-valued pot style is a radius field, and its rulers are
 * ONE-SIDED (mesh→surface): a facet is scored by projecting it onto the surface, which is
 * structurally BLIND to a feature the mesh OMITS (a dropped ridge/valley emits no mesh
 * sample, so the projection reads ≈0). `twoSidedHausdorffMm` closes that blind spot by also
 * measuring surface→mesh — but it consumes `Φ(u,v)`, not `rA(θ,z)`. This is the bridge:
 *
 *     Φ(u,v) = ( rA(θ,z)·cosθ, rA(θ,z)·sinθ, z ),  θ = 2π·u,  z = z0 + height·v.
 *
 * The chart `(u,v) ∈ [0,1]×[0,1]` is single-valued and periodic in u, matching the seam of
 * the radial surface. Feeding a style through this adapter makes the full two-sided
 * (missing-feature) measurement apply to the entire single-valued roster with zero change
 * to the styles. (Genuinely multi-sheet over/under walls are NOT radius fields — they need a
 * post-warp `Φ` built directly in the (u,v) chart; that is the parametric projector's remit,
 * not this adapter's.)
 *
 * Pure CPU. Additive: imports only the shared surface type.
 */
import type { ParametricSurface } from './parametricSurfaceProjector';

const TAU = 2 * Math.PI;

export interface RadialParametricOptions {
  /** World z at v=0 (the pot's base z). Default 0. */
  z0?: number;
  /** World-z span from v=0 to v=1 (the pot's height). Default 1. */
  height?: number;
}

/**
 * Lift a radius field `rA(θ,z)` into a parametric surface `Φ(u,v)`. `θ = 2π·u` (u wraps the
 * seam, so callers pass `uPeriodic: true`); `z = z0 + height·v`.
 */
export function buildRadialParametricSurface(
  rA: (theta: number, z: number) => number,
  opts: RadialParametricOptions = {},
): ParametricSurface {
  const z0 = opts.z0 ?? 0;
  const height = opts.height ?? 1;
  return (u: number, v: number): readonly [number, number, number] => {
    const theta = TAU * u;
    const z = z0 + height * v;
    const r = rA(theta, z);
    return [r * Math.cos(theta), r * Math.sin(theta), z] as const;
  };
}
