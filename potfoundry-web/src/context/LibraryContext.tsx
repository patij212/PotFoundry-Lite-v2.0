/**
 * Library Context for PotFoundry Web (Standalone)
 * 
 * This is a simplified version for the standalone app without Streamlit.
 * Library features will be implemented with Supabase in a later phase.
 * 
 * @module context/LibraryContext
 */

import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';
import { useControllerMaybe } from './ControllerContext';
import { buildStyleParamPayload } from '../utils/styleParams';
import { syncStoreFromParams } from '../hooks';

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
  libraryData?: unknown | null;
}

// ============================================================================
// Context
// ============================================================================

const LibraryContext = createContext<LibraryContextValue | null>(null);

// ============================================================================
// Provider (Standalone - No Streamlit)
// ============================================================================

export const LibraryProvider: React.FC<LibraryProviderProps> = ({ children }) => {
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
    ready: true, // Always ready in standalone mode
  });

  // Placeholder implementations - will be connected to Supabase later
  const fetchDesigns = useCallback((_reset = false) => {
    console.log('[LibraryContext] fetchDesigns - will be implemented with Supabase');
    // TODO: Fetch from Supabase
  }, []);

  const loadDesign = useCallback((design: LibraryDesign) => {
    // Build WebGPU params directly from the design data
    const size = design.size || {};
    const opts = design.opts || {};

    const H = size.height ?? 120;
    const top_od = size.top_od ?? 140;
    const bottom_od = size.bottom_od ?? 90;
    const Rt = top_od * 0.5;
    const Rb = bottom_od * 0.5;
    const t_wall = size.wall_thickness ?? 3;
    const t_bottom = size.bottom_thickness ?? 3;
    const r_drain = size.drain_radius ?? 10;
    const expn = size.flare_exp ?? 1.1;

    const [styleId, styleParams] = buildStyleParamPayload(design.style, opts);

    const baseRadius = Math.max(Rt, Rb, 1);
    const halfHeight = Math.max(H * 0.5, 1);
    const sceneRadius = Math.sqrt(baseRadius * baseRadius + halfHeight * halfHeight);

    const wgpuParams: Record<string, unknown> = {
      H, Rt, Rb, expn, t_wall, t_bottom, r_drain, drain: r_drain,
      styleId, styleParams,
      sceneRadius: sceneRadius * 1.2,
      scenePadding: 1.2,
      paramUpdate: true,
      paramUpdateNonce: Date.now(),
    };

    if (controller?.updateParams) {
      controller.updateParams(wgpuParams);

      syncStoreFromParams({
        H, top_od, bottom_od, t_wall, t_bottom, r_drain, expn,
        styleId,
        styleName: design.style,
        styleOpts: opts as Record<string, number | boolean>,
      });
    }
  }, [controller]);

  const downloadSTL = useCallback((design: LibraryDesign) => {
    if (design.stl_url) {
      window.open(design.stl_url, '_blank');
    }
  }, []);

  const publish = useCallback((_title: string, _tags: string[], _license: string) => {
    console.log('[LibraryContext] publish - will be implemented with Supabase');
    // TODO: Publish to Supabase
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState(s => ({ ...s, searchQuery: query }));
  }, []);

  const setStyleFilter = useCallback((style: string | null) => {
    setState(s => ({ ...s, styleFilter: style }));
  }, []);

  const loadMore = useCallback(() => {
    console.log('[LibraryContext] loadMore - will be implemented with Supabase');
    // TODO: Load more from Supabase
  }, []);

  const actions = useMemo<LibraryActions>(() => ({
    fetchDesigns, loadDesign, downloadSTL, publish,
    setSearchQuery, setStyleFilter, loadMore,
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
