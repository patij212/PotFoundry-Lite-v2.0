// _s119LadderValidate.test.ts — TWO-SIDED fixtures for the S119 ladder classifier.
//
// The S119 deliverable is a GROWTH EXPONENT per artefact class. An exponent is only as good as the
// membership test that defines the class, so every classifier that decides membership is planted here
// with a known answer AND with a clean control, in both directions:
//   * a facet that IS thin must be flagged and a well-shaped one must not;
//   * a facet that is merely SMALL must pass the scale-free bar at every tau while failing the absolute
//     one — that separation is the entire question S119 task 2 asks, and if the tool cannot make it on a
//     hand-built facet it cannot make it on a mesh;
//   * the seam. A facet straddling theta = -pi must NOT read as an inverted sliver.
//
//   PF_S119V=1 npx vitest run --config vitest.s119ladder.config.ts
import { describe, it, expect } from 'vitest';
import { classifyFacet } from '../tools/s119LadderLib';

const ON = process.env.PF_S119V === '1';
const d = ON ? describe : describe.skip;

/** Place a facet from arc-space coordinates: (u = theta*R, v = z) on a cylinder of radius R. */
function onCyl(R: number, uvs: Array<[number, number]>, radii?: number[]): number[] {
  const out: number[] = [];
  uvs.forEach(([u, v], i) => {
    const th = u / R;
    const r = radii === undefined ? R : radii[i];
    out.push(r * Math.cos(th), r * Math.sin(th), v);
  });
  return out;
}
const call = (p: number[]): ReturnType<typeof classifyFacet> => classifyFacet(
  p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8],
);

d('S119 ladder classifier — planted defects, two-sided', () => {
  const R = 45;

  it('EQUILATERAL facet: thinRatio ~ 0.866 and it is NOT thin at any published tau', () => {
    const s = 0.2;
    const g = call(onCyl(R, [[0, 0], [s, 0], [s / 2, (s * Math.sqrt(3)) / 2]]));
    expect(g.thinRatio).toBeGreaterThan(0.86);
    expect(g.thinRatio).toBeLessThan(0.87);
    for (const tau of [0.005, 0.01, 0.02, 0.05, 0.1]) expect(g.thinRatio < tau).toBe(false);
  });

  it('SCALE INVARIANCE: shrinking an equilateral facet 1000x does not move thinRatio', () => {
    const big = call(onCyl(R, [[0, 0], [0.2, 0], [0.1, 0.1732050807568877]]));
    const tiny = call(onCyl(R, [[0, 0], [2e-4, 0], [1e-4, 1.732050807568877e-4]]));
    expect(Math.abs(big.thinRatio - tiny.thinRatio)).toBeLessThan(1e-3);
    // ... but the ABSOLUTE bar convicts the small one and acquits the big one. This is the S119 question.
    expect(big.minAltUm).toBeGreaterThan(2);
    expect(tiny.minAltUm).toBeLessThan(2);
  });

  it('PLANTED NEEDLE: a 100:1 sliver is thin at tau=0.02 and a 5:1 one is not', () => {
    const needle = call(onCyl(R, [[0, 0], [0.2, 0], [0.1, 0.001]]));
    expect(needle.thinRatio).toBeLessThan(0.02);
    const stubby = call(onCyl(R, [[0, 0], [0.2, 0], [0.1, 0.04]]));
    expect(stubby.thinRatio).toBeGreaterThan(0.05);
  });

  it('SEAM: a facet straddling theta = -pi is NOT read as an inverted giant sliver', () => {
    const eps = 1e-3;
    const th = [Math.PI - eps, -Math.PI + eps, Math.PI - eps];
    const zz = [0, 0, 0.05];
    const p: number[] = [];
    th.forEach((t, i) => p.push(R * Math.cos(t), R * Math.sin(t), zz[i]));
    const g = call(p);
    expect(g.apsSign).not.toBe(0);
    // the arc footprint must be the true ~0.09 x 0.05 mm patch, not a 2*pi*R = 283 mm one
    expect(g.thinRatio).toBeGreaterThan(0.1);
    expect(g.graphRatio).toBeLessThan(2);
  });

  it('PLANTED CLIFF FACET: corners at two radii give a large dRmm and a graphRatio pole', () => {
    // A TREAD, as `stitchRings` emits one: two corners on the low side of the jump spanning a normal
    // z extent, the third on the high side at essentially the same (theta, z). CT's cliff is 1.720469 mm.
    // The arc-space footprint is then near-COLLINEAR while the 3D facet is a healthy 0.04 mm2 — which is
    // exactly the shape of a graphRatio pole that is NOT a mesh defect.
    // (The first version of this fixture planted the third corner at the same z-range instead, which makes
    // a 1e-6 x 1.72 mm 3D NEEDLE, not a tread: graphRatio 34, no pole. The fixture was wrong, not the tool.)
    const p = onCyl(R, [[0, 0], [0, 0.05], [1e-5, 0.025]], [45, 45, 46.720469]);
    const g = call(p);
    expect(g.dRmm).toBeGreaterThan(1.7);
    expect(g.graphRatio).toBeGreaterThan(1e4);
    // and a genuine wall facet at the SAME footprint scale is not a pole
    const q = onCyl(R, [[0, 0], [0.05, 0], [0.025, 0.05]], [45, 45, 45.0001]);
    expect(call(q).dRmm).toBeLessThan(0.01);
    expect(call(q).graphRatio).toBeLessThan(2);
  });

  it('DEGENERATE: three collinear arc-space corners give thinRatio 0 and an infinite/huge graphRatio', () => {
    const g = call(onCyl(R, [[0, 0], [0.1, 0], [0.2, 0]], [45, 45, 45.5]));
    expect(g.thinRatio).toBeLessThan(1e-9);
    expect(g.graphRatio).toBeGreaterThan(1e6);
  });
});
