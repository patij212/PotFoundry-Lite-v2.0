/**
 * AxisIndicatorRenderer — Factory for drawing the 3D axis orientation indicator overlay.
 *
 * Renders X/Y/Z axis lines on a 2D canvas overlay showing the current camera orientation.
 * The axes are projected using the camera basis vectors to show how world axes map to screen space.
 *
 * Phase 17 extraction from webgpu_core.ts (~80 LOC).
 */

import type { CameraRig } from './types';
import type { CameraBasis, Vec3 } from './camera_basis';
import { overlayForAxisFromBasis, ndcDirBetween, mulMat4Vec4 } from './AxisOverlay';

/** Configuration for AxisIndicatorRenderer factory */
export interface AxisIndicatorRendererConfig {
  /** Callback to get current pivot point (default: [0,0,0]) */
  getPivot: () => Vec3 | null | undefined;
  /** Callback to get current scene radius (default: 1) */
  getSceneRadius: () => number;
  /** Callback to get camera sequence number for diagnostics */
  getSequence?: () => number;
  /** Emit diagnostic messages (undefined = disabled) */
  emitDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;
  /** Throttle interval for diagnostic emission (ms) */
  debugThrottleMs?: number;
}

/** Instance returned by createAxisIndicatorRenderer */
export interface AxisIndicatorRendererInstance {
  /**
   * Draw the axis indicator on the given 2D canvas context.
   * @param ctx - 2D rendering context (null = no-op)
   * @param rig - Camera rig with basis vectors (null = no-op)
   */
  draw: (ctx: CanvasRenderingContext2D | null, rig: CameraRig | null) => void;
  /** Reset state (clears diagnostic throttle timer) */
  reset: () => void;
  /** Dispose and clean up */
  dispose: () => void;
}

/** Axis definition with color and label */
interface AxisDef {
  v: [number, number, number];
  color: string;
  label: string;
}

/** Default throttle interval for diagnostics (ms) */
const DEFAULT_DEBUG_THROTTLE_MS = 250;

/**
 * Create an AxisIndicatorRenderer instance.
 * @param config - Configuration callbacks and options
 * @returns AxisIndicatorRendererInstance
 */
export function createAxisIndicatorRenderer(
  config: AxisIndicatorRendererConfig
): AxisIndicatorRendererInstance {
  const {
    getPivot,
    getSceneRadius,
    getSequence,
    emitDiagnostic,
    debugThrottleMs = DEFAULT_DEBUG_THROTTLE_MS,
  } = config;

  // Diagnostic throttle state - start at -Infinity to ensure first draw always emits
  let lastAxisEmit = -Infinity;
  let disposed = false;

  // Axis definitions: X (red), Y (green), Z (blue)
  const axes: AxisDef[] = [
    { v: [1, 0, 0], color: '#e53935', label: 'X' },
    { v: [0, 1, 0], color: '#43a047', label: 'Y' },
    { v: [0, 0, 1], color: '#1e88e5', label: 'Z' },
  ];

  /**
   * Project a world axis to screen coordinates using camera basis.
   * @param axis - World axis unit vector [x,y,z]
   * @param basis - Camera basis (right, up, forward)
   * @param cx - Canvas center X
   * @param cy - Canvas center Y
   * @param axisLen - Axis length in pixels
   * @returns [screenX, screenY]
   */
  const axisToScreen = (
    axis: [number, number, number],
    basis: CameraBasis,
    cx: number,
    cy: number,
    axisLen: number
  ): [number, number] => {
    // camRight points screen-right, camUp points screen-up
    const screenX = axis[0] * basis.right[0] + axis[1] * basis.right[1] + axis[2] * basis.right[2];
    const screenY = axis[0] * basis.up[0] + axis[1] * basis.up[1] + axis[2] * basis.up[2];
    // Scale and convert to canvas coords (canvas Y is inverted from screen up)
    return [cx + screenX * axisLen, cy - screenY * axisLen];
  };

  /**
   * Draw the axis indicator overlay.
   */
  const draw = (ctx: CanvasRenderingContext2D | null, rig: CameraRig | null): void => {
    if (disposed || !ctx || !rig) return;

    try {
      const canvas = ctx.canvas as HTMLCanvasElement;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const axisLen = Math.min(w, h) * 0.34;
      const basis = rig.basis;

      // Draw background circle
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Collect diagnostic data
      const diagAxes: Record<string, unknown> = {};
      const pivot = getPivot() ?? [0, 0, 0];
      const sceneRadius = Math.max(getSceneRadius(), 1);

      // Draw each axis
      for (const a of axes) {
        const [tx, ty] = axisToScreen(a.v, basis, cx, cy, axisLen);
        const dx = tx - cx;
        const dy = ty - cy;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;

        const ux = dx / len;
        const uy = dy / len;

        // Draw axis line
        ctx.beginPath();
        ctx.lineWidth = Math.max(2, Math.round(w * 0.02));
        ctx.strokeStyle = a.color;
        ctx.moveTo(cx, cy);
        ctx.lineTo(tx - ux * Math.min(8, w * 0.06), ty - uy * Math.min(8, w * 0.06));
        ctx.stroke();

        // Draw arrowhead
        const tipSize = Math.max(6, Math.round(w * 0.04));
        ctx.beginPath();
        ctx.fillStyle = a.color;
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - ux * tipSize - uy * (tipSize * 0.45), ty - uy * tipSize + ux * (tipSize * 0.45));
        ctx.lineTo(tx - ux * tipSize + uy * (tipSize * 0.45), ty - uy * tipSize - ux * (tipSize * 0.45));
        ctx.closePath();
        ctx.fill();

        // Draw label
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `${Math.max(10, Math.round(w * 0.12))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lx = tx + ux * Math.max(6, Math.round(w * 0.02));
        const ly = ty + uy * Math.max(6, Math.round(w * 0.02));
        ctx.fillText(a.label, lx, ly);

        // Collect diagnostic vectors for overlay vs basis projection
        if (emitDiagnostic) {
          try {
            const ov_basis_unit = overlayForAxisFromBasis(rig, basis, a.v, pivot, sceneRadius);
            const pA = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
            const pB = mulMat4Vec4(
              rig.viewProjection,
              pivot[0] + a.v[0] * sceneRadius,
              pivot[1] + a.v[1] * sceneRadius,
              pivot[2] + a.v[2] * sceneRadius
            );
            const ov_proj_unit = ndcDirBetween(pA, pB);
            // Convert to overlay coordinates: flip Y
            const ov_proj_2d = [ov_proj_unit[0], -ov_proj_unit[1]];
            const ov_proj_len = Math.hypot(ov_proj_2d[0], ov_proj_2d[1]);
            const ov_proj_norm = ov_proj_len < 1e-9 ? [0, 0] : [ov_proj_2d[0] / ov_proj_len, ov_proj_2d[1] / ov_proj_len];
            diagAxes[a.label] = { overlayProj: ov_proj_norm, overlayBasis: ov_basis_unit };
          } catch {
            /* best-effort diagnostic collection */
          }
        }
      }

      // Emit diagnostic if enabled (throttled)
      if (emitDiagnostic) {
        try {
          const now = performance.now();
          if (now - lastAxisEmit >= debugThrottleMs) {
            lastAxisEmit = now;
            emitDiagnostic('component:axis-overlay-compare', {
              axes: diagAxes,
              ts: Date.now(),
              camSeq: getSequence?.() ?? 0,
            });
          }
        } catch {
          /* ignore diagnostic emission errors */
        }
      }
    } catch {
      /* ignore drawing errors */
    }
  };

  const reset = (): void => {
    // Set to -Infinity to guarantee next draw() will emit diagnostic
    lastAxisEmit = -Infinity;
  };

  const dispose = (): void => {
    disposed = true;
    lastAxisEmit = -Infinity;
  };

  return {
    draw,
    reset,
    dispose,
  };
}
