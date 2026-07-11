// _tierc_armD_qualdiag.test.ts — Arm D quality-miss DIAGNOSIS (coordinator follow-up to the
// E-2026-07-11-TIERC-HEADTOHEAD Arm D FAIL verdict; written finding:
// research/lab/tierc/armD-quality-diagnosis.md).
//
// QUESTION (coordinator, verbatim): is the +0.1pp %<20deg miss float-provenance noise (GPU-f32
// captured baseline vs CPU-f64 twin flipping bin-edge triangles) or a structural quality difference
// in the region-layer build?
//
// DIAGNOSIS ONLY — never calls scoreAllGates, never appends to gates.ndjson, does not modify
// _tierc_armD.test.ts or tierc_regionLayer.ts. Writes research/exchange/tierc/armD_qualdiag.json.
//
// v2 (this file): the v1 run's correspondence came back BIMODAL (49.4% of full-mesh triangles
// centroid-matched within 1e-4mm, 0.34% in (1e-4,5e-4], 50.3% beyond 5e-4mm) — impossible for smooth
// float noise (empty middle band) and diagnostic of a systematically displaced surface population.
// Root cause FOUND by direct read of tierc_regionLayer.ts's evaluatePackedAssemblyToXyz (:220-221,
// :238-245, :261-268): the INNER branch passes tRadius=zHeight/H into innerR, which RE-APPLIES the
// tBottom + t*(H-tBottom) mapping — a DOUBLE z-mapping. The WGSL reference (adaptive_mesh.wgsl:790-800
// INNER, :830-847 BOTTOM-TOP; compute_inner_radius = compute_outer_radius(theta,t)-tWall evaluated at
// z=t*H) evaluates the radius at zHeight directly. So the SCORED Arm D twin's inner-wall (+ bottom-top)
// radii were evaluated at z' = tBottom + (zHeight/H)*(H-tBottom) != zHeight — up to 2.925mm evaluation-z
// offset at the inner-wall bottom at the pinned dims, tapering to 0 at the rim (t=1 is the double-map's
// fixed point, so RIM is accidentally correct). The mesher's SAMPLERS (buildRegionWallGridCPU) apply
// the mapping ONCE (correct, matches buildWallGridCPU + WGSL) — so topology/refinement are untainted;
// only the final full-mesh 3D evaluation of inner/bottom-top-owned vertices is wrong in the scored row.
//
// This file therefore scores THREE meshes on the identical metric basis:
//   captured  — the production artifact bins, f32 xyz verbatim (the baseline the scored row compared to)
//   scoredTwin — the packed assembly evaluated with the SCORED (buggy) evaluator, imported from
//                tierc_regionLayer.ts — reproduces the scored Arm D quality row's exact population
//   fixedTwin  — the SAME packed assembly evaluated with the CORRECTED single-mapping evaluator
//                (local to this file) — the clean provenance-noise-only comparison basis
// The packed assembly is rebuilt by replicating buildSingleRCdtRegion's exported building blocks and
// HASH-ASSERTED against the scored run's own crumb fingerprint (bf78f51f-693eeace) — the diagnosis
// provably measures the scored mesh.
//
// Min-angle math REPLICATES src/fidelity/metrics.ts triangleQualityDistribution EXACTLY (dist2 ->
// lawOfCosines x3 -> min; area floor 1e-12) — re-derived because those helpers are module-private
// (same "reimplement + cite" rule as tierc_gatesHarness.ts's zeroAreaCount). NOTE for reading scored
// rows: that metric ROUNDS pctBelow* to 1 decimal (round1, metrics.ts:824) — the scored "16.8 vs 16.7"
// is quantized reporting; everything here is UNROUNDED.
//
// Env-gated: PF_TIERC_ARMD_QUALDIAG=1. Run:
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_ARMD_QUALDIAG=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_armD_qualdiag.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionWallGridCPU, evaluatePackedAssemblyToXyz } from './tierc_regionLayer';
import { loadBinMesh } from './_pf_bvhRuler';
import type { BinMesh } from './tierc_gatesHarness';
import type { AnalyticRadiusFn } from './labkit';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM, AF_RDRAIN, fnvHash } from './_analytic_floor_lib';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { buildCreaseRefineLines } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';

const ON = process.env.PF_TIERC_ARMD_QUALDIAG === '1';
const CAPTURE_DIR = join('research', 'exchange', '_prod_truth', 'FourierBloom');
const OUT_DIR = join('research', 'exchange', 'tierc');
const OUT_JSON = join(OUT_DIR, 'armD_qualdiag.json');
const SCORED_TWIN_HASH = 'bf78f51f-693eeace'; // armD_crumbs.ndjson stage:"build-done"
const TAU = Math.PI * 2;

// ── metrics.ts replication (see header) ───────────────────────────────────────────────────────────
function lawOfCosines(adj1: number, adj2: number, opp: number): number {
  if (adj1 <= 0 || adj2 <= 0) return 0;
  let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  if (cos > 1) cos = 1;
  if (cos < -1) cos = -1;
  return (Math.acos(cos) * 180) / Math.PI;
}

interface AnglePop {
  angles: Float64Array; // per facet; -1 = degenerate (excluded from `good`)
  good: number;
  degenerate: number;
}

function minAngles(mesh: BinMesh): AnglePop {
  const { xyz, idx } = mesh;
  const nF = idx.length / 3;
  const angles = new Float64Array(nF).fill(-1);
  let good = 0;
  let degenerate = 0;
  for (let t = 0; t < nF; t++) {
    const ia = idx[3 * t] * 3, ib = idx[3 * t + 1] * 3, ic = idx[3 * t + 2] * 3;
    const ax = xyz[ia], ay = xyz[ia + 1], az = xyz[ia + 2];
    const bx = xyz[ib], by = xyz[ib + 1], bz = xyz[ib + 2];
    const cx = xyz[ic], cy = xyz[ic + 1], cz = xyz[ic + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const area = 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    if (area <= 1e-12) {
      degenerate++;
      continue;
    }
    const ab2 = abx * abx + aby * aby + abz * abz;
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
    const bc2 = bcx * bcx + bcy * bcy + bcz * bcz;
    const ca2 = acx * acx + acy * acy + acz * acz;
    const a = Math.sqrt(bc2), b = Math.sqrt(ca2), c = Math.sqrt(ab2);
    angles[t] = Math.min(lawOfCosines(b, c, a), lawOfCosines(a, c, b), lawOfCosines(a, b, c));
    good++;
  }
  return { angles, good, degenerate };
}

/** 0.5-degree histogram over [0,60] (120 bins; bin k = [k/2,(k+1)/2)). */
function halfDegHist(pop: AnglePop): number[] {
  const hist = new Array<number>(120).fill(0);
  for (let t = 0; t < pop.angles.length; t++) {
    const ang = pop.angles[t];
    if (ang < 0) continue;
    let bin = Math.floor(ang * 2);
    if (bin < 0) bin = 0;
    else if (bin > 119) bin = 119;
    hist[bin]++;
  }
  return hist;
}

function pctBelowUnrounded(pop: AnglePop, deg: number): { count: number; pct: number } {
  let n = 0;
  for (let t = 0; t < pop.angles.length; t++) {
    const ang = pop.angles[t];
    if (ang >= 0 && ang < deg) n++;
  }
  return { count: n, pct: (n / pop.good) * 100 };
}

// ── CORRECTED evaluator (single z-mapping — the WGSL-faithful version; see header) ────────────────
const MIN_INNER_R_MM = 0.5;
function evalPackedCorrected(
  vertices: Float32Array,
  rA: AnalyticRadiusFn,
  H: number,
  tWallMm: number,
  tBottomMm: number,
  rDrainMm: number,
): Float32Array {
  const nV = vertices.length / 3;
  const out = new Float32Array(nV * 3);
  const outerRAtZ = (theta: number, z: number): number => rA(theta, z);
  const innerRAtZ = (theta: number, z: number): number =>
    Math.max(rA(theta, z) - tWallMm, MIN_INNER_R_MM);
  for (let v = 0; v < nV; v++) {
    const base = v * 3;
    const u = vertices[base] - Math.floor(vertices[base]);
    const t = vertices[base + 1];
    const surface = vertices[base + 2];
    const theta = u * TAU;
    let x = 0, y = 0, z = 0;
    if (surface < 0.5) {
      const r = outerRAtZ(theta, t * H);
      z = t * H;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 1.5) {
      const zHeight = tBottomMm + t * (H - tBottomMm);
      const r = innerRAtZ(theta, zHeight); // ONE mapping — the fix
      z = zHeight;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 2.5) {
      const rInner = innerRAtZ(theta, H);
      const rOuter = outerRAtZ(theta, H);
      const r = rInner + (rOuter - rInner) * t;
      z = H;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 3.5) {
      const rOuter = outerRAtZ(theta, 0);
      const r = rOuter + (rDrainMm - rOuter) * t;
      z = 0;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 4.5) {
      const rInner = innerRAtZ(theta, tBottomMm); // t_radius_bot*H = tBottom — the fix
      const r = rInner + (rDrainMm - rInner) * t;
      z = tBottomMm;
      x = r * Math.cos(theta);
      y = r * Math.sin(theta);
    } else if (surface < 5.5) {
      z = t * tBottomMm;
      x = rDrainMm * Math.cos(theta);
      y = rDrainMm * Math.sin(theta);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      x = 0.001;
      y = 0.001;
      z = 0.001;
    }
    out[base] = x;
    out[base + 1] = y;
    out[base + 2] = z;
  }
  return out;
}

// ── centroid correspondence (cell 5e-4mm, 27-neighbour scan ⇒ complete to 5e-4; primary tol 1e-4) ──
const CELL_MM = 5e-4;
const MATCH_TOL_MM = 1e-4;
const THRESHOLDS = [10, 20, 30] as const;

function cellKey(qx: number, qy: number, qz: number): number {
  return (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) | 0;
}

function centroids(mesh: BinMesh): Float64Array {
  const nF = mesh.idx.length / 3;
  const c = new Float64Array(nF * 3);
  for (let t = 0; t < nF; t++) {
    const ia = mesh.idx[3 * t] * 3, ib = mesh.idx[3 * t + 1] * 3, ic = mesh.idx[3 * t + 2] * 3;
    c[3 * t] = (mesh.xyz[ia] + mesh.xyz[ib] + mesh.xyz[ic]) / 3;
    c[3 * t + 1] = (mesh.xyz[ia + 1] + mesh.xyz[ib + 1] + mesh.xyz[ic + 1]) / 3;
    c[3 * t + 2] = (mesh.xyz[ia + 2] + mesh.xyz[ib + 2] + mesh.xyz[ic + 2]) / 3;
  }
  return c;
}

interface StraddleRow {
  deg: number;
  capturedHighTwinLow: number; // matched pair: captured >= deg, twin < deg
  capturedLowTwinHigh: number; // matched pair: captured < deg, twin >= deg
  unmatchedTwinBelow: number;
  unmatchedCapturedBelow: number;
}

interface Correspondence {
  matched: number;
  looseBand: number; // nearest in (1e-4, 5e-4] — sensitivity, counted within unmatched
  unmatchedTwin: number;
  unmatchedCaptured: number;
  duplicateTargets: number;
  angleDeltaGt05: number;
  worstAngleDelta: number;
  straddle: StraddleRow[];
}

function correspond(captured: BinMesh, capA: AnglePop, twin: BinMesh, twinA: AnglePop): Correspondence {
  const capC = centroids(captured);
  const twinC = centroids(twin);
  const nCap = captured.idx.length / 3;
  const nTwin = twin.idx.length / 3;

  const map = new Map<number, number[]>();
  for (let t = 0; t < nCap; t++) {
    const k = cellKey(
      Math.round(capC[3 * t] / CELL_MM),
      Math.round(capC[3 * t + 1] / CELL_MM),
      Math.round(capC[3 * t + 2] / CELL_MM),
    );
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }

  const capMatchCount = new Uint8Array(nCap);
  const straddle: StraddleRow[] = THRESHOLDS.map((deg) => ({
    deg, capturedHighTwinLow: 0, capturedLowTwinHigh: 0, unmatchedTwinBelow: 0, unmatchedCapturedBelow: 0,
  }));
  const res: Correspondence = {
    matched: 0, looseBand: 0, unmatchedTwin: 0, unmatchedCaptured: 0, duplicateTargets: 0,
    angleDeltaGt05: 0, worstAngleDelta: 0, straddle,
  };
  const tol2 = MATCH_TOL_MM * MATCH_TOL_MM;
  const loose2 = CELL_MM * CELL_MM;

  for (let t = 0; t < nTwin; t++) {
    const x = twinC[3 * t], y = twinC[3 * t + 1], z = twinC[3 * t + 2];
    const qx = Math.round(x / CELL_MM), qy = Math.round(y / CELL_MM), qz = Math.round(z / CELL_MM);
    let bestD2 = Infinity;
    let best = -1;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = map.get(cellKey(qx + dx, qy + dy, qz + dz));
          if (!list) continue;
          for (const c of list) {
            const ddx = capC[3 * c] - x, ddy = capC[3 * c + 1] - y, ddz = capC[3 * c + 2] - z;
            const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = c;
            }
          }
        }
      }
    }
    const ta = twinA.angles[t];
    if (best >= 0 && bestD2 <= tol2) {
      res.matched++;
      if (capMatchCount[best] === 1) res.duplicateTargets++;
      if (capMatchCount[best] < 255) capMatchCount[best]++;
      const ca = capA.angles[best];
      if (ca >= 0 && ta >= 0) {
        const d = Math.abs(ca - ta);
        if (d > 0.5) res.angleDeltaGt05++;
        if (d > res.worstAngleDelta) res.worstAngleDelta = d;
        for (const row of straddle) {
          if (ca >= row.deg && ta < row.deg) row.capturedHighTwinLow++;
          else if (ca < row.deg && ta >= row.deg) row.capturedLowTwinHigh++;
        }
      }
    } else {
      if (best >= 0 && bestD2 <= loose2) res.looseBand++;
      res.unmatchedTwin++;
      if (ta >= 0) for (const row of straddle) if (ta < row.deg) row.unmatchedTwinBelow++;
    }
  }
  for (let c = 0; c < nCap; c++) {
    if (capMatchCount[c] === 0) {
      res.unmatchedCaptured++;
      const ca = capA.angles[c];
      if (ca >= 0) for (const row of straddle) if (ca < row.deg) row.unmatchedCapturedBelow++;
    }
  }
  return res;
}

describe.skipIf(!ON)('Arm D quality-miss diagnosis — captured vs scored-twin vs corrected-twin', () => {
  it(
    'histograms + bin-edge analysis + centroid correspondence on all three bases',
    () => {
      // 1. Captured production artifact (FULL mesh — the scored quality row's population).
      const captured = loadBinMesh(join(CAPTURE_DIR, 'full.xyz.bin'), join(CAPTURE_DIR, 'full.idx.bin'));
      console.log(`[qualdiag] captured full: ${captured.idx.length / 3} tris`);

      // 2. Rebuild the packed assembly — replicates buildSingleRCdtRegion's exported building blocks
      // verbatim (zero-curve FourierBloom path), hash-asserted against the scored run's fingerprint.
      const manifest = getManifest('FourierBloom');
      const rA = manifest.truth.rA;
      const dims = TIERC_COMMON_DIMS;
      const t0 = Date.now();
      const outerGrid = buildRegionWallGridCPU(rA, 0, dims, AF_TWALL, AF_TBOTTOM, 256);
      const innerGrid = buildRegionWallGridCPU(rA, 1, dims, AF_TWALL, AF_TBOTTOM, 256);
      const creaseChoice = chooseCreaseGrid([]);
      const creaseTChoice = chooseCreaseTGrid([]);
      const helixChoice = chooseHelixGrid(0, 0, 0);
      const creaseLinesAll = buildCreaseRefineLines(
        { styleId: manifest.styleId, lines: [], groundTruthCount: 0 },
        { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
      );
      const assemblyOpts: AssemblyWallOptions = {
        maxSagMm: AF_PROD_OPTS.maxSagMm,
        maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
        minEdgeMm: AF_PROD_OPTS.minEdgeMm,
        gradeRatio: AF_PROD_OPTS.gradeRatio,
        maxLevel: AF_PROD_OPTS.maxLevel,
        resU: 128,
        resT: 128,
        nRing: AF_PROD_OPTS.nRing,
        targetTriangles: AF_PROD_OPTS.targetTriangles,
        budgetMode: AF_PROD_OPTS.budgetMode,
        minUniformLevel: resolveUniformLevelOverride(
          Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level),
          0,
        ),
        uBias: computeUBias(outerGrid.sampler, false),
        featureLevel: AF_PROD_OPTS.featureLevel,
        outerCreaseLines: creaseLinesAll.length > 0 ? creaseLinesAll : undefined,
        outerEfgSampler: composedWallSampler(outerGrid.sampler, {
          uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
        }),
        innerEfgSampler: composedWallSampler(innerGrid.sampler, {
          uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
        }),
      };
      const asm = assembleWatertight(
        outerGrid.sampler,
        innerGrid.sampler,
        { H: dims.H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN },
        assemblyOpts,
      );
      const hash = fnvHash(asm.vertices, asm.indices);
      console.log(`[qualdiag] assembly rebuilt in ${((Date.now() - t0) / 1000).toFixed(1)}s: hash=${hash} tris=${asm.indices.length / 3}`);
      expect(hash).toBe(SCORED_TWIN_HASH); // determinism gate — measuring the scored mesh, provably

      // 3. Evaluate BOTH ways: the scored (buggy, double-mapped inner z) evaluator imported from the
      // region layer, and the corrected (single-mapped) local one.
      const scoredXyz = evaluatePackedAssemblyToXyz(asm.vertices, rA, dims.H, AF_TWALL, AF_TBOTTOM, AF_RDRAIN);
      const fixedXyz = evalPackedCorrected(asm.vertices, rA, dims.H, AF_TWALL, AF_TBOTTOM, AF_RDRAIN);
      // Bug magnitude: per-vertex displacement between the two evaluations.
      let movedVerts = 0;
      let maxDispMm = 0;
      for (let v = 0; v < scoredXyz.length; v += 3) {
        const d = Math.hypot(
          scoredXyz[v] - fixedXyz[v],
          scoredXyz[v + 1] - fixedXyz[v + 1],
          scoredXyz[v + 2] - fixedXyz[v + 2],
        );
        if (d > 1e-9) movedVerts++;
        if (d > maxDispMm) maxDispMm = d;
      }
      console.log(
        `[qualdiag] evaluator-bug magnitude: movedVerts=${movedVerts}/${scoredXyz.length / 3} maxDispMm=${maxDispMm.toFixed(4)}`,
      );

      const scoredTwin: BinMesh = { xyz: scoredXyz, idx: asm.indices };
      const fixedTwin: BinMesh = { xyz: fixedXyz, idx: asm.indices };

      // 4. Angle populations + histograms + unrounded checkpoints, all three bases.
      const capA = minAngles(captured);
      const scoredA = minAngles(scoredTwin);
      const fixedA = minAngles(fixedTwin);
      const bases = [
        { name: 'captured', pop: capA },
        { name: 'scoredTwin', pop: scoredA },
        { name: 'fixedTwin', pop: fixedA },
      ] as const;
      const checkpoints = THRESHOLDS.map((deg) => {
        const row: Record<string, unknown> = { deg };
        for (const b of bases) row[b.name] = pctBelowUnrounded(b.pop, deg);
        return row;
      });
      for (const c of checkpoints) {
        const cap = c.captured as { pct: number };
        const sc = c.scoredTwin as { pct: number };
        const fx = c.fixedTwin as { pct: number };
        console.log(
          `[qualdiag] pctBelow${String(c.deg)}: captured=${cap.pct.toFixed(4)}% scored=${sc.pct.toFixed(4)}% ` +
            `(d=${(sc.pct - cap.pct).toFixed(4)}pp) fixed=${fx.pct.toFixed(4)}% (d=${(fx.pct - cap.pct).toFixed(4)}pp)`,
        );
      }

      // 5. Correspondences: captured<->scored (explains the SCORED row) and captured<->fixed (the
      // clean provenance-only basis the verdict rests on).
      const tC = Date.now();
      const corrScored = correspond(captured, capA, scoredTwin, scoredA);
      const corrFixed = correspond(captured, capA, fixedTwin, fixedA);
      console.log(
        `[qualdiag] corr(scored): matched=${corrScored.matched} loose=${corrScored.looseBand} ` +
          `unmatchedTwin=${corrScored.unmatchedTwin} unmatchedCap=${corrScored.unmatchedCaptured} | ` +
          `corr(fixed): matched=${corrFixed.matched} loose=${corrFixed.looseBand} ` +
          `unmatchedTwin=${corrFixed.unmatchedTwin} unmatchedCap=${corrFixed.unmatchedCaptured} ` +
          `dAngle>0.5=${corrFixed.angleDeltaGt05} worstDAngle=${corrFixed.worstAngleDelta.toFixed(4)} ` +
          `(${((Date.now() - tC) / 1000).toFixed(1)}s)`,
      );
      for (const row of corrFixed.straddle) {
        console.log(
          `[qualdiag] fixed straddle@${row.deg}: capHigh->twinLow=${row.capturedHighTwinLow} ` +
            `capLow->twinHigh=${row.capturedLowTwinHigh} unmatchedTwin<${row.deg}=${row.unmatchedTwinBelow} ` +
            `unmatchedCap<${row.deg}=${row.unmatchedCapturedBelow}`,
        );
      }

      // 6. Dump for the written report.
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        OUT_JSON,
        JSON.stringify(
          {
            at: new Date().toISOString(),
            version: 2,
            twinHash: hash,
            evaluatorBug: {
              movedVerts,
              totalVerts: scoredXyz.length / 3,
              maxDispMm,
              note:
                'scoredTwin = evaluatePackedAssemblyToXyz (tierc_regionLayer.ts) with the double z-mapping ' +
                'bug on INNER/BOTTOM-TOP; fixedTwin = corrected single-mapping evaluator (this file).',
            },
            counts: {
              capturedTris: captured.idx.length / 3,
              twinTris: asm.indices.length / 3,
              capturedGood: capA.good,
              scoredGood: scoredA.good,
              fixedGood: fixedA.good,
              capturedDegenerate: capA.degenerate,
              scoredDegenerate: scoredA.degenerate,
              fixedDegenerate: fixedA.degenerate,
            },
            checkpoints,
            hist05: {
              captured: halfDegHist(capA),
              scoredTwin: halfDegHist(scoredA),
              fixedTwin: halfDegHist(fixedA),
            },
            correspondence: { scored: corrScored, fixed: corrFixed },
          },
          null,
          2,
        ),
      );
      console.log(`[qualdiag] written: ${OUT_JSON}`);
    },
    15 * 60 * 1000,
  );
});
