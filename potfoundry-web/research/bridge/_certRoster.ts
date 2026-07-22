// _certRoster.ts — the PF_G2_POT certified roster, extracted so the STL emitter
// (_certifiedPotStl.test.ts) AND the error-overlay baker (_certRosterErrorBake.test.ts)
// consume ONE copy. Configs are verbatim from CERTIFIED_POTS in
// src/geometry/targetSolid/annularSolidReferenceTessellation.test.ts (the gate's
// own roster — keep in sync if that grows). The Voronoi hash-desync lesson,
// applied proactively: a second hand-typed copy would drift.
import { DEFAULT_GEOMETRY, type GeometryParams } from '../../src/state/types';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import {
  dyadicEdgeLadder,
  rationalFeatureAngularLadder,
  rationalStationLadder,
  type AnnularSolidReferenceTessellationOptions,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';

export const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
export const SMALL_POT_GEOMETRY: GeometryParams = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 40,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});
const GENTLE_HARMONIC_RIPPLE = Object.freeze({ hr_petal_amp: 0.01, hr_ripple_amp: 0, hr_bell: 0 });

export function atlas(
  geometry: GeometryParams,
  styleParams: Readonly<Record<string, number>>,
  styleId: string
): SinglePatchAnnularRadialSolidTargetBinding {
  const canonicalInput = createCanonicalTargetInputBinding(geometry, styleId, styleParams, TARGET_CONTROLS);
  return createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
}

export interface CertifiedPot {
  readonly name: string;
  readonly styleId: string;
  readonly styleParams: Readonly<Record<string, number>>;
  readonly geometry: GeometryParams;
  readonly divisions: AnnularSolidReferenceTessellationOptions;
}

export const CERTIFIED_POTS: ReadonlyArray<CertifiedPot> = [
  {
    name: 'HarmonicRipple_small_OD30',
    styleId: 'HarmonicRipple',
    styleParams: GENTLE_HARMONIC_RIPPLE,
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 3, 'inner-wall': 3, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'SpiralRidges_small_OD30',
    styleId: 'SpiralRidges',
    styleParams: { spiral_amp_min: 0.02, spiral_amp_max: 0.02, spiral_groove_amp: 0, spiral_turns: 0.2 },
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'FourierBloom_small_OD30_defaults',
    styleId: 'FourierBloom',
    styleParams: {},
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 10,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 2, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'SuperellipseMorph_small_OD30_defaults',
    styleId: 'SuperellipseMorph',
    styleParams: {},
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'HarmonicRipple_production_OD140',
    styleId: 'HarmonicRipple',
    styleParams: GENTLE_HARMONIC_RIPPLE,
    geometry: Object.freeze({ ...DEFAULT_GEOMETRY, r_drain: 10 }),
    divisions: {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 3, 'bottom-top': 5, 'bottom-under': 5, 'drain-wall': 1,
      },
      verticalStationsByPatch: {
        'outer-wall': dyadicEdgeLadder(5, 7, 'v0'),
        'inner-wall': dyadicEdgeLadder(5, 7, 'v0'),
      },
    },
  },
  {
    name: 'Crystalline_small_OD30_fract',
    styleId: 'Crystalline',
    styleParams: { cr_facet_depth: 0.02, cr_edge_sharpness: 2, cr_asymmetry: 0, cr_height_phase: 0 },
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      angularStations: rationalFeatureAngularLadder(8, 24),
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 3, 'inner-wall': 3, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'GeometricStar_H32_OD30_fract',
    styleId: 'GeometricStar',
    styleParams: { gs_relief: 0.02, gs_roundness: 1 },
    geometry: Object.freeze({ ...DEFAULT_GEOMETRY, H: 32, top_od: 30, bottom_od: 30, r_drain: 6 }),
    divisions: {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 6, 'inner-wall': 6, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
      verticalStationsByPatch: {
        'inner-wall': rationalStationLadder(6, [
          [5, 29],
          [13, 29],
          [21, 29],
        ]),
      },
    },
  },
  {
    name: 'Voronoi_H32_OD30_bubble',
    styleId: 'Voronoi',
    styleParams: { v_morph: 0, v_relief: 0.04 },
    geometry: Object.freeze({ ...DEFAULT_GEOMETRY, H: 32, top_od: 30, bottom_od: 30, r_drain: 6 }),
    divisions: {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 7, 'inner-wall': 7, 'top-rim': 3, 'bottom-top': 5, 'bottom-under': 5, 'drain-wall': 0,
      },
      verticalStationsByPatch: {
        'inner-wall': rationalStationLadder(7, [
          [1, 29], [5, 29], [9, 29], [13, 29], [17, 29], [21, 29], [25, 29],
        ]),
      },
    },
  },
  {
    name: 'Crystalline_H32_OD30_hp025_conforming',
    styleId: 'Crystalline',
    styleParams: {
      cr_facet_depth: 0.02, cr_edge_sharpness: 2, cr_asymmetry: 0, cr_height_phase: 0.25,
    },
    geometry: Object.freeze({ ...DEFAULT_GEOMETRY, H: 32, top_od: 30, bottom_od: 30, r_drain: 6 }),
    divisions: {
      angularDivisionsLog2: 8,
      angularStations: rationalStationLadder(8, [
        ...Array.from({ length: 47 }, (_, j) => [j + 1, 48] as const),
        ...Array.from({ length: 24 }, (_, k) => [64 * (k + 1) - 3, 1536] as const),
        ...Array.from({ length: 24 }, (_, k) => [64 * k + 3, 1536] as const),
      ]),
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 4, 'inner-wall': 4, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
      conformingLinesByPatch: {
        'outer-wall': Array.from({ length: 24 }, (_, i) => ({
          aNumerator: 48, bNumerator: 1, cNumerator: 2 * (i + 1),
        })),
        'inner-wall': Array.from({ length: 24 }, (_, i) => ({
          aNumerator: 1536, bNumerator: -29, cNumerator: 1539 - 64 * (i + 1),
        })),
        'drain-wall': Array.from({ length: 24 }, (_, i) => ({
          aNumerator: 1536, bNumerator: -3, cNumerator: 1536 - 64 * (i + 1),
        })),
      },
    },
  },
  {
    name: 'WaveInterference_H32_OD30_smoothDense',
    styleId: 'WaveInterference',
    styleParams: { wi_relief_depth: 0.25, wi_edge_fade: 0 },
    geometry: Object.freeze({ ...DEFAULT_GEOMETRY, H: 32, top_od: 30, bottom_od: 30, r_drain: 6 }),
    divisions: {
      angularDivisionsLog2: 10,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 6, 'inner-wall': 6, 'top-rim': 3, 'bottom-top': 5, 'bottom-under': 5, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'SuperformulaBlossom_small_OD30_positivity',
    styleId: 'SuperformulaBlossom',
    styleParams: {
      sf_strength: 0.15, sf_m_top: 6, sf_n1: 1, sf_n1_top: 1, sf_n2: 2, sf_n2_top: 2, sf_n3: 4, sf_n3_top: 4,
    },
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'RippleInterference_small_OD30_dyadicOffsets',
    styleId: 'RippleInterference',
    styleParams: {
      ri_source_count: 4, ri_wave_frequency: 6, ri_relief_depth: 0.15, ri_phase: 0, ri_rotation: 0,
    },
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 6, 'inner-wall': 6, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
];
