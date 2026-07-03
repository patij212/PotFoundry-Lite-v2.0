// _close_theta.test.ts — DEV-ONLY (PF_CLOSE_THETA=1). E-2026-07-03-CLOSE-THETA: close the θ-RIDGE axis
// (SuperformulaBlossom / GothicArches / SpiralRidges / HexagonalHive) toward honest true-3D perp ≤0.01mm,
// %<20 low, rawNonMan 0, ~zero serration (feature edges = mesh edges) — via the proven structured-column /
// M-square recipe (`buildScaleColMesh`, READ-ONLY compose of the committed libs).
//
// Instruments (all from labkit / _sfbPushLib, imported — nothing re-coded):
//   honest true-3D verdict = bruteAnchoredRedPerp (worst-red brute-anchored, corrects single-seed GN overstatement)
//   quality               = triangleQualityDistribution (pctBelow20, minAngleDeg, median)
//   watertight            = auditNonManRaw (raw-index, non-vacuous)
//   serration             = serrationToMeshEdge on the feature loci (ridge/valley) -> should be ~0
//   chord field           = perFaceChordSag (radial screen, picks the red set for the anchor)
//
// RESILIENCE: ONE it() per style (vitest flushes stdout per-test). A `progress.log` line + a `scorecard.ndjson`
// row are appended the INSTANT each (style,hRow) is scored, so a killed/OOM run leaves completed work on disk and
// resumes by skipping styles whose FINEST row already exists. Coarse hRow FIRST (bounds cost); HD confirm second.
import { describe, it, expect } from 'vitest';
import { existsSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, bruteAnchoredRedPerp, auditNonManByIndex,
  triangleQualityDistribution, dumpHeatmap,
} from './labkit';
import { buildScaleColMesh, measureSeamStep, measureKinkiness, findBirths } from './_scaleColDriver';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { rowExtrema, validateRidgeGraph } from './_structColLib';
import { serrationToMeshEdge } from './_sfbPushLib';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { RidgeGraph } from './_structColLib';

const RUN = process.env.PF_CLOSE_THETA === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_close_theta');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

function logp(msg: string): void { const line = `[${new Date().toISOString()}] ${msg}`; try { appendFileSync(PROG, line + '\n'); } catch { /* ignore */ } console.log(line); }

/** Raw-index non-manifold (by literal index, no weld) — non-vacuous watertight signal. */
function auditNonManRaw(indices: ArrayLike<number>): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

/** sample feature loci (crest + valley) from the ridge graph as flat (u,t) for the serration ruler. */
function featureLociUt(g: RidgeGraph): number[] {
  const out: number[] = [];
  for (let r = 0; r < g.ts.length; r++) {
    const t = g.ts[r];
    for (let s = 0; s < g.nCrest; s++) { const u = g.crestU[r][s]; if (!Number.isNaN(u)) { out.push(((u % 1) + 1) % 1, t); } }
    for (let s = 0; s < g.nValley; s++) { const u = g.valleyU[r][s]; if (!Number.isNaN(u)) { out.push(((u % 1) + 1) % 1, t); } }
  }
  return out;
}

function p99(arr: ArrayLike<number>): number { const s = Float64Array.from(arr as ArrayLike<number>).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0; }

interface StylePlan { style: StyleId; hRows: number[]; seamExcl: number; }
const PLANS: StylePlan[] = [
  { style: 'HexagonalHive' as StyleId, hRows: [0.40, 0.22], seamExcl: 0.02 },
  { style: 'SpiralRidges' as StyleId, hRows: [0.35, 0.20], seamExcl: 0.02 },
  { style: 'SuperformulaBlossom' as StyleId, hRows: [0.25, 0.15], seamExcl: 0.10 },
  { style: 'GothicArches' as StyleId, hRows: [0.25, 0.15], seamExcl: 0.02 },
];

function finestDone(style: string): boolean {
  if (!existsSync(NDJSON)) return false;
  const finest = PLANS.find((p) => p.style === style)!.hRows.slice(-1)[0];
  for (const ln of readFileSync(NDJSON, 'utf8').split('\n')) { if (!ln.trim()) continue; try { const r = JSON.parse(ln); if (r.style === style && r.hRow === finest) return true; } catch { /* skip */ } }
  return false;
}

function scoreStyle(plan: StylePlan): void {
  mkdirSync(DIR, { recursive: true });
  const style = plan.style;
  if (finestDone(style)) { logp(`${style}: finest row exists — SKIP (resume)`); return; }
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();

  // ---- RECON: structure / axis (cheap pure-rA) ----
  const seam = measureSeamStep(rA, H);
  const kink = measureKinkiness(rA, H);
  const reconTs = Array.from({ length: 61 }, (_, i) => i / 60);
  const gRecon = buildRidgeGraphDeflicker(rA, H, reconTs, 4096, { persistFrac: 0.06 });
  const vg = validateRidgeGraph(gRecon);
  const nCrest0 = rowExtrema(rA, 0, 1, 4096).length, nCrestTop = rowExtrema(rA, H, 1, 4096).length;
  const births = findBirths(rA, H, 4096).length;
  const axisOk = vg.maxDriftMm < 8 && vg.discontinuities < 5;
  logp(`${style} RECON: seamMax=${seam.max.toFixed(3)} kink=${kink.toFixed(4)} crest@0=${nCrest0} crest@top=${nCrestTop} nCrest=${gRecon.nCrest} nValley=${gRecon.nValley} births=${births} graphDrift=${vg.maxDriftMm.toFixed(2)}mm disc=${vg.discontinuities} axisOk=${axisOk}`);

  for (const hRow of plan.hRows) {
    const tb = Date.now();
    logp(`${style} h=${hRow}: building mesh...`);
    const build = buildScaleColMesh(rA, H, { hRowMm: hRow });
    const m = build.mesh;
    logp(`${style} h=${hRow}: built tris=${m.nF} nV=${m.nV} path=${build.path} builder=${build.builder} (${Date.now() - tb}ms) — scoring...`);
    const xyz = m.xyz instanceof Float64Array ? m.xyz : Float64Array.from(m.xyz);
    const radial = perFaceChordSag(m.ut, m.idx, rA, H);
    const anchor = radial.fracOver(0.1) > 0
      ? bruteAnchoredRedPerp(m.ut, m.idx, rA, H, { redMm: 0.1, sampleN: 40, radial })
      : { trustedP99: 0, gnP99: 0, nRed: 0, gnOver: 0 };
    const honest = anchor.nRed > 0 ? anchor.trustedP99 : p99(radial.faceErr);
    const tq = triangleQualityDistribution({ vertices: xyz, indices: m.idx });
    // interior quality (drop facets whose centroid u is within seamExcl of the seam)
    const nF = m.idx.length / 3; const intIdx: number[] = [];
    for (let f = 0; f < nF; f++) {
      const a = m.idx[3 * f], b = m.idx[3 * f + 1], c = m.idx[3 * f + 2];
      let u = (m.ut[2 * a] + m.ut[2 * b] + m.ut[2 * c]) / 3; u = ((u % 1) + 1) % 1;
      if (Math.min(u, 1 - u) >= plan.seamExcl) intIdx.push(a, b, c);
    }
    const itq = intIdx.length > 0 ? triangleQualityDistribution({ vertices: xyz, indices: intIdx }) : tq;
    const rawNM = auditNonManRaw(m.idx);
    const weldNM = auditNonManByIndex(xyz, m.idx);
    const featUt = featureLociUt(build.graph);
    const serr = featUt.length > 0 ? serrationToMeshEdge(featUt, rA, H, xyz, m.idx) : { worstMm: 0, p99Mm: 0, meanMm: 0, n: 0 };
    const row = {
      style, hRow, path: build.path, builder: build.builder,
      seamMax: +seam.max.toFixed(4), kink: +kink.toFixed(4),
      nCrest: build.nCrest, nValley: build.nValley, births: build.births, genuineBirths: build.genuineBirths,
      graphDriftMm: +vg.maxDriftMm.toFixed(3), graphDisc: vg.discontinuities, axisOk,
      tris: m.nF,
      honestTrue3dP99: +honest.toFixed(4), radialP99: +p99(radial.faceErr).toFixed(4), radialMaxMm: +radial.worstMm.toFixed(4),
      gnP99: +anchor.gnP99.toFixed(4), nRed: anchor.nRed, gnOver: anchor.gnOver,
      pctBelow20: +tq.pctBelow20.toFixed(2), minAngleDeg: +tq.minAngleDeg.toFixed(1), medianMinAngle: +tq.medianMinAngleDeg.toFixed(1),
      intPctBelow20: +itq.pctBelow20.toFixed(2), intMinAngle: +itq.minAngleDeg.toFixed(1),
      rawNonMan: rawNM, weldNonMan: weldNM,
      serrationWorstMm: +serr.worstMm.toFixed(4), serrationP99Mm: +serr.p99Mm.toFixed(4),
      reaches001: honest <= 0.010 && tq.pctBelow20 < 5 && rawNM === 0,
      hRowMs: Date.now() - tb, totalMs: Date.now() - t0,
    };
    appendFileSync(NDJSON, JSON.stringify(row) + '\n');
    logp(`${style} h=${hRow}: tris=${m.nF} honestTrue3dP99=${row.honestTrue3dP99} (gn=${row.gnP99} nRed=${anchor.nRed} radialP99=${row.radialP99}) %<20=${row.pctBelow20} int%<20=${row.intPctBelow20} minAng=${row.minAngleDeg} rawNM=${rawNM} weldNM=${weldNM} serr=${row.serrationWorstMm} reaches=${row.reaches001}`);
    if (hRow === plan.hRows[plan.hRows.length - 1]) {
      try { dumpHeatmap(DIR, `ct_${style}`, xyz, m.ut, m.idx, rA, H, { stl: false, meta: { hRow, tris: m.nF } }); logp(`${style}: heatmap dumped`); } catch (e) { logp(`heatmap ${style} failed: ${String(e)}`); }
    }
  }
}

// ONE test per style so vitest flushes stdout per-style and an OOM in one style does not lose the others.
describe('E-2026-07-03-CLOSE-THETA — θ-ridge axis close', () => {
  for (const plan of PLANS) {
    it.skipIf(!RUN)(`score ${plan.style}`, () => { scoreStyle(plan); expect(existsSync(NDJSON) || finestDone(plan.style)).toBeTruthy(); }, 60 * 60 * 1000);
  }
});
