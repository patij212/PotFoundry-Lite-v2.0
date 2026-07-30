// research/bridge/_judgeNegativeControl.test.ts — A4: THE NEGATIVE CONTROL.
//
//   cd potfoundry-web
//   npx vitest run -c research/bridge/_judge.config.ts research/bridge/_judgeNegativeControl.test.ts
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS — THE DEEPEST OF THE FOUR HARDENING ITEMS
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// _strataFacetTruthValidate.test.ts (V1-V10) validates the RULERS against known VALUES: a cylinder whose
// sagitta is 2.249981 um by hand, a ridge that is 12.041 um by construction. That is necessary, and it is
// not what failed on 2026-07-29. What failed was the AUDIT STACK: every ruler was right and the report was
// still a false clean bill of health, because no instrument in it was a function of facet SHAPE.
//
// A ruler validated against known values does not tell you the stack around it can DETECT A BAD MESH. The
// only thing that tells you that is running the whole stack on a mesh known to be bad and requiring it to
// say so — AND on a mesh known to be good and requiring it not to. One half without the other is worthless:
// a stack that fails everything passes the first half and is useless.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// TWO LAYERS, AND THEY PROVE DIFFERENT THINGS. SAY WHICH.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// LAYER 1 — SYNTHETIC, ALWAYS RUNS, PROVES THE WIRING. Small triangle soups lifted from a real analytic
//   surface, carrying defects introduced BY CONSTRUCTION so the expected count is provable rather than
//   observed: exactly one reversed facet => exactly one minority-sign facet and exactly one back-facing
//   facet; one needle => at least one facet over the aspect cap. Every assertion is arithmetic, so nothing
//   here can be quietly "calibrated". It proves a defect reaches the gates and a clean mesh does not trip
//   them. IT DOES NOT PROVE the gates catch what the DRIVER actually produces.
//   Layer 1e additionally pins judge()'s ASYMMETRY, which is the rule this whole pass exists to enforce and
//   which was mis-implemented in the first draft (2026-07-29 review, finding 1): a CLEAN one-sided run is
//   NOT-A-VERDICT, but direction-independent evidence — a failed shape gate, or a witnessed exceedance —
//   FAILs from one direction just as it does from two, because the missing direction could only have added
//   more of it. It also pins finding 2: an EMPTY gate list blocks PASS instead of reading as "all pass".
//
// LAYER 2 — THE FROZEN DRIVER FIXTURES, THE REAL NEGATIVE CONTROL. Two meshes from the driver itself, one
//   flag apart, at a small scale:
//
//     # the DEFECT fixture — the documented EXACT restore of the pre-2026-07-29 splitter
//     cd potfoundry-web && NODE_OPTIONS=--max-old-space-size=8192 \
//       PF_STRATA_CB=1 PF_CB_STYLE=GothicArches PF_CB_STAGE=ring PF_CB_DIRECTED=1 PF_CB_SNAP=1 \
//       PF_CB_GRIDU=40 PF_CB_GRIDV=28 PF_CB_TRICAP=120000 PF_CB_ACCEPT=0.0035 \
//       PF_CB_SHAPE=0 PF_CB_MID3D=0 PF_CB_LONGFALL=0 PF_CB_TAG_SUFFIX=_NEGCTL \
//       npx vitest run --config vitest.strata.config.ts research/bridge/_strataConformBisect.test.ts
//     # -> research/exchange/_strataConformBisect/gothicarches_ring_DS-_NEGCTL.stl
//
//     # the GUARDED fixture — the SAME command with those three flags dropped (the guard defaults ON)
//     ... PF_CB_TAG_SUFFIX=_NEGFIX ...
//     # -> research/exchange/_strataConformBisect/gothicarches_ring_DS-H_NEGFIX.stl
//
//   then freeze both under research/fixtures/judge/ and point this test at them:
//     PF_JUDGE_DEFECT_STL=research/fixtures/judge/defect_guardOFF.stl \
//     PF_JUDGE_GUARDED_STL=research/fixtures/judge/guarded_guardON.stl \
//     npx vitest run -c research/bridge/_judge.config.ts research/bridge/_judgeNegativeControl.test.ts
//
//   `*.stl` is in the repo .gitignore, so freezing means `git add -f` (or a fixtures-specific negation). A
//   fixture the next session cannot obtain byte-identically is not a fixture.
//
//   LAYER 2 HAS NOT BEEN RUN. The environment this file was authored in could execute nothing, so the two
//   fixtures do not exist yet. The layer is gated on the env vars being SET — and once they are set, a
//   missing file is a HARD ERROR, never a skip. A silent skip here is the same class of failure as the
//   PF_FT_H2=0 one-directional audit this whole pass exists to close.
//
//   WHAT LAYER 2 ASSERTS ABOUT THE VERDICT, AND WHY IT RUNS THE FIXTURES THROUGH judge() WITH NO FIDELITY
//   DIRECTION AT ALL. Scoring a frozen STL is a SHAPE audit — neither H1 nor H2 runs here — so this is
//   exactly the one-sided situation finding 1 was about, on real driver output rather than a synthetic soup.
//   The guard-OFF fixture must come back **FAIL** (its failed gates are direction-independent evidence and
//   were previously withheld behind a NOT-A-VERDICT banner), and the guard-ON fixture must come back
//   **NOT-A-VERDICT** — clean gates are not a fidelity verdict, and PASS is what one-sidedness withholds.
//
// EXPECTED, FROM THE PUBLISHED CENSUSES. D51 (same guard-OFF lineage, ~23x the scale): blades AR>50 3.36 %,
// folds 2.22 %, `n . rhat < 0` 2.27 %. The 40x28 / 120 k guard-OFF control measured 1,540 blades (2.520 %).
// So the fixture is expected to fail the BLADE gate and, via the inverted population, the NORMAL gate.
// WHETHER IT ALSO FAILS THE FOLD GATE AT THAT SCALE IS UNMEASURED — folds compound with refinement depth
// (the blade fraction climbs 0.58 % -> 4.27 % within one run). If the small fixture carries no fold, DEEPEN
// THE FIXTURE UNTIL IT DOES; do not weaken the assertion. That quiet retreat is exactly what this file is
// here to prevent.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from './labkit';
import { detectThetaJumps, detectZJumps } from './_facetTruthLib';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { bladeGate, foldGate, meshShapeCensus } from './_judgeShape';
import { facetNormalCensus, normalGate } from './_judgeNormal';
import { judge, renderGates, NOT_RUN, type DirectionReading, type GateResult } from './_judgeVerdict';

const H = 120;
const TWO_PI = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const CENSUS = { arCap: 50, H, nWorst: 8 };

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

/**
 * LAYER 1's surface: a cone with a 1.5 mm 12-fold relief. Smooth — so a fine tessellation of it is a
 * legitimately clean mesh — and curved enough that the normal instrument is asked a real question rather
 * than scoring a plane.
 */
function rSynth(th: number, z: number): number {
  let t = th % TWO_PI; if (t < 0) t += TWO_PI;
  const zz = z < 0 ? 0 : z > H ? H : z;
  return 40 + 5 * (zz / H) + 1.5 * Math.sin(12 * t) * Math.sin((Math.PI * zz) / H);
}

const lift = (th: number, z: number): [number, number, number] => {
  const r = rSynth(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
};

/**
 * A parametric grid patch, wound so that BOTH the (theta,z) signed area and the 3-D normal are positive /
 * outward for every facet. Provable, not observed: with dth > 0 and dz > 0 each cell's two triangles have
 * parametric signed area exactly dth*dz, and their 3-D cross products are dth*dz*(P_theta x P_z), i.e. the
 * outward analytic normal.
 */
function buildPatch(nu: number, nv: number, th0: number, th1: number, z0: number, z1: number): { xyz: Float64Array; nTri: number } {
  const vx: number[] = []; const vy: number[] = []; const vz: number[] = [];
  const at = (i: number, j: number): number => i * (nv + 1) + j;
  for (let i = 0; i <= nu; i += 1) {
    const th = th0 + ((th1 - th0) * i) / nu;
    for (let j = 0; j <= nv; j += 1) {
      const z = z0 + ((z1 - z0) * j) / nv;
      const [x, y, zz] = lift(th, z);
      vx.push(x); vy.push(y); vz.push(zz);
    }
  }
  const nTri = 2 * nu * nv;
  const xyz = new Float64Array(nTri * 9);
  let o = 0;
  const put = (v: number): void => { xyz[o] = vx[v]; xyz[o + 1] = vy[v]; xyz[o + 2] = vz[v]; o += 3; };
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      put(at(i, j)); put(at(i + 1, j)); put(at(i + 1, j + 1));
      put(at(i, j)); put(at(i + 1, j + 1)); put(at(i, j + 1));
    }
  }
  return { xyz, nTri };
}

/** REVERSE ONE FACET'S WINDING — negates its parametric signed area AND its 3-D normal, exactly. */
function reverseFacet(xyz: Float64Array, t: number): void {
  const o = t * 9;
  for (let k = 0; k < 3; k += 1) {
    const b = xyz[o + 3 + k]; xyz[o + 3 + k] = xyz[o + 6 + k]; xyz[o + 6 + k] = b;
  }
}

/** Append a NEEDLE facet: two vertices 1e-7 apart in parameter, the third a full 0.02 rad away. */
function withNeedle(src: Float64Array, nTri: number, th0: number, z0: number): { xyz: Float64Array; nTri: number } {
  const xyz = new Float64Array((nTri + 1) * 9);
  xyz.set(src.subarray(0, nTri * 9), 0);
  const pts = [lift(th0, z0), lift(th0 + 0.02, z0), lift(th0 + 0.02 + 1e-7, z0 + 1e-7)];
  let o = nTri * 9;
  for (const p of pts) { xyz[o] = p[0]; xyz[o + 1] = p[1]; xyz[o + 2] = p[2]; o += 3; }
  return { xyz, nTri: nTri + 1 };
}

const shapeOf = (xyz: Float64Array, nTri: number) => meshShapeCensus(xyz, nTri, CENSUS);
const normalOf = (xyz: Float64Array, nTri: number) => facetNormalCensus(rSynth, xyz, nTri, { H, nWorst: 8 });

describe('judge — negative control (A4)', () => {
  // ── LAYER 1a: THE POSITIVE HALF. Without it the rest proves only that something is broken. ──
  it('a clean tessellation of a real surface passes every shape gate', () => {
    const { xyz, nTri } = buildPatch(64, 64, 0.4, 0.9, 40, 60);
    const sc = shapeOf(xyz, nTri);
    const nc = normalOf(xyz, nTri);
    expect(nTri).toBe(8192);
    expect(sc.nParNeg).toBe(0);
    expect(sc.nParZero).toBe(0);
    expect(foldGate(sc, true).count).toBe(0);
    expect(foldGate(sc, true).pass).toBe(true);
    expect(bladeGate(sc).pass).toBe(true);
    expect(nc.windSign).toBe(1);
    expect(nc.nBackFacing).toBe(0);
    expect(normalGate(nc).pass).toBe(true);
    // the tessellation really is fine enough that the instrument is answering, not reading noise
    expect(nc.degP99).toBeLessThan(10);
  });

  // ── LAYER 1b: ONE REVERSED FACET — the exact shape of the reported defect ("renders back-facing"). ──
  it('one reversed facet fails BOTH the fold gate and the normal gate, and nothing else', () => {
    const { xyz, nTri } = buildPatch(64, 64, 0.4, 0.9, 40, 60);
    reverseFacet(xyz, 4097);
    const sc = shapeOf(xyz, nTri);
    const nc = normalOf(xyz, nTri);
    const fg = foldGate(sc, true);
    const ng = normalGate(nc);
    expect(fg.applicable).toBe(true);
    expect(fg.count).toBe(1);          // provable: exactly one facet disagrees with the majority sign
    expect(fg.pass).toBe(false);
    expect(ng.applicable).toBe(true);
    expect(ng.count).toBe(1);          // provable: its normal is exactly negated, so ~180 deg
    expect(ng.pass).toBe(false);
    expect(nc.degMax).toBeGreaterThan(170);
    expect(bladeGate(sc).pass).toBe(true);   // a reversal moves no vertex, so shape is untouched
  });

  // ── LAYER 1c: A NEEDLE — the 37.6 % family of the D51 census. ──
  it('a needle facet fails the blade gate without tripping the fold gate', () => {
    const base = buildPatch(48, 48, 0.4, 0.9, 40, 60);
    const { xyz, nTri } = withNeedle(base.xyz, base.nTri, 0.5, 50);
    const sc = shapeOf(xyz, nTri);
    expect(sc.arMax).toBeGreaterThan(50);
    expect(bladeGate(sc).count).toBeGreaterThanOrEqual(1);
    expect(bladeGate(sc).pass).toBe(false);
    expect(foldGate(sc, true).pass).toBe(true);   // the needle winds positively — the gates are independent
  });

  // ── LAYER 1c-bis: PATCH PROVENANCE (P5). BOTH EXEMPTION DIRECTIONS, because a mis-registered region is
  // the provenance analogue of a mistraced locus (S10 layer 2) — same artifact-class risk, and a gate that
  // can be silenced by a badly-placed claim is worse than no gate. Same expect-nonzero discipline. ──
  const needleCentre = { theta: (0.5 + 0.52 + 0.52) / 3, z: 50 };

  it('PROVENANCE 1 — a DECLARED region covering the blade exempts it, and SHOUTS the exemption', () => {
    const base = buildPatch(48, 48, 0.4, 0.9, 40, 60);
    const { xyz, nTri } = withNeedle(base.xyz, base.nTri, 0.5, 50);
    const bare = meshShapeCensus(xyz, nTri, CENSUS);
    const sc = meshShapeCensus(xyz, nTri, {
      ...CENSUS, patches: [{ id: 'PATCH_A', theta: needleCentre.theta, z: needleCentre.z, radiusMm: 2 }],
    });
    expect(bare.nBlade).toBeGreaterThanOrEqual(1);
    expect(sc.nBlade).toBe(bare.nBlade);                    // the census still SEES every blade
    expect(sc.nBladeDeclared).toBe(bare.nBlade);            // all of them are inside the declared region
    expect(sc.nBladeUndeclared).toBe(0);
    const g = bladeGate(sc);
    expect(g.count).toBe(0);
    expect(g.pass).toBe(true);
    // the exemption must be LOUD and attributable, never a quiet subtraction
    expect(g.detail.join(' ')).toContain('PATCH PROVENANCE ACTIVE');
    expect(g.detail.join(' ')).toContain(`PATCH_A=${bare.nBlade}`);
    expect(g.title).toContain('DECLARED patch region');
  });

  it('PROVENANCE 2 — a MIS-REGISTERED region exempts NOTHING and the gate still FAILS', () => {
    const base = buildPatch(48, 48, 0.4, 0.9, 40, 60);
    const { xyz, nTri } = withNeedle(base.xyz, base.nTri, 0.5, 50);
    const bare = meshShapeCensus(xyz, nTri, CENSUS);
    // a region of the SAME size, declared 10 mm away in z — the analogue of a mistraced locus
    const sc = meshShapeCensus(xyz, nTri, {
      ...CENSUS, patches: [{ id: 'PATCH_MISPLACED', theta: needleCentre.theta, z: needleCentre.z + 10, radiusMm: 2 }],
    });
    expect(sc.nBladeDeclared).toBe(0);                       // it covers nothing it did not earn
    expect(sc.nBladeUndeclared).toBe(bare.nBlade);
    const g = bladeGate(sc);
    expect(g.count).toBe(bare.nBlade);
    expect(g.pass).toBe(false);                              // *** THE GATE KEEPS ITS TEETH ***
    expect(g.detail.join(' ')).toContain('PATCH_MISPLACED=0');
  });

  it('PROVENANCE 3 — with two blades, declaring ONE leaves the other counted', () => {
    const base = buildPatch(48, 48, 0.4, 0.9, 40, 60);
    const one = withNeedle(base.xyz, base.nTri, 0.5, 50);
    const two = withNeedle(one.xyz, one.nTri, 1.7, 50);      // a second needle elsewhere
    const bare = meshShapeCensus(two.xyz, two.nTri, CENSUS);
    expect(bare.nBlade).toBeGreaterThanOrEqual(2);
    const sc = meshShapeCensus(two.xyz, two.nTri, {
      ...CENSUS, patches: [{ id: 'PATCH_A', theta: needleCentre.theta, z: 50, radiusMm: 2 }],
    });
    expect(sc.nBladeDeclared).toBeGreaterThanOrEqual(1);
    expect(sc.nBladeUndeclared).toBeGreaterThanOrEqual(1);
    expect(sc.nBladeDeclared + sc.nBladeUndeclared).toBe(bare.nBlade);
    const g = bladeGate(sc);
    expect(g.count).toBe(sc.nBladeUndeclared);
    expect(g.pass).toBe(false);                              // an UNDECLARED blade still fails
  });

  it('PROVENANCE 4 — with NO regions declared the gate is byte-for-byte what it always was', () => {
    const base = buildPatch(48, 48, 0.4, 0.9, 40, 60);
    const { xyz, nTri } = withNeedle(base.xyz, base.nTri, 0.5, 50);
    const sc = meshShapeCensus(xyz, nTri, CENSUS);
    expect(sc.nBladeDeclared).toBe(0);
    // with nothing declared, every blade IS undeclared — that is the honest reading, and the first draft
    // of this assertion said 0, which was wrong about the semantics rather than about the code.
    expect(sc.nBladeUndeclared).toBe(sc.nBlade);
    expect(sc.declaredHits).toHaveLength(0);
    const g = bladeGate(sc);
    expect(g.count).toBe(sc.nBlade);                         // the ORIGINAL gate count, unchanged
    expect(g.pass).toBe(false);
    expect(g.detail.join(' ')).not.toContain('PATCH PROVENANCE');
    expect(g.title).not.toContain('DECLARED');
  });

  // ── LAYER 1d: THE GATE REFUSES RATHER THAN LIES on a mesh that is not a graph. ──
  it('the fold gate refuses (NOT APPLICABLE, which is NOT a pass) on a non-graph mesh', () => {
    const { xyz, nTri } = buildPatch(64, 64, 0.4, 0.9, 40, 60);
    for (let t = nTri / 2; t < nTri; t += 1) reverseFacet(xyz, t);
    const sc = shapeOf(xyz, nTri);
    expect(sc.ambiguous).toBe(true);
    const fg = foldGate(sc, true);
    expect(fg.applicable).toBe(false);
    expect(fg.pass).toBe(false);
    // an explicit declaration refuses too, without leaning on the heuristic
    const clean = buildPatch(16, 16, 0.4, 0.9, 40, 60);
    const declared = foldGate(shapeOf(clean.xyz, clean.nTri), false);
    expect(declared.applicable).toBe(false);
    expect(declared.pass).toBe(false);
  });

  // ── LAYER 1e: A3 — a one-directional run cannot PASS, and still FAILs on what it can prove. ──
  it('judge() withholds PASS from one direction but still FAILs on direction-independent evidence', () => {
    const good: GateResult = { id: 'X', title: 'x', applicable: true, count: 0, expected: 0, pass: true, detail: [] };
    const h1: DirectionReading = {
      ran: true, complete: true, certified: true, witnessedMm: 0.001, boundMm: 0.002, coverage: 'all',
    };
    const oneSided = judge({ tolMm: 0.01, gates: [good], h1, h2: NOT_RUN });
    expect(oneSided.verdict).toBe('NOT-A-VERDICT');
    const text = oneSided.lines.join('\n');
    expect(text).toContain('NOT A VERDICT');
    expect(text).not.toMatch(/\*\*\* FAIL \*\*\*/);
    expect(text).not.toMatch(/^\s*PASS\b/m);

    // both directions, complete, certified, under tol, gates clean => the only shape of PASS there is
    const h2: DirectionReading = {
      ran: true, complete: true, certified: false, witnessedMm: 0.004, boundMm: Infinity, coverage: 'all',
    };
    expect(judge({ tolMm: 0.01, gates: [good], h1, h2 }).verdict).toBe('PASS');

    // a failed gate is a FAIL even with perfect fidelity numbers
    const bad: GateResult = { ...good, count: 7, pass: false };
    expect(judge({ tolMm: 0.01, gates: [bad], h1, h2 }).verdict).toBe('FAIL');

    // a gate that could not be evaluated blocks PASS without manufacturing a FAIL
    const blocked: GateResult = { ...good, applicable: false, pass: false };
    expect(judge({ tolMm: 0.01, gates: [blocked], h1, h2 }).verdict).toBe('NOT-A-VERDICT');

    // partial coverage cannot PASS, but a witnessed exceedance still FAILs from partial coverage
    const partial: DirectionReading = { ...h1, complete: false };
    expect(judge({ tolMm: 0.01, gates: [good], h1: partial, h2 }).verdict).toBe('NOT-A-VERDICT');
    const over: DirectionReading = { ...partial, witnessedMm: 0.4 };
    expect(judge({ tolMm: 0.01, gates: [good], h1: over, h2 }).verdict).toBe('FAIL');

    // ── FINDING 1 (2026-07-29 review). WHAT ONE-SIDEDNESS WITHHOLDS IS *PASS*, NOT *FAIL*. ──
    // A shape gate reads the whole mesh; it does not become less true because the other fidelity direction
    // was not measured. The first draft returned NOT-A-VERDICT here and printed the failure underneath the
    // banner as a "diagnostic", so a mesh with 31,842 proven folds audited one-sided read "inconclusive".
    const oneSidedBadGate = judge({ tolMm: 0.01, gates: [bad], h1, h2: NOT_RUN });
    expect(oneSidedBadGate.verdict).toBe('FAIL');
    expect(oneSidedBadGate.lines.join('\n')).toMatch(/\*\*\* FAIL \*\*\*/);
    expect(oneSidedBadGate.reasons.join('; ')).toContain('gate X failed');
    // ...and the same for a witnessed exceedance, which is a real measured distance whatever else ran.
    const oneSidedOver = judge({ tolMm: 0.01, gates: [good], h1: over, h2: NOT_RUN });
    expect(oneSidedOver.verdict).toBe('FAIL');
    // NON-VACUITY OF THE ABOVE: with the SAME single direction and NOTHING wrong, it is still not a verdict.
    expect(judge({ tolMm: 0.01, gates: [good], h1, h2: NOT_RUN }).verdict).toBe('NOT-A-VERDICT');

    // ── FINDING 2. ZERO GATES EVALUATED IS NOT "ALL GATES PASS". ──
    // Perfect fidelity numbers in both directions, and an empty gate list: that is a wiring bug, not a PASS.
    const noGates = judge({ tolMm: 0.01, gates: [], h1, h2 });
    expect(noGates.gatesPass).toBe(false);
    expect(noGates.verdict).toBe('NOT-A-VERDICT');
    expect(noGates.reasons.join('; ')).toContain('NO GATES WERE EVALUATED');
    // renderGates must not print ALL PASS over an empty list either — the report and the verdict agree.
    const emptyBlock = renderGates([]);
    expect(emptyBlock.pass).toBe(false);
    expect(emptyBlock.lines.join('\n')).toContain('NO GATES WERE EVALUATED');

    // ── FINDING 3. A PASS MUST BE ACHIEVABLE, AND IT MUST CARRY ITS RESOLVING POWER. ──
    // The H2 blocker used to be keyed on phase-B exhaustion, which is truncated in essentially every real
    // run, so PASS was dead code. `complete` is now phase-A coverage of the full band; the resolving-power
    // string travels into the PASS block so the number cannot be quoted without it.
    const passOut = judge({ tolMm: 0.01, gates: [good], h1, h2 });
    expect(passOut.verdict).toBe('PASS');
    expect(passOut.lines.join('\n')).toContain('RESOLVING POWER');
  });

  // ── LAYER 2: THE FROZEN DRIVER FIXTURES. Env-gated on the paths; LOUD when a named file is missing. ──
  const DEFECT = process.env.PF_JUDGE_DEFECT_STL ?? '';
  const GUARDED = process.env.PF_JUDGE_GUARDED_STL ?? '';
  const FIXSTYLE = process.env.PF_JUDGE_STYLE ?? 'GothicArches';
  it.runIf(DEFECT !== '' && GUARDED !== '')(
    // NOT "…and PASSES the guard-ON one" — and as of 2026-07-30 not even "clears every gate on it": the
    // guard-ON lineage fails the NORMAL gate on its surviving sliver class (see the measured block below).
    // Naming any of this "passes" is precisely the slippage between "no defect found" and "certified" that
    // this whole pass exists to remove.
    'the hardened audit FAILS the guard-OFF driver fixture and FAILS the guard-ON one on the surviving sliver class',
    () => {
      for (const p of [DEFECT, GUARDED]) {
        if (existsSync(p)) continue;
        throw new Error(
          `negative-control fixture missing: ${p}\n`
          + "  It is not optional and it must not be skipped — this file's header carries the exact driver\n"
          + '  commands that regenerate it. A silent skip here is the same class of failure as the\n'
          + '  PF_FT_H2=0 one-directional audit this hardening pass exists to close.');
      }
      // THE FIXTURES ARE SCORED AGAINST THE SURFACE THEY WERE MESHED ON — the same buildAuditRadiusFn the
      // H1/H2 auditor uses, not layer 1's synthetic surface. A normal deviation measured against the wrong
      // surface is a fully formatted, entirely meaningless number.
      const params = { ...registryDefaults(FIXSTYLE) };
      if (process.env.PF_JUDGE_PARAMS !== undefined) Object.assign(params, JSON.parse(process.env.PF_JUDGE_PARAMS) as Record<string, number>);
      const rA = buildAuditRadiusFn(FIXSTYLE, params, DIMS, H).rA;
      const zJumps = detectZJumps(rA, H);
      const thJumps = detectThetaJumps(rA, H);
      // `bladeGate` is called WITHOUT a guard cap on purpose: one fixture was built with the driver guard OFF
      // and one with it ON, so a single declared cap would attach a provenance claim to a mesh that had no
      // guard at all. Provenance attribution belongs to the audit of a single known run (PF_FT_GUARD_AR in
      // _strataFacetTruth.test.ts), not to this A/B.
      const score = (path: string) => {
        const m = readMeshFloat64(path, false);
        const sc = meshShapeCensus(m.xyz, m.nTri, CENSUS);
        const nc = facetNormalCensus(rA, m.xyz, m.nTri, { H, zJumps, thJumps, nWorst: 8 });
        return { sc, nc, fold: foldGate(sc, true), norm: normalGate(nc), blade: bladeGate(sc) };
      };

      const bad = score(DEFECT);
      // eslint-disable-next-line no-console
      console.log(`DEFECT  ${DEFECT}\n  tris ${bad.sc.nTri}  FOLD ${bad.fold.count}  NORMAL ${bad.norm.count}  BLADE ${bad.blade.count}  normal p99 ${bad.nc.degP99.toFixed(3)} deg  max ${bad.nc.degMax.toFixed(3)} deg`);
      expect(bad.fold.pass).toBe(false);
      expect(bad.norm.pass).toBe(false);
      // THE VERDICT, WITH NEITHER FIDELITY DIRECTION RUN (finding 1, on real driver output). This is a shape
      // audit of a frozen STL, so H1 and H2 are both NOT RUN — and a failed shape gate is still a proven
      // defect of the whole mesh. FAIL, not "inconclusive".
      const badVerdict = judge({
        tolMm: 0.01, gates: [bad.fold, bad.norm, bad.blade], h1: NOT_RUN, h2: NOT_RUN,
      });
      expect(badVerdict.verdict).toBe('FAIL');
      expect(badVerdict.lines.join('\n')).toMatch(/\*\*\* FAIL \*\*\*/);

      const ok = score(GUARDED);
      // eslint-disable-next-line no-console
      console.log(`GUARDED ${GUARDED}\n  tris ${ok.sc.nTri}  FOLD ${ok.fold.count}  NORMAL ${ok.norm.count}  BLADE ${ok.blade.count}  normal p99 ${ok.nc.degP99.toFixed(3)} deg  max ${ok.nc.degMax.toFixed(3)} deg`);
      // NON-VACUITY, AS MEASURED 2026-07-30 — NOT AS ORIGINALLY HOPED. The fold and blade gates must clear
      // the guarded mesh: they do, and that is meaningful (they cannot be false-positived by a guard-ON
      // mesh). The NORMAL gate was expected to clear too. IT DOES NOT, AND THE FAILURE IS TRUE: a
      // sliver-pinch population SURVIVES the split guard — sub-cap 3-D slivers and chart-degenerate facets
      // at feature junctions, back-facing against the analytic normal EVERYWHERE in their own footprint.
      // Confirmed three ways on 2026-07-30: this gate (guard-ON 700k fixture: 4,236; D52 at 1.26M: 7,838 =
      // 0.62%), the shape census's unbounded parametric AR tail (p99 313, max 9.9e6), and a HUMAN VIEWER
      // seeing red back-facing slivers on D52 itself — the same instrument-vs-eye agreement that opened
      // this campaign's retraction, now pointing at the residual class. A driver mesh that genuinely
      // clears this gate does not exist yet; when one does, flip these two expectations back to
      // pass=true / count 0 and record the lineage that earned it.
      expect(ok.fold.pass).toBe(true);
      expect(ok.blade.pass).toBe(true);
      expect(ok.norm.pass).toBe(false);
      expect(ok.norm.count).toBeGreaterThan(0);
      // A failed gate is direction-independent evidence, so the guarded fixture's verdict is FAIL — the
      // judge condemns BOTH of today's driver lineages, guard-OFF on folds+normals+blades, guard-ON on the
      // surviving sliver class alone. What it must never do is PASS a mesh nobody measured: with both
      // fidelity directions NOT RUN, no combination of gate outcomes may produce a PASS line.
      const okVerdict = judge({
        tolMm: 0.01, gates: [ok.fold, ok.norm, ok.blade], h1: NOT_RUN, h2: NOT_RUN,
      });
      expect(okVerdict.verdict).toBe('FAIL');
      expect(okVerdict.lines.join('\n')).not.toMatch(/^\s*PASS\b/m);
    },
    30 * 60 * 1000,
  );
});
