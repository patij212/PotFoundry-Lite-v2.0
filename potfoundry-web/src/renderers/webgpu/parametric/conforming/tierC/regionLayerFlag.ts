/**
 * Dev-only lever, mirroring the `__pfConforming*` convention: unset/false in
 * production, set to `true` only by research probes once the region layer
 * is wired.
 */
export function isRegionLayerEnabled(): boolean {
  const g = globalThis as unknown as { __pfRegionLayer?: boolean };
  return g.__pfRegionLayer === true;
}
