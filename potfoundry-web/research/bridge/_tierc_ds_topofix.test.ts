// _tierc_ds_topofix.test.ts — DS-topology-fix GATE (E-2026-07-11-TIERC-HEADTOHEAD, prereg
// Addenda 7 & 9). Verifies the two topology fixes land TOGETHER (WINDING-ROOT-diagnosis.md §3 /
// B1-dragonscales-verdict.md Findings 1+2 — neither subsumes the other):
//   Finding 1 — tierc_manifest.ts `dragonScalesAnatomy`: R-CDT body-region z-boundaries now stop
//               at ringZ∓DS_RING_HALF_BAND_MM (disjoint from the R-STRUCT ring bands, was
//               overlapping by 0.6mm on each side).
//   Finding 2 — _sharp3dMesh.ts `buildStructuredWall` (both the equal-count branch and the general
//               `stripBetween` branch): winding flipped to CCW-in-(theta,z), matching
//               ConformingWall/QuadtreeTriangulator's convention (was CW-in-(theta,z)
//               unconditionally).
//
// Rebuilding the NATIVE DS chain via buildRegionOuterWall(getManifest('DragonScales'), dims) must
// now show nonManifoldEdges=0 AND orientationMismatches=0 (both non-vacuous), boundaryEdges
// all-rim/0-interior, zeroArea=0, and a POSITIVE signed volume (outward-facing normals — a
// globally-inverted mesh also reads orientationMismatches=0, so this is a SEPARATE, necessary
// check, not implied by the mismatch count alone).
//
// PF_TIERC_DS_TOPOFIX=1 runs the gate. PF_TIERC_DS_TOPOFIX_LABEL (default 'gate') tags the
// checkpoint row so this SAME test can be re-run at different points of a fix rollout without
// collisions (used during fix development to get an honest BEFORE/AFTER signed-volume-SIGN
// reading for the winding flip specifically — 'pre_windingfix' = Finding-1-only landed,
// Finding-2 not yet landed; 'gate' = both landed, the hard-assertion GATE). The checked-in state
// always carries BOTH fixes, so a bare re-run with the default label always reports (and asserts)
// the final, both-fixes-applied number.
//
// RESILIENCE: single env-gated `it`; checkpoint appended the instant computed (LAB-CHEATSHEET.md).
// NEW-FILE-ONLY. research/ never imported by src/. No committed file edited by this test itself
// (tierc_manifest.ts / _sharp3dMesh.ts are the two mission-authorized edits, made separately;
// tierc_regionLayer.ts, labkit.ts, metrics.ts, _tierc_b1_lib.ts are READ-ONLY imports here).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall } from './tierc_regionLayer';
import { nonManRawBig, nonManRawBigStats } from './labkit';
import { topologyMetric, triangleQuality3D } from '../../src/fidelity/metrics';
import { boundaryRimVsInterior } from './_tierc_b1_lib';

const OUT_DIR = join('research', 'exchange', 'tierc');
const NDJSON = join(OUT_DIR, 'dsTopofix_scorecard.ndjson');
const H = TIERC_COMMON_DIMS.H;

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`[ds-topofix] ${m}`);
}
function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[ds-topofix CP] ${JSON.stringify(row)}`);
}

/**
 * Sum of signed per-triangle tetrahedron volumes from the origin (standard divergence-theorem
 * mesh-volume trick) — formula-identical to src/geometry/exportValidation.ts's own
 * (module-private, unexported) `signedTetraVolumeMm3`, reproduced locally since that symbol isn't
 * exported (same reasoning _tierc_b1_lib.ts's own header gives for its boundary classifier: "safely
 * reproduced here rather than imported, since importing an unexported module-private function is
 * not possible"). For an OPEN surface (the DS outer wall carries top/bottom rim boundary edges, not
 * a closed solid) this sum is not a literal enclosed volume, but its SIGN is exactly what this gate
 * needs: for a fixed vertex set it flips iff the surface's NET winding flips — a globally-inverted
 * mesh (every triangle reversed) has this sum negate sign while orientationMismatches reads 0
 * either way (0 mismatches only says "locally consistent", not "which way it's consistent").
 */
function signedVolumeMm3Of(xyz: Float32Array | Float64Array, idx: Uint32Array): number {
  let vol = 0;
  const nT = idx.length / 3;
  for (let t = 0; t < nT; t++) {
    const i0 = idx[3 * t], i1 = idx[3 * t + 1], i2 = idx[3 * t + 2];
    const ax = xyz[3 * i0], ay = xyz[3 * i0 + 1], az = xyz[3 * i0 + 2];
    const bx = xyz[3 * i1], by = xyz[3 * i1 + 1], bz = xyz[3 * i1 + 2];
    const cx = xyz[3 * i2], cy = xyz[3 * i2 + 1], cz = xyz[3 * i2 + 2];
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
}

describe('TIERC-DS-TOPOFIX — DS native chain topology gate (Finding 1 + Finding 2 together)', () => {
  it.skipIf(process.env.PF_TIERC_DS_TOPOFIX !== '1')(
    'buildRegionOuterWall(DragonScales) native chain: nonManifoldEdges=0 AND orientationMismatches=0, boundary all-rim, zeroArea=0, signed volume positive',
    () => {
      const label = process.env.PF_TIERC_DS_TOPOFIX_LABEL ?? 'gate';
      const manifest = getManifest('DragonScales');
      const t0 = Date.now();
      const native = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
      const buildMs = Date.now() - t0;
      const { xyz, idx } = native.outer;
      const nTris = idx.length / 3;
      plog(`[${label}] built native chain dispatch=${native.meta.dispatch} tris=${nTris} verts=${xyz.length / 3} in ${buildMs}ms`);
      plog(`[${label}] per-region: ${JSON.stringify(native.meta.regions)}`);
      plog(`[${label}] warnings (${native.meta.warnings.length}): ${JSON.stringify(native.meta.warnings)}`);

      // raw-index (no weld) watertight, non-vacuous control (LAB-CHEATSHEET: audit by index).
      const raw = nonManRawBigStats(idx);
      const cracked = new Uint32Array(idx.length + 3);
      cracked.set(idx);
      cracked.set([idx[0], idx[1], idx[2]], idx.length);
      const crackedNonMan = nonManRawBig(cracked);
      const nonVacuous = crackedNonMan > raw.nonMan;

      // topologyMetric (weld=1e-4mm, matches _tierc_armB1.test.ts's own convention) — gives BOTH
      // nonManifoldEdges and orientationMismatches from the SAME instrument, per the mission gate.
      const t1 = Date.now();
      const topo = topologyMetric({ vertices: xyz, indices: idx }, 1e-4);
      const topoMs = Date.now() - t1;

      const rim = boundaryRimVsInterior(xyz, idx, H, 0.05);
      const q3d = triangleQuality3D({ vertices: xyz, indices: idx });
      const signedVolume = signedVolumeMm3Of(xyz, idx);

      const row = {
        key: `topofix_${label}`, label, dispatch: native.meta.dispatch, nTris, nVerts: xyz.length / 3, buildMs, topoMs,
        rawNonMan: raw.nonMan, rawBoundary: raw.boundary, controlInjectedNonMan: crackedNonMan, nonVacuous,
        topoBoundaryEdges: topo.boundaryEdges, topoNonManifoldEdges: topo.nonManifoldEdges, topoOrientationMismatches: topo.orientationMismatches,
        rimBoundary: rim.rim, interiorBoundary: rim.interior, interiorSamples: rim.interiorSamples,
        zeroArea: q3d.degenerateCount, signedVolumeMm3: signedVolume, outward: signedVolume > 0,
        warnings: native.meta.warnings,
        ts: new Date().toISOString(),
      };
      checkpoint(row);
      plog(
        `[${label}] topo: nonMan=${topo.nonManifoldEdges} orientMismatch=${topo.orientationMismatches} ` +
        `boundary=${topo.boundaryEdges} (rim=${rim.rim}/interior=${rim.interior}) zeroArea=${q3d.degenerateCount} ` +
        `signedVolume=${signedVolume.toFixed(1)}mm3 (${signedVolume > 0 ? 'OUTWARD' : 'INWARD'}) rawNonMan=${raw.nonMan} ` +
        `rawBoundary=${raw.boundary} nonVacuous=${nonVacuous} (${topoMs}ms audit, ${buildMs}ms build)`,
      );

      // non-vacuity of the injected control is always required, any label.
      expect(nonVacuous, 'injected duplicate triangle must move the raw nonMan count').toBe(true);

      // The GATE proper only hard-binds for the final ('gate') label — interim labels (e.g.
      // 'pre_windingfix') are allowed to fail; they exist to produce an honest before/after
      // reading during fix rollout, not to assert a still-partial state is clean.
      if (label === 'gate') {
        expect(topo.nonManifoldEdges, 'nonManifoldEdges must be 0').toBe(0);
        expect(topo.orientationMismatches, 'orientationMismatches must be 0').toBe(0);
        expect(rim.interior, 'every boundary edge must be a rim edge (0 interior holes)').toBe(0);
        expect(topo.boundaryEdges, 'topologyMetric boundaryEdges must equal the raw rim classification (all-rim)').toBe(rim.rim);
        expect(q3d.degenerateCount, 'zeroArea must be 0').toBe(0);
        expect(signedVolume, 'signed volume must be positive (outward-facing normals)').toBeGreaterThan(0);
      }
    },
    10 * 60 * 1000,
  );
});
