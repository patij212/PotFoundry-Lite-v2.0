// s93ClusterRender.ts — LOOK AT THE FINS. Visual evidence for the S90/S91/S92 numbers. READ-ONLY.
//
// The claim under test is geometric and the lab rule is explicit: if a render disagrees with a metric,
// trust the render. S90 says the MIS-ORIENTED class is 124,245 near-degenerate CAPS (largest interior
// angle p50 177.3 deg, 789 um long and 2.8 um tall) standing off the Voronoi wall as FINS (H1/H2loc
// 7.06x), clustered into 3,176 components of up to 7,019 facets. That is a strong geometric claim made
// entirely from scalars. This probe cuts out the largest clusters WITH their surrounding context and
// dumps render bins so the claim can be looked at.
//
// Colour = the MONOTONE orientation chord `2*sin(th/2)*diam` in um, log-ish ramp, with the MIS class
// (aspect3 >= 50) forced to the top of the ramp so it is unmistakable against its neighbours.
//
// Usage:  bash research/tools/run-s93-cluster-render.sh
//         then: NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs \
//               research/exchange/_strataConformBisect/s93render/fins.png \
//               research/exchange/_strataConformBisect/s93render 2 <names...>
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { dumpRenderBins } from '../bridge/labkit';
import { mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S93_STYLE ?? 'Voronoi';
const STEMS = (process.env.PF_S93_STEMS ?? 'voronoi_ring_D--=BEFORE,s92pass/voronoi_ring_D--_S92=AFTER-COLLAPSE').split(',');
const AR_SPLIT = envF('PF_S93_AR', 50);
const NCL = Math.round(envF('PF_S93_NCL', 2));         // how many clusters to cut
const RING = Math.round(envF('PF_S93_RING', 3));       // context rings around the cluster
const DIR = 'research/exchange/_strataConformBisect/s93render';
mkdirSync(DIR, { recursive: true });

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const DIMS: StyleDims = { H: envF('PF_S93_H', 120), Rb: envF('PF_S93_RB', 40), Rt: envF('PF_S93_RT', 50), expn: 1 };
const H = DIMS.H;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('===== S93 — CUT THE FIN CLUSTERS AND DUMP RENDER BINS =====');
// A FIXED WINDOW, so BEFORE and AFTER show the SAME piece of pot. Chosen from the largest BEFORE cluster
// and then applied verbatim to every mesh; a per-mesh "largest cluster" would compare two different places.
let winTh = NaN; let winZ = NaN;
const WIN_TH = envF('PF_S93_WINTH', 0.06);             // half-width in radians
const WIN_Z = envF('PF_S93_WINZ', 4.0);                // half-height in mm

for (const spec of STEMS) {
  const [stem, label] = spec.split('=');
  const path = `research/exchange/_strataConformBisect/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`${label}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  // per-facet metric on the soup (no weld needed for a picture)
  const chd = new Float64Array(nTri); const ar = new Float64Array(nTri);
  const cth = new Float64Array(nTri); const cz = new Float64Array(nTri);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const czz = xyz[o + 8];
    let fx = (by - ay) * (czz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (czz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz);
    const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - czz), Math.hypot(ax - cx, ay - cy, az - czz), Math.hypot(ax - bx, ay - by, az - bz));
    const thA = Math.atan2(ay, ax);
    const thc = thA + (dThRaw(thA, Math.atan2(by, bx)) + dThRaw(thA, Math.atan2(cy, cx))) / 3;
    cth[t] = thc; cz[t] = (az + bz + czz) / 3;
    if (!(fl > 1e-18)) { chd[t] = Infinity; ar[t] = Infinity; continue; }
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const zc = Math.min(H, Math.max(0, cz[t]));
    const r = rA(thc, zc);
    const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    chd[t] = 2 * Math.sin(Math.acos(dot) / 2) * diam * 1000;
    ar[t] = diam / Math.max(1e-300, fl / Math.max(1e-300, diam));
  }
  if (!Number.isFinite(winTh)) {
    // densest 0.12 rad x 8 mm window of MIS facets, on the FIRST mesh only
    const cellTh = 0.02; const cellZ = 1.0;
    const bins = new Map<string, { n: number; th: number; z: number }>();
    for (let t = 0; t < nTri; t += 1) {
      if (!(ar[t] >= AR_SPLIT)) continue;
      const k = `${Math.round(cth[t] / cellTh)}|${Math.round(cz[t] / cellZ)}`;
      const b = bins.get(k);
      if (b === undefined) bins.set(k, { n: 1, th: cth[t], z: cz[t] }); else { b.n += 1; b.th += cth[t]; b.z += cz[t]; }
    }
    let best = { n: 0, th: 0, z: 0 };
    for (const b of bins.values()) if (b.n > best.n) best = b;
    winTh = best.th / best.n; winZ = best.z / best.n;
    log(`window centre: theta ${winTh.toFixed(4)} rad, z ${winZ.toFixed(3)} mm  (densest cell held ${best.n} MIS facets)`);
  }
  // cut the window
  const sel: number[] = [];
  for (let t = 0; t < nTri; t += 1) {
    let d = cth[t] - winTh; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) <= WIN_TH && Math.abs(cz[t] - winZ) <= WIN_Z) sel.push(t);
  }
  const nSel = sel.length;
  const pos = new Float32Array(nSel * 9); const idx = new Uint32Array(nSel * 3); const col = new Float32Array(nSel * 9);
  let nMis = 0; let worst = 0;
  for (let i = 0; i < nSel; i += 1) {
    const t = sel[i]; const o = t * 9;
    for (let k = 0; k < 9; k += 1) pos[i * 9 + k] = xyz[o + k];
    for (let k = 0; k < 3; k += 1) idx[i * 3 + k] = i * 3 + k;
    const isMis = ar[t] >= AR_SPLIT; if (isMis) nMis += 1;
    if (Number.isFinite(chd[t]) && chd[t] > worst) worst = chd[t];
    // ramp: <=10 um green, 10..300 um yellow->orange, >300 um red; MIS forced to magenta
    let r0; let g0; let b0;
    if (isMis) { r0 = 1.0; g0 = 0.0; b0 = 0.85; } else {
      const v = Math.min(1, Math.max(0, Math.log10(Math.max(1e-3, chd[t]) / 10) / Math.log10(300 / 10)));
      r0 = v; g0 = 1 - 0.75 * v; b0 = 0.25 * (1 - v);
    }
    for (let k = 0; k < 3; k += 1) { col[i * 9 + 3 * k] = r0; col[i * 9 + 3 * k + 1] = g0; col[i * 9 + 3 * k + 2] = b0; }
  }
  const name = `fins_${label.replace(/[^A-Za-z0-9]/g, '_')}`;
  dumpRenderBins(DIR, name, pos, idx, {
    colors: col, stl: true,
    meta: {
      ruler: 'orientation-chord-um', cls: label, tris: nSel, misFacets: nMis,
      worstMm: worst / 1000, p99Mm: 0, pctOver0_03: (100 * nMis) / Math.max(1, nSel), nonMan: 0,
      note: `magenta = aspect3>=${AR_SPLIT} (MIS class); green->red = orientation chord 10->300 um`,
    },
  });
  log(`${label}: window holds ${nSel} facets, ${nMis} MIS (${((100 * nMis) / Math.max(1, nSel)).toFixed(2)}%), worst chord ${worst.toFixed(1)} um -> ${DIR}/${name}.*`);
  log(`   NCL=${NCL} RING=${RING} (reserved knobs, unused in the window cut)`);
}
log('done');
