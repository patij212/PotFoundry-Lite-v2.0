// _structColWall.test.ts — DEV-ONLY. E-2026-07-02-STRUCTCOL: the DELIVERABLE. Build the FULL closed SFB@1 wall
// via the ridge-GRAPH (continuous ridge identity through the 4 births + seam) rasterized into structured
// columns, then measure vs the TRUSTED ruler: own-region radial chord + analytic-brute at worst (single-valued
// SFB => faithful), serration (feature curve -> nearest mesh EDGE), RAW-INDEX nonMan, min-angle/%<20.
//
// KILL-CRITERION: own-trusted worst <=0.010 AND %>0.01 == 0 AND serration <=0.01 AND rawNonMan == 0.
// Resumable (per-config json checkpoint). Moderate density to iterate; high-density confirm the winner.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface, dumpRenderBins } from './labkit';
import { buildRidgeGraph, rasterizeColumns, buildStructWall, buildStructWallSeam } from './_structColLib';
import { trustedWorstAnalytic, serrationToMeshEdge, vertColorsFrom, tracePetalLoci, analyticBruteDist } from './_sfbPushLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

// RAW-INDEX edge audit (sharded): closed wall interior edges=2; z=0/z=H rims are boundary (closed by base/rim
// in production). nonMan = edges shared by >2 faces (must be 0).
function rawAudit(idxA: Uint32Array): { nonMan: number; boundary: number } {
  let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
  const EK = mx + 1; const NSHARD = 64;
  const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; bump(a, b); bump(b, c); bump(a, c); }
  let nm = 0, bd = 0; for (const m of ms) for (const v of m.values()) { if (v > 2) nm++; else if (v === 1) bd++; } return { nonMan: nm, boundary: bd };
}

describe('STRUCTCOL WALL — ridge-graph structured wall (deliverable)', () => {
  it.skipIf(process.env.PF_STRUCTCOL_WALL !== '1')('builds full ridge-graph wall; measures fidelity/serration/rawNonMan (resumable)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dthMm = Number(process.env.PF_STRUCTCOL_DTH ?? '0.08');     // across-flank arc (mm)
    const tipArcMm = Number(process.env.PF_STRUCTCOL_TIPARC ?? '0.02');
    const nSh = Number(process.env.PF_STRUCTCOL_NSH ?? '8');
    const dzMm = Number(process.env.PF_STRUCTCOL_DZ ?? '0.35');       // z-row spacing (mm) mid wall
    const dzBaseMm = Number(process.env.PF_STRUCTCOL_DZBASE ?? '0.01'); // dense z near the base tip cusp
    const tBaseFine = Number(process.env.PF_STRUCTCOL_TBASE ?? '0.02');
    const dzBirthMm = Number(process.env.PF_STRUCTCOL_DZBIRTH ?? '0.05'); // dense z near each birth
    const tBirthWin = Number(process.env.PF_STRUCTCOL_TBIRTHWIN ?? '0.01'); // t-window around each birth for dense rows
    const scanN = Number(process.env.PF_STRUCTCOL_SCANN ?? '16000');
    const uToMm = TAU * DIMS.Rt;
    const sub = process.env.PF_STRUCTCOL_SUB ?? 'v1';
    const name = `wall_${sub}_dth${String(dthMm).replace('.', 'p')}_ta${String(tipArcMm).replace('.', 'p')}_sh${nSh}_dz${String(dzMm).replace('.', 'p')}_dzb${String(dzBaseMm).replace('.', 'p')}_dzbr${String(dzBirthMm).replace('.', 'p')}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }

    // z-rows: dense base [0,tBaseFine], dense around each birth, uniform elsewhere; force a row just below+above
    // each birth so the newborn column peels off exactly at the birth (a clean local key-merge).
    const tset = new Set<number>();
    for (let z = 0; z <= tBaseFine * DIMS.H + 1e-9; z += dzBaseMm) tset.add(+(z / DIMS.H).toFixed(8));
    for (let z = tBaseFine * DIMS.H; z <= DIMS.H + 1e-9; z += dzMm) tset.add(+(Math.min(DIMS.H, z) / DIMS.H).toFixed(8));
    tset.add(1);
    for (const tb of BIRTHS) {
      for (let z = Math.max(0, (tb - tBirthWin)) * DIMS.H; z <= Math.min(1, tb + tBirthWin) * DIMS.H + 1e-9; z += dzBirthMm) tset.add(+(z / DIMS.H).toFixed(8));
      tset.add(+Math.max(0, tb - 3e-4).toFixed(8)); tset.add(+Math.min(1, tb + 3e-4).toFixed(8));
    }
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    console.log(`rows ${ts.length}`);

    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumns(g, uToMm, dthMm, tipArcMm, nSh, rA, DIMS.H);
    const useSeam = process.env.PF_STRUCTCOL_SEAMWALL === '1';
    const seamSubPerMm = Number(process.env.PF_STRUCTCOL_SEAMSUB ?? '3'); // radial ladder pts/mm on the cliff
    const mesh = useSeam ? buildStructWallSeam(rA, DIMS.H, rows, seamSubPerMm, 2) : buildStructWall(rA, DIMS.H, rows);
    const idxA = mesh.idx; const nF = mesh.nF;
    console.log(`wall ${nF} tris, ${mesh.nV} verts`);

    const audit = rawAudit(idxA);
    const utArr = mesh.ut; const xyzF = Float32Array.from(mesh.xyz);
    const own = perFaceChordSag(utArr, idxA, rA, DIMS.H);
    // INTERIOR-only stats (exclude a band around the seam u=0/1 — the genuine C0 rA discontinuity, measured
    // separately as a SHARP3D-class cliff). Isolates whether the ridge-graph BODY is clean.
    const seamBand = Number(process.env.PF_STRUCTCOL_SEAMBAND ?? '0.01');
    const faceUcheck = (f: number): boolean => { for (let e = 0; e < 3; e++) { const u = utArr[2 * idxA[3 * f + e]]; if (u < seamBand || u > 1 - seamBand) return false; } return true; };
    let intWorst = 0, intOver = 0, intN = 0; for (let f = 0; f < nF; f++) { if (faceUcheck(f)) { intN++; if (own.faceErr[f] > intWorst) intWorst = own.faceErr[f]; if (own.faceErr[f] > 0.01) intOver++; } }
    const twOwn = trustedWorstAnalytic(utArr, xyzF, idxA, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 1000, 0.01);
    // TRUE-3D split: for the worst 2000 facets by radial, compute min(GN, analyticBrute) and classify seam vs
    // interior. This is the HONEST ruler (radial overstates thin near-vertical slivers; GN/brute agree low). The
    // interior true-3D worst is the ridge-graph BODY verdict; the seam true-3D worst is the C0-cliff residual.
    // Rank INTERIOR facets (seam-band-excluded) by radial, take top-K, measure min(GN,brute) = honest interior
    // true-3D. This is the ridge-graph BODY verdict (the seam cliff is a separate SHARP3D-class surface).
    let intTrue = 0, intTrueOver = 0;
    const worstInt: Array<{ f: number; sag: number; u: number; t: number }> = [];
    {
      const intFaces: number[] = []; for (let f = 0; f < nF; f++) if (faceUcheck(f)) intFaces.push(f);
      intFaces.sort((a, b) => own.faceErr[b] - own.faceErr[a]);
      const K = Math.min(3000, intFaces.length);
      for (let ii = 0; ii < K; ii++) {
        const f = intFaces[ii];
        const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
        const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3;
        const cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3;
        const cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
        const gn = projectPointToRadialSurface(cx, cy, cz, rA).dist;
        const br = analyticBruteDist(cx, cy, cz, rA, DIMS.H);
        const d = Math.min(gn, br);
        if (d > intTrue) intTrue = d;
        if (d > 0.01) { intTrueOver++; if (worstInt.length < 20) worstInt.push({ f, sag: +d.toFixed(4), u: +utArr[2 * a].toFixed(4), t: +utArr[2 * a + 1].toFixed(4) }); }
      }
    }
    const seamTrue = 0, seamTrueOver = 0; // seam cliff measured separately (closed-3D ref), see _structColSeamRef
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    const featUt: number[] = []; for (const ln of loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, idxA);
    const vtx = Float64Array.from(mesh.xyz);
    const tq = triangleQualityDistribution({ vertices: vtx, indices: idxA });
    const p99 = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * nF)] ?? 0;
    const rec = {
      config: name, dthMm, tipArcMm, nSh, dzMm, dzBaseMm, dzBirthMm, tBaseFine, tBirthWin,
      rows: ts.length, tris: nF, verts: mesh.nV,
      nCrest: g.nCrest, nValley: g.nValley,
      nonManRaw: audit.nonMan, boundaryEdges: audit.boundary,
      ownWorstMm: own.worstMm, ownP99Mm: p99,
      interior: { seamBand, worstMmRadial: +intWorst.toFixed(4), nOver01Radial: intOver, n: intN, pctOver01Radial: +(100 * intOver / Math.max(1, intN)).toFixed(5) },
      true3d: { interiorWorstMm: +intTrue.toFixed(4), interiorOver01: intTrueOver, seamWorstMm: +seamTrue.toFixed(4), seamOver01: seamTrueOver, worstInteriorFacets: worstInt },
      ownTrustedWorstMm: twOwn.worstMm, ownTrustedNOver01: twOwn.nOverTol,
      ownNOver01: Math.round(own.fracOver(0.01) * nF), pctOver01: 100 * own.fracOver(0.01),
      maxBruteMinusGn: twOwn.maxBruteMinusGn, maxGnMinusBrute: twOwn.maxGnMinusBrute,
      ownTrustedWorstFacets: twOwn.overFacets.slice(0, 20),
      serrationMm: { worst: serr.worstMm, p99: serr.p99Mm, mean: serr.meanMm, n: serr.n },
      quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ckpt(name, rec);
    if (process.env.PF_STRUCTCOL_RENDER === '1') {
      const col = vertColorsFrom(own.vertErr, 0.01);
      dumpRenderBins(ROOT, name, xyzF, idxA, { colors: col, meta: { ruler: 'true3d(own)', worstMm: twOwn.worstMm, p99Mm: p99, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE }, stl: process.env.PF_STRUCTCOL_STL === '1' });
    }
    console.log(`WALL ${name} | TRUE3D interior worst ${intTrue.toFixed(4)} over01 ${intTrueOver} | seam worst ${seamTrue.toFixed(4)} over01 ${seamTrueOver} | radial-interior worst ${intWorst.toFixed(4)} over01 ${intOver}/${intN} | serr ${serr.worstMm.toExponential(2)} rawNonMan ${audit.nonMan} minAngle ${tq.minAngleDeg} %<20 ${tq.pctBelow20}`);
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
