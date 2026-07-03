import { useEffect } from 'react';
import { safeStorage } from '../utils/safeStorage';
import { useAppStore } from '../../../state';
import { DEFAULT_APPEARANCE } from '../../../state/types';
import { useControllerMaybe } from '../../../context';

export const STUDIO_GRADIENT: [string, string] = ['#131009', '#0e0b08'];
const FLAG = 'pf3-scene-migrated';
const GRID_FLAG = 'pf3-grid-migrated';

export function useStudioBackdrop(): void {
  const controller = useControllerMaybe();

  useEffect(() => {
    if (safeStorage.get(FLAG) === '1') return;
    const { appearance, setCustomGradient, setGradientAngle } = useAppStore.getState();
    const [a, b] = appearance.gradient;
    const [da, db] = DEFAULT_APPEARANCE.gradient;
    if (a === da && b === db) {
      setCustomGradient(STUDIO_GRADIENT);
      setGradientAngle(0);
    }
    safeStorage.set(FLAG, '1');
  }, []);

  // Grid migration: turn grid off once on first load
  useEffect(() => {
    if (safeStorage.get(GRID_FLAG) === '1') return;
    if (!controller?.isReady) return;
    if (!controller.cameraState.showGrid) {
      // Grid already off, just set the flag
      safeStorage.set(GRID_FLAG, '1');
      return;
    }
    // Grid is on, toggle it off
    controller.toggleGrid();
    safeStorage.set(GRID_FLAG, '1');
  }, [controller]);
}
