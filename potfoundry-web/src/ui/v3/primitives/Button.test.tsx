import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders variants with pf3 classes and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Export STL</Button>);
    const btn = screen.getByRole('button', { name: 'Export STL' });
    expect(btn.className).toContain('pf3-btn--primary');
    expect(btn).toHaveAttribute('data-pf3-focusable');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disabled blocks clicks', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
