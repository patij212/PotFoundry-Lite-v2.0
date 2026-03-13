import { RefObject, useEffect } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;
}

const INTERACTIVE_SELECTOR = [
  'input',
  'select',
  'button',
  'textarea',
  "[role='slider']",
  '[data-radix-collection-item]',
  "[contenteditable='true']",
  "input[type='color']",
].join(', ');

function isTouchViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return isCoarsePointer || window.innerWidth <= 768;
}

function startsOnInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(INTERACTIVE_SELECTOR);
}

export function useSwipeGesture(
  ref: RefObject<HTMLElement>,
  options: SwipeGestureOptions
): void {
  const { onSwipeLeft, onSwipeRight, minDistance = 48 } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let startX = 0;
    let startY = 0;
    let startValid = false;

    const handleTouchStart = (event: TouchEvent) => {
      if (!isTouchViewport() || event.touches.length !== 1) {
        startValid = false;
        return;
      }

      if (startsOnInteractiveElement(event.target)) {
        startValid = false;
        return;
      }

      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startValid = true;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!startValid || !isTouchViewport() || event.changedTouches.length !== 1) {
        startValid = false;
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      startValid = false;

      if (absX < minDistance) return;
      if (absX <= absY * 1.2) return;

      if (deltaX < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight, minDistance]);
}
