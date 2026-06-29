/**
 * _diag_cuspChord.derisk.test.ts — does the SFB@1 mesh CHORD across the petal valleys?
 *
 * The render proved the cusp region has ZERO backface / degenerate / inverted faces — the mesh
 * is consistently oriented and non-degenerate. The user's real claim is "the mesh doesn't fill
 * the holes between the serrations ... vertices do not lie on the actual surface". Since every
 * STL vertex is written via sampler.position(u,t) (vertex error == 0 by construction), the only
 * way faces can "miss the surface" is CHORD error: a flat triangle spanning a narrow concave
 * valley cuts the corner, so the surface BETWEEN its vertices bulges away from the facet.
 *
 * This reads the SFB@1 sharp STL, recovers each outer-wall vertex's (u,t) by inverting the
 * SFB position map (theta->u via atan2 + style period; z->t linearly), then for each triangle
 * measures the signed distance from each EDGE MIDPOINT's true surface point to the triangle
 * plane (the chord gap). We report the distribution and the worst offenders' theta (valley vs
 * ridge). Pure CPU, PF_DERISK. NO production code touched.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { styleSampler, type StyleId } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';

const H = 120, R0 = 40;
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const OUT = path.resolve(__dirname, '..', '..', 'export-deliverables');
const STL = path.join(OUT, 'SuperformulaBlossom_sf1_sharp.stl');

describe.skipIf(!process.env.PF_DERISK)('SFB@1 cusp chord deviation', () => {
  it('measures facet-vs-surface chord gap across petal valleys', () => {
    const s = styleSampler('SuperformulaBlossom' as StyleId, { sf_strength: 1 }, STYLE_DIMS);

    // Invert the map: for a 3D STL vertex p=(x,y,z), recover (u,t) so sampler.position(u,t)~=p.
    // t = z/H (the wall spans z in [0,H] for the outer wall). u = theta/(2pi) wrapped to [0,1).
    // We then REFINE u by a few bisection steps minimising |position(u,t)-p| in xy, because the
    // SFB warp makes u(theta) non-linear near cusps.
    const uvOf = (x: number, y: number, z: number): [number, number] => {
      let t = z / H; if (t < 0) t = 0; if (t > 1) t = 1;
      let th = Math.atan2(y, x); if (th < 0) th += 2 * Math.PI;
      let u = th / (2 * Math.PI);
      // local refine u to best match xy (handles warp): sample a small window, pick min err.
      let bestU = u, bestE = Infinity;
      for (let d = -8; d <= 8; d++) {
        const uu = ((u + d * 1e-4) % 1 + 1) % 1;
        const q = s.position(uu, t);
        const e = (q[0] - x) ** 2 + (q[1] - y) ** 2;
        if (e < bestE) { bestE = e; bestU = uu; }
      }
      return [bestU, t];
    };

    const buf = fs.readFileSync(STL);
    const nTri = buf.readUInt32LE(80);
    let off = 84;
    const chordOuter: number[] = [];
    const chordByTheta = new Map<number, { sum: number; max: number; n: number }>();
    let outer = 0, worst = 0, worstTheta = 0, worstZ = 0;
    // sample 1/4 of tris for speed (1.58M tris * 3 edges * refine is heavy)
    for (let tri = 0; tri < nTri; tri++) {
      const o = off + 12; off += 50;
      if ((tri & 3) !== 0) continue;
      const a = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
      const b = [buf.readFloatLE(o + 12), buf.readFloatLE(o + 16), buf.readFloatLE(o + 20)];
      const c = [buf.readFloatLE(o + 24), buf.readFloatLE(o + 28), buf.readFloatLE(o + 32)];
      const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      const cr = Math.hypot(cx, cy);
      if (!(cr > 42 && cz > 8 && cz < 112)) continue;
      outer++;
      // triangle plane normal + point a
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      // for each of 3 edge midpoints: true surface point, distance to plane
      const edges: [number[], number[]][] = [[a, b], [b, c], [c, a]];
      let triMax = 0;
      for (const [p, q] of edges) {
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mz = (p[2] + q[2]) / 2;
        const [mu, mt] = uvOf(mx, my, mz);
        const sp = s.position(mu, mt); // true surface point at the edge-midpoint param
        const dist = Math.abs((sp[0] - a[0]) * nx + (sp[1] - a[1]) * ny + (sp[2] - a[2]) * nz);
        if (dist > triMax) triMax = dist;
      }
      chordOuter.push(triMax);
      if (triMax > worst) { worst = triMax; worstTheta = Math.atan2(cy, cx) * 180 / Math.PI; worstZ = cz; }
      // bin by theta (degrees, 1-deg bins) to see valley vs ridge concentration
      let th = Math.atan2(cy, cx) * 180 / Math.PI; if (th < 0) th += 360;
      const bi = Math.floor(th);
      const e = chordByTheta.get(bi) || { sum: 0, max: 0, n: 0 };
      e.sum += triMax; if (triMax > e.max) e.max = triMax; e.n++;
      chordByTheta.set(bi, e);
    }
    chordOuter.sort((x, y) => x - y);
    const pct = (p: number) => chordOuter[Math.min(chordOuter.length - 1, Math.floor(p * chordOuter.length))];
    /* eslint-disable no-console */
    console.log(`[cuspChord] outer tris sampled=${outer}`);
    console.log(`[cuspChord] facet->surface chord gap (mm): p50=${pct(0.5).toFixed(4)} p90=${pct(0.9).toFixed(4)} p99=${pct(0.99).toFixed(4)} p999=${pct(0.999).toFixed(4)} max=${worst.toFixed(4)}`);
    console.log(`[cuspChord] worst at theta=${worstTheta.toFixed(2)}deg z=${worstZ.toFixed(1)}mm`);
    console.log(`[cuspChord] tris > 0.1mm gap: ${chordOuter.filter((x) => x > 0.1).length} (${(100 * chordOuter.filter((x) => x > 0.1).length / outer).toFixed(2)}%), >0.5mm: ${chordOuter.filter((x) => x > 0.5).length}, >1mm: ${chordOuter.filter((x) => x > 1).length}`);
    // top theta-bins by mean chord gap
    const bins = [...chordByTheta.entries()].filter(([, e]) => e.n > 20).sort((x, y) => (y[1].sum / y[1].n) - (x[1].sum / x[1].n)).slice(0, 8);
    console.log('[cuspChord] top-8 theta-bins by MEAN chord gap (likely the valleys):');
    for (const [bi, e] of bins) console.log(`  theta=${bi}deg meanGap=${(e.sum / e.n).toFixed(4)}mm maxGap=${e.max.toFixed(4)} n=${e.n}`);
    /* eslint-enable no-console */
    expect(outer).toBeGreaterThan(0);
  }, 600000);
});
