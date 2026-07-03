import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StyleTab } from './StyleTab';
import { useAppStore } from '../../../state';
import type { StyleName } from '../../../state/types';
import { pushRecent, isFavorite } from './workingSet';

// Spread the real registry and inject a fixture style that has a bool param +
// empty advancedParams.  All existing tests still run against real HarmonicRipple
// because it remains in the registry via the spread.
vi.mock('../../../styles/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../styles/registry')>();
  return {
    ...actual,
    STYLE_REGISTRY: {
      ...actual.STYLE_REGISTRY,
      MockBoolStyle: {
        id: 99,
        shaderName: 'mock_bool',
        name: 'Mock Bool Style',
        description: 'Fixture style for bool dispatch tests.',
        params: {
          test_toggle: { type: 'bool' as const, default: false, label: 'Test Toggle' },
        },
        advancedParams: {},
      },
    },
  };
});

// StyleThumb uses IntersectionObserver + GPU thumbnail APIs — mock it to a plain
// button so StyleTab tests stay fast and focused on strip behaviour.
vi.mock('../showroom/StyleThumb', () => ({
  default: ({
    styleName,
    onClick,
    'data-testid': testId,
  }: {
    styleName: string;
    size?: number;
    selected?: boolean;
    onClick?: () => void;
    'data-testid'?: string;
  }) => (
    <button
      data-testid={testId ?? `pf3-strip-thumb-${styleName}`}
      onClick={onClick}
      aria-label={`Select ${styleName} style`}
    >
      {styleName}
    </button>
  ),
}));

describe('StyleTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().setStyle('HarmonicRipple');
  });

  it('shows the current style card and its parameter rows', () => {
    render(<StyleTab />);
    // registry key still present via the secondary mono label (textContent aggregates descendants)
    expect(screen.getByTestId('pf3-style-current').textContent).toContain('HarmonicRipple');
    // HarmonicRipple has hr_petals etc. — at least one labelled row renders
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  // F1: heading shows display name; registry key appears as secondary mono label in card
  it('heading shows display name; registry key appears as mono label in the same card', () => {
    render(<StyleTab />);
    const card = screen.getByTestId('pf3-style-current');
    expect(card.textContent).toContain('Harmonic Ripple');
    expect(card.textContent).toContain('HarmonicRipple');
  });

  // F4: subline includes description and param count
  it('subline includes the description and a parameter count', () => {
    render(<StyleTab />);
    const card = screen.getByTestId('pf3-style-current');
    expect(card.textContent).toContain('parameters');
    expect(card.textContent).toContain('Petals + ripples');
  });

  // Replaces the old "changing style select writes to the store" test.
  // The native <select> was removed in Phase 2 (Task 9); the strip tile is the
  // new interaction surface for style selection.
  it('tile click sets style.name in the store and records a recent', () => {
    // Pre-populate a recent so the strip renders a tile before any click.
    pushRecent('GothicArches');

    render(<StyleTab />);

    const tile = screen.getByTestId('pf3-strip-thumb-GothicArches');
    fireEvent.click(tile);

    expect(useAppStore.getState().style.name).toBe('GothicArches');
    // The style we clicked should be at the front of recents.
    expect(localStorage.getItem('pf3-recents')).toContain('GothicArches');
  });

  it('param row edit writes a style opt', () => {
    render(<StyleTab />);
    const first = screen.getAllByRole('slider')[0];
    fireEvent.pointerDown(first);
    fireEvent.change(first, { target: { value: String(Number(first.getAttribute('max'))) } });
    fireEvent.pointerUp(first);
    const { opts } = useAppStore.getState().style;
    expect(Object.keys(opts).length).toBeGreaterThan(0);
  });

  // F2: bool param renders ToggleRow; click dispatches setStyleOpt(key, true)
  it('bool param renders a ToggleRow switch and setStyleOpt is called with true on click', () => {
    useAppStore.getState().setStyle('MockBoolStyle' as StyleName);
    render(<StyleTab />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(useAppStore.getState().style.opts['test_toggle']).toBe(true);
  });

  // F3: advanced seam conditional
  describe('advanced seam', () => {
    it('renders for HarmonicRipple which has advancedParams', () => {
      render(<StyleTab />);
      // DisclosureSeam renders its summary inside a <button>; use accessible name query
      expect(
        screen.getByRole('button', { name: /advanced — \d+ more/ }),
      ).toBeInTheDocument();
    });

    it('does NOT render for a style with empty advancedParams', () => {
      useAppStore.getState().setStyle('MockBoolStyle' as StyleName);
      render(<StyleTab />);
      expect(
        screen.queryByRole('button', { name: /advanced — \d+ more/ }),
      ).not.toBeInTheDocument();
    });
  });

  // ── Working set strip ────────────────────────────────────────────────────

  it('♥ toggle has aria-pressed=false initially, flips to true on click', () => {
    render(<StyleTab />);
    const toggle = screen.getByTestId('pf3-fav-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('♥ toggle favorites the current style and the strip shows it first', () => {
    render(<StyleTab />);

    // No strip tiles before any favorites/recents
    expect(screen.queryByTestId('pf3-strip-thumb-HarmonicRipple')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pf3-fav-toggle'));

    // Strip now shows the favorited style
    expect(screen.getByTestId('pf3-strip-thumb-HarmonicRipple')).toBeInTheDocument();
    expect(isFavorite('HarmonicRipple')).toBe(true);
  });

  it('♥ toggle second click removes the style from favorites', () => {
    render(<StyleTab />);
    const toggle = screen.getByTestId('pf3-fav-toggle');
    fireEvent.click(toggle); // add
    fireEvent.click(toggle); // remove
    expect(isFavorite('HarmonicRipple')).toBe(false);
  });

  it('all → button dispatches pf3:showroom CustomEvent on window', () => {
    const listener = vi.fn();
    window.addEventListener('pf3:showroom', listener);

    try {
      render(<StyleTab />);
      fireEvent.click(screen.getByTestId('pf3-open-showroom'));

      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('pf3:showroom', listener);
    }
  });

  it('strip dedupes: favorite + recent → single tile (favorites slot wins)', () => {
    // Pre-populate recents with HarmonicRipple
    pushRecent('HarmonicRipple');

    render(<StyleTab />);

    // At this point, HarmonicRipple is in recents, should show one tile
    let tiles = screen.getAllByTestId('pf3-strip-thumb-HarmonicRipple');
    expect(tiles).toHaveLength(1);

    // Now favorite it (adds to favorites while already in recents)
    fireEvent.click(screen.getByTestId('pf3-fav-toggle'));

    // Still exactly one tile (dedupe ensures it doesn't show twice)
    tiles = screen.getAllByTestId('pf3-strip-thumb-HarmonicRipple');
    expect(tiles).toHaveLength(1);
  });
});
