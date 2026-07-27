// _strataBakeError.test.ts — bake a potscope `.error.bin` sidecar carrying the TRUE MESH -> SURFACE deviation,
// i.e. the direction this campaign never measured and the one that shows the visible facet artifacts.
//
// Per triangle the value is max over {centroid, 3 edge midpoints} of the perpendicular distance from that mesh
// point to the analytic surface, estimated as |r - rA| / |grad F| for F(r,θ,z) = r - rA(θ,z),
// |grad F| = sqrt(1 + rA_z^2 + (rA_θ/r)^2). Validated against an independent dense global search on the worst
// Gothic triangle: 474.586 µm radial vs 465.769 µm true ⇒ |grad F| ≈ 1.019, so the estimate is tight there.
//
// NOT the harness's ruler: that measures analytic samples against a triangle's infinite PLANE, which collapses a
// feature-spanning facet's error by the cosine of its plane tilt (measured 89.84° from radial ⇒ 475 µm reads 1.3 µm).
//
// Curtain/tread vertices are legitimately radial walls, so a point is exempted when a genuine h⁰ jump is present
// at its θ — probed at ε=1e-6 rad, NOT 1e-9: the discontinuity sits 0.1–1 µrad off the analytic locus, and a 1e-9
// probe lands on the same side twice (that error produced a bogus "6,432 vertices 2 mm outside" on BasketWeave).
//
// Gated PF_STRATA_BAKE=1 · PF_BAKE_FILE=<stl> · PF_BAKE_STYLE=<key> · PF_BAKE_BUDGET=<mm, default 0.01>
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { STYLE_REGISTRY } from '../../src/styles/registry';

const RUN = process.env.PF_STRATA_BAKE === '1';
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

describe('bake potscope error sidecar (mesh->surface)', () => {
  it.runIf(RUN)('writes <stl>.error.bin coloured by TRUE mesh->surface deviation', () => {
    const file = process.env.PF_BAKE_FILE as string;
    const style = process.env.PF_BAKE_STYLE as string;
    const budget = Number(process.env.PF_BAKE_BUDGET ?? 0.01);
    const params = { ...registryDefaults(style) };
    const rA = buildRadiusFn(style as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const JEPS = 1e-6; // jump probe — 1e-9 is TOO SMALL (see header note)

    const buf = readFileSync(file);
    const n = buf.readUInt32LE(80);
    const vals = new Float32Array(n);

    const err = (x: number, y: number, z: number): number => {
      const th = canon(Math.atan2(y, x));
      const r = Math.hypot(x, y);
      if (r < 1e-6) return 0;
      // exempt genuine double-valued walls (curtain / tread): a real h0 jump at this θ means the radial gap is
      // the wall itself, not an error. Probe at 1e-6 rad.
      const jm = rA(canon(th - JEPS), z);
      const jp = rA(canon(th + JEPS), z);
      if (Math.abs(jp - jm) > 0.05) {
        const d = Math.min(Math.abs(r - jm), Math.abs(r - jp));
        if (d < Math.abs(r - rA(th, z))) return d;
      }
      const r0 = rA(th, z);
      const dz = 0.002;
      const dth = 2e-5;
      const rz = (rA(th, Math.min(DIMS.H, z + dz)) - rA(th, Math.max(0, z - dz))) / (2 * dz);
      const rt = (rA(canon(th + dth), z) - rA(canon(th - dth), z)) / (2 * dth);
      const grad = Math.sqrt(1 + rz * rz + (rt / r) * (rt / r));
      return Math.abs(r - r0) / grad;
    };

    let mx = 0;
    let over = 0;
    const all: number[] = [];
    for (let t = 0; t < n; t += 1) {
      const o = 84 + t * 50 + 12;
      const p: number[][] = [];
      for (let k = 0; k < 3; k += 1) p.push([buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)]);
      const pts: number[][] = [[(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3, (p[0][2] + p[1][2] + p[2][2]) / 3]];
      for (let k = 0; k < 3; k += 1) {
        const q = p[k];
        const s = p[(k + 1) % 3];
        pts.push([(q[0] + s[0]) / 2, (q[1] + s[1]) / 2, (q[2] + s[2]) / 2]);
      }
      // OUTER WALL ONLY. rA describes the outer wall; the inner wall sits at baseRadius(z)-wallT and the caps/floor
      // are not radial graphs at all, so scoring them against rA paints them as multi-mm error and swamps the
      // overlay. Neutralise them to 0 (and exclude from the stats) rather than colour a lie.
      const baseR = (zz: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (zz / DIMS.H);
      const zs = p.map((qq) => qq[2]);
      let wall = Math.min(...zs) > 0.02 && Math.max(...zs) < DIMS.H - 0.02;
      for (const qq of p) if (Math.hypot(qq[0], qq[1]) < baseR(qq[2]) - 1.0) wall = false;
      if (!wall) { vals[t] = 0; continue; }
      let e = 0;
      for (const q of pts) { const v = err(q[0], q[1], q[2]); if (v > e) e = v; }
      vals[t] = e;
      all.push(e);
      if (e > mx) mx = e;
      if (e > budget) over += 1;
    }
    all.sort((a, b) => a - b);
    const q = (pp: number): number => all[Math.min(all.length - 1, Math.floor(pp * all.length))];

    const header = {
      magic: 'potscope-error/v1',
      style,
      variant: 'mesh-to-surface',
      count: n,
      unitsMm: true,
      semantics: 'max mesh->surface perpendicular deviation over {centroid,3 edge midpoints}',
      budgetMm: budget,
      stats: { maxMm: mx, p50Mm: q(0.5), p99Mm: q(0.99) },
    };
    const out = Buffer.concat([Buffer.from(`${JSON.stringify(header)}\n`, 'utf8'), Buffer.from(vals.buffer)]);
    writeFileSync(`${file}.error.bin`, out);
    // eslint-disable-next-line no-console
    console.log([
      '',
      `===== BAKED ${file}.error.bin =====`,
      `triangles ${n}  ·  budget ${budget} mm`,
      `mesh->surface  p50 ${(q(0.5) * 1000).toFixed(3)}  p90 ${(q(0.9) * 1000).toFixed(3)}  p99 ${(q(0.99) * 1000).toFixed(3)}  p999 ${(q(0.999) * 1000).toFixed(3)}  MAX ${(mx * 1000).toFixed(3)} um`,
      `OVER BUDGET: ${over} / ${n}  (${((100 * over) / n).toFixed(2)} %)`,
      '',
    ].join('\n'));
    expect(n).toBeGreaterThan(0);
  }, 3_000_000);
});
