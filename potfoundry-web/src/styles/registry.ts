import { StyleSchema } from '../state/types';
import { StyleId } from '../geometry/types';

/**
 * Single source of truth for all Style definitions.
 * This registry powers:
 * 1. The ID constants (STYLE_IDS)
 * 2. The Shader Dispatch Logic (STYLE_FUNCTION_MAP)
 * 3. The UI Parameters (STYLE_SCHEMAS)
 */
export interface StyleConfig extends StyleSchema {
    id: number;
    shaderName: string;
}

/**
 * Registry of all available styles.
 * Order matters for ID generation if we auto-assigned, but we use explicit IDs here.
 */
export const STYLE_REGISTRY: Record<string, StyleConfig> = {
    SuperformulaBlossom: {
        id: 0,
        shaderName: 'sf_radius',
        name: 'Superformula Blossom',
        description: 'Petals via Gielis superformula; sharpen toward rim.',
        params: {
            sf_strength: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.0, label: 'Blossom Strength', description: 'Blend from base shape (0) to blossom-modulated profile (1)' },
            sf_m_base: { type: 'float', min: 2, max: 14, step: 0.5, default: 6.0, label: 'Symmetry @ Base', description: 'Superformula symmetry count near base' },
            sf_m_top: { type: 'float', min: 2, max: 18, step: 0.5, default: 10.0, label: 'Symmetry @ Top', description: 'Superformula symmetry count near rim' },
            sf_n1: { type: 'float', min: 0.1, max: 4, step: 0.05, default: 0.35, label: 'Sharpness @ Base', description: 'Higher = sharper corners at the base' },
            sf_n1_top: { type: 'float', min: 0.1, max: 4, step: 0.05, default: 0.50, label: 'Sharpness @ Top', description: 'Higher = sharper corners near the rim' },
        },
        advancedParams: {
            sf_m_curve_exp: { type: 'float', min: 0.6, max: 2, step: 0.05, default: 1.2, label: 'Symmetry Morph Curve', description: 'Exponent controlling how symmetry morphs along height' },
            sf_a: { type: 'float', min: 0.4, max: 2.5, step: 0.05, default: 1.0, label: 'Radius Scale (a)', description: 'Superformula parameter a' },
            sf_b: { type: 'float', min: 0.4, max: 2.5, step: 0.05, default: 1.0, label: 'Radius Scale (b)', description: 'Superformula parameter b' },
            sf_n2: { type: 'float', min: 0.2, max: 4, step: 0.05, default: 0.8, label: 'Cos Power @ Base (n2)', description: 'Exponent on cosine term at base' },
            sf_n2_top: { type: 'float', min: 0.2, max: 4, step: 0.05, default: 1.4, label: 'Cos Power @ Top (n2)', description: 'Exponent on cosine term near rim' },
            sf_n3: { type: 'float', min: 0.2, max: 4, step: 0.05, default: 0.8, label: 'Sin Power @ Base (n3)', description: 'Exponent on sine term at base' },
            sf_n3_top: { type: 'float', min: 0.2, max: 4, step: 0.05, default: 0.8, label: 'Sin Power @ Top (n3)', description: 'Exponent on sine term near rim' },
        },
    },

    FourierBloom: {
        id: 1,
        shaderName: 'fourier_radius',
        name: 'Fourier Bloom',
        description: 'Floral ridges from Fourier series; twist offset for helix.',
        params: {
            fb_strength: { type: 'float', min: 0, max: 2, step: 0.05, default: 1.0, label: 'Harmonic Strength', description: 'Intensity of the blended Fourier detail' },
            fb_base_cos8_amp: { type: 'float', min: -1, max: 1, step: 0.01, default: 0.12, label: 'Base cos(8θ) Amp', description: '8-fold modulation at base' },
            fb_top_cos11_amp: { type: 'float', min: -1, max: 1, step: 0.01, default: 0.18, label: 'Top cos(11θ) Amp', description: '11-fold modulation at top' },
            fb_wobble_amp: { type: 'float', min: 0, max: 0.4, step: 0.01, default: 0.06, label: 'Wobble Amplitude', description: 'Gentle wobble across height' },
            fb_wobble_freq: { type: 'int', min: 1, max: 16, step: 1, default: 5, label: 'Wobble Frequency', description: 'Wobble cycles around circumference' },
        },
        advancedParams: {
            fb_base_cos8_phase: { type: 'float', min: -3.14, max: 3.14, step: 0.01, default: 0.0, label: 'Base cos(8θ) Phase', description: 'Phase for base cos(8θ) in radians' },
            fb_base_sin4_amp: { type: 'float', min: -1, max: 1, step: 0.01, default: 0.05, label: 'Base sin(4θ) Amp', description: '4-fold modulation at base' },
            fb_base_sin4_phase: { type: 'float', min: -3.14, max: 3.14, step: 0.01, default: 0.6, label: 'Base sin(4θ) Phase', description: 'Phase for base sin(4θ) in radians' },
            fb_base_cos12_amp: { type: 'float', min: -1, max: 1, step: 0.01, default: -0.04, label: 'Base cos(12θ) Amp', description: '12-fold modulation at base' },
            fb_base_cos12_phase: { type: 'float', min: -3.14, max: 3.14, step: 0.01, default: 1.3, label: 'Base cos(12θ) Phase', description: 'Phase for base cos(12θ) in radians' },
            fb_top_cos11_phase: { type: 'float', min: -3.14, max: 3.14, step: 0.01, default: 0.5, label: 'Top cos(11θ) Phase', description: 'Phase for top cos(11θ) in radians' },
            fb_top_sin7_amp: { type: 'float', min: -1, max: 1, step: 0.01, default: -0.07, label: 'Top sin(7θ) Amp', description: '7-fold modulation at top' },
            fb_top_sin7_phase: { type: 'float', min: -3.14, max: 3.14, step: 0.01, default: 0.0, label: 'Top sin(7θ) Phase', description: 'Phase for top sin(7θ) in radians' },
            fb_top_cos22_amp: { type: 'float', min: -1, max: 1, step: 0.01, default: 0.05, label: 'Top cos(22θ) Amp', description: '22-fold modulation at top' },
            fb_top_cos22_phase: { type: 'float', min: -3.14, max: 3.14, step: 0.01, default: 0.9, label: 'Top cos(22θ) Phase', description: 'Phase for top cos(22θ) in radians' },
            fb_wobble_zgain: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Wobble Z-Gain', description: 'How wobble evolves with height' },
        },
    },

    SpiralRidges: {
        id: 2,
        shaderName: 'spiral_radius',
        name: 'Spiral Ridges',
        description: 'Helical ridges spiraling around the pot.',
        params: {
            spiral_k: { type: 'int', min: 3, max: 24, step: 1, default: 9, label: 'Ridge Count', description: 'Number of spiral ridges' },
            spiral_turns: { type: 'float', min: 0.2, max: 3, step: 0.05, default: 1.15, label: 'Helix Turns', description: 'Total helical turns from base to rim' },
            spiral_amp_min: { type: 'float', min: 0, max: 0.7, step: 0.01, default: 0.15, label: 'Amplitude @ Base', description: 'Ridge height near the base (fraction of radius)' },
            spiral_amp_max: { type: 'float', min: 0, max: 0.8, step: 0.01, default: 0.25, label: 'Amplitude @ Top', description: 'Ridge height near the rim (fraction of radius)' },
            spiral_groove_amp: { type: 'float', min: 0, max: 0.12, step: 0.005, default: 0.04, label: 'Fine Groove Amp', description: 'Adds fine grooves on top of ridges' },
        },
        advancedParams: {
            spiral_amp_curve: { type: 'float', min: 0.6, max: 2, step: 0.05, default: 1.3, label: 'Amplitude Curve', description: 'Exponent controlling how ridge amplitude grows with height' },
            spiral_groove_mult: { type: 'float', min: 1, max: 5, step: 0.1, default: 3.0, label: 'Groove Freq × k', description: 'Frequency multiplier for grooves relative to ridge count' },
            spiral_phase_mult: { type: 'float', min: 0, max: 3, step: 0.1, default: 1.7, label: 'Groove Phase × turns', description: 'Phase multiplier for grooves relative to helix turns' },
        },
    },

    SuperellipseMorph: {
        id: 3,
        shaderName: 'superellipse_radius',
        name: 'Superellipse Morph',
        description: 'Circle → rounded square → soft diamond vs height.',
        params: {
            se_m_base: { type: 'float', min: 1, max: 6, step: 0.1, default: 2.0, label: 'Power @ Base', description: 'Lamé exponent near base; 2=circle, higher=squarer' },
            se_m_top: { type: 'float', min: 1, max: 8, step: 0.1, default: 5.5, label: 'Power @ Top', description: 'Lamé exponent near the rim' },
            se_c4_amp: { type: 'float', min: 0, max: 0.25, step: 0.005, default: 0.08, label: 'cos(4θ) Amplitude', description: 'Amplitude for 4-fold modulation (square-like)' },
            se_c4_phase_deg: { type: 'int', min: -180, max: 180, step: 1, default: 23, label: 'cos(4θ) Phase', description: 'Phase for 4-fold modulation', unit: '°' },
            se_c8_amp: { type: 'float', min: 0, max: 0.25, step: 0.005, default: 0.03, label: 'cos(8θ) Amplitude', description: 'Amplitude for 8-fold modulation (star-like)' },
        },
        advancedParams: {
            se_m_curve_exp: { type: 'float', min: 0.6, max: 2, step: 0.05, default: 1.1, label: 'Power Morph Curve', description: 'Exponent controlling how the power morphs along height' },
            se_c8_phase_deg: { type: 'int', min: -180, max: 180, step: 1, default: 0, label: 'cos(8θ) Phase', description: 'Phase for 8-fold modulation', unit: '°' },
        },
    },

    HarmonicRipple: {
        id: 4,
        shaderName: 'harmonic_radius',
        name: 'Harmonic Ripple',
        description: 'Petals + ripples + gentle mid-height bell.',
        params: {
            hr_petals: { type: 'int', min: 3, max: 24, step: 1, default: 7, label: 'Petal Count', description: 'Number of large lobes (petals) around the pot' },
            hr_petal_amp: { type: 'float', min: 0, max: 0.4, step: 0.01, default: 0.16, label: 'Petal Amplitude', description: 'How prominent the petal lobes are' },
            hr_ripple_freq: { type: 'int', min: 5, max: 60, step: 1, default: 31, label: 'Ripple Frequency', description: 'Number of fine ripples around the circumference' },
            hr_ripple_amp: { type: 'float', min: 0, max: 0.12, step: 0.005, default: 0.03, label: 'Ripple Amplitude', description: 'Height of fine ripples' },
            hr_bell: { type: 'float', min: 0, max: 0.25, step: 0.005, default: 0.05, label: 'Mid-Height Boost', description: 'Extra bell-like bulge around mid-height' },
        },
        advancedParams: {
            hr_petal_phase_deg: { type: 'int', min: -180, max: 180, step: 1, default: 17, label: 'Petal Phase', description: 'Rotational phase offset for petals', unit: '°' },
            hr_petal_zgain: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.6, label: 'Petal Z-Gain', description: 'How petal pattern evolves with height' },
            hr_ripple_phase_deg: { type: 'int', min: -180, max: 180, step: 1, default: 0, label: 'Ripple Phase', description: 'Rotational phase offset for ripples', unit: '°' },
            hr_ripple_zgain: { type: 'float', min: 0, max: 1, step: 0.05, default: 1.0, label: 'Ripple Z-Gain', description: 'How ripple pattern evolves with height' },
        },
    },

    LowPolyFacet: {
        id: 4, // Alias to HarmonicRipple in shader, but unique in UI? No, usually unique ID. Wait, styleParams.ts said alias. Let's check shader. In shader, STYLE_HARMONIC=4. LowPolyFacet doesn't seem to have its own ID in shader?
        // Wait, styleParams.ts: LowPolyFacet: 4. So it maps to HarmonicRipple? 
        // This seems like a legacy alias. But looking at schema, it has totally different params (lp_facets vs hr_petals).
        // If they share ID 4, they share the shader function. 
        // In shader: harmonic_radius uses hr_petals etc.
        // LowPoly params in styles.ts: lp_facets -> (handled as hr_petals?). 
        // This implies LowPoly is just a preset of HarmonicRipple? 
        // Let's check packHarmonic in styleParams.ts. 
        // Yes, if I look at styleParams.ts (which I didn't fully read), I bet packHarmonic handles both or packLowPoly calls packHarmonic.
        // For registry, if they are conceptually different, we can keep them separate here, but they must map to ID 4.
        // However, if they map to ID 4, the shader only sees ID 4.
        shaderName: 'harmonic_radius',
        name: 'Low Poly Facet',
        description: 'Piecewise-flat facets for low-poly aesthetic.',
        params: {
            lp_facets: { type: 'int', min: 3, max: 72, step: 1, default: 12, label: 'Facet Count', description: 'Number of flat facets around the pot' },
            lp_tiers: { type: 'int', min: 1, max: 12, step: 1, default: 1, label: 'Vertical Tiers', description: 'Segment height into tiers with phase shifts' },
            lp_amp: { type: 'float', min: 0, max: 0.4, step: 0.005, default: 0.12, label: 'Facet Amplitude', description: 'How deep edges cut in (fraction of radius)' },
            lp_bevel: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.15, label: 'Bevel Softness', description: 'Higher = more rounded edges; 0 = sharp' },
            lp_jitter: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.15, label: 'Tier Phase Jitter', description: 'Phase offset between tiers' },
        },
        advancedParams: {
            lp_phase_deg: { type: 'int', min: -180, max: 180, step: 1, default: 0, label: 'Facet Phase', description: 'Global rotational offset in degrees', unit: '°' },
        },
    },

    GothicArches: {
        id: 5,
        shaderName: 'gothic_arches_radius',
        name: 'Gothic Arches',
        description: 'Interlaced pointed arch patterns with tracery.',
        params: {
            gaCounts: { type: 'float', min: 3, max: 32, step: 1, default: 12, label: 'Arch Count', description: 'Number of arches around the circumference' },
            gaRelief: { type: 'float', min: 0, max: 5.0, step: 0.1, default: 1.5, label: 'Relief Depth (mm)', description: 'Physical depth of the arch pattern' },
            gaPointiness: { type: 'float', min: 0.25, max: 2.0, step: 0.05, default: 1.2, label: 'Pointiness', description: 'Shape of the arch curve (0.5=round, >1=pointed)' },
            gaDiamond: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Diamond Lattice', description: 'Visibility of upper diamond tracery' },
            gaX: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.0, label: 'X-Tracery', description: 'Visibility of lower X-tracery' },
        },
        advancedParams: {
            gaSpring: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.15, label: 'Spring Line', description: 'Height where arches start' },
            gaArchHeight: { type: 'float', min: 0.1, max: 1, step: 0.05, default: 0.7, label: 'Arch Height', description: 'Height of the main arch bay' },
            gaRib: { type: 'float', min: 0.01, max: 0.2, step: 0.01, default: 0.04, label: 'Rib Width', description: 'structural rib thickness' },
            gaCol: { type: 'float', min: 0.01, max: 0.3, step: 0.01, default: 0.15, label: 'Column Width', description: 'Width of supporting columns' },
            gaSharp: { type: 'float', min: 1, max: 10, step: 0.5, default: 4.0, label: 'Sharpness', description: 'Crispness of edges (ridge sharpness)' },
            gaBands: { type: 'float', min: 0, max: 1, step: 0.05, default: 1.0, label: 'Bands Visibility', description: 'Visibility of horizontal bands' },
            gaBandW: { type: 'float', min: 0.01, max: 0.1, step: 0.005, default: 0.04, label: 'Band Width', description: 'Width of horizontal bands' },
        },
    },

    WaveInterference: {
        id: 6,
        shaderName: 'wave_interference_radius',
        name: 'Wave Interference',
        description: 'Complex moiré-like patterns with domain warping.',
        params: {
            wi_feature_count: { type: 'float', min: 0, max: 3, step: 0.05, default: 0.0, label: 'Feature Count', description: 'Scale/Frequency of the wave features' },
            wi_relief_depth: { type: 'float', min: 0, max: 10.0, step: 0.1, default: 2.3, label: 'Relief Depth', description: 'Physical depth of the pattern (mm)', unit: 'mm' },
            wi_contour_density: { type: 'float', min: 0, max: 2, step: 0.05, default: 0.45, label: 'Contour Density', description: 'Density of ridge lines' },
            wi_moire_strength: { type: 'float', min: 0, max: 1.5, step: 0.05, default: 0.70, label: 'Moiré Strength', description: 'Intensity of interference effect' },
            wi_pattern_style: { type: 'float', min: 0, max: 3, step: 0.05, default: 0.10, label: 'Pattern Style', description: 'Blend between pattern variations' },
        },
        advancedParams: {
            wi_helix_pitch: { type: 'float', min: 0, max: 3, step: 0.05, default: 0.40, label: 'Helix Pitch', description: 'Vertical spiral capability' },
            wi_pitch_mismatch: { type: 'float', min: 0, max: 5, step: 0.1, default: 0.50, label: 'Pitch Mismatch', description: 'Offset between wave layers' },
            wi_domain_warp: { type: 'float', min: 0, max: 3, step: 0.05, default: 0.45, label: 'Domain Warp', description: 'Coordinate distortion strength' },
            wi_warp_scale: { type: 'float', min: 0, max: 3, step: 0.05, default: 0.50, label: 'Warp Scale', description: 'Scale of coordinate distortion' },
            wi_ridge_contrast: { type: 'float', min: 0, max: 2, step: 0.05, default: 0.45, label: 'Ridge Contrast', description: 'Sharpness of peaks' },
            wi_edge_fade: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.50, label: 'Edge Fade', description: 'Pattern fade at top/bottom' },
            wi_phase: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.30, label: 'Phase', description: 'Animation phase offset' },
        },
    },

    Crystalline: {
        id: 7,
        shaderName: 'crystalline_radius',
        name: 'Crystalline',
        description: 'Faceted crystal surfaces with geometric complexity.',
        params: {
            cr_facet_count: { type: 'int', min: 4, max: 24, step: 1, default: 12, label: 'Facet Count', description: 'Number of primary crystal facets' },
            cr_facet_depth: { type: 'float', min: 0, max: 0.3, step: 0.01, default: 0.15, label: 'Facet Depth', description: 'Depth of facet cuts' },
            cr_edge_sharpness: { type: 'float', min: 0.5, max: 5, step: 0.1, default: 2.5, label: 'Edge Sharpness', description: 'Sharpness of facet edges' },
            cr_sub_facets: { type: 'int', min: 1, max: 4, step: 1, default: 2, label: 'Sub-Facets', description: 'Secondary facet subdivisions' },
        },
        advancedParams: {
            cr_asymmetry: { type: 'float', min: 0, max: 0.5, step: 0.02, default: 0.15, label: 'Asymmetry', description: 'Random variation in facets' },
            cr_height_phase: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.4, label: 'Height Phase', description: 'Phase shift along height' },
        },
    },

    ArtDeco: {
        id: 8,
        shaderName: 'art_deco_radius',
        name: 'Art Deco',
        description: '1920s geometric styling with sunbursts and chevrons.',
        params: {
            ad_fan_count: { type: 'int', min: 4, max: 16, step: 1, default: 8, label: 'Fan Count', description: 'Number of sunburst fans' },
            ad_fan_spread: { type: 'float', min: 0.1, max: 0.8, step: 0.05, default: 0.4, label: 'Fan Spread', description: 'Spread angle of fan rays' },
            ad_step_count: { type: 'int', min: 2, max: 8, step: 1, default: 4, label: 'Step Tiers', description: 'Number of stepped tiers' },
            ad_step_depth: { type: 'float', min: 0, max: 0.2, step: 0.01, default: 0.08, label: 'Step Depth', description: 'Depth of step indents' },
            ad_geometric_blend: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Pattern Blend', description: 'Blend between fan and chevron patterns' },
        },
        advancedParams: {
            ad_chevron_amp: { type: 'float', min: 0, max: 0.15, step: 0.01, default: 0.06, label: 'Chevron Amplitude', description: 'Chevron zigzag intensity' },
            ad_chevron_freq: { type: 'int', min: 2, max: 12, step: 1, default: 6, label: 'Chevron Frequency', description: 'Number of chevron zigzags' },
        },
    },

    DragonScales: {
        id: 9,
        shaderName: 'dragon_scales_radius',
        name: 'Dragon Scales',
        description: 'Overlapping scale patterns like dragon or fish scales.',
        params: {
            ds_scale_rows: { type: 'int', min: 3, max: 20, step: 1, default: 8, label: 'Scale Rows', description: 'Rows of scales along height' },
            ds_scales_per_row: { type: 'int', min: 8, max: 36, step: 1, default: 16, label: 'Scales Per Row', description: 'Number of scales around circumference' },
            ds_scale_depth: { type: 'float', min: 0, max: 0.25, step: 0.01, default: 0.12, label: 'Scale Depth', description: 'Depth of scale indents' },
            ds_overlap: { type: 'float', min: 0.2, max: 0.8, step: 0.05, default: 0.5, label: 'Overlap', description: 'How much scales overlap' },
            ds_curvature: { type: 'float', min: 0.5, max: 3, step: 0.1, default: 1.5, label: 'Curvature', description: 'Curvature of scale shape' },
        },
        advancedParams: {
            ds_randomize: { type: 'float', min: 0, max: 0.3, step: 0.02, default: 0.1, label: 'Randomize', description: 'Random variation in scales' },
            ds_height_gradient: { type: 'float', min: 0.5, max: 2, step: 0.1, default: 1.2, label: 'Size Gradient', description: 'Scale size change along height' },
        },
    },

    BambooSegments: {
        id: 10,
        shaderName: 'bamboo_segments_radius',
        name: 'Bamboo Segments',
        description: 'Bamboo-inspired node segments with fine striations.',
        params: {
            bs_node_count: { type: 'int', min: 2, max: 12, step: 1, default: 5, label: 'Node Count', description: 'Number of bamboo nodes/segments' },
            bs_node_prominence: { type: 'float', min: 0, max: 0.2, step: 0.01, default: 0.08, label: 'Node Prominence', description: 'How much nodes bulge outward' },
            bs_node_width: { type: 'float', min: 0.02, max: 0.15, step: 0.01, default: 0.06, label: 'Node Width', description: 'Width of node rings' },
            bs_striations: { type: 'int', min: 0, max: 24, step: 1, default: 12, label: 'Striations', description: 'Fine vertical lines between nodes' },
            bs_taper: { type: 'float', min: 0, max: 0.15, step: 0.01, default: 0.05, label: 'Inter-Node Taper', description: 'Inward curve between nodes' },
        },
        advancedParams: {
            bs_striation_depth: { type: 'float', min: 0, max: 0.05, step: 0.002, default: 0.015, label: 'Striation Depth', description: 'Depth of striation grooves' },
            bs_asymmetry: { type: 'float', min: 0, max: 0.3, step: 0.02, default: 0.1, label: 'Asymmetry', description: 'Random node spacing variation' },
        },
    },

    RippleInterference: {
        id: 11,
        shaderName: 'ripple_interference_radius',
        name: 'Ripple Interference',
        description: 'Physics-based wave interference pattern from multiple sources.',
        params: {
            ri_source_count: { type: 'int', min: 2, max: 8, step: 1, default: 4, label: 'Source Count', description: 'Number of wave emitters' },
            ri_wave_frequency: { type: 'float', min: 4, max: 24, step: 1, default: 12, label: 'Frequency', description: 'Frequency of the waves' },
            ri_relief_depth: { type: 'float', min: 0, max: 3, step: 0.1, default: 1.5, label: 'Relief Depth', description: 'Depth of the interference pattern', unit: 'mm' },
            ri_phase: { type: 'float', min: 0, max: 1, step: 0.01, default: 0, label: 'Phase', description: 'Animation phase of the waves' },
            ri_decay: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Decay', description: 'How fast waves fade out' },
        },
        advancedParams: {
            ri_source_height: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Source Height', description: 'Vertical position of emitters' },
            ri_interference_mode: { type: 'int', min: 0, max: 2, step: 1, default: 0, label: 'Mode', description: '0: Add, 1: Multiply, 2: Max' },
            ri_rotation: { type: 'float', min: 0, max: 1, step: 0.01, default: 0, label: 'Rotation', description: 'Rotate source positions' },
        },
    },

    GyroidManifold: {
        id: 12,
        shaderName: 'style_gyroid_manifold',
        name: 'Gyroid Manifold',
        description: 'Intricate porous lattice based on Triply Periodic Minimal Surfaces.',
        params: {
            gm_scale: { type: 'float', min: 1, max: 12, step: 0.1, default: 4.0, label: 'Lattice Scale', description: 'Density of the lattice cells' },
            gm_thickness: { type: 'float', min: 0.01, max: 2.0, step: 0.01, default: 0.1, label: 'Wall Thickness', description: 'Thickness of the lattice details' },
            gm_sharpness: { type: 'float', min: 0.01, max: 1.0, step: 0.01, default: 0.1, label: 'Smoothness', description: 'Softness of the relief edges' },
            gm_bias: { type: 'float', min: -0.5, max: 0.5, step: 0.01, default: 0.0, label: 'Surface Bias', description: 'Offset the surface (Thinner/Thicker)' },
            gm_curve: { type: 'float', min: 0.1, max: 3.0, step: 0.1, default: 1.0, label: 'Edge Curve', description: 'Profile of the relief edges' },
            gm_morph: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.0, label: 'Morph Shape', description: 'Blend: Gyroid (0) <-> Schwarz P (1)' },
            gm_relief: { type: 'float', min: 0, max: 10, step: 0.1, default: 1.5, label: 'Relief Depth', description: 'Depth of the lattice structure', unit: 'mm' },
        },
        advancedParams: {
            gm_z_stretch: { type: 'float', min: 0.2, max: 4.0, step: 0.1, default: 1.0, label: 'Z-Stretch', description: 'Stretch cells vertically' },
            gm_pulse: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.0, label: 'Pulse Phase', description: 'Animate/Shift the lattice structure' },
            gm_edge_fade: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.2, label: 'Edge Fade', description: 'Fade pattern at rim and base' },
        },
    },

    Voronoi: {
        id: 13,
        shaderName: 'style_voronoi',
        name: 'Voronoi',
        description: 'Organic cellular patterns based on periodic Voronoi/Worley noise.',
        params: {
            v_scale: { type: 'float', min: 1.0, max: 32.0, step: 0.5, default: 8.0, label: 'Cell Scale', description: 'Density of cells around the circumference' },
            v_jitter: { type: 'float', min: 0.0, max: 1.0, step: 0.05, default: 0.8, label: 'Randomness', description: '0 = Grid, 1 = Organic Chaos' },
            v_thickness: { type: 'float', min: 0.01, max: 0.5, step: 0.01, default: 0.1, label: 'Wall Thickness', description: 'Width of the cell borders' },
            v_relief: { type: 'float', min: 0.0, max: 5.0, step: 0.1, default: 2.0, label: 'Relief Depth', description: 'Depth of the pattern', unit: 'mm' },
            v_morph: { type: 'float', min: 0.0, max: 1.0, step: 0.05, default: 1.0, label: 'Style Morph', description: 'Blend: Bubbles (0) <-> Web (1)' },
        },
        advancedParams: {
            v_z_stretch: { type: 'float', min: 0.2, max: 4.0, step: 0.1, default: 1.0, label: 'Z-Stretch', description: 'Elongate cells vertically' },
            v_pulse: { type: 'float', min: 0.0, max: 1.0, step: 0.01, default: 0.0, label: 'Pulse Phase', description: 'Shift/Animate the pattern' },
            v_edge_fade: { type: 'float', min: 0.0, max: 0.5, step: 0.01, default: 0.15, label: 'Edge Fade', description: 'Smooth fade at top/bottom rims' },
        },
    },

    BasketWeave: {
        id: 14,
        shaderName: 'style_basket_weave',
        name: 'Basket Weave',
        description: 'Interwoven vertical and horizontal strands with customizable profile and density.',
        params: {
            bw_strands: { type: 'int', min: 4, max: 48, step: 1, default: 16, label: 'Strands', description: 'Number of vertical strands' },
            bw_layers: { type: 'float', min: 1, max: 50, step: 1, default: 10, label: 'Layers', description: 'Threads per vertical unit (Density)' },
            bw_depth: { type: 'float', min: 0, max: 5.0, step: 0.1, default: 2.0, label: 'Relief Depth', description: 'Depth of the weave pattern', unit: 'mm' },
            bw_twist: { type: 'float', min: -2.0, max: 2.0, step: 0.1, default: 0.0, label: 'Twist', description: 'Spiral twist factor' },
            bw_ratio: { type: 'float', min: 0.1, max: 2.0, step: 0.1, default: 1.0, label: 'Cell Ratio', description: 'Aspect ratio of the weave cells' },
        },
        advancedParams: {
            bw_profile: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Profile Shape', description: 'Strand shape: Round (0) <-> Flat (1)' },
            bw_unders: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Under Depth', description: 'Visibility of the bottom strands' },
            bw_noise: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.0, label: 'Roughness', description: 'Surface noise/texture' },
            bw_vertical_grad: { type: 'float', min: -1.0, max: 1.0, step: 0.1, default: 0.0, label: 'Vertical Gradient', description: 'Change density from bottom to top' },
            bw_phase: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.0, label: 'Phase Shift', description: 'Offset the weave pattern' },
        },
    },

    GeometricStar: {
        id: 15,
        shaderName: 'style_geometric_star',
        name: 'Geometric Star',
        description: 'Complex geometric star pattern with interlaced strapwork.',
        params: {
            gs_points: { type: 'int', min: 4, max: 16, step: 1, default: 8, label: 'Star Points', description: 'Symmetry N (e.g. 8-pointed star)' },
            gs_gap: { type: 'float', min: 0.01, max: 0.2, step: 0.01, default: 0.05, label: 'Strap Width', description: 'Width of the lattice lines' },
            gs_detail: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.5, label: 'Star Size', description: 'Star intersection angle / size' },
            gs_layers: { type: 'float', min: 1, max: 10, step: 1, default: 4.0, label: 'Layers', description: 'Vertical repetition count' },
        },
        advancedParams: {
            gs_interlace: { type: 'float', min: 0, max: 1, step: 0.1, default: 1.0, label: 'Interlace', description: 'Weaving strength (Over/Under)' },
            gs_relief: { type: 'float', min: 0, max: 5.0, step: 0.1, default: 2.0, label: 'Relief Depth', description: 'Pattern depth (mm)' },
            gs_roundness: { type: 'float', min: 0, max: 1, step: 0.1, default: 0.0, label: 'Smoothing', description: 'Roundness of the star lines' },
            gs_zoom: { type: 'float', min: 0.5, max: 3.0, step: 0.1, default: 1.0, label: 'Zoom', description: 'Pattern scale' },
            gs_shift: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.0, label: 'Shift', description: 'Pattern offset' },
        },
    },

    HexagonalHive: {
        id: 16,
        shaderName: 'style_hexagonal_hive',
        name: 'Hexagonal Hive',
        description: 'Tech-inspired hexagonal grid with volumetric control.',
        params: {
            hh_scale: { type: 'float', min: 1, max: 10, step: 0.1, default: 4.0, label: 'Cell Density', description: 'Size/number of hexagonal cells' },
            hh_gap: { type: 'float', min: 0.01, max: 0.2, step: 0.01, default: 0.05, label: 'Wall Thickness', description: 'Spacing between cells' },
            hh_relief: { type: 'float', min: 0, max: 5.0, step: 0.1, default: 2.0, label: 'Relief', description: 'Depth of the cells' },
            hh_detail: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.0, label: 'Inner Detail', description: 'Stepped extrusion effect' },
        },
        advancedParams: {
            hh_concave: { type: 'float', min: 0, max: 1, step: 0.1, default: 0.0, label: 'Concavity', description: 'Convex vs Concave profile' },
            hh_noise: { type: 'float', min: 0, max: 1, step: 0.05, default: 0.0, label: 'Noise', description: 'Height variability' },
        },
    },

    CelticKnot: {
        id: 17,
        shaderName: 'style_celtic_knot',
        name: 'Celtic Knot',
        description: 'Interlacing bands forming continuous knot patterns.',
        params: {
            ck_strands: { type: 'int', min: 2, max: 8, step: 1, default: 3, label: 'Strands', description: 'Number of braided strands (2-8)' },
            ck_scale: { type: 'float', min: 1, max: 8, step: 0.5, default: 3.0, label: 'Scale', description: 'Pattern density' },
            ck_width: { type: 'float', min: 0.05, max: 0.4, step: 0.01, default: 0.15, label: 'Band Width', description: 'Width of the interlacing bands' },
            ck_relief: { type: 'float', min: 0, max: 5.0, step: 0.1, default: 2.0, label: 'Relief', description: 'Depth of the pattern' },
            ck_gap: { type: 'float', min: 0, max: 0.1, step: 0.01, default: 0.02, label: 'Gap', description: 'Space between bands at crossings' },
        },
        advancedParams: {
            ck_roundness: { type: 'float', min: 0, max: 1, step: 0.1, default: 0.5, label: 'Roundness', description: 'Band profile roundness' },
            ck_twist: { type: 'float', min: 0, max: 2, step: 0.1, default: 0.0, label: 'Twist', description: 'Pattern rotation per row' },
        },
    },

    CelticTriquetra: {
        id: 18,
        shaderName: 'style_celtic_triquetra',
        name: 'Celtic Triquetra',
        description: 'Authentic Celtic knotwork with continuous braided strands and woven medallions.',
        params: {
            ct_scale_x: { type: 'float', min: 1, max: 24, step: 1, default: 14.0, label: 'Columns', description: 'Number of braid columns around the pot' },
            ct_rows: { type: 'int', min: 2, max: 10, step: 1, default: 6, label: 'Rows', description: 'Band density (higher = tighter braid)' },
            ct_width: { type: 'float', min: 0.05, max: 0.4, step: 0.01, default: 0.18, label: 'Ribbon Width', description: 'Width of the braided bands' },
            ct_relief: { type: 'float', min: 0, max: 5.0, step: 0.1, default: 2.5, label: 'Relief', description: 'Height of the raised pattern' },
            ct_med_scale: { type: 'float', min: 0.1, max: 1.0, step: 0.05, default: 0.22, label: 'Medallion Size', description: 'Size of the triquetra motif' },
        },
        advancedParams: {
            ct_med_y: { type: 'float', min: 0.1, max: 0.9, step: 0.05, default: 0.69, label: 'Medallion Y', description: 'Vertical position of the medallion' },
            ct_gap: { type: 'float', min: 0, max: 0.2, step: 0.01, default: 0.05, label: 'Gap', description: 'Gap visibility at strand crossings' },
        },
    },
};

/**
 * Maps Internal Style Name -> Numeric ID
 * Used by App.tsx, styleParams.ts, etc.
 */
export const STYLE_IDS = Object.fromEntries(
    Object.entries(STYLE_REGISTRY).map(([key, config]) => [key, config.id])
) as Record<StyleId, number>;

export const STYLE_ID_MAP_FROM_KEYS = STYLE_IDS;

/**
 * Maps Style ID -> Shader Function Name
 * Used by webgpu_core.ts for stripping
 */
export const STYLE_FUNCTION_MAP = Object.fromEntries(
    Object.values(STYLE_REGISTRY).map(s => [s.id, s.shaderName])
) as Record<number, string>;
