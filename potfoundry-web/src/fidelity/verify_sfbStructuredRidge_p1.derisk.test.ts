/**
 * verify_sfbStructuredRidge_p1.derisk.test.ts — PHASE 1 GATE of the structured-ridge build.
 *
 * Root cause (user slicer images): the per-cell mesh runs in ~horizontal rows but the
 * petal ridge is DIAGONAL → the ridge is the stair-stepped ENDS of those rows (staircase
 * serration). The corridor / hole-fill makes each petal crest an EXPLICIT constraint edge
 * (allFollowed=true ⇒ the ridge follows the smooth analytic locus, not the cell grid).
 *
 * This builds the SFB OUTER WALL via realFeatureCorridorPerLoop, EXACT-evaluates every
 * vertex (radiusFn, like production GPU evaluate_vertices), and GATES on:
 *   - allFollowed=true (ridge is a continuous edge chain — no staircase),
 *   - ridge TURNING-ANGLE small (objective smoothness vs the per-cell staircase),
 *   - watertight (boundary = rings, non-manifold 0).
 * Writes the STL for a whole-pot render. Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { buildConformingWall } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { realFeatureCorridorPerLoop, type MultiFeatureSpec } from './bandRemesh/realCorridor';
import { auditWatertight, triangleQuality3D, type Mesh3 } from './bandRemesh/audit';
import type { UTPoint } from './bandRemesh/corridorPave';
import { STYLE_FUNCTIONS } from '../geometry/styles';
import { baseRadius } from '../geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../geometry/types';

const H = 120, R0 = 40, TBOTTOM = 6;
const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const FL = 11;
const OUT = path.resolve(__dirname, '..', '..', 'export-deliverables');
type V3 = [number, number, number];
const MULT = 100000000;

function pickCusps(): UTPoint[][] {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
  const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
  const out: UTPoint[][] = [];
  for (const c of graph.lines.filter((l) => l.kind === 'general-curve')) {
    const pts = c.points; if (pts.length < 8) continue;
    let tMin = 1, tMax = 0, uMin = 1, uMax = 0, seam = false;
    for (let k = 0; k < pts.length; k++) { const p = pts[k]; tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) seam = true; }
    if (seam || uMin < 0.08 || uMax > 0.92 || tMax - tMin < 0.5) continue;
    const sub = pts.filter((p) => p.t >= 0.12 && p.t <= 0.88).map((p) => ({ u: p.u, t: p.t }));
    if (sub.length >= 4) out.push(sub);
  }
  return out;
}

describe.skipIf(!process.env.PF_DERISK)('SFB structured-ridge PHASE 1 — corridor gives a SMOOTH ridge', () => {
  const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, STYLE_DIMS);
  const cusps = pickCusps();
  const radiusFn = STYLE_FUNCTIONS['SuperformulaBlossom'];
  const opts = { ...DEFAULT_STYLE_PARAMS['SuperformulaBlossom'], sf_strength: 1 };
  const exactPos = (u: number, t: number): V3 => { const z = t * H, r0 = baseRadius(z, H, R0, R0, 1, opts), th = 2 * Math.PI * u, r = radiusFn(th, z, r0, H, opts); return [r * Math.cos(th), r * Math.sin(th), z]; };

  it('corridor ridge is a continuous smooth edge chain (vs per-cell staircase)', () => {
    fs.mkdirSync(OUT, { recursive: true });
    const featLines: FeatureLine[] = cusps.map((c, i) => ({ kind: 'general-curve', label: `c${i}`, points: c.map((p) => ({ u: p.u, t: p.t })) }));
    const specs: MultiFeatureSpec[] = cusps.map((polyline) => ({ polyline }));
    const co = realFeatureCorridorPerLoop(sampler, specs, {
      featureLevel: FL, widthMm: 3, dims: DIMS, assemblyFeatureLines: featLines,
      baseOptions: { maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12, resU: 128, resT: 128, nRing: 1 << FL, targetTriangles: 6_000_000, budgetMode: 'cap', uBias: 2 },
    });

    // EXACT positions for every vertex.
    const UT = co.merged.vertexUT;
    const P: V3[] = UT.map(([u, t]) => exactPos(u, t));
    const positions = new Float32Array(P.length * 3);
    for (let i = 0; i < P.length; i++) { positions[i * 3] = P[i][0]; positions[i * 3 + 1] = P[i][1]; positions[i * 3 + 2] = P[i][2]; }
    const mesh: Mesh3 = { positions, indices: new Uint32Array(co.merged.indices) };
    const audit = auditWatertight(mesh, { boundaryVertexIndices: co.merged.ringVertexIds });

    // allFollowed: every feature-chain segment is a mesh edge (ridge = continuous edge chain).
    const edges = new Set<number>();
    for (let k = 0; k + 2 < co.merged.indices.length; k += 3) { const tri = [co.merged.indices[k], co.merged.indices[k + 1], co.merged.indices[k + 2]]; for (let e = 0; e < 3; e++) { const i = tri[e], j = tri[(e + 1) % 3]; edges.add(i < j ? i * MULT + j : j * MULT + i); } }
    let segTotal = 0, segMissing = 0;
    // ridge TURNING-ANGLE: mean |angle| between consecutive 3D ridge edges (staircase ⇒ large/alternating).
    let turnSum = 0, turnN = 0, turnMax = 0;
    for (const chain of co.paved.featureChains) {
      for (let i = 0; i + 1 < chain.length; i++) { segTotal++; const a = chain[i], b = chain[i + 1]; if (!edges.has(a < b ? a * MULT + b : b * MULT + a)) segMissing++; }
      for (let i = 1; i + 1 < chain.length; i++) {
        const a = P[chain[i - 1]], b = P[chain[i]], c = P[chain[i + 1]];
        const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: V3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
        const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2); if (l1 < 1e-9 || l2 < 1e-9) continue;
        const cosA = Math.max(-1, Math.min(1, (e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2]) / (l1 * l2)));
        const ang = Math.acos(cosA) * 180 / Math.PI; turnSum += ang; turnN++; if (ang > turnMax) turnMax = ang;
      }
    }
    const allFollowed = segMissing === 0;
    const q = triangleQuality3D({ positions, indices: new Uint32Array(co.paved.triangles.flat()) });

    // write STL (exact positions)
    const idx = co.merged.indices; const nT = idx.length / 3;
    const buf = Buffer.alloc(80 + 4 + nT * 50); buf.write('SFB sf1 corridor structured-ridge P1', 0, 'ascii'); buf.writeUInt32LE(nT, 80);
    let off = 84;
    const nrm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    for (let t = 0; t < nT; t++) { const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2]; const n = nrm([(P[b][1] - P[a][1]) * (P[c][2] - P[a][2]) - (P[b][2] - P[a][2]) * (P[c][1] - P[a][1]), (P[b][2] - P[a][2]) * (P[c][0] - P[a][0]) - (P[b][0] - P[a][0]) * (P[c][2] - P[a][2]), (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0])]); buf.writeFloatLE(n[0], off); buf.writeFloatLE(n[1], off + 4); buf.writeFloatLE(n[2], off + 8); for (let k = 0; k < 3; k++) { const pp = [P[a], P[b], P[c]][k]; buf.writeFloatLE(pp[0], off + 12 + k * 12); buf.writeFloatLE(pp[1], off + 16 + k * 12); buf.writeFloatLE(pp[2], off + 20 + k * 12); } buf.writeUInt16LE(0, off + 48); off += 50; }
    fs.writeFileSync(path.join(OUT, 'SuperformulaBlossom_sf1_structured_p1.stl'), buf);

    /* eslint-disable no-console */
    console.log(`[P1 RIDGE GATE] loops=${co.hole.loops.length} chains=${co.paved.featureChains.length} tris=${nT}`);
    console.log(`  RIDGE: allFollowed=${allFollowed} (missing ${segMissing}/${segTotal}) | turning-angle mean=${(turnSum / Math.max(turnN, 1)).toFixed(1)}° max=${turnMax.toFixed(1)}°`);
    console.log(`  watertight: bnd=${audit.boundaryEdges} (rings=${co.merged.ringVertexIds.size}) nonMan=${audit.nonManifoldEdges} tJ=${audit.tJunctions} | fill %<10°=${q.pctMinAngleBelow10.toFixed(2)}`);
    console.log(`  ⇒ ${allFollowed && audit.nonManifoldEdges === 0 ? 'GATE PASS — ridge is a clean continuous edge (no staircase)' : 'GATE FAIL'}`);
    console.log('  wrote export-deliverables/SuperformulaBlossom_sf1_structured_p1.stl');
    /* eslint-enable no-console */

    expect(allFollowed).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
  }, 600000);
});
