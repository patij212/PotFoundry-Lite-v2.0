// _strataM2SCrossCheck.test.ts — CROSS-CHECK of the mesh→surface probe. Gated PF_STRATA_M2SX=1.
// RESEARCH ONLY. Measures; fixes nothing.
//
// THE CONTRADICTION TO RESOLVE. The mesh→surface probe reports a GothicArches triangle whose centroid is 473 µm
// from the analytic surface. The harness scored that same mesh MAX 5.000 µm with 0/2,001,816 over tolerance. If the
// triangle's interior really is 473 µm out, the harness's own sag oracle — which samples that interior and measures
// it against the triangle's plane — should have read ≈473 µm and split it. One of the two is wrong.
//
// This file locates the exact triangles named by the probe and measures them four independent ways:
//   1. HARNESS ORACLE, reimplemented verbatim: barycentric (θ,z) → analytic point → distance to the triangle's PLANE.
//   2. TRUE MESH→SURFACE: for points ON the triangle, the nearest point of the analytic surface, found by a DENSE
//      GLOBAL grid over a generous (θ,z) window and then refined — not a 9×9 shrinking window, which can lock onto
//      a local minimum on a ridged surface and over-report.
//   3. RADIAL deviation, the probe's first-pass quantity.
//   4. GEOMETRY CLASSIFICATION: outer wall vs cap vs inner wall vs curtain, and the plane's tilt from radial —
//      because a deliberately RADIAL wall reads its full height radially while being ~0 from the surface.
//
// It also tests one specific suspected probe artifact: binary STL stores float32, so θ recovered via atan2 carries
// ~1e-7 rad of quantization error. The probe's one-sided branch test uses ε=1e-9 rad, which is ~100× SMALLER, so on
// a double-valued locus BOTH one-sided probes can land on the same branch and a legitimate curtain vertex is then
// charged the full jump height. Measured directly below.
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { STYLE_REGISTRY } from '../../src/styles/registry';

const RUN = process.env.PF_STRATA_M2SX === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TWO_PI = 2 * Math.PI;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
function envF(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}

describe('mesh->surface probe cross-check', () => {
  it.runIf(RUN)('re-measures the exact triangles the probe named, four independent ways', () => {
    const file = process.env.PF_M2SX_FILE as string;
    const style = process.env.PF_M2SX_STYLE as string;
    const tgZ = envF('PF_M2SX_Z', 44.5692);
    const tgTh = envF('PF_M2SX_TH', 1.462069);
    const isVertexMode = process.env.PF_M2SX_VERTEX === '1';
    const params = registryDefaults(style);
    const rA = buildRadiusFn(style as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const um = (v: number): string => (v * 1000).toFixed(3);
    const baseR = (z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (z / DIMS.H);

    const buf = readFileSync(file);
    const nT = buf.readUInt32LE(80);
    const P = (t: number, k: number): [number, number, number] => {
      const o = 84 + t * 50 + 12 + k * 12;
      return [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
    };

    const lines: string[] = ['', `===== M2S CROSS-CHECK: ${file.split(/[\\/]/).pop()} =====`,
      `style ${style} at registry defaults · ${nT} triangles · params ${JSON.stringify(params)}`, ''];

    // ── locate the named triangle by centroid ──
    let bestT = -1; let bestD = Infinity;
    for (let t = 0; t < nT; t += 1) {
      const a = P(t, 0); const b = P(t, 1); const c = P(t, 2);
      const cx = (a[0] + b[0] + c[0]) / 3; const cy = (a[1] + b[1] + c[1]) / 3; const cz = (a[2] + b[2] + c[2]) / 3;
      if (Math.abs(cz - tgZ) > 0.02) continue;
      let dth = Math.abs(canon(Math.atan2(cy, cx)) - tgTh); if (dth > Math.PI) dth = TWO_PI - dth;
      const d = Math.hypot(dth * 45, cz - tgZ);
      if (d < bestD) { bestD = d; bestT = t; }
    }
    if (bestT < 0) { lines.push('  *** no triangle found near the named centroid ***'); }
    else {
      const A = P(bestT, 0); const B = P(bestT, 1); const C = P(bestT, 2);
      const cen: [number, number, number] = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      const eL = (p: number[], q: number[]): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      lines.push(`--- located tri #${bestT}  (${um(bestD)} µm from the named centroid) ---`);
      lines.push(`  edges ${um(eL(A, B))}/${um(eL(B, C))}/${um(eL(C, A))} µm`);
      for (const [nm, q] of [['A', A], ['B', B], ['C', C], ['centroid', cen]] as Array<[string, number[]]>) {
        const th = canon(Math.atan2(q[1], q[0])); const r = Math.hypot(q[0], q[1]);
        lines.push(`  ${nm.padEnd(8)} r=${r.toFixed(6)} z=${q[2].toFixed(6)} θ=${th.toFixed(9)}   rA=${rA(th, q[2]).toFixed(6)}   RADIAL dev ${um(r - rA(th, q[2]))} µm   (baseR ${baseR(q[2]).toFixed(3)}, r−baseR ${(r - baseR(q[2])).toFixed(3)})`);
      }
      // plane + tilt from radial
      let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const rh = Math.hypot(cen[0], cen[1]);
      const dotR = Math.abs((nx * cen[0] + ny * cen[1]) / rh);
      lines.push(`  plane normal·r̂ = ${dotR.toFixed(6)}  ⇒ tilt from radial ${(Math.acos(Math.min(1, dotR)) * 180 / Math.PI).toFixed(2)}°  (a RADIAL wall would be ~90°, and its radial gap would NOT be a surface distance)`);
      lines.push('');

      // ── 1. HARNESS ORACLE, verbatim: analytic point at barycentric (θ,z) vs the triangle's PLANE ──
      const thA = canon(Math.atan2(A[1], A[0]));
      const dTh = (p: number[], q: number[]): number => { let d = canon(Math.atan2(q[1], q[0])) - canon(Math.atan2(p[1], p[0])); if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI; return d; };
      const dB = dTh(A, B); const dC = dTh(A, C);
      const harnessSag = (n: number): number => {
        let s = 0;
        for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
          const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
          const th = thA + wb * dB + wc * dC;
          const z = wa * A[2] + wb * B[2] + wc * C[2];
          const r = rA(canon(th), z);
          const d = Math.abs((r * Math.cos(th) - A[0]) * nx + (r * Math.sin(th) - A[1]) * ny + (z - A[2]) * nz);
          if (d > s) s = d;
        }
        return s;
      };
      lines.push('--- 1. THE HARNESS ORACLE, reimplemented verbatim (analytic point at barycentric (θ,z) → triangle PLANE) ---');
      for (const n of [12, 44, 64, 128, 256]) lines.push(`      n=${String(n).padStart(4)}:  ${um(harnessSag(n))} µm`);
      lines.push('');

      // ── 2. TRUE MESH→SURFACE at points ON the triangle, by DENSE GLOBAL search ──
      const nearestSurface = (px: number, py: number, pz: number): { d: number; th: number; z: number } => {
        const th0 = canon(Math.atan2(py, px));
        let bd = Infinity; let bt = th0; let bz = pz;
        // dense global sweep first — a shrinking 9×9 window can lock onto a local minimum on a ridged surface
        const WT = 0.12; const WZ = 12.0; const NG = 360;
        for (let i = 0; i <= NG; i += 1) for (let j = 0; j <= NG; j += 1) {
          const th = th0 - WT + (2 * WT * i) / NG;
          const zz = Math.max(0, Math.min(DIMS.H, pz - WZ + (2 * WZ * j) / NG));
          const rr = rA(canon(th), zz);
          const d = Math.hypot(rr * Math.cos(th) - px, rr * Math.sin(th) - py, zz - pz);
          if (d < bd) { bd = d; bt = th; bz = zz; }
        }
        let wt = (2 * WT) / NG; let wz = (2 * WZ) / NG;
        for (let pass = 0; pass < 30; pass += 1) {
          const ct = bt; const cz2 = bz;
          for (let i = -3; i <= 3; i += 1) for (let j = -3; j <= 3; j += 1) {
            const th = ct + (wt * i) / 3; const zz = Math.max(0, Math.min(DIMS.H, cz2 + (wz * j) / 3));
            const rr = rA(canon(th), zz);
            const d = Math.hypot(rr * Math.cos(th) - px, rr * Math.sin(th) - py, zz - pz);
            if (d < bd) { bd = d; bt = th; bz = zz; }
          }
          wt /= 2.2; wz /= 2.2;
        }
        return { d: bd, th: bt, z: bz };
      };
      lines.push('--- 2. TRUE MESH→SURFACE: nearest analytic surface point to points ON the triangle (dense global search) ---');
      const probes: Array<[string, [number, number, number]]> = [['centroid', cen],
        ['A', A as [number, number, number]], ['B', B as [number, number, number]], ['C', C as [number, number, number]]];
      for (let i = 1; i <= 3; i += 1) for (let j = 1; j + i <= 3; j += 1) {
        const wa = i / 4; const wb = j / 4; const wc = 1 - wa - wb;
        probes.push([`bary(${i}/4,${j}/4)`, [wa * A[0] + wb * B[0] + wc * C[0], wa * A[1] + wb * B[1] + wc * C[1], wa * A[2] + wb * B[2] + wc * C[2]]]);
      }
      let worstM2S = 0;
      for (const [nm, q] of probes) {
        const r = nearestSurface(q[0], q[1], q[2]);
        worstM2S = Math.max(worstM2S, r.d);
        const thq = canon(Math.atan2(q[1], q[0]));
        const radial = Math.hypot(q[0], q[1]) - rA(thq, q[2]);
        lines.push(`      ${nm.padEnd(14)} TRUE ⟂ ${um(r.d).padStart(10)} µm   (radial ${um(radial).padStart(10)} µm)   nearest at θ=${r.th.toFixed(6)} z=${r.z.toFixed(4)}`);
      }
      lines.push(`  ⇒ worst TRUE mesh→surface over the probed points: ${um(worstM2S)} µm`);
    }

    // ── 3. THE ε-vs-float32 TEST on the named vertex (curtain mis-attribution suspect) ──
    if (isVertexMode) {
      const vR = envF('PF_M2SX_R', 50.500002); const vZ = envF('PF_M2SX_VZ', 102.0); const vTh = envF('PF_M2SX_VTH', 4.319690);
      lines.push('');
      lines.push('--- 3. IS THE NAMED "2 mm OUTSIDE" VERTEX A LEGITIMATE CURTAIN VERTEX? ---');
      lines.push(`  vertex r=${vR} z=${vZ} θ=${vTh}`);
      const r0 = rA(canon(vTh), vZ);
      lines.push(`  rA(θ,z) = ${r0.toFixed(6)}   radial dev ${um(vR - r0)} µm`);
      for (const e of [1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4]) {
        const rm = rA(canon(vTh - e), vZ); const rp = rA(canon(vTh + e), vZ);
        const best = [vR - r0, vR - rm, vR - rp].reduce((x, y) => (Math.abs(y) < Math.abs(x) ? y : x));
        lines.push(`      ε=${e.toExponential(0).padStart(6)}:  r⁻=${rm.toFixed(6)} r⁺=${rp.toFixed(6)}  jump ${um(Math.abs(rp - rm)).padStart(10)} µm  ⇒ probe's "best" ${um(best).padStart(10)} µm`);
      }
      // how big is the float32 θ quantum here?
      const x32 = Math.fround(vR * Math.cos(vTh)); const y32 = Math.fround(vR * Math.sin(vTh));
      const thBack = canon(Math.atan2(y32, x32));
      lines.push(`  float32 round-trip of this vertex moves θ by ${Math.abs(thBack - vTh).toExponential(3)} rad = ${um(Math.abs(thBack - vTh) * vR)} µm of arc`);
      lines.push(`  ⇒ the ε=1e-9 branch probe is ${(Math.abs(thBack - vTh) / 1e-9).toFixed(0)}× SMALLER than the θ error it must resolve`);
    }
    lines.push('==============================================================');
    lines.push('');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }, 3_000_000);
});
