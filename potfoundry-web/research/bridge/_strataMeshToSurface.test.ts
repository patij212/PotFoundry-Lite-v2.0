// _strataMeshToSurface.test.ts — THE DIRECTION THE CAMPAIGN NEVER MEASURED.
//
// Every ruler in this campaign measures SURFACE -> MESH ("is the surface covered?"). That is blind to EXTRA
// material: a spike sticking out of the wall leaves every surface point close to SOME mesh point, so it passes,
// while the spike itself is nowhere near the surface. The user reports "weird sharp artifacts around the features"
// on exactly the STLs the harness scored at 5-7 um, so the missing direction is the prime suspect.
//
// This probe reads the emitted STL from disk and, for every VERTEX and every triangle CENTROID, measures the
// signed radial deviation from the analytic surface:  err = hypot(x,y) - rA(atan2(y,x), z).
// A correct wall vertex reads ~0. A spike reads large POSITIVE (material outside the surface). A dimple reads
// large NEGATIVE. Curtain vertices legitimately sit at a locus where rA is two-valued, so they are reported
// separately using the smaller of the two one-sided branch deviations.
//
// Gated PF_STRATA_M2S=1 · PF_M2S_FILE=<stl> · PF_M2S_STYLE=<registry key> · PF_M2S_PARAMS=<json>
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { STYLE_REGISTRY } from '../../src/styles/registry';

const RUN = process.env.PF_STRATA_M2S === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TWO_PI = 2 * Math.PI;

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const group of [cfg?.params, cfg?.advancedParams]) {
    if (group === undefined) continue;
    for (const [k, v] of Object.entries(group)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

describe('STRATA mesh->surface (extra-material) audit', () => {
  it.runIf(RUN)('measures how far the MESH strays OUTSIDE the analytic surface', () => {
    const file = process.env.PF_M2S_FILE as string;
    const style = process.env.PF_M2S_STYLE as string;
    const params = { ...registryDefaults(style) };
    if (process.env.PF_M2S_PARAMS !== undefined) Object.assign(params, JSON.parse(process.env.PF_M2S_PARAMS) as Record<string, number>);
    const rA = buildRadiusFn(style as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const EPS = 1e-9; // one-sided branch probe (measured stable: branch moves ~8nm over +-1urad)

    const buf = readFileSync(file);
    const n = buf.readUInt32LE(80);
    // Radial deviation, and the two one-sided branch values so a legitimate curtain vertex is not mis-charged.
    const dev = (x: number, y: number, z: number): { raw: number; best: number } => {
      const th = canon(Math.atan2(y, x));
      const r = Math.hypot(x, y);
      const r0 = rA(th, z);
      const rm = rA(canon(th - EPS), z);
      const rp = rA(canon(th + EPS), z);
      const raw = r - r0;
      const best = [r - r0, r - rm, r - rp].reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
      return { raw, best };
    };

    const vAll: number[] = []; // |best| per vertex
    const cAll: number[] = []; // |best| per centroid
    let vMax = 0; let vMaxInfo = '';
    let cMax = 0; let cMaxInfo = '';
    let outside = 0; // vertices with material OUTSIDE the surface by > 10um
    let inside = 0;
    const worst: Array<{ d: number; s: string }> = [];

    for (let t = 0; t < n; t += 1) {
      const o = 84 + t * 50 + 12;
      const p: number[][] = [];
      for (let k = 0; k < 3; k += 1) {
        p.push([buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)]);
      }
      // OUTER WALL ONLY. rA describes the outer wall; the inner wall sits at baseRadius - wallT (~4mm in) and the
      // caps/floor are not radial graphs at all. The first version of this filter kept only z and r>1, which let the
      // INNER WALL through and produced a bogus "72,192 vertices 5.45mm inside" — that was correct inner-wall
      // geometry, at exactly baseRadius(z)-4. Filter on the profile instead.
      const zs = p.map((q) => q[2]);
      if (Math.min(...zs) <= 0.02 || Math.max(...zs) >= DIMS.H - 0.02) continue;
      const baseR = (z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (z / DIMS.H);
      let ok = true;
      for (const q of p) { if (Math.hypot(q[0], q[1]) < baseR(q[2]) - 1.0) ok = false; }
      if (!ok) continue;

      for (const q of p) {
        const d = dev(q[0], q[1], q[2]);
        const a = Math.abs(d.best);
        vAll.push(a);
        if (a > 0.01) { if (d.best > 0) outside += 1; else inside += 1; }
        if (a > vMax) {
          vMax = a;
          const e = [Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1], p[0][2] - p[1][2]), Math.hypot(p[1][0] - p[2][0], p[1][1] - p[2][1], p[1][2] - p[2][2]), Math.hypot(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2])];
          vMaxInfo = `tri#${t} vtx r=${Math.hypot(q[0], q[1]).toFixed(6)} z=${q[2].toFixed(4)} th=${canon(Math.atan2(q[1], q[0])).toFixed(6)} raw=${(d.raw * 1000).toFixed(1)}um best=${(d.best * 1000).toFixed(1)}um edges(um)=${e.map((x) => (x * 1000).toFixed(1)).join('/')}`;
        }
      }
      const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
      const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
      const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
      const dc = dev(cx, cy, cz);
      let ac = Math.abs(dc.best);
      // TRUE PERPENDICULAR distance, for candidates only. RADIAL deviation OVERSTATES the error on a steep or
      // vertical wall (a curtain/tread is deliberately radial, so its radial gap is the wall height while its
      // distance to the surface is ~0). So for any centroid that looks bad radially, do a bounded local search
      // over (theta,z) for the nearest actual surface point and report THAT. Same trap this campaign hit with
      // point-to-plane: measure the thing you mean.
      if (ac > 0.02) {
        const th0 = canon(Math.atan2(cy, cx));
        let bd = Infinity;
        let wTh = 0.03; let wZ = 3.0; let bTh = th0; let bZ = cz;
        for (let pass = 0; pass < 4; pass += 1) {
          const cTh = bTh; const cZ = bZ;
          for (let i = -4; i <= 4; i += 1) {
            for (let j = -4; j <= 4; j += 1) {
              const th = cTh + (wTh * i) / 4;
              const zz = Math.max(0, Math.min(DIMS.H, cZ + (wZ * j) / 4));
              const rr = rA(canon(th), zz);
              const d = Math.hypot(rr * Math.cos(th) - cx, rr * Math.sin(th) - cy, zz - cz);
              if (d < bd) { bd = d; bTh = th; bZ = zz; }
            }
          }
          wTh /= 4; wZ /= 4;
        }
        ac = Math.min(ac, bd);
      }
      cAll.push(ac);
      if (ac > cMax) {
        cMax = ac;
        const e = [Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1], p[0][2] - p[1][2]), Math.hypot(p[1][0] - p[2][0], p[1][1] - p[2][1], p[1][2] - p[2][2]), Math.hypot(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2])];
        cMaxInfo = `tri#${t} centroid z=${cz.toFixed(4)} th=${canon(Math.atan2(cy, cx)).toFixed(6)} best=${(dc.best * 1000).toFixed(1)}um edges(um)=${e.map((x) => (x * 1000).toFixed(1)).join('/')}`;
      }
      if (ac > 0.05) worst.push({ d: ac, s: `centroid ${(dc.best * 1000).toFixed(1)}um z=${cz.toFixed(3)} th=${canon(Math.atan2(cy, cx)).toFixed(5)}` });
    }
    vAll.sort((a, b) => a - b);
    cAll.sort((a, b) => a - b);
    const q = (arr: number[], p: number): number => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
    const um = (v: number): string => (v * 1000).toFixed(3);
    worst.sort((a, b) => b.d - a.d);

    // eslint-disable-next-line no-console
    console.log([
      '',
      `===== MESH -> SURFACE (extra material) : ${file.split(/[\\/]/).pop()} =====`,
      `style ${style}  ·  wall triangles probed ${cAll.length} of ${n}`,
      `VERTEX radial deviation |err|:  p50 ${um(q(vAll, 0.5))}  p90 ${um(q(vAll, 0.9))}  p99 ${um(q(vAll, 0.99))}  p999 ${um(q(vAll, 0.999))}  MAX ${um(vMax)} um`,
      `   over 10um: OUTSIDE(spike) ${outside}   INSIDE(dimple) ${inside}   of ${vAll.length} vertices`,
      `   worst: ${vMaxInfo}`,
      `CENTROID radial deviation |err|: p50 ${um(q(cAll, 0.5))}  p90 ${um(q(cAll, 0.9))}  p99 ${um(q(cAll, 0.99))}  p999 ${um(q(cAll, 0.999))}  MAX ${um(cMax)} um`,
      `   worst: ${cMaxInfo}`,
      `   centroids over 50um: ${worst.length}`,
      ...worst.slice(0, 8).map((w) => `      ${w.s}`),
      '==============================================================',
      '',
    ].join('\n'));
    expect(n).toBeGreaterThan(0);
  }, 3_000_000);
});
