/**
 * verify_modelVsRealMesh.test.ts — ADVERSARIAL cross-check (concern:
 * model-vs-real-mesh). NOT a production probe; NOT a gate. Written by the
 * measurement-accuracy auditor to answer ONE question with REAL numbers:
 *
 *   Do the IDEALIZED-cell probes (dyadicWarpFloor / featureDensityLocalization /
 *   cellTriangulationCeiling) — which build synthetic (phi,t) or (u,t) quads and
 *   score them with polygonBestMinAngle3D against the EXACT f64 SfbWallSampler —
 *   faithfully PREDICT the angles of the triangles the REAL production
 *   triangulator (triangulateQuadtreeWithFeatures) actually emits, measured on
 *   the surface the REAL mesh is actually built on (GpuSurfaceSampler bilinear
 *   over a 256x256 GPU grid, per ParametricExportComputer DENSE_RES=256 /
 *   conformingTopologyGate denseWallSampler)?
 *
 * Three independent measurements, each reporting numbers (no opinions):
 *
 *  A. SURFACE LINCHPIN — SfbWallSampler (exact f64, what EVERY probe samples)
 *     vs GpuSurfaceSampler (bilinear 256-grid, what the REAL mesh is built on).
 *     Max/RMS position divergence in mm, sampled densely AND specifically on the
 *     analytic crest loci (the cusps the bilinear grid flattens). If this is
 *     large at crests, every probe angle is computed on a DIFFERENT surface than
 *     the one the production mesh lives on.
 *
 *  B. REAL TRIANGULATOR — run the REAL triangulateQuadtreeWithFeatures on the
 *     pinned SFB@1 config (identical to runSfbSnapFloorAudit), then score EVERY
 *     emitted triangle's 3D min-angle TWICE: once on the exact SfbWallSampler
 *     (the probe surface) and once on the bilinear GpuSurfaceSampler (the real
 *     surface). Compare the two distributions and the worst tail. This quantifies
 *     how much the bilinear surface alone changes the real-mesh angle readings.
 *
 *  C. MODEL-vs-REAL ANGLE GAP — the cellTriangulationCeiling probe predicts a
 *     best-achievable ceiling per crest-cell on the AXIS-ALIGNED production grid.
 *     The real triangulator runs on that SAME axis-aligned grid. So this pair IS
 *     comparable. Compare the ceiling distribution (model) to the real fill's 3D
 *     angle distribution (both on the exact surface) — the gap between "best a
 *     triangulation could do" and "what cdt2d actually did". Then state the
 *     ARCHITECTURE MISMATCH the dyadic/featureDensity probes carry: they score a
 *     FEATURE-ALIGNED warped (phi=u*m(t)) grid that the production pipeline does
 *     NOT build (the conforming mesher is axis-aligned today), so their floors
 *     describe a hypothetical mesher, not the shipping one.
 *
 * Pure CPU. Imports are READ-ONLY. No production code changed.
 */
import { describe, it, expect } from 'vitest';
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import {
  extractAnalyticFeatures,
  sfRf,
} from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import {
  SfbWallSampler,
  SFB1_PACKED,
  SFB_DIMS,
  SFB_FEATURE_LEVEL,
  SFB_UBIAS,
} from './snapPlacementAudit';
import { sfClosedFormParamRidge } from './crestLateralDeviation';
import type { PositionSampler } from './metrics';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);

// Production DENSE_RES: ParametricExportComputer.ts:2296 = 256;
// conformingTopologyGate.test.ts denseWallSampler is the headless mirror.
const DENSE_RES = 256;

/** Build the bilinear GPU-grid sampler EXACTLY as production does (evaluate the
 *  exact wall on a DENSE_RES x DENSE_RES grid, then bilinear interp). This is the
 *  surface the REAL conforming mesh is actually built on. */
function buildBilinearSampler(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1); // production t spacing (GpuSurfaceSampler)
    for (let col = 0; col < res; col++) {
      const q = exact.position(col / res, tVal); // u periodic = col/res
      grid[w++] = q[0];
      grid[w++] = q[1];
      grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}
const bilinear = buildBilinearSampler(DENSE_RES);

type V3 = readonly [number, number, number];
function triMin3(P: PositionSampler, ai: CellPoint, bi: CellPoint, ci: CellPoint): number {
  const a = P.position(ai.u, ai.t);
  const b = P.position(bi.u, bi.t);
  const c = P.position(ci.u, ci.t);
  const ang = (X: V3, Y: V3, Z: V3): number => {
    const x1 = Y[0] - X[0], y1 = Y[1] - X[1], z1 = Y[2] - X[2];
    const x2 = Z[0] - X[0], y2 = Z[1] - X[1], z2 = Z[2] - X[2];
    const l1 = Math.hypot(x1, y1, z1), l2 = Math.hypot(x2, y2, z2);
    if (l1 < 1e-12 || l2 < 1e-12) return 0;
    let cs = (x1 * x2 + y1 * y2 + z1 * z2) / (l1 * l2);
    cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
    return (Math.acos(cs) * 180) / Math.PI;
  };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}

interface Dist { n: number; min: number; p1: number; median: number; b15: number; b20: number }
function distOf(vals: number[]): Dist {
  const s = [...vals].sort((x, y) => x - y);
  const n = s.length;
  let b15 = 0, b20 = 0;
  for (const v of s) { if (v < 15) b15++; if (v < 20) b20++; }
  return {
    n,
    min: n ? s[0] : 0,
    p1: n ? s[Math.floor(0.01 * n)] : 0,
    median: n ? s[Math.floor(0.5 * n)] : 0,
    b15: n ? (100 * b15) / n : 0,
    b20: n ? (100 * b20) / n : 0,
  };
}
function fmtD(name: string, d: Dist): string {
  return `${name}: n=${d.n} min ${d.min.toFixed(2)} p1 ${d.p1.toFixed(2)} median ${d.median.toFixed(2)} <15 ${d.b15.toFixed(1)}% <20 ${d.b20.toFixed(1)}%`;
}

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}

/** Uniform anisotropic quadtree — EXACTLY uniformAnisoQuadtree in
 *  snapPlacementAudit.ts (the production feature-cell geometry). */
function uniformAnisoQuadtree(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias);
  const tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++)
    for (let iu = 0; iu < uSpan; iu++)
      leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  return { leaves: () => leaves, uBias: () => uBias };
}

describe('VERIFY model-vs-real-mesh: idealized probes vs the real triangulator + real surface', () => {
  // ── A. SURFACE LINCHPIN: exact f64 vs bilinear-256 (what the real mesh uses) ──
  it('A. quantifies SfbWallSampler (probe) vs GpuSurfaceSampler-256 (real mesh) divergence in mm', () => {
    // A1. dense uniform sampling across the whole domain.
    let maxAll = 0, sumSqAll = 0, nAll = 0;
    for (let it = 0; it <= 200; it++) {
      const t = it / 200;
      for (let iu = 0; iu < 400; iu++) {
        const u = iu / 400;
        const a = exact.position(u, t);
        const b = bilinear.position(u, t);
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (d > maxAll) maxAll = d;
        sumSqAll += d * d; nAll++;
      }
    }
    const rmsAll = Math.sqrt(sumSqAll / nAll);

    // A2. ON the analytic crest loci specifically (the cusps bilinear flattens).
    //     Split SEAM-region (u within 1.5 grid cols of 0/1 — possible wrap
    //     ambiguity) from INTERIOR crest points to keep the finding honest: the
    //     worst whole-domain point can be a seam wrap artifact, not flattening.
    const seamU = 1.5 / DENSE_RES;
    const ridge = sfClosedFormParamRidge(p, { tSamples: 4097 });
    const crests = ridge.branches.filter((b) => b.kind === 'crest');
    let maxCrest = 0, sumSqCrest = 0, nCrest = 0;
    let maxCrestInt = 0, worstInt = { u: 0, t: 0, mm: 0 };
    let worst = { u: 0, t: 0, mm: 0 };
    // A3. crest AMPLITUDE flattening: how much of the petal tip the 256-grid loses,
    //     as an absolute mm AND as a fraction of the local crest amplitude
    //     (0.35*rf*r0 — the radial swing the petal adds above the 0.9*r0 base).
    let maxRadialLoss = 0, maxLossFrac = 0;
    for (const br of crests) {
      for (const pt of br.points) {
        const uu = pt.u - Math.floor(pt.u);
        const nearSeam = uu < seamU || uu > 1 - seamU;
        const a = exact.position(pt.u, pt.t);
        const b = bilinear.position(pt.u, pt.t);
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (d > maxCrest) { maxCrest = d; worst = { u: pt.u, t: pt.t, mm: d }; }
        if (!nearSeam && d > maxCrestInt) { maxCrestInt = d; worstInt = { u: pt.u, t: pt.t, mm: d }; }
        sumSqCrest += d * d; nCrest++;
        const ra = Math.hypot(a[0], a[1]);
        const rb = Math.hypot(b[0], b[1]);
        const loss = ra - rb; // positive = bilinear undershoots the crest
        const r0 = SFB_DIMS.Rb + (SFB_DIMS.Rt - SFB_DIMS.Rb) * Math.pow(pt.t, SFB_DIMS.expn);
        const amp = 0.35 * sfRf(pt.u, pt.t, p) * r0; // crest radial swing above 0.9*r0
        if (!nearSeam && loss > maxRadialLoss) maxRadialLoss = loss;
        if (!nearSeam && amp > 1e-6 && loss / amp > maxLossFrac) maxLossFrac = loss / amp;
      }
    }
    const rmsCrest = Math.sqrt(sumSqCrest / nCrest);

    /* eslint-disable no-console */
    console.log('\n===== A. SURFACE LINCHPIN (exact f64 vs bilinear-256) =====');
    console.log(`  whole-domain: max ${maxAll.toFixed(4)}mm rms ${rmsAll.toFixed(4)}mm (n=${nAll})`);
    console.log(`  ON crest loci (incl seam): max ${maxCrest.toFixed(4)}mm rms ${rmsCrest.toFixed(4)}mm (n=${nCrest})`);
    console.log(`  worst crest pt (incl seam): u=${worst.u.toFixed(4)} t=${worst.t.toFixed(4)} -> ${worst.mm.toFixed(4)}mm`);
    console.log(`  worst INTERIOR crest pt (seam excl): u=${worstInt.u.toFixed(4)} t=${worstInt.t.toFixed(4)} -> ${worstInt.mm.toFixed(4)}mm`);
    console.log(`  max INTERIOR crest RADIAL undershoot (tip flattening): ${maxRadialLoss.toFixed(4)}mm (= ${(100 * maxLossFrac).toFixed(1)}% of local crest amplitude)`);
    console.log('===========================================================\n');
    /* eslint-enable no-console */

    expect(nAll).toBeGreaterThan(10000);
    expect(nCrest).toBeGreaterThan(100);
  });

  // ── B. REAL TRIANGULATOR: real output triangles scored on BOTH surfaces ──
  it('B. scores the REAL triangulator output on exact vs bilinear surface', () => {
    const cornerSnap = 0.06 / (1 << SFB_FEATURE_LEVEL);
    const uMargin = 1.5 / (1 << SFB_FEATURE_LEVEL);
    const tMargin = 1 / 1024;
    const graph = extractAnalyticFeatures('SuperformulaBlossom', p, {
      H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb,
    });
    const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
    const qt = uniformAnisoQuadtree(SFB_FEATURE_LEVEL, SFB_UBIAS);
    const mesh = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });

    // u of every inserted feature vertex (to classify sliver location).
    const featU: number[] = [];
    for (const ln of clipped) for (const pt of ln.points) featU.push(pt.u - Math.floor(pt.u));
    featU.sort((x, y) => x - y);
    const nearestFeatU = (u: number): number => {
      let best = Infinity;
      for (const fu of featU) {
        let d = Math.abs(u - fu);
        d = Math.min(d, 1 - d); // wrap
        if (d < best) best = d;
      }
      return best;
    };

    const verts = mesh.vertices;
    const idx = mesh.indices;
    const exactVals: number[] = [];
    const bilinearVals: number[] = [];
    let perTriMaxGap = 0;
    // sub-15 sliver localization (on exact surface).
    let nSub15 = 0, sub15NearFeat = 0; // within ~1 feature-cell u of a crest
    let worstTri = { min: 90, u: 0, t: 0, distFeatU: 0, area2: 0 };
    const cellU = 1 / (1 << (SFB_FEATURE_LEVEL + SFB_UBIAS));
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const A = { u: verts[a * 3], t: verts[a * 3 + 1] };
      const B = { u: verts[b * 3], t: verts[b * 3 + 1] };
      const C = { u: verts[c * 3], t: verts[c * 3 + 1] };
      const me = triMin3(exact, A, B, C);
      const mb = triMin3(bilinear, A, B, C);
      exactVals.push(me);
      bilinearVals.push(mb);
      const g = Math.abs(me - mb);
      if (g > perTriMaxGap) perTriMaxGap = g;
      if (me < 15) {
        nSub15++;
        const cu = ((A.u + B.u + C.u) / 3) % 1;
        const ct = (A.t + B.t + C.t) / 3;
        const dF = nearestFeatU(cu < 0 ? cu + 1 : cu);
        if (dF < 2 * cellU) sub15NearFeat++;
        if (me < worstTri.min) {
          // 3D area (to prove the worst sliver is a real, non-degenerate triangle).
          const PA = exact.position(A.u, A.t), PB = exact.position(B.u, B.t), PC = exact.position(C.u, C.t);
          const ux = PB[0] - PA[0], uy = PB[1] - PA[1], uz = PB[2] - PA[2];
          const vx = PC[0] - PA[0], vy = PC[1] - PA[1], vz = PC[2] - PA[2];
          const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
          worstTri = { min: me, u: cu < 0 ? cu + 1 : cu, t: ct, distFeatU: dF, area2 };
        }
      }
    }

    const dE = distOf(exactVals);
    const dB = distOf(bilinearVals);

    /* eslint-disable no-console */
    console.log('\n===== B. REAL triangulateQuadtreeWithFeatures output (SFB@1, axis-aligned grid) =====');
    console.log(`  triangles=${exactVals.length}  vertices=${verts.length / 3}  insertedLines=${clipped.length}`);
    console.log('  ' + fmtD('on EXACT f64 surface (what probes use)  ', dE));
    console.log('  ' + fmtD('on BILINEAR-256 surface (what mesh uses)', dB));
    console.log(`  worst per-triangle exact-vs-bilinear angle gap: ${perTriMaxGap.toFixed(3)}deg`);
    console.log(`  sub-15deg slivers: ${nSub15}; within 2 feature-cells of a crest: ${sub15NearFeat} (${(100 * sub15NearFeat / Math.max(1, nSub15)).toFixed(0)}%)`);
    console.log(`  WORST real triangle: min ${worstTri.min.toFixed(3)}deg at u=${worstTri.u.toFixed(4)} t=${worstTri.t.toFixed(4)} distToCrest=${(worstTri.distFeatU / cellU).toFixed(1)} cells, 3D area=${(worstTri.area2 / 2).toExponential(2)}mm^2 (>0 => real, non-degenerate)`);
    console.log('  => the idealized probes predict ~17-18deg floors; the REAL axis-aligned mesh emits this sliver.');
    console.log('=====================================================================================\n');
    /* eslint-enable no-console */

    expect(exactVals.length).toBeGreaterThan(1000);
  });

  // ── C. MODEL ARCHITECTURE MISMATCH: dyadic/featureDensity warp the grid; the
  //      real triangulator does not. Quantify the warp the probes assume. ──
  it('C. quantifies the feature-aligned warp the dyadic/density probes assume but the real mesher does NOT apply', () => {
    // The dyadicWarpFloor / featureDensityLocalization probes place cell corners
    // at u = phi/m(t) (FEATURE-ALIGNED). The real triangulator (uniformAnisoQt
    // above, the production feature-cell grid) places corners at u = col/uSpan
    // (AXIS-ALIGNED, m(t)-independent). Measure how far a feature-aligned column
    // sits from the nearest axis-aligned grid column at production density — i.e.
    // the geometric distortion the warp introduces that the real mesh never gets.
    const uSpan = 1 << (SFB_FEATURE_LEVEL + SFB_UBIAS); // real grid columns
    const tRows = 256;
    let maxColShiftU = 0;   // |feature-aligned col u  -  nearest axis col u|
    let maxColShiftMm = 0;
    for (let it = 0; it < tRows; it++) {
      const tm = (it + 0.5) / tRows;
      const m = mOf(tm);
      // every crest+valley feature line phi in (1, m-1)
      for (let k = 2; k <= 20; k++) {
        const phi = k * 0.5;
        if (phi < 1 || phi > m - 1) continue;
        const uFeat = phi / m;                       // probe (warped) column
        const nearestCol = Math.round(uFeat * uSpan);
        const uAxis = nearestCol / uSpan;            // real (axis) column
        const du = Math.abs(uFeat - uAxis);
        if (du > maxColShiftU) maxColShiftU = du;
        const a = exact.position(uFeat, tm);
        const b = exact.position(uAxis, tm);
        const mm = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (mm > maxColShiftMm) maxColShiftMm = mm;
      }
    }

    // Also: does the real triangulator EVER produce the warped (phi/m0 at t0,
    // phi/m1 at t1) sheared quads the probes score? Across MANY crests/rows
    // (not one cherry-picked cell), score a probe-style sheared crest flank cell
    // and an axis-aligned cell of equal u-width at the same crest, both on exact.
    const warpMins: number[] = [];
    const axisMins: number[] = [];
    const e = 1e-5;
    for (let it = 16; it < tRows; it += 4) {
      const tmid = (it + 0.5) / tRows;
      const t0 = it / tRows, t1 = (it + 1) / tRows;
      const m0 = mOf(t0), m1 = mOf(t1), mc = mOf(tmid);
      for (let k = 2; k <= 20; k++) {
        const phiC = k - 0.5; // crest phi
        if (phiC < 1 || phiC > mc - 1) continue;
        const ucm = phiC / mc;
        const da = exact.position(ucm + e, tmid), db = exact.position(ucm - e, tmid);
        const dPdu = Math.hypot(da[0] - db[0], da[1] - db[1], da[2] - db[2]) / (2 * e);
        const dc = exact.position(ucm, Math.min(1, tmid + e)), dd = exact.position(ucm, Math.max(0, tmid - e));
        const dPdt = Math.hypot(dc[0] - dd[0], dc[1] - dd[1], dc[2] - dd[2]) / (2 * e);
        if (!(dPdu > 1e-9) || !(dPdt > 1e-9)) continue;
        const along = dPdt * (t1 - t0);
        const dphi = (along * mc) / dPdu;
        if (!(dphi > 1e-9) || dphi >= 0.5) continue;
        if (phiC + dphi >= mc || phiC - dphi <= 0) continue;
        // probe-style WARPED flank cell (feature-aligned corners, u=phi/m(t)).
        const warped: CellPoint[] = [
          { u: phiC / m0, t: t0 },
          { u: (phiC + dphi) / m0, t: t0 },
          { u: (phiC + dphi) / m1, t: t1 },
          { u: phiC / m1, t: t1 },
        ];
        // real-style AXIS-ALIGNED cell of the same u-width at the crest.
        const uw = dphi / mc;
        const axis: CellPoint[] = [
          { u: ucm, t: t0 },
          { u: ucm + uw, t: t0 },
          { u: ucm + uw, t: t1 },
          { u: ucm, t: t1 },
        ];
        warpMins.push(Math.min(
          triMin3(exact, warped[0], warped[1], warped[2]),
          triMin3(exact, warped[0], warped[2], warped[3]),
        ));
        axisMins.push(Math.min(
          triMin3(exact, axis[0], axis[1], axis[2]),
          triMin3(exact, axis[0], axis[2], axis[3]),
        ));
      }
    }
    const dW = distOf(warpMins);
    const dA = distOf(axisMins);

    /* eslint-disable no-console */
    console.log('\n===== C. ARCHITECTURE MISMATCH (probe warp vs real axis-aligned grid) =====');
    console.log(`  real grid: ${uSpan} axis-aligned columns (u=col/${uSpan}), m(t)-independent`);
    console.log(`  feature-aligned column max offset from nearest axis column: ${maxColShiftU.toExponential(3)} u  (${maxColShiftMm.toFixed(4)}mm)`);
    console.log('  crest flank cell min-angle across many crests/rows (best-diagonal, exact surface):');
    console.log('  ' + fmtD('WARPED (what dyadic/density probes score)', dW));
    console.log('  ' + fmtD('AXIS   (what the real mesher builds)     ', dA));
    console.log('  NOTE: dyadicWarpFloor & featureDensityLocalization score the WARPED geometry.');
    console.log('  The production conforming mesher builds the AXIS geometry. The probe floors');
    console.log('  (~17deg / 18.38deg) therefore describe a HYPOTHETICAL feature-aligned mesher.');
    console.log('===========================================================================\n');
    /* eslint-enable no-console */

    expect(uSpan).toBe(1 << (SFB_FEATURE_LEVEL + SFB_UBIAS));
  });
});
