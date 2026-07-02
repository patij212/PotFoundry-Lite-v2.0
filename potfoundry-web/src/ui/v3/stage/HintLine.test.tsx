import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HintLine } from './HintLine';

describe('HintLine', () => {
  beforeEach(() => localStorage.clear());

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
});
