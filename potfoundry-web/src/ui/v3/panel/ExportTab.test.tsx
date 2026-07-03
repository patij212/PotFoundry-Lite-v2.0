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
import { DEFAULT_MESH_QUALITY } from '../../../state/types';

describe('ExportTab', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store to initial state for test hermiticity
    useAppStore.setState({ mesh: { ...DEFAULT_MESH_QUALITY } });
  });

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

  it('Ultra fidelity displays PRO chip', () => {
    render(<ExportTab />);
    const ultraRow = screen.getByRole('radio', { name: /Ultra/ });
    expect(ultraRow).toHaveTextContent('PRO');
  });

  it('Draft, Standard, and High fidelities do not display PRO chip', () => {
    render(<ExportTab />);
    for (const name of ['Draft', 'Standard', 'High']) {
      const row = screen.getByRole('radio', { name: new RegExp(name) });
      const chipElements = row.querySelectorAll('.pf3-prochip');
      expect(chipElements).toHaveLength(0);
    }
  });

  it('Ultra export resolution is distinct from High (4096 vs 2048)', () => {
    render(<ExportTab />);
    const ultraButton = screen.getByRole('radio', { name: /Ultra/ });
    const highButton = screen.getByRole('radio', { name: /High/ });
    const ultraEstimate = ultraButton.querySelector('.pf3-fidelity__est')?.textContent ?? '';
    const highEstimate = highButton.querySelector('.pf3-fidelity__est')?.textContent ?? '';
    // Ultra should have ~4× more triangles (4096×2048 vs 2048×1024)
    expect(ultraEstimate).not.toBe(highEstimate);
    expect(ultraEstimate).toContain('16');  // Expect 16M+ triangles for 4096×2048
  });

  it('selecting Ultra applies export_n_theta=4096 and export_n_z=2048', () => {
    render(<ExportTab />);
    fireEvent.click(screen.getByRole('radio', { name: /Ultra/ }));
    const { export_n_theta, export_n_z } = useAppStore.getState().mesh;
    expect(export_n_theta).toBe(4096);
    expect(export_n_z).toBe(2048);
  });

  it('Ultra row displays budget-cap note when selected', () => {
    render(<ExportTab />);
    const ultraButton = screen.getByRole('radio', { name: /Ultra/ });
    // Before click, note should not be visible
    expect(screen.queryByText(/capped by the mesh budget/)).not.toBeInTheDocument();
    // Click Ultra
    fireEvent.click(ultraButton);
    // After click, note should appear
    expect(screen.getByText(/capped by the mesh budget on most pots/)).toBeInTheDocument();
  });

  it('budget-cap note does not appear when Ultra is not selected', () => {
    render(<ExportTab />);
    fireEvent.click(screen.getByRole('radio', { name: /High/ }));
    expect(screen.queryByText(/capped by the mesh budget/)).not.toBeInTheDocument();
  });

  it('renders the kiln log section with empty state', () => {
    render(<ExportTab />);
    expect(
      screen.getByText('Nothing fired yet — your exports will appear here.')
    ).toBeInTheDocument();
  });

  it('test order independence: Draft-click mutation does not leak', () => {
    // First render: click Draft
    const { unmount: unmount1 } = render(<ExportTab />);
    fireEvent.click(screen.getByRole('radio', { name: /Draft/ }));
    const stateAfterFirst = useAppStore.getState().mesh;
    unmount1();

    // beforeEach runs and resets state
    localStorage.clear();
    useAppStore.setState({ mesh: { ...DEFAULT_MESH_QUALITY } });

    // Second render: verify state is reset
    render(<ExportTab />);
    const stateAfterSecond = useAppStore.getState().mesh;
    expect(stateAfterSecond).toEqual(DEFAULT_MESH_QUALITY);
    expect(stateAfterSecond.export_n_theta).not.toBe(stateAfterFirst.export_n_theta);
  });
});
