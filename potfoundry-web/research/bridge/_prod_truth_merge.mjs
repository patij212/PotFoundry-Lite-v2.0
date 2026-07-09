// E-2026-07-09-FAST-HONEST-RULER — shard merger. Merges the per-shard partial rows of a style
// (written by _prod_truth.test.ts with PF_PT_SHARD/PF_PT_NSHARDS) into one whole-mesh row:
// outliers/scannedFacets summed, maxMm maxed, newtonWorst taken from the shard owning the global
// max (each shard Newtons its own worst facet point). p-stats are per-shard survivor populations
// and are NOT merged (labeled null). Appends the merged row to scorecard.ndjson.
// Usage: node research/bridge/_prod_truth_merge.mjs <StyleName>
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const style = process.argv[2];
if (!style) {
  console.error('usage: node research/bridge/_prod_truth_merge.mjs <StyleName>');
  process.exit(1);
}
const OUT = join('research', 'exchange', '_prod_truth', 'scorecard.ndjson');
const rows = readFileSync(OUT, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// Latest partial row per shard for this style (sharded runs only).
const byShard = new Map();
for (const r of rows) {
  if (r.style === style && r.interior && r.nShards > 1 && !r.merged) byShard.set(r.shard, r);
}
if (byShard.size === 0) {
  console.error(`no sharded rows for ${style}`);
  process.exit(1);
}
const nShards = [...byShard.values()][0].nShards;
if (byShard.size !== nShards) {
  console.error(`incomplete: have shards [${[...byShard.keys()].sort((a, b) => a - b)}] of ${nShards}`);
  process.exit(1);
}

const parts = [...byShard.values()];
const shard0 = byShard.get(0);
let maxMm = -1, newtonWorst = undefined, outliers = 0, scanned = 0, ms = 0;
for (const p of parts) {
  outliers += p.interior.outliers;
  scanned += p.interior.scannedFacets;
  ms = Math.max(ms, p.interior.ms);
  if (p.interior.maxMm > maxMm) {
    maxMm = p.interior.maxMm;
    newtonWorst = p.newtonWorst;
  }
}
const merged = {
  style,
  merged: true,
  at: new Date().toISOString(),
  tol: shard0.tol,
  fullTris: shard0.fullTris,
  outerTris: shard0.outerTris,
  nShards,
  nonManRaw: shard0.nonManRaw,
  nonManControlMoved: shard0.nonManControlMoved,
  zeroArea: shard0.zeroArea,
  vertexOnSurf: shard0.vertexOnSurf,
  interiorRulerPremiseOk: shard0.interiorRulerPremiseOk,
  interior: {
    basis: shard0.interior.basis.replace(/shard=\d+\/\d+/, `merged ${nShards} shards`),
    outliers,
    scannedFacets: scanned,
    nFacets: shard0.interior.nFacets,
    survivors: shard0.interior.survivors,
    maxMm,
    p50: null,
    p90: null,
    p99: null,
    ms,
  },
  newtonWorst,
  coverage: shard0.coverage,
};
appendFileSync(OUT, JSON.stringify(merged) + '\n');
console.log(
  `${style} MERGED(${nShards}): interior out=${outliers} scanned=${scanned}/${shard0.interior.survivors} ` +
    `max=${maxMm.toFixed(4)} -> newton ${newtonWorst?.toFixed(4)} | coverage max=${shard0.coverage?.max?.toFixed(4)} ` +
    `| vtx p99=${shard0.vertexOnSurf?.p99?.toFixed(5)} ${shard0.interiorRulerPremiseOk ? 'OK' : 'FAILED'}`,
);
