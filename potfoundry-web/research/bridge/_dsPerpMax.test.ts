// _dsPerpMax.test.ts — E-2026-07-14-DS-PERP-MAX (PF_DSPERPMAX=1 body decompose / PF_DSPERPMAX_COMP=1 cliff composite).
//
// GOAL (user + coordinator mandate): the FAITHFUL continuous worst-case (MAX/Hausdorff, not p99) of the serialized DS
// outer wall vs the EXACT closed 3D solid, decomposed by locus class so the RIGHT ruler scores each:
//   (a) ON-SURFACE (single-valued) facets  → RADIAL own-(u,t) chord is faithful (perp can wrong-well OVERSTATE, or
//       adjacent-foot UNDERSTATE). Also report the EXACT-perp (projectPointToRadialSurface on exact rA) + its FOOT so
//       we can SEE whether the perp foot stayed own-region (Δazimuth ≈ 0) or jumped to the adjacent scale.
//   (b) CLIFF / step facets (ring risers, rim)  → the closed-object BVH (V11g composite = min sheet+riser-wall) is
//       faithful; perp-to-continuous-sheet OVERSTATES there (the dumped heatmap's density-invariant 0.81 tail).
//
// The prior DS-INTERIOR-CLOSE gated on composite BODY p99 (0.0071) with max 0.0498 as a soft secondary. The user's
// corrected PASS = continuous perpendicular MAX ≤ 0.01 EVERYWHERE. This probe measures the FAITHFUL MAX per class on
// the meshes ALREADY dumped to disk (dsOFF 682k, dsFINE 3.26M — research/exchange/_dsInteriorClose/*.xyz/.idx.bin) so
// it is MEASUREMENT-ONLY (no 5-9 min kernel rebuild) and resilient.
//
// KILL-CRITERION (pre-registered, before measuring): the DS mesh PASSES the user standard iff the FAITHFUL continuous
// MAX (max over: body EXACT-perp own-region, ring/rim composite) ≤ 0.01 EVERYWHERE. If the faithful body MAX > 0.01
// and is a REAL on-surface chord sag (perp foot own-region, radial≈perp order-of-magnitude) → NOT a pass, name the
// locus + the density/guard tri cost. If 0.049 is a perp wrong-well OVERSTATE (foot jumps azimuth, radial ≪ perp) →
// the faithful body number is the (smaller) radial own-region and DS may already pass on-surface — prove it.
//
// DEV-ONLY; research/ only; never edits src/. Reuses _ds_prodtruth_lib (V11g ruler + dsRadiusFn + ring classify) +
// _pf_bvhRuler.loadBinMesh + labkit.projectPointToRadialSurface READ-ONLY. Every unit is keyExists-checkpointed.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectPointToRadialSurface } from './labkit';
import { loadBinMesh } from './_pf_bvhRuler';
import {
  dsRadiusFn, dragonRings, classifyRingBand, buildConformRuler, scoreBodyFacets, scoreRingBandFacets,
  radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';

const TAU = 2 * Math.PI;
const SCALES_PER_ROW = 16;                       // scale angular width = TAU/16 → half-width = TAU/32
const SCALE_HALF_AZ = TAU / (2 * SCALES_PER_ROW); // azimuth jump beyond this ⇒ perp foot is on the ADJACENT scale
const BIN_DIR = join('research', 'exchange', '_dsInteriorClose');
const OUT_DIR = join('research', 'exchange', '_dsPerpMax');
const RES = join(OUT_DIR, 'result.ndjson');
const WORST = join(OUT_DIR, 'worstFacets.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(file: string, k: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(file: string, row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(file, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}
const wrap1 = (u: number): number => ((u % 1) + 1) % 1;

interface FacetGeom { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; }
function facetGeom(xyz: Float32Array, idx: Uint32Array, f: number): FacetGeom {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
  return {
    ax: xyz[3 * a], ay: xyz[3 * a + 1], az: xyz[3 * a + 2],
    bx: xyz[3 * b], by: xyz[3 * b + 1], bz: xyz[3 * b + 2],
    cx: xyz[3 * c], cy: xyz[3 * c + 1], cz: xyz[3 * c + 2],
  };
}
/** dense-bary max of a per-sample scalar over a facet (DENSE = 45-pt lattice incl. edges/vertices). */
function denseMax(g: FacetGeom, fn: (px: number, py: number, pz: number) => number): number {
  let mx = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * g.ax + wb * g.bx + wc * g.cx, py = wa * g.ay + wb * g.by + wc * g.cy, pz = wa * g.az + wb * g.bz + wc * g.cz;
    const d = fn(px, py, pz); if (d > mx) mx = d;
  }
  return mx;
}

const MESHES: Array<{ name: string; arm: string }> = [
  { name: 'dsOFF', arm: 'OFF|h0.05' },
  { name: 'dsFINE', arm: 'combo|fine|h0.02' },
];

describe('DS PERP-MAX — faithful continuous worst-case, decomposed on-surface vs cliff', () => {
  // ── UNIT A: body ON-SURFACE decomposition (exact rA only, no twin) — radial own-region vs exact-perp + FOOT. ──
  for (const M of MESHES) {
    it.skipIf(process.env.PF_DSPERPMAX !== '1')(`BODY ${M.name} — radial own-region vs exact-perp + foot`, () => {
      if (keyExists(RES, `body:${M.name}`)) { plog(`[skip body] ${M.name}`); return; }
      const rA = dsRadiusFn();
      const { xyz, idx } = loadBinMesh(join(BIN_DIR, `${M.name}.xyz.bin`), join(BIN_DIR, `${M.name}.idx.bin`));
      const nF = idx.length / 3;
      const ringZs = dragonRings().map((r) => r.z);
      const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
      const body: number[] = [];
      for (let f = 0; f < nF; f++) if (cls(f) === 'body') body.push(f);
      plog(`[${M.name}] loaded ${nF} tris, ${body.length} body facets`);

      // PASS 1 — radial own-region dense max over ALL body facets (cheap; faithful on-surface ruler).
      const radMax = new Float64Array(body.length);
      let rWorst = 0;
      const radialAt = (px: number, py: number, pz: number): number => radialBoundAt(rA, px, py, pz);
      for (let i = 0; i < body.length; i++) {
        const g = facetGeom(xyz, idx, body[i]);
        const rm = denseMax(g, radialAt);
        radMax[i] = rm; if (rm > rWorst) rWorst = rm;
      }
      const rSorted = Float64Array.from(radMax).sort();
      plog(`[${M.name}] radial own-region body: max=${rWorst.toFixed(6)} p99=${pct(rSorted, 0.99)}`);

      // PASS 2 — EXACT-perp (projectPointToRadialSurface on exact rA) on facets whose radial max > 0.008 (perp ≤ radial
      // always, so radial ≤ 0.008 ⇒ perp ≤ 0.008 ≤ tol — cannot drive the max). Record perp max + FOOT for worst-K.
      const PERP_PREFILTER = 0.008;
      const perpAt = (px: number, py: number, pz: number): number => projectPointToRadialSurface(px, py, pz, rA).dist;
      const cand: number[] = [];
      for (let i = 0; i < body.length; i++) if (radMax[i] > PERP_PREFILTER) cand.push(i);
      const perpMax = new Float64Array(body.length); // 0 for prefiltered-green
      let pWorst = 0;
      for (let ci = 0; ci < cand.length; ci++) {
        const i = cand[ci];
        const g = facetGeom(xyz, idx, body[i]);
        const pm = denseMax(g, perpAt);
        perpMax[i] = pm; if (pm > pWorst) pWorst = pm;
      }
      // For prefiltered-green facets, perp ≤ radial ≤ 0.008 → set perp = radial as its sound upper bound for stats.
      for (let i = 0; i < body.length; i++) if (perpMax[i] === 0) perpMax[i] = radMax[i];
      const pSorted = Float64Array.from(perpMax).sort();
      plog(`[${M.name}] exact-perp body: max=${pWorst.toFixed(6)} p99=${pct(pSorted, 0.99)} (cand=${cand.length})`);

      // WORST-K decomposition by EXACT-perp: dump the worst facets with FOOT azimuth-jump + radial/perp + ring dist.
      const order = cand.slice().sort((a, b) => perpMax[b] - perpMax[a]).slice(0, 20);
      const worstRows: Array<Record<string, unknown>> = [];
      for (const i of order) {
        const f = body[i];
        const g = facetGeom(xyz, idx, f);
        const cxx = (g.ax + g.bx + g.cx) / 3, cyy = (g.ay + g.by + g.cy) / 3, czz = (g.az + g.bz + g.cz) / 3;
        // exact-perp at centroid + foot
        const proj = projectPointToRadialSurface(cxx, cyy, czz, rA);
        let cAz = Math.atan2(cyy, cxx); if (cAz < 0) cAz += TAU;
        let fAz = proj.theta % TAU; if (fAz < 0) fAz += TAU;
        let dAz = Math.abs(fAz - cAz); if (dAz > Math.PI) dAz = TAU - dAz;
        // nearest ring distance
        let nearRing = Infinity; for (const rz of ringZs) nearRing = Math.min(nearRing, Math.abs(czz - rz));
        worstRows.push({
          key: `${M.name}:w${worstRows.length}`, mesh: M.name, f,
          u: +wrap1(cAz / TAU).toFixed(5), t: +(czz / DS_H).toFixed(5), z: +czz.toFixed(3),
          radial: +radMax[i].toFixed(6), perp: +perpMax[i].toFixed(6),
          footDeltaAzScaleWidths: +(dAz / SCALE_HALF_AZ).toFixed(3), footDz: +(proj.z - czz).toFixed(3),
          nearestRingMm: +nearRing.toFixed(3),
          adjacentFoot: dAz > SCALE_HALF_AZ, // perp foot jumped past a scale half-width ⇒ on the adjacent scale
        });
      }
      for (const wr of worstRows) append(WORST, wr);

      // faithful ON-SURFACE body number: if the worst-perp facets keep the foot own-region (Δaz small), exact-perp is
      // faithful; the radial own-region is the conservative cross-check. Report BOTH; verdict weighs the foot analysis.
      const nAdjacent = worstRows.filter((w) => w.adjacentFoot).length;
      append(RES, {
        key: `body:${M.name}`, mesh: M.name, arm: M.arm, tris: nF, bodyFacets: body.length,
        radialOwnRegionMax: +rWorst.toFixed(6), radialP99: pct(rSorted, 0.99),
        exactPerpMax: +pWorst.toFixed(6), exactPerpP99: pct(pSorted, 0.99),
        perpOverTolFrac: +(perpMax.reduce((s, v) => s + (v > TOL ? 1 : 0), 0) / body.length).toFixed(5),
        worstKadjacentFootCount: nAdjacent, worstKn: worstRows.length,
      });
    }, 6_000_000);
  }

  // ── UNIT B: CLIFF composite (ring-band + rim) faithful max + body composite cross-check vs exact-perp. ──
  for (const M of MESHES) {
    it.skipIf(process.env.PF_DSPERPMAX_COMP !== '1')(`CLIFF ${M.name} — composite faithful max (models risers)`, () => {
      if (keyExists(RES, `cliff:${M.name}`)) { plog(`[skip cliff] ${M.name}`); return; }
      const rA = dsRadiusFn();
      const { xyz, idx } = loadBinMesh(join(BIN_DIR, `${M.name}.xyz.bin`), join(BIN_DIR, `${M.name}.idx.bin`));
      const nF = idx.length / 3;
      const ringZs = dragonRings().map((r) => r.z);
      const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
      const body: number[] = [], ring: number[] = [];
      for (let f = 0; f < nF; f++) (cls(f) === 'ringBand' ? ring : body).push(f);
      plog(`[${M.name}] building V11g composite ruler (2048x3072 twin + riser wall)…`);
      const t0 = Date.now();
      const loc = buildConformRuler(rA);
      plog(`[${M.name}] ruler built in ${((Date.now() - t0) / 1000).toFixed(1)}s; scoring ${ring.length} ring-band + ${body.length} body…`);

      // CLIFF: composite is the faithful ruler (models the vertical riser wall the ring facets chord). Ring-band only
      // (the NEW info); BODY composite was already measured in E-DS-INTERIOR-CLOSE (dsFINE t3Max 0.049775, DENSE-45)
      // and the exact-perp body max (Unit A: 0.0675) is the faithful on-surface number — no full body re-score here.
      const rb = scoreRingBandFacets(xyz, idx, ring, loc, TOL,
        (d, tot) => { if (d % Math.max(1, Math.floor(tot / 4)) === 0) plog(`  [${M.name}][ringComp] ${d}/${tot}`); });
      plog(`[${M.name}][RING composite] max=${rb.maxMm} p99=${rb.p99} out=${rb.outliers}/${ring.length}`);
      void scoreBodyFacets; void body;

      append(RES, {
        key: `cliff:${M.name}`, mesh: M.name, arm: M.arm, tris: nF,
        ringFacets: ring.length, ringCompMax: rb.maxMm, ringCompP99: rb.p99, ringCompOut: rb.outliers,
      });
    }, 6_000_000);
  }
});
