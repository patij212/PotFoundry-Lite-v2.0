// _bladeSurfaceCheck.test.ts — DIAGNOSTIC ONLY (2026-07-29 blade investigation). Gated PF_BLADE_CHK=1.
//
// Two questions the STL alone cannot answer, both asked of the SHIPPED mesh:
//
//  Q1  PLACEMENT or TOPOLOGY? Are the blades' vertices OFF the analytic surface rA (a placement bug) or
//      ON it (a topology / connectivity bug)? Measured two ways per vertex: the RADIAL residual
//      |r - rA(theta,z)| and the true PERPENDICULAR distance via projectPointToRadialSurface.
//
//  Q2  WOULD A SELF-INTERSECTION GATE HAVE CAUGHT THIS, AND AT WHAT COST? `detectSelfIntersections`
//      already exists in src/geometry and is already regression-tested at 1.2 M triangles
//      (src/geometry/selfIntersection.scale.test.ts). It is simply never called by this driver's audit.
//      Run it on the real 1.43 M-triangle mesh and time it.
//
// env: PF_BLADE_STL (path), PF_BLADE_TOPK (how many worst facets to project, default 300),
//      PF_BLADE_SI=1 (also run the self-intersection scan — it is the expensive half).
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { projectPointToRadialSurface } from '../../src/fidelity/analyticSurfaceGate';
import { detectSelfIntersections } from '../../src/geometry/selfIntersection';

const RUN = process.env.PF_BLADE_CHK === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TWO_PI = Math.PI * 2;
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
const pct = (a: number[], p: number): number => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

describe('BLADE surface check', () => {
  it.runIf(RUN)('locates blade vertices against rA and prices the missing self-intersection gate', () => {
    const file = process.env.PF_BLADE_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-_D51.stl';
    const TOPK = Number.parseInt(process.env.PF_BLADE_TOPK ?? '300', 10);
    const buf = readFileSync(file);
    const nT = buf.readUInt32LE(80);
    console.log(`\n[BLADE-CHK] ${file}  ${nT} triangles`);

    const rA = buildRadiusFn('GothicArches' as StyleId, registryDefaults('GothicArches'), DIMS);

    // ── pass 1: 3-D aspect ratio, pick the worst TOPK ──
    const ars = new Float64Array(nT);
    for (let i = 0; i < nT; i += 1) {
      const o = 84 + i * 50 + 12;
      const v: number[] = [];
      for (let k = 0; k < 9; k += 1) v.push(buf.readFloatLE(o + k * 4));
      const e0 = Math.hypot(v[3] - v[0], v[4] - v[1], v[5] - v[2]);
      const e1 = Math.hypot(v[6] - v[3], v[7] - v[4], v[8] - v[5]);
      const e2 = Math.hypot(v[0] - v[6], v[1] - v[7], v[2] - v[8]);
      const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2];
      const wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
      const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
      const L = Math.max(e0, e1, e2);
      ars[i] = area > 0 ? (L * (e0 + e1 + e2)) / (4 * area) : Infinity;
    }
    const order = Array.from({ length: nT }, (_, i) => i).sort((a, b) => ars[b] - ars[a]).slice(0, TOPK);

    // ── Q1: how far are those facets' vertices from the analytic surface? ──
    const radial: number[] = []; const perp: number[] = [];
    for (const i of order) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 3; k += 1) {
        const x = buf.readFloatLE(o + k * 12), y = buf.readFloatLE(o + k * 12 + 4), z = buf.readFloatLE(o + k * 12 + 8);
        let th = Math.atan2(y, x); if (th < 0) th += TWO_PI;
        radial.push(Math.abs(Math.hypot(x, y) - rA(th, z)) * 1000);
        perp.push(projectPointToRadialSurface(x, y, z, rA).dist * 1000);
      }
    }
    console.log(`[BLADE-CHK] Q1  worst ${TOPK} facets by 3-D aspect ratio (AR ${ars[order[TOPK - 1]].toFixed(0)} … ${ars[order[0]].toFixed(0)}), ${radial.length} vertices`);
    console.log(`   |r - rA(theta,z)|  um :  p50 ${pct(radial, 0.5).toFixed(4)}   p95 ${pct(radial, 0.95).toFixed(4)}   MAX ${Math.max(...radial).toFixed(4)}`);
    console.log(`   perpendicular dist um :  p50 ${pct(perp, 0.5).toFixed(4)}   p95 ${pct(perp, 0.95).toFixed(4)}   MAX ${Math.max(...perp).toFixed(4)}`);
    console.log(`   => vertices ON the analytic surface  <=>  the defect is TOPOLOGY (connectivity), not PLACEMENT`);

    // ── Q1b: what does the DRIVER'S OWN RULER read on these facets? ──
    // Reproduces `sagAdaptive`/`sagOfN` verbatim: distance from a barycentric lattice of ANALYTIC surface
    // points to the facet's INFINITE PLANE, absolute pitch 0.03 mm, n in [12,64]. A blade's three vertices
    // are on the surface and nearly collinear, so the strip of surface under it is within ~1 um of that
    // line and the plane hugs it — the ruler reports the WORST facets in the mesh as the BEST.
    const planeSag: number[] = []; const ptTriSag: number[] = [];
    for (const i of order) {
      const o = 84 + i * 50 + 12;
      const p: number[] = [];
      for (let k = 0; k < 9; k += 1) p.push(buf.readFloatLE(o + k * 4));
      const th: number[] = []; for (let k = 0; k < 3; k += 1) { let t = Math.atan2(p[k * 3 + 1], p[k * 3]); if (t < 0) t += TWO_PI; th.push(t); }
      const dW = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };
      let nx = (p[4] - p[1]) * (p[8] - p[2]) - (p[5] - p[2]) * (p[7] - p[1]);
      let ny = (p[5] - p[2]) * (p[6] - p[0]) - (p[3] - p[0]) * (p[8] - p[2]);
      let nz = (p[3] - p[0]) * (p[7] - p[1]) - (p[4] - p[1]) * (p[6] - p[0]);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) { planeSag.push(0); ptTriSag.push(0); continue; }
      nx /= nl; ny /= nl; nz /= nl;
      const le = Math.max(
        Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2]),
        Math.hypot(p[6] - p[3], p[7] - p[4], p[8] - p[5]),
        Math.hypot(p[0] - p[6], p[1] - p[7], p[2] - p[8]),
      );
      const n = Math.max(12, Math.min(64, Math.ceil(le / 0.03)));
      const dB = dW(th[0], th[1]); const dC = dW(th[0], th[2]);
      let sPlane = 0; let sTri = 0;
      for (let ii = 0; ii <= n; ii += 1) for (let jj = 0; jj <= n - ii; jj += 1) {
        const wa = ii / n; const wb = jj / n; const wc = 1 - wa - wb;
        const theta = th[0] + wb * dB + wc * dC;
        const z = wa * p[2] + wb * p[5] + wc * p[8];
        let tc = theta % TWO_PI; if (tc < 0) tc += TWO_PI;
        const r = rA(tc, z);
        const qx = r * Math.cos(theta); const qy = r * Math.sin(theta);
        const dd = Math.abs((qx - p[0]) * nx + (qy - p[1]) * ny + (z - p[2]) * nz);
        if (dd > sPlane) sPlane = dd;
        // crude point-to-TRIANGLE proxy: distance to the nearest of the three vertices, clamped by the
        // plane distance from below — enough to show the honest ruler is blind here too.
        const dv = Math.min(
          Math.hypot(qx - p[0], qy - p[1], z - p[2]),
          Math.hypot(qx - p[3], qy - p[4], z - p[5]),
          Math.hypot(qx - p[6], qy - p[7], z - p[8]),
        );
        if (dv > sTri) sTri = dv;
      }
      planeSag.push(sPlane * 1000); ptTriSag.push(sTri * 1000);
    }
    console.log(`[BLADE-CHK] Q1b driver's own PLANE ruler on those same worst facets:`);
    console.log(`   plane sag um          :  p50 ${pct(planeSag, 0.5).toFixed(4)}   p95 ${pct(planeSag, 0.95).toFixed(4)}   MAX ${Math.max(...planeSag).toFixed(4)}   (acceptTol was 3.5 um)`);
    console.log(`   dist to nearest VERTEX:  p50 ${pct(ptTriSag, 0.5).toFixed(4)}   p95 ${pct(ptTriSag, 0.95).toFixed(4)}   MAX ${Math.max(...ptTriSag).toFixed(4)}`);

    // ── Q2: price the self-intersection gate on the real mesh ──
    if (process.env.PF_BLADE_SI === '1') {
      const t0 = Date.now();
      const key = new Map<string, number>();
      const vx: number[] = []; const vy: number[] = []; const vz: number[] = [];
      const idx = new Uint32Array(nT * 3);
      for (let i = 0; i < nT; i += 1) {
        const o = 84 + i * 50 + 12;
        for (let k = 0; k < 3; k += 1) {
          const oo = o + k * 12;
          const s = `${buf.readUInt32LE(oo)},${buf.readUInt32LE(oo + 4)},${buf.readUInt32LE(oo + 8)}`;
          let v = key.get(s);
          if (v === undefined) { v = vx.length; key.set(s, v); vx.push(buf.readFloatLE(oo)); vy.push(buf.readFloatLE(oo + 4)); vz.push(buf.readFloatLE(oo + 8)); }
          idx[i * 3 + k] = v;
        }
      }
      const nV = vx.length;
      const vertices = new Float32Array(nV * 3);
      for (let v = 0; v < nV; v += 1) { vertices[v * 3] = vx[v]; vertices[v * 3 + 1] = vy[v]; vertices[v * 3 + 2] = vz[v]; }
      const tWeld = Date.now() - t0;
      console.log(`[BLADE-CHK] Q2  welded ${nT} tris -> ${nV} verts in ${(tWeld / 1000).toFixed(1)}s`);
      const t1 = Date.now();
      const res = detectSelfIntersections(
        { vertices, indices: idx, vertexCount: nV, triangleCount: nT },
        { maxPairs: Number.parseInt(process.env.PF_BLADE_MAXPAIRS ?? "200000", 10), sampleLimit: 12 },
      );
      console.log(`[BLADE-CHK] Q2  detectSelfIntersections: intersects=${String(res.intersects)}  count=${res.count}  in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
      if (res.samplePairs !== undefined) for (const [a, b] of res.samplePairs) console.log(`     pair ${a} x ${b}   AR ${ars[a].toFixed(0)} / ${ars[b].toFixed(0)}`);
    }
  }, 6_000_000);
});
