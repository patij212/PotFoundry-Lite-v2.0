/**
 * Preview engine selector: classic tessellated mesh vs exact ray-cast (beta).
 * Persists to localStorage; the renderer reads the flag at mount, so a reload
 * is required (same UX as the pf-preferred-renderer setting).
 */
import { useState } from 'react';
import {
  PREVIEW_MODE_STORAGE_KEY,
  resolvePreviewMode,
  type PreviewMode,
} from '../../renderers/webgpu/raycast/previewMode';

export function PreviewModeSelect() {
  const [mode, setMode] = useState<PreviewMode>(() =>
    resolvePreviewMode('', (k) => {
      try { return localStorage.getItem(k); } catch { return null; }
    })
  );
  const [dirty, setDirty] = useState(false);

  const onChange = (value: PreviewMode) => {
    setMode(value);
    setDirty(true);
    try { localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, value); } catch { /* storage unavailable */ }
  };

  return (
    <>
      <label htmlFor="pf-preview-engine" className="app-settings-hint">Preview engine</label>
      <select
        id="pf-preview-engine"
        className="app-settings-select"
        value={mode}
        onChange={(e) => onChange(e.target.value as PreviewMode)}
      >
        <option value="mesh">Standard (mesh)</option>
        <option value="raycast">Exact ray-cast (beta, WebGPU)</option>
      </select>
      {dirty && <p className="app-settings-hint" role="status">Reload the page to apply.</p>}
    </>
  );
}
