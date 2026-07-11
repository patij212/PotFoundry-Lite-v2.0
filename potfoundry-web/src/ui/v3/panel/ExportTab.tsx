import React from 'react';
import { useAppStore } from '../../../state';
import { useExportTier } from '../../../hooks/useExportTier';
import { estimateExport, formatBytes, deriveDefaultFilename, FIDELITIES, deriveFidelityKey } from './exportName';
import { FORMAT_OPTIONS, normalizeExportFormat } from './exportFormat';
import { KilnLog } from './KilnLog';
import './ExportFooter.css';

export const ExportTab: React.FC = () => {
  const mesh = useAppStore((s) => s.mesh);
  const setQualityPreset = useAppStore((s) => s.setQualityPreset);
  const exportFilename = useAppStore((s) => s.ui.exportFilename);
  const setExportFilename = useAppStore((s) => s.setExportFilename);
  const exportFormat = useAppStore((s) => normalizeExportFormat(s.ui.exportFormat));
  const setExportFormat = useAppStore((s) => s.setExportFormat);
  const styleName = useAppStore((s) => s.style.name);
  const H = useAppStore((s) => s.geometry.H);
  const { checkExportAllowed, isPro, isAuthConfigured } = useExportTier();
  const tier = checkExportAllowed();

  const activeKey = deriveFidelityKey(mesh);

  return (
    <div className="pf3-export-tab">
      <div className="pf3-section-voice">Fidelity</div>
      <div role="radiogroup" aria-label="Fidelity">
        {FIDELITIES.map((f) => {
          const { tris, bytes } = estimateExport(f.nTheta, f.nZ);
          const selected = activeKey === f.key;
          return (
            <div key={f.key}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`pf3-fidelity${selected ? ' pf3-fidelity--on' : ''}`}
                onClick={() => setQualityPreset(f.key)}
                data-pf3-focusable=""
              >
                <span className="pf3-fidelity__name">
                  {f.name}
                  {f.key === 'ultra' && <span className="pf3-prochip">PRO</span>}
                </span>
                <span className="pf3-fidelity__purpose">{f.purpose}</span>
                <span className="pf3-mono pf3-fidelity__est">
                  ≈ {tris.toLocaleString('en-US')} · {formatBytes(bytes)}
                </span>
              </button>
              {f.key === 'ultra' && selected && (
                <div className="pf3-label" style={{ marginTop: '4px', marginLeft: '10px' }}>
                  capped by the mesh budget on most pots
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pf3-section-voice" style={{ marginTop: 'var(--pf3-space-md)' }}>File</div>
      <label className="pf3-label" htmlFor="pf3-filename">Filename</label>
      <input
        id="pf3-filename"
        aria-label="Filename"
        className="pf3-input pf3-mono"
        value={exportFilename ?? ''}
        placeholder={deriveDefaultFilename(styleName, H)}
        onChange={(e) => setExportFilename(e.target.value || null)}
        data-pf3-focusable=""
      />

      <div className="pf3-format" role="radiogroup" aria-label="Format">
        {FORMAT_OPTIONS.map((format) => {
          const selected = exportFormat === format.value;
          return (
            <button
              key={format.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`pf3-seg__item${selected ? ' pf3-seg__item--on' : ''}`}
              onClick={() => setExportFormat(format.value)}
              data-pf3-focusable=""
            >
              {format.label}
            </button>
          );
        })}
      </div>

      {!isPro && isAuthConfigured && tier.exportsRemaining !== null && (
        <div className="pf3-quota-display">
          <svg className="pf3-quota-arc" width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="var(--pf3-gold)"
              strokeWidth="1.5"
              strokeDasharray={`${(tier.exportsRemaining / (tier.totalExports ?? 10)) * (2 * Math.PI * 10)} ${2 * Math.PI * 10}`}
              strokeDashoffset="0"
              transform="rotate(-90 12 12)"
              style={{ transition: 'stroke-dasharray var(--pf3-dur-control) var(--pf3-ease-move)' }}
            />
          </svg>
          <p className="pf3-quota-text">
            {tier.exportsRemaining} of {tier.totalExports ?? 10} free exports left this month
          </p>
        </div>
      )}

      <KilnLog />
    </div>
  );
};
