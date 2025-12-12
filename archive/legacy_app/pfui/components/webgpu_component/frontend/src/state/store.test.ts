/**
 * Zustand Store Tests
 *
 * Comprehensive tests for the application state management:
 * - GeometrySlice: Pot dimension parameters
 * - StyleSlice: Decorative style selection
 * - UISlice: UI state and panels
 * - AppearanceSlice: Visual appearance settings
 * - PerformanceSlice: Performance metrics
 *
 * @module state/store.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import {
  useAppStore,
  subscribeToGeometry,
  subscribeToStyle,
  subscribeToAppearance,
} from './store';
import { 
  DEFAULT_GEOMETRY, 
  DEFAULT_STYLE, 
  DEFAULT_UI_STATE,
  DEFAULT_APPEARANCE,
  DEFAULT_PERFORMANCE,
  DEFAULT_MESH_QUALITY,
} from './types';
import { STYLE_SCHEMAS, getDefaultStyleOpts } from './slices';

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Reset store to initial state before each test
 */
function resetStore() {
  useAppStore.setState({
    geometry: { ...DEFAULT_GEOMETRY },
    style: { ...DEFAULT_STYLE },
    ui: { ...DEFAULT_UI_STATE },
    mesh: { ...DEFAULT_MESH_QUALITY },
    appearance: { ...DEFAULT_APPEARANCE },
    performance: { ...DEFAULT_PERFORMANCE },
  });
}

// ============================================================================
// Geometry Slice Tests
// ============================================================================

describe('GeometrySlice', () => {
  beforeEach(resetStore);

  describe('initial state', () => {
    it('should have default geometry values', () => {
      const state = useAppStore.getState();
      expect(state.geometry).toEqual(DEFAULT_GEOMETRY);
    });

    it('should have positive dimensions', () => {
      const state = useAppStore.getState();
      expect(state.geometry.H).toBeGreaterThan(0);
      expect(state.geometry.top_od).toBeGreaterThan(0);
      expect(state.geometry.bottom_od).toBeGreaterThan(0);
    });
  });

  describe('setGeometryParam', () => {
    it('should update a single parameter', () => {
      const { setGeometryParam } = useAppStore.getState();
      
      act(() => {
        setGeometryParam('H', 120);
      });

      expect(useAppStore.getState().geometry.H).toBe(120);
    });

    it('should preserve other parameters', () => {
      const initialTop = useAppStore.getState().geometry.top_od;
      const { setGeometryParam } = useAppStore.getState();

      act(() => {
        setGeometryParam('H', 150);
      });

      expect(useAppStore.getState().geometry.top_od).toBe(initialTop);
    });
  });

  describe('setGeometryParams', () => {
    it('should update multiple parameters at once', () => {
      const { setGeometryParams } = useAppStore.getState();

      act(() => {
        setGeometryParams({ H: 100, top_od: 80, bottom_od: 60 });
      });

      const geometry = useAppStore.getState().geometry;
      expect(geometry.H).toBe(100);
      expect(geometry.top_od).toBe(80);
      expect(geometry.bottom_od).toBe(60);
    });
  });

  describe('resetGeometry', () => {
    it('should reset to default values', () => {
      const { setGeometryParam, resetGeometry } = useAppStore.getState();

      act(() => {
        setGeometryParam('H', 200);
        setGeometryParam('top_od', 100);
      });

      act(() => {
        resetGeometry();
      });

      expect(useAppStore.getState().geometry).toEqual(DEFAULT_GEOMETRY);
    });
  });

  describe('validateGeometry', () => {
    it('should return empty array for valid geometry', () => {
      const { validateGeometry } = useAppStore.getState();
      const errors = validateGeometry();
      expect(errors).toEqual([]);
    });
  });
});

// ============================================================================
// Style Slice Tests
// ============================================================================

describe('StyleSlice', () => {
  beforeEach(resetStore);

  describe('initial state', () => {
    it('should have default style', () => {
      const state = useAppStore.getState();
      expect(state.style).toEqual(DEFAULT_STYLE);
    });
  });

  describe('setStyle', () => {
    it('should change the active style', () => {
      const { setStyle } = useAppStore.getState();

      act(() => {
        setStyle('FourierBloom');
      });

      expect(useAppStore.getState().style.name).toBe('FourierBloom');
    });

    it('should reset options to new style defaults', () => {
      const { setStyle, setStyleOpt } = useAppStore.getState();

      // Set a custom option
      act(() => {
        setStyleOpt('customOpt', 999);
      });

      // Change style
      act(() => {
        setStyle('SpiralRidges');
      });

      // Old custom option should be gone
      expect(useAppStore.getState().style.opts.customOpt).toBeUndefined();
    });
  });

  describe('setStyleOpt', () => {
    it('should update a single style option', () => {
      const { setStyleOpt } = useAppStore.getState();

      act(() => {
        setStyleOpt('freq', 12);
      });

      expect(useAppStore.getState().style.opts.freq).toBe(12);
    });

    it('should preserve other options', () => {
      const { setStyleOpt } = useAppStore.getState();

      act(() => {
        setStyleOpt('freq', 12);
        setStyleOpt('amp', 5);
      });

      const opts = useAppStore.getState().style.opts;
      expect(opts.freq).toBe(12);
      expect(opts.amp).toBe(5);
    });
  });

  describe('setStyleOpts', () => {
    it('should update multiple options at once', () => {
      const { setStyleOpts } = useAppStore.getState();

      act(() => {
        setStyleOpts({ freq: 10, amp: 3, twist: 45 });
      });

      const opts = useAppStore.getState().style.opts;
      expect(opts.freq).toBe(10);
      expect(opts.amp).toBe(3);
      expect(opts.twist).toBe(45);
    });
  });

  describe('resetStyleOpts', () => {
    it('should reset options to style defaults', () => {
      const { setStyle, setStyleOpt, resetStyleOpts } = useAppStore.getState();

      act(() => {
        setStyle('SpiralRidges');
        setStyleOpt('ridges', 99);
      });

      act(() => {
        resetStyleOpts();
      });

      const opts = useAppStore.getState().style.opts;
      const defaults = getDefaultStyleOpts('SpiralRidges');
      expect(opts).toEqual(defaults);
    });
  });

  describe('getStyleSchema', () => {
    it('should return schema for current style', () => {
      const { setStyle, getStyleSchema } = useAppStore.getState();

      act(() => {
        setStyle('SuperformulaBlossom');
      });

      const schema = getStyleSchema();
      expect(schema).toBe(STYLE_SCHEMAS.SuperformulaBlossom);
      expect(schema.name).toBe('Superformula Blossom');
    });
  });
});

// ============================================================================
// UI Slice Tests
// ============================================================================

describe('UISlice', () => {
  beforeEach(resetStore);

  describe('togglePanel', () => {
    it('should toggle panel state', () => {
      const { togglePanel } = useAppStore.getState();
      const initialState = useAppStore.getState().ui.panelOpen;

      act(() => {
        togglePanel();
      });

      expect(useAppStore.getState().ui.panelOpen).toBe(!initialState);
    });
  });

  describe('setPanelOpen', () => {
    it('should explicitly set panel state', () => {
      const { setPanelOpen } = useAppStore.getState();

      act(() => {
        setPanelOpen(false);
      });

      expect(useAppStore.getState().ui.panelOpen).toBe(false);

      act(() => {
        setPanelOpen(true);
      });

      expect(useAppStore.getState().ui.panelOpen).toBe(true);
    });
  });

  describe('setActiveTab', () => {
    it('should change active tab', () => {
      const { setActiveTab } = useAppStore.getState();

      act(() => {
        setActiveTab('presets');
      });

      expect(useAppStore.getState().ui.activeTab).toBe('presets');
    });
  });

  describe('modal management', () => {
    it('should open modal', () => {
      const { openModal } = useAppStore.getState();

      act(() => {
        openModal('settings');
      });

      expect(useAppStore.getState().ui.modalOpen).toBe('settings');
    });

    it('should close modal', () => {
      const { openModal, closeModal } = useAppStore.getState();

      act(() => {
        openModal('settings');
      });

      act(() => {
        closeModal();
      });

      expect(useAppStore.getState().ui.modalOpen).toBeNull();
    });
  });

  describe('fullscreen', () => {
    it('should toggle fullscreen', () => {
      const { toggleFullscreen } = useAppStore.getState();
      const initialState = useAppStore.getState().ui.fullscreen;

      act(() => {
        toggleFullscreen();
      });

      expect(useAppStore.getState().ui.fullscreen).toBe(!initialState);
    });

    it('should set fullscreen explicitly', () => {
      const { setFullscreen } = useAppStore.getState();

      act(() => {
        setFullscreen(true);
      });

      expect(useAppStore.getState().ui.fullscreen).toBe(true);

      act(() => {
        setFullscreen(false);
      });

      expect(useAppStore.getState().ui.fullscreen).toBe(false);
    });
  });

  describe('resetUI', () => {
    it('should reset all UI state', () => {
      const { setActiveTab, openModal, setFullscreen, resetUI } = useAppStore.getState();

      act(() => {
        setActiveTab('export');
        openModal('about');
        setFullscreen(true);
      });

      act(() => {
        resetUI();
      });

      const ui = useAppStore.getState().ui;
      expect(ui).toEqual(DEFAULT_UI_STATE);
    });
  });
});

// ============================================================================
// Appearance Slice Tests
// ============================================================================

describe('AppearanceSlice', () => {
  beforeEach(resetStore);

  describe('setColorScheme', () => {
    it('should change color scheme', () => {
      const { setColorScheme } = useAppStore.getState();

      act(() => {
        setColorScheme('ocean_blue');
      });

      expect(useAppStore.getState().appearance.colorScheme).toBe('ocean_blue');
    });
  });

  describe('setPrimaryColor', () => {
    it('should set primary color', () => {
      const { setPrimaryColor } = useAppStore.getState();

      act(() => {
        setPrimaryColor('#ff0000');
      });

      expect(useAppStore.getState().appearance.primaryColor).toBe('#ff0000');
    });
  });

  describe('wireframe toggle', () => {
    it('should toggle wireframe', () => {
      const { toggleWireframe } = useAppStore.getState();
      const initial = useAppStore.getState().appearance.showWireframe;

      act(() => {
        toggleWireframe();
      });

      expect(useAppStore.getState().appearance.showWireframe).toBe(!initial);
    });

    it('should set wireframe explicitly', () => {
      const { setShowWireframe } = useAppStore.getState();

      act(() => {
        setShowWireframe(true);
      });

      expect(useAppStore.getState().appearance.showWireframe).toBe(true);
    });
  });

  describe('inner surface toggle', () => {
    it('should toggle inner surface visibility', () => {
      const { toggleInner } = useAppStore.getState();
      const initial = useAppStore.getState().appearance.showInner;

      act(() => {
        toggleInner();
      });

      expect(useAppStore.getState().appearance.showInner).toBe(!initial);
    });
  });

  describe('resetAppearance', () => {
    it('should reset all appearance settings', () => {
      const { setPrimaryColor, setShowWireframe, resetAppearance } = useAppStore.getState();

      act(() => {
        setPrimaryColor('#ff0000');
        setShowWireframe(true);
      });

      act(() => {
        resetAppearance();
      });

      expect(useAppStore.getState().appearance).toEqual(DEFAULT_APPEARANCE);
    });
  });
});

// ============================================================================
// Performance Slice Tests
// ============================================================================

describe('PerformanceSlice', () => {
  beforeEach(resetStore);

  describe('setGenerationTime', () => {
    it('should set generation time', () => {
      const { setGenerationTime } = useAppStore.getState();

      act(() => {
        setGenerationTime(42.5);
      });

      expect(useAppStore.getState().performance.generationTime).toBe(42.5);
    });
  });

  describe('setRenderTime', () => {
    it('should set render time', () => {
      const { setRenderTime } = useAppStore.getState();

      act(() => {
        setRenderTime(16.7);
      });

      expect(useAppStore.getState().performance.renderTime).toBe(16.7);
    });
  });

  describe('setMeshStats', () => {
    it('should set mesh statistics', () => {
      const { setMeshStats } = useAppStore.getState();

      act(() => {
        setMeshStats({ vertexCount: 10000, triangleCount: 20000 });
      });

      const perf = useAppStore.getState().performance;
      expect(perf.vertexCount).toBe(10000);
      expect(perf.triangleCount).toBe(20000);
    });
  });

  describe('setIsGenerating', () => {
    it('should set generating flag', () => {
      const { setIsGenerating } = useAppStore.getState();

      act(() => {
        setIsGenerating(true);
      });

      expect(useAppStore.getState().performance.isGenerating).toBe(true);

      act(() => {
        setIsGenerating(false);
      });

      expect(useAppStore.getState().performance.isGenerating).toBe(false);
    });
  });

  describe('recordGeneration', () => {
    it('should record generation with all stats', () => {
      const { recordGeneration } = useAppStore.getState();

      act(() => {
        recordGeneration({ 
          generationTime: 50, 
          vertexCount: 5000, 
          triangleCount: 10000 
        });
      });

      const perf = useAppStore.getState().performance;
      expect(perf.generationTime).toBe(50);
      expect(perf.vertexCount).toBe(5000);
      expect(perf.triangleCount).toBe(10000);
      expect(perf.isGenerating).toBe(false);
    });
  });

  describe('resetPerformance', () => {
    it('should reset all performance metrics', () => {
      const { recordGeneration, resetPerformance } = useAppStore.getState();

      act(() => {
        recordGeneration({ 
          generationTime: 100, 
          vertexCount: 10000, 
          triangleCount: 20000 
        });
      });

      act(() => {
        resetPerformance();
      });

      expect(useAppStore.getState().performance).toEqual(DEFAULT_PERFORMANCE);
    });
  });
});

// ============================================================================
// Subscription Tests
// ============================================================================

describe('Store Subscriptions', () => {
  beforeEach(resetStore);

  describe('subscribeToGeometry', () => {
    it('should notify on geometry changes', () => {
      let callCount = 0;
      let lastGeometry: typeof DEFAULT_GEOMETRY | null = null;

      const unsubscribe = subscribeToGeometry((geometry) => {
        callCount++;
        lastGeometry = geometry;
      });

      act(() => {
        useAppStore.getState().setGeometryParam('H', 150);
      });

      expect(callCount).toBeGreaterThan(0);
      expect(lastGeometry?.H).toBe(150);

      unsubscribe();
    });

    it('should not notify after unsubscribe', () => {
      let callCount = 0;

      const unsubscribe = subscribeToGeometry(() => {
        callCount++;
      });

      unsubscribe();
      const currentCount = callCount;

      act(() => {
        useAppStore.getState().setGeometryParam('H', 200);
      });

      // After unsubscribe, count should not increase
      expect(callCount).toBe(currentCount);
    });
  });

  describe('subscribeToStyle', () => {
    it('should notify on style changes', () => {
      let notified = false;

      const unsubscribe = subscribeToStyle(() => {
        notified = true;
      });

      act(() => {
        useAppStore.getState().setStyle('FourierBloom');
      });

      expect(notified).toBe(true);

      unsubscribe();
    });
  });

  describe('subscribeToAppearance', () => {
    it('should notify on appearance changes', () => {
      let notified = false;

      const unsubscribe = subscribeToAppearance(() => {
        notified = true;
      });

      act(() => {
        useAppStore.getState().setPrimaryColor('#00ff00');
      });

      expect(notified).toBe(true);

      unsubscribe();
    });
  });
});

// ============================================================================
// STYLE_SCHEMAS Tests
// ============================================================================

describe('STYLE_SCHEMAS', () => {
  it('should have all expected styles', () => {
    const expectedStyles = [
      'HarmonicRipple',
      'SuperformulaBlossom',
      'FourierBloom',
      'SpiralRidges',
      'PetalWaves',
      'GeometricFacets',
      'OrganicFlow',
      'Plain',
    ];

    for (const style of expectedStyles) {
      expect(STYLE_SCHEMAS[style as keyof typeof STYLE_SCHEMAS]).toBeDefined();
    }
  });

  it('LowPolyFacet style should have minimal basic parameters', () => {
    // LowPolyFacet has basic params but can be used with minimal config
    expect(STYLE_SCHEMAS.LowPolyFacet.params.lp_facets).toBeDefined();
    expect(STYLE_SCHEMAS.LowPolyFacet.params.lp_facets.default).toBe(12);
  });

  it('all styles should have name and description', () => {
    for (const schema of Object.values(STYLE_SCHEMAS)) {
      expect(schema.name).toBeTruthy();
      expect(schema.description).toBeTruthy();
    }
  });

  it('all parameters should have required fields', () => {
    for (const schema of Object.values(STYLE_SCHEMAS)) {
      for (const param of Object.values(schema.params)) {
        expect(param.type).toBeTruthy();
        expect(param.label).toBeTruthy();
        expect(typeof param.default).toBe('number');
        expect(typeof param.min).toBe('number');
        expect(typeof param.max).toBe('number');
      }
    }
  });
});

describe('getDefaultStyleOpts', () => {
  it('should return basic parameter defaults for LowPolyFacet style', () => {
    const opts = getDefaultStyleOpts('LowPolyFacet');
    expect(opts.lp_facets).toBe(12);
    expect(opts.lp_tiers).toBe(1);
    expect(opts.lp_amp).toBe(0.12);
  });

  it('should return default values for HarmonicRipple', () => {
    const opts = getDefaultStyleOpts('HarmonicRipple');
    expect(opts.hr_petals).toBe(7);
    expect(opts.hr_petal_amp).toBe(0.16);
    expect(opts.hr_bell).toBe(0.05);
  });

  it('should return default values for all params in schema', () => {
    for (const [styleName, schema] of Object.entries(STYLE_SCHEMAS)) {
      const opts = getDefaultStyleOpts(styleName as keyof typeof STYLE_SCHEMAS);
      
      for (const [paramName, paramDef] of Object.entries(schema.params)) {
        expect(opts[paramName]).toBe(paramDef.default);
      }
    }
  });
});
