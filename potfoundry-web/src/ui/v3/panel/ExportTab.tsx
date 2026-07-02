import React from 'react';
import { useAppStore } from '../../../state';
import { useExportTier } from '../../../hooks/useExportTier';
import { estimateExport, formatBytes, deriveDefaultFilename } from './exportName';
import './ExportFooter.css';

// Real preset resolutions from QUALITY_PRESETS in src/state/slices/mesh.ts.
// preview_* values are included to distinguish high (preview 1024×512) from
// ultra (preview 2048×1024) — both share the same export_n_theta/export_n_z.
const FIDELITIES = [
  { key: 'draft',    name: 'Draft',    purpose: 'quick look',            nTheta: 512,  nZ: 256,  previewNTheta: 256,  previewNZ: 128  },
  { key: 'standard', name: 'Standard', purpose: 'everyday prints',       nTheta: 1024, nZ: 512,  previewNTheta: 512,  previewNZ: 256  },
  { key: 'high',     name: 'High',     purpose: 'print-ready · 0.20 mm', nTheta: 2048, nZ: 1024, previewNTheta: 1024, previewNZ: 512  },
  { key: 'ultra',    name: 'Ultra',    purpose: 'exhibition · 0.05 mm',  nTheta: 2048, nZ: 1024, previewNTheta: 2048, previewNZ: 1024 },
] as const;

export const ExportTab: React.FC = () => {
  const mesh             = useAppStore((s) => s.mesh);
  const setQualityPreset = useAppStore((s) => s.setQualityPreset);
  const exportFilename   = useAppStore((s) => s.ui.exportFilename);
  const setExportFilename = useAppStore((s) => s.setExportFilename);
  const styleName        = useAppStore((s) => s.style.name);
  const H                = useAppStore((s) => s.geometry.H);
  const { checkExportAllowed, isPro, isAuthConfigured } = useExportTier();
  const tier = checkExportAllowed();

  const activeKey =
    FIDELITIES.find(
      (f) =>
        f.nTheta === mesh.export_n_theta &&
        f.nZ     === mesh.export_n_z     &&
        f.previewNTheta === mesh.preview_n_theta &&
        f.previewNZ     === mesh.preview_n_z
    )?.key ?? 'custom';

  return (
    <div className="pf3-export-tab">
      <div className="pf3-section-voice">Fidelity</div>
      <div role="radiogroup" aria-label="Fidelity">
        {FIDELITIES.map((f) => {
          const { tris, bytes } = estimateExport(f.nTheta, f.nZ);
          const selected = activeKey === f.key;
          return (
            <button
              key={f.key}
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

      <div className="pf3-format" role="tablist" aria-label="Format">
        <button type="button" role="tab" aria-selected="true"  className="pf3-seg__item pf3-seg__item--on">STL</button>
        <button type="button" role="tab" aria-selected="false" className="pf3-seg__item" disabled
          title="Coming with the certificate — Phase 2">3MF</button>
        <button type="button" role="tab" aria-selected="false" className="pf3-seg__item" disabled
          title="Coming with the certificate — Phase 2">OBJ</button>
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
    </div>
  );
};
