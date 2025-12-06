// pfui/components/webgpu_component/frontend/src/camera_constants.ts
var DEFAULT_INTERACTIVE_LOD = 0.45;
var MIN_INTERACTIVE_LOD = 0.15;
var MIN_THETA_STATIC = 3;
var MIN_Z_STATIC = 2;
var PARAM_UPDATE_TIMEOUT_MS = 320;
var CAMERA_BROADCAST_MS = 200;
var CAMERA_EPSILON = 1e-4;
var CAMERA_STATIC_EPS = 1e-4;
var CAMERA_PADDING = 1.55;
var CAMERA_PADDING_MIN = 1.52;
var CAMERA_PADDING_MAX = 2;
var BASE_FOV = 50 * Math.PI / 180;
var MIN_FOV = 20 * Math.PI / 180;
var MAX_FOV = 75 * Math.PI / 180;
var CAMERA_NEAR_EPS = 0.05;
var CAMERA_DISTANCE_FALLOFF = 2.2;
var UNIFORM_FLOAT_COUNT = 72;
var CAMERA_EYE_OFFSET = 36;
var CAMERA_MODE_OFFSET = 39;
var VP_MATRIX_OFFSET = 40;
var CAMERA_RIGHT_OFFSET = 56;
var CAMERA_UP_OFFSET = 60;
var CAMERA_FORWARD_OFFSET = 64;
var GRID_FLAG_OFFSET = 68;
var DRAIN_RADIUS_OFFSET = 13;
var INVALID_STATUS_COOLDOWN_MS = 750;

// pfui/infra/logging/MessageManager.ts
var MessageManager = class {
  constructor(cfg) {
    this.buffer = [];
    this.counters = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
    this.suppressedDuplicates = 0;
    this.lastHeartbeat = performance.now();
    this.hadProblem = false;
    this.dedupe = /* @__PURE__ */ new Map();
    this.frameWindow = 0;
    this.drawWindow = 0;
    this.vertWindow = 0;
    this.lastFrameSample = 0;
    this.lastDrawSample = 0;
    this.lastVertSample = 0;
    this.intervalId = null;
    this.lastHeartbeatStats = null;
    this.cfg = {
      heartbeatMs: cfg?.heartbeatMs ?? 6e4,
      bufferSize: cfg?.bufferSize ?? 2e3,
      mode: cfg?.mode ?? "smart",
      dedupeEveryN: cfg?.dedupeEveryN ?? 0,
      consoleSink: cfg?.consoleSink ?? ((line, lvl) => {
        if (lvl === "ERROR" || lvl === "CRITICAL") console.error(line);
        else if (lvl === "WARN") console.warn(line);
        else console.log(line);
      })
    };
    this.startHeartbeatTimer();
  }
  setMode(mode) {
    this.cfg.mode = mode;
  }
  setHeartbeatMs(ms) {
    this.cfg.heartbeatMs = ms;
    this.restartHeartbeatTimer();
  }
  setDedupeEveryN(n) {
    if (!Number.isFinite(n) || n < 0) return;
    this.cfg.dedupeEveryN = Math.floor(n);
  }
  setConsoleSink(fn) {
    this.cfg.consoleSink = fn;
  }
  setFrameCounters({ frames, draws, verts }) {
    this.frameWindow += this.consumeCounterSample(frames, "frame");
    this.drawWindow += this.consumeCounterSample(draws, "draw");
    this.vertWindow += this.consumeCounterSample(verts, "vert");
  }
  log(level, code, message, context, signature) {
    const ts = Date.now();
    const msg = { level, code, message, ts, context, signature };
    this.bufferPush(msg);
    this.counters[level]++;
    if (this.cfg.mode === "verbose") return this.emitNow(msg);
    if (this.cfg.mode === "errors-only") {
      if (level === "WARN" || level === "ERROR" || level === "CRITICAL") this.emitNow(msg);
      return;
    }
    if (level === "WARN" || level === "ERROR" || level === "CRITICAL") {
      this.hadProblem = true;
      if (!this.isDeduped(msg)) this.emitNow(msg);
      return;
    }
  }
  debug(code, message, ctx, sig) {
    this.log("DEBUG", code, message, ctx, sig);
  }
  info(code, message, ctx, sig) {
    this.log("INFO", code, message, ctx, sig);
  }
  warn(code, message, ctx, sig) {
    this.log("WARN", code, message, ctx, sig);
  }
  error(code, message, ctx, sig) {
    this.log("ERROR", code, message, ctx, sig);
  }
  critical(code, message, ctx, sig) {
    this.log("CRITICAL", code, message, ctx, sig);
  }
  dumpRecent() {
    return [...this.buffer];
  }
  resetWindow() {
    ["DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"].forEach((l) => this.counters[l] = 0);
    this.hadProblem = false;
    this.dedupe.clear();
    this.suppressedDuplicates = 0;
    this.frameWindow = 0;
    this.drawWindow = 0;
    this.vertWindow = 0;
  }
  flushHeartbeat(options = {}) {
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
  }
  getLastHeartbeatStats() {
    if (!this.lastHeartbeatStats) return null;
    return {
      windowMs: this.lastHeartbeatStats.windowMs,
      counts: { ...this.lastHeartbeatStats.counts },
      frames: this.lastHeartbeatStats.frames,
      draws: this.lastHeartbeatStats.draws,
      verts: this.lastHeartbeatStats.verts,
      suppressedDuplicates: this.lastHeartbeatStats.suppressedDuplicates
    };
  }
  emitNow(msg) {
    const line = this.format(msg);
    this.cfg.consoleSink(line, msg.level);
  }
  format(m) {
    const ctx = m.context ? ` | ${JSON.stringify(m.context)}` : "";
    return `[${m.level}] ${m.code} \u2014 ${m.message}${ctx}`;
  }
  startHeartbeatTimer() {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(() => this.maybeHeartbeat(), 250);
  }
  restartHeartbeatTimer() {
    if (this.intervalId) window.clearInterval(this.intervalId);
    this.intervalId = null;
    this.startHeartbeatTimer();
  }
  maybeHeartbeat() {
    this.flushHeartbeat();
  }
  getHeartbeatStats(windowMs) {
    return { windowMs, counts: { ...this.counters }, frames: this.frameWindow, draws: this.drawWindow, verts: this.vertWindow, suppressedDuplicates: this.suppressedDuplicates };
  }
  emitHeartbeat(stats, reason) {
    const status = this.hadProblem ? "HEALTH DEGRADED" : "HEALTH OK";
    const suffix = reason ? ` | reason: ${reason}` : "";
    this.cfg.consoleSink(
      `${status} | ${Math.round(stats.windowMs)}ms: ${stats.counts.ERROR + stats.counts.CRITICAL} errors, ${stats.counts.WARN} warns, ${stats.counts.INFO} info, ${stats.counts.DEBUG} debug | frames: ${stats.frames ?? 0} draws: ${stats.draws ?? 0} verts: ${stats.verts ?? 0} | suppressed: ${stats.suppressedDuplicates}${suffix}`,
      this.hadProblem ? "WARN" : "INFO"
    );
  }
  bufferPush(m) {
    this.buffer.push(m);
    if (this.buffer.length > this.cfg.bufferSize) this.buffer.shift();
  }
  isDeduped(m) {
    const key = `${m.level}|${m.code}|${m.signature ?? m.message}`;
    const seen = this.dedupe.get(key);
    if (seen == null) {
      this.dedupe.set(key, 1);
      return false;
    }
    const next = seen + 1;
    this.dedupe.set(key, next);
    if (this.cfg.dedupeEveryN && next % this.cfg.dedupeEveryN === 0) return false;
    this.suppressedDuplicates++;
    return true;
  }
  consumeCounterSample(value, type) {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    const sanitized = Math.max(0, value);
    let delta = 0;
    if (type === "frame") {
      delta = sanitized - this.lastFrameSample;
      if (delta < 0) delta = sanitized;
      this.lastFrameSample = sanitized;
      return delta;
    }
    if (type === "draw") {
      delta = sanitized - this.lastDrawSample;
      if (delta < 0) delta = sanitized;
      this.lastDrawSample = sanitized;
      return delta;
    }
    delta = sanitized - this.lastVertSample;
    if (delta < 0) delta = sanitized;
    this.lastVertSample = sanitized;
    return delta;
  }
};
var manager = new MessageManager();
var MessageManager_default = manager;

// pfui/infra/logging/ConsolePatch.ts
var installed = false;
var originals = {};
function installConsolePatch(opts = { capture: ["log", "info", "debug"] }) {
  if (installed) return;
  installed = true;
  const capture = opts.capture ?? ["log", "info", "debug"];
  const origSink = (line, lvl) => {
    try {
      if (lvl === "ERROR" || lvl === "CRITICAL") (originals.error ?? console.error).apply(console, [line]);
      else if (lvl === "WARN") (originals.warn ?? console.warn).apply(console, [line]);
      else (originals.log ?? console.log).apply(console, [line]);
    } catch (_) {
    }
  };
  try {
    MessageManager_default.setConsoleSink(origSink);
  } catch (err) {
  }
  for (const level of capture) {
    originals[level] = console[level];
    console[level] = (...args) => {
      const msg = args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
      const code = `CONSOLE_${String(level).toUpperCase()}`;
      const signature = msg;
      const map = { log: "INFO", info: "INFO", debug: "DEBUG" };
      MessageManager_default.log(map[level], code, msg, void 0, signature);
    };
  }
}

// pfui/infra/logging/loggingPreferences.ts
var DEFAULT_PREFS = {
  mode: "smart",
  heartbeatMs: 6e4,
  dedupeEveryN: 0
};
var MODE_ALIASES = {
  smart: "smart",
  verbose: "verbose",
  "errors-only": "errors-only",
  "errorsonly": "errors-only",
  errors: "errors-only",
  error: "errors-only"
};
var MODE_PARAM_KEYS = ["pf_log_mode", "LOG_MODE"];
var HEARTBEAT_KEYS = ["pf_log_heartbeat_ms"];
var DEDUPE_KEYS = ["pf_log_dedupe_every_n"];
var GLOBAL_FLAG_KEYS = {
  mode: ["__PF_LOG_MODE__"],
  heartbeat: ["__PF_LOG_HEARTBEAT_MS__"],
  dedupe: ["__PF_LOG_DEDUPE_EVERY_N__"]
};
var INITIAL_PARAM_MODE_KEY = "__pf_log_mode";
var INITIAL_PARAM_HEARTBEAT_KEY = "__pf_log_heartbeat_ms";
var INITIAL_PARAM_DEDUPE_KEY = "__pf_log_dedupe_every_n";
function coerceString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
function coerceMode(value) {
  const str = coerceString(value);
  if (!str) return null;
  const normalized = str.toLowerCase();
  return MODE_ALIASES[normalized] ?? null;
}
function coercePositiveInt(value, { allowZero = false } = {}) {
  const str = coerceString(value);
  if (!str) return null;
  const numeric = Number(str);
  if (!Number.isFinite(numeric)) return null;
  if (!allowZero && numeric <= 0) return null;
  if (allowZero && numeric < 0) return null;
  return Math.floor(numeric);
}
function readFromSearch(keys) {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of keys) {
      const value = params.get(key);
      if (value) return value;
    }
  } catch {
  }
  return null;
}
function readFromStorage(keys) {
  try {
    const storage = window.localStorage;
    if (!storage) return null;
    for (const key of keys) {
      const value = storage.getItem(key);
      if (value) return value;
    }
  } catch {
  }
  return null;
}
function readFromGlobals(keys) {
  try {
    const root = window;
    for (const key of keys) {
      if (key in root && root[key] != null) {
        return root[key];
      }
    }
  } catch {
  }
  return null;
}
function readInitial(initial, key) {
  if (!initial) return null;
  if (key in initial) return initial[key];
  return null;
}
function readDocumentDataset(key) {
  try {
    const attr = document.body?.getAttribute?.(key) ?? document.documentElement?.getAttribute?.(key);
    return attr ? attr : null;
  } catch {
  }
  return null;
}
function resolveMode(initialParams) {
  const globalInitial = window.__pf_initialParams;
  const candidates = [
    readInitial(initialParams, INITIAL_PARAM_MODE_KEY),
    readInitial(globalInitial, INITIAL_PARAM_MODE_KEY),
    readFromGlobals(GLOBAL_FLAG_KEYS.mode),
    readFromSearch(MODE_PARAM_KEYS),
    readFromStorage(MODE_PARAM_KEYS),
    readDocumentDataset("data-pf-log-mode")
  ];
  for (const cand of candidates) {
    const mode = coerceMode(cand);
    if (mode) return mode;
  }
  return DEFAULT_PREFS.mode;
}
function resolveHeartbeatMs(initialParams) {
  const globalInitial = window.__pf_initialParams;
  const candidates = [
    readInitial(initialParams, INITIAL_PARAM_HEARTBEAT_KEY),
    readInitial(globalInitial, INITIAL_PARAM_HEARTBEAT_KEY),
    readFromGlobals(GLOBAL_FLAG_KEYS.heartbeat),
    readFromSearch(HEARTBEAT_KEYS),
    readFromStorage(HEARTBEAT_KEYS),
    readDocumentDataset("data-pf-log-heartbeat-ms")
  ];
  for (const cand of candidates) {
    const ms = coercePositiveInt(cand);
    if (ms) return ms;
  }
  return DEFAULT_PREFS.heartbeatMs;
}
function resolveDedupeEveryN(initialParams) {
  const globalInitial = window.__pf_initialParams;
  const candidates = [
    readInitial(initialParams, INITIAL_PARAM_DEDUPE_KEY),
    readInitial(globalInitial, INITIAL_PARAM_DEDUPE_KEY),
    readFromGlobals(GLOBAL_FLAG_KEYS.dedupe),
    readFromSearch(DEDUPE_KEYS),
    readFromStorage(DEDUPE_KEYS),
    readDocumentDataset("data-pf-log-dedupe-n")
  ];
  for (const cand of candidates) {
    const dedupeN = coercePositiveInt(cand, { allowZero: true });
    if (dedupeN != null) return dedupeN;
  }
  return DEFAULT_PREFS.dedupeEveryN;
}
function resolveLoggingPreferences(initialParams) {
  return {
    mode: resolveMode(initialParams),
    heartbeatMs: resolveHeartbeatMs(initialParams),
    dedupeEveryN: resolveDedupeEveryN(initialParams)
  };
}

// pfui/infra/logging/WebGpuCapture.ts
var globalErrorCaptureInstalled = false;
function installGlobalErrorCapture() {
  if (globalErrorCaptureInstalled || typeof window === "undefined") {
    return;
  }
  globalErrorCaptureInstalled = true;
  window.addEventListener("error", (event) => {
    try {
      const message = String(event?.message ?? event?.error ?? "unknown error");
      const context = {
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno
      };
      const signatureParts = [
        message,
        event?.filename ?? "",
        String(event?.lineno ?? ""),
        String(event?.colno ?? ""),
        typeof event?.error === "object" && event?.error ? String(event.error.stack ?? "") : ""
      ];
      const signature = signatureParts.filter(Boolean).join("|");
      MessageManager_default.error("WINDOW_ERROR", message, context, signature);
    } catch (err) {
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const reason = e?.reason;
      const message = String(reason?.message ?? reason ?? "unknown rejection");
      const signature = typeof reason === "object" && reason ? String(reason.stack ?? reason) : message;
      MessageManager_default.critical("UNHANDLED_PROMISE_REJECTION", message, void 0, signature);
    } catch (err) {
    }
  });
}
function installWebGpuCapture(device2) {
  installGlobalErrorCapture();
  device2.lost.then((info) => {
    try {
      MessageManager_default.critical("WGPU_DEVICE_LOST", `Device lost: ${info?.message ?? info?.reason ?? "unknown"}`, { reason: info?.reason });
    } catch (e) {
    }
  }).catch(() => {
  });
  device2.addEventListener("uncapturederror", (ev) => {
    const err = ev?.error;
    const kind = err?.name || "GPUError";
    MessageManager_default.error("WGPU_UNCAPTURED_ERROR", `${String(kind)}: ${String(err?.message ?? err)}`, { name: kind });
  });
}
async function withValidationScope(device2, label, fn) {
  try {
    device2.pushErrorScope("validation");
  } catch (err) {
  }
  try {
    const r = await fn();
    let err = null;
    try {
      err = await device2.popErrorScope();
    } catch {
      err = void 0;
    }
    if (err) {
      MessageManager_default.error("WGPU_VALIDATE", `[${label}] ${String(err?.message ?? err)}`, { label });
    }
    return r;
  } catch (e) {
    try {
      await device2.popErrorScope();
    } catch {
    }
    ;
    MessageManager_default.error("WGPU_VALIDATE_THROW", `[${label}] ${String(e?.message ?? e)}`);
    return void 0;
  }
}
async function createShaderModule(device2, code, label) {
  const module = device2.createShaderModule({ code, label });
  try {
    const info = await module.getCompilationInfo?.();
    if (info && Array.isArray(info.messages)) {
      let warnCount = 0;
      for (const m of info.messages) {
        const sig = `${m.type}:${m.lineNum}:${m.linePos}:${m.message}`;
        if (m.type === "error") {
          MessageManager_default.error("WGPU_SHADER_ERROR", fmtShaderMsg(label, m), { stageLabel: label, line: m.lineNum, pos: m.linePos });
        } else if (m.type === "warning") {
          warnCount++;
          MessageManager_default.info("WGPU_SHADER_WARN", fmtShaderMsg(label, m), void 0, sig);
        } else {
          MessageManager_default.debug("WGPU_SHADER_INFO", fmtShaderMsg(label, m), void 0, sig);
        }
      }
    }
  } catch {
  }
  return module;
}
function fmtShaderMsg(label, m) {
  const loc = m.lineNum != null ? `:${m.lineNum}:${m.linePos ?? 0}` : "";
  return `[${label ?? "shader"}${loc}] ${m.message}`;
}

// pfui/components/webgpu_component/frontend/src/camera_basis.ts
var WORLD_UP = [0, 0, 1];
var PITCH_SOFT_LIMIT = Math.PI * 0.5 - 1e-3;
var EPS = 1e-6;
var vec3Length = (v) => Math.hypot(v[0], v[1], v[2]);
var vec3Normalize = (v) => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};
var vec3Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var vec3Cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
var vec3Scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
var wrapToPi = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const fullTurn = Math.PI * 2;
  let wrapped = value % fullTurn;
  if (wrapped > Math.PI) wrapped -= fullTurn;
  else if (wrapped < -Math.PI) wrapped += fullTurn;
  return wrapped;
};
var arcballDelta = (x0, y0, x1, y1, w, h, radius = 1) => {
  const map = (x, y) => projectToSphere(x, y, w, h, radius);
  const p0 = map(x0, y0);
  const p1 = map(x1, y1);
  const cross = [p0[1] * p1[2] - p0[2] * p1[1], p0[2] * p1[0] - p0[0] * p1[2], p0[0] * p1[1] - p0[1] * p1[0]];
  const dot = Math.max(-1, Math.min(1, p0[0] * p1[0] + p0[1] * p1[1] + p0[2] * p1[2]));
  const angle = Math.acos(dot);
  const len = vec3Length(cross);
  const axis = len < 1e-6 ? [0, 0, 1] : vec3Scale(cross, 1 / len);
  return { axis, angle };
};
var projectToSphere = (x, y, w, h, radius = 1) => {
  const nx = (2 * x - w) / Math.max(1, w);
  const ny = (h - 2 * y) / Math.max(1, h);
  const r2 = nx * nx + ny * ny;
  if (r2 <= radius * radius) {
    return [nx, ny, Math.sqrt(Math.max(0, radius * radius - r2))];
  }
  const inv = 1 / Math.sqrt(r2);
  return [nx * inv * radius, ny * inv * radius, 0];
};
var buildCameraBasis = (forwardDir) => {
  let forward = vec3Normalize(forwardDir);
  if (!Number.isFinite(forward[0]) || !Number.isFinite(forward[1]) || !Number.isFinite(forward[2])) {
    forward = [0, -1, 0];
  }
  let right = vec3Normalize(vec3Cross(WORLD_UP, forward));
  if (vec3Length(right) < EPS) {
    const candidates = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let best = candidates[0];
    let bestScore = Math.abs(vec3Dot(best, forward));
    for (let i = 1; i < candidates.length; i += 1) {
      const cand = candidates[i];
      const score = Math.abs(vec3Dot(cand, forward));
      if (score < bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    right = vec3Normalize(vec3Cross(best, forward));
  }
  if (vec3Length(right) < EPS) {
    right = [1, 0, 0];
  }
  let up = vec3Normalize(vec3Cross(forward, right));
  if (vec3Length(up) < EPS) {
    up = WORLD_UP;
  }
  return { right, up, forward };
};
var normalizeCameraBasis = (basis) => buildCameraBasis(basis.forward);
var applyCameraEulerToBasis = (rotX, rotY, options) => {
  const shouldWrap = options?.wrapAngles ?? true;
  const pitch = shouldWrap ? wrapToPi(rotX) : rotX;
  const yaw = shouldWrap ? wrapToPi(rotY) : rotY;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const forward = [sinYaw * cosPitch, -cosYaw * cosPitch, -sinPitch];
  return buildCameraBasis(forward);
};

// pfui/preview/assets/arcball_utils.ts
var EPS2 = 1e-6;
var projectAxisToTangent = (axisWorld, normal) => {
  if (!normal) return axisWorld;
  const dot = axisWorld[0] * normal[0] + axisWorld[1] * normal[1] + axisWorld[2] * normal[2];
  const proj = [axisWorld[0] - dot * normal[0], axisWorld[1] - dot * normal[1], axisWorld[2] - dot * normal[2]];
  const len = Math.hypot(proj[0], proj[1], proj[2]);
  if (len > EPS2) {
    return [proj[0] / len, proj[1] / len, proj[2] / len];
  }
  return axisWorld;
};

// pfui/preview/assets/webgpu_preview.ts
var detectPreviewDebug = () => {
  try {
    const params = window.__pf_initialParams;
    if (params && typeof params === "object" && "__pf_wgpu_debug__" in params) {
      const flag = params["__pf_wgpu_debug__"];
      if (flag === true || flag === 1 || flag === "1") {
        return true;
      }
    }
  } catch (err) {
  }
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.get("pf_wgpu_debug") === "1" || search.has("pf_wgpu_debug")) {
      return true;
    }
  } catch (err) {
  }
  try {
    const stored = window.localStorage?.getItem?.("pf_wgpu_debug");
    if (stored === "1" || stored?.toLowerCase() === "true") {
      return true;
    }
  } catch (err) {
  }
  try {
    if (window.__PF_WGPU_DEBUG__ === true) {
      return true;
    }
  } catch (err) {
  }
  return false;
};
var PREVIEW_DEBUG_ENABLED = detectPreviewDebug();
var ALWAYS_ON_DIAGNOSTICS = /* @__PURE__ */ new Set([
  "webgpu:host-suppressed",
  "webgpu:host-pending",
  "webgpu:error"
]);
var WGSL_B64 = "%WGSL_B64%";
var MAX_VERTS = 4294967295;
var STYLE_PARAM_CAPACITY = 48;
try {
  installConsolePatch();
} catch (err) {
}
var applyLoggingPreferences = (params) => {
  try {
    const prefs = resolveLoggingPreferences(params ?? null);
    MessageManager_default.setMode(prefs.mode);
    MessageManager_default.setHeartbeatMs(prefs.heartbeatMs);
    MessageManager_default.setDedupeEveryN(prefs.dedupeEveryN);
  } catch (err) {
  }
};
applyLoggingPreferences();
try {
  window.__pf_manager = MessageManager_default;
} catch (err) {
}
var DEFAULT_INTERACTIVE_LOD2 = DEFAULT_INTERACTIVE_LOD;
var MIN_INTERACTIVE_LOD2 = MIN_INTERACTIVE_LOD;
var MIN_THETA_STATIC2 = MIN_THETA_STATIC;
var MIN_Z_STATIC2 = MIN_Z_STATIC;
var PARAM_UPDATE_TIMEOUT_MS2 = PARAM_UPDATE_TIMEOUT_MS;
var CAMERA_BROADCAST_MS2 = CAMERA_BROADCAST_MS;
var CAMERA_EPSILON2 = CAMERA_EPSILON;
var CAMERA_STATIC_EPS2 = CAMERA_STATIC_EPS;
var CAMERA_PADDING2 = CAMERA_PADDING;
var CAMERA_PADDING_MIN2 = CAMERA_PADDING_MIN;
var CAMERA_PADDING_MAX2 = CAMERA_PADDING_MAX;
var BASE_FOV2 = BASE_FOV;
var CAMERA_NEAR_EPS2 = CAMERA_NEAR_EPS;
var CAMERA_DISTANCE_FALLOFF2 = CAMERA_DISTANCE_FALLOFF;
var UNIFORM_FLOAT_COUNT2 = UNIFORM_FLOAT_COUNT;
var CAMERA_EYE_OFFSET2 = CAMERA_EYE_OFFSET;
var CAMERA_MODE_OFFSET2 = CAMERA_MODE_OFFSET;
var VP_MATRIX_OFFSET2 = VP_MATRIX_OFFSET;
var CAMERA_RIGHT_OFFSET2 = CAMERA_RIGHT_OFFSET;
var CAMERA_UP_OFFSET2 = CAMERA_UP_OFFSET;
var CAMERA_FORWARD_OFFSET2 = CAMERA_FORWARD_OFFSET;
var GRID_FLAG_OFFSET2 = GRID_FLAG_OFFSET;
var DRAIN_RADIUS_OFFSET2 = DRAIN_RADIUS_OFFSET;
var INVALID_STATUS_COOLDOWN_MS2 = INVALID_STATUS_COOLDOWN_MS;
var statusReady = false;
var _hostPending = [];
var _hostReady = false;
var _hostFlushTimer = null;
var HOST_EMIT_DEDUP_MS = 400;
var HOST_EMIT_COOLDOWN_MS = 40;
var _lastHostEmitJson = null;
var _lastHostEmitTs = 0;
var _hostSuppressed = 0;
var flushHostPending = () => {
  if (!_hostReady) return;
  if (_hostPending.length === 0) return;
  try {
    const queued = _hostPending.splice(0);
    const reduced = {};
    for (const m of queued) {
      try {
        const key = m && typeof m === "object" && "type" in m ? String(m.type) : JSON.stringify(m);
        reduced[key] = m;
      } catch (err) {
        const idx = `__msg_${Math.random().toString(36).slice(2)}`;
        reduced[idx] = m;
      }
    }
    const target = window.parent && window.parent !== window ? window.parent : window;
    const now = Date.now();
    for (const key of Object.keys(reduced)) {
      const m = reduced[key];
      try {
        let j;
        try {
          j = JSON.stringify(m);
        } catch (err) {
          j = String(m);
        }
        if (_lastHostEmitJson && _lastHostEmitJson === j && now - _lastHostEmitTs < HOST_EMIT_DEDUP_MS) {
          _hostSuppressed += 1;
          continue;
        }
        const cooldownDelta = now - _lastHostEmitTs;
        if (cooldownDelta < HOST_EMIT_COOLDOWN_MS) {
          _hostPending.push(m);
          if (_hostFlushTimer === null) {
            _hostFlushTimer = window.setTimeout(() => {
              _hostFlushTimer = null;
              flushHostPending();
            }, Math.max(0, HOST_EMIT_COOLDOWN_MS - cooldownDelta));
          }
          continue;
        }
        target.postMessage(m, "*");
        _lastHostEmitJson = j;
        _lastHostEmitTs = now;
      } catch (err) {
      }
    }
  } catch (err) {
  }
  if (_hostSuppressed > 0) {
    try {
      emitDiagnostic("webgpu:host-suppressed", { count: _hostSuppressed });
    } catch (err) {
    }
    _hostSuppressed = 0;
  }
};
setTimeout(() => {
  _hostReady = true;
  flushHostPending();
}, 300);
var postToHost = (message) => {
  try {
    const now = Date.now();
    let j;
    try {
      j = JSON.stringify(message);
    } catch (err) {
      j = String(message);
    }
    if (_lastHostEmitJson && _lastHostEmitJson === j && now - _lastHostEmitTs < HOST_EMIT_DEDUP_MS) {
      _hostSuppressed += 1;
      return;
    }
    if (!_hostReady) {
      _hostPending.push(message);
      try {
        if (_hostPending.length > 4) {
          emitDiagnostic("webgpu:host-pending", { size: _hostPending.length });
        }
      } catch (err) {
      }
      return;
    }
    if (now - _lastHostEmitTs < HOST_EMIT_COOLDOWN_MS) {
      const cooldownDelta = now - _lastHostEmitTs;
      _hostPending.push(message);
      try {
        if (_hostPending.length > 4) {
          emitDiagnostic("webgpu:host-pending", { size: _hostPending.length });
        }
      } catch (err) {
      }
      if (_hostFlushTimer === null) {
        _hostFlushTimer = window.setTimeout(() => {
          _hostFlushTimer = null;
          flushHostPending();
        }, Math.max(0, HOST_EMIT_COOLDOWN_MS - cooldownDelta));
      }
      return;
    }
    const target = window.parent && window.parent !== window ? window.parent : window;
    target.postMessage(message, "*");
    _lastHostEmitJson = j;
    _lastHostEmitTs = now;
  } catch (err) {
  }
};
var emitDiagnostic = (message, detail = {}) => {
  const telemetryAllowed = PREVIEW_DEBUG_ENABLED || ALWAYS_ON_DIAGNOSTICS.has(message);
  if (!telemetryAllowed) {
    return;
  }
  if (PREVIEW_DEBUG_ENABLED) {
    try {
      MessageManager_default.debug("preview:diag", message, detail);
    } catch (err) {
    }
  }
  try {
    postToHost({ type: "diagnostic", payload: { message, detail, timestamp: Date.now() } });
  } catch (err) {
  }
};
var setStatus = (msg) => {
  const el = document.getElementById("wgpu-status");
  if (el) {
    const normalized = msg.toLowerCase();
    const finalMsg = statusReady && !normalized.includes("ready") ? `${msg} \u2022 ready` : msg;
    el.textContent = finalMsg;
    if (statusReady) {
      el.setAttribute("data-ready", "1");
    }
  }
};
var markStatusReady = () => {
  statusReady = true;
  const el = document.getElementById("wgpu-status");
  if (el) {
    el.setAttribute("data-ready", "1");
  }
  setStatus("WebGPU \u2022 ready");
};
var decodeHex = (hex) => parseInt(hex, 16) / 255;
var hexToRgbNorm = (input) => {
  if (Array.isArray(input) && input.length >= 3) {
    return [Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0];
  }
  const raw = typeof input === "string" ? input : "";
  let value = raw.replace("#", "");
  if (value.length === 3) {
    value = value.split("").map((ch) => ch + ch).join("");
  }
  if (value.length !== 6) {
    return [0.18, 0.53, 0.87];
  }
  const r = decodeHex(value.slice(0, 2));
  const g = decodeHex(value.slice(2, 4));
  const b = decodeHex(value.slice(4, 6));
  return [r, g, b];
};
var mergeParams = (target, incoming) => {
  if (!target) {
    return { ...incoming };
  }
  for (const key of Object.keys(incoming)) {
    const val = incoming[key];
    if (val !== void 0) {
      target[key] = val;
    }
  }
  return target;
};
var createDepthTexture = (device2, width, height) => device2.createTexture({
  label: "preview:depth-texture",
  size: { width, height },
  format: "depth24plus",
  usage: globalThis.GPUTextureUsage?.RENDER_ATTACHMENT ?? 16
});
var writeGradient = (device2, buffers, gradient) => {
  const stops = Array.isArray(gradient) ? gradient : [];
  const c1 = hexToRgbNorm(stops[0]);
  const c2 = hexToRgbNorm(stops[1] ?? stops[0]);
  const c3 = hexToRgbNorm(stops[2] ?? stops[1] ?? stops[0]);
  device2.queue.writeBuffer(buffers.c1, 0, new Float32Array([c1[0], c1[1], c1[2], 0]));
  device2.queue.writeBuffer(buffers.c2, 0, new Float32Array([c2[0], c2[1], c2[2], 0]));
  device2.queue.writeBuffer(buffers.c3, 0, new Float32Array([c3[0], c3[1], c3[2], 0]));
};
var buildUniformBlock = (size) => {
  const buffer = new ArrayBuffer(size);
  return new Float32Array(buffer);
};
var clampNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};
var sanitizePadding = (value) => {
  const normalized = Math.abs(value) || CAMERA_PADDING2;
  return Math.min(Math.max(normalized, CAMERA_PADDING_MIN2), CAMERA_PADDING_MAX2);
};
var vec3Length2 = (v) => Math.hypot(v[0], v[1], v[2]);
var vec3Normalize2 = (v) => {
  const len = vec3Length2(v);
  if (!Number.isFinite(len) || len < 1e-8) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
};
var vec3Subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var vec3Scale3 = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
var vec3Dot2 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var buildCameraBasis2 = (forwardDir) => buildCameraBasis(forwardDir);
var normalizeCameraBasis2 = (basis) => normalizeCameraBasis(basis);
var applyCameraEulerToBasis2 = (rotX, rotY, options) => applyCameraEulerToBasis(rotX, rotY, options);
var syncAnglesFromBasis = (basis) => hostSyncAnglesFromBasis(basis);
var viewMatrixFromBasis = (basis, eye) => {
  const out = new Float32Array(16);
  out[0] = basis.right[0];
  out[1] = basis.up[0];
  out[2] = basis.forward[0];
  out[3] = 0;
  out[4] = basis.right[1];
  out[5] = basis.up[1];
  out[6] = basis.forward[1];
  out[7] = 0;
  out[8] = basis.right[2];
  out[9] = basis.up[2];
  out[10] = basis.forward[2];
  out[11] = 0;
  out[12] = -vec3Dot2(basis.right, eye);
  out[13] = -vec3Dot2(basis.up, eye);
  out[14] = -vec3Dot2(basis.forward, eye);
  out[15] = 1;
  return out;
};
var writeVec3 = (target, offset, value) => {
  target[offset + 0] = value[0];
  target[offset + 1] = value[1];
  target[offset + 2] = value[2];
};
var mat4Multiply = (a, b) => {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    const bo = col * 4;
    const b0 = b[bo + 0];
    const b1 = b[bo + 1];
    const b2 = b[bo + 2];
    const b3 = b[bo + 3];
    out[bo + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[bo + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[bo + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[bo + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
};
var makeRotationMatrixFromEuler = (rotX, rotY, rotZ) => {
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cz = Math.cos(rotZ);
  const sz = Math.sin(rotZ);
  const m00 = cy * cz + sy * sx * sz;
  const m01 = -cy * sz + sy * sx * cz;
  const m02 = sy * cx;
  const m10 = cx * sz;
  const m11 = cx * cz;
  const m12 = -sx;
  const m20 = -sy * cz + cy * sx * sz;
  const m21 = sy * sz + cy * sx * cz;
  const m22 = cy * cx;
  return [m00, m01, m02, m10, m11, m12, m20, m21, m22];
};
var applyRotationToVector = (m, v) => {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
};
var mat4OrthoLH = (left, right, bottom, top, near, far) => {
  const out = new Float32Array(16);
  const lr = 1 / (right - left || 1);
  const bt = 1 / (top - bottom || 1);
  const nf = 1 / (far - near || 1);
  out[0] = 2 * lr;
  out[5] = 2 * bt;
  out[10] = nf;
  out[12] = -(right + left) * lr;
  out[13] = -(top + bottom) * bt;
  out[14] = -near * nf;
  out[15] = 1;
  return out;
};
var mat4PerspectiveFovLH = (fovY, aspect, near, far) => {
  const out = new Float32Array(16);
  const f = 1 / Math.tan(Math.max(fovY * 0.5, 1e-4));
  const range = 1 / (far - near || 1);
  out[0] = f / Math.max(aspect, 1e-4);
  out[5] = f;
  out[10] = far * range;
  out[11] = 1;
  out[14] = -near * far * range;
  return out;
};
var matrixIsFinite = (m) => {
  for (let i = 0; i < 16; i += 1) {
    const v = m[i];
    if (!Number.isFinite(v)) return false;
  }
  return true;
};
var create2DFallbackRenderer = (canvas, initialParams) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const draw = () => {
    const w = canvas.width = Math.max(1, canvas.clientWidth);
    const h = canvas.height = Math.max(1, canvas.clientHeight);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#242B46");
    g.addColorStop(1, "#060A14");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.55);
    ctx.scale(w / 800, h / 600);
    ctx.fillStyle = "#b0c4de";
    ctx.beginPath();
    ctx.ellipse(0, 0, 150, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8aa4c8";
    ctx.beginPath();
    ctx.ellipse(0, 20, 120, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  draw();
  window.addEventListener("resize", draw);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    draw();
  }, { passive: false });
  canvas.addEventListener("pointerdown", () => draw());
};
var INTERACTION_TIMEOUT_MS = 240;
var INERTIA_DECAY = 0.92;
var computePanFactor = (state, canvas) => {
  const rect = canvas.getBoundingClientRect();
  const reference = Math.max(rect.width, rect.height, 1);
  const scene = Math.max(state.sceneRadius, 1);
  const zoom = Math.max(state.zoom, 1e-3);
  return scene / reference * (2 / zoom);
};
var resetInertia = (state) => {
  state.inertiaRotX = 0;
  state.inertiaRotY = 0;
  state.inertiaPanX = 0;
  state.inertiaPanY = 0;
};
var sanitizePitch = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const limit = Math.PI / 2;
  const EPS3 = 5e-4;
  if (Math.abs(Math.abs(value) - limit) < EPS3) {
    return value > 0 ? limit - EPS3 : -limit + EPS3;
  }
  return value;
};
var wrapAngle = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const fullTurn = Math.PI * 2;
  let wrapped = value % fullTurn;
  if (wrapped > Math.PI) wrapped -= fullTurn;
  else if (wrapped < -Math.PI) wrapped += fullTurn;
  return wrapped;
};
var ORBIT_SOFT_LIMIT = Math.PI * 0.5 - 1e-4;
var ensureOrbitState = (state) => {
  if (!Number.isFinite(state.orbitPitch ?? NaN)) {
    state.orbitPitch = (typeof state.displayRotX === "number" ? state.displayRotX : state.rotX) ?? 0;
  }
  if (!Number.isFinite(state.orbitYaw ?? NaN)) {
    state.orbitYaw = (typeof state.displayRotY === "number" ? state.displayRotY : state.rotY) ?? 0;
  }
  if (state.orbitHemi !== 1 && state.orbitHemi !== -1) {
    state.orbitHemi = 1;
  }
};
var toggleOrbitHemisphere = (state) => {
  state.orbitHemi = state.orbitHemi === 1 ? -1 : 1;
};
var normalizeOrbitAngles = (state) => {
  ensureOrbitState(state);
  const limit = ORBIT_SOFT_LIMIT;
  while (state.orbitPitch > limit) {
    state.orbitPitch = Math.PI - state.orbitPitch;
    state.orbitYaw = state.orbitYaw + Math.PI;
    toggleOrbitHemisphere(state);
  }
  while (state.orbitPitch < -limit) {
    state.orbitPitch = -Math.PI - state.orbitPitch;
    state.orbitYaw = state.orbitYaw + Math.PI;
    toggleOrbitHemisphere(state);
  }
};
var shortestAngleDelta = (target, reference) => {
  let delta = wrapAngle(target) - wrapAngle(reference);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};
var primeOrbitFromAngles = (state, rotX, rotY) => {
  const prevYaw = Number.isFinite(state.orbitYaw ?? NaN) ? state.orbitYaw : rotY;
  const prevPitch = Number.isFinite(state.orbitPitch ?? NaN) ? state.orbitPitch : rotX;
  state.orbitYaw = prevYaw + shortestAngleDelta(rotY, prevYaw);
  state.orbitPitch = prevPitch + shortestAngleDelta(rotX, prevPitch);
  if (state.orbitHemi !== 1 && state.orbitHemi !== -1) {
    state.orbitHemi = 1;
  }
  normalizeOrbitAngles(state);
};
var updateDisplayBasisFromOrbit = (state) => {
  normalizeOrbitAngles(state);
  const basis = applyCameraEulerToBasis2(state.orbitPitch, state.orbitYaw, {
    wrapAngles: false
  });
  state.displayCamRight = [...basis.right];
  state.displayCamUp = [...basis.up];
  state.displayCamForward = [...basis.forward];
  state.displayRotX = wrapAngle(state.orbitPitch);
  state.displayRotY = wrapAngle(state.orbitYaw);
};
var applyDragToOrbit = (state, dx, dy, vw, vh) => {
  const yawGain = typeof state.orbitYawGain === "number" ? state.orbitYawGain : 1;
  const pitchGain = typeof state.orbitPitchGain === "number" ? state.orbitPitchGain : 1;
  const sgnX = state.invertOrbitX ? 1 : -1;
  const sgnY = state.invertOrbitY ? 1 : -1;
  ensureOrbitState(state);
  const dYaw = sgnX * dx * (Math.PI / Math.max(1, vw)) * yawGain * state.orbitHemi;
  const dPitch = sgnY * dy * (Math.PI / Math.max(1, vh)) * pitchGain;
  state.orbitYaw = state.orbitYaw + dYaw;
  state.orbitPitch = state.orbitPitch + dPitch;
  updateDisplayBasisFromOrbit(state);
};
var sanitizeInt = (value, fallback, minimum) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return minimum;
  }
  return parsed;
};
var applyCameraEuler = (state, rotX, rotY) => {
  const basis = applyCameraEulerToBasis2(rotX, rotY);
  state.camForward = [...basis.forward];
  state.camUp = [...basis.up];
  state.camRight = [...basis.right];
  state.rotX = sanitizePitch(rotX);
  state.rotY = wrapAngle(rotY);
  primeOrbitFromAngles(state, state.rotX, state.rotY);
};
var syncAnglesFromBasisState = (state) => {
  const { rotX, rotY } = syncAnglesFromBasis({ right: state.camRight, up: state.camUp, forward: state.camForward });
  const prevY = Number.isFinite(state.rotY) ? state.rotY : 0;
  let delta = rotY - prevY;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  state.rotX = sanitizePitch(rotX);
  state.rotY = prevY + delta;
  primeOrbitFromAngles(state, state.rotX, state.rotY);
};
var BASIS_FLIP_DOT_THRESHOLD = -0.999;
var resolveActiveBasis = (state) => {
  const hasDisplay = Boolean(state.displayCamForward && state.displayCamUp && state.displayCamRight);
  const sourceBasis = hasDisplay ? { right: [...state.displayCamRight], up: [...state.displayCamUp], forward: [...state.displayCamForward] } : { right: [...state.camRight], up: [...state.camUp], forward: [...state.camForward] };
  const normalized = normalizeCameraBasis2(sourceBasis);
  if (hasDisplay) {
    state.displayCamRight = [...normalized.right];
    state.displayCamUp = [...normalized.up];
    state.displayCamForward = [...normalized.forward];
  } else {
    state.camRight = [...normalized.right];
    state.camUp = [...normalized.up];
    state.camForward = [...normalized.forward];
    syncAnglesFromBasisState(state);
  }
  return normalized;
};
var commitDisplayBasisToState = (state) => {
  if (!state.displayCamForward || !state.displayCamUp || !state.displayCamRight) return false;
  try {
    MessageManager_default.debug("preview:commit-display-basis", "commitDisplayBasisToState", {
      interacting: state.interacting,
      autoRotate: state.autoRotate,
      inertiaRotX: state.inertiaRotX,
      inertiaRotY: state.inertiaRotY,
      panX: state.panX,
      panY: state.panY,
      camForwardLen: vec3Length2(state.displayCamForward),
      camRightLen: vec3Length2(state.displayCamRight),
      camUpLen: vec3Length2(state.displayCamUp),
      canvasAspect: state.canvasAspect
    });
  } catch (err) {
  }
  const prevRight = state.camRight;
  let flipped = false;
  if (prevRight && state.displayCamRight) {
    const committedBasis = {
      right: [...state.displayCamRight],
      up: [...state.displayCamUp],
      forward: [...state.displayCamForward]
    };
    const { rotX: commitRotX, rotY: commitRotY } = syncAnglesFromBasis({ right: committedBasis.right, up: committedBasis.up, forward: committedBasis.forward });
    let finalizeRotX = commitRotX;
    let finalizeRotY = commitRotY;
    if (Math.abs(Math.abs(finalizeRotX) - Math.PI / 2) < 1e-3) {
      finalizeRotY = 0;
    }
    const canonical = applyCameraEulerToBasis2(finalizeRotX, finalizeRotY);
    state.displayCamRight = [...canonical.right];
    state.displayCamUp = [...canonical.up];
    state.displayCamForward = [...canonical.forward];
    try {
      if (!state.interacting && !state.disableAutoFlip) {
        const testAxis = [0, 0, 1];
        const rig = buildCameraRig(state, CAMERA_PADDING2);
        const worldScale = Math.max(state.sceneRadius || 1, 1);
        const pA = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
        const pB = mulMat4Vec4(rig.viewProjection, (state.pivot?.[0] ?? 0) + testAxis[0] * worldScale, (state.pivot?.[1] ?? 0) + testAxis[1] * worldScale, (state.pivot?.[2] ?? 0) + testAxis[2] * worldScale);
        const dirNdc = ndcDirBetween(pA, pB);
        const ov_proj = [dirNdc[0], -dirNdc[1]];
        const ov_proj_len = Math.hypot(ov_proj[0], ov_proj[1]);
        if (ov_proj_len > 1e-9) {
          const ov_proj_unit = [ov_proj[0] / ov_proj_len, ov_proj[1] / ov_proj_len];
          const ov_basis = [
            state.displayCamRight[0] * testAxis[0] + state.displayCamRight[1] * testAxis[1] + state.displayCamRight[2] * testAxis[2],
            -(state.displayCamUp[0] * testAxis[0] + state.displayCamUp[1] * testAxis[1] + state.displayCamUp[2] * testAxis[2])
          ];
          const ov_basis_len = Math.hypot(ov_basis[0], ov_basis[1]);
          if (ov_basis_len > 1e-9) {
            const ov_basis_unit = [ov_basis[0] / ov_basis_len, ov_basis[1] / ov_basis_len];
            const dotAlign = ov_basis_unit[0] * ov_proj_unit[0] + ov_basis_unit[1] * ov_proj_unit[1];
            if (dotAlign < BASIS_FLIP_DOT_THRESHOLD) {
              state.displayCamRight = vec3Scale2(state.displayCamRight, -1);
              state.displayCamUp = vec3Scale2(state.displayCamUp, -1);
              emitDiagnostic("preview:display-basis-parity_flip", { dotAlign });
              flipped = true;
            }
          }
        }
      }
    } catch (e) {
    }
    const dot = vec3Dot2(prevRight, state.displayCamRight);
    if (dot < BASIS_FLIP_DOT_THRESHOLD) flipped = true;
  }
  state.camForward = [...state.displayCamForward];
  state.camUp = [...state.displayCamUp];
  state.camRight = [...state.displayCamRight];
  syncAnglesFromBasisState(state);
  state.displayCamForward = null;
  state.displayCamUp = null;
  state.displayCamRight = null;
  state.displayRotX = null;
  state.displayRotY = null;
  try {
    state.cameraDirty = true;
    device.queue.writeBuffer(uniformBuffer, 0, uniform.buffer);
    emitDiagnostic("preview:uniform-write-after-commit", { immediate: true, ts: Date.now(), cameraSeq: cameraSequence });
  } catch (err) {
  }
  return flipped;
};
var applyViewPreset = (state, preset) => {
  switch (preset) {
    case "top":
      applyCameraEuler(state, sanitizePitch(-Math.PI / 2 + 1e-3), 0);
      state.displayCamRight = [...state.camRight];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...state.camUp];
      state.displayCamForward = [...state.camForward];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      primeOrbitFromAngles(state, state.rotX, state.rotY);
      if (typeof commitDisplayBasisToState === "function") commitDisplayBasisToState(state);
      break;
    case "front":
      applyCameraEuler(state, 0, 0);
      state.displayCamRight = [...state.camRight];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...state.camUp];
      state.displayCamForward = [...state.camForward];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      if (typeof commitDisplayBasisToState === "function") commitDisplayBasisToState(state);
      break;
    case "right":
      applyCameraEuler(state, 0, Math.PI / 2);
      state.displayCamRight = [...state.camRight];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...state.camUp];
      state.displayCamForward = [...state.camForward];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      if (typeof commitDisplayBasisToState === "function") commitDisplayBasisToState(state);
      break;
    case "iso":
      applyCameraEuler(state, -0.9, Math.PI / 4);
      state.displayCamRight = [...state.camRight];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...state.camUp];
      state.displayCamForward = [...state.camForward];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      if (typeof commitDisplayBasisToState === "function") commitDisplayBasisToState(state);
      break;
    case "fit":
    default:
      applyCameraEuler(state, sanitizePitch(0.35), 0);
      state.displayCamRight = [...state.camRight];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...state.camUp];
      state.displayCamForward = [...state.camForward];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.zoom = 1;
      break;
  }
  state.panX = 0;
  state.panY = 0;
  primeOrbitFromAngles(state, state.rotX, state.rotY);
  resetInertia(state);
  state.cameraDirty = true;
};
var mount = async ({ canvas, initialParams }) => {
  applyLoggingPreferences(initialParams ? initialParams : null);
  const navGpu = navigator.gpu;
  try {
    MessageManager_default.info("webgpu:mount", "checking navigator.gpu", { gpu: navigator.gpu });
    emitDiagnostic("webgpu:navigator", { has_gpu: !!navigator.gpu });
  } catch (err) {
  }
  if (!navGpu) {
    try {
      create2DFallbackRenderer(canvas, initialParams ?? {});
      setStatus("Fallback renderer ready");
      try {
        const dataId = canvas.getAttribute("data-pf-wgpu-id") || "pf-wgpu-default";
        window.__pf_webgpu_mounts = window.__pf_webgpu_mounts || {};
        window.__pf_webgpu_mounts[dataId] = window.__pf_webgpu_mounts[dataId] || {};
        const fallbackState = {
          sceneRadius: Number((initialParams ?? {}).sceneRadius || 120),
          projection: (initialParams ?? {}).projection || "ortho",
          rotX: 0.35,
          rotY: 0,
          canvasAspect: (canvas.width || 1) / (canvas.height || 1)
        };
        window.__pf_webgpu_mounts[dataId].debug = {
          usedFallback: true,
          ready: false,
          buildCameraRig: async (paddingHint, paddedHalfWidth, paddedHalfHeight) => {
            const waitUntil = (ms) => new Promise((res) => setTimeout(res, ms));
            const start = performance.now();
            while (typeof self["buildCameraRig"] !== "function") {
              if (performance.now() - start > 5e3) {
                break;
              }
              await waitUntil(30);
            }
            try {
              let rig = null;
              let dV = 0;
              let dH = 0;
              if (typeof self["buildCameraRig"] === "function") {
                try {
                  window.__pf_webgpu_mounts[dataId].debug.usedFallback = false;
                } catch (err) {
                }
                rig = self["buildCameraRig"](paddingHint, paddedHalfWidth, paddedHalfHeight);
              } else {
                try {
                  window.__pf_webgpu_mounts[dataId].debug.usedFallback = true;
                } catch (err) {
                }
                const halfFovY = Math.max(BASE_FOV2 * 0.5, 1e-4);
                const halfFovX = Math.atan(Math.tan(halfFovY) * (fallbackState.canvasAspect || 1));
                dV = Math.max(1e-6, Number(paddedHalfHeight || 0)) / Math.max(Math.tan(halfFovY), 1e-6);
                dH = Math.max(1e-6, Number(paddedHalfWidth || 0)) / Math.max(Math.tan(halfFovX), 1e-6);
                rig = { fov: BASE_FOV2, eye: [0, 0, Math.max(dV, dH)], viewProjection: new Float32Array(16).fill(0), near: CAMERA_NEAR_EPS2, far: CAMERA_NEAR_EPS2 + 1e6, mode: fallbackState.projection };
                return { viewProjection: Array.from(rig.viewProjection), eye: Array.from(rig.eye), mode: rig.mode, fov: rig.fov, near: rig.near, far: rig.far, dV, dH, chosenDistance: Math.max(dV, dH) };
              }
              return {
                viewProjection: Array.from(rig.viewProjection),
                eye: Array.from(rig.eye),
                mode: rig.mode,
                fov: rig.fov,
                near: rig.near,
                far: rig.far,
                dV,
                dH,
                chosenDistance: Math.hypot(rig.eye[0], rig.eye[1], rig.eye[2])
              };
            } catch (err) {
              return { error: String(err) };
            }
          },
          getState: () => ({ sceneRadius: fallbackState.sceneRadius, projection: fallbackState.projection, rotX: fallbackState.rotX, rotY: fallbackState.rotY }),
          lastApplyCameraPayload: null,
          lastSceneRadiusUpdate: null
        };
        window.addEventListener("message", (event) => {
          const data = event.data;
          if (!data || typeof data !== "object" || data.target !== dataId) return;
          if (data.type === "params" && data.payload) {
            let payload = data.payload;
            if (typeof payload === "string") {
              try {
                payload = JSON.parse(payload);
              } catch (err) {
              }
            }
            try {
              const dbg = window.__pf_webgpu_mounts[dataId]?.debug;
              if (typeof payload.sceneRadius === "number") {
                const prev = fallbackState.sceneRadius;
                const next = Math.max(Math.abs(clampNumber(payload.sceneRadius, prev)), 1);
                if (Math.abs(next - prev) > CAMERA_EPSILON2) {
                  fallbackState.sceneRadius = next;
                  if (dbg) {
                    dbg.lastSceneRadiusUpdate = { prev, next: fallbackState.sceneRadius, timestamp: Date.now() };
                  }
                }
              }
              if (typeof payload.rotX === "number") {
                fallbackState.rotX = sanitizePitch(payload.rotX);
              }
              if (typeof payload.rotY === "number") {
                fallbackState.rotY = payload.rotY;
              }
              if (dbg) {
                dbg.lastApplyCameraPayload = { fields: Object.keys(payload), timestamp: Date.now() };
              }
            } catch (err) {
            }
          }
        });
      } catch (err) {
      }
      try {
        const dataId = canvas.getAttribute("data-pf-wgpu-id") || "pf-wgpu-default";
        window.__pf_webgpu_mounts = window.__pf_webgpu_mounts || {};
        if (window.__pf_webgpu_mounts[dataId]?.debug) {
          window.__pf_webgpu_mounts[dataId].debug.ready = true;
          window.__pf_webgpu_mounts[dataId].debug.usedFallback = true;
        }
      } catch (err) {
      }
      markStatusReady();
      return true;
    } catch (err) {
      setStatus("WebGPU not supported");
      return false;
    }
  }
  const adapterAttemptLog = [];
  const attemptAdapterRequest = async (options, label) => {
    try {
      const adapterResult = await navGpu.requestAdapter(options);
      if (!adapterResult) {
        adapterAttemptLog.push(`${label}:null`);
        console.warn("WebGPU adapter attempt returned null", { attempt: label });
      } else {
        adapterAttemptLog.push(`${label}:ok`);
      }
      return adapterResult;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const escapedMessage = raw.replace(/;/g, "%3B").replace(/\n/g, " ");
      adapterAttemptLog.push(`${label}:error:${escapedMessage}`);
      console.warn("WebGPU adapter request failed", {
        attempt: label,
        error: raw
      });
      return null;
    }
  };
  const adapter = await attemptAdapterRequest(void 0, "default") ?? await attemptAdapterRequest({ powerPreference: "high-performance" }, "high-performance") ?? await attemptAdapterRequest({ powerPreference: "low-power" }, "low-power") ?? await attemptAdapterRequest({ forceFallbackAdapter: true }, "fallback");
  try {
    emitDiagnostic("webgpu:adapter-log", { attempts: adapterAttemptLog });
    MessageManager_default.info("webgpu:adapter-log", "adapter attempts", { adapterAttemptLog, adapter });
  } catch (err) {
  }
  let device2 = await adapter.requestDevice();
  try {
    installWebGpuCapture(device2);
  } catch (err) {
  }
  try {
    device2.lost?.then(async (info) => {
      MessageManager_default.warn("webgpu:device-lost", "device.lost - attempting recovery", { info });
      setStatus("WebGPU \u2022 device lost \u2014 attempting recovery");
      try {
        const newDevice = await adapter.requestDevice();
        device2 = newDevice;
        try {
          context.configure({ device: device2, format, alphaMode: "opaque" });
        } catch (cfgErr) {
          console.warn("WebGPU recovery: context reconfigure failed", cfgErr);
        }
        setStatus("WebGPU \u2022 recovered");
      } catch (reErr) {
        console.error("WebGPU recovery failed", reErr);
        setStatus("WebGPU \u2022 device recovery failed \u2014 reload the page");
      }
    });
  } catch (err) {
  }
  try {
    try {
      MessageManager_default.info("webgpu:adapter-info", "adapter info", { adapter });
    } catch (e) {
    }
    try {
      MessageManager_default.info("webgpu:device-limits", "device.limits", { limits: device2.limits });
      MessageManager_default.info("webgpu:device-features", "device.features", { features: Array.from(device2.features || []) });
    } catch (e) {
    }
  } catch (err) {
  }
  const context = canvas.getContext("webgpu");
  if (!context) {
    setStatus("WebGPU context unavailable");
    return false;
  }
  const format = navGpu.getPreferredCanvasFormat();
  let width = 1;
  let height = 1;
  const dpr = window.devicePixelRatio || 1;
  let depth = createDepthTexture(device2, width, height);
  let overlayCanvas = null;
  let overlayCtx = null;
  let axisCanvas = null;
  let axisCtx = null;
  try {
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.style.position = "absolute";
    overlayCanvas.style.inset = "0";
    overlayCanvas.style.pointerEvents = "none";
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
    const parent = canvas.parentElement || document.body;
    parent.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext("2d");
    try {
      const parent2 = canvas.parentElement || document.body;
      axisCanvas = document.createElement("canvas");
      axisCanvas.style.position = "absolute";
      axisCanvas.style.left = "8px";
      axisCanvas.style.bottom = "8px";
      axisCanvas.style.pointerEvents = "none";
      axisCanvas.style.zIndex = "9998";
      axisCanvas.width = 96 * (window.devicePixelRatio || 1);
      axisCanvas.height = 96 * (window.devicePixelRatio || 1);
      axisCanvas.style.width = "96px";
      axisCanvas.style.height = "96px";
      parent2.appendChild(axisCanvas);
      axisCtx = axisCanvas.getContext("2d");
    } catch (err) {
    }
    const drawAxisIndicator2 = (ctx, rig) => {
      if (!ctx || !rig) return;
      try {
        const canvas2 = ctx.canvas;
        const w = canvas2.width;
        const h = canvas2.height;
        ctx.clearRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        const scale = Math.min(w, h) * 0.34;
        const basis = rig.basis;
        const dotToScreen = (v) => {
          const pivot = state.pivot ?? [0, 0, 0];
          const worldScale = Math.max(state.sceneRadius, 1);
          const mul = (m, x, y, z) => {
            const cxv = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
            const cyv = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
            const cwv = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
            return { x: cxv, y: cyv, w: cwv };
          };
          const pA = mul(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
          const pB = mul(rig.viewProjection, pivot[0] + v[0] * worldScale, pivot[1] + v[1] * worldScale, pivot[2] + v[2] * worldScale);
          const ax = pA.x / pA.w;
          const ay = pA.y / pA.w;
          const bx = pB.x / pB.w;
          const by = pB.y / pB.w;
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy);
          if (len < 1e-9) return [cx, cy];
          const ndcX = dx / len;
          const ndcY = dy / len;
          return [cx + ndcX * scale, cy - ndcY * scale];
        };
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const axes = [
          { v: [1, 0, 0], color: "#e53935", label: "X" },
          { v: [0, 1, 0], color: "#43a047", label: "Y" },
          { v: [0, 0, 1], color: "#1e88e5", label: "Z" }
        ];
        for (const a of axes) {
          const [tx, ty] = dotToScreen(a.v);
          const dx = tx - cx;
          const dy = ty - cy;
          const len = Math.hypot(dx, dy);
          if (len < 1e-3) continue;
          const ux = dx / len;
          const uy = dy / len;
          ctx.beginPath();
          ctx.lineWidth = Math.max(2, Math.round(w * 0.02));
          ctx.strokeStyle = a.color;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + ux * (len - Math.min(8, w * 0.06)), cy + uy * (len - Math.min(8, w * 0.06)));
          ctx.stroke();
          const tipSize = Math.max(6, Math.round(w * 0.04));
          ctx.beginPath();
          ctx.fillStyle = a.color;
          ctx.moveTo(cx + ux * len, cy + uy * len);
          ctx.lineTo(cx + ux * (len - tipSize) - uy * (tipSize * 0.45), cy + uy * (len - tipSize) + ux * (tipSize * 0.45));
          ctx.lineTo(cx + ux * (len - tipSize) + uy * (tipSize * 0.45), cy + uy * (len - tipSize) - ux * (tipSize * 0.45));
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.font = `${Math.max(10, Math.round(w * 0.12))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const lx = cx + ux * (len + Math.max(6, Math.round(w * 0.02)));
          const ly = cy + uy * (len + Math.max(6, Math.round(w * 0.02)));
          try {
            const pivot = state.pivot ?? [0, 0, 0];
            const worldScale = Math.max(state.sceneRadius, 1);
            const pA = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
            const pB = mulMat4Vec4(rig.viewProjection, pivot[0] + a.v[0] * worldScale, pivot[1] + a.v[1] * worldScale, pivot[2] + a.v[2] * worldScale);
            const dirNdc = ndcDirBetween(pA, pB);
            const ov_proj = [dirNdc[0], -dirNdc[1]];
            const ov_proj_len = Math.hypot(ov_proj[0], ov_proj[1]);
            const ov_proj_unit = ov_proj_len > 1e-9 ? [ov_proj[0] / ov_proj_len, ov_proj[1] / ov_proj_len] : [0, 0];
            const pr = mulMat4Vec4(rig.viewProjection, pivot[0] + basis.right[0] * worldScale, pivot[1] + basis.right[1] * worldScale, pivot[2] + basis.right[2] * worldScale);
            const pu = mulMat4Vec4(rig.viewProjection, pivot[0] + basis.up[0] * worldScale, pivot[1] + basis.up[1] * worldScale, pivot[2] + basis.up[2] * worldScale);
            const dirR = ndcDirBetween(pA, pr);
            const dirU = ndcDirBetween(pA, pu);
            const rvec = [dirR[0], -dirR[1]];
            const uvec = [dirU[0], -dirU[1]];
            const ax = a.v[0] * basis.right[0] + a.v[1] * basis.right[1] + a.v[2] * basis.right[2];
            const ay = a.v[0] * basis.up[0] + a.v[1] * basis.up[1] + a.v[2] * basis.up[2];
            const ovx = ax * rvec[0] + ay * uvec[0];
            const ovy = ax * rvec[1] + ay * uvec[1];
            const ov_len = Math.hypot(ovx, ovy);
            const ov_basis_unit = ov_len > 1e-9 ? [ovx / ov_len, ovy / ov_len] : [0, 0];
            emitDiagnostic("preview:axis-overlay-compare", { axis: a.label, overlayProj: ov_proj_unit, overlayBasis: ov_basis_unit, ts: Date.now(), cameraSeq: cameraSequence2 });
          } catch (err) {
          }
          ctx.fillText(a.label, lx, ly);
        }
      } catch (err) {
      }
    };
  } catch (err) {
  }
  const state = {
    rotX: 0.35,
    rotY: 0,
    autoRotate: true,
    zoom: 1,
    panX: 0,
    panY: 0,
    inertiaRotX: 0,
    inertiaRotY: 0,
    inertiaPanX: 0,
    inertiaPanY: 0,
    interacting: false,
    lastInteraction: performance.now(),
    sceneRadius: 120,
    interactiveLodRatio: DEFAULT_INTERACTIVE_LOD2,
    interactiveLodEnabled: false,
    recentParamUpdate: false,
    lastParamUpdate: performance.now(),
    lastParamNonce: null,
    canvasAspect: 1,
    cameraDirty: true,
    lastCameraPush: 0,
    projectionMode: "ortho",
    debugFlatColor: false,
    debugOverlay: false,
    showGrid: true,
    showAxis: true,
    disableAutoFlip: false,
    camRight: [1, 0, 0],
    camUp: [0, 0, 1],
    camForward: [0, -1, 0],
    displayCamRight: null,
    displayCamUp: null,
    displayCamForward: null,
    displayRotX: null,
    displayRotY: null,
    orbitYaw: 0,
    orbitPitch: 0,
    orbitHemi: 1,
    invertOrbitX: false,
    invertOrbitY: false,
    orbitYawGain: 1,
    orbitPitchGain: 1
  };
  let frameCounter = 0;
  let totalDrawCalls = 0;
  let totalDrawnVerts = 0;
  applyCameraEuler(state, state.rotX, state.rotY);
  try {
    const dataId = canvas.getAttribute("data-pf-wgpu-id") || "pf-wgpu-default";
    window.__pf_webgpu_mounts = window.__pf_webgpu_mounts || {};
    window.__pf_webgpu_mounts[dataId] = window.__pf_webgpu_mounts[dataId] || {};
    window.__pf_webgpu_mounts[dataId].debug = {
      usedFallback: false,
      buildCameraRig: async (paddingHint, paddedHalfWidth, paddedHalfHeight) => {
        const waitUntil = (ms) => new Promise((res) => setTimeout(res, ms));
        const start = performance.now();
        while (typeof self["buildCameraRig"] !== "function") {
          if (performance.now() - start > 5e3) {
            break;
          }
          await waitUntil(30);
        }
        try {
          let rig = null;
          let dV = 0;
          let dH = 0;
          if (typeof self["buildCameraRig"] === "function") {
            try {
              window.__pf_webgpu_mounts[dataId].debug.usedFallback = false;
            } catch (err) {
            }
            rig = self["buildCameraRig"](paddingHint, paddedHalfWidth, paddedHalfHeight);
          } else {
            try {
              window.__pf_webgpu_mounts[dataId].debug.usedFallback = true;
            } catch (err) {
            }
            const halfFovY2 = Math.max(BASE_FOV2 * 0.5, 1e-4);
            const halfFovX2 = Math.atan(Math.tan(halfFovY2) * (state.canvasAspect || 1));
            const dV2 = Math.max(1e-6, Number(paddedHalfHeight || 0)) / Math.max(Math.tan(halfFovY2), 1e-6);
            const dH2 = Math.max(1e-6, Number(paddedHalfWidth || 0)) / Math.max(Math.tan(halfFovX2), 1e-6);
            const fakeRig = { fov: BASE_FOV2, eye: [0, 0, Math.max(dV2, dH2)], viewProjection: new Float32Array(16).fill(0), near: CAMERA_NEAR_EPS2, far: CAMERA_NEAR_EPS2 + 1e6, mode: state.projectionMode };
            return { viewProjection: Array.from(fakeRig.viewProjection), eye: Array.from(fakeRig.eye), mode: fakeRig.mode, fov: fakeRig.fov, near: fakeRig.near, far: fakeRig.far, dV: dV2, dH: dH2, chosenDistance: Math.max(dV2, dH2) };
          }
          const halfFovY = rig.fov * 0.5;
          const halfFovX = Math.atan(Math.tan(halfFovY) * (state.canvasAspect || 1));
          dV = Math.max(1e-6, Number(paddedHalfHeight || 0)) / Math.max(Math.tan(halfFovY), 1e-6);
          dH = Math.max(1e-6, Number(paddedHalfWidth || 0)) / Math.max(Math.tan(halfFovX), 1e-6);
          return {
            viewProjection: Array.from(rig.viewProjection),
            eye: Array.from(rig.eye),
            mode: rig.mode,
            fov: rig.fov,
            near: rig.near,
            far: rig.far,
            dV,
            dH,
            chosenDistance: Math.hypot(rig.eye[0], rig.eye[1], rig.eye[2])
          };
          try {
            window.__pf_webgpu_mounts[dataId].debug.ready = true;
          } catch (err) {
          }
        } catch (err) {
          return { error: String(err) };
        }
      },
      getState: () => ({ sceneRadius: state.sceneRadius, projection: state.projectionMode, rotX: state.rotX, rotY: state.rotY }),
      lastApplyCameraPayload: null,
      lastSceneRadiusUpdate: null
    };
  } catch (err) {
  }
  try {
    const c = window.__pf_webgpu_camera_controller;
    const policy = initialParams?.hostCameraAcceptPolicy;
    const grace = Number(initialParams?.localCameraGraceMs ?? initialParams?.hostCameraGraceMs ?? NaN);
    if (c) {
      if (policy && typeof c.setHostCameraAcceptPolicy === "function") c.setHostCameraAcceptPolicy(policy);
      if (Number.isFinite(grace) && typeof c.setLocalCameraGraceMs === "function") c.setLocalCameraGraceMs(grace);
    }
  } catch (err) {
  }
  const DEBUG_THROTTLE_MS = 250;
  let lastDebugOverlayUpdate = 0;
  let lastVpLogTime = 0;
  let lastInvalidStatusAt = -Infinity;
  let lastFrameLogTime = 0;
  let lastAutoDiagTime = 0;
  const buildCameraSnapshot = () => ({
    rotX: state.rotX,
    rotY: state.rotY,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    autoRotate: state.autoRotate,
    sceneRadius: state.sceneRadius,
    projection: state.projectionMode
  });
  const snapshotsEqual = (prev, next) => {
    if (!prev) {
      return false;
    }
    return Math.abs(prev.rotX - next.rotX) <= CAMERA_EPSILON2 && Math.abs(prev.rotY - next.rotY) <= CAMERA_EPSILON2 && Math.abs(prev.zoom - next.zoom) <= CAMERA_EPSILON2 && Math.abs(prev.panX - next.panX) <= CAMERA_EPSILON2 && Math.abs(prev.panY - next.panY) <= CAMERA_EPSILON2 && prev.autoRotate === next.autoRotate && Math.abs(prev.sceneRadius - next.sceneRadius) <= CAMERA_EPSILON2 && prev.projection === next.projection;
  };
  let lastCameraSnapshot = null;
  let cameraSequence2 = 0;
  let pendingStaticCameraEmit = false;
  let cameraEmitTimer = null;
  const emitCameraState = (force = false) => {
    const now = performance.now();
    if (!force) {
      if (!state.cameraDirty) {
        return;
      }
      if (now - state.lastCameraPush < CAMERA_BROADCAST_MS2) {
        return;
      }
    }
    const hasDisplay = Boolean(state.displayCamForward || state.displayCamUp || state.displayCamRight);
    if (!force && hasDisplay) {
      pendingStaticCameraEmit = true;
      scheduleCameraEmit();
      return;
    }
    const snapshot = buildCameraSnapshot();
    if (!force && snapshotsEqual(lastCameraSnapshot, snapshot)) {
      state.cameraDirty = false;
      state.lastCameraPush = now;
      return;
    }
    lastCameraSnapshot = { ...snapshot };
    state.cameraDirty = false;
    state.lastCameraPush = now;
    cameraSequence2 += 1;
    try {
      emitDiagnostic("preview:camera-state", { ts: Date.now(), seq: cameraSequence2, rotX: snapshot.rotX, rotY: snapshot.rotY, zoom: snapshot.zoom });
    } catch (err) {
    }
    postToHost({
      type: "cameraState",
      payload: {
        ...snapshot,
        timestamp: Date.now(),
        seq: cameraSequence2
      }
    });
  };
  const cancelCameraEmit = () => {
    if (cameraEmitTimer !== null) {
      window.clearTimeout(cameraEmitTimer);
      cameraEmitTimer = null;
    }
  };
  const scheduleCameraEmit = (delay = CAMERA_BROADCAST_MS2) => {
    cancelCameraEmit();
    cameraEmitTimer = window.setTimeout(() => {
      cameraEmitTimer = null;
      emitCameraState(true);
    }, delay);
  };
  const isCameraStatic = () => {
    return !pointer.active && !state.autoRotate && Math.abs(state.inertiaRotX) <= CAMERA_STATIC_EPS2 && Math.abs(state.inertiaRotY) <= CAMERA_STATIC_EPS2 && Math.abs(state.inertiaPanX) <= CAMERA_STATIC_EPS2 && Math.abs(state.inertiaPanY) <= CAMERA_STATIC_EPS2;
  };
  const requestCameraEmitWhenStatic = () => {
    pendingStaticCameraEmit = true;
    cancelCameraEmit();
  };
  let _resizeTimer = null;
  const resize = () => {
    if (_resizeTimer) {
      clearTimeout(_resizeTimer);
    }
    _resizeTimer = setTimeout(() => {
      _resizeTimer = null;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      try {
        context.configure({ device: device2, format, alphaMode: "opaque" });
      } catch (cfgErr) {
        console.warn("WebGPU \u2022 context.configure on resize failed", cfgErr);
      }
      try {
        const newDepth = createDepthTexture(device2, width, height);
        const oldDepth = depth;
        depth = newDepth;
        if (oldDepth) {
          setTimeout(() => {
            try {
              oldDepth.destroy();
            } catch (err) {
            }
          }, 0);
        }
      } catch (dErr) {
        console.warn("WebGPU \u2022 depth texture recreate failed", dErr);
      }
      state.canvasAspect = height > 0 ? width / height : 1;
      if (overlayCanvas) {
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        overlayCanvas.style.width = `${Math.round(rect.width)}px`;
        overlayCanvas.style.height = `${Math.round(rect.height)}px`;
      }
      if (axisCanvas) {
        const overlaySizeCss = 96;
        const overlayW = Math.max(1, Math.round(overlaySizeCss * (window.devicePixelRatio || 1)));
        axisCanvas.width = overlayW;
        axisCanvas.height = overlayW;
        axisCanvas.style.width = `${overlaySizeCss}px`;
        axisCanvas.style.height = `${overlaySizeCss}px`;
      }
      state.cameraDirty = true;
    }, 24);
  };
  window.addEventListener("resize", resize);
  resize();
  let __wgpu_debug_el = null;
  try {
    const parent = canvas.parentElement || document.body;
    const pre = document.createElement("pre");
    pre.id = "wgpu-debug";
    pre.style.cssText = "position: absolute; right: 8px; top: 8px; margin: 0; padding: 6px 8px; background: rgba(0,0,0,0.6); color: #9ff89f; font-family: monospace; font-size:12px; z-index:9999; max-width:360px; max-height:40vh; overflow:auto; display:none; pointer-events:none;";
    parent.appendChild(pre);
    __wgpu_debug_el = pre;
  } catch (err) {
    __wgpu_debug_el = null;
  }
  const wgsl = atob(WGSL_B64);
  const shaderModule = await createShaderModule(device2, wgsl, "potfoundry-webgpu");
  const createPipeline = async (device3, format2, shaderModule2) => {
    const info = await (shaderModule2.getCompilationInfo?.() ?? Promise.resolve(void 0));
    if (info && Array.isArray(info.messages) && info.messages.some((m) => m.type === "error")) {
      for (const message of info.messages) {
        console.warn("WGSL", message);
      }
      setStatus("WebGPU \u2022 shader compile failed (see console)");
      return null;
    }
    const pipelineLabel = "preview:pipeline-main";
    try {
      const pipeline2 = await withValidationScope(
        device3,
        pipelineLabel,
        () => device3.createRenderPipelineAsync({
          label: pipelineLabel,
          layout: "auto",
          vertex: { module: shaderModule2, entryPoint: "vs_main" },
          fragment: {
            module: shaderModule2,
            entryPoint: "fs_main",
            targets: [
              {
                format: format2,
                blend: {
                  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
                }
              }
            ]
          },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus"
          }
        })
      );
      if (!pipeline2) {
        throw new Error("createRenderPipelineAsync returned undefined");
      }
      return pipeline2;
    } catch (err) {
      console.error("createRenderPipelineAsync failed", err);
      setStatus("WebGPU \u2022 pipeline creation failed");
      return null;
    }
  };
  const pipeline = await createPipeline(device2, format, shaderModule);
  if (!pipeline) {
    return false;
  }
  let flatPipeline = null;
  const createFlatPipeline = async () => {
    if (flatPipeline) return flatPipeline;
    const flatWGSL = `@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(positions[vi], 0.0, 1.0);
}
@fragment
fn fs_main() -> @location(0) vec4<f32> {
  // Bright magenta by default so it's obvious when this path runs
  return vec4<f32>(1.0, 0.0, 1.0, 1.0);
}`;
    try {
      const module = await createShaderModule(device2, flatWGSL, "flat-diagnostic");
      const label = "preview:pipeline-flat";
      flatPipeline = await withValidationScope(
        device2,
        label,
        () => device2.createRenderPipelineAsync({
          label,
          layout: "auto",
          vertex: { module, entryPoint: "vs_main" },
          fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
          primitive: { topology: "triangle-list", cullMode: "none" }
        })
      );
      return flatPipeline;
    } catch (err) {
      console.warn("Failed to create flat debug pipeline", err);
      return null;
    }
  };
  void createFlatPipeline().catch(() => {
  });
  const drawFlatDiagnostic = (reason) => {
    if (!flatPipeline) {
      console.warn("WebGPU \u2022 flat pipeline unavailable", { reason });
      return false;
    }
    try {
      const encoderDiag = device2.createCommandEncoder({ label: "preview:flat-draw-encoder" });
      const diagView = context.getCurrentTexture().createView({ label: "preview:flat-target-view" });
      const passDiag = encoderDiag.beginRenderPass({
        colorAttachments: [
          {
            view: diagView,
            clearValue: { r: 0.05, g: 0.05, b: 0.07, a: 1 },
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });
      passDiag.setPipeline(flatPipeline);
      passDiag.draw(3);
      passDiag.end();
      device2.queue.submit([encoderDiag.finish()]);
      console.info("[WebGPU] flat diagnostic draw", reason);
      return true;
    } catch (err) {
      console.warn("WebGPU \u2022 flat diagnostic draw failed", reason, err);
      return false;
    }
  };
  const uniformSize = 4 * UNIFORM_FLOAT_COUNT2;
  const bufferUsage = globalThis.GPUBufferUsage ?? { UNIFORM: 64, COPY_DST: 8, STORAGE: 32 };
  const uniformUsage = bufferUsage.UNIFORM ?? 64;
  const copyDstUsage = bufferUsage.COPY_DST ?? 8;
  const storageUsage = bufferUsage.STORAGE ?? 32;
  const uniformBuffer2 = device2.createBuffer({
    label: "preview:uniform-buffer",
    size: uniformSize,
    usage: uniformUsage | copyDstUsage
  });
  const colorBuffers = {
    c1: device2.createBuffer({ label: "preview:color-buffer-1", size: 16, usage: uniformUsage | copyDstUsage }),
    c2: device2.createBuffer({ label: "preview:color-buffer-2", size: 16, usage: uniformUsage | copyDstUsage }),
    c3: device2.createBuffer({ label: "preview:color-buffer-3", size: 16, usage: uniformUsage | copyDstUsage })
  };
  const styleParamBuffer = device2.createBuffer({
    label: "preview:style-params",
    size: STYLE_PARAM_CAPACITY * 4,
    usage: storageUsage | copyDstUsage
  });
  const styleParamCache = new Float32Array(STYLE_PARAM_CAPACITY);
  const syncStyleParams = (values) => {
    let changed = false;
    const source = Array.isArray(values) ? values : [];
    const limit = Math.min(source.length, STYLE_PARAM_CAPACITY);
    for (let i = 0; i < STYLE_PARAM_CAPACITY; i += 1) {
      const next = i < limit ? Number(source[i]) || 0 : 0;
      if (styleParamCache[i] !== next) {
        styleParamCache[i] = next;
        changed = true;
      }
    }
    if (changed) {
      device2.queue.writeBuffer(styleParamBuffer, 0, styleParamCache.buffer);
    }
  };
  const bindGroup = device2.createBindGroup({
    label: "preview:bind-group-main",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer2 } },
      { binding: 1, resource: { buffer: colorBuffers.c1 } },
      { binding: 2, resource: { buffer: colorBuffers.c2 } },
      { binding: 3, resource: { buffer: colorBuffers.c3 } },
      { binding: 4, resource: { buffer: styleParamBuffer } }
    ]
  });
  let current = null;
  let lastCameraNonce = null;
  let lastGradientSignature = null;
  let validationFrameCounter = 0;
  let lastValidGeometry = null;
  const pointer = {
    active: false,
    mode: "orbit",
    lastX: 0,
    lastY: 0,
    // For arcball mode keep a running last position
    arcLastX: 0,
    arcLastY: 0,
    arcStartQuat: null,
    arcPrevQuat: null,
    arcInertiaAxis: null,
    arcInertiaSpeed: 0,
    lastMoveTs: null,
    arcHit: null,
    arcHitNormal: null
  };
  const getHostController = () => window.__pf_webgpu_camera_controller;
  const requireHostController = () => {
    const c = getHostController();
    if (!c || !c.helpers) {
      throw new Error("[WebGPU Preview] Host CameraController with helpers is required for standalone preview");
    }
    return c;
  };
  const requireHostHelper = (name) => {
    const c = requireHostController();
    const fn = c.helpers[name];
    if (typeof fn !== "function") {
      throw new Error(`[WebGPU Preview] Required host helper '${name}' is missing`);
    }
    return fn;
  };
  const hostWorldRayFromCanvas = (rig, canvasEl, x, y) => {
    return requireHostHelper("worldRayFromCanvas")(rig, canvasEl, x, y);
  };
  const hostIntersectRayZPlane = (ray, z) => {
    return requireHostHelper("intersectRayZPlane")(ray, z);
  };
  const hostIntersectRayCylinder = (ray, radius, minZ, maxZ) => {
    return requireHostHelper("intersectRayCylinder")(ray, radius, minZ, maxZ);
  };
  const hostBuildCameraRig = (paddingHint, paddedHalfWidth, paddedHalfHeight) => {
    return requireHostHelper("buildCameraRig")(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
  };
  const hostQuaternionFromAxisAngle = (axis, angle) => {
    return requireHostHelper("quaternionFromAxisAngle")(axis, angle);
  };
  const hostMultiplyQuaternions = (a, b) => {
    return requireHostHelper("multiplyQuaternions")(a, b);
  };
  const hostInvertQuaternion = (q) => {
    return requireHostHelper("invertQuaternion")(q);
  };
  const hostAxisAngleFromQuaternion = (q) => {
    return requireHostHelper("axisAngleFromQuaternion")(q);
  };
  const hostBasisFromQuaternion = (q) => {
    return requireHostHelper("basisFromQuaternion")(q);
  };
  const hostCameraAxisToWorld2 = (basis, axis) => {
    return requireHostHelper("cameraAxisToWorld")(basis, axis);
  };
  const hostSyncAnglesFromBasis2 = (basis) => {
    return requireHostHelper("syncAnglesFromBasis")(basis);
  };
  try {
    self.__pf_webgpu_preview_debug = self.__pf_webgpu_preview_debug || {};
    self.__pf_webgpu_preview_debug.quaternionFromAxisAngle = (axis, angle) => {
      try {
        const hc = window.__pf_webgpu_camera_controller;
        const direct = hc && hc.helpers && typeof hc.helpers.quaternionFromAxisAngle === "function" ? hc.helpers.quaternionFromAxisAngle : null;
        try {
          console.error("[WebGPUPreview:debug] quaternionFromAxisAngle direct helper type:", typeof direct, !!direct);
        } catch (e) {
        }
        if (direct) {
          try {
            return direct(axis, angle);
          } catch (e) {
          }
        }
      } catch (e) {
        try {
          console.error("[WebGPUPreview:debug] quaternionFromAxisAngle host helper check failed", e);
        } catch (err) {
        }
      }
      return hostQuaternionFromAxisAngle(axis, angle);
    };
    try {
      const hc = window.__pf_webgpu_camera_controller;
      if (hc && hc.helpers && typeof hc.helpers.quaternionFromAxisAngle === "function") {
        try {
          hc.helpers.quaternionFromAxisAngle([0, 0, 1], 0);
        } catch (e) {
        }
      }
    } catch (e) {
    }
  } catch (err) {
  }
  const hostClampZoomValue = (v) => {
    try {
      const c = getHostController();
      if (c?.helpers && typeof c.helpers.clampZoomValue === "function") {
        return c.helpers.clampZoomValue(v);
      }
    } catch (err) {
    }
    return clampNumber(v, state.zoom);
  };
  const arcballDelta2 = (x0, y0, x1, y1, w, h, radius = 1) => arcballDelta(x0, y0, x1, y1, w, h, radius);
  const markInteraction = () => {
    state.interacting = true;
    state.lastInteraction = performance.now();
    state.cameraDirty = true;
    try {
      const c = window.__pf_webgpu_camera_controller;
      if (c && typeof c.markInteraction === "function") {
        c.markInteraction(true);
      }
    } catch (err) {
    }
  };
  const applyCameraPayload = (payload, force) => {
    try {
      const c = window.__pf_webgpu_camera_controller;
      if (c && typeof c.setPayload === "function") {
        c.setPayload(payload, { force });
      }
    } catch (err) {
    }
    return;
  };
  const updateAutoButton = () => {
    const btn = document.getElementById("wgpu-toggle-autorotate");
    if (btn) {
      btn.textContent = state.autoRotate ? "Auto" : "Manual";
      btn.setAttribute("data-state", state.autoRotate ? "on" : "off");
    }
  };
  const updateProjectionButton = () => {
    const btn = document.getElementById("wgpu-toggle-projection");
    if (btn) {
      const label = state.projectionMode === "perspective" ? "Persp" : "Ortho";
      btn.textContent = label;
      btn.setAttribute("data-state", state.projectionMode);
    }
  };
  const updateDebugButton = () => {
    const btn = document.getElementById("wgpu-toggle-debug");
    if (btn) {
      btn.textContent = state.debugOverlay ? "Debug*" : "Debug";
      btn.setAttribute("data-state", state.debugOverlay ? "on" : "off");
    }
  };
  const updateGridButton = () => {
    const btn = document.getElementById("wgpu-toggle-grid");
    if (btn) {
      btn.textContent = state.showGrid ? "Grid*" : "Grid";
      btn.setAttribute("data-state", state.showGrid ? "on" : "off");
    }
  };
  const updateArcballButton = () => {
    const btn = document.getElementById("wgpu-toggle-arcball");
    if (btn) {
      btn.textContent = state.useArcball ? "Arc*" : "Arc";
      btn.setAttribute("data-state", state.useArcball ? "on" : "off");
    }
  };
  const buildCameraRig2 = (paddingHint, paddedHalfWidth, paddedHalfHeight) => {
    const aspect = Math.max(state.canvasAspect || 1, 1e-3);
    const radius = Math.max(state.sceneRadius, 1);
    const radiusPadded = Math.max(radius * paddingHint, 1);
    const zoom = Math.max(state.zoom, 1e-3);
    const rawTarget = [state.panX, state.panY, 0];
    const targetForPitch = (pitch) => {
      const nearVertical = Math.abs(Math.abs(pitch) - Math.PI * 0.5) < 0.02;
      if (!nearVertical) {
        return rawTarget;
      }
      const panMagnitude = Math.hypot(rawTarget[0], rawTarget[1]);
      const cap = radius * 0.3;
      if (panMagnitude <= cap || panMagnitude <= 1e-3) {
        return rawTarget;
      }
      const scale = cap / panMagnitude;
      return [rawTarget[0] * scale, rawTarget[1] * scale, rawTarget[2]];
    };
    let rotXLocal = sanitizePitch(state.rotX);
    const rotYLocal = state.rotY;
    const rotZLocal = state.rotZ || 0;
    let viewProjection = null;
    let finalRig = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const localTarget = targetForPitch(rotXLocal);
      const paddedHalfWidthLocal = paddedHalfWidth !== void 0 ? Math.max(paddedHalfWidth, 1) : radiusPadded;
      const paddedHalfHeightLocal = paddedHalfHeight !== void 0 ? Math.max(paddedHalfHeight, 1) : radiusPadded;
      let distance = radiusPadded * CAMERA_DISTANCE_FALLOFF2 / zoom;
      let near = CAMERA_NEAR_EPS2;
      let far = Math.max(near + radiusPadded * 6, distance + radiusPadded * 6);
      const fov = BASE_FOV2;
      let projection;
      if (state.projectionMode === "perspective") {
        const halfFov = Math.max(fov * 0.5, 1e-4);
        const halfFovX = Math.atan(Math.tan(halfFov) * aspect);
        const dV = paddedHalfHeightLocal / Math.max(Math.tan(halfFov), 1e-3);
        const dH = paddedHalfWidthLocal / Math.max(Math.tan(halfFovX), 1e-3);
        distance = Math.max(dV, dH) / zoom;
        near = Math.max(distance * 0.05, CAMERA_NEAR_EPS2);
        far = Math.max(distance + radiusPadded * 8, near + 1);
        projection = mat4PerspectiveFovLH(fov, aspect, near, far);
      } else {
        const paddedHeightValue = Math.max(paddedHalfHeightLocal, 1);
        const paddedWidthValue = Math.max(paddedHalfWidthLocal, 1);
        const limitingHalfHeight = Math.max(paddedHeightValue, paddedWidthValue / aspect);
        const orthoHalfHeight = limitingHalfHeight / zoom;
        const orthoHalfWidth = orthoHalfHeight * aspect;
        projection = mat4OrthoLH(
          -orthoHalfWidth,
          orthoHalfWidth,
          -orthoHalfHeight,
          orthoHalfHeight,
          near,
          far
        );
      }
      const basis = resolveActiveBasis(state);
      const eye = vec3Subtract(localTarget, vec3Scale3(basis.forward, distance));
      const view = viewMatrixFromBasis(basis, eye);
      viewProjection = mat4Multiply(projection, view);
      const vpFinite = matrixIsFinite(viewProjection);
      if (!vpFinite) {
        console.warn("[PotFoundry][WebGPU] viewProjection invalid", {
          attempt,
          rotXLocal,
          rotYLocal,
          rotZLocal,
          distance,
          near,
          far
        });
      }
      if (vpFinite) {
        finalRig = { eye, viewProjection, near, far, fov, mode: state.projectionMode, basis };
        break;
      }
      const nudge = 1e-3 * (attempt + 1);
      rotXLocal = rotXLocal + (rotXLocal >= 0 ? -nudge : nudge);
    }
    if (!finalRig) {
      const cosPitch = Math.cos(state.rotX * 0.999);
      const sinPitch = Math.sin(state.rotX * 0.999);
      const cosYaw = Math.cos(state.rotY);
      const sinYaw = Math.sin(state.rotY);
      const forward = vec3Normalize2([sinYaw * cosPitch, -cosYaw * cosPitch, -sinPitch]);
      const distance = radiusPadded * CAMERA_DISTANCE_FALLOFF2;
      const near = CAMERA_NEAR_EPS2;
      const far = Math.max(near + radiusPadded * 6, distance + radiusPadded * 6);
      const fov = BASE_FOV2;
      const projection = state.projectionMode === "perspective" ? mat4PerspectiveFovLH(fov, aspect, near, far) : mat4OrthoLH(-radiusPadded, radiusPadded, -radiusPadded, radiusPadded, near, far);
      const fallbackTarget = targetForPitch(state.rotX * 0.999);
      const basis = buildCameraBasis2(forward);
      const eye = vec3Subtract(fallbackTarget, vec3Scale3(basis.forward, distance));
      const view = viewMatrixFromBasis(basis, eye);
      finalRig = { eye, viewProjection: mat4Multiply(projection, view), near, far, fov, mode: state.projectionMode, basis };
    }
    return finalRig;
  };
  let lastRigSignaturePreview = null;
  let lastRigCachedPreview = null;
  const computeRigSignaturePreview = (paddingHint, phw, phh) => {
    const rotHash = `${state.rotX}_${state.rotY}`;
    const mode = state.projectionMode || "ortho";
    const parts = [rotHash, `${state.zoom}`, `${state.panX}`, `${state.panY}`, `${mode}`, `${paddingHint}`, `${phw ?? ""}`, `${phh ?? ""}`, `${state.canvasAspect}`];
    return parts.join("|");
  };
  const getCachedRigPreview = (paddingHint, phw, phh) => {
    const sig = computeRigSignaturePreview(paddingHint, phw, phh);
    if (sig === lastRigSignaturePreview && lastRigCachedPreview) return lastRigCachedPreview;
    const rig = hostBuildCameraRig(paddingHint, phw, phh);
    lastRigSignaturePreview = sig;
    lastRigCachedPreview = rig;
    return rig;
  };
  const handleCameraCommand = (raw) => {
    if (raw === null || raw === void 0) {
      return;
    }
    let payload = null;
    if (typeof raw === "string") {
      try {
        payload = JSON.parse(raw);
      } catch (err) {
        console.warn("WebGPU camera payload parse failed", err);
        return;
      }
    } else if (typeof raw === "object") {
      payload = raw;
    }
    if (!payload) {
      return;
    }
    const request = typeof payload.request === "string" ? payload.request : null;
    if (request === "state") {
      emitCameraState(true);
      return;
    }
    let cameraMutated = false;
    const preset = typeof payload.preset === "string" ? payload.preset : null;
    if (preset) {
      applyViewPreset(state, preset);
      if (preset === "fit") {
        const height2 = clampNumber(current?.H ?? initialParams?.H ?? 120, 120);
        const safeHeight = Math.max(Math.abs(height2), 1);
        const radiusTop = clampNumber(current?.Rt ?? initialParams?.Rt ?? 70, 70);
        const radiusBottom = clampNumber(current?.Rb ?? initialParams?.Rb ?? 45, 45);
        const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
        const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
        const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
        state.sceneRadius = computedMaxWithHeight;
        state.cameraDirty = true;
      }
      cameraMutated = true;
    } else if (typeof payload.action === "string") {
      const normalized = payload.action.toLowerCase();
      const mapped = normalized === "reset" || normalized === "fit" ? "fit" : normalized === "isometric" ? "iso" : normalized;
      if (mapped === "top" || mapped === "front" || mapped === "right" || mapped === "iso" || mapped === "fit") {
        applyViewPreset(state, mapped);
        if (mapped === "fit") {
          const height2 = clampNumber(current?.H ?? initialParams?.H ?? 120, 120);
          const safeHeight = Math.max(Math.abs(height2), 1);
          const radiusTop = clampNumber(current?.Rt ?? initialParams?.Rt ?? 70, 70);
          const radiusBottom = clampNumber(current?.Rb ?? initialParams?.Rb ?? 45, 45);
          const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
          const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
          const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
          state.sceneRadius = computedMaxWithHeight;
          state.cameraDirty = true;
        }
        cameraMutated = true;
      }
    }
    const patch = {};
    let patchApplied = false;
    if (typeof payload.rotX === "number") {
      patch.rotX = sanitizePitch(payload.rotX);
      patchApplied = true;
    }
    if (typeof payload.rotZ === "number") {
      patch.rotZ = payload.rotZ;
      patchApplied = true;
    }
    if (typeof payload.rotY === "number") {
      patch.rotY = payload.rotY;
      patchApplied = true;
    }
    if (typeof payload.zoom === "number") {
      patch.zoom = payload.zoom;
      patchApplied = true;
    }
    if (typeof payload.panX === "number") {
      patch.panX = payload.panX;
      patchApplied = true;
    }
    if (typeof payload.panY === "number") {
      patch.panY = payload.panY;
      patchApplied = true;
    }
    if (patchApplied) {
      applyCameraPayload(patch, true);
      cameraMutated = true;
    }
    if (typeof payload.autoRotate === "boolean") {
      state.autoRotate = payload.autoRotate;
      updateAutoButton();
      state.cameraDirty = true;
      cameraMutated = true;
    }
    if (typeof payload.projection === "string") {
      const nextMode = payload.projection === "perspective" ? "perspective" : "ortho";
      if (state.projectionMode !== nextMode) {
        state.projectionMode = nextMode;
        updateProjectionButton();
        state.cameraDirty = true;
        cameraMutated = true;
      }
    }
    if (cameraMutated) {
      markInteraction();
      try {
        const rev = state.recentInertia;
        if (rev) {
          emitDiagnostic("preview:inertia", rev);
          try {
            delete state.recentInertia;
          } catch (e) {
          }
        }
      } catch (e) {
      }
      if (!state.autoRotate) requestCameraEmitWhenStatic();
    }
  };
  const releasePointer = () => {
    pointer.active = false;
  };
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    pointer.active = true;
    pointer.mode = event.button === 2 || event.altKey || event.metaKey || event.ctrlKey ? "pan" : "orbit";
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    state.autoRotate = false;
    updateAutoButton();
    markInteraction();
    const initialBasis = resolveActiveBasis(state);
    state.displayCamRight = [...initialBasis.right];
    state.displayCamUp = [...initialBasis.up];
    state.displayCamForward = [...initialBasis.forward];
    state.displayRotX = state.rotX;
    state.displayRotY = state.rotY;
    primeOrbitFromAngles(state, state.displayRotX ?? state.rotX, state.displayRotY ?? state.rotY);
    pointer.arcLastX = event.clientX;
    pointer.arcLastY = event.clientY;
    try {
      pointer.arcStartQuat = (state.displayCamQuat ?? state.camQuat) || hostQuaternionFromAxisAngle([0, 0, 1], 0);
    } catch (err) {
      pointer.arcStartQuat = (state.displayCamQuat ?? state.camQuat) || null;
    }
    pointer.arcPrevQuat = pointer.arcStartQuat;
    pointer.arcInertiaAxis = null;
    pointer.arcInertiaSpeed = 0;
    pointer.lastMoveTs = performance.now();
    try {
      const c = getHostController();
      if (c && c.pointer) {
        if (c.pointer.arcStartQuat) pointer.arcStartQuat = c.pointer.arcStartQuat;
        if (c.pointer.arcHitNormal) pointer.arcHitNormal = c.pointer.arcHitNormal;
        if (c.pointer.arcHit) pointer.arcHit = c.pointer.arcHit;
      }
    } catch (err) {
    }
    try {
      if (state.useArcball) {
        const cfg = { ...initialParams, ...current ?? {} };
        const height2 = clampNumber(cfg.H, 120);
        const radiusTop = clampNumber(cfg.Rt, 70);
        const radiusBottom = clampNumber(cfg.Rb, 45);
        const safeHeight = Math.max(Math.abs(height2), 1);
        const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
        const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
        const halfHeight = Math.max(safeHeight / 2, 1);
        const halfWidth = Math.max(safeRadiusTop, safeRadiusBottom, 1);
        const rawPadding = typeof cfg.scenePadding === "number" ? clampNumber(cfg.scenePadding, CAMERA_PADDING2) : CAMERA_PADDING2;
        const paddingHint = sanitizePadding(rawPadding);
        const paddedHalfHeight = Math.max(1, halfHeight * paddingHint);
        const paddedHalfWidth = Math.max(1, halfWidth * paddingHint);
        const rig = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
        const ray = hostWorldRayFromCanvas(rig, canvas, event.clientX, event.clientY);
        const pivotZ = state.pivot?.[2] ?? 0;
        const cylinderHit = ray ? hostIntersectRayCylinder(ray, paddedHalfWidth, -paddedHalfHeight, paddedHalfHeight) ?? null : null;
        const planeHit = ray ? hostIntersectRayZPlane(ray, pivotZ) ?? null : null;
        const hit = cylinderHit ?? planeHit ?? null;
        if (hit) {
          state.panX = hit[0];
          state.panY = hit[1];
          state.pivot = [hit[0], hit[1], hit[2]];
          state.cameraDirty = true;
          pointer.arcHit = [hit[0], hit[1], hit[2]];
          if (cylinderHit) {
            const nx = hit[0];
            const ny = hit[1];
            const normLen = Math.hypot(nx, ny);
            pointer.arcHitNormal = normLen > 1e-6 ? [nx / normLen, ny / normLen, 0] : [0, 0, 1];
          } else {
            pointer.arcHitNormal = [0, 0, 1];
          }
        } else {
          pointer.arcHitNormal = null;
          pointer.arcHit = null;
        }
      }
    } catch (err) {
      pointer.arcHitNormal = null;
    }
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (err) {
      console.warn("setPointerCapture", err);
    }
  });
  const handlePointerRelease = () => {
    const arcballDrag = pointer.mode === "orbit" && state.cameraMode === "arcball";
    if (arcballDrag && pointer.arcInertiaAxis && Math.abs(pointer.arcInertiaSpeed) > 1e-5) {
      state.inertiaArcAxis = [pointer.arcInertiaAxis[0], pointer.arcInertiaAxis[1], pointer.arcInertiaAxis[2]];
      state.inertiaArcSpeed = pointer.arcInertiaSpeed * 0.35;
    } else if (arcballDrag) {
      state.inertiaArcAxis = null;
      state.inertiaArcSpeed = 0;
    }
    if (!arcballDrag) {
      state.inertiaArcAxis = null;
      state.inertiaArcSpeed = 0;
    }
    releasePointer();
    pointer.arcHitNormal = null;
    pointer.arcPrevQuat = null;
    pointer.lastMoveTs = null;
    pointer.arcInertiaAxis = null;
    pointer.arcInertiaSpeed = 0;
    markInteraction();
    if (!state.autoRotate && (state.displayCamForward || state.displayCamUp || state.displayCamRight)) {
      const prevRight = state.camRight ? [...state.camRight] : [1, 0, 0];
      const flipped = commitDisplayBasisToState(state);
      if (flipped) {
        try {
          const dot = vec3Dot2(prevRight, state.camRight);
          emitDiagnostic("camera:commit-basis-flip", { dot });
        } catch (err) {
        }
      }
      emitCameraState(true);
    }
    requestCameraEmitWhenStatic();
  };
  canvas.addEventListener("pointerup", handlePointerRelease);
  canvas.addEventListener("pointercancel", handlePointerRelease);
  window.addEventListener("pointerup", handlePointerRelease);
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer.active) {
      return;
    }
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    if (pointer.mode === "orbit") {
      if (event.shiftKey) {
        const factor = computePanFactor(state, canvas);
        state.panX += dx * factor;
        state.panY -= dy * factor;
        state.inertiaPanX = dx * factor * 0.45;
        state.inertiaPanY = -dy * factor * 0.45;
      } else if (state.useArcball) {
        const vw = canvas.clientWidth || Math.max(1, canvas.width || 1);
        const vh = canvas.clientHeight || Math.max(1, canvas.height || 1);
        const p0x = pointer.arcLastX;
        const p0y = pointer.arcLastY;
        const p1x = event.clientX;
        const p1y = event.clientY;
        pointer.arcLastX = p1x;
        pointer.arcLastY = p1y;
        const { axis: arcAxisCam, angle: arcAngle } = arcballDelta(p0x, p0y, p1x, p1y, vw, vh);
        const baseQuat = (pointer.arcStartQuat ?? (state.displayCamQuat ?? state.camQuat)) || hostQuaternionFromAxisAngle([0, 0, 1], 0);
        const startBasis = hostBasisFromQuaternion(baseQuat);
        const axisWorld = hostCameraAxisToWorld2(startBasis, arcAxisCam);
        let useAxis = axisWorld;
        try {
          if (pointer.arcHitNormal) {
            const n = pointer.arcHitNormal;
            const dot = axisWorld[0] * n[0] + axisWorld[1] * n[1] + axisWorld[2] * n[2];
            const proj = [axisWorld[0] - dot * n[0], axisWorld[1] - dot * n[1], axisWorld[2] - dot * n[2]];
            const len = Math.hypot(proj[0], proj[1], proj[2]);
            if (len > 1e-6) {
              useAxis = projectAxisToTangent(axisWorld, n);
            }
          }
        } catch (err) {
        }
        const deltaQuat = Math.abs(arcAngle) > 1e-6 ? hostQuaternionFromAxisAngle(useAxis, arcAngle) : null;
        const nextQuat = deltaQuat ? hostMultiplyQuaternions(deltaQuat, baseQuat) : baseQuat;
        const rotated = hostBasisFromQuaternion(nextQuat);
        state.displayCamRight = [...rotated.right];
        state.displayCamUp = [...rotated.up];
        state.displayCamForward = [...rotated.forward];
        state.displayCamQuat = [...nextQuat];
        const { rotX, rotY } = syncAnglesFromBasis({ right: rotated.right, up: rotated.up, forward: rotated.forward });
        state.displayRotX = rotX;
        state.displayRotY = rotY;
        primeOrbitFromAngles(state, rotX, rotY);
        try {
          const now = performance.now();
          const lastTs = pointer.lastMoveTs ?? now;
          const dtSec = Math.max(1e-3, (now - lastTs) / 1e3);
          pointer.lastMoveTs = now;
          if (pointer.arcPrevQuat) {
            const prevQuat = pointer.arcPrevQuat;
            const deltaFrame = hostMultiplyQuaternions(nextQuat, hostInvertQuaternion(prevQuat));
            const { axis: inertiaAxis, angle: inertiaAngle } = hostAxisAngleFromQuaternion(deltaFrame);
            if (inertiaAngle > 1e-5) {
              pointer.arcInertiaAxis = inertiaAxis;
              let rawSpeed = inertiaAngle / dtSec;
              const cap = Math.PI * 8 / 0.35;
              if (Math.abs(rawSpeed) > cap) rawSpeed = Math.sign(rawSpeed) * cap;
              pointer.arcInertiaSpeed = rawSpeed;
              try {
                state.recentInertia = { type: "arc_pointer", raw: rawSpeed, dt: dtSec, ts: Date.now(), axis: pointer.arcInertiaAxis };
              } catch (e) {
              }
            } else {
              pointer.arcInertiaAxis = null;
              pointer.arcInertiaSpeed = 0;
            }
          }
        } catch (err) {
        }
        pointer.arcPrevQuat = [...nextQuat];
      } else {
        const vw = canvas.clientWidth || Math.max(1, canvas.width || 1);
        const vh = canvas.clientHeight || Math.max(1, canvas.height || 1);
        applyDragToOrbit(state, dx, dy, vw, vh);
        const yawInertia = state.displayRotY - (state.rotY || 0);
        const pitchInertia = state.displayRotX - (state.rotX || 0);
        state.inertiaRotY = yawInertia * 0.35;
        state.inertiaRotX = pitchInertia * 0.35;
        const maxRot = Math.PI * 6;
        if (Math.abs(state.inertiaRotY) > maxRot) state.inertiaRotY = Math.sign(state.inertiaRotY) * maxRot;
        if (Math.abs(state.inertiaRotX) > maxRot) state.inertiaRotX = Math.sign(state.inertiaRotX) * maxRot;
        try {
          state.recentInertia = { type: "turntable", inertiaRotX: state.inertiaRotX, inertiaRotY: state.inertiaRotY, dt: 0, ts: Date.now() };
        } catch (e) {
        }
      }
    } else {
      const factor = computePanFactor(state, canvas);
      state.panX += dx * factor;
      state.panY -= dy * factor;
      state.inertiaPanX = dx * factor * 0.45;
      state.inertiaPanY = -dy * factor * 0.45;
      const maxPan = 1e3;
      if (Math.abs(state.inertiaPanX) > maxPan) state.inertiaPanX = Math.sign(state.inertiaPanX) * maxPan;
      if (Math.abs(state.inertiaPanY) > maxPan) state.inertiaPanY = Math.sign(state.inertiaPanY) * maxPan;
      try {
        state.recentInertia = { type: "pan", inertiaPanX: state.inertiaPanX, inertiaPanY: state.inertiaPanY, dt: 0, ts: Date.now() };
      } catch (e) {
      }
    }
    markInteraction();
    requestCameraEmitWhenStatic();
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const k = Math.exp(-event.deltaY * 1e-3);
      state.zoom = Math.min(4, Math.max(0.25, state.zoom * k));
      markInteraction();
    },
    { passive: false }
  );
  try {
    self["buildCameraRig"] = buildCameraRig2;
  } catch (err) {
    try {
      MessageManager_default.debug("preview:buildCameraRig", "buildCameraRig: failed to assign to self", { err: String(err) });
    } catch (e) {
    }
  }
  try {
    window["buildCameraRig"] = buildCameraRig2;
  } catch (err) {
    try {
      MessageManager_default.debug("preview:buildCameraRig", "buildCameraRig: failed to assign to window", { err: String(err) });
    } catch (e) {
    }
  }
  const controlsRoot = document.getElementById("wgpu-controls");
  if (controlsRoot) {
    controlsRoot.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const preset = target.dataset.wgpuView;
      if (preset) {
        applyViewPreset(state, preset);
        markInteraction();
        return;
      }
      const action = target.dataset.wgpuAction;
      if (action === "projection") {
        const cfg = { ...initialParams, ...current };
        const height2 = clampNumber(cfg.H, 120);
        const safeHeight = Math.max(Math.abs(height2), 1);
        const radiusTop = clampNumber(cfg.Rt ?? cfg.Rt, 70);
        const radiusBottom = clampNumber(cfg.Rb ?? cfg.Rb, 45);
        const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
        const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
        const rawPadding = typeof cfg.scenePadding === "number" ? clampNumber(cfg.scenePadding, CAMERA_PADDING2) : CAMERA_PADDING2;
        const paddingHint = sanitizePadding(rawPadding);
        const halfHeight = Math.max(safeHeight * 0.5, 1);
        const outerRadius = Math.max(safeRadiusTop, safeRadiusBottom);
        const halfWidth = Math.max(outerRadius, 1);
        const paddedHalfWidth = Math.max(1, halfWidth * paddingHint);
        const paddedHalfHeight = Math.max(1, halfHeight * paddingHint);
        const currentRig = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
        const nextMode = state.projectionMode === "ortho" ? "perspective" : "ortho";
        if (state.projectionMode === "perspective" && nextMode === "ortho") {
          const aspect = Math.max(state.canvasAspect || 1, 1e-3);
          const halfFovY = Math.max(BASE_FOV2 * 0.5, 1e-4);
          const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
          const targetVec = [state.panX, state.panY, 0];
          const distance = vec3Length2(vec3Subtract(currentRig.eye, targetVec));
          const halfHeightPers = distance * Math.tan(halfFovY);
          const halfWidthPers = distance * Math.tan(halfFovX);
          const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
          if (isHeightLimiting) {
            if (halfHeightPers > 1e-6) {
              const newZoom = Math.max(1e-3, paddedHalfHeight / halfHeightPers);
              state.zoom = Math.min(4, Math.max(0.25, newZoom));
            }
          } else {
            if (halfWidthPers > 1e-6) {
              const newZoom = Math.max(1e-3, paddedHalfWidth / halfWidthPers);
              state.zoom = Math.min(4, Math.max(0.25, newZoom));
            }
          }
          if (state.debugOverlay) {
            MessageManager_default.debug("preview:projection-mapping", "projection click mapping (persp -> ortho)", { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, distance, halfHeightPers, halfWidthPers, isHeightLimiting, zoom: state.zoom });
            try {
              emitDiagnostic("preview:proj-toggle:persp->ortho", { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, distance, halfHeightPers, halfWidthPers, isHeightLimiting, zoom: state.zoom });
            } catch (err) {
            }
          }
        } else if (state.projectionMode === "ortho" && nextMode === "perspective") {
          const aspect = Math.max(state.canvasAspect || 1, 1e-3);
          const halfFovY = Math.max(BASE_FOV2 * 0.5, 1e-4);
          const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
          const halfHeightOrtho = paddedHalfHeight / Math.max(state.zoom, 1e-3);
          const halfWidthOrtho = paddedHalfWidth / Math.max(state.zoom, 1e-3);
          const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
          const desiredDistance = isHeightLimiting ? halfHeightOrtho / Math.max(Math.tan(halfFovY), 1e-6) : halfWidthOrtho / Math.max(Math.tan(halfFovX), 1e-6);
          const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
          const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
          const baseDistanceForMapping = Math.max(dV, dH) * CAMERA_DISTANCE_FALLOFF2;
          let newZoom = Math.max(1e-3, baseDistanceForMapping / Math.max(desiredDistance, 1e-6));
          try {
            const prevProj = state.projectionMode;
            const prevZoom = state.zoom;
            const maxIter = 6;
            for (let it = 0; it < maxIter; it += 1) {
              state.projectionMode = "perspective";
              state.zoom = newZoom;
              const rigCheck = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
              const targetVec = [state.panX, state.panY, 0];
              const actualHalfHeight = vec3Length2(vec3Subtract(rigCheck.eye, targetVec)) * Math.tan(halfFovY);
              const actualHalfWidth = vec3Length2(vec3Subtract(rigCheck.eye, targetVec)) * Math.tan(halfFovX);
              const axisValue = isHeightLimiting ? actualHalfHeight : actualHalfWidth;
              const desiredAxis = isHeightLimiting ? halfHeightOrtho : halfWidthOrtho;
              if (axisValue <= 1e-6) break;
              const correction = Math.max(1e-6, desiredAxis / axisValue);
              if (Math.abs(1 - correction) < 1e-3) break;
              newZoom = newZoom * correction;
            }
            state.zoom = prevZoom;
            state.projectionMode = prevProj;
          } catch (err) {
          }
          state.zoom = Math.min(4, Math.max(0.25, newZoom));
          if (state.debugOverlay) {
            MessageManager_default.debug("preview:projection-mapping", "projection click mapping (ortho -> persp)", { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, halfHeightOrtho, halfWidthOrtho, dV, dH, baseDistanceForMapping, desiredDistance, zoom: state.zoom });
            try {
              emitDiagnostic("preview:proj-toggle:ortho->persp", { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, halfHeightOrtho, halfWidthOrtho, dV, dH, baseDistanceForMapping, desiredDistance, zoom: state.zoom });
            } catch (err) {
            }
          }
        }
        state.projectionMode = nextMode;
        updateProjectionButton();
        state.cameraDirty = true;
        markInteraction();
        return;
      }
      if (action === "arcball") {
        state.useArcball = !state.useArcball;
        updateArcballButton();
        state.cameraDirty = true;
        markInteraction();
        return;
      }
      if (action === "grid") {
        state.showGrid = !state.showGrid;
        updateGridButton();
        state.cameraDirty = true;
        return;
      }
      if (action === "debug") {
        state.debugOverlay = !state.debugOverlay;
        updateDebugButton();
        state.cameraDirty = true;
        return;
      }
      if (target.id === "wgpu-toggle-autorotate") {
        state.autoRotate = !state.autoRotate;
        updateAutoButton();
        markInteraction();
        if (!state.autoRotate && (state.displayCamForward || state.displayCamUp || state.displayCamRight)) {
          const prevRight = state.camRight ? [...state.camRight] : [1, 0, 0];
          const flipped = commitDisplayBasisToState(state);
          if (flipped) {
            try {
              const dot = vec3Dot2(prevRight, state.camRight);
              emitDiagnostic("camera:commit-basis-flip", { dot });
            } catch (err) {
            }
          }
          emitCameraState(true);
        }
        const tid = String(target.id);
        if (tid === "wgpu-toggle-arcball") {
          state.useArcball = !state.useArcball;
          updateArcballButton();
          state.cameraDirty = true;
          markInteraction();
        }
      }
    });
  }
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    switch (event.key) {
      case "0":
        applyViewPreset(state, "fit");
        markInteraction();
        break;
      case "1":
        applyViewPreset(state, "top");
        markInteraction();
        break;
      case "2":
        applyViewPreset(state, "front");
        markInteraction();
        break;
      case "3":
        applyViewPreset(state, "right");
        markInteraction();
        break;
      case "4":
        applyViewPreset(state, "iso");
        markInteraction();
        break;
      case " ":
        state.autoRotate = !state.autoRotate;
        updateAutoButton();
        markInteraction();
        event.preventDefault();
        break;
      case "f":
        state.debugFlatColor = !state.debugFlatColor;
        setStatus(state.debugFlatColor ? "WebGPU \u2022 flat debug ON" : "WebGPU \u2022 flat debug OFF");
        markInteraction();
        break;
      default:
        break;
    }
  });
  updateAutoButton();
  updateProjectionButton();
  updateDebugButton();
  updateGridButton();
  updateArcballButton();
  const uniform2 = buildUniformBlock(uniformSize);
  const updateAndDraw = (payload) => {
    let encoder = null;
    let textureView = null;
    let depthView = null;
    let shouldFrameLog = false;
    let shouldValidate = false;
    try {
      if (!pipeline) {
        return;
      }
      const hadPayload = Boolean(payload);
      let parsed = null;
      if (payload) {
        parsed = {};
        if (typeof payload === "string") {
          try {
            parsed = JSON.parse(payload);
          } catch (err) {
            console.warn("Failed to parse WebGPU payload", err);
          }
        } else {
          parsed = payload;
        }
        current = mergeParams(current, parsed);
      }
      if (!current) {
        return;
      }
      const cfg = { ...initialParams, ...current };
      if (typeof cfg.interactiveLod === "number") {
        const ratio = Math.min(
          Math.max(Number(cfg.interactiveLod) || DEFAULT_INTERACTIVE_LOD2, MIN_INTERACTIVE_LOD2),
          1
        );
        state.interactiveLodRatio = ratio;
      }
      if (typeof cfg.interactiveLodEnabled === "boolean") {
        state.interactiveLodEnabled = Boolean(cfg.interactiveLodEnabled);
        if (!state.interactiveLodEnabled) {
          state.recentParamUpdate = false;
        }
      }
      const now = performance.now();
      if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS && !window.__pf_webgpu_camera_controller?.focusTween) {
        state.interacting = false;
        try {
          const c = window.__pf_webgpu_camera_controller;
          if (c && typeof c.maybeApplyDeferredForceIfReady === "function") {
            c.maybeApplyDeferredForceIfReady(now);
          }
        } catch (err) {
        }
      }
      const paramNonce = typeof cfg.paramUpdateNonce === "number" ? cfg.paramUpdateNonce : null;
      const paramFlag = cfg.paramUpdate !== false;
      if (paramFlag && paramNonce !== null && paramNonce !== state.lastParamNonce) {
        state.lastParamNonce = paramNonce;
        state.lastParamUpdate = now;
        state.recentParamUpdate = state.interactiveLodEnabled;
      } else if (state.recentParamUpdate && now - state.lastParamUpdate > PARAM_UPDATE_TIMEOUT_MS2) {
        state.recentParamUpdate = false;
      }
      const rawCameraNonce = parsed && typeof parsed.cameraNonce === "number" ? parsed.cameraNonce : null;
      const forceCamera = rawCameraNonce !== null && rawCameraNonce !== lastCameraNonce;
      if (forceCamera) {
        lastCameraNonce = rawCameraNonce;
      }
      if (parsed) {
        const p = parsed;
        const patch = {};
        let patchApplied = false;
        if (typeof p.rotX === "number") {
          patch.rotX = p.rotX;
          patchApplied = true;
        }
        if (typeof p.rotY === "number") {
          patch.rotY = p.rotY;
          patchApplied = true;
        }
        if (typeof p.zoom === "number") {
          patch.zoom = p.zoom;
          patchApplied = true;
        }
        if (typeof p.panX === "number") {
          patch.panX = p.panX;
          patchApplied = true;
        }
        if (typeof p.panY === "number") {
          patch.panY = p.panY;
          patchApplied = true;
        }
        const isForce = Boolean(p.force) || forceCamera || false;
        if (patchApplied) {
          applyCameraPayload(patch, isForce);
        }
      }
      const f32 = uniform2;
      const height2 = clampNumber(cfg.H, 120);
      const radiusTop = clampNumber(cfg.Rt, 70);
      const radiusBottom = clampNumber(cfg.Rb, 45);
      const safeHeight = Math.max(Math.abs(height2), 1);
      const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
      const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
      const styleIdRaw = typeof cfg.styleId === "number" ? Math.trunc(cfg.styleId) : typeof current.styleId === "number" ? Math.trunc(Number(current.styleId)) : 0;
      const styleId = styleIdRaw < 0 ? 0 : styleIdRaw;
      f32[0] = height2;
      f32[1] = radiusTop;
      f32[2] = radiusBottom;
      f32[3] = clampNumber(cfg.expn, 1);
      f32[4] = clampNumber(cfg.spin_turns, 0);
      f32[5] = clampNumber(cfg.spin_phase, 0);
      f32[6] = clampNumber(cfg.spin_curve, 1);
      f32[7] = styleId;
      f32[8] = clampNumber(cfg.sf_m_base, 6);
      f32[9] = clampNumber(cfg.sf_m_top ?? cfg.sf_m_base, 10);
      f32[10] = clampNumber(cfg.sf_n1, 0.35);
      f32[11] = clampNumber(cfg.sf_n2, 0.8);
      f32[12] = clampNumber(cfg.sf_n3, 0.8);
      const drainRadiusRaw = cfg.r_drain ?? cfg.drain ?? cfg.drainRadius ?? cfg?.drain_radius ?? current.r_drain;
      const drainRadius = clampNumber(drainRadiusRaw, 10);
      f32[DRAIN_RADIUS_OFFSET2] = Math.max(Math.abs(drainRadius), 0.5);
      current.r_drain = drainRadius;
      current.styleId = styleId;
      syncStyleParams(cfg.styleParams ?? current.styleParams);
      current.styleParams = cfg.styleParams;
      const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
      const sceneRadiusProvided = cfg.sceneRadius !== void 0 && cfg.sceneRadius !== null;
      if (sceneRadiusProvided) {
        const sceneRadiusHint = clampNumber(cfg.sceneRadius, computedMaxWithHeight);
        const nextSceneRadius = Math.max(Math.abs(sceneRadiusHint), computedMaxWithHeight, 1);
        if (Math.abs(nextSceneRadius - state.sceneRadius) > CAMERA_EPSILON2) {
          state.sceneRadius = nextSceneRadius;
          state.cameraDirty = true;
        }
      }
      const rawPadding = typeof cfg.scenePadding === "number" ? clampNumber(cfg.scenePadding, CAMERA_PADDING2) : current && typeof current.scenePadding === "number" ? clampNumber(Number(current.scenePadding), CAMERA_PADDING2) : CAMERA_PADDING2;
      const paddingHint = sanitizePadding(rawPadding);
      const halfHeight = Math.max(safeHeight / 2, 1);
      const halfWidth = Math.max(safeRadiusTop, safeRadiusBottom, 1);
      const paddedHalfHeight = halfHeight * paddingHint;
      const paddedHalfWidth = halfWidth * paddingHint;
      const cameraRig = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
      try {
        const nearVertical = Math.abs(Math.abs(state.rotX) - Math.PI * 0.5) < 0.02;
        if (nearVertical && (pointer.active || state.interacting)) {
          canvas.style.outline = "3px solid rgba(255,0,0,0.9)";
        } else {
          canvas.style.outline = "";
        }
      } catch (err) {
      }
      try {
        const nearVertical = Math.abs(Math.abs(state.rotX) - Math.PI * 0.5) < 0.02;
        const nowAuto = performance.now();
        if (nearVertical && (pointer.active || state.interacting) && nowAuto - lastAutoDiagTime > 150) {
          lastAutoDiagTime = nowAuto;
          const ok = drawFlatDiagnostic("auto-near-vertical");
          try {
            if (__wgpu_debug_el) {
              const prev = __wgpu_debug_el.textContent || "";
              __wgpu_debug_el.textContent = `AUTO_DIAG nearVertical=${nearVertical} ok=${ok} rotX=${state.rotX.toFixed(6)}
` + prev;
              __wgpu_debug_el.style.display = "block";
            }
          } catch (err) {
          }
          console.info("[WebGPU][AutoDiag] near-vertical diagnostic", { nearVertical, ok });
        }
      } catch (err) {
      }
      const debugActive = Boolean(cfg.debug) || state.debugOverlay;
      const lastManualDiagTime = globalThis.__pf_lastManualDiagTime || 0;
      const nowDiag = performance.now();
      if ((pointer.active || state.interacting) && nowDiag - lastManualDiagTime > 200) {
        try {
          const rotZLocal = state.rotZ || 0;
          const rotMatDiag = makeRotationMatrixFromEuler(state.rotX, state.rotY, rotZLocal);
          const forwardDiag = vec3Normalize2(applyRotationToVector(rotMatDiag, [0, 0, 1]));
          const upDiag = applyRotationToVector(rotMatDiag, [0, 1, 0]);
          const vpFiniteDiag = matrixIsFinite(cameraRig.viewProjection);
          console.info("[WebGPU][ManualDiag]", {
            rotX: Number(state.rotX.toFixed(6)),
            rotY: Number(state.rotY.toFixed(6)),
            rotZ: Number(rotZLocal.toFixed(6)),
            forward: forwardDiag.map((v) => Number(v.toFixed(6))),
            up: upDiag.map((v) => Number(v.toFixed(6))),
            eye: cameraRig.eye.map((v) => Number(v.toFixed(3))),
            vpFinite: vpFiniteDiag
          });
        } catch (err) {
        }
        globalThis.__pf_lastManualDiagTime = nowDiag;
      }
      if (!matrixIsFinite(cameraRig.viewProjection)) {
        console.error("WebGPU \u2022 camera matrix invalid; skipping draw", {
          rotX: state.rotX,
          rotY: state.rotY,
          rotZ: state.rotZ || 0,
          cameraRig
        });
        if (!drawFlatDiagnostic("camera-matrix-invalid")) {
          setStatus("WebGPU \u2022 camera matrix invalid");
        }
        state.cameraDirty = true;
        return;
      }
      const baseNTheta = sanitizeInt(cfg.nTheta ?? cfg.n_theta, 64, 3);
      const baseNZ = sanitizeInt(cfg.nZ ?? cfg.n_z, 32, 2);
      const baseInner = sanitizeInt(cfg.innerSegments ?? cfg.inner_segments ?? baseNZ, baseNZ, 1);
      const defaultBottom = Math.max(2, Math.min(24, Math.ceil(baseNZ * 0.25)));
      const defaultRim = Math.max(1, Math.min(8, Math.ceil(baseNZ * 0.1)));
      const baseBottom = sanitizeInt(
        cfg.bottom_rings ?? cfg.bottomRings ?? defaultBottom,
        defaultBottom,
        2
      );
      const baseRim = sanitizeInt(cfg.rim_rings ?? cfg.rimRings ?? defaultRim, defaultRim, 1);
      const lodActive = false;
      const nTheta = Math.max(MIN_THETA_STATIC2, baseNTheta);
      const nZ = Math.max(MIN_Z_STATIC2, baseNZ);
      const innerSeg = Math.max(1, baseInner);
      const bottomRings = Math.max(2, Math.min(24, baseBottom));
      const rimRings = Math.max(1, Math.min(8, baseRim));
      f32[16] = nTheta;
      f32[17] = nZ;
      f32[18] = debugActive ? 1 : 0;
      f32[19] = state.rotX;
      f32[20] = state.rotY;
      f32[21] = state.zoom;
      f32[22] = clampNumber(cfg.ambient, 0.5);
      f32[23] = clampNumber(cfg.diffuse, 1);
      f32[24] = clampNumber(cfg.fresnel, 0.25);
      f32[25] = clampNumber(cfg.t_wall, 3);
      f32[26] = clampNumber(cfg.t_bottom, 3);
      f32[27] = innerSeg;
      f32[28] = bottomRings;
      f32[29] = state.panX;
      f32[30] = rimRings;
      f32[31] = state.panY;
      f32[32] = state.canvasAspect || 1;
      f32[33] = state.sceneRadius;
      f32[34] = paddingHint;
      f32[35] = cameraRig.near;
      f32[CAMERA_EYE_OFFSET2 + 0] = cameraRig.eye[0];
      f32[CAMERA_EYE_OFFSET2 + 1] = cameraRig.eye[1];
      f32[CAMERA_EYE_OFFSET2 + 2] = cameraRig.eye[2];
      f32[CAMERA_MODE_OFFSET2] = cameraRig.mode === "perspective" ? 1 : 0;
      writeVec3(f32, CAMERA_RIGHT_OFFSET2, cameraRig.basis.right);
      f32[CAMERA_RIGHT_OFFSET2 + 3] = 0;
      writeVec3(f32, CAMERA_UP_OFFSET2, cameraRig.basis.up);
      f32[CAMERA_UP_OFFSET2 + 3] = 0;
      writeVec3(f32, CAMERA_FORWARD_OFFSET2, cameraRig.basis.forward);
      f32[CAMERA_FORWARD_OFFSET2 + 3] = 0;
      f32[GRID_FLAG_OFFSET2] = state.showGrid ? 1 : 0;
      for (let i = 0; i < 16; i += 1) {
        f32[VP_MATRIX_OFFSET2 + i] = cameraRig.viewProjection[i];
      }
      try {
        const halfFovY = cameraRig.fov * 0.5;
        const halfFovX = Math.atan(Math.tan(halfFovY) * (state.canvasAspect || 1));
        const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
        const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
        emitDiagnostic("webgpu:camera-fit", {
          halfWidth: paddedHalfWidth,
          halfHeight: paddedHalfHeight,
          dV,
          dH,
          chosenDistance: Math.hypot(cameraRig.eye[0], cameraRig.eye[1], cameraRig.eye[2]),
          fov: cameraRig.fov,
          aspect: state.canvasAspect,
          near: cameraRig.near,
          far: cameraRig.far
        });
      } catch (err) {
      }
      try {
        const mulMat4Vec42 = (m, x, y, z) => {
          const cx = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
          const cy = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
          const cz = m[2] * x + m[6] * y + m[10] * z + m[14] * 1;
          const cw = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
          return { x: cx, y: cy, z: cz, w: cw };
        };
        const corners = [
          [paddedHalfWidth, paddedHalfWidth, paddedHalfHeight],
          [-paddedHalfWidth, paddedHalfWidth, paddedHalfHeight],
          [paddedHalfWidth, -paddedHalfWidth, paddedHalfHeight],
          [-paddedHalfWidth, -paddedHalfWidth, paddedHalfHeight],
          [paddedHalfWidth, paddedHalfWidth, -paddedHalfHeight],
          [-paddedHalfWidth, paddedHalfWidth, -paddedHalfHeight],
          [paddedHalfWidth, -paddedHalfWidth, -paddedHalfHeight],
          [-paddedHalfWidth, -paddedHalfWidth, -paddedHalfHeight]
        ];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const c of corners) {
          const clip = mulMat4Vec42(cameraRig.viewProjection, c[0], c[1], c[2]);
          if (!Number.isFinite(clip.w) || Math.abs(clip.w) < 1e-6) continue;
          const ndcX = clip.x / clip.w;
          const ndcY = clip.y / clip.w;
          minX = Math.min(minX, ndcX);
          maxX = Math.max(maxX, ndcX);
          minY = Math.min(minY, ndcY);
          maxY = Math.max(maxY, ndcY);
        }
        emitDiagnostic("webgpu:camera-fit-ndc", { ndc: { minX, maxX, minY, maxY } });
        if (overlayCtx && debugActive && Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
          try {
            const canvasW = overlayCanvas?.width || 1;
            const canvasH = overlayCanvas?.height || 1;
            overlayCtx.clearRect(0, 0, canvasW, canvasH);
            const sx = (minX + 1) * 0.5 * canvasW;
            const ex = (maxX + 1) * 0.5 * canvasW;
            const sy = (1 - (maxY + 1) * 0.5) * canvasH;
            const ey = (1 - (minY + 1) * 0.5) * canvasH;
            const wPx = Math.max(1, Math.abs(ex - sx));
            const hPx = Math.max(1, Math.abs(ey - sy));
            overlayCtx.strokeStyle = "rgba(0,255,0,0.9)";
            overlayCtx.lineWidth = 2;
            overlayCtx.strokeRect(Math.min(sx, ex), Math.min(sy, ey), wPx, hPx);
            overlayCtx.fillStyle = "rgba(255,255,255,0.9)";
            overlayCtx.font = "12px monospace";
            overlayCtx.fillText(`ndc: minX=${minX.toFixed(2)} maxX=${maxX.toFixed(2)}`, 8, 14);
            overlayCtx.fillText(`ndc: minY=${minY.toFixed(2)} maxY=${maxY.toFixed(2)}`, 8, 30);
          } catch (err) {
          }
        }
      } catch (err) {
      }
      if (debugActive) {
        if (now - lastDebugOverlayUpdate >= DEBUG_THROTTLE_MS) {
          lastDebugOverlayUpdate = now;
          const __dbg = {
            H: height2,
            Rt: radiusTop,
            Rb: radiusBottom,
            sceneRadius: state.sceneRadius,
            nTheta,
            nZ,
            paramNonce,
            cam: {
              mode: cameraRig.mode,
              near: Number(cameraRig.near.toFixed(2)),
              far: Number(cameraRig.far.toFixed(2)),
              eye: cameraRig.eye.map((v) => Number(v.toFixed(2)))
            }
          };
          try {
            if (__wgpu_debug_el) {
              __wgpu_debug_el.style.display = "block";
              __wgpu_debug_el.textContent = JSON.stringify(__dbg, null, 2);
            }
          } catch (err) {
          }
        }
        if (now - lastVpLogTime >= DEBUG_THROTTLE_MS) {
          lastVpLogTime = now;
          try {
            const vpSlice = Array.from(
              f32.slice(VP_MATRIX_OFFSET2, VP_MATRIX_OFFSET2 + 16)
            ).map((value) => Number(value.toFixed(4)));
            MessageManager_default.debug("preview:vp-matrix", "WebGPU VP matrix", { debugFlag: f32[18], vp: vpSlice });
          } catch (err) {
          }
        }
      } else if (__wgpu_debug_el && !state.debugOverlay) {
        try {
          __wgpu_debug_el.style.display = "none";
        } catch (err) {
        }
      }
      const cellsOuter = nTheta * nZ;
      const cellsInner = nTheta * innerSeg;
      const cellsBottomTop = nTheta * bottomRings;
      const cellsBottomUnder = cellsBottomTop;
      const cellsRim = nTheta * rimRings;
      const totalCells = cellsOuter + cellsInner + cellsBottomTop + cellsBottomUnder + cellsRim;
      const totalVerts = totalCells * 6;
      if (debugActive) {
        MessageManager_default.debug("preview:geometry-counts", "geometry counts", {
          nTheta,
          nZ,
          innerSeg,
          bottomRings,
          rimRings,
          totalCells,
          totalVerts
        });
      }
      const desiredCounts = {
        nTheta,
        nZ,
        innerSeg,
        bottomRings,
        rimRings,
        totalVerts
      };
      let resolvedCounts = desiredCounts;
      let usingFallback = false;
      let invalidReason = null;
      if (!Number.isFinite(totalVerts) || totalVerts <= 0) {
        invalidReason = "invalid";
      } else if (totalVerts > MAX_VERTS) {
        invalidReason = "overflow";
      }
      if (invalidReason) {
        const statusBase = invalidReason === "overflow" ? "WebGPU \u2022 draw exceeds vertex index limit" : "WebGPU \u2022 invalid vertex count";
        const detail = {
          nTheta,
          nZ,
          innerSeg,
          bottomRings,
          rimRings,
          totalVerts,
          maxVerts: MAX_VERTS
        };
        console.warn(statusBase, detail);
        if (!lastValidGeometry) {
          if (now - lastInvalidStatusAt >= INVALID_STATUS_COOLDOWN_MS2) {
            setStatus(statusBase);
            lastInvalidStatusAt = now;
          }
          return;
        }
        resolvedCounts = lastValidGeometry;
        usingFallback = true;
        if (now - lastInvalidStatusAt >= INVALID_STATUS_COOLDOWN_MS2) {
          setStatus(`${statusBase} \u2022 showing last frame`);
          lastInvalidStatusAt = now;
        }
      } else {
        lastValidGeometry = desiredCounts;
      }
      if (usingFallback) {
        f32[16] = resolvedCounts.nTheta;
        f32[17] = resolvedCounts.nZ;
        f32[27] = resolvedCounts.innerSeg;
        f32[28] = resolvedCounts.bottomRings;
        f32[30] = resolvedCounts.rimRings;
      }
      current.nTheta = resolvedCounts.nTheta;
      current.nZ = resolvedCounts.nZ;
      current.innerSegments = resolvedCounts.innerSeg;
      current.bottom_rings = resolvedCounts.bottomRings;
      current.rim_rings = resolvedCounts.rimRings;
      current.t_wall = cfg.t_wall;
      current.t_bottom = cfg.t_bottom;
      current.rotX = state.rotX;
      current.rotY = state.rotY;
      current.zoom = state.zoom;
      current.panX = state.panX;
      current.panY = state.panY;
      current.cameraNonce = lastCameraNonce;
      current.scenePadding = paddingHint;
      current.projection = state.projectionMode;
      const drawVerts = resolvedCounts.totalVerts;
      const safeDrawVerts = Math.max(0, Math.min(MAX_VERTS, Math.floor(drawVerts)));
      if (!Number.isFinite(safeDrawVerts) || safeDrawVerts <= 0) {
        return;
      }
      totalDrawnVerts += safeDrawVerts;
      const uniformDirty = state.cameraDirty || state.recentParamUpdate || state.interacting || hadPayload || lodActive;
      const basisForward = state.displayCamForward ?? state.camForward;
      const basisUp = state.displayCamUp ?? state.camUp;
      const basisString = `${basisForward[0]}_${basisForward[1]}_${basisForward[2]}|${basisUp[0]}_${basisUp[1]}_${basisUp[2]}`;
      const geoSigPreview = `${f32[0]}_${f32[1]}_${f32[2]}_${f32[3]}_${f32[16]}_${f32[17]}_${f32[6]}_${f32[7]}_${f32[8]}`;
      const uniformSignaturePreview = `${state.rotX ?? 0}_${state.rotY ?? 0}_${state.zoom ?? 1}_${state.panX ?? 0}_${state.panY ?? 0}_${state.projectionMode}_${basisString}_${geoSigPreview}`;
      globalThis.__lastUniformSignaturePreview = globalThis.__lastUniformSignaturePreview ?? null;
      const lastUniformSignaturePreview = globalThis.__lastUniformSignaturePreview;
      if (uniformDirty && uniformSignaturePreview !== lastUniformSignaturePreview) {
        globalThis.__lastUniformSignaturePreview = uniformSignaturePreview;
        device2.queue.writeBuffer(uniformBuffer2, 0, uniform2.buffer);
      }
      const gradientSignature = JSON.stringify(cfg.gradient ?? null);
      if (gradientSignature !== lastGradientSignature) {
        writeGradient(device2, colorBuffers, cfg.gradient);
        lastGradientSignature = gradientSignature;
      }
      encoder = device2.createCommandEncoder({ label: "preview:frame-encoder" });
      textureView = null;
      const nowFrame = performance.now();
      shouldFrameLog = nowFrame - lastFrameLogTime > 200;
      if (shouldFrameLog) {
        lastFrameLogTime = nowFrame;
        try {
          console.info("[WebGPU][Frame] begin", {
            rotX: Number(state.rotX.toFixed(6)),
            panX: Number(state.panX.toFixed(3)),
            panY: Number(state.panY.toFixed(3)),
            wantFlat: Boolean(cfg.flatColor) || Boolean(state.debugFlatColor),
            flatReady: !!flatPipeline
          });
        } catch (err) {
        }
      }
      try {
        if (shouldFrameLog) console.info("[WebGPU][Frame] getCurrentTexture attempt");
        textureView = context.getCurrentTexture().createView({ label: "preview:swapchain-view" });
        if (shouldFrameLog) console.info("[WebGPU][Frame] getCurrentTexture OK");
      } catch (err) {
        console.warn("WebGPU \u2022 getCurrentTexture failed (attempt 1)", err);
        try {
          context.configure({ device: device2, format, alphaMode: "opaque" });
        } catch (cfgErr) {
          console.warn("WebGPU \u2022 context reconfigure failed", cfgErr);
        }
        try {
          if (shouldFrameLog) console.info("[WebGPU][Frame] getCurrentTexture attempt (after reconfigure)");
          textureView = context.getCurrentTexture().createView({ label: "preview:swapchain-view" });
          if (shouldFrameLog) console.info("[WebGPU][Frame] getCurrentTexture OK (after reconfigure)");
        } catch (err2) {
          console.warn("WebGPU \u2022 getCurrentTexture failed (attempt 2)", err2);
          drawFlatDiagnostic("swapchain-texture-failed");
          return;
        }
      }
      depthView = depth.createView({ label: "preview:depth-view" });
      validationFrameCounter += 1;
      shouldValidate = debugActive || validationFrameCounter % 60 === 0;
      if (shouldValidate) {
        device2.pushErrorScope("validation");
      }
      const passDesc = {
        label: "preview:main-pass",
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.05, g: 0.05, b: 0.07, a: 1 },
            loadOp: "clear",
            storeOp: "store"
          }
        ],
        depthStencilAttachment: {
          view: depthView,
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store"
        }
      };
      const pass = encoder.beginRenderPass(passDesc);
      const wantFlat = Boolean(cfg.flatColor) || Boolean(state.debugFlatColor);
      if (debugActive) {
        MessageManager_default.debug("preview:draw-intent", "draw intent", { safeDrawVerts, wantFlat, flatReady: !!flatPipeline });
      }
      if (wantFlat) {
        if (flatPipeline) {
          if (shouldFrameLog) console.info("[WebGPU][Frame] draw -> flatPipeline (in-pass)");
          pass.setPipeline(flatPipeline);
          pass.draw(3);
        } else {
          if (shouldFrameLog) console.info("[WebGPU][Frame] flat not ready -> draw main pipeline");
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(safeDrawVerts);
        }
      } else {
        if (shouldFrameLog) console.info("[WebGPU][Frame] draw -> main pipeline", { safeDrawVerts });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(safeDrawVerts);
      }
      totalDrawCalls += 1;
      pass.end();
      const cmdBuffer = encoder.finish({ label: "preview:frame-command-buffer" });
      device2.queue.submit([cmdBuffer]);
      frameCounter += 1;
      try {
        MessageManager_default.setFrameCounters({ frames: frameCounter, draws: totalDrawCalls, verts: totalDrawnVerts });
      } catch (err) {
      }
      try {
        if (axisCtx && state.showAxis) {
          drawAxisIndicator(axisCtx, cameraRig);
        } else if (axisCtx) {
          axisCtx.clearRect(0, 0, axisCtx.canvas.width, axisCtx.canvas.height);
        }
      } catch (err) {
      }
    } catch (err) {
      try {
        console.error("WebGPU \u2022 updateAndDraw threw", err);
      } catch (e) {
      }
      try {
        emitDiagnostic("webgpu:error", { reason: "updateAndDraw exception", error: String(err) });
      } catch (e) {
      }
      try {
        drawFlatDiagnostic("updateAndDraw-exception");
      } catch (e) {
      }
      state.cameraDirty = true;
      return;
    }
    if (shouldFrameLog) {
      console.info("[WebGPU][Frame] submit done");
    }
    if (shouldValidate) {
      device2.popErrorScope().then((error) => {
        if (error) {
          console.warn("WebGPU validation", error);
          const detail = typeof error === "string" ? error : error?.message ?? "validation error";
          setStatus(`WebGPU \u2022 ${detail}`);
        }
      }).catch(() => {
      });
    }
  };
  if (typeof initialParams.autoRotate === "boolean") {
    state.autoRotate = initialParams.autoRotate;
  }
  if (typeof initialParams.rotX === "number") {
    state.rotX = initialParams.rotX;
  }
  if (typeof initialParams.rotY === "number") {
    state.rotY = initialParams.rotY;
  }
  primeOrbitFromAngles(state, state.rotX, state.rotY);
  if (typeof initialParams.zoom === "number") {
    state.zoom = initialParams.zoom;
  }
  if (typeof initialParams.projection === "string") {
    const nextMode = initialParams.projection === "perspective" ? "perspective" : "ortho";
    state.projectionMode = nextMode;
    updateProjectionButton();
  }
  if (typeof initialParams.sceneRadius === "number") {
    const nextRadius = Math.max(
      Math.abs(clampNumber(initialParams.sceneRadius, state.sceneRadius)),
      1
    );
    if (Math.abs(nextRadius - state.sceneRadius) > CAMERA_EPSILON2) {
      const prev = state.sceneRadius;
      state.sceneRadius = nextRadius;
      try {
        MessageManager_default.info("preview:sceneRadius-applied", "sceneRadius applied", { prev, next: state.sceneRadius });
      } catch (err) {
      }
      state.cameraDirty = true;
    }
  }
  if (typeof initialParams.interactiveLod === "number") {
    state.interactiveLodRatio = Math.min(
      Math.max(
        Number(initialParams.interactiveLod) || DEFAULT_INTERACTIVE_LOD2,
        MIN_INTERACTIVE_LOD2
      ),
      1
    );
  }
  if (typeof initialParams.interactiveLodEnabled === "boolean") {
    state.interactiveLodEnabled = Boolean(initialParams.interactiveLodEnabled);
  }
  if (typeof initialParams.debug === "boolean") {
    state.debugOverlay = Boolean(initialParams.debug);
    updateDebugButton();
  }
  const bootPayload = { ...initialParams };
  current = mergeParams(current, bootPayload);
  updateAndDraw(current ?? {});
  let fpsFrames = 0;
  let fpsStart = performance.now();
  const frame = () => {
    if (!current) {
      requestAnimationFrame(frame);
      return;
    }
    const now = performance.now();
    if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS && !window.__pf_webgpu_camera_controller?.focusTween) {
      state.interacting = false;
    }
    let cameraMutated = false;
    if (!pointer.active) {
      if (Math.abs(state.inertiaRotY) > 1e-4 || Math.abs(state.inertiaRotX) > 1e-4) {
        state.rotY += state.inertiaRotY;
        state.rotX = sanitizePitch(state.rotX + state.inertiaRotX);
        state.inertiaRotY *= INERTIA_DECAY;
        state.inertiaRotX *= INERTIA_DECAY;
        if (Math.abs(state.inertiaRotY) < 1e-4) {
          state.inertiaRotY = 0;
        }
        if (Math.abs(state.inertiaRotX) < 1e-4) {
          state.inertiaRotX = 0;
        }
        primeOrbitFromAngles(state, state.rotX, state.rotY);
        cameraMutated = true;
      }
      if (Math.abs(state.inertiaPanX) > 1e-4 || Math.abs(state.inertiaPanY) > 1e-4) {
        state.panX += state.inertiaPanX;
        state.panY += state.inertiaPanY;
        state.inertiaPanX *= INERTIA_DECAY;
        state.inertiaPanY *= INERTIA_DECAY;
        if (Math.abs(state.inertiaPanX) < 1e-4) {
          state.inertiaPanX = 0;
        }
        if (Math.abs(state.inertiaPanY) < 1e-4) {
          state.inertiaPanY = 0;
        }
        cameraMutated = true;
      }
    }
    if (state.autoRotate && !state.interacting) {
      state.rotY += 0.01;
      primeOrbitFromAngles(state, state.rotX, state.rotY);
      state.cameraDirty = true;
    }
    if (cameraMutated) {
      state.cameraDirty = true;
      if (!state.autoRotate) {
        requestCameraEmitWhenStatic();
      }
    }
    if (pendingStaticCameraEmit && isCameraStatic()) {
      const prevRight = state.camRight ? [...state.camRight] : [1, 0, 0];
      const flipped = commitDisplayBasisToState(state);
      if (flipped) {
        try {
          const dot = vec3Dot2(prevRight, state.camRight);
          emitDiagnostic("camera:commit-basis-flip", { dot });
        } catch (err) {
        }
      }
      pendingStaticCameraEmit = false;
      emitCameraState(true);
    }
    updateAndDraw(current);
    emitCameraState();
    fpsFrames += 1;
    if (now - fpsStart > 600) {
      const fps = fpsFrames * 1e3 / (now - fpsStart);
      const nTheta = Number(current.nTheta) || 0;
      const nZ = Number(current.nZ) || 0;
      const innerSeg = Number(current.innerSegments) || nZ;
      const bottomRings = Number(current.bottom_rings) || Math.max(2, Math.floor(nZ * 0.25));
      const rimRings = Number(current.rim_rings) || 1;
      const cellsOuter = nTheta * nZ;
      const cellsInner = nTheta * innerSeg;
      const cellsBottomTop = nTheta * bottomRings;
      const cellsBottomUnder = cellsBottomTop;
      const cellsRim = nTheta * rimRings;
      const totalCells = cellsOuter + cellsInner + cellsBottomTop + cellsBottomUnder + cellsRim;
      setStatus(`WebGPU \u2022 ${(totalCells * 2).toLocaleString()} tris \u2022 ${fps.toFixed(0)} FPS`);
      fpsFrames = 0;
      fpsStart = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") {
      return;
    }
    if (data.type === "params" && data.payload) {
      let payload = data.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          console.warn("WebGPU params JSON parse", err);
        }
      }
      try {
        if (__wgpu_debug_el) {
          if (payload && typeof payload.debug === "boolean") {
            __wgpu_debug_el.style.display = payload.debug ? "block" : "none";
          }
        }
      } catch (err) {
      }
      try {
        const dataId = canvas.getAttribute("data-pf-wgpu-id") || "pf-wgpu-default";
        window.__pf_webgpu_mounts = window.__pf_webgpu_mounts || {};
        const dbg = window.__pf_webgpu_mounts[dataId]?.debug;
        if (dbg) {
          dbg._lastParamsMessage = payload;
          if (PREVIEW_DEBUG_ENABLED) MessageManager_default.debug("preview:params", "[WebGPU:MSG] params", payload);
        }
      } catch (err) {
      }
      if (typeof payload.autoRotate === "boolean") {
        state.autoRotate = payload.autoRotate;
        updateAutoButton();
        state.cameraDirty = true;
      }
      if (typeof payload.rotX === "number") {
        state.rotX = payload.rotX;
        state.cameraDirty = true;
      }
      if (typeof payload.rotY === "number") {
        state.rotY = payload.rotY;
        state.cameraDirty = true;
      }
      if (typeof payload.rotX === "number" || typeof payload.rotY === "number") {
        primeOrbitFromAngles(state, state.rotX, state.rotY);
      }
      if (typeof payload.zoom === "number") {
        state.zoom = payload.zoom;
        state.cameraDirty = true;
      }
      if (typeof payload.projection === "string") {
        const nextMode = payload.projection === "perspective" ? "perspective" : "ortho";
        if (state.projectionMode !== nextMode) {
          state.projectionMode = nextMode;
          updateProjectionButton();
          state.cameraDirty = true;
        }
      }
      if (typeof payload.sceneRadius === "number") {
        try {
          const prev = state.sceneRadius;
          const nextRadius = Math.max(
            Math.abs(clampNumber(payload.sceneRadius, state.sceneRadius)),
            1
          );
          if (Math.abs(nextRadius - state.sceneRadius) > CAMERA_EPSILON2) {
            state.sceneRadius = nextRadius;
            state.cameraDirty = true;
            try {
              const dataId = canvas.getAttribute("data-pf-wgpu-id") || "pf-wgpu-default";
              window.__pf_webgpu_mounts = window.__pf_webgpu_mounts || {};
              const dbg = window.__pf_webgpu_mounts[dataId]?.debug;
              if (dbg) {
                dbg.lastSceneRadiusUpdate = { prev, next: state.sceneRadius, timestamp: Date.now() };
                if (PREVIEW_DEBUG_ENABLED) MessageManager_default.debug("preview:sceneRadius-updated", "[WebGPU] sceneRadius updated", dbg.lastSceneRadiusUpdate);
              }
            } catch (err) {
            }
          }
        } catch (err) {
        }
      }
      if (typeof payload.interactiveLod === "number") {
        state.interactiveLodRatio = Math.min(
          Math.max(Number(payload.interactiveLod) || DEFAULT_INTERACTIVE_LOD2, MIN_INTERACTIVE_LOD2),
          1
        );
      }
      if (typeof payload.interactiveLodEnabled === "boolean") {
        state.interactiveLodEnabled = Boolean(payload.interactiveLodEnabled);
        if (!state.interactiveLodEnabled) {
          state.recentParamUpdate = false;
        }
        if (payload && typeof payload.hostCameraAcceptPolicy === "string") {
          try {
            const c = window.__pf_webgpu_camera_controller;
            if (c && typeof c.setHostCameraAcceptPolicy === "function") {
              const policy = payload.hostCameraAcceptPolicy;
              c.setHostCameraAcceptPolicy(policy);
            }
          } catch (err) {
          }
        }
        if (payload && typeof payload.hostCameraGraceMs === "number") {
          try {
            const c = window.__pf_webgpu_camera_controller;
            if (c && typeof c.setLocalCameraGraceMs === "function") {
              c.setLocalCameraGraceMs(Number(payload.hostCameraGraceMs));
            }
          } catch (err) {
          }
        }
      }
      if (typeof payload.paramUpdateNonce === "number" && payload.paramUpdate !== false) {
        state.lastParamNonce = payload.paramUpdateNonce;
        state.lastParamUpdate = performance.now();
        state.recentParamUpdate = state.interactiveLodEnabled;
      }
      updateAndDraw(payload);
      return;
    }
    if (data.type === "camera") {
      handleCameraCommand(data.payload);
    }
  });
  return true;
};
var bootWebGPU = async () => {
  const canvas = document.getElementById("wgpu-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    setStatus("WebGPU canvas not found");
    return;
  }
  try {
    if (!assertHostHelpersPresent()) {
      const msg = "WebGPU Preview boot failed: host CameraController.helpers is required. Ensure the host provides `window.__pf_webgpu_camera_controller.helpers` with math/picking functions.";
      try {
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.right = "0";
        overlay.style.background = "rgba(220,60,60,0.9)";
        overlay.style.color = "white";
        overlay.style.zIndex = "99999";
        overlay.style.padding = "8px";
        overlay.style.fontFamily = "monospace";
        overlay.textContent = msg;
        (canvas.parentElement ?? document.body).appendChild(overlay);
      } catch (err) {
      }
      console.error(msg);
      setStatus(msg);
      return;
    }
  } catch (err) {
  }
  const params = window.__pf_initialParams ?? {};
  const ok = await mount({ canvas, initialParams: params });
  if (ok) {
    try {
      const dataId = canvas.getAttribute("data-pf-wgpu-id") || "pf-wgpu-default";
      window.__pf_webgpu_mounts = window.__pf_webgpu_mounts || {};
      if (window.__pf_webgpu_mounts[dataId]?.debug) {
        window.__pf_webgpu_mounts[dataId].debug.ready = true;
      }
    } catch (err) {
    }
    markStatusReady();
  }
};
var assertHostHelpersPresent = () => {
  try {
    const c = window.__pf_webgpu_camera_controller;
    if (!c || !c.helpers) return false;
    return true;
  } catch (err) {
    return false;
  }
};
if (typeof window !== "undefined" && typeof document !== "undefined") {
  void bootWebGPU().catch((err) => {
    console.error("WebGPU boot failed", err);
    try {
      setStatus(`WebGPU \u2022 ${String(err)}`);
    } catch (e) {
    }
  });
} else {
}
export {
  assertHostHelpersPresent,
  bootWebGPU
};
