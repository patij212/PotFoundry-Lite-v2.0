// src/ui/v2/shared/Announcer.tsx

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

type AnnounceFn = (message: string) => void;

const AnnouncerContext = createContext<AnnounceFn>(() => {
  if (import.meta.env.DEV) {
    console.warn('useAnnounce() called outside <AnnouncerProvider>');
  }
});

/**
 * Returns a function to announce a message via ARIA live region.
 *
 * Announcements are queued to a hidden `role="status" aria-live="polite"` div.
 * Identical consecutive messages are still announced (guaranteed by
 * a two-slot double-buffer mechanism).
 */
export function useAnnounce(): AnnounceFn {
  return useContext(AnnouncerContext);
}

const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Provides an ARIA live region announcer for the v2 UI.
 *
 * Uses a double-buffer strategy: two `role="status"` divs alternate
 * between active and empty. This forces the browser to detect a DOM
 * change on every announcement, even if the message text is identical.
 *
 * Place this inside the `<div className="pf2-root">`.
 */
export const AnnouncerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [slots, setSlots] = useState<[string, string]>(['', '']);
  const activeSlot = useRef(0);
  const rafId = useRef(0);

  const announce = useCallback((message: string) => {
    cancelAnimationFrame(rafId.current);
    setSlots(['', '']);
    rafId.current = requestAnimationFrame(() => {
      const slot = activeSlot.current;
      activeSlot.current = 1 - slot;
      setSlots((prev) => {
        const next: [string, string] = [prev[0], prev[1]];
        next[slot] = message;
        return next;
      });
    });
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div style={srOnlyStyle} data-pf2-announcer>
        <div role="status" aria-live="polite" aria-atomic="true">
          {slots[0]}
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          {slots[1]}
        </div>
      </div>
    </AnnouncerContext.Provider>
  );
};
