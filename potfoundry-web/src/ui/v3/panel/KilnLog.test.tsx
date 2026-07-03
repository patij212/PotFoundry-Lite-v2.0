import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { KilnLog } from './KilnLog';
import { useAppStore } from '../../../state';
import { DEFAULT_MESH_QUALITY } from '../../../state/types';
import { recordFiring } from './kilnLogStore';
import type { KilnEntry } from './kilnLogStore';

const LOG_KEY = 'pf3-kiln-log';

const FIXED_NOW = 1_700_000_000_000;

const entry1: KilnEntry = {
  filename: 'spiral-pot',
  sizeLabel: '2.5 MB',
  triangles: 50_000,
  fidelity: 'high',
  firedAt: FIXED_NOW - 5 * 60 * 1000, // 5 min ago
  ok: true,
};

const entry2: KilnEntry = {
  filename: 'wave-120',
  sizeLabel: '1.2 MB',
  triangles: 25_000,
  fidelity: 'custom',
  firedAt: FIXED_NOW - 2 * 60 * 60 * 1000, // 2h ago
  ok: false,
};

describe('KilnLog', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ mesh: { ...DEFAULT_MESH_QUALITY } });
  });

  it('shows the empty state copy when no entries', () => {
    render(<KilnLog now={FIXED_NOW} />);
    expect(
      screen.getByText('Nothing fired yet — your exports will appear here.')
    ).toBeInTheDocument();
  });

  it('renders 2 entries with filename, sizeLabel, and relative time', () => {
    localStorage.setItem(LOG_KEY, JSON.stringify([entry1, entry2]));
    render(<KilnLog now={FIXED_NOW} />);
    expect(screen.getByText(/spiral-pot\.stl · 2\.5 MB · 5 min ago/)).toBeInTheDocument();
    expect(screen.getByText(/wave-120\.stl · 1\.2 MB · 2h ago/)).toBeInTheDocument();
  });

  it('renders an "Export again" button for each row with correct aria-label', () => {
    localStorage.setItem(LOG_KEY, JSON.stringify([entry1, entry2]));
    render(<KilnLog now={FIXED_NOW} />);
    expect(
      screen.getByRole('button', { name: 'Export spiral-pot again' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export wave-120 again' })
    ).toBeInTheDocument();
  });

  it('"Export again" sets filename in the store and dispatches pf3:download', () => {
    localStorage.setItem(LOG_KEY, JSON.stringify([entry1]));
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<KilnLog now={FIXED_NOW} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export spiral-pot again' }));

    expect(useAppStore.getState().ui.exportFilename).toBe('spiral-pot');
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pf3:download' })
    );
    dispatchSpy.mockRestore();
  });

  it('"Export again" applies the quality preset when fidelity is not custom', () => {
    localStorage.setItem(LOG_KEY, JSON.stringify([entry1])); // fidelity: 'high'
    render(<KilnLog now={FIXED_NOW} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export spiral-pot again' }));

    // 'high' preset: export_n_theta=2048, export_n_z=1024, preview_n_theta=1024, preview_n_z=512
    const mesh = useAppStore.getState().mesh;
    expect(mesh.export_n_theta).toBe(2048);
    expect(mesh.preview_n_theta).toBe(1024);
  });

  it('"Export again" skips setQualityPreset and leaves mesh unchanged when fidelity is custom', () => {
    localStorage.setItem(LOG_KEY, JSON.stringify([entry2])); // fidelity: 'custom'
    render(<KilnLog now={FIXED_NOW} />);
    const initialMesh = { ...useAppStore.getState().mesh };

    fireEvent.click(screen.getByRole('button', { name: 'Export wave-120 again' }));

    expect(useAppStore.getState().ui.exportFilename).toBe('wave-120');
    expect(useAppStore.getState().mesh).toEqual(initialMesh);
  });

  // F3: live refresh — new entry added via recordFiring appears without remount.
  it('F3: new entry appears after recordFiring without remount', async () => {
    render(<KilnLog now={FIXED_NOW} />);
    expect(screen.getByText('Nothing fired yet — your exports will appear here.')).toBeInTheDocument();

    await act(async () => {
      recordFiring(entry1);
    });

    expect(screen.getByText(/spiral-pot\.stl/)).toBeInTheDocument();
    expect(screen.queryByText('Nothing fired yet — your exports will appear here.')).not.toBeInTheDocument();
  });
});
