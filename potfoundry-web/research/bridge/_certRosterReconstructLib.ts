// _certRosterReconstructLib.ts — the cheap prefix of the certifies-at bake:
// atlas -> tessellate (NO enclosure loop), producing per-triangle localization
// (loc.bin) and freshly recomputed provenance hashes for the staleness guard.
// Reuses the shared roster (./_certRoster) and the same target/proof-session
// machinery the error bake uses — no re-implemented surface.
import { createHash } from 'node:crypto';
import { tessellateAnnularRadialSolidTargetForCertification } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from '../../src/geometry/targetSolid/finalArtifactProofSession';
import { atlas, type CertifiedPot } from './_certRoster';

export interface Provenance {
  readonly targetSha256: string;
  readonly artifactByteSha256: string;
  readonly parsedTriangleSetSha256: string;
}

export interface ReconstructResult {
  readonly stlBytes: Buffer;
  readonly triangleCount: number;
  readonly provenance: Provenance;
  readonly patches: string[];
  readonly locBuffer: Buffer;
}

export function normalizeNumerator(
  numeratorStr: string,
  fractionBits: number,
  oddFactorStr?: string
): number {
  const denominator = Number(oddFactorStr ?? '1') * 2 ** fractionBits;
  return Number(numeratorStr) / denominator;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function configDigest(pot: CertifiedPot): string {
  const canonical = canonicalJson({
    geometry: pot.geometry,
    styleParams: pot.styleParams,
    divisions: pot.divisions,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function reconstructPot(pot: CertifiedPot): ReconstructResult {
  const binding = atlas(pot.geometry, pot.styleParams, pot.styleId);
  const tessellation = tessellateAnnularRadialSolidTargetForCertification(
    binding,
    pot.divisions
  );
  const stlBytes = Buffer.from(
    tessellation.stlBytes.buffer,
    tessellation.stlBytes.byteOffset,
    tessellation.stlBytes.byteLength
  );
  const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
    binding.surfaceComplex
  );
  const session = createFinalArtifactProofSession(tessellation.stlBytes);
  const provenance: Provenance = {
    targetSha256: target.targetSha256,
    artifactByteSha256: session.byteSha256,
    parsedTriangleSetSha256: session.parsedTriangleSetSha256,
  };

  const patches = tessellation.partitions.map((partition) => partition.patchId);
  const patchIndex = new Map(patches.map((id, i) => [id, i]));
  const count = tessellation.triangleCount;
  const body = new Float32Array(count * 7);
  for (const partition of tessellation.partitions) {
    const pIdx = patchIndex.get(partition.patchId);
    if (pIdx === undefined) throw new Error(`unindexed patch ${partition.patchId}`);
    const oddFactor = partition.oddDenominatorFactor;
    for (const tri of partition.triangles) {
      const base = tri.artifactTriangleIndex * 7;
      body[base] = pIdx;
      for (let k = 0; k < 3; k += 1) {
        body[base + 1 + k * 2] = normalizeNumerator(
          tri.vertices[k].uNumerator,
          partition.fractionBits,
          oddFactor
        );
        body[base + 2 + k * 2] = normalizeNumerator(
          tri.vertices[k].vNumerator,
          partition.fractionBits,
          oddFactor
        );
      }
    }
  }

  const header = JSON.stringify({
    magic: 'potscope-loc/v1',
    style: pot.styleId,
    variant: pot.name,
    count,
    patches,
    provenance,
  });
  const locBuffer = Buffer.concat([
    Buffer.from(`${header}\n`, 'utf8'),
    Buffer.from(body.buffer, 0, body.byteLength),
  ]);

  return { stlBytes, triangleCount: count, provenance, patches, locBuffer };
}
