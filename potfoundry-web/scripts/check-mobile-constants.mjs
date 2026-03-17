#!/usr/bin/env node
/**
 * Mobile Shader Constant Sync Check
 *
 * Verifies that all WGSL constants defined in common.wgsl and used by style
 * functions in styles.wgsl are also defined in the mobile shader base
 * (preview_full_mobile.wgsl).
 *
 * This prevents Cloudflare deployment failures where style functions reference
 * constants that exist in desktop's common.wgsl but are missing from the
 * self-contained mobile shader.
 *
 * Usage: node scripts/check-mobile-constants.mjs
 * Exit code: 0 = pass, 1 = fail
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHADERS = join(__dirname, '..', 'src', 'assets', 'shaders');

/** Extract all `const NAME` declarations from a WGSL file */
function extractConstants(source) {
  const re = /^const\s+(\w+)\s*[=:]/gm;
  const constants = new Set();
  let m;
  while ((m = re.exec(source)) !== null) {
    constants.add(m[1]);
  }
  return constants;
}

/** Find all identifier references in WGSL source (excluding declarations) */
function findUsedIdentifiers(source) {
  // Match word-boundary identifiers (skip the `const NAME` declarations themselves)
  const re = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  const used = new Set();
  let m;
  while ((m = re.exec(source)) !== null) {
    used.add(m[1]);
  }
  return used;
}

try {
  const commonSrc = readFileSync(join(SHADERS, 'common.wgsl'), 'utf-8');
  const stylesSrc = readFileSync(join(SHADERS, 'styles.wgsl'), 'utf-8');
  const mobileSrc = readFileSync(join(SHADERS, 'preview_full_mobile.wgsl'), 'utf-8');

  const commonConstants = extractConstants(commonSrc);
  const mobileConstants = extractConstants(mobileSrc);
  const stylesUsed = findUsedIdentifiers(stylesSrc);

  // Constants from common.wgsl that are referenced in styles.wgsl
  const neededByStyles = new Set();
  for (const name of commonConstants) {
    if (stylesUsed.has(name)) {
      neededByStyles.add(name);
    }
  }

  // Check which needed constants are missing from mobile shader
  const missing = [];
  for (const name of neededByStyles) {
    if (!mobileConstants.has(name)) {
      missing.push(name);
    }
  }

  console.log(`common.wgsl constants: ${commonConstants.size}`);
  console.log(`constants used by styles.wgsl: ${neededByStyles.size} (${[...neededByStyles].join(', ')})`);
  console.log(`mobile shader constants: ${mobileConstants.size}`);

  if (missing.length > 0) {
    console.error(`\n❌ FAIL: ${missing.length} constant(s) used by styles.wgsl are missing from mobile shader:`);
    for (const name of missing) {
      console.error(`  - ${name}`);
    }
    console.error('\nFix: Add these constants to the header of preview_full_mobile.wgsl');
    process.exit(1);
  }

  console.log('\n✅ PASS: All style-required constants are present in mobile shader');
  process.exit(0);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
