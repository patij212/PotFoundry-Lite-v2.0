/**
 * ExportDialog.tsx — Three-tab parametric export configuration dialog.
 *
 * Tabs:
 *   Export   — quality profile, file size, format, post-export stats + validation
 *   Pipeline — per-stage toggles and numeric params grouped by pipeline phase
 *   Debug    — feature flag overrides, viewport overlays, live diagnostics readout
 *
 * Design: Precision Craft aesthetic — dark ceramic studio meets mission control.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { resolveFeatureFlags } from '../../renderers/webgpu/parametric/contracts';
import type { PipelineFeatureFlags } from '../../renderers/webgpu/parametric/contracts';
import type { QualityProfileName, ExportTolerances, ChainStripMode, ValidationSummary } from '../../renderers/webgpu/parametric/types';
import { QUALITY_PROFILES as PROFILE_DEFINITIONS } from '../../renderers/webgpu/parametric/QualityProfiles';
import { ExportIntegrityPanel } from './ExportIntegrityPanel';
import './ExportDialog.css';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'stl' | '3mf' | 'obj';
type GenerationStatus = 'idle' | 'initializing' | 'generating' | 'complete' | 'error';
type TabId = 'export' | 'pipeline' | 'debug';

/**
 * All pipeline-stage configuration exposed to the UI.
 * Maps to the hardcoded constants and conditionals in ParametricExportComputer.ts.
 */
export interface PipelineConfig {
    // Phase 1 — Curvature Sampling
    numStrips: number;
    curvatureSamples: number;
    // Phase 2.5 — Feature Detection
    rowProbeSamples: number;
    gpuResnap: boolean;
    resnapCandidates: number;
    featureBudgetMB: number;
    // Phase 3 — Tessellation
    chainStripMode: ChainStripMode;
    chainStripDensity: number;
    chainStripExpansion: number;
    chainStripAdaptiveRefine: boolean;
    chainDirectedFlip: boolean;
    edgeFlip3D: boolean;
    // Phase 4 — Optimization
    chainStripOptimizer: boolean;
    boundaryDiagOpt: boolean;
    gpuSubdivision: boolean;
    // Phase 5 — Relaxation
    relaxIterations: number;
}

/** Full export configuration assembled from dialog state. */
export interface ExportDialogConfig {
    qualityProfile: QualityProfileName;
    format: ExportFormat;
    budgetMB: number;
    pipeline: PipelineConfig;
    featureFlags: Partial<PipelineFeatureFlags>;
    toleranceOverrides?: Partial<ExportTolerances>;
}

/** Post-export mesh statistics surfaced from useParametricExport. */
export interface ExportDialogStats {
    triangles: number;
    vertices: number;
    fileSize: string;
    timeMs: number;
    volumeMl: number;
    surfaceAreaMm2: number;
    gridDimensions: { nu: number; nt: number };
    densityRatio?: number;
    featurePeaksSnapped?: number;
}

/** Validation results from MeshValidator, surfaced to the dialog. */
export interface ExportDialogValidation {
    manifold: boolean;
    normals: boolean;
    fidelity: boolean;
    quality: boolean;
    warnings: string[];
}

/** Per-stage timing and counters for the Debug tab readout. */
export interface ExportDiagnostics {
    phases: Array<{ name: string; timeMs: number; details?: string[] }>;
    chainCount: number;
    chainPoints: number;
    chainFlips: number;
    genericFlips3D: number;
    subdivSplits: number;
    valenceLow: number;
    valenceIdeal: number;
    valenceHigh: number;
    crossRowTris: number;
    aspectOver5: number;
    refinement?: {
        iterations: number;
        stopReason: string;
        maxPosErrorMm: number;
        p95PosErrorMm: number;
        maxNormalErrorDeg: number;
    };
}

export interface ExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    potName?: string;
    /** Called when the user clicks Download — caller handles generation + download. */
    onExport: (config: ExportDialogConfig) => void;
    /** Called when the user clicks Preview Stats — caller handles generation only. */
    onPreview: (config: ExportDialogConfig) => void;
    isGenerating: boolean;
    generationStatus: GenerationStatus;
    generationPhase: string;
    generationProgress: number;
    stats: ExportDialogStats | null;
    validation: ExportDialogValidation | null;
    /**
     * Raw conforming/legacy export validation summary (Plan Task 2.2 shape).
     * Feeds the surface-integrity panel. Undefined/null when the active export
     * path has not populated it → the panel shows a neutral pending state.
     */
    validationSummary?: ValidationSummary | null;
    diagnostics: ExportDiagnostics | null;
    isAvailable: boolean;
    showChainOverlay: boolean;
    showPeakOverlay: boolean;
    onChainOverlayChange: (v: boolean) => void;
    onPeakOverlayChange: (v: boolean) => void;
}

// ============================================================================
// Constants
// ============================================================================

// Per-profile budgetMB defaults. `mb` mirrors the profile's maxTriangleBudget
// (binary-STL bytes: tris*50+84 → 500K≈25MB, 2M≈100MB, 6M≈300MB, 12M≈600MB)
// so the dialog slider's default never caps below the profile budget. Density
// (maxEdgeMm/nRing — the visual facet bound) lives on the profile itself; the
// typical delivered size is far smaller (high ≈ 1M tris ≈ 50MB; the budget is
// a cap, not a target).
const QUALITY_PROFILES = {
    draft: { label: 'Draft', trisLabel: '500K', mb: 25, desc: 'Fast iteration, ~4mm facets' },
    standard: { label: 'Standard', trisLabel: '2M', mb: 100, desc: 'Balanced FDM, ~2mm facets' },
    high: { label: 'High', trisLabel: '6M', mb: 300, desc: 'Detailed FDM, ~1mm facets' },
    ultra: { label: 'Ultra', trisLabel: '12M', mb: 600, desc: 'SLA/Resin, ≤0.8mm facets' },
} as const;

const MAX_EXPORT_MB = 1024;

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
    numStrips: 16,
    curvatureSamples: 4096,
    rowProbeSamples: 8192,
    gpuResnap: true,
    resnapCandidates: 32,
    featureBudgetMB: 0,
    chainStripMode: 'cdt' as ChainStripMode,
    chainStripDensity: 8,
    chainStripExpansion: 4,
    chainStripAdaptiveRefine: true,
    chainDirectedFlip: true,
    edgeFlip3D: true,
    chainStripOptimizer: true,
    boundaryDiagOpt: true,
    gpuSubdivision: true,
    relaxIterations: 0,
};

const DEFAULT_FLAGS: Partial<PipelineFeatureFlags> = {
    metricAwareRefinement: false,
    distortionGating: false,
    gpuFidelityCheck: false,
    seamHealing: true,
    edgeCollapseEnabled: false,
    outerWallCorridorPlanning: false,
    outerWallCorridorDiagnostics: false,
    // Default ON: the conforming mesher is the watertight-by-construction,
    // high-fidelity export path (clean-CAD triangle quality, features preserved,
    // facet-free below printer resolution). It is the recommended path for slicing
    // (Cura/PrusaSlicer). Toggle off in the Debug tab to compare the legacy path.
    conformingMesher: true,
};

/**
 * Single source of truth for "the conforming mesher will handle this export".
 * Delegates to the pipeline's own flag resolution (an omitted key inherits the
 * pipeline default of ON; an explicit false selects the legacy battery), so the
 * Debug-tab toggle display and the Export-tab control gating can never disagree
 * with each other — or with what the export actually runs.
 */
const isConformingActive = (flags: Partial<PipelineFeatureFlags>): boolean =>
    // The === true narrows the optional field's type; resolveFeatureFlags
    // always populates conformingMesher (?? default), so it never fires.
    resolveFeatureFlags(flags).conformingMesher === true;

// ============================================================================
// Icons (inline SVG — no external dependency)
// ============================================================================

const IconDownload = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7,10 12,15 17,10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const IconClose = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
    <svg
        width="11" height="11" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}
    >
        <polyline points="9,18 15,12 9,6" />
    </svg>
);

const IconCheck = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20,6 9,17 4,12" />
    </svg>
);

const IconAlert = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

// ============================================================================
// Shared primitive components
// ============================================================================

interface ToggleProps {
    value: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    size?: 'sm' | 'md';
}

const Toggle: React.FC<ToggleProps> = ({ value, onChange, disabled = false, size = 'md' }) => (
    <button
        className={`ed-toggle ed-toggle--${size} ${value ? 'ed-toggle--on' : ''} ${disabled ? 'ed-toggle--disabled' : ''}`}
        onClick={() => !disabled && onChange(!value)}
        role="switch"
        aria-checked={value}
        type="button"
    >
        <span className="ed-toggle__thumb" />
    </button>
);

interface RangeSliderProps {
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
}

const RangeSlider: React.FC<RangeSliderProps> = ({ value, min, max, step, onChange, format }) => {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <div className="ed-slider">
            <input
                type="range"
                min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                style={{ '--ed-slider-pct': `${pct}%` } as React.CSSProperties}
            />
            <span className="ed-slider__value">{format ? format(value) : value}</span>
        </div>
    );
};

interface NumberInputProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}

const NumberInput: React.FC<NumberInputProps> = ({ label, value, min, max, step, onChange }) => (
    <input
        className="ed-number-input"
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
            const next = Number(e.currentTarget.value);
            if (Number.isFinite(next)) onChange(next);
        }}
    />
);

interface StageSectionProps {
    id: string;
    phase: string;
    label: string;
    expanded: boolean;
    onToggle: () => void;
    stageEnabled?: boolean;
    onStageEnabledChange?: (v: boolean) => void;
    children: React.ReactNode;
}

const StageSection: React.FC<StageSectionProps> = ({
    phase, label, expanded, onToggle, stageEnabled, onStageEnabledChange, children,
}) => (
    <div className={`ed-stage ${expanded ? 'ed-stage--open' : ''} ${stageEnabled === false ? 'ed-stage--inactive' : ''}`}>
        <button className="ed-stage__header" onClick={onToggle} type="button">
            <span className="ed-stage__phase">{phase}</span>
            <span className="ed-stage__chevron"><IconChevron open={expanded} /></span>
            <span className="ed-stage__label">{label}</span>
            {onStageEnabledChange !== undefined && stageEnabled !== undefined && (
                <span
                    className="ed-stage__toggle-wrap"
                    onClick={e => { e.stopPropagation(); onStageEnabledChange(!stageEnabled); }}
                >
                    <Toggle value={stageEnabled} onChange={onStageEnabledChange} size="sm" />
                </span>
            )}
        </button>
        {expanded && <div className="ed-stage__body">{children}</div>}
    </div>
);

interface ParamRowProps {
    label: string;
    hint?: string;
    children: React.ReactNode;
}

const ParamRow: React.FC<ParamRowProps> = ({ label, hint, children }) => (
    <div className="ed-param-row">
        <div className="ed-param-row__label">
            <span className="ed-param-row__name">{label}</span>
            {hint && <span className="ed-param-row__hint">{hint}</span>}
        </div>
        <div className="ed-param-row__control">{children}</div>
    </div>
);

// ============================================================================
// Export Tab
// ============================================================================

interface ExportTabProps {
    qualityProfile: QualityProfileName;
    onQualitySelect: (p: QualityProfileName) => void;
    format: ExportFormat;
    onFormatChange: (f: ExportFormat) => void;
    budgetMB: number;
    onBudgetChange: (mb: number) => void;
    tolerances: ExportTolerances;
    onToleranceChange: <K extends keyof ExportTolerances>(key: K, value: ExportTolerances[K]) => void;
    /**
     * True when the conforming mesher handles this export (the production
     * default; see isConformingActive). Hides the feature-drift control:
     * the conforming path has zero epsFeatureMm consumers (feature
     * preservation is exact by construction; featDrop=0 is gated), so an
     * editable control there would be a placebo. The legacy path consumes
     * it (MeshValidator), so the control returns when conforming is
     * toggled off (QW3).
     */
    conformingActive: boolean;
    stats: ExportDialogStats | null;
    validation: ExportDialogValidation | null;
    validationSummary?: ValidationSummary | null;
    isGenerating: boolean;
    generationPhase: string;
    generationProgress: number;
}

const ExportTab: React.FC<ExportTabProps> = ({
    qualityProfile, onQualitySelect,
    format, onFormatChange,
    budgetMB, onBudgetChange,
    tolerances, onToleranceChange,
    conformingActive,
    stats, validation, validationSummary,
    isGenerating, generationPhase, generationProgress,
}) => {
    const trisEst = Math.floor((budgetMB * 1_000_000 - 84) / 50);
    const trisLabel = trisEst >= 1_000_000
        ? `${(trisEst / 1_000_000).toFixed(1)}M`
        : `${(trisEst / 1000).toFixed(0)}K`;

    return (
        <div className="ed-export-tab">
            {/* Quality profile grid */}
            <div className="ed-section">
                <div className="ed-section__label">QUALITY PROFILE</div>
                <div className="ed-quality-grid">
                    {(Object.keys(QUALITY_PROFILES) as QualityProfileName[]).map(p => (
                        <button
                            key={p}
                            className={`ed-quality-card ${qualityProfile === p ? 'ed-quality-card--active' : ''}`}
                            onClick={() => onQualitySelect(p)}
                            type="button"
                        >
                            <span className="ed-quality-card__name">{QUALITY_PROFILES[p].label}</span>
                            <span className="ed-quality-card__tris">{QUALITY_PROFILES[p].trisLabel} △</span>
                            <span className="ed-quality-card__size">{QUALITY_PROFILES[p].mb} MB</span>
                            <span className="ed-quality-card__desc">{QUALITY_PROFILES[p].desc}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Fine-tune budget */}
            <div className="ed-section">
                <div className="ed-section__label">FILE SIZE TARGET</div>
                <RangeSlider
                    value={budgetMB} min={25} max={MAX_EXPORT_MB} step={25}
                    onChange={onBudgetChange}
                    format={v => v >= 1000 ? `${(v / 1000).toFixed(1)} GB` : `${v} MB`}
                />
                <div className="ed-budget-meta">
                    <span className="ed-budget-hint">≈ {trisLabel} triangles</span>
                    <div className="ed-budget-scale">
                        <span>25 MB</span><span>250 MB</span><span>500 MB</span><span>1 GB</span>
                    </div>
                </div>
            </div>

            <div className="ed-section">
                <div className="ed-section__label">TOLERANCE GATES</div>
                <div className="ed-tolerance-grid">
                    <ParamRow label="Surface error" hint="mm">
                        <NumberInput
                            label="Surface error tolerance"
                            value={tolerances.epsPosMm}
                            min={0.0001}
                            max={1}
                            step={0.0001}
                            onChange={v => onToleranceChange('epsPosMm', v)}
                        />
                    </ParamRow>
                    {/* Hidden on the conforming path — see the conformingActive
                        prop doc for the rationale (QW3). */}
                    {!conformingActive && (
                        <ParamRow label="Feature drift" hint="mm">
                            <NumberInput
                                label="Feature drift tolerance"
                                value={tolerances.epsFeatureMm}
                                min={0.0001}
                                max={1}
                                step={0.0001}
                                onChange={v => onToleranceChange('epsFeatureMm', v)}
                            />
                        </ParamRow>
                    )}
                    <ParamRow label="Normal error" hint="degrees">
                        <NumberInput
                            label="Normal error tolerance"
                            value={tolerances.epsNormalDeg}
                            min={0.1}
                            max={45}
                            step={0.1}
                            onChange={v => onToleranceChange('epsNormalDeg', v)}
                        />
                    </ParamRow>
                    <ParamRow label="Min angle" hint="degrees">
                        <NumberInput
                            label="Minimum triangle angle"
                            value={tolerances.minTriangleAngleDeg}
                            min={1}
                            max={45}
                            step={1}
                            onChange={v => onToleranceChange('minTriangleAngleDeg', v)}
                        />
                    </ParamRow>
                    <ParamRow label="Max aspect" hint="R/r">
                        <NumberInput
                            label="Maximum triangle aspect ratio"
                            value={tolerances.maxAspectRatio}
                            min={2}
                            max={100}
                            step={0.5}
                            onChange={v => onToleranceChange('maxAspectRatio', v)}
                        />
                    </ParamRow>
                </div>
            </div>

            {/* Format */}
            <div className="ed-section">
                <div className="ed-section__label">FORMAT</div>
                <div className="ed-format-row">
                    {(['stl', '3mf', 'obj'] as ExportFormat[]).map(f => (
                        <button
                            key={f}
                            className={`ed-format-option ${format === f ? 'ed-format-option--active' : ''}`}
                            onClick={() => onFormatChange(f)}
                            type="button"
                        >
                            <span className="ed-format-option__radio" />
                            <div>
                                <div className="ed-format-option__name">
                                    {f === 'stl' ? 'Binary STL' : f === '3mf' ? '3MF' : 'OBJ (Wavefront)'}
                                </div>
                                <div className="ed-format-option__desc">
                                    {f === 'stl'
                                        ? '80% smaller than ASCII · universal slicer support'
                                        : f === '3mf'
                                            ? '50% smaller · material & metadata support'
                                            : 'ASCII text · Blender & modeling tools'}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Generation progress */}
            {isGenerating && (
                <div className="ed-section">
                    <div className="ed-progress">
                        <div className="ed-progress__bar">
                            <div className="ed-progress__fill" style={{ width: `${generationProgress}%` }} />
                        </div>
                        <div className="ed-progress__label">{generationPhase}</div>
                    </div>
                </div>
            )}

            {/* Last export stats */}
            {stats && !isGenerating && (
                <div className="ed-section">
                    <div className="ed-section__label">LAST GENERATION</div>
                    <div className="ed-stats-grid">
                        <div className="ed-stat">
                            <span className="ed-stat__value">{(stats.triangles / 1_000_000).toFixed(2)}M</span>
                            <span className="ed-stat__label">Triangles</span>
                        </div>
                        <div className="ed-stat">
                            <span className="ed-stat__value">{(stats.vertices / 1000).toFixed(0)}K</span>
                            <span className="ed-stat__label">Vertices</span>
                        </div>
                        <div className="ed-stat">
                            <span className="ed-stat__value">{stats.fileSize}</span>
                            <span className="ed-stat__label">File Size</span>
                        </div>
                        <div className="ed-stat">
                            <span className="ed-stat__value">{stats.timeMs.toFixed(0)} ms</span>
                            <span className="ed-stat__label">Gen Time</span>
                        </div>
                        <div className="ed-stat">
                            <span className="ed-stat__value">{stats.volumeMl.toFixed(1)} mL</span>
                            <span className="ed-stat__label">Volume</span>
                        </div>
                        <div className="ed-stat">
                            <span className="ed-stat__value">{stats.gridDimensions.nu}×{stats.gridDimensions.nt}</span>
                            <span className="ed-stat__label">Grid</span>
                        </div>
                    </div>

                    {validation && (
                        <div className="ed-validation">
                            {([
                                { key: 'manifold', label: 'Manifold' },
                                { key: 'normals', label: 'Normals' },
                                { key: 'fidelity', label: 'Fidelity' },
                                { key: 'quality', label: 'Quality' },
                            ] as const).map(({ key, label }) => {
                                const ok = validation[key] as boolean;
                                return (
                                    <div key={key} className={`ed-check ${ok ? 'ed-check--pass' : 'ed-check--fail'}`}>
                                        {ok ? <IconCheck /> : <IconAlert />}
                                        <span>{label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {validation?.warnings && validation.warnings.length > 0 && (
                        <div className="ed-warnings">
                            {validation.warnings.map((w, i) => (
                                <div key={i} className="ed-warning">⚠ {w}</div>
                            ))}
                        </div>
                    )}

                    <ExportIntegrityPanel validationSummary={validationSummary} />
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Pipeline Tab
// ============================================================================

interface PipelineTabProps {
    pipeline: PipelineConfig;
    onChange: <K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) => void;
    expandedStages: Set<string>;
    onToggleStage: (id: string) => void;
}

const PipelineTab: React.FC<PipelineTabProps> = ({ pipeline, onChange, expandedStages, onToggleStage }) => (
    <div className="ed-pipeline-tab">
        <div className="ed-pipeline-note">
            Adjust individual pipeline stages. Changes take effect on the next export.
            Disabling stages may reduce mesh quality or feature fidelity.
        </div>

        <div className="ed-stages">
            {/* Phase 01 — Curvature Sampling */}
            <StageSection id="p1" phase="01" label="Curvature Sampling"
                expanded={expandedStages.has('p1')} onToggle={() => onToggleStage('p1')}>
                <ParamRow label="Strips" hint="16 strips = 0.088° angular resolution">
                    <RangeSlider value={pipeline.numStrips} min={4} max={32} step={4}
                        onChange={v => onChange('numStrips', v)} />
                </ParamRow>
                <ParamRow label="Samples / strip" hint="4096 recommended">
                    <RangeSlider value={pipeline.curvatureSamples} min={512} max={8192} step={512}
                        onChange={v => onChange('curvatureSamples', v)}
                        format={v => v.toLocaleString()} />
                </ParamRow>
            </StageSection>



            {/* Phase 2.5 — Feature Detection */}
            <StageSection id="p25" phase="2.5" label="Feature Detection"
                expanded={expandedStages.has('p25')} onToggle={() => onToggleStage('p25')}>
                <ParamRow label="Row probe samples" hint="8192 = 0.044° resolution">
                    <RangeSlider value={pipeline.rowProbeSamples} min={1024} max={16384} step={1024}
                        onChange={v => onChange('rowProbeSamples', v)}
                        format={v => v.toLocaleString()} />
                </ParamRow>
                <ParamRow label="Feature budget" hint="Extra budget for row insertion + feature columns; base mesh budget is unchanged">
                    <RangeSlider value={pipeline.featureBudgetMB} min={0} max={MAX_EXPORT_MB} step={25}
                        onChange={v => onChange('featureBudgetMB', v)}
                        format={v => v >= 1000 ? `${(v / 1000).toFixed(1)} GB` : `${v} MB`} />
                </ParamRow>
                <ParamRow label="GPU re-snap" hint="Parabolic peak refinement on GPU">
                    <Toggle value={pipeline.gpuResnap} onChange={v => onChange('gpuResnap', v)} />
                </ParamRow>
                {pipeline.gpuResnap && (
                    <ParamRow label="Re-snap candidates" hint="32 = ±2 sample widths">
                        <RangeSlider value={pipeline.resnapCandidates} min={8} max={64} step={8}
                            onChange={v => onChange('resnapCandidates', v)} />
                    </ParamRow>
                )}
            </StageSection>

            {/* Phase 03 — Tessellation */}
            <StageSection id="p3" phase="03" label="Tessellation & Diagonal Alignment"
                expanded={expandedStages.has('p3')} onToggle={() => onToggleStage('p3')}>
                <ParamRow label="Chain-strip mode" hint="How feature-edge triangulation is computed">
                    <select
                        className="ed-select"
                        value={pipeline.chainStripMode}
                        onChange={e => onChange('chainStripMode', e.target.value as ChainStripMode)}
                    >
                        <option value="cdt">Local CDT (best quality)</option>
                        <option value="sweep-repair">Sweep + repair</option>
                        <option value="sweep">Sweep (fastest)</option>
                    </select>
                </ParamRow>
                <ParamRow label="Strip density" hint="Extra vertices near chains (1=min, 12=very dense)">
                    <RangeSlider value={pipeline.chainStripDensity} min={1} max={12} step={1}
                        onChange={v => onChange('chainStripDensity', v)} />
                </ParamRow>
                <ParamRow label="Strip expansion" hint="Extra columns padded around chain strips (0=none, 4=wide)">
                    <RangeSlider value={pipeline.chainStripExpansion} min={0} max={4} step={1}
                        onChange={v => onChange('chainStripExpansion', v)} />
                </ParamRow>
                <ParamRow label="Strip adaptive refine" hint="Subdivide long edges in chain strips (not yet implemented)">
                    <Toggle value={pipeline.chainStripAdaptiveRefine}
                        onChange={v => onChange('chainStripAdaptiveRefine', v)} />
                </ParamRow>
                <ParamRow label="Chain-directed flip" hint="Forces mesh diagonals along ridge lines">
                    <Toggle value={pipeline.chainDirectedFlip} onChange={v => onChange('chainDirectedFlip', v)} />
                </ParamRow>
                <ParamRow label="3D edge flip" hint="Dihedral + min-angle quality improvement">
                    <Toggle value={pipeline.edgeFlip3D} onChange={v => onChange('edgeFlip3D', v)} />
                </ParamRow>
            </StageSection>

            {/* Phase 04 — Mesh Optimization */}
            <StageSection id="p4" phase="04" label="Mesh Optimization"
                expanded={expandedStages.has('p4')} onToggle={() => onToggleStage('p4')}>
                <ParamRow label="Chain-strip optimizer" hint="Phase A/B/C targeted flips around ridge boundaries">
                    <Toggle value={pipeline.chainStripOptimizer} onChange={v => onChange('chainStripOptimizer', v)} />
                </ParamRow>
                <ParamRow label="Boundary diagonal opt." hint="Cross-boundary cell diagonal adjustment">
                    <Toggle value={pipeline.boundaryDiagOpt} onChange={v => onChange('boundaryDiagOpt', v)} />
                </ParamRow>
                <ParamRow label="GPU-surface subdivision" hint="Splits long edges in chain-adjacent zones">
                    <Toggle value={pipeline.gpuSubdivision} onChange={v => onChange('gpuSubdivision', v)} />
                </ParamRow>
            </StageSection>

            {/* Phase 05 — Anisotropic Relaxation */}
            <StageSection id="p5" phase="05" label="Anisotropic Relaxation"
                expanded={expandedStages.has('p5')} onToggle={() => onToggleStage('p5')}
                stageEnabled={pipeline.relaxIterations > 0}
                onStageEnabledChange={v => onChange('relaxIterations', v ? 20 : 0)}>
                <ParamRow label="Iterations" hint="0 = off · 20 = balanced · 100+ = slow">
                    <RangeSlider value={pipeline.relaxIterations} min={0} max={200} step={10}
                        onChange={v => onChange('relaxIterations', v)} />
                </ParamRow>
                {pipeline.relaxIterations > 0 && (
                    <p className="ed-stage-note ed-stage-note--warn">
                        ⚠ GPU snap/relax was disabled in v7.2 after causing mesh corruption.
                        Enable only for experimental testing.
                    </p>
                )}
            </StageSection>
        </div>
    </div>
);

// ============================================================================
// Debug Tab
// ============================================================================

interface DebugTabProps {
    flags: Partial<PipelineFeatureFlags>;
    onFlagChange: <K extends keyof PipelineFeatureFlags>(key: K, value: boolean) => void;
    showChainOverlay: boolean;
    showPeakOverlay: boolean;
    onChainOverlayChange: (v: boolean) => void;
    onPeakOverlayChange: (v: boolean) => void;
    diagnostics: ExportDiagnostics | null;
}

const DebugTab: React.FC<DebugTabProps> = ({
    flags, onFlagChange,
    showChainOverlay, showPeakOverlay, onChainOverlayChange, onPeakOverlayChange,
    diagnostics,
}) => (
    <div className="ed-debug-tab">
        {/* Feature flags */}
        <div className="ed-section">
            <div className="ed-section__label">PIPELINE FEATURE FLAGS</div>
            <p className="ed-flag-note">
                Conforming export is the production default (ON). The rest are experimental
                paths defaulting to OFF — enable one at a time to isolate effects.
            </p>
            <div className="ed-flag-list">
                <ParamRow label="Conforming mesher (watertight, production default)" hint="By-construction watertight outer wall — skips legacy optimization + repair battery">
                    <Toggle value={isConformingActive(flags)} onChange={v => onFlagChange('conformingMesher', v)} />
                </ParamRow>
                <ParamRow label="Metric-aware refinement" hint="UV metric tensor for edge-split priority">
                    <Toggle value={Boolean(flags.metricAwareRefinement)} onChange={v => onFlagChange('metricAwareRefinement', v)} />
                </ParamRow>
                <ParamRow label="Distortion gating" hint="p95 / p999 stretch ratio validation gates">
                    <Toggle value={Boolean(flags.distortionGating)} onChange={v => onFlagChange('distortionGating', v)} />
                </ParamRow>
                <ParamRow label="GPU fidelity check" hint="High-accuracy surface fidelity gate (requires GPU)">
                    <Toggle value={Boolean(flags.gpuFidelityCheck)} onChange={v => onFlagChange('gpuFidelityCheck', v)} />
                </ParamRow>
                <ParamRow label="Seam healing" hint="Ghost segment insertion for seam gap repair">
                    <Toggle value={Boolean(flags.seamHealing)} onChange={v => onFlagChange('seamHealing', v)} />
                </ParamRow>
                <ParamRow label="Edge collapse" hint="QEM-based removal of over-tessellated edges">
                    <Toggle value={Boolean(flags.edgeCollapseEnabled)} onChange={v => onFlagChange('edgeCollapseEnabled', v)} />
                </ParamRow>
                <ParamRow label="Outer-wall corridor planning" hint="Planner-authored corridor ownership for supported seam/overlap cases">
                    <Toggle value={Boolean(flags.outerWallCorridorPlanning)} onChange={v => onFlagChange('outerWallCorridorPlanning', v)} />
                </ParamRow>
                <ParamRow label="Corridor diagnostics" hint="Logs dry-run corridor candidate coverage and support decisions">
                    <Toggle
                        value={Boolean(flags.outerWallCorridorDiagnostics)}
                        onChange={v => onFlagChange('outerWallCorridorDiagnostics', v)}
                    />
                </ParamRow>
            </div>
            {Boolean(flags.outerWallCorridorPlanning) && !Boolean(flags.outerWallCorridorDiagnostics) && (
                <p className="ed-flag-note">
                    Corridor planning is enabled. Turn on diagnostics to log supported coverage and candidate breakdown during export.
                </p>
            )}
        </div>

        {/* Overlays */}
        <div className="ed-section">
            <div className="ed-section__label">VIEWPORT OVERLAYS</div>
            <div className="ed-overlay-list">
                <ParamRow label="Chain lines" hint="Magenta — ridge / valley paths projected on surface">
                    <Toggle value={showChainOverlay} onChange={onChainOverlayChange} />
                </ParamRow>
                <ParamRow label="Peak / valley points" hint="Green = peaks · Blue = valleys">
                    <Toggle value={showPeakOverlay} onChange={onPeakOverlayChange} />
                </ParamRow>
            </div>
        </div>

        {/* Diagnostics */}
        <div className="ed-section">
            <div className="ed-section__label">LAST EXPORT DIAGNOSTICS</div>
            {diagnostics ? (
                <div className="ed-diagnostics">
                    {diagnostics.phases.map((phase, i) => (
                        <React.Fragment key={i}>
                            <div className="ed-diag-row">
                                <span className="ed-diag-row__name">{phase.name}</span>
                                <span className="ed-diag-row__dots" />
                                <span className="ed-diag-row__value">{phase.timeMs.toFixed(1)} ms</span>
                            </div>
                            {phase.details?.map((d, j) => (
                                <div key={j} className="ed-diag-detail">{d}</div>
                            ))}
                        </React.Fragment>
                    ))}
                    <div className="ed-diag-divider" />
                    <div className="ed-diag-row">
                        <span className="ed-diag-row__name">Chains</span>
                        <span className="ed-diag-row__dots" />
                        <span className="ed-diag-row__value">
                            {diagnostics.chainCount} chains · {diagnostics.chainPoints.toLocaleString()} pts
                        </span>
                    </div>
                    <div className="ed-diag-row">
                        <span className="ed-diag-row__name">Chain flips</span>
                        <span className="ed-diag-row__dots" />
                        <span className="ed-diag-row__value">{diagnostics.chainFlips.toLocaleString()}</span>
                    </div>
                    <div className="ed-diag-row">
                        <span className="ed-diag-row__name">3D edge flips</span>
                        <span className="ed-diag-row__dots" />
                        <span className="ed-diag-row__value">{diagnostics.genericFlips3D.toLocaleString()}</span>
                    </div>
                    <div className="ed-diag-row">
                        <span className="ed-diag-row__name">Subdivision splits</span>
                        <span className="ed-diag-row__dots" />
                        <span className="ed-diag-row__value">{diagnostics.subdivSplits.toLocaleString()}</span>
                    </div>
                    <div className="ed-diag-divider" />
                    <div className="ed-diag-row">
                        <span className="ed-diag-row__name">Valence dist.</span>
                        <span className="ed-diag-row__dots" />
                        <span className="ed-diag-row__value">
                            <span className="ed-val--low">{diagnostics.valenceLow} low</span>
                            {' · '}
                            <span className="ed-val--ideal">{diagnostics.valenceIdeal} ideal</span>
                            {' · '}
                            <span className="ed-val--muted">{diagnostics.valenceHigh} high</span>
                        </span>
                    </div>
                    <div className="ed-diag-row">
                        <span className="ed-diag-row__name">Cross-row tris</span>
                        <span className="ed-diag-row__dots" />
                        <span className={`ed-diag-row__value ${diagnostics.crossRowTris > 0 ? 'ed-val--warn' : ''}`}>
                            {diagnostics.crossRowTris.toLocaleString()}
                        </span>
                    </div>
                    <div className="ed-diag-row">
                        <span className="ed-diag-row__name">Aspect &gt;5</span>
                        <span className="ed-diag-row__dots" />
                        <span className={`ed-diag-row__value ${diagnostics.aspectOver5 > 100 ? 'ed-val--warn' : ''}`}>
                            {diagnostics.aspectOver5.toLocaleString()}
                        </span>
                    </div>
                    {diagnostics.refinement && (
                        <>
                            <div className="ed-diag-divider" />
                            <div className="ed-diag-row">
                                <span className="ed-diag-row__name">Refinement loops</span>
                                <span className="ed-diag-row__dots" />
                                <span className="ed-diag-row__value">
                                    {diagnostics.refinement.iterations} ({diagnostics.refinement.stopReason})
                                </span>
                            </div>
                            <div className="ed-diag-row">
                                <span className="ed-diag-row__name">Max error</span>
                                <span className="ed-diag-row__dots" />
                                <span className="ed-diag-row__value">
                                    {diagnostics.refinement.maxPosErrorMm.toFixed(3)}mm · {diagnostics.refinement.maxNormalErrorDeg.toFixed(1)}°
                                </span>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="ed-empty-diag">
                    Run an export to see per-stage diagnostics
                </div>
            )}
        </div>
    </div>
);

// ============================================================================
// Main Dialog
// ============================================================================

export const ExportDialog: React.FC<ExportDialogProps> = ({
    isOpen, onClose, potName = 'PotFoundry',
    onExport, onPreview,
    isGenerating, generationStatus, generationPhase, generationProgress,
    stats, validation, validationSummary, diagnostics, isAvailable,
    showChainOverlay, showPeakOverlay, onChainOverlayChange, onPeakOverlayChange,
}) => {
    const [activeTab, setActiveTab] = useState<TabId>('export');
    // Default to HIGH quality + 3MF: the conforming export's fidelity follows the
    // quality profile (high = 0.05mm chord → facet-free below printer resolution),
    // and 3MF compresses the larger high-fidelity meshes ~6x vs STL (Cura reads it
    // natively, with mm units). Pick 'ultra' for resin; 'standard'/'draft' for speed.
    const [qualityProfile, setQualityProfile] = useState<QualityProfileName>('high');
    const [format, setFormat] = useState<ExportFormat>('3mf');
    const [budgetMB, setBudgetMB] = useState<number>(QUALITY_PROFILES.high.mb);
    const [tolerances, setTolerances] = useState<ExportTolerances>({ ...PROFILE_DEFINITIONS.high.tolerances });
    const [pipeline, setPipeline] = useState<PipelineConfig>(DEFAULT_PIPELINE_CONFIG);
    const [flags, setFlags] = useState<Partial<PipelineFeatureFlags>>(DEFAULT_FLAGS);
    const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
    const dialogRef = useRef<HTMLDivElement>(null);

    const handleQualitySelect = useCallback((p: QualityProfileName) => {
        setQualityProfile(p);
        setBudgetMB(QUALITY_PROFILES[p].mb);
        setTolerances({ ...PROFILE_DEFINITIONS[p].tolerances });
    }, []);

    const setToleranceField = useCallback(<K extends keyof ExportTolerances>(key: K, value: ExportTolerances[K]) => {
        setTolerances(prev => ({ ...prev, [key]: value }));
    }, []);

    const toggleStage = useCallback((id: string) => {
        setExpandedStages(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const setPipelineField = useCallback(<K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) => {
        setPipeline(prev => ({ ...prev, [key]: value }));
    }, []);

    const setFlag = useCallback(<K extends keyof PipelineFeatureFlags>(key: K, value: boolean) => {
        setFlags(prev => {
            if (key === 'outerWallCorridorPlanning') {
                return {
                    ...prev,
                    outerWallCorridorPlanning: value,
                    outerWallCorridorDiagnostics: value ? prev.outerWallCorridorDiagnostics : false,
                };
            }

            if (key === 'outerWallCorridorDiagnostics') {
                return {
                    ...prev,
                    outerWallCorridorPlanning: value ? true : prev.outerWallCorridorPlanning,
                    outerWallCorridorDiagnostics: value,
                };
            }

            return { ...prev, [key]: value };
        });
    }, []);

    const buildConfig = useCallback((): ExportDialogConfig => ({
        qualityProfile, format, budgetMB, pipeline, featureFlags: flags, toleranceOverrides: tolerances,
    }), [qualityProfile, format, budgetMB, pipeline, flags, tolerances]);

    // Close on backdrop click
    const handleBackdrop = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const trisEst = Math.floor((budgetMB * 1_000_000 - 84) / 50);
    const trisLabel = trisEst >= 1_000_000
        ? `${(trisEst / 1_000_000).toFixed(1)}M`
        : `${(trisEst / 1000).toFixed(0)}K`;

    return (
        <div className="ed-backdrop" onClick={handleBackdrop}>
            <div className="ed-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Export">

                {/* Header */}
                <div className="ed-header">
                    <div className="ed-header__left">
                        <span className="ed-header__eyebrow">EXPORT</span>
                        <span className="ed-header__name">{potName}</span>
                        <span className="ed-header__badge">{trisLabel} △</span>
                    </div>
                    <button className="ed-close" onClick={onClose} type="button" aria-label="Close dialog">
                        <IconClose />
                    </button>
                </div>

                {/* Tabs */}
                <div className="ed-tabs">
                    {(['export', 'pipeline', 'debug'] as TabId[]).map(tab => (
                        <button
                            key={tab}
                            className={`ed-tab ${activeTab === tab ? 'ed-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                            type="button"
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                    <div className="ed-tabs__rule" />
                </div>

                {generationStatus === 'error' && generationPhase && (
                    <div className="ed-shell-error" role="alert">
                        <IconAlert />
                        <span>{generationPhase}</span>
                    </div>
                )}

                {/* Content */}
                <div className="ed-content">
                    {activeTab === 'export' && (
                        <ExportTab
                            qualityProfile={qualityProfile}
                            onQualitySelect={handleQualitySelect}
                            format={format}
                            onFormatChange={setFormat}
                            budgetMB={budgetMB}
                            onBudgetChange={setBudgetMB}
                            tolerances={tolerances}
                            onToleranceChange={setToleranceField}
                            conformingActive={isConformingActive(flags)}
                            stats={stats}
                            validation={validation}
                            validationSummary={validationSummary}
                            isGenerating={isGenerating}
                            generationPhase={generationPhase}
                            generationProgress={generationProgress}
                        />
                    )}
                    {activeTab === 'pipeline' && (
                        <PipelineTab
                            pipeline={pipeline}
                            onChange={setPipelineField}
                            expandedStages={expandedStages}
                            onToggleStage={toggleStage}
                        />
                    )}
                    {activeTab === 'debug' && (
                        <DebugTab
                            flags={flags}
                            onFlagChange={setFlag}
                            showChainOverlay={showChainOverlay}
                            showPeakOverlay={showPeakOverlay}
                            onChainOverlayChange={onChainOverlayChange}
                            onPeakOverlayChange={onPeakOverlayChange}
                            diagnostics={diagnostics}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="ed-footer">
                    <button className="ed-btn ed-btn--ghost" onClick={onClose} type="button">
                        Cancel
                    </button>
                    <div className="ed-footer__right">
                        <button
                            className="ed-btn ed-btn--secondary"
                            onClick={() => onPreview(buildConfig())}
                            disabled={isGenerating || !isAvailable}
                            type="button"
                        >
                            Preview Stats
                        </button>
                        <button
                            className="ed-btn ed-btn--primary"
                            onClick={() => onExport(buildConfig())}
                            disabled={isGenerating || !isAvailable}
                            type="button"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="ed-spinner" />
                                    {generationProgress > 0 ? `${generationProgress}%` : 'Generating…'}
                                </>
                            ) : (
                                <>
                                    <IconDownload />
                                    Download {format.toUpperCase()}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportDialog;
