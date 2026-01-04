import { WebGPUParams } from './types';
import * as CameraConstants from './camera_constants';
import { computeSeamRadius, computeBaseRadius, type StyleMathContext } from './style_math';

const {
    DRAIN_RADIUS_OFFSET,
    BELL_WIDTH_OFFSET,
} = CameraConstants as any;

const clampNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return parsed;
};

export const fillGeometryBuffer = (f32: Float32Array, cfg: WebGPUParams, current: WebGPUParams) => {
    const c = cfg as any;
    const cur = current as any;

    // Resolve drain radius and style id from `cfg`/`current`
    const height = clampNumber(c.H, 120.0);
    const radiusTop = clampNumber(c.Rt, 70.0);
    const radiusBottom = clampNumber(c.Rb, 45.0);

    const styleIdRaw =
        typeof c.styleId === 'number'
            ? Math.trunc(c.styleId)
            : typeof cur.styleId === 'number'
                ? Math.trunc(Number(cur.styleId))
                : 0;
    const styleId = styleIdRaw < 0 ? 0 : styleIdRaw;
    const drainRadiusRaw =
        c.r_drain ?? c.drain ?? c.drainRadius ?? c.drain_radius ?? cur.r_drain;
    const drainRadius = clampNumber(drainRadiusRaw, 10.0);

    // Core geometry params
    f32[0] = height;
    f32[1] = radiusTop;
    f32[2] = radiusBottom;
    f32[3] = clampNumber(c.expn, 1.0);

    // Spin/twist parameters - support both formats
    const spinTurnsVal = clampNumber(c.spinTurns ?? c.spin_turns, 0.0);
    const spinPhaseVal = clampNumber(c.spinPhase ?? c.spin_phase, 0.0);
    const spinCurveVal = clampNumber(c.spinCurve ?? c.spin_curve, 1.0);

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

    // Z-seam blending v3.2: CPU-side precomputation with height interpolation
    // Computes seam factors for bottom (t=0) and top (t=1) heights
    // Shader interpolates between them based on vertex height
    const seamAngleDeg = clampNumber(c.seamAngle ?? c.seamAngleDegrees ?? c.seam_angle, 0.0);
    const seamAngleRad = (seamAngleDeg * Math.PI) / 180.0;
    f32[73] = seamAngleRad; // SEAM_ANGLE_OFFSET (radians)

    // Compute seam factors if seam blending is enabled
    if (seamAngleDeg > 0) {
        // Build style context for CPU-side radius calculation
        const styleParams = Array.isArray(c.styleParams) ? c.styleParams : new Array(48).fill(0);
        const expn = clampNumber(c.expn, 1.0);
        const ctx: StyleMathContext = {
            styleId,
            styleParams,
            height,
            radiusTop,
            radiusBottom,
            expn,
            bellAmp,
            bellCenter,
            bellWidth,
        };

        // Compute seam factor at bottom (t=0): ratio of styled to base radius
        const r0_bottom = computeBaseRadius(ctx, 0.0);
        const r_seam_bottom = computeSeamRadius(ctx, 0.0);
        const seamFactorBottom = r0_bottom > 0.001 ? r_seam_bottom / r0_bottom : 1.0;

        // Compute seam factor at top (t=1): ratio of styled to base radius
        const r0_top = computeBaseRadius(ctx, 1.0);
        const r_seam_top = computeSeamRadius(ctx, 1.0);
        const seamFactorTop = r0_top > 0.001 ? r_seam_top / r0_top : 1.0;

        f32[74] = seamFactorBottom; // SEAM_FACTOR_BOTTOM
        f32[75] = seamFactorTop;    // SEAM_FACTOR_TOP
    } else {
        f32[74] = 1.0; // Default factor = no change
        f32[75] = 1.0; // Default factor = no change
    }

    // Other topology counts (no caps)
    f32[27] = clampNumber(c.inner_y ?? c.innerY, 100.0);       // default 100
    f32[28] = clampNumber(c.bottom_rings ?? c.bottomRings, 20.0);   // default 20
    f32[30] = clampNumber(c.rim_rings ?? c.rimRings, 10.0);      // default 10

    // Scene radius
    f32[33] = clampNumber(c.sceneRadius, 200.0);
};
