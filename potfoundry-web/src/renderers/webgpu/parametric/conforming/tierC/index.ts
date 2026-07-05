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
  throw new Error('tierC not yet wired');
}
