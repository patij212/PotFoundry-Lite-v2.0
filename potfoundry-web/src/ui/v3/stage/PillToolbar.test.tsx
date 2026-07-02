import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../context', () => ({
  useControllerMaybe: vi.fn().mockReturnValue(null),
}));

import { useControllerMaybe } from '../../../context';
import { PillToolbar } from './PillToolbar';
import { useAppStore } from '../../../state';

describe('PillToolbar', () => {
  beforeEach(() => {
    vi.mocked(useControllerMaybe).mockReturnValue(null);
  });

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

  describe('pf3:reset-camera event', () => {
    it('calls controller.resetCamera when the event is dispatched and controller is ready', () => {
      const mockResetCamera = vi.fn();
      vi.mocked(useControllerMaybe).mockReturnValue({
        isReady: true,
        resetCamera: mockResetCamera,
        cameraState: { autoRotate: false },
        toggleAutoRotate: vi.fn(),
      } as any);
      render(<PillToolbar />);
      window.dispatchEvent(new CustomEvent('pf3:reset-camera'));
      expect(mockResetCamera).toHaveBeenCalledOnce();
    });

    it('does not throw when no controller is present', () => {
      vi.mocked(useControllerMaybe).mockReturnValue(null);
      render(<PillToolbar />);
      expect(() => {
        window.dispatchEvent(new CustomEvent('pf3:reset-camera'));
      }).not.toThrow();
    });
  });
});
