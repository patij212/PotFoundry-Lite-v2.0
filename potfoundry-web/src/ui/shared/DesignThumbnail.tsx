/**
 * DesignThumbnail Component
 * 
 * Renders a small pot preview from design parameters using WebGPU.
 * Uses IntersectionObserver for lazy loading to optimize performance.
 * 
 * @module ui/shared/DesignThumbnail
 */

import React, { useRef, useEffect, useState, memo, useMemo } from 'react';
import type { LibraryDesign } from '../../context/LibraryContext';
import ThumbnailRenderer from '../../services/ThumbnailRenderer';
import { ImageOff } from 'lucide-react';
import clsx from 'clsx';
import './DesignThumbnail.css';

interface DesignThumbnailProps {
    design: LibraryDesign;
    width?: number;
    height?: number;
}

/**
 * DesignThumbnail - Renders a 3D pot preview from design parameters using WebGPU
 */
export const DesignThumbnail: React.FC<DesignThumbnailProps> = memo(({
    design,
    width = 150,
    height = 120,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [hasRendered, setHasRendered] = useState(false);
    const [renderError, setRenderError] = useState(false);

    // Scale for device pixel ratio — cap to 2.0 (thumbnails are small enough
    // that 2× is fine even on mobile without straining GPU memory)
    const dpr = useMemo(() => {
        if (typeof window === 'undefined') return 1;
        return Math.min(window.devicePixelRatio || 1, 2.0);
    }, []);
    const renderWidth = Math.floor(width * dpr);
    const renderHeight = Math.floor(height * dpr);

    // IntersectionObserver for lazy loading
    useEffect(() => {
        if (hasRendered) return;
        const container = containerRef.current;
        if (!container) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.1, rootMargin: '50px' }
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [hasRendered]);

    // WebGPU thumbnail rendering
    useEffect(() => {
        if (!isVisible || hasRendered || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('[DesignThumbnail] Failed to get 2D context');
            setRenderError(true);
            setHasRendered(true);
            return;
        }

        // Request render from ThumbnailRenderer service
        const renderer = ThumbnailRenderer.getInstance();
        renderer.renderThumbnail(design, renderWidth, renderHeight)
            .then((imageData) => {
                if (imageData && canvasRef.current) {
                    const ctx2d = canvasRef.current.getContext('2d');
                    if (ctx2d) {
                        ctx2d.putImageData(imageData, 0, 0);
                    }
                } else {
                    setRenderError(true);
                }
                setHasRendered(true);
            })
            .catch((err) => {
                console.error('[DesignThumbnail] Render failed:', err);
                setRenderError(true);
                setHasRendered(true);
            });
    }, [isVisible, hasRendered, design, width, height, renderWidth, renderHeight]);

    return (
        <div
            ref={containerRef}
            className={clsx(
                'pf-design-thumbnail',
                hasRendered && !renderError && 'pf-design-thumbnail--rendered'
            )}
            style={{ width: '100%', height: '100%' }}
        >
            <canvas
                ref={canvasRef}
                width={renderWidth}
                height={renderHeight}
                className="pf-design-thumbnail__canvas"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {!hasRendered && (
                <div className="pf-design-thumbnail__placeholder">
                    <div className="pf-design-thumbnail__loader" />
                </div>
            )}
            {renderError && (
                <div className="pf-design-thumbnail__error">
                    <ImageOff className="pf-design-thumbnail__error-icon" size={24} />
                    <span>Preview unavailable</span>
                </div>
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Only skip re-render if same design ID - ensures each design gets its own thumbnail
    return prevProps.design.id === nextProps.design.id &&
        prevProps.width === nextProps.width &&
        prevProps.height === nextProps.height;
});

export default DesignThumbnail;
