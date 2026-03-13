/**
 * ExportPanel - UI for mesh generation and file export
 *
 * Provides a clean interface for:
 * - Viewing mesh statistics
 * - Downloading STL or 3MF files
 * - Configuring export options (format, GPU, optimization)
 * - Tier-based export limits and upgrade prompts
 *
 * Parametric v4 exports open a dedicated ExportDialog with full pipeline controls.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../state';
import { useExport, useExportTier, FREE_TIER_MONTHLY_LIMIT } from '../../hooks';
import useGPUExport from '../../hooks/useGPUExport';
import useAdaptiveExport, { type AdaptiveExportQuality } from '../../hooks/useAdaptiveExport';
import useParametricExport, { fileSizeToTriangles } from '../../hooks/useParametricExport';
import { useIsPro, useIsAuthenticated } from '../../context/AuthContext';
import { PricingModal } from '../pricing';
import { AuthModal } from '../auth';
import { Button } from '../shared/Button';
import ExportDialog, {
  type ExportDialogConfig,
  type ExportDialogStats,
  type ExportDialogValidation,
  type ExportDiagnostics,
} from './ExportDialog';
import { Section } from '../shared/Section';
import type { ExportFormat } from '../../geometry/stlExport';
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
  // Always call all hooks
  const cpuExport = useExport();
  const gpuExport = useGPUExport();
  const adaptiveExport = useAdaptiveExport();
  const parametricExport = useParametricExport();
  const mesh = useAppStore(state => state.mesh);
  const style = useAppStore(state => state.style);
  const setMeshParam = useAppStore(state => state.setMeshParam);

  // State for GPU preference, adaptive mode, format, and parametric mode
  const [useGPU, setUseGPU] = useState(true);
  const [useAdaptive, setUseAdaptive] = useState(false);
  const [useParametric, setUseParametric] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('stl');
  const [adaptiveQuality, setAdaptiveQuality] = useState<AdaptiveExportQuality>('high');
  const parametricBudgetMB = 250; // Fallback budget for non-dialog export path

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [dialogStats, setDialogStats] = useState<ExportDialogStats | null>(null);
  const [dialogValidation, setDialogValidation] = useState<ExportDialogValidation | null>(null);
  const [dialogDiagnostics, setDialogDiagnostics] = useState<ExportDiagnostics | null>(null);
  const [dialogPhase, setDialogPhase] = useState('');
  const [dialogProgress, setDialogProgress] = useState(0);

  // Determine active exporter (parametric > adaptive > GPU > CPU)
  const activeExport = useParametric && parametricExport.isAvailable
    ? parametricExport
    : useAdaptive && adaptiveExport.isAvailable
      ? adaptiveExport
      : (useGPU && gpuExport.isGPUAvailable)
        ? gpuExport
        : cpuExport;
  const { progress, stats, generateMesh: baseGenerateMesh, reset } = activeExport;

  // Wrap generateMesh to pass budget for parametric
  const generateMesh = useParametric && parametricExport.isAvailable
    ? () => parametricExport.generateMesh(fileSizeToTriangles(parametricBudgetMB))
    : baseGenerateMesh;

  const { checkExportAllowed, recordExport, exportsThisMonth } = useExportTier();
  const isPro = useIsPro();
  const isAuthenticated = useIsAuthenticated();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Auto-disable GPU if unavailable
  useEffect(() => {
    if (!gpuExport.isGPUAvailable && useGPU) {
      setUseGPU(false);
    }
  }, [gpuExport.isGPUAvailable, useGPU]);

  const isDev = import.meta.env.DEV;
  const tierCheck = checkExportAllowed();

  // Determine if export is allowed (must be authenticated AND within tier limits)
  // In DEV mode, bypass all restrictions.
  const canExport = (isAuthenticated || isDev) && (tierCheck.canExport || isDev);

  // Sync parametric stats into dialog format whenever they update
  useEffect(() => {
    if (!parametricExport.stats) return;
    const s = parametricExport.stats;
    setDialogStats({
      triangles: s.triangleCount,
      vertices: s.vertexCount,
      fileSize: s.fileSize,
      timeMs: s.generationTimeMs,
      volumeMl: s.volumeMl,
      surfaceAreaMm2: s.surfaceAreaMm2,
      gridDimensions: s.gridDimensions,
      densityRatio: s.adaptiveDensityRatio,
      featurePeaksSnapped: s.featurePeaksSnapped,
    });

    // Map ValidationSummary → ExportDialogValidation for the dialog
    const vs = s.validationSummary;
    if (vs) {
      setDialogValidation({
        manifold: vs.manifoldOk,
        normals: vs.normalsOk,
        fidelity: vs.fidelityOk ?? true,
        quality: vs.triangleQualityOk,
        warnings: vs.warnings,
      });
    } else {
      setDialogValidation(null);
    }

    // Map PipelineDiagnostics → ExportDiagnostics for the dialog
    const pd = s.pipelineDiagnostics;
    if (pd) {
      setDialogDiagnostics({
        phases: pd.phases,
        chainCount: pd.chainCount,
        chainPoints: pd.chainPoints,
        chainFlips: pd.chainFlips,
        genericFlips3D: pd.genericFlips3D,
        subdivSplits: pd.subdivSplits,
        valenceLow: pd.valenceLow,
        valenceIdeal: pd.valenceIdeal,
        valenceHigh: pd.valenceHigh,
        crossRowTris: pd.crossRowTris,
        aspectOver5: pd.aspectOver5,
        refinement: pd.refinement ? {
          iterations: pd.refinement.iterationsPerformed,
          stopReason: pd.refinement.stopReason,
          maxPosErrorMm: pd.refinement.maxPosErrorMm,
          p95PosErrorMm: pd.refinement.p95PosErrorMm,
          maxNormalErrorDeg: pd.refinement.maxNormalErrorDeg,
        } : undefined,
      });
    } else {
      setDialogDiagnostics(null);
    }
  }, [parametricExport.stats]);

  // Sync parametric progress into dialog
  useEffect(() => {
    setDialogPhase(parametricExport.progress.message);
    setDialogProgress(parametricExport.progress.progress);
  }, [parametricExport.progress]);

  /** Build pipeline overrides from the dialog config for the hook. */
  const buildOverrides = useCallback((config: ExportDialogConfig) => ({
    qualityProfile: config.qualityProfile,
    pipelineFeatureFlags: config.featureFlags,
    toleranceOverrides: config.toleranceOverrides,
    pipelineConfig: config.pipeline,
    relaxIterations: config.pipeline.relaxIterations,
  }), []);

  const handleDialogExport = useCallback(async (config: ExportDialogConfig) => {
    if (!isAuthenticated && !isDev) { setShowAuthModal(true); return; }
    if (!tierCheck.canExport && !isDev) { setShowPricingModal(true); return; }

    const tris = fileSizeToTriangles(config.budgetMB);
    const meshData = await parametricExport.generateMesh(tris, buildOverrides(config));
    if (!meshData) return;

    const styleName = style.name ?? 'Pot';
    const ext = config.format === '3mf' ? '3mf' : config.format === 'obj' ? 'obj' : 'stl';
    const filename = `PotFoundry_${styleName}_${Date.now()}.${ext}`;

    try {
      const { downloadMesh } = await import('../../geometry/stlExport');
      await downloadMesh(meshData, filename, { format: config.format });
      await recordExport();
      onExportComplete?.();
    } catch (error) {
      console.error('[ExportPanel] Dialog export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [isAuthenticated, isDev, tierCheck, parametricExport, style.name, recordExport, onExportComplete, buildOverrides]);

  const handleDialogPreview = useCallback(async (config: ExportDialogConfig) => {
    const tris = fileSizeToTriangles(config.budgetMB);
    await parametricExport.generateMesh(tris, buildOverrides(config));
  }, [parametricExport, buildOverrides]);

  const handleExport = useCallback(async () => {
    // If not authenticated, show auth modal (unless in dev mode)
    if (!isAuthenticated && !isDev) {
      setShowAuthModal(true);
      return;
    }

    // Check tier limits (unless in dev mode)
    if (!tierCheck.canExport && !isDev) {
      setShowPricingModal(true);
      return;
    }

    // Generate mesh using the active exporter
    // Note: CPU exporter returns MeshResult { mesh, diagnostics }
    //       GPU exporter returns MeshData directly
    const result = useParametric && parametricExport.isAvailable
      ? await parametricExport.generateMesh(fileSizeToTriangles(parametricBudgetMB))
      : useAdaptive && adaptiveExport.isAvailable
        ? await adaptiveExport.generateMesh(adaptiveQuality)
        : await generateMesh();

    if (!result) {
      return; // Error already handled
    }

    // Extract mesh data - handle both return types
    let meshData = 'mesh' in result ? result.mesh : result;

    // Mesh is already capped to safe sizes in useExport/useGPUExport
    // No need for decimation here

    // Determine filename with correct extension
    const styleName = style.name ?? 'Pot';
    const extension = exportFormat === '3mf' ? '3mf' : exportFormat === 'obj' ? 'obj' : 'stl';
    const filename = `PotFoundry_${styleName}_${Date.now()}.${extension}`;

    try {
      // Import and use downloadMesh for format-aware export
      const { downloadMesh } = await import('../../geometry/stlExport');
      await downloadMesh(meshData, filename, { format: exportFormat });

      await recordExport();
      onExportComplete?.();
    } catch (error) {
      console.error('[ExportPanel] Export failed:', error);
      // Show error to user via reset/progress
      reset();
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}. Try reducing the resolution.`);
    }
  }, [generateMesh, exportFormat, tierCheck, recordExport, isAuthenticated, style.name, onExportComplete, isDev, reset, useParametric, parametricExport, parametricBudgetMB, useAdaptive, adaptiveExport, adaptiveQuality]);

  const handlePreview = useCallback(async () => {
    await generateMesh();
  }, [generateMesh]);

  const isLoading = progress.status === 'generating';
  const hasError = progress.status === 'error';
  const hasStats = stats !== null;

  return (
    <div className="export-panel">
      <Section title="Export" icon={<CubeIcon />} defaultOpen>
        {/* Auth Required Banner - Show when NOT signed in (and not in dev mode) */}
        {!isAuthenticated && !isDev && (
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
                <span className="export-panel__pro-stats">
                  <strong>Pro</strong> • {exportsThisMonth} this month • {tierCheck.totalExports ?? 0} total
                </span>
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

        {/* Dev Mode Banner */}
        {isDev && !isAuthenticated && (
          <div className="export-panel__tier-banner pro" style={{ background: '#333', borderColor: '#666' }}>
            <span className="export-panel__pro-stats" style={{ color: '#aaa' }}>
              <strong>DEV MODE</strong> • Authentication bypassed
            </span>
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
          {!isAuthenticated && !isDev ? (
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
              onClick={useParametric && parametricExport.isAvailable
                ? () => setExportDialogOpen(true)
                : handleExport}
              disabled={isLoading}
              className="export-panel__export-btn"
            >
              <DownloadIcon />
              {isLoading
                ? 'Generating...'
                : (useParametric && parametricExport.isAvailable)
                  ? 'Export…'
                  : `Download ${exportFormat.toUpperCase()}`}
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
                  {'gpuAccelerated' in stats && stats.gpuAccelerated && (
                    <span className="export-panel__tag-gpu" title="Generated on GPU">GPU</span>
                  )}
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

            {/* GPU Toggle - Only show if GPU is available or forced in dev */}
            <div className="export-panel__option-toggle">
              <label className="export-panel__checkbox-label">
                <input
                  type="checkbox"
                  checked={useGPU}
                  onChange={(e) => setUseGPU(e.target.checked)}
                  disabled={!gpuExport.isGPUAvailable}
                />
                <span className="export-panel__checkbox-text">
                  Use GPU Acceleration
                  {!gpuExport.isGPUAvailable && <span className="export-panel__tag-unavailable">Unavailable</span>}
                </span>
              </label>
            </div>

            {/* Optimization Toggle */}
            <div className="export-panel__option-toggle">
              <label className="export-panel__checkbox-label">
                <input
                  type="checkbox"
                  checked={mesh.optimize ?? false}
                  onChange={(e) => setMeshParam('optimize', e.target.checked)}
                  disabled={!useGPU || !gpuExport.isGPUAvailable || useAdaptive}
                />
                <span className="export-panel__checkbox-text">
                  Optimize Mesh (Experimental)
                  <span className="export-panel__tag-experimental" title="Reduces triangle count in flat areas">Beta</span>
                </span>
              </label>
            </div>

            {/* Parametric Export Toggle (v4.0 — NEW PIPELINE) */}
            <div className="export-panel__option-toggle">
              <label className="export-panel__checkbox-label">
                <input
                  type="checkbox"
                  checked={useParametric}
                  onChange={(e) => {
                    setUseParametric(e.target.checked);
                    if (e.target.checked) setUseAdaptive(false); // Mutually exclusive
                  }}
                  disabled={!parametricExport.isAvailable}
                />
                <span className="export-panel__checkbox-text">
                  Parametric v4
                  {parametricExport.isAvailable
                    ? <span className="export-panel__tag-new" title="Direct parametric tessellation — 10-20× faster, no CDT artifacts">⚡ FAST</span>
                    : <span className="export-panel__tag-unavailable">Unavailable</span>
                  }
                </span>
              </label>

              {useParametric && parametricExport.isAvailable && (
                <div className="export-panel__parametric-card">
                  <p className="export-panel__hint">
                    Quality profile, file budget, per-stage settings, feature flags and diagnostics available in the export dialog.
                  </p>
                  <button
                    className="export-panel__open-dialog-btn"
                    onClick={() => setExportDialogOpen(true)}
                  >
                    Configure &amp; Export…
                  </button>
                </div>
              )}
            </div>

            {/* Adaptive Export Toggle (Legacy CDT pipeline) */}
            <div className="export-panel__option-toggle">
              <label className="export-panel__checkbox-label">
                <input
                  type="checkbox"
                  checked={useAdaptive}
                  onChange={(e) => {
                    setUseAdaptive(e.target.checked);
                    if (e.target.checked) setUseParametric(false); // Mutually exclusive
                  }}
                  disabled={!adaptiveExport.isAvailable}
                />
                <span className="export-panel__checkbox-text">
                  Adaptive Resolution
                  {adaptiveExport.isAvailable
                    ? <span className="export-panel__tag-new" title="Variable mesh density based on curvature">CDT</span>
                    : <span className="export-panel__tag-unavailable">Unavailable</span>
                  }
                </span>
              </label>

              {useAdaptive && (
                <div className="export-panel__adaptive-settings" style={{ marginLeft: '24px', marginTop: '8px' }}>
                  <div className="export-panel__quality-slider">
                    <label style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      Quality: <strong>{adaptiveQuality.toUpperCase()}</strong>
                    </label>
                    <input
                      type="range"
                      min="0" max="3" step="1"
                      value={['low', 'medium', 'high', 'ultra'].indexOf(adaptiveQuality)}
                      onChange={(e) => {
                        const qualities: AdaptiveExportQuality[] = ['low', 'medium', 'high', 'ultra'];
                        setAdaptiveQuality(qualities[parseInt(e.target.value)]);
                      }}
                      style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                      <span>Low</span>
                      <span>Med</span>
                      <span>High</span>
                      <span>Ultra</span>
                    </div>
                  </div>
                  <p className="export-panel__hint" style={{ marginTop: '8px', fontSize: '11px' }}>
                    More triangles where detail matters. <br />
                    Target: {adaptiveQuality === 'low' ? '0.5M' : adaptiveQuality === 'medium' ? '1.5M' : adaptiveQuality === 'high' ? '4M' : '8M'} triangles.
                  </p>
                </div>
              )}
            </div>

            {/* Format Selector */}
            <div className="export-panel__option-toggle">
              <label className="export-panel__checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="export-panel__checkbox-text">Export Format:</span>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className="export-panel__format-select"
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text)',
                    fontSize: '13px'
                  }}
                >
                  <option value="stl">STL (Binary)</option>
                  <option value="3mf">3MF (Compressed)</option>
                  <option value="obj">OBJ (Wavefront)</option>
                </select>
              </label>
            </div>

            <div className="export-panel__format-info">
              <span className="export-panel__format-badge">
                {exportFormat === '3mf' ? '3MF' : exportFormat === 'obj' ? 'OBJ' : 'Binary STL'}
              </span>
              <span className="export-panel__format-desc">
                {exportFormat === '3mf'
                  ? '50% smaller than STL, ZIP compressed'
                  : exportFormat === 'obj'
                    ? 'ASCII text, widely compatible'
                    : '80% smaller than ASCII STL'}
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* Parametric Export Dialog */}
      <ExportDialog
        isOpen={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        potName={style.name ?? 'Pot'}
        onExport={handleDialogExport}
        onPreview={handleDialogPreview}
        isGenerating={parametricExport.progress.status === 'generating'}
        generationPhase={dialogPhase}
        generationProgress={dialogProgress}
        stats={dialogStats}
        validation={dialogValidation}
        diagnostics={dialogDiagnostics}
        isAvailable={parametricExport.isAvailable}
        showChainOverlay={parametricExport.showChainOverlay}
        showPeakOverlay={parametricExport.showPeakOverlay}
        onChainOverlayChange={parametricExport.setShowChainOverlay}
        onPeakOverlayChange={parametricExport.setShowPeakOverlay}
      />

      {/* Pricing Modal */}
      <PricingModal open={showPricingModal} onOpenChange={setShowPricingModal} />

      {/* Auth Modal */}
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
};

export default ExportPanel;
