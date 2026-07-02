import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StyleTab } from './StyleTab';
import { useAppStore } from '../../../state';

describe('StyleTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().setStyle('HarmonicRipple');
  });

  it('shows the current style card and its parameter rows', () => {
    render(<StyleTab />);
    expect(screen.getByTestId('pf3-style-current').textContent).toContain('HarmonicRipple');
    // HarmonicRipple has hr_petals etc. — at least one labelled row renders
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  it('changing style select writes to the store', () => {
    render(<StyleTab />);
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'GothicArches' } });
    expect(useAppStore.getState().style.name).toBe('GothicArches');
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
});
