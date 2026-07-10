// E-2026-07-10-DS-PRODTRUTH — shard merger. Merges the per-shard partial FORWARD rows
// (written by _ds_prodtruth.test.ts's FORWARD task with PF_DS_PT_SHARD/PF_DS_PT_NSHARDS) into one
// whole-mesh row for the DragonScales production artifact: body/ring outliers+scannedFacets summed,
// maxMm maxed (per population), percentiles NOT merged across shards (each shard's percentiles are a
// PARTIAL-population statistic — labeled null in the merged row, matching the _prod_truth_merge.mjs
// precedent). Appends the merged row to scorecard.ndjson with key 'fwd_merged_band<band>'.
// Usage: node research/bridge/_ds_prodtruth_merge.mjs <bandMm>
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const bandMm = process.argv[2];
if (!bandMm) {
  console.error('usage: node research/bridge/_ds_prodtruth_merge.mjs <bandMm>');
  process.exit(1);
}
const OUT = join('research', 'exchange', '_ds_prodtruth', 'scorecard.ndjson');
const rows = readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const prefix = `fwd_band${bandMm}_shard`;
// Group candidate rows by their fleet size (nShards) — a calibration row from a different fleet
// (e.g. the 1-of-48 timing shard) must never be mixed into the 16-fleet merge. Merge the largest fleet.
const byFleet = new Map();
for (const r of rows) {
  if (typeof r.key === 'string' && r.key.startsWith(prefix) && r.task === 'forward-score') {
    if (!byFleet.has(r.nShards)) byFleet.set(r.nShards, new Map());
    byFleet.get(r.nShards).set(r.shard, r);
  }
}
if (byFleet.size === 0) {
  console.error(`no sharded FORWARD rows found for bandMm=${bandMm} (prefix ${prefix})`);
  process.exit(1);
}
const nShards = [...byFleet.entries()].sort((a, b) => b[1].size - a[1].size)[0][0];
const byShard = byFleet.get(nShards);
const shardsPresent = [...byShard.keys()].sort((a, b) => a - b);
const partial = byShard.size !== nShards;
if (partial) {
  // PARTIAL merge is permitted but must be LOUDLY labeled (basis honesty): the merged row carries
  // partial:true + shardsPresent + sampledFrac; whole-population figures derived from it are
  // labeled scaled ESTIMATES, never presented as literal counts.
  console.error(`PARTIAL merge: have shards [${shardsPresent}] of ${nShards} — proceeding with explicit partial labeling`);
}

const parts = [...byShard.values()];
function mergePop(field) {
  let outliers = 0, scannedFacets = 0, maxMm = -1, ms = 0;
  for (const p of parts) {
    const pop = p[field];
    outliers += pop.outliers;
    scannedFacets += pop.scannedFacets;
    if (pop.maxMm > maxMm) maxMm = pop.maxMm;
  }
  return { outliers, scannedFacets, maxMm: +maxMm.toFixed(6), p50: null, p90: null, p99: null };
}
const body = mergePop('body');
const ring = mergePop('ring');
const totalTris = body.scannedFacets + ring.scannedFacets;
const sampledFrac = totalTris / parts[0].outerTris;
const merged = {
  key: `fwd_merged_band${bandMm}${partial ? `_partial${shardsPresent.length}of${nShards}` : ''}`,
  task: 'forward-score-merged',
  style: 'DragonScales',
  bandMm: Number(bandMm),
  merged: true,
  partial,
  shardsPresent,
  nShards,
  sampledFrac: +sampledFrac.toFixed(6),
  at: new Date().toISOString(),
  outerTris: parts[0].outerTris,
  tol: parts[0].tol,
  body,
  ring,
  // Whole-population figures from a partial systematic sample are LABELED estimates.
  scaledEstimates: partial
    ? {
        basis: `systematic facet sample (f mod ${nShards} in [${shardsPresent}]), ${(sampledFrac * 100).toFixed(2)}% of outer facets`,
        bodyOutliersEst: Math.round(body.outliers / sampledFrac),
        ringOutliersEst: Math.round(ring.outliers / sampledFrac),
      }
    : null,
  ringBandAreaFrac: totalTris ? +(ring.scannedFacets / totalTris).toFixed(6) : 0,
  wallHidingSuspect: ring.maxMm < 0.1 && ring.scannedFacets > 0,
  bodyMsSum: parts.reduce((a, p) => a + (p.bodyMs || 0), 0),
  ringMsSum: parts.reduce((a, p) => a + (p.ringMs || 0), 0),
  wallClockMaxMs: Math.max(...parts.map((p) => p.totalMs || 0)),
};
appendFileSync(OUT, JSON.stringify(merged) + '\n');
console.log(
  `DragonScales FORWARD MERGED(${shardsPresent.length}/${nShards} shards${partial ? ', PARTIAL' : ''}): ` +
    `body out=${body.outliers}/${body.scannedFacets} max=${body.maxMm} | ` +
    `ring out=${ring.outliers}/${ring.scannedFacets} max=${ring.maxMm} | ` +
    `ringBandAreaFrac=${merged.ringBandAreaFrac} wallHidingSuspect=${merged.wallHidingSuspect} | ` +
    `bounded wall-clock (slowest shard) = ${(merged.wallClockMaxMs / 1000).toFixed(0)}s`,
);
