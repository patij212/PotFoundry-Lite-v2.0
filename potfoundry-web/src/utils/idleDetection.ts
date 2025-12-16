/**
 * Idle Detection Module
 * 
 * Monitors user activity and page visibility to reduce resource usage
 * when the user is not interacting with the application.
 * 
 * Features:
 * - Page Visibility API: Pauses rendering when tab is hidden
 * - User Activity Detection: Reduces frame rate after inactivity timeout
 * - Throttled Rendering: Drops to ~2 FPS when idle
 * 
 * @module utils/idleDetection
 */

// ============================================================================
// Configuration
// ============================================================================

/** Milliseconds of inactivity before entering idle mode */
const IDLE_TIMEOUT_MS = 30_000; // 30 seconds

/** Minimum interval between frames when idle (in ms) - ~2 FPS */
const IDLE_FRAME_INTERVAL_MS = 500;

/** Events that indicate user activity */
const ACTIVITY_EVENTS = [
    'mousedown',
    'mousemove',
    'keydown',
    'scroll',
    'touchstart',
    'pointerdown',
    'pointermove',
    'wheel',
] as const;

// ============================================================================
// Types
// ============================================================================

export interface IdleState {
    /** Whether the page is currently visible */
    isPageVisible: boolean;
    /** Whether the user is actively interacting (within timeout) */
    isUserActive: boolean;
    /** Whether the app should render at full rate */
    shouldRenderFull: boolean;
    /** Last user activity timestamp */
    lastActivityTime: number;
}

export interface IdleDetectorOptions {
    /** Custom idle timeout in milliseconds */
    idleTimeoutMs?: number;
    /** Called when idle state changes */
    onIdleChange?: (isIdle: boolean) => void;
    /** Called when visibility changes */
    onVisibilityChange?: (isVisible: boolean) => void;
}

export interface IdleDetector {
    /** Get current idle state */
    getState: () => IdleState;
    /** Check if should render this frame (true = render, false = skip) */
    shouldRenderFrame: () => boolean;
    /** Mark user activity (call from input handlers) */
    markActivity: () => void;
    /** Force active state (e.g., during auto-rotate) */
    setForceActive: (active: boolean) => void;
    /** Clean up event listeners */
    dispose: () => void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Creates an idle detector that monitors page visibility and user activity
 */
export function createIdleDetector(options: IdleDetectorOptions = {}): IdleDetector {
    const idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;

    let lastActivityTime = Date.now();
    let isPageVisible = !document.hidden;
    let forceActive = false;
    let lastFrameTime = 0;
    let disposed = false;

    // Activity handler
    const handleActivity = () => {
        if (disposed) return;
        lastActivityTime = Date.now();
    };

    // Visibility change handler
    const handleVisibilityChange = () => {
        if (disposed) return;
        const wasVisible = isPageVisible;
        isPageVisible = !document.hidden;

        if (isPageVisible && !wasVisible) {
            // Resuming from hidden - mark activity
            lastActivityTime = Date.now();
        }

        options.onVisibilityChange?.(isPageVisible);
    };

    // Register event listeners
    ACTIVITY_EVENTS.forEach(event => {
        document.addEventListener(event, handleActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Get current state
    const getState = (): IdleState => {
        const now = Date.now();
        const isUserActive = forceActive || (now - lastActivityTime) < idleTimeoutMs;
        const shouldRenderFull = isPageVisible && isUserActive;

        return {
            isPageVisible,
            isUserActive,
            shouldRenderFull,
            lastActivityTime,
        };
    };

    // Should we render this frame?
    const shouldRenderFrame = (): boolean => {
        const state = getState();
        const now = Date.now();

        // Always render at full rate if page is visible and user is active
        if (state.shouldRenderFull) {
            lastFrameTime = now;
            return true;
        }

        // Page hidden: render nothing
        if (!state.isPageVisible) {
            return false;
        }

        // User inactive but page visible: throttle to ~2 FPS
        // This keeps the display updated (for clock/status) without wasting resources
        if (now - lastFrameTime >= IDLE_FRAME_INTERVAL_MS) {
            lastFrameTime = now;
            return true;
        }

        return false;
    };

    // Mark activity (for external callers like input handlers)
    const markActivity = () => {
        lastActivityTime = Date.now();
    };

    // Force active state (e.g., during animations)
    const setForceActive = (active: boolean) => {
        forceActive = active;
        if (active) {
            lastActivityTime = Date.now();
        }
    };

    // Cleanup
    const dispose = () => {
        if (disposed) return;
        disposed = true;

        ACTIVITY_EVENTS.forEach(event => {
            document.removeEventListener(event, handleActivity);
        });
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    return {
        getState,
        shouldRenderFrame,
        markActivity,
        setForceActive,
        dispose,
    };
}

// ============================================================================
// Singleton instance for shared usage
// ============================================================================

let sharedDetector: IdleDetector | null = null;

/**
 * Get or create the shared idle detector instance
 */
export function getIdleDetector(): IdleDetector {
    if (!sharedDetector) {
        sharedDetector = createIdleDetector({
            onIdleChange: (isIdle) => {
                console.debug('[IdleDetector] Idle state changed:', isIdle);
            },
            onVisibilityChange: (isVisible) => {
                console.debug('[IdleDetector] Visibility changed:', isVisible);
            },
        });
    }
    return sharedDetector;
}

/**
 * Dispose the shared instance (for cleanup)
 */
export function disposeIdleDetector(): void {
    if (sharedDetector) {
        sharedDetector.dispose();
        sharedDetector = null;
    }
}
