import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../primitives/Button';
import { Certificate } from './Certificate';
import { useAppStore } from '../../../state';
import { useParametricExport } from '../../../hooks/useParametricExport';
import { useExportTier } from '../../../hooks/useExportTier';
import { deriveDefaultFilename, estimateExport, formatBytes } from './exportName';
import type { ParametricExportStats } from '../../../hooks/useParametricExport';
import './ExportFooter.css';

export const ExportFooter: React.FC = () => {
  const styleName = useAppStore((s) => s.style.name);
  const H = useAppStore((s) => s.geometry.H);
  const nTheta = useAppStore((s) => s.mesh.export_n_theta);
  const nZ = useAppStore((s) => s.mesh.export_n_z);
  const exportFilename = useAppStore((s) => s.ui.exportFilename);

  const { progress, stats, isAvailable, exportSTL } = useParametricExport();
  const { checkExportAllowed, recordExport } = useExportTier();

  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedStats, setCapturedStats] = useState<ParametricExportStats | null>(null);
  const firing = progress.status === 'initializing' || progress.status === 'generating';
  const { tris, bytes } = estimateExport(nTheta, nZ);
  const filename = exportFilename ?? deriveDefaultFilename(styleName, H);
  const tier = checkExportAllowed();

  const fire = useCallback(async () => {
    if (firing || !tier.canExport) return;
    setDone(null);
    setError(null);
    setCapturedStats(null);
    try {
      await exportSTL(filename);
      await recordExport();
      setDone(filename);
      // Capture stats snapshot at fire-resolution time so late store changes can't swap it
      if (stats) {
        setCapturedStats(stats);
      }
    } catch {
      setError('Export failed — check the console, then try again');
    }
  }, [firing, tier.canExport, exportSTL, filename, recordExport, stats]);

  useEffect(() => {
    const onShortcut = () => void fire();
    window.addEventListener('pf3:download', onShortcut);
    return () => window.removeEventListener('pf3:download', onShortcut);
  }, [fire]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setDone(null);
      setCapturedStats(null);
    }, 12000);
    return () => clearTimeout(t);
  }, [done]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <div className="pf3-export-footer">
      <div className="pf3-export-footer__meta">
        <span className="pf3-label">export</span>
        <span className="pf3-mono pf3-export-footer__est">
          ≈ {tris.toLocaleString('en-US')} tris · {formatBytes(bytes)}
        </span>
      </div>
      {firing ? (
        <div className="pf3-export-footer__progress" aria-live="polite">
          <span className="pf3-mono">{progress.message || 'firing…'}</span>
          <div className="pf3-export-footer__bar">
            <div className="pf3-export-footer__fill" style={{ width: `${progress.progress}%` }} />
          </div>
        </div>
      ) : tier.canExport ? (
        <>
          {capturedStats && done && (
            <Certificate filename={done} stats={capturedStats} />
          )}
          <Button variant="primary" onClick={() => void fire()} disabled={!isAvailable} data-testid="pf3-export-cta">
            Export STL
          </Button>
          {error && (
            <span className="pf3-export-footer__error" role="alert">
              {error}
            </span>
          )}
        </>
      ) : (
        <Button
          variant="primary"
          onClick={() => window.dispatchEvent(new CustomEvent('pf3:upgrade'))}
          data-testid="pf3-upgrade-cta"
        >
          Continue with Pro
        </Button>
      )}
    </div>
  );
};
