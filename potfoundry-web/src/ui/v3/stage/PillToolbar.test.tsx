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

  it('renders three grouped pills with labelled buttons (8 total)', () => {
    render(<PillToolbar />);
    for (const name of ['Undo', 'Redo', 'Reset camera', 'Auto-rotate', 'Orthographic view', 'Grid', 'Zen mode', 'Fullscreen']) {
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

  describe('view controls', () => {
    it('ortho button calls toggleProjection when clicked', () => {
      const mockToggleProjection = vi.fn();
      vi.mocked(useControllerMaybe).mockReturnValue({
        isReady: true,
        resetCamera: vi.fn(),
        toggleAutoRotate: vi.fn(),
        toggleProjection: mockToggleProjection,
        toggleGrid: vi.fn(),
        cameraState: { autoRotate: false, projection: 'perspective', showGrid: false },
      } as any);
      render(<PillToolbar />);
      fireEvent.click(screen.getByRole('button', { name: 'Orthographic view' }));
      expect(mockToggleProjection).toHaveBeenCalledOnce();
    });

    it('ortho button is active when projection is ortho', () => {
      vi.mocked(useControllerMaybe).mockReturnValue({
        isReady: true,
        resetCamera: vi.fn(),
        toggleAutoRotate: vi.fn(),
        toggleProjection: vi.fn(),
        toggleGrid: vi.fn(),
        cameraState: { autoRotate: false, projection: 'ortho', showGrid: false },
      } as any);
      render(<PillToolbar />);
      const orthoBtn = screen.getByRole('button', { name: 'Orthographic view' });
      expect(orthoBtn).toHaveClass('pf3-pillbtn--active');
    });

    it('grid button calls toggleGrid when clicked', () => {
      const mockToggleGrid = vi.fn();
      vi.mocked(useControllerMaybe).mockReturnValue({
        isReady: true,
        resetCamera: vi.fn(),
        toggleAutoRotate: vi.fn(),
        toggleProjection: vi.fn(),
        toggleGrid: mockToggleGrid,
        cameraState: { autoRotate: false, projection: 'perspective', showGrid: false },
      } as any);
      render(<PillToolbar />);
      fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
      expect(mockToggleGrid).toHaveBeenCalledOnce();
    });

    it('grid button is active when showGrid is true', () => {
      vi.mocked(useControllerMaybe).mockReturnValue({
        isReady: true,
        resetCamera: vi.fn(),
        toggleAutoRotate: vi.fn(),
        toggleProjection: vi.fn(),
        toggleGrid: vi.fn(),
        cameraState: { autoRotate: false, projection: 'perspective', showGrid: true },
      } as any);
      render(<PillToolbar />);
      const gridBtn = screen.getByRole('button', { name: 'Grid' });
      expect(gridBtn).toHaveClass('pf3-pillbtn--active');
    });
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
