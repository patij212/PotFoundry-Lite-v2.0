/**
 * Mesh quality controls component.
 * 
 * Provides controls for mesh resolution (preview and export quality).
 * 
 * @module ui/controls/MeshControls
 */

import React, { useCallback, useMemo } from 'react';
import { Grid3x3, Zap } from 'lucide-react';
import { Select, type SelectOption } from '../shared/Select';
import { Slider } from '../shared/Slider';
import { Section, SectionGroup } from '../shared/Section';
import {
  useMesh,
  useMeshActions,
  QUALITY_PRESETS,
  MESH_QUALITY_BOUNDS,
  type QualityPreset,
} from '../../state';
import './MeshControls.css';

// ============================================================================
// Preset Options
// ============================================================================

const PRESET_OPTIONS: SelectOption[] = [
  {
    value: 'draft',
    label: 'Draft',
    description: 'Fast preview, lower quality',
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'Balanced quality and speed',
  },
  {
    value: 'high',
    label: 'High',
    description: 'High quality for final preview',
  },
  {
    value: 'ultra',
    label: 'Ultra',
    description: 'Maximum quality (slower)',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Manual resolution settings',
  },
];

// ============================================================================
// Component
// ============================================================================

/**
 * Controls for mesh quality/resolution settings.
 */
export const MeshControls: React.FC = () => {
  const mesh = useMesh();
  const { setMeshParam, setQualityPreset, estimateTriangles } = useMeshActions();

  // Determine current preset (or 'custom' if manual)
  const currentPreset = useMemo(() => {
    for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
      if (
        preset.preview_n_theta === mesh.preview_n_theta &&
        preset.preview_n_z === mesh.preview_n_z &&
        preset.export_n_theta === mesh.export_n_theta &&
        preset.export_n_z === mesh.export_n_z
      ) {
        return key;
      }
    }
    return 'custom';
  }, [mesh]);

  // Triangle count estimate
  const triangleCount = useMemo(() => estimateTriangles(), [mesh, estimateTriangles]);

  // Handle preset change
  const handlePresetChange = useCallback(
    (value: string) => {
      if (value !== 'custom' && value in QUALITY_PRESETS) {
        setQualityPreset(value as QualityPreset);
      }
    },
    [setQualityPreset]
  );

  // Individual slider handlers
  const handlePreviewTheta = useCallback(
    (value: number) => setMeshParam('preview_n_theta', value),
    [setMeshParam]
  );

  const handlePreviewZ = useCallback(
    (value: number) => setMeshParam('preview_n_z', value),
    [setMeshParam]
  );

  const handleExportTheta = useCallback(
    (value: number) => setMeshParam('export_n_theta', value),
    [setMeshParam]
  );

  const handleExportZ = useCallback(
    (value: number) => setMeshParam('export_n_z', value),
    [setMeshParam]
  );

  const isCustom = currentPreset === 'custom';

  return (
    <Section title="Mesh Quality" icon={<Grid3x3 size={16} />} defaultOpen={false}>
      <Select
        label="Quality Preset"
        value={currentPreset}
        onChange={handlePresetChange}
        options={PRESET_OPTIONS}
      />

      <div className="pf-mesh-stats">
        <Zap size={14} />
        <span>~{triangleCount.toLocaleString()} triangles (preview)</span>
      </div>

      <SectionGroup label="Preview Resolution">
        <div className="pf-mesh-row">
          <Slider
            label="θ segments"
            value={mesh.preview_n_theta}
            onChange={handlePreviewTheta}
            min={MESH_QUALITY_BOUNDS.preview_n_theta.min}
            max={MESH_QUALITY_BOUNDS.preview_n_theta.max}
            step={MESH_QUALITY_BOUNDS.preview_n_theta.step}
          />

          <Slider
            label="Z segments"
            value={mesh.preview_n_z}
            onChange={handlePreviewZ}
            min={MESH_QUALITY_BOUNDS.preview_n_z.min}
            max={MESH_QUALITY_BOUNDS.preview_n_z.max}
            step={MESH_QUALITY_BOUNDS.preview_n_z.step}
          />
        </div>
      </SectionGroup>

      <SectionGroup label="Export Resolution">
        <div className="pf-mesh-row">
          <Slider
            label="θ segments"
            value={mesh.export_n_theta}
            onChange={handleExportTheta}
            min={MESH_QUALITY_BOUNDS.export_n_theta.min}
            max={MESH_QUALITY_BOUNDS.export_n_theta.max}
            step={MESH_QUALITY_BOUNDS.export_n_theta.step}
          />

          <Slider
            label="Z segments"
            value={mesh.export_n_z}
            onChange={handleExportZ}
            min={MESH_QUALITY_BOUNDS.export_n_z.min}
            max={MESH_QUALITY_BOUNDS.export_n_z.max}
            step={MESH_QUALITY_BOUNDS.export_n_z.step}
          />
        </div>
      </SectionGroup>

      <SectionGroup label="Seam Controls (Advanced)">
        <div className="pf-mesh-row">
          <Slider
            label="Seam Blend Angle"
            value={mesh.seamAngle ?? 0}
            onChange={(v) => setMeshParam('seamAngle', v)}
            min={MESH_QUALITY_BOUNDS.seamAngle.min}
            max={MESH_QUALITY_BOUNDS.seamAngle.max}
            step={MESH_QUALITY_BOUNDS.seamAngle.step}
          />
        </div>
      </SectionGroup>
    </Section>
  );
};
