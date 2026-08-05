// s64OrientRender.ts — VISUAL EVIDENCE for the orientation defect and the constrained flip.
//
// The campaign's standing heatmaps colour by POSITION error, which on these meshes is uniformly green (p99
// 4.9 um, zero over the bar) and therefore shows nothing. This dumps the same render bins coloured by the
// ORIENTATION ruler `tangExc` instead, over a small (theta,z) WINDOW so individual facets are visible, for
// two meshes side by side (BEFORE / AFTER the flip). Flat-shaded, per the lab rule that smooth normals hide
// exactly the defect we are looking at.
//
// The window is chosen automatically as the (theta,z) cell with the most over-bar facets in the FIRST mesh,
// so the picture is of the worst region rather than a region I picked to look good.
//
// Usage: bash research/tools/run-s64-orient-render.sh <TAG>
//   env: PF_S64_A=<stl> PF_S64_B=<stl> PF_S64_NA=<label> PF_S64_NB=<label> PF_S64_STYLE=Voronoi
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { dumpRenderBins, vertErrColors } from '../bridge/labkit';
import { mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S64_STYLE ?? 'Voronoi';
const A = process.env.PF_S64_A ?? 'research/exchange/_strataConformBisect/voronoi_ring_D--.stl';
const B = process.env.PF_S64_B ?? 'research/exchange/_strataConformBisect/s60flip/voronoi_ring_D--_A2CON.stl';
const NA = process.env.PF_S64_NA ?? 'before';
const NB = process.env.PF_S64_NB ?? 'after';
const OUTDIR = process.env.PF_S64_OUT ?? 'research/exchange/_strataConformBisect/s60flip/render';
const BAR = envF('PF_S64_BAR_UM', 10);
const SCALE_UM = envF('PF_S64_SCALE_UM', 50);       // colour ramp saturates here
const DTH = envF('PF_S64_DTH', 0.05);               // window half-width in theta (rad)
const DZ = envF('PF_S64_DZ', 3);                    // window half-height in z (mm)
const DIMS: StyleDims = { H: envF('PF_S64_H', 120), Rb: envF('PF_S64_RB', 40), Rt: envF('PF_S64_RT', 50), expn: envF('PF_S64_EXPN', 1) };
const H = DIMS.H;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
mkdirSync(OUTDIR, { recursive: true });

/** tangExc (um) of one facet given its nine raw coordinates. */
function tang(x: Float64Array, o: number): { g: number; th: number; z: number } {
  const ax = x[o]; const ay = x[o + 1]; const az = x[o + 2];
  const bx = x[o + 3]; const by = x[o + 4]; const bz = x[o + 5];
  const cx = x[o + 6]; const cy = x[o + 7]; const cz = x[o + 8];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const thA = Math.atan2(ay, ax);
  const thc = thA + (dThRaw(thA, Math.atan2(by, bx)) + dThRaw(thA, Math.atan2(cy, cx))) / 3;
  const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
  if (fl < 1e-18) return { g: 0, th: thc, z: zc };
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const r = rA(thc, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
  const cc = Math.cos(thc); const ss = Math.sin(thc);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  const diam = Math.max(
    Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  return { g: Math.sin(Math.acos(dot)) * diam * 1000, th: thc, z: zc };
}

log('===== S64 — ORIENTATION HEATMAP (tangExc), windowed so facets are visible =====');
// ── choose the window from mesh A: the (theta,z) bin with the most over-bar facets
const mA = readMeshFloat64(A, false);
const NTH = 64; const NZB = 40;
const hist = new Int32Array(NTH * NZB);
const tgA = new Float64Array(mA.nTri); const thA2 = new Float64Array(mA.nTri); const zA = new Float64Array(mA.nTri);
for (let t = 0; t < mA.nTri; t += 1) {
  const r = tang(mA.xyz, t * 9); tgA[t] = r.g; thA2[t] = r.th; zA[t] = r.z;
  if (r.g > BAR) {
    const i = Math.min(NTH - 1, Math.max(0, Math.floor(((canonTheta(r.th) + Math.PI) / (2 * Math.PI)) * NTH)));
    const j = Math.min(NZB - 1, Math.max(0, Math.floor((r.z / H) * NZB)));
    hist[j * NTH + i] += 1;
  }
}
let bi = 0; let bmax = -1;
for (let i = 0; i < hist.length; i += 1) if (hist[i] > bmax) { bmax = hist[i]; bi = i; }
const TH0 = -Math.PI + ((bi % NTH) + 0.5) * ((2 * Math.PI) / NTH);
const Z0 = ((Math.floor(bi / NTH) + 0.5) * H) / NZB;
log(`window: theta ${TH0.toFixed(4)} +- ${DTH}, z ${Z0.toFixed(2)} +- ${DZ} mm  (worst bin: ${bmax} over-bar facets)`);

function dump(path: string, name: string): void {
  const m = readMeshFloat64(path, false);
  const px: number[] = []; const idx: number[] = []; const err: number[] = [];
  let nOver = 0; let n = 0; let worst = 0;
  for (let t = 0; t < m.nTri; t += 1) {
    const r = tang(m.xyz, t * 9);
    const dth = dThRaw(TH0, r.th);
    if (Math.abs(dth) > DTH || Math.abs(r.z - Z0) > DZ) continue;
    n += 1; if (r.g > BAR) nOver += 1; if (r.g > worst) worst = r.g;
    const base = px.length / 3;
    for (let e = 0; e < 3; e += 1) {
      px.push(m.xyz[t * 9 + 3 * e], m.xyz[t * 9 + 3 * e + 1], m.xyz[t * 9 + 3 * e + 2]);
      err.push(r.g / 1000);                                   // mm, for the shared lab ramp
      idx.push(base + e);
    }
  }
  const colors = vertErrColors(Float64Array.from(err), SCALE_UM / 1000);
  dumpRenderBins(OUTDIR, name, Float32Array.from(px), Uint32Array.from(idx), {
    colors,
    meta: {
      ruler: `tangExc orientation (0..${SCALE_UM} um)`, class: name,
      tris: idx.length / 3, worstMm: worst / 1000, p99Mm: 0, pctOver0_03: (100 * nOver) / Math.max(1, n), nonMan: 0,
    },
    stl: true,
  });
  log(`  ${name}: ${n} facets in window, ${nOver} over ${BAR} um (${((100 * nOver) / Math.max(1, n)).toFixed(1)}%), worst ${worst.toFixed(1)} um -> ${OUTDIR}/${name}.*`);
}
dump(A, NA);
dump(B, NB);
log('');
log(`render with:  PF_RENDER_CELL=1100 NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs ${OUTDIR}/orient.png ${OUTDIR} 2 ${NA} ${NB}`);
log('done');
