// s88RowDiff.cjs — FIELD-LEVEL diff of two s85PosRebase per-facet ndjson checkpoints. RESEARCH ONLY.
//
// `cmp` already proves byte identity and is strictly stronger. This exists for the case where it does NOT:
// a byte diff says "these files differ" and nothing else, and the question that actually matters is WHICH
// FIELD moved and by how much — a changed `witnessed` is a broken audit, a changed `p` is a broken plane
// ruler, a changed `area` is a broken mesh read. It also reports in the same terms as the S87 C2 cross-tool
// control (witnessed / bound / plane / area / verdict), so the two checks can be quoted side by side.
//
// Usage: node research/tools/s88RowDiff.cjs A.ndjson B.ndjson
const fs = require('node:fs');

const [, , pa, pb] = process.argv;
const rd = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const A = rd(pa); const B = rd(pb);
console.log(`A ${pa}  ${A.length} rows`);
console.log(`B ${pb}  ${B.length} rows`);
if (A.length !== B.length) { console.log(`*** ROW COUNT DIFFERS ***`); process.exitCode = 1; }

const FIELDS = ['k', 'area', 'tg', 'p', 'w', 'b', 'v', 'c'];
const diff = Object.fromEntries(FIELDS.map((f) => [f, 0]));
const worst = Object.fromEntries(FIELDS.map((f) => [f, 0]));
const n = Math.min(A.length, B.length);
for (let i = 0; i < n; i += 1) {
  for (const f of FIELDS) {
    // Object.is, not ==, so a NaN pair counts as identical and a +0/-0 pair does not. Bit identity or nothing.
    if (!Object.is(A[i][f], B[i][f])) {
      diff[f] += 1;
      const d = Math.abs(Number(A[i][f]) - Number(B[i][f]));
      if (d > worst[f]) worst[f] = d;
    }
  }
}
let total = 0;
for (const f of FIELDS) total += diff[f];
console.log(`compared ${n} rows x ${FIELDS.length} fields = ${n * FIELDS.length} values`);
for (const f of FIELDS) console.log(`   ${f.padEnd(6)} differing ${String(diff[f]).padStart(6)}   worst |A-B| ${worst[f].toExponential(3)}`);
console.log(total === 0
  ? `*** IDENTICAL — 0 of ${n * FIELDS.length} per-facet values differ ***`
  : `*** ${total} PER-FACET VALUES DIFFER — the pooled run is NOT the serial run ***`);
if (total !== 0) process.exitCode = 1;
