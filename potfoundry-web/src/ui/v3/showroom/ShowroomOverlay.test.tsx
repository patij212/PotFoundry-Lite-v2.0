/**
 * ShowroomOverlay Tests
 *
 * Covers: open/close, search filtering, category chip filtering, ♥ Mine chip,
 * Escape key, tile click, and hover-intent preview with live store mutation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAppStore } from '../../../state';
import { ShowroomOverlay, isShowroomOpen } from './ShowroomOverlay';
import * as workingSet from '../panel/workingSet';

// ─── Mock StyleThumb ───────────────────────────────────────────────────────────
// Avoids IntersectionObserver / canvas / GPU deps.
// onMouseEnter fires onHoverIntent after 150 ms (matching real timer),
// onMouseLeave fires onHoverEnd directly.
vi.mock('./StyleThumb', () => ({
  default: vi.fn(
    ({
      styleName,
      onHoverIntent,
      onHoverEnd,
      onClick,
      selected,
      'data-testid': testId,
    }: {
      styleName: string;
      onHoverIntent?: () => void;
      onHoverEnd?: () => void;
      onClick?: () => void;
      selected?: boolean;
      'data-testid'?: string;
    }) => (
      <button
        data-testid={testId ?? `style-thumb-${styleName}`}
        aria-pressed={selected}
        onClick={onClick}
        onMouseEnter={() => {
          setTimeout(() => onHoverIntent?.(), 150);
        }}
        onMouseLeave={() => {
          onHoverEnd?.();
        }}
      >
        {styleName}
      </button>
    )
  ),
}));

// ─── Mock workingSet ───────────────────────────────────────────────────────────
vi.mock('../panel/workingSet', () => ({
  getFavorites: vi.fn(),
  pushRecent: vi.fn(),
  toggleFavorite: vi.fn(),
  getRecents: vi.fn(),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────
const INITIAL_STYLE = {
  name: 'HarmonicRipple',
  opts: {
    hr_petals: 7,
    hr_petal_amp: 0.16,
    hr_ripple_freq: 31,
    hr_ripple_amp: 0.03,
    hr_bell: 0.05,
  },
};

function openShowroom() {
  act(() => {
    window.dispatchEvent(new CustomEvent('pf3:showroom'));
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('ShowroomOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no favorites
    vi.mocked(workingSet.getFavorites).mockReturnValue([]);
    vi.mocked(workingSet.pushRecent).mockReturnValue([]);
    // Reset store to known initial style
    useAppStore.setState({ style: { ...INITIAL_STYLE } });
  });

  // ── 1. Closed by default ─────────────────────────────────────────────────────
  it('is closed by default (no dialog in DOM)', () => {
    render(<ShowroomOverlay />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ── 2. pf3:showroom event opens with correct ARIA ────────────────────────────
  it('pf3:showroom event opens — dialog role, aria-modal="true", title "Style library"', () => {
    render(<ShowroomOverlay />);
    openShowroom();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Style library' })).toBeInTheDocument();
  });

  // ── 3. Search filters by name ─────────────────────────────────────────────────
  it('search "gothic" filters grid to GothicArches only (others absent)', () => {
    render(<ShowroomOverlay />);
    openShowroom();
    const searchInput = screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'gothic' } });
    expect(screen.getByTestId('style-thumb-GothicArches')).toBeInTheDocument();
    expect(screen.queryByTestId('style-thumb-ArtDeco')).not.toBeInTheDocument();
    expect(screen.queryByTestId('style-thumb-HarmonicRipple')).not.toBeInTheDocument();
  });

  // ── 4. Category chip "Woven" ──────────────────────────────────────────────────
  it('category chip "Woven" shows only woven styles, hides non-woven', () => {
    render(<ShowroomOverlay />);
    openShowroom();
    const wovenChip = screen.getByRole('button', { name: 'Woven' });
    fireEvent.click(wovenChip);
    // Woven styles in registry: DragonScales, BasketWeave, CelticKnot, CelticTriquetra
    expect(screen.getByTestId('style-thumb-DragonScales')).toBeInTheDocument();
    expect(screen.getByTestId('style-thumb-BasketWeave')).toBeInTheDocument();
    expect(screen.getByTestId('style-thumb-CelticKnot')).toBeInTheDocument();
    expect(screen.getByTestId('style-thumb-CelticTriquetra')).toBeInTheDocument();
    // Non-woven styles must be absent
    expect(screen.queryByTestId('style-thumb-HarmonicRipple')).not.toBeInTheDocument();
    expect(screen.queryByTestId('style-thumb-GothicArches')).not.toBeInTheDocument();
  });

  // ── 5. ♥ Mine chip shows favorites only ──────────────────────────────────────
  it('♥ Mine chip shows favorites only (mocked getFavorites: SpiralRidges, ArtDeco)', () => {
    vi.mocked(workingSet.getFavorites).mockReturnValue(['SpiralRidges', 'ArtDeco']);
    render(<ShowroomOverlay />);
    openShowroom();
    const mineChip = screen.getByRole('button', { name: '♥ Mine' });
    fireEvent.click(mineChip);
    expect(screen.getByTestId('style-thumb-SpiralRidges')).toBeInTheDocument();
    expect(screen.getByTestId('style-thumb-ArtDeco')).toBeInTheDocument();
    expect(screen.queryByTestId('style-thumb-HarmonicRipple')).not.toBeInTheDocument();
    expect(screen.queryByTestId('style-thumb-GothicArches')).not.toBeInTheDocument();
  });

  // ── 6. Escape closes ──────────────────────────────────────────────────────────
  it('Escape keydown on dialog closes the overlay', () => {
    render(<ShowroomOverlay />);
    openShowroom();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ── 7. Click tile applies + closes + pushes recent ────────────────────────────
  it('click tile applies style, closes overlay, and calls pushRecent', () => {
    render(<ShowroomOverlay />);
    openShowroom();
    fireEvent.click(screen.getByTestId('style-thumb-ArtDeco'));
    // Overlay should be closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Store reflects the new style
    expect(useAppStore.getState().style.name).toBe('ArtDeco');
    // pushRecent called with the applied style name
    expect(workingSet.pushRecent).toHaveBeenCalledWith('ArtDeco');
  });

  // ── 8. Hover-intent preview with fake timers ──────────────────────────────────
  it('hover-intent changes store to hovered style; mouseLeave restores name+opts', () => {
    vi.useFakeTimers();
    try {
      // Customize an opt so restore must recover NON-default opts
      // (setStyle resets opts to defaults — restore must undo that).
      const customOpts = { ...INITIAL_STYLE.opts, hr_petals: 12 };
      useAppStore.setState({ style: { name: 'HarmonicRipple', opts: customOpts } });

      render(<ShowroomOverlay />);
      openShowroom();

      // Confirm initial state
      expect(useAppStore.getState().style.name).toBe('HarmonicRipple');

      const tile = screen.getByTestId('style-thumb-ArtDeco');

      // Enter but don't advance — no change yet
      fireEvent.mouseEnter(tile);
      expect(useAppStore.getState().style.name).toBe('HarmonicRipple');

      // Advance past the 150 ms intent threshold
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(useAppStore.getState().style.name).toBe('ArtDeco');

      // Leave — restore BOTH name and the customized opts
      fireEvent.mouseLeave(tile);
      expect(useAppStore.getState().style.name).toBe('HarmonicRipple');
      expect(useAppStore.getState().style.opts).toEqual(customOpts);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── 9. isShowroomOpen flag tracks open/close ──────────────────────────────────
  it('isShowroomOpen() is false by default, true when open, false after Escape close', () => {
    render(<ShowroomOverlay />);
    expect(isShowroomOpen()).toBe(false);
    openShowroom();
    expect(isShowroomOpen()).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(isShowroomOpen()).toBe(false);
  });

  // ── 10. Close-without-click reverts an active preview ─────────────────────────
  it('Escape during an active hover preview restores the snapshot (close-without-click)', () => {
    vi.useFakeTimers();
    try {
      const customOpts = { ...INITIAL_STYLE.opts, hr_petals: 12 };
      useAppStore.setState({ style: { name: 'HarmonicRipple', opts: customOpts } });

      render(<ShowroomOverlay />);
      openShowroom();

      // Hover to activate a preview (no mouseLeave before close)
      fireEvent.mouseEnter(screen.getByTestId('style-thumb-ArtDeco'));
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(useAppStore.getState().style.name).toBe('ArtDeco');

      // Escape closes — must restore the pre-preview {name, opts}
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(useAppStore.getState().style.name).toBe('HarmonicRipple');
      expect(useAppStore.getState().style.opts).toEqual(customOpts);
    } finally {
      vi.useRealTimers();
    }
  });
});
