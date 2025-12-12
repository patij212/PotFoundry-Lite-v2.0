import manager from './MessageManager';

let installed = false;
const originals: Partial<Record<keyof Console, any>> = {};

export function installConsolePatch(opts: { capture?: ReadonlyArray<'log' | 'info' | 'debug'> } = { capture: ['log','info','debug'] }) {
  if (installed) return;
  installed = true;
  const capture = opts.capture ?? ['log','info','debug'];
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
      const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      const code = `CONSOLE_${String(level).toUpperCase()}`;
      const signature = msg;
      const map: any = { log: 'INFO', info: 'INFO', debug: 'DEBUG' };
      manager.log(map[level], code, msg, undefined, signature);
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
