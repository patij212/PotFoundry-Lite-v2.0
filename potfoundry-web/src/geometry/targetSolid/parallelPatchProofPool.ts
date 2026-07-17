/**
 * parallelPatchProofPool.ts — per-patch proof workers for the composed
 * final-STL prover (Node worker_threads; research/CI track).
 *
 * The pool ONLY parallelizes wall-clock: each patch proof runs in a worker at
 * the sequential prover's FIRST-ITERATION caps
 * ({@link resolveParallelPatchProofDispatches} — one source of truth), and the
 * outcomes are replayed through the UNCHANGED sequential prover via a minted
 * {@link MintedParallelPatchProofs} container. Every budget, binding, and
 * aggregate check runs exactly as in a sequential run, in canonical patch
 * order — so certified results are byte-identical (the aggregate pools never
 * bind in certified runs, hence worker inputs are identical to sequential
 * inputs), and refusal runs refuse with the identical code and message text
 * (the synthesized aggregate-pool refusals omit only the triangle-index
 * detail). No budget or envelope constant changes here: the 2M-per-patch
 * pool-shape decision stays open and unaffected.
 *
 * WORKER LOADING mirrors tierC/parallelScorer: the worker entry is bundled on
 * demand with the esbuild NATIVE BINARY into a temp `.mjs` (the JS API breaks
 * under vitest's jsdom TextEncoder polyfill; the `.cmd` shim EINVALs on
 * Node ≥ 20 Windows), cached per process.
 */
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  mintParallelPatchProofsForProofKernel,
  resolveParallelPatchProofDispatches,
  type CompleteMappedGeometryTargetBinding,
  type MappedPatchProofJob,
  type ParallelPatchProofOutcome,
} from './completeMappedArtifactGeometry';
import type { ContinuousMappedPatchDistanceResult } from './continuousMappedPatchDistance';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import {
  proveFinalStlMappedGeometryAndStructure,
  type FinalStlPartialCertificationOptions,
  type FinalStlPartialCertificationResult,
} from './finalStlPartialCertification';

const HERE = dirname(fileURLToPath(import.meta.url));
const PATCH_WORKER_HARD_MAX = 6;

/** A mapped patch-proof job plus the worker recompile input. */
export interface ParallelMappedPatchProofJob extends MappedPatchProofJob {
  readonly programCanonicalJson: string;
}

export interface ParallelPatchProofRunOptions
  extends FinalStlPartialCertificationOptions {
  /** Worker threads to run patch proofs on (1..6; default one per patch). */
  readonly patchWorkerCount?: number;
}

// --- worker bundle (built once per process; tierC/parallelScorer pattern) ---

let cachedBundle: string | null = null;

function resolveEsbuildBinary(): string {
  const require = createRequire(import.meta.url);
  const pkg =
    process.platform === 'win32'
      ? '@esbuild/win32-x64/esbuild.exe'
      : `@esbuild/${process.platform}-${process.arch}/bin/esbuild`;
  try {
    return require.resolve(pkg);
  } catch {
    const esbuildMain = require.resolve('esbuild');
    const root = dirname(dirname(esbuildMain));
    return process.platform === 'win32'
      ? join(root, '@esbuild', 'win32-x64', 'esbuild.exe')
      : join(root, '@esbuild', `${process.platform}-${process.arch}`, 'bin', 'esbuild');
  }
}

function ensureWorkerBundle(): string {
  if (cachedBundle && existsSync(cachedBundle)) return cachedBundle;
  const dir = mkdtempSync(join(tmpdir(), 'pf-patch-proof-worker-'));
  const out = join(dir, 'patchProofWorker.mjs');
  const entry = join(HERE, '_patchProofWorker.ts');
  execFileSync(
    resolveEsbuildBinary(),
    [entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`],
    { stdio: 'pipe' }
  );
  cachedBundle = out;
  return out;
}

// --- pool run ---------------------------------------------------------------

interface WorkerResponse {
  readonly patchId: string;
  readonly proof?: ContinuousMappedPatchDistanceResult;
  readonly refusal?: NonNullable<ParallelPatchProofOutcome['refusal']>;
  readonly infrastructureFailure?: string;
}

/**
 * Prove a final STL with per-patch proofs computed on worker threads, then
 * replay them through the unchanged sequential prover (structural, height,
 * budget arithmetic, refusal ordering all sequential-identical). Requires an
 * explicit maxElapsedMilliseconds: the same wall-clock deadline is enforced
 * inside every worker.
 */
export async function proveFinalStlWithPatchWorkers(
  stlBytes: Uint8Array,
  canonicalInput: CanonicalTargetInputBinding,
  target: CompleteMappedGeometryTargetBinding,
  jobs: readonly ParallelMappedPatchProofJob[],
  options: ParallelPatchProofRunOptions
): Promise<FinalStlPartialCertificationResult> {
  if (!(stlBytes instanceof Uint8Array) || stlBytes.byteLength === 0) {
    throw new TypeError('proveFinalStlWithPatchWorkers requires non-empty STL bytes');
  }
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new TypeError('proveFinalStlWithPatchWorkers requires at least one job');
  }
  const { patchWorkerCount, ...finalOptions } = options;
  const workerCount = Math.min(
    jobs.length,
    patchWorkerCount ?? PATCH_WORKER_HARD_MAX
  );
  if (
    !Number.isSafeInteger(workerCount) ||
    workerCount < 1 ||
    workerCount > PATCH_WORKER_HARD_MAX
  ) {
    throw new TypeError(
      `patchWorkerCount must be an integer in [1, ${PATCH_WORKER_HARD_MAX}]`
    );
  }
  const maxElapsedMilliseconds = finalOptions.maxElapsedMilliseconds;
  if (
    typeof maxElapsedMilliseconds !== 'number' ||
    !Number.isSafeInteger(maxElapsedMilliseconds) ||
    maxElapsedMilliseconds <= 0
  ) {
    throw new TypeError(
      'proveFinalStlWithPatchWorkers requires an explicit positive maxElapsedMilliseconds'
    );
  }
  const requested = finalOptions.requestedTolerancePm;
  const reserved = finalOptions.reservedNonGeometricMarginPm;
  if (
    typeof requested !== 'bigint' ||
    typeof reserved !== 'bigint' ||
    reserved < 0n ||
    reserved >= requested
  ) {
    throw new TypeError(
      'proveFinalStlWithPatchWorkers requires 0 <= reserve < requested tolerance'
    );
  }
  // The identical geometric budget the finalStl layer hands the composed
  // prover; dispatch caps come from the composed module's own resolver.
  const geometricBudget = requested - reserved;
  const dispatches = resolveParallelPatchProofDispatches(
    {
      maximumGeometricUpperPm: geometricBudget,
      maxTotalWorkCells: finalOptions.maxTotalWorkCells,
      maxTotalEvaluatorWorkUnits: finalOptions.maxTotalEvaluatorWorkUnits,
      maxTotalPartitionWorkUnits: finalOptions.maxTotalPartitionWorkUnits,
      patchProof: finalOptions.patchProof,
    },
    jobs.map((job) => job.partition.triangles.length)
  );
  const deadlineEpochMilliseconds = Date.now() + maxElapsedMilliseconds;
  // Workers observe cancellation through a shared flag; a caller-provided
  // (possibly non-shared) flag is bridged by polling on this thread.
  const sharedCancellation = new Int32Array(new SharedArrayBuffer(4));
  const callerFlag = finalOptions.cancellationFlag;
  const bridge =
    callerFlag === undefined
      ? undefined
      : setInterval(() => {
          if (Atomics.load(callerFlag, 0) !== 0) {
            Atomics.store(sharedCancellation, 0, 1);
          }
        }, 50);
  const bundle = ensureWorkerBundle();
  const workers: Worker[] = [];
  const outcomes = new Map<string, ParallelPatchProofOutcome>();
  try {
    for (let index = 0; index < workerCount; index += 1) {
      workers.push(new Worker(bundle, { workerData: { stlBytes } }));
    }
    // Static shard: worker w takes jobs w, w+n, ... sequentially. Outcomes
    // are keyed by patchId; completion order is irrelevant (the replay is
    // canonical), so sharding cannot affect results.
    await Promise.all(
      workers.map(
        (worker, workerIndex) =>
          new Promise<void>((resolve, reject) => {
            const queue: number[] = [];
            for (let j = workerIndex; j < jobs.length; j += workerCount) {
              queue.push(j);
            }
            const sendNext = (): void => {
              const jobIndex = queue.shift();
              if (jobIndex === undefined) {
                worker.off('message', onMessage);
                worker.off('error', onError);
                resolve();
                return;
              }
              const job = jobs[jobIndex];
              const dispatch = dispatches[jobIndex];
              worker.postMessage({
                patchId: job.partition.patchId,
                partition: job.partition,
                targetSha256: job.evaluator.targetSha256,
                programCanonicalJson: job.programCanonicalJson,
                expectedEvaluatorProgramSha256: job.evaluator.evaluatorProgramSha256,
                expectedEvaluatorProofSha256: job.evaluator.evaluatorProofSha256,
                maximumGeometricUpperPm: dispatch.maximumGeometricUpperPm,
                ...(dispatch.maxDepth === undefined
                  ? {}
                  : { maxDepth: dispatch.maxDepth }),
                maxWorkCells: dispatch.maxWorkCells,
                maxEvaluatorWorkUnits: dispatch.maxEvaluatorWorkUnits,
                partitionOptions: dispatch.partition,
                deadlineEpochMilliseconds,
                cancellationFlag: sharedCancellation,
              });
            };
            const onMessage = (response: WorkerResponse): void => {
              if (typeof response.infrastructureFailure === 'string') {
                worker.off('message', onMessage);
                worker.off('error', onError);
                reject(
                  new Error(
                    `parallel patch-proof worker failed on '${response.patchId}': ${response.infrastructureFailure}`
                  )
                );
                return;
              }
              outcomes.set(
                response.patchId,
                response.refusal !== undefined
                  ? { refusal: response.refusal }
                  : { proof: response.proof }
              );
              sendNext();
            };
            const onError = (error: Error): void => {
              worker.off('message', onMessage);
              reject(error);
            };
            worker.on('message', onMessage);
            worker.once('error', onError);
            sendNext();
          })
      )
    );
  } finally {
    if (bridge !== undefined) clearInterval(bridge);
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  const minted = mintParallelPatchProofsForProofKernel(outcomes);
  const session = createFinalArtifactProofSession(stlBytes);
  const strippedJobs: MappedPatchProofJob[] = jobs.map((job) => ({
    partition: job.partition,
    evaluator: job.evaluator,
  }));
  return proveFinalStlMappedGeometryAndStructure(
    session,
    canonicalInput,
    target,
    strippedJobs,
    { ...finalOptions, parallelPatchProofs: minted }
  );
}
