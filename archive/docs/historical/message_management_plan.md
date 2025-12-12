# WebGPU‑Aware Smart Console Message Management — Implementation Plan

> **Purpose:** Replace console flood (especially from WebGPU preview/dev mode) with a **smart, centralized message pipeline** that:
>
> * emits **immediate** WARN/ERROR/CRITICAL events,
> * aggregates noisy INFO/DEBUG into an **“all‑green” heartbeat once per minute**,
> * **captures WebGPU-specific errors** (validation, device lost, shader compile) *before* they spam DevTools,
> * stays **architecturally separate** and easy to wire into both the WebGPU frontend and the existing backend/CLI.

Use this file as step‑by‑step instructions for GitHub Copilot GPT in VS Code while you implement.

---

## TL;DR (what changes)

* Add a dedicated **logging/health** module on the frontend (`web/infra/logging/MessageManager.ts`) and use it everywhere instead of `console.*`.
* **Wrap WebGPU error sources** (error scopes, `uncapturederror`, `device.lost`, `getCompilationInfo()`) so we emit only *one* well‑structured console line per *real* problem.
* Optional **console patch**: route `console.log/info/debug` through our manager (keep `warn/error` immediate).
* Emit a **1‑minute heartbeat** with counters (frames, draw calls, suppressed warnings, etc.).
* Keep a **ring buffer** and **dedupe** repeating messages by `(level, code, signature)` to avoid thousands of identical lines.
* Provide modes: `smart` (default), `verbose`, `errors-only`.

---

## 1) Architecture & File Layout

```
/web
  /infra
    /logging
      MessageManager.ts        # core manager (TS, browser/worker friendly)
      WebGpuCapture.ts         # hooks for WebGPU (error scopes, device lost, compile info)
      ConsolePatch.ts          # optional global console wrappers
      types.ts                 # LogLevel, LogMessage, config types
  /app
    main.ts                    # app entry; installs WebGPU capture + configures manager
    renderer/*                 # your rendering code; import manager, not console.*

/backend
  potfoundry/infra/logging.py  # (existing/previous step) Python side (optional)
```

**Dependency rule:** App/renderer code depends on `infra/logging`. The logging module depends only on TypeScript/DOM/WebGPU types—no app imports.

---

## 2) Behavioural Contract

1. **Immediate pass‑through:** Any **WARN/ERROR/CRITICAL** is emitted to console right away (with structured context), plus stored in an in‑memory ring buffer.
2. **Heartbeat:** Every *N* seconds (default `60`), output a single line summarizing last window:
   `HEALTH OK | 60s: 0 errors, 0 warns, 87 info, 231 debug (suppressed=219) | frames: 3600`
3. **Aggregation (no dumb throttling):** INFO/DEBUG are **suppressed** in real time, **counted** for heartbeat, and **available** via an API (`dumpRecent()`).
4. **Dedupe:** Same (level + code + signature) within a window increments a **suppressed count**; only first (and optionally every *Nth*) is emitted.
5. **WebGPU‑aware capture:** Use **error scopes**, **uncapturederror**, **device lost**, and **shader compile info** to:

   * turn DevTools spam into **one structured error**, and
   * **prevent** “uncaptured” flood by capturing at the source.
6. **Modes:** `smart` (default), `verbose` (print everything), `errors-only` (no heartbeat, only problems).
7. **Thread/frame safety:** Use light locking/guards. The manager is cheap to call per frame.

---

## 3) Frontend Types (TS)

Create `web/infra/logging/types.ts`:

```ts
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface LogMessage {
  level: LogLevel;
  code: string;                 // stable id, e.g. "WGPU_VALIDATE", "WGPU_DEVICE_LOST"
  message: string;              // human-readable
  ts: number;                   // Date.now()
  context?: Record<string, unknown>;
  signature?: string;           // for dedupe (e.g., hash of message+stack+code)
}

export interface MessageManagerConfig {
  heartbeatMs?: number;         // default 60000
  bufferSize?: number;          // default 2000
  mode?: "smart" | "verbose" | "errors-only";
  dedupeEveryN?: number;        // emit every Nth duplicate; default 0 (first only)
  consoleSink?: (line: string, level: LogLevel) => void; // default prints to console
}

export interface HeartbeatStats {
  windowMs: number;
  counts: Record<LogLevel, number>;
  frames?: number;
  draws?: number;
  verts?: number;
  suppressedDuplicates?: number;
}
```

---

## 4) MessageManager (TS)

Create `web/infra/logging/MessageManager.ts`:

```ts
import { LogLevel, LogMessage, MessageManagerConfig, HeartbeatStats } from "./types";

export class MessageManager {
  private cfg: Required<MessageManagerConfig>;
  private buffer: LogMessage[] = [];
  private counters: Record<LogLevel, number> = { DEBUG:0, INFO:0, WARN:0, ERROR:0, CRITICAL:0 };
  private suppressedDuplicates = 0;
  private lastHeartbeat = performance.now();
  private hadProblem = false;
  private dedupe: Map<string, number> = new Map();
  private frames = 0;
  private draws = 0;
  private intervalId: number | null = null;

  constructor(cfg?: MessageManagerConfig) {
    this.cfg = {
      heartbeatMs: cfg?.heartbeatMs ?? 60_000,
      bufferSize:  cfg?.bufferSize  ?? 2_000,
      mode:        cfg?.mode        ?? "smart",
      dedupeEveryN: cfg?.dedupeEveryN ?? 0,
      consoleSink: cfg?.consoleSink ?? ((line, lvl) => {
        if (lvl === "ERROR" || lvl === "CRITICAL") console.error(line);
        else if (lvl === "WARN") console.warn(line);
        else console.log(line);
      }),
    };
    this.startHeartbeatTimer();
  }

  setMode(mode: "smart" | "verbose" | "errors-only") { this.cfg.mode = mode; }
  setHeartbeatMs(ms: number) { this.cfg.heartbeatMs = ms; this.restartHeartbeatTimer(); }
  setFrameCounters({ frames, draws }: { frames?: number; draws?: number }) {
    if (typeof frames === "number") this.frames = frames;
    if (typeof draws === "number") this.draws = draws;
  }

  log(level: LogLevel, code: string, message: string, context?: Record<string, unknown>, signature?: string) {
    const ts = Date.now();
    const msg: LogMessage = { level, code, message, ts, context, signature };
    this.bufferPush(msg);
    this.counters[level]++;

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
  info(code: string, message: string, ctx?: Record<string, unknown>, sig?: string)  { this.log("INFO",  code, message, ctx, sig); }
  warn(code: string, message: string, ctx?: Record<string, unknown>, sig?: string)  { this.log("WARN",  code, message, ctx, sig); }
  error(code: string, message: string, ctx?: Record<string, unknown>, sig?: string) { this.log("ERROR", code, message, ctx, sig); }
  critical(code: string, message: string, ctx?: Record<string, unknown>, sig?: string) { this.log("CRITICAL", code, message, ctx, sig); }

  dumpRecent(): LogMessage[] { return [...this.buffer]; }
  resetWindow() {
    (["DEBUG","INFO","WARN","ERROR","CRITICAL"] as LogLevel[]).forEach(l => this.counters[l]=0);
    this.hadProblem = false;
    this.dedupe.clear();
    this.suppressedDuplicates = 0;
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
    this.intervalId = window.setInterval(() => this.maybeHeartbeat(), 250); // cheap poll
  }

  private restartHeartbeatTimer() {
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.intervalId = null;
    this.startHeartbeatTimer();
  }

  private maybeHeartbeat() {
    const now = performance.now();
    if (now - this.lastHeartbeat < this.cfg.heartbeatMs) return;

    if (this.cfg.mode === "errors-only") { this.lastHeartbeat = now; this.resetWindow(); return; }

    const status = this.hadProblem ? "HEALTH DEGRADED" : "HEALTH OK";
    const stats = this.getHeartbeatStats(now - this.lastHeartbeat);
    this.cfg.consoleSink(
      `${status} | ${Math.round(stats.windowMs)}ms: ${stats.counts.ERROR+stats.counts.CRITICAL} errors, ${stats.counts.WARN} warns, ${stats.counts.INFO} info, ${stats.counts.DEBUG} debug | frames: ${this.frames} draws: ${this.draws} | suppressed: ${stats.suppressedDuplicates}`,
      this.hadProblem ? "WARN" : "INFO"
    );
    this.lastHeartbeat = now;
    this.resetWindow();
  }

  private getHeartbeatStats(windowMs: number): HeartbeatStats {
    return { windowMs, counts: { ...this.counters }, frames: this.frames, draws: this.draws, suppressedDuplicates: this.suppressedDuplicates };
  }

  private bufferPush(m: LogMessage) {
    this.buffer.push(m);
    if (this.buffer.length > this.cfg.bufferSize) this.buffer.shift();
  }

  private isDeduped(m: LogMessage): boolean {
    const key = `${m.level}|${m.code}|${m.signature ?? m.message}`;
    const seen = this.dedupe.get(key);
    if (seen == null) { this.dedupe.set(key, 1); return false; }
    const next = seen + 1;
    this.dedupe.set(key, next);
    // emit every Nth if configured, else never
    if (this.cfg.dedupeEveryN && next % this.cfg.dedupeEveryN === 0) return false;
    this.suppressedDuplicates++;
    return true;
  }
}

// Singleton for app-wide use:
export const manager = new MessageManager();
```

---

## 5) WebGPU‑Specific Capture

Create `web/infra/logging/WebGpuCapture.ts` to **stop WebGPU floods at the source** and route them through `MessageManager`.

### 5.1 Install capture for a device

```ts
import { manager } from "./MessageManager";

export function installWebGpuCapture(device: GPUDevice) {
  // 1) Device lost (fatal or driver reset)
  device.lost.then((info) => {
    manager.critical("WGPU_DEVICE_LOST", `Device lost: ${info.message || info.reason}`, { reason: (info as any).reason });
  });

  // 2) Uncaptured errors (validation, OOM, internal)
  device.addEventListener("uncapturederror", (ev: GPUUncapturedErrorEvent) => {
    const err = ev.error;
    const kind = (err as GPUValidationError).name || "GPUError";
    manager.error("WGPU_UNCAPTURED_ERROR", `${kind}: ${err.message}`, { name: kind });
  });

  // 3) Optional: global unhandled rejections mapped to CRITICAL
  window.addEventListener("unhandledrejection", (e) => {
    manager.critical("UNHANDLED_PROMISE_REJECTION", String(e.reason?.message ?? e.reason));
  });
}
```

### 5.2 Error scopes (wrap risky calls)

Wrap operations so **errors are captured** (which suppresses DevTools “uncaptured” spam) and routed once through the manager.

```ts
export async function withValidationScope<T>(device: GPUDevice, label: string, fn: () => Promise<T> | T): Promise<T | undefined> {
  device.pushErrorScope("validation");
  try {
    const r = await fn();
    const err = await device.popErrorScope();
    if (err) manager.error("WGPU_VALIDATE", `[${label}] ${err.message}`);
    return r;
  } catch (e: any) {
    await device.popErrorScope(); // still pop the scope
    manager.error("WGPU_VALIDATE_THROW", `[${label}] ${e?.message ?? e}`);
    return undefined;
  }
}
```

Use that wrapper around:

* buffer/texture/mapAsync
* pipeline creation
* command encoding/submit sequences (wrap creation or submission points)

### 5.3 Shader compilation info (warnings → aggregate, errors → immediate)

Shader compile messages are a **major noise source**. Capture them, **aggregate warnings**, **immediately emit errors**.

```ts
export async function createShaderModule(device: GPUDevice, code: string, label?: string): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ code, label });
  try {
    const info = await module.getCompilationInfo();
    let warnCount = 0;
    for (const m of info.messages) {
      const sig = `${m.type}:${m.lineNum}:${m.linePos}:${m.message}`;
      if (m.type === "error") {
        manager.error("WGPU_SHADER_ERROR", fmtShaderMsg(label, m), { stageLabel: label, line: m.lineNum, pos: m.linePos });
      } else if (m.type === "warning") {
        warnCount++;
        manager.info("WGPU_SHADER_WARN", fmtShaderMsg(label, m), undefined, sig);
      } else {
        manager.debug("WGPU_SHADER_INFO", fmtShaderMsg(label, m), undefined, sig);
      }
    }
    if (warnCount > 0) {
      // Optionally summarize instead of per-warning: the dedupe will suppress duplicates anyway.
      // manager.warn("WGPU_SHADER_WARN_SUMMARY", `${label}: ${warnCount} warnings`);
    }
  } catch {
    /* some browsers may not support getCompilationInfo; ignore */
  }
  return module;
}

function fmtShaderMsg(label: string | undefined, m: GPUCompilationMessage) {
  const loc = (m.lineNum != null) ? `:${m.lineNum}:${m.linePos ?? 0}` : "";
  return `[${label ?? "shader"}${loc}] ${m.message}`;
}
```

### 5.4 Resource labeling policy (makes any messages readable)

Always pass `label` when creating resources/pipelines/encoders:

```ts
device.createBuffer({ size, usage, label: "triangle-vertex-buffer" });
device.createRenderPipeline({ label: "gpass-pipeline", /* ... */ });
const enc = device.createCommandEncoder({ label: "frame-encoder" });
```

Labels appear in validation messages and drastically reduce debugging time **without increasing console noise**.

### 5.5 Debug markers & groups (optional but helpful)

Insert groups so any error surfaces with useful breadcrumbs:

```ts
passEncoder.pushDebugGroup("shadow-pass");
passEncoder.insertDebugMarker("bind-material");
passEncoder.popDebugGroup();
```

These primarily help GPU debuggers/profilers and don’t spam the console.

---

## 6) Optional: Console Patch

Some libraries (or quick tests) still call `console.*`. You can route them through the manager while keeping WARN/ERROR instant.

Create `web/infra/logging/ConsolePatch.ts`:

```ts
import { manager } from "./MessageManager";

let installed = false;
const originals: Partial<Record<keyof Console, any>> = {};

export function installConsolePatch({ capture = ["log","info","debug"] as const } = {}) {
  if (installed) return;
  installed = true;

  for (const level of capture) {
    originals[level] = console[level];
    (console as any)[level] = (...args: any[]) => {
      const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      const code = `CONSOLE_${String(level).toUpperCase()}`;
      const signature = msg; // lightweight dedupe
      const map: any = { log: "INFO", info: "INFO", debug: "DEBUG" };
      manager.log(map[level], code, msg, undefined, signature);
      // keep a tiny breadcrumb for dev debugging if needed:
      // originals[level]?.apply(console, args);
    };
  }

  // keep warn/error immediate (no patch), or patch but pass-through:
  // originals.warn = console.warn;
  // console.warn = (...args) => { originals.warn?.apply(console, args); manager.warn("CONSOLE_WARN", stringify(args)); };
}

export function uninstallConsolePatch() {
  if (!installed) return;
  (["log","info","debug","warn","error"] as const).forEach((l) => {
    if (originals[l]) (console as any)[l] = originals[l];
  });
  installed = false;
}
```

> **Tip:** Don’t re‑emit to the original console for `log/info/debug` to avoid echo. For `warn/error`, prefer *not* to patch; let them appear immediately.

---

## 7) App Integration (Frontend)

In `web/app/main.ts`:

```ts
import { manager } from "../infra/logging/MessageManager";
import { installWebGpuCapture, withValidationScope, createShaderModule } from "../infra/logging/WebGpuCapture";
import { installConsolePatch } from "../infra/logging/ConsolePatch";

async function bootstrap() {
  manager.setMode("smart");                 // "smart" | "verbose" | "errors-only"
  manager.setHeartbeatMs(60_000);           // 60s heartbeat
  installConsolePatch();                    // optional

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice({ /* ... */ });

  installWebGpuCapture(device);

  // Example usage: compile shaders without spamming console
  const vs = await createShaderModule(device, vertWGSL, "vs:geometry");
  const fs = await createShaderModule(device, fragWGSL, "fs:lighting");

  // Example: wrap pipeline creation in validation scope
  const pipeline = await withValidationScope(device, "gpass-pipeline", async () => device.createRenderPipeline({
    label: "gpass-pipeline",
    /* ... */ vertex: { module: vs, entryPoint: "main" }, fragment: { module: fs, entryPoint: "main" },
  }));

  // In your frame loop:
  function frame() {
    // update counters (optional)
    // manager.setFrameCounters({ frames: frames+1, draws: draws+N });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

bootstrap().catch(e => manager.critical("BOOTSTRAP_FAIL", String(e?.message ?? e)));
```

---

## 8) Backend (Optional)

If you also want consistent console hygiene in CLI/batch:

* Keep the existing Python `potfoundry/infra/logging.py` manager (mirror behavior: heartbeat, dedupe, modes).
* CLI flags: `--verbose`, `--quiet`, `--log-heartbeat-seconds`.

The two systems (TS & Python) are **separate** but follow the same semantics.

---

## 9) Smart Emission Rules (WebGPU Focus)

| Event / Source                                | Action (Smart Mode)        | Notes                                            |
| --------------------------------------------- | -------------------------- | ------------------------------------------------ |
| `device.lost`                                 | **CRITICAL → immediate**   | Include `reason/message`.                        |
| `uncapturederror` (validation / oom/internal) | **ERROR → immediate**      | Try to reduce with error scopes.                 |
| Error scope returns a `GPUError`              | **ERROR → immediate**      | Scopes suppress “uncaptured” spam.               |
| Shader compile **error**                      | **ERROR → immediate**      | From `getCompilationInfo()`.                     |
| Shader compile **warning/info**               | **aggregate** (INFO/DEBUG) | Dedupe by type+line+text; summary via heartbeat. |
| App `console.log/info/debug` (optional patch) | **aggregate**              | Don’t echo back to console.                      |
| App `console.warn/error` (optional patch)     | **immediate**              | Or leave unpatched.                              |
| Per‑frame internal counters                   | **aggregate**              | Expose in heartbeat.                             |

---

## 10) Configuration Defaults

* `heartbeatMs`: `60_000`
* `bufferSize`:  `2_000`
* `mode`: `"smart"`
* `dedupeEveryN`: `0` (first only; set `50` to repeat every 50th duplicate)
* `consoleSink`: choose appropriate sink (default uses `console.*`)

---

## 11) Testing & Validation

### Unit‑like tests (headless/jsdom)

* **Immediate error passthrough:** simulate `uncapturederror`; expect one `console.error`.
* **Info flood suppression:** call `manager.info()` 1,000×; expect **0** console prints until heartbeat.
* **Heartbeat emission:** advance fake time by 60s → expect **1** summary line with correct counters.
* **Dedupe:** log the same WARN 100× → expect first (and every Nth if configured), + suppressed count in heartbeat.
* **Shader compile capture:** mock `getCompilationInfo()` with warnings/errors → expect aggregated warnings, immediate errors.
* **Device lost:** resolve `device.lost` → expect one CRITICAL line.
* **Modes:** `verbose` prints all; `errors-only` prints only problem lines (no heartbeat).

### Manual validation (DevTools)

* Run the preview; confirm:

  * Warnings/errors still appear instantly and are **more readable** (labels, context).
  * The console is quiet during steady state; a heartbeat prints every 60s.
  * Shader typos produce a **single** clear error (not multiple noisy lines).
  * Repeated validation issues don’t flood; dedupe counts increase.

---

## 12) Known Limits & Mitigations

* **Browser‑internal WebGPU logs:** Some engines may still print internal messages the app cannot intercept. Mitigate by:

  * Aggressively **capturing errors** via error scopes (prevents “uncaptured” class of logs).
  * **Fixing** root causes flagged by warnings (often from missing labels/usages).
  * Using DevTools **log level filters** during development (hide “Verbose”).
* **React Strict Mode:** Dev renderers may run effects twice; enable dedupe by **signature** (message+callsite) to avoid doubled logs.
* **Perf:** Manager work is O(1); keep message context small; don’t stringify gigantic structures.

---

## 13) Rollout Plan

1. **Introduce manager & WebGPU capture** behind a feature flag: `LOG_MODE=smart`.
  * Accept `__pf_log_mode` from initial params, the global `__PF_LOG_MODE__`, or runtime toggles like `pf_log_mode` (URL/localStorage) so QA can switch between `smart`, `verbose`, and `errors-only` without rebuilding assets.
2. **Patch app code** to use `manager` instead of `console.*`.
3. **Add labels** to GPU resources and pipelines.
4. **Wrap risky calls** with `withValidationScope`.
5. **Handle shader compilation** via `createShaderModule()`.
6. **Enable optional console patch** if third‑party code is chatty.
7. **Observe** heartbeats in steady state; **tune** `heartbeatMs`, `bufferSize`, `dedupeEveryN`.
  * Runtime overrides: `__pf_log_heartbeat_ms` / `pf_log_heartbeat_ms` and `__pf_log_dedupe_every_n` / `pf_log_dedupe_every_n` (URL/localStorage) now remap the manager without a rebuild.
8. **Document codes** (`WGPU_*`, `CONSOLE_*`) so the team recognizes issues quickly.

---

## 14) Copilot‑Friendly Task List (paste step‑by‑step)

* [x] Create `web/infra/logging/types.ts` (LogLevel, LogMessage, config).
* [x] Create `web/infra/logging/MessageManager.ts` (ring buffer, heartbeat, dedupe, modes).
* [x] Create `web/infra/logging/WebGpuCapture.ts`:

  * [x] `installWebGpuCapture(device)`
  * [x] `withValidationScope(device, label, fn)`
  * [x] `createShaderModule(device, code, label)`
* [x] (Optional) Create `web/infra/logging/ConsolePatch.ts` with `installConsolePatch()` and `uninstallConsolePatch()`.
* [x] Wire into `web/app/main.ts` (implemented via the WebGPU component + preview entrypoints):

  * [x] Initialize `manager` (mode + heartbeat).
  * [x] Acquire device; call `installWebGpuCapture(device)`.
  * [x] Use `createShaderModule` + `withValidationScope`.
  * [x] (Optional) `installConsolePatch()`.
* [x] Replace remaining `console.log/info/debug` in app with `manager.info/debug` (achieved via the console patch routing).
* [x] Add labels to buffers/pipelines/encoders (ongoing — frame encoders, swapchain/depth views, and passes now labeled in both preview + component renderers).
* [ ] Validate behaviour; tune config; commit.

---

## 15) Appendix — Minimal Type Signatures

```ts
// MessageManager.ts
export declare class MessageManager {
  constructor(cfg?: MessageManagerConfig);
  setMode(mode: "smart" | "verbose" | "errors-only"): void;
  setHeartbeatMs(ms: number): void;
  setFrameCounters(counters: { frames?: number; draws?: number; verts?: number }): void;
  log(level: LogLevel, code: string, message: string, context?: Record<string, unknown>, signature?: string): void;
  debug(code: string, message: string, ctx?: Record<string, unknown>, sig?: string): void;
  info(code: string, message: string, ctx?: Record<string, unknown>, sig?: string): void;
  warn(code: string, message: string, ctx?: Record<string, unknown>, sig?: string): void;
  error(code: string, message: string, ctx?: Record<string, unknown>, sig?: string): void;
  critical(code: string, message: string, ctx?: Record<string, unknown>, sig?: string): void;
  dumpRecent(): LogMessage[];
}

// WebGpuCapture.ts
export declare function installWebGpuCapture(device: GPUDevice): void;
export declare function withValidationScope<T>(device: GPUDevice, label: string, fn: () => Promise<T> | T): Promise<T | undefined>;
export declare function createShaderModule(device: GPUDevice, code: string, label?: string): Promise<GPUShaderModule>;

// ConsolePatch.ts
export declare function installConsolePatch(opts?: { capture?: ReadonlyArray<"log" | "info" | "debug"> }): void;
export declare function uninstallConsolePatch(): void;
```

---

**Outcome:** With these changes, routine rendering no longer floods the console; you get a **single heartbeat each minute** and **instant visibility** when anything actually goes wrong, with **WebGPU‑native errors captured and summarized** instead of exploding into unreadable noise.

---

## Progress Log

### 2025-12-01
- Installed the console patch inside both the preview iframe script and the component frontend so every `console.log/info/debug` now routes through `MessageManager` instead of the browser console.
- Labeled the per-frame command encoders, swapchain/depth texture views, render passes, and command buffers in both render loops to improve validation diagnostics and align with the resource-labeling policy.

### 2025-12-02
- Added persistent frame/draw/vertex counters inside both WebGPU render loops and now feed those metrics into `MessageManager.setFrameCounters()` so heartbeat lines advertise real rendering throughput.
- Extended the logging types/manager so vertex totals are tracked alongside frames and draws, enabling future capacity diagnostics without extra console noise.

### 2025-12-03
- Added a shared `resolveLoggingPreferences()` helper so both the component renderer and preview respect `LOG_MODE`/`pf_log_mode` feature flags plus runtime overrides for heartbeat and dedupe intervals (initial params, URL, localStorage, and globals all supported).
- Exposed `manager.setDedupeEveryN()` and refreshed the docs/spec so the Heartbeat payload and API now cover vertex totals and the new configuration hooks.

### 2025-12-04 — Manual Validation Steps
- Build and run the assets: `npm install && npm run build` inside `pfui/components/webgpu_component/frontend`, then `start_streamlit.ps1` from the repository root.
- Open the preview page in a browser: `http://localhost:8501/`
- To test `pf_log_mode` via URL (quick): `http://localhost:8501/?pf_log_mode=verbose&pf_log_heartbeat_ms=5000`.
  - Observe console output: `console.log('...')` calls are routed through the manager in verbose mode and appear as immediate lines; in `smart` mode they are suppressed and appear only in heartbeat summaries.
- To test runtime override via localStorage:
  - `localStorage.setItem('pf_log_mode','verbose'); localStorage.setItem('pf_log_heartbeat_ms','3000'); location.reload();`
  - After ~3s you should see a heartbeat line like `HEALTH OK | 3000ms: 0 errors, ... | frames: X draws: Y verts: Z`.
- If you need to introspect manager state, enable debug-internal mapping: attach `manager` to `window` in a dev build (optional) or rely on console messages produced by `manager`.

### 2025-12-05
- Added a one-time global `window.onerror` + `unhandledrejection` tap inside `installWebGpuCapture()` so uncaught synchronous errors and promise rejections increment the manager’s counters and surface in the heartbeat summary even when they originate outside our patched console calls.