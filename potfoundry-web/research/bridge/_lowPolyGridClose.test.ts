// _lowPolyGridClose.test.ts — E-2026-07-22-LOWPOLY-GRID-CLOSE.
//
// QUESTION: does LowPolyFacet (registry id 19, registry-default params) close to WHOLE-MESH true-3D MAX ≤0.01mm at
// PRODUCTION scale (tapered OD140/H120: H=120, Rb=45, Rt=70, expn=1.1) on the SHIPPED smooth-grid emitter
// (buildSmoothGridWall), and does it judge-certify via the cut-at-gap adapter? LowPolyFacet is the rank-1 layered-class
// tractability candidate: 12 static VERTICAL facet edges, lpTiers=1 (no horizontal C0 step), no junctions.
//
// STRICT STANDARD (the HexHive lesson): WHOLE-MESH true-3D MAX ≤0.01 (NOT p99), INCLUDING the u-wrap seam and the
// facet edges. First verify PERIODICITY (12 facets should tile 2π exactly). The tension: the 12 facet edges sit at
// u=odd/24; does DENSITY alone (pow2 nU) close them, or must columns LAND on the edges (facet-aligned nU=mult of 24)?
//
// DEV-ONLY research bridge; src NEVER imports research. Consumes the shipped emitter + judge READ-ONLY. Env-gated
// PF_LOWPOLY; checkpointed ndjson (resumable across killed runs).
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { perFaceTrue3DSag, nonManRawBigStats, triangleQualityDistribution, bruteNearestOnRadialSurface, dumpHeatmap } from './labkit';
import { certifyPeriodicGridMesh } from './certAdapter';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildSmoothGridWall, deriveSmoothGridDensity } from '../../src/renderers/webgpu/parametric/conforming/tierC/smoothGrid';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
// Anchor output next to research/exchange regardless of the launch cwd (probe is at research/bridge/).
const OUT_DIR = fileURLToPath(new URL('../exchange/_lowPolyGridClose', import.meta.url));
const NDJSON = join(OUT_DIR, 'grid.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  /* eslint-disable-next-line no-console */
  console.log(l);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => {
    try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; }
  });
}
function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  /* eslint-disable-next-line no-console */
  console.log(`[CP] ${JSON.stringify(row)}`);
}
function p99of(vals: Float64Array | number[]): number {
  if (vals.length === 0) return 0;
  const s = Float64Array.from(vals).sort();
  return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))];
}

// Production DEFAULT_DIMENSIONS: OD140/H120 TAPERED ⇒ H120 / Rt70 / Rb45 / expn1.1.
const H = 120, Rb = 45, Rt = 70, expn = 1.1;

describe('LOWPOLY-GRID-CLOSE — does LowPolyFacet close whole-mesh ≤0.01 on the shipped smooth grid + judge-cert', () => {
  it.skipIf(process.env.PF_LOWPOLY !== '1')('periodicity + surface anatomy + pow2-vs-facet-aligned density sweep + cert', () => {
    plog(`=== LOWPOLY-GRID-CLOSE => ${NDJSON} ===`);
    const rA = buildAnalyticRadiusFn('LowPolyFacet', {}, { H, Rb, Rt, expn }) as unknown as AnalyticRadiusFn;

    // ─────────────── DIAGNOSTIC 1: periodicity + 12-facet tiling ───────────────
    if (!keyExists('diag|periodicity')) {
      let seamStep = 0, tileStep = 0; // max over z of |rA(0+) - rA(2π-)| and |rA(θ) - rA(θ+2π/12)|
      const eps = 1e-7;
      for (let jz = 0; jz <= 200; jz++) {
        const z = (jz / 200) * H;
        const s = Math.abs(rA(eps, z) - rA(TAU - eps, z));
        if (s > seamStep) seamStep = s;
        for (let k = 0; k < 24; k++) {
          const th = (k / 24) * TAU + 0.017; // avoid landing exactly on center/edge
          const d = Math.abs(rA(th, z) - rA(th + TAU / 12, z));
          if (d > tileStep) tileStep = d;
        }
      }
      plog(`[diag] PERIODICITY seamStep(0+ vs 2π-)=${seamStep.toExponential(3)}mm | 12-facet tileStep=${tileStep.toExponential(3)}mm`);
      checkpoint({ key: 'diag|periodicity', seamStepMm: seamStep, tileStepMm: tileStep });
    }

    // ─────────────── DIAGNOSTIC 2: surface anatomy — bevel active? sharp C0 edge? ───────────────
    if (!keyExists('diag|anatomy')) {
      const z = 0.9 * H; // near-top where relief is largest (r0≈Rt)
      const r0 = Rb + (Rt - Rb) * Math.pow(0.9, expn); // rough baseRadius for reporting only
      // sample one facet period [0, 2π/12] finely; center at u=0, edge at u=1/24
      const rCenter = rA(0, z);            // angle=0 → face center (min radius = D)
      const rEdge = rA(TAU / 24, z);       // angle=±alpha/2 → convex edge (max radius)
      // left/right slope at the edge (u=1/24) — a SHARP C0 corner ⇒ slopes flip sign
      const du = 1e-5, uE = 1 / 24;
      const slopeL = (rA(TAU * uE, z) - rA(TAU * (uE - du), z)) / du;         // dr/du approaching edge from below
      const slopeR = (rA(TAU * (uE + du), z) - rA(TAU * uE, z)) / du;         // leaving edge above
      const prominence = rEdge - rCenter;  // how far the edge sticks out beyond the face center
      plog(`[diag] ANATOMY z=${z.toFixed(1)} r0≈${r0.toFixed(2)} | rCenter(D)=${rCenter.toFixed(4)} rEdge=${rEdge.toFixed(4)} prominence=${prominence.toFixed(4)}mm`);
      plog(`[diag] EDGE-SLOPE dr/du L=${slopeL.toFixed(3)} R=${slopeR.toFixed(3)} (opposite sign ⇒ SHARP C0 convex edge; bevel inactive)`);
      checkpoint({ key: 'diag|anatomy', z, rCenterD: +rCenter.toFixed(5), rEdge: +rEdge.toFixed(5), prominenceMm: +prominence.toFixed(5), slopeL: +slopeL.toFixed(4), slopeR: +slopeR.toFixed(4), sharpC0: Math.sign(slopeL) !== Math.sign(slopeR) });
    }

    // ─────────────── DIAGNOSTIC 3: rim floor() tier jump at z=H (lpTiers=1 off-by-one) ───────────────
    if (!keyExists('diag|rimjump')) {
      let rimJump = 0, rimAtU = 0;
      for (let i = 0; i < 2400; i++) {
        const th = (i / 2400) * TAU;
        const d = Math.abs(rA(th, H) - rA(th, H * (1 - 1e-6)));
        if (d > rimJump) { rimJump = d; rimAtU = i / 2400; }
      }
      plog(`[diag] RIM-JUMP max|rA(θ,H) − rA(θ,H⁻)| = ${rimJump.toFixed(5)}mm @ u≈${rimAtU.toFixed(4)} (floor(t·tiers) 0→1 at t=1; DS-rim-bug class)`);
      checkpoint({ key: 'diag|rimjump', rimJumpMm: +rimJump.toFixed(5), atU: +rimAtU.toFixed(4) });
    }

    // ─────────────── DIAGNOSTIC 4: what nU does the SHIPPED heuristic pick? ───────────────
    if (!keyExists('diag|derive')) {
      const d = deriveSmoothGridDensity(rA, H, 0.01);
      plog(`[diag] deriveSmoothGridDensity(tol=0.01) ⇒ nU=${d.nU} nT=${d.nT} (its coarse 2nd-diff probe is BAND-LIMITED — blind to the sharp C0 edge)`);
      checkpoint({ key: 'diag|derive', deriveNU: d.nU, deriveNT: d.nT });
    }

    // ─────────────── DENSITY SWEEP: pow2 vs facet-aligned(mult-24) vs control(mult-12-not-24) ───────────────
    // Vertical sag is negligible (gentle expn=1.1 taper) ⇒ use nT=128 for the nU sweep to afford nU up to 8192 under
    // the 3M-tri cap and directly MEASURE whether pow2 ever closes the sharp edges. Confirm vertical at aligned 504.
    type Rung = [nU: number, nT: number, kind: string];
    const RUNGS: Rung[] = [
      // pow2 (columns do NOT land on edges at u=odd/24)
      [256, 128, 'pow2'], [512, 128, 'pow2'], [1024, 128, 'pow2'], [2048, 128, 'pow2'], [4096, 128, 'pow2'], [8192, 128, 'pow2'],
      // facet-aligned: multiples of 24 (columns LAND on the 12 edges u=odd/24 AND the 12 centers u=even/24)
      [48, 128, 'align24'], [240, 128, 'align24'], [504, 128, 'align24'], [1008, 128, 'align24'],
      // control: multiple of 12 but NOT 24 (columns land on facet CENTERS but edges fall MID-GAP = worst straddle)
      [252, 128, 'mult12'],
      // vertical confirm at aligned nU
      [504, 256, 'align24'], [504, 512, 'align24'],
    ];

    for (const [nU, nT, kind] of RUNGS) {
      const key = `grid|${kind}|${nU}x${nT}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const g = buildSmoothGridWall(rA, H, nU, nT);
      const nF = g.indices.length / 3;
      const sag = perFaceTrue3DSag(g.ut, g.indices, rA, H, { preFilterMm: 0.001 });
      // whole-mesh + facet-body (exclude faces touching t=1 = the rim floor() row)
      let wMax = 0, wOut = 0, wMaxF = -1; let bMax = 0, bOut = 0;
      const wErr = sag.faceErr; const bErrList: number[] = [];
      for (let f = 0; f < nF; f++) {
        const e = wErr[f];
        if (e > wMax) { wMax = e; wMaxF = f; }
        if (e > 0.01) wOut++;
        const a = g.indices[3 * f], b = g.indices[3 * f + 1], c = g.indices[3 * f + 2];
        const touchesRim = g.ut[2 * a + 1] === 1 || g.ut[2 * b + 1] === 1 || g.ut[2 * c + 1] === 1;
        if (!touchesRim) { bErrList.push(e); if (e > bMax) bMax = e; if (e > 0.01) bOut++; }
      }
      const wP99 = p99of(wErr), bP99 = p99of(bErrList);
      // locate the worst whole-mesh facet (u,t centroid)
      const wa = g.indices[3 * wMaxF], wb = g.indices[3 * wMaxF + 1], wc = g.indices[3 * wMaxF + 2];
      const wU = (g.ut[2 * wa] + g.ut[2 * wb] + g.ut[2 * wc]) / 3;
      const wT = (g.ut[2 * wa + 1] + g.ut[2 * wb + 1] + g.ut[2 * wc + 1]) / 3;
      const q = triangleQualityDistribution({ vertices: g.vertices, indices: g.indices });
      const nm = nonManRawBigStats(g.indices);
      plog(`[${kind}] ${nU}x${nT} tris=${nF} | WHOLE true3D MAX=${wMax.toFixed(6)} p99=${wP99.toFixed(6)} out=${wOut} @worst(u=${wU.toFixed(4)},t=${wT.toFixed(4)}) | BODY(excl rim) MAX=${bMax.toFixed(6)} p99=${bP99.toFixed(6)} out=${bOut} | %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)} | nonMan=${nm.nonMan} bnd=${nm.boundary}`);
      checkpoint({ key, kind, nU, nT, tris: nF, wholeMax: +wMax.toFixed(6), wholeP99: +wP99.toFixed(6), wholeOut: wOut, worstU: +wU.toFixed(4), worstT: +wT.toFixed(4), bodyMax: +bMax.toFixed(6), bodyP99: +bP99.toFixed(6), bodyOut: bOut, pctBelow20: +q.pctBelow20.toFixed(3), minAngle: +q.minAngleDeg.toFixed(2), nonMan: nm.nonMan, boundary: nm.boundary });
    }

    // ─────────────── BRUTE CROSS-CHECK: trusted MAX on the worst pow2 edge facets (GN overstates sharp edges) ───────────────
    if (!keyExists('brute|pow2-2048')) {
      const g = buildSmoothGridWall(rA, H, 2048, 128);
      const nF = g.indices.length / 3;
      const sag = perFaceTrue3DSag(g.ut, g.indices, rA, H, { preFilterMm: 0.001 });
      // worst-K facets that are NOT on the rim row (isolate the EDGE mechanism)
      const cand: Array<{ f: number; e: number }> = [];
      for (let f = 0; f < nF; f++) {
        const a = g.indices[3 * f], b = g.indices[3 * f + 1], c = g.indices[3 * f + 2];
        const touchesRim = g.ut[2 * a + 1] === 1 || g.ut[2 * b + 1] === 1 || g.ut[2 * c + 1] === 1;
        if (!touchesRim) cand.push({ f, e: sag.faceErr[f] });
      }
      cand.sort((x, y) => y.e - x.e);
      const K = 20;
      let gnMax = 0, bruteMax = 0;
      for (let k = 0; k < K; k++) {
        const f = cand[k].f;
        const a = g.indices[3 * f], b = g.indices[3 * f + 1], c = g.indices[3 * f + 2];
        const ax = g.vertices[3 * a], ay = g.vertices[3 * a + 1], az = g.vertices[3 * a + 2];
        const bx = g.vertices[3 * b], by = g.vertices[3 * b + 1], bz = g.vertices[3 * b + 2];
        const cx = g.vertices[3 * c], cy = g.vertices[3 * c + 1], cz = g.vertices[3 * c + 2];
        // sample the 4 SAG_BARY points, brute-nearest each, keep the max (trusted perp)
        let bMaxF = 0;
        for (const [w0, w1, w2] of [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]]) {
          const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
          const bd = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 8192, nZ: 200, zBandMm: 4 }).dist;
          if (bd > bMaxF) bMaxF = bd;
        }
        if (cand[k].e > gnMax) gnMax = cand[k].e;
        if (bMaxF > bruteMax) bruteMax = bMaxF;
      }
      plog(`[brute] pow2 2048x128 worst-${K} EDGE facets: GN(perFaceTrue3DSag) MAX=${gnMax.toFixed(6)} vs trusted-brute MAX=${bruteMax.toFixed(6)} (ratio ${(gnMax / Math.max(bruteMax, 1e-9)).toFixed(2)}×)`);
      checkpoint({ key: 'brute|pow2-2048', gnMax: +gnMax.toFixed(6), bruteMax: +bruteMax.toFixed(6) });
    }

    // ─────────────── JUDGE CERT: facet-aligned closing grid + a pow2 grid (both must ACCEPT) ───────────────
    const bits = 20; // N=2^20; pow2 nU snaps exactly; mult-24 nU carries a small BOUNDED δ (factor of 3)
    const certCases: Array<[number, number, string]> = [[504, 256, 'align24'], [512, 256, 'pow2']];
    for (const [nU, nT, kind] of certCases) {
      const key = `cert|${kind}|${nU}x${nT}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const g = buildSmoothGridWall(rA, H, nU, nT);
      const v = certifyPeriodicGridMesh(g.ut, g.indices, g.vertices, nU, 0, rA, H, bits, { patchId: `lowpoly-${kind}-${nU}x${nT}` });
      plog(`[cert] ${kind} ${nU}x${nT} (${v.tris} tris) judge=${v.accepted ? 'ACCEPT' : 'REJECT'} maxδ=${v.maxDelta.toFixed(6)}mm wrap=${v.wrapTris} nonPos=${v.nonPosTris} straddle=${v.nonGapStraddle} :: ${v.detail}`);
      checkpoint({ key, kind, nU, nT, tris: v.tris, accepted: v.accepted, maxDelta: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPos: v.nonPosTris, nonGapStraddle: v.nonGapStraddle });
    }

    // ─────────────── HEATMAP RENDER (true-3D ruler @0.01 scale) — the fidelity visual ───────────────
    // pow2 1024 (≈ the shipped-heuristic density): 12 vertical red edge-seams (sharp C0 under-tessellation) + red rim
    // ring. align24 504: body ALL-GREEN, only the top rim ring red (isolating the floor() rim defect as the sole blocker).
    if (!keyExists('render|done')) {
      const g1 = buildSmoothGridWall(rA, H, 1024, 256);
      dumpHeatmap(OUT_DIR, 'lowpoly_pow2_1024', g1.vertices, g1.ut, g1.indices, rA, H, { ruler: 'true3d', scaleMm: 0.01, preFilterMm: 0.001, meta: { klass: 'pow2 1024x256' } });
      const g2 = buildSmoothGridWall(rA, H, 504, 256);
      dumpHeatmap(OUT_DIR, 'lowpoly_align24_504', g2.vertices, g2.ut, g2.indices, rA, H, { ruler: 'true3d', scaleMm: 0.01, preFilterMm: 0.001, meta: { klass: 'align24 504x256' } });
      plog('[render] dumped lowpoly_pow2_1024 + lowpoly_align24_504 heatmaps (true-3D @0.01)');
      checkpoint({ key: 'render|done', dumped: ['lowpoly_pow2_1024', 'lowpoly_align24_504'] });
    }

    plog('[LOWPOLY-GRID-CLOSE] DONE');
  }, 30 * 60 * 1000);

  // ─────────────── POST-FIX VERIFY (the asserting gate for the two shipped fixes) ───────────────
  // With BOTH fixes shipped in src (rim floor() clamp in rOuterLowPolyFacet + the facet-aligned alignNU density
  // lever), rA is the FIXED analytic surface (no rim step) and the production density lands columns on the facet
  // edges. Whole-mesh true-3D MAX (seam + rim INCLUDED, the campaign standard — MAX not p99) must close ≤0.01 under
  // the ~1.05M-tri judge cap, watertight, and certAdapter must ACCEPT. This ASSERTS (unlike the diagnostic sweep above).
  it.skipIf(process.env.PF_LOWPOLY !== '1')('VERIFY: whole-mesh true-3D MAX ≤0.01 at facet-aligned density, watertight, judge ACCEPT', () => {
    const rA = buildAnalyticRadiusFn('LowPolyFacet', {}, { H, Rb, Rt, expn }) as unknown as AnalyticRadiusFn;

    // (1) RIM FIXED: the analytic rim step is now r0(z)-drift scale (~2.7e-5mm), not the ~1.124mm floor() phase step.
    let rimJump = 0;
    for (let i = 0; i < 2400; i++) {
      const th = (i / 2400) * TAU;
      rimJump = Math.max(rimJump, Math.abs(rA(th, H) - rA(th, H * (1 - 1e-6))));
    }
    plog(`[verify] RIM-JUMP (fixed rOuterLowPolyFacet) = ${rimJump.toExponential(3)}mm (was 1.124mm pre-fix)`);
    checkpoint({ key: 'verify|rimjump', rimJumpMm: rimJump });
    expect(rimJump).toBeLessThan(0.001);

    // (2) PRODUCTION DENSITY: exactly what buildSmoothGridDispatchWall injects for LowPolyFacet (alignNU=24).
    const CAP = 1_050_000; // judge triangle cap
    const dens = deriveSmoothGridDensity(rA, H, 0.01, { alignNU: 24 });
    plog(`[verify] deriveSmoothGridDensity(alignNU=24) ⇒ nU=${dens.nU} nT=${dens.nT} (nU%24=${dens.nU % 24})`);
    expect(dens.nU % 24).toBe(0);

    const g = buildSmoothGridWall(rA, H, dens.nU, dens.nT);
    const nF = g.indices.length / 3;
    expect(nF).toBeLessThanOrEqual(CAP);

    // (3) WHOLE-MESH true-3D MAX (seam + rim INCLUDED). perFaceTrue3DSag is a TRUSTED ruler here (the brute
    // cross-check above measured GN≈brute for the worst edge facets; align24 columns land ON the edges anyway).
    const sag = perFaceTrue3DSag(g.ut, g.indices, rA, H, { preFilterMm: 0.001 });
    let wMax = 0, wOut = 0;
    for (let f = 0; f < nF; f++) { const e = sag.faceErr[f]; if (e > wMax) wMax = e; if (e > 0.01) wOut++; }
    const nm = nonManRawBigStats(g.indices);
    plog(`[verify] ${dens.nU}x${dens.nT} tris=${nF} | WHOLE true3D MAX=${wMax.toFixed(6)} out=${wOut} | nonMan=${nm.nonMan} bnd=${nm.boundary}`);
    checkpoint({ key: 'verify|close', nU: dens.nU, nT: dens.nT, tris: nF, wholeMax: +wMax.toFixed(6), wholeOut: wOut, nonMan: nm.nonMan, boundary: nm.boundary });
    expect(wMax).toBeLessThanOrEqual(0.01);
    expect(nm.nonMan).toBe(0);

    // (4) JUDGE CERT: the certAdapter exact-dyadic partition must ACCEPT (mult-24 nU carries a small bounded δ).
    const v = certifyPeriodicGridMesh(g.ut, g.indices, g.vertices, dens.nU, 0, rA, H, 20, { patchId: `lowpoly-verify-${dens.nU}x${dens.nT}` });
    plog(`[verify] cert (${v.tris} tris) judge=${v.accepted ? 'ACCEPT' : 'REJECT'} maxδ=${v.maxDelta.toFixed(6)} wrap=${v.wrapTris} nonPos=${v.nonPosTris} straddle=${v.nonGapStraddle}`);
    checkpoint({ key: 'verify|cert', accepted: v.accepted, maxDelta: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPos: v.nonPosTris, straddle: v.nonGapStraddle });
    expect(v.accepted).toBe(true);

    plog(`[VERIFY] LowPolyFacet CLOSED — whole-mesh MAX ${wMax.toFixed(4)}mm ≤0.01 @ ${dens.nU}x${dens.nT} (${nF} tris), watertight, judge ACCEPT`);
  }, 10 * 60 * 1000);
});
