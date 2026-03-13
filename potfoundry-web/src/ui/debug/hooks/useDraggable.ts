/**
 * Hook for making elements draggable.
 * 
 * Used by DevConsole float mode to allow mouse-dragging the panel.
 * Persists position across sessions via callback.
 * 
 * @module ui/debug/hooks/useDraggable
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Position {
    x: number;
    y: number;
}

interface UseDraggableOptions {
    /** Initial position */
    initialPosition: Position;
    /** Callback when position changes (for persistence) */
    onPositionChange: (pos: Position) => void;
    /** Whether to constrain to viewport bounds */
    bounds?: 'viewport' | 'none';
}

interface UseDraggableReturn {
    /** Current position */
    position: Position;
    /** Whether currently dragging */
    isDragging: boolean;
    /** Props to spread on the drag handle element */
    dragHandleProps: {
        onMouseDown: (e: React.MouseEvent) => void;
    };
}

/**
 * Makes an element draggable within viewport bounds.
 * Cursor styles should be handled via CSS classes.
 * 
 * @example
 * ```tsx
 * const { position, isDragging, dragHandleProps } = useDraggable({
 *     initialPosition: { x: 100, y: 100 },
 *     onPositionChange: setFloatPosition,
 * });
 * 
 * return (
 *     <div style={{ left: position.x, top: position.y }}>
 *         <div className={isDragging ? 'dragging' : ''} {...dragHandleProps}>
 *             Drag me
 *         </div>
 *     </div>
 * );
 * ```
 */
export function useDraggable({
    initialPosition,
    onPositionChange,
    bounds = 'viewport',
}: UseDraggableOptions): UseDraggableReturn {
    const [position, setPosition] = useState<Position>(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef<Position>({ x: 0, y: 0 });

    // Sync with external position changes
    useEffect(() => {
        setPosition(initialPosition);
    }, [initialPosition.x, initialPosition.y]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Ignore if clicking on buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, a, [role="button"]')) return;

        e.preventDefault();
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        };
    }, [position.x, position.y]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            let newX = e.clientX - dragOffset.current.x;
            let newY = e.clientY - dragOffset.current.y;

            // Constrain to viewport
            if (bounds === 'viewport') {
                const maxX = window.innerWidth - 100; // Keep 100px visible
                const maxY = window.innerHeight - 50;
                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));
            }

            setPosition({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, bounds]);

    // Persist position on drag end
    useEffect(() => {
        if (!isDragging) {
            onPositionChange(position);
        }
    }, [isDragging, position, onPositionChange]);

    return {
        position,
        isDragging,
        dragHandleProps: {
            onMouseDown: handleMouseDown,
        },
    };
}
