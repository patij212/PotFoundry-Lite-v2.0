import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsDialogV3 } from './ShortcutsDialogV3';

describe('ShortcutsDialogV3', () => {
  it('renders dialog with title and Shortcuts heading when open', () => {
    const onOpenChange = () => {};
    render(<ShortcutsDialogV3 open onOpenChange={onOpenChange} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('Shortcuts');
  });

  it('contains Z (zen), D (export STL), R (reset camera) rows', () => {
    render(<ShortcutsDialogV3 open onOpenChange={() => {}} />);

    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when Escape is pressed (Radix Dialog built-in)', () => {
    const onOpenChange = vi.fn();
    render(<ShortcutsDialogV3 open onOpenChange={onOpenChange} />);

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render when open is false', () => {
    render(<ShortcutsDialogV3 open={false} onOpenChange={() => {}} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
