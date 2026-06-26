// potfoundry-web/research/bridge/isolation.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

describe('production isolation', () => {
  it('no file under src/ imports from research/', () => {
    const offenders = walk('src').filter((f) => /from ['"].*research\//.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
