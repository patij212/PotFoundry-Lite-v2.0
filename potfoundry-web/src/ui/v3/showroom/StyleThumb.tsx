/**
 * StyleThumb Component
 *
 * Lazy thumbnail tile for the showroom. Shows a GPU-rendered thumbnail image
 * from getStyleThumbnail, with a fallback silhouette (SVG generatrix) at 0.35
 * opacity while loading or on GPU unavailability. Features:
 *
 * - IntersectionObserver lazy loading (0.1 threshold, 50px margin)
 * - Canvas putImageData on resolve
 * - Gold border ring when selected
 * - 150ms hover timer → onHoverIntent (fires once), leave → onHoverEnd
 * - data-pf3-focusable attribute
 * - Display name label from STYLE_REGISTRY
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useGeometry, type GeometryParams } from '../../../state';
import { STYLE_REGISTRY } from '../../../styles/registry';
import { getStyleThumbnail } from './styleThumbnails';
import { sampleProfile } from '../blueprint/profileSampler';
import clsx from 'clsx';
import './StyleThumb.css';

interface StyleThumbProps {
  styleName: string;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
  onHoverIntent?: () => void;
  onHoverEnd?: () => void;
  'data-testid'?: string;
}

/**
 * Generate a silent silhouette SVG (generatrix) from the current pot geometry.
 * Returns an SVG element showing outer profile at 0.35 opacity (gold).
 */
function renderSilhouetteSVG(
  styleName: string,
  geometry: GeometryParams,
  size: number = 96
): React.ReactNode {
  const profile = sampleProfile(geometry);
  const { samples, maxR, H } = profile;

  if (!samples || samples.length === 0) {
    return null;
  }

  // SVG viewBox: 0 to maxR × 2 on X (outer + inner), 0 to H on Y
  const viewBoxWidth = maxR * 2 + 10;
  const viewBoxHeight = H + 10;

  // Path data for outer profile (left half, mirrored to right)
  const outerPath = samples
    .map((sample, i) => {
      const x = maxR + 5 - sample.rOuter; // Left half: x decreases
      const y = sample.z + 5;
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(' ');

  // Continue with inner profile back (right half, ascending)
  const innerPath = [...samples]
    .reverse()
    .map((sample, i) => {
      const x = maxR + 5 - sample.rInner; // Inner: slightly inset
      const y = sample.z + 5;
      return i === 0 ? `L ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(' ');

  const fullPath = outerPath + ' ' + innerPath + ' Z';

  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      className="pf3-style-thumb__silhouette"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${styleName} silhouette`}
    >
      <path d={fullPath} fill="none" stroke="currentColor" strokeWidth="0.5" opacity={0.35} />
    </svg>
  );
}

/**
 * StyleThumb: lazy thumbnail tile for the showroom
 */
const StyleThumb = React.forwardRef<HTMLButtonElement, StyleThumbProps>(
  (
    {
      styleName,
      size = 96,
      selected = false,
      onClick,
      onHoverIntent,
      onHoverEnd,
      'data-testid': dataTestId,
    },
    ref
  ) => {
    const geometry = useGeometry();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const mountedRef = useRef(true);

    const [isVisible, setIsVisible] = useState(false);
    const [imageData, setImageData] = useState<ImageData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const displayName = useMemo(() => {
      const config = STYLE_REGISTRY[styleName];
      return config?.name || styleName;
    }, [styleName]);

    // IntersectionObserver for lazy loading
    useEffect(() => {
      const container = containerRef.current;
      if (!container || isVisible) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && mountedRef.current) {
            setIsVisible(true);
          }
        },
        { threshold: 0.1, rootMargin: '50px' }
      );

      observer.observe(container);
      return () => observer.disconnect();
    }, [isVisible]);

    // Fetch thumbnail on visibility
    useEffect(() => {
      if (!isVisible) return;

      setIsLoading(true);
      const promise = getStyleThumbnail(styleName, geometry, size);

      let isMounted = true;

      promise
        .then((result) => {
          if (!isMounted || !mountedRef.current) return;
          setImageData(result);
          setIsLoading(false);
        })
        .catch((err) => {
          if (!isMounted || !mountedRef.current) return;
          console.error('[StyleThumb] Failed to load thumbnail:', err);
          setIsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }, [isVisible, styleName, geometry, size]);

    // Apply ImageData to canvas after resolve
    useEffect(() => {
      if (!imageData || !canvasRef.current || !mountedRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(imageData, 0, 0);
      }
    }, [imageData]);

    // Hover timer management
    const handleMouseEnter = useCallback(() => {
      if (!onHoverIntent) return;

      hoverTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          onHoverIntent();
        }
      }, 150);
    }, [onHoverIntent]);

    const handleMouseLeave = useCallback(() => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (onHoverEnd && mountedRef.current) {
        onHoverEnd();
      }
    }, [onHoverEnd]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        mountedRef.current = false;
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
      };
    }, []);

    const silhouette = useMemo(
      () => renderSilhouetteSVG(styleName, geometry, size),
      [styleName, geometry, size]
    );

    return (
      <div ref={containerRef} className="pf3-style-thumb__container">
        <button
          ref={ref}
          className={clsx(
            'pf3-style-thumb',
            selected && 'pf3-style-thumb--selected'
          )}
          onClick={onClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          data-pf3-focusable
          data-testid={dataTestId}
          type="button"
          aria-label={`Select ${displayName} style`}
        >
          <div className="pf3-style-thumb__content">
            <canvas
              ref={canvasRef}
              width={size}
              height={size}
              className="pf3-style-thumb__canvas"
            />
            {(!isVisible || isLoading || !imageData) && (
              <div className="pf3-style-thumb__fallback">
                {silhouette}
              </div>
            )}
          </div>
          <div className="pf3-style-thumb__label">{displayName}</div>
        </button>
      </div>
    );
  }
);

StyleThumb.displayName = 'StyleThumb';

export default StyleThumb;
