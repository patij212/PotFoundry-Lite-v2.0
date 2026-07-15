import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
});

describe('style certification schema import-order integrity', () => {
  it('fails closed when public registry and packer ids are mutated before certification imports', async () => {
    vi.resetModules();
    const registry = await import('./registry');
    registry.STYLE_REGISTRY.SuperformulaBlossom.id = 20;
    registry.STYLE_IDS.SuperformulaBlossom = 20;

    await expect(import('./runtimeContract')).rejects.toThrow(
      /SuperformulaBlossom registry id 20 does not match committed dispatch 0/
    );
  });

  it('rejects a packer id mutation that occurs after the immutable schema is loaded', async () => {
    vi.resetModules();
    const runtime = await import('./runtimeContract');
    const registry = await import('./registry');
    registry.STYLE_IDS.SuperformulaBlossom = 20;

    const result = runtime.normalizeStylePayload('SuperformulaBlossom', {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain('PACKED_PAYLOAD_INVALID');
  });
});
