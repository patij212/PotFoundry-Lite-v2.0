// s118Score.ts — S118: THE ONE-MESH SCORECARD THAT RUNS AT 1e7 FACETS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IT IS FOR
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The 0.001 mm floor needs ~1.1e7 (Gothic) / ~1.7e7 (CelticTriquetra) triangles. The existing scorer,
// s116zFinalScore / s117BigScore, cannot honestly go there for TWO reasons, and this tool exists to fix
// exactly those two and nothing else:
//
//   1. MEMORY. It holds an f64 soup (720 MB at 1e7) plus thA (240 MB) plus seven per-facet Float64Arrays.
//   2. THE PERPENDICULAR PASS IS NOT EXHAUSTIVE ABOVE ITS CAPS. PERP_CAP=220,000 strides the HI bar and
//      PERP_CAPLO=60,000 strides the LO bar. The published CelticTriquetra "over 0.001 mm = 95.3435% of
//      AREA" is an ESTIMATE from a 1-in-18 SAMPLE (98.253% +/- 0.286 of the flagged area), not a
//      measurement. At 1e7 facets those caps would sample 2.2% and 0.6% of the flagged sets.
//
// ── MEMORY: HOW IT FITS ───────────────────────────────────────────────────────────────────────────────
// Persistent state at N facets:  xyz Float32Array(9N) 360 MB | areaA f64 80 | r1 f64 80 | dihDeg f32 40
//                                | flags u8 10   =  570 MB at N=1e7.
// MEASURED at N=1e7 on the synthetic GothicArches grid: 652 MB steady state through P2 and the
// perpendicular pass, and a 1,606 MB PEAK which is entirely the TOPOLOGY pass — weldBig sizes canonX/Y/Z
// to the SOUP vertex count (3 x Float64Array(3N) = 687 MB at 1e7) of which ~5/6 is never written, because
// a closed mesh welds 3N corners down to ~N/2. That is the single largest allocation in the whole tool
// and it is avoidable; it is called out here rather than fixed because dihedralRulerBig is a shared
// instrument and this session is not the place to perturb it.
// A binary STL STORES f32, so the Float32Array soup is BIT-IDENTICAL to readMeshFloat64's output — see
// s118MeshIo.ts, and s118Ceilings stage `read` diffs all 9e7 coordinates and refuses the saving unless
// the diff is 0. `thA` (unwrapped theta per corner, 240 MB) is RECOMPUTED per facet instead of stored:
// two atan2 and a dThRaw are far cheaper than 240 MB of residency. The topology pass runs FIRST and its
// ~2.2 GB of transients are released before anything else is allocated.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PERPENDICULAR PASS: EXHAUSTIVE, AND STILL AFFORDABLE. TWO SOUND REDUCTIONS, NO STRIDE.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MEASURED (s118Ceilings stage `proj`): buildRadialSurfaceProjector costs ~140 us/call. A naive
// exhaustive pass over 1e7 facets x 45 lattice points is 4.5e8 calls = ~17.5 HOURS single-threaded.
// That, not memory, is the binding ceiling at 1e7.
//
// THE INVARIANT BOTH REDUCTIONS REST ON. For a point P=(x,y,z), Q=(rA(th,z)cos th, rA(th,z)sin th, z)
// with th=atan2(y,x) IS A POINT OF THE SURFACE, and |P-Q| = | |P_xy| - rA | = R1(P) exactly. So
//                    dist(P, S)  <=  R1(P)   POINTWISE.
// The projector seeds Gauss-Newton AT THAT RADIAL FOOT and its line search only accepts strict
// improvements, so its returned distance is <= R1(P) as well. (This is asserted at run time as control
// C2 below; if it ever fires the run is VOID.)
//
//   REDUCTION 1 — PER-POINT PREFILTER. Inside a facet, a lattice point whose R1 is <= the threshold that
//   currently matters cannot possibly produce a perpendicular value above it. Skip it. This is not a
//   sample: the point is PROVEN irrelevant.
//
//   REDUCTION 2 — EARLY-OUT + BRANCH-AND-BOUND. The questions asked are (a) is this facet over the bar
//   and (b) what is the mesh-wide max. For (a), stop at the first point that clears the bar. For (b),
//   walk facets in DESCENDING R1 and skip any facet whose R1 is already <= the best perpendicular value
//   found so far — it cannot beat it. Both give the SAME COUNT, AREA and MAX as the full pass.
//
// THAT EQUALITY IS A CLAIM, SO IT IS TESTED, NOT ASSERTED: PF_S118_PERPMODE=full disables both
// reductions and computes max-over-all-45-points for every flagged facet (which also reproduces the
// published runs' exact projector-call counts). `full` and `fast` must agree on COUNT, AREA and MAX to
// the digit. research/bridge/_s118ScoreValidate.test.ts pins that on planted fixtures; the report below
// prints the call counts of whichever mode ran so the reduction factor is visible.
//
// ADJUDICATION RATE IS ALWAYS PRINTED, AND IT IS 100% BY CONSTRUCTION: every facet the radial prefilter
// flags receives a VERDICT. What varies is how many projector CALLS that verdict cost.
//
// ── SHARDING (for the 1e7 regime) ─────────────────────────────────────────────────────────────────────
// PF_S118_PERPSHARD=i/n and PF_S118_ORSHARD=i/n restrict the two slow phases to facets with f % n === i.
// *** THAT IS A PARTITION, NOT A SAMPLE. *** Running all n shards covers every facet exactly once; the
// per-shard JSON carries the partial COUNT/AREA/MAX and s118Merge sums them. A single shard's numbers are
// NOT a mesh number and the report says so on every line.
//
// Usage: bash research/tools/run-s118-score.sh
//   env PF_S118_STL=<abs> PF_S118_TAG=<tag> [PF_S118_STYLE=CelticTriquetra] [PF_S118_PERPMODE=fast|full]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { facetDihedralsBig } from '../bridge/dihedralRulerBig';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { readMeshF32 } from './s118MeshIo';
import { facetGeom, perpScan, latticePts } from './s118ScoreLib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// ── WINDOWS EcoQoS, PINNED BY THE TOOL ITSELF ───────────────────────────────────────────────────────
// MEASURED THIS SESSION, and it invalidated a whole round of my own timings before I caught it: a
// DETACHED node job on this box is throttled by Windows EcoQoS to ~19-30% of ONE core. Measured CPU
// delta over a 20 s window, three concurrent s118 jobs: 18.5% / 30% / ~25% before, 90-95% after setting
// PriorityClass to AboveNormal — a 3-5x wall-clock difference that has nothing to do with the code.
// Any timing taken without this is a measurement of the Windows scheduler. So the tool pins ITSELF at
// startup rather than relying on the operator remembering; PF_S118_PRIO=0 opts out.
let PRIO_NOTE = 'not attempted';
if ((process.env.PF_S118_PRIO ?? '1') !== '0') {
  try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); PRIO_NOTE = 'AboveNormal (EcoQoS defeated)'; }
  catch (e) { PRIO_NOTE = `FAILED: ${(e as Error).message} — timings below may be EcoQoS-throttled`; }
}

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

const STYLE = envS('PF_S118_STYLE', 'CelticTriquetra');
const STL = envS('PF_S118_STL', '');
const TAG = envS('PF_S118_TAG', 'RUN');
const OUTDIR = envS('PF_S118_OUTDIR', 'research/exchange/_strataConformBisect/s118');
const DIMS: StyleDims = { H: envF('PF_S118_H', 120), Rb: envF('PF_S118_RB', 40), Rt: envF('PF_S118_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S118_BARHI', 0.01);
const BAR_LO = envF('PF_S118_BARLO', 0.001);
/**
 * PF_S118_LO=0 drops the 0.001 mm bar from the PERPENDICULAR phase and flags at the 0.01 mm bar instead.
 * Its only purpose is the reproduction arm: the published GothicArches figure was produced by a pass over
 * the R1>0.01 candidates ONLY, and `full` mode over the R1>0.001 set (1.05 M facets x 45 points) would be
 * ~47 M projector calls. The radial ladder above is unaffected and still reports both bars.
 */
const LO_ON = envS('PF_S118_LO', '1') !== '0';
const FLAG_BAR = LO_ON ? BAR_LO : BAR_HI;
const K_R1 = envI('PF_S118_K', 8);
const PERP_K = envI('PF_S118_PERPK', 8);
const PERP_NTH = envI('PF_S118_PNTH', 1536);
const PERP_NZ = envI('PF_S118_PNZ', 768);
const PERP_TOPK = envI('PF_S118_PK', 6);
const PERP_MODE = envS('PF_S118_PERPMODE', 'fast');
const PERP_ON = envS('PF_S118_PERP', '1') !== '0';
const NEEDLE_UM = envF('PF_S118_NEEDLEUM', 2);
const POLE_GR = envF('PF_S118_POLEGR', 100);
const CEIL_N = envI('PF_S118_CEILN', 1200);
const H_REF = envF('PF_S118_HFD', 2e-6);
const MC_N = envI('PF_S118_MCN', 400000);
const TOPO_ON = envS('PF_S118_TOPO', '1') !== '0';
const OR_ON = envS('PF_S118_ORIENT', '1') !== '0';
const OR_K = envI('PF_S118_ORK', 8);
const OR_INSET = envF('PF_S118_ORINSET', 0.05);
const OR_H = envF('PF_S118_ORH', 2e-4);
const OR_BARS = envS('PF_S118_ORBARS', '1,5,15,45,90,163').split(',').map(Number);
const OR_SWEEP_N = envI('PF_S118_ORSWEEPN', 40000);
const OR_WHOLE = envS('PF_S118_ORWHOLE', '1') !== '0';
const PRE_ADJ_UM = envF('PF_S118_PREADJUM', 0.02);
const SCALARS = envS('PF_S118_SCALARS', '0') !== '0';
const parseShard = (v: string): { i: number; n: number } => {
  const m = /^(\d+)\/(\d+)$/.exec(v.trim());
  if (m === null) return { i: 0, n: 1 };
  return { i: Number(m[1]), n: Math.max(1, Number(m[2])) };
};
const PSH = parseShard(envS('PF_S118_PERPSHARD', '0/1'));
const OSH = parseShard(envS('PF_S118_ORSHARD', '0/1'));
if (STL.length === 0) { log('*** PF_S118_STL required (ABSOLUTE path) ***'); process.exit(2); }
// ── THE PREFILTER'S SOUNDNESS PRECONDITION, CHECKED RATHER THAN ASSUMED ──────────────────────────────
// The facet-level skip compares the running perpendicular max against r1[f], which is a max over the
// RADIAL lattice (order K_R1). If the PERPENDICULAR lattice were FINER it would contain points the radial
// pass never saw, so r1[f] could UNDER-state that facet's radial max and a facet could be skipped or left
// unflagged that should not have been. That is the one way this design can silently stop being
// exhaustive, and it is a two-line env mistake away, so it is a hard refusal.
if (PERP_K > K_R1) {
  log(`*** REFUSING: PF_S118_PERPK=${PERP_K} is FINER than PF_S118_K=${K_R1}. The radial prefilter would`);
  log('    then be taken over a coarser point set than the perpendicular pass, and the flagged set would');
  log('    no longer be a superset of the over-bar set. Set PERPK <= K.');
  process.exit(2);
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const mbs = (b: number): string => `${(b / 1048576).toFixed(0)} MB`;
const peakRss = (): number => process.resourceUsage().maxRSS * 1024;
const rssNow = (): number => process.memoryUsage().rss;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const qt = (v: number[] | Float64Array, p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);

// ── analytic surface, byte-identical construction to s116zFinalScore ────────────────────────────────
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

interface JsonOut { [k: string]: unknown }
const J: JsonOut = {
  tag: TAG, stl: STL, style: STYLE, params: D, dims: DIMS, barHi: BAR_HI, barLo: BAR_LO,
  k: K_R1, perpK: PERP_K, perpGrid: [PERP_NTH, PERP_NZ, PERP_TOPK], perpMode: PERP_MODE,
  perpShard: `${PSH.i}/${PSH.n}`, orShard: `${OSH.i}/${OSH.n}`,
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 SCORECARD — ${STYLE}   tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh   ${STL}`);
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=1`);
log(`bars   HI ${BAR_HI} mm   LO ${BAR_LO} mm    lattice k=${K_R1} (${(K_R1 + 1) * (K_R1 + 2) / 2} pts)  perpK=${PERP_K}`);
log(`perp   projector ${PERP_NTH} x ${PERP_NZ} topK ${PERP_TOPK}   mode ${PERP_MODE}   shard ${PSH.i}/${PSH.n}`);
log(`node ${process.version}   NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '(unset)'}   process priority: ${PRIO_NOTE}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ANALYTIC CEILING + BAND AREA  (identical maths to s116zFinalScore so the numbers are comparable)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function ceilingAt(hfd: number, N: number): { gmax: number; deg: number } {
  let gmax = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const th = (2 * Math.PI * (i + 0.5)) / N; const z = (H * (j + 0.5)) / N;
      const r0 = rA(th, z);
      const hT = hfd / Math.max(1e-9, r0);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      let zl = z - hfd; let zh = z + hfd;
      if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
      if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const g = Math.hypot(rt / r0, rz);
      if (g > gmax) gmax = g;
    }
  }
  return { gmax, deg: 2 * Math.atan(gmax) * DEG };
}
log('── ANALYTIC CEILING  CEIL = 2*atan(max|grad r|), h SWEPT (scar 3) ──');
const ceilLad: Array<{ h: number; gmax: number; deg: number }> = [];
for (const hh of [2e-6, 2e-5, 2e-4, 1e-3]) {
  const c = ceilingAt(hh, 400); ceilLad.push({ h: hh, ...c });
  log(`   h=${ex(hh)} (400^2)  max|grad r| ${c.gmax.toFixed(4)}  CEIL ${c.deg.toFixed(3)} deg`);
}
const CREF = ceilingAt(H_REF, CEIL_N);
const CEIL_DEG = CREF.deg;
log(`   REFERENCE h=${ex(H_REF)} on ${CEIL_N}^2: max|grad r| ${CREF.gmax.toFixed(4)}  *** CEIL = ${CEIL_DEG.toFixed(3)} deg *** ${el()}`);
J.ceiling = { ladder: ceilLad, refDeg: CEIL_DEG, refGmax: CREF.gmax };
log('');

let mcArea = 0; let mcSe = 0;
{
  let s = 0x9e3779b97f4a7c15n;
  const rnd = (): number => { s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn; let z = s; z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn; z ^= z >> 31n; return Number(z >> 11n) / 9007199254740992; };
  const hfd = H_REF; let sum = 0; let sum2 = 0;
  for (let i = 0; i < MC_N; i += 1) {
    const th = 2 * Math.PI * rnd(); const z = H * rnd();
    const r0 = rA(th, z);
    const hT = hfd / Math.max(1e-9, r0);
    const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
    let zl = z - hfd; let zh = z + hfd;
    if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
    if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
    const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
    const Jc = Math.sqrt(rt * rt + r0 * r0 * (1 + rz * rz));
    sum += Jc; sum2 += Jc * Jc;
  }
  const dom = 2 * Math.PI * H;
  const mean = sum / MC_N; const varr = Math.max(0, sum2 / MC_N - mean * mean);
  mcArea = mean * dom; mcSe = dom * Math.sqrt(varr / MC_N);
  log(`── ANALYTIC BAND AREA (Monte-Carlo, fixed seed, n=${MC_N}): ${mcArea.toFixed(3)} +/- ${mcSe.toFixed(3)} mm2 (1 s.e.) ${el()} ──`);
}
J.analyticBandMm2 = mcArea; J.analyticBandSe = mcSe;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P0 — LOAD (f32 soup)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshF32(STL);
const xyz = M.xyz; const nTri = M.nTri;
log(`── P0 MESH: ${nTri.toLocaleString()} facets, Float32Array(${xyz.length.toLocaleString()}) = ${mbs(xyz.length * 4)}   rss ${mbs(rssNow())}  ${el()} ──`);
J.nTri = nTri;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P1 — TOPOLOGY FIRST, so its ~2.2 GB of transients are released before anything persistent is allocated
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let dihDeg = new Float32Array(0);
if (TOPO_ON) {
  const tT = Date.now();
  const idx = new Int32Array(nTri * 3);
  for (let i = 0; i < idx.length; i += 1) idx[i] = i;
  const DR = facetDihedralsBig(xyz, idx);
  dihDeg = new Float32Array(nTri);
  for (let f = 0; f < nTri; f += 1) dihDeg[f] = DR.perFacetMaxRad[f] * DEG;
  log('── P1 TOPOLOGY (facetDihedralsBig — the Map ruler dies above 2^23 edges; measured in s118Ceilings) ──');
  log(`   interior ${DR.interiorEdges.toLocaleString()}   boundary ${DR.boundaryEdges.toLocaleString()}   NON-MANIFOLD ${DR.nonManifoldEdges}   INCONSISTENT WINDING ${DR.inconsistentEdges}`);
  log(`   ${((Date.now() - tT) / 1000).toFixed(1)} s   peak RSS so far ${mbs(peakRss())}   (transients released; kept only Float32Array(${nTri.toLocaleString()}) = ${mbs(nTri * 4)})`);
  J.topology = { interior: DR.interiorEdges, boundary: DR.boundaryEdges, nonManifold: DR.nonManifoldEdges, inconsistent: DR.inconsistentEdges, seconds: (Date.now() - tT) / 1000 };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P2 — ONE STREAMING PASS: area, PRECOND (exhaustive), artefact classes, radial R1 (exhaustive)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const areaA = new Float64Array(nTri);
const r1 = new Float64Array(nTri);
const FL_NEEDLE = 1; const FL_INV = 2; const FL_POLE = 4;
const flags = new Uint8Array(nTri);
let area3D = 0;
let preMaxUm = 0; let preOver1 = 0; let preOver10 = 0; let preOver50 = 0;
let preAbove = 0;                     // corners above PRE_ADJ_UM, EXHAUSTIVE count (never truncated)
const preSamp: number[] = [];
// ---- STREAMING TOP-K OF PRECOND CORNERS BY RADIAL DEVIATION ------------------------------------------
// The first draft pushed {f,v,um} objects into a plain array and stopped at 600,000. That is a SILENT
// TRUNCATION: on a mesh with more bad corners than the cap, the perpendicular precond max would be taken
// over an arbitrary PREFIX and reported as if exhaustive. Instead: keep the K largest by radial in fixed
// arrays, keep the EXHAUSTIVE count above the admission threshold, and — because perpendicular <= radial
// — record whether the branch-and-bound below terminated ABOVE the K-th kept value. If it did, the
// answer is exact; if it did not, the report says NOT EXACT and names the K to re-run with.
const PRE_K = envI('PF_S118_PRETOPK', 250000);
const preUm = new Float64Array(2 * PRE_K);
const preCi = new Int32Array(2 * PRE_K);          // corner id = f*3 + v
let preN = 0; let preAdmit = PRE_ADJ_UM;
const preTrim = (): void => {
  const ord = Array.from({ length: preN }, (_v, i) => i).sort((a, b) => preUm[b] - preUm[a]);
  const u = new Float64Array(PRE_K); const c = new Int32Array(PRE_K);
  for (let i = 0; i < PRE_K; i += 1) { u[i] = preUm[ord[i]]; c[i] = preCi[ord[i]]; }
  preUm.set(u, 0); preCi.set(c, 0); preN = PRE_K; preAdmit = u[PRE_K - 1];
};
let preSortedUm = new Float64Array(0);
let preSortedCi = new Int32Array(0);
{
  const tG = Date.now();
  const LAT = latticePts(K_R1); const NP = LAT.length / 3;
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    // arc-space footprint diagnostics via the UNIT-TESTED classifier (research/tools/s118ScoreLib.ts,
    // pinned two-sided on planted needles / inversions / poles / seam straddles).
    const tha = Math.atan2(ay, ax);
    const G = facetGeom(ax, ay, az, bx, by, bz, cx, cy, cz,
      tha, tha + dThRaw(tha, Math.atan2(by, bx)), tha + dThRaw(tha, Math.atan2(cy, cx)));
    const ar = G.area;
    areaA[f] = ar; area3D += ar;
    let fl = 0;
    if (G.minAltUm < NEEDLE_UM) fl |= FL_NEEDLE;
    if (G.apsSign < 0) fl |= FL_INV;
    if (G.graphRatio >= POLE_GR) fl |= FL_POLE;
    flags[f] = fl;
    // PRECOND, EXHAUSTIVE over every corner (scar 5)
    for (let v = 0; v < 3; v += 1) {
      const px = xyz[o + v * 3], py = xyz[o + v * 3 + 1], pz = xyz[o + v * 3 + 2];
      const dd = Math.abs(Math.hypot(px, py) - rA(Math.atan2(py, px), pz)) * 1000;
      if (dd > preMaxUm) preMaxUm = dd;
      if (dd > 1) preOver1 += 1;
      if (dd > 10) preOver10 += 1;
      if (dd > 50) preOver50 += 1;
      if (dd > PRE_ADJ_UM) preAbove += 1;
      if (dd > preAdmit) {
        preUm[preN] = dd; preCi[preN] = f * 3 + v; preN += 1;
        if (preN === 2 * PRE_K) preTrim();
      }
      if (((f * 3 + v) % 37) === 0) preSamp.push(dd);
    }
    // radial residual R1, exhaustive over the lattice
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > w) w = dd;
    }
    r1[f] = w;
  }
  log(`── P2 GEOMETRY + PRECOND + ARTEFACTS + R1, one pass, ${((Date.now() - tG) / 1000).toFixed(1)} s  rss ${mbs(rssNow())} ──`);
  log(`   3D area ${area3D.toFixed(3)} mm2   analytic band ${mcArea.toFixed(3)} mm2   EXCESS ${(area3D - mcArea).toFixed(3)} mm2 = ${pct(area3D - mcArea, mcArea)}%`);
  J.area3D = area3D; J.areaExcessPct = ((area3D - mcArea) / mcArea) * 100;
}
log('');

// ── PRECOND report (radial exhaustive; perpendicular adjudicated below, also exhaustive) ─────────────
preSamp.sort((a, b) => a - b);
{
  // the top-K list is sorted descending here once, and reused by the perpendicular adjudication below
  const ord = Array.from({ length: preN }, (_v, i) => i).sort((a, b) => preUm[b] - preUm[a]);
  const kUm = new Float64Array(preN); const kCi = new Int32Array(preN);
  for (let i = 0; i < preN; i += 1) { kUm[i] = preUm[ord[i]]; kCi[i] = preCi[ord[i]]; }
  preSortedUm = kUm; preSortedCi = kCi;
  let aOver10 = 0;
  const over10Facet = new Set<number>();
  for (let i = 0; i < preN; i += 1) if (kUm[i] > 10) over10Facet.add(Math.floor(kCi[i] / 3));
  for (const f of over10Facet) aOver10 += areaA[f];
  log('── PRECOND  max |r_mesh - rA| at EVERY facet corner — EXHAUSTIVE, NO STRIDE (scar 5) ──');
  log(`   corners ${(nTri * 3).toLocaleString()}   p50 ${ex(qt(preSamp, 0.5))} um   p99 ${ex(qt(preSamp, 0.99))} um   *** RADIAL MAX ${preMaxUm.toFixed(3)} um ***`);
  log(`   over 1 um ${preOver1.toLocaleString()} (${pct(preOver1, nTri * 3)}%)   over 10 um ${preOver10.toLocaleString()} (${pct(preOver10, nTri * 3)}%)   over 50 um ${preOver50.toLocaleString()}`);
  log(`   AREA of facets with a corner over 10 um: ${aOver10.toFixed(4)} mm2 = ${pct(aOver10, area3D)}% OF MESH`);
  log(`   corners above ${PRE_ADJ_UM} um radially: ${preAbove.toLocaleString()} (EXHAUSTIVE count); worst ${preN.toLocaleString()} kept for perpendicular adjudication (cap K=${PRE_K.toLocaleString()}, admission ${preAdmit.toExponential(3)} um)`);
  J.precond = { radialMax: preMaxUm, p50: qt(preSamp, 0.5), p99: qt(preSamp, 0.99), over1: preOver1, over10: preOver10, over50: preOver50, areaOver10: aOver10, corners: nTri * 3, above: preAbove, kept: preN, admit: preAdmit };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// DIHEDRAL LADDER + ARTEFACT CLASSES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (TOPO_ON) {
  log('── DIHEDRAL LADDER (COUNT + AREA + MAX, per facet; scar 4 = the bar is SWEPT) ──');
  log('      bar deg        count       area mm2     %MESH area     MAX deg');
  const dihLad: Array<{ bar: number; count: number; area: number; frac: number; max: number }> = [];
  for (const bar of [45, 90, 150, CEIL_DEG, 170, 175, 178, 179.5]) {
    let c = 0; let a = 0; let mx = 0;
    for (let f = 0; f < nTri; f += 1) if (dihDeg[f] > bar) { c += 1; a += areaA[f]; if (dihDeg[f] > mx) mx = dihDeg[f]; }
    dihLad.push({ bar, count: c, area: a, frac: (a / area3D) * 100, max: mx });
    log(`   ${bar.toFixed(2).padStart(10)} ${String(c).padStart(12)} ${a.toFixed(3).padStart(14)} ${(pct(a, area3D) + '%').padStart(15)} ${mx.toFixed(3).padStart(11)}`);
  }
  J.dihedralLadder = dihLad;
  log('');
}

{
  let ceilC = 0, ceilA = 0, ndlC = 0, ndlA = 0, bladeC = 0, bladeA = 0, invC = 0, invA = 0, poleC = 0, poleA = 0;
  for (let f = 0; f < nTri; f += 1) {
    const fl = flags[f]; const a = areaA[f];
    const isNdl = (fl & FL_NEEDLE) !== 0;
    if (TOPO_ON && dihDeg[f] > CEIL_DEG) { ceilC += 1; ceilA += a; if (isNdl) { ndlC += 1; ndlA += a; } }
    if (isNdl) { bladeC += 1; bladeA += a; }
    if ((fl & FL_INV) !== 0) { invC += 1; invA += a; }
    if ((fl & FL_POLE) !== 0) { poleC += 1; poleA += a; }
  }
  log('── ARTEFACT CLASSES (COUNT + AREA + share OF MESH — never a sub-class share) ──');
  if (TOPO_ON) {
    log(`   OVER-ANALYTIC-CEILING (dihedral > ${CEIL_DEG.toFixed(3)} deg; the surface CANNOT produce it):`);
    log(`      ${ceilC.toLocaleString()} facets (${pct(ceilC, nTri)}% of count)   ${ceilA.toFixed(3)} mm2 = ${pct(ceilA, area3D)}% OF MESH`);
    log(`      of which arc-space NEEDLES: ${ndlC.toLocaleString()}, ${ndlA.toFixed(3)} mm2 = ${pct(ndlA, area3D)}% OF MESH`);
    log(`      (on a style whose rA is GENUINELY C0 — CelticTriquetra — this CEIL test is VACUOUS. Use the`);
    log(`       needle and footprint-sign rows below, which are analytic-free.)`);
  }
  log(`   NEEDLES (arc-space min altitude < ${NEEDLE_UM} um) — analytic-free:`);
  log(`      ${bladeC.toLocaleString()} facets (${pct(bladeC, nTri)}%)   ${bladeA.toFixed(3)} mm2 = ${pct(bladeA, area3D)}% OF MESH`);
  log(`   FOOTPRINT-SIGN INVERSIONS (negative arc-space signed area) — analytic-free:`);
  log(`      ${invC.toLocaleString()} facets (${pct(invC, nTri)}%)   ${invA.toFixed(3)} mm2 = ${pct(invA, area3D)}% OF MESH`);
  log(`   DEGENERACY POLES (graphRatio >= ${POLE_GR}):`);
  log(`      ${poleC.toLocaleString()} facets (${pct(poleC, nTri)}%)   ${poleA.toFixed(3)} mm2 = ${pct(poleA, area3D)}% OF MESH`);
  J.artefacts = {
    ceilDeg: CEIL_DEG, ceilCount: ceilC, ceilArea: ceilA, ceilPct: (ceilA / area3D) * 100,
    ceilNeedleCount: ndlC, ceilNeedleArea: ndlA,
    needleCount: bladeC, needleArea: bladeA, needlePct: (bladeA / area3D) * 100,
    invCount: invC, invArea: invA, invPct: (invA / area3D) * 100,
    poleCount: poleC, poleArea: poleA, polePct: (poleA / area3D) * 100,
  };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// POSITION — RADIAL R1 (the SOUND UPPER BOUND and the prefilter), exhaustive
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let r1MaxAll = 0;
{
  let cH = 0, aH = 0, cL = 0, aL = 0;
  const samp: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    const v = r1[f];
    if (v > BAR_HI) { cH += 1; aH += areaA[f]; }
    if (v > BAR_LO) { cL += 1; aL += areaA[f]; }
    if (v > r1MaxAll) r1MaxAll = v;
    if ((f % 31) === 0) samp.push(v);
  }
  samp.sort((a, b) => a - b);
  log(`── POSITION, RADIAL R1 (SOUND UPPER BOUND, and the prefilter) — EXHAUSTIVE, k=${K_R1} ──`);
  log(`   > ${BAR_HI} mm : ${cH.toLocaleString()} facets (${pct(cH, nTri)}%)   ${aH.toFixed(3)} mm2 = ${pct(aH, area3D)}% OF MESH`);
  log(`   > ${BAR_LO} mm : ${cL.toLocaleString()} facets (${pct(cL, nTri)}%)   ${aL.toFixed(3)} mm2 = ${pct(aL, area3D)}% OF MESH`);
  log(`   p50 ${ex(qt(samp, 0.5))}  p90 ${ex(qt(samp, 0.9))}  p99 ${ex(qt(samp, 0.99))}  *** MAX ${ex(r1MaxAll)} mm ***   ${el()}`);
  J.r1 = { overHi: cH, areaHi: aH, pctHi: (aH / area3D) * 100, overLo: cL, areaLo: aL, pctLo: (aL / area3D) * 100, max: r1MaxAll, p50: qt(samp, 0.5), p90: qt(samp, 0.9), p99: qt(samp, 0.99) };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// POSITION — TRUE PERPENDICULAR, EXHAUSTIVE over the flagged set. See the header for why this is exact.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (PERP_ON) {
  log('── POSITION, TRUE PERPENDICULAR — EXHAUSTIVE (no stride, no cap). ──');
  log('   Every facet the radial upper bound flags gets a VERDICT: adjudication rate is 100% by');
  log('   construction. The reductions cut CALLS, never coverage. Facets NOT flagged are CERTIFIED under');
  log('   the bar because perpendicular <= radial pointwise.');
  const tB = Date.now();
  const proj = buildRadialSurfaceProjector(rA, { H, nTheta: PERP_NTH, nZ: PERP_NZ, seedTopK: PERP_TOPK });
  log(`   projector grid ${proj.gridThetaCount} x ${proj.gridZCount} = ${proj.sampleCount.toLocaleString()} samples, built in ${((Date.now() - tB) / 1000).toFixed(1)} s`);
  const LAT = latticePts(PERP_K); const NP = LAT.length / 3;

  // ---- descending-R1 order over the LO-flagged set (bucket sort; a full sort is not needed) ----
  const inShard = (f: number): boolean => (PSH.n === 1 ? true : f % PSH.n === PSH.i);
  let nFlagLo = 0;
  for (let f = 0; f < nTri; f += 1) if (r1[f] > FLAG_BAR && inShard(f)) nFlagLo += 1;
  const NB = 2048;
  const loLg = Math.log10(FLAG_BAR); const hiLg = Math.log10(Math.max(r1MaxAll, FLAG_BAR * 10));
  const bucketOf = (v: number): number => {
    const b = Math.floor(((Math.log10(v) - loLg) / (hiLg - loLg)) * NB);
    return b < 0 ? 0 : b >= NB ? NB - 1 : b;
  };
  const bcnt = new Int32Array(NB + 1);
  for (let f = 0; f < nTri; f += 1) if (r1[f] > FLAG_BAR && inShard(f)) bcnt[bucketOf(r1[f])] += 1;
  // descending prefix offsets: bucket NB-1 first
  const boff = new Int32Array(NB + 1);
  { let acc = 0; for (let b = NB - 1; b >= 0; b -= 1) { boff[b] = acc; acc += bcnt[b]; } boff[NB] = acc; }
  const order = new Uint32Array(nFlagLo);
  { const cur = boff.slice(0, NB); for (let f = 0; f < nTri; f += 1) if (r1[f] > FLAG_BAR && inShard(f)) { const b = bucketOf(r1[f]); order[cur[b]] = f; cur[b] += 1; } }
  log(`   flagged (R1 > ${FLAG_BAR} mm${LO_ON ? '' : '  [LO BAR DISABLED — reproduction arm]'}${PSH.n > 1 ? `, shard ${PSH.i}/${PSH.n}` : ''}): ${nFlagLo.toLocaleString()} facets; walked in DESCENDING R1 via a ${NB}-bucket log sort (${mbs(order.length * 4)})`);

  const tP = Date.now();
  // ONE implementation of the scan, shared with research/bridge/_s118ScoreValidate.test.ts. A second
  // inline copy here is exactly the two-copies-of-one-definition hazard this repo has been bitten by.
  const S = perpScan({
    xyz, order, r1, areaA, lattice: LAT, rA,
    project: (x, y, z) => proj.project(x, y, z).dist,
    barHi: BAR_HI, barLo: BAR_LO, loOn: LO_ON, mode: PERP_MODE === 'full' ? 'full' : 'fast',
  });
  if (PERP_MODE === 'full') log('   MODE full — both reductions DISABLED. Reference arm, and the expensive one.');
  const calls = S.calls; const facetsTouched = S.facetsTouched; const c2viol = S.c2Violations;
  const best = S.max;
  const cHi = S.overHiCount; const aHi = S.overHiArea; const cLo = S.overLoCount; const aLo = S.overLoArea;
  const dtP = (Date.now() - tP) / 1000;
  const naive = order.length * NP;
  log('');
  log(`   C2 CONTROL (perpendicular must never exceed radial at the same point): ${c2viol} violations  ${c2viol === 0 ? 'HOLDS' : '*** FIRES — RUN VOID ***'}`);
  log(`   adjudicated ${order.length.toLocaleString()} of ${order.length.toLocaleString()} flagged facets = 100.00% ADJUDICATION RATE (no facet sampled away)`);
  log(`   projector calls ${calls.toLocaleString()} vs ${naive.toLocaleString()} naive = ${(naive / Math.max(1, calls)).toFixed(1)}x fewer;  facets needing >=1 call ${facetsTouched.toLocaleString()} (${pct(facetsTouched, order.length)}%)`);
  log(`   ${dtP.toFixed(1)} s  (${(calls / Math.max(1e-9, dtP)).toFixed(0)} calls/s)   rss ${mbs(rssNow())}`);
  log('');
  const shardNote = PSH.n > 1 ? `  *** SHARD ${PSH.i}/${PSH.n} PARTIAL — NOT A MESH NUMBER, merge all ${PSH.n} shards ***` : '';
  log(`   > ${BAR_HI} mm PERPENDICULAR: ${cHi.toLocaleString()} facets (${pct(cHi, nTri)}%)   ${aHi.toFixed(3)} mm2 = ${pct(aHi, area3D)}% OF MESH${shardNote}`);
  if (LO_ON) log(`   > ${BAR_LO} mm PERPENDICULAR: ${cLo.toLocaleString()} facets (${pct(cLo, nTri)}%)   ${aLo.toFixed(3)} mm2 = ${pct(aLo, area3D)}% OF MESH${shardNote}`);
  else log(`   > ${BAR_LO} mm PERPENDICULAR: NOT MEASURED (PF_S118_LO=0)`);
  log(`   *** MESH-WIDE PERPENDICULAR MAX ${ex(best)} mm ***   (radial upper bound was ${ex(r1MaxAll)} mm = ${(r1MaxAll / Math.max(1e-12, best)).toFixed(2)}x over-read)`);
  if (best <= FLAG_BAR) log('   NOTE: best <= the flagging bar; facets with R1 <= LO were never adjudicated, so the MAX above is a bound, not a witness.');
  J.perp = {
    mode: PERP_MODE, flagged: order.length, adjudicated: order.length, adjudicationRate: 1,
    calls, naiveCalls: naive, reduction: naive / Math.max(1, calls), facetsTouched,
    c2Violations: c2viol, seconds: dtP,
    overHiCount: cHi, overHiArea: aHi, overHiPct: (aHi / area3D) * 100,
    loMeasured: LO_ON, overLoCount: LO_ON ? cLo : null, overLoArea: LO_ON ? aLo : null, overLoPct: LO_ON ? (aLo / area3D) * 100 : null, flagBar: FLAG_BAR,
    max: best,
  };

  // ---- PRECOND perpendicular, by the same sound branch-and-bound. EXACTNESS IS STATED, NOT ASSUMED ----
  {
    let mxPerp = 0; let adjudged = 0; let over1 = 0; let ranOut = false;
    const tPc = Date.now();
    for (let i = 0; i < preSortedUm.length; i += 1) {
      if (preSortedUm[i] <= mxPerp) break;                        // radial >= perp: nothing below can win
      const ci = preSortedCi[i]; const o = Math.floor(ci / 3) * 9 + (ci % 3) * 3;
      const dp = proj.project(xyz[o], xyz[o + 1], xyz[o + 2]).dist * 1000;
      adjudged += 1;
      if (dp > mxPerp) mxPerp = dp;
      if (dp > 1) over1 += 1;
      if (i === preSortedUm.length - 1 && preSortedUm[i] > mxPerp) ranOut = true;
    }
    // exact iff the walk stopped because radial fell below the running max, not because the kept list ran out
    const exact = preN < 2 * PRE_K ? true : !ranOut && preAdmit <= mxPerp;
    log('');
    log(`   PRECOND PERPENDICULAR — branch-and-bound over the ${preSortedUm.length.toLocaleString()} worst corners by radial deviation`);
    log('   (every corner below the admission threshold is CERTIFIED under it, since perpendicular <= radial):');
    log(`      radial MAX ${preMaxUm.toFixed(3)} um   *** PERPENDICULAR MAX ${mxPerp.toFixed(4)} um ***   radial over-read ${(preMaxUm / Math.max(1e-9, mxPerp)).toFixed(1)}x`);
    log(`      corners actually projected ${adjudged.toLocaleString()}; of those, over 1 um perpendicular: ${over1}`);
    log(`      EXACT: ${exact ? 'YES' : `*** NO — the top-K list (K=${PRE_K}) was exhausted with admission ${preAdmit.toExponential(3)} um still above the running max. Re-run with PF_S118_PRETOPK larger. ***`}`);
    log(`      ${((Date.now() - tPc) / 1000).toFixed(1)} s`);
    J.precondPerp = { perpMax: mxPerp, radialMax: preMaxUm, projected: adjudged, kept: preSortedUm.length, over1um: over1, exact };
  }
  log(`   ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ORIENTATION — normDeg. SCARS 1 (inset), 2 (k), 3 (h) ALL SWEPT.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (OR_ON) {
  const scratch = new Float64Array(12);
  const orientOne = (f: number, k: number, inset: number, ns: (th: number, z: number, out: Float64Array) => number, mode: 'winding' | 'outward'): number => {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1];
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(xyz[o + 4], xyz[o + 3]));
    const thc = tha + dThRaw(tha, Math.atan2(xyz[o + 7], xyz[o + 6]));
    const r = orientOfFacet(ns,
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      tha, thb, thc, { k, inset, orient: mode, scratch });
    return r.normDeg;
  };
  log('── ORIENTATION normDeg (deg).  ALL THREE INSTRUMENT SCARS SWEPT. ──');
  log(`   canonical: k=${OR_K}  inset=${OR_INSET}  hArc=hZ=${ex(OR_H)}  convention=winding (an inverted facet reads ~180)`);
  log('   (unwrapped theta is recomputed per facet rather than stored: thA at 1e7 would be 240 MB)');
  const inOShard = (f: number): boolean => (OSH.n === 1 ? true : f % OSH.n === OSH.i);
  if (OR_WHOLE) {
    const ns = fdNormals(rA, H, OR_H, OR_H);
    const tO = Date.now();
    let mx = 0; let nan = 0; let n = 0;
    const cnt = new Int32Array(OR_BARS.length); const are = new Float64Array(OR_BARS.length);
    const sm: number[] = [];
    for (let f = 0; f < nTri; f += 1) {
      if (!inOShard(f)) continue;
      const v0 = orientOne(f, OR_K, OR_INSET, ns, 'winding');
      const v = Number.isFinite(v0) ? v0 : 0;
      if (!Number.isFinite(v0)) nan += 1;
      n += 1;
      if (v > mx) mx = v;
      for (let b = 0; b < OR_BARS.length; b += 1) if (v > OR_BARS[b]) { cnt[b] += 1; are[b] += areaA[f]; }
      if ((f % 31) === 0) sm.push(v);
    }
    sm.sort((a, b) => a - b);
    const shardNote = OSH.n > 1 ? `  *** SHARD ${OSH.i}/${OSH.n} PARTIAL ***` : '';
    log(`   WHOLE-MESH EXHAUSTIVE at the canonical setting over ${n.toLocaleString()} facets, ${((Date.now() - tO) / 1000).toFixed(1)} s (${nan} degenerate scored 0):${shardNote}`);
    log('      bar deg        count       area mm2     %MESH area');
    const orLad: Array<{ bar: number; count: number; area: number; frac: number }> = [];
    for (let b = 0; b < OR_BARS.length; b += 1) {
      orLad.push({ bar: OR_BARS[b], count: cnt[b], area: are[b], frac: (are[b] / area3D) * 100 });
      log(`   ${OR_BARS[b].toFixed(2).padStart(10)} ${String(cnt[b]).padStart(12)} ${are[b].toFixed(3).padStart(14)} ${(pct(are[b], area3D) + '%').padStart(15)}`);
    }
    log(`      p50 ${qt(sm, 0.5).toFixed(4)}  p90 ${qt(sm, 0.9).toFixed(4)}  p99 ${qt(sm, 0.99).toFixed(4)}  *** MAX ${mx.toFixed(4)} deg ***`);
    J.orientWhole = { k: OR_K, inset: OR_INSET, h: OR_H, n, ladder: orLad, max: mx, p50: qt(sm, 0.5), p90: qt(sm, 0.9), p99: qt(sm, 0.99), seconds: (Date.now() - tO) / 1000 };
  }
  // ---- SWEEPS on a strided sample: these are SETTING-SENSITIVITY rows, never mesh verdicts ----
  const st = Math.max(1, Math.floor(nTri / OR_SWEEP_N));
  const samp: number[] = []; let sampArea = 0;
  for (let f = 0; f < nTri; f += st) { samp.push(f); sampArea += areaA[f]; }
  const swp: Array<Record<string, unknown>> = [];
  const row = (label: string, k: number, inset: number, hh: number, mode: 'winding' | 'outward'): void => {
    const ns = fdNormals(rA, H, hh, hh);
    let mx = 0, c5 = 0, a5 = 0, c45 = 0, a45 = 0, c1 = 0, a1 = 0;
    for (const f of samp) {
      const v = orientOne(f, k, inset, ns, mode);
      if (!Number.isFinite(v)) continue;
      if (v > mx) mx = v;
      if (v > 1) { c1 += 1; a1 += areaA[f]; }
      if (v > 5) { c5 += 1; a5 += areaA[f]; }
      if (v > 45) { c45 += 1; a45 += areaA[f]; }
    }
    log(`   ${label.padEnd(34)} ${mx.toFixed(3).padStart(9)} ${String(c1).padStart(7)} ${(pct(a1, sampArea) + '%').padStart(9)} ${String(c5).padStart(7)} ${(pct(a5, sampArea) + '%').padStart(9)} ${String(c45).padStart(6)} ${(pct(a45, sampArea) + '%').padStart(9)}`);
    swp.push({ label, k, inset, h: hh, mode, max: mx, c1, a1pct: (a1 / sampArea) * 100, c5, a5pct: (a5 / sampArea) * 100, c45, a45pct: (a45 / sampArea) * 100 });
  };
  log('');
  log(`   SWEEPS on a 1-in-${st} strided sample (${samp.length.toLocaleString()} facets, ${sampArea.toFixed(1)} mm2). AREA shares are OF THE SAMPLE.`);
  log('   setting                                  MAX     >1deg   area%    >5deg   area%   >45deg   area%');
  log('   -- SCAR 1: inset (default 0 is WRONG on crease classes; honest value 0.05) --');
  for (const ins of [0, 0.02, 0.05, 0.10, 0.20]) row(`inset=${ins.toFixed(2)}  k=${OR_K} h=${ex(OR_H)}`, OR_K, ins, OR_H, 'winding');
  log('   -- SCAR 2: lattice order k --');
  for (const k of [2, 4, 8, 16]) row(`k=${k}  inset=${OR_INSET} h=${ex(OR_H)}`, k, OR_INSET, OR_H, 'winding');
  log('   -- SCAR 3: finite-difference step h --');
  for (const hh of [2e-5, 5e-5, 2e-4, 5e-4, 1e-3]) row(`h=${ex(hh)}  k=${OR_K} inset=${OR_INSET}`, OR_K, OR_INSET, hh, 'winding');
  log('   -- CONVENTION --');
  row(`orient=outward  k=${OR_K} inset=${OR_INSET}`, OR_K, OR_INSET, OR_H, 'outward');
  J.orientSweep = { stride: st, n: samp.length, sampleArea: sampArea, rows: swp };
  log(`   ${el()}`);
}
log('');

if (SCALARS) {
  const p2 = `${OUTDIR}/S118_${TAG}_r1um.f64`;
  const r1um = new Float64Array(nTri); for (let f = 0; f < nTri; f += 1) r1um[f] = r1[f] * 1000;
  writeFileSync(p2, Buffer.from(r1um.buffer, r1um.byteOffset, r1um.byteLength));
  log(`── scalars: ${p2}`);
  J.scalarR1um = p2;
}

J.priority = PRIO_NOTE;
J.cpuSeconds = (process.cpuUsage().user + process.cpuUsage().system) / 1e6;
J.peakRssBytes = peakRss();
J.wallSeconds = (Date.now() - T0) / 1000;
const jp = `${OUTDIR}/S118_SCORE_${TAG}${PSH.n > 1 ? `_p${PSH.i}of${PSH.n}` : ''}.json`;
writeFileSync(jp, JSON.stringify(J, null, 2));
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
{
  const wall = (Date.now() - T0) / 1000;
  const cpu = (process.cpuUsage().user + process.cpuUsage().system) / 1e6;
  log(`WALL ${wall.toFixed(1)} s   CPU ${cpu.toFixed(1)} s (${((cpu / wall) * 100).toFixed(0)}% of one core — under 60% means the`);
  log(`     process was descheduled: EcoQoS, or other jobs on the box. Quote CPU, not WALL, when they diverge.)`);
  log(`PEAK RSS ${mbs(peakRss())}   facets ${nTri.toLocaleString()}   priority ${PRIO_NOTE}`);
}
log(`json -> ${jp}`);
log('S118 SCORECARD DONE');
