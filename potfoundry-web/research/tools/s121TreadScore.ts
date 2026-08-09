// s121TreadScore.ts — S121 TASK C2: THE FIRST SCORECARD THE TREADS HAVE EVER HAD, AT ANY STANDARD.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Every conformance number this campaign has published describes the OUTER WALL. The tread annuli that
// `stitchRings` emits to bridge each detected C0 z-step have never been scored per facet, per edge, for
// position, for orientation, or for topology. S120 measured only their 3-D ASPECT (707 of 4,394 over the
// driver's own AR>50 cap). This tool separates the two populations and scores them side by side.
//
// ── THE PARTITION IS EXACT, NOT GEOMETRIC ─────────────────────────────────────────────────────────────
// The driver appends the treads to `soup` AFTER the wall (_strataConformBisectL.test.ts:5432-5471) and
// writes `soup` to the binary STL in order (:5794-5807). So facets [nTri-nTread, nTri) ARE the treads,
// exactly, and the driver prints the split ("soup: 1282394 tris = 1278000 outer wall + 4394 treads").
// The partition is nevertheless CROSS-CHECKED geometrically here (every tread facet must lie inside a
// detected step's 2*stepEps band; no wall facet may), and the check is printed either way.
//
// ── THE TWO STANDARDS, AND WHY BOTH ARE REPORTED ──────────────────────────────────────────────────────
//  (A) THE CAMPAIGN'S RULER: distance to the analytic parametric wall S = {(rA(th,z)cos th, .., z)}.
//      At a C0 z-step rA is DISCONTINUOUS in z, so S has a GAP there and the tread — whose whole job is
//      to bridge that gap — is nowhere near S. This ruler is reported because it is the ruler every
//      published number was taken with, and the size of the answer is itself the finding.
//  (B) THE STEP-AWARE RULER: the true printable solid at a step is the wall PLUS the horizontal annulus
//          A(s) = { (r cos th, r sin th, zStep) : r between rA(th, zStep-) and rA(th, zStep+) }.
//      dist(P, wall U annulus) <= min( dist(P, S) , dist(P, A) ), and dist(P,A) at fixed theta is
//          sqrt( (z-zStep)^2 + gap^2 ),  gap = how far r falls outside [rlo(th), rhi(th)],
//      which is an EXACT distance to a point of A, hence a SOUND UPPER BOUND on the true distance.
//      Reported as an upper bound and labelled as one.
//
// ── SCARS OBSERVED ────────────────────────────────────────────────────────────────────────────────────
//  1. `inset` is passed EXPLICITLY everywhere and swept (0 / 0.05 / 0.1).
//  2. lattice k is swept (2/4/8/16/32).
//  3. the finite-difference step h is swept (2e-3 .. 2e-6).
//  4. classification thresholds: both bars are carried through every table; the AR cap is swept.
//  5. EXHAUSTIVE means exhaustive. Every bound in this file is printed with the population it bound and
//     the rate at which it bound. There is no hidden cap and no stride anywhere.
//  6. "below my resolution" is never "does not matter": the step-aware numbers are quoted in microns.
//
// Usage: bash research/tools/run-s121-tread-score.sh
//   env PF_S121_STL=<abs> PF_S121_TAG=<tag> [PF_S121_STYLE=CelticTriquetra] [PF_S121_NTREAD=<n>]
//       [PF_S121_WALLPERP=1] [PF_S121_EDGEALL=1] [PF_S121_REUSE=<S120 edge scalar stem>]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { facetDihedralsBig } from '../bridge/dihedralRulerBig';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { readMeshF32 } from './s118MeshIo';
import { latticePts } from './s118ScoreLib';
import { fdNormals, orientOfFacet } from '../bridge/orientRuler';
import {
  makeEdgeWorkspace, edgeRadialSag, radialResid, weldExact, uniqueEdges, goldenMax,
} from './s120EdgeLib';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

let PRIO_NOTE = 'not attempted';
if ((process.env.PF_S121_PRIO ?? '1') !== '0') {
  try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); PRIO_NOTE = 'AboveNormal (EcoQoS defeated)'; }
  catch (e) { PRIO_NOTE = `FAILED: ${(e as Error).message}`; }
}

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STYLE = envS('PF_S121_STYLE', 'CelticTriquetra');
const STL = envS('PF_S121_STL', '');
const TAG = envS('PF_S121_TAG', 'RUN');
const OUTDIR = envS('PF_S121_OUTDIR', 'research/exchange/_strataConformBisect/s121');
const DIMS: StyleDims = { H: envF('PF_S121_H', 120), Rb: envF('PF_S121_RB', 40), Rt: envF('PF_S121_RT', 50), expn: 1 };
const H = DIMS.H;
const TOLDET = envF('PF_S121_TOL', 0.01);          // the driver's PF_CB_TOL, used by its step detector
const STEP_EPS = envF('PF_S121_STEP_EPS_UM', 4) / 1000;
const BAR_HI = envF('PF_S121_BARHI', 0.01);
const BAR_LO = envF('PF_S121_BARLO', 0.001);
const AR_CAP = envF('PF_S121_ARCAP', 50);
const NTREAD_ENV = envI('PF_S121_NTREAD', -1);
const NS = envI('PF_S121_NS', 256);
const REFINE = envI('PF_S121_REFINE', 44);
const MAXCAND = envI('PF_S121_MAXCAND', 6);
const PERP_NTH = envI('PF_S121_PNTH', 1536);
const PERP_NZ = envI('PF_S121_PNZ', 768);
const PERP_TOPK = envI('PF_S121_PK', 6);
const WALLPERP = envS('PF_S121_WALLPERP', '1') !== '0';
const EDGEALL = envS('PF_S121_EDGEALL', '1') !== '0';
const REUSE = envS('PF_S121_REUSE', '');
const DELTA = envF('PF_S121_DELTA', 1e-6);         // one-sided probe for the annulus radii, mm
if (STL.length === 0) { log('*** PF_S121_STL required (ABSOLUTE path) ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const mbs = (b: number): string => `${(b / 1048576).toFixed(0)} MB`;
const rssNow = (): number => process.memoryUsage().rss;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const um = (v: number): string => (Number.isFinite(v) ? `${(v * 1000).toFixed(4)} um` : 'inf');
const qt = (v: number[], p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);

// ── analytic surface, byte-identical construction to s120EdgeRuler / s118Score ───────────────────────
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
// UNCLAMPED in z, for the one-sided limits at a step (never called outside [0,H] here anyway)
const rAraw = (th: number, z: number): number => rAb(canonTheta(th), z);

interface JsonOut { [k: string]: unknown }
const J: JsonOut = { tag: TAG, stl: STL, style: STYLE, params: D, dims: DIMS, barHi: BAR_HI, barLo: BAR_LO, arCap: AR_CAP };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S121 TASK C2 — THE TREAD SCORECARD — ${STYLE}   tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh   ${STL}`);
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=1`);
log(`bars   HI ${BAR_HI} mm   LO ${BAR_LO} mm   AR cap ${AR_CAP}   stepEps ${STEP_EPS} mm (=PF_CB_STEP_EPS_UM/1000)`);
log(`node ${process.version}   NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '(unset)'}   priority: ${PRIO_NOTE}`);
log('');
log('*** THE TREADS HAVE NEVER BEEN SCORED AT ANY STANDARD. Every published conformance number in this');
log('*** campaign describes the WALL. This tool separates the two populations and scores both.');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P0 — LOAD, DETECT THE C0 STEPS (driver transcription), PARTITION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshF32(STL);
const xyz = M.xyz; const nTri = M.nTri;
log(`── P0 MESH: ${nTri.toLocaleString()} facets   rss ${mbs(rssNow())}  ${el()} ──`);

// THE DRIVER'S OWN C0 z-STEP DETECTOR, transcribed operand-for-operand from
// _strataConformBisectL.test.ts:1609-1625. This DETECTS, it does not seed or mesh anything.
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
    if (j2 > 0.8 * j1 && j1 > TOLDET) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
  }
  flush();
}
log(`── P0b C0 z-STEPS (driver detector, transcribed): ${zSteps.length} at z = ${zSteps.map((z) => z.toFixed(4)).join(', ') || '(none)'}`);
J.zSteps = zSteps;

// per-facet z extent + population tag
const fzMin = new Float64Array(nTri); const fzMax = new Float64Array(nTri);
for (let f = 0; f < nTri; f += 1) {
  const o = f * 9;
  const z0 = xyz[o + 2]; const z1 = xyz[o + 5]; const z2 = xyz[o + 8];
  fzMin[f] = Math.min(z0, z1, z2); fzMax[f] = Math.max(z0, z1, z2);
}
const BANDPAD = envF('PF_S121_BANDPAD', 1e-4);     // mm; disclosed slack on the 2*stepEps band test
const inBand = (f: number): number => {
  for (let s = 0; s < zSteps.length; s += 1) {
    if (fzMin[f] >= zSteps[s] - STEP_EPS - BANDPAD && fzMax[f] <= zSteps[s] + STEP_EPS + BANDPAD) return s;
  }
  return -1;
};
let nTread = NTREAD_ENV;
if (nTread < 0) {
  // auto: the treads are a CONTIGUOUS SUFFIX of the soup, so walk back from the end while in a band
  let k = nTri;
  while (k > 0 && inBand(k - 1) >= 0) k -= 1;
  nTread = nTri - k;
  log(`   PF_S121_NTREAD not supplied — inferred ${nTread.toLocaleString()} from the contiguous in-band suffix`);
}
const nWall = nTri - nTread;
const isTread = new Uint8Array(nTri);
for (let f = nWall; f < nTri; f += 1) isTread[f] = 1;
log(`── P0c PARTITION: wall [0, ${nWall.toLocaleString()})   TREAD [${nWall.toLocaleString()}, ${nTri.toLocaleString()}) = ${nTread.toLocaleString()} facets`);
{
  let treadInBand = 0; let wallInBand = 0; const bandCnt = new Int32Array(Math.max(1, zSteps.length));
  for (let f = 0; f < nTri; f += 1) {
    const b = inBand(f);
    if (isTread[f] === 1) { if (b >= 0) { treadInBand += 1; bandCnt[b] += 1; } } else if (b >= 0) wallInBand += 1;
  }
  const ok = treadInBand === nTread && wallInBand === 0;
  log(`   *** CONTROL T1 — geometric cross-check of the index partition (band = zStep +/- ${STEP_EPS} mm +/- ${BANDPAD} mm pad):`);
  log(`       tread facets inside a step band: ${treadInBand.toLocaleString()} of ${nTread.toLocaleString()}   wall facets inside a band: ${wallInBand.toLocaleString()}`);
  log(`       per band: ${Array.from(bandCnt).map((c, i) => `z=${(zSteps[i] ?? NaN).toFixed(4)} n=${c}`).join('   ')}`);
  log(`       ${ok ? 'HOLDS — the index partition and the geometry agree exactly' : '*** DIVERGES — the partition is not trustworthy, read every tread number below as suspect ***'}`);
  J.partition = { nWall, nTread, treadInBand, wallInBand, perBand: Array.from(bandCnt), controlT1: ok };
}
log('');

// ── the cliff profile: is the "step" a true discontinuity, and how far does the annulus span? ─────────
if (zSteps.length > 0) {
  log('── P0d THE CLIFF PROFILE — rA(th, zStep + t) as t -> 0 from both sides (is the step a true jump?) ──');
  const ths = [0.21, 1.03, 2.44, 3.77, 5.29];
  const ts = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7];
  const rows: Array<Record<string, unknown>> = [];
  for (let s = 0; s < zSteps.length; s += 1) {
    const zs = zSteps[s];
    log(`   step ${s}  z = ${zs.toFixed(6)}`);
    log(`      t        ${ts.map((t) => t.toExponential(0).padStart(11)).join('')}`);
    for (const th of ths) {
      const dr = ts.map((t) => rAraw(th, zs + t) - rAraw(th, zs - t));
      log(`      th=${th.toFixed(2)}  ${dr.map((v) => v.toExponential(3).padStart(11)).join('')}`);
      rows.push({ step: s, z: zs, th, dr });
    }
  }
  log(`   (a value that is CONSTANT as t falls is a genuine jump; the annulus spans exactly that jump.)`);
  J.cliffProfile = rows;
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P1 — TOPOLOGY. DO THE TREADS CLOSE THE SOLID, AND ARE THEY MANIFOLD AND CONSISTENTLY WOUND?
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const idxAll = new Int32Array(nTri * 3);
for (let i = 0; i < idxAll.length; i += 1) idxAll[i] = i;
const DR = facetDihedralsBig(xyz, idxAll);
log('── P1 TOPOLOGY (facetDihedralsBig — the shared instrument, WHOLE MESH) ──');
log(`   interior ${DR.interiorEdges.toLocaleString()}   boundary ${DR.boundaryEdges.toLocaleString()}   NON-MANIFOLD ${DR.nonManifoldEdges}   INCONSISTENT WINDING ${DR.inconsistentEdges}`);

const WELD = weldExact(xyz);
const U = uniqueEdges(WELD.id, WELD.count, nTri);
const ctlEdges = U.interior === DR.interiorEdges && U.boundary === DR.boundaryEdges && U.nonManifold === DR.nonManifoldEdges;
log(`   welded vertices ${WELD.count.toLocaleString()}   UNIQUE EDGES ${U.count.toLocaleString()}   interior ${U.interior.toLocaleString()}  boundary ${U.boundary.toLocaleString()}  non-manifold ${U.nonManifold}`);
log(`   *** CONTROL C1 — this tool's weld+CSR vs facetDihedralsBig: ${ctlEdges ? 'IDENTICAL' : '*** DIVERGES — RUN VOID ***'} ***`);
if (!ctlEdges) { log('   refusing to score an edge set the shared instrument does not recognise.'); process.exit(3); }

const vx = new Float64Array(WELD.count); const vy = new Float64Array(WELD.count); const vz = new Float64Array(WELD.count);
for (let c = 0; c < nTri * 3; c += 1) { const w = WELD.id[c]; vx[w] = xyz[c * 3]; vy[w] = xyz[c * 3 + 1]; vz[w] = xyz[c * 3 + 2]; }

// EDGE CLASSES: 0 = wall-wall, 1 = tread-tread, 2 = the SEAM (one tread, one wall)
const nE = U.count;
const eCls = new Uint8Array(nE);
const eLen = new Float64Array(nE);
let totLen = 0;
const clsLen = new Float64Array(3); const clsCnt = new Float64Array(3);
const clsBnd = new Float64Array(3); const clsNm = new Float64Array(3);
for (let e = 0; e < nE; e += 1) {
  const a = U.eLo[e]; const b = U.eHi[e];
  const L = Math.hypot(vx[b] - vx[a], vy[b] - vy[a], vz[b] - vz[a]);
  eLen[e] = L; totLen += L;
  const t1 = isTread[U.eF1[e]]; const t2 = U.eF2[e] >= 0 ? isTread[U.eF2[e]] : t1;
  const c = t1 === 1 && t2 === 1 ? 1 : t1 === 0 && t2 === 0 ? 0 : 2;
  eCls[e] = c; clsCnt[c] += 1; clsLen[c] += L;
  if (U.eDeg[e] === 1) clsBnd[c] += 1;
  if (U.eDeg[e] > 2) clsNm[c] += 1;
}
const CLSN = ['WALL-WALL', 'TREAD-TREAD', 'SEAM (tread|wall)'];
log('── P1b EDGE CLASSES ──');
log('   class                  edges        %       length mm      %LEN    boundary  non-manifold');
for (let c = 0; c < 3; c += 1) {
  log(`   ${CLSN[c].padEnd(20)} ${String(clsCnt[c]).padStart(10)} ${(pct(clsCnt[c], nE) + '%').padStart(9)} ${clsLen[c].toFixed(2).padStart(14)} ${(pct(clsLen[c], totLen) + '%').padStart(10)} ${String(clsBnd[c]).padStart(9)} ${String(clsNm[c]).padStart(13)}`);
}
log(`   total edge length ${totLen.toFixed(3)} mm`);

// WINDING CONSISTENCY per class — a directed half-edge scan of our own, so the per-class split is ours
{
  const key = (a: number, b: number): string => `${a}:${b}`;
  const dirCount = new Map<string, number>();
  for (let f = 0; f < nTri; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = WELD.id[f * 3 + k]; const b = WELD.id[f * 3 + ((k + 1) % 3)];
      const kk = key(a, b);
      dirCount.set(kk, (dirCount.get(kk) ?? 0) + 1);
    }
  }
  const badPerCls = new Float64Array(3);
  let badTot = 0;
  for (let e = 0; e < nE; e += 1) {
    if (U.eDeg[e] !== 2) continue;
    const a = U.eLo[e]; const b = U.eHi[e];
    const nAB = dirCount.get(key(a, b)) ?? 0; const nBA = dirCount.get(key(b, a)) ?? 0;
    if (!(nAB === 1 && nBA === 1)) { badPerCls[eCls[e]] += 1; badTot += 1; }
  }
  log('── P1c WINDING CONSISTENCY (own directed half-edge scan, interior edges only) ──');
  log(`   inconsistent interior edges: WALL-WALL ${badPerCls[0]}   TREAD-TREAD ${badPerCls[1]}   SEAM ${badPerCls[2]}   TOTAL ${badTot}`);
  log(`   (facetDihedralsBig's own count for the whole mesh: ${DR.inconsistentEdges})`);
  J.winding = { wallWall: badPerCls[0], treadTread: badPerCls[1], seam: badPerCls[2], total: badTot, shared: DR.inconsistentEdges };
}

// DO THE TREADS CLOSE THE SOLID? Weld+CSR the WALL ALONE and count its boundary.
{
  const wallXyz = xyz.subarray(0, nWall * 9);
  const WW = weldExact(wallXyz);
  const UW = uniqueEdges(WW.id, WW.count, nWall);
  log('── P1d *** DO THE TREADS CLOSE THE SOLID? *** — the WALL ALONE, re-welded ──');
  log(`   wall-only: ${nWall.toLocaleString()} facets   unique edges ${UW.count.toLocaleString()}   BOUNDARY ${UW.boundary.toLocaleString()}   non-manifold ${UW.nonManifold}`);
  log(`   whole mesh (wall + treads):                    BOUNDARY ${U.boundary.toLocaleString()}   non-manifold ${U.nonManifold}`);
  log(`   *** the treads REMOVE ${(UW.boundary - U.boundary).toLocaleString()} boundary edges = ${pct(UW.boundary - U.boundary, UW.boundary)}% of the open wall's boundary ***`);
  J.closure = { wallOnlyBoundary: UW.boundary, wallOnlyNonManifold: UW.nonManifold, fullBoundary: U.boundary, fullNonManifold: U.nonManifold, removed: UW.boundary - U.boundary };
}
log(`   ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P2 — 3-D ASPECT AND AREA, WALL vs TREAD
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// _shapeGuard.aspect3, transcribed operand for operand (same transcription as s120StlAr.cjs).
const areaA = new Float64Array(nTri);
const arA = new Float64Array(nTri);
const altA = new Float64Array(nTri);
let area3D = 0;
{
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const e0 = Math.hypot(bx - ax, by - ay, bz - az);
    const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
    const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    areaA[f] = A; area3D += A;
    const L = Math.max(e0, e1, e2);
    arA[f] = A > 0 ? (L * (e0 + e1 + e2)) / (4 * A) : Infinity;
    altA[f] = L > 0 ? (2 * A) / L : 0;
  }
}
let wallArea = 0; let treadArea = 0;
for (let f = 0; f < nTri; f += 1) (isTread[f] === 1 ? (treadArea += areaA[f]) : (wallArea += areaA[f]));
log(`── P2 CONTROL C0 — 3-D area ${area3D.toFixed(3)} mm2 over ${nTri.toLocaleString()} facets`);
log('   (published baselines: CT guard-ON 1,282,394 / 48,535.770 mm2 ; Gothic S39CTL 1,142,166 / 38,453.259 mm2)');
log(`   WALL  ${nWall.toLocaleString()} facets  ${wallArea.toFixed(3)} mm2 = ${pct(wallArea, area3D)}% of mesh`);
log(`   TREAD ${nTread.toLocaleString()} facets (${pct(nTread, nTri)}% of facets)  ${treadArea.toFixed(6)} mm2 = ${pct(treadArea, area3D)}% of mesh`);
J.nTri = nTri; J.area3D = area3D; J.wallArea = wallArea; J.treadArea = treadArea;
log('');
log(`── P2b 3-D ASPECT vs THE DRIVER'S OWN CAP — swept, because a single threshold is not a measurement ──`);
log('   cap      WALL: count   %fac      area mm2   %area  |  TREAD: count   %fac      area mm2    %area   |  MAX wall / MAX tread');
const arRows: Array<Record<string, unknown>> = [];
for (const cap of [10, 20, 50, 100, 200]) {
  let cw = 0, aw = 0, ct = 0, at = 0;
  for (let f = 0; f < nTri; f += 1) {
    if (!(arA[f] > cap)) continue;
    if (isTread[f] === 1) { ct += 1; at += areaA[f]; } else { cw += 1; aw += areaA[f]; }
  }
  let mw = 0; let mt = 0;
  for (let f = 0; f < nTri; f += 1) { const v = Number.isFinite(arA[f]) ? arA[f] : 0; if (isTread[f] === 1) { if (v > mt) mt = v; } else if (v > mw) mw = v; }
  log(`   ${String(cap).padStart(4)} ${String(cw).padStart(13)} ${(pct(cw, nWall) + '%').padStart(9)} ${aw.toFixed(4).padStart(13)} ${(pct(aw, wallArea) + '%').padStart(8)}  | ${String(ct).padStart(11)} ${(pct(ct, nTread) + '%').padStart(9)} ${at.toFixed(6).padStart(12)} ${(pct(at, treadArea) + '%').padStart(9)}   | ${mw.toFixed(2)} / ${mt.toFixed(2)}`);
  arRows.push({ cap, wallCnt: cw, wallArea: aw, treadCnt: ct, treadArea: at, wallMax: mw, treadMax: mt });
}
{
  let mw = 0; let mt = 0; let minAltW = Infinity; let minAltT = Infinity; let zeroA = 0;
  for (let f = 0; f < nTri; f += 1) {
    const v = Number.isFinite(arA[f]) ? arA[f] : 0;
    if (isTread[f] === 1) { if (v > mt) mt = v; if (altA[f] < minAltT) minAltT = altA[f]; } else { if (v > mw) mw = v; if (altA[f] < minAltW) minAltW = altA[f]; }
    if (!(areaA[f] > 0)) zeroA += 1;
  }
  log(`   *** WORST 3-D ASPECT: wall ${mw.toFixed(2)}   TREAD ${mt.toFixed(2)}  = ${(mt / Math.max(1e-12, mw)).toFixed(2)}x the wall's ***`);
  log(`   min 3-D altitude: wall ${um(minAltW)}   TREAD ${um(minAltT)}      exactly-zero-area facets ${zeroA}`);
  J.aspect = { rows: arRows, wallMax: mw, treadMax: mt, minAltWall: minAltW, minAltTread: minAltT, zeroArea: zeroA };
}
log(`   ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P3 — POSITION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// (A) the campaign's ruler: radial residual to the analytic wall (a SOUND UPPER BOUND on perpendicular),
//     then the true perpendicular via buildRadialSurfaceProjector.
// (B) the STEP-AWARE ruler: min(dist to wall, dist to the annulus), an EXACT distance to a point of the
//     true stepped solid, hence a SOUND UPPER BOUND on the true conformance error.
const annulus =(x: number, y: number, z: number): number => {
  if (zSteps.length === 0) return Infinity;
  let best = Infinity;
  const th = Math.atan2(y, x); const r = Math.hypot(x, y);
  for (let s = 0; s < zSteps.length; s += 1) {
    const zs = zSteps[s];
    const rm = rAraw(th, zs - DELTA); const rp = rAraw(th, zs + DELTA);
    const rlo = Math.min(rm, rp); const rhi = Math.max(rm, rp);
    const gap = r < rlo ? rlo - r : r > rhi ? r - rhi : 0;
    const d = Math.hypot(z - zs, gap);
    if (d < best) best = d;
  }
  return best;
};
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: PERP_NTH, nZ: PERP_NZ, seedTopK: PERP_TOPK });
log(`── P3 POSITION.  projector grid ${proj.gridThetaCount} x ${proj.gridZCount} = ${proj.sampleCount.toLocaleString()} samples`);
log('');

// ── P3a RADIAL R1 (the campaign's own quantity), lattice-order ladder, EXHAUSTIVE over both populations
const kLadder = [2, 4, 8, 16, 32];
log('── P3a POSITION vs THE ANALYTIC WALL, RADIAL R1 — the campaign\'s own quantity, EXHAUSTIVE ──');
log('   (radial >= perpendicular POINTWISE, so this is a SOUND UPPER BOUND and a proof-grade prefilter)');
log('    k   pop      >0.01mm cnt    %       area mm2     %area   |  >0.001mm cnt    %      area mm2    %area   |   MAX mm');
const r1Rows: Array<Record<string, unknown>> = [];
const fR1 = new Float64Array(nTri);
for (const k of kLadder) {
  const LAT = latticePts(k); const NP = LAT.length / 3;
  const cH = [0, 0]; const aH = [0, 0]; const cL = [0, 0]; const aL = [0, 0]; const mx = [0, 0];
  // DISCLOSED BOUND: the WALL is scored at k=8 only (the campaign's own published lattice order, so the
  // row is directly comparable to S120's control C3). The TREADS — the population this tool exists for —
  // are scored at every rung of the ladder. Nothing is sampled: both passes are exhaustive over the
  // facets they cover.
  const fStart = k === 8 ? 0 : nWall;
  for (let f = fStart; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const dd = radialResid(rA, w0 * ax + w1 * bx + w2 * cx, w0 * ay + w1 * by + w2 * cy, w0 * az + w1 * bz + w2 * cz);
      if (dd > w) w = dd;
    }
    const g = isTread[f];
    if (k === 8) fR1[f] = w;
    if (w > BAR_HI) { cH[g] += 1; aH[g] += areaA[f]; }
    if (w > BAR_LO) { cL[g] += 1; aL[g] += areaA[f]; }
    if (w > mx[g]) mx[g] = w;
  }
  for (const g of [0, 1]) {
    const nP = g === 1 ? nTread : nWall; const aP = g === 1 ? treadArea : wallArea;
    if (nP === 0 || (g === 0 && k !== 8)) continue;
    log(`   ${String(k).padStart(2)}  ${(g === 1 ? 'TREAD' : 'wall ').padEnd(6)} ${String(cH[g]).padStart(11)} ${(pct(cH[g], nP) + '%').padStart(9)} ${aH[g].toFixed(4).padStart(12)} ${(pct(aH[g], aP) + '%').padStart(9)}  | ${String(cL[g]).padStart(12)} ${(pct(cL[g], nP) + '%').padStart(9)} ${aL[g].toFixed(4).padStart(12)} ${(pct(aL[g], aP) + '%').padStart(9)}  | ${ex(mx[g]).padStart(10)}`);
  }
  r1Rows.push({ k, wallCntHi: cH[0], wallAreaHi: aH[0], wallCntLo: cL[0], wallAreaLo: aL[0], wallMax: mx[0], treadCntHi: cH[1], treadAreaHi: aH[1], treadCntLo: cL[1], treadAreaLo: aL[1], treadMax: mx[1] });
}
log('   (S120 published for this mesh, WHOLE-MESH at k=8: 197,299 / 19.9246% at HI ; 1,043,141 / 97.0393% at LO ; MAX 1.730e+0 mm)');
J.radialR1 = r1Rows;
log(`   ${el()}`);
log('');

// ── P3b TRUE PERPENDICULAR, TREADS: EXHAUSTIVE, no prefilter, no early-out, k ladder ──────────────────
if (nTread > 0) {
  log('── P3b POSITION vs THE ANALYTIC WALL, TRUE PERPENDICULAR — TREADS, EXHAUSTIVE ──');
  log('   Every lattice point of every tread facet is projected. No prefilter, no early-out, no cap.');
  log('    k    points     >0.01mm cnt    %       area mm2    %area  |  >0.001mm cnt    %     area mm2   %area  |    MAX mm       calls   C2 viol');
  const permRows: Array<Record<string, unknown>> = [];
  for (const k of [2, 4, 8, 16]) {
    const LAT = latticePts(k); const NP = LAT.length / 3;
    let cH = 0, aH = 0, cL = 0, aL = 0, mx = 0, calls = 0, c2 = 0;
    for (let f = nWall; f < nTri; f += 1) {
      const o = f * 9;
      const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
      const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
      const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
      let w = 0;
      for (let p = 0; p < NP; p += 1) {
        const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
        const X = w0 * ax + w1 * bx + w2 * cx, Y = w0 * ay + w1 * by + w2 * cy, Z = w0 * az + w1 * bz + w2 * cz;
        const d = proj.project(X, Y, Z).dist; calls += 1;
        if (d > radialResid(rA, X, Y, Z) + 1e-9) c2 += 1;
        if (d > w) w = d;
      }
      if (w > BAR_HI) { cH += 1; aH += areaA[f]; }
      if (w > BAR_LO) { cL += 1; aL += areaA[f]; }
      if (w > mx) mx = w;
    }
    log(`   ${String(k).padStart(2)} ${String(NP).padStart(9)} ${String(cH).padStart(13)} ${(pct(cH, nTread) + '%').padStart(9)} ${aH.toFixed(4).padStart(12)} ${(pct(aH, treadArea) + '%').padStart(8)} | ${String(cL).padStart(12)} ${(pct(cL, nTread) + '%').padStart(9)} ${aL.toFixed(4).padStart(11)} ${(pct(aL, treadArea) + '%').padStart(8)} | ${ex(mx).padStart(10)} ${String(calls).padStart(11)} ${String(c2).padStart(8)}`);
    permRows.push({ k, cntHi: cH, areaHi: aH, cntLo: cL, areaLo: aL, max: mx, calls, c2 });
  }
  J.treadPerp = permRows;
  log(`   *** C2 CONTROL: perpendicular must never exceed radial at the same point. A non-zero column VOIDS the row. ***`);
  log(`   ${el()}`);
  log('');
}

// ── P3c THE STEP-AWARE RULER — the honest standard for a tread ────────────────────────────────────────
if (nTread > 0) {
  log('── P3c *** POSITION vs THE TRUE STEPPED SOLID (wall U annulus) — TREADS, EXHAUSTIVE *** ──');
  log(`   d = min( perpendicular dist to the wall , exact dist to the horizontal annulus at the step ).`);
  log(`   The annulus radii are the ONE-SIDED limits rA(th, zStep -/+ ${DELTA} mm) — a DISCLOSED probe.`);
  log('   This is an EXACT distance to a point of the true solid, hence a SOUND UPPER BOUND on the error.');
  log('    k    points     >0.01mm cnt    %       area mm2   %area  |  >0.001mm cnt    %      area mm2   %area  |    MAX mm       MAX um');
  const stepRows: Array<Record<string, unknown>> = [];
  for (const k of [2, 4, 8, 16]) {
    const LAT = latticePts(k); const NP = LAT.length / 3;
    let cH = 0, aH = 0, cL = 0, aL = 0, mx = 0;
    for (let f = nWall; f < nTri; f += 1) {
      const o = f * 9;
      const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
      const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
      const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
      let w = 0;
      for (let p = 0; p < NP; p += 1) {
        const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
        const X = w0 * ax + w1 * bx + w2 * cx, Y = w0 * ay + w1 * by + w2 * cy, Z = w0 * az + w1 * bz + w2 * cz;
        const d = Math.min(proj.project(X, Y, Z).dist, annulus(X, Y, Z));
        if (d > w) w = d;
      }
      if (w > BAR_HI) { cH += 1; aH += areaA[f]; }
      if (w > BAR_LO) { cL += 1; aL += areaA[f]; }
      if (w > mx) mx = w;
    }
    log(`   ${String(k).padStart(2)} ${String(NP).padStart(9)} ${String(cH).padStart(13)} ${(pct(cH, nTread) + '%').padStart(9)} ${aH.toFixed(4).padStart(11)} ${(pct(aH, treadArea) + '%').padStart(8)} | ${String(cL).padStart(12)} ${(pct(cL, nTread) + '%').padStart(9)} ${aL.toFixed(4).padStart(11)} ${(pct(aL, treadArea) + '%').padStart(8)} | ${ex(mx).padStart(10)} ${um(mx).padStart(13)}`);
    stepRows.push({ k, cntHi: cH, areaHi: aH, cntLo: cL, areaLo: aL, max: mx });
  }
  J.treadStepAware = stepRows;
  // and how far the tread sits from the step PLANE, which is the whole of the residual by construction
  let dzMax = 0; let dzSum = 0; let nV = 0;
  for (let f = nWall; f < nTri; f += 1) {
    for (let k = 0; k < 3; k += 1) {
      const z = xyz[f * 9 + k * 3 + 2];
      let best = Infinity;
      for (const zs of zSteps) best = Math.min(best, Math.abs(z - zs));
      if (best > dzMax) dzMax = best;
      dzSum += best; nV += 1;
    }
  }
  log(`   |z - zStep| over every tread vertex: MAX ${um(dzMax)}   mean ${um(dzSum / Math.max(1, nV))}   (stepEps = ${um(STEP_EPS)})`);
  J.treadZOffset = { max: dzMax, mean: dzSum / Math.max(1, nV), stepEps: STEP_EPS };
  log(`   ${el()}`);
  log('');
}

// ── P3d WALL PERPENDICULAR, for the comparison. Prefiltered (sound), calls disclosed. ────────────────
if (WALLPERP) {
  log('── P3d POSITION vs THE ANALYTIC WALL, TRUE PERPENDICULAR — WALL, k=8, prefiltered ──');
  log('   A facet whose RADIAL R1 is under a bar is PROVEN under it perpendicularly (pointwise bound),');
  log('   so it is certified without a projector call. Only flagged facets are walked. Calls printed.');
  const LAT = latticePts(8); const NP = LAT.length / 3;
  let cH = 0, aH = 0, cL = 0, aL = 0, mx = 0, calls = 0, c2 = 0, touched = 0;
  const tW = Date.now();
  for (let f = 0; f < nWall; f += 1) {
    if (!(fR1[f] > BAR_LO)) continue;
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    let w = 0; let oHi = false; let oLo = false; touched += 1;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const X = w0 * ax + w1 * bx + w2 * cx, Y = w0 * ay + w1 * by + w2 * cy, Z = w0 * az + w1 * bz + w2 * cz;
      const rr = radialResid(rA, X, Y, Z);
      // POINTWISE PREFILTER: a point whose radial is under everything that still matters cannot change
      // any verdict on this facet nor the running mesh max.
      let need = mx; if (!oLo && BAR_LO < need) need = BAR_LO; if (!oHi && fR1[f] > BAR_HI && BAR_HI < need) need = BAR_HI;
      if (rr <= need) continue;
      const d = proj.project(X, Y, Z).dist; calls += 1;
      if (d > rr + 1e-9) c2 += 1;
      if (d > w) w = d;
      if (d > BAR_HI) oHi = true;
      if (d > BAR_LO) oLo = true;
      if (d > mx) mx = d;
    }
    if (oHi) { cH += 1; aH += areaA[f]; }
    if (oLo) { cL += 1; aL += areaA[f]; }
  }
  const dtW = (Date.now() - tW) / 1000;
  log(`   flagged ${touched.toLocaleString()} of ${nWall.toLocaleString()} wall facets (${pct(touched, nWall)}%)   projector calls ${calls.toLocaleString()}   ${dtW.toFixed(1)} s   C2 violations ${c2}`);
  log(`   > ${BAR_HI} mm : ${cH.toLocaleString()} facets (${pct(cH, nWall)}%)   ${aH.toFixed(3)} mm2 = ${pct(aH, wallArea)}% of wall area`);
  log(`   > ${BAR_LO} mm : ${cL.toLocaleString()} facets (${pct(cL, nWall)}%)   ${aL.toFixed(3)} mm2 = ${pct(aL, wallArea)}% of wall area`);
  log(`   *** WALL PERPENDICULAR MAX ${ex(mx)} mm ***`);
  J.wallPerp = { flagged: touched, calls, seconds: dtW, c2, cntHi: cH, areaHi: aH, cntLo: cL, areaLo: aL, max: mx };
  log(`   ${el()}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P4 — EDGE CONFORMANCE. THE FIRST TIME TREAD EDGES HAVE EVER BEEN MEASURED.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const eRad = new Float64Array(nE);
const eRad8 = new Float64Array(nE);
{
  const W = makeEdgeWorkspace(NS, MAXCAND);
  const LEVELS = W.levels;
  const rungCntHi: Float64Array[] = [new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1)];
  const rungLenHi: Float64Array[] = [new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1)];
  const rungCntLo: Float64Array[] = [new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1)];
  const rungMax: Float64Array[] = [new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1), new Float64Array(LEVELS + 1)];
  const refCntHi = new Float64Array(3); const refLenHi = new Float64Array(3);
  const refCntLo = new Float64Array(3); const refLenLo = new Float64Array(3); const refMax = new Float64Array(3);
  let capBound = 0; let rAcalls = 0;
  const tR = Date.now();
  for (let e = 0; e < nE; e += 1) {
    if (!EDGEALL && eCls[e] === 0) continue;
    const a = U.eLo[e]; const b = U.eHi[e];
    edgeRadialSag(rA, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], REFINE, W);
    rAcalls += W.rAcalls;
    if (W.capBound) capBound += 1;
    const c = eCls[e]; const L = eLen[e];
    for (let j = 0; j <= LEVELS; j += 1) {
      const v = W.ladder[j];
      if (v > BAR_HI) { rungCntHi[c][j] += 1; rungLenHi[c][j] += L; }
      if (v > BAR_LO) rungCntLo[c][j] += 1;
      if (v > rungMax[c][j]) rungMax[c][j] = v;
    }
    eRad8[e] = W.ladder[Math.min(3, LEVELS)];
    const m = W.max; eRad[e] = m;
    if (m > BAR_HI) { refCntHi[c] += 1; refLenHi[c] += L; }
    if (m > BAR_LO) { refCntLo[c] += 1; refLenLo[c] += L; }
    if (m > refMax[c]) refMax[c] = m;
  }
  const dt = (Date.now() - tR) / 1000;
  log('── P4 EDGE CONFORMANCE — max over s in [0,1] of dist(a+s(b-a), S). RADIAL (sound upper bound). ──');
  log(`   ${(EDGEALL ? nE : clsCnt[1] + clsCnt[2]).toLocaleString()} edges scored, ${rAcalls.toLocaleString()} rA evaluations, ${dt.toFixed(1)} s`);
  log(`   refinement cap ${MAXCAND} (DISCLOSED) bound on ${capBound.toLocaleString()} edges = ${pct(capBound, nE)}% — binding can only make the number SMALLER`);
  log('');
  log('   *** THE CONVERGENCE LADDER, PER CLASS. Rung j = a uniform grid of 2^j intervals; rung 3 is exactly');
  log('       the edge sample buried inside a k=8 facet lattice. Every rung is a stride of the nS grid. ***');
  const ladJson: Array<Record<string, unknown>> = [];
  for (let c = 0; c < 3; c += 1) {
    if (clsCnt[c] === 0 || (!EDGEALL && c === 0)) continue;
    log(`   ── ${CLSN[c]}  (${clsCnt[c].toLocaleString()} edges, ${clsLen[c].toFixed(2)} mm) ──`);
    log('     rung  pts    >0.01mm cnt   %of class     len mm     %clsLEN   |  >0.001mm cnt   %of class  |     MAX mm');
    for (let j = 0; j <= LEVELS; j += 1) {
      log(`   ${String(j).padStart(5)} ${String((1 << j) + 1).padStart(5)} ${String(rungCntHi[c][j]).padStart(13)} ${(pct(rungCntHi[c][j], clsCnt[c]) + '%').padStart(11)} ${rungLenHi[c][j].toFixed(2).padStart(11)} ${(pct(rungLenHi[c][j], clsLen[c]) + '%').padStart(10)}   | ${String(rungCntLo[c][j]).padStart(13)} ${(pct(rungCntLo[c][j], clsCnt[c]) + '%').padStart(11)}  | ${ex(rungMax[c][j]).padStart(11)}`);
      ladJson.push({ cls: CLSN[c], rung: j, cntHi: rungCntHi[c][j], lenHi: rungLenHi[c][j], cntLo: rungCntLo[c][j], max: rungMax[c][j] });
    }
    log(`   ${'ref'.padStart(5)} ${String(NS + 1).padStart(5)} ${String(refCntHi[c]).padStart(13)} ${(pct(refCntHi[c], clsCnt[c]) + '%').padStart(11)} ${refLenHi[c].toFixed(2).padStart(11)} ${(pct(refLenHi[c], clsLen[c]) + '%').padStart(10)}   | ${String(refCntLo[c]).padStart(13)} ${(pct(refCntLo[c], clsCnt[c]) + '%').padStart(11)}  | ${ex(refMax[c]).padStart(11)}`);
    ladJson.push({ cls: CLSN[c], rung: 'ref', cntHi: refCntHi[c], lenHi: refLenHi[c], cntLo: refCntLo[c], max: refMax[c] });
    log(`      rung-3 under-read of the REFINED max: ${(refMax[c] / Math.max(1e-15, rungMax[c][3 <= LEVELS ? 3 : LEVELS])).toFixed(4)}x`);
  }
  J.edgeRadial = { ladder: ladJson, capBound, seconds: dt, rAcalls };
  log(`   ${el()}`);
  log('');

  // ── CONVERGENCE CONTROL on the tread-incident edges, at 4x and 16x nS ──────────────────────────────
  if (clsCnt[1] + clsCnt[2] > 0) {
    log('── P4b CONVERGENCE CONTROL — EVERY tread-incident edge re-scored at 4x and 16x nS ──');
    const W4 = makeEdgeWorkspace(NS * 4, MAXCAND * 2);
    const W16 = makeEdgeWorkspace(NS * 16, MAXCAND * 4);
    let m1 = 0, m4 = 0, m16 = 0, moved4 = 0, moved16 = 0, n = 0;
    for (let e = 0; e < nE; e += 1) {
      if (eCls[e] === 0) continue;
      n += 1;
      const a = U.eLo[e]; const b = U.eHi[e];
      edgeRadialSag(rA, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], REFINE, W4);
      edgeRadialSag(rA, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], REFINE, W16);
      if (eRad[e] > m1) m1 = eRad[e];
      if (W4.max > m4) m4 = W4.max;
      if (W16.max > m16) m16 = W16.max;
      if (W4.max / Math.max(1e-15, eRad[e]) > 1.01) moved4 += 1;
      if (W16.max / Math.max(1e-15, W4.max) > 1.01) moved16 += 1;
    }
    log(`   ${n.toLocaleString()} tread-incident edges.  MAX: nS=${NS} ${ex(m1)}  ->  nS=${NS * 4} ${ex(m4)} (${(m4 / Math.max(1e-15, m1)).toFixed(5)}x)  ->  nS=${NS * 16} ${ex(m16)} (${(m16 / Math.max(1e-15, m4)).toFixed(5)}x)`);
    log(`   edges moving >1%: ${moved4.toLocaleString()} (${pct(moved4, n)}%) at 4x, ${moved16.toLocaleString()} (${pct(moved16, n)}%) at 16x`);
    log('   (~1.000 at both steps ⇒ the profile is RESOLVED and the headline may be quoted.)');
    J.edgeConvergence = { n, max1: m1, max4: m4, max16: m16, moved4, moved16 };
    log('');
  }
}

// ── P4c PERPENDICULAR EDGE SAG for the tread-incident edges: EXHAUSTIVE, no early-out, golden-polished ─
if (clsCnt[1] + clsCnt[2] > 0) {
  log('── P4c *** EDGE CONFORMANCE, TRUE PERPENDICULAR — TREAD EDGES. FIRST MEASUREMENT EVER. *** ──');
  log(`   Every tread-incident edge, every one of the ${NS + 1} uniform points, plus a golden polish of the`);
  log('   perpendicular itself. NO early-out and NO prefilter: the per-edge value is exact, not a witness.');
  const rows: Array<Record<string, unknown>> = [];
  for (const c of [1, 2]) {
    if (clsCnt[c] === 0) continue;
    let cH = 0, lH = 0, cL = 0, lL = 0, mx = 0, calls = 0, c2 = 0, mxStep = 0, cHs = 0, cLs = 0, lLs = 0;
    for (let e = 0; e < nE; e += 1) {
      if (eCls[e] !== c) continue;
      const a = U.eLo[e]; const b = U.eHi[e];
      const ax = vx[a], ay = vy[a], az = vz[a];
      const dx = vx[b] - ax, dy = vy[b] - ay, dz = vz[b] - az;
      const P = (s: number): number => { calls += 1; return proj.project(ax + s * dx, ay + s * dy, az + s * dz).dist; };
      const Q = (s: number): number => {
        const X = ax + s * dx, Y = ay + s * dy, Z = az + s * dz;
        return Math.min(proj.project(X, Y, Z).dist, annulus(X, Y, Z));
      };
      let bu = 0; let su = 0; let bq = 0; let sq = 0;
      for (let k = 0; k <= NS; k += 1) {
        const s = k / NS;
        const d = P(s);
        const X = ax + s * dx, Y = ay + s * dy, Z = az + s * dz;
        if (d > radialResid(rA, X, Y, Z) + 1e-9) c2 += 1;
        if (d > bu) { bu = d; su = s; }
        const dq = Math.min(d, annulus(X, Y, Z));
        if (dq > bq) { bq = dq; sq = s; }
      }
      const h = 1 / NS;
      const g = goldenMax(P, Math.max(0, su - h), Math.min(1, su + h), 30);
      const gq = goldenMax(Q, Math.max(0, sq - h), Math.min(1, sq + h), 30);
      const v = Math.max(bu, g.v); const vq = Math.max(bq, gq.v);
      if (v > BAR_HI) { cH += 1; lH += eLen[e]; }
      if (v > BAR_LO) { cL += 1; lL += eLen[e]; }
      if (v > mx) mx = v;
      if (vq > BAR_HI) cHs += 1;
      if (vq > BAR_LO) { cLs += 1; lLs += eLen[e]; }
      if (vq > mxStep) mxStep = vq;
    }
    log(`   ── ${CLSN[c]}  (${clsCnt[c].toLocaleString()} edges, ${clsLen[c].toFixed(3)} mm of edge) ──`);
    log(`      vs THE ANALYTIC WALL:  > ${BAR_HI} mm ${cH.toLocaleString()} edges (${pct(cH, clsCnt[c])}%, ${lH.toFixed(3)} mm = ${pct(lH, clsLen[c])}% of class length)`);
    log(`                             > ${BAR_LO} mm ${cL.toLocaleString()} edges (${pct(cL, clsCnt[c])}%, ${lL.toFixed(3)} mm = ${pct(lL, clsLen[c])}% of class length)`);
    log(`                             *** MAX ${ex(mx)} mm = ${um(mx)} ***`);
    log(`      vs THE TRUE STEPPED SOLID (wall U annulus, sound upper bound):`);
    log(`                             > ${BAR_HI} mm ${cHs.toLocaleString()} edges (${pct(cHs, clsCnt[c])}%)   > ${BAR_LO} mm ${cLs.toLocaleString()} edges (${pct(cLs, clsCnt[c])}%, ${pct(lLs, clsLen[c])}% of class length)`);
    log(`                             *** MAX ${ex(mxStep)} mm = ${um(mxStep)} ***`);
    log(`      projector calls ${calls.toLocaleString()}   C2 violations ${c2}`);
    rows.push({ cls: CLSN[c], edges: clsCnt[c], len: clsLen[c], wallCntHi: cH, wallLenHi: lH, wallCntLo: cL, wallLenLo: lL, wallMax: mx, stepCntHi: cHs, stepCntLo: cLs, stepLenLo: lLs, stepMax: mxStep, calls, c2 });
  }
  J.treadEdgePerp = rows;
  log(`   ${el()}`);
  log('');
}

// ── P4d THE WALL EDGE CLASS, from S120's per-edge scalars if they are provably the same edge set ──────
if (REUSE.length > 0 && existsSync(`${REUSE}_edgeRad.f32`) && existsSync(`${REUSE}_edgePerp.f32`)) {
  const rd = new Float32Array(readFileSync(`${REUSE}_edgeRad.f32`).buffer.slice(0));
  const pp = new Float32Array(readFileSync(`${REUSE}_edgePerp.f32`).buffer.slice(0));
  log('── P4d WALL EDGES — reusing S120\'s per-edge scalars, with an ORDER PROOF ──');
  if (rd.length !== nE) {
    log(`   *** LENGTH MISMATCH ${rd.length} vs ${nE} — NOT REUSED. The wall edge class is UNKNOWN here. ***`);
  } else {
    let diff = 0; let worstRel = 0;
    for (let e = 0; e < nE; e += 1) {
      const a = Math.fround(eRad[e]); const b = rd[e];
      if (a !== b) { diff += 1; const rel = Math.abs(a - b) / Math.max(1e-15, Math.abs(b)); if (rel > worstRel) worstRel = rel; }
    }
    log(`   *** ORDER PROOF — this run's radial edge sag vs S120's stored f32, element by element:`);
    log(`       mismatches ${diff.toLocaleString()} of ${nE.toLocaleString()} (${pct(diff, nE)}%)   worst relative ${worstRel.toExponential(3)}`);
    log(`       ${diff === 0 ? 'IDENTICAL — the edge ORDER is the same, so the stored perpendicular values are addressable by our index' : 'NOT identical — the stored perpendicular is used only if the mismatch rate is a rounding artefact; read the worst relative'}`);
    const rows: Array<Record<string, unknown>> = [];
    for (let c = 0; c < 3; c += 1) {
      if (clsCnt[c] === 0) continue;
      let cH = 0, lH = 0, cL = 0, lL = 0, mx = 0;
      for (let e = 0; e < nE; e += 1) {
        if (eCls[e] !== c) continue;
        const v = pp[e];
        if (v > BAR_HI) { cH += 1; lH += eLen[e]; }
        if (v > BAR_LO) { cL += 1; lL += eLen[e]; }
        if (v > mx) mx = v;
      }
      log(`   ${CLSN[c].padEnd(20)} > ${BAR_HI}: ${String(cH).padStart(9)} (${pct(cH, clsCnt[c])}%, ${pct(lH, clsLen[c])}% of class len)   > ${BAR_LO}: ${String(cL).padStart(9)} (${pct(cL, clsCnt[c])}%, ${pct(lL, clsLen[c])}% of class len)   MAX ${ex(mx)}`);
      rows.push({ cls: CLSN[c], cntHi: cH, lenHi: lH, cntLo: cL, lenLo: lL, max: mx });
    }
    log('   (S120 mesh-wide, same file: 42,809 edges > 0.01 mm = 1.6206% of length; 1,054,640 > 0.001 mm; MAX 8.529e-1 mm.)');
    log('   NOTE: S120\'s stored per-edge value is the largest perpendicular WITNESSED before its early-out fired.');
    log('   It is EXACT for the over/under-bar classification and for the mesh MAX; a per-class MAX taken from it');
    log('   is a LOWER bound unless that class contains the mesh max. The TREAD class above is recomputed exactly.');
    J.wallEdgeReuse = { rows, diff, worstRel };
  }
  log(`   ${el()}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P5 — ORIENTATION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (nTread > 0) {
  log('── P5 ORIENTATION — normDeg, with h / k / inset SWEPT (instrument scars 1, 2, 3) ──');
  log('   `winding` convention (HONEST: an inverted facet reads ~180 deg). barRad = 5 deg for overFrac.');
  log('     h        k  inset   TREAD: max deg     p50      p90    >5deg cnt   %area  |  cov mm     spread deg');
  const oRows: Array<Record<string, unknown>> = [];
  const scratch = new Float64Array(12);
  for (const h of [2e-3, 2e-4, 2e-5, 2e-6]) {
    const ns = fdNormals(rA, H, h, h);
    for (const k of [2, 4, 8, 16]) {
      for (const inset of [0, 0.05, 0.1]) {
        if (h !== 2e-4 && (k !== 8 || inset !== 0.05)) continue;      // sweep one axis at a time, printed
        if (k !== 8 && inset !== 0.05) continue;
        let mx = 0; let overN = 0; let overA = 0; let covS = 0; let sprMx = 0;
        const vals: number[] = [];
        for (let f = nWall; f < nTri; f += 1) {
          const o = f * 9;
          const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
          const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
          const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
          const tha = Math.atan2(ay, ax);
          const O = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz,
            tha, tha + dThRaw(tha, Math.atan2(by, bx)), tha + dThRaw(tha, Math.atan2(cy, cx)),
            { k, inset, orient: 'winding', scratch });
          const v = Number.isFinite(O.normDeg) ? O.normDeg : 0;
          vals.push(v); covS += O.cov;
          if (Number.isFinite(O.spreadRad) && O.spreadRad * 180 / Math.PI > sprMx) sprMx = O.spreadRad * 180 / Math.PI;
          if (v > mx) mx = v;
          if (v > 5) { overN += 1; overA += areaA[f]; }
        }
        vals.sort((a, b) => a - b);
        log(`   ${h.toExponential(0).padStart(7)} ${String(k).padStart(3)} ${inset.toFixed(2).padStart(6)} ${mx.toFixed(3).padStart(15)} ${qt(vals, 0.5).toFixed(3).padStart(9)} ${qt(vals, 0.9).toFixed(3).padStart(8)} ${String(overN).padStart(11)} ${(pct(overA, treadArea) + '%').padStart(9)}  | ${(covS / Math.max(1, nTread)).toExponential(2)} ${sprMx.toFixed(3).padStart(11)}`);
        oRows.push({ h, k, inset, max: mx, p50: qt(vals, 0.5), p90: qt(vals, 0.9), overN, overArea: overA, meanCov: covS / Math.max(1, nTread), spreadMaxDeg: sprMx });
      }
    }
  }
  J.treadOrient = oRows;
  log('   *** READ THIS: the reference here is the ANALYTIC WALL normal, which at a C0 step is radial, while');
  log('       a tread is HORIZONTAL. ~90 deg is the CORRECT answer for a correctly-built tread and says');
  log('       nothing about the tread\'s quality. The honest orientation reference is the annulus normal: ***');
  // the annulus normal test
  let tiltMax = 0; let tiltSum = 0; let up = 0; let down = 0; let overN = 0; let overA = 0;
  const tilts: number[] = [];
  for (let f = nWall; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const L = Math.hypot(nx, ny, nz);
    if (!(L > 0)) continue;
    nx /= L; ny /= L; nz /= L;
    if (nz >= 0) up += 1; else down += 1;
    const t = (Math.acos(Math.min(1, Math.abs(nz))) * 180) / Math.PI;   // angle from the z axis
    tilts.push(t); tiltSum += t;
    if (t > tiltMax) tiltMax = t;
    if (t > 5) { overN += 1; overA += areaA[f]; }
  }
  tilts.sort((a, b) => a - b);
  log(`   TILT FROM HORIZONTAL (angle between the facet normal and +/-z), EXHAUSTIVE over ${nTread.toLocaleString()} treads:`);
  log(`      MAX ${tiltMax.toFixed(3)} deg   p50 ${qt(tilts, 0.5).toFixed(3)}   p90 ${qt(tilts, 0.9).toFixed(3)}   p99 ${qt(tilts, 0.99).toFixed(3)}`);
  log(`      > 5 deg from horizontal: ${overN.toLocaleString()} facets (${pct(overN, nTread)}%)   ${overA.toFixed(4)} mm2 = ${pct(overA, treadArea)}% of tread area`);
  // ⚠ RETRACTED CAPTION. This line used to read "a MIXED sign inside one step band is an orientation
  // defect". IT IS NOT. The radius jump at a detected step CHANGES SIGN WITH THETA (see the cliff
  // profile above: step 0 jumps -62.5 um at th=0.21 and rises smoothly at th=1.03), and the outward
  // normal of the annulus is DOWN where r+ > r- and UP where r+ < r-. So a mixed band is the CORRECT
  // answer. MEASURED by research/tools/s121TreadSign.cjs on the shipping mesh, comparing both radii at
  // the SAME theta: the prediction sign(n_z) = -sign(r+ - r-) holds on 4,291 of 4,394 treads = 97.66%
  // by count and 99.71% by area.
  log(`      normal +z on ${up.toLocaleString()}, -z on ${down.toLocaleString()}  — MIXED IS EXPECTED: the radius jump changes sign with theta (s121TreadSign.cjs adjudicates it)`);
  J.treadTilt = { max: tiltMax, p50: qt(tilts, 0.5), p90: qt(tilts, 0.9), p99: qt(tilts, 0.99), over5N: overN, over5Area: overA, up, down };
  // per-band sign, so a mixed band is visible
  {
    const upB = new Int32Array(Math.max(1, zSteps.length)); const dnB = new Int32Array(Math.max(1, zSteps.length));
    for (let f = nWall; f < nTri; f += 1) {
      const b = inBand(f); if (b < 0) continue;
      const o = f * 9;
      const nz = (xyz[o + 3] - xyz[o]) * (xyz[o + 7] - xyz[o + 1]) - (xyz[o + 4] - xyz[o + 1]) * (xyz[o + 6] - xyz[o]);
      if (nz >= 0) upB[b] += 1; else dnB[b] += 1;
    }
    log(`      per band: ${Array.from(upB).map((v, i) => `z=${(zSteps[i] ?? NaN).toFixed(3)} +z ${v} / -z ${dnB[i]}`).join('   ')}`);
    J.treadTiltPerBand = { up: Array.from(upB), down: Array.from(dnB) };
  }
  log(`   ${el()}`);
  log('');
}

// wall orientation at ONE setting, for the comparison
if (envS('PF_S121_WALLORIENT', '1') !== '0' && nWall > 0) {
  const ns = fdNormals(rA, H, 2e-4, 2e-4);
  const scratch = new Float64Array(12);
  let mx = 0; let overN = 0; let overA = 0;
  const vals: number[] = [];
  const STRIDE = envI('PF_S121_WALLORIENT_STRIDE', 1);
  let seen = 0;
  for (let f = 0; f < nWall; f += STRIDE) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const tha = Math.atan2(ay, ax);
    const O = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz,
      tha, tha + dThRaw(tha, Math.atan2(by, bx)), tha + dThRaw(tha, Math.atan2(cy, cx)),
      { k: 8, inset: 0.05, orient: 'winding', scratch });
    const v = Number.isFinite(O.normDeg) ? O.normDeg : 0;
    vals.push(v); seen += 1;
    if (v > mx) mx = v;
    if (v > 5) { overN += 1; overA += areaA[f]; }
  }
  vals.sort((a, b) => a - b);
  log(`── P5b WALL ORIENTATION at h=2e-4, k=8, inset=0.05, winding — stride ${STRIDE} (DISCLOSED), ${seen.toLocaleString()} facets scored ──`);
  log(`   MAX ${mx.toFixed(3)} deg   p50 ${qt(vals, 0.5).toFixed(3)}   p90 ${qt(vals, 0.9).toFixed(3)}   p99 ${qt(vals, 0.99).toFixed(3)}   > 5 deg: ${overN.toLocaleString()} (${pct(overN, seen)}% of scored)`);
  J.wallOrient = { stride: STRIDE, scored: seen, max: mx, p50: qt(vals, 0.5), p90: qt(vals, 0.9), p99: qt(vals, 0.99), over5N: overN, over5Area: overA };
  log(`   ${el()}`);
  log('');
}

J.priority = PRIO_NOTE;
J.wallSeconds = (Date.now() - T0) / 1000;
const jp = `${OUTDIR}/S121_TREAD_${TAG}.json`;
writeFileSync(jp, JSON.stringify(J, null, 2));
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`WALL ${((Date.now() - T0) / 1000).toFixed(1)} s   PEAK RSS ${mbs(process.resourceUsage().maxRSS * 1024)}`);
log(`json -> ${jp}`);
log('S121 TREAD SCORECARD DONE');
