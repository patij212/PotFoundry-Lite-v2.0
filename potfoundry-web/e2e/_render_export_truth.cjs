// Render the production-export-truth JSON into a committable markdown truth table + verdicts.
// Usage: PF_IN=e2e/baselines/production-export-truth-pass1.json PF_OUT=research/lab/2026-07-23-production-export-truth.md node e2e/_render_export_truth.cjs
const fs = require('fs');
const IN = process.env.PF_IN || 'e2e/baselines/production-export-truth-pass1.json';
const OUT = process.env.PF_OUT || 'research/lab/2026-07-23-production-export-truth.md';
const TOL = 0.01;

const j = JSON.parse(fs.readFileSync(IN, 'utf8'));
const rows = j.rows || [];
const byStyle = new Map();
for (const r of rows) {
  if (!byStyle.has(r.style)) byStyle.set(r.style, {});
  byStyle.get(r.style)[r.state] = r;
}

const f = (x) => (x === undefined || x === null || Number.isNaN(x) ? 'n/a' : (+x).toFixed(5));
const tri = (x) => (x === undefined || x === null ? 'n/a' : (x / 1e6).toFixed(2) + 'M');
const holds = (c) => c && !c.error && c.boundaryEdges === 0 && c.downloadOk === true && c.referenceTrusted === true && Number.isFinite(c.maxMm) && c.maxMm <= TOL;

function verdict(off, on) {
  if (!on || on.error) return `**ON-ERROR** (${on ? String(on.error).slice(0, 60) : 'no ON row'})`;
  if (holds(on)) {
    const offNote = holds(off) ? ' — OFF already holds too (closure may be redundant)' : '';
    return `**CLOSED-holds**${offNote}`;
  }
  const reasons = [];
  if (!Number.isFinite(on.maxMm)) reasons.push('fidelity unmeasured (refTrusted=' + on.referenceTrusted + ')');
  else if (on.maxMm > TOL) reasons.push(`gap ${f(on.maxMm)}mm`);
  if (on.boundaryEdges !== 0) reasons.push(`non-watertight boundary=${on.boundaryEdges}`);
  if (on.downloadOk !== true) reasons.push(`download-gate FAIL (${(on.downloadErrors || [])[0] || '?'})`);
  if (on.referenceTrusted !== true) reasons.push('reference-untrusted (INCONCLUSIVE)');
  return `**CLOSED-refuted** (${reasons.join('; ')})`;
}

let md = `# Production Export Truth — Pass 1 (measured, real GPU pipeline)\n\n`;
md += `_Generated from \`${IN}\` — measured through the REAL in-app export pipeline (WebGPU eval + WatertightAssembly + the actual \`validateMeshForExport\` download gate) on an NVIDIA Turing adapter, MAX-first, at PRODUCTION dims (\`${JSON.stringify(j.dims)}\`) + registry-default params. Ruler: \`measureProjectorMax\` (one-sided Hausdorff mesh→exact rA, no exclusion loci ⇒ cliffs measured); watertight via \`topologyMetric\`. Certify iff \`max ≤ ${TOL}mm ∧ boundary=0 ∧ download-gate pass ∧ referenceTrusted\`._\n\n`;
md += `**What OFF vs ON mean:** OFF = what a user exports TODAY (old conforming mesher, all perfect-mesher flags off). ON = the flag-gated structured emitter for that style (\`__pfPerfectMesher\` + the per-family sub-flag).\n\n`;
md += `| Style | OFF max·wt·tris·gate | ON max·wt·tris·gate·refTrust | flag-wired | verdict (ON) |\n`;
md += `|---|---|---|---|---|\n`;

const order = ['HarmonicRipple', 'SuperellipseMorph', 'FourierBloom', 'SpiralRidges', 'SuperformulaBlossom', 'WaveInterference', 'LowPolyFacet', 'DragonScales', 'BambooSegments'];
const seen = new Set();
const emit = (style) => {
  const p = byStyle.get(style);
  if (!p) return;
  seen.add(style);
  const off = p.off, on = p.on;
  const offCell = off ? (off.error ? `ERR ${String(off.error).slice(0, 40)}` : `${f(off.maxMm)}·${off.boundaryEdges === 0 ? 'wt' : 'bnd' + off.boundaryEdges}·${tri(off.triangleCount)}·${off.downloadOk ? 'ok' : 'FAIL'}`) : '—';
  const onCell = on ? (on.error ? `ERR ${String(on.error).slice(0, 40)}` : `${f(on.maxMm)}·${on.boundaryEdges === 0 ? 'wt' : 'bnd' + on.boundaryEdges}·${tri(on.triangleCount)}·${on.downloadOk ? 'ok' : 'FAIL'}·${on.referenceTrusted ? 'T' : 'F'}`) : '—';
  const wired = off && on && !off.error && !on.error ? (on.triangleCount !== off.triangleCount ? 'WIRED' : '**UNCHANGED(!)**') : '?';
  md += `| ${style} | ${offCell} | ${onCell} | ${wired} | ${verdict(off, on)} |\n`;
};
order.forEach(emit);
for (const style of byStyle.keys()) if (!seen.has(style)) emit(style);

const done = order.filter((s) => byStyle.has(s));
const heldOn = done.filter((s) => holds(byStyle.get(s).on));
const heldOff = done.filter((s) => holds(byStyle.get(s).off));
md += `\n## Summary\n\n`;
md += `- Styles measured: **${done.length}/9**.\n`;
md += `- **CLOSED-holds (ON emitter ≤${TOL}mm + watertight + gate + trusted): ${heldOn.length}** — ${heldOn.join(', ') || 'none'}.\n`;
md += `- Already ≤${TOL}mm on OFF (today's mesher, closure redundant): ${heldOff.length} — ${heldOff.join(', ') || 'none'}.\n`;
md += `- Slivers: full-solid \`minAngle\` runs sub-degree across styles (base/drain cap fans, not the wall) — a separate pre-existing concern for both OFF and ON.\n`;

fs.mkdirSync(require('path').dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log('wrote ' + OUT + ' (' + done.length + '/9 styles)');
