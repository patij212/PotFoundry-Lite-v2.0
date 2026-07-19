/**
 * Certifies-at error bake — shared lab library (extracted 2026-07-19 from the
 * Gothic spike's PF_GOTHIC_ERRORBAKE block so the WI/Gyroid spikes reuse ONE
 * copy; the Voronoi hash-desync lesson applied proactively).
 *
 * Per artifact triangle, bisect a threshold ladder with the prover's accept
 * rule: prune any cell whose residual enclosure upper <= T; a pointwise
 * incumbent (central-descent probe's distance-to-zero norm) is a definitive
 * fail witness. The sidecar value is a GUARANTEE ("this triangle certifies
 * at <= T"), not a sample. Direct sup-estimation starves on crease bands
 * (O(2^depth) cells per crease) — measured twice before this design.
 */

import type { AnnularSolidReferenceTessellation } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import type { SinglePatchAnnularRadialSolidTargetBinding } from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { compileValidatedResidualEvaluator } from '../../src/geometry/targetSolid/validatedResidualEvaluatorRegistry';

export interface CertifiesAtBakeOptions {
  /** Ascending threshold ladder in mm. */
  readonly ladderMm: readonly number[];
  /** Index into ladderMm where the walk starts (the budget level). */
  readonly startLevel: number;
  readonly maxDepth: number;
  /** Split budget per accept-check, by threshold (spend prover-grade at/above budget). */
  readonly checkSplitsFor: (thresholdMm: number) => number;
  readonly onPatchDone?: (patchId: string, patchTriangles: number, enclosures: number) => void;
}

export interface CertifiesAtBakeResult {
  readonly errors: Float32Array;
  readonly enclosureCount: number;
  readonly decimalFallbackCount: number;
  readonly unconvergedCount: number;
  readonly unknownCheckCount: number;
}

export function bakeCertifiesAtErrors(
  binding: SinglePatchAnnularRadialSolidTargetBinding,
  tessellation: AnnularSolidReferenceTessellation,
  targetSha256: string,
  options: CertifiesAtBakeOptions
): CertifiesAtBakeResult {
  const { ladderMm, startLevel, maxDepth, checkSplitsFor } = options;
  const stl = Buffer.from(
    tessellation.stlBytes.buffer,
    tessellation.stlBytes.byteOffset,
    tessellation.stlBytes.byteLength
  );
  const errors = new Float32Array(tessellation.triangleCount).fill(Number.NaN);
  let enclosureCount = 0;
  let fallbackCount = 0;
  let unconvergedCount = 0;
  let unknownCheckCount = 0;
  const artifact = new Float64Array(9);
  const uN = new Float64Array(3);
  const vN = new Float64Array(3);
  const bary = new Float64Array(9);
  const programByPatch = new Map(
    binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
  );
  for (const partition of tessellation.partitions) {
    const programCanonicalJson = programByPatch.get(
      partition.patchId as (typeof binding.programs)[number]['patchId']
    );
    if (programCanonicalJson === undefined) {
      throw new Error(`missing program for partition patch '${partition.patchId}'`);
    }
    const evaluator = compileValidatedResidualEvaluator({ targetSha256, programCanonicalJson });
    const oddFactor = partition.oddDenominatorFactor ?? '1';
    const oddNumeric = Number(oddFactor);
    const patchStartEnclosures = enclosureCount;
    for (const mapping of partition.triangles) {
      const at = 84 + mapping.artifactTriangleIndex * 50 + 12;
      for (let i = 0; i < 9; i += 1) artifact[i] = stl.readFloatLE(at + i * 4);
      const uBase = mapping.vertices.map((vertex) => Number(vertex.uNumerator));
      const vBase = mapping.vertices.map((vertex) => Number(vertex.vNumerator));
      const enclose = (
        weights: readonly number[],
        depth: number
      ): { upper: number; lower: number } => {
        for (let vtx = 0; vtx < 3; vtx += 1) {
          let u = 0;
          let v = 0;
          for (let k = 0; k < 3; k += 1) {
            const weight = weights[vtx * 3 + k];
            u += weight * uBase[k];
            v += weight * vBase[k];
            bary[vtx * 3 + k] = weight;
          }
          uN[vtx] = u;
          vN[vtx] = v;
        }
        enclosureCount += 1;
        let enclosure = evaluator.encloseResidualFastNumeric(
          uN,
          vN,
          partition.fractionBits + depth,
          bary,
          depth,
          artifact,
          oddNumeric === 1 ? undefined : oddNumeric
        );
        if (enclosure === null) {
          fallbackCount += 1;
          const cellVertices = [0, 1, 2].map((vtx) => {
            let u = 0n;
            let v = 0n;
            for (let k = 0; k < 3; k += 1) {
              const weight = BigInt(weights[vtx * 3 + k]);
              u += weight * BigInt(mapping.vertices[k].uNumerator);
              v += weight * BigInt(mapping.vertices[k].vNumerator);
            }
            return { uNumerator: u.toString(), vNumerator: v.toString() };
          }) as [
            (typeof mapping.vertices)[number],
            (typeof mapping.vertices)[number],
            (typeof mapping.vertices)[number],
          ];
          enclosure = evaluator.encloseResidual({
            patchId: partition.patchId,
            artifactTriangleIndex: mapping.artifactTriangleIndex,
            artifactTriangleVerticesMm: [
              [artifact[0], artifact[1], artifact[2]],
              [artifact[3], artifact[4], artifact[5]],
              [artifact[6], artifact[7], artifact[8]],
            ],
            originalDomainTriangle: mapping.vertices,
            cell: {
              fractionBits: partition.fractionBits + depth,
              ...(oddFactor === '1' ? {} : { oddDenominatorFactor: oddFactor }),
              barycentricFractionBits: depth,
              vertices: cellVertices,
              barycentricVertices: [0, 1, 2].map((vtx) => ({
                aNumerator: String(weights[vtx * 3]),
                bNumerator: String(weights[vtx * 3 + 1]),
                cNumerator: String(weights[vtx * 3 + 2]),
              })) as unknown as never,
            },
          });
        }
        const distanceToZero = (interval: { lower: number; upper: number }): number =>
          interval.lower > 0 ? interval.lower : interval.upper < 0 ? -interval.upper : 0;
        const ax = Math.max(Math.abs(enclosure.xMm.lower), Math.abs(enclosure.xMm.upper));
        const ay = Math.max(Math.abs(enclosure.yMm.lower), Math.abs(enclosure.yMm.upper));
        const az = Math.max(Math.abs(enclosure.zMm.lower), Math.abs(enclosure.zMm.upper));
        return {
          upper: Math.hypot(ax, ay, az),
          lower: Math.hypot(
            distanceToZero(enclosure.xMm),
            distanceToZero(enclosure.yMm),
            distanceToZero(enclosure.zMm)
          ),
        };
      };
      const twice = (p: readonly number[]): number[] => p.map((x) => 2 * x);
      const mid = (p: readonly number[], q: readonly number[]): number[] =>
        p.map((x, i) => x + q[i]);
      const probeLower = (weights: readonly number[], depth: number): number => {
        let w = weights;
        let d = depth;
        for (let k = 0; k < 6; k += 1) {
          const a = w.slice(0, 3);
          const b = w.slice(3, 6);
          const c = w.slice(6, 9);
          w = [...mid(a, b), ...mid(b, c), ...mid(a, c)];
          d += 1;
        }
        return enclose(w, d).lower;
      };
      type BakeCell = { readonly w: readonly number[]; readonly depth: number; upper: number };
      const rootWeights = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
      let incumbent = 0;
      const certifiesAt = (thresholdMm: number): 'yes' | 'no' | 'unknown' => {
        if (incumbent > thresholdMm) return 'no';
        const cells: BakeCell[] = [
          { w: rootWeights, depth: 0, upper: enclose(rootWeights, 0).upper },
        ];
        const checkSplits = checkSplitsFor(thresholdMm);
        let splits = 0;
        while (splits < checkSplits) {
          for (let i = cells.length - 1; i >= 0; i -= 1) {
            if (cells[i].upper <= thresholdMm) {
              cells[i] = cells[cells.length - 1];
              cells.pop();
            }
          }
          if (cells.length === 0) return 'yes';
          let worstIndex = 0;
          for (let i = 1; i < cells.length; i += 1) {
            if (cells[i].upper > cells[worstIndex].upper) worstIndex = i;
          }
          const worst = cells[worstIndex];
          if (worst.depth >= maxDepth) return 'unknown';
          incumbent = Math.max(incumbent, probeLower(worst.w, worst.depth));
          if (incumbent > thresholdMm) return 'no';
          cells[worstIndex] = cells[cells.length - 1];
          cells.pop();
          const a = worst.w.slice(0, 3);
          const b = worst.w.slice(3, 6);
          const c = worst.w.slice(6, 9);
          const children = [
            [...twice(a), ...mid(a, b), ...mid(a, c)],
            [...mid(a, b), ...twice(b), ...mid(b, c)],
            [...mid(a, c), ...mid(b, c), ...twice(c)],
            [...mid(a, b), ...mid(b, c), ...mid(a, c)],
          ];
          for (const w of children) {
            const upper = enclose(w, worst.depth + 1).upper;
            if (upper > thresholdMm) cells.push({ w, depth: worst.depth + 1, upper });
          }
          splits += 1;
        }
        return 'unknown';
      };
      let level = startLevel;
      let verdict = certifiesAt(ladderMm[level]);
      if (verdict === 'yes') {
        while (level > 0 && certifiesAt(ladderMm[level - 1]) === 'yes') level -= 1;
        errors[mapping.artifactTriangleIndex] = ladderMm[level];
      } else {
        if (verdict === 'unknown') unknownCheckCount += 1;
        let certified = false;
        while (level + 1 < ladderMm.length) {
          level += 1;
          const step = certifiesAt(ladderMm[level]);
          if (step === 'unknown') unknownCheckCount += 1;
          if (step === 'yes') {
            certified = true;
            break;
          }
        }
        if (certified) {
          errors[mapping.artifactTriangleIndex] = ladderMm[level];
        } else {
          unconvergedCount += 1;
          errors[mapping.artifactTriangleIndex] = ladderMm[ladderMm.length - 1] * 2;
        }
      }
    }
    options.onPatchDone?.(
      partition.patchId,
      partition.triangles.length,
      enclosureCount - patchStartEnclosures
    );
  }
  for (let i = 0; i < errors.length; i += 1) {
    if (Number.isNaN(errors[i])) throw new Error(`triangle ${i} not covered by any partition`);
  }
  return {
    errors,
    enclosureCount,
    decimalFallbackCount: fallbackCount,
    unconvergedCount,
    unknownCheckCount,
  };
}
