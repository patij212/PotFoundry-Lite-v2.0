import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { canonicalizeCertificationJson, parseCanonicalCertificationJson } from './canonicalCertificationJson';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from './completeMappedArtifactGeometry';
import { sha256Utf8 } from './incrementalSha256';
import {
  createTargetSurfaceComplexBinding,
  TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  TargetSurfaceComplexError,
  targetSurfaceComplexForProof,
  targetSurfaceComplexSnapshotForProof,
  type TargetSurfaceComplexBinding,
  type TargetSurfacePatchRole,
  type TargetSurfacePatchSide,
} from './targetSurfaceComplex';

interface FaceFixture {
  readonly patchId: string;
  readonly role: TargetSurfacePatchRole;
  readonly corners: readonly [string, string, string, string];
}

interface DefinitionFixture {
  edges: Array<{
    edgeId: string;
    incidents: Array<{
      direction: 'forward' | 'reverse';
      patchId: string;
      side: TargetSurfacePatchSide;
    }>;
    owner: { patchId: string; side: TargetSurfacePatchSide };
    semantics:
      | 'smooth-adjacency'
      | 'crease-adjacency'
      | 'periodic-identification'
      | 'feature-closure-adjacency';
  }>;
  features: Array<{
    closurePatchIds: string[];
    edgeIds: string[];
    featureId: string;
    hostRole:
      | 'outer-wall'
      | 'inner-wall'
      | 'top-rim'
      | 'bottom-top'
      | 'bottom-under'
      | 'drain-wall';
    kind: 'crease' | 'discontinuity';
  }>;
  patches: Array<{
    domainKind: 'unit-square';
    patchId: string;
    role: TargetSurfacePatchRole;
    declaredEvaluatorProgramSha256: string;
  }>;
  schemaVersion: typeof TARGET_SURFACE_COMPLEX_DEFINITION_VERSION;
}

const SIDE_CORNERS: Readonly<Record<TargetSurfacePatchSide, readonly [number, number]>> = {
  v0: [0, 1],
  u1: [1, 2],
  v1: [2, 3],
  u0: [3, 0],
};

function definitionFromFaces(
  faces: readonly FaceFixture[],
  fixtureLabel: string
): DefinitionFixture {
  const sidesByPhysicalEdge = new Map<
    string,
    Array<{
      patchId: string;
      side: TargetSurfacePatchSide;
      start: string;
      end: string;
    }>
  >();
  for (const face of faces) {
    for (const [side, [startIndex, endIndex]] of Object.entries(SIDE_CORNERS) as Array<
      [TargetSurfacePatchSide, readonly [number, number]]
    >) {
      const start = face.corners[startIndex];
      const end = face.corners[endIndex];
      const key = [start, end].sort().join('-');
      const bucket = sidesByPhysicalEdge.get(key) ?? [];
      bucket.push({ patchId: face.patchId, side, start, end });
      sidesByPhysicalEdge.set(key, bucket);
    }
  }
  const edges = [...sidesByPhysicalEdge.entries()]
    .map(([physicalEdge, sides]) => {
      if (sides.length !== 2) throw new Error(`fixture edge ${physicalEdge} is not paired`);
      const [globalStart, globalEnd] = physicalEdge.split('-');
      const incidents = sides
        .map(({ patchId, side, start, end }) => {
          if (!(
            (start === globalStart && end === globalEnd) ||
            (start === globalEnd && end === globalStart)
          )) {
            throw new Error(`fixture edge ${physicalEdge} has inconsistent endpoints`);
          }
          return {
            direction: start === globalStart ? ('forward' as const) : ('reverse' as const),
            patchId,
            side,
          };
        })
        .sort((left, right) => {
          const leftKey = `${left.patchId}\0${left.side}`;
          const rightKey = `${right.patchId}\0${right.side}`;
          return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
      if (incidents[0].direction === incidents[1].direction) {
        throw new Error(`fixture edge ${physicalEdge} orientation is inconsistent`);
      }
      return {
        edgeId: `edge/${physicalEdge}`,
        incidents,
        owner: { patchId: incidents[0].patchId, side: incidents[0].side },
        semantics: 'smooth-adjacency' as const,
      };
    })
    .sort((left, right) => (left.edgeId < right.edgeId ? -1 : left.edgeId > right.edgeId ? 1 : 0));
  return {
    edges,
    features: [],
    patches: faces
      .map(({ patchId, role }) => ({
        domainKind: 'unit-square' as const,
        patchId,
        role,
        declaredEvaluatorProgramSha256: sha256Utf8(`${fixtureLabel} target patch ${patchId}`),
      }))
      .sort((left, right) => (left.patchId < right.patchId ? -1 : left.patchId > right.patchId ? 1 : 0)),
    schemaVersion: TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  };
}

function ring(prefix: string, index: number): string {
  return `${prefix}${((index % 4) + 4) % 4}`;
}

function potDefinition(withDrain: boolean): DefinitionFixture {
  const faces: FaceFixture[] = [];
  for (let index = 0; index < 4; index += 1) {
    const next = index + 1;
    faces.push(
      {
        patchId: `outer-wall/${index}`,
        role: 'outer-wall',
        corners: [ring('ob', index), ring('ob', next), ring('ot', next), ring('ot', index)],
      },
      {
        patchId: `inner-wall/${index}`,
        role: 'inner-wall',
        corners: [ring('ib', next), ring('ib', index), ring('it', index), ring('it', next)],
      },
      {
        patchId: `top-rim/${index}`,
        role: 'top-rim',
        corners: [ring('it', index), ring('ot', index), ring('ot', next), ring('it', next)],
      }
    );
    if (withDrain) {
      faces.push(
        {
          patchId: `bottom-top/${index}`,
          role: 'bottom-top',
          corners: [ring('dt', index), ring('ib', index), ring('ib', next), ring('dt', next)],
        },
        {
          patchId: `bottom-under/${index}`,
          role: 'bottom-under',
          corners: [ring('db', index), ring('db', next), ring('ob', next), ring('ob', index)],
        },
        {
          patchId: `drain-wall/${index}`,
          role: 'drain-wall',
          corners: [ring('db', next), ring('db', index), ring('dt', index), ring('dt', next)],
        }
      );
    } else {
      faces.push(
        {
          patchId: `bottom-top/sector-${index}`,
          role: 'bottom-top',
          corners: [ring('ct', index), ring('ib', index), ring('ib', next), ring('ct', next)],
        },
        {
          patchId: `bottom-under/sector-${index}`,
          role: 'bottom-under',
          corners: [ring('cu', index), ring('cu', next), ring('ob', next), ring('ob', index)],
        }
      );
    }
  }
  if (!withDrain) {
    faces.push(
      {
        patchId: 'bottom-top/center',
        role: 'bottom-top',
        corners: [ring('ct', 0), ring('ct', 1), ring('ct', 2), ring('ct', 3)],
      },
      {
        patchId: 'bottom-under/center',
        role: 'bottom-under',
        corners: [ring('cu', 0), ring('cu', 3), ring('cu', 2), ring('cu', 1)],
      }
    );
  }
  return definitionFromFaces(faces, withDrain ? 'pot-with-drain' : 'pot-without-drain');
}

function singlePatchAnnularPotDefinition(): DefinitionFixture {
  const patchRoles = {
    'bottom-top': 'bottom-top',
    'bottom-under': 'bottom-under',
    'drain-wall': 'drain-wall',
    'inner-wall': 'inner-wall',
    'outer-wall': 'outer-wall',
    'top-rim': 'top-rim',
  } as const;
  const makeEdge = (
    edgeId: string,
    left: Readonly<{ patchId: keyof typeof patchRoles; side: TargetSurfacePatchSide }>,
    right: Readonly<{ patchId: keyof typeof patchRoles; side: TargetSurfacePatchSide }>,
    semantics: DefinitionFixture['edges'][number]['semantics']
  ): DefinitionFixture['edges'][number] => {
    const sorted = [left, right].sort((a, b) => {
      const aKey = `${a.patchId}\0${a.side}`;
      const bKey = `${b.patchId}\0${b.side}`;
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });
    return {
      edgeId,
      incidents: [
        { ...sorted[0], direction: 'forward' },
        { ...sorted[1], direction: 'reverse' },
      ],
      owner: { ...sorted[0] },
      semantics,
    };
  };
  const edges: DefinitionFixture['edges'] = [];
  for (const patchId of Object.keys(patchRoles) as Array<keyof typeof patchRoles>) {
    edges.push(
      makeEdge(
        `periodic/${patchId}`,
        { patchId, side: 'u0' },
        { patchId, side: 'u1' },
        'periodic-identification'
      )
    );
  }
  edges.push(
    makeEdge('junction/outer-rim', { patchId: 'outer-wall', side: 'v1' }, { patchId: 'top-rim', side: 'v1' }, 'smooth-adjacency'),
    makeEdge('junction/rim-inner', { patchId: 'top-rim', side: 'v0' }, { patchId: 'inner-wall', side: 'v1' }, 'smooth-adjacency'),
    makeEdge('junction/inner-bottom-top', { patchId: 'inner-wall', side: 'v0' }, { patchId: 'bottom-top', side: 'v1' }, 'smooth-adjacency'),
    makeEdge('junction/bottom-top-drain', { patchId: 'bottom-top', side: 'v0' }, { patchId: 'drain-wall', side: 'v1' }, 'smooth-adjacency'),
    makeEdge('junction/drain-bottom-under', { patchId: 'drain-wall', side: 'v0' }, { patchId: 'bottom-under', side: 'v0' }, 'smooth-adjacency'),
    makeEdge('junction/bottom-under-outer', { patchId: 'bottom-under', side: 'v1' }, { patchId: 'outer-wall', side: 'v0' }, 'smooth-adjacency')
  );
  edges.sort((left, right) =>
    left.edgeId < right.edgeId ? -1 : left.edgeId > right.edgeId ? 1 : 0
  );
  return {
    edges,
    features: [],
    patches: (Object.entries(patchRoles) as Array<
      [keyof typeof patchRoles, TargetSurfacePatchRole]
    >).map(([patchId, role]) => ({
      domainKind: 'unit-square',
      patchId,
      role,
      declaredEvaluatorProgramSha256: sha256Utf8(`single annular patch ${patchId}`),
    })),
    schemaVersion: TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  };
}

function periodicClosureAnnularPotDefinition(): DefinitionFixture {
  const definition = cloneDefinition(singlePatchAnnularPotDefinition());
  const closurePatchId = 'outer-curtain';
  definition.patches.push({
    domainKind: 'unit-square',
    patchId: closurePatchId,
    role: 'feature-curtain',
    declaredEvaluatorProgramSha256: sha256Utf8('periodic outer curtain'),
  });
  definition.patches.sort((left, right) =>
    left.patchId < right.patchId ? -1 : left.patchId > right.patchId ? 1 : 0
  );
  const outerRim = definition.edges.find((edge) => edge.edgeId === 'junction/outer-rim');
  if (outerRim === undefined) throw new Error('fixture outer/rim edge missing');
  const outerIncident = outerRim.incidents.find(
    (incident) => incident.patchId === 'outer-wall'
  );
  if (outerIncident === undefined) throw new Error('fixture outer incident missing');
  outerIncident.patchId = closurePatchId;
  outerRim.owner = { patchId: closurePatchId, side: outerIncident.side };
  outerRim.semantics = 'feature-closure-adjacency';
  outerRim.incidents.sort((left, right) => {
    const leftKey = `${left.patchId}\0${left.side}`;
    const rightKey = `${right.patchId}\0${right.side}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  definition.edges.push(
    {
      edgeId: 'feature/outer-base-to-curtain',
      incidents: [
        { direction: 'forward', patchId: closurePatchId, side: 'v0' },
        { direction: 'reverse', patchId: 'outer-wall', side: 'v1' },
      ],
      owner: { patchId: closurePatchId, side: 'v0' },
      semantics: 'feature-closure-adjacency',
    },
    {
      edgeId: 'periodic/outer-curtain',
      incidents: [
        { direction: 'forward', patchId: closurePatchId, side: 'u0' },
        { direction: 'reverse', patchId: closurePatchId, side: 'u1' },
      ],
      owner: { patchId: closurePatchId, side: 'u0' },
      semantics: 'periodic-identification',
    }
  );
  definition.edges.sort((left, right) =>
    left.edgeId < right.edgeId ? -1 : left.edgeId > right.edgeId ? 1 : 0
  );
  definition.features.push({
    closurePatchIds: [closurePatchId],
    edgeIds: ['feature/outer-base-to-curtain', 'junction/outer-rim'].sort(),
    featureId: 'feature/periodic-outer-curtain',
    hostRole: 'outer-wall',
    kind: 'discontinuity',
  });
  return definition;
}

function prefixedDefinition(
  definition: DefinitionFixture,
  prefix: string
): DefinitionFixture {
  const result = cloneDefinition(definition);
  for (const patch of result.patches) patch.patchId = `${prefix}/${patch.patchId}`;
  for (const edge of result.edges) {
    edge.edgeId = `${prefix}/${edge.edgeId}`;
    for (const incident of edge.incidents) incident.patchId = `${prefix}/${incident.patchId}`;
    edge.owner.patchId = `${prefix}/${edge.owner.patchId}`;
  }
  for (const feature of result.features) {
    feature.featureId = `${prefix}/${feature.featureId}`;
    feature.edgeIds = feature.edgeIds.map((edgeId) => `${prefix}/${edgeId}`).sort();
    feature.closurePatchIds = feature.closurePatchIds
      .map((patchId) => `${prefix}/${patchId}`)
      .sort();
  }
  return result;
}

function disconnectedDoublePotDefinition(): DefinitionFixture {
  const left = prefixedDefinition(potDefinition(false), 'left');
  const right = prefixedDefinition(potDefinition(false), 'right');
  return {
    edges: [...left.edges, ...right.edges].sort((a, b) =>
      a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0
    ),
    features: [],
    patches: [...left.patches, ...right.patches].sort((a, b) =>
      a.patchId < b.patchId ? -1 : a.patchId > b.patchId ? 1 : 0
    ),
    schemaVersion: TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  };
}

function cloneDefinition(definition: DefinitionFixture): DefinitionFixture {
  return JSON.parse(JSON.stringify(definition)) as DefinitionFixture;
}

function input(rDrain = 0) {
  return createCanonicalTargetInputBinding(
    { ...DEFAULT_GEOMETRY, r_drain: rDrain },
    'HarmonicRipple',
    {},
    { superformulaSeamBlendDegrees: 30 }
  );
}

function bind(definition: DefinitionFixture, rDrain = 0) {
  return createTargetSurfaceComplexBinding(
    input(rDrain),
    canonicalizeCertificationJson(definition)
  );
}

describe('G0 target surface complex', () => {
  it('authenticates a connected abstract genus-zero pot complex with classified role boundaries', () => {
    const binding = bind(potDefinition(false));
    expect(binding.topology).toEqual({
      componentCount: '1',
      genus: '0',
      abstractOrientable: true,
      abstractClosedTwoManifold: true,
      geometricImageManifoldProven: false,
      eulerCharacteristic: '2',
      vertexCount: '24',
      edgeCount: '44',
      faceCount: '22',
    });
    expect(binding.patches).toHaveLength(22);
    expect(binding.targetSurfaceComplexSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parseCanonicalCertificationJson(binding.bindingCanonicalJson).ok).toBe(true);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(targetSurfaceComplexForProof(binding)).toBe(binding);
    const snapshot = targetSurfaceComplexSnapshotForProof(binding);
    expect(snapshot.edges).toHaveLength(44);
    expect(snapshot.features).toEqual([]);
    expect(snapshot.surfaceDefinitionCanonicalJson).toBe(binding.surfaceDefinitionCanonicalJson);
    expect(snapshot.implementationScope).toBe(
      'abstract-cell-complex-only-no-evaluator-image-regularity'
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.edges)).toBe(true);
  });

  it('derives the exact geometry-only patch definition without losing the separate complex capability', () => {
    const surface = bind(potDefinition(false));
    const geometryTarget = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(surface);
    expect(geometryTarget.authenticatedSurfaceComplexProvenance).toBe(true);
    expect(geometryTarget.canonicalInputSha256).toBe(surface.canonicalInputSha256);
    expect(geometryTarget.expectedPatchIds).toEqual(
      surface.patches.map((patch) => patch.patchId)
    );
    expect(geometryTarget.expectedEvaluatorProgramSha256s).toEqual(
      surface.patches.map((patch) => patch.declaredEvaluatorProgramSha256)
    );
  });

  it('refuses missing sides, inconsistent orientation, and structural copies', () => {
    const missing = cloneDefinition(potDefinition(false));
    missing.edges.pop();
    expect(() => bind(missing)).toThrow(/every patch side|closed complex/i);

    const orientation = cloneDefinition(potDefinition(false));
    orientation.edges[0].incidents[1].direction = orientation.edges[0].incidents[0].direction;
    expect(() => bind(orientation)).toThrow(/opposite directions/i);

    const nonincidentOwner = cloneDefinition(potDefinition(false));
    const incidentPatchIds = new Set(
      nonincidentOwner.edges[0].incidents.map((incident) => incident.patchId)
    );
    const unrelatedPatch = nonincidentOwner.patches.find(
      (patch) => !incidentPatchIds.has(patch.patchId)
    );
    if (unrelatedPatch === undefined) throw new Error('fixture unrelated owner patch missing');
    nonincidentOwner.edges[0].owner = {
      patchId: unrelatedPatch.patchId,
      side: 'u0',
    };
    expect(() => bind(nonincidentOwner)).toThrow(/owner must name exactly one incident/i);

    expect(() => bind(disconnectedDoublePotDefinition())).toThrow(/exactly one component/i);

    const genuine = bind(potDefinition(false));
    const copy = Object.freeze({ ...genuine }) as TargetSurfaceComplexBinding;
    expect(() => targetSurfaceComplexForProof(copy)).toThrow(TargetSurfaceComplexError);
  });

  it('binds drain topology and mandatory surface roles to the authenticated input', () => {
    const drained = bind(potDefinition(true), 10);
    expect(drained.topology).toEqual({
      componentCount: '1',
      genus: '1',
      abstractOrientable: true,
      abstractClosedTwoManifold: true,
      geometricImageManifoldProven: false,
      eulerCharacteristic: '0',
      vertexCount: '24',
      edgeCount: '48',
      faceCount: '24',
    });
    expect(() => bind(potDefinition(true))).toThrow(/genus.*drain-selected genus/i);

    const forbiddenDrainRole = cloneDefinition(potDefinition(false));
    const spareOuter = forbiddenDrainRole.patches.find(
      (patch) => patch.patchId === 'outer-wall/0'
    );
    if (spareOuter === undefined) throw new Error('fixture spare outer patch missing');
    spareOuter.role = 'drain-wall';
    expect(() => bind(forbiddenDrainRole)).toThrow(/zero drain radius forbids drain-wall/i);

    const missingDrainRole = cloneDefinition(singlePatchAnnularPotDefinition());
    const declaredDrain = missingDrainRole.patches.find((patch) => patch.role === 'drain-wall');
    if (declaredDrain === undefined) throw new Error('fixture declared drain missing');
    declaredDrain.role = 'bottom-top';
    expect(() => bind(missingDrainRole, 10)).toThrow(/requires a drain-wall patch/i);
    const missingRole = cloneDefinition(potDefinition(false));
    for (const patch of missingRole.patches) {
      if (patch.role === 'top-rim') patch.role = 'outer-wall';
    }
    expect(() => bind(missingRole)).toThrow(/missing required role top-rim/i);
  });

  it('accepts legitimate self-paired periodic loop edges in a genus-one annular atlas', () => {
    const binding = bind(singlePatchAnnularPotDefinition(), 10);
    expect(binding.topology).toMatchObject({
      genus: '1',
      eulerCharacteristic: '0',
      vertexCount: '6',
      edgeCount: '12',
      faceCount: '6',
    });
    expect(
      binding.edges.filter((edge) => edge.semantics === 'periodic-identification')
    ).toHaveLength(6);

    const withPeriodicClosure = bind(periodicClosureAnnularPotDefinition(), 10);
    expect(withPeriodicClosure.topology).toMatchObject({
      genus: '1',
      eulerCharacteristic: '0',
      vertexCount: '7',
      edgeCount: '14',
      faceCount: '7',
    });
    expect(
      withPeriodicClosure.edges.find((edge) => edge.edgeId === 'periodic/outer-curtain')
        ?.semantics
    ).toBe('periodic-identification');
  });

  it('refuses role swaps, disconnected role islands, and drain-wall misbinding', () => {
    const swapped = cloneDefinition(potDefinition(false));
    const inner = swapped.patches.find((patch) => patch.patchId === 'inner-wall/0');
    const bottom = swapped.patches.find(
      (patch) => patch.patchId === 'bottom-top/sector-0'
    );
    if (inner === undefined || bottom === undefined) throw new Error('fixture role patch missing');
    [inner.role, bottom.role] = [bottom.role, inner.role];
    expect(() => bind(swapped)).toThrow(/role|junction|boundary/i);

    const misboundDrain = cloneDefinition(potDefinition(true));
    const drain = misboundDrain.patches.find((patch) => patch.patchId === 'drain-wall/0');
    const rim = misboundDrain.patches.find((patch) => patch.patchId === 'top-rim/0');
    if (drain === undefined || rim === undefined) throw new Error('fixture drain/rim patch missing');
    [drain.role, rim.role] = [rim.role, drain.role];
    expect(() => bind(misboundDrain, 10)).toThrow(/role|junction|boundary/i);
  });

  it('requires exact feature ownership for creases and discontinuity closure patches', () => {
    const crease = cloneDefinition(potDefinition(false));
    const roleByPatchId = new Map(crease.patches.map((patch) => [patch.patchId, patch.role]));
    const creaseEdge = crease.edges.find((edge) =>
      edge.incidents.every((incident) => roleByPatchId.get(incident.patchId) === 'outer-wall')
    );
    if (creaseEdge === undefined) throw new Error('fixture outer-wall seam missing');
    creaseEdge.semantics = 'crease-adjacency';
    crease.features.push({
      closurePatchIds: [],
      edgeIds: [creaseEdge.edgeId],
      featureId: 'feature/crease-0',
      hostRole: 'outer-wall',
      kind: 'crease',
    });
    expect(bind(crease).topology.genus).toBe('0');

    const curtain = cloneDefinition(potDefinition(false));
    const closurePatchId = 'outer-wall/0';
    const closurePatch = curtain.patches.find((patch) => patch.patchId === closurePatchId);
    if (closurePatch === undefined) throw new Error('fixture closure patch missing');
    closurePatch.role = 'feature-curtain';
    const closureEdges = curtain.edges
      .filter((edge) => edge.incidents.some((incident) => incident.patchId === closurePatchId))
      .map((edge) => {
        edge.semantics = 'feature-closure-adjacency';
        return edge.edgeId;
      })
      .sort();
    curtain.features.push({
      closurePatchIds: [closurePatchId],
      edgeIds: closureEdges,
      featureId: 'feature/discontinuity-0',
      hostRole: 'outer-wall',
      kind: 'discontinuity',
    });
    expect(bind(curtain).topology.genus).toBe('0');

    const orphan = cloneDefinition(curtain);
    orphan.features = [];
    expect(() => bind(orphan)).toThrow(/feature-bearing edges|closure patches/i);

    const crosswired = cloneDefinition(potDefinition(false));
    const crosswiredPatchId = 'outer-wall/0';
    const crosswiredPatch = crosswired.patches.find(
      (patch) => patch.patchId === crosswiredPatchId
    );
    if (crosswiredPatch === undefined) throw new Error('fixture crosswire patch missing');
    crosswiredPatch.role = 'feature-curtain';
    const crosswiredClosureEdges = crosswired.edges.filter((edge) =>
      edge.incidents.some((incident) => incident.patchId === crosswiredPatchId)
    );
    for (const edge of crosswiredClosureEdges) edge.semantics = 'feature-closure-adjacency';
    const unrelatedEdge = crosswired.edges.find((edge) =>
      edge.incidents.every((incident) => incident.patchId !== crosswiredPatchId)
    );
    if (unrelatedEdge === undefined) throw new Error('fixture unrelated edge missing');
    unrelatedEdge.semantics = 'feature-closure-adjacency';
    crosswired.features.push({
      closurePatchIds: [crosswiredPatchId],
      edgeIds: [...crosswiredClosureEdges.map((edge) => edge.edgeId), unrelatedEdge.edgeId].sort(),
      featureId: 'feature/crosswired',
      hostRole: 'outer-wall',
      kind: 'discontinuity',
    });
    expect(() => bind(crosswired)).toThrow(/exactly one explicit closure|does not touch/i);
  });

  it('fails closed on non-canonical definitions and accessor-like values', () => {
    expect(() =>
      createTargetSurfaceComplexBinding(
        input(),
        '{"edges":[],"features":[],"patches":[],"schemaVersion":1}'
      )
    ).toThrow(/number|canonical JSON|refused/i);

    const coercible = Object.defineProperty({}, Symbol.toPrimitive, {
      value: () => canonicalizeCertificationJson(potDefinition(false)),
    });
    expect(() =>
      createTargetSurfaceComplexBinding(input(), coercible as unknown as string)
    ).toThrow(/canonical JSON text|refused/i);
  });

  it('treats evaluator hashes as declarations and never as executable-proof authenticity', () => {
    const definition = cloneDefinition(potDefinition(false));
    definition.patches[0].declaredEvaluatorProgramSha256 = '0'.repeat(64);
    const binding = bind(definition);
    expect(binding.patches[0].declaredEvaluatorProgramSha256).toBe('0'.repeat(64));
    expect(binding.topology.geometricImageManifoldProven).toBe(false);
    expect(binding.implementationScope).toBe(
      'abstract-cell-complex-only-no-evaluator-image-regularity'
    );
  });
});
