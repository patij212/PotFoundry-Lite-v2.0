import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geometryHash, getStyleThumbnail, clearThumbnailCache, __cacheSize } from './styleThumbnails';
import { DEFAULT_GEOMETRY } from '../../../state/types';

// ---------------------------------------------------------------------------
// Mock ThumbnailRenderer — avoids real GPU / device dependency
// ---------------------------------------------------------------------------

const mockRenderThumbnail = vi.fn();

vi.mock('../../../services/ThumbnailRenderer', () => ({
  default: {
    getInstance: () => ({ renderThumbnail: mockRenderThumbnail }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ImageData is not available in jsdom; use a plain stub for identity checks.
function make1x1ImageData(): ImageData {
  return { width: 1, height: 1, data: new Uint8ClampedArray(4), colorSpace: 'srgb' } as unknown as ImageData;
}

// ---------------------------------------------------------------------------
// geometryHash
// ---------------------------------------------------------------------------

describe('geometryHash', () => {
  it('returns a stable value for equivalent geometry objects', () => {
    expect(geometryHash(DEFAULT_GEOMETRY)).toBe(geometryHash({ ...DEFAULT_GEOMETRY }));
  });

  it('differs when H changes', () => {
    expect(geometryHash(DEFAULT_GEOMETRY)).not.toBe(
      geometryHash({ ...DEFAULT_GEOMETRY, H: DEFAULT_GEOMETRY.H + 1 }),
    );
  });

  it('differs for each of the 13 geometry fields', () => {
    const baseline = geometryHash(DEFAULT_GEOMETRY);
    const mutations: Partial<typeof DEFAULT_GEOMETRY>[] = [
      { H: 200 }, { top_od: 200 }, { bottom_od: 100 }, { t_wall: 5 },
      { t_bottom: 5 }, { r_drain: 15 }, { expn: 2.0 }, { bellAmp: 0.1 },
      { bellCenter: 0.6 }, { bellWidth: 0.3 }, { spinTurns: 1 },
      { spinPhase: 45 }, { spinCurve: 2 },
    ];
    for (const m of mutations) {
      expect(geometryHash({ ...DEFAULT_GEOMETRY, ...m })).not.toBe(baseline);
    }
  });
});

// ---------------------------------------------------------------------------
// getStyleThumbnail
// ---------------------------------------------------------------------------

describe('getStyleThumbnail', () => {
  beforeEach(() => {
    clearThumbnailCache();
    mockRenderThumbnail.mockReset();
  });

  it('two calls with the same (style, geometry) trigger only one render', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await Promise.all([
      getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY),
      getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY),
    ]);
    expect(mockRenderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('concurrent calls return the same Promise object (promise-level dedup)', () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    const p1 = getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    const p2 = getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(p1).toBe(p2);
  });

  it('different geometry triggers separate renders', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    await getStyleThumbnail('HarmonicRipple', { ...DEFAULT_GEOMETRY, H: 200 });
    expect(mockRenderThumbnail).toHaveBeenCalledTimes(2);
  });

  it('null result is not cached — second call re-renders', async () => {
    const img = make1x1ImageData();
    mockRenderThumbnail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(img);
    const r1 = await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(r1).toBeNull();
    const r2 = await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(r2).toBe(img);
    expect(mockRenderThumbnail).toHaveBeenCalledTimes(2);
  });

  it('different style names trigger separate renders', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    await getStyleThumbnail('FourierBloom', DEFAULT_GEOMETRY);
    expect(mockRenderThumbnail).toHaveBeenCalledTimes(2);
  });

  it('different size triggers a separate render', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY, 96);
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY, 128);
    expect(mockRenderThumbnail).toHaveBeenCalledTimes(2);
  });

  it('size defaults to 96', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(mockRenderThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'HarmonicRipple' }),
      96,
      96,
    );
  });

  it('resolved ImageData is passed through to the caller', async () => {
    const img = make1x1ImageData();
    mockRenderThumbnail.mockResolvedValue(img);
    const result = await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(result).toBe(img);
  });

  it('a settled hit returns the same ImageData without a re-render', async () => {
    const img = make1x1ImageData();
    mockRenderThumbnail.mockResolvedValue(img);
    const r1 = await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    const r2 = await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(r1).toBe(img);
    expect(r2).toBe(img);
    expect(mockRenderThumbnail).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// clearThumbnailCache
// ---------------------------------------------------------------------------

describe('clearThumbnailCache', () => {
  beforeEach(() => {
    clearThumbnailCache();
    mockRenderThumbnail.mockReset();
  });

  it('resets __cacheSize to 0', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    clearThumbnailCache();
    expect(__cacheSize()).toBe(0);
  });

  it('forces a re-render after clearing', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    clearThumbnailCache();
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(mockRenderThumbnail).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// __cacheSize
// ---------------------------------------------------------------------------

describe('__cacheSize', () => {
  beforeEach(() => {
    clearThumbnailCache();
    mockRenderThumbnail.mockReset();
  });

  it('starts at 0', () => {
    expect(__cacheSize()).toBe(0);
  });

  it('increments synchronously as new renders are started', () => {
    // Use a never-resolving promise so we can check size before settle
    mockRenderThumbnail.mockReturnValue(new Promise<ImageData | null>(() => {}));
    getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(__cacheSize()).toBe(1);
    getStyleThumbnail('FourierBloom', DEFAULT_GEOMETRY);
    expect(__cacheSize()).toBe(2);
  });

  it('same key does not increment the count twice', async () => {
    mockRenderThumbnail.mockResolvedValue(make1x1ImageData());
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    await getStyleThumbnail('HarmonicRipple', DEFAULT_GEOMETRY);
    expect(__cacheSize()).toBe(1);
  });
});
