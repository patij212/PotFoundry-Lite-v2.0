// _pf_race_fgjunction.test.ts — DEV-ONLY (PF_FGJ=1). FRONTIER PROXY: FULL FEATURE-GRAPH CONFORMING WITH JUNCTION
// RESOLUTION (champion architecture) vs the current flat-UV bridging, on ONE Gothic arch-apex junction PATCH.
//
// THESIS (task): the 17,432 Gothic interior outliers are provably {ridge-line cusps} u {junction 0-cells}. Making
// EVERY ridge segment of EVERY family a mesh EDGE + EVERY junction a fan VERTEX at its exact 3D singular point
// empties the outlier-generating locus into the 1-skeleton => 0 interior outliers, NOT by density (refuted 5x).
//
// CHEAPEST PROXY (task): NOT a 6M mesh. ONE ~0.06x0.06 (u,t) window around a real Gothic arch-apex. Build TWO tiny
// local CDT triangulations (few hundred tris each): (A) CURRENT = uniform grid, no crest constraint (reproduces the
// bridging outliers); (B) CHAMPION = Morse-style ridge extract of BOTH families (u-scan crests + t-scan crests),
// apex 0-cell at the analytic ridge intersection, planarize crossings into a non-crossing PLC, crest arcs as
// constraint EDGES + junction fan, flanks flat P1. Measure BOTH with the SAME per-triangle INTERIOR true-3D ruler
// (interiorOutlierScan: 3 edge-mids + centroid, brute full-azimuth anchored). Runs in seconds. Reuses labkit +
// _pf_anatomyLib + cdt2d READ-ONLY. Writes ONLY research/exchange/_pf_race_fgjunction/.
//
// KILL (pre-registered, task): CONFIRMED iff on champion patch B: junction-local recovery=100% AND interior
// outliers within the protecting disk = 0 AND worst-facet interior true-3D <= 0.010mm AND extracted family count>=2
// -- WHILE current patch A reproduces recovery<90% AND worst-facet>0.05 (delta = the junction-graph model, not the
// finer mesh). REFUTED iff (a) champion still floors worst-facet interior >0.02 with 100% recovery + family>=2
// present (a perfect junction-complete graph cannot make the zero-width apex <=0.01 => Gothic DEFINITIVELY
// steep-EXCLUDE from the interior side, corroborating E-GF-GOTHIC), OR (b) Morse extract cannot produce a
// non-crossing planar graph at the apex (residualCrossings>0). NO-OP iff recovery=100% but outliers unchanged from A.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import cdt2d from 'cdt2d';
import { buildRadiusFn, type StyleDims, projectPointToRadialSurface } from './labkit';
import { bruteNearest } from './_pf_anatomyLib';
import { planarizeConstraintGraph } from './featureConformingMesh';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const R_MEAN = 45;                    // mean radius; u->mm arc scale = TAU*R_MEAN
const ARC_PER_U = TAU * R_MEAN;       // ~283mm per unit u
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_race_fgjunction');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const TOL = 0.01;                     // interior-outlier tolerance (mm)
const SAG_BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

// ── lift a (u,t) to 3D on the radial surface ─────────────────────────────────
function lift(rA: AnalyticRadiusFn, u: number, t: number): [number, number, number] {
  const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z];
}

// ── per-triangle INTERIOR true-3D deviation (the anatomy ruler): flat-facet barycentric interior sample -> nearest
// surface. TWO-STAGE (proven labkit pattern): STAGE 1 cheap GN-only screen over ALL facets (Gothic is a single-valued
// height field ⇒ GN foot honest); STAGE 2 brute-confirm ONLY the worst-K by GN (brute can only LOWER, so this guards a
// rare GN stall on the red tail without a per-facet global scan that hangs). Returns {gnDev, worst3D}. ──────────────
function triGnDev(rA: AnalyticRadiusFn, P: [number, number, number][], tri: [number, number, number]): { dev: number; wp: [number, number, number] } {
  const [a, b, c] = tri; const A = P[a], B = P[b], C = P[c];
  let dev = 0; let wp: [number, number, number] = A;
  for (const [wa, wb, wc] of SAG_BARY) {
    const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2];
    // coarseTrigger huge ⇒ pure local GN (no per-sample global scan — that was the hang); the brute-confirm tail
    // below catches the rare wrong-well. Own-azimuth seed is the true foot on a single-valued height field.
    const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 60 }).dist;
    if (gn > dev) { dev = gn; wp = [px, py, pz]; }
  }
  return { dev, wp };
}
/** single-triangle interior dev with a full brute-confirm (for the CONTROL only — a handful of facets). */
function triInteriorDev(rA: AnalyticRadiusFn, P: [number, number, number][], tri: [number, number, number]): number {
  const { dev, wp } = triGnDev(rA, P, tri);
  const bf = bruteNearest(wp[0], wp[1], wp[2], rA, H, { nTheta: 2048, nZ: 400, band: 10 });
  return Math.min(dev, bf.dist);
}

// ── scan a t-row for radial-max crest u positions in [uLo,uHi] (u-family) ─────
function rowCrests(rA: AnalyticRadiusFn, t: number, uLo: number, uHi: number, N: number, minAmp: number): number[] {
  const z = t * H; const rad = new Float64Array(N + 1); const us = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const u = uLo + (uHi - uLo) * (i / N); us[i] = u; rad[i] = rA(TAU * (((u % 1) + 1) % 1), z); }
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    if (rad[i] > rad[i - 1] && rad[i] >= rad[i + 1]) {
      // local prominence within +/-N/40 window
      const W = Math.max(2, Math.round(N / 40)); let lo = rad[i];
      for (let k = 1; k <= W; k++) { if (i - k >= 0 && rad[i - k] < lo) lo = rad[i - k]; if (i + k <= N && rad[i + k] < lo) lo = rad[i + k]; }
      if (rad[i] - lo < minAmp) continue;
      // golden-section refine
      let a = us[i - 1], b = us[i + 1]; const GR = (Math.sqrt(5) - 1) / 2; const fr = (u: number): number => rA(TAU * (((u % 1) + 1) % 1), z);
      let c = b - GR * (b - a), d = a + GR * (b - a), fc = fr(c), fd = fr(d);
      for (let it = 0; it < 40; it++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = fr(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = fr(d); } if (b - a < 1e-9) break; }
      out.push((a + b) / 2);
    }
  }
  return out;
}

// ── scan a u-column for radial-max crest t positions (t-family / the "diagonal" second family) ────────────────────
function colCrests(rA: AnalyticRadiusFn, u: number, tLo: number, tHi: number, N: number, minAmp: number): number[] {
  const th = TAU * (((u % 1) + 1) % 1); const rad = new Float64Array(N + 1); const ts = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const t = tLo + (tHi - tLo) * (i / N); ts[i] = t; rad[i] = rA(th, t * H); }
  const out: number[] = [];
  for (let i = 1; i < N; i++) {
    if (rad[i] > rad[i - 1] && rad[i] >= rad[i + 1]) {
      const W = Math.max(2, Math.round(N / 40)); let lo = rad[i];
      for (let k = 1; k <= W; k++) { if (i - k >= 0 && rad[i - k] < lo) lo = rad[i - k]; if (i + k <= N && rad[i + k] < lo) lo = rad[i + k]; }
      if (rad[i] - lo < minAmp) continue;
      out.push(ts[i]);
    }
  }
  return out;
}

interface PatchResult {
  key: string; nPts: number; nTris: number;
  familyCount: number; nCrestSegU: number; nCrestSegT: number; residualCrossings: number;
  recoveryPct: number;                // constraint edges present as mesh edges (junction-local recovery)
  nOutliers: number; worstFacet: number; p50: number; p90: number; frac: number;
  /** per-outlier: {dev, and the 3D centroid so a caller can classify on/off crest}. */
  outlierPts?: Array<{ dev: number; cx: number; cy: number; cz: number }>;
}

// ── measure interior outliers on a triangulation (P + tris), report percentiles + recovery of a constraint set ────
function scorePatch(
  key: string, rA: AnalyticRadiusFn, P: [number, number, number][], tris: [number, number, number][],
  constraintEdges: Array<[number, number]>, familyCount: number, nSegU: number, nSegT: number, residualCrossings: number,
): PatchResult {
  // recovery: fraction of constraint edges that appear as an actual mesh edge (by index pair)
  const meshEdges = new Set<number>();
  const ek = (a: number, b: number): number => (a < b ? a * 1e7 + b : b * 1e7 + a);
  for (const [a, b, c] of tris) { meshEdges.add(ek(a, b)); meshEdges.add(ek(b, c)); meshEdges.add(ek(c, a)); }
  let present = 0; for (const [a, b] of constraintEdges) if (meshEdges.has(ek(a, b))) present++;
  const recoveryPct = constraintEdges.length ? 100 * present / constraintEdges.length : 100;
  // STAGE 1 — cheap GN-only interior dev over every facet.
  const gn = tris.map((tri) => triGnDev(rA, P, tri));
  const devs = gn.map((g) => g.dev);
  // STAGE 2 — brute-confirm the worst-K by GN (brute can only LOWER; guards a wrong-well on the red tail).
  const order = devs.map((_, i) => i).sort((x, y) => devs[y] - devs[x]);
  const K = Math.min(60, order.length);
  for (let i = 0; i < K; i++) {
    const f = order[i]; if (devs[f] <= TOL) break;   // once the GN-worst is green, all below are green
    const bf = bruteNearest(gn[f].wp[0], gn[f].wp[1], gn[f].wp[2], rA, H, { nTheta: 2048, nZ: 400, band: 10 });
    if (bf.dist < devs[f]) devs[f] = bf.dist;
  }
  let nOut = 0, worst = 0;
  const outlierPts: Array<{ dev: number; cx: number; cy: number; cz: number }> = [];
  for (let f = 0; f < devs.length; f++) {
    const d = devs[f]; if (d > worst) worst = d;
    if (d > TOL) { nOut++; outlierPts.push({ dev: d, cx: gn[f].wp[0], cy: gn[f].wp[1], cz: gn[f].wp[2] }); }
  }
  const sorted = Float64Array.from(devs).sort();
  const pc = (q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return { key, nPts: P.length, nTris: tris.length, familyCount, nCrestSegU: nSegU, nCrestSegT: nSegT, residualCrossings, recoveryPct: +recoveryPct.toFixed(1), nOutliers: nOut, worstFacet: +worst.toFixed(4), p50: +pc(0.5).toFixed(4), p90: +pc(0.9).toFixed(4), frac: +(devs.length ? nOut / devs.length : 0).toFixed(4), outlierPts };
}

// ── locate the arch-apex junction: the (u,t) where a u-family crest and a t-family crest cross with max amplitude ──
function findApexJunction(rA: AnalyticRadiusFn): { u: number; t: number } {
  // scan the mid-height band; find the t-row + u where BOTH a u-crest and a t-crest coincide (an X of two families)
  let best = { u: 0.05, t: 0.55, amp: -1 };
  for (let ti = 0; ti < 60; ti++) {
    const t = 0.35 + 0.4 * (ti / 59);
    const uc = rowCrests(rA, t, 0, 0.2, 4000, 0.03);
    for (const u of uc) {
      const tc = colCrests(rA, u, Math.max(0, t - 0.1), Math.min(1, t + 0.1), 2000, 0.03);
      // a t-crest near t => this (u,t) is a 2-family X-crossing (arch apex)
      for (const tt of tc) if (Math.abs(tt - t) < 0.01) {
        const amp = rA(TAU * u, t * H) - R_MEAN;
        if (amp > best.amp) best = { u, t, amp };
      }
    }
  }
  return { u: best.u, t: best.t };
}

describe('pf-race-fgjunction: feature-graph + junction resolution vs flat-UV bridging on a Gothic apex patch', () => {
  it.skipIf(process.env.PF_FGJ !== '1')('diag: locate apex junction + family census', () => {
    if (rowExists('diag-apex')) { plog('diag-apex exists, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const j = findApexJunction(rA);
    // census in a small window around the apex
    const W = 0.03;
    const uc = rowCrests(rA, j.t, j.u - W, j.u + W, 3000, 0.03);
    const tc = colCrests(rA, j.u, j.t - W, j.t + W, 3000, 0.03);
    plog(`apex junction (u=${j.u.toFixed(5)}, t=${j.t.toFixed(5)}): u-crests-in-window=${uc.length} t-crests-in-window=${tc.length}`);
    checkpoint({ key: 'diag-apex', u: +j.u.toFixed(5), t: +j.t.toFixed(5), uCrests: uc.length, tCrests: tc.length });
    expect(uc.length + tc.length).toBeGreaterThan(0);
  }, 20 * 60 * 1000);

  it.skipIf(process.env.PF_FGJ !== '1')('race: patch A (flat-UV) vs patch B (feature-graph junction)', () => {
    if (rowExists('B-champion')) { plog('race rows exist, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const j = findApexJunction(rA);
    // WINDOW: ~0.06 u x 0.06 t around the apex. u-arc span ~ 0.06*283 = 17mm; t-z span ~ 0.06*120 = 7.2mm.
    const W = 0.03;                       // half-window
    const uLo = j.u - W, uHi = j.u + W, tLo = Math.max(0.02, j.t - W), tHi = Math.min(0.98, j.t + W);
    plog(`window u[${uLo.toFixed(4)},${uHi.toFixed(4)}] t[${tLo.toFixed(4)},${tHi.toFixed(4)}] apex(${j.u.toFixed(4)},${j.t.toFixed(4)})`);

    // ── CONTROL: is this window HARD? Measure the raw crest->valley BRIDGE interior dev = the anatomy's decisive
    // number (E-GF-GOTHIC diag: worst-facet crest->valley chord ~0.09 = the floor). A single COARSE triangle whose
    // base spans the crest apex to the adjacent valley (no crest edge) MUST read the bridge sag if the window has a
    // real cusp. If this is ~0, the window is benign and the race proves nothing (we then must move the window).
    {
      const uc = rowCrests(rA, j.t, uLo, uHi, 4000, 0.03);
      const crestU = uc.length ? uc.reduce((p, c) => (rA(TAU * c, j.t * H) > rA(TAU * p, j.t * H) ? c : p)) : j.u;
      // valley = radial MIN in the window at this t
      let vU = uLo, vR = Infinity; for (let i = 0; i <= 4000; i++) { const u = uLo + (uHi - uLo) * (i / 4000); const r = rA(TAU * u, j.t * H); if (r < vR) { vR = r; vU = u; } }
      // a coarse triangle: crest apex, valley point, and a 3rd point one t-row up at the crest u (so its interior
      // spans the crest cross-section). This is the flat-facet bridge the current mesh makes when the crest is NOT an edge.
      const Pb: [number, number, number][] = [lift(rA, crestU, j.t), lift(rA, vU, j.t), lift(rA, crestU, Math.min(0.98, j.t + 0.01))];
      const bridgeDev = triInteriorDev(rA, Pb, [0, 1, 2]);
      // and a facet spanning ACROSS the crest (u-1 side valley -> u+1 side valley through the apex)
      let v2U = uHi; { let r2 = Infinity; for (let i = 0; i <= 2000; i++) { const u = crestU + (uHi - crestU) * (i / 2000); const r = rA(TAU * u, j.t * H); if (r < r2) { r2 = r; v2U = u; } } }
      const Pc: [number, number, number][] = [lift(rA, vU, j.t), lift(rA, v2U, j.t), lift(rA, crestU, Math.min(0.98, j.t + 0.02))];
      const acrossDev = triInteriorDev(rA, Pc, [0, 1, 2]);
      const crestAmp = rA(TAU * crestU, j.t * H) - vR;
      plog(`CONTROL: crestU=${crestU.toFixed(5)} valleyU=${vU.toFixed(5)} crestAmp=${crestAmp.toFixed(3)}mm bridgeDev=${bridgeDev.toFixed(4)} acrossDev=${acrossDev.toFixed(4)}`);
      checkpoint({ key: 'control-bridge', crestU: +crestU.toFixed(5), valleyU: +vU.toFixed(5), crestAmpMm: +crestAmp.toFixed(3), bridgeDev: +bridgeDev.toFixed(4), acrossDev: +acrossDev.toFixed(4), note: 'raw crest->valley flat-facet bridge (anatomy decisive number); >0.05 => window contains a real hard cusp' });
    }

    // ============ PATCH A — CURRENT flat-UV: uniform grid, NO crest constraint (reproduces bridging outliers). ======
    // Grid pitch matched to the HD run's flank pitch (~0.10mm arc => ~3.5e-4 u; ~0.09mm z => ~7.5e-4 t) so A is NOT
    // starved of density — the delta must be the graph model, not point count.
    {
      // Grid pitch ~0.5mm arc / ~0.4mm z: a realistic per-CELL export density (NOT HD — the mechanism demo only
      // needs A to REPRODUCE the bridging outlier, which the control proved happens at 0.23mm; HD would make the
      // brute ruler take hours for no extra signal). Cap at 44x44 so the whole-patch brute stays seconds.
      const duGrid = 0.5 / ARC_PER_U, dtGrid = 0.4 / H;
      const nu = Math.min(44, Math.max(20, Math.round((uHi - uLo) / duGrid)));
      const nt = Math.min(44, Math.max(20, Math.round((tHi - tLo) / dtGrid)));
      const P: [number, number, number][] = []; const pts: [number, number][] = [];
      for (let i = 0; i <= nu; i++) for (let k = 0; k <= nt; k++) {
        const u = uLo + (uHi - uLo) * (i / nu), t = tLo + (tHi - tLo) * (k / nt);
        pts.push([u * ARC_PER_U, t * H]); P.push(lift(rA, u, t));
      }
      // exterior:true KEEPS the convex-hull fill (a bare point grid has no boundary constraints, so exterior:false
      // strips ALL triangles as "outside" -> nTris=0). We want the whole windowed triangulation.
      const tris = cdt2d(pts, [], { exterior: true }) as [number, number, number][];
      const res = scorePatch('A-flatUV', rA, P, tris, [], 1, 0, 0, 0);
      checkpoint({ ...res, outlierPts: undefined, note: 'uniform grid, no crest constraint (current flat-UV)', nu, nt });
      plog(`A: tris=${res.nTris} outliers=${res.nOutliers} worst=${res.worstFacet} p90=${res.p90}`);
    }

    // ============ PATCH B — CHAMPION feature-graph + junction resolution (flank pitch = 0.35mm arc). =================
    const B = buildChampionPatch(rA, uLo, uHi, tLo, tHi, 0.35, 0.30);
    const res = scorePatch('B-champion', rA, B.P, B.tris, B.cEdges, B.familyCount, B.nSegU, B.nSegT, B.residualCrossings);
    const cl = classifyOutliers(res.outlierPts ?? [], B.crestSamples);
    checkpoint({ ...res, outlierPts: undefined, crossingsSplit: B.crossingsSplit, addedPoints: B.addedPoints, onCrest: cl.onCrest, offCrest: cl.offCrest, onCrestWorst: +cl.onCrestWorst.toFixed(4), offCrestWorst: +cl.offCrestWorst.toFixed(4), note: 'multi-family ridge graph + junction planarize + flat flanks (champion)' });
    plog(`B: tris=${res.nTris} recovery=${res.recoveryPct}% outliers=${res.nOutliers} worst=${res.worstFacet} p90=${res.p90} famCount=${res.familyCount} resid=${res.residualCrossings} | onCrest=${cl.onCrest}(worst${cl.onCrestWorst.toFixed(3)}) offCrest=${cl.offCrest}(worst${cl.offCrestWorst.toFixed(3)})`);
    expect(res.nTris).toBeGreaterThan(0);
  }, 40 * 60 * 1000);

  // ── DISCRIMINATOR: sweep the FLANK pitch. If outliers are OFF the crest (coarse-flank artifact) they collapse as
  // flank pitch shrinks; if they are ON the crest (genuine zero-width cusp floor) they PERSIST flank-invariant =>
  // refute-branch (a). This isolates cusp-floor from my-flank-under-refinement — the fairness check for the champion.
  it.skipIf(process.env.PF_FGJ !== '1')('sweep: champion flank-pitch invariance (cusp floor vs flank artifact)', () => {
    if (rowExists('sweep-flank-0.10')) { plog('sweep exists, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const j = findApexJunction(rA);
    const W = 0.03;
    const uLo = j.u - W, uHi = j.u + W, tLo = Math.max(0.02, j.t - W), tHi = Math.min(0.98, j.t + W);
    for (const flankArc of [0.35, 0.20, 0.10]) {
      const key = `sweep-flank-${flankArc.toFixed(2)}`;
      if (rowExists(key)) { plog(`${key} exists, skip`); continue; }
      const B = buildChampionPatch(rA, uLo, uHi, tLo, tHi, flankArc, flankArc * (H / ARC_PER_U) * 8);
      const res = scorePatch(key, rA, B.P, B.tris, B.cEdges, B.familyCount, B.nSegU, B.nSegT, B.residualCrossings);
      const cl = classifyOutliers(res.outlierPts ?? [], B.crestSamples);
      checkpoint({ ...res, outlierPts: undefined, flankArcMm: flankArc, onCrest: cl.onCrest, offCrest: cl.offCrest, onCrestWorst: +cl.onCrestWorst.toFixed(4), offCrestWorst: +cl.offCrestWorst.toFixed(4), note: 'champion at flank pitch = flankArcMm; onCrest = outliers within 0.4mm of a crest edge (cusp), offCrest = flank panels' });
      plog(`${key}: tris=${res.nTris} outliers=${res.nOutliers} worst=${res.worstFacet} | onCrest=${cl.onCrest}(worst${cl.onCrestWorst.toFixed(3)}) offCrest=${cl.offCrest}(worst${cl.offCrestWorst.toFixed(3)})`);
    }
    expect(true).toBe(true);
  }, 40 * 60 * 1000);
});

// ── classify outliers: ON-crest (within 0.4mm arc of a crest sample point = the zero-width cusp) vs OFF-crest
// (a flank panel, my under-refinement). Decisive: ON-crest & flank-invariant => genuine cusp floor (refute (a)). ──
function classifyOutliers(
  outlierPts: Array<{ dev: number; cx: number; cy: number; cz: number }>,
  crestSamples: Array<[number, number, number]>,
): { onCrest: number; offCrest: number; onCrestWorst: number; offCrestWorst: number } {
  const THRESH = 0.4;   // mm — a facet whose worst-sample 3D point is within 0.4mm of a crest line is a cusp facet
  let onCrest = 0, offCrest = 0, onW = 0, offW = 0;
  for (const o of outlierPts) {
    let best = Infinity;
    for (const c of crestSamples) { const d = Math.hypot(o.cx - c[0], o.cy - c[1], o.cz - c[2]); if (d < best) best = d; if (best < THRESH) break; }
    if (best < THRESH) { onCrest++; if (o.dev > onW) onW = o.dev; } else { offCrest++; if (o.dev > offW) offW = o.dev; }
  }
  return { onCrest, offCrest, onCrestWorst: onW, offCrestWorst: offW };
}

// ── build the champion patch at a given flank pitch (mm arc / mm z). Multi-family ridge extract + junction planarize
// + flat-flank fill. Returns points, tris, constraint edges, family census, and the 3D crest sample points. ────────
function buildChampionPatch(
  rA: AnalyticRadiusFn, uLo: number, uHi: number, tLo: number, tHi: number, flankArcMm: number, flankZMm: number,
): {
  P: [number, number, number][]; tris: [number, number, number][]; cEdges: Array<[number, number]>;
  familyCount: number; nSegU: number; nSegT: number; residualCrossings: number; crossingsSplit: number; addedPoints: number;
  crestSamples: Array<[number, number, number]>;
} {
  const uvPts: [number, number][] = [];
  const uvRaw: number[] = [];
  const pmap = new Map<number, number>();
  const cellMm = 0.02;
  const crestSamples: Array<[number, number, number]> = [];
  const addPt = (u: number, t: number): number => {
    const key = Math.round(u * ARC_PER_U / cellMm) * 100000 + Math.round(t * H / cellMm);
    const hit = pmap.get(key); if (hit !== undefined) return hit;
    const id = uvRaw.length / 2; uvRaw.push(u, t); uvPts.push([u * ARC_PER_U, t * H]); pmap.set(key, id); return id;
  };
  const constraints0: number[] = [];
  const addSeg = (a: number, b: number): void => { if (a !== b) constraints0.push(a, b); };
  // u-family
  const nRow = 80; let famU = 0; let prevU: Array<{ u: number; id: number }> | null = null;
  for (let ri = 0; ri <= nRow; ri++) {
    const t = tLo + (tHi - tLo) * (ri / nRow);
    const uc = rowCrests(rA, t, uLo, uHi, 3000, 0.03);
    const cur = uc.map((u) => { crestSamples.push(lift(rA, u, t)); return { u, id: addPt(u, t) }; });
    if (cur.length) famU = Math.max(famU, cur.length);
    if (prevU) for (const c of cur) { let best = -1, bd = 3.5e-3; for (let p = 0; p < prevU.length; p++) { const d = Math.abs(c.u - prevU[p].u); if (d < bd) { bd = d; best = p; } } if (best >= 0) addSeg(prevU[best].id, c.id); }
    prevU = cur;
  }
  const nSegU = constraints0.length / 2;
  // t-family
  const nCol = 80; let famT = 0; let prevT: Array<{ t: number; id: number }> | null = null;
  for (let ci = 0; ci <= nCol; ci++) {
    const u = uLo + (uHi - uLo) * (ci / nCol);
    const tc = colCrests(rA, u, tLo, tHi, 3000, 0.03);
    const cur = tc.map((t) => { crestSamples.push(lift(rA, u, t)); return { t, id: addPt(u, t) }; });
    if (cur.length) famT = Math.max(famT, cur.length);
    if (prevT) for (const c of cur) { let best = -1, bd = 1.0 / H; for (let p = 0; p < prevT.length; p++) { const d = Math.abs(c.t - prevT[p].t); if (d < bd) { bd = d; best = p; } } if (best >= 0) addSeg(prevT[best].id, c.id); }
    prevT = cur;
  }
  const nSegT = constraints0.length / 2 - nSegU;
  const familyCount = (famU > 0 ? 1 : 0) + (famT > 0 ? 1 : 0);
  const pr = planarizeConstraintGraph(constraints0, ARC_PER_U, H, uvRaw, 6);
  for (let i = uvPts.length; i < uvRaw.length / 2; i++) uvPts.push([uvRaw[2 * i] * ARC_PER_U, uvRaw[2 * i + 1] * H]);
  const constraints = pr.constraints;
  // flank fill at the requested pitch
  const nu = Math.max(12, Math.round((uHi - uLo) * ARC_PER_U / flankArcMm)), nt = Math.max(12, Math.round((tHi - tLo) * H / flankZMm));
  for (let i = 0; i <= nu; i++) for (let k = 0; k <= nt; k++) addPt(uLo + (uHi - uLo) * (i / nu), tLo + (tHi - tLo) * (k / nt));
  const P: [number, number, number][] = [];
  for (let i = 0; i < uvRaw.length / 2; i++) P.push(lift(rA, uvRaw[2 * i], uvRaw[2 * i + 1]));
  const cEdges: Array<[number, number]> = [];
  for (let i = 0; i + 1 < constraints.length; i += 2) cEdges.push([constraints[i], constraints[i + 1]]);
  const tris = cdt2d(uvPts, cEdges as [number, number][], { exterior: true }) as [number, number, number][];
  return { P, tris, cEdges, familyCount, nSegU, nSegT, residualCrossings: pr.residualCrossings, crossingsSplit: pr.crossingsSplit, addedPoints: pr.addedPoints, crestSamples };
}
