import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterCelticKnot } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  celticKnotDeclaredComplex,
  celticKnotOuterWallTargetForProof,
  createCelticKnotOuterWallTargetBinding,
  type CelticKnotOuterWallPatch,
  type CelticKnotOuterWallTargetBinding,
} from './celticKnotOuterWallTarget';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'CelticKnot',
    style,
    { superformulaSeamBlendDegrees: 30 }
  );
}

function distance(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function outer(binding: CelticKnotOuterWallTargetBinding): CelticKnotOuterWallPatch {
  const patch = binding.patches.find(
    (candidate): candidate is CelticKnotOuterWallPatch =>
      candidate.kind === 'outer-wall'
  );
  if (patch === undefined) throw new Error('missing outer wall');
  return patch;
}

/** Cylindrical radius of an evaluated patch point (mm). */
const rad = (p: readonly [number, number, number]): number => Math.hypot(p[0], p[1]);

/** Analytic base radius r0 at height fraction t, for the default test geometry (mm). */
function r0At(t: number): number {
  return baseRadius(
    DEFAULT_GEOMETRY.H * t,
    DEFAULT_GEOMETRY.H,
    DEFAULT_GEOMETRY.bottom_od / 2,
    DEFAULT_GEOMETRY.top_od / 2,
    DEFAULT_GEOMETRY.expn,
    DEFAULT_GEOMETRY
  );
}

describe('Celtic Knot generated outer-wall target', () => {
  it('matches production CPU radius away from declared branch loci', () => {
    const canonicalInput = input();
    const patch = outer(createCelticKnotOuterWallTargetBinding(canonicalInput));
    for (const [u, t] of [
      [0.137, 0.213],
      [0.421, 0.537],
      [0.783, 0.819],
    ] as const) {
      const z = DEFAULT_GEOMETRY.H * t;
      const r0 = baseRadius(
        z,
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.bottom_od / 2,
        DEFAULT_GEOMETRY.top_od / 2,
        DEFAULT_GEOMETRY.expn,
        DEFAULT_GEOMETRY
      );
      const expected = rOuterCelticKnot(
        2 * Math.PI * u,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      const point = patch.backends.evaluateFloat64(u, t);
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 8);
      expect(point[2]).toBeCloseTo(z, 12);
    }
  });

  it('declares the finite foreground/background and occlusion discontinuities', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    expect(binding.internalRibbonDiscontinuitiesActive).toBe(true);
    expect(binding.completeInternalFeatureSideGraphEmitted).toBe(false);
    expect(binding.regularityObligationsCanonicalJson).toContain(
      'foreground-background-radial-jump'
    );
    expect(binding.regularityObligationsCanonicalJson).toContain(
      'z-buffer-occlusion-ties'
    );
  });

  it('closes the column-phase seam with a physical curtain', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    const wall = outer(binding);
    const curtain = binding.patches.find((patch) => patch.kind === 'seam-curtain');
    expect(binding.seamCurtainActive).toBe(true);
    expect(binding.periodicIdentificationAdmissible).toBe(false);
    expect(curtain).toBeDefined();
    if (curtain === undefined || curtain.kind !== 'seam-curtain') return;
    for (const t of [0, 0.17, 0.53, 1]) {
      expect(distance(
        curtain.backends.evaluateFloat64(t, 0),
        wall.backends.evaluateFloat64(0, t)
      )).toBeLessThan(1e-9);
      expect(distance(
        curtain.backends.evaluateFloat64(t, 1),
        wall.backends.evaluateFloat64(1, t)
      )).toBeLessThan(1e-9);
    }
  });

  it('omits all degenerate closure surfaces when relief is zero', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input({ ck_relief: 0 }));
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.internalRibbonDiscontinuitiesActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    expect(binding.patchCount).toBe(1);
  });

  // Building every strand count now also emits the feature-side curtain complex
  // (ribbon + occlusion). Occlusion count grows ~quadratically (54 patches at the
  // default 3 strands, 482 at 8), so the full 2..8 sweep needs a wider timeout than
  // the 5s default. Per-patch node counts stay small (<600); only the count grows.
  it('statically unrolls every admitted strand count', { timeout: 60000 }, () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      const binding = createCelticKnotOuterWallTargetBinding(
        input({ ck_strands: count })
      );
      expect(binding.strandCount).toBe(count);
      expect(outer(binding).nodeCount).toBeLessThan(8192);
    }
  });

  it('reauthenticates its patch set and refuses copies or the wrong style', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    expect(celticKnotOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      celticKnotOuterWallTargetForProof(
        Object.freeze({ ...binding }) as CelticKnotOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createCelticKnotOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'Crystalline',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected CelticKnot/i);
  });
});

describe('Celtic Knot ribbon↔background feature curtains (P2)', () => {
  it('emits one ribbon-curtain per declared ribbon-background segment when relief>0', () => {
    const canonicalInput = input();
    const binding = createCelticKnotOuterWallTargetBinding(canonicalInput);
    const cx = celticKnotDeclaredComplex(canonicalInput);
    const declaredRibbon = cx.segments.filter((s) => s.kind === 'ribbon-background');
    const ribbonPatches = binding.patches.filter((p) => p.kind === 'ribbon-curtain');
    expect(declaredRibbon.length).toBeGreaterThan(0);
    expect(ribbonPatches.length).toBe(declaredRibbon.length);
    for (const patch of ribbonPatches) {
      expect(patch.role).toBe('feature-curtain');
      expect(patch.programSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(patch.nodeCount).toBeGreaterThan(0);
      expect(patch.nodeCount).toBeLessThan(8192);
    }
  });

  it('welds each ribbon curtain to the analytic one-sided limits (upper=r0, lower=r0-jump)', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    const jump = 2.0 * 0.3; // default ck_relief=2.0 -> jump 0.6 mm
    const ribbonPatches = binding.patches.filter((p) => p.kind === 'ribbon-curtain');
    let worst = 0;
    for (const patch of ribbonPatches) {
      for (const s of [0.15, 0.5, 0.85]) {
        const pUp = patch.backends.evaluateFloat64(s, 1);
        const pLo = patch.backends.evaluateFloat64(s, 0);
        const t = pUp[2] / DEFAULT_GEOMETRY.H; // z = H*t
        const r0 = r0At(t);
        expect(pLo[2]).toBeCloseTo(pUp[2], 9); // v=0 and v=1 share the (u,t) locus
        worst = Math.max(worst, Math.abs(rad(pUp) - r0), Math.abs(rad(pLo) - (r0 - jump)));
      }
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('emits no feature curtains when relief is zero (patchCount stays 1)', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input({ ck_relief: 0 }));
    expect(binding.patches.some((p) => p.role === 'feature-curtain')).toBe(false);
    expect(binding.patchCount).toBe(1);
  });
});

describe('Celtic Knot internal occlusion feature curtains (P2)', () => {
  it('emits one occlusion-curtain per declared occlusion segment when relief>0', () => {
    const canonicalInput = input();
    const binding = createCelticKnotOuterWallTargetBinding(canonicalInput);
    const cx = celticKnotDeclaredComplex(canonicalInput);
    const declaredOcc = cx.segments.filter((s) => s.kind === 'occlusion');
    const occPatches = binding.patches.filter((p) => p.kind === 'occlusion-curtain');
    expect(declaredOcc.length).toBeGreaterThan(0);
    expect(occPatches.length).toBe(declaredOcc.length);
    for (const patch of occPatches) expect(patch.nodeCount).toBeLessThan(8192);
  });

  it('occlusion curtains are non-degenerate raised steps (delta-nudge picks the under strand)', () => {
    const binding = createCelticKnotOuterWallTargetBinding(input());
    const occPatches = binding.patches.filter((p) => p.kind === 'occlusion-curtain');
    for (const patch of occPatches) {
      const lo = rad(patch.backends.evaluateFloat64(0.5, 0));
      const up = rad(patch.backends.evaluateFloat64(0.5, 1));
      const t = patch.backends.evaluateFloat64(0.5, 0)[2] / DEFAULT_GEOMETRY.H;
      expect(lo).toBeCloseTo(r0At(t), 4); // lower lip = over-strand foot r0
      expect(up).toBeGreaterThan(lo + 0.05); // a genuine step UP to a ribbon (NOT collapsed)
    }
  });

  it('occlusion curtains weld to the outer-wall one-sided limits across the over-edge', () => {
    const canonicalInput = input();
    const binding = createCelticKnotOuterWallTargetBinding(canonicalInput);
    const wall = outer(binding);
    const cx = celticKnotDeclaredComplex(canonicalInput);
    const occ = cx.segments
      .map((seg, i) => ({ seg, i }))
      .filter((e) => e.seg.kind === 'occlusion');
    const dU = 1e-6;
    let checked = 0;
    let worst = 0;
    for (const { seg, i } of occ) {
      const patch = binding.patches.find((p) => p.patchId === `feature-curtain-occ-${i}`);
      expect(patch).toBeDefined();
      if (patch === undefined) continue;
      for (const f of [0.3, 0.5, 0.7]) {
        const { u, t } = seg.at(f);
        const materialU = u / (2 * Math.PI); // spin=0 => material = placement angle
        const lo = rad(patch.backends.evaluateFloat64(f, 0));
        const up = rad(patch.backends.evaluateFloat64(f, 1));
        const rIn = rad(wall.backends.evaluateFloat64(materialU - seg.side * dU, t)); // over foot ~ r0
        const rOut = rad(wall.backends.evaluateFloat64(materialU + seg.side * dU, t)); // under surface
        if (rOut - rIn > 0.05) {
          checked += 1;
          worst = Math.max(worst, Math.abs(up - rOut), Math.abs(lo - rIn));
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.02);
  });
});
