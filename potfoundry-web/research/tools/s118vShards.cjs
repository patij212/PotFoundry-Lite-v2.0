// verifier: aggregate the 16 perpendicular shards for a given STL tag prefix
const fs = require('fs');
const path = require('path');
const d = 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/.claude/worktrees/s112-angular-quantity/potfoundry-web/research/exchange/_strataConformBisect/s118';
const want = process.argv[2] || 'R1OP';
const files = fs.readdirSync(d).filter((f) => f.endsWith('.json') && f.includes(want));
const seen = new Map();
for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch { console.log(f, 'PARSE FAIL'); continue; }
  const sh = j.perpShard;
  if (!sh) continue;
  seen.set(sh, { f, j });
}
const keys = [...seen.keys()].sort((a, b) => Number(a.split('/')[0]) - Number(b.split('/')[0]));
let cnt = 0, area = 0, mx = 0, adjTot = 0, adjDone = 0, viol = 0;
console.log('shard | file | perp keys');
for (const k of keys) {
  const { f, j } = seen.get(k);
  const p = j.perp || j.perpendicular || {};
  console.log(`\n--- shard ${k}  (${f})`);
  console.log(JSON.stringify(p));
}
console.log('\n=== artefacts (shard 0) ===');
if (keys.length) console.log(JSON.stringify(seen.get(keys[0]).j.artefacts));
console.log('\n=== topology (shard 0) ===');
if (keys.length) console.log(JSON.stringify(seen.get(keys[0]).j.topology || seen.get(keys[0]).j.topo));
console.log('\n=== all top-level keys ===');
if (keys.length) console.log(Object.keys(seen.get(keys[0]).j).join(', '));
