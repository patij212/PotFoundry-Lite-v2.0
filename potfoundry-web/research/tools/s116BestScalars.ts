// s116BestScalars.ts — per-facet scalar fields for the S116 renders, in STL FILE ORDER.
//
// The renderer takes a raw little-endian Float64 binary of exactly nTri values (PF_S116_SCALAR). This
// writes two of them for any STL:
//   *_NORMDEG.f64  orientOfFacet normDeg in DEG at an EXPLICIT inset, an explicit lattice order k and an
//                  explicit fd step h — all three are instrument scars and none of them is left default.
//   *_R3.f64       the honest perpendicular position error in mm (R1 lattice sup, adjudicated by
//                  buildRadialSurfaceProjector on every facet whose R1 clears the candidate cut).
// Nothing here is a new measurement claim; it exists so the pictures are of the same numbers the census
// reported. Usage: bash research/tools/run-s116-scalars.sh   env PF_S116_STL(abs) PF_S116_TAG
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const STYLE = envS('PF_S116_STYLE', 'GothicArches');
const STL = envS('PF_S116_STL', '');
const TAG = envS('PF_S116_TAG', 'X');
const OUTDIR = envS('PF_S116_OUTDIR', 'research/exchange/_strataConformBisect/s116');
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const K = envI('PF_S116_K', 4);
const INSET = envF('PF_S116_INSET', 0.05);
const HFD = envF('PF_S116_HFD', 2e-6);
const KPOS = envI('PF_S116_KPOS', 6);
const CAND = envF('PF_S116_CAND', 0.002);
if (STL.length === 0) { log('*** PF_S116_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });
const ns = fdNormals(rA, H, HFD, HFD * 10);

const { xyz, nTri } = readMeshFloat64(STL, false);
log(`s116BestScalars  ${STL}`);
log(`  ${nTri} facets   style ${STYLE}   normDeg at k=${K} inset=${INSET} h=${HFD}   position at k=${KPOS} cand>${CAND}`);

const lat = (k: number): Float64Array => {
  const o: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) o.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(o);
};

// ── normDeg ──
const nd = new Float64Array(nTri);
{
  const t0 = Date.now(); const scratch = new Float64Array(12);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ath = Math.atan2(xyz[o + 1], xyz[o]);
    const bth = ath + dThRaw(ath, Math.atan2(xyz[o + 4], xyz[o + 3]));
    const cth = ath + dThRaw(ath, Math.atan2(xyz[o + 7], xyz[o + 6]));
    const r = orientOfFacet(ns, xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8], ath, bth, cth, { k: K, inset: INSET, scratch });
    nd[t] = Number.isFinite(r.normDeg) ? r.normDeg : 0;
  }
  let mx = 0; let over10 = 0;
  for (let t = 0; t < nTri; t += 1) { if (nd[t] > mx) mx = nd[t]; if (nd[t] > 10) over10 += 1; }
  log(`  normDeg: MAX ${mx.toFixed(3)} deg, facets >10 deg ${over10} (${((over10 / nTri) * 100).toFixed(4)}%)  in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  writeFileSync(`${OUTDIR}/S116_SCALAR_${TAG}_NORMDEG.f64`, Buffer.from(nd.buffer));
}

// ── position R3 ──
{
  const t0 = Date.now();
  const L = lat(KPOS); const NP = L.length / 3;
  const r3 = new Float64Array(nTri);
  const dd = new Float64Array(NP); const ord = new Int32Array(NP);
  let calls = 0;
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const v = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      dd[p] = v; if (v > w) w = v;
    }
    if (w <= CAND) { r3[t] = w; continue; }
    let nTop = 0;
    for (let p = 0; p < NP; p += 1) {
      const v = dd[p];
      if (nTop < 4) { let i = nTop; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; nTop += 1; }
      else if (v > dd[ord[nTop - 1]]) { let i = nTop - 1; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; }
    }
    let best = 0;
    for (let ti = 0; ti < nTop; ti += 1) {
      const p = ord[ti];
      const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dv = proj.project(x, y, z).dist; calls += 1;
      if (dv > best) best = dv;
    }
    r3[t] = best;
  }
  let mx = 0; let overHi = 0;
  for (let t = 0; t < nTri; t += 1) { if (r3[t] > mx) mx = r3[t]; if (r3[t] > 0.01) overHi += 1; }
  log(`  R3: MAX ${mx.toExponential(4)} mm, facets >0.01 mm ${overHi} (${((overHi / nTri) * 100).toFixed(4)}%), ${calls} projector calls in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  writeFileSync(`${OUTDIR}/S116_SCALAR_${TAG}_R3UM.f64`, Buffer.from(r3.map((v) => v * 1000).buffer));
  log(`  wrote ${OUTDIR}/S116_SCALAR_${TAG}_NORMDEG.f64 and _R3UM.f64 (um)`);
}
