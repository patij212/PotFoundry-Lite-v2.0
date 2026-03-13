/**
 * DebugPipelineFactory.ts
 * Factory for creating WebGPU debug visualization pipelines (lines and points).
 * Extracted from webgpu_core.ts Phase 10.
 *
 * These are async factory functions that create GPURenderPipeline instances
 * for debug visualization overlays:
 * - Debug lines (feature chains, grid edges)
 * - Debug points (feature vertices, curvature samples)
 */

import { ShaderManager } from './renderers/webgpu/ShaderManager';

/**
 * Configuration for the debug pipeline factory.
 */
export interface DebugPipelineConfig {
  /** The GPU device to create pipelines on */
  device: GPUDevice;
  /** The texture format for render targets */
  format: GPUTextureFormat;
  /** The depth texture format (defaults to 'depth24plus') */
  depthFormat?: GPUTextureFormat;
  /** Optional custom shader module creator (for testing) */
  createShaderModule?: (
    device: GPUDevice,
    code: string,
    label: string
  ) => Promise<GPUShaderModule | null>;
}

/**
 * Interface for the debug pipeline factory instance.
 */
export interface DebugPipelineFactory {
  /**
   * Creates a render pipeline for debug lines visualization.
   * @param styleId - The style ID to get appropriate WGSL shader
   * @returns Promise resolving to pipeline or null on failure
   */
  createDebugLinesPipeline(styleId: number): Promise<GPURenderPipeline | null>;

  /**
   * Creates a render pipeline for debug points visualization.
   * @param styleId - The style ID to get appropriate WGSL shader
   * @returns Promise resolving to pipeline or null on failure
   */
  createDebugPointsPipeline(styleId: number): Promise<GPURenderPipeline | null>;
}

/**
 * Default shader module creation function.
 * Compiles WGSL code into a GPUShaderModule.
 */
async function defaultCreateShaderModule(
  device: GPUDevice,
  code: string,
  label: string
): Promise<GPUShaderModule | null> {
  try {
    return device.createShaderModule({
      label,
      code,
    });
  } catch (e) {
    console.error(`[WebGPU] Failed to create shader module: ${label}`, e);
    return null;
  }
}

/**
 * Creates a debug pipeline factory instance.
 *
 * @example
 * ```typescript
 * const factory = createDebugPipelineFactory({
 *   device,
 *   format: navigator.gpu.getPreferredCanvasFormat(),
 *   depthFormat: 'depth24plus',
 * });
 *
 * const linesPipeline = await factory.createDebugLinesPipeline(styleId);
 * const pointsPipeline = await factory.createDebugPointsPipeline(styleId);
 * ```
 */
export function createDebugPipelineFactory(
  config: DebugPipelineConfig
): DebugPipelineFactory {
  const {
    device,
    format,
    depthFormat = 'depth24plus',
    createShaderModule = defaultCreateShaderModule,
  } = config;

  /**
   * Creates the debug lines render pipeline.
   * Used for visualizing feature chains, grid edges, and other line-based debug overlays.
   */
  async function createDebugLinesPipeline(
    styleId: number
  ): Promise<GPURenderPipeline | null> {
    const code = ShaderManager.getInstance().getDebugLinesWGSL(styleId);
    const module = await createShaderModule(device, code, 'debug-lines');
    if (!module) return null;

    try {
      return await device.createRenderPipelineAsync({
        label: 'debug-lines',
        layout: 'auto',
        vertex: {
          module,
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: 8, // 2 floats (u, v)
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: 'fs_main',
          targets: [
            {
              format,
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
                alpha: {
                  srcFactor: 'one',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
              },
            },
          ],
        },
        primitive: { topology: 'line-list' },
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: 'less-equal',
          format: depthFormat,
        },
      });
    } catch (e) {
      console.error('[WebGPU] Failed to create debug lines pipeline', e);
      return null;
    }
  }

  /**
   * Creates the debug points render pipeline.
   * Used for visualizing feature vertices, curvature samples, and other point-based debug overlays.
   */
  async function createDebugPointsPipeline(
    styleId: number
  ): Promise<GPURenderPipeline | null> {
    const code = ShaderManager.getInstance().getDebugPointsWGSL(styleId);
    const module = await createShaderModule(device, code, 'debug-points');
    if (!module) return null;

    try {
      return await device.createRenderPipelineAsync({
        label: 'debug-points',
        layout: 'auto',
        vertex: {
          module,
          entryPoint: 'vs_main',
          buffers: [
            {
              arrayStride: 12, // 3 floats (u, t, kind)
              attributes: [
                {
                  shaderLocation: 0,
                  offset: 0,
                  format: 'float32x3' as GPUVertexFormat,
                },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: 'fs_main',
          targets: [
            {
              format,
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
                alpha: {
                  srcFactor: 'one',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
              },
            },
          ],
        },
        primitive: { topology: 'point-list' },
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: 'less-equal',
          format: depthFormat,
        },
      });
    } catch (e) {
      console.error('[WebGPU] Failed to create debug points pipeline', e);
      return null;
    }
  }

  return {
    createDebugLinesPipeline,
    createDebugPointsPipeline,
  };
}
