/**
 * realMeshExport.test.ts — Plan Task 3.2: real-mesh export validation.
 *
 * Feeds REAL generated meshes (not synthetic fixtures) through the production
 * export gate `validateMeshForExport` for all 20 registered styles, on two paths:
 *
 *   (a) LEGACY — `buildPotMesh` (CPU uniform-grid builder, the ship-today path
 *       behind `useExport.ts`). Known-defective: every style produces exactly
 *       `orientationMismatches === 2·nTheta` at the wrap-around u-seam (the legacy
 *       grid's seam-winding artifact). The STL writer reorients winding on write,
 *       so exported STLs are usable, but the raw `buildPotMesh` mesh does not pass
 *       the orientation invariant. These are PINNED with `test.fail()` so the suite
 *       RECORDS the legacy defect (a green `test.fail()` = the defect is still
 *       present) without falsely asserting the legacy mesh is export-clean. If a
 *       legacy style ever becomes clean, its `test.fail()` flips RED — a signal to
 *       retire the pin.
 *
 *   (b) CONFORMING — the watertight-by-construction CPU assembly
 *       (`assembleConformingCPU`, the headless mirror of the production conforming
 *       branch reused from `conformingTopologyGate.test.ts`). These are HARD
 *       assertions: every style must pass `validateMeshForExport` with
 *       `ok === true && boundaryEdges === 0 && orientationMismatches === 0`. This
 *       is the gate that makes the conforming default-flip safe — it proves the
 *       future production path produces export-clean meshes for every style.
 *
 * Reference: `src/geometry/exportValidation.ts` (`validateMeshForExport`),
 * `src/geometry/meshBuilder.ts` (`buildPotMesh`),
 * `src/geometry/conformingTopologyGate.test.ts` (`assembleConformingCPU`).
 */
import { describe, it, expect } from 'vitest';
import { buildPotMesh } from './meshBuilder';
import { validateMeshForExport } from './exportValidation';
import { DEFAULT_STYLE_PARAMS } from './types';
import type { MeshData, StyleId } from './types';
import { assembleConformingCPU } from './conformingTopologyGate.test';

/** The 20 registered styles (canonical source: the default-params map). */
const ALL_20_STYLES = Object.keys(DEFAULT_STYLE_PARAMS) as StyleId[];

/**
 * Documented known legacy defect. `buildPotMesh` welds NO seam column, so the
 * wrap-around edges at the u-seam are traversed in the same direction by both
 * adjacent faces on BOTH walls → `2 · nTheta` inconsistent-orientation edge
 * pairs. With the default quality (nTheta = 168) that is exactly 336, uniformly
 * across every style. We do not hardcode 336 (quality could change); we only
 * require the legacy mesh to be NON-clean so the `test.fail()` pin is honest.
 */
const LEGACY_KNOWN_ORIENTATION_DEFECT = true;

describe('realMeshExport — LEGACY buildPotMesh through validateMeshForExport (known-defective, pinned)', () => {
  it('the legacy path is pinned as known-defective (documents intent)', () => {
    expect(LEGACY_KNOWN_ORIENTATION_DEFECT).toBe(true);
  });

  // `test.fail()` inverts the result: a FAILING inner assertion makes the test
  // PASS, recording that the legacy mesh is still not export-clean. Every legacy
  // style is pinned — the legacy CPU grid carries the seam-winding defect on all
  // 20 (verified: orientationMismatches === 2·nTheta everywhere).
  describe.each(ALL_20_STYLES)('legacy %s', (style) => {
    it.fails('is NOT export-clean (legacy seam-winding defect, retire when fixed)', () => {
      const result = buildPotMesh({}, {}, style, {});
      const report = validateMeshForExport(result.mesh);
      // Inner assertion that the legacy mesh is export-clean. This FAILS today
      // (orientationMismatches > 0), and `it.fails` turns that into a PASS. The
      // day legacy is fixed, this assertion passes → `it.fails` flips RED → pin
      // is retired.
      expect(report.ok).toBe(true);
      expect(report.orientationMismatches).toBe(0);
    }, 60000);
  });
});

describe('realMeshExport — CONFORMING assembly through validateMeshForExport (hard gate)', () => {
  describe.each(ALL_20_STYLES)('conforming %s', (style) => {
    it('passes the export gate: ok, no naked edges, no orientation mismatches', () => {
      const asm = assembleConformingCPU(style);
      const mesh: MeshData = {
        vertices: asm.vertices,
        indices: asm.indices,
        vertexCount: asm.vertices.length / 3,
        triangleCount: asm.indices.length / 3,
      };

      // Guard against a vacuous pass on a degenerate/empty mesh: a real whole-pot
      // conforming mesh has thousands of triangles (two walls at nRing=256 + caps).
      expect(mesh.triangleCount).toBeGreaterThan(1000);

      const report = validateMeshForExport(mesh);

      // HARD assertions — the conforming path must be export-clean for every style.
      expect(report.boundaryEdges).toBe(0);
      expect(report.orientationMismatches).toBe(0);
      expect(report.ok).toBe(true);
    }, 90000);
  });
});
