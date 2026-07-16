// _certifiedPotStl.test.ts — DEV-ONLY (env PF_CERTSTL=1). Emits the binary STL for every pot in
// the PF_G2_POT certified roster. The bytes written ARE the certified artifact: this reproduces the
// exact gate path atlas -> tessellateAnnularRadialSolidTargetForCertification -> tessellation.stlBytes,
// i.e. the same bytes proveFinalStlMappedGeometryAndStructure certifies to the 0.01 mm two-sided
// partial certificate. Configs copied verbatim from CERTIFIED_POTS in
// src/geometry/targetSolid/annularSolidReferenceTessellation.test.ts (keep in sync if that roster grows).
// Writes only into research/exchange/_certified_stl/. Resumable: skips a pot whose STL already exists.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_GEOMETRY, type GeometryParams } from '../../src/state/types';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import { createSinglePatchAnnularRadialSolidTargetBinding } from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import {
  dyadicEdgeLadder,
  rationalFeatureAngularLadder,
  rationalStationLadder,
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellationOptions,
} from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
const SMALL_POT_GEOMETRY: GeometryParams = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 40,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});
const GENTLE_HARMONIC_RIPPLE = Object.freeze({ hr_petal_amp: 0.01, hr_ripple_amp: 0, hr_bell: 0 });

function atlas(geometry: GeometryParams, styleParams: Readonly<Record<string, number>>, styleId: string) {
  const canonicalInput = createCanonicalTargetInputBinding(geometry, styleId, styleParams, TARGET_CONTROLS);
  const binding = createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
  return binding;
}

const CERTIFIED_POTS: ReadonlyArray<{
  name: string;
  styleId: string;
  styleParams: Readonly<Record<string, number>>;
  geometry: GeometryParams;
  divisions: AnnularSolidReferenceTessellationOptions;
}> = [
  {
    name: 'HarmonicRipple_small_OD30',
    styleId: 'HarmonicRipple',
    styleParams: GENTLE_HARMONIC_RIPPLE,
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 3, 'inner-wall': 3, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'SpiralRidges_small_OD30',
    styleId: 'SpiralRidges',
    styleParams: { spiral_amp_min: 0.02, spiral_amp_max: 0.02, spiral_groove_amp: 0, spiral_turns: 0.2 },
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'FourierBloom_small_OD30_defaults',
    styleId: 'FourierBloom',
    styleParams: {},
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 10,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 2, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'SuperellipseMorph_small_OD30_defaults',
    styleId: 'SuperellipseMorph',
    styleParams: {},
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  {
    name: 'HarmonicRipple_production_OD140',
    styleId: 'HarmonicRipple',
    styleParams: GENTLE_HARMONIC_RIPPLE,
    geometry: Object.freeze({ ...DEFAULT_GEOMETRY, r_drain: 10 }),
    divisions: {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 5, 'inner-wall': 5, 'top-rim': 3, 'bottom-top': 5, 'bottom-under': 5, 'drain-wall': 1,
      },
      verticalStationsByPatch: {
        'outer-wall': dyadicEdgeLadder(5, 7, 'v0'),
        'inner-wall': dyadicEdgeLadder(5, 7, 'v0'),
      },
    },
  },
  {
    name: 'Crystalline_small_OD30_fract',
    styleId: 'Crystalline',
    styleParams: { cr_facet_depth: 0.02, cr_edge_sharpness: 2, cr_asymmetry: 0, cr_height_phase: 0 },
    geometry: SMALL_POT_GEOMETRY,
    divisions: {
      angularDivisionsLog2: 8,
      angularStations: rationalFeatureAngularLadder(8, 24),
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 3, 'inner-wall': 3, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
    },
  },
  // Voronoi is intentionally ABSENT: bubble mode converges per-patch but is
  // compute-bound over the composed ceiling (Addendum 9) — no certificate
  // was minted, so emitting its STL here would be a false claim.
  {
    name: 'GeometricStar_H32_OD30_fract',
    styleId: 'GeometricStar',
    styleParams: { gs_relief: 0.02, gs_roundness: 1 },
    geometry: Object.freeze({ ...DEFAULT_GEOMETRY, H: 32, top_od: 30, bottom_od: 30, r_drain: 6 }),
    divisions: {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 6, 'inner-wall': 6, 'top-rim': 3, 'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
      },
      verticalStationsByPatch: {
        'inner-wall': rationalStationLadder(6, [
          [5, 29],
          [13, 29],
          [21, 29],
        ]),
      },
    },
  },
];

describe('certified pot STL emission', () => {
  it.skipIf(!process.env.PF_CERTSTL)('emits certified tessellation.stlBytes for every roster pot', () => {
    const OUT = join('research', 'exchange', '_certified_stl');
    mkdirSync(OUT, { recursive: true });
    const log = join(OUT, '_manifest.txt');
    for (const pot of CERTIFIED_POTS) {
      const outPath = join(OUT, `${pot.name}.stl`);
      if (existsSync(outPath)) { appendFileSync(log, `${pot.name}: EXIST\n`); continue; }
      const binding = atlas(pot.geometry, pot.styleParams, pot.styleId);
      const tess = tessellateAnnularRadialSolidTargetForCertification(binding, pot.divisions);
      writeFileSync(outPath, Buffer.from(tess.stlBytes));
      const tris = new DataView(tess.stlBytes.buffer, tess.stlBytes.byteOffset, 84).getUint32(80, true);
      const line = `${pot.name}: style=${pot.styleId} OD=${pot.geometry.top_od} tris=${tris} bytes=${tess.stlBytes.length}`;
      appendFileSync(log, line + '\n');
      // eslint-disable-next-line no-console
      console.log(line);
      expect(tris).toBeGreaterThan(0);
    }
    expect(CERTIFIED_POTS.length).toBe(7); // PF_G2_POT roster size — bump if the gate grows
  }, 10 * 60 * 1000);
});
