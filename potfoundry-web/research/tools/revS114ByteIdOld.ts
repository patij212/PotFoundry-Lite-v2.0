// s114OrientByteId.ts — THE BYTE-IDENTITY CONTROL FOR `orientOfFacet`.
//
// WHY. S114 edits `research/bridge/orientRuler.ts` to fix two defects in `locateTurn` /
// `locateTurnAdaptive`. `orientOfFacet` LIVES IN THE SAME FILE and is the instrument every S112/S113
// number rests on (normDeg at inset 0 and 0.05, spreadRad, the drop ratio that DEFINES the straddling
// class). A claim that "I only touched the locator" is worth nothing without a measurement, so this tool
// takes a fixed sample of the Gothic mesh, runs `orientOfFacet` over a SWEEP of the options that are
// themselves measurement choices (inset, k, sampler, orient), and writes:
//
//   * a RAW Float64 binary of every returned field, in a fixed order  -> sha256 must be IDENTICAL
//   * a text dump at 17 significant digits                            -> so a diff can be READ, not just
//                                                                        declared
//
// If the hash moves, the campaign's primary instrument moved and the diff is right there.
//
// Usage: PF_S114_STL=<abs path> bash research/tools/run-s114-orientbyteid.sh
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals, fdNormalsCentral, type NormalSampler } from '../bridge/_revS114OldOrientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S114_STYLE ?? 'GothicArches';
const STL = process.env.PF_S114_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S114_TAG ?? 'OLDREF';
const STRIDE = Math.round(envF('PF_S114_STRIDE', 997));
const DIMS: StyleDims = { H: envF('PF_S114_H', 120), Rb: envF('PF_S114_RB', 40), Rt: envF('PF_S114_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/byteid';

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

mkdirSync(OUTDIR, { recursive: true });
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('===== S114 — orientOfFacet BYTE-IDENTITY CONTROL =====');
log(`style ${STYLE}  tag ${TAG}  stride ${STRIDE}`);
log(`stl ${STL}`);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112 read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
log(`mesh ${nTri} facets`);

const scratch = new Float64Array(12);
const samplers: Array<[string, NormalSampler]> = [
  ['kink', fdNormals(rA, H, 2e-4, 2e-4)],
  ['cent', fdNormalsCentral(rA, H, 2e-4, 2e-4)],
];
// EVERY ONE OF THESE IS A MEASUREMENT CHOICE, so the control sweeps them rather than assuming the
// default is the only shape the function is used in.
const INSETS = [0, 0.01, 0.05, 0.1];
const KS = [4, 8, 16];
const ORIENTS: Array<'winding' | 'outward'> = ['winding', 'outward'];

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};

const FIELDS = ['normRad', 'normDeg', 'tangMm', 'legacyTangMm', 'cov', 'bound', 'signMargin',
  'argTh', 'argZ', 'diam', 'samples', 'kinkRad', 'spreadRad', 'meanRad', 'overFrac'] as const;

const vals: number[] = [];
const lines: string[] = [];
let nCells = 0;
for (let f = 0; f < nTri; f += STRIDE) {
  const [ath, bth, cth] = th3(f);
  for (const [sname, ns] of samplers) {
    for (const k of KS) {
      for (const inset of INSETS) {
        for (const orient of ORIENTS) {
          const o = orientOfFacet(ns,
            xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
            xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
            { k, inset, orient, kappa: 0.37, scratch });
          const rec = o as unknown as Record<string, number>;
          const parts: string[] = [];
          for (const fld of FIELDS) { vals.push(rec[fld]); parts.push(`${fld}=${rec[fld].toPrecision(17)}`); }
          lines.push(`f=${f} s=${sname} k=${k} inset=${inset} or=${orient} ${parts.join(' ')}`);
          nCells += 1;
        }
      }
    }
  }
}

const buf = Buffer.from(new Float64Array(vals).buffer);
const sha = createHash('sha256').update(buf).digest('hex');
const txt = `${lines.join('\n')}\n`;
const shaTxt = createHash('sha256').update(txt).digest('hex');
writeFileSync(`${OUTDIR}/S114_ORIENT_${TAG}.bin`, buf);
writeFileSync(`${OUTDIR}/S114_ORIENT_${TAG}.txt`, txt);

log('');
log(`facets sampled ${Math.ceil(nTri / STRIDE)}   configs/facet ${samplers.length * KS.length * INSETS.length * ORIENTS.length}   cells ${nCells}   floats ${vals.length}`);
log(`RAW Float64 sha256  ${sha}`);
log(`TEXT (17 sig fig) sha256  ${shaTxt}`);
// a NON-VACUITY floor: if the control were degenerate (all NaN, all zero) the hash would still be
// "identical" across a change. Print the spread so the control can be seen to be LIVE.
let nFin = 0; let vMin = Infinity; let vMax = -Infinity;
for (const v of vals) { if (Number.isFinite(v)) { nFin += 1; if (v < vMin) vMin = v; if (v > vMax) vMax = v; } }
log(`non-vacuity: finite ${nFin}/${vals.length}   min ${vMin.toExponential(6)}   max ${vMax.toExponential(6)}`);
const nds = vals.filter((_v, i) => i % FIELDS.length === 1);
const sorted = nds.slice().filter(Number.isFinite).sort((a, b) => a - b);
log(`normDeg over all cells: p10 ${sorted[Math.floor(sorted.length * 0.1)].toFixed(6)}  p50 ${sorted[Math.floor(sorted.length * 0.5)].toFixed(6)}  p90 ${sorted[Math.floor(sorted.length * 0.9)].toFixed(6)}  MAX ${sorted[sorted.length - 1].toFixed(6)} deg`);
log(`wrote ${OUTDIR}/S114_ORIENT_${TAG}.bin  and  .txt`);
