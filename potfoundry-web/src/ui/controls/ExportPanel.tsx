/**
 * ExportPanel - UI for mesh generation and STL export
 * 
 * Provides a clean interface for:
 * - Viewing mesh statistics
 * - Downloading STL files
 * - Configuring export options
 * - Tier-based export limits and upgrade prompts
 */

import React, { useState, useCallback } from 'react';
import { useExport, useExportTier, FREE_TIER_MONTHLY_LIMIT } from '../../hooks';
import { useIsPro, useIsAuthenticated } from '../../context/AuthContext';
import { PricingModal } from '../pricing';
import { Button } from '../shared/Button';
import { Section } from '../shared/Section';
import './ExportPanel.css';

// ============================================================================
// Icons (inline SVG for minimal dependencies)
// ============================================================================

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23,4 23,10 17,10" />
    <polyline points="1,20 1,14 7,14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
);

const CubeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const CrownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 16L5 8L8.5 11L12 4L15.5 11L19 8L22 16H2Z" />
    <path d="M2 16H22V20H2V16Z" />
  </svg>
);

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

// ============================================================================
// Component
// ============================================================================

interface ExportPanelProps {
  /** Optional custom filename */
  defaultFilename?: string;
  /** Callback when export completes */
  onExportComplete?: () => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  defaultFilename = 'pot.stl',
  onExportComplete,
}) => {
  const { progress, stats, exportSTL, generateMesh, reset } = useExport();
  const { checkExportAllowed, recordExport, exportsThisMonth } = useExportTier();
  const isPro = useIsPro();
  const isAuthenticated = useIsAuthenticated();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const tierCheck = checkExportAllowed();

  // Determine if export is allowed (must be authenticated AND within tier limits)
  const canExport = isAuthenticated && tierCheck.canExport;

  const handleExport = useCallback(async () => {
    // If not authenticated, show auth modal
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    // Check tier limits
    if (!tierCheck.canExport) {
      setShowPricingModal(true);
      return;
    }

    await exportSTL(defaultFilename);
    await recordExport();
    onExportComplete?.();
  }, [exportSTL, defaultFilename, onExportComplete, tierCheck, recordExport, isAuthenticated]);

  const handlePreview = useCallback(async () => {
    await generateMesh();
  }, [generateMesh]);

  const isLoading = progress.status === 'generating';
  const hasError = progress.status === 'error';
  const hasStats = stats !== null;

  // Import AuthModal lazily to avoid circular deps
  const AuthModal = React.lazy(() => import('../auth/AuthModal').then(m => ({ default: m.AuthModal })));

  return (
    <div className="export-panel">
      <Section title="Export" icon={<CubeIcon />} defaultOpen>
        {/* Auth Required Banner - Show when NOT signed in */}
        {!isAuthenticated && (
          <div className="export-panel__auth-required">
            <LockIcon />
            <span>Sign in required to export</span>
            <button
              className="export-panel__signin-btn"
              onClick={() => setShowAuthModal(true)}
            >
              Sign In
            </button>
          </div>
        )}

        {/* Tier Status Banner - Only show when signed in */}
        {isAuthenticated && (
          <div className={`export-panel__tier-banner ${isPro ? 'pro' : 'free'}`}>
            {isPro ? (
              <>
                <CrownIcon />
                <span>Pro • Unlimited Exports</span>
              </>
            ) : (
              <>
                <span className="export-panel__tier-count">
                  {exportsThisMonth} / {FREE_TIER_MONTHLY_LIMIT} exports used
                </span>
                {tierCheck.exportsRemaining !== null && tierCheck.exportsRemaining <= 3 && tierCheck.exportsRemaining > 0 && (
                  <span className="export-panel__tier-warning">
                    ⚠️ {tierCheck.exportsRemaining} left
                  </span>
                )}
                {!tierCheck.canExport && (
                  <span className="export-panel__tier-exhausted">
                    <LockIcon /> Limit reached
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Free tier restrictions notice - Only show when signed in AND not Pro */}
        {isAuthenticated && !isPro && (
          <div className="export-panel__restrictions">
            <div className="export-panel__restriction-item">
              <LockIcon />
              <span>Standard resolution (84×42)</span>
            </div>
            <div className="export-panel__restriction-item">
              <LockIcon />
              <span>Watermark in STL header</span>
            </div>
            <button
              className="export-panel__upgrade-link"
              onClick={() => setShowPricingModal(true)}
            >
              <CrownIcon />
              Upgrade for unlimited exports
            </button>
          </div>
        )}

        {/* Main export button */}
        <div className="export-panel__actions">
          {!isAuthenticated ? (
            // Not signed in - show greyed out button that prompts sign in
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowAuthModal(true)}
              className="export-panel__export-btn export-panel__export-btn--disabled"
            >
              <LockIcon />
              Sign In to Export
            </Button>
          ) : canExport ? (
            // Signed in and can export
            <Button
              variant="primary"
              size="md"
              onClick={handleExport}
              disabled={isLoading}
              className="export-panel__export-btn"
            >
              <DownloadIcon />
              {isLoading ? 'Generating...' : 'Download STL'}
            </Button>
          ) : (
            // Signed in but limit reached
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowPricingModal(true)}
              className="export-panel__export-btn export-panel__export-btn--locked"
            >
              <LockIcon />
              Export Limit Reached
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handlePreview}
            disabled={isLoading}
            title="Preview mesh statistics without downloading"
          >
            <RefreshIcon />
            Preview Stats
          </Button>
        </div>

        {/* Progress indicator */}
        {isLoading && (
          <div className="export-panel__progress">
            <div className="export-panel__progress-bar">
              <div
                className="export-panel__progress-fill"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <span className="export-panel__progress-text">{progress.message}</span>
          </div>
        )}

        {/* Error message */}
        {hasError && (
          <div className="export-panel__error">
            <span className="export-panel__error-icon">⚠️</span>
            <span className="export-panel__error-text">{progress.message}</span>
            <Button variant="ghost" size="sm" onClick={reset}>
              Dismiss
            </Button>
          </div>
        )}

        {/* Statistics */}
        {hasStats && !isLoading && (
          <div className="export-panel__stats">
            <h4 className="export-panel__stats-title">Mesh Statistics</h4>
            <div className="export-panel__stats-grid">
              <div className="export-panel__stat">
                <span className="export-panel__stat-label">Triangles</span>
                <span className="export-panel__stat-value">
                  {stats.triangleCount.toLocaleString()}
                </span>
              </div>
              <div className="export-panel__stat">
                <span className="export-panel__stat-label">Vertices</span>
                <span className="export-panel__stat-value">
                  {stats.vertexCount.toLocaleString()}
                </span>
              </div>
              <div className="export-panel__stat">
                <span className="export-panel__stat-label">File Size</span>
                <span className="export-panel__stat-value">{stats.fileSize}</span>
              </div>
              <div className="export-panel__stat">
                <span className="export-panel__stat-label">Gen Time</span>
                <span className="export-panel__stat-value">
                  {stats.generationTimeMs.toFixed(1)}ms
                </span>
              </div>
            </div>

            {/* Volume info */}
            <div className="export-panel__volume">
              <div className="export-panel__stat export-panel__stat--wide">
                <span className="export-panel__stat-label">Volume</span>
                <span className="export-panel__stat-value">
                  {stats.volumeMl.toFixed(1)} mL ({(stats.volumeMm3 / 1000).toFixed(0)} cm³)
                </span>
              </div>
              <div className="export-panel__stat export-panel__stat--wide">
                <span className="export-panel__stat-label">Surface Area</span>
                <span className="export-panel__stat-value">
                  {(stats.surfaceAreaMm2 / 100).toFixed(1)} cm²
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Sign in hint */}
        {!isAuthenticated && (
          <p className="export-panel__signin-hint">
            Sign in to track exports and unlock Pro features
          </p>
        )}

        {/* Advanced options toggle */}
        <button
          className="export-panel__advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▼' : '▶'} Advanced Options
        </button>

        {showAdvanced && (
          <div className="export-panel__advanced">
            <p className="export-panel__hint">
              Binary STL format is used by default. This produces smaller files
              that are faster to process and universally supported by all slicers.
            </p>
            <div className="export-panel__format-info">
              <span className="export-panel__format-badge">Binary STL</span>
              <span className="export-panel__format-desc">80% smaller than ASCII</span>
            </div>
          </div>
        )}
      </Section>

      {/* Pricing Modal */}
      <PricingModal open={showPricingModal} onOpenChange={setShowPricingModal} />

      {/* Auth Modal */}
      <React.Suspense fallback={null}>
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </React.Suspense>
    </div>
  );
};

export default ExportPanel;
