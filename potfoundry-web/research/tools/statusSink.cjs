// statusSink.cjs — a 40-line HTTP sink so BROWSER-side jobs can leave a trace ON DISK.
//
// WHY THIS EXISTS. WebGPU needs a secure context, so the GPU ruler can only run inside the page. But page
// JavaScript has no filesystem access and nothing notifies the agent when it finishes or dies — a device
// loss just stops the loop silently. That is how a ~40-minute certification sweep was lost on 2026-07-28.
// Background Bash tasks, by contrast, survive independently AND notify on exit.
//
// So: the page POSTs one line per event here, this appends it to a file, and a Monitor tails that file.
// The page keeps its localStorage checkpoint (that is the resumable state); this is purely the wake-up path.
//
// Usage:  node research/tools/statusSink.cjs [port] [logfile]
const http = require('node:http');
const fs = require('node:fs');

const PORT = Number(process.argv[2] || 4599);
const LOG = process.argv[3] || 'research/exchange/_strataFacetTruth/gpuSweep.status.log';

// LOCAL time, deliberately. `toISOString()` is UTC, and this log gets compared against shell `date` and
// against file mtimes — both local. That one-hour offset (BST) read as a 60-minute stall on a sweep that was
// perfectly healthy. A log used for liveness detection must share a clock with whatever reads it.
const stamp = () => {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

http
  .createServer((req, res) => {
    // The page is served from :3001 and posts here to :4599 — a different origin, so CORS is required.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(200); res.end('sink up\n'); return; }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { fs.appendFileSync(LOG, `${stamp()} ${body.replace(/\s+/g, ' ').trim()}\n`); } catch { /* never 500 on a log write */ }
      res.writeHead(204);
      res.end();
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    fs.appendFileSync(LOG, `${stamp()} SINK-UP port=${PORT}\n`);
    process.stdout.write(`status sink listening on 127.0.0.1:${PORT} -> ${LOG}\n`);
  });
