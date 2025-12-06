/**
 * Integrated WebGPU Preview component with embedded UI controls.
 * 
 * This component wraps the core WebGPU renderer with the new
 * Zustand-powered UI controls, providing a complete self-contained
 * pot design experience.
 * 
 * @module WebGPUPreview
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ComponentProps,
  Streamlit,
  withStreamlitConnection,
} from 'streamlit-component-lib';

import { mount, WebGPUController } from './webgpu_core';
import { AppUI } from './ui';
import { useRendererBridge, syncStoreFromParams, usePerformanceTracker, parseStatusMetrics } from './hooks';
import { useUIActions } from './state';
import { ControllerProvider, LibraryProvider } from './context';
import './WebGPUPreview.css';

// ============================================================================
// Library Types
// ============================================================================

interface LibraryDesign {
  id: string;
  title: string;
  style: string;
  created_at: string;
  thumb_url?: string;
  stl_url?: string;
  license?: string;
  tags?: string[];
  size?: Record<string, number>;
  opts?: Record<string, unknown>;
}

interface LibraryData {
  action: 'list' | 'publish' | 'loadDesign';
  page?: number;
  designs?: LibraryDesign[];
  hasMore?: boolean;
  success?: boolean;
  id?: string;
  duplicate?: boolean;
  error?: string | null;
}

// ============================================================================
// Types
// ============================================================================

interface PreviewArgs {
  params?: Record<string, unknown>;
  height_px: number;
  background_color: string;
  background_rgba?: number[] | null;
  background_mode?: string | null;
  gradient?: string[] | null;
  widget_key: string;
  canvas_id?: string;
  debug_mode?: boolean;
  /** Enable the new embedded UI panel */
  embedded_ui?: boolean;
  /** Initial panel open state */
  panel_open?: boolean;
  /** Library data from Python backend */
  library_data?: LibraryData | null;
}

type Props = Omit<ComponentProps, 'args'> & { args: PreviewArgs };

// ============================================================================
// Constants
// ============================================================================

const INITIAL_STATUS = 'Initializing WebGPU preview...';

/**
 * Event types that should trigger Streamlit reruns.
 * Most events should NOT trigger reruns to maintain smooth interaction.
 * Only events that require Python-side processing need to be forwarded.
 */
const RERUN_TRIGGERING_EVENTS = new Set([
  'ready',           // Initial ready event (one-time)
  'export',          // Export request (user wants to download STL)
  'paramBatchComplete', // Batch parameter update completed
  'error',           // Error events (for logging/fallback handling)
  'libraryRequest',  // Library browse/publish requests
]);

/**
 * Event types that are purely informational and should never trigger reruns.
 * These include camera movements, diagnostics, and status updates.
 */
const SILENT_EVENTS = new Set([
  'cameraState',     // Camera position changes during interaction
  'diagnostic',      // Debug/telemetry events
  'status',          // Status updates
  'autoRotateChange', // Auto-rotate toggle
  'meshGeneration',  // Mesh generation progress
  'interactionStart', // User started interacting
  'interactionEnd',  // User stopped interacting
  'zoomChange',      // Zoom level changed
  'panChange',       // Pan position changed
]);

// ============================================================================
// Component
// ============================================================================

/**
 * Main WebGPU Preview component with optional embedded UI.
 */
const WebGPUPreviewBase = ({ args }: Props): JSX.Element => {
  // Refs
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<WebGPUController | null>(null);
  const heightRef = useRef<number>(args.height_px);
  const mountedRef = useRef<boolean>(true);
  
  // Refs for callbacks to avoid re-mount on change
  const emitRef = useRef<(e: unknown) => void>(() => {});
  const statusUpdateRef = useRef<(s: string) => void>(() => {});
  
  // Track when local params should override Python params (e.g., after library design load)
  // This prevents Streamlit reruns from overwriting locally-loaded designs
  const localParamsLockUntilRef = useRef<number>(0);
  
  // State
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [isReady, setIsReady] = useState(false);
  const [controllerReady, setControllerReady] = useState(false);
  
  // Config (stable references)
  // In the new WebGPUPreview, embedded UI is ALWAYS shown (that's the point!)
  // The embedded_ui arg is only used to signal this component should be used
  const showUI = true; // Always show UI in WebGPUPreview
  const debugMode = Boolean(args.debug_mode);
  const debugModeRef = useRef(debugMode);
  debugModeRef.current = debugMode;
  
  // Canvas ID (stable)
  const canvasId = useMemo(() => {
    const candidate = typeof args.canvas_id === 'string' ? args.canvas_id.trim() : '';
    const fallback = args.widget_key?.trim() ? `${args.widget_key.trim()}-canvas` : 'wgpu-canvas';
    return candidate.length > 0 ? candidate : fallback;
  }, [args.canvas_id, args.widget_key]);
  
  // Normalized params - use ref to avoid triggering mount effect
  const normalizedParams = useMemo<Record<string, unknown>>(() => {
    const base = { ...(args.params ?? {}) };
    if (Array.isArray(args.gradient) && base.gradient === undefined) {
      base.gradient = args.gradient;
    }
    return base;
  }, [args.params, args.gradient]);
  const normalizedParamsRef = useRef(normalizedParams);
  normalizedParamsRef.current = normalizedParams;
  
  // UI actions
  const { setPanelOpen } = useUIActions();
  
  // Performance tracking
  const { updateMetrics, setGenerating } = usePerformanceTracker({
    debug: debugMode,
  });
  const setGeneratingRef = useRef(setGenerating);
  setGeneratingRef.current = setGenerating;
  
  // Status update handler - use ref to maintain stable reference
  const handleStatusUpdate = useCallback((newStatus: string) => {
    setStatus(newStatus);
    
    // Parse metrics from status
    const metrics = parseStatusMetrics(newStatus);
    if (metrics) {
      updateMetrics({
        triangleCount: metrics.triangleCount ?? 0,
        vertexCount: Math.round((metrics.triangleCount ?? 0) * 0.6), // Approximate
        generationTime: 0,
        renderTime: metrics.renderTime,
      });
    }
  }, [updateMetrics]);
  statusUpdateRef.current = handleStatusUpdate;
  
  // Event emitter for WebGPU controller - use ref to maintain stable reference
  // IMPORTANT: Only forward events that require Python-side processing to avoid
  // triggering unnecessary Streamlit reruns during user interaction.
  const emitEvent = useCallback((e: unknown) => {
    const event = e as { type?: string; payload?: unknown };
    const eventType = event?.type ?? '';
    
    if (debugModeRef.current) {
      console.debug('[WebGPUPreview] event', event);
    }
    
    // Handle specific events locally
    if (eventType === 'ready') {
      setIsReady(true);
      Streamlit.setComponentReady();
      // Also forward to Streamlit for one-time initialization
      try {
        Streamlit.setComponentValue(event);
      } catch (err) {
        console.error('[WebGPUPreview] emit ready failed', err);
      }
      return;
    }
    
    // Skip silent events entirely - these should never cause Streamlit reruns
    if (SILENT_EVENTS.has(eventType)) {
      // These events are handled internally or via Zustand state
      return;
    }
    
    // Only forward events that truly need Python-side processing
    if (RERUN_TRIGGERING_EVENTS.has(eventType)) {
      try {
        Streamlit.setComponentValue(event);
      } catch (err) {
        console.error('[WebGPUPreview] emit failed', err);
      }
      return;
    }
    
    // Unknown events - log but don't forward to avoid unexpected reruns
    if (debugModeRef.current) {
      console.debug('[WebGPUPreview] ignoring unknown event type:', eventType);
    }
  }, []); // Empty deps - uses refs for dynamic values
  emitRef.current = emitEvent;
  
  // Bridge Zustand state to controller - only when controller is ready
  // Pass null when controller isn't ready to avoid unnecessary subscriptions
  useRendererBridge(controllerReady ? controllerRef.current : null, {
    debug: debugMode,
  });
  
  // Initialize UI state from args
  useEffect(() => {
    if (args.panel_open !== undefined) {
      setPanelOpen(Boolean(args.panel_open));
    }
  }, [args.panel_open, setPanelOpen]);
  
  // Sync initial params to store (only once on mount)
  useEffect(() => {
    syncStoreFromParams(normalizedParamsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - only on mount
  
  // Handle height changes
  useEffect(() => {
    heightRef.current = args.height_px;
    Streamlit.setFrameHeight(args.height_px);
  }, [args.height_px]);
  
  // Mount WebGPU renderer - only re-run when canvasId changes
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    
    if (!canvas) {
      Streamlit.setComponentReady();
      return;
    }
    
    mountedRef.current = true;
    
    const mountRenderer = async () => {
      try {
        setGeneratingRef.current(true);
        
        const controller = await mount({
          canvas,
          canvasId,
          statusEl: statusRef.current ?? undefined,
          initialParams: normalizedParamsRef.current,
          emit: (e: unknown) => emitRef.current(e),
          debugMode: debugModeRef.current,
          onAutoRotateChange: (enabled) => {
            if (debugModeRef.current) {
              console.debug('[WebGPUPreview] autoRotate changed', enabled);
            }
          },
        });
        
        if (cancelled) {
          controller?.dispose();
          return;
        }
        
        if (!controller) {
          statusUpdateRef.current('WebGPU mount returned null');
          Streamlit.setComponentReady();
          return;
        }
        
        controllerRef.current = controller;
        controller.updateParams(normalizedParamsRef.current);
        setControllerReady(true); // Signal that bridge can now subscribe
        setIsReady(true);
        setGeneratingRef.current(false);
        Streamlit.setComponentReady();
        
      } catch (err) {
        console.error('[WebGPUPreview] mount failed', err);
        statusUpdateRef.current(`Mount failed: ${err instanceof Error ? err.message : String(err)}`);
        setGeneratingRef.current(false);
        Streamlit.setComponentReady();
      }
    };
    
    void mountRenderer();
    
    return () => {
      cancelled = true;
      mountedRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [canvasId]); // Only canvasId as dependency - uses refs for everything else
  
  // Update params when they change (for non-embedded mode)
  // IMPORTANT: Skip updates while local params lock is active to prevent
  // Streamlit reruns from overwriting locally-loaded library designs
  useEffect(() => {
    if (controllerRef.current && normalizedParams) {
      // Check if local params lock is still active
      const now = Date.now();
      if (now < localParamsLockUntilRef.current) {
        console.debug('[WebGPUPreview] Skipping Python param update - local params lock active');
        return;
      }
      controllerRef.current.updateParams(normalizedParams);
    }
  }, [normalizedParams]);
  
  // Shell style
  const shellStyle = useMemo(
    () => ({
      height: args.height_px,
      background: args.background_color,
    }),
    [args.height_px, args.background_color]
  );

  return (
    <div
      className="pf-wgpu-preview"
      ref={shellRef}
      style={shellStyle}
      data-canvas-id={canvasId}
      data-embedded-ui={showUI ? '1' : '0'}
    >
      {/* Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="pf-wgpu-preview__canvas"
        id={canvasId}
        tabIndex={0}
        onClick={() => canvasRef.current?.focus()}
        onPointerDown={() => canvasRef.current?.focus()}
      />
      
      {/* Status (hidden when embedded UI is active) */}
      {!showUI && (
        <div
          ref={statusRef}
          className="pf-wgpu-preview__status"
          data-ready={isReady ? '1' : '0'}
        >
          {status}
        </div>
      )}
      
      {/* Embedded UI Overlay - ALWAYS shown in WebGPUPreview */}
      {showUI && (
        <ControllerProvider
          controllerRef={controllerRef}
          isReady={controllerReady}
          canvasRef={canvasRef}
          localParamsLockRef={localParamsLockUntilRef}
        >
          <LibraryProvider libraryData={args.library_data ?? null}>
            <AppUI />
          </LibraryProvider>
        </ControllerProvider>
      )}
      
      {/* Hint (when no embedded UI) */}
      {!showUI && (
        <div className="pf-wgpu-preview__hint">
          Drag = orbit • Right-click = pan • Scroll = zoom • WASD = navigate
        </div>
      )}
    </div>
  );
};

export default withStreamlitConnection(WebGPUPreviewBase);

/**
 * Standalone version without Streamlit connection.
 * Useful for testing or embedding outside of Streamlit.
 */
export const WebGPUPreviewStandalone = WebGPUPreviewBase;
