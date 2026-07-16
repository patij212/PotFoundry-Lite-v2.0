import type { StyleId } from '../types';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { sha256Utf8 } from './incrementalSha256';
import {
  buildRadialOuterWallProgram,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
  RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256,
} from './radialOuterWallProgram';
import {
  compileGeneratedTargetProgramBackends,
  generatedTargetProgramBackendsForProof,
  type GeneratedTargetProgramBackends,
} from './validatedResidualProgram';
import type {
  TargetExpressionReference,
  ValidatedTargetProgramBuilder,
} from './validatedTargetProgramBuilder';

export const GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_VERSION =
  'potfoundry.generated-continuous-feature-style-outer-wall-target/v6' as const;
export const GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-gothic-wave-crystalline-gyroid-ripple-star-outer-wall-with-declared-piecewise-boundary-obligations-only-no-root-isolation-full-solid-regularity-artifact-distance-or-device-conformance-proof' as const;

export type GeneratedContinuousFeatureStyleId =
  | 'GothicArches'
  | 'WaveInterference'
  | 'Crystalline'
  | 'GyroidManifold'
  | 'RippleInterference'
  | 'GeometricStar';
export type PiecewiseBoundaryClass =
  | 'explicit-parameter-line-or-periodic-family'
  | 'implicit-program-level-set';

export interface DeclaredPiecewiseBoundaryFamily {
  readonly id: string;
  readonly boundaryClass: PiecewiseBoundaryClass;
  readonly exactCondition: string;
  readonly regularityReason: string;
  readonly requiredHandling: 'isolate-or-prove-inactive-before-certified-distance-subdivision';
}

export const GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_VERSION,
    `scope=${GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'GothicArches is emitted from its normalized finite formula with integer arch count and exact mathematical pi',
    'GothicArches is seam-periodic by xAbs invariance and x01 complement symmetry, including odd arch counts',
    'WaveInterference rounds warp, base, secondary, and detail angular frequencies to integers before program emission',
    'WaveInterference is seam-periodic because every warped angular consumer has integral frequency',
    'Crystalline uses integral facet and sub-facet counts with exact fractional-cycle coordinates; every wrap is position-continuous and declared as a facet boundary',
    'Crystalline emits its fractional-cycle coordinates as affine unit-parameter expressions (facetCount*u + heightPhase*v and the subFacets multiple) with tau cancelled symbolically at authoring time — real semantics unchanged — so certification kernels can band-resolve wraps against exact rational stations',
    'GyroidManifold is seam-periodic for every finite scale because its angular domain enters only through cos(theta) and sin(theta), contrary to the stale production comment that nonintegral scale can open the seam',
    'RippleInterference statically unrolls its authenticated two-to-eight sources and uses an exact periodic nearest-image coordinate before Euclidean distance evaluation',
    'GeometricStar row parity changes are position-continuous because the exact fourth-power vertical fade is zero on every row boundary; those boundaries remain declared derivative creases',
    'GeometricStar emits its sector cycles as affine unit-parameter expressions (pointCount*u, plus rowParity*shift only when shift is nonzero) with tau cancelled symbolically at authoring time — real semantics unchanged — so at shift zero certification kernels can band-resolve sector wraps against exact rational stations while the row-coupled nonzero-shift form keeps the sound hull',
    'every absolute-value, clamp, maximum, minimum, and compact-support transition that may reduce output regularity is declared as a partition obligation',
    'declarations are authenticated semantic obligations; they are not root-isolation results and do not by themselves prove a complete embedded feature graph',
    'all programs use the shared exact-pi radial profile/twist/Cartesian generator and forward-only SSA compiler',
    'this layer does not prove positive radius, injectivity, Jacobian regularity, clearance, full-solid closure, artifact distance, or device conformance',
  ].join('\n')
);

declare const generatedContinuousFeatureStyleOuterWallTargetBrand: unique symbol;

export interface GeneratedContinuousFeatureStyleOuterWallTargetBinding {
  readonly schemaVersion: typeof GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly patchId: 'outer-wall';
  readonly styleId: GeneratedContinuousFeatureStyleId;
  readonly continuitySemantics: 'continuous-piecewise-defined-target';
  readonly seamSemantics: 'periodic-identification-symbolically-admissible';
  readonly periodicIdentificationAdmissible: true;
  readonly seamProofSha256: string;
  readonly boundaryManifestCanonicalJson: string;
  readonly boundaryManifestSha256: string;
  readonly boundaryFamilyCount: number;
  readonly boundaryFamilies: readonly DeclaredPiecewiseBoundaryFamily[];
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
  readonly [generatedContinuousFeatureStyleOuterWallTargetBrand]: true;
}

interface ProgramAndManifest {
  readonly programCanonicalJson: string;
  readonly seamReason: string;
  readonly boundaryFamilies: readonly DeclaredPiecewiseBoundaryFamily[];
}

interface RegisteredBinding {
  readonly binding: GeneratedContinuousFeatureStyleOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();
const supportedStyles = new Set<StyleId>([
  'GothicArches',
  'WaveInterference',
  'Crystalline',
  'GyroidManifold',
  'RippleInterference',
  'GeometricStar',
]);
const EPSILON = 1e-6;

function fail(message: string): never {
  throw new TypeError(`Generated continuous-feature style outer-wall target refused: ${message}`);
}

function boundary(
  id: string,
  boundaryClass: PiecewiseBoundaryClass,
  exactCondition: string,
  regularityReason: string
): DeclaredPiecewiseBoundaryFamily {
  return Object.freeze({
    id,
    boundaryClass,
    exactCondition,
    regularityReason,
    requiredHandling: 'isolate-or-prove-inactive-before-certified-distance-subdivision',
  });
}

function freezeBoundaries(
  boundaries: readonly DeclaredPiecewiseBoundaryFamily[]
): readonly DeclaredPiecewiseBoundaryFamily[] {
  return Object.freeze([...boundaries]);
}

function exactNormalizedStyleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function evaluatorId(styleId: GeneratedContinuousFeatureStyleId): string {
  switch (styleId) {
    case 'GothicArches': return 'potfoundry.gothic-arches.outer-wall';
    case 'WaveInterference': return 'potfoundry.wave-interference.outer-wall';
    case 'Crystalline': return 'potfoundry.crystalline.outer-wall';
    case 'GyroidManifold': return 'potfoundry.gyroid-manifold.outer-wall';
    case 'RippleInterference': return 'potfoundry.ripple-interference.outer-wall';
    case 'GeometricStar': return 'potfoundry.geometric-star.outer-wall';
  }
}

function addMany(
  builder: ValidatedTargetProgramBuilder,
  values: readonly TargetExpressionReference[]
): TargetExpressionReference {
  if (values.length === 0) fail('cannot add an empty expression list');
  let result = values[0];
  for (let index = 1; index < values.length; index += 1) {
    result = builder.add(result, values[index]);
  }
  return result;
}

function buildGothicArches(input: CanonicalTargetInputBinding): ProgramAndManifest {
  const archCount = Math.max(
    1,
    Math.floor(exactNormalizedStyleNumber(input, 'gaCounts') + 0.5)
  );
  const pointiness = Math.max(0.25, exactNormalizedStyleNumber(input, 'gaPointiness'));
  const diamond = Math.min(1, Math.max(0, exactNormalizedStyleNumber(input, 'gaDiamond')));
  const xTracery = Math.min(1, Math.max(0, exactNormalizedStyleNumber(input, 'gaX')));
  const spring = Math.min(1, Math.max(0, exactNormalizedStyleNumber(input, 'gaSpring')));
  const relativeArchHeight = Math.min(
    1,
    Math.max(0, exactNormalizedStyleNumber(input, 'gaArchHeight'))
  );
  const archHeight = relativeArchHeight * (1 - spring);
  const archApex = spring + archHeight;
  const topStart = spring + 0.65 * (archApex - spring);
  const ribWidth = Math.max(EPSILON, exactNormalizedStyleNumber(input, 'gaRib'));
  const columnWidth = Math.max(EPSILON, exactNormalizedStyleNumber(input, 'gaCol'));
  const sharpness = Math.max(1, exactNormalizedStyleNumber(input, 'gaSharp'));
  const bands = Math.min(1, Math.max(0, exactNormalizedStyleNumber(input, 'gaBands')));
  const bandWidth = Math.max(EPSILON, exactNormalizedStyleNumber(input, 'gaBandW'));
  const blendWidth = Math.max(0.015, 1.25 * bandWidth);
  const gateWidth = 2 * ribWidth;
  const traceryWidth = 0.55 * columnWidth;
  const latticeWidth = Math.max(0.05, 2 * ribWidth);
  const rows = 0.9 + 1.6 * diamond;
  const relief = exactNormalizedStyleNumber(input, 'gaRelief');

  const programCanonicalJson = buildRadialOuterWallProgram(
    input,
    'GothicArches',
    {
      evaluatorId: evaluatorId('GothicArches'),
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    (context) => {
      const { builder, baseRadius, thetaMaterial, t, tau, one, constant } = context;
      const zero = constant(0);
      const two = constant(2);
      const half = constant(0.5);
      const sat = (value: TargetExpressionReference) => builder.clamp(value, zero, one);
      const ridge = (
        distance: TargetExpressionReference,
        width: number
      ): TargetExpressionReference => builder.power(
        builder.maximum(
          zero,
          builder.subtract(
            one,
            builder.divide(builder.absolute(distance), constant(width))
          )
        ),
        constant(sharpness)
      );
      const ridgeSin = (
        phase: TargetExpressionReference
      ): TargetExpressionReference => builder.power(
        builder.maximum(
          zero,
          builder.subtract(
            one,
            builder.divide(builder.absolute(builder.sin(phase)), constant(latticeWidth))
          )
        ),
        constant(sharpness)
      );

      const angularBayPhase = builder.multiply(constant(archCount), thetaMaterial);
      const xSigned = builder.cos(builder.multiply(half, angularBayPhase));
      const xAbs = builder.absolute(xSigned);
      const x01 = sat(builder.multiply(half, builder.add(xSigned, one)));
      const topMask = builder.smoothstep(
        constant(topStart - blendWidth),
        constant(topStart + blendWidth),
        t
      );
      const bottomMask = builder.subtract(one, topMask);

      const archY = builder.power(
        builder.maximum(
          zero,
          builder.subtract(one, builder.power(xAbs, constant(pointiness)))
        ),
        constant(1 / pointiness)
      );
      const archZ = builder.add(
        constant(spring),
        builder.multiply(constant(archApex - spring), archY)
      );
      const gate = builder.multiply(
        sat(builder.divide(builder.subtract(t, constant(spring)), constant(gateWidth))),
        sat(builder.divide(builder.subtract(archZ, t), constant(gateWidth)))
      );
      const ribArch = ridge(builder.subtract(t, archZ), ribWidth);
      const columnEdge = builder.power(
        builder.maximum(
          zero,
          builder.subtract(
            one,
            builder.divide(builder.subtract(one, xAbs), constant(columnWidth))
          )
        ),
        constant(sharpness)
      );
      const mullion = builder.power(
        builder.maximum(
          zero,
          builder.subtract(one, builder.divide(xAbs, constant(0.65 * columnWidth)))
        ),
        constant(sharpness)
      );
      const panel = builder.multiply(
        gate,
        builder.power(
          builder.maximum(
            zero,
            builder.subtract(one, builder.divide(xAbs, constant(0.95)))
          ),
          two
        )
      );
      const archDenominator = builder.maximum(
        constant(EPSILON),
        builder.subtract(archZ, constant(spring))
      );
      const localHeight = sat(
        builder.divide(builder.subtract(t, constant(spring)), archDenominator)
      );
      const xDiag = builder.multiply(
        gate,
        builder.add(
          ridge(builder.subtract(localHeight, x01), traceryWidth),
          ridge(
            builder.subtract(localHeight, builder.subtract(one, x01)),
            traceryWidth
          )
        )
      );
      const lower = builder.subtract(
        addMany(builder, [
          ribArch,
          builder.multiply(constant(0.7), builder.multiply(columnEdge, gate)),
          builder.multiply(constant(0.3), builder.multiply(mullion, gate)),
          builder.multiply(
            constant(xTracery * 0.55),
            xDiag
          ),
        ]),
        builder.multiply(constant(0.25), panel)
      );

      const upperHeight = sat(
        builder.divide(
          builder.subtract(t, constant(topStart)),
          constant(Math.max(EPSILON, 1 - topStart))
        )
      );
      const phi1 = builder.multiply(
        builder.divide(tau, two),
        builder.subtract(builder.multiply(constant(rows), upperHeight), x01)
      );
      const phi2 = builder.multiply(
        builder.divide(tau, two),
        builder.add(builder.multiply(constant(rows), upperHeight), x01)
      );
      const lattice = builder.add(ridgeSin(phi1), ridgeSin(phi2));
      const cell = builder.power(
        builder.multiply(
          builder.absolute(builder.sin(phi1)),
          builder.absolute(builder.sin(phi2))
        ),
        two
      );
      const motif = builder.multiply(
        constant(0.25 * diamond),
        builder.multiply(
          cell,
          builder.power(
            builder.multiply(
              builder.absolute(builder.sin(builder.multiply(tau, x01))),
              builder.absolute(builder.sin(builder.multiply(tau, upperHeight)))
            ),
            two
          )
        )
      );
      const fullBandWidth = 1.8 * bandWidth;
      const bandBase = ridge(t, fullBandWidth);
      const bandMid = ridge(builder.subtract(t, constant(topStart)), fullBandWidth);
      const bandRim = ridge(builder.subtract(t, one), fullBandWidth);
      const upper = builder.add(
        builder.multiply(
          constant(diamond),
          builder.add(
            builder.multiply(constant(0.95), lattice),
            builder.multiply(constant(0.35), motif)
          )
        ),
        builder.multiply(
          constant(bands),
          builder.add(
            builder.multiply(constant(0.85), bandMid),
            builder.multiply(constant(0.35), bandRim)
          )
        )
      );
      const pattern = addMany(builder, [
        builder.multiply(bottomMask, lower),
        builder.multiply(topMask, upper),
        builder.multiply(constant(bands * 0.25), bandBase),
      ]);
      return builder.add(baseRadius, builder.multiply(constant(relief), pattern));
    }
  );

  return Object.freeze({
    programCanonicalJson,
    seamReason:
      'integer arch count plus xAbs invariance and x01-complement symmetry make both endpoint traces identical',
    boundaryFamilies: freezeBoundaries([
      boundary(
        'gothic-bay-centres',
        'explicit-parameter-line-or-periodic-family',
        'cos(archCount*thetaMaterial/2)=0',
        'absolute-value cusp in xAbs'
      ),
      boundary(
        'gothic-top-mask-transitions',
        'explicit-parameter-line-or-periodic-family',
        'v=topStart-blendWidth or v=topStart+blendWidth',
        'smoothstep piece boundary; tangent is continuous but higher derivatives are not'
      ),
      boundary(
        'gothic-arch-support',
        'implicit-program-level-set',
        '1-power(xAbs,pointiness)=0',
        'maximum and fractional-power support boundary'
      ),
      boundary(
        'gothic-gate-transitions',
        'implicit-program-level-set',
        '(v-spring)/gateWidth in {0,1} or (archZ-v)/gateWidth in {0,1}',
        'clamp transitions in the lower-bay gate'
      ),
      boundary(
        'gothic-arch-rib-core-and-support',
        'implicit-program-level-set',
        'v-archZ in {0,-ribWidth,+ribWidth}',
        'absolute-value ridge core and compact-support joins'
      ),
      boundary(
        'gothic-column-mullion-panel-support',
        'explicit-parameter-line-or-periodic-family',
        'xAbs in {0,1-columnWidth,0.65*columnWidth,0.95}',
        'absolute-value centre and maximum support transitions'
      ),
      boundary(
        'gothic-arch-denominator-fallback',
        'implicit-program-level-set',
        'archZ-spring=epsilon',
        'maximum selects the safeguarded local-height denominator'
      ),
      boundary(
        'gothic-local-height-clamp',
        'implicit-program-level-set',
        '(v-spring)/max(epsilon,archZ-spring) in {0,1}',
        'clamp transitions in diagonal-tracery coordinates'
      ),
      boundary(
        'gothic-diagonal-ridge-core-and-support',
        'implicit-program-level-set',
        'localHeight-x01 or localHeight-(1-x01) in {0,-traceryWidth,+traceryWidth}',
        'absolute-value ridge cores and compact-support joins'
      ),
      boundary(
        'gothic-upper-height-clamp',
        'explicit-parameter-line-or-periodic-family',
        '(v-topStart)/max(epsilon,1-topStart) in {0,1}',
        'clamp transitions in upper-lattice coordinates'
      ),
      boundary(
        'gothic-lattice-ridge-core-and-support',
        'implicit-program-level-set',
        'sin(phi1) or sin(phi2) equals 0 or has absolute value latticeWidth',
        'absolute-sine ridge cores and compact-support joins'
      ),
      boundary(
        'gothic-horizontal-band-core-and-support',
        'explicit-parameter-line-or-periodic-family',
        'v-centre in {0,-1.8*bandWidth,+1.8*bandWidth}, centre in {0,topStart,1}',
        'absolute-value band cores and compact-support joins'
      ),
    ]),
  });
}

function buildWaveInterference(input: CanonicalTargetInputBinding): ProgramAndManifest {
  const featureCount = exactNormalizedStyleNumber(input, 'wiFeatureCount');
  const reliefDepth = exactNormalizedStyleNumber(input, 'wiReliefDepth');
  const contourDensity = exactNormalizedStyleNumber(input, 'wiContourDensity');
  const moireStrength = exactNormalizedStyleNumber(input, 'wiMoireStrength');
  const patternStyle = exactNormalizedStyleNumber(input, 'wiPatternStyle');
  const helixPitch = exactNormalizedStyleNumber(input, 'wiHelixPitch');
  const pitchMismatch = exactNormalizedStyleNumber(input, 'wiPitchMismatch');
  const domainWarp = exactNormalizedStyleNumber(input, 'wiDomainWarp');
  const warpScale = exactNormalizedStyleNumber(input, 'wiWarpScale');
  const ridgeContrast = exactNormalizedStyleNumber(input, 'wiRidgeContrast');
  const edgeFade = exactNormalizedStyleNumber(input, 'wiEdgeFade');
  const phaseOffset = exactNormalizedStyleNumber(input, 'wiPhase');
  const warpFrequency = Math.floor(4 + 8 * warpScale + 0.5);
  const baseFrequency = Math.floor(6 + featureCount * 30 + 0.5);
  const secondaryOffset = Math.floor(pitchMismatch * 4 + 0.5) - 2;
  const secondaryFrequency = baseFrequency + secondaryOffset;
  const detailFrequency = Math.floor(baseFrequency * 2.5 + 0.5);
  const edgeFadeActive = edgeFade > 0.01;
  const fadeZone = edgeFade * 0.3;

  const programCanonicalJson = buildRadialOuterWallProgram(
    input,
    'WaveInterference',
    {
      evaluatorId: evaluatorId('WaveInterference'),
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    ({ builder, baseRadius, thetaMaterial, t, tau, one, constant }) => {
      const zero = constant(0);
      const warp = builder.multiply(
        constant(domainWarp * 0.3),
        builder.sin(
          builder.add(
            builder.multiply(thetaMaterial, constant(warpFrequency)),
            builder.multiply(t, constant(5))
          )
        )
      );
      const warpedTheta = builder.add(thetaMaterial, warp);
      const spiralHeight = builder.multiply(t, constant(1 + helixPitch * 4));
      const phase1 = addMany(
        builder,
        [
          builder.multiply(warpedTheta, constant(baseFrequency)),
          builder.multiply(spiralHeight, tau),
          builder.multiply(constant(phaseOffset), tau),
        ]
      );
      const phase2 = addMany(
        builder,
        [
          builder.multiply(warpedTheta, constant(secondaryFrequency)),
          builder.multiply(builder.multiply(spiralHeight, tau), constant(1.1)),
          builder.multiply(constant(phaseOffset), tau),
          constant(1.7),
        ]
      );
      const wave1 = builder.sin(phase1);
      const wave2 = builder.sin(phase2);
      const linear = builder.multiply(constant(0.5), builder.add(wave1, wave2));
      const product = builder.multiply(wave1, wave2);
      const rawPattern = builder.add(
        builder.multiply(constant(1 - moireStrength), linear),
        builder.multiply(constant(moireStrength), product)
      );
      const styleModulation = builder.multiply(
        constant(patternStyle),
        builder.cos(
          builder.add(
            builder.multiply(warpedTheta, constant(3)),
            builder.multiply(t, constant(10))
          )
        )
      );
      const styledPattern = builder.add(
        rawPattern,
        builder.multiply(styleModulation, constant(0.2))
      );
      const detail = builder.multiply(
        constant(contourDensity * 0.15),
        builder.sin(
          builder.add(
            builder.multiply(warpedTheta, constant(detailFrequency)),
            builder.multiply(t, constant(20))
          )
        )
      );
      const normalized = builder.add(
        builder.add(constant(0.5), builder.multiply(constant(0.5), styledPattern)),
        detail
      );
      let ridge = builder.power(
        builder.clamp(normalized, zero, one),
        constant(0.5 + ridgeContrast * 3)
      );
      if (edgeFadeActive) {
        const distanceToEdge = builder.minimum(t, builder.subtract(one, t));
        const fade = builder.minimum(
          builder.divide(distanceToEdge, constant(Math.max(0.001, fadeZone))),
          one
        );
        ridge = builder.multiply(ridge, fade);
      }
      const displacement = builder.multiply(
        builder.subtract(ridge, constant(0.4)),
        constant(reliefDepth)
      );
      return builder.maximum(constant(0.1), builder.add(baseRadius, displacement));
    }
  );

  const boundaries: DeclaredPiecewiseBoundaryFamily[] = [
    boundary(
      'wave-normalization-clamp',
      'implicit-program-level-set',
      'normalizedPattern=0 or normalizedPattern=1',
      'clamp boundary before a parameter-dependent power; the lower trace may be non-Lipschitz when contrastExponent<1'
    ),
    boundary(
      'wave-radius-floor-contact',
      'implicit-program-level-set',
      'baseRadius+(ridge-0.4)*reliefDepth=0.1mm',
      'maximum joins the styled wall to the hard radius floor'
    ),
  ];
  if (edgeFadeActive) {
    boundaries.push(
      boundary(
        'wave-edge-fade-joins',
        'explicit-parameter-line-or-periodic-family',
        'v=fadeZone or v=1-fadeZone',
        'minimum joins the linear edge ramp to the unit interior factor'
      )
    );
  }
  return Object.freeze({
    programCanonicalJson,
    seamReason:
      `rounded integral angular frequencies warp=${warpFrequency}, base=${baseFrequency}, secondary=${secondaryFrequency}, detail=${detailFrequency}, style=3`,
    boundaryFamilies: freezeBoundaries(boundaries),
  });
}

function buildCrystalline(input: CanonicalTargetInputBinding): ProgramAndManifest {
  const facetCount = Math.max(exactNormalizedStyleNumber(input, 'crFacetCount'), 1);
  const facetDepth = exactNormalizedStyleNumber(input, 'crFacetDepth');
  const subFacets = Math.max(exactNormalizedStyleNumber(input, 'crSubFacets'), 1);
  const edgeSharpness = Math.max(
    0.1,
    Math.min(exactNormalizedStyleNumber(input, 'crEdgeSharpness'), 10)
  );
  const asymmetry = exactNormalizedStyleNumber(input, 'crAsymmetry');
  const heightPhase = exactNormalizedStyleNumber(input, 'crHeightPhase');
  if (!Number.isInteger(facetCount) || !Number.isInteger(subFacets)) {
    fail('Crystalline facet and sub-facet counts must be integral');
  }

  const programCanonicalJson = buildRadialOuterWallProgram(
    input,
    'Crystalline',
    {
      evaluatorId: evaluatorId('Crystalline'),
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    ({ builder, baseRadius, thetaMaterial, t, tau, one, constant }) => {
      // Fractional-cycle coordinates are emitted as affine expressions of
      // the unit parameters DIRECTLY — facetCount*u + heightPhase*t — with
      // the tau factor cancelled symbolically at authoring time (theta =
      // tau*u, phase = heightPhase*t*tau/facetCount, so (theta+phase)*
      // facetCount/tau = facetCount*u + heightPhase*t exactly). The real
      // semantics are unchanged; the affine argument lets the certification
      // kernels band-resolve every wrap against exact rational stations
      // instead of hulling jump-adjacent cells (U3b).
      const materialU = builder.u();
      const facetCycles = builder.add(
        builder.multiply(materialU, constant(facetCount)),
        builder.multiply(t, constant(heightPhase))
      );
      const facetFraction = builder.fractionalPart(facetCycles);
      const facetPhase = builder.multiply(facetFraction, tau);
      const triangleWave = builder.absolute(
        builder.subtract(
          builder.multiply(builder.divide(facetPhase, tau), constant(2)),
          one
        )
      );
      const facetShape = builder.power(
        builder.maximum(triangleWave, constant(0.001)),
        constant(edgeSharpness)
      );
      const subFraction = builder.fractionalPart(
        builder.add(
          builder.multiply(
            builder.multiply(materialU, constant(facetCount)),
            constant(subFacets)
          ),
          builder.multiply(
            builder.multiply(t, constant(heightPhase)),
            constant(subFacets)
          )
        )
      );
      const subPhase = builder.multiply(subFraction, tau);
      const subShape = builder.multiply(
        builder.power(
          builder.maximum(
            builder.absolute(builder.sin(builder.multiply(subPhase, constant(0.5)))),
            constant(0.001)
          ),
          constant(edgeSharpness * 0.5)
        ),
        constant(0.3)
      );
      const asymmetryVariation = builder.multiply(
        builder.sin(
          builder.add(
            builder.multiply(thetaMaterial, constant(17)),
            builder.multiply(t, constant(23))
          )
        ),
        constant(asymmetry)
      );
      const modulation = builder.add(
        builder.subtract(
          builder.subtract(
            one,
            builder.multiply(constant(facetDepth), facetShape)
          ),
          builder.multiply(
            builder.multiply(constant(facetDepth), constant(0.3)),
            subShape
          )
        ),
        asymmetryVariation
      );
      return builder.multiply(
        baseRadius,
        builder.clamp(modulation, constant(0.5), constant(2))
      );
    }
  );

  return Object.freeze({
    programCanonicalJson,
    seamReason:
      `integral primary=${facetCount}, sub=${subFacets}, and asymmetry=17 angular cycles make every endpoint trace identical`,
    boundaryFamilies: freezeBoundaries([
      boundary(
        'crystalline-primary-facet-wraps',
        'explicit-parameter-line-or-periodic-family',
        'fractionalPart(facetCount*u+heightPhase*v)=0',
        'triangle-wave derivative reverses at each primary facet boundary'
      ),
      boundary(
        'crystalline-primary-facet-floor',
        'explicit-parameter-line-or-periodic-family',
        'abs(2*primaryFraction-1)=0.001',
        'maximum joins the facet centre plateau to the powered triangle wave'
      ),
      boundary(
        'crystalline-subfacet-wraps',
        'explicit-parameter-line-or-periodic-family',
        'fractionalPart(facetCount*subFacets*u+heightPhase*subFacets*v)=0',
        'absolute half-sine has a periodic cusp at each sub-facet boundary'
      ),
      boundary(
        'crystalline-subfacet-floor',
        'explicit-parameter-line-or-periodic-family',
        'abs(sin(pi*subFraction))=0.001',
        'maximum joins the sub-facet floor to its powered half-sine'
      ),
      boundary(
        'crystalline-modulation-clamp',
        'implicit-program-level-set',
        'modulation=0.5 or modulation=2',
        'clamp joins the faceted target to a scaled base-radius branch'
      ),
    ]),
  });
}

function buildGyroidManifold(input: CanonicalTargetInputBinding): ProgramAndManifest {
  const scale = exactNormalizedStyleNumber(input, 'gmScale');
  const thickness = exactNormalizedStyleNumber(input, 'gmThickness');
  const morph = exactNormalizedStyleNumber(input, 'gmMorph');
  const relief = exactNormalizedStyleNumber(input, 'gmRelief');
  const zStretch = exactNormalizedStyleNumber(input, 'gmZStretch');
  const smoothValue = Math.max(0.001, exactNormalizedStyleNumber(input, 'gmSharpness'));
  const bias = exactNormalizedStyleNumber(input, 'gmBias');
  const curve = exactNormalizedStyleNumber(input, 'gmCurve');
  const pulse = exactNormalizedStyleNumber(input, 'gmPulse');
  const edgeFade = Math.min(exactNormalizedStyleNumber(input, 'gmEdgeFade'), 0.49);
  const threshold = thickness * 1.5;
  const denominator = smoothValue * threshold;
  if (!(denominator > 1e-12) || !(curve > 0)) {
    fail('Gyroid normalized thickness, smoothness, and curve are outside the static author domain');
  }

  const programCanonicalJson = buildRadialOuterWallProgram(
    input,
    'GyroidManifold',
    {
      evaluatorId: evaluatorId('GyroidManifold'),
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    ({ builder, baseRadius, thetaMaterial, t, tau, one, constant }) => {
      const x = builder.multiply(constant(scale), builder.cos(thetaMaterial));
      const y = builder.multiply(constant(scale), builder.sin(thetaMaterial));
      const zTpms = builder.add(
        builder.multiply(
          builder.multiply(
            builder.multiply(constant(scale), t),
            constant(zStretch)
          ),
          constant(4)
        ),
        builder.multiply(constant(pulse), tau)
      );
      const sinX = builder.sin(x);
      const cosX = builder.cos(x);
      const sinY = builder.sin(y);
      const cosY = builder.cos(y);
      const sinZ = builder.sin(zTpms);
      const cosZ = builder.cos(zTpms);
      const gyroid = addMany(builder, [
        builder.multiply(sinX, cosY),
        builder.multiply(sinY, cosZ),
        builder.multiply(sinZ, cosX),
      ]);
      const schwarz = addMany(builder, [cosX, cosY, cosZ]);
      const value = builder.add(
        builder.add(
          builder.multiply(constant(1 - morph), gyroid),
          builder.multiply(constant(morph), schwarz)
        ),
        constant(bias)
      );
      const normalizedDistance = builder.clamp(
        builder.divide(
          builder.subtract(constant(threshold), builder.absolute(value)),
          constant(denominator)
        ),
        constant(0),
        one
      );
      const shapeRaw = builder.multiply(
        builder.square(normalizedDistance),
        builder.subtract(constant(3), builder.multiply(constant(2), normalizedDistance))
      );
      const shape = builder.power(shapeRaw, constant(curve));
      let fade = one;
      if (edgeFade > 0) {
        const bottomCoordinate = builder.clamp(
          builder.divide(t, constant(edgeFade)),
          constant(0),
          one
        );
        const bottomFade = builder.multiply(
          builder.square(bottomCoordinate),
          builder.subtract(constant(3), builder.multiply(constant(2), bottomCoordinate))
        );
        const topCoordinate = builder.clamp(
          builder.divide(
            builder.subtract(t, constant(1 - edgeFade)),
            constant(edgeFade)
          ),
          constant(0),
          one
        );
        const topFade = builder.subtract(
          one,
          builder.multiply(
            builder.square(topCoordinate),
            builder.subtract(constant(3), builder.multiply(constant(2), topCoordinate))
          )
        );
        fade = builder.multiply(bottomFade, topFade);
      }
      return builder.add(
        baseRadius,
        builder.multiply(
          constant(relief),
          builder.multiply(shape, fade)
        )
      );
    }
  );

  const boundaries: DeclaredPiecewiseBoundaryFamily[] = [
    boundary(
      'gyroid-relief-band-transitions',
      'implicit-program-level-set',
      `abs(blendedTpms+bias)=${threshold} or abs(blendedTpms+bias)=${threshold - denominator}`,
      'clamp enters or leaves the compact TPMS relief band; smoothstep is first-derivative continuous but power(curve) can reduce regularity at zero'
    ),
  ];
  if (edgeFade > 0) {
    boundaries.push(
      boundary(
        'gyroid-edge-fade-transitions',
        'explicit-parameter-line-or-periodic-family',
        `v=${edgeFade} or v=${1 - edgeFade}`,
        'bottom and top smoothstep factors reach their unit branches'
      )
    );
  }
  return Object.freeze({
    programCanonicalJson,
    seamReason:
      'thetaMaterial enters the TPMS domain only through cos(thetaMaterial) and sin(thetaMaterial), so arbitrary scale remains periodic',
    boundaryFamilies: freezeBoundaries(boundaries),
  });
}

function buildRippleInterference(input: CanonicalTargetInputBinding): ProgramAndManifest {
  const sourceCount = Math.max(
    Math.floor(exactNormalizedStyleNumber(input, 'riSourceCount') + 0.5),
    2
  );
  const waveFrequency = Math.floor(
    exactNormalizedStyleNumber(input, 'riWaveFrequency') + 0.5
  );
  const reliefDepth = exactNormalizedStyleNumber(input, 'riReliefDepth');
  const phase = exactNormalizedStyleNumber(input, 'riPhase');
  const sourceHeight = exactNormalizedStyleNumber(input, 'riSourceHeight');
  const decay = exactNormalizedStyleNumber(input, 'riDecay');
  const interferenceMode = exactNormalizedStyleNumber(input, 'riInterferenceMode');
  const rotation = exactNormalizedStyleNumber(input, 'riRotation');
  if (sourceCount > 8 || !Number.isInteger(waveFrequency)) {
    fail('RippleInterference source count or wave frequency is outside the static author domain');
  }

  const programCanonicalJson = buildRadialOuterWallProgram(
    input,
    'RippleInterference',
    {
      evaluatorId: evaluatorId('RippleInterference'),
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    ({ builder, baseRadius, t, tau, one, constant }) => {
      const localU = builder.u();
      const waves = [] as TargetExpressionReference[];
      for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex += 1) {
        const angleFraction = sourceIndex / sourceCount + rotation;
        const sourceU = angleFraction - Math.floor(angleFraction);
        const wrappedDifference = builder.subtract(
          builder.fractionalPart(
            builder.add(
              builder.subtract(localU, constant(sourceU)),
              constant(0.5)
            )
          ),
          constant(0.5)
        );
        const verticalDifference = builder.subtract(t, constant(sourceHeight));
        const distance = builder.length2(wrappedDifference, verticalDifference);
        const amplitudeDecay = builder.divide(
          one,
          builder.maximum(
            builder.add(
              one,
              builder.multiply(
                builder.multiply(distance, constant(decay)),
                constant(5)
              )
            ),
            constant(0.1)
          )
        );
        const wavePhase = builder.add(
          builder.multiply(
            builder.multiply(distance, constant(waveFrequency)),
            tau
          ),
          builder.multiply(constant(phase), tau)
        );
        waves.push(builder.multiply(builder.sin(wavePhase), amplitudeDecay));
      }
      let totalWave = builder.divide(
        addMany(builder, waves),
        constant(sourceCount)
      );
      if (interferenceMode > 0.5) {
        const normalized = builder.add(
          constant(0.5),
          builder.multiply(constant(0.5), totalWave)
        );
        totalWave = builder.subtract(
          builder.multiply(constant(2), builder.power(normalized, constant(2))),
          one
        );
      }
      return builder.maximum(
        constant(0.1),
        builder.add(baseRadius, builder.multiply(totalWave, constant(reliefDepth)))
      );
    }
  );

  return Object.freeze({
    programCanonicalJson,
    seamReason:
      `all ${sourceCount} source distances use a periodic nearest-image u coordinate before radial evaluation`,
    boundaryFamilies: freezeBoundaries([
      boundary(
        'ripple-source-antipodes',
        'explicit-parameter-line-or-periodic-family',
        'materialU-sourceU is congruent to 0.5 modulo 1 for any active source',
        'nearest-image coordinate changes sign; squared distance remains continuous but its derivative can crease'
      ),
      boundary(
        'ripple-source-centres',
        'implicit-program-level-set',
        'wrapped(materialU-sourceU)=0 and v=sourceHeight for any active source',
        'Euclidean norm is nondifferentiable at zero and the radial wave need not cancel its first derivative'
      ),
      boundary(
        'ripple-radius-floor-contact',
        'implicit-program-level-set',
        'baseRadius+totalWave*reliefDepth=0.1mm',
        'maximum joins the interference target to the hard radius floor'
      ),
    ]),
  });
}

function buildGeometricStar(input: CanonicalTargetInputBinding): ProgramAndManifest {
  const pointCount = Math.max(4, exactNormalizedStyleNumber(input, 'gsPoints'));
  const gap = exactNormalizedStyleNumber(input, 'gsGap');
  const detail = exactNormalizedStyleNumber(input, 'gsDetail');
  const layers = exactNormalizedStyleNumber(input, 'gsLayers');
  const interlace = exactNormalizedStyleNumber(input, 'gsInterlace');
  const relief = exactNormalizedStyleNumber(input, 'gsRelief');
  const smoothingRadius = exactNormalizedStyleNumber(input, 'gsRoundness') * 0.2;
  const zoom = exactNormalizedStyleNumber(input, 'gsZoom');
  const shift = exactNormalizedStyleNumber(input, 'gsShift');
  if (!Number.isInteger(pointCount)) {
    fail('GeometricStar point count must be integral');
  }

  const programCanonicalJson = buildRadialOuterWallProgram(
    input,
    'GeometricStar',
    {
      evaluatorId: evaluatorId('GeometricStar'),
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    ({ builder, baseRadius, t, tau, one, constant }) => {
      const two = constant(2);
      const pi = builder.divide(tau, two);
      const verticalRaw = builder.multiply(
        builder.multiply(t, constant(layers)),
        constant(zoom)
      );
      const row = builder.floor(verticalRaw);
      const verticalLocal = builder.multiply(
        builder.subtract(
          builder.subtract(verticalRaw, row),
          constant(0.5)
        ),
        two
      );
      // Sector cycles are emitted as affine expressions of the unit angular
      // parameter DIRECTLY — pointCount*u plus the row-coupled offset in
      // CYCLE units — with tau cancelled symbolically at authoring time:
      // theta = tau*u, sectorAngle = tau/pointCount and rowOffset =
      // rowParity*(pi/pointCount)*shift*2, so (theta + rowOffset)/sectorAngle
      // = pointCount*u + rowParity*shift exactly (2*pi/tau = 1). Real
      // semantics are unchanged; at shift = 0 the row-coupled term is
      // constant-folded away HERE so the sector floor argument is
      // compiler-provably point-affine and every sector wrap band-resolves
      // against exact rational stations (U3b). At shift != 0 the term chains
      // through the row floor, is not affine, and the kernels keep the sound
      // hull — the same fail-closed refusal as before this re-emission.
      const materialU = builder.u();
      const sectorCyclesAffine = builder.multiply(materialU, constant(pointCount));
      const sectorCycles = shift === 0
        ? sectorCyclesAffine
        : builder.add(
            sectorCyclesAffine,
            builder.multiply(
              builder.multiply(
                builder.fractionalPart(builder.divide(row, two)),
                two
              ),
              constant(shift)
            )
          );
      const sectorAngle = builder.divide(tau, constant(pointCount));
      const sector = builder.floor(sectorCycles);
      const localAngle = builder.multiply(
        builder.subtract(
          builder.subtract(sectorCycles, sector),
          constant(0.5)
        ),
        sectorAngle
      );
      const foldedX = builder.absolute(
        builder.multiply(localAngle, constant(pointCount / 4))
      );
      const starAngle = builder.multiply(
        constant(0.2 + 0.6 * detail),
        builder.divide(pi, two)
      );
      const starNormalX = builder.sin(starAngle);
      const starNormalY = builder.cos(starAngle);
      const lineDistance = builder.add(
        builder.multiply(foldedX, starNormalX),
        builder.multiply(verticalLocal, starNormalY)
      );
      const strapDistance = builder.subtract(builder.absolute(lineDistance), constant(gap));
      const strapCoordinate = builder.clamp(
        builder.divide(strapDistance, constant(0.02 + smoothingRadius)),
        constant(0),
        one
      );
      const shape = builder.subtract(
        one,
        builder.multiply(
          builder.square(strapCoordinate),
          builder.subtract(constant(3), builder.multiply(two, strapCoordinate))
        )
      );
      const distanceAlong = builder.subtract(
        builder.multiply(foldedX, starNormalY),
        builder.multiply(verticalLocal, starNormalX)
      );
      const weave = builder.cos(
        builder.multiply(
          builder.multiply(distanceAlong, constant(10)),
          constant(zoom)
        )
      );
      const modulatedShape = builder.multiply(
        shape,
        builder.add(
          one,
          builder.multiply(
            builder.multiply(weave, constant(interlace)),
            constant(0.2)
          )
        )
      );
      const verticalFade = builder.subtract(
        one,
        builder.power(builder.absolute(verticalLocal), constant(4))
      );
      return builder.add(
        baseRadius,
        builder.multiply(
          builder.multiply(modulatedShape, constant(relief)),
          verticalFade
        )
      );
    }
  );

  return Object.freeze({
    programCanonicalJson,
    seamReason:
      `integral point count ${pointCount} and sector folding make every angular endpoint trace identical`,
    boundaryFamilies: freezeBoundaries([
      boundary(
        'star-vertical-row-boundaries',
        'explicit-parameter-line-or-periodic-family',
        'v*layers*zoom is an integer',
        'row parity and local coordinate reset, while the fourth-power vertical fade forces positional continuity but not derivative continuity'
      ),
      boundary(
        'star-angular-sector-boundaries-and-folds',
        'explicit-parameter-line-or-periodic-family',
        'pointCount*u+rowParity*shift is an integer or half-integer',
        'sector cycles wrap and folded local angle changes derivative'
      ),
      boundary(
        'star-line-absolute-zero',
        'implicit-program-level-set',
        'foldedX*sin(starAngle)+verticalLocal*cos(starAngle)=0',
        'absolute line distance changes branch'
      ),
      boundary(
        'star-strap-smoothstep-transitions',
        'implicit-program-level-set',
        'strapDistance=0 or strapDistance=0.02+smoothingRadius',
        'clamped cubic strap profile enters or leaves its support'
      ),
    ]),
  });
}

function buildProgramAndManifest(input: CanonicalTargetInputBinding): ProgramAndManifest {
  canonicalTargetInputForProof(input);
  if (!supportedStyles.has(input.style.styleId)) {
    fail(`style '${input.style.styleId}' is not supported by this target set`);
  }
  switch (input.style.styleId) {
    case 'GothicArches': return buildGothicArches(input);
    case 'WaveInterference': return buildWaveInterference(input);
    case 'Crystalline': return buildCrystalline(input);
    case 'GyroidManifold': return buildGyroidManifold(input);
    case 'RippleInterference': return buildRippleInterference(input);
    case 'GeometricStar': return buildGeometricStar(input);
    default: return fail(`style '${input.style.styleId}' has no static author`);
  }
}

function boundaryManifestValue(
  styleId: GeneratedContinuousFeatureStyleId,
  boundaryFamilies: readonly DeclaredPiecewiseBoundaryFamily[]
): CanonicalJsonValue {
  return {
    declarationSemantics:
      'candidate complete program-level piecewise-boundary declaration requiring independent root isolation and completeness verification',
    families: boundaryFamilies.map((family) => ({
      boundaryClass: family.boundaryClass,
      exactCondition: family.exactCondition,
      id: family.id,
      regularityReason: family.regularityReason,
      requiredHandling: family.requiredHandling,
    })),
    styleId,
  };
}

function derive(
  input: CanonicalTargetInputBinding
): GeneratedContinuousFeatureStyleOuterWallTargetBinding {
  const proof = canonicalTargetInputForProof(input);
  const styleId = input.style.styleId as GeneratedContinuousFeatureStyleId;
  const built = buildProgramAndManifest(input);
  const backends = compileGeneratedTargetProgramBackends(built.programCanonicalJson);
  const seamProofSha256 = sha256Utf8(
    [styleId, backends.programSha256, built.seamReason].join('\n')
  );
  const manifestValue = boundaryManifestValue(styleId, built.boundaryFamilies);
  const boundaryManifestCanonicalJson = canonicalizeCertificationJson(manifestValue);
  const boundaryManifestSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.generated-continuous-feature-style-outer-wall-target/boundary-manifest/v4',
    manifestValue
  );
  const bindingValue = {
    backendSha256: backends.backendSha256,
    boundaryFamilyCount: built.boundaryFamilies.length.toString(),
    boundaryManifestSha256,
    canonicalInputSha256: proof.canonicalInputSha256,
    continuitySemantics: 'continuous-piecewise-defined-target',
    implementationScope: GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_SCOPE,
    nodeCount: backends.nodeCount.toString(),
    patchId: 'outer-wall',
    periodicIdentificationAdmissible: true,
    programSha256: backends.programSha256,
    proofMethodSha256: GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    schemaVersion: GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_VERSION,
    seamProofSha256,
    seamSemantics: 'periodic-identification-symbolically-admissible',
    styleId,
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.generated-continuous-feature-style-outer-wall-target/binding/v4',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_VERSION,
    implementationScope: GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: GENERATED_CONTINUOUS_FEATURE_STYLE_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: proof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    patchId: 'outer-wall',
    styleId,
    continuitySemantics: 'continuous-piecewise-defined-target',
    seamSemantics: 'periodic-identification-symbolically-admissible',
    periodicIdentificationAdmissible: true,
    seamProofSha256,
    boundaryManifestCanonicalJson,
    boundaryManifestSha256,
    boundaryFamilyCount: built.boundaryFamilies.length,
    boundaryFamilies: built.boundaryFamilies,
    programCanonicalJson: built.programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  }) as GeneratedContinuousFeatureStyleOuterWallTargetBinding;
}

export function createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): GeneratedContinuousFeatureStyleOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function generatedContinuousFeatureStyleOuterWallTargetForProof(
  value: GeneratedContinuousFeatureStyleOuterWallTargetBinding
): GeneratedContinuousFeatureStyleOuterWallTargetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('binding is not an authenticated capability');
  }
  const registered = registry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('binding is not an authenticated capability');
  }
  generatedTargetProgramBackendsForProof(value.backends);
  const derived = derive(registered.input);
  if (
    value.schemaVersion !== derived.schemaVersion ||
    value.implementationScope !== derived.implementationScope ||
    value.proofMethodSha256 !== derived.proofMethodSha256 ||
    value.bindingSha256 !== derived.bindingSha256 ||
    value.bindingCanonicalJson !== derived.bindingCanonicalJson ||
    value.canonicalInputSha256 !== derived.canonicalInputSha256 ||
    value.radialSemanticsSha256 !== derived.radialSemanticsSha256 ||
    value.patchId !== derived.patchId ||
    value.styleId !== derived.styleId ||
    value.continuitySemantics !== derived.continuitySemantics ||
    value.seamSemantics !== derived.seamSemantics ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.seamProofSha256 !== derived.seamProofSha256 ||
    value.boundaryManifestCanonicalJson !== derived.boundaryManifestCanonicalJson ||
    value.boundaryManifestSha256 !== derived.boundaryManifestSha256 ||
    value.boundaryFamilyCount !== derived.boundaryFamilyCount ||
    value.boundaryFamilies !== registered.binding.boundaryFamilies ||
    value.programCanonicalJson !== derived.programCanonicalJson ||
    value.programSha256 !== derived.programSha256 ||
    value.nodeCount !== derived.nodeCount ||
    value.backends.programSha256 !== derived.backends.programSha256 ||
    value.backends.backendSha256 !== derived.backends.backendSha256
  ) {
    fail('binding capability fields are inconsistent');
  }
  return value;
}
