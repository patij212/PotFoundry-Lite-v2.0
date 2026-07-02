import type { GeometryParams } from '../../../state/types';

export const GEOMETRY_LABELS: Record<keyof GeometryParams, { label: string; unit?: string }> = {
  H: { label: 'Height', unit: 'mm' },
  top_od: { label: 'Top diameter', unit: 'mm' },
  bottom_od: { label: 'Bottom diameter', unit: 'mm' },
  t_wall: { label: 'Wall thickness', unit: 'mm' },
  t_bottom: { label: 'Base thickness', unit: 'mm' },
  r_drain: { label: 'Drain radius', unit: 'mm' },
  expn: { label: 'Flare' },
  bellAmp: { label: 'Bell amount' },
  bellCenter: { label: 'Bell position' },
  bellWidth: { label: 'Bell width' },
  spinTurns: { label: 'Twist turns' },
  spinPhase: { label: 'Twist phase', unit: '°' },
  spinCurve: { label: 'Twist curve' },
};
