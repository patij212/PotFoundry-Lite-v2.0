import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import {
  tessellateAnnularRadialSolidTargetForCertification,
} from './annularSolidReferenceTessellation';
import {
  createCanonicalTargetInputBinding,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { createDragonScalesLayeredOuterWallTargetBinding } from './dragonScalesLayeredOuterWallTarget';
import { verifyExactDyadicRectanglePartition } from './exactDyadicDomainPartition';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import { assessProofSessionStructuralIntegrity } from './proofSessionStructuralIntegrity';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  SinglePatchAnnularRadialSolidTargetError,
} from './singlePatchAnnularRadialSolidTarget';
import { styleOuterWallTargetProgramsForProof } from './styleOuterWallTargetPrograms';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';

/**
 * TRACK A / U4 — DragonScales-first MULTI-PATCH ATLAS acceptance probe.
 *
 * DORMANT by default (every case is `it.skipIf(!process.env.PF_DS_ATLAS_SPIKE)`)
 * so the default suite stays byte-identical. Run the whole file with
 * `PF_DS_ATLAS_SPIKE=1` to observe the wall.
 *
 * WHY THIS EXISTS. `singlePatchAnnularRadialSolidTarget.ts:378-384` hard-refuses
 * any style whose authenticated outer-wall program set is not EXACTLY one
 * periodic `outer-wall` patch. DragonScales at active scaleDepth emits a LAYERED
 * set: `dsScaleRows` outer-wall band patches (each covering only the height band
 * [k/R, (k+1)/R]) plus `dsScaleRows-1` feature-curtain riser patches at every
 * internal row boundary. That is >1 patch, so the atlas refuses and DragonScales
 * cannot reach G2 certification. `styleOuterWallTargetRegistry`, the certification
 * CONTRACT (`certificationContract.ts` already admits `feature-curtain`/
 * `feature-side` roles and up to 4096 patches), and the exact-BigInt coverage
 * kernel are all multi-patch-ready — only the atlas + the fixed 6-patch reference
 * tessellation (`PATCH_IDS`, `NON_PERIODIC_JUNCTIONS`) are not.
 *
 * EXACT-BigInt CROSS-CHECK (what does NOT break vs. what must be ADDED when 2+
 * outer patches are admitted):
 *   - DOES NOT break: `verifyExactDyadicRectanglePartition` is PER-PATCH — it
 *     proves each patch's own unit (u,v) rectangle is an exact conforming
 *     partition. It never divides by the denominator and never looks across
 *     patches, so R band rectangles + (R-1) curtain rectangles each certify
 *     independently and the invariant composes unchanged.
 *   - MUST BE ADDED (the audit does NOT check these): (1) a GLOBAL disjoint +
 *     complete artifact-triangle assignment across all 2R+4 patches (each STL
 *     triangle mapped to exactly one patch, union = every triangle); (2) a
 *     shared-boundary / adjacency registry welding the R-1 curtain risers
 *     watertight (band(k-1)@v1 == curtain(k) top, curtain(k) bottom ==
 *     band(k)@v0) — shared-vertex-by-index, no T-junction; (3) per-height
 *     derivation of inner-wall/rim/caps/drain from the CORRECT band (base caps
 *     from band-0, rim from band-(R-1)) instead of one outer program.
 *
 * The GREEN cases below are non-vacuous controls that pin the wall + mechanism.
 * The RED cases encode the acceptance criteria a correct multi-patch DS atlas
 * MUST satisfy; each is red now because the atlas throws at build time. This
 * probe does NOT implement the atlas.
 */

const GATE = !process.env.PF_DS_ATLAS_SPIKE;
const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
// Small supported pot so a future accepting atlas tessellates cheaply.
const DS_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 40,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});
// Default DragonScales params ({} → dsScaleRows 8, dsScaleDepth 0.12 active).
const EXPECTED_ROWS = 8;
const EXPECTED_BANDS = EXPECTED_ROWS; // one band per row
const EXPECTED_CURTAINS = EXPECTED_ROWS - 1; // one riser per internal boundary
const EXPECTED_BASE_PATCHES = 5; // inner-wall, top-rim, bottom-top, bottom-under, drain-wall
const EXPECTED_ATLAS_PATCHES = EXPECTED_BANDS + EXPECTED_CURTAINS + EXPECTED_BASE_PATCHES; // 20

function dragonScalesInput(): CanonicalTargetInputBinding {
  return createCanonicalTargetInputBinding(
    DS_POT_GEOMETRY,
    'DragonScales',
    {},
    TARGET_CONTROLS
  );
}

function buildAcceptingAtlas() {
  const canonicalInput = dragonScalesInput();
  // Throws today at singlePatchAnnularRadialSolidTarget.ts:378-384. When the
  // multi-patch atlas exists this returns an accepted layered binding.
  const binding = createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
  return { binding, canonicalInput };
}

const DS_DIVISIONS = {
  angularDivisionsLog2: 4,
  verticalDivisionsLog2ByPatch: {
    'outer-wall': 2,
    'inner-wall': 2,
    'top-rim': 1,
    'bottom-top': 1,
    'bottom-under': 1,
    'drain-wall': 1,
  },
} as const;

describe('DragonScales multi-patch atlas — U4 acceptance (PF_DS_ATLAS_SPIKE)', () => {
  // ---------- GREEN controls: pin the wall and the mechanism ----------

  it.skipIf(GATE)(
    'MECHANISM (green): DragonScales authenticates as a layered band+curtain set (>1 outer patch)',
    () => {
      const canonicalInput = dragonScalesInput();
      const source = createDragonScalesLayeredOuterWallTargetBinding(canonicalInput);
      expect(source.rowDiscontinuitiesActive).toBe(true);
      expect(source.bandCount).toBe(EXPECTED_BANDS);
      expect(source.curtainCount).toBe(EXPECTED_CURTAINS);

      const registry = createStyleOuterWallTargetRegistryBinding(canonicalInput);
      const programs = styleOuterWallTargetProgramsForProof(registry);
      // The exact reason the single-patch gate trips: not length 1.
      expect(programs.length).toBe(EXPECTED_BANDS + EXPECTED_CURTAINS); // 15
      expect(programs.length).toBeGreaterThan(1);
      const bandCount = programs.filter((p) => String(p.role) === 'outer-wall').length;
      const curtainCount = programs.filter(
        (p) => String(p.role) === 'feature-curtain'
      ).length;
      expect(bandCount).toBe(EXPECTED_BANDS);
      expect(curtainCount).toBe(EXPECTED_CURTAINS);
    }
  );

  it.skipIf(GATE)(
    'WALL (green): the single-patch atlas refuses DragonScales with UNSUPPORTED_PATCH_COMPLEX',
    () => {
      const canonicalInput = dragonScalesInput();
      const registry = createStyleOuterWallTargetRegistryBinding(canonicalInput);
      let caught: unknown;
      try {
        createSinglePatchAnnularRadialSolidTargetBinding(canonicalInput, registry);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SinglePatchAnnularRadialSolidTargetError);
      expect((caught as SinglePatchAnnularRadialSolidTargetError).code).toBe(
        'UNSUPPORTED_PATCH_COMPLEX'
      );
      expect((caught as Error).message).toMatch(/exactly one periodic outer-wall patch/i);
    }
  );

  it.skipIf(GATE)(
    'ADJACENCY GRAPH (green): the DS source already exposes the curtain shared-boundary registry a multi-patch atlas needs',
    () => {
      const source = createDragonScalesLayeredOuterWallTargetBinding(dragonScalesInput());
      const curtains = source.patches.filter(
        (patch) => patch.kind === 'feature-curtain'
      );
      expect(curtains.length).toBe(EXPECTED_CURTAINS);
      // Each riser k links band k and band k+1 at the exact height t=(k+1)/R.
      for (let boundary = 0; boundary < EXPECTED_CURTAINS; boundary += 1) {
        const curtain = curtains.find(
          (patch) => patch.patchId === `feature-curtain-${boundary}`
        );
        expect(curtain).toBeDefined();
        if (curtain === undefined || curtain.kind !== 'feature-curtain') continue;
        expect(curtain.leftRowIndex).toBe(boundary);
        expect(curtain.rightRowIndex).toBe(boundary + 1);
        expect(curtain.leftBandPatchId).toBe(`outer-wall-band-${boundary}`);
        expect(curtain.rightBandPatchId).toBe(`outer-wall-band-${boundary + 1}`);
        expect(curtain.t).toBeCloseTo((boundary + 1) / EXPECTED_ROWS, 12);
      }
    }
  );

  // ---------- RED acceptance criteria: the target multi-patch atlas ----------

  it.skipIf(GATE)(
    'ACCEPTANCE 1 (red): atlas admits DragonScales and exposes 2R+4 patches (8 bands + 7 curtains + 5 base)',
    () => {
      const { binding } = buildAcceptingAtlas(); // throws today → red
      const roles = binding.programs.map((program) => String(program.role));
      expect(roles.filter((role) => role === 'outer-wall').length).toBe(EXPECTED_BANDS);
      expect(roles.filter((role) => role === 'feature-curtain').length).toBe(
        EXPECTED_CURTAINS
      );
      for (const baseRole of [
        'inner-wall',
        'top-rim',
        'bottom-top',
        'bottom-under',
        'drain-wall',
      ]) {
        expect(roles).toContain(baseRole);
      }
      expect(binding.programs.length).toBe(EXPECTED_ATLAS_PATCHES); // 20
    }
  );

  it.skipIf(GATE)(
    'ACCEPTANCE 2 (red): every patch is an exact dyadic partition AND artifact triangles assign disjointly + completely',
    () => {
      const { binding } = buildAcceptingAtlas(); // throws today → red
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        DS_DIVISIONS
      );
      // Per-patch exact-BigInt coverage composes unchanged across all patches.
      for (const partition of tessellation.partitions) {
        expect(verifyExactDyadicRectanglePartition(partition).exactPartition).toBe(true);
      }
      // GLOBAL disjoint + complete assignment — the invariant the exact-BigInt
      // audit does NOT itself check across patches.
      expect(tessellation.partitions.length).toBe(EXPECTED_ATLAS_PATCHES);
      const seen = new Set<number>();
      for (const partition of tessellation.partitions) {
        expect(partition.artifactTriangleCount).toBe(tessellation.triangleCount);
        for (const triangle of partition.triangles) {
          expect(seen.has(triangle.artifactTriangleIndex)).toBe(false);
          seen.add(triangle.artifactTriangleIndex);
        }
      }
      expect(seen.size).toBe(tessellation.triangleCount);
    }
  );

  it.skipIf(GATE)(
    'ACCEPTANCE 3 (red): bands + curtains + caps weld into ONE closed genus-1 solid (risers watertight by index)',
    () => {
      const { binding } = buildAcceptingAtlas(); // throws today → red
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(
        binding,
        DS_DIVISIONS
      );
      const session = createFinalArtifactProofSession(tessellation.stlBytes);
      const structural = assessProofSessionStructuralIntegrity(session, {
        componentCount: 1,
        genus: 1,
      });
      expect(structural.structurallyValid).toBe(true);
      expect(structural.scanComplete).toBe(true);
    }
  );
});
