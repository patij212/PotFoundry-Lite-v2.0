// revqOracleAudit.cjs — INDEPENDENT re-derivation of the S113-OP4 oracle headline numbers
// straight from the three row dumps. Reads only; writes nothing.
const fs = require('node:fs');
const D = 'research/exchange/_strataConformBisect/straddle';
const rd = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const q = (v, p) => { const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const mx = (v) => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
const mn = (v) => v.reduce((a, b) => (Number.isFinite(b) && b < a ? b : a), Infinity);

const pin = rd(`${D}/S113_STRADDLE_GOTH.ndjson`);
const A = rd(`${D}/S113OP_ORACLE_GOTH.ndjson`);
const B = rd(`${D}/S113OPB_ORACLE_GOTH.ndjson`);
const C = rd(`${D}/S113OPC_ORACLE_GOTH.ndjson`);
console.log(`rows: pin ${pin.length}  A ${A.length}  B ${B.length}  C ${C.length}`);
console.log('A keys:', Object.keys(A[0]).join(','));
console.log('B keys:', Object.keys(B[0]).join(','));
console.log('C keys:', Object.keys(C[0]).join(','));

// ---- 1. membership identity: A rows must be the pinned rows, same order, same e/f1/f2 ----
let mism = 0;
for (let i = 0; i < A.length; i += 1) {
  if (A[i].e !== pin[i].e || A[i].f1 !== pin[i].f1 || A[i].f2 !== pin[i].f2) mism += 1;
}
console.log(`MEMBERSHIP A vs pinned: mismatched rows ${mism}`);

// ---- 2. unique-facet area, recomputed from the dumps (double-count check) ----
const area = new Map();
for (const r of A) { area.set(r.f1, r.area1); area.set(r.f2, r.area2); }
// consistency: does any facet appear with two different areas across pairs?
let inconsist = 0;
for (const r of A) {
  if (Math.abs(area.get(r.f1) - r.area1) > 0 || Math.abs(area.get(r.f2) - r.area2) > 0) inconsist += 1;
}
let tot = 0; for (const v of area.values()) tot += v;
console.log(`UNIQUE FACETS ${area.size}   AREA ${tot.toFixed(4)} mm2   per-facet area inconsistencies ${inconsist}`);
const sumPairwise = A.reduce((a, r) => a + r.area1 + r.area2, 0);
console.log(`  naive pair-sum area (would be DOUBLE COUNTED) ${sumPairwise.toFixed(4)} mm2  ratio ${(sumPairwise / tot).toFixed(3)}x`);

// ---- 3. IRREDUCIBLE loose / strict, recomputed ----
const VIS = 45;
const anyIrr = new Map(); const allIrr = new Map();
for (const r of A) {
  const irr = r.sepCreaseDeg >= VIS;
  for (const f of [r.f1, r.f2]) {
    anyIrr.set(f, (anyIrr.get(f) ?? false) || irr);
    allIrr.set(f, (allIrr.get(f) ?? true) && irr);
  }
}
let aL = 0, nL = 0, aS = 0, nS = 0, tie = 0;
for (const [f, ar] of area) {
  if (anyIrr.get(f)) { aL += ar; nL += 1; }
  if (allIrr.get(f)) { aS += ar; nS += 1; }
  if (Boolean(anyIrr.get(f)) !== Boolean(allIrr.get(f))) tie += 1;
}
const nIrrPair = A.filter((r) => r.sepCreaseDeg >= VIS).length;
console.log(`PAIRS irreducible ${nIrrPair}/${A.length} = ${((nIrrPair / A.length) * 100).toFixed(2)}%`);
console.log(`LOOSE  COUNT ${nL} (${((nL / area.size) * 100).toFixed(2)}%)  AREA ${aL.toFixed(4)} = ${((aL / tot) * 100).toFixed(2)}%`);
console.log(`STRICT COUNT ${nS} (${((nS / area.size) * 100).toFixed(2)}%)  AREA ${aS.toFixed(4)} = ${((aS / tot) * 100).toFixed(2)}%`);
console.log(`ties ${tie}`);
// area of REDUCIBLE facets under BOTH attributions, and their count
console.log(`REDUCIBLE (loose complement) COUNT ${area.size - nL}  AREA ${(tot - aL).toFixed(4)} = ${(((tot - aL) / tot) * 100).toFixed(2)}%`);
console.log(`REDUCIBLE (strict complement) COUNT ${area.size - nS}  AREA ${(tot - aS).toFixed(4)} = ${(((tot - aS) / tot) * 100).toFixed(2)}%`);

// mean facet area of irreducible vs reducible — count/area direction check
const arL = [], arR = [];
for (const [f, ar] of area) (anyIrr.get(f) ? arL : arR).push(ar);
console.log(`  mean facet AREA irreducible ${(aL / nL).toExponential(3)}  reducible ${((tot - aL) / (area.size - nL)).toExponential(3)}  ratio ${((aL / nL) / ((tot - aL) / (area.size - nL))).toFixed(2)}x`);

// ---- 4. the crease-turn estimator: gap, and the three estimators against each other ----
const gap = A.map((r) => r.gapMm);
console.log(`gapMm: zero-exactly ${gap.filter((g) => g === 0).length}/${gap.length}  p50 ${q(gap, 0.5).toExponential(3)}  p90 ${q(gap, 0.9).toExponential(3)}  MAX ${mx(gap).toExponential(3)}  nonfinite ${gap.filter((g) => !Number.isFinite(g)).length}`);
for (const k of ['sepCentDeg', 'sepCreaseDeg', 'diamDeg', 'measDeg', 'dihCorrDeg']) {
  const v = A.map((r) => r[k]);
  console.log(`  ${k.padEnd(13)} p10 ${q(v, 0.1).toFixed(2)} p50 ${q(v, 0.5).toFixed(2)} p90 ${q(v, 0.9).toFixed(2)} MAX ${mx(v).toFixed(2)} MIN ${mn(v).toFixed(2)}`);
}
// how many pairs would flip class under the OTHER two estimators?
for (const k of ['sepCentDeg', 'diamDeg']) {
  const n = A.filter((r) => r[k] >= VIS).length;
  console.log(`  irreducible under ${k}: ${n}/${A.length} = ${((n / A.length) * 100).toFixed(2)}%`);
}
// pairCrease flag vs irreducible
console.log(`  pairCrease TRUE ${A.filter((r) => r.pairCrease).length}; irreducible AND NOT pairCrease ${A.filter((r) => r.sepCreaseDeg >= VIS && !r.pairCrease).length}`);

// ---- 5. CIRCULARITY: what did the pinned membership already require? ----
const turns = pin.flatMap((r) => r.locs.map((l) => l.turnDeg));
console.log(`PINNED locs turnDeg over ${turns.length}: p10 ${q(turns, 0.1).toFixed(3)} p50 ${q(turns, 0.5).toFixed(3)} p90 ${q(turns, 0.9).toFixed(2)} MAX ${mx(turns).toFixed(2)}`);
const perRowMaxTurn = pin.map((r) => mx(r.locs.map((l) => l.turnDeg)));
console.log(`  per-pair MAX loc turnDeg: p10 ${q(perRowMaxTurn, 0.1).toFixed(2)} p50 ${q(perRowMaxTurn, 0.5).toFixed(2)} MIN ${mn(perRowMaxTurn).toFixed(2)}`);
console.log(`  pairs whose max loc turn already >= 45: ${perRowMaxTurn.filter((t) => t >= 45).length}/${pin.length} = ${((perRowMaxTurn.filter((t) => t >= 45).length / pin.length) * 100).toFixed(2)}%`);

// ---- 6. PART B partition arithmetic ----
console.log('--- B ---');
let bTot = 0; for (const r of B) bTot += r.areaMm2 ?? r.area ?? 0;
console.log(`B rows ${B.length}  area-field sum ${bTot.toFixed(4)}`);
console.log('B sample row:', JSON.stringify(B[0]));
console.log('C sample row:', JSON.stringify(C[0]));
