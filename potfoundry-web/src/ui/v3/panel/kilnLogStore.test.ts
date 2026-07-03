import { describe, it, expect, beforeEach } from 'vitest';
import { recordFiring, getKilnLog } from './kilnLogStore';
import type { KilnEntry } from './kilnLogStore';

function makeEntry(n: number): KilnEntry {
  return {
    filename: `pot-${n}`,
    sizeLabel: `${n}.0 MB`,
    triangles: n * 1000,
    fidelity: 'high',
    firedAt: 1_700_000_000_000 + n,
    ok: true,
  };
}

describe('kilnLogStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns [] on empty storage', () => {
    expect(getKilnLog()).toEqual([]);
  });

  it('prepends entries — most recent first', () => {
    recordFiring(makeEntry(1));
    recordFiring(makeEntry(2));
    const log = getKilnLog();
    expect(log[0].filename).toBe('pot-2');
    expect(log[1].filename).toBe('pot-1');
  });

  it('caps at 10 entries', () => {
    for (let i = 0; i < 12; i++) recordFiring(makeEntry(i));
    expect(getKilnLog()).toHaveLength(10);
    // First entry added (i=0) should have been evicted
    expect(getKilnLog().some((e) => e.filename === 'pot-0')).toBe(false);
  });

  it('returns [] on corrupted JSON', () => {
    localStorage.setItem('pf3-kiln-log', 'not-json{{{');
    expect(getKilnLog()).toEqual([]);
  });

  it('returns [] when stored value is not an array', () => {
    localStorage.setItem('pf3-kiln-log', '{"key":"value"}');
    expect(getKilnLog()).toEqual([]);
  });

  it('recordFiring returns the new log', () => {
    const result = recordFiring(makeEntry(1));
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('pot-1');
  });

  it('ok field reflects validationSummary?.valid !== false semantics', () => {
    const okEntry = makeEntry(1);
    const failEntry = { ...makeEntry(2), ok: false };
    recordFiring(okEntry);
    recordFiring(failEntry);
    const [top, second] = getKilnLog();
    expect(top.ok).toBe(false);   // failEntry was recorded last (prepend)
    expect(second.ok).toBe(true);
  });

  it('recordFiring dispatches pf3:kiln-updated on window', () => {
    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener('pf3:kiln-updated', handler);

    recordFiring(makeEntry(1));

    window.removeEventListener('pf3:kiln-updated', handler);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pf3:kiln-updated');
  });
});
