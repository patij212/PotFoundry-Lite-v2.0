// _strataVoronoiStlVerify.test.ts — INDEPENDENT verifier: read a Voronoi STL from disk and measure every triangle's
// true-3D perpendicular distance to the EXACT analytic Voronoi surface. Fully separate from the mesh-generation code
// path — it only sees the bytes on disk + the analytic radius fn. If MAX ≤ 0.01mm, the STL is proven ≤ 0.01mm.
//
// Gated PF_STRATA_STLVERIFY=1; PF_STLV_FILE = STL path. DEV/LAB only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_STLVERIFY === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;

function envF(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}

describe('STRATA-001 STL independent fidelity verifier', () => {
  it.runIf(RUN)('re-measures every triangle in the STL vs the analytic Voronoi surface', () => {
    const morph = envF('PF_STLV_MORPH', 1);
    const file = process.env.PF_STLV_FILE ?? join('research', 'exchange', '_strataVoronoiStl', 'voronoi_web_patch_cx3-5_cy3-5.stl');
    const oracleN = Math.round(envF('PF_STLV_ORACLE', 16));
    const rA = buildRadiusFn('Voronoi' as StyleId, { vMorph: morph, vRelief: 2.0, vScale: 8, vJitter: 0.8, vZStretch: 1, vPulse: 0 }, DIMS);

    const data = readFileSync(file);
    const nTris = data.readUInt32LE(80);
    expect(data.length).toBe(84 + 50 * nTris);

    // A 3D wall point (x,y,z) → analytic surface point at its OWN (theta,z): r = rA(theta, z). Perpendicular distance
    // from that analytic point to the STL triangle's plane is the true-3D chord error at that location.
    const analyticAt = (x: number, y: number, z: number): [number, number, number] => {
      const theta = Math.atan2(y, x);
      const r = rA(theta, z);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    };

    let maxSag = 0;
    const sags: number[] = [];
    let over = 0;
    for (let i = 0; i < nTris; i += 1) {
      const o = 84 + i * 50;
      const ax = data.readFloatLE(o + 12);
      const ay = data.readFloatLE(o + 16);
      const az = data.readFloatLE(o + 20);
      const bx = data.readFloatLE(o + 24);
      const by = data.readFloatLE(o + 28);
      const bz = data.readFloatLE(o + 32);
      const cx = data.readFloatLE(o + 36);
      const cy = data.readFloatLE(o + 40);
      const cz = data.readFloatLE(o + 44);
      // STL triangle plane normal.
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) continue;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let s = 0;
      for (let p = 0; p <= oracleN; p += 1) {
        for (let q = 0; q <= oracleN - p; q += 1) {
          const wa = p / oracleN;
          const wb = q / oracleN;
          const wc = 1 - wa - wb;
          // Interpolate a point on the flat STL triangle, read its (theta,z), lift to the analytic surface, measure ⟂.
          const px = wa * ax + wb * bx + wc * cx;
          const py = wa * ay + wb * by + wc * cy;
          const pz = wa * az + wb * bz + wc * cz;
          const [qx, qy, qz] = analyticAt(px, py, pz);
          const d = Math.abs((qx - ax) * nx + (qy - ay) * ny + (qz - az) * nz);
          if (d > s) s = d;
        }
      }
      sags.push(s);
      if (s > maxSag) maxSag = s;
      if (s > 0.01) over += 1;
    }
    sags.sort((a, b) => a - b);
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const qq = (pp: number): number => sags[Math.min(sags.length - 1, Math.floor(pp * sags.length))];
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '===== INDEPENDENT STL FIDELITY VERIFY (read from disk) =====',
        `file: ${file}`,
        `triangles read: ${nTris}   analytic: Voronoi vMorph ${morph} vRelief 2.0 (registry defaults)   oracle ${oracleN}`,
        `MAX perpendicular sag vs analytic surface: ${um(maxSag)} um   ${maxSag <= 0.01 ? '✅ ≤ 0.01mm' : '❌ OVER'}`,
        `p99 ${um(qq(0.99))} um   p50 ${um(qq(0.5))} um   over-0.01mm: ${over}/${sags.length}`,
        '============================================================',
        '',
      ].join('\n')
    );
    expect(maxSag).toBeLessThanOrEqual(0.01);
  }, 3_000_000);
});
