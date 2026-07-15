import type { StyleId } from '../geometry/types';
import { STYLE_PARAM_CAPACITY } from '../utils/styleParams';
import { STYLE_DEFAULT_MIGRATION_VERSION, STYLE_GPU_LAYOUT_VERSION } from './styleContractVersions';

export type GpuParameterTransform = 'identity' | 'degrees-to-radians';

export interface GpuParameterBinding {
  /** Zero-based style_params slot. Slot 47 is reserved for the active-style sentinel. */
  slot: number;
  /** Exact CPU-side transform applied before Float32 upload. */
  transform: GpuParameterTransform;
}

/** Exact binary64 value of JavaScript Math.PI / 180. */
export const DEGREES_TO_RADIANS_BINARY64 = 0.017453292519943295;

/**
 * Numeric semantics used by the v1 packer:
 * binary64 input, one binary64 operation, then IEEE-754 binary32
 * round-to-nearest-ties-to-even (JavaScript Math.fround).
 */
export const STYLE_GPU_TRANSFORM_SPEC = Object.freeze({
  input: 'ieee754-binary64',
  output: 'ieee754-binary32-roundTiesToEven',
  transforms: Object.freeze({
    identity: Object.freeze({
      operation: 'identity-then-f32',
    }),
    'degrees-to-radians': Object.freeze({
      operation: 'binary64-multiply-then-f32',
      scaleBinary64Hex: '0x3f91df46a2529d39',
      scaleDecimal: '0.017453292519943295',
    }),
  }),
});

export function applyGpuParameterTransform(
  value: number,
  transform: GpuParameterTransform
): number {
  const binary64 = transform === 'degrees-to-radians' ? value * DEGREES_TO_RADIANS_BINARY64 : value;
  return Math.fround(binary64);
}

const identity = (slot: number): Readonly<GpuParameterBinding> =>
  Object.freeze({ slot, transform: 'identity' });
const degreesToRadians = (slot: number): Readonly<GpuParameterBinding> =>
  Object.freeze({ slot, transform: 'degrees-to-radians' });

/** Static style-name -> WGSL dispatch index contract. */
export const STYLE_GPU_DISPATCH_MANIFEST = Object.freeze({
  SuperformulaBlossom: 0,
  FourierBloom: 1,
  SpiralRidges: 2,
  SuperellipseMorph: 3,
  HarmonicRipple: 4,
  GothicArches: 5,
  WaveInterference: 6,
  Crystalline: 7,
  ArtDeco: 8,
  DragonScales: 9,
  BambooSegments: 10,
  RippleInterference: 11,
  GyroidManifold: 12,
  Voronoi: 13,
  BasketWeave: 14,
  GeometricStar: 15,
  HexagonalHive: 16,
  CelticKnot: 17,
  CelticTriquetra: 18,
  LowPolyFacet: 19,
} satisfies Record<StyleId, number>);

export const STYLE_GPU_SENTINEL_SPEC = Object.freeze({
  slot: STYLE_PARAM_CAPACITY - 1,
  encoding: 'binary32(styleIndex + 1)',
});

/**
 * Reviewed G1 wire-key -> GPU-slot/transform contract.
 *
 * This table is deliberately independent of the legacy packer implementation:
 * tests compare the packer against this static specification so swapped keys or
 * changed transforms cannot pass through self-derived liveness checks.
 */
export const STYLE_GPU_LAYOUT_MANIFEST = Object.freeze({
  SuperformulaBlossom: Object.freeze({
    sf_strength: identity(0),
    sf_m_base: identity(1),
    sf_m_top: identity(2),
    sf_n1: identity(4),
    sf_n1_top: identity(5),
    sf_m_curve_exp: identity(3),
    sf_a: identity(10),
    sf_b: identity(11),
    sf_n2: identity(6),
    sf_n2_top: identity(7),
    sf_n3: identity(8),
    sf_n3_top: identity(9),
  }),
  FourierBloom: Object.freeze({
    fb_strength: identity(15),
    fb_base_cos8_amp: identity(0),
    fb_top_cos11_amp: identity(6),
    fb_wobble_amp: identity(12),
    fb_wobble_freq: identity(13),
    fb_base_cos8_phase: identity(1),
    fb_base_sin4_amp: identity(2),
    fb_base_sin4_phase: identity(3),
    fb_base_cos12_amp: identity(4),
    fb_base_cos12_phase: identity(5),
    fb_top_cos11_phase: identity(7),
    fb_top_sin7_amp: identity(8),
    fb_top_sin7_phase: identity(9),
    fb_top_cos22_amp: identity(10),
    fb_top_cos22_phase: identity(11),
    fb_wobble_zgain: identity(14),
  }),
  SpiralRidges: Object.freeze({
    spiral_k: identity(0),
    spiral_turns: identity(1),
    spiral_amp_min: identity(2),
    spiral_amp_max: identity(3),
    spiral_groove_amp: identity(5),
    spiral_amp_curve: identity(4),
    spiral_groove_mult: identity(6),
    spiral_phase_mult: identity(7),
  }),
  SuperellipseMorph: Object.freeze({
    se_m_base: identity(0),
    se_m_top: identity(1),
    se_c4_amp: identity(3),
    se_c4_phase_deg: degreesToRadians(4),
    se_c8_amp: identity(5),
    se_m_curve_exp: identity(2),
    se_c8_phase_deg: degreesToRadians(6),
  }),
  HarmonicRipple: Object.freeze({
    hr_petals: identity(0),
    hr_petal_amp: identity(1),
    hr_ripple_freq: identity(4),
    hr_ripple_amp: identity(5),
    hr_bell: identity(8),
    hr_petal_phase_deg: degreesToRadians(2),
    hr_petal_zgain: identity(3),
    hr_ripple_phase_deg: degreesToRadians(6),
    hr_ripple_zgain: identity(7),
  }),
  GothicArches: Object.freeze({
    gaCounts: identity(0),
    gaRelief: identity(1),
    gaPointiness: identity(2),
    gaDiamond: identity(3),
    gaX: identity(4),
    gaSpring: identity(5),
    gaArchHeight: identity(6),
    gaRib: identity(7),
    gaCol: identity(8),
    gaSharp: identity(9),
    gaBands: identity(10),
    gaBandW: identity(11),
  }),
  WaveInterference: Object.freeze({
    wi_feature_count: identity(0),
    wi_relief_depth: identity(1),
    wi_contour_density: identity(2),
    wi_moire_strength: identity(3),
    wi_pattern_style: identity(4),
    wi_helix_pitch: identity(5),
    wi_pitch_mismatch: identity(6),
    wi_domain_warp: identity(7),
    wi_warp_scale: identity(8),
    wi_ridge_contrast: identity(9),
    wi_edge_fade: identity(10),
    wi_phase: identity(11),
  }),
  Crystalline: Object.freeze({
    cr_facet_count: identity(0),
    cr_facet_depth: identity(1),
    cr_edge_sharpness: identity(3),
    cr_sub_facets: identity(2),
    cr_asymmetry: identity(4),
    cr_height_phase: identity(5),
  }),
  ArtDeco: Object.freeze({
    ad_fan_count: identity(0),
    ad_fan_spread: identity(1),
    ad_step_count: identity(2),
    ad_step_depth: identity(3),
    ad_geometric_blend: identity(6),
    ad_chevron_amp: identity(4),
    ad_chevron_freq: identity(5),
  }),
  DragonScales: Object.freeze({
    ds_scale_rows: identity(0),
    ds_scales_per_row: identity(1),
    ds_scale_depth: identity(2),
    ds_overlap: identity(3),
    ds_curvature: identity(4),
    ds_randomize: identity(5),
    ds_height_gradient: identity(6),
  }),
  BambooSegments: Object.freeze({
    bs_node_count: identity(0),
    bs_node_prominence: identity(2),
    bs_node_width: identity(1),
    bs_striations: identity(3),
    bs_taper: identity(5),
    bs_striation_depth: identity(4),
    bs_asymmetry: identity(6),
  }),
  RippleInterference: Object.freeze({
    ri_source_count: identity(0),
    ri_wave_frequency: identity(1),
    ri_relief_depth: identity(2),
    ri_phase: identity(3),
    ri_decay: identity(5),
    ri_source_height: identity(4),
    ri_interference_mode: identity(6),
    ri_rotation: identity(7),
  }),
  GyroidManifold: Object.freeze({
    gm_scale: identity(0),
    gm_thickness: identity(1),
    gm_sharpness: identity(4),
    gm_bias: identity(8),
    gm_curve: identity(9),
    gm_morph: identity(2),
    gm_relief: identity(3),
    gm_z_stretch: identity(5),
    gm_pulse: identity(6),
    gm_edge_fade: identity(7),
  }),
  Voronoi: Object.freeze({
    v_scale: identity(0),
    v_jitter: identity(1),
    v_thickness: identity(2),
    v_relief: identity(3),
    v_morph: identity(4),
    v_z_stretch: identity(5),
    v_pulse: identity(6),
    v_edge_fade: identity(7),
  }),
  BasketWeave: Object.freeze({
    bw_strands: identity(0),
    bw_layers: identity(1),
    bw_depth: identity(2),
    bw_twist: identity(3),
    bw_ratio: identity(4),
    bw_profile: identity(5),
    bw_unders: identity(6),
    bw_noise: identity(7),
    bw_vertical_grad: identity(8),
    bw_phase: identity(9),
  }),
  GeometricStar: Object.freeze({
    gs_points: identity(0),
    gs_gap: identity(1),
    gs_detail: identity(2),
    gs_layers: identity(3),
    gs_interlace: identity(4),
    gs_relief: identity(5),
    gs_roundness: identity(6),
    gs_zoom: identity(7),
    gs_shift: identity(8),
  }),
  HexagonalHive: Object.freeze({
    hh_scale: identity(0),
    hh_gap: identity(1),
    hh_relief: identity(2),
    hh_detail: identity(3),
    hh_concave: identity(4),
    hh_noise: identity(5),
  }),
  CelticKnot: Object.freeze({
    ck_strands: identity(6),
    ck_scale: identity(0),
    ck_width: identity(1),
    ck_relief: identity(2),
    ck_gap: identity(3),
    ck_roundness: identity(4),
    ck_twist: identity(5),
  }),
  CelticTriquetra: Object.freeze({
    ct_scale_x: identity(0),
    ct_rows: identity(1),
    ct_width: identity(2),
    ct_relief: identity(3),
    ct_med_scale: identity(4),
    ct_med_y: identity(5),
    ct_gap: identity(6),
  }),
  LowPolyFacet: Object.freeze({
    lp_facets: identity(0),
    lp_tiers: identity(1),
    lp_amp: identity(2),
    lp_bevel: identity(3),
    lp_jitter: identity(4),
    lp_phase_deg: degreesToRadians(5),
  }),
} satisfies Record<StyleId, Readonly<Record<string, Readonly<GpuParameterBinding>>>>);

export const LEGACY_PACKER_DEFAULT_POLICY = 'registry-schema-defaults-win' as const;

export interface LegacyPackerDefaultDrift {
  styleId: StyleId;
  wireKey: string;
  registryDefault: number;
  legacyPackerFallback: number;
}

/**
 * Missing keys in legacy/partial designs used these packer-local fallbacks.
 * G1 migrated the live packer to registry defaults; this immutable history is
 * retained so old designs and proof bundles can explain the six changed values.
 */
export const LEGACY_PACKER_DEFAULT_DRIFTS: readonly LegacyPackerDefaultDrift[] = Object.freeze([
  Object.freeze({
    styleId: 'GyroidManifold',
    wireKey: 'gm_scale',
    registryDefault: 4,
    legacyPackerFallback: 3.5,
  }),
  Object.freeze({
    styleId: 'GyroidManifold',
    wireKey: 'gm_thickness',
    registryDefault: 0.1,
    legacyPackerFallback: 0.2,
  }),
  Object.freeze({
    styleId: 'GyroidManifold',
    wireKey: 'gm_relief',
    registryDefault: 1.5,
    legacyPackerFallback: 1,
  }),
  Object.freeze({
    styleId: 'GyroidManifold',
    wireKey: 'gm_edge_fade',
    registryDefault: 0.2,
    legacyPackerFallback: 0.15,
  }),
  Object.freeze({
    styleId: 'CelticTriquetra',
    wireKey: 'ct_med_y',
    registryDefault: 0.69,
    legacyPackerFallback: 0.7,
  }),
  Object.freeze({
    styleId: 'CelticTriquetra',
    wireKey: 'ct_gap',
    registryDefault: 0.05,
    legacyPackerFallback: 0.06,
  }),
]);

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const canonicalStyles = Object.fromEntries(
  Object.entries(STYLE_GPU_LAYOUT_MANIFEST)
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .map(([styleName, bindings]) => {
      const styleId = styleName as StyleId;
      const styleIndex = STYLE_GPU_DISPATCH_MANIFEST[styleId];
      return [
        styleName,
        {
          styleIndex,
          sentinelValue: styleIndex + 1,
          bindings: Object.fromEntries(
            Object.entries(bindings).sort(([a], [b]) => compareCodeUnits(a, b))
          ),
        },
      ];
    })
);

const canonicalDefaultDrifts = [...LEGACY_PACKER_DEFAULT_DRIFTS]
  .sort((a, b) => compareCodeUnits(a.styleId, b.styleId) || compareCodeUnits(a.wireKey, b.wireKey))
  .map((drift) => ({
    styleId: drift.styleId,
    wireKey: drift.wireKey,
    registryDefault: drift.registryDefault,
    legacyPackerFallback: drift.legacyPackerFallback,
  }));

/**
 * Stable combined material for G0/G2 proof bundles and cross-language fixtures.
 * This binds layout, dispatch, sentinel, numeric transform, and migration truth.
 * It does not claim CPU/WGSL geometric evaluator parity.
 */
export const STYLE_GPU_LAYOUT_CANONICAL_JSON = JSON.stringify({
  version: STYLE_GPU_LAYOUT_VERSION,
  capacity: STYLE_PARAM_CAPACITY,
  sentinel: STYLE_GPU_SENTINEL_SPEC,
  transformSpec: STYLE_GPU_TRANSFORM_SPEC,
  styles: canonicalStyles,
  defaultMigration: {
    version: STYLE_DEFAULT_MIGRATION_VERSION,
    policy: LEGACY_PACKER_DEFAULT_POLICY,
    drifts: canonicalDefaultDrifts,
  },
});

export function getStyleGpuBinding(
  styleId: StyleId,
  wireKey: string
): Readonly<GpuParameterBinding> | undefined {
  if (!Object.prototype.hasOwnProperty.call(STYLE_GPU_LAYOUT_MANIFEST, styleId)) {
    return undefined;
  }
  const bindings = STYLE_GPU_LAYOUT_MANIFEST[styleId] as Readonly<
    Record<string, Readonly<GpuParameterBinding>>
  >;
  return Object.prototype.hasOwnProperty.call(bindings, wireKey) ? bindings[wireKey] : undefined;
}
