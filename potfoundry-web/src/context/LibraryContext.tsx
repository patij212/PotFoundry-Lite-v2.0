/**
 * Library Context for PotFoundry Web
 * 
 * Connects to Supabase to fetch and publish designs to the public library.
 * 
 * @module context/LibraryContext
 */

import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';
import { useControllerMaybe } from './ControllerContext';
import { buildStyleParamPayload } from '../utils/styleParams';
import { supabase, isSupabaseConfigured } from '../services/supabase';

// ============================================================================
// Types
// ============================================================================

export interface LibraryDesign {
  id: string;  // sha256 hash ID
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
  mesh?: {
    n_theta?: number;
    n_z?: number;
    twist?: number;
  };
  diagnostics?: {
    vertex_count?: number;
    triangle_count?: number;
  };
  app_commit?: string;
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
  fetchDesigns: (reset?: boolean, pageOverride?: number) => void;
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

const PAGE_SIZE = 20;

// ============================================================================
// Context
// ============================================================================

const LibraryContext = createContext<LibraryContextValue | null>(null);

// ============================================================================
// Provider
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
    ready: isSupabaseConfigured(),
  });

  // Fetch designs from Supabase
  const fetchDesigns = useCallback(async (reset = false, pageOverride?: number) => {
    if (!supabase) {
      console.warn('[LibraryContext] Supabase not configured');
      return;
    }

    setState(s => ({
      ...s,
      loading: true,
      error: null,
      page: reset ? 1 : s.page,
      designs: reset ? [] : s.designs
    }));

    try {
      const currentPage = reset ? 1 : (pageOverride ?? state.page);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('pots')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      // Apply filters
      if (state.searchQuery) {
        query = query.ilike('title', `%${state.searchQuery}%`);
      }
      if (state.styleFilter) {
        query = query.eq('style', state.styleFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[LibraryContext] Fetch error:', error);
        setState(s => ({ ...s, loading: false, error: error.message }));
        return;
      }

      const designs: LibraryDesign[] = (data || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        style: d.style,
        created_at: d.created_at,
        thumb_url: d.thumb_url,
        stl_url: d.stl_url,
        license: d.license,
        tags: d.tags || [],
        size: d.size || {},
        opts: d.opts || {},
        mesh: d.mesh || {},
        diagnostics: d.diagnostics || {},
        app_commit: d.app_commit,
      }));

      setState(s => ({
        ...s,
        loading: false,
        designs: reset ? designs : [...s.designs, ...designs],
        hasMore: designs.length === PAGE_SIZE,
        page: currentPage,
      }));
    } catch (err) {
      console.error('[LibraryContext] Fetch error:', err);
      setState(s => ({ ...s, loading: false, error: String(err) }));
    }
  }, [state.page, state.searchQuery, state.styleFilter]);

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

    // Extract bell parameters from opts (Python uses snake_case)
    const bellAmp = (opts.bell_amp as number) ?? 0.0;
    const bellCenter = (opts.bell_center as number) ?? 0.5;
    const bellWidth = (opts.bell_width as number) ?? 0.22;

    const [styleId, styleParams] = buildStyleParamPayload(design.style, opts);

    const baseRadius = Math.max(Rt, Rb, 1);
    const halfHeight = Math.max(H * 0.5, 1);
    const sceneRadius = Math.sqrt(baseRadius * baseRadius + halfHeight * halfHeight);

    const wgpuParams: Record<string, unknown> = {
      H, Rt, Rb, expn, t_wall, t_bottom, r_drain, drain: r_drain,
      bellAmp, bellCenter, bellWidth,
      styleId, styleParams,
      sceneRadius: sceneRadius * 1.2,
      scenePadding: 1.2,
      paramUpdate: true,
      paramUpdateNonce: Date.now(),
    };

    if (controller?.updateParams) {
      controller.updateParams(wgpuParams);

      // Sync store with loaded design parameters
      const store = (window as any).__POTFOUNDRY_STORE__;
      if (store) {
        const state = store.getState();

        // Sync geometry including bell params
        state.setGeometryParams({
          H, top_od, bottom_od, t_wall, t_bottom, r_drain, expn,
          bellAmp, bellCenter, bellWidth,
        });

        // Sync style
        state.setStyle(design.style);
        state.setStyleOpts(opts as Record<string, number | boolean>);
      }
    }
  }, [controller]);

  const downloadSTL = useCallback((design: LibraryDesign) => {
    if (design.stl_url) {
      window.open(design.stl_url, '_blank');
    }
  }, []);

  const publish = useCallback(async (title: string, tags: string[], license: string) => {
    if (!supabase) {
      console.warn('[LibraryContext] Supabase not configured');
      return;
    }

    setState(s => ({ ...s, publishing: true, publishSuccess: null }));

    try {
      // Get current pot state from store
      const store = (window as any).__POTFOUNDRY_STORE__;
      if (!store) {
        throw new Error('Store not available');
      }

      const storeState = store.getState();

      const designData = {
        title,
        style: storeState.style.name,
        tags,
        license,
        size: {
          height: storeState.geometry.H,
          top_od: storeState.geometry.top_od,
          bottom_od: storeState.geometry.bottom_od,
          wall_thickness: storeState.geometry.t_wall,
          bottom_thickness: storeState.geometry.t_bottom,
          drain_radius: storeState.geometry.r_drain,
          flare_exp: storeState.geometry.expn,
        },
        opts: storeState.style.opts,
      };

      const { error } = await supabase
        .from('pots')
        .insert([designData]);

      if (error) {
        console.error('[LibraryContext] Publish error:', error);
        setState(s => ({ ...s, publishing: false, publishSuccess: false }));
        return;
      }

      setState(s => ({ ...s, publishing: false, publishSuccess: true }));

      // Refresh the list
      fetchDesigns(true);
    } catch (err) {
      console.error('[LibraryContext] Publish error:', err);
      setState(s => ({ ...s, publishing: false, publishSuccess: false }));
    }
  }, [fetchDesigns]);

  const setSearchQuery = useCallback((query: string) => {
    setState(s => ({ ...s, searchQuery: query }));
  }, []);

  const setStyleFilter = useCallback((style: string | null) => {
    setState(s => ({ ...s, styleFilter: style }));
  }, []);

  const loadMore = useCallback(() => {
    if (!state.loading && state.hasMore) {
      const nextPage = state.page + 1;
      setState(s => ({ ...s, page: nextPage }));
      fetchDesigns(false, nextPage);
    }
  }, [state.loading, state.hasMore, state.page, fetchDesigns]);

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
