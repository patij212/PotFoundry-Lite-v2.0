// _verify_weave_render.test.ts — DEV-ONLY (PF_VERIFY_WEAVE_RENDER=1). Visual adjudication of the BasketWeave sq08
// GN-red tail: the numeric finding is 250,688 facets (1.75%) with GN true-3D > 0.1mm, and the worst-300 stay at
// 0.665mm after full-azimuth fine brute-anchor (genuine gap, NOT GN-overstatement). "If a render disagrees with a
// metric, trust the render." Dump a true-3D heatmap so the tail can be SEEN. Anchors the worst-red so the visual is
// trusted (steep-lattice GN overstates). ISOLATION: reuses _weaveLib + labkit dumpHeatmap READ-ONLY.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, dumpHeatmap, buildMeshUt } from './labkit';
import { buildWeaveDoubledGrid, basketWeaveGrid } from './_weaveLib';

const RUN = process.env.PF_VERIFY_WEAVE_RENDER === '1';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const OUT = join(process.cwd(), 'research', 'exchange', '_verify_weave');

describe('render BasketWeave sq08 true-3D heatmap (visual adjudication of the GN-red tail)', () => {
  it.skipIf(!RUN)('BasketWeave sq08 anchored true-3D heatmap', () => {
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const build = buildWeaveDoubledGrid(rA, H, basketWeaveGrid(16, 10, 0), { hRowMm: 0.08, wTargetMm: 0.08, cliffChordMm: 0.08, seamMode: 'cliff' });
    const { ut, idx } = build.mesh;
    const m = buildMeshUt(ut, idx, rA, H); // lifted xyz
    // true-3D, anchor the worst-red facets so the visual is trusted (scale 0.3mm: the tail is up to 0.665mm).
    dumpHeatmap(OUT, 'BW_sq08_true3d', m.xyz, ut, idx, rA, H, {
      scaleMm: 0.3, anchorSteep: { redMm: 0.1, topK: 600 },
      meta: { style: 'BasketWeave', tag: 'BW_sq08', tris: idx.length / 3, note: 'GN-red tail 250k facets >0.1mm; worst-300 brute=0.665mm genuine' },
    });
    expect(existsSync(join(OUT, 'BW_sq08_true3d.idx.bin'))).toBe(true);
  }, 60 * 60 * 1000);
});
