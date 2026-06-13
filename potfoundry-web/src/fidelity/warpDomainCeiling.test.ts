/**
 * warpDomainCeiling.test.ts — TDD guard + reporting harness for the GLOBAL
 * feature-aligned warp ceiling (`runWarpDomainCeilingAudit`).
 *
 * The sibling crestAlignedCeiling proved a ONE-crest shear cures the slivers in
 * ISOLATION; this audit tiles the GLOBAL warp φ = u·m(t) across the WHOLE SFB@1
 * domain (m(t)=6→10), covering crests, valleys, inter-feature bulk, the
 * NON-INTEGER periodic seam, and the petal births. It measures, in 3D on the
 * true surface (never in (u,t)/(φ,t)): the region-tagged cell ceiling, the
 * Jacobian SIGN (fold detection), the seam-closure gap (mm), and the birth-row
 * cell quality. The test logs the full distribution and pins only structural
 * invariants (the instrument runs; the seam closes by construction; the
 * coordinate change is a monotone bijection) — the angle NUMBERS are reported,
 * not gated (a fold or transition sliver reported truthfully is the deliverable).
 */
import { describe, it, expect } from 'vitest';
import { runWarpDomainCeilingAudit } from './warpDomainCeiling';

describe('warpDomainCeiling — global feature-aligned warp φ = u·m(t)', () => {
  it('reports the full-domain ceiling, fold sign, seam gap, and births', () => {
    // THREE configs:
    //  (a) AUTO aspect (cross ≤ along, 3D-square) — the faithful cure;
    //  (b) AUTO aspect at widthScale 2 (cross ≤ 2×along) — the aspect-cliff
    //      check (the blueprint says widthScale=2 REGRESSES to ~50% sub-15°);
    //  (c) FIXED 2 φ/petal at tRows=64 — the deliberately aspect-VIOLATING
    //      coarse-φ control (cross ≫ along ⇒ confirms the sliver collapse).
    const configs: Array<{ label: string; opts: Parameters<typeof runWarpDomainCeilingAudit>[0] }> = [
      { label: 'AUTO aspect≤1 (3D-square)', opts: { tRows: 64, aspectMax: 1 } },
      { label: 'AUTO aspect≤2 (cliff)', opts: { tRows: 64, aspectMax: 2 } },
      { label: 'FIXED 2/petal (aspect-VIOLATING control)', opts: { tRows: 64, phiSamplesPerPetal: 2 } },
    ];
    for (const { label, opts } of configs) {
      const r = runWarpDomainCeilingAudit(opts);

      const pct = (x: number): string => (100 * x).toFixed(2) + '%';
      const fmt = (s: typeof r.all): string =>
        `n=${s.count} min=${s.minDeg.toFixed(2)}° p05=${s.p05Deg.toFixed(2)}° ` +
        `med=${s.medianDeg.toFixed(2)}° <15°=${s.below15} (${pct(s.fracBelow15)}) ` +
        `<20°=${s.below20} (${pct(s.fracBelow20)})`;

      /* eslint-disable no-console */
      console.log(
        `\n══ WARP-DOMAIN CEILING [${label}]  φ=u·m(t)  m:${r.config.mBase.toFixed(2)}→` +
          `${r.config.mTop.toFixed(2)}  φ/petal=${r.config.phiSamplesPerPetal}` +
          `${r.config.aspectDerived ? ' (auto)' : ' (fixed)'}  tRows=${r.config.tRows} ══`,
      );
      console.log(
        `  ASPECT : worstPetalCross=${r.config.worstPetalCrossMm.toFixed(2)}mm ` +
          `along=${r.config.alongSpacingAtWorstMm.toFixed(3)}mm ` +
          `achieved cross/along=${r.config.achievedAspect.toFixed(3)} (target ≤${r.config.aspectMax})`,
      );
      console.log(`  ALL    : ${fmt(r.all)}`);
      console.log(`  CREST  : ${fmt(r.crest)}`);
      console.log(`  VALLEY : ${fmt(r.valley)}`);
      console.log(`  BULK   : ${fmt(r.bulk)}`);
      console.log(`  SEAM   : ${fmt(r.seam)}`);
      console.log(`  BIRTH  : ${fmt(r.birth)}`);
      console.log(
        `  JACOBIAN: samples=${r.jacobian.samples} +${r.jacobian.positiveSign} ` +
          `−${r.jacobian.negativeSign} ~0:${r.jacobian.nearZero} ` +
          `singleSigned=${r.jacobian.singleSigned} ` +
          `minAbsArea=${r.jacobian.minAbsSignedArea.toExponential(3)} ` +
          `minPlanarDet=${r.jacobian.minPlanarDet.toFixed(5)}`,
      );
      console.log(
        `  SEAM-GAP: max=${r.seamGap.maxGapMm.toExponential(3)}mm ` +
          `rms=${r.seamGap.rmsGapMm.toExponential(3)}mm worstT=${r.seamGap.worstT.toFixed(3)} ` +
          `φ@seam(=m(t))=${r.seamGap.worstPhiAtSeam.toFixed(3)}`,
      );
      console.log(
        `  BIRTHS : ${r.births.length} → ` +
          r.births
            .map((b) => `${b.kind}#${b.j}@t=${b.tBirth.toFixed(3)}(φ=${b.phi})`)
            .join(', '),
      );
      /* eslint-enable no-console */

      // ── Structural invariants (by construction) ──
      // The instrument actually ran over the full domain.
      expect(r.all.count).toBeGreaterThan(100);
      expect(r.crest.count).toBeGreaterThan(0);

      // The seam closes EXACTLY by periodicity P(0,t) = P(1,t) — the watertight
      // proof. Floor at f32-class jitter; SfbWallSampler is pure f64 so it is 0.
      expect(r.seamGap.maxGapMm).toBeLessThan(1e-6);

      // The (φ,t)→(u,t) coordinate change is a monotone bijection: ∂u/∂φ = 1/m
      // > 0 everywhere (no PLANAR fold). m ≤ mTop ⇒ minPlanarDet ≥ 1/mTop.
      expect(r.jacobian.minPlanarDet).toBeGreaterThan(0);
      expect(r.jacobian.minPlanarDet).toBeGreaterThanOrEqual(1 / r.config.mTop - 1e-9);

      // Births: m(t)=6→10 ⇒ 4 new petals = the half-integer/integer crossings
      // of m between 6 and 10. (crest j=7..10 at m=6.5..9.5; valley j=7..10 at
      // m=7..10 — but m reaches 10 only AT t=1, so valley#10 may be excluded.)
      expect(r.births.length).toBeGreaterThanOrEqual(4);

      // The aspect constraint is actually HONORED in the AUTO modes (≤ target).
      if (r.config.aspectDerived) {
        expect(r.config.achievedAspect).toBeLessThanOrEqual(r.config.aspectMax + 1e-6);
        // With ≥4 φ/petal there ARE interior bulk cells and valley flanks.
        expect(r.bulk.count).toBeGreaterThan(0);
        expect(r.valley.count).toBeGreaterThan(0);
      }
    }
  });
});
