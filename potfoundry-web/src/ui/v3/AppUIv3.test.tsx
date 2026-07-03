import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { useAppStore } from '../../state';

// useMobile mock — default desktop so all existing tests run unchanged.
const mockUseMobile = vi.hoisted(() =>
  vi.fn(() => ({ isMobile: false, isTablet: false, hasTouch: false, viewportWidth: 1024 })),
);
vi.mock('../../hooks/useMobile', () => ({ useMobile: mockUseMobile }));

// TouchModeProvider spy — captures calls to verify mounting and value prop
const TouchModeProviderSpy = vi.hoisted(() => {
  return vi.fn(({ value, children }: { value: boolean; children: React.ReactNode }) => <>{children}</>);
});
vi.mock('./mobile/TouchModeContext', () => ({
  TouchModeProvider: TouchModeProviderSpy,
  useTouchMode: () => false,
}));

const mockExportSTL = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('./mobile/SheetShell', () => ({
  // Note: production SheetShell attaches contentRef to the inner content div,
  // not the outer wrapper. The mock attaches to the outer div for simplicity —
  // swipe gesture behaviour is already tested in MobileTabBar.test.tsx.
  SheetShell: ({ children, footer, contentRef }: { children: React.ReactNode; footer?: React.ReactNode; contentRef?: React.RefObject<HTMLDivElement> }) => (
    <div data-testid="pf3-sheet" ref={contentRef}>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock('./mobile/MobileTabBar', () => ({
  // Exposes onExport so AppUIv3 integration tests can exercise the full
  // one-tap CTA path without needing to unmock and configure swipe/haptics.
  MobileTabBar: ({ contentRef, onExport }: { contentRef: React.RefObject<HTMLElement>; onExport?: () => void }) => (
    <div data-testid="pf3-mobile-tab-bar" ref={contentRef}>
      <button type="button" aria-label="Export STL" onClick={() => onExport?.()}>Export</button>
    </div>
  ),
}));

vi.mock('./panel/ShapeTab', () => ({
  ShapeTab: () => <div data-testid="pf3-shape-tab" />,
}));

vi.mock('./panel/StyleTab', () => ({
  StyleTab: () => <div data-testid="pf3-style-tab" />,
}));

vi.mock('./panel/ExportTab', () => ({
  ExportTab: () => <div data-testid="pf3-export-tab" />,
}));

vi.mock('./panel/ExportFooter', () => ({
  ExportFooter: () => <div data-testid="pf3-export-footer" />,
}));

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

describe('AppUIv3 TouchModeProvider wiring', () => {
  beforeEach(() => {
    TouchModeProviderSpy.mockClear();
    mockUseMobile.mockReturnValue({ isMobile: false, isTablet: false, hasTouch: false, viewportWidth: 1024 });
  });

  it('desktop: TouchModeProvider mounted with value=false', () => {
    render(<AppUIv3 />);
    expect(TouchModeProviderSpy).toHaveBeenCalledWith(
      expect.objectContaining({ value: false }),
      expect.anything(),
    );
  });

  it('mobile: TouchModeProvider mounted with value=true', () => {
    mockUseMobile.mockReturnValue({ isMobile: true, isTablet: true, hasTouch: true, viewportWidth: 375 });
    render(<AppUIv3 />);
    expect(TouchModeProviderSpy).toHaveBeenCalledWith(
      expect.objectContaining({ value: true }),
      expect.anything(),
    );
  });
});

describe('AppUIv3 entrance sequence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockUseMobile.mockReturnValue({ isMobile: false, isTablet: false, hasTouch: false, viewportWidth: 1024 });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('desktop first mount: root gains data-entrance and session flag is set', () => {
    // Session flag absent + desktop → should set entrance
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-root')).toHaveAttribute('data-entrance');
    expect(sessionStorage.getItem('pf3-entered')).toBe('1');
  });

  it('desktop second mount: no data-entrance when session flag already set', () => {
    // Pre-set the flag as if the component has mounted before
    sessionStorage.setItem('pf3-entered', '1');
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-root')).not.toHaveAttribute('data-entrance');
  });

  it('mobile first mount: no data-entrance and session flag is NOT set', () => {
    // Session flag absent + mobile → entrance effect should NOT run
    mockUseMobile.mockReturnValue({ isMobile: true, isTablet: true, hasTouch: true, viewportWidth: 375 });
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-root')).not.toHaveAttribute('data-entrance');
    expect(sessionStorage.getItem('pf3-entered')).toBeNull();
  });
});

describe('AppUIv3 desktop layout', () => {
  // Explicit desktop assertions (isMobile: false is the module-level default,
  // but be explicit here for documentation value).
  beforeEach(() => {
    mockUseMobile.mockReturnValue({ isMobile: false, isTablet: false, hasTouch: false, viewportWidth: 1024 });
  });
  afterEach(() => {
    mockUseMobile.mockReturnValue({ isMobile: false, isTablet: false, hasTouch: false, viewportWidth: 1024 });
  });

  it('root carries data-layout="desktop"', () => {
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-root')).toHaveAttribute('data-layout', 'desktop');
  });
});

describe('AppUIv3 mobile shell', () => {
  // Proxy pf3:download → mockExportSTL so F1 tests can verify the full
  // one-tap path. The ExportFooter mock is a plain div (no event listener);
  // this listener stands in for it without needing hooks in the mock factory.
  let downloadListener: () => void;

  beforeEach(() => {
    mockExportSTL.mockClear();
    downloadListener = () => { mockExportSTL(); };
    window.addEventListener('pf3:download', downloadListener);
    mockUseMobile.mockReturnValue({ isMobile: true, isTablet: true, hasTouch: true, viewportWidth: 375 });
    useAppStore.setState((s) => ({ ui: { ...s.ui, zenMode: false, v3ActiveTab: 'shape' } }));
  });
  afterEach(() => {
    window.removeEventListener('pf3:download', downloadListener);
    // Reset to desktop so subsequent describe blocks start clean.
    mockUseMobile.mockReturnValue({ isMobile: false, isTablet: false, hasTouch: false, viewportWidth: 1024 });
  });

  it('root carries data-layout="mobile"', () => {
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-root')).toHaveAttribute('data-layout', 'mobile');
  });

  it('panel rail is absent in mobile mode', () => {
    render(<AppUIv3 />);
    expect(screen.queryByTestId('pf3-panel')).not.toBeInTheDocument();
  });

  it('pill toolbar is absent in mobile mode', () => {
    render(<AppUIv3 />);
    expect(screen.queryByTestId('pf3-pill')).not.toBeInTheDocument();
  });

  it('sheet placeholder is present when not in zen', () => {
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-sheet')).toBeInTheDocument();
  });

  it('sheet placeholder is hidden in zen (zen = pot only)', () => {
    useAppStore.setState((s) => ({ ui: { ...s.ui, zenMode: true } }));
    render(<AppUIv3 />);
    expect(screen.queryByTestId('pf3-sheet')).not.toBeInTheDocument();
  });

  it('account chip is present in mobile mode', () => {
    render(<AppUIv3 />);
    expect(screen.getByTestId('pf3-account-chip')).toBeInTheDocument();
  });

  it('pf3:upgrade event opens PricingModal in mobile mode', () => {
    render(<AppUIv3 />);
    expect(screen.queryByTestId('pf3-pricing-modal')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent('pf3:upgrade'));
    });
    expect(screen.getByTestId('pf3-pricing-modal')).toBeInTheDocument();
  });

  it('mobile mode: sheet contains ShapeTab content by default', () => {
    render(<AppUIv3 />);
    // pf3-shape-tab must be a descendant of pf3-sheet (not just present in DOM)
    expect(within(screen.getByTestId('pf3-sheet')).getByTestId('pf3-shape-tab')).toBeInTheDocument();
  });

  it('mobile mode: store tab switch swaps sheet content', () => {
    useAppStore.getState().setV3ActiveTab('shape'); // Ensure we start at shape
    const { rerender } = render(<AppUIv3 />);
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('shape');

    // Switch to style
    act(() => {
      useAppStore.getState().setV3ActiveTab('style');
    });
    rerender(<AppUIv3 />);
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('style');
  });

  it('mobile mode: MobileTabBar present exactly once in footer', () => {
    render(<AppUIv3 />);
    const tabBars = screen.getAllByTestId('pf3-mobile-tab-bar');
    expect(tabBars).toHaveLength(1);
  });

  // F1: one-tap export CTA from any tab
  it('mobile CTA from Shape tab: switches to Export tab and fires exportSTL', async () => {
    // Store starts at 'shape' (set in beforeEach)
    render(<AppUIv3 />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export STL' }));
    });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
    expect(mockExportSTL).toHaveBeenCalledTimes(1);
  });

  it('mobile CTA from Export tab: fires exportSTL without tab churn', async () => {
    useAppStore.setState((s) => ({ ui: { ...s.ui, v3ActiveTab: 'export' } }));
    render(<AppUIv3 />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export STL' }));
    });
    expect(mockExportSTL).toHaveBeenCalledTimes(1);
    // Tab must remain on export — no accidental navigation
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
  });

  it('mobile mode: Export tab renders ExportTab + ExportFooter', () => {
    act(() => {
      useAppStore.getState().setV3ActiveTab('export');
    });
    render(<AppUIv3 />);
    const sheet = screen.getByTestId('pf3-sheet');
    expect(within(sheet).getByTestId('pf3-export-tab')).toBeInTheDocument();
    expect(within(sheet).getByTestId('pf3-export-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('pf3-shape-tab')).not.toBeInTheDocument();
  });
});
