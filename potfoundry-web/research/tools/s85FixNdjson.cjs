// s85FixNdjson.cjs — REPAIR checkpoint files that TWO writers appended to at once.
//
// WHAT HAPPENED, recorded so it is not re-learned. The agent harness reported three background queue
// wrappers as "killed", but the child `bash` scripts survived the signal. Relaunching the queues therefore
// produced TWO processes per slot walking the SAME job list and appending to the SAME per-facet ndjson.
// Detected by the only check that catches it: `wc -l` vs the number of DISTINCT facet indices in the file.
// Nine files had lines > unique-k. The whole AR-cap block (S39CTL / S40AR55 / S40AR65 / S40AR90, both arms,
// plus S41CTL / VORONOI / LOWPOLY target) was written before the relaunch and is exactly lines == unique.
//
// WHY DEDUPE IS LOSSLESS. `certifyTriangle` and `sagAdaptiveRaw` are deterministic functions of the facet
// and rA, so two writers scoring the same facet write the same row. The damage is re-WEIGHTING (a facet
// counted twice) and a wrong N, not wrong values.
//
// WHY ORDER MATTERS. `s85PosRebase.ts` resumes at `rows.length` and assumes row q is IDX[q]. Two writers at
// different offsets break that, so dedupe alone is not enough: the rows must be re-ordered by their position
// in the ORIGINAL index list and truncated at the first GAP, so the file is once again a true prefix.
// Re-running then re-scores only from the gap onward.
//
//   node research/tools/s85FixNdjson.cjs            # report only
//   node research/tools/s85FixNdjson.cjs --write    # rewrite the damaged files
'use strict';
const fs = require('node:fs');
const DIR = 'research/exchange/_strataConformBisect';
const OUT = `${DIR}/s85rebase`;
const WRITE = process.argv.includes('--write');

const JOBS = [
  ['S39CTL', 'gothicarches_ring_DS-HT_S39CTL', 50000],
  ['S40AR55', 'gothicarches_ring_DS-HT_S40AR55', 50000],
  ['S40AR65', 'gothicarches_ring_DS-HT_S40AR65', 50000],
  ['S40AR90', 'gothicarches_ring_DS-HT_S40AR90', 50000],
  ['S41CTL', 'gothicarches_ring_DS-HT_S41CTL', 25000],
  ['S41CAVRES', 'gothicarches_ring_DS-HT_S41CAVRES', 25000],
  ['S48CAV90', 'gothicarches_ring_DS-HT_S48CAV90', 25000],
  ['S48ADM90', 'gothicarches_ring_DS-HT_S48ADM90', 25000],
  ['S47CAV', 'gothicarches_ring_DS-HT_S47CAV', 25000],
  ['S36CA', 'gothicarches_ring_DS-HT_S36CA', 25000],
  ['VORONOI', 'voronoi_ring_D--', 8000],
  ['LOWPOLY', 'lowpolyfacet_ring_D--', 10000],
];

function nTriOf(stem) {
  const fd = fs.openSync(`${DIR}/${stem}.stl`, 'r');
  const b = Buffer.alloc(4);
  fs.readSync(fd, b, 0, 4, 80); fs.closeSync(fd);
  return b.readUInt32LE(0);
}
function goldenIdx(nTri, count) {
  const out = new Array(Math.min(count, nTri));
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (s > 1 && gcd(s, nTri) !== 1) s += 2;
  if (s >= nTri) s = 1;
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % nTri;
  return out;
}

// eslint-disable-next-line no-console
const log = console.log;
log(`s85FixNdjson — ${WRITE ? 'REWRITING' : 'REPORT ONLY (pass --write to repair)'}`);
for (const [tag, stem, N] of JOBS) {
  let nTri;
  try { nTri = nTriOf(stem); } catch { continue; }
  for (const arm of ['uniform', 'target']) {
    const p = `${OUT}/${tag}.${arm}.ndjson`;
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter((s) => s.length > 2);
    const rows = []; let bad = 0;
    for (const ln of lines) { try { rows.push([ln, JSON.parse(ln).k]); } catch { bad += 1; } }
    // the ORIGINAL index list this arm walks
    let idx;
    if (arm === 'uniform') idx = goldenIdx(nTri, N);
    else {
      const selP = `${OUT}/${tag}.sel.json`;
      if (!fs.existsSync(selP)) { log(`  ${tag}.${arm}: no sel.json, skipped`); continue; }
      idx = JSON.parse(fs.readFileSync(selP, 'utf8')).idx;
    }
    const posOf = new Map(); for (let q = 0; q < idx.length; q += 1) if (!posOf.has(idx[q])) posOf.set(idx[q], q);
    const seen = new Map();
    for (const [ln, k] of rows) { const q = posOf.get(k); if (q !== undefined && !seen.has(q)) seen.set(q, ln); }
    // truncate at the first gap so the file is a true prefix again
    let m = 0; while (seen.has(m)) m += 1;
    const clean = lines.length === seen.size && seen.size === m;
    log(`  ${tag}.${arm}: lines ${lines.length}  distinct-in-list ${seen.size}  contiguous-prefix ${m}  parse-fail ${bad}  => ${clean ? 'CLEAN' : 'DAMAGED'}`);
    if (!clean && WRITE) {
      const outLines = []; for (let q = 0; q < m; q += 1) outLines.push(seen.get(q));
      fs.copyFileSync(p, `${p}.dup.bak`);
      fs.writeFileSync(p, outLines.length > 0 ? `${outLines.join('\n')}\n` : '');
      log(`     rewritten to ${m} rows (original kept as ${tag}.${arm}.ndjson.dup.bak)`);
      const sp = `${OUT}/${tag}.${arm}.summary.json`;
      if (fs.existsSync(sp) && m < idx.length) { fs.renameSync(sp, `${sp}.stale`); log('     summary marked .stale (it was computed over duplicated rows)'); }
    }
  }
}
log('done');
