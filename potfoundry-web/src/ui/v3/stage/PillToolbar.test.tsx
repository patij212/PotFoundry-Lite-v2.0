import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PillToolbar } from './PillToolbar';
import { useAppStore } from '../../../state';

describe('PillToolbar', () => {
  it('renders three grouped pills with labelled buttons', () => {
    render(<PillToolbar />);
    for (const name of ['Undo', 'Redo', 'Reset camera', 'Auto-rotate', 'Zen mode', 'Fullscreen']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByTestId('pf3-pill')).toHaveLength(3);
  });

  it('zen button toggles the store', () => {
    render(<PillToolbar />);
    const before = useAppStore.getState().ui.zenMode;
    fireEvent.click(screen.getByRole('button', { name: 'Zen mode' }));
    expect(useAppStore.getState().ui.zenMode).toBe(!before);
  });
});
