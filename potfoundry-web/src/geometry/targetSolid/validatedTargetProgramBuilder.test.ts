import { describe, expect, it } from 'vitest';

import { compileGeneratedTargetProgramBackends } from './validatedResidualProgram';
import { ValidatedTargetProgramBuilder } from './validatedTargetProgramBuilder';
import { integerPcg2dUnitHash } from './integerPcg2dHash';

function metadata() {
  return {
    evaluatorId: 'ssa-builder-test',
    evaluatorVersion: 'v1',
    patchId: 'outer-wall',
  } as const;
}

describe('validated target SSA program builder', () => {
  it('emits shallow number-free SSA and common-subexpression eliminates exact repeats', () => {
    const builder = new ValidatedTargetProgramBuilder();
    const u = builder.u();
    const v = builder.v();
    const sum = builder.add(u, v);
    expect(builder.add(u, v)).toBe(sum);
    const source = builder.buildCanonicalProgram(metadata(), { x: sum, y: sum, z: v });
    const parsed = JSON.parse(source) as {
      nodes: readonly unknown[];
      target: { x: string; y: string; z: string };
    };

    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.target).toEqual({ x: '2', y: '2', z: '1' });
    expect(source).not.toMatch(/:\s*-?\d+(?:[.,}\]])/);
    expect(compileGeneratedTargetProgramBackends(source).evaluateFloat64(0.25, 0.5)).toEqual([
      0.75,
      0.75,
      0.5,
    ]);
  });

  it('pins mix and smoothstep evaluation order and exact binary64 constants', () => {
    const builder = new ValidatedTargetProgramBuilder();
    const u = builder.u();
    const zero = builder.constantDecimal('0');
    const one = builder.constantDecimal('1');
    const mixed = builder.mix(zero, one, u);
    const smooth = builder.smoothstep(zero, one, u);
    const exactTenth = builder.constantFloat64(0.1);
    const generated = compileGeneratedTargetProgramBackends(
      builder.buildCanonicalProgram(metadata(), { x: mixed, y: smooth, z: exactTenth })
    );

    expect(generated.evaluateFloat64(0.25, 0)).toEqual([0.25, 0.15625, 0.1]);
    expect(generated.wgslSource).toContain('0.10000000149011612');
  });

  it('carries mathematical pi as a semantic leaf while generating finite approximations', () => {
    const builder = new ValidatedTargetProgramBuilder();
    const pi = builder.pi();
    const tau = builder.tau();
    const source = builder.buildCanonicalProgram(metadata(), { x: pi, y: tau, z: builder.sin(tau) });
    const generated = compileGeneratedTargetProgramBackends(source);

    expect(source).toContain('{"op":"pi"}');
    expect(generated.evaluateFloat64(0, 0)[0]).toBe(Math.PI);
    expect(generated.evaluateFloat64(0, 0)[1]).toBe(2 * Math.PI);
    expect(generated.wgslSource).toContain('3.1415927410125732');
  });

  it('emits ordered atan2 semantics for CPU, f32-reference, WGSL, and validation', () => {
    const builder = new ValidatedTargetProgramBuilder();
    const angle = builder.atan2(builder.v(), builder.u());
    const source = builder.buildCanonicalProgram(metadata(), {
      x: angle,
      y: builder.atan2(builder.constantDecimal('0'), builder.constantDecimal('-1')),
      z: builder.constantDecimal('0'),
    });
    const generated = compileGeneratedTargetProgramBackends(source);

    expect(generated.evaluateFloat64(0.25, 0.5)).toEqual([
      Math.atan2(0.5, 0.25),
      Math.PI,
      0,
    ]);
    expect(generated.evaluateFloat32Reference(0.25, 0.5)).toEqual([
      Math.fround(Math.atan2(Math.fround(0.5), Math.fround(0.25))),
      Math.fround(Math.atan2(0, -1)),
      0,
    ]);
    expect(generated.wgslSource).toContain('atan2(select(');
  });

  it('emits exact paired PCG2D lanes and shares one hash per operand pair', () => {
    const builder = new ValidatedTargetProgramBuilder();
    const cellX = builder.floor(builder.multiply(builder.u(), builder.constantDecimal('8')));
    const cellY = builder.floor(builder.multiply(builder.v(), builder.constantDecimal('8')));
    const hashX = builder.pcg2dUnitX(cellX, cellY);
    const hashY = builder.pcg2dUnitY(cellX, cellY);
    const generated = compileGeneratedTargetProgramBackends(
      builder.buildCanonicalProgram(metadata(), {
        x: hashX,
        y: hashY,
        z: builder.constantDecimal('0'),
      })
    );
    const expected = integerPcg2dUnitHash(2, 4);

    expect(generated.evaluateFloat64(0.25, 0.5)).toEqual([...expected, 0]);
    expect(generated.evaluateFloat32Reference(0.25, 0.5)).toEqual([...expected, 0]);
    expect(generated.wgslSource.match(/let h\d+: vec2<f32>/g)).toHaveLength(1);
    expect(generated.wgslSource).toContain('.x;');
    expect(generated.wgslSource).toContain('.y;');
  });

  it('refuses PCG2D operands that are not structurally integer-valued', () => {
    const builder = new ValidatedTargetProgramBuilder();
    const malformed = builder.pcg2dUnitX(builder.u(), builder.floor(builder.v()));
    const source = builder.buildCanonicalProgram(metadata(), {
      x: malformed,
      y: builder.constantDecimal('0'),
      z: builder.constantDecimal('0'),
    });

    expect(() => compileGeneratedTargetProgramBackends(source)).toThrow(
      /structurally integer-valued/i
    );
  });

  it('refuses references owned by another builder', () => {
    const left = new ValidatedTargetProgramBuilder();
    const right = new ValidatedTargetProgramBuilder();
    const foreign = left.u();
    expect(() => right.add(foreign, right.v())).toThrow(/does not belong/i);
  });
});
