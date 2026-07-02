import React from 'react';
import { ParamRow } from '../primitives/ParamRow';
import { ToggleRow } from '../primitives/ToggleRow';
import { DisclosureSeam } from '../primitives/DisclosureSeam';
import { useAppStore } from '../../../state';
import { STYLE_REGISTRY } from '../../../styles/registry';
import type { ParamSchema, StyleName } from '../../../state/types';

const STYLE_NAMES = Object.keys(STYLE_REGISTRY);

export const StyleTab: React.FC = () => {
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyle);
  const setStyleOpt = useAppStore((s) => s.setStyleOpt);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const config = STYLE_REGISTRY[style.name];
  if (!config) return <p className="pf3-label">Unknown style: {style.name}</p>;

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
      {/* config.name (display name) heads the card; registry key kept as mono secondary label */}
      <div className="pf3-style-tab__current" data-testid="pf3-style-current">
        <div className="pf3-section-voice">
          {config.name}{' '}
          <span className="pf3-mono pf3-label">{style.name}</span>
        </div>
        <p className="pf3-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {`${config.description} · ${Object.keys(config.params).length} parameters`}
        </p>
      </div>
      {/* Isolated handler: Phase 2 will replace <select> with a showroom overlay — one-line swap */}
      <label className="pf3-label" htmlFor="pf3-style-select">Style</label>
      <select
        id="pf3-style-select"
        aria-label="Style"
        className="pf3-style-tab__select pf3-mono"
        value={style.name}
        onChange={(e) => setStyle(e.target.value as StyleName)}
        data-pf3-focusable=""
      >
        {STYLE_NAMES.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
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
