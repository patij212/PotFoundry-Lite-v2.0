// _pf_tierab_slivers.test.ts — DEV-ONLY (PF_TIERAB=1 byte-identity; PF_SLIVERM=1 M=g/h2 sliver pass).
//
// E-2026-07-05-PERFECT-MESHER-TIERAB-SLIVERS. Two claims from the perfect-mesher spec (§4/§6), NEITHER measured
// before, now MEASURED with the honest instruments:
//   (1) CLOSER-OFF BYTE-IDENTITY: with the feature-graph closer OFF (EMPTY protected complex), is the kernel
//       output byte-identical (hash ut+indices) to "today's proven primitive" (buildInhouseMetricMesh = the
//       dense-M-square the dispatch table names) on a SMOOTH style (HarmonicRipple) + a Tier-B style (ArtDeco)?
//   (2) M=g/h2 SLIVER GATE holding 0-outlier: on the CONFIRMED 1-bay edge-mode Gothic mesh, apply a metric-aware
//       true-3D max-min-angle Lawson flip pass (crest edges LOCKED) and re-measure — does minAngle rise / %<20
//       fall WHILE the acceptance-guard interior outliers STAY 0 (both gates hold together)?
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib + inhouseMetricMesh
// (buildInhouseMetricMesh / flipHE) READ-ONLY. Writes ONLY research/exchange/_pf_tierab_slivers/. No src/ edit.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, flipHE, auditNonManByIndex, triangleQualityDistribution,
  type StyleDims, type AnalyticRadiusFn,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { seedMesh, acceptanceGuard, liftMesh, lift, makeGothicPatch, extractProtectedComplex, type PatchDef, type ProtectedComplex } from './_pf_perfectMesherLib';

const DIR = join(process.cwd(), 'research', 'exchange', '_pf_tierab_slivers');
const NDJSON = join(DIR, 'scorecard.ndjson');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(DIR, 'progress.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

const TAU = 2 * Math.PI;

// Canonical hash of (ut ++ indices): round ut to 1e-9 (kill f64 noise), triangle-order canonicalized (each tri's
// index triple sorted, then the whole tri list sorted) so a byte-identity verdict is invariant to CDT emission
// order but SENSITIVE to any point-set or connectivity difference. Also returns raw counts for the honest report.
function meshHash(ut: number[], tris: ArrayLike<number>): { hash: string; nV: number; nT: number; hashOrdered: string } {
  const nV = ut.length / 2, nT = tris.length / 3;
  const q = (x: number): string => (Math.round(x * 1e9) / 1e9).toFixed(9);
  const utStr = new Array(ut.length); for (let i = 0; i < ut.length; i++) utStr[i] = q(ut[i]);
  // ordered hash (emission order preserved) + canonical hash (order-invariant)
  const triArr: string[] = new Array(nT);
  for (let f = 0; f < nT; f++) { const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; const s = [a, b, c].sort((x, y) => x - y); triArr[f] = `${s[0]},${s[1]},${s[2]}`; }
  const triOrdered = triArr.join(';');
  const triCanon = triArr.slice().sort().join(';');
  const hashOrdered = createHash('sha256').update(utStr.join(',')).update('|').update(triOrdered).digest('hex');
  const hash = createHash('sha256').update(utStr.join(',')).update('|').update(triCanon).digest('hex');
  return { hash, hashOrdered, nV, nT };
}

// A FULL-DOMAIN patch (u∈[0,1], t∈[0.02,0.98]) for a general style — the closer-OFF kernel path. Mirrors
// makeGothicPatch's PatchDef shape but spans the whole surface (no apex-junction locate).
function makeFullPatch(styleId: StyleId, dims: StyleDims): PatchDef {
  const H = dims.H; const rMean = (dims.Rb + dims.Rt) / 2; const arcPerU = TAU * rMean;
  const rA = buildRadiusFn(styleId, {}, dims);
  return { rA, H, rMean, arcPerU, uLo: 0, uHi: 1, tLo: 0.02, tHi: 0.98 };
}
const EMPTY_COMPLEX = (): ProtectedComplex => ({ uv: [], constraintEdges: [], crestVertexSet: new Set<number>(), familyCount: 0, nSegU: 0, nSegT: 0, residualCrossings: 0, crestSamples3D: [] });

describe('pf-tierab-slivers: closer-OFF byte-identity + M=g/h2 sliver gate', () => {
  // ── (1) CLOSER-OFF BYTE-IDENTITY vs today's named primitive (buildInhouseMetricMesh) ──
  it.skipIf(process.env.PF_TIERAB !== '1')('byte-identity: closer-OFF kernel vs buildInhouseMetricMesh', () => {
    if (rowExists('byteident-artdeco') && rowExists('byteident-harmonic')) { plog('byte-identity rows exist, skip'); return; }
    const cases: Array<{ name: string; styleId: StyleId; tier: string }> = [
      { name: 'harmonic', styleId: 'HarmonicRipple' as StyleId, tier: 'A-smooth' },
      { name: 'artdeco', styleId: 'ArtDeco' as StyleId, tier: 'B' },
    ];
    mkdirSync(DIR, { recursive: true });
    const dims: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
    const rows: Record<string, unknown>[] = [];
    for (const c of cases) {
      const key = `byteident-${c.name}`;
      if (rowExists(key)) { plog(`${key} exists, skip`); continue; }
      const patch = makeFullPatch(c.styleId, dims);
      // CLOSER-OFF kernel path: seedMesh with an EMPTY protected complex (no locked crest edges). bgArcMm chosen
      // to land a comparable budget to the metric mesh at a modest density. Run TWICE → determinism check.
      const bgArcMm = 1.2;
      const s1 = seedMesh(patch, EMPTY_COMPLEX(), bgArcMm);
      const s2 = seedMesh(patch, EMPTY_COMPLEX(), bgArcMm);
      const h1 = meshHash(s1.uv, s1.tris), h2 = meshHash(s2.uv, s2.tris);
      const deterministic = h1.hash === h2.hash && h1.hashOrdered === h2.hashOrdered;

      // TODAY'S NAMED PRIMITIVE: buildInhouseMetricMesh (M=g/h2, the dispatch-table "dense-M-square").
      const prim = buildInhouseMetricMesh(patch.rA, patch.H, { tolMm: 0.1, hMin: 0.2, hMax: 4, maxPoints: 400000, optimizeSweeps: 4 });
      const hp = meshHash(prim.ut, Array.from(prim.indices));
      const byteIdentical = h1.hash === hp.hash;

      const row = {
        key, style: c.name, tier: c.tier,
        closerOffV: h1.nV, closerOffT: h1.nT, closerOffHash: h1.hash.slice(0, 16),
        primitiveV: hp.nV, primitiveT: hp.nT, primitiveHash: hp.hash.slice(0, 16),
        deterministic, byteIdentical,
        note: byteIdentical ? 'closer-OFF == buildInhouseMetricMesh' : 'closer-OFF (uniform-grid CDT) != buildInhouseMetricMesh (M=g/h2 adaptive+flip+smooth)',
      };
      writeFileSync(join(DIR, `${key}.json`), JSON.stringify(row, null, 2));
      checkpoint(row); rows.push(row);
      plog(`[byte-identity ${c.name}] closerOff=${h1.nV}v/${h1.nT}t primitive=${hp.nV}v/${hp.nT}t deterministic=${deterministic} byteIdentical=${byteIdentical}`);
    }
    expect(rows.length + (rowExists('byteident-harmonic') ? 1 : 0)).toBeGreaterThan(0);
  }, 20 * 60 * 1000);

  // ── (2) M=g/h2 SLIVER GATE on the CONFIRMED 1-bay edge-mode Gothic mesh (loaded from persisted refined bin) ──
  it.skipIf(process.env.PF_SLIVERM !== '1')('sliver-M: true-3D max-min flip pass, crest LOCKED — minAngle up, outliers stay 0', () => {
    if (rowExists('sliver-M')) { plog('sliver-M exists, skip'); return; }
    // load the persisted 1-bay edge-mode refined mesh. The CONFIRMED 1-bay edge run used PF_SMOKE=1 (writes the
    // _smoke exchange dir) with PF_BAYS=1 PF_ZBAND=5 → its refined_mesh.bin (9885 tris, passes=5, capped=0) is the
    // E-…-BRUTE CONFIRM mesh (scorecard_edge_1bay.ndjson). Reconstruct the patch+complex with the SAME SMOKE params.
    const MESHDIR = process.env.PF_MESHDIR ?? join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_brute_smoke');
    const MESHBIN = join(MESHDIR, 'refined_mesh.bin');
    if (!existsSync(MESHBIN)) { plog(`[sliver-M] persisted mesh missing at ${MESHBIN} — run PF_PERFECTBRUTE=1 PF_MODE=edge PF_SMOKE=1 PF_BAYS=1 PF_ZBAND=5 first`); expect(true).toBe(true); return; }
    const buf = readFileSync(MESHBIN);
    const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
    const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
    let o = 16; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
    for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
    plog(`[sliver-M] loaded persisted mesh: ${nV}v ${nT}t`);

    // rebuild the SAME 1-bay patch + protected complex the BRUTE probe used (to know the LOCKED crest edges).
    const BAYS = Number(process.env.PF_BAYS ?? 1);
    const ZBAND_MM = Number(process.env.PF_ZBAND ?? 5);
    // SMOKE grid params (the CONFIRM run used PF_SMOKE=1): N_ROW=N_COL=120, MIN_AMP=0.03. Must MATCH so the
    // protected-complex vertex indices (the first pc.uv.length/2 mesh verts) align with the persisted mesh.
    const N_ROW = Number(process.env.PF_NROW ?? 120), N_COL = Number(process.env.PF_NCOL ?? 120), MIN_AMP = 0.03;
    const patch: PatchDef = makeGothicPatch(BAYS, ZBAND_MM);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[sliver-M] rebuilt complex: cEdges=${pc.constraintEdges.length} crestVerts=${pc.crestVertexSet.size} (expect cEdges=141 for the CONFIRM mesh)`);
    // ALIGNMENT GUARD: the crest constraint edges index into the first pc.uv verts, which must be a PREFIX of the
    // persisted mesh. Verify a sampling of crest vertices sit exactly on the mesh (same (u,t)) — else params drift.
    let aligned = true, checked = 0;
    for (let i = 0; i < Math.min(pc.uv.length / 2, 20); i++) { if (i * 2 + 1 < uv.length) { if (Math.abs(pc.uv[2 * i] - uv[2 * i]) > 1e-9 || Math.abs(pc.uv[2 * i + 1] - uv[2 * i + 1]) > 1e-9) aligned = false; checked++; } }
    plog(`[sliver-M] complex-mesh alignment: aligned=${aligned} checkedPrefixVerts=${checked} cEdges=${pc.constraintEdges.length}`);

    const xyz = liftMesh(patch, uv);

    // BEFORE: baseline slivers + guard (reuse the persisted mesh's own connectivity).
    const qBefore = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(tris) });
    const TOP = Number(process.env.PF_GCAP ?? 400);
    const guardBefore = acceptanceGuard(patch, uv, tris, 0.01, 0.06, pc.crestSamples3D, TOP);
    plog(`[sliver-M] BEFORE: minAngle=${qBefore.minAngleDeg.toFixed(2)} median=${qBefore.medianMinAngleDeg.toFixed(2)} pct<20=${qBefore.pctBelow20.toFixed(1)}% | guard outliers=${guardBefore.interiorOutliers} max=${guardBefore.interiorMaxMm}`);

    // ORIENTATION NORMALIZE (measured: cdt2d emits a MIXED orientation — 172/9885 tris are CW, the rest CCW).
    // flipHE follows Delaunator's relink which assumes a UNIFORM winding; a CW triangle corrupts the al/ar/bl
    // corner logic → destroys edges (incl. locked crest edges) near the apex. Force every tri CCW in the raw (u,t)
    // chart (the space flipHE's straddle predicate uses) BEFORE building the halfedge twins. This was the
    // instrument bug that made the first run read crestKept=122/141 + outliers 0→57 (a false REFUTE artifact).
    let cwFixed = 0;
    for (let t = 0; t < tris.length / 3; t++) {
      const a = tris[3 * t], b = tris[3 * t + 1], c = tris[3 * t + 2];
      const ar2 = (uv[2 * b] - uv[2 * a]) * (uv[2 * c + 1] - uv[2 * a + 1]) - (uv[2 * b + 1] - uv[2 * a + 1]) * (uv[2 * c] - uv[2 * a]);
      if (ar2 < 0) { tris[3 * t + 1] = c; tris[3 * t + 2] = b; cwFixed++; }
    }
    plog(`[sliver-M] orientation-normalize: forced ${cwFixed} CW tris to CCW`);

    // Build a halfedge structure from the (now CCW) triangle soup so flipHE can run. Twin of a directed edge (i->j)
    // in triangle t at corner-offset e is the directed edge (j->i) in the neighbour triangle.
    const buildHE = (T: number[]): Int32Array => {
      const ne = T.length; const he = new Int32Array(ne).fill(-1);
      const em = new Map<number, number>(); // key (min*K+max)+dir-bit? use directed key vFrom*K+vTo → halfedge id
      const nVe = nV; const K = nVe + 1;
      for (let e = 0; e < ne; e++) {
        const t = (e / 3) | 0; const c = e % 3;
        const vFrom = T[3 * t + c], vTo = T[3 * t + (c + 1) % 3];
        em.set(vFrom * K + vTo, e);
      }
      for (let e = 0; e < ne; e++) {
        const t = (e / 3) | 0; const c = e % 3;
        const vFrom = T[3 * t + c], vTo = T[3 * t + (c + 1) % 3];
        const twin = em.get(vTo * K + vFrom);
        if (twin !== undefined) he[e] = twin;
      }
      return he;
    };

    // LOCKED constraint edges (crest) — a set of undirected (min,max) keys; flipHE.isLocked never flips these.
    // The refine loop SUBDIVIDES crest edges (edge-mode inserts crest-edge midpoints) → the original (a,b) is no
    // longer one mesh edge but a chain (a,m,…,b). So lock (1) the original constraint edges AND (2) any mesh edge
    // whose BOTH endpoints are crest vertices (catches the subdivided crest sub-edges) — this is the true no-bridge
    // protected set. Controlled by PF_CRESTVERTLOCK (default on).
    const K2 = nV + 1;
    const crestVerts = pc.crestVertexSet;
    const CRESTVERT_LOCK = process.env.PF_CRESTVERTLOCK !== '0';
    const lockedSet = new Set<number>();
    for (const [a, b] of pc.constraintEdges) { const lo = Math.min(a, b), hi = Math.max(a, b); lockedSet.add(lo * K2 + hi); }
    const isLocked = (pr: number, pl: number): boolean => {
      const lo = Math.min(pr, pl), hi = Math.max(pr, pl);
      if (lockedSet.has(lo * K2 + hi)) return true;
      if (CRESTVERT_LOCK && crestVerts.has(pr) && crestVerts.has(pl)) return true; // subdivided crest sub-edge
      return false;
    };

    // DIAGNOSTIC (PF_LOCKALL=1): lock EVERY edge ⇒ flipHE must perform ZERO flips ⇒ the mesh must be BYTE-identical.
    // If crestKept still drops or outliers still reopen, the corruption is in the halfedge relink / structure, NOT
    // the crest-lock logic — isolates the instrument bug before any Part-2 fidelity verdict.
    const LOCK_ALL = process.env.PF_LOCKALL === '1';

    const triU = Uint32Array.from(tris);
    const he = buildHE(tris);
    // halfedge sanity: count -1 (boundary) + verify twin symmetry.
    let heBoundary = 0, heAsym = 0;
    for (let e = 0; e < he.length; e++) { if (he[e] === -1) heBoundary++; else if (he[he[e]] !== e) heAsym++; }
    plog(`[sliver-M] halfedge: boundary=${heBoundary} asymmetricTwins=${heAsym} (asym>0 ⇒ bad structure)`);
    // true-3D max-min-angle Lawson flips = the M=g/h2 surface-metric quality criterion (3D angle == pullback-metric
    // angle). guardManifold=true (the pinned/constrained config can request a duplicate-diagonal flip). Vertices do
    // NOT move → surface fidelity of every remaining facet is positionally unchanged; only connectivity improves.
    const SWEEPS = Number(process.env.PF_FLIPSWEEPS ?? 8);
    const lockFn = LOCK_ALL ? ((): boolean => true) : isLocked;
    // FIDELITY-GUARDED flip criterion (PF_FIDFLIP=1): accept a flip ONLY if it (a) raises the worse true-3D
    // min-angle AND (b) does NOT create a diagonal whose facet chord-sag bridges the surface > tol. This tests
    // whether a fidelity-AWARE quality pass can hold BOTH gates (the pure max-min-angle pass could not — it bridges
    // the concave apex). chordSag = max facet→surface true-3D over 4 bary samples of the 2 new triangles.
    const FIDFLIP = process.env.PF_FIDFLIP === '1';
    const CHORDTOL = 0.01;
    const liftUt = (u: number, t: number): [number, number, number] => lift(patch.rA, u, t, patch.H);
    const facetSag = (a: number, b: number, c: number): number => {
      const A = liftUt(uv[2 * a], uv[2 * a + 1]), B = liftUt(uv[2 * b], uv[2 * b + 1]), C = liftUt(uv[2 * c], uv[2 * c + 1]);
      let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let mx = 0;
      for (const [w0, w1, w2] of [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]] as [number, number, number][]) {
        const P = liftUt(w0 * uv[2 * a] + w1 * uv[2 * b] + w2 * uv[2 * c], w0 * uv[2 * a + 1] + w1 * uv[2 * b + 1] + w2 * uv[2 * c + 1]);
        const d = Math.abs((P[0] - A[0]) * nx + (P[1] - A[1]) * ny + (P[2] - A[2]) * nz); if (d > mx) mx = d;
      }
      return mx;
    };
    const maxCos3 = (a: number, b: number, c: number): number => {
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2], cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      const la2 = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2, lb2 = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2, lc2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
      if (la2 < 1e-24 || lb2 < 1e-24 || lc2 < 1e-24) return 1;
      return Math.max((lb2 + lc2 - la2) / (2 * Math.sqrt(lb2 * lc2)), (la2 + lc2 - lb2) / (2 * Math.sqrt(la2 * lc2)), (la2 + lb2 - lc2) / (2 * Math.sqrt(la2 * lb2)));
    };
    const fidShouldFlip = (pr: number, pl: number, p0: number, p1: number): boolean => {
      const cur = Math.max(maxCos3(pr, pl, p0), maxCos3(pr, pl, p1));
      const flp = Math.max(maxCos3(p0, p1, pl), maxCos3(p0, p1, pr));
      if (!(flp < cur - 1e-9)) return false; // must improve min-angle
      if (Math.max(facetSag(p0, p1, pl), facetSag(p0, p1, pr)) > CHORDTOL) return false; // must NOT bridge the surface
      return true;
    };
    const edgeKeySet = (T: ArrayLike<number>): Set<number> => { const s = new Set<number>(); for (let f = 0; f < T.length / 3; f++) for (let c = 0; c < 3; c++) { const a = T[3 * f + c], b = T[3 * f + (c + 1) % 3]; const lo = Math.min(a, b), hi = Math.max(a, b); s.add(lo * K2 + hi); } return s; };
    const edgesBefore = edgeKeySet(triU);
    flipHE(triU, he, xyz, uv, SWEEPS, FIDFLIP ? fidShouldFlip : undefined, lockFn, true);
    const trisAfter = Array.from(triU);
    const edgesAfter = edgeKeySet(triU);
    let flipsFired = 0; for (const k of edgesAfter) if (!edgesBefore.has(k)) flipsFired++;
    plog(`[sliver-M] flips fired (new edges) = ${flipsFired}`);

    // AFTER: slivers + guard + watertight (non-vacuous).
    const qAfter = triangleQualityDistribution({ vertices: xyz, indices: triU });
    const guardAfter = acceptanceGuard(patch, uv, trisAfter, 0.01, 0.06, pc.crestSamples3D, TOP);
    const nonMan = auditNonManByIndex(xyz, trisAfter, 1e-4);
    // non-vacuous control
    const a0 = trisAfter[0], b0 = trisAfter[1]; const vNew = nV;
    const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
    xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
    const crackTris = trisAfter.slice(); crackTris.push(a0, b0, vNew);
    const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
    const nonVacuous = nonManCracked > nonMan;

    // verify no crest edge was flipped (no-bridge preserved): count locked edges still present as mesh edges.
    const present = new Set<number>();
    for (let f = 0; f < trisAfter.length / 3; f++) { for (let c = 0; c < 3; c++) { const a = trisAfter[3 * f + c], b = trisAfter[3 * f + (c + 1) % 3]; const lo = Math.min(a, b), hi = Math.max(a, b); present.add(lo * K2 + hi); } }
    let crestPresent = 0; for (const k of lockedSet) if (present.has(k)) crestPresent++;
    const crestKept = `${crestPresent}/${lockedSet.size}`;

    const outliersStay0 = guardAfter.interiorOutliers === 0;
    const sliverImproved = qAfter.minAngleDeg > qBefore.minAngleDeg + 0.5 || qAfter.pctBelow20 < qBefore.pctBelow20 - 2;
    const row = {
      key: 'sliver-M', bays: BAYS, tris: nT, flipSweeps: SWEEPS,
      minAngleBefore: +qBefore.minAngleDeg.toFixed(2), minAngleAfter: +qAfter.minAngleDeg.toFixed(2),
      medianBefore: +qBefore.medianMinAngleDeg.toFixed(2), medianAfter: +qAfter.medianMinAngleDeg.toFixed(2),
      pctBelow20Before: +qBefore.pctBelow20.toFixed(1), pctBelow20After: +qAfter.pctBelow20.toFixed(1),
      guardOutliersBefore: guardBefore.interiorOutliers, guardMaxBefore: guardBefore.interiorMaxMm,
      guardOutliersAfter: guardAfter.interiorOutliers, guardMaxAfter: guardAfter.interiorMaxMm, guardP99After: guardAfter.p99,
      afterOnCrestOutliers: guardAfter.onCrestOutliers, afterOffCrestOutliers: guardAfter.offCrestOutliers, flipsFired,
      lockAll: LOCK_ALL, crestVertLock: CRESTVERT_LOCK, fidFlip: FIDFLIP,
      watertightNonMan: nonMan, nonManInjected: nonManCracked, nonVacuous, crestKept, aligned,
      outliersStay0, sliverImproved,
      bothGatesHold: outliersStay0 && sliverImproved && nonVacuous && crestPresent === lockedSet.size,
    };
    writeFileSync(join(DIR, 'sliver-M.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[sliver-M] AFTER flips: minAngle ${qBefore.minAngleDeg.toFixed(2)}→${qAfter.minAngleDeg.toFixed(2)} pct<20 ${qBefore.pctBelow20.toFixed(1)}→${qAfter.pctBelow20.toFixed(1)} | outliers ${guardBefore.interiorOutliers}→${guardAfter.interiorOutliers} max→${guardAfter.interiorMaxMm} | crestKept=${crestKept} nonVac=${nonVacuous}`);
    void lift;
    expect(trisAfter.length).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
