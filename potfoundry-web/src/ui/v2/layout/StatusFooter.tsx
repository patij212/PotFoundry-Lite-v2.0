/**
 * StatusFooter — Persistent stats bar, download button, and export progress.
 *
 * Lives at the bottom of SidebarV2, visible across all tabs.
 * Displays mesh stats (tris, verts, generation time), a full-width
 * Download button that triggers export, and animated progress/completion UI.
 *
 * Export path priority: Parametric (GPU) > GPU Grid > Legacy CPU.
 *
 * @module ui/v2/layout/StatusFooter
 */

import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { Triangle, Box, Activity, Download, Cpu, Zap, Loader2 } from 'lucide-react';
import { ButtonV2 } from '../controls/ButtonV2';
import { useAppStore } from '../../../state';
import { useExport } from '../../../hooks/useExport';
import { useGPUExport } from '../../../hooks/useGPUExport';
import { useParametricExport } from '../../../hooks/useParametricExport';
import { useAnnounce } from '../shared/Announcer';
import { useConfidence } from '../onboarding/useConfidence';
import { useHaptics } from '../hooks/useHaptics';
import type { ExportFormat } from '../../../geometry';
import './StatusFooter.css';

// ============================================================================
// Constants
// ============================================================================

const COMPLETION_DISPLAY_MS = 5000;

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatTime(ms: number): string {
  if (ms < 1) return '<1 ms';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)} ms`;
}

// ============================================================================
// Component
// ============================================================================

export const StatusFooter: React.FC = () => {
  const triangleCount = useAppStore((s) => s.performance.triangleCount);
  const vertexCount = useAppStore((s) => s.performance.vertexCount);
  const generationTime = useAppStore((s) => s.performance.generationTime);
  const isGenerating = useAppStore((s) => s.performance.isGenerating);

  const exportFormat = useAppStore((s) => s.ui.exportFormat) as ExportFormat;

  // All three export hooks — we pick the best available at download time
  const cpuExport = useExport();
  const gpuExport = useGPUExport();
  const parametricExport = useParametricExport();

  const announce = useAnnounce();
  const { unlock } = useConfidence();
  const { success } = useHaptics();
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine which export path is active (has a non-idle status)
  const activeExport = useMemo(() => {
    if (parametricExport.progress.status !== 'idle') return 'parametric' as const;
    if (gpuExport.progress.status !== 'idle') return 'gpu' as const;
    if (cpuExport.progress.status !== 'idle') return 'cpu' as const;
    return null;
  }, [parametricExport.progress.status, gpuExport.progress.status, cpuExport.progress.status]);

  // Unified progress/stats from whichever path is active
  const progress = activeExport === 'parametric' ? parametricExport.progress
    : activeExport === 'gpu' ? gpuExport.progress
    : cpuExport.progress;

  const stats = activeExport === 'parametric' ? parametricExport.stats
    : activeExport === 'gpu' ? gpuExport.stats
    : cpuExport.stats;

  const resetActive = useCallback(() => {
    if (activeExport === 'parametric') parametricExport.reset();
    else if (activeExport === 'gpu') gpuExport.reset();
    else cpuExport.reset();
  }, [activeExport, parametricExport, gpuExport, cpuExport]);

  // Determine best available export path for the download button label
  const bestPath = parametricExport.isAvailable ? 'parametric'
    : gpuExport.isGPUAvailable ? 'gpu'
    : 'cpu';

  const meshStats = useMemo(
    () => ({
      triangles: formatNumber(triangleCount),
      vertices: formatNumber(vertexCount),
      genTime: formatTime(generationTime),
    }),
    [triangleCount, vertexCount, generationTime]
  );

  const formatLabel = exportFormat.toUpperCase();

  const handleDownload = useCallback(async () => {
    if (progress.status === 'generating') return;

    // Build 3MF colors from the appearance store (mirrors the CPU path in
    // useExport.ts) so 3MF exports embed the current color scheme.
    const exportColors = exportFormat === '3mf'
      ? (() => {
          const appearance = useAppStore.getState().appearance;
          return {
            primaryColor: appearance.primaryColor,
            midColor: appearance.midColor,
            secondaryColor: appearance.secondaryColor,
          };
        })()
      : undefined;

    if (parametricExport.isAvailable) {
      await parametricExport.exportSTL(undefined, undefined, { format: exportFormat, colors: exportColors });
    } else if (gpuExport.isGPUAvailable) {
      await gpuExport.exportSTL(undefined, { format: exportFormat, colors: exportColors });
    } else {
      await cpuExport.exportSTL(undefined, exportFormat);
    }
  }, [progress.status, parametricExport, gpuExport, cpuExport, exportFormat]);

  // Listen for global keyboard shortcut (D key)
  useEffect(() => {
    const onShortcut = () => { handleDownload(); };
    window.addEventListener('pf2:download', onShortcut);
    return () => window.removeEventListener('pf2:download', onShortcut);
  }, [handleDownload]);

  const previousStatusRef = useRef(progress.status);
  useEffect(() => {
    if (previousStatusRef.current !== 'complete' && progress.status === 'complete') {
      success();
    }
    previousStatusRef.current = progress.status;
  }, [progress.status, success]);

  // Auto-reset after completion, announce result
  useEffect(() => {
    if (progress.status === 'complete' && stats) {
      const gpuLabel = (activeExport === 'parametric' || activeExport === 'gpu') ? ' (GPU)' : '';
      announce(
        `Export complete${gpuLabel} — ${formatNumber(stats.triangleCount)} triangles, ${stats.fileSize}`
      );
      unlock('first-export');

      resetTimerRef.current = setTimeout(() => {
        resetActive();
      }, COMPLETION_DISPLAY_MS);
    }

    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [progress.status, stats, announce, unlock, resetActive, activeExport]);

  const isExporting = progress.status === 'generating';
  const isComplete = progress.status === 'complete';
  const isError = progress.status === 'error';
  const showProgress = isExporting || isComplete || isError;

  const pathIcon = bestPath === 'cpu'
    ? <Cpu size={14} aria-hidden="true" />
    : <Zap size={14} aria-hidden="true" />;

  const pathLabel = bestPath === 'parametric' ? 'Parametric GPU'
    : bestPath === 'gpu' ? 'GPU'
    : 'CPU';

  return (
    <footer
      className="pf2-status-footer"
      aria-busy={isExporting || undefined}
    >
      {/* Stats line */}
      <div
        className="pf2-status-footer__stats pf2-text-mono"
        role="status"
        aria-live="polite"
        aria-label={`Mesh: ${meshStats.triangles} triangles, ${meshStats.vertices} vertices, generated in ${meshStats.genTime}`}
      >
        <span className="pf2-status-footer__stat">
          <Triangle size={11} aria-hidden="true" />
          {meshStats.triangles}
        </span>
        <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
        <span className="pf2-status-footer__stat">
          <Box size={11} aria-hidden="true" />
          {meshStats.vertices}
        </span>
        <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
        <span className="pf2-status-footer__stat">
          <Activity size={11} aria-hidden="true" />
          {meshStats.genTime}
        </span>
        {isGenerating && (
          <span className="pf2-status-footer__generating" aria-label="Generating mesh">
            <span className="pf2-status-footer__spinner" aria-hidden="true" />
          </span>
        )}
      </div>

      {/* Export progress */}
      {showProgress && (
        <div
          className={`pf2-status-footer__progress${
            isExporting ? ' pf2-status-footer__progress--indeterminate' : ''
          }${isComplete ? ' pf2-status-footer__progress--complete' : ''}${
            isError ? ' pf2-status-footer__progress--error' : ''
          }`}
          role="progressbar"
          aria-valuenow={isComplete ? 100 : undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            isExporting
              ? `Generating ${formatLabel} file via ${pathLabel}`
              : isComplete
                ? 'Export complete'
                : progress.message
          }
        >
          <div className="pf2-status-footer__progress-bar" />
        </div>
      )}

      {/* Completion card — click/Enter to dismiss */}
      {isComplete && stats && (
        <div
          className="pf2-status-footer__completion"
          role="button"
          tabIndex={0}
          onClick={() => resetActive()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              resetActive();
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-label="Dismiss export completion"
        >
          <div className="pf2-status-footer__completion-header">
            <svg
              className="pf2-status-footer__check-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="10"
                cy="10"
                r="8.5"
                stroke="var(--pf2-success)"
                strokeWidth="1.5"
                className="pf2-status-footer__check-circle"
              />
              <polyline
                points="6.5,10.5 9,13 13.5,7.5"
                stroke="var(--pf2-success)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                className="pf2-status-footer__check-mark"
              />
            </svg>
            <span className="pf2-status-footer__completion-title">
              Export Complete
            </span>
          </div>
          <div className="pf2-status-footer__completion-stats pf2-text-mono">
            <span>{formatNumber(stats.triangleCount)} triangles</span>
            <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
            <span>{stats.fileSize}</span>
            <span className="pf2-status-footer__divider" aria-hidden="true">·</span>
            <span>{formatTime(stats.generationTimeMs)}</span>
          </div>
          {stats.volumeMl > 0 && (
            <div className="pf2-status-footer__completion-volume pf2-text-mono">
              {stats.volumeMl.toFixed(1)} ml volume
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {isError && (
        <div className="pf2-status-footer__error" role="alert">
          {progress.message}
        </div>
      )}

      {/* Download button — shows export path badge */}
      <ButtonV2
        variant="primary"
        fullWidth
        iconLeft={
          isExporting
            ? <Loader2 size={16} className="pf2-status-footer__spin" />
            : <Download size={16} />
        }
        aria-label={isExporting ? `Generating ${formatLabel}...` : `Download ${formatLabel} file via ${pathLabel}`}
        onClick={handleDownload}
        disabled={isExporting}
      >
        {isExporting ? 'Generating...' : (
          <>
            Download {formatLabel}
            <span className="pf2-status-footer__path-badge">
              {pathIcon}
              {pathLabel}
            </span>
          </>
        )}
      </ButtonV2>
    </footer>
  );
};
