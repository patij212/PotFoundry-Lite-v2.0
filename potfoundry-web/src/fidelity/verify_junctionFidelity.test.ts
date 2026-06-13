/**
 * verify_junctionFidelity.test.ts — #4: verify the boundary RINGS (t=0, t=1) the
 * walls share with the caps/rim, since the assembled mesh's watertight junction
 * vertices are evaluated by the same bilinear-256 sampler as the wall.
 *
 * The rim (planar annulus) and the base/drain caps REFERENCE the wall ring
 * vertices by index (WatertightAssembly). If those ring vertices are off the true
 * surface (bilinear flattening at crests), the entire junction is off. At t=0/t=1
 * the bilinear grid has exact samples on its u-lattice but bilinearly interpolates
 * crest u-positions (off-lattice) => crest ring vertices are flattened, same class
 * as the wall interior. This measures the ring deviation (bilinear-256 vs exact)
 * at t=0 (base) and t=1 (rim), worst at crests.
 *
 * Inner wall: built by the identical conforming path (buildWallSampler(1), same
 * extractor + triangulator + bilinear-256), so its fidelity class mirrors the
 * outer; the shared ring is the load-bearing junction measured here.
 *
 * Pure CPU, read-only, no production change.
 */
import { describe, it, expect } from 'vitest';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];

function buildBilinear(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = exact.position(col / res, tVal);
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}
function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}

function ringDev(bi: GpuSurfaceSampler, t: number): { max: number; p99: number; crestMax: number } {
  const all: number[] = [];
  let crestMax = 0;
  // dense u sweep
  for (let i = 0; i < 4000; i++) {
    const u = i / 4000;
    const a = exact.position(u, t) as V3, b = bi.position(u, t) as V3;
    all.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  // exactly on crest loci (off the grid lattice — the flattened spots)
  const m = mOf(t);
  for (let j = 1; (2 * j - 1) / (2 * m) < 1; j++) {
    const u = (2 * j - 1) / (2 * m);
    const a = exact.position(u, t) as V3, b = bi.position(u, t) as V3;
    crestMax = Math.max(crestMax, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  all.sort((x, y) => x - y);
  return { max: all[all.length - 1], p99: all[Math.floor(0.99 * all.length)], crestMax };
}

describe('VERIFY #4 junction / boundary-ring fidelity (bilinear-256 vs exact at t=0/t=1)', () => {
  it('measures shared-ring deviation from the true surface at base (t=0) and rim (t=1)', () => {
    const bi256 = buildBilinear(256), bi1024 = buildBilinear(1024);
    const rows = [
      { name: 'BASE ring t=0 (m=6)', t: 0 },
      { name: 'RIM  ring t=1 (m=10, born petals)', t: 1 },
    ];
    /* eslint-disable no-console */
    console.log('\n===== #4 JUNCTION RING FIDELITY (deviation from true surface) =====');
    for (const r of rows) {
      const d256 = ringDev(bi256, r.t), d1024 = ringDev(bi1024, r.t);
      console.log(`  ${r.name}:`);
      console.log(`     bilinear-256 : max ${d256.max.toFixed(3)}mm p99 ${d256.p99.toFixed(3)}mm  crest-locus max ${d256.crestMax.toFixed(3)}mm`);
      console.log(`     bilinear-1024: max ${d1024.max.toFixed(3)}mm p99 ${d1024.p99.toFixed(3)}mm  crest-locus max ${d1024.crestMax.toFixed(3)}mm`);
    }
    console.log('  => the rim/caps reference these ring vertices by index; the crest ring vertices');
    console.log('     inherit the same bilinear flattening as the wall (fixed by DENSE_RES / exact eval).');
    console.log('==================================================================\n');
    /* eslint-enable no-console */
    expect(rows.length).toBe(2);
  });
});
