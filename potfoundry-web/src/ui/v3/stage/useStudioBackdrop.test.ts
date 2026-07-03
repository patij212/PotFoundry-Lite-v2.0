import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStudioBackdrop, STUDIO_GRADIENT } from './useStudioBackdrop';
import { useAppStore } from '../../../state';
import { DEFAULT_APPEARANCE } from '../../../state/types';

vi.mock('../../../context', () => ({
  useControllerMaybe: vi.fn(),
}));

import { useControllerMaybe } from '../../../context';

describe('useStudioBackdrop', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState((s) => ({ appearance: { ...DEFAULT_APPEARANCE } }));
  });

  it('migrates the v1 default gradient to studio values once', () => {
    renderHook(() => useStudioBackdrop());
    expect(useAppStore.getState().appearance.gradient).toEqual(STUDIO_GRADIENT);
    expect(useAppStore.getState().appearance.gradientAngle).toBe(0);
    expect(localStorage.getItem('pf3-scene-migrated')).toBe('1');
  });

  it('leaves a customized gradient alone', () => {
    useAppStore.setState((s) => ({
      appearance: { ...s.appearance, gradient: ['#ff0000', '#00ff00'] as [string, string] },
    }));
    renderHook(() => useStudioBackdrop());
    expect(useAppStore.getState().appearance.gradient).toEqual(['#ff0000', '#00ff00']);
  });

  it('does not re-migrate after the flag is set', () => {
    localStorage.setItem('pf3-scene-migrated', '1');
    renderHook(() => useStudioBackdrop());
    expect(useAppStore.getState().appearance.gradient).toEqual(DEFAULT_APPEARANCE.gradient);
  });
});

describe('useStudioBackdrop - grid migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useControllerMaybe).mockReturnValue(null);
  });

  it('toggles grid off when flag is unset and controller is ready with showGrid true', () => {
    const mockToggleGrid = vi.fn();
    vi.mocked(useControllerMaybe).mockReturnValue({
      isReady: true,
      toggleGrid: mockToggleGrid,
      cameraState: { showGrid: true },
    } as any);
    renderHook(() => useStudioBackdrop());
    expect(mockToggleGrid).toHaveBeenCalledOnce();
    expect(localStorage.getItem('pf3-grid-migrated')).toBe('1');
  });

  it('does not toggle grid if flag is already set', () => {
    localStorage.setItem('pf3-grid-migrated', '1');
    const mockToggleGrid = vi.fn();
    vi.mocked(useControllerMaybe).mockReturnValue({
      isReady: true,
      toggleGrid: mockToggleGrid,
      cameraState: { showGrid: true },
    } as any);
    renderHook(() => useStudioBackdrop());
    expect(mockToggleGrid).not.toHaveBeenCalled();
  });

  it('does not toggle grid if showGrid is already false', () => {
    const mockToggleGrid = vi.fn();
    vi.mocked(useControllerMaybe).mockReturnValue({
      isReady: true,
      toggleGrid: mockToggleGrid,
      cameraState: { showGrid: false },
    } as any);
    renderHook(() => useStudioBackdrop());
    expect(mockToggleGrid).not.toHaveBeenCalled();
    expect(localStorage.getItem('pf3-grid-migrated')).toBe('1');
  });

  it('does nothing gracefully if controller is not ready', () => {
    vi.mocked(useControllerMaybe).mockReturnValue(null);
    renderHook(() => useStudioBackdrop());
    expect(localStorage.getItem('pf3-grid-migrated')).toBeNull();
  });
});
