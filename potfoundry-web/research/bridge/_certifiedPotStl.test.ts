// _certifiedPotStl.test.ts — DEV-ONLY (env PF_CERTSTL=1). Emits the binary STL for every pot in
// the PF_G2_POT certified roster. The bytes written ARE the certified artifact: this reproduces the
// exact gate path atlas -> tessellateAnnularRadialSolidTargetForCertification -> tessellation.stlBytes,
// i.e. the same bytes proveFinalStlMappedGeometryAndStructure certifies to the 0.01 mm two-sided
// partial certificate. The roster config lives in ./_certRoster (shared with the error-overlay baker).
// Writes only into research/exchange/_certified_stl/. Resumable: skips a pot whose STL already exists.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { tessellateAnnularRadialSolidTargetForCertification } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { atlas, CERTIFIED_POTS } from './_certRoster';

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
    expect(CERTIFIED_POTS.length).toBe(12); // PF_G2_POT roster size — bump if the gate grows
  }, 10 * 60 * 1000);
});
