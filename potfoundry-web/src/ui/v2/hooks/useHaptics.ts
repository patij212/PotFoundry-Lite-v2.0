import { useCallback } from 'react';
import { useAppStore } from '../../../state';

function canVibrate(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  );
}

export function useHaptics() {
  const enabled = useAppStore((s) => s.ui.hapticsEnabled);

  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (!enabled || !canVibrate()) return;
      navigator.vibrate(pattern);
    },
    [enabled]
  );

  const tap = useCallback(() => {
    vibrate(10);
  }, [vibrate]);

  const success = useCallback(() => {
    vibrate([20, 40, 30]);
  }, [vibrate]);

  return {
    tap,
    success,
  };
}
