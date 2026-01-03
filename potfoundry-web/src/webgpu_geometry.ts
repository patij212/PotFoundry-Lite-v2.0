import { WebGPUParams } from './types';
import * as CameraConstants from './camera_constants';

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

    // Ray - CRITICAL FIX
    // Cap resolution to avoid TDR (Timeout Detection Recovery) crashes on high-vertex meshes
    const MAX_RES = 600.0;
    f32[16] = Math.min(clampNumber(c.cells_x ?? c.cellsX, 200.0), MAX_RES);       // default 200
    f32[17] = Math.min(clampNumber(c.cells_outer_y ?? c.cellsOuterY, 100.0), MAX_RES); // default 100

    // Bell/bulge parameters
    f32[14] = clampNumber(c.bellAmp, 0.0);
    f32[15] = clampNumber(c.bellCenter, 0.5);
    f32[BELL_WIDTH_OFFSET] = clampNumber(c.bellWidth, 0.22);

    // Other topology counts
    f32[27] = clampNumber(c.inner_y ?? c.innerY, 100.0);       // default 100
    f32[28] = clampNumber(c.bottom_rings ?? c.bottomRings, 20.0);   // default 20
    f32[30] = clampNumber(c.rim_rings ?? c.rimRings, 10.0);      // default 10

    // Scene radius
    f32[33] = clampNumber(c.sceneRadius, 200.0);
};
