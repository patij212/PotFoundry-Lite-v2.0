import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleRow } from './ToggleRow';

describe('ToggleRow', () => {
  it('renders a switch and toggles', () => {
    const onChange = vi.fn();
    render(<ToggleRow label="Mirror" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Mirror' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
