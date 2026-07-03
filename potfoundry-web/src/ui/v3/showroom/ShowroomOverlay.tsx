/**
 * ShowroomOverlay — searchable style library with live preview.
 *
 * Opens on `pf3:showroom` CustomEvent. Renders all 20 styles in a filterable
 * grid with category chips and a search input. Hovering a tile previews it
 * live on the pot (LIVE_PREVIEW=true). Clicking applies and closes.
 *
 * Keyboard: Escape closes and restores. Focus returns to the launcher element
 * (captured at open time) via requestAnimationFrame.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAppStore, useStyle } from '../../../state';
import { type StyleName, type StyleOpts, type StyleCategory } from '../../../state/types';
import { STYLE_REGISTRY, STYLE_CATEGORIES } from '../../../styles/registry';
import { GlassSurface } from '../primitives/GlassSurface';
import StyleThumb from './StyleThumb';
import { getFavorites, pushRecent } from '../panel/workingSet';
import { useTouchMode } from '../mobile/TouchModeContext';
import './ShowroomOverlay.css';

// ─── module flag ──────────────────────────────────────────────────────────────
const LIVE_PREVIEW = true;

// ─── showroom-open flag ────────────────────────────────────────────────────────
let _showroomOpen = false;
/** Returns true while the showroom overlay is open. Consumed by AppUIv3 to gate the D shortcut. */
export function isShowroomOpen(): boolean { return _showroomOpen; }

// ─── helper: all style keys with their display info ──────────────────────────
const ALL_STYLE_KEYS = Object.keys(STYLE_REGISTRY) as StyleName[];

interface StyleSnapshot {
  name: string;
  opts: StyleOpts;
}

// ─── component ────────────────────────────────────────────────────────────────
export const ShowroomOverlay: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<StyleCategory | 'all' | 'mine'>('all');

  const snapshotRef = useRef<StyleSnapshot | null>(null);
  const launcherRef = useRef<Element | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const currentStyle = useStyle();
  const touchMode = useTouchMode();

  // ── open on pf3:showroom event ──────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      launcherRef.current = document.activeElement;
      _showroomOpen = true;
      setOpen(true);
      setSearch('');
      setActiveCategory('all');
    };
    window.addEventListener('pf3:showroom', handler);
    return () => {
      window.removeEventListener('pf3:showroom', handler);
      _showroomOpen = false; // reset on unmount for test isolation
    };
  }, []);

  // ── autofocus search on open ────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [open]);

  // ── close + restore helper ──────────────────────────────────────────────────
  const closeOverlay = useCallback((restoreSnapshot: boolean) => {
    if (restoreSnapshot && snapshotRef.current) {
      const snap = snapshotRef.current;
      snapshotRef.current = null;
      useAppStore.setState({ style: snap });
    } else {
      snapshotRef.current = null;
    }
    _showroomOpen = false;
    setOpen(false);
    const launcher = launcherRef.current;
    if (launcher && 'focus' in launcher) {
      requestAnimationFrame(() => (launcher as HTMLElement).focus());
    }
  }, []);

  // ── ESC closes (handler local to the panel) ─────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeOverlay(true);
      }
    },
    [closeOverlay]
  );

  // ── backdrop click closes ───────────────────────────────────────────────────
  const handleBackdropClick = useCallback(() => {
    closeOverlay(true);
  }, [closeOverlay]);

  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // ── hover preview (LIVE_PREVIEW) ────────────────────────────────────────────
  const handleHoverIntent = useCallback(
    (styleName: StyleName) => {
      if (!LIVE_PREVIEW) return;
      // Snapshot once — guard prevents overwriting the original snapshot
      if (!snapshotRef.current) {
        const current = useAppStore.getState().style;
        snapshotRef.current = { name: current.name, opts: { ...current.opts } };
      }
      useAppStore.getState().setStyle(styleName);
    },
    []
  );

  const handleHoverEnd = useCallback(() => {
    if (!LIVE_PREVIEW) return;
    const snap = snapshotRef.current;
    if (!snap) return;
    useAppStore.setState({ style: snap });
  }, []);

  // ── click applies + closes (no restore) ────────────────────────────────────
  const handleTileClick = useCallback(
    (styleName: StyleName) => {
      useAppStore.getState().setStyle(styleName);
      pushRecent(styleName);
      closeOverlay(false);
    },
    [closeOverlay]
  );

  // ── filtering ───────────────────────────────────────────────────────────────
  const filteredStyles = ALL_STYLE_KEYS.filter((key) => {
    const config = STYLE_REGISTRY[key];
    // Category filter
    if (activeCategory === 'mine') {
      const favs = getFavorites();
      if (!favs.includes(key)) return false;
    } else if (activeCategory !== 'all') {
      if (config.category !== activeCategory) return false;
    }
    // Search filter (name + tags)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const nameMatch = config.name.toLowerCase().includes(q);
      const tagMatch = (config.tags ?? []).some((t) => t.toLowerCase().includes(q));
      if (!nameMatch && !tagMatch) return false;
    }
    return true;
  });

  if (!open) return null;

  return (
    <div
      className="pf3-showroom-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="pf3-showroom-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Style library"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={handlePanelClick}
      >
        <GlassSurface className="pf3-showroom__glass">
          {/* Header: title + search */}
          <div className="pf3-showroom__header">
            <h2 className="pf3-showroom__title pf3-section-voice">Style library</h2>
            <input
              ref={searchInputRef}
              className="pf3-input pf3-showroom__search"
              type="search"
              placeholder="Search styles…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search styles"
            />
          </div>

          {/* Category chips */}
          <div className="pf3-showroom__chips" role="group" aria-label="Filter by category">
            {STYLE_CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`pf3-showroom__chip${activeCategory === key ? ' pf3-showroom__chip--active' : ''}`}
                aria-pressed={activeCategory === key}
                onClick={() => setActiveCategory(key as StyleCategory | 'all')}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={`pf3-showroom__chip${activeCategory === 'mine' ? ' pf3-showroom__chip--active' : ''}`}
              aria-pressed={activeCategory === 'mine'}
              onClick={() => setActiveCategory('mine')}
            >
              ♥ Mine
            </button>
          </div>

          {/* Grid */}
          <div className="pf3-showroom__grid" aria-label="Style tiles">
            {filteredStyles.length === 0 && (
              <div className="pf3-showroom__empty">No styles match</div>
            )}
            {filteredStyles.map((key) => (
              <StyleThumb
                key={key}
                styleName={key}
                size={96}
                selected={currentStyle.name === key}
                onClick={() => handleTileClick(key)}
                onHoverIntent={() => handleHoverIntent(key)}
                onHoverEnd={handleHoverEnd}
                data-testid={`style-thumb-${key}`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="pf3-showroom__footer">
            {touchMode
              ? 'press and hold to preview · tap to apply'
              : 'hover to preview on your pot · click to apply'}
          </div>
        </GlassSurface>
      </div>
    </div>
  );
};

export default ShowroomOverlay;
