// _dsBodyClose.test.ts — E-2026-07-20-DS-BODY-CLOSE. Close the MID-BODY relief residual of the CONVERGE-A
// structured ring-strip mesh (src tierC/dsRingStrips.ts, flag __pfDsRingStrips) to the whole-mesh 0.01mm true-3D
// export standard. The CONVERGE-A ring is CLOSED + ADVERSARIALLY CONFIRMED (af1544d0/fc73fa76/70a16b33) — do NOT
// re-litigate it. The ONE remaining fidelity gap is OFF the ring: the adversarial rev-coverage read GLOBAL MAX
// 0.072616 (426/2.46M > 0.01) @ t~0.812 (mid-body between rings k6/k7), named as "coarse body rows (bodyStepMm 0.2)
// chord the scale relief".
//
// MECHANISM (derived from src/geometry/styles.ts rOuterDragonScales, DEFAULT_DRAGON_SCALES depth0.12/curv1.5/ov0.5):
//   scaleShape = 1 - (1 - dist)^curv, dist = sqrt(xDist^2 + yDist^2), yDist = |rowLocal-0.5|/0.75. At the SCALE-CENTER
//   theta (xDist=0) the |rowLocal-0.5| makes r(z) a near-LINEAR CUSP (crest) at t=(k+0.5)/scaleRows: slope
//   |dr/dz| ~= scaleDepth*sizeMult*r0 * curv * (1/0.75) * (scaleRows/H) ~= 0.8 mm/mm. A uniform body-row PAIR of
//   height h straddling the cusp chords it by ~ slope*h/2 ~= 0.8*0.1 = 0.08mm — matching the measured 0.073. It is a
//   FEATURE (a t-direction crease line), sharpest at the scale-center u and rounding off away (the sqrt corner).
//
// HYPOTHESIS: a relief-aware (crest-anchored + curvature-graded) body t-row schedule in the ring-strip emitter closes
// GLOBAL true-3D (fwd facet->surface AND rev coverage) MAX to <=0.01 at bounded budget (<=2x L2's 3.17M tris), with
// zero ring regression and watertight-by-construction preserved.
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE running, per the meshing-research protocol):
//   DISCRIMINATOR (U1, cheapest — decides the axis before building anything): on the L2 geometric mesh, measure the
//     apex-STRADDLE facet true-3D MAX (facets whose z-span contains a crest z=(k+0.5)/8*H) across a t-ladder
//     (bodyStepMm 0.2->0.1->0.05, nU fixed 2048) vs a u-ladder (nU 2048->4096, bodyStepMm fixed 0.2). PRE-REGISTERED
//     PREDICTION: the residual is a t-direction CUSP => t-limited => the t-ladder shrinks the straddle MAX ~LINEARLY
//     in bodyStepMm (cusp sag ~ slope*h/2), while the u-ladder barely moves it. t-LIMITED confirmed iff
//     (t:0.1 MAX < 0.7 x baseline) AND (u:4096 MAX > 0.85 x baseline). If instead u moves it more => u-limited => the
//     fix needs nU, not the t-schedule (name it, escalate).
//   CLOSED (U2) iff, on the ADAPTIVE-schedule arm at nU=2048 (budget reported; target <=6.35M tris = 2x L2):
//     (A) GLOBAL rev-coverage MAX <= 0.01 (0 samples > 0.01 at the adversarial scan density nU1024 x nT2400) AND
//         fwd true-3D MAX <= 0.01 over BODY facets (perFaceTrue3DSag, ring-crossing facets excluded);
//     (B) ring NO-REGRESS: the ring anchor rows (tread pairs + flank ladders) are a SUBSET of the adaptive schedule
//         (mechanism-identical) AND the near-ring same-side SHOULDER fwd true-3D stays <= 0.0066-class AND the tread
//         lip radii stay <= treadHalfMm-class;
//     (C) watertight: nonManRawBigStats.nonMan = 0 with a NON-VACUOUS injected-crack control that moves the count.
//   WALL otherwise — name the residual mechanism honestly.
//   Secondary (measure, don't gate): slivers via triangleQualityDistribution minAngle (+ %<20).
//
// DEV-ONLY; research/ only; READ-ONLY on src (imports buildDsRingStripWall/buildDsRingTSchedule + labkit + the
// certified prodtruth lib). No production default changed; no flag flipped. The ADAPTIVE schedule is prototyped HERE
// (buildDsRingStripWall takes an explicit tRows) so the mechanism is proven BEFORE any src edit. Every unit is
// env-gated + checkpointed => a killed run resumes by re-running only the unfinished unit.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  projectPointToRadialSurface, triangleQualityDistribution, nonManRawBigStats, perFaceTrue3DSag, dumpHeatmap,
} from './labkit';
import {
  dsRadiusFn, dragonRings, H as DS_H, TOL, DENSE, buildArtifactLocator, oneSidedRA,
} from './_ds_prodtruth_lib';
import { buildDsRingStripWall, buildDsRingTSchedule } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { DEFAULT_DS_LATTICE } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsFeatureEdges';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const SCALE_ROWS = DEFAULT_DS_LATTICE.scaleRows; // 8
const OUT_DIR = join('research', 'exchange', '_dsBodyClose');
const NDJSON = join(OUT_DIR, 'bodyclose.ndjson');
const RENDER_DIR = join(OUT_DIR, 'render');

// The registry L2 ring machinery (E-2026-07-19-DS-CONVERGE-A L2 arm — the arm reading body MAX 0.073).
const RING_MACHINERY = { treadHalfMm: 0.005, flankReachMm: 1.3, flankRows: 30, flankGrade: 1.25 } as const;
const L2_NU = 2048;
const L2_BODY_STEP = 0.2;

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

/** crest (scale-center) z's = (k+0.5)/scaleRows * H, k=0..scaleRows-1 (the t-cusp lines). */
function crestZs(): number[] { const z: number[] = []; for (let k = 0; k < SCALE_ROWS; k++) z.push(((k + 0.5) / SCALE_ROWS) * DS_H); return z; }
/** interior ring z's = k/scaleRows * H, k=1..scaleRows-1 (the C0 jumps). */
function ringZsArr(): number[] { return dragonRings().map((r) => r.z); }

/** true perpendicular-3D distance of facet f to the exact single-valued analytic surface (GN foot), max over DENSE. */
function facetTrue3D(xyz: Float32Array, idx: Uint32Array, f: number, rA: AnalyticRadiusFn): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; let d = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
    const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
    const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
    const dd = projectPointToRadialSurface(px, py, pz, rA).dist; if (dd > d) d = dd;
  }
  return d;
}
/** facet centroid z. */
function centroidZ(xyz: Float32Array, idx: Uint32Array, f: number): number {
  return (xyz[3 * idx[3 * f] + 2] + xyz[3 * idx[3 * f + 1] + 2] + xyz[3 * idx[3 * f + 2] + 2]) / 3;
}
/** min |centroid z - ring z| (distance to nearest C0 ring). */
function dzToRing(zc: number, ringZs: number[]): number { let m = 1e9; for (const rz of ringZs) { const d = Math.abs(zc - rz); if (d < m) m = d; } return m; }
/** facet f STRADDLES a crest z iff min vert z <= crest <= max vert z for some crest — the cusp-chord facet set. */
function straddlesCrest(xyz: Float32Array, idx: Uint32Array, f: number, cZs: number[]): boolean {
  const za = xyz[3 * idx[3 * f] + 2], zb = xyz[3 * idx[3 * f + 1] + 2], zc = xyz[3 * idx[3 * f + 2] + 2];
  const lo = Math.min(za, zb, zc), hi = Math.max(za, zb, zc);
  for (const cz of cZs) if (cz >= lo && cz <= hi) return true;
  return false;
}
/** all 3 verts strictly one side of the nearest ring z (a continuous facet, no C0 crossing). */
function isSameSideRing(xyz: Float32Array, idx: Uint32Array, f: number, ringZs: number[]): boolean {
  const zc = centroidZ(xyz, idx, f);
  let rz = 0, bd = 1e9; for (const r of ringZs) { const d = Math.abs(zc - r); if (d < bd) { bd = d; rz = r; } }
  const za = xyz[3 * idx[3 * f] + 2] - rz, zb = xyz[3 * idx[3 * f + 1] + 2] - rz, zcc = xyz[3 * idx[3 * f + 2] + 2] - rz;
  return (za > 0 && zb > 0 && zcc > 0) || (za < 0 && zb < 0 && zcc < 0);
}

/** MAX true-3D over the apex-straddle facets (the direct cusp-chord metric U1 discriminates on). */
function crestStraddleMax(xyz: Float32Array, idx: Uint32Array, rA: AnalyticRadiusFn, cZs: number[]): { max: number; n: number; worstZ: number } {
  const nF = idx.length / 3; let mx = 0, n = 0, wz = 0;
  for (let f = 0; f < nF; f++) {
    if (!straddlesCrest(xyz, idx, f, cZs)) continue;
    n++;
    const d = facetTrue3D(xyz, idx, f, rA);
    if (d > mx) { mx = d; wz = centroidZ(xyz, idx, f); }
  }
  return { max: +mx.toFixed(6), n, worstZ: +wz.toFixed(4) };
}

/** GLOBAL reverse coverage: dense TRUE-surface (u,t) samples (one-sided near rings) -> nearest mesh distance.
 * SAME scan config as the adversarial B2a (nU1024 x nT2400, dz~0.05mm) so the number is directly comparable to 0.073. */
function revCoverageGlobal(
  loc: { dist: (x: number, y: number, z: number) => number }, rAos: AnalyticRadiusFn, nU = 1024, nT = 2400,
): { max: number; out: number; total: number; worstU: number; worstT: number } {
  let mx = 0, out = 0, wU = 0, wT = 0;
  for (let j = 0; j < nT; j++) {
    const z = (j / (nT - 1)) * DS_H;
    for (let i = 0; i < nU; i++) {
      const th = (i / nU) * TAU; const r = rAos(th, z);
      const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
      if (d > TOL) out++;
      if (d > mx) { mx = d; wU = i / nU; wT = z / DS_H; }
    }
  }
  return { max: +mx.toFixed(6), out, total: nU * nT, worstU: +wU.toFixed(4), worstT: +wT.toFixed(5) };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The ADAPTIVE (relief-aware) body t-schedule PROTOTYPE (proven here; productionized into
// buildDsRingTSchedule only after this closes). Ring machinery (tread pairs + flank ladders + rims) is REUSED
// verbatim from buildDsRingTSchedule with a huge bodyStepMm so its uniform body fill adds NOTHING; then we seed the
// crest cusp anchors t=(k+0.5)/scaleRows and adaptively fill every gap by curvature (recursive midpoint bisection on
// the radial chord sag, max over u-samples, until <= targetSagMm). Radial sag >= true-3D perpendicular sag on the
// gentle body (over-conservative), so a radial target below 0.01 lands true-3D below 0.01; the confirm measures the
// HONEST true-3D.
interface AdaptiveOpts { targetSagMm: number; uSamples: number; maxDepth: number }
function buildAdaptiveTRows(rA: AnalyticRadiusFn, opts: AdaptiveOpts): { tRows: number[]; ringAnchors: number[] } {
  // ring anchors only (bodyStepMm huge => no uniform body fill).
  const ringAnchors = buildDsRingTSchedule(DS_H, { ...RING_MACHINERY, bodyStepMm: 1e6 });
  const anchorSet = new Set<number>(ringAnchors);
  for (let k = 0; k < SCALE_ROWS; k++) anchorSet.add((k + 0.5) / SCALE_ROWS); // crest cusp lines
  const anchors = [...anchorSet].sort((a, b) => a - b);
  // u-samples across [0,1): dense enough to catch the scale-center cusp (16 scales => 16/scale at 256).
  const us: number[] = []; for (let i = 0; i < opts.uSamples; i++) us.push(i / opts.uSamples);
  const sagOfGap = (ta: number, tb: number): number => {
    const tm = 0.5 * (ta + tb); let mx = 0;
    for (const u of us) {
      const th = TAU * u;
      const ra = rA(th, ta * DS_H), rb = rA(th, tb * DS_H), rm = rA(th, tm * DS_H);
      const d = Math.abs(rm - 0.5 * (ra + rb)); if (d > mx) mx = d;
    }
    return mx;
  };
  const out: number[] = [];
  const fill = (ta: number, tb: number, depth: number): void => {
    // emit interior points of (ta,tb) then tb; ta is emitted by the caller.
    if (depth >= opts.maxDepth || sagOfGap(ta, tb) <= opts.targetSagMm) { out.push(tb); return; }
    const tm = 0.5 * (ta + tb);
    fill(ta, tm, depth + 1);
    fill(tm, tb, depth + 1);
  };
  out.push(anchors[0]);
  for (let i = 0; i + 1 < anchors.length; i++) fill(anchors[i], anchors[i + 1], 0);
  // dedup (float safety)
  const uniq: number[] = [];
  for (const t of out) { if (uniq.length === 0 || t - uniq[uniq.length - 1] > 1e-9) uniq.push(t); }
  return { tRows: uniq, ringAnchors };
}

function buildWall(nU: number, tRows: number[]): { rA: AnalyticRadiusFn; xyz: Float32Array; idx: Uint32Array; ut: number[]; tris: number; rows: number } {
  const rA = dsRadiusFn();
  const wall = buildDsRingStripWall(rA, DS_H, nU, tRows);
  return { rA, xyz: wall.vertices, idx: wall.indices, ut: wall.ut, tris: wall.indices.length / 3, rows: tRows.length };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('DS BODY-CLOSE — relief-aware body t-schedule closes the mid-body scale-relief residual', () => {
  // UNIT 1 (DISCRIMINATOR): which axis limits the mid-body residual — t (cusp) or u? Cheapest possible: measure the
  // apex-straddle facet true-3D MAX across a bodyStepMm ladder vs an nU ladder. Also reproduce the adversarial global
  // rev-coverage 0.073 on the baseline (anchors the number). NO src change — pure research.
  it.skipIf(process.env.PF_DSBODY_AXIS !== '1')('U1 AXIS — t-ladder vs u-ladder on the crest cusp', () => {
    plog(`=== U1 AXIS => ${NDJSON} ===`);
    const cZs = crestZs();
    const arms: Array<{ tag: string; nU: number; bodyStepMm: number }> = [
      { tag: 'base', nU: L2_NU, bodyStepMm: L2_BODY_STEP },
      { tag: 't0.1', nU: L2_NU, bodyStepMm: 0.1 },
      { tag: 't0.05', nU: L2_NU, bodyStepMm: 0.05 },
      { tag: 'u4096', nU: 4096, bodyStepMm: L2_BODY_STEP },
    ];
    for (const arm of arms) {
      const key = `U1|${arm.tag}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const tRows = buildDsRingTSchedule(DS_H, { ...RING_MACHINERY, bodyStepMm: arm.bodyStepMm });
      const m = buildWall(arm.nU, tRows);
      const cs = crestStraddleMax(m.xyz, m.idx, m.rA, cZs);
      plog(`[U1][${arm.tag}] nU=${arm.nU} bodyStep=${arm.bodyStepMm} rows=${m.rows} tris=${m.tris} crestStraddleMAX=${cs.max} (n=${cs.n} @z=${cs.worstZ})`);
      const row: Record<string, unknown> = { key, tag: arm.tag, nU: arm.nU, bodyStepMm: arm.bodyStepMm, rows: m.rows, tris: m.tris, crestStraddleMax: cs.max, straddleN: cs.n, worstZ: cs.worstZ };
      // baseline: also the full global rev-coverage (reproduce the adversarial 0.073).
      if (arm.tag === 'base') {
        const loc = buildArtifactLocator(m.xyz, m.idx);
        const rAos = oneSidedRA(m.rA, ringZsArr(), 1e-4);
        const rc = revCoverageGlobal(loc, rAos as unknown as AnalyticRadiusFn);
        plog(`[U1][base] GLOBAL rev-coverage MAX=${rc.max} out>${TOL}=${rc.out}/${rc.total} worst@u=${rc.worstU} t=${rc.worstT}`);
        row.revGlobalMax = rc.max; row.revGlobalOut = rc.out; row.revGlobalTotal = rc.total; row.revWorstT = rc.worstT; row.revWorstU = rc.worstU;
      }
      checkpoint(row);
    }
    plog('[U1] DONE');
  }, 180 * 60 * 1000);

  // UNIT 2 (CONFIRM): the ADAPTIVE-schedule arm vs the full kill-criterion.
  it.skipIf(process.env.PF_DSBODY_ADAPT !== '1')('U2 ADAPT — adaptive schedule closes GLOBAL true-3D to <=0.01', () => {
    plog(`=== U2 ADAPT => ${NDJSON} ===`);
    const key = 'U2|adaptive';
    if (keyExists(key)) { plog(`[skip] ${key}`); plog('[U2] DONE'); return; }
    const targetSagMm = process.env.PF_DSBODY_TARGET ? parseFloat(process.env.PF_DSBODY_TARGET) : 0.007;
    const nU = process.env.PF_DSBODY_NU ? parseInt(process.env.PF_DSBODY_NU, 10) : L2_NU;
    const rA0 = dsRadiusFn();
    const { tRows, ringAnchors } = buildAdaptiveTRows(rA0, { targetSagMm, uSamples: 256, maxDepth: 16 });
    const m = buildWall(nU, tRows);
    plog(`[U2] adaptive nU=${nU} targetSag=${targetSagMm} rows=${m.rows} (ringAnchors=${ringAnchors.length}) tris=${m.tris} (L2=3174400; 2xL2=6348800)`);
    const ringZs = ringZsArr();

    // (B) ring NO-REGRESS check 1: ring anchors ⊆ adaptive schedule (mechanism-identical rings).
    const tset = m.rows > 0 ? new Set(tRows.map((t) => Math.round(t / 1e-9))) : new Set<number>();
    let ringSubset = true; for (const ta of ringAnchors) if (!tset.has(Math.round(ta / 1e-9))) { ringSubset = false; break; }

    // (A) fwd true-3D over BODY facets (perFaceTrue3DSag whole mesh, then max over body = same-side & dz>0.05 to a ring).
    const sag = perFaceTrue3DSag(m.ut, m.idx, m.rA, DS_H, { preFilterMm: 0.005 });
    let bodyMax = 0, bwU = 0, bwT = 0, bodyN = 0, ringSameSideMax = 0;
    const nF = m.idx.length / 3;
    for (let f = 0; f < nF; f++) {
      const zc = centroidZ(m.xyz, m.idx, f);
      const dz = dzToRing(zc, ringZs);
      if (dz > 0.05) { // BODY facet
        bodyN++;
        if (sag.faceErr[f] > bodyMax) { bodyMax = sag.faceErr[f]; const a = m.idx[3 * f]; bwU = m.ut[2 * a]; bwT = m.ut[2 * a + 1]; }
      } else if (isSameSideRing(m.xyz, m.idx, f, ringZs)) { // near-ring SHOULDER (same-side, continuous)
        if (sag.faceErr[f] > ringSameSideMax) ringSameSideMax = sag.faceErr[f];
      }
    }
    plog(`[U2] fwd BODY true-3D MAX=${bodyMax.toFixed(6)} (bodyFacets=${bodyN}) worst@u=${bwU.toFixed(4)} t=${bwT.toFixed(5)}; near-ring SHOULDER same-side MAX=${ringSameSideMax.toFixed(6)}`);

    // (A) rev global coverage — the kill number (0 samples > 0.01).
    const loc = buildArtifactLocator(m.xyz, m.idx);
    const rAos = oneSidedRA(m.rA, ringZs, 1e-4);
    const rc = revCoverageGlobal(loc, rAos as unknown as AnalyticRadiusFn);
    plog(`[U2] GLOBAL rev-coverage MAX=${rc.max} out>${TOL}=${rc.out}/${rc.total} worst@u=${rc.worstU} t=${rc.worstT}`);

    // (B) tread-lip radii vs the TRUE one-sided limits (the deliberate treadHalfMm bracketing stays <0.01).
    let lipMax = 0, lipK = -1; const LIM = 1e-7, TH = 0.005;
    for (let k = 1; k < SCALE_ROWS; k++) {
      const zk = (k / SCALE_ROWS) * DS_H;
      for (let it = 0; it < 1024; it++) {
        const th = (it / 1024) * TAU;
        const lo = Math.abs(m.rA(th, zk - TH) - m.rA(th, zk - LIM));
        const hi = Math.abs(m.rA(th, zk + TH) - m.rA(th, zk + LIM));
        if (lo > lipMax) { lipMax = lo; lipK = k; } if (hi > lipMax) { lipMax = hi; lipK = k; }
      }
    }
    plog(`[U2] tread lip radius err vs TRUE one-sided limit MAX=${lipMax.toFixed(6)} (ring k${lipK})`);

    // (C) watertight (no Map cap) + NON-VACUOUS crack control.
    const wt = nonManRawBigStats(m.idx);
    const idx2 = Uint32Array.from(m.idx);
    const bumped = new Float32Array(m.xyz.length + 3); bumped.set(m.xyz);
    const newV = m.xyz.length / 3;
    bumped[3 * newV] = m.xyz[3 * idx2[0]] + 5; bumped[3 * newV + 1] = m.xyz[3 * idx2[0] + 1]; bumped[3 * newV + 2] = m.xyz[3 * idx2[0] + 2];
    idx2[0] = newV;
    const wtCrack = nonManRawBigStats(idx2);
    plog(`[U2] watertight nonMan=${wt.nonMan} boundary=${wt.boundary} | CRACK CONTROL nonMan=${wtCrack.nonMan} boundary=${wtCrack.boundary} (MUST differ)`);

    // secondary: slivers.
    const q = triangleQualityDistribution({ vertices: m.xyz, indices: m.idx });
    plog(`[U2] slivers %<20deg=${q.pctBelow20.toFixed(2)} minAngle=${q.minAngleDeg.toFixed(3)}`);

    const closed = rc.max <= TOL && rc.out === 0 && bodyMax <= TOL;
    checkpoint({
      key, nU, targetSagMm, rows: m.rows, tris: m.tris, budget2xL2: 6348800, ringAnchors: ringAnchors.length, ringSubset,
      fwdBodyMax: +bodyMax.toFixed(6), bodyFacets: bodyN, fwdBodyWorst: { u: +bwU.toFixed(4), t: +bwT.toFixed(5) },
      ringSameSideMax: +ringSameSideMax.toFixed(6), treadLipMax: +lipMax.toFixed(6), treadLipRing: lipK,
      revGlobalMax: rc.max, revGlobalOut: rc.out, revGlobalTotal: rc.total, revWorst: { u: rc.worstU, t: rc.worstT },
      nonMan: wt.nonMan, boundary: wt.boundary, crackNonMan: wtCrack.nonMan, crackBoundary: wtCrack.boundary,
      pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3),
      CLOSED: closed,
    });
    plog(`[U2] DONE — CLOSED=${closed}`);
  }, 180 * 60 * 1000);

  // UNIT 2B (WALL-vs-BUDGET): U2 MOVED the body 5.3x but the residual RELOCATED to the scale-TIP CONE points
  // (u,t)=(scale-center, crest) — a 2D C1 singularity (scaleShape ~= 1.5*sqrt(xDist^2+yDist^2) near the apex => a
  // radial cone point). A uniform-nU structured grid can only refine u GLOBALLY. Escalate (nU, targetSag) to decide:
  // does the tip fwd MAX drop toward 0.01 with density (budget-starvation, closable) or FLOOR (a convergence wall)?
  // Plus a LOCAL tip mini-ladder (halve u-cell vs t-cell AT the tip) to attribute the residual axis post-anchor.
  it.skipIf(process.env.PF_DSBODY_ESC !== '1')('U2B ESCALATE — tip cone floor vs budget (nU x targetSag sweep + tip axis)', () => {
    plog(`=== U2B ESCALATE => ${NDJSON} ===`);
    const ringZs = ringZsArr();
    const bodyMaxOf = (m: { xyz: Float32Array; idx: Uint32Array; ut: number[]; rA: AnalyticRadiusFn }): { max: number; u: number; t: number } => {
      const sag = perFaceTrue3DSag(m.ut, m.idx, m.rA, DS_H, { preFilterMm: 0.005 });
      let mx = 0, wu = 0, wt = 0; const nF = m.idx.length / 3;
      for (let f = 0; f < nF; f++) {
        if (dzToRing(centroidZ(m.xyz, m.idx, f), ringZs) <= 0.05) continue;
        if (sag.faceErr[f] > mx) { mx = sag.faceErr[f]; const a = m.idx[3 * f]; wu = m.ut[2 * a]; wt = m.ut[2 * a + 1]; }
      }
      return { max: +mx.toFixed(6), u: +wu.toFixed(4), t: +wt.toFixed(5) };
    };
    // (nU, targetSag) sweep: finer-t only, finer-u only, both, both-much (budget in tris reported vs 2xL2=6.35M).
    const arms: Array<{ tag: string; nU: number; target: number }> = [
      { tag: 'nU2048_t0.003', nU: 2048, target: 0.003 },
      { tag: 'nU4096_t0.007', nU: 4096, target: 0.007 },
      { tag: 'nU4096_t0.003', nU: 4096, target: 0.003 },
      { tag: 'nU8192_t0.003', nU: 8192, target: 0.003 },
    ];
    const rA0 = dsRadiusFn();
    for (const arm of arms) {
      const key = `U2B|${arm.tag}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const { tRows } = buildAdaptiveTRows(rA0, { targetSagMm: arm.target, uSamples: 256, maxDepth: 18 });
      const m = buildWall(arm.nU, tRows);
      const bm = bodyMaxOf(m);
      plog(`[U2B][${arm.tag}] nU=${arm.nU} target=${arm.target} rows=${m.rows} tris=${m.tris} fwdBodyMAX=${bm.max} @u=${bm.u} t=${bm.t}`);
      checkpoint({ key, tag: arm.tag, nU: arm.nU, targetSagMm: arm.target, rows: m.rows, tris: m.tris, over2xL2: m.tris > 6348800, fwdBodyMax: bm.max, worst: { u: bm.u, t: bm.t } });
    }
    plog('[U2B] DONE');
  }, 180 * 60 * 1000);

  // UNIT 3 (RENDER): before/after true-3D heatmap of a crest band (visual evidence). Small band => legible PNG.
  it.skipIf(process.env.PF_DSBODY_RENDER !== '1')('U3 RENDER — before/after crest-band true-3D heatmap', () => {
    plog(`=== U3 RENDER => ${RENDER_DIR} ===`);
    mkdirSync(RENDER_DIR, { recursive: true });
    const rA0 = dsRadiusFn();
    const nU = L2_NU; // render at the real L2 resolution (nU512 u-chord swamps the t-cusp story)
    const T_LO = 0.77, T_HI = 0.865; // RING-FREE crest window: crest k6 (0.8125), no ring (k6=0.75, k7=0.875 excluded)
    const ringZs = ringZsArr();
    // Crop to a body-only t-band (exclude ring-crossing tread quads — invalid under single-valued rA) so the
    // ridgeline/tip detail is legible; remap to a dense submesh.
    const crop = (m: { xyz: Float32Array; idx: Uint32Array; ut: number[] }): { xyz: Float32Array; idx: Uint32Array; ut: number[] } => {
      const remap = new Int32Array(m.xyz.length / 3).fill(-1);
      const xyz: number[] = []; const ut: number[] = []; const idx: number[] = [];
      const nF = m.idx.length / 3;
      for (let f = 0; f < nF; f++) {
        const zc = centroidZ(m.xyz, m.idx, f) / DS_H;
        if (zc < T_LO || zc > T_HI) continue;
        if (dzToRing(centroidZ(m.xyz, m.idx, f), ringZs) <= 0.05) continue; // drop ring-band facets
        for (let e = 0; e < 3; e++) {
          const v = m.idx[3 * f + e];
          if (remap[v] < 0) { remap[v] = xyz.length / 3; xyz.push(m.xyz[3 * v], m.xyz[3 * v + 1], m.xyz[3 * v + 2]); ut.push(m.ut[2 * v], m.ut[2 * v + 1]); }
          idx.push(remap[v]);
        }
      }
      return { xyz: Float32Array.from(xyz), idx: Uint32Array.from(idx), ut };
    };
    // BEFORE: geometric uniform body (L2 schedule). AFTER: adaptive schedule.
    const before = crop(buildWall(nU, buildDsRingTSchedule(DS_H, { ...RING_MACHINERY, bodyStepMm: L2_BODY_STEP })));
    const { tRows } = buildAdaptiveTRows(rA0, { targetSagMm: 0.007, uSamples: 256, maxDepth: 16 });
    const after = crop(buildWall(nU, tRows));
    const sB = dumpHeatmap(RENDER_DIR, 'body_before', before.xyz, before.ut, before.idx, rA0, DS_H, { scaleMm: 0.05, meta: { arm: 'before/uniform0.2', band: `t[${T_LO},${T_HI}]`, nU } });
    const sA = dumpHeatmap(RENDER_DIR, 'body_after', after.xyz, after.ut, after.idx, rA0, DS_H, { scaleMm: 0.05, meta: { arm: 'after/adaptive', band: `t[${T_LO},${T_HI}]`, nU } });
    plog(`[U3] band t[${T_LO},${T_HI}] nU=${nU}: before worst=${sB.worstMm.toFixed(5)} tris=${before.idx.length / 3}; after worst=${sA.worstMm.toFixed(5)} tris=${after.idx.length / 3}`);
    plog(`[U3] render: NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs ${join(RENDER_DIR, 'body.png')} ${RENDER_DIR} 2 body_before body_after`);
    plog('[U3] DONE');
  }, 60 * 60 * 1000);
});
