import React, { useState } from 'react';
import { ParamRow } from '../primitives/ParamRow';
import { ToggleRow } from '../primitives/ToggleRow';
import { DisclosureSeam } from '../primitives/DisclosureSeam';
import { Button } from '../primitives/Button';
import StyleThumb from '../showroom/StyleThumb';
import { useAppStore } from '../../../state';
import { STYLE_REGISTRY } from '../../../styles/registry';
import type { ParamSchema, StyleName } from '../../../state/types';
import {
  getFavorites,
  toggleFavorite,
  getRecents,
  pushRecent,
} from './workingSet';

export const StyleTab: React.FC = () => {
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyle);
  const setStyleOpt = useAppStore((s) => s.setStyleOpt);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [recents, setRecents] = useState<string[]>(() => getRecents());

  const config = STYLE_REGISTRY[style.name];
  if (!config) return <p className="pf3-label">Unknown style: {style.name}</p>;

  const isCurFav = favorites.includes(style.name);

  const handleToggleFavorite = () => {
    setFavorites(toggleFavorite(style.name));
  };

  const handleTileClick = (name: string) => {
    setStyle(name as StyleName);
    setRecents(pushRecent(name));
  };

  // Build the strip: favorites first, then recents not already in favorites, max 8.
  const favSet = new Set(favorites);
  const recentFiltered = recents.filter((r) => !favSet.has(r));
  const stripItems = [...favorites, ...recentFiltered].slice(0, 8);

  const renderParam = (key: string, schema: ParamSchema): React.ReactNode => {
    const current = style.opts[key] ?? schema.default;
    if (schema.type === 'bool') {
      return (
        <ToggleRow
          key={key}
          label={schema.label}
          checked={Boolean(current)}
          onChange={(v) => setStyleOpt(key, v)}
        />
      );
    }
    return (
      <ParamRow
        key={key}
        label={schema.label}
        unit={schema.unit}
        value={Number(current)}
        min={schema.min ?? 0}
        max={schema.max ?? 1}
        step={schema.step ?? (schema.type === 'int' ? 1 : 0.01)}
        defaultValue={Number(schema.default)}
        onChange={(v) => setStyleOpt(key, schema.type === 'int' ? Math.round(v) : v)}
        onInteractionStart={beginHistoryTransaction}
        onValueCommit={commitHistoryTransaction}
      />
    );
  };

  return (
    <div className="pf3-style-tab">
      {/* Current-style card with ♥ favorite toggle */}
      <div className="pf3-style-tab__current" data-testid="pf3-style-current">
        <div className="pf3-working-set__fav-btn-row">
          <div className="pf3-section-voice">
            {config.name}{' '}
            <span className="pf3-mono pf3-label">{style.name}</span>
          </div>
          <button
            type="button"
            className="pf3-working-set__fav-btn"
            aria-pressed={isCurFav}
            aria-label={isCurFav ? 'Remove from favorites' : 'Add to favorites'}
            onClick={handleToggleFavorite}
            data-testid="pf3-fav-toggle"
          >
            ♥
          </button>
        </div>
        <p className="pf3-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {`${config.description} · ${Object.keys(config.params).length} parameters`}
        </p>
      </div>

      {/* Working set strip — Favorites & recent */}
      <div className="pf3-working-set">
        <div className="pf3-working-set__header">
          <span className="pf3-label">Favorites &amp; recent</span>
          <Button
            variant="tertiary"
            data-testid="pf3-open-showroom"
            onClick={() => window.dispatchEvent(new CustomEvent('pf3:showroom'))}
          >
            all →
          </Button>
        </div>
        {stripItems.length > 0 && (
          <div className="pf3-working-set__strip">
            {stripItems.map((name) => (
              <div key={name} className="pf3-working-set__thumb-wrap">
                {favSet.has(name) && (
                  <span className="pf3-working-set__fav-badge" aria-hidden="true">
                    ♥
                  </span>
                )}
                <StyleThumb
                  styleName={name}
                  size={44}
                  selected={style.name === name}
                  onClick={() => handleTileClick(name)}
                  data-testid={`pf3-strip-thumb-${name}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pf3-section-voice" style={{ marginTop: 'var(--pf3-space-md)' }}>
        Parameters
      </div>
      {Object.entries(config.params).map(([k, s]) => renderParam(k, s))}
      {config.advancedParams && Object.keys(config.advancedParams).length > 0 && (
        <DisclosureSeam
          id="style-advanced"
          summary={`advanced — ${Object.keys(config.advancedParams).length} more`}
        >
          {Object.entries(config.advancedParams).map(([k, s]) => renderParam(k, s))}
        </DisclosureSeam>
      )}
    </div>
  );
};
