/**
 * Preview engine selector: classic tessellated mesh vs exact ray-cast (beta).
 * Persists to localStorage; the renderer reads the flag at mount, so a reload
 * is required (same UX as the pf-preferred-renderer setting).
 *
 * The ray-cast path only mounts in webgpu_core.ts, so on a WebGL-fallback
 * session the option is disabled with a note instead of silently no-oping
 * after reload. Gates on the ACTIVE renderer (ControllerContext), not the
 * pf-preferred-renderer preference — `auto` can resolve to WebGL. Fails open
 * while the renderer is still mounting (rendererType undefined): wrongly
 * disabling during startup would flicker; the hard-evidence case is 'webgl'.
 * A stored 'raycast' preference is never rewritten here — it survives the
 * user switching back to a WebGPU-capable renderer.
 */
import { useState } from 'react';
import {
  PREVIEW_MODE_STORAGE_KEY,
  resolvePreviewMode,
  type PreviewMode,
} from '../../renderers/webgpu/raycast/previewMode';
import { useControllerMaybe } from '../../context/ControllerContext';

export function PreviewModeSelect() {
  const [mode, setMode] = useState<PreviewMode>(() =>
    resolvePreviewMode('', (k) => {
      try { return localStorage.getItem(k); } catch { return null; }
    })
  );
  const [dirty, setDirty] = useState(false);
  const rendererType = useControllerMaybe()?.rendererType;
  const raycastUnavailable = rendererType === 'webgl';

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
        <option value="raycast" disabled={raycastUnavailable}>Exact ray-cast (beta, WebGPU)</option>
      </select>
      {raycastUnavailable && (
        <p className="app-settings-hint" role="note">
          Exact ray-cast requires WebGPU — this session is running the WebGL fallback
          {mode === 'raycast' ? ', so the standard mesh preview is used' : ''}.
        </p>
      )}
      {dirty && <p className="app-settings-hint" role="status">Reload the page to apply.</p>}
    </>
  );
}
