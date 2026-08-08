// s120Sweep.ts — S120: THE INSTRUMENT SWEEP FOR THE EDGE RULER.
//
// The six instrument scars each cost this campaign a voided run, and the standing rule is that a verdict
// is only as good as the SETTING SENSITIVITY published next to it. The edge ruler has three settings that
// could each manufacture or destroy its headline, and this tool sweeps all three on the SAME edge set:
//
//   S-A  nS, the number of uniform samples in s. This is the direct analogue of scar 6. Swept far past
//        the production value (to 4096) on the worst edges — if the number is still moving there, the
//        headline is not converged and must not be quoted.
//   S-B  the PROJECTOR seed grid (nTheta x nZ) and seedTopK. A projector that seeds too coarsely lands in
//        the wrong basin on a tangled lattice and OVER-states the distance by up to ~7x (the documented
//        failure of the single-seed projector). Every returned distance is a valid UPPER bound, so a
//        FINER grid can only lower it: the sweep must be MONOTONE NON-INCREASING in resolution, and if it
//        is not, something is wrong with the projector, not with the mesh.
//   S-C  the projector's finite-difference steps hTheta/hZ (scar 3). These drive the Gauss-Newton
//        Jacobian; too large and the descent mis-steps, too small and it is noise-dominated.
//
// It reads the per-edge scalars the main tool dumps, so the expensive phases are never re-run: the edge
// id ordering is a pure function of the mesh (exact weld + counting-sort CSR), so re-welding here
// reproduces the same ids by construction, and the tool ASSERTS the edge count matches the dump length.
//
// Usage: PF_S120_STL=<abs> PF_S120_TAG=<tag> PF_S120_STYLE=<style> node <bundle>
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { readMeshF32 } from './s118MeshIo';
import { makeEdgeWorkspace, edgeRadialSag, weldExact, uniqueEdges, goldenMax } from './s120EdgeLib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ }
// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const STYLE = envS('PF_S120_STYLE', 'CelticTriquetra');
const STL = envS('PF_S120_STL', '');
const TAG = envS('PF_S120_TAG', 'RUN');
const OUTDIR = envS('PF_S120_OUTDIR', 'research/exchange/_strataConformBisect/s120');
const DIMS: StyleDims = { H: envF('PF_S120_H', 120), Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S120_BARHI', 0.01);
const BAR_LO = envF('PF_S120_BARLO', 0.001);
const TOPN = envI('PF_S120_SWEEPN', 4000);
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(4) : 'inf');
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
if (STL.length === 0) { log('*** PF_S120_STL required ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S120 EDGE-RULER INSTRUMENT SWEEP — ${STYLE}   tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
const M = readMeshF32(STL);
const WELD = weldExact(M.xyz);
const U = uniqueEdges(WELD.id, WELD.count, M.nTri);
const nE = U.count;
const vx = new Float64Array(WELD.count); const vy = new Float64Array(WELD.count); const vz = new Float64Array(WELD.count);
for (let c = 0; c < M.nTri * 3; c += 1) { const w = WELD.id[c]; vx[w] = M.xyz[c * 3]; vy[w] = M.xyz[c * 3 + 1]; vz[w] = M.xyz[c * 3 + 2]; }
const radBuf = readFileSync(`${OUTDIR}/S120_${TAG}_edgeRad.f32`);
const eRad = new Float32Array(radBuf.buffer, radBuf.byteOffset, radBuf.byteLength / 4);
if (eRad.length !== nE) { log(`*** edge count ${nE} != dump ${eRad.length} — RUN VOID ***`); process.exit(3); }
log(`mesh ${M.nTri.toLocaleString()} facets   ${nE.toLocaleString()} unique edges   dump length MATCHES`);
const ord = Array.from({ length: nE }, (_v, i) => i);
ord.sort((a, b) => eRad[b] - eRad[a]);
const SET = ord.slice(0, Math.min(TOPN, nE));
log(`sweep set: the worst ${SET.length.toLocaleString()} edges by radial sag (cut ${ex(eRad[SET[SET.length - 1]])} mm).`);
log('These are the edges that DETERMINE the headline max and dominate the over-bar tail, so a setting that');
log('cannot move them cannot move the headline.');
log('');
const J: Record<string, unknown> = { tag: TAG, style: STYLE, nE, sweepN: SET.length };

// ── S-A: nS ───────────────────────────────────────────────────────────────────────────────────────────
log('── S-A: THE s SAMPLING LADDER (scar 6), RADIAL, on the sweep set ──');
log('      nS      MAX mm        >0.01mm    >0.001mm     rA evals      s');
const rowsA: Array<Record<string, number>> = [];
for (const nS of [8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]) {
  const W = makeEdgeWorkspace(nS, 12);
  const t0 = Date.now(); let mx = 0; let cH = 0; let cL = 0; let calls = 0;
  for (const e of SET) {
    const a = U.eLo[e]; const b = U.eHi[e];
    edgeRadialSag(rA, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], 44, W);
    calls += W.rAcalls;
    if (W.max > mx) mx = W.max;
    if (W.max > BAR_HI) cH += 1;
    if (W.max > BAR_LO) cL += 1;
  }
  const dt = (Date.now() - t0) / 1000;
  log(`   ${String(nS).padStart(5)} ${ex(mx).padStart(13)} ${String(cH).padStart(11)} ${String(cL).padStart(11)} ${calls.toLocaleString().padStart(13)} ${dt.toFixed(1).padStart(7)}`);
  rowsA.push({ nS, max: mx, overHi: cH, overLo: cL, calls, seconds: dt });
}
J.sweepNS = rowsA;
log('   (a rung that no longer moves the MAX or the counts is a RESOLVED profile; a rung that still does');
log('    means the production nS is under-sampling and its number is an under-read.)');
log('');

// ── S-B / S-C: the projector ──────────────────────────────────────────────────────────────────────────
// One shared candidate set so every projector setting is asked the SAME question at the SAME points.
const NS_REF = 256;
const Wr = makeEdgeWorkspace(NS_REF, 12);
const candS: number[][] = [];
for (const e of SET) {
  const a = U.eLo[e]; const b = U.eHi[e];
  edgeRadialSag(rA, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], 44, Wr);
  const n = Math.min(4, Wr.nCand);
  const arr: number[] = [];
  for (let c = 0; c < n; c += 1) arr.push(Wr.candS[c]);
  candS.push(arr);
}
const runProj = (nTh: number, nZ: number, topK: number, hT: number, hZ: number): { max: number; cH: number; cL: number; sec: number; build: number } => {
  const tb = Date.now();
  const proj = buildRadialSurfaceProjector(rA, { H, nTheta: nTh, nZ, seedTopK: topK, hTheta: hT, hZ });
  const build = (Date.now() - tb) / 1000;
  const t0 = Date.now(); let mx = 0; let cH = 0; let cL = 0;
  for (let i = 0; i < SET.length; i += 1) {
    const e = SET[i];
    const a = U.eLo[e]; const b = U.eHi[e];
    const ax = vx[a], ay = vy[a], az = vz[a];
    const dx = vx[b] - ax, dy = vy[b] - ay, dz = vz[b] - az;
    let best = 0;
    for (const s of candS[i]) {
      const d = proj.project(ax + s * dx, ay + s * dy, az + s * dz).dist;
      if (d > best) best = d;
    }
    if (best > mx) mx = best;
    if (best > BAR_HI) cH += 1;
    if (best > BAR_LO) cL += 1;
  }
  return { max: mx, cH, cL, sec: (Date.now() - t0) / 1000, build };
};
log('── S-B: PROJECTOR SEED GRID + topK. Every returned distance is a valid UPPER bound, so a FINER grid');
log('   can only LOWER it. A non-monotone column is an instrument fault, not a mesh fact. ──');
log('      nTheta x nZ  topK      MAX mm       >0.01mm   >0.001mm   build s   scan s');
const rowsB: Array<Record<string, number>> = [];
for (const [nTh, nZ] of [[384, 192], [768, 384], [1024, 512], [1536, 768], [2304, 1152], [3072, 1536]]) {
  const r = runProj(nTh, nZ, 6, 1e-5, 1e-4);
  log(`   ${String(nTh).padStart(9)} x ${String(nZ).padStart(4)} ${String(6).padStart(5)} ${ex(r.max).padStart(13)} ${String(r.cH).padStart(11)} ${String(r.cL).padStart(10)} ${r.build.toFixed(1).padStart(9)} ${r.sec.toFixed(1).padStart(8)}`);
  rowsB.push({ nTheta: nTh, nZ, topK: 6, ...r });
}
for (const tk of [2, 4, 12, 24]) {
  const r = runProj(1536, 768, tk, 1e-5, 1e-4);
  log(`   ${String(1536).padStart(9)} x ${String(768).padStart(4)} ${String(tk).padStart(5)} ${ex(r.max).padStart(13)} ${String(r.cH).padStart(11)} ${String(r.cL).padStart(10)} ${r.build.toFixed(1).padStart(9)} ${r.sec.toFixed(1).padStart(8)}`);
  rowsB.push({ nTheta: 1536, nZ: 768, topK: tk, ...r });
}
J.sweepProjector = rowsB;
log('');
log('── S-C: PROJECTOR FINITE-DIFFERENCE STEPS hTheta / hZ (scar 3) ──');
log('        hTheta        hZ       MAX mm       >0.01mm   >0.001mm    scan s');
const rowsC: Array<Record<string, number>> = [];
for (const [hT, hZ] of [[1e-7, 1e-6], [1e-6, 1e-5], [1e-5, 1e-4], [1e-4, 1e-3], [1e-3, 1e-2]]) {
  const r = runProj(1536, 768, 6, hT, hZ);
  log(`   ${ex(hT).padStart(12)} ${ex(hZ).padStart(10)} ${ex(r.max).padStart(13)} ${String(r.cH).padStart(11)} ${String(r.cL).padStart(10)} ${r.sec.toFixed(1).padStart(9)}`);
  rowsC.push({ hTheta: hT, hZ, ...r });
}
J.sweepFd = rowsC;
log('');

// ── S-D: a BRUTE-FORCE twin on the edges that SET THE HEADLINE ────────────────────────────────────────
// BOTH quantities here are UPPER bounds on the true distance — the projector because seeded Gauss-Newton
// polishes to an actual surface point and keeps the best, the brute because a grid minimum is taken over
// a SUBSET of the surface. So the smaller one is the better estimate and the test has exactly ONE honest
// direction:  projector / brute > 1 means the projector is LOOSE THERE (a wrong or unpolished
// Gauss-Newton basin), and that ratio is the looseness of the published headline. A ratio far BELOW 1
// simply means the projector beat an exhaustive grid, which is the normal and desirable case.
//
// The first draft of this block asserted the opposite ("must never read below the brute") and would have
// reported a PASS as a FIRE. It is written out here because that inverted assertion is exactly the kind
// of one-sided instrument test this campaign has been bitten by.
//
// The probe point is the PERPENDICULAR argmax of the edge, found with no early-out, because that is the
// point that actually sets the mesh MAX — not the radial argmax, which on a cliff style is usually a
// vertex whose perpendicular distance is ~0.
{
  const perpBuf = readFileSync(`${OUTDIR}/S120_${TAG}_edgePerp.f32`);
  const ePerp = new Float32Array(perpBuf.buffer, perpBuf.byteOffset, perpBuf.byteLength / 4);
  const ordP = Array.from({ length: nE }, (_v, i) => i);
  ordP.sort((a, b) => ePerp[b] - ePerp[a]);
  const N = Math.min(envI('PF_S120_BRUTEN', 40), nE);
  const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1536, nZ: 768, seedTopK: 6 });
  const GT = envI('PF_S120_BRUTETH', 4096); const GZ = envI('PF_S120_BRUTEZ', 2048);
  log(`── S-D: BRUTE TWIN on the ${N} edges with the largest PERPENDICULAR sag — the ones that set the headline.`);
  log(`   Reference = an exhaustive ${GT} x ${GZ} scan of the WHOLE (theta,z) domain, then 4 rounds of nested`);
  log('   local refinement (each shrinking the window 8x, so the foot is located to ~1e-7 rad / ~1e-5 mm).');
  log('   BOTH numbers are UPPER bounds, so ratio > 1 = the PROJECTOR is loose there, and that ratio prices');
  log('   the looseness of the published max. Ratio < 1 = the projector beat the grid: normal and desirable.');
  log('      rank    projector mm     brute mm      ratio     s*');
  let worstRatio = 0; let nLoose = 0; let pmWorst = 0; let bdAtWorst = 0;
  const rowsD: Array<Record<string, number>> = [];
  for (let i = 0; i < N; i += 1) {
    const e = ordP[i];
    const a = U.eLo[e]; const b = U.eHi[e];
    const ax = vx[a], ay = vy[a], az = vz[a];
    const dx = vx[b] - ax, dy = vy[b] - ay, dz = vz[b] - az;
    const P = (s: number): number => proj.project(ax + s * dx, ay + s * dy, az + s * dz).dist;
    let pm = 0; let ps = 0;
    for (let k = 0; k <= NS_REF; k += 1) { const s = k / NS_REF; const d = P(s); if (d > pm) { pm = d; ps = s; } }
    const g = goldenMax(P, Math.max(0, ps - 1 / NS_REF), Math.min(1, ps + 1 / NS_REF), 30);
    if (g.v > pm) { pm = g.v; ps = g.s; }
    const px = ax + ps * dx, py = ay + ps * dy, pz = az + ps * dz;
    let bd2 = Infinity; let bth = 0; let bz = 0;
    for (let it = 0; it < GT; it += 1) {
      const th = (it / GT) * 2 * Math.PI; const cs = Math.cos(th); const sn = Math.sin(th);
      for (let jz = 0; jz <= GZ; jz += 1) {
        const zz = (jz / GZ) * H; const r = rA(th, zz);
        const exx = px - r * cs; const eyy = py - r * sn; const ezz = pz - zz;
        const d2 = exx * exx + eyy * eyy + ezz * ezz;
        if (d2 < bd2) { bd2 = d2; bth = th; bz = zz; }
      }
    }
    let wth = (2 * Math.PI) / GT; let wz = H / GZ;
    for (let round = 0; round < 4; round += 1) {
      for (let it = -8; it <= 8; it += 1) {
        for (let jz = -8; jz <= 8; jz += 1) {
          const th = bth + (it / 8) * wth; const zz = Math.min(H, Math.max(0, bz + (jz / 8) * wz));
          const r = rA(th, zz);
          const exx = px - r * Math.cos(th); const eyy = py - r * Math.sin(th); const ezz = pz - zz;
          const d2 = exx * exx + eyy * eyy + ezz * ezz;
          if (d2 < bd2) { bd2 = d2; bth = th; bz = zz; }
        }
      }
      wth /= 8; wz /= 8;
    }
    const bd = Math.sqrt(bd2);
    const ratio = pm / Math.max(1e-15, bd);
    if (ratio > worstRatio) { worstRatio = ratio; pmWorst = pm; bdAtWorst = bd; }
    if (ratio > 1 + 1e-6) nLoose += 1;
    if (i < 15) log(`   ${String(i + 1).padStart(7)} ${ex(pm).padStart(15)} ${ex(bd).padStart(13)} ${ratio.toFixed(5).padStart(10)} ${ps.toFixed(5).padStart(8)}`);
    rowsD.push({ rank: i + 1, edge: e, projector: pm, brute: bd, ratio, s: ps });
  }
  log(`   edges where the projector reads ABOVE the exhaustive reference: ${nLoose} of ${N} (${pct(nLoose, N)}%)`);
  log(`   *** WORST PROJECTOR LOOSENESS: ${worstRatio.toFixed(5)}x  (projector ${ex(pmWorst)} vs brute ${ex(bdAtWorst)} mm) ***`);
  log('   That factor is the honest uncertainty band on the published PERPENDICULAR EDGE MAX: the true');
  log('   value is at most the published one and at least published/worstRatio.');
  J.bruteTwin = { n: N, worstRatio, loose: nLoose, pmWorst, bdAtWorst, rows: rowsD.slice(0, 40) };
}
log('');
log(`sweep set was ${SET.length.toLocaleString()} edges = ${pct(SET.length, nE)}% of the mesh's edges — a SETTING-SENSITIVITY`);
log('table, never a mesh verdict. The mesh verdicts are in the S120_EDGE_* report.');
const jp = `${OUTDIR}/S120_SWEEP_${TAG}.json`;
writeFileSync(jp, JSON.stringify(J, null, 2));
log(`json -> ${jp}`);
log('S120 SWEEP DONE');
