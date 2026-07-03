import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../auth/UserMenu', () => ({
  UserMenu: () => <span data-testid="pf3-test-user-menu">UserMenu</span>,
}));
vi.mock('../../settings/AppSettingsButton', () => ({
  AppSettingsButton: () => <button data-testid="pf3-test-settings" aria-label="App settings" />,
}));

import { AccountChip } from './AccountChip';

describe('AccountChip (mocked)', () => {
  it('renders the chip container wrapping a glass surface', () => {
    render(<AccountChip />);
    const chip = screen.getByTestId('pf3-account-chip');
    expect(chip).toBeInTheDocument();
    expect(chip.querySelector('.pf3-glass-surface')).toBeInTheDocument();
  });

  it('hosts both AppSettingsButton and UserMenu', () => {
    render(<AccountChip />);
    expect(screen.getByTestId('pf3-test-settings')).toBeInTheDocument();
    expect(screen.getByTestId('pf3-test-user-menu')).toBeInTheDocument();
  });
});

describe('AccountChip (real composition)', () => {
  beforeAll(() => {
    vi.doUnmock('../../auth/UserMenu');
    vi.doUnmock('../../settings/AppSettingsButton');
    // Mock window.matchMedia for jsdom
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('renders real components with real UserMenu and AppSettingsButton in auth-disabled state', async () => {
    // Dynamic import after resetModules to get unmocked versions
    const { AccountChip: RealAccountChip } = await import('./AccountChip');
    const { AuthProvider } = await import('../../../context/AuthContext');
    const { ToastProvider } = await import('../../shared');

    render(
      <ToastProvider>
        <AuthProvider>
          <RealAccountChip />
        </AuthProvider>
      </ToastProvider>
    );

    // Assert: GlassSurface renders
    const chip = screen.getByTestId('pf3-account-chip');
    expect(chip).toBeInTheDocument();
    expect(chip.querySelector('.pf3-glass-surface')).toBeInTheDocument();

    // Assert: Real UserMenu's unconfigured state (Auth Disabled) renders
    expect(screen.getByText('Auth Disabled')).toBeInTheDocument();

    // Assert: Real AppSettingsButton gear icon/button is present with correct aria-label
    expect(screen.getByLabelText('App settings')).toBeInTheDocument();
    // Generous timeout: resetModules + real dynamic provider imports are slow under full-suite worker load
  }, 15000);
});
