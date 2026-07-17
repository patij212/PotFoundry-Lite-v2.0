import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type MappedPatchProofJob,
} from './completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import {
  FinalStlPartialCertificationError,
  proveFinalStlMappedGeometryAndStructure,
} from './finalStlPartialCertification';
import { assessProofSessionStructuralIntegrity } from './proofSessionStructuralIntegrity';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';
import {
  dyadicEdgeLadder,
  rationalFeatureAngularLadder,
  rationalStationLadder,
  snappedFeatureAngularLadder,
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellation,
  type AnnularSolidReferenceTessellationOptions,
} from './annularSolidReferenceTessellation';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

// A small, valid HarmonicRipple pot chosen so a uniform dyadic reference grid
// provably reaches the 0.01 mm continuous budget inside the proof layer's
// 131,072 mapped-triangle and elapsed-time hard caps. Every value is inside
// the registry/geometry bounds — this is a real supported pot, not a toy
// abstraction; production-DEFAULT scale at default style params does NOT fit
// the caps yet (see the fail-closed case below).
const SMALL_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 40,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});
const GENTLE_HARMONIC_RIPPLE = Object.freeze({
  hr_petal_amp: 0.01,
  hr_ripple_amp: 0,
  hr_bell: 0,
});

function atlas(
  geometry: Readonly<Record<string, number>>,
  styleParams: Readonly<Record<string, number>>,
  styleId = 'HarmonicRipple'
): {
  binding: SinglePatchAnnularRadialSolidTargetBinding;
  canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>;
} {
  const canonicalInput = createCanonicalTargetInputBinding(
    geometry,
    styleId,
    styleParams,
    TARGET_CONTROLS
  );
  const binding = createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
  return { binding, canonicalInput };
}

function jobsFor(
  binding: SinglePatchAnnularRadialSolidTargetBinding,
  tessellation: AnnularSolidReferenceTessellation,
  targetSha256: string
): readonly MappedPatchProofJob[] {
  const programByPatch = new Map(
    binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
  );
  return tessellation.partitions.map((partition) => {
    const programCanonicalJson = programByPatch.get(
      partition.patchId as (typeof binding.programs)[number]['patchId']
    );
    if (programCanonicalJson === undefined) {
      throw new Error(`missing program for partition patch '${partition.patchId}'`);
    }
    return {
      partition,
      evaluator: compileValidatedResidualEvaluator({ targetSha256, programCanonicalJson }),
    };
  });
}

// 256 angular stations give ~4x sag margin at the gentle petal amplitude
// (~0.0017 mm estimated vs the 0.0095 mm geometric budget). The radial
// annuli (rim, both bottoms) are ruled surfaces — linear in v but with a
// ruling direction that rotates with u — so a triangle spanning du x dv
// carries a mixed d2P/dudv twist error of roughly r'(v)*theta'(u)*du*dv/4.
// Measured on this pot: ~31 um at one v-cell across the 6.1 mm bottom
// annulus (the continuous proof correctly REFUSED that mesh, and at two
// rim v-cells it pinned a true 9.50010 um point against the 9.5 um budget).
// Eight v-cells on the bottoms (~3.8 um) and four on the 3 mm rim
// (~2.3 um) leave real margin. The drain wall is a straight cylinder
// (r constant in v), so its mixed term is exactly zero and one v-cell is
// exact. Total ~18.9k triangles.
const SMALL_POT_DIVISIONS: AnnularSolidReferenceTessellationOptions = Object.freeze({
  angularDivisionsLog2: 8,
  verticalDivisionsLog2ByPatch: Object.freeze({
    'outer-wall': 3,
    'inner-wall': 3,
    'top-rim': 3,
    'bottom-top': 4,
    'bottom-under': 4,
    'drain-wall': 0,
  }),
});

describe('annular solid reference tessellation', () => {
  it('welds a tiny grid into a closed genus-one embedded solid', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    expect(session.triangleCount).toBe(tessellation.triangleCount);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    expect(structural.scanComplete).toBe(true);
  });

  it('builds strictly increasing dyadic edge ladders toward either edge', () => {
    const towardTop = dyadicEdgeLadder(3, 4, 'v1');
    const towardBase = dyadicEdgeLadder(3, 4, 'v0');
    for (const ladder of [towardTop, towardBase]) {
      expect(ladder.log2Denominator).toBe(7);
      expect(ladder.numerators[0]).toBe(0);
      expect(ladder.numerators[ladder.numerators.length - 1]).toBe(128);
      expect(ladder.numerators.length).toBe(8 + 4 + 1);
      for (let station = 1; station < ladder.numerators.length; station += 1) {
        expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
      }
    }
    // Finest rows hug the requested edge with geometrically halving widths.
    expect(towardTop.numerators.slice(-3)).toEqual([126, 127, 128]);
    expect(towardBase.numerators.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it('builds symmetric snapped-feature angular ladders and welds them closed', () => {
    const ladder = snappedFeatureAngularLadder(4, [1 / 24, 5 / 24, 7 / 24], 10);
    const denominator = 1 << ladder.log2Denominator;
    expect(ladder.numerators[0]).toBe(0);
    expect(ladder.numerators[ladder.numerators.length - 1]).toBe(denominator);
    for (let station = 1; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
    }
    // Symmetric under reversal so the atlas's reversed junctions weld.
    for (let station = 0; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBe(
        denominator - ladder.numerators[ladder.numerators.length - 1 - station]
      );
    }
    // A tessellation on the snapped ladder still welds into a closed solid.
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      angularStations: ladder,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    expect(structural.scanComplete).toBe(true);
  });

  it('builds exact-rational feature angular ladders (U3b): stations exactly ON k/N', () => {
    // N = 24 jump lines (odd part 3): every k/24 must be an exact station of
    // the ladder — no dyadic snapping — over denominator 3 * 2^f.
    const ladder = rationalFeatureAngularLadder(4, 24);
    expect(ladder.oddDenominatorFactor).toBe(3);
    const denominator = 3 * 2 ** ladder.log2Denominator;
    expect(ladder.numerators[0]).toBe(0);
    expect(ladder.numerators[ladder.numerators.length - 1]).toBe(denominator);
    for (let station = 1; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
    }
    // Exact feature stations: k/24 = k * (denominator / 24), an integer.
    expect(denominator % 24).toBe(0);
    for (let jump = 0; jump <= 24; jump += 1) {
      expect(ladder.numerators).toContain((jump * denominator) / 24);
    }
    // Symmetric under reversal (numerator -> D - numerator) so the atlas's
    // reversed junction welds stay station-exact.
    for (let station = 0; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBe(
        denominator - ladder.numerators[ladder.numerators.length - 1 - station]
      );
    }
    // A power-of-two jump denominator needs no odd factor at all.
    const dyadic = rationalFeatureAngularLadder(4, 8);
    expect(dyadic.oddDenominatorFactor).toBeUndefined();
  });

  it('welds a rational-ladder tessellation closed and emits rational partitions', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const ladder = rationalFeatureAngularLadder(4, 24);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      angularStations: ladder,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    expect(structural.scanComplete).toBe(true);
    // Every patch partition inherits the angular odd factor and declares the
    // complete unit square over oddFactor * 2^fractionBits on BOTH axes.
    for (const partition of tessellation.partitions) {
      expect(partition.oddDenominatorFactor).toBe('3');
      const declared = 3 * 2 ** partition.fractionBits;
      expect(partition.domain.minUNumerator).toBe('0');
      expect(partition.domain.minVNumerator).toBe('0');
      expect(partition.domain.maxUNumerator).toBe(declared.toString());
      expect(partition.domain.maxVNumerator).toBe(declared.toString());
      // The jump station u = 1/24 appears verbatim among the cell corners.
      const jumpNumerator = declared / 24;
      expect(Number.isInteger(jumpNumerator)).toBe(true);
      const uNumerators = new Set<string>();
      for (const triangle of partition.triangles) {
        for (const vertex of triangle.vertices) {
          uNumerators.add(vertex.uNumerator);
        }
      }
      expect(uNumerators.has(jumpNumerator.toString())).toBe(true);
    }
  });

  it('builds vertical rational-station ladders (U3b slice 5): arbitrary exact p/q stations', () => {
    // Inner-wall lattice lines for a dyadic bottom fraction c = 3/32 sit at
    // v = (4k-3)/29 — arbitrary rationals, not k/N of one family. The
    // ladder must contain each EXACTLY over odd(L)*2^v2(L) with L the lcm
    // of the uniform grid and every station denominator.
    const stations = [1, 2, 3, 4, 5, 6, 7].map(
      (k) => [4 * k - 3, 29] as readonly [number, number]
    );
    const ladder = rationalStationLadder(5, stations);
    expect(ladder.oddDenominatorFactor).toBe(29);
    expect(ladder.log2Denominator).toBe(5);
    const denominator = 29 * 2 ** 5;
    expect(ladder.numerators[0]).toBe(0);
    expect(ladder.numerators[ladder.numerators.length - 1]).toBe(denominator);
    for (let station = 1; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
    }
    for (const [p, q] of stations) {
      expect(Number.isInteger((p * denominator) / q)).toBe(true);
      expect(ladder.numerators).toContain((p * denominator) / q);
    }
  });

  it('combines angular and vertical odd factors in partition emission', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const vertical = rationalStationLadder(2, [[1, 29]]);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      angularStations: rationalFeatureAngularLadder(4, 24),
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
      verticalStationsByPatch: { 'inner-wall': vertical },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    // The inner-wall partition combines q = lcm(3, 29) = 87; every other
    // patch keeps the angular factor 3 alone. All declare the complete unit
    // square over their own q * 2^fractionBits.
    for (const partition of tessellation.partitions) {
      const expectedOdd = partition.patchId === 'inner-wall' ? 87 : 3;
      expect(partition.oddDenominatorFactor).toBe(expectedOdd.toString());
      const declared = expectedOdd * 2 ** partition.fractionBits;
      expect(partition.domain.maxUNumerator).toBe(declared.toString());
      expect(partition.domain.maxVNumerator).toBe(declared.toString());
    }
    const inner = tessellation.partitions.find((p) => p.patchId === 'inner-wall');
    if (inner === undefined) throw new Error('missing inner-wall partition');
    // The rational vertical station 1/29 appears verbatim among v corners.
    const innerDeclared = 87 * 2 ** inner.fractionBits;
    const vNumerators = new Set<string>();
    for (const triangle of inner.triangles) {
      for (const vertex of triangle.vertices) {
        vNumerators.add(vertex.vNumerator);
      }
    }
    expect(innerDeclared % 29).toBe(0);
    expect(vNumerators.has((innerDeclared / 29).toString())).toBe(true);
  });

  it('assigns every artifact triangle to exactly one exact dyadic patch partition', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 3,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 1,
        'inner-wall': 1,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    expect(tessellation.partitions).toHaveLength(6);
    const seen = new Set<number>();
    for (const partition of tessellation.partitions) {
      expect(partition.artifactTriangleCount).toBe(tessellation.triangleCount);
      for (const triangle of partition.triangles) {
        expect(seen.has(triangle.artifactTriangleIndex)).toBe(false);
        seen.add(triangle.artifactTriangleIndex);
      }
    }
    expect(seen.size).toBe(tessellation.triangleCount);
  });

  // Styles proven through the full chain on the small pot. Configs are the
  // measured winners of the 2026-07-15 certification matrix (see
  // research/lab/2026-07-15-g2-style-certification-matrix.md): HarmonicRipple
  // at 9,499,923 pm / 29k tris and SpiralRidges (low-turn gentle helix) at
  // 9,499,969 pm / 54k tris. Styles absent here are blocked by the measured
  // frontier (131,072-triangle cap x 30 s deadline x uniform dyadic grids,
  // plus two screen op gaps), not by the proof machinery.
  const CERTIFIED_POTS: readonly {
    styleId: string;
    styleParams: Readonly<Record<string, number>>;
    geometry: Readonly<Record<string, number>>;
    divisions: AnnularSolidReferenceTessellationOptions;
    maxElapsedMilliseconds: number;
  }[] = [
    {
      styleId: 'HarmonicRipple',
      styleParams: GENTLE_HARMONIC_RIPPLE,
      geometry: SMALL_POT_GEOMETRY,
      divisions: SMALL_POT_DIVISIONS,
      maxElapsedMilliseconds: 30_000,
    },
    {
      styleId: 'SpiralRidges',
      styleParams: {
        spiral_amp_min: 0.02,
        spiral_amp_max: 0.02,
        spiral_groove_amp: 0,
        spiral_turns: 0.2,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 30_000,
    },
    // FULL DEFAULT PARAMETERS — certified 9,499,927 pm over 206,848
    // triangles in ~65 s under the 2026-07-15 resource envelope (524,288
    // mapped triangles / 120 s composed ceiling / differentiated work
    // charging / numeric screen channel).
    {
      styleId: 'FourierBloom',
      styleParams: {},
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 10,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 2,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // FULL DEFAULT PARAMETERS — certified 9,499,679 pm over 107,520
    // triangles in ~38 s once the screen's varying-exponent power gained
    // cell-local a^y*ln(a) bounds (screen v2).
    {
      styleId: 'SuperellipseMorph',
      styleParams: {},
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 9,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // PRODUCTION-DEFAULT SCALE (OD140/H120, gentle params) — certified
    // 9,499,996 pm over 155,648 triangles in ~85 s. The live profile
    // exponent t^1.1 has unbounded curvature at the base (kappa ~ t^-0.9);
    // the geometric v0 wall ladders match that divergence — each dyadic
    // halving toward the base halves the local sag.
    {
      styleId: 'HarmonicRipple',
      styleParams: GENTLE_HARMONIC_RIPPLE,
      geometry: Object.freeze({ ...DEFAULT_GEOMETRY, r_drain: 10 }),
      divisions: {
        angularDivisionsLog2: 9,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 1,
        },
        verticalStationsByPatch: {
          'outer-wall': dyadicEdgeLadder(5, 7, 'v0'),
          'inner-wall': dyadicEdgeLadder(5, 7, 'v0'),
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // FIRST FRACT-FAMILY CERTIFICATE (U3b): gentle Crystalline. Facet and
    // sub-facet wraps are value jumps of fract at u = k/24 — never on a
    // dyadic station, so before exact-rational stations + band-resolved
    // fract nodes every jump-adjacent cell hulled to [0,1] and certification
    // was impossible at ANY density. The rational angular ladder puts all 25
    // wrap stations exactly ON cell boundaries (denominator 3 * 2^8) and the
    // exact per-cell band check takes the smooth shifted path across them.
    {
      styleId: 'Crystalline',
      styleParams: {
        cr_facet_depth: 0.02,
        cr_edge_sharpness: 2,
        cr_asymmetry: 0,
        cr_height_phase: 0,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        angularStations: rationalFeatureAngularLadder(8, 24),
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 3,
          'inner-wall': 3,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 60_000,
    },
    // FIRST style with BOTH exact jump families (U3b slice 6): gentle
    // GeometricStar. Sector floors jump in u (k/8 at pointCount 8) and row
    // floors jump in v (t = k/4 at layers*zoom = 4); the affine sector
    // re-emission (target v6) + the H-32 pot (bottom fraction c = 3/32
    // exactly dyadic) put the outer-wall lines on dyadic stations and the
    // REMAPPED inner-wall lines on the exact rationals v = (8k-3)/29 that
    // the slice-5 vertical rational ladder expresses. Roundness 1 widens the
    // strap smoothstep (edge 0.22) so its diagonal cross-section resolves at
    // walls 2^6 — at roundness 0 the strap fits inside one v-cell and the
    // dense-sampled bottom-edge residual is a real 15.1 um (probe
    // 2026-07-16). Per-patch measured: all six converge, ~37 s geometry.
    {
      styleId: 'GeometricStar',
      styleParams: { gs_relief: 0.02, gs_roundness: 1 },
      geometry: Object.freeze({
        ...DEFAULT_GEOMETRY,
        H: 32,
        top_od: 30,
        bottom_od: 30,
        r_drain: 6,
      }),
      divisions: {
        angularDivisionsLog2: 9,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 6,
          'inner-wall': 6,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'inner-wall': rationalStationLadder(6, [
            [5, 29],
            [13, 29],
            [21, 29],
          ]),
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // POSITIVITY ROUTE, NOT BANDING (slice 8, confirming the slice-7
    // rerouting): SuperformulaBlossom's sign gate argument is transcendental,
    // but gentle params make it interval-positive everywhere — constant
    // integer symmetry (m=6 both ends) keeps every |trig| zero line vertical,
    // even powers n2=2 / n3=4 make the abs-power terms analytically smooth,
    // and n1=1 keeps denominator = cos^2 + sin^4 inside [3/4, 1], clearing
    // the 1e-6 epsilon by 3/4. No banding, no ladder: a plain uniform 2^8
    // grid certified 9,499,801 pm over 53,760 triangles in ~22 s. The
    // reachable level set denominator = epsilon at sharp params (n1 small,
    // n2/n3 large) stays an output-discontinuity/curtain obligation.
    {
      styleId: 'SuperformulaBlossom',
      styleParams: {
        sf_strength: 0.15,
        sf_m_top: 6,
        sf_n1: 1,
        sf_n1_top: 1,
        sf_n2: 2,
        sf_n2_top: 2,
        sf_n3: 4,
        sf_n3_top: 4,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // DYADIC DEFAULT OFFSETS (slice 8): at source_count 4 / rotation 0 every
    // RippleInterference source sits at an EXACT float dyadic (i/4), so the
    // antipode fract jump lines land on k/4 — already uniform-dyadic
    // stations — and the fract argument u - sourceU + 0.5 is point-affine
    // (no tau roundtrip). Addendum-8's float-offset wall exists only at
    // non-power-of-two source counts or rotation != 0 (the honest envelope
    // boundary, exactly like GeometricStar shift != 0). Frequency 6 keeps
    // wall sag ~6.5 um at 2^6 vertical cells. Certified 9,499,975 pm over
    // 86,528 triangles in ~49 s.
    {
      styleId: 'RippleInterference',
      styleParams: {
        ri_source_count: 4,
        ri_wave_frequency: 6,
        ri_relief_depth: 0.15,
        ri_phase: 0,
        ri_rotation: 0,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 6,
          'inner-wall': 6,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
  ];

  // The pot-scale composed proofs take ~20-25 s each, so they ride the
  // PF_G2_POT env gate like the repo's other heavy fidelity gates. This IS
  // the G2 e2e gate: atlas -> reference tessellation -> final bytes -> full
  // partial certification at the 0.01 mm claim.
  for (const certified of CERTIFIED_POTS) {
    it.skipIf(!process.env.PF_G2_POT)(
      `proves a complete ${certified.styleId} pot (${certified.geometry.top_od}mm OD) to the continuous 0.01 mm partial certificate`,
      { timeout: 180_000 },
      () => {
        const { binding, canonicalInput } = atlas(
          certified.geometry,
          certified.styleParams,
          certified.styleId
        );
        const tessellation = tessellateAnnularRadialSolidTargetForCertification(
          binding,
          certified.divisions
        );
        const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
          binding.surfaceComplex
        );
        const session = createFinalArtifactProofSession(tessellation.stlBytes);
        const result = proveFinalStlMappedGeometryAndStructure(
          session,
          canonicalInput,
          target,
          jobsFor(binding, tessellation, target.targetSha256),
          {
            requestedTolerancePm: 10_000_000n,
            reservedNonGeometricMarginPm: 500_000n,
            maxElapsedMilliseconds: certified.maxElapsedMilliseconds,
          }
        );
        // The module can never mint a full certificate — but the continuous
        // two-sided geometric claim over the COMPLETE closed solid must hold.
        expect(result.certified).toBe(false);
        expect(result.provenClaims).toContain('patch-distance');
        expect(result.provenClaims).toContain('artifact-coverage');
        expect(result.provenClaims).toContain('topology');
        expect(result.provenClaims).toContain('self-intersection');
        expect(result.structural.structurallyValid).toBe(true);
        expect(result.geometry.scanComplete).toBe(true);
        const upper = BigInt(result.geometricTwoSidedUpperPm);
        expect(upper > 0n).toBe(true);
        expect(upper <= BigInt(result.geometricBudgetPm)).toBe(true);
        expect(BigInt(result.geometryPlusReservedUpperPm) <= 10_000_000n).toBe(true);
      }
    );
  }

  it.skipIf(!process.env.PF_G2_POT)(
    'refuses fail-closed at production-default scale instead of weakening tolerance',
    { timeout: 120_000 },
    () => {
      // DEFAULT_GEOMETRY at default HarmonicRipple params needs more than the
      // proof layer's 131,072 mapped-triangle hard cap to reach 0.01 mm with a
      // uniform grid. The honest outcome today is a refusal, never a silently
      // weakened tolerance. This documents the exact refusal shape.
      const { binding, canonicalInput } = atlas({ ...DEFAULT_GEOMETRY, r_drain: 10 }, {});
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 10,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 6,
          'inner-wall': 6,
          'top-rim': 1,
          'bottom-top': 3,
          'bottom-under': 3,
          'drain-wall': 2,
        },
      });
      const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
        binding.surfaceComplex
      );
      const session = createFinalArtifactProofSession(tessellation.stlBytes);
      expect(() =>
        proveFinalStlMappedGeometryAndStructure(
          session,
          canonicalInput,
          target,
          jobsFor(binding, tessellation, target.targetSha256),
          {
            requestedTolerancePm: 10_000_000n,
            reservedNonGeometricMarginPm: 500_000n,
            maxElapsedMilliseconds: 30_000,
          }
        )
      ).toThrow(FinalStlPartialCertificationError);
    }
  );
});
