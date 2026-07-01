// _frontierVerifyMetricProbe.test.ts — DEV-ONLY (env PF_VERIFY=1). DECISIVE TEST: is the yellow/red on the
// GothicArches chord-error heatmap a GEOMETRIC EXPORT DEFECT, or a RADIAL-METRIC ARTIFACT at near-vertical ribs?
// The heatmap uses perFaceChordSag = the RADIAL / same-(u,t) chord, which the code itself documents OVERSTATES
// steep/tilted relief (analyticSurfaceGate.ts:540). The HONEST gate is perpendicular3DDeviation = the true 3D
// facet→surface distance. This probe builds the clean unified-mechanism mesh (metric-Delaunay under M + pinned
// refined crests, NO chord guard, NO re-injection) and measures it under BOTH metrics, localizes the worst-radial
// facets (radial vs true-3D vs local steepness), BRUTE-FORCE cross-checks the projector on the top facets (guards
// against the true-3D metric UNDER-stating), and renders both heatmaps. Isolated: CALLS the kernel, edits nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator, featureLineChord3D,
  liftTrue, liftUtToRadial, auditNonManByIndex, perFaceChordSag, vertErrColors, dumpRenderBins,
  perpendicular3DDeviation, type StyleDims, type AnalyticRadiusFn, type FeatureTruth,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import { projectPointToRadialSurface } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_verify');
const SEAM = 0.01, TAU = 2 * Math.PI;
const OPTS = { tolMm: 0.004, hMin: 0.003, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 4_000_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;
const BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
const pctile = (a: Float64Array | number[], p: number): number => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

/** brute-force nearest true-surface 3D distance to (px,py,pz), grid over (u,t) window ± win around (u0,t0) then polish. */
function bruteNearest(px: number, py: number, pz: number, u0: number, t0: number, rA: AnalyticRadiusFn, H: number, win = 0.06, n = 121): number {
  let best = Infinity, bu = u0, bt = t0;
  for (let pass = 0; pass < 2; pass++) {
    const w = win / (pass === 0 ? 1 : 12), step = (2 * w) / (n - 1);
    for (let i = 0; i < n; i++) { const u = bu - w + i * step; for (let j = 0; j < n; j++) { const t = Math.min(1, Math.max(0, bt - w + j * step)); const [x, y, z] = liftTrue(u, t, rA, H); const d = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2; if (d < best) { best = d; bu = u; bt = t; } } }
  }
  return Math.sqrt(best);
}

describe('FRONTIER VERIFY — radial heatmap vs true-3D on GothicArches', () => {
  it.skipIf(process.env.PF_VERIFY !== '1')('is the rib red a metric artifact or a real defect?', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const interiorTruth: FeatureTruth = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)) };
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));

    // clean unified mesh: pinned refined crests, NO chord guard, NO re-injection
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true });
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
    const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
    const nonMan = auditNonManByIndex(meshUt.xyz, idx);

    // ── metric A: RADIAL (the heatmap) ──
    const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
    const radialP99 = pctile(sag.faceErr, 0.99);
    // ── metric B: TRUE-3D perpendicular (the honest gate) ──
    const p3 = perpendicular3DDeviation({ vertices: vtx, indices: Uint32Array.from(idx) }, ut, rA, { H: DIMS.H, tolMm: 0.03, collectAboveTol: 60 });
    // ── metric C: feature-line true-3D (what build #1/#2 reported) ──
    const fl3 = featureLineChord3D(interiorTruth, buildLocator(meshUt, 256), meshUt, rA, DIMS.H, 0.05, 0, 4);

    // ── localize: top worst-radial facets → radial vs true-3D(projector) vs true-3D(brute) vs steepness ──
    const nF = idx.length / 3; const order = Array.from({ length: nF }, (_, f) => f).sort((a, b) => sag.faceErr[b] - sag.faceErr[a]).slice(0, 20);
    const rows: string[] = [];
    for (const f of order) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
      // worst BARY point (3D + u,t)
      let worstD = 0, wu = 0, wt = 0, wx = 0, wy = 0, wz = 0;
      for (const [wa, wb, wc] of BARY) {
        const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
        const px = wa * vtx[3 * a] + wb * vtx[3 * b] + wc * vtx[3 * c];
        const py = wa * vtx[3 * a + 1] + wb * vtx[3 * b + 1] + wc * vtx[3 * c + 1];
        const pz = wa * vtx[3 * a + 2] + wb * vtx[3 * b + 2] + wc * vtx[3 * c + 2];
        const th = TAU * um, z = tm * DIMS.H, r = rA(th, z);
        const dRad = Math.abs(Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz)); // radial gap magnitude at this bary
        if (dRad > worstD) { worstD = dRad; wu = ((um % 1) + 1) % 1; wt = Math.min(1, Math.max(0, tm)); wx = px; wy = py; wz = pz; }
      }
      const tPro = projectPointToRadialSurface(wx, wy, wz, rA).dist;
      const tBru = bruteNearest(wx, wy, wz, wu, wt, rA, DIMS.H);
      // local steepness: d(radius)/du and /dt in mm-radius per unit fraction
      const du = 1e-3, dt = 1e-3, th0 = TAU * wu, z0 = wt * DIMS.H;
      const drdu = Math.abs(rA(TAU * (wu + du), z0) - rA(TAU * (wu - du), z0)) / (2 * du);
      const drdt = Math.abs(rA(th0, (wt + dt) * DIMS.H) - rA(th0, (wt - dt) * DIMS.H)) / (2 * dt);
      rows.push(`  f=${f} radial=${sag.faceErr[f].toFixed(3)} true3D_proj=${tPro.toFixed(4)} true3D_brute=${tBru.toFixed(4)} | drdu=${drdu.toFixed(1)}mm/u drdt=${drdt.toFixed(2)}mm/t | u=${wu.toFixed(3)} t=${wt.toFixed(3)}`);
    }

    // ── true-3D per-vertex heatmap (project only facets with radial>0.02; rest are green by the bound) ──
    const t3Vert = new Float64Array(vtx.length / 3);
    for (let f = 0; f < nF; f++) {
      if (sag.faceErr[f] <= 0.02) continue;
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; let mx = 0;
      for (const [wa, wb, wc] of BARY) {
        const px = wa * vtx[3 * a] + wb * vtx[3 * b] + wc * vtx[3 * c];
        const py = wa * vtx[3 * a + 1] + wb * vtx[3 * b + 1] + wc * vtx[3 * c + 1];
        const pz = wa * vtx[3 * a + 2] + wb * vtx[3 * b + 2] + wc * vtx[3 * c + 2];
        const d = projectPointToRadialSurface(px, py, pz, rA).dist; if (d > mx) mx = d;
      }
      if (mx > t3Vert[a]) t3Vert[a] = mx; if (mx > t3Vert[b]) t3Vert[b] = mx; if (mx > t3Vert[c]) t3Vert[c] = mx;
    }
    let t3Worst = 0, t3Over = 0;
    for (let i = 0; i < t3Vert.length; i++) { if (t3Vert[i] > t3Worst) t3Worst = t3Vert[i]; if (t3Vert[i] > 0.03) t3Over++; }
    dumpRenderBins(DIR, 'verify_true3d', meshUt.xyz, idx, { colors: vertErrColors(t3Vert, 0.15), meta: { metric: 'true3D-perpendicular', worst: p3.chordMaxMm, nonMan }, stl: false });
    dumpRenderBins(DIR, 'verify_radial', meshUt.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { metric: 'radial-sameUT', worst: sag.worstMm, nonMan }, stl: false });

    // eslint-disable-next-line no-console
    console.log([
      `VERIFY GothicArches tris=${nF} nonMan=${nonMan}`,
      `  RADIAL (heatmap):    worst=${sag.worstMm.toFixed(4)}mm p99=${radialP99.toFixed(4)} %>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)} %>0.1=${(100 * sag.fracOver(0.1)).toFixed(3)}`,
      `  TRUE-3D (honest):    chordMax=${p3.chordMaxMm.toFixed(4)}mm p99=${p3.p99DevMm.toFixed(4)} vtxMax=${p3.vertexMaxMm.toFixed(4)} nAbove(>0.03)=${p3.nAbove}/${p3.samples} worst@θ=${p3.worst.theta.toFixed(2)},z=${p3.worst.z.toFixed(1)}=${p3.worst.mm.toFixed(4)}`,
      `  TRUE-3D vertHeatmap: worst=${t3Worst.toFixed(4)}mm  verts>0.03=${t3Over}`,
      `  FEATURE-LINE 3D:     p99=${fl3.p99Mm.toFixed(4)}mm max=${fl3.maxMm.toFixed(4)}`,
      `  VERDICT: ${p3.chordMaxMm < 0.11 && sag.worstMm > 3 * p3.chordMaxMm ? 'ARTIFACT — radial overstates near-vertical ribs; mesh is true-3D faithful' : 'INVESTIGATE — true-3D not clean'}`,
      `  TOP-20 WORST-RADIAL FACETS (radial vs true-3D vs steepness):`,
      ...rows,
    ].join('\n'));
    expect(nF).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
