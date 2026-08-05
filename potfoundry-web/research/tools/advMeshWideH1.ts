// advMeshWideH1.ts — THE ATTACK ON MY OWN REFUTATION.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE HOLE I AM CLOSING
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// `advSandwichRuler` measures ptTri = distance from an analytic sample to THAT ONE TRIANGLE. That is a
// PER-FACET quantity. The product bar is a MESH quantity: how far is the surface from the MESH. A surface
// point inside facet t's parametric footprint can legitimately be nearer a NEIGHBOURING facet — and on a
// steep rib the neighbour is close to radial, so it can be MUCH nearer. If that is what is happening, my
// 245 / 422 um readings over-state the true one-sided Hausdorff distance and my refutation weakens.
//
// So: take the worst facets by ptTri, recover THE ACTUAL ARGMAX SAMPLE POINT on each, and ask the WHOLE
// MESH how far that point really is. Exact point-to-triangle (Ericson) against every facet whose cell the
// expanding search reaches, with the standard shell termination — so the answer is the true nearest-facet
// distance, not an estimate.
//
// meshH1 <= ptTri by construction (the owning facet is always a candidate). The question is by how much,
// and whether the CAP-50 vs CAP-90 ORDERING survives it.
//
// Read-only. Single-threaded. One n=12 pass per arm (~140 s) plus a spatial hash (~10 s).
//
// Usage:  PF_ADVH1_TAGS=S39CTL,S40AR90 node research/bridge/out/_adv_h1.cjs
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { aspect3 } from '../bridge/_shapeGuard';
import type { StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TWO_PI = 2 * Math.PI;
const TAGS = (process.env.PF_ADVH1_TAGS ?? 'S39CTL,S40AR90').split(',');
const TOPK = Math.round(Number(process.env.PF_ADVH1_TOPK ?? '200'));
const NLAT = 12;
const CELL = 0.5; // mm
const BASE = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const { rA } = buildAuditRadiusFn('GothicArches', registryDefaults('GothicArches'), DIMS, H);
function dTh(a: number, b: number): number { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; }

/** exact squared point-to-triangle distance — Ericson, same branch structure as the driver's */
function ptTri2(
  qx: number, qy: number, qz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const apx = qx - ax; const apy = qy - ay; const apz = qz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const dd2 = acx * apx + acy * apy + acz * apz;
  let ex: number; let ey: number; let ez: number;
  if (d1 <= 0 && dd2 <= 0) { ex = ax; ey = ay; ez = az; } else {
    const bpx = qx - bx; const bpy = qy - by; const bpz = qz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz; const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { ex = bx; ey = by; ez = bz; } else {
      const vc = d1 * d4 - d3 * dd2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); ex = ax + abx * v; ey = ay + aby * v; ez = az + abz * v; } else {
        const cpx = qx - cx; const cpy = qy - cy; const cpz = qz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz; const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { ex = cx; ey = cy; ez = cz; } else {
          const vb = d5 * dd2 - d1 * d6;
          if (vb <= 0 && dd2 >= 0 && d6 <= 0) { const w = dd2 / (dd2 - d6); ex = ax + acx * w; ey = ay + acy * w; ez = az + acz * w; } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
              ex = bx + (cx - bx) * w; ey = by + (cy - by) * w; ez = bz + (cz - bz) * w;
            } else {
              const den = 1 / (va + vb + vc); const v = vb * den; const w = vc * den;
              ex = ax + abx * v + acx * w; ey = ay + aby * v + acy * w; ez = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  return (qx - ex) * (qx - ex) + (qy - ey) * (qy - ey) + (qz - ez) * (qz - ez);
}

log('===== ADV-H1 — IS ptTri OVER-STATING? Per-facet H1 vs TRUE MESH-WIDE H1 on the worst facets. =====');
log(`top ${TOPK} facets by ptTri per arm; exact nearest-facet over the WHOLE mesh, ${CELL} mm spatial hash.`);
log('');

for (const tag of TAGS) {
  let mesh;
  try { mesh = readMeshFloat64(`${BASE}${tag}.stl`, false); } catch { log(`${tag} (no STL)`); continue; }
  const { xyz, nTri } = mesh;
  const t0 = Date.now();

  // ── pass 1: ptTri per facet at n=12. COLLECT EVERY facet over the bar (not a top-K) so the pass-2
  // maximum is sound: meshH1 <= ptTri pointwise, so a facet under the bar cannot host a sample over it. ──
  const BAR0 = Number(process.env.PF_ADVH1_BAR ?? '10');
  const best: Array<{ t: number; d: number; qx: number; qy: number; qz: number; ar: number }> = [];
  let cut = 0; let ptTriMax = 0;
  const n = NLAT;
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    const thA = Math.atan2(ay, ax);
    const dB = dTh(thA, Math.atan2(by, bx)); const dC = dTh(thA, Math.atan2(cy, cx));
    let s = 0; let sx = 0; let sy = 0; let sz = 0;
    for (let i = 0; i <= n; i += 1) {
      const wa = i / n;
      for (let j = 0; j <= n - i; j += 1) {
        const wb = j / n; const wc = 1 - wa - wb;
        const theta = thA + wb * dB + wc * dC;
        const z = wa * az + wb * bz + wc * cz;
        const r = rA(theta, z);
        const qx = r * Math.cos(theta); const qy = r * Math.sin(theta);
        const d2 = ptTri2(qx, qy, z, ax, ay, az, bx, by, bz, cx, cy, cz);
        if (d2 > s) { s = d2; sx = qx; sy = qy; sz = z; }
      }
    }
    const d = Math.sqrt(s) * 1000;
    if (d > ptTriMax) ptTriMax = d;
    if (d > BAR0) best.push({ t, d, qx: sx, qy: sy, qz: sz, ar: aspect3(ax, ay, az, bx, by, bz, cx, cy, cz) });
  }
  best.sort((p, q) => q.d - p.d);
  cut = BAR0;
  // eslint-disable-next-line no-console
  console.error(`  ${tag} pass1 ${((Date.now() - t0) / 1000).toFixed(0)}s  cut ${cut.toFixed(2)} um`);

  // ── spatial hash of every facet, by AABB cells ──
  const key = (i: number, j: number, k: number): number => ((i + 512) * 2048 + (j + 512)) * 512 + (k + 8);
  const grid = new Map<number, number[]>();
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const x0 = Math.min(xyz[o], xyz[o + 3], xyz[o + 6]); const x1 = Math.max(xyz[o], xyz[o + 3], xyz[o + 6]);
    const y0 = Math.min(xyz[o + 1], xyz[o + 4], xyz[o + 7]); const y1 = Math.max(xyz[o + 1], xyz[o + 4], xyz[o + 7]);
    const z0 = Math.min(xyz[o + 2], xyz[o + 5], xyz[o + 8]); const z1 = Math.max(xyz[o + 2], xyz[o + 5], xyz[o + 8]);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i += 1) {
      for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j += 1) {
        for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k += 1) {
          const kk = key(i, j, k); const l = grid.get(kk); if (l === undefined) grid.set(kk, [t]); else l.push(t);
        }
      }
    }
  }
  // eslint-disable-next-line no-console
  console.error(`  ${tag} hash ${grid.size} cells, ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  /** exact nearest-facet distance (mm) from one point, expanding-shell termination */
  const nearest = (qx: number, qy: number, qz: number): number => {
    const ci = Math.floor(qx / CELL); const cj = Math.floor(qy / CELL); const ck = Math.floor(qz / CELL);
    let bd2 = Infinity;
    for (let R = 0; R < 200; R += 1) {
      if (bd2 < Infinity && Math.sqrt(bd2) <= R * CELL) break;
      for (let i = ci - R; i <= ci + R; i += 1) {
        for (let j = cj - R; j <= cj + R; j += 1) {
          for (let k = ck - R; k <= ck + R; k += 1) {
            if (R > 0 && Math.abs(i - ci) !== R && Math.abs(j - cj) !== R && Math.abs(k - ck) !== R) continue;
            const l = grid.get(key(i, j, k)); if (l === undefined) continue;
            for (const t of l) {
              const o = t * 9;
              const d2 = ptTri2(qx, qy, qz, xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8]);
              if (d2 < bd2) bd2 = d2;
            }
          }
        }
      }
    }
    return Math.sqrt(bd2);
  };

  // ── EXACT over the lattice: every facet with ptTri > BAR gets ALL its samples measured mesh-wide.
  // meshH1(sample) <= ptTri(sample) <= ptTri(facet), so a facet under BAR cannot host a sample over BAR:
  // the max below is therefore the TRUE mesh-wide H1 max over this lattice whenever it exceeds BAR. ──
  const BAR = Number(process.env.PF_ADVH1_BAR ?? '10') / 1000;
  const out: Array<{ own: number; mesh: number; ar: number; z: number; th: number; ratio: number }> = [];
  let exactMax = 0; let exactN = 0;
  for (const b of best) {
    if (b.d / 1000 <= BAR) continue;
    exactN += 1;
    const o = b.t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    const thA = Math.atan2(ay, ax);
    const dB = dTh(thA, Math.atan2(by, bx)); const dC = dTh(thA, Math.atan2(cy, cx));
    let fm = 0; let fx = 0; let fy = 0; let fz = 0;
    for (let i = 0; i <= n; i += 1) {
      const wa = i / n;
      for (let j = 0; j <= n - i; j += 1) {
        const wb = j / n; const wc = 1 - wa - wb;
        const theta = thA + wb * dB + wc * dC;
        const z = wa * az + wb * bz + wc * cz;
        const r = rA(theta, z);
        const qx = r * Math.cos(theta); const qy = r * Math.sin(theta);
        const d = nearest(qx, qy, z);
        if (d > fm) { fm = d; fx = qx; fy = qy; fz = z; }
      }
    }
    if (fm > exactMax) exactMax = fm;
    const md = fm * 1000;
    out.push({ own: b.d, mesh: md, ar: b.ar, z: fz, th: Math.atan2(fy, fx), ratio: md > 1e-9 ? b.d / md : Infinity });
  }
  out.sort((p, q) => q.mesh - p.mesh);
  log(`--- ${tag}  ${nTri} tris  ${((Date.now() - t0) / 1000).toFixed(0)}s ---`);
  log(`  per-facet ptTri MAX (advSandwichRuler's number) : ${ptTriMax.toFixed(3)} um`);
  log(`  TRUE MESH-WIDE H1 MAX, EXACT over this lattice  : ${(exactMax * 1000).toFixed(3)} um`);
  log(`    (every facet with ptTri > ${(Number(process.env.PF_ADVH1_BAR ?? '10')).toFixed(1)} um had ALL ${((NLAT + 1) * (NLAT + 2)) / 2} of its samples measured mesh-wide: ${exactN} facets.`);
  log(`     meshH1 <= ptTri pointwise, so no facet under the bar can host a sample over it — this max is SOUND`);
  log(`     over the n=${NLAT} lattice. EVERY facet over the bar was collected, not a top-K.)`);
  const rs = out.map((r) => r.ratio).sort((a, b2) => a - b2);
  let rmax = 0; for (const v of rs) if (Number.isFinite(v) && v > rmax) rmax = v;
  log(`  facets over the bar: ${exactN}   meshH1 over 10 um: ${out.filter((r) => r.mesh > 10).length}   over 25 um: ${out.filter((r) => r.mesh > 25).length}`);
  log(`  neighbour rescue own/mesh over that population: p50 ${rs[Math.floor(rs.length / 2)].toFixed(2)}   max ${rmax.toFixed(2)}`);
  log(`  WORST 12 BY THE TRUE MESH QUANTITY:`);
  log(`  ${'ownPtTri'.padStart(10)} ${'meshH1'.padStart(10)} ${'rescue'.padStart(7)} ${'AR'.padStart(7)}  ${'z'.padStart(8)} ${'theta'.padStart(9)}`);
  for (const r of out.slice(0, 12)) {
    log(`  ${r.own.toFixed(3).padStart(10)} ${r.mesh.toFixed(3).padStart(10)} ${r.ratio.toFixed(2).padStart(7)} ${r.ar.toFixed(2).padStart(7)}  ${r.z.toFixed(3).padStart(8)} ${r.th.toFixed(4).padStart(9)}`);
  }
  log('');
}
log('READ IT AS: meshH1 <= ptTri always. If meshH1 MAX still ORDERS the arms the same way ptTri did, the');
log('per-facet reading was not the story and the refutation stands on the mesh quantity itself.');
