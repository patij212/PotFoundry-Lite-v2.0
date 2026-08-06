// s113eJumpControl.ts — TWO-SIDED VALIDATION OF THE LEG-1 JUMP PROBE, plus a second independent detector.
//
// A1 in `s113cScopeAudit.ts` is load-bearing: it fired and withdrew S112's curtain leg on the strength of a
// two-scale halving ratio reading p50 0.505 on the curtain class. A probe that CANNOT fire would read
// exactly the same thing, so A1 is worthless until the probe is shown to fire on a real jump and not fire
// on a real crease. That is this file. It is the "assert a FLOOR as well as a ceiling" rule applied to the
// instrument rather than to the result.
//
//  C1 SYNTHETIC POSITIVE CONTROL — an rA with a known C0 JUMP of 0.500 mm across the footprint.
//     REQUIRED: halving ratio >= 0.90 and the measured delta within 1% of 0.500 mm. If it fails, A1 IS VOID.
//  C2 SYNTHETIC CREASE CONTROL — an rA that is C0-continuous with a hard C1 crease (a |.| kink) of the same
//     amplitude. REQUIRED: halving ratio <= 0.60. A probe that calls a crease a jump would have voided the
//     curtain leg for the wrong reason.
//  C3 SYNTHETIC SMOOTH CONTROL — REQUIRED: halving ratio <= 0.60.
//  C4 SECOND, INDEPENDENT DETECTOR ON THE REAL MESH — `locateKinkRaw`'s own `jump` flag (two-scale test at
//     `jumpRatio` 0.62, the driver's calibrated value) on the three parameter edges of every curtain facet.
//     Two detectors that disagree would mean one of them is wrong; two that agree is corroboration.
//
// Usage: bash research/tools/run-s113e-jump.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S113E_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113E_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const HI_DEG = envF('PF_S113E_HI_DEG', 45);
const CURTAIN_RATIO = envF('PF_S113E_CURTAIN', 8);
const DIMS: StyleDims = { H: envF('PF_S113E_H', 120), Rb: envF('PF_S113E_RB', 40), Rt: envF('PF_S113E_RT', 50), expn: 1 };
const H = DIMS.H;

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
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: envF('PF_CB_KINK_RATIO', 0.15), jumpRatio: envF('PF_CB_JUMP_RATIO', 0.62), snap: true, confMm: 0.0006,
};

/** THE PROBE UNDER TEST — byte-for-byte the body used by A1, parameterised on rA so a fixture can drive it. */
function adjMaxDelta(
  R: (th: number, z: number) => number,
  ath: number, az: number, bth: number, bz: number, cth: number, cz: number, k: number,
): number {
  const off = new Int32Array(k + 2);
  for (let i = 0; i <= k; i += 1) off[i + 1] = off[i] + (k - i + 1);
  const vals = new Float64Array(off[k + 1]);
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      vals[off[i] + j] = R(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz);
    }
  }
  let best = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const v = vals[off[i] + j];
      if (i + j + 1 <= k) {
        const q1 = Math.abs(vals[off[i] + j + 1] - v); if (q1 > best) best = q1;
        const q3 = Math.abs(vals[off[i + 1] + j] - vals[off[i] + j + 1]); if (q3 > best) best = q3;
      }
      if (i + 1 + j <= k) { const q2 = Math.abs(vals[off[i + 1] + j] - v); if (q2 > best) best = q2; }
    }
  }
  return best;
}

log('===== S113e — TWO-SIDED VALIDATION OF THE LEG-1 JUMP PROBE =====');
log('');
log('── SYNTHETIC FIXTURES. Footprint: a triangle in (theta,z) spanning theta* = 0.30 rad, amplitude 0.500 mm ──');
{
  const A = 0.5; const th0 = 0.30;
  const jumpR = (th: number): number => 40 + (th >= th0 ? A : 0);
  const creaseR = (th: number): number => 40 + A * (1 - Math.abs(th - th0) / 0.02) * (Math.abs(th - th0) < 0.02 ? 1 : 0);
  const smoothR = (th: number): number => 40 + A * Math.sin((th - th0) * 50);
  // a footprint straddling th0 with real 2-D extent
  const P: [number, number, number, number, number, number] = [th0 - 0.010, 90, th0 + 0.012, 90.03, th0 + 0.001, 90.06];
  const run = (name: string, R: (th: number) => number, gate: (r: number) => boolean, want: string): void => {
    const f = (th: number): number => R(th);
    const d6 = adjMaxDelta((th) => f(th), P[0], P[1], P[2], P[3], P[4], P[5], 6);
    const d12 = adjMaxDelta((th) => f(th), P[0], P[1], P[2], P[3], P[4], P[5], 12);
    const rr = d6 > 1e-15 ? d12 / d6 : 0;
    log(`  ${name.padEnd(26)} D(6) ${(d6 * 1000).toFixed(2).padStart(8)} um   D(12) ${(d12 * 1000).toFixed(2).padStart(8)} um   ratio ${rr.toFixed(4)}   ${gate(rr) ? '[PASS]' : '*** FAIL ***'}  (${want})`);
  };
  run('C1 JUMP 0.500 mm', jumpR, (r) => r >= 0.90, 'require ratio >= 0.90');
  run('C2 CREASE (C0, |.| kink)', creaseR, (r) => r <= 0.60, 'require ratio <= 0.60');
  run('C3 SMOOTH (sin)', smoothR, (r) => r <= 0.60, 'require ratio <= 0.60');
  const d12j = adjMaxDelta((th) => jumpR(th), P[0], P[1], P[2], P[3], P[4], P[5], 12);
  log(`  C1 magnitude recovery: D(12) = ${(d12j * 1000).toFixed(3)} um vs the true 500.000 um jump  => ${((d12j / A) * 100).toFixed(2)}%  ${Math.abs(d12j - A) / A <= 0.01 ? '[PASS]' : '*** FAIL ***'} (require within 1%)`);
}
log('');

// ── C4: the driver's OWN jump flag on the real curtain class ──
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
const hiThr = (HI_DEG * Math.PI) / 180;
const curtainF = new Set<number>(); const wallF = new Set<number>();
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const cur = graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO;
  if (cur) { curtainF.add(f1); curtainF.add(f2); } else { wallF.add(f1); wallF.add(f2); }
}
const jumpFlag = (f: number): boolean => {
  const [ath, bth, cth] = th3(f);
  const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]]; const ths = [ath, bth, cth];
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const kk = locateKinkRaw(rA, ths[i], zs[i], ths[j], zs[j], PRED);
    if (kk !== null && kk.jump) return true;
  }
  return false;
};
const areaOf = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
log(`── C4 SECOND DETECTOR: locateKinkRaw's own \`jump\` flag (driver jumpRatio ${PRED.jumpRatio}) on the parameter edges ──`);
for (const [nm, S] of [['CURTAIN', curtainF], ['WALL', wallF]] as Array<[string, Set<number>]>) {
  const fs = [...S]; const j = fs.filter(jumpFlag);
  log(`  ${nm.padEnd(8)} n=${String(fs.length).padStart(6)}  with a JUMP-class locus on any parameter edge: ${String(j.length).padStart(5)} = ${((j.length / Math.max(1, fs.length)) * 100).toFixed(2)}% by count, ${((areaOf(j) / Math.max(1e-12, areaOf(fs))) * 100).toFixed(2)}% by area (${((areaOf(j) / meshArea) * 100).toFixed(4)}% of mesh)`);
}
log('  (S112 excluded the CURTAIN class because "the surface is not a graph of rA there". Both detectors');
log('   are being asked the same question by different arithmetic.)');
