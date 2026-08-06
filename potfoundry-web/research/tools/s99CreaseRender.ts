// s99CreaseRender.ts — THE PICTURE: where the surviving crease-spanning facets are, and what they are.
//
// Two panels over the SAME small patch of the SAME mesh (a patch, not the whole pot: the h-free crease
// probe costs ~600 rA evaluations per edge and 1.14 M facets is 40 minutes; a 10x8 mm window is seconds
// and the finding is a LOCAL one).
//
//   LEFT  — ORIENTATION. Per-facet angle between the facet normal and the surface normal, `orientOfFacet`
//           k=8 inset 0.02, green at 0 deg, red at 5 deg. This is the defect as the product sees it.
//   RIGHT — CREASE CROSSING. RED where the h-free two-sided Gauss-map probe finds a genuine tangent
//           discontinuity crossing one of the facet's edges (turn > 1 deg at an offset of L*2^-14),
//           GREY otherwise.
//
// If the red in the right panel is a THIN 1-D FILAMENT that lands on top of the red in the left panel,
// the class is a 1-D conforming problem. If it is a 2-D blob, it is not.
//
// Usage: bash research/tools/run-s99-crease-render.sh
import { mkdirSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormalsCentral, radialNormal } from '../bridge/orientRuler';
import { dumpRenderBins } from '../bridge/labkit';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S99R_STYLE ?? 'GothicArches';
const STL = process.env.PF_S99R_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S99R_TAG ?? 'GOTH';
const TH0 = envF('PF_S99R_TH', 2.0139);
const Z0 = envF('PF_S99R_Z', 66.282);
const ARC = envF('PF_S99R_ARC', 4.0);      // half-window in arc length, mm
const DZ = envF('PF_S99R_DZ', 5.0);        // half-window in z, mm
const ANGBAR = envF('PF_S99R_ANGBAR', 5.0);
const TURN_DEG = envF('PF_S99R_TURN', 1.0);
const EPS = envF('PF_S99R_EPS', 0.05);
const DIMS: StyleDims = { H: envF('PF_S99R_H', 120), Rb: envF('PF_S99R_RB', 40), Rt: envF('PF_S99R_RT', 50), expn: 1 };
const H = DIMS.H;
const OUT = 'research/exchange/_strataConformBisect/s99/render';
const RAD = 180 / Math.PI;
const LAD = [6, 8, 10, 12, 14];

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

mkdirSync(OUT, { recursive: true });
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsCentral = fdNormalsCentral(rA, H, 2e-4, 2e-4);

// ── the SAME h-free probe as s99CreaseCensus (kept in sync by construction: identical body) ──
const nrm = (th: number, z: number, hMm: number, out: Float64Array): void => {
  const r0 = rA(th, z);
  const hTh = hMm / Math.max(1e-9, Math.abs(r0));
  let zLo = z - hMm; let zHi = z + hMm;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * hMm); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * hMm); }
  const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
  radialNormal(r0, rt, rz, th, out, 0);
};
const ang3 = (p: Float64Array, q: Float64Array): number => {
  let d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  d = d > 1 ? 1 : d < -1 ? -1 : d; return Math.acos(d);
};
const n0 = new Float64Array(3); const nm = new Float64Array(3); const n1 = new Float64Array(3);
function probeTurn(th0: number, z0: number, th1: number, z1: number, rRef: number): number {
  const lenMm = Math.hypot(rRef * (th1 - th0), z1 - z0);
  if (!(lenMm > 0)) return 0;
  const scan = 8; const iters = 16;
  const at = (s: number, h: number, o: Float64Array): void => nrm(th0 + (th1 - th0) * s, z0 + (z1 - z0) * s, h, o);
  const buf = new Float64Array(3 * (scan + 1));
  const hC = lenMm / (scan * 32);
  for (let i = 0; i <= scan; i += 1) {
    const tmp = new Float64Array(3); at(i / scan, hC, tmp);
    buf[3 * i] = tmp[0]; buf[3 * i + 1] = tmp[1]; buf[3 * i + 2] = tmp[2];
  }
  let bi = 0; let bv = -1;
  for (let i = 0; i < scan; i += 1) {
    const a = ang3(buf.subarray(3 * i, 3 * i + 3), buf.subarray(3 * (i + 1), 3 * (i + 1) + 3));
    if (a > bv) { bv = a; bi = i; }
  }
  let lo = bi / scan; let hi = (bi + 1) / scan;
  for (let it = 0; it < iters; it += 1) {
    const w = hi - lo; const h = (lenMm * w) / 32; const mid = 0.5 * (lo + hi);
    at(lo, h, n0); at(mid, h, nm); at(hi, h, n1);
    const a = ang3(n0, nm); const c = ang3(nm, n1);
    if (a > c + 1e-13) hi = mid; else if (c > a + 1e-13) lo = mid; else { lo = mid - 0.25 * w; hi = mid + 0.25 * w; }
  }
  const s = 0.5 * (lo + hi);
  const dMax = Math.min(Math.pow(2, -LAD[0]), 0.45 * Math.min(s, 1 - s));
  if (!(dMax > 0)) return 0;
  let tFine = 0;
  for (let q = 0; q < LAD.length; q += 1) {
    const d = dMax * Math.pow(2, LAD[0] - LAD[q]);
    const h = (lenMm * d) / 32;
    at(s - d, h, n0); at(s + d, h, n1);
    tFine = ang3(n0, n1);
  }
  return tFine;
}

function ramp(t: number, o: Float32Array, i: number): void {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  let r: number; let g: number; let b: number;
  if (u < 0.5) { const s = u * 2; r = 33 + (250 - 33) * s; g = 158 + (209 - 158) * s; b = 59 + (26 - 59) * s; } else { const s = (u - 0.5) * 2; r = 250 + (219 - 250) * s; g = 209 + (33 - 209) * s; b = 26 + (33 - 26) * s; }
  o[i] = r / 255; o[i + 1] = g / 255; o[i + 2] = b / 255;
}

const M = readMeshFloat64(STL, false);
const xyz = M.xyz;
log(`${STYLE} ${TAG}: ${M.nTri} facets; window theta ${TH0.toFixed(4)} +/- ${(ARC / 45).toFixed(4)} rad, z ${Z0} +/- ${DZ}`);
const sel: number[] = [];
for (let t = 0; t < M.nTri; t += 1) {
  const o = t * 9;
  const gz = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
  if (Math.abs(gz - Z0) > DZ) continue;
  const gx = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
  const gy = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
  const r = Math.hypot(gx, gy);
  const dth = dThRaw(TH0, Math.atan2(gy, gx));
  if (Math.abs(dth * r) > ARC) continue;
  sel.push(t);
}
log(`selected ${sel.length} facets`);

const nT = sel.length;
const pos = new Float32Array(nT * 9);
const idx = new Uint32Array(nT * 3);
const colAng = new Float32Array(nT * 9);
const colCr = new Float32Array(nT * 9);
const scratch = new Float64Array(12);
let nCrossed = 0; let maxAng = 0; let crossArea = 0; let totArea = 0;

for (let i = 0; i < nT; i += 1) {
  const t = sel[i]; const o = t * 9; const p = i * 9;
  for (let k = 0; k < 9; k += 1) pos[p + k] = xyz[o + k];
  idx[3 * i] = 3 * i; idx[3 * i + 1] = 3 * i + 1; idx[3 * i + 2] = 3 * i + 2;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const or = orientOfFacet(nsCentral, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
    { k: 8, inset: 0.02, orient: 'outward', scratch });
  const a2 = Number.isFinite(or.normDeg) ? or.normDeg : 0;
  if (a2 > maxAng) maxAng = a2;
  const area = 0.5 * Math.hypot(
    (by - ay) * (cz - az) - (bz - az) * (cy - ay),
    (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
  );
  totArea += area;
  const E = [[thA, az, thB, bz], [thB, bz, thC, cz], [thC, cz, thA, az]];
  let crossed = false; let worstTurn = 0;
  for (const [t0, z0, t1, z1] of E) {
    const q0 = EPS; const q1 = 1 - EPS;
    const tn = probeTurn(t0 + (t1 - t0) * q0, z0 + (z1 - z0) * q0, t0 + (t1 - t0) * q1, z0 + (z1 - z0) * q1, rRef) * RAD;
    if (tn > worstTurn) worstTurn = tn;
    if (tn > TURN_DEG) crossed = true;
  }
  if (crossed) { nCrossed += 1; crossArea += area; }
  for (let v = 0; v < 3; v += 1) {
    ramp(a2 / ANGBAR, colAng, p + 3 * v);
    if (crossed) { colCr[p + 3 * v] = 0.86; colCr[p + 3 * v + 1] = 0.13; colCr[p + 3 * v + 2] = 0.13; } else { colCr[p + 3 * v] = 0.72; colCr[p + 3 * v + 1] = 0.74; colCr[p + 3 * v + 2] = 0.76; }
  }
}
log(`crease-crossing facets in the window: ${nCrossed}/${nT} (${((100 * nCrossed) / Math.max(1, nT)).toFixed(2)}%), AREA ${((100 * crossArea) / Math.max(1e-300, totArea)).toFixed(3)}%   max orientation ${maxAng.toFixed(1)} deg`);

dumpRenderBins(OUT, `${TAG}_orient`, pos, idx, {
  colors: colAng,
  meta: { ruler: `orientation angle vs ${ANGBAR} deg bar (orientOfFacet k=8 inset 0.02)`, worstMm: 0, p99Mm: 0, tris: nT },
});
dumpRenderBins(OUT, `${TAG}_crease`, pos, idx, {
  colors: colCr,
  meta: { ruler: `RED = h-free crease crossing (turn > ${TURN_DEG} deg at offset L*2^-14); ${nCrossed} of ${nT} facets`, worstMm: 0, p99Mm: 0, tris: nT },
});
log(`bins -> ${OUT}`);
