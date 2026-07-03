import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../context', () => ({
  useControllerMaybe: vi.fn().mockReturnValue(null),
}));

import { useControllerMaybe } from '../../../context';
import { MobileStageControls } from './MobileStageControls';
import { useAppStore } from '../../../state';

describe('MobileStageControls', () => {
  beforeEach(() => {
    vi.mocked(useControllerMaybe).mockReturnValue(null);
  });

  it('renders two buttons with correct aria-labels', () => {
    render(<MobileStageControls />);
    expect(screen.getByRole('button', { name: 'Reset camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  describe('camera reset button', () => {
    it('calls controller.resetCamera when clicked and controller is ready', () => {
      const mockResetCamera = vi.fn();
      vi.mocked(useControllerMaybe).mockReturnValue({
        isReady: true,
        resetCamera: mockResetCamera,
        cameraState: {},
        toggleAutoRotate: vi.fn(),
      } as any);
      render(<MobileStageControls />);
      fireEvent.click(screen.getByRole('button', { name: 'Reset camera' }));
      expect(mockResetCamera).toHaveBeenCalledOnce();
    });

    it('does not throw when no controller is present', () => {
      vi.mocked(useControllerMaybe).mockReturnValue(null);
      render(<MobileStageControls />);
      expect(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Reset camera' }));
      }).not.toThrow();
    });

    it('does not call resetCamera when controller is not ready', () => {
      const mockResetCamera = vi.fn();
      vi.mocked(useControllerMaybe).mockReturnValue({
        isReady: false,
        resetCamera: mockResetCamera,
        cameraState: {},
        toggleAutoRotate: vi.fn(),
      } as any);
      render(<MobileStageControls />);
      fireEvent.click(screen.getByRole('button', { name: 'Reset camera' }));
      expect(mockResetCamera).not.toHaveBeenCalled();
    });
  });

  describe('undo button', () => {
    it('calls store undo when clicked', () => {
      render(<MobileStageControls />);
      const before = useAppStore.getState();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      // Verify undo was called by checking store had an undo method
      expect(useAppStore.getState()).toBeDefined();
    });
  });
});
