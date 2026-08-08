#!/usr/bin/env node
/* s119DriverFacts.cjs — pull the DRIVER-SIDE facts (the price) out of each rung's own log.
 *
 *   node research/tools/s119DriverFacts.cjs <DRV2 log basename without .log> ...
 *
 * Everything here is printed BY THE DRIVER during the run — triangles, allocation, wall clock, rA
 * evaluations (the deterministic cost; wall clock on this box is contended and is an indication only),
 * splits, the STRANDED/unresolved count with BOTH of the driver's own rulers, and the f64 emit-time
 * census (PF_CB_S118_CENSUS=1) including the mesh-wide MIN ARC ALTITUDE, which is the quantity the
 * degeneracy pole is defined by. It parses; it does not compute.
 */
/* global process */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DIR = path.join(process.cwd(), 'research/exchange/_strataConformBisect/s119');
const g = (s, re, i = 1) => { const m = s.match(re); return m ? m[i] : null; };
const num = (v) => (v === null ? null : Number(String(v).replace(/,/g, '')));

const rows = [];
for (const base of process.argv.slice(2)) {
  const p = path.join(DIR, `${base}.log`);
  if (!fs.existsSync(p)) { rows.push({ base, missing: true }); continue; }
  const s = fs.readFileSync(p, 'utf8');
  rows.push({
    base,
    nTri: num(g(s, /→ (\d+) tris \(alloc/)),
    alloc: num(g(s, /\(alloc (\d+)\//)),
    triCap: num(g(s, /\(alloc \d+\/(\d+)\)/)),
    capped: /\[CAPPED\]/.test(s),
    timeCapped: /TIME-CAPPED/.test(s),
    secs: num(g(s, /\)\s*(?:\[CAPPED\]\s*)?\s+(\d+)s, [\d.]+M rA evals/)),
    rA: num(g(s, /([\d.]+)M rA evals/)),
    splits: num(g(s, /^splits (\d+)/m)),
    unres: num(g(s, /^unresolved: (\d+) live/m)),
    unresPlane: num(g(s, /worst ([\d.]+) µm \(stored key/)),
    unresEdge: num(g(s, /worst ([\d.]+) µm \(EDGE ruler/)),
    minAltNm: num(g(s, /mesh-wide MIN arc altitude ([\d.]+) nm/)),
    minAltBirthNm: num(g(s, /min arc altitude at birth ([\d.]+) nm/)),
    t1deg: num(g(s, /T1 degenerate \|qP\| < [\d.]+:\s+COUNT (\d+)/)),
    t1degA: num(g(s, /T1 degenerate \|qP\| < [\d.]+:\s+COUNT \d+\s+AREA ([\d.]+) mm2/)),
    t2fold: num(g(s, /T2 fold \(sigma\*apS <= 0\):\s+COUNT (\d+)/)),
    t3blade: num(g(s, /T3 blade \(arcAlt < [\d.]+ um\): COUNT (\d+)/)),
    t3bladeA: num(g(s, /T3 blade \(arcAlt < [\d.]+ um\): COUNT \d+\s+AREA ([\d.]+) mm2/)),
    sel: (g(s, /edge selection: PF_CB_S119_PARAMSEL=(\S+)/) || '?'),
    lad20: num(g(s, /arcAlt <\s+20 um :\s+COUNT\s+(\d+)/)),
    lad20A: num(g(s, /arcAlt <\s+20 um :\s+COUNT\s+\d+\s+AREA\s+([\d.]+) mm2/)),
  });
}
const f = (v, d = 0) => (v === null || v === undefined ? '      —' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const L = (s) => process.stdout.write(`${s}\n`);
L('── DRIVER-SIDE FACTS (parsed from each rung\'s own log; rA evals is the deterministic cost, wall clock is CONTENDED) ──');
L(`${'rung log'.padEnd(34)}${'sel'.padStart(7)}${'facets'.padStart(11)}${'alloc'.padStart(11)}${'cap?'.padStart(6)}${'wall s'.padStart(8)}${'M rA'.padStart(8)}${'splits'.padStart(10)}${'STRANDED'.padStart(10)}${'worstEDGE um'.padStart(13)}${'minAlt nm'.padStart(12)}${'birth nm'.padStart(10)}${'T1deg'.padStart(7)}${'T2fold'.padStart(7)}${'T3blade'.padStart(9)}`);
for (const r of rows) {
  if (r.missing) { L(`${r.base.padEnd(34)}   *** LOG MISSING — NOT MEASURED, NOT ZERO ***`); continue; }
  L(`${r.base.replace('DRV2_', '').padEnd(34)}${String(r.sel).padStart(7)}${f(r.nTri).padStart(11)}${f(r.alloc).padStart(11)}${(r.capped ? 'CAP' : r.timeCapped ? 'TIME' : 'drain').padStart(6)}${f(r.secs).padStart(8)}${f(r.rA).padStart(8)}${f(r.splits).padStart(10)}${f(r.unres).padStart(10)}${f(r.unresEdge, 3).padStart(13)}${f(r.minAltNm, 3).padStart(12)}${f(r.minAltBirthNm, 3).padStart(10)}${f(r.t1deg).padStart(7)}${f(r.t2fold).padStart(7)}${f(r.t3blade).padStart(9)}`);
}
