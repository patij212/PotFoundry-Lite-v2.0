// s114LocsDelta.mjs — HOW FAR DID THE DOWNSTREAM `locs` FIELD MOVE?
//
// The S113 straddle dump's MEMBERSHIP does not depend on the locator, and the funnel/meta confirm that
// byte-for-byte. Its `locs` field does. This reads the PRE and POST ndjson (row-aligned, same 3,282 rows,
// same 19,692 facet edges) and prints the movement as COUNT + AREA-SHARE + MAX together, because count
// alone has over-stated defect area by 13-184x in this campaign and the two routinely disagree in
// direction.
//
// AREA WEIGHT: each of a facet's 3 edges carries area/3, so the three edges of a facet sum to its area.
// Shares are of the total so weighted.
//
//   node research/tools/s114LocsDelta.mjs <PRE.ndjson> <POST.ndjson>
import { readFileSync } from 'node:fs';

const [, , PRE, POST] = process.argv;
const rd = (p) => readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const A = rd(PRE); const B = rd(POST);
if (A.length !== B.length) { console.log(`*** ROW COUNT DIFFERS ${A.length} vs ${B.length} — VOID ***`); process.exit(3); }

// row-alignment control: the membership keys must match exactly, or the comparison is of two different sets
let keyMismatch = 0;
for (let i = 0; i < A.length; i += 1) if (A[i].e !== B[i].e || A[i].f1 !== B[i].f1 || A[i].f2 !== B[i].f2) keyMismatch += 1;
console.log(`rows ${A.length}   key mismatches ${keyMismatch}   ${keyMismatch === 0 ? '(row-aligned)' : '*** VOID ***'}`);
if (keyMismatch > 0) process.exit(3);

const pre = []; const post = []; const wt = [];
for (let i = 0; i < A.length; i += 1) {
  const ar = { [A[i].f1]: A[i].area1, [A[i].f2]: A[i].area2 };
  for (let j = 0; j < A[i].locs.length; j += 1) {
    const la = A[i].locs[j]; const lb = B[i].locs[j];
    if (la.f !== lb.f || la.edge !== lb.edge) { console.log('*** LOC ORDER DIFFERS — VOID ***'); process.exit(3); }
    pre.push(la.turnDeg); post.push(lb.turnDeg); wt.push(ar[la.f] / 3);
  }
}
const n = pre.length;
const W = wt.reduce((a, b) => a + b, 0);
const q = (v, p) => { const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mx = (v) => v.reduce((a, b) => (b > a ? b : a), -Infinity);

console.log(`facet edges ${n}   total area weight ${W.toFixed(3)} mm2`);
console.log('');
console.log('── turnDeg DISTRIBUTION ──                    p10        p50        p90        p99        MAX');
for (const [nm, v] of [['PRE  (bisection)', pre], ['POST (re-scan)  ', post]]) {
  console.log(`  ${nm}  ${q(v, 0.1).toFixed(4).padStart(10)} ${q(v, 0.5).toFixed(4).padStart(10)} ${q(v, 0.9).toFixed(4).padStart(10)} ${q(v, 0.99).toFixed(4).padStart(10)} ${mx(v).toFixed(4).padStart(10)}`);
}
console.log('');
console.log('── "THIS EDGE CARRIES A CREASE" (turn >= bar): COUNT and AREA-SHARE, at three bars ──');
console.log('   bar      PRE count  (area%)      POST count  (area%)      delta count   delta area%');
for (const bar of [1, 10, 45, 90]) {
  let ca = 0; let cb = 0; let wa = 0; let wb = 0;
  for (let i = 0; i < n; i += 1) {
    if (pre[i] >= bar) { ca += 1; wa += wt[i]; }
    if (post[i] >= bar) { cb += 1; wb += wt[i]; }
  }
  console.log(`  ${String(bar).padStart(4)} deg   ${String(ca).padStart(7)} (${((wa / W) * 100).toFixed(3).padStart(7)}%)   ${String(cb).padStart(7)} (${((wb / W) * 100).toFixed(3).padStart(7)}%)   ${String(cb - ca).padStart(11)}   ${(((wb - wa) / W) * 100).toFixed(3).padStart(11)}%`);
}
console.log('');
console.log('── DIRECTION OF THE MOVE (per edge) ──');
let up = 0; let dn = 0; let same = 0; let wUp = 0; let wDn = 0;
let maxUp = 0; let maxDn = 0;
for (let i = 0; i < n; i += 1) {
  const d = post[i] - pre[i];
  if (d > 1e-9) { up += 1; wUp += wt[i]; if (d > maxUp) maxUp = d; } else if (d < -1e-9) { dn += 1; wDn += wt[i]; if (-d > maxDn) maxDn = -d; } else same += 1;
}
console.log(`  POST > PRE (locator now SEES a turn it lost)   ${up} edges  ${((wUp / W) * 100).toFixed(3)}% of area   max +${maxUp.toFixed(3)} deg`);
console.log(`  POST < PRE (PRE was reporting a turn it should not)  ${dn} edges  ${((wDn / W) * 100).toFixed(3)}% of area   max -${maxDn.toFixed(3)} deg`);
console.log(`  unchanged to 1e-9 deg                          ${same} edges`);
console.log('');
// THE PRE-CODE SIGNATURE: an edge whose PRE `s` sat at the very left end is DEFECT B's fingerprint.
let leftPinned = 0; let leftPinnedPost = 0; let midPost = 0;
for (let i = 0; i < A.length; i += 1) for (let j = 0; j < A[i].locs.length; j += 1) {
  if (A[i].locs[j].s < 0.02) leftPinned += 1;
  if (B[i].locs[j].s < 0.02) leftPinnedPost += 1;
  if (Math.abs(B[i].locs[j].s - 0.5) < 1e-6) midPost += 1;
}
console.log('── DEFECT B FINGERPRINT: `s` pinned at the LEFT END ──');
console.log(`  PRE  s < 0.02 : ${leftPinned} edges (${((leftPinned / n) * 100).toFixed(2)}%)`);
console.log(`  POST s < 0.02 : ${leftPinnedPost} edges (${((leftPinnedPost / n) * 100).toFixed(2)}%)`);
console.log(`  POST s == 0.5 exactly (the honest "nothing here"): ${midPost} edges (${((midPost / n) * 100).toFixed(2)}%)`);
