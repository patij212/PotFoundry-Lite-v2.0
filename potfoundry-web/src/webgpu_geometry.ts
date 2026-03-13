import { WebGPUParams } from './types';
import * as CameraConstants from './camera_constants';
import { type StyleId } from './geometry/types';
import { STYLE_IDS } from './styles/registry';


const {
    DRAIN_RADIUS_OFFSET,
    BELL_WIDTH_OFFSET,
} = CameraConstants;

const clampNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return parsed;
};

/**
 * Populates geometry parameters into the uniform buffer.
 * 
 * @deprecated This function is deprecated as of Phase 6 decomposition.
 *             Use `UniformBlock.populateGeometry()` instead.
 *             This function will be removed in a future release.
 * 
 * @see UniformBlock for the consolidated uniform buffer management
 */
export const fillGeometryBuffer = (f32: Float32Array, cfg: WebGPUParams, current: WebGPUParams) => {
    const c = cfg;
    const cur = current;

    // Resolve drain radius and style id from `cfg`/`current`
    const height = clampNumber(c.H, 120.0);
    const radiusTop = clampNumber(c.Rt, 70.0);
    const radiusBottom = clampNumber(c.Rb, 45.0);

    const styleIdRaw =
        typeof c.styleId === 'number'
            ? Math.trunc(c.styleId)
            : typeof cur.styleId === 'number'
                ? Math.trunc(Number(cur.styleId))
                : (typeof c.style === 'string' && c.style in STYLE_IDS)
                    ? STYLE_IDS[c.style as StyleId]
                    : 0;

    // Hardcoded fallback for debug: Force Voronoi ID if string matches
    let styleId = styleIdRaw < 0 ? 0 : styleIdRaw;
    if (styleId === 0 && (c.style === 'Voronoi' || cur.style === 'Voronoi')) {
        console.warn('[WebGPU] Forced Voronoi Style ID 13 (Lookup Failed)');
        styleId = 13;
    }

    // Debug logging for style resolution
    if (styleId === 13 || c.style === 'Voronoi') {
        // console.log(`[GeoDebug] StyleID: ${styleId} (Raw: ${styleIdRaw}), c.style: ${c.style}, c.id: ${c.styleId}`);
    }

    const drainRadiusRaw =
        c.r_drain ?? c.drain ?? c.drainRadius ?? c.drain_radius ?? cur.r_drain;
    const drainRadius = clampNumber(drainRadiusRaw, 10.0);

    // Core geometry params
    f32[0] = height;
    f32[1] = radiusTop;
    f32[2] = radiusBottom;
    f32[3] = clampNumber(c.expn, 1.0);

    // Spin/twist parameters - support both formats
    const spinTurnsVal = clampNumber(c.spinTurns !== undefined ? c.spinTurns : c.spin_turns, 0.0);
    const spinPhaseVal = clampNumber(c.spinPhase !== undefined ? c.spinPhase : c.spin_phase, 0.0);
    const spinCurveVal = clampNumber(c.spinCurve !== undefined ? c.spinCurve : c.spin_curve, 1.0);

    f32[4] = spinTurnsVal;
    f32[5] = spinPhaseVal;
    f32[6] = spinCurveVal;
    f32[7] = styleId;

    const sf_m_base_val = c.sf_m_base ?? c.sf_m ?? 6.0;
    const sf_m_top_val = c.sf_m_top ?? sf_m_base_val ?? 10.0;
    f32[8] = clampNumber(sf_m_base_val, 6.0);
    f32[9] = clampNumber(sf_m_top_val, 10.0);
    f32[10] = clampNumber(c.sf_n1 ?? c.n1, 0.35);
    f32[11] = clampNumber(c.sf_n2 ?? c.n2, 0.8);
    f32[12] = clampNumber(c.sf_n3 ?? c.n3, 0.8);
    f32[DRAIN_RADIUS_OFFSET] = Math.max(Math.abs(drainRadius), 0.5);

    // Resolution parameters (no caps - user controls quality directly)
    f32[16] = clampNumber(c.cells_x ?? c.cellsX, 200.0);       // default 200
    f32[17] = clampNumber(c.cells_outer_y ?? c.cellsOuterY, 100.0); // default 100

    // Bell/bulge parameters
    const bellAmp = clampNumber(c.bellAmp, 0.0);
    const bellCenter = clampNumber(c.bellCenter, 0.5);
    const bellWidth = clampNumber(c.bellWidth, 0.22);
    f32[14] = bellAmp;
    f32[15] = bellCenter;
    f32[BELL_WIDTH_OFFSET] = bellWidth;

    // Z-seam blending v6: Partial Radius Softening
    // Seam spread in degrees from UI, converted to radians
    const rawSeamAngle = clampNumber(c.seamAngle ?? c.seamAngleDegrees ?? c.seam_angle, 0.0);
    // DEBUG: Removing style restriction temporarily to test
    const seamAngleDeg = rawSeamAngle;

    const seamAngleRad = (seamAngleDeg * Math.PI) / 180.0;
    // console.log('[WebGPU Debug] Seam Angle:', seamAngleDeg, 'Radians:', seamAngleRad);
    f32[73] = seamAngleRad; // SEAM_ANGLE_OFFSET (radians)

    // Verify seam blending logic in shader:
    // Uses cubic offset function for smooth thickening transition.
    // Relies only on seamAngle and style periodicity.
    // No extra precomputed factors needed.


    // Other topology counts (no caps)
    f32[27] = clampNumber(c.inner_y ?? c.innerY, 100.0);       // default 100
    f32[28] = clampNumber(c.bottom_rings ?? c.bottomRings, 20.0);   // default 20
    f32[30] = clampNumber(c.rim_rings ?? c.rimRings, 10.0);      // default 10

    // Scene radius
    f32[33] = clampNumber(c.sceneRadius, 200.0);

    // Show Inner (Index 71) - Default to 1 (Show)
    f32[71] = 1.0;

    // Style Parameters (Indices 37-52)
    // Clear first to ensure clean state
    for (let i = 37; i <= 52; i++) f32[i] = 0.0;

    if (styleId === 5) { // Gothic Arches
        // 0: Counts
        f32[37] = clampNumber(c.gaCounts, 12.0);
        // 1: Relief (mm)
        f32[38] = clampNumber(c.gaRelief, 1.5);
        // 2: Pointiness (0.25-2.0)
        f32[39] = clampNumber(c.gaPointiness, 1.2);
        // 3: Diamond Tracery (0-1)
        f32[40] = clampNumber(c.gaDiamond, 0.5);
        // 4: X-Tracery (0-1)
        f32[41] = clampNumber(c.gaX, 0.0);
        // 5: Spring Line (0-1)
        f32[42] = clampNumber(c.gaSpring, 0.15);
        // 6: Arch Height (0-1)
        f32[43] = clampNumber(c.gaArchHeight, 0.7);
        // 7: Rib Width (0-1)
        f32[44] = clampNumber(c.gaRib, 0.04);
        // 8: Column Width (0-1)
        f32[45] = clampNumber(c.gaCol, 0.15);
        // 9: Sharpness
        f32[46] = clampNumber(c.gaSharp, 4.0);
        // 10: Bands
        f32[47] = clampNumber(c.gaBands, 1.0);
        // 11: Band Width
        f32[48] = clampNumber(c.gaBandW, 0.04);
    } else {
        // ... mappings for other styles (Superformula, etc) would go here ...
        // For now, these are likely handled by the specific style functions 
        // reading from c properties directly if they were ported, 
        // but since we are focusing on Gothic Arches GPU port:

        // Preserve existing mappings if any (conceptually)
        // In the current codebase, other styles might rely on specific indices 
        // if they were fully GPU-ported. 
        // Start indices: 
        // Superformula (0): uses sf_* params packed elsewhere? 
        // Actually, looking at previous code, only Gothic Arches v2 is strictly using this block for now.
    }
};
