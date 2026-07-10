// E-2026-07-10-PROD-BATCH — scorecard assembler (run-only aggregator; duplicates NO probe logic,
// reads only the already-committed harnesses' own output files).
//
// Reads:
//   research/exchange/_prod_truth/<style>/meta.json           (capture: tris, generateMs, ok/error)
//   research/exchange/_prod_truth/scorecard.ndjson            (standard probe rows, filtered by `at`)
//   research/exchange/_ds_prodtruth/scorecard.ndjson          (DS composite-ruler rows; this arm
//                                                               resets this file before re-scoring,
//                                                               see prereg SS0.1, so no `at` filter
//                                                               is needed here)
//   research/exchange/_prod_batch/capture_progress.ndjson     (optional; batch/timing context)
//
// Writes:
//   research/exchange/_prod_batch/all20_scorecard.ndjson
//   research/exchange/_prod_batch/all20_scorecard.md
//
// Usage: node research/bridge/_prod_batch_assemble.mjs [--since <iso>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STYLES = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments',
  'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave', 'GeometricStar',
  'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
];
// Pilot baselines banked in E-2026-07-09-PROD-ARTIFACT-TRUTH (OLD tree, pre-reuse-fix), seconds.
const PILOT_BASELINE_S = {
  HarmonicRipple: 377, SpiralRidges: 455, GyroidManifold: 250, DragonScales: 1113, Voronoi: 534,
};

const ROOT = join('research', 'exchange', '_prod_truth');
const NDJSON = join(ROOT, 'scorecard.ndjson');
const DS_NDJSON = join('research', 'exchange', '_ds_prodtruth', 'scorecard.ndjson');
const OUT_DIR = join('research', 'exchange', '_prod_batch');
const sinceArgIdx = process.argv.indexOf('--since');
let SINCE = sinceArgIdx >= 0 ? process.argv[sinceArgIdx + 1] : null;
if (!SINCE) {
  const p = join(OUT_DIR, '_capture_phase_started_at.txt');
  if (existsSync(p)) SINCE = readFileSync(p, 'utf8').trim();
}
const sinceMs = SINCE ? Date.parse(SINCE) : 0;

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function loadMeta(style) {
  const p = join(ROOT, style, 'meta.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

const allRows = readJsonl(NDJSON).filter((r) => !r.merged || true); // keep all; pick canonical below
const byStyleRows = new Map();
for (const r of allRows) {
  if (!r.style) continue;
  if (sinceMs && r.at && Date.parse(r.at) < sinceMs) continue;
  if (!byStyleRows.has(r.style)) byStyleRows.set(r.style, []);
  byStyleRows.get(r.style).push(r);
}
function canonicalRow(style) {
  const rows = byStyleRows.get(style) || [];
  if (rows.length === 0) return null;
  const merged = rows.filter((r) => r.merged === true).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (merged.length) return merged[0];
  const shard0 = rows.filter((r) => (r.shard ?? 0) === 0).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (shard0.length) return shard0[0];
  // only non-zero shard rows present => sharded run not yet merged.
  return { ...rows[rows.length - 1], _unmergedShardsOnly: true };
}

const dsRows = readJsonl(DS_NDJSON);
function dsRow(key) { return dsRows.find((r) => r.key === key) || null; }
function dsRowPrefix(prefix) {
  const cands = dsRows.filter((r) => typeof r.key === 'string' && r.key.startsWith(prefix));
  return cands.length ? cands[cands.length - 1] : null;
}

function classify(style, meta, row, ds) {
  if (!meta) return 'PENDING';
  if (!meta.ok) return 'CAPTURE-FAILED';
  if (style === 'DragonScales') {
    if (!ds || !ds.battery) return 'PENDING-CERTIFICATION';
    if (!ds.battery.allPass) return 'special-ruler (INSTRUMENT-INVALID: battery FAIL)';
    return 'special-ruler (V11g composite, two-population)';
  }
  if (!row) return 'PENDING-CERTIFICATION';
  const vtx = row.vertexOnSurf;
  if (vtx && vtx.p99 > 0.01) return 'TRUTH-BRIDGE-FAILURE';
  const out = row.interior?.outliers;
  if (out === 0) return 'SHIPPED-CLEAN';
  if (typeof out === 'number') return 'REGRESSION';
  return 'UNKNOWN';
}

const scorecard = [];
for (const style of STYLES) {
  const meta = loadMeta(style);
  const row = style === 'DragonScales' ? null : canonicalRow(style);
  let ds = null;
  if (style === 'DragonScales') {
    const battery = dsRow('battery_summary');
    const fwdMerged = dsRowPrefix('fwd_merged_band');
    const fwdUnsharded = dsRows.filter((r) => r.task === 'forward-score' && (r.nShards ?? 1) <= 1).pop();
    const fwd = fwdMerged || fwdUnsharded || null;
    const rev = dsRow('rev_coverage');
    ds = { battery, fwd, rev };
  }
  const pilotS = PILOT_BASELINE_S[style];
  const generateMsFull = meta?.full?.generateMs ?? null;
  const deltaPct = pilotS && generateMsFull != null
    ? +(((generateMsFull / 1000 - pilotS) / pilotS) * 100).toFixed(1)
    : null;

  const entry = {
    style,
    treeBasisNote: 'tree-basis: da6b423a+uncommitted (see prereg BASIS LABELING)',
    capture: meta ? {
      ok: meta.ok, error: meta.error ?? null,
      fullTris: meta.full?.tris ?? null, outerTris: meta.outer?.tris ?? null,
      fullGenerateMs: generateMsFull, outerGenerateMs: meta.outer?.generateMs ?? null,
      pilotBaselineS: pilotS ?? null, deltaPctVsPilot: deltaPct,
    } : null,
    vertexOnSurf: row?.vertexOnSurf ?? null,
    forward: row ? {
      basis: row.interior?.basis ?? null,
      outliers: row.interior?.outliers ?? null,
      maxMm: row.interior?.maxMm ?? null,
      p99: row.interior?.p99 ?? null,
      nFacets: row.interior?.nFacets ?? null,
    } : null,
    newtonWorst: row?.newtonWorst ?? null,
    coverage: row?.coverage ? { max: row.coverage.max, p99: row.coverage.p99 } : null,
    nonManRaw: row?.nonManRaw ?? null,
    zeroArea: row?.zeroArea ?? null,
    ds: style === 'DragonScales' ? ds : undefined,
    verdictClass: classify(style, meta, row, ds),
  };
  scorecard.push(entry);
}

writeFileSync(join(OUT_DIR, 'all20_scorecard.ndjson'), scorecard.map((e) => JSON.stringify(e)).join('\n') + '\n');

const md = [];
md.push('| style | full/outer tris | generateMs (Δ vs pilot) | vtxOnSurf p99/max (gate) | forward outliers/max/p99 | newtonWorst | coverage max/p99 | nonMan/zeroArea | verdict |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const e of scorecard) {
  const tris = e.capture ? `${e.capture.fullTris ?? '-'} / ${e.capture.outerTris ?? '-'}` : '-';
  const gen = e.capture?.fullGenerateMs != null
    ? `${(e.capture.fullGenerateMs / 1000).toFixed(1)}s${e.capture.deltaPctVsPilot != null ? ` (${e.capture.deltaPctVsPilot > 0 ? '+' : ''}${e.capture.deltaPctVsPilot}% vs pilot ${e.capture.pilotBaselineS}s)` : ''}`
    : (e.capture?.error ? `ERROR: ${String(e.capture.error).slice(0, 60)}` : '-');
  const vtx = e.vertexOnSurf ? `${e.vertexOnSurf.p99?.toFixed(5)}/${e.vertexOnSurf.max?.toFixed(5)} ${e.vertexOnSurf.p99 > 0.01 ? 'FAILED' : 'OK'}` : (e.style === 'DragonScales' ? 'n/a (composite ruler)' : '-');
  const fwd = e.forward ? `${e.forward.outliers ?? '-'} / ${e.forward.maxMm?.toFixed(4) ?? '-'} / ${e.forward.p99?.toFixed(4) ?? '-'}` : (e.ds?.fwd ? `body ${e.ds.fwd.body?.outliers}/${e.ds.fwd.body?.maxMm} ring ${e.ds.fwd.ring?.outliers}/${e.ds.fwd.ring?.maxMm}` : '-');
  const newton = e.newtonWorst != null ? e.newtonWorst.toFixed(4) : '-';
  const cov = e.coverage ? `${e.coverage.max?.toFixed(4)}/${e.coverage.p99?.toFixed(4)}` : (e.ds?.rev ? `sheet ${e.ds.rev.sheet?.interior?.max?.toFixed(4)} wall ${e.ds.rev.wall?.max?.toFixed(4)}` : '-');
  const nm = e.nonManRaw != null ? `${e.nonManRaw}/${e.zeroArea}` : '-';
  md.push(`| ${e.style} | ${tris} | ${gen} | ${vtx} | ${fwd} | ${newton} | ${cov} | ${nm} | ${e.verdictClass} |`);
}
writeFileSync(join(OUT_DIR, 'all20_scorecard.md'), md.join('\n') + '\n');
console.log(`Wrote ${scorecard.length} rows. Verdict tally:`, scorecard.reduce((acc, e) => { acc[e.verdictClass] = (acc[e.verdictClass] || 0) + 1; return acc; }, {}));
console.log(md.join('\n'));
