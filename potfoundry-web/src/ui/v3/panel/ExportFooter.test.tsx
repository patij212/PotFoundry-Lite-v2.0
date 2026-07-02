import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { deriveDefaultFilename, estimateExport, formatBytes } from './exportName';

const exportSTL = vi.fn().mockResolvedValue(undefined);
const recordExport = vi.fn().mockResolvedValue(undefined);
let canExport = true;

vi.mock('../../../hooks/useParametricExport', () => ({
  useParametricExport: () => ({
    progress: { status: 'idle', progress: 0, message: '' },
    stats: null,
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
  beforeEach(() => { exportSTL.mockClear(); recordExport.mockClear(); canExport = true; });

  it('fires the parametric export with a derived filename and records it', async () => {
    render(<ExportFooter />);
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }));
    await vi.waitFor(() => expect(exportSTL).toHaveBeenCalled());
    expect(String(exportSTL.mock.calls[0][0])).toMatch(/^[a-z0-9-]+$/);
    await vi.waitFor(() => expect(recordExport).toHaveBeenCalledOnce());
  });

  it('shows the upgrade CTA when gated', () => {
    canExport = false;
    render(<ExportFooter />);
    expect(screen.getByRole('button', { name: /Continue with Pro/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export STL/ })).not.toBeInTheDocument();
  });
});
