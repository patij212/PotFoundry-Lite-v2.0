import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

const OPTS = [
  { value: 'shape', label: 'Shape' },
  { value: 'style', label: 'Style' },
  { value: 'export', label: 'Export' },
] as const;

describe('SegmentedControl', () => {
  it('marks the active segment and switches on click', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTS} value="shape" onChange={onChange} ariaLabel="Panel tabs" />);
    expect(screen.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(onChange).toHaveBeenCalledWith('export');
  });

  it('cycles with arrow keys', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTS} value="style" onChange={onChange} ariaLabel="Panel tabs" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('export');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('shape');
  });
});
