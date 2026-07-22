// Generates the eval/normal compute shaders as fixtures for the on-hardware
// compile gate (e2e/_preview_eval_compile.mjs), and asserts they carry the
// expected compute entry points. Run before the gate:
//   npx vitest run src/renderers/webgpu/ShaderManager.evalArtifacts.test.ts --environment jsdom
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShaderManager } from './ShaderManager';

// vitest runs with cwd = project root (potfoundry-web).
const outDir = join(process.cwd(), 'e2e', '.artifacts');

describe('eval compute artifacts', () => {
  it('writes eval_pos + neighbor_normal WGSL fixtures with the expected entries', () => {
    mkdirSync(outDir, { recursive: true });
    const sm = ShaderManager.getInstance();
    const evalPos = sm.getEvalPositionWGSL();
    const neighborNormal = sm.getNeighborNormalWGSL();
    const instant = sm.getInstantPreviewWGSL();
    expect(evalPos).toContain('fn eval_pos');
    expect(neighborNormal).toContain('fn norm_from_nbr');
    expect(instant).toContain('fn vs_main');
    writeFileSync(`${outDir}/eval_pos.wgsl`, evalPos, 'utf8');
    writeFileSync(`${outDir}/neighbor_normal.wgsl`, neighborNormal, 'utf8');
    writeFileSync(`${outDir}/instant_preview.wgsl`, instant, 'utf8');
  });
});
