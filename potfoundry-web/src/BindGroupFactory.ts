/**
 * BindGroupFactory.ts
 * Factory for creating WebGPU bind groups for main, debug, and wireframe pipelines.
 * Extracted from webgpu_core.ts Phase 11.
 *
 * Bind groups connect GPU buffers to shader uniform bindings. This module
 * centralizes bind group creation for consistent binding layouts.
 */

/**
 * Gradient buffer set (3 color stops for gradient interpolation).
 */
export interface GradientBuffers {
  c1: GPUBuffer;
  c2: GPUBuffer;
  c3: GPUBuffer;
}

/**
 * Configuration for the bind group factory.
 */
export interface BindGroupFactoryConfig {
  /** The GPU device to create bind groups on */
  device: GPUDevice;
  /** Uniform buffer containing camera/geometry parameters */
  uniformBuffer: GPUBuffer;
  /** Style parameter buffer */
  styleParamBuffer: GPUBuffer;
  /** Gradient color buffers for foreground */
  colorBuffers: GradientBuffers;
  /** Gradient color buffers for background */
  bgBuffers: GradientBuffers;
}

/**
 * Interface for the bind group factory instance.
 */
export interface BindGroupFactory {
  /**
   * Creates the main render pipeline bind group.
   * Includes uniform, color gradient (3 stops), style params, and background gradient buffers.
   * Uses bindings 0-7.
   */
  createMainBindGroup(pipeline: GPURenderPipeline): GPUBindGroup;

  /**
   * Creates a debug visualization bind group.
   * Includes only uniform (binding 0) and style params (binding 4).
   */
  createDebugBindGroup(pipeline: GPURenderPipeline): GPUBindGroup;

  /**
   * Creates a wireframe visualization bind group.
   * Same bindings as debug (0 and 4).
   */
  createWireframeBindGroup(pipeline: GPURenderPipeline): GPUBindGroup;
}

/**
 * Creates a bind group factory instance.
 *
 * @example
 * ```typescript
 * const factory = createBindGroupFactory({
 *   device,
 *   uniformBuffer,
 *   styleParamBuffer,
 *   colorBuffers: { c1, c2, c3 },
 *   bgBuffers: { c1: bg1, c2: bg2, c3: bg3 },
 * });
 *
 * const mainBindGroup = factory.createMainBindGroup(mainPipeline);
 * const debugBindGroup = factory.createDebugBindGroup(debugPipeline);
 * ```
 */
export function createBindGroupFactory(
  config: BindGroupFactoryConfig
): BindGroupFactory {
  const {
    device,
    uniformBuffer,
    styleParamBuffer,
    colorBuffers,
    bgBuffers,
  } = config;

  /**
   * Creates the main pipeline bind group with all buffer bindings.
   * Binding layout:
   * - 0: uniformBuffer (camera, geometry params)
   * - 1-3: colorBuffers.c1/c2/c3 (foreground gradient)
   * - 4: styleParamBuffer (style-specific params)
   * - 5-7: bgBuffers.c1/c2/c3 (background gradient)
   */
  function createMainBindGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    return device.createBindGroup({
      label: 'component:bind-group-main',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: colorBuffers.c1 } },
        { binding: 2, resource: { buffer: colorBuffers.c2 } },
        { binding: 3, resource: { buffer: colorBuffers.c3 } },
        { binding: 4, resource: { buffer: styleParamBuffer } },
        { binding: 5, resource: { buffer: bgBuffers.c1 } },
        { binding: 6, resource: { buffer: bgBuffers.c2 } },
        { binding: 7, resource: { buffer: bgBuffers.c3 } },
      ],
    });
  }

  /**
   * Creates a debug visualization bind group.
   * Only binds uniform and style param buffers (bindings 0 and 4).
   */
  function createDebugBindGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    return device.createBindGroup({
      label: 'component:bind-group-debug',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 4, resource: { buffer: styleParamBuffer } },
      ],
    });
  }

  /**
   * Creates a wireframe visualization bind group.
   * Same bindings as debug (0 and 4) since wireframe shader
   * only needs camera uniforms and style params.
   */
  function createWireframeBindGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    return device.createBindGroup({
      label: 'component:bind-group-wireframe',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 4, resource: { buffer: styleParamBuffer } },
      ],
    });
  }

  return {
    createMainBindGroup,
    createDebugBindGroup,
    createWireframeBindGroup,
  };
}
