/**
 * BlueprintCanvas — live SVG vessel cross-section (spec §6).
 *
 * Renders a technical cross-section drawing: gold outer generatrix mirrored
 * around x=100, fainter inner wall, dashed centerline, and dimension ticks.
 * Re-renders live from the geometry store. Static only — drag handles in Task 5.
 *
 * Layout constants (deterministic, tested):
 *   viewBox  0 0 200 130
 *   drawing area  x∈[24,176],  y∈[14,116]
 *   scale = min(76 / maxR, 102 / H)
 *   centered at x=100; base at y=116
 */

import React from 'react';
import { useAppStore } from '../../../state';
import { sampleProfile, type ProfileGeometry } from './profileSampler';
import './BlueprintCanvas.css';

// ── ViewBox / drawing-area constants ────────────────────────────────────────

const VB_W = 200;
const VB_H = 130;
const CENTER_X = 100;

/** y of the pot base in SVG coords (bottom of drawing area) */
const BASE_Y = 116;

/** Maximum available half-width in drawing area: (176-24)/2 */
const AVAIL_R = 76;

/** Maximum available height in drawing area: 116-14 */
const AVAIL_Z = 102;

/** Right edge of drawing area — H tick lands just beyond this */
const DRAW_X_MAX = 176;

// ── Layout helpers ───────────────────────────────────────────────────────────

export interface LayoutHelpers {
  scale: number;
  xOf: (r: number, side: 1 | -1) => number;
  yOf: (z: number) => number;
}

/**
 * Pure layout math consumed by BlueprintCanvas and (Task 5) drag handles.
 *
 * scale = min(76 / maxR, 102 / H)
 * xOf(r,  1) = 100 + r * scale   (right side)
 * xOf(r, -1) = 100 - r * scale   (left side — mirrors around x=100)
 * yOf(z)     = 116 - z * scale   (base at bottom, rim towards top)
 */
export function computeLayout(profile: ProfileGeometry): LayoutHelpers {
  const scale = Math.min(AVAIL_R / profile.maxR, AVAIL_Z / profile.H);
  return {
    scale,
    xOf: (r: number, side: 1 | -1): number => CENTER_X + side * r * scale,
    yOf: (z: number): number => BASE_Y - z * scale,
  };
}

// ── Internal path builder ────────────────────────────────────────────────────

function buildPolyline(
  samples: ProfileGeometry['samples'],
  rKey: 'rOuter' | 'rInner',
  side: 1 | -1,
  layout: LayoutHelpers,
): string {
  return samples
    .map((s, i) => {
      const x = layout.xOf(s[rKey], side);
      const y = layout.yOf(s.z);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

// ── Component ────────────────────────────────────────────────────────────────

export interface BlueprintCanvasProps {
  /** Container height in px (default 150) */
  height?: number;
}

export const BlueprintCanvas: React.FC<BlueprintCanvasProps> = ({ height = 150 }) => {
  const geometry = useAppStore((s) => s.geometry);
  const profile = sampleProfile(geometry);
  const layout = computeLayout(profile);
  const { xOf, yOf } = layout;

  const rimY = yOf(profile.H);
  const baseY = yOf(0); // always BASE_Y = 116

  // Dimension tick texts — integers, no units (spec §6)
  const topODText = `⌀ ${Math.round(profile.topOD)}`;
  const hText = `${Math.round(profile.H)}`;

  // ⌀ tick: above the rim, clamped inside viewBox
  const odTickY = Math.max(rimY - 3, 9);
  // H tick: vertically centred beside the pot
  const hTickY = (rimY + baseY) / 2;

  return (
    <div className="pf3-blueprint" style={{ height }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        data-testid="pf3-blueprint"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Dashed centerline at x=100 */}
        <line
          className="pf3-bp__centerline"
          x1={CENTER_X} y1="14"
          x2={CENTER_X} y2="116"
          strokeDasharray="3 3"
        />

        {/* Outer generatrix — right, then mirrored left */}
        <path
          className="pf3-bp__outer"
          d={buildPolyline(profile.samples, 'rOuter', 1, layout)}
        />
        <path
          className="pf3-bp__outer"
          d={buildPolyline(profile.samples, 'rOuter', -1, layout)}
        />

        {/* Inner wall — right, then mirrored left */}
        <path
          className="pf3-bp__inner"
          d={buildPolyline(profile.samples, 'rInner', 1, layout)}
        />
        <path
          className="pf3-bp__inner"
          d={buildPolyline(profile.samples, 'rInner', -1, layout)}
        />

        {/* ⌀ top-OD tick — above rim, centered */}
        <text
          className="pf3-mono pf3-bp__tick"
          x={CENTER_X}
          y={odTickY}
          textAnchor="middle"
        >
          {topODText}
        </text>

        {/* H tick — right of pot, vertically centred */}
        <text
          className="pf3-mono pf3-bp__tick"
          x={DRAW_X_MAX + 2}
          y={hTickY}
          dominantBaseline="middle"
        >
          {hText}
        </text>
      </svg>
    </div>
  );
};
