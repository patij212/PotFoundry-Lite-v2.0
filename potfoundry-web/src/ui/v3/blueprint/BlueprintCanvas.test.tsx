import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BlueprintCanvas, computeLayout } from './BlueprintCanvas';
import { useAppStore } from '../../../state';
import { DEFAULT_GEOMETRY } from '../../../state/types';
import { sampleProfile } from './profileSampler';

// ── computeLayout math ────────────────────────────────────────────────────────

describe('computeLayout', () => {
  it('scale = min(76/maxR, 102/H) — derived from live sampleProfile, not hardcoded', () => {
    const profile = sampleProfile(DEFAULT_GEOMETRY);
    const { scale } = computeLayout(profile);
    const expected = Math.min(76 / profile.maxR, 102 / profile.H);
    expect(scale).toBeCloseTo(expected, 8);
  });

  it('xOf(r, 1) = 100 + r * scale (right generatrix)', () => {
    const profile = sampleProfile(DEFAULT_GEOMETRY);
    const { scale, xOf } = computeLayout(profile);
    const r = 35;
    expect(xOf(r, 1)).toBeCloseTo(100 + r * scale, 8);
  });

  it('xOf(r, -1) mirrors exactly around x=100 — equals 200 − xOf(r, 1)', () => {
    const profile = sampleProfile(DEFAULT_GEOMETRY);
    const { xOf } = computeLayout(profile);
    const r = 35;
    // Proof: 100 − r*scale  ===  200 − (100 + r*scale)
    expect(xOf(r, -1)).toBeCloseTo(200 - xOf(r, 1), 8);
  });

  it('xOf(r, -1) ≠ xOf(r, 1) for r > 0', () => {
    const profile = sampleProfile(DEFAULT_GEOMETRY);
    const { xOf } = computeLayout(profile);
    expect(xOf(30, -1)).not.toBeCloseTo(xOf(30, 1), 3);
  });

  it('yOf(0) = 116 — base sits at the bottom of the drawing area', () => {
    const profile = sampleProfile(DEFAULT_GEOMETRY);
    const { yOf } = computeLayout(profile);
    expect(yOf(0)).toBeCloseTo(116, 8);
  });

  it('yOf(H) = 116 − H·scale', () => {
    const profile = sampleProfile(DEFAULT_GEOMETRY);
    const { scale, yOf } = computeLayout(profile);
    expect(yOf(profile.H)).toBeCloseTo(116 - profile.H * scale, 8);
  });

  it('scale for DEFAULT_GEOMETRY is the height-limited value (102/120 < 76/70)', () => {
    const profile = sampleProfile(DEFAULT_GEOMETRY);
    const { scale } = computeLayout(profile);
    // 76/70 ≈ 1.0857, 102/120 = 0.85 → height-limited
    expect(scale).toBeCloseTo(102 / profile.H, 8);
  });
});

// ── BlueprintCanvas rendering ─────────────────────────────────────────────────

describe('BlueprintCanvas', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(() => ({ geometry: { ...DEFAULT_GEOMETRY } }));
  });

  it('renders SVG with data-testid="pf3-blueprint"', () => {
    render(<BlueprintCanvas />);
    expect(screen.getByTestId('pf3-blueprint')).toBeInTheDocument();
  });

  it('renders exactly 2 outer paths with class pf3-bp__outer', () => {
    render(<BlueprintCanvas />);
    const svg = screen.getByTestId('pf3-blueprint');
    expect(svg.querySelectorAll('.pf3-bp__outer')).toHaveLength(2);
  });

  it('renders exactly 2 inner paths with class pf3-bp__inner', () => {
    render(<BlueprintCanvas />);
    const svg = screen.getByTestId('pf3-blueprint');
    expect(svg.querySelectorAll('.pf3-bp__inner')).toHaveLength(2);
  });

  it('renders a centerline element with stroke-dasharray attribute', () => {
    render(<BlueprintCanvas />);
    const svg = screen.getByTestId('pf3-blueprint');
    const centerline = svg.querySelector('[stroke-dasharray]');
    expect(centerline).not.toBeNull();
  });

  it('renders ⌀ 140 tick with pf3-mono class for DEFAULT_GEOMETRY (top_od=140)', () => {
    render(<BlueprintCanvas />);
    const tick = screen.getByText('⌀ 140');
    expect(tick).toBeInTheDocument();
    expect(tick).toHaveClass('pf3-mono');
  });

  it('renders 120 height tick with pf3-mono class for DEFAULT_GEOMETRY (H=120)', () => {
    render(<BlueprintCanvas />);
    const tick = screen.getByText('120');
    expect(tick).toBeInTheDocument();
    expect(tick).toHaveClass('pf3-mono');
  });

  it('re-renders height tick from 120 to 200 when store H changes', () => {
    render(<BlueprintCanvas />);
    expect(screen.getByText('120')).toBeInTheDocument();

    act(() => {
      useAppStore.setState(() => ({ geometry: { ...DEFAULT_GEOMETRY, H: 200 } }));
    });

    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.queryByText('120')).not.toBeInTheDocument();
  });

  it('re-renders OD tick when top_od changes', () => {
    render(<BlueprintCanvas />);
    expect(screen.getByText('⌀ 140')).toBeInTheDocument();

    act(() => {
      useAppStore.setState(() => ({
        geometry: { ...DEFAULT_GEOMETRY, top_od: 160 },
      }));
    });

    expect(screen.getByText('⌀ 160')).toBeInTheDocument();
    expect(screen.queryByText('⌀ 140')).not.toBeInTheDocument();
  });
});
