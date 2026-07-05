/**
 * tierC/ — staged perfect-mesher back-port (default-OFF, byte-identical off).
 *
 * `buildTierCOuterWall` is the ONLY symbol the orchestrator calls. With the
 * `__pfPerfectMesher` flag unset/false (always, in production) it delegates
 * unchanged to `buildConformingOuterWall`, so the output is byte-for-byte
 * identical to today (guarded by flagOff.byteIdentical.test.ts). The flag-on
 * Tier-C pipeline (Morse protected complex → no-bridge split → whole-mesh
 * 0-outlier refine → degenerate-face collapse) lands in later plan tasks; see
 * docs/superpowers/plans/2026-07-05-perfect-mesher-backport.md.
 *
 * The flag NEVER flips in the staging plan: Gothic/GeoStar carry a documented
 * print-safe finite-area needle concession (13 sliver levers refuted), and the
 * 20-style whole-mesh re-baseline (VALIDATION 9) blocks any all-styles claim.
 *
 * @module conforming/tierC
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import {
  buildConformingOuterWall,
  type ConformingOuterWallOptions,
  type ConformingOuterWallResult,
} from '../ConformingOuterWall';
import { detectFeatures } from '../featureGraph/detectFeatures';
import { isCountUnstableStyle } from './countUnstable';

export { countJunctionNodes, isCountUnstableStyle } from './countUnstable';

/**
 * Canonical detector options (mirrors the production call in
 * fidelity/bandRemesh/assembleWithFeatures.ts, minus its reliefIndicator —
 * the component-boundary detector is not needed to sense count-instability,
 * which lives in the ridge/crease network's junctions).
 */
const TIER_C_DETECT_OPTS = {
  coarseRes: 40,
  fineRes: 120,
  minStrength: 1.0,
  minAngleDeg: 28,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
} as const;

/**
 * Dev-only lever, mirroring the `__pfConforming*` convention: unset/false in
 * production, set to `true` only by research probes once Tier-C is wired.
 */
export function isPerfectMesherEnabled(): boolean {
  const g = globalThis as unknown as { __pfPerfectMesher?: boolean };
  return g.__pfPerfectMesher === true;
}

/**
 * Drop-in for {@link buildConformingOuterWall}: identical signature and
 * result. Flag off → pure delegation (byte-identical). Flag on → the Tier-C
 * perfect-mesher path (not yet wired; throws until plan Task 4).
 */
export function buildTierCOuterWall(
  sampler: SurfaceSampler,
  opts: ConformingOuterWallOptions,
): ConformingOuterWallResult {
  if (!isPerfectMesherEnabled()) {
    return buildConformingOuterWall(sampler, opts);
  }
  // Flag ON (dev-only): Tier-C fires only for count-unstable feature
  // networks; Tier-A/B styles take the production path unchanged.
  const graph = detectFeatures(sampler, TIER_C_DETECT_OPTS);
  if (!isCountUnstableStyle('', graph)) {
    return buildConformingOuterWall(sampler, opts);
  }
  throw new Error('tierC not yet wired');
}
