/**
 * StatusFooter — Persistent stats bar, download button, and export progress.
 *
 * Lives at the bottom of SidebarV2, visible across all tabs.
 * Displays mesh stats (tris, verts, generation time), a full-width
 * Download button that triggers STL export, and animated progress/completion UI.
 *
 * @module ui/v2/layout/StatusFooter
 */

import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { Triangle, Box, Activity, Download } from 'lucide-react';
import { ButtonV2 } from '../controls/ButtonV2';
import { useAppStore } from '../../../state';
import { useExport } from '../../../hooks/useExport';
import { useAnnounce } from '../shared/Announcer';
import { useConfidence } from '../onboarding/useConfidence';
import { useHaptics } from '../hooks/useHaptics';
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

  const { exportSTL, progress, stats, reset } = useExport();
  const announce = useAnnounce();
  const { unlock } = useConfidence();
  const { success } = useHaptics();
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStatusRef = useRef(progress.status);

  const meshStats = useMemo(
    () => ({
      triangles: formatNumber(triangleCount),
      vertices: formatNumber(vertexCount),
      genTime: formatTime(generationTime),
    }),
    [triangleCount, vertexCount, generationTime]
  );

  const handleDownload = useCallback(async () => {
    if (progress.status === 'generating') return;
    await exportSTL();
  }, [progress.status, exportSTL]);

  useEffect(() => {
    if (previousStatusRef.current !== 'complete' && progress.status === 'complete') {
      success();
    }
    previousStatusRef.current = progress.status;
  }, [progress.status, success]);

  // Auto-reset after completion, announce result
  useEffect(() => {
    if (progress.status === 'complete' && stats) {
      announce(
        `Export complete — ${formatNumber(stats.triangleCount)} triangles, ${stats.fileSize}`
      );
      unlock('first-export');

      resetTimerRef.current = setTimeout(() => {
        reset();
      }, COMPLETION_DISPLAY_MS);
    }

    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [progress.status, stats, announce, unlock, reset]);

  const isExporting = progress.status === 'generating';
  const isComplete = progress.status === 'complete';
  const isError = progress.status === 'error';
  const showProgress = isExporting || isComplete || isError;

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
              ? 'Generating STL file'
              : isComplete
                ? 'Export complete'
                : progress.message
          }
        >
          <div className="pf2-status-footer__progress-bar" />
        </div>
      )}

      {/* Completion card — click to dismiss (Q6) */}
      {isComplete && stats && (
        <div
          className="pf2-status-footer__completion"
          role="status"
          onClick={() => reset()}
          style={{ cursor: 'pointer' }}
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

      {/* Download button */}
      <ButtonV2
        variant="primary"
        fullWidth
        iconLeft={<Download size={16} />}
        aria-label={isExporting ? 'Generating STL...' : 'Download STL file'}
        onClick={handleDownload}
        disabled={isExporting}
      >
        {isExporting ? 'Generating...' : 'Download STL'}
      </ButtonV2>
    </footer>
  );
};
