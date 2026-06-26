/**
 * featureAlignedCell.test.ts — de-risk (TDD) for the per-cell strip-pave drop-in.
 *
 * Proves, on ONE concrete anisotropic feature cell, that the feature-aligned fill
 * ({@link triangulateFeatureAlignedCell}) beats the plain CDT
 * ({@link triangulateConstrainedCell}) on 3D min-angle WHILE keeping the cell's
 * boundary vertex set unchanged (the watertight registry invariant) and the
 * feature chain a real mesh-edge path. This is the gate the per-cell graft (the
 * FCT_FEATURE_CDT replacement) rests on.
 */
import { describe, it, expect } from 'vitest';
import {
  triangulateConstrainedCell,
  type CellPoint,
  type ConstrainedCellInput,
  type ConstrainedCellResult,
} from './ConstrainedCellTriangulator';
import {
  triangulateFeatureAlignedCell,
  extractSimpleChain,
  type Sampler3D,
} from './featureAlignedCell';

// ── An anisotropic cylinder: circumference 100 mm, height 25 mm. Over the cell's
//    narrow u-range the wall is ~flat, so 3D ≈ (u·100, t·25). A feature crossing
//    near the SW corner forces the plain CDT into a needle. ───────────────────────
const RAD = 100 / (2 * Math.PI);
const HH = 25;
const sampler: Sampler3D = (u, t) => {
  const th = u * 2 * Math.PI;
  return [RAD * Math.cos(th), RAD * Math.sin(th), t * HH];
};

// ── The cell (3D ≈ 5 mm × 5 mm square): a single feature segment enters the bottom
//    edge 1 mm from the SW corner and exits the top edge, near-vertical. ───────────
const boundary: CellPoint[] = [
  { u: 0.0, t: 0.0 }, // 0 SW
  { u: 0.01, t: 0.0 }, // 1 S crossing (1 mm from SW)
  { u: 0.05, t: 0.0 }, // 2 SE
  { u: 0.05, t: 0.2 }, // 3 NE
  { u: 0.04, t: 0.2 }, // 4 N crossing
  { u: 0.0, t: 0.2 }, // 5 NW
];
const input: ConstrainedCellInput = {
  boundary,
  interior: [],
  constraints: [[1, 4]], // S → N
};

const OPTS = { targetEdgeMm: 1.2, minEdgeDist: 2e-6 };

function minAngle3D(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): number {
  const d = (x: readonly number[], y: readonly number[]): number =>
    Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  const A = d(b, c), B = d(c, a), C = d(a, b);
  if (A < 1e-12 || B < 1e-12 || C < 1e-12) return 0;
  const ang = (o1: number, o2: number, op: number): number =>
    Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - op * op) / (2 * o1 * o2))));
  return Math.min(ang(B, C, A), ang(A, C, B), ang(A, B, C)) * (180 / Math.PI);
}

function worstMinAngle3D(result: ConstrainedCellResult, label?: string): number {
  let worst = 180;
  let worstTri: [number, number, number] = [-1, -1, -1];
  for (const [a, b, c] of result.triangles) {
    const pa = sampler(result.points[a].u, result.points[a].t);
    const pb = sampler(result.points[b].u, result.points[b].t);
    const pc = sampler(result.points[c].u, result.points[c].t);
    const m = minAngle3D(pa, pb, pc);
    if (m < worst) { worst = m; worstTri = [a, b, c]; }
  }
  if (label) {
    const fmt = (i: number): string => `${i}(${result.points[i].u.toFixed(4)},${result.points[i].t.toFixed(4)})`;
    // eslint-disable-next-line no-console
    console.log(`[derisk] ${label} worst tri = ${worstTri.map(fmt).join(' ')} nB=${boundary.length}`);
  }
  return worst;
}

/** Undirected mesh-edge set of a result, as "i:j" (i<j) keys. */
function edgeSet(result: ConstrainedCellResult): Set<string> {
  const s = new Set<string>();
  for (const [a, b, c] of result.triangles) {
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      s.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
  }
  return s;
}

const QK = 1 << 24;
const qk = (p: CellPoint): number => Math.round(p.u * QK) * (QK * 2 + 1) + Math.round(p.t * QK);

describe('per-cell strip-pave de-risk — feature-aligned fill vs plain CDT', () => {
  it('the plain CDT genuinely needles on this anisotropic crossing cell (RED baseline)', () => {
    const cdt = triangulateConstrainedCell(input);
    const worst = worstMinAngle3D(cdt);
    // eslint-disable-next-line no-console
    console.log(`[derisk] plain CDT worst 3D min-angle = ${worst.toFixed(2)}°`);
    expect(worst).toBeLessThan(15); // a genuine sub-15° sliver — the defect we target
  });

  it('extractSimpleChain identifies the single through-crossing chain', () => {
    expect(extractSimpleChain(input)).toEqual([1, 4]);
    // Negative control: a degree-3 junction (vertex 4 fans to 1, 2, 5) is rejected.
    expect(extractSimpleChain({ ...input, constraints: [[1, 4], [4, 2], [4, 5]] })).toEqual(null);
    // Negative control: a chain whose interior vertex is a BOUNDARY index (a
    // perimeter-running constraint, not a through-crossing) is rejected.
    expect(extractSimpleChain({ ...input, constraints: [[1, 4], [4, 2]] })).toEqual(null);
  });

  it('the feature-aligned fill eliminates the catastrophic <10° needle and beats CDT', () => {
    // HONEST de-risk bar: the dominant defect (probe) is the catastrophic <10°/<1°
    // needle (98%/100% feature-CDT). Strip-pave must KILL that class and clearly
    // beat the CDT worst angle. On THIS hard cell (a crossing 1 mm from a corner,
    // a WIDE flank against a clean vertex-free cell edge) the residual worst lands
    // in the 15–20° ACCEPT class — reaching a clean ≥20° there needs vertices ON the
    // shared cell edge (the registry force-register / railLines path), which a pure
    // boundary-preserving per-cell fill cannot add. That ≥20° gap is tracked
    // separately; here we pin the catastrophic-needle elimination + the improvement.
    const cdtWorst = worstMinAngle3D(triangulateConstrainedCell(input));
    const aligned = triangulateFeatureAlignedCell(input, sampler, OPTS);
    expect(aligned).not.toBeNull();
    const worst = worstMinAngle3D(aligned!, 'aligned');
    // eslint-disable-next-line no-console
    console.log(`[derisk] feature-aligned worst 3D min-angle = ${worst.toFixed(2)}° (CDT ${cdtWorst.toFixed(2)}°) tris=${aligned!.triangles.length}`);
    expect(worst).toBeGreaterThan(12); // catastrophic <10° class eliminated
    expect(worst).toBeGreaterThan(cdtWorst + 3); // a real, substantial improvement
  });

  it('keeps the cell boundary vertex set UNCHANGED (watertight invariant)', () => {
    const aligned = triangulateFeatureAlignedCell(input, sampler, OPTS)!;
    // The first nB result points are exactly the input boundary, in order.
    for (let i = 0; i < boundary.length; i++) {
      expect(aligned.points[i].u).toBe(boundary[i].u);
      expect(aligned.points[i].t).toBe(boundary[i].t);
    }
    // No NEW vertex lies on the cell perimeter (box edges) — Steiner are interior.
    const onEdge = (p: CellPoint): boolean =>
      Math.abs(p.u - 0.0) < 1e-7 || Math.abs(p.u - 0.05) < 1e-7 ||
      Math.abs(p.t - 0.0) < 1e-7 || Math.abs(p.t - 0.2) < 1e-7;
    const boundaryKeys = new Set(boundary.map(qk));
    for (const p of aligned.points) {
      if (onEdge(p)) expect(boundaryKeys.has(qk(p))).toBe(true);
    }
  });

  it('keeps the feature chain a continuous path of mesh edges (ridge followed)', () => {
    const aligned = triangulateFeatureAlignedCell(input, sampler, OPTS)!;
    const edges = edgeSet(aligned);
    const S = boundary[1], N = boundary[4];
    // Points lying ON the ridge segment S→N (the subdivision stations + endpoints):
    // perpendicular distance ~0 and projection within [0,1].
    const dirU = N.u - S.u, dirT = N.t - S.t;
    const len2 = dirU * dirU + dirT * dirT;
    const onRidge: Array<{ idx: number; s: number }> = [];
    aligned.points.forEach((p, idx) => {
      const s = ((p.u - S.u) * dirU + (p.t - S.t) * dirT) / len2;
      const perpU = p.u - (S.u + s * dirU);
      const perpT = p.t - (S.t + s * dirT);
      if (s >= -1e-9 && s <= 1 + 1e-9 && Math.hypot(perpU, perpT) < 1e-9) {
        onRidge.push({ idx, s });
      }
    });
    onRidge.sort((a, b) => a.s - b.s);
    // The ridge endpoints are present and are exactly boundary 1 (S) and 4 (N).
    expect(onRidge[0].idx).toBe(1);
    expect(onRidge[onRidge.length - 1].idx).toBe(4);
    // Every consecutive on-ridge pair is a real mesh edge ⇒ the feature is followed.
    for (let i = 0; i + 1 < onRidge.length; i++) {
      const a = onRidge[i].idx, b = onRidge[i + 1].idx;
      expect(edges.has(a < b ? `${a}:${b}` : `${b}:${a}`)).toBe(true);
    }
  });

  it('returns null (CDT fallback) for non-simple constraint topology', () => {
    // A closed loop (no boundary endpoints) is not the simple through-crossing case.
    const loop: ConstrainedCellInput = {
      boundary,
      interior: [{ u: 0.02, t: 0.08 }, { u: 0.03, t: 0.08 }, { u: 0.025, t: 0.12 }],
      constraints: [[6, 7], [7, 8], [8, 6]],
    };
    expect(triangulateFeatureAlignedCell(loop, sampler, OPTS)).toBeNull();
  });
});
