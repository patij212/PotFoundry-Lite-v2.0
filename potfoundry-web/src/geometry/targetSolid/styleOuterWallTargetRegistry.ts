import type { StyleId } from '../types';
import {
  artDecoLayeredOuterWallTargetForProof,
  createArtDecoLayeredOuterWallTargetBinding,
  type ArtDecoLayeredOuterWallTargetBinding,
} from './artDecoLayeredOuterWallTarget';
import {
  bambooSegmentsLayeredOuterWallTargetForProof,
  createBambooSegmentsLayeredOuterWallTargetBinding,
  type BambooSegmentsLayeredOuterWallTargetBinding,
} from './bambooSegmentsLayeredOuterWallTarget';
import {
  basketWeaveOuterWallTargetForProof,
  createBasketWeaveOuterWallTargetBinding,
  type BasketWeaveOuterWallTargetBinding,
} from './basketWeaveOuterWallTarget';
import {
  celticKnotOuterWallTargetForProof,
  createCelticKnotOuterWallTargetBinding,
  type CelticKnotOuterWallTargetBinding,
} from './celticKnotOuterWallTarget';
import {
  celticTriquetraOuterWallTargetForProof,
  createCelticTriquetraOuterWallTargetBinding,
  type CelticTriquetraOuterWallTargetBinding,
} from './celticTriquetraOuterWallTarget';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import {
  createDragonScalesLayeredOuterWallTargetBinding,
  dragonScalesLayeredOuterWallTargetForProof,
  type DragonScalesLayeredOuterWallTargetBinding,
} from './dragonScalesLayeredOuterWallTarget';
import {
  createGeneratedContinuousFeatureStyleOuterWallTargetBinding,
  generatedContinuousFeatureStyleOuterWallTargetForProof,
  type GeneratedContinuousFeatureStyleOuterWallTargetBinding,
} from './generatedContinuousFeatureStyleOuterWallTargets';
import {
  createGeneratedSmoothStyleOuterWallTargetBinding,
  generatedSmoothStyleOuterWallTargetForProof,
  type GeneratedSmoothStyleOuterWallTargetBinding,
} from './generatedSmoothStyleOuterWallTargets';
import {
  createHarmonicRippleOuterWallTargetBinding,
  harmonicRippleOuterWallTargetForProof,
  type HarmonicRippleOuterWallTargetBinding,
} from './harmonicRippleOuterWallTarget';
import {
  createHexagonalHiveOuterWallTargetBinding,
  hexagonalHiveOuterWallTargetForProof,
  type HexagonalHiveOuterWallTargetBinding,
} from './hexagonalHiveOuterWallTarget';
import { sha256Utf8 } from './incrementalSha256';
import {
  createLowPolyFacetLayeredOuterWallTargetBinding,
  lowPolyFacetLayeredOuterWallTargetForProof,
  type LowPolyFacetLayeredOuterWallTargetBinding,
} from './lowPolyFacetLayeredOuterWallTarget';
import {
  createSuperformulaBlossomOuterWallTargetBinding,
  superformulaBlossomOuterWallTargetForProof,
  type SuperformulaBlossomOuterWallTargetBinding,
} from './superformulaBlossomOuterWallTarget';
import {
  createVoronoiOuterWallTargetBinding,
  voronoiOuterWallTargetForProof,
  type VoronoiOuterWallTargetBinding,
} from './voronoiOuterWallTarget';

export const STYLE_OUTER_WALL_TARGET_REGISTRY_VERSION =
  'potfoundry.style-outer-wall-target-registry/v1' as const;
export const STYLE_OUTER_WALL_TARGET_REGISTRY_SCOPE =
  'all-20-authenticated-generated-outer-wall-target-dispatch-and-fail-closed-composition-readiness-only-no-regularity-full-solid-artifact-distance-or-device-conformance-proof' as const;

export const CERTIFIED_STYLE_TARGET_IDS = Object.freeze([
  'SuperformulaBlossom',
  'FourierBloom',
  'SpiralRidges',
  'SuperellipseMorph',
  'HarmonicRipple',
  'GothicArches',
  'WaveInterference',
  'Crystalline',
  'ArtDeco',
  'DragonScales',
  'BambooSegments',
  'RippleInterference',
  'GyroidManifold',
  'Voronoi',
  'BasketWeave',
  'GeometricStar',
  'HexagonalHive',
  'CelticKnot',
  'CelticTriquetra',
  'LowPolyFacet',
] as const satisfies readonly StyleId[]);

export const STYLE_OUTER_WALL_TARGET_REGISTRY_PROOF_SHA256 = sha256Utf8(
  [
    STYLE_OUTER_WALL_TARGET_REGISTRY_VERSION,
    `scope=${STYLE_OUTER_WALL_TARGET_REGISTRY_SCOPE}`,
    `styles=${CERTIFIED_STYLE_TARGET_IDS.join(',')}`,
    'exactly one statically dispatched authenticated source binding is required for every canonical style id',
    'the registry preserves every generated patch id, role, kind, program hash, and node count',
    'nonperiodic SpiralRidges refuses composition because its source emits no seam curtain',
    'Voronoi generated CPU/WGSL programs share one baked CPU period, while a legacy-production integration blocker records any old Math.round versus round-to-even split',
    'HexagonalHive noise, BasketWeave checker jumps, and CelticKnot ribbon jumps refuse while their complete internal physical side graphs are absent',
    'a source may be composition-ready only when every active positional discontinuity is closed physically and no known evaluator mismatch remains',
    'all styles retain unresolved regularity, full-solid, final-artifact, and device-conformance obligations',
    'the registry is coverage and refusal authority only; it never issues a geometric or printable certificate',
  ].join('\n')
);

export type StyleOuterWallTargetSourceBinding =
  | ArtDecoLayeredOuterWallTargetBinding
  | BambooSegmentsLayeredOuterWallTargetBinding
  | BasketWeaveOuterWallTargetBinding
  | CelticKnotOuterWallTargetBinding
  | CelticTriquetraOuterWallTargetBinding
  | DragonScalesLayeredOuterWallTargetBinding
  | GeneratedContinuousFeatureStyleOuterWallTargetBinding
  | GeneratedSmoothStyleOuterWallTargetBinding
  | HarmonicRippleOuterWallTargetBinding
  | HexagonalHiveOuterWallTargetBinding
  | LowPolyFacetLayeredOuterWallTargetBinding
  | SuperformulaBlossomOuterWallTargetBinding
  | VoronoiOuterWallTargetBinding;

export type OuterWallTargetPatchRole = 'outer-wall' | 'feature-curtain' | 'feature-side';

export interface StyleOuterWallTargetPatchSummary {
  readonly patchId: string;
  readonly role: OuterWallTargetPatchRole;
  readonly kind: string;
  readonly programSha256: string;
  readonly nodeCount: number;
}

export type OuterWallCompositionBlocker =
  | 'MISSING_POSITIONAL_SEAM_CURTAIN'
  | 'MISSING_INTERNAL_CELL_FEATURE_SIDE_GRAPH'
  | 'MISSING_INTERNAL_CHECKER_CURTAIN_GRAPH'
  | 'MISSING_INTERNAL_RIBBON_FEATURE_SIDE_GRAPH';

export type LegacyProductionIntegrationBlocker =
  'LEGACY_PRODUCTION_CPU_WGSL_PERIOD_MISMATCH';

declare const styleOuterWallTargetRegistryBrand: unique symbol;

export interface StyleOuterWallTargetRegistryBinding {
  readonly schemaVersion: typeof STYLE_OUTER_WALL_TARGET_REGISTRY_VERSION;
  readonly implementationScope: typeof STYLE_OUTER_WALL_TARGET_REGISTRY_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly styleId: StyleId;
  readonly sourceBindingSha256: string;
  readonly sourceImplementationScope: string;
  readonly sourcePatchSetSha256: string;
  readonly patchCount: number;
  readonly patches: readonly StyleOuterWallTargetPatchSummary[];
  readonly outerWallPhysicalClosureComplete: boolean;
  readonly legacyProductionIntegrationAdmissible: boolean;
  readonly legacyProductionIntegrationBlockers: readonly LegacyProductionIntegrationBlocker[];
  readonly outerWallCompositionAdmissible: boolean;
  readonly compositionBlockers: readonly OuterWallCompositionBlocker[];
  readonly completeRegularityPartitionProven: false;
  readonly completeFullSolidSurfaceComplexEmitted: false;
  readonly wgslDeviceConformanceProven: false;
  readonly sourceBinding: StyleOuterWallTargetSourceBinding;
  readonly [styleOuterWallTargetRegistryBrand]: true;
}

interface RegisteredBinding {
  readonly binding: StyleOuterWallTargetRegistryBinding;
  readonly canonicalInput: CanonicalTargetInputBinding;
  readonly sourceBinding: StyleOuterWallTargetSourceBinding;
}

interface PatchLike {
  readonly patchId: string;
  readonly role?: OuterWallTargetPatchRole;
  readonly kind?: string;
  readonly programSha256: string;
  readonly nodeCount: number;
}

interface DerivedBinding {
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly styleId: StyleId;
  readonly sourceBinding: StyleOuterWallTargetSourceBinding;
  readonly sourceBindingSha256: string;
  readonly sourceImplementationScope: string;
  readonly sourcePatchSetSha256: string;
  readonly patches: readonly StyleOuterWallTargetPatchSummary[];
  readonly outerWallPhysicalClosureComplete: boolean;
  readonly legacyProductionIntegrationAdmissible: boolean;
  readonly legacyProductionIntegrationBlockers: readonly LegacyProductionIntegrationBlocker[];
  readonly outerWallCompositionAdmissible: boolean;
  readonly compositionBlockers: readonly OuterWallCompositionBlocker[];
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Style outer-wall target registry refused: ${message}`);
}

function createSourceBinding(
  input: CanonicalTargetInputBinding
): StyleOuterWallTargetSourceBinding {
  switch (input.style.styleId) {
    case 'SuperformulaBlossom':
      return superformulaBlossomOuterWallTargetForProof(
        createSuperformulaBlossomOuterWallTargetBinding(input)
      );
    case 'FourierBloom':
    case 'SpiralRidges':
    case 'SuperellipseMorph':
      return generatedSmoothStyleOuterWallTargetForProof(
        createGeneratedSmoothStyleOuterWallTargetBinding(input)
      );
    case 'HarmonicRipple':
      return harmonicRippleOuterWallTargetForProof(
        createHarmonicRippleOuterWallTargetBinding(input)
      );
    case 'GothicArches':
    case 'WaveInterference':
    case 'Crystalline':
    case 'RippleInterference':
    case 'GyroidManifold':
    case 'GeometricStar':
      return generatedContinuousFeatureStyleOuterWallTargetForProof(
        createGeneratedContinuousFeatureStyleOuterWallTargetBinding(input)
      );
    case 'ArtDeco':
      return artDecoLayeredOuterWallTargetForProof(
        createArtDecoLayeredOuterWallTargetBinding(input)
      );
    case 'DragonScales':
      return dragonScalesLayeredOuterWallTargetForProof(
        createDragonScalesLayeredOuterWallTargetBinding(input)
      );
    case 'BambooSegments':
      return bambooSegmentsLayeredOuterWallTargetForProof(
        createBambooSegmentsLayeredOuterWallTargetBinding(input)
      );
    case 'Voronoi':
      return voronoiOuterWallTargetForProof(createVoronoiOuterWallTargetBinding(input));
    case 'BasketWeave':
      return basketWeaveOuterWallTargetForProof(
        createBasketWeaveOuterWallTargetBinding(input)
      );
    case 'HexagonalHive':
      return hexagonalHiveOuterWallTargetForProof(
        createHexagonalHiveOuterWallTargetBinding(input)
      );
    case 'CelticKnot':
      return celticKnotOuterWallTargetForProof(
        createCelticKnotOuterWallTargetBinding(input)
      );
    case 'CelticTriquetra':
      return celticTriquetraOuterWallTargetForProof(
        createCelticTriquetraOuterWallTargetBinding(input)
      );
    case 'LowPolyFacet':
      return lowPolyFacetLayeredOuterWallTargetForProof(
        createLowPolyFacetLayeredOuterWallTargetBinding(input)
      );
  }
}

function authenticateSourceBinding(
  source: StyleOuterWallTargetSourceBinding
): StyleOuterWallTargetSourceBinding {
  switch (source.styleId) {
    case 'SuperformulaBlossom':
      return superformulaBlossomOuterWallTargetForProof(source);
    case 'FourierBloom':
    case 'SpiralRidges':
    case 'SuperellipseMorph':
      return generatedSmoothStyleOuterWallTargetForProof(source);
    case 'HarmonicRipple':
      return harmonicRippleOuterWallTargetForProof(source);
    case 'GothicArches':
    case 'WaveInterference':
    case 'Crystalline':
    case 'RippleInterference':
    case 'GyroidManifold':
    case 'GeometricStar':
      return generatedContinuousFeatureStyleOuterWallTargetForProof(source);
    case 'ArtDeco':
      return artDecoLayeredOuterWallTargetForProof(source);
    case 'DragonScales':
      return dragonScalesLayeredOuterWallTargetForProof(source);
    case 'BambooSegments':
      return bambooSegmentsLayeredOuterWallTargetForProof(source);
    case 'Voronoi':
      return voronoiOuterWallTargetForProof(source);
    case 'BasketWeave':
      return basketWeaveOuterWallTargetForProof(source);
    case 'HexagonalHive':
      return hexagonalHiveOuterWallTargetForProof(source);
    case 'CelticKnot':
      return celticKnotOuterWallTargetForProof(source);
    case 'CelticTriquetra':
      return celticTriquetraOuterWallTargetForProof(source);
    case 'LowPolyFacet':
      return lowPolyFacetLayeredOuterWallTargetForProof(source);
  }
}

function sourcePatches(
  source: StyleOuterWallTargetSourceBinding
): readonly StyleOuterWallTargetPatchSummary[] {
  const patchValues = (
    'patches' in source ? source.patches : [source]
  ) as unknown as readonly PatchLike[];
  const patchIds = new Set<string>();
  const patches = patchValues.map((patch) => {
    if (
      typeof patch.patchId !== 'string' ||
      patch.patchId.length === 0 ||
      !/^[0-9a-f]{64}$/.test(patch.programSha256) ||
      !Number.isSafeInteger(patch.nodeCount) ||
      patch.nodeCount <= 0
    ) {
      fail('authenticated source exposed an invalid patch summary');
    }
    if (patchIds.has(patch.patchId)) {
      fail(`authenticated source exposed duplicate patch '${patch.patchId}'`);
    }
    patchIds.add(patch.patchId);
    return Object.freeze({
      patchId: patch.patchId,
      role: patch.role ?? 'outer-wall',
      kind: patch.kind ?? 'outer-wall',
      programSha256: patch.programSha256,
      nodeCount: patch.nodeCount,
    });
  });
  if (patches.length === 0) fail('authenticated source exposed no target patches');
  return Object.freeze(patches);
}

function compositionStatus(source: StyleOuterWallTargetSourceBinding): Readonly<{
  blockers: readonly OuterWallCompositionBlocker[];
  legacyProductionIntegrationBlockers: readonly LegacyProductionIntegrationBlocker[];
  outerWallPhysicalClosureComplete: boolean;
}> {
  const blockers: OuterWallCompositionBlocker[] = [];
  const legacyProductionIntegrationBlockers: LegacyProductionIntegrationBlocker[] = [];
  switch (source.styleId) {
    case 'SpiralRidges':
      if (!source.periodicIdentificationAdmissible) {
        blockers.push('MISSING_POSITIONAL_SEAM_CURTAIN');
      }
      break;
    case 'Voronoi':
      if (source.currentCpuWgslPeriodMismatch) {
        legacyProductionIntegrationBlockers.push(
          'LEGACY_PRODUCTION_CPU_WGSL_PERIOD_MISMATCH'
        );
      }
      break;
    case 'HexagonalHive':
      if (source.internalCellDiscontinuitiesActive) {
        blockers.push('MISSING_INTERNAL_CELL_FEATURE_SIDE_GRAPH');
      }
      break;
    case 'BasketWeave':
      if (source.internalCheckerDiscontinuitiesActive) {
        blockers.push('MISSING_INTERNAL_CHECKER_CURTAIN_GRAPH');
      }
      break;
    case 'CelticKnot':
      if (
        source.internalRibbonDiscontinuitiesActive &&
        !source.completeInternalFeatureSideGraphEmitted
      ) {
        blockers.push('MISSING_INTERNAL_RIBBON_FEATURE_SIDE_GRAPH');
      }
      break;
  }
  return Object.freeze({
    blockers: Object.freeze(blockers),
    legacyProductionIntegrationBlockers: Object.freeze(
      legacyProductionIntegrationBlockers
    ),
    outerWallPhysicalClosureComplete: blockers.length === 0,
  });
}

function deriveBinding(
  canonicalInputValue: CanonicalTargetInputBinding,
  sourceValue: StyleOuterWallTargetSourceBinding
): DerivedBinding {
  const inputProof = canonicalTargetInputForProof(canonicalInputValue);
  const sourceBinding = authenticateSourceBinding(sourceValue);
  if (
    sourceBinding.canonicalInputSha256 !== inputProof.canonicalInputSha256 ||
    sourceBinding.styleId !== canonicalInputValue.style.styleId
  ) {
    fail('source binding does not belong to the canonical target input');
  }
  const patches = sourcePatches(sourceBinding);
  const sourcePatchSetSha256 =
    'patchSetSha256' in sourceBinding
      ? sourceBinding.patchSetSha256
      : (sourceBinding as SuperformulaBlossomOuterWallTargetBinding).programSha256;
  const status = compositionStatus(sourceBinding);
  const outerWallCompositionAdmissible = status.blockers.length === 0;
  const bindingValue = {
    canonicalInputSha256: inputProof.canonicalInputSha256,
    completeFullSolidSurfaceComplexEmitted: false,
    completeRegularityPartitionProven: false,
    compositionBlockers: status.blockers,
    implementationScope: STYLE_OUTER_WALL_TARGET_REGISTRY_SCOPE,
    legacyProductionIntegrationAdmissible:
      status.legacyProductionIntegrationBlockers.length === 0,
    legacyProductionIntegrationBlockers:
      status.legacyProductionIntegrationBlockers,
    outerWallCompositionAdmissible,
    outerWallPhysicalClosureComplete: status.outerWallPhysicalClosureComplete,
    patchCount: patches.length.toString(),
    patches: patches.map((patch) => ({
      kind: patch.kind,
      nodeCount: patch.nodeCount.toString(),
      patchId: patch.patchId,
      programSha256: patch.programSha256,
      role: patch.role,
    })),
    proofMethodSha256: STYLE_OUTER_WALL_TARGET_REGISTRY_PROOF_SHA256,
    schemaVersion: STYLE_OUTER_WALL_TARGET_REGISTRY_VERSION,
    sourceBindingSha256: sourceBinding.bindingSha256,
    sourceImplementationScope: sourceBinding.implementationScope,
    sourcePatchSetSha256,
    styleId: sourceBinding.styleId,
    wgslDeviceConformanceProven: false,
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.style-outer-wall-target-registry/binding/v1',
    bindingValue
  );
  return Object.freeze({
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    styleId: sourceBinding.styleId,
    sourceBinding,
    sourceBindingSha256: sourceBinding.bindingSha256,
    sourceImplementationScope: sourceBinding.implementationScope,
    sourcePatchSetSha256,
    patches,
    outerWallPhysicalClosureComplete: status.outerWallPhysicalClosureComplete,
    legacyProductionIntegrationAdmissible:
      status.legacyProductionIntegrationBlockers.length === 0,
    legacyProductionIntegrationBlockers:
      status.legacyProductionIntegrationBlockers,
    outerWallCompositionAdmissible,
    compositionBlockers: status.blockers,
  });
}

/** Build the one fail-closed, statically exhaustive outer-wall target dispatch for G1. */
export function createStyleOuterWallTargetRegistryBinding(
  canonicalInput: CanonicalTargetInputBinding
): StyleOuterWallTargetRegistryBinding {
  canonicalTargetInputForProof(canonicalInput);
  const sourceBinding = createSourceBinding(canonicalInput);
  const derived = deriveBinding(canonicalInput, sourceBinding);
  const binding = Object.freeze({
    schemaVersion: STYLE_OUTER_WALL_TARGET_REGISTRY_VERSION,
    implementationScope: STYLE_OUTER_WALL_TARGET_REGISTRY_SCOPE,
    proofMethodSha256: STYLE_OUTER_WALL_TARGET_REGISTRY_PROOF_SHA256,
    bindingSha256: derived.bindingSha256,
    bindingCanonicalJson: derived.bindingCanonicalJson,
    canonicalInputSha256: derived.canonicalInputSha256,
    styleId: derived.styleId,
    sourceBindingSha256: derived.sourceBindingSha256,
    sourceImplementationScope: derived.sourceImplementationScope,
    sourcePatchSetSha256: derived.sourcePatchSetSha256,
    patchCount: derived.patches.length,
    patches: derived.patches,
    outerWallPhysicalClosureComplete: derived.outerWallPhysicalClosureComplete,
    legacyProductionIntegrationAdmissible:
      derived.legacyProductionIntegrationAdmissible,
    legacyProductionIntegrationBlockers:
      derived.legacyProductionIntegrationBlockers,
    outerWallCompositionAdmissible: derived.outerWallCompositionAdmissible,
    compositionBlockers: derived.compositionBlockers,
    completeRegularityPartitionProven: false,
    completeFullSolidSurfaceComplexEmitted: false,
    wgslDeviceConformanceProven: false,
    sourceBinding: derived.sourceBinding,
  }) as StyleOuterWallTargetRegistryBinding;
  registry.set(
    binding,
    Object.freeze({ binding, canonicalInput, sourceBinding: derived.sourceBinding })
  );
  return binding;
}

/** Reauthenticate the registry and its exact style-specific source capability. */
export function styleOuterWallTargetRegistryForProof(
  value: StyleOuterWallTargetRegistryBinding
): StyleOuterWallTargetRegistryBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('binding must be an authenticated capability');
  }
  const registered = registry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('binding must be an authenticated capability');
  }
  const derived = deriveBinding(registered.canonicalInput, registered.sourceBinding);
  if (
    value.schemaVersion !== STYLE_OUTER_WALL_TARGET_REGISTRY_VERSION ||
    value.implementationScope !== STYLE_OUTER_WALL_TARGET_REGISTRY_SCOPE ||
    value.proofMethodSha256 !== STYLE_OUTER_WALL_TARGET_REGISTRY_PROOF_SHA256 ||
    value.bindingSha256 !== derived.bindingSha256 ||
    value.bindingCanonicalJson !== derived.bindingCanonicalJson ||
    value.canonicalInputSha256 !== derived.canonicalInputSha256 ||
    value.styleId !== derived.styleId ||
    value.sourceBindingSha256 !== derived.sourceBindingSha256 ||
    value.sourceImplementationScope !== derived.sourceImplementationScope ||
    value.sourcePatchSetSha256 !== derived.sourcePatchSetSha256 ||
    value.patchCount !== derived.patches.length ||
    value.patches !== derived.patches &&
      value.patches.some(
        (patch, index) =>
          patch.patchId !== derived.patches[index]?.patchId ||
          patch.role !== derived.patches[index]?.role ||
          patch.kind !== derived.patches[index]?.kind ||
          patch.programSha256 !== derived.patches[index]?.programSha256 ||
          patch.nodeCount !== derived.patches[index]?.nodeCount
      ) ||
    value.outerWallPhysicalClosureComplete !== derived.outerWallPhysicalClosureComplete ||
    value.legacyProductionIntegrationAdmissible !==
      derived.legacyProductionIntegrationAdmissible ||
    value.legacyProductionIntegrationBlockers.length !==
      derived.legacyProductionIntegrationBlockers.length ||
    value.legacyProductionIntegrationBlockers.some(
      (blocker, index) =>
        blocker !== derived.legacyProductionIntegrationBlockers[index]
    ) ||
    value.outerWallCompositionAdmissible !== derived.outerWallCompositionAdmissible ||
    value.compositionBlockers.length !== derived.compositionBlockers.length ||
    value.compositionBlockers.some(
      (blocker, index) => blocker !== derived.compositionBlockers[index]
    ) ||
    value.completeRegularityPartitionProven !== false ||
    value.completeFullSolidSurfaceComplexEmitted !== false ||
    value.wgslDeviceConformanceProven !== false ||
    value.sourceBinding !== registered.sourceBinding
  ) {
    fail('binding fields are inconsistent');
  }
  return value;
}
