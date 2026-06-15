/**
 * Resolves the quadtree `minUniformLevel` from the production crease-derived floor
 * and the diagnostic `__pfConformingUniformLevel` override. The override only ever
 * RAISES the uniform floor (never lowers the crease pin), and is 0/unset in
 * production so this returns the crease-derived value unchanged → byte-identical.
 *
 * Diagnostic use only (Stage-1 A-vs-C discriminator): forcing a high uniform level
 * bypasses the curvature-grid refiner to test whether isotropic densification closes
 * the perpendicular-3D chord gap on lattice/weave/braid styles.
 */
export function resolveUniformLevelOverride(
  creaseDerivedLevel: number,
  override: number,
): number | undefined {
  const base = Math.max(creaseDerivedLevel, override);
  return base > 0 ? base : undefined;
}
