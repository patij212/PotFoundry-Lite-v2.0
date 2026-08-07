// s116FloorProbe.ts — S116 FEASIBILITY PROBE. Times the two rulers so the exhaustive pass can be
// budgeted honestly instead of started and abandoned. Also dumps the mesh's edge-length spectrum,
// which is the raw material of the scaling law.
//
// NOTHING HERE IS A RESULT. It exists to answer: how many rA evals/s, how many perpendicular
// projections/s, and what is the h-spectrum of the shipping mesh.
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S116_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S116_STL ?? '';
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
if (STL.length === 0) { log('*** PF_S116_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
log(`style ${STYLE} params ${JSON.stringify(D)}`);
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 FEASIBILITY PROBE — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════');

// ── 1. rA throughput ──
{
  let acc = 0; const N = 2_000_000;
  const t0 = Date.now();
  for (let i = 0; i < N; i += 1) {
    const th = (i * 0.0001379) % (2 * Math.PI);
    const z = (i * 0.00731) % H;
    acc += rA(th, z);
  }
  const ms = Date.now() - t0;
  log(`rA throughput:  ${N} evals in ${ms} ms  =>  ${(N / (ms / 1000) / 1e6).toFixed(3)} M evals/s   (checksum ${acc.toFixed(6)})`);
}

// ── 2. mesh load + edge spectrum ──
const t1 = Date.now();
const M = readMeshFloat64(STL, false);
log(`mesh load: ${M.nTri} facets in ${Date.now() - t1} ms`);
const xyz = M.xyz; const nTri = M.nTri;

{
  const edges: number[] = []; const areas: number[] = [];
  let areaSum = 0;
  const STR = envI('PF_S116_ESTRIDE', 17);
  for (let f = 0; f < nTri; f += STR) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const e0 = Math.hypot(bx - ax, by - ay, bz - az);
    const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
    const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
    edges.push(Math.max(e0, e1, e2));
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const l = Math.hypot(nx, ny, nz); nx = 0; ny = 0;
    areas.push(0.5 * l); areaSum += 0.5 * l;
  }
  edges.sort((a, b) => a - b); areas.sort((a, b) => a - b);
  const q = (v: number[], p: number): number => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  log(`edge(max per facet) mm  stride ${STR} n=${edges.length}: p01 ${q(edges, 0.01).toExponential(3)}  p10 ${q(edges, 0.1).toExponential(3)}  p50 ${q(edges, 0.5).toExponential(3)}  p90 ${q(edges, 0.9).toExponential(3)}  p99 ${q(edges, 0.99).toExponential(3)}  MAX ${q(edges, 1).toExponential(3)}`);
  log(`facet area mm2:  p50 ${q(areas, 0.5).toExponential(3)}  p90 ${q(areas, 0.9).toExponential(3)}  MAX ${q(areas, 1).toExponential(3)}   sampled area sum*stride ${(areaSum * STR).toFixed(3)} mm2`);
}

// ── 3. radial-gap ruler throughput (k=4 lattice = 15 pts) ──
{
  const K = envI('PF_S116_PK', 4);
  const NF = envI('PF_S116_PNF', 20000);
  const t = Date.now();
  let worstAll = 0; let pts = 0;
  for (let f = 0; f < NF; f += 1) {
    const g = Math.floor((f / NF) * nTri); const o = g * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    for (let i = 0; i <= K; i += 1) for (let j = 0; i + j <= K; j += 1) {
      const w0 = (K - i - j) / K, w1 = i / K, w2 = j / K;
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worstAll) worstAll = dd; pts += 1;
    }
  }
  const ms = Date.now() - t;
  log(`radial ruler: ${NF} facets (k=${K}, ${pts} pts) in ${ms} ms => ${(nTri / (NF / (ms / 1000)) ).toFixed(1)} s for whole mesh   worst ${worstAll.toExponential(3)} mm`);
}

// ── 4. perpendicular projector: build + per-call ──
{
  const nTh = envI('PF_S116_PROJ_NTH', 1024); const nZ = envI('PF_S116_PROJ_NZ', 512);
  const tb = Date.now();
  const proj = buildRadialSurfaceProjector(rA, { H, nTheta: nTh, nZ, seedTopK: envI('PF_S116_PROJ_K', 6) });
  log(`projector build ${nTh}x${nZ} = ${proj.sampleCount} samples in ${Date.now() - tb} ms`);
  const NP = envI('PF_S116_PNP', 3000);
  const t = Date.now(); let worst = 0; let sum = 0;
  for (let i = 0; i < NP; i += 1) {
    const g = Math.floor((i / NP) * nTri); const o = g * 9;
    const x = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
    const y = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
    const z = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
    const r = proj.project(x, y, z);
    sum += r.dist; if (r.dist > worst) worst = r.dist;
  }
  const ms = Date.now() - t;
  log(`projector: ${NP} centroid projections in ${ms} ms => ${(NP / (ms / 1000)).toFixed(1)} proj/s   mean ${(sum / NP).toExponential(3)}  worst ${worst.toExponential(3)} mm`);
  log(`   whole-mesh centroid-only projection would take ${(nTri / (NP / (ms / 1000)) / 60).toFixed(1)} min`);
}
log('PROBE DONE');
