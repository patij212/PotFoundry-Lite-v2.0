import manager from './MessageManager';
import type { LogLevel } from './types';

let installed = false;
const originals: Partial<Record<keyof Console, (...args: unknown[]) => void>> = {};

export function installConsolePatch(opts: { capture?: ReadonlyArray<'log' | 'info' | 'debug' | 'warn' | 'error'> } = { capture: ['log', 'info', 'debug', 'warn', 'error'] }) {
  if (installed) return;
  installed = true;
  const capture = opts.capture ?? ['log', 'info', 'debug', 'warn', 'error'];
  // Register console sink using the original console functions to avoid recursion
  const origSink = (line: string, lvl: string) => {
    try {
      if (lvl === 'ERROR' || lvl === 'CRITICAL') (originals.error ?? console.error).apply(console, [line]);
      else if (lvl === 'WARN') (originals.warn ?? console.warn).apply(console, [line]);
      else (originals.log ?? console.log).apply(console, [line]);
    } catch (_) {
      /* ignore */
    }
  };
  try { manager.setConsoleSink(origSink); } catch (err) { /* ignore */ }

  const levelMap: Record<string, LogLevel> = { log: 'INFO', info: 'INFO', debug: 'DEBUG', warn: 'WARN', error: 'ERROR' };

  for (const level of capture) {
    originals[level] = console[level];
    const isErrorLevel = level === 'error' || level === 'warn';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monkey-patching console requires dynamic property assignment
    (console as any)[level] = (...args: unknown[]) => {
      // 1. Construct full message for display (human readable)
      const msg = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
      }).join(' ');

      const code = `CONSOLE_${String(level).toUpperCase()}`;

      // 2. Smart Signature: Use first string arg as stability anchor
      let signature = msg;
      let context: Record<string, unknown> | undefined = undefined;

      if (args.length > 0 && typeof args[0] === 'string') {
        signature = args[0]; // The stable template
        // Capture other args for inspection
        if (args.length > 1) {
          context = { args: args.slice(1) };
        }
      }

      manager.log(levelMap[level], code, msg, context, signature);

      // For error/warn: also call through to original so browser DevTools
      // still shows stack traces, red/yellow highlighting, etc.
      if (isErrorLevel && originals[level]) {
        originals[level]!.apply(console, args);
      }
    };
  }
}

export function uninstallConsolePatch() {
  if (!installed) return;
  for (const k of Object.keys(originals) as (keyof Console)[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Restoring monkey-patched console methods
    if (originals[k]) (console as any)[k] = originals[k];
  }
  installed = false;
}
