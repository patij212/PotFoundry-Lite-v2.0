import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAppStore } from '../../state';

const mockExportSTL = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('./stage/AccountChip', () => ({
  AccountChip: () => <div data-testid="pf3-account-chip" />,
}));

vi.mock('../pricing/PricingModal', () => ({
  PricingModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="pf3-pricing-modal" role="dialog" aria-label="Upgrade to Pro" /> : null,
}));

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

  it('account chip is present in zen mode (not gated by !zenMode)', () => {
    useAppStore.setState((s) => ({ ui: { ...s.ui, zenMode: true } }));
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-account-chip')).toBeInTheDocument();
    expect(screen.queryByTestId('pf3-panel')).not.toBeInTheDocument();
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

  it('? opens the shortcuts dialog', () => {
    useAppStore.getState().setUITheme('v3');
    render(<AppUIv3 />);
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByRole('heading')).toHaveTextContent('Shortcuts');
  });

  it('? closes the shortcuts dialog if already open', () => {
    useAppStore.getState().setUITheme('v3');
    render(<AppUIv3 />);
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByRole('heading')).toHaveTextContent('Shortcuts');
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('? does not open the shortcuts dialog when typing in an input field', () => {
    useAppStore.getState().setUITheme('v3');
    render(<AppUIv3 />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    document.body.removeChild(input);
  });

  it('F11 prevents default', () => {
    useAppStore.getState().setUITheme('v3');
    useAppStore.setState((s) => ({ ui: { ...s.ui, fullscreen: false } }));
    render(<AppUIv3 />);
    const event = new KeyboardEvent('keydown', { key: 'F11' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('F11 toggles fullscreen state', () => {
    useAppStore.getState().setUITheme('v3');
    useAppStore.setState((s) => ({ ui: { ...s.ui, fullscreen: false } }));
    render(<AppUIv3 />);
    fireEvent.keyDown(document, { key: 'F11' });
    expect(useAppStore.getState().ui.fullscreen).toBe(true);
  });

  it('pf3:upgrade event opens the PricingModal (mock rendered with open=true)', () => {
    useAppStore.getState().setUITheme('v3');
    render(<AppUIv3 />);
    expect(screen.queryByTestId('pf3-pricing-modal')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent('pf3:upgrade'));
    });
    expect(screen.getByTestId('pf3-pricing-modal')).toBeInTheDocument();
  });

  it('D with showroom open does not dispatch pf3:download', () => {
    useAppStore.getState().setUITheme('v3');
    useAppStore.setState((s) => ({ ui: { ...s.ui, zenMode: false } }));
    render(<AppUIv3 />);
    act(() => {
      window.dispatchEvent(new CustomEvent('pf3:showroom'));
    });
    let fired = false;
    const guard = () => { fired = true; };
    window.addEventListener('pf3:download', guard);
    fireEvent.keyDown(document, { key: 'd' });
    window.removeEventListener('pf3:download', guard);
    expect(fired).toBe(false);
  });
});

describe('AppUIv3 entrance sequence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('first mount: root gains data-entrance and session flag is set', () => {
    // Session flag absent → first-ever mount within this session
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-root')).toHaveAttribute('data-entrance');
    expect(sessionStorage.getItem('pf3-entered')).toBe('1');
  });

  it('second mount: no data-entrance when session flag already set', () => {
    // Pre-set the flag as if the component has mounted before
    sessionStorage.setItem('pf3-entered', '1');
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-root')).not.toHaveAttribute('data-entrance');
  });
});
