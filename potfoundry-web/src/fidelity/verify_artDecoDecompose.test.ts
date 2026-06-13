/**
 * verify_artDecoDecompose.test.ts — DECOMPOSE ArtDeco's surface deviation by
 * feature family BEFORE building extractors (audit-first; the t-step-only attempt
 * regressed). rOuterArtDeco = fanMod · stepFactor · (1 + chevronMod). The params
 * isolate each family:
 *   - adGeometricBlend=1 ⇒ fanMod=1 (FAN off), chevronMod on
 *   - adGeometricBlend=0 ⇒ fanMod on, chevronMod=0 (CHEVRON off)
 *   - adChevronAmp=0     ⇒ CHEVRON off
 *   - adStepDepth=0      ⇒ STEP off
 * Measures the chord deviation of a fixed uniform mesh (no edges) vs each isolated
 * surface — the family whose presence drives the deviation is the one needing
 * edges. Pure CPU, read-only, no production change.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS, type StyleFunction } from '../geometry/styles';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { deviationVsTrueSurface } from './fidelityGate';

const H = 120, Rt = 70, Rb = 45, expn = 1.1;
const fn: StyleFunction = STYLE_FUNCTIONS['ArtDeco'];
type V3 = readonly [number, number, number];
const mk = (opts: Record<string, number>) => (u: number, t: number): V3 => {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const theta = 2 * Math.PI * u, z = tc * H, r0 = Rb + (Rt - Rb) * Math.pow(tc, expn);
  let r = fn(theta, z, r0, H, opts);
  if (!Number.isFinite(r)) r = r0;
  return [r * Math.cos(theta), r * Math.sin(theta), z];
};

describe('ArtDeco family decomposition (which family needs edges?)', () => {
  it('isolates fan / chevron / step deviation on a fixed uniform mesh', () => {
    const level = 7, uBias = 2, seamExclU = 1.5 / (1 << (level + uBias));
    const uSpan = 1 << (level + uBias), tSpan = 1 << level;
    const leaves: QuadLeaf[] = [];
    for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
    const qt: QuadtreeLike = { leaves: () => leaves, uBias: () => uBias };
    const meshObj = triangulateQuadtreeWithFeatures(qt, [], { cornerSnap: 0.06 / (1 << level) });
    const mesh = { vertices: Array.from(meshObj.vertices), indices: Array.from(meshObj.indices) };

    const configs: Array<{ name: string; opts: Record<string, number> }> = [
      { name: 'FULL (all families)', opts: {} },
      { name: 'STEP only (no fan, no chevron)', opts: { adGeometricBlend: 1, adChevronAmp: 0 } },
      { name: 'CHEVRON only (no fan, no step)', opts: { adGeometricBlend: 1, adStepDepth: 0 } },
      { name: 'FAN only (no chevron, no step)', opts: { adGeometricBlend: 0, adChevronAmp: 0, adStepDepth: 0 } },
      { name: 'no STEP (fan+chevron)', opts: { adStepDepth: 0 } },
      { name: 'no CHEVRON (fan+step)', opts: { adChevronAmp: 0 } },
      { name: 'no FAN (chevron+step)', opts: { adGeometricBlend: 1 } },
    ];
    /* eslint-disable no-console */
    console.log('\n===== ArtDeco family decomposition (uniform mesh chord dev vs isolated surface, seam excl) =====');
    console.log('  config                          | max mm | p99 mm | #>tol');
    for (const c of configs) {
      const d = deviationVsTrueSurface(mesh, mk(c.opts), { tolMm: 0.05, seamExclU });
      console.log(`  ${c.name.padEnd(31)} | ${d.maxMm.toFixed(3).padStart(6)} | ${d.p99Mm.toFixed(3).padStart(6)} | ${d.nAbove}`);
    }
    console.log('  => the family whose REMOVAL drops the deviation most is the dominant edge-requiring family.');
    console.log('=============================================================================================\n');
    /* eslint-enable no-console */
    expect(mesh.indices.length).toBeGreaterThan(0);
  }, 180000);
});
