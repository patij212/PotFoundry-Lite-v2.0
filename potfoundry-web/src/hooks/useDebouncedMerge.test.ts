/**
 * useDebouncedMerge Tests
 * Tests for the debounce hook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDebouncedMerge } from './useDebouncedMerge';

describe('useDebouncedMerge', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should call apply after delay', () => {
        const apply = vi.fn();
        const payload = { test: 123 };

        renderHook(() => useDebouncedMerge(payload, 500, apply));

        // Should not call immediately
        expect(apply).not.toHaveBeenCalled();

        // Advance timers
        vi.advanceTimersByTime(500);

        expect(apply).toHaveBeenCalledWith(payload);
    });

    it('should debounce multiple updates', () => {
        const apply = vi.fn();
        const payload1 = { val: 1 };
        const payload2 = { val: 2 };

        const { rerender } = renderHook(
            ({ p }) => useDebouncedMerge(p, 500, apply),
            { initialProps: { p: payload1 } }
        );

        // Advance partial time
        vi.advanceTimersByTime(200);

        // Update payload
        rerender({ p: payload2 });

        // Old timer should be cleared, new one starting

        // Advance 300 (total 500 from start), assuming timer reset
        vi.advanceTimersByTime(300);
        expect(apply).not.toHaveBeenCalled(); // Should have reset

        // Advance 200 more (total 500 from second update)
        vi.advanceTimersByTime(200);
        expect(apply).toHaveBeenCalledWith(payload2);
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if payload is null', () => {
        const apply = vi.fn();
        renderHook(() => useDebouncedMerge(null, 500, apply));

        vi.advanceTimersByTime(1000);
        expect(apply).not.toHaveBeenCalled();
    });
});
