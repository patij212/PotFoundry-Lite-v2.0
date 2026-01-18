/**
 * Renderer Factory
 * 
 * Creates the appropriate renderer (WebGPU or WebGL) based on device capabilities.
 * Automatically falls back to WebGL if WebGPU is unavailable or crashes.
 */

import type { RendererController, CreateRendererOptions } from './types';
import { mount as mountWebGPU } from '../webgpu_core';

// WebGL renderer will be lazy-loaded only when needed
let webglRendererPromise: Promise<typeof import('./webgl')> | null = null;

/**
 * Check if WebGPU is available in this browser
 */
async function isWebGPUAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;

    const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    if (!gpu) {
        console.log('[Renderer] WebGPU API not available');
        return false;
    }

    // Try to get an adapter to confirm WebGPU actually works
    try {
        const adapter = await (gpu as GPU).requestAdapter();
        if (!adapter) {
            console.log('[Renderer] WebGPU adapter not available');
            return false;
        }
        return true;
    } catch (err) {
        console.warn('[Renderer] WebGPU adapter request failed:', err);
        return false;
    }
}

/**
 * Check if a WebGPU error indicates the GPU instance crashed
 * (the specific Chrome/Android bug we're working around)
 */
function isGPUInstanceLossError(error: unknown): boolean {
    if (!error) return false;

    const message = error instanceof Error
        ? error.message
        : String(error);

    return message.includes('Instance reference no longer exists') ||
        message.includes('GPUPipelineError') ||
        message.includes('device lost');
}

/**
 * Get user's saved renderer preference from localStorage
 */
function getSavedRendererPreference(): 'webgpu' | 'webgl' | null {
    try {
        const pref = localStorage.getItem('pf-preferred-renderer');
        if (pref === 'webgpu' || pref === 'webgl') return pref;
        return null;
    } catch { return null; }
}

/**
 * Wrap the WebGPU controller to implement the RendererController interface
 */
function wrapWebGPUController(
    webgpuController: ReturnType<typeof mountWebGPU> extends Promise<infer T> ? T : never
): RendererController | null {
    if (!webgpuController) return null;

    // The WebGPU controller already has these methods
    const ctrl = webgpuController as any;

    return {
        updateParams: (params) => ctrl.updateParams?.(params),
        dispose: () => ctrl.dispose?.(),
        exportSTL: (options) => ctrl.exportSTL?.(options) ?? null,
        exportOBJ: (options) => ctrl.exportOBJ?.(options) ?? null,
        focusOnPot: () => ctrl.focusOnPot?.(),
        resetCamera: () => ctrl.resetCamera?.(),
        handleCameraCommand: (payload) => ctrl.handleCameraCommand?.(payload),
        setAutoRotate: (value) => ctrl.setAutoRotate?.(value),
        toggleAutoRotate: () => ctrl.toggleAutoRotate?.(),
        getAutoRotate: () => ctrl.getAutoRotate?.(),
        get rendererType() { return 'webgpu' as const; },
        get isCompatibilityMode() { return false; },
    };
}

/**
 * Create a renderer using the best available technology.
 * 
 * Order of preference:
 * 1. WebGPU (if available and working)
 * 2. WebGL (fallback)
 * 
 * @param options Mount options
 * @returns Renderer controller, or null if both renderers fail
 */
export async function createRenderer(
    options: CreateRendererOptions
): Promise<RendererController | null> {
    const { forceRenderer, onFallback, ...mountOptions } = options;

    // Check URL parameter first (for emergency override when UI not accessible)
    // Usage: ?renderer=webgl or ?renderer=webgpu
    const urlParams = new URLSearchParams(window.location.search);
    const urlRenderer = urlParams.get('renderer');

    console.log(`[Renderer] URL search: "${window.location.search}", urlRenderer: "${urlRenderer}"`);
    if (urlRenderer === 'webgl' || urlRenderer === 'webgpu') {
        console.log(`[Renderer] URL parameter override: ${urlRenderer}`);
    }

    // Check for user's saved renderer preference from Settings
    const savedPref = getSavedRendererPreference();
    const effectiveForce = forceRenderer ?? urlRenderer ?? savedPref;
    console.log(`[Renderer] forceRenderer=${forceRenderer}, urlRenderer=${urlRenderer}, savedPref=${savedPref}, effectiveForce=${effectiveForce}`);

    // === Force specific renderer (from API, URL, or user preference) ===
    if (effectiveForce === 'webgl') {
        console.log('[Renderer] Forcing WebGL mode' + (urlRenderer === 'webgl' ? ' (URL param)' : savedPref === 'webgl' ? ' (user preference)' : ''));
        return createWebGLRenderer(mountOptions, 'forced');
    }

    // === Try WebGPU first ===
    if (effectiveForce !== 'webgl' && await isWebGPUAvailable()) {
        try {
            console.log('[Renderer] Attempting WebGPU...');
            const webgpuController = await mountWebGPU(mountOptions);

            if (webgpuController) {
                console.log('[Renderer] WebGPU initialized successfully');
                return wrapWebGPUController(webgpuController);
            }

            // WebGPU mount returned null - likely GPU crash
            console.warn('[Renderer] WebGPU mount returned null, falling back to WebGL');
            onFallback?.('WebGPU initialization failed');

        } catch (err) {
            console.warn('[Renderer] WebGPU error:', err);

            if (isGPUInstanceLossError(err)) {
                console.log('[Renderer] Detected GPU instance loss, falling back to WebGL');
                onFallback?.('GPU process crash detected');
            } else {
                onFallback?.(`WebGPU error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    } else if (!forceRenderer) {
        onFallback?.('WebGPU not available');
    }

    // === Fall back to WebGL ===
    return createWebGLRenderer(mountOptions, forceRenderer ? 'forced' : 'fallback');
}

/**
 * Create WebGL renderer (lazy load to avoid bundle bloat when not needed)
 */
async function createWebGLRenderer(
    options: CreateRendererOptions,
    reason: 'forced' | 'fallback'
): Promise<RendererController | null> {
    console.log(`[Renderer] Creating WebGL renderer (${reason})`);

    try {
        // Lazy load the WebGL renderer
        if (!webglRendererPromise) {
            webglRendererPromise = import('./webgl');
        }

        const webglModule = await webglRendererPromise;
        const controller = await webglModule.mountWebGL(options);

        if (controller) {
            console.log('[Renderer] WebGL initialized successfully');
            return controller;
        }

        console.error('[Renderer] WebGL mount returned null');
        return null;

    } catch (err) {
        console.error('[Renderer] WebGL initialization failed:', err);
        return null;
    }
}

/**
 * Check what renderer would be used without actually creating it
 */
export async function detectBestRenderer(): Promise<'webgpu' | 'webgl'> {
    return await isWebGPUAvailable() ? 'webgpu' : 'webgl';
}

export type { RendererController, CreateRendererOptions };
