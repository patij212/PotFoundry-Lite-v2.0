// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// s29Accept.ts — THE S29 ACCEPT-OVERRIDE: membership, the honest accept test, and the SINK GUARD.
// RESEARCH ONLY. Nothing under src/, no untouchable, no judge.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// THE RULE, and this file implements only the second conjunct:
//     accept(t)  <=>  blindAccept(t)  AND  ( listed(t) ? perp(t) <= 10 um : true )
// The plane ruler still RANKS. The heap key, `acceptTol`, the escalation, the conformance-first ordering
// and the h-0 jump routing are untouched. An unlisted facet takes a bit-identical path — nothing in this
// file is consulted for it.
//
// WHY THIS LIVES OUTSIDE THE DRIVER. `_strataConformBisect.test.ts` is 4,953 lines and is the one file this
// arm edits. Everything that can be built and tested without it, is. The driver's diff is a flag, a load, a
// membership test at two accept sites and a report block.
//
// ── MEMBERSHIP IS SPATIAL, AND IT HAS TO BE. THIS IS THE ONE DEVIATION FROM THE REGISTRATION'S LETTER, AND
// ── IT IS DECLARED RATHER THAN QUIETLY TAKEN.
// The registration names the membership by `tri` — 14,328 triangle indices into
// `gothicarches_ring_DS-HT_S24i2.stl`. THE DRIVER DOES NOT HAVE THAT MESH. It builds from scratch on a
// 200x140 grid and refines (the registration's own "WHY FROM SCRATCH AND NOT RESUMED"), so its triangle
// indices have no relation whatever to the STL's. A `tri`-keyed membership is not merely inconvenient here,
// it is undefined. So membership is carried the way `PF_CB_TIGHTEN` carries its field and for exactly the
// same reason: as a REGION in (theta, z), derived from the members' own recorded geometry by
// `research/tools/s29Members.py --emit` — the validated probe that produced the registration's numbers —
// and measured there at 1.754% of the (theta,z) domain against a member facet-area share of ~1.9%. The
// `tri` values are carried through for audit and for the sink guard's entry readings.
//
// INHERITANCE COMES FREE AND EXACT. The registration asks that "a child of a listed facet is listed". A
// child's (theta,z) footprint is contained in its parent's, so a child of a listed facet whose geometry is
// still in the member region tests listed with no bookkeeping at all; and a child of an UNLISTED facet can
// never test listed, because its parent's box already met no member cell. The only difference from strict
// parent->child propagation is a child that has left the region entirely, which propagation would keep
// listed and this does not. That is the narrower set, it is the geometrically correct one — the region is
// where the certificate measured the error — and it is reported (`listedFacets`) so the registration's
// "at 14,328 named facets and nowhere else" stays checkable rather than asserted.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { s29PerpTriangle, type RadiusFn } from './s29Perp';

const TWO_PI = 2 * Math.PI;

export interface S29MembersFile {
  schema: string;
  run: { key: string; style: string; stage: string; tolMm: number };
  tolUm: number;
  complete: boolean;
  truncated: boolean;
  counts: { over: number; rim: number; interior: number; cage: number; members: number };
  cellGrid: { dTheta: number; dZ: number; nTheta: number; nZ: number; cells: number; surfaceFractionPct: number };
  sinkGuard: { dTheta: number; dZ: number; budgetN: number; fallRatio: number; sites: number };
  cells: number[];
  sites: { iTh: number; iZ: number; n: number; entryUm: number }[];
  members: { tri: number; boundUm: number; theta: number; zMin: number; zMax: number; owner: string }[];
  source: { stl: string; stlMd5: string };
}

export interface StrandRecord {
  iTh: number; iZ: number; theta: number; z: number;
  entryUm: number; bestUm: number; splits: number; members: number; ratio: number;
}

export interface S29Override {
  /** Is this triangle's (theta,z) footprint inside the member region and not on a stranded site? */
  listed(thA: number, thB: number, thC: number, zA: number, zB: number, zC: number): boolean;
  /** The honest accept test. Memoised per triangle index. */
  perpOk(
    tri: number, rA: RadiusFn, H: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ): boolean;
  strands(): StrandRecord[];
  stats(): {
    listedTests: number; listedHits: number; perpEvals: number; perpRejects: number; memoHits: number;
    rAEvals: number; strandedSites: number; strandedMembers: number;
    worstDTheta: number; worstDz: number; maxPerpUm: number;
  };
  file: S29MembersFile;
}

/** PROVENANCE IS REFUSED, NOT WARNED ABOUT — the `PF_CB_TIGHTEN` discipline, verbatim. */
export function verifyMembersProvenance(
  f: S29MembersFile,
  expect: { key: string; style: string; stage: string; tolMm: number },
): string[] {
  const out: string[] = [];
  if (f.schema !== 'pf.strata.s29.members/1') out.push(`schema: '${f.schema}' != 'pf.strata.s29.members/1'`);
  if (f.run.key !== expect.key) {
    out.push(`key: file '${f.run.key}' != run '${expect.key}'`);
    if (f.run.style !== expect.style) out.push(`  style: '${f.run.style}' != '${expect.style}'`);
    if (f.run.stage !== expect.stage) out.push(`  stage: '${f.run.stage}' != '${expect.stage}'`);
    if (f.run.tolMm !== expect.tolMm) out.push(`  tol: ${f.run.tolMm} != ${expect.tolMm}`);
  }
  if (!f.complete) out.push('complete: false — this membership is not a complete enumeration');
  if (f.truncated) out.push('truncated: true — this membership was cut off');
  if (f.members.length !== f.counts.members) {
    out.push(`members: ${f.members.length} serialized != ${f.counts.members} counted — a prefix, not a set`);
  }
  if (f.sites.length !== f.sinkGuard.sites) {
    out.push(`sites: ${f.sites.length} serialized != ${f.sinkGuard.sites} counted`);
  }
  if (f.cells.length !== f.cellGrid.cells) {
    out.push(`cells: ${f.cells.length} serialized != ${f.cellGrid.cells} counted`);
  }
  return out;
}

export function loadS29Override(
  path: string,
  expect: { key: string; style: string; stage: string; tolMm: number },
  opts: { barMm?: number } = {},
): S29Override {
  const f = JSON.parse(readFileSync(path, 'utf8')) as S29MembersFile;
  const mism = verifyMembersProvenance(f, expect);
  if (mism.length > 0) {
    throw new Error(`PF_CB_ACCEPT_OVERRIDE=${path} does not match this run:\n  ${mism.join('\n  ')}`);
  }
  const bar = opts.barMm ?? f.tolUm / 1000;

  const { dTheta: cdT, dZ: cdZ, nTheta: cnT, nZ: cnZ } = f.cellGrid;
  const mask = new Uint8Array(cnT * cnZ);
  for (const c of f.cells) mask[c] = 1;

  // ── SINK GUARD state, per registered site (dTheta 0.02 rad x dZ 0.5 mm).
  const { dTheta: sdT, dZ: sdZ, budgetN, fallRatio } = f.sinkGuard;
  const siteKey = (iTh: number, iZ: number): number => iTh * 100000 + iZ;
  const site = new Map<number, { iTh: number; iZ: number; entryUm: number; bestUm: number; splits: number; members: number; stranded: boolean }>();
  for (const s of f.sites) {
    site.set(siteKey(s.iTh, s.iZ), {
      iTh: s.iTh, iZ: s.iZ, entryUm: s.entryUm, bestUm: Number.POSITIVE_INFINITY,
      splits: 0, members: s.n, stranded: false,
    });
  }
  const stranded: StrandRecord[] = [];

  let listedTests = 0; let listedHits = 0;
  let perpEvals = 0; let perpRejects = 0; let rAEvals = 0;
  let worstDTheta = 0; let worstDz = 0; let maxPerpUm = 0;
  const memo = new Map<string, number>();
  let memoHits = 0;

  /** unwrap the three vertex thetas onto a common branch, then take the box */
  const box = (thA: number, thB: number, thC: number, zA: number, zB: number, zC: number): {
    t0: number; t1: number; z0: number; z1: number;
  } => {
    let b = thB; let c = thC;
    while (b - thA > Math.PI) b -= TWO_PI;
    while (b - thA < -Math.PI) b += TWO_PI;
    while (c - thA > Math.PI) c -= TWO_PI;
    while (c - thA < -Math.PI) c += TWO_PI;
    return {
      t0: Math.min(thA, b, c), t1: Math.max(thA, b, c),
      z0: Math.min(zA, zB, zC), z1: Math.max(zA, zB, zC),
    };
  };

  const nThSite = Math.round(TWO_PI / sdT);
  /**
   * The site a facet is charged to. Exact bin first, then the 3x3 neighbourhood.
   *
   * WHY THE FALLBACK IS NOT COSMETIC. Sites exist only where the membership put them, and a facet is
   * LISTED by the (theta,z) cell region, which is a different and slightly larger object. A facet whose
   * centroid landed one bin off an occupied site was charged to NOTHING: not counted, not observed, and
   * therefore invisible to the tripwire. Measured by the G1 self-test, which recorded ZERO strands on a
   * synthetic site engineered so the tripwire could not do anything else. A guard with a hole in exactly
   * the population it is guarding is the S5b defect again, so the lookup snaps to the nearest occupied
   * site instead of silently dropping the charge.
   */
  const siteAt = (th: number, z: number): ReturnType<typeof site.get> => {
    const t = ((th % TWO_PI) + TWO_PI) % TWO_PI;
    const i0 = Math.round(t / sdT); const j0 = Math.round(z / sdZ);
    const exact = site.get(siteKey(i0, j0));
    if (exact !== undefined) return exact;
    for (let di = -1; di <= 1; di += 1) {
      const ii = ((i0 + di) % nThSite + nThSite) % nThSite;
      for (let dj = -1; dj <= 1; dj += 1) {
        const s = site.get(siteKey(ii, j0 + dj));
        if (s !== undefined) return s;
      }
    }
    return undefined;
  };

  const listed = (thA: number, thB: number, thC: number, zA: number, zB: number, zC: number): boolean => {
    listedTests += 1;
    const bx = box(thA, thB, thC, zA, zB, zC);
    const j0 = Math.max(0, Math.floor(bx.z0 / cdZ));
    const j1 = Math.min(cnZ - 1, Math.floor(bx.z1 / cdZ));
    if (j1 < j0) return false;
    const i0 = Math.floor(bx.t0 / cdT);
    const i1 = Math.floor(bx.t1 / cdT);
    // a facet spanning the whole ring would sweep every column; the driver never makes one, but cap anyway
    const span = Math.min(i1 - i0, cnT - 1);
    for (let k = 0; k <= span; k += 1) {
      const ii = (((i0 + k) % cnT) + cnT) % cnT;
      const base = ii * cnZ;
      for (let j = j0; j <= j1; j += 1) {
        if (mask[base + j] === 1) {
          // A STRANDED SITE REVERTS TO BLIND ACCEPT — that is what re-stranding means, and the loop
          // continues rather than stalling on it.
          const s = siteAt((bx.t0 + bx.t1) / 2, (bx.z0 + bx.z1) / 2);
          if (s !== undefined && s.stranded) return false;
          listedHits += 1;
          return true;
        }
      }
    }
    return false;
  };

  const perpOk = (
    tri: number, rA: RadiusFn, H: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ): boolean => {
    // ── KEYED BY GEOMETRY, NOT BY TRIANGLE INDEX.
    // The index-keyed memo missed almost everything it existed to catch. The driver's conformity and
    // cleanup stages — collapse, flip, re-mesh, the nudge ladder — DESTROY AND RE-CREATE facets with the
    // SAME THREE VERTICES under NEW indices, and a facet re-offered under a new index looked brand new and
    // was re-measured from scratch at ~4,740 rA evaluations a time. `consider` is also called on the same
    // triangle repeatedly across generations. The key is the canonical (order-independent) vertex triple,
    // quantised to 1 nm — far below the 50 nm weld wall, so two facets that quantise together are the same
    // facet, not merely close ones.
    const q = (v: number): number => Math.round(v * 1e6);
    const k1 = `${q(ax)},${q(ay)},${q(az)}`;
    const k2 = `${q(bx)},${q(by)},${q(bz)}`;
    const k3 = `${q(cx)},${q(cy)},${q(cz)}`;
    const key = k1 < k2
      ? (k2 < k3 ? `${k1}|${k2}|${k3}` : k1 < k3 ? `${k1}|${k3}|${k2}` : `${k3}|${k1}|${k2}`)
      : (k1 < k3 ? `${k2}|${k1}|${k3}` : k2 < k3 ? `${k2}|${k3}|${k1}` : `${k3}|${k2}|${k1}`);
    const hit = memo.get(key);
    if (hit !== undefined) { memoHits += 1; return hit <= bar; }
    perpEvals += 1;
    const r = s29PerpTriangle(rA, ax, ay, az, bx, by, bz, cx, cy, cz, { H, tol: bar });
    memo.set(key, r.witnessed);
    rAEvals += r.cost;
    if (r.worstDTheta > worstDTheta) worstDTheta = r.worstDTheta;
    if (r.worstDz > worstDz) worstDz = r.worstDz;
    const um = r.witnessed * 1000;
    if (um > maxPerpUm) maxPerpUm = um;

    // ── SINK GUARD. Observe the reading, charge the demand, trip on a site that is not improving.
    const th = Math.atan2((ay + by + cy) / 3, (ax + bx + cx) / 3);
    const s = siteAt(th, (az + bz + cz) / 3);
    if (s !== undefined) {
      if (r.witnessed > bar) {
        // *** THE SITE'S READING IS OBSERVED ONLY FROM FACETS STILL OVER THE BAR, AND THAT IS WHAT GIVES
        // *** THIS GUARD TEETH.
        // The first wiring updated `bestUm` from EVERY evaluation. An accepted facet at the site reads
        // <= 10 um by definition, so `bestUm` collapsed to <= 10 um immediately, `bestUm > entryUm/1.5`
        // was then false for every site whose entry exceeded 15 um — i.e. for essentially the whole
        // membership — and THE TRIPWIRE COULD NOT FIRE AT ALL. That is S28's toothless S5b defect exactly:
        // a check whose probes cannot reach the regime it is meant to detect. Caught by the smoke run
        // BEFORE the iterate, which is why the smoke run exists.
        // Restricted to the over-bar population, the statistic means what the registration says: how far
        // the STILL-FAILING facets at this site have come down from the site's entry reading. Refinement
        // that works drives them toward the bar (a fall of entry/10, far past 1.5x); a true h1 sink leaves
        // them near entry, and the site re-strands.
        if (um < s.bestUm) s.bestUm = um;
        s.splits += 1;
        // "a site that consumes more than N splits without its reading falling >= 1.5x RE-STRANDS into a
        // named list, its facets revert to blind accept, and THE LOOP CONTINUES."
        if (!s.stranded && s.splits > budgetN && s.bestUm > s.entryUm / fallRatio) {
          s.stranded = true;
          stranded.push({
            iTh: s.iTh, iZ: s.iZ, theta: s.iTh * sdT, z: s.iZ * sdZ,
            entryUm: s.entryUm, bestUm: s.bestUm, splits: s.splits, members: s.members,
            ratio: s.entryUm / Math.max(s.bestUm, 1e-9),
          });
        }
      }
    }
    if (r.witnessed > bar) perpRejects += 1;
    return r.witnessed <= bar;
  };

  return {
    listed,
    perpOk,
    strands: () => stranded,
    stats: () => ({
      listedTests, listedHits, perpEvals, perpRejects, memoHits, rAEvals,
      strandedSites: stranded.length,
      strandedMembers: stranded.reduce((a, s) => a + s.members, 0),
      worstDTheta, worstDz, maxPerpUm,
    }),
    file: f,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// SELF-TEST — THE SINK GUARD MUST BE SEEN TO FIRE, AND TO STAY QUIET.
//   node research/bridge/out/_run_s29accept.cjs --selftest
//
// "A check that asserts a zero is worth nothing until something has been seen to make it fire." The
// registration makes the strand count the ADJUDICATOR between its two registered outcomes, so a guard that
// cannot fire would not merely be untested — it would silently convert "not density-closable" into
// "closable", which is the whole question this arm exists to decide.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

export function selftest(): number {
  /* eslint-disable no-console */
  const { writeFileSync, mkdtempSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const { tmpdir } = require('node:os') as typeof import('node:os');

  const R0 = 45; const H = 120;
  const cyl: RadiusFn = () => R0;
  const KEY = 'SELFTEST|x=1|H=120,Rb=40,Rt=50,expn=1|tol=0.01|stage=ring';
  const CDT = 0.002; const CDZ = 0.1;
  const nT = Math.round(TWO_PI / CDT); const nZ = Math.round(120 / CDZ);
  const SDT = 0.02; const SDZ = 0.5;
  const N = 128; const FALL = 1.5;

  let fails = 0;
  const ok = (pass: boolean, label: string, detail: string): void => {
    if (!pass) fails += 1;
    console.log(`  ${pass ? 'PASS' : '**FAIL**'}  ${label}  ${detail}`);
  };

  /**
   * A SMALL triangle pushed `dMm` inward of the cylinder, so every point of it sits `dMm` from the surface
   * and the perpendicular reading is `dMm` REGARDLESS OF THE TRIANGLE'S SIZE. A chord triangle would tie
   * the reading to the angular span (sagitta = R(1-cos(dth/2))), which forces a 0.06 rad facet to get a
   * 20 um reading — and 0.06 rad is three sink-guard sites wide, so the charge lands in the wrong bin and
   * the test measures the binning instead of the tripwire. Decoupling the two is the point.
   */
  const tri = (t0: number, z0: number, dMm: number): number[] => {
    const r = R0 - dMm; const w = 0.002; // ~0.09 mm of arc — comfortably inside one 0.02 rad site
    return [
      r * Math.cos(t0), r * Math.sin(t0), z0,
      r * Math.cos(t0 + w), r * Math.sin(t0 + w), z0,
      r * Math.cos(t0 + w / 2), r * Math.sin(t0 + w / 2), z0 + 0.05,
    ];
  };

  const build = (entryUm: number): S29Override => {
    const th = 1.0; const z = 60;
    const cells: number[] = [];
    const i0 = Math.floor((th - 0.02) / CDT); const i1 = Math.floor((th + 0.02) / CDT);
    const j0 = Math.floor((z - 0.5) / CDZ); const j1 = Math.floor((z + 0.5) / CDZ);
    for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) cells.push(((i % nT) + nT) % nT * nZ + j);
    const uniq = [...new Set(cells)].sort((a, b) => a - b);
    const doc = {
      schema: 'pf.strata.s29.members/1',
      run: { key: KEY, style: 'SELFTEST', stage: 'ring', tolMm: 0.01 },
      tolUm: 10, complete: true, truncated: false,
      counts: { over: 1, rim: 0, interior: 1, cage: 0, members: 1 },
      cellGrid: { dTheta: CDT, dZ: CDZ, nTheta: nT, nZ, cells: uniq.length, surfaceFractionPct: 0 },
      sinkGuard: { dTheta: SDT, dZ: SDZ, budgetN: N, fallRatio: FALL, sites: 1 },
      cells: uniq,
      sites: [{ iTh: Math.round(th / SDT), iZ: Math.round(z / SDZ), n: 1, entryUm }],
      members: [{ tri: 0, boundUm: entryUm, theta: th, zMin: z, zMax: z, owner: 'mid-chord' }],
      source: { stl: 'selftest', stlMd5: '0'.repeat(32) },
    };
    const dir = mkdtempSync(join(tmpdir(), 's29self-'));
    const p = join(dir, 'members.json');
    writeFileSync(p, JSON.stringify(doc));
    return loadS29Override(p, { key: KEY, style: 'SELFTEST', stage: 'ring', tolMm: 0.01 });
  };

  console.log('=== S29 ACCEPT-OVERRIDE — SINK GUARD SELF-TEST ===');

  // ── G0: membership is reachable at all, and NOT reachable outside the region.
  {
    const ov = build(25);
    const inside = ov.listed(1.0, 1.0 + 1e-4, 1.0 + 5e-5, 60, 60, 60.02);
    const outside = ov.listed(4.0, 4.0 + 1e-4, 4.0 + 5e-5, 20, 20, 20.02);
    ok(inside && !outside, 'G0 membership is a REGION, not everything',
      `inside ${inside}  outside ${outside}`);
  }

  // ── G1: THE GUARD FIRES. 200 distinct facets at one site, all reading 20.000 um against an entry of
  //       25 um. 20.000 > 25/1.5 = 16.67, so the reading has NOT fallen and the site must re-strand.
  {
    const ov = build(25);
    // 200 DISTINCT facets inside ONE site. They must differ in GEOMETRY, not merely in index: the memo is
    // keyed by the canonical vertex triple, so 200 indices of one facet is now ONE evaluation and one
    // charge — which is precisely what the cache is for, and it made the first version of this bar read
    // zero strands. Stepping theta by 1e-5 rad (~450 nm of arc, far above the 1 nm memo quantisation and
    // far below the 0.02 rad site) keeps every one of them in the same site at the same 20.000 um reading.
    for (let i = 0; i < 200; i += 1) {
      const t = tri(1.0 + i * 1e-5, 60, 0.020);
      ov.perpOk(i, cyl, H, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
    }
    const st = ov.strands();
    ok(st.length === 1 && st[0].splits === N + 1, 'G1 a non-falling site RE-STRANDS at N+1',
      st.length === 1
        ? `entry ${st[0].entryUm.toFixed(3)} -> best ${st[0].bestUm.toFixed(3)} um (x${st[0].ratio.toFixed(2)}) after ${st[0].splits} splits`
        : `strands ${st.length} — THE TRIPWIRE DID NOT FIRE`);
    // and the facets revert to blind accept: `listed` must now refuse the site
    ok(!ov.listed(1.0, 1.0 + 1e-4, 1.0 + 5e-5, 60, 60, 60.02),
      'G1 a stranded site REVERTS TO BLIND ACCEPT (the loop continues)', 'listed() now false');
  }

  // ── G2: THE GUARD STAYS QUIET when the reading HAS fallen. Same 200 facets, same bar, but an entry of
  //       100 um: 20.000 < 100/1.5 = 66.7, so refinement is working and no strand is recorded.
  {
    const ov = build(100);
    for (let i = 0; i < 200; i += 1) {
      const t = tri(1.0 + i * 1e-5, 60, 0.020);
      ov.perpOk(i, cyl, H, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
    }
    ok(ov.strands().length === 0, 'G2 a FALLING site does not strand',
      `entry 100 um, readings 20.000 um = x5.00 fall, strands ${ov.strands().length}`);
  }

  // ── G3: THE GEOMETRY-KEYED CACHE. The same facet offered under 500 DIFFERENT triangle indices must be
  //       evaluated ONCE. This is the lever, not a nicety: the driver's conformity and cleanup stages
  //       destroy and re-create facets with identical vertices under fresh indices, so an index-keyed memo
  //       missed nearly every repeat and paid ~4,740 rA evaluations again each time.
  {
    const ov = build(25);
    const t = tri(1.0, 60, 0.020);
    for (let i = 0; i < 500; i += 1) ov.perpOk(i, cyl, H, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
    const st = ov.stats();
    ok(st.perpEvals === 1 && st.memoHits === 499 && ov.strands().length === 0,
      'G3 one GEOMETRY under 500 indices is evaluated exactly once',
      `perpEvals ${st.perpEvals}, memoHits ${st.memoHits} of 500 calls, strands ${ov.strands().length}`);
    // vertex ORDER must not defeat the key either — the same triangle wound differently is the same triangle
    ov.perpOk(9001, cyl, H, t[6], t[7], t[8], t[0], t[1], t[2], t[3], t[4], t[5]);
    ok(ov.stats().perpEvals === 1, 'G3 the key is order-independent',
      `perpEvals still ${ov.stats().perpEvals} after a re-wound triple`);
  }

  // ── G4: PROVENANCE IS REFUSED, NOT WARNED ABOUT.
  {
    let threw = false;
    try { build(25); loadS29Override(
      (() => { const ov = build(25); return (ov as unknown as { _p?: string })._p ?? ''; })(),
      { key: 'WRONG', style: 'SELFTEST', stage: 'ring', tolMm: 0.01 },
    ); } catch { threw = true; }
    ok(threw, 'G4 a mismatched run key is REFUSED', 'loadS29Override threw');
  }

  console.log(`\n=== ${fails === 0 ? 'ALL SINK-GUARD BARS PASS' : `*** ${fails} BAR(S) FAILED ***`} ===`);
  return fails;
  /* eslint-enable no-console */
}

// NO TOP-LEVEL CLI HERE — see the note at the foot of `s29Perp.ts`. This module IS imported by the mesher
// driver, so module-scope `process.exit` is a live hazard rather than a theoretical one. CLI in
// `s29AcceptCli.ts`.
