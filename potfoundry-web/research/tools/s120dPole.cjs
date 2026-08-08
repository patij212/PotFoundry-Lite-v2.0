#!/usr/bin/env node
// s120dPole.cjs — S120 TASK D: the DEGENERACY-POLE / SCALE-FREE-THIN / 3-D-AR census of a shipped STL,
// with COUNT + AREA-share + MAX for every class. NEVER a bare count, never a bare max.
//
//   node research/tools/s120dPole.cjs <abs .stl> [tag]
//
// WHY A SEPARATE, DEPENDENCY-FREE SCRIPT (the same reason s120StlAr.cjs is one):
//   * research/tools/s118ThinCensus.ts already reports the POLE COUNT and the tau ladder, but it reports
//     NO AREA and NO MAX for the pole class — and this session's measurement discipline forbids a bare
//     count. So this transcribes `_s118EmitAdmit.unwrapTheta3` and `s118ScoreLib.facetGeom`
//     OPERAND-FOR-OPERAND and adds the two missing columns.
//   * `pole count` is then produced by TWO independent instruments over the same file, and the run
//     PRINTS BOTH so a divergence is visible instead of assumed away.
//   * Plain CJS, zero imports beyond `fs`: no esbuild invocation, so it is safe to run while a vitest
//     driver arm is live (the scar that has already killed arms with EPIPE after they did their work).
//
// EXHAUSTIVE. Every facet of the file, no stride, no cap on the scan. THE BOUND IS PRINTED: `facets`.
'use strict';
const fs = require('fs');

const stl = process.argv[2];
const TAG = process.argv[3] || 'RUN';
if (!stl) { console.log('usage: node s120dPole.cjs <abs .stl> [tag]'); process.exit(2); }

const TAUS = [0.005, 0.01, 0.02, 0.05, 0.1];
const POLE_GR = 100;
const NEEDLE_UM = 2;
const AR_CAP = 50;

// ── _s118EmitAdmit.unwrapTheta3, verbatim ──
const dTh = (a, b) => { let x = b - a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
// ── _shapeGuard.aspect3, verbatim (same transcription as s120StlAr.cjs) ──
const aspect3 = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  const L = Math.max(e0, e1, e2);
  return (L * (e0 + e1 + e2)) / (4 * area);
};

const buf = fs.readFileSync(stl);
const nTri = buf.readUInt32LE(80);

let area3 = 0;
let poleC = 0, poleA = 0, poleGrMax = 0, poleGrInf = 0;
let invC = 0, invA = 0;
let ndlC = 0, ndlA = 0;
let arOverC = 0, arOverA = 0, arMax = 0;
let minAlt = Infinity, minThin = Infinity;
const thinC = new Array(TAUS.length).fill(0);
const thinA = new Array(TAUS.length).fill(0);

for (let f = 0; f < nTri; f += 1) {
  const o = 84 + f * 50 + 12;
  const ax = buf.readFloatLE(o), ay = buf.readFloatLE(o + 4), az = buf.readFloatLE(o + 8);
  const bx = buf.readFloatLE(o + 12), by = buf.readFloatLE(o + 16), bz = buf.readFloatLE(o + 20);
  const cx = buf.readFloatLE(o + 24), cy = buf.readFloatLE(o + 28), cz = buf.readFloatLE(o + 32);
  // ── facetGeom, transcribed ──
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const area = 0.5 * Math.hypot(nx, ny, nz);
  const tha = Math.atan2(ay, ax);
  const thb = tha + dTh(tha, Math.atan2(by, bx));
  const thc = tha + dTh(tha, Math.atan2(cy, cx));
  const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const ua = tha * rm, ub = thb * rm, uc = thc * rm;
  const aps = 0.5 * ((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
  const apa = Math.abs(aps);
  const e1 = Math.hypot(ub - ua, bz - az);
  const e2 = Math.hypot(uc - ub, cz - bz);
  const e3 = Math.hypot(ua - uc, az - cz);
  const emax = Math.max(e1, e2, e3);
  const minAltUm = emax > 0 ? (2 * apa / emax) * 1000 : 0;
  const graphRatio = apa > 0 ? area / apa : Infinity;

  area3 += area;
  if (graphRatio >= POLE_GR) {
    poleC += 1; poleA += area;
    if (!Number.isFinite(graphRatio)) poleGrInf += 1; else if (graphRatio > poleGrMax) poleGrMax = graphRatio;
  }
  if (aps < 0) { invC += 1; invA += area; }
  if (minAltUm < NEEDLE_UM) { ndlC += 1; ndlA += area; }
  const thin = emax > 0 ? (minAltUm / 1000) / emax : 0;
  for (let i = 0; i < TAUS.length; i += 1) if (thin < TAUS[i]) { thinC[i] += 1; thinA[i] += area; }
  if (minAltUm < minAlt) minAlt = minAltUm;
  if (thin < minThin) minThin = thin;
  const ar = aspect3(ax, ay, az, bx, by, bz, cx, cy, cz);
  if (ar > AR_CAP) { arOverC += 1; arOverA += area; }
  if (Number.isFinite(ar) && ar > arMax) arMax = ar;
}

const pc = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(6) : 'n/a');
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log(`S120D POLE / THIN / AR CENSUS   tag ${TAG}`);
console.log(`  ${stl}`);
console.log(`  facets ${nTri.toLocaleString()}   3-D area ${area3.toFixed(3)} mm2   (EXHAUSTIVE: every facet, no stride, no cap)`);
console.log('────────────────────────────────────────────────────────────────────────────────────────');
console.log(`  DEGENERACY POLES (graphRatio >= ${POLE_GR}):  COUNT ${poleC.toLocaleString()} = ${pc(poleC, nTri)}%`
  + `   AREA ${poleA.toFixed(6)} mm2 = ${pc(poleA, area3)}%   MAX graphRatio ${poleGrInf > 0 ? `inf (x${poleGrInf})` : poleGrMax.toFixed(1)}`);
console.log(`  FOOTPRINT-SIGN INVERSIONS:                COUNT ${invC.toLocaleString()} = ${pc(invC, nTri)}%   AREA ${invA.toFixed(6)} mm2 = ${pc(invA, area3)}%`);
console.log(`  ABSOLUTE NEEDLES (arc minAlt < ${NEEDLE_UM} um):   COUNT ${ndlC.toLocaleString()} = ${pc(ndlC, nTri)}%   AREA ${ndlA.toFixed(6)} mm2 = ${pc(ndlA, area3)}%`);
console.log(`     [scale-DEPENDENT by construction — reported separately from the tau ladder, never merged]`);
console.log(`  3-D ASPECT over cap ${AR_CAP}:                 COUNT ${arOverC.toLocaleString()} = ${pc(arOverC, nTri)}%   AREA ${arOverA.toFixed(6)} mm2 = ${pc(arOverA, area3)}%   MAX aspect3 ${arMax.toFixed(3)}`);
console.log(`  MIN arc altitude ${(minAlt * 1000).toFixed(3)} nm      MIN scale-free thin ${minThin.toExponential(4)}`);
console.log('  ── SCALE-FREE THIN LADDER (arc minAlt / longest arc edge < tau) — swept, not chosen ──');
console.log('        tau         count       %count        area mm2      %area');
for (let i = 0; i < TAUS.length; i += 1) {
  console.log(`   ${TAUS[i].toFixed(4).padStart(9)}  ${thinC[i].toLocaleString().padStart(11)}  ${pc(thinC[i], nTri).padStart(11)}%  ${thinA[i].toFixed(4).padStart(13)}  ${pc(thinA[i], area3).padStart(10)}%`);
}
console.log('════════════════════════════════════════════════════════════════════════════════════════');
// machine-readable, so the ladder table cannot mis-transcribe a digit
console.log(`JSON ${JSON.stringify({
  tag: TAG, stl, facets: nTri, area3,
  poleC, poleA, poleGrMax: poleGrInf > 0 ? null : poleGrMax, poleGrInf,
  invC, invA, ndlC, ndlA, arOverC, arOverA, arMax,
  minAltUm: minAlt, minThin, taus: TAUS, thinC, thinA,
})}`);
