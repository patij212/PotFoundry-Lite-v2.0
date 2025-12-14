/**
 * Mobile Bottom Sheet Component
 * 
 * A swipe-up panel for mobile that slides from the bottom of the screen.
 * Supports three states: collapsed, half-open, and fully expanded.
 * Uses CSS variables for easy customization.
 * 
 * @module ui/layout/MobileBottomSheet
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GripHorizontal, X, ChevronUp } from 'lucide-react';
import './MobileBottomSheet.css';

// ============================================================================
// Configuration - All sizes as CSS variables for easy adjustment
// ============================================================================

/** Height of the collapsed sheet showing just the handle */
export const HANDLE_HEIGHT = 56;

/** Height when half-open (percentage of viewport) */
export const HALF_HEIGHT_PERCENT = 45;

/** Maximum height when fully expanded (percentage of viewport) */
export const MAX_HEIGHT_PERCENT = 90;

/** Velocity threshold for swipe gestures (px/ms) */
const SWIPE_VELOCITY_THRESHOLD = 0.3;

/** Minimum swipe distance to trigger state change (px) */
const MIN_SWIPE_DISTANCE = 30;

// ============================================================================
// Types
// ============================================================================

export type SheetState = 'collapsed' | 'half' | 'full';

export interface MobileBottomSheetProps {
    /** Content to render inside the sheet */
    children: React.ReactNode;
    /** Title shown in the handle bar */
    title?: string;
    /** Subtitle shown below title */
    subtitle?: string;
    /** Whether the sheet is visible */
    open?: boolean;
    /** Callback when sheet is closed */
    onClose?: () => void;
    /** Initial state of the sheet */
    initialState?: SheetState;
    /** Class name for additional styling */
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Bottom sheet component for mobile interfaces.
 * 
 * Features:
 * - Three states: collapsed (handle only), half, full
 * - Swipe up/down gestures
 * - Tap on handle to toggle
 * - Backdrop when expanded
 * 
 * @example
 * ```tsx
 * <MobileBottomSheet title="Controls" open={panelOpen}>
 *   <ControlPanels />
 * </MobileBottomSheet>
 * ```
 */
export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
    children,
    title = 'Controls',
    subtitle,
    open = true,
    onClose,
    initialState = 'half',
    className = '',
}) => {
    // Sheet state
    const [state, setState] = useState<SheetState>(initialState);
    const [isDragging, setIsDragging] = useState(false);
    const [dragDelta, setDragDelta] = useState(0);

    // Refs for gesture handling
    const sheetRef = useRef<HTMLDivElement>(null);
    const startYRef = useRef(0);
    const startTimeRef = useRef(0);
    const lastStateRef = useRef<SheetState>(initialState);

    // Calculate actual heights
    const getStateHeight = useCallback((s: SheetState): number => {
        if (typeof window === 'undefined') return HANDLE_HEIGHT;
        const vh = window.innerHeight;
        switch (s) {
            case 'collapsed': return HANDLE_HEIGHT;
            case 'half': return vh * (HALF_HEIGHT_PERCENT / 100);
            case 'full': return vh * (MAX_HEIGHT_PERCENT / 100);
        }
    }, []);

    // Gesture handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // Only handle touches on the handle area
        const target = e.target as HTMLElement;
        if (!target.closest('.pf-mobile-sheet__handle')) return;

        setIsDragging(true);
        startYRef.current = e.touches[0].clientY;
        startTimeRef.current = Date.now();
        lastStateRef.current = state;
    }, [state]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging) return;

        const currentY = e.touches[0].clientY;
        const delta = startYRef.current - currentY; // Positive = swiping up
        setDragDelta(delta);
    }, [isDragging]);

    const handleTouchEnd = useCallback(() => {
        if (!isDragging) return;

        const elapsed = Date.now() - startTimeRef.current;
        const velocity = dragDelta / elapsed;

        // Determine new state based on gesture
        let newState = lastStateRef.current;

        if (Math.abs(dragDelta) > MIN_SWIPE_DISTANCE || Math.abs(velocity) > SWIPE_VELOCITY_THRESHOLD) {
            if (dragDelta > 0) {
                // Swiping up - expand
                newState = lastStateRef.current === 'collapsed' ? 'half' : 'full';
            } else {
                // Swiping down - collapse
                newState = lastStateRef.current === 'full' ? 'half' : 'collapsed';
            }
        }

        setState(newState);
        setIsDragging(false);
        setDragDelta(0);
    }, [isDragging, dragDelta]);

    // Handle tap on collapsed state
    const handleHandleTap = useCallback(() => {
        if (!isDragging && Math.abs(dragDelta) < 5) {
            // Cycle through states on tap
            setState(prev => {
                if (prev === 'collapsed') return 'half';
                if (prev === 'half') return 'full';
                return 'collapsed';
            });
        }
    }, [isDragging, dragDelta]);

    // Calculate current height during drag
    const getCurrentHeight = useCallback(() => {
        const baseHeight = getStateHeight(state);
        if (isDragging) {
            const newHeight = baseHeight + dragDelta;
            const maxH = getStateHeight('full');
            const minH = HANDLE_HEIGHT;
            return Math.max(minH, Math.min(maxH, newHeight));
        }
        return baseHeight;
    }, [state, isDragging, dragDelta, getStateHeight]);

    // Keyboard escape handling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && state !== 'collapsed') {
                setState('collapsed');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state]);

    if (!open) return null;

    const height = getCurrentHeight();
    const showBackdrop = state === 'full';

    return (
        <>
            {/* Backdrop for full-screen state */}
            {showBackdrop && (
                <div
                    className="pf-mobile-sheet__backdrop"
                    onClick={() => setState('half')}
                    aria-hidden="true"
                />
            )}

            {/* Sheet container */}
            <div
                ref={sheetRef}
                className={`pf-mobile-sheet pf-mobile-sheet--${state} ${isDragging ? 'pf-mobile-sheet--dragging' : ''} ${className}`}
                style={{
                    height: `${height}px`,
                    '--sheet-handle-height': `${HANDLE_HEIGHT}px`,
                } as React.CSSProperties}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                role="dialog"
                aria-modal={state === 'full'}
                aria-label={title}
            >
                {/* Handle bar */}
                <div
                    className="pf-mobile-sheet__handle"
                    onClick={handleHandleTap}
                    role="button"
                    aria-label={`Toggle ${title} panel`}
                    tabIndex={0}
                >
                    <div className="pf-mobile-sheet__handle-bar">
                        <GripHorizontal size={20} />
                    </div>

                    <div className="pf-mobile-sheet__handle-content">
                        <div className="pf-mobile-sheet__title-group">
                            <h2 className="pf-mobile-sheet__title">{title}</h2>
                            {subtitle && (
                                <span className="pf-mobile-sheet__subtitle">{subtitle}</span>
                            )}
                        </div>

                        <div className="pf-mobile-sheet__handle-actions">
                            {state === 'collapsed' && (
                                <ChevronUp size={20} className="pf-mobile-sheet__expand-hint" />
                            )}
                            {state !== 'collapsed' && onClose && (
                                <button
                                    className="pf-mobile-sheet__close-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClose();
                                    }}
                                    aria-label="Close panel"
                                >
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content area */}
                <div className="pf-mobile-sheet__content">
                    {children}
                </div>
            </div>
        </>
    );
};

export default MobileBottomSheet;
