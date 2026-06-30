// featConformHeatmap.test.ts — DEV-ONLY (env PF_HEATMAP=1). Per-face chord-error heatmap for the showcase meshes.
// Reuses the dumped _showcase bins (xyz f32 + idx u32). For the radial surface the (u,t) of each vertex is
// recovered EXACTLY from its position (u=atan2(y,x)/2pi, t=z/H), so no rebuild is needed. Per FACE we measure the
// chord sag = max perpendicular distance from the TRUE surface (sampled at the 3 edge-midpoints + centroid) to the
// flat facet plane; that face error is folded onto its 3 vertices (max of incident faces) and colour-mapped
// (green=faithful -> red>=SCALE). Emits <name>.col.bin (f32 rgb/vertex) + <name>.hm.json (percentiles).
//
// Run: PF_HEATMAP=1 npx vitest run research/bridge/featConformHeatmap.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const DIR = join('research', 'exchange', '_showcase');
const SCALE_MM = 0.15; // chord sag at/above this renders full red; 0 = green
const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

const NAMES: Array<{ file: string; style: StyleId }> = [
  { file: 'GothicArches_1M_base', style: 'GothicArches' as StyleId },
  { file: 'GothicArches_1M_conf', style: 'GothicArches' as StyleId },
  { file: 'BambooSegments_1M_base', style: 'BambooSegments' as StyleId },
  { file: 'BambooSegments_1M_conf', style: 'BambooSegments' as StyleId },
];

/** green(0) -> yellow(0.5) -> red(1) ramp, x clamped to [0,1]. */
function ramp(x: number): [number, number, number] {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
  const G: [number, number, number] = [0.13, 0.62, 0.23], Y: [number, number, number] = [0.98, 0.82, 0.10], R: [number, number, number] = [0.86, 0.13, 0.13];
  if (c < 0.5) { const k = c / 0.5; return [lerp(G[0], Y[0], k), lerp(G[1], Y[1], k), lerp(G[2], Y[2], k)]; }
  const k = (c - 0.5) / 0.5; return [lerp(Y[0], R[0], k), lerp(Y[1], R[1], k), lerp(Y[2], R[2], k)];
}

function pct(sorted: Float64Array, p: number): number { const n = sorted.length; return n ? sorted[Math.min(n - 1, Math.floor(p * n))] : 0; }

describe('feature-conform chord-error heatmap', () => {
  it.skipIf(process.env.PF_HEATMAP !== '1')('per-face chord sag -> per-vertex colour', () => {
    for (const { file, style } of NAMES) {
      let xyzBuf: Buffer, idxBuf: Buffer;
      try { xyzBuf = readFileSync(join(DIR, `${file}.xyz.bin`)); idxBuf = readFileSync(join(DIR, `${file}.idx.bin`)); }
      catch { /* eslint-disable-next-line no-console */ console.log(`${file}: MISSING, skip`); continue; }
      const xyz = new Float32Array(xyzBuf.buffer, xyzBuf.byteOffset, xyzBuf.byteLength / 4);
      const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
      const nV = xyz.length / 3, nF = idx.length / 3;
      const rA = buildRadiusFn(style, {}, DIMS);
      const H = DIMS.H;

      // recovered (u,t) per vertex (exact for the radial lift)
      const uu = new Float64Array(nV), tt = new Float64Array(nV);
      for (let i = 0; i < nV; i++) {
        const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
        let u = Math.atan2(y, x) / TAU; if (u < 0) u += 1;
        uu[i] = u; tt[i] = z / H;
      }

      const vertErr = new Float64Array(nV); // max incident face chord sag (mm)
      const faceErrs = new Float64Array(nF);
      for (let f = 0; f < nF; f++) {
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
        const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
        const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
        const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
        // unit facet normal
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        // seam-unwrap the three u's so bary interpolation doesn't cross the 0/1 seam
        let ua = uu[a], ub = uu[b], uc = uu[c];
        if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
        const ta = tt[a], tb = tt[b], tc = tt[c];
        let err = 0;
        for (const [wa, wb, wc] of BARY) {
          const um = wa * ua + wb * ub + wc * uc;       // periodicity handled by cos/sin in the lift
          const tm = wa * ta + wb * tb + wc * tc;
          const th = TAU * um, z = tm * H, r = rA(th, z);
          const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
          const d = Math.abs((px - ax) * nx + (py - ay) * ny + (pz - az) * nz); // |(P_true - A)·N| = chord sag
          if (d > err) err = d;
        }
        faceErrs[f] = err;
        if (err > vertErr[a]) vertErr[a] = err;
        if (err > vertErr[b]) vertErr[b] = err;
        if (err > vertErr[c]) vertErr[c] = err;
      }

      // colours
      const col = new Float32Array(nV * 3);
      for (let i = 0; i < nV; i++) { const [r, g, b] = ramp(vertErr[i] / SCALE_MM); col[3 * i] = r; col[3 * i + 1] = g; col[3 * i + 2] = b; }
      writeFileSync(join(DIR, `${file}.col.bin`), Buffer.from(col.buffer, col.byteOffset, col.byteLength));

      const sorted = Float64Array.from(faceErrs).sort();
      let over = 0; for (let f = 0; f < nF; f++) if (faceErrs[f] > 0.1) over++;
      const meta = { file, faces: nF, scaleMm: SCALE_MM, p50: pct(sorted, 0.5), p99: pct(sorted, 0.99), max: sorted[nF - 1], pctFacesOver0_1mm: (100 * over / nF) };
      writeFileSync(join(DIR, `${file}.hm.json`), JSON.stringify(meta));
      // eslint-disable-next-line no-console
      console.log(`${file.padEnd(24)} faces=${String(nF).padStart(8)} faceSag p50=${meta.p50.toFixed(4)} p99=${meta.p99.toFixed(4)} max=${meta.max.toFixed(3)} | %faces>0.1mm=${meta.pctFacesOver0_1mm.toFixed(2)}`);
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
