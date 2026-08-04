/**
 * S31 R0 — read-only exact feature-corridor ownership ledger.
 *
 * Gated because it scans the complete 1.26M-facet S30C1 artifact and invokes the
 * driver's own kink predicate on every facet edge. It does not tessellate or edit
 * an STL. Run with PF_STRATA_CORRIDOR_LEDGER=1.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { discoverRoutedAnnuli, type RoutedAnnulusCandidate } from './_strataAlignedSeed';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from './_sweepPredicate';
import type { LocusArtifact } from './_strataLocusTrace';
import type { PatchRegion } from './_judgeShape';
import type { StyleDims } from './labkit';

const RUN = process.env.PF_STRATA_CORRIDOR_LEDGER === '1';
const ROOT = join('research', 'exchange', '_strataConformBisect');
const TAG = process.env.PF_STRATA_CORRIDOR_TAG ?? 'gothicarches_ring_DS-HT_S30C1';
const STL_PATH = join(ROOT, `${TAG}.stl`);
const ERROR_PATH = `${STL_PATH}.error.bin`;
const LOCI_PATH = join(ROOT, `${TAG}.loci.json`);
const PATCH_PATH = join(ROOT, `${TAG}.patches.json`);
const OUT = join('research', 'exchange', '_strataCorridorOwnership', `${TAG}.ledger.json`);
const RREF = 45;
const TWO_PI = 2 * Math.PI;
const RAD2DEG = 180 / Math.PI;
const SNAP_ALPHA = 0.12;
const VISUAL_BUDGET_MM = 0.01;

interface StoredLocusArtifact extends LocusArtifact {
  run: { params: Record<string, number>; dims: StyleDims };
}

interface StoredPatchArtifact { patches: PatchRegion[] }

interface ErrorSidecarHeader {
  magic: string;
  count: number;
  unitsMm: boolean;
  semantics: string;
  budgetMm: number;
}

interface P2 { x: number; y: number }

function readErrorSidecar(path: string): { header: ErrorSidecarHeader; errors: Float32Array } {
  const file = readFileSync(path);
  const newline = file.indexOf(0x0a);
  if (newline < 0) throw new Error(`S31 R0: ${path} has no JSON header terminator`);
  const header = JSON.parse(file.subarray(0, newline).toString('utf8')) as ErrorSidecarHeader;
  const payload = file.subarray(newline + 1);
  if (payload.byteLength !== header.count * 4) {
    throw new Error(`S31 R0: sidecar payload ${payload.byteLength} bytes != ${header.count} float32 values`);
  }
  const copy = Uint8Array.from(payload);
  return { header, errors: new Float32Array(copy.buffer) };
}

function unwrapNear(theta: number, reference: number): number {
  let out = theta;
  while (out - reference > Math.PI) out -= TWO_PI;
  while (reference - out > Math.PI) out += TWO_PI;
  return out;
}

function pointSegmentDistance2(p: P2, a: P2, b: P2): number {
  const ux = b.x - a.x; const uy = b.y - a.y;
  const l2 = ux * ux + uy * uy;
  let t = l2 <= 1e-24 ? 0 : ((p.x - a.x) * ux + (p.y - a.y) * uy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * ux), p.y - (a.y + t * uy));
}

function signedArea2(a: P2, b: P2, c: P2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInTriangle2(p: P2, a: P2, b: P2, c: P2): boolean {
  const s0 = signedArea2(a, b, p); const s1 = signedArea2(b, c, p); const s2 = signedArea2(c, a, p);
  const eps = 1e-12;
  return (s0 >= -eps && s1 >= -eps && s2 >= -eps) || (s0 <= eps && s1 <= eps && s2 <= eps);
}

function triangleDiskRange(
  th0: number, z0: number, th1: number, z1: number, th2: number, z2: number,
  centerTheta: number, centerZ: number,
): { minMm: number; maxMm: number } {
  const u1 = unwrapNear(th1, th0); const u2 = unwrapNear(th2, th0);
  const mean = (th0 + u1 + u2) / 3;
  const center = { x: RREF * unwrapNear(canonTheta(centerTheta), mean), y: centerZ };
  const a = { x: RREF * th0, y: z0 };
  const b = { x: RREF * u1, y: z1 };
  const c = { x: RREF * u2, y: z2 };
  const minMm = pointInTriangle2(center, a, b, c)
    ? 0
    : Math.min(
      pointSegmentDistance2(center, a, b),
      pointSegmentDistance2(center, b, c),
      pointSegmentDistance2(center, c, a),
    );
  return {
    minMm,
    maxMm: Math.max(
      Math.hypot(a.x - center.x, a.y - center.y),
      Math.hypot(b.x - center.x, b.y - center.y),
      Math.hypot(c.x - center.x, c.y - center.y),
    ),
  };
}

function intersectsDisk(
  tri: readonly [number, number, number, number, number, number],
  centerTheta: number,
  centerZ: number,
  radiusMm: number,
): boolean {
  return triangleDiskRange(...tri, centerTheta, centerZ).minMm <= radiusMm;
}

function intersectsAnnulus(
  tri: readonly [number, number, number, number, number, number],
  candidate: RoutedAnnulusCandidate,
): boolean {
  const range = triangleDiskRange(...tri, candidateCenterTheta.get(candidate.junctionId) as number,
    candidateCenterZ.get(candidate.junctionId) as number);
  return range.minMm <= candidate.rawRadiusMm && range.maxMm >= candidate.routedRadiusMm;
}

// Filled once per run; kept outside the hot helper signature to avoid allocating
// candidate-shaped objects for every triangle/candidate pair.
const candidateCenterTheta = new Map<number, number>();
const candidateCenterZ = new Map<number, number>();

function centroidThetaZ(xyz: Float64Array, offset: number): [number, number, readonly [number, number, number, number, number, number]] {
  const t0 = Math.atan2(xyz[offset + 1], xyz[offset]);
  const t1 = unwrapNear(Math.atan2(xyz[offset + 4], xyz[offset + 3]), t0);
  const t2 = unwrapNear(Math.atan2(xyz[offset + 7], xyz[offset + 6]), t0);
  const z0 = xyz[offset + 2]; const z1 = xyz[offset + 5]; const z2 = xyz[offset + 8];
  return [(t0 + t1 + t2) / 3, (z0 + z1 + z2) / 3, [t0, z0, t1, z1, t2, z2]];
}

function nearestLocusDistanceMm(loci: LocusArtifact, theta: number, z: number): number {
  let best = Infinity;
  const x = RREF * theta;
  for (const locus of loci.loci) {
    for (let i = 0; i + 1 < locus.pts.length; i += 1) {
      const aTheta = unwrapNear(locus.pts[i][0], theta);
      const bTheta = unwrapNear(locus.pts[i + 1][0], aTheta);
      const d = pointSegmentDistance2(
        { x, y: z },
        { x: RREF * aTheta, y: locus.pts[i][1] },
        { x: RREF * bTheta, y: locus.pts[i + 1][1] },
      );
      if (d < best) best = d;
    }
  }
  return best;
}

function quantile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function maximum(values: ArrayLike<number>): number {
  let result = -Infinity;
  for (let index = 0; index < values.length; index += 1) result = Math.max(result, values[index]);
  return result;
}

describe('Strata S31 feature-corridor ownership ledger', () => {
  it.runIf(RUN)('reproduces S30C1 and writes exact routed-annulus cohorts', () => {
    candidateCenterTheta.clear();
    candidateCenterZ.clear();
    const loci = JSON.parse(readFileSync(LOCI_PATH, 'utf8')) as StoredLocusArtifact;
    const patches = (JSON.parse(readFileSync(PATCH_PATH, 'utf8')) as StoredPatchArtifact).patches;
    const discovery = discoverRoutedAnnuli(loci, patches, 1.5);
    expect(discovery.ambiguousJunctionIds).toEqual([]);
    expect(discovery.ambiguousPatchIds).toEqual([]);
    expect(discovery.candidates).toHaveLength(12);
    expect(discovery.candidates.some((candidate) => candidate.junctionId === 54)).toBe(true);
    for (const candidate of discovery.candidates) {
      const junction = loci.junctions.find((item) => item.id === candidate.junctionId);
      if (junction === undefined) throw new Error(`S31 R0: lost candidate junction ${candidate.junctionId}`);
      candidateCenterTheta.set(candidate.junctionId, junction.theta);
      candidateCenterZ.set(candidate.junctionId, junction.z);
    }

    const { xyz, nTri } = readMeshFloat64(STL_PATH, false);
    const { header, errors } = readErrorSidecar(ERROR_PATH);
    expect(header.magic).toBe('potscope-error/v1');
    expect(header.count).toBe(nTri);
    expect(header.unitsMm).toBe(true);
    expect(errors.length).toBe(nTri);
    const radius = buildAuditRadiusFn('GothicArches', loci.run.params, loci.run.dims, loci.run.dims.H).rA;
    const pred: SweepPredConst = {
      esN: 8, refHs: 0.03, refNmax: 64,
      kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
      snap: true, confMm: 0.0006,
    };
    const bestDot = (theta: number, z: number, nx: number, ny: number, nz: number): number => {
      const hTheta = 1e-6; const hZ = 1e-6;
      const r0 = radius(canonTheta(theta), z);
      const rTp = radius(canonTheta(theta + hTheta), z);
      const rTm = radius(canonTheta(theta - hTheta), z);
      const rZp = radius(canonTheta(theta), z + hZ);
      const rZm = radius(canonTheta(theta), z - hZ);
      const dtF = (rTp - r0) / hTheta; const dtB = (r0 - rTm) / hTheta; const dtC = (rTp - rTm) / (2 * hTheta);
      const dzF = (rZp - r0) / hZ; const dzB = (r0 - rZm) / hZ; const dzC = (rZp - rZm) / (2 * hZ);
      const ct = Math.cos(theta); const st = Math.sin(theta);
      let best = -1;
      for (const [rt, rz] of [[dtC, dzC], [dtF, dzF], [dtF, dzB], [dtB, dzF], [dtB, dzB]]) {
        const ax = r0 * ct + rt * st; const ay = r0 * st - rt * ct; const az = -r0 * rz;
        const length = Math.hypot(ax, ay, az);
        if (!(length > 0)) continue;
        const dot = (nx * ax + ny * ay + nz * az) / length;
        if (dot > best) best = dot;
      }
      return best;
    };

    const annulusMask = new Uint16Array(nTri);
    const featureSpan = new Uint8Array(nTri);
    const longFacet = new Uint8Array(nTri);
    const needle = new Uint8Array(nTri);
    const shard = new Uint8Array(nTri);
    const kinkMask = new Uint8Array(nTri);
    const hubDegree = new Map<string, number>();
    const hubPosition = new Map<string, { theta: number; z: number }>();
    let nLong = 0; let nFeatureSpan = 0; let nLongFeatureSpan = 0; let nShard = 0;
    let nProperKink = 0; let nProperKinkVisual = 0;

    for (let index = 0; index < nTri; index += 1) {
      const offset = index * 9;
      const ax = xyz[offset]; const ay = xyz[offset + 1]; const az = xyz[offset + 2];
      const bx = xyz[offset + 3]; const by = xyz[offset + 4]; const bz = xyz[offset + 5];
      const cx = xyz[offset + 6]; const cy = xyz[offset + 7]; const cz = xyz[offset + 8];
      const e0 = Math.hypot(bx - ax, by - ay, bz - az);
      const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
      const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
      const longest = Math.max(e0, e1, e2); const shortest = Math.min(e0, e1, e2);
      const [theta, z, tri] = centroidThetaZ(xyz, offset);
      for (let c = 0; c < discovery.candidates.length; c += 1) {
        if (intersectsAnnulus(tri, discovery.candidates[c])) annulusMask[index] |= 1 << c;
      }

      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const normalLength = Math.hypot(nx, ny, nz);
      if (longest >= 0.5) {
        longFacet[index] = 1; nLong += 1;
        for (const [x, y, zz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
          const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(zz * 1e4)}`;
          hubDegree.set(key, (hubDegree.get(key) ?? 0) + 1);
          if (!hubPosition.has(key)) hubPosition.set(key, { theta: Math.atan2(y, x), z: zz });
        }
      }
      needle[index] = shortest < 0.02 * longest ? 1 : 0;
      if (normalLength > 0) {
        nx /= normalLength; ny /= normalLength; nz /= normalLength;
        const deviation = Math.acos(Math.max(-1, Math.min(1, bestDot(theta, z, nx, ny, nz)))) * RAD2DEG;
        const area = normalLength / 2;
        const ar3 = (longest * (e0 + e1 + e2)) / (4 * area);
        if (longest >= 1 && (deviation >= 45 || ar3 >= 20)) { shard[index] = 1; nShard += 1; }
        if (deviation >= 90) {
          const t0 = tri[0]; const t1 = tri[2]; const t2 = tri[4];
          const front = Math.max(
            bestDot(t0, az, nx, ny, nz),
            bestDot(t1, bz, nx, ny, nz),
            bestDot(t2, cz, nx, ny, nz),
          ) > 0;
          if (front) {
            featureSpan[index] = 1; nFeatureSpan += 1;
            if (longFacet[index] !== 0) nLongFeatureSpan += 1;
          }
        }
      }

      let edgeMask = 0;
      const edges = [[tri[0], tri[1], tri[2], tri[3]], [tri[2], tri[3], tri[4], tri[5]], [tri[4], tri[5], tri[0], tri[1]]] as const;
      for (let edge = 0; edge < edges.length; edge += 1) {
        const [ta, za, tb, zb] = edges[edge];
        const kink = locateKinkRaw(radius, ta, za, unwrapNear(tb, ta), zb, pred);
        if (kink !== null && !kink.jump && kink.t > SNAP_ALPHA && kink.t < 1 - SNAP_ALPHA) edgeMask |= 1 << edge;
      }
      kinkMask[index] = edgeMask;
      if (edgeMask !== 0) {
        nProperKink += 1;
        if (errors[index] > VISUAL_BUDGET_MM) nProperKinkVisual += 1;
      }
    }

    const hubs = [...hubDegree]
      .filter(([, degree]) => degree >= 12)
      .map(([key, degree]) => ({ key, degree, ...(hubPosition.get(key) as { theta: number; z: number }) }));
    const hubInCandidate = hubs.filter((hub) => discovery.candidates.some((candidate) => {
      const centerTheta = candidateCenterTheta.get(candidate.junctionId) as number;
      const centerZ = candidateCenterZ.get(candidate.junctionId) as number;
      const distance = Math.hypot(RREF * dThRaw(hub.theta, centerTheta), hub.z - centerZ);
      return distance >= candidate.routedRadiusMm && distance <= candidate.rawRadiusMm;
    }));

    const centroidLocation = { patchAndRaw: 0, patchOnly: 0, rawOnly: 0, neither: 0 };
    const exactLocation = { patchAndRaw: 0, patchOnly: 0, rawOnly: 0, neither: 0 };
    const locusDistances: number[] = [];
    let visualCount = 0; let visualInAnnuli = 0; let featureInAnnuli = 0;
    let longFeatureInAnnuli = 0; let needleInAnnuli = 0; let shardInAnnuli = 0;
    let visualKinkInAnnuli = 0;
    const perCandidate = discovery.candidates.map((candidate) => ({
      ...candidate, visual: 0, featureSpan: 0, longFeatureSpan: 0, needle: 0, shard: 0, properKinkVisual: 0,
    }));
    for (let index = 0; index < nTri; index += 1) {
      const inCandidate = annulusMask[index] !== 0;
      if (featureSpan[index] !== 0 && inCandidate) featureInAnnuli += 1;
      if (featureSpan[index] !== 0 && longFacet[index] !== 0 && inCandidate) longFeatureInAnnuli += 1;
      if (needle[index] !== 0 && inCandidate) needleInAnnuli += 1;
      if (shard[index] !== 0 && inCandidate) shardInAnnuli += 1;
      for (let c = 0; c < perCandidate.length; c += 1) {
        if ((annulusMask[index] & (1 << c)) === 0) continue;
        if (featureSpan[index] !== 0) perCandidate[c].featureSpan += 1;
        if (featureSpan[index] !== 0 && longFacet[index] !== 0) perCandidate[c].longFeatureSpan += 1;
        if (needle[index] !== 0) perCandidate[c].needle += 1;
        if (shard[index] !== 0) perCandidate[c].shard += 1;
      }
      if (!(errors[index] > VISUAL_BUDGET_MM)) continue;
      visualCount += 1;
      const offset = index * 9;
      const [theta, z, tri] = centroidThetaZ(xyz, offset);
      locusDistances.push(nearestLocusDistanceMm(loci, theta, z));
      const centroidPatch = patches.some((patch) => Math.hypot(
        RREF * dThRaw(theta, canonTheta(patch.theta)), z - patch.z,
      ) <= Math.min(patch.radiusMm, 1.5));
      const centroidRaw = loci.junctions.some((junction) => Math.hypot(
        RREF * dThRaw(theta, junction.theta), z - junction.z,
      ) <= junction.radiusMm);
      const exactPatch = patches.some((patch) => intersectsDisk(tri, patch.theta, patch.z, Math.min(patch.radiusMm, 1.5)));
      const exactRaw = loci.junctions.some((junction) => intersectsDisk(tri, junction.theta, junction.z, junction.radiusMm));
      const centroidKey = centroidPatch ? (centroidRaw ? 'patchAndRaw' : 'patchOnly') : (centroidRaw ? 'rawOnly' : 'neither');
      const exactKey = exactPatch ? (exactRaw ? 'patchAndRaw' : 'patchOnly') : (exactRaw ? 'rawOnly' : 'neither');
      centroidLocation[centroidKey] += 1;
      exactLocation[exactKey] += 1;
      if (inCandidate) {
        visualInAnnuli += 1;
        if (kinkMask[index] !== 0) visualKinkInAnnuli += 1;
        for (let c = 0; c < perCandidate.length; c += 1) {
          if ((annulusMask[index] & (1 << c)) === 0) continue;
          perCandidate[c].visual += 1;
          if (kinkMask[index] !== 0) perCandidate[c].properKinkVisual += 1;
        }
      }
    }

    const ownershipAtoms = discovery.candidates.map((candidate) => ({
      junctionId: candidate.junctionId,
      patchId: candidate.patchId,
      classification: candidate.junctionId === 54 ? 'ring-owned-in-S30C1' : 'unowned-routed-annulus',
      rawRadiusMm: candidate.rawRadiusMm,
      routedRadiusMm: candidate.routedRadiusMm,
    }));
    const report = {
      schema: 'pf.strata.corridor-ledger/1',
      source: { stl: STL_PATH, errorSidecar: ERROR_PATH, loci: LOCI_PATH, patches: PATCH_PATH },
      semantics: {
        visualError: header.semantics,
        visualErrorWarning: 'PF_STRATA_BAKE four-sample same-parameter gradient-corrected proxy; NOT exact Euclidean H1',
        exactMembership: 'triangle intersects disk/annulus in the isotropic (45*theta,z) chart',
        needle: 'shortest 3-D edge < 2% of longest 3-D edge',
        properKink: 'locateKinkRaw non-jump with t strictly inside (0.12,0.88)',
      },
      selfValidation: {
        triangles: nTri,
        longFacetsGe500um: nLong,
        featureSpans: nFeatureSpan,
        longFeatureSpans: nLongFeatureSpan,
        shards: nShard,
        fans: hubs.length,
        candidates: discovery.candidates.length,
      },
      discovery,
      ownershipAtoms,
      visual: {
        count: visualCount,
        maximumMm: maximum(errors),
        centroidLocation,
        exactLocation,
        inRoutedAnnuli: visualInAnnuli,
        nearestLocusMm: {
          p10: quantile(locusDistances, 0.10), p25: quantile(locusDistances, 0.25),
          p50: quantile(locusDistances, 0.50), p75: quantile(locusDistances, 0.75),
          p90: quantile(locusDistances, 0.90), p99: quantile(locusDistances, 0.99),
          max: maximum(locusDistances), within650um: locusDistances.filter((distance) => distance <= 0.65).length,
        },
      },
      exactRoutedAnnulusCohorts: {
        featureSpans: featureInAnnuli,
        longFeatureSpans: longFeatureInAnnuli,
        needles: needleInAnnuli,
        shards: shardInAnnuli,
        fans: hubInCandidate.length,
        visualOver10um: visualInAnnuli,
        visualWithProperKink: visualKinkInAnnuli,
      },
      properKink: {
        facets: nProperKink,
        visualFacets: nProperKinkVisual,
        visualRecall: visualCount === 0 ? 0 : nProperKinkVisual / visualCount,
      },
      perCandidate,
    };
    mkdirSync(join('research', 'exchange', '_strataCorridorOwnership'), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    if (TAG === 'gothicarches_ring_DS-HT_S30C1') {
      expect(nLong).toBe(202_920);
      expect(nFeatureSpan).toBe(4_481);
      expect(nLongFeatureSpan).toBe(392);
      expect(nShard).toBe(201);
      expect(hubs).toHaveLength(26);
      expect(visualCount).toBe(4_145);
      expect(centroidLocation).toEqual({ patchAndRaw: 1_206, patchOnly: 10, rawOnly: 1_831, neither: 1_098 });
      // Segment-exact chart distance places seven more facets inside the 650 um
      // corridor than the earlier nearest-serialized-vertex diagnostic (4,132).
      expect(locusDistances.filter((distance) => distance <= 0.65)).toHaveLength(4_139);
    }
    expect(centroidLocation.patchAndRaw + centroidLocation.patchOnly + centroidLocation.rawOnly + centroidLocation.neither).toBe(visualCount);
    expect(exactLocation.patchAndRaw + exactLocation.patchOnly + exactLocation.rawOnly + exactLocation.neither).toBe(visualCount);
  }, 600_000);
});
