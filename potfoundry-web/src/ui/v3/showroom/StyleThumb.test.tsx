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

  it('does not fire onHoverIntent if hover ends before 150ms', () => {
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

    fireEvent.mouseEnter(button);
    vi.advanceTimersByTime(100); // Only 100ms

    fireEvent.mouseLeave(button);

    // Even if we advance more time after leave, should not fire
    vi.advanceTimersByTime(100);
    expect(onHoverIntent).not.toHaveBeenCalled();
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
});
