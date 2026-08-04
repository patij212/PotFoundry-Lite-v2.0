/**
 * Compose independently certified, disjoint S40 corridor-cavity transactions.
 * Opt in with PF_STRATA_CORRIDOR_COMPOSE=1 after generating the target probes.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { topologyMetric } from '../../src/fidelity/metrics';
import { aspect3 } from './_shapeGuard';

const RUN = process.env.PF_STRATA_CORRIDOR_COMPOSE === '1';
const SOURCE_TAG = 'gothicarches_ring_DS-HT_S40VFC';
const OUTPUT_TAG = 'gothicarches_ring_DS-HT_S44ACC';
const DEFAULT_TARGET = 209529;
const TARGETS = [
  DEFAULT_TARGET,
  198213, 642596, 155204, 153505, 171202, 153462, 153449, 22187, 22221,
  505402, 308565, 690449, 894914, 815769, 751256, 1057114, 1100000, 580401, 1142168,
  1014590, 739006,
];

interface PatchReport {
  result: {
    accepted: boolean;
    selectedParents: number;
    proposal?: {
      addTriangles: Array<[number, number, number]>;
      certificate: {
        boundaryUnchanged: boolean;
        missingConstraintEdges: number;
        properCrossings: number;
        nonManifoldEdges: number;
        newWorstAr: number;
        newVisualOver: number;
        newWorstVisualMm: number;
      };
    };
  };
}

interface StlArtifact { buffer: Buffer; triangles: number }

function readStl(path: string): StlArtifact {
  const buffer = readFileSync(path);
  if (buffer.length < 84) throw new Error(`STL too short: ${path}`);
  const triangles = buffer.readUInt32LE(80);
  if (buffer.length !== 84 + triangles * 50) throw new Error(`STL size mismatch: ${path}`);
  return { buffer, triangles };
}

function readErrors(path: string): Float32Array {
  const buffer = readFileSync(path);
  const newline = buffer.indexOf(10);
  if (newline < 0 || (buffer.length - newline - 1) % 4 !== 0) throw new Error(`invalid error sidecar: ${path}`);
  const bytes = Uint8Array.from(buffer.subarray(newline + 1));
  return new Float32Array(bytes.buffer);
}

function triangleCoordinatesEqual(a: Buffer, ai: number, b: Buffer, bi: number): boolean {
  const ao = 84 + ai * 50 + 12; const bo = 84 + bi * 50 + 12;
  return a.subarray(ao, ao + 36).equals(b.subarray(bo, bo + 36));
}

function summarizeErrors(errors: Float32Array): Record<string, number> {
  const sorted = Float32Array.from(errors).sort();
  const at = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  const out: Record<string, number> = {
    triangles: errors.length,
    p50Um: at(0.5) * 1000,
    p99Um: at(0.99) * 1000,
    p999Um: at(0.999) * 1000,
    maxUm: (sorted.at(-1) ?? 0) * 1000,
  };
  for (const thresholdUm of [10, 20, 30, 50, 75, 100, 125, 150]) {
    let count = 0;
    for (const value of errors) if (value > thresholdUm / 1000) count += 1;
    out[`over${thresholdUm}Um`] = count;
  }
  return out;
}

function meshAudit(stl: StlArtifact): {
  topology: ReturnType<typeof topologyMetric>;
  overAr50: number;
  worstAr: number;
  degenerate: number;
} {
  const vertices = new Float32Array(stl.triangles * 9);
  const indices = new Uint32Array(stl.triangles * 3);
  let overAr50 = 0; let worstAr = 0; let degenerate = 0;
  for (let triangle = 0; triangle < stl.triangles; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    for (let coordinate = 0; coordinate < 9; coordinate += 1) {
      vertices[triangle * 9 + coordinate] = stl.buffer.readFloatLE(offset + coordinate * 4);
    }
    indices[triangle * 3] = triangle * 3;
    indices[triangle * 3 + 1] = triangle * 3 + 1;
    indices[triangle * 3 + 2] = triangle * 3 + 2;
    const o = triangle * 9;
    const ar = aspect3(
      vertices[o], vertices[o + 1], vertices[o + 2],
      vertices[o + 3], vertices[o + 4], vertices[o + 5],
      vertices[o + 6], vertices[o + 7], vertices[o + 8],
    );
    if (!Number.isFinite(ar)) degenerate += 1;
    worstAr = Math.max(worstAr, ar);
    if (ar > 50) overAr50 += 1;
  }
  return { topology: topologyMetric({ vertices, indices }, 0.00005), overAr50, worstAr, degenerate };
}

describe.runIf(RUN)('S40 Gothic certified corridor composition', () => {
  it('composes only disjoint atomic patches and audits the whole exported mesh', () => {
    const sourceDir = resolve('research', 'exchange', '_strataConformBisect');
    const patchDir = resolve('research', 'exchange', '_strataCorridorCavity');
    const sourcePath = join(sourceDir, `${SOURCE_TAG}.stl`);
    const source = readStl(sourcePath);
    const sourceErrors = readErrors(`${sourcePath}.error.bin`);
    expect(sourceErrors.length).toBe(source.triangles);

    const removed = new Set<number>();
    const patchRecords: Buffer[] = [];
    const patchErrors: number[] = [];
    const patchSummary: Array<Record<string, unknown>> = [];
    for (const target of TARGETS) {
      const suffix = target === DEFAULT_TARGET ? '' : `.target-${target}`;
      const reportPath = join(patchDir, `${SOURCE_TAG}.worst-component${suffix}.json`);
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as PatchReport;
      expect(report.result.accepted).toBe(true);
      expect(report.result.proposal?.certificate.boundaryUnchanged).toBe(true);
      expect(report.result.proposal?.certificate.missingConstraintEdges).toBe(0);
      expect(report.result.proposal?.certificate.properCrossings).toBe(0);
      expect(report.result.proposal?.certificate.nonManifoldEdges).toBe(0);
      expect(report.result.proposal?.certificate.newWorstAr).toBeLessThanOrEqual(50);
      expect(report.result.proposal?.certificate.newVisualOver).toBe(0);

      const candidateTag = target === DEFAULT_TARGET ? 'gothicarches_ring_DS-HT_S41ACC' : `gothicarches_ring_DS-HT_S41ACC-t${target}`;
      const candidatePath = join(patchDir, `${candidateTag}.stl`);
      const candidate = readStl(candidatePath);
      const candidateErrors = readErrors(`${candidatePath}.error.bin`);
      expect(candidateErrors.length).toBe(candidate.triangles);
      const kept = source.triangles - report.result.selectedParents;
      const added = candidate.triangles - kept;
      expect(added).toBe(report.result.proposal?.addTriangles.length);

      let candidateCursor = 0;
      const localRemoved: number[] = [];
      for (let sourceTriangle = 0; sourceTriangle < source.triangles; sourceTriangle += 1) {
        if (candidateCursor < kept
          && triangleCoordinatesEqual(source.buffer, sourceTriangle, candidate.buffer, candidateCursor)) {
          candidateCursor += 1;
        } else {
          expect(removed.has(sourceTriangle), `patch ${target} overlaps source triangle ${sourceTriangle}`).toBe(false);
          removed.add(sourceTriangle); localRemoved.push(sourceTriangle);
        }
      }
      expect(candidateCursor).toBe(kept);
      expect(localRemoved).toHaveLength(report.result.selectedParents);
      for (let triangle = kept; triangle < candidate.triangles; triangle += 1) {
        const offset = 84 + triangle * 50;
        patchRecords.push(Buffer.from(candidate.buffer.subarray(offset, offset + 50)));
        patchErrors.push(candidateErrors[triangle]);
      }
      patchSummary.push({
        target,
        removed: localRemoved.length,
        added,
        newWorstAr: report.result.proposal?.certificate.newWorstAr,
        newWorstVisualUm: (report.result.proposal?.certificate.newWorstVisualMm ?? 0) * 1000,
      });
    }

    const outputTriangles = source.triangles - removed.size + patchRecords.length;
    const output = Buffer.allocUnsafe(84 + outputTriangles * 50).fill(0);
    output.write('PotFoundry Strata S44 composed atomic corridor cavities', 0, 'ascii');
    output.writeUInt32LE(outputTriangles, 80);
    const outputErrors = new Float32Array(outputTriangles);
    let outputTriangle = 0;
    for (let triangle = 0; triangle < source.triangles; triangle += 1) {
      if (removed.has(triangle)) continue;
      source.buffer.copy(output, 84 + outputTriangle * 50, 84 + triangle * 50, 84 + (triangle + 1) * 50);
      outputErrors[outputTriangle] = sourceErrors[triangle];
      outputTriangle += 1;
    }
    for (let patch = 0; patch < patchRecords.length; patch += 1) {
      patchRecords[patch].copy(output, 84 + outputTriangle * 50);
      outputErrors[outputTriangle] = patchErrors[patch];
      outputTriangle += 1;
    }
    expect(outputTriangle).toBe(outputTriangles);

    mkdirSync(patchDir, { recursive: true });
    const outputPath = join(patchDir, `${OUTPUT_TAG}.stl`);
    writeFileSync(outputPath, output);
    const errorHeader = Buffer.from(`${JSON.stringify({
      magic: 'potscope-error/v1',
      style: 'GothicArches',
      variant: 'twenty-two-disjoint-certified-atomic-corridor-cavities',
      count: outputErrors.length,
      unitsMm: true,
      semantics: 'S40 sidecar retained outside cavities; each replacement inherited from its strict local certificate',
      budgetMm: 0.01,
      stats: summarizeErrors(outputErrors),
    })}\n`, 'utf8');
    writeFileSync(`${outputPath}.error.bin`, Buffer.concat([
      errorHeader,
      Buffer.from(outputErrors.buffer, outputErrors.byteOffset, outputErrors.byteLength),
    ]));

    const sourceAudit = meshAudit(source);
    const outputAudit = meshAudit({ buffer: output, triangles: outputTriangles });
    const retainedWorst = Array.from(sourceErrors, (errorMm, sourceTriangle) => ({ sourceTriangle, errorMm }))
      .filter(({ sourceTriangle }) => !removed.has(sourceTriangle))
      .sort((a, b) => b.errorMm - a.errorMm || a.sourceTriangle - b.sourceTriangle)
      .slice(0, 25)
      .map(({ sourceTriangle, errorMm }) => ({ sourceTriangle, errorUm: errorMm * 1000 }));
    const report = {
      sourceTag: SOURCE_TAG,
      outputTag: OUTPUT_TAG,
      outputPath,
      targets: TARGETS,
      patches: patchSummary,
      removedTriangles: removed.size,
      addedTriangles: patchRecords.length,
      sourceErrors: summarizeErrors(sourceErrors),
      outputErrors: summarizeErrors(outputErrors),
      retainedWorst,
      sourceAudit,
      outputAudit,
    };
    writeFileSync(join(patchDir, `${OUTPUT_TAG}.report.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(outputAudit.topology.nonManifoldEdges).toBe(0);
    expect(outputAudit.topology.orientationMismatches).toBe(0);
    expect(outputAudit.topology.boundaryEdges).toBe(sourceAudit.topology.boundaryEdges);
    expect(outputAudit.degenerate).toBe(0);
    expect(outputAudit.overAr50).toBeLessThan(sourceAudit.overAr50);
    expect(summarizeErrors(outputErrors).over125Um).toBe(0);
  }, 300_000);
});
