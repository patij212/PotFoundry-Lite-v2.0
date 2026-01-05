/**
 * Resize handle component for resizable panels.
 * 
 * @module ui/debug/components/ResizeHandle
 */

import React, { useCallback, useEffect, useState } from 'react';

interface ResizeHandleProps {
    direction: 'horizontal' | 'vertical';
    onResize: (delta: number) => void;
    onResizeEnd?: () => void;
    className?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
    direction,
    onResize,
    onResizeEnd,
    className,
}) => {
    const [isResizing, setIsResizing] = useState(false);
    const [startPos, setStartPos] = useState(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        setStartPos(direction === 'vertical' ? e.clientY : e.clientX);
    }, [direction]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;

        const currentPos = direction === 'vertical' ? e.clientY : e.clientX;
        const delta = startPos - currentPos;
        setStartPos(currentPos);
        onResize(delta);
    }, [isResizing, direction, startPos, onResize]);

    const handleMouseUp = useCallback(() => {
        if (isResizing) {
            setIsResizing(false);
            onResizeEnd?.();
        }
    }, [isResizing, onResizeEnd]);

    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = direction === 'vertical' ? 'ns-resize' : 'ew-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMove, handleMouseUp, direction]);

    return (
        <div
            className={`pf-resize-handle pf-resize-handle--${direction} ${isResizing ? 'pf-resize-handle--active' : ''} ${className ?? ''}`}
            onMouseDown={handleMouseDown}
        >
            <div className="pf-resize-handle-grip">
                {direction === 'vertical' ? '⋯' : '⋮'}
            </div>
        </div>
    );
};

/**
 * Hook for managing resizable panel state.
 */
export function useResizable(options: {
    initial: number;
    min: number;
    max: number;
    direction: 'horizontal' | 'vertical';
    persist?: string;
}) {
    const { initial, min, max, direction, persist } = options;

    const [size, setSize] = useState(() => {
        if (persist) {
            try {
                const saved = localStorage.getItem(persist);
                if (saved) {
                    const value = parseInt(saved, 10);
                    if (!isNaN(value)) return Math.max(min, Math.min(max, value));
                }
            } catch { /* ignore */ }
        }
        return initial;
    });

    const handleResize = useCallback((delta: number) => {
        setSize(prev => {
            const next = Math.max(min, Math.min(max, prev + delta));
            return next;
        });
    }, [min, max]);

    const handleResizeEnd = useCallback(() => {
        if (persist) {
            try {
                localStorage.setItem(persist, String(size));
            } catch { /* ignore */ }
        }
    }, [persist, size]);

    return { size, handleResize, handleResizeEnd };
}
