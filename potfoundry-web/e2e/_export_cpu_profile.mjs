// E-2026-07-10-EMIT-CPU-PROFILE — capture arm.
// Chrome DevTools CPU profile (via CDP Profiler domain) of ONE production-
// default conforming export, to find what's hot INSIDE the triangulator's
// PASS B per-leaf emission loop. Per E-2026-07-10-TRIANGULATION-SUBTIMING:
// emit is 90.6% of triangulationMs in aggregate (95.2% on non-CDT walls),
// roughly 45-50% of a style's ENTIRE export wall-clock — the largest still-
// opaque number in the pipeline. Wall-clock bucket timing (the technique
// every prior arm in this series used) is the wrong tool past this point —
// console.time calls inside a loop invoked per-leaf across millions of
// leaves would distort what they measure. A sampling profiler does not.
//
// Usage:  node e2e/_export_cpu_profile.mjs [StyleName]   (default GyroidManifold
//         — the fastest pilot style that still exercises BOTH the plain
//         triangulator (inner wall) and the constrained-CDT path (outer
//         wall) in one build)
// Needs:  npm run dev on :3001; real-WebGPU chromium (headless:false).
// Writes: research/exchange/_cpu_profile/<style>.cpuprofile (load in Chrome
//         DevTools > Performance, or chrome://inspect > a dedicated target's
//         Profiler tab, for an interactive flame graph) +
//         <style>_hotspots.json (self-time-by-function ranking, computed here).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STYLE = process.argv[2] ?? 'GyroidManifold';
const OUT_DIR = 'research/exchange/_cpu_profile';
const DIMS = { H: 120, top_od: 100, bottom_od: 80, expn: 1, bellAmp: 0, spinTurns: 0 };
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  if (m.type() === 'error') console.log(`[page:error] ${m.text().slice(0, 300)}`);
});
await page.goto('http://localhost:3001/');
await page.waitForFunction(() => Boolean(window.__pfFidelity), null, { timeout: 60_000 });

await page.evaluate(async (s) => {
  await window.__pfFidelity.setStyle(s);
}, STYLE);
await page.evaluate(async (d) => {
  await window.__pfFidelity.setDimensions(d);
}, DIMS);

// CDP Profiler domain: a real V8 sampling CPU profile of the WHOLE page
// during the export (not just the triangulator — but per every prior arm's
// measurement, the triangulator's emit loop dominates the page's CPU time
// during a generate by such a wide margin that it should dominate the
// profile too, unaided).
const client = await page.context().newCDPSession(page);
await client.send('Profiler.enable');
await client.send('Profiler.start');

console.log(`--- profiling ${STYLE} (production default export, real WebGPU) ---`);
const t0 = Date.now();
const timings = await page.evaluate(async () => window.__pfFidelity.diagnoseStageTimings());
const wallMs = Date.now() - t0;

const { profile } = await client.send('Profiler.stop');
await client.send('Profiler.disable');

writeFileSync(join(OUT_DIR, `${STYLE}.cpuprofile`), JSON.stringify(profile));
console.log(
  `capture done: wallMs=${wallMs} totalMs=${timings?.totalMs ?? 'n/a'} ` +
    `profileNodes=${profile.nodes.length} samples=${profile.samples.length} ` +
    `durationMs=${((profile.endTime - profile.startTime) / 1000).toFixed(0)}`,
);
if (timings) {
  writeFileSync(join(OUT_DIR, `${STYLE}_timings.json`), JSON.stringify(timings, null, 2));
}

// ── Aggregate SELF time by function identity (functionName + url + line). ──
// hitCount on a node is V8's own count of samples where that node was top-of-
// stack (i.e. self time, in sample units) — simpler and sufficiently accurate
// for a relative ranking than reconstructing from samples[]/timeDeltas[].
const totalHitCount = profile.nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0);
const durationMs = (profile.endTime - profile.startTime) / 1000;
const byFn = new Map();
for (const n of profile.nodes) {
  const hc = n.hitCount ?? 0;
  if (hc === 0) continue;
  const cf = n.callFrame;
  const fileShort = cf.url ? cf.url.split('/').slice(-2).join('/') : '(native)';
  const key = `${cf.functionName || '(anonymous)'} @ ${fileShort}:${cf.lineNumber + 1}`;
  const cur = byFn.get(key) ?? { hitCount: 0, url: cf.url, line: cf.lineNumber + 1, fn: cf.functionName };
  cur.hitCount += hc;
  byFn.set(key, cur);
}
const ranked = [...byFn.entries()]
  .map(([key, v]) => ({
    key,
    selfMs: totalHitCount > 0 ? (v.hitCount / totalHitCount) * durationMs : 0,
    pct: totalHitCount > 0 ? (v.hitCount / totalHitCount) * 100 : 0,
    hitCount: v.hitCount,
    url: v.url,
    line: v.line,
    fn: v.fn,
  }))
  .sort((a, b) => b.selfMs - a.selfMs);

writeFileSync(join(OUT_DIR, `${STYLE}_hotspots.json`), JSON.stringify(ranked, null, 2));

console.log(`\nTop 40 self-time functions (${durationMs.toFixed(0)}ms profiled, ${totalHitCount} samples, ${profile.nodes.length} nodes):`);
for (const r of ranked.slice(0, 40)) {
  console.log(`  ${r.selfMs.toFixed(1).padStart(9)}ms (${r.pct.toFixed(1).padStart(5)}%)  ${r.key}`);
}

await browser.close();
process.exitCode = 0;
