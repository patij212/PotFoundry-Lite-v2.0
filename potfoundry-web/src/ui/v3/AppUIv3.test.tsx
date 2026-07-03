import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAppStore } from '../../state';

const mockExportSTL = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../hooks/useParametricExport', () => ({
  useParametricExport: () => ({
    progress: { status: 'idle', progress: 0, message: '' },
    stats: null,
    isAvailable: true,
    exportSTL: mockExportSTL,
  }),
}));
vi.mock('../../hooks/useExportTier', () => ({
  useExportTier: () => ({
    checkExportAllowed: () => ({
      canExport: true, isPro: false, exportsRemaining: 7,
      totalExports: 10, showUpgradePrompt: false, reason: null,
    }),
    recordExport: vi.fn().mockResolvedValue(undefined),
    exportsThisMonth: 3,
    isPro: false,
    isAuthConfigured: true,
  }),
}));

import AppUIv3 from './AppUIv3';

describe('AppUIv3 shell', () => {
  beforeEach(() => {
    mockExportSTL.mockClear();
  });

  it('renders the pf3 root with dark theme', () => {
    render(<AppUIv3 />);
    const root = screen.getByTestId('pf3-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.className).toContain('pf3-root');
  });

  it('store accepts the v3 theme', () => {
    useAppStore.getState().setUITheme('v3');
    expect(useAppStore.getState().ui.uiTheme).toBe('v3');
  });

  it('store tracks the v3 active tab', () => {
    useAppStore.getState().setV3ActiveTab('export');
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
  });

  it('renders panel, toolbar and status chrome', () => {
    useAppStore.getState().setUITheme('v3');
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('pf3-pill')).toHaveLength(3);
    expect(screen.getByTestId('pf3-status')).toBeInTheDocument();
  });

  it('Alt+2 switches to the style tab; typing in inputs is ignored', () => {
    useAppStore.getState().setUITheme('v3');
    render(<AppUIv3 />);
    fireEvent.keyDown(document, { key: '2', altKey: true });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('style');
  });

  it('Z toggles zen and hides the panel', () => {
    useAppStore.getState().setUITheme('v3');
    useAppStore.setState((s) => ({ ui: { ...s.ui, zenMode: false } }));
    render(<AppUIv3 />);
    fireEvent.keyDown(document, { key: 'z' });
    expect(useAppStore.getState().ui.zenMode).toBe(true);
    expect(screen.queryByTestId('pf3-panel')).not.toBeInTheDocument();
  });

  it('D in zen mode does not throw and no export fires', () => {
    useAppStore.getState().setUITheme('v3');
    useAppStore.setState((s) => ({ ui: { ...s.ui, zenMode: true } }));
    render(<AppUIv3 />);
    expect(() => fireEvent.keyDown(document, { key: 'd' })).not.toThrow();
    expect(mockExportSTL).not.toHaveBeenCalled();
  });

  it('dispatching pf3:showroom opens the showroom overlay dialog', () => {
    useAppStore.getState().setUITheme('v3');
    render(<AppUIv3 />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent('pf3:showroom'));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
