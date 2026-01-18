/**
 * Store Tests
 * Tests for the main application store composition and selectors.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './store';
import { DEFAULT_GEOMETRY } from './types';

describe('AppStore', () => {
    beforeEach(() => {
        useAppStore.setState({
            geometry: DEFAULT_GEOMETRY,
            // Reset other slices if needed, but they should have defaults
        });
    });

    it('should initialize with default state', () => {
        const state = useAppStore.getState();
        expect(state.geometry).toEqual(DEFAULT_GEOMETRY);
        expect(state.style).toBeDefined();
        expect(state.ui).toBeDefined();
        expect(state.mesh).toBeDefined();
        expect(state.appearance).toBeDefined();
        expect(state.performance).toBeDefined();
    });

    it('should update geometry via actions', () => {
        const { setGeometryParam } = useAppStore.getState();
        setGeometryParam('H', 200);
        expect(useAppStore.getState().geometry.H).toBe(200);
    });

    it('should update style id', () => {
        const { setStyle } = useAppStore.getState();
        setStyle('GothicArches');
        expect(useAppStore.getState().style.name).toBe('GothicArches');
    });

    it('should update UI panel state', () => {
        const { setPanelOpen } = useAppStore.getState();
        setPanelOpen(true);
        expect(useAppStore.getState().ui.panelOpen).toBe(true);
        setPanelOpen(false);
        expect(useAppStore.getState().ui.panelOpen).toBe(false);
    });

    it('should update mesh quality', () => {
        const { setQualityPreset } = useAppStore.getState();
        setQualityPreset('high');
        const state = useAppStore.getState();
        // High preset has export_n_theta = 2048
        expect(state.mesh.export_n_theta).toBe(2048);
    });

    it('should update appearance color', () => {
        const { setPrimaryColor } = useAppStore.getState();
        setPrimaryColor('#123456');
        expect(useAppStore.getState().appearance.primaryColor).toBe('#123456');
    });
});
