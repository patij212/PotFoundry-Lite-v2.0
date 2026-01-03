import manager from './MessageManager';

let installed = false;
const originals: Partial<Record<keyof Console, any>> = {};

export function installConsolePatch(opts: { capture?: ReadonlyArray<'log' | 'info' | 'debug'> } = { capture: ['log', 'info', 'debug'] }) {
  if (installed) return;
  installed = true;
  const capture = opts.capture ?? ['log', 'info', 'debug'];
  // Register console sink using the original console functions to avoid recursion
  const origSink = (line: string, lvl: any) => {
    try {
      if (lvl === 'ERROR' || lvl === 'CRITICAL') (originals.error ?? console.error).apply(console, [line]);
      else if (lvl === 'WARN') (originals.warn ?? console.warn).apply(console, [line]);
      else (originals.log ?? console.log).apply(console, [line]);
    } catch (_) {
      /* ignore */
    }
  };
  try { manager.setConsoleSink(origSink); } catch (err) { /* ignore */ }
  for (const level of capture) {
    originals[level] = console[level];
    (console as any)[level] = (...args: any[]) => {
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

      const map: any = { log: 'INFO', info: 'INFO', debug: 'DEBUG' };
      manager.log(map[level], code, msg, context, signature);
      // leave original out to avoid echo
    };
  }
}

export function uninstallConsolePatch() {
  if (!installed) return;
  for (const k of Object.keys(originals) as (keyof Console)[]) {
    if (originals[k]) (console as any)[k] = originals[k];
  }
  installed = false;
}
