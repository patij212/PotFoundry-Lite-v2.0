// _frontierBuild3fProbe.test.ts — DEV-ONLY (env PF_BUILD3F=1). LOCALIZE the irreducible true-3D residual: is the
// ~0.13mm worst a genuine geometric C0 cusp, or a TOPOLOGY BUG (non-manifold from chordSteiner that guardManifold
// misses)? Three methods froze at ~0.13mm (density/radial-Steiner/perp-reinjection) AND nonMan oscillated 1→0→2.
// This rebuilds B (chordSteiner), finds WHERE true-3D>0.03 concentrates (perpendicular3DDeviation collectAboveTol),
// lists the non-manifold vertices' (u,t), tests CO-LOCATION (is the worst residual AT a non-manifold vertex?), and
// measures local surface sharpness (cusp = derivative kink). Isolated: CALLS the kernel; edits nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildMeshUt, buildFeatureTruth, liftUtToRadial,
  perpendicular3DDeviation, type StyleDims, type AnalyticRadiusFn,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const SEAM = 0.01, TAU = 2 * Math.PI;
const OPTS = { tolMm: 0.004, hMin: 0.003, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.01, chordSteiner: true } as const;

/** non-manifold vertices by 3D-weld index: vertices touching any edge with >2 incident faces. Returns their (u,t). */
function nonManUt(xyz: Float64Array, ut: number[], idx: number[]): Array<{ u: number; t: number; v: number }> {
  const q = 1e4; const keyOf = (i: number): string => `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`;
  const weld = new Map<string, number>(); const rep = new Int32Array(xyz.length / 3);
  for (let i = 0; i < xyz.length / 3; i++) { const k = keyOf(i); let r = weld.get(k); if (r === undefined) { r = i; weld.set(k, i); } rep[i] = r; }
  const ec = new Map<string, number>(); const eKey = (a: number, b: number): string => a < b ? `${a}_${b}` : `${b}_${a}`;
  for (let f = 0; f < idx.length / 3; f++) { const a = rep[idx[3 * f]], b = rep[idx[3 * f + 1]], c = rep[idx[3 * f + 2]]; for (const [x, y] of [[a, b], [b, c], [c, a]] as const) { const k = eKey(x, y); ec.set(k, (ec.get(k) ?? 0) + 1); } }
  const bad = new Set<number>();
  for (const [k, v] of ec) if (v > 2) { const [a, b] = k.split('_').map(Number); bad.add(a); bad.add(b); }
  const out: Array<{ u: number; t: number; v: number }> = [];
  for (let i = 0; i < rep.length; i++) if (bad.has(rep[i]) && rep[i] === i) out.push({ u: ((ut[2 * i] % 1) + 1) % 1, t: ut[2 * i + 1], v: i });
  return out;
}

/** cusp score at (u,t): central 2nd-difference of rA along u and t (large ⇒ curvature spike / kink). */
function sharpness(u: number, t: number, rA: AnalyticRadiusFn, H: number): { grad: number; curv: number } {
  const du = 5e-4, dt = 5e-4, th = TAU * u, z = t * H;
  const r0 = rA(th, z), rup = rA(TAU * (u + du), z), rum = rA(TAU * (u - du), z), rtp = rA(th, (t + dt) * H), rtm = rA(th, (t - dt) * H);
  const gu = (rup - rum) / (2 * du), gt = (rtp - rtm) / (2 * dt);
  const cu = (rup - 2 * r0 + rum) / (du * du), ct = (rtp - 2 * r0 + rtm) / (dt * dt);
  return { grad: Math.hypot(gu, gt), curv: Math.hypot(cu, ct) };
}

describe('FRONTIER BUILD #3f — localize the residual (cusp vs topology bug)', () => {
  it.skipIf(process.env.PF_BUILD3F !== '1')('GothicArches: where is the ~0.13mm true-3D worst?', () => {
    mkdirSync('research/exchange/_build3f', { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const skeleton = [...planarizeSegments(segmentsFromLines(refined, SEAM)).points];
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, injectedPoints: skeleton, pinInjected: true });
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
    const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
    const p3 = perpendicular3DDeviation({ vertices: vtx, indices: Uint32Array.from(idx) }, ut, rA, { H: DIMS.H, tolMm: 0.03, collectAboveTol: 4000 });
    const nm = nonManUt(meshUt.xyz, ut, idx);
    const above = (p3.aboveTolSamples ?? []).slice().sort((a, b) => b.mm - a.mm);

    // co-location: for each of the top-15 above-tol samples, nearest non-manifold vertex distance in (u,t)
    const near = (u: number, t: number): number => { let d = Infinity; for (const m of nm) { const du = Math.min(Math.abs(u - m.u), 1 - Math.abs(u - m.u)); const dd = Math.hypot(du, t - m.t); if (dd < d) d = dd; } return d; };
    const out: string[] = [];
    out.push(`BUILD3f GothicArches tris=${idx.length / 3} | true3D chordMax=${p3.chordMaxMm.toFixed(4)} worst@θ=${p3.worst.theta.toFixed(3)},z=${p3.worst.z.toFixed(2)} (u=${(((p3.worst.theta / TAU) % 1 + 1) % 1).toFixed(3)},t=${(p3.worst.z / DIMS.H).toFixed(3)}) | aboveTol=${above.length} | nonManVerts=${nm.length}`);
    out.push(`  top-15 above-0.03 true-3D samples — (u,t), mm, sharpness(grad,curv), dist-to-nearest-nonManVert:`);
    for (const s of above.slice(0, 15)) { const sh = sharpness(s.u, s.t, rA, DIMS.H); out.push(`    u=${s.u.toFixed(3)} t=${s.t.toFixed(3)} mm=${s.mm.toFixed(4)} grad=${sh.grad.toFixed(1)} curv=${sh.curv.toFixed(0)} nmDist=${near(s.u, s.t).toFixed(4)}`); }
    // how many of the above-tol samples sit within 0.005 (u,t) of a non-manifold vertex?
    let coloc = 0; for (const s of above) if (near(s.u, s.t) < 0.005) coloc++;
    out.push(`  CO-LOCATION: ${coloc}/${above.length} above-tol samples within 0.005(u,t) of a non-manifold vertex (${(100 * coloc / Math.max(1, above.length)).toFixed(1)}%)`);
    out.push(`  nonMan (u,t) sample: ${nm.slice(0, 8).map((m) => `(${m.u.toFixed(3)},${m.t.toFixed(3)})`).join(' ')}`);
    out.push(`  VERDICT: ${coloc / Math.max(1, above.length) > 0.5 ? 'TOPOLOGY-BUG-DOMINATED (residual co-located with non-manifold verts → fixable)' : 'GEOMETRY (residual NOT at non-manifold verts → genuine steep-feature floor)'}`);
    // eslint-disable-next-line no-console
    console.log(out.join('\n'));
    expect(idx.length).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
