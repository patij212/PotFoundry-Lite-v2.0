import { useEffect } from 'react';
import { safeStorage } from '../utils/safeStorage';
import { useAppStore } from '../../../state';
import { DEFAULT_APPEARANCE } from '../../../state/types';

export const STUDIO_GRADIENT: [string, string] = ['#131009', '#0e0b08'];
const FLAG = 'pf3-scene-migrated';

export function useStudioBackdrop(): void {
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
}
