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
import { GripHorizontal, X, ChevronUp, ChevronDown } from 'lucide-react';
import './MobileBottomSheet.css';

// ============================================================================
// Configuration - All sizes as CSS variables for easy adjustment
// ============================================================================

/** Height of the collapsed sheet showing just the handle */
export const HANDLE_HEIGHT = 72;

/** Height when half-open (percentage of viewport) */
export const HALF_HEIGHT_PERCENT = 50;

/** Maximum height when fully expanded (percentage of viewport) */
export const MAX_HEIGHT_PERCENT = 85;

/** Minimum swipe distance to trigger state change (px) */
const MIN_SWIPE_DISTANCE = 40;

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
    /** Callback when sheet state changes */
    onStateChange?: (state: SheetState) => void;
    /** Initial state of the sheet */
    initialState?: SheetState;
    /** Class name for additional styling */
    className?: string;
}

// ============================================================================
// Component
// ============================================================================

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
    children,
    title = 'Controls',
    subtitle,
    open = true,
    onClose,
    onStateChange,
    initialState = 'half',
    className = '',
}) => {
    // Sheet state
    const [state, setState] = useState<SheetState>(initialState);
    const [currentHeight, setCurrentHeight] = useState<number | null>(null);

    // Touch tracking refs
    const touchStartY = useRef(0);
    const touchStartHeight = useRef(0);
    const isDragging = useRef(false);

    // Calculate heights
    const getStateHeight = useCallback((s: SheetState): number => {
        if (typeof window === 'undefined') return HANDLE_HEIGHT;
        const vh = window.innerHeight;
        switch (s) {
            case 'collapsed': return HANDLE_HEIGHT;
            case 'half': return vh * (HALF_HEIGHT_PERCENT / 100);
            case 'full': return vh * (MAX_HEIGHT_PERCENT / 100);
        }
    }, []);

    // Recalculate on state change and notify parent
    useEffect(() => {
        setCurrentHeight(getStateHeight(state));
        onStateChange?.(state);
    }, [state, getStateHeight, onStateChange]);

    // Handle touch start on the drag handle
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // Get first touch
        const touch = e.touches[0];
        touchStartY.current = touch.clientY;
        touchStartHeight.current = currentHeight ?? getStateHeight(state);
        isDragging.current = true;

        console.log('[Sheet] Touch start at Y:', touch.clientY, 'height:', touchStartHeight.current);
    }, [currentHeight, state, getStateHeight]);

    // Handle touch move
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging.current) return;

        const touch = e.touches[0];
        const deltaY = touchStartY.current - touch.clientY; // Positive = moving finger up = expanding sheet
        const newHeight = touchStartHeight.current + deltaY;

        // Clamp to valid range
        const minH = HANDLE_HEIGHT;
        const maxH = getStateHeight('full');
        const clampedHeight = Math.max(minH, Math.min(maxH, newHeight));

        setCurrentHeight(clampedHeight);
    }, [getStateHeight]);

    // Handle touch end - snap to nearest state
    const handleTouchEnd = useCallback(() => {
        if (!isDragging.current) return;
        isDragging.current = false;

        const height = currentHeight ?? getStateHeight(state);
        const halfH = getStateHeight('half');
        const fullH = getStateHeight('full');
        const collapsedH = HANDLE_HEIGHT;

        // Calculate distance moved
        const deltaY = touchStartY.current - (currentHeight ?? 0);

        console.log('[Sheet] Touch end, height:', height, 'delta:', deltaY);

        // Determine which state to snap to based on current height
        // Use thresholds for snapping
        let newState: SheetState;

        if (height < (collapsedH + halfH) / 2) {
            newState = 'collapsed';
        } else if (height < (halfH + fullH) / 2) {
            newState = 'half';
        } else {
            newState = 'full';
        }

        console.log('[Sheet] Snapping to:', newState);
        setState(newState);
        setCurrentHeight(null); // Let CSS transition take over
    }, [currentHeight, state, getStateHeight]);

    // Toggle state on tap
    const handleToggle = useCallback(() => {
        console.log('[Sheet] Toggle, current state:', state);
        setState(prev => {
            if (prev === 'collapsed') return 'half';
            if (prev === 'half') return 'full';
            return 'collapsed';
        });
    }, [state]);

    // Handle close button
    const handleClose = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        console.log('[Sheet] Close button pressed');
        e.preventDefault();
        e.stopPropagation();
        if (onClose) {
            onClose();
        } else {
            setState('collapsed');
        }
    }, [onClose]);

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

    const displayHeight = currentHeight ?? getStateHeight(state);
    const showBackdrop = state === 'full';
    const isAnimating = currentHeight === null;

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
                className={`pf-mobile-sheet pf-mobile-sheet--${state} ${!isAnimating ? 'pf-mobile-sheet--dragging' : ''} ${className}`}
                style={{ height: `${displayHeight}px` }}
                role="dialog"
                aria-modal={state === 'full'}
                aria-label={title}
            >
                {/* Drag Handle Area */}
                <div
                    className="pf-mobile-sheet__handle"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                >
                    {/* Visual grip indicator */}
                    <div className="pf-mobile-sheet__grip">
                        <div className="pf-mobile-sheet__grip-bar" />
                    </div>

                    {/* Title row */}
                    <div className="pf-mobile-sheet__header">
                        <div className="pf-mobile-sheet__title-area" onClick={handleToggle}>
                            <h2 className="pf-mobile-sheet__title">{title}</h2>
                            {subtitle && <span className="pf-mobile-sheet__subtitle">{subtitle}</span>}
                        </div>

                        {/* Action buttons */}
                        <div className="pf-mobile-sheet__actions">
                            {/* Expand/collapse hint */}
                            <button
                                className="pf-mobile-sheet__action-btn"
                                onClick={handleToggle}
                                aria-label={state === 'full' ? 'Collapse panel' : 'Expand panel'}
                            >
                                {state === 'collapsed' ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                            </button>

                            {/* Close button */}
                            <button
                                className="pf-mobile-sheet__action-btn pf-mobile-sheet__close-btn"
                                onClick={handleClose}
                                onTouchEnd={handleClose}
                                aria-label="Close panel"
                            >
                                <X size={22} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content area - scrollable */}
                <div className="pf-mobile-sheet__content">
                    {children}
                </div>
            </div>
        </>
    );
};

export default MobileBottomSheet;
