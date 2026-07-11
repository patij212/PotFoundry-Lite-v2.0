// _tierc_winding_diag.test.ts — WINDING-ROOT diagnosis arm (PROD-TIERC, prereg
// E-2026-07-11-TIERC-HEADTOHEAD Addenda 5/7/8). DIAGNOSIS ONLY, no fix.
//
// QUESTION: do Gyroid's A4-orient u-seam defect and DragonScales' B1 Finding-2 z-adoption-seam
// defect share a root winding-orientation convention, or are they distinct mechanisms? This probe
// supplies the missing DS-side EVIDENCE (B1 only measured aggregate counts; no edge/triangle-level
// dump existed) via a CHEAP small-scale rebuild of the EXACT B0/B1-proven adoption primitives
// (`buildK1ZBand`/`buildRingBandRows`/`buildStructuredWall`/`mergeAdoptedAssembly`, all read-only
// imports, zero code duplication of production logic) — the mechanism is scale-invariant (same code
// path B1 measured 7168 on), so a tiny nRing/nThetaRing toy reproduces it in seconds. The Gyroid
// side is characterized from the ALREADY-DUMPED `research/exchange/tierc/armA4_patchDumps.json`
// (A4-diagnosis's own committed probe output) — no rebuild needed, read-only.
//
// RULES: NEW FILE ONLY. Read-only on all src/ and committed research libs. DEV-ONLY, research/
// never imported by src/. Commit nothing (per mission RULES — this file itself is a scratch probe,
// left uncommitted).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildK1ZBand, adoptedThetas, buildRingBandRows, dsRA, mergeAdoptedAssembly,
  RING_Z, SEAM_LO, SEAM_HI, H,
} from './_tierc_b0_toy_lib';
import { buildStructuredWall } from './_sharp3dMesh';
import { nonManRawBigStats } from './labkit';

const ON = process.env.PF_TIERC_WINDING_DIAG === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB = join(OUT_DIR, 'windingDiag_crumbs.ndjson');

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(CRUMB, JSON.stringify({ stage, at: new Date().toISOString(), ...extra }) + '\n');
  } catch { /* breadcrumb must never kill the run */ }
}

const TAU = 2 * Math.PI;

type Source = 'lowerK1' | 'upperK1' | 'ringStruct';

interface TriRec {
  triIdx: number;
  v: [number, number, number];
  source: Source;
  /** local-unwrapped (theta,z) per vertex, for a clean CCW/CW read. */
  thz: Array<[number, number]>;
  signedArea: number; // >0 CCW, <0 CW in (theta,z) plane
}

describe.skipIf(!ON)('WINDING-ROOT diagnosis — DS z-adoption-seam small toy (read-only rebuild)', () => {
  it(
    'dumps offending seam edges + both incident triangles, tagged by source, with (theta,z) winding sign',
    () => {
      crumb('start');
      const rA = dsRA();

      // Small-but-real toy: SAME primitives B0/B1 proved, drastically reduced scale for speed.
      // nRing=16 (power of two, required), nThetaRing=24 (MISMATCHED from nRing — this is the
      // production-representative case: champion recipe nRing=512 != nThetaRing=2400, so
      // buildStructuredWall dispatches its GENERAL stripBetween merge-strip, not the equal-count
      // diagonal-flip branch).
      const K1_OPTS = { nRing: 16, maxSagMm: 0.05, maxEdgeMm: 3, minEdgeMm: 0.15, gradeRatio: 2, maxLevel: 6, resU: 32, resT: 16 };
      const t0 = Date.now();
      const lower = buildK1ZBand(rA, SEAM_LO - 5, SEAM_LO, K1_OPTS);
      const upper = buildK1ZBand(rA, SEAM_HI, SEAM_HI + 5, K1_OPTS);
      crumb('k1-built', { ms: Date.now() - t0, lowerTris: lower.result.indices.length / 3, upperTris: upper.result.indices.length / 3 });

      const lowerAdopted = adoptedThetas(lower, lower.result.topRing);
      const upperAdopted = adoptedThetas(upper, upper.result.bottomRing);
      const rows = buildRingBandRows(rA, RING_Z, SEAM_LO, SEAM_HI, lowerAdopted, upperAdopted, {
        nThetaRing: 24, treadCap: 2, sheetRowsEachSide: 1,
      });
      const ring = buildStructuredWall(rA, H, rows);
      crumb('ring-built', { ringTris: ring.nF, ringVerts: ring.nV });

      const asm = mergeAdoptedAssembly(lower, upper, ring);
      crumb('merged', { totalTris: asm.counts.totalF, totalV: asm.counts.totalV });

      // Non-vacuity / sanity vs B1: raw watertight (index) should be clean (adoption reuses
      // indices, no new seam vertices) — orientation is a SEPARATE audit.
      const stats = nonManRawBigStats(asm.idx);
      crumb('nonman-stats', stats as unknown as Record<string, unknown>);

      // ── triangle source tagging (exact, positional — mirrors mergeAdoptedAssembly's own
      // concat order: lower.indices, then upper.indices (+offset), then ring.idx (remapped)) ──
      const lowerTriN = lower.result.indices.length / 3;
      const upperTriN = upper.result.indices.length / 3;
      const sourceOf = (triIdx: number): Source =>
        triIdx < lowerTriN ? 'lowerK1' : triIdx < lowerTriN + upperTriN ? 'upperK1' : 'ringStruct';

      // ── (theta,z) decode + per-triangle local-unwrap + signed area ──
      const nTri = asm.idx.length / 3;
      const thetaOf = (vi: number): number => {
        const x = asm.xyz[3 * vi], y = asm.xyz[3 * vi + 1];
        let th = Math.atan2(y, x);
        if (th < 0) th += TAU;
        return th;
      };
      const zOf = (vi: number): number => asm.xyz[3 * vi + 2];
      const triRec = (triIdx: number): TriRec => {
        const v: [number, number, number] = [asm.idx[3 * triIdx], asm.idx[3 * triIdx + 1], asm.idx[3 * triIdx + 2]];
        const th0 = thetaOf(v[0]);
        const unwrap = (th: number): number => {
          let d = th - th0;
          if (d > Math.PI) d -= TAU;
          if (d < -Math.PI) d += TAU;
          return th0 + d;
        };
        const thz: Array<[number, number]> = [
          [th0, zOf(v[0])],
          [unwrap(thetaOf(v[1])), zOf(v[1])],
          [unwrap(thetaOf(v[2])), zOf(v[2])],
        ];
        const [[x0, y0], [x1, y1], [x2, y2]] = thz;
        const signedArea = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        return { triIdx, v, source: sourceOf(triIdx), thz, signedArea };
      };

      // Per-source winding-sign tally (systematic CW-vs-CCW convention check).
      const tally: Record<Source, { pos: number; neg: number; zero: number }> = {
        lowerK1: { pos: 0, neg: 0, zero: 0 },
        upperK1: { pos: 0, neg: 0, zero: 0 },
        ringStruct: { pos: 0, neg: 0, zero: 0 },
      };
      for (let t = 0; t < nTri; t++) {
        const r = triRec(t);
        const bucket = r.signedArea > 1e-12 ? 'pos' : r.signedArea < -1e-12 ? 'neg' : 'zero';
        tally[r.source][bucket]++;
      }
      crumb('winding-tally-by-source', tally as unknown as Record<string, unknown>);

      // ── edge classifier (small mesh — Map is fine) ──
      interface EdgeInfo { tris: Array<{ triIdx: number; forward: boolean }>; }
      const edges = new Map<string, EdgeInfo>();
      for (let t = 0; t < nTri; t++) {
        const v0 = asm.idx[3 * t], v1 = asm.idx[3 * t + 1], v2 = asm.idx[3 * t + 2];
        const pairs: Array<[number, number]> = [[v0, v1], [v1, v2], [v2, v0]];
        for (const [a, b] of pairs) {
          if (a === b) continue;
          const lo = a < b ? a : b, hi = a < b ? b : a;
          const key = `${lo}_${hi}`;
          let e = edges.get(key);
          if (!e) { e = { tris: [] }; edges.set(key, e); }
          e.tris.push({ triIdx: t, forward: a === lo });
        }
      }
      let boundary = 0, nonManifold = 0, orientationMismatch = 0;
      const mismatchEdges: Array<{ a: number; b: number; tris: Array<{ triIdx: number; forward: boolean }> }> = [];
      for (const [key, e] of edges) {
        if (e.tris.length === 1) { boundary++; continue; }
        if (e.tris.length > 2) { nonManifold++; continue; }
        const fwdCount = e.tris.filter((x) => x.forward).length;
        if (fwdCount !== 1) {
          orientationMismatch++;
          const [a, b] = key.split('_').map(Number);
          mismatchEdges.push({ a, b, tris: e.tris });
        }
      }
      crumb('edge-classify', { boundary, nonManifold, orientationMismatch, totalEdges: edges.size, nRing: 16, expectedIfSystematic2PerRingSeam: '~2*nRing per seam if systematic' });

      // ── pick 5 representative mismatch edges, preferring cross-source (lowerK1<->ringStruct
      // or upperK1<->ringStruct — the actual ADOPTION boundary) ──
      const dump = mismatchEdges.slice(0, 40).map(({ a, b, tris }) => {
        const triA = triRec(tris[0].triIdx);
        const triB = triRec(tris[1].triIdx);
        return {
          edge: { a, b },
          za: asm.xyz[3 * a + 2], zb: asm.xyz[3 * b + 2],
          thetaA: thetaOf(a), thetaB: thetaOf(b),
          crossSource: triA.source !== triB.source,
          triangles: [triA, triB].map((r) => ({
            triIdx: r.triIdx, verts: r.v, source: r.source,
            thz: r.thz, signedArea: r.signedArea, windingSign: r.signedArea > 0 ? 'CCW' : r.signedArea < 0 ? 'CW' : 'zero',
            forwardOnEdge: tris.find((x) => x.triIdx === r.triIdx)?.forward,
          })),
        };
      });
      writeFileSync(join(OUT_DIR, 'windingDiag_ds_mismatchEdges.json'), JSON.stringify(dump, null, 2));
      writeFileSync(join(OUT_DIR, 'windingDiag_ds_summary.json'), JSON.stringify({
        counts: { boundary, nonManifold, orientationMismatch, totalEdges: edges.size },
        tally,
        crossSourceMismatches: dump.filter((d) => d.crossSource).length,
        sameSourceMismatches: dump.filter((d) => !d.crossSource).length,
        nonManBase: stats,
      }, null, 2));
      crumb('DONE', { orientationMismatch, crossSourceInSample: dump.filter((d) => d.crossSource).length });
      // eslint-disable-next-line no-console
      console.log(`[winding-diag] DS toy: orientationMismatch=${orientationMismatch} boundary=${boundary} nonManifold=${nonManifold}`);
      // eslint-disable-next-line no-console
      console.log(`[winding-diag] per-source winding tally: ${JSON.stringify(tally)}`);
      // eslint-disable-next-line no-console
      console.log(`[winding-diag] first 5 mismatch edges: ${JSON.stringify(dump.slice(0, 5), null, 2)}`);

      // Non-vacuity: the defect must actually exist in this toy for the diagnosis to mean anything.
      expect(orientationMismatch, 'toy must reproduce SOME orientation mismatch (else the toy is not representative)').toBeGreaterThan(0);
    },
    5 * 60 * 1000,
  );
});
