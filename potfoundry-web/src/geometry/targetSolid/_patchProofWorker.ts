/**
 * _patchProofWorker.ts — worker_threads entry for the parallel per-patch
 * proof pool. NOT imported by application code: bundled on demand by
 * parallelPatchProofPool (esbuild native binary) exactly like the Tier-C
 * parallel scorer's worker.
 *
 * Each worker mints its own FinalArtifactProofSession from the (cloned) STL
 * bytes — the parser computes the identical artifact hashes, and the replay
 * on the main thread cross-checks every proof's hash bindings against ITS
 * session, so worker sessions add no forgeable surface. Evaluators are
 * recompiled in-worker from {targetSha256, programCanonicalJson} and their
 * program/proof hashes are cross-checked against the main thread's handles
 * before any proof runs (an environment divergence is an infrastructure
 * failure, never a refusal).
 */
import { parentPort, workerData } from 'node:worker_threads';

import {
  certifyContinuousMappedPatchDistance,
  ContinuousMappedPatchDistanceError,
  type ContinuousMappedPatchDistanceOptions,
} from './continuousMappedPatchDistance';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import type { ExactDyadicDomainPartitionInput } from './exactDyadicDomainPartition';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

interface PatchProofRequest {
  readonly patchId: string;
  readonly partition: ExactDyadicDomainPartitionInput;
  readonly targetSha256: string;
  readonly programCanonicalJson: string;
  readonly expectedEvaluatorProgramSha256: string;
  readonly expectedEvaluatorProofSha256: string;
  readonly maximumGeometricUpperPm: bigint;
  readonly maxDepth?: number;
  readonly maxWorkCells: number;
  readonly maxEvaluatorWorkUnits: number;
  readonly partitionOptions: {
    readonly maxTriangles: number;
    readonly maxBuildWork: number;
    readonly maxBvhNodes: number;
    readonly maxTraversalVisits: number;
    readonly maxBroadPhasePairChecks: number;
    readonly maxPairChecks: number;
  };
  readonly deadlineEpochMilliseconds: number;
  readonly cancellationFlag?: Int32Array;
}

const port = parentPort;
if (port === null) {
  throw new Error('patch-proof worker must run inside a worker thread');
}
const data = workerData as { stlBytes: Uint8Array };
const session = createFinalArtifactProofSession(data.stlBytes);

port.on('message', (request: PatchProofRequest) => {
  try {
    const evaluator = compileValidatedResidualEvaluator({
      targetSha256: request.targetSha256,
      programCanonicalJson: request.programCanonicalJson,
    });
    if (
      evaluator.evaluatorProgramSha256 !== request.expectedEvaluatorProgramSha256 ||
      evaluator.evaluatorProofSha256 !== request.expectedEvaluatorProofSha256
    ) {
      port.postMessage({
        patchId: request.patchId,
        infrastructureFailure:
          'worker-recompiled evaluator hashes do not match the main-thread handle',
      });
      return;
    }
    const options: ContinuousMappedPatchDistanceOptions = {
      maximumGeometricUpperPm: request.maximumGeometricUpperPm,
      ...(request.maxDepth === undefined ? {} : { maxDepth: request.maxDepth }),
      maxWorkCells: request.maxWorkCells,
      maxEvaluatorWorkUnits: request.maxEvaluatorWorkUnits,
      partition: {
        ...request.partitionOptions,
        deadlineEpochMilliseconds: request.deadlineEpochMilliseconds,
      },
      deadlineEpochMilliseconds: request.deadlineEpochMilliseconds,
      ...(request.cancellationFlag === undefined
        ? {}
        : { cancellationFlag: request.cancellationFlag }),
    };
    const proof = certifyContinuousMappedPatchDistance(
      session,
      request.partition,
      evaluator,
      options
    );
    port.postMessage({ patchId: request.patchId, proof });
  } catch (error) {
    if (error instanceof ContinuousMappedPatchDistanceError) {
      port.postMessage({
        patchId: request.patchId,
        refusal: {
          code:
            error.code === 'CANCELLED'
              ? 'CANCELLED'
              : error.code === 'RESOURCE_LIMIT'
                ? 'RESOURCE_LIMIT'
                : 'REFUSED',
          message: error.message,
          ...(error.artifactTriangleIndex === undefined
            ? {}
            : { artifactTriangleIndex: error.artifactTriangleIndex }),
        },
      });
      return;
    }
    port.postMessage({
      patchId: request.patchId,
      infrastructureFailure: error instanceof Error ? error.message : String(error),
    });
  }
});
