import {
  generatedTargetProgramBackendsForProof,
  type GeneratedTargetProgramBackends,
} from './validatedResidualProgram';
import {
  styleOuterWallTargetRegistryForProof,
  type OuterWallTargetPatchRole,
  type StyleOuterWallTargetRegistryBinding,
} from './styleOuterWallTargetRegistry';

export interface AuthenticatedStyleOuterWallTargetProgram {
  readonly patchId: string;
  readonly role: OuterWallTargetPatchRole;
  readonly kind: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

interface ProgramPatchLike {
  readonly patchId: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
}

function fail(message: string): never {
  throw new TypeError(`Style outer-wall target programs refused: ${message}`);
}

/**
 * Reauthenticate a style registry and expose its exact canonical target
 * programs in the registry's committed patch order.
 */
export function styleOuterWallTargetProgramsForProof(
  value: StyleOuterWallTargetRegistryBinding
): readonly AuthenticatedStyleOuterWallTargetProgram[] {
  const binding = styleOuterWallTargetRegistryForProof(value);
  const source = binding.sourceBinding;
  const sourcePatches = (
    'patches' in source ? source.patches : [source]
  ) as unknown as readonly ProgramPatchLike[];
  const byPatchId = new Map<string, ProgramPatchLike>();
  for (const patch of sourcePatches) {
    if (byPatchId.has(patch.patchId)) fail(`duplicate source patch '${patch.patchId}'`);
    const backends = generatedTargetProgramBackendsForProof(patch.backends);
    if (
      typeof patch.programCanonicalJson !== 'string' ||
      backends.programSha256 !== patch.programSha256 ||
      backends.nodeCount !== patch.nodeCount ||
      backends.patchId !== patch.patchId
    ) {
      fail(`source patch '${patch.patchId}' has inconsistent generated backends`);
    }
    byPatchId.set(patch.patchId, patch);
  }
  if (byPatchId.size !== binding.patchCount) {
    fail('source program count does not match the authenticated registry');
  }
  return Object.freeze(
    binding.patches.map((summary) => {
      const patch = byPatchId.get(summary.patchId);
      if (
        patch === undefined ||
        patch.programSha256 !== summary.programSha256 ||
        patch.nodeCount !== summary.nodeCount
      ) {
        fail(`registry patch '${summary.patchId}' does not match its source program`);
      }
      return Object.freeze({
        patchId: summary.patchId,
        role: summary.role,
        kind: summary.kind,
        programCanonicalJson: patch.programCanonicalJson,
        programSha256: summary.programSha256,
        nodeCount: summary.nodeCount,
        backends: patch.backends,
      });
    })
  );
}
