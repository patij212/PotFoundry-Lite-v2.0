import type { ExactDyadicDomainPartitionInput } from './exactDyadicDomainPartition';
import {
  singlePatchAnnularRadialSolidTargetForProof,
  type AnnularRadialSolidPatchId,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from './singlePatchAnnularRadialSolidTarget';

/**
 * Certification-first reference tessellation of the authenticated six-patch
 * annular radial solid atlas.
 *
 * This is a candidate GENERATOR, not proof machinery: it meshes each patch on
 * a uniform exact-dyadic grid, welds every shared boundary to bitwise-equal
 * coordinates by evaluating each junction row once from its declared owner
 * patch, and emits (a) final binary-STL bytes and (b) the exact dyadic
 * triangle-to-parameter partitions the continuous mapped-distance proof
 * consumes. Whether the result actually meets a tolerance is decided solely
 * by `proveFinalStlMappedGeometryAndStructure` on the serialized bytes.
 *
 * Welding invariants relied on by the topology proof:
 * - per patch, the u=1 column reuses the u=0 column's evaluated coordinates
 *   (periodic identification);
 * - each of the six declared junctions copies the owner patch's boundary row
 *   into the neighbour row, applying the atlas's exact station reversal
 *   (i -> nU - i) where the junction reverses the free parameter;
 * - STL vertex order per triangle equals the CCW parameter-cell vertex order,
 *   which the atlas's baked-in parameter reversals turn into material-outward
 *   winding on every patch.
 */
export interface AnnularSolidReferenceTessellationOptions {
  /** log2 of the shared angular division count (all patches use 2^a cells in u). */
  readonly angularDivisionsLog2: number;
  /** log2 of each patch's vertical division count (2^b cells in v). */
  readonly verticalDivisionsLog2ByPatch: Readonly<
    Record<AnnularRadialSolidPatchId, number>
  >;
}

export interface AnnularSolidReferenceTessellation {
  readonly stlBytes: Uint8Array;
  readonly triangleCount: number;
  /** One exact dyadic partition per patch, in the atlas's program order. */
  readonly partitions: readonly ExactDyadicDomainPartitionInput[];
}

const PATCH_IDS: readonly AnnularRadialSolidPatchId[] = Object.freeze([
  'outer-wall',
  'inner-wall',
  'top-rim',
  'bottom-top',
  'bottom-under',
  'drain-wall',
]);
const MIN_DIVISIONS_LOG2 = 0;
const MAX_ANGULAR_DIVISIONS_LOG2 = 12;
const MAX_VERTICAL_DIVISIONS_LOG2 = 10;
const MAX_REFERENCE_TRIANGLES = 2_097_152;

interface PatchGrid {
  readonly patchId: AnnularRadialSolidPatchId;
  readonly verticalDivisions: number;
  /** (nV+1) x (nU+1) x 3 float64 coordinates, row-major by v station. */
  readonly coordinates: Float64Array;
}

function invalid(message: string): never {
  throw new RangeError(`Annular reference tessellation: ${message}`);
}

function divisionsLog2(value: unknown, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < MIN_DIVISIONS_LOG2 ||
    value > maximum
  ) {
    invalid(`${label} must be an integer in [${MIN_DIVISIONS_LOG2}, ${maximum}]`);
  }
  return value;
}

function gridIndex(angularDivisions: number, uStation: number, vStation: number): number {
  return (vStation * (angularDivisions + 1) + uStation) * 3;
}

function evaluatePatchGrid(
  patchId: AnnularRadialSolidPatchId,
  evaluateFloat64: (u: number, v: number) => readonly [number, number, number],
  angularDivisions: number,
  verticalDivisions: number
): PatchGrid {
  const coordinates = new Float64Array((verticalDivisions + 1) * (angularDivisions + 1) * 3);
  for (let vStation = 0; vStation <= verticalDivisions; vStation += 1) {
    const v = vStation / verticalDivisions;
    for (let uStation = 0; uStation < angularDivisions; uStation += 1) {
      const point = evaluateFloat64(uStation / angularDivisions, v);
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(point[2])) {
        invalid(`patch '${patchId}' evaluated a non-finite coordinate`);
      }
      const base = gridIndex(angularDivisions, uStation, vStation);
      coordinates[base] = point[0];
      coordinates[base + 1] = point[1];
      coordinates[base + 2] = point[2];
    }
    // Periodic identification: the u=1 column reuses the u=0 column verbatim
    // so the seam is welded by construction regardless of evaluator rounding.
    const seamTarget = gridIndex(angularDivisions, angularDivisions, vStation);
    const seamSource = gridIndex(angularDivisions, 0, vStation);
    coordinates[seamTarget] = coordinates[seamSource];
    coordinates[seamTarget + 1] = coordinates[seamSource + 1];
    coordinates[seamTarget + 2] = coordinates[seamSource + 2];
  }
  return { patchId, verticalDivisions, coordinates };
}

interface JunctionCopy {
  readonly receiver: AnnularRadialSolidPatchId;
  readonly receiverRow: 'v0' | 'v1';
  readonly owner: AnnularRadialSolidPatchId;
  readonly ownerRow: 'v0' | 'v1';
  readonly reverseFreeParameter: boolean;
}

// Receiver-centric restatement of the atlas's six non-periodic junctions with
// their declared owners (lexicographically smaller patch/side pair) and exact
// free-parameter reversals, as pinned by singlePatchAnnularRadialSolidTarget's
// junction-identity proofs.
const JUNCTION_COPIES: readonly JunctionCopy[] = Object.freeze([
  { receiver: 'top-rim', receiverRow: 'v1', owner: 'outer-wall', ownerRow: 'v1', reverseFreeParameter: true },
  { receiver: 'top-rim', receiverRow: 'v0', owner: 'inner-wall', ownerRow: 'v1', reverseFreeParameter: false },
  { receiver: 'inner-wall', receiverRow: 'v0', owner: 'bottom-top', ownerRow: 'v1', reverseFreeParameter: false },
  { receiver: 'drain-wall', receiverRow: 'v1', owner: 'bottom-top', ownerRow: 'v0', reverseFreeParameter: false },
  { receiver: 'drain-wall', receiverRow: 'v0', owner: 'bottom-under', ownerRow: 'v0', reverseFreeParameter: true },
  { receiver: 'outer-wall', receiverRow: 'v0', owner: 'bottom-under', ownerRow: 'v1', reverseFreeParameter: false },
]);

function rowStation(grid: PatchGrid, row: 'v0' | 'v1'): number {
  return row === 'v0' ? 0 : grid.verticalDivisions;
}

function applyJunctionWelds(
  grids: ReadonlyMap<AnnularRadialSolidPatchId, PatchGrid>,
  angularDivisions: number
): void {
  for (const copy of JUNCTION_COPIES) {
    const receiver = grids.get(copy.receiver);
    const owner = grids.get(copy.owner);
    if (receiver === undefined || owner === undefined) {
      invalid(`junction weld references missing patch '${copy.receiver}'/'${copy.owner}'`);
    }
    const receiverRow = rowStation(receiver, copy.receiverRow);
    const ownerRow = rowStation(owner, copy.ownerRow);
    for (let uStation = 0; uStation <= angularDivisions; uStation += 1) {
      const ownerStation = copy.reverseFreeParameter ? angularDivisions - uStation : uStation;
      const source = gridIndex(angularDivisions, ownerStation, ownerRow);
      const target = gridIndex(angularDivisions, uStation, receiverRow);
      receiver.coordinates[target] = owner.coordinates[source];
      receiver.coordinates[target + 1] = owner.coordinates[source + 1];
      receiver.coordinates[target + 2] = owner.coordinates[source + 2];
    }
  }
}

/**
 * Mesh the authenticated annular atlas into final STL bytes plus the exact
 * dyadic patch partitions required by the continuous mapped-distance proof.
 */
export function tessellateAnnularRadialSolidTargetForCertification(
  binding: SinglePatchAnnularRadialSolidTargetBinding,
  options: AnnularSolidReferenceTessellationOptions
): AnnularSolidReferenceTessellation {
  const authenticated = singlePatchAnnularRadialSolidTargetForProof(binding);
  if (typeof options !== 'object' || options === null) {
    invalid('options must be a record');
  }
  const angularLog2 = divisionsLog2(
    options.angularDivisionsLog2,
    MAX_ANGULAR_DIVISIONS_LOG2,
    'angularDivisionsLog2'
  );
  const verticalByPatch = options.verticalDivisionsLog2ByPatch;
  if (typeof verticalByPatch !== 'object' || verticalByPatch === null) {
    invalid('verticalDivisionsLog2ByPatch must be a record');
  }
  const angularDivisions = 1 << angularLog2;
  const verticalLog2: Map<AnnularRadialSolidPatchId, number> = new Map();
  for (const patchId of PATCH_IDS) {
    verticalLog2.set(
      patchId,
      divisionsLog2(
        verticalByPatch[patchId],
        MAX_VERTICAL_DIVISIONS_LOG2,
        `verticalDivisionsLog2ByPatch['${patchId}']`
      )
    );
  }

  const programs = authenticated.programs;
  if (programs.length !== PATCH_IDS.length) {
    invalid(`atlas must carry exactly ${PATCH_IDS.length} patch programs`);
  }
  let triangleCount = 0;
  for (const program of programs) {
    const log2 = verticalLog2.get(program.patchId);
    if (log2 === undefined) invalid(`unknown atlas patch '${program.patchId}'`);
    triangleCount += 2 * angularDivisions * (1 << log2);
  }
  if (triangleCount > MAX_REFERENCE_TRIANGLES) {
    invalid(`requested grid needs ${triangleCount} triangles > ${MAX_REFERENCE_TRIANGLES}`);
  }

  const grids = new Map<AnnularRadialSolidPatchId, PatchGrid>();
  for (const program of programs) {
    const log2 = verticalLog2.get(program.patchId);
    if (log2 === undefined) invalid(`unknown atlas patch '${program.patchId}'`);
    grids.set(
      program.patchId,
      evaluatePatchGrid(
        program.patchId,
        program.backends.evaluateFloat64,
        angularDivisions,
        1 << log2
      )
    );
  }
  applyJunctionWelds(grids, angularDivisions);

  const stlBytes = new Uint8Array(84 + triangleCount * 50);
  const view = new DataView(stlBytes.buffer);
  view.setUint32(80, triangleCount, true);
  const partitions: ExactDyadicDomainPartitionInput[] = [];
  let artifactTriangleIndex = 0;
  for (const program of programs) {
    const grid = grids.get(program.patchId);
    const verticalLog2ForPatch = verticalLog2.get(program.patchId);
    if (grid === undefined || verticalLog2ForPatch === undefined) {
      invalid(`unknown atlas patch '${program.patchId}'`);
    }
    const verticalDivisions = grid.verticalDivisions;
    const fractionBits = Math.max(angularLog2, verticalLog2ForPatch);
    const uNumeratorStep = 1 << (fractionBits - angularLog2);
    const vNumeratorStep = 1 << (fractionBits - verticalLog2ForPatch);
    const maxNumerator = (1 << fractionBits).toString();
    const triangles: {
      artifactTriangleIndex: number;
      vertices: readonly [
        { uNumerator: string; vNumerator: string },
        { uNumerator: string; vNumerator: string },
        { uNumerator: string; vNumerator: string },
      ];
    }[] = [];
    for (let vCell = 0; vCell < verticalDivisions; vCell += 1) {
      for (let uCell = 0; uCell < angularDivisions; uCell += 1) {
        // Two CCW parameter triangles per cell; STL vertices reuse the exact
        // station order so the proof's vertex-wise correspondence holds.
        const corners = [
          [uCell, vCell],
          [uCell + 1, vCell],
          [uCell + 1, vCell + 1],
          [uCell, vCell + 1],
        ] as const;
        for (const cellTriangle of [
          [corners[0], corners[1], corners[2]],
          [corners[0], corners[2], corners[3]],
        ] as const) {
          const byteBase = 84 + artifactTriangleIndex * 50;
          cellTriangle.forEach(([uStation, vStation], vertexIndex) => {
            const source = gridIndex(angularDivisions, uStation, vStation);
            const vertexBase = byteBase + 12 + vertexIndex * 12;
            view.setFloat32(vertexBase, grid.coordinates[source], true);
            view.setFloat32(vertexBase + 4, grid.coordinates[source + 1], true);
            view.setFloat32(vertexBase + 8, grid.coordinates[source + 2], true);
          });
          triangles.push({
            artifactTriangleIndex,
            vertices: [
              {
                uNumerator: (cellTriangle[0][0] * uNumeratorStep).toString(),
                vNumerator: (cellTriangle[0][1] * vNumeratorStep).toString(),
              },
              {
                uNumerator: (cellTriangle[1][0] * uNumeratorStep).toString(),
                vNumerator: (cellTriangle[1][1] * vNumeratorStep).toString(),
              },
              {
                uNumerator: (cellTriangle[2][0] * uNumeratorStep).toString(),
                vNumerator: (cellTriangle[2][1] * vNumeratorStep).toString(),
              },
            ],
          });
          artifactTriangleIndex += 1;
        }
      }
    }
    partitions.push({
      patchId: program.patchId,
      fractionBits,
      domain: {
        minUNumerator: '0',
        maxUNumerator: maxNumerator,
        minVNumerator: '0',
        maxVNumerator: maxNumerator,
      },
      artifactTriangleCount: triangleCount,
      triangles,
    });
  }

  return Object.freeze({
    stlBytes,
    triangleCount,
    partitions: Object.freeze(partitions),
  });
}
