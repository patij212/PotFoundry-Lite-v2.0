// s94ConeRemesh.ts — THE PRIZE IS A *REMESH* PRIZE. MEASURE IT WITH THE UNWIRED `M = g/h^2` KERNEL.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT S94's REFINEMENT ARM ESTABLISHED, AND WHY THIS FILE EXISTS
//
// Scoped to the SMOOTH-RELIEF class (slope <= 1.0, non-folded; 965 of 2000 golden-stride Gothic parents
// = 48.25% by count / ~85% by area), measured on the same parents with the same covering ruler:
//
//     lepp longest-edge bisection   3.120x   0.000% uncleared     <- the operator the campaign has
//     cone k-way, k from coneUB     4.211x   0.000% uncleared     <- 1.350x WORSE. H1 REFUTED.
//     red  1->4                     4.420x   0.000% uncleared
//     FREE-PLACEMENT ideal on lepp's own leaves            1.615x <- 1.93x BELOW lepp
//
// The cone is not better INFORMATION than the measured chord LEPP already stops on, and a k-way split
// imposes the parent's worst-case k on all k^2 children at once, so it loses the granularity race to
// bisection. *** THE 1.93x THAT IS LEFT ON THE TABLE IS NOT REACHABLE BY ANY SUBDIVISION OPERATOR: it is
// the difference between HALVING what exists and GENERATING an element at the admissible size. ***
//
// That is exactly what `buildInhouseMetricMesh` + `buildSurfaceMetricField` (`M = g/h3D^2`) do, and they
// are UNWIRED. Their chord mode already implements the right sizing law: `h3D = sqrt(8*tol/kappa_max)`.
// S93 decoded the 10 um ORIENTATION CHORD bar to a 1.25 um POSITION bar (`chord/witnessed` p50 = 8.03,
// and analytically `chord ~ 8*sag` because `turn ~ d*kappa` while `sag ~ d^2*kappa/8`). So:
//
//     to meet the 10 um orientation chord bar, run the EXISTING chord mode at  tolMm = 10um/8 = 0.00125
//
// No new sizing law is needed for the CHORD bar. (An ANGLE bar would need `h = theta*/kappa`, a different
// exponent the kernel does not have — stated as a gap, not built here.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED HYPOTHESIS AND KILL LINE  (written before the first run)
//
//   H4: a REMESH under `M = g/h3D^2` reaches the 10 um orientation CHORD bar at FEWER triangles than the
//       best refinement operator (lepp, 3.120x scoped / 10.822x unscoped-and-failing), scored by the SAME
//       covering ruler on the SAME analytic surface.
//   *** KILL: the remesh needs >= lepp's triangle count at equal residual over-bar AREA, OR it cannot
//       reach 0.05% over-bar AREA at all. ***
//   SHAPE GUARD: report the leaf minAngle distribution. A remesh that wins on count and loses on shape
//       is not a win in this project.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS — this is a ONE-METRIC-BOTH-MESHES comparison and it only means anything if they are the same
//   * SAME analytic surface: `buildRadiusFn('GothicArches', registryDefaults, {H:120,Rb:40,Rt:50})` — the
//     identical construction `frontierRefine`/`frontierTaxonomy`/`s94ConeRefine` use on the committed STL.
//   * SAME domain: the STL spans z in [0,120] and the full theta turn; the kernel meshes (u,t) in [0,1]^2
//     with theta = TAU*u, z = t*H. TOTAL AREA is printed for both — if they differ the comparison is void.
//   * SAME ruler: the covering construction (k=8, inset 0.02, sup over an order-k barycentric lattice,
//     central-difference surface normals). No centroid samples.
//   * VERTEX-ON-SURFACE: the remesh's vertices are lifted from (u,t) by construction, so the residual is
//     0 by definition; the STL's is 2.074e-2 um (measured). Both meshes inscribe the SAME surface.
//   * NON-VACUITY: at a LOOSE tol the remesh must be OVER the bar. A sweep that is under bar everywhere
//     proves nothing.
//
// Usage: bash research/tools/run-s94-cone-remesh.sh
//   env: PF_S94M_TOLS("0.02,0.01,0.005,0.0025,0.00125") PF_S94M_N(20000) PF_S94M_SIZERES(160)
//        PF_S94M_GRADE(0.2) PF_S94M_MAXPOINTS(4000000) PF_S94M_HMIN PF_S94M_HMAX PF_S94M_STYLE
import { mkdirSync, appendFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildInhouseMetricMesh } from '../bridge/inhouseMetricMesh';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const TAU = 2 * Math.PI;

const STYLE = process.env.PF_S94M_STYLE ?? 'GothicArches';
const STL = process.env.PF_S94M_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S94M_TAG ?? 'GOTH';
const TOLS = (process.env.PF_S94M_TOLS ?? '0.02,0.01,0.005,0.0025,0.00125').split(',').map(Number).filter((x) => x > 0);
const NSAMP = Math.round(envF('PF_S94M_N', 20000));
const K = Math.round(envF('PF_S94M_K', 8));
const INSET = envF('PF_S94M_INSET', 0.02);
const BAR_UM = envF('PF_S94M_BAR_UM', 10);
const ANGBAR = envF('PF_S94M_ANGBAR', 1);
const SIZERES = Math.round(envF('PF_S94M_SIZERES', 160));
const GRADE = envF('PF_S94M_GRADE', 0.2);
const MAXPOINTS = Math.round(envF('PF_S94M_MAXPOINTS', 4_000_000));
const MAXROUNDS = Math.round(envF('PF_S94M_MAXROUNDS', 60));
const SWEEPS = Math.round(envF('PF_S94M_SWEEPS', 6));
const FINESTEP = envF('PF_S94M_FINESTEP', 0);
const SUBS = Math.round(envF('PF_S94M_SUBS', 3));
const CHORDTOL = envF('PF_S94M_CHORDTOL', 0);
const HMIN = envF('PF_S94M_HMIN', 0.002);
const HMAX = envF('PF_S94M_HMAX', 2.0);
const DIMS: StyleDims = { H: envF('PF_S94M_H', 120), Rb: envF('PF_S94M_RB', 40), Rt: envF('PF_S94M_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/frontier';
const NDJ = `${OUTDIR}/S94_REMESH_${TAG}.ndjson`;

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

const T0 = Date.now();
mkdirSync(OUTDIR, { recursive: true });
log('===== S94 CONE REMESH — `M = g/h^2` REMESH vs THE BEST REFINEMENT OPERATOR, ONE RULER, ONE SURFACE =====');
log(`style ${STYLE}   tag ${TAG}   chord bar ${BAR_UM} um   angle bar ${ANGBAR} deg`);
log(`covering ruler k=${K} inset=${INSET} (${((K + 1) * (K + 2)) / 2} pts/facet). NO centroid samples.`);
log(`kernel: buildInhouseMetricMesh  sizeRes ${SIZERES}  gradeBeta ${GRADE}  hMin ${HMIN}  hMax ${HMAX}  maxPoints ${MAXPOINTS}  sweeps ${SWEEPS}`);
log(`tol sweep (mm): ${TOLS.join(', ')}       [10 um orientation chord bar == a ${(BAR_UM / 8000).toFixed(5)} mm position tol, S93 o/w p50 = 8.03]`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

// ── the covering lattice ──
const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const scl = INSET / 3;
  let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + scl; const b = sh * (j / K) + scl;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}
const HARC = 2e-4; const HZ = 2e-4;

interface Sc { chordUm: number; angDeg: number; area: number; minAng: number }
function score(px: number[], py: number[], pz: number[], pth: number[]): Sc {
  const ax = px[0]; const ay = py[0]; const az = pz[0];
  const bx = px[1]; const by = py[1]; const bz = pz[1];
  const cx = px[2]; const cy = py[2]; const cz = pz[2];
  const eA = Math.hypot(bx - cx, by - cy, bz - cz);
  const eB = Math.hypot(ax - cx, ay - cy, az - cz);
  const eC = Math.hypot(ax - bx, ay - by, az - bz);
  const diam = Math.max(eA, eB, eC);
  const lo = Math.min(eA, eB, eC); const mi = eA + eB + eC - lo - diam;
  const cm = (mi * mi + diam * diam - lo * lo) / Math.max(1e-300, 2 * mi * diam);
  const minAng = (Math.acos(Math.max(-1, Math.min(1, cm))) * 180) / Math.PI;
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const area = 0.5 * fl;
  if (!(fl > 0)) return { chordUm: 0, angDeg: 0, area: 0, minAng: 0 };
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  let best = -1;
  for (let p = 0; p < LP; p += 1) {
    const th = wA[p] * pth[0] + wB[p] * pth[1] + wC[p] * pth[2];
    const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const r0 = rA(th, zz);
    const hTh = HARC / Math.max(1e-9, Math.abs(r0));
    let zLo = zz - HZ; let zHi = zz + HZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
    const rt = (rA(th + hTh, zz) - rA(th - hTh, zz)) / (2 * hTh);
    const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
    const cs = Math.cos(th); const sn = Math.sin(th);
    let vx = rt * sn + r0 * cs; let vy = r0 * sn - rt * cs; let vz = -r0 * rz;
    const L = Math.hypot(vx, vy, vz) || 1; vx /= L; vy /= L; vz /= L;
    let d = fx * vx + fy * vy + fz * vz; d = d > 1 ? 1 : d < -1 ? -1 : d;
    const a = Math.acos(d);
    if (a > best) best = a;
  }
  return { chordUm: 2 * Math.sin(0.5 * best) * diam * 1000, angDeg: (best * 180) / Math.PI, area, minAng };
}

function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}

// ── THE BASELINE, scored by the same ruler on the same sample construction ──
let stlTris = 0; let stlAreaPerFacet = 0; let stlOverArea = 0; let stlAngOverArea = 0;
let stlSampArea = 0; let stlMinAngSum = 0; let stlMinAngMin = 180;
{
  const M = readMeshFloat64(STL, false);
  stlTris = M.nTri;
  const id = goldenIdx(M.nTri, NSAMP);
  for (let q = 0; q < id.length; q += 1) {
    const o = id[q] * 9;
    const thA = Math.atan2(M.xyz[o + 1], M.xyz[o]);
    const thB = thA + dThRaw(thA, Math.atan2(M.xyz[o + 4], M.xyz[o + 3]));
    const thC = thA + dThRaw(thA, Math.atan2(M.xyz[o + 7], M.xyz[o + 6]));
    const s = score([M.xyz[o], M.xyz[o + 3], M.xyz[o + 6]], [M.xyz[o + 1], M.xyz[o + 4], M.xyz[o + 7]],
      [M.xyz[o + 2], M.xyz[o + 5], M.xyz[o + 8]], [thA, thB, thC]);
    stlSampArea += s.area;
    if (s.chordUm > BAR_UM) stlOverArea += s.area;
    if (s.angDeg > ANGBAR) stlAngOverArea += s.area;
    stlMinAngSum += s.minAng * s.area; if (s.minAng < stlMinAngMin) stlMinAngMin = s.minAng;
  }
  stlAreaPerFacet = stlSampArea / id.length;
  log('');
  log('── BASELINE: the committed flag-OFF STL, same ruler, same golden-stride construction ──');
  log(`   ${stlTris} facets   sampled ${id.length}   over-bar CHORD AREA ${((100 * stlOverArea) / stlSampArea).toFixed(3)}%   over-${ANGBAR}deg ANGLE AREA ${((100 * stlAngOverArea) / stlSampArea).toFixed(3)}%`);
  log(`   est TOTAL surface area ${(stlAreaPerFacet * stlTris).toFixed(2)} mm^2   mean minAngle ${(stlMinAngSum / stlSampArea).toFixed(1)} deg, worst ${stlMinAngMin.toFixed(2)}`);
  log(`   ANCHORS to beat (same STL, s94ConeRefine): lepp 3.120x SCOPED / 10.822x UNSCOPED-and-28.8%-uncleared; free-placement ideal 1.615x scoped`);
}

log('');
log('── THE REMESH SWEEP ──');
log('  tolMm      points     tris      x flagOFF   over-chordAREA%   over-angAREA%   minAngle mean/worst   totalArea mm^2   rounds  budget  secs');
for (const tol of TOLS) {
  const t1 = Date.now();
  let mesh;
  try {
    mesh = buildInhouseMetricMesh(rA, H, {
      tolMm: tol, hMin: HMIN, hMax: HMAX, sizeRes: SIZERES, gradeBeta: GRADE,
      maxPoints: MAXPOINTS, maxRounds: MAXROUNDS, optimizeSweeps: SWEEPS,
      // OPT-IN kernel knobs, DEFAULT OFF here so the plain `M = g/h^2` chord mode is what is measured
      // first. `curvatureFineStep` resolves a sub-cell ridge the sizeRes grid aliases 5-10x (the
      // documented crest-straddle root cause); `chordTolMm` is a DIRECT facet->surface sag guard that
      // catches whatever the grid metric still misses. Both are the kernel's own documented remedies —
      // if the plain run leaves residual over-bar area, they are the named next lever, not a new idea.
      curvatureFineStep: FINESTEP > 0 ? FINESTEP : undefined,
      curvatureSubsamples: FINESTEP > 0 ? SUBS : undefined,
      chordTolMm: CHORDTOL > 0 ? CHORDTOL : undefined,
      chordSampleN: CHORDTOL > 0 ? 8 : undefined,
    });
  } catch (e) {
    log(`  ${tol.toFixed(5).padStart(7)}   *** THREW: ${String(e).slice(0, 120)} ***`);
    appendFileSync(NDJ, `${JSON.stringify({ tol, error: String(e).slice(0, 200) })}\n`);
    continue;
  }
  const nT = mesh.indices.length / 3;
  const id = goldenIdx(nT, NSAMP);
  let sArea = 0; let oArea = 0; let aArea = 0; let mSum = 0; let mMin = 180; let residMax = 0;
  for (let q = 0; q < id.length; q += 1) {
    const o = id[q] * 3;
    const px: number[] = []; const py: number[] = []; const pz: number[] = []; const pth: number[] = [];
    for (let v = 0; v < 3; v += 1) {
      const vi = mesh.indices[o + v];
      const u = mesh.ut[2 * vi]; const t = mesh.ut[2 * vi + 1];
      const th = TAU * u; const z = t * H; const r = rA(th, z);
      px.push(r * Math.cos(th)); py.push(r * Math.sin(th)); pz.push(z); pth.push(th);
    }
    // unwrap theta against the first vertex, exactly as the STL path does
    pth[1] = pth[0] + dThRaw(pth[0], pth[1]); pth[2] = pth[0] + dThRaw(pth[0], pth[2]);
    const s = score(px, py, pz, pth);
    sArea += s.area;
    if (s.chordUm > BAR_UM) oArea += s.area;
    if (s.angDeg > ANGBAR) aArea += s.area;
    mSum += s.minAng * s.area; if (s.minAng < mMin) mMin = s.minAng;
    for (let v = 0; v < 3; v += 1) {
      const d = Math.abs(Math.hypot(px[v], py[v]) - rA(pth[v], pz[v]));
      if (d > residMax) residMax = d;
    }
  }
  const totArea = (sArea / id.length) * nT;
  const row = {
    tol, points: mesh.points, tris: nT, xFlagOff: nT / stlTris,
    overChordAreaPct: (100 * oArea) / sArea, overAngAreaPct: (100 * aArea) / sArea,
    minAngMean: mSum / sArea, minAngWorst: mMin, totalAreaMm2: totArea,
    rounds: mesh.rounds, hitBudget: mesh.hitBudget, vertResidUm: residMax * 1000,
    secs: (Date.now() - t1) / 1000,
  };
  // CHECKPOINT: append the row the instant it is computed, never only at the end.
  appendFileSync(NDJ, `${JSON.stringify(row)}\n`);
  log(`  ${tol.toFixed(5).padStart(7)}  ${String(mesh.points).padStart(9)}  ${String(nT).padStart(9)}   ${(nT / stlTris).toFixed(3).padStart(8)}x   ${row.overChordAreaPct.toFixed(4).padStart(15)}   ${row.overAngAreaPct.toFixed(4).padStart(13)}   ${row.minAngMean.toFixed(1).padStart(8)} / ${mMin.toFixed(2).padStart(5)}   ${totArea.toFixed(1).padStart(14)}   ${String(mesh.rounds).padStart(6)}  ${mesh.hitBudget ? 'HIT ' : '  ok'}  ${row.secs.toFixed(0).padStart(5)}`);
  if (residMax * 1000 > 1e-3) log(`     *** vertex-on-surface residual ${(residMax * 1000).toExponential(2)} um — the remesh is NOT on the same surface; row void ***`);
}
log('');
log(`rows -> ${NDJ}`);
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
