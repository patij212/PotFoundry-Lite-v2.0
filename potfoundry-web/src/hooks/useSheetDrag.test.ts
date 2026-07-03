/**
 * useSheetDrag — unit tests.
 *
 * Covers the public API (state, toggle, collapse, dragHandlers) and the
 * additive `draggingClassName` option (pf2 default preserved; custom class
 * applied when supplied).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSheetDrag } from './useSheetDrag';

// Minimal sheetRef stub — getBoundingClientRect returns a fixed height so
// the hook can compute snap decisions without a real DOM element.
function makeRef(height = 400) {
  const el = {
    style: {} as CSSStyleDeclaration,
    classList: { add: vi.fn(), remove: vi.fn() },
    getBoundingClientRect: vi.fn(() => ({ height })),
  };
  return { current: el } as unknown as React.RefObject<HTMLElement | null>;
}

describe('useSheetDrag', () => {
  it('initial state defaults to half', () => {
    const sheetRef = makeRef();
    const { result } = renderHook(() => useSheetDrag({ sheetRef }));
    expect(result.current.state).toBe('half');
  });

  it('respects initialState option', () => {
    const sheetRef = makeRef();
    const { result } = renderHook(() =>
      useSheetDrag({ sheetRef, initialState: 'collapsed' }),
    );
    expect(result.current.state).toBe('collapsed');
  });

  it('toggle cycles collapsed → half → full → collapsed', () => {
    const sheetRef = makeRef();
    const { result } = renderHook(() =>
      useSheetDrag({ sheetRef, initialState: 'collapsed' }),
    );

    act(() => result.current.toggle());
    expect(result.current.state).toBe('half');

    act(() => result.current.toggle());
    expect(result.current.state).toBe('full');

    act(() => result.current.toggle());
    expect(result.current.state).toBe('collapsed');
  });

  it('collapse() snaps directly to collapsed from any state', () => {
    const sheetRef = makeRef();
    const { result } = renderHook(() =>
      useSheetDrag({ sheetRef, initialState: 'half' }),
    );

    act(() => result.current.collapse());
    expect(result.current.state).toBe('collapsed');
  });

  it('collapse() from full also reaches collapsed', () => {
    const sheetRef = makeRef();
    const { result } = renderHook(() =>
      useSheetDrag({ sheetRef, initialState: 'full' }),
    );

    act(() => result.current.collapse());
    expect(result.current.state).toBe('collapsed');
  });

  it('collapse() fires onStateChange with "collapsed"', () => {
    const sheetRef = makeRef();
    const onStateChange = vi.fn();
    const { result } = renderHook(() =>
      useSheetDrag({ sheetRef, initialState: 'half', onStateChange }),
    );

    act(() => result.current.collapse());
    expect(onStateChange).toHaveBeenCalledWith('collapsed');
  });

  describe('draggingClassName option', () => {
    it('defaults to pf2-mobile-sheet--dragging on touchstart', () => {
      const sheetRef = makeRef();
      const { result } = renderHook(() => useSheetDrag({ sheetRef }));
      act(() => {
        result.current.dragHandlers.onTouchStart({
          touches: [{ clientY: 200 }],
        } as unknown as React.TouchEvent);
      });
      expect(sheetRef.current!.classList.add).toHaveBeenCalledWith(
        'pf2-mobile-sheet--dragging',
      );
    });

    it('uses custom draggingClassName when supplied', () => {
      const sheetRef = makeRef();
      const { result } = renderHook(() =>
        useSheetDrag({ sheetRef, draggingClassName: 'pf3-sheet--dragging' }),
      );
      act(() => {
        result.current.dragHandlers.onTouchStart({
          touches: [{ clientY: 200 }],
        } as unknown as React.TouchEvent);
      });
      expect(sheetRef.current!.classList.add).toHaveBeenCalledWith(
        'pf3-sheet--dragging',
      );
    });

    it('removes pf2 class on snap when using default', () => {
      const sheetRef = makeRef(400);
      const { result } = renderHook(() => useSheetDrag({ sheetRef }));

      // start drag
      act(() => {
        result.current.dragHandlers.onTouchStart({
          touches: [{ clientY: 200 }],
        } as unknown as React.TouchEvent);
      });

      // end drag — triggers snapToNearest
      act(() => {
        result.current.dragHandlers.onTouchEnd();
      });

      expect(sheetRef.current!.classList.remove).toHaveBeenCalledWith(
        'pf2-mobile-sheet--dragging',
      );
    });

    it('removes custom class on snap', () => {
      const sheetRef = makeRef(400);
      const { result } = renderHook(() =>
        useSheetDrag({ sheetRef, draggingClassName: 'pf3-sheet--dragging' }),
      );

      act(() => {
        result.current.dragHandlers.onTouchStart({
          touches: [{ clientY: 200 }],
        } as unknown as React.TouchEvent);
      });
      act(() => {
        result.current.dragHandlers.onTouchEnd();
      });

      expect(sheetRef.current!.classList.remove).toHaveBeenCalledWith(
        'pf3-sheet--dragging',
      );
    });
  });

  describe('touchcancel (F5)', () => {
    it('touchstart → touchmove → touchcancel snaps to nearest state and removes the dragging class', () => {
      const sheetRef = makeRef(400);
      const onStateChange = vi.fn();
      const { result } = renderHook(() =>
        useSheetDrag({ sheetRef, initialState: 'full', onStateChange }),
      );

      act(() => {
        result.current.dragHandlers.onTouchStart({
          touches: [{ clientY: 200 }],
        } as unknown as React.TouchEvent);
      });
      act(() => {
        result.current.dragHandlers.onTouchMove({
          touches: [{ clientY: 250 }],
        } as unknown as React.TouchEvent);
      });
      act(() => {
        result.current.dragHandlers.onTouchCancel();
      });

      // Stub height 400 on the 768px jsdom viewport → nearest snap is 'half':
      // the cancelled drag must snap (not stick mid-drag) exactly like touchend.
      expect(result.current.state).toBe('half');
      expect(onStateChange).toHaveBeenCalledWith('half');
      expect(sheetRef.current!.classList.remove).toHaveBeenCalledWith(
        'pf2-mobile-sheet--dragging',
      );
    });
  });
});
