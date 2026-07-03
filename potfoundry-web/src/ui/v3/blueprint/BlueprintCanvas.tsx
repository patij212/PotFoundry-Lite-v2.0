/**
 * BlueprintCanvas — live SVG vessel cross-section (spec §6).
 *
 * Renders a technical cross-section drawing: gold outer generatrix mirrored
 * around x=100, fainter inner wall, dashed centerline, dimension ticks, and
 * 4 interactive drag handles (Task 5: rim, base, height, belly).
 *
 * Layout constants (deterministic, tested):
 *   viewBox  0 0 200 130
 *   drawing area  x∈[24,176],  y∈[14,116]
 *   scale = min(76 / maxR, 102 / H)
 *   centered at x=100; base at y=116
 */

import React, { useRef } from 'react';
import { useAppStore, GEOMETRY_BOUNDS } from '../../../state';
import { sampleProfile, type ProfileGeometry } from './profileSampler';
import { useTouchMode } from '../mobile/TouchModeContext';
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
 * Pure layout math consumed by BlueprintCanvas and drag handles.
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

// ── Drag handle helpers ──────────────────────────────────────────────────────

type HandleId = 'rim' | 'base' | 'height' | 'belly';

interface DragState {
  handle: HandleId;
  startClientX: number;
  startClientY: number;
  startValue: number;
  layoutScale: number;
  vbScale: number;
}

/**
 * Snap `v` to the nearest multiple of `step` above `min`, then round to the
 * number of decimal places implied by `step`.
 */
function snap(v: number, step: number, min: number): number {
  const snapped = min + Math.round((v - min) / step) * step;
  const dec = (String(step).split('.')[1] ?? '').length;
  return Number(snapped.toFixed(dec));
}

function applyBounds(
  v: number,
  bounds: { min: number; max: number; step: number },
): number {
  return Math.min(bounds.max, Math.max(bounds.min, snap(v, bounds.step, bounds.min)));
}

// ── Component ────────────────────────────────────────────────────────────────

export interface BlueprintCanvasProps {
  /** Container height in px (default 150) */
  height?: number;
}

export const BlueprintCanvas: React.FC<BlueprintCanvasProps> = ({ height = 150 }) => {
  const geometry = useAppStore((s) => s.geometry);
  const setGeometryParam = useAppStore((s) => s.setGeometryParam);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const isStrip = useTouchMode();
  const containerHeight = isStrip ? 64 : height;
  const containerClass = `pf3-blueprint${isStrip ? ' pf3-blueprint--strip' : ''}`;
  const handleRadius = isStrip ? 12 : 6;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const profile = sampleProfile(geometry);
  const layout = computeLayout(profile);
  const { xOf, yOf } = layout;

  const rimY = yOf(profile.H);
  const baseY = yOf(0); // always BASE_Y = 116

  // Dimension tick texts — integers, no units (spec §6)
  const topODText = `⌀ ${Math.round(profile.topOD)}`;
  const hText = `${Math.round(profile.H)}`;

  // ⌀ tick: fixed above drawing area to avoid collision with height handle
  const odTickY = 8;
  // H tick: vertically centred beside the pot
  const hTickY = (rimY + baseY) / 2;

  // Belly handle position — right generatrix at bellCenter height
  const bellyIdx = Math.min(
    Math.round(geometry.bellCenter * (profile.samples.length - 1)),
    profile.samples.length - 1,
  );
  const bellySample = profile.samples[bellyIdx];

  // ── Event handlers ─────────────────────────────────────────────────────────

  function onHandlePointerDown(
    e: React.PointerEvent<SVGCircleElement>,
    handle: HandleId,
    startValue: number,
  ) {
    // Once per gesture: ignore stray extra pointers while a drag is live —
    // a second begin without a commit would unbalance the history transaction.
    if (dragRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const svgRect = svgRef.current?.getBoundingClientRect() ?? { width: VB_W };
    const vbScale = VB_W / svgRect.width;
    beginHistoryTransaction();
    dragRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startValue,
      layoutScale: layout.scale,
      vbScale,
    };
  }

  function onSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    if (drag.handle === 'rim') {
      const newOD = drag.startValue + (dx * drag.vbScale / drag.layoutScale) * 2;
      setGeometryParam('top_od', applyBounds(newOD, GEOMETRY_BOUNDS.top_od));
    } else if (drag.handle === 'base') {
      const newOD = drag.startValue + (dx * drag.vbScale / drag.layoutScale) * 2;
      setGeometryParam('bottom_od', applyBounds(newOD, GEOMETRY_BOUNDS.bottom_od));
    } else if (drag.handle === 'height') {
      const newH = drag.startValue - (dy * drag.vbScale / drag.layoutScale);
      setGeometryParam('H', applyBounds(newH, GEOMETRY_BOUNDS.H));
    } else {
      // belly
      const newAmp = drag.startValue + dx * 0.01;
      setGeometryParam('bellAmp', applyBounds(newAmp, GEOMETRY_BOUNDS.bellAmp));
    }
  }

  function onSvgPointerUp() {
    if (dragRef.current) {
      commitHistoryTransaction();
      dragRef.current = null;
    }
  }

  function onHandleKeyDown(
    e: React.KeyboardEvent<SVGCircleElement>,
    handle: HandleId,
    currentValue: number,
  ) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const multiplier = e.shiftKey ? 10 : 1;
    const sign = e.key === 'ArrowUp' ? 1 : -1;

    beginHistoryTransaction();

    if (handle === 'rim') {
      const b = GEOMETRY_BOUNDS.top_od;
      setGeometryParam('top_od', applyBounds(currentValue + sign * b.step * multiplier, b));
    } else if (handle === 'base') {
      const b = GEOMETRY_BOUNDS.bottom_od;
      setGeometryParam('bottom_od', applyBounds(currentValue + sign * b.step * multiplier, b));
    } else if (handle === 'height') {
      const b = GEOMETRY_BOUNDS.H;
      setGeometryParam('H', applyBounds(currentValue + sign * b.step * multiplier, b));
    } else {
      // belly
      const b = GEOMETRY_BOUNDS.bellAmp;
      setGeometryParam('bellAmp', applyBounds(currentValue + sign * b.step * multiplier, b));
    }

    commitHistoryTransaction();
  }

  return (
    <div className={containerClass} style={{ height: containerHeight }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        data-testid="pf3-blueprint"
        role="group"
        aria-label="Vessel cross-section — drag handles adjust dimensions"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerCancel={onSvgPointerUp}
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

        {/* Rim closure — horizontal line connecting outer paths at the top */}
        <line
          className="pf3-bp__edge"
          x1={xOf(profile.topOD / 2, -1)}
          y1={rimY}
          x2={xOf(profile.topOD / 2, 1)}
          y2={rimY}
        />

        {/* Base closure — horizontal line connecting outer paths at the bottom */}
        <line
          className="pf3-bp__edge"
          x1={xOf(profile.bottomOD / 2, -1)}
          y1={baseY}
          x2={xOf(profile.bottomOD / 2, 1)}
          y2={baseY}
        />

        {/* ⌀ top-OD tick — above drawing area, offset right to avoid height handle */}
        <text
          className="pf3-mono pf3-bp__tick"
          x={104}
          y={odTickY}
          textAnchor="start"
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

        {/* ── Drag handles ─────────────────────────────────────────────────── */}

        {/* rim — horizontal drag, controls top_od */}
        <circle
          className="pf3-bp__handle"
          data-testid="pf3-bp-handle-rim"
          data-pf3-focusable=""
          role="slider"
          aria-label="Rim diameter"
          aria-valuenow={geometry.top_od}
          aria-valuemin={GEOMETRY_BOUNDS.top_od.min}
          aria-valuemax={GEOMETRY_BOUNDS.top_od.max}
          tabIndex={0}
          cx={xOf(profile.topOD / 2, 1)}
          cy={rimY}
          r={handleRadius}
          onPointerDown={(e) => onHandlePointerDown(e, 'rim', geometry.top_od)}
          onKeyDown={(e) => onHandleKeyDown(e, 'rim', geometry.top_od)}
        />

        {/* base — horizontal drag, controls bottom_od */}
        <circle
          className="pf3-bp__handle"
          data-testid="pf3-bp-handle-base"
          data-pf3-focusable=""
          role="slider"
          aria-label="Base diameter"
          aria-valuenow={geometry.bottom_od}
          aria-valuemin={GEOMETRY_BOUNDS.bottom_od.min}
          aria-valuemax={GEOMETRY_BOUNDS.bottom_od.max}
          tabIndex={0}
          cx={xOf(profile.bottomOD / 2, 1)}
          cy={baseY}
          r={handleRadius}
          onPointerDown={(e) => onHandlePointerDown(e, 'base', geometry.bottom_od)}
          onKeyDown={(e) => onHandleKeyDown(e, 'base', geometry.bottom_od)}
        />

        {/* height — vertical drag, controls H */}
        <circle
          className="pf3-bp__handle"
          data-testid="pf3-bp-handle-height"
          data-pf3-focusable=""
          role="slider"
          aria-label="Height"
          aria-valuenow={geometry.H}
          aria-valuemin={GEOMETRY_BOUNDS.H.min}
          aria-valuemax={GEOMETRY_BOUNDS.H.max}
          tabIndex={0}
          cx={CENTER_X}
          cy={rimY}
          r={handleRadius}
          onPointerDown={(e) => onHandlePointerDown(e, 'height', geometry.H)}
          onKeyDown={(e) => onHandleKeyDown(e, 'height', geometry.H)}
        />

        {/* belly — horizontal drag, controls bellAmp */}
        <circle
          className="pf3-bp__handle"
          data-testid="pf3-bp-handle-belly"
          data-pf3-focusable=""
          role="slider"
          aria-label="Belly amplitude"
          aria-valuenow={geometry.bellAmp}
          aria-valuemin={GEOMETRY_BOUNDS.bellAmp.min}
          aria-valuemax={GEOMETRY_BOUNDS.bellAmp.max}
          tabIndex={0}
          cx={xOf(bellySample.rOuter, 1)}
          cy={yOf(bellySample.z)}
          r={handleRadius}
          onPointerDown={(e) => onHandlePointerDown(e, 'belly', geometry.bellAmp)}
          onKeyDown={(e) => onHandleKeyDown(e, 'belly', geometry.bellAmp)}
        />
      </svg>
    </div>
  );
};
