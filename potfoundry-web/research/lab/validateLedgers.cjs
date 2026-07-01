#!/usr/bin/env node
// Dependency-free format validator for the meshing-lab durable ledgers.
// Usage: node research/lab/validateLedgers.cjs <file...>
// Exit 0 iff every file matches its required structure; else 1 with a reason.
const fs = require('fs');
const path = require('path');

const RULES = {
  'programme-scorecard.md': [
    /^## Scorecard$/m,
    /\|\s*date\s*\|\s*programme\s*\|\s*finding\s*\|\s*label\s*\|\s*novel-facts:exceptions\s*\|\s*trend\s*\|/m,
    /^## Auto-invert rule$/m,
  ],
  'assumption-ledger.md': [
    /^## Assumptions$/m,
    /\|\s*assumption\s*\|\s*relied-on-by\s*\|\s*blast-radius\s*\|\s*flip-probe\s*\|\s*last-inverted\s*\|\s*evidence-for\s*\|\s*refuted-flips\s*\|/m,
    /^## Inversion cadence$/m,
  ],
  'TRANSCRIPT-TEMPLATE.md': [
    /^## FINDINGS$/m,
    /^## SURPRISES$/m,
    /^## CLOSE-GATE RECEIPTS$/m,
    /^## ASSUMPTIONS TOUCHED$/m,
  ],
};

function ruleFor(file) {
  const base = path.basename(file);
  return RULES[base] || RULES[Object.keys(RULES).find(k => base.endsWith(k) || k.endsWith(base.replace(/^[^-]+-/, '')))];
}

let ok = true;
for (const file of process.argv.slice(2)) {
  const rules = ruleFor(file);
  if (!rules) { console.error(`SKIP (no rule): ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  const missing = rules.filter(re => !re.test(text));
  if (missing.length) {
    ok = false;
    console.error(`FAIL ${file}: missing ${missing.map(String).join(', ')}`);
  } else {
    console.log(`OK   ${file}`);
  }
}
process.exit(ok ? 0 : 1);
