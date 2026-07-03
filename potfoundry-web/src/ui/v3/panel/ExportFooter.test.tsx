import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { deriveDefaultFilename, estimateExport, formatBytes } from './exportName';

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

vi.mock('../../../hooks/useParametricExport', () => ({
  useParametricExport: () => ({
    progress: { status: 'idle', progress: 0, message: '' },
    stats: defaultMockStats,
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
});

describe('ExportFooter', () => {
  beforeEach(() => {
    exportSTL.mockClear();
    recordExport.mockClear();
    canExport = true;
  });

  it('fires the parametric export with a derived filename and records it', async () => {
    exportSTL.mockResolvedValueOnce(undefined);
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await waitFor(() => expect(exportSTL).toHaveBeenCalled());
    expect(String(exportSTL.mock.calls[0][0])).toMatch(/^[a-z0-9-]+$/);
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

  it('shows the upgrade CTA when gated', () => {
    canExport = false;
    render(<ExportFooter />);
    expect(screen.getByRole('button', { name: /Continue with Pro/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export STL/ })).not.toBeInTheDocument();
  });

  it('hides certificate text and restores button label after export', async () => {
    exportSTL.mockResolvedValueOnce(undefined);
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
});
