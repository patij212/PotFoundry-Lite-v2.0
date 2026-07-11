// _tierc_b0_toy.test.ts — DEV-ONLY (research/, never imported by src/).
//
// E-2026-07-11-TIERC-HEADTOHEAD, Arm B0 (boundary-contract toy). Runs the CONTRACTS from
// architecture-v1.md SS2 / the B0 task brief IN ORDER, stopping at the first that clears all
// three pre-registered gates:
//   gate 1 — watertight, non-vacuous: `nonManRawBig`==0 on the assembled toy AND an injected
//            duplicate-triangle control moves it (labkit, no position-weld).
//   gate 2 — ZERO T-junctions on both seam chains (explicit audit, 1e-6mm quantized).
//   gate 3 — riser serration <=0.001mm (the champion's own ring-locus -> nearest-mesh-edge metric).
//
// Env-gated (PF_TIERC_B0=1). Every unit checkpoints to research/exchange/_tierc_b0/scorecard.ndjson
// THE INSTANT it is computed and is skipped on re-run if its key already exists (resilience —
// LAB-CHEATSHEET: "the environment kills long runs"). The toy is small by design (one ring, two
// narrow K1 z-bands) — every `it` here is expected to complete in low single-digit seconds.
//
// Verdict doc: research/lab/tierc/B0-boundary-contract-verdict.md. Commits nothing (per task rules).
import { describe, it, expect } from 'vitest';
import {
  dsRA, H, RING_Z, SEAM_LO, SEAM_HI, K1_LOWER_ZLO, K1_LOWER_ZHI, K1_UPPER_ZLO, K1_UPPER_ZHI,
  buildK1ZBand, adoptedThetas, buildRingBandRows, mergeAdoptedAssembly, mergeUngluedAssembly,
  runB0Config, plog, checkpoint, keyExists,
  type K1Region,
} from './_tierc_b0_toy_lib';
import { buildStructuredWall } from './_sharp3dMesh';
import { nonManRawBigStats, dumpRenderBins } from './labkit';
import {
  buildConformingWall,
  type ConformingWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { join } from 'node:path';

const N_RING = 512; // K1 boundary pin (power of two; pinBoundaryLevel = 9).

function buildLowerUpper(nRing: number): { lower: K1Region; upper: K1Region } {
  const rA = dsRA();
  const lower = buildK1ZBand(rA, K1_LOWER_ZLO, K1_LOWER_ZHI, { nRing });
  const upper = buildK1ZBand(rA, K1_UPPER_ZLO, K1_UPPER_ZHI, { nRing });
  plog(
    `[k1] lower z[${K1_LOWER_ZLO},${K1_LOWER_ZHI}] uBias=${lower.uBias} tris=${lower.result.indices.length / 3} ` +
    `topRing=${lower.result.topRing.length} bottomRing=${lower.result.bottomRing.length} (${lower.buildMs}ms)`,
  );
  plog(
    `[k1] upper z[${K1_UPPER_ZLO},${K1_UPPER_ZHI}] uBias=${upper.uBias} tris=${upper.result.indices.length / 3} ` +
    `topRing=${upper.result.topRing.length} bottomRing=${upper.result.bottomRing.length} (${upper.buildMs}ms)`,
  );
  expect(lower.result.topRing.length).toBe(nRing);
  expect(upper.result.bottomRing.length).toBe(nRing);
  return { lower, upper };
}

describe('TIERC-B0 — boundary-contract toy (K3 ring band <-> K1 quadtree region)', () => {
  // ── contract (a): MISMATCHED-count adoption. nRing=512 (K1's own power-of-two pin) vs the ring
  //    band's own free nThetaRing (600/1200/2400 — the champion's own validated count) — the two
  //    seam rows differ in count, so buildStructuredWall's EXISTING dispatch takes the general
  //    periodic merge-strip (`stripBetween`, _sharp3dMesh.ts:50-74) at both seams. This is contract
  //    (a)'s literal "conservative stitch strip" — no new triangulation code, no ConformingWall.ts
  //    edit. Sweep is checkpointed per nThetaRing so a killed run resumes on the unfinished ones. ─
  it.skipIf(process.env.PF_TIERC_B0 !== '1')(
    'contract (a): mismatched-count adoption (nRing=512, nThetaRing sweep 600/1200/2400)',
    () => {
      const { lower, upper } = buildLowerUpper(N_RING);
      for (const nThetaRing of [600, 1200, 2400]) {
        const key = `a_mismatch_nRing${N_RING}_nTh${nThetaRing}`;
        if (keyExists(key)) { plog(`[skip] ${key} exists`); continue; }
        const t0 = Date.now();
        const res = runB0Config({ key, contract: 'a-mismatch', nThetaRing }, lower, upper);
        plog(
          `[${key}] tris=${res.tris.total} (lower=${res.tris.lower} upper=${res.tris.upper} ring=${res.tris.ringOwn}) ` +
          `gate1(nonMan=${res.gate1.nonManBase} boundary=${res.gate1.boundaryEdges} control=${res.gate1.controlInjectedNonMan} nonVacuous=${res.gate1.nonVacuous}) ` +
          `gate2(loT=${res.gate2.lo.tJunctions}/extra=${res.gate2.lo.extraVertices} hiT=${res.gate2.hi.tJunctions}/extra=${res.gate2.hi.extraVertices}) ` +
          `gate3(p99=${res.gate3.p99.toExponential(3)} max=${res.gate3.max.toExponential(3)}) ` +
          `qual(%<20=${res.quality.pctBelow20.toFixed(2)} minAngle=${res.quality.minAngleDeg.toFixed(2)}) ` +
          `overallPass=${res.overallPass} (${Date.now() - t0}ms)`,
        );
        checkpoint({ ...res, ts: new Date().toISOString() });
      }
      expect(true).toBe(true);
    },
    300_000,
  );

  // ── contract (c): MATCHED-count adoption. nRing = nThetaRing = 512 — the seam rows are
  //    IDENTICAL count, so buildStructuredWall takes the equal-count diagonal-flip path at both
  //    seams (ZERO merge-strip anywhere). The purest form of "K1 owns, R-STRUCT adopts". ─
  it.skipIf(process.env.PF_TIERC_B0 !== '1')(
    'contract (c): matched-count adoption, zero merge-strip (nRing=nThetaRing=512)',
    () => {
      const key = `c_matched_nRing${N_RING}`;
      if (keyExists(key)) { plog(`[skip] ${key} exists`); return; }
      const { lower, upper } = buildLowerUpper(N_RING);
      const res = runB0Config({ key, contract: 'c-matched', nThetaRing: N_RING }, lower, upper);
      plog(
        `[${key}] tris=${res.tris.total} gate1(nonMan=${res.gate1.nonManBase} boundary=${res.gate1.boundaryEdges} nonVacuous=${res.gate1.nonVacuous}) ` +
        `gate2(loT=${res.gate2.lo.tJunctions} hiT=${res.gate2.hi.tJunctions}) gate3(p99=${res.gate3.p99.toExponential(3)}) overallPass=${res.overallPass}`,
      );
      checkpoint({ ...res, ts: new Date().toISOString() });
      expect(true).toBe(true);
    },
    300_000,
  );

  // ── non-vacuous MECHANISM control: build the SAME lower/upper/ring pieces, merge them via BOTH
  //    the adopted (index-shared) path and the UNGLUED (position-coincident-only, independent
  //    indices) path, and compare nonManRawBigStats. This is a STRONGER non-vacuity witness than
  //    the synthetic duplicate-triangle injection alone: it shows the ADOPTION MECHANISM ITSELF —
  //    not just the audit function — is what makes gate 1 pass (an "unglued" naive stitch should
  //    show inflated BOUNDARY edge count at the seams, not a non-manifold defect, since two
  //    coincident-but-unshared rings are simply two open boundaries, not a >2-multiplicity edge). ─
  it.skipIf(process.env.PF_TIERC_B0 !== '1')(
    'non-vacuous control: unglued (position-coincident, index-independent) comparison',
    () => {
      const key = 'unglued_control_nRing512_nTh600';
      if (keyExists(key)) { plog(`[skip] ${key} exists`); return; }
      const rA = dsRA();
      const { lower, upper } = buildLowerUpper(N_RING);
      const lowerAdopted = adoptedThetas(lower, lower.result.topRing);
      const upperAdopted = adoptedThetas(upper, upper.result.bottomRing);
      const rows = buildRingBandRows(rA, RING_Z, SEAM_LO, SEAM_HI, lowerAdopted, upperAdopted, { nThetaRing: 600 });
      const ring = buildStructuredWall(rA, H, rows);

      const adopted = mergeAdoptedAssembly(lower, upper, ring);
      const unglued = mergeUngluedAssembly(lower, upper, ring);
      const adoptedStats = nonManRawBigStats(adopted.idx);
      const ungluedStats = nonManRawBigStats(unglued.idx);
      const expectedFarBoundary = 2 * N_RING; // the toy's own two intentionally-open far ends
      const row = {
        key,
        adopted: { nonMan: adoptedStats.nonMan, boundary: adoptedStats.boundary, totalV: adopted.counts.totalV, totalF: adopted.counts.totalF },
        unglued: { nonMan: ungluedStats.nonMan, boundary: ungluedStats.boundary, totalV: unglued.counts.totalV, totalF: unglued.counts.totalF },
        expectedFarBoundary,
        // discriminating claim: adoption removes exactly 2*nRing boundary edges (one seam ring's
        // worth from EACH side, at BOTH seams) vs the unglued baseline.
        boundaryDelta: ungluedStats.boundary - adoptedStats.boundary,
        expectedBoundaryDelta: 4 * N_RING, // 2 seams x 2 sides x nRing
        mechanismDiscriminates: ungluedStats.boundary > adoptedStats.boundary,
        adoptedBoundaryIsExactlyFarEnds: adoptedStats.boundary === expectedFarBoundary,
        ts: new Date().toISOString(),
      };
      plog(`[${key}] adopted.boundary=${adoptedStats.boundary} unglued.boundary=${ungluedStats.boundary} expectedFar=${expectedFarBoundary} delta=${row.boundaryDelta} (expect ${row.expectedBoundaryDelta})`);
      checkpoint(row);
      expect(true).toBe(true);
    },
    300_000,
  );

  // ── contract (b) LIGHT investigation (only if (a)/(c) need a fallback — kept minimal per the
  //    task's "stop at first PASS" rule): can the WIP railLines force-registration
  //    (ConformingWall.ts:180-198) make K1 emit an ARBITRARY (non-power-of-two) evenThetas chain
  //    directly on the t=0 domain edge, sidestepping the nRing power-of-two constraint entirely?
  //    Single small unpinned (`nRing` omitted) build with ONE rail line of nThetaB=100 points at
  //    t=0 (u=i/100). Reports what `bottomRing` (the SAME t<RING_EPS filter used everywhere else)
  //    actually contains — a positive or negative finding either way, not a full gate-3 attempt. ─
  it.skipIf(process.env.PF_TIERC_B0 !== '1')(
    'contract (b) smoke: railLines force-registration at a domain t-edge',
    () => {
      const key = 'b_smoke_railLines_t0';
      if (keyExists(key)) { plog(`[skip] ${key} exists`); return; }
      const rA = dsRA();
      const sampler = { position: (u: number, t: number): [number, number, number] => {
        const theta = 2 * Math.PI * u;
        const z = K1_LOWER_ZLO + t * (K1_LOWER_ZHI - K1_LOWER_ZLO);
        const r = rA(theta, z);
        return [r * Math.cos(theta), r * Math.sin(theta), z];
      } };
      const nThetaB = 100; // deliberately NOT a power of two — the exact case nRing can't reach
      const railPts: Array<{ u: number; t: number }> = [];
      for (let i = 0; i < nThetaB; i++) railPts.push({ u: i / nThetaB, t: 0 });
      const rail: FeatureLine = { kind: 'general-curve', points: railPts, label: 'b0-smoke-rail-t0' };
      const opts: ConformingWallOptions = {
        maxSagMm: 0.05, maxEdgeMm: 3, minEdgeMm: 0.15, gradeRatio: 2, maxLevel: 8,
        resU: 64, resT: 16, surfaceId: 0,
        railLines: [rail],
      };
      let buildError: string | null = null;
      let bottomRingLen = -1;
      let bottomRingMatchesRail = false;
      let trisOut = -1;
      try {
        const res = buildConformingWall(sampler, opts);
        bottomRingLen = res.bottomRing.length;
        trisOut = res.indices.length / 3;
        // Do the bottomRing u-values equal the rail's own i/100 samples (adoption WOULD need this)?
        if (bottomRingLen === nThetaB) {
          bottomRingMatchesRail = res.bottomRing.every((vi, i) => {
            const u = res.vertices[vi * 3];
            return Math.abs(u - i / nThetaB) < 1e-6;
          });
        }
      } catch (err) {
        buildError = err instanceof Error ? `${err.message}` : String(err);
      }
      const row = {
        key, nThetaB, buildError, bottomRingLen, bottomRingMatchesRail, trisOut,
        verdict: buildError
          ? 'THREW — railLines at a bare domain edge is not a usable hook without further plumbing'
          : bottomRingLen === nThetaB && bottomRingMatchesRail
            ? 'WORKS — bottomRing exactly reproduces the rail chain (an alternative to nRing pinning)'
            : `PARTIAL/UNEXPECTED — bottomRing has ${bottomRingLen} verts (rail had ${nThetaB}), matches=${bottomRingMatchesRail} — force-register did not cleanly reproduce an arbitrary boundary chain`,
        ts: new Date().toISOString(),
      };
      plog(`[${key}] ${row.verdict}`);
      checkpoint(row);
      expect(true).toBe(true);
    },
    60_000,
  );

  // ── QUALITY diagnostic (not a gate): triangleQualityDistribution reported minAngleDeg=0 for the
  //    exactly-matched (nRing=nThetaRing=512) config. Region-classify every triangle (touches an
  //    adopted seam chain / K1-lower interior / K1-upper interior / ring interior) to see WHERE the
  //    sub-0.05deg sliver lives, so the verdict doc can report it honestly instead of leaving it
  //    unexplained. Non-degenerate by construction (triangleQualityDistribution already excludes
  //    true zero-area facets, area<=1e-12) — this is a genuine but extremely thin VALID triangle. ─
  it.skipIf(process.env.PF_TIERC_B0 !== '1')('quality diagnostic: locate the sub-threshold sliver', () => {
    const key = 'quality_diag_sliver_location';
    if (keyExists(key)) { plog(`[skip] ${key} exists`); return; }
    const rA = dsRA();
    const { lower, upper } = buildLowerUpper(N_RING);
    const lowerAdopted = adoptedThetas(lower, lower.result.topRing);
    const upperAdopted = adoptedThetas(upper, upper.result.bottomRing);

    const regionOf = (asm: ReturnType<typeof mergeAdoptedAssembly>, a: number, b: number, c: number): string => {
      const seamLoSet = new Set(asm.seamLo);
      const seamHiSet = new Set(asm.seamHi);
      const lowerN = lower.result.gridVertexCount, upperN = upper.result.gridVertexCount;
      const verts = [a, b, c];
      if (verts.some((v) => seamLoSet.has(v))) return 'touchesSeamLo';
      if (verts.some((v) => seamHiSet.has(v))) return 'touchesSeamHi';
      if (verts.every((v) => v < lowerN)) return 'lowerInterior';
      if (verts.every((v) => v >= lowerN && v < lowerN + upperN)) return 'upperInterior';
      if (verts.every((v) => v >= lowerN + upperN)) return 'ringInterior';
      return 'mixed-other';
    };
    const triMinAngleDeg = (xyz: Float64Array, a: number, b: number, c: number): { deg: number; degenerate: boolean } => {
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      const ab = Math.hypot(bx - ax, by - ay, bz - az);
      const bc = Math.hypot(cx - bx, cy - by, cz - bz);
      const ca = Math.hypot(ax - cx, ay - cy, az - cz);
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (area <= 1e-12) return { deg: -1, degenerate: true };
      const lawCos = (opp: number, s1: number, s2: number): number =>
        (Math.acos(Math.max(-1, Math.min(1, (s1 * s1 + s2 * s2 - opp * opp) / (2 * s1 * s2)))) * 180) / Math.PI;
      return { deg: Math.min(lawCos(bc, ab, ca), lawCos(ca, bc, ab), lawCos(ab, ca, bc)), degenerate: false };
    };
    const worstByRegion = (asm: ReturnType<typeof mergeAdoptedAssembly>): Record<string, number> => {
      const worst: Record<string, number> = {};
      const nF = asm.idx.length / 3;
      for (let f = 0; f < nF; f++) {
        const a = asm.idx[3 * f], b = asm.idx[3 * f + 1], c = asm.idx[3 * f + 2];
        if (a === b || b === c || a === c) continue;
        const r = triMinAngleDeg(asm.xyz, a, b, c);
        if (r.degenerate) continue;
        const reg = regionOf(asm, a, b, c);
        if (!(reg in worst) || r.deg < worst[reg]) worst[reg] = r.deg;
      }
      return worst;
    };

    const rowsMatched = buildRingBandRows(rA, RING_Z, SEAM_LO, SEAM_HI, lowerAdopted, upperAdopted, { nThetaRing: N_RING });
    const ringMatched = buildStructuredWall(rA, H, rowsMatched);
    const asmMatched = mergeAdoptedAssembly(lower, upper, ringMatched);
    const worstMatched = worstByRegion(asmMatched);

    const rowsWinner = buildRingBandRows(rA, RING_Z, SEAM_LO, SEAM_HI, lowerAdopted, upperAdopted, { nThetaRing: 2400 });
    const ringWinner = buildStructuredWall(rA, H, rowsWinner);
    const asmWinner = mergeAdoptedAssembly(lower, upper, ringWinner);
    const worstWinner = worstByRegion(asmWinner);

    const row = { key, matchedNTh512: worstMatched, mismatchNTh2400Winner: worstWinner, ts: new Date().toISOString() };
    plog(`[${key}] matched(512/512) worst-by-region=${JSON.stringify(worstMatched)}`);
    plog(`[${key}] winner(512/2400) worst-by-region=${JSON.stringify(worstWinner)}`);
    checkpoint(row);
    expect(true).toBe(true);
  }, 60_000);

  // ── VISUAL evidence for the winning config (contract a, nRing=512/nThetaRing=2400): region-
  //    coloured render bins (lower=blue, ring=red, upper=green) so the seam can be visually
  //    inspected, not just audited numerically. render via research/render/meshRender.cjs. ─
  it.skipIf(process.env.PF_TIERC_B0 !== '1')('visual evidence: dump region-coloured render bins for the winning config', () => {
    const dir = join('research', 'exchange', '_tierc_b0');
    const rA = dsRA();
    const { lower, upper } = buildLowerUpper(N_RING);
    const lowerAdopted = adoptedThetas(lower, lower.result.topRing);
    const upperAdopted = adoptedThetas(upper, upper.result.bottomRing);
    const rows = buildRingBandRows(rA, RING_Z, SEAM_LO, SEAM_HI, lowerAdopted, upperAdopted, { nThetaRing: 2400 });
    const ring = buildStructuredWall(rA, H, rows);
    const asm = mergeAdoptedAssembly(lower, upper, ring);

    const lowerN = lower.result.gridVertexCount, upperN = upper.result.gridVertexCount;
    const nV = asm.xyz.length / 3;
    const col = new Float32Array(nV * 3);
    const seamLoSet = new Set(asm.seamLo);
    const seamHiSet = new Set(asm.seamHi);
    for (let i = 0; i < nV; i++) {
      let r = 0.2, g = 0.2, b = 0.2;
      if (seamLoSet.has(i) || seamHiSet.has(i)) { r = 1.0; g = 0.85; b = 0.0; } // seam chains: bright yellow
      else if (i < lowerN) { r = 0.15; g = 0.4; b = 0.95; } // K1 lower: blue
      else if (i < lowerN + upperN) { r = 0.15; g = 0.75; b = 0.25; } // K1 upper: green
      else { r = 0.9; g = 0.15; b = 0.15; } // ring band interior: red
      col[3 * i] = r; col[3 * i + 1] = g; col[3 * i + 2] = b;
    }
    dumpRenderBins(dir, 'b0_winner_a_nRing512_nTh2400', asm.xyz, asm.idx, {
      colors: col,
      meta: { contract: 'a-mismatch', nRing: N_RING, nThetaRing: 2400, tris: asm.idx.length / 3 },
    });
    plog(`[visual] dumped ${dir}/b0_winner_a_nRing512_nTh2400.{xyz,idx,col}.bin (tris=${asm.idx.length / 3})`);

    // The toy is a SHORT WIDE washer (20mm tall z-band vs ~90mm diameter) — meshRender.cjs's
    // camera heuristic is tuned for tall-pot silhouettes and frames this shape almost entirely off
    // screen. Dump a SEPARATE, clearly-labelled Z-EXAGGERATED (5x) copy for visualization ONLY —
    // never used for any measurement, purely so the seam is human-visible in a render.
    const zExag = new Float64Array(asm.xyz.length);
    let zc = 0;
    for (let i = 0; i < nV; i++) zc += asm.xyz[3 * i + 2];
    zc /= nV;
    for (let i = 0; i < nV; i++) {
      zExag[3 * i] = asm.xyz[3 * i];
      zExag[3 * i + 1] = asm.xyz[3 * i + 1];
      zExag[3 * i + 2] = zc + (asm.xyz[3 * i + 2] - zc) * 5;
    }
    dumpRenderBins(dir, 'b0_winner_a_zx5_VIZONLY', zExag, asm.idx, {
      colors: col,
      meta: { contract: 'a-mismatch', nRing: N_RING, nThetaRing: 2400, tris: asm.idx.length / 3, zExaggeration: 5, VIZ_ONLY_NOT_FOR_MEASUREMENT: true },
    });
    plog(`[visual] dumped z-exaggerated (5x, VIZ ONLY) variant for camera framing`);
    expect(true).toBe(true);
  }, 60_000);
});
