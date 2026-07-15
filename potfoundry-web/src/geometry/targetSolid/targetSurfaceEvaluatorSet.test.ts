import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import {
  canonicalizeCertificationJson,
  parseCanonicalCertificationJson,
} from './canonicalCertificationJson';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from './completeMappedArtifactGeometry';
import {
  computeValidatedResidualProgramSha256,
  VALIDATED_RESIDUAL_PROGRAM_VERSION,
} from './validatedResidualProgram';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  createTargetSurfaceComplexBinding,
  TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  type TargetSurfaceBasePatchRole,
  type TargetSurfacePatchSide,
} from './targetSurfaceComplex';
import {
  createTargetSurfaceEvaluatorSetBinding,
  TargetSurfaceEvaluatorSetError,
  targetSurfaceEvaluatorSetForProof,
  type TargetSurfaceEvaluatorSetBinding,
} from './targetSurfaceEvaluatorSet';

const PATCH_ROLES = {
  'bottom-top': 'bottom-top',
  'bottom-under': 'bottom-under',
  'drain-wall': 'drain-wall',
  'inner-wall': 'inner-wall',
  'outer-wall': 'outer-wall',
  'top-rim': 'top-rim',
} as const satisfies Readonly<Record<string, TargetSurfaceBasePatchRole>>;

type PatchId = keyof typeof PATCH_ROLES;

interface SideRef {
  readonly patchId: PatchId;
  readonly side: TargetSurfacePatchSide;
}

function edge(
  edgeId: string,
  left: SideRef,
  right: SideRef,
  semantics: 'smooth-adjacency' | 'periodic-identification'
) {
  const incidents = [left, right]
    .sort((a, b) => {
      const aKey = `${a.patchId}\0${a.side}`;
      const bKey = `${b.patchId}\0${b.side}`;
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    })
    .map((incident, index) => ({
      direction: index === 0 ? ('forward' as const) : ('reverse' as const),
      ...incident,
    }));
  return {
    edgeId,
    incidents,
    owner: { patchId: incidents[0].patchId, side: incidents[0].side },
    semantics,
  };
}

function programJson(patchId: PatchId, z: string): string {
  return canonicalizeCertificationJson({
    evaluatorId: `test/${patchId}`,
    evaluatorVersion: 'v1',
    patchId,
    schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
    target: {
      x: { op: 'u' },
      y: { op: 'v' },
      z: { op: 'constant', value: z },
    },
  });
}

function fixture() {
  const patchIds = Object.keys(PATCH_ROLES).sort() as PatchId[];
  const programs = new Map(
    patchIds.map((patchId, index) => [patchId, programJson(patchId, index.toString())])
  );
  const edges = patchIds.map((patchId) =>
    edge(
      `periodic/${patchId}`,
      { patchId, side: 'u0' },
      { patchId, side: 'u1' },
      'periodic-identification'
    )
  );
  edges.push(
    edge('junction/outer-rim', { patchId: 'outer-wall', side: 'v1' }, { patchId: 'top-rim', side: 'v1' }, 'smooth-adjacency'),
    edge('junction/rim-inner', { patchId: 'top-rim', side: 'v0' }, { patchId: 'inner-wall', side: 'v1' }, 'smooth-adjacency'),
    edge('junction/inner-bottom-top', { patchId: 'inner-wall', side: 'v0' }, { patchId: 'bottom-top', side: 'v1' }, 'smooth-adjacency'),
    edge('junction/bottom-top-drain', { patchId: 'bottom-top', side: 'v0' }, { patchId: 'drain-wall', side: 'v1' }, 'smooth-adjacency'),
    edge('junction/drain-bottom-under', { patchId: 'drain-wall', side: 'v0' }, { patchId: 'bottom-under', side: 'v0' }, 'smooth-adjacency'),
    edge('junction/bottom-under-outer', { patchId: 'bottom-under', side: 'v1' }, { patchId: 'outer-wall', side: 'v0' }, 'smooth-adjacency')
  );
  edges.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
  const definition = canonicalizeCertificationJson({
    edges,
    features: [],
    patches: patchIds.map((patchId) => ({
      declaredEvaluatorProgramSha256: computeValidatedResidualProgramSha256(
        programs.get(patchId)!
      ),
      domainKind: 'unit-square',
      patchId,
      role: PATCH_ROLES[patchId],
    })),
    schemaVersion: TARGET_SURFACE_COMPLEX_DEFINITION_VERSION,
  });
  const input = createCanonicalTargetInputBinding(
    { ...DEFAULT_GEOMETRY, r_drain: 10 },
    'HarmonicRipple',
    {},
    { superformulaSeamBlendDegrees: 30 }
  );
  const surfaceComplex = createTargetSurfaceComplexBinding(input, definition);
  const geometryTarget =
    createCompleteMappedGeometryTargetBindingFromSurfaceComplex(surfaceComplex);
  const evaluators = patchIds.map((patchId) =>
    compileValidatedResidualEvaluator({
      targetSha256: geometryTarget.targetSha256,
      programCanonicalJson: programs.get(patchId)!,
    })
  );
  return { patchIds, programs, surfaceComplex, geometryTarget, evaluators };
}

describe('authenticated target-surface evaluator set', () => {
  it('binds every declared patch to the exact registered program and complete target', () => {
    const source = fixture();
    const binding = createTargetSurfaceEvaluatorSetBinding(
      source.surfaceComplex,
      source.evaluators
    );
    expect(binding.completeMappedTargetSha256).toBe(source.geometryTarget.targetSha256);
    expect(binding.targetSurfaceComplexSha256).toBe(
      source.surfaceComplex.targetSurfaceComplexSha256
    );
    expect(binding.evaluators.map((evaluator) => evaluator.patchId)).toEqual(source.patchIds);
    expect(binding.evaluatorSetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parseCanonicalCertificationJson(binding.evaluatorSetCanonicalJson).ok).toBe(true);
    expect(binding.implementationScope).toContain('no-cpu-wgsl-parity');
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.evaluators)).toBe(true);
    expect(targetSurfaceEvaluatorSetForProof(binding)).toBe(binding);
  });

  it('snapshots the source array and refuses reordered, sparse, accessor, and copied inputs', () => {
    const source = fixture();
    const mutable = [...source.evaluators];
    const binding = createTargetSurfaceEvaluatorSetBinding(source.surfaceComplex, mutable);
    mutable.reverse();
    expect(binding.evaluators.map((evaluator) => evaluator.patchId)).toEqual(source.patchIds);
    expect(() =>
      createTargetSurfaceEvaluatorSetBinding(
        source.surfaceComplex,
        [...source.evaluators].reverse()
      )
    ).toThrow(/does not equal/i);

    const sparse = new Array(source.evaluators.length) as typeof source.evaluators;
    expect(() => createTargetSurfaceEvaluatorSetBinding(source.surfaceComplex, sparse)).toThrow(
      /holes|extra properties/i
    );

    let getterCalled = false;
    const accessor = [...source.evaluators];
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      get() {
        getterCalled = true;
        return source.evaluators[0];
      },
    });
    expect(() => createTargetSurfaceEvaluatorSetBinding(source.surfaceComplex, accessor)).toThrow(
      /data property/i
    );
    expect(getterCalled).toBe(false);

    const copy = Object.freeze({ ...binding }) as TargetSurfaceEvaluatorSetBinding;
    expect(() => targetSurfaceEvaluatorSetForProof(copy)).toThrow(
      TargetSurfaceEvaluatorSetError
    );
  });

  it('refuses a different program and a stale complete-target hash', () => {
    const source = fixture();
    const firstPatchId = source.patchIds[0];
    const alteredProgram = programJson(firstPatchId, '999');
    const wrongProgram = compileValidatedResidualEvaluator({
      targetSha256: source.geometryTarget.targetSha256,
      programCanonicalJson: alteredProgram,
    });
    const programMismatch = [...source.evaluators];
    programMismatch[0] = wrongProgram;
    expect(() =>
      createTargetSurfaceEvaluatorSetBinding(source.surfaceComplex, programMismatch)
    ).toThrow(/program does not match/i);

    const staleTarget = compileValidatedResidualEvaluator({
      targetSha256: '0'.repeat(64),
      programCanonicalJson: source.programs.get(firstPatchId)!,
    });
    const targetMismatch = [...source.evaluators];
    targetMismatch[0] = staleTarget;
    expect(() =>
      createTargetSurfaceEvaluatorSetBinding(source.surfaceComplex, targetMismatch)
    ).toThrow(/different complete target/i);
  });
});
