#!/usr/bin/env node
// s87C2Compare.cjs — CONTROL C2. Compares s87's per-facet rows against s85PosRebase's own ndjson on the
// SAME mesh and the SAME facets (the golden stride is nested, so s87's N=8,000 is the 8,000-term PREFIX of
// s85's N=50,000 row). Two independently-driven tools, different rA construction — s87 takes the hoisted
// `_raFast` twin via `buildAuditRadiusFn`, s85 called `buildRadiusFn` directly. If they disagree by one ulp
// on `witnessed`, the twin is changing an answer and every s87 number is inadmissible.
// PRINTS VALUES, NOT A VERDICT.
'use strict';
const fs = require('node:fs');
const DIR = 'research/exchange/_strataConformBisect';
const A = `${DIR}/s87ledger/C2S39CTL.pos.ndjson`;
const B = `${DIR}/s85rebase/S39CTL.uniform.ndjson`;
const rd = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const a = rd(A); const b = rd(B).slice(0, a.length);
let idxMismatch = 0; let verdictDiff = 0; let maxDW = 0; let maxDB = 0; let maxDP = 0; let maxDA = 0;
let fail87 = 0; let fail85 = 0;
for (let i = 0; i < a.length; i += 1) {
  if (a[i].k !== b[i].k) idxMismatch += 1;
  if (a[i].v !== b[i].v) verdictDiff += 1;
  if (a[i].v === 1) fail87 += 1;
  if (b[i].v === 1) fail85 += 1;
  maxDW = Math.max(maxDW, Math.abs(a[i].w - b[i].w));
  maxDB = Math.max(maxDB, Math.abs(a[i].b - b[i].b));
  maxDP = Math.max(maxDP, Math.abs(a[i].p - b[i].p));
  maxDA = Math.max(maxDA, Math.abs(a[i].area - b[i].area));
}
const out = { n: a.length, idxMismatch, verdictDiff, fail87, fail85, maxDW, maxDB, maxDP, maxDA };
process.stdout.write(`C2: n=${a.length}\n`);
process.stdout.write(`  facet-index mismatches   ${idxMismatch}\n`);
process.stdout.write(`  verdict differences      ${verdictDiff}\n`);
process.stdout.write(`  PROVEN-FAIL  s87 ${fail87}   s85 ${fail85}\n`);
process.stdout.write(`  max |d witnessed| um     ${maxDW.toExponential(6)}\n`);
process.stdout.write(`  max |d bound|     um     ${maxDB.toExponential(6)}\n`);
process.stdout.write(`  max |d plane|     um     ${maxDP.toExponential(6)}\n`);
process.stdout.write(`  max |d area|      mm^2   ${maxDA.toExponential(6)}\n`);
fs.writeFileSync(`${DIR}/s87ledger/C2_COMPARE.json`, JSON.stringify(out, null, 2));
