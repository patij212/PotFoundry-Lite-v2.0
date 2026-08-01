// s23TrueCost.ts — S23B: WHAT HONOURING THE TRUE DEMAND WOULD COST. READ-ONLY, artifact-only.
//
// The coordinator's ask, verbatim: "if honouring the true field breaches the 2.0M ceiling, that is an
// operator decision about the ceiling, not a reason to clamp — say the number."
//
// The registered D6 integral is `N_tri = SUM_cells dA / ((sqrt3/4) h^2)`. Stage 0 evaluated it with `h` =
// the EXTRACTED hA on the 0.25 mm grid and got 1,761,257. This file evaluates the SAME integral with `h` =
// THE SURFACE'S OWN DEMAND at the driver's own tolerance (`PF_CB_TOL` = 10 um, the same one-sided-sagitta
// solve `solveHDir` uses), which is the quantity the shipped grid was measured to under-price at 174 of
// 194 refuting sites by a median 3.45x.
// It is evaluated on a STRIDED sub-lattice of the same reporting grid and scaled by the stride, because a
// full 542,880-cell evaluation is ~200M rA evals; the stride is declared and the area it integrates is
// reported beside the answer so the scaling is checkable rather than asserted.
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { loadReconField, impliedTris } from '../bridge/_strataReconField';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const H = 120; const TWO_PI = 2 * Math.PI; const rRef = 45; const SQRT3 = Math.sqrt(3);
// eslint-disable-next-line no-console
const log = console.log;
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const STRIDE = Math.round(Number(process.argv[2] ?? 4));
const TOL = 0.01;
const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };

const f = loadReconField(`${EX}S22B.density.json`, { floorMm: 0.0364, alpha: 1.0 });
const gridN = impliedTris(f, rA, 'prepared');
const rawN = impliedTris(f, rA, 'raw');

function demand(th: number, z: number): number {
  const P = (t: number, zz: number): [number, number, number] => {
    const c = canon(t); const r = rA(c, zz); return [r * Math.cos(c), r * Math.sin(c), zz];
  };
  const sag = (L: number): number => {
    let w = 0;
    for (const [ca, sa] of [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]] as Array<[number, number]>) {
      const dth = (ca * L) / rRef; const dz = sa * L;
      const p0 = P(th - dth / 2, Math.max(0, Math.min(H, z - dz / 2)));
      const pA = P(th, z);
      const pB = P(th + dth / 2, Math.max(0, Math.min(H, z + dz / 2)));
      const s = 0.5 * Math.hypot(pB[0] - 2 * pA[0] + p0[0], pB[1] - 2 * pA[1] + p0[1], pB[2] - 2 * pA[2] + p0[2]);
      if (s > w) w = s;
    }
    return w;
  };
  let lo = 2e-4; let hi = 4;
  for (let i = 0; i < 26; i += 1) { const m = Math.sqrt(lo * hi); if (sag(m) <= TOL) lo = m; else hi = m; }
  return lo;
}

const hFD = 1e-6; const dTh0 = f.dxMm / rRef; const dZ = f.dyMm;
let n = 0; let area = 0; let cells = 0;
let floored = 0;
const hs: number[] = [];
for (let r = 0; r < f.rows; r += STRIDE) {
  const z = (r + 0.5) * dZ;
  for (let c = 0; c < f.cols; c += STRIDE) {
    const th = ((c + 0.5) * f.dxMm) / rRef;
    let h = demand(th, z);
    if (h < f.floorMm) { h = f.floorMm; floored += 1; }      // the constructor's own architectural floor
    hs.push(h * 1000);
    const r0 = rA(th, z);
    const rt = (rA(th + hFD, z) - rA(th - hFD, z)) / (2 * hFD);
    const rz = (rA(th, Math.min(H, z + hFD)) - rA(th, Math.max(0, z - hFD))) / (2 * hFD);
    const dA = Math.sqrt(r0 * r0 * (1 + rz * rz) + rt * rt) * dTh0 * dZ * STRIDE * STRIDE;
    area += dA; n += dA / ((SQRT3 / 4) * h * h); cells += 1;
  }
}
const q = (a: number[], p: number): number => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
log('=== S23B — WHAT HONOURING THE TRUE DEMAND WOULD COST ===');
log(`  stride ${STRIDE} over the 0.25 mm reporting grid: ${cells} cells evaluated, integrating ${area.toFixed(2)} mm^2`);
log(`    (the full-grid analytic area is 38439.05 mm^2 — the stride recovers ${((100 * area) / 38439.05).toFixed(2)}% of it)`);
log('');
log(`  TRUE DEMAND h um (PF_CB_TOL 10 um, floored at 36.4):  p01 ${q(hs, 0.01).toFixed(1)}  p10 ${q(hs, 0.10).toFixed(1)}`
  + `  p50 ${q(hs, 0.50).toFixed(1)}  p90 ${q(hs, 0.90).toFixed(1)}  p99 ${q(hs, 0.99).toFixed(1)}   floored ${floored} cells`);
log(`  EXTRACTED grid field h um (prepared):                 p01 ${f.stats.p01}  p10 ${f.stats.p10}`
  + `  p50 ${f.stats.p50}  p90 ${f.stats.p90}  p99 ${f.stats.p99}`);
log('');
log('  | field the constructor is priced by | N_tri | x _S22B (1,251,546) | % of the 2.0 M ceiling |');
log('  |---|---|---|---|');
log(`  | RAW extracted grid (Stage 0) | ${Math.round(rawN.nTri)} | x${(rawN.nTri / 1251546).toFixed(4)} | ${((100 * rawN.nTri) / 2e6).toFixed(1)}% |`);
log(`  | PREPARED grid (floor 36.4, alpha 1.0) | ${Math.round(gridN.nTri)} | x${(gridN.nTri / 1251546).toFixed(4)} | ${((100 * gridN.nTri) / 2e6).toFixed(1)}% |`);
log(`  | **THE SURFACE'S OWN DEMAND at 10 um** | **${Math.round(n)}** | **x${(n / 1251546).toFixed(4)}** | **${((100 * n) / 2e6).toFixed(1)}%** |`);
log(`  | what S23B ACTUALLY BUILT | 763965 | x0.6104 | 38.2% |`);
log('');
log(`  => the true demand is x${(n / gridN.nTri).toFixed(2)} the prepared grid's price and x${(n / 763965).toFixed(2)} what was built.`);
log(`  => it ${n > 2e6 ? 'BREACHES' : 'does NOT breach'} the registered 2.0 M live-triangle ceiling`
  + `${n > 2e6 ? ` by x${(n / 2e6).toFixed(2)} — an OPERATOR DECISION ABOUT THE CEILING, not a reason to clamp.` : '.'}`);
log('');
log('=== DONE ===');
