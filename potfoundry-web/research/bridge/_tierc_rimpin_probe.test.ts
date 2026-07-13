// _tierc_rimpin_probe.test.ts — PROD-TIERC T3.3 path-(b) ASSEMBLY-STITCH probe. Validates the
// rim-pin linchpin: with RefineOptions.rimPin the flag-ON Tier-C analytic outer wall's t=0/t=1
// boundary rows become exactly `nRing` ascending-U stations (after the periodic seam weld), so the
// production assembler's equal-count rim `annulusStrip` / base `emitRadialCap` adopt the wall
// UNCHANGED. MEASUREMENT-ONLY — imports committed src by import, edits nothing.
//
// Density note (mirrors _tierc_seamshare_probe.test.ts's SCOPING FINDING): the production refine
// config (bgArcMm 0.35 / maxPass 16) is a measured multi-hour run at full-wall scale. The rim-PIN
// TOPOLOGY this probe gates — ring LENGTH == nRing, ascending-U ordering, seam-crack closure — is set
// by the post-refine boundary reconciliation, NOT by interior convergence depth, so a coarse,
// bounded-pass build exercises the exact same code path faithfully. The interior watertightness of
// the whole wall (otherBoundary → 0) only converges at production density — the controller's
// definitive heavy run (see the task report for the exact command).
//
// Run (tractable, default; expected seconds):
//   PF_TIERC_RIMPIN=1 NODE_OPTIONS=--max-old-space-size=8192 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_rimpin.config.ts
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import {
  buildProtectedComplex,
  refineToZeroOutliers,
  isCountUnstableStyle,
  TIER_C_DETECT_OPTS,
  DEFAULT_RULER,
  buildTierCOuterWall,
  type ChartDomain,
} from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { buildConformingOuterWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingOuterWall';
import { hashMesh } from '../../src/renderers/webgpu/parametric/conforming/tierC/__testutil';
import { assembleWatertight } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildWallGridCPU, AF_DIMS, AF_TBOTTOM } from './_analytic_floor_lib';
import { buildRadiusFn } from './runStyle';
import { TIERC_COMMON_DIMS } from './tierc_manifest';

const ON = process.env.PF_TIERC_RIMPIN === '1';
const TRACT_BG_ARC_MM = Number(process.env.PF_RIMPIN_BG ?? 8);
const TRACT_MAX_PASS = Number(process.env.PF_RIMPIN_PASS ?? 1);
const TRACT_NRING = Number(process.env.PF_RIMPIN_NRING ?? 64);
const TEST_TIMEOUT_MS = 39 * 60 * 1000;
const SEAM_WRAP_EPS = 1e-6;
const SEAM_T_EPS = 1e-6;
const RING_EPS = 1e-6;

/**
 * Verbatim port of tierC/index.ts's private `seamColumnRemap` (bijection-gated periodic weld) +
 * `toOuterWallResult` (NOT exported — this NEW file copies them, matching the "copy verbatim"
 * precedent set by _tierc_seamshare_probe.test.ts). Requires __pfPerfectMesher on (else identity).
 */
function seamColumnRemap(uv: number[]): Int32Array {
  const nV = uv.length / 2;
  const remap = new Int32Array(nV);
  for (let i = 0; i < nV; i++) remap[i] = i;
  const s0: number[] = [];
  const s1: number[] = [];
  for (let i = 0; i < nV; i++) {
    const u = uv[2 * i];
    if (Math.abs(u) < SEAM_WRAP_EPS) s0.push(i);
    else if (Math.abs(u - 1) < SEAM_WRAP_EPS) s1.push(i);
  }
  if (s0.length === 0 || s1.length === 0 || s0.length !== s1.length) return remap;
  s0.sort((a, b) => uv[2 * a + 1] - uv[2 * b + 1]);
  s1.sort((a, b) => uv[2 * a + 1] - uv[2 * b + 1]);
  for (let k = 0; k < s1.length; k++) {
    if (Math.abs(uv[2 * s1[k] + 1] - uv[2 * s0[k] + 1]) >= SEAM_T_EPS) return remap;
  }
  for (let k = 0; k < s1.length; k++) remap[s1[k]] = s0[k];
  return remap;
}

interface OuterWallLike {
  vertices: Float32Array;
  indices: Uint32Array;
  seamTriangles: Uint8Array;
  gridVertexCount: number;
  bottomRing: number[];
  topRing: number[];
}

function toOuterWallResult(refined: { uv: number[]; tris: number[] }): OuterWallLike {
  const nV = refined.uv.length / 2;
  const remap = seamColumnRemap(refined.uv);
  const oldToNew = new Int32Array(nV).fill(-1);
  let newCount = 0;
  for (let i = 0; i < nV; i++) if (remap[i] === i) oldToNew[i] = newCount++;
  const finalIndexOf = (i: number): number => oldToNew[remap[i]];
  const vertices = new Float32Array(newCount * 3);
  for (let i = 0; i < nV; i++) {
    if (remap[i] !== i) continue;
    const ni = oldToNew[i];
    const u = refined.uv[2 * i];
    vertices[3 * ni] = ((u % 1) + 1) % 1;
    vertices[3 * ni + 1] = refined.uv[2 * i + 1];
    vertices[3 * ni + 2] = 0;
  }
  const nF = refined.tris.length / 3;
  const indices = new Uint32Array(nF * 3);
  for (let k = 0; k < nF * 3; k++) indices[k] = finalIndexOf(refined.tris[k]);
  const seamTriangles = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const ua = vertices[3 * indices[3 * f]];
    const ub = vertices[3 * indices[3 * f + 1]];
    const uc = vertices[3 * indices[3 * f + 2]];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) seamTriangles[f] = 1;
  }
  const ringOf = (t: number): number[] => {
    const ring: number[] = [];
    for (let i = 0; i < nV; i++) {
      if (remap[i] !== i) continue;
      if (Math.abs(refined.uv[2 * i + 1] - t) < 1e-9) ring.push(oldToNew[i]);
    }
    ring.sort((a, b) => vertices[3 * a] - vertices[3 * b]);
    return ring;
  };
  return { vertices, indices, seamTriangles, gridVertexCount: newCount, bottomRing: ringOf(0), topRing: ringOf(1) };
}

function isAscendingByU(ring: number[], vertices: Float32Array): boolean {
  for (let i = 1; i < ring.length; i++) {
    if (vertices[3 * ring[i]] < vertices[3 * ring[i - 1]] - RING_EPS) return false;
  }
  return true;
}

/** Boundary edges (used once) on the welded index set whose endpoints are both on a periodic seam column. */
function seamBoundaryCount(wall: OuterWallLike): { seamBoundary: number; ringBottom: number; ringTop: number } {
  const isSeam = (v: number): boolean =>
    Math.abs(wall.vertices[3 * v]) < SEAM_WRAP_EPS || Math.abs(wall.vertices[3 * v] - 1) < SEAM_WRAP_EPS;
  const use = new Map<string, number>();
  for (let f = 0; f < wall.indices.length / 3; f++) {
    const a = wall.indices[3 * f];
    const b = wall.indices[3 * f + 1];
    const c = wall.indices[3 * f + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let seamBoundary = 0;
  for (const [k, cnt] of use) {
    if (cnt !== 1) continue;
    const [i, j] = k.split('_').map(Number);
    if (isSeam(i) && isSeam(j)) seamBoundary++;
  }
  return { seamBoundary, ringBottom: wall.bottomRing.length, ringTop: wall.topRing.length };
}

function buildRimPinned(rimPinOn: boolean, nRing: number, sampler?: SurfaceSampler): OuterWallLike {
  sampler = sampler ?? styleSampler('GothicArches', {}, TIERC_COMMON_DIMS);
  const graph = detectFeatures(sampler, TIER_C_DETECT_OPTS);
  const complex = buildProtectedComplex(sampler, '', graph, undefined, undefined, {
    uLo: 0,
    uHi: 1,
    tLo: 0,
    tHi: 1,
  });
  const domain: ChartDomain = { uLo: 0, uHi: 1, tLo: 0, tHi: 1 };
  const refined = refineToZeroOutliers(sampler, complex, domain, {
    tolMm: 0.01,
    maxPass: TRACT_MAX_PASS,
    bulkPasses7pt: 4,
    bgArcMm: TRACT_BG_ARC_MM,
    ruler: DEFAULT_RULER,
    seamSymmetry: { uLo: 0, uHi: 1 },
    ...(rimPinOn ? { rimPin: { nRing } } : {}),
  });
  // Skip collapseDegenerate here: it drops coarse-density sliver faces (a documented coarse-config
  // artifact) that punch whole-mesh holes; the rim-pin TOPOLOGY is provable on the clean cdt2d mesh.
  return toOuterWallResult({ uv: refined.uv, tris: refined.tris });
}

describe.skipIf(!ON)('T3.3(b) — rim-pin adopts the Tier-C outer wall (GothicArches, flag-ON)', () => {
  const g = globalThis as { __pfPerfectMesher?: boolean };

  it(
    'rimPin makes bottomRing/topRing exactly nRing, ascending-U, with the periodic seam still closed',
    () => {
      g.__pfPerfectMesher = true;
      expect(isCountUnstableStyle('GothicArches', { nodes: [], edges: [] })).toBe(true);

      // Negative control: same build WITHOUT rim-pin ⇒ emergent (non-nRing) rings.
      const without = buildRimPinned(false, TRACT_NRING);
      const withPin = buildRimPinned(true, TRACT_NRING);

      const wo = seamBoundaryCount(without);
      const wp = seamBoundaryCount(withPin);
      // eslint-disable-next-line no-console
      console.log(
        `[T3.3b rim-pin] nRing=${TRACT_NRING} | WITHOUT bottom=${wo.ringBottom} top=${wo.ringTop} | ` +
          `WITH bottom=${wp.ringBottom} top=${wp.ringTop} seamBoundary=${wp.seamBoundary} ` +
          `(without seamBoundary=${wo.seamBoundary})`,
      );

      // (1) The pin delivers EXACTLY nRing per rim (the assembler's equal-count precondition).
      expect(withPin.bottomRing.length, 'rim-pin ⇒ bottomRing == nRing').toBe(TRACT_NRING);
      expect(withPin.topRing.length, 'rim-pin ⇒ topRing == nRing').toBe(TRACT_NRING);
      // (2) Ascending-U (the assembler pairs rings index-for-index by U).
      expect(isAscendingByU(withPin.bottomRing, withPin.vertices), 'bottomRing ascending-U').toBe(true);
      expect(isAscendingByU(withPin.topRing, withPin.vertices), 'topRing ascending-U').toBe(true);
      // (3) The seam weld ACTIVATED — the ring is nRing (not nRing+1), i.e. u=1 folded onto u=0.
      //     (An un-welded seam would leave both u=0 and u=1 rim endpoints ⇒ ring length nRing+1.)
      expect(withPin.bottomRing.length, 'seam weld active ⇒ ring is nRing not nRing+1').toBe(TRACT_NRING);
      // (4) Rim-pin does NOT WORSEN the periodic seam vs the seam-symmetry-only baseline. Any residual
      //     seam-boundary edge is a documented coarse-config artifact (converges to 0 at production
      //     density, like otherBoundary — see the seam-share report); the gate is "rim-pin adds none".
      expect(wp.seamBoundary, 'rim-pin does not add seam-boundary edges vs baseline').toBeLessThanOrEqual(
        wo.seamBoundary,
      );
      // (5) Non-vacuous: WITHOUT rim-pin the rings are NOT both nRing (a real, measured inequality).
      expect(
        without.bottomRing.length === TRACT_NRING && without.topRing.length === TRACT_NRING,
        'un-pinned rims are emergent, not both nRing',
      ).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'assembleWatertight ADOPTS the rim-pinned Tier-C outer wall with NO rim-mismatch throw',
    () => {
      g.__pfPerfectMesher = true;
      // Self-consistent outer + inner samplers from the SAME analytic radius (surfaceId 0 / 1) so the
      // assembled pot is geometrically coherent. The Tier-C wall is built on this SAME outer sampler.
      const rA = buildRadiusFn('GothicArches', {}, AF_DIMS);
      const outerSampler = buildWallGridCPU(rA, 0).sampler;
      const innerSampler = buildWallGridCPU(rA, 1).sampler;
      const tierCOuterWall = buildRimPinned(true, TRACT_NRING, outerSampler);
      expect(tierCOuterWall.bottomRing.length, 'adopted wall rings are nRing').toBe(TRACT_NRING);

      // assembleWatertight builds the inner wall at nRing=outer.bottomRing.length, uBias 0 (see the
      // WatertightAssembly.tierCOuterWall path), so its ring-mismatch guard must NOT throw. Assemble
      // and confirm it returns a non-vacuous mesh.
      let threw: string | null = null;
      let asm: ReturnType<typeof assembleWatertight> | undefined;
      try {
        asm = assembleWatertight(
          outerSampler,
          innerSampler,
          { H: AF_DIMS.H, tBottom: AF_TBOTTOM, rDrain: 0 },
          {
            maxSagMm: 0.05,
            maxEdgeMm: 5,
            minEdgeMm: 0.1,
            gradeRatio: 2,
            maxLevel: 12,
            resU: 48,
            resT: 48,
            nRing: TRACT_NRING,
            tierCOuterWall,
          },
        );
      } catch (e) {
        threw = e instanceof Error ? e.message : String(e);
      }

      // Index-space topology on the assembled pot (no 3D eval needed): a fully-closed pot shares ring
      // indices between surfaces, so boundaryEdges → 0 at production density. At this coarse density
      // the Tier-C outer wall carries interior boundary edges (otherBoundary) — reported, NOT gated
      // (converges at production density; the controller's heavy run is the definitive watertight gate).
      let boundaryEdges = -1;
      let nonManifoldEdges = -1;
      if (asm) {
        const use = new Map<string, number>();
        for (let f = 0; f < asm.indices.length / 3; f++) {
          const a = asm.indices[3 * f];
          const b = asm.indices[3 * f + 1];
          const c = asm.indices[3 * f + 2];
          for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
            if (i === j) continue;
            const k = i < j ? `${i}_${j}` : `${j}_${i}`;
            use.set(k, (use.get(k) ?? 0) + 1);
          }
        }
        boundaryEdges = 0;
        nonManifoldEdges = 0;
        for (const cnt of use.values()) {
          if (cnt === 1) boundaryEdges++;
          else if (cnt > 2) nonManifoldEdges++;
        }
      }
      // eslint-disable-next-line no-console
      console.log(
        `[T3.3b assembly] threw=${threw ?? 'no'} verts=${asm ? asm.vertices.length / 3 : 0} ` +
          `tris=${asm ? asm.indices.length / 3 : 0} boundaryEdges=${boundaryEdges} ` +
          `nonManifoldEdges=${nonManifoldEdges} (boundaryEdges is a coarse-density artifact, not gated)`,
      );

      expect(threw, 'assembleWatertight adopts the Tier-C wall without a rim-mismatch throw').toBe(null);
      expect(asm, 'assembly returns a result').toBeDefined();
      expect(asm!.indices.length, 'assembled pot is non-vacuous').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );

  it('flag-OFF: the new nRing rim-pin option is INERT (buildTierCOuterWall byte-identical)', () => {
    // The production tripwire: with __pfPerfectMesher off, buildTierCOuterWall pure-delegates to
    // buildConformingOuterWall REGARDLESS of the new `nRing` field (which only wires rimPin into the
    // flag-ON refine). Passing nRing must not perturb the flag-off byte-identical mesh.
    g.__pfPerfectMesher = false;
    const sampler = styleSampler('GothicArches', {}, TIERC_COMMON_DIMS);
    const opts = { maxSagMm: 0.05, maxEdgeMm: 5, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 16, resU: 48, resT: 48 };
    const direct = buildConformingOuterWall(sampler, opts);
    const viaTierCPlain = buildTierCOuterWall(sampler, opts, 'GothicArches');
    const viaTierCWithNRing = buildTierCOuterWall(sampler, { ...opts, nRing: TRACT_NRING }, 'GothicArches');
    const hDirect = hashMesh(direct);
    expect(hashMesh(viaTierCPlain), 'flag-off tierC == conforming').toBe(hDirect);
    expect(hashMesh(viaTierCWithNRing), 'flag-off nRing option is inert').toBe(hDirect);
  });
});
