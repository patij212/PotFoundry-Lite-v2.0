/**
 * Hook for mobile device detection and responsive breakpoints.
 * 
 * Uses CSS media query matching for accurate detection that stays
 * in sync with CSS breakpoints. Configurable breakpoint for flexibility.
 * 
 * @module hooks/useMobile
 */

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// Configuration - Easy to adjust
// ============================================================================

/** Default breakpoint for mobile detection - 768px captures all phones and small tablets */
export const MOBILE_BREAKPOINT = 768;

/** Tablet breakpoint for intermediate layouts */
export const TABLET_BREAKPOINT = 768;

/** Named breakpoints for consistent responsive queries */
export const BREAKPOINTS = {
  /** Phones: 0–480px */
  phone: 480,
  /** Tablets: 0–768px */
  tablet: 768,
  /** Desktop starts above 1024px */
  desktop: 1024,
} as const;

// ============================================================================
// Types
// ============================================================================

export interface UseMobileOptions {
    /** Custom breakpoint width in pixels (default: 480) */
    breakpoint?: number;
    /** Initial value before hydration (default: false) */
    initialValue?: boolean;
}

export interface UseMobileResult {
    /** True if viewport is at or below mobile breakpoint */
    isMobile: boolean;
    /** True if viewport is at or below tablet breakpoint */
    isTablet: boolean;
    /** True if device has touch capabilities */
    hasTouch: boolean;
    /** Current viewport width */
    viewportWidth: number;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Detects if the current viewport is mobile-sized.
 * 
 * Uses matchMedia for reliable detection that syncs with CSS media queries.
 * Re-renders on viewport changes.
 * 
 * @example
 * ```tsx
 * const { isMobile, hasTouch } = useMobile();
 * 
 * if (isMobile) {
 *   return <MobileBottomSheet />;
 * }
 * return <DesktopSidebar />;
 * ```
 */
export function useMobile(options: UseMobileOptions = {}): UseMobileResult {
    const {
        breakpoint = MOBILE_BREAKPOINT,
        initialValue = false,
    } = options;

    // Detect touch capability once
    const [hasTouch] = useState(() => {
        if (typeof window === 'undefined') return false;
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    });

    // Viewport state
    const [viewportWidth, setViewportWidth] = useState(() => {
        if (typeof window === 'undefined') return 1024;
        return window.innerWidth;
    });

    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return initialValue;
        return window.innerWidth <= breakpoint;
    });

    const [isTablet, setIsTablet] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth <= TABLET_BREAKPOINT;
    });

    // Update on resize with debouncing
    const handleResize = useCallback(() => {
        const width = window.innerWidth;
        setViewportWidth(width);
        setIsMobile(width <= breakpoint);
        setIsTablet(width <= TABLET_BREAKPOINT);
    }, [breakpoint]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Initial check
        handleResize();

        // Use matchMedia for efficient detection
        const mobileQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const tabletQuery = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT}px)`);

        const handleMobileChange = (e: MediaQueryListEvent) => {
            setIsMobile(e.matches);
        };

        const handleTabletChange = (e: MediaQueryListEvent) => {
            setIsTablet(e.matches);
        };

        // Modern browsers
        mobileQuery.addEventListener?.('change', handleMobileChange);
        tabletQuery.addEventListener?.('change', handleTabletChange);

        // Also listen to resize for viewport width
        window.addEventListener('resize', handleResize);

        return () => {
            mobileQuery.removeEventListener?.('change', handleMobileChange);
            tabletQuery.removeEventListener?.('change', handleTabletChange);
            window.removeEventListener('resize', handleResize);
        };
    }, [breakpoint, handleResize]);

    return {
        isMobile,
        isTablet,
        hasTouch,
        viewportWidth,
    };
}

export default useMobile;
