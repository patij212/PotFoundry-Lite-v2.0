// s117WallAB.ts — S117 P2 THE DECISIVE CONTROL + THE A/B: RUN THE SHIPPING MESHER, LOWER THE CLAMP.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — MY OWN CONTROL FIRED
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// s117SizingFieldProbe measured that at the SHIPPING config the sizing field never asks for an edge
// below ~0.054 mm (Gothic) / ~0.058 mm (CT), so qMinEdge = 0.04 never fires. I tried to validate that
// against the S39CTL reference STL and the check FAILED: 9.62% of its edges are below 0.0538 mm, down
// to 7.6e-4 mm. That STL is a RESEARCH-DRIVER product (bisection driver output), not shipping-mesher
// output, so it cannot test a claim about MetricSizingField — but "it's the wrong STL" is an excuse,
// not a measurement. So: run the SHIPPING MESHER ITSELF, headless, and census what IT emits.
//
// buildConformingWall(sampler, opts) is CPU-only once a SurfaceSampler exists. We build the sampler
// exactly as ParametricExportComputer.buildWallSampler does (f32 256x256 grid) and call the real
// thing. Then:
//
//   ARM A   minEdgeMm = 0.04    the shipping value
//   ARM B   minEdgeMm = 0.0018  the quadtree's own reach at CAD_MAX_LEVEL 16 (S117 floor stack)
//   ARM C   minEdgeMm = 0       clamp removed entirely
//
// If A, B and C emit the SAME MESH, qMinEdge is provably inert at this configuration and "lower
// qMinEdge" is a measured no-op — the strongest possible form of the finding. If they differ, the
// clamp is live and the difference IS its cost.
//
// ARM D adds the ANALYTIC CURVATURE FLOOR (AnalyticCurvatureFloor.ts, __pfConformingAnalyticFloor,
// DEFAULT OFF) — the mechanism that bypasses the sampler band limit — at each minEdge, because the
// hypothesis is that the clamp only becomes live once the floor is on.
//
// MEASUREMENT DISCIPLINE: COUNT + AREA-share + MAX per arm, never a bare count, never a bare max.
// The byte-identity check is on the emitted (u,t) vertex buffer, not on a derived statistic.
//
// Usage: bash research/tools/run-s117-wallab.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { GpuSurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildConformingWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { buildAnalyticCurvatureFloor } from '../../src/renderers/webgpu/parametric/conforming/AnalyticCurvatureFloor';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S117_STYLE ?? 'GothicArches';
const TAG = process.env.PF_S117_TAG ?? 'X';
const OUTDIR = process.env.PF_S117_OUTDIR ?? 'research/exchange/_strataConformBisect/s117';
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
const H = DIMS.H;
const DENSE = envI('PF_S117_DENSE1', 256);      // ParametricExportComputer.ts:2509
const SIZERES = envI('PF_S117_SIZERES', 128);   // qSizingRes default
const MAXSAG = envF('PF_S117_MAXSAG', 0.003);   // CAD_SAG_MM
const MAXEDGE = envF('PF_S117_MAXEDGE', 1);     // profile 'high' maxEdgeMm
const MAXLEVEL = envI('PF_S117_MAXLEVEL', 16);  // CAD_MAX_LEVEL
const NRING = envI('PF_S117_NRING', 2048);      // CAD_NRING
const ARMS = (process.env.PF_S117_ARMS ?? '0.2,0.1,0.04,0.01,0.0018,0').split(',').map(Number);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const styleOpts = { ...D };
const rAb = buildRadiusFn(STYLE as StyleId, styleOpts, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`   S117 P2 — SHIPPING MESHER A/B ON qMinEdge — ${STYLE}`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`shipping config: denseRes ${DENSE}, sizingRes ${SIZERES}, maxSag ${MAXSAG}, maxEdge ${MAXEDGE}, maxLevel ${MAXLEVEL}, nRing ${NRING}, gradeRatio 2`);
log(`arms (minEdgeMm): ${ARMS.join(', ')}`);
log('');

const pos = new Float32Array(DENSE * DENSE * 3);
{
  let w = 0;
  for (let row = 0; row < DENSE; row += 1) {
    const z = (row / (DENSE - 1)) * H;
    for (let col = 0; col < DENSE; col += 1) {
      const th = (col / DENSE) * 2 * Math.PI;
      const r = rA(th, z);
      pos[w++] = r * Math.cos(th); pos[w++] = r * Math.sin(th); pos[w++] = z;
    }
  }
}
const sampler = new GpuSurfaceSampler(pos, DENSE, DENSE);

interface Arm { minEdge: number; floorOn: boolean; nTri: number; nVert: number; area: number; eMin: number; eP01: number; eP50: number; eMax: number; belowShip: number; belowShipArea: number; hash: string }

const fnv = (a: Float32Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i += 1) {
    const v = a[i]; const b = new Float32Array([v]); const u = new Uint32Array(b.buffer)[0];
    h ^= u & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (u >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (u >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (u >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

const runArm = (minEdge: number, floorOn: boolean): Arm => {
  const af = floorOn
    ? buildAnalyticCurvatureFloor(STYLE as string, styleOpts as never, { H, Rt: DIMS.Rt, Rb: DIMS.Rb, expn: 1 },
        { resU: 512, resT: 128, maxSagMm: MAXSAG, minEdgeMm: Math.max(minEdge, 1e-6) })
    : null;
  const res = buildConformingWall(sampler, {
    maxSagMm: MAXSAG, maxEdgeMm: MAXEDGE, minEdgeMm: minEdge, gradeRatio: 2,
    maxLevel: MAXLEVEL, resU: SIZERES, resT: SIZERES, nRing: NRING, surfaceId: 0,
    ...(af ? { curvatureFloor: af.curvatureFloor, maxKappa: af.maxKappa } : {}),
  });
  const V = res.vertices; const I = res.indices;
  const nT = I.length / 3;
  // lift (u,t) -> 3D through the ANALYTIC surface (the emitted vertex buffer is (u,t,surfaceId))
  const nV = V.length / 3;
  const X = new Float64Array(nV); const Y = new Float64Array(nV); const Z = new Float64Array(nV);
  for (let i = 0; i < nV; i += 1) {
    const u = V[i * 3]; const t = V[i * 3 + 1];
    const th = u * 2 * Math.PI; const z = t * H; const r = rA(th, z);
    X[i] = r * Math.cos(th); Y[i] = r * Math.sin(th); Z[i] = z;
  }
  const el = new Float64Array(nT * 3); const ea = new Float64Array(nT * 3);
  let area = 0;
  for (let f = 0; f < nT; f += 1) {
    const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
    const abx = X[b] - X[a], aby = Y[b] - Y[a], abz = Z[b] - Z[a];
    const acx = X[c] - X[a], acy = Y[c] - Y[a], acz = Z[c] - Z[a];
    const A = 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    area += A;
    el[f * 3] = Math.hypot(abx, aby, abz);
    el[f * 3 + 1] = Math.hypot(X[c] - X[b], Y[c] - Y[b], Z[c] - Z[b]);
    el[f * 3 + 2] = Math.hypot(acx, acy, acz);
    ea[f * 3] = A; ea[f * 3 + 1] = A; ea[f * 3 + 2] = A;
  }
  const sorted = Float64Array.from(el); sorted.sort();
  const SHIP = 0.04;
  let below = 0; let belowA = 0; const seen = new Set<number>();
  for (let i = 0; i < el.length; i += 1) if (el[i] < SHIP) { below += 1; const f = Math.floor(i / 3); if (!seen.has(f)) { seen.add(f); belowA += ea[i]; } }
  return {
    minEdge, floorOn, nTri: nT, nVert: nV, area,
    eMin: sorted[0], eP01: sorted[Math.floor(0.01 * (sorted.length - 1))],
    eP50: sorted[Math.floor(0.5 * (sorted.length - 1))], eMax: sorted[sorted.length - 1],
    belowShip: (below / el.length) * 100, belowShipArea: (belowA / area) * 100,
    hash: fnv(V),
  };
};

const arms: Arm[] = [];
for (const floorOn of [false, true]) {
  for (const me of ARMS) {
    const t0 = Date.now();
    try { const a = runArm(me, floorOn); arms.push(a); log(`   ran minEdge=${me} floor=${floorOn ? 'ON' : 'off'} in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${a.nTri} tris`); }
    catch (e) { log(`   *** minEdge=${me} floor=${floorOn ? 'ON' : 'off'} THREW: ${(e as Error).message}`); }
  }
}
log('');

const table = (floorOn: boolean): void => {
  const g = arms.filter((a) => a.floorOn === floorOn);
  if (g.length === 0) return;
  log(`── ANALYTIC CURVATURE FLOOR ${floorOn ? 'ON (__pfConformingAnalyticFloor)' : 'OFF (SHIPPING DEFAULT)'} ──`);
  log('   minEdge   triangles   vs 0.04 arm   3D area(mm2)   edge MIN      edge p01      edge p50      edge MAX      edges<0.04 count%  area%   vertexbuf hash');
  const ref = g.find((a) => a.minEdge === 0.04);
  for (const a of g) {
    const rel = ref ? `${(a.nTri / ref.nTri).toFixed(6)}x` : '-';
    const same = ref && a.hash === ref.hash ? ' IDENTICAL' : '';
    log(`   ${a.minEdge.toFixed(4).padStart(7)}   ${String(a.nTri).padStart(9)}   ${rel.padStart(11)}   ${a.area.toFixed(3).padStart(12)}   ${a.eMin.toExponential(3)}  ${a.eP01.toExponential(3)}  ${a.eP50.toExponential(3)}  ${a.eMax.toExponential(3)}  ${a.belowShip.toFixed(4).padStart(10)}%  ${a.belowShipArea.toFixed(4).padStart(6)}%   ${a.hash}${same}`);
  }
  // THE VERDICT
  if (ref) {
    const inert = g.filter((a) => a.minEdge < 0.04).every((a) => a.hash === ref.hash);
    log(`   VERDICT: lowering qMinEdge below 0.04 is ${inert ? '*** A MEASURED NO-OP — every lower arm is BYTE-IDENTICAL to the 0.04 arm ***' : 'LIVE — the mesh changes'}`);
    const hi = g.filter((a) => a.minEdge > 0.04);
    for (const a of hi) log(`   raising it to ${a.minEdge}: ${a.hash === ref.hash ? 'also identical' : `${(a.nTri / ref.nTri).toFixed(4)}x triangles — THIS arm is live`}`);
  }
  log('');
};
table(false);
table(true);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   CROSS-READ: does the ANALYTIC FLOOR make the clamp live?');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
for (const me of ARMS) {
  const off = arms.find((a) => a.minEdge === me && !a.floorOn);
  const on = arms.find((a) => a.minEdge === me && a.floorOn);
  if (!off || !on) continue;
  log(`   minEdge ${me.toFixed(4).padStart(7)}:  floor OFF ${String(off.nTri).padStart(9)} tris (min edge ${off.eMin.toExponential(3)})   floor ON ${String(on.nTri).padStart(9)} tris (min edge ${on.eMin.toExponential(3)})   ${(on.nTri / off.nTri).toFixed(4)}x`);
}
log('');
writeFileSync(`${OUTDIR}/S117_WALLAB_${TAG}.json`, JSON.stringify({ style: STYLE, DIMS, DENSE, SIZERES, MAXSAG, MAXEDGE, MAXLEVEL, NRING, arms }, null, 2));
log(`json -> ${OUTDIR}/S117_WALLAB_${TAG}.json`);
log('S117 WALL A/B DONE');
