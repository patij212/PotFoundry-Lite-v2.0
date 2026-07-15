import { describe, expect, it } from 'vitest';

import { canonicalizeCertificationJson } from './canonicalCertificationJson';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';
import {
  compileGeneratedTargetProgramBackends,
  compileValidatedResidualProgram,
  computeValidatedResidualProgramSha256,
  generatedTargetProgramBackendsForProof,
  type GeneratedTargetProgramBackends,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
  VALIDATED_RESIDUAL_PROGRAM_VERSION,
} from './validatedResidualProgram';
import { sha256Utf8 } from './incrementalSha256';

function program(zValue = '0'): string {
  return canonicalizeCertificationJson({
    evaluatorId: 'validated-program-test',
    evaluatorVersion: 'v1',
    patchId: 'outer-wall',
    schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
    target: {
      x: { op: 'u' },
      y: { op: 'v' },
      z: { op: 'constant', value: zValue },
    },
  });
}

describe('validated residual expression program', () => {
  it('compiles strict number-free IR and binds every executable node to one hash', () => {
    const source = program('0.009');
    const compiled = compileValidatedResidualProgram(source);

    expect(compiled.programSha256).toBe(computeValidatedResidualProgramSha256(source));
    expect(compiled.programSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(compiled.nodeCount).toBe(3);
    expect(VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(compiled)).toBe(true);
  });

  it('changes identity when one exact residual constant changes', () => {
    expect(computeValidatedResidualProgramSha256(program('0.009'))).not.toBe(
      computeValidatedResidualProgramSha256(program('0.009000000000000001'))
    );
  });

  it('generates authenticated Float64, Float32-reference, and WGSL backends from the same IR', () => {
    const source = program('0.009');
    const generated = compileGeneratedTargetProgramBackends(source);
    expect(generated.programSha256).toBe(computeValidatedResidualProgramSha256(source));
    expect(generated.evaluateFloat64(0.25, 0.75)).toEqual([0.25, 0.75, 0.009]);
    expect(generated.evaluateFloat32Reference(0.25, 0.75)).toEqual([
      Math.fround(0.25),
      Math.fround(0.75),
      Math.fround(0.009),
    ]);
    expect(generated.wgslSource).toContain(
      `fn ${generated.wgslFunctionName}(u: f32, v: f32) -> vec3<f32>`
    );
    expect(generated.wgslSource).toContain('let n2: f32 = 0.008999999612569809;');
    expect(generated.wgslSourceSha256).toBe(sha256Utf8(generated.wgslSource));
    expect(generated.backendSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.implementationScope).toContain('no-device-conformance-proof');
    expect(Object.isFrozen(generated)).toBe(true);
    expect(generatedTargetProgramBackendsForProof(generated)).toBe(generated);

    const copy = Object.freeze({ ...generated }) as GeneratedTargetProgramBackends;
    expect(() => generatedTargetProgramBackendsForProof(copy)).toThrow(
      /authenticated capability/i
    );
    expect(() => generated.evaluateFloat64(-Number.MIN_VALUE, 0)).toThrow(
      /closed unit interval/i
    );
    expect(() => generated.evaluateFloat32Reference(0, Number.NaN)).toThrow(
      /closed unit interval/i
    );
  });

  it('executes nontrivial shared SSA operations and refuses nonfinite f32 constants', () => {
    const complex = canonicalizeCertificationJson({
      evaluatorId: 'generated-operation-test',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
      schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      target: {
        x: {
          left: { arg: { op: 'u' }, op: 'sin' },
          op: 'add',
          right: { arg: { op: 'v' }, op: 'cos' },
        },
        y: {
          left: {
            left: {
              left: { arg: { left: { op: 'u' }, op: 'subtract', right: { op: 'constant', value: '0.5' } }, op: 'absolute' },
              op: 'power',
              right: { op: 'constant', value: '2' },
            },
            op: 'maximum',
            right: { op: 'constant', value: '0' },
          },
          op: 'minimum',
          right: { op: 'constant', value: '1' },
        },
        z: {
          left: { arg: { arg: { left: { op: 'v' }, op: 'add', right: { op: 'constant', value: '1' } }, op: 'ln' }, op: 'exp' },
          op: 'divide',
          right: { arg: { left: { arg: { op: 'u' }, op: 'square' }, op: 'add', right: { op: 'constant', value: '1' } }, op: 'sqrt' },
        },
      },
    });
    const generated = compileGeneratedTargetProgramBackends(complex);
    const [x, y, z] = generated.evaluateFloat64(0.25, 0.5);
    expect(x).toBeCloseTo(Math.sin(0.25) + Math.cos(0.5), 14);
    expect(y).toBeCloseTo(0.0625, 14);
    expect(z).toBeCloseTo(1.5 / Math.sqrt(1.0625), 14);
    expect(generated.evaluateFloat32Reference(0.25, 0.5).every(Number.isFinite)).toBe(true);
    expect(generated.wgslSource).toContain('pow(');
    expect(generated.wgslSource).toContain('log(');

    expect(() => compileGeneratedTargetProgramBackends(program('1e100'))).toThrow(
      /finite f32 WGSL envelope/i
    );
  });

  it('generates the pinned WGSL discontinuous scalar built-ins with matching CPU semantics', () => {
    const scalarBuiltins = canonicalizeCertificationJson({
      evaluatorId: 'generated-scalar-builtins-test',
      evaluatorVersion: 'v1',
      patchId: 'feature-closure',
      schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      target: {
        x: {
          left: { arg: { op: 'constant', value: '-1.2' }, op: 'floor' },
          op: 'add',
          right: { arg: { op: 'constant', value: '2.2' }, op: 'ceiling' },
        },
        y: {
          left: { arg: { op: 'constant', value: '2.5' }, op: 'round' },
          op: 'add',
          right: { arg: { op: 'constant', value: '-0.25' }, op: 'fractional-part' },
        },
        z: {
          left: { arg: { op: 'constant', value: '-2' }, op: 'sign' },
          op: 'add',
          right: {
            left: { op: 'constant', value: '0.5' },
            op: 'step',
            right: { op: 'v' },
          },
        },
      },
    });
    const generated = compileGeneratedTargetProgramBackends(scalarBuiltins);

    expect(generated.evaluateFloat64(0, 0.5)).toEqual([1, 2.75, 0]);
    expect(generated.evaluateFloat32Reference(0, 0.5)).toEqual([1, 2.75, 0]);
    expect(generated.wgslSource).toContain('floor(');
    expect(generated.wgslSource).toContain('ceil(');
    expect(generated.wgslSource).toContain('round(');
    expect(generated.wgslSource).toContain('fract(');
    expect(generated.wgslSource).toContain('sign(');
    expect(generated.wgslSource).toContain('step(');
  });

  it.each([
    ['noncanonical JSON', '{"schemaVersion":"wrong", "target":{}}'],
    [
      'unknown operation',
      canonicalizeCertificationJson({
        evaluatorId: 'validated-program-test',
        evaluatorVersion: 'v1',
        patchId: 'outer-wall',
        target: {
          x: { op: 'execute-javascript' },
          y: { op: 'constant', value: '0' },
          z: { op: 'constant', value: '0' },
        },
        schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      }),
    ],
    [
      'invalid decimal',
      canonicalizeCertificationJson({
        evaluatorId: 'validated-program-test',
        evaluatorVersion: 'v1',
        patchId: 'outer-wall',
        target: {
          x: { op: 'constant', value: 'NaN' },
          y: { op: 'constant', value: '0' },
          z: { op: 'constant', value: '0' },
        },
        schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      }),
    ],
    [
      'artifact-coordinate leaf',
      canonicalizeCertificationJson({
        evaluatorId: 'validated-program-test',
        evaluatorVersion: 'v1',
        patchId: 'outer-wall',
        target: {
          x: { op: 'artifact-x' },
          y: { op: 'constant', value: '0' },
          z: { op: 'constant', value: '0' },
        },
        schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
      }),
    ],
  ])('refuses %s', (_label, source) => {
    expect(() => compileValidatedResidualProgram(source)).toThrow(/program refused/i);
  });

  it('does not expose an arbitrary callback or closure-state registration path', () => {
    const targetSha256 = sha256Utf8('validated program target');
    let callbackInvoked = false;
    expect(() =>
      compileValidatedResidualEvaluator({
        targetSha256,
        programCanonicalJson: program(),
        callback: () => {
          callbackInvoked = true;
        },
      } as unknown as Parameters<typeof compileValidatedResidualEvaluator>[0])
    ).toThrow(/unknown or missing fields/i);
    expect(callbackInvoked).toBe(false);
  });

  it('refuses the exponent-flush program that previously hid a 0.1 mm residual', () => {
    const zero = { op: 'constant', value: '0' };
    const attack = canonicalizeCertificationJson({
      evaluatorId: 'underflow-attack-regression',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
      target: {
        x: zero,
        y: zero,
        z: {
          left: { op: 'constant', value: '1e-100001' },
          op: 'multiply',
          right: { op: 'constant', value: '1e100000' },
        },
      },
      schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
    });

    expect(() =>
      compileValidatedResidualEvaluator({
        targetSha256: sha256Utf8('underflow attack target'),
        programCanonicalJson: attack,
      })
    ).toThrow(/adjusted exponent/i);
  });

  it('refuses accessor compilation inputs without invoking the accessor', () => {
    let invoked = false;
    const input = { targetSha256: sha256Utf8('target') };
    Object.defineProperty(input, 'programCanonicalJson', {
      enumerable: true,
      get() {
        invoked = true;
        return program();
      },
    });
    expect(() =>
      compileValidatedResidualEvaluator(
        input as unknown as Parameters<typeof compileValidatedResidualEvaluator>[0]
      )
    ).toThrow(/data properties/i);
    expect(invoked).toBe(false);
  });
});
