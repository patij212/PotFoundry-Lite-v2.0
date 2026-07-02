export function deriveDefaultFilename(styleName: string, H: number): string {
  const kebab = styleName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
  return `${kebab}-${Math.round(H)}`;
}

export function estimateExport(nTheta: number, nZ: number): { tris: number; bytes: number } {
  const tris = nTheta * nZ * 2;
  return { tris, bytes: 84 + tris * 50 };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
