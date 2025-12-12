import { useEffect, useRef } from 'react';

export type MergeCallback<T> = (payload: T) => void;

export function useDebouncedMerge<T extends Record<string, unknown>>(
  payload: T | null,
  delayMs: number,
  apply: MergeCallback<T>
): void {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!payload) {
      return undefined;
    }

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      apply(payload);
      timerRef.current = null;
    }, delayMs);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [payload, delayMs, apply]);
}
