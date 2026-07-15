import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Certificate } from './Certificate';
import type { ParametricExportStats } from '../../../hooks/useParametricExport';
import type { ValidationSummary } from '../../../renderers/webgpu/parametric/types';

describe('Certificate', () => {
  const mockStats = (overrides?: Partial<ParametricExportStats>): ParametricExportStats => ({
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
    adaptiveDensityRatio: 1.2,
    featurePeaksSnapped: 42,
    ...overrides,
  });

  const mockValidationSummary = (overrides?: Partial<ValidationSummary>): ValidationSummary => ({
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
    p999PosErrorMm: 0.15,
    maxFeatureDriftMm: 0.02,
    seamMaxGapMm: 0,
    p95StretchRatio: 1.05,
    ...overrides,
  });

  it('renders header with filename and file size', () => {
    const stats = mockStats();
    render(<Certificate filename="my-pot-120" stats={stats} />);
    expect(screen.getByText(/my-pot-120\.stl · 2\.5 MB/)).toBeInTheDocument();
  });

  it('renders the selected export extension in the header', () => {
    const stats = mockStats();
    render(<Certificate filename="my-pot-120" format="3mf" stats={stats} />);
    expect(screen.getByText(/my-pot-120\.3mf · 2\.5 MB/)).toBeInTheDocument();
  });

  it('renders triangles count check', () => {
    const stats = mockStats();
    stats.validationSummary = mockValidationSummary();
    render(<Certificate filename="test" stats={stats} />);
    expect(screen.getByText(/50,000 triangles/)).toBeInTheDocument();
  });

  it('renders all checks when validation summary is present', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary(),
    });
    render(<Certificate filename="test" stats={stats} />);

    // All checks should be present
    expect(screen.getByText(/watertight/)).toBeInTheDocument();
    expect(screen.getByText(/topology checks passed/)).toBeInTheDocument();
    expect(screen.getByText(/triangles/)).toBeInTheDocument();
    expect(screen.queryByText(/p95 deviation/)).not.toBeInTheDocument();
  });

  it('shows checkmark for passing checks', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary(),
    });
    render(<Certificate filename="test" stats={stats} />);

    const items = screen.getAllByText(/✓/);
    expect(items.length).toBeGreaterThan(0);
  });

  it('shows error cross for failed manifoldOk check', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary({ manifoldOk: false }),
    });
    render(<Certificate filename="test" stats={stats} />);

    const failedChecks = screen.queryAllByText(/✗/);
    expect(failedChecks.length).toBeGreaterThan(0);
  });

  it('shows warning text when a check fails', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary({
        manifoldOk: false,
        warnings: ['2 boundary edges at rim seam'],
      }),
    });
    render(<Certificate filename="test" stats={stats} />);

    expect(screen.getByText(/2 boundary edges at rim seam/)).toBeInTheDocument();
  });

  it('labels topology-clean output as uncertified and avoids printability claims', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary({
        valid: true,
        manifoldOk: true,
      }),
    });
    render(<Certificate filename="test" stats={stats} />);

    expect(screen.getByText(/not certified to 0\.01 mm/)).toBeInTheDocument();
    expect(screen.queryByText(/printable on any FDM\/SLA slicer/)).not.toBeInTheDocument();
  });

  it('keeps the uncertified disclosure when manifoldOk is false', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary({
        valid: true,
        manifoldOk: false,
      }),
    });
    render(<Certificate filename="test" stats={stats} />);

    expect(screen.getByText(/not certified to 0\.01 mm/)).toBeInTheDocument();
  });

  it('keeps the uncertified disclosure when topology validity is false', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary({
        valid: false,
        manifoldOk: true,
      }),
    });
    render(<Certificate filename="test" stats={stats} />);

    expect(screen.getByText(/not certified to 0\.01 mm/)).toBeInTheDocument();
  });

  it('renders only header and triangles when no validation summary', () => {
    const stats = mockStats({ validationSummary: undefined });
    render(<Certificate filename="test" stats={stats} />);

    // Header and triangles should be there
    expect(screen.getByText(/test\.stl/)).toBeInTheDocument();
    expect(screen.getByText(/triangles/)).toBeInTheDocument();

    // But checks should not
    expect(screen.queryByText(/watertight/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mesh valid/)).not.toBeInTheDocument();
  });

  // F3: when both primary checks fail, each row should display a DISTINCT warning
  // string — watertight uses warnings[0], mesh-valid uses warnings[1] ?? warnings[0].
  it('F3: two failing checks with two warnings show different repair strings', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary({
        manifoldOk: false,
        valid: false,
        warnings: ['2 boundary edges at rim seam', 'degenerate triangle at base'],
      }),
    });
    render(<Certificate filename="test" stats={stats} />);
    expect(screen.getByText('2 boundary edges at rim seam')).toBeInTheDocument();
    expect(screen.getByText('degenerate triangle at base')).toBeInTheDocument();
  });

  it('renders full report disclosure seam with validation summary fields', () => {
    const stats = mockStats({
      validationSummary: mockValidationSummary(),
    });
    render(<Certificate filename="test" stats={stats} />);

    // The disclosure seam should have the right id and text
    const seam = screen.getByText(/full report/);
    expect(seam).toBeInTheDocument();

    // The disclosure seam exists (even if closed, which it is by default)
    // We just verify the button exists and the content will render when expanded
  });
});
