#!/usr/bin/env node
// hiprio.mjs — run any command with all node processes held at Windows
// PriorityClass=AboveNormal for the whole run, keeping them OUT of EcoQoS
// "efficiency mode" (which throttles detached/background node jobs ~4-5x).
//
// Generalizes potscope's one-shot 8s bump into a REPEATED bump (every 5s) so
// vitest fork workers spawned mid-run — and any workers that restart — are
// caught too. stdio is inherited; the child's exit code is forwarded.
//
// Usage:
//   node research/tools/hiprio.mjs -- npx vitest run <file>
//   node research/tools/hiprio.mjs -- <any command ...>
//
// No-op (transparent passthrough) on non-Windows. Bumps ALL node.exe to
// AboveNormal (mild; not High/Realtime), which is what the ops memory prescribes.
/* global process, console, setInterval, setTimeout, clearInterval */
import { spawn, execFile } from 'node:child_process';

const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const command = dd >= 0 ? argv.slice(dd + 1) : argv;
if (command.length === 0) {
  console.error('usage: node research/tools/hiprio.mjs -- <command ...>');
  process.exit(2);
}

const quoted = command.map((t) => (/\s/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t));
// Single shell string (not command+args array) avoids Node DEP0190 under shell:true.
const child = spawn(quoted.join(' '), { shell: true, stdio: 'inherit' });

function bump() {
  if (process.platform !== 'win32') return;
  execFile(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { $_.PriorityClass = 'AboveNormal' } catch {} }",
    ],
    () => {}
  );
}

const timer = setInterval(bump, 5000);
setTimeout(bump, 1200); // first bump quickly, before the heavy work ramps
if (typeof timer.unref === 'function') timer.unref();

child.on('exit', (code, signal) => {
  clearInterval(timer);
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
child.on('error', (err) => {
  clearInterval(timer);
  console.error('[hiprio] spawn error:', err.message);
  process.exit(1);
});
