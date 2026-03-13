/**
 * @fileoverview Axis overlay gizmo for 3D camera orientation display.
 *
 * This module handles the draggable 2D axis indicator shown in the corner
 * of the WebGPU preview. It manages:
 * - Canvas creation and positioning
 * - Drag interactions (mouse and touch)
 * - Position persistence via localStorage
 * - Proper cleanup on dispose
 *
 * The actual axis drawing is delegated to the render loop via the
 * `getContext()` getter.
 *
 * @module AxisOverlay
 */

import type { CameraRig } from './types';
import { type CameraBasis, type Vec3, vec3Length, vec3Scale } from './camera_basis';

// ============================================================================
// Constants
// ============================================================================

const AXIS_POS_KEY = 'pf-axis-position';
const DEFAULT_SIZE = 96;

// ============================================================================
// Type Definitions
// ============================================================================

/** Configuration for axis overlay creation */
export interface AxisOverlayConfig {
  /** Parent element to append the canvas to */
  parent: HTMLElement;
  /** Canvas size in pixels (default: 96) */
  size?: number;
  /** Optional custom ID for the canvas element */
  id?: string;
}

/** Saved axis position */
interface AxisPosition {
  left: number;
  top: number;
}

/** Axis overlay instance returned by createAxisOverlay */
export interface AxisOverlayInstance {
  /** Get the 2D rendering context for drawing */
  getContext(): CanvasRenderingContext2D | null;
  /** Get the canvas element */
  getCanvas(): HTMLCanvasElement | null;
  /** Update visibility */
  setVisible(visible: boolean): void;
  /** Check if visible */
  isVisible(): boolean;
  /** Reset position to default */
  resetPosition(): void;
  /** Clean up all resources and listeners */
  dispose(): void;
}

// ============================================================================
// Math Utilities (for axis projection)
// ============================================================================

// vec3Length, vec3Scale imported from camera_basis.ts (Phase 6)

/**
 * Multiply a 4x4 matrix by a vec3 (with w=1), returning projected {x, y, w}
 */
const mulMat4Vec4 = (
  m: Float32Array,
  x: number,
  y: number,
  z: number
): { x: number; y: number; w: number } => {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    w: w,
  };
};

/**
 * Compute direction vector between two projected points in NDC
 */
const ndcDeltaBetween = (
  projA: { x: number; y: number; w: number },
  projB: { x: number; y: number; w: number }
): [number, number] => {
  // Guard against division by zero (degenerate projection)
  if (Math.abs(projA.w) < 1e-9 || Math.abs(projB.w) < 1e-9) return [0, 0];
  const ax = projA.x / projA.w;
  const ay = projA.y / projA.w;
  const bx = projB.x / projB.w;
  const by = projB.y / projB.w;
  return [bx - ax, by - ay];
};

/**
 * Compute normalized direction between two projected points
 */
export const ndcDirBetween = (
  projA: { x: number; y: number; w: number },
  projB: { x: number; y: number; w: number }
): [number, number] => {
  const [dx, dy] = ndcDeltaBetween(projA, projB);
  const len = Math.hypot(dx, dy);
  return len < 1e-9 ? [0, 0] : [dx / len, dy / len];
};

/**
 * Compute overlay (screen) direction for a world axis using the camera rig.
 *
 * Projects the axis vector directly to screen space so the overlay
 * direction matches a naive projection computed elsewhere (parity tests).
 *
 * @param rig - Camera rig with viewProjection matrix
 * @param _basis - Camera basis (unused but kept for API compatibility)
 * @param axis - World axis vector to project
 * @param pivot - World pivot point
 * @param worldScale - Scale factor for the axis length
 * @returns Normalized 2D direction in overlay coordinates
 */
export const overlayForAxisFromBasis = (
  rig: CameraRig,
  _basis: CameraBasis,
  axis: Vec3,
  pivot: Vec3,
  worldScale: number
): [number, number] => {
  const axisLen = vec3Length(axis);
  const scaledAxis: Vec3 =
    axisLen > 1e-9 ? vec3Scale(axis, worldScale / axisLen) : [0, 0, 0];
  const p = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
  const pa = mulMat4Vec4(
    rig.viewProjection,
    pivot[0] + scaledAxis[0],
    pivot[1] + scaledAxis[1],
    pivot[2] + scaledAxis[2]
  );
  const delta = ndcDeltaBetween(p, pa);
  // Convert NDC deltas to overlay coords (flip Y)
  const ovx = delta[0];
  const ovy = -delta[1];
  const len = Math.hypot(ovx, ovy);
  if (len < 1e-9) return [0, 0];
  return [ovx / len, ovy / len];
};

// Re-export mulMat4Vec4 for drawAxisIndicator to use
export { mulMat4Vec4 };

// ============================================================================
// Position Persistence
// ============================================================================

/**
 * Load saved position from localStorage
 */
const loadAxisPosition = (): AxisPosition | null => {
  try {
    const saved = localStorage.getItem(AXIS_POS_KEY);
    if (saved) {
      const pos = JSON.parse(saved) as unknown;
      if (
        pos !== null &&
        typeof pos === 'object' &&
        'left' in pos &&
        'top' in pos &&
        typeof (pos as AxisPosition).left === 'number' &&
        typeof (pos as AxisPosition).top === 'number'
      ) {
        return pos as AxisPosition;
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
};

/**
 * Save position to localStorage
 */
const saveAxisPosition = (left: number, top: number): void => {
  try {
    localStorage.setItem(AXIS_POS_KEY, JSON.stringify({ left, top }));
  } catch {
    /* ignore storage errors */
  }
};

/**
 * Get default position based on viewport size.
 * On desktop (>768px), offset by sidebar width.
 * On mobile, use small margin.
 */
const getDefaultAxisPosition = (): AxisPosition => {
  const isMobileDevice = window.innerWidth <= 768;
  const leftOffset = isMobileDevice ? 12 : 360;
  return { left: leftOffset, top: 12 };
};

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a draggable axis overlay canvas.
 *
 * The overlay is a small 2D canvas showing the current camera orientation
 * via XYZ axis lines. It can be dragged to reposition and persists its
 * position to localStorage.
 *
 * @example
 * ```typescript
 * const axisOverlay = createAxisOverlay({ parent: container });
 *
 * // In render loop:
 * const ctx = axisOverlay.getContext();
 * if (ctx && cameraRig) {
 *   drawAxisIndicator(ctx, cameraRig);
 * }
 *
 * // On cleanup:
 * axisOverlay.dispose();
 * ```
 */
export function createAxisOverlay(config: AxisOverlayConfig): AxisOverlayInstance {
  const { parent, size = DEFAULT_SIZE, id = 'wgpu-axis-overlay' } = config;

  // Remove any existing overlay to prevent duplicates
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.id = id;
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.position = 'absolute';
  canvas.style.cursor = 'move';
  canvas.style.pointerEvents = 'auto';
  canvas.style.zIndex = '9998';

  // Position from saved or default
  const savedPos = loadAxisPosition();
  const defaultPos = getDefaultAxisPosition();
  const posToUse = savedPos ?? defaultPos;
  canvas.style.left = `${posToUse.left}px`;
  canvas.style.top = `${posToUse.top}px`;

  // Get 2D context
  const ctx = canvas.getContext('2d');

  // Drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startLeft = 0;
  let startTop = 0;
  let visible = true;

  // ---- Event Handlers ----

  const onMouseDown = (e: MouseEvent): void => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startLeft = parseInt(canvas.style.left, 10) || 12;
    startTop = parseInt(canvas.style.top, 10) || 12;
    e.preventDefault();
    e.stopPropagation();
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const newLeft = Math.max(0, startLeft + dx);
    const newTop = Math.max(0, startTop + dy);
    canvas.style.left = `${newLeft}px`;
    canvas.style.top = `${newTop}px`;
  };

  const onMouseUp = (): void => {
    if (!isDragging) return;
    isDragging = false;
    const left = parseInt(canvas.style.left, 10) || 12;
    const top = parseInt(canvas.style.top, 10) || 12;
    saveAxisPosition(left, top);
  };

  const onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    isDragging = true;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    startLeft = parseInt(canvas.style.left, 10) || 12;
    startTop = parseInt(canvas.style.top, 10) || 12;
    e.preventDefault();
    e.stopPropagation();
  };

  const onTouchMove = (e: TouchEvent): void => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStartX;
    const dy = touch.clientY - dragStartY;
    const newLeft = Math.max(0, startLeft + dx);
    const newTop = Math.max(0, startTop + dy);
    canvas.style.left = `${newLeft}px`;
    canvas.style.top = `${newTop}px`;
    e.preventDefault();
  };

  const onTouchEnd = (): void => {
    if (!isDragging) return;
    isDragging = false;
    const left = parseInt(canvas.style.left, 10) || 12;
    const top = parseInt(canvas.style.top, 10) || 12;
    saveAxisPosition(left, top);
  };

  // ---- Attach Listeners ----

  // Mouse events (desktop)
  canvas.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // Touch events (mobile)
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);
  document.addEventListener('touchcancel', onTouchEnd);

  // Append to parent
  parent.appendChild(canvas);

  // ---- Instance Methods ----

  const dispose = (): void => {
    // Remove canvas listeners
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('touchstart', onTouchStart);

    // Remove document listeners (CRITICAL for memory leak prevention)
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);

    // Remove from DOM
    canvas.remove();
  };

  const setVisible = (v: boolean): void => {
    visible = v;
    canvas.style.display = v ? 'block' : 'none';
  };

  const resetPosition = (): void => {
    const pos = getDefaultAxisPosition();
    canvas.style.left = `${pos.left}px`;
    canvas.style.top = `${pos.top}px`;
    saveAxisPosition(pos.left, pos.top);
  };

  return {
    getContext: () => ctx,
    getCanvas: () => canvas,
    setVisible,
    isVisible: () => visible,
    resetPosition,
    dispose,
  };
}
