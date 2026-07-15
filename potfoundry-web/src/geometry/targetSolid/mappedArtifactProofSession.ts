import type { ParsedBinaryStlArtifact } from './binaryStlArtifact';
import {
  parsedArtifactForProofSession,
  type FinalArtifactProofSession,
} from './finalArtifactProofSession';
import {
  parsedObjArtifactForProofSession,
  type ObjFinalArtifactProofSession,
  type ParsedObjArtifact,
} from './objArtifact';
import {
  parsedThreeMfArtifactForProofSession,
  type ParsedThreeMfArtifact,
  type ThreeMfFinalArtifactProofSession,
} from './threeMfArtifact';

/** Authenticated final-byte sessions accepted by mapped geometry proofs. */
export type MappedArtifactProofSession =
  | FinalArtifactProofSession
  | ThreeMfFinalArtifactProofSession
  | ObjFinalArtifactProofSession;

export type ParsedMappedArtifact =
  | ParsedBinaryStlArtifact
  | ParsedThreeMfArtifact
  | ParsedObjArtifact;

/**
 * Resolve a format-specific unforgeable session without accepting structural
 * lookalikes. Each parser retains its private geometry snapshot in a WeakMap.
 */
export function parsedMappedArtifactForProofSession(
  session: MappedArtifactProofSession
): ParsedMappedArtifact {
  if (typeof session !== 'object' || session === null) {
    throw new TypeError('Mapped artifact proof session is invalid');
  }
  switch (session.format) {
    case 'stl':
      return parsedArtifactForProofSession(session);
    case '3mf':
      return parsedThreeMfArtifactForProofSession(session);
    case 'obj':
      return parsedObjArtifactForProofSession(session);
  }
  throw new TypeError('Mapped artifact proof session format is unsupported');
}
