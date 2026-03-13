import { useCallback, useEffect, useRef, useState } from 'react';

type TransitionPhase = 'idle' | 'exiting' | 'pausing' | 'entering';

interface UseStyleTransitionReturn {
  /** Current animation phase */
  phase: TransitionPhase;
  /** The style name to DISPLAY (may lag behind actual during transition) */
  displayStyle: string;
  /** Notify the hook that the canonical style changed */
  onStyleChanged: (newStyle: string) => void;
}

/**
 * Manages the exit → pause → enter animation cycle for style switches.
 *
 * The hook introduces a "display style" that lags behind the actual
 * Zustand style during the exit+pause animation. This prevents React
 * from swapping the param list until the exit animation completes.
 *
 * @param currentStyle - Current style name from Zustand
 * @param exitMs - Exit animation duration (includes stagger)
 * @param pauseMs - Breathing pause between exit and enter
 * @param enterMs - Enter animation duration (includes stagger)
 */
export function useStyleTransition(
  currentStyle: string,
  exitMs = 340,
  pauseMs = 80,
  enterMs = 340
): UseStyleTransitionReturn {
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [displayStyle, setDisplayStyle] = useState(currentStyle);
  const prevStyle = useRef(currentStyle);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Check for reduced motion preference
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const onStyleChanged = useCallback((newStyle: string) => {
    // Guard: don't animate on initial mount or same-style "change"
    if (newStyle === prevStyle.current) return;
    prevStyle.current = newStyle;

    // Clear any in-flight transition
    if (timerRef.current) clearTimeout(timerRef.current);

    // Reduced motion: skip animation, just swap immediately
    if (prefersReducedMotion.current) {
      setDisplayStyle(newStyle);
      setPhase('idle');
      return;
    }

    // Phase 1: exit
    setPhase('exiting');

    timerRef.current = setTimeout(() => {
      // Phase 2: pause (swap content while invisible)
      setPhase('pausing');
      setDisplayStyle(newStyle);

      timerRef.current = setTimeout(() => {
        // Phase 3: enter
        setPhase('entering');

        timerRef.current = setTimeout(() => {
          // Phase 4: done
          setPhase('idle');
        }, enterMs);
      }, pauseMs);
    }, exitMs);
  }, [exitMs, pauseMs, enterMs]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { phase, displayStyle, onStyleChanged };
}
