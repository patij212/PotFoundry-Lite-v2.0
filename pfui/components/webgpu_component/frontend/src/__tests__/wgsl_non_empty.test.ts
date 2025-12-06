import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

describe('wgsl asset', () => {
  it('pot_preview.wgsl should not be empty', () => {
    const path = join(__dirname, '..', '..', '..', '..', '..', 'preview', 'assets', 'pot_preview.wgsl');
    const content = readFileSync(path, { encoding: 'utf8' });
    expect(content && content.trim().length).toBeGreaterThan(0);
  });
  it('pot_preview.wgsl should contain expected entry points and bindings', () => {
    const path = join(__dirname, '..', '..', '..', '..', '..', 'preview', 'assets', 'pot_preview.wgsl');
    const content = readFileSync(path, { encoding: 'utf8' });
    expect(content.includes('fn vs_main(') || content.includes('@vertex')).toBeTruthy();
    expect(content.includes('fn fs_main(') || content.includes('@fragment')).toBeTruthy();
    expect(content.includes('@group(0) @binding(0)')).toBeTruthy();
    expect(content.includes('@group(0) @binding(4)')).toBeTruthy();
    // Ensure the uniform block has the expected array size (18 vec4 -> 72 floats)
    expect(/values\s*:\s*array<vec4<\s*f32\s*>,\s*18\s*>/i.test(content)).toBeTruthy();
    // Ensure vertex shader uses builtin vertex_index (procedural geometry)
    expect(content.includes('@builtin(vertex_index)') || content.includes('@builtin(instance_index)')).toBeTruthy();
  });
});
