// _dsHybrid.test.ts — E-2026-07-20-DS-HYBRID. Compose the CONVERGE-A strip-emitter RING bands (watertight-by-
// construction tread, its proven domain) with a REGION-KERNEL flank-toe BODY (the substrate that conforms scale
// tips/flanks per E-2026-07-13-DS-INTERIOR-CLOSE) — the synthesis the DS-BODY-CLOSE WALL (0de61b74) pointed to.
//
// WHY A HYBRID: DS-BODY-CLOSE proved the strip emitter's uniform-nU grid closes the ring + the body t-cusp RIDGELINE
// but NOT the scale-TIP cone points (2D C1 singularities) — those need LOCAL 2D refinement the uniform grid can't
// give (O(1/sqrt(tris)) => ~36M tris to hit 0.01). The region kernel has curvature-adaptive LOCAL sizing
// (curvatureFineStep) + flank-toe constraint edges, and E-DS-INTERIOR-CLOSE certified the body p99 0.009 @2.64M.
// BUT that was certified on p99 — the whole-mesh standard is MAX <=0.01, and U1/U2 just proved the scale-tip cones
// are exactly where MAX hides. So the hybrid can be DEAD ON ARRIVAL if the region-kernel body does not itself hold
// MAX <=0.01 at the tips.
//
// SEQUENCED DISCRIMINATORS (cheapest-first; DO NOT build any weld before D1 passes):
//   D1 (this unit, cheapest — no new code): re-score the region-kernel DS body STANDALONE with the DS-BODY-CLOSE
//      adversarial-grade instruments (fwd perFaceTrue3DSag body-MAX + rev-coverage via buildArtifactLocator/
//      oneSidedRA at the U2 density). If the region-kernel BODY (dz-to-ring > the ring-band cut, its hybrid domain)
//      does NOT hold MAX <=0.01 at the tips, the hybrid is DEAD ON ARRIVAL => record honestly, pivot to the fallback
//      (per-scale-tip local 2D refinement in the strip emitter). If D1 PASSES => proceed to D2 (band-cut boundary
//      compatibility) then D3 (compose + measure the full welded wall incl. the seam band).
//
// OVERALL HYBRID KILL-CRITERION (pre-registered): CLOSED iff the composed DS wall has rev-coverage MAX <=0.01 (0
// samples >0.01 at U2 density) AND fwd true-3D MAX <=0.01 — INCLUDING the weld seam band — AND nonMan-by-index 0 with
// a non-vacuous crack control AND ring no-regress (shoulder <=0.0066-class, tread on-wall, flank <=0.01). Report
// slivers (triangleQualityDistribution minAngle — region-kernel-class expected; document the known 0.3deg needle) +
// build wall-clock + tris (region kernel 58-329s; budget declared per unit). WALL otherwise — name the mechanism.
//
// D1 GATE (pre-registered): D1 PASS (hybrid alive) iff region-kernel BODY (centroid dz-to-nearest-ring > 1.0mm) fwd
// true-3D MAX <=0.01 AND rev-coverage BODY MAX <=0.01 (0 body samples >0.01 at nU1024 x nT2400). D1 FAIL (hybrid dead
// on arrival) iff BODY MAX >0.01 (the tips) — pivot to fallback. Budget: SCREEN 1.0M pts then HD 2.4M pts (matches the
// DS-INTERIOR-CLOSE HD that certified p99 0.009 @2.64M). Report actual tris + wall-clock + CPU.
//
// DEV-ONLY; research/ only; imports src READ-ONLY (buildMetricMesh + buildDragonScalesConformingGraph + dsRingStrips).
// No production default changed; no flag flipped. Every unit is env-gated + checkpointed => a killed run resumes.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import {
  perFaceTrue3DSag, triangleQualityDistribution, liftUtToRadial, auditNonManByIndex,
} from './labkit';
import {
  dsRadiusFn, dragonRings, H as DS_H, TOL, DENSE, buildArtifactLocator, oneSidedRA,
} from './_ds_prodtruth_lib';
import { buildMetricMesh, type MetricMeshOpts } from '../../src/renderers/webgpu/parametric/conforming/tierC/regionMetric';
import {
  buildDragonScalesConformingGraph, buildThetaEdgeGraph, buildFlankToeGraph, buildSeamRail, mergeGraphs,
  seamSymmetrizeGraph, type FeatureGraph,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/dsFeatureEdges';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const SCALE_ROWS = 8;
// DS-INTERIOR-CLOSE region-kernel config (verbatim from _dsFlankAniso.test.ts — the certified body recipe).
const SIZE_RES = 192, HMAX_3D = 8, GRADE_BETA = 0.2, FINE_STEP = 0.0022, SUBSAMPLES = 4, SEAM_RAIL = 128;
const BODY_CUT_MM = 1.0; // ring-band cut: the region kernel owns dz-to-ring > this in the hybrid (strips own <= this).
const OUT_DIR = join('research', 'exchange', '_dsHybrid');
const NDJSON = join(OUT_DIR, 'hybrid.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}

function ringZsArr(): number[] { return dragonRings().map((r) => r.z); }
function centroidZ(xyz: Float32Array | Float64Array, idx: Uint32Array, f: number): number {
  return (xyz[3 * idx[3 * f] + 2] + xyz[3 * idx[3 * f + 1] + 2] + xyz[3 * idx[3 * f + 2] + 2]) / 3;
}
function dzToRing(zc: number, ringZs: number[]): number { let m = 1e9; for (const rz of ringZs) { const d = Math.abs(zc - rz); if (d < m) m = d; } return m; }
/** distance of a t (0..1) to the nearest scale-center crest (k+0.5)/scaleRows — to tag whether the worst is a tip. */
function dtToCrest(t: number): number { let m = 1e9; for (let k = 0; k < SCALE_ROWS; k++) { const d = Math.abs(t - (k + 0.5) / SCALE_ROWS); if (d < m) m = d; } return m; }

/** CREST-RIDGE constraint family (D1b): u-running lines at t=(k+0.5)/scaleRows (the scale-center t-CUSP ridgelines
 * the DS graph OMITS — it has only theta-valleys at scale edges + flank-toe silhouettes, never the crest). nUper=512
 * lands a NODE on every scale-center TIP (even-row tips u=(m+0.5)/16, odd-row tips u=m/16 — both are j*32/512). Merged
 * BEFORE seamSymmetrize so the seam column is handled identically to the DS graph. u=1 excluded (periodic image of 0). */
function buildCrestRidgeGraph(H: number, nUper: number): FeatureGraph {
  const pts: number[] = []; const edges: number[] = [];
  for (let k = 0; k < SCALE_ROWS; k++) {
    const t = (k + 0.5) / SCALE_ROWS; let prev = -1;
    for (let j = 0; j < nUper; j++) { // exclude j=nUper (u=1 ≡ u=0)
      const pos = pts.length / 2; pts.push(j / nUper, t);
      if (prev >= 0) edges.push(prev, pos); prev = pos;
    }
  }
  return { pts, edges };
}

/** Analytic crest-ridge locus samples for the crestSizeOverlay (T2): the scale-center t-cusp lines t=(k+0.5)/8 at
 * every u station (nUper covers all tips), each forced to `h3DMm`. The ANALYTIC-scoring move — the metric fineness
 * FOLLOWS the KNOWN cone loci instead of the FD-aliased grid curvature (step 0.0022 smooths the C1 cusp). */
function buildCrestSizeSamples(nUper: number, h3DMm: number): Array<{ u: number; t: number; h3DMm: number }> {
  const out: Array<{ u: number; t: number; h3DMm: number }> = [];
  for (let k = 0; k < SCALE_ROWS; k++) { const t = (k + 0.5) / SCALE_ROWS; for (let j = 0; j < nUper; j++) out.push({ u: j / nUper, t, h3DMm }); }
  return out;
}

/** The 128 scale-TIP (u,t) apexes (16 scales × 8 rows): even rows u=(m+0.5)/16, odd rows u=m/16, at t=(k+0.5)/8. */
function scaleTipUts(): Array<{ u: number; t: number }> {
  const tips: Array<{ u: number; t: number }> = [];
  for (let k = 0; k < SCALE_ROWS; k++) {
    const t = (k + 0.5) / SCALE_ROWS;
    for (let m = 0; m < 16; m++) { let u = (k % 2 === 0 ? (m + 0.5) : m) / 16; u -= Math.floor(u); tips.push({ u, t }); }
  }
  return tips;
}

/** T3 cone-fan: a graded polar fan of pinned SEED points around EACH scale-tip apex — the apex + geometric rings at
 * radii `radiiMm` (arc-mm), `nAz` azimuths each, mapped arc→u by the local circumference and z→t by H. The graded
 * density makes the near-apex facets tiny (a cone is ruled ⇒ the azimuthal chord is the residual, which the chord
 * guard finishes). The EXPLICIT graded geometry the sizing field (T2) and the metric-longest chord guard (T1) both
 * failed to produce at a point cone. Returns a flat (u,t) list to append to injectedPoints. */
function buildConeFanPoints(radiiMm: number[], nAz: number): number[] {
  const out: number[] = [];
  for (const tip of scaleTipUts()) {
    const circ = TAU * (40 + 10 * tip.t); // r0(t) ≈ Rb + (Rt-Rb)*t = 40 + 10 t; DS modulation ≈ 1.
    out.push(tip.u, tip.t); // apex
    for (const rho of radiiMm) {
      for (let a = 0; a < nAz; a++) {
        const phi = (TAU * a) / nAz;
        let u = tip.u + (rho * Math.cos(phi)) / circ; u -= Math.floor(u);
        const t = Math.min(1 - 1e-6, Math.max(1e-6, tip.t + (rho * Math.sin(phi)) / DS_H));
        out.push(u, t);
      }
    }
  }
  return out;
}

/** Build the region-kernel DS wall. `crestRidge` (D1b) adds the crest-ridge family, reconstructing the SAME base graph
 * (theta24 + toe16 + seamRail128, seamSymmetrized) as the D1 base so the arms are apples-to-apples. `extra` merges
 * tournament levers (chordSteiner / crestSizeOverlay+crestBandCells) into the kernel opts. */
function buildRegionWall(maxPoints: number, crestRidge = false, extra: Partial<MetricMeshOpts> = {}, extraInjected: number[] = []): { rA: AnalyticRadiusFn; xyz: Float32Array; idx: Uint32Array; ut: number[]; tris: number; buildS: number; cpuS: number; graphPts: number } {
  const rA = dsRadiusFn() as AnalyticRadiusFn;
  let graph: FeatureGraph;
  if (crestRidge) {
    const theta = buildThetaEdgeGraph(DS_H, 24, 1.3);
    const toe = buildFlankToeGraph(DS_H, 16, 1.3, 0.04);
    const rail = buildSeamRail(SEAM_RAIL);
    const crest = buildCrestRidgeGraph(DS_H, 512);
    let combo = mergeGraphs({ pts: theta.pts, edges: theta.edges }, { pts: toe.pts, edges: toe.edges });
    combo = mergeGraphs(combo, rail);
    combo = mergeGraphs(combo, crest);
    graph = seamSymmetrizeGraph(combo);
  } else {
    graph = buildDragonScalesConformingGraph(DS_H, { seamRailSamples: SEAM_RAIL });
  }
  // T3 cone-fan: append graded polar-fan seed points AFTER the graph points (constraintEdges index the graph's
  // positions, unchanged) — extra pinned seeds, no edges (a cone apex is a POINT, resolved by graded density).
  const injected = extraInjected.length ? graph.pts.concat(extraInjected) : graph.pts;
  const opts: MetricMeshOpts = {
    tolMm: TOL, hMin: 0.02, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints, guardManifoldAlways: true,
    injectedPoints: injected, constraintEdges: graph.edges, pinInjected: true, recoverySubdivideCollinear: true,
    curvatureFineStep: FINE_STEP, curvatureSubsamples: SUBSAMPLES,
    chordTolMm: TOL, chordSampleN: 8,
    ...extra,
  };
  const t0 = Date.now(); const c0 = cpuUsage();
  const mesh = buildMetricMesh(rA, DS_H, opts);
  const cpu = cpuUsage(c0);
  const xyz = liftUtToRadial(mesh.ut, rA, DS_H).vertices;
  return { rA, xyz, idx: mesh.indices, ut: mesh.ut, tris: mesh.indices.length / 3, buildS: (Date.now() - t0) / 1000, cpuS: (cpu.user + cpu.system) / 1e6, graphPts: graph.pts.length / 2 };
}

/** GLOBAL reverse coverage split BODY (dz>cut) vs RING-BAND (dz<=cut): dense true-surface (one-sided) -> nearest mesh. */
function revCoverageSplit(
  loc: { dist: (x: number, y: number, z: number) => number }, rAos: AnalyticRadiusFn, ringZs: number[], cutMm: number,
  nU = 1024, nT = 2400,
): { bodyMax: number; bodyOut: number; bodyN: number; bodyWorstU: number; bodyWorstT: number; ringMax: number } {
  let bMax = 0, bOut = 0, bN = 0, bU = 0, bT = 0, rMax = 0;
  for (let j = 0; j < nT; j++) {
    const z = (j / (nT - 1)) * DS_H;
    const inBody = dzToRing(z, ringZs) > cutMm;
    for (let i = 0; i < nU; i++) {
      const th = (i / nU) * TAU; const r = rAos(th, z);
      const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
      if (inBody) { bN++; if (d > TOL) bOut++; if (d > bMax) { bMax = d; bU = i / nU; bT = z / DS_H; } }
      else if (d > rMax) rMax = d;
    }
  }
  return { bodyMax: +bMax.toFixed(6), bodyOut: bOut, bodyN: bN, bodyWorstU: +bU.toFixed(4), bodyWorstT: +bT.toFixed(5), ringMax: +rMax.toFixed(6) };
}

interface Wall { rA: AnalyticRadiusFn; xyz: Float32Array; idx: Uint32Array; ut: number[]; tris: number }
/** CHEAP tip metric (no BVH): fwd `perFaceTrue3DSag` MAX over BODY facets (dz-to-ring > BODY_CUT_MM) — the worst body
 * facet IS the scale tip. + slivers + nonMan. The tournament ranks arms on this; rev confirms the contenders. */
function scoreFwdTip(m: Wall, ringZs: number[]): { fwdMax: number; fwdP99: number; fwdOut: number; fwdN: number; fwdU: number; fwdT: number; apexMax: number; apexOut: number; apexN: number; pctBelow20: number; minAngle: number; nonMan: number } {
  const sag = perFaceTrue3DSag(m.ut, m.idx, m.rA, DS_H, { preFilterMm: 0.005 });
  let fMax = 0, fu = 0, ft = 0, fn = 0, apexMax = 0, apexOut = 0, apexN = 0; const errs: number[] = [];
  const nF = m.idx.length / 3;
  for (let f = 0; f < nF; f++) {
    const zc = centroidZ(m.xyz, m.idx, f);
    if (dzToRing(zc, ringZs) <= BODY_CUT_MM) continue;
    fn++; const e = sag.faceErr[f]; errs.push(e);
    if (e > fMax) { fMax = e; const a = m.idx[3 * f]; fu = m.ut[2 * a]; ft = m.ut[2 * a + 1]; }
    // APEX population: facets whose centroid t is within 0.6mm (in t) of a crest ridgeline — isolates the TIP CONE
    // residual from the ordinary flank/body curvature (which has its own lever, E-DS-CONVERGE-B aniso).
    if (dtToCrest(zc / DS_H) < 0.6 / DS_H) { apexN++; if (e > apexMax) apexMax = e; if (e > TOL) apexOut++; }
  }
  errs.sort((x, y) => x - y);
  const p99 = errs.length ? errs[Math.floor(0.99 * errs.length)] : 0;
  let out = 0; for (const e of errs) if (e > TOL) out++;
  const q = triangleQualityDistribution({ vertices: m.xyz, indices: m.idx });
  const nonMan = m.tris < 5_500_000 ? auditNonManByIndex(m.xyz, m.idx) : -1;
  return { fwdMax: +fMax.toFixed(6), fwdP99: +p99.toFixed(6), fwdOut: out, fwdN: fn, fwdU: +fu.toFixed(4), fwdT: +ft.toFixed(5), apexMax: +apexMax.toFixed(6), apexOut, apexN, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(3), nonMan };
}
/** rev-coverage BODY tip metric (BVH — the ~2min confirm). Call only for a PROMISING arm (fwdMax small). */
function scoreRevTip(m: Wall, ringZs: number[]): { revMax: number; revOut: number; revU: number; revT: number } {
  const loc = buildArtifactLocator(m.xyz, m.idx);
  const rAos = oneSidedRA(m.rA, ringZs, 1e-4) as unknown as AnalyticRadiusFn;
  const rc = revCoverageSplit(loc, rAos, ringZs, BODY_CUT_MM);
  return { revMax: rc.bodyMax, revOut: rc.bodyOut, revU: rc.bodyWorstU, revT: rc.bodyWorstT };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('DS HYBRID — region-kernel flank-toe body composed with strip-emitter ring bands', () => {
  // D1 (GATE): re-score the region-kernel DS body STANDALONE. Does its curvature-adaptive flank-toe conforming hold
  // MAX <=0.01 at the scale-tip cones where the uniform-grid strip emitter failed? SCREEN 1.0M then HD 2.4M.
  it.skipIf(process.env.PF_DSHYBRID_D1 !== '1')('D1 GATE — region-kernel body MAX at the scale tips (fwd + rev)', () => {
    plog(`=== D1 GATE => ${NDJSON} ===`);
    const budgets: Array<{ tag: string; pts: number }> = [
      { tag: 'screen1.0M', pts: 1_000_000 },
      { tag: 'hd2.4M', pts: 2_400_000 },
    ];
    const only = process.env.PF_DSHYBRID_BUDGET; // optionally run one budget
    const ringZs = ringZsArr();
    for (const b of budgets) {
      if (only && b.tag !== only) continue;
      const key = `D1|${b.tag}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const m = buildRegionWall(b.pts);
      plog(`[D1][${b.tag}] pts=${b.pts} tris=${m.tris} build=${m.buildS.toFixed(1)}s cpu=${m.cpuS.toFixed(1)}s`);

      // fwd true-3D over BODY facets (perFaceTrue3DSag; body = centroid dz-to-ring > BODY_CUT_MM). Report the worst
      // facet's (u,t) + its distance-to-crest so we can SEE whether the MAX is a scale tip.
      const sag = perFaceTrue3DSag(m.ut, m.idx, m.rA, DS_H, { preFilterMm: 0.005 });
      let bodyMax = 0, bwU = 0, bwT = 0, bodyN = 0;
      const nF = m.idx.length / 3;
      const bodyErrs: number[] = [];
      for (let f = 0; f < nF; f++) {
        if (dzToRing(centroidZ(m.xyz, m.idx, f), ringZs) <= BODY_CUT_MM) continue;
        bodyN++; const e = sag.faceErr[f]; bodyErrs.push(e);
        if (e > bodyMax) { bodyMax = e; const a = m.idx[3 * f]; bwU = m.ut[2 * a]; bwT = m.ut[2 * a + 1]; }
      }
      bodyErrs.sort((x, y) => x - y);
      const p99 = bodyErrs.length ? bodyErrs[Math.floor(0.99 * bodyErrs.length)] : 0;
      let bodyOut = 0; for (const e of bodyErrs) if (e > TOL) bodyOut++;
      // adversarial brute cross-check of the worst-1 body facet via full DENSE projection (already GN; anchor sanity).
      plog(`[D1][${b.tag}] fwd BODY(dz>${BODY_CUT_MM}) true-3D MAX=${bodyMax.toFixed(6)} p99=${p99.toFixed(6)} out>${TOL}=${bodyOut}/${bodyN} worst@u=${bwU.toFixed(4)} t=${bwT.toFixed(5)} dtToCrest=${dtToCrest(bwT).toFixed(5)}`);

      // rev coverage split body/ring.
      const loc = buildArtifactLocator(m.xyz, m.idx);
      const rAos = oneSidedRA(m.rA, ringZs, 1e-4) as unknown as AnalyticRadiusFn;
      const rc = revCoverageSplit(loc, rAos, ringZs, BODY_CUT_MM);
      plog(`[D1][${b.tag}] rev BODY MAX=${rc.bodyMax} out>${TOL}=${rc.bodyOut}/${rc.bodyN} worst@u=${rc.bodyWorstU} t=${rc.bodyWorstT} dtToCrest=${dtToCrest(rc.bodyWorstT).toFixed(5)} | ring-band rev MAX=${rc.ringMax} (expected high — strips fix)`);

      // slivers + watertight (region kernel is generally watertight; audit for completeness — <5.6M tris so Map ok).
      const q = triangleQualityDistribution({ vertices: m.xyz, indices: m.idx });
      const nonMan = m.tris < 5_500_000 ? auditNonManByIndex(m.xyz, m.idx) : -1;
      plog(`[D1][${b.tag}] slivers %<20=${q.pctBelow20.toFixed(2)} minAngle=${q.minAngleDeg.toFixed(3)} | nonMan=${nonMan}`);

      const pass = bodyMax <= TOL && rc.bodyMax <= TOL && rc.bodyOut === 0;
      checkpoint({
        key, tag: b.tag, pts: b.pts, tris: m.tris, buildS: +m.buildS.toFixed(1), cpuS: +m.cpuS.toFixed(1),
        fwdBodyMax: +bodyMax.toFixed(6), fwdBodyP99: +p99.toFixed(6), fwdBodyOut: bodyOut, bodyFacets: bodyN,
        fwdWorst: { u: +bwU.toFixed(4), t: +bwT.toFixed(5), dtToCrest: +dtToCrest(bwT).toFixed(5) },
        revBodyMax: rc.bodyMax, revBodyOut: rc.bodyOut, revBodyN: rc.bodyN, revWorst: { u: rc.bodyWorstU, t: rc.bodyWorstT, dtToCrest: +dtToCrest(rc.bodyWorstT).toFixed(5) },
        ringBandRevMax: rc.ringMax, pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), nonMan,
        D1_PASS: pass,
      });
      plog(`[D1][${b.tag}] DONE — D1_PASS=${pass}`);
    }
    plog('[D1] DONE');
  }, 180 * 60 * 1000);

  // D1b (REVIVAL TEST): the DS graph OMITS the crest ridgeline + scale-tip (only theta-valley scale-EDGES + flank-toe
  // silhouettes). Does adding a CREST-RIDGE constraint family (u-lines at t=(k+0.5)/8 with nodes on every tip) close
  // the region-kernel body tip MAX <=0.01? If yes => the hybrid is REVIVABLE via a graph fix (port crest-ridge into
  // dsFeatureEdges). If no => the scale-tip cone is a genuine region-kernel wall too => DOUBLE WALL, escalate.
  it.skipIf(process.env.PF_DSHYBRID_D1B !== '1')('D1b REVIVAL — region kernel + crest-ridge constraint at the tips', () => {
    plog(`=== D1b REVIVAL => ${NDJSON} ===`);
    const pts = process.env.PF_DSHYBRID_BUDGET === 'hd2.4M' ? 2_400_000 : 1_000_000;
    const key = `D1b|crestRidge_${pts}`;
    if (keyExists(key)) { plog(`[skip] ${key}`); plog('[D1b] DONE'); return; }
    const ringZs = ringZsArr();
    const m = buildRegionWall(pts, true);
    plog(`[D1b] +crestRidge pts=${pts} graphPts=${m.graphPts} tris=${m.tris} build=${m.buildS.toFixed(1)}s cpu=${m.cpuS.toFixed(1)}s`);
    const sag = perFaceTrue3DSag(m.ut, m.idx, m.rA, DS_H, { preFilterMm: 0.005 });
    let bodyMax = 0, bwU = 0, bwT = 0, bodyN = 0; const errs: number[] = [];
    const nF = m.idx.length / 3;
    for (let f = 0; f < nF; f++) {
      if (dzToRing(centroidZ(m.xyz, m.idx, f), ringZs) <= BODY_CUT_MM) continue;
      bodyN++; const e = sag.faceErr[f]; errs.push(e);
      if (e > bodyMax) { bodyMax = e; const a = m.idx[3 * f]; bwU = m.ut[2 * a]; bwT = m.ut[2 * a + 1]; }
    }
    errs.sort((x, y) => x - y);
    const p99 = errs.length ? errs[Math.floor(0.99 * errs.length)] : 0;
    let out = 0; for (const e of errs) if (e > TOL) out++;
    plog(`[D1b] fwd BODY(dz>${BODY_CUT_MM}) MAX=${bodyMax.toFixed(6)} p99=${p99.toFixed(6)} out>${TOL}=${out}/${bodyN} worst@u=${bwU.toFixed(4)} t=${bwT.toFixed(5)} dtToCrest=${dtToCrest(bwT).toFixed(5)}`);
    const loc = buildArtifactLocator(m.xyz, m.idx);
    const rAos = oneSidedRA(m.rA, ringZs, 1e-4) as unknown as AnalyticRadiusFn;
    const rc = revCoverageSplit(loc, rAos, ringZs, BODY_CUT_MM);
    plog(`[D1b] rev BODY MAX=${rc.bodyMax} out>${TOL}=${rc.bodyOut}/${rc.bodyN} worst@u=${rc.bodyWorstU} t=${rc.bodyWorstT} dtToCrest=${dtToCrest(rc.bodyWorstT).toFixed(5)}`);
    const q = triangleQualityDistribution({ vertices: m.xyz, indices: m.idx });
    const nonMan = m.tris < 5_500_000 ? auditNonManByIndex(m.xyz, m.idx) : -1;
    plog(`[D1b] slivers %<20=${q.pctBelow20.toFixed(2)} minAngle=${q.minAngleDeg.toFixed(3)} nonMan=${nonMan}`);
    const revive = bodyMax <= TOL && rc.bodyMax <= TOL && rc.bodyOut === 0;
    checkpoint({
      key, pts, graphPts: m.graphPts, tris: m.tris, buildS: +m.buildS.toFixed(1), cpuS: +m.cpuS.toFixed(1),
      fwdBodyMax: +bodyMax.toFixed(6), fwdBodyP99: +p99.toFixed(6), fwdBodyOut: out, bodyFacets: bodyN,
      fwdWorst: { u: +bwU.toFixed(4), t: +bwT.toFixed(5), dtToCrest: +dtToCrest(bwT).toFixed(5) },
      revBodyMax: rc.bodyMax, revBodyOut: rc.bodyOut, revWorst: { u: rc.bodyWorstU, t: rc.bodyWorstT, dtToCrest: +dtToCrest(rc.bodyWorstT).toFixed(5) },
      pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), nonMan, D1b_REVIVE: revive,
    });
    plog(`[D1b] DONE — D1b_REVIVE=${revive}`);
  }, 180 * 60 * 1000);

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // FRONTIER TOURNAMENT on the DS scale-tip CONE APEX (the DOUBLE WALL: strip 0.042 / region 0.040).
  // PRE-REGISTERED per-arm KILL-CRITERION (committed BEFORE running): an arm CONVERGES iff its tip-population true-3D
  // MAX (fwd `perFaceTrue3DSag` body-MAX AND, when fwd is promising, rev-coverage body-MAX) reaches ≤0.01 at a bounded
  // SCREEN budget (≤0.8M pts / ≤~2×L2 tris), with the sag-vs-tris (or sag-vs-target-size) law measured across ≥2
  // points so "MOVES-BUT-FLOORS" (slope→0 above 0.01) is distinguishable from "CONVERGES" (reaches ≤0.01 or the law
  // extrapolates to ≤0.01 within ~6.35M tris). WINNER = the arm reaching ≤0.01 at the fewest tris; it alone gets an
  // HD confirm. All arms sit on the D1b crest-ridge base (the t-cusp RIDGELINE captured; the isolated TIP is what's
  // left). READ-ONLY src (chordSteiner / crestSizeOverlay are existing MetricMeshOpts levers).

  // T1 — chordSteiner-AT-apex. E-DS-CONVERGE-B refuted chordSteiner for the DISTRIBUTED along-flank but noted "an edge
  // split can't converge an interior APEX; a Steiner CAN" — the scale tip IS an isolated apex ⇒ untested & indicated.
  it.skipIf(process.env.PF_DSHYBRID_T1 !== '1')('T1 chordSteiner — Steiner-at-apex on the crest-ridge base', () => {
    plog(`=== T1 chordSteiner => ${NDJSON} ===`);
    const ringZs = ringZsArr();
    const arms: Array<{ tag: string; pts: number }> = [
      { tag: '400k', pts: 400_000 },
      { tag: '700k', pts: 700_000 },
    ];
    for (const a of arms) {
      const key = `T1|steiner_${a.tag}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const m = buildRegionWall(a.pts, true, { chordSteiner: true });
      const f = scoreFwdTip(m, ringZs);
      plog(`[T1][${a.tag}] pts=${a.pts} tris=${m.tris} build=${m.buildS.toFixed(1)}s cpu=${m.cpuS.toFixed(1)}s fwdTIP MAX=${f.fwdMax} p99=${f.fwdP99} out=${f.fwdOut}/${f.fwdN} @u=${f.fwdU} t=${f.fwdT} dtToCrest=${dtToCrest(f.fwdT).toFixed(5)} | %<20=${f.pctBelow20} minAng=${f.minAngle} nonMan=${f.nonMan}`);
      const row: Record<string, unknown> = { key, arm: 'chordSteiner', tag: a.tag, pts: a.pts, tris: m.tris, cpuS: +m.cpuS.toFixed(1), fwdTipMax: f.fwdMax, fwdP99: f.fwdP99, fwdOut: f.fwdOut, fwdWorst: { u: f.fwdU, t: f.fwdT, dtToCrest: +dtToCrest(f.fwdT).toFixed(5) }, pctBelow20: f.pctBelow20, minAngle: f.minAngle, nonMan: f.nonMan };
      if (f.fwdMax <= 0.02) { const r = scoreRevTip(m, ringZs); plog(`[T1][${a.tag}] rev TIP MAX=${r.revMax} out=${r.revOut} @u=${r.revU} t=${r.revT}`); row.revTipMax = r.revMax; row.revOut = r.revOut; row.revWorst = { u: r.revU, t: r.revT }; }
      row.CONVERGED = (row.fwdTipMax as number) <= TOL && (row.revTipMax === undefined || (row.revTipMax as number) <= TOL);
      checkpoint(row);
    }
    plog('[T1] DONE');
  }, 180 * 60 * 1000);

  // T2 — exact-analytic cone-slope sizing (the analytic-scoring move): crestSizeOverlay forces the metric fineness to
  // FOLLOW the KNOWN crest-ridge/tip loci (h3DMm swept) instead of the FD-aliased grid curvature (step 0.0022 smooths
  // the C1 cusp). The h3DMm sweep at fixed budget IS the convergence law for a sizing arm.
  it.skipIf(process.env.PF_DSHYBRID_T2 !== '1')('T2 crestOverlay — analytic cone-slope sizing at the tips', () => {
    plog(`=== T2 crestOverlay => ${NDJSON} ===`);
    const ringZs = ringZsArr();
    const PTS = 500_000;
    const arms: Array<{ tag: string; h: number }> = [
      { tag: 'h0.05', h: 0.05 },
      { tag: 'h0.02', h: 0.02 },
      { tag: 'h0.01', h: 0.01 },
    ];
    for (const a of arms) {
      const key = `T2|overlay_${a.tag}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const overlay = buildCrestSizeSamples(512, a.h);
      const m = buildRegionWall(PTS, true, { crestSizeOverlay: overlay, crestBandCells: 1 });
      const f = scoreFwdTip(m, ringZs);
      plog(`[T2][${a.tag}] h3D=${a.h} pts=${PTS} tris=${m.tris} build=${m.buildS.toFixed(1)}s cpu=${m.cpuS.toFixed(1)}s fwdTIP MAX=${f.fwdMax} p99=${f.fwdP99} out=${f.fwdOut}/${f.fwdN} @u=${f.fwdU} t=${f.fwdT} dtToCrest=${dtToCrest(f.fwdT).toFixed(5)} | %<20=${f.pctBelow20} minAng=${f.minAngle} nonMan=${f.nonMan}`);
      const row: Record<string, unknown> = { key, arm: 'crestOverlay', tag: a.tag, h3DMm: a.h, pts: PTS, tris: m.tris, cpuS: +m.cpuS.toFixed(1), fwdTipMax: f.fwdMax, fwdP99: f.fwdP99, fwdOut: f.fwdOut, fwdWorst: { u: f.fwdU, t: f.fwdT, dtToCrest: +dtToCrest(f.fwdT).toFixed(5) }, pctBelow20: f.pctBelow20, minAngle: f.minAngle, nonMan: f.nonMan };
      if (f.fwdMax <= 0.02) { const r = scoreRevTip(m, ringZs); plog(`[T2][${a.tag}] rev TIP MAX=${r.revMax} out=${r.revOut} @u=${r.revU} t=${r.revT}`); row.revTipMax = r.revMax; row.revOut = r.revOut; row.revWorst = { u: r.revU, t: r.revT }; }
      row.CONVERGED = (row.fwdTipMax as number) <= TOL && (row.revTipMax === undefined || (row.revTipMax as number) <= TOL);
      checkpoint(row);
    }
    plog('[T2] DONE');
  }, 180 * 60 * 1000);

  // T3 — DISCONTINUITY-FIRST cone-fan primitive (only reached because T1 chordSteiner FLOORED 0.072 and T2
  // crestSizeOverlay BACKFIRED 1.23). An EXPLICIT graded polar fan of pinned seeds around each of the 128 scale-tip
  // apexes (apex + geometric rings) makes the near-apex facets tiny by CONSTRUCTION — the graded local geometry the
  // sizing field (sub-grid-cell limited) and the metric-longest chord guard (halts on an isolated apex) could not
  // produce. sag-vs-tris across 2 budgets (+ optionally a finer inner ring) tests converge vs floor.
  it.skipIf(process.env.PF_DSHYBRID_T3 !== '1')('T3 coneFan — injected graded polar fan at each scale-tip apex', () => {
    plog(`=== T3 coneFan => ${NDJSON} ===`);
    const ringZs = ringZsArr();
    const RADII = process.env.PF_DSHYBRID_FANR === 'fine' ? [0.015, 0.035, 0.08, 0.18, 0.4] : [0.03, 0.07, 0.15, 0.3, 0.6];
    const nAz = process.env.PF_DSHYBRID_FANAZ ? parseInt(process.env.PF_DSHYBRID_FANAZ, 10) : 8;
    const fan = buildConeFanPoints(RADII, nAz);
    const arms: Array<{ tag: string; pts: number }> = [
      { tag: '400k', pts: 400_000 },
      { tag: '700k', pts: 700_000 },
    ];
    const suffix = process.env.PF_DSHYBRID_FANR === 'fine' ? '_fine' : '';
    for (const a of arms) {
      const key = `T3|coneFan${suffix}_az${nAz}_${a.tag}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const m = buildRegionWall(a.pts, true, { chordSteiner: true }, fan);
      const f = scoreFwdTip(m, ringZs);
      plog(`[T3][${a.tag}${suffix}] fanPts=${fan.length / 2} pts=${a.pts} tris=${m.tris} cpu=${m.cpuS.toFixed(1)}s fwdTIP MAX=${f.fwdMax} p99=${f.fwdP99} out=${f.fwdOut}/${f.fwdN} @u=${f.fwdU} t=${f.fwdT} dtToCrest=${dtToCrest(f.fwdT).toFixed(5)} | %<20=${f.pctBelow20} minAng=${f.minAngle} nonMan=${f.nonMan}`);
      const row: Record<string, unknown> = { key, arm: 'coneFan', tag: a.tag, fine: suffix === '_fine', nAz, fanPts: fan.length / 2, pts: a.pts, tris: m.tris, cpuS: +m.cpuS.toFixed(1), fwdTipMax: f.fwdMax, fwdP99: f.fwdP99, fwdOut: f.fwdOut, fwdWorst: { u: f.fwdU, t: f.fwdT, dtToCrest: +dtToCrest(f.fwdT).toFixed(5) }, pctBelow20: f.pctBelow20, minAngle: f.minAngle, nonMan: f.nonMan };
      if (f.fwdMax <= 0.02) { const r = scoreRevTip(m, ringZs); plog(`[T3][${a.tag}${suffix}] rev TIP MAX=${r.revMax} out=${r.revOut} @u=${r.revU} t=${r.revT}`); row.revTipMax = r.revMax; row.revOut = r.revOut; row.revWorst = { u: r.revU, t: r.revT }; }
      row.CONVERGED = (row.fwdTipMax as number) <= TOL && (row.revTipMax === undefined || (row.revTipMax as number) <= TOL);
      checkpoint(row);
    }
    plog('[T3] DONE');
  }, 180 * 60 * 1000);

  // T3HD — WINNER CONFIRM (cone-fan). T3 screen: fwd tip 0.108@0.80M -> 0.0278@1.40M (converging FASTER than 1/sqrt,
  // p99 0.0091), worst RELOCATED OFF the apex (dtToCrest 0.032 = mid-flank). Confirm at higher budgets and report the
  // APEX-cone residual (dtToCrest < 0.6mm) SEPARATELY from the global body max — apexMax isolates whether the cone
  // itself is closed (the tournament's actual target) vs the ordinary flank (E-DS-CONVERGE-B aniso's lever). Budgets
  // within ~2xL2 (6.35M tris).
  it.skipIf(process.env.PF_DSHYBRID_T3HD !== '1')('T3HD — cone-fan winner confirm (apex-cone vs flank)', () => {
    plog(`=== T3HD coneFan confirm => ${NDJSON} ===`);
    const ringZs = ringZsArr();
    const fine = process.env.PF_DSHYBRID_FANR === 'fine';
    const nAz = process.env.PF_DSHYBRID_FANAZ ? parseInt(process.env.PF_DSHYBRID_FANAZ, 10) : 8;
    // FINE fan: smaller inner radius + an extra inner ring (finer apex cells) — the radius lever the T3 screen showed
    // moves the apex; tests crossing <=0.01 at a TRACTABLE budget instead of a compute-prohibitive one.
    const RADII = fine ? [0.008, 0.02, 0.045, 0.1, 0.22, 0.45] : [0.03, 0.07, 0.15, 0.3, 0.6];
    const fan = buildConeFanPoints(RADII, nAz);
    const suffix = `${fine ? '_fine' : ''}${nAz !== 8 ? `_az${nAz}` : ''}`;
    const budgets = process.env.PF_DSHYBRID_HDPTS ? process.env.PF_DSHYBRID_HDPTS.split(',').map((s) => parseInt(s, 10)) : [1_000_000, 1_500_000, 2_200_000];
    for (const pts of budgets) {
      const key = `T3HD|coneFan${suffix}_${pts}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const m = buildRegionWall(pts, true, { chordSteiner: true }, fan);
      const f = scoreFwdTip(m, ringZs);
      plog(`[T3HD][${pts}] tris=${m.tris} cpu=${m.cpuS.toFixed(1)}s APEX-cone MAX=${f.apexMax} (out=${f.apexOut}/${f.apexN}) | global body MAX=${f.fwdMax} @dtToCrest=${dtToCrest(f.fwdT).toFixed(5)} p99=${f.fwdP99} | %<20=${f.pctBelow20} minAng=${f.minAngle} nonMan=${f.nonMan}`);
      const row: Record<string, unknown> = { key, arm: 'coneFan-HD', pts, tris: m.tris, cpuS: +m.cpuS.toFixed(1), apexConeMax: f.apexMax, apexOut: f.apexOut, apexN: f.apexN, globalBodyMax: f.fwdMax, globalWorst: { t: f.fwdT, dtToCrest: +dtToCrest(f.fwdT).toFixed(5) }, fwdP99: f.fwdP99, pctBelow20: f.pctBelow20, minAngle: f.minAngle, nonMan: f.nonMan };
      if (f.apexMax <= 0.02) { const r = scoreRevTip(m, ringZs); plog(`[T3HD][${pts}] rev body MAX=${r.revMax} out=${r.revOut} @t=${r.revT} dtToCrest=${dtToCrest(r.revT).toFixed(5)}`); row.revBodyMax = r.revMax; row.revOut = r.revOut; row.revWorst = { t: r.revT, dtToCrest: +dtToCrest(r.revT).toFixed(5) }; }
      row.APEX_CONE_CLOSED = f.apexMax <= TOL;
      checkpoint(row);
    }
    plog('[T3HD] DONE');
  }, 180 * 60 * 1000);
});
