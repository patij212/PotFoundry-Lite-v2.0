/**
 * certCrossValidate.test.ts — R7: cross-validate the FAST sampled ruler
 * (measureRadialFidelity) against the RIGOROUS certifiesAt bound on the SAME
 * outer-wall mesh.
 *
 * Soundness relation: for a facet, sampled perpendicular deviation ≤ true max
 * deviation ≤ the rigorous per-triangle certifies-at upper bound. So over the outer
 * wall, `measureRadialFidelity.chordMaxMm ≤ max(certifiesAt)`. If the fast ruler ever
 * reported MORE than the rigorous guaranteed bound, the fast ruler would be UNSOUND
 * (overstating) or the prover unsound — the exact gap Agent G flagged (the two stacks
 * never cross-checked).
 *
 * Validity self-check: the artifact wall vertices are placed ON the prover's target
 * surface, so if our analytic rA matches that target, the VERTEX channel reads ≈0.
 * A large vertexMax would mean we built the wrong rA and the comparison is meaningless.
 */
import { describe, it, expect } from 'vitest';
import { tessellateAnnularRadialSolidTargetForCertification } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { measureRadialFidelity } from '../../src/fidelity/measureRadialFidelity';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { DEFAULT_GEOMETRY, type GeometryParams } from '../../src/state/types';
import type { StyleId } from '../../src/geometry/types';
import { bakeCertifiesAtErrors } from './_certifiesAtBakeLib';
import { atlas } from './_certRoster';

const LADDER_MM = [0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64];

describe('R7 — measureRadialFidelity is SOUND vs the rigorous certifiesAt bound', () => {
  it('sampled chordMax <= rigorous certifies-at over the same outer wall', () => {
    const geometry: GeometryParams = { ...DEFAULT_GEOMETRY, H: 20, top_od: 30, bottom_od: 30, r_drain: 6 };
    // atlas/canonical-input uses UI (snake_case) style-param names; the src style
    // functions (buildAnalyticRadiusFn → STYLE_FUNCTIONS) use camelCase. They resolve
    // to the SAME surface — verified below by the ≈0 vertex channel — but the spelling
    // differs, so each path is given its own params object.
    const params = { hr_petal_amp: 0.01, hr_ripple_amp: 0, hr_bell: 0 };
    const rAParams = { hrPetalAmp: 0.01, hrRippleAmp: 0, hrBell: 0 };
    const styleId: StyleId = 'HarmonicRipple';
    const divisions = {
      angularDivisionsLog2: 7,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 3, 'inner-wall': 1, 'top-rim': 1, 'bottom-top': 1, 'bottom-under': 1, 'drain-wall': 0,
      },
    };

    const binding = atlas(geometry, params, styleId);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, divisions);
    const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(binding.surfaceComplex);
    const bake = bakeCertifiesAtErrors(binding, tessellation, target.targetSha256, {
      ladderMm: LADDER_MM,
      startLevel: LADDER_MM.indexOf(0.01),
      maxDepth: 24,
      checkSplitsFor: (th) => (th >= 0.01 ? 400 : 200),
    });

    // Extract outer-wall triangles as a mesh (own vertices per tri) + surfaceId-0 ut.
    const stl = Buffer.from(
      tessellation.stlBytes.buffer, tessellation.stlBytes.byteOffset, tessellation.stlBytes.byteLength,
    );
    const verts: number[] = [];
    const idx: number[] = [];
    const ut: number[] = [];
    let maxCertMm = 0;
    let vi = 0;
    for (const partition of tessellation.partitions) {
      if (partition.patchId !== 'outer-wall') continue;
      for (const mapping of partition.triangles) {
        const e = bake.errors[mapping.artifactTriangleIndex];
        if (e > maxCertMm) maxCertMm = e;
        const at = 84 + mapping.artifactTriangleIndex * 50 + 12;
        for (let k = 0; k < 3; k += 1) {
          verts.push(stl.readFloatLE(at + (k * 3) * 4), stl.readFloatLE(at + (k * 3 + 1) * 4), stl.readFloatLE(at + (k * 3 + 2) * 4));
          ut.push(0, 0, 0);
          idx.push(vi);
          vi += 1;
        }
      }
    }

    const rA = buildAnalyticRadiusFn(styleId, rAParams, {
      H: geometry.H, Rb: geometry.bottom_od / 2, Rt: geometry.top_od / 2, expn: geometry.expn,
    });
    const rep = measureRadialFidelity(
      { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx) },
      Float32Array.from(ut),
      rA,
      { H: geometry.H, tolMm: 0.01, seamExclU: 0, denseN: 8 },
    );

    // eslint-disable-next-line no-console
    console.log(`[xval] wallTris=${idx.length / 3} vertexMax=${rep.vertexMaxMm.toFixed(6)} chordMax=${rep.chordMaxMm.toFixed(6)} maxCert=${maxCertMm.toFixed(5)} ratio=${(rep.chordMaxMm / Math.max(maxCertMm, 1e-9)).toFixed(3)}`);

    // Validity: rA matches the artifact target ⇒ vertices lie on it ⇒ vertex channel ≈ 0.
    // (A large vertexMax would mean we compared against the wrong surface.)
    expect(rep.vertexMaxMm).toBeLessThan(1e-3);
    // SOUNDNESS (the R7 claim): the fast sampled ruler NEVER exceeds the rigorous
    // guaranteed upper bound — sampled ≤ true ≤ certified.
    expect(rep.chordMaxMm).toBeLessThanOrEqual(maxCertMm);
    // TIGHTNESS: the fast ruler AGREES with the rigorous bound to within the ladder
    // quantization — it is a tight sound estimate (measured ratio ≈0.84), not a trivial
    // lower bound. (>maxCert/4 is safely below the measured ratio and catches a ruler
    // that under-reports the deviation, which soundness alone would not.)
    expect(rep.chordMaxMm).toBeGreaterThan(maxCertMm / 4);
  }, 180_000);
});
