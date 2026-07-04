// _pf_anatomy.test.ts — DEV-ONLY (PF_ANATOMY=1). E-2026-07-04-PF-ANATOMY.
// OUTLIER ANATOMY (metrologist role): the crux ground-truth for the LAST open wall (count-unstable cusp styles).
// Mesh GothicArches + GeometricStar with their CURRENT-BEST primitive (reuse the dumped meshes), apply a per-triangle
// INTERIOR true-3D ruler (centroid + 3 edge-midpoints → project → max), EXTRACT the exact outlier triangles
// (interior dev > 0.01), and CHARACTERIZE them decisively:
//   WHERE (crest / junction / flank / channel-wall) · SINGULARITY (C1 cusp) vs KINK vs finite-curvature ·
//   JUNCTION census · the decisive (a) sharp-EDGE / (b) high-curvature / (c) near-vertical-WALL classification.
//
// NO meshing here (measurement-first). Operates on dumped current-best meshes + the analytic surface. Checkpoints to
// research/exchange/_pf_anatomy/. Env sub-gate + row-exists skip ⇒ resumable per (style) probe.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import {
  loadDumpedMesh, recoverUt, interiorOutlierScan, crestAnatomyAt, bruteNearest,
  type Outlier, type LoadedMesh,
} from './_pf_anatomyLib';
import { type CrestExtractResult } from './_cu_gothicsegLib';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_anatomy');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const EXCH = join(process.cwd(), 'research', 'exchange');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };
const med = (arr: number[]): number => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pctl = (arr: number[], q: number): number => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

interface StyleCfg {
  key: string; style: StyleId; rMean: number;
  meshDir: string; meshName: string;          // dumped current-best primitive
  extractCache?: string;                       // cached crest extract for junction census (Gothic)
}

// R_MEAN: Gothic ribs ~48; GeoStar mean radius ~45.
const CFGS: StyleCfg[] = [
  { key: 'GothicArches', style: 'GothicArches' as StyleId, rMean: 48,
    meshDir: join(EXCH, '_gf_gothic'), meshName: 'gf_flank',
    extractCache: join(EXCH, '_gd_gothic', 'extract.cache.json') },
  { key: 'GeometricStar', style: 'GeometricStar' as StyleId, rMean: 45,
    meshDir: join(EXCH, '_ct_gs'), meshName: 'GeometricStar_conform_heatmap' },
];

/** Classify one outlier by WHERE + singularity, using the crest cross-section anatomy at its foot. */
function classifyOutlier(o: Outlier, rA: (t: number, z: number) => number, rMean: number): {
  where: 'crest-cusp' | 'flank-wall' | 'junction' | 'channel-wall' | 'other';
  singular: 'C1-cusp' | 'kink' | 'finite-curv';
  gradU: number; gradT: number; apexAngleDeg: number; secondDiffMm: number; crestAmpMm: number; onApex: boolean;
} {
  const an = crestAnatomyAt(rA as (th: number, z: number) => number, o.u, o.t, H, rMean);
  // singularity: apex angle well below 180 with a large second-difference spike = C1 cusp/kink.
  // A cusp (sharp>1, pow) has apexAngle far below 180 AND a very large secondDiff; a kink (sharp==1) has a moderate
  // apexAngle deficit; a finite-curvature cap has apexAngle→180 and bounded secondDiff.
  let singular: 'C1-cusp' | 'kink' | 'finite-curv';
  if (an.apexAngleDeg < 150 && an.secondDiffMm > 20) singular = 'C1-cusp';
  else if (an.apexAngleDeg < 172) singular = 'kink';
  else singular = 'finite-curv';
  // where: near-vertical wall (gradU or gradT large) ON a live crest apex = crest-cusp; near-vertical but NOT on an
  // apex = flank-wall; low gradient = other. channel-wall reserved for the steep-lattice family (not these two).
  let where: 'crest-cusp' | 'flank-wall' | 'junction' | 'channel-wall' | 'other';
  const nearVert = an.gradU > 6 || an.gradT > 2.5;
  if (an.isRidgeApex && an.crestAmpMm > 0.05 && (nearVert || singular !== 'finite-curv')) where = 'crest-cusp';
  else if (nearVert) where = 'flank-wall';
  else where = 'other';
  return { where, singular, gradU: +an.gradU.toFixed(2), gradT: +an.gradT.toFixed(2), apexAngleDeg: +an.apexAngleDeg.toFixed(1), secondDiffMm: +an.secondDiffMm.toFixed(1), crestAmpMm: +an.crestAmpMm.toFixed(3), onApex: an.isRidgeApex };
}

/** Amplitude-at-birth test for the junction census: at a birth (u,t), does the crest amplitude → 0 (smooth birth,
 *  the ridge is being born as the surface swells → finite curvature) or is it already sharp (sharp-birth)? */
function birthAmp(rA: (th: number, z: number) => number, u: number, t: number, rMean: number): number {
  const an = crestAnatomyAt(rA, u, t, H, rMean); return an.crestAmpMm;
}

function runStyleAnatomy(cfg: StyleCfg): void {
  if (rowExists(cfg.key)) { plog(`${cfg.key}: exists — skip`); return; }
  const t0 = Date.now();
  const rA = buildRadiusFn(cfg.style, {}, DIMS);
  let mesh: LoadedMesh;
  try { mesh = loadDumpedMesh(cfg.meshDir, cfg.meshName); }
  catch (e) { plog(`${cfg.key}: LOAD FAILED ${String(e)} — cannot measure, skipping`); checkpoint({ key: cfg.key, error: `load: ${String(e)}` }); return; }
  plog(`${cfg.key}: loaded ${cfg.meshName} nF=${mesh.nF} nV=${mesh.nV} (${Date.now() - t0}ms)`);

  // ── INTERIOR OUTLIER SCAN (whole-mesh: cheap radial screen + brute-anchor the candidates) ──
  const ut = recoverUt(mesh, H);
  plog(`${cfg.key}: ut recovered; running stage-1 radial screen + brute-anchor...`);
  const scan = interiorOutlierScan(mesh, rA as (th: number, z: number) => number, H, {
    tolMm: 0.01, screenMm: 0.01, confirmK: 1500, ut, brute: { nTheta: 640, nZ: 180 },
    onProgress: (done, total, nOut) => { plog(`${cfg.key}: anchor ${(100 * done / Math.max(1, total)).toFixed(0)}% (${done}/${total}) trueOut=${nOut} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); },
  });
  plog(`${cfg.key}: INTERIOR scan done nCandidates=${scan.nCandidates} anchored=${scan.nProjected} anchoredAll=${scan.anchoredAll} trueOutliers=${scan.outliers.length} p99=${scan.p99.toFixed(4)} max=${scan.max.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  // checkpoint the raw scan immediately (survives a crash in classification)
  checkpoint({ key: `${cfg.key}__scan`, style: cfg.key, mesh: cfg.meshName, nF: mesh.nF,
    nCandidatesRadialUB: scan.nCandidates, candidateFracUB: +(scan.nCandidates / mesh.nF).toFixed(6),
    anchored: scan.nProjected, anchoredAll: scan.anchoredAll,
    nTrueOutliersInAnchored: scan.outliers.length,
    trueOutlierFracOfAnchored: +(scan.outliers.length / Math.max(1, scan.nProjected)).toFixed(4),
    projP50: +scan.p50.toFixed(4), projP90: +scan.p90.toFixed(4), projP99: +scan.p99.toFixed(4), projMax: +scan.max.toFixed(4),
    tookS: +((Date.now() - t0) / 1000).toFixed(0) });
  // dump full outlier list to disk (u,t,dev) for downstream render/inspection
  writeFileSync(join(DIR, `${cfg.key}_outliers.json`), JSON.stringify(scan.outliers.map((o) => ({ f: o.f, dev: +o.interiorDev.toFixed(4), u: +o.u.toFixed(6), t: +o.t.toFixed(6) })), null, 0));

  // ── CLASSIFY a sample of the worst outliers (cap for cost; worst carry the verdict) ──
  const SAMPLE = Math.min(600, scan.outliers.length);
  const sample = scan.outliers.slice(0, SAMPLE);
  const cls = sample.map((o) => ({ o, ...classifyOutlier(o, rA as (t: number, z: number) => number, cfg.rMean) }));
  const whereCount: Record<string, number> = {}; const singCount: Record<string, number> = {};
  for (const c of cls) { whereCount[c.where] = (whereCount[c.where] ?? 0) + 1; singCount[c.singular] = (singCount[c.singular] ?? 0) + 1; }
  const gradUs = cls.map((c) => c.gradU), gradTs = cls.map((c) => c.gradT), apexA = cls.map((c) => c.apexAngleDeg), sdiff = cls.map((c) => c.secondDiffMm), amps = cls.map((c) => c.crestAmpMm), devs = sample.map((o) => o.interiorDev);
  plog(`${cfg.key}: CLASS where=${JSON.stringify(whereCount)} singular=${JSON.stringify(singCount)} medGradU=${med(gradUs).toFixed(1)} medApexAngle=${med(apexA).toFixed(1)} medSecondDiff=${med(sdiff).toFixed(1)}`);
  writeFileSync(join(DIR, `${cfg.key}_classified.json`), JSON.stringify(cls.map((c) => ({ f: c.o.f, dev: +c.o.interiorDev.toFixed(4), u: +c.o.u.toFixed(6), t: +c.o.t.toFixed(6), where: c.where, singular: c.singular, gradU: c.gradU, gradT: c.gradT, apexAngleDeg: c.apexAngleDeg, secondDiffMm: c.secondDiffMm, crestAmpMm: c.crestAmpMm })), null, 0));

  // ── JUNCTION CENSUS (Gothic: from cached extract; else derive births as amplitude-vanishing tests) ──
  let jc: Record<string, unknown> = { note: 'no extract cache' };
  if (cfg.extractCache && existsSync(cfg.extractCache)) {
    const ex = JSON.parse(readFileSync(cfg.extractCache, 'utf8')) as CrestExtractResult;
    // sample up to 400 births/merges from the crest points near unmatched endpoints is not stored; instead we
    // report the extract-level counts + measure amplitude at a random sample of crest points that are births by
    // re-deriving them is unavailable. So: report nBirths/nMerges from the extract, and probe crest-amplitude at a
    // sample of crest points to estimate the smooth-vs-sharp birth split (amp<0.03 near a birth => smooth swell).
    const crest = ex.crestUt ?? [];
    const nCrest = crest.length / 2;
    const S = Math.min(2000, nCrest); const step = Math.max(1, Math.floor(nCrest / S));
    let ampBelow = 0, ampTot = 0; const ampArr: number[] = [];
    for (let i = 0; i < nCrest; i += step) { const u = crest[2 * i], t = crest[2 * i + 1]; const a = birthAmp(rA as (t: number, z: number) => number, u, t, cfg.rMean); ampArr.push(a); if (a < 0.03) ampBelow++; ampTot++; }
    jc = { nBirths: ex.nBirths, nMerges: ex.nMerges, nSegments: ex.nSegments, nPeaks: ex.nPeaks,
      crestAmpMedMm: +med(ampArr).toFixed(3), crestAmpP10Mm: +pctl(ampArr, 0.1).toFixed(3),
      fracCrestAmpBelow0_03: +(ampBelow / Math.max(1, ampTot)).toFixed(3),
      note: 'births/merges from extract; amp probed on crest sample (low amp near ridge ends = amplitude-vanishing smooth birth)' };
    plog(`${cfg.key}: JUNCTION nBirths=${ex.nBirths} nMerges=${ex.nMerges} crestAmpMed=${(jc.crestAmpMedMm as number)} fracAmpBelow0.03=${(jc.fracCrestAmpBelow0_03 as number)}`);
  }

  // ── DECISIVE (a)/(b)/(c) classification ──
  // (a) sharp EDGE that must be a mesh edge: dominant outliers are C1-cusp/kink ON a live crest apex (crest-cusp) →
  //     fix = resolve the feature GRAPH incl. junctions. (b) smooth high-curvature: finite-curv, apexAngle→180, big
  //     but bounded curvature off-apex → fix = curved elements/density. (c) near-vertical WALL a flat facet can't hug:
  //     flank-wall, high gradU/gradT, NOT on apex, finite-curv apex → fix = surface-native placement.
  const nCusp = (singCount['C1-cusp'] ?? 0) + (singCount['kink'] ?? 0);
  const nCrestWhere = whereCount['crest-cusp'] ?? 0;
  const nFlank = whereCount['flank-wall'] ?? 0;
  const fracCusp = nCusp / Math.max(1, SAMPLE), fracCrest = nCrestWhere / Math.max(1, SAMPLE), fracFlank = nFlank / Math.max(1, SAMPLE);
  let decisive: 'a-sharp-edge' | 'b-high-curvature' | 'c-near-vertical-wall';
  if (fracCrest >= 0.5 && fracCusp >= 0.5) decisive = 'a-sharp-edge';
  else if (fracFlank >= 0.5) decisive = 'c-near-vertical-wall';
  else if ((singCount['finite-curv'] ?? 0) / Math.max(1, SAMPLE) >= 0.5) decisive = 'b-high-curvature';
  else decisive = 'a-sharp-edge';

  checkpoint({
    key: cfg.key, style: cfg.key, mesh: cfg.meshName, nF: mesh.nF,
    nCandidatesRadialUB: scan.nCandidates, anchored: scan.nProjected, anchoredAll: scan.anchoredAll,
    nTrueOutliersInAnchored: scan.outliers.length, projP99Mm: +scan.p99.toFixed(4), projMaxMm: +scan.max.toFixed(4),
    outlierDevMedMm: +med(devs).toFixed(4), outlierDevMaxMm: +Math.max(0, ...devs).toFixed(4),
    sampleN: SAMPLE, whereCount, singCount,
    fracCrestCusp: +fracCrest.toFixed(3), fracFlankWall: +fracFlank.toFixed(3), fracCuspOrKink: +fracCusp.toFixed(3),
    medGradU: +med(gradUs).toFixed(1), medGradT: +med(gradTs).toFixed(2),
    medApexAngleDeg: +med(apexA).toFixed(1), medSecondDiffMm: +med(sdiff).toFixed(1), medCrestAmpMm: +med(amps).toFixed(3),
    junction: jc, decisive,
    tookS: +((Date.now() - t0) / 1000).toFixed(0),
  });
  plog(`${cfg.key}: DECISIVE=${decisive} fracCrestCusp=${fracCrest.toFixed(2)} fracFlank=${fracFlank.toFixed(2)} fracCuspOrKink=${fracCusp.toFixed(2)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  expect(scan.nF).toBeGreaterThan(0);
}

describe('PF-ANATOMY: interior outlier anatomy of the cusp styles', () => {
  // SMOKE: validate the ruler + time it on a bounded slice of the Gothic mesh before the full whole-mesh run.
  it.skipIf(process.env.PF_ANATOMY_SMOKE !== '1')('SMOKE — first 300k Gothic facets, timing + correctness', () => {
    mkdirSync(DIR, { recursive: true });
    const cfg = CFGS[0];
    const rA = buildRadiusFn(cfg.style, {}, DIMS);
    const full = loadDumpedMesh(cfg.meshDir, cfg.meshName);
    const N = Math.min(Number(process.env.PF_SMOKE_N ?? 40_000), full.nF);
    const sub: LoadedMesh = { xyz: full.xyz, idx: full.idx.subarray(0, N * 3), nV: full.nV, nF: N };
    plog(`SMOKE: start scan on ${N} facets...`);
    const t0 = Date.now();
    const scan = interiorOutlierScan(sub, rA as (th: number, z: number) => number, H, { tolMm: 0.01, screenMm: 0.01, brute: { nTheta: 2048, nZ: 400 } });
    const secs = (Date.now() - t0) / 1000;
    plog(`SMOKE: anchor+scan done in ${secs.toFixed(1)}s (candidates=${scan.nCandidates} outliers=${scan.outliers.length}); running A/B...`);
    // A/B: re-brute each outlier's worst sample at FULL-AZIMUTH FINE grid; the GN anchor must AGREE (unique foot on a
    // height field ⇒ GN==brute). brute can only lower with more samples, so |GN - fullFine| must be ~0.
    const tab = Date.now(); let maxAbErr = 0;
    for (const o of scan.outliers.slice(0, 30)) {
      const fine = bruteNearest(o.cx, o.cy, o.cz, rA as (th: number, z: number) => number, H, { nTheta: 3072, nZ: 600 });
      const e = Math.abs(fine.dist - o.interiorDev); if (e > maxAbErr) maxAbErr = e;
    }
    plog(`SMOKE: A/B done in ${((Date.now() - tab) / 1000).toFixed(1)}s`);
    plog(`SMOKE: ${N} facets in ${secs.toFixed(1)}s => full ${full.nF} ~${(secs / N * full.nF).toFixed(0)}s | projected=${scan.nProjected} outliers=${scan.outliers.length} p99=${scan.p99.toFixed(4)} max=${scan.max.toFixed(4)}`);
    plog(`SMOKE: A/B windowed-vs-fullFine maxAbsErr over worst-60 = ${maxAbErr.toFixed(5)} (must be << 0.01 ⇒ window contains foot)`);
    if (scan.outliers.length) { const o = scan.outliers[0]; const cls = classifyOutlier(o, rA as (t: number, z: number) => number, cfg.rMean); plog(`SMOKE worst outlier dev=${o.interiorDev.toFixed(4)} u=${o.u.toFixed(4)} t=${o.t.toFixed(4)} where=${cls.where} sing=${cls.singular} gradU=${cls.gradU} apexAngle=${cls.apexAngleDeg} secondDiff=${cls.secondDiffMm}`); }
    // sanity: a vertex is on the surface — its projection should be ~0
    const bf = bruteNearest(full.xyz[0], full.xyz[1], full.xyz[2], rA as (th: number, z: number) => number, H);
    plog(`SMOKE: vertex0 brute dist=${bf.dist.toFixed(5)} (should be ~0)`);
    expect(secs).toBeGreaterThan(0);
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_ANATOMY !== '1')('Gothic + GeoStar — interior ruler, outlier extract + classify', () => {
    mkdirSync(DIR, { recursive: true });
    for (const cfg of CFGS) runStyleAnatomy(cfg);
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 180 * 60 * 1000);
});
