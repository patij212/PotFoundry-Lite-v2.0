// _dsInteriorClose.test.ts — E-2026-07-13-DS-INTERIOR-CLOSE (PF_DSCLOSE=1 witness sweep / PF_DSCLOSE_COMP=1 composite).
//
// GOAL (user mandate): close the DragonScales BODY to the LITERAL 0.01 true-3D standard on the FIXED radius
// (rim floor() bug fixed, commit dde07ed3: row=min(floor(rowPhase),ceil(scaleRows)-1) in styles.ts+styles.wgsl).
//
// CONTEXT — the geometry is now CORRECTED. The prior θ-edge (E-DS-THETAEDGE) and flank-toe (E-DS-FLANKTOE) ON arms
// ran on the OLD buggy radius (717196 tris, witMax 0.847 = the misplaced rim vertex) → CONFOUNDED. Post-fix OFF
// baseline (E-DS-TRUE3D re-run, 682027 tris): composite body p99 0.014722 / max 0.091663, witness p99 0.015329 /
// max 0.097226, %<20° 2.5, nonMan 0. The residual is now cleanly the INTERIOR per-scale near-vertical flank walls
// (the scale-silhouette C1 creases at distFromCenter=1), NOT the rim.
//
// MECHANISM under test: (1) embed the per-scale feature-conforming EDGE (the scale-silhouette flank-toe contour
// dist=1, and/or the θ-tile-boundary valley lines scaleLocal=0) as constraintEdges so a mesh edge lies ON each C1
// crease → no facet chords ACROSS the crease apex; (2) add EDGE-LOCAL DENSITY (tighter hMin — curvature-driven, so
// it bites on the high-curvature flank band near the crease, not the green body) so the adjacent facets stop
// chording the CURVED near-vertical flank. Report the p99-vs-density curve: converge to 0.01, or asymptote (⇒ floor)?
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSES iff true-3D COMPOSITE body p99 ≤ 0.01 AND max ≤ ~0.05 AND %<20° ≤ ~3.5 AND nonMan 0, tris ≤ ~3M.
//   FLOORS-ABOVE-0.01 otherwise → prove WHY: report the witness/composite p99-vs-tris density curve. If it
//   ASYMPTOTES above 0.01 despite the edge being recovered (recovered≈requested) → genuine C0-relief floor; give the
//   floor + tri cost. If it keeps DESCENDING toward 0.01 → density-reducible; give the tri budget to reach 0.01.
//
// INSTRUMENT DISCIPLINE: WITNESS (perFaceTrue3DSag, ~9s, DS is a riser not a tangled lattice ⇒ single-seed GN honest)
// is the density-sweep instrument; it conservatively OVERSTATES the V11g COMPOSITE ruler (~4%: OFF wit 0.01533 vs
// comp 0.01472) so witness ≤ 0.0105 ⟹ composite ≤ 0.01. Composite (V11g certified, ~16 min/arm) confirms the winner.
//
// DEV-ONLY; research/ only; never edits src/. Reuses buildInhouseMetricMesh + _ds_prodtruth_lib (V11g ruler) +
// labkit READ-ONLY. Every arm is a separate keyExists-guarded checkpointed unit → a killed run RESUMES by re-running.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
  dumpHeatmap,
} from './labkit';
import type { InhouseMeshOpts } from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreBodyFacets, dsRadiusFn, radialBoundAt,
  DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';

// EXACT E-DS-TRUE3D OFF settings (fair A/B: ON arms add only the constraint graph and/or the hMin density lever).
const SIZE_RES = 192, HMAX_3D = 8, GRADE_BETA = 0.2;
const MAX_POINTS = 3_000_000;
const TOLMM = 0.01;
const SCALE_ROWS = 8, SCALES_PER_ROW = 16, OVERLAP = 0.5;
const TAU = 2 * Math.PI;

const OUT_DIR = join('research', 'exchange', '_dsInteriorClose');
const WIT = join(OUT_DIR, 'witness.ndjson');
const COMP = join(OUT_DIR, 'composite.ndjson');

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
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

// ───────────────────────── constraint graphs (verbatim from E-DS-THETAEDGE / E-DS-FLANKTOE) ─────────────────────────
/** θ-tile-boundary valley lines: vertical (in t) lines at scaleLocal=0 (u_edge = m/16 even row, (m−0.5)/16 odd),
 *  one disjoint line per (row band, valley), inset from the ring boundaries by insTmm. */
function buildThetaEdgeGraph(nTper: number, insTmm: number): { pts: number[]; edges: number[]; lines: number } {
  const pts: number[] = []; const edges: number[] = [];
  const insT = insTmm / DS_H;
  let lines = 0;
  for (let k = 0; k < SCALE_ROWS; k++) {
    const odd = (k % 2) === 1;
    const t0 = k / SCALE_ROWS + insT, t1 = (k + 1) / SCALE_ROWS - insT;
    for (let m = 0; m < SCALES_PER_ROW; m++) {
      let u = odd ? (m - 0.5) / SCALES_PER_ROW : m / SCALES_PER_ROW;
      u -= Math.floor(u);
      let prev = -1;
      for (let s = 0; s < nTper; s++) {
        const t = t0 + (t1 - t0) * (s / (nTper - 1));
        const pos = pts.length / 2; pts.push(u, t);
        if (prev >= 0) edges.push(prev, pos);
        prev = pos;
      }
      lines++;
    }
  }
  return { pts, edges, lines };
}

/** Per-scale FLANK-TOE contour (distFromCenter=1): two flank arcs u(rowLocal)=u_v ± (1−w)/32, w=√(1−yDist²),
 *  yDist=|rowLocal−0.5|/0.75, meeting at a shared mid-row node M per valley. Full band in t at the pot boundaries. */
function buildFlankToeGraph(nHalf: number, ringInsetMm: number, tEndEps: number): { pts: number[]; edges: number[]; arcs: number } {
  const pts: number[] = []; const edges: number[] = [];
  const insRL = (ringInsetMm / DS_H) * SCALE_ROWS;
  const endRL = (tEndEps / DS_H) * SCALE_ROWS;
  const uOf = (u: number): number => u - Math.floor(u);
  const wOf = (rl: number): number => {
    const yDist = Math.abs(rl - OVERLAP) / Math.max(1 - OVERLAP * 0.5, 0.1);
    return Math.sqrt(Math.max(0, 1 - yDist * yDist));
  };
  let arcs = 0;
  for (let k = 0; k < SCALE_ROWS; k++) {
    const s_k = (k % 2 === 1) ? 0.5 : 0;
    const loRL = (k === 0) ? endRL : insRL;
    const hiRL = (k === SCALE_ROWS - 1) ? (1 - endRL) : (1 - insRL);
    const lower: number[] = [], upper: number[] = [];
    for (let s = 0; s < nHalf; s++) {
      const fr = s / nHalf;
      lower.push(loRL + (0.5 - loRL) * fr);
      upper.push(0.5 + (hiRL - 0.5) * ((s + 1) / nHalf));
    }
    for (let mV = 0; mV < SCALES_PER_ROW; mV++) {
      const u_v = uOf((mV - s_k) / SCALES_PER_ROW);
      const tMid = (k + 0.5) / SCALE_ROWS;
      const Mpos = pts.length / 2; pts.push(u_v, tMid);
      for (const sign of [-1, 1] as const) {
        let prev = -1;
        const emit = (rl: number): number => {
          const w = wOf(rl);
          const u = uOf(u_v + sign * (1 - w) / 32);
          const t = (k + rl) / SCALE_ROWS;
          const pos = pts.length / 2; pts.push(u, t);
          if (prev >= 0) edges.push(prev, pos);
          prev = pos;
          return pos;
        };
        for (const rl of lower) emit(rl);
        if (prev >= 0) edges.push(prev, Mpos);
        prev = Mpos;
        for (const rl of upper) emit(rl);
        arcs++;
      }
    }
  }
  return { pts, edges, arcs };
}

/** Merge two constraint graphs (offset the second's edge indices by the first's vertex count). */
function mergeGraphs(a: { pts: number[]; edges: number[] }, b: { pts: number[]; edges: number[] }): { pts: number[]; edges: number[] } {
  const off = a.pts.length / 2;
  const pts = a.pts.concat(b.pts);
  const edges = a.edges.concat(b.edges.map((v) => v + off));
  return { pts, edges };
}

// ───────────────────────── arm definitions ─────────────────────────
interface Arm {
  key: string; hMin: number; graph?: { pts: number[]; edges: number[] }; note: string;
  chordTolMm?: number; chordSampleN?: number; chordSteiner?: boolean;
  fineStep?: number; subsamples?: number; sizeRes?: number;
}

function makeArms(): Arm[] {
  const theta = buildThetaEdgeGraph(24, 1.3);
  const toe = buildFlankToeGraph(16, 1.3, 0.04);
  const combo = mergeGraphs({ pts: theta.pts, edges: theta.edges }, { pts: toe.pts, edges: toe.edges });
  return [
    { key: 'OFF|h0.05', hMin: 0.05, note: 'baseline identity (expect wit~0.0153)' },
    // edge-mechanism screen at base density
    { key: 'theta|h0.05', hMin: 0.05, graph: { pts: theta.pts, edges: theta.edges }, note: 'θ-edge only' },
    { key: 'toe|h0.05', hMin: 0.05, graph: { pts: toe.pts, edges: toe.edges }, note: 'flank-toe only' },
    { key: 'combo|h0.05', hMin: 0.05, graph: combo, note: 'θ+toe combined' },
    // hMin sweep — INERT (curvature metric never requests sub-0.05mm on the flank; kept as the recorded no-op).
    { key: 'combo|h0.03', hMin: 0.03, graph: combo, note: 'combo + hMin 0.03' },
    { key: 'combo|h0.02', hMin: 0.02, graph: combo, note: 'combo + hMin 0.02' },
    { key: 'combo|h0.012', hMin: 0.012, graph: combo, note: 'combo + hMin 0.012' },
    { key: 'theta|h0.03', hMin: 0.03, graph: { pts: theta.pts, edges: theta.edges }, note: 'θ-edge + hMin 0.03' },
    { key: 'theta|h0.02', hMin: 0.02, graph: { pts: theta.pts, edges: theta.edges }, note: 'θ-edge + hMin 0.02' },
    // WORKING density levers — resolve the sub-cell bump curvature so density FOLLOWS the flank (the real p99 curve).
    // (A) finer sizing grid (sizeRes) so the curvature field resolves the bump → hMin bites.
    { key: 'combo|res384|h0.02', hMin: 0.02, sizeRes: 384, graph: combo, note: 'combo + sizeRes 384 + hMin 0.02' },
    { key: 'combo|res512|h0.012', hMin: 0.012, sizeRes: 512, graph: combo, note: 'combo + sizeRes 512 + hMin 0.012' },
    // (B) curvatureFineStep sub-cell-max curvature overlay.
    { key: 'combo|fine|h0.02', hMin: 0.02, fineStep: 0.0015, subsamples: 4, graph: combo, note: 'combo + curvatureFineStep 0.0015 + hMin 0.02' },
    // ≤3M confirming arm — coarser fineStep trims tris below 3M while holding p99≤0.01 (E-DS-INTERIOR-CLOSE follow-up).
    { key: 'combo|fine|s0.0022', hMin: 0.02, fineStep: 0.0022, subsamples: 4, graph: combo, note: 'combo + curvatureFineStep 0.0022 + hMin 0.02 (≤3M target)' },
    { key: 'combo|fine|h0.012', hMin: 0.012, fineStep: 0.0008, subsamples: 6, graph: combo, note: 'combo + curvatureFineStep 0.0008 + hMin 0.012' },
    // (C) direct chord guard — guarantees facet→surface chord < tol by splitting (sliver cost is the known trade).
    { key: 'combo|chord0.01', hMin: 0.03, chordTolMm: 0.01, chordSampleN: 8, graph: combo, note: 'combo + chordTolMm 0.01 (45-pt guard)' },
    { key: 'combo|chord0.006', hMin: 0.02, chordTolMm: 0.006, chordSampleN: 8, graph: combo, note: 'combo + chordTolMm 0.006 (45-pt guard)' },
  ];
}

function optsFor(arm: Arm): InhouseMeshOpts {
  const base: InhouseMeshOpts = {
    tolMm: TOLMM, hMin: arm.hMin, hMax: HMAX_3D, sizeRes: arm.sizeRes ?? SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints: MAX_POINTS, guardManifoldAlways: true,
  };
  if (arm.chordTolMm) base.chordTolMm = arm.chordTolMm;
  if (arm.chordSampleN) base.chordSampleN = arm.chordSampleN;
  if (arm.chordSteiner) base.chordSteiner = arm.chordSteiner;
  if (arm.fineStep) base.curvatureFineStep = arm.fineStep;
  if (arm.subsamples) base.curvatureSubsamples = arm.subsamples;
  if (arm.graph) {
    base.injectedPoints = arm.graph.pts;
    base.constraintEdges = arm.graph.edges;
    base.pinInjected = true;
    base.recoverySubdivideCollinear = true;
  }
  return base;
}

/** Build + witness (cheap). Returns the mesh+body handles so a caller can also run the composite without rebuilding. */
function buildAndWitness(arm: Arm): {
  tris: number; verts: number; row: Record<string, unknown>;
  xyz: Float64Array; idx: Uint32Array; bodyAll: number[]; rA: (t: number, z: number) => number;
} {
  const rA = dsRadiusFn(); const H = DS_H;
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, H, optsFor(arm));
  const idx = mesh.indices, ut = mesh.ut;
  const xyz = liftUtToRadial(ut, rA, H).vertices;
  const tris = idx.length / 3, verts = xyz.length / 3;
  const c = mesh.constraint;
  plog(`[${arm.key}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}${c ? ` constraint{req=${c.requested} present=${c.alreadyPresent} recovered=${c.recovered} failed=${c.failed} subdivSplits=${c.subdivSplits ?? 0}}` : ''}`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);
  const ringZs = dragonRings().map((r) => r.z);
  const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
  const bodyAll: number[] = [];
  for (let f = 0; f < tris; f++) if (cls(f) === 'body') bodyAll.push(f);

  // RADIAL screen (dense bary) — quick context
  const rDevs: number[] = []; let rWorst = 0;
  for (const f of bodyAll) {
    const a = idx[3 * f], bb = idx[3 * f + 1], cc = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * bb], by = xyz[3 * bb + 1], bz = xyz[3 * bb + 2];
    const cx = xyz[3 * cc], cy = xyz[3 * cc + 1], cz = xyz[3 * cc + 2];
    let dv = 0;
    for (const [wa, wb, wc] of DENSE) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const d = radialBoundAt(rA, px, py, pz); if (d > dv) dv = d;
    }
    rDevs.push(dv); if (dv > rWorst) rWorst = dv;
  }
  const rSorted = Float64Array.from(rDevs).sort();

  // WITNESS true-3D (perFaceTrue3DSag, GN honest for DS risers) on the body subset
  const tW = Date.now();
  const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
  const wDevs: number[] = []; let wWorst = 0, wOut = 0;
  for (const f of bodyAll) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > TOL) wOut++; }
  const wSorted = Float64Array.from(wDevs).sort();
  const witP99 = pct(wSorted, 0.99), witP995 = pct(wSorted, 0.995), witMax = +wWorst.toFixed(6);
  plog(`[${arm.key}][WITNESS] body p99=${witP99} p99.5=${witP995} max=${witMax} out=${wOut}/${bodyAll.length} in ${((Date.now() - tW) / 1000).toFixed(1)}s`);

  const row: Record<string, unknown> = {
    key: arm.key, note: arm.note, hMin: arm.hMin, tris, verts,
    rounds: mesh.rounds, hitBudget: mesh.hitBudget,
    constraint: c ?? null,
    pctBelow20: +q.pctBelow20.toFixed(2), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), nonMan,
    bodyFacets: bodyAll.length,
    radialP99: pct(rSorted, 0.99), radialMax: +rWorst.toFixed(6),
    witP99, witP995, witMax, witOut: wOut,
  };
  return { tris, verts, row, xyz, idx, bodyAll, rA };
}

describe('DS INTERIOR close — feature-conforming edge + edge-local density on the FIXED radius', () => {
  const arms = makeArms();

  for (const arm of arms) {
    it.skipIf(process.env.PF_DSCLOSE !== '1')(`WITNESS ${arm.key} — ${arm.note}`, () => {
      if (keyExists(WIT, arm.key)) { plog(`[skip witness] ${arm.key}`); return; }
      const { row } = buildAndWitness(arm);
      append(WIT, row);
    }, 6_000_000);
  }

  // Composite confirm — gated separately, runs only the arms named in PF_DSCLOSE_COMP_KEYS (comma-sep) or the winner.
  const compKeys = (process.env.PF_DSCLOSE_COMP_KEYS ?? 'OFF|h0.05,combo|h0.012').split(',').map((s) => s.trim()).filter(Boolean);
  for (const ck of compKeys) {
    const arm = arms.find((a) => a.key === ck);
    if (!arm) continue;
    it.skipIf(process.env.PF_DSCLOSE_COMP !== '1')(`COMPOSITE ${ck} — V11g certified ruler`, () => {
      if (keyExists(COMP, ck)) { plog(`[skip comp] ${ck}`); return; }
      const { row, xyz, idx, bodyAll, rA } = buildAndWitness(arm);
      const loc = buildConformRuler(rA);
      const tS = Date.now();
      const t3 = scoreBodyFacets(xyz as unknown as Float32Array, idx, bodyAll, loc, rA, TOL,
        (done, total) => { if (done % Math.max(1, Math.floor(total / 4)) === 0) plog(`  [${ck}][comp] ${done}/${total}`); });
      plog(`[${ck}][COMPOSITE] p50=${t3.p50} p90=${t3.p90} p99=${t3.p99} max=${t3.maxMm} out=${t3.outliers}/${bodyAll.length} greenProven=${t3.greenProvenFrac} in ${((Date.now() - tS) / 1000).toFixed(1)}s`);
      append(COMP, {
        ...row, t3P50: t3.p50, t3P90: t3.p90, t3P99: t3.p99, t3Max: t3.maxMm, t3Out: t3.outliers, t3GreenProvenFrac: t3.greenProvenFrac,
      });
    }, 6_000_000);
  }

  // VISUAL: true-3D heatmap bins for OFF vs the winner (combo+fine h0.02) — shows the steep-bump flank going green.
  it.skipIf(process.env.PF_DSCLOSE_RENDER !== '1')('RENDER — OFF vs combo+fine true-3D heatmap bins', () => {
    const rA = dsRadiusFn(); const H = DS_H;
    const off = arms.find((a) => a.key === 'OFF|h0.05')!;
    const win = arms.find((a) => a.key === 'combo|fine|h0.02')!;
    for (const [name, arm] of [['dsOFF', off], ['dsFINE', win]] as const) {
      const mesh = buildInhouseMetricMesh(rA, H, optsFor(arm));
      const xyz = liftUtToRadial(mesh.ut, rA, H).vertices;
      const sag = dumpHeatmap(OUT_DIR, name, xyz, mesh.ut, mesh.indices, rA, H, { scaleMm: 0.05, preFilterMm: 0.01, stl: false, meta: { arm: arm.key } });
      plog(`[RENDER ${name}] tris=${mesh.indices.length / 3} heatmap worst=${sag.worstMm.toFixed(4)} p99>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)}%`);
    }
  }, 6_000_000);
});
