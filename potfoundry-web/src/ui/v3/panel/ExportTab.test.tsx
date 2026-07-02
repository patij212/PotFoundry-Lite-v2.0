import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../hooks/useExportTier', () => ({
  useExportTier: () => ({
    checkExportAllowed: () => ({
      canExport: true, isPro: false, exportsRemaining: 7,
      totalExports: 10, showUpgradePrompt: false, reason: null,
    }),
    recordExport: vi.fn(),
    exportsThisMonth: 3,
    isPro: false,
    isAuthConfigured: true,
  }),
}));

import { ExportTab } from './ExportTab';
import { useAppStore } from '../../../state';

describe('ExportTab', () => {
  beforeEach(() => localStorage.clear());

  it('renders four fidelity rows with honest numbers', () => {
    render(<ExportTab />);
    for (const name of ['Draft', 'Standard', 'High', 'Ultra']) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getByText(/quick look/)).toBeInTheDocument();
  });

  it('selecting a fidelity applies the mesh preset', () => {
    render(<ExportTab />);
    fireEvent.click(screen.getByRole('radio', { name: /Draft/ }));
    const { export_n_theta } = useAppStore.getState().mesh;
    expect(export_n_theta).toBeLessThan(1024); // draft (512) is coarser than standard (1024)
  });

  it('3MF and OBJ are visible but disabled', () => {
    render(<ExportTab />);
    expect(screen.getByRole('tab', { name: '3MF' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'OBJ' })).toBeDisabled();
  });

  it('filename input writes to the store', () => {
    render(<ExportTab />);
    fireEvent.change(screen.getByLabelText('Filename'), { target: { value: 'my-pot' } });
    expect(useAppStore.getState().ui.exportFilename).toBe('my-pot');
  });

  it('shows the free-quota line', () => {
    render(<ExportTab />);
    expect(screen.getByText(/7 of 10 free exports left/)).toBeInTheDocument();
  });
});
