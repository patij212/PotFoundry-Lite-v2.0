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
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  verifyExactDyadicRectanglePartition,
  type ExactDyadicDomainPartitionInput,
  type ExactDyadicMappedTriangle,
} from '../../src/geometry/targetSolid/exactDyadicDomainPartition';
import { buildDsConeFanWallGeometric } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { dsRadiusFn, H as DS_H } from './_ds_prodtruth_lib';
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
  // ARM 1 (SCOPE): snap raw + feed the judge → localize the rejection (#1 wrap / #2 fan / #3 zero-area).
  it.skipIf(process.env.PF_DSSEAM_SCOPE !== '1')('SCOPE — snap raw, judge REJECTS, localize the gap', () => {
    plog(`=== SCOPE => ${NDJSON} ===`);
    const nU = 64, k = 10; const N = nU * (1 << k); const bits = Math.round(Math.log2(N)); // N=2^16, nU=2^6 divides it
    const w = buildSmallWall(nU, 3, 2, 1);
    const key = `scope|nU${nU}_N${N}`;
    if (keyExists(key)) { plog(`[skip] ${key}`); return; }
    plog(`[SCOPE] nU=${nU} rows=${w.rows} gridVerts=${w.gridVerts} tris=${w.tris} N=${N} (2^${bits})`);
    const nV = w.ut.length / 2;
    const uNum = new Int32Array(nV), vNum = new Int32Array(nV);
    for (let i = 0; i < nV; i++) { uNum[i] = Math.round(w.ut[2 * i] * N); vNum[i] = Math.round(w.ut[2 * i + 1] * N); }
    // fan δ: max surface displacement from snapping the FAN vertices (index >= gridVerts).
    let fanDeltaMax = 0, fanVerts = 0;
    for (let i = w.gridVerts; i < nV; i++) {
      fanVerts++;
      const p0 = lift(w.rA, w.ut[2 * i], w.ut[2 * i + 1]);
      const p1 = lift(w.rA, uNum[i] / N, vNum[i] / N);
      const d = Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]); if (d > fanDeltaMax) fanDeltaMax = d;
    }
    const nF = w.idx.length / 3;
    let wrapTris = 0, zeroArea = 0, negArea = 0;
    const tris: ExactDyadicMappedTriangle[] = [];
    for (let f = 0; f < nF; f++) {
      const a = w.idx[3 * f], b = w.idx[3 * f + 1], c = w.idx[3 * f + 2];
      if (Math.max(uNum[a], uNum[b], uNum[c]) - Math.min(uNum[a], uNum[b], uNum[c]) > N / 2) wrapTris++;
      const area2 = (uNum[b] - uNum[a]) * (vNum[c] - vNum[a]) - (uNum[c] - uNum[a]) * (vNum[b] - vNum[a]);
      if (area2 === 0) zeroArea++; else if (area2 < 0) negArea++;
      tris.push({ artifactTriangleIndex: f, vertices: [{ uNumerator: String(uNum[a]), vNumerator: String(vNum[a]) }, { uNumerator: String(uNum[b]), vNumerator: String(vNum[b]) }, { uNumerator: String(uNum[c]), vNumerator: String(vNum[c]) }] });
    }
    plog(`[SCOPE] wrapTris=${wrapTris} zeroAreaAfterSnap=${zeroArea} negArea=${negArea} fanVerts=${fanVerts} fanDeltaMax=${fanDeltaMax.toFixed(6)}mm`);
    const input: ExactDyadicDomainPartitionInput = {
      patchId: 'dsseam-conefan-scope', fractionBits: bits,
      domain: { minUNumerator: '0', maxUNumerator: String(N), minVNumerator: '0', maxVNumerator: String(N) },
      artifactTriangleCount: nF, triangles: tris,
    };
    let rejected = false, detail = '';
    try { const r = verifyExactDyadicRectanglePartition(input); detail = `ACCEPTED tris=${r.triangleCount}`; }
    catch (e) { rejected = true; detail = String(e).slice(0, 240); }
    plog(`[SCOPE] judge: rejected=${rejected} :: ${detail}`);
    checkpoint({ key, nU, N, bits, tris: w.tris, wrapTris, zeroAreaAfterSnap: zeroArea, negArea, fanVerts, fanDeltaMax: +fanDeltaMax.toFixed(6), rejected, detail });
    plog('[SCOPE] DONE');
  }, 15 * 60 * 1000);
});
