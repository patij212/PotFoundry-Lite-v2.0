import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BlueprintCanvas, computeLayout } from './BlueprintCanvas';
import { useAppStore } from '../../../state';
import { DEFAULT_GEOMETRY, GEOMETRY_BOUNDS } from '../../../state/types';
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

  it('renders rim and base edge closures with class pf3-bp__edge', () => {
    render(<BlueprintCanvas />);
    const svg = screen.getByTestId('pf3-blueprint');
    expect(svg.querySelectorAll('.pf3-bp__edge')).toHaveLength(2);
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

// ── BlueprintCanvas drag handles ──────────────────────────────────────────────

describe('BlueprintCanvas drag handles', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(() => ({ geometry: { ...DEFAULT_GEOMETRY } }));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 130,
      width: 200, height: 130, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rim handle has role=slider, aria-label, aria-valuenow, and ARIA range bounds', () => {
    render(<BlueprintCanvas />);
    const handle = screen.getByTestId('pf3-bp-handle-rim');
    expect(handle).toHaveAttribute('role', 'slider');
    expect(handle).toHaveAttribute('aria-label');
    expect(handle).toHaveAttribute('aria-valuenow');
    expect(handle).toHaveAttribute('aria-valuemin', String(GEOMETRY_BOUNDS.top_od.min));
    expect(handle).toHaveAttribute('aria-valuemax', String(GEOMETRY_BOUNDS.top_od.max));
  });

  it('handles are NOT inside an aria-hidden ancestor (sliders must reach AT)', () => {
    render(<BlueprintCanvas />);
    const handle = screen.getByTestId('pf3-bp-handle-rim');
    expect(handle.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('aria-valuenow tracks the store value live', () => {
    render(<BlueprintCanvas />);
    expect(screen.getByTestId('pf3-bp-handle-height')).toHaveAttribute(
      'aria-valuenow', String(DEFAULT_GEOMETRY.H),
    );
    act(() => {
      useAppStore.setState(() => ({ geometry: { ...DEFAULT_GEOMETRY, H: 200 } }));
    });
    expect(screen.getByTestId('pf3-bp-handle-height')).toHaveAttribute('aria-valuenow', '200');
  });

  it('a second pointerdown during a live drag does not re-begin history (once per gesture)', () => {
    useAppStore.setState({
      beginHistoryTransaction: vi.fn(),
      commitHistoryTransaction: vi.fn(),
    });
    const { beginHistoryTransaction, commitHistoryTransaction } = useAppStore.getState();

    render(<BlueprintCanvas />);

    const rim = screen.getByTestId('pf3-bp-handle-rim');
    const base = screen.getByTestId('pf3-bp-handle-base');
    fireEvent.pointerDown(rim, { clientX: 150, clientY: 50 });
    fireEvent.pointerDown(base, { clientX: 140, clientY: 110 }); // stray 2nd touch mid-gesture
    fireEvent.pointerMove(rim, { clientX: 169, clientY: 50 });
    fireEvent.pointerUp(rim, { clientX: 169, clientY: 50 });

    expect(useAppStore.getState().geometry.top_od).toBeGreaterThan(DEFAULT_GEOMETRY.top_od);
    expect(beginHistoryTransaction).toHaveBeenCalledTimes(1);
    expect(commitHistoryTransaction).toHaveBeenCalledTimes(1);
  });

  it('pointercancel closes a drag gesture and allows a subsequent gesture to begin', () => {
    useAppStore.setState({
      beginHistoryTransaction: vi.fn(),
      commitHistoryTransaction: vi.fn(),
    });
    const { beginHistoryTransaction, commitHistoryTransaction } = useAppStore.getState();

    render(<BlueprintCanvas />);

    const rim = screen.getByTestId('pf3-bp-handle-rim');
    const svg = screen.getByTestId('pf3-blueprint');

    // First gesture: pointerdown → pointermove → pointercancel
    fireEvent.pointerDown(rim, { clientX: 150, clientY: 50 });
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 50 });
    fireEvent.pointerCancel(svg);

    // After cancel, commitHistoryTransaction should have been called once
    expect(commitHistoryTransaction).toHaveBeenCalledTimes(1);

    // Second gesture should be able to begin (beginHistoryTransaction called again)
    fireEvent.pointerDown(rim, { clientX: 150, clientY: 50 });
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 50 });
    fireEvent.pointerUp(svg, { clientX: 170, clientY: 50 });

    expect(beginHistoryTransaction).toHaveBeenCalledTimes(2);
    expect(commitHistoryTransaction).toHaveBeenCalledTimes(2);
  });

  it('rim drag increases top_od and wraps a history transaction', () => {
    useAppStore.setState({
      beginHistoryTransaction: vi.fn(),
      commitHistoryTransaction: vi.fn(),
    });
    const { beginHistoryTransaction, commitHistoryTransaction } = useAppStore.getState();

    render(<BlueprintCanvas />);

    const handle = screen.getByTestId('pf3-bp-handle-rim');
    fireEvent.pointerDown(handle, { clientX: 150, clientY: 50 });
    fireEvent.pointerMove(handle, { clientX: 169, clientY: 50 });
    fireEvent.pointerUp(handle, { clientX: 169, clientY: 50 });

    expect(useAppStore.getState().geometry.top_od).toBeGreaterThan(DEFAULT_GEOMETRY.top_od);
    expect(beginHistoryTransaction).toHaveBeenCalledTimes(1);
    expect(commitHistoryTransaction).toHaveBeenCalledTimes(1);
  });

  it('height drag upward increases H', () => {
    render(<BlueprintCanvas />);

    const handle = screen.getByTestId('pf3-bp-handle-height');
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 20 });
    fireEvent.pointerMove(handle, { clientX: 100, clientY: 1 });
    fireEvent.pointerUp(handle, { clientX: 100, clientY: 1 });

    expect(useAppStore.getState().geometry.H).toBeGreaterThan(DEFAULT_GEOMETRY.H);
  });

  it('belly drag increases bellAmp and wraps a history transaction', () => {
    useAppStore.setState({
      beginHistoryTransaction: vi.fn(),
      commitHistoryTransaction: vi.fn(),
    });
    const { beginHistoryTransaction, commitHistoryTransaction } = useAppStore.getState();

    render(<BlueprintCanvas />);

    const handle = screen.getByTestId('pf3-bp-handle-belly');
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(handle, { clientX: 120, clientY: 50 });
    fireEvent.pointerUp(handle, { clientX: 120, clientY: 50 });

    expect(useAppStore.getState().geometry.bellAmp).toBeGreaterThan(DEFAULT_GEOMETRY.bellAmp);
    expect(beginHistoryTransaction).toHaveBeenCalledTimes(1);
    expect(commitHistoryTransaction).toHaveBeenCalledTimes(1);
  });

  it('ArrowUp on height handle nudges H by one step', () => {
    render(<BlueprintCanvas />);

    const handle = screen.getByTestId('pf3-bp-handle-height');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });

    expect(useAppStore.getState().geometry.H).toBe(DEFAULT_GEOMETRY.H + GEOMETRY_BOUNDS.H.step);
  });

  it('rim drag clamped at min: top_od never drops below bounds.min', () => {
    useAppStore.setState(() => ({
      geometry: { ...DEFAULT_GEOMETRY, top_od: GEOMETRY_BOUNDS.top_od.min },
    }));

    render(<BlueprintCanvas />);

    const handle = screen.getByTestId('pf3-bp-handle-rim');
    // Drag far left — large negative dx
    fireEvent.pointerDown(handle, { clientX: 150, clientY: 50 });
    fireEvent.pointerMove(handle, { clientX: -500, clientY: 50 });

    expect(useAppStore.getState().geometry.top_od).toBeGreaterThanOrEqual(
      GEOMETRY_BOUNDS.top_od.min,
    );
  });
});
