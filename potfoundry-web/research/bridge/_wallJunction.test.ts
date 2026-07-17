// _wallJunction.test.ts — DEV-ONLY (PF_WALL_JUNCTION=1). Stage A of the crossing-
// junction handling for the double-valued wall (follows _wallSpike.test.ts / GO).
//
// The wall spike proved a SINGLE snaking cliff meshes to <0.01. The remaining
// production risk is the CROSSING JUNCTION: where two ribbon cliff curves meet.
// Before constructing a wall through a junction I must CHARACTERIZE it — a T, Y,
// or X? how many surface sheets meet? — because guessing the topology would be
// dishonest. This stage reads the local structure straight off rA.
//
// GEOMETRY (project_c0_scan_verdict + styles.ts occlusion): every CelticKnot
// cliff lies on an analytic edge curve  localU = x_i(t) ± strandW,  where
// x_i(t) = amp·sin(t·tightness·TAU·3 + phase_i) is strand i's centerline. Because
// zHeight_i depends on t ONLY, at any t one strand is unambiguously "over"; the
// other passes under (occluded). A JUNCTION is where two edge curves intersect.
// Strands 0,1 cross centerlines at t=7/18 (x_0=x_1); the four ±edge intersections
// bound the overlap cell. This probe locates them and samples a small ring around
// each to count arms and read the radius level in every sector.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import { baseRadius } from '../../src/geometry/profile';
import { type StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_wallspike');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

// ---- CelticKnot cliff model, defaults ----
const NUM_COLUMNS = 3;
const STRAND_W = 0.15 * 0.15;   // 0.0225
const AMP = 0.4;
const TIGHTNESS = 0.5;
const N_STRANDS = 3;
const PHASE_STEP = TAU / N_STRANDS;

/** strand i centerline in localU at height-fraction t (column 0). */
const xCenter = (i: number, t: number): number => AMP * Math.sin(t * TIGHTNESS * TAU * 3 + i * PHASE_STEP);
/** localU → theta (column 0 tiling). */
const localUToTheta = (localU: number): number => (localU / 2 + 0.5) / NUM_COLUMNS * TAU;

describe('WALL-JUNCTION stage A — characterize', () => {
  it.skipIf(process.env.PF_WALL_JUNCTION !== '1')('map the topology of a ribbon crossing', () => {
    const rA = buildRadiusFn('CelticKnot' as StyleId, {}, DIMS);
    const rAt = (localU: number, t: number): number => rA(localUToTheta(localU), t * DIMS.H);
    const tC = 7 / 18; // strand 0/1 centerline crossing

    /* eslint-disable no-console */
    console.log(`\n[junction] centerline crossing strands 0,1 at t=${tC.toFixed(4)}  x0=${xCenter(0, tC).toFixed(4)} x1=${xCenter(1, tC).toFixed(4)}`);
    console.log(`[junction] over-strand test: zH0=${Math.sin((tC * TIGHTNESS * TAU * 3) * 2).toFixed(3)} zH1=${Math.sin((tC * TIGHTNESS * TAU * 3 + PHASE_STEP) * 2).toFixed(3)} (higher = over)`);

    // ---- locate the four ±edge intersections near tC ----
    // edge curves: e0 = x0 + s0·sW, e1 = x1 + s1·sW. Intersect where e0=e1.
    const findJ = (s0: number, s1: number): { t: number; localU: number } | null => {
      const f = (t: number): number => (xCenter(0, t) + s0 * STRAND_W) - (xCenter(1, t) + s1 * STRAND_W);
      let a = tC - 0.06, b = tC + 0.06, fa = f(a);
      // scan for a sign change bracket nearest tC
      let best: { t: number; localU: number } | null = null;
      const STEP = 0.0005;
      for (let t = a + STEP; t <= b; t += STEP) {
        const ft = f(t);
        if (fa === 0 || (fa < 0) !== (ft < 0)) {
          let lo = t - STEP, hi = t;
          for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if ((f(lo) < 0) !== (f(m) < 0)) hi = m; else lo = m; }
          const tj = (lo + hi) / 2;
          if (!best || Math.abs(tj - tC) < Math.abs(best.t - tC)) best = { t: tj, localU: xCenter(0, tj) + s0 * STRAND_W };
        }
        fa = ft;
      }
      return best;
    };

    // ---- ring sampler: distinct radius LEVELS + arm count around a junction ----
    const ring = (localU: number, t: number): { arms: number; levels: number[]; radii: number[] } => {
      const rhoU = 0.35 * STRAND_W, rhoT = 0.35 * STRAND_W; // small, both axes
      const NA = 240;
      const radii: number[] = [];
      for (let k = 0; k < NA; k++) {
        const phi = TAU * (k / NA);
        radii.push(rAt(localU + rhoU * Math.cos(phi), t + rhoT * Math.sin(phi)));
      }
      // arms = number of jumps (>0.1mm) going around the ring
      let arms = 0;
      for (let k = 0; k < NA; k++) if (Math.abs(radii[k] - radii[(k + 1) % NA]) > 0.1) arms++;
      // distinct levels (cluster by 0.05mm)
      const sorted = [...radii].sort((x, y) => x - y);
      const levels: number[] = [];
      for (const v of sorted) if (!levels.length || Math.abs(v - levels[levels.length - 1]) > 0.05) levels.push(v);
      return { arms, levels, radii };
    };

    const r0 = baseRadius(tC * DIMS.H, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1, {});
    console.log(`[junction] reference levels @t≈${tC.toFixed(3)}: background r0-0.6=${(r0 - 0.6).toFixed(3)}, ribbon foot r0=${r0.toFixed(3)}, ribbon peak≤r0+2=${(r0 + 2).toFixed(3)}`);

    const combos: Array<[number, number, string]> = [[1, 1, '+0/+1'], [1, -1, '+0/-1'], [-1, 1, '-0/+1'], [-1, -1, '-0/-1']];
    const found: Array<{ combo: string; t: number; localU: number; arms: number; levels: number[] }> = [];
    for (const [s0, s1, tag] of combos) {
      const j = findJ(s0, s1);
      if (!j) { console.log(`  combo ${tag}: no intersection near tC`); continue; }
      const { arms, levels } = ring(j.localU, j.t);
      found.push({ combo: tag, t: j.t, localU: j.localU, arms, levels });
      console.log(`  junction ${tag}: t=${j.t.toFixed(4)} localU=${j.localU.toFixed(4)}  ARMS=${arms}  levels=[${levels.map((v) => v.toFixed(2)).join(', ')}]`);
    }

    // ---- INTERNAL occlusion cliff: is there a strand0-over → strand1-under step
    // INSIDE the diamond, and does it TAPER to 0 at the corners? This decides the
    // construction: if it tapers, the internal wall pinches into the outer wall at
    // the junction vertex (tractable); if not, we have a full-height internal wall
    // dead-ending mid-face. Cross strand0's +edge at t slices through the diamond;
    // classify the step (0.6=bg, <0.6&>0.05=occlusion, ~0=none). ----
    const dLU = 1e-4;
    const classifyStep = (jump: number): string =>
      Math.abs(jump) < 0.05 ? 'none' : Math.abs(jump - 0.6) < 0.06 ? 'bg-wall(0.6)' : `occlusion(${jump.toFixed(2)})`;
    console.log(`[junction] INTERNAL step across strand-0 +edge, t slices through the diamond [${(tC - 0.008).toFixed(3)}..${(tC + 0.008).toFixed(3)}]:`);
    let maxOcc = 0;
    for (let t = tC - 0.008; t <= tC + 0.008001; t += 0.001) {
      const lu = xCenter(0, t) + STRAND_W;           // strand0's +edge
      const jump = rAt(lu - dLU, t) - rAt(lu + dLU, t); // inside(strand0) - outside(strand1 or bg)
      const kind = classifyStep(jump);
      if (kind.startsWith('occlusion')) maxOcc = Math.max(maxOcc, Math.abs(jump));
      console.log(`    t=${t.toFixed(4)}  jump=${jump.toFixed(3)}mm  ${kind}`);
    }
    console.log(`[junction] max INTERNAL occlusion step = ${maxOcc.toFixed(3)}mm (tapers toward 0 at the ±corners if construction is tractable)`);
    /* eslint-enable no-console */
    save('junction_topology', { tC, r0, found, maxInternalOcclusionMm: maxOcc });
  }, 600_000);

  // Stage B — WATERTIGHTNESS = vertex pinch. A junction is meshable watertight iff
  // ALL walls meeting there share ONE double-vertex. That holds iff, at the exact
  // junction point, the surface collapses to exactly TWO radius levels (the shared
  // upper/lower lip) — the ribbon sheets both pinch to foot r0 and background sits
  // r0−0.6 below. If 3+ levels PERSISTED to the point, three walls of distinct
  // heights could not share a vertex ⇒ an unavoidable crack. Shrink a ring onto
  // each junction and count persistent levels: PASS iff → 2.
  it.skipIf(process.env.PF_WALL_JUNCTION !== '1')('junction pinches to a shared double-vertex (watertight)', () => {
    const rA = buildRadiusFn('CelticKnot' as StyleId, {}, DIMS);
    const rAt = (localU: number, t: number): number => rA(localUToTheta(localU), t * DIMS.H);
    const tC = 7 / 18;
    const r0 = baseRadius(tC * DIMS.H, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1, {});

    const levelsAt = (localU: number, t: number, rho: number): number[] => {
      const NA = 360; const vals: number[] = [];
      for (let k = 0; k < NA; k++) { const phi = TAU * (k / NA); vals.push(rAt(localU + rho * STRAND_W * Math.cos(phi), t + rho * STRAND_W * Math.sin(phi))); }
      vals.sort((a, b) => a - b);
      const lv: number[] = [];
      for (const v of vals) if (!lv.length || v - lv[lv.length - 1] > 0.03) lv.push(v);
      return lv;
    };

    const junctions: Array<[number, number, string]> = [
      [-0.1775, tC, 'Right +0/+1'], [-0.2225, tC, 'Left -0/-1'],
      [-0.1996, 0.3958, 'Top +0/-1'], [-0.1996, 0.3820, 'Bottom -0/+1'],
    ];
    /* eslint-disable no-console */
    console.log(`\n[junction-B] shared-vertex pinch (expect levels → 2 = {r0-0.6, r0} = {${(r0 - 0.6).toFixed(2)}, ${r0.toFixed(2)}}):`);
    let allPinch = true;
    const rows: Array<{ label: string; counts: number[]; finalLevels: number[]; pinch: boolean }> = [];
    for (const [lu, t, label] of junctions) {
      const rhos = [0.3, 0.1, 0.03, 0.01, 0.003];
      const counts = rhos.map((rho) => levelsAt(lu, t, rho).length);
      const finalLevels = levelsAt(lu, t, 0.003);
      const pinch = counts[counts.length - 1] === 2;
      allPinch = allPinch && pinch;
      rows.push({ label, counts, finalLevels, pinch });
      console.log(`  ${label.padEnd(14)} levels@ρ=[.3 .1 .03 .01 .003]·sW = [${counts.join(' ')}]  final=[${finalLevels.map((v) => v.toFixed(2)).join(', ')}]  ${pinch ? 'PINCH✓' : 'NO-PINCH✗'}`);
    }
    console.log(`\n[junction-B] ===== VERDICT =====`);
    console.log(`  ${allPinch ? '>>> PASS — every junction pinches to ONE shared double-vertex ⇒ the wall network is watertight-by-construction (3-sheet Y with vertex-compatible walls)' : '>>> FAIL — a junction keeps 3+ levels to the point ⇒ walls cannot share a vertex (crack risk)'}`);
    console.log(`  Handling recipe: shared (r0, r0−0.6) double-vertex at each Y; 2 outer ribbon↔bg walls (0.6mm) + 1 internal occlusion wall (0→0.65mm, tapers to 0 at the vertex); under-strand outer wall terminates INTO the vertex.`);
    /* eslint-enable no-console */
    save('junction_pinch', { tC, r0, rows, allPinch });
  }, 600_000);
});
