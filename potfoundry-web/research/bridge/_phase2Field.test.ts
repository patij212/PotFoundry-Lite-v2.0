// _phase2Field.test.ts — PINNING TESTS for the Phase-2 tightening field. RESEARCH ONLY.
//
// THESE RUN BY DEFAULT (set PF_P2_FIELD=0 to skip). Every other research test in this directory is gated
// behind an opt-in flag because it costs minutes; this one is pure arithmetic and finishes in milliseconds,
// and the properties it pins are the ones the design is not allowed to lose:
//
//   1. THE FIELD MAY NEVER LOOSEN. Not "does not today" — cannot, through any of the three clamps, from a
//      hand-edited file, from a negative or NaN scale, or from a query far from every locus.
//   2. IT IS A PURE FUNCTION OF THE FILE. Same file, same answers, in any query order, from any build.
//   3. IT IS TESTED AGAINST A BOUNDING SPHERE. A coarse triangle that COVERS a locus but whose centroid sits
//      outside every ball must still be tightened — otherwise the field is inert on exactly the initial grid
//      it has to act on, and the whole outer loop silently does nothing.
//   4. THE ACCELERATION STRUCTURE AGREES WITH BRUTE FORCE, on both the hash path and the linear fallback.
//   5. PROVENANCE MISMATCHES ARE REPORTED. Every field of the key, not just the key string.
//   6. CLUSTERING DROPS NOTHING. Overflow is handled by doubling the pitch, never by discarding loci.
//
// Every assertion carries a non-vacuity companion: a test that compared nothing, or that exercised only the
// hash path while claiming to cover the fallback, would pass and mean nothing.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PHASE2_LOCI_SCHEMA, PHASE2_RUN_SCHEMA, buildTightenField, clusterExceedances, phase2Key, readLociFile,
  scaleFromSlope, tightenedAreaMm2, verifyLociProvenance, writeJsonFile,
  type Phase2Cluster, type Phase2Dims, type Phase2LociFile, type RawExceedance,
} from './_phase2Loci';

const RUN = process.env.PF_P2_FIELD !== '0';
const DIMS: Phase2Dims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const PARAMS: Record<string, number> = { archHeight: 12, archWidth: 3, ribDepth: 1.5 };

function mkFile(clusters: Phase2Cluster[], radiusMm = 0.5, clusterMm = 0.25): Phase2LociFile {
  return {
    schema: PHASE2_LOCI_SCHEMA,
    run: {
      schema: PHASE2_RUN_SCHEMA,
      style: 'GothicArches', params: PARAMS, dims: DIMS, H: 120, stage: 'ring',
      tolMm: 0.01, acceptTolMm: 0.007, gridU: 60, gridV: 40, triCap: 2_500_000,
      driver: 'heap', rank: 'plane', directed: true, snap: true, reproj: false,
      key: phase2Key('GothicArches', PARAMS, DIMS, 0.01, 'ring'),
      tag: 'gothicarches_ring_DS-', stl: 'gothicarches_ring_DS-.stl', nTri: 903_506, alloc: 1_802_980,
      unresolvedLeft: 0, capped: false, timeCapped: false, curtainSites: 0,
      verdict: 'PASS', headlineMaxMm: 0.007806, secs: 1229, tighten: null,
      generatedAt: '2026-07-29T00:00:00.000Z',
    },
    audit: {
      tool: 'test', stlPath: 'x.stl', nTri: 903_506, tolMm: 0.01, coveragePitchMm: 0.04, minPitchMm: 0.00125,
      maxMm: 0.019247, maxTh: 4.441641, maxZ: 59.60938, maxR: 44.66222, maxOnWall: false,
      queries: 40_008_064, overCount: 1730, rawCount: 1730, rawCapped: false, capped: false,
      structPitchUniformMm: 0.0126, secs: 600, meshAreaMm2: 33_900,
      generatedAt: '2026-07-29T00:00:00.000Z',
    },
    tighten: { radiusMm, clusterMm, mode: 'fixed', factor: 2, slope: 1.45, maxScale: 64 },
    clusters,
    predict: { meshAreaMm2: 33_900, nTri: 903_506, densityPerMm2: 26.7, unionAreaMm2: 0, weightedExcessAreaMm2: 0, extraTris: 0, predictedTris: 903_506, caveats: [] },
    caveats: [],
  };
}
const c = (x: number, y: number, z: number, tolScale: number): Phase2Cluster =>
  ({ th: Math.atan2(y, x), z, r: Math.hypot(x, y), x, y, count: 1, maxErrMm: 0.019, tolScale });

describe('phase-2 tightening field', () => {
  it.runIf(RUN)('1. can only TIGHTEN — three clamps, and a hand-edited file cannot beat any of them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-p2-'));
    try {
      // A file an outer-loop bug (or a hand edit) could plausibly produce: scales below 1, negative, NaN.
      const path = join(dir, 'evil.loci.json');
      writeJsonFile(path, mkFile([
        c(40, 0, 60, 0.25), c(0, 40, 60, -3), c(-40, 0, 60, Number.NaN), c(0, -40, 60, 4),
      ]));
      const f = readLociFile(path);
      // clamp #1, on read
      expect(f.clusters.map((k) => k.tolScale)).toEqual([1, 1, 1, 4]);
      const field = buildTightenField(f);
      // clamp #3, in the field itself — including a query far from every locus, which is the case that
      // decides whether "no tightening" means 1 or 0.
      let minSeen = Infinity; let sawFour = false;
      // The probe set includes the four cluster CENTRES explicitly — a lattice that happened to miss them
      // would pass the "never below 1" assertion while proving nothing, which is what the two non-vacuity
      // checks below exist to catch (they caught exactly that on the first draft of this test).
      const probes: Array<[number, number, number]> = [[40, 0, 60], [0, 40, 60], [-40, 0, 60], [0, -40, 60]];
      for (let i = 0; i < 64; i += 1) {
        for (let j = 0; j < 32; j += 1) {
          const th = (2 * Math.PI * i) / 64;
          probes.push([40 * Math.cos(th), 40 * Math.sin(th), (120 * j) / 32]);
        }
      }
      for (const [px, py, pz] of probes) {
        const s = field.scaleForSphere(px, py, pz, 0.05);
        expect(s).toBeGreaterThanOrEqual(1);
        if (s < minSeen) minSeen = s;
        if (s === 4) sawFour = true;
      }
      expect(minSeen).toBe(1);   // NON-VACUITY: the sweep really did leave the tightened balls
      expect(sawFour).toBe(true); // NON-VACUITY: and really did enter one
      // clamp #2 — buildTightenField clamps even when readLociFile was bypassed entirely
      const direct = buildTightenField(mkFile([c(40, 0, 60, 0.1)]));
      expect(direct.scaleForSphere(40, 0, 60, 0)).toBe(1);
      expect(direct.maxScale).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.runIf(RUN)('2. is a PURE function of the file — order-free, build-free', () => {
    const file = mkFile([c(40, 0, 60, 2), c(40.3, 0.2, 60.1, 8), c(-30, 20, 20, 4)]);
    const a = buildTightenField(file);
    const b = buildTightenField(file);
    // Three of the probes are the cluster centres themselves, so the set is guaranteed to contain both
    // tightened and untightened points; the rest is a spiral that mostly misses them.
    const pts: Array<[number, number, number, number]> = [
      [40, 0, 60, 0.02], [40.3, 0.2, 60.1, 0.02], [-30, 20, 20, 0.02],
    ];
    for (let i = 0; i < 500; i += 1) {
      pts.push([40 * Math.cos(i * 0.7), 40 * Math.sin(i * 0.7), (i * 120) / 500, 0.02 + (i % 7) * 0.05]);
    }
    const fwd = pts.map((p) => a.scaleForSphere(p[0], p[1], p[2], p[3]));
    const rev = [...pts].reverse().map((p) => b.scaleForSphere(p[0], p[1], p[2], p[3])).reverse();
    expect(fwd).toEqual(rev);
    expect(new Set(fwd).size).toBeGreaterThan(1); // NON-VACUITY: the probe set is not all-1
  });

  it.runIf(RUN)('3. tightens a triangle that COVERS a locus but whose centroid does not', () => {
    // The 60x40 initial grid on a 120 mm pot carries facets several mm across. A centroid test would accept
    // this one, never split it, and the tightened region would be unreachable — the field would be inert on
    // exactly the run that needs it.
    const field = buildTightenField(mkFile([c(45, 0, 60, 4)], 0.5));
    const centroid: [number, number, number] = [45, 0, 63];       // 3 mm away, well outside the 0.5 mm ball
    expect(field.scaleForSphere(centroid[0], centroid[1], centroid[2], 0.05)).toBe(1);
    expect(field.scaleForSphere(centroid[0], centroid[1], centroid[2], 3.0)).toBe(4);   // sphere reaches it
    expect(field.scaleForSphere(centroid[0], centroid[1], centroid[2], 2.0)).toBe(1);   // and 2.0 does not
  });

  it.runIf(RUN)('4. the hash grid and the linear fallback both agree with brute force', () => {
    const cs: Phase2Cluster[] = [];
    for (let i = 0; i < 300; i += 1) {
      const th = (i * 2.399963); const z = (i * 120) / 300;
      cs.push(c(44 * Math.cos(th), 44 * Math.sin(th), z, 1 + (i % 5)));
    }
    const file = mkFile(cs, 0.5);
    const field = buildTightenField(file);
    const brute = (qx: number, qy: number, qz: number, rad: number): number => {
      let best = 1;
      for (const k of cs) {
        const d = Math.hypot(k.x - qx, k.y - qy, k.z - qz);
        if (d <= 0.5 + rad && k.tolScale > best) best = k.tolScale;
      }
      return best;
    };
    let nBig = 0; let nTight = 0;
    for (let i = 0; i < 800; i += 1) {
      const th = i * 0.311; const z = (i * 120) / 800;
      const rad = i % 40 === 0 ? 6 : 0.03 + (i % 5) * 0.02;   // every 40th query goes down the linear path
      const qx = 44 * Math.cos(th); const qy = 44 * Math.sin(th);
      if (rad > 1) nBig += 1;
      const got = field.scaleForSphere(qx, qy, z, rad);
      expect(got).toBe(brute(qx, qy, z, rad));
      if (got > 1) nTight += 1;
    }
    expect(nBig).toBeGreaterThan(0);
    expect(nTight).toBeGreaterThan(0);              // NON-VACUITY: brute force was not trivially 1 everywhere
    expect(field.linearScans()).toBeGreaterThan(0);  // NON-VACUITY: the fallback was actually exercised
  });

  it.runIf(RUN)('5. refuses a loci file whose style / params / dims / tol / stage do not match', () => {
    const file = mkFile([c(40, 0, 60, 2)]);
    const ok = { style: 'GothicArches', params: PARAMS, dims: DIMS, tolMm: 0.01, stage: 'ring' };
    expect(verifyLociProvenance(file, ok)).toEqual([]);
    const cases: Array<[string, Parameters<typeof verifyLociProvenance>[1], string]> = [
      ['style', { ...ok, style: 'GeometricStar' }, 'style'],
      ['param', { ...ok, params: { ...PARAMS, ribDepth: 1.6 } }, 'param ribDepth'],
      ['dims', { ...ok, dims: { ...DIMS, Rt: 55 } }, 'dims'],
      ['tol', { ...ok, tolMm: 0.02 }, 'tol'],
      ['stage', { ...ok, stage: 'solid' }, 'stage'],
    ];
    for (const [name, bad, needle] of cases) {
      const m = verifyLociProvenance(file, bad);
      expect(m.length, name).toBeGreaterThan(0);
      expect(m.join('\n'), name).toContain(needle);
    }
    // An incomplete recording is a provenance failure too — a partial loci set steers the driver to the
    // wrong places while looking entirely normal.
    const capped = mkFile([c(40, 0, 60, 2)]);
    capped.audit.rawCapped = true;
    expect(verifyLociProvenance(capped, ok).join('\n')).toContain('rawCapped');
    const desync = mkFile([c(40, 0, 60, 2)]);
    desync.audit.rawCount = 12;
    expect(verifyLociProvenance(desync, ok).join('\n')).toContain('rawCount');
  });

  it.runIf(RUN)('6. clustering drops nothing — overflow doubles the pitch instead', () => {
    const raw: RawExceedance[] = [];
    for (let i = 0; i < 5000; i += 1) {
      raw.push({ x: 44 * Math.cos(i * 0.017), y: 44 * Math.sin(i * 0.017), z: (i * 120) / 5000, d: 0.011 + (i % 13) * 1e-4 });
    }
    const fine = clusterExceedances(raw, 0.25, 100000);
    expect(fine.coarsenings).toBe(0);
    expect(fine.cells.size).toBeGreaterThan(100);          // NON-VACUITY: the fine pitch really did split them
    const tight = clusterExceedances(raw, 0.25, 50);
    expect(tight.cells.size).toBeLessThanOrEqual(50);
    expect(tight.coarsenings).toBeGreaterThan(0);
    expect(tight.clusterMm).toBe(0.25 * 2 ** tight.coarsenings);
    // NOTHING DROPPED: every raw point still lies inside its cluster's own cell.
    for (const p of raw) {
      const k = `${Math.floor(p.x / tight.clusterMm)},${Math.floor(p.y / tight.clusterMm)},${Math.floor(p.z / tight.clusterMm)}`;
      expect(tight.cells.has(k)).toBe(true);
    }
    // The representative is the cell ARGMAX, so the cluster's error is the worst in it.
    for (const [, v] of tight.cells) expect(v.d).toBeGreaterThanOrEqual(0.011);
    // Determinism: same input, same output.
    const again = clusterExceedances(raw, 0.25, 50);
    expect([...again.cells.keys()].sort()).toEqual([...tight.cells.keys()].sort());
  });

  it.runIf(RUN)('7. §5.3 slope arithmetic, on D25\'s own numbers', () => {
    // E = 19.247 um against a 10 um bar. acceptTol ~ h^2, so k halvings of h is a divisor of 4^k.
    expect(scaleFromSlope(0.019247, 0.01, 3.2, 64)).toBe(4);    // k = 1
    expect(scaleFromSlope(0.019247, 0.01, 1.45, 64)).toBe(16);  // k = 2
    expect(scaleFromSlope(0.009, 0.01, 1.45, 64)).toBe(1);      // already inside tol ⇒ no tightening
    expect(scaleFromSlope(1.0, 0.01, 1.45, 16)).toBe(16);       // the ceiling holds
  });

  it.runIf(RUN)('8. tightened area is a UNION, not a sum of discs', () => {
    // Ten loci inside one ball radius of each other cover ~one disc, not ten. Pricing INFEASIBLE-AT-CAP on
    // the naive sum would over-state a clustered residual by an order of magnitude.
    const cs: Phase2Cluster[] = [];
    for (let i = 0; i < 10; i += 1) cs.push(c(44, 0.02 * i, 60 + 0.02 * i, 2));
    const oneDisc = Math.PI * 0.5 * 0.5;
    const a = tightenedAreaMm2(mkFile(cs, 0.5, 0.25), 45);
    expect(a).toBeGreaterThan(0.5 * oneDisc);
    expect(a).toBeLessThan(3 * oneDisc);
    expect(a).toBeLessThan(10 * oneDisc);   // the point: NOT the naive sum
  });
});
