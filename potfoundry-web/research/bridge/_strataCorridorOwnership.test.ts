/**
 * S30 research-only shadow for the S24 feature-corridor ownership gap.
 *
 * The default tests prove the ownership mismatch from serialized artifacts. Set
 * PF_STRATA_CORRIDOR_BUILD=1 to rebuild the S24 aligned seed twice: unchanged
 * control, then the single D54 routed-coverage exclusion arm. No STL is emitted.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { aspect3 } from './_shapeGuard';
import { canonTheta } from './_sweepPredicate';
import {
  auditPatchOwnership,
  buildAlignedSeedRepaired,
  DEFAULT_SEED_OPTS,
  discoverRoutedAnnuli,
  type AlignedSeed,
} from './_strataAlignedSeed';
import type { LocusArtifact } from './_strataLocusTrace';
import type { PatchRegion } from './_judgeShape';
import type { StyleDims } from './labkit';

const RUN_BUILD = process.env.PF_STRATA_CORRIDOR_BUILD === '1';
const RUN_R1 = process.env.PF_STRATA_CORRIDOR_R1 === '1';
const RUN_R3A = process.env.PF_STRATA_CORRIDOR_R3A === '1';
const RUN_R4 = process.env.PF_STRATA_CORRIDOR_R4 === '1';
const RUN_R5 = process.env.PF_STRATA_CORRIDOR_R5 === '1';
const RUN_R6 = process.env.PF_STRATA_CORRIDOR_R6 === '1';
const RUN_R7 = process.env.PF_STRATA_CORRIDOR_R7 === '1';
const FINAL_STL = process.env.PF_STRATA_CORRIDOR_STL ?? '';
const LOCI_PATH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S24i2.loci.json';
const PATCH_PATH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S24i2.patches.json';
const S30_LOCI_PATH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S30C1.loci.json';
const S30_PATCH_PATH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S30C1.patches.json';
const WITNESS = { theta: 1.358340, z: 76.21094 } as const;

interface StoredLocusArtifact extends LocusArtifact {
  run: {
    params: Record<string, number>;
    dims: StyleDims;
  };
  seed?: Record<string, number>;
}

interface StoredPatchArtifact {
  patches: PatchRegion[];
}

function readArtifacts(
  lociPath = LOCI_PATH,
  patchPath = PATCH_PATH,
): { loci: StoredLocusArtifact; patches: PatchRegion[] } {
  const loci = JSON.parse(readFileSync(lociPath, 'utf8')) as StoredLocusArtifact;
  const patchArtifact = JSON.parse(readFileSync(patchPath, 'utf8')) as StoredPatchArtifact;
  return { loci, patches: patchArtifact.patches };
}

function syntheticArtifact(): LocusArtifact {
  return {
    schema: 'pf.strata.loci/1',
    meta: {
      H: 120, nu: 1, nv: 1, stepMm: 0.35, hRefMm: 0.35,
      kink: { scan: 16, halvings: 24, ratio: 0.15, jumpRatio: 0.62 },
      rEvals: 0, wallMs: 0,
    },
    counts: {
      latticeProbes: 0, crossings: 0, jumpExcluded: 0, seedsConsumed: 0,
      loci: 0, lociDropped: 0, junctions: 1, rawJunctions: 1,
      junctionCells: 0, polylinePts: 0, totalLengthMm: 0,
    },
    loci: [],
    junctions: [{
      id: 54, theta: 0, z: 60, branches: 16, minAngleDeg: 15,
      radiusMm: 4, radiusClamped: true, spreadMm: 25, nRaw: 281,
      lociIds: [], source: 'cross',
    }],
  };
}

function pointTriangleDistance(
  point: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const ap = [point[0] - a[0], point[1] - a[1], point[2] - a[2]] as const;
  const d1 = ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2];
  const d2 = ac[0] * ap[0] + ac[1] * ap[1] + ac[2] * ap[2];
  if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);

  const bp = [point[0] - b[0], point[1] - b[1], point[2] - b[2]] as const;
  const d3 = ab[0] * bp[0] + ab[1] * bp[1] + ab[2] * bp[2];
  const d4 = ac[0] * bp[0] + ac[1] * bp[1] + ac[2] * bp[2];
  if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(ap[0] - v * ab[0], ap[1] - v * ab[1], ap[2] - v * ab[2]);
  }

  const cp = [point[0] - c[0], point[1] - c[1], point[2] - c[2]] as const;
  const d5 = ab[0] * cp[0] + ab[1] * cp[1] + ab[2] * cp[2];
  const d6 = ac[0] * cp[0] + ac[1] * cp[1] + ac[2] * cp[2];
  if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(ap[0] - w * ac[0], ap[1] - w * ac[1], ap[2] - w * ac[2]);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    return Math.hypot(
      bp[0] - w * (c[0] - b[0]),
      bp[1] - w * (c[1] - b[1]),
      bp[2] - w * (c[2] - b[2]),
    );
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return Math.hypot(
    ap[0] - v * ab[0] - w * ac[0],
    ap[1] - v * ab[1] - w * ac[1],
    ap[2] - v * ab[2] - w * ac[2],
  );
}

function seedGapMm(
  seed: AlignedSeed,
  radius: (theta: number, z: number) => number,
  theta: number,
  z: number,
): { gapMm: number; triangle: number } {
  const vertex = seed.pts.map(([th, zz]) => {
    const r = radius(th, zz);
    return [r * Math.cos(th), r * Math.sin(th), zz] as [number, number, number];
  });
  const wr = radius(theta, z);
  const point = [wr * Math.cos(theta), wr * Math.sin(theta), z] as const;
  let gapMm = Infinity;
  let triangle = -1;
  for (let i = 0; i < seed.tris.length; i += 1) {
    const tri = seed.tris[i];
    const gap = pointTriangleDistance(point, vertex[tri[0]], vertex[tri[1]], vertex[tri[2]]);
    if (gap < gapMm) { gapMm = gap; triangle = i; }
  }
  return { gapMm, triangle };
}

interface SeedTransitionCensus {
  longFacetsGe500um: number;
  fanHubs: number;
  maximumFanDegree: number;
  needles: number;
  longAr20: number;
}

function seedTransitionCensus(
  seed: AlignedSeed,
  radius: (theta: number, z: number) => number,
): SeedTransitionCensus {
  const xyz = seed.pts.map(([theta, z]) => {
    const r = radius(theta, z);
    return [r * Math.cos(theta), r * Math.sin(theta), z] as const;
  });
  const degree = new Uint32Array(seed.pts.length);
  let longFacetsGe500um = 0; let needles = 0; let longAr20 = 0;
  for (const [ia, ib, ic] of seed.tris) {
    const a = xyz[ia]; const b = xyz[ib]; const c = xyz[ic];
    const e0 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const e1 = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
    const e2 = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
    const longest = Math.max(e0, e1, e2); const shortest = Math.min(e0, e1, e2);
    if (longest >= 0.5) {
      longFacetsGe500um += 1; degree[ia] += 1; degree[ib] += 1; degree[ic] += 1;
    }
    if (shortest < 0.02 * longest) needles += 1;
    if (longest >= 1 && aspect3(
      a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
    ) >= 20) longAr20 += 1;
  }
  let fanHubs = 0; let maximumFanDegree = 0;
  for (const value of degree) {
    if (value >= 12) fanHubs += 1;
    if (value > maximumFanDegree) maximumFanDegree = value;
  }
  return { longFacetsGe500um, fanHubs, maximumFanDegree, needles, longAr20 };
}

function maximumStlEdgeMm(xyz: Float64Array, nTri: number): number {
  let maximum = 0;
  for (let tri = 0; tri < nTri; tri += 1) {
    const o = tri * 9;
    maximum = Math.max(
      maximum,
      Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]),
      Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]),
      Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]),
    );
  }
  return maximum;
}

function closestStlCarrier(
  xyz: Float64Array,
  nTri: number,
  point: readonly [number, number, number],
  maximumEdgeMm: number,
): { triangle: number; gapMm: number; aspect: number } {
  let triangle = -1;
  let gapMm = Infinity;
  for (let tri = 0; tri < nTri; tri += 1) {
    const o = tri * 9;
    const firstDistance = Math.hypot(point[0] - xyz[o], point[1] - xyz[o + 1], point[2] - xyz[o + 2]);
    if (firstDistance - maximumEdgeMm > gapMm) continue;
    const a = [xyz[o], xyz[o + 1], xyz[o + 2]] as const;
    const b = [xyz[o + 3], xyz[o + 4], xyz[o + 5]] as const;
    const c = [xyz[o + 6], xyz[o + 7], xyz[o + 8]] as const;
    const gap = pointTriangleDistance(point, a, b, c);
    if (gap < gapMm) { gapMm = gap; triangle = tri; }
  }
  if (triangle < 0) throw new Error('S30 final audit: no STL carrier found');
  const o = triangle * 9;
  return {
    triangle,
    gapMm,
    aspect: aspect3(
      xyz[o], xyz[o + 1], xyz[o + 2],
      xyz[o + 3], xyz[o + 4], xyz[o + 5],
      xyz[o + 6], xyz[o + 7], xyz[o + 8],
    ),
  };
}

describe('Strata S24 corridor ownership', () => {
  it('discovers routed annuli from one-to-one geometry without defect-ranked ids', () => {
    const { loci, patches } = readArtifacts(S30_LOCI_PATH, S30_PATCH_PATH);
    const discovery = discoverRoutedAnnuli(loci, patches, 1.5);
    expect(discovery.ambiguousJunctionIds).toEqual([]);
    expect(discovery.ambiguousPatchIds).toEqual([]);
    expect(discovery.candidates.map((candidate) => candidate.junctionId)).toEqual([
      44, 49, 51, 53, 54, 57, 59, 65, 72, 77, 87, 97,
    ]);
    expect(discovery.candidates.every((candidate) => candidate.centerErrorMm <= 0.002)).toBe(true);
    expect(discovery.candidates.every((candidate) => candidate.rawRadiusMm > candidate.routedRadiusMm)).toBe(true);
  });

  it('keeps historical raw exclusion by default and reclaims only a named routed annulus', () => {
    const loci = syntheticArtifact();
    const patches: PatchRegion[] = [{ id: 'D54', theta: 0, z: 60, radiusMm: 4 }];
    const theta = 3.6 / 45;
    const control = auditPatchOwnership(loci, patches, 1.5, undefined, theta, 60);
    const arm = auditPatchOwnership(loci, patches, 1.5, new Set([54]), theta, 60);
    expect(control.rawJunctionIds).toEqual([54]);
    expect(control.effectiveJunctionIds).toEqual([54]);
    expect(control.requestedPatchIds).toEqual([]);
    expect(arm.rawJunctionIds).toEqual([54]);
    expect(arm.effectiveJunctionIds).toEqual([]);
    expect(arm.overriddenJunctionIds).toEqual([54]);
    expect(() => auditPatchOwnership(loci, [], 1.5, new Set([54]), theta, 60)).toThrow(/no matching patchRoute/);
  });

  it('proves the serialized S24 witness lies in the D54 no-ring/no-patch ownership gap', () => {
    const { loci, patches } = readArtifacts();
    const d54 = loci.junctions.find((junction) => junction.id === 54);
    expect(d54).toBeDefined();
    expect(d54?.radiusMm).toBe(4);
    expect(d54?.radiusClamped).toBe(true);
    expect(d54?.branches).toBe(16);
    expect(d54?.spreadMm).toBeGreaterThan(25);

    const control = auditPatchOwnership(
      loci, patches, 1.5, undefined, WITNESS.theta, WITNESS.z,
    );
    const arm = auditPatchOwnership(
      loci, patches, 1.5, new Set([54]), WITNESS.theta, WITNESS.z,
    );
    expect(control.rawJunctionIds).toContain(54);
    expect(control.effectiveJunctionIds).toContain(54);
    expect(control.requestedPatchIds).toEqual([]);
    expect(arm.rawJunctionIds).toContain(54);
    expect(arm.effectiveJunctionIds).not.toContain(54);
    expect(arm.requestedPatchIds).toEqual([]);
  });

  it.runIf(RUN_BUILD)('rebuilds the unchanged control and the D54 routed-coverage shadow arm', () => {
    const { loci, patches } = readArtifacts();
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    const common = {
      ...DEFAULT_SEED_OPTS,
      H,
      gu: 200,
      gv: 140,
      acrossAbs: true,
      acrossMinMm: 0.05,
      seedARmax: 24,
      acrossRings: 7,
      acrossGrade: 1.6,
      acrossMaxMm: 0.65,
      turnMul: 9,
      patchRoute: patches,
      patchMaxMm: 1.5,
      patchSubMax: 16,
      tolMm: 0.01,
      shapeAR: 50,
    };
    const control = buildAlignedSeedRepaired(radius, loci, common, 6);
    const arm = buildAlignedSeedRepaired(radius, loci, {
      ...common,
      patchExclusionIds: new Set([54]),
    }, 6);
    const controlGap = seedGapMm(control.seed, radius, WITNESS.theta, WITNESS.z);
    const armGap = seedGapMm(arm.seed, radius, WITNESS.theta, WITNESS.z);
    const report = {
      schema: 'pf.strata.corridor-ownership/1',
      source: { loci: LOCI_PATH, patches: PATCH_PATH },
      witness: WITNESS,
      control: { rounds: control.roundsUsed, banned: control.banned, gap: controlGap, stats: control.seed.stats },
      arm: { rounds: arm.roundsUsed, banned: arm.banned, gap: armGap, stats: arm.seed.stats },
      decision: armGap.gapMm <= controlGap.gapMm / 2
        ? 'SEED GO: witness gap at least halved; proceed to frozen full S24 shadow'
        : 'SEED STOP: routed-coverage ownership did not halve the witness gap',
    };
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'CORRIDOR_S24_D54.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(control.seed.stats.points).toBe(loci.seed?.points);
    expect(control.seed.stats.tris).toBe(loci.seed?.tris);
    expect(control.seed.stats.constraintsRecovered).toBe(control.seed.stats.constraints);
    expect(arm.seed.stats.patchExclusionRegions).toBe(1);
    expect(arm.seed.stats.patchExclusionReclaimedChainPts).toBeGreaterThan(0);
    // D54's own incomplete outer coverage throws inside the builder. Five uncovered
    // sectors belong to other legacy patches and must remain flat in this one-variable arm.
    expect(arm.seed.stats.patchOuterUncoveredSectors).toBe(control.seed.stats.patchOuterUncoveredSectors);
    expect(arm.seed.stats.constraintsRecovered).toBe(arm.seed.stats.constraints);
    expect(arm.seed.stats.negArea).toBe(0);
    expect(armGap.gapMm).toBeLessThan(controlGap.gapMm);
  }, 600_000);

  it.runIf(RUN_R1)('rebuilds S30C1 with every geometry-discovered routed annulus owned', () => {
    const { loci, patches } = readArtifacts(S30_LOCI_PATH, S30_PATCH_PATH);
    const baseline = loci.seed;
    if (baseline === undefined) throw new Error('S31 R1: S30C1 loci artifact has no serialized seed baseline');
    const discovery = discoverRoutedAnnuli(loci, patches, 1.5);
    if (discovery.ambiguousJunctionIds.length > 0 || discovery.ambiguousPatchIds.length > 0) {
      throw new Error(`S31 R1: ambiguous ownership discovery ${JSON.stringify(discovery)}`);
    }
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    const common = {
      ...DEFAULT_SEED_OPTS,
      H,
      gu: 200,
      gv: 140,
      acrossAbs: true,
      acrossMinMm: 0.05,
      seedARmax: 24,
      acrossRings: 7,
      acrossGrade: 1.6,
      acrossMaxMm: 0.65,
      turnMul: 9,
      patchRoute: patches,
      patchMaxMm: 1.5,
      patchSubMax: 16,
      tolMm: 0.01,
      shapeAR: 50,
    };
    const candidateIds = new Set(discovery.candidates.map((candidate) => candidate.junctionId));
    const arm = buildAlignedSeedRepaired(radius, loci, {
      ...common,
      patchExclusionIds: candidateIds,
    }, 6);
    const pitchMean = Math.sqrt(((2 * Math.PI * 45) / common.gu) * (H / common.gv));
    const acrossBase = common.acrossFrac * pitchMean;
    const minSepMm = Math.max(common.weldMm * 4, acrossBase * 0.5);
    const hardGates = {
      noNewLocusCrossings: arm.seed.stats.edgesCrossingLocus <= baseline.edgesCrossingLocus,
      noExtraRepairBans: arm.banned <= baseline.banApplied,
      constraintsExact: arm.seed.stats.constraintsRecovered === arm.seed.stats.constraints,
      noNegativeArea: arm.seed.stats.negArea === 0,
      noWorseOverCap: arm.seed.stats.overCap <= baseline.overCap,
      noWorseWorstAR: arm.seed.stats.worstAR <= baseline.worstAR + 1e-9,
      noNewUnownedOuterSectors: arm.seed.stats.patchOuterUncoveredSectors <= baseline.patchOuterUncoveredSectors,
    };
    const decision = Object.values(hardGates).every(Boolean)
      ? 'GO: every R1 seed gate cleared'
      : 'STOP: automatic ownership recreates a crossing/repair birth channel';
    const report = {
      schema: 'pf.strata.corridor-r1-seed/1',
      source: { loci: S30_LOCI_PATH, patches: S30_PATCH_PATH, controlTag: 'gothicarches_ring_DS-HT_S30C1' },
      frozen: {
        decimationFloorMm: minSepMm,
        bowFloorMm: 1.05 * minSepMm,
        boundarySnapMm: Math.min(minSepMm, acrossBase * 0.5),
        weldMm: common.weldMm,
        pslgEpsMm: common.pslgEpsMm,
        acrossMinMm: common.acrossMinMm,
        acrossRings: common.acrossRings,
        acrossGrade: common.acrossGrade,
        acrossMaxMm: common.acrossMaxMm,
        turnMul: common.turnMul,
        patchMaxMm: common.patchMaxMm,
      },
      discovery,
      hardGates,
      decision,
      control: baseline,
      arm: { rounds: arm.roundsUsed, banned: arm.banned, stats: arm.seed.stats },
      deltas: {
        points: arm.seed.stats.points - baseline.points,
        tris: arm.seed.stats.tris - baseline.tris,
        crossings: arm.seed.stats.edgesCrossingLocus - baseline.edgesCrossingLocus,
        reclaimedChainPts: arm.seed.stats.patchExclusionReclaimedChainPts - baseline.patchExclusionReclaimedChainPts,
      },
    };
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'S31_R1_SEED.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(candidateIds.size).toBe(12);
    expect(arm.seed.stats.patchExclusionRegions).toBe(12);
    expect(arm.seed.stats.patchExclusionReclaimedChainPts).toBeGreaterThan(baseline.patchExclusionReclaimedChainPts);
    expect(arm.seed.stats.constraintsRecovered).toBe(arm.seed.stats.constraints);
    expect(arm.seed.stats.negArea).toBe(0);
    expect(arm.seed.stats.overCap).toBeLessThanOrEqual(baseline.overCap);
    expect(arm.seed.stats.worstAR).toBeLessThanOrEqual(baseline.worstAR + 1e-9);
    expect(arm.seed.stats.patchOuterUncoveredSectors).toBeLessThanOrEqual(baseline.patchOuterUncoveredSectors);
    expect(arm.seed.stats.edgesCrossingLocus).toBeGreaterThan(baseline.edgesCrossingLocus);
    expect(arm.banned).toBeGreaterThan(baseline.banApplied);
    expect(decision).toMatch(/^STOP:/);
  }, 600_000);

  it.runIf(RUN_R3A)('isolates consecutive-chain decimation on the proven D54 ownership baseline', () => {
    const { loci, patches } = readArtifacts(S30_LOCI_PATH, S30_PATCH_PATH);
    const baseline = loci.seed;
    if (baseline === undefined) throw new Error('S31 R3a: S30C1 loci artifact has no serialized seed baseline');
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    const common = {
      ...DEFAULT_SEED_OPTS,
      H,
      gu: 200,
      gv: 140,
      acrossAbs: true,
      acrossMinMm: 0.05,
      seedARmax: 24,
      acrossRings: 7,
      acrossGrade: 1.6,
      acrossMaxMm: 0.65,
      turnMul: 9,
      patchRoute: patches,
      patchMaxMm: 1.5,
      patchSubMax: 16,
      patchExclusionIds: new Set([54]),
      tolMm: 0.01,
      shapeAR: 50,
    };
    const requested = (process.env.PF_STRATA_CORRIDOR_DECIMATE_UM ?? '100,50')
      .split(',')
      .map((value) => Number.parseFloat(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (requested.length === 0) throw new Error('S31 R3a: PF_STRATA_CORRIDOR_DECIMATE_UM has no positive values');
    const arms = requested.map((decimateUm) => {
      const built = buildAlignedSeedRepaired(radius, loci, {
        ...common,
        chainDecimateMm: decimateUm / 1000,
      }, 6);
      const stats = built.seed.stats;
      const gates = {
        fewerLocusCrossings: stats.edgesCrossingLocus < baseline.edgesCrossingLocus,
        constraintsExact: stats.constraintsRecovered === stats.constraints,
        noNegativeArea: stats.negArea === 0,
        noWorseOverCap: stats.overCap <= baseline.overCap,
        noWorseWorstAR: stats.worstAR <= baseline.worstAR + 1e-9,
        samePatchOwnership: stats.patchExclusionRegions === baseline.patchExclusionRegions,
        noNewUnownedOuterSectors: stats.patchOuterUncoveredSectors <= baseline.patchOuterUncoveredSectors,
      };
      return {
        decimateUm,
        rounds: built.roundsUsed,
        banned: built.banned,
        stats,
        gates,
        gatePass: Object.values(gates).every(Boolean),
        deltas: {
          points: stats.points - baseline.points,
          tris: stats.tris - baseline.tris,
          decimated: stats.decimated - baseline.decimated,
          crossings: stats.edgesCrossingLocus - baseline.edgesCrossingLocus,
          crossingFraction: stats.edgesCrossingLocus / stats.edgesTested
            - baseline.edgesCrossingLocus / baseline.edgesTested,
        },
      };
    });
    const winner = arms
      .filter((arm) => arm.gatePass)
      .sort((a, b) => a.stats.edgesCrossingLocus - b.stats.edgesCrossingLocus)[0] ?? null;
    const report = {
      schema: 'pf.strata.corridor-r3a-seed/1',
      source: { loci: S30_LOCI_PATH, patches: S30_PATCH_PATH, controlTag: 'gothicarches_ring_DS-HT_S30C1' },
      isolation: 'only consecutive-chain decimation changes; D54 ownership, cross-chain weld, bow floor, boundary snap, PSLG conditioning, patch geometry, bisection and gates are frozen',
      control: baseline,
      arms,
      winner: winner === null ? null : { decimateUm: winner.decimateUm, crossings: winner.stats.edgesCrossingLocus },
      decision: winner === null ? 'STOP: decimation-only did not clear the seed gates' : 'GO: bake the winning decimation-only arm',
    };
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'S31_R3A_SEED.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    for (const arm of arms) {
      expect(arm.stats.constraintsRecovered).toBe(arm.stats.constraints);
      expect(arm.stats.negArea).toBe(0);
    }
    expect(arms.every((arm) => arm.stats.edgesCrossingLocus > baseline.edgesCrossingLocus)).toBe(true);
    expect(winner).toBeNull();
    expect(report.decision).toMatch(/^STOP:/);
  }, 600_000);

  it.runIf(RUN_R4)('isolates non-fixed cross-chain welding on the proven D54 ownership baseline', () => {
    const { loci, patches } = readArtifacts(S30_LOCI_PATH, S30_PATCH_PATH);
    const baseline = loci.seed;
    if (baseline === undefined) throw new Error('S31 R4: S30C1 loci artifact has no serialized seed baseline');
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    const common = {
      ...DEFAULT_SEED_OPTS,
      H,
      gu: 200,
      gv: 140,
      acrossAbs: true,
      acrossMinMm: 0.05,
      seedARmax: 24,
      acrossRings: 7,
      acrossGrade: 1.6,
      acrossMaxMm: 0.65,
      turnMul: 9,
      patchRoute: patches,
      patchMaxMm: 1.5,
      patchSubMax: 16,
      patchExclusionIds: new Set([54]),
      tolMm: 0.01,
      shapeAR: 50,
    };
    // The registered bracket is non-monotone: 185 um increased proper
    // crossings, while 190 um was the only safe seed rung.  Keep the gated
    // test's default on that reproducible passing rung; callers can still
    // supply an explicit comma-separated sweep.
    const requested = (process.env.PF_STRATA_CORRIDOR_WELD_UM ?? '190')
      .split(',')
      .map((value) => Number.parseFloat(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (requested.length === 0) throw new Error('S31 R4: PF_STRATA_CORRIDOR_WELD_UM has no positive values');
    const arms: Array<{
      weldUm: number;
      rounds?: number;
      banned?: number;
      stats?: AlignedSeed['stats'];
      gates?: Record<string, boolean>;
      gatePass: boolean;
      deltas?: Record<string, number>;
      error?: string;
    }> = [];
    for (const weldUm of requested) {
      try {
        const built = buildAlignedSeedRepaired(radius, loci, {
          ...common,
          chainWeldMm: weldUm / 1000,
        }, 6);
        const stats = built.seed.stats;
        const gates = {
          fewerLocusCrossings: stats.edgesCrossingLocus < baseline.edgesCrossingLocus,
          constraintsExact: stats.constraintsRecovered === stats.constraints,
          noNegativeArea: stats.negArea === 0,
          noWorseOverCap: stats.overCap <= baseline.overCap,
          noWorseWorstAR: stats.worstAR <= baseline.worstAR + 1e-9,
          samePatchOwnership: stats.patchExclusionRegions === baseline.patchExclusionRegions,
          noNewUnownedOuterSectors: stats.patchOuterUncoveredSectors <= baseline.patchOuterUncoveredSectors,
        };
        arms.push({
          weldUm,
          rounds: built.roundsUsed,
          banned: built.banned,
          stats,
          gates,
          gatePass: Object.values(gates).every(Boolean),
          deltas: {
            points: stats.points - baseline.points,
            tris: stats.tris - baseline.tris,
            constraints: stats.constraints - baseline.constraints,
            crossings: stats.edgesCrossingLocus - baseline.edgesCrossingLocus,
            crossingFraction: stats.edgesCrossingLocus / stats.edgesTested
              - baseline.edgesCrossingLocus / baseline.edgesTested,
          },
        });
      } catch (error) {
        arms.push({ weldUm, gatePass: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const eligible = arms.filter((arm) => arm.gatePass && arm.stats !== undefined);
    eligible.sort((a, b) => (a.stats as AlignedSeed['stats']).edgesCrossingLocus
      - (b.stats as AlignedSeed['stats']).edgesCrossingLocus);
    const winner = eligible[0] ?? null;
    const report = {
      schema: 'pf.strata.corridor-r4-seed/1',
      source: { loci: S30_LOCI_PATH, patches: S30_PATCH_PATH, controlTag: 'gothicarches_ring_DS-HT_S30C1' },
      historicalDiscriminator: 'multi-chain welds were 17.01% of welded sites but carried 71.4% of degree>=18 fan hubs (4.20x enrichment)',
      isolation: 'only non-fixed cross-chain weld changes; fixed intersections retain 192.6 um minSep and decimation, bow floor, boundary snap, PSLG conditioning, patch geometry, ownership, bisection and gates are frozen',
      control: baseline,
      arms,
      winner: winner === null ? null : {
        weldUm: winner.weldUm,
        crossings: (winner.stats as AlignedSeed['stats']).edgesCrossingLocus,
      },
      decision: winner === null ? 'STOP: topology-only did not clear the seed gates' : 'GO: bake the winning topology-only arm',
    };
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'S31_R4_SEED.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(winner).not.toBeNull();
  }, 600_000);

  it.runIf(RUN_R5)('bounds the graded offset-ring transition fan with a lower stride cap', () => {
    const { loci, patches } = readArtifacts(S30_LOCI_PATH, S30_PATCH_PATH);
    const baseline = loci.seed;
    if (baseline === undefined) throw new Error('S32 R5: S30C1 loci artifact has no serialized seed baseline');
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    const common = {
      ...DEFAULT_SEED_OPTS,
      H,
      gu: 200,
      gv: 140,
      acrossAbs: true,
      acrossMinMm: 0.05,
      seedARmax: 24,
      acrossRings: 7,
      acrossGrade: 1.6,
      acrossMaxMm: 0.65,
      turnMul: 9,
      patchRoute: patches,
      patchMaxMm: 1.5,
      patchSubMax: 16,
      patchExclusionIds: new Set([54]),
      tolMm: 0.01,
      shapeAR: 50,
    };
    const controlBuilt = buildAlignedSeedRepaired(radius, loci, {
      ...common,
      acrossStrideMax: 4,
    }, 6);
    const control = {
      rounds: controlBuilt.roundsUsed,
      banned: controlBuilt.banned,
      stats: controlBuilt.seed.stats,
      transition: seedTransitionCensus(controlBuilt.seed, radius),
    };
    const requested = (process.env.PF_STRATA_CORRIDOR_STRIDE_MAX ?? '2,1')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value < 4);
    if (requested.length === 0) throw new Error('S32 R5: PF_STRATA_CORRIDOR_STRIDE_MAX needs an integer in [1,3]');
    const arms = requested.map((strideMax) => {
      const built = buildAlignedSeedRepaired(radius, loci, {
        ...common,
        acrossStrideMax: strideMax,
      }, 6);
      const stats = built.seed.stats;
      const transition = seedTransitionCensus(built.seed, radius);
      const gates = {
        fewerFanHubs: transition.fanHubs < control.transition.fanHubs,
        noMoreNeedles: transition.needles <= control.transition.needles,
        noMoreLongAr20: transition.longAr20 <= control.transition.longAr20,
        noNewLocusCrossings: stats.edgesCrossingLocus <= control.stats.edgesCrossingLocus,
        noExtraRepairBans: built.banned <= control.banned,
        constraintsExact: stats.constraintsRecovered === stats.constraints,
        noNegativeArea: stats.negArea === 0,
        noWorseOverCap: stats.overCap <= control.stats.overCap,
        noWorseWorstAR: stats.worstAR <= control.stats.worstAR + 1e-9,
        samePatchOwnership: stats.patchExclusionRegions === control.stats.patchExclusionRegions,
        noNewUnownedOuterSectors: stats.patchOuterUncoveredSectors <= control.stats.patchOuterUncoveredSectors,
        boundedPointCost: stats.points <= control.stats.points * 2,
      };
      return {
        strideMax,
        rounds: built.roundsUsed,
        banned: built.banned,
        stats,
        transition,
        gates,
        gatePass: Object.values(gates).every(Boolean),
        deltas: {
          points: stats.points - control.stats.points,
          tris: stats.tris - control.stats.tris,
          crossings: stats.edgesCrossingLocus - control.stats.edgesCrossingLocus,
          fanHubs: transition.fanHubs - control.transition.fanHubs,
          maximumFanDegree: transition.maximumFanDegree - control.transition.maximumFanDegree,
          needles: transition.needles - control.transition.needles,
          longAr20: transition.longAr20 - control.transition.longAr20,
        },
      };
    });
    const winner = arms
      .filter((arm) => arm.gatePass)
      .sort((a, b) => a.transition.fanHubs - b.transition.fanHubs
        || a.stats.edgesCrossingLocus - b.stats.edgesCrossingLocus
        || a.stats.points - b.stats.points)[0] ?? null;
    const report = {
      schema: 'pf.strata.corridor-r5-stride-seed/1',
      source: { loci: S30_LOCI_PATH, patches: S30_PATCH_PATH, controlTag: 'gothicarches_ring_DS-HT_S30C1' },
      isolation: 'only the offset-ring chain-index stride cap changes (historical 4 -> 2/1); chain, radii, exclusions, patches, constraints, bisection and gates are frozen',
      control,
      arms,
      winner: winner === null ? null : { strideMax: winner.strideMax, transition: winner.transition },
      decision: winner === null
        ? 'STOP: denser collar boundary did not reduce fan hubs without opening another seed defect channel'
        : 'GO: run the winning stride cap on the exact S30C1 full mesh',
    };
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'S32_R5_STRIDE_SEED.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(control.stats.points).toBe(baseline.points);
    expect(control.stats.tris).toBe(baseline.tris);
    expect(control.stats.constraintsRecovered).toBe(control.stats.constraints);
    for (const arm of arms) {
      expect(arm.stats.constraintsRecovered).toBe(arm.stats.constraints);
      expect(arm.stats.negArea).toBe(0);
    }
  }, 600_000);

  it.runIf(RUN_R6)('replaces arbitrary offset-ring connectivity with a preflighted planar collar', () => {
    const { loci, patches } = readArtifacts(S30_LOCI_PATH, S30_PATCH_PATH);
    const serialized = loci.seed;
    if (serialized === undefined) throw new Error('S32 R6: S30C1 loci artifact has no serialized seed baseline');
    const baseline = serialized as unknown as AlignedSeed['stats'];
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    // These five values are the exact cap-4 control census emitted by R5. Reusing
    // them avoids a second 117k-point control build while preserving a frozen A/B.
    const controlTransition: SeedTransitionCensus = {
      longFacetsGe500um: 114149,
      fanHubs: 159,
      maximumFanDegree: 30,
      needles: 0,
      longAr20: 188,
    };
    const built = buildAlignedSeedRepaired(radius, loci, {
      ...DEFAULT_SEED_OPTS,
      H,
      gu: 200,
      gv: 140,
      acrossAbs: true,
      acrossMinMm: 0.05,
      seedARmax: 24,
      acrossRings: 7,
      acrossGrade: 1.6,
      acrossStrideMax: 4,
      acrossStructured: true,
      acrossStructuredMode: 'full',
      acrossMaxMm: 0.65,
      turnMul: 9,
      patchRoute: patches,
      patchMaxMm: 1.5,
      patchSubMax: 16,
      patchExclusionIds: new Set([54]),
      tolMm: 0.01,
      shapeAR: 50,
    }, 6);
    const stats = built.seed.stats;
    const transition = seedTransitionCensus(built.seed, radius);
    const gates = {
      collarConnectivityAdmitted: stats.collarRailConstraints > 0 && stats.collarRungConstraints > 0,
      fewerFanHubs: transition.fanHubs < controlTransition.fanHubs,
      noWorseMaximumFanDegree: transition.maximumFanDegree <= controlTransition.maximumFanDegree,
      noMoreNeedles: transition.needles <= controlTransition.needles,
      noMoreLongAr20: transition.longAr20 <= controlTransition.longAr20,
      noNewLocusCrossings: stats.edgesCrossingLocus <= baseline.edgesCrossingLocus,
      noExtraRepairBans: built.banned <= baseline.banApplied,
      constraintsExact: stats.constraintsRecovered === stats.constraints,
      noNegativeArea: stats.negArea === 0,
      noWorseOverCap: stats.overCap <= baseline.overCap,
      noWorseWorstAR: stats.worstAR <= baseline.worstAR + 1e-9,
      samePatchOwnership: stats.patchExclusionRegions === baseline.patchExclusionRegions,
      noNewUnownedOuterSectors: stats.patchOuterUncoveredSectors <= baseline.patchOuterUncoveredSectors,
      boundedPointCost: stats.points <= baseline.points * 1.1,
      boundedTriangleCost: stats.tris <= baseline.tris * 1.1,
    };
    const gatePass = Object.values(gates).every(Boolean);
    const report = {
      schema: 'pf.strata.corridor-r6-structured-seed/1',
      source: { loci: S30_LOCI_PATH, patches: S30_PATCH_PATH, controlTag: 'gothicarches_ring_DS-HT_S30C1' },
      isolation: 'historical cap-4 points and S30 ownership remain fixed; only non-crossing collar rails and matched radial rungs are added as constraints after point placement',
      inputHygiene: {
        planarize: process.env.PF_S10_PLANARIZE === '1',
        conditionProjection: process.env.PF_S10_COND_PROJECT === '1',
      },
      control: { stats: baseline, transition: controlTransition, repairBans: baseline.banApplied },
      candidate: {
        rounds: built.roundsUsed,
        repairBans: built.banned,
        stats,
        transition,
        gates,
        gatePass,
        deltas: {
          points: stats.points - baseline.points,
          tris: stats.tris - baseline.tris,
          constraints: stats.constraints - baseline.constraints,
          crossings: stats.edgesCrossingLocus - baseline.edgesCrossingLocus,
          fanHubs: transition.fanHubs - controlTransition.fanHubs,
          maximumFanDegree: transition.maximumFanDegree - controlTransition.maximumFanDegree,
          needles: transition.needles - controlTransition.needles,
          longAr20: transition.longAr20 - controlTransition.longAr20,
        },
      },
      decision: gatePass
        ? 'GO: run the structured collar on the exact S30C1 full mesh and re-bake the independent visual proxy'
        : 'STOP: structured collar did not reduce deterministic fan topology without opening another seed defect channel',
    };
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'S32_R6_STRUCTURED_SEED.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(stats.constraintsRecovered).toBe(stats.constraints);
    expect(stats.negArea).toBe(0);
  }, 900_000);

  it.runIf(RUN_R7)('confines structured connectivity to the outer feature-corridor boundary', () => {
    if (process.env.PF_S10_PLANARIZE !== '1') {
      throw new Error('S32 R7 requires PF_S10_PLANARIZE=1: R6 proved the 102k-edge collar loses 3 constraints without the last-mile PSLG guard.');
    }
    const { loci, patches } = readArtifacts(S30_LOCI_PATH, S30_PATCH_PATH);
    const serialized = loci.seed;
    if (serialized === undefined) throw new Error('S32 R7: S30C1 loci artifact has no serialized seed baseline');
    const baseline = serialized as unknown as AlignedSeed['stats'];
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    const controlTransition: SeedTransitionCensus = {
      longFacetsGe500um: 114149,
      fanHubs: 159,
      maximumFanDegree: 30,
      needles: 0,
      longAr20: 188,
    };
    const requested = (process.env.PF_STRATA_CORRIDOR_COLLAR_MODE ?? 'outer,outer-cell')
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is 'rails' | 'outer' | 'outer-cell' => (
        value === 'rails' || value === 'outer' || value === 'outer-cell'
      ));
    if (requested.length === 0) throw new Error('S32 R7 needs PF_STRATA_CORRIDOR_COLLAR_MODE=rails, outer, or outer-cell');
    const common = {
      ...DEFAULT_SEED_OPTS,
      H,
      gu: 200,
      gv: 140,
      acrossAbs: true,
      acrossMinMm: 0.05,
      seedARmax: 24,
      acrossRings: 7,
      acrossGrade: 1.6,
      acrossStrideMax: 4,
      acrossStructured: true,
      acrossMaxMm: 0.65,
      turnMul: 9,
      patchRoute: patches,
      patchMaxMm: 1.5,
      patchSubMax: 16,
      patchExclusionIds: new Set([54]),
      tolMm: 0.01,
      shapeAR: 50,
    };
    const arms = requested.map((mode) => {
      const built = buildAlignedSeedRepaired(radius, loci, {
        ...common,
        acrossStructuredMode: mode,
      }, 6);
      const stats = built.seed.stats;
      const transition = seedTransitionCensus(built.seed, radius);
      const gates = {
        collarConnectivityAdmitted: stats.collarRailConstraints > 0
          && (mode === 'outer' || mode === 'rails' || stats.collarRungConstraints > 0),
        fewerFanHubs: transition.fanHubs < controlTransition.fanHubs,
        noWorseMaximumFanDegree: transition.maximumFanDegree <= controlTransition.maximumFanDegree,
        noMoreNeedles: transition.needles <= controlTransition.needles,
        noMoreLongAr20: transition.longAr20 <= controlTransition.longAr20,
        noNewLocusCrossings: stats.edgesCrossingLocus <= baseline.edgesCrossingLocus,
        noExtraRepairBans: built.banned <= baseline.banApplied,
        constraintsExact: stats.constraintsRecovered === stats.constraints,
        noNegativeArea: stats.negArea === 0,
        noWorseOverCap: stats.overCap <= baseline.overCap,
        noWorseWorstAR: stats.worstAR <= baseline.worstAR + 1e-9,
        samePatchOwnership: stats.patchExclusionRegions === baseline.patchExclusionRegions,
        noNewUnownedOuterSectors: stats.patchOuterUncoveredSectors <= baseline.patchOuterUncoveredSectors,
        boundedPointCost: stats.points <= baseline.points * 1.1,
        boundedTriangleCost: stats.tris <= baseline.tris * 1.1,
      };
      return {
        mode,
        rounds: built.roundsUsed,
        repairBans: built.banned,
        stats,
        transition,
        gates,
        gatePass: Object.values(gates).every(Boolean),
        deltas: {
          points: stats.points - baseline.points,
          tris: stats.tris - baseline.tris,
          constraints: stats.constraints - baseline.constraints,
          crossings: stats.edgesCrossingLocus - baseline.edgesCrossingLocus,
          fanHubs: transition.fanHubs - controlTransition.fanHubs,
          maximumFanDegree: transition.maximumFanDegree - controlTransition.maximumFanDegree,
          needles: transition.needles - controlTransition.needles,
          longAr20: transition.longAr20 - controlTransition.longAr20,
        },
      };
    });
    const winner = arms
      .filter((arm) => arm.gatePass)
      .sort((a, b) => a.transition.fanHubs - b.transition.fanHubs
        || a.transition.longAr20 - b.transition.longAr20
        || a.stats.constraints - b.stats.constraints)[0] ?? null;
    const report = {
      schema: 'pf.strata.corridor-r7-boundary-seed/1',
      source: { loci: S30_LOCI_PATH, patches: S30_PATCH_PATH, controlTag: 'gothicarches_ring_DS-HT_S30C1' },
      isolation: 'historical cap-4 points, S30 ownership and inner free-Steiner collar stay fixed; only outer-boundary rails, optionally with one inward rung layer, are constrained',
      inputHygiene: { planarize: true, conditionProjection: process.env.PF_S10_COND_PROJECT === '1' },
      control: { stats: baseline, transition: controlTransition, repairBans: baseline.banApplied },
      arms,
      winner: winner === null ? null : { mode: winner.mode, transition: winner.transition, stats: winner.stats },
      decision: winner === null
        ? 'STOP: outer-boundary connectivity did not clear every seed gate'
        : `GO: run ${winner.mode} on the exact S30C1 full mesh and re-bake the independent visual proxy`,
    };
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    const suffix = requested.join('_').replaceAll('-', '').toUpperCase();
    writeFileSync(join(outDir, `S32_R7_${suffix}_SEED.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    for (const arm of arms) {
      expect(arm.stats.constraintsRecovered).toBe(arm.stats.constraints);
      expect(arm.stats.negArea).toBe(0);
    }
  }, 900_000);

  it.runIf(FINAL_STL !== '')('measures the former H2 witness and its quarter-turn controls on the full shadow mesh', () => {
    const { loci } = readArtifacts();
    const H = loci.run.dims.H;
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, H).rA;
    const { xyz, nTri } = readMeshFloat64(FINAL_STL, false);
    const maximumEdgeMm = maximumStlEdgeMm(xyz, nTri);
    const copies = Array.from({ length: 4 }, (_unused, turn) => {
      const theta = canonTheta(WITNESS.theta + turn * Math.PI / 2);
      const r = radius(theta, WITNESS.z);
      const point = [r * Math.cos(theta), r * Math.sin(theta), WITNESS.z] as const;
      return { turn, theta, ...closestStlCarrier(xyz, nTri, point, maximumEdgeMm) };
    });
    const outDir = join('research', 'exchange', '_strataCorridorOwnership');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'FINAL_S30C1.json'), `${JSON.stringify({
      schema: 'pf.strata.corridor-final/1', source: FINAL_STL, nTri, witness: WITNESS, copies,
    }, null, 2)}\n`, 'utf8');
    expect(Math.max(...copies.map((copy) => copy.gapMm * 1000))).toBeLessThanOrEqual(10);
  }, 120_000);
});
