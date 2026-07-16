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
/**
 * Explicit non-uniform vertical stations for one patch: strictly increasing
 * integer numerators over 2^log2Denominator, starting at 0 and ending at
 * 2^log2Denominator. Lets a patch spend rows where its target needs them
 * (e.g. geometrically refined toward a styled edge) while every station
 * stays exactly dyadic for the partition proof.
 *
 * U3b: a ladder may additionally carry an odd denominator factor q >= 3, in
 * which case numerators run 0..q*2^log2Denominator and stations are the
 * exact rationals numerator / (q * 2^log2Denominator) — so feature stations
 * k/N with N not a power of two sit EXACTLY on cell boundaries. Rational
 * ladders are supported on the shared ANGULAR stations only; the partition
 * proof consumes the factor through its own exact-rational coordinate layer.
 */
export interface VerticalStationLadder {
  readonly log2Denominator: number;
  readonly numerators: readonly number[];
  readonly oddDenominatorFactor?: number;
}

export interface AnnularSolidReferenceTessellationOptions {
  /** log2 of the shared angular division count (all patches use 2^a cells in u). */
  readonly angularDivisionsLog2: number;
  /** log2 of each patch's uniform vertical division count (2^b cells in v). */
  readonly verticalDivisionsLog2ByPatch: Readonly<
    Record<AnnularRadialSolidPatchId, number>
  >;
  /** Optional per-patch non-uniform station ladders overriding the uniform grid. */
  readonly verticalStationsByPatch?: Readonly<
    Partial<Record<AnnularRadialSolidPatchId, VerticalStationLadder>>
  >;
  /**
   * Optional shared non-uniform ANGULAR stations (overrides the uniform
   * angular grid). The atlas's junction welds reverse the free parameter, so
   * the ladder must be symmetric under numerator -> 2^log2Denominator -
   * numerator; the reversed station of index i is then index count-1-i.
   */
  readonly angularStations?: VerticalStationLadder;
}

/**
 * Build a shared symmetric angular ladder: a uniform 2^uniformLog2 grid
 * unioned with each feature fraction (e.g. crease angles k/24) snapped to
 * the nearest dyadic station at 2^snapLog2, plus every mirror 1-s so the
 * atlas's reversed junctions weld station-for-station. Snapping error is
 * at most 2^-(snapLog2+1) in u.
 */
export function snappedFeatureAngularLadder(
  uniformLog2: number,
  featureFractions: readonly number[],
  snapLog2: number
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformLog2) ||
    uniformLog2 < 1 ||
    uniformLog2 > MAX_ANGULAR_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(snapLog2) ||
    snapLog2 < uniformLog2 ||
    snapLog2 > MAX_LADDER_LOG2_DENOMINATOR
  ) {
    invalid('snappedFeatureAngularLadder arguments are out of range');
  }
  const denominator = 1 << snapLog2;
  const stationSet = new Set<number>();
  const uniformStep = 1 << (snapLog2 - uniformLog2);
  for (let station = 0; station <= 1 << uniformLog2; station += 1) {
    stationSet.add(station * uniformStep);
  }
  for (const fraction of featureFractions) {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      invalid('feature fractions must lie in [0, 1]');
    }
    const snapped = Math.min(denominator, Math.max(0, Math.round(fraction * denominator)));
    stationSet.add(snapped);
    stationSet.add(denominator - snapped);
  }
  const numerators = [...stationSet].sort((left, right) => left - right);
  return Object.freeze({ log2Denominator: snapLog2, numerators: Object.freeze(numerators) });
}

/**
 * Build a shared symmetric angular ladder whose stations include every jump
 * fraction k/N EXACTLY (U3b). The denominator is q * 2^f with q the odd part
 * of N and f = max(uniformLog2, trailingZeros(N)) + extraDyadicBits, so both
 * the uniform grid and all N+1 feature stations are exact integers over it.
 * The ladder is symmetric under numerator -> denominator - numerator by
 * construction (the mirror of k/N is (N-k)/N), so reversed junction welds
 * stay station-exact.
 */
export function rationalFeatureAngularLadder(
  uniformLog2: number,
  jumpDenominator: number,
  extraDyadicBits = 0
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformLog2) ||
    uniformLog2 < 1 ||
    uniformLog2 > MAX_ANGULAR_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(jumpDenominator) ||
    jumpDenominator < 2 ||
    jumpDenominator > 1 << MAX_ANGULAR_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(extraDyadicBits) ||
    extraDyadicBits < 0
  ) {
    invalid('rationalFeatureAngularLadder arguments are out of range');
  }
  let trailingZeros = 0;
  let oddPart = jumpDenominator;
  while (oddPart % 2 === 0) {
    oddPart /= 2;
    trailingZeros += 1;
  }
  const log2Denominator = Math.max(uniformLog2, trailingZeros) + extraDyadicBits;
  if (log2Denominator > MAX_LADDER_LOG2_DENOMINATOR) {
    invalid('rationalFeatureAngularLadder denominator exceeds the ladder envelope');
  }
  const denominator = oddPart * 2 ** log2Denominator;
  const stationSet = new Set<number>();
  const uniformStep = denominator / 2 ** uniformLog2;
  for (let station = 0; station <= 1 << uniformLog2; station += 1) {
    stationSet.add(station * uniformStep);
  }
  const jumpStep = denominator / jumpDenominator;
  for (let jump = 0; jump <= jumpDenominator; jump += 1) {
    stationSet.add(jump * jumpStep);
  }
  const numerators = [...stationSet].sort((left, right) => left - right);
  if (numerators.length > MAX_LADDER_STATIONS) {
    invalid('rationalFeatureAngularLadder produces too many stations');
  }
  return Object.freeze({
    log2Denominator,
    numerators: Object.freeze(numerators),
    ...(oddPart === 1 ? {} : { oddDenominatorFactor: oddPart }),
  });
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

/**
 * Build a (not necessarily symmetric) station ladder containing every
 * requested exact rational station p/q PLUS a uniform 2^uniformLog2 grid,
 * over the least common denominator odd(L) * 2^v2(L) (U3b slice 5). Used
 * for VERTICAL feature stations — e.g. an inner wall whose affine source-v
 * remap puts lattice jump lines at (k/8 - c)/s with c, s exact decimals.
 */
export function rationalStationLadder(
  uniformLog2: number,
  stations: readonly (readonly [number, number])[]
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformLog2) ||
    uniformLog2 < 1 ||
    uniformLog2 > MAX_VERTICAL_DIVISIONS_LOG2 ||
    !Array.isArray(stations)
  ) {
    invalid('rationalStationLadder arguments are out of range');
  }
  let commonDenominator = 1 << uniformLog2;
  for (const station of stations) {
    if (
      !Array.isArray(station) ||
      station.length !== 2 ||
      !Number.isSafeInteger(station[0]) ||
      !Number.isSafeInteger(station[1]) ||
      station[1] < 2 ||
      station[0] <= 0 ||
      station[0] >= station[1]
    ) {
      invalid('rationalStationLadder stations must be exact fractions strictly inside (0, 1)');
    }
    const divisor = greatestCommonDivisor(commonDenominator, station[1]);
    commonDenominator = (commonDenominator / divisor) * station[1];
    if (!Number.isSafeInteger(commonDenominator) || commonDenominator > MAX_LADDER_ODD_FACTOR) {
      invalid('rationalStationLadder least common denominator exceeds the exact envelope');
    }
  }
  let log2Denominator = 0;
  let oddPart = commonDenominator;
  while (oddPart % 2 === 0) {
    oddPart /= 2;
    log2Denominator += 1;
  }
  if (log2Denominator > MAX_LADDER_LOG2_DENOMINATOR) {
    invalid('rationalStationLadder dyadic depth exceeds the ladder envelope');
  }
  const stationSet = new Set<number>();
  const uniformStep = commonDenominator / 2 ** uniformLog2;
  for (let station = 0; station <= 1 << uniformLog2; station += 1) {
    stationSet.add(station * uniformStep);
  }
  for (const [numerator, denominator] of stations) {
    stationSet.add((numerator * commonDenominator) / denominator);
  }
  const numerators = [...stationSet].sort((left, right) => left - right);
  if (numerators.length > MAX_LADDER_STATIONS) {
    invalid('rationalStationLadder produces too many stations');
  }
  return Object.freeze({
    log2Denominator,
    numerators: Object.freeze(numerators),
    ...(oddPart === 1 ? {} : { oddDenominatorFactor: oddPart }),
  });
}

/**
 * Build a dyadic ladder that is uniform at 2^uniformDivisionsLog2 rows and
 * then halves the row adjacent to the chosen edge `refinements` times, so
 * row widths shrink geometrically into the edge. Total rows =
 * 2^uniformDivisionsLog2 + refinements.
 */
export function dyadicEdgeLadder(
  uniformDivisionsLog2: number,
  refinements: number,
  edge: 'v0' | 'v1'
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformDivisionsLog2) ||
    uniformDivisionsLog2 < 0 ||
    uniformDivisionsLog2 > MAX_VERTICAL_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(refinements) ||
    refinements < 0 ||
    uniformDivisionsLog2 + refinements > MAX_LADDER_LOG2_DENOMINATOR
  ) {
    invalid('dyadicEdgeLadder arguments are out of range');
  }
  const log2Denominator = uniformDivisionsLog2 + refinements;
  const denominator = 1 << log2Denominator;
  const uniformStep = 1 << refinements;
  const numerators: number[] = [];
  for (let station = 0; station <= 1 << uniformDivisionsLog2; station += 1) {
    numerators.push(station * uniformStep);
  }
  for (let step = 1; step <= refinements; step += 1) {
    const offset = uniformStep >> step;
    // Insert immediately inside the edge terminus so the stations stay
    // strictly increasing and each new row halves the previous edge row.
    if (edge === 'v1') numerators.splice(numerators.length - 1, 0, denominator - offset);
    else numerators.splice(1, 0, offset);
  }
  return Object.freeze({ log2Denominator, numerators: Object.freeze(numerators) });
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
const MAX_LADDER_LOG2_DENOMINATOR = 20;
const MAX_LADDER_STATIONS = 4_097;
const MAX_REFERENCE_TRIANGLES = 2_097_152;

interface ResolvedStations {
  readonly log2Denominator: number;
  /** Odd part of the station denominator (1 for purely dyadic ladders). */
  readonly oddDenominatorFactor: number;
  readonly numerators: readonly number[];
  /** Station values numerator / (oddDenominatorFactor * 2^log2Denominator). */
  readonly values: Float64Array;
}

const MAX_LADDER_ODD_FACTOR = 4_503_599_627_370_495; // 2^52 - 1 (kernel envelope)

function resolveStations(
  patchId: AnnularRadialSolidPatchId,
  uniformLog2: number,
  ladder: VerticalStationLadder | undefined
): ResolvedStations {
  if (ladder === undefined) {
    const divisions = 1 << uniformLog2;
    const numerators: number[] = [];
    const values = new Float64Array(divisions + 1);
    for (let station = 0; station <= divisions; station += 1) {
      numerators.push(station);
      values[station] = station / divisions;
    }
    return { log2Denominator: uniformLog2, oddDenominatorFactor: 1, numerators, values };
  }
  const log2Denominator = ladder.log2Denominator;
  if (
    !Number.isSafeInteger(log2Denominator) ||
    log2Denominator < 1 ||
    log2Denominator > MAX_LADDER_LOG2_DENOMINATOR
  ) {
    invalid(`verticalStationsByPatch['${patchId}'].log2Denominator out of range`);
  }
  const rawOddFactor = ladder.oddDenominatorFactor;
  let oddDenominatorFactor = 1;
  if (rawOddFactor !== undefined) {
    if (
      !Number.isSafeInteger(rawOddFactor) ||
      rawOddFactor < 3 ||
      rawOddFactor % 2 !== 1 ||
      rawOddFactor > MAX_LADDER_ODD_FACTOR
    ) {
      invalid(`verticalStationsByPatch['${patchId}'].oddDenominatorFactor must be an odd integer >= 3`);
    }
    oddDenominatorFactor = rawOddFactor;
  }
  const numerators = ladder.numerators;
  const denominator = oddDenominatorFactor * 2 ** log2Denominator;
  if (!Number.isSafeInteger(denominator)) {
    invalid(`verticalStationsByPatch['${patchId}'] denominator exceeds the exact envelope`);
  }
  if (
    !Array.isArray(numerators) ||
    numerators.length < 2 ||
    numerators.length > MAX_LADDER_STATIONS ||
    numerators[0] !== 0 ||
    numerators[numerators.length - 1] !== denominator
  ) {
    invalid(
      `verticalStationsByPatch['${patchId}'] must run 0..${oddDenominatorFactor}*2^${log2Denominator}`
    );
  }
  const values = new Float64Array(numerators.length);
  for (let station = 0; station < numerators.length; station += 1) {
    const numerator = numerators[station];
    if (
      !Number.isSafeInteger(numerator) ||
      (station > 0 && numerator <= numerators[station - 1])
    ) {
      invalid(`verticalStationsByPatch['${patchId}'] must be strictly increasing integers`);
    }
    values[station] = numerator / denominator;
  }
  return { log2Denominator, oddDenominatorFactor, numerators, values };
}

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
  angularValues: Float64Array,
  stationValues: Float64Array
): PatchGrid {
  const angularDivisions = angularValues.length - 1;
  const verticalDivisions = stationValues.length - 1;
  const coordinates = new Float64Array((verticalDivisions + 1) * (angularDivisions + 1) * 3);
  for (let vStation = 0; vStation <= verticalDivisions; vStation += 1) {
    const v = stationValues[vStation];
    for (let uStation = 0; uStation < angularDivisions; uStation += 1) {
      const point = evaluateFloat64(angularValues[uStation], v);
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
  const angularResolved = resolveStations(
    'outer-wall',
    angularLog2,
    options.angularStations
  );
  if (options.angularStations !== undefined) {
    // Reversed junction welds mirror station indices, which is only exact
    // when the ladder itself is symmetric under s -> 1 - s.
    const numerators = angularResolved.numerators;
    const denominator =
      angularResolved.oddDenominatorFactor * 2 ** angularResolved.log2Denominator;
    for (let station = 0; station < numerators.length; station += 1) {
      if (
        numerators[station] !==
        denominator - numerators[numerators.length - 1 - station]
      ) {
        invalid('angularStations must be symmetric under reversal (s -> 1 - s)');
      }
    }
  }
  const angularDivisions = angularResolved.numerators.length - 1;
  const ladders = options.verticalStationsByPatch ?? {};
  if (typeof ladders !== 'object' || ladders === null) {
    invalid('verticalStationsByPatch must be a record when present');
  }
  const stationsByPatch: Map<AnnularRadialSolidPatchId, ResolvedStations> = new Map();
  for (const patchId of PATCH_IDS) {
    const uniformLog2 = divisionsLog2(
      verticalByPatch[patchId],
      MAX_VERTICAL_DIVISIONS_LOG2,
      `verticalDivisionsLog2ByPatch['${patchId}']`
    );
    stationsByPatch.set(patchId, resolveStations(patchId, uniformLog2, ladders[patchId]));
  }

  const programs = authenticated.programs;
  if (programs.length !== PATCH_IDS.length) {
    invalid(`atlas must carry exactly ${PATCH_IDS.length} patch programs`);
  }
  let triangleCount = 0;
  for (const program of programs) {
    const stations = stationsByPatch.get(program.patchId);
    if (stations === undefined) invalid(`unknown atlas patch '${program.patchId}'`);
    triangleCount += 2 * angularDivisions * (stations.numerators.length - 1);
  }
  if (triangleCount > MAX_REFERENCE_TRIANGLES) {
    invalid(`requested grid needs ${triangleCount} triangles > ${MAX_REFERENCE_TRIANGLES}`);
  }

  const grids = new Map<AnnularRadialSolidPatchId, PatchGrid>();
  for (const program of programs) {
    const stations = stationsByPatch.get(program.patchId);
    if (stations === undefined) invalid(`unknown atlas patch '${program.patchId}'`);
    grids.set(
      program.patchId,
      evaluatePatchGrid(
        program.patchId,
        program.backends.evaluateFloat64,
        angularResolved.values,
        stations.values
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
    const stations = stationsByPatch.get(program.patchId);
    if (grid === undefined || stations === undefined) {
      invalid(`unknown atlas patch '${program.patchId}'`);
    }
    const verticalDivisions = grid.verticalDivisions;
    const fractionBits = Math.max(
      angularResolved.log2Denominator,
      stations.log2Denominator
    );
    // The partition's shared coordinate denominator is q * 2^fractionBits
    // with q = lcm of the angular and per-patch vertical odd factors: each
    // axis's numerators scale by the missing odd cofactor times the dyadic
    // gap, keeping every station an exact integer over the shared system.
    const angularOdd = angularResolved.oddDenominatorFactor;
    const verticalOdd = stations.oddDenominatorFactor;
    const oddFactor =
      (angularOdd / greatestCommonDivisor(angularOdd, verticalOdd)) * verticalOdd;
    const uNumeratorScale =
      (oddFactor / angularOdd) * 2 ** (fractionBits - angularResolved.log2Denominator);
    const angularNumerator = (uStation: number): number =>
      angularResolved.numerators[uStation] * uNumeratorScale;
    const vNumeratorScale =
      (oddFactor / verticalOdd) * 2 ** (fractionBits - stations.log2Denominator);
    const stationNumerator = (vStation: number): number =>
      stations.numerators[vStation] * vNumeratorScale;
    const declaredDenominator = oddFactor * 2 ** fractionBits;
    if (
      !Number.isSafeInteger(declaredDenominator) ||
      declaredDenominator > MAX_LADDER_ODD_FACTOR
    ) {
      invalid(`patch '${program.patchId}' partition denominator exceeds the exact envelope`);
    }
    const maxNumerator = declaredDenominator.toString();
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
                uNumerator: angularNumerator(cellTriangle[0][0]).toString(),
                vNumerator: stationNumerator(cellTriangle[0][1]).toString(),
              },
              {
                uNumerator: angularNumerator(cellTriangle[1][0]).toString(),
                vNumerator: stationNumerator(cellTriangle[1][1]).toString(),
              },
              {
                uNumerator: angularNumerator(cellTriangle[2][0]).toString(),
                vNumerator: stationNumerator(cellTriangle[2][1]).toString(),
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
      ...(oddFactor === 1 ? {} : { oddDenominatorFactor: oddFactor.toString() }),
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
