// s118Merge.ts — merge the per-shard JSONs of a sharded s118Score run back into ONE mesh number.
//
// PF_S118_PERPSHARD=i/n restricts the perpendicular phase to facets with f % n === i. *** THAT IS A
// PARTITION, NOT A SAMPLE: *** running all n shards covers every facet exactly once, so COUNT and AREA
// ADD and MAX is a MAX. This tool refuses to print a merged number unless it can see all n shards, has
// verified they came from the same mesh, the same bars and the same projector grid, and every one of
// them reported ZERO C2 violations. A merge that quietly tolerates a missing shard is how a 1e7-facet
// run silently becomes a 7/8 sample.
//
// The one quantity that DEGRADES under sharding (and is reported so, rather than hidden): the
// branch-and-bound skip. Each shard starts its running max at 0, so the total projector-call count is
// higher than a single process would need. The ANSWER is unchanged; only the cost is.
//
// Usage: node <bundle>   env PF_S118M_GLOB=research/exchange/_strataConformBisect/s118/S118_SCORE_TAG_p*.json
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

// eslint-disable-next-line no-console
const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const PAT = envS('PF_S118M_GLOB', '');
if (PAT.length === 0) { log('*** PF_S118M_GLOB required, e.g. .../S118_SCORE_TAG_p*.json ***'); process.exit(2); }

interface Shard {
  file: string; nTri: number; stl: string; barHi: number; barLo: number; perpShard: string;
  perpGrid: number[]; area3D: number;
  perp: {
    overHiCount: number; overHiArea: number; overLoCount: number | null; overLoArea: number | null;
    max: number; calls: number; naiveCalls: number; facetsTouched: number; c2Violations: number;
    flagged: number; seconds: number; loMeasured: boolean;
  };
}

const dir = dirname(PAT); const pat = basename(PAT);
const rx = new RegExp(`^${pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
const files = readdirSync(dir).filter((f) => rx.test(f)).sort();
if (files.length === 0) { log(`*** no files matched ${PAT} ***`); process.exit(2); }

const S: Shard[] = files.map((f) => ({ file: f, ...(JSON.parse(readFileSync(join(dir, f), 'utf8')) as Omit<Shard, 'file'>) }));
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 SHARD MERGE — ${S.length} shard files =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');

// ── refuse on any inconsistency ────────────────────────────────────────────────────────────────────
const n0 = Number(S[0].perpShard.split('/')[1]);
const seen = new Set(S.map((s) => Number(s.perpShard.split('/')[0])));
const problems: string[] = [];
if (S.length !== n0) problems.push(`expected ${n0} shards, found ${S.length}`);
for (let i = 0; i < n0; i += 1) if (!seen.has(i)) problems.push(`shard ${i}/${n0} MISSING`);
for (const s of S) {
  if (s.stl !== S[0].stl) problems.push(`${s.file}: different mesh (${s.stl})`);
  if (s.nTri !== S[0].nTri) problems.push(`${s.file}: different facet count (${s.nTri})`);
  if (s.barHi !== S[0].barHi || s.barLo !== S[0].barLo) problems.push(`${s.file}: different bars`);
  if (JSON.stringify(s.perpGrid) !== JSON.stringify(S[0].perpGrid)) problems.push(`${s.file}: different projector grid`);
  if (s.perp.c2Violations !== 0) problems.push(`${s.file}: *** C2 CONTROL FIRED (${s.perp.c2Violations}) — RUN VOID ***`);
}
log(`mesh    ${S[0].stl}`);
log(`facets  ${S[0].nTri.toLocaleString()}   3D area ${S[0].area3D.toFixed(3)} mm2   bars ${S[0].barHi} / ${S[0].barLo}`);
log(`shards  ${files.join(', ')}`);
if (problems.length > 0) {
  log('');
  log('*** REFUSING TO MERGE ***');
  for (const p of problems) log(`   ${p}`);
  process.exit(1);
}
log('consistency: all shards same mesh / bars / projector grid, all C2 controls hold.');
log('');

const add = (g: (s: Shard) => number): number => S.reduce((a, s) => a + g(s), 0);
const maxOf = (g: (s: Shard) => number): number => S.reduce((a, s) => Math.max(a, g(s)), 0);
const A = S[0].area3D; const N = S[0].nTri;
const pc = (a: number, b: number): string => ((a / b) * 100).toFixed(4);
const cHi = add((s) => s.perp.overHiCount); const aHi = add((s) => s.perp.overHiArea);
const loOn = S[0].perp.loMeasured;
const cLo = add((s) => s.perp.overLoCount ?? 0); const aLo = add((s) => s.perp.overLoArea ?? 0);
const flagged = add((s) => s.perp.flagged);
const calls = add((s) => s.perp.calls); const naive = add((s) => s.perp.naiveCalls);
const secs = add((s) => s.perp.seconds); const wall = maxOf((s) => s.perp.seconds);

log('── MERGED PERPENDICULAR POSITION (COUNT + AREA + MAX, per facet) ──');
log(`   flagged (radial upper bound) ${flagged.toLocaleString()} facets; ADJUDICATION RATE 100% (a partition, not a sample)`);
log(`   > ${S[0].barHi} mm : ${cHi.toLocaleString()} facets (${pc(cHi, N)}%)   ${aHi.toFixed(3)} mm2 = ${pc(aHi, A)}% OF MESH`);
if (loOn) log(`   > ${S[0].barLo} mm : ${cLo.toLocaleString()} facets (${pc(cLo, N)}%)   ${aLo.toFixed(3)} mm2 = ${pc(aLo, A)}% OF MESH`);
else log(`   > ${S[0].barLo} mm : NOT MEASURED in these shards`);
log(`   *** MESH-WIDE PERPENDICULAR MAX ${maxOf((s) => s.perp.max).toExponential(4)} mm ***`);
log('');
log(`   projector calls ${calls.toLocaleString()} vs ${naive.toLocaleString()} naive = ${(naive / Math.max(1, calls)).toFixed(1)}x fewer`);
log(`   CPU-seconds ${secs.toFixed(1)} across ${S.length} shards; longest shard ${wall.toFixed(1)} s = the wall clock if they ran in parallel`);
log(`   NOTE the branch-and-bound degrades under sharding (each shard restarts its running max at 0), so`);
log('   the call count above is an UPPER bound on what one process would need. The answers do not change.');
log('');
log('S118 MERGE DONE');
