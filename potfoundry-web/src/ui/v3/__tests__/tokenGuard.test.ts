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
    for (const file of walk(V3_DIR).filter((f) => /\.(css|tsx?)$/.test(f) && !f.endsWith('tokenGuard.test.ts'))) {
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

  it('every referenced pf3 token is defined', () => {
    // Collect all referenced --pf3-* tokens from CSS/TSX files (excluding those with fallback values)
    const referenced = new Set<string>();
    for (const file of walk(V3_DIR).filter((f) => /\.(css|tsx?)$/.test(f) && !f.endsWith('tokenGuard.test.ts'))) {
      const text = fs.readFileSync(file, 'utf8');
      // Match var(--pf3-...) but exclude cases with fallback: var(--pf3-..., ...)
      const matches = text.matchAll(/var\(--pf3-[a-z0-9-]+(?:,|\))/g);
      for (const m of matches) {
        const token = m[0].match(/--pf3-[a-z0-9-]+/)?.[0];
        if (token && !m[0].includes(',')) {
          // Only add if no fallback (no comma before closing paren)
          referenced.add(token);
        }
      }
    }

    // Collect all defined --pf3-* tokens from tokens.css
    const tokensCss = fs.readFileSync(path.join(V3_DIR, 'tokens.css'), 'utf8');
    const defined = new Set<string>();
    for (const match of tokensCss.matchAll(/--pf3-[a-z0-9-]+:/g)) {
      defined.add(match[0].slice(0, -1)); // Remove trailing ':'
    }

    // Check that all referenced tokens are defined
    const undefined_tokens: Array<{ token: string; files: string[] }> = [];
    for (const token of referenced) {
      if (!defined.has(token)) {
        const files: string[] = [];
        for (const file of walk(V3_DIR).filter((f) => /\.(css|tsx?)$/.test(f))) {
          const text = fs.readFileSync(file, 'utf8');
          if (text.includes(`var(${token}`) || text.includes(`${token}:`)) {
            files.push(file);
          }
        }
        undefined_tokens.push({ token, files });
      }
    }

    if (undefined_tokens.length > 0) {
      const report = undefined_tokens.map(({ token, files }) => `${token} referenced in:\n  ${files.join('\n  ')}`).join('\n');
      throw new Error(`Undefined pf3 tokens:\n${report}`);
    }

    expect(undefined_tokens).toEqual([]);
  });
});
