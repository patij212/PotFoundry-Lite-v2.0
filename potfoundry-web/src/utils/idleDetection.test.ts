/**
 * Idle Detection Tests
 * Tests for the idle detection module.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createIdleDetector, getIdleDetector, disposeIdleDetector } from './idleDetection';

describe('createIdleDetector', () => {
    let detector: ReturnType<typeof createIdleDetector>;

    afterEach(() => {
        detector?.dispose();
    });

    it('should create an idle detector', () => {
        detector = createIdleDetector();
        expect(detector).toBeDefined();
        expect(detector.getState).toBeInstanceOf(Function);
        expect(detector.shouldRenderFrame).toBeInstanceOf(Function);
        expect(detector.markActivity).toBeInstanceOf(Function);
        expect(detector.setForceActive).toBeInstanceOf(Function);
        expect(detector.dispose).toBeInstanceOf(Function);
    });

    it('should return initial state', () => {
        detector = createIdleDetector();
        const state = detector.getState();
        expect(state).toHaveProperty('isPageVisible');
        expect(state).toHaveProperty('isUserActive');
        expect(state).toHaveProperty('shouldRenderFull');
        expect(state).toHaveProperty('lastActivityTime');
    });

    it('should mark activity when called', () => {
        detector = createIdleDetector();
        detector.markActivity();
        const afterTime = detector.getState().lastActivityTime;
        expect(afterTime).toBeDefined();
        expect(afterTime).toBeGreaterThan(0);
    });

    it('should set force active', () => {
        detector = createIdleDetector();
        detector.setForceActive(true);

        const state = detector.getState();
        expect(state.isUserActive).toBe(true);
    });

    it('should call onVisibilityChange callback', () => {
        const onVisibilityChange = vi.fn();
        detector = createIdleDetector({ onVisibilityChange });

        // Simulate visibility change
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(onVisibilityChange).toHaveBeenCalled();

        // Reset
        Object.defineProperty(document, 'hidden', { value: false, writable: true });
    });

    it('should dispose properly', () => {
        detector = createIdleDetector();
        expect(() => detector.dispose()).not.toThrow();
    });

    it('should not error when dispose called twice', () => {
        detector = createIdleDetector();
        detector.dispose();
        expect(() => detector.dispose()).not.toThrow();
    });

    it('should use custom timeout', () => {
        detector = createIdleDetector({ idleTimeoutMs: 1000 });
        expect(detector).toBeDefined();
    });

    it('should ignore activity events after disposal', () => {
        detector = createIdleDetector();
        const initialTime = detector.getState().lastActivityTime;

        // Dispose the detector
        detector.dispose();

        // Simulate activity event after disposal
        document.dispatchEvent(new Event('mousedown'));

        // lastActivityTime should not update (disposed guard)
        // Note: We can't directly check internal state, but the test exercises the code path
        expect(detector.getState().lastActivityTime).toBe(initialTime);
    });

    it('should mark activity when resuming from hidden', () => {
        detector = createIdleDetector();

        // First, hide the page
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(detector.getState().isPageVisible).toBe(false);

        // Now make it visible again - this should trigger lastActivityTime update (line 104)
        Object.defineProperty(document, 'hidden', { value: false, writable: true });
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(detector.getState().isPageVisible).toBe(true);
        // The activity time should be recent
        expect(Date.now() - detector.getState().lastActivityTime).toBeLessThan(100);
    });
});

describe('shouldRenderFrame', () => {
    let detector: ReturnType<typeof createIdleDetector>;

    afterEach(() => {
        detector?.dispose();
    });

    it('should return true when page visible and user active', () => {
        detector = createIdleDetector();
        detector.markActivity();
        expect(detector.shouldRenderFrame()).toBe(true);
    });

    it('should return true when force active', () => {
        detector = createIdleDetector();
        detector.setForceActive(true);
        expect(detector.shouldRenderFrame()).toBe(true);
    });
    it('should throttle frame rendering when inactive', () => {
        // Use fake timers to control time
        vi.useFakeTimers();
        detector = createIdleDetector({ idleTimeoutMs: 1000 });

        // Active: render always
        detector.markActivity();
        expect(detector.shouldRenderFrame()).toBe(true);

        // Advance past idle (1s) + slop
        vi.advanceTimersByTime(1100);
        // User should be inactive now? 
        // Note: getState calculates isUserActive based on Date.now().
        // createIdleDetector uses `Date.now()` internally. vi.useFakeTimers MOCKS Date.now().

        // However, getState() derives `isUserActive` from `lastActivityTime`.
        // We need to ensure logic flow.
        expect(detector.getState().isUserActive).toBe(false);

        // First frame when idle: likely fails check depending on lastFrameTime?
        // Wait, lastFrameTime is updated when shouldRenderFrame returns true.
        // If user was active, lastFrameTime was updated 1100ms ago?
        // No, shouldRenderFrame was called 1100ms ago?
        // The test above called shouldRenderFrame().

        // Now:
        const firstIdleFrame = detector.shouldRenderFrame();
        // Logic: if (now - lastFrameTime >= 500) return true;
        // 1100 >= 500. So TRUE.
        expect(firstIdleFrame).toBe(true);

        // Immediate next call: should NOT render (throttled)
        // lastFrameTime is now NOW. difference is 0.
        expect(detector.shouldRenderFrame()).toBe(false);

        // Advance 200ms
        vi.advanceTimersByTime(200);
        expect(detector.shouldRenderFrame()).toBe(false);

        // Advance to 501ms total since last frame
        vi.advanceTimersByTime(301);
        expect(detector.shouldRenderFrame()).toBe(true);

        vi.useRealTimers();
    });

    it('should not render frame when page is hidden', () => {
        detector = createIdleDetector();
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(detector.getState().isPageVisible).toBe(false);
        expect(detector.shouldRenderFrame()).toBe(false);
    });
});

describe('Singleton Instance', () => {
    afterEach(() => {
        disposeIdleDetector();
        vi.restoreAllMocks();
    });

    it('should log debug messages in singleton instance', () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => { });
        getIdleDetector();

        // Trigger visibility change to fire callback
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
        document.dispatchEvent(new Event('visibilitychange'));

        expect(spy).toHaveBeenCalledWith(expect.stringContaining('[IdleDetector]'), expect.anything());
    });
});

describe('getIdleDetector', () => {
    afterEach(() => {
        disposeIdleDetector();
    });

    it('should return shared instance', () => {
        const detector1 = getIdleDetector();
        const detector2 = getIdleDetector();
        expect(detector1).toBe(detector2);
    });

    it('should create new instance after dispose', () => {
        const detector1 = getIdleDetector();
        disposeIdleDetector();
        const detector2 = getIdleDetector();
        expect(detector1).not.toBe(detector2);
    });
});

describe('disposeIdleDetector', () => {
    it('should not throw when no detector exists', () => {
        expect(() => disposeIdleDetector()).not.toThrow();
    });

    it('should dispose the shared detector', () => {
        getIdleDetector();
        expect(() => disposeIdleDetector()).not.toThrow();
    });
});
