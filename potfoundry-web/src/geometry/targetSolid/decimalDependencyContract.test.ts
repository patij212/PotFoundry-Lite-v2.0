import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DECIMAL_INTERVAL_BUNDLED_SOURCE_SHA256,
  DECIMAL_INTERVAL_DEPENDENCY_VERSION,
  DECIMAL_INTERVAL_NPM_INTEGRITY,
} from './decimalInterval';

const PACKAGE_ROOT = process.cwd();
const RUNTIME_SOURCE = 'decimal.mjs';

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, relativePath), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('decimal interval proof dependency contract', () => {
  it('pins the direct dependency, lock artifact, installed version, and exact runtime bytes', () => {
    const packageJson = readJson('package.json');
    const dependencies = packageJson.dependencies as Record<string, string>;
    expect(dependencies['decimal.js']).toBe(DECIMAL_INTERVAL_DEPENDENCY_VERSION);

    const packageLock = readJson('package-lock.json');
    const lockPackages = packageLock.packages as Record<string, Record<string, unknown>>;
    const rootDependencies = lockPackages[''].dependencies as Record<string, string>;
    const locked = lockPackages['node_modules/decimal.js'];
    expect(rootDependencies['decimal.js']).toBe(DECIMAL_INTERVAL_DEPENDENCY_VERSION);
    expect(locked.version).toBe(DECIMAL_INTERVAL_DEPENDENCY_VERSION);
    expect(locked.integrity).toBe(DECIMAL_INTERVAL_NPM_INTEGRITY);

    const installed = readJson('node_modules/decimal.js/package.json');
    expect(installed.version).toBe(DECIMAL_INTERVAL_DEPENDENCY_VERSION);
    const source = readFileSync(resolve(PACKAGE_ROOT, 'node_modules', 'decimal.js', RUNTIME_SOURCE));
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      DECIMAL_INTERVAL_BUNDLED_SOURCE_SHA256
    );
  });
});
