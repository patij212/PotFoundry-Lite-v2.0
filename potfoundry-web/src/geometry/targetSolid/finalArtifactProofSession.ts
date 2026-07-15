import {
  parseBinaryStlArtifact,
  type ParseBinaryStlOptions,
  type ParsedBinaryStlArtifact,
} from './binaryStlArtifact';

export const FINAL_ARTIFACT_PROOF_SESSION_VERSION =
  'potfoundry.final-artifact-proof-session/v1' as const;

export interface FinalArtifactProofSession {
  readonly version: typeof FINAL_ARTIFACT_PROOF_SESSION_VERSION;
  readonly format: 'stl';
  readonly byteLength: number;
  readonly triangleCount: number;
  readonly byteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly parserVersion: string;
  readonly parserProofSha256: string;
}

const parsedArtifacts = new WeakMap<FinalArtifactProofSession, ParsedBinaryStlArtifact>();

/** Parse final bytes once and mint an unforgeable in-process proof session. */
export function createFinalArtifactProofSession(
  source: ArrayBuffer | Uint8Array,
  options: ParseBinaryStlOptions = {}
): FinalArtifactProofSession {
  const parsed = parseBinaryStlArtifact(source, options);
  const session = Object.freeze({
    version: FINAL_ARTIFACT_PROOF_SESSION_VERSION,
    format: parsed.format,
    byteLength: parsed.byteLength,
    triangleCount: parsed.triangleCount,
    byteSha256: parsed.byteSha256,
    parsedArtifactSha256: parsed.parsedArtifactSha256,
    parsedTriangleSetSha256: parsed.parsedTriangleSetSha256,
    parserVersion: parsed.parserVersion,
    parserProofSha256: parsed.parserProofSha256,
  });
  parsedArtifacts.set(session, parsed);
  return session;
}

/** Internal proof-kernel bridge. Structural lookalikes that were not minted above refuse. */
export function parsedArtifactForProofSession(
  session: FinalArtifactProofSession
): ParsedBinaryStlArtifact {
  if (typeof session !== 'object' || session === null) {
    throw new TypeError('Final artifact proof session is invalid');
  }
  const parsed = parsedArtifacts.get(session);
  if (parsed === undefined) {
    throw new TypeError('Final artifact proof session was not minted by the exact parser');
  }
  return parsed;
}
