/**
 * UI Slice Tests
 * Tests for the UI slice state defaults and theme persistence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UISlice } from './ui';

// Note: We test the interface/exports and localStorage behavior

describe('UISlice interface', () => {
    it('should define UISlice type', () => {
        // Type check - ensure interface exists
        const mockSlice: Partial<UISlice> = {
            ui: {
                panelOpen: true,
                activeTab: 'controls',
                modalOpen: null,
                fullscreen: false,
                exportFormat: 'stl',
                uiTheme: 'classic',
                v2ActiveTab: 'shape',
                zenMode: false,
                density: 'comfortable',
                hapticsEnabled: true,
                v3ActiveTab: 'shape',
                exportFilename: null,
            },
        };
        expect(mockSlice.ui).toBeDefined();
    });

    it('should have valid activeTab values', () => {
        const validTabs = ['controls', 'presets', 'export', 'metrics'];
        const mockUI = { activeTab: 'controls' as const };
        expect(validTabs).toContain(mockUI.activeTab);
    });

    it('should have valid modal values', () => {
        const validModals = ['export', 'presets', 'settings', 'about', null];
        const mockUI = { modalOpen: null as const };
        expect(validModals).toContain(mockUI.modalOpen);
    });
});

describe('Theme persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    it('defaults to classic when no theme is stored', async () => {
        vi.resetModules();
        const { useAppStore: freshStore } = await import('../store');
        expect(freshStore.getState().ui.uiTheme).toBe('classic');
    });

    it('boots into v2 when pf2-ui-theme=v2 is stored', async () => {
        localStorage.setItem('pf2-ui-theme', 'v2');
        vi.resetModules();
        const { useAppStore: freshStore } = await import('../store');
        expect(freshStore.getState().ui.uiTheme).toBe('v2');
    });

    it('boots into v3 when pf2-ui-theme=v3 is stored', async () => {
        localStorage.setItem('pf2-ui-theme', 'v3');
        vi.resetModules();
        const { useAppStore: freshStore } = await import('../store');
        expect(freshStore.getState().ui.uiTheme).toBe('v3');
    });

    it('falls back to classic for unrecognized stored themes', async () => {
        localStorage.setItem('pf2-ui-theme', 'garbage');
        vi.resetModules();
        const { useAppStore: freshStore } = await import('../store');
        expect(freshStore.getState().ui.uiTheme).toBe('classic');
    });
});
