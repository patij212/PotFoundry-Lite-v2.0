/**
 * analyticRadius.ts — production builder for the EXACT continuous analytic
 * surface radius r(theta, z) of a style.
 *
 * This is the src/-only twin of the research harness `buildRadiusFn`
 * (`research/bridge/runStyle.ts`), which is in turn what
 * `getManifest(styleId).truth.rA` is built from. Every input is already a
 * src/ primitive — {@link STYLE_FUNCTIONS} (the complete per-style radius map,
 * incl. `GeometricStar: rOuterGeometricStar`), {@link baseRadius} (the profile
 * baseline), and {@link DEFAULT_STYLE_PARAMS} — so the surface this returns is
 * byte-for-byte the SAME analytic surface the research champion scored against
 * (reproducing the C2 lever's 0-outlier result with this fn IS the faithfulness
 * proof; see research/lab/tierc/C2-full-patch-verdict.md).
 *
 * The Tier-C K2 refine loop (`noBridgeRefine.ts`) consumes this via its
 * `surfaceSource:'analytic'` / `analyticRA` lever: with the analytic surface as
 * the placement + ruling target, every vertex sits exactly on the true surface
 * instead of the 512² bilinear grid the default sampler chords across. Wired
 * into production behind the double flag `__pfPerfectMesher` +
 * `__pfTierCAnalyticSurface` (both default-OFF) — see `tierC/index.ts`.
 *
 * @module geometry/analyticRadius
 */

import { STYLE_FUNCTIONS } from './styles';
import { baseRadius } from './profile';
import { DEFAULT_STYLE_PARAMS, type StyleId, type StyleOptions } from './types';

/** Pot dimensions needed to evaluate the analytic surface. */
export interface AnalyticRadiusDims {
  /** Total height (mm). */
  H: number;
  /** Bottom radius (mm). */
  Rb: number;
  /** Top radius (mm). */
  Rt: number;
  /** Flare exponent (default 1). */
  expn?: number;
}

/**
 * Build the continuous analytic radius fn `rA(theta, z)` exactly as
 * styleSampler / the export pipeline evaluate it — mirroring
 * `research/bridge/runStyle.ts`'s `buildRadiusFn` (and therefore
 * `getManifest(styleId).truth.rA`) with src/-only primitives.
 *
 * `params` are merged over the style's defaults (so `{}` yields the canonical
 * default surface, matching the reference loci). The returned closure is a pure
 * function of `(theta, z)` and does NOT discretize — it is the un-gridded truth
 * the sampler grid approximates.
 */
export function buildAnalyticRadiusFn(
  styleId: StyleId,
  params: StyleOptions,
  dims: AnalyticRadiusDims,
): (theta: number, z: number) => number {
  const radiusFn = STYLE_FUNCTIONS[styleId];
  const opts: StyleOptions = { ...DEFAULT_STYLE_PARAMS[styleId], ...params };
  const { H, Rb, Rt } = dims;
  const expn = dims.expn ?? 1;
  return (theta, z) => radiusFn(theta, z, baseRadius(z, H, Rb, Rt, expn, opts), H, opts);
}
