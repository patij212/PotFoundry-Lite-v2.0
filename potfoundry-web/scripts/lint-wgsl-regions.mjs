#!/usr/bin/env node
/**
 * WGSL Region Marker Lint Script
 *
 * Validates that all style functions in styles.wgsl have proper region markers.
 * Region markers are used for mobile shader stripping to prevent "Device Lost" crashes
 * on mobile GPUs with limited shader complexity.
 *
 * Checks:
 * 1. Every registered shaderName has a matching `// #region <shaderName>` marker
 * 2. All `#region` markers have corresponding `#endregion` markers
 * 3. Region markers are properly balanced (no orphans)
 *
 * Usage: node scripts/lint-wgsl-regions.mjs
 * Exit code: 0 = pass, 1 = fail
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * Canonical list of shader function names from registry.ts
 * These MUST have region markers in styles.wgsl for mobile stripping to work.
 */
const REQUIRED_SHADER_NAMES = [
  'sf_radius',
  'fourier_radius',
  'spiral_radius',
  'superellipse_radius',
  'harmonic_radius',
  'low_poly_facet_radius',
  'gothic_arches_radius',
  'wave_interference_radius',
  'crystalline_radius',
  'art_deco_radius',
  'dragon_scales_radius',
  'bamboo_segments_radius',
  'ripple_interference_radius',
  'style_gyroid_manifold',
  'style_voronoi',
  'style_basket_weave',
  'style_geometric_star',
  'style_hexagonal_hive',
  'style_celtic_knot',
  'style_celtic_triquetra',
];

/**
 * @typedef {Object} LintResult
 * @property {boolean} passed
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * Parse region markers from WGSL source
 * @param {string} source - WGSL shader source
 * @returns {{ regions: string[], endRegions: number, orphanedEndRegions: number }}
 */
function parseRegionMarkers(source) {
  const lines = source.split('\n');
  const regions = [];
  let openRegions = 0;
  let orphanedEndRegions = 0;
  let endRegionCount = 0;

  for (const line of lines) {
    const regionMatch = line.match(/\/\/\s*#region\s+(\S+)/);
    if (regionMatch) {
      regions.push(regionMatch[1]);
      openRegions++;
    }

    if (/\/\/\s*#endregion/.test(line)) {
      endRegionCount++;
      if (openRegions > 0) {
        openRegions--;
      } else {
        orphanedEndRegions++;
      }
    }
  }

  return { regions, endRegions: endRegionCount, orphanedEndRegions };
}

/**
 * Lint WGSL region markers
 * @returns {LintResult}
 */
function lintWgslRegions() {
  const errors = [];
  const warnings = [];

  // Read styles.wgsl
  const stylesPath = join(ROOT, 'src/assets/shaders/styles.wgsl');
  let source;
  try {
    source = readFileSync(stylesPath, 'utf-8');
  } catch (err) {
    return {
      passed: false,
      errors: [`Failed to read ${stylesPath}: ${err.message}`],
      warnings: [],
    };
  }

  const { regions, endRegions, orphanedEndRegions } = parseRegionMarkers(source);

  // Check 1: All required shader names have region markers
  const missingRegions = REQUIRED_SHADER_NAMES.filter(
    (name) => !regions.includes(name)
  );

  if (missingRegions.length > 0) {
    for (const name of missingRegions) {
      errors.push(
        `Missing region marker for shader function '${name}'. ` +
        `Add '// #region ${name}' before the function and '// #endregion' after.`
      );
    }
  }

  // Check 2: Region/endregion balance
  if (regions.length !== endRegions) {
    errors.push(
      `Region marker imbalance: ${regions.length} #region markers but ${endRegions} #endregion markers. ` +
      `Each #region must have a matching #endregion.`
    );
  }

  if (orphanedEndRegions > 0) {
    errors.push(
      `Found ${orphanedEndRegions} orphaned #endregion marker(s) without matching #region.`
    );
  }

  // Check 3: Extra regions (not in required list)
  const extraRegions = regions.filter(
    (name) => !REQUIRED_SHADER_NAMES.includes(name)
  );

  if (extraRegions.length > 0) {
    for (const name of extraRegions) {
      warnings.push(
        `Region '${name}' is not in REQUIRED_SHADER_NAMES. ` +
        `If this is a new style, add it to the list in lint-wgsl-regions.mjs.`
      );
    }
  }

  // Check 4: Duplicate regions
  const duplicates = regions.filter(
    (name, index) => regions.indexOf(name) !== index
  );

  if (duplicates.length > 0) {
    for (const name of duplicates) {
      errors.push(`Duplicate region marker: '${name}' appears multiple times.`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

// Main execution
const result = lintWgslRegions();

// Output results
if (result.errors.length > 0) {
  console.error('\n❌ WGSL Region Marker Lint FAILED:\n');
  for (const error of result.errors) {
    console.error(`  • ${error}\n`);
  }
}

if (result.warnings.length > 0) {
  console.warn('\n⚠️  Warnings:\n');
  for (const warning of result.warnings) {
    console.warn(`  • ${warning}\n`);
  }
}

if (result.passed) {
  console.log(`\n✅ WGSL Region Marker Lint PASSED (${REQUIRED_SHADER_NAMES.length} styles verified)\n`);
}

process.exit(result.passed ? 0 : 1);
