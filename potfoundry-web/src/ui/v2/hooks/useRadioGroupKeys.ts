/**
 * useRadioGroupKeys — Arrow key navigation for WAI-ARIA radio groups.
 *
 * Implements the keyboard interaction pattern for radio groups:
 * - ArrowRight / ArrowDown → focus next option (wraps)
 * - ArrowLeft / ArrowUp → focus previous option (wraps)
 * - Home → focus first option
 * - End → focus last option
 *
 * Attach the returned `onKeyDown` to the `role="radiogroup"` container.
 *
 * @module ui/v2/hooks/useRadioGroupKeys
 */

import { useCallback } from 'react';

/**
 * Returns an `onKeyDown` handler for a radio group container.
 * The handler queries all `[role="radio"]` children and navigates focus
 * between them using arrow keys.
 */
export function useRadioGroupKeys(): React.KeyboardEventHandler<HTMLElement> {
  return useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const container = e.currentTarget;
    const radios = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')
    );
    if (radios.length === 0) return;

    const focused = document.activeElement as HTMLElement;
    const idx = radios.indexOf(focused as HTMLButtonElement);
    if (idx < 0) return;

    let next = idx;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (idx + 1) % radios.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (idx - 1 + radios.length) % radios.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = radios.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    radios[next].focus();
    radios[next].click();
  }, []);
}
