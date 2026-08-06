// s114JumpDiag.ts — DIAGNOSE MY OWN T1 INSTRUMENT. The jump-step magnitudes came back NaN in S114's
// stage 1 while the jump COUNT was non-zero. A control that misbehaves voids the test it guards, so this
// finds out what `locateKinkRaw` actually returns on the facets S114 flagged, before any verdict rests
// on "T1 fired 0 times at the >=10 um gate".
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STL = process.env.PF_S114_STL as string;
const STYLE = process.env.PF_S114_STYLE ?? 'GothicArches';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.0006,
};
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
const hiThr = (45 * Math.PI) / 180;
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
};
let shown = 0;
let nJumpBigFinite = 0; let nJumpBigNaN = 0; let nJumpBigInf = 0;
const bigs: number[] = [];
for (let f = 0; f < nTri && shown < 12; f += 1) {
  if (!(d.perFacetMaxRad[f] > hiThr)) continue;
  const [a, b, c] = th3(f);
  const V: Array<[number, number]> = [[a, xyz[f * 9 + 2]], [b, xyz[f * 9 + 5]], [c, xyz[f * 9 + 8]]];
  for (let i = 0; i < 3; i += 1) {
    const p = V[i]; const qv = V[(i + 1) % 3];
    const k = locateKinkRaw(rA, p[0], p[1], qv[0], qv[1], PRED);
    if (k === null || !k.jump) continue;
    if (Number.isNaN(k.big)) nJumpBigNaN += 1;
    else if (!Number.isFinite(k.big)) nJumpBigInf += 1;
    else { nJumpBigFinite += 1; bigs.push(k.big * 1000); }
    if (shown < 12) {
      log(`f=${f} edge=${i}  t=${k.t}  big=${k.big}  big_um=${k.big * 1000}  ratio=${k.ratio}  jump=${k.jump}  typeof big=${typeof k.big}`);
      shown += 1;
    }
  }
}
log('');
log(`over the scan: jump rows with finite big ${nJumpBigFinite}, NaN big ${nJumpBigNaN}, Inf big ${nJumpBigInf}`);
if (bigs.length > 0) {
  const s = bigs.slice().sort((x, y) => x - y);
  log(`finite jump step um: p50 ${s[Math.floor(s.length / 2)]}  MAX ${s[s.length - 1]}`);
}
log(`envF probe (unused, keeps the import honest): ${envF('PF_S114_NOPE', 1)}`);
