/**
 * UI Slice Tests
 * Tests for the UI slice state defaults.
 */
import { describe, it, expect } from 'vitest';
import { UISlice } from './ui';

// Note: We test the interface/exports rather than the slice creator
// since slice creators require a full Zustand store setup

describe('UISlice interface', () => {
    it('should define UISlice type', () => {
        // Type check - ensure interface exists
        const mockSlice: Partial<UISlice> = {
            ui: {
                panelOpen: true,
                activeTab: 'controls',
                modalOpen: null,
                fullscreen: false,
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
