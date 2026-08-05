// s43VertexOnSurface.ts — DO THE MESH'S VERTICES ACTUALLY LIE ON THE ANALYTIC SURFACE?
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS RUNS, AND WHY IT RUNS NOW
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S42 measured the RELIEF RATIO across the stranded `shape-ar` population — |lift - chord| / edgeLen
// at the best split placement — and found it SMALL: p50 0.042, p90 0.123, max 0.842, and not one
// facet of 773 above 1.0. The analytic surface is essentially FLAT across these facets.
//
// And yet the driver's own edge ruler reads up to 210.617 um of sag on them, on facets whose longest
// edge is 130.6 um. A chord cannot sag 1.6x its own length across a surface that is flat over that
// span. So the sag is NOT surface curvature between the endpoints.
//
// THAT LEAVES THE ENDPOINTS. If a vertex is not ON the surface, every edge incident to it reads a
// large sag no matter how fine the mesh gets, refinement never converges there, and the AR guard
// eventually strands the facet — which is exactly the observed signature, including the part that has
// never made sense: `unresolved` falls 80% under the seed re-solve while the MAX does not move at all.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// For every welded vertex of the shipped STL:   residual = | hypot(x,y) - rA(canonTheta(atan2(y,x)), z) |
//
// This is the RADIAL residual, which is what "on the surface" means for a radial-graph surface
// r = rA(theta, z): the vertex is on the surface iff its radius equals the surface's radius at its own
// (theta, z). It needs ONE rA eval per vertex and no search, so it is exact rather than estimated —
// unlike a perpendicular distance, which needs a minimisation and can only ever be an upper bound.
//
// THE NOISE FLOOR IS DERIVED, NOT GUESSED. The STL ships f32 at radii ~40-50 mm, so one ulp is
// ~50 * 2^-23 = 6.0e-6 mm = 0.006 um, and theta/z carry their own ulp into the rA argument. Anything
// under ~0.05 um is the format; anything above it is a vertex that was placed off the surface and
// stayed there.
//
// REPORTED THREE WAYS, because the decisive question is not "are there any" but "are they WHERE THE
// RESIDUAL IS": the whole-mesh distribution, the distribution over vertices of the stranded facets,
// and the same for a matched random control sample of facets. If the stranded population is enriched
// in off-surface vertices, the jam is a VERTEX PLACEMENT defect wearing a shape-guard costume.
//
// Read-only. Safe to run beside a live mesher arm.
//
// Usage:  bash research/tools/run-s43-vertex-on-surface.sh [TAG]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../../src/geometry/types';
import { readFileSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAG = process.env.PF_S43_TAG ?? 'S39CTL';
const BASE = `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_${TAG}`;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const rAraw = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const rA = (th: number, z: number): number => rAraw(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('===== S43 — DO THE MESH VERTICES LIE ON THE SURFACE? =====');
log(`STL ${BASE}.stl`);
const t0 = Date.now();
const { xyz, nTri } = readMeshFloat64(`${BASE}.stl`, false);

const vx: number[] = []; const vy: number[] = []; const vz: number[] = [];
const vkey = new Map<string, number>();
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
const vid = (x: number, y: number, z: number): number => {
  const k = `${x},${y},${z}`;
  const got = vkey.get(k);
  if (got !== undefined) return got;
  const i = vx.length; vkey.set(k, i); vx.push(x); vy.push(y); vz.push(z); return i;
};
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  ta[t] = vid(xyz[o], xyz[o + 1], xyz[o + 2]);
  tb[t] = vid(xyz[o + 3], xyz[o + 4], xyz[o + 5]);
  tc[t] = vid(xyz[o + 6], xyz[o + 7], xyz[o + 8]);
}
const nV = vx.length;
log(`     ${nTri} triangles, ${nV} welded vertices`);

// ── the residual, one rA eval per vertex ──
const res = new Float64Array(nV);
for (let i = 0; i < nV; i += 1) {
  const th = canonTheta(Math.atan2(vy[i], vx[i]));
  res[i] = Math.abs(Math.hypot(vx[i], vy[i]) - rA(th, vz[i])) * 1000; // um
}
const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
// NOT Math.max(...v): spreading 571,663 arguments overflows the call stack (measured, v24). Every
// max in this file is a fold for that reason.
const amax = (v: ArrayLike<number>): number => { let m = -Infinity; for (let i = 0; i < v.length; i += 1) if (v[i] > m) m = v[i]; return m; };
const stat = (v: number[], label: string): void => {
  if (v.length === 0) { log(`  ${label.padEnd(34)} (empty)`); return; }
  const over = (b: number): string => `${((100 * v.filter((x) => x > b).length) / v.length).toFixed(3)}%`;
  log(`  ${label.padEnd(34)} n=${String(v.length).padStart(8)}  p50 ${q(v, 0.5).toFixed(4)}  p90 ${q(v, 0.9).toFixed(4)}  p99 ${q(v, 0.99).toFixed(4)}  MAX ${amax(v).toFixed(3)} um   >0.05um ${over(0.05)}  >1um ${over(1)}  >10um ${over(10)}`);
};

log('');
log('RADIAL RESIDUAL |r_vertex - rA(theta_vertex, z_vertex)|, in um. f32 noise floor ~0.006 um.');
stat(Array.from(res), 'ALL VERTICES');

// ── vertices of the stranded facets ──
interface JamRow { z: number; shortUm: number; midUm: number; longUm: number; sagNowUm: number }
const jam = (JSON.parse(readFileSync(`${BASE}.unresolved.json`, 'utf8')) as { facets: JamRow[] }).facets;
const eLen = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
const byZ = new Map<number, number[]>();
for (let t = 0; t < nTri; t += 1) {
  const z = Math.round(((vz[ta[t]] + vz[tb[t]] + vz[tc[t]]) / 3) * 1000) / 1000;
  const l = byZ.get(z); if (l === undefined) byZ.set(z, [t]); else l.push(t);
}
const findTri = (r: JamRow): number => {
  const want = [r.shortUm, r.midUm, r.longUm].sort((x, y) => x - y);
  for (const dz of [0, 0.001, -0.001]) {
    for (const t of byZ.get(Math.round((r.z + dz) * 1000) / 1000) ?? []) {
      const es = [eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])]
        .map((v) => Math.round(v * 10000) / 10).sort((x, y) => x - y);
      if (es.every((v, k) => Math.abs(v - want[k]) < 0.35)) return t;
    }
  }
  return -1;
};
const jamTris: number[] = []; const jamSag: number[] = [];
for (const r of jam) { const t = findTri(r); if (t >= 0) { jamTris.push(t); jamSag.push(r.sagNowUm); } }
const vertsOf = (ts: number[]): number[] => {
  const s = new Set<number>(); for (const t of ts) { s.add(ta[t]); s.add(tb[t]); s.add(tc[t]); } return Array.from(s);
};
const jamV = vertsOf(jamTris);
stat(jamV.map((i) => res[i]), 'STRANDED-FACET VERTICES');

// matched random control, same count of facets
const ctlTris: number[] = [];
for (let k = 0; k < jamTris.length; k += 1) ctlTris.push(Math.floor(((k + 0.5) / jamTris.length) * nTri));
stat(vertsOf(ctlTris).map((i) => res[i]), 'CONTROL (uniform facet sample)');

log('');
log('PER-FACET: the MAX vertex residual of the facet, against the sag the driver re-reads on it.');
const worstOf = (t: number): number => Math.max(res[ta[t]], res[tb[t]], res[tc[t]]);
const pairs = jamTris.map((t, i) => ({ t, sag: jamSag[i], vr: worstOf(t) }));
pairs.sort((a, b) => b.sag - a.sag);
log(`  ${'sagNow um'.padStart(10)} ${'maxVertexResidual um'.padStart(21)}   ratio`);
for (const p of pairs.slice(0, 12)) {
  log(`  ${p.sag.toFixed(1).padStart(10)} ${p.vr.toFixed(3).padStart(21)}   ${p.vr > 1e-9 ? (p.sag / p.vr).toFixed(2) : 'inf'}`);
}
const nOff = pairs.filter((p) => p.vr > 0.05).length;
log('');
log(`  stranded facets with an OFF-SURFACE vertex (>0.05 um): ${nOff} / ${pairs.length} (${((100 * nOff) / Math.max(1, pairs.length)).toFixed(1)}%)`);
const bigSag = pairs.filter((p) => p.sag > 50);
if (bigSag.length > 0) {
  const n2 = bigSag.filter((p) => p.vr > 0.05).length;
  log(`  of the ${bigSag.length} stranded facets over 50 um of sag: ${n2} (${((100 * n2) / bigSag.length).toFixed(1)}%) carry an off-surface vertex`);
}

// ── where are the worst offenders, mesh-wide? ──
log('');
log('WORST 12 OFF-SURFACE VERTICES IN THE WHOLE MESH:');
const idx = Array.from({ length: nV }, (_, i) => i).sort((a, b) => res[b] - res[a]);
log(`  ${'residual um'.padStart(12)} ${'z mm'.padStart(9)} ${'theta rad'.padStart(10)} ${'r mm'.padStart(9)}`);
for (const i of idx.slice(0, 12)) {
  log(`  ${res[i].toFixed(3).padStart(12)} ${vz[i].toFixed(4).padStart(9)} ${canonTheta(Math.atan2(vy[i], vx[i])).toFixed(5).padStart(10)} ${Math.hypot(vx[i], vy[i]).toFixed(4).padStart(9)}`);
}
const off = idx.filter((i) => res[i] > 0.05);
log('');
log(`TOTAL OFF-SURFACE VERTICES (>0.05 um): ${off.length} / ${nV}  (${((100 * off.length) / nV).toFixed(4)}%)`);
if (off.length > 0) {
  const zb = new Array(24).fill(0);
  for (const i of off) zb[Math.min(23, Math.max(0, Math.floor((vz[i] / H) * 24)))] += 1;
  log(`  z-histogram (24 bins, base -> rim): ${zb.join(' ')}`);
  log(`  their residuals: p50 ${q(off.map((i) => res[i]), 0.5).toFixed(3)}  p90 ${q(off.map((i) => res[i]), 0.9).toFixed(3)}  MAX ${amax(off.map((i) => res[i])).toFixed(3)} um`);
}
log('');
log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
