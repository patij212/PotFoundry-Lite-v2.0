/**
 * styleThumbnails — adapter + in-memory cache over ThumbnailRenderer.
 *
 * Phase-2 deviation: no IndexedDB. Thumbnails are transient GPU renders;
 * serialising ImageData to storage is expensive and unnecessary for the
 * showroom. The in-memory cache covers the common case (20 styles × 1 size =
 * 20 entries per geometry hash per session; geometry changes produce new
 * cache keys rather than clearing old entries).
 *
 * Concurrency: the cache stores the Promise, not the settled ImageData.
 * Two concurrent getStyleThumbnail() calls for the same key share one
 * in-flight render — only one GPU command is submitted regardless of how
 * many callers race. Null results are NOT cached; they indicate GPU
 * unavailability (jsdom / device not yet injected) and may be retried.
 *
 * Memory: the cache is unbounded across geometry changes.
 * clearThumbnailCache() is a memory pressure valve — currently unused in
 * production (intended for the 100-style expansion). Geometry changes
 * produce new cache keys rather than requiring an explicit clear.
 */

import ThumbnailRenderer from '../../../services/ThumbnailRenderer';
import type { LibraryDesign } from '../../../context/LibraryContext';
import type { GeometryParams } from '../../../state/types';
import { getStyleConfig } from '../../../styles/registry';
import { getStyleId } from '../../../utils/styleParams';

// ---------------------------------------------------------------------------
// Public: geometryHash
// ---------------------------------------------------------------------------

/**
 * Stable cache-key component derived from all 13 GeometryParams values.
 * Field order is fixed so the same geometry always produces the same string.
 */
export function geometryHash(g: GeometryParams): string {
  return [
    g.H, g.top_od, g.bottom_od, g.t_wall, g.t_bottom,
    g.r_drain, g.expn, g.bellAmp, g.bellCenter, g.bellWidth,
    g.spinTurns, g.spinPhase, g.spinCurve,
  ].join(':');
}

// ---------------------------------------------------------------------------
// Internal: default style opts from registry schema
// ---------------------------------------------------------------------------

/** Collect every param's `default` value from params + advancedParams. */
function buildDefaultOpts(styleName: string): Record<string, number> {
  const config = getStyleConfig(styleName);
  if (!config) return {};
  const out: Record<string, number> = {};
  const allParams = { ...config.params, ...(config.advancedParams ?? {}) };
  for (const [key, schema] of Object.entries(allParams)) {
    out[key] = typeof schema.default === 'boolean'
      ? (schema.default ? 1 : 0)
      : schema.default;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Internal: LibraryDesign adapter
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid LibraryDesign for ThumbnailRenderer from adapter inputs.
 *
 * Fields consumed by ThumbnailRenderer.doRender():
 *   style       — drives buildStyleParamPayload (registry key)
 *   opts        — style-specific params (registry defaults) + bell_x/spin_x from geometry
 *   size        — drives buildUniforms (height, top_od, bottom_od, …)
 *   appearance  — absent here; renderer falls back to terracotta preset
 *
 * id, title, created_at satisfy the TypeScript interface but are not
 * read by the renderer; synthetic stable values are used.
 */
function buildDesign(styleName: string, geometry: GeometryParams): LibraryDesign {
  return {
    id: `thumbnail-${styleName}`,
    title: styleName,
    style: styleName,
    created_at: '2000-01-01T00:00:00Z',
    size: {
      height:           geometry.H,
      top_od:           geometry.top_od,
      bottom_od:        geometry.bottom_od,
      wall_thickness:   geometry.t_wall,
      bottom_thickness: geometry.t_bottom,
      drain_radius:     geometry.r_drain,
      flare_exp:        geometry.expn,
    },
    opts: {
      ...buildDefaultOpts(styleName),
      // Geometry-derived opts consumed by buildUniforms via design.opts
      bell_amp:    geometry.bellAmp,
      bell_center: geometry.bellCenter,
      bell_width:  geometry.bellWidth,
      spin_turns:  geometry.spinTurns,
      spin_phase:  geometry.spinPhase,
      spin_curve:  geometry.spinCurve,
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

/**
 * Stores in-flight and settled (non-null) promises.
 * Key format: `${styleId}:${geometryHash}:${size}`
 */
const cache = new Map<string, Promise<ImageData | null>>();

function makeCacheKey(styleName: string, gHash: string, size: number): string {
  return `${getStyleId(styleName)}:${gHash}:${size}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a GPU-rendered thumbnail for the given style + geometry.
 *
 * Cache hit (including in-flight): returns the same Promise without a new render.
 * Null results are NOT cached — they indicate GPU unavailability; callers may retry.
 *
 * @param styleName  Registry key (e.g. 'HarmonicRipple')
 * @param geometry   Current pot geometry (all 13 fields)
 * @param size       Square pixel size for the thumbnail (default 96)
 */
export function getStyleThumbnail(
  styleName: string,
  geometry: GeometryParams,
  size = 96,
): Promise<ImageData | null> {
  const gHash = geometryHash(geometry);
  const key = makeCacheKey(styleName, gHash, size);

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const design = buildDesign(styleName, geometry);
  const renderer = ThumbnailRenderer.getInstance();

  const promise = renderer.renderThumbnail(design, size, size)
    .then((result) => {
      // Do not persist null — GPU may not be ready yet (jsdom / device pending).
      // The next call will attempt a fresh render.
      if (result === null) cache.delete(key);
      return result;
    })
    .catch((err) => {
      // Evict on rejection so callers can retry.
      cache.delete(key);
      throw err;
    });

  cache.set(key, promise);
  return promise;
}

/**
 * Clear the entire thumbnail cache.
 *
 * Call this when the user's geometry changes so subsequent renders use fresh
 * geometry. The showroom is responsible for deciding when to call this (e.g.
 * in a useEffect that tracks geometryHash).
 */
export function clearThumbnailCache(): void {
  cache.clear();
}

/** Test hook — current number of entries in the cache (in-flight + settled). */
export const __cacheSize = (): number => cache.size;
