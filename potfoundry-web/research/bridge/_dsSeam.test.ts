// _dsSeam.test.ts — E-2026-07-21-DS-SEAM (S3 / U5.3): the mesher→partition certification seam for the DS cone-fan.
//
// GOAL: take the PRODUCTION DS mesh (src buildDsConeFanWallGeometric) from "geometrically faithful" (DS-COMPOSE) to
// "judge-certifiable" — i.e. its exact-dyadic DOMAIN partition is ACCEPTED by `verifyExactDyadicRectanglePartition`
// (Track A, READ-ONLY here). The judge checks the (u,t) DOMAIN only (integer numerators over N=2^bits, every triangle
// positively oriented + inside [0,N]², artifact indices strictly sorted, no crossing/containment/partial-edge/
// T-junction, EXACT area coverage Σ2·area==2·N²). It does NOT evaluate 3D ⇒ fan-vertex snap δ is for the DOWNSTREAM
// geometric certificate, not this judge.
//
// THE CONE-FAN'S ASSET: it's a structured cylinder grid whose columns sit at EXACT u=i/nU (nU=2^12) ⇒ choosing
// N=nU·2^k makes the grid columns lattice-native BY CONSTRUCTION; the u-seam is welded by index. OPEN gaps to localize:
//   #1 WRAP: the last-column→column-0 triangles span u≈N→u≈0 in the flat rectangle (welded-by-index ≠ seam-split).
//   #2 FAN vertices land at computed (au+f·(bu−au),…) OFF the lattice — do they snap to distinct points / need δ?
//   #3 ZERO-AREA / sliver collapse after snapping (esp. the tread pairs at t=k/8±4e-5).
//
// DISCRIMINATOR (cheapest-first): snap a SMALL cone-fan wall's (u,t) to a well-chosen dyadic N=nU·2^k and feed the
// domain triangles to the judge — let the REJECTION localize #1/#2/#3 BEFORE building any converter. Measure wrap/
// zero-area counts + fan δ. THEN the minimal path (A converter in this probe / B lattice-native emit in src).
//
// PRE-REGISTERED KILL: S3 CLOSED for DS iff the judge ACCEPTS (returns exactPartition, no throw) the cone-fan domain
// partition (complete+valid, no wrap overlap, no zero-area, positive orientation, artifact 1:1) AND (path A) the
// accounted fan δ folds into the geometric bound ≤0.01 AND the 3D mesh is UNCHANGED (converter transforms the DOMAIN
// only ⇒ 3D identical ⇒ DS-COMPOSE 0.0072 preserved trivially). WALL otherwise — name wrap / fan-off-lattice / sliver.
//
// SCOPING — the judge machinery (targetSolid/*) is Track A / concurrent cert-roster territory, READ-ONLY. My editable
// surface: THIS probe (+ config) and, IF the fix is emitter-side, tierC/dsRingStrips.ts behind a default-off flag. A
// path-A converter lives HERE. If S3 requires editing shared judge files, STOP and report (do not edit them).
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  verifyExactDyadicRectanglePartition,
  type ExactDyadicDomainPartitionInput,
  type ExactDyadicMappedTriangle,
} from '../../src/geometry/targetSolid/exactDyadicDomainPartition';
import { buildDsConeFanWallGeometric, buildDsConeFanCertDomain } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { dsRadiusFn, H as DS_H, TOL } from './_ds_prodtruth_lib';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const OUT_DIR = join('research', 'exchange', '_dsSeam');
const NDJSON = join(OUT_DIR, 'seam.ndjson');

function plog(m: string): void { mkdirSync(OUT_DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT_DIR, 'run.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); }
function keyExists(k: string): boolean { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } }); }
function checkpoint(row: Record<string, unknown>): void { mkdirSync(OUT_DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`); }

interface SmallWall { rA: AnalyticRadiusFn; ut: number[]; idx: Uint32Array; nU: number; rows: number; gridVerts: number; tris: number }
/** A SMALL cone-fan wall (coarse schedule) so the domain-triangle count stays under the partition proof cap. */
function buildSmallWall(nU: number, bodyStepMm: number, crestLadderRows: number, patchP: number): SmallWall {
  const rA = dsRadiusFn() as AnalyticRadiusFn;
  const wall = buildDsConeFanWallGeometric(rA, DS_H, nU, { bodyStepMm, crestLadderRows, patchP });
  return { rA, ut: wall.ut, idx: wall.indices, nU: wall.nU, rows: wall.tRows.length, gridVerts: wall.tRows.length * wall.nU, tris: wall.indices.length / 3 };
}
function lift(rA: AnalyticRadiusFn, u: number, t: number): [number, number, number] { const th = TAU * u, z = t * DS_H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; }

describe('DS-SEAM (S3) — cone-fan mesh → exact-dyadic partition certifiability', () => {
  // ARM 1 (SCOPE): snap raw + feed the judge → localize the rejection (#1 wrap / #2 fan / #3 zero-area). Sweep N to
  // separate resolution-limited collapse (drops with N) from structural collapse (persists), and classify by fan-touch.
  it.skipIf(process.env.PF_DSSEAM_SCOPE !== '1')('SCOPE — snap raw, judge REJECTS, localize the gap', () => {
    plog(`=== SCOPE => ${NDJSON} ===`);
    const nU = 128; // ≥96 so p=1 apex blocks (apexes 4 cols apart) do NOT overlap-skip
    const w = buildSmallWall(nU, 3, 2, 1);
    plog(`[SCOPE] nU=${nU} rows=${w.rows} gridVerts=${w.gridVerts} tris=${w.tris} fanVerts=${w.ut.length / 2 - w.gridVerts}`);
    const nF = w.idx.length / 3;
    const isFan = (v: number): boolean => v >= w.gridVerts;
    for (const bits of [16, 18, 20, 22]) {
      const N = 1 << bits;
      const key = `scope|nU${nU}_N${N}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const nV = w.ut.length / 2;
      const uNum = new Int32Array(nV), vNum = new Int32Array(nV);
      for (let i = 0; i < nV; i++) { uNum[i] = Math.round(w.ut[2 * i] * N); vNum[i] = Math.round(w.ut[2 * i + 1] * N); }
      let fanDeltaMax = 0;
      for (let i = w.gridVerts; i < nV; i++) { const p0 = lift(w.rA, w.ut[2 * i], w.ut[2 * i + 1]); const p1 = lift(w.rA, uNum[i] / N, vNum[i] / N); const d = Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]); if (d > fanDeltaMax) fanDeltaMax = d; }
      let wrapTris = 0, zeroArea = 0, zeroFan = 0, negArea = 0, negFan = 0;
      const tris: ExactDyadicMappedTriangle[] = [];
      for (let f = 0; f < nF; f++) {
        const a = w.idx[3 * f], b = w.idx[3 * f + 1], c = w.idx[3 * f + 2];
        const touchesFan = isFan(a) || isFan(b) || isFan(c);
        if (Math.max(uNum[a], uNum[b], uNum[c]) - Math.min(uNum[a], uNum[b], uNum[c]) > N / 2) wrapTris++;
        const area2 = (uNum[b] - uNum[a]) * (vNum[c] - vNum[a]) - (uNum[c] - uNum[a]) * (vNum[b] - vNum[a]);
        if (area2 === 0) { zeroArea++; if (touchesFan) zeroFan++; } else if (area2 < 0) { negArea++; if (touchesFan) negFan++; }
        tris.push({ artifactTriangleIndex: f, vertices: [{ uNumerator: String(uNum[a]), vNumerator: String(vNum[a]) }, { uNumerator: String(uNum[b]), vNumerator: String(vNum[b]) }, { uNumerator: String(uNum[c]), vNumerator: String(vNum[c]) }] });
      }
      plog(`[SCOPE][N=2^${bits}] wrap=${wrapTris} zeroArea=${zeroArea}(fan ${zeroFan}) negArea=${negArea}(fan ${negFan}) fanδmax=${fanDeltaMax.toFixed(6)}mm`);
      const input: ExactDyadicDomainPartitionInput = {
        patchId: 'dsseam-conefan-scope', fractionBits: bits,
        domain: { minUNumerator: '0', maxUNumerator: String(N), minVNumerator: '0', maxVNumerator: String(N) },
        artifactTriangleCount: nF, triangles: tris,
      };
      let rejected = false, detail = '';
      try { const r = verifyExactDyadicRectanglePartition(input); detail = `ACCEPTED tris=${r.triangleCount}`; }
      catch (e) { rejected = true; detail = String(e).slice(0, 200); }
      plog(`[SCOPE][N=2^${bits}] judge: rejected=${rejected} :: ${detail}`);
      checkpoint({ key, nU, N, bits, tris: w.tris, wrapTris, zeroArea, zeroFan, negArea, negFan, fanDeltaMax: +fanDeltaMax.toFixed(6), rejected, detail });
    }
    plog('[SCOPE] DONE');
  }, 15 * 60 * 1000);

  // ARM 2 (CLOSE): build the CUT-AT-GAP cert domain (src buildDsConeFanCertDomain — part (a) winding + relabel the seam
  // onto an apex-gap column so no fan straddles), snap (u_judge,t)→N=2^20, feed the judge, and account the snap δ. The
  // pre-registered kill: S3 CLOSED iff the judge ACCEPTS (positive orientation + no wrap + exact coverage + 1:1 artifact)
  // AND (path A) the accounted δ folds into the geometric bound ≤0.01 (production fwd fidelity 0.005 by E-DS-SLIVER) AND
  // the 3D mesh is unchanged (buildDsConeFanCertDomain positions == the production wall — pinned in dsRingStrips.test.ts).
  // Small representative wall (the cut structure is nU/schedule-independent; production nU=4096 exceeds the judge cap).
  it.skipIf(process.env.PF_DSSEAM_CLOSE !== '1')('CLOSE — cut-at-gap cert domain → judge ACCEPTS + δ folds ≤0.01', () => {
    plog(`=== CLOSE => ${NDJSON} ===`);
    const rA = dsRadiusFn() as AnalyticRadiusFn;
    const nU = 256; // apexColStep=8 > 2·p(3); cut column q=4.
    const bits = 20;
    const N = 1 << bits;
    const FWD_FIDELITY = 0.005; // the E-DS-SLIVER production cone-fan whole-mesh fwd MAX
    // Certify BOTH a coarse wall (fast; exercises the hard fan+cut-at-gap structure) AND the PRODUCTION schedule
    // (crest0/flank2.5/body0.10 — its fine tread-pair rows are the snap risk). The cut-at-gap is schedule-independent
    // by construction; this confirms it empirically (audit-first) rather than assuming the fine rows snap clean.
    const configs: Array<{ tag: string; opts: Parameters<typeof buildDsConeFanCertDomain>[3] }> = [
      { tag: 'coarse', opts: { patchP: 3, bodyStepMm: 2, crestLadderRows: 0 } },
      { tag: 'prod', opts: { patchP: 3 } }, // production defaults (crest 0 / flank 2.5 / body 0.10)
    ];
    for (const cfg of configs) {
      const key = `close|${cfg.tag}|nU${nU}_N${N}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const cert = buildDsConeFanCertDomain(rA, DS_H, nU, cfg.opts);
      const nV = cert.uJudge.length;
      const nF = cert.indices.length / 3;
      const shift = cert.cutColumn / cert.nU;
      // Snap the flat domain to integer numerators over N; grid u snaps EXACTLY (nU | N), only fan-u and t carry δ.
      const uNum = new Int32Array(nV), vNum = new Int32Array(nV);
      for (let v = 0; v < nV; v++) { uNum[v] = Math.round(cert.uJudge[v] * N); vNum[v] = Math.round(cert.t[v] * N); }
      // Path-A δ accounting: the 3D displacement from snapping the domain coords (folds into the geometric bound).
      let maxDelta = 0;
      for (let v = 0; v < nV; v++) {
        let uPhys = uNum[v] / N + shift; uPhys -= Math.floor(uPhys); // recover θ from the cut-relabeled domain u
        const ps = lift(rA, uPhys, vNum[v] / N);
        const d = Math.hypot(ps[0] - cert.positions[3 * v], ps[1] - cert.positions[3 * v + 1], ps[2] - cert.positions[3 * v + 2]);
        if (d > maxDelta) maxDelta = d;
      }
      const tris: ExactDyadicMappedTriangle[] = [];
      for (let f = 0; f < nF; f++) {
        const a = cert.indices[3 * f], b = cert.indices[3 * f + 1], c = cert.indices[3 * f + 2];
        tris.push({ artifactTriangleIndex: f, vertices: [
          { uNumerator: String(uNum[a]), vNumerator: String(vNum[a]) },
          { uNumerator: String(uNum[b]), vNumerator: String(vNum[b]) },
          { uNumerator: String(uNum[c]), vNumerator: String(vNum[c]) },
        ] });
      }
      const input: ExactDyadicDomainPartitionInput = {
        patchId: 'dsseam-conefan-cutgap', fractionBits: bits,
        domain: { minUNumerator: '0', maxUNumerator: String(N), minVNumerator: '0', maxVNumerator: String(N) },
        artifactTriangleCount: nF, triangles: tris,
      };
      let accepted = false, detail = '';
      try {
        const r = verifyExactDyadicRectanglePartition(input, { maxTriangles: 1_048_576 });
        accepted = true; detail = `ACCEPTED tris=${r.triangleCount} exactPartition=${r.exactPartition}`;
      } catch (e) { detail = String(e).slice(0, 300); }
      const folds = FWD_FIDELITY + maxDelta <= TOL;
      const CLOSED = accepted && folds;
      plog(`[CLOSE][${cfg.tag}] nU=${nU} cut@col=${cert.cutColumn} tris=${nF} seamDups=${cert.seamDupCount} N=2^${bits} maxδ=${maxDelta.toFixed(6)}mm judge=${accepted ? 'ACCEPT' : 'REJECT'} :: ${detail}`);
      plog(`[CLOSE][${cfg.tag}] geometric fold: fwd ${FWD_FIDELITY} + δ ${maxDelta.toFixed(6)} = ${(FWD_FIDELITY + maxDelta).toFixed(6)} ≤ ${TOL} ⇒ ${folds} | CLOSED=${CLOSED}`);
      checkpoint({ key, tag: cfg.tag, nU, cutColumn: cert.cutColumn, tris: nF, seamDups: cert.seamDupCount, bits, maxDelta: +maxDelta.toFixed(6), accepted, folds, CLOSED, detail });
      expect(accepted).toBe(true);
      expect(folds).toBe(true);
    }
  }, 15 * 60 * 1000);
});
