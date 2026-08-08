// s120EdgeRuler.ts — S120: THE FIRST EDGE-CONFORMANCE SCORECARD THIS CAMPAIGN HAS EVER RUN.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IT MEASURES AND WHY IT IS NEW
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Every position number this campaign has published is PER FACET — a barycentric lattice over the facet,
// max distance-to-surface over those points. The user's standard is that every EDGE lies on the surface.
// NOBODY HAS EVER SCORED AN EDGE. This tool scores
//
//        E(a,b) = max over s in [0,1] of  dist( a + s*(b-a) , S )                 PERPENDICULAR distance
//
// for EVERY unique edge of the mesh, at both bars, with COUNT + LENGTH-share + MAX, and prints the
// sampling convergence ladder that any max-over-a-parameter number is worthless without.
//
// ── WHAT IS EXHAUSTIVE, WHAT IS BOUNDED, AND EVERY BOUND IS PRINTED ───────────────────────────────────
//   * the EDGE SET is exhaustive: every unique undirected edge, cross-checked against facetDihedralsBig's
//     interior + boundary + nonManifold count. No stride, no cap, no sample.
//   * the RADIAL pass is exhaustive over the edge set at nS uniform points per edge PLUS a golden-section
//     refinement of every interior local maximum (up to a DISCLOSED cap whose binding rate is printed).
//   * the PERPENDICULAR pass is exhaustive over every edge the radial upper bound flags — because
//     perpendicular <= radial POINTWISE, an edge under the bar radially is PROVEN under it, not sampled
//     away. Adjudication rate is therefore 100% by construction and the reductions cut CALLS only.
//   * WHAT IS NOT EXHAUSTIVE, STATED PLAINLY: the parameter s is SAMPLED. A spike narrower than 1/nS of
//     an edge is invisible to any sampler. The ladder rungs 2..nS are printed precisely so the reader can
//     see whether the number has converged; a rung pair that has not converged is not a measurement.
//
// Usage: bash research/tools/run-s120-edge.sh
//   env PF_S120_STL=<abs> PF_S120_TAG=<tag> [PF_S120_STYLE=CelticTriquetra] [PF_S120_NS=256]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { facetDihedralsBig } from '../bridge/dihedralRulerBig';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { readMeshF32 } from './s118MeshIo';
import { facetGeom, latticePts } from './s118ScoreLib';
import {
  makeEdgeWorkspace, edgeRadialSag, radialResid, weldExact, uniqueEdges, goldenMax,
} from './s120EdgeLib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

let PRIO_NOTE = 'not attempted';
if ((process.env.PF_S120_PRIO ?? '1') !== '0') {
  try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); PRIO_NOTE = 'AboveNormal (EcoQoS defeated)'; }
  catch (e) { PRIO_NOTE = `FAILED: ${(e as Error).message}`; }
}

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STYLE = envS('PF_S120_STYLE', 'CelticTriquetra');
const STL = envS('PF_S120_STL', '');
const TAG = envS('PF_S120_TAG', 'RUN');
const OUTDIR = envS('PF_S120_OUTDIR', 'research/exchange/_strataConformBisect/s120');
const DIMS: StyleDims = { H: envF('PF_S120_H', 120), Rb: envF('PF_S120_RB', 40), Rt: envF('PF_S120_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S120_BARHI', 0.01);
const BAR_LO = envF('PF_S120_BARLO', 0.001);
const NS = envI('PF_S120_NS', 256);
const REFINE = envI('PF_S120_REFINE', 44);
const MAXCAND = envI('PF_S120_MAXCAND', 6);
const KEEPC = envI('PF_S120_KEEPC', 4);          // candidates stored per edge for the perpendicular pass
const PERP_NTH = envI('PF_S120_PNTH', 1536);
const PERP_NZ = envI('PF_S120_PNZ', 768);
const PERP_TOPK = envI('PF_S120_PK', 6);
const PERP_ON = envS('PF_S120_PERP', '1') !== '0';
const RUNG8_PERP = envS('PF_S120_RUNG8PERP', '1') !== '0';
const FACET_R1 = envS('PF_S120_FACETR1', '1') !== '0';
const FACET_K = envI('PF_S120_FACETK', 8);
const WORST_N = envI('PF_S120_WORSTN', 40);
const CONV_N = envI('PF_S120_CONVN', 40000);     // edges re-run at 4x nS for the convergence control
const POLISH_N = envI('PF_S120_POLISHN', 3000);  // edges whose PERPENDICULAR max is golden-polished
const NEEDLE_UM = envF('PF_S120_NEEDLEUM', 2);
const POLE_GR = envF('PF_S120_POLEGR', 100);
if (STL.length === 0) { log('*** PF_S120_STL required (ABSOLUTE path) ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const mbs = (b: number): string => `${(b / 1048576).toFixed(0)} MB`;
const rssNow = (): number => process.memoryUsage().rss;
const peakRss = (): number => process.resourceUsage().maxRSS * 1024;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const qt = (v: number[], p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);

// ── analytic surface, byte-identical construction to s118Score ───────────────────────────────────────
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

interface JsonOut { [k: string]: unknown }
const J: JsonOut = { tag: TAG, stl: STL, style: STYLE, params: D, dims: DIMS, barHi: BAR_HI, barLo: BAR_LO, nS: NS, refineIters: REFINE, maxCand: MAXCAND };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S120 EDGE-CONFORMANCE RULER — ${STYLE}   tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh   ${STL}`);
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=1`);
log(`bars   HI ${BAR_HI} mm   LO ${BAR_LO} mm`);
log(`sample nS=${NS} uniform + golden refinement (${REFINE} iters) of every interior local max, cap ${MAXCAND}`);
log(`perp   projector ${PERP_NTH} x ${PERP_NZ} topK ${PERP_TOPK}`);
log(`node ${process.version}   NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '(unset)'}   priority: ${PRIO_NOTE}`);
log('');
log('*** THE QUANTITY: max over s in [0,1] of dist(a + s(b-a), S), PERPENDICULAR, for EVERY unique edge.');
log('*** Every published position number in this campaign is PER FACET. NO EDGE HAS EVER BEEN SCORED.');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P0 — LOAD + CONTROLS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshF32(STL);
const xyz = M.xyz; const nTri = M.nTri;
log(`── P0 MESH: ${nTri.toLocaleString()} facets   rss ${mbs(rssNow())}  ${el()} ──`);

const idxAll = new Int32Array(nTri * 3);
for (let i = 0; i < idxAll.length; i += 1) idxAll[i] = i;
const DR = facetDihedralsBig(xyz, idxAll);
log('── P1 TOPOLOGY (facetDihedralsBig — the shared instrument) ──');
log(`   interior ${DR.interiorEdges.toLocaleString()}   boundary ${DR.boundaryEdges.toLocaleString()}   NON-MANIFOLD ${DR.nonManifoldEdges}   INCONSISTENT WINDING ${DR.inconsistentEdges}`);

const WELD = weldExact(xyz);
const U = uniqueEdges(WELD.id, WELD.count, nTri);
const ctlEdges = U.interior === DR.interiorEdges && U.boundary === DR.boundaryEdges && U.nonManifold === DR.nonManifoldEdges;
log('── P1b UNIQUE EDGE SET (this tool\'s own weld + CSR) ──');
log(`   welded vertices ${WELD.count.toLocaleString()}   UNIQUE EDGES ${U.count.toLocaleString()}   interior ${U.interior.toLocaleString()}  boundary ${U.boundary.toLocaleString()}  non-manifold ${U.nonManifold}`);
log(`   *** CONTROL C1 — edge set vs facetDihedralsBig: ${ctlEdges ? 'IDENTICAL' : '*** DIVERGES — RUN VOID ***'} ***`);
if (!ctlEdges) { log('   refusing to score an edge set the shared instrument does not recognise.'); process.exit(3); }
J.topology = { interior: DR.interiorEdges, boundary: DR.boundaryEdges, nonManifold: DR.nonManifoldEdges, inconsistent: DR.inconsistentEdges, weldedVerts: WELD.count, uniqueEdges: U.count, controlC1: ctlEdges };
log('');

// welded coordinates (needed to walk edges without a facet lookup)
const vx = new Float64Array(WELD.count); const vy = new Float64Array(WELD.count); const vz = new Float64Array(WELD.count);
for (let c = 0; c < nTri * 3; c += 1) { const w = WELD.id[c]; vx[w] = xyz[c * 3]; vy[w] = xyz[c * 3 + 1]; vz[w] = xyz[c * 3 + 2]; }

// ── facet area + artefact classes, for the cross-tabulation and the area control ─────────────────────
const areaA = new Float64Array(nTri);
const FL_NEEDLE = 1; const FL_INV = 2; const FL_POLE = 4;
const fflags = new Uint8Array(nTri);
let area3D = 0;
{
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const tha = Math.atan2(ay, ax);
    const G = facetGeom(ax, ay, az, bx, by, bz, cx, cy, cz,
      tha, tha + dThRaw(tha, Math.atan2(by, bx)), tha + dThRaw(tha, Math.atan2(cy, cx)));
    areaA[f] = G.area; area3D += G.area;
    let fl = 0;
    if (G.minAltUm < NEEDLE_UM) fl |= FL_NEEDLE;
    if (G.apsSign < 0) fl |= FL_INV;
    if (G.graphRatio >= POLE_GR) fl |= FL_POLE;
    fflags[f] = fl;
  }
}
log(`── P1c CONTROL C0 — 3D area ${area3D.toFixed(3)} mm2 over ${nTri.toLocaleString()} facets`);
log('   (the published baselines are CT guard-ON 1,282,394 / 48,535.770 mm2 and Gothic S39CTL 1,142,166 / 38,453.259 mm2)');
J.nTri = nTri; J.area3D = area3D;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE R — RADIAL EDGE SAG, EXHAUSTIVE, WITH THE FULL CONVERGENCE LADDER
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const nE = U.count;
const eRad = new Float64Array(nE);
const eLen = new Float64Array(nE);
const eRad8 = new Float64Array(nE);              // rung 3 = the k=8 facet lattice's edge sample
const candS = new Float32Array(nE * KEEPC);
const candV = new Float32Array(nE * KEEPC);
const candN = new Uint8Array(nE);
const W = makeEdgeWorkspace(NS, MAXCAND);
const LEVELS = W.levels;
let totLen = 0;
const rungCntHi = new Float64Array(LEVELS + 1); const rungLenHi = new Float64Array(LEVELS + 1);
const rungCntLo = new Float64Array(LEVELS + 1); const rungLenLo = new Float64Array(LEVELS + 1);
const rungMax = new Float64Array(LEVELS + 1);
let refCntHi = 0, refLenHi = 0, refCntLo = 0, refLenLo = 0, refMax = 0, refArg = -1;
let capBoundEdges = 0; let sumLocalMax = 0; let maxLocalMax = 0;
let rAcalls = 0;
const radSamp: number[] = [];
{
  const tR = Date.now();
  for (let e = 0; e < nE; e += 1) {
    const a = U.eLo[e]; const b = U.eHi[e];
    const ax = vx[a], ay = vy[a], az = vz[a];
    const bx = vx[b], by = vy[b], bz = vz[b];
    const L = Math.hypot(bx - ax, by - ay, bz - az);
    eLen[e] = L; totLen += L;
    edgeRadialSag(rA, ax, ay, az, bx, by, bz, REFINE, W);
    rAcalls += W.rAcalls;
    sumLocalMax += W.nLocalMax;
    if (W.nLocalMax > maxLocalMax) maxLocalMax = W.nLocalMax;
    if (W.capBound) capBoundEdges += 1;
    for (let j = 0; j <= LEVELS; j += 1) {
      const v = W.ladder[j];
      if (v > BAR_HI) { rungCntHi[j] += 1; rungLenHi[j] += L; }
      if (v > BAR_LO) { rungCntLo[j] += 1; rungLenLo[j] += L; }
      if (v > rungMax[j]) rungMax[j] = v;
    }
    eRad8[e] = W.ladder[3 <= LEVELS ? 3 : LEVELS];
    const m = W.max;
    eRad[e] = m;
    if (m > BAR_HI) { refCntHi += 1; refLenHi += L; }
    if (m > BAR_LO) { refCntLo += 1; refLenLo += L; }
    if (m > refMax) { refMax = m; refArg = e; }
    const nk = Math.min(KEEPC, W.nCand);
    candN[e] = nk;
    for (let c = 0; c < nk; c += 1) { candS[e * KEEPC + c] = W.candS[c]; candV[e * KEEPC + c] = W.candV[c]; }
    if ((e % 29) === 0) radSamp.push(m);
  }
  radSamp.sort((a, b) => a - b);
  const dt = (Date.now() - tR) / 1000;
  log('── PHASE R — RADIAL EDGE SAG. EXHAUSTIVE over the edge set; SOUND UPPER BOUND on the perpendicular. ──');
  log(`   ${nE.toLocaleString()} edges, ${rAcalls.toLocaleString()} rA evaluations, ${dt.toFixed(1)} s (${(rAcalls / dt / 1e6).toFixed(2)} M/s)  rss ${mbs(rssNow())}`);
  log(`   total edge length ${totLen.toFixed(3)} mm`);
  log('');
  log('   *** THE CONVERGENCE LADDER (scar 6: an under-sampled max is an under-read, and this campaign');
  log('       has already paid 13x for one). Rung j = a uniform grid of 2^j intervals; every rung is a');
  log('       STRIDE of the nS grid, so the ladder costs nothing extra and cannot disagree by construction.');
  log(`       *** RUNG 3 (8 intervals) IS EXACTLY THE EDGE SAMPLE BURIED INSIDE A k=8 FACET LATTICE. ***`);
  log('');
  log('     rung   pts      >0.01mm count   len mm   %LEN      >0.001mm count   len mm      %LEN        MAX mm');
  const ladJson: Array<Record<string, number>> = [];
  for (let j = 0; j <= LEVELS; j += 1) {
    log(`   ${String(j).padStart(5)} ${String((1 << j) + 1).padStart(5)} ${String(rungCntHi[j]).padStart(16)} ${rungLenHi[j].toFixed(1).padStart(9)} ${(pct(rungLenHi[j], totLen) + '%').padStart(9)} ${String(rungCntLo[j]).padStart(16)} ${rungLenLo[j].toFixed(1).padStart(9)} ${(pct(rungLenLo[j], totLen) + '%').padStart(10)} ${ex(rungMax[j]).padStart(12)}`);
    ladJson.push({ rung: j, pts: (1 << j) + 1, cntHi: rungCntHi[j], lenHi: rungLenHi[j], cntLo: rungCntLo[j], lenLo: rungLenLo[j], max: rungMax[j] });
  }
  log(`   REFINED (nS=${NS} + golden ${REFINE}):`);
  log(`   ${'ref'.padStart(5)} ${'--'.padStart(5)} ${String(refCntHi).padStart(16)} ${refLenHi.toFixed(1).padStart(9)} ${(pct(refLenHi, totLen) + '%').padStart(9)} ${String(refCntLo).padStart(16)} ${refLenLo.toFixed(1).padStart(9)} ${(pct(refLenLo, totLen) + '%').padStart(10)} ${ex(refMax).padStart(12)}`);
  log('');
  log(`   *** UNDER-READ OF THE k=8 FACET-LATTICE EDGE SAMPLE (rung 3) vs REFINED, RADIALLY: ***`);
  log(`      MAX          ${ex(rungMax[3])} -> ${ex(refMax)}   = ${(refMax / Math.max(1e-15, rungMax[3])).toFixed(3)}x`);
  log(`      count >HI    ${rungCntHi[3].toLocaleString()} -> ${refCntHi.toLocaleString()}  = ${(refCntHi / Math.max(1, rungCntHi[3])).toFixed(3)}x`);
  log(`      count >LO    ${rungCntLo[3].toLocaleString()} -> ${refCntLo.toLocaleString()}  = ${(refCntLo / Math.max(1, rungCntLo[3])).toFixed(3)}x`);
  log(`      LEN%  >LO    ${pct(rungLenLo[3], totLen)}% -> ${pct(refLenLo, totLen)}%`);
  log('');
  log(`   local maxima per edge: mean ${(sumLocalMax / nE).toFixed(3)}  max ${maxLocalMax}`);
  log(`   refinement cap ${MAXCAND} (DISCLOSED BOUND) bound on ${capBoundEdges.toLocaleString()} edges = ${pct(capBoundEdges, nE)}% — a bound that binds can only make the number SMALLER`);
  log(`   p50 ${ex(qt(radSamp, 0.5))}  p90 ${ex(qt(radSamp, 0.9))}  p99 ${ex(qt(radSamp, 0.99))}  (1-in-29 edge sample)`);
  J.phaseR = {
    edges: nE, totalLenMm: totLen, rAcalls, seconds: dt, ladder: ladJson,
    refined: { cntHi: refCntHi, lenHi: refLenHi, cntLo: refCntLo, lenLo: refLenLo, max: refMax, argEdge: refArg },
    rung3UnderReadMax: refMax / Math.max(1e-15, rungMax[3]),
    localMaxMean: sumLocalMax / nE, localMaxMax: maxLocalMax, capBoundEdges,
    p50: qt(radSamp, 0.5), p90: qt(radSamp, 0.9), p99: qt(radSamp, 0.99),
  };
}
log('');

// ── CONVERGENCE CONTROL: re-run the worst CONV_N edges at 4x nS and see whether the number MOVES ──────
{
  const ord = Array.from({ length: nE }, (_v, i) => i);
  ord.sort((a, b) => eRad[b] - eRad[a]);
  const n = Math.min(CONV_N, nE);
  const W4 = makeEdgeWorkspace(NS * 4, MAXCAND * 2);
  let moved = 0; let maxRatio = 1; let m1 = 0; let m4 = 0; let sumRel = 0;
  for (let i = 0; i < n; i += 1) {
    const e = ord[i];
    const a = U.eLo[e]; const b = U.eHi[e];
    edgeRadialSag(rA, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], REFINE, W4);
    const v1 = eRad[e]; const v4 = W4.max;
    if (v1 > m1) m1 = v1;
    if (v4 > m4) m4 = v4;
    const rel = v4 / Math.max(1e-15, v1);
    sumRel += rel;
    if (rel > 1.01) moved += 1;
    if (rel > maxRatio) maxRatio = rel;
  }
  log(`── CONVERGENCE CONTROL — the worst ${n.toLocaleString()} edges by radial, re-scored at nS=${NS * 4} ──`);
  log(`   edges whose value moved by >1%: ${moved.toLocaleString()} (${pct(moved, n)}%)   worst single ratio ${maxRatio.toFixed(4)}x   mean ratio ${(sumRel / n).toFixed(6)}x`);
  log(`   MAX over this set: ${ex(m1)} at nS=${NS}  ->  ${ex(m4)} at nS=${NS * 4}  = ${(m4 / Math.max(1e-15, m1)).toFixed(5)}x`);
  log(`   (if this is ~1.000 the profile is RESOLVED at 1/${NS} of an edge and the headline may be quoted;`);
  log('    if it is not, the headline is not converged and must not be.)');
  J.convergence = { n, moved, movedPct: (moved / n) * 100, worstRatio: maxRatio, meanRatio: sumRel / n, max1: m1, max4: m4, ratio: m4 / Math.max(1e-15, m1) };
}
log(`   ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE P — TRUE PERPENDICULAR, EXHAUSTIVE over the flagged set
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const ePerp = new Float64Array(PERP_ON ? nE : 0);
let perpMax = 0; let perpArgE = -1; let perpArgS = 0;
let pcHi = 0, plHi = 0, pcLo = 0, plLo = 0;
if (PERP_ON) {
  const tB = Date.now();
  const proj = buildRadialSurfaceProjector(rA, { H, nTheta: PERP_NTH, nZ: PERP_NZ, seedTopK: PERP_TOPK });
  log('── PHASE P — TRUE PERPENDICULAR EDGE SAG. EXHAUSTIVE over the flagged set. ──');
  log(`   projector grid ${proj.gridThetaCount} x ${proj.gridZCount} = ${proj.sampleCount.toLocaleString()} samples, ${((Date.now() - tB) / 1000).toFixed(1)} s`);
  log('   Every edge the radial upper bound flags gets a VERDICT. Edges NOT flagged are CERTIFIED under');
  log('   the bar because perpendicular <= radial POINTWISE — a proof, not a sample.');

  // descending-radial order over the LO-flagged set (bucket sort)
  let nFlag = 0;
  for (let e = 0; e < nE; e += 1) if (eRad[e] > BAR_LO) nFlag += 1;
  const NB = 4096;
  const loLg = Math.log10(BAR_LO); const hiLg = Math.log10(Math.max(refMax, BAR_LO * 10));
  const bucketOf = (v: number): number => {
    const b = Math.floor(((Math.log10(v) - loLg) / (hiLg - loLg)) * NB);
    return b < 0 ? 0 : b >= NB ? NB - 1 : b;
  };
  const bcnt = new Int32Array(NB + 1);
  for (let e = 0; e < nE; e += 1) if (eRad[e] > BAR_LO) bcnt[bucketOf(eRad[e])] += 1;
  const boff = new Int32Array(NB + 1);
  { let acc = 0; for (let b = NB - 1; b >= 0; b -= 1) { boff[b] = acc; acc += bcnt[b]; } boff[NB] = acc; }
  const order = new Uint32Array(nFlag);
  { const cur = boff.slice(0, NB); for (let e = 0; e < nE; e += 1) if (eRad[e] > BAR_LO) { const b = bucketOf(eRad[e]); order[cur[b]] = e; cur[b] += 1; } }
  log(`   flagged (radial > ${BAR_LO} mm): ${nFlag.toLocaleString()} of ${nE.toLocaleString()} edges (${pct(nFlag, nE)}%), walked in DESCENDING radial`);

  const tP = Date.now();
  let calls = 0; let c2 = 0; let touched = 0; let recomputed = 0; let undec = 0;
  const prof = new Float64Array(NS + 1);
  const sIdx = new Int32Array(NS + 1);
  for (let i = 0; i < nFlag; i += 1) {
    const e = order[i];
    const re = eRad[e];
    if (re <= perpMax && re <= BAR_LO) break;                     // descending: nothing below can win
    const a = U.eLo[e]; const b = U.eHi[e];
    const ax = vx[a], ay = vy[a], az = vz[a];
    const dx = vx[b] - ax, dy = vy[b] - ay, dz = vz[b] - az;
    let overHi = false; let overLo = false; let did = false;
    let bestOnEdge = 0;
    const tryAt = (s: number, rr: number): void => {
      const x = ax + s * dx, y = ay + s * dy, z = az + s * dz;
      const d = proj.project(x, y, z).dist; calls += 1; did = true;
      if (d > rr + 1e-9) c2 += 1;
      if (d > bestOnEdge) bestOnEdge = d;
      if (d > perpMax) { perpMax = d; perpArgE = e; perpArgS = s; }
      if (d > BAR_HI) overHi = true;
      if (d > BAR_LO) overLo = true;
    };
    // tier 1: the stored refined local maxima, descending by radial
    const nk = candN[e];
    for (let c = 0; c < nk; c += 1) {
      const rr = candV[e * KEEPC + c];
      let tSkip = perpMax;
      if (!overLo && BAR_LO < tSkip) tSkip = BAR_LO;
      if (!overHi && re > BAR_HI && BAR_HI < tSkip) tSkip = BAR_HI;
      if (rr <= tSkip) break;
      tryAt(candS[e * KEEPC + c], rr);
    }
    // tier 2: if the edge is still not witnessed over a bar its radial says it might clear, walk the
    // WHOLE uniform profile at every point whose radial exceeds that bar. Disclosed and counted.
    const needTier2 = (!overLo && re > BAR_LO) || (!overHi && re > BAR_HI);
    if (needTier2) {
      recomputed += 1;
      for (let k = 0; k <= NS; k += 1) {
        const s = k / NS;
        prof[k] = radialResid(rA, ax + s * dx, ay + s * dy, az + s * dz);
        sIdx[k] = k;
      }
      // descending by radial
      const ord2 = Array.prototype.slice.call(sIdx, 0, NS + 1) as number[];
      ord2.sort((p, q) => prof[q] - prof[p]);
      for (const k of ord2) {
        const rr = prof[k];
        let tSkip = perpMax;
        if (!overLo && BAR_LO < tSkip) tSkip = BAR_LO;
        if (!overHi && re > BAR_HI && BAR_HI < tSkip) tSkip = BAR_HI;
        if (rr <= tSkip) break;
        tryAt(k / NS, rr);
      }
    }
    if (did) touched += 1;
    ePerp[e] = bestOnEdge;
    if (overHi) { pcHi += 1; plHi += eLen[e]; }
    if (overLo) { pcLo += 1; plLo += eLen[e]; } else undec += 1;
  }
  const dtP = (Date.now() - tP) / 1000;
  log('');
  log(`   C2 CONTROL (perpendicular must never exceed radial at the same point): ${c2} violations  ${c2 === 0 ? 'HOLDS' : '*** FIRES — RUN VOID ***'}`);
  log(`   adjudicated ${nFlag.toLocaleString()} of ${nFlag.toLocaleString()} flagged edges = 100.00% ADJUDICATION RATE`);
  log(`   projector calls ${calls.toLocaleString()}  (${(calls / Math.max(1, touched)).toFixed(2)} per touched edge); edges needing the tier-2 full-profile walk ${recomputed.toLocaleString()} (${pct(recomputed, nFlag)}%)`);
  log(`   ${dtP.toFixed(1)} s (${(calls / Math.max(1e-9, dtP)).toFixed(0)} calls/s)   rss ${mbs(rssNow())}`);
  log('');
  log(`   *** EDGES OVER ${BAR_HI} mm PERPENDICULAR: ${pcHi.toLocaleString()} (${pct(pcHi, nE)}% of edges)   ${plHi.toFixed(3)} mm of edge = ${pct(plHi, totLen)}% OF TOTAL EDGE LENGTH ***`);
  log(`   *** EDGES OVER ${BAR_LO} mm PERPENDICULAR: ${pcLo.toLocaleString()} (${pct(pcLo, nE)}% of edges)   ${plLo.toFixed(3)} mm of edge = ${pct(plLo, totLen)}% OF TOTAL EDGE LENGTH ***`);
  log(`   *** MESH-WIDE PERPENDICULAR EDGE MAX ${ex(perpMax)} mm ***  (radial upper bound ${ex(refMax)} mm = ${(refMax / Math.max(1e-15, perpMax)).toFixed(2)}x over-read)`);
  log(`   edges flagged radially but under ${BAR_LO} mm at every sampled point: ${undec.toLocaleString()} (${pct(undec, nFlag)}% of flagged)`);
  J.phaseP = {
    flagged: nFlag, calls, c2Violations: c2, tier2Edges: recomputed, seconds: dtP,
    overHiCount: pcHi, overHiLen: plHi, overHiLenPct: (plHi / totLen) * 100,
    overLoCount: pcLo, overLoLen: plLo, overLoLenPct: (plLo / totLen) * 100,
    max: perpMax, argEdge: perpArgE, argS: perpArgS, radialOverRead: refMax / Math.max(1e-15, perpMax),
    underBarAtEverySample: undec,
  };
  log(`   ${el()}`);
  log('');

  // ── EXACT TOP + PERP POLISH ──────────────────────────────────────────────────────────────────────
  // Phase P's per-edge value is the largest perpendicular WITNESSED before the early-out fired, so it is
  // exact for the mesh MAX and exact for the over/under-bar CLASSIFICATION but a lower bound for any
  // individual edge's own value — which would make the worst-edge RANKING below meaningless. So the top
  // edges are re-scored with no early-out at all: every uniform point, plus a golden-section polish of
  // the perpendicular ITSELF (not the radial), which also prices Phase P's one approximation — that its
  // candidate points are chosen by the RADIAL profile and the two argmaxes need not coincide.
  //
  // Taking the top by RADIAL is sound, not a convenience: perpendicular <= radial, so every edge whose
  // perpendicular exceeds the N-th largest radial value is inside the top-N-by-radial set.
  {
    const ord = Array.from({ length: nE }, (_v, i) => i);
    ord.sort((a, b) => eRad[b] - eRad[a]);
    const n = Math.min(POLISH_N, nE);
    const cut = eRad[ord[n - 1]];
    let moved = 0; let worst = 1; let sumRel = 0; let pm0 = 0; let pm1 = 0; let calls = 0;
    for (let i = 0; i < n; i += 1) {
      const e = ord[i];
      const a = U.eLo[e]; const b = U.eHi[e];
      const ax = vx[a], ay = vy[a], az = vz[a];
      const dx = vx[b] - ax, dy = vy[b] - ay, dz = vz[b] - az;
      const P = (s: number): number => { calls += 1; return proj.project(ax + s * dx, ay + s * dy, az + s * dz).dist; };
      let bu = 0; let su = 0;
      for (let k = 0; k <= NS; k += 1) { const s = k / NS; const d = P(s); if (d > bu) { bu = d; su = s; } }
      const h = 1 / NS;
      const g = goldenMax(P, Math.max(0, su - h), Math.min(1, su + h), 30);
      const v1 = Math.max(bu, g.v);
      const v0 = ePerp[e];
      if (v0 > pm0) pm0 = v0;
      if (v1 > pm1) pm1 = v1;
      const rel = v1 / Math.max(1e-15, v0);
      sumRel += rel;
      if (rel > 1.01) moved += 1;
      if (rel > worst) worst = rel;
      ePerp[e] = v1;
      if (v1 > perpMax) { perpMax = v1; perpArgE = e; perpArgS = g.v > bu ? g.s : su; }
    }
    log(`   ── EXACT TOP + PERP POLISH — the top ${n.toLocaleString()} edges by RADIAL (cut ${ex(cut)} mm), NO early-out ──`);
    log(`      ${calls.toLocaleString()} projector calls; every uniform point plus a golden polish of the perpendicular itself.`);
    log(`      edges whose value rose by >1% vs the early-out witness: ${moved.toLocaleString()} (${pct(moved, n)}%)   worst ${worst.toFixed(4)}x   mean ${(sumRel / n).toFixed(6)}x`);
    log(`      MAX over the set ${ex(pm0)} -> ${ex(pm1)} = ${(pm1 / Math.max(1e-15, pm0)).toFixed(5)}x`);
    log(`      *** MESH-WIDE PERPENDICULAR EDGE MAX AFTER POLISH: ${ex(perpMax)} mm ***`);
    J.perpPolish = { n, cut, calls, moved, worst, mean: sumRel / n, max0: pm0, max1: pm1, ratio: pm1 / Math.max(1e-15, pm0), perpMaxAfter: perpMax };
    (J.phaseP as Record<string, unknown>).maxAfterPolish = perpMax;
  }
  log(`   ${el()}`);
  log('');

  // ── RUNG-3 PERPENDICULAR: the same walk, but sampling s ONLY where a k=8 facet lattice does ─────────
  if (RUNG8_PERP) {
    const tR8 = Date.now();
    let nF8 = 0;
    for (let e = 0; e < nE; e += 1) if (eRad8[e] > BAR_LO) nF8 += 1;
    const ord8 = new Uint32Array(nF8);
    { let k = 0; for (let e = 0; e < nE; e += 1) if (eRad8[e] > BAR_LO) { ord8[k] = e; k += 1; } }
    const arr = Array.prototype.slice.call(ord8) as number[];
    arr.sort((a, b) => eRad8[b] - eRad8[a]);
    let calls8 = 0; let best8 = 0; let c8Hi = 0, l8Hi = 0, c8Lo = 0, l8Lo = 0;
    const S8 = [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8, 1];
    for (const e of arr) {
      const re = eRad8[e];
      if (re <= best8 && re <= BAR_LO) break;
      const a = U.eLo[e]; const b = U.eHi[e];
      const ax = vx[a], ay = vy[a], az = vz[a];
      const dx = vx[b] - ax, dy = vy[b] - ay, dz = vz[b] - az;
      let oHi = false; let oLo = false;
      const rr8 = S8.map((s) => radialResid(rA, ax + s * dx, ay + s * dy, az + s * dz));
      const idx8 = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort((p, q) => rr8[q] - rr8[p]);
      for (const k of idx8) {
        const rr = rr8[k];
        let tSkip = best8;
        if (!oLo && BAR_LO < tSkip) tSkip = BAR_LO;
        if (!oHi && re > BAR_HI && BAR_HI < tSkip) tSkip = BAR_HI;
        if (rr <= tSkip) break;
        const s = S8[k];
        const d = proj.project(ax + s * dx, ay + s * dy, az + s * dz).dist; calls8 += 1;
        if (d > best8) best8 = d;
        if (d > BAR_HI) oHi = true;
        if (d > BAR_LO) oLo = true;
      }
      if (oHi) { c8Hi += 1; l8Hi += eLen[e]; }
      if (oLo) { c8Lo += 1; l8Lo += eLen[e]; }
    }
    log(`   ── RUNG-3 PERPENDICULAR — the SAME quantity, sampled ONLY at the 9 points a k=8 facet lattice puts on an edge ──`);
    log(`      flagged ${nF8.toLocaleString()}   projector calls ${calls8.toLocaleString()}   ${((Date.now() - tR8) / 1000).toFixed(1)} s`);
    log(`      > ${BAR_HI} mm : ${c8Hi.toLocaleString()} edges   ${pct(l8Hi, totLen)}% of length      [refined: ${pcHi.toLocaleString()}   ${pct(plHi, totLen)}%]`);
    log(`      > ${BAR_LO} mm : ${c8Lo.toLocaleString()} edges   ${pct(l8Lo, totLen)}% of length      [refined: ${pcLo.toLocaleString()}   ${pct(plLo, totLen)}%]`);
    log(`      MAX ${ex(best8)} mm      [refined: ${ex(perpMax)} mm]`);
    log(`      *** THE k=8 EDGE-SAMPLE UNDER-READ, PERPENDICULAR: MAX ${(perpMax / Math.max(1e-15, best8)).toFixed(3)}x   count>HI ${(pcHi / Math.max(1, c8Hi)).toFixed(3)}x   count>LO ${(pcLo / Math.max(1, c8Lo)).toFixed(3)}x ***`);
    J.rung3Perp = { flagged: nF8, calls: calls8, cntHi: c8Hi, lenHi: l8Hi, cntLo: c8Lo, lenLo: l8Lo, max: best8,
      underReadMax: perpMax / Math.max(1e-15, best8), underReadHi: pcHi / Math.max(1, c8Hi), underReadLo: pcLo / Math.max(1, c8Lo) };
    log(`   ${el()}`);
    log('');
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// FACET ARM — the campaign's own quantity, recomputed here so the comparison uses ONE rA and ONE reader
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const fR1 = new Float64Array(FACET_R1 ? nTri : 0);
if (FACET_R1) {
  const LAT = latticePts(FACET_K); const NP = LAT.length / 3;
  let cH = 0, aH = 0, cL = 0, aL = 0, mx = 0;
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = radialResid(rA, x, y, z);
      if (dd > w) w = dd;
    }
    fR1[f] = w;
    if (w > BAR_HI) { cH += 1; aH += areaA[f]; }
    if (w > BAR_LO) { cL += 1; aL += areaA[f]; }
    if (w > mx) mx = w;
  }
  log(`── FACET ARM — RADIAL R1 at k=${FACET_K}, the campaign's own prefilter, recomputed here as CONTROL C3 ──`);
  log(`   > ${BAR_HI} mm : ${cH.toLocaleString()} facets (${pct(cH, nTri)}%)   ${aH.toFixed(3)} mm2 = ${pct(aH, area3D)}% OF MESH`);
  log(`   > ${BAR_LO} mm : ${cL.toLocaleString()} facets (${pct(cL, nTri)}%)   ${aL.toFixed(3)} mm2 = ${pct(aL, area3D)}% OF MESH`);
  log(`   *** MAX ${ex(mx)} mm ***`);
  log('   (CT guard-ON published: 197,299 / 19.9246% ; 1,043,141 / 97.0393% ; MAX 1.730e+0 mm)');
  log('   (Gothic S39CTL published: 66,044 / 4.6340% ; 1,046,997 / 94.3852% ; MAX 4.840e-1 mm)');
  J.facetR1 = { k: FACET_K, cntHi: cH, areaHi: aH, cntLo: cL, areaLo: aL, max: mx };
  log(`   ${el()}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// *** THE DECISIVE CROSS-CHECK — FACETS THE CAMPAIGN'S OWN RULER PASSES THAT CARRY A FAILING EDGE ***
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The campaign's per-facet verdict is: PASS iff max over the k=8 lattice of the PERPENDICULAR distance is
// under the bar. Because perpendicular <= radial POINTWISE, a facet whose RADIAL R1 is under the bar is
// certified PASS by that ruler without any further evaluation — that is the s118 scorecard's own stated
// logic, not an assumption made here. So every facet with fR1 <= bar is a facet the campaign PASSES.
// If such a facet has an EDGE that the perpendicular edge ruler puts OVER the bar, then the campaign's
// published conformance claim for that facet is wrong at the standard the user actually asked for.
if (FACET_R1 && PERP_ON) {
  const report = (bar: number, name: string): Record<string, unknown> => {
    let failEdges = 0; let failEdgeLen = 0; let bothPass = 0; let bothPassLen = 0;
    const passFacets = new Set<number>();
    let anyPass = 0;
    for (let e = 0; e < nE; e += 1) {
      if (!(ePerp[e] > bar)) continue;
      failEdges += 1; failEdgeLen += eLen[e];
      const f1 = U.eF1[e]; const f2 = U.eF2[e];
      const p1 = fR1[f1] <= bar;
      const p2 = f2 >= 0 ? fR1[f2] <= bar : true;
      if (p1 || p2) anyPass += 1;
      if (p1 && p2) { bothPass += 1; bothPassLen += eLen[e]; }
      if (p1) passFacets.add(f1);
      if (f2 >= 0 && p2) passFacets.add(f2);
    }
    let passArea = 0;
    for (const f of passFacets) passArea += areaA[f];
    let certPass = 0; let certPassArea = 0;
    for (let f = 0; f < nTri; f += 1) if (fR1[f] <= bar) { certPass += 1; certPassArea += areaA[f]; }
    log(`   ── bar ${name} ──`);
    log(`      edges FAILING perpendicularly:                       ${failEdges.toLocaleString()}  (${failEdgeLen.toFixed(1)} mm = ${pct(failEdgeLen, totLen)}% of edge length)`);
    log(`      facets the campaign's ruler CERTIFIES as passing:    ${certPass.toLocaleString()} (${pct(certPass, nTri)}% of facets, ${pct(certPassArea, area3D)}% of area)`);
    log(`      *** OF THOSE, carrying at least one FAILING EDGE:    ${passFacets.size.toLocaleString()} facets = ${pct(passFacets.size, certPass)}% of the certified-passing set,`);
    log(`          ${passArea.toFixed(3)} mm2 = ${pct(passArea, area3D)}% OF THE WHOLE MESH ***`);
    log(`      failing edges with BOTH parents certified-passing:   ${bothPass.toLocaleString()} (${pct(bothPass, failEdges)}% of failing edges, ${pct(bothPassLen, totLen)}% of edge length)`);
    log(`      failing edges with AT LEAST ONE parent certified:    ${anyPass.toLocaleString()} (${pct(anyPass, failEdges)}% of failing edges)`);
    return {
      bar, failEdges, failEdgeLen, certPassFacets: certPass, certPassArea,
      certPassWithFailingEdge: passFacets.size, certPassWithFailingEdgeArea: passArea,
      bothParentsPass: bothPass, bothParentsPassLen: bothPassLen, anyParentPass: anyPass,
    };
  };
  log('── *** THE DECISIVE CROSS-CHECK: FACETS THE CAMPAIGN PASSES THAT CARRY A FAILING EDGE *** ──');
  log('   A facet whose RADIAL R1 is under the bar is CERTIFIED under it perpendicularly by the campaign\'s');
  log('   own logic (perpendicular <= radial pointwise). Those facets are PASSES on the published scorecard.');
  log('   How many of them have an EDGE that fails the user\'s standard?');
  const xHi = report(BAR_HI, `${BAR_HI} mm`);
  const xLo = report(BAR_LO, `${BAR_LO} mm`);
  J.facetPassEdgeFail = { hi: xHi, lo: xLo };
  log(`   ${el()}`);
  log('');
}

// ── per-edge scalars, so a follow-up pass never has to re-run the expensive phases ────────────────────
if (envS('PF_S120_SCALARS', '1') !== '0') {
  const p1 = `${OUTDIR}/S120_${TAG}_edgeRad.f32`;
  const p2 = `${OUTDIR}/S120_${TAG}_edgePerp.f32`;
  const p3 = `${OUTDIR}/S120_${TAG}_edgeLen.f32`;
  const w1 = new Float32Array(nE); const w2 = new Float32Array(nE); const w3 = new Float32Array(nE);
  for (let e = 0; e < nE; e += 1) { w1[e] = eRad[e]; w2[e] = PERP_ON ? ePerp[e] : 0; w3[e] = eLen[e]; }
  writeFileSync(p1, Buffer.from(w1.buffer)); writeFileSync(p2, Buffer.from(w2.buffer)); writeFileSync(p3, Buffer.from(w3.buffer));
  log(`── per-edge scalars -> ${p1} , ${p2} , ${p3}  (Float32Array(${nE.toLocaleString()}) each)`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CROSS-TABULATION + THE WORST EDGES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const score = PERP_ON ? ePerp : eRad;
  const label = PERP_ON ? 'PERPENDICULAR' : 'RADIAL';
  const ord = Array.from({ length: nE }, (_v, i) => i);
  ord.sort((a, b) => score[b] - score[a]);
  // cross-tab: over-bar edges by parent-facet class
  const clsName = ['clean', 'needle', 'inv', 'needle+inv', 'pole', 'needle+pole', 'inv+pole', 'all3'];
  const cntOverHi = new Float64Array(8); const lenOverHi = new Float64Array(8);
  const cntOverLo = new Float64Array(8); const lenOverLo = new Float64Array(8);
  const cntAll = new Float64Array(8); const lenAll = new Float64Array(8);
  const classOf = (e: number): number => {
    let fl = fflags[U.eF1[e]];
    if (U.eF2[e] >= 0) fl |= fflags[U.eF2[e]];
    return fl & 7;
  };
  for (let e = 0; e < nE; e += 1) {
    const c = classOf(e);
    cntAll[c] += 1; lenAll[c] += eLen[e];
    if (score[e] > BAR_HI) { cntOverHi[c] += 1; lenOverHi[c] += eLen[e]; }
    if (score[e] > BAR_LO) { cntOverLo[c] += 1; lenOverLo[c] += eLen[e]; }
  }
  log(`── CROSS-TABULATION — over-bar edges (${label}) by the class of their PARENT FACETS ──`);
  log('   class            edges      %of class     len mm    | over HI   %of class | over LO   %of class');
  const xtab: Array<Record<string, unknown>> = [];
  for (let c = 0; c < 8; c += 1) {
    if (cntAll[c] === 0) continue;
    log(`   ${clsName[c].padEnd(14)} ${String(cntAll[c]).padStart(10)} ${(pct(cntAll[c], nE) + '%').padStart(12)} ${lenAll[c].toFixed(1).padStart(11)} | ${String(cntOverHi[c]).padStart(8)} ${(pct(cntOverHi[c], cntAll[c]) + '%').padStart(10)} | ${String(cntOverLo[c]).padStart(8)} ${(pct(cntOverLo[c], cntAll[c]) + '%').padStart(10)}`);
    xtab.push({ cls: clsName[c], edges: cntAll[c], len: lenAll[c], overHi: cntOverHi[c], overHiLen: lenOverHi[c], overLo: cntOverLo[c], overLoLen: lenOverLo[c] });
  }
  const degenAll = cntAll[1] + cntAll[2] + cntAll[3] + cntAll[4] + cntAll[5] + cntAll[6] + cntAll[7];
  const degenHi = cntOverHi[1] + cntOverHi[2] + cntOverHi[3] + cntOverHi[4] + cntOverHi[5] + cntOverHi[6] + cntOverHi[7];
  log('');
  log(`   *** EDGES TOUCHING ANY DEGENERACY CLASS: ${degenAll.toLocaleString()} = ${pct(degenAll, nE)}% of edges`);
  log(`   *** OF THE ${cntOverHi.reduce((a, b) => a + b, 0).toLocaleString()} EDGES OVER ${BAR_HI} mm, ${degenHi.toLocaleString()} = ${pct(degenHi, cntOverHi.reduce((a, b) => a + b, 0))}% touch a degeneracy class`);
  log(`       (base rate is ${pct(degenAll, nE)}% — the ENRICHMENT is ${((degenHi / Math.max(1, cntOverHi.reduce((a, b) => a + b, 0))) / Math.max(1e-12, degenAll / nE)).toFixed(2)}x)`);
  J.crossTab = { rows: xtab, degenEdges: degenAll, degenOverHi: degenHi, nEdges: nE };
  log('');

  // length / dihedral profile of the over-bar population
  const lenOver: number[] = []; const lenUnder: number[] = [];
  for (let e = 0; e < nE; e += 1) (score[e] > BAR_HI ? lenOver : lenUnder).push(eLen[e]);
  lenOver.sort((a, b) => a - b); lenUnder.sort((a, b) => a - b);
  log('   EDGE LENGTH of the over-HI population vs the rest (mm):');
  log(`      over  n=${lenOver.length.toLocaleString()}  p50 ${ex(qt(lenOver, 0.5))}  p90 ${ex(qt(lenOver, 0.9))}  max ${ex(qt(lenOver, 1))}`);
  log(`      under n=${lenUnder.length.toLocaleString()}  p50 ${ex(qt(lenUnder, 0.5))}  p90 ${ex(qt(lenUnder, 0.9))}  max ${ex(qt(lenUnder, 1))}`);
  J.lenProfile = { overN: lenOver.length, overP50: qt(lenOver, 0.5), overP90: qt(lenOver, 0.9), overMax: qt(lenOver, 1), underN: lenUnder.length, underP50: qt(lenUnder, 0.5), underP90: qt(lenUnder, 0.9) };
  log('');

  log(`── THE ${WORST_N} WORST EDGES BY ${label} SAG ──`);
  log('      rank        sag mm      radial mm     len mm      s*      theta*    z*    parent facet classes / dihedral deg');
  const worst: Array<Record<string, unknown>> = [];
  for (let i = 0; i < Math.min(WORST_N, nE); i += 1) {
    const e = ord[i];
    const a = U.eLo[e]; const b = U.eHi[e];
    const ax = vx[a], ay = vy[a], az = vz[a];
    const dx = vx[b] - ax, dy = vy[b] - ay, dz = vz[b] - az;
    const s = candN[e] > 0 ? candS[e * KEEPC] : 0.5;
    const px = ax + s * dx, py = ay + s * dy, pz = az + s * dz;
    const f1 = U.eF1[e]; const f2 = U.eF2[e];
    const cl = clsName[classOf(e)];
    const dih = f2 >= 0 ? (Math.max(DR.perFacetMaxRad[f1], DR.perFacetMaxRad[f2]) * 180) / Math.PI : NaN;
    log(`   ${String(i + 1).padStart(7)} ${ex(score[e]).padStart(13)} ${ex(eRad[e]).padStart(14)} ${ex(eLen[e]).padStart(11)} ${s.toFixed(4).padStart(8)} ${Math.atan2(py, px).toFixed(4).padStart(9)} ${pz.toFixed(3).padStart(8)}   ${cl.padEnd(12)} ${Number.isFinite(dih) ? dih.toFixed(2) : 'boundary'}`);
    worst.push({
      rank: i + 1, edge: e, sag: score[e], radial: eRad[e], len: eLen[e], s,
      a: [ax, ay, az], b: [vx[b], vy[b], vz[b]], argPt: [px, py, pz],
      theta: Math.atan2(py, px), z: pz, cls: cl, f1, f2, dihedralDeg: dih,
      f1Flags: fflags[f1], f2Flags: f2 >= 0 ? fflags[f2] : null,
    });
  }
  J.worst = worst;
}
log('');

J.priority = PRIO_NOTE;
J.wallSeconds = (Date.now() - T0) / 1000;
J.cpuSeconds = (process.cpuUsage().user + process.cpuUsage().system) / 1e6;
J.peakRssBytes = peakRss();
const jp = `${OUTDIR}/S120_EDGE_${TAG}.json`;
writeFileSync(jp, JSON.stringify(J, null, 2));
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
{
  const wall = (Date.now() - T0) / 1000;
  const cpu = (process.cpuUsage().user + process.cpuUsage().system) / 1e6;
  log(`WALL ${wall.toFixed(1)} s   CPU ${cpu.toFixed(1)} s (${((cpu / wall) * 100).toFixed(0)}% of one core)   PEAK RSS ${mbs(peakRss())}`);
}
log(`json -> ${jp}`);
log('S120 EDGE RULER DONE');
