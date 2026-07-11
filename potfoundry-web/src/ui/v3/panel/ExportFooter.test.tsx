import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { deriveDefaultFilename, estimateExport, formatBytes, deriveFidelityKey } from './exportName';
import { getKilnLog } from './kilnLogStore';

const exportSTL = vi.fn();
const recordExport = vi.fn().mockResolvedValue(undefined);
let canExport = true;

// Set up default mock stats that will be returned by the hook
const defaultMockStats = {
  triangleCount: 50000,
  vertexCount: 25000,
  fileSize: '2.5 MB',
  fileSizeBytes: 2621440,
  volumeMm3: 1000,
  volumeMl: 1,
  surfaceAreaMm2: 500,
  generationTimeMs: 1500,
  gpuAccelerated: true,
  gridDimensions: { nu: 336, nt: 168 },
  validationSummary: {
    valid: true,
    manifoldOk: true,
    degeneratesOk: true,
    normalsOk: true,
    triangleQualityOk: true,
    seamOk: true,
    warnings: [],
    minAngleDeg: 22.5,
    maxAspectRatio: 4.2,
    p95PosErrorMm: 0.08,
  },
};

// Mutable variable: starts null before each test; exportSTL mock sets it when the
// export "completes". The hook factory reads currentStats on every render call, so
// the component sees the update on the re-render triggered by setDone().
let currentStats: typeof defaultMockStats | null = null;

// Mutable, like currentStats above. The real hook updates `progress` (incl. on a
// validation failure, BEFORE exportSTL resolves false) via its own useState, which
// re-renders any consuming component regardless of what that component's own
// callback does afterward. This mock has no such backing state, so tests that need
// an error-status render set this BEFORE calling render() rather than relying on a
// mid-flight mutation to trigger a re-render on its own.
const IDLE_PROGRESS = { status: 'idle' as const, progress: 0, message: '' };
let currentProgress: { status: string; progress: number; message: string } = IDLE_PROGRESS;

vi.mock('../../../hooks/useParametricExport', () => ({
  useParametricExport: () => ({
    progress: currentProgress,
    stats: currentStats,
    isAvailable: true,
    exportSTL,
  }),
}));
vi.mock('../../../hooks/useExportTier', () => ({
  useExportTier: () => ({
    checkExportAllowed: () => ({
      canExport, isPro: false, exportsRemaining: canExport ? 7 : 0,
      totalExports: 10, showUpgradePrompt: !canExport, reason: canExport ? null : 'limit',
    }),
    recordExport,
    exportsThisMonth: 3,
    isPro: false,
    isAuthConfigured: true,
  }),
}));

import { ExportFooter } from './ExportFooter';
import { useAppStore } from '../../../state';

describe('exportName utils', () => {
  it('derives kebab filenames', () => {
    expect(deriveDefaultFilename('HarmonicRipple', 120)).toBe('harmonic-ripple-120');
  });
  it('estimates triangles and bytes', () => {
    const { tris, bytes } = estimateExport(336, 168);
    expect(tris).toBe(112896);
    expect(bytes).toBe(84 + 112896 * 50);
  });
  it('formats bytes humanely', () => {
    expect(formatBytes(4_322_132)).toBe('4.1 MB');
    expect(formatBytes(512_000)).toBe('500 KB');
  });
  it('deriveFidelityKey identifies known presets', () => {
    expect(deriveFidelityKey({ export_n_theta: 512,  export_n_z: 256,  preview_n_theta: 256,  preview_n_z: 128  })).toBe('draft');
    expect(deriveFidelityKey({ export_n_theta: 1024, export_n_z: 512,  preview_n_theta: 512,  preview_n_z: 256  })).toBe('standard');
    expect(deriveFidelityKey({ export_n_theta: 2048, export_n_z: 1024, preview_n_theta: 1024, preview_n_z: 512  })).toBe('high');
    expect(deriveFidelityKey({ export_n_theta: 4096, export_n_z: 2048, preview_n_theta: 2048, preview_n_z: 1024 })).toBe('ultra');
  });
  it('deriveFidelityKey returns custom for non-preset resolutions', () => {
    expect(deriveFidelityKey({ export_n_theta: 336, export_n_z: 168, preview_n_theta: 168, preview_n_z: 84 })).toBe('custom');
  });
});

describe('ExportFooter', () => {
  beforeEach(() => {
    // Start each test with stats null; exportSTL sets it to a fresh spread so
    // the component's useEffect([stats]) sees a reference change on re-render.
    currentStats = null;
    currentProgress = IDLE_PROGRESS;
    exportSTL.mockReset();
    exportSTL.mockImplementation(async () => {
      currentStats = { ...defaultMockStats };
      return true;
    });
    recordExport.mockClear();
    canExport = true;
    localStorage.clear();
    useAppStore.setState((state) => ({
      ui: { ...state.ui, exportFormat: 'stl', exportFilename: null },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the parametric export with a derived filename and records it', async () => {
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await waitFor(() => expect(exportSTL).toHaveBeenCalled());
    expect(String(exportSTL.mock.calls[0][0])).toMatch(/^[a-z0-9-]+$/);
    expect(exportSTL.mock.calls[0][1]).toBeUndefined();
    expect(exportSTL.mock.calls[0][2]).toEqual({ format: 'stl' });
    await waitFor(() => expect(recordExport).toHaveBeenCalledOnce());
    // Certificate should be visible after export
    await waitFor(() => {
      expect(screen.getByText(/watertight/)).toBeInTheDocument();
    });
  });

  it('shows error feedback when export fails', async () => {
    exportSTL.mockRejectedValueOnce(new Error('Export failed'));
    recordExport.mockClear();
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Export failed — check the console, then try again');
    });
    expect(recordExport).not.toHaveBeenCalled();
  });

  // E-2026-07-09-EXPORT-PERF: exportSTL resolving `false` (generateMesh's
  // validation guard produced no mesh — e.g. DragonScales' 409-sliver
  // default export before the summarizeConformingValidation fix) used to be
  // indistinguishable from success: exportSTL returned void either way, so
  // fire() always fell through to recordExport(), burning free-tier quota
  // on an export that never happened.
  it('does not record the export or log a firing when exportSTL resolves false', async () => {
    exportSTL.mockResolvedValue(false);
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));

    await waitFor(() => expect(exportSTL).toHaveBeenCalled());
    // Give any (incorrect) async recordExport call a tick to have fired.
    await act(async () => {});

    expect(recordExport).not.toHaveBeenCalled();
    expect(getKilnLog()).toHaveLength(0);
    expect(screen.queryByText(/watertight/)).not.toBeInTheDocument();
  });

  // The other half of the same fix: the hook's progress.message carries the
  // SPECIFIC failure reason (e.g. the sliver-count validation warning), but
  // it was only ever rendered while progress.status was 'generating' —
  // once generateMesh's own catch flipped status to 'error', `firing`
  // became false and the message vanished with no replacement shown.
  it('surfaces the specific reason from progress.message once status is error', async () => {
    currentProgress = {
      status: 'error',
      progress: 0,
      message: 'Parametric export failed: Export validation failed: 409 sliver triangle(s) (aspect > 100, finite-area — print-usable, non-blocking)',
    };
    render(<ExportFooter />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/409 sliver triangle/);
    });
  });

  it('shows the upgrade CTA when gated', () => {
    canExport = false;
    render(<ExportFooter />);
    expect(screen.getByRole('button', { name: /Continue with Pro/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export STL/ })).not.toBeInTheDocument();
  });

  it('hides certificate text and restores button label after export', async () => {
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await waitFor(() => expect(exportSTL).toHaveBeenCalled());

    // Certificate should be visible after export
    await waitFor(() => {
      expect(screen.getByText(/watertight/)).toBeInTheDocument();
    });

    // Button label should remain "Export STL" (not "Exported ✓")
    expect(screen.getByRole('button', { name: /Export STL/ })).toBeInTheDocument();
  });

  it('uses the selected 3MF format for the CTA label, export route, certificate, and kiln log', async () => {
    useAppStore.setState((state) => ({
      ui: { ...state.ui, exportFormat: '3mf' },
    }));
    render(<ExportFooter />);

    fireEvent.click(screen.getByRole('button', { name: /Export 3MF/ }));

    await waitFor(() => expect(exportSTL).toHaveBeenCalled());
    expect(exportSTL.mock.calls[0][2]).toEqual({ format: '3mf' });
    await waitFor(() => expect(screen.getByText(/\.3mf/)).toBeInTheDocument());
    await waitFor(() => {
      const log = getKilnLog();
      expect(log[0].format).toBe('3mf');
    });
  });

  it('falls back to STL when an existing in-memory UI state is missing exportFormat', async () => {
    useAppStore.setState((state) => ({
      ui: { ...state.ui, exportFormat: undefined as never },
    }));
    render(<ExportFooter />);

    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));

    await waitFor(() => expect(exportSTL).toHaveBeenCalled());
    expect(exportSTL.mock.calls[0][2]).toEqual({ format: 'stl' });
  });

  // F1: verifies the closure-timing fix — stats is null on first mount; the hook's
  // setStats fires inside exportSTL (before promise resolution) but the re-render is
  // batched by React 18 until after the await continuation. awaitingStatsRef + the
  // [stats] effect capture the fresh value once the batch flushes.
  it('F1: certificate renders on the very first export when stats starts null', async () => {
    // currentStats is already null from beforeEach; exportSTL sets it on resolve
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await waitFor(() => {
      expect(screen.getByText(/watertight/)).toBeInTheDocument();
    });
  });

  it('records the firing in the kiln log on success', async () => {
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await waitFor(() => {
      const log = getKilnLog();
      expect(log).toHaveLength(1);
      expect(log[0].filename).toMatch(/^[a-z0-9-]+$/);
    });
  });

  // F2: uses fake timers to verify the 12 s collapse timeout.
  // Fake timers are installed before render so the useEffect([done]) setTimeout
  // is registered against the fake clock; vi.advanceTimersByTime then fires it.
  it('F2: certificate collapses after 12 seconds', async () => {
    vi.useFakeTimers();

    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));

    // Flush all pending microtasks (exportSTL → recordExport → setDone →
    // useEffect([stats]) → setCapturedStats) and the resulting React renders.
    // act() drives React's work loop until stable; no fake-timer calls needed here
    // because the entire path to certificate visibility is microtask-driven.
    await act(async () => {});

    // Certificate must be visible before we advance the clock
    expect(screen.getByText(/watertight/)).toBeInTheDocument();

    // Advance clock by 12 s — fires the useEffect([done]) setTimeout
    act(() => {
      vi.advanceTimersByTime(12000);
    });

    // Certificate gone, button still present
    expect(screen.queryByText(/watertight/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export STL/ })).toBeInTheDocument();
  });

  // F1 (stale-closure): KilnLog's refire calls setExportFilename then dispatches
  // pf3:download in the same synchronous tick — no React re-render in between.
  // fire() must read the fresh filename from the store, not the closure snapshot.
  it('F1: re-fire uses fresh filename from store set in the same tick', async () => {
    render(<ExportFooter />);

    // Simulate KilnLog's refire: set a new filename, then immediately dispatch
    // pf3:download — no re-render between the two calls.
    act(() => {
      useAppStore.getState().setExportFilename('fresh-refire-name');
      window.dispatchEvent(new CustomEvent('pf3:download'));
    });

    await waitFor(() => expect(exportSTL).toHaveBeenCalledWith('fresh-refire-name', undefined, { format: 'stl' }));
  });
});
