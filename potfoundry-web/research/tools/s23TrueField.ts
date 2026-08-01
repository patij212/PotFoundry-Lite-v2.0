// s23TrueField.ts — S23-T: THE SURFACE'S OWN DEMAND, MATERIALIZED AS A DURABLE FIELD ARTIFACT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHY IT IS A NEW SCHEMA RATHER THAN A NEW OPTION ON AN OLD ONE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `pf.strata.density/1` and `/2` both carry a field EXTRACTED FROM AN ORACLE MESH: `/1` the 0.25 mm
// reporting grid of `_S22B`'s own `hA`, `/2` the same quantity on the source vertices themselves. R1
// measured what that architecture costs and stated it as a law — *"THE ORACLE-AND-CONSTRUCTOR
// ARCHITECTURE IS BOUNDED BY THE ORACLE'S OWN CONVERGENCE"* — and priced the residual at **x2.46**, the
// largest of the three terms and the one no serialization or estimator fix can reach.
//
// `pf.strata.density/3` is a field with NO ORACLE IN IT. `h(th,z)` is solved directly off the analytic
// surface at the driver's own `PF_CB_TOL`, by the same one-sided-sagitta bisection `s23TrueCost.ts` used
// to price R3's row (**5,024,104 tris = 91.3% of the operator's 5.5 M ceiling**). It is the field the
// operator's ceiling decision actually bought, and this file is the first time it exists as something a
// constructor can be driven by rather than a number in a table.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DISCIPLINE, TAKEN FROM R1 AND NOT RE-INVENTED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  * **THE EMITTED FIELD IS RAW.** Unfloored, ungraded, exactly as Stage 0 emits `/1` and R1 emits `/2`
//    — *"deciding it silently inside the extractor would hide a design decision inside an instrument"*.
//    The floor (36.4 um) and the gradation (alpha 1.0) are applied by `_strataReconField.ts`, where they
//    are registered, measured before the run and re-measurable after it.
//  * **`/1` AND `/2` ARE BYTE-UNTOUCHED.** This writes a new file. Every number this campaign banked off
//    the grid or the scatter stays reproducible against the artifact it was measured on.
//  * **THE INSTRUMENT VALIDATES ITSELF BEFORE ANYTHING IS QUOTED.** Three checks, all exact-or-decomposed:
//      (i)  the emitted lattice, re-read through `loadReconField` and integrated on `s23TrueCost.ts`'s OWN
//           stride-4 sub-lattice with its OWN stride^2 scaling, must return **5,024,104** — the registered
//           row, to the digit. Anything else means the transcription moved.
//      (ii) the SAME integral at stride 1 over every cell. The difference between (i) and (ii) is the
//           stride's aliasing error and it is DECOMPOSED, not explained away.
//      (iii) a refinement sequence M = 1, 2 on the reporting cell. A field whose integral is still moving
//           at M = 2 is measuring its own lattice, which is exactly what `/1`'s 1,761,257 turned out to be.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE DEMAND SOLVE — TRANSCRIBED OPERAND-FOR-OPERAND FROM `research/tools/s23TrueCost.ts:35-54`
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Four probe directions (along, up, and the two diagonals), a one-sided sagitta from the three-point
// second difference, 26 geometric bisections on [2e-4, 4] mm, `lo` returned so the answer is always a
// length whose sagitta is <= TOL. `rRef = 45` converts an arc length to a `theta` step, `z` is clamped to
// the two rims. NOTHING IS CHANGED: a transcription that improves its source is a different instrument.
//
// Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23TrueField.ts --bundle --platform=node \
//     --format=cjs --target=node20 --external:playwright --external:playwright-core \
//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23tf.cjs
//   node research/bridge/out/_run_s23tf.cjs <mode> [M]
//     mode = probe   : time the solve on a small sample and print the projected full-lattice cost
//     mode = emit    : evaluate the M-refined lattice and WRITE the artifact
//     mode = price   : re-read the artifact and run the three validations + the dry pricing table
import { writeFileSync, readFileSync } from 'node:fs';
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
const TOL = 0.01;
const MODE = String(process.argv[2] ?? 'probe');
const M = Math.max(1, Math.round(Number(process.argv[3] ?? 1)));
// One artifact per refinement, so the convergence test holds them side by side instead of overwriting
// its own evidence. `M = 1` keeps the unsuffixed name because that is the reporting grid's own lattice.
const OUT = M === 1 ? `${EX}S23T.density3.json` : `${EX}S23T.density3.m${M}.json`;

const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };

// ── THE DEMAND SOLVE. Transcribed from s23TrueCost.ts:35-54, operand for operand. ────────────────────
// `sagAt` is the SAME `sag` closure, exposed so the inverse question can be asked with the identical
// arithmetic: *"the constructor is FORBIDDEN to place below 36.4 um — what does a 36.4 um chord actually
// cost in sagitta HERE?"* That is a measurement of the floor's price, not an extrapolation from the
// demand: no quadratic scaling law is assumed anywhere, the same three-point second difference over the
// same four directions is evaluated at the chord the constructor can actually place.
function sagAt(th: number, z: number, L: number): number {
  const P = (t: number, zz: number): [number, number, number] => {
    const c = canon(t); const r = rA(c, zz); return [r * Math.cos(c), r * Math.sin(c), zz];
  };
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
}
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

// the /1 artifact is read ONLY for its chart + grid geometry, so the /3 lattice's cell centres coincide
// with the reporting grid's own to the last bit. Its `hUm` is never used here.
const base = JSON.parse(readFileSync(`${EX}S22B.density.json`, 'utf8')) as {
  chart: { rRef: number; xMaxMm: number; H: number };
  grid: { cols: number; rows: number; cellMm: number; dxMm: number; dyMm: number };
};
const C0 = base.grid.cols; const R0 = base.grid.rows;
const DX0 = base.grid.dxMm; const DY0 = base.grid.dyMm;

const q = (a: number[] | Float64Array, p: number): number => {
  const s = Float64Array.from(a as ArrayLike<number>); s.sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
};

if (MODE === 'probe') {
  // ── TIMING, MEASURED, so the emit is scheduled against a number and not a guess ────────────────────
  const N = 400;
  const t0 = Date.now();
  const hs: number[] = [];
  for (let i = 0; i < N; i += 1) {
    const r = Math.floor(((i * 7919) % (R0 * 13)) / 13) % R0;
    const c = Math.floor(((i * 104729) % (C0 * 11)) / 11) % C0;
    hs.push(demand(((c + 0.5) * DX0) / rRef, (r + 0.5) * DY0) * 1000);
  }
  const ms = Date.now() - t0;
  log(`=== S23-T TIMING PROBE ===`);
  log(`  ${N} demand solves in ${ms} ms = ${(ms / N).toFixed(3)} ms each`);
  log(`  reporting grid ${C0} x ${R0} = ${C0 * R0} cells`);
  for (const m of [1, 2, 4]) {
    const cells = C0 * m * R0 * m;
    log(`    M=${m}: ${cells} cells -> ${((cells * ms) / N / 1000).toFixed(0)} s single-threaded`);
  }
  log(`  sampled demand um: p01 ${q(hs, 0.01).toFixed(1)} p10 ${q(hs, 0.10).toFixed(1)} p50 ${q(hs, 0.50).toFixed(1)}`
    + ` p90 ${q(hs, 0.90).toFixed(1)} p99 ${q(hs, 0.99).toFixed(1)} min ${q(hs, 0).toFixed(1)} max ${q(hs, 1 - 1e-9).toFixed(1)}`);
  log(`  below the constructor's 36.4 um floor: ${hs.filter((v) => v < 36.4).length} of ${N}`);
  log('=== DONE ===');
} else if (MODE === 'emit') {
  // ── THE EVALUATION. Row-major, row 0 = z 0, col 0 = theta 0 — the /1 and /2 convention exactly. ────
  const cols = C0 * M; const rows = R0 * M;
  const dx = DX0 / M; const dy = DY0 / M;
  const hUm = new Float64Array(cols * rows);
  const t0 = Date.now();
  for (let r = 0; r < rows; r += 1) {
    const z = (r + 0.5) * dy;
    for (let c = 0; c < cols; c += 1) {
      hUm[r * cols + c] = demand(((c + 0.5) * dx) / rRef, z) * 1000;
    }
    if (r % 20 === 0) {
      const el = (Date.now() - t0) / 1000;
      log(`  row ${r}/${rows}  ${el.toFixed(0)}s elapsed, ETA ${((el / (r + 1)) * (rows - r - 1)).toFixed(0)}s`);
    }
  }
  const secs = (Date.now() - t0) / 1000;
  let below = 0; for (let i = 0; i < hUm.length; i += 1) if (hUm[i] < 36.4) below += 1;
  const art = {
    schema: 'pf.strata.density/3',
    source: {
      stl: '(none — analytic) GothicArches ring, rA = buildAuditRadiusFn(registryDefaults)',
      nTri: 0, nVert: 0, arm: 'S23T',
      note: 'NO ORACLE MESH. h is solved off the analytic surface, so this field is not bounded by any '
        + "mesh's own convergence — the x2.46 term R1 measured is absent by construction.",
    },
    chart: { note: base.chart === undefined ? '' : 'x = rRef*theta, y = z', rRef, xMaxMm: base.chart.xMaxMm, H },
    grid: { cols, rows, cellMm: dy, dxMm: dx, dyMm: dy, order: 'row-major, row 0 = z 0, col 0 = theta 0', refineM: M },
    estimator: {
      primary: 'h = the largest chord whose ONE-SIDED SAGITTA is <= PF_CB_TOL, over 4 probe directions',
      tolMm: TOL, directions: [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]],
      bisections: 26, bracketMm: [2e-4, 4], query: 'GRID: bilinear on the prepared lattice (no scatter)',
      smoothed: false, gradientLimited: false, floored: false,
      transcribedFrom: 'research/tools/s23TrueCost.ts:35-54 (the file that priced R3\'s 5,024,104 row)',
    },
    hUm: Array.from(hUm, (v) => Number(v.toFixed(4))),
  };
  writeFileSync(OUT, JSON.stringify(art));
  log(`=== S23-T FIELD EMITTED: ${OUT} ===`);
  log(`  ${cols} x ${rows} = ${cols * rows} cells at M=${M}, ${secs.toFixed(0)} s`);
  log(`  RAW demand um: min ${q(hUm, 0).toFixed(3)} p01 ${q(hUm, 0.01).toFixed(3)} p10 ${q(hUm, 0.10).toFixed(3)}`
    + ` p50 ${q(hUm, 0.50).toFixed(3)} p90 ${q(hUm, 0.90).toFixed(3)} p99 ${q(hUm, 0.99).toFixed(3)} max ${q(hUm, 1 - 1e-12).toFixed(3)}`);
  log(`  cells BELOW the constructor's own 36.4 um floor: ${below} of ${cols * rows}`
    + ` (${((100 * below) / (cols * rows)).toFixed(3)}%)`);
  log('=== DONE ===');
} else {
  // ══ PRICE — the three validations, then the dry pricing table ════════════════════════════════════
  log('=== S23-T — THE TRUE-DEMAND FIELD, VALIDATED AND PRICED. NOTHING IS BUILT. ===');
  const tL = Date.now();
  const f = loadReconField(OUT, { floorMm: 0.0364, alpha: 1.0 });
  const fRaw = loadReconField(OUT, { floorMm: 0.0364, alpha: Infinity });
  log(`  field loaded + prepared in ${((Date.now() - tL) / 1000).toFixed(1)}s — ${f.cols} x ${f.rows}`
    + ` (M = ${f.cols / C0}), source ${f.fieldSource.toUpperCase()}`);
  log('');
  log('--- VALIDATION 1: s23TrueCost.ts\'s OWN stride-4 sub-lattice must return 5,024,104 to the digit ---');
  //     Transcribed from s23TrueCost.ts:56-73: cell centres of the /1 grid, stride 4, dA scaled by
  //     STRIDE^2, `h` FLOORED at 36.4 um and NOT graded. Evaluated on the /3 lattice's own cell values
  //     at M = 1, which are the same points; at M > 1 the M-th sub-cell centre nearest the /1 centre is
  //     the honest stand-in and the offset is reported.
  const MM = f.cols / C0;
  const STRIDE = 4; const hFD = 1e-6;
  const dTh0 = DX0 / rRef;
  {
    let n = 0; let area = 0; let cells = 0; let floored = 0;
    for (let r = 0; r < R0; r += STRIDE) {
      const z = (r + 0.5) * DY0;
      for (let c = 0; c < C0; c += STRIDE) {
        const th = ((c + 0.5) * DX0) / rRef;
        // the /3 cell whose centre is nearest the /1 cell centre
        const rr = Math.min(f.rows - 1, Math.floor(z / f.dyMm));
        const cc = Math.min(f.cols - 1, Math.floor((rRef * th) / f.dxMm));
        let h = fRaw.hRaw[rr * f.cols + cc];
        if (h < 0.0364) { h = 0.0364; floored += 1; }
        const r0 = rA(th, z);
        const rt = (rA(th + hFD, z) - rA(th - hFD, z)) / (2 * hFD);
        const rz = (rA(th, Math.min(H, z + hFD)) - rA(th, Math.max(0, z - hFD))) / (2 * hFD);
        const dA = Math.sqrt(r0 * r0 * (1 + rz * rz) + rt * rt) * dTh0 * DY0 * STRIDE * STRIDE;
        area += dA; n += dA / ((SQRT3 / 4) * h * h); cells += 1;
      }
    }
    log(`  stride ${STRIDE}, ${cells} cells, ${area.toFixed(2)} mm^2 integrated (M=${MM} sub-cell offset`
      + ` <= ${((0.5 * DX0 * (MM - 1)) / MM * 1000).toFixed(1)} um)`);
    log(`  N_tri = ${Math.round(n)}   vs the registered 5024104   `
      + `${Math.round(n) === 5024104 ? 'EXACT' : `DELTA ${Math.round(n) - 5024104} (${((100 * (n - 5024104)) / 5024104).toFixed(3)}%)`}`);
    log(`    floored cells ${floored} of ${cells}`);
  }
  log('');
  log('--- VALIDATION 2: the SAME integral at stride 1 — every cell. The delta IS the stride aliasing. ---');
  const full = impliedTris(fRaw, rA, 'prepared');       // floored, NOT graded
  const fullRaw = impliedTris(fRaw, rA, 'raw');         // neither
  log(`  RAW      (no floor, no gradation) N_tri = ${Math.round(fullRaw.nTri)}`);
  log(`  FLOORED  (36.4 um, no gradation)  N_tri = ${Math.round(full.nTri)}   over ${full.areaMm2.toFixed(2)} mm^2`);
  log(`  => the 36.4 um FLOOR alone removes ${Math.round(fullRaw.nTri - full.nTri)} triangles`
    + ` (x${(fullRaw.nTri / full.nTri).toFixed(4)}) — the constructor cannot place what the surface asks for`);
  log('');
  log('--- VALIDATION 3: the PREPARED field the constructor is actually driven by (floor THEN alpha 1.0) ---');
  const prep = impliedTris(f, rA, 'prepared');
  log(`  N_tri = ${Math.round(prep.nTri)}   x${(prep.nTri / 1251546).toFixed(4)} of _S22B`
    + `   ${((100 * prep.nTri) / 5.5e6).toFixed(1)}% of the 5.5 M ceiling`);
  log(`  floor clamped ${f.stats.flooredCells} of ${f.stats.nCells} cells`
    + ` (${((100 * f.stats.flooredCells) / f.stats.nCells).toFixed(3)}%), raw min ${f.stats.rawMinUm} um`);
  log(`  gradation lowered ${f.stats.gradedCells} (${((100 * f.stats.gradedCells) / f.stats.nCells).toFixed(3)}%),`
    + ` worst x${f.stats.worstGradeRatio}, ${f.stats.sweeps} sweeps`);
  log(`  prepared h um: min ${f.stats.min} p01 ${f.stats.p01} p10 ${f.stats.p10} p50 ${f.stats.p50}`
    + ` p90 ${f.stats.p90} p99 ${f.stats.p99} max ${f.stats.max}`);
  log(`  8-neighbour size ratio: p50 ${f.stats.ratioRawP50} -> ${f.stats.ratioP50}`
    + `  p99 ${f.stats.ratioRawP99} -> ${f.stats.ratioP99}  MAX ${f.stats.ratioRawMax} -> ${f.stats.ratioMax}`);
  log('');
  log('--- THE PINNED LOCI. What each field asks for where the campaign\'s own MAXes live. ---');
  const g2 = loadReconField(`${EX}S22B.density2.json`, { floorMm: 0.0364, alpha: 1.0 });
  const g1 = loadReconField(`${EX}S22B.density.json`, { floorMm: 0.0364, alpha: 1.0 });
  const SITES: Array<[string, number, number]> = [
    // THE ROW THAT DECIDES T1: `S23R_ARM.log:386` — the H2 WITNESSED MAX's own query point, 584.131 um in
    // BOTH construction arms, against the bisection road's 25.063. Everything else in this table is
    // context; this line is the arm's registered claim standing or falling.
    ['*** THE H2 584.131 um WITNESS ***', 4.450590, 80.75964],
    ['D49 / the 622.349 um HEADLINE MAX', 4.449065, 80.91705],
    ['headline MAX vertex 2', 4.4494, 80.79],
    ['headline MAX vertex 3', 4.4524, 80.58],
    ['worst grid under-price #1', 2.453753, 59.33462],
    ['worst grid under-price #2', 4.548029, 59.36577],
    ['worst grid under-price #3', 2.252699, 55.89854],
    ['the z~64.4 weld band', 2.43763, 64.410],
  ];
  log('  | locus | GRID /1 | SCATTER /2 | **TRUE /3 prepared** | raw demand | at the floor? |');
  log('  |---|---|---|---|---|---|');
  for (const [name, th, z] of SITES) {
    const raw = demand(th, z) * 1000;
    log(`  | ${name} (th ${th}, z ${z}) | ${(g1.hAt(th, z) * 1000).toFixed(1)} | ${(g2.hAt(th, z) * 1000).toFixed(1)}`
      + ` | **${(f.hAt(th, z) * 1000).toFixed(1)}** | ${raw.toFixed(1)} | ${raw < 36.4 ? '**YES — the constructor is forbidden to place it**' : 'no'} |`);
  }
  log('');
  log('--- *** WHAT THE 36.4 um FLOOR COSTS, MEASURED WITH THE DEMAND SOLVE\'S OWN ARITHMETIC. *** ---');
  log('  The constructor may not place below 36.4 um. `sag(36.4 um)` is therefore the SMALLEST one-sided');
  log('  sagitta error reachable at each locus BY ARCHITECTURE — a floor on the residual, not an estimate.');
  log('  | locus | raw demand um | sag at the 36.4 um FLOOR um | sag at what /3 prepared asks um | x TOL |');
  log('  |---|---|---|---|---|');
  for (const [name, th, z] of SITES) {
    const raw = demand(th, z) * 1000;
    const sFloor = sagAt(th, z, 0.0364) * 1000;
    const sPrep = sagAt(th, z, f.hAt(th, z)) * 1000;
    log(`  | ${name} | ${raw.toFixed(1)} | **${sFloor.toFixed(1)}** | ${sPrep.toFixed(1)} | x${(sFloor / 10).toFixed(1)} |`);
  }
  log('');
  log('=== THE DRY PRICING, AGAINST THE OPERATOR\'S 5.5 M CEILING ===');
  log('  | the field the constructor is priced by | N_tri | x _S22B | % of 5.5 M |');
  log('  |---|---|---|---|');
  log(`  | PREPARED 0.25 mm GRID (S23B) | 1723299 | x1.3769 | 31.3% |`);
  log(`  | PREPARED SCATTERED field (S23R) | 2069338 | x1.6534 | 37.6% |`);
  log(`  | R3's registered row — the surface's own demand at 10 um | 5024104 | x4.0143 | 91.3% |`);
  log(`  | **THE TRUE-DEMAND FIELD, PREPARED (this arm)** | **${Math.round(prep.nTri)}**`
    + ` | **x${(prep.nTri / 1251546).toFixed(4)}** | **${((100 * prep.nTri) / 5.5e6).toFixed(1)}%** |`);
  log(`  => ${prep.nTri > 5.5e6 ? '*** BREACHES the 5.5 M ceiling — S4\' INFEASIBLE ***' : 'within the ceiling.'}`);
  log('=== DONE ===');
}
