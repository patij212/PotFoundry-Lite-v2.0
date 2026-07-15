import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
} from '../geometry/targetSolid/canonicalCertificationJson';
import { STYLE_PARAMETER_LAYOUT_SPEC_SHA256 } from './styleParameterLayoutSpec';

export const STYLE_EVALUATOR_SOURCE_CONTRACT_VERSION =
  'potfoundry.style-evaluator-source-contract/v1' as const;

export const STYLE_EVALUATOR_SOURCE_SHA256 = Object.freeze({
  adaptiveMeshWgsl: '2c5988f2e87a5e6b934302b729aa815eed89917e12c08c6e9e1d3e1397d77fa4',
  cpuProfile: 'a9312d6d3db82f8eb8fd5b9d799f472de09446bf79961dd603364ae75dad9710',
  cpuStyles: '7a66a1ae87fd7df84f9b9f876fa7af528f34ed919b5aa71295500c1939b17a38',
  gpuSurfaceEvaluator: 'b4da50c8d4ff3d4a4bf1871569a8009d81c57bb896aecf3fdb5f816077893241',
  gpuStylesWgsl: '79af3d83d9c35adeae11f333e7b421716fd6339c6d7f9fe3ca034d48f8c8962c',
  styleParameterPacker: '010add07998f07b312a54a95e83dde3aa4caa45745d86fc06caf2cd74a984fab',
});

const sourceContract = {
  hashSemantics: 'sha256-of-exact-utf8-source-bytes',
  parameterLayoutSpecSha256: STYLE_PARAMETER_LAYOUT_SPEC_SHA256,
  schemaVersion: STYLE_EVALUATOR_SOURCE_CONTRACT_VERSION,
  sources: STYLE_EVALUATOR_SOURCE_SHA256,
} as const;

/** Source identity only. It deliberately does not assert semantic parity. */
export const STYLE_EVALUATOR_SOURCE_CONTRACT_CANONICAL_JSON =
  canonicalizeCertificationJson(sourceContract);
export const STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256 = domainSeparatedCanonicalJsonSha256(
  'potfoundry.style-evaluator-source-contract/definition/v1',
  sourceContract
);

