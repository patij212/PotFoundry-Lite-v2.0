// _verify_s121_likeforlike.ts — VERIFIER-OWNED. Scores the WALL under the SAME step-aware ruler the
// S121 report used for the treads (min(perp-to-wall, dist-to-annulus)), to test whether the report's
// wall-vs-tread ratios are like-for-like. Nothing here is a driver change; it only reads the STL.
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { readMeshF32 } from './s118MeshIo';
import { latticePts } from './s118ScoreLib';
import { radialResid } from './s120EdgeLib';
import type { StyleId, StyleDims } from '../bridge/runStyle';

const log = console.log;
const STL = process.env.PF_V_STL as string;
const STYLE = process.env.PF_V_STYLE ?? 'CelticTriquetra';
const NWALL = Number(process.env.PF_V_NWALL ?? 1278000);
const ZWIN = Number(process.env.PF_V_ZWIN ?? 2.0);   // mm; how close to a step a wall facet must be
const DELTA = 1e-6;
const BAR_HI = 0.01;
const H = 120;
const DIMS: StyleDims = { H, Rb: 40, Rt: 50, expn: 1 };

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const rAraw = (th: number, z: number): number => rAb(canonTheta(th), z);

const M = readMeshF32(STL);
const xyz = M.xyz; const nTri = M.nTri;
log(`mesh ${STL}  facets ${nTri}  nWall ${NWALL}  zwin ${ZWIN} mm`);

// driver's own step detector, same transcription
const zSteps: number[] = [];
{
  const nZ = 12000; const d1 = H / nZ; const d2 = d1 / 8;
  const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
  let run = -1; let bestJ2 = 0; let bestZ = 0;
  const flush = (): void => { if (run >= 0) { zSteps.push(bestZ); run = -1; bestJ2 = 0; } };
  for (let j = 1; j < nZ; j += 1) {
    const z = H * (j / nZ);
    let j1 = 0; let j2 = 0;
    for (const th of probes) {
      j1 = Math.max(j1, Math.abs(rA(th, z + d1) - rA(th, z - d1)));
      j2 = Math.max(j2, Math.abs(rA(th, z + d2) - rA(th, z - d2)));
    }
    if (j2 > 0.8 * j1 && j1 > 0.01) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
  }
  flush();
}
log(`zSteps ${zSteps.map((z) => z.toFixed(4)).join(', ')}`);

const annulus = (x: number, y: number, z: number): number => {
  let best = Infinity;
  const th = Math.atan2(y, x); const r = Math.hypot(x, y);
  for (const zs of zSteps) {
    const rm = rAraw(th, zs - DELTA); const rp = rAraw(th, zs + DELTA);
    const rlo = Math.min(rm, rp); const rhi = Math.max(rm, rp);
    const gap = r < rlo ? rlo - r : r > rhi ? r - rhi : 0;
    const d = Math.hypot(z - zs, gap);
    if (d < best) best = d;
  }
  return best;
};
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1536, nZ: 768, seedTopK: 6 });

const area3 = (o: number): number => {
  const ux = xyz[o + 3] - xyz[o], uy = xyz[o + 4] - xyz[o + 1], uz = xyz[o + 5] - xyz[o + 2];
  const wx = xyz[o + 6] - xyz[o], wy = xyz[o + 7] - xyz[o + 1], wz = xyz[o + 8] - xyz[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};

// ── PART 1: can the annulus reference possibly move the WALL's perpendicular MAX (8.509e-1)? ─────────
// radial R1 >= perpendicular pointwise. Any wall facet whose radial R1 at k=8 is below the published
// wall MAX cannot BE the argmax. So enumerate the facets that could be, and report their z.
{
  const LAT = latticePts(8); const NP = LAT.length / 3;
  const WALLMAX = 0.8509;
  let cand = 0; let candNearStep = 0; let bestR1 = 0; let bestZ = 0; let bestDzOfMax = Infinity;
  for (let f = 0; f < NWALL; f += 1) {
    const o = f * 9;
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const dd = radialResid(rA, w0 * xyz[o] + w1 * xyz[o + 3] + w2 * xyz[o + 6],
        w0 * xyz[o + 1] + w1 * xyz[o + 4] + w2 * xyz[o + 7],
        w0 * xyz[o + 2] + w1 * xyz[o + 5] + w2 * xyz[o + 8]);
      if (dd > w) w = dd;
    }
    const zc = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
    let dz = Infinity; for (const zs of zSteps) dz = Math.min(dz, Math.abs(zc - zs));
    if (w > bestR1) { bestR1 = w; bestZ = zc; bestDzOfMax = dz; }
    if (w >= WALLMAX) { cand += 1; if (dz <= ZWIN) candNearStep += 1; }
  }
  log('');
  log(`── PART 1: wall facets whose RADIAL R1(k=8) >= the published wall PERP MAX ${WALLMAX} mm`);
  log(`   candidates that could be the perpendicular argmax: ${cand.toLocaleString()}`);
  log(`   of those, within ${ZWIN} mm of a z-step (i.e. reachable by the annulus): ${candNearStep.toLocaleString()}`);
  log(`   wall worst radial R1 ${bestR1.toFixed(6)} mm at z=${bestZ.toFixed(4)} (dz to nearest step ${bestDzOfMax.toFixed(4)} mm)`);
  log(`   => if candNearStep is 0, the annulus CANNOT lower the wall MAX: it is unchanged at ${WALLMAX} mm`);
}

// ── PART 2: rescore the near-step wall facets under BOTH rulers ──────────────────────────────────────
{
  const LAT = latticePts(8); const NP = LAT.length / 3;
  let nNear = 0, areaNear = 0;
  let cWall = 0, aWall = 0, mWall = 0;
  let cStep = 0, aStep = 0, mStep = 0;
  let calls = 0;
  for (let f = 0; f < NWALL; f += 1) {
    const o = f * 9;
    const z0 = Math.min(xyz[o + 2], xyz[o + 5], xyz[o + 8]);
    const z1 = Math.max(xyz[o + 2], xyz[o + 5], xyz[o + 8]);
    let dz = Infinity;
    for (const zs of zSteps) dz = Math.min(dz, z0 > zs ? z0 - zs : z1 < zs ? zs - z1 : 0);
    if (dz > ZWIN) continue;
    nNear += 1; const A = area3(o); areaNear += A;
    let wW = 0, wS = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const X = w0 * xyz[o] + w1 * xyz[o + 3] + w2 * xyz[o + 6];
      const Y = w0 * xyz[o + 1] + w1 * xyz[o + 4] + w2 * xyz[o + 7];
      const Z = w0 * xyz[o + 2] + w1 * xyz[o + 5] + w2 * xyz[o + 8];
      const d = proj.project(X, Y, Z).dist; calls += 1;
      if (d > wW) wW = d;
      const ds = Math.min(d, annulus(X, Y, Z));
      if (ds > wS) wS = ds;
    }
    if (wW > BAR_HI) { cWall += 1; aWall += A; }
    if (wW > mWall) mWall = wW;
    if (wS > BAR_HI) { cStep += 1; aStep += A; }
    if (wS > mStep) mStep = wS;
  }
  log('');
  log(`── PART 2: WALL facets within ${ZWIN} mm of a z-step, scored under BOTH rulers, k=8, EXHAUSTIVE`);
  log(`   near-step wall facets ${nNear.toLocaleString()} (${(100 * nNear / NWALL).toFixed(4)}% of wall)   area ${areaNear.toFixed(4)} mm2   projector calls ${calls.toLocaleString()}`);
  log(`   vs ANALYTIC WALL      : >0.01mm ${cWall.toLocaleString()} facets, ${aWall.toFixed(4)} mm2, MAX ${mWall.toExponential(3)} mm`);
  log(`   vs TRUE STEPPED SOLID : >0.01mm ${cStep.toLocaleString()} facets, ${aStep.toFixed(4)} mm2, MAX ${mStep.toExponential(3)} mm`);
  log(`   facets the annulus RESCUES: ${(cWall - cStep).toLocaleString()}   area rescued ${(aWall - aStep).toFixed(4)} mm2`);
  log('');
  log(`   *** CORRECTED, LIKE-FOR-LIKE wall row (published 43,926 / 206.981 mm2 / 8.509e-1 mm vs analytic wall):`);
  log(`       wall vs TRUE STEPPED SOLID = ${(43926 - (cWall - cStep)).toLocaleString()} facets (${(100 * (43926 - (cWall - cStep)) / NWALL).toFixed(4)}% of wall)   ${(206.981 - (aWall - aStep)).toFixed(3)} mm2 = ${(100 * (206.981 - (aWall - aStep)) / 48483.771).toFixed(4)}% of wall area`);
}
log('DONE');
