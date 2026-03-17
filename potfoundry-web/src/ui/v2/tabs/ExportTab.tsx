/**
 * ExportTab — Quality presets, export format, and advanced mesh settings.
 *
 * Three sections:
 * 1. Quality preset cards (2×2 grid)
 * 2. Export format selector (local state)
 * 3. Advanced settings (export resolution sliders, seam angle, optimize toggle)
 *
 * @module ui/v2/tabs/ExportTab
 */

import React, { useCallback, useMemo } from 'react';
import { SliderV2 } from '../controls/SliderV2';
import { SectionV2 } from '../controls/SectionV2';
import { ButtonV2 } from '../controls/ButtonV2';
import {
  useAppStore,
  QUALITY_PRESETS,
  type QualityPreset,
  MESH_QUALITY_BOUNDS,
  DEFAULT_MESH_QUALITY,
  type MeshQuality,
} from '../../../state';
import {
  Download,
  Settings2,
  Zap,
  Crown,
  Layers,
  Star,
} from 'lucide-react';
import { useConfidence } from '../onboarding/useConfidence';
import { useAnnounce } from '../shared/Announcer';
import { useRadioGroupKeys } from '../hooks/useRadioGroupKeys';
import clsx from 'clsx';
import './ExportTab.css';

// ============================================================================
// Static Data
// ============================================================================

interface QualityCardMeta {
  id: QualityPreset;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const QUALITY_CARDS: QualityCardMeta[] = [
  {
    id: 'draft',
    label: 'Draft',
    description: 'Fast preview, lower detail',
    icon: <Zap size={16} />,
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Balanced quality & speed',
    icon: <Layers size={16} />,
  },
  {
    id: 'high',
    label: 'High',
    description: 'Detailed, print-ready',
    icon: <Star size={16} />,
  },
  {
    id: 'ultra',
    label: 'Ultra',
    description: 'Maximum fidelity',
    icon: <Crown size={16} />,
  },
];

type ExportFormat = 'stl' | '3mf' | 'obj';

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'stl', label: 'STL', description: 'Universal 3D print format' },
  { value: '3mf', label: '3MF', description: 'Modern format with metadata' },
  { value: 'obj', label: 'OBJ', description: 'Wavefront, Blender compatible' },
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a triangle count estimate for display.
 */
function formatTriangleEstimate(count: number): string {
  if (count >= 1_000_000) {
    return `~${(count / 1_000_000).toFixed(1)}M triangles`;
  }
  if (count >= 1_000) {
    return `~${(count / 1_000).toFixed(0)}K triangles`;
  }
  return `~${count} triangles`;
}

/**
 * Detect which quality preset (if any) matches the current mesh settings.
 */
function detectActivePreset(mesh: MeshQuality): QualityPreset | null {
  for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
    if (
      mesh.export_n_theta === preset.export_n_theta &&
      mesh.export_n_z === preset.export_n_z
    ) {
      return key as QualityPreset;
    }
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

export const ExportTab: React.FC = () => {
  const mesh = useAppStore((s) => s.mesh);
  const setMeshParam = useAppStore((s) => s.setMeshParam);
  const setQualityPreset = useAppStore((s) => s.setQualityPreset);
  const estimateTriangles = useAppStore((s) => s.estimateTriangles);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const format = useAppStore((s) => s.ui.exportFormat);
  const setFormat = useAppStore((s) => s.setExportFormat);
  const { isVisible } = useConfidence();

  const runDiscreteHistoryUpdate = useCallback(
    (update: () => void) => {
      beginHistoryTransaction();
      update();
      commitHistoryTransaction();
    },
    [beginHistoryTransaction, commitHistoryTransaction]
  );

  const activePreset = useMemo(() => detectActivePreset(mesh), [mesh]);
  // estimateTriangles reads mesh internally; mesh dep triggers recompute.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const triCount = useMemo(() => estimateTriangles(), [mesh, estimateTriangles]);

  const announce = useAnnounce();
  const radioGroupKeys = useRadioGroupKeys();

  const handlePreset = useCallback(
    (preset: QualityPreset) => {
      runDiscreteHistoryUpdate(() => setQualityPreset(preset));
      const card = QUALITY_CARDS.find((c) => c.id === preset);
      if (card) announce(`Quality set to ${card.label}`);
    },
    [runDiscreteHistoryUpdate, setQualityPreset, announce]
  );

  return (
    <div className="pf2-export-tab">
      {/* ================================================================
          Quality Presets
          ================================================================ */}
      <SectionV2 title="Quality" icon={<Download size={14} />} sectionIndex={0}>
        <div className="pf2-export-tab__presets" role="radiogroup" aria-label="Quality preset" onKeyDown={radioGroupKeys}>
          {QUALITY_CARDS.map((card) => (
            <button
              key={card.id}
              className={clsx(
                'pf2-export-tab__card',
                'pf2-focus-ring',
                activePreset === card.id && 'pf2-export-tab__card--active'
              )}
              onClick={() => handlePreset(card.id)}
              role="radio"
              aria-checked={activePreset === card.id}
              aria-label={`${card.label}: ${card.description}`}
            >
              <span className="pf2-export-tab__card-icon">{card.icon}</span>
              <span className="pf2-export-tab__card-label">{card.label}</span>
              <span className="pf2-export-tab__card-desc">{card.description}</span>
            </button>
          ))}
        </div>

        {/* Triangle estimate */}
        <p className="pf2-export-tab__tri-count pf2-text-label">
          {formatTriangleEstimate(triCount)}
        </p>
      </SectionV2>

      {/* ================================================================
          Export Format
          ================================================================ */}
      {isVisible('export:format') && (
      <SectionV2 title="Format" icon={<Layers size={14} />} sectionIndex={1}>
        <div className="pf2-export-tab__format-row" role="radiogroup" aria-label="Export format" onKeyDown={radioGroupKeys}>
          {FORMAT_OPTIONS.map((opt) => (
            <ButtonV2
              key={opt.value}
              variant={format === opt.value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => { setFormat(opt.value); announce(`Export format: ${opt.label}`); }}
              role="radio"
              aria-checked={format === opt.value}
              title={opt.description}
            >
              {opt.label}
            </ButtonV2>
          ))}
        </div>
      </SectionV2>
      )}

      {/* ================================================================
          Advanced Settings (collapsed by default)
          ================================================================ */}
      {isVisible('export:advanced') && (
      <SectionV2
        title="Advanced"
        icon={<Settings2 size={14} />}
        defaultOpen={false}
        sectionIndex={2}
      >
        <SliderV2
          value={mesh.export_n_theta}
          onChange={(v) => setMeshParam('export_n_theta', v)}
          onInteractionStart={beginHistoryTransaction}
          onValueCommit={commitHistoryTransaction}
          min={MESH_QUALITY_BOUNDS.export_n_theta.min}
          max={MESH_QUALITY_BOUNDS.export_n_theta.max}
          step={MESH_QUALITY_BOUNDS.export_n_theta.step}
          defaultValue={DEFAULT_MESH_QUALITY.export_n_theta}
          label="Horizontal Resolution"
          description="Angular segments (θ)"
          decimals={0}
        />

        <SliderV2
          value={mesh.export_n_z}
          onChange={(v) => setMeshParam('export_n_z', v)}
          onInteractionStart={beginHistoryTransaction}
          onValueCommit={commitHistoryTransaction}
          min={MESH_QUALITY_BOUNDS.export_n_z.min}
          max={MESH_QUALITY_BOUNDS.export_n_z.max}
          step={MESH_QUALITY_BOUNDS.export_n_z.step}
          defaultValue={DEFAULT_MESH_QUALITY.export_n_z}
          label="Vertical Resolution"
          description="Height segments (Z)"
          decimals={0}
        />

        <SliderV2
          value={mesh.seamAngle}
          onChange={(v) => setMeshParam('seamAngle', v)}
          onInteractionStart={beginHistoryTransaction}
          onValueCommit={commitHistoryTransaction}
          min={MESH_QUALITY_BOUNDS.seamAngle.min}
          max={MESH_QUALITY_BOUNDS.seamAngle.max}
          step={MESH_QUALITY_BOUNDS.seamAngle.step}
          defaultValue={DEFAULT_MESH_QUALITY.seamAngle}
          label="Seam Blend"
          description="Blending zone width at 0°/360° seam"
          unit="°"
          decimals={0}
        />

        <div className="pf2-export-tab__optimize-row">
          <ButtonV2
            variant={mesh.optimize ? 'primary' : 'secondary'}
            size="sm"
            onClick={() =>
              runDiscreteHistoryUpdate(() => setMeshParam('optimize', !mesh.optimize))
            }
            aria-pressed={mesh.optimize}
          >
            GPU Optimize
          </ButtonV2>
          <span className="pf2-text-label">
            Merge flat regions for smaller files
          </span>
        </div>
      </SectionV2>
      )}
    </div>
  );
};
