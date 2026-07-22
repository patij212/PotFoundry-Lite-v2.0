/**
 * exactCertGate.ts — a reusable, FAIL-CLOSED certification gate over the rigorous
 * targetSolid interval prover.
 *
 * The prover (`src/geometry/targetSolid`) produces a per-triangle "certifies-at"
 * GUARANTEE — the smallest ladder rung at which a triangle is *rigorously proven*
 * (outward-rounded interval enclosure, not sampled) to lie within of the exact
 * analytic target. Until now that prover was only exercised by the heavy, DEV-ONLY,
 * env-gated roster sidecar baker (`_certRosterErrorBake.test.ts`, skipped by default
 * ⇒ gating nothing). This wraps the exact same end-to-end pipeline
 * (atlas → tessellate → bake) into ONE call with a MAX-first, fail-closed verdict, so
 * it can back an always-on CI gate (`exactCertGate.test.ts`).
 *
 * VERDICT: `certified = unconvergedCount === 0 && maxCertifiesAtMm <= tolMm`.
 *  - Certify on MAX (never p99): a single triangle whose guaranteed bound exceeds tol
 *    fails the gate.
 *  - FAIL-CLOSED: any triangle that could NOT be certified within the split/depth
 *    budget ("unconverged") fails the gate — an unproven triangle is never a pass.
 *
 * SCOPE: the single-valued outer-wall target the prover's registry supports (all 20
 * styles statically; several hard styles' discontinuity curtains are absent ⇒ they
 * fail-closed, correctly). Lives in research/bridge because the binding/ladder-walk
 * helpers (`atlas`, `bakeCertifiesAtErrors`) do; the prover core it drives is in src.
 * Promoting this to a src-side production gate = porting those two helpers to src.
 */
import {
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellationOptions,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import type { GeometryParams } from '../../src/state/types';
import { bakeCertifiesAtErrors } from './_certifiesAtBakeLib';
import { atlas } from './_certRoster';

/** Default ascending threshold ladder (mm); 0.01 is the export standard rung. */
export const DEFAULT_CERT_LADDER_MM = [0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64] as const;

export interface ExactCertGateOptions {
  /** The certification tolerance (mm). Must be a rung of `ladderMm`. */
  readonly tolMm: number;
  /** Ascending threshold ladder (mm). Default {@link DEFAULT_CERT_LADDER_MM}. */
  readonly ladderMm?: readonly number[];
  /** Max dyadic subdivision depth per accept-check. Default 24. */
  readonly maxDepth?: number;
  /**
   * Split budget per accept-check at/above the tol rung. A triangle that cannot be
   * proven within this budget is "unconverged" ⇒ the gate FAILS (fail-closed). Higher
   * = more triangles converge but slower. Default 20000 (prover-grade, slow).
   */
  readonly splitBudget?: number;
  /**
   * Restrict the verdict to these patch ids (e.g. `['outer-wall']` — the fidelity
   * surface). Triangles in other patches are still baked but do not affect the
   * verdict, so those patches can stay coarse for speed. Default: all patches (the
   * whole closed solid). An UNCONVERGED gated triangle still fails (its bake sentinel
   * is 1.28mm ≫ tol), so scoping stays fail-closed.
   */
  readonly gatePatchIds?: readonly string[];
}

export interface ExactCertGateResult {
  /** unconvergedCount === 0 && maxCertifiesAtMm <= tolMm. */
  readonly certified: boolean;
  /** The worst triangle's guaranteed certifies-at level (mm) — the MAX-first headline. */
  readonly maxCertifiesAtMm: number;
  /** Triangles that could not be certified within the budget (fail-closed if > 0). */
  readonly unconvergedCount: number;
  /** Accept-checks that hit max depth without a definitive yes/no (diagnostic). */
  readonly unknownCheckCount: number;
  readonly triangleCount: number;
  readonly enclosureCount: number;
  readonly tolMm: number;
}

/**
 * Run the rigorous interval prover end-to-end on a style's outer-wall solid and
 * return a fail-closed certification verdict at `tolMm`.
 */
export function certifyOuterWallExact(
  geometry: GeometryParams,
  styleParams: Readonly<Record<string, number>>,
  styleId: string,
  divisions: AnnularSolidReferenceTessellationOptions,
  options: ExactCertGateOptions,
): ExactCertGateResult {
  const ladderMm = options.ladderMm ?? DEFAULT_CERT_LADDER_MM;
  const tolMm = options.tolMm;
  const startLevel = ladderMm.indexOf(tolMm);
  if (startLevel < 0) {
    throw new Error(`exactCertGate: tolMm ${tolMm} must be a rung of ladderMm [${ladderMm.join(', ')}]`);
  }
  const maxDepth = options.maxDepth ?? 24;
  const splitBudget = options.splitBudget ?? 20000;

  const binding = atlas(geometry, styleParams, styleId);
  const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, divisions);
  const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(binding.surfaceComplex);
  const bake = bakeCertifiesAtErrors(binding, tessellation, target.targetSha256, {
    ladderMm,
    startLevel,
    maxDepth,
    checkSplitsFor: (thresholdMm) => (thresholdMm >= tolMm ? splitBudget : Math.min(splitBudget, 400)),
  });

  // The unconverged bake sentinel (ladder-top × 2 = 1.28mm) — an unconverged triangle
  // is recorded here, so a scoped MAX that includes it fails the gate automatically.
  const unconvergedSentinelMm = ladderMm[ladderMm.length - 1] * 2;
  const gateSet = options.gatePatchIds ? new Set(options.gatePatchIds) : undefined;
  let maxCertifiesAtMm = 0;
  let gatedTriangleCount = 0;
  let unconvergedCount = 0;
  for (const partition of tessellation.partitions) {
    if (gateSet && !gateSet.has(partition.patchId)) continue;
    for (const mapping of partition.triangles) {
      const e = bake.errors[mapping.artifactTriangleIndex];
      gatedTriangleCount += 1;
      if (e >= unconvergedSentinelMm) unconvergedCount += 1;
      if (e > maxCertifiesAtMm) maxCertifiesAtMm = e;
    }
  }
  // Certify on MAX (never p99); fail-closed on any unconverged gated triangle (its
  // sentinel already dominates the MAX, so the MAX check alone suffices, but the
  // explicit count is reported for diagnostics).
  const certified = unconvergedCount === 0 && maxCertifiesAtMm <= tolMm;
  return {
    certified,
    maxCertifiesAtMm,
    unconvergedCount,
    unknownCheckCount: bake.unknownCheckCount,
    triangleCount: gatedTriangleCount,
    enclosureCount: bake.enclosureCount,
    tolMm,
  };
}
