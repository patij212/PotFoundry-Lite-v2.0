import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS } from '../../../../../geometry/styles';
import type { StyleId } from '../../../../../geometry/types';
import { styleSampler } from '../featureGraph/styleSampler';
import {
  buildConformingOuterWall,
  type ConformingOuterWallOptions,
} from '../ConformingOuterWall';
import { buildTierCOuterWall } from './index';
import { hashMesh } from './__testutil';
import { countInteriorOutliers, liftChartMesh } from './interiorRuler';

// ── Task-6 FINAL GO/NO-GO GATE (env-gated; heavy — hours at full density).
//
// Run: PF_REBASELINE20=1 npx vitest run .../rebaseline20.test.ts
//
// Asserts, with the __pfPerfectMesher flag ON:
//   (a) every count-STABLE style is byte-identical to the flag-OFF output
//       (the Tier-C dispatch fell back — Tier-A/B untouched even flag-on);
//   (b) the count-unstable styles (Gothic/GeoStar) reach literal whole-mesh
//       0 interior outliers, watertight by index.
// The per-style %<20° sliver figure is a REPORT, not a gate (the print-safe
// finite-area needle concession is documented; 13 levers refuted).
//
// THIS TEST DOES NOT FLIP THE FLAG. It is the evidence the flip decision
// reads. Recorded results go to the plan doc / spec ledger when run.
const GATE = process.env.PF_REBASELINE20 === '1';
const GATE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

const DIMS = { H: 120, Rt: 50, Rb: 40 };
const OPTS: ConformingOuterWallOptions = {
  maxSagMm: 0.05,
  maxEdgeMm: 60,
  minEdgeMm: 0.5,
  gradeRatio: 2,
  maxLevel: 8,
  resU: 65,
  resT: 17,
};

function setFlag(on: boolean): void {
  (
    globalThis as unknown as { __pfPerfectMesher?: boolean }
  ).__pfPerfectMesher = on;
}

describe.skipIf(!GATE)('Tier-C 20-style whole-mesh re-baseline gate', () => {
  const styleIds = Object.keys(STYLE_FUNCTIONS) as StyleId[];
  const COUNT_UNSTABLE: StyleId[] = ['GothicArches', 'GeometricStar'];

  it(
    'flag-ON: Tier-A/B byte-identical fallback; count-unstable literal 0-outlier',
    () => {
      const report: Record<string, unknown>[] = [];
      for (const styleId of styleIds) {
        const sampler = styleSampler(styleId, {}, DIMS);
        setFlag(false);
        const off = buildConformingOuterWall(sampler, OPTS);
        setFlag(true);
        const on = buildTierCOuterWall(sampler, OPTS);
        setFlag(false);
        if (!COUNT_UNSTABLE.includes(styleId)) {
          // (a) dispatch fell back — byte-identical.
          expect(hashMesh(on), `${styleId} flag-on must fall back`).toBe(
            hashMesh(off),
          );
          report.push({ styleId, tier: 'A/B', byteIdentical: true });
        } else {
          // (b) the Tier-C path: whole-mesh 0-outlier + watertight by index.
          const uv: number[] = [];
          for (let i = 0; i < on.gridVertexCount; i++) {
            uv.push(on.vertices[3 * i], on.vertices[3 * i + 1]);
          }
          const tris = Array.from(on.indices);
          const outliers = countInteriorOutliers(sampler, { uv, tris }, 0.01);
          // Non-manifold by index (interior edge >2 tris).
          const use = new Map<string, number>();
          for (let f = 0; f < tris.length / 3; f++) {
            const [a, b, c] = [tris[3 * f], tris[3 * f + 1], tris[3 * f + 2]];
            for (const [i, j] of [
              [a, b],
              [b, c],
              [c, a],
            ] as const) {
              const k = i < j ? `${i}_${j}` : `${j}_${i}`;
              use.set(k, (use.get(k) ?? 0) + 1);
            }
          }
          let nonMan = 0;
          for (const n of use.values()) if (n > 2) nonMan++;
          // Sliver REPORT (non-gating): %<20° of 3D min angle.
          const xyz = liftChartMesh(sampler, uv);
          let below = 0;
          const nF = tris.length / 3;
          for (let f = 0; f < nF; f++) {
            const [a, b, c] = [tris[3 * f], tris[3 * f + 1], tris[3 * f + 2]];
            const L = (p: number, q: number): number =>
              Math.hypot(
                xyz[3 * p] - xyz[3 * q],
                xyz[3 * p + 1] - xyz[3 * q + 1],
                xyz[3 * p + 2] - xyz[3 * q + 2],
              );
            const la = L(b, c);
            const lb = L(c, a);
            const lc = L(a, b);
            const angle = (opp: number, s1: number, s2: number): number =>
              (Math.acos(
                Math.max(
                  -1,
                  Math.min(1, (s1 * s1 + s2 * s2 - opp * opp) / (2 * s1 * s2)),
                ),
              ) *
                180) /
              Math.PI;
            const minA = Math.min(
              angle(la, lb, lc),
              angle(lb, lc, la),
              angle(lc, la, lb),
            );
            if (minA < 20) below++;
          }
          report.push({
            styleId,
            tier: 'C',
            outliers,
            nonMan,
            tris: nF,
            pctBelow20: +((100 * below) / nF).toFixed(1),
          });
          expect(outliers, `${styleId} whole-mesh outliers`).toBe(0);
          expect(nonMan, `${styleId} non-manifold`).toBe(0);
        }
        // eslint-disable-next-line no-console
        console.log(`[rebaseline20] ${JSON.stringify(report[report.length - 1])}`);
      }
      // eslint-disable-next-line no-console
      console.log(`[rebaseline20 FINAL] ${JSON.stringify(report)}`);
      expect(report.length).toBe(styleIds.length);
    },
    GATE_TIMEOUT_MS,
  );
});
