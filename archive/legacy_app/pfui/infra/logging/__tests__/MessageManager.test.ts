/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { MessageManager } from '../MessageManager';
import type { LogLevel, MessageManagerConfig } from '../types';

type OverrideConfig = Partial<Omit<MessageManagerConfig, 'consoleSink'>> & {
  consoleSink?: (line: string, level: LogLevel) => void;
};

const managed: MessageManager[] = [];

function buildManager(overrides: OverrideConfig = {}) {
  const sink = overrides.consoleSink ?? vi.fn();
  const manager = new MessageManager({ ...overrides, consoleSink: sink });
  managed.push(manager);
  return { manager, sink };
}

afterEach(() => {
  while (managed.length) {
    const mgr = managed.pop();
    mgr?.dispose();
  }
});

describe('MessageManager', () => {
  it('aggregates info/debug entries into a heartbeat with optional reason context', () => {
    const { manager, sink } = buildManager({ heartbeatMs: 60000 });
    manager.info('TEST_INFO', 'info message');
    manager.debug('TEST_DEBUG', 'debug message');

    const stats = manager.flushHeartbeat({ force: true, reason: 'unit-test' });

    expect(stats).not.toBeNull();
    expect(stats?.counts.INFO).toBe(1);
    expect(stats?.counts.DEBUG).toBe(1);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(expect.stringContaining('reason: unit-test'), 'INFO');
  });

  it('dedupes repeated errors but emits every Nth occurrence', () => {
    const { manager, sink } = buildManager({ heartbeatMs: 60000, dedupeEveryN: 3 });

    manager.error('ERR_LOOP', 'boom', undefined, 'sig');
    manager.error('ERR_LOOP', 'boom', undefined, 'sig');
    manager.error('ERR_LOOP', 'boom', undefined, 'sig');

    expect(sink).toHaveBeenCalledTimes(2); // first + third (due to dedupeEveryN)

    const stats = manager.flushHeartbeat({ force: true });
    expect(stats?.suppressedDuplicates).toBe(1);
  });

  it('reports per-window frame/draw/vert deltas and resets accumulators after flush', () => {
    const { manager } = buildManager({ heartbeatMs: 60000 });

    manager.setFrameCounters({ frames: 5, draws: 2, verts: 120 });
    manager.setFrameCounters({ frames: 9, draws: 3, verts: 180 });

    const first = manager.flushHeartbeat({ force: true });
    expect(first).not.toBeNull();
    if (!first) throw new Error('stats missing');
    expect(first.frames).toBe(9); // 0->5 adds 5, then 9 adds 4 → 9 total this window
    expect(first.draws).toBe(3);  // 0->2 adds 2, then 3 adds 1 → 3 draws
    expect(first.verts).toBe(180); // 0->120 adds 120, then 180 adds 60 → 180 verts

    manager.setFrameCounters({ frames: 11, draws: 5, verts: 220 });
    const second = manager.flushHeartbeat({ force: true });
    expect(second).not.toBeNull();
    if (!second) throw new Error('stats missing');
    expect(second.frames).toBe(2);
    expect(second.draws).toBe(2);
    expect(second.verts).toBe(40);
  });

  it('suppresses heartbeat output entirely in errors-only mode even when forced', () => {
    const { manager, sink } = buildManager({ mode: 'errors-only' });
    manager.info('INFO', 'hello world');

    const stats = manager.flushHeartbeat({ force: true });
    expect(stats).toBeNull();
    expect(sink).not.toHaveBeenCalled();
  });
});
