// E-2026-07-10-PROD-BATCH — capture breadcrumb sync. Appends one row per style to
// research/exchange/_prod_batch/capture_progress.ndjson from each style's own meta.json
// (the durable per-style checkpoint the capture harness already writes). Dedupes by
// style+startedAt so it is idempotent and safe to run after every batch. Styles listed
// on the CLI that have NO meta.json get a synthesized MISSING row (a timed-out/killed
// batch leaves no meta — that absence is itself a finding to surface, not hide).
// Usage: node research/bridge/_prod_batch_progress.mjs <batchLabel> <Style...>
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join('research', 'exchange', '_prod_truth');
const OUT_DIR = join('research', 'exchange', '_prod_batch');
const OUT = join(OUT_DIR, 'capture_progress.ndjson');
const batch = process.argv[2] ?? '?';
const styles = process.argv.slice(3);
if (styles.length === 0) {
  console.error('usage: node research/bridge/_prod_batch_progress.mjs <batchLabel> <Style...>');
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const seen = new Set(
  existsSync(OUT)
    ? readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map((l) => {
        try { const r = JSON.parse(l); return `${r.style}|${r.startedAt}`; } catch { return ''; }
      })
    : [],
);
for (const style of styles) {
  const metaPath = join(ROOT, style, 'meta.json');
  let row;
  if (!existsSync(metaPath)) {
    row = { style, batch, ok: false, error: 'MISSING meta.json (batch killed/timed out before this style completed)', at: new Date().toISOString(), startedAt: null };
  } else {
    const m = JSON.parse(readFileSync(metaPath, 'utf8'));
    row = {
      style, batch, ok: m.ok, error: m.error ?? null, startedAt: m.startedAt,
      fullTris: m.full?.tris ?? null, fullGenerateMs: m.full?.generateMs ?? null,
      outerTris: m.outer?.tris ?? null, outerGenerateMs: m.outer?.generateMs ?? null,
      totalMs: m.totalMs ?? null, at: new Date().toISOString(),
    };
  }
  const key = `${row.style}|${row.startedAt}`;
  if (seen.has(key)) { console.log(`[skip] ${style} (already recorded)`); continue; }
  appendFileSync(OUT, JSON.stringify(row) + '\n');
  seen.add(key);
  console.log(`[breadcrumb] ${style}: ok=${row.ok} full=${row.fullGenerateMs ?? '-'}ms outer=${row.outerGenerateMs ?? '-'}ms${row.error ? ` error=${String(row.error).slice(0, 120)}` : ''}`);
}
