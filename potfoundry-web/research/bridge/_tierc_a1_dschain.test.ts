// _tierc_a1_dschain.test.ts — TDD for PROD-TIERC region-layer-core plan task A-1
// (docs/superpowers/plans/2026-07-12-region-layer-core.md §4 A-1: "Fix the DS anatomy overlap bug +
// flip ChainSpec TODO->DEFINED"). Three pre-registered assertions:
//
//   1. DS anatomy's ring-band and body-band z-domains are strictly DISJOINT (no z-overlap) — the
//      regression guard for the WINDING-ROOT-diagnosis.md §3 / DS-topofix-verdict.md Finding 1
//      nonManifoldEdges=3584 bug. NOTE (measurement-before-fixes honesty): this z-boundary fix
//      already LANDED in tierc_manifest.ts's `dragonScalesAnatomy` in commit d4eeb5c8 (2026-07-11,
//      "fix(tierc): DS topology CLOSED"), BEFORE this A-1 task started — this assertion is a
//      REGRESSION GUARD for that prior fix, not a red->green change this task itself makes. It was
//      already GREEN before this task touched the manifest.
//   2. Every DS `ChainSpec.status === 'DEFINED'` with a non-null `adopter` (owner = the K1 body
//      region, adopter = the R-STRUCT ring band — B0-boundary-contract-verdict.md contract (a): the
//      K1 region OWNS its `nRing`-pinned boundary; the ring band ADOPTS it by reading
//      topRing/bottomRing directly, never re-deriving). THIS is the actual TODO->DEFINED flip this
//      task performs in `dsRingChain`/`dsBodyChain` — RED before the tierc_manifest.ts edit (every
//      chain was `owner: ring-*` or `owner: body-*` with `adopter: null, status: 'TODO'`).
//   3. `buildStructCdtChain` (via `buildRegionOuterWall` on the REAL DS manifest) produces
//      `nonManRawBig == 0` NON-VACUOUS on the assembled DS outer wall (inject a duplicate triangle ->
//      the raw count moves strictly above 0). Reproduces DS-topofix-verdict.md's own gate
//      (`_tierc_ds_topofix.test.ts`) as THIS task's own self-contained witness, using labkit's raw
//      nonManRawBig directly (not topologyMetric) per the brief's literal wording.
//
// PF_TIERC_A1_DSCHAIN=1 runs assertion 3 (the one real DS-scale meshing build). Assertions 1+2 are
// pure-data (no meshing, sub-10ms) and always run.
//
// DEV-ONLY. research/ never imported by src/. NEW FILE — no existing test file edited.
import { describe, it, expect } from 'vitest';
import { getManifest, dragonScalesAnatomy, TIERC_COMMON_DIMS, type ChainSpec } from './tierc_manifest';
import { buildRegionOuterWall } from './tierc_regionLayer';
import { nonManRawBig, nonManRawBigStats } from './labkit';

describe('A-1 — DS anatomy z-overlap fix + ChainSpec TODO->DEFINED', () => {
  it('1. ring-band and body-band z-domains are strictly disjoint (no z-overlap; regression guard for the 3584-edge bug)', () => {
    const anatomy = dragonScalesAnatomy({}, TIERC_COMMON_DIMS);
    expect(anatomy.regions).toHaveLength(15); // 7 ring + 8 body

    const spans = anatomy.regions.map((r) => {
      expect(r.domain.zLo, `region "${r.id}" must be z-domain-defined`).not.toBeUndefined();
      expect(r.domain.zHi, `region "${r.id}" must be z-domain-defined`).not.toBeUndefined();
      return { id: r.id, zLo: r.domain.zLo as number, zHi: r.domain.zHi as number };
    });
    for (const s of spans) expect(s.zHi, `region "${s.id}" zHi>zLo`).toBeGreaterThan(s.zLo);

    const sorted = [...spans].sort((a, b) => a.zLo - b.zLo);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(
        sorted[i].zHi,
        `region "${sorted[i].id}" [${sorted[i].zLo},${sorted[i].zHi}] must not overlap ` +
          `"${sorted[i + 1].id}" [${sorted[i + 1].zLo},${sorted[i + 1].zHi}]`,
      ).toBeLessThanOrEqual(sorted[i + 1].zLo);
    }
    expect(sorted[0].zLo).toBe(0);
    expect(sorted[sorted.length - 1].zHi).toBe(TIERC_COMMON_DIMS.H);

    // Pin the corrected boundary values at one interior ring (ring-3, z=60, k=4 of 8) — a regression
    // witness independent of the generic disjointness loop above, so an accidental revert to the OLD
    // raw-z construction (body-i = [ring(i).z, ring(i+1).z], overlapping every ring band by 0.6mm on
    // each side) is caught even if disjointness were somehow coincidentally preserved.
    const ring3 = anatomy.regions.find((r) => r.id === 'ring-3');
    expect(ring3?.domain.zLo).toBeCloseTo(59.4, 10);
    expect(ring3?.domain.zHi).toBeCloseTo(60.6, 10);
    const body3 = anatomy.regions.find((r) => r.id === 'body-3'); // [45.6, 59.4]
    const body4 = anatomy.regions.find((r) => r.id === 'body-4'); // [60.6, 74.4]
    expect(body3?.domain.zHi).toBeCloseTo(59.4, 10);
    expect(body4?.domain.zLo).toBeCloseTo(60.6, 10);
  });

  it('2. every DS ChainSpec is status=DEFINED with a non-null adopter (owner=K1 body region, adopter=R-STRUCT ring band)', () => {
    const anatomy = dragonScalesAnatomy({}, TIERC_COMMON_DIMS);
    const allChains: ChainSpec[] = anatomy.regions.flatMap((r) => r.boundaryChains);
    expect(allChains.length, 'non-vacuous: chains actually exist').toBeGreaterThan(0);
    for (const c of allChains) {
      expect(c.status, `chain "${c.id}" status`).toBe('DEFINED');
      expect(c.adopter, `chain "${c.id}" adopter`).not.toBeNull();
      expect(c.owner.startsWith('body-'), `chain "${c.id}" owner "${c.owner}" must be a K1 body region`).toBe(true);
      expect(
        (c.adopter as string).startsWith('ring-'),
        `chain "${c.id}" adopter "${c.adopter}" must be an R-STRUCT ring band`,
      ).toBe(true);
    }
    // Exactly 14 seams (7 rings x 2 sides) x 2 ChainSpec instances per seam (one on the ring's own
    // boundaryChains list, one on the bordering body's own list) = 28. body-0's z=0 edge and body-7's
    // z=H edge are the pot's own true domain boundary (rim/base), not an R-STRUCT seam — they carry
    // no ChainSpec at all (boundaryChains length 1, not 2, on exactly those two body regions).
    expect(allChains.length).toBe(28);
    const body0 = anatomy.regions.find((r) => r.id === 'body-0')!;
    const body7 = anatomy.regions.find((r) => r.id === 'body-7')!;
    expect(body0.boundaryChains).toHaveLength(1);
    expect(body0.boundaryChains[0].adopter).toBe('ring-0');
    expect(body7.boundaryChains).toHaveLength(1);
    expect(body7.boundaryChains[0].adopter).toBe('ring-6');
    for (let i = 1; i <= 6; i++) {
      const bi = anatomy.regions.find((r) => r.id === `body-${i}`)!;
      expect(bi.boundaryChains, `body-${i} borders two rings`).toHaveLength(2);
    }
    for (let i = 0; i <= 6; i++) {
      const ri = anatomy.regions.find((r) => r.id === `ring-${i}`)!;
      expect(ri.boundaryChains, `ring-${i} adopts from both neighboring bodies`).toHaveLength(2);
      expect(ri.boundaryChains[0].owner).toBe(`body-${i}`);
      expect(ri.boundaryChains[1].owner).toBe(`body-${i + 1}`);
    }
  });

  const liveIt = process.env.PF_TIERC_A1_DSCHAIN === '1' ? it : it.skip;
  liveIt(
    '3. buildStructCdtChain (DS, native manifest) produces nonManRawBig==0 non-vacuous on the assembled outer wall',
    () => {
      const manifest = getManifest('DragonScales');
      const t0 = Date.now();
      const result = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
      const buildMs = Date.now() - t0;
      // eslint-disable-next-line no-console
      console.log(
        `[a1-dschain] dispatch=${result.meta.dispatch} tris=${result.outer.idx.length / 3} ` +
          `verts=${result.outer.xyz.length / 3} in ${buildMs}ms; warnings=${result.meta.warnings.length}`,
      );
      expect(result.meta.dispatch).toBe('RSTRUCT-RCDT-chain');

      const idx = result.outer.idx;
      const stats = nonManRawBigStats(idx);
      expect(stats.nonMan, 'nonManRawBig must be 0 on the assembled DS outer wall').toBe(0);

      // Non-vacuity control: inject one duplicate triangle -> its 3 edges each go multiplicity
      // 2->3 (or new edges appear at multiplicity 1->... depending on overlap), moving the raw
      // count strictly above 0 — proves the instrument is actually discriminating, not vacuously 0.
      const cracked = new Uint32Array(idx.length + 3);
      cracked.set(idx);
      cracked.set([idx[0], idx[1], idx[2]], idx.length);
      const crackedNonMan = nonManRawBig(cracked);
      expect(crackedNonMan, 'injected duplicate triangle must move nonManRawBig above 0').toBeGreaterThan(0);
    },
    10 * 60 * 1000,
  );
});
