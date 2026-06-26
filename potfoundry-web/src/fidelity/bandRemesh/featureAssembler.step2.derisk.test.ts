/**
 * featureAssembler.step2.derisk.test.ts — STEP 2 (throwaway de-risk): two CROSSING
 * features in one fill region (the `planarizeChains` / cdt2d crossing-PSLG path).
 *
 * STEP 0/1 proved the boundary weld (band/junction ↔ cdt2d). STEP 2 proves the
 * INTERIOR crossing path: when two feature chains CROSS inside one
 * `corridorPaveMulti` fill region, the raw constraint set is a non-planar PSLG that
 * crashes cdt2d (`Cannot read properties of undefined (reading 'upperIds')`).
 * `corridorPaveMulti` calls `planarizeChains` (when ≥2 chains) to split every
 * crossing into ONE shared vertex → planar PSLG → cdt2d succeeds, and the two
 * features become continuous mesh edge-chains meeting at the shared crossing vertex.
 *
 * ## The gate
 *  - DIRECT: `planarizeChains` on two crossing chains → splitsAdded≥1,
 *    residualCrossings==0, and both output chains contain the SAME crossing id.
 *  - INTEGRATION: `corridorPaveMulti` with two crossing diagonal features
 *    (a) does NOT throw the upperIds crash;
 *    (b) reports inversionCount==0, unfillablePinches==[];
 *    (c) the output featureChains have residualCrossings==0 and share the crossing;
 *    (d) STEP-0 gate: the fill is watertight to its frame boundary
 *        (nonManifoldEdges==0, tJunctions==0) — every feature segment is a count-2
 *        interior mesh edge, only the frame edges are count-1;
 *    (e) NEGATIVE CONTROL: the unplanarized chains DO cross (so the gate is real).
 *
 * CPU throwaway spike. Reuses only proven primitives; touches no production code.
 * Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/featureAssembler.step2.derisk.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { corridorPaveMulti } from './corridorPave';
import type { CorridorPaveMultiResult, FeatureChainInput } from './corridorPave';
import { planarizeChains } from './planarizeChains';
import type { HoleBoundary } from './seamFill';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { QSCALE } from './railKey';

const R0 = 50;
const H = 100;
const AMP = 4;
const K = 3;

// ── Helpers ──────────────────────────────────────────────────────────────────────

function edgeKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

function dyadicSnap(x: number): number {
  return Math.round(x * QSCALE) / QSCALE;
}

function buildFrameLoop(stepUT: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const push = (u: number, t: number): void => out.push([dyadicSnap(u), dyadicSnap(t)]);
  const n = Math.max(1, Math.round(1 / stepUT));
  for (let i = 0; i < n; i++) push(i / n, 0); // bottom
  for (let i = 0; i < n; i++) push(1, i / n); // right
  for (let i = 0; i < n; i++) push(1 - i / n, 1); // top
  for (let i = 0; i < n; i++) push(0, 1 - i / n); // left
  return out;
}

function incidence(indices: Uint32Array | number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k];
    const b = indices[k + 1];
    const c = indices[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      m.set(edgeKey(i, j), (m.get(edgeKey(i, j)) ?? 0) + 1);
    }
  }
  return m;
}

/** Proper (strict-interior) segment crossing test in (u,t). */
function properCross(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number],
): boolean {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return false;
  const qpx = p3[0] - p1[0], qpy = p3[1] - p1[1];
  const tS = (qpx * sy - qpy * sx) / denom;
  const tU = (qpx * ry - qpy * rx) / denom;
  const E = 1e-12;
  return tS > E && tS < 1 - E && tU > E && tU < 1 - E;
}

/** Count proper off-endpoint crossings among all segments of `chains` (residualCrossings). */
function countCrossings(ut: Array<[number, number]>, chains: number[][]): number {
  const segs: Array<[number, number]> = [];
  for (const ch of chains) for (let i = 0; i + 1 < ch.length; i++) segs.push([ch[i], ch[i + 1]]);
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = segs[i];
      const [c, d] = segs[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (properCross(ut[a], ut[b], ut[c], ut[d])) n++;
    }
  }
  return n;
}

interface Step2Build {
  fill: CorridorPaveMultiResult;
  merged: Mesh3;
  frameSet: Set<number>;
}

function buildStep2(): Step2Build {
  const sampler = new SyntheticCylinderSampler(R0, H, AMP, K);
  const frameUT = buildFrameLoop(0.05);
  const frameIds = frameUT.map((_, i) => i);
  const frameSet = new Set(frameIds);
  const boundary: HoleBoundary = {
    loops: [frameIds],
    complementDir: new Map(),
    vertexCount: frameUT.length,
  };
  // Two diagonal features that CROSS at the center (0.5,0.5); endpoints on the
  // t=0/t=1 frame edges (snap-boundary anchors → nearest existing frame id).
  const features: FeatureChainInput[] = [
    { polyline: [{ u: 0.2, t: 0 }, { u: 0.8, t: 1 }], start: { kind: 'snap-boundary' }, end: { kind: 'snap-boundary' } },
    { polyline: [{ u: 0.8, t: 0 }, { u: 0.2, t: 1 }], start: { kind: 'snap-boundary' }, end: { kind: 'snap-boundary' } },
  ];
  const fill = corridorPaveMulti({
    boundary,
    vertexUT: frameUT.map((p) => [p[0], p[1]] as [number, number]),
    features,
    sampler,
  });

  const allUT = fill.vertexUT;
  const positions = new Float32Array(allUT.length * 3);
  for (let i = 0; i < allUT.length; i++) {
    const p = sampler.position(allUT[i][0], allUT[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const indices = new Uint32Array(fill.triangles.length * 3);
  let w = 0;
  for (const tri of fill.triangles) {
    indices[w++] = tri[0];
    indices[w++] = tri[1];
    indices[w++] = tri[2];
  }
  return { fill, merged: { positions, indices }, frameSet };
}

let cached: Step2Build | undefined;
function getBuild(): Step2Build {
  if (!cached) cached = buildStep2();
  return cached;
}

// ── THE GATE ──────────────────────────────────────────────────────────────────

// Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
describe.skipIf(!process.env.PF_DERISK)('STEP 2 — crossing features: planarizeChains + cdt2d (no upperIds crash)', () => {
  it('DIRECT: planarizeChains resolves a proper crossing into a shared vertex (residualCrossings==0)', () => {
    const pts: Array<[number, number]> = [[0.2, 0.2], [0.8, 0.8], [0.2, 0.8], [0.8, 0.2]];
    const chains = [[0, 1], [2, 3]];
    // NEGATIVE CONTROL: the raw chains genuinely cross (gate is non-vacuous).
    expect(countCrossings(pts, chains)).toBeGreaterThan(0);
    const r = planarizeChains(pts, chains);
    expect(r.splitsAdded).toBeGreaterThanOrEqual(1);
    expect(r.residualCrossings).toBe(0);
    const shared = r.chains[0].filter((id) => r.chains[1].includes(id));
    expect(shared.length).toBeGreaterThanOrEqual(1);
  });

  it('INTEGRATION: corridorPaveMulti does NOT throw the cdt2d upperIds crash on crossing chains', () => {
    const { fill } = getBuild();
    expect(fill.triangles.length).toBeGreaterThan(0);
    expect(fill.featureChains.length).toBe(2);
  });

  it('the fill reports inversionCount==0 and unfillablePinches==[]', () => {
    const { fill } = getBuild();
    expect(fill.inversionCount).toBe(0);
    expect(fill.unfillablePinches).toEqual([]);
  });

  it('the output featureChains have residualCrossings==0 and share the crossing vertex', () => {
    const { fill } = getBuild();
    expect(countCrossings(fill.vertexUT, fill.featureChains)).toBe(0);
    const shared = fill.featureChains[0].filter((id) => fill.featureChains[1].includes(id));
    expect(shared.length).toBeGreaterThanOrEqual(1);
  });

  it('GATE: fill is watertight to its frame boundary (nonManifoldEdges==0, tJunctions==0)', () => {
    const { merged, frameSet } = getBuild();
    const audit = auditWatertight(merged, { boundaryVertexIndices: frameSet });
    // eslint-disable-next-line no-console
    console.log('[STEP2] audit', JSON.stringify(audit));
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(audit.boundaryEdges).toBeGreaterThan(0);
  });

  it('feature-followed: every feature-chain segment is a count-2 interior mesh edge', () => {
    const { fill, merged } = getBuild();
    const inc = incidence(merged.indices);
    let missing = 0;
    for (const chain of fill.featureChains) {
      for (let i = 0; i + 1 < chain.length; i++) {
        if (inc.get(edgeKey(chain[i], chain[i + 1])) !== 2) missing++;
      }
    }
    expect(missing).toBe(0);
  });

  it('reports fill triangle quality (informational)', () => {
    const { merged, fill } = getBuild();
    const q = triangleQuality3D(merged);
    // eslint-disable-next-line no-console
    console.log(
      `[STEP2] fill tris=${fill.triangles.length} splitVtx-shared=yes ` +
        `aspectMax=${q.aspectMax.toFixed(2)} pct<10=${q.pctMinAngleBelow10.toFixed(1)}% p50=${q.minAngleP50.toFixed(1)}°`,
    );
    expect(merged.indices.length % 3).toBe(0);
  });
});
