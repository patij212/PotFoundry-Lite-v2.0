import type { SurfaceSampler } from './SurfaceSampler';

/**
 * Resolves the quadtree `efgSampler` (which, when present, populates per-leaf `efg` and
 * thereby activates the max-min-angle Klincsek DP diagonal selection in the triangulator).
 *
 * Production passes no `opts.efgSampler` and the diagnostic flag is off → returns
 * undefined → `efg` stays absent → the DP never runs → byte-identical to before. The
 * Stage-2 diagnostic flag `__pfConformingEfgDP` injects the surface sampler so `efg`
 * populates and the DP fires (the metric-reliability guard in `leaves()` still suppresses
 * `efg` on high-variation cells).
 */
export function resolveEfgSampler(
  optsEfgSampler: SurfaceSampler | undefined,
  surfaceSampler: SurfaceSampler,
  flagEnabled: boolean,
): SurfaceSampler | undefined {
  if (optsEfgSampler) return optsEfgSampler;
  return flagEnabled ? surfaceSampler : undefined;
}
