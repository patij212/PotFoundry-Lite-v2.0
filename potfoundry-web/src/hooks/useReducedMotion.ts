/**
 * Hook to detect user's reduced motion preference.
 *
 * Returns `true` when the user has enabled "Reduce motion" in their OS
 * accessibility settings. Use this to skip JS-driven animations.
 *
 * @example
 * ```tsx
 * const reduced = useReducedMotion();
 * if (!reduced) animateElement(ref.current);
 * ```
 */

import { useState, useEffect } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}
