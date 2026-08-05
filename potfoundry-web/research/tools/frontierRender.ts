// frontierRender.ts — THE PICTURE THE TAXONOMY IMPLIES: the SAME mesh under the CHORD bar and the ANGLE bar.
//
// The finding this exists to show, without numbers: the campaign's orientation bar is
// `2 sin(theta/2) * diam <= 10 um`, an ANGLE times a LENGTH. Measured per facet, the ANGULAR DEVIATION it
// actually demands has an area-weighted median of **0.67 deg** — tighter than the tightest premium CAD
// export guidance (1 deg) and 15x tighter than the SOLIDWORKS default (10 deg). Two panels, one mesh:
//
//   LEFT  — coloured by the campaign's chord bar (green at 0, red at 3x bar). Most of the pot is red.
//   RIGHT — coloured by the ANGULAR DEVIATION against a 1 deg bar (green at 0, red at 3 deg). The red
//           collapses onto the ridges and the crease bands, which is where a real orientation defect is.
//
// SAME mesh, SAME facets, SAME covering ruler (k, inset) — only the CURRENCY changes.
//
// Colours are per-FACET (written to all three of its vertices) so nothing is smoothed across a facet
// boundary; the mesh is rendered as STL soup (an index per corner), which is also why no welding is done
// here. `meta.ruler` is set so the renderer's legend states which currency each panel is in.
//
// Usage: bash research/tools/run-frontier-render.sh
//   env: PF_FV_STYLE PF_FV_STL PF_FV_TAG PF_FV_K(4) PF_FV_ANGBAR(1.0) PF_FV_BAR_UM(10) PF_FV_MAXTRI(1200000)
import { mkdirSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { dumpRenderBins } from '../bridge/labkit';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_FV_STYLE ?? 'GothicArches';
const STL = process.env.PF_FV_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_FV_TAG ?? 'GOTH';
const K = Math.round(envF('PF_FV_K', 4));
const INSET = 0.02;
const BAR_UM = envF('PF_FV_BAR_UM', 10);
const ANGBAR = envF('PF_FV_ANGBAR', 1.0);
const MAXTRI = Math.round(envF('PF_FV_MAXTRI', 1200000));
const DIMS: StyleDims = { H: envF('PF_FV_H', 120), Rb: envF('PF_FV_RB', 40), Rt: envF('PF_FV_RT', 50), expn: 1 };
const H = DIMS.H;
const OUT = 'research/exchange/_strataConformBisect/frontier/render';

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

const T0 = Date.now();
mkdirSync(OUT, { recursive: true });
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const M = readMeshFloat64(STL, false);
const nTri = Math.min(M.nTri, MAXTRI);
const xyz = M.xyz;
log(`${STYLE} ${TAG}: ${M.nTri} facets, rendering ${nTri}   k=${K} inset=${INSET}`);

const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const sc = INSET / 3; let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + sc; const b = sh * (j / K) + sc;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}
const HARC = 2e-4; const HZ = 2e-4;

/** green -> yellow -> red ramp on t in [0,1], matching the lab heatmap legend. */
function ramp(t: number, o: Float32Array, i: number): void {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  let r: number; let g: number; let b: number;
  if (u < 0.5) { const s = u * 2; r = 33 + (250 - 33) * s; g = 158 + (209 - 158) * s; b = 59 + (26 - 59) * s; } else { const s = (u - 0.5) * 2; r = 250 + (219 - 250) * s; g = 209 + (33 - 209) * s; b = 26 + (33 - 26) * s; }
  o[i] = r / 255; o[i + 1] = g / 255; o[i + 2] = b / 255;
}

const pos = new Float32Array(nTri * 9);
const idxA = new Uint32Array(nTri * 3);
const colChord = new Float32Array(nTri * 9);
const colAng = new Float32Array(nTri * 9);
let overChordArea = 0; let overAngArea = 0; let areaTot = 0;
let maxChord = 0; let maxAng = 0;

for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  for (let k2 = 0; k2 < 9; k2 += 1) pos[o + k2] = xyz[o + k2];
  idxA[3 * t] = 3 * t; idxA[3 * t + 1] = 3 * t + 1; idxA[3 * t + 2] = 3 * t + 2;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz),
    Math.hypot(ax - bx, ay - by, az - bz));
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  let ang = 0;
  if (fl > 0) {
    const area = 0.5 * fl; areaTot += area;
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thA = Math.atan2(ay, ax);
    const thB = thA + dThRaw(thA, Math.atan2(by, bx));
    const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
    let best = -1;
    for (let p = 0; p < LP; p += 1) {
      const th = wA[p] * thA + wB[p] * thB + wC[p] * thC;
      const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
      const r0 = rA(th, zz);
      const hTh = HARC / Math.max(1e-9, Math.abs(r0));
      let zLo = zz - HZ; let zHi = zz + HZ;
      if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
      if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
      const rt = (rA(th + hTh, zz) - rA(th - hTh, zz)) / (2 * hTh);
      const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
      const c = Math.cos(th); const s = Math.sin(th);
      let vx = rt * s + r0 * c; let vy = r0 * s - rt * c; let vz = -r0 * rz;
      const L = Math.hypot(vx, vy, vz) || 1; vx /= L; vy /= L; vz /= L;
      let d = fx * vx + fy * vy + fz * vz; d = d > 1 ? 1 : d < -1 ? -1 : d;
      const a2 = Math.acos(d); if (a2 > best) best = a2;
    }
    ang = (best * 180) / Math.PI;
    const chord = 2 * Math.sin(0.5 * best) * diam * 1000;
    if (chord > maxChord) maxChord = chord;
    if (ang > maxAng) maxAng = ang;
    if (chord > BAR_UM) overChordArea += area;
    if (ang > ANGBAR) overAngArea += area;
    for (let v = 0; v < 3; v += 1) {
      ramp(chord / (3 * BAR_UM), colChord, o + 3 * v);
      ramp(ang / (3 * ANGBAR), colAng, o + 3 * v);
    }
  }
  if ((t + 1) % 200000 === 0) log(`  ${t + 1}/${nTri}  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

const pctC = (100 * overChordArea) / Math.max(1e-30, areaTot);
const pctA = (100 * overAngArea) / Math.max(1e-30, areaTot);
dumpRenderBins(OUT, `${TAG}_chordbar`, pos, idxA, {
  colors: colChord,
  meta: { ruler: `orientation CHORD 2sin(t/2)*diam, bar ${BAR_UM}um (red = 3x bar)`, class: `${pctC.toFixed(1)}% of AREA over`, worstMm: maxChord / 1000 },
});
dumpRenderBins(OUT, `${TAG}_anglebar`, pos, idxA, {
  colors: colAng,
  meta: { ruler: `ANGULAR DEVIATION deg, bar ${ANGBAR} deg (red = 3x bar)`, class: `${pctA.toFixed(1)}% of AREA over`, worstMm: maxAng },
});
log('');
log(`CHORD bar ${BAR_UM} um : ${pctC.toFixed(3)}% of rendered AREA over, max ${maxChord.toFixed(1)} um`);
log(`ANGLE bar ${ANGBAR} deg: ${pctA.toFixed(3)}% of rendered AREA over, max ${maxAng.toFixed(2)} deg`);
log(`bins -> ${OUT}/${TAG}_chordbar.*  and  ${OUT}/${TAG}_anglebar.*`);
log(`render: PF_RENDER_CELL=1100 NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs ${OUT}/${TAG}_bars.png ${OUT} 2 ${TAG}_chordbar ${TAG}_anglebar`);
log(`done [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
