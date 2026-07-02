import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStudioBackdrop, STUDIO_GRADIENT } from './useStudioBackdrop';
import { useAppStore } from '../../../state';
import { DEFAULT_APPEARANCE } from '../../../state/types';

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
