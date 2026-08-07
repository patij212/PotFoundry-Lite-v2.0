// s116Adaptive.ts — S116 PARTS 3+4: WHAT THIS MESH COSTS TO DRIVE TO EACH FLOOR, AND WHICH HALF OF ITS
// RESIDUAL DENSITY CAN EVEN TOUCH.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART A — THE COVERING CENSUS. THE DECISIVE TEST FOR "IS IT CHORD SAG OR IS IT A FOLD".
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Every vertex is derived from r(theta,z), so the mesh is a candidate GRAPH over the (theta,z) chart.
// If it really is a graph, then:
//    (i)  every facet's SIGNED parametric footprint has the SAME sign, and
//    (ii) the sum of |footprint| equals the domain area exactly once.
// Both are checked here, exhaustively, with no tolerance and no analytic surface involved.
//
// This is the test that separates the two problems the user has to choose between:
//   * A facet with a consistent-sign footprint IS the correct flat chord over its own patch of the
//     chart. Its residual is CHORD SAG, by definition, and shrinking the patch must kill it. Density
//     fixes it. The only question is the price, which Part B measures.
//   * A facet whose footprint has the WRONG SIGN is inverted in the chart: the chart is double-covered
//     there, two sheets of mesh lie over one piece of surface with opposite orientation. Refining both
//     makes each accurate and leaves the overlap exactly where it was. DENSITY CANNOT FIX IT — only a
//     different generator can. The covering number (sum |footprint| / domain) prices the overlap.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART B — ADAPTIVE REFINEMENT OF THE ACTUAL MESH, TO EACH BAR, EXHAUSTIVELY.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Take each shipping facet's parametric footprint and 4-way subdivide it, re-LIFTING every midpoint
// onto the analytic surface, until every leaf's radial-gap residual is under the bar. Count the leaves.
// That count is a MEASURED triangle bill for driving THIS topology to that floor — not an extrapolation
// from a curvature model, and not a Monte-Carlo integral. It is deliberately the same experiment run
// twice at two bars in ONE descent, so the ratio between them is free of any between-run drift.
//
// The refinement driver is the RADIAL GAP, which is a PROVEN UPPER BOUND on the true distance to the
// surface (the radial foot is a surface point at exactly that distance). So a leaf this tool accepts is
// genuinely under the bar; the count is therefore an UPPER BOUND on the true bill, and the direction of
// its error is stated rather than hoped for.
//
// A facet that cannot be brought under the bar within LMAX levels is NOT counted as converged — it is
// reported separately, with count AND area AND max residual, because that class is the answer to
// "which problem should I fund".
//
// Usage: bash research/tools/run-s116-adaptive.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S116_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S116_STL ?? '';
const TAG = process.env.PF_S116_TAG ?? 'X';
const OUTDIR = process.env.PF_S116_OUTDIR ?? 'research/exchange/_strataConformBisect/s116';
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S116_BARHI', 0.01);
const BAR_LO = envF('PF_S116_BARLO', 0.001);
const K = envI('PF_S116_AK', 3);
const KSW = (process.env.PF_S116_AKSWEEP ?? '2,3,4,6').split(',').map((s) => Math.round(Number(s)));
const LMAX = envI('PF_S116_LMAX', 30);          // BISECTION depth (2 levels ~ one 4-way level)
const PERFACET_CAP = envI('PF_S116_FCAP', 200000);
const DO_B = process.env.PF_S116_SKIPB !== '1';
if (STL.length === 0) { log('*** PF_S116_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 PARTS 3+4 — COVERING CENSUS + ADAPTIVE BILL — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`facets ${nTri}   bars ${BAR_HI} / ${BAR_LO} mm   lattice k=${K}   LMAX ${LMAX}`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART A — SIGNED COVERING CENSUS (exhaustive, analytic-free apart from the z band)
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const th3 = new Float64Array(3); const z3 = new Float64Array(3);
const paramsOf = (f: number): void => {
  const o = f * 9;
  const ta = Math.atan2(xyz[o + 1], xyz[o]);
  th3[0] = ta; z3[0] = xyz[o + 2];
  th3[1] = ta + dThRaw(ta, Math.atan2(xyz[o + 4], xyz[o + 3])); z3[1] = xyz[o + 5];
  th3[2] = ta + dThRaw(ta, Math.atan2(xyz[o + 7], xyz[o + 6])); z3[2] = xyz[o + 8];
};
let zLo = Infinity; let zHi = -Infinity;
for (let f = 0; f < nTri; f += 1) { const o = f * 9; for (let v = 0; v < 3; v += 1) { const z = xyz[o + v * 3 + 2]; if (z < zLo) zLo = z; if (z > zHi) zHi = z; } }
const domainPar = 2 * Math.PI * (zHi - zLo);

let sPos = 0; let sNeg = 0; let nPos = 0; let nNeg = 0; let nZero = 0;
let aPos = 0; let aNeg = 0; let aZero = 0; let area3D = 0;
const parSigned = new Float64Array(nTri);
const area3 = new Float64Array(nTri);
{
  for (let f = 0; f < nTri; f += 1) {
    paramsOf(f);
    const o = f * 9;
    const nx = (xyz[o + 4] - xyz[o + 1]) * (xyz[o + 8] - xyz[o + 2]) - (xyz[o + 5] - xyz[o + 2]) * (xyz[o + 7] - xyz[o + 1]);
    const ny = (xyz[o + 5] - xyz[o + 2]) * (xyz[o + 6] - xyz[o]) - (xyz[o + 3] - xyz[o]) * (xyz[o + 8] - xyz[o + 2]);
    const nz = (xyz[o + 3] - xyz[o]) * (xyz[o + 7] - xyz[o + 1]) - (xyz[o + 4] - xyz[o + 1]) * (xyz[o + 6] - xyz[o]);
    const a3 = 0.5 * Math.hypot(nx, ny, nz); area3[f] = a3; area3D += a3;
    const s = 0.5 * ((th3[1] - th3[0]) * (z3[2] - z3[0]) - (th3[2] - th3[0]) * (z3[1] - z3[0]));
    parSigned[f] = s;
    if (s > 0) { sPos += s; nPos += 1; aPos += a3; }
    else if (s < 0) { sNeg += -s; nNeg += 1; aNeg += a3; }
    else { nZero += 1; aZero += a3; }
  }
}
const pctS = (a: number, b: number): string => (b === 0 ? '   —   ' : ((a / b) * 100).toFixed(4));
log('── PART A: THE SIGNED PARAMETRIC COVERING CENSUS (EXHAUSTIVE, no tolerance, no analytic surface) ──');
log(`   parameter domain  theta in [0, 2pi) x z in [${zLo.toFixed(4)}, ${zHi.toFixed(4)}]  =  ${domainPar.toFixed(4)} rad*mm`);
log(`   mesh 3D area ${area3D.toFixed(3)} mm2`);
log('');
log('   footprint sign   facets      %mesh       3D area mm2    %area      sum|footprint| rad*mm');
log(`   POSITIVE       ${String(nPos).padStart(10)}  ${pctS(nPos, nTri).padStart(9)}%  ${aPos.toFixed(3).padStart(14)}  ${pctS(aPos, area3D).padStart(8)}%  ${sPos.toFixed(6).padStart(18)}`);
log(`   NEGATIVE       ${String(nNeg).padStart(10)}  ${pctS(nNeg, nTri).padStart(9)}%  ${aNeg.toFixed(3).padStart(14)}  ${pctS(aNeg, area3D).padStart(8)}%  ${sNeg.toFixed(6).padStart(18)}`);
log(`   EXACTLY ZERO   ${String(nZero).padStart(10)}  ${pctS(nZero, nTri).padStart(9)}%  ${aZero.toFixed(3).padStart(14)}  ${pctS(aZero, area3D).padStart(8)}%  ${(0).toFixed(6).padStart(18)}`);
log('');
const covering = (sPos + sNeg) / domainPar;
const net = (sPos - sNeg) / domainPar;
log(`   COVERING NUMBER  sum|footprint| / domain = ${covering.toFixed(6)}   (1.000000 = a clean single cover)`);
log(`   NET WINDING      sum(footprint) / domain = ${net.toFixed(6)}   (+/-1.000000 = consistently oriented)`);
log(`   INVERTED SHEET   min(pos,neg)/domain     = ${(Math.min(sPos, sNeg) / domainPar).toFixed(8)}  = ${((Math.min(sPos, sNeg) / domainPar) * 100).toFixed(5)}% of the chart is DOUBLE-COVERED with opposite orientation`);
log('');
log('   READ: the inverted-sign facets are the class DENSITY CANNOT TOUCH. Refining an inverted facet');
log('   makes it an accurate copy of a piece of surface that is already covered the other way round;');
log('   the overlap survives every level of subdivision. Everything else is a chord over a chart patch,');
log('   and Part B prices shrinking those patches.');
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART A2 — CROSS-TAB: FOOTPRINT SIGN x POSITION DEFECT. Needs the R3 dump from s116PosFloor.
// A sign census on its own says how much geometry is inverted; it does not say how much of the DEFECT
// that geometry carries. Those are different questions and conflating them is exactly the sub-class /
// mesh-share error this campaign has already paid for once.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
if (process.env.PF_S116_R3BIN !== undefined && existsSync(process.env.PF_S116_R3BIN)) {
  const buf = readFileSync(process.env.PF_S116_R3BIN);
  const r3 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  if (r3.length !== nTri) {
    log(`── PART A2 SKIPPED: R3 dump has ${r3.length} entries, mesh has ${nTri}. Refusing to join mismatched arrays. ──`);
  } else {
    log('── PART A2: FOOTPRINT SIGN x POSITION DEFECT (R3, the honest perpendicular ruler) ──');
    const rows: Array<[string, (f: number) => boolean]> = [
      ['POSITIVE footprint', (f) => parSigned[f] > 0],
      ['NEGATIVE footprint', (f) => parSigned[f] < 0],
    ];
    let tHi = 0; let tLo = 0;
    for (let f = 0; f < nTri; f += 1) { if (r3[f] > BAR_HI) tHi += area3[f]; if (r3[f] > BAR_LO) tLo += area3[f]; }
    log('   class                facets     3D area mm2   %mesh area   >HI area mm2  %of >HI defect   >LO area mm2  %of >LO defect     MAX R3 mm');
    for (const [name, pred] of rows) {
      let n = 0; let a = 0; let ah = 0; let al = 0; let mx = 0;
      for (let f = 0; f < nTri; f += 1) {
        if (!pred(f)) continue;
        n += 1; a += area3[f];
        if (r3[f] > BAR_HI) ah += area3[f];
        if (r3[f] > BAR_LO) al += area3[f];
        if (r3[f] > mx) mx = r3[f];
      }
      log(`   ${name.padEnd(20)} ${String(n).padStart(9)}  ${a.toFixed(3).padStart(13)}  ${pctS(a, area3D).padStart(10)}%  ${ah.toFixed(4).padStart(13)}  ${pctS(ah, tHi).padStart(13)}%  ${al.toFixed(4).padStart(13)}  ${pctS(al, tLo).padStart(13)}%  ${mx.toExponential(4)}`);
    }
    log('   (The %-of-defect columns are shares OF THE DEFECT CLASS. The %mesh-area column is the mesh share.)');
    log('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PART B — ADAPTIVE REFINEMENT BILL
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const latOf = (k: number): Float64Array => {
  const o: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) o.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(o);
};
const LATS = new Map<number, Float64Array>(); for (const k of [...KSW, K]) LATS.set(k, latOf(k));

/** 3D length of the lifted chart segment (t0,y0)-(t1,y1). */
const seg3D = (t0: number, y0: number, t1: number, y1: number): number => {
  const r0 = rA(t0, y0), r1 = rA(t1, y1);
  return Math.hypot(r1 * Math.cos(t1) - r0 * Math.cos(t0), r1 * Math.sin(t1) - r0 * Math.sin(t0), y1 - y0);
};
const REO = new Float64Array(6);
/** rotate the triangle so that (v0,v1) is the LONGEST 3D edge; returns [t0,z0,t1,z1,t2,z2]. */
const longestEdgeReorder = (t0: number, y0: number, t1: number, y1: number, t2: number, y2: number): Float64Array => {
  const e01 = seg3D(t0, y0, t1, y1), e12 = seg3D(t1, y1, t2, y2), e20 = seg3D(t2, y2, t0, y0);
  if (e01 >= e12 && e01 >= e20) { REO[0] = t0; REO[1] = y0; REO[2] = t1; REO[3] = y1; REO[4] = t2; REO[5] = y2; }
  else if (e12 >= e20) { REO[0] = t1; REO[1] = y1; REO[2] = t2; REO[3] = y2; REO[4] = t0; REO[5] = y0; }
  else { REO[0] = t2; REO[1] = y2; REO[2] = t0; REO[3] = y0; REO[4] = t1; REO[5] = y1; }
  return REO;
};

/**
 * SPLIT RULE: LONGEST-EDGE BISECTION, NOT 4-WAY SUBDIVISION. MEASURED, AND THE FIRST VERSION WAS WRONG.
 *
 * The first version split every triangle 4 ways. On a facet that is DEGENERATE IN THE CHART — three
 * points strung out nearly collinear in (theta,z), which is precisely the curtain class Part A counts —
 * the four children are four more collinear slivers, so the leaf count grows 4x per level while the
 * only thing that shrinks is the sliver's LENGTH, at 2x per level. MEASURED on a 4,006-facet stratified
 * sample: 9.07 M leaves at the 0.01 bar and 9.39 M at 0.001, i.e. 2,250 leaves per facet and almost no
 * difference between the two bars — both symptoms of a handful of facets running away to the per-facet
 * cap rather than of a real bill. Extrapolated, that arm would have taken ~6 hours to report a number
 * about its own split rule.
 *
 * Longest-edge bisection (split the edge with the greatest 3D length at its chart midpoint, re-lifted)
 * is the standard adaptive rule, it halves the diameter with 2 children instead of 4, and on a sliver it
 * shortens the long direction — which is the direction that carries the error. The residual test is
 * unchanged, so the two rules are being compared on one ruler.
 */
/** residual of the chord over the parametric triangle (t0,y0),(t1,y1),(t2,y2), vertices lifted onto rA. */
const resOf = (t0: number, y0: number, t1: number, y1: number, t2: number, y2: number, k: number): number => {
  const r0 = rA(t0, y0), r1 = rA(t1, y1), r2 = rA(t2, y2);
  const ax = r0 * Math.cos(t0), ay = r0 * Math.sin(t0);
  const bx = r1 * Math.cos(t1), by = r1 * Math.sin(t1);
  const cx = r2 * Math.cos(t2), cy = r2 * Math.sin(t2);
  const L = LATS.get(k) as Float64Array; const np = L.length / 3;
  let w = 0;
  for (let p = 0; p < np; p += 1) {
    const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * y0 + w1 * y1 + w2 * y2;
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > w) w = dd;
  }
  return w;
};

if (DO_B) {
  log('── PART B: ADAPTIVE REFINEMENT TO EACH BAR, EXHAUSTIVE OVER EVERY FACET ──');
  // ── scar 2: lattice order on the DRIVER, on a stratified sample, before the full run ──
  log('   SCAR 2 — lattice order k on the adaptive driver (stratified sample of 4000 facets):');
  log('      k      leaves @ 0.01     leaves @ 0.001');
  const strideS = Math.max(1, Math.floor(nTri / envI('PF_S116_SWEEP_N', 1500)));
  for (const k of KSW) {
    let cHi = 0; let cLo = 0;
    for (let f = 0; f < nTri; f += strideS) {
      paramsOf(f);
      const st: number[] = [th3[0], z3[0], th3[1], z3[1], th3[2], z3[2], 0, 0];
      const stack = [st];
      let fLoS = 0;
      while (stack.length > 0) {
        if (fLoS >= PERFACET_CAP) { stack.length = 0; break; }   // the cap the first sweep was missing
        const n = stack.pop() as number[];
        const [t0, y0, t1, y1, t2, y2, depth, hiDone] = n;
        const r = resOf(t0, y0, t1, y1, t2, y2, k);
        let hd = hiDone;
        if (hd === 0 && r <= BAR_HI) { cHi += 1; hd = 1; }
        if (r <= BAR_LO) { cLo += 1; fLoS += 1; if (hd === 0) cHi += 1; continue; }
        if (depth >= LMAX) { cLo += 1; fLoS += 1; if (hd === 0) cHi += 1; continue; }
        const [a0, b0, a1, b1, a2, b2] = longestEdgeReorder(t0, y0, t1, y1, t2, y2);
        const mt = (a0 + a1) / 2, mz = (b0 + b1) / 2;
        stack.push([a0, b0, mt, mz, a2, b2, depth + 1, hd]);
        stack.push([mt, mz, a1, b1, a2, b2, depth + 1, hd]);
      }
    }
    log(`      ${String(k).padStart(2)}    ${String(cHi).padStart(14)}    ${String(cLo).padStart(15)}`);
  }
  log('');

  // ── the full exhaustive run, single descent, both bars ──
  let totHi = 0; let totLo = 0; let nNonConv = 0; let aNonConv = 0; let mxNonConv = 0; let nCapped = 0;
  const loPerFacet = new Uint32Array(nTri);
  const tB = Date.now();
  // preallocated explicit stack: 8 numbers per node. Bisection pushes 2 and pops 1, so the live-node
  // count grows by exactly 1 per level and is bounded by LMAX+2.
  const SBUF = new Float64Array(8 * (LMAX + 8));
  for (let f = 0; f < nTri; f += 1) {
    paramsOf(f);
    let sp = 0;
    SBUF[0] = th3[0]; SBUF[1] = z3[0]; SBUF[2] = th3[1]; SBUF[3] = z3[1]; SBUF[4] = th3[2]; SBUF[5] = z3[2]; SBUF[6] = 0; SBUF[7] = 0;
    sp = 1;
    let fLo = 0; let fHi = 0; let fNon = 0; let fMax = 0;
    while (sp > 0) {
      sp -= 1;
      const b = sp * 8;
      const t0 = SBUF[b], y0 = SBUF[b + 1], t1 = SBUF[b + 2], y1 = SBUF[b + 3], t2 = SBUF[b + 4], y2 = SBUF[b + 5];
      const depth = SBUF[b + 6]; let hd = SBUF[b + 7];
      const r = resOf(t0, y0, t1, y1, t2, y2, K);
      if (hd === 0 && r <= BAR_HI) { fHi += 1; hd = 1; }
      if (r <= BAR_LO) { fLo += 1; if (hd === 0) fHi += 1; continue; }
      if (depth >= LMAX || fLo >= PERFACET_CAP) {
        fLo += 1; if (hd === 0) fHi += 1;
        fNon += 1; if (r > fMax) fMax = r;
        continue;
      }
      const R = longestEdgeReorder(t0, y0, t1, y1, t2, y2);
      const a0 = R[0], b0 = R[1], a1 = R[2], b1 = R[3], a2 = R[4], b2 = R[5];
      const mt = (a0 + a1) / 2, mz = (b0 + b1) / 2;
      const push = (c0: number, c1: number, c2: number, c3: number, c4: number, c5: number): void => {
        const q = sp * 8;
        SBUF[q] = c0; SBUF[q + 1] = c1; SBUF[q + 2] = c2; SBUF[q + 3] = c3; SBUF[q + 4] = c4; SBUF[q + 5] = c5;
        SBUF[q + 6] = depth + 1; SBUF[q + 7] = hd; sp += 1;
      };
      push(a0, b0, mt, mz, a2, b2);
      push(mt, mz, a1, b1, a2, b2);
    }
    totHi += fHi; totLo += fLo; loPerFacet[f] = Math.min(4294967295, fLo);
    if (fNon > 0) { nNonConv += 1; aNonConv += area3[f]; if (fMax > mxNonConv) mxNonConv = fMax; }
    if (fLo >= PERFACET_CAP) nCapped += 1;
  }
  const secs = (Date.now() - tB) / 1000;
  log(`   full exhaustive descent over ${nTri} facets in ${secs.toFixed(1)} s`);
  log('');
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  log('   THE BILL — MEASURED TRIANGLE COUNT TO DRIVE *THIS MESH* TO EACH FLOOR');
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`   shipping mesh                 ${String(nTri).padStart(14)} triangles`);
  log(`   adaptive refinement @ 0.01 mm ${String(totHi).padStart(14)} triangles   ${(totHi / nTri).toFixed(3)}x`);
  log(`   adaptive refinement @ 0.001 mm${String(totLo).padStart(14)} triangles   ${(totLo / nTri).toFixed(3)}x`);
  log(`   MEASURED EXPONENT  log10(N_0.001/N_0.01) = ${Math.log10(totLo / totHi).toFixed(4)}   (1.000 = the h^2 textbook law)`);
  log('');
  log(`   leaves that hit LMAX=${LMAX} (i.e. 4^${LMAX} = ${Math.pow(4, LMAX).toExponential(2)} subdivisions did not reach 0.001 mm):`);
  log(`      facets involved ${nNonConv} (${pctS(nNonConv, nTri)}% of facets)   3D area ${aNonConv.toFixed(4)} mm2 (${pctS(aNonConv, area3D)}% of mesh)   worst residual left ${mxNonConv.toExponential(4)} mm`);
  log(`      facets that hit the per-facet leaf cap ${PERFACET_CAP}: ${nCapped}`);
  log('');
  // distribution of the per-facet bill
  {
    const s = Array.from(loPerFacet).sort((a, b) => a - b);
    const qa = (p: number): number => s[Math.min(s.length - 1, Math.floor(s.length * p))];
    log(`   per-facet leaf count @ 0.001 mm:  p50 ${qa(0.5)}  p90 ${qa(0.9)}  p99 ${qa(0.99)}  p99.9 ${qa(0.999)}  p99.99 ${qa(0.9999)}  MAX ${qa(1)}`);
    // what share of the bill comes from the worst 1% of facets
    let tot = 0; for (const v of s) tot += v;
    let top1 = 0; for (let i = Math.floor(s.length * 0.99); i < s.length; i += 1) top1 += s[i];
    let top01 = 0; for (let i = Math.floor(s.length * 0.999); i < s.length; i += 1) top01 += s[i];
    log(`   share of the 0.001 mm bill carried by the worst 1% of facets: ${((top1 / tot) * 100).toFixed(3)}%   worst 0.1%: ${((top01 / tot) * 100).toFixed(3)}%`);
  }
  log('');
  writeFileSync(`${OUTDIR}/S116_ADAPTIVE_${TAG}.json`, JSON.stringify({
    style: STYLE, nTri, area3D, domainPar, covering, net, invertedShare: Math.min(sPos, sNeg) / domainPar,
    nPos, nNeg, nZero, aPos, aNeg, totHi, totLo, exponent: Math.log10(totLo / totHi),
    nNonConv, aNonConv, mxNonConv, LMAX, K,
  }, null, 2));
  log(`json -> ${OUTDIR}/S116_ADAPTIVE_${TAG}.json`);
}
log('S116 PARTS 3+4 DONE');
