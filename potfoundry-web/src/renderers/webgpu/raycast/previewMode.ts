/**
 * Preview render-engine selection: classic tessellated mesh vs exact ray-cast.
 * Priority: URL `?preview=` param > localStorage > default 'mesh'.
 * Spec: docs/superpowers/specs/2026-07-08-raycast-preview-design.md §5
 */
export type PreviewMode = 'mesh' | 'raycast';

export const PREVIEW_MODE_STORAGE_KEY = 'pf-preview-mode';

function normalize(value: string | null): PreviewMode | null {
  if (value === 'raycast' || value === 'mesh') return value;
  return null;
}

export function resolvePreviewMode(
  search: string,
  getItem: (key: string) => string | null
): PreviewMode {
  const fromUrl = normalize(new URLSearchParams(search).get('preview'));
  if (fromUrl) return fromUrl;
  try {
    const stored = normalize(getItem(PREVIEW_MODE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // storage unavailable (private mode / sandbox) — use default
  }
  return 'mesh';
}
