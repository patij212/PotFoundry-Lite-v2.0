// _gyroid_literal0.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-08-GYROID-LITERAL0 (round 4). Drive Gyroid to LITERAL whole-mesh Newton-0 under the RAISED 8-10M budget.
// Follow-up to E-2026-07-08-GYROID-POLISH (§V11q): the DOUBLED wall-band mechanism is PROVEN; the residual is RAMP
// chord-sag between the doubled edges (saddle/mid-rung REFUTED). §V11q best (adaptD, picket 0.10→0.04, 2M budget,
// chordTol 0.003) = whole-mesh p99 0.00918 <tol, trueMax 0.0206, 583 on-wall outliers @ 4.0M tris. The pilot IS the
// full pot (H=120, whole azimuth) ⇒ tris≈projFullPot; adaptD's 4.0M ≪ 10M ⇒ ~2.5× budget headroom.
//   H1 BRUTE BUDGET: re-run the proven adaptD picket at RAISED maxPoints (3.5-5M → tris ~7-10M) + moderately tighter
//     chordTol (0.002-0.0015), watching recovery% (§V11q tell). A modest global density bump may clear the [0.010,
//     0.012] tail before any new mechanism is needed.
//   VERDICT is the LITERAL basis: radial-prefilter ALL facets + Newton on EVERY non-green (no stratified sampling on
//     the final mesh for the CLOSE claim; tighten the prefilter bound below tol if the non-green set is intractable).
//   PF_GL0=1 PF_GL=build   : conforming re-mesh (adaptive doubled picket + chord-Steiner). PF_GL*TAG/... below.
//   PF_GL0=1 PF_GL=verdict : LITERAL whole-mesh Newton gate (ALL radial-outliers, no sample) + serration + watertight.
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GYROID_DEFAULTS, wallIsolevels, gyroidVal,
  decimateContoursAdaptive, contoursToConstraints, type Contour,
} from './_gyroidContourLib';
import { radiusFn, TANGLED_BASE, wholeMeshGuardRadialBound } from './_pf_tangledKernelLib';
import { buildInhouseMetricMesh } from './labkit';
import { newtonNearest, type NewtonOpts } from './_gyroid_truthLib';
import type { StyleDims } from './labkit';

const RUN = process.env.PF_GL0 === '1';
const DIR = join(process.cwd(), 'research/exchange/_gyroid_literal0');
const CLOSE_DIR = join(process.cwd(), 'research/exchange/_gyroid_close');
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const P = GYROID_DEFAULTS;
const TAU = 2 * Math.PI;

type RawContours = { isolevels: { inner: number; outer: number; mid: number }; outer: number[][][]; inner: number[][][]; mid: number[][][] };
const loadRefined = (): RawContours => JSON.parse(readFileSync(join(CLOSE_DIR, 'contours_refined.json'), 'utf8')) as RawContours;
const asC = (arr: number[][][]): Contour[] => arr.map((pts) => ({ pts: pts as [number, number][] }));

// Large-mesh-safe non-manifold audit by INDEX. auditNonManRaw/auditNonManByIndex use a JS Map whose entry count
// caps at ~16.7M — a 7-10M-tri mesh has 21-30M undirected edges and overflows it (RangeError: Map maximum size
// exceeded). This sorts a Float64 edge-key array instead (no size cap): key = minIdx*2^27 + maxIdx (exact for
// indices < 2^26 = 67M ⇒ product < 2^53). Non-manifold = any undirected edge shared by >2 triangles.
function nonManRawBig(idx: ArrayLike<number>): number {
  const nE = (idx.length / 3) * 3;
  const keys = new Float64Array(nE);
  let m = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    const e = [[a, b], [b, c], [c, a]] as const;
    for (const [p, q] of e) { const lo = p < q ? p : q, hi = p < q ? q : p; keys[m++] = lo * 134217728 + hi; }
  }
  const sub = keys.subarray(0, m); sub.sort();
  let nm = 0;
  for (let i = 0; i < m;) { let j = i + 1; while (j < m && sub[j] === sub[i]) j++; if (j - i > 2) nm++; i = j; }
  return nm;
}

describe('E-2026-07-08-GYROID-LITERAL0', () => {
  // ── STAGE BUILD: adaptive doubled picket + chord-Steiner conforming re-mesh at the RAISED budget ────────────────
  // Reuses the PROVEN §V11q adaptD recipe. Levers via env:
  //   PF_GLSTEP  (base picket mm, def 0.10)   PF_GLFINE (fineFactor, def 0.4)
  //   PF_GLGRADLO/GLGRADHI (grad ramp, def 20/34)
  //   PF_GLMAX   (budget, def 4_000_000)      PF_GLCHORD (chordTolMm, def 0.002)   PF_GLTAG (mesh tag, req)
  it.skipIf(!RUN || process.env.PF_GL !== 'build')('BUILD conforming re-mesh (raised budget)', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const raw = loadRefined();
    const stepMm = Number(process.env.PF_GLSTEP ?? '0.10');
    const fineFactor = Number(process.env.PF_GLFINE ?? '0.4');
    const gradLo = Number(process.env.PF_GLGRADLO ?? '20');
    const gradHi = Number(process.env.PF_GLGRADHI ?? '34');
    const maxPoints = Number(process.env.PF_GLMAX ?? '4000000');
    const chordTolMm = Number(process.env.PF_GLCHORD ?? '0.002');
    const tag = process.env.PF_GLTAG ?? 'L0';

    // doubled pair (inner+outer), adaptively decimated (finer where the band is steep) — the §V11q adaptD picket.
    const pair = [...asC(raw.inner), ...asC(raw.outer)];
    const ad = decimateContoursAdaptive(pair, stepMm, fineFactor, gradLo, gradHi, P, rA, DIMS.H);
    const contours = ad.contours;
    const { injectedPoints, constraintEdges } = contoursToConstraints(contours);
    const nConstraintVerts = injectedPoints.length / 2, nConstraintEdges = constraintEdges.length / 2;

    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      ...TANGLED_BASE, maxPoints, optimizeSweeps: 2,
      guardManifoldAlways: true, chordTolMm, chordSteiner: true,
      injectedPoints, constraintEdges, pinInjected: true,
      guardRecoveryManifold: true, recoveryRobust: true, recoverySubdivideCollinear: true,
      recoveryCollinearEps: Number(process.env.PF_GLEPS ?? '1e-9'),
    });
    const ms = Date.now() - t0;
    const ut = mesh.ut, idx = mesh.indices, tris = idx.length / 3;

    // PERSIST FIRST — a 3.5M-point build is ~23min; never lose it to a downstream instrument crash. The VERDICT
    // stage re-loads these bins, so the watertight/serration audits can run there even if the audit below overflows.
    writeFileSync(join(DIR, `mesh_${tag}.ut.bin`), Buffer.from(Float64Array.from(ut).buffer));
    writeFileSync(join(DIR, `mesh_${tag}.idx.bin`), Buffer.from((idx as Uint32Array).buffer, (idx as Uint32Array).byteOffset, (idx as Uint32Array).byteLength));

    // large-mesh-safe non-manifold audit (auditNonManRaw/ByIndex Map overflows at >16.7M edges ⇒ 7M+ tris)
    const nmRaw = nonManRawBig(idx);
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
    // by-INDEX audit: for THIS mesh the ring output already shares by index, so nmRaw==nmIdx; keep nmRaw as the
    // big-safe primary. (auditNonManByIndex would re-weld by position → same Map overflow; skip it on the big build.)
    const nmIdx = nmRaw;
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx as unknown as Uint32Array, 0.01);
    const rc = mesh.constraint;
    const recoveredPct = rc ? +(100 * rc.recovered / Math.max(1, rc.requested - rc.alreadyPresent)).toFixed(1) : null;
    const failPct = rc ? +(100 * rc.failed / Math.max(1, rc.requested)).toFixed(1) : null;

    const rec = {
      stage: 'BUILD', tag, stepMm, fineFactor, gradLo, gradHi, chordTolMm, maxPoints, ms, tris,
      points: mesh.points, hitBudget: mesh.hitBudget,
      nConstraintVerts, nConstraintEdges, nFineSeg: ad.nFineSeg, nCoarseSeg: ad.nCoarseSeg,
      recovery: rc, recoveredPct, failPct,
      nonManRaw: nmRaw, nonManIdx: nmIdx, zeroArea: sound.zeroArea,
      soundRadial: { outliers: sound.outliers, max: sound.maxMm, p99: sound.p99 },
    };
    appendFileSync(join(DIR, 'build.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[BUILD]', JSON.stringify(rec, null, 2));
    writeFileSync(join(DIR, `mesh_${tag}.meta.json`), JSON.stringify(rec)); // mesh bins already persisted above
    expect(tris).toBeGreaterThan(0);
  }, 120 * 60_000);

  // ── STAGE VERDICT: LITERAL whole-mesh Newton — radial-prefilter ALL facets + Newton on EVERY non-green ──────────
  // NO stratified sampling on the final mesh (the CLOSE basis). PF_GLPRE = radial prefilter bound (def = tol; TIGHTEN
  // below tol only if the non-green set is intractable, and the record states the bound used). PF_GLNEWTONCAP =
  // safety cap on Newton calls (def 200000) — if exceeded, the run tightens the report to state intractability.
  it.skipIf(!RUN || process.env.PF_GL !== 'verdict')('VERDICT literal whole-mesh Newton + serration', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const tag = process.env.PF_GLTAG ?? 'L0';
    const tol = Number(process.env.PF_GLTOL ?? '0.01');
    const preBound = Number(process.env.PF_GLPRE ?? String(tol)); // radial prefilter bound (facets ≤ this are green)
    const newtonCap = Number(process.env.PF_GLNEWTONCAP ?? '200000');
    const utBuf = readFileSync(join(DIR, `mesh_${tag}.ut.bin`));
    const idxBuf = readFileSync(join(DIR, `mesh_${tag}.idx.bin`));
    const ut = Array.from(new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8));
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
    const tris = idx.length / 3;

    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, tol);
    const DENSE: Array<[number, number, number]> = [];
    { const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) DENSE.push([i / n, j / n, (n - i - j) / n]); }
    const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > DIMS.H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += TAU; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };

    const lv = wallIsolevels(P);
    const wallVal = [lv.inner, lv.outer];
    const onWall = (uc: number, tc: number): boolean => { const av = Math.abs(gyroidVal(uc, tc, P)); return wallVal.some((c) => Math.abs(av - c) < 0.03); };

    // radial-prefilter EVERY facet at the (possibly tightened) preBound → the non-green worst-sample set
    const nF = idx.length / 3;
    const radOut: Array<{ f: number; wbnd: number; wp: [number, number, number]; uc: number; tc: number }> = [];
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]] as const, B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]] as const, C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]] as const;
      let wbnd = 0, wp: [number, number, number] = [A[0], A[1], A[2]];
      for (const [wa, wb, wc] of DENSE) { const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2]; const d = radialBound(px, py, pz); if (d > wbnd) { wbnd = d; wp = [px, py, pz]; } }
      if (wbnd <= preBound) continue;
      const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      radOut.push({ f, wbnd, wp, uc, tc });
    }
    const nRadOut = radOut.length;
    // LITERAL basis: Newton on EVERY non-green facet (no sample). If nRadOut > newtonCap ⇒ intractable, tighten bound.
    const intractable = nRadOut > newtonCap;
    radOut.sort((x, y) => y.wbnd - x.wbnd);
    const toScore = intractable ? radOut.slice(0, newtonCap) : radOut;

    const NW: NewtonOpts = { seedTheta: 0, seedZ: 0, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
    const trueDevs: number[] = []; const outRows: Array<{ uc: number; tc: number; trueDev: number; onWall: number }> = [];
    let maxTrue = 0, nTrueOut = 0, nOnWall = 0, nOffWall = 0, newtonCalls = 0;
    for (const s of toScore) {
      const nr = newtonNearest(rA, DIMS.H, s.wp[0], s.wp[1], s.wp[2], NW); newtonCalls++;
      trueDevs.push(nr.dist);
      if (nr.dist > tol) {
        nTrueOut++; if (nr.dist > maxTrue) maxTrue = nr.dist;
        const ow = onWall(s.uc, s.tc); if (ow) nOnWall++; else nOffWall++;
        if (outRows.length < 20000) outRows.push({ uc: +s.uc.toFixed(5), tc: +s.tc.toFixed(5), trueDev: +nr.dist.toFixed(5), onWall: ow ? 1 : 0 });
      }
      // checkpoint every 20k Newton calls so a killed run leaves partial evidence
      if (newtonCalls % 20000 === 0) appendFileSync(join(DIR, 'verdict_progress.ndjson'), JSON.stringify({ tag, newtonCalls, nTrueOutSoFar: nTrueOut, maxTrueSoFar: +maxTrue.toFixed(5) }) + '\n');
    }
    trueDevs.sort((x, y) => x - y);
    const pc = (q: number): number => trueDevs.length ? trueDevs[Math.min(trueDevs.length - 1, Math.floor(q * trueDevs.length))] : 0;
    // large-mesh-safe watertight by INDEX (the ring output shares by index; nonManRawBig = shared-by-index audit)
    const nmIdx = nonManRawBig(idx);

    // NON-VACUOUS watertight control: force a 3rd triangle onto an existing interior edge → that edge is shared by
    // 3 facets → the audit MUST report >0. Take facet 0's edge (a,b) and append a degenerate-free extra facet on it.
    const crackedIdx = new Uint32Array(idx.length + 3);
    crackedIdx.set(idx);
    crackedIdx[idx.length] = idx[0]; crackedIdx[idx.length + 1] = idx[1]; crackedIdx[idx.length + 2] = idx[2] === idx[0] ? idx[1] : idx[2];
    // pick a 3rd corner that is not a/b so the extra tri is non-degenerate and shares edge (a,b)
    { const a = idx[0], b = idx[1]; let third = -1; for (let f = 1; f < 8 && third < 0; f++) { const t0 = idx[3 * f], t1 = idx[3 * f + 1], t2 = idx[3 * f + 2]; for (const v of [t0, t1, t2]) if (v !== a && v !== b) { third = v; break; } } crackedIdx[idx.length + 2] = third >= 0 ? third : idx[2]; }
    const nmCrackedVal = nonManRawBig(crackedIdx);

    // wall serration: p99 of on-wall true-dev over the scored non-green facets (all near-wall by construction)
    const serrP99 = trueDevs.length ? trueDevs[Math.min(trueDevs.length - 1, Math.floor(0.99 * trueDevs.length))] : 0;

    const rec = {
      stage: 'VERDICT-LITERAL', tag, tol, preBound, tris,
      basis: intractable
        ? `INTRACTABLE at preBound ${preBound}: ${nRadOut} non-green > cap ${newtonCap}; scored worst ${newtonCap} — TIGHTEN PF_GLPRE`
        : `LITERAL: radial-prefilter ALL facets @ bound ${preBound} + Newton on EVERY non-green (${nRadOut}, no sample)`,
      soundRadialOutliersAtTol: sound.outliers, soundRadialMax: sound.maxMm,
      nRadOutAtPreBound: nRadOut, newtonCalls, intractable,
      newtonOutliers: nTrueOut, trueMax: +maxTrue.toFixed(5),
      truep50: +pc(0.5).toFixed(5), truep90: +pc(0.9).toFixed(5), truep99: +pc(0.99).toFixed(5),
      nOnWall, nOffWall, offWallFrac: nTrueOut ? +(nOffWall / nTrueOut).toFixed(4) : 0,
      wallSerrP99: +serrP99.toFixed(5),
      nonManIdx: nmIdx, nonManCracked: nmCrackedVal, zeroArea: sound.zeroArea,
    };
    appendFileSync(join(DIR, 'verdict.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[VERDICT]', JSON.stringify(rec, null, 2));
    writeFileSync(join(DIR, `verdict_outliers_${tag}.ndjson`), outRows.map((r) => JSON.stringify(r)).join('\n'));
    expect(tris).toBeGreaterThan(0);
  }, 300 * 60_000);
});
