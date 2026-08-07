// revS116ScalarAudit.cjs — re-derive the S116 claim's AREA-WEIGHTED orientation table straight from the
// written per-facet normDeg scalar files + per-facet areas recomputed from the STLs. COUNT + AREA + MAX.
const fs = require('node:fs');

function areas(path) {
  const buf = fs.readFileSync(path);
  const n = buf.readUInt32LE(80);
  const a = new Float64Array(n);
  let o = 84; let tot = 0;
  for (let t = 0; t < n; t += 1) {
    o += 12;
    const v = new Array(9);
    for (let k = 0; k < 9; k += 1) { v[k] = buf.readFloatLE(o); o += 4; }
    o += 2;
    const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2];
    const wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
    a[t] = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    tot += a[t];
  }
  return { a, n, tot };
}
function scal(path, n) {
  const b = fs.readFileSync(path);
  const f = new Float64Array(b.buffer, b.byteOffset, b.length / 8);
  if (f.length !== n) throw new Error(`scalar length ${f.length} != facets ${n}`);
  return f;
}
function report(tag, stl, sc) {
  const { a, n, tot } = areas(stl);
  const nd = scal(sc, n);
  console.log(`── ${tag}: ${n} facets, ${tot.toFixed(3)} mm2, scalar ${sc.split(/[\\/]/).pop()}`);
  const srt = Float64Array.from(nd).sort();
  const q = (p) => srt[Math.min(srt.length - 1, Math.floor(srt.length * p))];
  // AREA-weighted quantiles
  const idx = Array.from({ length: n }, (_, i) => i).sort((x, y) => nd[x] - nd[y]);
  let acc = 0; const aq = {};
  const marks = [0.5, 0.9, 0.99];
  let mi = 0;
  for (const i of idx) { acc += a[i]; while (mi < marks.length && acc >= marks[mi] * tot) { aq[marks[mi]] = nd[i]; mi += 1; } }
  console.log(`   AREA-weighted normDeg  p50 ${aq[0.5].toFixed(4)}  p90 ${aq[0.9].toFixed(4)}  p99 ${aq[0.99].toFixed(4)}  MAX ${q(1).toFixed(3)}  (facet-count p50 ${q(0.5).toFixed(4)})`);
  for (const bar of [1, 5, 10, 45, 168.16035336252628]) {
    let c = 0; let ar = 0;
    for (let i = 0; i < n; i += 1) if (nd[i] > bar) { c += 1; ar += a[i]; }
    console.log(`   > ${String(bar === 168.16035336252628 ? 'CEIL 168.160' : bar).padStart(12)} deg   COUNT ${String(c).padStart(8)} (${((c / n) * 100).toFixed(4)}%)   AREA ${ar.toFixed(4).padStart(11)} mm2 (${((ar / tot) * 100).toFixed(4)}%)`);
  }
  return { n, tot };
}
const D = 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/.claude/worktrees/s112-angular-quantity/potfoundry-web/research/exchange/_strataConformBisect/s116';
console.log('revS116ScalarAudit — re-derived from the written scalar files, COUNT + AREA + MAX together\n');
report('BEST', `${D}/S116_BEST_GOTH_APCR.stl`, `${D}/S116_SCALAR_GBEST_NORMDEG.f64`);
console.log('');
report('BASE', 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl', `${D}/S116_SCALAR_GBASE_NORMDEG.f64`);
