// _sweepMetricMap.test.ts — DEV-ONLY (env PF_SWEEPMAP=1). FRONTIER SWEEP: the definitive per-style map of
// RADIAL-vs-TRUE-3D chord fidelity for the UNIFIED-MECHANISM mesh (metric-Delaunay under M + PINNED refined-crest
// skeleton, NO locked edges — the b2_pin_nolock winner from E-2026-07-01-FRONTIER-BUILD2), across all 20 styles.
//
// WHY: the live "fully green" heatmap is drawn with perFaceChordSag = the RADIAL / same-(u,t) chord, which
// analyticSurfaceGate.ts (~L540) documents OVERSTATES steep/near-vertical relief 2–27×. The HONEST gate is
// perpendicular3DDeviation (true-3D facet→nearest-surface). On GothicArches the radial worst FROZE under worst-sag
// Steiner re-injection (adding a vertex exactly on the worst point left it identical) — the signature of a RADIAL
// ARTIFACT at a near-vertical rib, NOT a geometric defect. This probe generalizes that single-style verify to ALL 20:
// per style it measures BOTH metrics + the feature-line true-3D chord, classifies ARTIFACT / REAL-GAP / CLEAN, and
// ADVERSARIALLY cross-checks each suspected-ARTIFACT with a brute-force nearest (guards against the projector
// UNDER-stating). Isolated: CALLS the kernel + committed hooks; edits NOTHING in src/ or existing research files.
//
// RESILIENCE: ONE env-gated probe. Each style checkpoints its full result to research/exchange/_sweepmap/<style>.json
// the INSTANT it is measured; a re-run SKIPS any style whose JSON already exists. A killed run resumes by re-running.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator, featureLineChord3D,
  liftTrue, liftUtToRadial, auditNonManByIndex, perFaceChordSag, vertErrColors, dumpRenderBins,
  triangleQualityDistribution, perpendicular3DDeviation,
  type StyleDims, type AnalyticRadiusFn, type FeatureTruth,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import { projectPointToRadialSurface } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_sweepmap');
const SEAM = 0.01, TAU = 2 * Math.PI;
// MODERATE density (task-specified): hMin 0.008 / maxP 1.5M so each style meshes in ~1–2 min. The radial-vs-true-3D
// RATIO is what matters and the artifact signature shows at moderate density.
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;
const BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

// The 20 styles (StyleId union order).
const STYLES: StyleId[] = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales',
  'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
];

const pctile = (a: Float64Array | number[], p: number): number => {
  const s = Array.from(a).sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

/** brute-force nearest true-surface 3D distance to (px,py,pz): grid over (u,t) window ±win around (u0,t0) then polish. */
function bruteNearest(px: number, py: number, pz: number, u0: number, t0: number, rA: AnalyticRadiusFn, H: number, win = 0.06, n = 121): number {
  let best = Infinity, bu = u0, bt = t0;
  for (let pass = 0; pass < 2; pass++) {
    const w = win / (pass === 0 ? 1 : 12), step = (2 * w) / (n - 1);
    for (let i = 0; i < n; i++) {
      const u = bu - w + i * step;
      for (let j = 0; j < n; j++) {
        const t = Math.min(1, Math.max(0, bt - w + j * step));
        const [x, y, z] = liftTrue(u, t, rA, H);
        const d = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
        if (d < best) { best = d; bu = u; bt = t; }
      }
    }
  }
  return Math.sqrt(best);
}

interface WorstFacetRow {
  f: number; radial: number; true3D_proj: number; true3D_brute: number;
  drdu: number; drdt: number; u: number; t: number;
}
interface StyleResult {
  style: string; tris: number; nonMan: number; timeMs: number;
  radial: { worstMm: number; p99: number; pctOver0_03: number; pctOver0_1: number };
  true3D: { chordMaxMm: number; p99DevMm: number; vertexMaxMm: number; nAbove: number; samples: number; worst: { theta: number; z: number; mm: number } };
  featLine3D: { p99Mm: number; maxMm: number };
  quality: { minAngleDeg: number; p5MinAngleDeg: number; pctBelow20: number };
  worstFacets: WorstFacetRow[];
  adversarial: { maxBruteVsProjRatio: number; anyBruteGtProj: boolean };
  class: 'ARTIFACT' | 'REAL-GAP' | 'CLEAN';
  classReason: string;
}

function measureStyle(style: StyleId): StyleResult {
  const t0 = Date.now();
  const rA = buildRadiusFn(style, {}, DIMS);
  const truth = buildFeatureTruth(style, {}, DIMS, 384);
  const interiorTruth: FeatureTruth = {
    ...truth,
    lines: truth.lines.filter((l) => l.points.every((p) => p.u > SEAM && p.u < 1 - SEAM && p.t > SEAM && p.t < 1 - SEAM)),
  };
  const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
  const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));

  // The unified mechanism: metric-Delaunay under M + injected refined-crest VERTICES, PINNED, NO locked edges.
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true });
  const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
  const nF = idx.length / 3;
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);

  // ── metric A: RADIAL (the heatmap) ──
  const sag = perFaceChordSag(ut, idx, rA, DIMS.H);
  const radialP99 = pctile(sag.faceErr, 0.99);
  // ── metric B: TRUE-3D perpendicular (the honest gate) ──
  // NOTE: perpendicular3DDeviation reads `ut` as stride-3 (u,t,surfaceId): surfaceId≥0.5 → non-outer-wall skip
  // (L405), and (u,t) drive the seam-band exclusion. The in-house kernel emits stride-2 (u,t) OUTER-WALL-ONLY, so we
  // build a stride-3 ut3=(u,t,0) — otherwise the mask reads garbage and drops/keeps the wrong facets. seamExclU=SEAM
  // excludes the u-seam wrap band (the SAME band interiorTruth filters for the feature-line metric), so a single
  // seam facet can't masquerade as broad under-tessellation (validation caught GothicArches chordMax 0.58 = ONE
  // seam facet while its interior p99 was 0.052/featLine 0.070 = CAD-grade).
  const nV = ut.length / 2;
  const ut3 = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { ut3[3 * i] = ut[2 * i]; ut3[3 * i + 1] = ut[2 * i + 1]; ut3[3 * i + 2] = 0; }
  const p3 = perpendicular3DDeviation({ vertices: vtx, indices: Uint32Array.from(idx) }, ut3, rA, { H: DIMS.H, tolMm: 0.03, seamExclU: SEAM, collectAboveTol: 60 });
  // ── metric C: feature-line true-3D ──
  const fl3 = featureLineChord3D(interiorTruth, buildLocator(meshUt, 256), meshUt, rA, DIMS.H, 0.05, 0, 4);
  // ── quality (slivers by minAngle) ──
  const q = triangleQualityDistribution({ vertices: vtx, indices: mesh.indices });

  // ── localize: top worst-radial facets → radial vs true-3D(proj) vs true-3D(brute) vs steepness (adversarial) ──
  const order = Array.from({ length: nF }, (_, f) => f).sort((a, b) => sag.faceErr[b] - sag.faceErr[a]).slice(0, 20);
  const worstFacets: WorstFacetRow[] = [];
  let maxBruteVsProjRatio = 0, anyBruteGtProj = false;
  for (const f of order) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    let worstD = 0, wu = 0, wt = 0, wx = 0, wy = 0, wz = 0;
    for (const [wa, wb, wc] of BARY) {
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const px = wa * vtx[3 * a] + wb * vtx[3 * b] + wc * vtx[3 * c];
      const py = wa * vtx[3 * a + 1] + wb * vtx[3 * b + 1] + wc * vtx[3 * c + 1];
      const pz = wa * vtx[3 * a + 2] + wb * vtx[3 * b + 2] + wc * vtx[3 * c + 2];
      const th = TAU * um, z = tm * DIMS.H, r = rA(th, z);
      const dRad = Math.abs(Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz));
      if (dRad > worstD) { worstD = dRad; wu = ((um % 1) + 1) % 1; wt = Math.min(1, Math.max(0, tm)); wx = px; wy = py; wz = pz; }
    }
    const tPro = projectPointToRadialSurface(wx, wy, wz, rA).dist;
    const tBru = bruteNearest(wx, wy, wz, wu, wt, rA, DIMS.H);
    if (tPro > 1e-9) { const ratio = tBru / tPro; if (ratio > maxBruteVsProjRatio) maxBruteVsProjRatio = ratio; }
    // ADVERSARIAL guard: nearest-distance is an infimum, so a CORRECT projector can only ever REPORT ≥ the true
    // nearest (never under-state a distance to the surface). The dangerous failure is proj landing on a SPURIOUS
    // near-tangent basin far from the true foot → proj ≪ brute AND brute large in ABSOLUTE terms (not just a coarse-
    // grid rounding blip on a tiny distance). Require a big ratio AND brute ≥ 0.3mm so 0.21-vs-0.11 noise doesn't fire.
    if (tBru > 2 * tPro + 0.05 && tBru >= 0.3) anyBruteGtProj = true;
    const du = 1e-3, dt = 1e-3, th0 = TAU * wu, z0 = wt * DIMS.H;
    const drdu = Math.abs(rA(TAU * (wu + du), z0) - rA(TAU * (wu - du), z0)) / (2 * du);
    const drdt = Math.abs(rA(th0, (wt + dt) * DIMS.H) - rA(th0, (wt - dt) * DIMS.H)) / (2 * dt);
    worstFacets.push({ f, radial: sag.faceErr[f], true3D_proj: tPro, true3D_brute: tBru, drdu, drdt, u: wu, t: wt });
  }

  // ── true-3D per-vertex heatmap (project only facets with radial>0.02) for the render ──
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
  dumpRenderBins(DIR, `${style}_true3d`, meshUt.xyz, idx, { colors: vertErrColors(t3Vert, 0.15), meta: { metric: 'true3D-perpendicular', worst: p3.chordMaxMm, nonMan }, stl: false });
  dumpRenderBins(DIR, `${style}_radial`, meshUt.xyz, idx, { colors: vertErrColors(sag.vertErr, 0.15), meta: { metric: 'radial-sameUT', worst: sag.worstMm, nonMan }, stl: false });

  // ── classify. worst-radial facets near-vertical ⇒ median drdu of the top-20 (mm-radius per unit-u). ──
  const drdus = worstFacets.map((r) => r.drdu).sort((a, b) => a - b);
  const medianDrdu = drdus[Math.floor(drdus.length / 2)] ?? 0;
  const trueChord = p3.chordMaxMm;            // seam-excluded true-3D worst facet
  const trueP99 = p3.p99DevMm;                 // BROAD honest true-3D measure (robust to a lone tail facet)
  const featP99 = fl3.p99Mm;                   // ON-crest true-3D chord
  const radialWorst = sag.worstMm;
  // BROAD gap = the 99th-percentile true-3D error is itself over CAD tol (0.11) → genuine widespread under-tess.
  // TAIL gap = chordMax over tol but p99 (and featLine) green → a handful of worst facets, not a broad defect.
  const CAD = 0.11;
  let cls: StyleResult['class']; let reason: string;
  if (trueChord < CAD && radialWorst > 3 * trueChord) {
    cls = 'ARTIFACT';
    reason = `true3D chordMax=${trueChord.toFixed(4)}<${CAD} AND radial worst=${radialWorst.toFixed(3)}>3× true3D (ratio ${(radialWorst / Math.max(1e-9, trueChord)).toFixed(1)}×); worst-radial facets near-vertical (median drdu=${medianDrdu.toFixed(1)}mm/u); p99=${trueP99.toFixed(4)} featLine=${featP99.toFixed(4)}`;
  } else if (trueChord >= CAD) {
    cls = 'REAL-GAP';
    const broad = trueP99 >= CAD ? 'BROAD' : 'TAIL';
    reason = `${broad}: true3D chordMax=${trueChord.toFixed(4)}≥${CAD} (p99=${trueP99.toFixed(4)} featLine=${featP99.toFixed(4)}) worst@θ=${p3.worst.theta.toFixed(2)},z=${p3.worst.z.toFixed(1)}=${p3.worst.mm.toFixed(4)}; radial worst=${radialWorst.toFixed(3)} (ratio ${(radialWorst / Math.max(1e-9, trueChord)).toFixed(1)}×)`;
  } else {
    cls = 'CLEAN';
    reason = `both metrics green: radial worst=${radialWorst.toFixed(4)}, true3D chordMax=${trueChord.toFixed(4)} p99=${trueP99.toFixed(4)}`;
  }

  return {
    style, tris: nF, nonMan, timeMs: Date.now() - t0,
    radial: { worstMm: sag.worstMm, p99: radialP99, pctOver0_03: 100 * sag.fracOver(0.03), pctOver0_1: 100 * sag.fracOver(0.1) },
    true3D: { chordMaxMm: p3.chordMaxMm, p99DevMm: p3.p99DevMm, vertexMaxMm: p3.vertexMaxMm, nAbove: p3.nAbove, samples: p3.samples, worst: p3.worst },
    featLine3D: { p99Mm: fl3.p99Mm, maxMm: fl3.maxMm },
    quality: { minAngleDeg: q.minAngleDeg, p5MinAngleDeg: q.p5MinAngleDeg, pctBelow20: q.pctBelow20 },
    worstFacets, adversarial: { maxBruteVsProjRatio, anyBruteGtProj },
    class: cls, classReason: reason,
  };
}

describe('FRONTIER SWEEP — radial-vs-true-3D metric map, all 20 styles', () => {
  it.skipIf(process.env.PF_SWEEPMAP !== '1')('measures both metrics + classifies each style (resumable)', () => {
    mkdirSync(DIR, { recursive: true });
    // Optional single/subset filter for fast validation (comma-separated), e.g. PF_SWEEPMAP_ONLY=GothicArches.
    const only = (process.env.PF_SWEEPMAP_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const todo = only.length ? STYLES.filter((s) => only.includes(s)) : STYLES;
    for (const style of todo) {
      const out = join(DIR, `${style}.json`);
      if (existsSync(out)) {
        // eslint-disable-next-line no-console
        console.log(`SKIP ${style} (already checkpointed at ${out})`);
        continue;
      }
      // eslint-disable-next-line no-console
      console.log(`RUN  ${style} ...`);
      let res: StyleResult;
      try {
        res = measureStyle(style);
      } catch (e: unknown) {
        // Record the failure so a re-run does not re-attempt indefinitely; keep honest.
        const errRec = { style, error: String((e as Error)?.message ?? e), failed: true };
        writeFileSync(out, JSON.stringify(errRec, null, 2));
        // eslint-disable-next-line no-console
        console.log(`FAIL ${style}: ${errRec.error}`);
        continue;
      }
      // CHECKPOINT the instant it is measured.
      writeFileSync(out, JSON.stringify(res, null, 2));
      // eslint-disable-next-line no-console
      console.log(
        `DONE ${style.padEnd(20)} tris=${String(res.tris).padStart(8)} nonMan=${res.nonMan} ` +
        `radialWorst=${res.radial.worstMm.toFixed(3)} true3D_chordMax=${res.true3D.chordMaxMm.toFixed(4)} ` +
        `featLine_p99=${res.featLine3D.p99Mm.toFixed(4)} minA=${res.quality.minAngleDeg.toFixed(2)} %<20=${res.quality.pctBelow20.toFixed(1)} ` +
        `bruteVsProj=${res.adversarial.maxBruteVsProjRatio.toFixed(2)} [${res.class}] ${res.classReason}`,
      );
    }
    expect(STYLES.length).toBe(20);
  }, 4 * 60 * 60 * 1000);
});
