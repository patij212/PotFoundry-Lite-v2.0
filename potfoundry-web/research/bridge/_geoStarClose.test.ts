// _geoStarClose.test.ts — E-2026-07-14-GEOSTAR-CLOSE (PF_GS=1 witness/locate sweep; PF_GS_RENDER=1 heatmap).
//
// GOAL (user mandate, PROD-TIERC): characterize + CLOSE the GeometricStar BODY to the LITERAL 0.01 true-3D
// standard, reusing the proven DragonScales playbook (M=g/h² region kernel `buildInhouseMetricMesh` + per-feature
// analytic constraintEdges + curvatureFineStep sub-cell sizing). Research-side ONLY: no src edit, no flag, no commit.
//
// GEOSTAR GEOMETRY (rOuterGeometricStar, defaults gsPoints8/gsGap0.05/gsDetail0.5/gsLayers4/gsInterlace1/gsRelief2/
// gsRoundness0/gsZoom1/gsShift0):
//   t → vRaw = t·layers·zoom = 4t; row = floor(4t); v = (4t−row−0.5)·2 ∈[−1,1] (v=0 at mid-row t=(k+0.5)/4).
//     vFade = 1−|v|^4 → 0 at v=±1 ⇒ relief PINCHES to 0 at every row boundary t=k/4 (k=1,2,3). shift=0 ⇒ NO row
//     stagger ⇒ NO DS-style floor() radius value cliff — the radius is CONTINUOUS at row boundaries (a C0 SLOPE
//     kink / V-valley, not a value step). rim t=1: relief=0.
//   θ → angle = TAU/N = π/4; sector = floor(θ/angle); a = (θ/angle−sector−0.5)·angle ∈[−π/8,π/8] (a=0 at sector
//     centre u=(s+0.5)/8). uvX = 2a; pX = |uvX| (FOLD → C0 crease at a=0, the star-point centre RIDGE, 8 t-running
//     lines); pY = v.
//   dLine = pX·nStarX + pY·nStarY (detail0.5 ⇒ starAngle π/4 ⇒ nStarX=nStarY=√½). dStrap = |dLine|−gap (|·| FOLD →
//     C0 crease at dLine=0, the STRAP DIAGONAL edges, lower half v<0). smoothstep over edge=0.02+roundness·0.2=0.02
//     (roundness0 ⇒ SHARP): shape = 1−smoothstep(dStrap/edge). r = r0 + shape·(1+weave·interlace·0.2)·relief·vFade.
//
// CANDIDATE C0/C1 feature classes to LOCATE (STEP 1) before building the fix:
//   (A) star-point centre RIDGE — a=0 vertical (t-running) lines u=(s+0.5)/8, 8 of them  [C0 fold, DS θ-edge analog]
//   (B) strap DIAGONAL edges — dLine=0 lines in lower half of each row                    [C0 fold, DS flank-toe analog]
//   (C) strap SMOOTHSTEP shoulders — |dLine|=gap and =gap+edge                             [C1, density-reducible bump]
//   (D) row-boundary V-VALLEYS — t=k/4 (relief pinch), u-running horizontal kink          [C0 slope, DS rim/riser analog]
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSES iff true-3D (perFaceTrue3DSag witness — GeoStar is a riser/revolution surface, NOT a tangled lattice ⇒
//   single-seed GN honest) BODY p99 ≤ 0.01 AND max ≤ ~0.05 AND %<20° ≤ ~3.5 AND nonMan 0, tris ≤ ~3M.
//   FLOORS-ABOVE-0.01 otherwise → prove WHY via the p99-vs-tris density curve: ASYMPTOTES above 0.01 despite the
//   feature edge being recovered ⇒ genuine C0-relief floor (name it + tri cost); keeps DESCENDING ⇒ density-reducible
//   (give the tri budget to 0.01). Radial reported ONLY as the artifact-comparison screen (overstates near-vertical).
//
// INSTRUMENT DISCIPLINE (cheatsheet): TRUE-3D perFaceTrue3DSag is the verdict; radial same-(θ,z) Δr is the screen
// (OVERSTATES near-vertical relief 2–27×). Slivers by minAngle (triangleQualityDistribution). Watertight by INDEX
// (auditNonManByIndex). Whole surface scored as BODY (no ring-band exclusion — GeoStar row boundaries are continuous
// C0 slope kinks, NOT value cliffs, so there is no separate riser-wall to exclude; every facet is a body facet).
//
// DEV-ONLY; research/ only; never edits src/. Reuses buildInhouseMetricMesh + buildRadiusFn + labkit READ-ONLY.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
  dumpHeatmap, buildRadiusFn, projectPointToRadialSurface, perFaceTrue3DSagAnchored, bruteNearestOnRadialSurface,
} from './labkit';
import type { InhouseMeshOpts, StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

// Standard pot dims (same as the DS prod-truth capture pinning: H120 / top_od 100 / bottom_od 80 / expn 1).
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TOL = 0.01;

// GeoStar default lattice constants (mirror DEFAULT_GEOMETRIC_STAR in src/geometry/types.ts).
const GS_POINTS = 8;      // N sectors
const GS_LAYERS = 4.0;    // vertical rows
const GS_ZOOM = 1.0;
const TAU = 2 * Math.PI;

// EXACT DS-INTERIOR-CLOSE certified base config (fair A/B: ON arms add only the graph and/or sizing levers).
const SIZE_RES = 192, HMAX_3D = 8, GRADE_BETA = 0.2;
const MAX_POINTS = 3_000_000;
const TOLMM = 0.01;

const OUT_DIR = join('research', 'exchange', '_geoStarClose');
const WIT = join(OUT_DIR, 'witness.ndjson');
const LOCI = join(OUT_DIR, 'worstLoci.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(file: string, k: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(file: string, row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(file, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row).slice(0, 400)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

const gsRadiusFn = (): ((theta: number, z: number) => number) => buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);

// ───────────────────────── analytic feature-edge graphs (derived from rOuterGeometricStar) ─────────────────────────
interface Graph { pts: number[]; edges: number[] }

/** (A) star-point centre RIDGE lines: a=0 ⇒ u=(s+0.5)/N, one vertical (t-running) line per sector, chained.
 *  Inset from the row boundaries t=k/L by insTmm so each disjoint segment lives inside one row band. */
function buildRidgeGraph(nTper: number, insTmm: number): Graph & { lines: number } {
  const pts: number[] = []; const edges: number[] = [];
  const insT = insTmm / H;
  const L = GS_LAYERS * GS_ZOOM; // rows in t
  let lines = 0;
  for (let k = 0; k < L; k++) {
    const t0 = k / L + insT, t1 = (k + 1) / L - insT;
    for (let s = 0; s < GS_POINTS; s++) {
      const u = (s + 0.5) / GS_POINTS;
      let prev = -1;
      for (let i = 0; i < nTper; i++) {
        const t = t0 + (t1 - t0) * (i / (nTper - 1));
        const pos = pts.length / 2; pts.push(u, t);
        if (prev >= 0) edges.push(prev, pos);
        prev = pos;
      }
      lines++;
    }
  }
  return { pts, edges, lines };
}

/** (D) row-boundary V-VALLEY lines: t=k/L (k=1..L−1), full-u horizontal (u-running) lines, chained, inset off the
 *  u seam by uEps. Each interior row boundary is a relief-pinch C0 slope valley. */
function buildRowValleyGraph(nUper: number, uEps: number): Graph & { lines: number } {
  const pts: number[] = []; const edges: number[] = [];
  const L = GS_LAYERS * GS_ZOOM;
  let lines = 0;
  for (let k = 1; k < L; k++) {
    const t = k / L;
    let prev = -1;
    for (let i = 0; i < nUper; i++) {
      const u = uEps + (1 - 2 * uEps) * (i / (nUper - 1));
      const pos = pts.length / 2; pts.push(u, t);
      if (prev >= 0) edges.push(prev, pos);
      prev = pos;
    }
    lines++;
  }
  return { pts, edges, lines };
}

/** (B) strap DIAGONAL edges: dLine=0 ⇒ pX=−pY·(nStarY/nStarX), lower half v<0. In (u,t): per sector the two
 *  diagonals a=±(−v)·(nStarY/nStarX)/2 (uvX=2a) emanating from (sector-centre, mid-row) toward the row-bottom
 *  corners. detail0.5 ⇒ nStarY/nStarX=1. Two arcs per (row,sector) meeting at the mid-row ridge node. */
function buildDiagGraph(nHalf: number, insTmm: number): Graph & { arcs: number } {
  const pts: number[] = []; const edges: number[] = [];
  const insT = insTmm / H;
  const L = GS_LAYERS * GS_ZOOM;
  const detail = 0.5;
  const starAngle = (0.2 + 0.6 * detail) * (Math.PI / 2);
  const ratio = Math.cos(starAngle) / Math.sin(starAngle); // nStarY/nStarX
  const uOf = (u: number): number => u - Math.floor(u);
  let arcs = 0;
  for (let k = 0; k < L; k++) {
    const tMid = (k + 0.5) / L;      // v=0
    const tBot = k / L + insT;       // toward v=−1 (row bottom), inset
    const uHalfSector = 0.5 / GS_POINTS; // half sector width in u (a from −π/8..π/8 ⇒ u spans 1/N)
    for (let s = 0; s < GS_POINTS; s++) {
      const uc = (s + 0.5) / GS_POINTS; // sector centre
      // v at t: v = (t·L − k − 0.5)·2 ; at tMid v=0, at tBot v=−1(+eps). |a| = (−v)·ratio/2, uvX=2a ⇒ a=uvX/2.
      // u offset from centre = a/(π/4) · (1/N)  … but simpler: uvX = 2a, and the full sector a∈[−π/8,π/8] maps to
      // u∈[uc−1/(2N), uc+1/(2N)]. uvX=2a ∈[−π/4,π/4]. So du = (a/(π/4))·(1/(2N))·2 = (a/(π/4))·(1/(2N)).
      // pX=|uvX|=|2a|; dLine=0 ⇒ pX=(−v)·ratio ⇒ |2a|=(−v)·ratio ⇒ |a|=(−v)·ratio/2. a∈[−π/8,π/8].
      for (const sign of [-1, 1] as const) {
        let prev = -1;
        for (let i = 0; i < nHalf; i++) {
          const fr = i / (nHalf - 1);
          const t = tMid + (tBot - tMid) * fr;    // mid-row → row-bottom
          const v = (t * L - k - 0.5) * 2;         // ∈(0,−1]
          let aAbs = (-v) * ratio / 2;             // radians in [0,π/8]
          aAbs = Math.min(aAbs, Math.PI / 8);
          const du = sign * (aAbs / (Math.PI / 4)) * (2 * uHalfSector); // map a→u offset (half-sector = uHalfSector at a=π/8)
          const u = uOf(uc + du);
          const pos = pts.length / 2; pts.push(u, t);
          if (prev >= 0) edges.push(prev, pos);
          prev = pos;
        }
        arcs++;
      }
    }
  }
  return { pts, edges, arcs };
}

/** (E) strap SILHOUETTE outline: the closed star contour |dLine|=C (C=gap+edge outer ramp base by default). Per
 *  (row,sector): an UPPER point (two edges meeting at the apex a=0,v=+C/nY — the star-point TIP where the fine-arm
 *  max lives) and a LOWER point (apex a=0,v=−C/nY), each edge running out to the sector boundary a=±π/8. Places a
 *  mesh edge ALONG the strap wall + a VERTEX AT the tip apex ⇒ no facet chords across the point. detail0.5 ⇒
 *  nStarX=nStarY=√½. a→u: u = uc + (a/(π/4))/N. */
function buildSilhouetteGraph(nPer: number, C: number, insTmm: number): Graph & { lines: number } {
  const pts: number[] = []; const edges: number[] = [];
  const insT = insTmm / H;
  const L = GS_LAYERS * GS_ZOOM;
  const detail = 0.5;
  const starAngle = (0.2 + 0.6 * detail) * (Math.PI / 2);
  const nX = Math.sin(starAngle), nY = Math.cos(starAngle);
  const aMax = Math.PI / 8;
  const uOf = (u: number): number => u - Math.floor(u);
  const vToT = (k: number, v: number): number => (v / 2 + k + 0.5) / L;
  let lines = 0;
  for (let k = 0; k < L; k++) {
    const tLo = k / L + insT, tHi = (k + 1) / L - insT;
    for (let s = 0; s < GS_POINTS; s++) {
      const uc = (s + 0.5) / GS_POINTS;
      // sign of dLine: +1 = upper point (apex v=+C/nY), −1 = lower point (apex v=−C/nY)
      for (const branch of [1, -1] as const) {
        const vApex = branch * C / nY;                     // apex v (a=0)
        const vBnd = (branch * C - 2 * nX * aMax) / nY;     // v where |a| hits the sector boundary
        // two edges (left a<0, right a>0) sharing the apex vertex
        const apexT = Math.max(tLo, Math.min(tHi, vToT(k, vApex)));
        const apexPos = pts.length / 2; pts.push(uc, apexT);
        for (const sign of [-1, 1] as const) {
          let prev = apexPos;
          for (let i = 1; i < nPer; i++) {
            const fr = i / (nPer - 1);
            const v = vApex + (vBnd - vApex) * fr;
            const aAbs = Math.abs(branch * C - v * nY) / (2 * nX);   // = |a|
            if (aAbs > aMax) break;                                  // reached the sector boundary — stop (no clamp tail)
            const a = sign * aAbs;
            const u = uOf(uc + (a / (Math.PI / 4)) / GS_POINTS);
            const t = vToT(k, v);
            if (t < tLo || t > tHi) break;
            const pos = pts.length / 2; pts.push(u, t);
            edges.push(prev, pos); prev = pos;
          }
        }
        lines++;
      }
    }
  }
  return { pts, edges, lines };
}

function mergeGraphs(a: Graph, b: Graph): Graph {
  const off = a.pts.length / 2;
  return { pts: a.pts.concat(b.pts), edges: a.edges.concat(b.edges.map((v) => v + off)) };
}

// ───────────────────────── arm definitions ─────────────────────────
interface Arm {
  key: string; hMin: number; graph?: Graph; note: string;
  fineStep?: number; subsamples?: number; sizeRes?: number; chordTolMm?: number; chordSampleN?: number; chordSteiner?: boolean;
}

function makeArms(): Arm[] {
  const ridge = buildRidgeGraph(28, 0.6);
  const valley = buildRowValleyGraph(384, 1e-3);
  const diag = buildDiagGraph(20, 0.3);
  const rv = mergeGraphs({ pts: ridge.pts, edges: ridge.edges }, { pts: valley.pts, edges: valley.edges });
  const rvd = mergeGraphs(rv, { pts: diag.pts, edges: diag.edges });
  // silhouette outline (the strap wall + tip apex) — the DS flank-toe analog on the right axis.
  const silO = buildSilhouetteGraph(18, 0.07, 0.6);   // outer ramp base |dLine|=gap+edge
  const silI = buildSilhouetteGraph(18, 0.05, 0.6);   // inner plateau edge |dLine|=gap
  const rs = mergeGraphs({ pts: ridge.pts, edges: ridge.edges }, { pts: silO.pts, edges: silO.edges });
  const rsi = mergeGraphs(rs, { pts: silI.pts, edges: silI.edges });   // doubled band-edge (inner+outer)
  const si = mergeGraphs({ pts: silO.pts, edges: silO.edges }, { pts: silI.pts, edges: silI.edges }); // no ridge (planar)
  return [
    { key: 'OFF|h0.05', hMin: 0.05, note: 'baseline identity + LOCATE' },
    // edge-mechanism screens at base density
    { key: 'ridge|h0.05', hMin: 0.05, graph: { pts: ridge.pts, edges: ridge.edges }, note: 'star-point ridge only' },
    { key: 'valley|h0.05', hMin: 0.05, graph: { pts: valley.pts, edges: valley.edges }, note: 'row-valley only' },
    { key: 'rv|h0.05', hMin: 0.05, graph: rv, note: 'ridge+row-valley' },
    { key: 'rvd|h0.05', hMin: 0.05, graph: rvd, note: 'ridge+valley+diag' },
    // WORKING density lever: curvatureFineStep sub-cell curvature so density FOLLOWS the sharp strap/fold.
    { key: 'rvd|fine0.0022|h0.02', hMin: 0.02, fineStep: 0.0022, subsamples: 4, graph: rvd, note: 'rvd + curvatureFineStep 0.0022' },
    { key: 'rvd|fine0.0015|h0.02', hMin: 0.02, fineStep: 0.0015, subsamples: 4, graph: rvd, note: 'rvd + curvatureFineStep 0.0015' },
    { key: 'rvd|fine0.0008|h0.012', hMin: 0.012, fineStep: 0.0008, subsamples: 6, graph: rvd, note: 'rvd + curvatureFineStep 0.0008 (dense confirm)' },
    // direct chord guard fallback (sliver cost is the known trade) if fold folds refuse to converge
    { key: 'rvd|chord0.008', hMin: 0.02, chordTolMm: 0.008, chordSampleN: 8, graph: rvd, note: 'rvd + chordTolMm 0.008 (45-pt guard)' },
    // SILHOUETTE outline arms — the strap wall + tip apex (the fine-arm max locus)
    { key: 'rs|h0.05', hMin: 0.05, graph: rs, note: 'ridge + outer-silhouette (base density)' },
    { key: 'rsi|h0.05', hMin: 0.05, graph: rsi, note: 'ridge + doubled silhouette (base density)' },
    { key: 'rs|fine0.0015|h0.02', hMin: 0.02, fineStep: 0.0015, subsamples: 4, graph: rs, note: 'ridge+outer-silhouette + fineStep 0.0015' },
    { key: 'rsi|fine0.0015|h0.02', hMin: 0.02, fineStep: 0.0015, subsamples: 4, graph: rsi, note: 'ridge+doubled-silhouette + fineStep 0.0015' },
    { key: 'rsi|fine0.0022|h0.02', hMin: 0.02, fineStep: 0.0022, subsamples: 4, graph: rsi, note: 'ridge+doubled-silhouette + fineStep 0.0022 (≤3M target)' },
    // silhouette-ONLY (planar, no ridge×apex crossing → clean recovery)
    { key: 'si|h0.05', hMin: 0.05, graph: si, note: 'doubled-silhouette only (base density)' },
    { key: 'si|fine0.0015|h0.02', hMin: 0.02, fineStep: 0.0015, subsamples: 4, graph: si, note: 'doubled-silhouette only + fineStep 0.0015' },
    { key: 'si|fine0.0008|h0.012', hMin: 0.012, fineStep: 0.0008, subsamples: 6, graph: si, note: 'doubled-silhouette only + fineStep 0.0008 (dense confirm)' },
    { key: 'rsi|fine0.0008|h0.012', hMin: 0.012, fineStep: 0.0008, subsamples: 6, graph: rsi, note: 'ridge+doubled-silhouette + fineStep 0.0008 (dense CLOSE)' },
    // chordSteiner = interior-apex closer: places a Steiner point AT the worst-sag point (the star-tip cusp) that an
    // edge-split can never converge onto. The direct perpendicular-MAX-gate mechanism (chordSag ≥ perp ⇒ guarantees
    // perp ≤ tol by construction IF it converges).
    { key: 'rsi|chordS0.008', hMin: 0.03, chordTolMm: 0.008, chordSampleN: 8, chordSteiner: true, graph: rsi, note: 'rsi + chordTolMm 0.008 + chordSteiner (45-pt)' },
    { key: 'rsi|chordS0.004', hMin: 0.02, chordTolMm: 0.004, chordSampleN: 10, chordSteiner: true, graph: rsi, note: 'rsi + chordTolMm 0.004 + chordSteiner (66-pt)' },
  ];
}

function optsFor(arm: Arm): InhouseMeshOpts {
  const base: InhouseMeshOpts = {
    tolMm: TOLMM, hMin: arm.hMin, hMax: HMAX_3D, sizeRes: arm.sizeRes ?? SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints: MAX_POINTS, guardManifoldAlways: true,
  };
  if (arm.fineStep) base.curvatureFineStep = arm.fineStep;
  if (arm.subsamples) base.curvatureSubsamples = arm.subsamples;
  if (arm.chordTolMm) base.chordTolMm = arm.chordTolMm;
  if (arm.chordSampleN) base.chordSampleN = arm.chordSampleN;
  if (arm.chordSteiner) base.chordSteiner = arm.chordSteiner;
  if (arm.graph) {
    base.injectedPoints = arm.graph.pts;
    base.constraintEdges = arm.graph.edges;
    base.pinInjected = true;
    base.recoverySubdivideCollinear = true;
  }
  return base;
}

// Classify a facet centroid (u,t) against the candidate feature classes (for the LOCATE dump).
function classifyLoci(u: number, t: number): Record<string, number> {
  const L = GS_LAYERS * GS_ZOOM;
  const vRaw = t * L; const row = Math.floor(Math.min(vRaw, L - 1e-9));
  const v = (vRaw - row - 0.5) * 2;
  // dist (in t) to nearest interior row boundary k/L, k=1..L−1
  let dRow = 1;
  for (let k = 1; k < L; k++) { const d = Math.abs(t - k / L); if (d < dRow) dRow = d; }
  // dist (in u) to nearest sector centre (s+0.5)/N (the ridge) and sector boundary s/N
  let dCtr = 1, dBnd = 1;
  for (let s = 0; s <= GS_POINTS; s++) {
    const dc = Math.abs(u - (s + 0.5) / GS_POINTS); if (dc < dCtr) dCtr = dc;
    const db = Math.abs(u - s / GS_POINTS); if (db < dBnd) dBnd = db;
  }
  return {
    v: +v.toFixed(4), dRowT: +dRow.toFixed(5), dCtrU: +dCtr.toFixed(5), dBndU: +dBnd.toFixed(5),
  };
}

function radialDev(rA: (th: number, z: number) => number, px: number, py: number, pz: number): number {
  const th = Math.atan2(py, px); const r = Math.hypot(px, py);
  return Math.abs(r - rA(th < 0 ? th + TAU : th, pz));
}

function buildAndWitness(arm: Arm, dumpLoci: boolean): { row: Record<string, unknown>; xyz: Float64Array; ut: number[]; idx: Uint32Array; rA: (t: number, z: number) => number } {
  const rA = gsRadiusFn();
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, H, optsFor(arm));
  const idx = mesh.indices, ut = mesh.ut;
  const xyz = liftUtToRadial(ut, rA, H).vertices;
  const tris = idx.length / 3, verts = xyz.length / 3;
  const c = mesh.constraint;
  plog(`[${arm.key}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}${c ? ` constraint{req=${c.requested} present=${c.alreadyPresent} recovered=${c.recovered} failed=${c.failed} subdivSplits=${c.subdivSplits ?? 0}}` : ''}`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  // WITNESS true-3D (perFaceTrue3DSag) over ALL facets (GeoStar riser/revolution ⇒ GN honest).
  const tW = Date.now();
  const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.006 });
  const wDevs: number[] = []; let wWorst = 0, wOut = 0;
  const faceErr = sag.faceErr;
  for (let f = 0; f < tris; f++) { const e = faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > TOL) wOut++; }
  const wSorted = Float64Array.from(wDevs).sort();
  const witP99 = pct(wSorted, 0.99), witP995 = pct(wSorted, 0.995), witP999 = pct(wSorted, 0.999), witMax = +wWorst.toFixed(6);
  plog(`[${arm.key}][WITNESS] body p99=${witP99} p99.5=${witP995} p99.9=${witP999} max=${witMax} out=${wOut}/${tris} in ${((Date.now() - tW) / 1000).toFixed(1)}s`);

  // RADIAL screen at centroids (artifact comparison) — top of the true-3D tail
  const rDevs: number[] = []; let rWorst = 0;
  for (let f = 0; f < tris; f++) {
    const a = idx[3 * f], bb = idx[3 * f + 1], cc = idx[3 * f + 2];
    const cx = (xyz[3 * a] + xyz[3 * bb] + xyz[3 * cc]) / 3;
    const cy = (xyz[3 * a + 1] + xyz[3 * bb + 1] + xyz[3 * cc + 1]) / 3;
    const cz = (xyz[3 * a + 2] + xyz[3 * bb + 2] + xyz[3 * cc + 2]) / 3;
    const d = radialDev(rA, cx, cy, cz); rDevs.push(d); if (d > rWorst) rWorst = d;
  }
  const rSorted = Float64Array.from(rDevs).sort();

  // LOCATE: dump the top-200 worst true-3D facets with centroid (u,t) + classifiers
  if (dumpLoci) {
    const order = Array.from({ length: tris }, (_, f) => f).sort((x, y) => faceErr[y] - faceErr[x]);
    const topK = order.slice(0, 200);
    let cnt = { ridge: 0, rowValley: 0, diag: 0, other: 0 };
    for (const f of topK) {
      const a = idx[3 * f], bb = idx[3 * f + 1], cc = idx[3 * f + 2];
      const cu = (ut[2 * a] + ut[2 * bb] + ut[2 * cc]) / 3;
      const ct = (ut[2 * a + 1] + ut[2 * bb + 1] + ut[2 * cc + 1]) / 3;
      const cls = classifyLoci(cu, ct);
      // crude class tally (u,t nearness): row-valley if dRowT small; ridge if dCtrU small; else diag/other
      let klass = 'other';
      if ((cls.dRowT as number) < 0.01) klass = 'rowValley';
      else if ((cls.dCtrU as number) < 0.01) klass = 'ridge';
      else if ((cls.dBndU as number) < 0.02) klass = 'diag';
      cnt[klass as keyof typeof cnt]++;
      append(LOCI, { key: `${arm.key}#${f}`, arm: arm.key, err: +faceErr[f].toFixed(5), u: +cu.toFixed(5), t: +ct.toFixed(5), ...cls, klass });
    }
    plog(`[${arm.key}][LOCATE] top200 class tally: ridge=${cnt.ridge} rowValley=${cnt.rowValley} diag=${cnt.diag} other=${cnt.other}`);
  }

  const row: Record<string, unknown> = {
    key: arm.key, note: arm.note, hMin: arm.hMin, tris, verts,
    rounds: mesh.rounds, hitBudget: mesh.hitBudget, constraint: c ?? null,
    pctBelow20: +q.pctBelow20.toFixed(2), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), nonMan,
    radialP99: pct(rSorted, 0.99), radialP999: pct(rSorted, 0.999), radialMax: +rWorst.toFixed(6),
    witP99, witP995, witP999, witMax, witOut: wOut,
  };
  return { row, xyz, ut, idx, rA };
}

describe('GEOSTAR close — locate + feature-conforming edge + curvatureFineStep on the M-kernel', () => {
  const arms = makeArms();
  for (const arm of arms) {
    it.skipIf(process.env.PF_GS !== '1')(`WITNESS ${arm.key} — ${arm.note}`, () => {
      if (keyExists(WIT, arm.key)) { plog(`[skip witness] ${arm.key}`); return; }
      const { row } = buildAndWitness(arm, arm.key === 'OFF|h0.05');
      append(WIT, row);
    }, 6_000_000);
  }

  // Standalone LOCATE on any named arm (rebuilds it; NOT guarded by WIT) — for the fine-arm max-residual chase.
  it.skipIf(process.env.PF_GS_LOCATE === undefined)(`LOCATE ${process.env.PF_GS_LOCATE ?? ''}`, () => {
    const arm = arms.find((a) => a.key === process.env.PF_GS_LOCATE);
    if (!arm) { plog(`[LOCATE] no arm ${process.env.PF_GS_LOCATE}`); return; }
    buildAndWitness(arm, true);
  }, 6_000_000);

  // TRUSTED continuous perpendicular MAX (Hausdorff gate). Single-seed GN (perFaceTrue3DSag) OVERSTATES steep
  // star-tip cusps (cheatsheet steep-GN caveat). This unit reports THREE numbers on PF_GS_DMAX arm:
  //   (1) GN 4-pt max (perFaceTrue3DSag) — the OVERSTATED screen.
  //   (2) BRUTE-anchored trusted 4-pt max (perFaceTrue3DSagAnchored, full-azimuth brute nearest, corrects GN).
  //   (3) DENSE continuous trusted max: top-K facets dense-sampled (denseN), each sample = min(GN, same-(u,t) UB,
  //       coarse-brute-if-suspect) → captures the between-sample peak the 4-pt ruler misses. THE gate number.
  it.skipIf(process.env.PF_GS_DMAX === undefined)(`TRUSTEDMAX ${process.env.PF_GS_DMAX ?? ''}`, () => {
    const arm = arms.find((a) => a.key === process.env.PF_GS_DMAX);
    if (!arm) { plog(`[TRUSTEDMAX] no arm ${process.env.PF_GS_DMAX}`); return; }
    const rA = gsRadiusFn();
    const mesh = buildInhouseMetricMesh(rA, H, optsFor(arm));
    const idx = mesh.indices, ut = mesh.ut; const tris = idx.length / 3;
    plog(`[TRUSTEDMAX ${arm.key}] meshed ${tris} tris`);
    const gnSag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.006 });
    const anc = perFaceTrue3DSagAnchored(ut, idx, rA, H, { preFilterMm: 0.006, redMm: 0.03, topK: 2000 });
    // DENSE continuous trusted on the anchored top facets
    const K = Number(process.env.PF_GS_DMAX_K ?? 1000);
    const N = Number(process.env.PF_GS_DMAX_N ?? 8);
    const order = Array.from({ length: tris }, (_, f) => f).sort((x, y) => anc.faceErr[y] - anc.faceErr[x]).slice(0, K);
    const BARY: [number, number, number][] = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j + i <= N; j++) BARY.push([i / N, j / N, (N - i - j) / N]);
    const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    let contMax = 0; const worst: { err: number; u: number; t: number }[] = [];
    for (const f of order) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
      const A = lift(ua, ta), B = lift(ub, tb), Cc = lift(uc, tc);
      // pass A: dense min(same-(u,t) UB, GN) → find the worst sample (position) cheaply
      let sMax = 0, sx = 0, sy = 0, sz = 0, su = 0, st = 0;
      for (const [wa, wb, wc] of BARY) {
        const fx = wa * A[0] + wb * B[0] + wc * Cc[0], fy = wa * A[1] + wb * B[1] + wc * Cc[1], fz = wa * A[2] + wb * B[2] + wc * Cc[2];
        const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
        const S = lift(um, tm);
        const ub3 = Math.hypot(S[0] - fx, S[1] - fy, S[2] - fz);          // same-(u,t) full-3D = rigorous UPPER bound
        const gn = projectPointToRadialSurface(fx, fy, fz, rA).dist;
        const d = Math.min(ub3, gn);
        if (d > sMax) { sMax = d; sx = fx; sy = fy; sz = fz; su = um; st = tm; }
      }
      // pass B: brute the SINGLE worst sample (full-azimuth nearest) — corrects GN wrong-local-minimum
      let fMax = sMax;
      if (sMax > 0.01) fMax = Math.min(sMax, bruteNearestOnRadialSurface(sx, sy, sz, rA, H, { nTheta: 4096, nZ: 1024 }).dist);
      if (fMax > contMax) contMax = fMax;
      worst.push({ err: +fMax.toFixed(5), u: +(su - Math.floor(su)).toFixed(5), t: +st.toFixed(5) });
    }
    worst.sort((x, y) => y.err - x.err);
    const nOver = worst.filter((w) => w.err > 0.01).length;
    const dm = { key: `TMAX:${arm.key}`, arm: arm.key, tris, K, denseN: N, gnMax: +gnSag.worstMm.toFixed(5), bruteAnchored4ptMax: +anc.worstMm.toFixed(5), denseTrustedContinuousMax: +contMax.toFixed(5), nOver0p01_inTopK: nOver, top10: worst.slice(0, 10) };
    append(join(OUT_DIR, 'trustedMax.ndjson'), dm);
    plog(`[TRUSTEDMAX ${arm.key}] gnMax=${gnSag.worstMm.toFixed(5)} bruteAnchored4pt=${anc.worstMm.toFixed(5)} DENSE-TRUSTED-CONT-MAX=${contMax.toFixed(5)} (>${0.01}: ${nOver}/${K}) worst@ u=${worst[0].u} t=${worst[0].t}`);
  }, 6_000_000);

  it.skipIf(process.env.PF_GS_RENDER !== '1')('RENDER — OFF vs winner true-3D heatmap bins', () => {
    const off = arms.find((a) => a.key === 'OFF|h0.05')!;
    const winKey = process.env.PF_GS_WIN ?? 'rvd|fine0.0015|h0.02';
    const win = arms.find((a) => a.key === winKey)!;
    const rA = gsRadiusFn();
    for (const [name, arm] of [['gsOFF', off], ['gsWIN', win]] as const) {
      const mesh = buildInhouseMetricMesh(rA, H, optsFor(arm));
      const xyz = liftUtToRadial(mesh.ut, rA, H).vertices;
      const sag = dumpHeatmap(OUT_DIR, name, xyz, mesh.ut, mesh.indices, rA, H, { scaleMm: 0.05, preFilterMm: 0.006, stl: false, meta: { arm: arm.key } });
      plog(`[RENDER ${name}] tris=${mesh.indices.length / 3} heatmap worst=${sag.worstMm.toFixed(4)} p99>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)}%`);
    }
  }, 6_000_000);
});
