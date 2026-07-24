// _strataVoronoiConform.test.ts — STRATA-001: Voronoi through the M=g/h² CDT region kernel with the order-1
// bisector graph injected as constraint edges. The reference-tessellator path (spec §4 chords) CONVERGES but needs
// ~64x over the triangle cap because it cannot fan degree-3 junctions (E-2026-07-24-STRATA001-S2-CONVERGENCE). The
// production feature-conforming CDT (buildInhouseMetricMesh) CAN fan junctions (chordSteiner) and spends triangles
// only where the metric demands — the proven 0.01mm-on-cliffs lever (dsFeatureEdges → DS p99 0.009).
//
// A/B, one lever = the graph, exactly the _dsInteriorClose / _geoStarConform recipe:
//   plain   : M=g/h² sizing only (baseline)
//   conform : + injectedPoints = graph.pts, constraintEdges = graph.edges, pinInjected, recoverySubdivideCollinear
//
// PLUS an ALIGNMENT SELF-CHECK: the graph is derived from the certification TARGET's lattice, but the mesher uses the
// CPU radius fn (STYLE_FUNCTIONS) — a KNOWN desync risk (project_voronoi_hash_desync, "4 copies"). The check samples
// rA perpendicular to graph edges and confirms a kink is actually THERE (vs random control points); a misaligned
// graph would show no kink and conforming would be a no-op. DEV-ONLY; research/ only; never edits src/.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh,
  buildRadiusFn,
  liftUtToRadial,
  triangleQualityDistribution,
  auditNonManByIndex,
  perFaceTrue3DSag,
} from './labkit';
import type { InhouseMeshOpts, StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildVoronoiConformingGraph, DEFAULT_VORONOI_LATTICE } from './voronoiFeatureEdges';
import { voronoiBisectorSegmentsUv } from '../../src/geometry/targetSolid/voronoiBisectorGuides';

const RUN = process.env.PF_STRATA_VCONFORM === '1';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const BASE: InhouseMeshOpts = {
  tolMm: 0.01,
  hMin: 0.02,
  hMax: 8,
  sizeRes: 256,
  gradeBeta: 0.2,
  maxPoints: 800_000,
  guardManifoldAlways: true,
  chordTolMm: 0.01,
  chordSteiner: true,
  chordSampleN: 8,
};
// Voronoi registry defaults: web mode (v_morph 1), full relief 2.0 mm.
const VPARAMS = { v_morph: 1, v_relief: 2.0, v_scale: 8, v_jitter: 0.8, v_z_stretch: 1 } as const;

const OUT_DIR = join('research', 'exchange', '_strataVoronoiConform');
const NDJSON = join(OUT_DIR, 'scorecard.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8')
    .split('\n')
    .filter(Boolean)
    .some((l) => {
      try {
        return (JSON.parse(l) as { key?: string }).key === k;
      } catch {
        return false;
      }
    });
}
function append(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

/**
 * Alignment self-check: at N graph-edge midpoints, the perpendicular SECOND difference of rA
 * |rA(+εn) + rA(−εn) − 2·rA(0)| detects a crease (a kink makes it scale like ε, ≫ the ε² of a smooth point).
 * Compared against random control points, an aligned graph shows a much larger median.
 */
function alignmentCheck(
  rA: (theta: number, z: number) => number,
  graph: { pts: number[]; edges: number[] }
): { edgeMedian: number; controlMedian: number; ratio: number; sampled: number } {
  const eps = 1e-3;
  const secondDiff = (u: number, t: number, nu: number, nt: number): number => {
    const theta = 2 * Math.PI * u;
    const r0 = rA(theta, t * H);
    const rp = rA(2 * Math.PI * (u + eps * nu), (t + eps * nt) * H);
    const rm = rA(2 * Math.PI * (u - eps * nu), (t - eps * nt) * H);
    return Math.abs(rp + rm - 2 * r0);
  };
  const edgeVals: number[] = [];
  const step = Math.max(1, Math.floor(graph.edges.length / 2 / 400));
  for (let e = 0; e < graph.edges.length; e += 2 * step) {
    const a = graph.edges[e];
    const b = graph.edges[e + 1];
    const ua = graph.pts[a * 2];
    const ta = graph.pts[a * 2 + 1];
    const ub = graph.pts[b * 2];
    const tb = graph.pts[b * 2 + 1];
    const du = ub - ua;
    const dt = tb - ta;
    const len = Math.hypot(du, dt);
    if (len < 1e-9) continue;
    const nu = -dt / len;
    const nt = du / len;
    edgeVals.push(secondDiff((ua + ub) / 2, (ta + tb) / 2, nu, nt));
  }
  // Deterministic pseudo-random control points (no Math.random — vary by index).
  const controlVals: number[] = [];
  for (let i = 0; i < 400; i += 1) {
    const u = ((i * 0.61803398875) % 1 + 1) % 1;
    const t = ((i * 0.31830988618) % 1 + 1) % 1;
    controlVals.push(secondDiff(u, t, 1, 0));
  }
  const median = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const edgeMedian = median(edgeVals);
  const controlMedian = median(controlVals);
  return {
    edgeMedian,
    controlMedian,
    ratio: controlMedian > 1e-12 ? edgeMedian / controlMedian : Infinity,
    sampled: edgeVals.length,
  };
}

interface Arm {
  key: string;
  conform: boolean;
  note: string;
  maxPoints?: number;
  robust?: boolean;
  segLen?: number;
  /** Inject the graph vertices as PINNED seed points but NO constraint edges — the Delaunay triangulates around
   *  them (junctions become natural degree-k vertices) with zero constraint recovery to fail. */
  pointsOnly?: boolean;
  /** OPT-IN anisotropic (II,I) crease-aligned metric + metric-in-circle Delaunay — sizes fine ACROSS the steep
   *  relief groove flank, long ALONG it; auto-detects the flank from curvature (no graph, no recovery). */
  aniso?: boolean;
}
const ARMS: Arm[] = [
  // conform FIRST: its alignment self-check prints before the (slow) mesh, so a target/CPU desync is caught early.
  { key: 'conform', conform: true, note: 'order-1 bisector graph injected (pts+edges+pin+subdivColinear) — junctions welded degree-3' },
  { key: 'plain', conform: false, note: 'M=g/h² sizing + chord-Steiner guard, no graph (baseline)' },
  // Budget sweep on the CLEAN path: plain sizing is budget-limited (hitBudget), p99 near 0.01 — does more close MAX?
  // (2M+ points OOMs the 12GB heap during true-3D scoring; 1.4M ≈ 2.8M tris is the safe probe.)
  { key: 'plain-1p4m', conform: false, maxPoints: 1_400_000, note: 'plain sizing @ 1.4M points (budget sweep)' },
  // Salvage the graph: robust recovery + coarser edges (the GeoStar mitigation for 57% recovery failure).
  { key: 'conform-robust', conform: true, robust: true, segLen: 0.02, note: 'coarser graph (segLen 0.02) + recoveryRobust + guardRecoveryManifold' },
  // NO-RECOVERY path: inject the bisector+junction vertices as PINNED seed points, no constraint edges — sidesteps
  // the recovery wall entirely; the Delaunay fans junctions naturally + chord-Steiner splits the crease tail.
  { key: 'points-only', conform: true, pointsOnly: true, segLen: 0.006, note: 'dense bisector+junction points as pinned seeds, NO constraint edges (no recovery)' },
  // ANISOTROPIC sizing: fine across the groove flank, long along it (auto from curvature, no graph/recovery). The
  // cheapest path that could actually close Voronoi within the existing kernel.
  { key: 'plain-aniso', conform: false, aniso: true, note: 'M=g/h² + ANISO crease-aligned metric + chord-Steiner, no graph' },
];

describe('STRATA-001 Voronoi via M=g/h² CDT + bisector constraint edges', () => {
  for (const arm of ARMS) {
    it.runIf(RUN)(
      `${arm.key} — ${arm.note}`,
      () => {
        if (keyExists(arm.key)) {
          plog(`[skip] ${arm.key} already recorded`);
          return;
        }
        mkdirSync(OUT_DIR, { recursive: true });
        const rA = buildRadiusFn('Voronoi' as StyleId, VPARAMS, DIMS);
        const opts: InhouseMeshOpts = { ...BASE };
        if (arm.maxPoints !== undefined) opts.maxPoints = arm.maxPoints;
        if (arm.aniso) opts.aniso = true;
        let graphPts = 0;
        let graphEdges = 0;
        let align: ReturnType<typeof alignmentCheck> | null = null;
        if (arm.conform) {
          const g = buildVoronoiConformingGraph(arm.segLen !== undefined ? { segLen: arm.segLen } : {});
          opts.injectedPoints = g.pts;
          opts.pinInjected = true;
          if (arm.pointsOnly) {
            // No constraintEdges / recovery: seed points only.
          } else {
            opts.constraintEdges = g.edges;
            opts.recoverySubdivideCollinear = true;
            if (arm.robust) {
              opts.recoveryRobust = true;
              opts.guardRecoveryManifold = true;
            }
          }
          graphPts = g.pts.length / 2;
          graphEdges = g.edges.length / 2;
          align = alignmentCheck(rA, g);
          plog(
            `[${arm.key}][ALIGN] edge2ndDiff=${align.edgeMedian.toExponential(3)} control=${align.controlMedian.toExponential(3)} ratio=${align.ratio.toFixed(1)} (>>1 ⇒ graph lies on real creases) sampled=${align.sampled}`
          );
        }

        const t0 = Date.now();
        const mesh = buildInhouseMetricMesh(rA, H, opts);
        const ut = mesh.ut;
        const idx = mesh.indices;
        const xyz = liftUtToRadial(ut, rA, H).vertices;
        const tris = idx.length / 3;
        const verts = xyz.length / 3;
        const c = mesh.constraint;
        plog(
          `[${arm.key}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}${c ? ` constraint{req=${c.requested} recovered=${c.recovered} failed=${c.failed} subdivSplits=${c.subdivSplits ?? 0}}` : ''}`
        );

        const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
        const nonMan = auditNonManByIndex(xyz, idx);

        const tT = Date.now();
        const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
        const feSorted = Float64Array.from(sag.faceErr).sort();
        const true3dMax = +sag.worstMm.toFixed(6);
        const true3dP99 = pct(feSorted, 0.99);
        const true3dP999 = pct(feSorted, 0.999);
        const true3dP50 = pct(feSorted, 0.5);
        const over01 = +sag.fracOver(0.01).toFixed(6);
        plog(
          `[${arm.key}][TRUE3D] max=${true3dMax} p99.9=${true3dP999} p99=${true3dP99} p50=${true3dP50} over0.01=${over01} in ${((Date.now() - tT) / 1000).toFixed(1)}s`
        );

        // STRUCTURED-MESHER DECISION PROBE: split the per-face true-3D error by whether the face centroid sits in a
        // crease/junction BAND (within `band` of a bisector) or in a cell INTERIOR. A structured cell-mesher conforms
        // the crease/junction band BY CONSTRUCTION (bisectors = shared cell edges, junctions = shared vertices), so if
        // interior faces are already ≤ 0.01 the structured path reaches 0.01mm overall.
        const segs = voronoiBisectorSegmentsUv(DEFAULT_VORONOI_LATTICE);
        const distToGraphUt = (u: number, t: number): number => {
          let best = Infinity;
          for (const s of segs) {
            const dx = s.b[0] - s.a[0];
            const dy = s.b[1] - s.a[1];
            const l2 = dx * dx + dy * dy;
            let tt = l2 > 1e-18 ? ((u - s.a[0]) * dx + (t - s.a[1]) * dy) / l2 : 0;
            tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
            const d = Math.hypot(u - (s.a[0] + tt * dx), t - (s.a[1] + tt * dy));
            if (d < best) best = d;
          }
          return best;
        };
        // For each face: its true-3D error AND its centroid distance to the exact bisector graph (in u units;
        // 1 lattice cell = 1/scale = 0.125). The structured-mesher decision hinges on two questions:
        //   (1) Are the OVER-TOLERANCE faces concentrated near creases? (fraction within k cells)
        //   (2) How clean is the FAR interior — max error of faces > k cells from any crease?
        // A structured cell-mesher conforms the crease/junction band by construction, so if the far-interior max is
        // ≤ 0.01 the structured mesh reaches 0.01mm; the residual would then be purely the (conformed-away) band.
        const cell = 1 / DEFAULT_VORONOI_LATTICE.scale;
        const faceErr = sag.faceErr;
        const overIdx: number[] = [];
        const dists = new Float64Array(faceErr.length);
        for (let f = 0; f < faceErr.length; f += 1) {
          const a = idx[f * 3];
          const b = idx[f * 3 + 1];
          const c = idx[f * 3 + 2];
          const cu = (ut[a * 2] + ut[b * 2] + ut[c * 2]) / 3;
          const ctt = (ut[a * 2 + 1] + ut[b * 2 + 1] + ut[c * 2 + 1]) / 3;
          dists[f] = distToGraphUt(cu, ctt) / cell; // in lattice-cell units
          if (faceErr[f] > 0.01) overIdx.push(f);
        }
        const bands = [0.05, 0.1, 0.25, 0.5, 1.0];
        const overNear = bands.map((bk) => overIdx.filter((f) => dists[f] <= bk).length);
        const farMax = bands.map((bk) => {
          let m = 0;
          for (let f = 0; f < faceErr.length; f += 1) if (dists[f] > bk && faceErr[f] > m) m = faceErr[f];
          return +m.toFixed(6);
        });
        plog(
          `[${arm.key}][LOCUS] over0.01 faces=${overIdx.length}. Within k cells of a bisector: ` +
            bands.map((bk, i) => `${bk}c→${((100 * overNear[i]) / Math.max(overIdx.length, 1)).toFixed(0)}%`).join(' ') +
            '  |  FAR-interior max (>k cells): ' +
            bands.map((bk, i) => `${bk}c→${farMax[i]}`).join(' ') +
            '  [far-max ≤ 0.01 ⇒ structured mesh (crease conformed) reaches 0.01mm]'
        );

        append({
          key: arm.key,
          note: arm.note,
          conform: arm.conform,
          tris,
          verts,
          rounds: mesh.rounds,
          hitBudget: mesh.hitBudget,
          graphPts,
          graphEdges,
          align: align ?? null,
          constraint: c ?? null,
          pctBelow20: +q.pctBelow20.toFixed(2),
          minAngleDeg: +q.minAngleDeg.toFixed(3),
          nonMan,
          true3dMax,
          true3dP999,
          true3dP99,
          true3dP50,
          over01,
        });
      },
      6_000_000
    );
  }
});
