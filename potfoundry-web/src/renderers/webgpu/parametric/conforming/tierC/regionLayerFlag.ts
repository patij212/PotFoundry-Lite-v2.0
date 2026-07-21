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

/**
 * NARROW default-off SUB-FLAG for CONVERGE-A — the UNIFIED STRUCTURED RING-STRIP emitter
 * ({@link buildDsRingStripWall}). When on, the DragonScales region dispatch BYPASSES the free-Delaunay
 * region kernel entirely and emits the DS outer wall as a structured cylinder grid: along-ring rows +
 * across-ring columns + a double-valued tread pair at each t=k/8, watertight BY CONSTRUCTION. This closes
 * BOTH the tread C0 (S2's recovery-gapped tread, max 0.266) AND the near-ring flank (B's convergence floor
 * 0.102) that the two free-Delaunay levers each REFUTED. Off (production) => the DS region graph path is
 * byte-identical to the pre-CONVERGE-A build. Effective ONLY inside the already-flag-gated
 * `buildRegionOuterWall` DS branch (needs `__pfRegionLayer` + `__pfPerfectMesher` to reach production), so
 * this is a third independent gate — it can never alter the default export path.
 */
export function isDsRingStripsEnabled(): boolean {
  const g = globalThis as unknown as { __pfDsRingStrips?: boolean };
  return g.__pfDsRingStrips === true;
}

/**
 * NARROW default-off SUB-FLAG for the DragonScales SCALE-TIP CONE-FAN (E-2026-07-21-DS-CONEFAN-PROD — the frontier
 * tournament winner; first whole-body ≤0.01mm true-3D DS mesh). When on, the DS region dispatch emits the outer wall
 * via {@link buildDsConeFanWallGeometric}: the crest-anchored structured grid with a per-apex graded polar cone-fan at
 * each scale tip (welded by index, watertight by construction), closing the scale-tip C1 cone apex that defeated both
 * the uniform grid AND the region kernel at ~0.04mm (the "double wall"). Off (production) ⇒ this branch never runs and
 * the DS region path is byte-identical. Effective ONLY inside the already-flag-gated `buildRegionOuterWall` DS branch
 * (needs `__pfRegionLayer` + `__pfPerfectMesher` to reach production) ⇒ a third independent gate.
 */
export function isDsConeFanEnabled(): boolean {
  const g = globalThis as unknown as { __pfDsConeFan?: boolean };
  return g.__pfDsConeFan === true;
}
