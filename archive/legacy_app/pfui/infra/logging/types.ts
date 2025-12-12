export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

export interface LogMessage {
  level: LogLevel;
  code: string;
  message: string;
  ts: number;
  context?: Record<string, unknown>;
  signature?: string;
}

export interface MessageManagerConfig {
  heartbeatMs?: number;
  bufferSize?: number;
  mode?: "smart" | "verbose" | "errors-only";
  dedupeEveryN?: number;
  consoleSink?: (line: string, level: LogLevel) => void;
}

export interface HeartbeatStats {
  windowMs: number;
  counts: Record<LogLevel, number>;
  frames?: number;
  draws?: number;
  verts?: number;
  suppressedDuplicates?: number;
}