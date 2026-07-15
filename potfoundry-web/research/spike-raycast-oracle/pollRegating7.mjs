// Polls research/lab/spike-gpu-regating.json every ~60s and prints ONE
// progress line per check. Exits 0 once all planned conditions are recorded
// (done/timeout/error all count as "recorded" — the loop only cares about
// COMPLETION, not success), or after a generous safety cap of iterations.
// Companion to gpuLeverRegating7.mjs — does not launch or manage that
// process; it only observes the JSON file it writes incrementally.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_JSON = path.resolve(__dirname, '../lab/spike-gpu-regating.json');
const POLL_MS = 60000;
const MAX_ITERS = 200; // 200 * 60s = ~200min safety cap, well above the 105min worst case (7 * 15min watchdog)

function readState() {
  try {
    const raw = fs.readFileSync(OUT_JSON, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  for (let i = 0; i < MAX_ITERS; i++) {
    const state = readState();
    const total = state?.plan?.length ?? 7;
    const done = state?.conditions?.length ?? 0;
    const status = state?.status ?? 'no-file-yet';
    const recorded = (state?.conditions ?? []).map((c) => `${c.style}/${c.condition}=${c.status}`).join(', ');
    console.log(`PROGRESS ${done}/${total} runStatus=${status}${recorded ? ' | ' + recorded : ''}`);
    if (state && done >= total) {
      console.log(`TERMINAL done=${done}/${total} runStatus=${status}`);
      process.exit(0);
    }
    await sleep(POLL_MS);
  }
  console.log('TERMINAL safety-cap-reached — poller giving up, check the process/json manually');
  process.exit(1);
})();
