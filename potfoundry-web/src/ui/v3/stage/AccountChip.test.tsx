import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../auth/UserMenu', () => ({
  UserMenu: () => <span data-testid="pf3-test-user-menu">UserMenu</span>,
}));
vi.mock('../../settings/AppSettingsButton', () => ({
  AppSettingsButton: () => <button data-testid="pf3-test-settings" aria-label="App settings" />,
}));

import { AccountChip } from './AccountChip';

describe('AccountChip', () => {
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
