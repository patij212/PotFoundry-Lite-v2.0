import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ROBUST_PREDICATES_BUNDLED_SOURCE_SHA256,
  ROBUST_PREDICATES_NPM_INTEGRITY,
  ROBUST_PREDICATES_VERSION,
} from './exactTriangleIntersection';

const PACKAGE_ROOT = process.cwd();
const SOURCE_FILES = ['index.js', 'esm/orient2d.js', 'esm/orient3d.js', 'esm/util.js'] as const;

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, relativePath), 'utf8')) as Record<
    string,
    unknown
  >;
}

function installedSourceSha256(): string {
  const hash = createHash('sha256');
  for (const relativePath of SOURCE_FILES) {
    hash.update(relativePath);
    hash.update(Uint8Array.of(0));
    hash.update(
      readFileSync(resolve(PACKAGE_ROOT, 'node_modules', 'robust-predicates', relativePath))
    );
    hash.update(Uint8Array.of(0));
  }
  return hash.digest('hex');
}

describe('robust-predicates proof dependency contract', () => {
  it('pins the direct dependency, lock artifact, installed version, and bundled source bytes', () => {
    const packageJson = readJson('package.json');
    const dependencies = packageJson.dependencies as Record<string, string>;
    expect(dependencies['robust-predicates']).toBe(ROBUST_PREDICATES_VERSION);

    const packageLock = readJson('package-lock.json');
    const lockPackages = packageLock.packages as Record<string, Record<string, unknown>>;
    const rootDependencies = lockPackages[''].dependencies as Record<string, string>;
    const locked = lockPackages['node_modules/robust-predicates'];
    expect(rootDependencies['robust-predicates']).toBe(ROBUST_PREDICATES_VERSION);
    expect(locked.version).toBe(ROBUST_PREDICATES_VERSION);
    expect(locked.integrity).toBe(ROBUST_PREDICATES_NPM_INTEGRITY);

    const installed = readJson('node_modules/robust-predicates/package.json');
    expect(installed.version).toBe(ROBUST_PREDICATES_VERSION);
    expect(installedSourceSha256()).toBe(ROBUST_PREDICATES_BUNDLED_SOURCE_SHA256);
  });
});
