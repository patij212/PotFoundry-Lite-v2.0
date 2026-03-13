/**
 * ResizeManager — Canvas resize handling module
 *
 * Extracted from webgpu_core.ts Phase 12.
 * Handles canvas dimension calculation, mobile detection, GPU limits,
 * fullscreen state tracking, and resize event management.
 *
 * @module ResizeManager
 */

// ============================================================================
// Types
// ============================================================================

/** Result of dimension calculation */
export interface DimensionResult {
  /** Calculated pixel width */
  width: number;
  /** Calculated pixel height */
  height: number;
  /** Device pixel ratio used */
  dpr: number;
  /** CSS width before DPR scaling */
  cssWidth: number;
  /** CSS height before DPR scaling */
  cssHeight: number;
  /** Whether dimensions were clamped to GPU/mobile limits */
  wasClamped: boolean;
  /** Whether this is a fullscreen state */
  isFullscreen: boolean;
}

/** Configuration for ResizeManager */
export interface ResizeManagerConfig {
  /** Canvas element to manage */
  canvas: HTMLCanvasElement;

  /** GPU context for reconfiguration */
  context: GPUCanvasContext;

  /** GPU device */
  device: GPUDevice;

  /** Preferred texture format */
  format: GPUTextureFormat;

  /** Maximum texture dimension reported by GPU */
  maxTextureDimension2D: number;

  /**
   * Callback when resize actually occurs.
   * Called with new dimensions and depth texture needs recreation.
   * @param result - Dimension calculation result
   * @param alphaMode - Current alpha mode for context configuration
   */
  onResize: (result: DimensionResult, alphaMode: GPUCanvasAlphaMode) => void;

  /**
   * Optional callback when DPR changes.
   * @param dpr - New device pixel ratio
   */
  onDprChange?: (dpr: number) => void;

  /**
   * Optional diagnostic emitter.
   * @param message - Diagnostic event type
   * @param detail - Additional diagnostic data
   */
  emitDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;

  /**
   * Whether debug mode is enabled.
   */
  debugEnabled?: boolean;
}

/** ResizeManager public interface */
export interface ResizeManager {
  /**
   * Calculate optimal canvas dimensions based on container size and device capabilities.
   * Does NOT apply the resize - use for inspection or testing.
   * @returns Calculated dimension result
   */
  calculateDimensions: () => DimensionResult;

  /**
   * Perform a resize if dimensions have changed.
   * Safe to call frequently (debounced internally by dimension change check).
   */
  resize: () => void;

  /**
   * Mark initialization as complete.
   * Until this is called, resize() is a no-op to protect mobile GPUs.
   */
  markInitialized: () => void;

  /**
   * Check if initialization is complete.
   */
  isInitialized: () => boolean;

  /**
   * Get current alpha mode.
   */
  getAlphaMode: () => GPUCanvasAlphaMode;

  /**
   * Set alpha mode and reconfigure context.
   * @param mode - New alpha mode
   */
  setAlphaMode: (mode: GPUCanvasAlphaMode) => void;

  /**
   * Get last resize dimensions.
   * @returns Object with last width and height
   */
  getLastDimensions: () => { width: number; height: number };

  /**
   * Clean up all event listeners and observers.
   */
  dispose: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Mobile GPU safe maximum texture dimension */
const MOBILE_MAX_DIMENSION = 4096;

/** Mobile user agent patterns */
const MOBILE_UA_PATTERN = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;

/** Max screen width (CSS pixels) to consider "mobile" when touch is present */
const MOBILE_SCREEN_WIDTH_THRESHOLD = 1200;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Detect if current device is mobile using multiple signals.
 * Checks: VITE_MOBILE env override, UA pattern, touch + screen width.
 * Multi-signal approach is needed because "Request Desktop Site" in Chrome
 * strips mobile keywords from the UA string.
 * @returns true if mobile device detected
 */
export function isMobileDevice(): boolean {
  // Dev override: npm run dev:mobile sets VITE_MOBILE=1
  if (import.meta.env.VITE_MOBILE === '1') return true;

  // Standard UA check
  if (MOBILE_UA_PATTERN.test(navigator.userAgent)) return true;

  // Fallback: touch-capable device with mobile-sized screen
  // Catches phones in "Request Desktop Site" mode
  if (navigator.maxTouchPoints > 0 && window.screen.width <= MOBILE_SCREEN_WIDTH_THRESHOLD) return true;

  return false;
}

/**
 * Calculate maximum safe texture dimension.
 * @param gpuMaxDim - GPU reported maximum
 * @param mobile - Whether device is mobile
 * @returns Safe maximum dimension
 */
export function getSafeMaxDimension(gpuMaxDim: number, mobile: boolean): number {
  if (mobile) {
    return Math.min(gpuMaxDim, MOBILE_MAX_DIMENSION);
  }
  return gpuMaxDim;
}

/**
 * Check if browser is in fullscreen mode.
 * @returns true if fullscreen
 */
function isInFullscreen(): boolean {
  const webkitFullscreen = 'webkitFullscreenElement' in document
    ? (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement
    : null;
  return !!(document.fullscreenElement || webkitFullscreen);
}

/**
 * Create a ResizeManager instance.
 * @param config - Configuration options
 * @returns ResizeManager instance
 */
export function createResizeManager(config: ResizeManagerConfig): ResizeManager {
  const {
    canvas,
    context,
    device,
    format,
    maxTextureDimension2D,
    onResize,
    onDprChange,
    emitDiagnostic,
    debugEnabled = false,
  } = config;

  // State
  let initializationComplete = false;
  let lastResizeWidth = 0;
  let lastResizeHeight = 0;
  let lastFullscreenState = false;
  let lastResizeSignature: string | null = null;
  let currentDpr = window.devicePixelRatio || 1;
  let currentAlphaMode: GPUCanvasAlphaMode = 'opaque';

  // Cleanup tracking
  let resizeObserver: ResizeObserver | null = null;
  let disposed = false;

  /**
   * Calculate optimal canvas dimensions.
   */
  const calculateDimensions = (): DimensionResult => {
    const isFullscreen = isInFullscreen();
    let cssWidth: number;
    let cssHeight: number;

    if (isFullscreen) {
      cssWidth = window.innerWidth;
      cssHeight = window.innerHeight;
    } else {
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        cssWidth = rect.width;
        cssHeight = rect.height;
      } else {
        cssWidth = window.innerWidth;
        cssHeight = window.innerHeight;
      }
    }

    const dpr = window.devicePixelRatio || 1;
    let width = Math.max(1, Math.round(cssWidth * dpr));
    let height = Math.max(1, Math.round(cssHeight * dpr));

    const mobile = isMobileDevice();
    const maxDim = getSafeMaxDimension(maxTextureDimension2D || 8192, mobile);
    let wasClamped = false;

    if (width > maxDim || height > maxDim) {
      const scale = Math.min(maxDim / width, maxDim / height);
      width = Math.max(1, Math.floor(width * scale));
      height = Math.max(1, Math.floor(height * scale));
      wasClamped = true;
      console.warn(`[WebGPU] Canvas clamped to ${mobile ? 'mobile' : 'GPU'} limit: ${width}×${height} (max: ${maxDim})`);
    }

    return { width, height, dpr, cssWidth, cssHeight, wasClamped, isFullscreen };
  };

  /**
   * Perform resize if dimensions changed.
   */
  const resize = (): void => {
    if (!initializationComplete || disposed) {
      return;
    }

    const dims = calculateDimensions();
    const fullscreenChanged = dims.isFullscreen !== lastFullscreenState;
    lastFullscreenState = dims.isFullscreen;

    // Skip if dimensions unchanged and fullscreen state unchanged
    if (dims.width === lastResizeWidth && dims.height === lastResizeHeight && !fullscreenChanged) {
      return;
    }

    lastResizeWidth = dims.width;
    lastResizeHeight = dims.height;

    // Check DPR change
    if (Math.abs(dims.dpr - currentDpr) > 1e-3) {
      currentDpr = dims.dpr;
      if (debugEnabled && emitDiagnostic) {
        emitDiagnostic('canvas:dpr-change', { dpr: currentDpr });
      }
      onDprChange?.(currentDpr);
    }

    // Emit resize diagnostic (deduplicated by signature)
    if (debugEnabled && emitDiagnostic) {
      const signature = `${dims.width}x${dims.height}@${Math.round(dims.dpr * 100) / 100}`;
      if (signature !== lastResizeSignature) {
        lastResizeSignature = signature;
        emitDiagnostic('canvas:resize', {
          width: dims.width,
          height: dims.height,
          cssWidth: Math.round(dims.cssWidth),
          cssHeight: Math.round(dims.cssHeight),
          dpr: dims.dpr,
        });
      }
    }

    // Invoke callback to perform actual resize
    onResize(dims, currentAlphaMode);
  };

  /**
   * Handle fullscreen change events.
   */
  const handleFullscreenChange = (): void => {
    // Delay resize slightly to let browser settle fullscreen state
    setTimeout(resize, 100);
  };

  // Set up event listeners
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

  // Set up ResizeObserver for parent container
  const parentContainer = canvas.parentElement;
  if (parentContainer) {
    try {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(resize);
      });
      resizeObserver.observe(parentContainer);
      if (import.meta.env.DEV) {
        console.log('[WebGPU] ResizeObserver attached to parent container');
      }
    } catch (err) {
      console.warn('[WebGPU] ResizeObserver not available, using window resize only');
    }
  }

  // Initial minimal configuration (safe for mobile GPUs)
  canvas.width = 1;
  canvas.height = 1;
  context.configure({ device, format, alphaMode: currentAlphaMode });

  return {
    calculateDimensions,

    resize,

    markInitialized: (): void => {
      initializationComplete = true;
      // Trigger initial resize now that it's safe
      resize();
    },

    isInitialized: (): boolean => initializationComplete,

    getAlphaMode: (): GPUCanvasAlphaMode => currentAlphaMode,

    setAlphaMode: (mode: GPUCanvasAlphaMode): void => {
      currentAlphaMode = mode;
      if (initializationComplete && !disposed) {
        context.configure({ device, format, alphaMode: currentAlphaMode });
      }
    },

    getLastDimensions: () => ({ width: lastResizeWidth, height: lastResizeHeight }),

    dispose: (): void => {
      if (disposed) return;
      disposed = true;

      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);

      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (e) {
          /* ignore */
        }
        resizeObserver = null;
      }
    },
  };
}
