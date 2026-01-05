import { LogLevel, LogMessage, MessageManagerConfig, HeartbeatStats } from "./types";

type HeartbeatFlushOptions = {
  force?: boolean;
  reason?: string;
};

export class MessageManager {
  private cfg: Required<MessageManagerConfig>;
  private buffer: LogMessage[] = [];
  private counters: Record<LogLevel, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
  private suppressedDuplicates = 0;
  private lastHeartbeat = performance.now();
  private hadProblem = false;
  private dedupe: Map<string, number> = new Map();
  private listeners: Set<(msg: LogMessage) => void> = new Set();
  private frameWindow = 0;
  private drawWindow = 0;
  private vertWindow = 0;
  // UI-specific short-term windows (reset on every getUiStats call)
  private uiFrameWindow = 0;
  private uiDrawWindow = 0;
  private uiVertWindow = 0;
  private lastUiSampleTime = performance.now();

  private lastFrameSample = 0;
  private lastDrawSample = 0;
  private lastVertSample = 0;
  private intervalId: number | null = null;
  private lastHeartbeatStats: HeartbeatStats | null = null;
  // Time-window deduplication: maps signature -> {msg, ts}
  private recentLogs: Map<string, { msg: LogMessage; ts: number }> = new Map();
  private readonly DEDUP_WINDOW_MS = 10000; // 10 second window for deduplication (balance between grouping and visibility)

  constructor(cfg?: MessageManagerConfig) {
    this.cfg = {
      heartbeatMs: cfg?.heartbeatMs ?? 120000,
      bufferSize: cfg?.bufferSize ?? 2000,
      mode: cfg?.mode ?? "smart",
      dedupeEveryN: cfg?.dedupeEveryN ?? 0,
      consoleSink: cfg?.consoleSink ?? ((line, lvl) => {
        if (lvl === "ERROR" || lvl === "CRITICAL") console.error(line);
        else if (lvl === "WARN") console.warn(line);
        else if (lvl === "DEBUG") console.debug(line);
        else console.log(line);
      }),
    };
    this.startHeartbeatTimer();
  }

  setMode(mode: "smart" | "verbose" | "errors-only") { this.cfg.mode = mode; }
  setHeartbeatMs(ms: number) { this.cfg.heartbeatMs = ms; this.restartHeartbeatTimer(); }
  setDedupeEveryN(n: number) {
    if (!Number.isFinite(n) || n < 0) return;
    this.cfg.dedupeEveryN = Math.floor(n);
  }
  setConsoleSink(fn: (line: string, level: LogLevel) => void) { this.cfg.consoleSink = fn; }
  setFrameCounters({ frames, draws, verts }: { frames?: number; draws?: number; verts?: number }) {
    this.frameWindow += this.consumeCounterSample(frames, 'frame');
    this.drawWindow += this.consumeCounterSample(draws, 'draw');
    this.vertWindow += this.consumeCounterSample(verts, 'vert');
  }

  /**
   * Get short-term stats for UI updates (e.g. 1Hz) without affecting the main heartbeat cycle.
   * Resets the UI-specific counters.
   */
  getUiStats(): HeartbeatStats {
    const now = performance.now();
    const elapsed = now - this.lastUiSampleTime;
    this.lastUiSampleTime = now;

    const stats: HeartbeatStats = {
      windowMs: elapsed,
      counts: { ...this.counters }, // Share log counters (accumulative)
      frames: this.uiFrameWindow,
      draws: this.uiDrawWindow,
      verts: this.uiVertWindow,
      suppressedDuplicates: this.suppressedDuplicates
    };

    // Reset UI windows
    this.uiFrameWindow = 0;
    this.uiDrawWindow = 0;
    this.uiVertWindow = 0;

    return stats;
  }

  /**
   * Subscribe to receive new log messages in real-time.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (msg: LogMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  log(level: LogLevel, code: string, message: string, context?: Record<string, unknown>, signature?: string) {
    const ts = Date.now();
    const msg: LogMessage = { level, code, message, ts, context, signature };

    // Push returns the canonical message (either new msg or updated tail)
    const canonicalMsg = this.bufferPush(msg);
    this.counters[level]++;

    // Notify listeners immediately (for UI console)
    if (this.listeners.size > 0) {
      this.listeners.forEach(l => l(canonicalMsg));
    }

    // Mode routing
    if (this.cfg.mode === "verbose") return this.emitNow(msg);

    if (this.cfg.mode === "errors-only") {
      if (level === "WARN" || level === "ERROR" || level === "CRITICAL") this.emitNow(msg);
      return;
    }

    // smart mode
    if (level === "WARN" || level === "ERROR" || level === "CRITICAL") {
      this.hadProblem = true;
      if (!this.isDeduped(msg)) this.emitNow(msg);
      return;
    }

    // INFO/DEBUG suppressed; heartbeat handles visibility
  }

  debug(code: string, message: string, ctx?: Record<string, unknown>, sig?: string) { this.log("DEBUG", code, message, ctx, sig); }
  info(code: string, message: string, ctx?: Record<string, unknown>, sig?: string) { this.log("INFO", code, message, ctx, sig); }
  warn(code: string, message: string, ctx?: Record<string, unknown>, sig?: string) { this.log("WARN", code, message, ctx, sig); }
  error(code: string, message: string, ctx?: Record<string, unknown>, sig?: string) { this.log("ERROR", code, message, ctx, sig); }
  critical(code: string, message: string, ctx?: Record<string, unknown>, sig?: string) { this.log("CRITICAL", code, message, ctx, sig); }

  dumpRecent(): LogMessage[] { return [...this.buffer]; }
  resetWindow() {
    (["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"] as LogLevel[]).forEach(l => this.counters[l] = 0);
    this.hadProblem = false;
    this.dedupe.clear();
    this.suppressedDuplicates = 0;
    this.frameWindow = 0;
    this.drawWindow = 0;
    this.vertWindow = 0;
  }

  flushHeartbeat(options: HeartbeatFlushOptions = {}): HeartbeatStats | null {
    const now = performance.now();
    const elapsed = now - this.lastHeartbeat;
    if (!options.force && elapsed < this.cfg.heartbeatMs) {
      return null;
    }
    if (this.cfg.mode === "errors-only") {
      this.lastHeartbeat = now;
      this.resetWindow();
      return null;
    }
    const stats = this.getHeartbeatStats(elapsed);
    this.emitHeartbeat(stats, options.reason);
    this.lastHeartbeatStats = stats;
    this.lastHeartbeat = now;
    this.resetWindow();
    return stats;
  }

  dispose() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.listeners.clear();
  }

  getLastHeartbeatStats(): HeartbeatStats | null {
    if (!this.lastHeartbeatStats) return null;
    return {
      windowMs: this.lastHeartbeatStats.windowMs,
      counts: { ...this.lastHeartbeatStats.counts },
      frames: this.lastHeartbeatStats.frames,
      draws: this.lastHeartbeatStats.draws,
      verts: this.lastHeartbeatStats.verts,
      suppressedDuplicates: this.lastHeartbeatStats.suppressedDuplicates,
    };
  }

  private emitNow(msg: LogMessage) {
    const line = this.format(msg);
    this.cfg.consoleSink(line, msg.level);
  }

  private format(m: LogMessage): string {
    const ctx = m.context ? ` | ${JSON.stringify(m.context)}` : "";
    return `[${m.level}] ${m.code} — ${m.message}${ctx}`;
  }

  private startHeartbeatTimer() {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(() => this.maybeHeartbeat(), 250);
  }

  private restartHeartbeatTimer() {
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.intervalId = null;
    this.startHeartbeatTimer();
  }

  private maybeHeartbeat() {
    this.flushHeartbeat();
  }

  private getHeartbeatStats(windowMs: number): HeartbeatStats {
    return { windowMs, counts: { ...this.counters }, frames: this.frameWindow, draws: this.drawWindow, verts: this.vertWindow, suppressedDuplicates: this.suppressedDuplicates };
  }

  private emitHeartbeat(stats: HeartbeatStats, reason?: string) {
    const status = this.hadProblem ? "HEALTH DEGRADED" : "HEALTH OK";
    const suffix = reason ? ` | reason: ${reason}` : "";
    this.cfg.consoleSink(
      `${status} | ${Math.round(stats.windowMs)}ms: ${stats.counts.ERROR + stats.counts.CRITICAL} errors, ${stats.counts.WARN} warns, ${stats.counts.INFO} info, ${stats.counts.DEBUG} debug | frames: ${stats.frames ?? 0} draws: ${stats.draws ?? 0} verts: ${stats.verts ?? 0} | suppressed: ${stats.suppressedDuplicates}${suffix}`,
      this.hadProblem ? "WARN" : "INFO"
    );
  }

  private bufferPush(m: LogMessage): LogMessage {
    // Build a signature for deduplication
    const sig = `${m.level}|${m.code}|${m.signature ?? m.message}`;
    const now = performance.now();

    // Time-window deduplication: if we've seen this signature recently, merge it
    const recent = this.recentLogs.get(sig);
    if (recent && (now - recent.ts) < this.DEDUP_WINDOW_MS) {
      // Update existing entry
      recent.msg.repeat = (recent.msg.repeat || 1) + 1;
      recent.msg.ts = m.ts;
      recent.msg.context = m.context; // Update context to latest
      recent.ts = now;
      this.suppressedDuplicates++;
      return recent.msg;
    }

    // No recent match - add as new
    m.repeat = 1;
    this.buffer.push(m);
    if (this.buffer.length > this.cfg.bufferSize) {
      // Remove oldest and also clean its entry from recentLogs
      const removed = this.buffer.shift();
      if (removed) {
        const removedSig = `${removed.level}|${removed.code}|${removed.signature ?? removed.message}`;
        this.recentLogs.delete(removedSig);
      }
    }

    // Track this log for future deduplication
    this.recentLogs.set(sig, { msg: m, ts: now });

    // Clean old entries from recentLogs periodically (every 100 logs)
    if (this.buffer.length % 100 === 0) {
      const cutoff = now - this.DEDUP_WINDOW_MS * 2;
      for (const [key, val] of this.recentLogs) {
        if (val.ts < cutoff) {
          this.recentLogs.delete(key);
        }
      }
    }

    return m;
  }

  private isDeduped(m: LogMessage): boolean {
    const key = `${m.level}|${m.code}|${m.signature ?? m.message}`;
    const seen = this.dedupe.get(key);
    if (seen == null) { this.dedupe.set(key, 1); return false; }
    const next = seen + 1;
    this.dedupe.set(key, next);
    if (this.cfg.dedupeEveryN && next % this.cfg.dedupeEveryN === 0) return false;
    this.suppressedDuplicates++;
    return true;
  }

  private consumeCounterSample(value: number | undefined, type: 'frame' | 'draw' | 'vert'): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    const sanitized = Math.max(0, value);
    let delta = 0;
    if (type === 'frame') {
      delta = sanitized - this.lastFrameSample;
      if (delta < 0) delta = sanitized;
      this.lastFrameSample = sanitized;
      this.uiFrameWindow += delta;
      return delta;
    }
    if (type === 'draw') {
      delta = sanitized - this.lastDrawSample;
      if (delta < 0) delta = sanitized;
      this.lastDrawSample = sanitized;
      this.uiDrawWindow += delta;
      return delta;
    }
    delta = sanitized - this.lastVertSample;
    if (delta < 0) delta = sanitized;
    this.lastVertSample = sanitized;
    this.uiVertWindow += delta;
    return delta;
  }
}

export const manager = new MessageManager();
export default manager;
