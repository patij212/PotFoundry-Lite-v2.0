import React, { useCallback } from 'react';
import { BlueprintCanvas } from '../blueprint/BlueprintCanvas';
import { ParamRow } from '../primitives/ParamRow';
import { DisclosureSeam } from '../primitives/DisclosureSeam';
import { useAppStore } from '../../../state';
import { DEFAULT_GEOMETRY, GEOMETRY_BOUNDS, type GeometryParams } from '../../../state/types';
import { GEOMETRY_LABELS } from './labels';

const SIZE_KEYS: Array<keyof GeometryParams> = ['H', 'top_od', 'bottom_od'];
const STRUCTURE_KEYS: Array<keyof GeometryParams> = ['t_wall', 't_bottom', 'r_drain', 'expn'];
const ORNAMENT_KEYS: Array<keyof GeometryParams> = [
  'bellAmp', 'bellCenter', 'bellWidth', 'spinTurns', 'spinPhase', 'spinCurve',
];

export const ShapeTab: React.FC = () => {
  const geometry = useAppStore((s) => s.geometry);
  const setGeometryParam = useAppStore((s) => s.setGeometryParam);
  const beginHistoryTransaction = useAppStore((s) => s.beginHistoryTransaction);
  const commitHistoryTransaction = useAppStore((s) => s.commitHistoryTransaction);

  const row = useCallback(
    (key: keyof GeometryParams) => {
      const bounds = GEOMETRY_BOUNDS[key];
      const meta = GEOMETRY_LABELS[key];
      return (
        <ParamRow
          key={key}
          label={meta.label}
          unit={meta.unit}
          value={geometry[key]}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          defaultValue={DEFAULT_GEOMETRY[key]}
          onChange={(v) => setGeometryParam(key, v)}
          onInteractionStart={beginHistoryTransaction}
          onValueCommit={commitHistoryTransaction}
          data-testid={`pf3-param-${key}`}
        />
      );
    },
    [geometry, setGeometryParam, beginHistoryTransaction, commitHistoryTransaction],
  );

  return (
    <div className="pf3-shape-tab">
      <BlueprintCanvas />
      <div className="pf3-section-voice">Size</div>
      {SIZE_KEYS.map(row)}
      <DisclosureSeam id="shape-structure" summary="advanced — walls, drain & flare">
        {STRUCTURE_KEYS.map(row)}
      </DisclosureSeam>
      <div className="pf3-section-voice">Bell &amp; twist</div>
      <DisclosureSeam id="shape-ornament" summary="advanced — bell & twist">
        {ORNAMENT_KEYS.map(row)}
      </DisclosureSeam>
    </div>
  );
};
