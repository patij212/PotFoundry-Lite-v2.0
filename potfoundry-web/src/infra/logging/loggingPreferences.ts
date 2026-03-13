export type LogMode = 'smart' | 'verbose' | 'errors-only';

export interface LoggingPreferences {
  mode: LogMode;
  heartbeatMs: number;
  dedupeEveryN: number;
}

const DEFAULT_PREFS: LoggingPreferences = {
  mode: 'smart',
  heartbeatMs: 60000,
  dedupeEveryN: 0,
};

const MODE_ALIASES: Record<string, LogMode> = {
  smart: 'smart',
  verbose: 'verbose',
  'errors-only': 'errors-only',
  'errorsonly': 'errors-only',
  errors: 'errors-only',
  error: 'errors-only',
};

const MODE_PARAM_KEYS = ['pf_log_mode', 'LOG_MODE'];
const HEARTBEAT_KEYS = ['pf_log_heartbeat_ms'];
const DEDUPE_KEYS = ['pf_log_dedupe_every_n'];

const GLOBAL_FLAG_KEYS = {
  mode: ['__PF_LOG_MODE__'],
  heartbeat: ['__PF_LOG_HEARTBEAT_MS__'],
  dedupe: ['__PF_LOG_DEDUPE_EVERY_N__'],
};

const INITIAL_PARAM_MODE_KEY = '__pf_log_mode';
const INITIAL_PARAM_HEARTBEAT_KEY = '__pf_log_heartbeat_ms';
const INITIAL_PARAM_DEDUPE_KEY = '__pf_log_dedupe_every_n';

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function coerceMode(value: unknown): LogMode | null {
  const str = coerceString(value);
  if (!str) return null;
  const normalized = str.toLowerCase();
  return MODE_ALIASES[normalized] ?? null;
}

function coercePositiveInt(value: unknown, { allowZero = false }: { allowZero?: boolean } = {}): number | null {
  const str = coerceString(value);
  if (!str) return null;
  const numeric = Number(str);
  if (!Number.isFinite(numeric)) return null;
  if (!allowZero && numeric <= 0) return null;
  if (allowZero && numeric < 0) return null;
  return Math.floor(numeric);
}

function readFromSearch(keys: string[]): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of keys) {
      const value = params.get(key);
      if (value) return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readFromStorage(keys: string[]): string | null {
  try {
    const storage = window.localStorage;
    if (!storage) return null;
    for (const key of keys) {
      const value = storage.getItem(key);
      if (value) return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readFromGlobals(keys: string[]): unknown {
  try {
    const root = window as unknown as Record<string, unknown>;
    for (const key of keys) {
      if (key in root && root[key] != null) {
        return root[key];
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readInitial(initial: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!initial) return null;
  if (key in initial) return (initial as Record<string, unknown>)[key];
  return null;
}

function readDocumentDataset(key: string): string | null {
  try {
    const attr = document.body?.getAttribute?.(key) ?? document.documentElement?.getAttribute?.(key);
    return attr ? attr : null;
  } catch {
    /* ignore */
  }
  return null;
}

function resolveMode(initialParams?: Record<string, unknown> | null): LogMode {
  const globalInitial = window.__pf_initialParams;
  const candidates: Array<unknown> = [
    readInitial(initialParams, INITIAL_PARAM_MODE_KEY),
    readInitial(globalInitial, INITIAL_PARAM_MODE_KEY),
    readFromGlobals(GLOBAL_FLAG_KEYS.mode),
    readFromSearch(MODE_PARAM_KEYS),
    readFromStorage(MODE_PARAM_KEYS),
    readDocumentDataset('data-pf-log-mode'),
  ];
  for (const cand of candidates) {
    const mode = coerceMode(cand);
    if (mode) return mode;
  }
  return DEFAULT_PREFS.mode;
}

function resolveHeartbeatMs(initialParams?: Record<string, unknown> | null): number {
  const globalInitial = window.__pf_initialParams;
  const candidates: Array<unknown> = [
    readInitial(initialParams, INITIAL_PARAM_HEARTBEAT_KEY),
    readInitial(globalInitial, INITIAL_PARAM_HEARTBEAT_KEY),
    readFromGlobals(GLOBAL_FLAG_KEYS.heartbeat),
    readFromSearch(HEARTBEAT_KEYS),
    readFromStorage(HEARTBEAT_KEYS),
    readDocumentDataset('data-pf-log-heartbeat-ms'),
  ];
  for (const cand of candidates) {
    const ms = coercePositiveInt(cand);
    if (ms) return ms;
  }
  return DEFAULT_PREFS.heartbeatMs;
}

function resolveDedupeEveryN(initialParams?: Record<string, unknown> | null): number {
  const globalInitial = window.__pf_initialParams;
  const candidates: Array<unknown> = [
    readInitial(initialParams, INITIAL_PARAM_DEDUPE_KEY),
    readInitial(globalInitial, INITIAL_PARAM_DEDUPE_KEY),
    readFromGlobals(GLOBAL_FLAG_KEYS.dedupe),
    readFromSearch(DEDUPE_KEYS),
    readFromStorage(DEDUPE_KEYS),
    readDocumentDataset('data-pf-log-dedupe-n'),
  ];
  for (const cand of candidates) {
    const dedupeN = coercePositiveInt(cand, { allowZero: true });
    if (dedupeN != null) return dedupeN;
  }
  return DEFAULT_PREFS.dedupeEveryN;
}

export function resolveLoggingPreferences(initialParams?: Record<string, unknown> | null): LoggingPreferences {
  return {
    mode: resolveMode(initialParams),
    heartbeatMs: resolveHeartbeatMs(initialParams),
    dedupeEveryN: resolveDedupeEveryN(initialParams),
  };
}
