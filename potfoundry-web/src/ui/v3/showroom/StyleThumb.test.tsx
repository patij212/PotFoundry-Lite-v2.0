/**
 * StyleThumb Component Tests
 *
 * Tests the lazy thumbnail tile with silhouette fallback, hover intent timer,
 * and selected ring styling.
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StyleThumb from './StyleThumb';
import * as styleThumbnails from './styleThumbnails';
import * as profileSampler from '../blueprint/profileSampler';
import { useHaptics } from '../../../hooks/useHaptics';
import { DEFAULT_GEOMETRY } from '../../../state/types';
import { STYLE_REGISTRY } from '../../../styles/registry';

// Mock the dependencies
vi.mock('./styleThumbnails', () => ({
  getStyleThumbnail: vi.fn(),
}));

vi.mock('../blueprint/profileSampler', () => ({
  sampleProfile: vi.fn(),
}));

// Mock the state
vi.mock('../../../state', () => ({
  useGeometry: () => DEFAULT_GEOMETRY,
}));

// Mock useHaptics — avoids pulling in the full Zustand store
vi.mock('../../../hooks/useHaptics', () => ({
  useHaptics: vi.fn(() => ({ tap: vi.fn(), success: vi.fn() })),
}));

describe('StyleThumb', () => {
  const mockGeometry = DEFAULT_GEOMETRY;
  const styleName = 'SuperformulaBlossom';
  const displayName = STYLE_REGISTRY[styleName].name;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders button with display-name label immediately', () => {
    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {})); // Never resolves

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [
          { z: 0, rOuter: 25, rInner: 20 },
          { z: 10, rOuter: 30, rInner: 25 },
        ],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    render(
      <StyleThumb
        styleName={styleName}
        size={100}
        data-testid="style-thumb"
      />
    );

    // Should show display name
    expect(screen.getByText(displayName)).toBeInTheDocument();

    // Should show fallback silhouette SVG (not a "Preview unavailable" string)
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toBeInTheDocument();
  });

  it('renders canvas when visible', () => {
    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {})); // Never resolves

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    render(
      <StyleThumb
        styleName={styleName}
        size={100}
        data-testid="style-thumb"
      />
    );

    // Canvas should be present when component renders
    const button = screen.getByRole('button');
    const canvas = button.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('width', '100');
    expect(canvas).toHaveAttribute('height', '100');
  });

  it('lazy chain: IO→getStyleThumbnail→putImageData when element becomes visible', async () => {
    // Use real timers so waitFor polling works without manual timer advancement
    vi.useRealTimers();

    // Local IO override: observe() immediately fires isIntersecting: true
    const originalIO = global.IntersectionObserver;
    class ImmediateIO {
      private cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) { this.cb = cb; }
      observe(target: Element) {
        this.cb(
          [{ isIntersecting: true, target, intersectionRatio: 1 } as unknown as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    global.IntersectionObserver = ImmediateIO as unknown as typeof IntersectionObserver;

    try {
      const imageData = { width: 4, height: 4, data: new Uint8ClampedArray(64) } as unknown as ImageData;
      (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
        .mockResolvedValue(imageData);

      (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
        .mockReturnValue({
          samples: [{ z: 0, rOuter: 25, rInner: 20 }],
          maxR: 30,
          H: mockGeometry.H,
          topOD: mockGeometry.top_od,
          bottomOD: mockGeometry.bottom_od,
        });

      render(<StyleThumb styleName={styleName} size={100} data-testid="style-thumb" />);

      // IO fires synchronously on observe → isVisible=true → fetch triggered
      expect(styleThumbnails.getStyleThumbnail).toHaveBeenCalledWith(styleName, mockGeometry, 100);

      // Wait for promise resolution → imageData state → putImageData on canvas
      const button = screen.getByRole('button');
      const canvas = button.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

      await waitFor(() => {
        expect(ctx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
      });
    } finally {
      global.IntersectionObserver = originalIO;
    }
  });

  it('lazy chain: getStyleThumbnail NOT called when element never becomes visible', () => {
    // Default IO mock from setup.ts has a no-op observe() — callback never fires
    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {}));

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    render(<StyleThumb styleName={styleName} size={100} data-testid="style-thumb" />);

    // isVisible stays false → fetch gate never crossed
    expect(styleThumbnails.getStyleThumbnail).not.toHaveBeenCalled();
  });

  it('applies gold ring class when selected is true', () => {
    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {}));

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    const { rerender } = render(
      <StyleThumb
        styleName={styleName}
        size={100}
        selected={false}
        data-testid="style-thumb"
      />
    );

    const button = screen.getByRole('button');
    expect(button).not.toHaveClass('pf3-style-thumb--selected');

    rerender(
      <StyleThumb
        styleName={styleName}
        size={100}
        selected={true}
        data-testid="style-thumb"
      />
    );

    expect(button).toHaveClass('pf3-style-thumb--selected');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onHoverIntent after 150ms hover', () => {
    const onHoverIntent = vi.fn();

    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {}));

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    render(
      <StyleThumb
        styleName={styleName}
        size={100}
        onHoverIntent={onHoverIntent}
        data-testid="style-thumb"
      />
    );

    const button = screen.getByRole('button');

    // Hover for 150ms
    fireEvent.mouseEnter(button);
    expect(onHoverIntent).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(onHoverIntent).toHaveBeenCalledTimes(1);

    // Should not fire again
    vi.advanceTimersByTime(100);
    expect(onHoverIntent).toHaveBeenCalledTimes(1);
  });

  it('early leave (<150ms) fires neither onHoverIntent nor onHoverEnd', () => {
    const onHoverIntent = vi.fn();
    const onHoverEnd = vi.fn();

    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {}));

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    render(
      <StyleThumb
        styleName={styleName}
        size={100}
        onHoverIntent={onHoverIntent}
        onHoverEnd={onHoverEnd}
        data-testid="style-thumb"
      />
    );

    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    vi.advanceTimersByTime(100); // Only 100ms — timer has not fired

    fireEvent.mouseLeave(button);

    // Even if we advance more time after leave, neither callback fires
    vi.advanceTimersByTime(100);
    expect(onHoverIntent).not.toHaveBeenCalled();
    expect(onHoverEnd).not.toHaveBeenCalled();
  });

  it('fires onHoverEnd when leaving after onHoverIntent fired', () => {
    const onHoverIntent = vi.fn();
    const onHoverEnd = vi.fn();

    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {}));

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    render(
      <StyleThumb
        styleName={styleName}
        size={100}
        onHoverIntent={onHoverIntent}
        onHoverEnd={onHoverEnd}
        data-testid="style-thumb"
      />
    );

    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    vi.advanceTimersByTime(150); // Fire onHoverIntent
    expect(onHoverIntent).toHaveBeenCalledTimes(1);

    fireEvent.mouseLeave(button);
    expect(onHoverEnd).toHaveBeenCalledTimes(1);
  });

  it('has data-pf3-focusable attribute', () => {
    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {}));

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    render(
      <StyleThumb
        styleName={styleName}
        size={100}
        data-testid="style-thumb"
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-pf3-focusable');
  });

  it('handles unmount during pending thumbnail promise', () => {
    const onHoverEnd = vi.fn();

    (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
      .mockReturnValue(new Promise(() => {})); // Never resolves

    (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
      .mockReturnValue({
        samples: [{ z: 0, rOuter: 25, rInner: 20 }],
        maxR: 30,
        H: mockGeometry.H,
        topOD: mockGeometry.top_od,
        bottomOD: mockGeometry.bottom_od,
      });

    const { unmount } = render(
      <StyleThumb
        styleName={styleName}
        size={100}
        onHoverEnd={onHoverEnd}
        data-testid="style-thumb"
      />
    );

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);
    vi.advanceTimersByTime(150);

    // Unmount should not cause issues
    expect(() => unmount()).not.toThrow();
  });

  // ── Touch press-to-preview ─────────────────────────────────────────────────

  describe('touch press-to-preview', () => {
    // Stable tap mock — cleared by the outer beforeEach's vi.clearAllMocks()
    const tapMock = vi.fn();

    beforeEach(() => {
      // Re-wire the haptics mock so tapMock is the tap function for each test
      vi.mocked(useHaptics).mockReturnValue({ tap: tapMock, success: vi.fn() });

      // Common profile + thumbnail stubs
      (styleThumbnails.getStyleThumbnail as MockedFunction<typeof styleThumbnails.getStyleThumbnail>)
        .mockReturnValue(new Promise(() => {}));
      (profileSampler.sampleProfile as MockedFunction<typeof profileSampler.sampleProfile>)
        .mockReturnValue({
          samples: [{ z: 0, rOuter: 25, rInner: 20 }],
          maxR: 30,
          H: mockGeometry.H,
          topOD: mockGeometry.top_od,
          bottomOD: mockGeometry.bottom_od,
        });
    });

    /** Fire a synthetic touch event carrying a single touch point */
    function touch(
      el: HTMLElement,
      type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
      x = 50,
      y = 50
    ) {
      const hasPoint = type === 'touchstart' || type === 'touchmove';
      fireEvent(
        el,
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: hasPoint
            ? ([{
                identifier: 0,
                target: el,
                clientX: x,
                clientY: y,
                pageX: x,
                pageY: y,
                screenX: 0,
                screenY: 0,
                radiusX: 0,
                radiusY: 0,
                rotationAngle: 0,
                force: 0,
              }] as unknown as Touch[])
            : [],
        })
      );
    }

    it('long-press (350ms): onHoverIntent + tap fired; touchend → onHoverEnd reverts; synthetic click suppressed', () => {
      const onHoverIntent = vi.fn();
      const onHoverEnd = vi.fn();
      const onClick = vi.fn();

      render(
        <StyleThumb
          styleName={styleName}
          size={100}
          onHoverIntent={onHoverIntent}
          onHoverEnd={onHoverEnd}
          onClick={onClick}
          data-testid="style-thumb"
        />
      );
      const button = screen.getByRole('button');

      touch(button, 'touchstart');
      expect(onHoverIntent).not.toHaveBeenCalled();

      vi.advanceTimersByTime(350);
      expect(onHoverIntent).toHaveBeenCalledTimes(1);
      expect(tapMock).toHaveBeenCalledTimes(1);

      touch(button, 'touchend');
      expect(onHoverEnd).toHaveBeenCalledTimes(1);

      // Synthetic click that the browser fires after touchend must be suppressed
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('synthetic mouseenter after long-press touchend is suppressed (no second preview)', () => {
      const onHoverIntent = vi.fn();
      const onHoverEnd = vi.fn();

      render(
        <StyleThumb
          styleName={styleName}
          size={100}
          onHoverIntent={onHoverIntent}
          onHoverEnd={onHoverEnd}
          data-testid="style-thumb"
        />
      );
      const button = screen.getByRole('button');

      touch(button, 'touchstart');
      vi.advanceTimersByTime(350);
      touch(button, 'touchend');

      // Browser fires synthetic mouseenter after touchend — must not restart the hover timer
      fireEvent.mouseEnter(button);
      vi.advanceTimersByTime(150);

      // onHoverIntent was called exactly once (from touch), not again from the spurious mouseenter
      expect(onHoverIntent).toHaveBeenCalledTimes(1);
    });

    it('quick tap (<350ms): onClick fires, onHoverIntent never fires', () => {
      const onHoverIntent = vi.fn();
      const onClick = vi.fn();

      render(
        <StyleThumb
          styleName={styleName}
          size={100}
          onHoverIntent={onHoverIntent}
          onClick={onClick}
          data-testid="style-thumb"
        />
      );
      const button = screen.getByRole('button');

      touch(button, 'touchstart');
      vi.advanceTimersByTime(100); // less than 350ms — timer has not fired
      touch(button, 'touchend');

      expect(onHoverIntent).not.toHaveBeenCalled();

      // Synthetic click is NOT suppressed for a quick tap
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('move >8px cancels timer: onHoverIntent and onHoverEnd never fire', () => {
      const onHoverIntent = vi.fn();
      const onHoverEnd = vi.fn();

      render(
        <StyleThumb
          styleName={styleName}
          size={100}
          onHoverIntent={onHoverIntent}
          onHoverEnd={onHoverEnd}
          data-testid="style-thumb"
        />
      );
      const button = screen.getByRole('button');

      touch(button, 'touchstart', 50, 50);
      touch(button, 'touchmove', 60, 50); // 10px dx — exceeds 8px threshold

      vi.advanceTimersByTime(350); // timer was cancelled — should not fire
      expect(onHoverIntent).not.toHaveBeenCalled();

      touch(button, 'touchend');
      expect(onHoverEnd).not.toHaveBeenCalled();
    });

    it('touchcancel during active preview: onHoverEnd reverts; synthetic click suppressed', () => {
      const onHoverIntent = vi.fn();
      const onHoverEnd = vi.fn();
      const onClick = vi.fn();

      render(
        <StyleThumb
          styleName={styleName}
          size={100}
          onHoverIntent={onHoverIntent}
          onHoverEnd={onHoverEnd}
          onClick={onClick}
          data-testid="style-thumb"
        />
      );
      const button = screen.getByRole('button');

      touch(button, 'touchstart');
      vi.advanceTimersByTime(350);
      expect(onHoverIntent).toHaveBeenCalledTimes(1);

      touch(button, 'touchcancel');
      expect(onHoverEnd).toHaveBeenCalledTimes(1);

      // Suppression flag is set defensively even for touchcancel
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
