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
import { useHaptics } from '../../../hooks/useHaptics';
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

  // Symmetric silhouette: left outer edge (−rOuter from center) descending,
  // right outer edge (+rOuter from center) ascending — mirrors the generatrix.
  const centerX = maxR + 5;

  const leftPath = samples
    .map((sample, i) => {
      const x = centerX - sample.rOuter;
      const y = sample.z + 5;
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(' ');

  const rightPath = [...samples]
    .reverse()
    .map((sample) => {
      const x = centerX + sample.rOuter;
      const y = sample.z + 5;
      return `L ${x} ${y}`;
    })
    .join(' ');

  const fullPath = leftPath + ' ' + rightPath + ' Z';

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
    const { tap } = useHaptics();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const hoverFiredRef = useRef(false);
    const mountedRef = useRef(true);

    // Touch-press-to-preview state
    const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
    const touchPreviewActiveRef = useRef(false);
    // Suppression flags: block the synthetic mouse events browsers fire after touchend
    const suppressNextClickRef = useRef(false);
    const suppressNextMouseEnterRef = useRef(false);

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
      // Suppress the synthetic mouseenter that browsers fire after touchend
      if (suppressNextMouseEnterRef.current) {
        suppressNextMouseEnterRef.current = false;
        return;
      }
      hoverFiredRef.current = false; // reset on each enter
      if (!onHoverIntent) return;

      hoverTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          hoverFiredRef.current = true;
          onHoverIntent();
        }
      }, 150);
    }, [onHoverIntent]);

    const handleMouseLeave = useCallback(() => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      const didFire = hoverFiredRef.current;
      hoverFiredRef.current = false;
      if (onHoverEnd && mountedRef.current && didFire) {
        onHoverEnd();
      }
    }, [onHoverEnd]);

    // Wrapped click that the browser also fires synthetically after touchend
    const handleClick = useCallback(() => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      onClick?.();
    }, [onClick]);

    // ── Touch press-to-preview ───────────────────────────────────────────────
    // 350 ms long-press → onHoverIntent (preview) + haptic tap
    // touchend before timer → quick tap → let synthetic click through (apply)
    // touchend after preview → onHoverEnd (revert) + suppress synthetic click/enter
    // move >8 px → cancel timer (no preview, no suppression)
    // touchcancel → same as cancel; reverts if preview was already active

    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLButtonElement>) => {
        const touch = e.touches[0];
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        touchPreviewActiveRef.current = false;

        touchTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            touchPreviewActiveRef.current = true;
            onHoverIntent?.();
            tap();
          }
        }, 350);
      },
      [onHoverIntent, tap]
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent<HTMLButtonElement>) => {
        if (!touchTimerRef.current || !touchStartPosRef.current) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartPosRef.current.x;
        const dy = touch.clientY - touchStartPosRef.current.y;
        if (dx * dx + dy * dy > 64) {
          // > 8 px movement — cancel
          clearTimeout(touchTimerRef.current);
          touchTimerRef.current = null;
        }
      },
      []
    );

    const handleTouchEnd = useCallback(() => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
      if (touchPreviewActiveRef.current) {
        // Long-press path: revert the preview and suppress the synthetic events
        touchPreviewActiveRef.current = false;
        onHoverEnd?.();
        suppressNextClickRef.current = true;
        suppressNextMouseEnterRef.current = true;
      }
      // Quick-tap path: preview never started → synthetic click fires → onClick applies
    }, [onHoverEnd]);

    const handleTouchCancel = useCallback(() => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
      if (touchPreviewActiveRef.current) {
        touchPreviewActiveRef.current = false;
        onHoverEnd?.();
        // touchcancel does not emit synthetic click, but set flag defensively
        suppressNextClickRef.current = true;
        suppressNextMouseEnterRef.current = true;
      }
    }, [onHoverEnd]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        mountedRef.current = false;
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
        if (touchTimerRef.current) {
          clearTimeout(touchTimerRef.current);
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
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          data-pf3-focusable
          data-testid={dataTestId}
          type="button"
          aria-label={`Select ${displayName} style`}
          aria-pressed={selected}
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
