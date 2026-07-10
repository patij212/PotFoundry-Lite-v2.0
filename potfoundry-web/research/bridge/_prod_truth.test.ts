// E-2026-07-09-PROD-ARTIFACT-TRUTH — scoring arm (pre-registered; see EXPERIMENT-REGISTRY.md).
// Scores the CAPTURED production default-export artifacts (e2e/_prod_truth_capture.mjs) under the
// honest every-facet ruler, BOTH directions, with the pre-registered instrument-validity gates:
//   (1) full-pot watertight (auditNonManRaw, NON-VACUOUS injected-crack control) + zeroArea;
//   (2) vertexOnSurf: |rho - rA(atan2(y,x), z)| over ALL outer-wall vertices (spin=0 capture => exact
//       per-vertex radial check). p99 > tol ==> the interior ruler's premise FAILS for that style —
//       interior numbers are then recorded but flagged UNTRUSTED (pre-registered gate);
//   (3) mesh->surface: scoreWholeMeshInterior (every facet; upper-bound basis min(GN, full-azimuth
//       brute); stride > 1 only when facet count is huge, and LABELED);
//   (4) Newton re-score of the worst facet point (grid-brute overstatement guard, §V11j class);
//   (5) surface->mesh COVERAGE: dense true-surface lattice -> nearest point-to-triangle distance
//       against the outer submesh (flat-CSR locator + Ericson; adversarial locator-vs-brute
//       self-check on random samples) — the program's first reverse ruler on a production artifact.
// DEV-ONLY. src/ never imports research/. Artifacts + scorecard are gitignored; numbers are inlined
// in the registry verdict.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
import { denseBary } from './_pf_tangledKernelLib';
import { loadBinMesh } from './_pf_bvhRuler';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { newtonNearest } from './_gyroid_truthLib';
import { nonManRawBig } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const ON = process.env.PF_PROD_TRUTH === '1';
const PILOT = ['HarmonicRipple', 'SpiralRidges', 'GyroidManifold', 'DragonScales', 'Voronoi'];
const STYLES = process.env.PF_PT_STYLES
  ? process.env.PF_PT_STYLES.split(',').map((s) => s.trim()).filter(Boolean)
  : PILOT;
// Capture dims (e2e/_prod_truth_capture.mjs): H120 / top_od 100 / bottom_od 80 / expn 1 / spin 0.
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TOL = 0.01;
const ROOT = join('research', 'exchange', '_prod_truth');
const OUT = join(ROOT, 'scorecard.ndjson');
const STRIDE_OVER = 6_000_000; // facets above this: stride 4 (LABELED in the row), per pre-registration
const TAU = Math.PI * 2;
// E-2026-07-09-FAST-HONEST-RULER levers (pre-registered): sound dense radial pre-screen (a facet
// whose 45-pt lattice is radially <= tol is green ON THE SAME dense basis — radial is a strict
// upper bound on nearest, so skipping it cannot change outlier count or max) + facet-shard
// parallelism (V10b precedent: shard sums reproduce sequential rows exactly).
const PRESCREEN = process.env.PF_PT_PRESCREEN === '1';
const SHARD = Math.max(0, Number(process.env.PF_PT_SHARD ?? 0));
const NSHARDS = Math.max(1, Number(process.env.PF_PT_NSHARDS ?? 1));
const SHARD0 = SHARD === 0;
// E-2026-07-10-PROD-BATCH stage breadcrumbs (coordinator-mandated after the 2026-07-10 drain
// post-mortem): when PF_PT_BREADCRUMB names a file, append one ndjson row at every stage
// boundary so an external watchdog can distinguish STUCK from SLOW (that ambiguity cost 6
// CPU-hours). Includes process.pid so the watchdog can kill a stalled WORKER precisely.
// Env-gated: unset (the default) writes nothing — committed behavior unchanged.
const CRUMB_PATH = process.env.PF_PT_BREADCRUMB ?? '';
function crumb(style: string, stage: string, extra?: Record<string, unknown>): void {
  if (!CRUMB_PATH) return;
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ style, shard: SHARD, nShards: NSHARDS, stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* breadcrumbs must never kill the run */
  }
}

interface PctStats { max: number; p99: number; p50: number; n: number; over: number }

function pctStats(devs: Float64Array, n: number, tol: number): PctStats {
  const a = devs.subarray(0, n).slice();
  a.sort();
  let over = 0;
  for (let i = n - 1; i >= 0 && a[i] > tol; i--) over++;
  return {
    max: n ? a[n - 1] : 0,
    p99: n ? a[Math.min(n - 1, Math.floor(0.99 * n))] : 0,
    p50: n ? a[Math.floor(0.5 * n)] : 0,
    n,
    over,
  };
}

function zeroAreaCount(xyz: Float32Array, idx: Uint32Array): number {
  let zero = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const abx = xyz[b] - xyz[a], aby = xyz[b + 1] - xyz[a + 1], abz = xyz[b + 2] - xyz[a + 2];
    const acx = xyz[c] - xyz[a], acy = xyz[c + 1] - xyz[a + 1], acz = xyz[c + 2] - xyz[a + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (0.5 * Math.hypot(cx, cy, cz) <= 1e-12) zero++;
  }
  return zero;
}

describe('E-2026-07-09-PROD-ARTIFACT-TRUTH — production default export under the honest ruler', () => {
  for (const style of STYLES) {
    it.skipIf(!ON)(`${style}: score captured production artifact`, () => {
      mkdirSync(ROOT, { recursive: true });
      const dir = join(ROOT, style);
      const metaPath = join(dir, 'meta.json');
      const row: Record<string, unknown> = { style, at: new Date().toISOString(), tol: TOL };
      const t0 = Date.now();

      if (!existsSync(metaPath)) {
        row.skipped = 'no capture (meta.json missing)';
        appendFileSync(OUT, JSON.stringify(row) + '\n');
        console.log(`[prod-truth] ${style}: SKIP — no capture`);
        return;
      }
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
        ok: boolean; error?: string; full?: { tris: number }; outer?: { tris: number };
      };
      if (!meta.ok) {
        // A throwing default export is a first-class finding (pre-registered).
        row.captureFailed = meta.error ?? 'unknown';
        appendFileSync(OUT, JSON.stringify(row) + '\n');
        console.log(`[prod-truth] ${style}: CAPTURE FAILED — ${String(meta.error).slice(0, 160)}`);
        return;
      }

      crumb(style, 'meta-ok');
      const rA = buildRadiusFn(style as StyleId, {}, DIMS);
      const H = DIMS.H;
      const full = loadBinMesh(join(dir, 'full.xyz.bin'), join(dir, 'full.idx.bin'));
      const outer = loadBinMesh(join(dir, 'outer.xyz.bin'), join(dir, 'outer.idx.bin'));
      row.fullTris = full.idx.length / 3;
      row.outerTris = outer.idx.length / 3;
      row.shard = SHARD;
      row.nShards = NSHARDS;
      crumb(style, 'bins-loaded', { fullTris: row.fullTris, outerTris: row.outerTris });

      const nV = outer.xyz.length / 3;
      let rulerPremiseOk = true;
      if (SHARD0) {
        // (1) Watertight on the FULL-POT artifact — non-vacuous (injected extra tri on an existing
        // edge must move the count, else the audit is vacuous and the row says so).
        const nonMan = nonManRawBig(full.idx);
        const cracked = new Uint32Array(full.idx.length + 3);
        cracked.set(full.idx);
        cracked.set([full.idx[0], full.idx[1], full.idx[2]], full.idx.length);
        const crackedCount = nonManRawBig(cracked);
        row.nonManRaw = nonMan;
        row.nonManControlMoved = crackedCount > nonMan;
        row.zeroArea = zeroAreaCount(full.xyz, full.idx);
        crumb(style, 'watertight-done', { nonMan, zeroArea: row.zeroArea });

        // (2) vertexOnSurf on the OUTER wall — the interior ruler's premise + the CPU(f64)<->GPU(f32)
        // truth-bridge quantification (spin=0 => a surface vertex satisfies rho == rA(theta, z) exactly).
        const vDev = new Float64Array(nV);
        for (let v = 0; v < nV; v++) {
          const x = outer.xyz[v * 3], y = outer.xyz[v * 3 + 1];
          const z = Math.min(H, Math.max(0, outer.xyz[v * 3 + 2]));
          let th = Math.atan2(y, x);
          if (th < 0) th += TAU;
          vDev[v] = Math.abs(Math.hypot(x, y) - rA(th, z));
        }
        const vStats = pctStats(vDev, nV, TOL);
        row.vertexOnSurf = vStats;
        rulerPremiseOk = vStats.p99 <= TOL;
        row.interiorRulerPremiseOk = rulerPremiseOk; // pre-registered instrument-validity gate
        crumb(style, 'vertexOnSurf-done', { p99: vStats.p99, premiseOk: rulerPremiseOk });
      }

      // (3) mesh->surface every-facet interior (upper-bound basis: min(GN, full-azimuth brute)).
      // With PRESCREEN: sound dense-45 radial screen first — greens are proven on the SAME dense
      // basis (radial >= true pointwise, and min(GN,brute) <= radial), so outlier count and max are
      // EXACT-equivalent to the unscreened run; only the cost changes. Survivors are shard-split.
      const nF = outer.idx.length / 3;
      const stride = process.env.PF_PT_STRIDE
        ? Math.max(1, Number(process.env.PF_PT_STRIDE))
        : nF > STRIDE_OVER && !PRESCREEN ? 4 : 1;
      const tI0 = Date.now();
      let scoreIdx: Uint32Array = outer.idx;
      let survivorsTotal = nF;
      if (PRESCREEN) {
        const bary = denseBary(8); // 45-pt lattice — the acceptance basis of the whole campaign
        const survivors: number[] = [];
        const crumbTick = Math.max(1, Math.floor(nF / 10));
        for (let f = 0; f < nF; f++) {
          if (f % crumbTick === 0) crumb(style, 'prescreen-tick', { pct: Math.round((f / nF) * 100), survivorsSoFar: survivors.length });
          const a = outer.idx[f * 3] * 3, b = outer.idx[f * 3 + 1] * 3, c = outer.idx[f * 3 + 2] * 3;
          let green = true;
          for (const [wa, wb, wc] of bary) {
            const x = wa * outer.xyz[a] + wb * outer.xyz[b] + wc * outer.xyz[c];
            const y = wa * outer.xyz[a + 1] + wb * outer.xyz[b + 1] + wc * outer.xyz[c + 1];
            const z = wa * outer.xyz[a + 2] + wb * outer.xyz[b + 2] + wc * outer.xyz[c + 2];
            let th = Math.atan2(y, x);
            if (th < 0) th += TAU;
            if (Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z)))) > TOL) {
              green = false;
              break;
            }
          }
          if (!green) survivors.push(f);
        }
        survivorsTotal = survivors.length;
        const mine = NSHARDS > 1 ? survivors.filter((f) => f % NSHARDS === SHARD) : survivors;
        scoreIdx = new Uint32Array(mine.length * 3);
        for (let i = 0; i < mine.length; i++) {
          scoreIdx[i * 3] = outer.idx[mine[i] * 3];
          scoreIdx[i * 3 + 1] = outer.idx[mine[i] * 3 + 1];
          scoreIdx[i * 3 + 2] = outer.idx[mine[i] * 3 + 2];
        }
        console.log(
          `[prod-truth] ${style}: prescreen ${nF} facets -> ${survivorsTotal} survivors ` +
            `(${((1 - survivorsTotal / nF) * 100).toFixed(1)}% green-proven), shard ${SHARD}/${NSHARDS} scores ${mine.length} (${((Date.now() - tI0) / 1000).toFixed(0)}s)`,
        );
        crumb(style, 'prescreen-done', { survivors: survivorsTotal, mine: mine.length, ms: Date.now() - tI0 });
      }
      // v3 watchdog contract (post-GothicArches-false-kill): crumbs during heavy stages are
      // TIME-GATED (>=30s spacing, workload-independent) — the previous modulo-cadence tick
      // fired every ~13-26min at GothicArches' per-facet cost and straddled the 15-min stall
      // threshold. onProgress is invoked once per scanned facet, so the gate is checked at
      // per-facet granularity; this is pure OBSERVATION — no chunking, the scored point set
      // and reduction are unchanged (basis-neutral by construction).
      let lastTickAt = Date.now();
      crumb(style, 'interior-start', { toScore: scoreIdx.length / 3, stride });
      const interior = scoreWholeMeshInterior(outer.xyz, scoreIdx, rA, H, {
        tol: TOL,
        stride,
        onProgress: (done, total, nOut, worst) => {
          if (done % Math.max(1, Math.floor(total / 10)) < stride) {
            console.log(`[prod-truth] ${style}: interior ${done}/${total} out=${nOut} worst=${worst.toFixed(4)}`);
          }
          if (Date.now() - lastTickAt > 30_000) {
            lastTickAt = Date.now();
            crumb(style, 'interior-tick', { done, total, out: nOut, worst: +worst.toFixed(4) });
          }
        },
      });
      row.interior = {
        basis:
          `upperBound(min(GN,brute)) stride=${interior.stride}` +
          (PRESCREEN ? ` prescreen45(greens proven, pStats=survivor-population) shard=${SHARD}/${NSHARDS}` : ''),
        outliers: interior.interiorOutliers,
        scannedFacets: interior.scannedFacets,
        nFacets: nF,
        survivors: PRESCREEN ? survivorsTotal : undefined,
        maxMm: interior.wholeMeshMaxMm,
        p50: interior.p50,
        p90: interior.p90,
        p99: interior.p99,
        ms: Date.now() - tI0,
      };
      crumb(style, 'interior-done', { outliers: interior.interiorOutliers, max: +interior.wholeMeshMaxMm.toFixed(6) });

      // (4) Newton re-score of the worst point (grid-brute overstatement guard — a tighter valid
      // upper bound; §V11j: every Newton value is a real achievable surface distance).
      crumb(style, 'newton-start', {});
      if (interior.worstFacet >= 0 && interior.wholeMeshMaxMm > 0) {
        const [wx, wy, wz] = interior.worstXyz;
        const nw = newtonNearest(rA, H, wx, wy, wz, {
          seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
        });
        row.newtonWorst = Math.min(interior.wholeMeshMaxMm, nw.dist);
      }
      crumb(style, 'newton-done', { newtonWorst: row.newtonWorst ?? null });

      // (5) surface->mesh COVERAGE on the OUTER wall (reverse ruler; boundary band separated).
      if (SHARD0) {
      const refXyz = new Float64Array(outer.xyz.length);
      for (let i = 0; i < outer.xyz.length; i++) refXyz[i] = outer.xyz[i];
      const ref: RefMesh = { xyz: refXyz, idx: outer.idx, nV, nF };
      // Locator cell must scale with local edge length (banked V10 perf lesson: cell = ~4x edge).
      let edgeSum = 0;
      const eSamples = Math.min(2000, nF);
      for (let s = 0; s < eSamples; s++) {
        const t = Math.floor((s / eSamples) * nF) * 3;
        const a = outer.idx[t] * 3, b = outer.idx[t + 1] * 3;
        edgeSum += Math.hypot(
          outer.xyz[b] - outer.xyz[a], outer.xyz[b + 1] - outer.xyz[a + 1], outer.xyz[b + 2] - outer.xyz[a + 2],
        );
      }
      const cell = Math.max(0.4, Math.min(3.0, (edgeSum / Math.max(1, eSamples)) * 4));
      const loc = buildRefLocator(ref, cell);
      const bandMm = 0.5; // t=0/1 attachment rings reported separately (pre-registered)
      const NU = 1024, NT = 1024;
      const cov = new Float64Array(NU * NT);
      let covN = 0;
      let worstU = 0, worstT = 0, worstD = -1;
      const tC0 = Date.now();
      crumb(style, 'coverage-start', { lattice: `${NU}x${NT}`, cellMm: +cell.toFixed(3) });
      for (let j = 0; j < NT; j++) {
        if (Date.now() - lastTickAt > 30_000) {
          lastTickAt = Date.now();
          crumb(style, 'coverage-tick', { row: j, of: NT });
        }
        const z = bandMm + ((H - 2 * bandMm) * j) / (NT - 1);
        for (let i = 0; i < NU; i++) {
          const th = (TAU * i) / NU;
          const r = rA(th, z);
          const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
          cov[covN++] = d;
          if (d > worstD) { worstD = d; worstU = th / TAU; worstT = z / H; }
        }
      }
      // 4x local refinement around the worst cell (pre-registered).
      let refinedMax = worstD;
      const du = 1 / NU, dt = (H - 2 * bandMm) / (NT - 1) / H;
      for (let j = -8; j <= 8; j++) {
        for (let i = -8; i <= 8; i++) {
          const u = worstU + (i * du) / 4;
          const z = Math.min(H - bandMm, Math.max(bandMm, (worstT + (j * dt) / 4) * H));
          const th = ((u % 1) + 1) % 1 * TAU;
          const r = rA(th, z);
          refinedMax = Math.max(refinedMax, loc.dist(r * Math.cos(th), r * Math.sin(th), z));
        }
      }
      const covStats = pctStats(cov, covN, TOL);
      // Boundary bands (attachment rings), separated per pre-registration.
      const bDev = new Float64Array(NU * 4);
      let bN = 0;
      for (const z of [bandMm * 0.5, bandMm * 0.25, H - bandMm * 0.5, H - bandMm * 0.25]) {
        for (let i = 0; i < NU; i++) {
          const th = (TAU * i) / NU;
          const r = rA(th, z);
          bDev[bN++] = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
        }
      }
      // Adversarial locator self-check (pre-registered instrument hygiene): locator == brute.
      let locSelfCheckMax = 0;
      for (let s = 0; s < 24; s++) {
        const th = (TAU * ((s * 79) % 1024)) / 1024;
        const z = bandMm + (H - 2 * bandMm) * (((s * 131) % 997) / 997);
        const r = rA(th, z);
        const px = r * Math.cos(th), py = r * Math.sin(th);
        locSelfCheckMax = Math.max(locSelfCheckMax, Math.abs(loc.dist(px, py, z) - loc.bruteDist(px, py, z)));
      }
      row.coverage = {
        lattice: `${NU}x${NT} + 4x local refine, band ${bandMm}mm separated`,
        max: refinedMax,
        p99: covStats.p99,
        p50: covStats.p50,
        over: covStats.over,
        worstUt: [worstU, worstT],
        boundary: pctStats(bDev, bN, TOL),
        locatorCellMm: cell,
        locSelfCheckMax,
        ms: Date.now() - tC0,
      };
      // The probe never asserts fidelity (pre-registered: per-style REPORT, no blanket verdicts) —
      // it asserts only its own instrument hygiene.
      expect(row.nonManControlMoved).toBe(true);
      expect(locSelfCheckMax).toBeLessThan(1e-9);
      crumb(style, 'coverage-done', { max: (row.coverage as { max: number }).max });
      } // SHARD0

      row.totalMs = Date.now() - t0;
      appendFileSync(OUT, JSON.stringify(row) + '\n');
      crumb(style, 'row-append', { totalMs: row.totalMs });
      const vs = row.vertexOnSurf as PctStats | undefined;
      const cov = row.coverage as { max: number; p99: number } | undefined;
      console.log(
        `[prod-truth] ${style}${NSHARDS > 1 ? ` [shard ${SHARD}/${NSHARDS}]` : ''}: ` +
          (vs ? `vtxOnSurf max=${vs.max.toFixed(5)} p99=${vs.p99.toFixed(5)} (premise ${rulerPremiseOk ? 'OK' : 'FAILED'}) | ` : '') +
          `interior out=${interior.interiorOutliers}` +
          `${interior.stride > 1 ? `(stride ${interior.stride})` : ''} max=${interior.wholeMeshMaxMm.toFixed(4)} ` +
          `p99=${interior.p99.toFixed(4)}` +
          (cov ? ` | coverage max=${cov.max.toFixed(4)} p99=${cov.p99.toFixed(4)}` : '') +
          ` | ${(((row.totalMs as number)) / 1000).toFixed(0)}s`,
      );
    }, 5_400_000);
  }
});
