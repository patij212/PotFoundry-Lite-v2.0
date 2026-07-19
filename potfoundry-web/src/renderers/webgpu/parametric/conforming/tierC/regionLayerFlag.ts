/**
 * Dev-only lever, mirroring the `__pfConforming*` convention: unset/false in
 * production, set to `true` only by research probes once the region layer
 * is wired.
 */
export function isRegionLayerEnabled(): boolean {
  const g = globalThis as unknown as { __pfRegionLayer?: boolean };
  return g.__pfRegionLayer === true;
}

/**
 * NARROW default-off SUB-FLAG for the §V11l DragonScales RISER-EDGE family
 * (E-2026-07-19-DS-RISER-CLOSE): when on, the DS region dispatch adds the doubled
 * u-running tread rings at t=k/8 to `buildDragonScalesConformingGraph` so the
 * interior C0 ring risers become mesh tread faces instead of being chorded. Off
 * (production) ⇒ the DS conforming graph is byte-identical to the pre-riser build.
 * Effective ONLY inside the already-flag-gated `buildRegionOuterWall` DS branch
 * (needs `__pfRegionLayer` + `__pfPerfectMesher` to reach production), so this is
 * a third independent gate — it can never alter the default export path.
 */
export function isDsRiserEdgesEnabled(): boolean {
  const g = globalThis as unknown as { __pfDsRiserEdges?: boolean };
  return g.__pfDsRiserEdges === true;
}
