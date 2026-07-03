import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HintLine } from './HintLine';

vi.mock('../mobile/TouchModeContext', () => ({
  useTouchMode: vi.fn(() => false),
}));

import { useTouchMode } from '../mobile/TouchModeContext';

describe('HintLine', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useTouchMode).mockReturnValue(false);
  });

  it('shows on first run, hides after any pointer interaction', () => {
    render(<HintLine />);
    expect(screen.getByText(/Drag to orbit/)).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText(/Drag to orbit/)).not.toBeInTheDocument();
    expect(localStorage.getItem('pf3-hint-dismissed')).toBe('1');
  });

  it('never returns once dismissed', () => {
    localStorage.setItem('pf3-hint-dismissed', '1');
    render(<HintLine />);
    expect(screen.queryByText(/Drag to orbit/)).not.toBeInTheDocument();
  });

  describe('touch mode', () => {
    it('shows touch-specific hint text when touchMode is true', () => {
      vi.mocked(useTouchMode).mockReturnValue(true);
      render(<HintLine />);
      expect(screen.getByText('Drag to orbit · pull up for controls')).toBeInTheDocument();
    });

    it('shows desktop hint text when touchMode is false', () => {
      vi.mocked(useTouchMode).mockReturnValue(false);
      render(<HintLine />);
      expect(screen.getByText('Drag to orbit · pick a starting point on the left')).toBeInTheDocument();
    });
  });
});
