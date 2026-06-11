/**
 * PullbackMetric.ts — the WARP-COMPOSED surface map for a wall, plus exact
 * piecewise-linear warp derivatives (Stage-1 Task 1 of the export endgame).
 *
 * ## Why this exists
 *
 * The conforming mesher triangulates in (u,t) BEFORE the crease/helix domain
 * warps are applied to the assembled vertices (the post-assembly loops in
 * ParametricExportComputer.ts, :2556-2619). The emitted triangles therefore
 * live on the warp-COMPOSED surface (u,t) ↦ P(warps(u,t)) — measuring the
 * metric on the PLAIN sampler under-reports the anisotropy/shear the cells
 * actually carry (e.g. the SpiralRidges helix shear is invisible to the plain
 * metric). The shaped-template / Klincsek triangulation needs the pullback
 * metric of the COMPOSED map, which this module provides as a plain
 * {@link SurfaceSampler} wrapper so the existing finite-difference machinery
 * (`firstFundamentalForm`) applies unchanged.
 *
 * ## Verified application order (read from ParametricExportComputer.ts, 2026-06-11)
 *
 * The post-assembly warp loops run IN ORDER, mutating `asm.vertices` in place:
 *
 *  1. u-warp  (PEC :2556-2560) — fires iff `!creaseChoice.warp.isIdentity`;
 *     ALL surfaces: `v[i] = applyUWarp(uWarp, v[i])` (u is angular everywhere).
 *  2. t-warp  (PEC :2572-2579) — fires iff `!creaseTChoice.warp.isIdentity`;
 *     WALLS only (`surfaceId < 1.5`): `v[i+1] = applyTWarp(tWarp, v[i+1])`
 *     (caps reuse t as a RADIAL coordinate, never warped).
 *  3. helix   (PEC :2604-2619) — fires iff `!helixChoice.warp.isIdentity &&
 *     creaseChoice.warp.isIdentity` (helix XOR u-warp); a wall vertex uses
 *     `tEval = v[i+1]`, which at that point HAS ALREADY been t-warped by
 *     loop 2: `v[i] = applyHelixWarp(helix, v[i], tEval)`.
 *
 * This module is a WALL sampler, so the composed map mirrors exactly:
 *
 *     tEff   = tWarp non-identity ? applyTWarp(tWarp, t) : t
 *     uEff   = uWarp non-identity ? applyUWarp(uWarp, u) : u
 *     uFinal = (helix non-identity && uWarp identity)
 *                ? applyHelixWarp(helix, uEff, tEff) : uEff
 *     P(u,t) = plain.position(uFinal, tEff)
 *
 * (When the helix fires, uEff = u because the XOR guard requires the u-warp to
 * be identity — u-warp and helix never compose in practice; a non-identity
 * helix passed alongside a non-identity u-warp is DROPPED here exactly as the
 * production gate drops it.)
 *
 * ## FD at runtime, closed forms in the tests
 *
 * The warps are piecewise LINEAR (CreaseUWarp/CreaseTWarp anchor maps) — no
 * global analytic derivative exists; the slope is piecewise-constant and
 * discontinuous at the anchor kinks (extraction fact #5). The runtime metric is
 * therefore FINITE DIFFERENCES on this composed sampler with PLAIN-sampler grid
 * steps (the proven `classifyCellCeiling` pattern): warp kinks are dyadic by
 * construction (`chooseCreaseGrid`/`chooseCreaseTGrid` snap anchors onto
 * 1/2^level lattices), so cell-CENTER FD stencils stay inside one linear
 * segment of the warp. The closed-form pullback Jacobians (E'=E·φ′² etc.) live
 * in `PullbackMetric.test.ts` as pins of the FD path — they are NOT the runtime
 * mechanism.
 *
 * @module conforming/PullbackMetric
 */

import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import type { UWarp } from './CreaseUWarp';
import { applyUWarp } from './CreaseUWarp';
import type { TWarp } from './CreaseTWarp';
import { applyTWarp } from './CreaseTWarp';
import type { HelixWarp } from './CreaseHelixWarp';
import { applyHelixWarp } from './CreaseHelixWarp';

/** Structural shape shared by UWarpAnchor and TWarpAnchor. */
interface WarpAnchorLike {
  source: number;
  target: number;
}

/**
 * Slope of the piecewise-linear anchor map at x over the augmented control
 * sequence [0, ...anchors, 1]. The segment search advances PAST a kink
 * (`x >= src[i+1]`), so exactly AT a kink the RIGHT-segment slope is returned
 * (half-open segments [kink, next)); at x=1 the loop bound keeps the LAST
 * segment. Anchors are strictly increasing by construction (the builders
 * refuse otherwise), so every span is positive.
 */
function segmentSlope(anchors: readonly WarpAnchorLike[], x: number): number {
  const src = [0, ...anchors.map((a) => a.source), 1];
  const tgt = [0, ...anchors.map((a) => a.target), 1];
  let i = 0;
  while (i < src.length - 2 && x >= src[i + 1]) i++;
  return (tgt[i + 1] - tgt[i]) / (src[i + 1] - src[i]);
}

/**
 * Slope φ′(u) of the piecewise-linear u-warp at u (periodic: φ(u+1)=φ(u)+1 ⇒
 * φ′ is 1-periodic, so any real u is accepted). The derivative is
 * piecewise-constant and mathematically UNDEFINED exactly AT the anchor kinks —
 * there the RIGHT-segment slope is returned (a deterministic, documented
 * choice; runtime consumers evaluate at cell CENTERS, which the dyadic-kink
 * construction keeps off the kinks, see the module doc). Identity warp → 1.
 */
export function uWarpDerivative(warp: UWarp, u: number): number {
  if (warp.isIdentity) return 1;
  let x = u % 1;
  if (x < 0) x += 1;
  return segmentSlope(warp.anchors, x);
}

/**
 * Slope ψ′(t) of the piecewise-linear t-warp at t (interval coordinate,
 * endpoint-fixed: inputs are clamped to [0,1] exactly like `applyTWarp`). The
 * derivative is piecewise-constant and mathematically UNDEFINED exactly AT the
 * anchor kinks — there the RIGHT-segment slope is returned; at t=1 the LAST
 * segment's slope. Identity warp → 1.
 */
export function tWarpDerivative(warp: TWarp, t: number): number {
  if (warp.isIdentity) return 1;
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return segmentSlope(warp.anchors, x);
}

/**
 * The composed warp set for one wall. Any member may be omitted or be an
 * identity warp — both mean "this warp does not fire", mirroring the
 * `!warp.isIdentity` production guards.
 */
export interface WallWarps {
  /** Vertical-crease pin φ (applies to all surfaces; this sampler is a wall). */
  uWarp?: UWarp;
  /** Horizontal-crease pin ψ (walls only — which this sampler is). */
  tWarp?: TWarp;
  /** Helical-crease pin (fires only when the u-warp is identity — XOR guard). */
  helix?: HelixWarp;
}

/**
 * The warp-composed surface map for a WALL: (u,t) ↦ plain.position(uFinal, tEff),
 * mirroring the post-assembly application order EXACTLY (verified against
 * ParametricExportComputer.ts: u-warp loop :2556-2560 → t-warp loop :2572-2579
 * → helix loop :2604-2619, where the wall's helix `tEval = v[i+1]` is the
 * ALREADY-t-warped t because the t-warp loop runs first):
 *
 *     tEff   = tWarp non-identity ? applyTWarp(tWarp, t) : t   (walls only —
 *              this IS a wall sampler)
 *     uEff   = uWarp non-identity ? applyUWarp(uWarp, u) : u   (all surfaces)
 *     uFinal = (helix non-identity && uWarp identity)
 *                ? applyHelixWarp(helix, uEff, tEff) : uEff
 *
 * A non-identity helix passed alongside a non-identity u-warp is DROPPED,
 * exactly like the production XOR gate (PEC :2604) — the mesh never carries
 * both.
 *
 * Forwards `gridResolution()` from the plain sampler: the composed map has the
 * SAME (u,t) domain, so the plain grid is the right finite-difference step
 * basis. Omitting it would make `metricStepsForSampler` silently fall back to
 * DEFAULT_H=1e-4 (fact #8) — a sub-cell step against the bilinear
 * `GpuSurfaceSampler` reads inside one locally-planar patch and amplifies
 * quantization noise into spurious metric values.
 *
 * Returns the PLAIN sampler unchanged when every warp is identity (exact-object
 * pass-through: callers can cheaply detect the no-op case with `===`).
 */
export function composedWallSampler(plain: SurfaceSampler, warps: WallWarps): SurfaceSampler {
  const uw = warps.uWarp && !warps.uWarp.isIdentity ? warps.uWarp : undefined;
  const tw = warps.tWarp && !warps.tWarp.isIdentity ? warps.tWarp : undefined;
  // Helix XOR u-warp (PEC :2604): the helix fires ONLY when the u-warp is
  // identity, so a helix alongside an active u-warp is dropped here too.
  const hx = warps.helix && !warps.helix.isIdentity && !uw ? warps.helix : undefined;
  if (!uw && !tw && !hx) return plain;

  const position = (u: number, t: number): Vec3 => {
    const tEff = tw ? applyTWarp(tw, t) : t;
    const uEff = uw ? applyUWarp(uw, u) : u;
    const uFinal = hx ? applyHelixWarp(hx, uEff, tEff) : uEff;
    return plain.position(uFinal, tEff);
  };

  // Forward gridResolution ONLY when the plain sampler has one — an analytic
  // sampler must keep reporting "no grid" so FD callers use the analytic step.
  const gridResolution = plain.gridResolution?.bind(plain);
  return gridResolution ? { position, gridResolution } : { position };
}
