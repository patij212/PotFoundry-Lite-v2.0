/**
 * Status Bar component.
 * 
 * Displays performance metrics and status information at the bottom.
 * 
 * @module ui/layout/StatusBar
 */

import React, { useMemo } from 'react';
import { Activity, Triangle, Box } from 'lucide-react';
import { usePerformance } from '../../state';
import './StatusBar.css';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a number with locale-aware thousands separators.
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format time in milliseconds.
 */
function formatTime(ms: number): string {
  if (ms < 1) return '<1 ms';
  return `${Math.round(ms)} ms`;
}

/**
 * Format volume in mm³ or cm³.
 */
function formatVolume(mm3: number): string {
  if (mm3 < 1000) {
    return `${Math.round(mm3)} mm³`;
  }
  const cm3 = mm3 / 1000;
  return `${cm3.toFixed(1)} cm³`;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Status bar showing performance metrics.
 */
export const StatusBar: React.FC = () => {
  const performance = usePerformance();

  // Format metrics
  const stats = useMemo(
    () => ({
      triangles: formatNumber(performance.triangleCount),
      vertices: formatNumber(performance.vertexCount),
      genTime: formatTime(performance.generationTime),
      volume: formatVolume(performance.volume),
    }),
    [performance]
  );

  return (
    <div className="pf-status-bar">
      <div className="pf-status-bar__section">
        <Triangle size={12} />
        <span>{stats.triangles} tris</span>
      </div>

      <div className="pf-status-bar__section">
        <Box size={12} />
        <span>{stats.vertices} verts</span>
      </div>

      <div className="pf-status-bar__divider" />

      <div className="pf-status-bar__section">
        <Activity size={12} />
        <span>{stats.genTime}</span>
      </div>

      {performance.volume > 0 && (
        <>
          <div className="pf-status-bar__divider" />
          <div className="pf-status-bar__section">
            <span>Vol: {stats.volume}</span>
          </div>
        </>
      )}

      {performance.isGenerating && (
        <div className="pf-status-bar__generating">
          <span className="pf-status-bar__spinner" />
          <span>Generating...</span>
        </div>
      )}
    </div>
  );
};
