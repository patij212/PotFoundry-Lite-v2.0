import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const V3_DIR = path.resolve(__dirname, '..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('v3 token discipline', () => {
  it('uses no v1/v2 tokens inside src/ui/v3', () => {
    const offenders: string[] = [];
    for (const file of walk(V3_DIR).filter((f) => /\.(css|tsx?)$/.test(f) && !f.includes('__tests__'))) {
      const text = fs.readFileSync(file, 'utf8');
      if (/--pf2-/.test(text) || /--pf-(?!3-)/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('defines the core pf3 tokens', () => {
    const css = fs.readFileSync(path.join(V3_DIR, 'tokens.css'), 'utf8');
    for (const t of ['--pf3-gold:', '--pf3-bg-stage:', '--pf3-text-primary:', '--pf3-z-panel:', '--pf3-ease-move:']) {
      expect(css).toContain(t);
    }
  });
});
