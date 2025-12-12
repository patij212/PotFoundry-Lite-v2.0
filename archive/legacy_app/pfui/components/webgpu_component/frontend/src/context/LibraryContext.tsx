/**
 * Library Context for sharing library data and actions across components.
 * 
 * Uses a polling mechanism to check for library responses from Python,
 * avoiding full Streamlit reruns for a smoother UX.
 * 
 * IMPORTANT: All Streamlit.setComponentValue calls are guarded to only
 * execute after the component has been properly registered with Streamlit
 * (indicated by receiving props from Python).
 * 
 * @module context/LibraryContext
 */

import React, { createContext, useContext, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { Streamlit } from 'streamlit-component-lib';
import { useControllerMaybe } from './ControllerContext';
import { buildStyleParamPayload } from '../utils/styleParams';
import { syncStoreFromParams } from '../hooks';

// ============================================================================
// Constants
// ============================================================================

/** Polling interval in ms when waiting for a response */
const POLL_INTERVAL_MS = 750; // Slower to reduce message spam

/** Maximum polling attempts before giving up */
const MAX_POLL_ATTEMPTS = 15; // ~11 seconds max

/** Delay before first action to ensure component is registered */
const INITIAL_DELAY_MS = 100;

// ============================================================================
// Types
// ============================================================================

export interface LibraryDesign {
  id: string;
  title: string;
  style: string;
  created_at: string;
  thumb_url?: string;
  stl_url?: string;
  license?: string;
  tags?: string[];
  size?: {
    height?: number;
    top_od?: number;
    bottom_od?: number;
    wall_thickness?: number;
    bottom_thickness?: number;
    drain_radius?: number;
    flare_exp?: number;
  };
  opts?: Record<string, unknown>;
}

export interface LibraryState {
  designs: LibraryDesign[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;
  searchQuery: string;
  styleFilter: string | null;
  publishing: boolean;
  publishSuccess: boolean | null;
  /** True when we've received at least one render from Python */
  ready: boolean;
}

export interface LibraryActions {
  fetchDesigns: (reset?: boolean) => void;
  loadDesign: (design: LibraryDesign) => void;
  downloadSTL: (design: LibraryDesign) => void;
  publish: (title: string, tags: string[], license: string) => void;
  setSearchQuery: (query: string) => void;
  setStyleFilter: (style: string | null) => void;
  loadMore: () => void;
}

export interface LibraryContextValue {
  state: LibraryState;
  actions: LibraryActions;
}

export interface LibraryProviderProps {
  children: React.ReactNode;
  libraryData?: {
    action: string;
    page?: number;
    designs?: LibraryDesign[];
    hasMore?: boolean;
    success?: boolean;
    id?: string;
    duplicate?: boolean;
    error?: string | null;
    /** Params to apply to renderer when action is 'loadDesign' */
    params?: Record<string, unknown>;
  } | null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Safely send a value to Streamlit, catching any errors.
 * Returns true if the message was sent successfully.
 */
function safeSendToStreamlit(value: unknown, hasReceivedProps: boolean): boolean {
  // Do not attempt to send if we have not yet received any props from Python;
  // this indicates Streamlit has not registered this component instance.
  if (!hasReceivedProps) {
    return false;
  }
  try {
    Streamlit.setComponentValue(value);
    return true;
  } catch (e) {
    // Component might not be registered yet or already unmounted
    console.debug('[LibraryContext] Failed to send to Streamlit:', e);
    return false;
  }
}

// ============================================================================
// Context
// ============================================================================

const LibraryContext = createContext<LibraryContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export const LibraryProvider: React.FC<LibraryProviderProps> = ({ children, libraryData }) => {
  // Access controller for direct param updates (used by loadDesign)
  const controller = useControllerMaybe();
  
  const [state, setState] = useState<LibraryState>({
    designs: [],
    loading: false,
    error: null,
    hasMore: false,
    page: 1,
    searchQuery: '',
    styleFilter: null,
    publishing: false,
    publishSuccess: null,
    ready: false,
  });
  
  // Track pending request for polling - use ref to avoid stale closures
  const pendingRequestRef = useRef<{
    action: 'list' | 'publish' | 'loadDesign';
    page?: number;
    attempts: number;
  } | null>(null);
  
  // Track the polling interval ID for cleanup
  const pollIntervalRef = useRef<number | null>(null);
  
  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true);
  
  // Track last processed response to avoid re-processing
  const lastResponseRef = useRef<string | null>(null);
  
  // Track if we've ever received props from Python (indicates registration complete)
  const hasReceivedPropsRef = useRef(false);

  // Stop polling helper - defined before useEffect that uses it
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pendingRequestRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  // Mark as ready once we receive any props (even null libraryData means Python rendered us)
  useEffect(() => {
    if (!isMountedRef.current) {
      return;
    }
    // Any render from Streamlit means the component instance is now registered.
    if (!hasReceivedPropsRef.current) {
      hasReceivedPropsRef.current = true;
      setTimeout(() => {
        if (isMountedRef.current) {
          setState(s => ({ ...s, ready: true }));
        }
      }, INITIAL_DELAY_MS);
    }
  }, [libraryData]);

  // Handle incoming library data from Python (via props)
  useEffect(() => {
    if (!libraryData || !isMountedRef.current) return;
    
    // Debug: log received library data from Python
    console.log('[LibraryContext] Received libraryData from Python:', libraryData);
    if (libraryData.designs?.length) {
      console.log('[LibraryContext] First design:', libraryData.designs[0]);
    }
    
    // Create a signature to detect duplicate responses
    const responseSignature = JSON.stringify(libraryData);
    if (responseSignature === lastResponseRef.current) {
      return; // Already processed this response
    }
    lastResponseRef.current = responseSignature;
    
    // Stop polling since we got a response
    stopPolling();
    
    // Acknowledge receipt so Python clears the response (non-critical, don't block on failure)
    safeSendToStreamlit({
      type: 'libraryAck',
      payload: { action: libraryData.action },
    }, hasReceivedPropsRef.current);
    
    if (libraryData.action === 'list') {
      setState(s => ({
        ...s,
        designs: libraryData.page === 1 
          ? (libraryData.designs || []) 
          : [...s.designs, ...(libraryData.designs || [])],
        hasMore: libraryData.hasMore ?? false,
        loading: false,
        error: libraryData.error || null,
      }));
    } else if (libraryData.action === 'publish') {
      setState(s => ({
        ...s,
        publishing: false,
        publishSuccess: libraryData.success ?? false,
        error: libraryData.error || null,
      }));
    } else if (libraryData.action === 'loadDesign') {
      // Apply loaded design params directly to the renderer
      // This avoids a full Streamlit rerun which would unmount the WebGPU component
      if (libraryData.params && controller?.updateParams) {
        console.log('[LibraryContext] Applying loaded design params:', libraryData.params);
        controller.updateParams(libraryData.params);
      } else if (libraryData.params) {
        console.warn('[LibraryContext] loadDesign received params but controller not available');
      }
      // Clear loading and error state
      setState(s => ({
        ...s,
        loading: false,
        error: libraryData.error || null,
      }));
    }
  }, [libraryData, stopPolling, controller]);

  // Start polling for a request
  const startPolling = useCallback((action: 'list' | 'publish' | 'loadDesign', page?: number) => {
    // Do not poll if we never received props/registration
    if (!hasReceivedPropsRef.current) {
      return;
    }
    // Clear any existing polling first
    stopPolling();
    
    // Set up the pending request
    pendingRequestRef.current = {
      action,
      page,
      attempts: 0,
    };
    
    // Start the polling interval
    pollIntervalRef.current = window.setInterval(() => {
      // Check if we should still be polling
      if (!isMountedRef.current || !pendingRequestRef.current) {
        stopPolling();
        return;
      }
      
      const pending = pendingRequestRef.current;
      pending.attempts++;
      
      // Give up after max attempts
      if (pending.attempts >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        if (isMountedRef.current) {
          setState(s => ({
            ...s,
            loading: false,
            publishing: false,
            error: 'Request timed out. Please try again.',
          }));
        }
        return;
      }
      
      // Send a lightweight poll request
      const sent = safeSendToStreamlit({
        type: 'libraryPoll',
        payload: {
          action: pending.action,
          page: pending.page,
          attempt: pending.attempts,
        },
      }, hasReceivedPropsRef.current);
      
      if (!sent) {
        // If we can't send, stop polling
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const fetchDesigns = useCallback((reset = false) => {
    // DON'T send requests to Python - this triggers Streamlit reruns!
    // Instead, Python auto-loads library data and passes it via props.
    // This function just resets local state if requested.
    
    if (!state.ready) {
      console.debug('[LibraryContext] fetchDesigns called before ready, deferring');
      return;
    }
    
    const newPage = reset ? 1 : state.page;
    
    // If we already have designs and not resetting, just increment page locally
    // The data is already auto-loaded by Python
    if (!reset && state.designs.length > 0) {
      console.debug('[LibraryContext] fetchDesigns: using cached data');
      return;
    }
    
    // Reset state if requested
    if (reset) {
      setState(s => ({ 
        ...s, 
        page: 1,
        // Don't clear designs - keep showing them until new data arrives
        // This prevents flash of empty content
      }));
      lastResponseRef.current = null;
    }
    
    // DON'T call safeSendToStreamlit - this triggers reruns!
    // Python auto-loads data via props. If no data yet, just wait.
    console.debug('[LibraryContext] fetchDesigns: waiting for Python auto-load via props');
    
  }, [state.ready, state.page, state.designs.length]);

  const loadDesign = useCallback((design: LibraryDesign) => {
    // Guard: don't proceed if component isn't ready/registered
    if (!state.ready || !hasReceivedPropsRef.current) {
      console.warn('[LibraryContext] loadDesign called but component not ready');
      return;
    }
    
    // Build WebGPU params directly from the design data
    // This avoids any round-trip to Python and prevents reruns
    const size = design.size || {};
    const opts = design.opts || {};
    
    // Extract geometry parameters from size
    const H = size.height ?? 120;
    const top_od = size.top_od ?? 140;
    const bottom_od = size.bottom_od ?? 90;
    const Rt = top_od * 0.5;
    const Rb = bottom_od * 0.5;
    const t_wall = size.wall_thickness ?? 3;
    const t_bottom = size.bottom_thickness ?? 3;
    const r_drain = size.drain_radius ?? 10;
    const expn = size.flare_exp ?? 1.1;
    
    // Build style params from design.opts using the packer utility
    // This creates the 48-element float array needed by the WGSL shader
    const [styleId, styleParams] = buildStyleParamPayload(design.style, opts);
    
    // Compute scene bounds for camera framing
    const baseRadius = Math.max(Rt, Rb, 1);
    const halfHeight = Math.max(H * 0.5, 1);
    const sceneRadius = Math.sqrt(baseRadius * baseRadius + halfHeight * halfHeight);
    
    // Build complete params for WebGPU renderer
    // Includes both geometry params AND style-specific params
    const wgpuParams: Record<string, unknown> = {
      // Core geometry
      H,
      Rt,
      Rb,
      expn,
      t_wall,
      t_bottom,
      r_drain,
      drain: r_drain,
      
      // Style identification
      styleId,
      
      // Style-specific parameters (48-element array for GPU buffer)
      // This is the key fix - we now pass ALL style params, not just geometry
      styleParams,
      
      // Camera/scene setup
      sceneRadius: sceneRadius * 1.2,
      scenePadding: 1.2,
      
      // Force param update
      paramUpdate: true,
      paramUpdateNonce: Date.now(), // Ensure change is detected
    };
    
    // Apply params directly to the renderer - NO polling, NO rerun
    if (controller?.updateParams) {
      console.log('[LibraryContext] Applying design params directly:', {
        style: design.style,
        styleId,
        styleParamsLength: styleParams.length,
        firstFewStyleParams: styleParams.slice(0, 10),
        H, Rt, Rb,
      });
      
      // Set local params lock to prevent Python from overwriting these params
      // on the next Streamlit rerun (e.g., when library fetches trigger reruns)
      // Lock for 5 seconds - enough time for multiple rerun cycles
      if (controller.setLocalParamsLock) {
        controller.setLocalParamsLock(5000);
      }
      
      controller.updateParams(wgpuParams);
      
      // Also sync the Zustand store so UI sliders update
      // This is the key to updating the embedded Design section sliders
      syncStoreFromParams({
        H,
        top_od,
        bottom_od,
        t_wall,
        t_bottom,
        r_drain,
        expn,
        styleId,
        styleName: design.style,
        styleOpts: opts as Record<string, number | boolean>,
      });
      
      console.log('[LibraryContext] Design loaded - UI sliders synced via Zustand store');
    } else {
      console.warn('[LibraryContext] loadDesign: controller not available for param update');
    }
    
    // DO NOT call setComponentValue - it ALWAYS triggers a Streamlit rerun.
    // The WebGPU preview is updated above via controller.updateParams()
    // and UI sliders are synced via syncStoreFromParams().
    
  }, [state.ready, controller]);

  const downloadSTL = useCallback((design: LibraryDesign) => {
    if (design.stl_url) {
      window.open(design.stl_url, '_blank');
    }
  }, []);

  const publish = useCallback((title: string, tags: string[], license: string) => {
    // DISABLED: Publishing via WebGPU component triggers Streamlit reruns
    // which kill the WebGPU preview. Use the sidebar publish button instead.
    console.warn('[LibraryContext] publish disabled in WebGPU mode - use sidebar publish instead');
    setState(s => ({ 
      ...s, 
      publishing: false, 
      error: 'Publishing is temporarily disabled in WebGPU mode. Please use the sidebar publish button.',
    }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState(s => ({ ...s, searchQuery: query }));
  }, []);

  const setStyleFilter = useCallback((style: string | null) => {
    setState(s => ({ ...s, styleFilter: style }));
  }, []);

  const loadMore = useCallback(() => {
    if (!state.ready) {
      console.debug('[LibraryContext] loadMore called before ready');
      return;
    }
    
    // Calculate next page and fetch directly with that value
    const nextPage = state.page + 1;
    setState(s => ({ 
      ...s, 
      page: nextPage,
      loading: true,
      error: null,
    }));
    
    // Send request with the calculated next page
    const sent = safeSendToStreamlit({
      type: 'libraryRequest',
      payload: {
        action: 'list',
        page: nextPage,
        search: state.searchQuery || null,
        style: state.styleFilter || null,
        limit: 12,
      },
    }, hasReceivedPropsRef.current);
    
    if (sent) {
      // Start polling for response
      startPolling('list', nextPage);
    } else {
      setState(s => ({ ...s, loading: false, error: 'Failed to load more' }));
    }
  }, [state.ready, state.page, state.searchQuery, state.styleFilter, startPolling]);

  const actions = useMemo<LibraryActions>(() => ({
    fetchDesigns,
    loadDesign,
    downloadSTL,
    publish,
    setSearchQuery,
    setStyleFilter,
    loadMore,
  }), [fetchDesigns, loadDesign, downloadSTL, publish, setSearchQuery, setStyleFilter, loadMore]);

  const value = useMemo<LibraryContextValue>(() => ({
    state,
    actions,
  }), [state, actions]);

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
};

// ============================================================================
// Hooks
// ============================================================================

export const useLibrary = (): LibraryContextValue => {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
};

export const useLibraryMaybe = (): LibraryContextValue | null => {
  return useContext(LibraryContext);
};
