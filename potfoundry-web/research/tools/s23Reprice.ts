// s23Reprice.ts — S23B-R / R1: THE DRY RE-PRICING. READ-ONLY, artifact-only, NOTHING IS BUILT.
//
// R1 says: ship the SCATTERED field, then re-price BEFORE building anything. This is the re-pricing, and
// it is deliberately a MEASUREMENT and not a confirmation — the number that comes back governs, whatever
// it is.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE INSTRUMENT VALIDATES ITSELF TWICE BEFORE ANY NEW NUMBER IS BELIEVED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  1. The GRID path on the new schema-/2 artifact must return Stage 0's own `1,761,257` (raw) and the
//     S23B registration's own `1,723,299` (prepared), TO THE DIGIT. If the /2 emission perturbed the grid
//     by so much as a rounding, that is caught here and nothing else in this file may be read.
//  2. The SCATTERED integral at `k = 1` — one sample at each 0.25 mm cell CENTRE — must return the grid's
//     own number to the digit, because one sample at the cell centre IS `gNear`, the value Stage 0
//     serialized. That makes the `k`-sequence a measurement of the GRID's discretisation error rather
//     than an assertion about it.
//
// Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23Reprice.ts --bundle --platform=node \
//     --format=cjs --target=node20 --external:playwright --external:playwright-core \
//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23rep.cjs
//   node research/bridge/out/_run_s23rep.cjs
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { loadReconField, impliedTris, impliedTrisVoronoi, impliedTrisScatterSub } from '../bridge/_strataReconField';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const H = 120; const TWO_PI = 2 * Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const S22B_TRI = 1251546;
const CEIL_OLD = 2e6;
const CEIL_NEW = 5.5e6;          // the operator's R3 decision, AskUserQuestion 2026-08-01
const FLOOR = 0.0364; const ALPHA = 1.0;   // R5: NOT re-opened
const TOL = 0.01;                // PF_CB_TOL, the driver's own tolerance

const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
const dThW = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };
const q = (a: number[], p: number): number => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/** the surface's own demand at `TOL` — transcribed operand-for-operand from `s23TrueCost.ts`. */
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
  for (let i = 0; i < 32; i += 1) { const m = Math.sqrt(lo * hi); if (sag(m) <= TOL) lo = m; else hi = m; }
  return lo;
}

log('=== S23B-R / R1 — THE DRY RE-PRICING. Nothing is built. The number that comes back governs. ===');
log(`  ceiling: 2.0 M -> ${(CEIL_NEW / 1e6).toFixed(1)} M (operator, AskUserQuestion 2026-08-01, "Raise to ~5.5M")`);
log(`  field preparation UNCHANGED per R5: floor ${(FLOOR * 1000).toFixed(1)} um, alpha ${ALPHA.toFixed(2)}, FLOOR-THEN-GRADE`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// LOAD BOTH FIELDS OFF THE SAME NEW ARTIFACT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const t0 = Date.now();
const G = loadReconField(`${EX}S22B.density2.json`, { floorMm: FLOOR, alpha: ALPHA, source: 'grid' });
log(`  grid field loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const t1 = Date.now();
const S = loadReconField(`${EX}S22B.density2.json`, { floorMm: FLOOR, alpha: ALPHA, source: 'scatter' });
log(`  scattered field loaded + prepared in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
log('');

log('--- INSTRUMENT VALIDATION 1: the GRID path off the /2 artifact must reproduce Stage 0 to the digit ---');
const gRaw = impliedTris(G, rA, 'raw');
const gPrep = impliedTris(G, rA, 'prepared');
const ok1a = Math.round(gRaw.nTri) === 1761257;
const ok1b = Math.round(gPrep.nTri) === 1723299;
log(`  RAW grid      ${Math.round(gRaw.nTri)}  vs Stage 0's 1761257   ${ok1a ? 'EXACT' : '*** DIFFERS ***'}`);
log(`  PREPARED grid ${Math.round(gPrep.nTri)}  vs S23B's registered 1723299   ${ok1b ? 'EXACT' : '*** DIFFERS ***'}`);
if (!ok1a || !ok1b) {
  log('  *** THE /2 EMISSION PERTURBED THE GRID. NOTHING BELOW MAY BE READ. STOP. ***');
  process.exit(2);
}

log('--- INSTRUMENT VALIDATION 2: the RAW SCATTERED field at k=1 IS the grid, so it must return 1761257 ---');
log('  (one sample at each 0.25 mm cell CENTRE is exactly `gNear`, the value Stage 0 serialized. The');
log('   FIRST draft of this check compared the PREPARED scatter against the RAW grid and "failed" — that');
log('   was my mis-specification, not the instrument, and it is corrected here rather than quietly.)');
const SR = loadReconField(`${EX}S22B.density2.json`, { floorMm: 0, alpha: Infinity, source: 'scatter' });
const sRawK1 = impliedTrisScatterSub(SR, rA, 1);
const sRawVor = impliedTrisVoronoi(SR);
const ok2a = Math.round(sRawK1.nTri) === 1761257;
const ok2b = Math.round(sRawVor.nTri) === 2 * SR.stats.scatterN;
log(`  RAW scattered, k=1 lattice : ${Math.round(sRawK1.nTri)}  vs the grid's 1761257   ${ok2a ? 'EXACT' : '*** DIFFERS ***'}`);
log(`  RAW scattered, exact Voronoi: ${Math.round(sRawVor.nTri)}  vs 2*nV = ${2 * SR.stats.scatterN}`
  + `   ${ok2b ? 'EXACT (the Euler identity holds — no discretisation anywhere)' : '*** DIFFERS ***'}`);
if (!ok2a || !ok2b) log('  *** the scattered instrument is NOT comparable with the grid. Every k-row below is suspect. ***');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SCATTERED FIELD, PREPARED — what the two declared variables actually did to it
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('--- THE SCATTERED FIELD, PREPARED (floor 36.4 um, then alpha 1.0 over the oracle\'s own edge graph) ---');
const st = S.stats;
log(`  ${st.scatterN} source vertices;  FLOOR clamped ${st.scatterFloored}`
  + ` (${((100 * st.scatterFloored) / st.scatterN).toFixed(3)}% of vertices, raw min ${st.rawMinUm} um)`);
log(`  GRADATION lowered ${st.scatterGraded} (${((100 * st.scatterGraded) / st.scatterN).toFixed(3)}%),`
  + ` worst x${st.scatterWorstGrade}, ${st.scatterRelaxations} relaxations`);
log(`  edge-wise size ratio over the oracle's own graph: p50 ${st.scatterRatioRawP50} -> ${st.scatterRatioP50}`
  + `   p99 ${st.scatterRatioRawP99} -> ${st.scatterRatioP99}   MAX ${st.scatterRatioRawMax} -> ${st.scatterRatioMax}`);
log(`  the gradation metric's own bias, MEASURED not assumed — graph step / straight chart line:`
  + ` p50 ${st.graphStretchP50}  p99 ${st.graphStretchP99}  MAX ${st.graphStretchMax}`);
log(`    (>1 means the envelope is that much MORE PERMISSIVE than a true Euclidean alpha — the same`);
log(`     direction as the grid path's ~8% chamfer bias, and stated for the same reason)`);
log(`  prepared SCATTERED h um: min ${st.sMin} p01 ${st.sP01} p10 ${st.sP10} p50 ${st.sP50}`
  + ` p90 ${st.sP90} p99 ${st.sP99} max ${st.sMax}`);
log(`  prepared GRID     h um: min ${st.min} p01 ${st.p01} p10 ${st.p10} p50 ${st.p50}`
  + ` p90 ${st.p90} p99 ${st.p99} max ${st.max}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE COST — the EXACT Voronoi integral, and the lattice integral's convergence to it
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('--- THE EXACT INTEGRAL: the scattered field over its OWN Voronoi partition, no lattice anywhere ---');
const vor = impliedTrisVoronoi(S);
log(`  SUM_v A(v) = ${vor.areaMm2.toFixed(2)} mm^2   (the shipped mesh's own 3-D area is 38457.09 mm^2)`);
log(`  with h_prep == hA_raw the identity returns 2*nV = ${vor.nTriRaw} — the oracle's own ${S22B_TRI} via Euler`);
log(`  **PREPARED scattered field, EXACT: N_tri = ${Math.round(vor.nTri)}**`
  + `   x${(vor.nTri / S22B_TRI).toFixed(4)} of _S22B   ${((100 * vor.nTri) / CEIL_NEW).toFixed(1)}% of the ${(CEIL_NEW / 1e6).toFixed(1)} M ceiling`);
log('');

log('--- THE CONVERGENCE TEST: the SAME D6 integral, sampling the scattered field k x k per 0.25 mm cell ---');
log('  | k | sub-cell um | N_tri | x _S22B | vs the exact Voronoi |');
log('  |---|---|---|---|---|');
for (const k of [1, 2, 4]) {
  const tK = Date.now();
  const r = impliedTrisScatterSub(S, rA, k);
  const tag = "";
  log(`  | ${k} | ${(250 / k).toFixed(1)} | ${Math.round(r.nTri)} | x${(r.nTri / S22B_TRI).toFixed(4)} | x${(r.nTri / vor.nTri).toFixed(4)} |${tag}`
    + `   [${((Date.now() - tK) / 1000).toFixed(0)}s]`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE LOCAL QUERY — which is what the CONSTRUCTOR actually asks, and where S23B was mis-answered
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('--- THE LOCAL QUERY AT THE REFUTING SITES. The constructor never integrates; it asks h AT A POINT. ---');
const ARM = 'S23B';
const buf = readFileSync(`${EX}${ARM}.stl`);
const nTri = buf.readUInt32LE(80);
const pat = JSON.parse(readFileSync(`${EX}${ARM}.patches.json`, 'utf8')) as {
  patches: Array<{ theta: number; z: number; radiusMm: number }> };
const inRouted = (th: number, z: number): boolean =>
  pat.patches.some((g) => Math.hypot(rRef * dThW(g.theta, th), z - g.z) <= Math.min(g.radiusMm, 1.5));
const sites: Array<{ th: number; z: number }> = [];
{
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    const c: number[] = [];
    for (let k = 0; k < 9; k += 1) { c.push(buf.readFloatLE(o)); o += 4; }
    o += 2;
    const e = [
      Math.hypot(c[3] - c[0], c[4] - c[1], c[5] - c[2]),
      Math.hypot(c[6] - c[3], c[7] - c[4], c[8] - c[5]),
      Math.hypot(c[0] - c[6], c[1] - c[7], c[2] - c[8]),
    ];
    const long = Math.max(...e);
    if (long < 1.0) continue;
    const nx = (c[4] - c[1]) * (c[8] - c[2]) - (c[5] - c[2]) * (c[7] - c[1]);
    const ny = (c[5] - c[2]) * (c[6] - c[0]) - (c[3] - c[0]) * (c[8] - c[2]);
    const nz = (c[3] - c[0]) * (c[7] - c[1]) - (c[4] - c[1]) * (c[6] - c[0]);
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const ar3 = (long * (e[0] + e[1] + e[2])) / (4 * (nl / 2));
    if (ar3 < 20) continue;
    const tA = Math.atan2(c[1], c[0]);
    const th = canon(tA + (dThW(tA, Math.atan2(c[4], c[3])) + dThW(tA, Math.atan2(c[7], c[6]))) / 3);
    const z = (c[2] + c[5] + c[8]) / 3;
    if (inRouted(th, z)) continue;
    sites.push({ th, z });
  }
}
const rG: number[] = []; const rS: number[] = []; const rM: number[] = [];
const hGs: number[] = []; const hSs: number[] = []; const hMs: number[] = [];
const rows: Array<{ th: number; z: number; hG: number; hS: number; hM: number; d: number; rg: number }> = [];
const SCR = S.scatter;
for (const s of sites) {
  const hG = G.hAt(s.th, s.z); const hS = S.hAt(s.th, s.z); const d = demand(s.th, s.z);
  // THE ORACLE'S OWN hMin AT THE SAME SOURCE VERTEX — the diagnostic that separates the two owners.
  let hM = hS;
  if (SCR !== null && SCR.hMin.length === SCR.n) {
    let px = (rRef * s.th) % S.xMaxMm; if (px < 0) px += S.xMaxMm;
    const [vi] = SCR.nearest(px, Math.min(H, Math.max(0, s.z)));
    if (vi >= 0) hM = SCR.hMin[vi];
  }
  rG.push(hG / d); rS.push(hS / d); rM.push(hM / d);
  hGs.push(hG * 1000); hSs.push(hS * 1000); hMs.push(hM * 1000);
  rows.push({ th: s.th, z: s.z, hG: hG * 1000, hS: hS * 1000, hM: hM * 1000, d: d * 1000, rg: hG / d });
}
log(`  ${sites.length} shard sites outside declared geometry (the population that refuted THE CLAUSE)`);
log(`  h um, GRID     : p10 ${q(hGs, 0.1).toFixed(1)}  p50 ${q(hGs, 0.5).toFixed(1)}  p90 ${q(hGs, 0.9).toFixed(1)}`);
log(`  h um, SCATTERED: p10 ${q(hSs, 0.1).toFixed(1)}  p50 ${q(hSs, 0.5).toFixed(1)}  p90 ${q(hSs, 0.9).toFixed(1)}`);
log(`  UNDER-PRICE RATIO (h / the surface's own 10 um demand), the attribution's own quantity:`);
log(`    GRID      p10 ${q(rG, 0.1).toFixed(2)}x  p50 ${q(rG, 0.5).toFixed(2)}x  p90 ${q(rG, 0.9).toFixed(2)}x  MAX ${Math.max(...rG).toFixed(2)}x`
  + `   under-pricing at ${rG.filter((r) => r > 1).length}/${rG.length} (${((100 * rG.filter((r) => r > 1).length) / rG.length).toFixed(1)}%)`);
log(`    SCATTERED p10 ${q(rS, 0.1).toFixed(2)}x  p50 ${q(rS, 0.5).toFixed(2)}x  p90 ${q(rS, 0.9).toFixed(2)}x  MAX ${Math.max(...rS).toFixed(2)}x`
  + `   under-pricing at ${rS.filter((r) => r > 1).length}/${rS.length} (${((100 * rS.filter((r) => r > 1).length) / rS.length).toFixed(1)}%)`);
log('');
log('  WHO OWNS THE RESIDUAL UNDER-PRICE — the oracle\'s own convergence, or `hA` averaging away its');
log('  anisotropy? The SAME vertex\'s `hMin` answers it: `hMin` is what the oracle actually placed.');
log(`    h um, ORACLE hMin at the same vertex: p10 ${q(hMs, 0.1).toFixed(1)}  p50 ${q(hMs, 0.5).toFixed(1)}  p90 ${q(hMs, 0.9).toFixed(1)}`);
log(`    RATIO hMin / true demand: p10 ${q(rM, 0.1).toFixed(2)}x  p50 ${q(rM, 0.5).toFixed(2)}x  p90 ${q(rM, 0.9).toFixed(2)}x  MAX ${Math.max(...rM).toFixed(2)}x`
  + `   under-pricing at ${rM.filter((r) => r > 1).length}/${rM.length} (${((100 * rM.filter((r) => r > 1).length) / rM.length).toFixed(1)}%)`);
log('');
log('  THE THREE WORST GRID UNDER-PRICINGS, and what the scattered field says at the same points:');
rows.sort((a, b) => b.rg - a.rg);
for (const r of rows.slice(0, 3)) {
  log(`    th ${r.th.toFixed(6)} z ${r.z.toFixed(5)}:  grid ${r.hG.toFixed(1)} um (x${r.rg.toFixed(2)})`
    + ` -> scattered ${r.hS.toFixed(1)} um (x${(r.hS / r.d).toFixed(2)})   oracle hMin ${r.hM.toFixed(1)} um`
    + `   true demand ${r.d.toFixed(1)} um`);
}
// D49's own site, the one the residual block pinned
{
  const th = 4.449065; const z = 80.91705;
  const hG = G.hAt(th, z) * 1000; const hS = S.hAt(th, z) * 1000; const d = demand(th, z) * 1000;
  log(`  D49's PINNED WITNESS th 4.449065 z 80.91705:  grid ${hG.toFixed(1)} um (x${(hG / d).toFixed(2)})`
    + ` -> scattered ${hS.toFixed(1)} um (x${(hS / d).toFixed(2)})   true demand ${d.toFixed(1)} um`);
  log(`    (the residual block measured grid 95.9 um / demand 27.5 um / x3.48, and the oracle placed 13.5 um there)`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TABLE THE DECISION IS MADE ON
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('=== THE RE-PRICING, AGAINST THE RAISED CEILING ===');
log(`  | the field the constructor is priced by | N_tri | x _S22B | % of 2.0 M (old) | % of ${(CEIL_NEW / 1e6).toFixed(1)} M (raised) |`);
log('  |---|---|---|---|---|');
const line = (nm: string, n: number): void => log(`  | ${nm} | ${Math.round(n)} | x${(n / S22B_TRI).toFixed(4)} | ${((100 * n) / CEIL_OLD).toFixed(1)}% | ${((100 * n) / CEIL_NEW).toFixed(1)}% |`);
line('RAW 0.25 mm grid (what Stage 0 serialized)', gRaw.nTri);
line('PREPARED 0.25 mm grid (what S23B was priced by)', gPrep.nTri);
line('**PREPARED SCATTERED field, EXACT (R1)**', vor.nTri);
line('THE SURFACE\'S OWN DEMAND at 10 um (R3\'s row)', 5024104);
line('what S23B actually BUILT', 763965);
log('');
log('=== DONE ===');
