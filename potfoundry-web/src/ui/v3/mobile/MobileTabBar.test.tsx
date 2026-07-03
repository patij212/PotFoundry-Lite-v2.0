/**
 * MobileTabBar — unit tests.
 *
 * useSwipeGesture is mocked to capture onSwipeLeft/onSwipeRight options so
 * tests can invoke them directly. useHaptics is mocked to verify tap() calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { createRef } from 'react';

// ---- mock useSwipeGesture ------------------------------------------------
// Capture the callbacks passed by the component so tests can invoke them.
let capturedSwipeLeft: (() => void) | undefined;
let capturedSwipeRight: (() => void) | undefined;

vi.mock('../../../hooks/useSwipeGesture', () => ({
  useSwipeGesture: vi.fn(
    (_ref: unknown, opts: { onSwipeLeft?: () => void; onSwipeRight?: () => void }) => {
      capturedSwipeLeft = opts.onSwipeLeft;
      capturedSwipeRight = opts.onSwipeRight;
    },
  ),
}));

// ---- mock useHaptics -----------------------------------------------------
const mockTap = vi.fn();

vi.mock('../../../hooks/useHaptics', () => ({
  useHaptics: vi.fn(() => ({ tap: mockTap, success: vi.fn() })),
}));

// Must import AFTER mocks are declared.
import { MobileTabBar } from './MobileTabBar';
import { useAppStore } from '../../../state';

// ============================================================================
// Helpers
// ============================================================================

function renderBar() {
  const contentRef = createRef<HTMLElement>();
  render(<MobileTabBar contentRef={contentRef} />);
}

// ============================================================================
// Tests
// ============================================================================

describe('MobileTabBar — rendering', () => {
  beforeEach(() => {
    useAppStore.getState().setV3ActiveTab('shape');
    mockTap.mockClear();
    capturedSwipeLeft = undefined;
    capturedSwipeRight = undefined;
  });

  it('renders 3 tab buttons: Shape, Style, Export', () => {
    renderBar();
    expect(screen.getByRole('tab', { name: 'Shape' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Style' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Export' })).toBeInTheDocument();
  });

  it('renders the Export CTA with aria-label="Export STL"', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Export STL' })).toBeInTheDocument();
  });

  it('marks the initial active tab as selected', () => {
    renderBar();
    expect(screen.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('MobileTabBar — tab interaction', () => {
  beforeEach(() => {
    useAppStore.getState().setV3ActiveTab('shape');
    mockTap.mockClear();
  });

  it('clicking a different tab updates the store', () => {
    renderBar();
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('style');
  });

  it('clicking a different tab fires haptic tap()', () => {
    renderBar();
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(mockTap).toHaveBeenCalledTimes(1);
  });

  it('clicking the already-active tab does NOT fire haptic', () => {
    renderBar();
    fireEvent.click(screen.getByRole('tab', { name: 'Shape' }));
    expect(mockTap).not.toHaveBeenCalled();
  });
});

describe('MobileTabBar — CTA', () => {
  beforeEach(() => {
    useAppStore.getState().setV3ActiveTab('shape');
  });

  it('CTA click dispatches pf3:download on window', () => {
    renderBar();
    const listener = vi.fn();
    window.addEventListener('pf3:download', listener);
    fireEvent.click(screen.getByRole('button', { name: 'Export STL' }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('pf3:download', listener);
  });
});

describe('MobileTabBar — swipe gestures', () => {
  beforeEach(() => {
    useAppStore.getState().setV3ActiveTab('shape');
    mockTap.mockClear();
    capturedSwipeLeft = undefined;
    capturedSwipeRight = undefined;
  });

  it('swipe left advances from shape to style', () => {
    renderBar();
    act(() => { capturedSwipeLeft?.(); });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('style');
    expect(mockTap).toHaveBeenCalledTimes(1);
  });

  it('swipe left advances from style to export', () => {
    useAppStore.getState().setV3ActiveTab('style');
    renderBar();
    act(() => { capturedSwipeLeft?.(); });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
    expect(mockTap).toHaveBeenCalledTimes(1);
  });

  it('swipe left at export is clamped — no state change, no haptic', () => {
    useAppStore.getState().setV3ActiveTab('export');
    renderBar();
    act(() => { capturedSwipeLeft?.(); });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
    expect(mockTap).not.toHaveBeenCalled();
  });

  it('swipe right goes from style to shape', () => {
    useAppStore.getState().setV3ActiveTab('style');
    renderBar();
    act(() => { capturedSwipeRight?.(); });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('shape');
    expect(mockTap).toHaveBeenCalledTimes(1);
  });

  it('swipe right goes from export to style', () => {
    useAppStore.getState().setV3ActiveTab('export');
    renderBar();
    act(() => { capturedSwipeRight?.(); });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('style');
    expect(mockTap).toHaveBeenCalledTimes(1);
  });

  it('swipe right at shape is clamped — no state change, no haptic', () => {
    renderBar();
    act(() => { capturedSwipeRight?.(); });
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('shape');
    expect(mockTap).not.toHaveBeenCalled();
  });
});
