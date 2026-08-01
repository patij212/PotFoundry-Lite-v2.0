// s23Residual2.ts — S23B: the two measurements that decide the OWNER of the scale-invariant residual.
// READ-ONLY. (a) does the extracted DENSITY FIELD price this demand at all? (b) what does `_S22B` — the
// bisection oracle that produced the field — actually carry at the same site?
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { loadReconField } from '../bridge/_strataReconField';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const TWO_PI = 2 * Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
const dTh = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };
const THC = 4.450284; const ZC = 80.76379;

// ── (a) WHAT THE FIELD ASKS FOR AT THE SITE ────────────────────────────────────────────────────────
const raw = loadReconField(`${EX}S22B.density.json`, { floorMm: 0, alpha: Infinity });
const prep = loadReconField(`${EX}S22B.density.json`, { floorMm: 0.0364, alpha: 1.0 });
log('=== S23B RESIDUAL — THE OWNER TEST ===');
log(`  site: th ${THC.toFixed(6)}  z ${ZC.toFixed(5)}   (inside declared region D49, 0.316 mm from its centre)`);
log('');
log('--- (a) DOES THE EXTRACTED FIELD PRICE THIS DEMAND? ---');
log(`  raw field      h = ${(raw.hAt(THC, ZC) * 1000).toFixed(1)} um`);
log(`  prepared field h = ${(prep.hAt(THC, ZC) * 1000).toFixed(1)} um   (floor 36.4, alpha 1.0)`);
// the size an equilateral element would need for a chord sagitta under PF_CB_TOL = 10 um, measured
// straight off the surface at the site — the driver's own acceptance quantity, not a model.
const sag = (L: number): number => {
  let worst = 0;
  for (const [ca, sa] of [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]] as Array<[number, number]>) {
    const dth = (ca * L) / rRef; const dz = sa * L;
    const P = (t: number, z: number): [number, number, number] => {
      const c = canon(t); const r = rA(c, z); return [r * Math.cos(c), r * Math.sin(c), z];
    };
    const p0 = P(THC - dth / 2, ZC - dz / 2); const pA = P(THC, ZC); const pB = P(THC + dth / 2, ZC + dz / 2);
    const s = 0.5 * Math.hypot(pB[0] - 2 * pA[0] + p0[0], pB[1] - 2 * pA[1] + p0[1], pB[2] - 2 * pA[2] + p0[2]);
    if (s > worst) worst = s;
  }
  return worst;
};
let lo = 2e-4; let hi = 4;
for (let i = 0; i < 40; i += 1) { const m = Math.sqrt(lo * hi); if (sag(m) <= 0.01) lo = m; else hi = m; }
log(`  the surface's OWN demand here, at the driver's tolerance PF_CB_TOL = 10 um:  h = ${(lo * 1000).toFixed(1)} um`);
log(`    (largest chord whose two-sided sagitta stays under 10 um, four directions, measured not modelled)`);
log(`  => the field prices this site at ${(prep.hAt(THC, ZC) * 1000).toFixed(1)} um against a true demand of`
  + ` ${(lo * 1000).toFixed(1)} um   —  RATIO ${(prep.hAt(THC, ZC) / lo).toFixed(2)}x`);

// ── (b) WHAT `_S22B` CARRIES AT THE SAME SITE ──────────────────────────────────────────────────────
const buf = readFileSync(`${EX}S22B.stl`);
const n = buf.readUInt32LE(80);
let o = 84; let near = 0; let sumLong = 0; let minLong = Infinity; let maxLong = 0; let sumArea = 0;
const RADIUS = 0.5;    // mm, chart
for (let t = 0; t < n; t += 1) {
  o += 12;
  const c: number[] = [];
  for (let k = 0; k < 9; k += 1) { c.push(buf.readFloatLE(o)); o += 4; }
  o += 2;
  const cx = (c[0] + c[3] + c[6]) / 3; const cy = (c[1] + c[4] + c[7]) / 3; const cz = (c[2] + c[5] + c[8]) / 3;
  const th = canon(Math.atan2(cy, cx));
  if (Math.abs(dTh(th, THC)) * rRef > RADIUS || Math.abs(cz - ZC) > RADIUS) continue;
  const e = [
    Math.hypot(c[3] - c[0], c[4] - c[1], c[5] - c[2]),
    Math.hypot(c[6] - c[3], c[7] - c[4], c[8] - c[5]),
    Math.hypot(c[0] - c[6], c[1] - c[7], c[2] - c[8]),
  ];
  const L = Math.max(...e);
  const nx = (c[4] - c[1]) * (c[8] - c[2]) - (c[5] - c[2]) * (c[7] - c[1]);
  const ny = (c[5] - c[2]) * (c[6] - c[0]) - (c[3] - c[0]) * (c[8] - c[2]);
  const nz = (c[3] - c[0]) * (c[7] - c[1]) - (c[4] - c[1]) * (c[6] - c[0]);
  near += 1; sumLong += L; sumArea += Math.hypot(nx, ny, nz) / 2;
  if (L < minLong) minLong = L;
  if (L > maxLong) maxLong = L;
}
log('');
log(`--- (b) WHAT _S22B — THE ORACLE THAT PRODUCED THE FIELD — CARRIES WITHIN ${RADIUS} mm OF THE SITE ---`);
log(`  ${near} facets   longest edge um: min ${(minLong * 1000).toFixed(1)}  mean ${((sumLong / Math.max(1, near)) * 1000).toFixed(1)}  max ${(maxLong * 1000).toFixed(1)}`);
log(`  total area ${sumArea.toFixed(6)} mm^2   => hA-equivalent`
  + ` ${(Math.sqrt((2 * sumArea) / (Math.sqrt(3) * (near / 2))) * 1000).toFixed(1)} um`);
log('');
log('=== DONE ===');
