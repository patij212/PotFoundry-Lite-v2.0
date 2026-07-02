import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DisclosureSeam } from './DisclosureSeam';

describe('DisclosureSeam', () => {
  beforeEach(() => localStorage.clear());

  it('is collapsed by default and names its contents', () => {
    render(<DisclosureSeam id="shape-adv" summary="advanced — walls, drain & flare"><p>Deep</p></DisclosureSeam>);
    expect(screen.queryByText('Deep')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /advanced — walls/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands on click and persists', () => {
    const view = render(<DisclosureSeam id="shape-adv" summary="advanced"><p>Deep</p></DisclosureSeam>);
    fireEvent.click(screen.getByRole('button', { name: /advanced/ }));
    expect(screen.getByText('Deep')).toBeInTheDocument();
    expect(localStorage.getItem('pf3-seam-shape-adv')).toBe('1');
    view.unmount();
    render(<DisclosureSeam id="shape-adv" summary="advanced"><p>Deep</p></DisclosureSeam>);
    expect(screen.getByText('Deep')).toBeInTheDocument(); // remembered
  });
});
