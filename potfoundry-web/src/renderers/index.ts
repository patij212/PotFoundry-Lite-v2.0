/**
 * Renderer Abstraction Layer
 * 
 * This module provides a unified interface for rendering that automatically
 * falls back from WebGPU to WebGL when needed.
 * 
 * Usage:
 * ```typescript
 * import { createRenderer } from './renderers';
 * 
 * const controller = await createRenderer({
 *   canvas: canvasElement,
 *   onFallback: (reason) => console.log('Using fallback:', reason),
 * });
 * ```
 */

export { createRenderer, detectBestRenderer } from './factory';
export type { RendererController, CreateRendererOptions, ExportOptions } from './types';
