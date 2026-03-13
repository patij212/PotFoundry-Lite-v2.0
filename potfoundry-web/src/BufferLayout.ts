/**
 * BufferLayout module for WebGPU buffer write operations.
 *
 * Extracted from webgpu_core.ts to improve testability and reduce file size.
 * Uses factory pattern with pre-allocated scratch buffers for zero allocation
 * in the hot path.
 *
 * @module BufferLayout
 */

import { STYLE_PARAM_CAPACITY } from './utils/styleParams';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/** Normalized RGB tuple from hex conversion */
export type GradientColor = [number, number, number];

/**
 * Write context providing lifecycle guards and diagnostics.
 * Injected into factory to delegate disposal checks and telemetry.
 */
export interface BufferWriteContext {
  /** Check if mount is disposed (prevents GPU writes after unmount) */
  isDisposed(): boolean;
  /** Emit diagnostic event for telemetry */
  emitDiagnostic(message: string, detail?: Record<string, unknown>): void;
  /** Mount canvas ID for debug metrics */
  readonly mountCanvasId?: string;
}

/** Gradient buffer set (3 color stops) */
export interface GradientBuffers {
  readonly c1: GPUBuffer;
  readonly c2: GPUBuffer;
  readonly c3: GPUBuffer;
}

/** Factory configuration */
export interface BufferLayoutConfig {
  readonly device: GPUDevice;
  readonly context: BufferWriteContext;
}

/** Buffer write metrics (for testing/telemetry) */
export interface BufferWriteMetrics {
  colorWrites: number;
  bgWrites: number;
  styleParamWrites: number;
  styleParamSkips: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode a 2-character hex string to normalized [0,1] number.
 * @param hex - Two character hex string (e.g., "ff", "00", "80")
 * @returns Normalized value in [0,1] range
 */
const decodeHex = (hex: string): number => parseInt(hex, 16) / 255;

/**
 * Convert hex color string or RGB array to normalized [0,1] tuple.
 *
 * Handles:
 * - Arrays: [r, g, b] where values are already 0-1
 * - Hex strings: "#RGB", "#RRGGBB", "RGB", "RRGGBB"
 * - Invalid input: returns default blue [0.18, 0.53, 0.87]
 *
 * @param input - Hex string, RGB array, or unknown value
 * @returns Normalized RGB tuple [r, g, b] in [0,1] range
 */
export const hexToRgbNorm = (input: unknown): GradientColor => {
  if (Array.isArray(input) && input.length >= 3) {
    return [Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0];
  }
  const raw = typeof input === 'string' ? input : '';
  let value = raw.replace('#', '');
  if (value.length === 3) {
    value = value.split('').map((ch) => ch + ch).join('');
  }
  if (value.length !== 6) {
    return [0.18, 0.53, 0.87]; // Default blue
  }
  const r = decodeHex(value.slice(0, 2));
  const g = decodeHex(value.slice(2, 4));
  const b = decodeHex(value.slice(4, 6));
  return [r, g, b];
};

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory function to create buffer writers with pre-allocated scratch buffers.
 *
 * The returned object owns the Float32Array scratch buffers (zero GC pressure)
 * and uses the context to guard against writes after disposal.
 *
 * @param config - Device and context for GPU operations
 * @returns Object with buffer write methods and getMetrics() for testing
 */
export function createBufferWriter(config: BufferLayoutConfig) {
  const { device, context } = config;

  // ─────────────────────────────────────────────────────────────────────────
  // Pre-allocated scratch buffers (owned by this instance, not closure)
  // ─────────────────────────────────────────────────────────────────────────
  const colorBufC1 = new Float32Array(4);
  const colorBufC2 = new Float32Array(4);
  const colorBufC3 = new Float32Array(4);
  const bgBufC1 = new Float32Array(4);
  const bgBufC2 = new Float32Array(4);
  const bgBufC3 = new Float32Array(4);
  const styleParamCache = new Float32Array(STYLE_PARAM_CAPACITY);

  // ─────────────────────────────────────────────────────────────────────────
  // Metrics for testing and telemetry
  // ─────────────────────────────────────────────────────────────────────────
  const metrics: BufferWriteMetrics = {
    colorWrites: 0,
    bgWrites: 0,
    styleParamWrites: 0,
    styleParamSkips: 0,
  };

  return {
    /**
     * Write foreground gradient to GPU buffers.
     * Converts 1-3 hex stops to normalized RGB.
     *
     * @param buffers - GPU buffer set for color gradient
     * @param gradient - Raw gradient input (hex string array)
     */
    writeGradient(buffers: GradientBuffers, gradient: unknown): void {
      const stops = Array.isArray(gradient) ? gradient : [];
      const c1 = hexToRgbNorm(stops[0]);
      const c2 = hexToRgbNorm(stops[1] ?? stops[0]);
      const c3 = hexToRgbNorm(stops[2] ?? stops[1] ?? stops[0]);

      colorBufC1[0] = c1[0]; colorBufC1[1] = c1[1]; colorBufC1[2] = c1[2]; colorBufC1[3] = 0;
      colorBufC2[0] = c2[0]; colorBufC2[1] = c2[1]; colorBufC2[2] = c2[2]; colorBufC2[3] = 0;
      colorBufC3[0] = c3[0]; colorBufC3[1] = c3[1]; colorBufC3[2] = c3[2]; colorBufC3[3] = 0;

      if (!context.isDisposed()) {
        try {
          device.queue.writeBuffer(buffers.c1, 0, colorBufC1.buffer);
          device.queue.writeBuffer(buffers.c2, 0, colorBufC2.buffer);
          device.queue.writeBuffer(buffers.c3, 0, colorBufC3.buffer);
          metrics.colorWrites += 3;

          // Debug metrics hook (optional)
          if (context.mountCanvasId) {
            try {
              const m = (window as unknown as Record<string, unknown>).__pf_webgpu_mounts;
              const mount = (m as Record<string, { debug?: { metrics?: { colorWrites?: number } } }>)?.[context.mountCanvasId];
              if (mount?.debug?.metrics) {
                (mount.debug.metrics as { colorWrites: number }).colorWrites += 3;
              }
            } catch { /* ignore */ }
          }
        } catch (err) {
          console.error('[BufferLayout] writeGradient buffer write failed:', err);
          context.emitDiagnostic('webgpu:buffer-write-failed', { buffer: 'color-gradient', error: String(err) });
        }
      }
    },

    /**
     * Write background gradient to GPU buffers.
     * Interpolates middle stop if only 2 provided.
     * Encodes angle in C1 alpha channel.
     *
     * @param buffers - GPU buffer set for background gradient
     * @param gradient - Raw gradient input (hex string array)
     * @param angleVal - Gradient angle in degrees
     */
    writeBackgroundGradient(buffers: GradientBuffers, gradient: unknown, angleVal: unknown): void {
      const stops = Array.isArray(gradient) ? gradient : [];
      const angle = typeof angleVal === 'number' ? angleVal : 0;
      const c1 = hexToRgbNorm(stops[0]);

      // If only 2 stops provided, interpolate the middle stop for smooth 3-point gradient
      let c3 = hexToRgbNorm(stops[2] ?? stops[1] ?? stops[0]);
      let c2: GradientColor;

      if (stops.length === 2) {
        // Interpolate middle
        const end = hexToRgbNorm(stops[1]);
        c3 = end;
        c2 = [(c1[0] + end[0]) * 0.5, (c1[1] + end[1]) * 0.5, (c1[2] + end[2]) * 0.5];
      } else {
        c2 = hexToRgbNorm(stops[1] ?? stops[0]);
      }

      // Store angle in C1 alpha channel (uBg1.w)
      bgBufC1[0] = c1[0]; bgBufC1[1] = c1[1]; bgBufC1[2] = c1[2]; bgBufC1[3] = angle;
      bgBufC2[0] = c2[0]; bgBufC2[1] = c2[1]; bgBufC2[2] = c2[2]; bgBufC2[3] = 0;
      bgBufC3[0] = c3[0]; bgBufC3[1] = c3[1]; bgBufC3[2] = c3[2]; bgBufC3[3] = 0;

      if (!context.isDisposed()) {
        try {
          device.queue.writeBuffer(buffers.c1, 0, bgBufC1.buffer);
          device.queue.writeBuffer(buffers.c2, 0, bgBufC2.buffer);
          device.queue.writeBuffer(buffers.c3, 0, bgBufC3.buffer);
          metrics.bgWrites += 3;
        } catch (err) {
          console.error('[BufferLayout] writeBackgroundGradient buffer write failed:', err);
          context.emitDiagnostic('webgpu:buffer-write-failed', { buffer: 'bg-gradient', error: String(err) });
        }
      }
    },

    /**
     * Sync style parameters to GPU buffer with change detection.
     * Uses epsilon comparison to prevent cache thrashing.
     * Enforces sentinel at index 47.
     *
     * @param styleParamBuffer - GPU buffer to write style params to
     * @param values - Raw style parameter array
     */
    syncStyleParams(styleParamBuffer: GPUBuffer, values: unknown): void {
      let changed = false;
      const source = Array.isArray(values) ? values : [];
      const limit = Math.min(source.length, STYLE_PARAM_CAPACITY);

      for (let i = 0; i < STYLE_PARAM_CAPACITY; i += 1) {
        let next = i < limit ? Number(source[i]) || 0 : 0;

        // CRITICAL FIX: The shader expects the last float (index 47) to be > 0.5.
        // We respect the input source if provided (e.g. styleId + 1), otherwise force 1.0
        // only if we have data but index 47 was left as 0.
        if (i === STYLE_PARAM_CAPACITY - 1 && source.length > 0 && next === 0) {
          next = 1.0;
        }

        // Temporary Debug: Log params for Gyroid (Style 12)
        if (import.meta.env.DEV && i === 0 && source.length > 0) {
          const sentinel = source[STYLE_PARAM_CAPACITY - 1];
          if (sentinel === 13 || sentinel === 12) {
            console.log(`[BufferLayout] Sync Gyroid: Sent=${sentinel} Len=${source.length} P0=${source[0]} P1=${source[1]}`);
          } else if (sentinel === 0 || sentinel === undefined) {
            console.warn(`[BufferLayout] Sync Gyroid: SENTINEL MISSING! Sent=${sentinel} Len=${source.length}`);
          }
        }

        // Use epsilon for float comparison to avoid cache thrashing and infinite buffer writes
        if (Math.abs(styleParamCache[i] - next) > 1e-6) {
          styleParamCache[i] = next;
          changed = true;
        }
      }

      if (changed && !context.isDisposed()) {
        try {
          device.queue.writeBuffer(styleParamBuffer, 0, styleParamCache.buffer);
          metrics.styleParamWrites += 1;

          // Debug Log to enable diagnosing thrashing (throttled)
          if (import.meta.env.DEV && Math.random() < 0.005) {
            console.log(`[BufferLayout] Writing StyleBuffer (Sampled)`);
          }
        } catch (err) {
          console.error('[BufferLayout] syncStyleParams buffer write failed:', err);
          context.emitDiagnostic('webgpu:buffer-write-failed', { buffer: 'style-params', error: String(err) });
        }
      } else if (changed && context.isDisposed()) {
        metrics.styleParamSkips += 1;
        console.warn('[BufferLayout] syncStyleParams SKIPPED (disposed)');
      }
    },

    /**
     * Get current metrics for testing/telemetry.
     * @returns Readonly copy of metrics object
     */
    getMetrics(): Readonly<BufferWriteMetrics> {
      return { ...metrics };
    },

    /**
     * Reset metrics to zero (for testing).
     */
    resetMetrics(): void {
      metrics.colorWrites = 0;
      metrics.bgWrites = 0;
      metrics.styleParamWrites = 0;
      metrics.styleParamSkips = 0;
    },

    /**
     * Reset style param cache (forces full re-sync on next call).
     * Useful for testing or reinitializing state.
     */
    resetStyleParamCache(): void {
      styleParamCache.fill(0);
    },
  };
}

/** Type alias for the buffer writer instance */
export type BufferWriter = ReturnType<typeof createBufferWriter>;
