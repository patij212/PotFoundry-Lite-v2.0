// revCtlScanExtent.ts — REVIEW CONTROL. How much of the mesh does S112's NEGATIVE CONTROL actually see?
// s112AngularDecomp.ts:329-330 scans the edge list with a fixed stride and stops at SUB hits. The edge list
// is in Map-insertion order = facet order = STL order, which is spatially structured. Measure the extent.
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STL = process.env.PF_REV_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const SUB = 400;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>).GothicArches;
const pars: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') pars[snakeToCamel(k)] = v.default;
const rAbase = buildRadiusFn('GothicArches' as StyleId, pars, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > 120 ? 120 : z);
void envF; void rA;

const M = readMeshFloat64(STL, false);
const d = facetDihedrals(M.xyz, new Uint32Array(M.nTri * 3).map((_, i) => i));
const nE = d.edgeAngRad.length;
const loThr = (2 * Math.PI) / 180;
const stride = Math.max(1, Math.floor(nE / (SUB * 8)));
let lastE = -1; let n = 0; let scanned = 0;
for (let e = 0; e < nE && n < SUB; e += stride) { scanned += 1; if (d.edgeAngRad[e] < loThr) { n += 1; lastE = e; } }
// z-extent of the facets the control actually saw vs the whole mesh
let zMin = Infinity; let zMax = -Infinity; let n2 = 0;
for (let e = 0; e < nE && n2 < SUB; e += stride) {
  if (d.edgeAngRad[e] >= loThr) continue;
  n2 += 1;
  for (const f of [d.edgeF1[e], d.edgeF2[e]]) for (let k = 0; k < 3; k += 1) {
    const z = M.xyz[f * 9 + k * 3 + 2]; if (z < zMin) zMin = z; if (z > zMax) zMax = z;
  }
}
let mZmin = Infinity; let mZmax = -Infinity;
for (let f = 0; f < M.nTri; f += 1) for (let k = 0; k < 3; k += 1) {
  const z = M.xyz[f * 9 + k * 3 + 2]; if (z < mZmin) mZmin = z; if (z > mZmax) mZmax = z;
}
log('===== REV — S112 NEGATIVE-CONTROL SCAN EXTENT =====');
log(`interior edges ${nE}   stride ${stride}   collected ${n} of ${SUB}   strided probes used ${scanned}`);
log(`last edge index reached ${lastE} = ${((100 * lastE) / nE).toFixed(2)}% of the edge list`);
log(`z-range of the facets the control SAW:  ${zMin.toFixed(2)} .. ${zMax.toFixed(2)} mm`);
log(`z-range of the WHOLE MESH:              ${mZmin.toFixed(2)} .. ${mZmax.toFixed(2)} mm`);
log(`=> the control covers ${((100 * (zMax - zMin)) / (mZmax - mZmin)).toFixed(2)}% of the mesh's z-span`);
