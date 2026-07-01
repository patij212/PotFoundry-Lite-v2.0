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

// Explicit suffix-based rule resolver — readable at a glance.
// Exact basename match is the fast path; suffix rules cover named variants
// (e.g. "broken-scorecard.md") and filled transcripts (e.g. "smoke-transcript.md").
function ruleFor(file) {
  const base = path.basename(file);
  // Fast path: exact key match.
  if (RULES[base]) return RULES[base];
  // Suffix matches — explicit, no regex-strip cleverness.
  if (base === 'TRANSCRIPT-TEMPLATE.md' || base.endsWith('-transcript.md')) return RULES['TRANSCRIPT-TEMPLATE.md'];
  if (base === 'programme-scorecard.md' || base.endsWith('-scorecard.md'))   return RULES['programme-scorecard.md'];
  if (base === 'assumption-ledger.md'   || base.endsWith('-ledger.md'))       return RULES['assumption-ledger.md'];
  return undefined;
}

let ok = true;
for (const file of process.argv.slice(2)) {
  const rules = ruleFor(file);
  if (!rules) { console.error(`SKIP (no rule): ${file}`); continue; }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    ok = false;
    console.error(`FAIL ${file}: unreadable (${err.code || err.message})`);
    continue;
  }
  const missing = rules.filter(re => !re.test(text));
  if (missing.length) {
    ok = false;
    console.error(`FAIL ${file}: missing ${missing.map(String).join(', ')}`);
  } else {
    console.log(`OK   ${file}`);
  }
}
process.exit(ok ? 0 : 1);
