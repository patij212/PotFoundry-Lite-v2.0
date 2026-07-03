/**
 * SheetShell — unit tests.
 *
 * useSheetDrag is mocked so tests are isolated from DOM drag mechanics.
 * body[data-mobile-sheet-state] behaviour, Escape key handling, and the
 * touch-mode context pass-through are all exercised here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---- mock useSheetDrag -------------------------------------------------
const mockCollapse = vi.fn();
const mockToggle = vi.fn();
let mockState = 'half';

vi.mock('../../../hooks/useSheetDrag', () => ({
  useSheetDrag: vi.fn((config: { onStateChange?: (s: string) => void }) => {
    // Let caller trigger state changes via onStateChange to test body-attr updates
    void config; // used below via the exported handle
    return {
      state: mockState,
      dragHandlers: {
        onTouchStart: vi.fn(),
        onTouchMove: vi.fn(),
        onTouchEnd: vi.fn(),
        onMouseDown: vi.fn(),
      },
      toggle: mockToggle,
      collapse: mockCollapse,
    };
  }),
}));

import { SheetShell } from './SheetShell';
import { TouchModeProvider, useTouchMode } from './TouchModeContext';

// Probe component to verify touch-mode context inheritance
function TouchProbe() {
  const touch = useTouchMode();
  return <div data-testid="touch-probe">{String(touch)}</div>;
}

// ---- helpers -----------------------------------------------------------

function renderSheet(footer?: React.ReactNode) {
  return render(
    <SheetShell footer={footer}>
      <div data-testid="sheet-child">content</div>
    </SheetShell>,
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('SheetShell — rendering', () => {
  beforeEach(() => {
    mockState = 'half';
    mockCollapse.mockClear();
    mockToggle.mockClear();
  });

  afterEach(() => {
    delete document.body.dataset.mobileSheetState;
  });

  it('renders the sheet root with data-testid="pf3-sheet"', () => {
    renderSheet();
    expect(screen.getByTestId('pf3-sheet')).toBeInTheDocument();
  });

  it('renders the grabber with role="slider"', () => {
    renderSheet();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('grabber aria-valuetext reflects current state', () => {
    renderSheet();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'half');
  });

  it('renders children inside the content area', () => {
    renderSheet();
    expect(screen.getByTestId('sheet-child')).toBeInTheDocument();
  });

  it('renders the footer slot when provided', () => {
    renderSheet(<div data-testid="sheet-footer">footer</div>);
    expect(screen.getByTestId('sheet-footer')).toBeInTheDocument();
  });

  it('omits the footer element when no footer prop', () => {
    renderSheet();
    expect(document.querySelector('.pf3-sheet__footer')).not.toBeInTheDocument();
  });
});

describe('SheetShell — body[data-mobile-sheet-state]', () => {
  beforeEach(() => {
    mockState = 'half';
    mockCollapse.mockClear();
  });

  afterEach(() => {
    delete document.body.dataset.mobileSheetState;
  });

  it('sets body attr to the current state on mount', () => {
    renderSheet();
    expect(document.body.dataset.mobileSheetState).toBe('half');
  });

  it('removes body attr on unmount (desktop resize mid-session safety)', () => {
    const { unmount } = renderSheet();
    expect(document.body.dataset.mobileSheetState).toBe('half');
    unmount();
    expect(document.body.dataset.mobileSheetState).toBeUndefined();
  });
});

describe('SheetShell — touch-mode context pass-through', () => {
  afterEach(() => {
    delete document.body.dataset.mobileSheetState;
  });

  it('children inherit touch mode from an outer provider (value=true)', () => {
    render(
      <TouchModeProvider value={true}>
        <SheetShell>
          <TouchProbe />
        </SheetShell>
      </TouchModeProvider>,
    );
    expect(screen.getByTestId('touch-probe').textContent).toBe('true');
  });

  it('children see false when no outer provider wraps SheetShell', () => {
    render(
      <SheetShell>
        <TouchProbe />
      </SheetShell>,
    );
    expect(screen.getByTestId('touch-probe').textContent).toBe('false');
  });
});

describe('SheetShell — Escape key', () => {
  beforeEach(() => {
    mockState = 'half';
    mockCollapse.mockClear();
  });

  afterEach(() => {
    delete document.body.dataset.mobileSheetState;
  });

  it('Escape fires collapse()', () => {
    renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockCollapse).toHaveBeenCalledTimes(1);
  });

  it('Escape inside an <input> does NOT fire collapse()', () => {
    renderSheet();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(mockCollapse).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('Escape inside a <textarea> does NOT fire collapse()', () => {
    renderSheet();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(mockCollapse).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('non-Escape keys are ignored', () => {
    renderSheet();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(mockCollapse).not.toHaveBeenCalled();
  });

  it('Escape handler is removed on unmount', () => {
    const { unmount } = renderSheet();
    unmount();
    mockCollapse.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockCollapse).not.toHaveBeenCalled();
  });
});
