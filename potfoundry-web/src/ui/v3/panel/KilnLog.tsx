import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../../state';
import { getKilnLog } from './kilnLogStore';
import type { KilnEntry } from './kilnLogStore';
import type { QualityPreset } from '../../../state/slices/mesh';

/**
 * Returns a human-readable relative time string for a `firedAt` timestamp.
 * Uses an injectable `now` for deterministic testing.
 */
function relativeTime(firedAt: number, now: number): string {
  const diffMs = now - firedAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${Math.max(diffMin, 1)} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

interface KilnLogProps {
  /** Injectable current timestamp for deterministic relative-time rendering. Defaults to `Date.now()`. */
  now?: number;
}

export const KilnLog: React.FC<KilnLogProps> = ({ now = Date.now() }) => {
  const [entries, setEntries] = useState<KilnEntry[]>(() => getKilnLog());
  const setExportFilename = useAppStore((s) => s.setExportFilename);
  const setQualityPreset = useAppStore((s) => s.setQualityPreset);

  // Refresh the list whenever a new firing is recorded (F3: live log refresh).
  useEffect(() => {
    const handler = () => setEntries(getKilnLog());
    window.addEventListener('pf3:kiln-updated', handler);
    return () => window.removeEventListener('pf3:kiln-updated', handler);
  }, []);

  const refire = (entry: KilnEntry) => {
    setExportFilename(entry.filename);
    if (entry.fidelity !== 'custom') {
      setQualityPreset(entry.fidelity as QualityPreset);
    }
    window.dispatchEvent(new CustomEvent('pf3:download'));
  };

  return (
    <div className="pf3-kiln-log">
      <div className="pf3-section-voice">Kiln log</div>
      {entries.length === 0 ? (
        <p className="pf3-kiln-log__empty">
          Nothing fired yet — your exports will appear here.
        </p>
      ) : (
        <ul className="pf3-kiln-log__list">
          {entries.map((entry) => (
            <li
              key={`${entry.firedAt}-${entry.filename}`}
              className={`pf3-kiln-log__row pf3-kiln-log__row--${entry.ok ? 'ok' : 'fail'}`}
            >
              <span className="pf3-mono pf3-kiln-log__label">
                {entry.filename}.stl · {entry.sizeLabel} · {relativeTime(entry.firedAt, now)}
              </span>
              <button
                type="button"
                className="pf3-btn pf3-btn--tertiary"
                aria-label={`Export ${entry.filename} again`}
                onClick={() => refire(entry)}
              >
                Export again
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
